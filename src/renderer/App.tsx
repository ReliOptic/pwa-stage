import { requestDuoFoldToggle } from './sim-events';
import { shortcutModifier } from '../utils/platform.util';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DEVICE_PRESETS, getDevicePresetById } from '../config/device-presets.config';
import { loadSimulatorEnvConfig } from '../config/env.config';
import { createDefaultSimulatorState } from '../services/storage';
import { getSimulatorBridge, isElectronRuntime } from '../utils/renderer-bridge.util';
import { clampSimulatorScale, computeViewportMetrics } from '../utils/viewport-math.util';
import { DeviceModelId, DevicePreset, Orientation } from '../types/device.types';
import { BrowserShellMode, QuickUrlBookmark, SimulatorState } from '../types/simulator.types';
import { JourneyStudio } from './components/JourneyStudio';
import { FloatingToolbar } from './components/FloatingToolbar';
import { IphoneFrame } from './components/IphoneFrame';
import { PwaInspectorPanel, ScreenContext } from './components/ScreenLayers';
import { useScreenController } from './useScreenController';

interface LoadedSimulatorContext {
  readonly state: SimulatorState;
  readonly presets: readonly DevicePreset[];
  readonly bookmarks: readonly QuickUrlBookmark[];
}

function buildFallbackContext(): LoadedSimulatorContext {
  const envRes = loadSimulatorEnvConfig();
  if (!envRes.ok) {
    throw new Error(envRes.error.message);
  }
  return {
    state: createDefaultSimulatorState(envRes.value),
    presets: DEVICE_PRESETS,
    bookmarks: envRes.value.quickBookmarks
  };
}

export interface ShortcutActions {
  readonly goHome: () => void;
  readonly screenshot: () => void;
  readonly rotate: () => void;
}

/**
 * Xcode Simulator-compatible shortcuts. Also fed by the main process when the
 * <webview> has focus (keyboard events never reach the shell window then).
 */
function useSimulatorShortcuts(
  state: SimulatorState,
  onUpdateState: (patch: Partial<SimulatorState>) => void,
  onReload: () => void,
  actions: ShortcutActions
): void {
  useEffect((): (() => void) => {
    const handle = (key: string, shift: boolean): boolean => {
      if (key === 's' && shift) {
        void getSimulatorBridge().closeWindow();
      } else if (key === 'm') {
        void getSimulatorBridge().minimizeWindow();
      } else if (shift && key === 'h') {
        actions.goHome();
      } else if (shift && key === 'a') {
        onUpdateState({ darkMode: !state.darkMode });
      } else if (key === 's') {
        actions.screenshot();
      } else if (key === 'arrowleft' || key === 'arrowright') {
        actions.rotate();
      } else if (key === 'b') {
        onUpdateState({ hudCollapsed: !state.hudCollapsed });
      } else if (key === 't') {
        onUpdateState({ alwaysOnTop: !state.alwaysOnTop });
      } else if (key === 'r') {
        onReload();
      } else if (key === '=' || key === '+') {
        onUpdateState({ scale: clampSimulatorScale(state.scale + 0.05) });
      } else if (key === '-') {
        onUpdateState({ scale: clampSimulatorScale(state.scale - 0.05) });
      } else if (key === '0') {
        onUpdateState({ scale: 0.85 });
      } else {
        return false;
      }
      return true;
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!shortcutModifier(e.metaKey, e.ctrlKey, e.altKey)) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('.agent-panel')) return;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const key = e.key.toLowerCase();
      if (typing && (key === 'arrowleft' || key === 'arrowright' || key === 'a')) {
        return;
      }
      if (handle(key, e.shiftKey)) {
        e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent): void => {
      if (shortcutModifier(e.metaKey, e.ctrlKey, e.altKey)) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.03 : -0.03;
        onUpdateState({ scale: clampSimulatorScale(state.scale + delta) });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: false });
    const offGuestShortcut = getSimulatorBridge().onShortcut?.((sc): void => {
      handle(sc.key, sc.shift);
    });
    return (): void => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
      offGuestShortcut?.();
    };
  }, [state.hudCollapsed, state.alwaysOnTop, state.scale, state.darkMode, onUpdateState, onReload, actions]);
}

interface SimulatorController {
  readonly ctx: LoadedSimulatorContext;
  readonly reloadTick: number;
  readonly triggerReload: () => void;
  readonly setActiveWebContentsId: (id: number) => void;
  readonly handleUpdateState: (patch: Partial<SimulatorState>) => void;
  readonly handleOpenDevTools: () => void;
  readonly handleToggleDuoFold: () => void;
  readonly ready: boolean;
}

function useSimulatorController(): SimulatorController {
  const [ctx, setCtx] = useState<LoadedSimulatorContext>(() => buildFallbackContext());
  // Do not mount the <webview> with fallback state: it would start loading,
  // then be aborted when the persisted state arrives a moment later.
  const [ready, setReady] = useState<boolean>(!isElectronRuntime());
  const [reloadTick, setReloadTick] = useState<number>(0);
  const [activeWebContentsId, setActiveWebContentsId] = useState<number | null>(null);

  useEffect((): (() => void) | void => {
    const bridge = getSimulatorBridge();
    void bridge.getInitialPayload().then((res): void => {
      if (res.ok) {
        setCtx({
          state: res.value.state,
          presets: res.value.presets,
          bookmarks: res.value.envConfig.quickBookmarks
        });
      }
      setReady(true);
    });
    return bridge.onExternalStateUpdate?.((externalState: SimulatorState): void => {
      setCtx((prev) => ({ ...prev, state: externalState }));
    });
  }, []);

  const handleUpdateState = useCallback(
    (patch: Partial<SimulatorState>): void => {
      setCtx((prev) => {
        const nextState: SimulatorState = { ...prev.state, ...patch };
        // Emulation is (re)applied by each <webview> in WebviewContainer when
        // the relevant state changes: one path, no races between two callers.
        void getSimulatorBridge().updateSimulatorState(nextState);
        return { ...prev, state: nextState };
      });
    },
    []
  );

  const triggerReload = useCallback((): void => {
    setReloadTick((t) => t + 1);
  }, []);

  const handleOpenDevTools = useCallback((): void => {
    if (activeWebContentsId !== null) {
      void getSimulatorBridge().openWebviewDevTools(activeWebContentsId);
    }
  }, [activeWebContentsId]);

  const handleToggleDuoFold = useCallback((): void => {
    requestDuoFoldToggle();
  }, []);

  return {
    ctx,
    reloadTick,
    triggerReload,
    setActiveWebContentsId,
    handleUpdateState,
    handleOpenDevTools,
    handleToggleDuoFold,
    ready
  };
}

function findScreenElement(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('.iphone-screen') ??
    document.querySelector<HTMLElement>('.duo-3d-stage-root')
  );
}

export function App(): React.ReactElement | null {
  const ctrl = useSimulatorController();
  return ctrl.ready ? <SimulatorWorkspace ctrl={ctrl}/> : null;
}

function SimulatorWorkspace({ctrl}: {ctrl: SimulatorController}): React.ReactElement {
  const state = ctrl.ctx.state;
  const activePreset = getDevicePresetById(state.selectedDeviceId);
  const metrics = computeViewportMetrics(
    activePreset,
    state.orientation,
    state.scale,
    state.isFramed,
    state.hudCollapsed
  );
  const startPage = ctrl.ctx.bookmarks.find(bookmark => bookmark.id === 'start');
  const screen = useScreenController(state, ctrl.handleUpdateState, ctrl.triggerReload, state.currentUrl === startPage?.url);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentMounted, setAgentMounted] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [hostWidth, setHostWidth] = useState(window.innerWidth);
  const [visitAperture,setVisitAperture]=useState<HTMLDivElement|null>(null);
  const [agentSide,setAgentSide]=useState<'left'|'right'>(()=>localStorage.getItem('agent-dock-side')==='left'?'left':'right');
  function moveAgent(){const side=agentSide==='left'?'right':'left';setAgentSide(side);localStorage.setItem('agent-dock-side',side);}
  const docked = hostWidth - metrics.scaledOuterWidth >= 298;
  useEffect(() => {
    const resize = () => setHostWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    const off = getSimulatorBridge().onAgentPanel?.(open => {
      setAgentOpen(open);
      if (open) setAgentMounted(true);
      else requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.agent-toggle')?.focus());
    });
    return () => { window.removeEventListener('resize', resize); off?.(); };
  }, []);
  const showAgent = (open: boolean) => {
    void getSimulatorBridge().openJourneys?.(open).catch(() => screen.showToast('Could not open Agent.'));
  };
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const { showToast } = screen;

  const [screenshotDirectory, setScreenshotDirectory] = useState('');
  const [lastCapture, setLastCapture] = useState('');
  const capturing = React.useRef(false);
  useEffect(() => {
    void getSimulatorBridge().getScreenshotDirectory?.().then(setScreenshotDirectory).catch(() => {});
  }, []);
  const takeScreenshot = useCallback(async (): Promise<void> => {
    const el = findScreenElement();
    const bridge = getSimulatorBridge();
    if (!el || !bridge.captureScreenshot || capturing.current) return;
    capturing.current = true;
    document.documentElement.classList.add('capturing-screen');
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const r = el.getBoundingClientRect();
      const res = await bridge.captureScreenshot({x:r.left,y:r.top,width:r.width,height:r.height}, activePreset.name);
      if (!res.ok || !res.value) throw Error('Empty capture');
      setLastCapture(res.value);
      showToast('Screenshot saved to ' + screenshotDirectory);
    } catch {
      showToast('Could not save the screenshot');
    } finally {
      document.documentElement.classList.remove('capturing-screen');
      capturing.current = false;
    }
  }, [activePreset.name, screenshotDirectory, showToast]);
  const openScreenshotLocation = (latest: boolean): void => {
    void getSimulatorBridge().openScreenshotLocation?.(latest)
      .then(opened => { if (!opened) showToast('Could not open the screenshot folder'); })
      .catch(() => showToast('Could not open the screenshot folder'));
  };

  const rotate = useCallback((): void => {
    ctrl.handleUpdateState({
      orientation:
        state.orientation === Orientation.PORTRAIT ? Orientation.LANDSCAPE : Orientation.PORTRAIT
    });
  }, [ctrl, state.orientation]);

  const shortcutActions = useMemo<ShortcutActions>(
    () => ({ goHome: screen.value.goHome, screenshot: takeScreenshot, rotate }),
    [screen.value.goHome, takeScreenshot, rotate]
  );
  useSimulatorShortcuts(state, ctrl.handleUpdateState, ctrl.triggerReload, shortcutActions);

  // Safari tints the status-bar area from theme-color / the page background.
  const identity = screen.report?.identity;
  const tintColor =
    state.shellMode === BrowserShellMode.PWA_STANDALONE
      ? identity?.themeColor ?? null
      : identity?.themeColor ?? screen.report?.inspection.bodyBackground ?? null;

  return (
    <ScreenContext.Provider value={screen.value}>
      <div className="simulator-workspace" data-agent-open={agentOpen} data-docked={docked} data-agent-side={agentSide}
        style={{'--device-width':metrics.scaledOuterWidth+'px'} as React.CSSProperties}>
      <main className="simulator-root" data-narrow={metrics.scaledOuterWidth <= 623}>
        <FloatingToolbar
          state={state}
          presets={ctrl.ctx.presets}
          bookmarks={ctrl.ctx.bookmarks}
          activePreset={activePreset}
          onUpdateState={ctrl.handleUpdateState}
          onReload={ctrl.triggerReload}
          onOpenDevTools={ctrl.handleOpenDevTools}
          onGoHome={screen.value.goHome}
          onJourneys={window.journeyStudio ? () => showAgent(!agentOpen) : undefined}
          agentOpen={agentOpen} agentRunning={agentRunning}
          onScreenshot={takeScreenshot}
          screenshotDirectory={screenshotDirectory}
          lastCapture={lastCapture}
          onOpenScreenshotLocation={openScreenshotLocation}
          onToggleInspector={(): void => setInspectorOpen((v) => !v)}
          inspectorOpen={inspectorOpen}
          inspectorBadge={screen.report?.checks.filter((c) => c.level === 'fail').length ?? 0}
          onMinimize={(): void => {
            void getSimulatorBridge().minimizeWindow();
          }}
          onClose={(): void => {
            void getSimulatorBridge().closeWindow();
          }}
        />
        <IphoneFrame
          onVisitAperture={window.journeyStudio?setVisitAperture:undefined}
          preset={activePreset}
          metrics={metrics}
          state={state}
          reloadTick={ctrl.reloadTick}
          onRegisterWebContentsId={ctrl.setActiveWebContentsId}
          onUpdateState={ctrl.handleUpdateState}
          onReload={ctrl.triggerReload}
          onToggleDuoFold={ctrl.handleToggleDuoFold}
          onSyncDuoDeviceByAngle={(targetId: DeviceModelId): void =>
            ctrl.handleUpdateState({ selectedDeviceId: targetId })
          }
          onGoHome={screen.value.goHome}
          tintColor={tintColor}
          displayBackground={screen.report?.inspection.bodyBackground}
          onPageReady={screen.onPageReady}
        />
        {inspectorOpen && (
          <PwaInspectorPanel
            report={screen.report}
            loading={screen.inspecting}
            onRefresh={screen.reinspect}
            onClose={(): void => setInspectorOpen(false)}
          />
        )}
        {screen.toast && (
          <div className="sim-toast" role="status">
            {screen.toast}
          </div>
        )}
      </main>
      {agentMounted && window.journeyStudio && <aside className="agent-panel" hidden={!agentOpen} aria-label="PWA Stage Agent">
        <JourneyStudio bridge={window.journeyStudio} open={agentOpen} currentUrl={state.currentUrl}
          aperture={agentOpen && docked?visitAperture:null} device={activePreset.name} activeDevice={activePreset.id} activeBrowser={state.shellMode===BrowserShellMode.IOS_CHROME?'ios-chrome':'ios-safari'} side={agentSide} onMove={moveAgent} onClose={() => showAgent(false)} onRunning={setAgentRunning}/>
      </aside>}
      </div>
    </ScreenContext.Provider>
  );
}
