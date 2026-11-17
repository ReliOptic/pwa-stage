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

Recorded run (2026-11-17): all 19 cases passed, 90,023 exterior boundary samples,
zero colored page leaks, and every visible leaf painted. Typecheck/build, 107
unit/integration tests, four real Electron flow scenarios and the 34-entry asset
audit passed. Both packaged archives contain the exact compiled files tested here.

19 cases: 10 slab portrait viewport classes (17 Pro, 17 Pro Max, Air, 16, 16 Plus,
14, 14 Plus, 13 mini, 11, SE), three slab landscapes (17 Pro, 11, SE), and six Duo
postures (Open, Closed, Book, Tabletop, Stand, Portrait). Logical scale is 1 and
output density is 2×. The six postures preserve the same live guest.

The Linux Xvfb/SwiftShader verification checks geometry, artwork loading, clipping
and guest painting. It does not establish native macOS/Windows execution, GPU frame
rate, physical material/lighting accuracy, iOS WebKit parity, or exact Apple motion
timing. Arbitrary orbit angles and every animation frame are outside this suite.
Device viewport and fold behavior estimates remain labelled in the source/docs.
