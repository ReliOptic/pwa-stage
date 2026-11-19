// The buffer contains compositor samples, including site motion between inputs.
// Transmit it only on export, never in the incremental visit status messages.
import type { VisitRecording } from '../types/journey.types';
export type { VisitRecording } from '../types/journey.types';

export function createVisitRecording(started:number, reserve:(bytes:number)=>boolean){
  const recording:VisitRecording={frames:[],duration:0,clipped:false};
  let latest:string|undefined;
  let latestAt=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  function flush(){
    clearTimeout(timer);timer=undefined;
    const jpeg=latest;latest=undefined;
    if(!jpeg || recording.clipped || recording.frames.at(-1)?.jpeg===jpeg)return;
    if(!reserve(jpeg.length)){recording.clipped=true;recording.duration=latestAt;return;}
    recording.frames.push({at:latestAt,jpeg});
  }
  return {recording,
    frame(jpeg:string){
      if(recording.clipped)return;
      latest=jpeg;latestAt=Math.max(0,Date.now()-started);
      const last=recording.frames.at(-1);
      if(!last || latestAt-last.at>=125)flush();
      else if(!timer)timer=setTimeout(flush,125-(latestAt-last.at));
    },
    end(){
      flush();
      if(!recording.clipped)recording.duration=Math.max(0,Date.now()-started);
    }
  };
}
