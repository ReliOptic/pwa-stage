import { platformLabel } from '../../utils/platform.util';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IOS27_CHROME_ASSETS } from '../../config/ios27-assets.config';
import {
  computeDuoFoldMetrics,
  DuoFoldInterpolatedMetrics,
  DuoPostureId
} from '../../utils/duo-fold-math.util';
import { getSimulatorBridge } from '../../utils/renderer-bridge.util';
import { clampSimulatorScale, hasDuoSystemRail } from '../../utils/viewport-math.util';
import {
  ComputedViewportMetrics,
  DeviceFormFactor,
  DeviceModelId,
  DevicePreset,
  HardwareCutoutType,
  Orientation
} from '../../types/device.types';
import { DuoDisplayMode, SimulatorState } from '../../types/simulator.types';
import { FOLD_FOCUS_HANDOFF_DEG } from '../../utils/duo-transition.util';
import { COVER_HANDOFF_DEG } from '../../utils/duo-3d-engine.util';
import { requestDuoFoldToggle } from '../sim-events';
import { useDuoHingeController } from '../useDuoHingeController';
import { ScreenSystemOverlay } from './BrowserShellOverlay';
import { AppSurface, HomeScreen, LaunchSplash, ScreenModalLayer } from './ScreenLayers';
import { Duo3DStage } from './Duo3DStage';
import { DuoFoldMiniBar } from './DuoFoldMiniBar';
import { WebviewContainer } from './WebviewContainer';

export interface IphoneFrameProps {
  readonly preset: DevicePreset;
  readonly metrics: ComputedViewportMetrics;
  readonly state: SimulatorState;
  readonly reloadTick: number;
  readonly onRegisterWebContentsId: (id: number) => void;
  readonly onUpdateState: (patch: Partial<SimulatorState>) => void;
  readonly onReload: () => void;
  readonly onToggleDuoFold: () => void;
  readonly onSyncDuoDeviceByAngle: (targetId: DeviceModelId) => void;
  readonly onGoHome?: () => void;
  readonly displayBackground?: string | null;
  readonly tintColor?: string | null;
  readonly onPageReady?: (webContentsId: number) => void;
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
  preset: DevicePreset,
  orientation: Orientation,
  isFramed: boolean,
  isDuoFamily: boolean,
  foldAngle: number
): string | null {
  if (!isFramed || preset.formFactor === DeviceFormFactor.HOME_BUTTON_SLAB) return null;
  if (!isDuoFamily) {
    return preset.id === DeviceModelId.IPHONE_17_AIR ? IOS27_CHROME_ASSETS.phoneAir
      : preset.width >= 428 ? IOS27_CHROME_ASSETS.phone12 : IOS27_CHROME_ASSETS.phone11;
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
  const [scrubbing, setScrubbing] = useState(false);
  const moving = hinge.isAnimating || scrubbing;
  const focusHandoff = isDuoFamily && state.isFramed &&
    state.duoDisplayMode !== DuoDisplayMode.SPLIT_COMPARISON && hinge.orbitDeg === 0 && hinge.pitchDeg === 0 &&
    (hinge.posture === 'open' || hinge.posture === 'closed');
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
  const chassisR = preset.chassisCornerRadius;
  const outerRadiusCss = !state.isFramed
    ? innerRadiusCss
    : chassisR !== undefined
      ? `${chassisR}px`
      : `${r.topLeft + b.left}px ${r.topRight + b.right}px ${r.bottomRight + b.right}px ${r.bottomLeft + b.left}px`;
  const hasHomeButton = preset.formFactor === DeviceFormFactor.HOME_BUTTON_SLAB;
  const isPortraitOrientation = state.orientation === Orientation.PORTRAIT;

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
    !isDuoFamily && !chromeAsset && state.isFramed;

  const slabSkin = !isDuoFamily && chromeAsset ? {
    src: chromeAsset,
    w: chromeAsset === IOS27_CHROME_ASSETS.phoneAir ? 920 : chromeAsset === IOS27_CHROME_ASSETS.phone12 ? 960 : 884,
    h: chromeAsset === IOS27_CHROME_ASSETS.phoneAir ? 1892 : chromeAsset === IOS27_CHROME_ASSETS.phone12 ? 1980 : 1816
  } : null;
  const skinW = isPortraitOrientation ? eff.outerFrameWidth : eff.outerFrameHeight;
  const skinH = isPortraitOrientation ? eff.outerFrameHeight : eff.outerFrameWidth;
  // Registration of the bundled artwork's body bounds (side buttons lie outside).
  // These are image-space gutters, not physical device measurements.
  const skinTransform = isPortraitOrientation ? undefined : `translateY(${skinW}px) rotate(-90deg)`;

  const syncDeviceForAngle = useCallback(
    (deg: number, targetPosture?: DuoPostureId): void => {
      const posture = targetPosture ?? hinge.posture;
      // Stand / tent mode shows content on the *cover* display turned sideways.
      const usesCover = posture === 'standing' || deg < (focusHandoff ? FOLD_FOCUS_HANDOFF_DEG : COVER_HANDOFF_DEG);
      const targetId = usesCover
        ? DeviceModelId.IPHONE_DUO_FOLDED
        : DeviceModelId.IPHONE_DUO_UNFOLDED;
      // Inner display held tall (Portrait / Tabletop rig) is the preset's
      // LANDSCAPE orientation (669×951); cover in Stand is 678×466 (LANDSCAPE).
      const targetOrientation =
        (targetId === DeviceModelId.IPHONE_DUO_UNFOLDED &&
          (posture === 'portrait' || posture === 'tabletop')) ||
        (usesCover && posture === 'standing')
          ? Orientation.LANDSCAPE
          : Orientation.PORTRAIT;
      const patch: Partial<SimulatorState> = {};
      if (targetId !== state.selectedDeviceId) {
        hinge.markInternalSync(targetId);
        (patch as { selectedDeviceId?: DeviceModelId }).selectedDeviceId = targetId;
      }
      if (targetOrientation !== state.orientation) {
        (patch as { orientation?: Orientation }).orientation = targetOrientation;
      }
      if (Object.keys(patch).length > 0) {
        props.onUpdateState(patch);
      }
    },
    [hinge, props, state.selectedDeviceId, state.orientation, focusHandoff]
  );

  const syncedPose = useRef(`${hinge.foldAngle}:${hinge.posture}:${focusHandoff}`);
  useEffect(() => {
    const key = `${hinge.foldAngle}:${hinge.posture}:${focusHandoff}`;
    if (!isDuoFamily || syncedPose.current === key) return;
    syncedPose.current = key;
    syncDeviceForAngle(hinge.foldAngle);
  }, [hinge.foldAngle, hinge.posture, focusHandoff, isDuoFamily, syncDeviceForAngle]);

  // Toolbar "Rotate" on the unfolded Duo picks the matching posture.
  const lastOrientationRef = useRef(state.orientation);
  useEffect((): void => {
    if (lastOrientationRef.current === state.orientation) {
      return;
    }
    lastOrientationRef.current = state.orientation;
    if (!isDuoFamily || state.selectedDeviceId !== DeviceModelId.IPHONE_DUO_UNFOLDED) {
      return;
    }
    const wantsTall = state.orientation === Orientation.LANDSCAPE;
    const isTall = hinge.posture === 'portrait' || hinge.posture === 'tabletop';
    if (wantsTall !== isTall) {
      hinge.selectPosture(wantsTall ? 'portrait' : 'open');
    }
  }, [state.orientation, state.selectedDeviceId, isDuoFamily, hinge]);

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
            transitioning={moving}
            focusHandoff={focusHandoff}
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
            onUpdateState={props.onUpdateState}
            onReload={props.onReload}
            onToggleDuoFold={requestDuoFoldToggle}
            onGoHome={props.onGoHome}
            displayBackground={props.displayBackground}
            tintColor={props.tintColor}
            onPageReady={props.onPageReady}
            onNavigate={(url): void => props.onUpdateState({ currentUrl: url })}
          />
        ) : (
          <div
            className={`iphone-chassis ${chromeAsset ? 'iphone-chassis-bitmap' : 'iphone-chassis-smooth'}`}
            style={{
              width: `${eff.outerFrameWidth}px`,
              height: `${eff.outerFrameHeight}px`,
              borderRadius: chromeAsset ? undefined : outerRadiusCss,
              backgroundImage: chromeAsset && !slabSkin ? `url('${chromeAsset}')` : 'none',
              backgroundSize: '100% 100%',
              transform: sc === 1 ? undefined : `scale(${sc})`,
              transformOrigin: 'top left',
              ['--titanium-finish' as string]: preset.titaniumFinish
            }}
          >
            {slabSkin && <div className="hardware-skin" aria-hidden="true" style={{
              width: skinW, height: skinH,
              transform: skinTransform
            }}><img src={slabSkin.src} alt="" draggable={false} style={{
              left: -10 * skinW / (slabSkin.w - 20), top: -2 * skinH / (slabSkin.h - 4),
              width: slabSkin.w * skinW / (slabSkin.w - 20), height: slabSkin.h * skinH / (slabSkin.h - 4)
            }} /></div>}
            {showSlabButtons && (
              <div className="hardware-skin" style={{ width: skinW, height: skinH, transform: skinTransform }}>
                <span className="hw-btn hw-btn-left hw-btn-action" aria-hidden="true" />
                <span className="hw-btn hw-btn-left hw-btn-vol-up" aria-hidden="true" />
                <span className="hw-btn hw-btn-left hw-btn-vol-down" aria-hidden="true" />
                <span className="hw-btn hw-btn-right hw-btn-power" aria-hidden="true" />
              </div>
            )}
            {hasHomeButton && state.isFramed && (
              <>
                <span
                  className="hw-earpiece"
                  aria-hidden="true"
                  style={
                    isPortraitOrientation
                      ? { left: '50%', top: `${b.top / 2}px`, transform: 'translate(-50%, -50%)' }
                      : {
                          left: `${b.left / 2}px`,
                          top: '50%',
                          transform: 'translate(-50%, -50%) rotate(90deg)'
                        }
                  }
                />
                <button
                  type="button"
                  className="hw-home-button"
                  title={platformLabel("Home (⇧⌘H)")}
                  aria-label="Home button"
                  onClick={props.onGoHome}
                  style={
                    isPortraitOrientation
                      ? {
                          left: '50%',
                          top: `${eff.outerFrameHeight - b.bottom / 2}px`,
                          transform: 'translate(-50%, -50%)'
                        }
                      : {
                          left: `${eff.outerFrameWidth - b.right / 2}px`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)'
                        }
                  }
                />
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
              <AppSurface>
                <WebviewContainer
                  state={state}
                  isDualUnfolded={eff.isDualUnfolded}
                  reloadTick={props.reloadTick}
                  onRegisterWebContentsId={props.onRegisterWebContentsId}
                  onPageReady={props.onPageReady}
                  onNavigate={(url): void => props.onUpdateState({ currentUrl: url })}
                />
                <LaunchSplash />
              </AppSurface>
              <HomeScreen
                width={eff.logicalWidth} height={eff.logicalHeight} safeTop={eff.safeArea.top}
                trailingInset={
                  hasDuoSystemRail(preset, state.orientation) ? eff.safeArea.right : 0
                }
              />
              {isDuoFamily && interp.foldShadowOpacity > 0 && (
                <div className="duo-book-fold-lighting" style={{ opacity: interp.foldShadowOpacity }} />
              )}
              <ScreenSystemOverlay
                preset={preset}
                cutoutType={activeCutout}
                orientation={state.orientation}
                state={state}
                logicalW={eff.logicalWidth}
                logicalH={eff.logicalHeight}
                tintColor={props.tintColor}
                onReload={props.onReload}
                onGoHome={props.onGoHome}
                onToggleDuoFold={requestDuoFoldToggle}
              />
              <ScreenModalLayer />
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
          targetAngle={hinge.targetAngle}
          canResume={hinge.resumeAngle !== null}
          onResume={hinge.resume}
          motionReduced={hinge.motionReduced}
          alwaysAnimate={hinge.alwaysAnimate}
          onMotionOverride={hinge.setMotionOverride}
          onToggleFold={requestDuoFoldToggle}
          onPause={hinge.pause}
          posture={hinge.posture}
          logicalWidth={eff.logicalWidth}
          logicalHeight={eff.logicalHeight}
          finish={hinge.finish}
          hasCustomOrbit={hinge.orbitDeg !== 0 || hinge.pitchDeg !== 0}
          onScrubActiveChange={setScrubbing}
          onScrubAngle={(deg: number): void => {
            hinge.scrubToAngle(deg);
          }}
          onStepAngle={(deltaDeg: number): void => {
            const nextDeg = Math.max(0, Math.min(180, Math.round(hinge.foldAngle) + deltaDeg));
            hinge.scrubToAngle(nextDeg);
          }}
          onSelectPosture={(targetPosture: DuoPostureId): void => {
            hinge.selectPosture(targetPosture);
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
