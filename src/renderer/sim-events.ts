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
