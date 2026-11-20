import { getDevicePresetById } from '../config/device-presets.config';
import { createCatalogApp, matchesCatalogApp, webAppCatalog, type WebAppListing } from '../config/web-app-catalog';
import { exitGuestFullscreen } from './guest-fullscreen';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { updateLibrary } from './browser-preferences';
import { PageInspectionReport } from '../types/ipc-coordinator.types';
import { InstalledWebApp } from '../types/pwa.types';
import { BrowserShellMode, SimulatorState } from '../types/simulator.types';
import { getSimulatorBridge } from '../utils/renderer-bridge.util';
import {
  HomeNavigation,
  LaunchOrigin,
  PermissionPromptState,
  ScreenContextValue,
  ScreenPhase,
  ScreenSheetState
} from './components/ScreenLayers';

const INSTALLED_APPS_KEY = 'pwa-stage.installed-web-apps.v1';
// Recovery for a hidden window where the compositor suspends the animation.
const TRANSITION_RECOVERY_MS = 2000;


function loadInstalledApps(): InstalledWebApp[] {
  try {
    const raw = window.localStorage.getItem(INSTALLED_APPS_KEY);
    if (raw === null) {
      if (getSimulatorBridge().guestPartition) return [];
      return webAppCatalog.filter(app => app.starter).map(app => createCatalogApp(app, Date.now()));
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is InstalledWebApp =>
          typeof a === 'object' &&
          a !== null &&
          typeof (a as InstalledWebApp).id === 'string' &&
          typeof (a as InstalledWebApp).name === 'string' &&
          typeof (a as InstalledWebApp).launchUrl === 'string' &&
          /^https?:\/\//.test((a as InstalledWebApp).launchUrl)
      );
  } catch {
    return [];
  }
}

function saveInstalledApps(apps: readonly InstalledWebApp[], initialize: boolean): void {
  try {
    if (initialize && window.localStorage.getItem(INSTALLED_APPS_KEY) !== null) return;
    window.localStorage.setItem(INSTALLED_APPS_KEY, JSON.stringify(apps));
  } catch {
    // storage unavailable: the Home Screen just won't persist
  }
}

export interface ScreenController {
  readonly value: ScreenContextValue;
  readonly report: PageInspectionReport | null;
  readonly inspecting: boolean;
  readonly reinspect: () => void;
  readonly onPageReady: (webContentsId: number) => void;
  readonly toast: string | null;
  readonly showToast: (message: string) => void;
}

/**
 * Springboard behaviour: Home, launching Home Screen web apps / browsers,
 * Add to Home Screen, permission alerts and the page inspection that feeds
 * all of them.
 */
export function useScreenController(
  state: SimulatorState,
  updateState: (patch: Partial<SimulatorState>) => void,
  reload: () => void
): ScreenController {
  const [homePreview, setHomePreview] = useState(false);
  const [phase, setPhase] = useState<ScreenPhase>('app');
  const [homeNavigation, setHomeNavigation] = useState<HomeNavigation>({ page: 0, searching: false, query: '' });
  const [launchOrigin, setLaunchOrigin] = useState<LaunchOrigin>({ x: 0.5, y: 0.92, width: 0.15, height: 0.075 });
  const [splash, setSplash] = useState<ScreenContextValue['splash']>(null);
  const [installedApps, setInstalledApps] = useState<InstalledWebApp[]>(() => loadInstalledApps());
  const initialApps = useRef(installedApps);
  useEffect(() => saveInstalledApps(installedApps, installedApps === initialApps.current), [installedApps]);
  const [largeIcons, setLargeIconPreference] = useState(() => window.localStorage.getItem('pwa-stage.large-icons') === 'true');
  const setLargeIcons = useCallback((enabled: boolean) => {
    window.localStorage.setItem('pwa-stage.large-icons', String(enabled));
    setLargeIconPreference(enabled);
  }, []);
  const [sheet, setSheet] = useState<ScreenSheetState>({ kind: 'none' });
  const [permissionQueue, setPermissionQueue] = useState<PermissionPromptState[]>([]);
  const [inspectionResult, setReport] = useState<PageInspectionReport | null>(null);
  const report = inspectionResult?.inspection.url === state.currentUrl ? inspectionResult : null;
  const inspectionSequence = useRef(0);
  useEffect(() => {
    if (report && state.shellMode !== BrowserShellMode.PWA_STANDALONE) {
      updateLibrary(state.shellMode, 'history', {url: report.inspection.url, title: report.inspection.title || report.identity.name});
    }
  }, [report, state.shellMode]);
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastGuestRef = useRef<number | null>(null);
  const inspectTimerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(
    (): (() => void) => (): void => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const showToast = useCallback(
    (message: string): void => {
      setToast(message);
      later(() => setToast((cur) => (cur === message ? null : cur)), 2600);
    },
    [later]
  );

  // --- page inspection ------------------------------------------------------
  const runInspection = useCallback(
    (guestId: number): void => {
      const bridge = getSimulatorBridge();
      if (!bridge.inspectPage) return;
      const sequence = ++inspectionSequence.current;
      setInspecting(true);
      void bridge
        .inspectPage(guestId)
        .then((res): void => {
          if (sequence !== inspectionSequence.current) return;
          if (!res.ok) { setReport(null); return; }
          setReport(res.value);
          const style = res.value.identity.statusBarStyle;
          if (style !== state.pwaStatusBarStyle) updateState({ pwaStatusBarStyle: style });
        })
        .catch(() => { if (sequence === inspectionSequence.current) setReport(null); })
        .finally(() => { if (sequence === inspectionSequence.current) setInspecting(false); });
    },
    [state.pwaStatusBarStyle, updateState]
  );

  const onPageReady = useCallback(
    (guestId: number): void => {
      inspectionSequence.current++;
      setSplash(null);
      lastGuestRef.current = guestId;
      if (inspectTimerRef.current !== null) {
        window.clearTimeout(inspectTimerRef.current);
      }
      inspectTimerRef.current = window.setTimeout(() => runInspection(guestId), 500);
    },
    [runInspection]
  );

  const reinspect = useCallback((): void => {
    if (lastGuestRef.current !== null) runInspection(lastGuestRef.current);
  }, [runInspection]);

  useLayoutEffect(() => {
    if (sheet.kind !== 'viewport') return;
    // Safari's collapsing bars can resize the guest without changing the device or URL.
    reinspect();
    const observer = new ResizeObserver(reinspect);
    document.querySelectorAll('webview').forEach(guest => observer.observe(guest));
    return () => observer.disconnect();
  }, [sheet.kind, state.selectedDeviceId, state.orientation, reinspect]);

  // Picking a browser / URL in the toolbar while on the Home Screen
  // means "show me the page": leave the springboard.
  const lastTargetRef = useRef(`${state.shellMode}|${state.currentUrl}`);
  useEffect((): void => {
    const key = `${state.shellMode}|${state.currentUrl}`;
    if (key === lastTargetRef.current) return;
    lastTargetRef.current = key;
    setSheet({ kind: 'none' });
    setPhase(p => p === 'home' ? 'launching' : p);
  }, [state.shellMode, state.currentUrl]);

  const finishTransition = useCallback((completed: 'closing' | 'launching') => {
    setPhase(current => current === completed ? (completed === 'closing' ? 'home' : 'app') : current);
  }, []);
  useEffect(() => {
    if (phase !== 'closing' && phase !== 'launching') { setSplash(null); return; }
    const timer = window.setTimeout(() => finishTransition(phase), TRANSITION_RECOVERY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finishTransition]);

  // --- permission prompts from the main process ----------------------------
  useEffect((): (() => void) | void => {
    const bridge = getSimulatorBridge();
    return bridge.onPermissionPrompt?.((prompt): void => {
      setPhase((p) => (p === 'home' ? 'app' : p));
      setPermissionQueue((q) => [...q, { id: prompt.id, message: prompt.message }]);
    });
  }, []);

  // --- springboard ------------------------------------------------------------
  const goHome = useCallback((): void => {
    exitGuestFullscreen();
    setSheet({ kind: 'none' });
    setSplash(null);
    setPhase(current => current === 'home' ? 'home' : 'closing');
  }, []);

  const resumeApp = useCallback((origin:LaunchOrigin)=>{
    setLaunchOrigin(origin);setSheet({kind:'none'});setSplash(null);setPhase('launching');
  },[]);

  const launchApp = useCallback(
    (app: InstalledWebApp | 'safari' | 'chrome', origin: LaunchOrigin): void => {
      setSheet({ kind: 'none' });
      setLaunchOrigin(origin);
      if (app === 'safari' || app === 'chrome') {
        const shellMode = app === 'safari' ? BrowserShellMode.IOS_SAFARI : BrowserShellMode.IOS_CHROME;
        if (state.shellMode !== shellMode) updateState({ shellMode });
        setSplash(null);
        setPhase('launching');
        return;
      }
      const shellMode = app.opensAsWebApp ? BrowserShellMode.PWA_STANDALONE
        : app.browser === 'chrome' ? BrowserShellMode.IOS_CHROME : BrowserShellMode.IOS_SAFARI;
      updateState({
        shellMode,
        currentUrl: app.launchUrl,
        pwaStatusBarStyle: app.statusBarStyle
      });
      setSplash(
        app.opensAsWebApp && state.currentUrl !== app.launchUrl
          // iOS does not generate Android-style manifest icon/colour splashes.
          // White is an estimated fallback until startup images are supported.
          ? { background: '#ffffff', iconUrl: null }
          : null
      );
      setPhase('launching');
    },
    [state.currentUrl, state.shellMode, updateState]
  );

  const addToHome = useCallback(
    (name: string, opensAsWebApp: boolean): void => {
      const identity = report?.identity;
      if (!identity) return;
      const app: InstalledWebApp = {
        ...identity,
        launchUrl: opensAsWebApp ? identity.launchUrl : state.currentUrl,
        name,
        opensAsWebApp,
        id: `${identity.launchUrl}#${Date.now()}`,
        addedAt: Date.now()
      };
      const listing = webAppCatalog.find(entry => matchesCatalogApp(entry, app));
      setInstalledApps(prev => [app, ...prev.filter(existing =>
        existing.launchUrl !== app.launchUrl && !(listing && matchesCatalogApp(listing, existing)))]);
      setHomeNavigation({ page: 0, searching: false, query: '' });
      setSheet({ kind: 'none' });
      setPhase('closing');
    },
    [report, state.currentUrl]
  );

  const installCatalogApps = useCallback((listings: readonly WebAppListing[]) => {
    const addedAt = Date.now();
    setInstalledApps(previous => {
      const additions = listings.filter(listing => !previous.some(app => matchesCatalogApp(listing, app)));
      return additions.length ? [...additions.map(listing => createCatalogApp(listing, addedAt)), ...previous] : previous;
    });
    setHomeNavigation({page: 0, searching: false, query: ''});
  }, []);

  const updateApp = useCallback((id: string, name: string, opensAsWebApp: boolean, browser: 'safari' | 'chrome') => {
    const label = name.trim().slice(0, 80);
    if (!label) return;
    setInstalledApps(previous => previous.map(app => app.id === id ? {...app, name:label, opensAsWebApp, browser} : app));
  }, []);

  const removeApp = useCallback((id: string): void => {
    setInstalledApps(prev => prev.filter(app => app.id !== id));
  }, []);

  const answerPermission = useCallback((granted: boolean): void => {
    setPermissionQueue((q) => {
      const [head, ...rest] = q;
      if (head) void getSimulatorBridge().respondPermission?.(head.id, granted);
      return rest;
    });
  }, []);

  const openUrl = useCallback((url: string): void => {
    if (url === state.currentUrl) reload();
    else updateState({ currentUrl: url });
  }, [state.currentUrl, updateState, reload]);

  const navigate = useCallback((direction: 'back' | 'forward'): void => {
    window.dispatchEvent(new CustomEvent('sim:webview-nav', { detail: direction }));
  }, []);

  const openSheet = useCallback((kind: ScreenSheetState['kind']) => setSheet({kind}), []);

  const value = useMemo<ScreenContextValue>(
    () => ({
      iconDpr: getDevicePresetById(state.selectedDeviceId).deviceScaleFactor,
      browserMode: state.shellMode,
      setAppearance: darkMode => updateState({darkMode}),
      homePreview, setHomePreview, homeNavigation,
      setHomeNavigation,
      phase,
      launchOrigin,
      finishTransition,
      splash,
      installedApps,
      report,
      sheet,
      permission: permissionQueue[0] ?? null,
      darkMode: state.darkMode,
      goHome,
      resumeApp, launchApp,
      openSheet,
      addToHome,
      installCatalogApps,
      largeIcons, setLargeIcons, updateApp, removeApp,
      answerPermission,
      navigate,
      openUrl,
      reinspect,
      inspecting,
      currentUrl: state.currentUrl,
      reload
    }),
    [
      state.shellMode, state.selectedDeviceId, updateState, openSheet,
      homePreview, setHomePreview, homeNavigation,
      phase,
      launchOrigin,
      finishTransition,
      splash,
      installedApps,
      report,
      sheet,
      permissionQueue,
      state.darkMode,
      goHome,
      resumeApp, launchApp,
      addToHome,
      installCatalogApps,
      largeIcons, setLargeIcons, updateApp, removeApp,
      answerPermission,
      navigate,
      openUrl,
      reinspect,
      inspecting,
      state.currentUrl,
      reload
    ]
  );

  return { value, report, inspecting, reinspect, onPageReady, toast, showToast };
}
