import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageInspectionReport } from '../types/ipc-coordinator.types';
import { InstalledWebApp } from '../types/pwa.types';
import { BrowserShellMode, SimulatorState } from '../types/simulator.types';
import { getSimulatorBridge } from '../utils/renderer-bridge.util';
import {
  LaunchOrigin,
  PermissionPromptState,
  ScreenContextValue,
  ScreenPhase,
  ScreenSheetState
} from './components/ScreenLayers';

const INSTALLED_APPS_KEY = 'pwa-stage.installed-web-apps.v1';
const CLOSE_MS = 320;
const LAUNCH_MS = 420;
const SPLASH_MIN_MS = 650;

function loadInstalledApps(): InstalledWebApp[] {
  try {
    const raw = window.localStorage.getItem(INSTALLED_APPS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
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
      )
      .slice(0, 24);
  } catch {
    return [];
  }
}

function saveInstalledApps(apps: readonly InstalledWebApp[]): void {
  try {
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
  const [phase, setPhase] = useState<ScreenPhase>('app');
  const [launchOrigin, setLaunchOrigin] = useState<LaunchOrigin>({ x: 0.5, y: 0.92 });
  const [splash, setSplash] = useState<ScreenContextValue['splash']>(null);
  const [installedApps, setInstalledApps] = useState<InstalledWebApp[]>(() => loadInstalledApps());
  const [sheet, setSheet] = useState<ScreenSheetState>({ kind: 'none' });
  const [permissionQueue, setPermissionQueue] = useState<PermissionPromptState[]>([]);
  const [report, setReport] = useState<PageInspectionReport | null>(null);
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
      setInspecting(true);
      void bridge
        .inspectPage(guestId)
        .then((res): void => {
          if (res.ok) {
            setReport(res.value);
            const style = res.value.identity.statusBarStyle;
            if (style !== state.pwaStatusBarStyle) {
              updateState({ pwaStatusBarStyle: style });
            }
          }
        })
        .finally((): void => setInspecting(false));
    },
    [state.pwaStatusBarStyle, updateState]
  );

  const onPageReady = useCallback(
    (guestId: number): void => {
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

  // Picking a browser / URL / device in the toolbar while on the Home Screen
  // means "show me the page": leave the springboard.
  const lastTargetRef = useRef(`${state.shellMode}|${state.currentUrl}|${state.selectedDeviceId}`);
  useEffect((): void => {
    const key = `${state.shellMode}|${state.currentUrl}|${state.selectedDeviceId}`;
    if (key === lastTargetRef.current) return;
    lastTargetRef.current = key;
    setPhase((p) => (p === 'home' ? 'launching' : p));
    later(() => setPhase((p) => (p === 'launching' ? 'app' : p)), LAUNCH_MS);
  }, [state.shellMode, state.currentUrl, state.selectedDeviceId, later]);

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
    setSheet({ kind: 'none' });
    setPhase((current) => {
      if (current !== 'app') return current;
      later(() => setPhase('home'), CLOSE_MS);
      return 'closing';
    });
  }, [later]);

  const launchApp = useCallback(
    (app: InstalledWebApp | 'safari' | 'chrome', origin: LaunchOrigin): void => {
      setLaunchOrigin(origin);
      if (app === 'safari' || app === 'chrome') {
        const shellMode = app === 'safari' ? BrowserShellMode.IOS_SAFARI : BrowserShellMode.IOS_CHROME;
        if (state.shellMode !== shellMode) updateState({ shellMode });
        setSplash(null);
        setPhase('launching');
        later(() => setPhase('app'), LAUNCH_MS);
        return;
      }
      const shellMode = app.opensAsWebApp ? BrowserShellMode.PWA_STANDALONE : BrowserShellMode.IOS_SAFARI;
      updateState({
        shellMode,
        currentUrl: app.launchUrl,
        pwaStatusBarStyle: app.statusBarStyle
      });
      setSplash(
        app.opensAsWebApp
          ? { background: app.backgroundColor ?? '#ffffff', iconUrl: app.iconUrl }
          : null
      );
      setPhase('launching');
      later(() => setPhase('app'), Math.max(LAUNCH_MS, app.opensAsWebApp ? SPLASH_MIN_MS : 0));
      later(() => setSplash(null), SPLASH_MIN_MS + 200);
    },
    [later, state.shellMode, updateState]
  );

  const addToHome = useCallback(
    (name: string, opensAsWebApp: boolean): void => {
      const identity = report?.identity;
      if (!identity) return;
      const app: InstalledWebApp = {
        ...identity,
        name,
        opensAsWebApp,
        id: `${identity.launchUrl}#${Date.now()}`,
        addedAt: Date.now()
      };
      setInstalledApps((prev) => {
        const next = [...prev.filter((a) => a.launchUrl !== app.launchUrl), app];
        saveInstalledApps(next);
        return next;
      });
      setSheet({ kind: 'none' });
      setPhase('closing');
      later(() => setPhase('home'), CLOSE_MS);
    },
    [later, report]
  );

  const removeApp = useCallback((id: string): void => {
    setInstalledApps((prev) => {
      const next = prev.filter((a) => a.id !== id);
      saveInstalledApps(next);
      return next;
    });
  }, []);

  const answerPermission = useCallback((granted: boolean): void => {
    setPermissionQueue((q) => {
      const [head, ...rest] = q;
      if (head) void getSimulatorBridge().respondPermission?.(head.id, granted);
      return rest;
    });
  }, []);

  const navigate = useCallback((direction: 'back' | 'forward'): void => {
    window.dispatchEvent(new CustomEvent('sim:webview-nav', { detail: direction }));
  }, []);

  const value = useMemo<ScreenContextValue>(
    () => ({
      phase,
      launchOrigin,
      splash,
      installedApps,
      report,
      sheet,
      permission: permissionQueue[0] ?? null,
      darkMode: state.darkMode,
      goHome,
      launchApp,
      openSheet: (kind): void => setSheet({ kind }),
      addToHome,
      removeApp,
      answerPermission,
      navigate,
      reload
    }),
    [
      phase,
      launchOrigin,
      splash,
      installedApps,
      report,
      sheet,
      permissionQueue,
      state.darkMode,
      goHome,
      launchApp,
      addToHome,
      removeApp,
      answerPermission,
      navigate,
      reload
    ]
  );

  return { value, report, inspecting, reinspect, onPageReady, toast, showToast };
}
