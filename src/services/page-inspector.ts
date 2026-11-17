import {
  HomeScreenIdentity,
  PageInspection,
  PwaCheck,
  WebAppManifestIcon,
  WebAppManifestSubset
} from '../types/pwa.types';

/**
 * Expression evaluated inside the page under test (via CDP Runtime.evaluate,
 * awaitPromise). It only *reads* the document. Its result is untrusted (the
 * page can tamper with globals) and is always passed through
 * sanitizePageInspection before the shell uses it.
 */
export const PAGE_INSPECTION_EXPRESSION = `(async () => {
  const meta = (name) => {
    const el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : null;
  };
  const link = (sel) => document.querySelector(sel);
  const abs = (href) => { try { return new URL(href, document.baseURI).href; } catch { return null; } };
  const themeEls = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  const themeEl = themeEls.find((m) => !m.media || matchMedia(m.media).matches) || null;
  const touchIcon = link('link[rel="apple-touch-icon"]') || link('link[rel="apple-touch-icon-precomposed"]');
  const manifestLink = link('link[rel="manifest"]');
  let manifest = null;
  let manifestError = null;
  const manifestHref = manifestLink ? abs(manifestLink.getAttribute('href')) : null;
  if (manifestHref) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(manifestHref, {
        credentials: manifestLink.crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) { manifestError = 'HTTP ' + res.status; }
      else { manifest = await res.json(); }
    } catch (e) { manifestError = String(e && e.message || e); }
  }
  let serviceWorker = 'unsupported';
  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise((r) => setTimeout(() => r(undefined), 1500))
      ]);
      serviceWorker = navigator.serviceWorker.controller ? 'controlled' : reg ? 'registered' : 'none';
    }
  } catch {}
  const bodyBg = document.body ? getComputedStyle(document.body).backgroundColor : null;
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  return {
    url: location.href,
    title: document.title,
    isSecureContext: window.isSecureContext,
    viewportContent: meta('viewport'),
    themeColor: themeEl ? themeEl.getAttribute('content') : null,
    bodyBackground: bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : htmlBg,
    appleCapable: meta('apple-mobile-web-app-capable') || meta('mobile-web-app-capable'),
    appleStatusBarStyle: meta('apple-mobile-web-app-status-bar-style'),
    appleTitle: meta('apple-mobile-web-app-title'),
    appleTouchIcon: touchIcon ? abs(touchIcon.getAttribute('href')) : null,
    appleTouchIconSizes: touchIcon ? touchIcon.getAttribute('sizes') : null,
    hasStartupImage: !!link('link[rel="apple-touch-startup-image"]'),
    manifestHref,
    manifest,
    manifestError,
    serviceWorker
  };
})()`;

const MAX_STR = 2048;

function str(value: unknown, max = MAX_STR): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function httpUrl(value: unknown): string | null {
  const raw = str(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Accepts only plain CSS color syntaxes, so the value is safe to put in a style. */
export function safeCssColor(value: unknown): string | null {
  const raw = str(value, 64)?.trim();
  if (!raw) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[-0-9.,%\s/a-z]+\)$/i.test(raw)) return raw;
  if (/^[a-z]{3,20}$/i.test(raw)) return raw.toLowerCase();
  return null;
}

function sanitizeManifest(raw: unknown, baseUrl: string): WebAppManifestSubset | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const resolve = (v: unknown): string | undefined => {
    const s = str(v);
    if (!s) return undefined;
    try {
      return new URL(s, baseUrl).href;
    } catch {
      return undefined;
    }
  };
  const icons: WebAppManifestIcon[] = Array.isArray(m.icons)
    ? (m.icons as unknown[])
        .slice(0, 40)
        .map((icon): WebAppManifestIcon | null => {
          if (typeof icon !== 'object' || icon === null) return null;
          const i = icon as Record<string, unknown>;
          const src = resolve(i.src);
          if (!src || !httpUrl(src)) return null;
          return {
            src,
            sizes: str(i.sizes, 64) ?? undefined,
            type: str(i.type, 64) ?? undefined,
            purpose: str(i.purpose, 64) ?? undefined
          };
        })
        .filter((i): i is WebAppManifestIcon => i !== null)
    : [];
  return {
    name: str(m.name, 120) ?? undefined,
    short_name: str(m.short_name, 60) ?? undefined,
    start_url: resolve(m.start_url),
    scope: resolve(m.scope),
    display: str(m.display, 32) ?? undefined,
    theme_color: safeCssColor(m.theme_color) ?? undefined,
    background_color: safeCssColor(m.background_color) ?? undefined,
    orientation: str(m.orientation, 32) ?? undefined,
    id: str(m.id, 256) ?? undefined,
    icons
  };
}

export function sanitizePageInspection(raw: unknown): PageInspection | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const url = httpUrl(r.url);
  if (!url) return null;
  const sw = r.serviceWorker;
  return {
    url,
    title: str(r.title, 200) ?? '',
    isSecureContext: r.isSecureContext === true,
    viewportContent: str(r.viewportContent, 300),
    themeColor: safeCssColor(r.themeColor),
    bodyBackground: safeCssColor(r.bodyBackground),
    appleCapable: str(r.appleCapable, 16),
    appleStatusBarStyle: str(r.appleStatusBarStyle, 32),
    appleTitle: str(r.appleTitle, 60),
    appleTouchIcon: httpUrl(r.appleTouchIcon),
    appleTouchIconSizes: str(r.appleTouchIconSizes, 32),
    hasStartupImage: r.hasStartupImage === true,
    manifestHref: httpUrl(r.manifestHref),
    manifest: sanitizeManifest(r.manifest, url),
    manifestError: str(r.manifestError, 200),
    serviceWorker:
      sw === 'controlled' || sw === 'registered' || sw === 'none' ? sw : 'unsupported'
  };
}

function parseViewport(content: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!content) return out;
  for (const part of content.split(/[,;]/)) {
    const [k, v] = part.split('=').map((x) => x.trim().toLowerCase());
    if (k) out[k] = v ?? '';
  }
  return out;
}

function largestIcon(icons: readonly WebAppManifestIcon[] | undefined): WebAppManifestIcon | null {
  if (!icons || icons.length === 0) return null;
  const score = (i: WebAppManifestIcon): number => {
    const sizes = (i.sizes ?? '').split(/\s+/).map((s) => Number.parseInt(s, 10) || 0);
    const base = Math.max(0, ...sizes);
    // iOS ignores maskable-only icons for the Home Screen.
    return i.purpose && !/any/.test(i.purpose) ? base / 10 : base;
  };
  return [...icons].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function normalizeStatusBarStyle(raw: string | null): HomeScreenIdentity['statusBarStyle'] {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'black-translucent') return 'black-translucent';
  if (v === 'black') return 'black';
  return 'default';
}

/** What iOS shows on the Home Screen / uses at launch for this page. */
export function resolveHomeScreenIdentity(insp: PageInspection): HomeScreenIdentity {
  const m = insp.manifest;
  let host = insp.url;
  try {
    host = new URL(insp.url).hostname;
  } catch {
    // keep url
  }
  const name =
    insp.appleTitle?.trim() ||
    m?.short_name?.trim() ||
    m?.name?.trim() ||
    insp.title.trim() ||
    host;
  const icon = insp.appleTouchIcon ?? largestIcon(m?.icons)?.src ?? null;
  return {
    name: name.slice(0, 40),
    iconUrl: icon,
    launchUrl: m?.start_url ?? insp.url,
    // iOS 26+: every Home Screen bookmark opens as a web app unless the user
    // turns it off, even when the manifest requests display:"browser".
    opensAsWebApp: true,
    backgroundColor: m?.background_color ?? insp.bodyBackground,
    themeColor: insp.themeColor ?? m?.theme_color ?? null,
    statusBarStyle: normalizeStatusBarStyle(insp.appleStatusBarStyle)
  };
}

/**
 * iOS-specific installability / quality checks. These describe what Safari on
 * iOS actually does, which differs from Chrome's Lighthouse PWA criteria.
 */
export function evaluatePwaChecks(insp: PageInspection): PwaCheck[] {
  const checks: PwaCheck[] = [];
  const add = (c: PwaCheck): void => {
    checks.push(c);
  };
  const vp = parseViewport(insp.viewportContent);
  let isLocalhost = false;
  try {
    const h = new URL(insp.url).hostname;
    isLocalhost = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    // ignore
  }

  add(
    insp.isSecureContext
      ? { id: 'https', level: 'pass', title: 'Secure context', detail: isLocalhost ? 'localhost counts as secure for development.' : 'Served over HTTPS.' }
      : { id: 'https', level: 'fail', title: 'Not a secure context', detail: 'Service workers, Web Push and most PWA APIs need HTTPS on iOS.' }
  );

  if (!insp.viewportContent) {
    add({ id: 'viewport', level: 'fail', title: 'No viewport meta', detail: 'Without <meta name="viewport" content="width=device-width"> iOS lays the page out at 980px and zooms out.' });
  } else if (vp.width !== 'device-width') {
    add({ id: 'viewport', level: 'warn', title: 'viewport width is not device-width', detail: `Found "${insp.viewportContent}".` });
  } else {
    add({ id: 'viewport', level: 'pass', title: 'Responsive viewport', detail: insp.viewportContent });
  }
  add(
    vp['viewport-fit'] === 'cover'
      ? { id: 'viewport-fit', level: 'pass', title: 'viewport-fit=cover', detail: 'env(safe-area-inset-*) reports the real insets, content can go edge to edge.' }
      : { id: 'viewport-fit', level: 'info', title: 'viewport-fit is not cover', detail: 'iOS letterboxes the page inside the safe area in landscape; env(safe-area-inset-*) stays 0 there.' }
  );
  if (vp['user-scalable'] === 'no' || vp['maximum-scale'] === '1') {
    add({ id: 'zoom', level: 'info', title: 'Pinch-zoom disabled in meta', detail: 'Safari ignores user-scalable=no / maximum-scale for accessibility; do not rely on it to prevent zoom.' });
  }

  if (insp.manifestHref && !insp.manifest) {
    add({ id: 'manifest', level: 'fail', title: 'Manifest could not be loaded', detail: `${insp.manifestHref}: ${insp.manifestError ?? 'invalid JSON'}` });
  } else if (!insp.manifest) {
    add({ id: 'manifest', level: 'warn', title: 'No web app manifest', detail: 'iOS can still add the page to the Home Screen, but name, start_url, scope and display come only from the manifest.' });
  } else {
    const m = insp.manifest;
    add({ id: 'manifest', level: 'pass', title: 'Manifest loaded', detail: insp.manifestHref ?? '' });
    if (!m.name && !m.short_name) {
      add({ id: 'name', level: 'warn', title: 'Manifest has no name / short_name', detail: 'iOS falls back to apple-mobile-web-app-title or the document title.' });
    }
    const display = m.display ?? 'browser';
    add(
      display === 'standalone' || display === 'fullscreen' || display === 'minimal-ui'
        ? { id: 'display', level: 'pass', title: `display: ${display}`, detail: display === 'fullscreen' ? 'iOS treats fullscreen like standalone (status bar stays visible).' : 'Opens without Safari UI from the Home Screen.' }
        : { id: 'display', level: 'warn', title: `display: ${display}`, detail: 'Open as Web App defaults on regardless of display. Turn it off when adding to create a browser bookmark.' }
    );
    if (!m.start_url) {
      add({ id: 'start_url', level: 'info', title: 'No start_url', detail: 'iOS launches the URL that was open when the user tapped Add to Home Screen.' });
    }
  }

  if (insp.appleTouchIcon) {
    const sizes = insp.appleTouchIconSizes ?? '';
    add({
      id: 'touch-icon',
      level: sizes && !sizes.includes('180') ? 'warn' : 'pass',
      title: 'apple-touch-icon',
      detail: sizes ? `sizes="${sizes}" (iPhone uses 180×180).` : 'Present (no sizes attribute; provide a 180×180 PNG).'
    });
  } else if (largestIcon(insp.manifest?.icons)) {
    add({ id: 'touch-icon', level: 'warn', title: 'No apple-touch-icon', detail: 'iOS falls back to a manifest icon. Add a 180×180 opaque PNG apple-touch-icon for a crisp, unmasked icon.' });
  } else {
    add({ id: 'touch-icon', level: 'fail', title: 'No icon for the Home Screen', detail: 'iOS will use a screenshot-like letter tile. Add <link rel="apple-touch-icon" href="/icon-180.png">.' });
  }

  const sbs = normalizeStatusBarStyle(insp.appleStatusBarStyle);
  add({
    id: 'status-bar',
    level: 'info',
    title: `Status bar: ${sbs}`,
    detail:
      sbs === 'black-translucent'
        ? 'Web app content runs under the status bar: pad the top with env(safe-area-inset-top).'
        : 'Web app content starts below an opaque status bar (set apple-mobile-web-app-status-bar-style=black-translucent for edge-to-edge).'
  });

  add(
    insp.serviceWorker === 'controlled'
      ? { id: 'sw', level: 'pass', title: 'Service worker controls the page', detail: 'Offline support and Web Push (Home Screen web apps, iOS 16.4+) are possible.' }
      : insp.serviceWorker === 'registered'
        ? { id: 'sw', level: 'info', title: 'Service worker registered, not yet controlling', detail: 'Reload once so the worker takes control.' }
        : { id: 'sw', level: 'warn', title: 'No service worker', detail: 'No offline support; Web Push on iOS needs a service worker and a Home Screen install.' }
  );

  if (!insp.hasStartupImage) {
    add({ id: 'splash', level: 'info', title: 'No apple-touch-startup-image', detail: 'iOS shows a blank screen in background_color while the web app launches.' });
  }
  return checks;
}
