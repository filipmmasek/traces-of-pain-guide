# Fonts

The guide's fonts come from an Adobe Fonts web project, linked in index.html and admin.html:
`https://use.typekit.net/bin2juv.css`

| Use | Adobe Fonts family | Weights in the project |
|---|---|---|
| Main titles | `spalla` | 400, 700 |
| Smaller titles | `athelas` | 400, 700, with italics |
| Texts | `din-2014` | 400, 700, with italics |

To change fonts, edit the web project on fonts.adobe.com; the site picks the change up without code changes.

## Czech

Not every font in the Adobe project has all Czech letters (ě š č ř ž ů ť ď ň ...), and mixing in single letters
from another font looked wrong, so Czech pages (`html:lang(cs)`, end of styles.css) set all texts in open-licensed
look-alikes instead. EN and ES keep the Adobe fonts.

| Adobe family | Czech pages use | Files |
|---|---|---|
| `spalla` | Forum | `cz/forum-*.woff2` |
| `athelas` | Crimson Pro | `cz/crimson-*.woff2` |
| `din-2014` | Barlow | `cz/barlow-*.woff2` |

The files are Google Fonts (SIL Open Font License 1.1), latin + latin-ext subsets, self-hosted so the venue tablets
need no extra service. The Adobe font files are not modified. The QR card (qr.html) stays in Spalla: its Czech words
have no letters outside the Western set.
