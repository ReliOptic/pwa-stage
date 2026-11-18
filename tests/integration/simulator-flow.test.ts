import { describe, expect, it, vi } from 'vitest';
import { loadSimulatorEnvConfig } from '../../src/config/env.config';
import { getHostnameForDisplay } from '../../src/renderer/components/BrowserShellOverlay';
import {
  handleApplyWebviewEmulation,
  handleGetInitialPayload,
  handleUpdateSimulatorState
} from '../../src/services/ipc-coordinator';
import { DeviceModelId, Orientation } from '../../src/types/device.types';
import { CoordinatorDependencies } from '../../src/types/ipc-coordinator.types';
import { BrowserShellMode, DuoDisplayMode } from '../../src/types/simulator.types';

describe('integration: simulator full device & shell switching flow', () => {
  it('switches from iPhone 17 Pro (Safari) to iPhone Duo Unfolded (PWA Standalone) with window resize and CDP sync', async () => {
    const envRes = loadSimulatorEnvConfig({});
    if (!envRes.ok) {
      throw new Error('Failed to load env');
    }

    const disk = new Map<string, string>();
    const setSizeSpy = vi.fn();
    const cdpSpy = vi.fn().mockResolvedValue({});

    const deps: CoordinatorDependencies = {
      envConfig: envRes.value,
      storageOptions: {
        storageFilePath: '/tmp/integration-state.json',
        envConfig: envRes.value,
        fsAdapter: {
          existsSync: (p) => disk.has(p),
          readFileSync: (p) => disk.get(p) ?? '',
          writeFileSync: (p, c) => {
            disk.set(p, c);
          }
        }
      },
      getMainWindow: () => ({
        isDestroyed: () => false,
        setSize: setSizeSpy,
        getSize: () => [400, 880],
        setAlwaysOnTop: vi.fn(),
        isAlwaysOnTop: () => true,
        setVisibleOnAllWorkspaces: vi.fn(),
        minimize: vi.fn(),
        close: vi.fn()
      }),
      resolveWebContentsById: () => ({
        id: 42,
        setUserAgent: vi.fn(),
        insertCSS: vi.fn().mockResolvedValue('css'),
        executeJavaScript: vi.fn().mockResolvedValue(undefined),
        debugger: {
          isAttached: () => false,
          attach: vi.fn(),
          sendCommand: cdpSpy
        }
      })
    };

    const initial = handleGetInitialPayload(deps);
    expect(initial.ok).toBe(true);
    if (!initial.ok) {
      return;
    }

    expect(getHostnameForDisplay(initial.value.state.currentUrl)).toBe('Start page');

    const duoState = {
      ...initial.value.state,
      selectedDeviceId: DeviceModelId.IPHONE_DUO_UNFOLDED,
      shellMode: BrowserShellMode.PWA_STANDALONE,
      duoDisplayMode: DuoDisplayMode.SPLIT_COMPARISON,
      orientation: Orientation.PORTRAIT,
      scale: 1.0
    };

    const updated = handleUpdateSimulatorState(deps, duoState);
    expect(updated.ok).toBe(true);
    expect(setSizeSpy).toHaveBeenLastCalledWith(1007, 798, false);

    const emu = await handleApplyWebviewEmulation(deps, {
      webContentsId: 42,
      state: duoState
    });
    expect(emu.ok).toBe(true);
    if (emu.ok) {
      // Inner display held wide: the trailing 84pt iOS 27.3 system rail is
      // drawn by the simulator, so the page's layout width is 951 - 84.
      expect(emu.value.metrics.width).toBe(867);
      expect(emu.value.metrics.screenWidth).toBe(951);
      expect(emu.value.pageSafeArea.right).toBe(0);
      // Web app without apple-mobile-web-app-status-bar-style: opaque status bar.
      expect(emu.value.metrics.height).toBe(669 - 20);
    }
  });
});
