import { HomeGesture } from './HomeGesture';
import { useGuestFullscreen } from '../guest-fullscreen';
import React from 'react';
import { validateHttpUrl } from '../../config/env.config';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  MoreHorizontal,
  Search,
  RotateCw,
  Share
} from 'lucide-react';
import { IOS27_NOTCH_03_SVG_PATH, IOS27_STATUS_ICONS } from '../../config/ios27-assets.config';
import {
  DeviceModelId,
  DevicePreset,
  HardwareCutoutType,
  Orientation,
  SafeAreaInsets
} from '../../types/device.types';
import { BrowserShellMode, SimulatorState } from '../../types/simulator.types';
import { getDevicePresetById } from '../../config/device-presets.config';
import {
  computeShellChromeHeights,
  hasDuoSystemRail,
  resolveKeyboardHeight,
  resolveSafeAreaInsets
} from '../../utils/viewport-math.util';
import { DuoStatusRing } from './DuoStatusRing';
import { prefersLightContent } from '../../utils/color.util';
import { appMotionStyle, isHomeTool, useScreen } from './ScreenLayers';
import { setSafariBarCollapsed, useKeyboardVisible, useSafariBarCollapsed } from '../sim-events';
import { SoftwareKeyboard } from './SoftwareKeyboard';

export interface BrowserShellOverlayProps {
  readonly preset: DevicePreset;
  readonly orientation: Orientation;
  readonly safeArea: SafeAreaInsets;
  readonly darkMode: boolean;
  readonly shellMode?: BrowserShellMode;
  readonly currentUrl?: string;
  readonly onReload?: () => void;
  readonly onToggleDuoFold?: () => void;
}

export function getHostnameForDisplay(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === '127.0.0.1' && parsed.pathname === '/index.html') {
      return 'Start page';
    }
    return parsed.host;
  } catch {
    return rawUrl;
  }
}

function StatusRightCluster(props: { readonly darkMode: boolean }): React.ReactElement {
  const cellularSrc = props.darkMode
    ? IOS27_STATUS_ICONS.cellularLight
    : IOS27_STATUS_ICONS.cellularDark;
  const wifiSrc = props.darkMode
    ? IOS27_STATUS_ICONS.wifiLight
    : IOS27_STATUS_ICONS.wifiDark;
  const batterySrc = props.darkMode
    ? IOS27_STATUS_ICONS.batteryLight
    : IOS27_STATUS_ICONS.batteryDark;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <img src={cellularSrc} alt="Cellular" style={{ width: '17px', height: '11px' }} />
      <img src={wifiSrc} alt="Wi-Fi" style={{ width: '15px', height: '11px' }} />
      <img src={batterySrc} alt="Battery" style={{ width: '24px', height: '11.5px' }} />
    </div>
  );
}

export function HardwareCutout(props: {
  readonly cutoutType: HardwareCutoutType;
  readonly wideNotch?: boolean;
  readonly island?: DevicePreset['island'];
  readonly orientation: Orientation;
}): React.ReactElement | null {
  const { cutoutType, orientation } = props;
  if (
    cutoutType === HardwareCutoutType.UNDER_DISPLAY_HIDDEN ||
    cutoutType === HardwareCutoutType.NONE
  ) {
    return null;
  }
  if (cutoutType === HardwareCutoutType.DUO_OUTER_CORNER) {
    return (
      <div className="duo-v68-cover-camera" title="iPhone Duo Outer Front Camera (37×37pt)">
        <div className="camera-lens-ring" />
      </div>
    );
  }
  // Landscape = device rotated counter-clockwise (home indicator at the
  // bottom, sensor housing on the leading/left edge).
  const isLandscape = orientation === Orientation.LANDSCAPE;
  if (cutoutType === HardwareCutoutType.NOTCH) {
    return (
      <svg
        width={props.wideNotch ? 176 : 143}
        preserveAspectRatio="none"
        height="34"
        viewBox="0 0 176 34"
        style={
          isLandscape
            ? {
                position: 'absolute',
                top: '50%',
                left: 0,
                transformOrigin: '0 0',
                transform: 'rotate(-90deg) translate(-50%, 0)',
                zIndex: 40,
                pointerEvents: 'none'
              }
            : {
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 40,
                pointerEvents: 'none'
              }
        }
      >
        <path d={IOS27_NOTCH_03_SVG_PATH} fill="#030303" />
        <rect x="70" y={props.wideNotch ? 12 : 3} width="36" height="3" rx="1.5" fill="#17181a" />
        <circle cx={props.wideNotch ? 118 : 55} cy="15" r="3.4" fill="#111821" />
        <circle cx={props.wideNotch ? 117 : 54} cy="14" r="0.9" fill="#38485b" />
      </svg>
    );
  }
  if (!props.island) return null;
  return (
    <div
      data-source={props.island.source}
      aria-hidden="true"
      className={isLandscape ? 'cutout-island cutout-island-landscape' : 'cutout-island'}
      style={{flexDirection: props.island.camera === 'left' ? 'row-reverse' : 'row'}}
    >
      <div className="island-sensor-ir" />
      <div className="camera-lens-ring" />
    </div>
  );
}

function DeviceTime({period=false}:{period?:boolean}) {
  const [now,setNow]=React.useState(()=>new Date());
  React.useEffect(()=>{
    const timer=window.setTimeout(()=>setNow(new Date()),60000-Date.now()%60000);
    return ()=>window.clearTimeout(timer);
  },[now]);
  const parts=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).formatToParts(now);
  return <>{parts.filter(p=>period || p.type!=='dayPeriod').map(p=>p.value).join('').trim()}</>;
}

function DuoVerticalSystemRail(props: {
  readonly preset: DevicePreset;
  readonly darkMode: boolean;
}): React.ReactElement {
  const isOuter = props.preset.id === DeviceModelId.IPHONE_DUO_FOLDED;
  const fgColor = props.darkMode ? '#ffffff' : '#000000';
  const railSurfaceClass = props.darkMode ? 'ios-duo-rail-surface-dark' : 'ios-duo-rail-surface-light';

  return (
    <aside
      className={`ios-duo-vertical-rail ${railSurfaceClass}`}
      aria-label="iOS 27.3 Duo Right System Rail (84pt)"
      style={{
        top: 0,
        bottom: 0,
        right: 0,
        width: '84px',
        // The portrait cover lens ends about 66pt from the top of the glass.
        paddingTop: isOuter ? '78px' : '20px',
        paddingBottom: '18px',
        color: fgColor
      }}
    >
      <div className="ios-duo-v68-status">
        <span className="ios-v68-time"><DeviceTime/></span>
        <DuoStatusRing darkMode={props.darkMode} />
      </div>

      <div
        className="ios-v68-aux-line"
        style={{ background: props.darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)' }}
      />
    </aside>
  );
}

export function IosStatusBar(props: BrowserShellOverlayProps): React.ReactElement | null {
  const { preset, orientation, darkMode } = props;
  const fgColor = darkMode ? '#ffffff' : '#000000';
  const isDuoOuter = preset.cutoutType === HardwareCutoutType.DUO_OUTER_CORNER;
  const isDuoInner = preset.cutoutType === HardwareCutoutType.UNDER_DISPLAY_HIDDEN;

  // On iPhone Duo Outer (466×678) and Inner Book/Wide (951×669, Orientation.PORTRAIT),
  // iOS 27.3 reserves the trailing 84pt vertical system & menu rail.
  // On Inner Portrait (669×951, Orientation.LANDSCAPE), Apple HIG returns to the horizontal top status bar.
  if (isDuoOuter || (isDuoInner && orientation === Orientation.PORTRAIT)) {
    return (
      <DuoVerticalSystemRail
        preset={preset}
        darkMode={darkMode}
      />
    );
  }

  if (orientation === Orientation.LANDSCAPE && !isDuoInner) {
    return null;
  }

  if (preset.cutoutType === HardwareCutoutType.NONE) {
    // Touch ID iPhones: 20pt bar, time centered, signal leading, battery trailing.
    return (
      <div className="ios-status-classic" style={{ color: fgColor }}>
        <span className="ios-status-classic-side">
          <img
            src={darkMode ? IOS27_STATUS_ICONS.cellularLight : IOS27_STATUS_ICONS.cellularDark}
            alt="Cellular"
            style={{ width: '15px', height: '10px' }}
          />
          <img
            src={darkMode ? IOS27_STATUS_ICONS.wifiLight : IOS27_STATUS_ICONS.wifiDark}
            alt="Wi-Fi"
            style={{ width: '13px', height: '10px' }}
          />
        </span>
        <span className="ios-status-classic-time"><DeviceTime period/></span>
        <span className="ios-status-classic-side ios-status-classic-right">
          <span className="ios-status-classic-pct">100%</span>
          <img
            src={darkMode ? IOS27_STATUS_ICONS.batteryLight : IOS27_STATUS_ICONS.batteryDark}
            alt="Battery"
            style={{ width: '22px', height: '10.5px' }}
          />
        </span>
      </div>
    );
  }

  const hasIsland =
    preset.cutoutType === HardwareCutoutType.DYNAMIC_ISLAND ||
    preset.cutoutType === HardwareCutoutType.COMPACT_ISLAND;

  const statusStyle = {
    position: 'relative' as const,
    zIndex: 35,
    pointerEvents: 'none' as const
  };

  return (
    <div className="ios-status-horizontal" style={{ color: fgColor }}>
      <div className={hasIsland ? 'ios-status-ear-left' : 'ios-status-pad-left'} style={statusStyle}>
        <span className="ios-status-time"><DeviceTime/></span>
      </div>
      <div className={hasIsland ? 'ios-status-ear-right' : 'ios-status-pad-right'} style={statusStyle}>
        <StatusRightCluster darkMode={darkMode} />
      </div>
    </div>
  );
}

function dispatchWebviewNav(direction: 'back' | 'forward'): void {
  window.dispatchEvent(new CustomEvent('sim:webview-nav', { detail: direction }));
}

export interface BrowserShellBarOverlayProps {
  readonly shellMode: BrowserShellMode;
  readonly currentUrl: string;
  readonly darkMode: boolean;
  readonly onReload?: () => void;
  /** Exact heights the webview is inset by (computeShellChromeHeights). */
  readonly topBarHeight: number;
  readonly bottomBarHeight: number;
  /** Width reserved on the trailing edge (iPhone Duo system rail). */
  readonly trailingInset?: number;
  /** Page theme-color / background, used to tint the status-bar area like Safari. */
  readonly tintColor?: string | null;
  /** Safari compact bar minimised while scrolling down. */
  readonly collapsed?: boolean;
}

/**
 * iOS 26+/27 Safari "Compact" tab bar and Chrome for iOS chrome.
 * Bar geometry comes from props so the overlay and the <webview> inset are
 * computed from one source and can never drift apart by a pixel.
 */
function AddressField(props: { readonly url: string; readonly chrome?: boolean; readonly inputRef: React.RefObject<HTMLInputElement> }): React.ReactElement {
  const screen = useScreen();
  const [draft, setDraft] = React.useState<string | null>(null);
  const host = getHostnameForDisplay(props.url);
  return (
    <form className={`ios-shell-domain ios-address-form${props.chrome ? ' ios-chrome-domain' : ''}`} onSubmit={event => {
      event.preventDefault();
      const result = validateHttpUrl(draft ?? props.url, 'Address');
      if (!result.ok) {
        props.inputRef.current?.setCustomValidity(result.error.recoveryHint);
        props.inputRef.current?.reportValidity();
        return;
      }
      props.inputRef.current?.blur();
      screen.openUrl(result.value);
    }}>
      {props.url.startsWith('https://') && draft === null && <Lock size={10} />}
      <input ref={props.inputRef} type="text" inputMode="url" enterKeyHint="go" autoCapitalize="none"
        autoComplete="off" spellCheck={false} aria-label="Website address" title={props.url}
        value={draft ?? host} onFocus={e => {
          const input = e.currentTarget;
          setDraft(props.url);
          requestAnimationFrame(() => { if (input === document.activeElement) input.select(); });
        }} onBlur={() => setDraft(null)} onChange={e => { e.currentTarget.setCustomValidity(''); setDraft(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } }} />
    </form>
  );
}

export function BrowserShellBarOverlay(props: BrowserShellBarOverlayProps): React.ReactElement | null {
  const screen = useScreen();
  const addressRef = React.useRef<HTMLInputElement>(null);
  if (props.shellMode === BrowserShellMode.PWA_STANDALONE) {
    return null;
  }
  const host = getHostnameForDisplay(props.currentUrl);
  const isSecure = props.currentUrl.startsWith('https://');
  const isSafari = props.shellMode === BrowserShellMode.IOS_SAFARI;
  const glassClass = props.darkMode ? 'ios-liquid-glass-dark' : 'ios-liquid-glass-light';
  const chromeSurfaceClass = props.darkMode ? 'ios-browser-surface-dark' : 'ios-browser-surface-light';
  const trailing = props.trailingInset ?? 0;
  const topStyle: React.CSSProperties = {
    height: `${props.topBarHeight}px`,
    right: `${trailing}px`,
    ...(props.tintColor ? { background: props.tintColor } : {})
  };
  const bottomStyle: React.CSSProperties = {
    height: `${props.bottomBarHeight}px`,
    right: `${trailing}px`
  };

  if (isSafari && props.collapsed) {
    return (
      <>
        <div className={`ios-browser-top-backdrop ${chromeSurfaceClass}`} style={topStyle} aria-hidden="true" />
        <button
          type="button"
          className={`ios-safari-collapsed ${chromeSurfaceClass}`}
          style={bottomStyle}
          title="Tap to show the toolbar"
          onClick={(): void => setSafariBarCollapsed(false)}
        >
          {isSecure && <Lock size={8} />}
          <span className="ios-shell-domain-text">{host}</span>
        </button>
      </>
    );
  }

  if (isSafari) {
    return (
      <>
        <div className={`ios-browser-top-backdrop ${chromeSurfaceClass}`} style={topStyle} aria-hidden="true" />
        <div className={`ios-safari-bottom-dock ${chromeSurfaceClass}`} style={bottomStyle}>
          <button
            type="button"
            className={`ios-safari-round-btn ${glassClass}`}
            onClick={(): void => dispatchWebviewNav('back')}
            title="Back"
            aria-label="Back"
          >
            <ChevronLeft size={17} />
          </button>
          <div className={`ios-browser-shell-pill ios-safari-address-pill ${glassClass}`}>
            <button type="button" className="ios-shell-aa" aria-label="Page menu" onClick={() => screen.openSheet('browser-menu')}>AA</button>
            <AddressField url={props.currentUrl} inputRef={addressRef} />
            <button
              type="button"
              className="ios-shell-reload"
              onClick={props.onReload}
              title="Reload"
              aria-label="Reload"
            >
              <RotateCw size={12} />
            </button>
          </div>
          <button
            type="button"
            className={`ios-safari-round-btn ${glassClass}`}
            onClick={(): void => screen.openSheet('browser-menu')}
            title="More (Share, Forward…)"
            aria-label="More"
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`ios-chrome-top-dock ${chromeSurfaceClass}`} style={topStyle}>
        <div className={`ios-browser-shell-pill ios-chrome-omnibox ${glassClass}`}>
          <AddressField url={props.currentUrl} inputRef={addressRef} chrome />
          <button type="button" className="ios-shell-icon-btn"
            onClick={(): void => screen.openSheet('share')} title="Share" aria-label="Share">
            <Share size={16} />
          </button>
          <button
            type="button"
            className="ios-shell-reload"
            onClick={props.onReload}
            title="Reload"
            aria-label="Reload"
          >
            <RotateCw size={12} />
          </button>
        </div>
      </div>
      <div className={`ios-chrome-bottom-dock ${chromeSurfaceClass}`} style={bottomStyle}>
        <button
          type="button"
          className="ios-shell-icon-btn"
          onClick={(): void => dispatchWebviewNav('back')}
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="ios-shell-icon-btn"
          onClick={(): void => dispatchWebviewNav('forward')}
          title="Forward"
          aria-label="Forward"
        >
          <ChevronRight size={18} />
        </button>
        <button type="button" className="ios-shell-icon-btn" aria-label="Edit address" onClick={() => addressRef.current?.focus()}><Search size={18} /></button>
        <button type="button" className="ios-shell-icon-btn" aria-label="More" onClick={() => screen.openSheet('browser-menu')}><MoreHorizontal size={17} /></button>
      </div>
    </>
  );
}

export interface ScreenSystemOverlayProps {
  readonly preset: DevicePreset;
  readonly cutoutType: HardwareCutoutType;
  readonly orientation: Orientation;
  readonly state: SimulatorState;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly tintColor?: string | null;
  readonly onReload: () => void;
  readonly onToggleDuoFold?: () => void;
  readonly onGoHome?: () => void;
}

/** Resolves which physical display is lit (Duo cover vs inner) from the cutout. */
function resolveLitPreset(preset: DevicePreset, cutoutType: HardwareCutoutType): DevicePreset {
  if (cutoutType === HardwareCutoutType.DUO_OUTER_CORNER) {
    return getDevicePresetById(DeviceModelId.IPHONE_DUO_FOLDED);
  }
  if (cutoutType === HardwareCutoutType.UNDER_DISPLAY_HIDDEN) {
    return getDevicePresetById(DeviceModelId.IPHONE_DUO_UNFOLDED);
  }
  return preset;
}

/**
 * Everything iOS draws above an app: sensor housing, status bar / Duo rail,
 * Safari or Chrome chrome, home indicator. Shared by the flat frame and the
 * 3D Duo stage so both render pixel-identical system UI.
 */
export function ScreenSystemOverlay(props: ScreenSystemOverlayProps): React.ReactElement {
  const fullscreen = useGuestFullscreen();
  const lit = resolveLitPreset(props.preset, props.cutoutType);
  const safeArea = resolveSafeAreaInsets(lit, props.orientation);
  const safariCollapsed = useSafariBarCollapsed();
  const keyboardVisible = useKeyboardVisible();
  const chrome = computeShellChromeHeights(
    props.state.shellMode,
    safeArea,
    props.state.pwaStatusBarStyle,
    safariCollapsed
  );
  const trailing = hasDuoSystemRail(lit, props.orientation) ? safeArea.right : 0;
  const screen = useScreen();
  const onHome = screen.phase === 'home' || screen.phase === 'closing';
  const isPwa = onHome || props.state.shellMode === BrowserShellMode.PWA_STANDALONE;
  const sbStyle = props.state.pwaStatusBarStyle;
  // Status bar content colour, the way iOS resolves it:
  //  - Home Screen web app: black-translucent / black => light content,
  //    default => opaque band (theme-color, else system background).
  //  - Safari / Chrome: follows the tinted / material bar behind it.
  const pwaBand =
    !onHome && isPwa && chrome.topBarHeight > 0
      ? sbStyle === 'black'
        ? '#000000'
        : props.tintColor ?? (props.state.darkMode ? '#000000' : '#ffffff')
      : null;
  const statusBackdrop = onHome
    ? '#101527'
    : isPwa
    ? sbStyle === 'default'
      ? pwaBand
      : '#000000'
    : props.tintColor ?? (props.state.darkMode ? '#0e0e12' : '#f6f6fa');
  const insideTool = isHomeTool(screen.sheet.kind);
  const lightContent = insideTool ? screen.darkMode : prefersLightContent(statusBackdrop, props.state.darkMode);
  return (<>
    <div
      className={`ios-overlay-scaler ${onHome ? 'ios-overlay-home' : ''} ${insideTool ? 'ios-overlay-tool' : ''}`}
      style={{ width: `${props.logicalW}px`, height: `${props.logicalH}px`, ...(lit.island && {
        '--island-width': `${lit.island.width}px`, '--island-height': `${lit.island.height}px`, '--island-top': `${lit.island.top}px`
      }) } as React.CSSProperties}
    >
      <HardwareCutout island={lit.island} wideNotch={lit.id === DeviceModelId.IPHONE_11} cutoutType={props.cutoutType} orientation={props.orientation} />
      {(!fullscreen || onHome) && <>
      {pwaBand && (
        <div
          className="ios-pwa-status-band"
          aria-hidden="true"
          style={{ height: `${chrome.topBarHeight}px`, right: `${trailing}px`, background: pwaBand }}
        />
      )}
      <IosStatusBar
        preset={{ ...lit, cutoutType: props.cutoutType }}
        orientation={props.orientation}
        safeArea={safeArea}
        darkMode={lightContent}
        onToggleDuoFold={props.onToggleDuoFold}
      />
      <div className={`browser-motion-layer browser-motion-${screen.phase}`} style={appMotionStyle(screen.launchOrigin)}>
        <BrowserShellBarOverlay
          shellMode={screen.phase === 'home' ? BrowserShellMode.PWA_STANDALONE : props.state.shellMode}
          currentUrl={props.state.currentUrl}
          darkMode={props.state.darkMode}
          onReload={props.onReload}
          topBarHeight={chrome.topBarHeight}
          bottomBarHeight={chrome.bottomBarHeight}
          trailingInset={trailing}
          tintColor={props.tintColor}
          collapsed={safariCollapsed}
        />
      </div>
      <SoftwareKeyboard
        visible={keyboardVisible && screen.phase === 'app'}
        height={resolveKeyboardHeight(lit, props.orientation)}
        trailingInset={trailing}
        darkMode={props.state.darkMode}
        bottomSafeArea={safeArea.bottom}
      />
      </>}
    </div>
    {props.cutoutType !== HardwareCutoutType.NONE && <HomeGesture
      width={props.logicalW} height={props.logicalH} trailing={onHome ? 0 : trailing}
      light={insideTool ? screen.darkMode : onHome || (isPwa ? lightContent : props.state.darkMode)}
      immersive={fullscreen && !onHome} onHome={props.onGoHome} />}
  </>);
}
