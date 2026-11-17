import { useEffect, useState } from 'react';

/** Safari compact bar collapse state, driven by scroll reports from the guest page. */
export const SAFARI_BAR_EVENT = 'sim:safari-bar-collapsed';

export function setSafariBarCollapsed(collapsed: boolean): void {
  window.dispatchEvent(new CustomEvent<boolean>(SAFARI_BAR_EVENT, { detail: collapsed }));
}

export function useSafariBarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect((): (() => void) => {
    const on = (evt: Event): void => setCollapsed(Boolean((evt as CustomEvent<boolean>).detail));
    window.addEventListener(SAFARI_BAR_EVENT, on);
    return (): void => window.removeEventListener(SAFARI_BAR_EVENT, on);
  }, []);
  return collapsed;
}

/** Software keyboard visibility, driven by text-field focus in the guest page. */
export const KEYBOARD_EVENT = 'sim:keyboard-visible';

export function setKeyboardVisible(visible: boolean): void {
  window.dispatchEvent(new CustomEvent<boolean>(KEYBOARD_EVENT, { detail: visible }));
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(false);
  useEffect((): (() => void) => {
    const on = (evt: Event): void => setVisible(Boolean((evt as CustomEvent<boolean>).detail));
    window.addEventListener(KEYBOARD_EVENT, on);
    return (): void => window.removeEventListener(KEYBOARD_EVENT, on);
  }, []);
  return visible;
}

/**
 * Slow Animations (like Xcode Simulator's Debug ▸ Slow Animations): the next
 * fold / unfold plays this many times slower so the transition can be studied.
 */
let foldSlowFactor = 1;

export function setFoldSlowFactor(factor: number): void {
  foldSlowFactor = Math.min(20, Math.max(1, factor));
}

export function getFoldSlowFactor(): number {
  return foldSlowFactor;
}

export const DUO_FOLD_TOGGLE_EVENT = 'sim:duo-fold-toggle';
export const DUO_FOLD_TARGET_EVENT = 'sim:duo-fold-target';
let currentFoldTarget: number | null = null;

export function publishDuoFoldTarget(target: number | null): void {
  currentFoldTarget = target;
  window.dispatchEvent(new CustomEvent(DUO_FOLD_TARGET_EVENT, { detail: target }));
}

export function requestDuoFoldToggle(slow = false): void {
  setFoldSlowFactor(slow ? 8 : 1);
  window.dispatchEvent(new Event(DUO_FOLD_TOGGLE_EVENT));
}

export function useDuoFoldTarget(): number | null {
  const [target, setTarget] = useState<number | null>(() => currentFoldTarget);
  useEffect(() => {
    const onTarget = (event: Event) => setTarget((event as CustomEvent<number | null>).detail);
    window.addEventListener(DUO_FOLD_TARGET_EVENT, onTarget);
    return () => window.removeEventListener(DUO_FOLD_TARGET_EVENT, onTarget);
  }, []);
  return target;
}
