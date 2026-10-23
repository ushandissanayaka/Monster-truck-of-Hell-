// Server-side rules for everything that costs or pays: Cash, XP / levels, trucks, hats, powers, the
// Daily Wheel, play-time reward and Gems purchase grants. All functions take the player's profile
// (and mutate it) and return a result object that is sent back to the client.

import { markDirty } from './profiles.js';
import {
  TRUCKS, HATS, POWERS, PASSES, CASH_PACKS, STARTER_PACK, SKIP_SKU, SPINS_SKU, WHEEL_SEGMENTS, WHEEL_COOLDOWN_MS,
  BOOST_MS, PLAYTIME_MS, powerCost, truckById, xpForLevel, cashMul, xpMul,
} from '../shared/gameData.js';

export function ensureProfile(p) {
  p.cash ??= 0;
  p.xp ??= 0;
  p.level ??= 1;
  p.totalCash ??= 0;
  p.trucks ??= ['big_blue'];
  if (!p.trucks.includes('big_blue')) p.trucks.unshift('big_blue');
  p.truck ??= 'big_blue';
  p.hats ??= [];
  p.hat ??= null;
  p.powers ??= {};
  p.passes ??= {};
  p.boosts ??= {};
  p.spins ??= 0;
  p.lastSpinAt ??= 0;
  p.starterPack ??= false;
  p.playtimeClaimed ??= false;
  p.races ??= 0;
  p.wins ??= 0;
  p.finishes ??= 0;
  p.potions ??= 0;
  return p;
}

// Cash / XP with the player's multipliers; returns what was actually added.
export function addCash(p, base, friendBoost = 0) {
  const n = Math.round(base * cashMul(p, Date.now(), friendBoost));
  p.cash += n;
  p.totalCash = (p.totalCash || 0) + n;
  markDirty();
  return n;
}

export function addXp(p, base) {
  const n = Math.round(base * xpMul(p));
  p.xp += n;
  let ups = 0;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level += 1;
    p.cash += 100 * p.level; // level-up bonus
    ups++;
  }
  markDirty();
  return { xp: n, ups };
}

export function buyTruck(p, id) {
  const t = TRUCKS.find((x) => x.id === id);
  if (!t) return { ok: false, error: 'locked' };
  if (p.trucks.includes(id)) return equipTruck(p, id);
  if (t.how === 'free') {
    p.trucks.push(id);
    p.truck = id;
    markDirty();
    return { ok: true, truck: id, text: `${t.name} claimed!` };
  }
  if (t.how !== 'cash') return { ok: false, error: t.how === 'gems' ? 'gems' : 'locked' };
  if (p.cash < t.price) return { ok: false, error: 'no_cash' };
  p.cash -= t.price;
  p.trucks.push(id);
  p.truck = id;
  markDirty();
  return { ok: true, truck: id, text: `${t.name} bought!` };
}

export function equipTruck(p, id) {
  if (!p.trucks.includes(id)) return { ok: false, error: 'locked' };
  p.truck = id;
  markDirty();
  return { ok: true, truck: id, text: `${truckById(id).name} equipped!` };
}

export function equipHat(p, id) {
  if (!id) { p.hat = null; markDirty(); return { ok: true }; }
  if (!p.hats.includes(id)) return { ok: false, error: 'locked' };
  p.hat = id;
  markDirty();
  return { ok: true };
}

export function buyPower(p, id) {
  const pw = POWERS.find((x) => x.id === id);
  if (!pw) return { ok: false, error: 'locked' };
  const lvl = p.powers[id] || 0;
  if (lvl >= pw.max) return { ok: false, error: 'max' };
  const cost = powerCost(pw, lvl);
  if (p.cash < cost) return { ok: false, error: 'no_cash' };
  p.cash -= cost;
  p.powers[id] = lvl + 1;
  markDirty();
  return { ok: true, name: pw.name, level: lvl + 1 };
}

function pick(list) {
  const total = list.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= list[i].weight;
    if (r <= 0) return i;
  }
  return list.length - 1;
}

// free every WHEEL_COOLDOWN_MS, otherwise uses a bought / won spin
export function spinWheel(p, friendBoost = 0) {
  const now = Date.now();
  const free = now >= p.lastSpinAt + WHEEL_COOLDOWN_MS;
  if (!free && p.spins <= 0) return { ok: false, wait: p.lastSpinAt + WHEEL_COOLDOWN_MS - now };
  if (free) p.lastSpinAt = now; else p.spins -= 1;
  const index = pick(WHEEL_SEGMENTS);
  const s = WHEEL_SEGMENTS[index];
  let label = s.label;
  if (s.cash) addCash(p, s.cash, friendBoost);
  if (s.xp) addXp(p, s.xp);
  if (s.spins) p.spins += s.spins;
  if (s.boost) p.boosts[s.boost] = Math.max(p.boosts[s.boost] || 0, now) + BOOST_MS;
  if (s.truck) {
    if (p.trucks.includes(s.truck)) { addCash(p, 2500); label = `${label} (owned: +2,500 Cash)`; } else p.trucks.push(s.truck);
  }
  if (s.hat) {
    const pool = HATS.filter((h) => h.how === 'spin' && !p.hats.includes(h.id));
    if (pool.length) {
      const h = pool[Math.floor(Math.random() * pool.length)];
      p.hats.push(h.id);
      label = h.name;
    } else { addCash(p, 500); label = '+500 Cash'; }
  }
  markDirty();
  return { ok: true, index, label };
}

export function claimPlaytime(p, joinedAt) {
  if (p.playtimeClaimed || p.hats.includes('propeller')) return { ok: false, error: 'claimed' };
  if (Date.now() - joinedAt < PLAYTIME_MS - 2000) return { ok: false, error: 'not_yet' };
  p.playtimeClaimed = true;
  p.hats.push('propeller');
  p.hat = 'propeller';
  markDirty();
  return { ok: true };
}

// A Gems purchase (from the webhook) -> what it gives. Returns a toast text, or null if unknown.
// 'skip' is returned so the room can move the buyer to the next stage.
export function applyGrant(p, sku) {
  const pass = PASSES.find((x) => x.sku === sku);
  if (pass) {
    p.passes[pass.id] = true;
    if (pass.id === 'more_hats') for (const h of HATS.filter((x) => x.how === 'pass')) if (!p.hats.includes(h.id)) p.hats.push(h.id);
    markDirty();
    return { text: `${pass.name} unlocked!` };
  }
  const pack = CASH_PACKS.find((x) => x.sku === sku);
  if (pack) { p.cash += pack.cash; markDirty(); return { text: `+${pack.cash.toLocaleString()} Cash!` }; }
  if (sku === STARTER_PACK.sku) {
    p.starterPack = true;
    if (!p.trucks.includes(STARTER_PACK.truck)) p.trucks.push(STARTER_PACK.truck);
    p.truck = STARTER_PACK.truck;
    p.cash += STARTER_PACK.cash;
    markDirty();
    return { text: 'Starter Pack unlocked!' };
  }
  if (sku === SPINS_SKU) { p.spins += 3; markDirty(); return { text: '+3 Spins!' }; }
  if (sku === SKIP_SKU) return { text: 'Stage skipped!', skip: true };
  const truck = TRUCKS.find((t) => t.sku === sku);
  if (truck) {
    if (!p.trucks.includes(truck.id)) p.trucks.push(truck.id);
    p.truck = truck.id;
    markDirty();
    return { text: `${truck.name} unlocked!` };
  }
  return null;
}

export function profileMessage(p, extra = {}) {
  return {
    cash: p.cash, xp: p.xp, level: p.level, trucks: p.trucks, truck: p.truck, hats: p.hats, hat: p.hat,
    powers: p.powers, passes: p.passes, boosts: p.boosts, spins: p.spins, lastSpinAt: p.lastSpinAt,
    starterPack: p.starterPack, playtimeClaimed: p.playtimeClaimed, races: p.races, wins: p.wins,
    now: Date.now(), ...extra,
  };
}
