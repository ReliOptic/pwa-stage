# Frame and display verification — 1.0.2

The visual direction is the existing hardware reference: metal highlights, dark glass,
real side controls and a sharp display at rest. No new decorative shell or hardware
assets were introduced. Image registration and model geometry are the reference;
they are not measurements of a physical Apple device.

## Changes

- Slab models now render the previously bundled hardware images. Image-space body
  gutters are registered to the chassis, and the entire skin rotates in landscape.
  The artwork is shared across viewport classes; it is not a unique scan of every model.
- The Duo inner and outer apertures come from the bundled display meshes (materials
  8 and 7). Their ordered convex contours replace fixed 44px/cover corner radii.
  Quad placement, occlusion and the moving-leaf transition stencil use the same bounds
  and screen plane. The two inner leaves retain a shared hinge midpoint.
- The product retains one guest in Span and two independent guests in Split. Resting
  postures remain sharp; existing motion blur is limited to active transitions.

## Reproduce

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run assets:audit
npm run test:electron
SIMULATOR_TEST_OUTPUT=/tmp/pwa-stage-visual xvfb-run -a -s "-screen 0 4000x2400x24" npm run test:visual
```

On macOS/Windows run `npm run test:visual` without Xvfb. In a restricted Linux
container only, set `SIMULATOR_TEST_NO_SANDBOX=1`. This flag belongs to the test
launcher, not the packaged product. `SIMULATOR_VISUAL_DPR` defaults to 2.

The test serves a local calibration page. It awaits the target hinge angle, then
uses a green→white paint round trip before recording a screenshot. Every visible
leaf must paint green in two consecutive captures; a blank guest or stale mirror
cannot satisfy that check. All images use Electron `webContents.capturePage()`.

At each projected aperture boundary, samples are spaced one output pixel apart,
two output pixels outside the contour (an antialiasing allowance, 1 CSS point at
2× output density). Colored page pixels must not appear at those locations.
The full-resolution white grid and green probe PNGs accompany `visual.json`.
Screenshots remain outside Git; CI does not publish them or installers.

## Scope

The 1.0.4 suite covers all 15 slab entries in the device catalogue, each in portrait and landscape, plus the Duo cover, open wide, open portrait, book, tabletop and stand. It records 36 cases at 2× density. Every visible leaf must show the calibration field. The six Duo poses reuse the same guest.

The install test goes Home, opens each dock browser, enters a URL, shares the current website, edits the confirmation name, installs the icon and launches it. It checks both the URL and the standalone shell, plus bookmark behavior when Open as Web App is disabled. Each install stage is captured after the animation and compositor have settled. A separate motion test uses real mouse and keyboard input to grab, pause and reverse the hinge. Recorded sweeps also check the moving side for exposed shell background. The moving leaf shares one painted surface between blur bands and keeps the latest page image visible while the guest changes aspect ratio.

The primary Home reference is the 490×1008 default Home Screen illustration in the [iOS 27 iPhone User Guide](https://support.apple.com/guide/iphone/open-apps-iphca3d8b4e3/ios). Its four-column grid, dock and warm-to-graphite backdrop informed the reconstruction. The earlier iOS 26 image supplies an additional grid measurement. The Duo reference is Apple's product film. The install paths follow the [Apple iPhone User Guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) and [Chrome Help for iPhone](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DiOS). The sources do not identify an exact iOS 27.3 build.

The Linux Xvfb/SwiftShader verification checks geometry, artwork loading, clipping
and guest painting. It does not establish native macOS/Windows execution, GPU frame
rate, physical material/lighting accuracy, iOS WebKit parity, or exact Apple motion
timing. Arbitrary orbit angles and every animation frame are outside this suite.
Device viewport and fold behavior estimates remain labelled in the source/docs.
