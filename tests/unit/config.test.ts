import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, getDevicePresetById } from '../../src/config/device-presets.config';
import { loadSimulatorEnvConfig, validateHttpUrl } from '../../src/config/env.config';
import { webAddress } from '../../src/services/journey-planner';
import { regionLanguage, regionTimeZone } from '../../src/utils/region.util';
import { DeviceModelId } from '../../src/types/device.types';

describe('env.config & device-presets.config', () => {
  it('loads the neutral start page when env is empty', () => {
    const result = loadSimulatorEnvConfig({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultTargetUrl).toBe('http://127.0.0.1:18765/index.html');
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

  it.each([
    ['localhost:5173/서울', 'http://localhost:5173/%EC%84%9C%EC%9A%B8'],
    [':3000/東京', 'http://localhost:3000/%E6%9D%B1%E4%BA%AC'],
    ['[::1]:5173/ع', 'http://[::1]:5173/%D8%B9'],
    ['localhost?lang=de', 'http://localhost/?lang=de'],
    ['127.0.0.2:443/', 'http://127.0.0.2:443/'],
    ['preview.localhost:5173', 'http://preview.localhost:5173/'],
    ['https://localhost:5173/', 'https://localhost:5173/'],
    ['예시.한국/한글', 'https://xn--vv4b11d.xn--3e0b707e/%ED%95%9C%EA%B8%80']
  ])('uses the same address in the device and Agent for %s', (input, expected) => {
    expect(validateHttpUrl(input,'url')).toEqual({ok:true,value:expected});
    expect(webAddress(input)).toBe(expected);
  });

  it.each(['ftp://example.org/path', 'file:///tmp/test', '/local/path', 'about:blank'])('rejects %s instead of loading a different host', input => {
    expect(validateHttpUrl(input,'url').ok).toBe(false);
    expect(() => webAddress(input)).toThrow();
  });

  it('canonicalizes supported region overrides and rejects invalid values', () => {
    expect(regionLanguage(' ko-kr ')).toBe('ko-KR');
    expect(regionLanguage('ko_KR')).toBeNull();
    expect(regionTimeZone('Asia/Seoul')).toBe('Asia/Seoul');
    expect(regionTimeZone('Europe/Unknown')).toBeNull();
    expect(regionTimeZone('+09:00')).toBeNull();
    expect(regionTimeZone('')).toBe('');
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
