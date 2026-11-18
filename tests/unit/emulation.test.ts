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

  it('injects only namespaced safe-area fallbacks and never restyles the page', () => {
    const css = buildSafeAreaCss({ top: 59, right: 0, bottom: 34, left: 0 });
    expect(css).toContain('--__sim-sat: 59px;');
    expect(css).toContain('--__sim-sab: 34px;');
    // A simulator must not "fix" pages: no color-scheme, overflow or tap overrides.
    expect(css).not.toMatch(/color-scheme|overflow|tap-highlight|--sat:/);
  });

  it('freezes the iOS UA token at 18_6 from iOS 26 on, like Safari does', () => {
    const ua = buildMobileUserAgent(BrowserShellMode.IOS_SAFARI, '27_3', '142.0.0.0');
    expect(ua).toContain('iPhone OS 18_6 like Mac OS X');
    expect(ua).toContain('Version/27.3');
    const chrome = buildMobileUserAgent(BrowserShellMode.IOS_CHROME, '27_3', '142.0.0.0');
    expect(chrome).toContain('iPhone OS 18_6');
    expect(chrome).toContain('CriOS/142.0.0.0');
  });

  it('gives a web app the full screen only with black-translucent status bar', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
    const base = {
      preset,
      orientation: Orientation.PORTRAIT,
      shellMode: BrowserShellMode.PWA_STANDALONE,
      safariIosVersion: '27_3',
      chromeIosVersion: '142.0.0.0',
      darkMode: true
    } as const;
    const opaque = buildEmulationProfile({ ...base, pwaStatusBarStyle: 'default' });
    expect(opaque.metrics.height).toBe(874 - 62);
    expect(opaque.pageSafeArea.top).toBe(0);
    const translucent = buildEmulationProfile({ ...base, pwaStatusBarStyle: 'black-translucent' });
    expect(translucent.metrics.height).toBe(874);
    expect(translucent.pageSafeArea.top).toBe(62);
    expect(translucent.metrics.deviceScaleFactor).toBe(3);
    expect(translucent.metrics.screenWidth).toBe(402);
    expect(translucent.standaloneInitScript).toContain('"standalone":true');
  });

  it('tells the page how much of it the software keyboard covers', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
    const base = {
      preset,
      orientation: Orientation.PORTRAIT,
      safariIosVersion: '27_3',
      chromeIosVersion: '142.0.0.0',
      darkMode: true
    } as const;
    const webApp = buildEmulationProfile({ ...base, shellMode: BrowserShellMode.PWA_STANDALONE });
    expect(webApp.standaloneInitScript).toContain('"keyboardInset":336');
    // In Safari the bottom bar (72pt) is already outside the page.
    const safari = buildEmulationProfile({ ...base, shellMode: BrowserShellMode.IOS_SAFARI });
    expect(safari.standaloneInitScript).toContain('"keyboardInset":264');
  });

  it('exposes no top/bottom inset to pages inside Safari, whose bars cover them', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_17_PRO);
    const profile = buildEmulationProfile({
      preset,
      orientation: Orientation.LANDSCAPE,
      shellMode: BrowserShellMode.IOS_SAFARI,
      safariIosVersion: '27_3',
      chromeIosVersion: '142.0.0.0',
      darkMode: true
    });
    expect(profile.pageSafeArea).toEqual({ top: 0, right: 62, bottom: 0, left: 62 });
  });

  it('builds full emulation profile for iPhone Duo Unfolded in landscape', () => {
    const preset = getDevicePresetById(DeviceModelId.IPHONE_DUO_UNFOLDED);
    const profile = buildEmulationProfile({
      preset,
      orientation: Orientation.LANDSCAPE,
      shellMode: BrowserShellMode.PWA_STANDALONE,
      safariIosVersion: '18_4',
      chromeIosVersion: '135.0.0.0',
      darkMode: false,
      pwaStatusBarStyle: 'black-translucent'
    });

    expect(profile.metrics.width).toBe(669);
    expect(profile.metrics.height).toBe(951);
    expect(profile.metrics.mobile).toBe(true);
    expect(profile.metrics.screenOrientation.type).toBe('landscapePrimary');
    expect(profile.standaloneInitScript).toContain('"standalone":true');
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
        on: vi.fn(), removeListener: vi.fn(),
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
    const commands = sendCommandMock.mock.calls.map(call => call[0]);
    expect(commands.indexOf('Page.enable')).toBeLessThan(commands.indexOf('Page.addScriptToEvaluateOnNewDocument'));
    expect(sendCommandMock).toHaveBeenCalledWith('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    expect(sendCommandMock).toHaveBeenCalledWith(
      'Emulation.setTouchEmulationEnabled',
      expect.objectContaining({ enabled: true, maxTouchPoints: 5 })
    );

    const failingTarget: EmulationTargetWebContents = {
      ...mockTarget,
      debugger: {
        on: vi.fn(), removeListener: vi.fn(),
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
