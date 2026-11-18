import { createContext, useContext, useSyncExternalStore } from 'react';

type Pane = 'primary' | 'comparison';
export const FullscreenPane = createContext<Pane>('primary');
const owners = new Map<Pane, HTMLElement>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Mirrors subscribe to their source pane. A departing guest can only clear its own entry.
export function setGuestFullscreen(pane: Pane, guest: HTMLElement, active: boolean): void {
  if (active) {
    if (owners.get(pane) === guest) return;
    owners.set(pane, guest);
  } else {
    if (owners.get(pane) !== guest) return;
    owners.delete(pane);
  }
  listeners.forEach(listener => listener());
}

export function useGuestFullscreen(): boolean {
  const pane = useContext(FullscreenPane);
  return useSyncExternalStore(subscribe, () => owners.has(pane));
}
