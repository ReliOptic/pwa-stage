/**
 * Secondary reference: DuoKit PR #2 and docs/ANIMATION.md (2026-11-17).
 * https://github.com/arjunkshah12345-hash/duokit/pull/2
 * The 0.9 gain and 1.5 exponent are the recreation's film-tuned values,
 * not measurements of Apple's shader. Footage supports the qualitative ramp.
 */
export function transitionDimAlpha(distance: number, motion: number): number {
  const clamp = (v: number): number => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  return 0.9 * clamp(motion) * Math.pow(clamp(distance), 1.5);
}

/** Interpolate ray-projected samples, so the ramp reaches the moving edge,
 * even when that edge projects close to the hinge. Both directions are valid. */
export function sampleTransitionGradient(samples: readonly number[], distance: number): number {
  if (samples.length === 0) return 0;
  const t = Number.isFinite(distance) ? Math.max(0, Math.min(1, distance)) : 0;
  const index = t * (samples.length - 1);
  const lo = Math.floor(index);
  const hi = Math.min(lo + 1, samples.length - 1);
  return samples[lo] + (samples[hi] - samples[lo]) * (index - lo);
}

/** Fraction of the physical 0–180° opening, also used when reversing. */
const FOLD_FOCUS_HANDOFF = 0.7;
export const FOLD_FOCUS_HANDOFF_DEG = Math.round(180 * FOLD_FOCUS_HANDOFF);
const FOCUS_HALF_WIDTH = 0.1;

function smoothRamp(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Local grazing highlight on the outward-facing glass, in physical hinge degrees. */
export const COVER_GLINT_DEG = 70;
export function sampleCoverGlint(angle: number) {
  const strength = smoothRamp(48, COVER_GLINT_DEG, angle) * (1 - smoothRamp(COVER_GLINT_DEG, 88, angle));
  return { strength, center: 0.32 + 0.42 * smoothRamp(48, 88, angle) };
}

/** Simulator focus choreography. Visibility and depth come from the mesh. */
export function sampleFoldFocus(openFraction: number): { coverMotion: number; innerMotion: number } {
  const coverMotion = smoothRamp(0, FOLD_FOCUS_HANDOFF, openFraction);
  const innerMotion = 1 - smoothRamp(
    FOLD_FOCUS_HANDOFF - FOCUS_HALF_WIDTH, FOLD_FOCUS_HANDOFF + FOCUS_HALF_WIDTH, openFraction
  );
  return { coverMotion, innerMotion };
}
