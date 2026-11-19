import { createHash } from 'node:crypto';
import { elapsedTime, journeyOutcome, observedRevisits } from '../utils/journey-evidence.util';
import { readableJourneyLocation } from '../utils/journey-location.util';
import type { JourneyReport, JourneyVisit } from '../types/journey.types';
import type { VisitRecording } from './journey-recording';

function recordingPlayer(recording:VisitRecording|undefined) {
  if(!recording)return '';
  if(!recording.frames.length)return '<p>No live frames retained.</p>';
  const encoded=JSON.stringify(recording.frames);
  return `<figure class="film"><figcaption>Visit recording · ${elapsedTime(recording.duration)}</figcaption><img alt="Recorded visitor viewport"><button type="button">Play</button> <input aria-label="Recording position" type="range" min="0" max="${recording.duration}" value="0" step="1"> <output></output><small>Compositor frames at their recorded times, sampled up to 8 fps.${recording.clipped?' Recording stopped at the report size limit.':''}</small><template>${encoded}</template></figure>`;
}

// Serialized into the offline report. Keep this function self-contained.
function playRecordings(){
  for(const player of document.querySelectorAll<HTMLElement>('.film')){
    const frames=JSON.parse(player.querySelector('template')!.content.textContent!) as {at:number;jpeg:string}[];
    const image=player.querySelector('img')!,button=player.querySelector('button')!,slider=player.querySelector('input')!,out=player.querySelector('output')!;
    const end=Number(slider.max);
    let raf=0,anchor=0,last=-2;
    function render(ms:number){
      let lo=0,hi=frames.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(frames[mid].at<=ms)lo=mid+1;else hi=mid;}
      const index=lo-1;
      if(index!==last){image.style.visibility=index<0?'hidden':'visible';if(index>=0)image.src='data:image/jpeg;base64,'+frames[index].jpeg;last=index;}
      slider.value=String(ms);
      out.textContent=(ms/1000).toFixed(1)+' s';
    }
    function pause(){cancelAnimationFrame(raf);raf=0;button.textContent='Play';}
    function tick(){const ms=Math.min(end,performance.now()-anchor);render(ms);if(ms<end)raf=requestAnimationFrame(tick);else pause();}
    slider.oninput=()=>{pause();render(Number(slider.value));};
    button.onclick=()=>{if(raf){pause();return;}const from=Number(slider.value);anchor=performance.now()-(from>=end?0:from);button.textContent='Pause';tick();};
    for(const cue of player.closest('section')!.querySelectorAll<HTMLButtonElement>('button[data-input-time]')){
      cue.onclick=()=>{
        pause();
        anchor=performance.now()-Math.max(frames[0].at,Number(cue.dataset.inputTime)-600);
        button.textContent='Pause';tick();player.scrollIntoView({block:'center'});
      };
    }
    render(frames[0].at);
  }
}

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}

export function reportHtml(report:JourneyReport, images:Map<number,string>, recordings:Map<number,VisitRecording>) {
  const e=escapeHtml;
  function trace(visit:JourneyVisit,recording:VisitRecording|undefined){
    if(!visit.inputs)return '';
    const inputs=visit.inputs.map(input=>{
      const before=visit.frames.find(f=>f.id===input.from);
      const after=visit.frames.find(f=>f.id===input.to);
      const cue=recording?.frames.length && input.elapsedMs<=recording.duration
        ? '<p><button type="button" data-input-time="'+input.elapsedMs+'">Watch input</button></p>' : '';
      return '<li><strong>'+e(elapsedTime(input.elapsedMs))+' · '+e(input.kind)+' · '+e(input.label)+'</strong>'+cue+'<p>Controls observed before input · '+e(before?.observation?.controls.join(' · ') || 'None')+'</p><p><a href="#capture-'+input.from+'">Previous observation</a> · '+(after?'<a href="#capture-'+after.id+'">Next observation</a> · '+e(after.title+' · '+after.path):'No observation captured')+'</p></li>';
    }).join('');
    return '<h3>Recorded inputs ('+visit.inputs.length+')</h3><ol>'+inputs+'</ol>'+observedRevisits(visit).map(note=>'<p>'+e(note)+'</p>').join('');
  }
  const visits=report.visits.map((visit,i)=>`<section><h2>${i+1}. ${e(visit.persona)}</h2><p>${e(readableJourneyLocation(visit.source || report.origin))}</p>${visit.installation ? `<p>Home Screen launch · ${e(readableJourneyLocation(visit.installation.path))} · ${visit.installation.manifest?"Manifest read":"Website shortcut"}</p>` : ""}<p>${e(journeyOutcome[visit.outcome])} · ${e(visit.note)}</p>${recordingPlayer(recordings.get(i))}${trace(visit,recordings.get(i))}<h3>Captured screens</h3><ol>${visit.frames.map(f=>
    `<li id="capture-${f.id}"><h3>${f.elapsedMs===undefined?'':elapsedTime(f.elapsedMs)+' · '}${e(f.action)}</h3><p>${e(f.title)} · ${e(readableJourneyLocation(f.path))}</p><img alt="Captured page" src="${images.get(f.id) ?? ''}"><p>${e(f.reason)}</p>${f.observation?'<details><summary>Page observations</summary><p>'+e(f.observation.text)+'</p><p>'+f.observation.controls.map(e).join(' · ')+'</p></details>':''}</li>`).join('')}</ol></section>`).join('');
  const script='('+playRecordings.toString()+')()';
  const scriptHash=createHash('sha256').update(script).digest('base64');
  return `<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'"><title>Audience journeys</title><style>body{max-width:1000px;margin:40px auto;padding:0 24px;font:16px/1.5 system-ui;background:#faf9f6;color:#212c29}ol{display:flex;flex-wrap:wrap;gap:22px;padding:0;list-style:none}li{width:230px;overflow-wrap:anywhere}img{max-width:100%;max-height:360px;border-radius:12px}.film{background:#ecefeb;padding:16px;margin:16px 0;border-radius:16px}.film img{display:block;height:52vh;width:100%;max-height:680px;object-fit:contain}.film input{width:55%;vertical-align:middle}.film button{padding:7px 12px}.film output{font-variant-numeric:tabular-nums}.film small{display:block}section{border-top:1px solid #bbb}</style><h1>Audience journeys</h1><p>${e(report.origin)} · ${e(report.device)} · ${e(report.model)}</p><p>${e(report.goal)}</p><p>Simulated visits · ${e(report.status)} · ${e(report.message)}</p>${visits}<script>${script}</script>`;
}

