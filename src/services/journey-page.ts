import { BrowserWindow, nativeImage, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { applyEmulationToTarget, buildEmulationProfile } from './emulation';
import type { EmulationProfileInput } from '../types/emulation.types';
import type { PageChoices } from './journey-planner';

// Runs in an isolated JS world. Only this fixed observer/action implementation
// enters the guest; model output can select an existing index or a scroll.
function interact(origin: string, action: 'observe' | 'tap' | 'scroll', index: number) {
  if (location.origin !== origin) throw Error('The page left the chosen origin.');
  type Control = {el: HTMLElement; name: string; href: string | null};
  const state = window as Window & {journeyControls?: Control[]};
  // Map a visible point through same-origin embedded documents into the mobile
  // viewport. Every ancestor must actually expose this pixel to a finger.
  const tapPoint = (el: HTMLElement) => {
    let doc = el.ownerDocument;
    let win = doc.defaultView;
    if (!win) return null;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom <= 0 || box.right <= 0 || box.left >= win.innerWidth || box.top >= win.innerHeight) return null;
    let x = (Math.max(0,box.left) + Math.min(win.innerWidth,box.right))/2;
    let y = (Math.max(0,box.top) + Math.min(win.innerHeight,box.bottom))/2;
    if (!el.contains(doc.elementFromPoint(x,y))) return null;
    while (doc !== document) {
      const frame = win.frameElement as HTMLIFrameElement | null;
      if (!frame || !frame.offsetWidth || !frame.offsetHeight) return null;
      const rect = frame.getBoundingClientRect();
      x = rect.left + (x + frame.clientLeft) * rect.width / frame.offsetWidth;
      y = rect.top + (y + frame.clientTop) * rect.height / frame.offsetHeight;
      doc = frame.ownerDocument;
      if (doc.elementFromPoint(x,y) !== frame || !doc.defaultView) return null;
      win = doc.defaultView;
    }
    return {x,y};
  };
  const label = (el: HTMLElement) => (el.getAttribute('aria-label') || el.innerText || el.title ||
    el.querySelector('img')?.alt || '').trim().replace(/\s+/g,' ').slice(0,120);
  const href = (el: HTMLElement) => el.tagName==='A' && el.hasAttribute('href') ? (el as HTMLAnchorElement).href : null;
  const usable = (el: HTMLElement) => {
    if (el.closest('[inert],[aria-hidden="true"],form,[contenteditable="true"]') ||
        el.matches(':disabled,[aria-disabled="true"],[download]') || !tapPoint(el)) return false;
    const link = href(el);
    if (!link) return !(el.tagName==='BUTTON' && (el as HTMLButtonElement).form);
    const dest = URL.parse(link);
    return dest?.origin === origin && !dest.username && !dest.password && /^https?:$/.test(dest.protocol);
  };
  if (action === 'tap') {
    const ref = state.journeyControls?.[index];
    if (!ref || !ref.el.isConnected || !usable(ref.el) || label(ref.el) !== ref.name || href(ref.el) !== ref.href)
      return false;
    const anchor=ref.el as HTMLAnchorElement;
    if (ref.href && anchor.target && !['_self','_parent','_top'].includes(anchor.target)) {
      location.assign(ref.href);
      return true;
    }
    return tapPoint(ref.el);
  }
  if (action === 'scroll') {
    let el = document.elementFromPoint(innerWidth/2, innerHeight/2) as HTMLElement | null;
    while (el && el !== document.body && el !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight-el.scrollTop > el.clientHeight+2) {
        el.scrollBy({top:el.clientHeight*.78,behavior:'instant'}); return true;
      }
      el=el.parentElement;
    }
    if (!document.scrollingElement || scrollY + innerHeight >= document.scrollingElement.scrollHeight-2) return false;
    scrollBy({top:innerHeight*.78,behavior:'instant'}); return true;
  }
  const controls: Control[] = [];
  const snippets: string[]=[];
  const documents=[document];
  for (let i=0;i<documents.length;i++) {
    const doc=documents[i];
    for (const el of doc.querySelectorAll<HTMLElement>('a,button,[role="button"],[role="tab"],[role="link"],[tabindex="0"],[onclick],summary')) {
      const name=label(el);
      if (name && usable(el)) controls.push({el,name,href:href(el)});
      if (controls.length>=35) break;
    }
    for (const el of doc.querySelectorAll<HTMLElement>('h1,h2,h3,p,legend,main li')) {
      if (snippets.length>=10) break;
      if (tapPoint(el)) snippets.push(el.innerText.trim().slice(0,180));
    }
    if (controls.length>=35) break;
    for (const frame of doc.querySelectorAll('iframe')) {
      if (documents.length>=10) break;
      const child=frame.contentDocument;
      if (child && child.location.origin===origin && tapPoint(frame)) documents.push(child);
    }
  }
  // Some full-screen media PWAs start with a named touch surface and reveal
  // the toolbar on the first tap. Use the same visible hit target as a finger.
  if (!controls.length) {
    const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    const surface = center?.closest<HTMLElement>('[role="group"][aria-label],canvas[aria-label]');
    if (surface && usable(surface)) {
      const box = surface.getBoundingClientRect();
      if (box.width >= innerWidth * .6 && box.height >= innerHeight * .6) {
        controls.push({el:surface, name:label(surface), href:null});
      }
    }
  }
  state.journeyControls=controls;
  return {path:location.pathname + (location.hash.startsWith('#/') ? location.hash.split('?')[0] : ''),
    title:document.title.slice(0,150), text:snippets.join(' ').slice(0,950), controls:controls.map(ref=>ref.name)};
}

export class JourneyPage {
  private readonly win: BrowserWindow;
  private readonly detach: () => void;
  private blockedNavigation = false;
  private closed = false;
  constructor(private readonly origin: string, private readonly profile: EmulationProfileInput, private readonly signal: AbortSignal) {
    signal.throwIfAborted();
    const partition=session.fromPartition('journey-'+randomUUID(),{cache:false});
    const {width,height}=buildEmulationProfile(profile).metrics;
    this.win=new BrowserWindow({width,height,useContentSize:true,show:false,skipTaskbar:true,paintWhenInitiallyHidden:true,
      webPreferences:{session:partition,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
        disableDialogs:true,webSecurity:true,webviewTag:false}});
    const wc=this.win.webContents;
    const allowed=(value:string) => {
      const url=URL.parse(value);
      return url?.origin===origin && /^https?:$/.test(url.protocol) && !url.username && !url.password;
    };
    wc.setWindowOpenHandler(()=>({action:'deny'}));
    wc.on('will-navigate',(event,url)=>{if(!allowed(url)){this.blockedNavigation=true;event.preventDefault();}});
    partition.webRequest.onBeforeRequest((d, reply)=>{
      const outside=d.resourceType==='mainFrame' && d.url!=='about:blank' && !allowed(d.url);
      if (outside) this.blockedNavigation=true;
      reply({cancel:this.closed || outside || !['GET','HEAD','OPTIONS'].includes(d.method) || d.resourceType==='webSocket'});
    });
    partition.setPermissionRequestHandler((_w,_p,done)=>done(false));
    partition.setPermissionCheckHandler(()=>false);
    partition.on('will-download',event=>event.preventDefault());
    const stop=()=>this.close();
    signal.addEventListener('abort',stop,{once:true});
    this.detach=()=>signal.removeEventListener('abort',stop);
  }

  private async deadline<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([work,new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(Error('The test page did not respond in time.')),ms);
      })]);
    } finally { clearTimeout(timer); }
  }
  async open(address:string) {
    const wc=this.win.webContents;
    await this.deadline(wc.loadURL('about:blank'),5000);
    const applied=await this.deadline(applyEmulationToTarget(wc,this.profile),10000);
    if (!applied.ok) throw Error('Mobile emulation could not start.');
    try { await this.deadline(wc.loadURL(address),20000); }
    catch { throw Error(this.blockedNavigation?'The site redirected outside the selected origin. Enter its final address.':'The start page could not be loaded.'); }
    await delay(350,undefined,{signal:this.signal});
  }
  private async execute(action:'observe'|'tap'|'scroll', index=-1) {
    this.signal.throwIfAborted();
    if (this.blockedNavigation) throw Error('The page attempted to leave the selected origin.');
    // webContents.executeJavaScript waits for the whole document tree to finish
    // loading. A streaming iframe can keep that barrier open indefinitely.
    const cdp=this.win.webContents.debugger;
    const evaluation=async () => {
      const {frameTree}=await cdp.sendCommand('Page.getFrameTree');
      const {executionContextId}=await cdp.sendCommand('Page.createIsolatedWorld',{
        frameId:frameTree.frame.id,worldName:'pwa-stage-journey'
      });
      const result=await cdp.sendCommand('Runtime.evaluate',{
        contextId:executionContextId,returnByValue:true,
        expression:'('+interact.toString()+')('+JSON.stringify(this.origin)+','+JSON.stringify(action)+','+index+')'
      });
      if(result.exceptionDetails) throw Error('The current screen changed during observation.');
      return result.result.value;
    };
    return this.deadline(evaluation(),15000);
  }
  async observe(): Promise<{page:PageChoices; image:string}> {
    const page=await this.execute('observe') as PageChoices;
    const snap=await this.deadline(this.win.webContents.capturePage(),6000).catch(async () => {
      this.signal.throwIfAborted();
      // GPU-backed pages can outlive a hidden window's last compositor frame.
      const {data} = await this.deadline(this.win.webContents.debugger.sendCommand('Page.captureScreenshot', {
        format:'jpeg',quality:72,captureBeyondViewport:false
      }),8000);
      return nativeImage.createFromBuffer(Buffer.from(data,'base64'));
    });
    if(snap.isEmpty()) throw Error('The page did not produce a frame.');
    const width=Math.min(460,snap.getSize().width);
    return {page,image:'data:image/jpeg;base64,'+snap.resize({width}).toJPEG(72).toString('base64')};
  }
  async act(action:'tap'|'scroll'|'wait', index:number) {
    if (action==='wait') {
      await delay(1100,undefined,{signal:this.signal});
      return true;
    }
    const point=await this.execute(action,index);
    if (!point) return false;
    if (action==='tap' && typeof point==='object') {
      const cdp=this.win.webContents.debugger;
      await cdp.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
      await cdp.sendCommand('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await delay(380,undefined,{signal:this.signal});
    const end=Date.now()+10000;
    while(this.win.webContents.isLoadingMainFrame() && Date.now()<end) await delay(100,undefined,{signal:this.signal});
    if(this.win.webContents.isLoadingMainFrame()) throw Error('The next screen did not finish loading.');
    return true;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    if (!this.win.isDestroyed()) {
      const partition = this.win.webContents.session;
      this.win.destroy();
      void partition.clearStorageData().catch(() => {});
      void partition.closeAllConnections().catch(() => {});
    }
  }
}
