import { regionLanguage, regionTimeZone } from '../utils/region.util';
import { SimulatorEnvConfig } from '../config/env.config';
import { DeviceModelId, Orientation } from '../types/device.types';
import {
  BrowserShellMode,
  DuoDisplayMode,
  Result,
  SimulatorState,
  StorageOperationError
} from '../types/simulator.types';
import { StorageServiceOptions } from '../types/storage.types';
import { logStructured } from '../utils/logger.util';
import { clampSimulatorScale } from '../utils/viewport-math.util';

export function createDefaultSimulatorState(envConfig: SimulatorEnvConfig): SimulatorState {
  return {
    currentUrl: envConfig.defaultTargetUrl,
    secondaryUrl: envConfig.secondaryTargetUrl,
    selectedDeviceId: DeviceModelId.IPHONE_17_PRO,
    orientation: Orientation.PORTRAIT,
    shellMode: BrowserShellMode.PWA_STANDALONE,
    duoDisplayMode: DuoDisplayMode.SINGLE_SPAN,
    showHingeOverlay: false,
    hudCollapsed: true,
    scale: envConfig.defaultScale,
    alwaysOnTop: envConfig.defaultAlwaysOnTop,
    touchCursorEnabled: false,
    darkMode: true,
    isFramed: true,
    pwaStatusBarStyle: 'default'
  };
}

function isEnumValue<T extends string>(enumObj: Record<string, T>, value: unknown): value is T {
  return typeof value === 'string' && (Object.values(enumObj) as string[]).includes(value);
}

function isHttpUrlString(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) {
    return false;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates untrusted state (disk file or IPC payload) field-by-field.
 * Unknown keys are dropped; invalid values fall back to defaults.
 */
export function mergeStoredStateWithDefaults(
  parsed: Partial<SimulatorState>,
  defaults: SimulatorState
): SimulatorState {
  return {
    currentUrl: isHttpUrlString(parsed.currentUrl) ? parsed.currentUrl.trim() : defaults.currentUrl,
    secondaryUrl: isHttpUrlString(parsed.secondaryUrl)
      ? parsed.secondaryUrl.trim()
      : defaults.secondaryUrl,
    selectedDeviceId: isEnumValue(DeviceModelId, parsed.selectedDeviceId)
      ? parsed.selectedDeviceId
      : defaults.selectedDeviceId,
    orientation: isEnumValue(Orientation, parsed.orientation)
      ? parsed.orientation
      : defaults.orientation,
    shellMode: isEnumValue(BrowserShellMode, parsed.shellMode)
      ? parsed.shellMode
      : defaults.shellMode,
    duoDisplayMode: isEnumValue(DuoDisplayMode, parsed.duoDisplayMode)
      ? parsed.duoDisplayMode
      : defaults.duoDisplayMode,
    showHingeOverlay: false,
    hudCollapsed:
      typeof parsed.hudCollapsed === 'boolean' ? parsed.hudCollapsed : defaults.hudCollapsed,
    scale:
      typeof parsed.scale === 'number'
        ? clampSimulatorScale(parsed.scale)
        : defaults.scale,
    alwaysOnTop:
      typeof parsed.alwaysOnTop === 'boolean' ? parsed.alwaysOnTop : defaults.alwaysOnTop,
    previewLanguage: regionLanguage(parsed.previewLanguage) || undefined,
    previewTimeZone: regionTimeZone(parsed.previewTimeZone) || undefined,
    touchCursorEnabled:
      typeof parsed.touchCursorEnabled === 'boolean'
        ? parsed.touchCursorEnabled
        : defaults.touchCursorEnabled,
    darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : defaults.darkMode,
    isFramed: typeof parsed.isFramed === 'boolean' ? parsed.isFramed : defaults.isFramed,
    pwaStatusBarStyle:
      parsed.pwaStatusBarStyle === 'black' || parsed.pwaStatusBarStyle === 'black-translucent'
        ? parsed.pwaStatusBarStyle
        : 'default'
  };
}

export function loadSimulatorState(
  options: StorageServiceOptions
): Result<SimulatorState, StorageOperationError> {
  const defaults = createDefaultSimulatorState(options.envConfig);

  if (!options.fsAdapter.existsSync(options.storageFilePath)) {
    logStructured('info', 'storage.service', 'state_initialized_defaults', {
      storageFilePath: options.storageFilePath
    });
    return { ok: true, value: defaults };
  }

  try {
    const raw = options.fsAdapter.readFileSync(options.storageFilePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SimulatorState>;
    const merged = mergeStoredStateWithDefaults(parsed, defaults);

    logStructured('info', 'storage.service', 'state_loaded', {
      selectedDeviceId: merged.selectedDeviceId,
      shellMode: merged.shellMode
    });

    return { ok: true, value: merged };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse stored simulator state';
    logStructured('error', 'storage.service', 'state_load_failed', {
      storageFilePath: options.storageFilePath,
      error: message
    });
    return {
      ok: false,
      error: {
        kind: 'STORAGE_OPERATION_ERROR',
        operation: 'loadSimulatorState',
        message,
        recoveryHint: 'Delete corrupted simulator-state.json or fall back to default state'
      }
    };
  }
}

export function saveSimulatorState(
  options: StorageServiceOptions,
  state: SimulatorState
): Result<SimulatorState, StorageOperationError> {
  try {
    const serialized = JSON.stringify(state, null, 2);
    options.fsAdapter.writeFileSync(options.storageFilePath, serialized, 'utf-8');
    logStructured('info', 'storage.service', 'state_saved', {
      selectedDeviceId: state.selectedDeviceId,
      currentUrl: state.currentUrl
    });
    return { ok: true, value: state };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write simulator state';
    logStructured('error', 'storage.service', 'state_save_failed', {
      storageFilePath: options.storageFilePath,
      error: message
    });
    return {
      ok: false,
      error: {
        kind: 'STORAGE_OPERATION_ERROR',
        operation: 'saveSimulatorState',
        message,
        recoveryHint: 'Check write permissions for application data directory'
      }
    };
  }
}
