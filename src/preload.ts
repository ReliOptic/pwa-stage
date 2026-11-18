import { contextBridge, ipcRenderer } from 'electron';
import {
  ApplyWebviewEmulationPayload,
  GuestFrameMessage,
  GuestInputMessage,
  GuestPermissionPrompt,
  MoveWindowPayload,
  SimulatorBridgeApi,
  SimulatorInitPayload
} from './types/ipc-coordinator.types';
import { EmulationProfile } from './types/emulation.types';
import { Result, SimulatorError, SimulatorState } from './types/simulator.types';

export const simulatorBridge: SimulatorBridgeApi = {
  platform: process.platform,
  getInitialPayload: (): Promise<Result<SimulatorInitPayload, SimulatorError>> =>
    ipcRenderer.invoke('simulator:get-initial-payload'),
  updateSimulatorState: (
    nextState: SimulatorState
  ): Promise<Result<SimulatorState, SimulatorError>> =>
    ipcRenderer.invoke('simulator:update-state', nextState),
  applyWebviewEmulation: (
    payload: ApplyWebviewEmulationPayload
  ): Promise<Result<EmulationProfile, SimulatorError>> =>
    ipcRenderer.invoke('simulator:apply-webview-emulation', payload),
  openWebviewDevTools: (
    webContentsId: number
  ): Promise<Result<boolean, SimulatorError>> =>
    ipcRenderer.invoke('simulator:open-webview-devtools', webContentsId),
  minimizeWindow: (): Promise<Result<boolean, SimulatorError>> =>
    ipcRenderer.invoke('simulator:minimize-window'),
  closeWindow: (): Promise<Result<boolean, SimulatorError>> =>
    ipcRenderer.invoke('simulator:close-window'),
  showTwoFingerActionMenu: (): Promise<Result<boolean, SimulatorError>> =>
    ipcRenderer.invoke('simulator:show-two-finger-menu'),
  moveWindow: (payload: MoveWindowPayload): Promise<Result<boolean, SimulatorError>> =>
    ipcRenderer.invoke('simulator:move-window', payload),
  onExternalStateUpdate: (listener: (state: SimulatorState) => void): (() => void) => {
    const handler = (_event: unknown, nextState: SimulatorState): void => {
      listener(nextState);
    };
    ipcRenderer.on('simulator:external-state', handler);
    return (): void => {
      ipcRenderer.removeListener('simulator:external-state', handler);
    };
  },
  onPermissionPrompt: (listener: (prompt: GuestPermissionPrompt) => void): (() => void) => {
    const handler = (_event: unknown, prompt: GuestPermissionPrompt): void => {
      listener(prompt);
    };
    ipcRenderer.on('simulator:permission-prompt', handler);
    return (): void => {
      ipcRenderer.removeListener('simulator:permission-prompt', handler);
    };
  },
  respondPermission: (id: string, granted: boolean): Promise<unknown> =>
    ipcRenderer.invoke('simulator:permission-response', id, granted),
  onShortcut: (listener: (shortcut: { key: string; shift: boolean }) => void): (() => void) => {
    const handler = (_event: unknown, shortcut: { key: string; shift: boolean }): void => {
      listener(shortcut);
    };
    ipcRenderer.on('simulator:shortcut', handler);
    return (): void => {
      ipcRenderer.removeListener('simulator:shortcut', handler);
    };
  },
  setGuestMirror: (webContentsId: number, on: boolean, fps?: number): Promise<unknown> =>
    ipcRenderer.invoke('simulator:guest-mirror', webContentsId, on, fps),
  onGuestFrame: (listener: (frame: GuestFrameMessage) => void): (() => void) => {
    const handler = (_event: unknown, frame: GuestFrameMessage): void => {
      listener(frame);
    };
    ipcRenderer.on('simulator:guest-frame', handler);
    return (): void => {
      ipcRenderer.removeListener('simulator:guest-frame', handler);
    };
  },
  sendGuestInput: (webContentsId: number, event: GuestInputMessage): Promise<unknown> =>
    ipcRenderer.invoke('simulator:guest-input', webContentsId, event),
  inspectPage: (webContentsId: number) =>
    ipcRenderer.invoke('simulator:inspect-page', webContentsId),
  getScreenshotDirectory: () => ipcRenderer.invoke('simulator:screenshot-directory'),
  openScreenshotLocation: (latest: boolean) => ipcRenderer.invoke('simulator:open-screenshot-location', latest),
  captureScreenshot: (
    rect: { x: number; y: number; width: number; height: number },
    deviceName: string
  ) => ipcRenderer.invoke('simulator:capture-screenshot', rect, deviceName)
};

contextBridge.exposeInMainWorld('simulatorBridge', simulatorBridge);
