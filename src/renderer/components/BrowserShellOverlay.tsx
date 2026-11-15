import React from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Lock,
  MoreHorizontal,
  Plus,
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
import { BrowserShellMode } from '../../types/simulator.types';
import { DuoStatusRing } from './DuoStatusRing';

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
    if (parsed.hostname === '127.0.0.1' && parsed.pathname.includes('reference.html')) {
      return 'campsite.ing (Reboot Preview)';
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
  readonly orientation: Orientation;
}): React.ReactElement | null {
  const { cutoutType, orientation } = props;
  if (cutoutType === HardwareCutoutType.UNDER_DISPLAY_HIDDEN) {
    return null;
  }
  if (cutoutType === HardwareCutoutType.DUO_OUTER_CORNER) {
    return (
      <div className="duo-v68-cover-camera" title="iPhone Duo Outer Front Camera (37×37pt)">
        <div className="camera-lens-ring" />
      </div>
    );
  }
  if (orientation === Orientation.LANDSCAPE) {
    return null;
  }
  if (cutoutType === HardwareCutoutType.NOTCH) {
    return (
      <svg
        width="176"
        height="34"
        viewBox="0 0 176 34"
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 40,
          pointerEvents: 'none'
        }}
      >
        <path d={IOS27_NOTCH_03_SVG_PATH} fill="#000000" />
      </svg>
    );
  }
  return (
    <div className="cutout-island" style={{ zIndex: 40 }}>
      <div className="island-sensor-ir" />
      <div className="camera-lens-ring" />
    </div>
  );
}

function DuoVerticalSystemRail(props: {
  readonly preset: DevicePreset;
  readonly darkMode: boolean;
}): React.ReactElement {
  const isOuter = props.preset.id === DeviceModelId.IPHONE_DUO_FOLDED;
  const fgColor = props.darkMode ? '#ffffff' : '#000000';

  const innerStyle = {
    position: 'relative' as const,
    zIndex: 38,
    pointerEvents: 'none' as const
  };

  return (
    <div
      className="ios-duo-vertical-rail"
      style={{
        position: 'absolute',
        top: isOuter ? '56px' : '20px',
        right: isOuter ? '6px' : '8px',
        color: fgColor,
        zIndex: 38,
        pointerEvents: 'none'
      }}
    >
      <div className="ios-duo-v68-status" style={innerStyle}>
        <span className="ios-v68-time">9:41</span>
        <DuoStatusRing darkMode={props.darkMode} />
      </div>
    </div>
  );
}

export function IosStatusBar(props: BrowserShellOverlayProps): React.ReactElement | null {
  const { preset, orientation, darkMode } = props;
  const fgColor = darkMode ? '#ffffff' : '#000000';
  const isDuoOuter = preset.cutoutType === HardwareCutoutType.DUO_OUTER_CORNER;
  const isDuoInner = preset.cutoutType === HardwareCutoutType.UNDER_DISPLAY_HIDDEN;

  // On iPhone Duo Outer (466×678) and Inner Book/Wide (951×669, Orientation.PORTRAIT),
  // iOS 27 places the V68 combined status ring vertically in the top-trailing corner.
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
        <span className="ios-status-time">9:41</span>
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

export function BrowserShellBarOverlay(props: {
  readonly shellMode: BrowserShellMode;
  readonly currentUrl: string;
  readonly darkMode: boolean;
  readonly onReload?: () => void;
}): React.ReactElement | null {
  if (props.shellMode === BrowserShellMode.PWA_STANDALONE) {
    return null;
  }
  const host = getHostnameForDisplay(props.currentUrl);
  const isSafari = props.shellMode === BrowserShellMode.IOS_SAFARI;
  const glassClass = props.darkMode ? 'ios-liquid-glass-dark' : 'ios-liquid-glass-light';
  const chromeSurfaceClass = props.darkMode ? 'ios-browser-surface-dark' : 'ios-browser-surface-light';

  if (isSafari) {
    return (
      <>
        <div className={`ios-browser-top-backdrop ${chromeSurfaceClass}`} aria-hidden="true" />
        <div className={`ios-safari-bottom-dock ${chromeSurfaceClass}`}>
          <div className={`ios-browser-shell-pill ios-safari-address-pill ${glassClass}`}>
            <button
              type="button"
              className="ios-shell-icon-btn"
              onClick={(): void => dispatchWebviewNav('back')}
              title="Back"
              aria-label="Back"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="ios-shell-icon-btn"
              onClick={(): void => dispatchWebviewNav('forward')}
              title="Forward"
              aria-label="Forward"
            >
              <ChevronRight size={14} />
            </button>
            <span className="ios-shell-aa">AA</span>
            <span className="ios-shell-domain">
              <Lock size={10} />
              <span>{host}</span>
            </span>
            <button
              type="button"
              className="ios-shell-reload"
              onClick={props.onReload}
              title="Reload"
              aria-label="Reload"
            >
              <RotateCw size={12} />
            </button>
            <span className="ios-shell-icon-passive" aria-hidden="true">
              <Share size={12} />
            </span>
            <span className="ios-shell-icon-passive" aria-hidden="true">
              <BookOpen size={12} />
            </span>
            <span className="ios-shell-icon-passive" aria-hidden="true">
              <Copy size={12} />
            </span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`ios-chrome-top-dock ${chromeSurfaceClass}`}>
        <div className={`ios-browser-shell-pill ios-chrome-omnibox ${glassClass}`}>
          <span className="ios-shell-aa">G</span>
          <span className="ios-shell-domain">
            <Lock size={10} />
            <span>{host}</span>
          </span>
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
      <div className={`ios-chrome-bottom-dock ${chromeSurfaceClass}`}>
        <button
          type="button"
          className="ios-shell-icon-btn"
          onClick={(): void => dispatchWebviewNav('back')}
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="ios-shell-icon-btn"
          onClick={(): void => dispatchWebviewNav('forward')}
          title="Forward"
          aria-label="Forward"
        >
          <ChevronRight size={16} />
        </button>
        <span className="ios-chrome-plus-btn" aria-hidden="true">
          <Plus size={15} />
        </span>
        <span className="ios-chrome-tab-badge" aria-hidden="true">1</span>
        <span className="ios-shell-icon-passive" aria-hidden="true">
          <MoreHorizontal size={15} />
        </span>
      </div>
    </>
  );
}

export function HomeIndicatorOverlay(props: {
  readonly darkMode: boolean;
}): React.ReactElement {
  return (
    <div
      className="ios-home-indicator"
      style={{
        background: props.darkMode
          ? 'rgba(255, 255, 255, 0.82)'
          : 'rgba(0, 0, 0, 0.68)'
      }}
    />
  );
}
