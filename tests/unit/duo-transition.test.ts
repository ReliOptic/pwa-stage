import { describe, expect, it } from 'vitest';
import { transitionDimAlpha, TRANSITION_BLUR_BANDS, sampleTransitionGradient } from '../../src/utils/duo-transition.util';

describe('Duo moving-leaf shading', () => {
  it('follows the projected moving edge instead of the full unfolded half-width', () => {
    expect(sampleTransitionGradient([475, 480, 490], 1)).toBe(490);
    expect(sampleTransitionGradient([475, 470, 450], 1)).toBe(450);
    expect(sampleTransitionGradient([475, 480, 490], 0.25)).toBe(477.5);
    expect(sampleTransitionGradient([475, 480, 490], 0)).toBe(475);
    expect(sampleTransitionGradient([], 0.5)).toBe(0);
    expect(sampleTransitionGradient([475], 1)).toBe(475);
  });
  it('keeps the hinge and flat endpoint unchanged, and the raised free edge at 10% brightness', () => {
    expect(transitionDimAlpha(0, 1)).toBe(0);
    expect(transitionDimAlpha(1, 0)).toBe(0);
    expect(1 - transitionDimAlpha(1, 1)).toBeCloseTo(0.1);
    expect(transitionDimAlpha(0.2, 1)).toBeGreaterThan(0);
    expect(transitionDimAlpha(0.5, 1)).toBeCloseTo(0.9 * Math.pow(0.5, 1.5));
  });
  it('clamps invalid inputs and increases continuously toward the free edge', () => {
    expect(transitionDimAlpha(-1, 1)).toBe(0);
    expect(transitionDimAlpha(2, 2)).toBe(0.9);
    expect(transitionDimAlpha(NaN, 1)).toBe(0);
    for (let i = 1; i <= 100; i++) {
      expect(transitionDimAlpha(i / 100, 1)).toBeGreaterThan(transitionDimAlpha((i - 1) / 100, 1));
    }
  });
  it('starts the blur with a sharp layer and covers the full linear ramp', () => {
    expect(TRANSITION_BLUR_BANDS[0].strength).toBe(0);
    expect(TRANSITION_BLUR_BANDS.at(-1)?.to).toBe(1);
    TRANSITION_BLUR_BANDS.slice(1).forEach((band, i) => {
      expect(band.from).toBe(TRANSITION_BLUR_BANDS[i].to);
      expect(band.strength).toBe(band.to);
    });
  });
});
