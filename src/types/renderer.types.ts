import { SimulatorBridgeApi } from './ipc-coordinator.types';

export interface ElectronWebviewElement extends HTMLElement {
  src: string;
  useragent: string;
  reload: () => void;
  reloadIgnoringCache: () => void;
  goBack: () => void;
  goForward: () => void;
  getWebContentsId: () => number;
  loadURL?: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    readonly simulatorBridge?: SimulatorBridgeApi;
  }
}
