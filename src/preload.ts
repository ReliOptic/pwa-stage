import { contextBridge, ipcRenderer } from 'electron';
import {
  ApplyWebviewEmulationPayload,
  MoveWindowPayload,
  SimulatorBridgeApi,
  SimulatorInitPayload
} from './types/ipc-coordinator.types';
import { EmulationProfile } from './types/emulation.types';
import { Result, SimulatorError, SimulatorState } from './types/simulator.types';

export const simulatorBridge: SimulatorBridgeApi = {
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
  }
};

contextBridge.exposeInMainWorld('simulatorBridge', simulatorBridge);
