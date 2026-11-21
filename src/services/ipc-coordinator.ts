import { DEVICE_PRESETS, getDevicePresetById } from '../config/device-presets.config';
import {
  ApplyWebviewEmulationPayload,
  CoordinatorDependencies,
  SimulatorInitPayload
} from '../types/ipc-coordinator.types';
import { EmulationProfile } from '../types/emulation.types';
import { Result, SimulatorError, SimulatorState } from '../types/simulator.types';
import { logStructured } from '../utils/logger.util';
import { applyEmulationToTarget } from './emulation';
import { createDefaultSimulatorState, loadSimulatorState, saveSimulatorState } from './storage';
import { applyDeviceWindowBounds, setFloatingPin } from './window-manager';

export function stripFrameBlockingHeaders(
  responseHeaders: Readonly<Record<string, readonly string[] | string>> | undefined
): Record<string, string[] | string> {
  if (!responseHeaders) {
    return {};
  }
  const sanitized: Record<string, string[] | string> = {};
  for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
    const lower = headerName.toLowerCase();
    if (lower === 'x-frame-options') {
      continue;
    }
    if (lower === 'content-security-policy') {
      const values = Array.isArray(headerValue) ? headerValue : [String(headerValue)];
      sanitized[headerName] = values.map((policy) =>
        policy.replace(/frame-ancestors[^;]*;?/gi, '')
      );
      continue;
    }
    sanitized[headerName] = Array.isArray(headerValue) ? [...headerValue] : String(headerValue);
  }
  return sanitized;
}

export function handleGetInitialPayload(
  deps: CoordinatorDependencies
): Result<SimulatorInitPayload, SimulatorError> {
  const loaded = loadSimulatorState(deps.storageOptions);
  const state = loaded.ok
    ? loaded.value
    : createDefaultSimulatorState(deps.envConfig);

  const win = deps.getMainWindow();
  if (win) {
    const preset = getDevicePresetById(state.selectedDeviceId);
    applyDeviceWindowBounds(win, {
      preset,
      orientation: state.orientation,
      scale: state.scale,
      isFramed: state.isFramed,
      hudCollapsed: state.hudCollapsed,
      agentWorkArea: deps.getAgentWorkArea?.(),
      animate: false
    });
    setFloatingPin(win, state.alwaysOnTop);
  }

  return {
    ok: true,
    value: {
      state,
      presets: DEVICE_PRESETS,
      envConfig: deps.envConfig
    }
  };
}

export function handleUpdateSimulatorState(
  deps: CoordinatorDependencies,
  nextState: SimulatorState
): Result<SimulatorState, SimulatorError> {
  const win = deps.getMainWindow();
  if (win) {
    const preset = getDevicePresetById(nextState.selectedDeviceId);
    const resizeRes = applyDeviceWindowBounds(win, {
      preset,
      orientation: nextState.orientation,
      scale: nextState.scale,
      isFramed: nextState.isFramed,
      hudCollapsed: nextState.hudCollapsed,
      agentWorkArea: deps.getAgentWorkArea?.(),
      animate: false
    });
    if (!resizeRes.ok) {
      return resizeRes;
    }
    const pinRes = setFloatingPin(win, nextState.alwaysOnTop);
    if (!pinRes.ok) {
      return pinRes;
    }
  }

  return saveSimulatorState(deps.storageOptions, nextState);
}

export async function handleApplyWebviewEmulation(
  deps: CoordinatorDependencies,
  payload: ApplyWebviewEmulationPayload
): Promise<Result<EmulationProfile, SimulatorError>> {
  const target = deps.resolveWebContentsById(payload.webContentsId);
  if (!target) {
    logStructured('warn', 'ipc-coordinator.service', 'webcontents_not_found', {
      webContentsId: payload.webContentsId
    });
    return {
      ok: false,
      error: {
        kind: 'EMULATION_FAILURE_ERROR',
        operation: 'handleApplyWebviewEmulation',
        message: `WebContents #${String(payload.webContentsId)} not found`,
        recoveryHint: 'Wait for webview dom-ready before applying emulation'
      }
    };
  }

  const preset = getDevicePresetById(payload.state.selectedDeviceId);
  return applyEmulationToTarget(target, {
    viewportSize: payload.viewportSize,
    preset,
    orientation: payload.state.orientation,
    shellMode: payload.state.shellMode,
    safariIosVersion: deps.envConfig.safariIosVersion,
    chromeIosVersion: deps.envConfig.chromeIosVersion,
    darkMode: payload.state.darkMode,
    previewLanguage: payload.state.previewLanguage,
    previewTimeZone: payload.state.previewTimeZone,
    scale: payload.state.scale,
    touchCursorEnabled: payload.state.touchCursorEnabled,
    pwaStatusBarStyle: payload.state.pwaStatusBarStyle
  });
}

export function handleOpenWebviewDevTools(
  deps: CoordinatorDependencies,
  webContentsId: number
): Result<boolean, SimulatorError> {
  const target = deps.resolveWebContentsById(webContentsId);
  if (!target || !target.openDevTools) {
    return {
      ok: false,
      error: {
        kind: 'EMULATION_FAILURE_ERROR',
        operation: 'handleOpenWebviewDevTools',
        message: 'Target webview unavailable for DevTools inspection',
        recoveryHint: 'Ensure the webview has finished loading'
      }
    };
  }
  target.openDevTools({ mode: 'detach' });
  logStructured('info', 'ipc-coordinator.service', 'devtools_opened', { webContentsId });
  return { ok: true, value: true };
}
