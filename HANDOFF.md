# Handoff Guide for Codex — `ReliOptic/pwa-stage` (iPhone PWA Simulator)

This document captures the current architecture, verified state, exact remaining gaps, and next implementation priorities so Codex can continue seamlessly toward an open-source, pixel-accurate macOS simulator for Apple designers and iOS developers.

---

## 0. Status update (2026-11-16)

Done in this round (see README for user-facing behaviour):

- **Security**: `src/services/security.ts` (guest webPreferences enforcement, navigation/popup guards, iOS-style permission prompts, trusted-sender IPC), validated state in `storage.ts`, hardened `reboot-server.ts`, shell CSP (`vite.config.ts`), Electron 33 (EOL) → 44.
- **Emulation** (`services/emulation.ts`): DPR + screen via `setDeviceMetricsOverride(width:0,height:0)`, init script via `Page.addScriptToEvaluateOnNewDocument` (runs before page JS), `display-mode` / `navigator.vendor` / `userAgentData`, no page-altering CSS, re-applied on every `<webview>` resize.
- **Geometry** (`utils/viewport-math.util.ts`): `hasDuoSystemRail`, `resolvePageSafeArea`, status-bar-style aware web-app geometry, Safari bar collapse.
- **Duo**: posture animation no longer cancelled on Outer↔Inner swap; posture ↔ orientation sync; Stand uses the cover display; inner-display wake animation.
- **Devices**: viewport-class catalogue incl. SE (Touch ID chassis), 13 mini, 11 (@2x), 16e/14, 14 Plus, 16/16 Plus.
- **Home Screen / tools** (`renderer/components/ScreenLayers.tsx`, `renderer/useScreenController.ts`, `services/page-inspector.ts`): Home, Add to Home Screen, launch splash, permission alerts, Web App Check, screenshots, Xcode shortcuts.

Verification note: in headless Xvfb, Playwright's `page.screenshot()` of the shell can show stale/blank frames for the out-of-process `<webview>` after scrolling. Use `BrowserWindow.webContents.capturePage()` (what the app's Screenshot uses) for visual checks, and pass `--enable-unsafe-swiftshader` so WebGL works without a GPU.

### Should this become Rust / Tauri?

Assessed, not done. Tauri on macOS would render with WKWebView, which is *more* faithful (iOS Safari and Chrome are both WebKit) and ~10× smaller. But: there is no `<webview>` tag, so the page under test would be either an iframe (blocked by many sites' frame-ancestors) or a native child view that cannot be CSS-transformed, which rules out the live 3D Duo projection; and WebKit on macOS exposes no CDP equivalents for DPR/screen/touch/safe-area overrides. Recommended path: keep Electron as the device-shell, and use the built-in hand-off to the Xcode iOS Simulator for WebKit-exact checks. Revisit if a "WebKit-accurate, no 3D" mode is wanted.

### Next

1. Duo 3D slices still use a 44px radius instead of the glTF aperture squircle (Priority 1 below).
2. Keyboard: an iOS software keyboard that shrinks the visual viewport on input focus.
3. Optional Playwright-based visual regression suite using `capturePage()` on each viewport class.

## 1. Repository & Project Overview

- **GitHub Repo**: `https://github.com/ReliOptic/pwa-stage`
- **Stack**: Electron 33 + React 18 + TypeScript 5.6 + Vite 5 + Vitest 2 + Three.js r165 (`public/duo-3d/duo-3d-bundle.js`)
- **Primary Commands**:
  - `npm run typecheck` (`tsc --noEmit && tsc -p tsconfig.electron.json --noEmit`)
  - `npm test` (`vitest run` — 8 test files, 22 tests passing as of handoff)
  - `npm run build` (`tsc --noEmit && vite build && tsc -p tsconfig.electron.json`)
  - `npm run dist:app` / `npm run dist:dmg` (packages `iPhone PWA Simulator.app` via `electron-builder`)

---

## 2. What Is Already Implemented & Verified

### A. Apple Official 3D iPhone Duo Simulation (`__DUO_ASSET` + Three.js r165)
1. **3D Bundle** ([`public/duo-3d/duo-3d-bundle.js`](public/duo-3d/duo-3d-bundle.js), loaded in [`index.html`](index.html)):
   - Exposes `window.THREE` (Three.js r165) and `window.__DUO_ASSET` (98-node, 62-mesh skinned glTF model with 26-bone `Slider` folding animation).
2. **Non-Linear Hinge Math & Homography** ([`src/utils/duo-fold-math.util.ts`](src/utils/duo-fold-math.util.ts)):
   - `FOLD_CURVE_KNOTS`, `sampleFoldCurve`, `invertFoldCurve` (monotone cubic Hermite spline `u = θ/180 ↔ φ`).
   - `resolveDeviceHingeStatus` (`closed` `< 20°`, `partiallyOpen` `20°..165°`, `fullyOpen` `> 165°`).
   - `computeFoldDriveDurationMs` & `evaluateFoldDriveEasing` (directional timing + quintic C2 smoothstep).
   - `computeHomographyMatrix3d` (exact 8-DOF 4-point projective homography CSS `matrix3d(...)`).
3. **3D Hardware Engine** ([`src/utils/duo-3d-engine.util.ts`](src/utils/duo-3d-engine.util.ts)):
   - `Duo3DHardwareEngine` renders the skinned glTF chassis on a transparent WebGL canvas with studio PMREM environment lighting, Night Sky / Star White titanium finish toggle, 6 postures (`closed`, `standing`, `book`, `tabletop`, `open`, `portrait`), and interactive 3D orbit/pitch rotation.
4. **3D Stage & Frame-by-Frame Control Bar**:
   - [`src/renderer/components/Duo3DStage.tsx`](src/renderer/components/Duo3DStage.tsx): Mounts `Duo3DHardwareEngine` and projects the live `<WebviewContainer>` + `SystemOverlayLayer` onto `outer`, `left`, `right`, and `full` homography slices with crease valley shading.
   - [`src/renderer/components/DuoFoldMiniBar.tsx`](src/renderer/components/DuoFoldMiniBar.tsx): 6 posture chips (`닫힘 0°`, `세우기 70°`, `책처럼 100°`, `테이블 108°`, `펼침 180°`, `세로 180°`), `-1°` / `+1°` frame-step buttons (Shift+Click for `±5°`), `0°..180°` slider with detent ticks, `DeviceHinge.Status` pill, `θ · φ · W×H` telemetry, titanium finish dot, and 3D orbit reset button.
   - [`src/renderer/components/IphoneFrame.tsx`](src/renderer/components/IphoneFrame.tsx): Fixed the `useDuoHingeController` state-hijacking bug (`internalSyncTargetRef`) so internal angle syncs across `20°` never overwrite intermediate free-stop angles back to `0°` or `180°`.
   - [`src/utils/viewport-math.util.ts`](src/utils/viewport-math.util.ts): Keeps `stageFrameWidth = 991`, `stageFrameHeight = 718` (`DUO_BOTTOM_MINIBAR_RESERVE_HEIGHT = 64`) for both `IPHONE_DUO_FOLDED` and `IPHONE_DUO_UNFOLDED` so the macOS window does not resize or clip during 3D folding/unfolding.

### B. Standard iPhone & Floating UX Features
- Floating window with Always-on-Top toggle (`⌘T`), corner resize grips with aspect-ratio lock, drag-to-move, menu bar tray integration ([`src/services/menubar.ts`](src/services/menubar.ts)).
- Two swipe interaction modes (`눌러서 스와이프` vs `바로 스와이프`) via CDP touch emulation ([`src/services/emulation.ts`](src/services/emulation.ts)).
- Device presets in [`src/config/device-presets.config.ts`](src/config/device-presets.config.ts) (`iPhone 17`, `17 Air`, `17 Pro`, `17 Pro Max`, `iPhone Duo Outer`, `iPhone Duo Inner`, `iPhone 18` presets if configured).

---

## 3. Priority Next Tasks for Codex (Pixel-Perfect Apple Reference & Open-Source Polish)

Visual inspection of the `180°` open state and folding transitions revealed the exact areas that still need pixel-level refinement:

### Priority 1: Zero Pixel Bleed & Exact Bezel / Corner Geometry on `Duo3DStage`
- **Observed Issue**: In [`src/utils/duo-3d-engine.util.ts`](src/utils/duo-3d-engine.util.ts) (`getQuad3D`, lines 349–374), the projected quads currently use approximate coordinates (`x ∈ [-7.87, 7.87]`, `z ∈ [-5.49, 5.49]`, `y = 0.268` for inner; `x ∈ [-7.94, -0.25]`, `z ∈ [-5.56, 5.56]`, `y = -0.288` for outer) paired with CSS `borderRadius: '44px'` in [`src/renderer/components/Duo3DStage.tsx`](src/renderer/components/Duo3DStage.tsx) (lines 183–193). At `180°` and during intermediate fold/orbit angles, the webview corners slightly protrude onto the titanium bezel rim.
- **What to do**:
  1. Inspect the actual vertex bounds of the screen glass meshes in `window.__DUO_ASSET.gltf` (materials `idx === 7` and `idx === 8`, or the corresponding mesh nodes) at runtime or via a small Node script so `getQuad3D` uses the **exact inner-bezel aperture coordinates** (zero overhang, exact bezel thickness on all 4 edges and around the hinge).
  2. Replace circular `borderRadius: 44px` on `.duo-interactive-slice` with an **Apple continuous squircle SVG `clip-path` / `mask-image`** (reusing/extending [`src/utils/squircle.util.ts`](src/utils/squircle.util.ts)) matched to the glTF bezel corner curvature so **zero pixels ever bleed outside the bezel** at any angle `0°..180°` or any 3D orbit/pitch.
  3. Verify `devicePixelRatio` / subpixel rounding in `computeHomographyMatrix3d` and `.duo-interactive-slice` so the seam between `left` and `right` slices at `20°..179°` never shows a 1px gap or overlap.

### Priority 2: Synchronized Inner-Screen Motion & Apple Reference Animation Fidelity
- **Observed Issue**: Currently, when `isBentInner` is active (`20°..177°`), [`src/renderer/components/Duo3DStage.tsx`](src/renderer/components/Duo3DStage.tsx) mounts two separate `<WebviewContainer>` elements (`duo-slice-secondary` and `duo-slice-primary`). Independent `<webview>` instances can drift in scroll position, CSS/JS animations, or media playback during folding/unfolding.
- **What to do**:
  1. Synchronize scroll/state/animation clock between the two half-screen slices (or capture/mirror live DOM/canvas frames smoothly during active hinge motion while keeping the primary slice interactive, OR use an IPC/preload sync bridge so both halves stay frame-locked).
  2. Cross-check the inner-screen fold animation, hinge crease specular/shadow gradient, and outer↔inner handoff against the Apple reference implementation (`260923_Campsite_R23.html` / `260920_Campsite_R13.html` if present locally, or by tuning `computeDuoFoldMetrics` + `.duo-crease-leaf-shade` + `SystemOverlayLayer` safe areas).
  3. Visually verify all 6 postures (`0°`, `70°`, `100°`, `108°`, `180°`, `portrait 180°`) and intermediate scrub frames (`15°`, `30°`, `45°`, `135°`) via screenshots.

### Priority 3: Standard iPhone Bezel & Aspect Ratio Audit + Open-Source Readiness
- Audit bezel thicknesses, corner radii, Dynamic Island / cutout positions, and safe-area insets for all non-Duo presets in [`src/config/device-presets.config.ts`](src/config/device-presets.config.ts) and [`src/utils/viewport-math.util.ts`](src/utils/viewport-math.util.ts).
- Add a clean MIT `LICENSE`, contributor/developer setup instructions in `README.md`, and screenshot/GIF previews so Apple designers and iOS app developers can clone, `npm install && npm run dev:electron`, or download the `.dmg` with zero friction.

---

## 4. Key Files Map

| File | Purpose |
| :--- | :--- |
| `src/utils/duo-3d-engine.util.ts` | Three.js r165 WebGL renderer, glTF bone skinning, `getQuad3D`, 3D camera framing |
| `src/utils/duo-fold-math.util.ts` | `FoldCurve` spline, `DeviceHinge.Status`, `FoldDriver` easing, `matrix3d` homography |
| `src/renderer/components/Duo3DStage.tsx` | WebGL canvas + homography-projected live `<WebviewContainer>` slices + crease shading |
| `src/renderer/components/DuoFoldMiniBar.tsx` | 6 posture chips, `-1°`/`+1°` frame stepping, `0°..180°` slider, telemetry, finish toggle |
| `src/renderer/components/IphoneFrame.tsx` | `useDuoHingeController`, frame container, corner resize grips, mini-HUD |
| `src/utils/viewport-math.util.ts` | Viewport metrics, safe-area insets, Duo fixed stage sizing (`991×718`) |
| `src/utils/squircle.util.ts` | Apple continuous superellipse squircle path generator |
| `src/renderer/styles/simulator.css` | All frame, 3D stage, crease shading, and minibar styles |
| `public/duo-3d/duo-3d-bundle.js` | Bundled Three.js r165 + `window.__DUO_ASSET` glTF data |
