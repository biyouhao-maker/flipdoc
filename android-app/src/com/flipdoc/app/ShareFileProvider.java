package com.flipdoc.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class ShareFileProvider extends ContentProvider {
    public static final String AUTHORITY = "com.flipdoc.app.shareprovider";

    @Override
    public boolean onCreate() {
        return true;
    }

    private File resolveShareFile(Uri uri) throws FileNotFoundException {
        if (getContext() == null) throw new FileNotFoundException("No context");
        String fileName = uri.getLastPathSegment();
        if (fileName == null || fileName.isEmpty() || fileName.contains("/") || fileName.contains("..")) {
            throw new FileNotFoundException("Invalid share file name");
        }
        File shareDir = new File(getContext().getCacheDir(), "share");
        File target = new File(shareDir, fileName);
        if (!target.exists() || !target.isFile()) {
            throw new FileNotFoundException("File not found: " + fileName);
        }
        return target;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = resolveShareFile(uri);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name != null && (name.endsWith(".jpg") || name.endsWith(".jpeg"))) {
            return "image/jpeg";
        }
        if (name != null && name.endsWith(".webp")) {
            return "image/webp";
        }
        return "image/png";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File file = resolveShareFile(uri);
            String[] cols = (projection != null && projection.length > 0)
                    ? projection
                    : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
            MatrixCursor cursor = new MatrixCursor(cols, 1);
            Object[] row = new Object[cols.length];
            for (int i = 0; i < cols.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) {
                    row[i] = file.getName();
                } else if (OpenableColumns.SIZE.equals(cols[i])) {
                    row[i] = file.length();
                }
            }
            cursor.addRow(row);
            return cursor;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
