import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ComputedViewportMetrics,
  DeviceFormFactor,
  DevicePreset,
  HardwareCutoutType,
  Orientation
} from '../../types/device.types';
import motionApertures from '../../config/duo-motion-apertures.json';
import motionCrops from '../../config/duo-motion-crops.json';
import { ElectronWebviewElement } from '../../types/renderer.types';
import { DuoDisplayMode, SimulatorState } from '../../types/simulator.types';
import {
  Duo3DFrameProjection,
  Duo3DHardwareEngine,
  RIGHT_LEAF_HIDDEN,
  TRANSITION_MAX_BLUR_PX
} from '../../utils/duo-3d-engine.util';
import { transitionDimAlpha, sampleTransitionGradient } from '../../utils/duo-transition.util';
import { DuoPostureId } from '../../utils/duo-fold-math.util';
import { ScreenSystemOverlay } from './BrowserShellOverlay';
import { acquireGuestMirror, setGuestMirrorRate } from './GuestMirrorPane';
import { AppSurface, HomeScreen, LaunchSplash, ScreenModalLayer } from './ScreenLayers';
import { WebviewContainer } from './WebviewContainer';

export interface Duo3DStageProps {
  readonly transitioning: boolean;
  readonly focusHandoff: boolean;
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
  readonly onGoHome?: () => void;
  readonly displayBackground?: string | null;
  readonly tintColor?: string | null;
  readonly onPageReady?: (webContentsId: number) => void;
  readonly onNavigate?: (url: string) => void;
  readonly onUpdateState: (patch: Partial<SimulatorState>) => void;
}

const STAGE_WIDTH = 991;
const STAGE_HEIGHT = 718;

interface SystemOverlayLayerProps {
  readonly preset: DevicePreset;
  readonly state: SimulatorState;
  readonly isOuterActive: boolean;
  readonly isTallInner: boolean;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly tintColor?: string | null;
  readonly onReload: () => void;
  readonly onToggleDuoFold: () => void;
  readonly onGoHome?: () => void;
}

function SystemOverlayLayer(props: SystemOverlayLayerProps): React.ReactElement {
  return (
    <ScreenSystemOverlay
      preset={props.preset}
      cutoutType={
        props.isOuterActive
          ? HardwareCutoutType.DUO_OUTER_CORNER
          : HardwareCutoutType.UNDER_DISPLAY_HIDDEN
      }
      orientation={
        !props.isOuterActive && props.isTallInner ? Orientation.LANDSCAPE : Orientation.PORTRAIT
      }
      state={props.state}
      logicalW={props.logicalW}
      logicalH={props.logicalH}
      tintColor={props.tintColor}
      onReload={props.onReload}
      onToggleDuoFold={props.onToggleDuoFold}
      onGoHome={props.onGoHome}
    />
  );
}

const INNER_W = 951;
const INNER_H = 669;
const HINGE_X = INNER_W / 2;
interface AnchoredFaceProps {
  readonly side: 'cover' | 'innerLeft';
  readonly gradientX: readonly number[];
  readonly matrix3d: string;
  readonly clip: string;
  readonly motion: number;
  readonly brightness: number;
  readonly pageWidth: number;
  readonly coverLayout: boolean;
  readonly guestId: number | null;
  readonly preset: DevicePreset;
  readonly state: SimulatorState;
  readonly tintColor?: string | null;
  readonly onReload: () => void;
  readonly onToggleDuoFold: () => void;
  readonly onGoHome?: () => void;
}

function leafGradient(side: AnchoredFaceProps['side'], motion: number, gradientX: readonly number[]): string {
  const dimStops = [0, 0.2, 0.4, 0.6, 0.8, 1].map((e) => {
    const alpha = transitionDimAlpha(e, motion);
    return { x: sampleTransitionGradient(gradientX, e), alpha };
  });
  if (side === 'innerLeft') dimStops.reverse();
  return `linear-gradient(to right, ${dimStops
    .map((st) => `rgba(0,0,0,${st.alpha.toFixed(3)}) ${st.x.toFixed(1)}px`)
    .join(', ')})`;
}

type MovingScreenProps = Pick<AnchoredFaceProps, 'side' | 'pageWidth' | 'coverLayout' | 'guestId' | 'preset' | 'state' | 'tintColor' | 'onReload' | 'onToggleDuoFold' | 'onGoHome'>;
function MovingScreenContent(props: MovingScreenProps): React.ReactElement {
  const { side } = props;
  return (
    <div
      className="duo-slice-inner-viewport"
      style={{ width: props.pageWidth, height: INNER_H, marginLeft: INNER_W - props.pageWidth }}
    >
      <AppSurface>
        <WebviewContainer
          state={props.state}
          isDualUnfolded={!props.coverLayout}
          reloadTick={0}
          onRegisterWebContentsId={(): void => {}}
          mirrorGuestId={props.guestId}
          mirrorCoverFrameOffsetX={side === 'cover' ? HINGE_X : undefined}
          mirrorInteractive={side === 'innerLeft'}
        />
      </AppSurface>
      <HomeScreen mirror width={props.pageWidth} height={INNER_H} safeTop={20} trailingInset={84} />
      <SystemOverlayLayer
        preset={props.preset}
        state={props.state}
        isOuterActive={props.coverLayout}
        isTallInner={false}
        tintColor={props.tintColor}
        onGoHome={props.onGoHome}
        logicalW={props.pageWidth}
        logicalH={INNER_H}
        onReload={props.onReload}
        onToggleDuoFold={props.onToggleDuoFold}
      />
    </div>
  );
}

type FaceOpticsProps = MovingScreenProps & Pick<AnchoredFaceProps, 'side' | 'gradientX' | 'motion' | 'clip'>;

function FaceOptics(props: FaceOpticsProps): React.ReactElement | null {
  const { side, gradientX, motion, clip } = props;
  if (motion <= 0) return null;
  // Project the blur mask along the glass. The held half and the hinge stay sharp.
  const hinge = sampleTransitionGradient(gradientX, 0).toFixed(2);
  const edge = sampleTransitionGradient(gradientX, 0.85).toFixed(2);
  const mask = side === 'cover' ? `transparent ${hinge}px, black ${edge}px`
    : `black ${edge}px, transparent ${hinge}px`;
  // Tuned CSS radii in unfolded-screen points. The cover diffuses more strongly.
  const radius = motion * (side === 'cover' ? TRANSITION_MAX_BLUR_PX : 14);
  return <>
    <div className="duo-anchored-blur" data-face={side} aria-hidden="true" style={{
      clipPath: clip, maskImage: `linear-gradient(to right, ${mask})`
    }} ref={el => { if (el) el.inert = true; }}>
      <div className="duo-focus-source" style={{filter: `blur(${radius.toFixed(2)}px)`}}>
        <MovingScreenContent {...props} />
      </div>
    </div>
    <div className="duo-anchored-dim" aria-hidden="true" style={{
      clipPath: clip, background: leafGradient(side, motion, gradientX)
    }} />
  </>;
}

/**
 * One screen of the moving leaf during the opening / closing transition.
 *
 * Follows the published descriptions of the iPhone Duo transition (content
 * anchored in space, the moving half blurring and darkening towards its free
 * edge, the fixed half untouched). The blur / dim falloff shape is adapted
 * from the MIT-licensed study at github.com/chuspeeism/iphone-duo, with the
 * linear blur ramp reported in github.com/arjunkshah12345-hash/duokit#2.
 *
 * The inner display's picture is laid out on the unfolded plane and never
 * moves; this component shows the part of it seen through the leaf's screen
 * (the clip), progressively blurred and dimmed from the hinge to the free
 * edge. The cover therefore shows exactly what lies beneath it, and the
 * picture appears to pass through the swinging half.
 */
function AnchoredFace(props: AnchoredFaceProps): React.ReactElement {
  const { side } = props;
  return (
    <div
      className={`duo-interactive-slice duo-anchored-face duo-anchored-${side}`}
      style={{
        width: `${INNER_W}px`,
        height: `${INNER_H}px`,
        transform: props.matrix3d,
        clipPath: props.clip,
        zIndex: 17,
        filter: props.brightness >= 0.999 ? undefined : `brightness(${props.brightness.toFixed(3)})`
      }}
    >
      <MovingScreenContent {...props} />
      <FaceOptics {...props} />
    </div>
  );
}

export function Duo3DStage(props: Duo3DStageProps): React.ReactElement {
  const {
    preset,
    state,
    foldAngle,
    transitioning,
    posture,
    finish,
    orbitDeg,
    pitchDeg
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Duo3DHardwareEngine | null>(null);
  const [projection, setProjection] = useState<Duo3DFrameProjection | null>(null);
  const [primaryGuestId, setPrimaryGuestId] = useState<number | null>(null);
  const [coverDialog, setCoverDialog] = useState<{ center: number; width: number } | null>(null);
  const coverPaneRef = useRef<HTMLDivElement>(null);
  const [coverSelected, setCoverSelected] = useState(false);
  const [atlas, setAtlas] = useState<{ finish: string; frames: ImageBitmap[] } | null>(null);
  const motionCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    let published = false;
    const frames: ImageBitmap[] = [];
    async function prepare() {
      // Raster each sheet once. Drawing a source rectangle directly from a large
      // compressed atlas can synchronously upload the whole sheet on first use.
      for (let group = 0; group < motionCrops.length && active; group++) {
        const sheet = new Image();
        sheet.src = `./duo-3d/motion/${finish}-${group}.webp`;
        await sheet.decode();
        if (!active) return;
        const [left, top, right, bottom] = motionCrops[group];
        const width = right - left, height = bottom - top;
        const tile = new OffscreenCanvas(width, height);
        const ctx = tile.getContext('2d', {willReadFrequently: true});
        if (!ctx) return;
        for (let i = 0; i < 9 && group * 9 + i <= 60; i++) {
          ctx.drawImage(sheet, i % 3 * width, Math.floor(i / 3) * height,
            width, height, 0, 0, width, height);
          frames.push(tile.transferToImageBitmap());
        }
      }
      if (active) {
        published = true;
        setAtlas({finish, frames});
      }
    }
    void prepare().catch(() => { if (active) setAtlas(null); });
    return () => {
      active = false;
      if (!published) frames.forEach(bitmap => bitmap.close());
    };
  }, [finish]);
  useEffect(() => () => { atlas?.frames.forEach(bitmap => bitmap.close()); }, [atlas]);
  const useMotionRig = transitioning && atlas?.finish === finish && orbitDeg === 0 && pitchDeg === 0 &&
    (posture === 'open' || posture === 'closed');
  const frame = Math.round(foldAngle / 3);
  useLayoutEffect(() => {
    if (!useMotionRig || !atlas) return;
    const ctx = motionCanvas.current?.getContext('2d');
    if (!ctx) return;
    const group = Math.floor(frame / 9);
    const [left, top, right, bottom] = motionCrops[group];
    const width = right - left, height = bottom - top;
    ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.drawImage(atlas.frames[frame], left, top, width, height);
  }, [atlas, frame, useMotionRig]);
  const projectedAngle = useMotionRig ? frame * 3 : foldAngle;
  const dragRef = useRef<{
    readonly startX: number;
    readonly startY: number;
    readonly startOrbit: number;
    readonly startPitch: number;
  } | null>(null);

  useLayoutEffect((): (() => void) => {
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

  // Commit the canvas and its DOM apertures before the same paint.
  useLayoutEffect((): void => {
    if (!engineRef.current) return;
    const nextProj = engineRef.current.renderFrame({
      stageWidth: STAGE_WIDTH,
      stageHeight: STAGE_HEIGHT,
      foldAngleDeg: projectedAngle,
      transitioning,
      posture,
      orbitDeg,
      pitchDeg,
      zoom: 1.0,
      finish
    }, !useMotionRig);
    setProjection(nextProj);
  }, [projectedAngle, useMotionRig, transitioning, posture, orbitDeg, pitchDeg, finish]);

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

  const isOuterPrimary = projection ? projection.isOuterPrimary : foldAngle < 20;
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

  const split = state.duoDisplayMode === DuoDisplayMode.SPLIT_COMPARISON;
  const transition = projection?.transition;
  const flatMotion = useMotionRig && !split && transition?.active;
  // The PWA reflows once across the optical handoff. Keep the page right-aligned
  // and wide enough to fill every exposed point of the unfolded picture.
  const handoff = props.focusHandoff && transition?.active;
  const exposedLeft = projection?.leftFacing && transition
    ? Math.min(HINGE_X, ...transition.innerGradientX) : HINGE_X;
  const coverWidth = projection?.outer.width ?? 466;
  const pageWidth = handoff ? Math.min(INNER_W, Math.ceil(Math.max(INNER_W - exposedLeft,
    coverWidth + (INNER_W - coverWidth) * (1 - transition.innerMotion)))) : fullLogicalW;
  const coverLayout = handoff ? preset.formFactor === DeviceFormFactor.FOLDABLE_COVER : isOuterPrimary;
  const sliceInner = !flatMotion && (isBentInner || split);
  const primarySlice = flatMotion ? transition.flat : isOuterPrimary
    ? projection?.outer
    : sliceInner
      ? projection?.right
      : projection?.full;

  const primaryShiftX = !isOuterPrimary && sliceInner && !isHorizontalSplit ? -475.5 : 0;
  const primaryShiftY = !isOuterPrimary && sliceInner && isHorizontalSplit ? -475.5 : 0;

  const rawPrimaryClip = !flatMotion && isBentInner ? projection?.rightVisibleClip ?? undefined : undefined;
  const primaryHidden = rawPrimaryClip === RIGHT_LEAF_HIDDEN || !primarySlice?.active;
  const primaryClip = primaryHidden ? undefined : rawPrimaryClip;
  const mirrorLeft = !split;
  const splitSurface = split ? {
    width: `${isOuterPrimary ? fullLogicalW : projection?.right.width ?? fullLogicalW}px`,
    height: `${isOuterPrimary ? fullLogicalH : projection?.right.height ?? fullLogicalH}px`,
    left: `${-primaryShiftX}px`, top: `${-primaryShiftY}px`
  } : undefined;

  // The front-view sweep uses the actual guest through the mesh stencil.
  // Capture the guest only for views which need a second projected surface.
  const inTransition = Boolean(transition?.active) && mirrorLeft;
  // Keep the cover on its own glass when scrubbing or pausing. Its visible
  // area depends on camera orientation, even at the same hinge angle.
  const cover = projection?.outer;
  const showCoverMirror = Boolean(cover?.active && !isOuterPrimary && !inTransition);
  const modalOnCover = showCoverMirror && (coverSelected || primaryHidden);
  const coverSourceWidth = split ? primarySlice?.width ?? fullLogicalW : fullLogicalW;
  const coverSourceHeight = split ? primarySlice?.height ?? fullLogicalH : fullLogicalH;
  const coverScale = cover ? Math.max(cover.width / coverSourceWidth, cover.height / coverSourceHeight) : 1;
  // The cover normally shows the trailing portion of the live page. A web
  // dialog can be centred in the unfolded viewport, outside that crop.
  // Read its bounds only while the cover is in use. Never restyle the guest.
  useEffect(() => {
    if (!showCoverMirror || !coverSelected || !primaryGuestId) {
      setCoverDialog(null);
      return;
    }
    const guest = document.querySelector<ElectronWebviewElement>('.duo-slice-primary webview');
    if (!guest) return;
    let stopped = false;
    let timer = 0;
    const measure = async (): Promise<void> => {
      let next: {center: number; width: number} | null = null;
      try {
        const bounds = await guest.executeJavaScript(`(() => {
          const dialogs = document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"],[role="alertdialog"]');
          for (const dialog of Array.from(dialogs).reverse()) {
            const r = dialog.getBoundingClientRect();
            if (r.width && r.height && dialog.checkVisibility()) return [(r.x + r.width / 2) / innerWidth, r.width / innerWidth];
          }
          return null;
        })()`);
        if (Array.isArray(bounds) && bounds.length === 2 && bounds.every(Number.isFinite)) {
          next = {center: bounds[0] * guest.clientWidth, width: bounds[1] * guest.clientWidth};
        }
      } catch { /* The guest may be between documents. */ }
      if (stopped) return;
      setCoverDialog(previous => previous?.center === next?.center && previous?.width === next?.width ? previous : next);
      timer = window.setTimeout(() => { void measure(); }, 220);
    };
    void measure();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [showCoverMirror, coverSelected, primaryGuestId]);
  const railWidth = coverPaneRef.current?.querySelector<HTMLElement>('.ios-duo-vertical-rail')?.offsetWidth ?? 0;
  const coverPageWidth = (cover?.width ?? 466) - railWidth;
  const contentScale = coverDialog && coverDialog.width > 0
    ? Math.min(coverScale, (coverPageWidth - 16) / coverDialog.width) : coverScale;
  const defaultLeft = (cover?.width ?? 466) - coverSourceWidth * coverScale;
  const coverLeft = coverDialog
    ? Math.min(0, Math.max(coverPageWidth - coverSourceWidth * contentScale, coverPageWidth / 2 - coverDialog.center * contentScale))
    : defaultLeft;
  const innerBrightness = projection?.innerBrightness ?? 1;
  const innerFilter = innerBrightness >= 0.999 ? undefined : `brightness(${innerBrightness.toFixed(3)})`;
  // Keep the same capture stream across the cover-to-inner transfer.
  const needsMirror = showCoverMirror || (mirrorLeft && (transitioning || isBentInner));
  useEffect(() => {
    if (!needsMirror || primaryGuestId === null) return;
    const release = acquireGuestMirror(primaryGuestId);
    setGuestMirrorRate(primaryGuestId, 30);
    return release;
  }, [needsMirror, primaryGuestId]);

  const movingScreen = { pageWidth, coverLayout, guestId: primaryGuestId, preset, state, tintColor: props.tintColor,
    onReload: props.onReload, onToggleDuoFold: props.onToggleDuoFold, onGoHome: props.onGoHome };
  const foldDepthIntensity = projection
    ? Math.sin(projection.phi * Math.PI)
    : 0;

  return (
    <div
      className="duo-3d-stage-root"
      data-motion-ready={atlas?.finish === finish || undefined}
      data-motion-frame={useMotionRig ? frame : undefined}
      data-dual-display={projection?.simultaneous || undefined}
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
      {/* 1. Restored skinned foldable hardware canvas */}
      <canvas
        ref={canvasRef}
        className="duo-3d-webgl-canvas"
        style={{visibility: useMotionRig ? 'hidden' : undefined}}
        width={STAGE_WIDTH}
        height={STAGE_HEIGHT}
        aria-hidden="true"
      />

      <canvas ref={motionCanvas} className="duo-motion-hardware" aria-hidden="true"
        width={STAGE_WIDTH} height={STAGE_HEIGHT} hidden={!useMotionRig} />
      {/* 2. Secondary Left / Upper Leaf Slice when in 3D Bent Posture (20°..177°) */}
      {projection && (split || (isBentInner && !inTransition && projection.left.active && projection.left.matrix3d)) && (
        <div
          className="duo-interactive-slice duo-slice-secondary"
          style={{
            // Extend 2px past the hinge, underneath the primary leaf: the
            // anti-aliased edges of two transformed layers otherwise leave a
            // 1px light seam along the crease.
            width: `${projection.left.width + (isHorizontalSplit ? 0 : 2)}px`,
            height: `${projection.left.height + (isHorizontalSplit ? 2 : 0)}px`,
            transform: projection.left.matrix3d ?? undefined,
            display: split && (isOuterPrimary || !projection.left.active) ? 'none' : undefined,
            opacity: projection.left.opacity,
            filter: innerFilter,
            zIndex: projection.left.zIndex
          }}
        >
          <div
            className="duo-slice-inner-viewport"
            style={{
              width: `${fullLogicalW}px`,
              height: `${fullLogicalH}px`,
              left: '0px',
              top: '0px',
              clipPath: projection.full.apertureClip
            }}
          >
            <AppSurface style={split ? { width: `${projection.left.width}px`, height: `${projection.left.height}px` } : undefined}>
              <WebviewContainer
                state={split ? { ...state, currentUrl: state.secondaryUrl } : state}
                reserveSystemRail={!split}
                onNavigate={split ? (url): void => props.onUpdateState({ secondaryUrl: url }) : undefined}
                isDualUnfolded={true}
                reloadTick={props.reloadTick}
                onRegisterWebContentsId={(): void => {}}
                mirrorGuestId={mirrorLeft ? primaryGuestId : undefined}
              />
            </AppSurface>
            <HomeScreen width={fullLogicalW} height={fullLogicalH} safeTop={54} trailingInset={isHorizontalSplit ? 0 : 84} />
            <SystemOverlayLayer
              preset={preset}
              state={state}
              isOuterActive={false}
              isTallInner={isHorizontalSplit}
              tintColor={props.tintColor}
              onGoHome={props.onGoHome}
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

      {showCoverMirror && cover?.matrix3d && (
        <div className="duo-interactive-slice duo-cover-mirror" aria-label="Cover display" ref={coverPaneRef} onPointerDownCapture={() => setCoverSelected(true)}
          style={{width: cover.width, height: cover.height, transform: cover.matrix3d, zIndex: cover.zIndex}}>
          <div className="duo-slice-inner-viewport" style={{width: cover.width, height: cover.height, clipPath: cover.apertureClip, maskImage: cover.lensMask}}>
            <div className="duo-cover-source" data-framed-dialog={Boolean(coverDialog) || undefined}
              style={{width: coverSourceWidth, height: coverSourceHeight, left: coverLeft,
                top: (cover.height - coverSourceHeight * contentScale) / 2, transform: `scale(${contentScale})`}}>
              <AppSurface>
                <WebviewContainer state={state} reloadTick={0} isDualUnfolded onRegisterWebContentsId={() => {}}
                  mirrorGuestId={primaryGuestId} reserveSystemRail={!split} />
              </AppSurface>
            </div>
            <HomeScreen width={cover.width} height={cover.height} safeTop={54} />
            <SystemOverlayLayer preset={preset} state={state} isOuterActive isTallInner={false}
              logicalW={cover.width} logicalH={cover.height} tintColor={props.tintColor}
              onGoHome={props.onGoHome} onReload={props.onReload} onToggleDuoFold={props.onToggleDuoFold} />
            {modalOnCover && <div className="duo-modal-viewport" style={{inset: 0}}><ScreenModalLayer /></div>}
            <div className="duo-cover-glass" style={{opacity: projection?.coverReflection}} />
          </div>
        </div>
      )}

      {/* 3. Primary Persistent Live Screen Slice (Outer at 0°..28°/Stand, Right/Bottom Leaf when Bent, Full at 180°) */}
      {primarySlice && primarySlice.matrix3d && (
        <div
          className="duo-interactive-slice duo-slice-primary"
          onPointerDownCapture={() => setCoverSelected(false)}
          style={{
            width: flatMotion ? STAGE_WIDTH : primarySlice.width,
            height: flatMotion ? STAGE_HEIGHT : primarySlice.height,
            backgroundColor: flatMotion ? (state.darkMode ? '#161619' : '#f4f4f6') : undefined,
            backgroundImage: flatMotion && (props.displayBackground || props.tintColor)
              ? `linear-gradient(${props.displayBackground || props.tintColor}, ${props.displayBackground || props.tintColor})` : undefined,
            transform: flatMotion ? undefined : primarySlice.matrix3d,
            opacity: primaryHidden ? 0.002 : primarySlice.opacity,
            pointerEvents: primaryHidden ? 'none' : undefined,
            clipPath: flatMotion ? `path(evenodd, "${motionApertures[frame]}")` : primaryClip,
            filter: flatMotion || isOuterPrimary ? undefined : innerFilter,
            zIndex: primarySlice.zIndex
          }}
        >
          <div
            className="duo-slice-inner-viewport"
            style={{
              width: `${fullLogicalW}px`,
              height: `${fullLogicalH}px`,
              left: `${primaryShiftX}px`,
              top: `${primaryShiftY}px`,
              transform: flatMotion ? primarySlice.matrix3d : undefined,
              transformOrigin: flatMotion ? '0 0' : undefined,
              maskImage: isOuterPrimary ? projection?.outer.lensMask : undefined,
              clipPath: flatMotion ? undefined : isOuterPrimary ? projection?.outer.apertureClip : projection?.full.apertureClip
            }}
          >
            <div className="duo-page-layout" style={{width: pageWidth, left: fullLogicalW - pageWidth}}>
              <AppSurface style={splitSurface}>
                <WebviewContainer
                  state={state}
                  isDualUnfolded={!coverLayout}
                  reloadTick={props.reloadTick}
                  onRegisterWebContentsId={(id: number): void => {
                    setPrimaryGuestId(id);
                    props.onRegisterWebContentsId(id);
                  }}
                  onPageReady={props.onPageReady}
                  onNavigate={props.onNavigate}
                />
                <LaunchSplash />
              </AppSurface>
              <HomeScreen width={pageWidth} height={fullLogicalH} safeTop={54} trailingInset={isOuterPrimary || !isHorizontalSplit ? 84 : 0} />
              <SystemOverlayLayer
                preset={preset}
                state={state}
                isOuterActive={coverLayout}
                isTallInner={isHorizontalSplit}
                tintColor={props.tintColor}
                onGoHome={props.onGoHome}
                logicalW={pageWidth}
                logicalH={fullLogicalH}
                onReload={props.onReload}
                onToggleDuoFold={props.onToggleDuoFold}
              />
            </div>
            {flatMotion && transition.coverClip && <FaceOptics {...movingScreen} side="cover" clip={transition.coverClip}
              gradientX={transition.coverGradientX} motion={transition.coverMotion} />}
            {flatMotion && transition.leftClip && <FaceOptics {...movingScreen} side="innerLeft" clip={transition.leftClip}
              gradientX={transition.innerGradientX} motion={transition.innerMotion} />}
            <div className="duo-modal-viewport" style={{ left: -primaryShiftX, top: -primaryShiftY, width: primarySlice.width, height: primarySlice.height }}>
              {!modalOnCover && <ScreenModalLayer />}
            </div>
          </div>
          {isBentInner && !inTransition && (
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

      {/* 4. Opening / closing transition: the moving leaf's two screens show the
          picture anchored to the unfolded plane, blurred and dimmed towards
          the free edge, like tracing paper lifting off the page. */}
      {inTransition && !flatMotion && transition && projection && transition.flat.matrix3d && (
        <>
          {transition.leftClip && (
            <AnchoredFace
              pageWidth={pageWidth}
              coverLayout={coverLayout}
              side="innerLeft"
              gradientX={transition.innerGradientX}
              matrix3d={transition.flat.matrix3d}
              clip={transition.leftClip}
              motion={transition.innerMotion}
              brightness={innerBrightness}
              guestId={primaryGuestId}
              preset={preset}
              state={state}
              tintColor={props.tintColor}
              onReload={props.onReload}
              onToggleDuoFold={props.onToggleDuoFold}
              onGoHome={props.onGoHome}
            />
          )}
          {transition.coverClip && (
            <AnchoredFace
              pageWidth={pageWidth}
              coverLayout={coverLayout}
              side="cover"
              gradientX={transition.coverGradientX}
              matrix3d={transition.flat.matrix3d}
              clip={transition.coverClip}
              motion={transition.coverMotion}
              brightness={1}
              guestId={primaryGuestId}
              preset={preset}
              state={state}
              tintColor={props.tintColor}
              onReload={props.onReload}
              onToggleDuoFold={props.onToggleDuoFold}
              onGoHome={props.onGoHome}
            />
          )}
        </>
      )}
    </div>
  );
}
