# Shipped asset provenance

This register covers the current working tree, not earlier commits. Original work
listed here is licensed under the repository [MIT licence](LICENSE). No Apple
resource, extracted model, photograph, downloaded font, or third-party demo is
included. Device dimensions, surface radii and animation tuning are estimates.
The retained `ios27` and `reboot` directory names are compatibility paths, not
claims about origin or vendor endorsement.

## Original artwork and demo

| Shipped path | Creation source / method | Licence |
| --- | --- | --- |
| `public/assets/ios27/chrome-phone11.png` | `scripts/generate-assets.py`: layered rounded chassis | MIT |
| `public/assets/ios27/chrome-phone12.png` | Same generator, alternate canvas dimensions | MIT |
| `public/assets/ios27/chrome-phone-air.png` | Same generator, alternate canvas dimensions | MIT |
| `public/assets/ios27/chrome-phone14.png` | Same generator, tall inner display canvas | MIT |
| `public/assets/ios27/chrome-phone14-wide.png` | Same generator, wide inner display canvas | MIT |
| `public/assets/ios27/chrome-phone15.png` | Same generator, cover display canvas | MIT |
| `public/assets/ios27/status-cellular-{light,dark}.png` | Same generator: four rounded bars | MIT |
| `public/assets/ios27/status-wifi-{light,dark}.png` | Same generator: circular arcs and dot | MIT |
| `public/assets/ios27/status-battery-{light,dark}.png` | Same generator: rounded outlines, fill and terminal | MIT |
| `public/assets/ios27/notch-sensor-bar-03.png` | Same generator: speaker slot and concentric lens circles | MIT |
| `public/assets/ios27/icon-512.png` | Same generator: split-window mark on diagonal lines | MIT |
| `public/assets/ios27/menubar-iconTemplate{,@2x}.png` | Same generator: monochrome split-window outline | MIT |
| `public/assets/ios27/dmg-background.png` | Same generator: geometric panels, lines and installation arrow | MIT |
| `public/reboot/icon.png` | Generator copies the original application mark | MIT |
| `public/reboot/reference.html` | Hand-authored Field Notes demo, original text | MIT |
| `public/reboot/studio.css` | Hand-authored layout, CSS hills, sun and abstract shape | MIT |
| `public/reboot/studio.js` | Hand-authored notes, palette, counter and viewport logic | MIT |
| `public/reboot/manifest.json`, `public/reboot/sw.js` | Hand-authored installation metadata and offline cache | MIT |
| `src/utils/duo-procedural-model.util.ts` (compiled into renderer) | Original extruded rounded leaves, optical cylinders, segmented hinge and controls; generated at runtime without model data | MIT |
| `src/config/ios27-assets.config.ts` (compiled into renderer) | Original quadratic notch and rounded cover outline | MIT |
| Other `src/**`, `index.html`, generated CSS/JS in `dist/**` and `dist-electron/**` | Repository application source; UI geometry, gradients and text. Fonts resolve to the host system; no font files ship. Dependency portions are covered below. | MIT / notices below |

Regenerate every PNG with `npm run assets:generate` (Python 3 + Pillow). The script
reads no input artwork or fonts. `scripts/asset-manifest.json` records each public
file and the vendored Three.js file by SHA-256; `npm run assets:audit` checks for
changed, missing and unregistered files. After intentional asset changes, refresh
with `node scripts/audit-assets.cjs --write` and review the manifest diff.

## Permissive third-party code

| Code | Exact source | Retained notice |
| --- | --- | --- |
| Three.js r165 / 0.165.0 | `https://registry.npmjs.org/three/-/three-0.165.0.tgz`, `package/build/three.module.min.js` copied verbatim to `src/vendor/three.module.js` | `public/licenses/three-MIT.txt` |
| React 18.3.1, React DOM 18.3.1, scheduler 0.23.2 | npm releases pinned by `package-lock.json` | `public/licenses/{react,react-dom,scheduler}.txt` (MIT) |
| Lucide React 1.57.0 | Locked npm release; UI icon paths | `public/licenses/lucide-react.txt` (ISC and embedded icon notices) |
| js-tokens 4.0.0, loose-envify 1.4.0 | Locked npm runtime dependencies | `public/licenses/{js-tokens,loose-envify}.txt` (MIT) |
| @types/prop-types 15.7.15, @types/react 18.3.31, csstype 3.2.3 | Locked production dependency graph; type declarations | `public/licenses/{@types_prop-types,@types_react,csstype}.txt` (MIT) |
| DuoKit transition reference | Public PR 2 / ANIMATION.md informed the existing dim ramp; conservatively retain upstream attribution even though no asset or shader is bundled | `public/licenses/duokit-MIT.txt`, fetched from `https://raw.githubusercontent.com/arjunkshah12345-hash/duokit/main/LICENSE` on 2026-11-17 |
| Electron 44.11.3 / Chromium and dependencies | Locked Electron runtime; packaging downloads the target-platform runtime | `public/licenses/electron-LICENSE`, `public/licenses/electron-LICENSES.chromium.html`; preserve the target distribution's own notices too |

Three.js archive SHA-256:
`fbe58b074968955ac2089b0cd70acd7dd9f3992e137760cb56541c2dbeae9952`.
Module SHA-256:
`1af5bef9a9fd79fcb73fcfd3e4dd2ac0cea8720205bc7607d67369ce194a87fa`.
The old combined Three.js / model bundle is deleted, not mined for reusable code.

`npm run assets:notices` copies installed runtime notices verbatim. Build tools
are not explicitly included in the packaging file list; electron-builder still
includes production dependencies. Electron's aggregate notice includes the
runtime's many independently licensed components; it is not relicensed as MIT.
Generated application code is MIT except for the explicitly identified upstream
portions. A macOS distribution must retain its own Electron/Chromium notices.

## Removed material and history

Unknown-origin PNGs at **all** `public/assets/ios27/*.png` paths were replaced.
`public/duo-3d/duo-3d-bundle.js` and **all previous** `public/reboot/**` files were
removed, including posters, branded vistas and games. The reference-attributed
hinge knot table and detailed SVG outlines were replaced with original geometry.
The engine no longer reads glTF, skin weights, animations, or bones.

Earlier commits still contain those bytes. If the owner chooses to purge history,
the historical paths above, `src/config/ios27-assets.config.ts` (old outlines), and
`src/utils/duo-fold-math.util.ts` (old reference-attributed knots) should be included
in that review. No history rewrite was performed. This inventory establishes
sources for the replacement artwork; it does not resolve hardware trade dress,
product naming, or ownership of the pre-existing application source.
