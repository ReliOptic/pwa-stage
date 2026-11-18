import { describe, expect, it } from 'vitest';
import { transitionDimAlpha, sampleCoverGlint, sampleFoldFocus, sampleTransitionGradient } from '../../src/utils/duo-transition.util';

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
  it('peaks on the cover glass at 70 physical degrees in either direction', () => {
    const values = [48,55,70,85,88].map(angle=>sampleCoverGlint(angle));
    expect(values.map(v=>v.strength)).toEqual([0,expect.any(Number),1,expect.any(Number),0]);
    expect(values[1].strength).toBeGreaterThan(0);
    expect(values[3].strength).toBeLessThan(values[2].strength);
    expect(values.map(v=>v.center)).toEqual(values.map(v=>v.center).sort((a,b)=>a-b));
  });
  it('leaves the cover sharp when closed and resolves the inner glass around 70% open', () => {
    expect(sampleFoldFocus(0)).toEqual({ coverMotion: 0, innerMotion: 1 });
    expect(sampleFoldFocus(0.6).innerMotion).toBe(1);
    expect(sampleFoldFocus(126 / 180).innerMotion).toBeCloseTo(0.5);
    expect(sampleFoldFocus(126 / 180).coverMotion).toBe(1);
    expect(sampleFoldFocus(0.8).innerMotion).toBe(0);
    expect(sampleFoldFocus(1)).toEqual({ coverMotion: 1, innerMotion: 0 });
    let previous = sampleFoldFocus(0);
    for (let angle = 1; angle <= 180; angle++) {
      const next = sampleFoldFocus(angle / 180);
      expect(next.coverMotion - previous.coverMotion).toBeGreaterThanOrEqual(0);
      expect(previous.innerMotion - next.innerMotion).toBeGreaterThanOrEqual(0);
      expect(previous.innerMotion - next.innerMotion).toBeLessThan(0.05);
      previous = next;
    }
  });
});
