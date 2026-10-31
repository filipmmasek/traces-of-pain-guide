// MOCKUP ONLY (loaded by mockup.html, never by the real guide): fills the guide with sample
// lorem ipsum text and public domain inspiration images so the finished layout can be judged.
(function () {
  var G = window.GUIDE;
  var L1 = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
  var L2 = "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
  var L3 = "Curabitur pretium tincidunt lacus, nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.";
  var FP = "https://commons.wikimedia.org/wiki/Special:FilePath/";
  var goya = {
    title: "Fight with Cudgels (Duelo a garrotazos)", artist: "Francisco de Goya", date: "1820–1823", where: "Museo del Prado, Madrid",
    image: FP + "Duelo_a_garrotazos,_por_Goya.jpg?width=900",
    text: "What the photographs take from it: two men locked in a fight that neither can leave, both sunk to their knees in the ground, under an empty sky. The series keeps the stance of the raised arm and the sense that the struggle has no end and no winner.",
    credit: "Fight with Cudgels, Francisco de Goya, via Wikimedia Commons, public domain."
  };
  var angel = {
    title: "Angel with Wheat", artist: "Master of Calamarca", date: "first half of the 18th century", where: "Church of Calamarca, Bolivia",
    image: FP + "Master_of_Calamarca,_Angel_with_Wheat.jpg?width=900",
    text: "What the photographs take from it: the Andean Baroque angels of Calamarca, dressed in the clothes of Spanish nobility, with large feathered wings and a frontal, standing pose. In the same church other angels carry arquebuses, the source of the gun in Raphael II.",
    credit: "Angel with Wheat, Master of Calamarca, via Wikimedia Commons, Public Domain Mark 1.0."
  };
  var hs = {
    "the-duel-0296": [[62, 18, "The white flag"], [37, 8, "The cap"], [42, 40, "The marks on the vest"]],
    "raphael-ii-0296": [[23, 38, "The arquebus"], [62, 79, "The fish"], [70, 28, "The wings"]],
    "raphael-ii-f0012": [[84, 77, "The lowered gun"], [68, 30, "The wings"]]
  };
  G.series.forEach(function (s) {
    s.text = L1 + "\n\n" + L2;
    s.inspirations = [s.id === "the-duel" ? goya : angel];
  });
  G.works.forEach(function (w, i) {
    w.title = "Lorem ipsum " + ["dolor", "amet", "tempor", "magna", "veniam"][i % 5];
    w.text = L1 + "\n\n" + (i % 2 ? L2 : L3);
    w.hotspots = (hs[w.id] || []).map(function (h) { return { x: h[0], y: h[1], title: h[2], text: L3 }; });
  });
  G.pages.concept.text = [L1, L2, L3, L1].join("\n\n");
  G.pages.about.text = [L2, L1, L3].join("\n\n");
})();
