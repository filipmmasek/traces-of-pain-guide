# Fonts

The guide's fonts come from an Adobe Fonts web project, linked in index.html and admin.html:
`https://use.typekit.net/bin2juv.css`

| Use | Adobe Fonts family | Weights in the project |
|---|---|---|
| Main titles | `spalla` | 400, 700 |
| Smaller titles | `athelas` | 400, 700, with italics |
| Texts | `din-2014` | 400, 700, with italics |

To change fonts, edit the web project on fonts.adobe.com; the site picks the change up without code changes.

## Czech letters

Not every font in the Adobe project has all Czech letters (ě š č ř ž ů ť ď ň ...). On Czech pages only
(`html:lang(cs)`, end of styles.css), each family has an open-licensed look-alike next in the stack, and the browser
takes a letter from it only where the Adobe font lacks that letter:

| Adobe family | Fallback for missing Czech letters | File(s) |
|---|---|---|
| `spalla` | Forum | `cz/forum-400.woff2` |
| `athelas` | Crimson Pro | `cz/crimson-*.woff2` |
| `din-2014` | Barlow | `cz/barlow-*.woff2` |

The files are Google Fonts (SIL Open Font License 1.1) cut down to the Czech accented letters only. The Adobe font
files are not modified. qr.html uses the Forum file for its Czech words too.
