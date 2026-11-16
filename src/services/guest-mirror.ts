import type { WebContents } from 'electron';

/**
 * Live frame mirror of a <webview> guest.
 *
 * The iPhone Duo's inner display is one panel, but the simulator has to draw
 * it as two perspective-transformed halves, and a <webview> can only be drawn
 * once. The right half hosts the live guest; the left half shows this mirror
 * of the very same page, so both halves are always one continuous surface.
 */

export interface GuestFrame {
  readonly guestId: number;
  readonly width: number;
  readonly height: number;
  readonly jpeg: Buffer;
}

const MIN_FRAME_INTERVAL_MS = 1000 / 30;
const JPEG_QUALITY = 90;

interface MirrorSession {
  stopped: boolean;
}

const sessions = new Map<number, MirrorSession>();

export function stopGuestMirror(guestId: number): void {
  const session = sessions.get(guestId);
  if (session) {
    session.stopped = true;
    sessions.delete(guestId);
  }
}

export function startGuestMirror(guest: WebContents, deliver: (frame: GuestFrame) => void): void {
  const guestId = guest.id;
  stopGuestMirror(guestId);
  const session: MirrorSession = { stopped: false };
  sessions.set(guestId, session);
  guest.once('destroyed', () => stopGuestMirror(guestId));

  const loop = async (): Promise<void> => {
    while (!session.stopped && !guest.isDestroyed()) {
      const started = Date.now();
      try {
        const image = await guest.capturePage();
        if (session.stopped) return;
        const size = image.getSize();
        if (size.width > 0 && size.height > 0) {
          deliver({ guestId, width: size.width, height: size.height, jpeg: image.toJPEG(JPEG_QUALITY) });
        }
      } catch {
        // guest navigating / hidden: retry on the next tick
      }
      const wait = Math.max(0, MIN_FRAME_INTERVAL_MS - (Date.now() - started));
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
  };
  void loop();
}

export type GuestPointerEventType = 'mouseDown' | 'mouseUp' | 'mouseMove' | 'mouseWheel';

export interface GuestPointerEvent {
  readonly type: GuestPointerEventType;
  readonly x: number;
  readonly y: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
}

const POINTER_TYPES: readonly string[] = ['mouseDown', 'mouseUp', 'mouseMove', 'mouseWheel'];

/** Validates an input event forwarded from the mirrored half. */
export function sanitizeGuestPointerEvent(raw: unknown): GuestPointerEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const finite = (v: unknown, limit: number): v is number =>
    typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
  if (typeof r.type !== 'string' || !POINTER_TYPES.includes(r.type)) return null;
  if (!finite(r.x, 10000) || !finite(r.y, 10000)) return null;
  return {
    type: r.type as GuestPointerEventType,
    x: Math.round(r.x),
    y: Math.round(r.y),
    deltaX: finite(r.deltaX, 5000) ? r.deltaX : 0,
    deltaY: finite(r.deltaY, 5000) ? r.deltaY : 0
  };
}

export function forwardGuestPointerEvent(guest: WebContents, ev: GuestPointerEvent): void {
  if (guest.isDestroyed()) return;
  if (ev.type === 'mouseWheel') {
    guest.sendInputEvent({
      type: 'mouseWheel',
      x: ev.x,
      y: ev.y,
      deltaX: ev.deltaX ?? 0,
      deltaY: ev.deltaY ?? 0,
      canScroll: true
    });
    return;
  }
  if (ev.type === 'mouseDown') {
    guest.focus();
  }
  guest.sendInputEvent({
    type: ev.type,
    x: ev.x,
    y: ev.y,
    button: 'left',
    clickCount: 1
  });
}
