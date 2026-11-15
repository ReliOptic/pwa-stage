import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, MousePointerClick, Pin, PinOff, SlidersHorizontal, Sparkles } from 'lucide-react';
import { IOS27_CHROME_ASSETS } from '../../config/ios27-assets.config';
import {
  computeDuoFoldMetrics,
  computeFoldDriveDurationMs,
  DuoFoldInterpolatedMetrics,
  DuoPostureId,
  evaluateFoldDriveEasing
} from '../../utils/duo-fold-math.util';
import { getSimulatorBridge } from '../../utils/renderer-bridge.util';
import { clampSimulatorScale } from '../../utils/viewport-math.util';
import {
  ComputedViewportMetrics,
  DeviceFormFactor,
  DeviceModelId,
  DevicePreset,
  HardwareCutoutType,
  Orientation
} from '../../types/device.types';
import { SimulatorState } from '../../types/simulator.types';
import {
  BrowserShellBarOverlay,
  HardwareCutout,
  HomeIndicatorOverlay,
  IosStatusBar
} from './BrowserShellOverlay';
import { Duo3DStage } from './Duo3DStage';
import { DuoFoldMiniBar } from './DuoFoldMiniBar';
import { WebviewContainer } from './WebviewContainer';

export interface IphoneFrameProps {
  readonly preset: DevicePreset;
  readonly metrics: ComputedViewportMetrics;
  readonly state: SimulatorState;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId: (id: number) => void;
  readonly onExpandHud: () => void;
  readonly onUpdateState: (patch: Partial<SimulatorState>) => void;
  readonly onReload: () => void;
  readonly onToggleDuoFold: () => void;
  readonly onSyncDuoDeviceByAngle: (targetId: DeviceModelId) => void;
}

const POSTURE_TARGET_DEG: Record<DuoPostureId, number> = {
  closed: 0,
  standing: 70,
  book: 100,
  tabletop: 108,
  open: 180,
  portrait: 180
};

interface DuoHingeController {
  readonly foldAngle: number;
  readonly posture: DuoPostureId;
  readonly finish: 'night' | 'white';
  readonly orbitDeg: number;
  readonly pitchDeg: number;
  readonly setFinish: React.Dispatch<React.SetStateAction<'night' | 'white'>>;
  readonly setOrbitDeg: React.Dispatch<React.SetStateAction<number>>;
  readonly setPitchDeg: React.Dispatch<React.SetStateAction<number>>;
  readonly scrubToAngle: (deg: number) => void;
  readonly animateToAngle: (targetDeg: number, nextPosture?: DuoPostureId) => void;
  readonly selectPosture: (posture: DuoPostureId) => void;
  readonly markInternalSync: (targetId: DeviceModelId) => void;
}

function inferPostureFromAngle(deg: number, currentPosture: DuoPostureId): DuoPostureId {
  if (deg <= 12) {
    return 'closed';
  }
  if (deg >= 168) {
    return currentPosture === 'portrait' ? 'portrait' : 'open';
  }
  if (Math.abs(deg - 70) <= 12 && currentPosture === 'standing') {
    return 'standing';
  }
  if (Math.abs(deg - 108) <= 12 && currentPosture === 'tabletop') {
    return 'tabletop';
  }
  return 'book';
}

function useDuoHingeController(selectedDeviceId: DeviceModelId): DuoHingeController {
  const initialDeg = selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED ? 0 : 180;
  const initialPosture: DuoPostureId = initialDeg === 0 ? 'closed' : 'open';

  const [foldAngle, setFoldAngle] = useState<number>(initialDeg);
  const [posture, setPosture] = useState<DuoPostureId>(initialPosture);
  const [finish, setFinish] = useState<'night' | 'white'>('night');
  const [orbitDeg, setOrbitDeg] = useState<number>(0);
  const [pitchDeg, setPitchDeg] = useState<number>(0);

  const rafRef = useRef<number | null>(null);
  const angleRef = useRef<number>(initialDeg);
  const postureRef = useRef<DuoPostureId>(initialPosture);
  const prevDeviceIdRef = useRef<DeviceModelId>(selectedDeviceId);
  const internalSyncTargetRef = useRef<DeviceModelId | null>(null);

  const stopAnim = useCallback((): void => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const markInternalSync = useCallback((targetId: DeviceModelId): void => {
    internalSyncTargetRef.current = targetId;
  }, []);

  const animateToAngle = useCallback(
    (targetDeg: number, nextPosture?: DuoPostureId): void => {
      stopAnim();
      const clampedTarget = Math.max(0, Math.min(180, targetDeg));
      const resolvedPosture =
        nextPosture ?? inferPostureFromAngle(clampedTarget, postureRef.current);
      postureRef.current = resolvedPosture;
      setPosture(resolvedPosture);

      const startDeg = angleRef.current;
      const delta = clampedTarget - startDeg;
      if (Math.abs(delta) < 0.35) {
        angleRef.current = clampedTarget;
        setFoldAngle(clampedTarget);
        return;
      }

      const durationMs = computeFoldDriveDurationMs(startDeg, clampedTarget);
      const startTime = performance.now();

      const step = (now: number): void => {
        const rawT = Math.min(1, (now - startTime) / durationMs);
        const eased = evaluateFoldDriveEasing(rawT);
        const nextVal = startDeg + delta * eased;
        angleRef.current = nextVal;
        setFoldAngle(nextVal);
        if (rawT < 1) {
          rafRef.current = window.requestAnimationFrame(step);
        } else {
          angleRef.current = clampedTarget;
          setFoldAngle(clampedTarget);
          rafRef.current = null;
        }
      };
      rafRef.current = window.requestAnimationFrame(step);
    },
    [stopAnim]
  );

  useEffect((): (() => void) => {
    if (prevDeviceIdRef.current !== selectedDeviceId) {
      prevDeviceIdRef.current = selectedDeviceId;
      if (internalSyncTargetRef.current === selectedDeviceId) {
        internalSyncTargetRef.current = null;
        return stopAnim;
      }
      internalSyncTargetRef.current = null;
      if (selectedDeviceId === DeviceModelId.IPHONE_DUO_FOLDED) {
        animateToAngle(0, 'closed');
      } else if (selectedDeviceId === DeviceModelId.IPHONE_DUO_UNFOLDED) {
        animateToAngle(180, 'open');
      }
    }
    return stopAnim;
  }, [selectedDeviceId, animateToAngle, stopAnim]);

  const scrubToAngle = useCallback(
    (deg: number): void => {
      stopAnim();
      const clamped = Math.max(0, Math.min(180, deg));
      angleRef.current = clamped;
      setFoldAngle(clamped);
      const nextPosture = inferPostureFromAngle(clamped, postureRef.current);
      if (nextPosture !== postureRef.current) {
        postureRef.current = nextPosture;
        setPosture(nextPosture);
      }
    },
    [stopAnim]
  );

  const selectPosture = useCallback(
    (targetPosture: DuoPostureId): void => {
      setOrbitDeg(0);
      setPitchDeg(0);
      animateToAngle(POSTURE_TARGET_DEG[targetPosture], targetPosture);
    },
    [animateToAngle]
  );

  return {
    foldAngle,
    posture,
    finish,
    orbitDeg,
    pitchDeg,
    setFinish,
    setOrbitDeg,
    setPitchDeg,
    scrubToAngle,
    animateToAngle,
    selectPosture,
    markInternalSync
  };
}

function resolveEffectiveMetrics(
  metrics: ComputedViewportMetrics,
  isDuoFamily: boolean,
  orientation: Orientation,
  isFramed: boolean,
  interp: DuoFoldInterpolatedMetrics
): ComputedViewportMetrics {
  if (!isDuoFamily) {
    return metrics;
  }
  const isRestingPose = interp.angleDeg <= 2 || interp.angleDeg >= 178;
  if (isRestingPose && (orientation === Orientation.LANDSCAPE || !isFramed)) {
    return metrics;
  }
  const inset = interp.bezelInset;
  return {
    ...metrics,
    logicalWidth: interp.logicalWidth,
    logicalHeight: interp.logicalHeight,
    outerFrameWidth: isFramed ? interp.outerFrameWidth : interp.logicalWidth,
    outerFrameHeight: isFramed ? interp.outerFrameHeight : interp.logicalHeight,
    bezelInsets: isFramed
      ? { top: inset, right: inset, bottom: inset, left: inset }
      : { top: 0, right: 0, bottom: 0, left: 0 },
    cornerRadii: interp.cornerRadii,
    isDualUnfolded: !interp.isOuterActive
  };
}

function resolveActiveChromeAsset(
  _preset: DevicePreset,
  orientation: Orientation,
  isFramed: boolean,
  isDuoFamily: boolean,
  foldAngle: number
): string | null {
  if (!isFramed || !isDuoFamily) {
    return null;
  }
  if (foldAngle <= 3) {
    return orientation === Orientation.PORTRAIT ? IOS27_CHROME_ASSETS.phone15DuoOuter : null;
  }
  if (foldAngle >= 177) {
    return orientation === Orientation.PORTRAIT
      ? IOS27_CHROME_ASSETS.phone14DuoInnerWide
      : IOS27_CHROME_ASSETS.phone14DuoInner;
  }
  return null;
}

export function IphoneFrame(props: IphoneFrameProps): React.ReactElement {
  const { preset, metrics, state } = props;
  const isDuoFamily =
    preset.formFactor === DeviceFormFactor.FOLDABLE_COVER ||
    preset.formFactor === DeviceFormFactor.FOLDABLE_DUAL;
  const hinge = useDuoHingeController(state.selectedDeviceId);
  const interp = computeDuoFoldMetrics(hinge.foldAngle);
  const eff = resolveEffectiveMetrics(
    metrics,
    isDuoFamily,
    state.orientation,
    state.isFramed,
    interp
  );
  const sc = state.scale;
  const use3DDuoStage = isDuoFamily && state.isFramed;
  const stageBaseW = use3DDuoStage ? 991 : eff.outerFrameWidth;
  const stageBaseH = use3DDuoStage ? 718 : eff.outerFrameHeight;
  const scaledW = Math.round(stageBaseW * sc);
  const scaledH = Math.round(stageBaseH * sc);
  const r = eff.cornerRadii;
  const b = eff.bezelInsets;

  const innerRadiusCss = `${r.topLeft}px ${r.topRight}px ${r.bottomRight}px ${r.bottomLeft}px`;
  const outerRadiusCss = state.isFramed
    ? `${r.topLeft + b.left}px ${r.topRight + b.right}px ${r.bottomRight + b.right}px ${r.bottomLeft + b.left}px`
    : innerRadiusCss;

  const chromeAsset = resolveActiveChromeAsset(
    preset,
    state.orientation,
    state.isFramed,
    isDuoFamily,
    hinge.foldAngle
  );
  const activeCutout = isDuoFamily
    ? interp.isOuterActive
      ? HardwareCutoutType.DUO_OUTER_CORNER
      : HardwareCutoutType.UNDER_DISPLAY_HIDDEN
    : preset.cutoutType;
  const showSlabButtons =
    !isDuoFamily && state.isFramed && state.orientation === Orientation.PORTRAIT;

  const syncDeviceForAngle = useCallback(
    (deg: number): void => {
      const targetId =
        deg < 20 ? DeviceModelId.IPHONE_DUO_FOLDED : DeviceModelId.IPHONE_DUO_UNFOLDED;
      if (targetId !== state.selectedDeviceId) {
        hinge.markInternalSync(targetId);
        props.onSyncDuoDeviceByAngle(targetId);
      }
    },
    [hinge, props, state.selectedDeviceId]
  );

  const startCornerResize = (
    e: React.PointerEvent<HTMLDivElement>,
    horizontalSign: 1 | -1,
    verticalSign: 1 | -1
  ): void => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.screenX;
    const startY = e.screenY;
    const startScale = state.scale;
    const baseW = stageBaseW;
    const baseH = stageBaseH;

    const onMove = (moveEvt: PointerEvent): void => {
      const dx = (moveEvt.screenX - startX) * horizontalSign;
      const dy = (moveEvt.screenY - startY) * verticalSign;
      const scaleDelta = (dx / baseW + dy / baseH) / 2;
      const nextScale = clampSimulatorScale(startScale + scaleDelta);
      props.onUpdateState({ scale: nextScale });
    };

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="stage-wrapper"
      onContextMenu={(e): void => {
        e.preventDefault();
        void getSimulatorBridge().showTwoFingerActionMenu?.();
      }}
    >
      {state.hudCollapsed && (
        <div className="bezel-mini-hud">
          <span className="bezel-mini-drag" title="Drag to move window">
            <GripHorizontal size={12} />
          </span>
          <button
            type="button"
            className={`bezel-mini-btn ${state.alwaysOnTop ? 'bezel-mini-pin-on' : ''}`}
            title={`Always on Top across all spaces (${state.alwaysOnTop ? 'Pinned' : 'Unpinned'}) — ⌘T`}
            onClick={(): void => props.onUpdateState({ alwaysOnTop: !state.alwaysOnTop })}
          >
            {state.alwaysOnTop ? <Pin size={11} /> : <PinOff size={11} />}
            <span>{state.alwaysOnTop ? 'Pinned' : 'Pin'}</span>
          </button>
          <button
            type="button"
            className={`bezel-mini-btn ${state.touchCursorEnabled ? 'bezel-mini-swipe-direct' : ''}`}
            title="Switch swipe mode: Drag vs Hover"
            onClick={(): void =>
              props.onUpdateState({ touchCursorEnabled: !state.touchCursorEnabled })
            }
          >
            {state.touchCursorEnabled ? <Sparkles size={11} /> : <MousePointerClick size={11} />}
            <span>{state.touchCursorEnabled ? 'Hover' : 'Drag'}</span>
          </button>
          <button
            type="button"
            className="bezel-mini-btn"
            title="Show Toolbar (⌘B)"
            onClick={props.onExpandHud}
          >
            <SlidersHorizontal size={11} />
            <span>Toolbar</span>
          </button>
        </div>
      )}

      <div
        className="iphone-stage-scaler"
        style={{
          width: `${scaledW}px`,
          height: `${scaledH}px`,
          position: 'relative'
        }}
      >
        {use3DDuoStage ? (
          <Duo3DStage
            preset={preset}
            metrics={eff}
            state={state}
            foldAngle={hinge.foldAngle}
            posture={hinge.posture}
            finish={hinge.finish}
            orbitDeg={hinge.orbitDeg}
            pitchDeg={hinge.pitchDeg}
            reloadTick={props.reloadTick}
            onUpdateOrbit={(nextOrbit: number, nextPitch: number): void => {
              hinge.setOrbitDeg(nextOrbit);
              hinge.setPitchDeg(nextPitch);
            }}
            onRegisterWebContentsId={props.onRegisterWebContentsId}
            onReload={props.onReload}
            onToggleDuoFold={(): void => {
              const nextDeg = hinge.foldAngle < 90 ? 180 : 0;
              hinge.animateToAngle(nextDeg, nextDeg === 0 ? 'closed' : 'open');
              syncDeviceForAngle(nextDeg);
            }}
          />
        ) : (
          <div
            className={`iphone-chassis ${chromeAsset ? 'iphone-chassis-bitmap' : 'iphone-chassis-smooth'}`}
            style={{
              width: `${eff.outerFrameWidth}px`,
              height: `${eff.outerFrameHeight}px`,
              borderRadius: chromeAsset ? undefined : outerRadiusCss,
              backgroundImage: chromeAsset ? `url('${chromeAsset}')` : 'none',
              backgroundSize: '100% 100%',
              transform: sc === 1 ? undefined : `scale(${sc})`,
              transformOrigin: 'top left',
              ['--titanium-finish' as string]: preset.titaniumFinish
            }}
          >
            {showSlabButtons && (
              <>
                <span className="hw-btn hw-btn-left hw-btn-action" aria-hidden="true" />
                <span className="hw-btn hw-btn-left hw-btn-vol-up" aria-hidden="true" />
                <span className="hw-btn hw-btn-left hw-btn-vol-down" aria-hidden="true" />
                <span className="hw-btn hw-btn-right hw-btn-power" aria-hidden="true" />
              </>
            )}
            <div
              className="iphone-screen"
              style={{
                position: 'absolute',
                top: `${b.top}px`,
                left: `${b.left}px`,
                width: `${eff.logicalWidth}px`,
                height: `${eff.logicalHeight}px`,
                borderRadius: innerRadiusCss
              }}
            >
              <WebviewContainer
                state={state}
                isDualUnfolded={eff.isDualUnfolded}
                reloadTick={props.reloadTick}
                onRegisterWebContentsId={props.onRegisterWebContentsId}
              />
              {isDuoFamily && interp.foldShadowOpacity > 0 && (
                <div className="duo-book-fold-lighting" style={{ opacity: interp.foldShadowOpacity }} />
              )}
              <div
                className="ios-overlay-scaler"
                style={{ width: `${eff.logicalWidth}px`, height: `${eff.logicalHeight}px` }}
              >
                <HardwareCutout cutoutType={activeCutout} orientation={state.orientation} />
                <IosStatusBar
                  preset={{ ...preset, cutoutType: activeCutout }}
                  orientation={state.orientation}
                  safeArea={eff.safeArea}
                  darkMode={state.darkMode}
                  onToggleDuoFold={(): void => {
                    const nextDeg = hinge.foldAngle < 90 ? 180 : 0;
                    hinge.animateToAngle(nextDeg, nextDeg === 0 ? 'closed' : 'open');
                    syncDeviceForAngle(nextDeg);
                  }}
                />
                <BrowserShellBarOverlay
                  shellMode={state.shellMode}
                  currentUrl={state.currentUrl}
                  darkMode={state.darkMode}
                  onReload={props.onReload}
                />
                <HomeIndicatorOverlay darkMode={state.darkMode} />
              </div>
            </div>
          </div>
        )}

        {/* Corner drag handles for aspect-ratio resizing */}
        <div
          className="corner-resize-grip corner-se"
          title="Drag to resize iPhone (aspect ratio locked)"
          onPointerDown={(e): void => startCornerResize(e, 1, 1)}
        />
        <div
          className="corner-resize-grip corner-sw"
          title="Drag to resize iPhone (aspect ratio locked)"
          onPointerDown={(e): void => startCornerResize(e, -1, 1)}
        />
        <div
          className="corner-resize-grip corner-ne"
          title="Drag to resize iPhone (aspect ratio locked)"
          onPointerDown={(e): void => startCornerResize(e, 1, -1)}
        />
        <div
          className="corner-resize-grip corner-nw"
          title="Drag to resize iPhone (aspect ratio locked)"
          onPointerDown={(e): void => startCornerResize(e, -1, -1)}
        />
      </div>

      {isDuoFamily && (
        <DuoFoldMiniBar
          foldAngle={hinge.foldAngle}
          posture={hinge.posture}
          logicalWidth={eff.logicalWidth}
          logicalHeight={eff.logicalHeight}
          finish={hinge.finish}
          hasCustomOrbit={hinge.orbitDeg !== 0 || hinge.pitchDeg !== 0}
          onScrubAngle={(deg: number): void => {
            hinge.scrubToAngle(deg);
            syncDeviceForAngle(deg);
          }}
          onStepAngle={(deltaDeg: number): void => {
            const nextDeg = Math.max(0, Math.min(180, Math.round(hinge.foldAngle) + deltaDeg));
            hinge.scrubToAngle(nextDeg);
            syncDeviceForAngle(nextDeg);
          }}
          onSelectPosture={(targetPosture: DuoPostureId): void => {
            hinge.selectPosture(targetPosture);
            syncDeviceForAngle(POSTURE_TARGET_DEG[targetPosture]);
          }}
          onToggleFinish={(): void => {
            hinge.setFinish((prev) => (prev === 'night' ? 'white' : 'night'));
          }}
          onResetOrbit={(): void => {
            hinge.setOrbitDeg(0);
            hinge.setPitchDeg(0);
          }}
        />
      )}
    </div>
  );
}
