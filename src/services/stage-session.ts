import { BrowserWindow, session, webContents, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DEVICE_PRESETS } from '../config/device-presets.config';
import type { SimulatorEnvConfig } from '../config/env.config';
import { BrowserShellMode, DuoDisplayMode, type SimulatorState } from '../types/simulator.types';
import type { DevicePreset } from '../types/device.types';
import type { PageInspectionReport } from '../types/ipc-coordinator.types';
import { applyEmulationToTarget, readGuestViewportSize, resizeGuestViewport } from './emulation';
import { inspectGuestPage } from './inspect-guest';
import { deadline, JourneyInteraction, limitJourneySession } from './journey-page';
import { installNavigationGuards, isGuestOfShell, isTrustedShellSender } from './security';
import { startGuestMirror, stopGuestMirror, clampMirrorFps } from './guest-mirror';
import { projectGuestPoint } from '../utils/guest-point.util';
import { computeViewportMetrics } from '../utils/viewport-math.util';

export type StageFrame=(action:string,title:string,url:string,image:string)=>void;

export class StageSession {
  private readonly win:BrowserWindow;
  private readonly origin:string;
  private state:SimulatorState;
  private guest?:WebContents;
  private failure='';
  private httpStatus=0;
  private readyDocuments=0;
  private readyNavigation='';
  private readonly stop=()=>this.close();
  private readonly guestSession;
  private readonly shellSession;
  private inspection?:PageInspectionReport;

  constructor(private readonly address:string, private readonly preset:DevicePreset, browser:BrowserShellMode,
    initial:SimulatorState, private readonly env:SimulatorEnvConfig, private readonly signal:AbortSignal) {
    signal.throwIfAborted();
    this.origin=new URL(address).origin;
    const id=randomUUID(), guestName='stage-content-'+id;
    this.guestSession=session.fromPartition(guestName,{cache:false});
    this.shellSession=session.fromPartition('stage-shell-'+id,{cache:false});
    limitJourneySession(this.guestSession,this.origin,()=>{this.failure='The page redirected outside the selected origin.';});
    this.guestSession.webRequest.onResponseStarted((r)=>{
      if(r.resourceType==='mainFrame' && /^https?:/.test(r.url)) {
        this.httpStatus=r.statusCode;
        if(r.statusCode>=400) this.failure='The page returned HTTP '+r.statusCode+'.';
      }
    });
    this.state={...initial,currentUrl:address,secondaryUrl:address,selectedDeviceId:preset.id,shellMode:browser,
      hudCollapsed:true,scale:.72,alwaysOnTop:false,duoDisplayMode:DuoDisplayMode.SINGLE_SPAN};
    const size=computeViewportMetrics(preset,this.state.orientation,this.state.scale,true,true);
    this.win=new BrowserWindow({title:'PWA Stage · Installation check',width:size.scaledOuterWidth,height:size.scaledOuterHeight,
      useContentSize:true,show:false,paintWhenInitiallyHidden:true,skipTaskbar:true,frame:false,backgroundColor:'#eceee9',autoHideMenuBar:true,
      webPreferences:{session:this.shellSession,preload:path.join(__dirname,'../stage-preload.js'),
        additionalArguments:['--stage-guest='+guestName],webviewTag:true,sandbox:true,contextIsolation:true,
        nodeIntegration:false,backgroundThrottling:false}});
    const host=this.win.webContents;
    installNavigationGuards(this.win,()=>false);
    host.on('will-attach-webview',(event,prefs,params)=>{
      if(params.partition!==guestName || params.src!=='about:blank'){event.preventDefault();return;}
      prefs.partition=guestName; prefs.disableDialogs=true; prefs.backgroundThrottling=false;
    });
    host.on('did-attach-webview',(_event,guest)=>{
      if(guest.session!==this.guestSession){this.failure='Unexpected browser session.';this.close();return;}
      this.guest=guest;
      let navigation='';
      guest.on('did-start-navigation',event=>{
        if(event.isMainFrame && !event.isSameDocument)navigation=event.url;
      });
      guest.on('dom-ready',()=>{this.readyNavigation=navigation;this.readyDocuments++;});
      guest.setWindowOpenHandler(()=>({action:'deny'}));
      guest.on('did-fail-load',(_e,code,description,_url,main)=>{
        if(main && code!==-3) this.failure='The page could not load ('+description+').';
      });
    });
    const shellMethod=(channel:string,fn:(...args:any[])=>unknown)=>{
      host.ipc.handle('stage:'+channel,(e,...args)=>{
        if(!isTrustedShellSender(e,this.win) || e.senderFrame!==host.mainFrame) throw Error('Stage window required.');
        return fn(...args);
      });
    };
    const ownGuest=(id:number)=>{
      const guest=webContents.fromId(id);
      if(!guest || !isGuestOfShell(guest,this.win) || guest.session!==this.guestSession) throw Error('Stage guest required.');
      return guest;
    };
    shellMethod('initial',()=>({ok:true,value:{state:this.state,presets:DEVICE_PRESETS,envConfig:env}}));
    shellMethod('state',(next:SimulatorState)=>{
      if(URL.parse(next.currentUrl)?.origin!==this.origin || !Object.values(BrowserShellMode).includes(next.shellMode))
        throw Error('Unexpected launch destination.');
      this.state={...this.state,currentUrl:next.currentUrl,shellMode:next.shellMode,pwaStatusBarStyle:next.pwaStatusBarStyle};
      return {ok:true,value:this.state};
    });
    shellMethod('emulate',(payload)=>applyEmulationToTarget(ownGuest(payload.webContentsId),{
      ...this.profile(),shellMode:payload.state.shellMode,viewportSize:readGuestViewportSize(payload.viewportSize)
    }));
    shellMethod('resize',(id,size)=>{
      const parsed=readGuestViewportSize(size);
      if(parsed)return resizeGuestViewport(ownGuest(id),parsed);
    });
    shellMethod('mirror',(id,on,fps)=>{
      const guest=ownGuest(id);
      if(on===true)startGuestMirror(guest,frame=>{if(!host.isDestroyed())host.send('stage:frame',frame);},clampMirrorFps(fps));
      else stopGuestMirror(guest.id);
    });
    shellMethod('inspect',async id=>{
      const result=await inspectGuestPage(ownGuest(id));
      if(result.ok && result.value) this.inspection=result.value;
      return result;
    });
    this.win.on('closed',()=>{if(!this.failure)this.failure='The check window was closed.';});
    signal.addEventListener('abort',this.stop,{once:true});
  }

  visitorSurface(){
    if(!this.guest)throw Error('The installed app is not open.');
    return this.guest;
  }

  private profile(){
    return {preset:this.preset,orientation:this.state.orientation,shellMode:this.state.shellMode,darkMode:this.state.darkMode,
      previewLanguage: this.state.previewLanguage, previewTimeZone: this.state.previewTimeZone,
      safariIosVersion:this.env.safariIosVersion,chromeIosVersion:this.env.chromeIosVersion};
  }
  private async until<T>(read:()=>Promise<T>|T,label:string,timeout=22000):Promise<NonNullable<T>> {
    const end=Date.now()+timeout;
    while(Date.now()<end){
      this.signal.throwIfAborted();
      if(this.failure) throw Error(this.failure);
      const value=await deadline(Promise.resolve(read()),8000);
      if(value)return value as NonNullable<T>;
      await delay(100,undefined,{signal:this.signal});
    }
    throw Error('Timed out waiting for '+label+'.');
  }
  private ui(code:string){return this.win.webContents.executeJavaScript(code);}
  private async click(selector:string) {
    const expression='document.querySelector('+JSON.stringify(selector)+')';
    await this.until(()=>this.ui('Boolean('+expression+' && !'+expression+'.disabled)'),selector);
    await this.ui(expression+'.click()');
  }
  private async record(frame:StageFrame,action:string,title:string) {
    // Hidden windows only composite on request. Keep drawing through the
    // sheet transition so the saved image matches the completed shell step.
    for(let i=0;i<4;i++){
      await this.win.webContents.capturePage().catch(()=>null);
      await delay(100,undefined,{signal:this.signal});
    }
    const snap=await this.until(async()=>{
      const image=await this.win.webContents.capturePage().catch(()=>null);
      return image && !image.isEmpty()?image:null;
    },'a painted simulator frame');
    frame(action,title,this.guest?.getURL() || this.address,'data:image/jpeg;base64,'+snap.resize({width:Math.min(560,snap.getSize().width)}).toJPEG(76).toString('base64'));
  }
  async install(frame:StageFrame) {
    const win=this.win, browser=this.state.shellMode;
    if(this.env.devServerUrl) await win.loadURL(this.env.devServerUrl);
    else await win.loadFile(path.join(__dirname,'../../dist/index.html'));
    await this.until(()=>this.guest && URL.parse(this.guest.getURL())?.origin===this.origin &&
      this.inspection?.inspection.url===this.guest.getURL(),'website details');
    const page=this.inspection!;
    await this.record(frame,'Open website',page.inspection.title);
    if(browser===BrowserShellMode.IOS_SAFARI)await this.click('[aria-label="More"]');
    await this.click('button[aria-label="Share"]');
    await this.until(()=>this.ui('!!document.querySelector(".ios-share-action")'),'the share sheet');
    await this.record(frame,'Share',page.identity.name);
    await this.click('.ios-share-action');
    await this.until(()=>this.ui('!!document.querySelector(".ios-card-primary:not(:disabled)")'),'the installation sheet');
    const launch=await this.ui('document.querySelector(".ios-card-host").textContent') as string;
    if(URL.parse(launch)?.origin!==this.origin) throw Error('The app launch address is outside the selected origin.');
    const name=await this.ui('document.querySelector(".ios-card-fields input").value') as string;
    await this.record(frame,'Add to Home Screen',name);
    await this.click('.ios-card-primary');
    const icon='.home-screen-home .home-grid [data-launch-url]';
    const findInstalled='Array.from(document.querySelectorAll('+JSON.stringify(icon)+')).find(el=>el.dataset.launchUrl==='+JSON.stringify(launch)+')';
    await this.until(()=>this.ui('Boolean('+findInstalled+')'),'the installed Home Screen icon');
    await this.record(frame,'Find installed icon',name);
    const beforeLaunch=this.readyDocuments;
    await this.ui(findInstalled+'.click()');
    await this.until(async()=>{
      const guest=this.guest;
      if(!guest || this.readyDocuments<=beforeLaunch || (this.readyNavigation!==launch && guest.getURL()!==launch) ||
         this.state.shellMode!==BrowserShellMode.PWA_STANDALONE ||
         this.httpStatus<200 || this.httpStatus>=400 || URL.parse(guest.getURL())?.origin!==this.origin) return false;
      if(!await this.ui('!!document.querySelector(".app-surface-app") && !document.querySelector(".ios-address-form")'))return false;
      const result=await deadline(guest.debugger.sendCommand('Runtime.evaluate',{
        expression:'navigator.standalone === true && matchMedia("(display-mode: standalone)").matches',returnByValue:true
      }),5000);
      return result.result?.value===true;
    },'the installed app to reopen in standalone mode',60000);
    await this.record(frame,'Reopen from Home Screen',name);
    const actual=new URL(this.guest!.getURL());
    return {name,path:actual.pathname,manifest:!!page.inspection.manifest, manifestError:page.inspection.manifestError || undefined, checks:page.checks};
  }
  interaction(){
    if(!this.guest)throw Error('The installed app is not open.');
    return new JourneyInteraction(this.guest,this.origin,this.profile(),this.signal,()=>!!this.failure,(u,v)=>{
      if(!Number.isFinite(u) || !Number.isFinite(v))throw Error('The control is outside the viewport.');
      return this.ui('('+projectGuestPoint.toString()+')(document.querySelector("webview"),'+u+','+v+')');
    });
  }
  close(){
    this.signal.removeEventListener('abort',this.stop);
    if(!this.win.isDestroyed())this.win.destroy();
    for(const partition of [this.guestSession,this.shellSession]){
      void partition.clearStorageData().catch(()=>{});
      void partition.closeAllConnections().catch(()=>{});
    }
  }
}
