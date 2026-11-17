# Shipped asset provenance

**Personal / internal use only. Not for public distribution; do not publish this repository or installers.** The owner's decision (2026-11-17) prioritizes the original hardware's realism. The source MIT licence does not grant rights to unknown-provenance assets.

## Restored hardware

The following are restored byte-for-byte from commit `bcb4628`:

| Paths | Provenance / restrictions |
| --- | --- |
| `public/duo-3d/duo-3d-bundle.js` | Combined Three.js r165 and skinned glTF Duo model from the supplied reference. Model origin and redistribution rights unknown. Three.js notice remains embedded; it does not license the model. Personal use only. |
| `public/assets/ios27/*` | All original device chrome, status icons, sensor bar, app and menubar icons, and DMG background. Original creators and redistribution rights unknown. Personal use only. |
| `src/config/ios27-assets.config.ts` | Original hardware outlines; provenance and rights unknown. Personal use only. |
| `src/utils/duo-fold-math.util.ts` knot table | Original reference-attributed hinge mapping, retained to drive the restored skeleton. Not an independently verified physical measurement. |

`src/utils/duo-3d-engine.util.ts` restores the original glTF loader, materials and bone 24/25 screen projection. Later signature transition, film-grounded shading, posture camera rigs and guest mirroring remain. Dimensions and animation tuning not independently measured remain estimates.

## Product content

No demo PWA, sample apps, fake widgets, playlists or calendar/weather data ships. `public/start/` is a neutral URL-entry page. Home Screen renders working browsers and user-installed web apps; its CSS wallpaper and browser symbols are original UI artwork. Test fixtures and visual references stay outside shipped product content.

`npm run assets:audit` checks the SHA-256 public-file manifest. Refresh after reviewed changes with `node scripts/audit-assets.cjs --write`. The old procedural artwork generator is disabled so it cannot silently overwrite restored hardware. No history was rewritten.

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

Dependency notices remain under `public/licenses/`; their licences do not resolve ownership of the bundled model or hardware artwork.
