import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Aperture,
  Compass,
  Globe,
  Info,
  Plus,
  Search,
  X,
  XCircle
} from 'lucide-react';
import { InstalledWebApp, PwaCheck } from '../../types/pwa.types';
import { PageInspectionReport } from '../../types/ipc-coordinator.types';

// ---------------------------------------------------------------------------
// Screen state shared by the flat frame and the 3D Duo stage
// ---------------------------------------------------------------------------

export type ScreenPhase = 'app' | 'closing' | 'home' | 'launching';

export interface LaunchOrigin {
  /** Icon centre in screen-relative fractions (0..1). */
  readonly x: number;
  readonly y: number;
}

export interface ScreenSheetState {
  readonly kind: 'none' | 'safari-more' | 'share' | 'add-to-home';
}

export interface PermissionPromptState {
  readonly id: string;
  readonly message: string;
}

export interface ScreenContextValue {
  readonly phase: ScreenPhase;
  readonly launchOrigin: LaunchOrigin;
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
  readonly removeApp: (id: string) => void;
  readonly answerPermission: (granted: boolean) => void;
  readonly navigate: (direction: 'back' | 'forward') => void;
  readonly reload: () => void;
}

const noop = (): void => undefined;

export const ScreenContext = createContext<ScreenContextValue>({
  phase: 'app',
  launchOrigin: { x: 0.5, y: 0.5 },
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
  removeApp: noop,
  answerPermission: noop,
  navigate: noop,
  reload: noop
});

export function useScreen(): ScreenContextValue {
  return useContext(ScreenContext);
}

// ---------------------------------------------------------------------------
// App surface: wraps the live <webview> and plays launch / close transitions
// ---------------------------------------------------------------------------

export function AppSurface(props: { readonly children: React.ReactNode }): React.ReactElement {
  const screen = useScreen();
  const origin = `${(screen.launchOrigin.x * 100).toFixed(1)}% ${(screen.launchOrigin.y * 100).toFixed(1)}%`;
  const hidden = screen.phase === 'home';
  return (
    <div
      className={`app-surface app-surface-${screen.phase}`}
      style={{ transformOrigin: origin, visibility: hidden ? 'hidden' : 'visible' }}
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
    y: (target.top + target.height / 2 - host.top) / Math.max(1, host.height)
  };
}

function AppIcon(props: {
  readonly label: string;
  readonly iconUrl?: string | null;
  readonly glyph?: React.ReactNode;
  readonly tone?: string;
  readonly hideLabel?: boolean;
  readonly onOpen: (origin: LaunchOrigin) => void;
  readonly onRemove?: () => void;
}): React.ReactElement {
  const [broken, setBroken] = useState(false);
  const initial = props.label.trim().charAt(0).toUpperCase() || '•';
  return (
    <div className="home-app">
      <button
        type="button"
        className="home-app-icon"
        style={props.tone ? { background: props.tone } : undefined}
        onClick={(e): void => props.onOpen(originFromEvent(e))}
        onContextMenu={(e): void => {
          if (props.onRemove) {
            e.preventDefault();
            e.stopPropagation();
            props.onRemove();
          }
        }}
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
      {!props.hideLabel && <span className="home-app-label">{props.label}</span>}
    </div>
  );
}

function useClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect((): (() => void) => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return (): void => window.clearInterval(id);
  }, []);
  return now;
}

export function HomeScreen(props: { readonly trailingInset?: number }): React.ReactElement | null {
  const screen = useScreen();
  const now = useClock();
  if (screen.phase !== 'home' && screen.phase !== 'closing' && screen.phase !== 'launching') {
    return null;
  }
  const identity = screen.report?.identity ?? null;
  const currentInstalled = identity
    ? screen.installedApps.some((a) => a.launchUrl === identity.launchUrl)
    : true;
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  return (
    <div
      className={`home-screen home-screen-${screen.phase}`}
      style={{ ['--home-trailing' as string]: `${props.trailingInset ?? 0}px` }}
    >
      <div className="home-wallpaper" aria-hidden="true" />
      <div className="home-content">
        <div className="home-widget" aria-label="Date">
          <span className="home-widget-day">{weekday}</span>
          <span className="home-widget-date">{now.getDate()}</span>
          <span className="home-widget-sub">
            {screen.installedApps.length === 0
              ? 'Add your web app from Safari → ⋯ → Share → Add to Home Screen'
              : `${screen.installedApps.length} web app${screen.installedApps.length > 1 ? 's' : ''} installed`}
          </span>
        </div>
        <div className="home-grid">
          {screen.installedApps.map((app) => (
            <AppIcon
              key={app.id}
              label={app.name}
              iconUrl={app.iconUrl}
              onOpen={(origin): void => screen.launchApp(app, origin)}
              onRemove={(): void => screen.removeApp(app.id)}
            />
          ))}
          {!currentInstalled && identity && (
            <div className="home-app home-app-ghost">
              <button
                type="button"
                className="home-app-icon home-app-icon-ghost"
                onClick={(): void => screen.openSheet('add-to-home')}
                title={`Add “${identity.name}” to the Home Screen`}
                aria-label="Add current page to Home Screen"
              >
                <Plus size={26} />
              </button>
              <span className="home-app-label">Add {identity.name}</span>
            </div>
          )}
        </div>
      </div>
      <div className="home-search-pill" aria-hidden="true">
        <Search size={12} />
        <span>Search</span>
      </div>
      <div className="home-dock">
        <AppIcon
          label="Safari"
          hideLabel
          tone="linear-gradient(160deg, #ffffff 0%, #dfe9ff 100%)"
          glyph={<Compass size={34} color="#1e7bff" strokeWidth={1.6} />}
          onOpen={(origin): void => screen.launchApp('safari', origin)}
        />
        <AppIcon
          label="Chrome"
          hideLabel
          tone="linear-gradient(160deg, #ffffff 0%, #eef1f5 100%)"
          glyph={<Aperture size={32} color="#3b7a57" strokeWidth={1.6} />}
          onOpen={(origin): void => screen.launchApp('chrome', origin)}
        />
        {screen.installedApps[0] && (
          <AppIcon
            label={screen.installedApps[0].name}
            hideLabel
            iconUrl={screen.installedApps[0].iconUrl}
            onOpen={(origin): void => screen.launchApp(screen.installedApps[0], origin)}
          />
        )}
        <AppIcon
          label="Web"
          hideLabel
          tone="linear-gradient(160deg, #3a3f4b 0%, #1d2027 100%)"
          glyph={<Globe size={30} color="#e5e7eb" strokeWidth={1.6} />}
          onOpen={(origin): void => screen.launchApp('safari', origin)}
        />
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

function SafariMoreSheet(): React.ReactElement {
  const screen = useScreen();
  return (
    <div className="ios-sheet-scrim" onClick={(): void => screen.openSheet('none')}>
      <div
        className={`ios-action-sheet ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
        onClick={(e): void => e.stopPropagation()}
      >
        <div className="ios-action-group">
          <button type="button" onClick={(): void => screen.openSheet('share')}>
            Share
          </button>
          <button
            type="button"
            onClick={(): void => {
              screen.navigate('forward');
              screen.openSheet('none');
            }}
          >
            Forward
          </button>
          <button
            type="button"
            onClick={(): void => {
              screen.reload();
              screen.openSheet('none');
            }}
          >
            Reload Page
          </button>
        </div>
        <div className="ios-action-group">
          <button type="button" className="ios-action-cancel" onClick={(): void => screen.openSheet('none')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shared system share entry; layout is an approximation, not the full activity sheet. */
function ShareSheet(): React.ReactElement {
  const screen = useScreen();
  return (
    <div className="ios-sheet-scrim" onClick={(): void => screen.openSheet('none')}>
      <div className={`ios-action-sheet ${screen.darkMode ? 'ios-sheet-dark' : 'ios-sheet-light'}`}
        role="dialog" aria-label="Share" onClick={(e): void => e.stopPropagation()}>
        <div className="ios-action-group">
          <button type="button" onClick={(): void => screen.openSheet('add-to-home')}>
            Add to Home Screen
          </button>
        </div>
        <div className="ios-action-group">
          <button type="button" className="ios-action-cancel" onClick={(): void => screen.openSheet('none')}>
            Cancel
          </button>
        </div>
      </div>
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
          <p className="ios-card-empty">Waiting for the page to finish loading…</p>
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
                <span className="home-app-initial">{name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="ios-card-fields">
              <input
                value={name}
                maxLength={40}
                onChange={(e): void => setName(e.target.value)}
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
      {screen.sheet.kind === 'safari-more' && <SafariMoreSheet />}
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
        <strong>iOS Web App Check</strong>
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
            {identity.iconUrl ? <img src={identity.iconUrl} alt="" /> : <span className="home-app-initial">{identity.name.charAt(0)}</span>}
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
