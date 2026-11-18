import React from 'react';
import {
  BookOpen,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Laptop,
  Play,
  Pause,
  FolderClosed,
  RotateCcw,
  Smartphone,
  Tent
} from 'lucide-react';
import {
  DuoPostureId,
  resolveDeviceHingeStatus,
  sampleFoldCurve
} from '../../utils/duo-fold-math.util';
import { POSTURE_TARGET_DEG } from '../useDuoHingeController';

export interface DuoFoldMiniBarProps {
  readonly foldAngle: number;
  readonly targetAngle: number | null;
  readonly canResume: boolean;
  readonly onResume: () => void;
  readonly onToggleFold: (slow?: boolean) => void;
  readonly onPause: () => void;
  readonly posture: DuoPostureId;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly finish: 'night' | 'white';
  readonly hasCustomOrbit: boolean;
  readonly onScrubAngle: (angleDeg: number) => void;
  readonly onStepAngle: (deltaDeg: number) => void;
  readonly onSelectPosture: (posture: DuoPostureId) => void;
  readonly onToggleFinish: () => void;
  readonly onResetOrbit: () => void;
}

const POSTURE_ITEMS: readonly {
  readonly id: DuoPostureId;
  readonly label: string;
  readonly angleLabel: string;
  readonly title: string;
}[] = [
  { id: 'closed', label: 'Closed', angleLabel: '0°', title: 'Cover Display (5.4″ · 466×678pt)' },
  { id: 'standing', label: 'Stand', angleLabel: '70°', title: 'Tent / Stand Mode (70°)' },
  { id: 'book', label: 'Book', angleLabel: '100°', title: 'Book Mode Free-Stop (100°)' },
  { id: 'tabletop', label: 'Table', angleLabel: '108°', title: 'Tabletop Mode (108° Split)' },
  { id: 'open', label: 'Open', angleLabel: '180°', title: 'Inner Wide Display (7.6″ · 951×669pt)' },
  { id: 'portrait', label: 'Portrait', angleLabel: '180°', title: 'Inner Portrait (669×951pt)' }
];

const DETENT_TICKS: readonly number[] = [0, 70, 100, 108, 180];

export function DuoFoldMiniBar(props: DuoFoldMiniBarProps): React.ReactElement {
  const {
    foldAngle,
    targetAngle,
    canResume,
    onResume,
    onToggleFold,
    onPause,
    posture,
    logicalWidth,
    logicalHeight,
    finish,
    hasCustomOrbit,
    onScrubAngle,
    onStepAngle,
    onSelectPosture,
    onToggleFinish,
    onResetOrbit
  } = props;

  const [showPostures, setShowPostures] = React.useState(false);
  const barRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showPostures) return;
    const outside = (event: PointerEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) setShowPostures(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setShowPostures(false);
        barRef.current?.querySelector<HTMLButtonElement>('.duo-settings')?.focus();
      }
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',key);
    return () => {document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
  }, [showPostures]);
  const roundedAngle = Math.round(foldAngle);
  const phi = sampleFoldCurve(foldAngle / 180);
  const status = resolveDeviceHingeStatus(foldAngle);
  const statusBadgeText =
    targetAngle !== null ? targetAngle > foldAngle ? 'Opening' : 'Closing' : 'Free-stop';

  const renderPostureIcon = (id: DuoPostureId): React.ReactNode => {
    switch (id) {
      case 'closed':
        return <Smartphone size={10} />;
      case 'standing':
        return <Tent size={10} />;
      case 'book':
        return <BookOpen size={10} />;
      case 'tabletop':
        return <Laptop size={10} />;
      case 'open':
        return <Play size={9} style={{ transform: 'rotate(-90deg)' }} />;
      case 'portrait':
        return <Smartphone size={10} />;
    }
  };

  const scrubAtPointer = (event: React.PointerEvent<HTMLInputElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const thumbRadius = 10;
    const fraction = (event.clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - 2 * thumbRadius);
    onScrubAngle(Math.round(Math.max(0, Math.min(1, fraction)) * 180));
  };

  return (
    <div ref={barRef} className="duo-bottom-minibar" role="region" aria-label="iPhone Duo 3D Hinge Control" data-posture={posture} data-target={targetAngle ?? "paused"}>
      <div className="duo-scrub-deck">
        <button type="button" className="duo-fold-toggle"
          onClick={e => onToggleFold(e.shiftKey)}
          title="Open / close. Click again to reverse. Shift-click for slow motion."
          aria-label={(targetAngle ?? foldAngle) < 90 ? 'Open Duo' : 'Close Duo'}>
          {(targetAngle ?? foldAngle) < 90 ? <BookOpen size={15} /> : <FolderClosed size={15} />}
          <span>{(targetAngle ?? foldAngle) < 90 ? 'Open' : 'Close'}</span>
        </button>
        <button type="button" className="duo-pause-btn" onClick={canResume ? onResume : onPause}
          disabled={targetAngle === null && !canResume}
          aria-label={canResume ? 'Resume hinge motion' : 'Pause hinge motion'}
          title={canResume ? 'Resume' : 'Pause (Escape)'}>
          {canResume ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          type="button"
          className="duo-frame-step-btn"
          onClick={(e): void => onStepAngle(e.shiftKey ? -5 : -1)}
          title="Fold 1° (Shift+Click: 5°)"
          aria-label="Fold 1 degree"
        >
          <ChevronLeft size={11} />
          <span>-1°</span>
        </button>

        <div className="duo-slider-track-wrap">
          <div className="duo-slider-ticks" aria-hidden="true">
            {DETENT_TICKS.map((deg) => (
              <span
                key={deg}
                className={`duo-tick-dot ${Math.abs(roundedAngle - deg) <= 2 ? 'duo-tick-active' : ''}`}
                style={{ left: `${(deg / 180) * 100}%` }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={180}
            step={1}
            value={roundedAngle}
            aria-label="iPhone Duo Hinge Angle (0 to 180 degrees)"
            className="duo-hinge-slider"
            aria-valuetext={`${roundedAngle} degrees`}
            onPointerDown={e => {
              if (!e.isPrimary || e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              scrubAtPointer(e);
            }}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubAtPointer(e); }}
            onPointerUp={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              scrubAtPointer(e);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onChange={(e): void => onScrubAngle(Number(e.target.value))}
          />
        </div>

        <button
          type="button"
          className="duo-frame-step-btn"
          onClick={(e): void => onStepAngle(e.shiftKey ? 5 : 1)}
          title="Unfold 1° (Shift+Click: 5°)"
          aria-label="Unfold 1 degree"
        >
          <span>+1°</span>
          <ChevronRight size={11} />
        </button>
        <button type="button" className="duo-settings" aria-label="Posture and finish" aria-controls="duo-posture-options" aria-expanded={showPostures} onClick={() => setShowPostures(!showPostures)}><SlidersHorizontal size={15} /></button>
        <output className="duo-current-angle" aria-hidden="true">{roundedAngle}°</output>
      </div>

      <div id="duo-posture-options" className="duo-secondary-controls" hidden={!showPostures}>
      <div className="duo-posture-strip" role="group" aria-label="Preview Posture">
        {POSTURE_ITEMS.map((item) => {
          const matchesView = posture === item.id ||
            ((posture === 'closed' || posture === 'open') && (item.id === 'closed' || item.id === 'open'));
          const isActive = matchesView && Math.abs(foldAngle - POSTURE_TARGET_DEG[item.id]) < 0.5;
          return (
            <button
              key={item.id}
              type="button"
              className={`shadcn-seg-item ${isActive ? 'shadcn-seg-active' : ''}`}
              onClick={(): void => { onSelectPosture(item.id); setShowPostures(false); }}
              title={item.title}
              aria-pressed={isActive}
            >
              {renderPostureIcon(item.id)}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="duo-telemetry-group">
        <span className="duo-finish-label">{finish === 'night' ? 'Night Sky' : 'Star White'}</span>
        <span className={`duo-status-pill duo-status-${status}`}>
          {statusBadgeText}
        </span>
        <span
          className="duo-angle-readout"
          title={`Hinge ${roundedAngle}° · DeviceHinge.Status ${status} · FoldCurve φ=${phi.toFixed(2)} · lit display ${logicalWidth}×${logicalHeight} pt`}
        >
          {`${roundedAngle}° · ${logicalWidth}×${logicalHeight}`}
        </span>
        <button
          type="button"
          className={`duo-finish-dot duo-finish-${finish}`}
          onClick={onToggleFinish}
          title={finish === 'night' ? 'Night Sky finish (click for Star White)' : 'Star White finish (click for Night Sky)'}
          aria-label="Toggle device finish"
        />
        {hasCustomOrbit && (
          <button
            type="button"
            className="duo-reset-orbit-btn"
            onClick={onResetOrbit}
            title="Reset 3D camera view"
            aria-label="Reset 3D camera view"
          >
            <RotateCcw size={10} />
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
