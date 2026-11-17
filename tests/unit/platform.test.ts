import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostPlatform, platformLabel, shortcutModifier } from '../../src/utils/platform.util';

afterEach(() => vi.restoreAllMocks());
describe('host conventions (independent of guest emulation)', () => {
  it.each(['darwin', 'win32', 'linux'] as const)('uses %s host', (platform) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    expect(hostPlatform()).toBe(platform);
    expect(platformLabel('Home (⇧⌘H)')).toBe(platform === 'darwin' ? 'Home (⇧⌘H)' : 'Home (Ctrl+Shift+H)');
    expect(shortcutModifier(false, true, false)).toBe(true);
    expect(shortcutModifier(true, false, false)).toBe(platform === 'darwin');
    expect(shortcutModifier(false, true, true)).toBe(platform === 'darwin'); // AltGr must reach page text fields.
  });
  it('keeps Mac copy unchanged and replaces Windows workspace/tray conventions', () => {
    expect(platformLabel('Hide to Menu Bar (⇧⌘S)', 'darwin')).toBe('Hide to Menu Bar (⇧⌘S)');
    expect(platformLabel('Hide to Menu Bar (⇧⌘S)', 'win32')).toBe('Hide to system tray (Ctrl+Shift+S)');
    expect(platformLabel('Float on all Spaces', 'win32')).toBe('Always on top');
    expect(platformLabel('Minimize to Dock', 'win32')).toBe('Minimize to taskbar');
  });
});
