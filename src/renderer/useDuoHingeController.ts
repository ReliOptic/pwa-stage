import { useCallback, useEffect, useRef, useState } from 'react';
import { FOLD_FOCUS_HANDOFF_DEG } from '../utils/duo-transition.util';
import { DeviceModelId } from '../types/device.types';
import { computeFoldDriveDurationMs, DuoPostureId, sampleHingeMotion } from '../utils/duo-fold-math.util';
import { DUO_FOLD_TOGGLE_EVENT, publishDuoFoldTarget, getFoldSlowFactor, setFoldSlowFactor } from './sim-events';

export const POSTURE_TARGET_DEG: Record<DuoPostureId, number> = {
  closed: 0, standing: 70, book: 100, tabletop: 108, open: 180, portrait: 180
};

export function useDuoHingeController(selectedDeviceId: DeviceModelId) {
  const initial = selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED ? 0 : 180;
  const [foldAngle, setFoldAngle] = useState(initial);
  const [targetAngle, setTargetAngle] = useState<number | null>(null);
  const [resumeAngle, setResumeAngle] = useState<number | null>(null);
  const [posture, setPosture] = useState<DuoPostureId>(initial === 0 ? 'closed' : 'open');
  const [finish, setFinish] = useState<'night' | 'white'>('night');
  const [orbitDeg, setOrbitDeg] = useState(0);
  const [pitchDeg, setPitchDeg] = useState(0);
  const [systemReducesMotion, setSystemReducesMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [alwaysAnimate, setAlwaysAnimate] = useState(
    () => window.localStorage.getItem('duo-always-animate') === 'true'
  );
  const motionReduced = systemReducesMotion && !alwaysAnimate;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReducesMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const setMotionOverride = (value: boolean) => {
    if (value) window.localStorage.setItem('duo-always-animate', 'true');
    else window.localStorage.removeItem('duo-always-animate');
    setAlwaysAnimate(value);
  };
  const raf = useRef<number | null>(null);
  const angle = useRef(initial);
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const pose = useRef(posture);
  const previousDevice = useRef(selectedDeviceId);
  const internalSync = useRef<DeviceModelId | null>(null);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    target.current = null;
    velocity.current = 0;
    setTargetAngle(null);
    setResumeAngle(null);
  }, []);

  const pause = useCallback(() => {
    const pending = target.current;
    if (pending === null) return;
    stop();
    setResumeAngle(pending);
  }, [stop]);

  const animateToAngle = useCallback((to: number, nextPosture?: DuoPostureId) => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const destination = Math.max(0, Math.min(180, to));
    if (nextPosture) { pose.current = nextPosture; setPosture(nextPosture); }
    const from = angle.current, initialVelocity = velocity.current;
    target.current = destination;
    setTargetAngle(destination);
    setResumeAngle(null);
    const duration = computeFoldDriveDurationMs(from, destination) * getFoldSlowFactor();
    if (motionReduced || Math.abs(destination - from) < 0.25) {
      angle.current = destination;
      setFoldAngle(destination);
      stop();
      return;
    }
    // Time spent waiting for the first paint or a stalled GPU must not
    // consume the whole visible sweep. Keep native cadence on fast displays.
    let previous = performance.now();
    let elapsed = 0;
    const step = (now: number) => {
      // A stalled compositor still needs to present both sides of the handoff.
      // On a normally refreshing display the drive follows the native clock.
      elapsed += Math.min(45, Math.max(0, now - previous));
      previous = now;
      const next = sampleHingeMotion(from, initialVelocity, destination, elapsed, duration);
      const crossedHandoff = (angle.current < FOLD_FOCUS_HANDOFF_DEG && next.angle > FOLD_FOCUS_HANDOFF_DEG) ||
        (angle.current > FOLD_FOCUS_HANDOFF_DEG && next.angle < FOLD_FOCUS_HANDOFF_DEG);
      // Preserve the optical midpoint if a slow paint would skip it. The next
      // tick continues on the same easing curve, including on reversal.
      angle.current = crossedHandoff && !next.settled ? FOLD_FOCUS_HANDOFF_DEG : next.angle;
      velocity.current = next.velocity;
      setFoldAngle(angle.current);
      if (next.settled) stop();
      else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [stop, motionReduced]);

  const toggle = useCallback(() => {
    // Reverse the pending destination, even before the hinge crosses halfway.
    const destination = (target.current ?? angle.current) < 90 ? 180 : 0;
    animateToAngle(destination, pose.current === 'open' || pose.current === 'closed'
      ? destination === 0 ? 'closed' : 'open' : undefined);
  }, [animateToAngle]);

  const scrubToAngle = useCallback((value: number) => {
    stop();
    angle.current = Math.max(0, Math.min(180, value));
    setFoldAngle(angle.current);
    // Manual angle control must not select a different camera or orientation.
  }, [stop]);

  const selectPosture = useCallback((value: DuoPostureId) => {
    setFoldSlowFactor(1);
    setOrbitDeg(0);
    setPitchDeg(0);
    animateToAngle(POSTURE_TARGET_DEG[value], value);
  }, [animateToAngle]);

  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);
  useEffect(() => {
    if (previousDevice.current === selectedDeviceId) return;
    previousDevice.current = selectedDeviceId;
    if (internalSync.current === selectedDeviceId) { internalSync.current = null; return; }
    internalSync.current = null;
    if (selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED) animateToAngle(0, 'closed');
    else if (selectedDeviceId === DeviceModelId.IPHONE_DUO_UNFOLDED) animateToAngle(180, 'open');
    else stop();
  }, [selectedDeviceId, animateToAngle, stop]);

  useEffect(() => {
    const isDuo = selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED || selectedDeviceId === DeviceModelId.IPHONE_DUO_UNFOLDED;
    if (!isDuo) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') pause(); };
    window.addEventListener(DUO_FOLD_TOGGLE_EVENT, toggle);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener(DUO_FOLD_TOGGLE_EVENT, toggle);
      window.removeEventListener('keydown', escape);
    };
  }, [selectedDeviceId, toggle, pause]);
  // Toolbar and bottom controls must name the same next action after a scrub
  // or pause too, independently of the active screen profile.
  const foldActionBase = targetAngle ?? (foldAngle < 90 ? 0 : 180);
  useEffect(() => {
    publishDuoFoldTarget(foldActionBase);
  }, [foldActionBase]);

  return { foldAngle, targetAngle, resumeAngle, isAnimating: targetAngle !== null, posture, finish,
    orbitDeg, pitchDeg, motionReduced, alwaysAnimate, setMotionOverride, setFinish, setOrbitDeg, setPitchDeg, pause, toggle,
    resume: () => { if (resumeAngle !== null) animateToAngle(resumeAngle); },
    animateToAngle, scrubToAngle, selectPosture,
    markInternalSync: (id: DeviceModelId) => { internalSync.current = id; }
  };
}
