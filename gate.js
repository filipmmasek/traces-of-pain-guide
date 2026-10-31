// Simple preview password screen. Not real security: the site files are public on GitHub.
(function () {
  "use strict";
  var HASH = "5c78c8e7160e76ba9b6c41f74247bb7ba4887f5c06faecd6b9a009785b248c72";
  var KEY = "tp-unlocked";
  var root = document.documentElement;
  // Visitors who arrive by scanning a QR code are on their own phone: remember that so no QR is shown.
  if (/[?&]k=/.test(location.search)) { try { sessionStorage.setItem("tp-from-qr", "1"); } catch (e) {} }
  function ok() { try { return localStorage.getItem(KEY) === HASH && !!localStorage.getItem("tp-key"); } catch (e) { return false; } }
  if (ok()) {
    root.classList.add("unlocked");
    if (/[?&]k=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
    return;
  }
  // A QR code from the venue tablet carries ?k=<password> so phones skip this screen.
  var m = location.search.match(/[?&]k=([^&]+)/);
  if (m) {
    var k = decodeURIComponent(m[1]);
    sha256(k.trim().toLowerCase()).then(function (h) {
      if (h !== HASH) return;
      try { localStorage.setItem(KEY, HASH); localStorage.setItem("tp-key", k); } catch (e) {}
      root.classList.add("unlocked");
      var g = document.getElementById("gate"); if (g) g.remove();
      history.replaceState(null, "", location.pathname + location.hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  }
  function sha256(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (root.classList.contains("unlocked")) return;
    var g = document.createElement("form");
    g.id = "gate";
    g.innerHTML = '<div class="gate-box"><span class="label">Gabriel Matula</span><h1>Traces <em>of</em> Pain</h1>' +
      '<label for="gatePw">Password</label><input id="gatePw" type="password" autocomplete="current-password">' +
      '<button type="submit">Enter</button><p id="gateErr" aria-live="polite"></p></div>';
    document.body.appendChild(g);
    var pw = document.getElementById("gatePw");
    pw.focus();
    g.addEventListener("submit", function (e) {
      e.preventDefault();
      sha256(pw.value.trim().toLowerCase()).then(function (h) {
        if (h !== HASH) { document.getElementById("gateErr").textContent = "Wrong password"; pw.select(); return; }
        try { localStorage.setItem(KEY, HASH); localStorage.setItem("tp-key", pw.value.trim()); } catch (err) {}
        root.classList.add("unlocked");
        g.remove();
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    });
  });
})();
