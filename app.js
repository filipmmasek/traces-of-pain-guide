(function () {
  "use strict";
  // Texts in other languages live in GUIDE.translations.<lang>, laid over the English base.
  // Anything not translated falls back to English. Arrays of items with an id are keyed by id.
  var RAW = window.GUIDE, G, T, LANG;
  function overlay(base, tr) {
    if (tr == null || tr === "") return base;
    if (typeof base === "string" || base == null) return typeof tr === "string" ? tr : base;
    if (Array.isArray(base)) {
      if (Array.isArray(tr)) return base.map(function (b, i) { return overlay(b, tr[i]); });
      return base.map(function (b) { return b && b.id && tr[b.id] ? overlay(b, tr[b.id]) : b; });
    }
    if (typeof base === "object") {
      var o = {};
      Object.keys(base).forEach(function (k) { o[k] = overlay(base[k], tr[k]); });
      Object.keys(tr).forEach(function (k) { if (!(k in base)) o[k] = tr[k]; });
      return o;
    }
    return base;
  }
  // Preview builds load preview.js, which draws grey layout blocks where supplied content will go.
  // The real site never loads it, so an empty field simply hides its section.
  var P = window.PREVIEW || null;
  var $ = function (id) { return document.getElementById(id); };
  var view = $("view");
  var byProject, byId, byNum;
  function setLang(l) {
    var langs = (RAW.languages || []).map(function (x) { return x.code; });
    LANG = langs.indexOf(l) > -1 ? l : "en";
    G = LANG === "en" ? RAW : overlay(RAW, (RAW.translations || {})[LANG]);
    T = G.ui;
    byProject = {}; byId = {}; byNum = {};
    G.projects.forEach(function (p) { byProject[p.id] = p; });
    G.works.forEach(function (w) { byId[w.id] = w; byNum[w.number] = w; });
    document.documentElement.lang = LANG;
    try { localStorage.setItem("tp-lang", LANG); } catch (e) {}
  }
  var savedLang = null;
  try { savedLang = localStorage.getItem("tp-lang"); } catch (e) {}
  setLang(savedLang || "en");
  var worksIn = function (pid) { return G.works.filter(function (w) { return w.project === pid; }); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Light markup from the admin: *italic*, **bold**, and a paragraph starting with "## " is a subheading.
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  }
  function paras(s) {
    return String(s).split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p) {
      p = p.trim();
      if (/^## /.test(p)) return "<h2>" + inline(p.slice(3)) + "</h2>";
      return "<p>" + inline(p).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  // Long texts: the first paragraph shows, the rest opens with "Read more".
  function leadAndMore(s) {
    var ps = String(s || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); });
    if (!ps.length) return "";
    var first = paras(ps[0]), rest = ps.slice(1).join("\n\n");
    if (!rest) return '<div class="body">' + first + "</div>";
    return '<div class="body">' + first + '<div class="more-text" hidden>' + paras(rest) + "</div>" +
      '<button type="button" class="read-more" data-more aria-expanded="false">' + esc(T.readFull) + "</button></div>";
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
    var p = byProject[w.project];
    return w.inspirations.length ? w.inspirations : p.inspirations;
  }
  function workName(w) { return w.title || byProject[w.project].name; }

  function tile(w) {
    return '<a class="tile" href="#work-' + w.id + '">' +
      '<div class="ph"><img loading="lazy" src="' + w.thumb + '" alt="' + esc(workName(w)) + ", No. " + w.number + '" width="480" height="640">' +
      '<span class="num">' + w.number + "</span>" +
      (hotspotsOf(w).length ? '<span class="dots"></span>' : "") +
      "</div>" + (w.title ? '<span class="t">' + esc(w.title) + "</span>" : "") + "</a>";
  }

  var INSP = []; // inspirations on the current page, for the large view
  function inspirationCards(list) {
    if (list.length) {
      return list.map(function (i) {
        var k = INSP.push(i) - 1;
        return '<button type="button" class="insp" data-insp="' + k + '">' + (i.image ? '<img src="' + esc(i.image) + '" alt="">' : "") +
          '<span class="cap"><h3>' + esc(i.title) + '</h3><span class="meta">' +
          esc([i.artist, i.date, i.where].filter(Boolean).join(", ")) + "</span>" +
          (i.text ? '<span class="note">' + paras(i.text) + "</span>" : "") +
          '<span class="more-link">' + esc(T.readMore || "View larger") + " &#8599;&#65038;</span></span></button>";
      }).join("");
    }
    if (P) return '<figure class="insp"><div class="slot"></div><figcaption>' + sk([70, 45]) + sk([100, 92, 60]) + "</figcaption></figure>";
    return "";
  }

  function footer() {
    return '<footer class="foot"><span>' + esc(G.exhibition.artist) + " · " + esc(G.exhibition.title) + " · " +
      esc(G.exhibition.venue) + '</span><a href="#credits">' + esc(T.credits) + "</a></footer>";
  }

  function logo(cls, vb) {
    return '<svg class="' + cls + '" viewBox="' + vb + '" role="img" aria-label="Stopy bolesti / Huellas del dolor, Gabriel Matula"><use href="#logo-art"/></svg>';
  }
  function projectTile(p) {
    var ws = worksIn(p.id), c = ws[0];
    return '<a class="ptile' + (c ? "" : " empty") + '" href="#project-' + p.id + '">' +
      (c ? '<img loading="lazy" src="' + c.thumb + '" alt="">' : "") +
      '<span class="cap"><span class="label">' + (ws.length ? ws.length + " " + esc(T.works) : esc(T.comingSoon)) + "</span>" +
      "<h2>" + esc(p.name) + "</h2></span></a>";
  }
  function home() {
    var e = G.exhibition, con = (G.pages || {}).concept || {};
    var lead = String(con.text || "").split(/\n\s*\n/)[0] || "";
    var h = '<section class="hero">' +
      (LANG === "en" ? '<span class="label">' + esc(T.exhibitionLabel) + " · " + esc(e.title) + "</span>" : "") +
      logo("logo-hero", "150 140 890 270") +
      '<p class="hero-meta">' + esc(e.dates || "") + (e.dates && e.venue ? " · " : "") + esc(e.venue) + "</p>" +
      (lead ? '<div class="hero-lead">' + paras(lead) + '<a class="text-link" href="#concept">' + esc(T.aboutExhibition) + "</a></div>" : "") +
      "</section>";
    h += '<div class="section-head"><h2 class="sc">' + esc(T.projects) + '</h2><span class="label">' + G.projects.length + "</span></div>";
    h += '<div class="ptiles">' + G.projects.map(projectTile).join("") + "</div>";
    h += '<div class="section-head"><h2 class="sc">' + esc(T.allWorks) + '</h2><span class="label">' + G.works.length + "</span></div>";
    h += '<div class="grid">' + G.works.map(tile).join("") + "</div>";
    return h + footer();
  }

  function project(p) {
    var ws = worksIn(p.id);
    var insp = inspirationCards(p.inspirations);
    var story = p.story && (G.pages || {})[p.story];
    var range = ws.length ? "No. " + ws[0].number + "–" + ws[ws.length - 1].number + " · " + ws.length + " " + esc(T.works) : esc(T.comingSoon);
    return '<a class="back" href="#">' + esc(T.back) + "</a>" +
      '<section class="project-head"><div class="project-read"><span class="label">' + range + "</span><h1 class=\"sc\">" + esc(p.name) + "</h1>" +
      (p.subtitle ? '<p class="subtitle">' + inline(p.subtitle) + "</p>" : "") +
      (p.quote ? '<blockquote class="epigraph"><p>' + inline(p.quote) + "</p>" + (p.quoteBy ? "<cite>" + esc(p.quoteBy) + "</cite>" : "") + "</blockquote>" : "") +
      leadAndMore(p.text) +
      (story ? '<a class="text-link" href="#' + esc(p.story) + '">' + esc(story.title) + "</a>" : "") + "</div>" +
      (insp ? '<div><span class="label">' + esc(T.inspiredBy) + "</span>" + insp + "</div>" : "") + "</section>" +
      (ws.length ? '<div class="grid">' + ws.map(tile).join("") + "</div>" : '<p class="coming">' + esc(T.comingSoon) + "</p>") + footer();
  }

  // The tablet view: a visitor stands at the print. A small thumbnail confirms the photo;
  // the reading content gets the space.
  function work(w) {
    var s = byProject[w.project];
    var prev = byNum[w.number - 1], next = byNum[w.number + 1];
    var hs = hotspotsOf(w), insp = inspirationCards(inspirationsOf(w));
    var h = '<article class="work">';
    h += '<aside class="confirm"><button class="thumb" type="button" data-open="' + w.id + '" aria-label="' + esc(T.fullscreen) + '">' +
      '<img src="' + w.thumb + '" alt="' + esc(workName(w)) + '"><span class="fs-ic" aria-hidden="true"></span></button>' +
      '<div class="confirm-meta"><span class="no">' + w.number + '</span><span class="label">' + esc(s.name) + "</span></div>" +
      '<button class="explore" type="button" data-open="' + w.id + '">' + esc(hs.length ? T.explore : T.fullscreen) + "</button>" +
      qrBlock(w) + "</aside>";
    h += '<div class="read"><a class="back" href="#project-' + s.id + '">' + esc(s.name) + "</a>" +
      "<h1>" + esc(workName(w)) + "</h1>";
    if (w.text) h += '<div class="body">' + paras(w.text) + "</div>";
    else if (P) h += '<div class="body">' + sk([100, 97, 92, 99, 64]) + sk([98, 94, 40]) + "</div>";
    if (hs.length) {
      h += '<section class="block"><span class="label">' + esc(T.inThisPhoto) + '</span><ul class="hs-list">' +
        hs.map(function (p, i) {
          return '<li><button type="button" data-open="' + w.id + '" data-hs="' + i + '"><span class="n">' + (i + 1) + "</span>" +
            (p.preview ? sk([40 + (i * 17) % 35]) : "<span>" + esc(p.title) + "</span>") + "</button></li>";
        }).join("") + "</ul></section>";
    }
    if (insp) h += '<section class="block"><span class="label">' + esc(T.inspiredBy) + "</span>" + insp + "</section>";
    h += "</div></article>";
    h += '<nav class="pager">' +
      (prev ? '<a href="#work-' + prev.id + '"><img src="' + prev.thumb + '" alt=""><span><span class="label">' + esc(T.prev) + "</span>No. " + prev.number + "</span></a>" : "<span></span>") +
      '<span class="pager-mid">' + w.number + " / " + G.works.length + "</span>" +
      (next ? '<a class="next" href="#work-' + next.id + '"><span><span class="label">' + esc(T.next) + "</span>No. " + next.number + '</span><img src="' + next.thumb + '" alt=""></a>' : "<span></span>") +
      "</nav>";
    return h;
  }

  // QR code that opens this exact photo page on a visitor's phone. While the preview password is on,
  // the code carries the key so visitors skip the password screen.
  function qrBlock(w) {
    if (typeof window.qrcode !== "function") return "";
    try { if (sessionStorage.getItem("tp-from-qr")) return ""; } catch (e) {}
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
      '<div class="page-read"><h1 class="sc">' + esc(pg.title || "") + "</h1>" +
      (pg.text ? '<div class="body">' + paras(pg.text) + "</div>" : P ? '<div class="body">' + sk([100, 96, 92, 98, 60]) + sk([97, 94, 88, 45]) + "</div>" : "") +
      "</div></article>" + footer();
  }

  function initials(name) {
    return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function collaborators() {
    var list = G.collaborators || [];
    return '<a class="back" href="#">' + esc(T.back) + '</a><section class="page-read collab-head"><h1 class="sc">' + esc(T.menuCollaborators || "Collaborators") + "</h1></section>" +
      '<ul class="collab-grid">' + list.map(function (c) {
        var inner = '<span class="ph">' + (c.image ? '<img loading="lazy" src="' + esc(c.image) + '" alt="">' : '<span class="mono">' + esc(initials(c.name)) + "</span>") + "</span>" +
          '<span class="role">' + esc(c.role) + '</span><span class="name">' + esc(c.name) + "</span>";
        return "<li>" + (c.link ? '<a class="collab" href="' + esc(c.link) + '" target="_blank" rel="noopener">' + inner + "</a>" : '<div class="collab">' + inner + "</div>") + "</li>";
      }).join("") + "</ul>" + footer();
  }

  function credits() {
    var all = [];
    G.projects.forEach(function (p) { all = all.concat(p.inspirations); });
    G.works.forEach(function (w) { all = all.concat(w.inspirations); });
    return '<a class="back" href="#">' + esc(T.back) + '</a><section class="project-head"><div><h1 class="sc">' + esc(T.credits) +
      '</h1><p class="intro">' + esc(T.creditsIntro) + '</p></div></section><ul class="credits-list">' +
      all.map(function (i) { return "<li><strong>" + esc(i.title) + "</strong><br>" + esc(i.credit) + "</li>"; }).join("") +
      "<li>" + esc(T.copyright) + "</li></ul>" + footer();
  }

  // ---------- Router (plain #name hashes) ----------
  function route() {
    var h = location.hash.replace(/^#/, ""), m, html;
    INSP = []; closeInsp();
    // Browsing from photo to photo while in full screen keeps full screen open.
    var keepFs = !fs.hidden && /^work-/.test(h) && byId[h.slice(5)];
    if (!keepFs) closeFs();
    document.body.classList.remove("on-work");
    if ((m = h.match(/^(?:project|series)-(.+)$/)) && byProject[m[1]]) html = project(byProject[m[1]]);
    else if ((m = h.match(/^work-(.+)$/)) && byId[m[1]]) { html = work(byId[m[1]]); document.body.classList.add("on-work"); }
    else if (h === "credits") html = credits();
    else if ((G.pages || {})[h]) html = page(h);
    else if (h === "collaborators") html = collaborators();
    else html = home();
    view.innerHTML = html;
    [].forEach.call(document.querySelectorAll(".menu a"), function (a) {
      var on = a.getAttribute("href") === "#" + h || (a.getAttribute("href") === "#" && (h === "" || /^(project|series|work)-/.test(h)));
      a.setAttribute("aria-current", on ? "page" : "false");
    });
    if (keepFs && (!cur || cur.id !== keepFs.id)) openFs(keepFs, null);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  view.addEventListener("click", function (e) {
    var mb = e.target.closest("[data-more]");
    if (mb) {
      var mt = mb.previousElementSibling, open = mt.hidden;
      mt.hidden = !open; mb.setAttribute("aria-expanded", open ? "true" : "false");
      mb.textContent = open ? T.readLess : T.readFull;
      return;
    }
    var ib = e.target.closest("[data-insp]");
    if (ib) { openInsp(INSP[+ib.getAttribute("data-insp")]); return; }
    var b = e.target.closest("[data-open]");
    if (!b) return;
    var hs = b.getAttribute("data-hs");
    openFs(byId[b.getAttribute("data-open")], hs == null ? null : +hs);
  });

  // ---------- Inspiration large view ----------
  var iv = $("inspView");
  function openInsp(i) {
    if (!i) return;
    $("ivImg").innerHTML = i.image ? '<img src="' + esc(i.image) + '" alt="' + esc(i.title) + '">' : "";
    iv.classList.toggle("no-img", !i.image);
    $("ivText").innerHTML = '<span class="label">' + esc(T.inspiredBy) + "</span><h2>" + esc(i.title) + '</h2><p class="meta">' +
      esc([i.artist, i.date, i.where].filter(Boolean).join(", ")) + "</p>" +
      (i.text ? '<div class="lead">' + paras(i.text) + "</div>" : "") +
      (i.more ? '<div class="more">' + paras(i.more) + "</div>" : "") +
      (i.credit ? '<p class="credit">' + esc(i.credit) + "</p>" : "");
    iv.hidden = false; document.body.style.overflow = "hidden";
    $("ivText").scrollTop = 0; $("ivClose").focus({ preventScroll: true });
  }
  function closeInsp() { if (iv && !iv.hidden) { iv.hidden = true; document.body.style.overflow = ""; } }
  $("ivClose").addEventListener("click", closeInsp);
  iv.addEventListener("click", function (e) { if (e.target === iv) closeInsp(); });

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
        '%" aria-label="' + esc(p.title || String(i + 1)) + '"><span></span></button>';
    }).join("");
    var has = curHs.length > 0;
    fs.classList.toggle("has-hs", has);
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
    if (cur) hideSheet();
  }
  // Landscape tablets: the note lives in a side panel next to the photo; with nothing
  // selected the panel lists the details. Elsewhere it is an overlay that hides when closed.
  var sideMq = matchMedia("(min-width: 900px) and (orientation: landscape)");
  function sideMode() { return sideMq.matches && curHs.length > 0; }
  function showList() {
    $("sheetTitle").textContent = T.inThisPhoto;
    $("sheetText").innerHTML = '<ul class="fs-list">' + curHs.map(function (p, i) {
      return '<li><button type="button" data-i="' + i + '">' + (p.preview ? sk([60]) : esc(p.title)) + "</button></li>";
    }).join("") + "</ul>";
    sheet.hidden = false; sheet.classList.add("listing"); fit();
  }
  sideMq.addEventListener("change", function () { if (cur) { fit(); if (sheet.hidden || sheet.classList.contains("listing")) hideSheet(); } });
  function showSheet(i) {
    var p = curHs[i];
    sheet.classList.remove("listing");
    if (p.preview) { $("sheetTitle").innerHTML = sk([55]); $("sheetText").innerHTML = sk([100, 94, 70]); }
    else { $("sheetTitle").textContent = p.title; $("sheetText").innerHTML = paras(p.text || ""); }
    sheet.hidden = false;
    [].forEach.call(fsDots.children, function (d, k) { d.classList.toggle("active", k === i); });
    fit();
  }
  function hideSheet() {
    if (cur && sideMode() && dotsOn) { showList(); [].forEach.call(fsDots.children, function (d) { d.classList.remove("active"); }); return; }
    sheet.hidden = true;
    [].forEach.call(fsDots.children, function (d) { d.classList.remove("active"); });
    fit();
  }
  function step(d) {
    if (!cur) return;
    var n = byNum[cur.number + d];
    if (!n) return;
    openFs(n, null); location.hash = "work-" + n.id;
  }
  fsDots.addEventListener("click", function (e) {
    var d = e.target.closest(".dot");
    if (d) { e.stopPropagation(); showSheet(+d.getAttribute("data-i")); }
  });
  fsStage.addEventListener("click", function (e) { if (!e.target.closest(".dot")) hideSheet(); });
  $("fsToggle").addEventListener("click", function () { setDots(!dotsOn); });
  $("fsClose").addEventListener("click", closeFs);
  $("sheetClose").addEventListener("click", hideSheet);
  sheet.addEventListener("click", function (e) {
    var b = e.target.closest(".fs-list button"); if (b) showSheet(+b.getAttribute("data-i"));
  });
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

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (!iv.hidden) closeInsp(); else if (!sheet.hidden) hideSheet(); else closeFs(); }
    if (!fs.hidden && e.key === "ArrowRight") step(1);
    if (!fs.hidden && e.key === "ArrowLeft") step(-1);
  });

  // Menu labels come from the editable texts, in the chosen language.
  function applyUi() {
    [].forEach.call(document.querySelectorAll(".menu a[data-ui]"), function (a) {
      var k = a.getAttribute("data-ui"); if (T[k]) a.textContent = T[k];
    });
    $("fsClose").setAttribute("aria-label", T.close);
    var ls = $("langs");
    if (ls) ls.innerHTML = (RAW.languages || []).map(function (l) {
      return '<button type="button" data-lang="' + l.code + '" aria-pressed="' + (l.code === LANG) + '" lang="' + l.code + '">' + esc(l.label) + "</button>";
    }).join("");
  }
  if ($("langs")) $("langs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang]"); if (!b || b.getAttribute("data-lang") === LANG) return;
    var y = window.scrollY;
    setLang(b.getAttribute("data-lang")); applyUi();
    var w = cur; route(); window.scrollTo(0, y);
    if (w) openFs(byId[w.id], null);
  });

  applyUi();
  route();
})();
