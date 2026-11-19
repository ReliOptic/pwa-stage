import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Download, Pause, Play, Route, Square, Globe2, FolderOpen, FileText, UsersRound, SlidersHorizontal, Cable, Plus, Minus, Smartphone, Footprints, PanelsTopLeft } from 'lucide-react';
import { DEFAULT_JOURNEY_MODEL, MAX_ACTIONS, MAX_VISITS, type JourneyReport, type JourneyStudioApi } from '../../types/journey.types';
import { DEVICE_PRESETS } from '../../config/device-presets.config';
import { DeviceModelId } from '../../types/device.types';
import type { StageCheckRequest, VisitRecording } from '../../types/journey.types';
import { readableJourneyLocation } from '../../utils/journey-location.util';
import { LiveVisit } from './LiveVisit';
import { RecordedVisit, type PlaybackStart } from './RecordedVisit';
import { elapsedTime, journeyOutcome as outcome, observedRevisits } from '../../utils/journey-evidence.util';
import '../styles/journeys.css';

declare global { interface Window { readonly journeyStudio?: JourneyStudioApi } }


function VisitReview({report,bridge,preview,aperture,open}: {aperture:HTMLElement|null;open:boolean;report:JourneyReport; bridge:JourneyStudioApi; preview:HTMLElement|null}) {
  const [picked,setPicked]=useState<{visit:number;step:number}|null>(null);
  const [playing,setPlaying]=useState(false);
  const [film,setFilm]=useState<{visit:number;recording:VisitRecording}|null>(null);
  const [playback,setPlayback]=useState<PlaybackStart>({at:0,play:false});
  const [inspectStep,setInspectStep]=useState(false);
  const [history,setHistory]=useState(false);
  const [compactView,setCompactView]=useState<'screen'|'steps'>('screen');
  const [picture,setPicture]=useState<{id:number;url:string}|null>(null);
  const visitIndex=picked?.visit ?? Math.max(0,report.visits.length-1);
  const visit=report.visits[visitIndex];
  const step=picked?.step ?? Math.max(0,(visit?.frames.length ?? 1)-1);
  const frame=visit?.frames[step];
  const following=report.kind==='audience' && report.status==='running' && !picked;
  const live=following && open && report.liveVisit===visitIndex;
  const target=live && aperture && aperture.dataset.device===report.liveDevice &&
    aperture?.dataset.orientation===report.orientation?aperture:preview;
  const reviewing=!following || history;
  const observations=visit?observedRevisits(visit):[];
  const lastInput=visit?.inputs?.at(-1);
  const recording=film?.visit===visitIndex ? film.recording : null;
  useEffect(()=>{
    let current=true;
    if(open && report.kind==='audience' && report.status!=='running')
      void bridge.recording(report.id,visitIndex).then(data=>{
        if(current)setFilm(data?.frames.length?{visit:visitIndex,recording:data}:null);
      }).catch(()=>{if(current)setFilm(null);});
    return ()=>{current=false;};
  },[bridge,open,report.id,report.kind,report.status,visitIndex]);
  function watchRecording(at:number) {
    setPlaying(false);setInspectStep(false);setCompactView('screen');setPlayback({at,play:true});
  }
  useEffect(()=>{
    let current=true;
    if(frame && !following) void bridge.image(report.id,frame.id).then(url=>{if(current && url)setPicture({id:frame.id,url});}).catch(()=>{});
    return ()=>{current=false;};
  },[bridge,report.id,frame?.id,following]);
  useEffect(()=>{
    if(!playing || !visit) return;
    const timer=window.setTimeout(()=>{
      if(step+1<visit.frames.length) setPicked({visit:visitIndex,step:step+1});
      else setPlaying(false);
    },Math.max(0,(visit.frames[step+1]?.elapsedMs??0)-(visit.frames[step]?.elapsedMs??0)));
    return ()=>window.clearTimeout(timer);
  },[playing,step,visitIndex,visit?.frames.length]);
  const select=(v:number,s:number)=>{setPlaying(false);setInspectStep(true);setPicked({visit:v,step:s});};
  const screen = following ? (live && (preview || compactView==='screen')
    ? <LiveVisit key={report.id+visitIndex} bridge={bridge} run={report.id} visit={visitIndex}/>
    : <section className="journey-live-screen"><p role="status">{report.message}</p></section>)
    : recording && !inspectStep ? (open && <RecordedVisit film={recording} start={playback}/>)
    : <section className="journey-screen" aria-label="Captured screen">
      {frame ? <>
        <div className="journey-location"><small>{playing?'Replaying captured steps':'Captured step'}</small><span>{readableJourneyLocation(visit?.source || new URL(report.origin).host)}</span><strong>{frame.title || readableJourneyLocation(frame.path)}</strong></div>
        <div className="journey-photo">{picture?.id===frame.id && <img src={picture.url} alt={'Screen after '+frame.action}/>}</div>
        <div className="journey-playback"><button aria-label="Previous step" disabled={step===0} onClick={()=>select(visitIndex,step-1)}><ChevronLeft size={17}/></button>
          <button aria-label={recording?'Replay visit':playing?'Pause captured steps':'Play captured steps'} disabled={!recording && visit.frames.length<2}
            onClick={()=>{if(recording)watchRecording(frame.elapsedMs??0);else if(playing)setPlaying(false);else {setPicked({visit:visitIndex,step:0});setPlaying(true);}}}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>
          <span>{step+1} / {visit.frames.length}</span><button aria-label="Next step" disabled={step+1>=visit.frames.length} onClick={()=>select(visitIndex,step+1)}><ChevronRight size={17}/></button></div>
        {frame.reason && <p>{frame.reason}</p>}
        {frame.observation && <details className="journey-observation"><summary>What the model saw</summary><p>{frame.observation.text}</p><p>{frame.observation.controls.join(' · ')}</p></details>}
      </> : <p>{report.status==='running'?'Waiting for the first captured screen.':'No screen was captured.'}</p>}
    </section>;
  return <div className="journey-review" data-compact={!preview} data-view={compactView}>
    {!preview && <nav className="journey-compact-tabs" aria-label="Review content">
      <button aria-pressed={compactView==='screen'} onClick={()=>setCompactView('screen')}>{following?'Live screen':'Captured screen'}</button>
      <button aria-pressed={compactView==='steps'} onClick={()=>setCompactView('steps')}>Visit steps</button>
    </nav>}
    <aside className="journey-log">
      {following && <>
        <p className="journey-watching"><b>Visit {visitIndex+1} of {report.iterations}</b>{visit?.persona}</p>
        {lastInput && <p className="journey-last-input">{elapsedTime(lastInput.elapsedMs)} · {lastInput.kind} · {lastInput.label}</p>}
        <button className="journey-link" aria-expanded={history} onClick={()=>setHistory(!history)}>{history?'Hide visit history':'Show visit history'}</button>
      </>}
      {(reviewing || (!preview && compactView==='steps')) && <>
      <h2>Visits <small>{report.visits.length} / {report.iterations}</small></h2>
      {report.visits.map((v,i)=><button className="journey-visit" key={i} aria-pressed={i===visitIndex} onClick={()=>{select(i,0);setInspectStep(false);setPlayback({at:0,play:false});}}>
        <span>Visit {i+1} · {outcome[v.outcome]}</span><strong>{v.persona}</strong>{v.source && <small>{readableJourneyLocation(v.source)}</small>}
      </button>)}
      {!visit && <p role="status">{report.message}</p>}
      {visit && <><h3>Visit steps</h3><ol>{visit.frames.map((f,i)=><li key={f.id}><button aria-current={i===step?'step':undefined} onClick={()=>{select(visitIndex,i);if(!preview)setCompactView('screen');}}>
        <span className="journey-step-number">{i+1}</span><div><strong>{f.action}</strong><small>{f.observation ? (f.action==='Arrived'?'Page opened':'Agent decision') : 'Stage installation'} · {readableJourneyLocation(f.path)}</small></div></button></li>)}</ol>
        {visit.note && <p className="journey-note"><b>{outcome[visit.outcome]}</b>{visit.note}</p>}</>}
      {visit?.inputs && <section className="journey-trace"><h3>Recorded inputs · {visit.inputs.length}</h3>
        {visit.inputs.map(input=><div className="journey-input" key={input.from}>
          <span>{elapsedTime(input.elapsedMs)} · {input.kind} · {input.label}</span>
          <div>{recording && input.elapsedMs<=recording.duration && <button onClick={()=>watchRecording(Math.max(0,input.elapsedMs-600))}>Watch</button>}{[input.from,input.to].map((id,side)=>{
            const index=visit.frames.findIndex(f=>f.id===id);
            return <button key={side} disabled={index<0} onClick={()=>{select(visitIndex,index);setCompactView('screen');}}>{side?'After':'Before'}</button>;
          })}</div></div>)}
        {observations.map(note=><p key={note}>{note}</p>)}</section>}
      </>}
      {picked && report.status==='running' && <button className="journey-link" onClick={()=>{setPlaying(false);setPicked(null);}}>Follow live visit</button>}
    </aside>
    {target ? createPortal(screen,target) : screen}
  </div>;
}

function SourcePicker({pick}:{pick:(kind:'file'|'folder')=>Promise<void>}){
  const menu=useRef<HTMLDetailsElement>(null);
  async function select(kind:'file'|'folder'){
    if(menu.current)menu.current.open=false;
    await pick(kind);
    menu.current?.querySelector('summary')?.focus();
  }
  return <details className="journey-sources" ref={menu}
    onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}}
    onKeyDown={e=>{
      if(e.key==='Escape' && e.currentTarget.open){
        e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();
      }
    }}>
    <summary aria-label="Local sources" title="Open a local file or site folder"><FolderOpen size={17}/></summary>
    <div><button type="button" onClick={()=>void select('file')}><FileText size={15}/>Open file…</button>
      <button type="button" onClick={()=>void select('folder')}><FolderOpen size={15}/>Open site folder…</button></div>
  </details>;
}

function OptionRow({icon,title,value,name,children}:{
  icon:ReactNode;title:string;value:string;name:string;children:ReactNode;
}){
  return <details className={'journey-options journey-'+name}>
    <summary>{icon}<span>{title}</span><small>{value}</small><ChevronRight className="journey-chevron" size={14}/></summary>
    <div className="journey-option-body">{children}</div>
  </details>;
}

type Coverage = {sources:string|null;deviceId:string;browser:string};

function StageCheckForm({address,device,coverage,onChange,disabled,onRun,pick}:{
  address:string;device:string;coverage:Coverage;onChange:(patch:Partial<Coverage>)=>void;disabled:boolean;onRun:(r:StageCheckRequest)=>Promise<void>;pick:(k:'file'|'folder')=>Promise<string|null>
}){
  const {sources,deviceId,browser}=coverage;
  const selected=deviceId==='pair'?[DeviceModelId.IPHONE_SE_3,DeviceModelId.IPHONE_17_PRO_MAX]:[deviceId as DeviceModelId];
  const browsers:StageCheckRequest['browsers']=browser==='both'?['ios-safari','ios-chrome']:[browser as 'ios-safari'|'ios-chrome'];
  const addresses=[...new Set((sources??address).split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  const count=selected.length*browsers.length*addresses.length;
  return <form className="journey-form" onSubmit={e=>{e.preventDefault();void onRun({addresses,devices:selected,browsers});}}>
    <fieldset disabled={disabled}><div className="journey-fields">
      <section className="journey-brief">
        <label className="journey-prompt" htmlFor="agent-addresses">Which sites should we check?</label>
        <div className="journey-addresses"><textarea id="agent-addresses" aria-label="Start addresses" required rows={3} value={sources??address} onChange={e=>onChange({sources:e.target.value})} placeholder="One address per line"/></div>
        <div className="journey-source-line"><span>One address per line</span><SourcePicker pick={async k=>{const url=await pick(k);if(url)onChange({sources:[sources??address,url].filter(Boolean).join('\n')});}}/></div>
      </section>
      <section className="journey-section"><h2>Test coverage</h2><div className="journey-group">
        <label className="journey-select-row"><Smartphone/><span>Devices</span><select value={deviceId} onChange={e=>onChange({deviceId:e.target.value})}><option value="pair">Compact and large iPhones</option>
          {DEVICE_PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}{p.name===device?' (current)':''}</option>)}</select><ChevronDown/></label>
        <label className="journey-select-row"><Globe2/><span>Browsers</span><select value={browser} onChange={e=>onChange({browser:e.target.value})}><option value="both">Safari and Chrome</option><option value="ios-safari">Safari</option><option value="ios-chrome">Chrome</option></select><ChevronDown/></label>
      </div><p className="journey-footnote">Each check adds the site to the Home Screen and opens its installed icon.</p></section>
    </div><footer><span>{count} of {MAX_VISITS} checks</span><button className="journey-primary" disabled={!count || count>MAX_VISITS}>Run checks <ArrowRight size={16}/></button></footer></fieldset></form>;

}

export function JourneyStudio({bridge,open,currentUrl,preview,aperture,onClose,onRunning}: {
  aperture:HTMLElement|null;
  bridge:JourneyStudioApi; open:boolean; currentUrl:string; preview:HTMLElement|null;
  onClose:()=>void; onRunning:(running:boolean)=>void;
}) {
  const [address,setAddress]=useState(''), [goal,setGoal]=useState(''), [audiences,setAudiences]=useState('');
  const [coverage,setCoverage]=useState<Coverage>({sources:null,deviceId:'pair',browser:'both'});
  const [kind,setKind]=useState<'audience'|'install'>('audience');
  const [useLocal,setUseLocal]=useState(false),[endpoint,setEndpoint]=useState('http://127.0.0.1:8080/v1'),[localModel,setLocalModel]=useState('');
  const [recordScreen,setRecordScreen]=useState(true);
  const [planDevice,setPlanDevice]=useState(false),[shareScreen,setShareScreen]=useState(false);
  const [installFirst,setInstallFirst]=useState(false),[material,setMaterial]=useState('');
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
      setDevice(initial.device);setEnvKey(initial.environmentKey);
      if(!received.current && initial.report){setReport(initial.report);setTab('review');}
    }).catch(()=>{if(current)setError('Could not read the simulator settings.');});
    return ()=>{current=false;unsubscribe();};
  },[bridge]);
  const running=report?.status==='running';
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{onRunning(running);},[running,onRunning]);
  useEffect(()=>{
    if (open) panel.current?.focus({preventScroll:true});
  },[open]);
  useEffect(()=>{
    if (!open || addressEdited.current) return;
    let active=true;
    void bridge.initial().then(initial=>{
      if(active && !addressEdited.current)setAddress(initial.address);
    }).catch(()=>{});
    return ()=>{active=false;};
  },[bridge,open,currentUrl]);
  const submit=async(work:()=>Promise<void>)=>{
    setPending(true);setError('');setSaved(false);
    try {
      await work();
      setApiKey('');setTab('review');
    } catch(err){setError((err instanceof Error?err.message:'Could not start.').replace(/^.*?Error: /,''));}
    finally{setPending(false);}
  };
  const pick=async(kind:'file'|'folder')=>{
    try{setError('');return await bridge.pickSource(kind);}
    catch(e){setError(e instanceof Error?e.message:'Could not open source.');return null;}
  };
  const start=(e:FormEvent)=>{
    e.preventDefault();return submit(()=>bridge.start({address,goal,audiences:audiences.split('\n').map(a=>a.trim()).filter(Boolean),
      iterations,apiKey:useLocal?'':apiKey,model:useLocal?localModel:model,localEndpoint:useLocal?endpoint:undefined,material,installFirst,planDevice,shareScreen,recordScreen}));
  };
  return <section className="journeys" ref={panel} tabIndex={-1}
    onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <header className="journey-header"><div className="journey-brand"><Route size={22}/><h1>Agent</h1></div>
      {report && <nav aria-label="Journey views">{tab==='setup'
        ? <button onClick={()=>setTab('review')}>Visit review<ChevronRight size={14}/></button>
        : <button onClick={()=>setTab('setup')}><ChevronLeft size={14}/>Set up</button>}
      </nav>}
      <button className="agent-close" aria-label="Close Agent" title="Return to simulator" onClick={onClose}><X size={16}/></button>
    </header>
    {error && <p role="alert" className="journey-error">{error}</p>}
    {tab==='setup' && <nav className="journey-modes" aria-label="Run type">
      <button aria-pressed={kind==='audience'} onClick={()=>setKind('audience')}><Footprints size={15}/>Visitor task</button>
      <button aria-pressed={kind==='install'} onClick={()=>setKind('install')}><PanelsTopLeft size={15}/>Check installation</button></nav>}
    {tab==='setup' && kind==='install'?<StageCheckForm address={address} device={device} coverage={coverage} onChange={patch=>setCoverage(current=>({...current,...patch}))} pick={pick} disabled={!!running || pending} onRun={r=>submit(()=>bridge.check(r))}/>:tab==='setup'?<form className="journey-form" onSubmit={start}
      onInvalidCapture={e=>{
        const field=e.target as HTMLInputElement;
        const row=field.closest('details');
        if(row && !row.open && field===field.form?.querySelector('input:invalid,textarea:invalid,select:invalid')){
          row.open=true;
          requestAnimationFrame(()=>field.focus());
        }
      }}><fieldset disabled={running || pending}>
      <div className="journey-fields">
        <section className="journey-brief">
          <label className="journey-prompt" htmlFor="agent-goal">What should a visitor do?</label>
          <textarea id="agent-goal" aria-label="Customer goal" className="journey-goal" required rows={3} maxLength={500} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Describe the task you want to observe…"/>
          <label className="journey-field-caption" htmlFor="agent-address">Start address</label>
          <div className="journey-address"><Globe2 size={16}/><input id="agent-address" required maxLength={2048} value={address} onChange={e=>{addressEdited.current=true;setAddress(e.target.value);}} placeholder="https://your-pwa.com"/>
            <SourcePicker pick={async k=>{const url=await pick(k);if(url){addressEdited.current=true;setAddress(url);}}}/>
          </div>
        </section>
        <section className="journey-section"><h2>Visit settings</h2>
          <div className="journey-group">
            <div className="journey-count"><Route size={17}/><label htmlFor="agent-visits">Number of visits</label>
              <div className="journey-stepper">
                <button type="button" aria-label="Remove one visit" disabled={iterations<=1} onClick={()=>setIterations(Math.max(1,iterations-1))}><Minus size={14}/></button>
                <input id="agent-visits" type="number" required min={1} max={MAX_VISITS} value={iterations || ''} onChange={e=>setIterations(Number(e.target.value))}/>
                <button type="button" aria-label="Add one visit" disabled={iterations>=MAX_VISITS} onClick={()=>setIterations(Math.min(MAX_VISITS,iterations+1))}><Plus size={14}/></button>
              </div>
            </div>
            <OptionRow name="audience" icon={<UsersRound/>} title="Audience and context" value={audiences.trim()?'Custom':'Automatic'}>
              <label>Target audiences <small>Optional</small><textarea rows={3} value={audiences} onChange={e=>setAudiences(e.target.value)} placeholder="One audience per line"/></label>
              <label>Reference material <small>Optional</small><textarea rows={2} maxLength={6000} value={material} onChange={e=>setMaterial(e.target.value)} placeholder="Product notes or audience research"/></label>
              <p>Leave audiences empty to let the model suggest visitors from the start page.</p>
            </OptionRow>
            <OptionRow name="launch" icon={<SlidersHorizontal/>} title="Launch and privacy" value={installFirst?'Installed app':'Browser'}>
              <label className="journey-check"><input type="checkbox" name="install-first" checked={installFirst} onChange={e=>setInstallFirst(e.target.checked)}/>Install and launch before each visit</label>
              {installFirst && <label className="journey-check"><input type="checkbox" name="plan-device" checked={planDevice} onChange={e=>setPlanDevice(e.target.checked)}/>Let the model choose device, browser and orientation</label>}
              <label className="journey-check"><input type="checkbox" checked={recordScreen} onChange={e=>setRecordScreen(e.target.checked)}/>Include a local screen recording in the report</label>
              <label className="journey-check"><input type="checkbox" checked={shareScreen} onChange={e=>setShareScreen(e.target.checked)}/>Send page screenshots to the model</label>
              <p>{useLocal?'The local server':'OpenRouter'} receives the goal, context and visible page text. {shareScreen?'Use a model that accepts images.':'Captures stay local.'}</p>
            </OptionRow>
            <OptionRow name="model" icon={<Cable/>} title="Model connection" value={useLocal?'Local server':envKey || apiKey?'OpenRouter':'Add API key'}>
              <label>Model provider<select value={useLocal?'local':'openrouter'} onChange={e=>setUseLocal(e.target.value==='local')}><option value="openrouter">OpenRouter</option><option value="local">Local OpenAI-compatible server</option></select></label>
              {useLocal && <label>Local endpoint<input required value={endpoint} onChange={e=>setEndpoint(e.target.value)}/></label>}
              <label>Model ID<input required maxLength={160} value={useLocal?localModel:model} onChange={e=>useLocal?setLocalModel(e.target.value):setModel(e.target.value)}/></label>
              {!useLocal && <label>API key<input type="password" autoComplete="off" spellCheck={false} maxLength={512} required={!envKey} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={envKey?'Environment key available':'OpenRouter API key'}/></label>}
            </OptionRow>
          </div>
        </section>
      </div>
      <footer><span>{device && device+' · '}Up to {MAX_ACTIONS} actions per visit</span><button className="journey-primary" type="submit">{running?'Run in progress':'Start visits'}<ArrowRight size={16}/></button></footer>
    </fieldset></form>:report && <>
      <div className="journey-heading"><h2>{report.goal}</h2>
        {running?<button className="journey-secondary" onClick={()=>void bridge.stop().catch(()=>setError('Could not stop the run.'))}><Square size={13}/>Stop run</button>:
          <button className="journey-secondary" onClick={()=>void bridge.save().then(setSaved).catch(()=>setError('Could not save the report.'))}><Download size={15}/>{saved?'Save again':'Save report'}</button>}</div>
      <div className="journey-status" role="status"><span data-state={report.status}/>{report.message}</div>
      <VisitReview key={report.id} report={report} bridge={bridge} preview={preview} aperture={aperture} open={open}/>
    </>}
  </section>;
}
