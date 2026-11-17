# Handoff Guide for Codex — `ReliOptic/pwa-stage` (iPhone PWA Simulator)

This document captures the current architecture, verified state, exact remaining gaps, and next implementation priorities so Codex can continue seamlessly toward a personal, pixel-accurate simulator for Apple designers and iOS developers.

---

## 0. Status update (2026-11-17)

### Interaction build 1.0.3 (2026-11-17)

Apple's official product page and opening/closing film segments were inspected again after the owner reported difficult, unnatural controls. See `docs/fold-interaction-review.md` for the reference and limits.

- One target-aware controller handles toolbar and stage fold commands; repeat clicks reverse the destination from the current position/velocity.
- Critically damped playback (estimated simulator tuning), Escape pause, resume, direct slider takeover, and reduced motion.
- Angle scrubbing preserves the selected camera; Stand retains its cover rig. Display emulation follows the actual handoff instead of jumping on a destination click.
- Two control rows, 36 px primary targets, a flexible slider and a 20 px thumb; 112 px window reserve. Canvas/projection update in one pre-paint layout pass.
- `tests/electron/motion.cjs` exercises real pointer and keyboard controls and guest continuity. `SIMULATOR_RECORD_MOTION=1` writes compositor frames and angle/time metadata.

### Completion build 1.0.2 (2026-11-17)

Based on `f4c2db0`, with completion changes on `codex/complete-simulator`. The owner explicitly requested committing and pushing this work.

- Guests attach to an inert `about:blank`, then await CDP `Page.enable`, identity, metrics and init script before loading their first HTTP(S) URL. Per-guest updates are serialized.
- Primary and comparison navigation update their respective persisted URLs. Start-page submission and reload retain the destination.
- Manifest members resolve against the final response URL after redirects. Launch URLs must be HTTP(S), on the document origin; invalid scope falls back to the launch directory.
- Duo Span retains one guest. Split retains exactly two guests through Open / Book / Closed / Open, with a separate comparison URL. Shared Home/system chrome still spans the display.
- Nested and dynamically inserted accessible stylesheets get display-mode emulation; cross-origin CSSOM restrictions remain intact.
- Input modes now use CDP mouse-to-touch conversion: Touch drags and Mouse hover/selection. Legacy `touchCursorEnabled` storage name is retained for compatibility.
- Compact Home pagination has separate 24px hit targets; row capacity adjusts to available space. Expanded toolbar has a minimum usable width.
- `npm run test:electron` runs four real Electron regression scenarios (initial HTTP/boot identity + reload + nested/lazy CSS + input + navigation, Start/Home, Duo Split, Safari/Chrome install + Span continuity). It writes JSON, logs and `capturePage()` PNGs to a temporary directory, or `SIMULATOR_TEST_OUTPUT`.
- Frame: restored slab artwork is now actually rendered, with image-body gutter registration and landscape rotation. Side buttons are not duplicated. SE keeps its existing CSS chassis and its buttons rotate with the body.
- Duo aperture: inner/outer mesh positions provide bounds, bind-plane depth and convex contours; CSS aperture masks and camera-projected transition stencils share those contours. Occlusion uses the same screen plane. No hardware asset bytes changed.
- Verification: typecheck, build, 107 unit/integration tests, asset audit (34 entries), four real Electron scenarios, and 19 display/posture pixel checks at 2× output density. Linux Xvfb + SwiftShader; no native Windows/macOS execution or GPU performance claim. Unsigned internal packages only. See `docs/visual-verification.md`.
- Remaining platform limits: Chromium is not iOS WebKit; cross-origin stylesheets cannot be patched through page CSSOM; keyboard/launch/fold visuals remain estimates. macOS/Windows native smoke checks and signing remain outside this environment.

### Hardware restoration / content removal (2026-11-17; current owner decision)

Personal / internal tool; do not publish the repository or installers. The rejected clean-room hardware is replaced byte-for-byte from `bcb4628`: skinned glTF bundle, hardware images, outlines and hinge knots. The loader again uses `window.__DUO_ASSET` and bones 24/25. Later transition shading/projection, posture rigs, guest mirror, keyboard, install flow, inspector, security and emulation remain. No procedural model remains. The neutral `public/start/` URL-entry page replaces the demo; Home shows browsers and user-added apps only, retaining measured layout geometry. See `ASSETS.md` for unknown provenance restrictions. Historical claims below are not current provenance guarantees.

### Reference audit (2026-11-17; supersedes transition provenance below)

Apple's US product film and Armand Sumo's opening excerpt were downloaded and
inspected, including opening at ~75.6–77.3 s and closing at ~174.4–175.3 s in
the product film. These are individual hand movements, not an OS timing spec.
The transition now uses a sharp hinge layer, five progressive blur layers,
DuoKit PR 2's explicitly eye-tuned dim curve, and hinge-to-edge gradients
projected with the moving leaf. Front framing is fixed across the sweep.
Only active animations use the effect; resting slider positions stay sharp.
Peak CSS blur, easing, exact wake thresholds and crease remain uncalibrated;
the film's soft black corner treatment is not fully reproduced.
No Apple assets were added to the repository. Sources, angle-approximate
opening/closing comparisons and verification are in the task scratchpad's
`report-1.md`. Typecheck, 60 tests and build pass; Electron verification covers
six postures and preserves one guest with one page load across folding.

Done in this round (see README for user-facing behaviour):

- **Security**: `src/services/security.ts` (guest webPreferences enforcement, navigation/popup guards, iOS-style permission prompts, trusted-sender IPC), validated state in `storage.ts`, hardened `reboot-server.ts`, shell CSP (`vite.config.ts`), Electron 33 (EOL) → 44.
- **Emulation** (`services/emulation.ts`): DPR + screen via `setDeviceMetricsOverride(width:0,height:0)`, init script via `Page.addScriptToEvaluateOnNewDocument` (runs before page JS), `display-mode` / `navigator.vendor` / `userAgentData`, no page-altering CSS. Guest canvas is white like iOS (webviews are transparent by default).
- **Geometry** (`utils/viewport-math.util.ts`): `hasDuoSystemRail`, `resolvePageSafeArea`, status-bar-style aware web-app geometry, Safari bar collapse.
- **Duo**: posture animation no longer cancelled on Outer↔Inner swap; posture ↔ orientation sync; Stand uses the cover display; inner-display wake animation.
- **Devices**: viewport-class catalogue incl. SE (Touch ID chassis), 13 mini, 11 (@2x), 16e/14, 14 Plus, 16/16 Plus.
- **Home Screen / tools** (`renderer/components/ScreenLayers.tsx`, `renderer/useScreenController.ts`, `services/page-inspector.ts`): Home, Add to Home Screen, launch splash, permission alerts, Web App Check, screenshots, Xcode shortcuts.

- **Audit fixes**: `<webview>` `src` changes made before attach are caught up on first dom-ready (Duo primary slice showed a stale URL); Dynamic Island / notch drawn on the leading edge in landscape; Safari/Chrome top bar = status bar height only (0 in landscape, 20pt on SE); Home Screen content stays clear of the Duo rail.

- **Duo crease**: both leaves share one hinge edge (midpoint of the two bones) and guests are opaque, which removed a light 1px seam at mid-fold angles. A faint dark hairline can remain in the crease under software compositing; not yet checked on a real GPU.
- **Software keyboard** (`SoftwareKeyboard.tsx`, `resolveKeyboardHeight`, guest script in `emulation.ts`).

- **Duo display continuity** (`services/guest-mirror.ts`, `GuestMirrorPane.tsx`, `duo-3d-engine.util.ts`):
  - exactly one `<webview>` guest; it moves between cover and inner at `COVER_HANDOFF_DEG` (2°; hinge status thresholds are separate), so state survives folding;
  - the left/top half of the bent inner display is a live frame mirror of that guest (capture loop in main, ≤30 fps, ~24 fps under SwiftShader) with pointer and wheel input forwarded, replacing the old second, unsynchronised page;
  - the lit display wakes with a 380 ms time-based fade instead of angle-driven opacity;
  - `rightVisibleClip` hides the part of the right leaf that the raised left leaf occludes from the camera.
  - Known limits: the mirrored half lags the live half by about one frame while scrolling; Split mode still runs two independent pages by design.
- **Signature opening / closing transition** (`transition` in `duo-3d-engine.util.ts`, `AnchoredFace` in `Duo3DStage.tsx`). Built from public descriptions, not from Apple source:
  - references: gulfnews.com (blur-and-stretch hand-off), wikitree.co.kr/articles/1158746 (content passes through the moving half, comes into focus while opening), zdnet.co.kr 20260911085502 (cover connects into the inner display), armandsumo.com/posts/iphone-duo-transition (tracing-paper model: blur + stencil keeps content anchored), github.com/chuspeeism/iphone-duo (MIT study: only the cover half rotates, fixed front-view projection, cover shows the right-hand part of the inner picture aligned to its hinge edge, blur/dim follow image coordinates), github.com/arjunkshah12345-hash/duokit PR 2 (measured against Apple's film: linear blur ramp, free edge ≈10% brightness, held half untouched, inner lit over 2–20°);
  - implementation: runs when the device swings between closed and open (posture `closed`/`open`, 2°..179°) under a steady front camera; the inner picture is laid out on the unfolded plane (`transition.flat`) and each screen of the moving leaf shows the region seen through it (`coverClip` / `leftClip`, camera-projected stencils), with four blur bands and a dim gradient from hinge to free edge; app layout hands off at `COVER_HANDOFF_DEG` (2°) and the cover keeps its last picture until the inner layout has settled;
  - not verified against Apple's film frame by frame (the film is not in the repo and video cannot be fetched here): peak blur (`TRANSITION_MAX_BLUR_PX` = 40pt), dim curve, the 1.4 s duration and the camera glide are estimates. For pages whose cover layout differs from the right half of their inner layout, the picture changes once near 10°; on Apple's home screen those two are designed to match.

Verification note: in headless Xvfb, Playwright's `page.screenshot()` of the shell can show stale/blank frames for the out-of-process `<webview>` after scrolling. Use `BrowserWindow.webContents.capturePage()` (what the app's Screenshot uses) for visual checks, and pass `--enable-unsafe-swiftshader` so WebGL works without a GPU.

### Should this become Rust / Tauri?

Assessed, not done. Tauri on macOS would render with WKWebView, which is *more* faithful (iOS Safari and Chrome are both WebKit) and ~10× smaller. But: there is no `<webview>` tag, so the page under test would be either an iframe (blocked by many sites' frame-ancestors) or a native child view that cannot be CSS-transformed, which rules out the live 3D Duo projection; and WebKit on macOS exposes no CDP equivalents for DPR/screen/touch/safe-area overrides. Recommended path: keep Electron as the device-shell, and use the built-in hand-off to the Xcode iOS Simulator for WebKit-exact checks. Revisit if a "WebKit-accurate, no 3D" mode is wanted.

### Next

1. Glass-contour masking and six resting Duo postures are now covered by `test:visual`. Physical-device calibration, arbitrary orbit angles and frame-by-frame motion fidelity remain unverified; the existing film-derived timing/blur remains an estimate.
2. Keyboard is visual only (type with the Mac keyboard); heights are approximations of UIKit's frame, and Safari's bar does not yet ride above it.
3. Extend the compositor pixel suite to native Windows/macOS hardware and arbitrary orbit angles. The Linux suite uses `capturePage()` and a color round trip to reject stale guest/mirror frames.

## 1. Repository & Project Overview

- **GitHub Repo**: `https://github.com/ReliOptic/pwa-stage`
- **Stack**: Electron 44 + React 18 + TypeScript 5.6 + Vite 5 + Vitest 2 + Three.js r165 (`public/duo-3d/duo-3d-bundle.js`)
- **Primary Commands**:
  - `npm run typecheck` (`tsc --noEmit && tsc -p tsconfig.electron.json --noEmit`)
  - `npm test` (`vitest run` — 19 test files, 107 tests at completion build 1.0.2)
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
