import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS } from '../../src/config/device-presets.config';
import { homeIconClip, resolveHomeLayout, resolveHomePage } from '../../src/utils/home-layout.util';

describe('Home Screen reference layout', () => {
  for (const preset of DEVICE_PRESETS) {
    it(`keeps icons, labels and widgets clear of dock/rail on ${preset.id}`, () => {
      const rail = preset.safeAreaPortrait.right === 84 ? 84 : 0;
      const l = resolveHomeLayout(preset.width, preset.height, rail, preset.safeAreaPortrait.top);
      expect(l.left).toBeGreaterThanOrEqual(0);
      expect(l.left + l.panelWidth).toBeLessThanOrEqual(preset.width - rail);
      expect(l.panelWidth).toBeGreaterThanOrEqual(l.icon * 4);
      expect(l.top).toBeGreaterThanOrEqual(preset.safeAreaPortrait.top);
      const lastLabelBottom = l.gridTop + (l.rows - 1) * l.pitch + l.icon + 19;
      expect(lastLabelBottom).toBeLessThanOrEqual(rail ? preset.height - 40 : l.searchTop);
      if (!rail) expect(l.searchTop + 28).toBeLessThanOrEqual(preset.height - l.dockBottom - l.dockHeight);
    });
  }
  it('reserves the inner left widget area and uses a smaller vertical dock', () => {
    const inner = resolveHomeLayout(951, 669, 84, 20);
    expect(inner.inner).toBe(true);
    expect(inner.left).toBeGreaterThan(66 + 338);
    expect(inner.dockIcon).toBe(48);
    expect(inner.capacity).toBe(16);
    expect(resolveHomeLayout(466, 678, 84, 24).inner).toBe(false);
  });
  it('fits rotated standard and portrait Duo displays', () => {
    for (const [w, h] of [[874, 402], [667, 375], [669, 951]]) {
      const l = resolveHomeLayout(w, h, 0, 54);
      expect(l.gridTop + (l.rows - 1) * l.pitch + l.icon + 19).toBeLessThan(l.searchTop);
    }
  });
  it('retains access to overflow apps and clamps after deletion', () => {
    expect(resolveHomePage(0, 16, 0)).toEqual({ pages: 1, page: 0 });
    expect(resolveHomePage(33, 16, 2)).toEqual({ pages: 3, page: 2 });
    expect(resolveHomePage(16, 16, 2)).toEqual({ pages: 1, page: 0 });
  });
  it('creates a closed original continuous-corner clip at icon size', () => {
    const path = homeIconClip(60);
    expect(path).toContain('M 60.000 30.000');
    expect(path).toContain('0.000 30.000');
    expect(path.endsWith(" Z')")).toBe(true);
    expect(path).not.toContain('NaN');
  });
});
