import { describe, expect, it } from 'vitest';
import { getDevicePresetById } from '../../src/config/device-presets.config';
import { DeviceModelId, Orientation } from '../../src/types/device.types';
import { BrowserShellMode } from '../../src/types/simulator.types';
import { formatStructuredLog, logStructured } from '../../src/utils/logger.util';
import {
  computeDuoFoldMetrics,
  computeFoldDriveDurationMs,
  computeHomographyMatrix3d,
  evaluateFoldDriveEasing,
  invertFoldCurve,
  resolveDeviceHingeStatus,
  sampleFoldCurve
} from '../../src/utils/duo-fold-math.util';
import { buildAppleSquirclePath } from '../../src/utils/squircle.util';
import {
  clampSimulatorScale,
  computeReasonableDesktopScale,
  computeShellChromeHeights,
  computeViewportMetrics,
  resolveSafeAreaInsets
} from '../../src/utils/viewport-math.util';

describe('viewport-math.util & logger.util', () => {
  it('clamps simulator scale between 0.45 and 1.15 and computes reasonable desktop scale', () => {
    expect(clampSimulatorScale(0.2)).toBe(0.45);
    expect(clampSimulatorScale(2.0)).toBe(1.15);
    expect(clampSimulatorScale(0.854)).toBe(0.85);
    expect(clampSimulatorScale(Number.NaN)).toBe(0.72);

    const pro = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
    const fitScale = computeReasonableDesktopScale(pro, Orientation.PORTRAIT, 1.0, true, false, 1710, 1073);
    expect(fitScale).toBeLessThanOrEqual(0.82);
    expect(fitScale).toBeGreaterThanOrEqual(0.65);
  });

  it('computes portrait and landscape viewport metrics accurately for iPhone 17 Pro', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
    const portrait = computeViewportMetrics(preset, Orientation.PORTRAIT, 1.0, true, false);
    expect(portrait.logicalWidth).toBe(402);
    expect(portrait.logicalHeight).toBe(874);
    expect(portrait.physicalWidth).toBe(1206);
    expect(portrait.outerFrameWidth).toBe(430);
    expect(portrait.isDualUnfolded).toBe(false);

    const squircle = buildAppleSquirclePath(402, 874, portrait.cornerRadii);
    expect(squircle).toContain('M 79.36 0');
    expect(squircle).toContain('Z');

    const duoClosed = computeDuoFoldMetrics(0);
    expect(duoClosed.logicalWidth).toBe(466);
    expect(duoClosed.logicalHeight).toBe(678);
    expect(duoClosed.isOuterActive).toBe(true);

    const duoMid = computeDuoFoldMetrics(90);
    expect(duoMid.logicalWidth).toBeGreaterThan(466);
    expect(duoMid.logicalWidth).toBeLessThan(951);
    expect(duoMid.foldShadowOpacity).toBeGreaterThan(0);

    const duoOpen = computeDuoFoldMetrics(180);
    expect(duoOpen.logicalWidth).toBe(951);
    expect(duoOpen.logicalHeight).toBe(669);
    expect(duoOpen.foldShadowOpacity).toBe(0);

    expect(sampleFoldCurve(0)).toBe(0);
    expect(sampleFoldCurve(0.5)).toBeCloseTo(0.5, 4);
    expect(sampleFoldCurve(1)).toBe(1);
    expect(invertFoldCurve(sampleFoldCurve(0.35))).toBeCloseTo(0.35, 3);
    expect(resolveDeviceHingeStatus(0)).toBe('closed');
    expect(resolveDeviceHingeStatus(100)).toBe('partiallyOpen');
    expect(resolveDeviceHingeStatus(180)).toBe('fullyOpen');
    expect(computeFoldDriveDurationMs(0, 180)).toBeGreaterThan(computeFoldDriveDurationMs(180, 0));
    expect(evaluateFoldDriveEasing(0.5)).toBeCloseTo(0.5, 4);
    const homography = computeHomographyMatrix3d(
      [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 220 },
        { x: 10, y: 220 }
      ],
      100,
      200
    );
    expect(homography).toContain('matrix3d(');

    const collapsed = computeViewportMetrics(preset, Orientation.PORTRAIT, 1.0, true, true);
    expect(collapsed.scaledOuterHeight).toBeLessThan(portrait.scaledOuterHeight);

    const landscape = computeViewportMetrics(preset, Orientation.LANDSCAPE, 1.0, true, false);
    expect(landscape.logicalWidth).toBe(874);
    expect(landscape.logicalHeight).toBe(402);
    expect(landscape.safeArea.left).toBe(62);
  });

  it('returns zero blocking chrome heights for full-bleed Standalone Web App', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_17);
    const safeArea = resolveSafeAreaInsets(preset, Orientation.PORTRAIT);

    const pwa = computeShellChromeHeights(BrowserShellMode.PWA_STANDALONE, safeArea);
    expect(pwa.topBarHeight).toBe(0);
    expect(pwa.bottomBarHeight).toBe(0);

    const safari = computeShellChromeHeights(BrowserShellMode.IOS_SAFARI, safeArea);
    expect(safari.topBarHeight).toBeGreaterThanOrEqual(44);
    expect(safari.bottomBarHeight).toBeGreaterThanOrEqual(68);

    const chrome = computeShellChromeHeights(BrowserShellMode.IOS_CHROME, safeArea);
    expect(chrome.topBarHeight).toBeGreaterThan(safari.topBarHeight);
    expect(chrome.bottomBarHeight).toBeGreaterThanOrEqual(44);
  });

  it('formats structured JSON logs with timestamp, domain, and context', () => {
    const json = formatStructuredLog('info', 'test-domain', 'unit_test_event', { ok: true });
    const parsed = JSON.parse(json) as { domain: string; event: string; level: string };
    expect(parsed.domain).toBe('test-domain');
    expect(parsed.event).toBe('unit_test_event');
    expect(parsed.level).toBe('info');

    const entry = logStructured('warn', 'test-domain', 'warn_event', { code: 123 });
    expect(entry.level).toBe('warn');
  });
});
