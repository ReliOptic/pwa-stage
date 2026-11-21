import {
  CornerRadiiSpec,
  DeviceFormFactor,
  DeviceModelId,
  DevicePreset,
  HardwareCutoutType,
  IslandGeometry,
  SafeAreaInsets
} from '../types/device.types';
import { IOS27_CHROME_ASSETS } from './ios27-assets.config';

/**
 * Device catalogue, organised by *viewport class*: every distinct CSS
 * viewport an iOS 26/27 user can have. One entry per class, with every model
 * that shares it listed in `alsoCovers`, so testing the list end-to-end covers
 * the whole supported iPhone range without duplicates.
 *
 * Values are in CSS points. Safe areas are Apple's published UIKit values for
 * portrait / landscape; display corner radii are the hardware screen radii.
 */

const SLAB_BEZEL_INSETS = { top: 14, right: 14, bottom: 14, left: 14 } as const;
const DUO_INNER_INSETS = { top: 20, right: 20, bottom: 20, left: 20 } as const;
const NO_HINGE = {
  enabled: false,
  hingeWidthPx: 0,
  leftPaneWidthPx: 0,
  rightPaneWidthPx: 0,
  showCreaseOverlay: false
} as const;

function radii(r: number): CornerRadiiSpec {
  return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r };
}

type SlabSpec = {
  readonly id: DeviceModelId;
  readonly name: string;
  readonly group: string;
  readonly alsoCovers?: string;
  readonly generation: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly radius: number;
  readonly safePortrait: SafeAreaInsets;
  readonly safeLandscape: SafeAreaInsets;
  readonly finish: string;
  readonly formFactor?: DeviceFormFactor;
  readonly bezel?: SafeAreaInsets;
  readonly chassisCornerRadius?: number;
} & (
  | {cutout:HardwareCutoutType.DYNAMIC_ISLAND|HardwareCutoutType.COMPACT_ISLAND; island:IslandGeometry}
  | {cutout:Exclude<HardwareCutoutType, HardwareCutoutType.DYNAMIC_ISLAND|HardwareCutoutType.COMPACT_ISLAND>; island?:never}
);

function slab(spec: SlabSpec): DevicePreset {
  const bezel = spec.bezel ?? SLAB_BEZEL_INSETS;
  return {
    id: spec.id,
    name: spec.name,
    group: spec.group,
    alsoCovers: spec.alsoCovers,
    generation: spec.generation,
    formFactor: spec.formFactor ?? DeviceFormFactor.STANDARD_SLAB,
    width: spec.width,
    height: spec.height,
    deviceScaleFactor: spec.dpr,
    screenCornerRadius: spec.radius,
    cornerRadii: radii(spec.radius),
    bezelWidth: bezel.left,
    bezelInsets: bezel,
    chromeAssetPath: IOS27_CHROME_ASSETS.phone11,
    titaniumFinish: spec.finish,
    cutoutType: spec.cutout,
    island: spec.island,
    safeAreaPortrait: spec.safePortrait,
    safeAreaLandscape: spec.safeLandscape,
    hinge: { ...NO_HINGE, leftPaneWidthPx: spec.width },
    chassisCornerRadius: spec.chassisCornerRadius
  };
}

const DI_59 = { p: { top: 59, right: 0, bottom: 34, left: 0 }, l: { top: 0, right: 59, bottom: 21, left: 59 } };
const DI_62 = { p: { top: 62, right: 0, bottom: 34, left: 0 }, l: { top: 0, right: 62, bottom: 21, left: 62 } };
const NOTCH_47 = { p: { top: 47, right: 0, bottom: 34, left: 0 }, l: { top: 0, right: 47, bottom: 21, left: 47 } };

const G_2026 = 'iPhone 18 · 2026 (projected)';
const G_2025 = 'iPhone 17 · 2025';
const G_2024 = 'iPhone 16 · 2024';
const G_OLDER = 'Older · still on iOS 26';
const G_FOLD = 'Foldable';

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  // ---------------------------------------------------------------- 2026
  slab({
    id: DeviceModelId.IPHONE_18_PRO,
    name: 'iPhone 18 Pro',
    group: G_2026,
    generation: 'iOS 27.3 · 6.3" (1206×2622 @3x)',
    width: 402,
    height: 874,
    dpr: 3,
    radius: 56,
    cutout: HardwareCutoutType.COMPACT_ISLAND,
    island: { width: 94, height: 36, top: 14, camera: 'right', source: 'product-image' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#2d2b2a',
    bezel: { top: 10, right: 10, bottom: 10, left: 10 }
  }),
  slab({
    id: DeviceModelId.IPHONE_18_PRO_MAX,
    name: 'iPhone 18 Pro Max',
    group: G_2026,
    generation: 'iOS 27.3 · 6.9" (1320×2868 @3x)',
    width: 440,
    height: 956,
    dpr: 3,
    radius: 58,
    cutout: HardwareCutoutType.COMPACT_ISLAND,
    island: { width: 94, height: 35, top: 15, camera: 'right', source: 'product-image' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#2d2b2a',
    bezel: { top: 10, right: 10, bottom: 10, left: 10 }
  }),
  slab({
    id: DeviceModelId.IPHONE_18,
    name: 'iPhone 18',
    group: G_2026,
    generation: 'iOS 27.3 · 6.3" (1206×2622 @3x)',
    width: 402,
    height: 874,
    dpr: 3,
    radius: 62,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 122, height: 36, top: 11, camera: 'right', source: 'projected' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#32343a'
  }),
  slab({
    id: DeviceModelId.IPHONE_SE_4,
    name: 'iPhone 18e',
    group: G_2026,
    generation: 'iOS 27.3 · 6.1" (1170×2532 @3x)',
    width: 390,
    height: 844,
    dpr: 3,
    radius: 47,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 122, height: 36, top: 11, camera: 'right', source: 'projected' },
    safePortrait: DI_59.p,
    safeLandscape: DI_59.l,
    finish: '#1f2124',
    bezel: { top: 10, right: 10, bottom: 10, left: 10 }
  }),
  // ---------------------------------------------------------------- 2025
  slab({
    id: DeviceModelId.IPHONE_17_PRO_MAX,
    name: 'iPhone 17 Pro Max',
    group: G_2025,
    alsoCovers: '16 Pro Max',
    generation: 'iOS 26 · 6.9" (1320×2868 @3x)',
    width: 440,
    height: 956,
    dpr: 3,
    radius: 62,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 126, height: 36, top: 14, camera: 'right', source: 'product-image' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#2b2b2e'
  }),
  slab({
    id: DeviceModelId.IPHONE_17_PRO,
    name: 'iPhone 17 Pro',
    group: G_2025,
    alsoCovers: '16 Pro',
    generation: 'iOS 26 · 6.3" (1206×2622 @3x)',
    width: 402,
    height: 874,
    dpr: 3,
    radius: 62,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 126, height: 36, top: 15, camera: 'right', source: 'product-image' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#2b2b2e'
  }),
  slab({
    id: DeviceModelId.IPHONE_17_AIR,
    name: 'iPhone Air',
    group: G_2025,
    generation: 'iOS 26 · 6.5" (1260×2736 @3x)',
    width: 420,
    height: 912,
    dpr: 3,
    radius: 62,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 123, height: 36, top: 21, camera: 'left', source: 'product-image' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#32353b',
    formFactor: DeviceFormFactor.ULTRA_THIN_SLAB
  }),
  slab({
    id: DeviceModelId.IPHONE_17,
    name: 'iPhone 17',
    group: G_2025,
    generation: 'iOS 26 · 6.3" (1206×2622 @3x)',
    width: 402,
    height: 874,
    dpr: 3,
    radius: 62,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 123, height: 35, top: 15, camera: 'right', source: 'product-image' },
    safePortrait: DI_62.p,
    safeLandscape: DI_62.l,
    finish: '#252629'
  }),
  // ---------------------------------------------------------------- 2024
  slab({
    id: DeviceModelId.IPHONE_16_PLUS,
    name: 'iPhone 16 Plus',
    group: G_2024,
    alsoCovers: '15 Plus · 15 Pro Max · 14 Pro Max',
    generation: 'iOS 26 · 6.7" (1290×2796 @3x)',
    width: 430,
    height: 932,
    dpr: 3,
    radius: 55,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 125, height: 36, top: 12, camera: 'right', source: 'product-image' },
    safePortrait: DI_59.p,
    safeLandscape: DI_59.l,
    finish: '#2f3136'
  }),
  slab({
    id: DeviceModelId.IPHONE_16,
    name: 'iPhone 16',
    group: G_2024,
    alsoCovers: '15 · 15 Pro · 14 Pro',
    generation: 'iOS 26 · 6.1" (1179×2556 @3x)',
    width: 393,
    height: 852,
    dpr: 3,
    radius: 55,
    cutout: HardwareCutoutType.DYNAMIC_ISLAND,
    island: { width: 124, height: 36, top: 12, camera: 'right', source: 'product-image' },
    safePortrait: DI_59.p,
    safeLandscape: DI_59.l,
    finish: '#32343a'
  }),
  slab({
    id: DeviceModelId.IPHONE_14,
    name: 'iPhone 16e',
    group: G_2024,
    alsoCovers: '14 · 13 · 13 Pro · 12 · 12 Pro',
    generation: 'iOS 26 · 6.1" notch (1170×2532 @3x)',
    width: 390,
    height: 844,
    dpr: 3,
    radius: 47.33,
    cutout: HardwareCutoutType.NOTCH,
    safePortrait: NOTCH_47.p,
    safeLandscape: NOTCH_47.l,
    finish: '#1f2124'
  }),
  // ---------------------------------------------------------------- older
  slab({
    id: DeviceModelId.IPHONE_14_PLUS,
    name: 'iPhone 14 Plus',
    group: G_OLDER,
    alsoCovers: '13 Pro Max · 12 Pro Max',
    generation: 'iOS 26 · 6.7" notch (1284×2778 @3x)',
    width: 428,
    height: 926,
    dpr: 3,
    radius: 53.33,
    cutout: HardwareCutoutType.NOTCH,
    safePortrait: NOTCH_47.p,
    safeLandscape: NOTCH_47.l,
    finish: '#26282c'
  }),
  slab({
    id: DeviceModelId.IPHONE_13_MINI,
    name: 'iPhone 13 mini',
    group: G_OLDER,
    alsoCovers: '12 mini',
    generation: 'iOS 26 · 5.4" notch (1080×2340 @3x)',
    width: 375,
    height: 812,
    dpr: 3,
    radius: 44,
    cutout: HardwareCutoutType.NOTCH,
    safePortrait: { top: 50, right: 0, bottom: 34, left: 0 },
    safeLandscape: { top: 0, right: 50, bottom: 21, left: 50 },
    finish: '#26282c'
  }),
  slab({
    id: DeviceModelId.IPHONE_11,
    name: 'iPhone 11',
    group: G_OLDER,
    alsoCovers: '11 Pro Max (@3x)',
    generation: 'iOS 26 · 6.1" notch (828×1792 @2x)',
    width: 414,
    height: 896,
    dpr: 2,
    radius: 41.5,
    cutout: HardwareCutoutType.NOTCH,
    safePortrait: { top: 48, right: 0, bottom: 34, left: 0 },
    safeLandscape: { top: 0, right: 48, bottom: 21, left: 48 },
    finish: '#26282c'
  }),
  slab({
    id: DeviceModelId.IPHONE_SE_3,
    name: 'iPhone SE (3rd gen)',
    group: G_OLDER,
    alsoCovers: 'SE 2nd gen',
    generation: 'iOS 26 · 4.7" Touch ID (750×1334 @2x)',
    width: 375,
    height: 667,
    dpr: 2,
    radius: 0,
    cutout: HardwareCutoutType.NONE,
    safePortrait: { top: 20, right: 0, bottom: 0, left: 0 },
    safeLandscape: { top: 0, right: 0, bottom: 0, left: 0 },
    finish: '#1c1d20',
    formFactor: DeviceFormFactor.HOME_BUTTON_SLAB,
    bezel: { top: 106, right: 22, bottom: 106, left: 22 },
    chassisCornerRadius: 58
  }),
  // ---------------------------------------------------------------- fold
  {
    id: DeviceModelId.IPHONE_DUO_FOLDED,
    name: 'iPhone Duo · Cover',
    group: G_FOLD,
    generation: 'iOS 27.3 · Outer Display (1398×2034 @3x)',
    formFactor: DeviceFormFactor.FOLDABLE_COVER,
    width: 466,
    height: 678,
    deviceScaleFactor: 3,
    screenCornerRadius: 59,
    cornerRadii: { topLeft: 8, topRight: 59, bottomRight: 59, bottomLeft: 8 },
    bezelWidth: 17,
    bezelInsets: { top: 17, right: 23, bottom: 17, left: 25 },
    chromeAssetPath: IOS27_CHROME_ASSETS.phone15DuoOuter,
    titaniumFinish: '#242528',
    cutoutType: HardwareCutoutType.DUO_OUTER_CORNER,
    safeAreaPortrait: { top: 24, right: 84, bottom: 21, left: 16 },
    safeAreaLandscape: { top: 24, right: 84, bottom: 21, left: 16 },
    hinge: { ...NO_HINGE, leftPaneWidthPx: 466 }
  },
  {
    id: DeviceModelId.IPHONE_DUO_UNFOLDED,
    name: 'iPhone Duo · Inner',
    group: G_FOLD,
    generation: 'iOS 27.3 · Inner Display (2853×2007 @3x)',
    formFactor: DeviceFormFactor.FOLDABLE_DUAL,
    width: 951,
    height: 669,
    deviceScaleFactor: 3,
    screenCornerRadius: 55,
    cornerRadii: radii(55),
    bezelWidth: 20,
    bezelInsets: DUO_INNER_INSETS,
    chromeAssetPath: IOS27_CHROME_ASSETS.phone14DuoInnerWide,
    titaniumFinish: '#242528',
    cutoutType: HardwareCutoutType.UNDER_DISPLAY_HIDDEN,
    safeAreaPortrait: { top: 20, right: 84, bottom: 21, left: 20 },
    safeAreaLandscape: { top: 54, right: 0, bottom: 24, left: 0 },
    hinge: {
      enabled: false,
      hingeWidthPx: 0,
      leftPaneWidthPx: 475,
      rightPaneWidthPx: 476,
      showCreaseOverlay: false
    }
  }
];

export function getDevicePresetById(id: DeviceModelId): DevicePreset {
  const found = DEVICE_PRESETS.find((preset) => preset.id === id);
  return found ?? getDefaultPreset();
}

function getDefaultPreset(): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.id === DeviceModelId.IPHONE_17_PRO) ?? DEVICE_PRESETS[0];
}

/** Presets grouped for an <optgroup> picker, in catalogue order. */
export function groupDevicePresets(
  presets: readonly DevicePreset[]
): ReadonlyArray<{ readonly group: string; readonly presets: readonly DevicePreset[] }> {
  const groups: Array<{ group: string; presets: DevicePreset[] }> = [];
  for (const preset of presets) {
    const name = preset.group ?? 'Other';
    let bucket = groups.find((g) => g.group === name);
    if (!bucket) {
      bucket = { group: name, presets: [] };
      groups.push(bucket);
    }
    bucket.presets.push(preset);
  }
  return groups;
}
