import { ComputedViewportMetrics, DevicePreset, Orientation } from './device.types';
import { Result, WindowOperationError } from './simulator.types';

export interface NativeWindowBounds {
  readonly width: number;
  readonly height: number;
}

export interface NativeFloatingWindow {
  readonly isDestroyed: () => boolean;
  readonly isVisible?: () => boolean;
  readonly show?: () => void;
  readonly hide?: () => void;
  readonly focus?: () => void;
  readonly setSize: (width: number, height: number, animate?: boolean) => void;
  readonly getSize: () => readonly number[];
  readonly setAlwaysOnTop: (flag: boolean, level?: 'floating' | 'screen-saver' | 'normal') => void;
  readonly isAlwaysOnTop: () => boolean;
  readonly setVisibleOnAllWorkspaces: (visible: boolean, options?: { visibleOnFullScreen?: boolean }) => void;
  readonly isMinimized?: () => boolean;
  readonly restore?: () => void;
  readonly minimize: () => void;
  readonly close: () => void;
}

export interface WindowResizeRequest {
  readonly preset: DevicePreset;
  readonly orientation: Orientation;
  readonly scale: number;
  readonly isFramed: boolean;
  readonly hudCollapsed?: boolean;
  readonly animate?: boolean;
  readonly agentWorkArea?: NativeWindowBounds;
}

export interface WindowStateSnapshot {
  readonly width: number;
  readonly height: number;
  readonly alwaysOnTop: boolean;
  readonly metrics: ComputedViewportMetrics;
}

export interface WindowManagerService {
  readonly applyDeviceWindowBounds: (
    win: NativeFloatingWindow,
    request: WindowResizeRequest
  ) => Result<WindowStateSnapshot, WindowOperationError>;
  readonly setFloatingPin: (
    win: NativeFloatingWindow,
    pinned: boolean
  ) => Result<boolean, WindowOperationError>;
}
