import { SimulatorEnvConfig } from '../config/env.config';
import { DevicePreset } from './device.types';
import { EmulationProfile, EmulationTargetWebContents } from './emulation.types';
import { Result, SimulatorError, SimulatorState } from './simulator.types';
import { HomeScreenIdentity, PageInspection, PwaCheck } from './pwa.types';
import { StorageServiceOptions } from './storage.types';
import { NativeFloatingWindow } from './window-manager.types';

export interface MoveWindowPayload {
  readonly x: number;
  readonly y: number;
}

export interface SimulatorInitPayload {
  readonly state: SimulatorState;
  readonly presets: readonly DevicePreset[];
  readonly envConfig: SimulatorEnvConfig;
}

export interface ApplyWebviewEmulationPayload {
  readonly webContentsId: number;
  readonly state: SimulatorState;
}

export interface MoveWindowPayload {
  readonly x: number;
  readonly y: number;
}

export interface SimulatorBridgeApi {
  readonly getInitialPayload: () => Promise<Result<SimulatorInitPayload, SimulatorError>>;
  readonly updateSimulatorState: (
    nextState: SimulatorState
  ) => Promise<Result<SimulatorState, SimulatorError>>;
  readonly applyWebviewEmulation: (
    payload: ApplyWebviewEmulationPayload
  ) => Promise<Result<EmulationProfile, SimulatorError>>;
  readonly openWebviewDevTools: (webContentsId: number) => Promise<Result<boolean, SimulatorError>>;
  readonly minimizeWindow: () => Promise<Result<boolean, SimulatorError>>;
  readonly closeWindow: () => Promise<Result<boolean, SimulatorError>>;
  readonly showTwoFingerActionMenu?: () => Promise<Result<boolean, SimulatorError>>;
  readonly moveWindow: (payload: MoveWindowPayload) => Promise<Result<boolean, SimulatorError>>;
  readonly onExternalStateUpdate?: (listener: (state: SimulatorState) => void) => () => void;
  readonly onPermissionPrompt?: (listener: (prompt: GuestPermissionPrompt) => void) => () => void;
  readonly respondPermission?: (id: string, granted: boolean) => Promise<unknown>;
  readonly onShortcut?: (listener: (shortcut: { key: string; shift: boolean }) => void) => () => void;
  readonly inspectPage?: (webContentsId: number) => Promise<Result<PageInspectionReport, SimulatorError>>;
  readonly captureScreenshot?: (
    rect: { x: number; y: number; width: number; height: number },
    deviceName: string
  ) => Promise<{ ok: boolean; value: string | null }>;
}

export interface PageInspectionReport {
  readonly inspection: PageInspection;
  readonly checks: readonly PwaCheck[];
  readonly identity: HomeScreenIdentity;
}

export interface GuestPermissionPrompt {
  readonly id: string;
  readonly origin: string;
  readonly message: string;
}

export interface CoordinatorDependencies {
  readonly envConfig: SimulatorEnvConfig;
  readonly storageOptions: StorageServiceOptions;
  readonly getMainWindow: () => NativeFloatingWindow | null;
  readonly resolveWebContentsById: (
    id: number
  ) =>
    | (EmulationTargetWebContents & {
        readonly openDevTools?: (opts?: {
          mode: 'detach' | 'left' | 'right' | 'bottom' | 'undocked';
        }) => void;
      })
    | null;
}

export interface SimulatorInitPayload {
  readonly state: SimulatorState;
  readonly presets: readonly DevicePreset[];
  readonly envConfig: SimulatorEnvConfig;
}

export interface ApplyWebviewEmulationPayload {
  readonly webContentsId: number;
  readonly state: SimulatorState;
}