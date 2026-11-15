import {
  ComputedViewportMetrics,
  CornerRadiiSpec,
  DeviceFormFactor,
  DevicePreset,
  Orientation,
  SafeAreaInsets
} from '../types/device.types';
import { BrowserShellMode } from '../types/simulator.types';

export interface ShellChromeHeights {
  readonly topBarHeight: number;
  readonly bottomBarHeight: number;
}

const EXPANDED_HUD_RESERVE_HEIGHT = 84;
const COLLAPSED_HUD_RESERVE_HEIGHT = 0;
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
  const base = computeViewportMetrics(preset, orientation, 1.0, isFramed, hudCollapsed);
  const overheadW = base.scaledOuterWidth - base.outerFrameWidth;
  const overheadH = base.scaledOuterHeight - base.outerFrameHeight;
  const targetMaxW = Math.max(320, workAreaWidth * 0.88 - overheadW);
  const targetMaxH = Math.max(480, workAreaHeight * 0.78 - overheadH);
  const maxByW = targetMaxW / Math.max(1, base.outerFrameWidth);
  const maxByH = targetMaxH / Math.max(1, base.outerFrameHeight);
  const maxReasonable = clampSimulatorScale(Math.min(maxByW, maxByH));
  return Math.min(clampSimulatorScale(requestedScale), maxReasonable);
}

export function resolveSafeAreaInsets(
  preset: DevicePreset,
  orientation: Orientation
): SafeAreaInsets {
  return orientation === Orientation.PORTRAIT
    ? preset.safeAreaPortrait
    : preset.safeAreaLandscape;
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
  safeArea: SafeAreaInsets
): ShellChromeHeights {
  if (shellMode === BrowserShellMode.PWA_STANDALONE) {
    return {
      topBarHeight: 0,
      bottomBarHeight: 0
    };
  }
  if (shellMode === BrowserShellMode.IOS_CHROME) {
    return {
      topBarHeight: Math.max(44, safeArea.top) + 52,
      bottomBarHeight: Math.max(44, safeArea.bottom + 14)
    };
  }
  // IOS_SAFARI: top status bar + bottom Liquid Glass address/nav bar
  return {
    topBarHeight: Math.max(44, safeArea.top),
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

  const hudReserve = hudCollapsed
    ? COLLAPSED_HUD_RESERVE_HEIGHT
    : EXPANDED_HUD_RESERVE_HEIGHT;
  const isDuoFamily =
    preset.formFactor === DeviceFormFactor.FOLDABLE_COVER ||
    preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const isDuoStage = isDuoFamily && isFramed;
  const stageFrameWidth = isDuoStage ? 991 : outerFrameWidth;
  const stageFrameHeight = isDuoStage ? 718 : outerFrameHeight;
  const bottomBarReserve = isDuoFamily ? DUO_BOTTOM_MINIBAR_RESERVE_HEIGHT : 0;

  const scaledOuterWidth = Math.max(
    260,
    Math.ceil(stageFrameWidth * scale) + FLOATING_WINDOW_PADDING
  );
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
