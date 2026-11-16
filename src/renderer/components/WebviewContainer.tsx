import React, { useEffect, useRef, useState } from 'react';
import { getDevicePresetById } from '../../config/device-presets.config';
import { getSimulatorBridge, isElectronRuntime } from '../../utils/renderer-bridge.util';
import { computeShellChromeHeights, resolveSafeAreaInsets } from '../../utils/viewport-math.util';
import { HardwareCutoutType, Orientation } from '../../types/device.types';
import { ElectronWebviewElement } from '../../types/renderer.types';
import { DuoDisplayMode, SimulatorState } from '../../types/simulator.types';

export interface WebviewContainerProps {
  readonly state: SimulatorState;
  readonly isDualUnfolded: boolean;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId: (id: number) => void;
}

interface SingleViewportPaneProps {
  readonly targetUrl: string;
  readonly state: SimulatorState;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId?: (id: number) => void;
}

function useWebviewEffects(
  electronMode: boolean,
  webviewRef: React.RefObject<ElectronWebviewElement | null>,
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  props: SingleViewportPaneProps
): void {
  const readyRef = useRef<boolean>(false);

  useEffect((): (() => void) | void => {
    if (!electronMode || !webviewRef.current) {
      return;
    }
    const el = webviewRef.current;
    const syncEmulation = (): void => {
      readyRef.current = true;
      const id = el.getWebContentsId();
      props.onRegisterWebContentsId?.(id);
      void getSimulatorBridge().applyWebviewEmulation({
        webContentsId: id,
        state: props.state
      });
    };
    if (readyRef.current) {
      syncEmulation();
    }
    const handleEnterFs = (): void => {
      window.dispatchEvent(new CustomEvent('sim:html-fullscreen', { detail: true }));
    };
    const handleLeaveFs = (): void => {
      window.dispatchEvent(new CustomEvent('sim:html-fullscreen', { detail: false }));
    };
    el.addEventListener('dom-ready', syncEmulation);
    el.addEventListener('did-navigate', syncEmulation);
    el.addEventListener('did-navigate-in-page', syncEmulation);
    el.addEventListener('enter-html-full-screen', handleEnterFs);
    el.addEventListener('leave-html-full-screen', handleLeaveFs);
    return (): void => {
      el.removeEventListener('dom-ready', syncEmulation);
      el.removeEventListener('did-navigate', syncEmulation);
      el.removeEventListener('did-navigate-in-page', syncEmulation);
      el.removeEventListener('enter-html-full-screen', handleEnterFs);
      el.removeEventListener('leave-html-full-screen', handleLeaveFs);
    };
  }, [
    electronMode,
    props.targetUrl,
    props.state.selectedDeviceId,
    props.state.orientation,
    props.state.shellMode,
    props.state.darkMode,
    props.state.scale,
    props.state.touchCursorEnabled
  ]);

  useEffect((): void => {
    if (props.reloadTick === 0) {
      return;
    }
    if (electronMode && webviewRef.current) {
      webviewRef.current.reloadIgnoringCache();
    } else if (iframeRef.current) {
      iframeRef.current.src = props.targetUrl;
    }
  }, [props.reloadTick, electronMode, props.targetUrl]);

  useEffect((): (() => void) | void => {
    if (!electronMode) {
      return;
    }
    const handleNav = (evt: Event): void => {
      const action = (evt as CustomEvent<'back' | 'forward'>).detail;
      const el = webviewRef.current as (ElectronWebviewElement & {
        canGoBack?: () => boolean;
        canGoForward?: () => boolean;
        goBack?: () => void;
        goForward?: () => void;
      }) | null;
      if (!el) return;
      if (action === 'back' && el.canGoBack?.()) {
        el.goBack?.();
      } else if (action === 'forward' && el.canGoForward?.()) {
        el.goForward?.();
      }
    };
    window.addEventListener('sim:webview-nav', handleNav);
    return (): void => window.removeEventListener('sim:webview-nav', handleNav);
  }, [electronMode]);
}

function SingleViewportPane(props: SingleViewportPaneProps): React.ReactElement {
  const webviewRef = useRef<ElectronWebviewElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const electronMode = isElectronRuntime();

  useWebviewEffects(electronMode, webviewRef, iframeRef, props);

  if (electronMode) {
    return React.createElement('webview', {
      ref: webviewRef,
      src: props.targetUrl,
      allowpopups: 'true',
      style: {
        display: 'inline-flex',
        width: '100%',
        height: '100%',
        border: 'none',
        flex: 1,
        background: '#000000'
      }
    });
  }

  return (
    <iframe
      ref={iframeRef}
      src={props.targetUrl}
      title="Mobile PWA Viewport"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        flex: 1,
        background: '#000000'
      }}
    />
  );
}

export function WebviewContainer(props: WebviewContainerProps): React.ReactElement {
  const { state, isDualUnfolded, reloadTick, onRegisterWebContentsId } = props;
  const [isHtmlFullscreen, setIsHtmlFullscreen] = useState<boolean>(false);

  useEffect((): (() => void) => {
    const onFs = (evt: Event): void => {
      setIsHtmlFullscreen(Boolean((evt as CustomEvent<boolean>).detail));
    };
    window.addEventListener('sim:html-fullscreen', onFs);
    return (): void => window.removeEventListener('sim:html-fullscreen', onFs);
  }, []);

  const isSplitDuo =
    isDualUnfolded && state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON;
  const preset = getDevicePresetById(state.selectedDeviceId);
  const safeArea = resolveSafeAreaInsets(preset, state.orientation);
  const chrome = computeShellChromeHeights(state.shellMode, safeArea);
  const hasDuoRightRail =
    !isHtmlFullscreen &&
    (preset.cutoutType === HardwareCutoutType.DUO_OUTER_CORNER ||
      (preset.cutoutType === HardwareCutoutType.UNDER_DISPLAY_HIDDEN &&
        state.orientation === Orientation.PORTRAIT));
  const chromeInsetStyle: React.CSSProperties = {
    paddingTop: isHtmlFullscreen ? '0px' : `${chrome.topBarHeight}px`,
    paddingBottom: isHtmlFullscreen ? '0px' : `${chrome.bottomBarHeight}px`,
    paddingRight: hasDuoRightRail ? `${safeArea.right}px` : '0px',
    boxSizing: 'border-box',
    background: state.darkMode ? '#09090c' : '#f4f4f6'
  };

  if (isSplitDuo) {
    return (
      <div
        className="webview-full-bleed"
        style={{
          ...chromeInsetStyle,
          display: 'flex',
          flexDirection: 'row',
          gap: '2px',
          background: '#000000'
        }}
      >
        <SingleViewportPane
          targetUrl={state.currentUrl}
          state={state}
          reloadTick={reloadTick}
          onRegisterWebContentsId={onRegisterWebContentsId}
        />
        <SingleViewportPane targetUrl={state.currentUrl} state={state} reloadTick={reloadTick} />
      </div>
    );
  }

  return (
    <div className="webview-full-bleed" style={chromeInsetStyle}>
      <SingleViewportPane
        targetUrl={state.currentUrl}
        state={state}
        reloadTick={reloadTick}
        onRegisterWebContentsId={onRegisterWebContentsId}
      />
    </div>
  );
}
