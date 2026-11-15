import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, getDevicePresetById } from '../../src/config/device-presets.config';
import { loadSimulatorEnvConfig, validateHttpUrl } from '../../src/config/env.config';
import { DeviceModelId } from '../../src/types/device.types';

describe('env.config & device-presets.config', () => {
  it('loads default campsite.ing URL when env is empty', () => {
    const result = loadSimulatorEnvConfig({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultTargetUrl).toBe('https://campsite.ing/');
      expect(result.value.defaultScale).toBe(1.0);
      expect(result.value.defaultAlwaysOnTop).toBe(true);
      expect(result.value.quickBookmarks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('auto-prefixes https when scheme is omitted and rejects empty URLs', () => {
    const valid = validateHttpUrl('campsite.ing/play', 'TEST_URL');
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value).toBe('https://campsite.ing/play');
    }

    const empty = validateHttpUrl('   ', 'TEST_URL');
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.kind).toBe('CONFIG_VALIDATION_ERROR');
    }
  });

  it('provides all iPhone 17/18 lineup and iOS 27.1 iPhone Duo presets without hinge crease', () => {
    expect(DEVICE_PRESETS.length).toBeGreaterThanOrEqual(8);
    const duoOuter = getDevicePresetById(DeviceModelId.IPHONE_DUO_FOLDED);
    expect(duoOuter.width).toBe(466);
    expect(duoOuter.height).toBe(678);
    expect(duoOuter.cornerRadii.topLeft).toBe(8);
    expect(duoOuter.cornerRadii.topRight).toBe(59);

    const duoUnfolded = getDevicePresetById(DeviceModelId.IPHONE_DUO_UNFOLDED);
    expect(duoUnfolded.hinge.enabled).toBe(false);
    expect(duoUnfolded.hinge.showCreaseOverlay).toBe(false);
    expect(duoUnfolded.width).toBe(951);
    expect(duoUnfolded.height).toBe(669);

    const proMax = getDevicePresetById(DeviceModelId.IPHONE_17_PRO_MAX);
    expect(proMax.width).toBe(440);
    expect(proMax.height).toBe(956);
  });
});
