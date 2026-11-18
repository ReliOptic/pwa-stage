import { SimulatorBridgeApi } from './ipc-coordinator.types';

export interface ElectronWebviewElement extends HTMLElement {
  src: string;
  useragent: string;
  reload: () => void;
  reloadIgnoringCache: () => void;
  setZoomFactor: (factor: number) => void;
  findInPage: (text: string, options: {forward: boolean; findNext: boolean}) => number;
  stopFindInPage: (action: 'clearSelection') => void;
  goBack: () => void;
  goForward: () => void;
  getWebContentsId: () => number;
  getURL: () => string;
  loadURL?: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    readonly simulatorBridge?: SimulatorBridgeApi;
  }
}
