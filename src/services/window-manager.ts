import { Result, WindowOperationError } from '../types/simulator.types';
import {
  NativeFloatingWindow,
  NativeWindowBounds,
  WindowResizeRequest,
  WindowStateSnapshot
} from '../types/window-manager.types';
import { logStructured } from '../utils/logger.util';
import { computeViewportMetrics } from '../utils/viewport-math.util';

// The initial workspace policy must be applied even if BrowserWindow was
// constructed at the requested floating level.
const appliedPin = new WeakMap<NativeFloatingWindow, boolean>();

export function workspaceWindowSize(width:number, height:number, area?:NativeWindowBounds): NativeWindowBounds {
  if(!area)return {width,height};
  return {
    width: Math.max(width, Math.min(width + 368, area.width - 16)),
    height: Math.max(height, Math.min(580, area.height - 16))
  };
}

export function applyDeviceWindowBounds(
  win: NativeFloatingWindow,
  request: WindowResizeRequest
): Result<WindowStateSnapshot, WindowOperationError> {
  if (win.isDestroyed()) {
    logStructured('error', 'window-manager.service', 'window_destroyed_on_resize', {
      deviceId: request.preset.id
    });
    return {
      ok: false,
      error: {
        kind: 'WINDOW_OPERATION_ERROR',
        operation: 'applyDeviceWindowBounds',
        message: 'Target floating window has already been destroyed',
        recoveryHint: 'Re-create the simulator window before resizing'
      }
    };
  }

  try {
    const metrics = computeViewportMetrics(
      request.preset,
      request.orientation,
      request.scale,
      request.isFramed,
      request.hudCollapsed ?? false
    );

    const {width:windowWidth,height:windowHeight} = workspaceWindowSize(
      metrics.scaledOuterWidth, metrics.scaledOuterHeight, request.agentWorkArea
    );
    const [width, height] = win.getSize();
    if (width !== windowWidth || height !== windowHeight) {
      win.setSize(windowWidth, windowHeight, request.animate ?? false);
      logStructured('info', 'window-manager.service', 'window_bounds_updated', {
        deviceId: request.preset.id,
        orientation: request.orientation,
        scale: request.scale,
        width: windowWidth,
        height: windowHeight
      });
    }

    return {
      ok: true,
      value: {
        width: windowWidth,
        height: windowHeight,
        alwaysOnTop: win.isAlwaysOnTop(),
        metrics
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resize floating window';
    logStructured('error', 'window-manager.service', 'window_resize_failed', {
      error: message
    });
    return {
      ok: false,
      error: {
        kind: 'WINDOW_OPERATION_ERROR',
        operation: 'applyDeviceWindowBounds',
        message,
        recoveryHint: 'Check window handle validity'
      }
    };
  }
}

export function setFloatingPin(
  win: NativeFloatingWindow,
  pinned: boolean
): Result<boolean, WindowOperationError> {
  if (win.isDestroyed()) {
    return {
      ok: false,
      error: {
        kind: 'WINDOW_OPERATION_ERROR',
        operation: 'setFloatingPin',
        message: 'Cannot change pin state on destroyed window',
        recoveryHint: 'Re-open the simulator window'
      }
    };
  }

  try {
    // Reapplying the Spaces policy can temporarily hide an Electron window on
    // macOS. A fold, navigation, or theme change should never move the window.
    if (appliedPin.get(win) === pinned && win.isAlwaysOnTop() === pinned) {
      return { ok: true, value: pinned };
    }
    win.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal');
    if (process.platform !== 'win32') {
      win.setVisibleOnAllWorkspaces(!pinned, { visibleOnFullScreen: !pinned });
    }

    appliedPin.set(win, pinned);
    logStructured('info', 'window-manager.service', 'floating_pin_changed', {
      alwaysOnTop: pinned
    });

    return { ok: true, value: pinned };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set alwaysOnTop';
    logStructured('error', 'window-manager.service', 'floating_pin_failed', {
      error: message
    });
    return {
      ok: false,
      error: {
        kind: 'WINDOW_OPERATION_ERROR',
        operation: 'setFloatingPin',
        message,
        recoveryHint: 'Verify window permissions'
      }
    };
  }
}

export function toggleFloatingWindowVisibility(
  win: NativeFloatingWindow
): Result<boolean, WindowOperationError> {
  if (win.isDestroyed()) {
    return {
      ok: false,
      error: {
        kind: 'WINDOW_OPERATION_ERROR',
        operation: 'toggleFloatingWindowVisibility',
        message: 'Cannot toggle visibility on destroyed window',
        recoveryHint: 'Re-open the simulator window'
      }
    };
  }

  if (process.platform === 'win32' && win.isMinimized?.()) {
    win.restore?.();
    win.show?.();
    win.focus?.();
    return { ok: true, value: true };
  }

  const currentlyVisible = win.isVisible ? win.isVisible() : true;
  if (currentlyVisible) {
    win.hide?.();
    logStructured('info', 'window-manager.service', 'window_hidden_to_menubar', {});
    return { ok: true, value: false };
  }

  win.show?.();
  win.focus?.();
  logStructured('info', 'window-manager.service', 'window_restored_from_menubar', {});
  return { ok: true, value: true };
}
