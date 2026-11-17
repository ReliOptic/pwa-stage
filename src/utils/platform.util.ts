/** Host platform only; never infer from the emulated guest's iPhone user agent. */
export function hostPlatform(): string {
  if (typeof process !== 'undefined' && process.platform) return process.platform;
  if (typeof window !== 'undefined' && window.simulatorBridge?.platform) return window.simulatorBridge.platform;
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'darwin' : 'linux';
}

export function platformLabel(macLabel: string, platform = hostPlatform()): string {
  if (platform === 'darwin') return macLabel;
  return macLabel
    .replace(/⇧⌘|⌘⇧/g, 'Ctrl+Shift+')
    .replace(/⌘/g, 'Ctrl+')
    .replace(/−/g, '-')
    .replace(/Menu Bar|menu bar/g, 'system tray')
    .replace(/Dock/g, 'taskbar')
    .replace(/Floating on all Spaces & full-screen apps/g, 'Always on top')
    .replace(/Floating on All Spaces/g, 'Always on top')
    .replace(/Float on [aA]ll Spaces/g, 'Always on top')
    .replace(/float on all Spaces/g, 'stay on top')
    .replace(/keep on this Space/g, 'unpin')
    .replace(/Stays on This Space only|On this Space only/g, 'Not pinned')
    .replace(/All Spaces/g, 'Pinned')
    .replace(/This Space/g, 'Not pinned');
}

export function shortcutModifier(meta: boolean, control: boolean, alt: boolean, platform = hostPlatform()): boolean {
  // Preserve existing Mac Ctrl aliases; exclude AltGr and the Windows key on Windows.
  return platform === 'darwin' ? meta || control : control && !meta && !alt;
}
