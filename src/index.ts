import { execFile } from 'node:child_process';
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
  handleUpdateSimulatorState
} from './services/ipc-coordinator';
import {
  GuestPermissionStore,
  installGuestPermissionPrompts,
  installNavigationGuards,
  isFiniteWindowPoint,
  isGuestOfShell,
  isSameShellUrl,
  isTrustedShellSender
} from './services/security';
import { createDefaultSimulatorState, mergeStoredStateWithDefaults } from './services/storage';
import { forgetEmulationTarget } from './services/emulation';
import {
  clampMirrorFps,
  forwardGuestPointerEvent,
  sanitizeGuestPointerEvent,
  startGuestMirror,
  stopGuestMirror
} from './services/guest-mirror';
import {
  evaluatePwaChecks,
  PAGE_INSPECTION_EXPRESSION,
  resolveHomeScreenIdentity,
  sanitizePageInspection
} from './services/page-inspector';
import {
  createMenuBarTray,
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
  CoordinatorDependencies
} from './types/ipc-coordinator.types';
import { SimulatorState } from './types/simulator.types';
import { logStructured } from './utils/logger.util';
import {
  clampSimulatorScale,
  computeReasonableDesktopScale,
  computeViewportMetrics
} from './utils/viewport-math.util';

let mainFloatingWindow: BrowserWindow | null = null;
let menuBarTray: Tray | null = null;
let isQuittingApp = false;

function buildCoordinatorDependencies(rebootServerUrl?: string): CoordinatorDependencies {
  const envOverrides = rebootServerUrl
    ? {
        ...process.env,
        SIMULATOR_DEFAULT_URL: process.env.SIMULATOR_DEFAULT_URL ?? rebootServerUrl,
        SIMULATOR_REBOOT_URL: rebootServerUrl,
        SIMULATOR_ALWAYS_ON_TOP: process.env.SIMULATOR_ALWAYS_ON_TOP ?? 'true',
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

type TrustedHandler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const UNTRUSTED_SENDER_RESULT = {
  ok: false,
  error: {
    kind: 'WINDOW_OPERATION_ERROR',
    operation: 'ipc',
    message: 'IPC sender is not the simulator shell',
    recoveryHint: 'Only the simulator UI may call this channel'
  }
} as const;

/** Registers an IPC handler that only answers the simulator shell's top frame. */
function handleTrusted(channel: string, handler: TrustedHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedShellSender(event, mainFloatingWindow)) {
      logStructured('warn', 'main.entry', 'ipc_untrusted_sender_rejected', { channel });
      return UNTRUSTED_SENDER_RESULT;
    }
    return handler(event, ...args);
  });
}

function sanitizeIncomingState(ctx: MenuControllerContext, raw: unknown): SimulatorState {
  const defaults = createDefaultSimulatorState(ctx.deps.envConfig);
  const parsed = typeof raw === 'object' && raw !== null ? (raw as Partial<SimulatorState>) : {};
  return mergeStoredStateWithDefaults(parsed, defaults);
}

function resolveGuestId(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return null;
  }
  const target = webContents.fromId(raw);
  return isGuestOfShell(target, mainFloatingWindow) ? raw : null;
}

const GUEST_ID_REJECTED = {
  ok: false,
  error: {
    kind: 'EMULATION_FAILURE_ERROR',
    operation: 'ipc',
    message: 'webContentsId is not a webview guest of the simulator shell',
    recoveryHint: 'Wait for the webview dom-ready event'
  }
} as const;

function registerIpcHandlers(ctx: MenuControllerContext): void {
  const { deps } = ctx;
  handleTrusted('simulator:get-initial-payload', () => handleGetInitialPayload(deps));
  handleTrusted('simulator:update-state', (_event, rawState) => {
    const res = handleUpdateSimulatorState(deps, sanitizeIncomingState(ctx, rawState));
    keepWindowInWorkArea(mainFloatingWindow);
    return res;
  });
  handleTrusted('simulator:apply-webview-emulation', (_event, rawPayload) => {
    const payload = (rawPayload ?? {}) as Partial<ApplyWebviewEmulationPayload>;
    const id = resolveGuestId(payload.webContentsId);
    if (id === null) {
      return GUEST_ID_REJECTED;
    }
    return handleApplyWebviewEmulation(deps, {
      webContentsId: id,
      state: sanitizeIncomingState(ctx, payload.state)
    });
  });
  handleTrusted('simulator:open-webview-devtools', (_event, rawId) => {
    const id = resolveGuestId(rawId);
    return id === null ? GUEST_ID_REJECTED : handleOpenWebviewDevTools(deps, id);
  });
  handleTrusted('simulator:minimize-window', () => {
    mainFloatingWindow?.minimize();
    return { ok: true, value: true };
  });
  handleTrusted('simulator:close-window', () => {
    mainFloatingWindow?.hide();
    return { ok: true, value: true };
  });
  handleTrusted('simulator:show-two-finger-menu', () => {
    popUpTwoFingerMenu(ctx);
    return { ok: true, value: true };
  });
  handleTrusted('simulator:move-window', (_event, payload) => {
    if (!isFiniteWindowPoint(payload)) {
      return { ok: false, value: false };
    }
    if (mainFloatingWindow && !mainFloatingWindow.isDestroyed()) {
      mainFloatingWindow.setPosition(Math.round(payload.x), Math.round(payload.y));
      return { ok: true, value: true };
    }
    return { ok: false, value: false };
  });
  handleTrusted('simulator:inspect-page', async (_event, rawId) => {
    const id = resolveGuestId(rawId);
    if (id === null) {
      return GUEST_ID_REJECTED;
    }
    return inspectGuestPage(id);
  });
  handleTrusted('simulator:capture-screenshot', async (_event, rawRect, rawName) => {
    return captureScreenScreenshot(rawRect, rawName);
  });
  handleTrusted('simulator:guest-mirror', (_event, rawId, rawOn, rawFps) => {
    const id = resolveGuestId(rawId);
    if (id === null) {
      return GUEST_ID_REJECTED;
    }
    const guest = webContents.fromId(id);
    if (rawOn === true && guest) {
      startGuestMirror(guest, (frame) => {
        const win = mainFloatingWindow;
        if (win && !win.isDestroyed()) {
          win.webContents.send('simulator:guest-frame', frame);
        }
      }, clampMirrorFps(rawFps));
    } else {
      stopGuestMirror(id);
    }
    return { ok: true, value: true };
  });
  handleTrusted('simulator:guest-input', (_event, rawId, rawEvent) => {
    const id = resolveGuestId(rawId);
    const pointer = sanitizeGuestPointerEvent(rawEvent);
    const guest = id === null ? undefined : webContents.fromId(id);
    if (!guest || !pointer) {
      return { ok: false, value: false };
    }
    forwardGuestPointerEvent(guest, pointer);
    return { ok: true, value: true };
  });
  handleTrusted('simulator:permission-response', (_event, rawId, rawGranted) => {
    if (typeof rawId === 'string') {
      resolvePermissionPrompt(rawId, rawGranted === true);
    }
    return { ok: true, value: true };
  });
}

// --- PWA inspection & screenshots -----------------------------------------
async function inspectGuestPage(id: number): Promise<unknown> {
  const guest = webContents.fromId(id);
  if (!guest || guest.isDestroyed()) {
    return GUEST_ID_REJECTED;
  }
  try {
    if (!guest.debugger.isAttached()) {
      guest.debugger.attach('1.3');
    }
    const res = (await guest.debugger.sendCommand('Runtime.evaluate', {
      expression: PAGE_INSPECTION_EXPRESSION,
      awaitPromise: true,
      returnByValue: true,
      timeout: 8000
    })) as { result?: { value?: unknown } };
    const inspection = sanitizePageInspection(res.result?.value);
    if (!inspection) {
      return { ok: false, error: { kind: 'EMULATION_FAILURE_ERROR', operation: 'inspect', message: 'Page returned no inspectable data', recoveryHint: 'Wait for the page to finish loading' } };
    }
    return {
      ok: true,
      value: {
        inspection,
        checks: evaluatePwaChecks(inspection),
        identity: resolveHomeScreenIdentity(inspection)
      }
    };
  } catch (err) {
    return { ok: false, error: { kind: 'EMULATION_FAILURE_ERROR', operation: 'inspect', message: err instanceof Error ? err.message : 'inspect failed', recoveryHint: 'Reload the page' } };
  }
}

function sanitizeFileToken(raw: unknown): string {
  return (typeof raw === 'string' ? raw : 'iPhone').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 60) || 'iPhone';
}

/** Xcode-style "Simulator Screenshot - <device> - <date> at <time>.png" on the Desktop. */
async function captureScreenScreenshot(rawRect: unknown, rawName: unknown): Promise<unknown> {
  const win = mainFloatingWindow;
  if (!win || win.isDestroyed()) {
    return { ok: false, value: null };
  }
  const r = (rawRect ?? {}) as Record<string, unknown>;
  const nums = ['x', 'y', 'width', 'height'].map((k) => r[k]);
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 20000)) {
    return { ok: false, value: null };
  }
  const [x, y, width, height] = (nums as number[]).map((n) => Math.round(n));
  if (width < 10 || height < 10) {
    return { ok: false, value: null };
  }
  const image = await win.webContents.capturePage({ x, y, width, height });
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  const fileName = `Simulator Screenshot - ${sanitizeFileToken(rawName)} - ${stamp}.png`;
  const target = path.join(app.getPath('desktop'), fileName);
  fs.writeFileSync(target, image.toPNG());
  logStructured('info', 'main.entry', 'screenshot_saved', { target });
  return { ok: true, value: fileName };
}

// --- iOS-style permission alerts rendered inside the simulated screen -------
const pendingPermissionPrompts = new Map<string, (granted: boolean) => void>();
let permissionPromptSeq = 0;

function resolvePermissionPrompt(id: string, granted: boolean): void {
  const resolve = pendingPermissionPrompts.get(id);
  if (resolve) {
    pendingPermissionPrompts.delete(id);
    resolve(granted);
  }
}

function askPermissionInShell(origin: string, message: string): Promise<boolean> {
  const win = mainFloatingWindow;
  if (!win || win.isDestroyed()) {
    return Promise.resolve(false);
  }
  permissionPromptSeq += 1;
  const id = `perm-${permissionPromptSeq}`;
  return new Promise<boolean>((resolve) => {
    pendingPermissionPrompts.set(id, resolve);
    win.webContents.send('simulator:permission-prompt', { id, origin, message });
    // Unanswered prompts are denied, never silently granted.
    setTimeout(() => resolvePermissionPrompt(id, false), 60_000);
  });
}

function getBundleIdForAsn(asn: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('lsappinfo', ['info', '-only', 'bundleid', asn], (err, out) => {
      if (err) {
        resolve(null);
        return;
      }
      const match = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(out);
      resolve(match ? match[1] : null);
    });
  });
}

function getTopmostOtherAppBundleId(): Promise<string | null> {
  const selfBundleIds = new Set(['com.reliqbit.iphone-pwa-simulator', 'com.github.Electron']);
  return new Promise((resolve) => {
    execFile('lsappinfo', ['visibleProcessList'], async (err, stdout) => {
      if (!err && stdout.trim()) {
        const asns = Array.from(stdout.matchAll(/ASN:0x[0-9a-fA-F-]+(?=-)/g)).map((m) => m[0]);
        for (const asn of asns) {
          const bundleId = await getBundleIdForAsn(asn);
          if (bundleId && !selfBundleIds.has(bundleId)) {
            resolve(bundleId);
            return;
          }
        }
      }
      execFile('lsappinfo', ['front'], async (err2, frontOut) => {
        if (err2 || !frontOut.trim()) {
          resolve(null);
          return;
        }
        const bundleId = await getBundleIdForAsn(frontOut.trim());
        resolve(bundleId && !selfBundleIds.has(bundleId) ? bundleId : null);
      });
    });
  });
}

let capturedLaunchFrontBundleIdPromise: Promise<string | null> | null = null;

export function createFloatingSimulatorWindow(ctx: MenuControllerContext): BrowserWindow {
  const loadedState = readCurrentState(ctx.deps);
  const preset = getDevicePresetById(loadedState.selectedDeviceId ?? DeviceModelId.IPHONE_17_PRO);
  const area = screen.getPrimaryDisplay().workArea;
  const reasonableScale = computeReasonableDesktopScale(
    preset,
    loadedState.orientation,
    loadedState.scale,
    loadedState.isFramed,
    loadedState.hudCollapsed ?? false,
    area.width,
    area.height
  );
  const state: SimulatorState =
    reasonableScale !== loadedState.scale
      ? { ...loadedState, scale: reasonableScale }
      : loadedState;
  if (reasonableScale !== loadedState.scale) {
    handleUpdateSimulatorState(ctx.deps, state);
  }

  const metrics = computeViewportMetrics(
    preset,
    state.orientation,
    state.scale,
    state.isFramed,
    state.hudCollapsed
  );

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
    // Custom corner grips resize programmatically; native resizing breaks Windows transparency.
    resizable: process.platform !== 'win32',
    ...(process.platform === 'win32' ? { maximizable: false } : {}),
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'public/assets/ios27/icon-512.png'),
    alwaysOnTop: state.alwaysOnTop,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      webviewTag: true
    }
  });
  // The tray owns app actions; Electron's default Windows menu would intercept Ctrl shortcuts.
  if (process.platform === 'win32') win.setMenu(null);
  installNavigationGuards(win, (url) => isSameShellUrl(url, win.webContents.getURL() || url));

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
      return;
    }
    if (process.platform !== 'darwin') {
      win.showInactive();
      return;
    }
    void getTopmostOtherAppBundleId().then(async (currentOtherBundleId) => {
      if (win.isDestroyed()) return;
      const targetBundleId = currentOtherBundleId ?? (await capturedLaunchFrontBundleIdPromise);
      win.showInactive();
      win.blur();
      if (targetBundleId) {
        execFile('open', ['-b', targetBundleId], () => {});
        setTimeout(() => {
          if (!win.isDestroyed() && win.isFocused()) {
            win.blur();
            execFile('open', ['-b', targetBundleId], () => {});
          }
        }, 120);
      }
    });
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
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('before-quit', () => {
    isQuittingApp = true;
  });

  void app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      app.dock?.hide();
      capturedLaunchFrontBundleIdPromise = getTopmostOtherAppBundleId();
    }
    if (process.platform === 'win32') app.setAppUserModelId('com.reliqbit.iphone-pwa-simulator');
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
      const contentsId = contents.id;
      contents.once('destroyed', () => forgetEmulationTarget(contentsId));
      contents.on('context-menu', (e) => {
        e.preventDefault();
        popUpTwoFingerMenu(ctx);
      });
    });

    // Guests are untrusted: every camera / mic / location / notification
    // request becomes an iOS-style alert inside the simulated screen.
    installGuestPermissionPrompts(
      session.defaultSession,
      { ask: askPermissionInShell },
      new GuestPermissionStore(),
      (wc) => wc !== null && mainFloatingWindow !== null && wc === mainFloatingWindow.webContents
    );

    registerIpcHandlers(ctx);
    mainFloatingWindow = createFloatingSimulatorWindow(ctx);
    menuBarTray = createMenuBarTray(ctx);
    void menuBarTray;

    const registered = globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (mainFloatingWindow) {
        toggleFloatingWindowVisibility(mainFloatingWindow);
      }
    });
    if (!registered) logStructured('warn', 'main.entry', 'hide_shortcut_unavailable', {});
  });
}

if (typeof app !== 'undefined' && typeof app.whenReady === 'function') {
  bootstrapElectronApp();
}
