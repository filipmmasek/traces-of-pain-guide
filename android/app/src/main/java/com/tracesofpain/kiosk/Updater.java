package com.tracesofpain.kiosk;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Keeps the offline copy in step with the website on GitHub Pages.
 *
 * 1. Ask GitHub (api.github.com) which files the latest version of the site has.
 * 2. Download only the changed files from GitHub Pages (filipmmasek.github.io), checking each one.
 * 3. When all of them are on the tablet, switch to the new version in one step.
 *
 * If api.github.com cannot be reached, a lighter update fetches the texts, code and any new photos
 * straight from GitHub Pages. Without internet nothing happens and the offline copy keeps working.
 */
final class Updater {
    interface Listener {
        /** Called on a background thread after a new version was switched on. */
        void onSiteUpdated();

        /** Called on a background thread whenever the status text changes. */
        void onStatus();
    }

    static final String API = "https://api.github.com/repos/filipmmasek/traces-of-pain-guide";
    static final String BRANCH = "main";
    private static final String[] CORE = {
            "index.html", "data.js", "app.js", "gate.js", "styles.css", "qr.html", "vendor/qrcode.js"
    };
    private static final Pattern IMG = Pattern.compile("img/[A-Za-z0-9_./%\\- ]+?\\.(?:jpe?g|png|webp|gif|svg)");

    private final SiteStore store;
    private final SharedPreferences prefs;
    private final Listener listener;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final String userAgent;

    Updater(Context c, SiteStore store, Listener listener) {
        this.store = store;
        this.prefs = c.getSharedPreferences("kiosk", Context.MODE_PRIVATE);
        this.listener = listener;
        this.userAgent = "TracesOfPainKiosk/" + Kiosk.versionName(c);
    }

    boolean isRunning() {
        return running.get();
    }

    long lastCheck() {
        return prefs.getLong("lastCheck", 0);
    }

    /** True when the last check could not finish (offline or GitHub Pages not ready yet): try again soon. */
    boolean wantsRetry() {
        return prefs.getBoolean("retry", false);
    }

    String status() {
        return prefs.getString("status", "Not checked yet");
    }

    /** Start a check in the background. Returns false if one is already running. */
    boolean check() {
        if (!running.compareAndSet(false, true)) return false;
        setStatus("Checking for updates…", false, false);
        exec.execute(() -> {
            try {
                run();
            } catch (Throwable t) {
                setStatus("Update failed: " + describe(t), true, true);
            } finally {
                running.set(false);
                listener.onStatus();
            }
        });
        return true;
    }

    private void run() throws Exception {
        SiteStore.Manifest cur = store.current();
        String target = null, date = null, tree = null;
        boolean apiOk = false;
        try {
            // Remembered ETag: GitHub answers "not modified" for free when nothing changed.
            String etag = prefs.getString("branchEtag", null);
            Resp r = get(API + "/branches/" + BRANCH, etag, true);
            if (r.code == 304) {
                setStatus("Up to date (" + fmtDate(cur.date) + ")", false, true);
                return;
            }
            if (r.code == 200) {
                JSONObject c = new JSONObject(new String(r.body, StandardCharsets.UTF_8)).getJSONObject("commit");
                target = c.getString("sha");
                JSONObject cc = c.getJSONObject("commit");
                date = cc.getJSONObject("committer").optString("date", "");
                tree = cc.getJSONObject("tree").getString("sha");
                apiOk = true;
                if (target.equals(cur.commit)) {
                    prefs.edit().putString("branchEtag", r.etag).apply();
                    setStatus("Up to date (" + fmtDate(cur.date) + ")", false, true);
                    return;
                }
                prefs.edit().putString("pendingEtag", r.etag).apply();
            }
        } catch (IOException e) {
            if (isOffline(e)) {
                setStatus("Offline: showing the saved copy (" + fmtDate(cur.date) + ")", true, true);
                return;
            }
        }

        if (!apiOk) {
            lightUpdate(cur);
            return;
        }

        Resp t = get(API + "/git/trees/" + tree + "?recursive=1", null, true);
        if (t.code != 200) {
            lightUpdate(cur);
            return;
        }
        JSONArray entries = new JSONObject(new String(t.body, StandardCharsets.UTF_8)).getJSONArray("tree");
        SiteStore.Manifest next = new SiteStore.Manifest();
        next.commit = target;
        next.date = date;
        for (int i = 0; i < entries.length(); i++) {
            JSONObject e = entries.getJSONObject(i);
            if (!"blob".equals(e.optString("type"))) continue;
            String path = e.getString("path");
            if (SiteStore.included(path)) next.files.put(path, e.getString("sha"));
        }

        List<String> missing = new ArrayList<>();
        for (Map.Entry<String, String> e : next.files.entrySet()) {
            if (!store.has(e.getValue())) missing.add(e.getKey());
        }
        int done = 0, waiting = 0;
        for (String path : missing) {
            String sha = next.files.get(path);
            setStatus("Downloading update: " + (done + 1) + " of " + missing.size(), false, false);
            listener.onStatus();
            try {
                File tmp = download(pagesUrl(path) + "?v=" + sha.substring(0, 10));
                if (tmp == null) {
                    waiting++;
                    continue;
                }
                String got = SiteStore.gitBlobSha(tmp);
                if (got.equals(sha) && tmp.renameTo(store.objectFile(sha))) {
                    done++;
                } else {
                    // GitHub Pages still serves the previous version of this file: it usually catches up in a minute or two.
                    //noinspection ResultOfMethodCallIgnored
                    tmp.delete();
                    waiting++;
                }
            } catch (IOException e) {
                if (isOffline(e)) {
                    setStatus("Connection lost during update; will try again", true, true);
                    return;
                }
                waiting++;
            }
        }
        if (waiting > 0) {
            setStatus("Waiting for GitHub Pages to publish " + waiting + " file(s); will try again in a few minutes", true, true);
            return;
        }
        store.activate(next);
        prefs.edit().putString("branchEtag", prefs.getString("pendingEtag", null))
                .putLong("lastUpdate", System.currentTimeMillis()).apply();
        setStatus("Updated to the version of " + fmtDate(next.date)
                + (missing.isEmpty() ? "" : " (" + missing.size() + " new file(s))"), false, true);
        listener.onSiteUpdated();
    }

    /**
     * Fallback when api.github.com is blocked or out of requests: refresh texts and code from GitHub Pages
     * and fetch photos that the texts mention but the tablet does not have yet.
     */
    private void lightUpdate(SiteStore.Manifest cur) throws Exception {
        SiteStore.Manifest next = new SiteStore.Manifest();
        next.files.putAll(cur.files);
        next.commit = cur.commit;
        next.date = cur.date;
        String stamp = Long.toString(System.currentTimeMillis());
        String dataJs = null;
        for (String path : CORE) {
            setStatus("Quick update: " + path, false, false);
            File tmp;
            try {
                tmp = download(pagesUrl(path) + "?v=" + stamp);
            } catch (IOException e) {
                setStatus(isOffline(e) ? "Offline: showing the saved copy (" + fmtDate(cur.date) + ")"
                        : "Could not reach GitHub Pages: " + describe(e), true, true);
                return;
            }
            if (tmp == null) {
                if (path.equals("index.html") || path.equals("data.js")) {
                    setStatus("GitHub Pages did not return the site; keeping the saved copy", true, true);
                    return;
                }
                continue;
            }
            String sha = SiteStore.gitBlobSha(tmp);
            if (path.equals("data.js")) {
                try (InputStream in = new FileInputStream(tmp)) {
                    dataJs = new String(SiteStore.readAll(in), StandardCharsets.UTF_8);
                }
            }
            keep(tmp, sha);
            next.files.put(path, sha);
        }
        Set<String> imgs = new LinkedHashSet<>();
        if (dataJs != null) {
            Matcher m = IMG.matcher(dataJs);
            while (m.find()) {
                String p = Uri.decode(m.group());
                imgs.add(p);
                if (p.startsWith("img/full/")) imgs.add("img/zoom/" + p.substring("img/full/".length()));
            }
        }
        int added = 0;
        for (String p : imgs) {
            if (next.files.containsKey(p)) continue;
            setStatus("Quick update: new photo " + p, false, false);
            try {
                File tmp = download(pagesUrl(p));
                if (tmp == null) continue;
                String sha = SiteStore.gitBlobSha(tmp);
                keep(tmp, sha);
                next.files.put(p, sha);
                added++;
            } catch (IOException e) {
                if (isOffline(e)) break;
            }
        }
        if (!next.files.equals(cur.files)) {
            next.date = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT).format(new Date());
            store.activate(next);
            prefs.edit().putLong("lastUpdate", System.currentTimeMillis()).apply();
            setStatus("Quick update done (GitHub API not reachable)" + (added > 0 ? ", " + added + " new photo(s)" : ""), true, true);
            listener.onSiteUpdated();
        } else {
            setStatus("Up to date (quick check; GitHub API not reachable)", true, true);
        }
    }

    private void keep(File tmp, String sha) {
        File dest = store.objectFile(sha);
        if (dest.isFile() || !tmp.renameTo(dest)) //noinspection ResultOfMethodCallIgnored
            tmp.delete();
    }

    // ---------- network ----------

    private static final class Resp {
        int code;
        byte[] body;
        String etag;
    }

    private static String pagesUrl(String path) {
        StringBuilder sb = new StringBuilder(SiteStore.BASE_URL);
        String[] parts = path.split("/");
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('/');
            sb.append(Uri.encode(parts[i]));
        }
        return sb.toString();
    }

    private HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(30_000);
        c.setRequestProperty("User-Agent", userAgent);
        c.setUseCaches(false);
        return c;
    }

    private Resp get(String url, String etag, boolean api) throws IOException {
        HttpURLConnection c = open(url);
        try {
            if (api) {
                c.setRequestProperty("Accept", "application/vnd.github+json");
                c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            }
            if (etag != null) c.setRequestProperty("If-None-Match", etag);
            Resp r = new Resp();
            r.code = c.getResponseCode();
            r.etag = c.getHeaderField("ETag");
            if (r.code == 200) {
                try (InputStream in = c.getInputStream()) {
                    r.body = SiteStore.readAll(in);
                }
            }
            return r;
        } finally {
            c.disconnect();
        }
    }

    /** Download to a temporary file. Returns null when the server has no such file (404 and similar). */
    private File download(String url) throws IOException {
        HttpURLConnection c = open(url);
        try {
            int code = c.getResponseCode();
            if (code != 200) return null;
            File tmp = store.tempFile();
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } catch (IOException e) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                throw e;
            }
            return tmp;
        } finally {
            c.disconnect();
        }
    }

    private static boolean isOffline(IOException e) {
        return e instanceof java.net.UnknownHostException
                || e instanceof java.net.ConnectException
                || e instanceof java.net.NoRouteToHostException
                || e instanceof java.net.SocketTimeoutException;
    }

    private static String describe(Throwable t) {
        String m = t.getMessage();
        return t.getClass().getSimpleName() + (m != null ? ": " + m : "");
    }

    private void setStatus(String s, boolean retry, boolean finished) {
        SharedPreferences.Editor ed = prefs.edit().putString("status", s);
        if (finished) ed.putLong("lastCheck", System.currentTimeMillis()).putBoolean("retry", retry);
        ed.apply();
    }

    static String fmtDate(String iso) {
        if (iso == null || iso.length() < 16) return "built-in copy";
        // 2026-11-08T17:06:22Z -> 8.11.2026 17:06 UTC
        try {
            int y = Integer.parseInt(iso.substring(0, 4));
            int mo = Integer.parseInt(iso.substring(5, 7));
            int d = Integer.parseInt(iso.substring(8, 10));
            return d + "." + mo + "." + y + " " + iso.substring(11, 16) + " UTC";
        } catch (NumberFormatException e) {
            return iso;
        }
    }
}
