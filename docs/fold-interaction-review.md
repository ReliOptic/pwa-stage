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
