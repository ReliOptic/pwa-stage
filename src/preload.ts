import { contextBridge, ipcRenderer } from 'electron';
import type { JourneyReport, JourneyStudioApi } from './types/journey.types';
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
  openJourneys: (open = true) => ipcRenderer.invoke('simulator:open-journeys', open),
  onAgentPanel: fn => {
    const listener = (_event: unknown, open: boolean) => fn(open);
    ipcRenderer.on('simulator:agent-panel', listener);
    return () => ipcRenderer.removeListener('simulator:agent-panel', listener);
  },
  getInitialPayload: (): Promise<Result<SimulatorInitPayload, SimulatorError>> =>
    ipcRenderer.invoke('simulator:get-initial-payload'),
  updateSimulatorState: (
    nextState: SimulatorState
  ): Promise<Result<SimulatorState, SimulatorError>> =>
    ipcRenderer.invoke('simulator:update-state', nextState),
  resizeWebview: (id, size) => ipcRenderer.invoke('simulator:resize-webview', id, size),
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

const bridge: JourneyStudioApi = {
  initial:()=>ipcRenderer.invoke('journey:initial'),
  start:req=>ipcRenderer.invoke('journey:start',req),
  pickSource:kind=>ipcRenderer.invoke('journey:source',kind),
  check:req=>ipcRenderer.invoke('journey:check',req),
  stop:()=>ipcRenderer.invoke('journey:stop'),
  verifyModel:connection=>ipcRenderer.invoke('journey:verify-model',connection),
  image:(reportId,id)=>ipcRenderer.invoke('journey:image',reportId,id),
  recording:(reportId,visit)=>ipcRenderer.invoke('journey:recording',reportId,visit),
  watch:(reportId,visit,onFrame,onError)=>{
    const token=crypto.randomUUID();
    const listener=(_event:unknown,id:string,jpeg:string)=>{if(id===token)onFrame(jpeg);};
    ipcRenderer.on('journey:live-frame',listener);
    void ipcRenderer.invoke('journey:watch',reportId,visit,token).then(ok=>{if(!ok)onError();}).catch(onError);
    return ()=>{
      ipcRenderer.removeListener('journey:live-frame',listener);
      void ipcRenderer.invoke('journey:unwatch',token).catch(()=>{});
    };
  },
  save:()=>ipcRenderer.invoke('journey:save'),
  subscribe:fn=>{
    const listener=(_event:unknown,report:JourneyReport)=>fn(report);
    ipcRenderer.on('journey:report',listener);
    return ()=>ipcRenderer.removeListener('journey:report',listener);
  }
};
contextBridge.exposeInMainWorld('journeyStudio',bridge);
