import { mobileChildTargets } from './mobile-targets';
import { Orientation, SafeAreaInsets } from '../types/device.types';
import {
  CdpDeviceMetricsPayload,
  GuestViewportSize,
  EmulationProfile,
  EmulationProfileInput,
  EmulationTargetWebContents
} from '../types/emulation.types';
import { BrowserShellMode, EmulationFailureError, Result } from '../types/simulator.types';
import { logStructured } from '../utils/logger.util';
import {
  computeShellChromeHeights,
  hasDuoSystemRail,
  resolveKeyboardHeight,
  resolvePageSafeArea,
  resolveSafeAreaInsets
} from '../utils/viewport-math.util';

/**
 * Since iOS 26, Safari freezes the OS token in the User-Agent at 18_6 and only
 * the `Version/` token tracks the real Safari release. Third-party iOS browsers
 * (Chrome = WKWebView) report the same frozen token.
 */
const FROZEN_IOS_UA_TOKEN = '18_6';

function resolveUaOsToken(safariIosVersion: string): string {
  const major = Number.parseInt(safariIosVersion.replace(/_/g, '.').split('.')[0] ?? '0', 10);
  return major >= 26 ? FROZEN_IOS_UA_TOKEN : safariIosVersion.replace(/\./g, '_');
}

export function buildMobileUserAgent(
  shellMode: BrowserShellMode,
  safariIosVersion: string,
  chromeIosVersion: string
): string {
  const iosToken = resolveUaOsToken(safariIosVersion);
  const safariVersion = safariIosVersion.replace(/_/g, '.');

  if (shellMode === BrowserShellMode.IOS_CHROME) {
    return (
      `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosToken} like Mac OS X) ` +
      `AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeIosVersion} ` +
      `Mobile/15E148 Safari/604.1`
    );
  }

  return (
    `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosToken} like Mac OS X) ` +
    `AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVersion} ` +
    `Mobile/15E148 Safari/604.1`
  );
}

/**
 * The only stylesheet injected into the page under test. It deliberately does
 * NOT touch layout, overflow or color-scheme: a simulator that silently
 * "fixes" a page hides the very bugs you want to catch before shipping.
 *  - iOS uses overlay scrollbars → hide Chromium's classic scrollbars.
 *  - Private custom properties back the env() fallback (namespaced so they
 *    can never collide with the page's own variables).
 */
export function buildSafeAreaCss(safeArea: SafeAreaInsets, _darkMode?: boolean): string {
  return [
    ':root {',
    `  --__sim-sat: ${safeArea.top}px;`,
    `  --__sim-sar: ${safeArea.right}px;`,
    `  --__sim-sab: ${safeArea.bottom}px;`,
    `  --__sim-sal: ${safeArea.left}px;`,
    '}',
    '::-webkit-scrollbar { width: 0 !important; height: 0 !important; background: transparent; }'
  ].join('\n');
}

/**
 * Runs before any page script on every navigation (Page.addScriptToEvaluateOnNewDocument)
 * and once immediately for the current document. Makes the Chromium guest
 * answer feature detection the way iOS WebKit does.
 */
export function buildStandaloneInitScript(
  shellMode: BrowserShellMode,
  safeArea: SafeAreaInsets,
  touchCursorEnabled = false,
  keyboardInset = 0
): string {
  const isStandalone = shellMode === BrowserShellMode.PWA_STANDALONE;
  const inputMode = touchCursorEnabled ? 'mouse' : 'touch';
  const config = JSON.stringify({
    standalone: isStandalone,
    shell: shellMode,
    inputMode,
    safe: safeArea,
    safeAreaCss: buildSafeAreaCss(safeArea),
    keyboardInset
  });
  return `(() => {
  const cfg = ${config};
  const define = (obj, key, value) => {
    try { Object.defineProperty(obj, key, { get: () => value, configurable: true }); } catch {}
  };
  // --- navigator: iOS WebKit identity -------------------------------------
  define(Navigator.prototype, 'standalone', cfg.standalone);
  define(Navigator.prototype, 'vendor', 'Apple Computer, Inc.');
  define(Navigator.prototype, 'maxTouchPoints', 5);
  try { delete Navigator.prototype.userAgentData; } catch {}



  // --- (display-mode) media queries: Chromium cannot emulate them ---------
  window.__simDisplayMode = cfg.standalone ? 'standalone' : 'browser';
  const rewriteQuery = (q) => String(q).replace(
    /\\(\\s*display-mode\\s*:\\s*([a-z-]+)\\s*\\)/gi,
    (_m, mode) =>
      mode.toLowerCase() === window.__simDisplayMode ? '(min-width: 0px)' : '(max-width: -1px)'
  );
  if (!window.__simMatchMediaPatched) {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (q) => nativeMatchMedia(rewriteQuery(q));
    window.__simMatchMediaPatched = true;
  }

  // Chromium can defer webContents.insertCSS until after window.load. Install
  // the same simulator stylesheet with the profile so media cannot block navigation.
  const sheet = window.__simViewportSheet || (window.__simViewportSheet = new CSSStyleSheet());
  sheet.replaceSync(cfg.safeAreaCss);
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const applyDom = () => {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.simulatorShell = cfg.shell;
    root.dataset.simulatorInput = cfg.inputMode;
    root.style.setProperty('--__sim-sat', cfg.safe.top + 'px');
    root.style.setProperty('--__sim-sar', cfg.safe.right + 'px');
    root.style.setProperty('--__sim-sab', cfg.safe.bottom + 'px');
    root.style.setProperty('--__sim-sal', cfg.safe.left + 'px');
    const orb = document.getElementById('__sim-touch-orb');
    if (orb) orb.remove();
  };

  // --- stylesheet fallback for env(safe-area-inset-*) and display-mode ----
  // Traverse grouping rules (@supports, @layer, nested @media, @import),
  // and preserve the original query so a live mode change can restore it.
  const originals = window.__simOriginalMedia || (window.__simOriginalMedia = new WeakMap());
  const patchRules = (owner) => {
    let rules;
    try { rules = owner.cssRules; } catch { return; } // Keep the origin boundary.
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      if (rule.media) {
        const original = originals.get(rule) || rule.media.mediaText;
        if (/display-mode/i.test(original)) {
          originals.set(rule, original);
          const rewritten = rewriteQuery(original);
          if (rewritten !== rule.media.mediaText) rule.media.mediaText = rewritten;
        }
      }
      if (rule.styleSheet) patchRules(rule.styleSheet);
      if (rule.cssRules) patchRules(rule);
    }
  };
  const patchSheets = () => {
    for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) patchRules(sheet);
  };
  window.__simPatchSheets = patchSheets;
  // Handle lazy styles, loaded links and constructed stylesheets without
  // polling every frame or changing the page's layout rules.
  if (!window.__simSheetWatch) {
    window.__simSheetWatch = true;
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; window.__simPatchSheets(); });
    };
    new MutationObserver((records) => {
      if (records.some(r => r.type === 'childList' || r.target.nodeName === 'STYLE' || r.target.parentNode?.nodeName === 'STYLE')) schedule();
    }).observe(document, { subtree: true, childList: true, characterData: true });
    document.addEventListener('load', e => { if (e.target.tagName === 'LINK') schedule(); }, true);
    for (const name of ['insertRule', 'replaceSync', 'replace']) {
      const native = CSSStyleSheet.prototype[name];
      CSSStyleSheet.prototype[name] = function(...args) {
        const result = native.apply(this, args);
        if (result && typeof result.then === 'function') result.then(schedule, () => {});
        else schedule();
        return result;
      };
    }
  }

  const probeEnvOverride = () => {
    if (!document.body) return;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,-1px);padding-right:env(safe-area-inset-right,-1px)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    window.__simEnvOverrideWorks =
      parseFloat(cs.paddingTop) === cfg.safe.top && parseFloat(cs.paddingRight) === cfg.safe.right;
    probe.remove();
  };

  // Software keyboard. Like iOS, focusing a text field does NOT resize the
  // layout viewport: only visualViewport shrinks, and the field is scrolled
  // clear of the keyboard. The simulator shell draws the keyboard itself.
  window.__simKeyboardInset = cfg.keyboardInset;
  if (!window.__simKeyboardWatch) {
    window.__simKeyboardWatch = true;
    const NON_TEXT = ['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden'];
    const isEditable = (el) => {
      if (!el || el.disabled || el.readOnly) return false;
      if (el.isContentEditable) return true;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') return !NON_TEXT.includes(String(el.type || 'text').toLowerCase());
      return false;
    };
    let shown = false;
    try {
      const nativeHeight = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height');
      Object.defineProperty(VisualViewport.prototype, 'height', {
        configurable: true,
        get() {
          const h = nativeHeight.get.call(this);
          return shown ? Math.max(0, h - (window.__simKeyboardInset || 0)) : h;
        }
      });
    } catch {}
    const setShown = (next, el) => {
      if (next !== shown) {
        shown = next;
        console.debug(shown ? '__sim:keyboard:show' : '__sim:keyboard:hide');
        try { window.visualViewport.dispatchEvent(new Event('resize')); } catch {}
      }
      if (shown && el) {
        setTimeout(() => {
          const rect = el.getBoundingClientRect();
          const limit = window.innerHeight - (window.__simKeyboardInset || 0) - 16;
          if (rect.bottom > limit) window.scrollBy({ top: rect.bottom - limit, behavior: 'smooth' });
        }, 260);
      }
    };
    document.addEventListener('focusin', (e) => setShown(isEditable(e.target), e.target), true);
    document.addEventListener('focusout', () => {
      setTimeout(() => { if (!isEditable(document.activeElement)) setShown(false, null); }, 60);
    }, true);
  }

  // Safari's compact bar collapses when the page scrolls down and expands on
  // scroll up / at the top. Report direction changes to the simulator shell.
  if (cfg.shell === 'ios-safari' && !window.__simScrollWatch) {
    window.__simScrollWatch = true;
    let lastY = window.scrollY;
    let collapsed = false;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < 6) return;
      lastY = y;
      const next = dy > 0 && y > 40;
      if (next !== collapsed) {
        collapsed = next;
        console.debug(collapsed ? '__sim:safari-bar:collapse' : '__sim:safari-bar:expand');
      }
    }, { passive: true });
  }

  const run = () => { applyDom(); probeEnvOverride(); patchSheets(); };
  if (document.readyState === 'loading') {
    applyDom();
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
  window.addEventListener('load', patchSheets, { once: true });
})();`;
}

export function buildEmulationProfile(input: EmulationProfileInput): EmulationProfile {
  const isPortrait = input.orientation === Orientation.PORTRAIT;
  const screenWidth = isPortrait ? input.preset.width : input.preset.height;
  const screenHeight = isPortrait ? input.preset.height : input.preset.width;
  const rawSafeArea = resolveSafeAreaInsets(input.preset, input.orientation);
  const chromeHeights = computeShellChromeHeights(
    input.shellMode,
    rawSafeArea,
    input.pwaStatusBarStyle ?? 'default'
  );
  const railWidth = hasDuoSystemRail(input.preset, input.orientation) ? rawSafeArea.right : 0;
  const viewportHeight = Math.max(
    240,
    screenHeight - chromeHeights.topBarHeight - chromeHeights.bottomBarHeight
  );
  const pageSafeArea = resolvePageSafeArea(
    input.preset,
    input.orientation,
    input.shellMode,
    input.pwaStatusBarStyle ?? 'default'
  );

  return {
    userAgent: buildMobileUserAgent(
      input.shellMode,
      input.safariIosVersion,
      input.chromeIosVersion
    ),
    platform: 'iPhone',
    previewLanguage: input.previewLanguage,
    previewTimeZone: input.previewTimeZone,
    standalone: input.shellMode === BrowserShellMode.PWA_STANDALONE,
    mediaFeatures: [
      { name: 'prefers-color-scheme', value: input.darkMode ? 'dark' : 'light' },
      { name: 'prefers-reduced-motion', value: 'no-preference' }
    ],
    metrics: {
      width: screenWidth - railWidth,
      height: viewportHeight,
      screenWidth,
      screenHeight,
      deviceScaleFactor: input.preset.deviceScaleFactor,
      mobile: true,
      screenOrientation: {
        type: isPortrait ? 'portraitPrimary' : 'landscapePrimary',
        angle: isPortrait ? 0 : 90
      }
    },
    touch: {
      enabled: true,
      maxTouchPoints: 5
    },
    pageSafeArea,
    safeAreaCss: buildSafeAreaCss(pageSafeArea),
    standaloneInitScript: buildStandaloneInitScript(
      input.shellMode,
      pageSafeArea,
      Boolean(input.touchCursorEnabled),
      Math.max(
        0,
        resolveKeyboardHeight(input.preset, input.orientation) - chromeHeights.bottomBarHeight
      )
    )
  };
}

/** Per-guest bookkeeping so re-applying emulation replaces instead of stacking. */
interface AppliedGuestState {
  viewport?: GuestViewportSize;
  metrics?: CdpDeviceMetricsPayload;
  children?: ReturnType<typeof mobileChildTargets>;
  language?: string;
  timeZone?: string;
  initScriptId: string | null;
}
const appliedByGuest = new Map<number, AppliedGuestState>();

export function readGuestViewportSize(raw: unknown): GuestViewportSize | undefined {
  if (!raw || typeof raw !== 'object') return;
  const {width,height} = raw as Partial<GuestViewportSize>;
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 4096;
  if (valid(width) && valid(height)) return {width,height};
}

export async function resizeGuestViewport(target: EmulationTargetWebContents, size: GuestViewportSize) {
  const state = appliedByGuest.get(target.id);
  if (!state || (state.viewport?.width === size.width && state.viewport?.height === size.height)) return;
  state.viewport = size;
  if (state.metrics) await target.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {...state.metrics, ...size});
}

export function forgetEmulationTarget(webContentsId: number): void {
  appliedByGuest.get(webContentsId)?.children?.dispose();
  appliedByGuest.delete(webContentsId);
}

async function replaceInitScript(
  target: EmulationTargetWebContents,
  bookkeeping: AppliedGuestState,
  source: string
): Promise<void> {
  if (bookkeeping.initScriptId) {
    await target.debugger
      .sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: bookkeeping.initScriptId
      })
      .catch(() => undefined);
    bookkeeping.initScriptId = null;
  }
  const added = (await target.debugger
    .sendCommand('Page.addScriptToEvaluateOnNewDocument', { source })) as { identifier?: string } | null;
  bookkeeping.initScriptId = added?.identifier ?? null;
  // Also apply to the document that is already loaded. Runtime.evaluate does
  // not wait for `load` (executeJavaScript does, and can hang on pages that
  // keep long-lived requests open).
  await target.debugger
    .sendCommand('Runtime.evaluate', { expression: source, awaitPromise: false })
    .catch(() => undefined);
}

type PreviewSession = NonNullable<EmulationTargetWebContents['session']>;
const workerScriptLanguages = new WeakMap<PreviewSession,string>();

// Chromium fetches the service-worker script before there is a CDP worker target.
// Keep its default language negotiation intact when the user returns to System.
function setWorkerScriptLanguage(session: PreviewSession | undefined, language?: string): void {
  if (!session || workerScriptLanguages.get(session) === (language || undefined)) return;
  if (!language) {
    session.webRequest.onBeforeSendHeaders(null);
    workerScriptLanguages.delete(session);
    return;
  }
  session.webRequest.onBeforeSendHeaders({urls:['http://*/*','https://*/*']}, (request, reply) => {
    const headers = request.requestHeaders;
    const keys = Object.keys(headers);
    if (!keys.some(key => key.toLowerCase() === 'service-worker' && headers[key] === 'script')) return reply({});
    const accept = keys.find(key => key.toLowerCase() === 'accept-language') || 'Accept-Language';
    reply({requestHeaders:{...headers,[accept]:language}});
  });
  workerScriptLanguages.set(session, language);
}

async function applyEmulationNow(
  target: EmulationTargetWebContents,
  input: EmulationProfileInput,
  bookkeeping: AppliedGuestState
): Promise<Result<EmulationProfile, EmulationFailureError>> {
  const profile = buildEmulationProfile(input);
  const insets = profile.pageSafeArea;

  try {
    if (!target.debugger.isAttached()) {
      bookkeeping.children?.dispose();
      bookkeeping.children = undefined;
      target.debugger.attach('1.3');
      bookkeeping.language = undefined;
      bookkeeping.timeZone = undefined;
    }
    // Page must be enabled before registering scripts, otherwise Chromium
    // acknowledges the registration but skips it at document creation.
    await target.debugger.sendCommand('Page.enable');
    target.session?.setUserAgent(profile.userAgent);
    setWorkerScriptLanguage(target.session, profile.previewLanguage);
    target.setUserAgent(profile.userAgent);
    bookkeeping.children ??= mobileChildTargets(target.debugger, profile);
    target.setZoomFactor?.(1.0);

    if (bookkeeping.language !== profile.previewLanguage) {
      await target.debugger.sendCommand('Emulation.setLocaleOverride', {locale: profile.previewLanguage || ''});
      bookkeeping.language = profile.previewLanguage;
    }
    if (bookkeeping.timeZone !== profile.previewTimeZone) {
      await target.debugger.sendCommand('Emulation.setTimezoneOverride', {timezoneId: profile.previewTimeZone || ''});
      bookkeeping.timeZone = profile.previewTimeZone;
    }
    bookkeeping.metrics = profile.metrics;
    await Promise.all([
      bookkeeping.children.update(profile),
      target.debugger.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: profile.userAgent,
        platform: profile.platform,
        ...(profile.previewLanguage && {acceptLanguage: profile.previewLanguage})
      }),
      // Use the actual pane's unscaled layout box, including at document start.
      // CSS transforms used for the simulated hardware never enter these metrics.
      target.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        ...profile.metrics, ...bookkeeping.viewport
      }),
      target.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
        ...profile.touch
      }),
      target.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', {
        enabled: !input.touchCursorEnabled, configuration: 'mobile'
      }),
      target.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: profile.mediaFeatures
      }),
      target.debugger
        .sendCommand('Emulation.setSafeAreaInsetsOverride', {
          insets: {
            top: insets.top,
            bottom: insets.bottom,
            left: insets.left,
            right: insets.right,
            topMax: insets.top,
            bottomMax: insets.bottom,
            leftMax: insets.left,
            rightMax: insets.right
          }
        })
        .catch(() => undefined)
    ]);

    await replaceInitScript(target, bookkeeping, profile.standaloneInitScript);

    logStructured('info', 'emulation.service', 'emulation_applied', {
      webContentsId: target.id,
      deviceId: input.preset.id,
      orientation: input.orientation,
      shellMode: input.shellMode,
      dpr: profile.metrics.deviceScaleFactor
    });

    return { ok: true, value: profile };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown CDP emulation error';
    logStructured('error', 'emulation.service', 'emulation_failed', {
      webContentsId: target.id,
      error: message
    });
    return {
      ok: false,
      error: {
        kind: 'EMULATION_FAILURE_ERROR',
        operation: 'applyEmulationToTarget',
        message,
        recoveryHint: 'Reload the webview or verify debugger attachment state'
      }
    };
  }
}

// Renderer state updates and navigation events can arrive concurrently. Never
// leave two boot scripts installed or let an older profile win a race.
const pendingByGuest = new Map<number, Promise<Result<EmulationProfile, EmulationFailureError>>>();
export function applyEmulationToTarget(
  target: EmulationTargetWebContents,
  input: EmulationProfileInput
): Promise<Result<EmulationProfile, EmulationFailureError>> {
  const bookkeeping: AppliedGuestState = appliedByGuest.get(target.id) ?? {initScriptId:null};
  if (input.viewportSize) bookkeeping.viewport = input.viewportSize;
  appliedByGuest.set(target.id, bookkeeping);
  const pending = (pendingByGuest.get(target.id) ?? Promise.resolve())
    .then(() => applyEmulationNow(target, input, bookkeeping));
  pendingByGuest.set(target.id, pending);
  void pending.finally(() => {
    if (pendingByGuest.get(target.id) === pending) pendingByGuest.delete(target.id);
  });
  return pending;
}
