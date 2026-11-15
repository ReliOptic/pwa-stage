import { DEVICE_PRESETS, getDevicePresetById } from '../config/device-presets.config';
import { loadSimulatorEnvConfig, SimulatorEnvConfig } from '../config/env.config';
import { buildEmulationProfile } from '../services/emulation';
import { createDefaultSimulatorState } from '../services/storage';
import { EmulationProfile } from '../types/emulation.types';
import {
  ApplyWebviewEmulationPayload,
  MoveWindowPayload,
  SimulatorBridgeApi,
  SimulatorInitPayload
} from '../types/ipc-coordinator.types';
import { Result, SimulatorError, SimulatorState } from '../types/simulator.types';

const WEB_FALLBACK_STORAGE_KEY = 'campsite_iphone_simulator_state_v1';

function readWebFallbackPayload(
  envConfig: SimulatorEnvConfig
): Result<SimulatorInitPayload, SimulatorError> {
  const defaults = createDefaultSimulatorState(envConfig);
  let state = defaults;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(WEB_FALLBACK_STORAGE_KEY);
      if (saved) {
        state = { ...defaults, ...(JSON.parse(saved) as Partial<SimulatorState>) };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LocalStorage read error';
    return {
      ok: false,
      error: {
        kind: 'STORAGE_OPERATION_ERROR',
        operation: 'getInitialPayload',
        message,
        recoveryHint: 'Clear browser localStorage'
      }
    };
  }
  return { ok: true, value: { state, presets: DEVICE_PRESETS, envConfig } };
}

function writeWebFallbackState(
  nextState: SimulatorState
): Result<SimulatorState, SimulatorError> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(WEB_FALLBACK_STORAGE_KEY, JSON.stringify(nextState));
    }
    return { ok: true, value: nextState };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LocalStorage write error';
    return {
      ok: false,
      error: {
        kind: 'STORAGE_OPERATION_ERROR',
        operation: 'updateSimulatorState',
        message,
        recoveryHint: 'Check browser storage quota'
      }
    };
  }
}

function createBrowserFallbackBridge(): SimulatorBridgeApi {
  const envRes = loadSimulatorEnvConfig();
  if (!envRes.ok) {
    throw new Error(envRes.error.message);
  }
  const envConfig = envRes.value;

  return {
    getInitialPayload: async (): Promise<Result<SimulatorInitPayload, SimulatorError>> =>
      readWebFallbackPayload(envConfig),
    updateSimulatorState: async (
      nextState: SimulatorState
    ): Promise<Result<SimulatorState, SimulatorError>> => writeWebFallbackState(nextState),
    applyWebviewEmulation: async (
      payload: ApplyWebviewEmulationPayload
    ): Promise<Result<EmulationProfile, SimulatorError>> => {
      const preset = getDevicePresetById(payload.state.selectedDeviceId);
      const profile = buildEmulationProfile({
        preset,
        orientation: payload.state.orientation,
        shellMode: payload.state.shellMode,
        safariIosVersion: envConfig.safariIosVersion,
        chromeIosVersion: envConfig.chromeIosVersion,
        darkMode: payload.state.darkMode
      });
      return { ok: true, value: profile };
    },
    openWebviewDevTools: async (): Promise<Result<boolean, SimulatorError>> => ({
      ok: true,
      value: true
    }),
    minimizeWindow: async (): Promise<Result<boolean, SimulatorError>> => ({
      ok: true,
      value: true
    }),
    closeWindow: async (): Promise<Result<boolean, SimulatorError>> => ({
      ok: true,
      value: true
    }),
    moveWindow: async (_payload: MoveWindowPayload): Promise<Result<boolean, SimulatorError>> => ({
      ok: true,
      value: true
    })
  };
}

export function getSimulatorBridge(): SimulatorBridgeApi {
  if (typeof window !== 'undefined' && window.simulatorBridge) {
    return window.simulatorBridge;
  }
  return createBrowserFallbackBridge();
}

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.simulatorBridge);
}
