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
      label: `항상 위에 고정 (Always on Top: ${state.alwaysOnTop ? 'ON' : 'OFF'})`,
      type: 'checkbox',
      checked: state.alwaysOnTop,
      accelerator: 'CommandOrControl+T',
      click: (): void => applyStatePatchFromMenu(ctx, { alwaysOnTop: !state.alwaysOnTop })
    },
    {
      label: '화면 내 스와이프 방식 (Swipe Experience)',
      submenu: [
        {
          label: '눌러서 스와이프 (클릭 & 드래그)',
          type: 'radio',
          checked: !state.touchCursorEnabled,
          click: (): void => applyStatePatchFromMenu(ctx, { touchCursorEnabled: false })
        },
        {
          label: '바로 스와이프 (클릭 없이 커서 이동 / 트랙패드)',
          type: 'radio',
          checked: state.touchCursorEnabled,
          click: (): void => applyStatePatchFromMenu(ctx, { touchCursorEnabled: true })
        }
      ]
    },
    {
      label: state.hudCollapsed ? '상단 컨트롤 바 열기 (⌘B)' : '상단 컨트롤 바 숨기기 (⌘B)',
      accelerator: 'CommandOrControl+B',
      click: (): void => applyStatePatchFromMenu(ctx, { hudCollapsed: !state.hudCollapsed })
    },
    { type: 'separator' },
    {
      label: '최소화 (Dock으로 내리기)',
      accelerator: 'CommandOrControl+M',
      click: (): void => {
        win?.minimize();
      }
    },
    {
      label: visible ? '맥북 상단바로 숨기기 (⌘⇧S)' : '시뮬레이터 화면 보이기 (⌘⇧S)',
      accelerator: 'CommandOrControl+Shift+S',
      click: (): void => {
        if (win) {
          toggleFloatingWindowVisibility(win);
        }
      }
    },
    {
      label: '닫기 (시뮬레이터 종료)',
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
              ? 'iPhone Duo 안으로 펼치기 (Open Inner Display)'
              : 'iPhone Duo 밖으로 접기 (Close to Outer Display)',
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
      label: `화면 회전 (${state.orientation === Orientation.PORTRAIT ? '가로 모드' : '세로 모드'})`,
      click: (): void => applyStatePatchFromMenu(ctx, { orientation: nextOrient })
    },
    {
      label: '브라우저 셸 모드 (Shell Mode)',
      submenu: [
        {
          label: 'PWA Standalone (전체 화면)',
          type: 'radio',
          checked: state.shellMode === BrowserShellMode.PWA_STANDALONE,
          click: (): void => applyStatePatchFromMenu(ctx, { shellMode: BrowserShellMode.PWA_STANDALONE })
        },
        {
          label: 'iOS Safari (하단 주소창)',
          type: 'radio',
          checked: state.shellMode === BrowserShellMode.IOS_SAFARI,
          click: (): void => applyStatePatchFromMenu(ctx, { shellMode: BrowserShellMode.IOS_SAFARI })
        },
        {
          label: 'iOS Chrome (상단 주소창)',
          type: 'radio',
          checked: state.shellMode === BrowserShellMode.IOS_CHROME,
          click: (): void => applyStatePatchFromMenu(ctx, { shellMode: BrowserShellMode.IOS_CHROME })
        }
      ]
    },
    {
      label: `화면 배율 (${Math.round(state.scale * 100)}%)`,
      submenu: [0.65, 0.75, 0.85, 0.92, 1.0, 1.15].map((sc) => ({
        label: `${Math.round(sc * 100)}%`,
        type: 'radio' as const,
        checked: Math.abs(state.scale - sc) < 0.02,
        click: (): void => applyStatePatchFromMenu(ctx, { scale: sc })
      }))
    },
    { type: 'separator' },
    ...ctx.deps.envConfig.quickBookmarks.map((bm) => ({
      label: `화면 대상: ${bm.label}`,
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
  tray.setToolTip('iPhone PWA Simulator — 클릭하여 숨기기/보이기 (⌘⇧S)');

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
