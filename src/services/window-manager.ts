import { Result, WindowOperationError } from '../types/simulator.types';
import {
  NativeFloatingWindow,
  WindowResizeRequest,
  WindowStateSnapshot
} from '../types/window-manager.types';
import { logStructured } from '../utils/logger.util';
import { computeViewportMetrics } from '../utils/viewport-math.util';

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

    win.setSize(
      metrics.scaledOuterWidth,
      metrics.scaledOuterHeight,
      request.animate ?? false
    );

    logStructured('info', 'window-manager.service', 'window_bounds_updated', {
      deviceId: request.preset.id,
      orientation: request.orientation,
      scale: request.scale,
      width: metrics.scaledOuterWidth,
      height: metrics.scaledOuterHeight
    });

    return {
      ok: true,
      value: {
        width: metrics.scaledOuterWidth,
        height: metrics.scaledOuterHeight,
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
    win.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal');
    win.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });

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
        recoveryHint: 'Verify macOS window permissions'
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
