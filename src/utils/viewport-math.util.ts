import {
  ComputedViewportMetrics,
  CornerRadiiSpec,
  DeviceFormFactor,
  DevicePreset,
  Orientation,
  SafeAreaInsets
} from '../types/device.types';
import { BrowserShellMode, PwaStatusBarStyle } from '../types/simulator.types';

export interface ShellChromeHeights {
  readonly topBarHeight: number;
  readonly bottomBarHeight: number;
}

// Toolbar (3 rows × 23 + 2 gaps × 5 + padding 12 + border 2 = 93) + 8 margin.
const WIDE_TOOLBAR_HEIGHT = 54;
const NARROW_TOOLBAR_HEIGHT = 88;
const COLLAPSED_HUD_RESERVE_HEIGHT = 36;
const DUO_BOTTOM_MINIBAR_RESERVE_HEIGHT = 64;
const FLOATING_WINDOW_PADDING = 16;

export function clampSimulatorScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 0.72;
  }
  const rounded = Math.round(scale * 100) / 100;
  return Math.min(1.15, Math.max(0.45, rounded));
}

export function computeReasonableDesktopScale(
  preset: DevicePreset,
  orientation: Orientation,
  requestedScale: number,
  isFramed: boolean,
  hudCollapsed: boolean,
  workAreaWidth: number,
  workAreaHeight: number
): number {
  // Fit the actual window, including the responsive toolbar and the fixed
  // Duo stage. Its closed and open presets share the same physical footprint.
  const maxW = Math.max(320, workAreaWidth * 0.88);
  const maxH = Math.max(480, workAreaHeight * 0.78);
  const requested = Math.round(clampSimulatorScale(requestedScale) * 100);
  for (let percent = requested; percent > 45; percent--) {
    const scale = percent / 100;
    const window = computeViewportMetrics(preset, orientation, scale, isFramed, hudCollapsed);
    if (window.scaledOuterWidth <= maxW && window.scaledOuterHeight <= maxH) return scale;
  }
  return 0.45;
}

export function resolveSafeAreaInsets(
  preset: DevicePreset,
  orientation: Orientation
): SafeAreaInsets {
  return orientation === Orientation.PORTRAIT
    ? preset.safeAreaPortrait
    : preset.safeAreaLandscape;
}

/**
 * iPhone Duo (iOS 27.3) reserves a trailing 84pt system rail on the cover
 * display and on the inner display held wide. The rail is drawn by the
 * simulator and the web view is laid out *next to* it, so the page itself
 * must not be told about that inset a second time.
 */
export function hasDuoSystemRail(preset: DevicePreset, orientation: Orientation): boolean {
  if (preset.formFactor === DeviceFormFactor.FOLDABLE_COVER) {
    return true;
  }
  return preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL && orientation === Orientation.PORTRAIT;
}

/**
 * Safe-area insets as the *page* sees them through env(safe-area-inset-*).
 *  - Safari / Chrome: the browser's own bars cover top & bottom, so the page
 *    gets 0 there; left/right (landscape sensor housing) still apply.
 *  - PWA standalone: the page owns the full screen and gets every inset.
 *  - Duo rail: already removed from the layout box, so right = 0.
 */
export function resolvePageSafeArea(
  preset: DevicePreset,
  orientation: Orientation,
  shellMode: BrowserShellMode,
  pwaStatusBarStyle: PwaStatusBarStyle = 'black-translucent'
): SafeAreaInsets {
  const raw = resolveSafeAreaInsets(preset, orientation);
  const right = hasDuoSystemRail(preset, orientation) ? 0 : raw.right;
  if (shellMode === BrowserShellMode.PWA_STANDALONE) {
    const top = pwaStatusBarStyle === 'black-translucent' ? raw.top : 0;
    return { ...raw, top, right };
  }
  return { top: 0, right, bottom: 0, left: raw.left };
}

/**
 * Height of the iOS software keyboard in points, including the suggestion
 * bar and the bottom safe area it covers. Approximations of UIKit's keyboard
 * frame for the default (English, predictive on) keyboard.
 */
export function resolveKeyboardHeight(preset: DevicePreset, orientation: Orientation): number {
  const portrait = orientation === Orientation.PORTRAIT;
  if (preset.formFactor === DeviceFormFactor.HOME_BUTTON_SLAB) {
    return portrait ? 260 : 200;
  }
  if (preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL) {
    return portrait ? 300 : 346;
  }
  if (preset.formFactor === DeviceFormFactor.FOLDABLE_COVER) {
    return portrait ? 336 : 209;
  }
  if (!portrait) {
    return 209;
  }
  return preset.width >= 428 ? 346 : 336;
}

export function resolveBezelInsets(
  preset: DevicePreset,
  orientation: Orientation,
  isFramed: boolean
): SafeAreaInsets {
  if (!isFramed) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (orientation === Orientation.PORTRAIT) {
    return preset.bezelInsets;
  }
  return {
    top: preset.bezelInsets.right,
    right: preset.bezelInsets.bottom,
    bottom: preset.bezelInsets.left,
    left: preset.bezelInsets.top
  };
}

export function resolveCornerRadii(
  preset: DevicePreset,
  orientation: Orientation
): CornerRadiiSpec {
  if (orientation === Orientation.PORTRAIT) {
    return preset.cornerRadii;
  }
  return {
    topLeft: preset.cornerRadii.topRight,
    topRight: preset.cornerRadii.bottomRight,
    bottomRight: preset.cornerRadii.bottomLeft,
    bottomLeft: preset.cornerRadii.topLeft
  };
}

export function computeShellChromeHeights(
  shellMode: BrowserShellMode,
  safeArea: SafeAreaInsets,
  pwaStatusBarStyle: PwaStatusBarStyle = 'black-translucent',
  safariBarCollapsed = false
): ShellChromeHeights {
  if (shellMode === BrowserShellMode.PWA_STANDALONE) {
    // Home Screen web apps: only "black-translucent" lets content run under
    // the status bar; "default" / "black" get an opaque bar above the page.
    return {
      topBarHeight: pwaStatusBarStyle === 'black-translucent' ? 0 : safeArea.top,
      bottomBarHeight: 0
    };
  }
  if (shellMode === BrowserShellMode.IOS_CHROME) {
    return {
      topBarHeight: safeArea.top + 52,
      bottomBarHeight: Math.max(44, safeArea.bottom + 14)
    };
  }
  // IOS_SAFARI: top status bar + bottom Liquid Glass address/nav bar.
  // While scrolling down the bar shrinks to a small domain label, which grows
  // the layout viewport (innerHeight / dvh) exactly like on device.
  if (safariBarCollapsed) {
    return {
      topBarHeight: safeArea.top,
      bottomBarHeight: Math.max(30, safeArea.bottom + 6)
    };
  }
  // The top bar is only the status bar: 0 in landscape (iPhone hides it),
  // 20pt on Touch ID phones, 47–62pt under a notch / Dynamic Island.
  return {
    topBarHeight: safeArea.top,
    bottomBarHeight: Math.max(68, safeArea.bottom + 38)
  };
}

export function computeViewportMetrics(
  preset: DevicePreset,
  orientation: Orientation,
  rawScale: number,
  isFramed: boolean = true,
  hudCollapsed: boolean = false
): ComputedViewportMetrics {
  const scale = clampSimulatorScale(rawScale);
  const isPortrait = orientation === Orientation.PORTRAIT;

  const logicalWidth = isPortrait ? preset.width : preset.height;
  const logicalHeight = isPortrait ? preset.height : preset.width;

  const physicalWidth = logicalWidth * preset.deviceScaleFactor;
  const physicalHeight = logicalHeight * preset.deviceScaleFactor;

  const bezelInsets = resolveBezelInsets(preset, orientation, isFramed);
  const cornerRadii = resolveCornerRadii(preset, orientation);

  const outerFrameWidth = logicalWidth + bezelInsets.left + bezelInsets.right;
  const outerFrameHeight = logicalHeight + bezelInsets.top + bezelInsets.bottom;

  const isDuoFamily =
    preset.formFactor === DeviceFormFactor.FOLDABLE_COVER ||
    preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const isDuoStage = isDuoFamily && isFramed;
  const stageFrameWidth = isDuoStage ? 991 : outerFrameWidth;
  const stageFrameHeight = isDuoStage ? 718 : outerFrameHeight;
  const bottomBarReserve = isDuoFamily ? DUO_BOTTOM_MINIBAR_RESERVE_HEIGHT : 0;

  const scaledOuterWidth = Math.max(
    hudCollapsed ? 260 : 360,
    Math.ceil(stageFrameWidth * scale) + FLOATING_WINDOW_PADDING
  );
  const hudReserve = hudCollapsed ? COLLAPSED_HUD_RESERVE_HEIGHT :
    scaledOuterWidth < 624 ? NARROW_TOOLBAR_HEIGHT : WIDE_TOOLBAR_HEIGHT;
  const scaledOuterHeight =
    Math.ceil(stageFrameHeight * scale) +
    hudReserve +
    bottomBarReserve +
    FLOATING_WINDOW_PADDING;

  return {
    logicalWidth,
    logicalHeight,
    physicalWidth,
    physicalHeight,
    outerFrameWidth,
    outerFrameHeight,
    scaledOuterWidth,
    scaledOuterHeight,
    safeArea: resolveSafeAreaInsets(preset, orientation),
    bezelInsets,
    cornerRadii,
    isDualUnfolded: preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL
  };
}
