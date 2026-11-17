import { describe, expect, it } from 'vitest';
import {
  buildPromptMessage,
  enforceGuestWebPreferences,
  GuestPermissionStore,
  isAllowedGuestUrl,
  isFiniteWindowPoint,
  isSameShellUrl,
  mapElectronPermission
} from '../../src/services/security';
import { isLoopbackHostHeader, resolveSafeStaticPath } from '../../src/services/reboot-server';
import { mergeStoredStateWithDefaults, createDefaultSimulatorState } from '../../src/services/storage';
import { loadSimulatorEnvConfig } from '../../src/config/env.config';

describe('guest (page under test) isolation', () => {
  it('only lets http(s) pages into a <webview>', () => {
    expect(isAllowedGuestUrl('https://example.com/')).toBe(true);
    expect(isAllowedGuestUrl('http://localhost:5173/')).toBe(true);
    expect(isAllowedGuestUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedGuestUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedGuestUrl('not a url')).toBe(false);
  });

  it('strips preload / node and forces sandbox on every attached webview', () => {
    const prefs: Record<string, unknown> = {
      preload: '/evil.js',
      preloadURL: 'file:///evil.js',
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false
    };
    const verdict = enforceGuestWebPreferences(prefs as never, { src: 'https://ok.example/' });
    expect(verdict.allow).toBe(true);
    expect(prefs.preload).toBeUndefined();
    expect(prefs.preloadURL).toBeUndefined();
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.transparent).toBe(false);
    expect(enforceGuestWebPreferences({} as never, { src: 'file:///x' }).allow).toBe(false);
    expect(enforceGuestWebPreferences({} as never, { src: 'about:blank' }).allow).toBe(true);
    expect(enforceGuestWebPreferences({} as never, { src: 'about:blank#script' }).allow).toBe(false);
    expect(isAllowedGuestUrl('about:blank')).toBe(false);
  });

  it('maps Chromium permissions to iOS prompts and denies desktop-only ones', () => {
    expect(mapElectronPermission('media', { mediaTypes: ['video', 'audio'] })).toEqual([
      'camera',
      'microphone'
    ]);
    expect(mapElectronPermission('geolocation', {})).toEqual(['location']);
    expect(mapElectronPermission('fullscreen', {})).toBe('allow');
    for (const p of ['openExternal', 'hid', 'serial', 'usb', 'midiSysex', 'display-capture']) {
      expect(mapElectronPermission(p, {})).toBe('deny');
    }
  });

  it('words prompts like iOS and remembers per origin', () => {
    expect(buildPromptMessage('https://maps.example.com', 'location')).toBe(
      '“maps.example.com” Would Like to Use Your Current Location'
    );
    const store = new GuestPermissionStore();
    store.set('https://a.test', 'camera', true);
    expect(store.get('https://a.test', 'camera')).toBe(true);
    expect(store.get('https://b.test', 'camera')).toBeUndefined();
  });

  it('keeps the shell on its own bundle', () => {
    expect(isSameShellUrl('file:///app/dist/index.html', 'file:///app/dist/index.html')).toBe(true);
    expect(isSameShellUrl('file:///etc/hosts', 'file:///app/dist/index.html')).toBe(false);
    expect(isSameShellUrl('http://localhost:5199/x', 'http://localhost:5199/')).toBe(true);
    expect(isSameShellUrl('https://evil.example/', 'http://localhost:5199/')).toBe(false);
  });

  it('validates window move payloads', () => {
    expect(isFiniteWindowPoint({ x: 10, y: 20 })).toBe(true);
    expect(isFiniteWindowPoint({ x: Number.NaN, y: 0 })).toBe(false);
    expect(isFiniteWindowPoint({ x: '1', y: 2 })).toBe(false);
    expect(isFiniteWindowPoint(null)).toBe(false);
    expect(isFiniteWindowPoint({ x: 1e9, y: 0 })).toBe(false);
  });
});

describe('embedded static server', () => {
  const root = '/srv/reboot';

  it('serves files inside the root only', () => {
    expect(resolveSafeStaticPath(root, '/')).toBe('/srv/reboot/index.html');
    expect(resolveSafeStaticPath(root, '/reference.html')).toBe('/srv/reboot/index.html');
    expect(resolveSafeStaticPath(root, '/feed.js?x=1')).toBe('/srv/reboot/feed.js');
    expect(resolveSafeStaticPath(root, '/../../etc/passwd')).toBeNull();
    expect(resolveSafeStaticPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    // sibling directory sharing the prefix "/srv/reboot"
    expect(resolveSafeStaticPath(root, '/../reboot-secrets/key')).toBeNull();
  });

  it('does not crash on malformed percent-encoding or NUL bytes', () => {
    expect(resolveSafeStaticPath(root, '/%E0%A4%A')).toBeNull();
    expect(resolveSafeStaticPath(root, '/a%00.html')).toBeNull();
  });

  it('rejects DNS-rebinding hosts', () => {
    expect(isLoopbackHostHeader('127.0.0.1:18765')).toBe(true);
    expect(isLoopbackHostHeader('localhost:18765')).toBe(true);
    expect(isLoopbackHostHeader('attacker.example:18765')).toBe(false);
    expect(isLoopbackHostHeader(undefined)).toBe(false);
  });
});

describe('untrusted state (IPC payload / disk)', () => {
  const env = loadSimulatorEnvConfig({});
  if (!env.ok) throw new Error('env');
  const defaults = createDefaultSimulatorState(env.value);

  it('drops unknown enum values and non-http URLs', () => {
    const merged = mergeStoredStateWithDefaults(
      {
        selectedDeviceId: 'iphone-99' as never,
        shellMode: 'evil' as never,
        currentUrl: 'javascript:alert(1)',
        pwaStatusBarStyle: 'nope' as never,
        scale: 99
      },
      defaults
    );
    expect(merged.selectedDeviceId).toBe(defaults.selectedDeviceId);
    expect(merged.shellMode).toBe(defaults.shellMode);
    expect(merged.currentUrl).toBe(defaults.currentUrl);
    expect(merged.pwaStatusBarStyle).toBe('default');
    expect(merged.scale).toBeLessThanOrEqual(1.15);
  });
});
