package com.tracesofpain.kiosk;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.Date;

/**
 * The kiosk: a full-screen web view showing the guide from the offline copy, kept up to date in the
 * background. Staff open the settings by tapping the top-left corner 5 times and entering the PIN.
 */
public class MainActivity extends Activity implements Updater.Listener {
    static final String DEFAULT_PIN = "1234";
    private static final long CHECK_EVERY_MS = 15 * 60_000L;
    private static final long RETRY_EVERY_MS = 3 * 60_000L;
    private static final long IDLE_BEFORE_RELOAD_MS = 2 * 60_000L;
    private static final String[] LANG_CODES = {"en", "cs", "es"};
    private static final String[] LANG_NAMES = {"English", "Čeština", "Español"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private SiteStore store;
    private ExternalCache external;
    private Updater updater;
    private WebView web;
    private ConnectivityManager.NetworkCallback netCallback;

    private long lastTouch = SystemClock.uptimeMillis();
    private volatile boolean reloadPending;
    private boolean kioskPaused;
    private boolean pinAsked;
    private int cornerTaps;
    private long firstCornerTap;
    private int wrongPins;
    private long pinBlockedUntil;
    private AlertDialog menuDialog;
    private TextView menuStatus;

    // ---------- lifecycle ----------

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("kiosk", MODE_PRIVATE);
        store = SiteStore.get(this);
        external = new ExternalCache(this);
        updater = new Updater(this, store, this);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        Kiosk.applyOwnerPolicies(this);

        createWebView();
        loadStart();
        watchNetwork();
        main.postDelayed(ticker, 20_000);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Opening the app again (icon, Home button, restart) locks it again after staff unlocked it.
        if (kioskPaused) {
            kioskPaused = false;
            pinAsked = false;
            Kiosk.applyOwnerPolicies(this);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        lockIfNeeded();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (netCallback != null) {
            try {
                ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCallback);
            } catch (Exception ignored) {
            }
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Back goes back inside the guide but never leaves it.
        if (web != null && web.canGoBack()) web.goBack();
    }

    // ---------- web view ----------

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        WebView.setWebContentsDebuggingEnabled(false);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(v -> true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100); // ignore the tablet's font size setting so the layout stays as designed
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setUserAgentString(s.getUserAgentString() + " TracesOfPainKiosk/" + Kiosk.versionName(this));
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new KioskClient());
        setContentView(web);
    }

    private String startUrl() {
        String lang = prefs.getString("lang", "en");
        String home = prefs.getString("home", "#");
        if (!home.startsWith("#")) home = "#" + home;
        return SiteStore.BASE_URL + "?kiosk=1&k=pain&lang=" + lang + home;
    }

    private void loadStart() {
        reloadPending = false;
        if (web != null) web.loadUrl(startUrl());
    }

    private static boolean isSitePage(Uri u) {
        return u != null && "https".equals(u.getScheme()) && SiteStore.HOST.equals(u.getHost())
                && u.getPath() != null && u.getPath().startsWith(SiteStore.PREFIX);
    }

    private final class KioskClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
            Uri u = req.getUrl();
            if (isSitePage(u)) {
                String rel = u.getPath().substring(SiteStore.PREFIX.length());
                if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
                return store.serve(rel); // null = not offline yet: load it from GitHub Pages
            }
            if (ExternalCache.handles(u.getHost())) return external.fetch(req);
            return null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!isSitePage(u)) return true; // never leave the guide
            String rel = u.getPath().substring(SiteStore.PREFIX.length());
            return rel.startsWith("admin"); // the text editor is not for visitors
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The page crashed (rare, e.g. low memory): start again instead of closing the app.
            if (web == view) {
                web = null;
                view.destroy();
                main.post(() -> {
                    createWebView();
                    loadStart();
                });
            }
            return true;
        }
    }

    // ---------- updates ----------

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            long since = System.currentTimeMillis() - updater.lastCheck();
            long every = updater.wantsRetry() ? RETRY_EVERY_MS : CHECK_EVERY_MS;
            if (since >= every || since < 0) updater.check();
            if (reloadPending && SystemClock.uptimeMillis() - lastTouch > IDLE_BEFORE_RELOAD_MS
                    && (menuDialog == null || !menuDialog.isShowing())) {
                loadStart();
            }
            main.postDelayed(this, 30_000);
        }
    };

    private void watchNetwork() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return;
        netCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Back online: check for a newer version shortly.
                main.postDelayed(() -> updater.check(), 8_000);
            }
        };
        try {
            cm.registerDefaultNetworkCallback(netCallback);
        } catch (Exception e) {
            netCallback = null;
        }
    }

    @Override
    public void onSiteUpdated() {
        // Shown to the next visitor: reload once nobody has touched the screen for a while,
        // or as soon as staff close the menu.
        reloadPending = true;
        main.post(this::refreshMenuStatus);
    }

    @Override
    public void onStatus() {
        main.post(this::refreshMenuStatus);
    }

    // ---------- kiosk lock ----------

    private void lockIfNeeded() {
        if (kioskPaused || Kiosk.isLocked(this)) return;
        if (!Kiosk.isOwner(this)) {
            if (pinAsked || !prefs.getBoolean("pinScreen", true)) return;
            pinAsked = true; // without device owner Android asks to confirm pinning: ask only once per start
        }
        try {
            startLockTask();
        } catch (Exception ignored) {
        }
    }

    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            //noinspection deprecation
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        lastTouch = SystemClock.uptimeMillis();
        if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) {
            float zone = dp(90);
            if (ev.getX() < zone && ev.getY() < zone) {
                long now = SystemClock.uptimeMillis();
                if (now - firstCornerTap > 4000) {
                    firstCornerTap = now;
                    cornerTaps = 0;
                }
                if (++cornerTaps >= 5) {
                    cornerTaps = 0;
                    askPin();
                }
            }
        }
        return super.dispatchTouchEvent(ev);
    }

    // ---------- staff menu ----------

    private void askPin() {
        long now = SystemClock.uptimeMillis();
        if (now < pinBlockedUntil) {
            toast("Too many wrong PINs. Wait " + ((pinBlockedUntil - now) / 1000 + 1) + " s.");
            return;
        }
        EditText in = pinField("PIN");
        AlertDialog d = dialog().setTitle("Staff PIN").setView(pad(in))
                .setPositiveButton("OK", (x, w) -> {
                    if (in.getText().toString().equals(prefs.getString("pin", DEFAULT_PIN))) {
                        wrongPins = 0;
                        showMenu();
                    } else {
                        if (++wrongPins >= 5) {
                            wrongPins = 0;
                            pinBlockedUntil = SystemClock.uptimeMillis() + 60_000;
                        }
                        toast("Wrong PIN");
                    }
                })
                .setNegativeButton("Cancel", null).create();
        d.setOnDismissListener(x -> hideSystemUi());
        d.show();
        in.requestFocus();
        if (d.getWindow() != null)
            d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    }

    private void showMenu() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = (int) dp(20);
        box.setPadding(p, (int) dp(8), p, p);

        menuStatus = new TextView(this);
        menuStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        menuStatus.setPadding(0, 0, 0, (int) dp(12));
        box.addView(menuStatus);
        refreshMenuStatus();

        addButton(box, "Update website now", () -> {
            if (!updater.check()) toast("Already checking…");
            refreshMenuStatus();
        });
        addButton(box, "Reload guide (back to start page)", () -> {
            closeMenu();
            loadStart();
        });
        addButton(box, "Use the page shown now as start page", () -> {
            String url = web != null ? web.getUrl() : null;
            String frag = url != null ? Uri.parse(url).getEncodedFragment() : null;
            String home = "#" + (frag == null ? "" : frag);
            prefs.edit().putString("home", home).apply();
            toast("Start page saved: " + (home.equals("#") ? "Projects (home)" : home));
            closeMenu();
            loadStart();
        });
        addButton(box, "Start language: " + langName(prefs.getString("lang", "en")), this::chooseLanguage);
        addButton(box, "Change PIN", this::changePin);
        if (!Kiosk.isOwner(this)) {
            addButton(box, "Pin screen now", () -> {
                closeMenu();
                pinAsked = false;
                kioskPaused = false;
                lockIfNeeded();
            });
        }
        addButton(box, "Use the copy inside the app (undo updates)", () -> confirm(
                "Undo downloaded updates?",
                "The guide goes back to the version built into the app. It updates again the next time it is online.",
                () -> {
                    store.resetToBundled();
                    prefs.edit().remove("branchEtag").remove("pendingEtag").putLong("lastCheck", 0).apply();
                    closeMenu();
                    loadStart();
                }));
        addButton(box, "Exit kiosk (use the tablet normally)", this::exitKiosk);
        if (Kiosk.isOwner(this)) {
            addButton(box, "Release tablet after the exhibition", () -> confirm(
                    "Release this tablet?",
                    "Removes the full lock for good, so the app can be uninstalled. To lock it again you need a computer and USB (see the setup steps).",
                    () -> {
                        Kiosk.removeOwner(this);
                        exitKiosk();
                    }));
        }

        ScrollView sv = new ScrollView(this);
        sv.addView(box);
        menuDialog = dialog().setTitle("Guide kiosk").setView(sv).setNegativeButton("Close", null).create();
        menuDialog.setOnDismissListener(x -> {
            menuStatus = null;
            hideSystemUi();
            // Staff just looked at the menu (often after "Update website now"): show the new version right away.
            if (reloadPending) loadStart();
        });
        menuDialog.show();
    }

    private void refreshMenuStatus() {
        if (menuStatus == null) return;
        SiteStore.Manifest m = store.current();
        long lc = updater.lastCheck();
        String text = "App " + Kiosk.versionName(this) + "\n"
                + "Website: version of " + Updater.fmtDate(m.date)
                + (store.usingBundled() ? " (built into the app)" : " (downloaded update)") + "\n"
                + "Updates: " + (updater.isRunning() ? "checking… " : "") + updater.status() + "\n"
                + "Last check: " + (lc == 0 ? "never" : DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(lc))) + "\n"
                + "Lock: " + Kiosk.modeText(this) + "\n"
                + "Start page: " + prefs.getString("home", "#") + "  ·  language: " + langName(prefs.getString("lang", "en"));
        menuStatus.setText(text);
    }

    private void chooseLanguage() {
        String cur = prefs.getString("lang", "en");
        int sel = 0;
        for (int i = 0; i < LANG_CODES.length; i++) if (LANG_CODES[i].equals(cur)) sel = i;
        dialog().setTitle("Start language").setSingleChoiceItems(LANG_NAMES, sel, (d, which) -> {
            prefs.edit().putString("lang", LANG_CODES[which]).apply();
            d.dismiss();
            closeMenu();
            loadStart();
        }).setNegativeButton("Cancel", null).show();
    }

    private void changePin() {
        EditText a = pinField("New PIN (4 to 8 digits)");
        EditText b = pinField("New PIN again");
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.addView(a);
        l.addView(b);
        dialog().setTitle("Change PIN").setView(pad(l)).setPositiveButton("Save", (d, w) -> {
            String x = a.getText().toString(), y = b.getText().toString();
            if (x.length() < 4 || x.length() > 8) toast("The PIN must have 4 to 8 digits");
            else if (!x.equals(y)) toast("The two PINs are different");
            else {
                prefs.edit().putString("pin", x).apply();
                toast("PIN changed");
            }
        }).setNegativeButton("Cancel", null).show();
    }

    private void exitKiosk() {
        closeMenu();
        kioskPaused = true;
        try {
            stopLockTask();
        } catch (Exception ignored) {
        }
        Kiosk.releaseOwnerPolicies(this);
        toast("Kiosk unlocked. Open Traces of Pain again to lock it.");
        try {
            startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            moveTaskToBack(true);
        }
    }

    // ---------- small UI helpers ----------

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
    }

    private void closeMenu() {
        if (menuDialog != null && menuDialog.isShowing()) menuDialog.dismiss();
    }

    private void confirm(String title, String msg, Runnable yes) {
        dialog().setTitle(title).setMessage(msg).setPositiveButton("Yes", (d, w) -> yes.run())
                .setNegativeButton("Cancel", null).show();
    }

    private void addButton(LinearLayout box, String label, Runnable action) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setOnClickListener(v -> action.run());
        box.addView(b, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private EditText pinField(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        e.setSingleLine(true);
        return e;
    }

    private View pad(View v) {
        LinearLayout l = new LinearLayout(this);
        int p = (int) dp(20);
        l.setPadding(p, (int) dp(8), p, 0);
        l.addView(v, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return l;
    }

    private static String langName(String code) {
        for (int i = 0; i < LANG_CODES.length; i++) if (LANG_CODES[i].equals(code)) return LANG_NAMES[i];
        return code;
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }
}
