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
  { id: 'closed', label: '닫힘', angleLabel: '0°', title: '외부 커버 디스플레이 (5.4″ · 466×678pt)' },
  { id: 'standing', label: '세우기', angleLabel: '70°', title: '스탠드 / 텐트 거치 모드 (70° ∧형)' },
  { id: 'book', label: '책처럼', angleLabel: '100°', title: '북 모드 입체 접힘 (100° Free-Stop)' },
  { id: 'tabletop', label: '테이블', angleLabel: '108°', title: '테이블탑 / 노트북 거치 모드 (108° 상·하 분할)' },
  { id: 'open', label: '펼침', angleLabel: '180°', title: '내부 와이드 디스플레이 (7.6″ · 951×669pt)' },
  { id: 'portrait', label: '세로', angleLabel: '180°', title: '내부 세로 펼침 (669×951pt)' }
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
    status === 'closed' ? '닫힘' : status === 'fullyOpen' ? '완전 펼침' : '프리-스탑 3D';

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
      <div className="duo-posture-strip" role="group" aria-label="프리뷰 자세">
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

      <div className="duo-scrub-deck" title="1° 프레임 단위 Free-Stop 힌지 각도 조절 (0°–180°)">
        <button
          type="button"
          className="duo-frame-step-btn"
          onClick={(e): void => onStepAngle(e.shiftKey ? -5 : -1)}
          title="1° 닫기 (Shift+클릭: 5° 닫기)"
          aria-label="1도 닫기"
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
          title="1° 열기 (Shift+클릭: 5° 열기)"
          aria-label="1도 열기"
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
          title={finish === 'night' ? 'Night Sky 마감 (클릭하여 Star White 전환)' : 'Star White 마감 (클릭하여 Night Sky 전환)'}
          aria-label="기기 마감 색상 전환"
        />
        {hasCustomOrbit && (
          <button
            type="button"
            className="duo-reset-orbit-btn"
            onClick={onResetOrbit}
            title="3D 카메라 회전 시점 초기화"
            aria-label="3D 시점 초기화"
          >
            <RotateCcw size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
