import { useEffect, useRef, type PointerEvent } from 'react';
import { platformLabel } from '../../utils/platform.util';
import { useScreen } from './ScreenLayers';

interface Drag {
  id: number;
  x: number;
  y: number;
  start: number;
  scale: number;
  host: HTMLElement;
  moved: boolean;
}

// Only the leaf holding pointer capture owns the shared preview.
const releaseOwner = new WeakMap<HTMLElement, () => void>();

// Gesture distances are simulator tuning in logical screen points.
export function HomeGesture(props: { width: number; height: number; trailing: number; light: boolean; immersive: boolean; onHome?: () => void }) {
  const {setHomePreview, permission} = useScreen();
  const active = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef({at: 0, distance: 0});
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || permission) return;
    cleanup.current();
    const button = event.currentTarget;
    const host = button.closest<HTMLElement>('.stage-wrapper');
    if (!host) return;
    releaseOwner.get(host)?.();
    suppressClick.current = false;
    active.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, start: event.timeStamp,
      scale: Math.max(.1, button.getBoundingClientRect().height / button.offsetHeight), host, moved: false
    };
    button.setPointerCapture(event.pointerId);
    const release = () => {
      if (releaseOwner.get(host) !== release) return;
      active.current = null;
      releaseOwner.delete(host);
      delete host.dataset.homeDrag;
      host.style.removeProperty('--home-lift');
      host.style.removeProperty('--home-scale');
      setHomePreview(false);
    };
    releaseOwner.set(host, release);
    cleanup.current = release;
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = active.current;
    if (!drag || drag.id !== event.pointerId) return;
    const up = (drag.y - event.clientY) / drag.scale;
    const side = Math.abs(event.clientX - drag.x) / drag.scale;
    if (Math.max(Math.abs(up), side) > 6) drag.moved = true;
    if (!drag.host.dataset.homeDrag && (up < 6 || up <= side)) return;
    if (!drag.host.dataset.homeDrag) setHomePreview(true);
    const lift = Math.max(0, Math.min(1, up / 145));
    drag.host.dataset.homeDrag = 'tracking';
    drag.host.style.setProperty('--home-lift', (-42 * lift) + 'px');
    drag.host.style.setProperty('--home-scale', String(1 - .18 * lift));
  };

  const finish = (event: PointerEvent<HTMLButtonElement>, cancel: boolean) => {
    const drag = active.current;
    if (!drag || event.pointerId !== drag.id) return;
    active.current = null;
    const up = (drag.y - event.clientY) / drag.scale;
    const side = Math.abs(event.clientX - drag.x) / drag.scale;
    suppressClick.current = cancel || drag.moved || Math.max(side, Math.abs(up)) > 6;
    const commit = !cancel && up > side * 1.25 && (up >= 56 || (up >= 28 && event.timeStamp - drag.start < 220));
    if (commit) {
      drag.host.dataset.homeDrag = 'committed';
      props.onHome?.();
    } else if (drag.host.dataset.homeDrag) {
      drag.host.dataset.homeDrag = 'returning';
    }
    const reset = cleanup.current;
    const timer = window.setTimeout(reset, commit ? 380 : 160);
    cleanup.current = () => { window.clearTimeout(timer); reset(); };
  };

  return <div className="home-gesture-plane" style={{width: props.width - props.trailing, height: props.height}}>
    <button type="button" className="ios-home-indicator" aria-label="Home"
      title={platformLabel('Swipe up to go Home (⇧⌘H)')} disabled={Boolean(permission)}
      data-immersive={props.immersive || undefined} style={{color:props.light ? '#fff' : '#151519'}}
      onPointerDown={start} onPointerMove={move} onPointerUp={e=>finish(e,false)}
      onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}
      onClick={e=>{if (e.detail===0 || !suppressClick.current) props.onHome?.();}}
      onWheel={event=>{
        if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
        const state = wheel.current;
        if (event.timeStamp - state.at > 160) state.distance = 0;
        state.at = event.timeStamp;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? props.height : 1;
        if (state.distance === -Infinity) return;
        state.distance = Math.max(0,state.distance + event.deltaY * unit);
        if (state.distance >= 52) {state.distance = -Infinity; props.onHome?.();}
      }}>
      <span aria-hidden="true" style={{width:Math.round(Math.min(154,Math.max(122,Math.min(props.width-props.trailing,props.height)*.343)))}}/>
    </button>
  </div>;
}
