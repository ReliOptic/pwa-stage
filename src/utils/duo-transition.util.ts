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

/** Overlapping ramps approximate linear progressive blur; the hinge is sharp. */
export const TRANSITION_BLUR_BANDS = [
  { from: 0, to: 0, strength: 0 },
  { from: 0, to: 0.25, strength: 0.25 },
  { from: 0.25, to: 0.5, strength: 0.5 },
  { from: 0.5, to: 0.75, strength: 0.75 },
  { from: 0.75, to: 1, strength: 1 }
] as const;
