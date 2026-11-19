import React, { useContext, useEffect, useRef } from 'react';
import { getDevicePresetById } from '../../config/device-presets.config';
import { getSimulatorBridge, isElectronRuntime } from '../../utils/renderer-bridge.util';
import {
  computeShellChromeHeights,
  hasDuoSystemRail,
  resolveSafeAreaInsets
} from '../../utils/viewport-math.util';
import { setKeyboardVisible, setSafariBarCollapsed, useSafariBarCollapsed } from '../sim-events';
import { FullscreenPane, setGuestFullscreen, useGuestFullscreen } from '../guest-fullscreen';
import { readPageZoom, ZOOM_CHANGED } from '../browser-preferences';
import { GuestMirrorPane } from './GuestMirrorPane';
import { ElectronWebviewElement } from '../../types/renderer.types';
import { SimulatorState } from '../../types/simulator.types';

export interface WebviewContainerProps {
  readonly state: SimulatorState;
  readonly isDualUnfolded: boolean;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId: (id: number) => void;
  readonly onPageReady?: (webContentsId: number) => void;
  readonly onNavigate?: (url: string) => void;
  /**
   * When set (even to null while the id is still unknown), this container
   * shows a live mirror of that guest instead of loading its own page.
   */
  readonly mirrorGuestId?: number | null;
  readonly mirrorCoverFrameOffsetX?: number;
  readonly mirrorInteractive?: boolean;
  readonly reserveSystemRail?: boolean;
}

interface SingleViewportPaneProps {
  readonly targetUrl: string;
  readonly state: SimulatorState;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId?: (id: number) => void;
  readonly onPageReady?: (webContentsId: number) => void;
  readonly onNavigate?: (url: string) => void;
}

function useWebviewEffects(
  electronMode: boolean,
  webviewRef: React.RefObject<ElectronWebviewElement | null>,
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  props: SingleViewportPaneProps
): void {
  const pane = useContext(FullscreenPane);
  const latest = useRef(props);
  latest.current = props;
  const ready = useRef(false);
  const synchronize = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!electronMode || !webviewRef.current) return;
    const el = webviewRef.current;
    let disposed = false;
    let attached = false;
    let queue = Promise.resolve();
    let pendingNavigation: {url:string} | null = null;
    let committedUrl = '';
    let navigationStart = '';
    let appliedShell = props.state.shellMode;
    let lastReload = props.reloadTick;
    let sentWidth = 0, sentHeight = 0;
    let resizing = false;
    const bridge = getSimulatorBridge();
    const sizeOfPane = () => ({width:el.clientWidth, height:el.clientHeight});
    const publishSize = async (): Promise<void> => {
      if (disposed || !ready.current || resizing || !bridge.resizeWebview) return;
      const size = sizeOfPane();
      if (!size.width || !size.height || (size.width === sentWidth && size.height === sentHeight)) return;
      sentWidth = size.width;
      sentHeight = size.height;
      resizing = true;
      try {
        await bridge.resizeWebview(el.getWebContentsId(), size);
      } catch (error) {
        if (!disposed) console.error('Could not resize mobile viewport', error);
      } finally {
        resizing = false;
      }
      void publishSize(); // A newer fold frame may have arrived during the IPC call.
    };
    const observer = new ResizeObserver(() => {void publishSize();});
    observer.observe(el);

    const applyZoom = (): void => {
      if (!ready.current || disposed) return;
      const {state, targetUrl} = latest.current;
      el.setZoomFactor(readPageZoom(state.shellMode, targetUrl) / 100);
    };
    const sync = (): void => {
      queue = queue.then(async () => {
        if (disposed || !attached) return;
        const next = latest.current;
        const id = el.getWebContentsId();
        next.onRegisterWebContentsId?.(id);
        const viewportSize = sizeOfPane();
        const result = await bridge.applyWebviewEmulation({webContentsId:id, state:next.state, viewportSize});
        if (!result.ok) throw new Error(result.error.message);
        if (disposed) return;
        const shellChanged = appliedShell !== next.state.shellMode;
        const reloadChanged = lastReload !== next.reloadTick;
        appliedShell = next.state.shellMode;
        lastReload = next.reloadTick;
        ready.current = true;
        void publishSize();
        applyZoom();
        // src remains inert: even the first real request follows emulation.
        // Skip stale requests when URL/state changed while IPC was in flight.
        if (next.targetUrl !== latest.current.targetUrl || next.state.shellMode !== latest.current.state.shellMode) { sync(); return; }
        if ((pendingNavigation?.url ?? el.getURL()) !== next.targetUrl || (pendingNavigation && (shellChanged || reloadChanged))) {
          // Keep profile updates and Home Screen launches responsive while media is still loading.
          const request = {url:next.targetUrl};
          pendingNavigation = request;
          void el.loadURL?.(request.url).catch(error => {
            if (!disposed && pendingNavigation === request) console.error('Could not load the page', error);
          }).finally(() => {
            if (pendingNavigation === request) pendingNavigation = null;
          });
        } else if (shellChanged || reloadChanged) {
          el.reloadIgnoringCache();
        }
      }).catch((error: unknown) => {
        if (!disposed) console.error('Could not configure mobile viewport', error);
      });
    };
    synchronize.current = sync;
    const onDomReady = (): void => {
      attached = true;
      if (!ready.current) sync();
      else notifyReady();
    };
    const notifyReady = (): void => {
      applyZoom();
      if (ready.current && /^https?:/.test(el.getURL())) latest.current.onPageReady?.(el.getWebContentsId());
    };
    type NavigationEvent = Event & {url?:string;isMainFrame?:boolean};
    const onNavigationStart = (event:NavigationEvent):void => {
      if (event.isMainFrame !== false) navigationStart = event.url || '';
    };
    const onNavigate = (event:NavigationEvent): void => {
      if (event.isMainFrame === false) return;
      const url = event.url || el.getURL();
      if (!ready.current || !/^https?:/.test(url)) return;
      const desired = latest.current.targetUrl;
      // Changing a mobile profile can reload the previous document while a
      // Home Screen deep link is being selected. Keep the requested launch.
      if (committedUrl && desired !== committedUrl && url !== desired && navigationStart !== desired) return;
      committedUrl = url;
      if (pendingNavigation?.url === url) pendingNavigation = null;
      setSafariBarCollapsed(false);
      setKeyboardVisible(false);
      latest.current.onNavigate?.(url);
    };
    const onInPage = (event:NavigationEvent): void => { onNavigate(event); notifyReady(); };
    const onConsole = (evt: Event): void => {
      const message = (evt as Event & { message?: string }).message ?? '';
      if (message === '__sim:safari-bar:collapse') setSafariBarCollapsed(true);
      else if (message === '__sim:safari-bar:expand') setSafariBarCollapsed(false);
      else if (message === '__sim:keyboard:show') setKeyboardVisible(true);
      else if (message === '__sim:keyboard:hide') setKeyboardVisible(false);
    };
    const enterFs = (): void => setGuestFullscreen(pane, el, true);
    const leaveFs = (): void => setGuestFullscreen(pane, el, false);
    const listeners: [string, EventListener][] = [
      ['dom-ready', onDomReady], ['did-start-navigation', onNavigationStart], ['did-navigate', onNavigate], ['did-navigate', leaveFs], ['render-process-gone', leaveFs],
      ['did-navigate-in-page', onInPage], ['did-finish-load', notifyReady],
      ['console-message', onConsole], ['enter-html-full-screen', enterFs], ['leave-html-full-screen', leaveFs]
    ];
    window.addEventListener(ZOOM_CHANGED, applyZoom);
    listeners.forEach(([name, listener]) => el.addEventListener(name, listener));
    return () => {
      window.removeEventListener(ZOOM_CHANGED, applyZoom);
      disposed = true;
      observer.disconnect();
      leaveFs();
      ready.current = false;
      synchronize.current = null;
      listeners.forEach(([name, listener]) => el.removeEventListener(name, listener));
    };
  }, [electronMode, pane]);

  useEffect(() => {
    synchronize.current?.();
    if (!electronMode && iframeRef.current && props.reloadTick) iframeRef.current.src = props.targetUrl;
  }, [electronMode, props.targetUrl, props.reloadTick, props.state.selectedDeviceId,
    props.state.orientation, props.state.shellMode, props.state.darkMode,
    props.state.touchCursorEnabled, props.state.pwaStatusBarStyle]);

  useEffect(() => {
    if (!electronMode) return;
    const handleNav = (evt: Event): void => {
      const action = (evt as CustomEvent<'back' | 'forward'>).detail;
      const el = webviewRef.current as (ElectronWebviewElement & {
        canGoBack?: () => boolean; canGoForward?: () => boolean;
      }) | null;
      if (!ready.current || !el) return;
      if (action === 'back' && el.canGoBack?.()) el.goBack();
      else if (action === 'forward' && el.canGoForward?.()) el.goForward();
    };
    window.addEventListener('sim:webview-nav', handleNav);
    return () => window.removeEventListener('sim:webview-nav', handleNav);
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
      src: 'about:blank',
      partition: getSimulatorBridge().guestPartition,
      allowpopups: 'true',
      style: {
        display: 'inline-flex',
        width: '100%',
        height: '100%',
        border: 'none',
        flex: 1,
        // Black behind the guest: compositor tile seams under the Duo's
        // perspective transform must not flash a light line. The white page
        // canvas comes from the opaque guest itself (see security.ts).
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
  const { state, reloadTick, onRegisterWebContentsId, onPageReady } = props;
  const isHtmlFullscreen = useGuestFullscreen();

  const preset = getDevicePresetById(state.selectedDeviceId);
  const safeArea = resolveSafeAreaInsets(preset, state.orientation);
  const safariCollapsed = useSafariBarCollapsed();
  const chrome = computeShellChromeHeights(
    state.shellMode,
    safeArea,
    state.pwaStatusBarStyle,
    safariCollapsed
  );
  const hasDuoRightRail = props.reserveSystemRail !== false && !isHtmlFullscreen && hasDuoSystemRail(preset, state.orientation);
  const chromeInsetStyle: React.CSSProperties = {
    paddingTop: isHtmlFullscreen ? '0px' : `${chrome.topBarHeight}px`,
    paddingBottom: isHtmlFullscreen ? '0px' : `${chrome.bottomBarHeight}px`,
    paddingRight: hasDuoRightRail ? `${safeArea.right}px` : '0px',
    boxSizing: 'border-box',
    background: state.darkMode ? '#09090c' : '#f4f4f6'
  };

  if (props.mirrorGuestId !== undefined) {
    return (
      <div className="webview-full-bleed" style={chromeInsetStyle}>
        <GuestMirrorPane
          guestId={props.mirrorGuestId}
          coverFrameOffsetX={props.mirrorCoverFrameOffsetX}
          interactive={props.mirrorInteractive}
          touchInput={!state.touchCursorEnabled}
        />
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
        onNavigate={props.onNavigate}
      />
    </div>
  );
}
