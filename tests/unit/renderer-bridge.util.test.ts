import { describe, expect, it } from 'vitest';
import { getSimulatorBridge, isElectronRuntime } from '../../src/utils/renderer-bridge.util';

describe('renderer-bridge.util', () => {
  it('provides fallback bridge when running outside Electron', async () => {
    expect(isElectronRuntime()).toBe(false);
    const bridge = getSimulatorBridge();
    const initial = await bridge.getInitialPayload();
    expect(initial.ok).toBe(true);
    if (initial.ok) {
      expect(initial.value.state.currentUrl).toBe('http://127.0.0.1:18765/reference.html');
      const emu = await bridge.applyWebviewEmulation({
        webContentsId: 1,
        state: initial.value.state
      });
      expect(emu.ok).toBe(true);
    }
  });
});
