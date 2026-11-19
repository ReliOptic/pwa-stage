import type { JourneyFrame, JourneyVisit } from '../types/journey.types';

export const journeyOutcome = {exploring:'In progress',finished:'Model cited visible text',verified:'Launch verified',unconfirmed:'Goal unconfirmed',blocked:'Blocked',limit:'Step limit',stopped:'Stopped',error:'Error'};

export function elapsedTime(ms:number):string {
  const seconds=Math.floor(ms/1000);
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}

// A matching viewport excerpt is an observation about text and controls.
// Video, asynchronously loaded media and other pixels may still have changed.
export function observedRevisits(visit:JourneyVisit):string[] {
  const seen=new Map<string,JourneyFrame>();
  const notes:string[]=[];
  let previous:JourneyFrame|undefined;
  for(const frame of visit.frames){
    if(!frame.observation)continue;
    const key=JSON.stringify([frame.path,frame.title,frame.observation.text,frame.observation.controls]);
    const earlier=seen.get(key);
    if(earlier && frame.elapsedMs!==undefined){
      const when=elapsedTime(frame.elapsedMs);
      notes.push(earlier===previous
        ? when+' · Same visible text and controls after “'+frame.action+'”.'
        : when+' · Returned to the text and controls seen at '+elapsedTime(earlier.elapsedMs??0)+'.');
    }
    seen.set(key,frame);
    previous=frame;
  }
  return notes;
}
