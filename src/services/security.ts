import { shortcutModifier } from '../utils/platform.util';
import type {
  BrowserWindow,
  IpcMainInvokeEvent,
  Session,
  WebContents,
  WebPreferences
} from 'electron';
import { logStructured } from '../utils/logger.util';

/**
 * Security boundary for the simulator.
 *
 * Trust model:
 *  - The simulator shell (our React UI) is trusted and talks to the main
 *    process over a small, validated IPC surface.
 *  - Every page loaded inside a <webview> is UNTRUSTED. It gets no preload,
 *    no Node, a sandboxed renderer, cannot open windows, and must ask the
 *    user (iOS-style prompt) before using camera / mic / location / etc.
 */

const ALLOWED_GUEST_PROTOCOLS = new Set(['http:', 'https:']);

export function isAllowedGuestUrl(rawUrl: string): boolean {
  try {
    return ALLOWED_GUEST_PROTOCOLS.has(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

/** Forces safe webPreferences on every <webview> the shell tries to attach. */
export function enforceGuestWebPreferences(
  webPreferences: WebPreferences,
  params: Record<string, string>
): { readonly allow: boolean; readonly reason?: string } {
  const prefs = webPreferences as WebPreferences & { preloadURL?: string };
  delete prefs.preload;
  delete prefs.preloadURL;
  prefs.nodeIntegration = false;
  prefs.nodeIntegrationInSubFrames = false;
  prefs.contextIsolation = true;
  prefs.sandbox = true;
  prefs.webSecurity = true;
  prefs.allowRunningInsecureContent = false;
  prefs.experimentalFeatures = false;
  prefs.webviewTag = false;
  // Opaque guest: pages that set no background get the white canvas iOS
  // paints, instead of showing whatever is behind the <webview>.
  (prefs as WebPreferences & { transparent?: boolean }).transparent = false;
  if (params.src && !isAllowedGuestUrl(params.src)) {
    return { allow: false, reason: `blocked guest src protocol: ${params.src.slice(0, 64)}` };
  }
  return { allow: true };
}

/** True only when the IPC call comes from the top frame of our own shell window. */
export function isTrustedShellSender(
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  shellWindow: BrowserWindow | null
): boolean {
  if (!shellWindow || shellWindow.isDestroyed()) {
    return false;
  }
  if (event.sender !== shellWindow.webContents) {
    return false;
  }
  const frame = event.senderFrame;
  return !frame || frame === shellWindow.webContents.mainFrame;
}

/** A webContents id from the shell must point at one of *its own* webview guests. */
export function isGuestOfShell(target: WebContents | undefined, shellWindow: BrowserWindow | null): boolean {
  if (!target || target.isDestroyed() || !shellWindow || shellWindow.isDestroyed()) {
    return false;
  }
  return target.getType() === 'webview' && target.hostWebContents === shellWindow.webContents;
}

export function isFiniteWindowPoint(payload: unknown): payload is { x: number; y: number } {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const { x, y } = payload as { x?: unknown; y?: unknown };
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.abs(x) < 100000 &&
    Math.abs(y) < 100000
  );
}

// ---------------------------------------------------------------------------
// iOS-style permission prompts
// ---------------------------------------------------------------------------

export type GuestPermissionKind = 'camera' | 'microphone' | 'location' | 'notifications' | 'motion';

const PROMPT_COPY: Readonly<Record<GuestPermissionKind, string>> = {
  camera: 'Would Like to Access the Camera',
  microphone: 'Would Like to Access the Microphone',
  location: 'Would Like to Use Your Current Location',
  notifications: 'Would Like to Send You Notifications',
  motion: 'Would Like to Access Motion and Orientation'
};

/** Permissions a page may use without a prompt (harmless, or iOS grants them silently). */
const SILENT_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'window-management-none']);

export function mapElectronPermission(
  permission: string,
  details: { mediaTypes?: ReadonlyArray<string> }
): GuestPermissionKind[] | 'allow' | 'deny' {
  if (SILENT_ALLOW.has(permission)) {
    return 'allow';
  }
  switch (permission) {
    case 'media': {
      const kinds: GuestPermissionKind[] = [];
      if (details.mediaTypes?.includes('video')) kinds.push('camera');
      if (details.mediaTypes?.includes('audio')) kinds.push('microphone');
      return kinds.length > 0 ? kinds : 'deny';
    }
    case 'geolocation':
      return ['location'];
    case 'notifications':
      return ['notifications'];
    case 'sensors':
      return ['motion'];
    default:
      // openExternal, midi, hid, serial, usb, pointerLock, display-capture, ...
      // do not exist for an iOS web page: deny.
      return 'deny';
  }
}

export interface PermissionPromptUi {
  readonly ask: (origin: string, message: string) => Promise<boolean>;
}

export function buildPromptMessage(origin: string, kind: GuestPermissionKind): string {
  let host = origin;
  try {
    host = new URL(origin).host || origin;
  } catch {
    // keep raw
  }
  return `“${host}” ${PROMPT_COPY[kind]}`;
}

/**
 * Remembers decisions per origin + kind for the app session, like iOS does
 * until the page is reloaded / Safari settings are reset.
 */
export function isSameShellUrl(url: string, entry: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(entry);
    if (b.protocol === 'file:') {
      return a.protocol === 'file:' && a.pathname === b.pathname;
    }
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

export class GuestPermissionStore {
  private readonly decisions = new Map<string, boolean>();

  public get(origin: string, kind: GuestPermissionKind): boolean | undefined {
    return this.decisions.get(`${origin}|${kind}`);
  }

  public set(origin: string, kind: GuestPermissionKind, granted: boolean): void {
    this.decisions.set(`${origin}|${kind}`, granted);
  }

  public reset(): void {
    this.decisions.clear();
  }
}

export function installGuestPermissionPrompts(
  targetSession: Session,
  ui: PermissionPromptUi,
  store: GuestPermissionStore,
  isShellContents: (wc: WebContents | null) => boolean
): void {
  targetSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (isShellContents(wc)) {
      callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
      return;
    }
    const mapped = mapElectronPermission(
      permission,
      details as { mediaTypes?: ReadonlyArray<string> }
    );
    if (mapped === 'allow' || mapped === 'deny') {
      callback(mapped === 'allow');
      return;
    }
    const origin = (details as { requestingUrl?: string }).requestingUrl ?? wc?.getURL() ?? '';
    let originKey = origin;
    try {
      originKey = new URL(origin).origin;
    } catch {
      // keep raw
    }
    void (async (): Promise<void> => {
      for (const kind of mapped) {
        const remembered = store.get(originKey, kind);
        const granted =
          remembered ?? (await ui.ask(originKey, buildPromptMessage(originKey, kind)));
        store.set(originKey, kind, granted);
        logStructured('info', 'security.service', 'guest_permission_decision', {
          origin: originKey,
          kind,
          granted
        });
        if (!granted) {
          callback(false);
          return;
        }
      }
      callback(true);
    })();
  });

  targetSession.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (isShellContents(wc)) {
      return permission === 'fullscreen' || permission === 'clipboard-sanitized-write';
    }
    const mapped = mapElectronPermission(
      permission,
      { mediaTypes: (details as { mediaType?: string }).mediaType ? [String((details as { mediaType?: string }).mediaType)] : [] }
    );
    if (mapped === 'allow' || mapped === 'deny') {
      return mapped === 'allow';
    }
    let originKey = requestingOrigin;
    try {
      originKey = new URL(requestingOrigin).origin;
    } catch {
      // keep raw
    }
    return mapped.every((kind) => store.get(originKey, kind) === true);
  });
}

/**
 * Locks the shell window and all guests:
 *  - shell can never navigate away from its own bundle
 *  - guests cannot spawn new BrowserWindows; target=_blank / window.open
 *    navigate in place (what an iOS standalone PWA effectively does)
 *  - only http(s) navigations are allowed inside guests
 */
const SIMULATOR_SHORTCUT_KEYS = new Set(['h', 'a', 's', 'r', 'm', 't', 'b', 'arrowleft', 'arrowright', '=', '+', '-', '0']);
const SHIFT_ONLY_KEYS = new Set(['h', 'a']);

export function installNavigationGuards(
  shellWindow: BrowserWindow,
  isShellUrl: (url: string) => boolean
): void {
  const shell = shellWindow.webContents;

  shell.on('will-navigate', (event, url) => {
    if (!isShellUrl(url)) {
      event.preventDefault();
      logStructured('warn', 'security.service', 'shell_navigation_blocked', { url: url.slice(0, 200) });
    }
  });
  shell.setWindowOpenHandler(() => ({ action: 'deny' }));

  shell.on('will-attach-webview', (event, webPreferences, params) => {
    const verdict = enforceGuestWebPreferences(webPreferences, params as unknown as Record<string, string>);
    if (!verdict.allow) {
      event.preventDefault();
      logStructured('warn', 'security.service', 'webview_attach_blocked', { reason: verdict.reason });
    }
  });

  shell.on('did-attach-webview', (_event, guest) => {
    // Simulator shortcuts must keep working while the page under test has focus.
    guest.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !shortcutModifier(input.meta, input.control, input.alt)) {
        return;
      }
      const key = input.key.toLowerCase();
      // The global hide shortcut owns Shift+S; never turn it into a screenshot.
      if (key === 's' && input.shift) return;
      if (SIMULATOR_SHORTCUT_KEYS.has(key) && (!SHIFT_ONLY_KEYS.has(key) || input.shift)) {
        event.preventDefault();
        if (!shell.isDestroyed()) {
          shell.send('simulator:shortcut', { key, shift: input.shift });
        }
      }
    });
    guest.setWindowOpenHandler(({ url }) => {
      if (isAllowedGuestUrl(url)) {
        void guest.loadURL(url);
      }
      return { action: 'deny' };
    });
    guest.on('will-navigate', (event, url) => {
      if (!isAllowedGuestUrl(url)) {
        event.preventDefault();
      }
    });
    guest.on('will-redirect', (event, url) => {
      if (!isAllowedGuestUrl(url)) {
        event.preventDefault();
      }
    });
  });
}
