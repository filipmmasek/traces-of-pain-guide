// Kiosk mode and QR-visitor detection. (This file used to hold the preview password screen, now removed.)
(function () {
  "use strict";
  var HASH = "5c78c8e7160e76ba9b6c41f74247bb7ba4887f5c06faecd6b9a009785b248c72";
  var KEY = "tp-unlocked";
  var root = document.documentElement;
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
  } catch (e) {}
  // Visitors who arrive by scanning a QR code are on their own phone: remember that so no QR is shown.
  // (?qr=1 on new codes; ?k= is what older codes carried while the site had a password.)
  if (/[?&](qr|k)=/.test(location.search)) {
    try { sessionStorage.setItem("tp-from-qr", "1"); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.hash);
  }
  // The preview password is gone: clear what the old password screen saved.
  try { localStorage.removeItem("tp-unlocked"); localStorage.removeItem("tp-key"); } catch (e) {}
})();
