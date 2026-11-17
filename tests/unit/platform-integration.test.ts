import { afterEach, describe, expect, it, vi } from 'vitest';
import { installNavigationGuards } from '../../src/services/security';
import { createMenuBarTray, buildQuickActionMenu, openInXcodeSimulator } from '../../src/services/menubar';
import { loadSimulatorEnvConfig } from '../../src/config/env.config';
import { createDefaultSimulatorState } from '../../src/services/storage';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(), template: vi.fn(), resize: vi.fn(() => 'color-icon'), tray: vi.fn(),
  menu: vi.fn((template) => template)
}));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app' },
  Menu: { buildFromTemplate: mocks.menu },
  nativeImage: { createEmpty: () => ({ setTemplateImage: mocks.template, resize: mocks.resize }) },
  Tray: class { constructor(icon: unknown) { mocks.tray(icon); } setTitle() {} setToolTip() {} on() {} }
}));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('platform service integration', () => {
  it.each(['win32', 'darwin'] as const)('tray and Xcode integration on %s', (platform) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    const env = loadSimulatorEnvConfig();
    if (!env.ok) throw new Error('config');
    const state = createDefaultSimulatorState(env.value);
    const ctx = { deps: { envConfig: env.value, storageOptions: {
      envConfig: env.value, storageFilePath: '/state', fsAdapter: {
        existsSync: () => true, readFileSync: () => JSON.stringify(state), writeFileSync: vi.fn()
      }
    }, getMainWindow: () => null, resolveWebContentsById: () => null }, getWindow: () => null, onQuitApp: vi.fn() };
    createMenuBarTray(ctx);
    expect(mocks.template).toHaveBeenCalledWith(platform === 'darwin');
    expect(mocks.resize.mock.calls.length).toBe(platform === 'win32' ? 1 : 0);
    buildQuickActionMenu(ctx);
    const items = mocks.menu.mock.calls[0][0];
    expect(items[0].visible).toBe(platform === 'darwin');
    expect(items[2].label).toContain(platform === 'darwin' ? 'Spaces' : 'Always on top');
    openInXcodeSimulator('https://example.com');
    expect(mocks.exec.mock.calls.length).toBe(platform === 'darwin' ? 1 : 0);
    mocks.exec.mockClear();
    openInXcodeSimulator('file:///unsafe');
    expect(mocks.exec).not.toHaveBeenCalled();
  });

  it.each(['win32', 'darwin'] as const)('forwards host shortcuts from sandboxed guests on %s', (platform) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    const shellHandlers: Record<string, Function> = {};
    const guestHandlers: Record<string, Function> = {};
    const send = vi.fn();
    installNavigationGuards({ webContents: {
      on: (name: string, cb: Function) => { shellHandlers[name] = cb; },
      setWindowOpenHandler: vi.fn(), isDestroyed: () => false, send
    } } as never, () => true);
    shellHandlers['did-attach-webview']({}, {
      on: (name: string, cb: Function) => { guestHandlers[name] = cb; },
      setWindowOpenHandler: vi.fn()
    });
    const preventDefault = vi.fn();
    const input = { type: 'keyDown', key: 'b', control: true, meta: false, alt: false, shift: false };
    guestHandlers['before-input-event']({ preventDefault }, input);
    expect(send).toHaveBeenCalledWith('simulator:shortcut', { key: 'b', shift: false });
    send.mockClear();
    guestHandlers['before-input-event']({ preventDefault }, { ...input, alt: true });
    expect(send.mock.calls.length).toBe(platform === 'darwin' ? 1 : 0);
    send.mockClear();
    guestHandlers['before-input-event']({ preventDefault }, { ...input, key: 's', shift: true });
    expect(send).not.toHaveBeenCalled();
    guestHandlers['before-input-event']({ preventDefault }, { ...input, control: false, meta: true });
    expect(send.mock.calls.length).toBe(platform === 'darwin' ? 1 : 0);
  });
});
