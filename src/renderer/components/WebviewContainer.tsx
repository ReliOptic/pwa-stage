import React, { useEffect, useRef, useState } from 'react';
import { getDevicePresetById } from '../../config/device-presets.config';
import { getSimulatorBridge, isElectronRuntime } from '../../utils/renderer-bridge.util';
import {
  computeShellChromeHeights,
  hasDuoSystemRail,
  resolveSafeAreaInsets
} from '../../utils/viewport-math.util';
import { setSafariBarCollapsed, useSafariBarCollapsed } from '../sim-events';
import { ElectronWebviewElement } from '../../types/renderer.types';
import { DuoDisplayMode, SimulatorState } from '../../types/simulator.types';

export interface WebviewContainerProps {
  readonly state: SimulatorState;
  readonly isDualUnfolded: boolean;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId: (id: number) => void;
  readonly onPageReady?: (webContentsId: number) => void;
}

interface SingleViewportPaneProps {
  readonly targetUrl: string;
  readonly state: SimulatorState;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId?: (id: number) => void;
  readonly onPageReady?: (webContentsId: number) => void;
}

function useWebviewEffects(
  electronMode: boolean,
  webviewRef: React.RefObject<ElectronWebviewElement | null>,
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  props: SingleViewportPaneProps
): void {
  const readyRef = useRef<boolean>(false);
  const shellModeRef = useRef(props.state.shellMode);

  useEffect((): (() => void) | void => {
    if (!electronMode || !webviewRef.current) {
      return;
    }
    const el = webviewRef.current;
    const applyEmulation = (): Promise<unknown> => {
      readyRef.current = true;
      const id = el.getWebContentsId();
      props.onRegisterWebContentsId?.(id);
      return getSimulatorBridge().applyWebviewEmulation({
        webContentsId: id,
        state: props.state
      });
    };
    const syncEmulation = (): void => {
      void applyEmulation();
    };
    const shellChanged = shellModeRef.current !== props.state.shellMode;
    shellModeRef.current = props.state.shellMode;
    if (readyRef.current) {
      if (shellChanged) {
        // Moving between Safari, Chrome and a Home Screen web app is a fresh
        // launch on iOS: reload so the page boots with the new environment.
        void applyEmulation().then((): void => el.reload());
      } else {
        syncEmulation();
      }
    }
    const handleEnterFs = (): void => {
      window.dispatchEvent(new CustomEvent('sim:html-fullscreen', { detail: true }));
    };
    const handleLeaveFs = (): void => {
      window.dispatchEvent(new CustomEvent('sim:html-fullscreen', { detail: false }));
    };
    const notifyReady = (): void => {
      if (props.onPageReady) {
        props.onPageReady(el.getWebContentsId());
      }
    };
    const onConsole = (evt: Event): void => {
      const message = (evt as Event & { message?: string }).message ?? '';
      if (message === '__sim:safari-bar:collapse') setSafariBarCollapsed(true);
      else if (message === '__sim:safari-bar:expand') setSafariBarCollapsed(false);
    };
    const onNavigate = (): void => setSafariBarCollapsed(false);
    // Chromium's mobile metrics override is computed against the guest size at
    // the time it is sent; when the <webview> box changes (Safari bar
    // collapsing, Duo folding, rotation) it must be re-sent or the page paints
    // offset inside the new box.
    let resizeTimer: number | null = null;
    const resizeObserver = new ResizeObserver((): void => {
      if (!readyRef.current) return;
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(syncEmulation, 60);
    });
    resizeObserver.observe(el);
    el.addEventListener('console-message', onConsole);
    el.addEventListener('did-navigate', onNavigate);
    el.addEventListener('did-finish-load', notifyReady);
    el.addEventListener('did-navigate-in-page', notifyReady);
    el.addEventListener('dom-ready', syncEmulation);
    el.addEventListener('did-navigate', syncEmulation);
    el.addEventListener('did-navigate-in-page', syncEmulation);
    el.addEventListener('enter-html-full-screen', handleEnterFs);
    el.addEventListener('leave-html-full-screen', handleLeaveFs);
    return (): void => {
      resizeObserver.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      el.removeEventListener('console-message', onConsole);
      el.removeEventListener('did-navigate', onNavigate);
      el.removeEventListener('did-finish-load', notifyReady);
      el.removeEventListener('did-navigate-in-page', notifyReady);
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
    props.state.touchCursorEnabled,
    props.state.pwaStatusBarStyle
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
  const { state, isDualUnfolded, reloadTick, onRegisterWebContentsId, onPageReady } = props;
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
  const safariCollapsed = useSafariBarCollapsed();
  const chrome = computeShellChromeHeights(
    state.shellMode,
    safeArea,
    state.pwaStatusBarStyle,
    safariCollapsed
  );
  const hasDuoRightRail = !isHtmlFullscreen && hasDuoSystemRail(preset, state.orientation);
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
          onPageReady={onPageReady}
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
        onPageReady={onPageReady}
      />
    </div>
  );
}
