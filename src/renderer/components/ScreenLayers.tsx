import { appInitial, limitAppName } from '../../utils/app-name.util';
import { chooseTouchIcon } from '../../utils/home-icon.util';
import type { WebAppListing } from '../../config/web-app-catalog';
import { useHomePaging } from '../useHomePaging';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PanelsTopLeft,
  Scan,
  FileJson2,
  LayoutGrid,
  Info,
  SquarePlus,
  X,
  XCircle
} from 'lucide-react';
import { HomeTools } from './HomeTools';
import { BrowserTools } from './BrowserTools';
import { BrowserShellMode } from '../../types/simulator.types';
import { InstalledWebApp, PwaCheck } from '../../types/pwa.types';
import { resolveHomeLayout, resolveHomePage, homeIconClip } from '../../utils/home-layout.util';
import { PageInspectionReport } from '../../types/ipc-coordinator.types';

// ---------------------------------------------------------------------------
// Screen state shared by the flat frame and the 3D Duo stage
// ---------------------------------------------------------------------------

export type ScreenPhase = 'app' | 'closing' | 'home' | 'launching';

export interface LaunchOrigin {
  /** Icon centre in screen-relative fractions (0..1). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function SettingsGlyph() {
  return <img src="./assets/settings-gear.svg" alt="" draggable={false}/>;
}

const homeTools = [
  {kind:'device-settings', name:'Settings', icon:SettingsGlyph, background:'linear-gradient(150deg,#aeb2b9,#777e88 52%,#5e626b)'},
  {kind:'manifest', name:'Manifest', icon:FileJson2, background:'linear-gradient(150deg,#3c8283,#204a55)'},
  {kind:'app-checks', name:'PWA Checks', icon:PanelsTopLeft, background:'linear-gradient(145deg,#7167a4,#403658)'},
  {kind:'viewport', name:'Viewport', icon:Scan, background:'linear-gradient(150deg,#317cb2,#204464)'},
  {kind:'web-apps', name:'Web Apps', icon:LayoutGrid, background:'linear-gradient(145deg,#2489d9,#2352ac)'}
] as const;
export function isHomeTool(kind: ScreenSheetState['kind']): boolean {
  return homeTools.some(tool => tool.kind === kind);
}

export interface ScreenSheetState {
  readonly kind: 'none' | 'browser-menu' | 'settings' | 'find' | 'bookmarks' | 'history' | 'share' | 'add-to-home' | 'device-settings' | 'manifest' | 'app-checks' | 'viewport' | 'web-apps';
}

export interface PermissionPromptState {
  readonly id: string;
  readonly message: string;
}

export interface HomeNavigation {
  readonly page: number;
  readonly searching: boolean;
  readonly query: string;
}

export interface ScreenContextValue {
  readonly isStartPage: boolean;
  readonly iconDpr: number;
  readonly previewLanguage?: string;
  readonly previewTimeZone?: string;
  readonly browserMode: BrowserShellMode;
  readonly setAppearance: (dark: boolean) => void;
  readonly homePreview: boolean;
  readonly setHomePreview: (show: boolean) => void;
  readonly homeNavigation: HomeNavigation;
  readonly setHomeNavigation: (next: HomeNavigation) => void;
  readonly phase: ScreenPhase;
  readonly launchOrigin: LaunchOrigin;
  readonly finishTransition: (phase: 'closing' | 'launching') => void;
  readonly splash: { readonly background: string; readonly iconUrl: string | null } | null;
  readonly installedApps: readonly InstalledWebApp[];
  readonly report: PageInspectionReport | null;
  readonly sheet: ScreenSheetState;
  readonly permission: PermissionPromptState | null;
  readonly darkMode: boolean;
  readonly goHome: () => void;
  readonly launchApp: (app: InstalledWebApp | 'safari' | 'chrome', origin: LaunchOrigin) => void;
  readonly openSheet: (kind: ScreenSheetState['kind']) => void;
  readonly addToHome: (name: string, opensAsWebApp: boolean) => void;
  readonly installCatalogApps: (listings: readonly WebAppListing[]) => void;
  readonly largeIcons: boolean;
  readonly setLargeIcons: (enabled: boolean) => void;
  readonly updateApp: (id: string, name: string, opensAsWebApp: boolean, browser: 'safari' | 'chrome') => void;
  readonly removeApp: (id: string) => void;
  readonly answerPermission: (granted: boolean) => void;
  readonly openUrl: (url: string) => void;
  readonly currentUrl: string;
  readonly inspecting: boolean;
  readonly reinspect: () => void;
  readonly navigate: (direction: 'back' | 'forward') => void;
  readonly reload: () => void;
}

const noop = (): void => undefined;

export const ScreenContext = createContext<ScreenContextValue>({
  isStartPage: false, iconDpr: 3, browserMode: BrowserShellMode.IOS_SAFARI,
  setAppearance: noop,
  homePreview: false, setHomePreview: noop,
  homeNavigation: { page: 0, searching: false, query: '' },
  setHomeNavigation: noop,
  phase: 'app',
  launchOrigin: { x: 0.5, y: 0.92, width: 0.15, height: 0.075 },
  finishTransition: noop,
  splash: null,
  installedApps: [],
  report: null,
  sheet: { kind: 'none' },
  permission: null,
  darkMode: true,
  goHome: noop,
  launchApp: noop,
  openSheet: noop,
  addToHome: noop,
  installCatalogApps: noop,
  largeIcons:false, setLargeIcons:noop, updateApp:noop,
  removeApp: noop,
  answerPermission: noop,
  currentUrl: '',
  inspecting: false,
  openUrl: noop,
  reinspect: noop,
  navigate: noop,
  reload: noop
});

export function useScreen(): ScreenContextValue {
  return useContext(ScreenContext);
}

// ---------------------------------------------------------------------------
// App surface: wraps the live <webview> and plays launch / close transitions
// ---------------------------------------------------------------------------

export function appMotionStyle(origin: LaunchOrigin): React.CSSProperties {
  return {
    '--icon-left': `${(origin.x - origin.width / 2) * 100}%`,
    '--icon-top': `${(origin.y - origin.height / 2) * 100}%`,
    '--icon-width': origin.width,
    '--icon-height': origin.height
  } as React.CSSProperties;
}

export function AppSurface(props: { readonly children: React.ReactNode; readonly style?: React.CSSProperties }): React.ReactElement {
  const screen = useScreen();
  const hidden = screen.phase === 'home';
  return (
    <div
      className={`app-surface app-surface-${screen.phase}`}
      style={{ ...appMotionStyle(screen.launchOrigin), visibility: hidden ? 'hidden' : 'visible', ...props.style }}
      onAnimationEnd={event => {
        if (event.target !== event.currentTarget || !event.currentTarget.querySelector('webview')) return;
        if (event.animationName === 'sim-app-open') screen.finishTransition('launching');
        if (event.animationName === 'sim-app-close') screen.finishTransition('closing');
      }}
      aria-hidden={hidden}
    >
      {props.children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home Screen
// ---------------------------------------------------------------------------

function originFromEvent(e: React.MouseEvent<HTMLElement>): LaunchOrigin {
  const target = e.currentTarget.getBoundingClientRect();
  const screenEl = e.currentTarget.closest('.home-screen');
  const host = screenEl ? screenEl.getBoundingClientRect() : target;
  return {
    x: (target.left + target.width / 2 - host.left) / Math.max(1, host.width),
    y: (target.top + target.height / 2 - host.top) / Math.max(1, host.height),
    width: target.width / Math.max(1, host.width),
    height: target.height / Math.max(1, host.height)
  };
}

function AppIcon(props: {
  readonly label: string;
  readonly iconUrl?: string | null;
  readonly glyph?: React.ReactNode;
  readonly tone?: string;
  readonly hideLabel?: boolean;
  readonly size?: number;
  readonly onOpen?: (origin: LaunchOrigin) => void;
  readonly onRemove?: () => void;
  readonly launchUrl?:string;
}): React.ReactElement {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [props.iconUrl]);
  const clipPath = useMemo(() => homeIconClip(props.size ?? 60), [props.size]);
  const initial = appInitial(props.label);
  return (
    <div className="home-app">
      <button
        type="button"
        className="home-app-icon"
        data-launch-url={props.launchUrl}
        style={{ background: props.tone, width: props.size, height: props.size, clipPath }}
        onClick={(e): void => props.onOpen?.(originFromEvent(e))}
        onContextMenu={(e): void => {
          if (props.onRemove) {
            e.preventDefault();
            e.stopPropagation();
            props.onRemove();
          }
        }}
        disabled={!props.onOpen}
        title={props.onRemove ? `${props.label} — right-click to remove` : props.label}
        aria-label={props.label}
      >
        {props.iconUrl && !broken ? (
          <img src={props.iconUrl} alt="" draggable={false} onError={(): void => setBroken(true)} />
        ) : props.glyph ? (
          props.glyph
        ) : (
          <span className="home-app-initial">{initial}</span>
        )}
      </button>
      {!props.hideLabel && <span className="home-app-label" dir="auto">{props.label}</span>}
    </div>
  );
}

function BrowserIcon({ browser }: { readonly browser: 'safari' | 'chrome' }): React.ReactElement {
  if (browser === 'chrome') {
    return <span className="home-chrome-wheel" aria-hidden="true"><i /></span>;
  }
  return (
    <svg width="89%" height="89%" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#078deb" />
      <circle cx="32" cy="32" r="26" fill="none" stroke="#ddfbff" strokeWidth="4.5" strokeDasharray=".8 3.28" />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="white" strokeWidth="2" strokeDasharray=".8 13.97" />
      <path d="m51 12-15 24-8-8Z" fill="#ff5348" />
      <path d="M13 52 28 28l8 8Z" fill="white" />
      <path d="m51 12-19 20 4 4Z" fill="#d94141" /><path d="m13 52 19-20 4 4Z" fill="#c2dde8" />
    </svg>
  );
}

export function HomeScreen(props: { readonly mirror?: boolean; readonly width: number; readonly height: number; readonly safeTop?: number; readonly trailingInset?: number }): React.ReactElement | null {
  const screen = useScreen();
  const { page: requestedPage, searching, query } = screen.homeNavigation;
  const updateNavigation = (patch: Partial<HomeNavigation>): void => screen.setHomeNavigation({ ...screen.homeNavigation, ...patch });
  const rail = props.trailingInset ?? 0;
  const layout = resolveHomeLayout(props.width, props.height, rail, props.safeTop, screen.largeIcons);
  const apps = [
    ...screen.installedApps.map(app => ({kind:'site' as const, name:app.name, app})),
    ...homeTools.map(tool => ({kind:'tool' as const, name:tool.name, tool}))
  ].filter(item => item.name.normalize().toLocaleLowerCase().includes(query.trim().normalize().toLocaleLowerCase()));
  const { pages, page } = resolveHomePage(apps.length, layout.capacity, requestedPage);
  const paging = useHomePaging(page, pages, next => updateNavigation({page:next}), !props.mirror && !searching && screen.phase==='home');
  const preview = screen.phase === 'app' && screen.homePreview;
  if (screen.phase === 'app' && !preview) return null;
  const style = {
    '--home-label-width': `${layout.labelWidth}px`, '--home-label-size': `${layout.label}px`,
    '--home-dock-width': `${layout.dockWidth}px`, '--home-dock-gap': `${layout.dockGap}px`,
    '--home-dock-radius': `${layout.dockRadius}px`,
    '--home-columns': layout.columns, '--home-icon': `${layout.icon}px`, '--home-panel': `${layout.panelWidth}px`,
    '--home-left': `${layout.left}px`, '--home-top': `${layout.top}px`,
    '--home-widget': `${layout.widget}px`, '--home-grid-top': `${layout.gridTop}px`,
    '--home-dots-top': `${layout.pageDotsTop}px`, '--home-pitch': `${layout.pitch}px`, '--home-search-top': `${layout.searchTop}px`,
    '--home-dock-height': `${layout.dockHeight}px`, '--home-dock-bottom': `${layout.dockBottom}px`,
    transformOrigin: `${screen.launchOrigin.x * 100}% ${screen.launchOrigin.y * 100}%`
  } as React.CSSProperties;
  const visible = apps.slice(page * layout.capacity, (page + 1) * layout.capacity);
  return (
    <div {...paging} className={`home-screen home-screen-${preview ? 'preview' : screen.phase} ${rail ? 'home-with-rail' : ''} ${layout.landscape ? 'home-landscape' : ''}`} style={style} ref={el => { if (el) el.inert = Boolean(preview || props.mirror || isHomeTool(screen.sheet.kind)); }} aria-hidden={preview || props.mirror || undefined}>
      <div className="home-wallpaper" aria-hidden="true"><i /><i /><i /></div>
      <div className="home-grid" aria-label="Home Screen apps">
         {visible.map(item => item.kind === 'tool'
          ? <AppIcon key={item.tool.kind} label={item.name} size={layout.icon} hideLabel={screen.largeIcons}
              tone={item.tool.background} glyph={<item.tool.icon size="61%" strokeWidth={1.65} aria-hidden="true"/>}
              onOpen={() => screen.openSheet(item.tool.kind)} />
          : <AppIcon key={item.app.id} launchUrl={item.app.launchUrl} label={item.name} iconUrl={chooseTouchIcon(item.app.touchIcons,layout.icon*screen.iconDpr) ?? item.app.iconUrl} size={layout.icon} hideLabel={screen.largeIcons}
              onOpen={origin => screen.launchApp(item.app, origin)} onRemove={() => screen.removeApp(item.app.id)} />)}
      </div>
      {(pages > 1) && <div className="home-page-dots" aria-label="Home Screen pages">{Array.from({length: pages}, (_, i) => <button key={i} aria-label={`Page ${i + 1}`} aria-current={page === i ? 'page' : undefined} onClick={() => updateNavigation({ page: i })} />)}</div>}
      <button className="home-search-pill" aria-label="Search installed apps" onClick={() => updateNavigation({ searching: true })}><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="8" cy="8" r="5" /><path d="m12 12 5 5" /></svg>{!rail && <span>Search</span>}</button>
      {searching && <div className="home-search-field"><input autoFocus={!props.mirror} aria-label="Search installed apps" placeholder="Search installed apps" value={query} onChange={e => updateNavigation({ query: e.target.value, page: 0 })} /><button onClick={() => updateNavigation({ searching: false, query: '' })} aria-label="Close search">×</button></div>}
      <div className="home-dock" aria-label="Dock">
        <AppIcon label="Safari" hideLabel size={layout.dockIcon} tone="#fff" glyph={<BrowserIcon browser="safari" />} onOpen={origin => screen.launchApp('safari', origin)} />
        <AppIcon label="Chrome" hideLabel size={layout.dockIcon} tone="#fff" glyph={<BrowserIcon browser="chrome" />} onOpen={origin => screen.launchApp('chrome', origin)} />
      </div>
    </div>
  );
}

/** Estimated launch placeholder; iOS 27.3 startup-image/colour precedence is unverified. */
export function LaunchSplash(): React.ReactElement | null {
  const screen = useScreen();
  if (screen.phase !== 'launching' || !screen.splash) {
    return null;
  }
  return (
    <div className="launch-splash" style={{ background: screen.splash.background }} aria-hidden="true">
      {screen.splash.iconUrl && <img src={screen.splash.iconUrl} alt="" draggable={false} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheets & alerts
// ---------------------------------------------------------------------------

function ShareSheet(): React.ReactElement {
  const screen = useScreen();
  const identity = screen.report?.identity;
  const host = URL.canParse(screen.currentUrl) ? new URL(screen.currentUrl).host : screen.currentUrl;
  const title = screen.report?.inspection.title || identity?.name || host;
  return (
    <div className="ios-sheet-scrim" onClick={() => screen.openSheet('none')}>
      <section className={`ios-share-sheet ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
        role="dialog" aria-label="Share" onClick={e => e.stopPropagation()}>
        <span className="ios-sheet-handle" aria-hidden="true" />
        <header>
          <div className="home-app-icon ios-share-icon">
            {identity?.iconUrl ? <img src={identity.iconUrl} alt="" /> : appInitial(title)}
          </div>
          <div className="ios-share-title"><strong>{title}</strong><small>{host}</small></div>
          <button type="button" className="ios-share-close" aria-label="Cancel" onClick={() => screen.openSheet('none')}><X size={18} /></button>
        </header>
        <button type="button" className="ios-share-action" onClick={() => screen.openSheet('add-to-home')}>
          Add to Home Screen <SquarePlus size={20} />
        </button>
      </section>
    </div>
  );
}

function AddToHomeSheet(): React.ReactElement | null {
  const screen = useScreen();
  const identity = screen.report?.identity ?? null;
  const [name, setName] = useState<string>(identity?.name ?? '');
  const [asWebApp, setAsWebApp] = useState<boolean>(identity?.opensAsWebApp ?? true);
  useEffect((): void => {
    setName(identity?.name ?? '');
    setAsWebApp(identity?.opensAsWebApp ?? true);
  }, [identity?.name, identity?.opensAsWebApp]);
  if (!identity) {
    return (
      <div className="ios-sheet-scrim" onClick={(): void => screen.openSheet('none')}>
        <div className={`ios-card-sheet ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}>
          <div className="ios-card-nav">
            <button type="button" onClick={() => screen.openSheet('none')}>Cancel</button>
            <strong>Add to Home Screen</strong>
            <button type="button" disabled={screen.inspecting} onClick={e => { e.stopPropagation(); screen.reinspect(); }}>Retry</button>
          </div>
          <p className="ios-card-empty">{screen.inspecting ? 'Reading website details…' : 'Website details are not available yet.'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="ios-sheet-scrim" onClick={(): void => screen.openSheet('none')}>
      <div
        className={`ios-card-sheet ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
        onClick={(e): void => e.stopPropagation()}
        role="dialog"
        aria-label="Add to Home Screen"
      >
        <div className="ios-card-nav">
          <button type="button" className="ios-card-close" aria-label="Cancel"
            onClick={(): void => screen.openSheet('none')}>
            <X size={22} />
          </button>
          <strong>Add to Home Screen</strong>
          <button
            type="button"
            className="ios-card-primary"
            disabled={!name.trim()}
            onClick={(): void => screen.addToHome(name.trim(), asWebApp)}
          >
            Add
          </button>
        </div>
        <div className="ios-card-body">
          <div className="ios-card-row">
            <div className="home-app-icon ios-card-icon">
              {identity.iconUrl ? (
                <img src={identity.iconUrl} alt="" draggable={false} />
              ) : (
                <span className="home-app-initial">{appInitial(name)}</span>
              )}
            </div>
            <div className="ios-card-fields">
              <input
                value={name}
                dir="auto"
                onChange={(e): void => setName(limitAppName(e.target.value, 40))}
                aria-label="Home Screen name"
              />
              <span className="ios-card-host">{identity.launchUrl}</span>
            </div>
          </div>
          <label className="ios-card-toggle">
            <span>Open as Web App</span>
            <input
              type="checkbox"
              checked={asWebApp}
              onChange={(e): void => setAsWebApp(e.target.checked)}
            />
            <span className="ios-switch" aria-hidden="true" />
          </label>
          <p className="ios-card-note">
            An icon will be added to your Home Screen so you can quickly access this website.
          </p>
        </div>
      </div>
    </div>
  );
}

function PermissionAlert(): React.ReactElement | null {
  const screen = useScreen();
  if (!screen.permission) {
    return null;
  }
  return (
    <div className="ios-sheet-scrim ios-alert-scrim">
      <div
        className={`ios-alert ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
        role="alertdialog"
        aria-label={screen.permission.message}
      >
        <p className="ios-alert-title">{screen.permission.message}</p>
        <div className="ios-alert-actions">
          <button type="button" onClick={(): void => screen.answerPermission(false)}>
            Don’t Allow
          </button>
          <button type="button" className="ios-alert-strong" onClick={(): void => screen.answerPermission(true)}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sheets and alerts that float above the app (and its browser chrome). */
export function ScreenModalLayer(): React.ReactElement | null {
  const screen = useScreen();
  return (
    <>
      {['browser-menu','settings','find','bookmarks','history'].includes(screen.sheet.kind) && <BrowserTools key={screen.browserMode + screen.currentUrl} screen={screen} />}
      {isHomeTool(screen.sheet.kind) && <HomeTools key={screen.sheet.kind} screen={screen}/>}
      {screen.sheet.kind === 'share' && <ShareSheet />}
      {screen.sheet.kind === 'add-to-home' && <AddToHomeSheet />}
      <PermissionAlert />
    </>
  );
}

// ---------------------------------------------------------------------------
// PWA inspector panel (outside the device, in the shell)
// ---------------------------------------------------------------------------

function CheckIcon(props: { readonly level: PwaCheck['level'] }): React.ReactElement {
  switch (props.level) {
    case 'pass':
      return <CheckCircle2 size={13} className="pwa-check-pass" />;
    case 'fail':
      return <XCircle size={13} className="pwa-check-fail" />;
    case 'warn':
      return <AlertTriangle size={13} className="pwa-check-warn" />;
    default:
      return <Info size={13} className="pwa-check-info" />;
  }
}

export function PwaInspectorPanel(props: {
  readonly report: PageInspectionReport | null;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
}): React.ReactElement {
  const counts = useMemo(() => {
    const c = { pass: 0, warn: 0, fail: 0, info: 0 };
    for (const check of props.report?.checks ?? []) c[check.level] += 1;
    return c;
  }, [props.report]);
  const identity = props.report?.identity;
  return (
    <aside className="pwa-inspector" role="dialog" aria-label="iOS Web App Inspector">
      <header className="pwa-inspector-head">
        <strong>PWA checks · Chromium preview</strong>
        <span className="pwa-inspector-counts">
          <span className="pwa-check-pass">{counts.pass}✓</span>
          <span className="pwa-check-warn">{counts.warn}!</span>
          <span className="pwa-check-fail">{counts.fail}✕</span>
        </span>
        <button type="button" onClick={props.onRefresh} title="Re-run checks">
          {props.loading ? '…' : 'Re-run'}
        </button>
        <button type="button" onClick={props.onClose} aria-label="Close inspector">
          <X size={12} />
        </button>
      </header>
      {identity && (
        <div className="pwa-inspector-identity">
          <div className="home-app-icon pwa-inspector-icon">
            {identity.iconUrl ? <img src={identity.iconUrl} alt="" /> : <span className="home-app-initial">{appInitial(identity.name)}</span>}
          </div>
          <div>
            <div className="pwa-inspector-name">{identity.name}</div>
            <div className="pwa-inspector-sub">
              {identity.opensAsWebApp ? 'Opens as Web App' : 'Opens in Safari'} · status bar {identity.statusBarStyle}
            </div>
          </div>
        </div>
      )}
      <ul className="pwa-inspector-list">
        {(props.report?.checks ?? []).map((check) => (
          <li key={check.id}>
            <CheckIcon level={check.level} />
            <div>
              <div className="pwa-check-title">{check.title}</div>
              <div className="pwa-check-detail">{check.detail}</div>
            </div>
          </li>
        ))}
        {!props.report && <li className="pwa-inspector-empty">{props.loading ? 'Inspecting page…' : 'No page inspected yet.'}</li>}
      </ul>
    </aside>
  );
}
