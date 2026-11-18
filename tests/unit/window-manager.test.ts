import { describe, expect, it, vi } from 'vitest';
import { getDevicePresetById } from '../../src/config/device-presets.config';
import {
  applyDeviceWindowBounds,
  setFloatingPin,
  toggleFloatingWindowVisibility
} from '../../src/services/window-manager';
import { DeviceModelId, Orientation } from '../../src/types/device.types';
import { NativeFloatingWindow } from '../../src/types/window-manager.types';

function createMockWindow(destroyed = false): NativeFloatingWindow {
  let alwaysOnTop = true;
  let visible = true;
  let size: readonly [number, number] = [400, 800];
  return {
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    show: vi.fn(() => {
      visible = true;
    }),
    hide: vi.fn(() => {
      visible = false;
    }),
    focus: vi.fn(),
    setSize: vi.fn((w: number, h: number) => {
      size = [w, h];
    }),
    getSize: () => size,
    setAlwaysOnTop: vi.fn((flag: boolean) => {
      alwaysOnTop = flag;
    }),
    isAlwaysOnTop: () => alwaysOnTop,
    setVisibleOnAllWorkspaces: vi.fn(),
    minimize: vi.fn(),
    close: vi.fn()
  };
}

describe('window-manager service', () => {
  it('does not resize or reapply Spaces when the Duo hands off between displays', () => {
    const win = createMockWindow();
    for (const id of [DeviceModelId.IPHONE_DUO_FOLDED, DeviceModelId.IPHONE_DUO_UNFOLDED]) {
      applyDeviceWindowBounds(win, {
        preset: getDevicePresetById(id), orientation: Orientation.PORTRAIT, scale: 0.85, isFramed: true
      });
      setFloatingPin(win, true);
    }
    expect(win.setSize).toHaveBeenCalledTimes(1);
    expect(win.setAlwaysOnTop).toHaveBeenCalledTimes(1);
  });
  it('resizes floating window when switching from iPhone 17 to iPhone Duo Unfolded', () => {
    const win = createMockWindow(false);
    const duoPreset = getDevicePresetById(DeviceModelId.IPHONE_DUO_UNFOLDED);

    const res = applyDeviceWindowBounds(win, {
      preset: duoPreset,
      orientation: Orientation.PORTRAIT,
      scale: 1.0,
      isFramed: true,
      animate: true
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.isDualUnfolded).toBe(true);
      expect(res.value.width).toBe(1007);
      expect(win.setSize).toHaveBeenCalledWith(res.value.width, res.value.height, true);
    }
  });

  it('returns typed error when resizing a destroyed window', () => {
    const win = createMockWindow(true);
    const preset = getDevicePresetById(DeviceModelId.IPHONE_17);

    const res = applyDeviceWindowBounds(win, {
      preset,
      orientation: Orientation.PORTRAIT,
      scale: 0.85,
      isFramed: true
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('WINDOW_OPERATION_ERROR');
    }
  });

  it('toggles macOS floating pin and workspace visibility', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const win = createMockWindow(false);
    const pinnedRes = setFloatingPin(win, true);
    expect(pinnedRes.ok).toBe(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(false, { visibleOnFullScreen: false });

    const unpinnedRes = setFloatingPin(win, false);
    expect(unpinnedRes.ok).toBe(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false, 'normal');

    platform.mockRestore();
    const hideRes = toggleFloatingWindowVisibility(win);
    expect(hideRes.ok).toBe(true);
    if (hideRes.ok) {
      expect(hideRes.value).toBe(false);
    }

    const showRes = toggleFloatingWindowVisibility(win);
    expect(showRes.ok).toBe(true);
    if (showRes.ok) {
      expect(showRes.value).toBe(true);
    }
  });
});

describe('host platform pinning', () => {
  it.each(['win32', 'darwin', 'linux'])('applies native pin semantics on %s', (platform) => {
    const mock = vi.spyOn(process, 'platform', 'get').mockReturnValue(platform as NodeJS.Platform);
    try {
      const win = createMockWindow();
      expect(setFloatingPin(win, true).ok).toBe(true);
      expect(setFloatingPin(win, false).ok).toBe(true);
      expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false, 'normal');
      if (platform === 'win32') expect(win.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
      else expect(win.setVisibleOnAllWorkspaces).toHaveBeenLastCalledWith(true, { visibleOnFullScreen: true });
    } finally { mock.mockRestore(); }
  });
});

describe('Windows taskbar restore', () => {
  it('restores a minimized window when invoked from the tray', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    try {
      const restore = vi.fn();
      const win = { ...createMockWindow(), isMinimized: () => true, restore };
      expect(toggleFloatingWindowVisibility(win)).toEqual({ ok: true, value: true });
      expect(restore).toHaveBeenCalledOnce();
      expect(win.focus).toHaveBeenCalledOnce();
      expect(win.hide).not.toHaveBeenCalled();
    } finally { platform.mockRestore(); }
  });
});
