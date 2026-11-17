# Home layout reference measurements (2026-11-17)

This is a geometry reconstruction with **original artwork**, not a certified iOS
27.3 rendering. No reference artwork, Apple font or SF Symbols file is included.
The small, labelled, default-colour icon appearance is the benchmark. User-edited
Home layouts and large/tinted/clear icons are outside this implementation.

## Sources and method

- **S1**: [Apple, iOS 26 announcement, 9 June 2025](https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/),
  [Home Screen customization image](https://www.apple.com/newsroom/images/2025/06/apple-elevates-the-iphone-experience-with-ios-26/article/Apple-WWDC25-iOS-26-Home-Screen-customization-250609_big.jpg.large_2x.jpg).
  1960×1102 JPEG; use the right, normal-colour phone. Approximate aperture
  x=1298..1720, y=92..1010. Normalize by 402/422 horizontally, 874/918 vertically.
  Aspect ratio is consistent with the repository's 402×874 class; device identity
  and exact simulator scaling are inferred, not supplied by the image.
- **S2**: [Apple iPhone Duo product page](https://www.apple.com/iphone-duo/),
  [official product film playlist](https://www.apple.com/105/media/us/iphone-duo/2026/9305e4b9-72d9-4c05-9381-b572adadd5e5/films/product/iphone-duo-product-tpl-us-2026_16x9.m3u8).
  Inspect the already downloaded 1920×1080 film at **74.0s** (clear cover) and
  **77.3s** (open, sharp inner). Cover aperture approximately x=754..1173,
  y=223..820; inner x=556..1397, y=223..808. Normalize independently to the
  existing presets, 466×678 and 951×669. This ignores mild perspective and
  lens distortion. Positions have about ±5–10pt uncertainty. No 27.3 build
  number is visible. The film's September 1 calendar is not a build identifier.
- **S3**: [Apple software design announcement](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/).
  Supports layered, translucent Liquid Glass treatment, **not** numerical blur,
  opacity, corner or animation constants.
- **S4**: [Apple iOS 26 feature list](https://www.apple.com/os/pdf/All_New_Features_iOS_26_Sept_2025.pdf).
  Documents light/dark/tinted/clear customization; no Home point-coordinate spec.
- The iPhone 18 product URL redirected to the general iPhone page in this audit.
  It supplies no independent standard-phone 27.3 Home measurement.

All source images/film stay in the external task-4 scratch directory (or its
sibling `references` directory). The comparison sheets include source versions
and explicitly distinguish geometry estimates from implementation choices.
No image was traced to reproduce an icon, wallpaper or widget illustration.

## Measurements

Coordinates originate at the display's upper-left, excluding the chassis.
**M** = measured pixels normalized using the inferred point viewport, medium
confidence; **L** = low-confidence extrapolation or visual fit; **H** = directly
counted structural fact. No numerical value below is an Apple API contract.

| Feature | Raw evidence | Point estimate / implementation | Confidence, source |
| --- | --- | --- | --- |
| Standard grid | Four columns, four icon rows under two square widgets | 4 columns; widgets consume approximately 2 rows of a 6-row layout | H, S1 |
| Standard small icon | x≈1330..1396, y≈398..465 | 63–64pt square at 402×874; implemented 64 | M, S1 |
| Continuous corners | Smooth transition into straight edges; exact path unavailable | Original exponent-4.5 superellipse sampled at 128 points, not Apple's curve | L visual fit, S1/S2 |
| Standard horizontal centers | x≈1363,1460,1557,1654 | ~92.4pt pitch; implemented 93.3 at 402 (28pt side inset) | M, S1 |
| Standard row origins | y≈398,503,608,713 | y≈291,391,491,591pt; implemented 290,390,490,590 | M, S1 |
| Standard labels | ~13 raster pixels high, beneath icons | 12pt regular Arial, 14pt line, 5pt gap; substitutes for system font | M size / L font substitute, S1 |
| Small widgets | x≈1326..1498 and1519..1691, y≈186..358 | ~164×164pt, y≈90pt; implemented162×162 at x28/212, y90 | M, S1 |
| Widget corners | ~25 raster pixels at broadest bend | 24pt rounded approximation | L, S1 |
| Standard dock | x≈1316..1703, y≈887..993 | ~369×101pt, bottom16pt; implementation370×100, bottom18, radius38 | M extent / L corner, S1 |
| Search pill | x≈1468..1550, y≈834..863 | ~78×28pt, top706pt; implemented content-width ~78, top706 | M, S1 |
| Page dots | Replaced by Search in standard idle reference | Real pages only; 7pt dots, 9pt gap when overflow exists | H visibility / L dimensions, S1/S2 |
| Standard status | Time center≈(1375,126), island≈(1508,126) | Time ~73pt from left, ~32pt from top; existing preset status layer retained (62pt top safe area on402) | M position, S1; safe area is existing catalogue |
| Duo cover widgets | x≈778..917 and934..1075; y≈271..410 | ~155–157pt, left27pt, top54pt; implemented155, left28, top54 | M, S2 74s |
| Duo cover grid | x≈785..839; next columns≈862,940,1017; rows y≈445,531,617,703 | ~60pt icons, ~87pt x pitch, ~98pt y pitch; implemented60,90.7,100 | M, S2 74s |
| Duo cover dock | x≈1097..1160, y≈440..672 | ~70×264pt, top246pt; implemented72×266, top246 | M, S2 74s |
| Duo inner widgets | x≈966..1108 and1125..1267, y≈270..408 | ~160×158pt, x≈464, top54; implemented159×159 at462 | M, S2 77.3s |
| Duo inner grid | x≈970..1024, column pitch≈78; y≈442,529,616,703 | ~61pt icons,88pt x pitch,100pt y pitch; implemented60,93.3,99.7 | M, S2 77.3s |
| Inner extra widgets | x≈615..913, upper y≈268..408; lower y≈442..755 | ~337×160 and337×358pt, x67,y52/250; implemented338×160 and338×358 at66,y52/250 | M, S2 77.3s |
| Duo rail | Last ~74px of inner aperture / ~75px cover | ~84pt; **84 is retained from preset and owner requirement**, image consistent within uncertainty | M visual consistency; not independently confirmed UIKit metric, S2 |
| Inner vertical dock | x≈1322..1387, y≈412..645 | ~74×266pt, top216; implemented72×266 at x873,y217.5 | M, S2 77.3s |
| Duo dock icons | ~43px squares | ~48pt; implemented48 | M, S2 |
| Duo search | Circle≈42px diameter at rail bottom | ~48pt diameter, bottom18; implemented48 | M, S2 |
| Duo time/ring | Inner time baseline≈333; cover≈363 | Inner time top~108pt, cover~144pt; existing ring glyph retained | M positions, S2 |
| Glass | Translucent dock and Search, light edge, background visible | CSS blur24px/saturate130%, fill #d8f3ef26, 1px rim; no optical refraction | L, original visual approximation of S1/S3 |
| App open/close | No version-identifiable, frame-timed launch sample calibrated in this audit | Retain estimated420/320ms zoom; blank launch placeholder minimum650ms. Splash and Home zoom now share tapped-icon origin. Reduced-motion CSS uses1ms | L, simulator timing, **not measured** |

## Per-device adaptation

Only the 402×874 and Duo classes have normalized imagery in this audit. All other
rows are **low-confidence derived layouts**, not individually measured iPhones.
The layout helper is `src/utils/home-layout.util.ts`; DPR does not multiply points.
All slab classes have four columns and four rows below the two widgets.

| Logical class | Icon | Side inset | Small widget | Widget top (preset safe top + offset) |
| --- | ---: | ---: | ---: | ---: |
| 375×667 SE | 60 | 28 | 148.5 | 38 |
| 375×812 mini | 60 | 28 | 148.5 | 78 |
| 390×844 notch / projected18e | 60 | 28 | 156 | 75 /87 |
| 393×852 | 60 | 28 | 157.5 | 87 |
| 402×874 | 64 | 28 | 162 | 90 |
| 414×896 | 64 | 28 | 168 | 76 |
| 420×912 Air | 64 | 28 | 171 | 90 |
| 428×926 | 64 | 28 | 175 | 75 |
| 430×932 | 64 | 28 | 176 | 87 |
| 440×956 | 64 | 28 | 181 | 90 |
| 466×678 Duo cover | 60 (dock48) | 28, excludes84 rail | 155 | 54 |
| 951×669 Duo inner | 60 (dock48) | right app area starts462 | 159 | 54 |

The helper caps slab panel width at390pt; larger portrait Duo (669×951) centers
that panel with horizontal dock. Rotated slabs use two icon rows, no widgets,
and a bottom dock. These rotation behaviours are **simulator fallbacks**, not
claims that every iOS device rotates SpringBoard. SE uses an8pt dock bottom
and compressed row pitch (~76pt); others cap vertical pitch at100pt. Unit tests
cover safe-area clearance and no label/dock overlap for every preset.

## Behaviour, artwork and limits

- Procedural layered landscape, 16 hand-drawn neutral SVG symbols, calendar,
  sample weather, sample agenda and sample playlist are authored in code.
  They deliberately differ from Apple artwork. Illustrative tiles are disabled,
  not pretend native applications. Browser dock icons are original symbols.
- Installed sites retain their names and manifest/apple-touch-icon artwork.
  Installed apps replace illustrative cells first; overflow pages stay reachable.
  Search filters installed sites only. Page/search state is shared across Duo
  surface copies. Animated copies are inert; bent resting surfaces remain sharp.
- Both cover and inner have a true vertical dock; Home makes the existing system
  rail background transparent without changing its status glyph assets.
- The Home layer is included on the secondary bent leaf and anchored transition
  layers. Guest ownership, capture, emulation, security and fold timing are untouched.
- Home still has the existing bottom home indicator; it is absent in the chosen
  Duo film frame. Existing hardware cutout/status glyphs differ from the film;
  these belong to the parallel asset task. A now-playing island is not simulated.
- Launch zoom is not a spring-calibrated iOS transition, nor a native snapshot
  animation. Source-icon origins after rotation/folding remain approximate.
- No optional screenshot loader: original artwork is the only bundled mode.
  No unlicensed artwork is necessary to implement geometry. Prior wording that
  runtime artwork permission blocked layout work is superseded by this approach.
- No final27.3 fidelity claim: a build-identifiable screenshot/timing capture and
  on-device per-class checks remain necessary for tighter calibration.
