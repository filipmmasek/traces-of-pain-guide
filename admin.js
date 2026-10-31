(function () {
  "use strict";
  // Where the guide lives. Saving commits data.js (and uploaded images) to this branch,
  // which GitHub Pages serves.
  var OWNER = "filipmmasek", REPO = "traces-of-pain-guide", BRANCH = "prototype";
  var DATA_PATH = "data.js", API = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/";
  var TOKEN_KEY = "tp-admin-token";

  var $ = function (id) { return document.getElementById(id); };
  var token = null, data = null, sha = null, dirty = false, current = { kind: "exhibition" };
  var uploads = {};   // path -> base64, waiting for Save
  var previews = {};  // path -> data URL, so new images show before they are saved
  var selHs = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function status(msg, cls) { var s = $("status"); s.textContent = msg || ""; s.className = "status " + (cls || ""); }
  function setDirty(d) {
    dirty = d; $("saveBtn").disabled = !d;
    if (d) status("Unsaved changes");
  }
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- GitHub ----------
  function gh(path, opts) {
    opts = opts || {};
    opts.headers = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" };
    if (opts.body) opts.headers["Content-Type"] = "application/json";
    return fetch(API + path, opts).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(j.message || ("HTTP " + r.status)); e.status = r.status; throw e;
      });
      return r.json();
    });
  }
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function parseData(js) {
    var a = js.indexOf("{"), b = js.lastIndexOf("}");
    return JSON.parse(js.slice(a, b + 1));
  }
  function load() {
    status("Loading…");
    return gh(DATA_PATH + "?ref=" + BRANCH + "&t=" + Date.now()).then(function (f) {
      sha = f.sha; data = parseData(b64decode(f.content));
      setDirty(false); status("Up to date", "ok");
      renderSide(); renderPane();
    });
  }
  function save() {
    $("saveBtn").disabled = true; status("Saving…");
    var paths = Object.keys(uploads);
    var chain = Promise.resolve();
    paths.forEach(function (p) {
      chain = chain.then(function () {
        return gh(p, { method: "PUT", body: JSON.stringify({ message: "Admin: add image " + p, content: uploads[p], branch: BRANCH }) })
          .then(function () { delete uploads[p]; });
      });
    });
    return chain.then(function () {
      var js = "window.GUIDE = " + JSON.stringify(data, null, 1) + ";\n";
      return gh(DATA_PATH, { method: "PUT", body: JSON.stringify({ message: "Admin: update guide texts", content: b64encode(js), sha: sha, branch: BRANCH }) });
    }).then(function (r) {
      sha = r.content.sha; setDirty(false);
      status("Saved. The live guide updates in about a minute.", "ok");
    }).catch(function (e) {
      $("saveBtn").disabled = false;
      if (e.status === 409) status("Someone else saved in the meantime. Copy your text somewhere, reload the page, and edit again.", "bad");
      else if (e.status === 401 || e.status === 403) status("Your access key was refused. Sign out and sign in with a new key.", "bad");
      else status("Save failed: " + e.message, "bad");
    });
  }

  // ---------- Sign in ----------
  function showLogin(msg) {
    $("login").hidden = false; $("app").hidden = true; $("signOut").hidden = true; $("saveBtn").hidden = true;
    $("loginErr").textContent = msg || "";
  }
  function startApp() {
    $("login").hidden = true; $("app").hidden = false; $("signOut").hidden = false; $("saveBtn").hidden = false;
    return load().catch(function (e) {
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (x) {}
        showLogin("That key can't open the guide repository. Check it has Contents read and write on traces-of-pain-guide.");
      } else status("Could not load: " + e.message, "bad");
    });
  }
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    token = $("token").value.trim();
    if (!token) return;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (x) {}
    startApp();
  });
  $("signOut").addEventListener("click", function () {
    if (dirty && !window.confirm("You have unsaved changes. Sign out anyway?")) return;
    try { localStorage.removeItem(TOKEN_KEY); } catch (x) {}
    token = null; setDirty(false); showLogin();
  });
  $("saveBtn").addEventListener("click", save);

  // ---------- Sidebar ----------
  function hasContent(w) { return !!(w.title || w.text || w.hotspots.length || w.inspirations.length); }
  function renderSide() {
    var h = '<h4>Exhibition</h4><button type="button" class="text-only" data-k="exhibition"><span>Exhibition details</span></button>';
    data.pages = data.pages || { concept: { title: "The concept", text: "", image: "" }, about: { title: "", text: "", image: "" } };
    h += "<h4>Pages</h4>" + [["concept", "The concept"], ["about", "The photographer"]].map(function (x) {
      var pg = data.pages[x[0]];
      return '<button type="button" class="text-only" data-k="page" data-id="' + x[0] + '"><span>' + x[1] + "</span>" +
        (pg.text ? '<span class="has" title="Has content"></span>' : "") + "</button>";
    }).join("");
    h += "<h4>Series</h4>" + data.series.map(function (s) {
      return '<button type="button" class="text-only" data-k="series" data-id="' + s.id + '"><span>' + esc(s.name) + "</span>" +
        (s.text || s.inspirations.length ? '<span class="has" title="Has content"></span>' : "") + "</button>";
    }).join("");
    h += "<h4>Photos</h4>" + data.works.map(function (w) {
      return '<button type="button" data-k="work" data-id="' + w.id + '"><img src="' + esc(w.thumb) + '" alt=""><span><span class="n">' + w.number + "</span> · " +
        esc(w.title || seriesName(w.series)) + "</span>" + (hasContent(w) ? '<span class="has" title="Has content"></span>' : "") + "</button>";
    }).join("");
    $("side").innerHTML = h;
    markCurrent();
  }
  function markCurrent() {
    [].forEach.call($("side").querySelectorAll("button"), function (b) {
      var on = b.getAttribute("data-k") === current.kind && (b.getAttribute("data-id") || null) == (current.id || null);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
  }
  $("side").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    current = { kind: b.getAttribute("data-k"), id: b.getAttribute("data-id") };
    selHs = null; markCurrent(); renderPane(); window.scrollTo(0, 0);
  });
  function seriesName(id) { var s = data.series.filter(function (x) { return x.id === id; })[0]; return s ? s.name : ""; }

  // ---------- Field helpers ----------
  // Inputs carry data-path like "works.3.title"; every edit writes straight into `data`.
  function field(label, path, value, opts) {
    opts = opts || {};
    var id = "f-" + path.replace(/\./g, "-");
    var input = opts.multi
      ? '<textarea id="' + id + '" data-path="' + path + '" rows="' + (opts.rows || 6) + '">' + esc(value) + "</textarea>"
      : '<input type="text" id="' + id + '" data-path="' + path + '" value="' + esc(value) + '">';
    return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" + input +
      (opts.hint ? '<span class="hint">' + esc(opts.hint) + "</span>" : "") + "</div>";
  }
  function setPath(path, value) {
    var parts = path.split("."), o = data;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  $("pane").addEventListener("input", function (e) {
    var p = e.target.getAttribute("data-path");
    if (!p) return;
    setPath(p, e.target.value);
    setDirty(true);
    if (/^works\.\d+\.hotspots\.\d+\.title$/.test(p) || /\.title$/.test(p) || /\.name$/.test(p)) renderSideLite();
  });
  var sideTimer = null;
  function renderSideLite() { clearTimeout(sideTimer); sideTimer = setTimeout(renderSide, 400); }

  // ---------- Inspirations ----------
  function inspEditor(base, list) {
    var h = '<div class="cards">' + (list.length ? "" : '<p class="empty">No inspirations yet.</p>') +
      list.map(function (i, k) {
        var p = base + "." + k, img = i.image ? (previews[i.image] || i.image) : "";
        return '<div class="card insp-card"><div class="insp-img"><div class="ph">' + (img ? '<img src="' + esc(img) + '" alt="">' : "No image") + "</div>" +
          '<label class="ghost small" style="text-align:center">Choose image<input type="file" accept="image/*" data-upload="' + p + '" hidden></label>' +
          (i.image ? '<button type="button" class="ghost small danger" data-clear-img="' + p + '">Remove image</button>' : "") + "</div><div>" +
          '<div class="card-head"><strong>Inspiration ' + (k + 1) + '</strong><span class="sp"><button type="button" class="ghost small danger" data-del="' + base + '" data-i="' + k + '">Delete</button></span></div>' +
          field("Title of the work", p + ".title", i.title) +
          '<div class="row">' + field("Artist", p + ".artist", i.artist) + field("Date", p + ".date", i.date) + field("Where it is", p + ".where", i.where) + "</div>" +
          field("Short text (on the card)", p + ".text", i.text, { multi: true, rows: 4, hint: "What the photograph takes from this work, in a sentence or two." }) +
          field("Longer explanation (in the large view)", p + ".more", i.more, { multi: true, rows: 6, hint: "Shown when visitors open the inspiration. Leave an empty line between paragraphs." }) +
          field("Image credit", p + ".credit", i.credit, { hint: "Title, Author, Source, Licence. Example: Fight with Cudgels, Francisco de Goya, via Wikimedia Commons, public domain." }) +
          "</div></div>";
      }).join("") + "</div>" +
      '<p><button type="button" class="ghost" data-add-insp="' + base + '">Add inspiration</button></p>';
    return h;
  }
  function getPath(path) { return path.split(".").reduce(function (o, k) { return o[k]; }, data); }

  function resizeToJpeg(file, max) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var r = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { rej(new Error("Could not read that image")); };
      img.src = url;
    });
  }

  $("pane").addEventListener("change", function (e) {
    var p = e.target.getAttribute("data-upload");
    if (!p || !e.target.files[0]) return;
    var f = e.target.files[0];
    resizeToJpeg(f, 1400).then(function (dataUrl) {
      var slug = f.name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
      var path = "img/insp/" + slug + "-" + Date.now().toString(36) + ".jpg";
      uploads[path] = dataUrl.split(",")[1]; previews[path] = dataUrl;
      getPath(p).image = path;
      setDirty(true); renderPane();
    }).catch(function (err) { status(err.message, "bad"); });
  });

  $("pane").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-add-insp")) {
      getPath(t.getAttribute("data-add-insp")).push({ title: "", artist: "", date: "", where: "", text: "", credit: "", image: "" });
      setDirty(true); renderPane(); renderSide();
    } else if (t.hasAttribute("data-del")) {
      if (!window.confirm("Delete this item?")) return;
      getPath(t.getAttribute("data-del")).splice(+t.getAttribute("data-i"), 1);
      if (t.getAttribute("data-del").indexOf("hotspots") > -1) selHs = null;
      setDirty(true); renderPane(); renderSide();
    } else if (t.hasAttribute("data-clear-img")) {
      getPath(t.getAttribute("data-clear-img")).image = ""; setDirty(true); renderPane();
    } else if (t.hasAttribute("data-move")) {
      var arr = getPath(t.getAttribute("data-move")), i = +t.getAttribute("data-i"), j = i + (+t.getAttribute("data-d"));
      if (j < 0 || j >= arr.length) return;
      var x = arr[i]; arr[i] = arr[j]; arr[j] = x; selHs = j; setDirty(true); renderPane();
    }
  });

  // ---------- Panes ----------
  function renderPane() {
    var h = "";
    if (current.kind === "exhibition") {
      var e = data.exhibition;
      h = "<h1>Exhibition details</h1><p class=\"sub\">Shown on the home page and in the footer.</p>" +
        field("Artist", "exhibition.artist", e.artist) + field("Exhibition title", "exhibition.title", e.title) +
        field("Venue", "exhibition.venue", e.venue);
    } else if (current.kind === "page") {
      var pk = current.id, pg = data.pages[pk], pb = "pages." + pk, pimg = pg.image ? (previews[pg.image] || pg.image) : "";
      h = "<h1>" + (pk === "about" ? "The photographer" : "The concept") + '</h1><p class="sub">A page in the main menu of the guide.</p>' +
        field("Page title", pb + ".title", pg.title) +
        field("Text", pb + ".text", pg.text, { multi: true, rows: 14, hint: "Leave an empty line between paragraphs." }) +
        '<div class="section"><h2>Image</h2><p class="help">Optional. Shown beside the text' + (pk === "about" ? ", for example a portrait of Gabriel." : ".") + '</p><div class="insp-img"><div class="ph">' +
        (pimg ? '<img src="' + esc(pimg) + '" alt="">' : "No image") + '</div><label class="ghost small" style="text-align:center">Choose image<input type="file" accept="image/*" data-upload="' + pb + '" hidden></label>' +
        (pg.image ? '<button type="button" class="ghost small danger" data-clear-img="' + pb + '">Remove image</button>' : "") + "</div></div>";
    } else if (current.kind === "series") {
      var si = indexOf(data.series, current.id), s = data.series[si];
      h = "<h1>" + esc(s.name) + '</h1><p class="sub">Series page. Inspirations here also show on every photo in the series that has none of its own.</p>' +
        field("Series name", "series." + si + ".name", s.name) +
        field("Series text", "series." + si + ".text", s.text, { multi: true, hint: "Leave an empty line between paragraphs." }) +
        '<div class="section"><h2>Inspired by</h2>' + inspEditor("series." + si + ".inspirations", s.inspirations) + "</div>";
    } else {
      var wi = indexOf(data.works, current.id), w = data.works[wi], b = "works." + wi;
      h = "<h1>No. " + w.number + " · " + esc(seriesName(w.series)) + '</h1><p class="sub">File: ' + esc(w.file) + "</p>" +
        field("Title", b + ".title", w.title, { hint: "Optional. If empty, the series name is shown." }) +
        field("Text", b + ".text", w.text, { multi: true, rows: 8, hint: "Leave an empty line between paragraphs." }) +
        '<div class="section"><h2>Details in the photo</h2><p class="help">Tap or click the photo to add a dot where an object is. Drag a dot to move it. Each dot opens its title and text when visitors tap it in full screen.</p>' +
        '<div class="placer-wrap"><div class="placer" id="placer"><img src="' + esc(w.src) + '" alt="" draggable="false">' +
        w.hotspots.map(function (p, i) {
          return '<span class="pdot' + (selHs === i ? " sel" : "") + '" data-i="' + i + '" style="left:' + p.x + "%;top:" + p.y + '%">' + (i + 1) + "</span>";
        }).join("") + '</div><div class="cards">' +
        (w.hotspots.length ? "" : '<p class="empty">No details yet. Click the photo to add the first one.</p>') +
        w.hotspots.map(function (p, i) {
          var hp = b + ".hotspots." + i;
          return '<div class="card' + (selHs === i ? " sel" : "") + '" data-card="' + i + '"><div class="card-head"><span class="badge">' + (i + 1) + "</span>" +
            '<span class="sp"><button type="button" class="ghost small" data-move="' + b + '.hotspots" data-i="' + i + '" data-d="-1" aria-label="Move up">&#8593;</button>' +
            '<button type="button" class="ghost small" data-move="' + b + '.hotspots" data-i="' + i + '" data-d="1" aria-label="Move down">&#8595;</button>' +
            '<button type="button" class="ghost small danger" data-del="' + b + '.hotspots" data-i="' + i + '">Delete</button></span></div>' +
            field("Title", hp + ".title", p.title) + field("Text", hp + ".text", p.text, { multi: true, rows: 4 }) + "</div>";
        }).join("") + "</div></div></div>" +
        '<div class="section"><h2>Inspired by</h2><p class="help">Only for this photo. If empty, the series inspirations are shown.</p>' +
        inspEditor(b + ".inspirations", w.inspirations) + "</div>";
    }
    $("pane").innerHTML = h;
    if (current.kind === "work") bindPlacer(data.works[indexOf(data.works, current.id)]);
  }
  function indexOf(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i; return -1; }

  function bindPlacer(w) {
    var pl = $("placer"), drag = null, moved = false;
    function pct(e) {
      var r = pl.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 1000) / 10)),
        y: Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10))
      };
    }
    pl.addEventListener("pointerdown", function (e) {
      var d = e.target.closest(".pdot");
      if (d) { drag = +d.getAttribute("data-i"); moved = false; pl.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    pl.addEventListener("pointermove", function (e) {
      if (drag == null) return;
      var p = pct(e); moved = true;
      w.hotspots[drag].x = p.x; w.hotspots[drag].y = p.y;
      var el = pl.querySelector('.pdot[data-i="' + drag + '"]'); el.style.left = p.x + "%"; el.style.top = p.y + "%";
    });
    pl.addEventListener("pointerup", function (e) {
      if (drag != null) {
        var i = drag; drag = null;
        if (moved) setDirty(true);
        selHs = i; renderPane(); focusCard(i);
        return;
      }
      var p = pct(e);
      w.hotspots.push({ x: p.x, y: p.y, title: "", text: "" });
      selHs = w.hotspots.length - 1; setDirty(true); renderPane(); renderSide(); focusCard(selHs);
    });
  }
  function focusCard(i) {
    var c = document.querySelector('[data-card="' + i + '"] input');
    if (c) { c.focus({ preventScroll: true }); c.closest(".card").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  // ---------- Start ----------
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  if (token) startApp(); else showLogin();
})();
