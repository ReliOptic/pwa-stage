import { describe, expect, it, vi } from 'vitest';
import {
  clampMirrorFps,
  forwardGuestPointerEvent,
  sanitizeGuestPointerEvent
} from '../../src/services/guest-mirror';
import { resolveDeviceHingeStatus } from '../../src/utils/duo-fold-math.util';
import {
  COVER_HANDOFF_DEG,
  INNER_FULLY_LIT_DEG,
  RIGHT_LEAF_HIDDEN,
  TRANSITION_MAX_BLUR_PX
} from '../../src/utils/duo-3d-engine.util';

describe('guest mirror input forwarding', () => {
  it('accepts only well-formed pointer events', () => {
    expect(sanitizeGuestPointerEvent({ type: 'mouseDown', x: 10.4, y: 20.6 })).toEqual({
      type: 'mouseDown',
      x: 10,
      y: 21,
      deltaX: 0,
      deltaY: 0
    });
    expect(sanitizeGuestPointerEvent({ type: 'keyDown', x: 1, y: 1 })).toBeNull();
    expect(sanitizeGuestPointerEvent({ type: 'mouseDown', x: Number.NaN, y: 1 })).toBeNull();
    expect(sanitizeGuestPointerEvent({ type: 'mouseDown', x: 1e9, y: 1 })).toBeNull();
    expect(sanitizeGuestPointerEvent(null)).toBeNull();
    expect(
      sanitizeGuestPointerEvent({ type: 'mouseWheel', x: 1, y: 1, deltaY: 1e9 })?.deltaY
    ).toBe(0);
  });

  it('focuses the page on press and sends left-button events', () => {
    const guest = { isDestroyed: () => false, focus: vi.fn(), sendInputEvent: vi.fn() };
    forwardGuestPointerEvent(guest as never, { type: 'mouseDown', x: 5, y: 6 });
    expect(guest.focus).toHaveBeenCalledOnce();
    expect(guest.sendInputEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mouseDown', x: 5, y: 6, button: 'left' })
    );
    forwardGuestPointerEvent(guest as never, { type: 'mouseWheel', x: 5, y: 6, deltaY: -40 });
    expect(guest.sendInputEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'mouseWheel', deltaY: -40 })
    );
    const dead = { isDestroyed: () => true, focus: vi.fn(), sendInputEvent: vi.fn() };
    forwardGuestPointerEvent(dead as never, { type: 'mouseUp', x: 0, y: 0 });
    expect(dead.sendInputEvent).not.toHaveBeenCalled();
  });
});

describe('cover ↔ inner hand-off', () => {
  it('moves the app to the inner layout as soon as the device cracks open', () => {
    // The opening transition shows inner content beneath the lifting cover,
    // so the hand-off must precede DeviceHinge.Status leaving "closed" (20°).
    expect(COVER_HANDOFF_DEG).toBeLessThan(INNER_FULLY_LIT_DEG);
    expect(resolveDeviceHingeStatus(COVER_HANDOFF_DEG)).toBe('closed');
    expect(resolveDeviceHingeStatus(INNER_FULLY_LIT_DEG)).toBe('partiallyOpen');
  });

  it('keeps the transition constants in a sane range', () => {
    expect(COVER_HANDOFF_DEG).toBeGreaterThan(0);
    expect(TRANSITION_MAX_BLUR_PX).toBeGreaterThan(10);
    expect(TRANSITION_MAX_BLUR_PX).toBeLessThan(80);
    expect(RIGHT_LEAF_HIDDEN).not.toMatch(/^polygon/);
  });

  it('clamps the mirror frame rate', () => {
    expect(clampMirrorFps(4)).toBe(4);
    expect(clampMirrorFps(1000)).toBe(30);
    expect(clampMirrorFps(0)).toBe(1);
    expect(clampMirrorFps('fast')).toBe(30);
  });
});
