import { describe, expect, it } from 'vitest';
import { computeFoldDriveDurationMs, sampleHingeMotion } from '../../src/utils/duo-fold-math.util';

describe('interruptible hinge motion', () => {
  it.each([[0, 180], [180, 0], [70, 108]])('settles without overshoot from %s to %s', (from, to) => {
    const duration = computeFoldDriveDurationMs(from, to);
    let previous = from;
    for (let time = 0; time <= duration + 200; time += 10) {
      const sample = sampleHingeMotion(from, 0, to, time, duration);
      expect(sample.angle).toBeGreaterThanOrEqual(Math.min(from, to));
      expect(sample.angle).toBeLessThanOrEqual(Math.max(from, to));
      expect((sample.angle - previous) * Math.sign(to - from)).toBeGreaterThanOrEqual(0);
      previous = sample.angle;
    }
    expect(previous).toBe(to);
  });
  it('responds visibly within 100 ms and preserves velocity when reversed', () => {
    const opening = sampleHingeMotion(0, 0, 180, 100, computeFoldDriveDurationMs(0, 180));
    expect(opening.angle).toBeGreaterThan(10);
    expect(opening.angle).toBeLessThan(90);
    const duration = computeFoldDriveDurationMs(opening.angle, 0);
    const start = sampleHingeMotion(opening.angle, opening.velocity, 0, 0, duration);
    expect(start.angle).toBeCloseTo(opening.angle);
    expect(start.velocity).toBeCloseTo(opening.velocity);
    const reversed = sampleHingeMotion(opening.angle, opening.velocity, 0, 100, duration);
    expect(reversed.velocity).toBeLessThan(0);
    expect(sampleHingeMotion(opening.angle, opening.velocity, 0, duration + 200, duration).angle).toBe(0);
  });
  it('has the same path at 60 and 120 Hz and supports slow motion', () => {
    const duration = computeFoldDriveDurationMs(0, 180);
    for (let frame = 0; frame < 60; frame++) {
      const normal = sampleHingeMotion(0, 0, 180, frame * 1000 / 60, duration);
      const highRefresh = sampleHingeMotion(0, 0, 180, (frame * 2) * 1000 / 120, duration);
      const slow = sampleHingeMotion(0, 0, 180, frame * 1000 / 60 * 8, duration * 8);
      expect(normal.angle).toBeCloseTo(highRefresh.angle, 10);
      expect(normal.angle).toBeCloseTo(slow.angle, 10);
    }
  });
});
