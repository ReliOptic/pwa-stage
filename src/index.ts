import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  Tray,
  webContents
} from 'electron';
import { getDevicePresetById } from './config/device-presets.config';
import { loadSimulatorEnvConfig } from './config/env.config';
import {
  handleApplyWebviewEmulation,
  handleGetInitialPayload,
  handleOpenWebviewDevTools,
  handleUpdateSimulatorState,
  stripFrameBlockingHeaders
} from './services/ipc-coordinator';
import {
  createMacMenuBarTray,
  MenuControllerContext,
  popUpTwoFingerMenu,
  readCurrentState
} from './services/menubar';
import {
  resolveRebootStaticRoot,
  startEmbeddedRebootServer
} from './services/reboot-server';
import {
  setFloatingPin,
  toggleFloatingWindowVisibility
} from './services/window-manager';
import { DeviceModelId } from './types/device.types';
import {
  ApplyWebviewEmulationPayload,
  CoordinatorDependencies,
  MoveWindowPayload
} from './types/ipc-coordinator.types';
import { SimulatorState } from './types/simulator.types';
import { logStructured } from './utils/logger.util';
import { clampSimulatorScale, computeViewportMetrics } from './utils/viewport-math.util';

let mainFloatingWindow: BrowserWindow | null = null;
let menuBarTray: Tray | null = null;
let isQuittingApp = false;

function buildCoordinatorDependencies(rebootServerUrl?: string): CoordinatorDependencies {
  const envOverrides = rebootServerUrl
    ? {
        ...process.env,
        SIMULATOR_DEFAULT_URL: process.env.SIMULATOR_DEFAULT_URL ?? rebootServerUrl,
        SIMULATOR_REBOOT_URL: rebootServerUrl,
        SIMULATOR_ALWAYS_ON_TOP: process.env.SIMULATOR_ALWAYS_ON_TOP ?? 'false',
        SIMULATOR_DEFAULT_SCALE: process.env.SIMULATOR_DEFAULT_SCALE ?? '0.85'
      }
    : undefined;
  const envResult = loadSimulatorEnvConfig(envOverrides);
  if (!envResult.ok) {
    throw new Error(envResult.error.message);
  }
  const envConfig = envResult.value;
  const storageFilePath = path.join(app.getPath('userData'), envConfig.appStorageFileName);

  return {
    envConfig,
    storageOptions: {
      storageFilePath,
      envConfig,
      fsAdapter: {
        existsSync: (targetPath: string): boolean => fs.existsSync(targetPath),
        readFileSync: (targetPath: string, encoding: 'utf-8'): string =>
          fs.readFileSync(targetPath, encoding),
        writeFileSync: (targetPath: string, content: string, encoding: 'utf-8'): void =>
          fs.writeFileSync(targetPath, content, encoding)
      }
    },
    getMainWindow: () => mainFloatingWindow,
    resolveWebContentsById: (id: number) => webContents.fromId(id) ?? null
  };
}

function keepWindowInWorkArea(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed() || typeof screen?.getDisplayMatching !== 'function') {
    return;
  }
  try {
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    let nextX = bounds.x;
    let nextY = bounds.y;
    if (nextX + bounds.width > area.x + area.width) {
      nextX = Math.max(area.x + 8, area.x + area.width - bounds.width - 8);
    }
    if (nextY + bounds.height > area.y + area.height) {
      nextY = Math.max(area.y + 8, area.y + area.height - bounds.height - 8);
    }
    if (nextX !== bounds.x || nextY !== bounds.y) {
      win.setPosition(nextX, nextY, true);
    }
  } catch {
    // Ignore screen query failures in headless test environments
  }
}

function registerIpcHandlers(ctx: MenuControllerContext): void {
  const { deps } = ctx;
  ipcMain.handle('simulator:get-initial-payload', () => handleGetInitialPayload(deps));
  ipcMain.handle('simulator:update-state', (_event, nextState: SimulatorState) => {
    const res = handleUpdateSimulatorState(deps, nextState);
    keepWindowInWorkArea(mainFloatingWindow);
    return res;
  });
  ipcMain.handle(
    'simulator:apply-webview-emulation',
    (_event, payload: ApplyWebviewEmulationPayload) => handleApplyWebviewEmulation(deps, payload)
  );
  ipcMain.handle('simulator:open-webview-devtools', (_event, webContentsId: number) =>
    handleOpenWebviewDevTools(deps, webContentsId)
  );
  ipcMain.handle('simulator:minimize-window', () => {
    mainFloatingWindow?.minimize();
    return { ok: true, value: true };
  });
  ipcMain.handle('simulator:close-window', () => {
    mainFloatingWindow?.hide();
    return { ok: true, value: true };
  });
  ipcMain.handle('simulator:show-two-finger-menu', () => {
    popUpTwoFingerMenu(ctx);
    return { ok: true, value: true };
  });
  ipcMain.handle('simulator:move-window', (_event, payload: MoveWindowPayload) => {
    if (mainFloatingWindow && !mainFloatingWindow.isDestroyed()) {
      mainFloatingWindow.setPosition(payload.x, payload.y);
      return { ok: true, value: true };
    }
    return { ok: false, value: false };
  });
}

export function createFloatingSimulatorWindow(ctx: MenuControllerContext): BrowserWindow {
  const state = readCurrentState(ctx.deps);
  const preset = getDevicePresetById(state.selectedDeviceId ?? DeviceModelId.IPHONE_17_PRO);
  const metrics = computeViewportMetrics(
    preset,
    state.orientation,
    state.scale,
    state.isFramed,
    state.hudCollapsed
  );

  const area = screen.getPrimaryDisplay().workArea;
  const initialX = Math.max(
    area.x + 24,
    area.x + area.width - metrics.scaledOuterWidth - 36
  );
  const initialY = Math.max(
    area.y + 20,
    area.y + Math.round((area.height - metrics.scaledOuterHeight) / 2)
  );

  const win = new BrowserWindow({
    x: initialX,
    y: initialY,
    width: metrics.scaledOuterWidth,
    height: metrics.scaledOuterHeight,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: state.alwaysOnTop,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  setFloatingPin(win, state.alwaysOnTop);
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) {
      return;
    }
    const latest = readCurrentState(ctx.deps);
    setFloatingPin(win, latest.alwaysOnTop);
    if (latest.alwaysOnTop) {
      win.show();
      win.focus();
    } else {
      win.showInactive();
    }
  });

  win.on('will-resize', (event, newBounds) => {
    event.preventDefault();
    const current = readCurrentState(ctx.deps);
    const activePreset = getDevicePresetById(current.selectedDeviceId);
    const baseMetrics = computeViewportMetrics(
      activePreset,
      current.orientation,
      1.0,
      current.isFramed,
      current.hudCollapsed
    );
    const chromeOverheadH = baseMetrics.scaledOuterHeight - baseMetrics.outerFrameHeight;
    const chromeOverheadW = baseMetrics.scaledOuterWidth - baseMetrics.outerFrameWidth;
    const scaleByH = (newBounds.height - chromeOverheadH) / baseMetrics.outerFrameHeight;
    const scaleByW = (newBounds.width - chromeOverheadW) / baseMetrics.outerFrameWidth;
    const nextScale = clampSimulatorScale((scaleByH + scaleByW) / 2);
    if (nextScale === current.scale) {
      return;
    }
    const nextState: SimulatorState = { ...current, scale: nextScale };
    handleUpdateSimulatorState(ctx.deps, nextState);
    if (!win.isDestroyed()) {
      win.webContents.send('simulator:external-state', nextState);
    }
  });

  win.on('close', (e) => {
    if (!isQuittingApp) {
      e.preventDefault();
      win.hide();
    }
  });

  const targetEntry =
    ctx.deps.envConfig.devServerUrl ?? path.join(__dirname, '../dist/index.html');
  if (ctx.deps.envConfig.devServerUrl) {
    void win.loadURL(targetEntry);
  } else {
    void win.loadFile(targetEntry);
  }
  logStructured('info', 'main.entry', 'floating_window_created', {
    width: metrics.scaledOuterWidth,
    height: metrics.scaledOuterHeight
  });
  return win;
}

export function bootstrapElectronApp(): void {
  app.on('before-quit', () => {
    isQuittingApp = true;
  });

  void app.whenReady().then(async () => {
    const rebootRoot = resolveRebootStaticRoot(__dirname, process.resourcesPath);
    const rebootServerUrl = await startEmbeddedRebootServer(rebootRoot, 18765);
    const deps = buildCoordinatorDependencies(rebootServerUrl);
    const ctx: MenuControllerContext = {
      deps,
      getWindow: () => mainFloatingWindow,
      onQuitApp: (): void => {
        isQuittingApp = true;
        app.quit();
      }
    };

    app.on('web-contents-created', (_event, contents) => {
      contents.on('context-menu', (e) => {
        e.preventDefault();
        popUpTwoFingerMenu(ctx);
      });
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = stripFrameBlockingHeaders(
        details.responseHeaders as Readonly<Record<string, readonly string[] | string>> | undefined
      );
      callback({ cancel: false, responseHeaders });
    });

    registerIpcHandlers(ctx);
    mainFloatingWindow = createFloatingSimulatorWindow(ctx);
    menuBarTray = createMacMenuBarTray(ctx);
    void menuBarTray;

    globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (mainFloatingWindow) {
        toggleFloatingWindowVisibility(mainFloatingWindow);
      }
    });
  });
}

if (typeof app !== 'undefined' && typeof app.whenReady === 'function') {
  bootstrapElectronApp();
}
