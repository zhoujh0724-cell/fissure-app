package com.fissure.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private static final int CAMERA_PERMISSION_CODE = 100;

    // File chooser support
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<Uri> cameraLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        // Register file chooser result handler (API 30+)
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    // User picked from gallery
                    Uri dataUri = result.getData().getData();
                    results = new Uri[]{dataUri};
                } else if (cameraImageUri != null) {
                    // User took a photo
                    results = new Uri[]{cameraImageUri};
                    // Notify media scanner
                    Intent mediaScan = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
                    mediaScan.setData(cameraImageUri);
                    sendBroadcast(mediaScan);
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
                cameraImageUri = null;
            }
        );

        // Camera launcher
        cameraLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            result -> {
                if (filePathCallback == null) return;
                if (result && cameraImageUri != null) {
                    filePathCallback.onReceiveValue(new Uri[]{cameraImageUri});
                } else {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = null;
                cameraImageUri = null;
            }
        );

        configureWebView();

        webView.loadUrl("file:///android_asset/index.html");

        // Request camera permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Cache for offline use
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                String[] resources = request.getResources();
                for (String r : resources) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) ||
                        PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                        request.grant(new String[]{r});
                        return;
                    }
                }
            }

            // CRITICAL FIX: Handle <input type="file"> clicks
            @Override
            public boolean onShowFileChooser(WebView webView,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {

                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                // Check if camera capture is requested
                boolean acceptImage = false;
                boolean capture = false;
                String[] acceptTypes = params.getAcceptTypes();
                if (acceptTypes != null) {
                    for (String type : acceptTypes) {
                        if (type.contains("image")) acceptImage = true;
                    }
                }
                capture = params.isCaptureEnabled();

                if (acceptImage && capture) {
                    // Try to open camera directly
                    try {
                        cameraImageUri = createImageFile();
                        if (cameraImageUri != null) {
                            cameraLauncher.launch(cameraImageUri);
                            return true;
                        }
                    } catch (IOException e) {
                        // Fall through to file chooser
                    }
                }

                // Open file chooser (gallery + camera option)
                Intent intent;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                    intent = params.createIntent();
                } else {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                }
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");

                // Add camera capture as extra option
                try {
                    cameraImageUri = createImageFile();
                    if (cameraImageUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                } catch (IOException e) {
                    cameraImageUri = null;
                }

                try {
                    fileChooserLauncher.launch(Intent.createChooser(intent, "选择照片"));
                } catch (Exception e) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                    cameraImageUri = null;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
    }

    private Uri createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String imageFileName = "FISSURE_" + timeStamp;
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (storageDir == null) {
            storageDir = getCacheDir();
        }
        File image = File.createTempFile(imageFileName, ".jpg", storageDir);
        return FileProvider.getUriForFile(this,
                getApplicationContext().getPackageName() + ".fileprovider", image);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }
}
