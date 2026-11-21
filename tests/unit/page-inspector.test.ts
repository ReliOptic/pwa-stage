import { appInitial, limitAppName } from '../../src/utils/app-name.util';
import { chooseTouchIcon } from '../../src/utils/home-icon.util';
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
  it('resolves paths against the final manifest response URL', () => {
    const page = sanitizePageInspection({ ...GOOD,
      manifestHref: 'https://app.example.com/assets/pwa/app.webmanifest',
      manifest: { start_url: '../../launch', scope: '../../', icons: [{ src: 'icon.png' }] }
    });
    expect(page?.manifest?.start_url).toBe('https://app.example.com/launch');
    expect(page?.manifest?.scope).toBe('https://app.example.com/');
    expect(page?.manifest?.icons?.[0].src).toBe('https://app.example.com/assets/pwa/icon.png');
  });

  it.each(['javascript:alert(1)', 'file:///tmp/app', 'https://other.example/app'])('rejects unsafe or foreign start URL %s', start_url => {
    const page = sanitizePageInspection({ ...GOOD, manifest: { start_url, scope: 'https://other.example/' } });
    expect(page?.manifest?.start_url).toBe(GOOD.url);
    expect(page?.manifest?.scope).toBe('https://app.example.com/');
  });

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

  it('evaluates the selected touch icon at the device pixel ratio', () => {
    const icons = [{src:GOOD.appleTouchIcon, sizes:'120x120'}, {src:'https://app.example.com/high.png', sizes:'180x180'}];
    const inspect = (dpr:number, touchIcons=icons) => sanitizePageInspection({...GOOD, appleTouchIconSizes:'120x120', touchIcons,
      viewport:{layoutWidth:375,layoutHeight:667,visualWidth:375,visualHeight:600,screenWidth:375,screenHeight:667,dpr,scale:1}})!;
    const check = (dpr:number, options=icons) => evaluatePwaChecks(inspect(dpr,options)).find(c=>c.id==='touch-icon');
    expect(check(2)?.level).toBe('pass');
    expect(check(3)?.level).toBe('pass');
    expect(resolveHomeScreenIdentity(inspect(3)).iconUrl).toBe(icons[1].src);
    expect(check(3,[icons[0]])?.level).toBe('warn');
    expect(check(3,[{...icons[0],sizes:'1800x1'}])?.level).toBe('warn');
  });

  it('keeps emoji sequences and combining marks intact in Home names and icon initials', () => {
    const text = 'A'.repeat(39) + '👩🏽‍💻';
    const inspection = sanitizePageInspection({...GOOD,appleTitle:null,manifest:{short_name:text+'!'}})!;
    expect(resolveHomeScreenIdentity(inspection).name).toBe(text);
    expect(appInitial('👩🏽‍💻 Studio')).toBe('👩🏽‍💻');
    expect(limitAppName('e\u0301cole',1)).toBe('e\u0301');
  });

  it('fails a linked manifest that is a JSON array', () => {
    const inspection = sanitizePageInspection({...GOOD,manifest:[]})!;
    expect(inspection.manifest).toBeNull();
    expect(evaluatePwaChecks(inspection).find(c=>c.id==='manifest')?.level).toBe('fail');
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

describe('Home icon renditions and viewport inspection', () => {
  it('chooses size-matched safe touch artwork, with a smaller fallback', () => {
    const result = sanitizePageInspection({...GOOD, touchIcons:[
      {src:'https://app.example.com/180.png',sizes:'180x180'}, {src:'https://app.example.com/120.png',sizes:'120x120'},
      {src:'file:///x',sizes:'128x128'}]});
    expect(result?.touchIcons).toHaveLength(2);
    expect(chooseTouchIcon(result?.touchIcons,120)).toBe('https://app.example.com/120.png');
    expect(chooseTouchIcon(result?.touchIcons,192)).toBe('https://app.example.com/180.png');
    expect(chooseTouchIcon(undefined,120)).toBeNull();
    expect(sanitizePageInspection({...GOOD,viewport:{dpr:-1}})?.viewport).toBeNull();
  });
});
