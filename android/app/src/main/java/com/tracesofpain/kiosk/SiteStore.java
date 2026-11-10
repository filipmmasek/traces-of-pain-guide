package com.tracesofpain.kiosk;

import android.content.Context;
import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The offline copy of the guide website.
 *
 * The APK carries a full copy in assets/site/ plus assets/site-manifest.json (path -> git blob sha).
 * Updates downloaded later are stored by content in files/objects/<sha>, and files/site-manifest.json
 * says which version of each file is current. A new version is switched on in one step, only once
 * every file of it is on the tablet, so visitors never see a half-updated site.
 */
final class SiteStore {
    static final String HOST = "filipmmasek.github.io";
    static final String PREFIX = "/traces-of-pain-guide/";
    static final String BASE_URL = "https://" + HOST + PREFIX;

    private static SiteStore instance;

    private final AssetManager assets;
    private final File objDir;
    private final File activeFile;
    private final Manifest bundled;
    private final Map<String, String> bundledBySha = new HashMap<>();
    private volatile Manifest active;

    static synchronized SiteStore get(Context c) {
        if (instance == null) instance = new SiteStore(c.getApplicationContext());
        return instance;
    }

    private SiteStore(Context c) {
        assets = c.getAssets();
        objDir = new File(c.getFilesDir(), "objects");
        //noinspection ResultOfMethodCallIgnored
        objDir.mkdirs();
        activeFile = new File(c.getFilesDir(), "site-manifest.json");
        Manifest b;
        try (InputStream in = assets.open("site-manifest.json")) {
            b = Manifest.parse(new String(readAll(in), StandardCharsets.UTF_8));
        } catch (Exception e) {
            b = new Manifest();
        }
        bundled = b;
        for (Map.Entry<String, String> e : bundled.files.entrySet()) bundledBySha.put(e.getValue(), e.getKey());
        Manifest a = null;
        if (activeFile.isFile()) {
            try (InputStream in = new FileInputStream(activeFile)) {
                a = Manifest.parse(new String(readAll(in), StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                a = null;
            }
        }
        active = a;
    }

    /** Files of the website that belong in the offline copy (same rule as android/bundle_site.py). */
    static boolean included(String path) {
        if (path.startsWith("android/")) return false;
        // Hidden files (.github/, .nojekyll, .assetsignore…) are hosting settings that GitHub Pages does not serve.
        if (path.startsWith(".") || path.contains("/.")) return false;
        switch (path) {
            case "README.md":
            case "wrangler.jsonc":
            case "CNAME":
            case "admin.html":
            case "admin.js":
            case "admin.css":
                return false;
            default:
                return true;
        }
    }

    Manifest current() {
        Manifest a = active;
        return a != null ? a : bundled;
    }

    Manifest bundled() {
        return bundled;
    }

    boolean usingBundled() {
        return active == null;
    }

    /** Is this exact file content already on the tablet (downloaded or inside the APK)? */
    boolean has(String sha) {
        return new File(objDir, sha).isFile() || bundledBySha.containsKey(sha);
    }

    File objectFile(String sha) {
        return new File(objDir, sha);
    }

    File tempFile() throws IOException {
        return File.createTempFile("download", ".tmp", objDir); // Java needs a prefix of 3+ characters
    }

    InputStream open(String path) throws IOException {
        Manifest m = current();
        String sha = m.files.get(path);
        if (sha != null) {
            File f = new File(objDir, sha);
            if (f.isFile()) return new FileInputStream(f);
            String bp = bundledBySha.get(sha);
            if (bp != null) return assets.open("site/" + bp);
        }
        if (bundled.files.containsKey(path)) return assets.open("site/" + path);
        return null;
    }

    /** Response for a request inside the site, or null when the file is not offline (then the network is tried). */
    WebResourceResponse serve(String path) {
        InputStream in;
        try {
            in = open(path);
        } catch (IOException e) {
            in = null;
        }
        if (in == null) return null;
        String mime = mimeFor(path);
        String enc = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") || mime.endsWith("svg+xml") ? "utf-8" : null;
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse(mime, enc, 200, "OK", h, in);
    }

    /** Switch to a new complete version of the site. */
    synchronized void activate(Manifest m) throws IOException {
        File tmp = new File(activeFile.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(m.toJson().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(activeFile)) throw new IOException("Could not save site version");
        active = m;
        collectGarbage(m);
    }

    /** Throw away all downloaded updates and use the copy inside the app again. */
    synchronized void resetToBundled() {
        //noinspection ResultOfMethodCallIgnored
        activeFile.delete();
        active = null;
        File[] fs = objDir.listFiles();
        if (fs != null) for (File f : fs) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    private void collectGarbage(Manifest keep) {
        Set<String> used = new HashSet<>(keep.files.values());
        File[] fs = objDir.listFiles();
        if (fs == null) return;
        long now = System.currentTimeMillis();
        for (File f : fs) {
            String n = f.getName();
            boolean oldTemp = n.endsWith(".tmp") && now - f.lastModified() > 3600_000L;
            boolean unused = !n.endsWith(".tmp") && !used.contains(n);
            if (oldTemp || unused) //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
    }

    // ---------- helpers ----------

    static String mimeFor(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        int dot = p.lastIndexOf('.');
        String ext = dot >= 0 ? p.substring(dot + 1) : "";
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": return "application/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "txt": case "md": return "text/plain";
            case "jpg": case "jpeg": return "image/jpeg";
            case "png": return "image/png";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "pdf": return "application/pdf";
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "mp3": return "audio/mpeg";
            default: return "application/octet-stream";
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    /** Git's id for a file's content: sha1("blob <size>\0" + content). Lets us check downloads against GitHub. */
    static String gitBlobSha(File f) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            md.update(("blob " + f.length() + "\0").getBytes(StandardCharsets.US_ASCII));
            try (InputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            }
            return hex(md.digest());
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }

    /** One version of the site: which content each file has. */
    static final class Manifest {
        String commit = "";
        String date = "";
        Map<String, String> files = new HashMap<>();

        static Manifest parse(String json) throws JSONException {
            JSONObject o = new JSONObject(json);
            Manifest m = new Manifest();
            m.commit = o.optString("commit", "");
            m.date = o.optString("date", "");
            JSONObject f = o.getJSONObject("files");
            Iterator<String> it = f.keys();
            while (it.hasNext()) {
                String k = it.next();
                m.files.put(k, f.getString(k));
            }
            return m;
        }

        String toJson() {
            try {
                JSONObject o = new JSONObject();
                o.put("commit", commit);
                o.put("date", date);
                o.put("files", new JSONObject(files));
                return o.toString();
            } catch (JSONException e) {
                throw new IllegalStateException(e);
            }
        }

        Map<String, String> files() {
            return Collections.unmodifiableMap(files);
        }
    }
}
