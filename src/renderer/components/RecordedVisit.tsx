import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { VisitRecording } from '../../types/journey.types';
import { elapsedTime } from '../../utils/journey-evidence.util';

export interface PlaybackStart { at: number; play: boolean }

export function RecordedVisit({film, start}: {film: VisitRecording; start: PlaybackStart}) {
  const first = film.frames[0].at;
  const [at, setAt] = useState(first);
  const [playing, setPlaying] = useState(false);
  const anchor = useRef(0);
  useEffect(() => {
    const position = Math.min(film.duration, Math.max(first, start.at));
    anchor.current = performance.now() - position;
    setAt(position);
    setPlaying(start.play);
  }, [film, first, start]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const position = Math.min(performance.now() - anchor.current, film.duration);
      setAt(position);
      if (position >= film.duration) setPlaying(false);
    }, 65);
    return () => window.clearInterval(timer);
  }, [playing, film.duration]);

  let lo = 0, hi = film.frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (film.frames[mid].at <= at) lo = mid + 1;
    else hi = mid;
  }
  const frame = film.frames[Math.max(0, lo - 1)];
  const src = useMemo(() => 'data:image/jpeg;base64,' + frame.jpeg, [frame]);
  function toggle() {
    if (!playing) {
      const position = at >= film.duration ? first : at;
      anchor.current = performance.now() - position;
      setAt(position);
    }
    setPlaying(!playing);
  }
  return <section className="journey-screen" aria-label="Visit recording">
    <div className="journey-photo"><img alt="Recorded visitor viewport" src={src}/></div>
    <div className="journey-playback journey-film-controls">
      <button onClick={toggle} aria-label={playing ? 'Pause replay' : 'Replay visit'}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>
      <input aria-label="Recording position" type="range" min={first} max={film.duration} value={at} step={1}
        onChange={e=>{setPlaying(false);setAt(Number(e.target.value));}}/>
      <output>{elapsedTime(at)} / {elapsedTime(film.duration)}</output>
    </div>
    {film.clipped && <small>Recording ended at the size limit.</small>}
  </section>;
}
