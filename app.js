(function () {
  "use strict";
  var G = window.GUIDE, T = G.ui;
  // Preview builds load preview.js, which draws grey layout blocks where supplied content will go.
  // The real site never loads it, so an empty field simply hides its section.
  var P = window.PREVIEW || null;
  var $ = function (id) { return document.getElementById(id); };
  var view = $("view");
  var bySeries = {}, byId = {}, byNum = {};
  G.series.forEach(function (s) { bySeries[s.id] = s; });
  G.works.forEach(function (w) { byId[w.id] = w; byNum[w.number] = w; });
  var worksIn = function (sid) { return G.works.filter(function (w) { return w.series === sid; }); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function paras(s) {
    return String(s).split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p.trim()) + "</p>"; }).join("");
  }
  function sk(widths) {
    return '<div class="sk" aria-hidden="true">' + widths.map(function (w) {
      return '<span style="width:' + w + '%"></span>';
    }).join("") + "</div>";
  }
  function hotspotsOf(w) {
    if (w.hotspots.length) return w.hotspots;
    if (P && P.hotspots[w.id]) return P.hotspots[w.id].map(function (p) { return { x: p.x, y: p.y, preview: true }; });
    return [];
  }
  function inspirationsOf(w) {
    var s = bySeries[w.series];
    return w.inspirations.length ? w.inspirations : s.inspirations;
  }
  function workName(w) { return w.title || bySeries[w.series].name; }

  function tile(w) {
    return '<a class="tile" href="#work-' + w.id + '">' +
      '<div class="ph"><img loading="lazy" src="' + w.thumb + '" alt="' + esc(workName(w)) + ", No. " + w.number + '" width="480" height="640">' +
      '<span class="num">' + w.number + "</span>" +
      (hotspotsOf(w).length ? '<span class="dots"></span>' : "") +
      "</div>" + (w.title ? '<span class="t">' + esc(w.title) + "</span>" : "") + "</a>";
  }

  function inspirationCards(list) {
    if (list.length) {
      return list.map(function (i) {
        return '<figure class="insp">' + (i.image ? '<img src="' + esc(i.image) + '" alt="">' : "") +
          "<figcaption><h3>" + esc(i.title) + '</h3><div class="meta">' +
          esc([i.artist, i.date, i.where].filter(Boolean).join(", ")) + "</div>" +
          (i.text ? '<div class="note">' + paras(i.text) + "</div>" : "") +
          (i.credit ? '<p class="credit">' + esc(i.credit) + "</p>" : "") + "</figcaption></figure>";
      }).join("");
    }
    if (P) return '<figure class="insp"><div class="slot"></div><figcaption>' + sk([70, 45]) + sk([100, 92, 60]) + "</figcaption></figure>";
    return "";
  }

  function footer() {
    return '<footer class="foot"><span>' + esc(G.exhibition.artist) + " · " + esc(G.exhibition.title) + " · " +
      esc(G.exhibition.venue) + '</span><a href="#credits">' + esc(T.credits) + "</a></footer>";
  }

  function home() {
    var e = G.exhibition;
    var h = '<section class="hero"><span class="label">' + esc(e.artist) + " · " + esc(e.venue) + "</span>" +
      "<h1>Traces <em>of</em> Pain</h1>" +
      '<button type="button" class="big-jump" data-jump>' + esc(T.goTo) + '<small>' + esc(T.goToHint) + "</small></button></section>";
    h += '<div class="section-head"><span class="label">' + esc(T.series) + "</span></div>";
    h += '<div class="series-list">' + G.series.map(function (s) {
      var ws = worksIn(s.id), c = ws[0];
      return '<a class="series-card" href="#series-' + s.id + '"><img src="' + c.thumb + '" alt="">' +
        '<div class="cap"><span class="label">No. ' + ws[0].number + "–" + ws[ws.length - 1].number + " · " +
        ws.length + " " + esc(T.works) + "</span><h2>" + esc(s.name) + "</h2></div></a>";
    }).join("") + "</div>";
    h += '<div class="section-head"><span class="label">' + esc(T.allWorks) + " · " + G.works.length + "</span></div>";
    h += '<div class="grid">' + G.works.map(tile).join("") + "</div>";
    return h + footer();
  }

  function series(s) {
    var ws = worksIn(s.id);
    var insp = inspirationCards(s.inspirations);
    return '<a class="back" href="#">' + esc(T.back) + "</a>" +
      '<section class="series-head"><div><span class="label">No. ' + ws[0].number + "–" + ws[ws.length - 1].number +
      " · " + ws.length + " " + esc(T.works) + "</span><h1>" + esc(s.name) + "</h1>" +
      (s.text ? '<div class="intro">' + paras(s.text) + "</div>" : P ? sk([96, 88, 52]) : "") + "</div>" +
      (insp ? '<div><span class="label">' + esc(T.inspiredBy) + "</span>" + insp + "</div>" : "") + "</section>" +
      '<div class="grid">' + ws.map(tile).join("") + "</div>" + footer();
  }

  // The tablet view: a visitor stands at the print. A small thumbnail confirms the photo;
  // the reading content gets the space.
  function work(w) {
    var s = bySeries[w.series];
    var prev = byNum[w.number - 1], next = byNum[w.number + 1];
    var hs = hotspotsOf(w), insp = inspirationCards(inspirationsOf(w));
    var h = '<article class="work">';
    h += '<aside class="confirm"><button class="thumb" type="button" data-open="' + w.id + '" aria-label="' + esc(T.fullscreen) + '">' +
      '<img src="' + w.thumb + '" alt="' + esc(workName(w)) + '"><span class="fs-ic" aria-hidden="true"></span></button>' +
      '<div class="confirm-meta"><span class="no">' + w.number + '</span><span class="label">' + esc(s.name) + "</span></div>" +
      '<button class="explore" type="button" data-open="' + w.id + '">' + esc(hs.length ? T.explore : T.fullscreen) + "</button>" +
      qrBlock(w) + "</aside>";
    h += '<div class="read"><a class="back" href="#series-' + s.id + '">' + esc(s.name) + "</a>" +
      "<h1>" + esc(workName(w)) + "</h1>";
    if (w.text) h += '<div class="body">' + paras(w.text) + "</div>";
    else if (P) h += '<div class="body">' + sk([100, 97, 92, 99, 64]) + sk([98, 94, 40]) + "</div>";
    if (hs.length) {
      h += '<section class="block"><span class="label">' + esc(T.inThisPhoto) + '</span><ul class="hs-list">' +
        hs.map(function (p, i) {
          return '<li><button type="button" data-open="' + w.id + '" data-hs="' + i + '"><span class="n">' + (i + 1) + "</span>" +
            (p.preview ? sk([40 + (i * 17) % 35]) : "<span>" + esc(p.title) + "</span>") + '<span class="go" aria-hidden="true">&#8599;</span></button></li>';
        }).join("") + "</ul></section>";
    }
    if (insp) h += '<section class="block"><span class="label">' + esc(T.inspiredBy) + "</span>" + insp + "</section>";
    h += "</div></article>";
    h += '<nav class="pager">' +
      (prev ? '<a href="#work-' + prev.id + '"><img src="' + prev.thumb + '" alt=""><span><span class="label">' + esc(T.prev) + "</span>No. " + prev.number + "</span></a>" : "<span></span>") +
      '<button type="button" class="pager-mid" data-jump>' + w.number + " / " + G.works.length + "</button>" +
      (next ? '<a class="next" href="#work-' + next.id + '"><span><span class="label">' + esc(T.next) + "</span>No. " + next.number + '</span><img src="' + next.thumb + '" alt=""></a>' : "<span></span>") +
      "</nav>";
    return h;
  }

  // QR code that opens this exact photo page on a visitor's phone. While the preview password is on,
  // the code carries the key so visitors skip the password screen.
  function qrBlock(w) {
    if (typeof window.qrcode !== "function") return "";
    var url = location.origin + location.pathname, key = null;
    try { key = localStorage.getItem("tp-key"); } catch (e) {}
    if (key) url += "?k=" + encodeURIComponent(key);
    url += "#work-" + w.id;
    var q = window.qrcode(0, "M"); q.addData(url); q.make();
    // Light modules drawn on the dark page (an inverted code), so it sits quietly in the layout.
    var n = q.getModuleCount(), m = 2, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + (c + m) + " " + (r + m) + "h1v1h-1z";
    var svg = '<svg viewBox="0 0 ' + (n + 2 * m) + " " + (n + 2 * m) + '" shape-rendering="crispEdges" aria-hidden="true"><path d="' + d + '"/></svg>';
    return '<figure class="qr">' + svg + "<figcaption>" + esc(T.openOnPhone || "Open on your phone") + "</figcaption></figure>";
  }

  function page(key) {
    var pg = (G.pages || {})[key] || {};
    var img = pg.image ? '<img class="page-img" src="' + esc(pg.image) + '" alt="">' : "";
    return '<a class="back" href="#">' + esc(T.back) + '</a><article class="page' + (img ? " has-img" : "") + '">' + img +
      '<div class="page-read"><h1>' + esc(pg.title || "") + "</h1>" +
      (pg.text ? '<div class="body">' + paras(pg.text) + "</div>" : P ? '<div class="body">' + sk([100, 96, 92, 98, 60]) + sk([97, 94, 88, 45]) + "</div>" : "") +
      "</div></article>" + footer();
  }

  function credits() {
    var all = [];
    G.series.forEach(function (s) { all = all.concat(s.inspirations); });
    G.works.forEach(function (w) { all = all.concat(w.inspirations); });
    return '<a class="back" href="#">' + esc(T.back) + '</a><section class="series-head"><div><h1>' + esc(T.credits) +
      '</h1><p class="intro">' + esc(T.creditsIntro) + '</p></div></section><ul class="credits-list">' +
      all.map(function (i) { return "<li><strong>" + esc(i.title) + "</strong><br>" + esc(i.credit) + "</li>"; }).join("") +
      "<li>" + esc(T.copyright) + "</li></ul>" + footer();
  }

  // ---------- Router (plain #name hashes) ----------
  function route() {
    var h = location.hash.replace(/^#/, ""), m, html;
    closeFs();
    document.body.classList.remove("on-work");
    if ((m = h.match(/^series-(.+)$/)) && bySeries[m[1]]) html = series(bySeries[m[1]]);
    else if ((m = h.match(/^work-(.+)$/)) && byId[m[1]]) { html = work(byId[m[1]]); document.body.classList.add("on-work"); }
    else if (h === "credits") html = credits();
    else if (h === "concept" || h === "about") html = page(h);
    else html = home();
    view.innerHTML = html;
    [].forEach.call(document.querySelectorAll(".menu a"), function (a) {
      var on = a.getAttribute("href") === "#" + h || (a.getAttribute("href") === "#" && (h === "" || /^(series|work)-/.test(h)));
      a.setAttribute("aria-current", on ? "page" : "false");
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  view.addEventListener("click", function (e) {
    if (e.target.closest("[data-jump]")) { openJump(); return; }
    var b = e.target.closest("[data-open]");
    if (!b) return;
    var hs = b.getAttribute("data-hs");
    openFs(byId[b.getAttribute("data-open")], hs == null ? null : +hs);
  });

  // ---------- Fullscreen viewer with hotspots ----------
  var fs = $("fs"), fsImg = $("fsImg"), fsFrame = $("fsFrame"), fsDots = $("fsDots"), fsStage = $("fsStage");
  var sheet = $("sheet"), cur = null, curHs = [], dotsOn = true;

  function fit() {
    if (!cur) return;
    var bw = fsStage.clientWidth, bh = fsStage.clientHeight, r = cur.w / cur.h;
    var w = Math.min(bw, bh * r), h = w / r;
    fsFrame.style.width = w + "px"; fsFrame.style.height = h + "px";
    fsImg.style.width = w + "px"; fsImg.style.height = h + "px";
  }
  window.addEventListener("resize", fit);

  function openFs(w, hs) {
    cur = w; curHs = hotspotsOf(w); fs.hidden = false; document.body.style.overflow = "hidden";
    fsImg.src = w.src; fsImg.alt = workName(w);
    $("fsCount").textContent = "No. " + w.number + " / " + G.works.length;
    fsDots.innerHTML = curHs.map(function (p, i) {
      return '<button class="dot" type="button" data-i="' + i + '" style="left:' + p.x + "%;top:" + p.y +
        '%" aria-label="' + esc(p.title || String(i + 1)) + '"><span>' + (i + 1) + "</span></button>";
    }).join("");
    var has = curHs.length > 0;
    $("fsToggle").hidden = !has;
    $("fsHint").textContent = has ? T.tapHint : "";
    setDots(true); hideSheet(); fit();
    if (hs != null) showSheet(hs);
    $("fsClose").focus({ preventScroll: true });
  }
  function closeFs() {
    if (fs.hidden) return;
    fs.hidden = true; document.body.style.overflow = ""; cur = null;
  }
  function setDots(on) {
    dotsOn = on;
    fsDots.classList.toggle("off", !on);
    $("fsToggle").setAttribute("aria-pressed", on ? "true" : "false");
    $("fsToggle").textContent = on ? T.hideDetails : T.showDetails;
    if (!on) hideSheet();
  }
  function showSheet(i) {
    var p = curHs[i];
    if (p.preview) { $("sheetTitle").innerHTML = sk([55]); $("sheetText").innerHTML = sk([100, 94, 70]); }
    else { $("sheetTitle").textContent = p.title; $("sheetText").innerHTML = paras(p.text || ""); }
    sheet.hidden = false;
    [].forEach.call(fsDots.children, function (d, k) { d.classList.toggle("active", k === i); });
  }
  function hideSheet() {
    sheet.hidden = true;
    [].forEach.call(fsDots.children, function (d) { d.classList.remove("active"); });
  }
  function step(d) {
    if (!cur) return;
    var n = byNum[cur.number + d];
    if (!n) return;
    closeFs(); location.hash = "work-" + n.id; openFs(n, null);
  }
  fsDots.addEventListener("click", function (e) {
    var d = e.target.closest(".dot");
    if (d) { e.stopPropagation(); showSheet(+d.getAttribute("data-i")); }
  });
  fsStage.addEventListener("click", function (e) { if (!e.target.closest(".dot")) hideSheet(); });
  $("fsToggle").addEventListener("click", function () { setDots(!dotsOn); });
  $("fsClose").addEventListener("click", closeFs);
  $("sheetClose").addEventListener("click", hideSheet);
  $("fsPrev").addEventListener("click", function () { step(-1); });
  $("fsNext").addEventListener("click", function () { step(1); });

  var sx = null, sy = null;
  fsStage.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  fsStage.addEventListener("touchend", function (e) {
    if (sx == null) return;
    var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    sx = null;
  });

  // ---------- Go to number (for wall labels) ----------
  var jump = $("jump"), jin = $("jumpInput");
  $("jumpTitle").textContent = T.goTo;
  $("jumpHint").textContent = T.goToHint + " (1–" + G.works.length + ")";
  $("keypad").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "go"].map(function (k) {
    return '<button type="button" data-k="' + k + '"' + (k === "go" ? ' class="go"' : "") + ">" +
      (k === "go" ? esc(T.go) : k === "C" ? "&#9003;" : k) + "</button>";
  }).join("");
  function openJump() {
    closeFs(); jump.hidden = false; jin.value = ""; $("jumpErr").textContent = "";
    if (!matchMedia("(pointer: coarse)").matches) jin.focus();
  }
  function closeJump() { jump.hidden = true; }
  function doJump() {
    var w = byNum[parseInt(jin.value, 10)];
    if (!w) { $("jumpErr").textContent = T.notFound; return; }
    closeJump(); location.hash = "work-" + w.id;
  }
  $("jumpBtn").addEventListener("click", openJump);
  $("keypad").addEventListener("click", function (e) {
    var k = e.target.closest("button"); if (!k) return;
    k = k.getAttribute("data-k");
    if (k === "go") doJump();
    else if (k === "C") jin.value = jin.value.slice(0, -1);
    else if (jin.value.length < 3) jin.value += k;
    $("jumpErr").textContent = "";
  });
  $("jumpForm").addEventListener("submit", function (e) { e.preventDefault(); doJump(); });
  jump.addEventListener("click", function (e) { if (e.target === jump) closeJump(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (!jump.hidden) closeJump(); else if (!sheet.hidden) hideSheet(); else closeFs(); }
    if (!fs.hidden && e.key === "ArrowRight") step(1);
    if (!fs.hidden && e.key === "ArrowLeft") step(-1);
  });

  // Menu labels come from the editable texts.
  [].forEach.call(document.querySelectorAll(".menu a[data-ui]"), function (a) {
    var k = a.getAttribute("data-ui"); if (T[k]) a.textContent = T[k];
  });

  route();
})();
