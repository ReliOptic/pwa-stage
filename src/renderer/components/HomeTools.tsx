import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, House, RotateCw } from 'lucide-react';
import { chooseTouchIcon } from '../../utils/home-icon.util';
import type { InstalledWebApp, PageViewport } from '../../types/pwa.types';
import type { ScreenContextValue } from './ScreenLayers';

function ViewportReadings({viewport}: {viewport: PageViewport | null}) {
  if (!viewport) return <p role="status">Viewport measurements are unavailable for this page.</p>;
  const size = (w: number, h: number) => Math.round(w * 10) / 10 + ' × ' + Math.round(h * 10) / 10;
  return <>
    <h3>Page measurements</h3>
    <div className="home-tool-group viewport-readings"><dl>
      <dt>Layout viewport</dt><dd>{size(viewport.layoutWidth,viewport.layoutHeight)} CSS px</dd>
      <dt>Visual viewport</dt><dd>{size(viewport.visualWidth,viewport.visualHeight)} CSS px</dd>
      <dt>Emulated screen</dt><dd>{size(viewport.screenWidth,viewport.screenHeight)} CSS px</dd>
      <dt>Device pixel ratio</dt><dd>{viewport.dpr}×</dd>
      <dt>Visual viewport scale</dt><dd>{Math.round(viewport.scale*100)}%</dd>
    </dl></div>
  </>;
}

function AppBadge({app,dpr}: {app:InstalledWebApp; dpr:number}) {
  const url = chooseTouchIcon(app.touchIcons,32*dpr) ?? app.iconUrl;
  const [failed,setFailed] = useState<string | null>(null);
  return <span className="installed-app-badge" aria-hidden="true">
    {url && url !== failed ? <img src={url} alt="" onError={()=>setFailed(url)}/> : app.name.charAt(0).toUpperCase()}
  </span>;
}

function AppDetails({app, screen, back}: {app: InstalledWebApp; screen: ScreenContextValue; back: () => void}) {
  const [name,setName] = useState(app.name);
  const [standalone,setStandalone] = useState(app.opensAsWebApp);
  const [browser,setBrowser] = useState<'safari' | 'chrome'>(app.browser ?? 'safari');
  const [confirm,setConfirm] = useState(false);
  const dirty = name.trim() !== app.name || standalone !== app.opensAsWebApp || browser !== (app.browser ?? 'safari');
  return <>
    <div className="app-settings-title"><AppBadge app={app} dpr={screen.iconDpr}/><h2>{app.name}</h2></div>
    <div className="home-tool-group">
      <label>Name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
      <label>Open as Web App<input type="checkbox" checked={standalone} onChange={e=>setStandalone(e.target.checked)}/></label>
      {!standalone && <label>Open in<select value={browser} onChange={e=>setBrowser(e.target.value === 'chrome' ? 'chrome' : 'safari')}>
        <option value="safari">Safari</option><option value="chrome">Chrome</option>
      </select></label>}
      <button disabled={!name.trim() || !dirty} onClick={()=>screen.updateApp(app.id,name,standalone,browser)}>Save changes</button>
    </div>
    <h3>Launch address</h3><p className="home-tool-value">{app.launchUrl}</p>
    <div className="home-tool-group">
      <button disabled={dirty} onClick={()=>screen.launchApp(app,screen.launchOrigin)}>Open app</button>
      {confirm ? <>
        <p>Remove {app.name} from this simulator’s Home Screen?</p>
        <button className="home-tool-danger" onClick={()=>{screen.removeApp(app.id);back();}}>Confirm removal</button>
        <button onClick={()=>setConfirm(false)}>Cancel</button>
      </> : <button className="home-tool-danger" onClick={()=>setConfirm(true)}>Remove from Home Screen</button>}
    </div>
  </>;
}

export function HomeTools({screen}: {screen: ScreenContextValue}) {
  const kind=screen.sheet.kind;
  const [selected,setSelected]=useState<string | null>(null);
  const app=screen.installedApps.find(item=>item.id===selected);
  const title=kind==='device-settings'?'Settings':kind==='manifest'?'Manifest':kind==='viewport'?'Viewport':'PWA Checks';
  const report=screen.report;
  const header=useRef<HTMLButtonElement>(null);
  const {openSheet} = screen;
  useEffect(()=>{
    header.current?.focus({preventScroll:true});
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault(); if(selected)setSelected(null);else openSheet('none');}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[selected,kind,openSheet]); // A tool opens within the device while the guest stays mounted.
  const inspection=report?.inspection;
  return <section className={'home-utility'+(screen.darkMode?' home-utility-dark':'')} role="dialog" aria-label={title}>
    <header>
      <button ref={header} aria-label={app?'Back to Settings':'Back to Home Screen'} onClick={()=>app?setSelected(null):screen.openSheet('none')}>
        {app?<ChevronLeft size={19}/>:<House size={16}/>} {app?'Settings':'Home'}
      </button>
      {kind!=='device-settings' && <button disabled={screen.inspecting} onClick={screen.reinspect} aria-label="Refresh inspection"><RotateCw size={16}/></button>}
    </header>
    <div className="home-tool-scroll" key={app?.id ?? kind}>
      {app ? <AppDetails app={app} screen={screen} back={()=>setSelected(null)}/> : <>
        <h2>{title}</h2>
        {kind==='device-settings' ? <>
          <h3>Appearance</h3>
          <div className="home-tool-group">
            <label>Dark appearance<input type="checkbox" checked={screen.darkMode} onChange={e=>screen.setAppearance(e.target.checked)}/></label>
            <label>Large Home Screen icons<input type="checkbox" checked={screen.largeIcons} onChange={e=>screen.setLargeIcons(e.target.checked)}/></label>
          </div>
          <h3>Installed web apps</h3>
          <div className="home-tool-group">{screen.installedApps.length ? screen.installedApps.map(item=>
            <button className="home-tool-app" key={item.id} onClick={()=>setSelected(item.id)}>
              <AppBadge app={item} dpr={screen.iconDpr}/><span className="installed-app-name">{item.name}<small>{URL.parse(item.launchUrl)?.hostname ?? item.launchUrl}</small></span><ChevronRight size={16}/>
            </button>) : <p>Add a website from the browser’s share menu to manage it here.</p>}</div>
        </> : <>
          <p className="home-tool-value">{screen.currentUrl}</p>
          {kind==='viewport' && screen.inspecting ? <p role="status">Measuring this page…</p> :
            !inspection || !report ? <p role="status">{screen.inspecting?'Reading website details…':'Open a website in Safari or Chrome to inspect it.'}</p> :
            kind==='viewport' ? <ViewportReadings viewport={inspection.viewport}/> : kind==='manifest' ? <>
              <h3>Web app manifest</h3>
              <div className="home-tool-group"><dl>
                <dt>Manifest URL</dt><dd>{inspection.manifestHref || 'No manifest linked'}</dd>
                <dt>Resolved launch URL</dt><dd>{report.identity.launchUrl}</dd>
                <dt>Service worker</dt><dd>{inspection.serviceWorker}</dd>
              </dl></div>
              {inspection.manifestError && <p>{inspection.manifestError}</p>}
              {inspection.manifest && <><h3>Manifest fields</h3><pre>{JSON.stringify(inspection.manifest,null,2)}</pre></>}
            </> : <>
              <h3>Installation &amp; display</h3>
              <div className="home-tool-group">{report.checks.map(check=><div className="home-tool-check" key={check.id}>
                <small data-level={check.level}>{check.level}</small><strong>{check.title}</strong><p>{check.detail}</p>
              </div>)}</div>
            </>}
        </>}
      </>}
    </div>
  </section>;
}
