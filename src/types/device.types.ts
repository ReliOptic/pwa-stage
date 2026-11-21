export enum DeviceModelId {
  IPHONE_SE_3 = 'iphone-se-3',
  IPHONE_13_MINI = 'iphone-13-mini',
  IPHONE_11 = 'iphone-11',
  IPHONE_14 = 'iphone-14',
  IPHONE_14_PLUS = 'iphone-14-plus',
  IPHONE_16_PLUS = 'iphone-16-plus',
  IPHONE_18 = 'iphone-18',
  IPHONE_17 = 'iphone-17',
  IPHONE_17_AIR = 'iphone-17-air',
  IPHONE_17_PRO = 'iphone-17-pro',
  IPHONE_17_PRO_MAX = 'iphone-17-pro-max',
  IPHONE_DUO_FOLDED = 'iphone-duo-folded',
  IPHONE_DUO_UNFOLDED = 'iphone-duo-unfolded',
  IPHONE_18_PRO = 'iphone-18-pro',
  IPHONE_18_PRO_MAX = 'iphone-18-pro-max',
  IPHONE_16 = 'iphone-16',
  IPHONE_SE_4 = 'iphone-se-4'
}

export enum DeviceFormFactor {
  HOME_BUTTON_SLAB = 'home-button-slab',
  STANDARD_SLAB = 'standard-slab',
  ULTRA_THIN_SLAB = 'ultra-thin-slab',
  FOLDABLE_COVER = 'foldable-cover',
  FOLDABLE_DUAL = 'foldable-dual'
}

export enum HardwareCutoutType {
  DYNAMIC_ISLAND = 'dynamic-island',
  COMPACT_ISLAND = 'compact-island',
  NOTCH = 'notch',
  PUNCH_HOLE = 'punch-hole',
  NONE = 'none',
  DUO_OUTER_CORNER = 'duo-outer-corner',
  UNDER_DISPLAY_HIDDEN = 'under-display-hidden'
}

export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface CornerRadiiSpec {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomRight: number;
  readonly bottomLeft: number;
}

export interface DualScreenHingeSpec {
  readonly enabled: boolean;
  readonly hingeWidthPx: number;
  readonly leftPaneWidthPx: number;
  readonly rightPaneWidthPx: number;
  readonly showCreaseOverlay: boolean;
}

export interface IslandGeometry {
  readonly width:number;
  readonly height:number;
  readonly top:number;
  readonly camera:'left'|'right';
  readonly source:'product-image'|'projected';
}

export interface DevicePreset {
  readonly id: DeviceModelId;
  readonly name: string;
  readonly generation: string;
  readonly formFactor: DeviceFormFactor;
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly screenCornerRadius: number;
  readonly cornerRadii: CornerRadiiSpec;
  readonly bezelWidth: number;
  readonly bezelInsets: SafeAreaInsets;
  readonly chromeAssetPath: string;
  readonly titaniumFinish: string;
  readonly cutoutType: HardwareCutoutType;
  readonly island?: IslandGeometry;
  readonly safeAreaPortrait: SafeAreaInsets;
  readonly safeAreaLandscape: SafeAreaInsets;
  readonly hinge: DualScreenHingeSpec;
  /** Picker group, e.g. "iPhone 17 · 2025". */
  readonly group?: string;
  /** Other models sharing this exact viewport, shown in the picker. */
  readonly alsoCovers?: string;
  /** Outer chassis radius when it is not screen radius + bezel (home-button phones). */
  readonly chassisCornerRadius?: number;
}

export enum Orientation {
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape'
}

export interface ComputedViewportMetrics {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly physicalWidth: number;
  readonly physicalHeight: number;
  readonly outerFrameWidth: number;
  readonly outerFrameHeight: number;
  readonly scaledOuterWidth: number;
  readonly scaledOuterHeight: number;
  readonly safeArea: SafeAreaInsets;
  readonly bezelInsets: SafeAreaInsets;
  readonly cornerRadii: CornerRadiiSpec;
  readonly isDualUnfolded: boolean;
}
