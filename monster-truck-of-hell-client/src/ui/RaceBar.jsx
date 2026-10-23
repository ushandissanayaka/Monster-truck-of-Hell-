import { useState } from 'react';
import { useStore } from './store.js';
import { iconUrl } from '../game/util/art2d.js';
import { STAGE_COLORS } from '../shared/gameData.js';

// Top race bar: one coloured block per stage from the start to the checkered flag, with every
// racer's Bloxity picture at their place on the course (yours drawn on top, a bit bigger).

function Head({ racer }) {
  const [broken, setBroken] = useState(null);
  const src = racer.pfp && broken !== racer.pfp ? racer.pfp : null;
  return (
    <div className={`rb-head ${racer.self ? 'self' : ''}`} style={{ left: `${racer.progress * 100}%` }} title={racer.name}>
      {src ? <img src={src} alt="" draggable="false" onError={() => setBroken(racer.pfp)} /> : <span className="rb-noface" />}
    </div>
  );
}

export function RaceBar() {
  const racers = useStore((s) => s.racers);
  const [open, setOpen] = useState(true);
  return (
    <div className={`racebar ${open ? '' : 'closed'}`}>
      <div className="rb-track">
        {STAGE_COLORS.map((c, i) => <div key={c + i} className="rb-seg" style={{ background: c }} />)}
      </div>
      <div className="rb-heads">
        {racers.filter((r) => !r.self).slice(0, 23).map((r) => <Head key={r.id} racer={r} />)}
        {racers.filter((r) => r.self).map((r) => <Head key="me" racer={r} />)}
      </div>
      <img className="rb-flag" src={iconUrl('flag', 96)} alt="" draggable="false" />
      <button className="rb-toggle" onClick={() => setOpen(!open)} aria-label="Toggle race bar">
        <svg viewBox="0 0 20 12"><path d={open ? 'M3 10 L10 3 L17 10' : 'M3 3 L10 10 L17 3'} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
