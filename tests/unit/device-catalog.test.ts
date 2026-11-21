import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, getDevicePresetById, groupDevicePresets } from '../../src/config/device-presets.config';
import { DeviceFormFactor, DeviceModelId, HardwareCutoutType, Orientation } from '../../src/types/device.types';
import { BrowserShellMode } from '../../src/types/simulator.types';
import {
  computeShellChromeHeights,
  computeViewportMetrics,
  hasDuoSystemRail,
  resolveKeyboardHeight,
  resolvePageSafeArea
} from '../../src/utils/viewport-math.util';
import { cssColorLuminance, prefersLightContent } from '../../src/utils/color.util';

describe('device catalogue', () => {
  it('has exactly one preset per DeviceModelId', () => {
    const ids = DEVICE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.values(DeviceModelId)) {
      expect(getDevicePresetById(id).id).toBe(id);
    }
  });

  it('covers every distinct iOS 26 viewport class', () => {
    const sizes = new Set(DEVICE_PRESETS.map((p) => `${p.width}x${p.height}`));
    for (const s of ['375x667', '375x812', '390x844', '393x852', '402x874', '414x896', '420x912', '428x926', '430x932', '440x956']) {
      expect(sizes.has(s)).toBe(true);
    }
  });

  it('uses consistent cutouts, safe areas and density', () => {
    for (const p of DEVICE_PRESETS) {
      expect([2, 3]).toContain(p.deviceScaleFactor);
      if ([HardwareCutoutType.DYNAMIC_ISLAND,HardwareCutoutType.COMPACT_ISLAND].includes(p.cutoutType)) {
        expect(p.island).toBeDefined();
        expect(p.island!.top+p.island!.height).toBeLessThan(p.safeAreaPortrait.top);
        expect(p.safeAreaPortrait.top).toBeGreaterThanOrEqual(59);
      }
      if (p.cutoutType === HardwareCutoutType.NOTCH) {
        expect(p.safeAreaPortrait.top).toBeGreaterThanOrEqual(44);
        expect(p.safeAreaPortrait.top).toBeLessThan(59);
      }
      if (p.formFactor === DeviceFormFactor.HOME_BUTTON_SLAB) {
        expect(p.safeAreaPortrait).toEqual({ top: 20, right: 0, bottom: 0, left: 0 });
        expect(p.screenCornerRadius).toBe(0);
      }
    }
  });

  it('groups presets for the picker in catalogue order', () => {
    const groups = groupDevicePresets(DEVICE_PRESETS);
    expect(groups.map((g) => g.presets.length).reduce((a, b) => a + b, 0)).toBe(DEVICE_PRESETS.length);
    expect(groups[groups.length - 1]?.group).toBe('Foldable');
  });
});

describe('screen geometry', () => {
  const pro = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
  const duoCover = getDevicePresetById(DeviceModelId.IPHONE_DUO_FOLDED);
  const duoInner = getDevicePresetById(DeviceModelId.IPHONE_DUO_UNFOLDED);

  it('reserves the Duo rail once (in layout), not again for the page', () => {
    expect(hasDuoSystemRail(duoCover, Orientation.PORTRAIT)).toBe(true);
    expect(hasDuoSystemRail(duoInner, Orientation.PORTRAIT)).toBe(true);
    expect(hasDuoSystemRail(duoInner, Orientation.LANDSCAPE)).toBe(false);
    expect(hasDuoSystemRail(pro, Orientation.PORTRAIT)).toBe(false);
    expect(resolvePageSafeArea(duoCover, Orientation.PORTRAIT, BrowserShellMode.IOS_SAFARI).right).toBe(0);
  });

  it('collapsing Safari bar grows the viewport', () => {
    const safe = pro.safeAreaPortrait;
    const full = computeShellChromeHeights(BrowserShellMode.IOS_SAFARI, safe);
    const collapsed = computeShellChromeHeights(BrowserShellMode.IOS_SAFARI, safe, 'default', true);
    expect(collapsed.bottomBarHeight).toBeLessThan(full.bottomBarHeight);
    expect(collapsed.topBarHeight).toBe(full.topBarHeight);
  });

  it('Safari top chrome is exactly the status bar (none in landscape)', () => {
    expect(computeShellChromeHeights(BrowserShellMode.IOS_SAFARI, pro.safeAreaPortrait).topBarHeight).toBe(62);
    expect(computeShellChromeHeights(BrowserShellMode.IOS_SAFARI, pro.safeAreaLandscape).topBarHeight).toBe(0);
    const se = getDevicePresetById(DeviceModelId.IPHONE_SE_3);
    expect(computeShellChromeHeights(BrowserShellMode.IOS_SAFARI, se.safeAreaPortrait).topBarHeight).toBe(20);
  });

  it('software keyboard never covers more than the screen and shrinks in landscape', () => {
    for (const p of DEVICE_PRESETS) {
      const portrait = resolveKeyboardHeight(p, Orientation.PORTRAIT);
      const landscape = resolveKeyboardHeight(p, Orientation.LANDSCAPE);
      expect(portrait).toBeLessThan(p.height * 0.6);
      expect(landscape).toBeLessThan(Math.max(p.width, p.height));
      expect(portrait).toBeGreaterThan(200);
    }
    expect(resolveKeyboardHeight(pro, Orientation.LANDSCAPE)).toBeLessThan(
      resolveKeyboardHeight(pro, Orientation.PORTRAIT)
    );
  });

  it('window reserves the compact two-row toolbar above a narrow device', () => {
    const m = computeViewportMetrics(pro, Orientation.PORTRAIT, 1, true, false);
    // Narrow toolbar and root gutters sit outside the device.
    expect(m.scaledOuterHeight).toBe(88 + 16 + m.outerFrameHeight);
  });
});

describe('status bar contrast', () => {
  it('picks light content on dark backgrounds', () => {
    expect(cssColorLuminance('#000')).toBe(0);
    expect(cssColorLuminance('#fff')).toBeCloseTo(1);
    expect(prefersLightContent('#0a84ff', false)).toBe(true);
    expect(prefersLightContent('rgb(250, 250, 250)', true)).toBe(false);
    expect(prefersLightContent('rgba(0,0,0,0)', true)).toBe(true); // transparent → fallback
    expect(prefersLightContent(null, false)).toBe(false);
  });
});
