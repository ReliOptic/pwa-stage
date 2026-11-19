import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Download, Pause, Play, Route, Square } from 'lucide-react';
import { DEFAULT_JOURNEY_MODEL, MAX_ACTIONS, MAX_VISITS, type JourneyReport, type JourneyStudioApi } from '../../types/journey.types';
import '../styles/journeys.css';

declare global { interface Window { readonly journeyStudio?: JourneyStudioApi } }

const outcome = {exploring:'In progress',finished:'Agent reached goal',blocked:'Blocked',limit:'Step limit',stopped:'Stopped',error:'Error'};

function VisitReview({report,bridge}: {report:JourneyReport; bridge:JourneyStudioApi}) {
  const [picked,setPicked]=useState<{visit:number;step:number}|null>(null);
  const [playing,setPlaying]=useState(false);
  const [picture,setPicture]=useState<{id:number;url:string}|null>(null);
  const visitIndex=picked?.visit ?? Math.max(0,report.visits.length-1);
  const visit=report.visits[visitIndex];
  const step=picked?.step ?? Math.max(0,(visit?.frames.length ?? 1)-1);
  const frame=visit?.frames[step];
  useEffect(()=>{
    let current=true;
    if(frame) void bridge.image(report.id,frame.id).then(url=>{if(current && url)setPicture({id:frame.id,url});}).catch(()=>{});
    return ()=>{current=false;};
  },[bridge,report.id,frame?.id]);
  useEffect(()=>{
    if(!playing || !visit) return;
    const timer=window.setTimeout(()=>{
      if(step+1<visit.frames.length) setPicked({visit:visitIndex,step:step+1});
      else setPlaying(false);
    },1600);
    return ()=>window.clearTimeout(timer);
  },[playing,step,visitIndex,visit?.frames.length]);
  const select=(v:number,s:number)=>{setPlaying(false);setPicked({visit:v,step:s});};
  return <div className="journey-review">
    <aside className="journey-log">
      <h2>Visits <small>{report.visits.length} / {report.iterations}</small></h2>
      {report.visits.map((v,i)=><button className="journey-visit" key={i} aria-pressed={i===visitIndex} onClick={()=>select(i,0)}>
        <span>Visit {i+1} · {outcome[v.outcome]}</span><strong>{v.persona}</strong>
      </button>)}
      {!visit && <p role="status">{report.message}</p>}
      {visit && <><h3>Journey steps</h3><ol>{visit.frames.map((f,i)=><li key={f.id}><button aria-current={i===step?'step':undefined} onClick={()=>select(visitIndex,i)}>
        <span>{i+1}</span><div><strong>{f.action}</strong><small>{f.path}</small></div></button></li>)}</ol>
        {visit.note && <p className="journey-note"><b>{outcome[visit.outcome]}</b>{visit.note}</p>}</>}
      {picked && report.status==='running' && <button className="journey-link" onClick={()=>{setPlaying(false);setPicked(null);}}>Follow live visit</button>}
    </aside>
    <section className="journey-screen" aria-label="Captured screen">
      {frame ? <>
        <div className="journey-location"><span>{new URL(report.origin).host}</span><strong>{frame.title || frame.path}</strong></div>
        <div className="journey-photo">{picture?.id===frame.id && <img src={picture.url} alt={'Screen after '+frame.action}/>}</div>
        <div className="journey-playback"><button aria-label="Previous step" disabled={step===0} onClick={()=>select(visitIndex,step-1)}><ChevronLeft size={17}/></button>
          <button aria-label={playing?'Pause replay':'Replay visit'} disabled={visit.frames.length<2} onClick={()=>{if(playing)setPlaying(false);else {setPicked({visit:visitIndex,step:0});setPlaying(true);}}}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>
          <span>{step+1} / {visit.frames.length}</span><button aria-label="Next step" disabled={step+1>=visit.frames.length} onClick={()=>select(visitIndex,step+1)}><ChevronRight size={17}/></button></div>
        {frame.reason && <p>{frame.reason}</p>}
      </> : <p>{report.status==='running'?'Waiting for the first captured screen.':'No screen was captured.'}</p>}
    </section>
  </div>;
}

export function JourneyStudio({bridge}: {bridge:JourneyStudioApi}) {
  const [address,setAddress]=useState(''), [goal,setGoal]=useState(''), [audiences,setAudiences]=useState('');
  const [model,setModel]=useState(DEFAULT_JOURNEY_MODEL), [apiKey,setApiKey]=useState(''), [iterations,setIterations]=useState(3);
  const [device,setDevice]=useState(''), [envKey,setEnvKey]=useState(false), [report,setReport]=useState<JourneyReport|null>(null);
  const [tab,setTab]=useState<'setup'|'review'>('setup'),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const [saved,setSaved]=useState(false);
  const received=useRef(false);
  const addressEdited=useRef(false);
  useEffect(()=>{
    let current=true;
    const unsubscribe=bridge.subscribe(next=>{received.current=true;setReport(next);});
    void bridge.initial().then(initial=>{
      if(!current)return;
      if(!addressEdited.current) setAddress(initial.address);
      setDevice(initial.device);setEnvKey(initial.environmentKey);
      if(!received.current && initial.report){setReport(initial.report);setTab('review');}
    }).catch(()=>{if(current)setError('Could not read the simulator settings.');});
    return ()=>{current=false;unsubscribe();};
  },[bridge]);
  const running=report?.status==='running';
  const start=async(e:FormEvent)=>{
    e.preventDefault();setPending(true);setError('');setSaved(false);
    try {
      await bridge.start({address,goal,audiences:audiences.split('\n').map(a=>a.trim()).filter(Boolean),iterations,apiKey,model});
      setApiKey('');setTab('review');
    } catch(err){setError((err instanceof Error?err.message:'Could not start.').replace(/^.*?Error: /,''));}
    finally{setPending(false);}
  };
  return <main className="journeys">
    <header className="journey-header"><div><Route size={21}/><span>PWA Stage</span></div><nav aria-label="Journey views">
      <button aria-pressed={tab==='setup'} onClick={()=>setTab('setup')}>Set up</button>
      <button disabled={!report} aria-pressed={tab==='review'} onClick={()=>setTab('review')}>Visit review</button>
    </nav></header>
    <div className="journey-heading"><div><h1>Audience journeys</h1><p>{tab==='setup'?'Watch simulated customers try the same task on your PWA.':report?.goal}</p></div>
      {tab==='review' && report && (running?<button className="journey-secondary" onClick={()=>void bridge.stop().catch(()=>setError('Could not stop the run.'))}><Square size={13}/>Stop run</button>:
        <button className="journey-secondary" onClick={()=>void bridge.save().then(setSaved).catch(()=>setError('Could not save the report.'))}><Download size={15}/>{saved?'Save again':'Save report'}</button>)}</div>
    {error && <p role="alert" className="journey-error">{error}</p>}
    {tab==='setup'?<form className="journey-form" onSubmit={start}><fieldset disabled={running || pending}>
      <div className="journey-fields"><section><h2>Visit brief</h2>
        <label>Start address<input required maxLength={2048} value={address} onChange={e=>{addressEdited.current=true;setAddress(e.target.value);}} placeholder="https://your-pwa.com"/></label>
        <label>Customer goal<textarea required rows={3} maxLength={500} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="What should a visitor try to accomplish?"/></label>
        <label>Target audiences <small>Optional</small><textarea rows={3} value={audiences} onChange={e=>setAudiences(e.target.value)} placeholder="One audience per line"/></label>
        <p>Leave empty to suggest audiences from the start page. Each visit draws from a shuffled list.</p>
      </section><section><h2>Run settings</h2>
        <label>Number of visits<input type="number" required min={1} max={MAX_VISITS} value={iterations || ''} onChange={e=>setIterations(Number(e.target.value))}/></label>
        <label>OpenRouter model<input required maxLength={160} value={model} onChange={e=>setModel(e.target.value)}/></label>
        <label>API key<input type="password" autoComplete="off" spellCheck={false} maxLength={512} required={!envKey} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={envKey?'Environment key available':'OpenRouter API key'}/></label>
        <p>Your key stays in memory. OpenRouter receives the goal, audience, visible page text and control labels. Captures stay local.</p>
      </section></div>
      <footer><span>{device} · Up to {MAX_ACTIONS} actions per visit</span><button className="journey-primary" type="submit">{running?'Run in progress':'Start visits'}<ArrowRight size={16}/></button></footer>
    </fieldset></form>:report && <>
      <div className="journey-status" role="status"><span data-state={report.status}/>{report.message}</div>
      <VisitReview key={report.id} report={report} bridge={bridge}/>
    </>}
  </main>;
}
