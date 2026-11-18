import { useRef, type PointerEvent, type MouseEvent } from 'react';

/** Horizontal drags belong to the current Home page. Icon taps keep their native click target. */
export function useHomePaging(page: number, pages: number, select: (page: number) => void, enabled: boolean) {
  const active = useRef<{id:number; x:number; y:number; scale:number; locked:boolean} | null>(null);
  const suppressClick = useRef(false);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (!enabled || pages < 2 || !e.isPrimary || e.button !== 0 ||
        (e.target as Element).closest('.home-dock,.home-search-pill,.home-page-dots,input')) return;
    const el = e.currentTarget;
    active.current = {id:e.pointerId,x:e.clientX,y:e.clientY,scale:Math.max(.1,el.getBoundingClientRect().width/el.offsetWidth),locked:false};
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = active.current;
    if (!p || p.id !== e.pointerId) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      active.current = null;
      e.currentTarget.style.removeProperty('--page-drag');
      return;
    }
    const dx=(e.clientX-p.x)/p.scale, dy=(e.clientY-p.y)/p.scale;
    if (!p.locked) {
      if (Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)) { active.current=null; return; }
      if (Math.abs(dx)<8 || Math.abs(dx)<Math.abs(dy)*1.25) return;
      p.locked=true;
      suppressClick.current=true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.currentTarget.style.setProperty('--page-drag', Math.max(-48, Math.min(48, dx*.35))+'px');
  };
  const finish = (e: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    const p = active.current;
    if (!p || p.id !== e.pointerId) return;
    active.current = null;
    e.currentTarget.style.removeProperty('--page-drag');
    const dx=(e.clientX-p.x)/p.scale;
    if (!cancel && p.locked && Math.abs(dx)>=42) select(Math.min(pages-1,Math.max(0,page+(dx<0?1:-1))));
  };
  return {
    onPointerDown:start,onPointerMove:move,onPointerUp:(e:PointerEvent<HTMLDivElement>)=>finish(e,false),
    onPointerCancel:(e:PointerEvent<HTMLDivElement>)=>finish(e,true),
    onLostPointerCapture:(e:PointerEvent<HTMLDivElement>)=>{if(e.target===e.currentTarget)finish(e,true);},
    onClickCapture:(e:MouseEvent<HTMLDivElement>)=>{
      if (suppressClick.current && e.detail!==0) {e.preventDefault();e.stopPropagation();}
    }
  };
}
