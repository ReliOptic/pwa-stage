import React, { useEffect, useRef } from 'react';
import { getSimulatorBridge, isElectronRuntime } from '../../utils/renderer-bridge.util';
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
    el.addEventListener('dom-ready', syncEmulation);
    el.addEventListener('did-navigate', syncEmulation);
    el.addEventListener('did-navigate-in-page', syncEmulation);
    return (): void => {
      el.removeEventListener('dom-ready', syncEmulation);
      el.removeEventListener('did-navigate', syncEmulation);
      el.removeEventListener('did-navigate-in-page', syncEmulation);
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
  const isSplitDuo =
    isDualUnfolded && state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON;

  if (isSplitDuo) {
    return (
      <div
        className="webview-full-bleed"
        style={{ display: 'flex', flexDirection: 'row', gap: '2px', background: '#000000' }}
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
    <div className="webview-full-bleed">
      <SingleViewportPane
        targetUrl={state.currentUrl}
        state={state}
        reloadTick={reloadTick}
        onRegisterWebContentsId={onRegisterWebContentsId}
      />
    </div>
  );
}
