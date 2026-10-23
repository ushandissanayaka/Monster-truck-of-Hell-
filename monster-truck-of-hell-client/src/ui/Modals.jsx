import { useEffect, useRef, useState } from 'react';
import { store, useStore, closeModal, openModal } from './store.js';
import { T } from './Text.jsx';
import { iconUrl } from '../game/util/art2d.js';
import { truckImage, drawTurning } from './truckRender.js';
import { audio } from '../game/audio/AudioManager.js';
import {
  TRUCKS, HATS, POWERS, PASSES, CASH_PACKS, STARTER_PACK, SPINS_SKU, WHEEL_SEGMENTS, WHEEL_COOLDOWN_MS, PLAYTIME_MS,
  powerCost, truckById, formatShort, mmss,
} from '../shared/gameData.js';

const Gem = () => (
  <svg className="gem" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z" fill="#3fd0ff" stroke="#0a3a6a" strokeWidth="1.6" strokeLinejoin="round" /><path d="M2 9h20M9 3 7 9l5 12 5-12-2-6" fill="none" stroke="#0a3a6a" strokeWidth="1.1" /></svg>
);

function GemPrice({ sku }) {
  const price = useStore((s) => s.iapPrices[sku]);
  return <span className="price"><Gem /><T size={24} sw={2.4}>{price != null ? String(price) : '...'}</T></span>;
}

function Btn({ children, color = 'green', onClick, disabled, size = 26 }) {
  return (
    <button className={`mbtn ${color}`} disabled={disabled} onClick={(e) => { e.stopPropagation(); audio.click(); onClick?.(); }}>
      {typeof children === 'string' ? <T size={size} sw={2.6}>{children}</T> : children}
    </button>
  );
}

function Panel({ title, color = '#ffb81a', icon, children, wide, className = '' }) {
  return (
    <div className={`panel ${wide ? 'wide' : ''} ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head" style={{ '--hc': color }}>
        {icon && <img className="panel-ico" src={icon} alt="" />}
        <T size={44} sw={3.6} font="title">{title}</T>
        <button className="close" onClick={() => { audio.close(); closeModal(); }} aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([id, label]) => (
        <button key={id} className={`tab ${value === id ? 'on' : ''}`} onClick={() => { audio.click(); onChange(id); }}><T size={24} sw={2.4}>{label}</T></button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- shop (Gems)
function Shop({ actions, data }) {
  const [tab, setTab] = useState(data === 'cash' ? 'cash' : 'passes');
  const passes = useStore((s) => s.passes);
  return (
    <Panel title="Shop" color="#ffcc1a" icon={iconUrl('shop', 96)} wide>
      <Tabs tabs={[['passes', 'Passes'], ['cash', 'Cash'], ['trucks', 'Trucks']]} value={tab} onChange={setTab} />
      <div className="grid">
        {tab === 'passes' && PASSES.map((p) => (
          <div key={p.id} className="card" style={{ '--cc': p.color }}>
            <img className="card-ico" src={iconUrl({ x2_xp: 'star', x2_cash: 'cash', nitro: 'nitro', more_hats: 'hats', vip: 'star' }[p.id], 128)} alt="" />
            <T size={30} sw={3} color={p.color}>{p.name}</T>
            <span className="card-desc">{p.desc}</span>
            {passes[p.id] ? <Btn color="grey" disabled>Owned</Btn> : <Btn onClick={() => actions.purchase(p.sku)}><GemPrice sku={p.sku} /></Btn>}
          </div>
        ))}
        {tab === 'cash' && CASH_PACKS.map((p, i) => (
          <div key={p.id} className="card" style={{ '--cc': '#5af01a' }}>
            <div className="cash-pile">{Array.from({ length: i + 1 }, (_, k) => <img key={k} src={iconUrl('cash', 128)} alt="" />)}</div>
            <T size={30} sw={3} color="#7dff3a">{`${formatShort(p.cash)} Cash`}</T>
            <span className="card-desc">{p.name}</span>
            <Btn onClick={() => actions.purchase(p.sku)}><GemPrice sku={p.sku} /></Btn>
          </div>
        ))}
        {tab === 'cash' && (
          <div className="card" style={{ '--cc': '#2fe8ff' }}>
            <img className="card-ico" src={iconUrl('ball', 128)} alt="" />
            <T size={30} sw={3} color="#2fe8ff">3 Spins</T>
            <span className="card-desc">Spin the Daily Wheel 3 more times</span>
            <Btn onClick={() => actions.purchase(SPINS_SKU)}><GemPrice sku={SPINS_SKU} /></Btn>
          </div>
        )}
        {tab === 'trucks' && TRUCKS.filter((t) => t.how === 'gems').map((t) => <TruckCard key={t.id} t={t} actions={actions} />)}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- items (garage + hats)
function TruckCard({ t, actions }) {
  const owned = useStore((s) => s.trucks.includes(t.id));
  const equipped = useStore((s) => s.truck === t.id);
  const cash = useStore((s) => s.cash);
  let button;
  if (equipped) button = <Btn color="grey" disabled>Equipped</Btn>;
  else if (owned) button = <Btn color="blue" onClick={() => actions.equipTruck(t.id)}>Equip</Btn>;
  else if (t.how === 'cash') button = <Btn disabled={cash < t.price} onClick={() => actions.buyTruck(t.id)}><span className="price"><img src={iconUrl('cash', 64)} alt="" /><T size={24} sw={2.4}>{formatShort(t.price)}</T></span></Btn>;
  else if (t.how === 'gems') button = <Btn onClick={() => actions.buyTruck(t.id)}><GemPrice sku={t.sku} /></Btn>;
  else if (t.how === 'free') button = <Btn onClick={() => actions.buyTruck(t.id)}>Claim</Btn>;
  else if (t.how === 'pack') button = <Btn color="red" onClick={() => openModal('starter')}>Starter Pack</Btn>;
  return (
    <div className={`card truck-card ${equipped ? 'eq' : ''}`} style={{ '--cc': t.body }}>
      {t.label && <span className="card-tag"><T size={18} sw={2} color="#ffe31a" font="label">{t.label}</T></span>}
      <img className="truck-img" src={truckImage(t.id)} alt="" />
      <T size={26} sw={2.6}>{t.name}</T>
      <span className="card-desc">{`Speed x${t.speed.toFixed(2)}`}</span>
      {button}
    </div>
  );
}

function Items({ actions }) {
  const [tab, setTab] = useState('trucks');
  const hats = useStore((s) => s.hats);
  const hat = useStore((s) => s.hat);
  return (
    <Panel title="Items" color="#3fd0ff" icon={truckImage('green_goblin')} wide>
      <Tabs tabs={[['trucks', 'Trucks'], ['hats', 'Hats']]} value={tab} onChange={setTab} />
      <div className="grid">
        {tab === 'trucks' && TRUCKS.map((t) => <TruckCard key={t.id} t={t} actions={actions} />)}
        {tab === 'hats' && HATS.map((h) => {
          const owned = hats.includes(h.id);
          return (
            <div key={h.id} className={`card ${hat === h.id ? 'eq' : ''}`} style={{ '--cc': '#ffb81a' }}>
              <img className="truck-img" src={truckImage('big_blue', -0.75, h.id)} alt="" />
              <T size={26} sw={2.6}>{h.name}</T>
              <span className="card-desc">{owned ? 'Owned' : { playtime: 'Play for 10 mins', spin: 'Win it on the wheel', pass: 'More Hats pass' }[h.how]}</span>
              {owned
                ? (hat === h.id ? <Btn color="grey" onClick={() => actions.equipHat('')}>Take off</Btn> : <Btn color="blue" onClick={() => actions.equipHat(h.id)}>Wear</Btn>)
                : <Btn color="grey" disabled>Locked</Btn>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- spin wheel
function Wheel({ actions, data }) {
  const lastSpinAt = useStore((s) => s.lastSpinAt);
  const spins = useStore((s) => s.spins);
  const offset = useStore((s) => s.serverOffset);
  const [now, setNow] = useState(Date.now());
  const [angle, setAngle] = useState(0);
  const angleRef = useRef(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (data?.spinning) {
      const n = WHEEL_SEGMENTS.length;
      const target = 360 * 6 - (data.index / n) * 360;
      angleRef.current = Math.ceil(angleRef.current / 360) * 360 + target;
      setAngle(angleRef.current);
    }
  }, [data?.spinning, data?.index]);
  const wait = lastSpinAt + WHEEL_COOLDOWN_MS - (now + offset);
  const free = wait <= 0;
  const n = WHEEL_SEGMENTS.length;
  const R = 200;
  return (
    <Panel title="Daily Wheel" color="#ff5a36" icon={iconUrl('ball', 96)} wide>
      <div className="wheel-row">
      <div className="wheel-wrap">
        <svg className="wheel-svg" viewBox="-210 -210 420 420" style={{ transform: `rotate(${angle}deg)`, transition: data?.spinning ? 'transform 4.2s cubic-bezier(0.15,0.85,0.25,1)' : 'none' }}>
          {WHEEL_SEGMENTS.map((s, i) => {
            const a0 = ((i - 0.5) / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
            const am = (a0 + a1) / 2;
            return (
              <g key={s.id}>
                <path d={`M0 0 L${Math.cos(a0) * R} ${Math.sin(a0) * R} A${R} ${R} 0 0 1 ${Math.cos(a1) * R} ${Math.sin(a1) * R} Z`} fill={s.color} stroke="#1b1b2b" strokeWidth="4" />
                <image href={iconUrl(s.icon, 96)} x={Math.cos(am) * R * 0.64 - 30} y={Math.sin(am) * R * 0.64 - 30} width="60" height="60" />
              </g>
            );
          })}
          <circle r={R} fill="none" stroke="#2a2a2d" strokeWidth="14" />
          <circle r="46" fill="#c81e26" stroke="#7a0a10" strokeWidth="8" />
          <image href={iconUrl('star', 96)} x="-28" y="-28" width="56" height="56" />
        </svg>
        <svg className="wheel-ptr" viewBox="0 0 40 50"><path d="M4 4 H36 L20 46 Z" fill="#e4232b" stroke="#1b1b2b" strokeWidth="4" strokeLinejoin="round" /></svg>
      </div>
      <div className="wheel-side">
        {data?.result && <T size={34} sw={3} color="#ffd21a">{`You won: ${data.result.label}!`}</T>}
        <T size={26} sw={2.6}>{free ? 'Free spin ready!' : `Free spin in ${mmss(wait / 1000)}`}</T>
        <T size={24} sw={2.4} color="#2fe8ff">{`Extra spins: ${spins}`}</T>
        <Btn disabled={data?.spinning || (!free && spins <= 0)} onClick={actions.spin} size={34}>{free ? 'SPIN FREE!' : 'SPIN'}</Btn>
        <Btn color="blue" onClick={() => actions.purchase(SPINS_SKU)}><span className="price"><T size={24} sw={2.4}>+3 Spins</T><GemPrice sku={SPINS_SKU} /></span></Btn>
      </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- powers (Cash upgrades)
function Powers({ actions }) {
  const powers = useStore((s) => s.powers);
  const cash = useStore((s) => s.cash);
  return (
    <Panel title="Powers" color="#c040ff" icon={iconUrl('flame', 96)} wide>
      <div className="powers">
        {POWERS.map((p) => {
          const lvl = powers[p.id] || 0;
          const cost = powerCost(p, lvl);
          return (
            <div key={p.id} className="power-row" style={{ '--cc': p.color }}>
              <img src={iconUrl({ engine: 'flame', accel: 'bolt', nitro: 'nitro', jump: 'jump' }[p.id], 96)} alt="" />
              <div className="power-info">
                <T size={30} sw={3} color={p.color}>{p.name}</T>
                <span className="card-desc">{p.desc}</span>
                <div className="pips">{Array.from({ length: p.max }, (_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</div>
              </div>
              {lvl >= p.max
                ? <Btn color="grey" disabled>MAX</Btn>
                : <Btn disabled={cash < cost} onClick={() => actions.buyPower(p.id)}><span className="price"><img src={iconUrl('cash', 64)} alt="" /><T size={24} sw={2.4}>{formatShort(cost)}</T></span></Btn>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- offers
function TurningTruck({ id, hat }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf, a = -0.8;
    const loop = () => {
      a += 0.012;
      if (ref.current) drawTurning(ref.current, id, a, hat);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [id, hat]);
  return <canvas ref={ref} width="360" height="260" className="turning" />;
}

function Starter({ actions }) {
  const owned = useStore((s) => s.starterPack);
  const t = truckById(STARTER_PACK.truck);
  return (
    <Panel title="Starter Pack!" color="#ff3a3a">
      <div className="offer">
        <TurningTruck id={t.id} />
        <div className="offer-side">
          <T size={40} sw={3.4} color="#ff5a36" font="title">{t.name}</T>
          <span className="offer-line"><img src={iconUrl('flame', 64)} alt="" /><T size={26} sw={2.6}>{`Monster truck - speed x${t.speed}`}</T></span>
          <span className="offer-line"><img src={iconUrl('cash', 64)} alt="" /><T size={26} sw={2.6} color="#7dff3a">{`+${formatShort(STARTER_PACK.cash)} Cash`}</T></span>
          <span className="offer-line"><img src={iconUrl('star', 64)} alt="" /><T size={26} sw={2.6} color="#ffd21a">One time only!</T></span>
          {owned ? <Btn color="grey" disabled>Owned</Btn> : <Btn onClick={() => actions.purchase(STARTER_PACK.sku)} size={32}><GemPrice sku={STARTER_PACK.sku} /></Btn>}
        </div>
      </div>
    </Panel>
  );
}

function TruckOffer({ actions, data }) {
  const t = truckById(data);
  const owned = useStore((s) => s.trucks.includes(t.id));
  const cash = useStore((s) => s.cash);
  return (
    <Panel title={t.label || t.name} color={t.label === 'LIMITED TIME' ? '#ff1a2e' : t.label === 'FREE CAR!' ? '#ff3ad8' : '#2fe8ff'}>
      <div className="offer">
        <TurningTruck id={t.id} />
        <div className="offer-side">
          <T size={40} sw={3.4} font="title" color="#ffe31a">{t.name}</T>
          <T size={26} sw={2.6}>{`Top speed x${t.speed.toFixed(2)}`}</T>
          {owned ? <Btn color="blue" onClick={() => { actions.equipTruck(t.id); closeModal(); }}>Equip</Btn>
            : t.how === 'gems' ? <Btn onClick={() => actions.buyTruck(t.id)} size={30}><GemPrice sku={t.sku} /></Btn>
              : t.how === 'free' ? <Btn onClick={() => actions.buyTruck(t.id)} size={30}>Claim for FREE!</Btn>
                : <Btn disabled={cash < t.price} onClick={() => actions.buyTruck(t.id)}><span className="price"><img src={iconUrl('cash', 64)} alt="" /><T size={24} sw={2.4}>{formatShort(t.price)}</T></span></Btn>}
        </div>
      </div>
    </Panel>
  );
}

function PassOffer({ actions, data }) {
  const p = PASSES.find((x) => x.id === data) || PASSES[0];
  const owned = useStore((s) => !!s.passes[p.id]);
  return (
    <Panel title={p.name} color={p.color}>
      <div className="offer small">
        <img className="offer-badge" src={iconUrl({ x2_xp: 'star', x2_cash: 'cash', nitro: 'nitro', more_hats: 'hats', vip: 'star' }[p.id], 160)} alt="" />
        <div className="offer-side">
          <T size={30} sw={3}>{p.desc}</T>
          {owned ? <Btn color="grey" disabled>Owned</Btn> : <Btn onClick={() => actions.purchase(p.sku)} size={30}><GemPrice sku={p.sku} /></Btn>}
        </div>
      </div>
    </Panel>
  );
}

function Playtime({ actions }) {
  const joinedAt = useStore((s) => s.joinedAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const left = Math.max(0, (joinedAt + PLAYTIME_MS - now) / 1000);
  return (
    <Panel title="Free Hat!" color="#2f8bff" icon={iconUrl('propeller', 96)}>
      <div className="offer small">
        <TurningTruck id="big_blue" hat="propeller" />
        <div className="offer-side">
          <T size={30} sw={3}>Play for 10 minutes to get the Propeller Cap for your truck!</T>
          {left > 0 ? <T size={36} sw={3} color="#e23cff">{`${mmss(left)} left`}</T> : <Btn onClick={actions.claimPlaytime} size={32}>Claim!</Btn>}
        </div>
      </div>
    </Panel>
  );
}

function Settings() {
  const settings = useStore((s) => s.settings);
  const set = (k) => {
    const next = { ...settings, [k]: !settings[k] };
    try { localStorage.setItem('mth_settings', JSON.stringify(next)); } catch {}
    store.setState({ settings: next });
    if (k === 'music') audio.setMusicOn?.(next.music);
    if (k === 'sfx') audio.setVolume?.(next.sfx ? 0.8 : 0);
  };
  return (
    <Panel title="Settings" color="#8a8a9a" icon={iconUrl('gear', 96)}>
      <div className="settings">
        {[['music', 'Music'], ['sfx', 'Sound Effects'], ['popup', 'Pop-ups']].map(([k, label]) => (
          <div key={k} className="set-row">
            <T size={30} sw={3}>{label}</T>
            <Btn color={settings[k] ? 'green' : 'red'} onClick={() => set(k)}>{settings[k] ? 'ON' : 'OFF'}</Btn>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SignIn({ actions, data }) {
  return (
    <Panel title="Sign in" color="#2fb0f7">
      <div className="offer small">
        <div className="offer-side">
          <T size={30} sw={3}>Sign in to Bloxity to buy with Gems and keep your trucks forever!</T>
          <Btn onClick={() => actions.signInAndBuy(data?.sku)} size={30}>Sign in</Btn>
        </div>
      </div>
    </Panel>
  );
}

const VIEWS = { shop: Shop, items: Items, wheel: Wheel, powers: Powers, starter: Starter, truck: TruckOffer, pass: PassOffer, playtime: Playtime, settings: Settings, signin: SignIn };

export function Modals({ actions }) {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  const View = VIEWS[modal.type];
  if (!View) return null;
  return (
    <div className="modal-back" onPointerDown={() => closeModal()}>
      <div className="modal-scale"><View actions={actions} data={modal.data} /></div>
    </div>
  );
}
