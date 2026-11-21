import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, House, RotateCw } from 'lucide-react';
import { appInitial, limitAppName } from '../../utils/app-name.util';
import { chooseTouchIcon } from '../../utils/home-icon.util';
import { catalogIcon, matchesCatalogApp, webAppCatalog } from '../../config/web-app-catalog';
import type { InstalledWebApp, PageInspection } from '../../types/pwa.types';
import type { ScreenContextValue } from './ScreenLayers';

function ViewportReadings({inspection}: {inspection: PageInspection}) {
  const { viewport, environment } = inspection;
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
    {environment && <><h3>Language and region</h3><div className="home-tool-group viewport-readings"><dl>
      <dt>Browser language</dt><dd>{environment.language || 'Unavailable'}</dd>
      <dt>Formatting locale</dt><dd>{environment.locale || 'Unavailable'}</dd>
      <dt>Time zone</dt><dd>{environment.timeZone || 'Unavailable'}</dd>
      <dt>Document language</dt><dd>{environment.documentLanguage || 'Unspecified'}</dd>
      <dt>Text direction</dt><dd>{environment.direction || 'Unavailable'}</dd>
    </dl></div></>}
  </>;
}

function AppBadge({app,dpr}: {app:InstalledWebApp; dpr:number}) {
  const url = chooseTouchIcon(app.touchIcons,32*dpr) ?? app.iconUrl;
  const [failed,setFailed] = useState<string | null>(null);
  return <span className="installed-app-badge" aria-hidden="true">
    {url && url !== failed ? <img src={url} alt="" onError={()=>setFailed(url)}/> : appInitial(app.name)}
  </span>;
}

function AppDetails({app, screen, back}: {app: InstalledWebApp; screen: ScreenContextValue; back: () => void}) {
  const [name,setName] = useState(app.name);
  const [standalone,setStandalone] = useState(app.opensAsWebApp);
  const [browser,setBrowser] = useState<'safari' | 'chrome'>(app.browser ?? 'safari');
  const [confirm,setConfirm] = useState(false);
  const dirty = name.trim() !== app.name || standalone !== app.opensAsWebApp || browser !== (app.browser ?? 'safari');
  return <>
    <div className="app-settings-title"><AppBadge app={app} dpr={screen.iconDpr}/><h2 dir="auto">{app.name}</h2></div>
    <div className="home-tool-group">
      <label>Name<input value={name} dir="auto" onChange={e=>setName(limitAppName(e.target.value,80))}/></label>
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

function WebApps({screen}: {screen: ScreenContextValue}) {
  const rows = webAppCatalog.map(listing => ({listing, app: screen.installedApps.find(app => matchesCatalogApp(listing, app))}));
  const available = rows.filter(row => !row.app).map(row => row.listing);
  return <>
    <p className="catalog-intro">Add websites to your Home Screen and open them as apps.</p>
    <div className="catalog-heading">
      <h3>Popular apps</h3>
      {available.length > 0 && <button onClick={() => screen.installCatalogApps(available)}>Add all</button>}
    </div>
    <ul className="catalog-list">{rows.map(({listing, app}) =>
      <li key={listing.id}>
        <img src={catalogIcon(listing)} alt="" width={44} height={44}/>
        <span className="catalog-name">{listing.name}<small>{new URL(listing.launchUrl).hostname.replace(/^www\./, '')}</small></span>
        <button aria-label={(app ? 'Open ' : 'Add ') + listing.name}
          onClick={() => app ? screen.launchApp(app, screen.launchOrigin) : screen.installCatalogApps([listing])}>
          {app ? 'Open' : 'Add'}
        </button>
      </li>)}</ul>
  </>;
}

export function HomeTools({screen}: {screen: ScreenContextValue}) {
  const kind=screen.sheet.kind;
  const [selected,setSelected]=useState<string | null>(null);
  const app=screen.installedApps.find(item=>item.id===selected);
  const title=kind==='device-settings'?'Settings':kind==='web-apps'?'Web Apps':kind==='manifest'?'Manifest':kind==='viewport'?'Viewport':'PWA Checks';
  const report=screen.report;
  const header=useRef<HTMLButtonElement>(null);
  const {openSheet} = screen;
  useEffect(()=>{
    header.current?.focus({preventScroll:true});
    const onKey=(event:KeyboardEvent)=>{
      if(!event.isComposing && event.key==='Escape'){event.preventDefault(); if(selected)setSelected(null);else openSheet('none');}
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
      {kind!=='device-settings' && kind!=='web-apps' && <button disabled={screen.inspecting} onClick={screen.reinspect} aria-label="Refresh inspection"><RotateCw size={16}/></button>}
    </header>
    <div className="home-tool-scroll" key={app?.id ?? kind}>
      {app ? <AppDetails app={app} screen={screen} back={()=>setSelected(null)}/> : <>
        <h2>{title}</h2>
        {kind==='web-apps' ? <WebApps screen={screen}/> : kind==='device-settings' ? <>
          <h3>Appearance</h3>
          <div className="home-tool-group">
            <label>Dark appearance<input type="checkbox" checked={screen.darkMode} onChange={e=>screen.setAppearance(e.target.checked)}/></label>
            <label>Large Home Screen icons<input type="checkbox" checked={screen.largeIcons} onChange={e=>screen.setLargeIcons(e.target.checked)}/></label>
          </div>
          <h3>Installed web apps</h3>
          <div className="home-tool-group catalog-shortcut"><button onClick={()=>screen.openSheet('web-apps')}>Browse web apps<ChevronRight size={16}/></button></div>
          <div className="home-tool-group">{screen.installedApps.length ? screen.installedApps.map(item=>
            <button className="home-tool-app" key={item.id} onClick={()=>setSelected(item.id)}>
              <AppBadge app={item} dpr={screen.iconDpr}/><span className="installed-app-name"><bdi>{item.name}</bdi><small>{URL.parse(item.launchUrl)?.hostname ?? item.launchUrl}</small></span><ChevronRight size={16}/>
            </button>) : <p>Add a website from the browser’s share menu to manage it here.</p>}</div>
        </> : <>
          <p className="home-tool-value">{screen.currentUrl}</p>
          {kind==='viewport' && screen.inspecting ? <p role="status">Measuring this page…</p> :
            !inspection || !report ? <p role="status">{screen.inspecting?'Reading website details…':'Open a website in Safari or Chrome to inspect it.'}</p> :
            kind==='viewport' ? <ViewportReadings inspection={inspection}/> : kind==='manifest' ? <>
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
