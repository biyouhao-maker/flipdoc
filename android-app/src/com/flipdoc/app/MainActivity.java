package com.flipdoc.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    private static final String DEFAULT_SERVER_URL =
            "https://flipdoc-production.up.railway.app";
    private static final String PREFS_NAME = "flipdoc_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final int FILE_CHOOSER_REQ = 1001;
    private static final int CHAT_SAVED_PICKER_REQ = 1002;
    private static final long MAX_IMPORT_BYTES = 58L * 1024L * 1024L;

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private long lastBackPressMs = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F7F5F0"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F7F5F0"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
        );
        progressBar.setLayoutParams(pbParams);
        progressBar.setVisibility(View.GONE);

        root.addView(webView);
        root.addView(progressBar);
        setContentView(root);

        configureWebView();

        if (!handleIncomingShareIntent(getIntent())) {
            webView.loadUrl(getServerUrl());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingShareIntent(intent);
    }

    private String getServerUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_SERVER_URL, "");
        if (saved != null && !saved.trim().isEmpty()) {
            return saved.trim();
        }
        return DEFAULT_SERVER_URL;
    }

    private void saveServerUrl(String url) {
        String clean = url == null ? "" : url.trim();
        while (clean.endsWith("/")) {
            clean = clean.substring(0, clean.length() - 1);
        }
        if (!clean.isEmpty() && !clean.startsWith("http://") && !clean.startsWith("https://")) {
            clean = "https://" + clean;
        }
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SERVER_URL, clean)
                .apply();
    }

    /**
     * Intercepts files or text opened/shared from WeChat, QQ, TIM, WeCom, or File Manager
     * via "用其他应用打开" (ACTION_VIEW) or "发送给其他应用" (ACTION_SEND / ACTION_SEND_MULTIPLE).
     */
    private boolean handleIncomingShareIntent(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (action == null) return false;

        List<Uri> uris = new ArrayList<>();
        String sharedPlainText = null;

        if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null) {
                String scheme = data.getScheme();
                if ("content".equalsIgnoreCase(scheme) || "file".equalsIgnoreCase(scheme)) {
                    uris.add(data);
                }
            }
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) {
                uris.add(stream);
            } else if (intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
                Uri clipUri = intent.getClipData().getItemAt(0).getUri();
                if (clipUri != null) uris.add(clipUri);
            } else {
                CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (text != null && text.length() > 0) {
                    sharedPlainText = text.toString();
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) {
                for (Uri u : list) {
                    if (u != null) uris.add(u);
                }
            }
        }

        if (uris.isEmpty() && (sharedPlainText == null || sharedPlainText.trim().isEmpty())) {
            return false;
        }

        // Prevent duplicate processing on activity configuration changes
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);

        if (!uris.isEmpty()) {
            uploadUrisToFlipDoc(uris, null);
        } else {
            uploadRawTextToFlipDoc(sharedPlainText);
        }
        return true;
    }

    private static class UploadPart {
        final String filename;
        final String mimeType;
        final byte[] bytes;

        UploadPart(String filename, String mimeType, byte[] bytes) {
            this.filename = filename;
            this.mimeType = mimeType;
            this.bytes = bytes;
        }
    }

    private byte[] readUriBytes(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("无法读取文件内容");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_IMPORT_BYTES) {
                    throw new Exception("文件超过 58MB 大小上限");
                }
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    private String queryDisplayName(Uri uri) {
        if ("content".equalsIgnoreCase(uri.getScheme())) {
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) {
                        String name = cursor.getString(idx);
                        if (name != null && !name.trim().isEmpty()) {
                            return name.trim();
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        String last = uri.getLastPathSegment();
        return (last != null && !last.trim().isEmpty()) ? last.trim() : "微信导入文档";
    }

    private boolean hasSupportedExtension(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".pdf")
                || lower.endsWith(".docx")
                || lower.endsWith(".doc")
                || lower.endsWith(".pptx")
                || lower.endsWith(".ppt")
                || lower.endsWith(".md")
                || lower.endsWith(".markdown")
                || lower.endsWith(".txt")
                || lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".webp")
                || lower.endsWith(".gif");
    }

    private String sniffExtension(Uri uri, byte[] data) {
        if (data != null && data.length >= 8) {
            // %PDF-
            if (data[0] == 0x25 && data[1] == 0x50 && data[2] == 0x44 && data[3] == 0x46) {
                return ".pdf";
            }
            // PNG
            if ((data[0] & 0xFF) == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47) {
                return ".png";
            }
            // JPEG
            if ((data[0] & 0xFF) == 0xFF && (data[1] & 0xFF) == 0xD8) {
                return ".jpg";
            }
            // GIF
            if (data[0] == 'G' && data[1] == 'I' && data[2] == 'F') {
                return ".gif";
            }
            // WEBP (RIFF....WEBP)
            if (data.length >= 12 && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
                    && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P') {
                return ".webp";
            }
            // OOXML ZIP (PK\x03\x04) -> inspect word/ vs ppt/
            if (data[0] == 0x50 && data[1] == 0x4B && data[2] == 0x03 && data[3] == 0x04) {
                try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(data))) {
                    ZipEntry entry;
                    while ((entry = zis.getNextEntry()) != null) {
                        String en = entry.getName();
                        if (en.startsWith("word/")) return ".docx";
                        if (en.startsWith("ppt/")) return ".pptx";
                    }
                } catch (Exception ignored) {
                }
            }
        }

        String mime = getContentResolver().getType(uri);
        if (mime != null) {
            mime = mime.toLowerCase(Locale.ROOT);
            if (mime.contains("pdf")) return ".pdf";
            if (mime.contains("wordprocessingml")) return ".docx";
            if (mime.contains("msword")) return ".doc";
            if (mime.contains("presentationml")) return ".pptx";
            if (mime.contains("powerpoint")) return ".ppt";
            if (mime.contains("markdown")) return ".md";
            if (mime.contains("png")) return ".png";
            if (mime.contains("jpeg") || mime.contains("jpg")) return ".jpg";
            if (mime.contains("webp")) return ".webp";
            if (mime.contains("gif")) return ".gif";
        }
        return ".md";
    }

    private void uploadRawTextToFlipDoc(String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        List<UploadPart> parts = new ArrayList<>();
        parts.add(new UploadPart("聊天文字记录.md", "text/markdown", bytes));
        performMultipartUpload(parts);
    }

    private void uploadUrisToFlipDoc(List<Uri> uris, String fallbackTitle) {
        ProgressDialog dialog = new ProgressDialog(this);
        dialog.setMessage("正在导入聊天文件并转成翻页电子书…");
        dialog.setCancelable(false);
        dialog.show();

        new Thread(() -> {
            try {
                List<UploadPart> parts = new ArrayList<>();
                for (Uri uri : uris) {
                    byte[] bytes = readUriBytes(uri);
                    String name = queryDisplayName(uri);
                    if (!hasSupportedExtension(name)) {
                        name = name + sniffExtension(uri, bytes);
                    }
                    String mime = getContentResolver().getType(uri);
                    if (mime == null || mime.isEmpty()) {
                        mime = "application/octet-stream";
                    }
                    parts.add(new UploadPart(name, mime, bytes));
                }

                String slug = sendMultipartToServer(parts, fallbackTitle);
                runOnUiThread(() -> {
                    if (dialog.isShowing()) dialog.dismiss();
                    Toast.makeText(
                            MainActivity.this,
                            "导入成功！已生成翻页电子书",
                            Toast.LENGTH_SHORT
                    ).show();
                    webView.loadUrl(getServerUrl() + "/v/" + slug);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (dialog.isShowing()) dialog.dismiss();
                    Toast.makeText(
                            MainActivity.this,
                            "导入失败：" + e.getMessage(),
                            Toast.LENGTH_LONG
                    ).show();
                    if (webView.getUrl() == null) {
                        webView.loadUrl(getServerUrl());
                    }
                });
            }
        }).start();
    }

    private void performMultipartUpload(List<UploadPart> parts) {
        ProgressDialog dialog = new ProgressDialog(this);
        dialog.setMessage("正在排版生成翻页电子书…");
        dialog.setCancelable(false);
        dialog.show();

        new Thread(() -> {
            try {
                String slug = sendMultipartToServer(parts, null);
                runOnUiThread(() -> {
                    if (dialog.isShowing()) dialog.dismiss();
                    Toast.makeText(MainActivity.this, "已生成翻页电子书", Toast.LENGTH_SHORT).show();
                    webView.loadUrl(getServerUrl() + "/v/" + slug);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (dialog.isShowing()) dialog.dismiss();
                    Toast.makeText(MainActivity.this, "生成失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                    if (webView.getUrl() == null) {
                        webView.loadUrl(getServerUrl());
                    }
                });
            }
        }).start();
    }

    private String sendMultipartToServer(List<UploadPart> parts, String title) throws Exception {
        String boundary = "----FlipDocBoundary" + System.currentTimeMillis();
        URL url = new URL(getServerUrl() + "/api/docs");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(65000);
        conn.setDoOutput(true);
        conn.setDoInput(true);
        conn.setUseCaches(false);
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

        String cookies = CookieManager.getInstance().getCookie(getServerUrl());
        if (cookies != null && !cookies.isEmpty()) {
            conn.setRequestProperty("Cookie", cookies);
        }

        try (DataOutputStream out = new DataOutputStream(conn.getOutputStream())) {
            writeFormField(out, boundary, "docxMode", "reflow");
            writeFormField(out, boundary, "theme", "warm-paper");
            writeFormField(out, boundary, "defaultViewMode", "auto");
            if (title != null && !title.trim().isEmpty()) {
                writeFormField(out, boundary, "title", title.trim());
            }

            for (UploadPart part : parts) {
                out.writeBytes("--" + boundary + "\r\n");
                String safeName = part.filename.replace("\"", "_");
                String header = "Content-Disposition: form-data; name=\"files\"; filename=\""
                        + safeName + "\"\r\nContent-Type: " + part.mimeType + "\r\n\r\n";
                out.write(header.getBytes(StandardCharsets.UTF_8));
                out.write(part.bytes);
                out.writeBytes("\r\n");
            }
            out.writeBytes("--" + boundary + "--\r\n");
            out.flush();
        }

        int status = conn.getResponseCode();
        InputStream respStream = (status >= 200 && status < 300)
                ? conn.getInputStream()
                : conn.getErrorStream();

        String respBody = "";
        if (respStream != null) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = respStream.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            respBody = bos.toString("UTF-8");
        }

        JSONObject json = new JSONObject(respBody.isEmpty() ? "{}" : respBody);
        if (status < 200 || status >= 300) {
            throw new Exception(json.optString("error", "服务器返回状态码 " + status));
        }

        JSONObject doc = json.getJSONObject("doc");
        return doc.getString("slug");
    }

    private void writeFormField(DataOutputStream out, String boundary, String name, String value) throws Exception {
        out.writeBytes("--" + boundary + "\r\n");
        out.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
        out.write(value.getBytes(StandardCharsets.UTF_8));
        out.writeBytes("\r\n");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " FlipDocAndroid/1.1");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidBridge(), "FlipDocAndroid");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                } else {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    String[] mimeTypes = new String[]{
                            "application/pdf",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "application/msword",
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                            "application/vnd.ms-powerpoint",
                            "text/markdown",
                            "text/plain",
                            "image/*"
                    };
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
                    startActivityForResult(
                            Intent.createChooser(intent, "选择要导入翻页的文件"),
                            FILE_CHOOSER_REQ
                    );
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    Uri serverUri = Uri.parse(getServerUrl());
                    if (serverUri.getHost() != null && serverUri.getHost().equalsIgnoreCase(uri.getHost())) {
                        return false;
                    }
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        return true;
                    } catch (Exception ignored) {
                        return false;
                    }
                }
                return false;
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request != null && request.isForMainFrame()) {
                    showOfflineRecoveryPage(getServerUrl());
                }
            }
        });
    }

    private void showOfflineRecoveryPage(String currentUrl) {
        String safeUrl = currentUrl
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");

        String html = "<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'/>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'/>"
                + "<style>"
                + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#F7F5F0;color:#1A1816;font-family:sans-serif;padding:24px;box-sizing:border-box;}"
                + ".card{background:#fff;border:1px solid #E6DFD2;border-radius:24px;padding:28px 24px;"
                + "max-width:360px;width:100%;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.06);}"
                + ".badge{display:inline-block;background:#C85A32;color:#fff;font-size:12px;font-weight:700;"
                + "padding:5px 12px;border-radius:999px;margin-bottom:14px;}"
                + "h2{margin:0 0 8px;font-size:19px;}p{margin:0 0 18px;font-size:13px;line-height:1.65;color:#6C655B;word-break:break-all;}"
                + "button{width:100%;border:none;border-radius:14px;padding:13px;font-size:14px;font-weight:600;margin-top:10px;}"
                + ".primary{background:#1A1816;color:#fff;}.secondary{background:#F2EEE6;color:#1A1816;}"
                + "</style></head><body><div class='card'>"
                + "<div class='badge'>FlipDoc 轻翻</div>"
                + "<h2>暂时连不上服务器</h2>"
                + "<p>当前地址：<br/>" + safeUrl + "<br/><br/>请检查手机网络，或点击下方切换服务器地址。</p>"
                + "<button class='primary' onclick='window.location.replace(\"" + safeUrl + "\")'>重新连接</button>"
                + "<button class='secondary' onclick='window.FlipDocAndroid && window.FlipDocAndroid.openServerSettings()'>更换服务器地址</button>"
                + "</div></body></html>";

        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private void showServerSettingsDialog() {
        runOnUiThread(() -> {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            int pad = (int) (20 * getResources().getDisplayMetrics().density);
            box.setPadding(pad, pad / 2, pad, 0);

            EditText input = new EditText(this);
            input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
            input.setHint("https://你的 FlipDoc 地址");
            input.setText(getServerUrl());
            input.setSingleLine(true);
            box.addView(input);

            new AlertDialog.Builder(this)
                    .setTitle("切换 FlipDoc 服务器地址")
                    .setMessage("默认已连接永久云端服务，如需自定义地址可在下方修改：")
                    .setView(box)
                    .setPositiveButton("保存并连接", (d, w) -> {
                        String next = input.getText().toString().trim();
                        if (!next.isEmpty()) {
                            saveServerUrl(next);
                            webView.loadUrl(getServerUrl());
                        }
                    })
                    .setNeutralButton("恢复默认", (d, w) -> {
                        saveServerUrl("");
                        webView.loadUrl(getServerUrl());
                    })
                    .setNegativeButton("取消", null)
                    .show();
        });
    }

    private void launchSavedChatFilesPicker() {
        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Uri weixinDir = Uri.parse(
                            "content://com.android.externalstorage.documents/document/primary%3ADownload%2FWeiXin"
                    );
                    intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, weixinDir);
                }
                startActivityForResult(intent, CHAT_SAVED_PICKER_REQ);
            } catch (Exception e) {
                Toast.makeText(this, "无法打开下载目录", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQ) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                List<Uri> uris = extractUrisFromResult(data);
                if (!uris.isEmpty()) {
                    results = uris.toArray(new Uri[0]);
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else if (requestCode == CHAT_SAVED_PICKER_REQ) {
            if (resultCode == RESULT_OK && data != null) {
                List<Uri> uris = extractUrisFromResult(data);
                if (!uris.isEmpty()) {
                    uploadUrisToFlipDoc(uris, null);
                }
            }
        }
    }

    private List<Uri> extractUrisFromResult(Intent data) {
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPressMs < 2000) {
            super.onBackPressed();
        } else {
            lastBackPressMs = now;
            Toast.makeText(this, "再按一次退出 FlipDoc 轻翻", Toast.LENGTH_SHORT).show();
        }
    }

    private byte[] decodeDataUrlBytes(String dataUrlOrBase64) {
        String payload = dataUrlOrBase64;
        int comma = payload.indexOf(',');
        if (comma >= 0) {
            payload = payload.substring(comma + 1);
        }
        return Base64.decode(payload, Base64.DEFAULT);
    }

    private String sanitizeFilename(String filename) {
        String clean = (filename == null || filename.trim().isEmpty())
                ? "flipdoc-" + System.currentTimeMillis() + ".png"
                : filename.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!clean.toLowerCase(Locale.ROOT).endsWith(".png")
                && !clean.toLowerCase(Locale.ROOT).endsWith(".jpg")) {
            clean = clean + ".png";
        }
        return clean;
    }

    private class AndroidBridge {
        @JavascriptInterface
        public boolean saveImageBase64(String dataUrlOrBase64, String filename) {
            try {
                byte[] bytes = decodeDataUrlBytes(dataUrlOrBase64);
                String safeName = sanitizeFilename(filename);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/FlipDoc");
                    ContentResolver resolver = getContentResolver();
                    Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) return false;
                        out.write(bytes);
                    }
                } else {
                    File pictures = new File(
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                            "FlipDoc"
                    );
                    if (!pictures.exists()) pictures.mkdirs();
                    File outFile = new File(pictures, safeName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                    }
                    sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(outFile)));
                }

                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "已保存到手机相册 (Pictures/FlipDoc)",
                        Toast.LENGTH_LONG
                ).show());
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "保存图片失败：" + e.getMessage(),
                        Toast.LENGTH_SHORT
                ).show());
                return false;
            }
        }

        @JavascriptInterface
        public boolean shareImageBase64(String dataUrlOrBase64, String filename, String title) {
            try {
                byte[] bytes = decodeDataUrlBytes(dataUrlOrBase64);
                String safeName = sanitizeFilename(filename);
                File shareDir = new File(getCacheDir(), "share");
                if (!shareDir.exists()) shareDir.mkdirs();
                File outFile = new File(shareDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(bytes);
                }

                Uri contentUri = Uri.parse("content://" + ShareFileProvider.AUTHORITY + "/" + safeName);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("image/png");
                share.putExtra(Intent.EXTRA_STREAM, contentUri);
                if (title != null && !title.isEmpty()) {
                    share.putExtra(Intent.EXTRA_TEXT, title + " · FlipDoc 轻翻");
                }
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                runOnUiThread(() -> startActivity(Intent.createChooser(share, "分享海报到微信")));
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "调起系统分享失败",
                        Toast.LENGTH_SHORT
                ).show());
                return false;
            }
        }

        @JavascriptInterface
        public boolean shareLink(String url, String title, String text) {
            try {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_SUBJECT, title != null ? title : "FlipDoc 轻翻画册");
                share.putExtra(Intent.EXTRA_TEXT, text != null ? text : url);
                runOnUiThread(() -> startActivity(Intent.createChooser(share, "分享翻页链接到微信")));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean openChatApp(String pkg) {
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
                if (launch == null && "com.tencent.mobileqq".equals(pkg)) {
                    launch = getPackageManager().getLaunchIntentForPackage("com.tencent.tim");
                }
                if (launch == null) return false;
                Intent finalLaunch = launch;
                runOnUiThread(() -> {
                    Toast.makeText(
                            MainActivity.this,
                            "点开聊天文件 → 右上角 ··· → 用其他应用打开 → 选 FlipDoc 轻翻",
                            Toast.LENGTH_LONG
                    ).show();
                    startActivity(finalLaunch);
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void pickChatSavedFiles() {
            launchSavedChatFilesPicker();
        }

        @JavascriptInterface
        public void openServerSettings() {
            showServerSettingsDialog();
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.1.0";
        }
    }
}
