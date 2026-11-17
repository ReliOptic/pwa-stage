import { useCallback, useEffect, useRef, useState } from 'react';
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
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = computeFoldDriveDurationMs(from, destination) * getFoldSlowFactor();
    if (reducedMotion || Math.abs(destination - from) < 0.25) {
      angle.current = destination;
      setFoldAngle(destination);
      stop();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const next = sampleHingeMotion(from, initialVelocity, destination, now - start, duration);
      angle.current = next.angle;
      velocity.current = next.velocity;
      setFoldAngle(next.angle);
      if (next.settled) stop();
      else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [stop]);

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
  useEffect(() => {
    publishDuoFoldTarget(targetAngle);
  }, [targetAngle]);

  return { foldAngle, targetAngle, resumeAngle, isAnimating: targetAngle !== null, posture, finish,
    orbitDeg, pitchDeg, setFinish, setOrbitDeg, setPitchDeg, pause, toggle,
    resume: () => { if (resumeAngle !== null) animateToAngle(resumeAngle); },
    animateToAngle, scrubToAngle, selectPosture,
    markInternalSync: (id: DeviceModelId) => { internalSync.current = id; }
  };
}
