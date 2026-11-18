# iPhone PWA Simulator (`pwa-stage`)

A floating macOS and Windows iPhone (and iPhone Duo foldable) simulator for people who build
Progressive Web Apps: see your site the way Safari, Chrome for iOS and a Home
Screen web app present it, on every iPhone viewport class, without opening Xcode.

## What it simulates

| Area | Behaviour |
| --- | --- |
| **Devices** | One preset per iOS 26/27 *viewport class* (375×667 SE … 440×956 Pro Max, 390×844 notch, 414×896 @2x, Air, iPhone 18 projected, Duo cover/inner). Each lists every model sharing that viewport. Correct safe areas, display corner radii, Dynamic Island / notch / Touch ID chassis. |
| **Rendering** | `devicePixelRatio` 2/3, `screen.width/height`, mobile viewport (`<meta viewport>`), overlay scrollbars, touch events, `env(safe-area-inset-*)` via CDP. |
| **Identity** | Safari / Chrome iOS User-Agent (OS token frozen at `18_6` like Safari 26+), `navigator.vendor = "Apple Computer, Inc."`, no `navigator.userAgentData`, `navigator.standalone`. |
| **Safari** | iOS 26+ compact tab bar; collapses while you scroll down, growing `innerHeight` / `dvh` like a real device. ⋯ → Share → **Add to Home Screen**. Status-bar area tinted from `theme-color` / page background. |
| **Chrome for iOS** | Top omnibox + bottom toolbar; Share → Add to Home Screen. |
| **Web App (Home Screen)** | `display-mode: standalone`, and the status bar honours `apple-mobile-web-app-status-bar-style` (opaque by default, edge-to-edge only with `black-translucent`). |
| **Home Screen** | Xcode-style **Home** (⇧⌘H, home indicator, or the SE's home button): installed web apps with their real icon/name from the manifest, estimated launch animation and blank launch placeholder. |
| **Web App Check** | iOS-specific installability checks: HTTPS, viewport / `viewport-fit`, manifest, `display`, `apple-touch-icon`, status-bar style, service worker, startup image. |
| **Keyboard** | Focusing a text field raises the iOS keyboard: the layout viewport stays put, `visualViewport` shrinks and the field scrolls clear, as on device. Type with the desktop keyboard. |
| **Permissions** | Camera / mic / location / notifications / motion requests show an iOS alert inside the screen; desktop-only APIs are denied. |
| **iPhone Duo** | Restored skinned 3D hardware with six postures and free-stop scrub. One app instance moves between the two displays (scroll position and JS state carry over, nothing reloads). **Fold / Unfold plays the Duo's signature transition**: content stays anchored in space while the moving half passes over it like tracing paper, blurring and darkening towards its free edge; the cover shows the content lying beneath it, the half in your hand stays sharp, and the other half comes into focus as it lies flat. Shift-click Fold / Unfold for slow motion. At rest (Book, Tabletop, free-stop scrub) the inner display is one sharp, continuous page across the crease. 84pt iOS 27.3 system rail, span / split. |

On macOS, for the final pixel check use real WebKit: tray menu → **Open URL in Xcode iOS Simulator**.

## Install the page on the simulated Home Screen

Go Home and open Safari or Chrome from the dock. Enter the website in the device address field and press Enter. In Safari use **More → Share**. In Chrome use the share button beside the address. Choose **Add to Home Screen**, edit the name if desired, and press **Add**. The icon appears on the first Home page. With **Open as Web App** enabled it launches in standalone mode. Turning it off saves the current page as a browser shortcut.

In Safari, open the page menu (AA) and choose Website Settings. In Chrome, open More and choose Settings. Page zoom is saved for each site in each browser. Dark appearance updates the emulated color scheme. Both menus include search within the current page, bookmarks, browsing history, and sharing.

The Duo hinge bar supports dragging, keyboard arrows, pause, resume and reversal. Open **Posture and finish** for the pose presets. The compact bar above the preview expands to a device picker, browser and address field. **Device controls** opens zoom, pin, rotation and inspection. The bar stays in place while the device folds.

## Shortcuts (Xcode Simulator compatible)

| Keys | Action |
| --- | --- |
| ⇧⌘H | Home |
| ⌘S | Screenshot to Desktop (`Simulator Screenshot - <device> - <date>.png`) |
| ⌘← / ⌘→ | Rotate |
| ⇧⌘A | Toggle appearance (`prefers-color-scheme`) |
| ⌘R | Reload page |
| ⌘+ / ⌘− / ⌘0 | Zoom |
| ⌘T | Pin to current desktop |
| ⌘B | Show / hide toolbar |
| ⇧⌘S | Hide to menu bar (global) |

On macOS, pinning keeps the simulator above other windows on the current Space. Unpinning lets it follow Space changes at normal window level.

On Windows, replace ⌘ with Ctrl and ⇧ with Shift. Ctrl+T toggles **Always on top**
on the current virtual desktop. Ctrl+Shift+S hides/restores via the system tray.
Minimize uses the taskbar; closing (including Alt+F4) hides to the tray. Right-click
the tray icon to Quit. The toolbar has right-aligned minimize/close controls.
Resize using the corner grips or zoom controls; maximize is intentionally unavailable
for the transparent device window. A shortcut already reserved by another app may
not register globally; the tray remains available.

Shortcuts also work while the page under test has keyboard focus.

## Security model

- The page under test runs in a sandboxed `<webview>` with **no preload, no Node, context isolation**; attach-time preferences are enforced in the main process (`src/services/security.ts`).
- Only `http(s)` pages may load; popups navigate in place, the shell can't be navigated away.
- IPC answers only the shell's top frame; every payload is validated (state enums/URLs, guest ids must belong to the shell, window coordinates).
- The shell renderer is sandboxed with a production CSP.
- The local start-page server binds to `127.0.0.1`, rejects non-loopback `Host` headers, traversal and malformed encodings.
- Page responses keep their own security headers (no global `X-Frame-Options` / CSP stripping).

## Development

```bash
npm install
npm run typecheck
npm test
npm run dev:electron
```

## Build macOS App

```bash
npm run dist:app   # dist_dmg/mac-arm64/iPhone PWA Simulator.app
npm run dist:dmg   # .dmg installer
```

## Build Windows App (personal / internal use only)

```bash
npm run dist:win           # dist_dmg/*-x64-setup.exe (per-user NSIS installer)
npm run dist:win:portable  # dist_dmg/*-x64-portable.exe
```

The installer offers a destination, Start menu and Desktop shortcuts, and uninstall.
Build on Windows with Node 22 and `npm ci`; Linux cross-builds can disable signing with `-c.win.signExecutable=false`. Native OS execution must still be checked on Windows.
The checked-in multi-resolution ICO is derived from the existing app icon; regenerate
with `npm run assets:windows-icon` (Python + Pillow) after changing the source artwork.
CI is configured for Linux, Windows and macOS checks, runs real Electron regression flows on Linux, and builds NSIS on Windows. Installer artifacts
are retained only for private repositories; nothing is published as a release.
These internal builds are unsigned. Do not publish the repository or installers.

Settings use Electron's host `userData` directory (on Windows, under `%APPDATA%`).
Screenshots use the OS Desktop path, including a redirected Desktop, with Windows-safe
filenames. Xcode handoff is available only on macOS. Rendering/emulation is shared
across platforms and uses Chromium, not WebKit.

## License

**Personal / internal tool — not for public distribution. Do not publish the repository or installers.** Application source is covered by [MIT](LICENSE); this does not license the bundled hardware artwork/model, whose provenance and redistribution rights are unknown. See [ASSETS.md](ASSETS.md). This project is not affiliated with Apple; projected device geometry and animation tuning are estimates.

The default start page asks for a website URL. Home Screen contains Safari, Chrome, and only web apps you add through the browser's Add to Home Screen flow.

See [`HANDOFF.md`](HANDOFF.md) for architecture notes and the roadmap.

Home Screen reference audit and asset licence limitations: [spec](docs/ios-home-screen-spec.md). Official iOS 27.3 visual fidelity is not verified.

## Completion build 1.0.2

The first request and first page script now see the mobile environment. Internal navigation updates the saved URL. Manifest paths use the final manifest URL; foreign/unsafe launch URLs fall back to the current page. Split comparison keeps two independent pages alive across folding and exposes a **Compare** URL field. Touch mode converts mouse drags to touch; Mouse mode supports hover/selection. Compact Home pagination remains clickable beside the search controls.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:electron
npm run test:visual
```

The Electron suite uses isolated user data and local fixtures under `tests/`; it emits JSON and actual compositor screenshots. In restricted Linux containers that cannot initialize Chromium's sandbox, use `SIMULATOR_TEST_NO_SANDBOX=1` for this test runner only. The shipped app's guests keep their sandbox and preload-free preferences. `SIMULATOR_TEST_OUTPUT` chooses the evidence directory.

The slab frame now uses the bundled hardware artwork, registered and rotated with the display. Duo clips the page to the actual bundled glass mesh contour, including its moving transition stencil. The original assets are unchanged. `test:visual` checks all 15 slab presets in portrait and landscape and six Duo poses at 2× output density and waits for every guest/mirrored leaf to paint before recording evidence. See [visual verification](docs/visual-verification.md) for the measured scope and limits.

`display-mode` CSS emulation covers nested rules and dynamically added accessible stylesheets. Browser origin protections still apply to cross-origin CSS; validate those cases in real WebKit. This tool does not replace iOS device testing. Internal build 1.0.3 has been exercised on Linux Electron; macOS and Windows packages are cross-built and unsigned.

In the front Span view, the app hands off between the cover and inner displays at 70% open (126°). Between 108° and 144° the moving inner glass comes into focus. The held half stays sharp, and the angle slider previews the same effect while dragging. Releasing the slider restores sharp glass and keeps the selected display profile.

Duo controls: click Open / Close again to reverse, Escape or Pause to stop, and Resume to continue. Drag the wider angle slider for direct control without changing the selected camera; Home / End and arrow keys work when it has focus. Shift-click Open / Close for 8× slow playback. See [interaction review](docs/fold-interaction-review.md) for the Apple reference, corrections and verification limits.

When the system has Reduce Motion enabled, Duo opens and closes immediately. Choose **Enable motion** next to Open to preview the fold animation. The setting is saved on this computer. Clear **Always animate folding** in the posture controls to follow the system again.
