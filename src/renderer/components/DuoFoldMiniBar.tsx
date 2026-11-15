import React from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Laptop,
  Play,
  RotateCcw,
  Smartphone,
  Tent
} from 'lucide-react';
import {
  DuoPostureId,
  resolveDeviceHingeStatus,
  sampleFoldCurve
} from '../../utils/duo-fold-math.util';

export interface DuoFoldMiniBarProps {
  readonly foldAngle: number;
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

  const roundedAngle = Math.round(foldAngle);
  const phi = sampleFoldCurve(foldAngle / 180);
  const status = resolveDeviceHingeStatus(foldAngle);
  const statusBadgeText =
    status === 'closed' ? 'Closed' : status === 'fullyOpen' ? 'Open' : 'Free-Stop 3D';

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

  return (
    <div className="duo-bottom-minibar" role="region" aria-label="iPhone Duo 3D Hinge Control">
      <div className="duo-posture-strip" role="group" aria-label="Preview Posture">
        {POSTURE_ITEMS.map((item) => {
          const isActive = posture === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`shadcn-seg-item ${isActive ? 'shadcn-seg-active' : ''}`}
              onClick={(): void => onSelectPosture(item.id)}
              title={item.title}
              aria-pressed={isActive}
            >
              {renderPostureIcon(item.id)}
              <span>{item.label}</span>
              <small className="duo-chip-deg">{item.angleLabel}</small>
            </button>
          );
        })}
      </div>

      <div className="duo-scrub-deck" title="Free-Stop hinge angle (0°–180°)">
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
      </div>

      <div className="duo-telemetry-group">
        <span className={`duo-status-pill duo-status-${status}`}>
          {statusBadgeText}
        </span>
        <span className="duo-angle-readout" title={`DeviceHinge.Status: ${status} · FoldCurve φ=${phi.toFixed(2)}`}>
          {`${roundedAngle}° · φ${phi.toFixed(2)} · ${logicalWidth}×${logicalHeight}`}
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
  );
}
