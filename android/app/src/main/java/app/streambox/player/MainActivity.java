package app.streambox.player;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * StreamBox for Android: the StreamBox website, full screen, in a WebView. Everything the app does comes from the
 * website, so it updates itself whenever the site is deployed; this APK only needs a new version when this file changes.
 *
 * What the wrapper adds over a browser tab:
 * - Android TV: appears in the TV launcher (banner), and the page is told it is on a TV ("Android TV" in the user
 *   agent), so js/tv.js switches on the remote-control layout. D-pad and media keys go to the page.
 * - Back closes the player / window on top, then goes back a page, then leaves the app (via StreamBoxTV.back()).
 * - Full-screen video, file picking (backup import), downloads and links to other sites / apps (VLC, Spotify)
 *   open in the right place; pop-ups without a tap are blocked.
 * - The screen stays on while something is playing.
 */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;

    private WebView web;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private ValueCallback<Uri[]> fileCallback;
    private boolean tv;
    private Uri home;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        home = Uri.parse(getString(R.string.start_url));
        tv = isTv();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);      // channels start playing when opened, as on the website
        s.setSupportMultipleWindows(true);                 // window.open / target=_blank arrive in onCreateWindow
        s.setJavaScriptCanOpenWindowsAutomatically(false); // ...and only when someone tapped something
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " StreamBoxApp/" + versionName() + (tv ? " Android TV" : ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);   // embedded players (YouTube) need them

        web.addJavascriptInterface(new Bridge(), "StreamBoxAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> openOutside(Uri.parse(url)));

        if (state != null) web.restoreState(state);
        if (state == null || web.getUrl() == null) web.loadUrl(home.toString());
        web.requestFocus();
    }

    private boolean isTv() {
        UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        return (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
            || getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1"; }
    }

    // ------------------------------------------------------------------ links
    private boolean isOwnSite(Uri uri) {
        String host = uri.getHost();
        return host != null && host.equalsIgnoreCase(home.getHost());
    }

    /** Sign-in pages that must stay inside the app, because they send the person back to the site afterwards. */
    private boolean staysInside(Uri uri) {
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        return isOwnSite(uri) || host.equals("accounts.spotify.com");
    }

    /** Opens a link in the app that handles it (browser, VLC, Spotify, Play Store...). */
    private void openOutside(Uri uri) {
        try {
            Intent intent;
            if ("intent".equalsIgnoreCase(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
                try { startActivity(intent); return; } catch (ActivityNotFoundException e) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback == null) return;
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallback));
                }
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
            }
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "No app on this device can open that link", Toast.LENGTH_SHORT).show();
        }
    }

    /** true when the link was handled outside the WebView */
    private boolean route(Uri uri, boolean mainFrame) {
        if (!mainFrame) return false;   // embedded frames navigate inside themselves
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if ((scheme.equals("http") || scheme.equals("https")) && staysInside(uri)) return false;
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob") || scheme.equals("javascript")) return false;
        openOutside(uri);
        return true;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(request.getUrl(), request.isForMainFrame());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {   // Android 5 and 6
            return route(Uri.parse(url), true);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            setKeepScreenOn(false);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline();
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {   // Android 5
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) showOffline();
        }
    }

    private void showOffline() {
        String html = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'></head>"
            + "<body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"
            + "background:#141414;color:#f5f5f7;font:20px/1.5 sans-serif;text-align:center;padding:5vh 5vw;box-sizing:border-box'>"
            + "<h1 style='color:#e50914;letter-spacing:.04em'>STREAMBOX</h1><p>Can’t reach StreamBox. Check the internet connection.</p>"
            + "<button autofocus onclick=\"location.href='" + home + "'\" style='font-size:22px;padding:14px 30px;border-radius:999px;"
            + "border:0;background:#fff;color:#000;font-weight:700'>Try again</button></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ------------------------------------------------------------------ pop-ups, full screen, files
    private class Chrome extends WebChromeClient {
        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            if (!isUserGesture) return false;   // pop-ups nobody asked for are dropped
            // A tapped link that opens a new window: catch its address, then open it here (own site) or outside
            WebView probe = new WebView(MainActivity.this);
            probe.setWebViewClient(new WebViewClient() {
                private boolean done;
                private void take(Uri uri) {
                    if (done) return;
                    done = true;
                    if (isOwnSite(uri)) web.loadUrl(uri.toString()); else openOutside(uri);
                    probe.post(probe::destroy);
                }
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) { take(request.getUrl()); return true; }
                @SuppressWarnings("deprecation")
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, String url) { take(Uri.parse(url)); return true; }
                @Override
                public void onPageStarted(WebView v, String url, Bitmap favicon) { if (url != null && !url.equals("about:blank")) take(Uri.parse(url)); }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(probe);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {   // element.requestFullscreen()
            if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
            fullscreenView = view;
            fullscreenCallback = callback;
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            web.setVisibility(View.GONE);
            immersive(true);
        }

        @Override
        public void onHideCustomView() { exitFullscreen(); }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), PICK_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        web.setVisibility(View.VISIBLE);
        immersive(false);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
        web.requestFocus();
    }

    @SuppressWarnings("deprecation")
    private void immersive(boolean on) {
        getWindow().getDecorView().setSystemUiVisibility(on
            ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            : 0);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ------------------------------------------------------------------ Back
    // The page decides first (js/tv.js closes the player or window on top, or goes back a page); when it has
    // nothing left to close, Back leaves the app.
    private void back() {
        if (fullscreenView != null) { web.evaluateJavascript("document.exitFullscreen&&document.fullscreenElement&&document.exitFullscreen()", null); exitFullscreen(); return; }
        web.evaluateJavascript("(function(){try{return !!(window.StreamBoxTV&&StreamBoxTV.back&&StreamBoxTV.back())}catch(e){return false}})()", value -> {
            if ("true".equals(value)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Back is handled here only (not also as a key in the page, which would close two things at once)
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) back();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { back(); }

    // ------------------------------------------------------------------ the page talks to the app
    /** window.StreamBoxAndroid in the page. Kept to harmless calls, since embedded frames can see it too. */
    private class Bridge {
        @JavascriptInterface
        public void keepScreenOn(boolean on) { runOnUiThread(() -> setKeepScreenOn(on)); }

        @JavascriptInterface
        public boolean isTv() { return tv; }

        @JavascriptInterface
        public String version() { return versionName(); }
    }

    private void setKeepScreenOn(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // ------------------------------------------------------------------ lifecycle
    // No web.onPause() when the app goes to the background: music started on a phone keeps playing.
    @Override
    protected void onStop() {
        // On a TV, leaving the app (Home button) stops the picture, like other TV apps; music on a phone keeps playing
        if (tv) web.evaluateJavascript("document.querySelectorAll('video').forEach(function(v){v.pause()})", null);
        super.onStop();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }
}
