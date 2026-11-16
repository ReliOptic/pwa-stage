import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import { DEVICE_PRESETS } from '../config/device-presets.config';
import { DeviceModelId, Orientation } from '../types/device.types';
import { CoordinatorDependencies } from '../types/ipc-coordinator.types';
import { BrowserShellMode, SimulatorState } from '../types/simulator.types';
import { handleUpdateSimulatorState } from './ipc-coordinator';
import { createDefaultSimulatorState, loadSimulatorState } from './storage';
import { toggleFloatingWindowVisibility } from './window-manager';

export interface MenuControllerContext {
  readonly deps: CoordinatorDependencies;
  readonly getWindow: () => BrowserWindow | null;
  readonly onQuitApp: () => void;
}

export function readCurrentState(deps: CoordinatorDependencies): SimulatorState {
  const loaded = loadSimulatorState(deps.storageOptions);
  return loaded.ok ? loaded.value : createDefaultSimulatorState(deps.envConfig);
}

export function applyStatePatchFromMenu(
  ctx: MenuControllerContext,
  patch: Partial<SimulatorState>
): void {
  const current = readCurrentState(ctx.deps);
  const nextState: SimulatorState = { ...current, ...patch };
  handleUpdateSimulatorState(ctx.deps, nextState);
  const win = ctx.getWindow();
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    win.webContents.send('simulator:external-state', nextState);
  }
}

export function buildQuickActionMenu(ctx: MenuControllerContext): Menu {
  const state = readCurrentState(ctx.deps);
  const win = ctx.getWindow();
  const visible = win?.isVisible() ?? false;
  const isDuoFolded = state.selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED;
  const isDuoUnfolded = state.selectedDeviceId === DeviceModelId.IPHONE_DUO_UNFOLDED;
  const nextOrient =
    state.orientation === Orientation.PORTRAIT ? Orientation.LANDSCAPE : Orientation.PORTRAIT;

  return Menu.buildFromTemplate([
    {
      label: `Float on All Spaces (${state.alwaysOnTop ? 'ON' : 'OFF — This Space'})`,
      type: 'checkbox',
      checked: state.alwaysOnTop,
      accelerator: 'CommandOrControl+T',
      click: (): void => applyStatePatchFromMenu(ctx, { alwaysOnTop: !state.alwaysOnTop })
    },
    {
      label: 'Swipe Mode',
      submenu: [
        {
          label: 'Drag (Click & Drag)',
          type: 'radio',
          checked: !state.touchCursorEnabled,
          click: (): void => applyStatePatchFromMenu(ctx, { touchCursorEnabled: false })
        },
        {
          label: 'Hover (Cursor / Trackpad)',
          type: 'radio',
          checked: state.touchCursorEnabled,
          click: (): void => applyStatePatchFromMenu(ctx, { touchCursorEnabled: true })
        }
      ]
    },
    {
      label: state.hudCollapsed ? 'Show Toolbar (⌘B)' : 'Hide Toolbar (⌘B)',
      accelerator: 'CommandOrControl+B',
      click: (): void => applyStatePatchFromMenu(ctx, { hudCollapsed: !state.hudCollapsed })
    },
    { type: 'separator' },
    {
      label: 'Minimize to Dock',
      accelerator: 'CommandOrControl+M',
      click: (): void => {
        win?.minimize();
      }
    },
    {
      label: visible ? 'Hide to Menu Bar (⌘⇧S)' : 'Show Simulator (⌘⇧S)',
      accelerator: 'CommandOrControl+Shift+S',
      click: (): void => {
        if (win) {
          toggleFloatingWindowVisibility(win);
        }
      }
    },
    {
      label: 'Quit Simulator',
      accelerator: 'CommandOrControl+Q',
      click: (): void => {
        ctx.onQuitApp();
      }
    },
    { type: 'separator' },
    ...(isDuoFolded || isDuoUnfolded
      ? [
          {
            label: isDuoFolded
              ? 'Unfold iPhone Duo (Inner Display)'
              : 'Fold iPhone Duo (Outer Display)',
            click: (): void =>
              applyStatePatchFromMenu(ctx, {
                selectedDeviceId: isDuoFolded
                  ? DeviceModelId.IPHONE_DUO_UNFOLDED
                  : DeviceModelId.IPHONE_DUO_FOLDED,
                orientation: Orientation.PORTRAIT
              })
          },
          { type: 'separator' as const }
        ]
      : []),
    {
      label: `Rotate (${state.orientation === Orientation.PORTRAIT ? 'Landscape' : 'Portrait'})`,
      click: (): void => applyStatePatchFromMenu(ctx, { orientation: nextOrient })
    },
    {
      label: 'Browser Shell Mode',
      submenu: [
        {
          label: 'PWA Standalone (Full Screen)',
          type: 'radio',
          checked: state.shellMode === BrowserShellMode.PWA_STANDALONE,
          click: (): void => applyStatePatchFromMenu(ctx, { shellMode: BrowserShellMode.PWA_STANDALONE })
        },
        {
          label: 'iOS Safari (Bottom Address Bar)',
          type: 'radio',
          checked: state.shellMode === BrowserShellMode.IOS_SAFARI,
          click: (): void => applyStatePatchFromMenu(ctx, { shellMode: BrowserShellMode.IOS_SAFARI })
        },
        {
          label: 'iOS Chrome (Top Omnibox)',
          type: 'radio',
          checked: state.shellMode === BrowserShellMode.IOS_CHROME,
          click: (): void => applyStatePatchFromMenu(ctx, { shellMode: BrowserShellMode.IOS_CHROME })
        }
      ]
    },
    {
      label: `Scale (${Math.round(state.scale * 100)}%)`,
      submenu: [0.65, 0.75, 0.85, 0.92, 1.0, 1.15].map((sc) => ({
        label: `${Math.round(sc * 100)}%`,
        type: 'radio' as const,
        checked: Math.abs(state.scale - sc) < 0.02,
        click: (): void => applyStatePatchFromMenu(ctx, { scale: sc })
      }))
    },
    { type: 'separator' },
    ...ctx.deps.envConfig.quickBookmarks.map((bm) => ({
      label: `Target: ${bm.label}`,
      type: 'radio' as const,
      checked: state.currentUrl === bm.url,
      click: (): void => applyStatePatchFromMenu(ctx, { currentUrl: bm.url })
    })),
    { type: 'separator' },
    ...DEVICE_PRESETS.map((preset) => ({
      label: `${preset.name} (${preset.width}×${preset.height})`,
      type: 'radio' as const,
      checked: state.selectedDeviceId === preset.id,
      click: (): void =>
        applyStatePatchFromMenu(ctx, { selectedDeviceId: preset.id })
    }))
  ]);
}

export function popUpTwoFingerMenu(ctx: MenuControllerContext): void {
  const win = ctx.getWindow();
  if (!win || win.isDestroyed()) {
    return;
  }
  const menu = buildQuickActionMenu(ctx);
  menu.popup({ window: win });
}

export function createMacMenuBarTray(ctx: MenuControllerContext): Tray {
  const candidates = [
    path.join(app.getAppPath(), 'public/assets/ios27/menubar-iconTemplate.png'),
    path.join(app.getAppPath(), 'dist/assets/ios27/menubar-iconTemplate.png')
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  const icon = found ? nativeImage.createFromPath(found) : nativeImage.createEmpty();
  icon.setTemplateImage(true);

  const tray = new Tray(icon);
  tray.setTitle(' iPhone');
  tray.setToolTip('iPhone PWA Simulator — Click to Show/Hide (⌘⇧S)');

  tray.on('click', () => {
    const win = ctx.getWindow();
    if (win) {
      toggleFloatingWindowVisibility(win);
    }
  });
  tray.on('right-click', () => {
    tray.popUpContextMenu(buildQuickActionMenu(ctx));
  });
  return tray;
}
