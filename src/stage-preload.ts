import { contextBridge, ipcRenderer } from 'electron';
import type { SimulatorBridgeApi } from './types/ipc-coordinator.types';

// This window hosts a separate copy of the real simulator for one visit.
const guestPartition = process.argv.find(arg=>arg.startsWith('--stage-guest='))?.slice('--stage-guest='.length);
const unavailable=async()=>({ok:true as const,value:false});
const bridge:SimulatorBridgeApi={
  guestPartition,
  getInitialPayload:()=>ipcRenderer.invoke('stage:initial'),
  updateSimulatorState:state=>ipcRenderer.invoke('stage:state',state),
  applyWebviewEmulation:payload=>ipcRenderer.invoke('stage:emulate',payload),
  resizeWebview:(id,size)=>ipcRenderer.invoke('stage:resize',id,size),
  setGuestMirror:(id,on,fps)=>ipcRenderer.invoke('stage:mirror',id,on,fps),
  onGuestFrame:receive=>{
    const listener=(_event:unknown,frame:Parameters<typeof receive>[0])=>receive(frame);
    ipcRenderer.on('stage:frame',listener);
    return ()=>ipcRenderer.removeListener('stage:frame',listener);
  },
  inspectPage:id=>ipcRenderer.invoke('stage:inspect',id),
  minimizeWindow:unavailable,closeWindow:unavailable,moveWindow:unavailable,openWebviewDevTools:unavailable
};
contextBridge.exposeInMainWorld('simulatorBridge',bridge);
