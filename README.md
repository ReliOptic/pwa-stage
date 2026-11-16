# iPhone PWA Simulator (`pwa-stage`)

A floating macOS iPhone (and iPhone Duo foldable) simulator for people who build
Progressive Web Apps: see your site the way Safari, Chrome for iOS and a Home
Screen web app present it, on every iPhone viewport class, without opening Xcode.

## What it simulates

| Area | Behaviour |
| --- | --- |
| **Devices** | One preset per iOS 26/27 *viewport class* (375×667 SE … 440×956 Pro Max, 390×844 notch, 414×896 @2x, Air, iPhone 18 projected, Duo cover/inner). Each lists every model sharing that viewport. Correct safe areas, display corner radii, Dynamic Island / notch / Touch ID chassis. |
| **Rendering** | `devicePixelRatio` 2/3, `screen.width/height`, mobile viewport (`<meta viewport>`), overlay scrollbars, touch events, `env(safe-area-inset-*)` via CDP. |
| **Identity** | Safari / Chrome iOS User-Agent (OS token frozen at `18_6` like Safari 26+), `navigator.vendor = "Apple Computer, Inc."`, no `navigator.userAgentData`, `navigator.standalone`. |
| **Safari** | iOS 26+ compact tab bar; collapses while you scroll down, growing `innerHeight` / `dvh` like a real device. ⋯ → **Add to Home Screen**. Status-bar area tinted from `theme-color` / page background. |
| **Chrome for iOS** | Top omnibox + bottom toolbar. |
| **Web App (Home Screen)** | `display-mode: standalone`, and the status bar honours `apple-mobile-web-app-status-bar-style` (opaque by default, edge-to-edge only with `black-translucent`). |
| **Home Screen** | Xcode-style **Home** (⇧⌘H, home indicator, or the SE's home button): installed web apps with their real icon/name from the manifest, launch animation and splash in `background_color`. |
| **Web App Check** | iOS-specific installability checks: HTTPS, viewport / `viewport-fit`, manifest, `display`, `apple-touch-icon`, status-bar style, service worker, startup image. |
| **Permissions** | Camera / mic / location / notifications / motion requests show an iOS alert inside the screen; desktop-only APIs are denied. |
| **iPhone Duo** | Live 3D hinge (glTF) with six postures, free-stop scrub, inner-display wake animation, 84pt iOS 27.3 system rail, span / split. |

For the final pixel check use real WebKit: tray menu → **Open URL in Xcode iOS Simulator**.

## Shortcuts (Xcode Simulator compatible)

| Keys | Action |
| --- | --- |
| ⇧⌘H | Home |
| ⌘S | Screenshot to Desktop (`Simulator Screenshot - <device> - <date>.png`) |
| ⌘← / ⌘→ | Rotate |
| ⇧⌘A | Toggle appearance (`prefers-color-scheme`) |
| ⌘R | Reload page |
| ⌘+ / ⌘− / ⌘0 | Zoom |
| ⌘T | Float on all Spaces |
| ⌘B | Show / hide toolbar |
| ⇧⌘S | Hide to menu bar (global) |

Shortcuts also work while the page under test has keyboard focus.

## Security model

- The page under test runs in a sandboxed `<webview>` with **no preload, no Node, context isolation**; attach-time preferences are enforced in the main process (`src/services/security.ts`).
- Only `http(s)` pages may load; popups navigate in place, the shell can't be navigated away.
- IPC answers only the shell's top frame; every payload is validated (state enums/URLs, guest ids must belong to the shell, window coordinates).
- The shell renderer is sandboxed with a production CSP.
- The embedded demo server binds to `127.0.0.1`, rejects non-loopback `Host` headers, traversal and malformed encodings.
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

See [`HANDOFF.md`](HANDOFF.md) for architecture notes and the roadmap.
