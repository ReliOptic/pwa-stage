import React, { useLayoutEffect, useRef } from 'react';
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
    const created: MirrorStream = { refs: 0, latest: null, viewers: new Set(), off: undefined };
    // Decode one frame at a time and always finish with the newest one. A
    // decoded frame is never thrown away just because another arrived while
    // it was decoding: under load that would starve the mirror completely.
    let decoding = false;
    let pending: Uint8Array | null = null;
    const decode = (jpeg: Uint8Array): void => {
      decoding = true;
      void createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }))
        .then((bitmap): void => {
          if (streams.get(guestId) !== created) {
            bitmap.close();
            return;
          }
          created.latest?.close();
          created.latest = bitmap;
          created.viewers.forEach((viewer) => viewer(bitmap));
        })
        .catch((): void => undefined)
        .finally((): void => {
          decoding = false;
          if (pending && streams.get(guestId) === created) {
            const next = pending;
            pending = null;
            decode(next);
          }
        });
    };
    created.off = bridge.onGuestFrame?.((frame): void => {
      if (frame.guestId !== guestId) return;
      if (decoding) {
        pending = frame.jpeg;
      } else {
        decode(frame.jpeg);
      }
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

/** Changes the capture rate of a running stream (idle keep-alive vs live). */
export function setGuestMirrorRate(guestId: number, fps: number): void {
  if (streams.has(guestId)) {
    void getSimulatorBridge().setGuestMirror?.(guestId, true, fps);
  }
}

/**
 * Shows a live mirror of another pane's <webview> guest and forwards pointer
 * input to it. Used for the left half of the iPhone Duo's inner display so the
 * two transformed halves are one continuous, single page.
 */
export function GuestMirrorPane(props: {
  readonly guestId: number | null;
  /**
   * Accept frames still laid out for the cover display and paint them where
   * the cover sits over the inner panel (its hinge-side edge at this x, in
   * CSS px of the pane). Keeps the picture continuous across the hand-off.
   */
  readonly coverFrameOffsetX?: number;
  readonly interactive?: boolean;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pressedRef = useRef<boolean>(false);
  const { guestId, coverFrameOffsetX } = props;

  useLayoutEffect((): (() => void) | void => {
    if (guestId === null) return;
    let hasMatchingFrame = false;
    let coverShown = false;
    let firstInnerAt = 0;
    const draw = (bitmap: ImageBitmap): void => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
      const paneAspect = canvas.clientWidth / canvas.clientHeight;
      const frameAspect = bitmap.width / bitmap.height;
      if (Math.abs(frameAspect / paneAspect - 1) > 0.03) {
        if (hasMatchingFrame) return;
        // Emulation and guest paint change size asynchronously. Keep showing
        // the live cover picture until the first correctly sized inner frame.
        const height = bitmap.height;
        const width = Math.round(height * paneAspect);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const scale = Math.max(width / bitmap.width, height / bitmap.height);
        const drawnWidth = bitmap.width * scale;
        const drawnHeight = bitmap.height * scale;
        ctx.drawImage(bitmap, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
        if (coverFrameOffsetX !== undefined && frameAspect < 1) {
          const hinge = Math.round(coverFrameOffsetX * height / canvas.clientHeight);
          ctx.drawImage(bitmap, hinge, 0, width - hinge, height);
          coverShown = true;
        }
        canvas.classList.add('guest-mirror-ready');
        return;
      }
      if (coverShown) {
        // The page is re-laying out for the inner display. Hold the cover
        // picture until its first frames have settled instead of flashing
        // half-drawn ones.
        if (firstInnerAt === 0) firstInnerAt = performance.now();
        if (performance.now() - firstInnerAt < 260) return;
        coverShown = false;
      }
      hasMatchingFrame = true;
      canvas.classList.add('guest-mirror-ready');
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    };
    return acquireGuestMirror(guestId, draw);
  }, [guestId, coverFrameOffsetX]);

  const send = (type: GuestInputMessage['type'], e: React.PointerEvent | React.WheelEvent): void => {
    if (guestId === null || props.interactive === false) return;
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
      className={
        coverFrameOffsetX === undefined
          ? 'guest-mirror-canvas'
          : 'guest-mirror-canvas guest-mirror-instant'
      }
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
