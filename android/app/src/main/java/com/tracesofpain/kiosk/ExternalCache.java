package com.tracesofpain.kiosk;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Offline copy of the web fonts (Adobe Fonts / Typekit). They can only be fetched from Adobe, so the
 * tablet saves them the first time it is online and uses the saved copy from then on.
 */
final class ExternalCache {
    private static final long REFRESH_MS = 24L * 3600_000L;

    private final File dir;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();

    ExternalCache(Context c) {
        dir = new File(c.getFilesDir(), "external");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    static boolean handles(String host) {
        return host != null && (host.equals("use.typekit.net") || host.equals("p.typekit.net"));
    }

    WebResourceResponse fetch(WebResourceRequest req) {
        String url = req.getUrl().toString();
        String key = key(url);
        File body = new File(dir, key);
        File type = new File(dir, key + ".type");
        if (body.isFile() && type.isFile()) {
            if (System.currentTimeMillis() - body.lastModified() > REFRESH_MS) {
                exec.execute(() -> {
                    try {
                        download(url, req.getRequestHeaders(), body, type);
                    } catch (IOException ignored) {
                    }
                });
            }
            WebResourceResponse r = respond(body, type);
            if (r != null) return r;
        }
        try {
            if (download(url, req.getRequestHeaders(), body, type)) {
                WebResourceResponse r = respond(body, type);
                if (r != null) return r;
            }
        } catch (IOException ignored) {
        }
        // Not available offline yet: answer at once with an empty file so the page does not wait.
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not available offline",
                corsHeaders(), new ByteArrayInputStream(new byte[0]));
    }

    private boolean download(String url, Map<String, String> reqHeaders, File body, File type) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(6000);
            c.setReadTimeout(15000);
            boolean referer = false;
            if (reqHeaders != null) for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
                String k = h.getKey().toLowerCase(Locale.ROOT);
                if (k.equals("accept-encoding") || k.equals("range") || k.startsWith("if-")) continue;
                c.setRequestProperty(h.getKey(), h.getValue());
                if (h.getKey().equalsIgnoreCase("Referer")) referer = true;
            }
            if (!referer) c.setRequestProperty("Referer", SiteStore.BASE_URL);
            if (c.getResponseCode() != 200) return false;
            String ct = c.getContentType();
            File tmp = new File(body.getPath() + ".tmp");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            try (OutputStream out = new FileOutputStream(type)) {
                out.write((ct == null ? "application/octet-stream" : ct).getBytes(StandardCharsets.UTF_8));
            }
            return tmp.renameTo(body);
        } finally {
            c.disconnect();
        }
    }

    private static WebResourceResponse respond(File body, File type) {
        try {
            String ct;
            try (InputStream in = new FileInputStream(type)) {
                ct = new String(SiteStore.readAll(in), StandardCharsets.UTF_8).trim();
            }
            String mime = ct, enc = null;
            int semi = ct.indexOf(';');
            if (semi >= 0) {
                mime = ct.substring(0, semi).trim();
                String rest = ct.substring(semi + 1).toLowerCase(Locale.ROOT);
                int cs = rest.indexOf("charset=");
                if (cs >= 0) enc = rest.substring(cs + 8).trim();
            }
            return new WebResourceResponse(mime, enc, 200, "OK", corsHeaders(), new FileInputStream(body));
        } catch (IOException e) {
            return null;
        }
    }

    private static Map<String, String> corsHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return h;
    }

    private static String key(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            return SiteStore.hex(md.digest(url.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return Integer.toHexString(url.hashCode());
        }
    }
}
