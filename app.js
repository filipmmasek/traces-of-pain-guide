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
    if (LANG !== "en") shareHotspots();
    byProject = {}; byId = {}; byNum = {};
    G.projects.forEach(function (p) { byProject[p.id] = p; });
    G.works.forEach(function (w) { byId[w.id] = w; byNum[w.number] = w; });
    document.documentElement.lang = LANG;
    try { localStorage.setItem("tp-lang", LANG); } catch (e) {}
  }
  // The same photo detail often appears on several photos. If one photo's copy has no translation
  // yet, reuse the translation of the same detail (same English title) from another photo.
  function shareHotspots() {
    var en = {}, tr = {};
    RAW.works.forEach(function (w) { en[w.id] = w.hotspots || []; });
    G.works.forEach(function (w) {
      (w.hotspots || []).forEach(function (h, i) {
        var e = en[w.id][i];
        if (e && h.title !== e.title && !tr[e.title]) tr[e.title] = h;
      });
    });
    G.works = G.works.map(function (w) {
      var changed = false, hs = (w.hotspots || []).map(function (h, i) {
        var e = en[w.id][i], t = e && h.title === e.title && tr[e.title];
        if (!t) return h;
        changed = true;
        return Object.assign({}, h, { title: t.title, text: t.text });
      });
      return changed ? Object.assign({}, w, { hotspots: hs }) : w;
    });
  }
  // "photos" after a number: Czech has a separate form for 2 to 4.
  function count(n) {
    if (LANG === "cs" && n >= 2 && n <= 4) return n + " fotografie";
    if (LANG === "cs" && n === 1) return "1 fotografie";
    if (LANG === "es" && n === 1) return "1 fotografía";
    if (LANG === "en" && n === 1) return "1 photo";
    return n + " " + T.works;
  }
  var KIOSK = document.documentElement.classList.contains("kiosk");
  var savedLang = null;
  try { savedLang = localStorage.getItem(KIOSK ? "tp-kiosk-lang" : "tp-lang") || localStorage.getItem("tp-lang"); } catch (e) {}
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
  // Photo details ("In this photo") are switched off until their texts are approved (filip, Nov 9).
  // Set to true to show them again: the list on project pages, the dots and the details in full screen.
  var SHOW_PHOTO_DETAILS = false;
  function hotspotsOf(w) {
    if (!SHOW_PHOTO_DETAILS) return [];
    if (w.hotspots.length) return w.hotspots;
    if (P && P.hotspots[w.id]) return P.hotspots[w.id].map(function (p) { return { x: p.x, y: p.y, preview: true }; });
    return [];
  }
  function inspirationsOf(w) {
    var p = byProject[w.project];
    return w.inspirations.length ? w.inspirations : p.inspirations;
  }
  function workName(w) { return w.title || byProject[w.project].name; }

  // Each project has one hero photo (chosen in the admin, else the first photo); the rest follow it.
  function heroOf(p) { var ws = worksIn(p.id); return byId[p.hero] && byId[p.hero].project === p.id ? byId[p.hero] : ws[0]; }
  function photosOf(p) {
    var h = heroOf(p); if (!h) return [];
    return [h].concat(worksIn(p.id).filter(function (w) { return w !== h; }));
  }
  // Other photos open straight in full screen; there are no separate photo pages.
  function tile(w) {
    return '<button type="button" class="tile" data-open="' + w.id + '" aria-label="' + esc(T.fullscreen) + '">' +
      '<span class="ph"><img loading="lazy" src="' + w.thumb + '" alt="" width="480" height="640">' +
      (hotspotsOf(w).length ? '<span class="dots"></span>' : "") + "</span></button>";
  }

  var INSP = []; // inspirations on the current page, for the large view
  function inspirationCards(list) {
    if (list.length) {
      return list.map(function (i) {
        var k = INSP.push(i) - 1;
        return '<button type="button" class="insp' + (i.image ? "" : " noimg") + '" data-insp="' + k + '">' + (i.image ? '<img src="' + esc(i.image) + '" alt="">' : "") +
          '<span class="cap"><h3>' + esc(i.title) + '</h3><span class="meta">' +
          esc([i.artist, i.date, i.where].filter(Boolean).join(", ")) + "</span>" +
          (i.text ? '<span class="note">' + paras(i.text) + "</span>" : "") +
          (i.image || i.text || i.more ? '<span class="more-link">' + esc(T.readMore || "View larger") + " &#8599;&#65038;</span>" : "") + "</span></button>";
      }).join("");
    }
    if (P) return '<figure class="insp"><div class="slot"></div><figcaption>' + sk([70, 45]) + sk([100, 92, 60]) + "</figcaption></figure>";
    return "";
  }

  function footer() {
    return '<footer class="foot"><span>' + esc(G.exhibition.artist) + " · " + esc(G.exhibition.title) + " · " +
      esc(G.exhibition.venue) + '</span><a href="#credits">' + esc(T.credits) + "</a></footer>";
  }

  // Exhibition logo, one version per language (img/logo/logo-<lang>.png, mark-<lang>.png = first two lines).
  var LOGO_ALT = { en: "Traces of Pain, Huellas del dolor. Gabriel Matula, photography", cs: "Stopy bolesti, Huellas del dolor. Gabriel Matula, fotografie", es: "Huellas del dolor, Stopy bolesti. Gabriel Matula, fotografía" };
  function logoSrc(kind) { return "img/logo/" + kind + "-" + (LOGO_ALT[LANG] ? LANG : "en") + ".png"; }
  function logo(cls) {
    return '<img class="' + cls + '" src="' + logoSrc("logo") + '" alt="' + esc(LOGO_ALT[LANG] || LOGO_ALT.en) + '" width="1393" height="394">';
  }
  function projectTile(p) {
    var ws = worksIn(p.id), c = heroOf(p);
    return '<a class="ptile' + (c ? "" : " empty") + '" href="#project-' + p.id + '">' +
      (c ? '<img loading="lazy" src="' + c.thumb + '" alt="">' : "") +
      '<span class="cap"><span class="label">' + (ws.length ? esc(count(ws.length)) : esc(T.comingSoon)) + "</span>" +
      "<h2>" + esc(p.name) + "</h2></span></a>";
  }
  function home() {
    var e = G.exhibition, con = (G.pages || {}).concept || {};
    var lead = String(con.text || "").split(/\n\s*\n/)[0] || "";
    var h = '<section class="hero">' +
      logo("logo-hero") +
      '<p class="hero-meta">' + esc(e.dates || "") + (e.dates && e.venue ? " · " : "") + esc(e.venue) + "</p>" +
      (lead ? '<div class="hero-lead">' + paras(lead) + '<a class="text-link" href="#concept">' + esc(T.aboutExhibition) + "</a></div>" : "") +
      "</section>";
    h += '<div class="section-head"><h2 class="sc">' + esc(T.projects) + '</h2><span class="label">' + G.projects.length + "</span></div>";
    h += '<div class="ptiles">' + G.projects.map(projectTile).join("") + "</div>";
    return h + footer();
  }

  // The tablet view: a visitor stands at the print of the project's hero photo. The thumbnail confirms
  // the photo, the reading column gets the space, and the project's other photos follow below.
  function project(p) {
    var ps = photosOf(p), w = ps[0], i = G.projects.indexOf(p);
    var prev = G.projects[i - 1], next = G.projects[i + 1];
    var hs = w ? hotspotsOf(w) : [];
    var insp = inspirationCards(w && w.inspirations.length ? w.inspirations : p.inspirations);
    var story = p.story && (G.pages || {})[p.story];
    var h = '<article class="work">';
    h += '<aside class="confirm">' + (w ?
      '<button class="thumb" type="button" data-open="' + w.id + '" aria-label="' + esc(T.fullscreen) + '">' +
      '<img src="' + w.thumb + '" alt="' + esc(p.name) + '"><span class="fs-ic" aria-hidden="true"></span></button>' +
      '<button class="explore" type="button" data-open="' + w.id + '">' + esc(hs.length ? T.explore : T.fullscreen) + "</button>" +
      qrBlock(p) : '<div class="thumb empty"><span class="label">' + esc(T.comingSoon) + "</span></div>") + "</aside>";
    h += '<div class="read"><a class="back" href="#">' + esc(T.projects) + "</a>" +
      '<span class="label">' + (ps.length ? esc(count(ps.length)) : esc(T.comingSoon)) + "</span>" +
      "<h1>" + esc(p.name) + "</h1>" +
      (p.subtitle ? '<p class="subtitle">' + inline(p.subtitle) + "</p>" : "") +
      (p.quote ? '<blockquote class="epigraph"><p>' + inline(p.quote) + "</p>" + (p.quoteBy ? "<cite>" + esc(p.quoteBy) + "</cite>" : "") + "</blockquote>" : "") +
      leadAndMore(p.text) +
      (story ? '<a class="text-link" href="#' + esc(p.story) + '">' + esc(story.title) + "</a>" : "");
    if (hs.length) {
      h += '<section class="block"><span class="label">' + esc(T.inThisPhoto) + '</span><ul class="hs-list">' +
        hs.map(function (d, k) {
          return '<li><button type="button" data-open="' + w.id + '" data-hs="' + k + '"><span class="n">' + (k + 1) + "</span>" +
            (d.preview ? sk([40 + (k * 17) % 35]) : "<span>" + esc(d.title) + "</span>") + "</button></li>";
        }).join("") + "</ul></section>";
    }
    if (insp) h += '<section class="block"><span class="label">' + esc(T.inspiredBy) + "</span>" + insp + "</section>";
    if (ps.length > 1) h += '<section class="block"><span class="label">' + esc(T.morePhotos) + '</span><div class="grid more-grid">' +
      ps.map(tile).join("") + "</div></section>";
    h += "</div></article>";
    h += '<nav class="pager">' + pagerLink(prev, "prev") +
      '<span class="pager-mid">' + (i + 1) + " / " + G.projects.length + "</span>" + pagerLink(next, "next") + "</nav>";
    return h;
  }
  function pagerLink(p, dir) {
    if (!p) return "<span></span>";
    var c = heroOf(p), img = c ? '<img src="' + c.thumb + '" alt="">' : '<span class="no-img"></span>';
    var txt = '<span><span class="label">' + esc(dir === "prev" ? T.prev : T.next) + "</span>" + esc(p.name) + "</span>";
    return '<a' + (dir === "next" ? ' class="next"' : "") + ' href="#project-' + p.id + '">' + (dir === "prev" ? img + txt : txt + img) + "</a>";
  }

  // QR code that opens this exact photo page on a visitor's phone. ?qr=1 tells the phone not to show a QR itself.
  function qrBlock(p) {
    if (typeof window.qrcode !== "function") return "";
    if (!KIOSK) try { if (sessionStorage.getItem("tp-from-qr")) return ""; } catch (e) {}
    var url = location.origin + location.pathname + "?qr=1#project-" + p.id;
    var q = window.qrcode(0, "M"); q.addData(url); q.make();
    // Light modules drawn on the dark page (an inverted code), so it sits quietly in the layout.
    var n = q.getModuleCount(), m = 2, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + (c + m) + " " + (r + m) + "h1v1h-1z";
    var svg = '<svg viewBox="0 0 ' + (n + 2 * m) + " " + (n + 2 * m) + '" shape-rendering="crispEdges" aria-hidden="true"><path d="' + d + '"/></svg>';
    return '<figure class="qr">' + svg + "<figcaption>" + esc(T.openOnPhone || "Open on your phone") + "</figcaption></figure>";
  }

  // A story opened from a project page leads back to that project.
  function page(key, from) {
    var pg = (G.pages || {})[key] || {};
    var img = pg.image ? '<img class="page-img" src="' + esc(pg.image) + '" alt="' + (key === "about" ? ({ cs: "Gabriel Matula, autoportrét", es: "Gabriel Matula, autorretrato" })[LANG] || "Gabriel Matula, self-portrait" : "") + '">' : "";
    var fp = from && /^project-/.test(from) && byProject[from.slice(8)];
    var back = fp ? '<a class="back" href="#' + from + '">' + esc(fp.name) + "</a>" : '<a class="back" href="#">' + esc(T.back) + "</a>";
    return back + '<article class="page' + (img ? " has-img" : "") + '">' + img +
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
      '<ul class="collab-list">' + list.map(function (c) {
        var inner = '<span class="role">' + esc(c.role) + '</span><span class="name">' + esc(c.name) + "</span>";
        return "<li>" + (c.link && !KIOSK ? '<a class="collab" href="' + esc(c.link) + '" target="_blank" rel="noopener">' + inner + "</a>" : '<div class="collab">' + inner + "</div>") + "</li>";
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
    var h = location.hash.replace(/^#/, ""), m, html, from = lastHash;
    INSP = []; closeInsp();
    closeFs();
    document.body.classList.remove("on-work");
    // Old photo links (and QR codes printed earlier) lead to their project page.
    if ((m = h.match(/^work-(.+)$/)) && byId[m[1]]) { history.replaceState(null, "", "#project-" + byId[m[1]].project); h = "project-" + byId[m[1]].project; }
    // Earlier project names.
    var OLD = { "raphael-ii": "raphael-dei", "leaden-hours": "saturn", "smoke-of-requited-love": "letters-from-mom", "bitter-honeymoon": "terrible-night", "water-mirrors": "ophelia" };
    if ((m = h.match(/^(?:project|series)-(.+)$/)) && OLD[m[1]]) { h = "project-" + OLD[m[1]]; history.replaceState(null, "", "#" + h); }
    if ((m = h.match(/^(?:project|series)-(.+)$/)) && byProject[m[1]]) { html = project(byProject[m[1]]); document.body.classList.add("on-work"); }
    else if (h === "credits") html = credits();
    else if ((G.pages || {})[h]) html = page(h, h === lastHash ? lastFrom : from);
    else if (h === "collaborators") html = collaborators();
    else html = home();
    view.innerHTML = html;
    if (h !== lastHash) { lastFrom = from; lastHash = h; }
    [].forEach.call(document.querySelectorAll(".menu a"), function (a) {
      var on = a.getAttribute("href") === "#" + h || (a.getAttribute("href") === "#" && (h === "" || /^(project|series|work)-/.test(h)));
      a.setAttribute("aria-current", on ? "page" : "false");
    });
    // Phones: the menu scrolls sideways; keep the current item fully in view.
    var menu = document.querySelector(".menu"), cur = menu && menu.querySelector('[aria-current="page"]');
    if (menu && cur && menu.scrollWidth > menu.clientWidth) {
      var mr = menu.getBoundingClientRect(), cr = cur.getBoundingClientRect();
      if (cr.right > mr.right) menu.scrollLeft += cr.right - mr.right + 16;
      else if (cr.left < mr.left) menu.scrollLeft -= mr.left - cr.left + 16;
    }
    window.scrollTo(0, 0);
  }
  var lastHash = null, lastFrom = null;
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
  var sheet = $("sheet"), cur = null, curHs = [], dotsOn = true, detailsPref = null;

  function fit() {
    if (!cur) return;
    var bw = fsStage.clientWidth, bh = fsStage.clientHeight, r = cur.w / cur.h;
    var w = Math.min(bw, bh * r), h = w / r;
    fsFrame.style.width = w + "px"; fsFrame.style.height = h + "px";
    fsImg.style.width = w + "px"; fsImg.style.height = h + "px";
    clampZoom(); paint(false);
  }
  window.addEventListener("resize", fit);

  // ---------- Zoom: pinch and drag on touch, wheel / buttons / double click on desktop ----------
  // The frame (photo + dots) is moved with one transform: translate(tx, ty) scale(z), origin top left.
  // Dots stay the same size on screen. Past ~1.3x the full resolution file (img/zoom/) is swapped in.
  var Z_MAX = 6, z = 1, tx = 0, ty = 0, hiFor = null, inert = 0;
  function bounds() {
    var bw = fsStage.clientWidth, bh = fsStage.clientHeight, w = fsFrame.offsetWidth, h = fsFrame.offsetHeight;
    var L = fsFrame.offsetLeft, T0 = fsFrame.offsetTop, W = w * z, H = h * z;
    return {
      x0: W <= bw ? (w - W) / 2 : bw - W - L, x1: W <= bw ? (w - W) / 2 : -L,
      y0: H <= bh ? (h - H) / 2 : bh - H - T0, y1: H <= bh ? (h - H) / 2 : -T0
    };
  }
  function clampZoom() {
    z = Math.min(Z_MAX, Math.max(1, z));
    var b = bounds();
    tx = Math.min(b.x1, Math.max(b.x0, tx)); ty = Math.min(b.y1, Math.max(b.y0, ty));
  }
  function paint(anim) {
    fsFrame.classList.toggle("anim", !!anim);
    fsFrame.style.transform = z === 1 && !tx && !ty ? "" : "translate(" + tx + "px," + ty + "px) scale(" + z + ")";
    fsFrame.style.setProperty("--iz", 1 / z);
    fs.classList.toggle("zoomed", z > 1.01);
    $("fsZoomOut").disabled = z <= 1.01; $("fsZoomIn").disabled = z >= Z_MAX - 0.01;
    if (z > 1.3 && cur && hiFor !== cur) loadHi(cur);
  }
  function hiSrc(w) { return w.zoom || w.src.replace("img/full/", "img/zoom/"); }
  function loadHi(w) {
    hiFor = w;
    var im = new Image();
    im.onload = function () { if (cur === w) fsImg.src = im.src; };
    im.src = hiSrc(w);
  }
  // Point on screen (relative to the stage) -> keep it fixed while zooming to nz.
  function zoomAt(nz, sx, sy, anim) {
    var r = fsStage.getBoundingClientRect(), L = fsFrame.offsetLeft, T0 = fsFrame.offsetTop;
    var px = sx - r.left - L, py = sy - r.top - T0;
    nz = Math.min(Z_MAX, Math.max(1, nz));
    tx = px - (px - tx) * nz / z; ty = py - (py - ty) * nz / z; z = nz;
    clampZoom(); paint(anim);
  }
  function zoomCenter(nz) {
    var r = fsStage.getBoundingClientRect();
    zoomAt(nz, r.left + r.width / 2, r.top + r.height / 2, true);
  }
  function resetZoom(anim) { cancelAnimationFrame(inert); z = 1; tx = ty = 0; paint(anim); }
  $("fsZoomIn").addEventListener("click", function () { zoomCenter(z * 1.8); });
  $("fsZoomOut").addEventListener("click", function () { zoomCenter(z / 1.8 < 1.15 ? 1 : z / 1.8); });

  fsStage.addEventListener("wheel", function (e) {
    if (!cur) return;
    e.preventDefault();
    var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    // Trackpad pinch arrives as ctrl+wheel with small steps; a mouse wheel notch is ~100.
    var k = e.ctrlKey ? 0.012 : 0.0025;
    cancelAnimationFrame(inert);
    zoomAt(z * Math.exp(-Math.max(-150, Math.min(150, d)) * k), e.clientX, e.clientY, !e.ctrlKey && Math.abs(d) >= 40);
  }, { passive: false });

  // Pointer gestures. One finger: swipe to the next photo (only when not zoomed) or drag when zoomed.
  // Two fingers: pinch. Double tap / double click: zoom in to that spot, or back out.
  var pts = {}, nPts = 0, g = null, lastTap = null, eatClick = false;
  function two() { var a = []; for (var k in pts) a.push(pts[k]); return a; }
  function startPinch() {
    var a = two(), r = fsStage.getBoundingClientRect();
    var mx = (a[0].x + a[1].x) / 2 - r.left - fsFrame.offsetLeft, my = (a[0].y + a[1].y) / 2 - r.top - fsFrame.offsetTop;
    g = { pinch: true, d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z0: z, qx: (mx - tx) / z, qy: (my - ty) / z, moved: true };
  }
  fsStage.addEventListener("pointerdown", function (e) {
    if (!cur || (e.pointerType === "mouse" && e.button !== 0)) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY }; nPts++;
    cancelAnimationFrame(inert);
    if (nPts === 2) { startPinch(); for (var k in pts) grab(+k); }
    else if (nPts === 1) g = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t: Date.now(), vx: 0, vy: 0, lt: Date.now(), moved: false, dot: !!e.target.closest(".dot"), type: e.pointerType };
  });
  // Capture only once a drag or pinch starts, so a plain tap still lands on a dot.
  function grab(id) { try { fsStage.setPointerCapture(id); } catch (x) {} }
  fsStage.addEventListener("pointermove", function (e) {
    var p = pts[e.pointerId]; if (!p || !g) return;
    p.x = e.clientX; p.y = e.clientY;
    if (g.pinch && nPts >= 2) {
      var a = two(), r = fsStage.getBoundingClientRect();
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      var mx = (a[0].x + a[1].x) / 2 - r.left - fsFrame.offsetLeft, my = (a[0].y + a[1].y) / 2 - r.top - fsFrame.offsetTop;
      var nz = g.z0 * d / g.d0;
      if (nz < 1) nz = 1 - (1 - nz) * 0.35; else if (nz > Z_MAX) nz = Z_MAX + (nz - Z_MAX) * 0.2;  // soft edges
      z = nz; tx = mx - g.qx * z; ty = my - g.qy * z;
      paint(false); return;
    }
    if (g.pinch) return;
    if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 8) { g.moved = true; grab(e.pointerId); }
    if (z > 1 && g.moved) {
      var now = Date.now(), dt = Math.max(1, now - g.lt), dx = e.clientX - g.lx, dy = e.clientY - g.ly;
      g.vx = 0.8 * (dx / dt) + 0.2 * g.vx; g.vy = 0.8 * (dy / dt) + 0.2 * g.vy; g.lt = now;
      tx += dx; ty += dy;
      var b = bounds();  // drag past the edge resists
      if (tx > b.x1) tx -= dx * 0.6; else if (tx < b.x0) tx -= dx * 0.6;
      if (ty > b.y1) ty -= dy * 0.6; else if (ty < b.y0) ty -= dy * 0.6;
      paint(false);
    }
    g.lx = e.clientX; g.ly = e.clientY;
  });
  function endPointer(e) {
    if (!pts[e.pointerId]) return;
    delete pts[e.pointerId]; nPts--;
    if (!g) return;
    if (g.pinch) {
      if (nPts === 1) {  // one finger stays: carry on dragging from where it is
        var a = two()[0];
        g = { x0: a.x, y0: a.y, lx: a.x, ly: a.y, t: 0, vx: 0, vy: 0, lt: Date.now(), moved: true, pinched: true };
      } else if (nPts === 0) { settle(); eatClick = true; g = null; }
      return;
    }
    if (nPts > 0) return;
    var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.moved) {
      eatClick = true;
      if (z > 1.01 || g.pinched) glide(g.vx, g.vy);
      else if (g.type !== "mouse" && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    } else if (!g.dot && e.type === "pointerup") {
      var now = Date.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        lastTap = null; eatClick = true;
        if (z > 1.05) resetZoom(true); else zoomAt(2.5, e.clientX, e.clientY, true);
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    g = null;
  }
  fsStage.addEventListener("pointerup", endPointer);
  fsStage.addEventListener("pointercancel", endPointer);
  // A drag, pinch or double tap is not a tap: it must not close the detail note.
  fsStage.addEventListener("click", function (e) { if (eatClick) { eatClick = false; e.stopPropagation(); } }, true);
  function settle() {
    if (z < 1.03) { z = 1; tx = ty = 0; }
    clampZoom(); paint(true);
  }
  function glide(vx, vy) {
    var b0 = bounds();
    if (tx > b0.x1 || tx < b0.x0 || ty > b0.y1 || ty < b0.y0 || Math.hypot(vx, vy) < 0.15) { settle(); return; }
    var last = performance.now();
    (function f(now) {
      var dt = Math.min(32, now - last); last = now;
      tx += vx * dt; ty += vy * dt; vx *= Math.pow(0.994, dt); vy *= Math.pow(0.994, dt);
      var b = bounds(), hit = false;
      if (tx > b.x1) { tx = b.x1; vx = 0; hit = true; } else if (tx < b.x0) { tx = b.x0; vx = 0; hit = true; }
      if (ty > b.y1) { ty = b.y1; vy = 0; hit = true; } else if (ty < b.y0) { ty = b.y0; vy = 0; hit = true; }
      paint(false);
      if (Math.hypot(vx, vy) > 0.02) inert = requestAnimationFrame(f);
    })(last);
  }

  function openFs(w, hs) {
    cur = w; curHs = hotspotsOf(w); fs.hidden = false; document.body.style.overflow = "hidden";
    z = 1; tx = ty = 0; hiFor = null; cancelAnimationFrame(inert);
    // Never show the previous photo: start from the (usually cached) thumbnail, swap in the full size when loaded.
    fsImg.alt = byProject[w.project].name;
    fsImg.removeAttribute("src");
    if (w.thumb) fsImg.src = w.thumb;
    var full = new Image();
    full.onload = function () { if (cur === w && hiFor !== w) fsImg.src = full.src; };
    full.src = w.src;
    var ps = photosOf(byProject[w.project]);
    $("fsCount").textContent = (ps.indexOf(w) + 1) + " / " + ps.length;
    $("fsPrev").hidden = $("fsNext").hidden = ps.length < 2;
    fsDots.innerHTML = curHs.map(function (p, i) {
      return '<button class="dot" type="button" data-i="' + i + '" style="left:' + p.x + "%;top:" + p.y +
        '%" aria-label="' + esc(p.title || String(i + 1)) + '"><span></span></button>';
    }).join("");
    var has = curHs.length > 0;
    fs.classList.toggle("has-hs", has);
    $("fsToggle").hidden = !has;
    $("fsHint").textContent = "";
    // Details are open by default on landscape tablets; on phones they open with "Show details".
    // The choice is kept while stepping through the photos.
    if (detailsPref === null) detailsPref = sideMq.matches;
    setDots(hs != null ? true : detailsPref); hideSheet(); fit();
    if (hs != null) showSheet(hs);
    $("fsClose").focus({ preventScroll: true });
  }
  function closeFs() {
    if (fs.hidden) return;
    fs.hidden = true; document.body.style.overflow = ""; cur = null; detailsPref = null;
    fsImg.removeAttribute("src");
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
  function sideMode() { return curHs.length > 0; }
  // On the side panel every detail is shown open: its title and its text. A tap on a dot
  // (or on an item) marks that item and scrolls it into view.
  function showList(active) {
    $("sheetTitle").textContent = T.inThisPhoto;
    $("sheetText").innerHTML = '<ul class="fs-list open">' + curHs.map(function (p, i) {
      return '<li' + (i === active ? ' class="active"' : "") + '><button type="button" data-i="' + i + '">' +
        (p.preview ? sk([60]) : '<span class="t">' + esc(p.title) + "</span>") + "</button>" +
        (p.preview ? sk([100, 94, 70]) : p.text ? '<div class="note">' + paras(p.text) + "</div>" : "") + "</li>";
    }).join("") + "</ul>";
    sheet.hidden = false; sheet.classList.add("listing"); fit();
    [].forEach.call(fsDots.children, function (d, k) { d.classList.toggle("active", k === active); });
    if (active != null) { var li = $("sheetText").querySelectorAll("li")[active]; if (li) li.scrollIntoView({ block: "nearest" }); }
  }
  sideMq.addEventListener("change", function () { if (cur) { fit(); if (sheet.hidden || sheet.classList.contains("listing")) hideSheet(); } });
  function showSheet(i) {
    if (cur && sideMode() && dotsOn) { showList(i); return; }
    var p = curHs[i];
    sheet.classList.remove("listing");
    if (p.preview) { $("sheetTitle").innerHTML = sk([55]); $("sheetText").innerHTML = sk([100, 94, 70]); }
    else { $("sheetTitle").textContent = p.title; $("sheetText").innerHTML = paras(p.text || ""); }
    sheet.hidden = false;
    [].forEach.call(fsDots.children, function (d, k) { d.classList.toggle("active", k === i); });
    fit();
  }
  function hideSheet() {
    if (cur && sideMode() && dotsOn) { showList(null); return; }
    sheet.hidden = true;
    [].forEach.call(fsDots.children, function (d) { d.classList.remove("active"); });
    fit();
  }
  function step(d) {
    if (!cur) return;
    // Full screen stays open and moves through the photos of the same project.
    // After the last photo comes the first again (and the other way round).
    var ps = photosOf(byProject[cur.project]);
    if (ps.length < 2) return;
    var n = ps[(ps.indexOf(cur) + d + ps.length) % ps.length];
    openFs(n, null);
  }
  fsDots.addEventListener("click", function (e) {
    var d = e.target.closest(".dot");
    if (d) { e.stopPropagation(); showSheet(+d.getAttribute("data-i")); }
  });
  
  $("fsToggle").addEventListener("click", function () { detailsPref = !dotsOn; setDots(!dotsOn); });
  $("fsClose").addEventListener("click", closeFs);
  $("sheetClose").addEventListener("click", hideSheet);
  sheet.addEventListener("click", function (e) {
    var b = e.target.closest(".fs-list button"); if (b) showSheet(+b.getAttribute("data-i"));
  });
  $("fsPrev").addEventListener("click", function () { step(-1); });
  $("fsNext").addEventListener("click", function () { step(1); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (!iv.hidden) closeInsp(); else if (!sheet.hidden) hideSheet(); else closeFs(); }
    if (!fs.hidden && e.key === "ArrowRight") step(1);
    if (!fs.hidden && e.key === "ArrowLeft") step(-1);
    if (!fs.hidden && (e.key === "+" || e.key === "=")) zoomCenter(z * 1.8);
    if (!fs.hidden && e.key === "-") zoomCenter(z / 1.8 < 1.15 ? 1 : z / 1.8);
    if (!fs.hidden && e.key === "0") resetZoom(true);
  });

  // Menu labels come from the editable texts, in the chosen language.
  function applyUi() {
    [].forEach.call(document.querySelectorAll(".menu a[data-ui]"), function (a) {
      var k = a.getAttribute("data-ui"); if (T[k]) a.textContent = T[k];
    });
    ["fsClose", "sheetClose", "ivClose"].forEach(function (id) { if ($(id)) $(id).setAttribute("aria-label", T.close); });
    $("fsPrev").setAttribute("aria-label", T.prev);
    $("fsNext").setAttribute("aria-label", T.next);
    var nav = document.querySelector(".menu"); if (nav) nav.setAttribute("aria-label", ({ cs: "Hlavní nabídka", es: "Menú principal" })[LANG] || "Main");
    if ($("langs")) $("langs").setAttribute("aria-label", ({ cs: "Jazyk", es: "Idioma" })[LANG] || "Language");
    if ($("inspView")) $("inspView").setAttribute("aria-label", T.inspiredBy);
    $("fsZoomIn").setAttribute("aria-label", T.zoomIn || ({ cs: "Přiblížit", es: "Acercar" })[LANG] || "Zoom in");
    $("fsZoomOut").setAttribute("aria-label", T.zoomOut || ({ cs: "Oddálit", es: "Alejar" })[LANG] || "Zoom out");
    var mk = $("mark"); if (mk) { mk.src = logoSrc("mark"); mk.alt = LOGO_ALT[LANG] || LOGO_ALT.en; }
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

  // ---------- Kiosk (venue tablets) ----------
  // No links that leave the site, and after a while without touches the tablet goes back to
  // the page it was set up on, in its starting language, ready for the next visitor.
  if (KIOSK) {
    var IDLE_MS = 90 * 1000, idleT = null;
    var kHome = "#", kLang = "en";
    try { kHome = localStorage.getItem("tp-kiosk-home") || "#"; kLang = localStorage.getItem("tp-kiosk-lang") || "en"; } catch (e) {}
    var resetIdle = function () { clearTimeout(idleT); idleT = setTimeout(goHome, IDLE_MS); };
    var goHome = function () {
      closeInsp(); closeFs();
      if (LANG !== kLang) { setLang(kLang); applyUi(); }
      if ((location.hash || "#") !== kHome) location.hash = kHome; else route();
      window.scrollTo(0, 0);
    };
    ["pointerdown", "touchstart", "keydown", "wheel", "scroll"].forEach(function (ev) {
      window.addEventListener(ev, resetIdle, { passive: true, capture: true });
    });
    // Block any link that would open another site, a new tab or a phone/mail app.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href");
      if (href.charAt(0) === "#") return;
      var u; try { u = new URL(href, location.href); } catch (er) { e.preventDefault(); return; }
      if (u.origin !== location.origin || a.target === "_blank") e.preventDefault();
    }, true);
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    resetIdle();
  }

  applyUi();
  route();
})();
