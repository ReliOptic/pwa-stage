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

The Electron preview negotiates a mobile site on the first request. Cross-site players and background workers receive the selected mobile browser identity. An embedded frame keeps its own layout width and reports the selected device’s logical screen and pixel ratio. Chromium still evaluates legacy CSS device-size queries in some isolated frames using the host display. Public YouTube viewing links open on `m.youtube.com`. Embedded videos, explicit desktop links and redirects chosen by the site keep their destinations. Opening the Vite shell directly in a desktop browser gives an iframe layout preview with the host browser’s network identity.

On macOS, for the final pixel check use real WebKit: tray menu → **Open URL in Xcode iOS Simulator**.

## Run simulated customer journeys

Choose **Agent** on the simulator toolbar. Set the goal in the side panel, then choose **Start visits**. Watch the isolated visitor’s page move in the simulator as the model reads and acts. Open visit history to inspect an earlier step and choose **Follow live visit** to rejoin. Close Agent to return to your device. The visit continues in the background. On small displays, the panel uses the available window. Supply an HTTP(S) address, a localhost development server, a file, or a built site folder with `index.html`. A file opens on a temporary loopback address and exposes only that file. Choose its folder to load relative assets. Local sources close when the app quits. A backend-driven project needs its running server.

**Check installation** takes one or more addresses, devices and browsers, up to 12 combinations per run. It uses hidden, isolated instances of the actual simulator. Each opens Safari or Chrome, goes through Share → Add to Home Screen, locates the icon for the resolved launch URL, and opens it. The check waits for a new document load and verifies standalone mode in the guest. A site without a readable manifest can still create a website shortcut. Each combination keeps its own result, including HTTP errors, so a failed address does not stop the batch. These checks run without a model or API key.

**Visitor task** takes a goal, 1–12 visitors, and optional audience descriptions or reference material. The model can suggest audiences from the first page. A shuffled deck uses each candidate once before repeating. Supply an OpenRouter key in the form or via `OPENROUTER_API_KEY`, or select a local OpenAI-compatible server and enter its model ID (JSON output required). The local endpoint accepts loopback IP addresses and uses no OpenRouter credentials. Reference material, the goal, labels and visible excerpts go to the selected model. Screenshots are local unless explicitly enabled for a vision-capable model.

Enable **Install and launch before each visit** to continue the visit inside the same installed app. Visitors alternate between Safari and Chrome on the selected device, or the model can select a catalog device, browser and orientation based on the brief. Each visitor can tap visible controls on the page or in its same-origin frames, scroll, or wait for content, up to six page actions. Page observations and captured screens are available in **Visit review** and the offline HTML report. Each issued input links the choices visible before it to the next captured screen, when available. Review flags repeated visible text and controls. A model’s conclusion is labelled as its statement. A quotation that only matches a control label leaves the goal unconfirmed. **Launch and privacy → Include a local screen recording in the report** records the visitor viewport even while Agent is closed. The offline HTML plays local compositor samples at their recorded times (up to 8 samples per second, 24 MiB per run). The report identifies when this limit cuts a recording short. These are simulated visitors, not customer analytics.

Navigation stays within the start origin; use the site's final address if it redirects to another host. Forms, network writes, downloads, external sign-in and cross-origin embedded controls are restricted. File rendering depends on Chromium's viewers; arbitrary binaries and server source code require a running web version.

## Install the page on the simulated Home Screen

Open **Web Apps** on the Home Screen to add Instagram, X, Threads, TikTok, YouTube or Reddit. **Add all** installs the remaining entries. Profiles with no saved app list start with Instagram and X. Each icon opens the official website in standalone mode. Manage or remove it in **Settings → Installed web apps**. Site access and sign-in depend on the service.

Go Home and open Safari or Chrome from the dock. Enter the website in the device address field and press Enter. In Safari use **More → Share**. In Chrome use the share button beside the address. Choose **Add to Home Screen**, edit the name if desired, and press **Add**. The icon appears on the first Home page. With **Open as Web App** enabled it launches in standalone mode. Turning it off saves the current page as a browser shortcut.

In Safari, open the page menu (AA) and choose Website Settings. In Chrome, open More and choose Settings. Page zoom is saved for each site in each browser. Dark appearance updates the emulated color scheme. Both menus include search within the current page, bookmarks, browsing history, and sharing.

On Face ID devices and Duo, swipe up from the bottom edge with a finger or drag it upward with the mouse to go Home. A short drag returns the app to its previous position. A vertical trackpad scroll starting on the indicator also opens Home. Swipe horizontally across Home to move between app pages. The SE keeps its physical Home button. [Apple’s iPhone navigation guide](https://support.apple.com/guide/iphone/learn-gestures-to-navigate-iphone-iphfdf164cac/ios)

The Duo dock keeps Open / Close, Pause and the hinge angle below the preview. Click the angle to reveal the scrubber, posture picker and fine adjustments in the same row. The compact bar above the preview expands to a device picker, browser and address field. **Device controls** opens zoom, pin, rotation and inspection. The bar stays in place while the device folds.

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
filenames. Open **Device controls → Screenshots** to see the actual path or reveal the latest file. The same panel is available on the compact handle. Xcode handoff is available only on macOS. Rendering/emulation is shared
across platforms and uses Chromium, not WebKit.

## License

**Personal / internal tool — not for public distribution. Do not publish the repository or installers.** Application source is covered by [MIT](LICENSE); this does not license the bundled hardware artwork/model, whose provenance and redistribution rights are unknown. See [ASSETS.md](ASSETS.md). This project is not affiliated with Apple; projected device geometry and animation tuning are estimates.

The default start page asks for a website URL. Home Screen contains Safari, Chrome and the sites added through Share → Add to Home Screen. Open **Settings** to rename, launch or remove a saved app, choose whether it opens standalone, and switch between standard labelled icons and large icons. **Viewport** measures the active website’s layout viewport, visual viewport, emulated screen, zoom and pixel ratio. In Settings, a saved browser shortcut can open in Safari or Chrome. The **Manifest** and **PWA Checks** apps read the currently loaded website and keep it open while you inspect its manifest, service worker and install diagnostics.

Video and HTML fullscreen stay within the selected simulated display. Escape restores the browser chrome and the previous viewport.

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

A moving reflection on the cover peaks at a physical hinge angle of 70°. Its gradient follows the projected glass when opening, closing or holding the angle. In the front Span view, the app hands off between the cover and inner displays at 70% open (126°). Between 108° and 144° the moving inner glass comes into focus. The held half stays sharp, and the angle slider previews the same effect while dragging. Releasing the slider restores sharp glass and keeps the selected display profile.

Click Open / Close again to reverse. Escape or Pause stops the hinge, and Resume continues it. Click the angle to drag the slider or use its arrow, Home and End keys. The options menu includes 1° and 5° steps, the finish and camera reset.

When the system has Reduce Motion enabled, Duo opens and closes immediately. Choose the play button next to Open to preview the fold animation. The setting is saved on this computer. Choose **Use system motion setting** in the hinge options to follow the system again.
