import { describe, expect, it, vi } from 'vitest';
import { loadSimulatorEnvConfig } from '../../src/config/env.config';
import {
  handleApplyWebviewEmulation,
  handleGetInitialPayload,
  handleOpenWebviewDevTools,
  handleUpdateSimulatorState,
  stripFrameBlockingHeaders
} from '../../src/services/ipc-coordinator';
import { createDefaultSimulatorState } from '../../src/services/storage';
import { DeviceModelId } from '../../src/types/device.types';
import { CoordinatorDependencies } from '../../src/types/ipc-coordinator.types';
import { NativeFloatingWindow } from '../../src/types/window-manager.types';

function createMockCoordinatorDeps(): CoordinatorDependencies {
  const envRes = loadSimulatorEnvConfig({});
  if (!envRes.ok) {
    throw new Error('Env load failed');
  }
  const store = new Map<string, string>();
  const mockWin: NativeFloatingWindow = {
    isDestroyed: () => false,
    setSize: vi.fn(),
    getSize: () => [420, 900],
    setAlwaysOnTop: vi.fn(),
    isAlwaysOnTop: () => true,
    setVisibleOnAllWorkspaces: vi.fn(),
    minimize: vi.fn(),
    close: vi.fn()
  };

  return {
    envConfig: envRes.value,
    storageOptions: {
      storageFilePath: '/tmp/sim.json',
      envConfig: envRes.value,
      fsAdapter: {
        existsSync: (p) => store.has(p),
        readFileSync: (p) => store.get(p) ?? '',
        writeFileSync: (p, c) => {
          store.set(p, c);
        }
      }
    },
    getMainWindow: () => mockWin,
    resolveWebContentsById: (id: number) =>
      id === 1
        ? {
            id: 1,
            setUserAgent: vi.fn(),
            insertCSS: vi.fn().mockResolvedValue('css'),
            executeJavaScript: vi.fn().mockResolvedValue(undefined),
            openDevTools: vi.fn(),
            debugger: {
              on: vi.fn(), removeListener: vi.fn(),
              isAttached: () => false,
              attach: vi.fn(),
              sendCommand: vi.fn().mockResolvedValue({})
            }
          }
        : null
  };
}

describe('ipc-coordinator service', () => {
  it('strips X-Frame-Options and CSP frame-ancestors headers', () => {
    const cleaned = stripFrameBlockingHeaders({
      'X-Frame-Options': ['DENY'],
      'Content-Security-Policy': ["default-src 'self'; frame-ancestors 'none'; script-src 'self'"],
      'Cache-Control': ['no-cache']
    });

    expect(cleaned['X-Frame-Options']).toBeUndefined();
    expect(cleaned['Content-Security-Policy']).toEqual([
      "default-src 'self';  script-src 'self'"
    ]);
    expect(cleaned['Cache-Control']).toEqual(['no-cache']);
  });

  it('returns initial payload and updates state + window bounds', () => {
    const deps = createMockCoordinatorDeps();
    const initRes = handleGetInitialPayload(deps);
    expect(initRes.ok).toBe(true);

    const nextState = {
      ...createDefaultSimulatorState(deps.envConfig),
      selectedDeviceId: DeviceModelId.IPHONE_17_AIR
    };
    const updateRes = handleUpdateSimulatorState(deps, nextState);
    expect(updateRes.ok).toBe(true);
  });

  it('applies webview emulation and opens detached DevTools when webContents exists', async () => {
    const deps = createMockCoordinatorDeps();
    const state = createDefaultSimulatorState(deps.envConfig);

    const emuRes = await handleApplyWebviewEmulation(deps, {
      webContentsId: 1,
      state
    });
    expect(emuRes.ok).toBe(true);

    const missingRes = await handleApplyWebviewEmulation(deps, {
      webContentsId: 999,
      state
    });
    expect(missingRes.ok).toBe(false);

    const devToolsRes = handleOpenWebviewDevTools(deps, 1);
    expect(devToolsRes.ok).toBe(true);
  });
});
