import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useStore, closeModal, openModal } from './store.js';
import { T } from './Text.jsx';
import { iconUrl } from '../game/util/art2d.js';
import { truckImage, drawTurning } from './truckRender.js';
import { audio } from '../game/audio/AudioManager.js';
import {
  TRUCKS, HATS, POWERS, PASSES, CASH_PACKS, STARTER_PACK, SPINS_SKU, WHEEL_SEGMENTS, WHEEL_COOLDOWN_MS, PLAYTIME_MS,
  REWARDS, REWARD_TIERS, REWARD_COST, powerCost, truckById, formatShort, mmss,
} from '../shared/gameData.js';

const Gem = () => (
  <svg className="gem" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z" fill="#3fd0ff" stroke="#0a3a6a" strokeWidth="1.6" strokeLinejoin="round" /><path d="M2 9h20M9 3 7 9l5 12 5-12-2-6" fill="none" stroke="#0a3a6a" strokeWidth="1.1" /></svg>
);

function GemPrice({ sku, size = 24 }) {
  const price = useStore((s) => s.iapPrices[sku]);
  return <span className="price"><Gem /><T size={size} sw={2.4}>{price != null ? String(price) : '...'}</T></span>;
}

function CashPrice({ value, size = 22 }) {
  return <span className="price cash"><img src={iconUrl('cash', 64)} alt="" /><T size={size} sw={2.2} color="#7dff3a">{formatShort(value)}</T></span>;
}

function Btn({ children, color = 'green', onClick, disabled, size = 26, badge, className = '' }) {
  return (
    <button className={`mbtn ${color} ${className}`} disabled={disabled} onClick={(e) => { e.stopPropagation(); audio.click(); onClick?.(); }}>
      {typeof children === 'string' ? <T size={size} sw={2.6}>{children}</T> : children}
      {badge && <span className="mbtn-badge"><T size={18} sw={2} color="#ffe31a">{badge}</T></span>}
    </button>
  );
}

// Reference window: a dark see-through box, its name on a grey tag over the top-left corner and a
// red square close button on the top-right corner.
function Panel({ title, children, wide, className = '', side }) {
  return (
    <div className={`panel ${wide ? 'wide' : ''} ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-tag"><T size={34} sw={3} font="title" color="#f4f4f4">{title.toUpperCase()}</T></div>
      <button className="close" onClick={() => { audio.close(); closeModal(); }} aria-label="Close">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /></svg>
      </button>
      {side}
      <div className="panel-body">{children}</div>
    </div>
  );
}

// a square item tile; tone: grey | green | blue | purple | yellow | dark
function Tile({ tone = 'grey', icon, img, label, check, onClick, tip, children, small }) {
  const [hover, setHover] = useState(false);
  return (
    <button className={`itile ${tone} ${small ? 'small' : ''}`} onClick={(e) => { e.stopPropagation(); audio.click(); onClick?.(); }}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      {img && <img className="itile-img" src={img} alt="" />}
      {icon && <img className="itile-ico" src={iconUrl(icon, 128)} alt="" />}
      {check && <svg className="itile-check" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" fill="none" stroke="#1ec8f0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {label && <span className="itile-label">{label}</span>}
      {children}
      {hover && tip && <span className="itile-tip">{tip}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- shop
function Shop({ actions }) {
  const passes = useStore((s) => s.passes);
  const owned = useStore((s) => s.starterPack);
  const order = ['x2_cash', 'nitro', 'x2_xp', 'more_hats'];
  const icon = { x2_xp: 'star', x2_cash: 'cash', nitro: 'nitro', more_hats: 'hats' };
  return (
    <Panel title="Shop" className="shop" side={(
      <div className="shop-cash">
        {CASH_PACKS.map((p, i) => (
          <button key={p.id} className="cash-pack" onClick={(e) => { e.stopPropagation(); audio.click(); actions.purchase(p.sku); }}>
            <span className="cash-pile">{Array.from({ length: i + 1 }, (_, k) => <img key={k} src={iconUrl('cash', 96)} alt="" />)}</span>
            <T size={24} sw={2.4} color="#7dff3a">{`$${p.cash.toLocaleString()}`}</T>
          </button>
        ))}
      </div>
    )}>
      <button className={`starter-banner ${owned ? 'owned' : ''}`} onClick={(e) => { e.stopPropagation(); audio.click(); if (!owned) actions.purchase(STARTER_PACK.sku); }}>
        <T size={34} sw={3}>Starter Pack</T>
        <span className="sb-row">
          <img className="sb-truck" src={truckImage(STARTER_PACK.truck)} alt="" />
          <i>+</i><img src={iconUrl('hats', 96)} alt="" /><i>+</i><img src={iconUrl('cash', 96)} alt="" /><i>+</i><img src={iconUrl('star', 96)} alt="" />
        </span>
        <span className="sb-price">{owned ? <T size={24} sw={2.4}>Owned</T> : <GemPrice sku={STARTER_PACK.sku} />}</span>
      </button>
      <div className="pass-row">
        {order.map((id) => {
          const p = PASSES.find((x) => x.id === id);
          return (
            <Tile key={id} tone="dark" icon={icon[id]} tip={p.desc} onClick={() => !passes[id] && actions.purchase(p.sku)}>
              <span className="itile-name"><T size={20} sw={2}>{p.name}</T></span>
              <span className="itile-foot">{passes[id] ? <T size={18} sw={2} color="#7dff3a">Owned</T> : <GemPrice sku={p.sku} size={18} />}</span>
            </Tile>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- garage (trucks + hats)
function Garage({ actions }) {
  const [tab, setTab] = useState('trucks');
  const [confirm, setConfirm] = useState(null);
  const s = useStore((x) => x);
  const trucks = [...TRUCKS].sort((a, b) => (b.id === s.truck) - (a.id === s.truck));
  const truckTile = (t) => {
    const owned = s.trucks.includes(t.id), eq = s.truck === t.id;
    const tone = eq ? 'dark' : owned ? 'grey' : t.how === 'gems' ? 'yellow' : t.how === 'pack' ? 'purple' : 'grey';
    const click = () => {
      if (eq) return;
      if (owned) return actions.equipTruck(t.id);
      if (t.how === 'cash') return setConfirm(t);
      if (t.how === 'pack') return openModal('starter');
      actions.buyTruck(t.id);
    };
    return (
      <Tile key={t.id} tone={tone} img={truckImage(t.id)} check={eq} tip={t.name} onClick={click}>
        {!owned && <span className="itile-foot">{t.how === 'cash' ? <CashPrice value={t.price} size={18} /> : t.how === 'gems' ? <GemPrice sku={t.sku} size={18} /> : t.how === 'free' ? <T size={18} sw={2} color="#ff8ae8">FREE</T> : <T size={18} sw={2} color="#ffe31a">★ Pack</T>}</span>}
      </Tile>
    );
  };
  const hatTile = (h) => {
    const owned = s.hats.includes(h.id), eq = s.hat === h.id;
    return (
      <Tile key={h.id} tone={eq ? 'dark' : owned ? 'blue' : h.how === 'pass' ? 'yellow' : 'purple'} img={truckImage('big_blue', -0.75, h.id)} check={eq} tip={h.name}
        onClick={() => owned && actions.equipHat(eq ? '' : h.id)}>
        {!owned && <span className="itile-foot"><T size={16} sw={2} color="#fff">{{ playtime: '10 min', spin: 'Spin!', pass: 'Pass' }[h.how]}</T></span>}
      </Tile>
    );
  };
  return (
    <Panel title="Garage" className="garage" side={(
      <>
        <div className="rail">
          {[['trucks', truckImage('big_blue')], ['hats', iconUrl('hats', 96)]].map(([id, src]) => (
            <button key={id} className={`rail-btn ${tab === id ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); audio.click(); setTab(id); }}><img src={src} alt="" /></button>
          ))}
        </div>
        <button className="unlock-all" onClick={(e) => { e.stopPropagation(); audio.click(); openModal('shop'); }}>
          <img src={iconUrl('star', 128)} alt="" /><T size={22} sw={2.2}>Unlock All!</T>
        </button>
      </>
    )}>
      <div className="tile-grid">{tab === 'trucks' ? trucks.map(truckTile) : HATS.map(hatTile)}</div>
      {confirm && (
        <div className="confirm" onPointerDown={(e) => e.stopPropagation()}>
          <div className="panel-tag small"><T size={24} sw={2.4} font="title">{confirm.name}</T></div>
          <button className="close small" onClick={() => setConfirm(null)} aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /></svg></button>
          <T size={22} sw={2.2}>{`Are you sure you want\nto buy ${confirm.name}?`}</T>
          <Btn color="blue" disabled={s.cash < confirm.price} onClick={() => { actions.buyTruck(confirm.id); setConfirm(null); }}><CashPrice value={confirm.price} size={24} /></Btn>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- spin wheel (no window, as in the reference)
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
    <div className="spin-pop" onPointerDown={(e) => e.stopPropagation()}>
      <button className="close spin-close" onClick={() => { audio.close(); closeModal(); }} aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /></svg></button>
      <div className="wheel-wrap">
        <div className="wheel-tyre" />
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
          <circle r="54" fill="#c81e26" stroke="#7a0a10" strokeWidth="8" />
          <image href={iconUrl('star', 96)} x="-32" y="-32" width="64" height="64" />
        </svg>
        <svg className="wheel-ptr" viewBox="0 0 40 60"><path d="M20 58 L4 20 A16 16 0 1 1 36 20 Z" fill="#e4232b" stroke="#6d0d10" strokeWidth="3" /></svg>
      </div>
      <T size={34} sw={3}>{data?.result ? `You won: ${data.result.label}!` : free ? 'Free spin available' : `Free spin in ${mmss(wait / 1000)}`}</T>
      <Btn color="yellow" className="spin-big" disabled={data?.spinning || (!free && spins <= 0)} onClick={actions.spin} size={34} badge={`x${free ? spins + 1 : spins}`}>Spin</Btn>
      <div className="spin-buy">
        <span><Btn color="green" onClick={() => actions.purchase(SPINS_SKU)}><GemPrice sku={SPINS_SKU} /></Btn><T size={18} sw={2} color="#7dff3a">+3</T></span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- powers (Cash upgrades), as tiles
function Powers({ actions }) {
  const powers = useStore((s) => s.powers);
  const cash = useStore((s) => s.cash);
  const tone = { engine: 'red', accel: 'yellow', nitro: 'purple', jump: 'blue' };
  return (
    <Panel title="Powers" className="powers-pop">
      <div className="tile-grid four">
        {POWERS.map((p) => {
          const lvl = powers[p.id] || 0;
          const cost = powerCost(p, lvl);
          const max = lvl >= p.max;
          return (
            <Tile key={p.id} tone={tone[p.id]} icon={{ engine: 'flame', accel: 'bolt', nitro: 'nitro', jump: 'jump' }[p.id]}
              tip={`${p.name}: ${p.desc}`} onClick={() => !max && cash >= cost && actions.buyPower(p.id)}>
              <span className="itile-name"><T size={18} sw={2}>{`${p.name} ${lvl}/${p.max}`}</T></span>
              <span className="itile-foot">{max ? <T size={18} sw={2} color="#ffe31a">MAX</T> : <CashPrice value={cost} size={18} />}</span>
            </Tile>
          );
        })}
      </div>
      <span className="pop-note">Upgrade your truck with Cash!</span>
    </Panel>
  );
}

// ---------------------------------------------------------------- rewards: spend potions on a roll
function Rewards({ actions }) {
  const bank = useStore((s) => s.potionBank);
  const tone = { common: 'green', rare: 'blue', epic: 'purple', legendary: 'yellow' };
  return (
    <Panel title="Rewards" className="rewards">
      <div className="tile-grid five">
        {REWARDS.map((r) => <Tile key={r.id} tone={tone[r.tier]} icon={r.icon} tip={r.label} small />)}
      </div>
      <div className="odds">
        {REWARD_TIERS.map((t) => <span key={t.id} style={{ '--tc': t.color }}><T size={18} sw={2}>{`${t.chance}%`}</T></span>)}
      </div>
      <div className="roll-row">
        <Btn color="cyan" badge="x1" disabled={bank < REWARD_COST} onClick={() => actions.openRewards(1)}>
          <span className="price"><img src={iconUrl('potion', 64)} alt="" /><T size={24} sw={2.4}>{String(REWARD_COST)}</T></span>
        </Btn>
        <Btn color="magenta" badge="x5" disabled={bank < REWARD_COST * 5} onClick={() => actions.openRewards(5)}>
          <span className="price"><img src={iconUrl('potion', 64)} alt="" /><T size={24} sw={2.4}>{String(REWARD_COST * 5)}</T></span>
        </Btn>
      </div>
      <span className="pop-note">{`Collect potions around the map! You have ${bank}`}</span>
    </Panel>
  );
}

// ---------------------------------------------------------------- "You unlocked:" with confetti
function Confetti({ count = 90 }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.2, dur: 1.8 + Math.random() * 1.6, rot: Math.random() * 360,
    color: ['#ff4fc0', '#ffd21a', '#1ec8f0', '#7dff3a', '#b02ee0', '#ffffff'][i % 6], w: 8 + Math.random() * 8,
  })), [count]);
  return (
    <div className="confetti">
      {bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, width: b.w, height: b.w * 0.5, '--r': `${b.rot}deg` }} />)}
    </div>
  );
}

function Unlocked({ data }) {
  const prizes = data?.prizes || [];
  const tone = { common: 'green', rare: 'blue', epic: 'purple', legendary: 'yellow' };
  useEffect(() => { audio.win(); }, []);
  return (
    <div className="unlocked" onPointerDown={(e) => e.stopPropagation()}>
      <Confetti />
      <T size={44} sw={3.6}>You unlocked:</T>
      <div className="unlocked-row">
        {prizes.map((p, i) => {
          const r = REWARDS.find((x) => x.id === p.id);
          return (
            <div key={i} className="unlocked-item" style={{ animationDelay: `${i * 0.12}s` }}>
              <Tile tone={tone[p.tier]} icon={r?.icon || 'star'} />
              <T size={20} sw={2}>{p.label}</T>
            </div>
          );
        })}
      </div>
      <Btn color="cyan" onClick={() => closeModal()} size={30}>Claim</Btn>
    </div>
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

const VIEWS = { shop: Shop, items: Garage, wheel: Wheel, powers: Powers, rewards: Rewards, unlocked: Unlocked, starter: Starter, truck: TruckOffer, pass: PassOffer, playtime: Playtime, settings: Settings, signin: SignIn };

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
