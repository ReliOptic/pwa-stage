# Fold interaction review — 2026-11-17

The previous 1.0.2 compositor audit checked resting images. It did not establish
that interrupted opening, closing or dragging felt correct.

## Reference and direction

- Audience: developers inspecting their own PWA in a folding device frame.
- Task: open, close, interrupt and place the hinge precisely without losing the page.
- Reference: [Apple's iPhone Duo page](https://www.apple.com/iphone-duo/) and its US product film, inspected in the browser and as local frame sequences (opening around 75.6–77.3 s, closing around 174.4–175.3 s).
- Visual direction: retain the supplied titanium hardware and screen aperture; keep the held half steady through an ordinary open/close sweep. Separate angle control from posture selection.
- Interaction direction: one prominent reversible action, pause/resume, a long direct slider, smaller explicit posture choices. Preserve keyboard control and reduced-motion preferences.

The film shows a hand-driven hinge and soft content on the moving leaf, while
the held display remains legible. It supplies a visual reference, not an Apple
spring constant, easing specification or simulator control layout. No newly
downloaded reference media is bundled with the app.

## Changes

The old angle slider was 76 px wide. Scrubbing inferred another posture at
12°/168° and could switch the camera unexpectedly. Some fold buttons chose
their destination from the current angle, so a second click before halfway
continued the same direction. Posture buttons also changed emulation to the
destination display before the physical hinge reached its handoff.

All fold buttons now use a target-aware controller. A critically damped analytic
drive preserves the current position and velocity when retargeted. Its nominal
960 ms opening / 840 ms closing times are simulator tuning. Dragging takes over
directly, preserves the selected camera, and stops animation. Escape pauses;
the playback button resumes the same destination. Reduced motion goes directly
to the endpoint. Stand remains the chosen cover-display rig through scrubbing.

The bottom controls use 36 px primary hit areas and a flexible slider, with a
20 px thumb. Window sizing reserves room for both rows at the minimum scale.
The canvas and projected DOM apertures commit together before paint. Mirror
capture switches to its active rate as soon as an animation starts. Display
emulation changes at the actual handoff angle, retaining the existing guest.

## Reproduction and limits

`npm run test:electron` includes `tests/electron/motion.cjs`: button activation plus real mouse and
keyboard input for reversal on both sides of halfway, Escape, slider takeover,
release, Home/End, reduced motion, and retained guest identity/text. Run with
`SIMULATOR_RECORD_MOTION=1` to save actual `capturePage()` frames and angle/time
metadata for the opening/closing sweep at 8× slow playback.

`npm run test:visual` still checks all 19 resting display/posture cases at 2×
density, using guest paint fences. Software-rendered captures verify appearance
and continuity; they do not establish native GPU frame rate, exact Apple motion
timing, or physical-device pixel calibration. Explicit posture selection changes
the presentation rig; manual hinge adjustment does not select a new posture.

Local verification: 112 unit/integration tests pass. All 19 resting compositor cases pass at 2× density: 90,023 sampled boundary pixels, zero page-color leaks outside the 2-output-pixel antialiasing allowance. Original 34 registered assets pass the unchanged-content audit.

## Paused cover and partial inner display in 1.0.5

Apple’s opening sequence shows the lit outside face passing in front of an already visible portion of the inner display. The display overlap in the simulator is calculated from front-facing projected glass and the moving housing’s occlusion of the fixed panel, including when playback is paused or manually scrubbed.

A 1° sweep with zero extra orbit and pitch gives simultaneous visibility at 33–89° in the Open rig, 26–44° in Book and 2–48° in Tabletop. Stand has its own cover-facing camera. These are readings of the supplied mesh and simulator camera. The film establishes the appearance of the overlap without supplying a calibrated physical ignition angle or iOS 27.3 timing.

The hot page stays in one guest in Span mode. The outside view forwards mouse and scroll input to it, while browser menus open on the touched display. The lens aperture uses the bound cover camera rim. A broad warm key, cooler fill and muted reflections preserve the contrast of page content across viewing angles.

When a page opens a modal dialog from the cover, the cover frames its bounding box within the visible page area. Both views retain the same document and the guest receives trusted input to open and dismiss the dialog.
