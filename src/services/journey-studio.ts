import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { getDevicePresetById } from '../config/device-presets.config';
import { isTrustedShellSender } from './security';
import { MenuControllerContext, readCurrentState } from './menubar';
import { serveJourneySource } from './journey-source';
import { StageSession, type InspectGuest } from './stage-session';
import { BrowserShellMode, type SimulatorState } from '../types/simulator.types';
import type { StageCheckRequest } from '../types/journey.types';
import { JourneyPage, type JourneyInteraction } from './journey-page';
import { chooseAction, chooseStageProfile, drawPersonas, journeyRequest, stageRequest, suggestPersonas, type ModelTransport, type PageChoices } from './journey-planner';
import { JourneyReport, JourneyRequest, JourneyVisit, MAX_ACTIONS } from '../types/journey.types';
import type { EmulationProfileInput } from '../types/emulation.types';

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}

function reportHtml(report:JourneyReport, images:Map<number,string>) {
  const e=escapeHtml;
  const visits=report.visits.map((visit,i)=>`<section><h2>${i+1}. ${e(visit.persona)}</h2><p>${e(visit.source || report.origin)}</p>${visit.installation ? `<p>Home Screen launch · ${e(visit.installation.path)} · ${visit.installation.manifest?"Manifest read":"Website shortcut"}</p>` : ""}<p>${e(visit.outcome)} · ${e(visit.note)}</p><ol>${visit.frames.map(f=>
    `<li><h3>${e(f.action)}</h3><p>${e(f.title)} · ${e(f.path)}</p><img alt="Captured page" src="${images.get(f.id) ?? ''}"><p>${e(f.reason)}</p>${f.observation?'<details><summary>Page observations</summary><p>'+e(f.observation.text)+'</p><p>'+f.observation.controls.map(e).join(' · ')+'</p></details>':''}</li>`).join('')}</ol></section>`).join('');
  return `<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Audience journeys</title><style>body{max-width:1000px;margin:40px auto;padding:0 24px;font:16px/1.5 system-ui;background:#faf9f6;color:#212c29}ol{display:flex;flex-wrap:wrap;gap:22px;padding:0;list-style:none}li{width:230px;overflow-wrap:anywhere}img{max-width:100%;max-height:360px;border-radius:12px}section{border-top:1px solid #bbb}</style><h1>Audience journeys</h1><p>${e(report.origin)} · ${e(report.device)} · ${e(report.model)}</p><p>${e(report.goal)}</p><p>Simulated visits · ${e(report.status)} · ${e(report.message)}</p>${visits}`;
}

export function registerJourneyStudio(ctx: MenuControllerContext, inspect:InspectGuest) {
  // Chromium's network stack respects the OS proxy. Keep provider credentials
  // in a separate session from both the shell and the website under test.
  const router = session.fromPartition('journey-openrouter', {cache:false});
  const sendToRouter: ModelTransport = (url, options) => router.fetch(url, options);
  let studio: BrowserWindow | null=null;
  let controller: AbortController | null=null;
  let report: JourneyReport | null=null;
  const localSources=new Map<string,Awaited<ReturnType<typeof serveJourneySource>>>();
  const images=new Map<number,string>();
  const publish=()=>{if(studio && !studio.isDestroyed()) studio.webContents.send('journey:report',report);};
  const device=()=>{
    const state=readCurrentState(ctx.deps);
    return {state,preset:getDevicePresetById(state.selectedDeviceId)};
  };
  function append(visit:JourneyVisit,action:string,title:string,path:string,image:string,reason='',observed?:PageChoices){
    const id=images.size;
    images.set(id,image);
    visit.frames.push({id,path,title,action,reason,observation:observed && {text:observed.text,controls:observed.controls}});publish();
  }
  async function check(req:StageCheckRequest,current:JourneyReport,state:SimulatorState,signal:AbortSignal) {
    for(const address of req.addresses) for(const id of req.devices) for(const browser of req.browsers){
      signal.throwIfAborted();
      const preset=getDevicePresetById(id);
      const visit:JourneyVisit={persona:preset.name+' · '+(browser==='ios-safari'?'Safari':'Chrome'),source:new URL(address).origin+new URL(address).pathname,
        frames:[],outcome:'exploring',note:''};
      current.visits.push(visit);current.message='Checking '+new URL(address).host+' · '+visit.persona;publish();
      const stage=new StageSession(address,preset,browser as BrowserShellMode,state,ctx.deps.envConfig,inspect,signal);
      try{
        visit.installation=await stage.install((action,title,url,image)=>append(visit,action,title,new URL(url).pathname,image));
        visit.outcome='verified';visit.note=visit.installation.manifestError?'Website shortcut reopened. Manifest read failed: '+visit.installation.manifestError:visit.installation.manifest?'Manifest read. The installed icon reopened in standalone mode.':'No readable manifest. The website shortcut reopened in standalone mode.';
      }catch(error){
        signal.throwIfAborted();visit.outcome='blocked';visit.note=error instanceof Error?error.message:'Installation check failed.';
      }finally{stage.close();publish();}
    }
  }
  async function run(req:JourneyRequest, current:JourneyReport, profile:EmulationProfileInput,state:SimulatorState, signal:AbortSignal) {
    let order=req.audiences.length ? drawPersonas(req.audiences,req.iterations) : [];
      for(let i=0;i<req.iterations;i++) {
        signal.throwIfAborted();
        if(req.planDevice){current.message='Choosing device and browser';publish();}
        const setup=req.planDevice?await chooseStageProfile(req,order[i] || 'New visitor',current.visits.map(v=>v.source || ''),signal,sendToRouter):{
          preset:profile.preset,orientation:profile.orientation,browser:i%2===0?BrowserShellMode.IOS_SAFARI:BrowserShellMode.IOS_CHROME,reason:''};
        const visit:JourneyVisit={persona:order[i] || 'Identifying visitor',frames:[],outcome:'exploring',note:''};
        current.visits.push(visit);
        const page=req.installFirst?null:new JourneyPage(current.origin,profile,signal);
        const stage=req.installFirst?new StageSession(req.address,setup.preset,setup.browser,{...state,orientation:setup.orientation},ctx.deps.envConfig,inspect,signal):null;
        try {
          current.message='Opening visit '+(i+1); publish();
          let interaction:JourneyInteraction;
          if(stage){
            visit.source=[current.origin,setup.preset.name,setup.browser===BrowserShellMode.IOS_SAFARI?'Safari':'Chrome',setup.orientation].join(' · ');
            visit.installation=await stage.install((action,title,url,image)=>append(visit,action,title,new URL(url).pathname,image,action==='Open website'?setup.reason:''));
            interaction=stage.interaction();
          }else{
            await page!.open(req.address);interaction=page!.interaction;
          }
          let seen=await interaction.observe();
          if(!order.length){
            current.message='Finding target audiences';publish();
            order=drawPersonas(await suggestPersonas(req,seen.page,signal,sendToRouter,seen.image),req.iterations);
          }
          visit.persona=order[i];
          const firstPage=visit.frames.length;
          let action='Arrived', reason='';
          for(let step=0;step<=MAX_ACTIONS;step++) {
            signal.throwIfAborted();
            current.message='Visiting as '+visit.persona;
            append(visit,action,seen.page.title,seen.page.path,seen.image,reason,seen.page);
            if(step===MAX_ACTIONS) {
              visit.outcome='limit';visit.note='Reached the action limit.';break;
            }
            const decision=await chooseAction(req,visit.persona,seen.page,visit.frames.slice(firstPage).map(f=>({path:f.path,action:f.action,reason:f.reason})),signal,sendToRouter,seen.image);
            signal.throwIfAborted();
            if(decision.action==='finish'||decision.action==='blocked') {
              visit.outcome=decision.action==='blocked'?'blocked':decision.evidence?'finished':'unconfirmed';
              visit.note=decision.evidence ? decision.reason+' “'+decision.evidence+'”' : decision.reason;break;
            }
            action=decision.action==='tap' ? seen.page.controls[decision.target] : decision.action==='scroll' ? 'Scroll down' : 'Wait for content';
            reason=decision.reason;
            try {
              if(!await interaction.act(decision.action,decision.target)) {
                visit.outcome='blocked';visit.note=decision.action==='scroll'?'There was no more content to scroll.':'The chosen control changed before the tap.';break;
              }
              seen=await interaction.observe();
            } catch(error) {
              signal.throwIfAborted();
              visit.outcome='blocked';visit.note=error instanceof Error?error.message:'The next screen was unavailable.';break;
            }
          }
          publish();
        } finally { page?.close();stage?.close(); }
      }
  }
  async function execute(current:JourneyReport,signal:AbortSignal,work:()=>Promise<void>){
    try{
      await work();
      signal.throwIfAborted();
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
    const current:JourneyReport={id:randomUUID(),kind:'audience',origin:new URL(req.address).origin,goal:req.goal,model:(req.localEndpoint?'Local · ':'OpenRouter · ')+req.model,iterations:req.iterations,device:preset.name,
      status:'running',message:'Opening the start page',visits:[]};
    launch(current,signal=>run(req,current,profile,state,signal));
  });
  handle('source',async kind=>{
    const owner=studio;
    if(!owner || (kind!=='file' && kind!=='folder'))throw Error('Choose a local source.');
    const selection=await dialog.showOpenDialog(owner,{properties:[kind==='folder'?'openDirectory':'openFile']});
    if(selection.canceled || studio!==owner || !selection.filePaths[0])return null;
    const filename=selection.filePaths[0];
    const previous=localSources.get(filename);
    if(previous)return previous.url;
    if(localSources.size>=12)throw Error('Close the studio to clear the current local sources.');
    const source=await serveJourneySource(filename,kind==='folder');
    if(studio!==owner){source.close();return null;}
    const concurrent=localSources.get(filename);
    if(concurrent){source.close();return concurrent.url;}
    localSources.set(filename,source);return source.url;
  });
  handle('check',raw=>{
    if(controller)throw Error('A run is already in progress.');
    const req=stageRequest(raw), {state}=device();
    const current:JourneyReport={id:randomUUID(),kind:'install',origin:new URL(req.addresses[0]).origin,goal:'Install and reopen from the Home Screen',
      model:'Built-in installation check',iterations:req.devices.length*req.browsers.length*req.addresses.length,
      device:req.devices.map(id=>getDevicePresetById(id).name).join(', '),status:'running',message:'Opening simulator',visits:[]};
    launch(current,signal=>check(req,current,state,signal));
  });
  function launch(current:JourneyReport,work:(signal:AbortSignal)=>Promise<void>){
    images.clear();report=current;controller=new AbortController();
    const signal=controller.signal;publish();void execute(current,signal,()=>work(signal));
  }
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
    win.on('closed',()=>{controller?.abort();for(const source of localSources.values())source.close();localSources.clear();studio=null;});
    win.once('ready-to-show',()=>win.show());
    try {
      const dev=ctx.deps.envConfig.devServerUrl;
      if(dev) {const url=new URL(dev);url.searchParams.set('studio','journeys');await win.loadURL(url.href);}
      else await win.loadFile(path.join(__dirname,'../../dist/index.html'),{query:{studio:'journeys'}});
    } catch(error) {if(!win.isDestroyed())win.destroy();throw error;}
  };
}
