import { BrowserShellMode } from '../types/simulator.types';

export const PAGE_ZOOMS = [75, 85, 100, 115, 125, 150, 175, 200] as const;
export const ZOOM_CHANGED = 'sim:browser-page-zoom';
export interface SiteEntry {
  readonly url: string;
  readonly title: string;
}
export type LibraryKind = 'bookmarks' | 'history';

function zoomKey(mode: BrowserShellMode, url: string): string | null {
  if (mode === BrowserShellMode.PWA_STANDALONE || !/^https?:\/\//i.test(url)) return null;
  try {
    return 'pwa-stage.zoom.' + mode + '.' + new URL(url).origin;
  } catch {
    return null;
  }
}

export function readPageZoom(mode: BrowserShellMode, url: string): number {
  const key = zoomKey(mode, url);
  const zoom = key ? Number(localStorage.getItem(key)) : 100;
  return PAGE_ZOOMS.some((value) => value === zoom) ? zoom : 100;
}

export function savePageZoom(mode: BrowserShellMode, url: string, zoom: number): void {
  const key = zoomKey(mode, url);
  if (!key || !PAGE_ZOOMS.some((value) => value === zoom)) return;
  localStorage.setItem(key, String(zoom));
  window.dispatchEvent(new Event(ZOOM_CHANGED));
}

export function readLibrary(mode: BrowserShellMode, kind: LibraryKind): SiteEntry[] {
  try {
    const entries: unknown = JSON.parse(
      localStorage.getItem('pwa-stage.' + mode + '.' + kind) || '[]'
    );
    return Array.isArray(entries)
      ? entries.filter(
          (entry): entry is SiteEntry =>
            entry &&
            typeof entry.title === 'string' &&
            typeof entry.url === 'string' &&
            /^https?:\/\//i.test(entry.url)
        )
      : [];
  } catch {
    return [];
  }
}

export function updateLibrary(
  mode: BrowserShellMode,
  kind: LibraryKind,
  entry: SiteEntry,
  remove = false
): SiteEntry[] {
  const previous = readLibrary(mode, kind);
  if (!/^https?:\/\//i.test(entry.url) || mode === BrowserShellMode.PWA_STANDALONE) return previous;
  const next = previous.filter((item) => item.url !== entry.url);
  if (!remove) next.unshift(entry);
  const entries = kind === 'history' ? next.slice(0, 100) : next;
  localStorage.setItem('pwa-stage.' + mode + '.' + kind, JSON.stringify(entries));
  return entries;
}
