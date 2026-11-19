import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { getDevicePresetById } from '../config/device-presets.config';
import { isTrustedShellSender } from './security';
import { MenuControllerContext, readCurrentState } from './menubar';
import { JourneyPage } from './journey-page';
import { chooseAction, drawPersonas, journeyRequest, suggestPersonas, type ModelTransport } from './journey-planner';
import { JourneyReport, JourneyRequest, JourneyVisit, MAX_ACTIONS } from '../types/journey.types';
import type { EmulationProfileInput } from '../types/emulation.types';

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}

function reportHtml(report:JourneyReport, images:Map<number,string>) {
  const e=escapeHtml;
  const visits=report.visits.map((visit,i)=>`<section><h2>${i+1}. ${e(visit.persona)}</h2><p>${e(visit.outcome)} · ${e(visit.note)}</p><ol>${visit.frames.map(f=>
    `<li><h3>${e(f.action)}</h3><p>${e(f.title)} · ${e(f.path)}</p><img alt="Captured page" src="${images.get(f.id) ?? ''}"><p>${e(f.reason)}</p></li>`).join('')}</ol></section>`).join('');
  return `<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Audience journeys</title><style>body{max-width:1000px;margin:40px auto;padding:0 24px;font:16px/1.5 system-ui;background:#faf9f6;color:#212c29}ol{display:flex;flex-wrap:wrap;gap:22px;padding:0;list-style:none}li{width:230px;overflow-wrap:anywhere}img{max-width:100%;max-height:360px;border-radius:12px}section{border-top:1px solid #bbb}</style><h1>Audience journeys</h1><p>${e(report.origin)} · ${e(report.device)} · ${e(report.model)}</p><p>${e(report.goal)}</p><p>Simulated visits · ${e(report.status)} · ${e(report.message)}</p>${visits}`;
}

export function registerJourneyStudio(ctx: MenuControllerContext) {
  // Chromium's network stack respects the OS proxy. Keep provider credentials
  // in a separate session from both the shell and the website under test.
  const router = session.fromPartition('journey-openrouter', {cache:false});
  const sendToRouter: ModelTransport = (url, options) => router.fetch(url, options);
  let studio: BrowserWindow | null=null;
  let controller: AbortController | null=null;
  let report: JourneyReport | null=null;
  const images=new Map<number,string>();
  const publish=()=>{if(studio && !studio.isDestroyed()) studio.webContents.send('journey:report',report);};
  const device=()=>{
    const state=readCurrentState(ctx.deps);
    return {state,preset:getDevicePresetById(state.selectedDeviceId)};
  };
  async function run(req:JourneyRequest, current:JourneyReport, profile:EmulationProfileInput, signal:AbortSignal) {
    let order=req.audiences.length ? drawPersonas(req.audiences,req.iterations) : [];
    try {
      for(let i=0;i<req.iterations;i++) {
        signal.throwIfAborted();
        const page=new JourneyPage(current.origin,profile,signal);
        try {
          current.message='Opening visit '+(i+1); publish();
          await page.open(req.address);
          let seen=await page.observe();
          if (!order.length) {
            current.message='Finding target audiences';publish();
            order=drawPersonas(await suggestPersonas(req,seen.page,signal,sendToRouter),req.iterations);
          }
          const visit:JourneyVisit={persona:order[i],frames:[],outcome:'exploring',note:''};
          current.visits.push(visit);
          let action='Arrived', reason='';
          for(let step=0;step<=MAX_ACTIONS;step++) {
            signal.throwIfAborted();
            const id=images.size;
            images.set(id,seen.image);
            visit.frames.push({id,path:seen.page.path,title:seen.page.title,action,reason});
            current.message='Visiting as '+visit.persona;publish();
            if(step===MAX_ACTIONS) {
              visit.outcome='limit';visit.note='Reached the action limit.';break;
            }
            const decision=await chooseAction(req,visit.persona,seen.page,visit.frames.map(f=>({path:f.path,action:f.action,reason:f.reason})),signal,sendToRouter);
            signal.throwIfAborted();
            if(decision.action==='finish'||decision.action==='blocked') {
              visit.outcome=decision.action==='finish'?'finished':'blocked';visit.note=decision.reason;break;
            }
            action=decision.action==='tap' ? seen.page.controls[decision.target] : decision.action==='scroll' ? 'Scroll down' : 'Wait for content';
            reason=decision.reason;
            try {
              if(!await page.act(decision.action,decision.target)) {
                visit.outcome='blocked';visit.note=decision.action==='scroll'?'There was no more content to scroll.':'The chosen control changed before the tap.';break;
              }
              seen=await page.observe();
            } catch(error) {
              signal.throwIfAborted();
              visit.outcome='blocked';visit.note=error instanceof Error?error.message:'The next screen was unavailable.';break;
            }
          }
          publish();
        } finally { page.close(); }
      }
      current.status='completed';current.message='Visits complete';
    } catch(error) {
      current.status=signal.aborted?'stopped':'error';
      current.message=signal.aborted?'Run stopped':error instanceof Error?error.message:'Run failed';
      const last=current.visits.at(-1);
      if(last?.outcome==='exploring'){last.outcome=signal.aborted?'stopped':'error';last.note=current.message;}
    } finally {controller=null; publish();}
  }
  function handle(channel:string, fn:(...args:unknown[])=>unknown) {
    ipcMain.handle('journey:'+channel,(e,...args)=>{
      if(!studio || !isTrustedShellSender(e,studio) || e.senderFrame!==studio.webContents.mainFrame) throw Error('Studio window required.');
      return fn(...args);
    });
  }
  handle('initial',()=>{
    const {state,preset}=device();
    return {address:state.currentUrl===ctx.deps.envConfig.quickBookmarks.find(b=>b.id==='start')?.url?'':state.currentUrl,device:preset.name,environmentKey:Boolean(process.env.OPENROUTER_API_KEY),report};
  });
  handle('start',raw=>{
    if(controller) throw Error('A journey is already running.');
    const req=journeyRequest(raw,process.env.OPENROUTER_API_KEY);
    const {state,preset}=device();
    const profile:EmulationProfileInput={preset,orientation:state.orientation,shellMode:state.shellMode,darkMode:state.darkMode,
      safariIosVersion:ctx.deps.envConfig.safariIosVersion,chromeIosVersion:ctx.deps.envConfig.chromeIosVersion};
    images.clear();
    report={id:randomUUID(),origin:new URL(req.address).origin,goal:req.goal,model:req.model,iterations:req.iterations,device:preset.name,
      status:'running',message:'Opening the start page',visits:[]};
    controller=new AbortController();
    publish();void run(req,report,profile,controller.signal);
  });
  handle('stop',()=>controller?.abort());
  handle('image',(runId,id)=>runId===report?.id && typeof id==='number' ? images.get(id) ?? null : null);
  handle('save',async()=>{
    if (!studio || !report || controller) return false;
    const html=reportHtml(report,images);
    const result=await dialog.showSaveDialog(studio,{defaultPath:'audience-journeys.html',filters:[{name:'HTML report',extensions:['html']}]});
    if(result.canceled || !result.filePath) return false;
    await writeFile(result.filePath,html,'utf8');return true;
  });

  return async function openStudio() {
    if(studio && !studio.isDestroyed()){studio.show();studio.focus();return;}
    const win=new BrowserWindow({title:'Audience journeys',parent:ctx.getWindow() ?? undefined,width:1040,height:800,minWidth:690,minHeight:500,show:false,
      autoHideMenuBar:true,backgroundColor:'#f6f5f0',webPreferences:{preload:path.join(__dirname,'../journey-preload.js'),
        contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:false}});
    studio=win;
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.on('closed',()=>{controller?.abort();studio=null;});
    win.once('ready-to-show',()=>win.show());
    try {
      const dev=ctx.deps.envConfig.devServerUrl;
      if(dev) {const url=new URL(dev);url.searchParams.set('studio','journeys');await win.loadURL(url.href);}
      else await win.loadFile(path.join(__dirname,'../../dist/index.html'),{query:{studio:'journeys'}});
    } catch(error) {if(!win.isDestroyed())win.destroy();throw error;}
  };
}
