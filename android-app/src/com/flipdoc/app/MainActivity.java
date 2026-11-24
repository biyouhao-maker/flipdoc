package com.flipdoc.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String DEFAULT_SERVER_URL =
            "https://flipdoc-production.up.railway.app";
    private static final String PREFS_NAME = "flipdoc_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final int FILE_CHOOSER_REQ = 1001;

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
        webView.loadUrl(getServerUrl());
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
        s.setUserAgentString(s.getUserAgentString() + " FlipDocAndroid/1.0");

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
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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
                + "<p>当前地址：<br/>" + safeUrl + "<br/><br/>如果是临时免费隧道地址已更新，或已迁移到云端服务器，请点击下方更换地址。</p>"
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
                    .setMessage("支持免费 Cloudflare 隧道、Railway 云端地址或同 Wi-Fi 局域网地址：")
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

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQ) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    List<Uri> uris = new ArrayList<>();
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri u = clip.getItemAt(i).getUri();
                        if (u != null) uris.add(u);
                    }
                    results = uris.toArray(new Uri[0]);
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
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
        if (!clean.toLowerCase().endsWith(".png") && !clean.toLowerCase().endsWith(".jpg")) {
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
        public void openServerSettings() {
            showServerSettingsDialog();
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0.0";
        }
    }
}
