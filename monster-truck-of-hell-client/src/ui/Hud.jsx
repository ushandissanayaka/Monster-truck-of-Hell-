import { useEffect, useRef, useState } from 'react';
import { store, useStore, openModal } from './store.js';
import { useMagnify } from './magnify.js';
import { T } from './Text.jsx';
import { Modals } from './Modals.jsx';
import { MobileControls } from './MobileControls.jsx';
import { RaceBar } from './RaceBar.jsx';
import { iconUrl } from '../game/util/art2d.js';
import { truckImage } from './truckRender.js';
import { WHEEL_COOLDOWN_MS, PLAYTIME_MS, xpForLevel, formatShort, mmss, STARTER_PACK } from '../shared/gameData.js';
import { audio } from '../game/audio/AudioManager.js';

// The HUD is laid out on the reference's 1914 x 990 screen and scaled per corner to fit.
const DESIGN_W = 1914;
const DESIGN_H = 990;
function calcScales() {
  const w = window.innerWidth, h = window.innerHeight;
  const touch = matchMedia('(pointer: coarse)').matches;
  const s = Math.max(0.36, Math.min(w / DESIGN_W, h / DESIGN_H) * (touch ? 1.05 : 1));
  const ps = Math.max(0.4, Math.min(1, (w - 16) / 1100, (h - 16) / 700));
  return { s, ps, portrait: h > w * 1.05, touch };
}
function useHudScale() {
  const [sc, setSc] = useState(calcScales);
  useEffect(() => {
    const on = () => setSc(calcScales());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return sc;
}

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const Img = ({ src, className, style }) => (src ? <img className={className} style={style} src={src} alt="" draggable="false" /> : null);

// ---------------------------------------------------------------- top left

function LeftHud({ actions }) {
  const cash = useStore((s) => s.cash);
  const potions = useStore((s) => s.potions.length);
  const lastSpinAt = useStore((s) => s.lastSpinAt);
  const spins = useStore((s) => s.spins);
  const offset = useStore((s) => s.serverOffset);
  const now = useNow(1000);
  const spinReady = spins > 0 || now + offset >= lastSpinAt + WHEEL_COOLDOWN_MS;
  const ref = useRef(null);
  useMagnify(ref, 'left');
  const btn = (id, label, icon, cls = '') => (
    <button data-mag className={`tile ${cls}`} onClick={() => { audio.click(); openModal(id); }}>
      {icon}
      <T size={33} sw={3}>{label}</T>
    </button>
  );
  return (
    <>
      <button className="potions" onClick={() => { audio.click(); openModal('rewards'); }} aria-label="Rewards">
        <Img className="potion-ico" src={iconUrl('potion', 128)} />
        <T size={36} sw={3}>{`${potions}/10`}</T>
      </button>
      <div className="cash-bar">
        <Img className="cash-ico" src={iconUrl('cash', 128)} />
        <T size={38} sw={3}>{formatShort(cash)}</T>
        <button className="plus" onClick={() => openModal('shop', 'cash')} aria-label="Buy Cash">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#1b1b2b" strokeWidth="6" strokeLinecap="round" /><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="tiles" ref={ref}>
        {btn('shop', 'Shop', <Img className="tile-ico" src={iconUrl('shop', 128)} />, 'shop')}
        {btn('items', 'Items', <span className="items-ico"><i /><Img src={truckImage('green_goblin', -0.75)} /></span>)}
        <div className="tile-wrap">
          {btn('wheel', 'Spin!', <Img className="tile-ico ball" src={iconUrl('ball', 128)} />)}
          {spinReady && <span className="bang">!</span>}
        </div>
        {btn('powers', 'Powers', <Img className="tile-ico" src={iconUrl('flame', 128)} />)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- top centre
function TopCenter({ actions }) {
  const left = useStore((s) => s.raceLeft);
  const mul = useStore((s) => s.raceMul);
  const phase = useStore((s) => s.racePhase);
  return (
    <>
      <div className="timer">
        <T size={50} sw={3.4}>{phase === 'race' ? mmss(left) : '08:00'}</T>
        {mul > 1 && phase === 'race' && <T size={40} sw={3.4} color="#ffd21a" className="x2">{`x${mul}`}</T>}
      </div>
      <RaceBar />
      <button className="skip-btn" onClick={() => { audio.click(); actions.skip(); }}>
        <svg viewBox="0 0 40 30" className="skip-ico"><path d="M3 3 L21 15 L3 27 Z" fill="#fff" stroke="#1b1b2b" strokeWidth="2.6" strokeLinejoin="round" /><rect x="25" y="3" width="6" height="24" fill="#fff" stroke="#1b1b2b" strokeWidth="2.6" /></svg>
        <T size={32} sw={3}>Skip</T>
      </button>
    </>
  );
}

// ---------------------------------------------------------------- top right
function TopRight() {
  const joinedAt = useStore((s) => s.joinedAt);
  const claimed = useStore((s) => s.playtimeClaimed || s.hats.includes('propeller'));
  const pack = useStore((s) => s.starterPack);
  const now = useNow(500);
  const left = Math.max(0, (joinedAt + PLAYTIME_MS - now) / 1000);
  return (
    <>
      <button className="gear" onClick={() => openModal('settings')} aria-label="Settings">
        <Img src={iconUrl('gear', 96)} />
      </button>
      {!pack && (
        <button className="starter" onClick={() => openModal('starter')}>
          <span className="starter-glow" />
          <Img className="starter-truck" src={truckImage(STARTER_PACK.truck, -0.75)} />
          <T size={33} sw={3}>{'Starter\nPack!'}</T>
        </button>
      )}
      {!claimed && (
        <button className="playtime" onClick={() => openModal('playtime')}>
          <div className="pt-text">
            <T size={31} sw={3}>Play for 10 mins</T>
            {left > 0
              ? <T size={33} sw={3} gradient="linear-gradient(180deg,#ff6cff 0%,#e23cff 55%,#b02cff 100%)">{`${mmss(left)} left`}</T>
              : <T size={33} sw={3} color="#7dff3a">Claim!</T>}
          </div>
          <Img className="pt-hat" src={iconUrl('propeller', 128)} />
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------- bottom
function Abilities({ actions }) {
  const nitro = useStore((s) => s.nitro01);
  const on = useStore((s) => s.nitroOn);
  return (
    <div className="abilities">
      <button className="slot" onPointerDown={(e) => { e.stopPropagation(); actions.jump(); }}>
        <span className="key key-space">Space</span>
        <Img className="slot-ico" src={iconUrl('jump', 128)} />
      </button>
      <button className={`slot ${nitro < 1 && !on ? 'cool' : ''} ${on ? 'on' : ''}`} onPointerDown={(e) => { e.stopPropagation(); actions.nitro(); }}>
        <span className="key key-q">Q</span>
        <span className="nos-badge"><span className="nos-in"><Img src={iconUrl('nitro', 128)} /></span></span>
        {!on && nitro < 1 && <span className="cool-fill" style={{ height: `${(1 - nitro) * 100}%` }} />}
        {on && <span className="burn-fill" style={{ height: `${nitro * 100}%` }} />}
      </button>
    </div>
  );
}

function XpBar() {
  const xp = useStore((s) => s.xp);
  const level = useStore((s) => s.level);
  const need = xpForLevel(level);
  return (
    <div className="xpbar">
      <div className="xp-fill" style={{ width: `${Math.min(100, (xp / need) * 100)}%` }} />
      {[1, 2, 3, 4].map((i) => <i key={i} className="xp-tick" style={{ left: `${i * 20}%` }} />)}
      <T size={26} sw={2.6} className="xp-num">{`${formatShort(xp)}/${formatShort(need)}`}</T>
      <T size={28} sw={2.6} className="xp-lvl">{`Lvl ${level}`}</T>
      <span className="xp-star">
        <Img src={iconUrl('star', 128)} />
        <T size={36} sw={3}>{String(level + 1)}</T>
      </span>
    </div>
  );
}

function BottomLeft() {
  const boost = useStore((s) => s.friendBoost);
  return (
    <div className="boost" title="Friends in this server boost your Cash">
      <Img src={iconUrl('friends', 96)} />
      <T size={25} sw={2.6}>{`${boost}%`}</T>
    </div>
  );
}

function Drift() {
  const on = useStore((s) => s.drifting);
  return (
    <div className={`drift ${on ? 'on' : ''}`}>
      <T size={30} sw={3}>Drift</T>
      <span className="key key-shift">Shift</span>
    </div>
  );
}

// ---------------------------------------------------------------- overlays
function Prompt({ actions }) {
  const p = useStore((s) => s.prompt);
  const modal = useStore((s) => s.modal);
  if (!p || modal) return null;
  return (
    <button className="prompt" style={{ left: p.x, top: p.y }} onClick={actions.interact}>
      <span className="prompt-key">E</span>
      <span className="prompt-text"><small>{p.object}</small><b>{p.action}</b></span>
    </button>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}><T size={30} sw={3} color={t.kind === 'error' ? '#ff4a4a' : t.kind === 'cash' ? '#7dff3a' : t.kind === 'reward' ? '#ffd21a' : '#ffffff'}>{t.text}</T></div>
      ))}
    </div>
  );
}

function Notices() {
  const n = useStore((s) => s.notice);
  const c = useStore((s) => s.center);
  return (
    <>
      {n && <div key={n.id} className="notice"><T size={21} sw={2.4}>{n.text}</T></div>}
      {c && <div key={c.id} className="center-msg"><T size={24} sw={2.6} color={c.color}>{c.text}</T></div>}
    </>
  );
}

function Victory() {
  const v = useStore((s) => s.victory);
  if (!v) return null;
  const place = ['1st', '2nd', '3rd'][v.place - 1] || `${v.place}th`;
  return (
    <div key={v.id} className="victory">
      <T size={92} sw={6} font="title" gradient="linear-gradient(180deg,#fff36a 0%,#ffcc1a 50%,#ff8a1a 100%)">FINISHED!</T>
      <T size={44} sw={4}>{`${place} place`}</T>
      <div className="victory-rewards">
        <span><img src={iconUrl('cash', 96)} alt="" /><T size={40} sw={3.4} color="#7dff3a">{`+${formatShort(v.cash)}`}</T></span>
        <span><img src={iconUrl('star', 96)} alt="" /><T size={40} sw={3.4} color="#ffd21a">{`+${formatShort(v.xp)} XP`}</T></span>
      </div>
    </div>
  );
}

function Transition() {
  const t = useStore((s) => s.transition);
  if (!t) return null;
  return <div key={t.id} className="wipe">{t.text && <T size={56} sw={4} font="title">{t.text}</T>}</div>;
}

function RotateHint() {
  return (
    <div className="rotate-hint">
      <svg viewBox="0 0 64 64" className="rotate-phone"><rect x="18" y="6" width="28" height="52" rx="5" fill="none" stroke="#fff" strokeWidth="4" /><circle cx="32" cy="51" r="2.5" fill="#fff" /></svg>
      <T size={30} sw={3}>Turn your device sideways</T>
    </div>
  );
}

export function Hud({ game }) {
  const { s, ps, portrait, touch } = useHudScale();
  const loading = useStore((st) => st.loading);
  const hidden = useStore((st) => st.uiHidden);
  const fps = useStore((st) => st.fps);
  const showFps = useStore((st) => st.showFps);
  if (!game || loading) return null;
  const actions = game.actions;
  return (
    <div className={`hud ${touch ? 'touch' : ''}`} style={{ '--s': s, '--ps': ps }}>
      {!hidden && (
        <>
          <div className="anchor tl"><LeftHud actions={actions} /></div>
          <div className="anchor tc"><TopCenter actions={actions} /></div>
          <div className="anchor tr"><TopRight /></div>
          <div className="anchor bc"><Abilities actions={actions} /><XpBar /><Notices /></div>
          <div className="anchor bl"><BottomLeft /></div>
          <div className="anchor br">{!touch && <Drift />}</div>
          <Prompt actions={actions} />
          <Toasts />
          <Victory />
          <MobileControls actions={actions} />
        </>
      )}
      {showFps && <div className="fps">{fps} FPS</div>}
      <Transition />
      <Modals actions={actions} />
      {portrait && touch && <RotateHint />}
    </div>
  );
}

export { store };
