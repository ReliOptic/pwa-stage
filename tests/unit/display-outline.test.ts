import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DisplayOutline, displayOutlineCss, leftDisplayContour, readDisplayOutline } from '../../src/utils/display-outline.util';
import { loadDuoSkinnedAsset } from '../../src/utils/duo-3d-engine.util';

describe('display aperture geometry', () => {
  const outline = readDisplayOutline([-2, 1, -1, 2, 1, -1, 2, 1, 1, -2, 1, 1, 0, 1, 0, -2, 1, -1]);
  it('removes interior/duplicate vertices and retains the ordered boundary', () => {
    expect(outline.points).toEqual([[-2, -1], [2, -1], [2, 1], [-2, 1]]);
    expect(outline.y).toBe(1);
  });
  it('clips the moving half without a self-crossing hinge edge', () => {
    expect(leftDisplayContour(outline)).toEqual([[-2, -1], [0, -1], [0, 1], [-2, 1]]);
  });
  it('registers the cover reversal and rotated screen axes', () => {
    expect(displayOutlineCss(outline)).toBe('polygon(0.00000% 0.00000%,100.00000% 0.00000%,100.00000% 100.00000%,0.00000% 100.00000%)');
    expect(displayOutlineCss(outline, true, true)).toBe('polygon(100.00000% 100.00000%,100.00000% 0.00000%,0.00000% 0.00000%,0.00000% 100.00000%)');
  });
  it('uses the bundled glass contours, with finite convex corners and no rectangular replacement', () => {
    const context = { window: {} as Window, console };
    runInNewContext(readFileSync('public/duo-3d/duo-3d-bundle.js', 'utf8'), context);
    const asset = loadDuoSkinnedAsset(context.window.THREE, context.window.__DUO_ASSET!);
    for (const name of ['inner', 'outer']) {
      const d: DisplayOutline = asset.displays[name];
      expect(d.points.length).toBeGreaterThan(80);
      expect(d.points.every(p => p.every(Number.isFinite))).toBe(true);
      expect(d.points.some(([x, z]) => x === d.minX && z === d.minZ)).toBe(false);
      for (let i = 0; i < d.points.length; i++) {
        const [a, b, c] = [0, 1, 2].map(n => d.points[(i + n) % d.points.length]);
        expect((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])).toBeGreaterThanOrEqual(-1e-10);
      }
      const leaf = leftDisplayContour(d);
      expect(leaf.every(([x]) => x <= 0)).toBe(true);
    }
    expect(asset.displays.inner.maxX).toBeCloseTo(7.8922534, 6);
    expect(asset.displays.outer.minX).toBeCloseTo(-7.9661479, 6);
  });
});
