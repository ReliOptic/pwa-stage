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

const MAX_FPS = 30;
const MIN_FPS = 1;

export function clampMirrorFps(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(MAX_FPS, Math.max(MIN_FPS, raw))
    : MAX_FPS;
}
const JPEG_QUALITY = 90;

interface MirrorSession {
  stopped: boolean;
  fps: number;
}

const sessions = new Map<number, MirrorSession>();

export function stopGuestMirror(guestId: number): void {
  const session = sessions.get(guestId);
  if (session) {
    session.stopped = true;
    sessions.delete(guestId);
  }
}

/**
 * Starts mirroring a guest, or just changes the frame rate of a running
 * mirror (a low idle rate keeps one recent frame around so the opening
 * transition never starts from black).
 */
export function startGuestMirror(
  guest: WebContents,
  deliver: (frame: GuestFrame) => void,
  fps: number = MAX_FPS
): void {
  const guestId = guest.id;
  const running = sessions.get(guestId);
  if (running) {
    running.fps = clampMirrorFps(fps);
    return;
  }
  const session: MirrorSession = { stopped: false, fps: clampMirrorFps(fps) };
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
      // Sleep in short slices so a rate change takes effect immediately.
      while (!session.stopped && Date.now() - started < 1000 / session.fps) {
        await new Promise<void>((resolve) => setTimeout(resolve, 8));
      }
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
