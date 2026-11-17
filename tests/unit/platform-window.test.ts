import { afterEach, expect, it, vi } from 'vitest';
import { loadSimulatorEnvConfig } from '../../src/config/env.config';
import { createDefaultSimulatorState } from '../../src/services/storage';
import { createFloatingSimulatorWindow } from '../../src/index';

const mock = vi.hoisted(() => ({ options: {} as Record<string, unknown>, ready: () => {},
  showInactive: vi.fn(), show: vi.fn(), setMenu: vi.fn(), exec: vi.fn((_cmd, _args, cb) => cb(new Error('no foreground app'), '')) }));
vi.mock('node:child_process', () => ({ execFile: mock.exec }));
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app' },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1200 } }) },
  BrowserWindow: class {
    webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn(), getURL: () => '', send: vi.fn() };
    constructor(options: Record<string, unknown>) { mock.options = options; }
    isDestroyed() { return false; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} on() {} focus() {} blur() {}
    once(_event: string, callback: () => void) { mock.ready = callback; }
    setMenu = mock.setMenu;
    showInactive = mock.showInactive;
    show = mock.show;
    loadFile() {} loadURL() {}
  }
}));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it.each(['win32', 'darwin', 'linux'] as const)('creates a secure transparent window with %s focus conventions', async (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
  const env = loadSimulatorEnvConfig();
  if (!env.ok) throw new Error('config');
  const state = { ...createDefaultSimulatorState(env.value), alwaysOnTop: false };
  createFloatingSimulatorWindow({ deps: {
    envConfig: env.value, storageOptions: { envConfig: env.value, storageFilePath: '/state',
      fsAdapter: { existsSync: () => true, readFileSync: () => JSON.stringify(state), writeFileSync: vi.fn() } },
    getMainWindow: () => null, resolveWebContentsById: () => null
  }, getWindow: () => null, onQuitApp: vi.fn() });
  expect(mock.options.transparent).toBe(true);
  expect(mock.options.frame).toBe(false);
  expect(mock.options.resizable).toBe(platform !== 'win32');
  expect(mock.options.webPreferences).toMatchObject({ sandbox: true, nodeIntegration: false, contextIsolation: true, webSecurity: true });
  expect(mock.setMenu.mock.calls.length).toBe(platform === 'win32' ? 1 : 0);
  mock.ready();
  await vi.waitFor(() => expect(mock.showInactive).toHaveBeenCalledOnce());
  expect(mock.show).not.toHaveBeenCalled();
  if (platform === 'darwin') expect(mock.exec).toHaveBeenCalledWith('lsappinfo', expect.any(Array), expect.any(Function));
  else expect(mock.exec).not.toHaveBeenCalled();
});
