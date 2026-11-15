import { describe, expect, it, vi } from 'vitest';
import { getDevicePresetById } from '../../src/config/device-presets.config';
import {
  applyEmulationToTarget,
  buildEmulationProfile,
  buildMobileUserAgent,
  buildSafeAreaCss
} from '../../src/services/emulation';
import { DeviceModelId, Orientation } from '../../src/types/device.types';
import { EmulationTargetWebContents } from '../../src/types/emulation.types';
import { BrowserShellMode } from '../../src/types/simulator.types';

describe('emulation service', () => {
  it('builds accurate Safari and Chrome iOS User-Agents', () => {
    const safariUa = buildMobileUserAgent(BrowserShellMode.IOS_SAFARI, '18_4', '135.0.0.0');
    expect(safariUa).toContain('iPhone OS 18_4');
    expect(safariUa).toContain('Version/18.4');
    expect(safariUa).not.toContain('CriOS');

    const chromeUa = buildMobileUserAgent(BrowserShellMode.IOS_CHROME, '18_4', '135.0.7049.50');
    expect(chromeUa).toContain('CriOS/135.0.7049.50');
  });

  it('builds safe area CSS variables and color-scheme', () => {
    const css = buildSafeAreaCss({ top: 59, right: 0, bottom: 34, left: 0 }, true);
    expect(css).toContain('--sat: 59px;');
    expect(css).toContain('--sab: 34px;');
    expect(css).toContain('color-scheme: dark;');
  });

  it('builds full emulation profile for iPhone Duo Unfolded in landscape', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_DUO_UNFOLDED);
    const profile = buildEmulationProfile({
      preset,
      orientation: Orientation.LANDSCAPE,
      shellMode: BrowserShellMode.PWA_STANDALONE,
      safariIosVersion: '18_4',
      chromeIosVersion: '135.0.0.0',
      darkMode: false
    });

    expect(profile.metrics.width).toBe(669);
    expect(profile.metrics.height).toBe(951);
    expect(profile.metrics.mobile).toBe(true);
    expect(profile.metrics.screenOrientation.type).toBe('landscapePrimary');
    expect(profile.standaloneInitScript).toContain("value: true");
  });

  it('applies CDP commands to WebContents target and handles errors cleanly', async () => {
    const sendCommandMock = vi.fn().mockResolvedValue({});
    const setZoomMock = vi.fn();
    const mockTarget: EmulationTargetWebContents = {
      id: 101,
      setUserAgent: vi.fn(),
      setZoomFactor: setZoomMock,
      insertCSS: vi.fn().mockResolvedValue('css-key'),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      debugger: {
        isAttached: () => false,
        attach: vi.fn(),
        sendCommand: sendCommandMock
      }
    };

    const preset = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
    const result = await applyEmulationToTarget(mockTarget, {
      preset,
      orientation: Orientation.PORTRAIT,
      shellMode: BrowserShellMode.IOS_SAFARI,
      safariIosVersion: '27_1',
      chromeIosVersion: '142.0.0.0',
      darkMode: true,
      scale: 0.85
    });

    expect(result.ok).toBe(true);
    expect(setZoomMock).toHaveBeenCalled();
    expect(sendCommandMock).toHaveBeenCalledWith(
      'Emulation.setDeviceMetricsOverride',
      expect.objectContaining({
        width: 402,
        mobile: true,
        deviceScaleFactor: 3,
        dontSetVisibleSize: true
      })
    );
    expect(sendCommandMock).toHaveBeenCalledWith(
      'Emulation.setTouchEmulationEnabled',
      expect.objectContaining({ enabled: true, maxTouchPoints: 5 })
    );

    const failingTarget: EmulationTargetWebContents = {
      ...mockTarget,
      debugger: {
        isAttached: () => true,
        attach: vi.fn(),
        sendCommand: vi.fn().mockRejectedValue(new Error('CDP detached'))
      }
    };

    const failedResult = await applyEmulationToTarget(failingTarget, {
      preset,
      orientation: Orientation.PORTRAIT,
      shellMode: BrowserShellMode.IOS_SAFARI,
      safariIosVersion: '18_4',
      chromeIosVersion: '135.0.0.0',
      darkMode: true
    });

    expect(failedResult.ok).toBe(false);
    if (!failedResult.ok) {
      expect(failedResult.error.kind).toBe('EMULATION_FAILURE_ERROR');
    }
  });
});
