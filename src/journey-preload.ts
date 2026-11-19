import { contextBridge, ipcRenderer } from 'electron';
import type { JourneyReport, JourneyStudioApi } from './types/journey.types';
const bridge: JourneyStudioApi = {
  initial:()=>ipcRenderer.invoke('journey:initial'),
  start:req=>ipcRenderer.invoke('journey:start',req),
  stop:()=>ipcRenderer.invoke('journey:stop'),
  image:(reportId,id)=>ipcRenderer.invoke('journey:image',reportId,id),
  save:()=>ipcRenderer.invoke('journey:save'),
  subscribe:fn=>{
    const listener=(_event:unknown,report:JourneyReport)=>fn(report);
    ipcRenderer.on('journey:report',listener);
    return ()=>ipcRenderer.removeListener('journey:report',listener);
  }
};
contextBridge.exposeInMainWorld('journeyStudio',bridge);
