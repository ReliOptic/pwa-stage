import { app, dialog, ipcMain, session, type WebContents } from 'electron';
import { watchJourneySurface } from './journey-live';
import { createVisitRecording, type VisitRecording } from './journey-recording';
import { reportHtml } from './journey-report';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { getDevicePresetById } from '../config/device-presets.config';
import { isTrustedShellSender } from './security';
import { MenuControllerContext, readCurrentState } from './menubar';
import { serveJourneySource } from './journey-source';
import { StageSession, type InspectGuest } from './stage-session';
import { BrowserShellMode, type SimulatorState } from '../types/simulator.types';
import type { StageCheckRequest } from '../types/journey.types';
import { JourneyPage, type JourneyInteraction } from './journey-page';
import { chooseAction, chooseStageProfile, drawPersonas, journeyRequest, stageRequest, suggestPersonas, type ModelTransport, type PageChoices } from './journey-planner';
import { JourneyReport, JourneyRequest, JourneyVisit, type JourneyInput, MAX_ACTIONS } from '../types/journey.types';
import type { EmulationProfileInput } from '../types/emulation.types';

export function registerJourneyStudio(ctx: MenuControllerContext, inspect:InspectGuest) {
  // Chromium's network stack respects the OS proxy. Keep provider credentials
  // in a separate session from both the shell and the website under test.
  const router = session.fromPartition('journey-openrouter', {cache:false});
  const sendToRouter: ModelTransport = (url, options) => router.fetch(url, options);
  let controller: AbortController | null=null;
  let report: JourneyReport | null=null;
  const localSources=new Map<string,Awaited<ReturnType<typeof serveJourneySource>>>();
  const images=new Map<number,string>();
  let activeSurface:WebContents|null=null;
  let viewer:string|null=null;
  let stopCapture:(()=>void)|null=null;
  let lastImage:string|undefined;
  let recorder:ReturnType<typeof createVisitRecording>|null=null;
  const recordings=new Map<number,VisitRecording>();
  let retainedBytes=0;
  function updateCapture(){
    const needed=activeSurface && (viewer || (recorder && !recorder.recording.clipped));
    if(!needed){stopCapture?.();stopCapture=null;lastImage=undefined;return;}
    if(stopCapture)return;
    stopCapture=watchJourneySurface(activeSurface!,jpeg=>{
      lastImage=jpeg;
      recorder?.frame(jpeg);
      const host=ctx.getWindow();
      if(viewer && host && !host.isDestroyed())host.webContents.send('journey:live-frame',viewer,jpeg);
      else if(recorder?.recording.clipped)updateCapture();
    });
  }
  function surface(current:JourneyReport,target:WebContents|null,record=false){
    recorder?.end();recorder=null;
    stopCapture?.();stopCapture=null;viewer=null;lastImage=undefined;
    activeSurface=target;
    if(target && record){
      const index=current.visits.length-1;
      recorder=createVisitRecording(current.visits[index].startedAt!,bytes=>{
        if(retainedBytes+bytes>24*1024*1024)return false;
        retainedBytes+=bytes;return true;
      });
      recordings.set(index,recorder.recording);
    }
    updateCapture();
    current.liveVisit=target?current.visits.length-1:undefined;
  }
  const publish=()=>{const win=ctx.getWindow();if(win && !win.isDestroyed()) win.webContents.send('journey:report',report);};
  const device=()=>{
    const state=readCurrentState(ctx.deps);
    return {state,preset:getDevicePresetById(state.selectedDeviceId)};
  };
  function append(visit:JourneyVisit,action:string,title:string,path:string,image:string,reason='',observed?:PageChoices){
    const id=images.size;
    images.set(id,image);
    visit.frames.push({id,path,title,action,reason,elapsedMs:visit.startedAt===undefined?undefined:Math.max(0,Date.now()-visit.startedAt),observation:observed && {text:observed.text,controls:observed.controls}});publish();
  }
  async function check(req:StageCheckRequest,current:JourneyReport,state:SimulatorState,signal:AbortSignal) {
    for(const address of req.addresses) for(const id of req.devices) for(const browser of req.browsers){
      signal.throwIfAborted();
      const preset=getDevicePresetById(id);
      const visit:JourneyVisit={persona:preset.name+' · '+(browser==='ios-safari'?'Safari':'Chrome'),source:new URL(address).origin+new URL(address).pathname,
        frames:[],startedAt:Date.now(),outcome:'exploring',note:''};
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
        const visit:JourneyVisit={persona:order[i] || 'Identifying visitor',startedAt:Date.now(),inputs:[],frames:[],outcome:'exploring',note:''};
        current.visits.push(visit);
        const page=req.installFirst?null:new JourneyPage(current.origin,profile,signal);
        const stage=req.installFirst?new StageSession(req.address,setup.preset,setup.browser,{...state,orientation:setup.orientation},ctx.deps.envConfig,inspect,signal):null;
        try {
          current.message=(stage?'Installing before visit ':'Opening visit ')+(i+1); publish();
          let interaction:JourneyInteraction;
          if(stage){
            visit.source=[current.origin,setup.preset.name,setup.browser===BrowserShellMode.IOS_SAFARI?'Safari':'Chrome',setup.orientation].join(' · ');
            visit.installation=await stage.install((action,title,url,image)=>append(visit,action,title,new URL(url).pathname,image,action==='Open website'?setup.reason:''));
            interaction=stage.interaction();
          }else{
            await page!.open(req.address);interaction=page!.interaction;
          }
          current.liveDevice=stage?setup.preset.name:profile.preset.name;
          current.orientation=stage?setup.orientation:profile.orientation;
          surface(current,stage?stage.visitorSurface():page!.surface,req.recordScreen);publish();
          let seen=await interaction.observe();
          if(!order.length){
            current.message='Finding target audiences';publish();
            order=drawPersonas(await suggestPersonas(req,seen.page,signal,sendToRouter,seen.image),req.iterations);
          }
          visit.persona=order[i];
          const firstPage=visit.frames.length;
          let action='Arrived', reason='';
          let input:JourneyInput|undefined;
          for(let step=0;step<=MAX_ACTIONS;step++) {
            signal.throwIfAborted();
            current.message='Visiting as '+visit.persona;
            if(input)input.to=images.size;
            append(visit,action,seen.page.title,seen.page.path,seen.image,reason,seen.page);
            if(step===MAX_ACTIONS) {
              visit.outcome='limit';visit.note='Reached the action limit.';break;
            }
            const history=visit.frames.slice(firstPage).map(f=>({path:f.path,action:f.action,text:f.observation?.text,controls:f.observation?.controls}));
            const previous=history.at(-2);
            const unchangedAfterWait=input?.kind==='wait' && previous?.path===seen.page.path &&
              previous.text===seen.page.text && JSON.stringify(previous.controls)===JSON.stringify(seen.page.controls);
            const choices=unchangedAfterWait?{...seen.page,loading:false}:seen.page;
            const decision=await chooseAction(req,visit.persona,choices,history,signal,sendToRouter,seen.image);
            signal.throwIfAborted();
            if(decision.action==='finish'||decision.action==='blocked') {
              const onlyControl=!!decision.evidence && seen.page.controls.includes(decision.evidence);
              visit.outcome=decision.action==='blocked'?'blocked':decision.evidence && !onlyControl?'finished':'unconfirmed';
              visit.quote=decision.evidence;
              visit.note='Model statement · '+decision.reason+(decision.evidence?' “'+decision.evidence+'”':'')+
                (onlyControl?' The quote matches a visible control label.':'');
              break;
            }
            action=decision.action==='tap' ? seen.page.controls[decision.target] : decision.action==='scroll' ? 'Scroll down' : 'Wait for content';
            reason=decision.reason;
            try {
              if(!await interaction.act(decision.action,decision.target,kind=>{
                input={from:visit.frames[visit.frames.length-1].id,elapsedMs:Math.max(0,Date.now()-visit.startedAt!),kind,label:action};
                visit.inputs!.push(input);publish();
              })) {
                visit.outcome='blocked';visit.note=decision.action==='scroll'?'There was no more content to scroll.':'The chosen control changed before the tap.';break;
              }
              seen=await interaction.observe();
            } catch(error) {
              signal.throwIfAborted();
              visit.outcome='blocked';visit.note=error instanceof Error?error.message:'The next screen was unavailable.';break;
            }
          }
          publish();
        } finally { surface(current,null);page?.close();stage?.close(); }
      }
  }
  async function execute(current:JourneyReport,signal:AbortSignal,work:()=>Promise<void>){
    try{
      await work();
      signal.throwIfAborted();
      current.status='completed';current.message=current.kind==='install'?'Checks ended':'Visits ended';
    } catch(error) {
      current.status=signal.aborted?'stopped':'error';
      current.message=signal.aborted?'Run stopped':error instanceof Error?error.message:'Run failed';
      const last=current.visits.at(-1);
      if(last?.outcome==='exploring'){last.outcome=signal.aborted?'stopped':'error';last.note=current.message;}
    } finally {controller=null; publish();}
  }
  function handle(channel:string, fn:(...args:unknown[])=>unknown) {
    ipcMain.handle('journey:'+channel,(e,...args)=>{
      const studio=ctx.getWindow();
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
    const current:JourneyReport={id:randomUUID(),kind:'audience',origin:new URL(req.address).origin,goal:req.goal,model:(req.localEndpoint?'Local · ':'OpenRouter · ')+req.model,iterations:req.iterations,device:preset.name,orientation:state.orientation,
      status:'running',message:'Opening the start page',visits:[]};
    launch(current,signal=>run(req,current,profile,state,signal));
  });
  handle('source',async kind=>{
    const owner=ctx.getWindow();
    if(!owner || (kind!=='file' && kind!=='folder'))throw Error('Choose a local source.');
    const selection=await dialog.showOpenDialog(owner,{properties:[kind==='folder'?'openDirectory':'openFile']});
    if(selection.canceled || ctx.getWindow()!==owner || !selection.filePaths[0])return null;
    const filename=selection.filePaths[0];
    const previous=localSources.get(filename);
    if(previous)return previous.url;
    if(localSources.size>=12)throw Error('Close the studio to clear the current local sources.');
    const source=await serveJourneySource(filename,kind==='folder');
    if(ctx.getWindow()!==owner){source.close();return null;}
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
    recordings.clear();retainedBytes=0;images.clear();report=current;controller=new AbortController();
    const signal=controller.signal;publish();void execute(current,signal,()=>work(signal));
  }
  handle('watch',(id,index,token)=>{
    const host=ctx.getWindow();
    if(!host || !activeSurface || activeSurface.isDestroyed() || !report || id!==report.id ||
       index!==report.liveVisit || typeof token!=='string' || token.length>80)return false;
    viewer=token;updateCapture();
    if(lastImage)host.webContents.send('journey:live-frame',token,lastImage);
    return true;
  });
  handle('unwatch',token=>{if(token===viewer){viewer=null;updateCapture();}});
  handle('stop',()=>controller?.abort());
  handle('image',(runId,id)=>runId===report?.id && typeof id==='number' ? images.get(id) ?? null : null);
  handle('save',async()=>{
    const studio=ctx.getWindow();
    if (!studio || !report || controller) return false;
    const html=reportHtml(report,images,recordings);
    const result=await dialog.showSaveDialog(studio,{defaultPath:'audience-journeys.html',filters:[{name:'HTML report',extensions:['html']}]});
    if(result.canceled || !result.filePath) return false;
    await writeFile(result.filePath,html,'utf8');return true;
  });

  app.once('before-quit', () => {
    controller?.abort();
    for (const source of localSources.values()) source.close();
    localSources.clear();
  });
}
