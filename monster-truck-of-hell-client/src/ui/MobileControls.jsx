import { useRef, useState } from 'react';
import { useStore } from './store.js';
import { T } from './Text.jsx';

// Touch controls: thumbstick bottom-left (up = gas, down = brake/reverse, sideways = steer) and a
// hold-to-drift button bottom-right. Jump and Nitro are the ability slots in the bottom bar.
export function MobileControls({ actions }) {
  const touch = useStore((s) => s.touch);
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const [drift, setDrift] = useState(false);
  const pid = useRef(null);
  if (!touch) return null;

  const R = 60;
  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy, active: true });
    actions.joystick(dx / R, -dy / R);
  };
  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0, active: false });
    actions.joystick(0, 0);
  };
  const driftOn = (v) => (e) => { e.stopPropagation(); setDrift(v); actions.drift(v); };

  return (
    <>
      <div
        ref={base}
        className="joystick"
        onPointerDown={(e) => { e.stopPropagation(); pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (pid.current === e.pointerId) move(e); }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)`, opacity: knob.active ? 1 : 0.8 }} />
      </div>
      <button className={`drift-btn ${drift ? 'on' : ''}`} onPointerDown={driftOn(true)} onPointerUp={driftOn(false)} onPointerCancel={driftOn(false)} onPointerLeave={driftOn(false)}>
        <T size={22} sw={2.4}>Drift</T>
      </button>
    </>
  );
}
