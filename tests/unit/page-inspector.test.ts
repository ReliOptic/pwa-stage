import { describe, expect, it } from 'vitest';
import {
  evaluatePwaChecks,
  resolveHomeScreenIdentity,
  safeCssColor,
  sanitizePageInspection
} from '../../src/services/page-inspector';

const GOOD = {
  url: 'https://app.example.com/inbox',
  title: 'Inbox — Example',
  isSecureContext: true,
  viewportContent: 'width=device-width, initial-scale=1, viewport-fit=cover',
  themeColor: '#0a84ff',
  bodyBackground: 'rgb(255, 255, 255)',
  appleCapable: 'yes',
  appleStatusBarStyle: 'black-translucent',
  appleTitle: 'Example',
  appleTouchIcon: 'https://app.example.com/apple-touch-icon.png',
  appleTouchIconSizes: '180x180',
  hasStartupImage: false,
  manifestHref: 'https://app.example.com/manifest.webmanifest',
  manifest: {
    name: 'Example Mail',
    short_name: 'Mail',
    start_url: '/?source=pwa',
    display: 'standalone',
    background_color: '#ffffff',
    icons: [
      { src: '/i/192.png', sizes: '192x192' },
      { src: '/i/512.png', sizes: '512x512' },
      { src: '/i/mask.png', sizes: '1024x1024', purpose: 'maskable' }
    ]
  },
  manifestError: null,
  serviceWorker: 'controlled'
};

describe('page inspector', () => {
  it('sanitizes untrusted page data', () => {
    const insp = sanitizePageInspection({
      ...GOOD,
      themeColor: 'red; background:url(javascript:alert(1))',
      appleTouchIcon: 'javascript:alert(1)',
      manifest: { ...GOOD.manifest, icons: [{ src: 'javascript:x' }, { src: '/ok.png' }] }
    });
    expect(insp).not.toBeNull();
    expect(insp?.themeColor).toBeNull();
    expect(insp?.appleTouchIcon).toBeNull();
    expect(insp?.manifest?.icons).toEqual([{ src: 'https://app.example.com/ok.png' }]);
    expect(insp?.manifest?.start_url).toBe('https://app.example.com/?source=pwa');
    expect(sanitizePageInspection({ url: 'file:///x' })).toBeNull();
    expect(sanitizePageInspection(42)).toBeNull();
  });

  it('accepts only plain colors', () => {
    expect(safeCssColor('#fff')).toBe('#fff');
    expect(safeCssColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(safeCssColor('White')).toBe('white');
    expect(safeCssColor('url(x)')).toBeNull();
    expect(safeCssColor('red;}')).toBeNull();
  });

  it('resolves Home Screen identity the way iOS does', () => {
    const insp = sanitizePageInspection(GOOD);
    if (!insp) throw new Error('sanitize');
    const id = resolveHomeScreenIdentity(insp);
    expect(id.name).toBe('Example'); // apple-mobile-web-app-title wins
    expect(id.iconUrl).toBe('https://app.example.com/apple-touch-icon.png');
    expect(id.launchUrl).toBe('https://app.example.com/?source=pwa');
    expect(id.opensAsWebApp).toBe(true);
    expect(id.statusBarStyle).toBe('black-translucent');

    const noTouch = sanitizePageInspection({ ...GOOD, appleTouchIcon: null, appleTitle: null });
    if (!noTouch) throw new Error('sanitize');
    const id2 = resolveHomeScreenIdentity(noTouch);
    expect(id2.name).toBe('Mail');
    expect(id2.iconUrl).toBe('https://app.example.com/i/512.png'); // maskable-only ignored
  });

  it('passes a well-built PWA and flags a bare page', () => {
    const good = sanitizePageInspection(GOOD);
    if (!good) throw new Error('sanitize');
    const goodChecks = evaluatePwaChecks(good);
    expect(goodChecks.filter((c) => c.level === 'fail')).toEqual([]);
    expect(goodChecks.find((c) => c.id === 'display')?.level).toBe('pass');

    const bare = sanitizePageInspection({
      url: 'http://shop.example.com/',
      title: 'Shop',
      isSecureContext: false,
      viewportContent: null,
      manifestHref: null,
      manifest: null,
      serviceWorker: 'none'
    });
    if (!bare) throw new Error('sanitize');
    const fails = evaluatePwaChecks(bare)
      .filter((c) => c.level === 'fail')
      .map((c) => c.id);
    expect(fails).toEqual(expect.arrayContaining(['https', 'viewport', 'touch-icon']));
  });

  it('keeps Open as Web App enabled for display:"browser"', () => {
    const insp = sanitizePageInspection({ ...GOOD, manifest: { ...GOOD.manifest, display: 'browser' } });
    if (!insp) throw new Error('sanitize');
    expect(resolveHomeScreenIdentity(insp).opensAsWebApp).toBe(true);
    expect(evaluatePwaChecks(insp).find((c) => c.id === 'display')?.level).toBe('warn');
  });
  it('defaults to a web app without a manifest or legacy capable tag', () => {
    const insp = sanitizePageInspection({ ...GOOD, manifest: null, appleMobileWebAppCapable: false });
    if (!insp) throw new Error('sanitize');
    expect(resolveHomeScreenIdentity(insp).opensAsWebApp).toBe(true);
  });

});
