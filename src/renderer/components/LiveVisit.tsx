import { useEffect, useRef, useState } from 'react';
import type { JourneyStudioApi } from '../../types/journey.types';

export function LiveVisit({bridge,run,visit}:{bridge:JourneyStudioApi;run:string;visit:number}){
  const surface=useRef<HTMLImageElement>(null);
  const [state,setState]=useState<'waiting'|'live'|'unavailable'>('waiting');
  useEffect(()=>{
    let mounted=true,painted=false;
    const stop=bridge.watch(run,visit,jpeg=>{
      if(mounted && surface.current){
        surface.current.src='data:image/jpeg;base64,'+jpeg;
        if(!painted){painted=true;setState('live');}
      }
    },()=>{if(mounted)setState('unavailable');});
    return ()=>{mounted=false;stop();};
  },[bridge,run,visit]);
  return <section className="journey-live-screen" aria-label="Live visitor viewport">
    <img ref={surface} alt="Live visitor viewport" hidden={state!=='live'}/>
    {state!=='live' && <p role="status">{state==='waiting'?'Waiting for the visitor’s screen…':'Live view unavailable'}</p>}
  </section>;
}
