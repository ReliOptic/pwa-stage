import React, { useRef, useState } from 'react';
import { BookOpen, ChevronDown, FolderClosed, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { DuoPostureId } from '../../utils/duo-fold-math.util';
import { POSTURE_TARGET_DEG } from '../useDuoHingeController';

export interface DuoFoldMiniBarProps {
  readonly foldAngle: number;
  readonly targetAngle: number | null;
  readonly canResume: boolean;
  readonly motionReduced: boolean;
  readonly alwaysAnimate: boolean;
  readonly onMotionOverride: (value: boolean) => void;
  readonly onResume: () => void;
  readonly onToggleFold: (slow?: boolean) => void;
  readonly onPause: () => void;
  readonly posture: DuoPostureId;
  readonly finish: 'night' | 'white';
  readonly hasCustomOrbit: boolean;
  readonly onScrubActiveChange: (active: boolean) => void;
  readonly onScrubAngle: (angleDeg: number) => void;
  readonly onStepAngle: (deltaDeg: number) => void;
  readonly onSelectPosture: (posture: DuoPostureId) => void;
  readonly onToggleFinish: () => void;
  readonly onResetOrbit: () => void;
}

const POSTURES: ReadonlyArray<readonly [DuoPostureId, string]> = [
  ['closed', 'Closed'], ['standing', 'Stand'], ['book', 'Book'],
  ['tabletop', 'Table'], ['open', 'Open'], ['portrait', 'Portrait']
];

export function DuoFoldMiniBar(props: DuoFoldMiniBarProps): React.ReactElement {
  const { foldAngle, targetAngle, onScrubAngle, onScrubActiveChange } = props;
  const [expanded, setExpanded] = useState(false);
  const disclosure = useRef<HTMLButtonElement>(null);
  const roundedAngle = Math.round(foldAngle);
  const opens = (targetAngle ?? foldAngle) < 90;
  const activePosture = POSTURES.find(([id]) => POSTURE_TARGET_DEG[id] === roundedAngle &&
    (id === props.posture || ((id === 'closed' || id === 'open') &&
      (props.posture === 'closed' || props.posture === 'open'))))?.[0] ?? '';

  const scrubAtPointer = (event: React.PointerEvent<HTMLInputElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const thumbRadius = 10;
    const fraction = (event.clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - 2 * thumbRadius);
    onScrubAngle(Math.round(Math.max(0, Math.min(1, fraction)) * 180));
  };

  return (
    <div className="duo-bottom-minibar" role="region" aria-label="iPhone Duo hinge controls"
      data-motion={props.motionReduced ? 'reduced' : 'full'} data-posture={props.posture}
      data-target={targetAngle ?? 'paused'} onKeyDown={e => {
        if (e.key === 'Escape' && expanded && targetAngle === null) {
          e.stopPropagation();
          setExpanded(false);
          disclosure.current?.focus();
        }
      }}>
      <button type="button" className="duo-fold-toggle"
        aria-label={opens ? 'Open Duo' : 'Close Duo'}
        title="Open or close. Click again to reverse. Shift-click for slow motion."
        onClick={e => props.onToggleFold(e.shiftKey)}>
        {opens ? <BookOpen size={15}/> : <FolderClosed size={15}/>}
        {opens ? 'Open' : 'Close'}
      </button>
      {props.motionReduced ? <button type="button" className="duo-enable-motion"
        aria-label="Enable folding animation" title="Enable folding animation" onClick={() => props.onMotionOverride(true)}>
        <Play size={14}/>
      </button> : <button type="button" className="duo-pause-btn"
        aria-label={props.canResume ? 'Resume hinge motion' : 'Pause hinge motion'}
        title={props.canResume ? 'Resume' : 'Pause (Escape)'} disabled={targetAngle === null && !props.canResume}
        onClick={props.canResume ? props.onResume : props.onPause}>
        {props.canResume ? <Play size={14}/> : <Pause size={14}/>}
      </button>}
      <button type="button" className="duo-settings" ref={disclosure}
        aria-label="Adjust hinge controls" aria-description={`${roundedAngle} degrees open`} aria-controls="duo-posture-options" aria-expanded={expanded}
        title={expanded ? 'Hide hinge controls' : 'Adjust angle, posture and finish'} onClick={() => setExpanded(!expanded)}>
        <span className="duo-current-angle">{roundedAngle}°</span><ChevronDown size={12}/>
      </button>
      <div className="duo-secondary-controls" id="duo-posture-options" hidden={!expanded}>
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
              onScrubActiveChange(true);
              scrubAtPointer(e);
            }}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubAtPointer(e); }}
            onPointerUp={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              scrubAtPointer(e);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onLostPointerCapture={() => onScrubActiveChange(false)}
            onChange={(e): void => onScrubAngle(Number(e.target.value))}
          />
        <label className="duo-posture-picker">
          <span aria-hidden="true">{POSTURES.find(([id]) => id === activePosture)?.[1] ?? 'Posture'}</span><ChevronDown size={12}/>
          <select aria-label="Preview posture" value={activePosture}
            onChange={e => props.onSelectPosture(e.target.value as DuoPostureId)}>
            <option value="" disabled>Free-stop</option>
            {POSTURES.map(([id, name]) => <option key={id} value={id}>{name} · {POSTURE_TARGET_DEG[id]}°</option>)}
          </select>
        </label>
        <label className="duo-more-picker" title="Fine adjustment, finish and motion">
          <SlidersHorizontal size={15}/>
          <select aria-label="More hinge options" value="" onChange={e => {
            const action = e.target.value;
            if (action.startsWith('step:')) props.onStepAngle(Number(action.slice(5)));
            else if (action === 'finish') props.onToggleFinish();
            else if (action === 'motion') props.onMotionOverride(!props.alwaysAnimate);
            else if (action === 'reset') props.onResetOrbit();
          }}>
            <option value="" disabled>Hinge options</option>
            <optgroup label="Adjust angle">
              {[-5, -1, 1, 5].map(step => <option key={step} value={`step:${step}`}>{step > 0 ? '+' : '−'}{Math.abs(step)}°</option>)}
            </optgroup>
            <option value="finish">Switch to {props.finish === 'night' ? 'Star White' : 'Night Sky'}</option>
            <option value="motion">{props.alwaysAnimate ? 'Use system motion setting' : 'Always animate folding'}</option>
            <option value="reset" disabled={!props.hasCustomOrbit}>Reset camera view</option>
          </select>
        </label>
      </div>
    </div>
  );
}
