# Layout fonts

The three layout families ship with the app so the build never fetches
fonts. `next/font/google` downloaded them from Google at build time, and that
download failed four hosted builds on 2026-09-25 (runs 36102822545 and
36131005655 are two of them). `app/layout-fonts.ts` declares these files, and
Biome rejects `next/font/google` imports.

## Source

Each file is byte-identical to the subset Google Fonts served on 2026-09-26 for
the queries below, which are the files `next/font/google` shipped before this
change:

- `css2?family=Manrope:wght@200..800`
- `css2?family=Plus+Jakarta+Sans:wght@700;800`
- `css2?family=Instrument+Sans:wdth,wght@100,400..700`

The family names, weights, unicode ranges and preloads in
`app/layout-fonts.ts`, and the fallback metrics in `app/globals.css`, repeat
what `next/font/google` generated. A build before and after the change emits
the same 19 `@font-face` rules and the same three Latin preloads.

| File | SHA-256 (first 16) |
| --- | --- |
| `instrument-sans-latin-ext.woff2` | `21fac8da552a915e` |
| `instrument-sans-latin.woff2` | `6219bc4bfdfc5d9b` |
| `manrope-cyrillic-ext.woff2` | `e8c0b39992f06b3d` |
| `manrope-cyrillic.woff2` | `95a493061fe0a8d0` |
| `manrope-greek.woff2` | `40af11327fe53081` |
| `manrope-latin-ext.woff2` | `ce093b341d9c1065` |
| `manrope-latin.woff2` | `e310b55a7fd9677f` |
| `manrope-vietnamese.woff2` | `bab757f8a0a1bc04` |
| `plus-jakarta-sans-cyrillic-ext.woff2` | `a16f29d7d2a21a4f` |
| `plus-jakarta-sans-latin-ext.woff2` | `0303e02b53b0298f` |
| `plus-jakarta-sans-latin.woff2` | `cd8db90cd950e26b` |
| `plus-jakarta-sans-vietnamese.woff2` | `5c913fc1b1f86f4b` |

Question content uses the Greek, extended-Latin, Cyrillic (`№`) and
Vietnamese ranges, so every subset stays. The browser downloads a subset only
when a page renders a character in its range.

## License

All three families are licensed under the SIL Open Font License 1.1. Each
license file is copied unchanged from `google/fonts` (`ofl/<family>/OFL.txt`):
[Manrope](./OFL-manrope.txt), [Plus Jakarta Sans](./OFL-plus-jakarta-sans.txt)
and [Instrument Sans](./OFL-instrument-sans.txt). The license permits bundling
the fonts with software, provided the notice travels with them.

## Changing a font

Fetch the `css2` stylesheet with a current Chrome user agent. Download each
subset it lists, and update the file, its range and the table above together.
If the family's metrics change, update its fallback face in `app/globals.css`
from a `next/font/google` build of the same query.
