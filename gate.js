// Start-up flags. The site is public (no password since Nov 9, 2026).
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("unlocked");
  // Kiosk mode for the venue tablets: open the site once with ?kiosk=1 (?kiosk=0 turns it off).
  // The tablet remembers it, along with the page it was opened on, which it returns to when idle.
  try {
    var km = location.search.match(/[?&]kiosk=([01])/);
    if (km && km[1] === "1") {
      localStorage.setItem("tp-kiosk", "1");
      localStorage.setItem("tp-kiosk-home", location.hash || "#");
      var kl = location.search.match(/[?&]lang=([a-z]{2})/);
      localStorage.setItem("tp-kiosk-lang", kl ? kl[1] : "en");
    } else if (km) {
      localStorage.removeItem("tp-kiosk"); localStorage.removeItem("tp-kiosk-home"); localStorage.removeItem("tp-kiosk-lang");
    }
    if (localStorage.getItem("tp-kiosk") === "1") root.classList.add("kiosk");
    // Left over from the old password screen.
    localStorage.removeItem("tp-key"); localStorage.removeItem("tp-unlocked");
  } catch (e) {}
  // Visitors who arrive by scanning a QR code are on their own phone: remember that so no QR is shown.
  // Older printed or cached codes carry ?k=<old password>: still counts as a QR visit, then tidy the URL.
  if (/[?&]k=/.test(location.search)) {
    try { sessionStorage.setItem("tp-from-qr", "1"); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.hash);
  }
})();
