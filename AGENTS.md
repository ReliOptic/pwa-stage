# Agent guide — pwa-stage (iPhone PWA Simulator)

Electron 44 + React 18 + TypeScript + Vite + Three.js. A floating iPhone / iPhone Duo simulator
for PWA developers, for macOS and Windows. **Personal / internal tool — not for public distribution**
(owner decision 2026-11-17): realism comes first, so bundled hardware assets of unknown provenance
(Duo 3D model, device chrome) are used as-is. Do not publish the repo or installers. Read `README.md` (behaviour) and `HANDOFF.md` §0 (architecture,
status, references) before changing anything.

## Commands
- `npm run typecheck` · `npm test` (vitest) · `npm run build` — all must pass before handing work back.

## Running the real app headless (needed for any visual check)
- `npm run build`, then drive Electron with Playwright's `_electron`:
  `NODE_PATH=$(npm root -g)`, executable `node_modules/electron/dist/electron`,
  args `['<repo>', '--no-sandbox', '--enable-unsafe-swiftshader']`,
  under `xvfb-run -a -s "-screen 0 1920x1200x24"`, with a fresh `HOME` per run.
- Capture with `BrowserWindow.getAllWindows()[0].webContents.capturePage()` via `app.evaluate`.
  Playwright `page.screenshot()` shows stale/blank `<webview>` content — never judge from it.
- Selectors: toolbar starts collapsed → `button[title^="Show Toolbar"]` (label is ⌘B on macOS, Ctrl+B elsewhere);
  device `select[aria-label="Device Model"]` (`iphone-duo-folded` / `iphone-duo-unfolded`);
  URL `input[aria-label="Page URL"]`; browser radios `button[role="radio"]` (Safari / Chrome / Web App);
  Duo fold `.tb-action:has-text("Unfold")` / `("Fold")` — Shift-click = 8× slow motion;
  hinge readout `.duo-angle-readout`; posture chips `.duo-posture-strip button`.
- Serve test pages from `127.0.0.1`. Bundled demo: `http://127.0.0.1:18765/reference.html`.
- Software rendering (SwiftShader): judge geometry, blur and brightness, not frame rate.

## Invariants (do not break)
- Security: do not weaken `src/services/security.ts`, the trusted-sender / payload validation in
  `src/index.ts`, `src/preload.ts`, or the CSP in `vite.config.ts`. Guests stay sandboxed, preload-free.
- iPhone Duo: exactly one live `<webview>` guest across folding — no reloads, page state kept.
  Never clip a guest to zero visible pixels (it stops producing frames and freezes its mirror).
- Resting postures (Book, Tabletop, Stand, free-stop slider) stay sharp and surface-mapped; the
  blurred anchored transition only runs while Fold / Unfold is animating.
- Emulation must not inject CSS that changes the page under test (layout, overflow, color-scheme).
- Bundled hardware assets (`public/duo-3d`, `public/assets/ios27`) are the realism baseline: never
  replace them with something that looks less real. Their provenance is tracked in `ASSETS.md`.
- No mock / sample content: no bundled demo pages, fake apps, fake widgets or placeholder data in the
  product. Test pages live outside the repo (scratch) or under `tests/`.
- Keep reference material (films, screenshots) outside the repo.
- Values that are estimates must be labelled as such in code/docs; do not present guesses as measurements.

## Working agreement
- Do not commit, push or rewrite history unless the task says so; leave changes in the working tree.
- Report: what changed and why, verification evidence (paths to captures), remaining uncertainty.
