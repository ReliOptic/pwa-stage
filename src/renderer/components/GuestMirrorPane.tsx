import React, { useEffect, useRef } from 'react';
import { GuestInputMessage } from '../../types/ipc-coordinator.types';
import { getSimulatorBridge } from '../../utils/renderer-bridge.util';

// ---------------------------------------------------------------------------
// Shared frame stream: one capture loop per guest, any number of viewers. The
// latest frame is kept so a pane that mounts mid-fold paints immediately
// instead of flashing black until the next frame arrives.
// ---------------------------------------------------------------------------
interface MirrorStream {
  refs: number;
  latest: ImageBitmap | null;
  seq: number;
  readonly viewers: Set<(bitmap: ImageBitmap) => void>;
  off: (() => void) | undefined;
}

const streams = new Map<number, MirrorStream>();

/** Starts (or joins) the mirror stream of a guest. Returns the release function. */
export function acquireGuestMirror(
  guestId: number,
  onFrame?: (bitmap: ImageBitmap) => void
): () => void {
  const bridge = getSimulatorBridge();
  let stream = streams.get(guestId);
  if (!stream) {
    const created: MirrorStream = { refs: 0, latest: null, seq: 0, viewers: new Set(), off: undefined };
    created.off = bridge.onGuestFrame?.((frame): void => {
      if (frame.guestId !== guestId) return;
      const seq = ++created.seq;
      void createImageBitmap(new Blob([frame.jpeg as BlobPart], { type: 'image/jpeg' })).then(
        (bitmap): void => {
          if (seq !== created.seq || streams.get(guestId) !== created) {
            bitmap.close();
            return;
          }
          created.latest?.close();
          created.latest = bitmap;
          created.viewers.forEach((viewer) => viewer(bitmap));
        }
      );
    });
    void bridge.setGuestMirror?.(guestId, true);
    streams.set(guestId, created);
    stream = created;
  }
  const active = stream;
  active.refs += 1;
  if (onFrame) {
    active.viewers.add(onFrame);
    if (active.latest) onFrame(active.latest);
  }
  return (): void => {
    if (onFrame) active.viewers.delete(onFrame);
    active.refs -= 1;
    if (active.refs <= 0 && streams.get(guestId) === active) {
      streams.delete(guestId);
      active.off?.();
      active.latest?.close();
      active.latest = null;
      void bridge.setGuestMirror?.(guestId, false);
    }
  };
}

/**
 * Shows a live mirror of another pane's <webview> guest and forwards pointer
 * input to it. Used for the left half of the iPhone Duo's inner display so the
 * two transformed halves are one continuous, single page.
 */
export function GuestMirrorPane(props: { readonly guestId: number | null }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pressedRef = useRef<boolean>(false);
  const { guestId } = props;

  useEffect((): (() => void) | void => {
    if (guestId === null) return;
    const draw = (bitmap: ImageBitmap): void => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
      // Right after the hand-off the guest is still presenting frames laid
      // out for the other display. Drawing those would stretch them across
      // this panel, so wait for a frame with the right shape.
      const paneAspect = canvas.clientWidth / canvas.clientHeight;
      const frameAspect = bitmap.width / bitmap.height;
      if (Math.abs(frameAspect / paneAspect - 1) > 0.03) return;
      canvas.classList.add('guest-mirror-ready');
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    };
    return acquireGuestMirror(guestId, draw);
  }, [guestId]);

  const send = (type: GuestInputMessage['type'], e: React.PointerEvent | React.WheelEvent): void => {
    if (guestId === null) return;
    const native = e.nativeEvent as PointerEvent & WheelEvent;
    void getSimulatorBridge().sendGuestInput?.(guestId, {
      type,
      // offsetX/Y are in the canvas' own (untransformed) CSS pixels, which is
      // exactly the guest's coordinate space: both boxes have the same layout.
      x: native.offsetX,
      y: native.offsetY,
      deltaX: type === 'mouseWheel' ? -native.deltaX : 0,
      deltaY: type === 'mouseWheel' ? -native.deltaY : 0
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="guest-mirror-canvas"
      onPointerDown={(e): void => {
        pressedRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        send('mouseDown', e);
      }}
      onPointerMove={(e): void => {
        if (pressedRef.current) send('mouseMove', e);
      }}
      onPointerUp={(e): void => {
        if (pressedRef.current) {
          pressedRef.current = false;
          send('mouseUp', e);
        }
      }}
      onPointerCancel={(): void => {
        pressedRef.current = false;
      }}
      onWheel={(e): void => send('mouseWheel', e)}
    />
  );
}
