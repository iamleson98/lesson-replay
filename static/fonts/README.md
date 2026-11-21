# Board fonts

The whiteboard draws its text with one stack everywhere (the live board, the player, the render page and
the native renderer): `"Inter Variable", "Noto Sans", "Noto Sans Math", "Noto Sans Symbols 2", sans-serif`.
These woff2 files are the only font data: the web loads them through the `@font-face` rules in
`src/app.css` (each `unicode-range` is the range rule below), the native renderer loads the same files, so
fallback picks the same face for every character on both sides. The fonts are under the SIL Open Font
License 1.1 (`OFL-*.txt`).

## Sources

| Font                | Version | Source                                                                                                                                                                     | SHA-256 of the source file                                         |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Inter               | 4.1     | `InterVariable.ttf` of `Inter-4.1.zip`, [rsms/inter v4.1](https://github.com/rsms/inter/releases/tag/v4.1)                                                                 | `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf` |
| Noto Sans           | 2.015   | `full/ttf/NotoSans-Regular.ttf` of `NotoSans-v2.015.zip`, [notofonts/latin-greek-cyrillic](https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSans-v2.015) | `f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5` |
| Noto Sans Math      | 3.000   | `full/ttf/NotoSansMath-Regular.ttf` of `NotoSansMath-v3.000.zip`, [notofonts/math](https://github.com/notofonts/math/releases/tag/NotoSansMath-v3.000)                     | `7283c396e9b22699bb542d9631030dc804a7e5b954f193d8f8f5b5f1162fbc61` |
| Noto Sans Symbols 2 | 2.008   | `full/ttf/NotoSansSymbols2-Regular.ttf` of `NotoSansSymbols2-v2.008.zip`, [notofonts/symbols](https://github.com/notofonts/symbols/releases/tag/NotoSansSymbols2-v2.008)   | `3ce38effdb615dd929c8b0f52768dfa2cd21f206e3824bc7df61e4074b41ae52` |

Zip archives: `NotoSans-v2.015.zip` `0c34df072a3fa7efbb7cbf34950e1f971a4447cffe365d3a359e2d4089b958f5`.

## Files

Cut with fontTools (`pyftsubset`'s library) to woff2, all layout features kept (`--layout-features='*'`),
hinting dropped. The board Inter file is cut from the variable TTF with `opsz` fixed at its default (14) and the
`wght` axis kept. Rules, in the order the stack tries them:

| File                                      | Bytes | SHA-256                                                            | Range rule                                                                                                                                                   |
| ----------------------------------------- | ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inter-5.3.0-latin-var-wght.woff2`        | 48256 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` | Inter 4.001 as built by `@fontsource-variable/inter` 5.3.0, latin range; kept from before (the site's UI font)                                               |
| `inter-5.3.0-vietnamese-var-wght.woff2`   | 10252 | `5c66f9e07e90c6d4ac4922cc68d60de26c17b1858e677fb5e603fce3952b3ff2` | the same build, vietnamese range                                                                                                                             |
| `inter-4.1-board-var-wght.woff2`          | 34368 | `d7734cbb1ddbee9e082296e3c27977707d8cfe72a293f23bc5e693ca67d6631c` | what Inter has and the two above lack, that board text produces: Greek, super and subscripts, modifier letters, arrows and operators                         |
| `noto-sans-2.015-superscripts.woff2`      | 1832  | `4bd75090a8f89c776d6b9851e3626fc2f935d04ea47d422680f5305922e9b0e8` | the code points `typeset.ts` produces that no Inter file has: U+1D2C, U+1D2E, U+1D30-1D31, U+1D33-1D3A, U+1D3C, U+1D3E-1D42 (superscript capitals)           |
| `noto-sans-math-3.000-symbols.woff2`      | 25608 | `6bf41e031976ae4f850b35dc3a5064bbb67d88f4fc174ac6504aed9755e61baf` | the maths operators, relations, arrows, letterlike symbols and combining marks (U+20D0-20FF, U+2100-214F, U+2190-22FF, U+27F0-27FF, U+2500) that Inter lacks |
| `noto-sans-symbols-2-2.008-symbols.woff2` | 43116 | `2ea57e2827a3a62e65a64fd7ec90d45017dd493c75f1c7f103b6234e56e9ab80` | geometric shapes, miscellaneous symbols, dingbats and arrows (U+25A0-27BF, U+2B00-2BFF) that Inter and Noto Sans Math lack                                   |

The exact code points of every file are the `unicode-range` of its `@font-face` rule in `src/app.css`.
