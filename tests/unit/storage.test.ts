import { describe, expect, it } from 'vitest';
import { loadSimulatorEnvConfig } from '../../src/config/env.config';
import {
  createDefaultSimulatorState,
  loadSimulatorState,
  saveSimulatorState
} from '../../src/services/storage';
import { DeviceModelId } from '../../src/types/device.types';
import { BrowserShellMode } from '../../src/types/simulator.types';
import { FileSystemAdapter } from '../../src/types/storage.types';

function createMemoryFs(initialContent?: string): FileSystemAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  if (initialContent !== undefined) {
    store.set('/tmp/state.json', initialContent);
  }
  return {
    store,
    existsSync: (path: string) => store.has(path),
    readFileSync: (path: string) => {
      const value = store.get(path);
      if (value === undefined) {
        throw new Error('File not found');
      }
      return value;
    },
    writeFileSync: (path: string, content: string) => {
      store.set(path, content);
    }
  };
}

describe('storage service', () => {
  const envResult = loadSimulatorEnvConfig({});
  if (!envResult.ok) {
    throw new Error('Failed to load default env config in test');
  }
  const envConfig = envResult.value;

  it('returns default campsite.ing state when storage file does not exist', () => {
    const fsAdapter = createMemoryFs();
    const res = loadSimulatorState({
      storageFilePath: '/tmp/state.json',
      envConfig,
      fsAdapter
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.currentUrl).toBe('https://campsite.ing/');
      expect(res.value.selectedDeviceId).toBe(DeviceModelId.IPHONE_17_PRO);
    }
  });

  it('saves and reloads customized simulator state', () => {
    const fsAdapter = createMemoryFs();
    const initial = createDefaultSimulatorState(envConfig);
    const updated = {
      ...initial,
      selectedDeviceId: DeviceModelId.IPHONE_DUO_UNFOLDED,
      shellMode: BrowserShellMode.PWA_STANDALONE,
      scale: 1.0
    };

    const saveRes = saveSimulatorState(
      { storageFilePath: '/tmp/state.json', envConfig, fsAdapter },
      updated
    );
    expect(saveRes.ok).toBe(true);

    const loadRes = loadSimulatorState({
      storageFilePath: '/tmp/state.json',
      envConfig,
      fsAdapter
    });
    expect(loadRes.ok).toBe(true);
    if (loadRes.ok) {
      expect(loadRes.value.selectedDeviceId).toBe(DeviceModelId.IPHONE_DUO_UNFOLDED);
      expect(loadRes.value.shellMode).toBe(BrowserShellMode.PWA_STANDALONE);
      expect(loadRes.value.scale).toBe(1.0);
    }
  });

  it('returns typed StorageOperationError when JSON is corrupted', () => {
    const fsAdapter = createMemoryFs('{ invalid json ');
    const loadRes = loadSimulatorState({
      storageFilePath: '/tmp/state.json',
      envConfig,
      fsAdapter
    });

    expect(loadRes.ok).toBe(false);
    if (!loadRes.ok) {
      expect(loadRes.error.kind).toBe('STORAGE_OPERATION_ERROR');
    }
  });
});
