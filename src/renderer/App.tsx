import React, { useCallback, useEffect, useState } from 'react';
import { DEVICE_PRESETS, getDevicePresetById } from '../config/device-presets.config';
import { loadSimulatorEnvConfig } from '../config/env.config';
import { createDefaultSimulatorState } from '../services/storage';
import { getSimulatorBridge } from '../utils/renderer-bridge.util';
import { clampSimulatorScale, computeViewportMetrics } from '../utils/viewport-math.util';
import { DeviceModelId, DevicePreset, Orientation } from '../types/device.types';
import { QuickUrlBookmark, SimulatorState } from '../types/simulator.types';
import { FloatingToolbar } from './components/FloatingToolbar';
import { IphoneFrame } from './components/IphoneFrame';

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

function shouldSyncEmulation(prev: SimulatorState, next: SimulatorState): boolean {
  return (
    prev.selectedDeviceId !== next.selectedDeviceId ||
    prev.orientation !== next.orientation ||
    prev.shellMode !== next.shellMode ||
    prev.darkMode !== next.darkMode ||
    prev.scale !== next.scale ||
    prev.touchCursorEnabled !== next.touchCursorEnabled
  );
}

function useSimulatorShortcuts(
  state: SimulatorState,
  onUpdateState: (patch: Partial<SimulatorState>) => void,
  onReload: () => void
): void {
  useEffect((): (() => void) => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        onUpdateState({ hudCollapsed: !state.hudCollapsed });
      } else if (key === 't') {
        e.preventDefault();
        onUpdateState({ alwaysOnTop: !state.alwaysOnTop });
      } else if (key === 'r') {
        e.preventDefault();
        onReload();
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        onUpdateState({ scale: clampSimulatorScale(state.scale + 0.05) });
      } else if (key === '-') {
        e.preventDefault();
        onUpdateState({ scale: clampSimulatorScale(state.scale - 0.05) });
      } else if (key === '0') {
        e.preventDefault();
        onUpdateState({ scale: 0.85 });
      }
    };

    const onWheel = (e: WheelEvent): void => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.03 : -0.03;
        onUpdateState({ scale: clampSimulatorScale(state.scale + delta) });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: false });
    return (): void => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, [state.hudCollapsed, state.alwaysOnTop, state.scale, onUpdateState, onReload]);
}

interface SimulatorController {
  readonly ctx: LoadedSimulatorContext;
  readonly reloadTick: number;
  readonly triggerReload: () => void;
  readonly setActiveWebContentsId: (id: number) => void;
  readonly handleUpdateState: (patch: Partial<SimulatorState>) => void;
  readonly handleOpenDevTools: () => void;
  readonly handleToggleDuoFold: () => void;
}

function useSimulatorController(): SimulatorController {
  const [ctx, setCtx] = useState<LoadedSimulatorContext>(() => buildFallbackContext());
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
    });
    return bridge.onExternalStateUpdate?.((externalState: SimulatorState): void => {
      setCtx((prev) => ({ ...prev, state: externalState }));
    });
  }, []);

  const handleUpdateState = useCallback(
    (patch: Partial<SimulatorState>): void => {
      setCtx((prev) => {
        const nextState: SimulatorState = { ...prev.state, ...patch };
        void getSimulatorBridge().updateSimulatorState(nextState);
        if (activeWebContentsId !== null && shouldSyncEmulation(prev.state, nextState)) {
          void getSimulatorBridge().applyWebviewEmulation({
            webContentsId: activeWebContentsId,
            state: nextState
          });
        }
        return { ...prev, state: nextState };
      });
    },
    [activeWebContentsId]
  );

  const triggerReload = useCallback((): void => {
    setReloadTick((t) => t + 1);
  }, []);

  useSimulatorShortcuts(ctx.state, handleUpdateState, triggerReload);

  const handleOpenDevTools = useCallback((): void => {
    if (activeWebContentsId !== null) {
      void getSimulatorBridge().openWebviewDevTools(activeWebContentsId);
    }
  }, [activeWebContentsId]);

  const handleToggleDuoFold = useCallback((): void => {
    const nextId =
      ctx.state.selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED
        ? DeviceModelId.IPHONE_DUO_UNFOLDED
        : DeviceModelId.IPHONE_DUO_FOLDED;
    handleUpdateState({
      selectedDeviceId: nextId,
      orientation: Orientation.PORTRAIT
    });
  }, [ctx.state.selectedDeviceId, handleUpdateState]);

  return {
    ctx,
    reloadTick,
    triggerReload,
    setActiveWebContentsId,
    handleUpdateState,
    handleOpenDevTools,
    handleToggleDuoFold
  };
}

export function App(): React.ReactElement {
  const ctrl = useSimulatorController();
  const activePreset = getDevicePresetById(ctrl.ctx.state.selectedDeviceId);
  const metrics = computeViewportMetrics(
    activePreset,
    ctrl.ctx.state.orientation,
    ctrl.ctx.state.scale,
    ctrl.ctx.state.isFramed,
    ctrl.ctx.state.hudCollapsed
  );
  const scaledFrameWidth = Math.round(metrics.outerFrameWidth * ctrl.ctx.state.scale);

  return (
    <main className="simulator-root">
      <FloatingToolbar
        state={ctrl.ctx.state}
        presets={ctrl.ctx.presets}
        bookmarks={ctrl.ctx.bookmarks}
        activePreset={activePreset}
        targetWidthPx={scaledFrameWidth}
        onUpdateState={ctrl.handleUpdateState}
        onReload={ctrl.triggerReload}
        onOpenDevTools={ctrl.handleOpenDevTools}
        onMinimize={(): void => {
          void getSimulatorBridge().minimizeWindow();
        }}
        onClose={(): void => {
          void getSimulatorBridge().closeWindow();
        }}
      />
      <IphoneFrame
        preset={activePreset}
        metrics={metrics}
        state={ctrl.ctx.state}
        reloadTick={ctrl.reloadTick}
        onRegisterWebContentsId={ctrl.setActiveWebContentsId}
        onExpandHud={(): void => ctrl.handleUpdateState({ hudCollapsed: false })}
        onUpdateState={ctrl.handleUpdateState}
        onReload={ctrl.triggerReload}
        onToggleDuoFold={ctrl.handleToggleDuoFold}
        onSyncDuoDeviceByAngle={(targetId: DeviceModelId): void =>
          ctrl.handleUpdateState({ selectedDeviceId: targetId })
        }
      />
    </main>
  );
}
