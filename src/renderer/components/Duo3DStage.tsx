import React, { useEffect, useRef, useState } from 'react';
import {
  ComputedViewportMetrics,
  DevicePreset,
  HardwareCutoutType,
  Orientation
} from '../../types/device.types';
import { SimulatorState } from '../../types/simulator.types';
import {
  Duo3DFrameProjection,
  Duo3DHardwareEngine
} from '../../utils/duo-3d-engine.util';
import { DuoPostureId } from '../../utils/duo-fold-math.util';
import {
  BrowserShellBarOverlay,
  HardwareCutout,
  HomeIndicatorOverlay,
  IosStatusBar
} from './BrowserShellOverlay';
import { WebviewContainer } from './WebviewContainer';

export interface Duo3DStageProps {
  readonly preset: DevicePreset;
  readonly metrics: ComputedViewportMetrics;
  readonly state: SimulatorState;
  readonly foldAngle: number;
  readonly posture: DuoPostureId;
  readonly finish: 'night' | 'white';
  readonly orbitDeg: number;
  readonly pitchDeg: number;
  readonly reloadTick: number;
  readonly onUpdateOrbit: (orbitDeg: number, pitchDeg: number) => void;
  readonly onRegisterWebContentsId: (id: number) => void;
  readonly onReload: () => void;
  readonly onToggleDuoFold: () => void;
}

const STAGE_WIDTH = 991;
const STAGE_HEIGHT = 718;

interface SystemOverlayLayerProps {
  readonly preset: DevicePreset;
  readonly state: SimulatorState;
  readonly metrics: ComputedViewportMetrics;
  readonly isOuterActive: boolean;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly onReload: () => void;
  readonly onToggleDuoFold: () => void;
}

function SystemOverlayLayer(props: SystemOverlayLayerProps): React.ReactElement {
  const { preset, state, metrics, isOuterActive, logicalW, logicalH } = props;
  const activeCutout = isOuterActive
    ? HardwareCutoutType.DUO_OUTER_CORNER
    : HardwareCutoutType.UNDER_DISPLAY_HIDDEN;

  return (
    <div
      className="ios-overlay-scaler"
      style={{ width: `${logicalW}px`, height: `${logicalH}px` }}
    >
      <HardwareCutout cutoutType={activeCutout} orientation={state.orientation} />
      <IosStatusBar
        preset={{ ...preset, cutoutType: activeCutout }}
        orientation={Orientation.PORTRAIT}
        safeArea={metrics.safeArea}
        darkMode={state.darkMode}
        onToggleDuoFold={props.onToggleDuoFold}
      />
      <BrowserShellBarOverlay
        shellMode={state.shellMode}
        currentUrl={state.currentUrl}
        darkMode={state.darkMode}
        onReload={props.onReload}
      />
      <HomeIndicatorOverlay darkMode={state.darkMode} />
    </div>
  );
}

export function Duo3DStage(props: Duo3DStageProps): React.ReactElement {
  const {
    preset,
    metrics,
    state,
    foldAngle,
    posture,
    finish,
    orbitDeg,
    pitchDeg
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Duo3DHardwareEngine | null>(null);
  const [projection, setProjection] = useState<Duo3DFrameProjection | null>(null);
  const dragRef = useRef<{
    readonly startX: number;
    readonly startY: number;
    readonly startOrbit: number;
    readonly startPitch: number;
  } | null>(null);

  useEffect((): (() => void) => {
    if (!canvasRef.current) return (): void => {};
    try {
      engineRef.current = new Duo3DHardwareEngine(canvasRef.current);
    } catch {
      engineRef.current = null;
    }
    return (): void => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect((): void => {
    if (!engineRef.current) return;
    const nextProj = engineRef.current.renderFrame({
      stageWidth: STAGE_WIDTH,
      stageHeight: STAGE_HEIGHT,
      foldAngleDeg: foldAngle,
      posture,
      orbitDeg,
      pitchDeg,
      zoom: 1.0,
      finish
    });
    setProjection(nextProj);
  }, [foldAngle, posture, orbitDeg, pitchDeg, finish]);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    if (!e.altKey && target.closest('.duo-interactive-slice')) {
      return;
    }
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOrbit: orbitDeg,
      startPitch: pitchDeg
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextOrbit = Math.max(-180, Math.min(180, Math.round(dragRef.current.startOrbit + dx * 0.32)));
    const nextPitch = Math.max(-48, Math.min(48, Math.round(dragRef.current.startPitch + dy * 0.22)));
    props.onUpdateOrbit(nextOrbit, nextPitch);
  };

  const handleStagePointerUp = (): void => {
    dragRef.current = null;
  };

  const isOuterPrimary = projection ? projection.isOuterPrimary : foldAngle < 30;
  const isBentInner =
    projection !== null &&
    !projection.isOuterPrimary &&
    projection.u < 0.985;
  const isHorizontalSplit = projection?.isHorizontalSplit ?? false;

  const fullLogicalW = isOuterPrimary
    ? projection?.outer.width ?? 466
    : projection?.full.width ?? 951;
  const fullLogicalH = isOuterPrimary
    ? projection?.outer.height ?? 678
    : projection?.full.height ?? 669;

  const primarySlice = isOuterPrimary
    ? projection?.outer
    : isBentInner
      ? projection?.right
      : projection?.full;

  const primaryShiftX = isBentInner && !isHorizontalSplit ? -475.5 : 0;
  const primaryShiftY = isBentInner && isHorizontalSplit ? -475.5 : 0;

  const primaryBorderRadius = isOuterPrimary
    ? '12px 46px 46px 12px'
    : !isBentInner
      ? '44px'
      : isHorizontalSplit
        ? '0 0 44px 44px'
        : '0 44px 44px 0';

  const secondaryBorderRadius = isHorizontalSplit
    ? '44px 44px 0 0'
    : '44px 0 0 44px';

  const foldDepthIntensity = projection
    ? Math.sin(projection.phi * Math.PI)
    : 0;

  return (
    <div
      className="duo-3d-stage-root"
      style={{
        width: `${STAGE_WIDTH}px`,
        height: `${STAGE_HEIGHT}px`,
        transform: state.scale === 1 ? undefined : `scale(${state.scale})`,
        transformOrigin: 'top left'
      }}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerUp}
      title="Drag margin to orbit 3D device (Alt+drag over screen)"
    >
      {/* 1. Apple Official 3D Skinned glTF Hardware Mesh Canvas */}
      <canvas
        ref={canvasRef}
        className="duo-3d-webgl-canvas"
        width={STAGE_WIDTH}
        height={STAGE_HEIGHT}
        aria-hidden="true"
      />

      {/* 2. Secondary Left / Upper Leaf Slice when in 3D Bent Posture (20°..177°) */}
      {isBentInner && projection && projection.left.active && projection.left.matrix3d && (
        <div
          className="duo-interactive-slice duo-slice-secondary"
          style={{
            width: `${projection.left.width}px`,
            height: `${projection.left.height}px`,
            transform: projection.left.matrix3d,
            opacity: projection.left.opacity,
            borderRadius: secondaryBorderRadius,
            zIndex: projection.left.zIndex
          }}
        >
          <div
            className="duo-slice-inner-viewport"
            style={{
              width: `${fullLogicalW}px`,
              height: `${fullLogicalH}px`,
              left: '0px',
              top: '0px'
            }}
          >
            <WebviewContainer
              state={state}
              isDualUnfolded={true}
              reloadTick={props.reloadTick}
              onRegisterWebContentsId={(): void => {}}
            />
            <SystemOverlayLayer
              preset={preset}
              state={state}
              metrics={metrics}
              isOuterActive={false}
              logicalW={fullLogicalW}
              logicalH={fullLogicalH}
              onReload={props.onReload}
              onToggleDuoFold={props.onToggleDuoFold}
            />
          </div>
          {/* 3D Crease Valley Shading on Left / Top Leaf */}
          <div
            className={
              isHorizontalSplit
                ? 'duo-crease-leaf-shade duo-crease-bottom-edge'
                : 'duo-crease-leaf-shade duo-crease-right-edge'
            }
            style={{ opacity: Number((foldDepthIntensity * 0.85).toFixed(3)) }}
          />
        </div>
      )}

      {/* 3. Primary Persistent Live Screen Slice (Outer at 0°..28°/Stand, Right/Bottom Leaf when Bent, Full at 180°) */}
      {primarySlice && primarySlice.matrix3d && (
        <div
          className="duo-interactive-slice duo-slice-primary"
          style={{
            width: `${primarySlice.width}px`,
            height: `${primarySlice.height}px`,
            transform: primarySlice.matrix3d,
            opacity: primarySlice.opacity,
            borderRadius: primaryBorderRadius,
            zIndex: primarySlice.zIndex
          }}
        >
          <div
            className="duo-slice-inner-viewport"
            style={{
              width: `${fullLogicalW}px`,
              height: `${fullLogicalH}px`,
              left: `${primaryShiftX}px`,
              top: `${primaryShiftY}px`
            }}
          >
            <WebviewContainer
              state={state}
              isDualUnfolded={!isOuterPrimary}
              reloadTick={props.reloadTick}
              onRegisterWebContentsId={props.onRegisterWebContentsId}
            />
            <SystemOverlayLayer
              preset={preset}
              state={state}
              metrics={metrics}
              isOuterActive={isOuterPrimary}
              logicalW={fullLogicalW}
              logicalH={fullLogicalH}
              onReload={props.onReload}
              onToggleDuoFold={props.onToggleDuoFold}
            />
          </div>
          {isBentInner && (
            <div
              className={
                isHorizontalSplit
                  ? 'duo-crease-leaf-shade duo-crease-top-edge'
                  : 'duo-crease-leaf-shade duo-crease-left-edge'
              }
              style={{ opacity: Number((foldDepthIntensity * 0.85).toFixed(3)) }}
            />
          )}
        </div>
      )}
    </div>
  );
}
