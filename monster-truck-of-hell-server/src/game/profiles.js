// Player profiles + Gems purchase grants.
//
// Two stores, same API:
//  - MongoDB when MONGODB_URI is set (Boxity hosting). Every pod reads and writes the same database,
//    so a player's save follows them to whichever pod they land on, survives redeploys, and a Gems
//    webhook received by one pod reaches the buyer on another.
//  - JSON files in DATA_DIR otherwise (local development, a single server).
//
// Online players' profiles are kept in memory (`cache`) and written back every few seconds while they
// change, and right away when the player leaves. Signed-in players ("legion_*") and signed-out
// browsers ("guest_*", keyed by their guestKey) are saved; "temp_*" players (no key) are not.

import fs from 'node:fs';
import path from 'node:path';

const MONGODB_URI = process.env.MONGODB_URI || '';
const SAVE_EVERY_MS = 3000;

const cache = new Map();   // userId -> profile (players on this server)
const refs = new Map();    // userId -> sessions on this server using it
let dirty = false;
let saveTimer = null;

// ---------------------------------------------------------------- stores

function fileStore() {
  const dir = path.resolve(process.env.DATA_DIR || './data');
  const profilesFile = path.join(dir, 'profiles.json');
  const grantsFile = path.join(dir, 'grants.json');
  fs.mkdirSync(dir, { recursive: true });
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
  const all = read(profilesFile);
  const grants = read(grantsFile);
  const write = () => {
    try {
      fs.writeFileSync(profilesFile, JSON.stringify(all));
      fs.writeFileSync(grantsFile, JSON.stringify(grants));
    } catch (err) {
      console.error('[profiles] save failed:', err.message);
    }
  };
  return {
    name: 'files',
    async load(id) { return all[id] || null; },
    async save(list) { for (const p of list) all[p.userId] = p; write(); },
    async top(field, limit) {
      return Object.values(all).filter((p) => (p[field] || 0) > 0).sort((a, b) => b[field] - a[field]).slice(0, limit);
    },
    async addGrant(tx) {
      if (grants[tx.transactionId]) return false;
      grants[tx.transactionId] = tx;
      write();
      return true;
    },
    async pendingGrants(userId) { return Object.values(grants).filter((g) => !g.applied && g.userId === userId); },
    async claimGrant(id) {
      const g = grants[id];
      if (!g || g.applied) return false;
      g.applied = true;
      g.appliedAt = Date.now();
      write();
      return true;
    },
  };
}

async function mongoStore() {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || undefined);
  const profiles = db.collection('profiles');
  const grants = db.collection('grants');
  await Promise.all([
    profiles.createIndex({ wins: -1 }),
    profiles.createIndex({ level: -1 }),
    grants.createIndex({ userId: 1, applied: 1 }),
  ]);
  const strip = (doc) => { if (!doc) return null; const { _id, ...p } = doc; return p; };
  return {
    name: 'mongodb',
    async load(id) { return strip(await profiles.findOne({ _id: id })); },
    async save(list) {
      if (!list.length) return;
      await profiles.bulkWrite(list.map((p) => ({ replaceOne: { filter: { _id: p.userId }, replacement: { _id: p.userId, ...p }, upsert: true } })), { ordered: false });
    },
    async top(field, limit) {
      return (await profiles.find({ [field]: { $gt: 0 } }, { projection: { displayName: 1, [field]: 1 } }).sort({ [field]: -1 }).limit(limit).toArray());
    },
    async addGrant(tx) {
      try {
        await grants.insertOne({ _id: tx.transactionId, ...tx });
        return true;
      } catch (err) {
        if (err?.code === 11000) return false; // same transactionId again (webhook retry)
        throw err;
      }
    },
    async pendingGrants(userId) { return grants.find({ userId, applied: false }).toArray(); },
    // only one pod can win this, so a grant is never applied twice
    async claimGrant(id) {
      const r = await grants.updateOne({ _id: id, applied: false }, { $set: { applied: true, appliedAt: Date.now() } });
      return r.modifiedCount === 1;
    },
    close: () => client.close(),
  };
}

let store = null;

// Call once before the server starts taking players.
export async function initStore() {
  if (store) return store;
  if (MONGODB_URI) {
    try {
      store = await mongoStore();
    } catch (err) {
      console.error('[profiles] MongoDB connection failed, saving to files instead:', err.message);
    }
  }
  store ??= fileStore();
  console.log(`[profiles] saving players to ${store.name}`);
  return store;
}

export const usesSharedStore = () => store?.name === 'mongodb';

// ---------------------------------------------------------------- profiles

export function defaultProfile(userId, displayName) {
  return {
    userId,
    displayName,
    cash: 0,
    totalCash: 0,
    xp: 0,
    level: 1,
    trucks: ['big_blue'],
    truck: 'big_blue',
    hats: [],
    hat: null,
    powers: {},          // engine, accel, nitro, jump -> level
    passes: {},          // x2_xp, x2_cash, nitro, more_hats, vip
    boosts: {},          // name -> expiresAt (ms)
    spins: 0,
    lastSpinAt: 0,
    starterPack: false,
    playtimeClaimed: false,
    races: 0,
    wins: 0,
    finishes: 0,
    potions: 0,
    createdAt: Date.now(),
    guestCopiedFrom: null,
  };
}

export function isGuest(userId) {
  return !String(userId).startsWith('legion_');
}

const isTemp = (userId) => String(userId).startsWith('temp_');

// Loads (or creates) a player's profile into memory. Call before getProfile, e.g. in onAuth.
export async function loadProfile(userId, displayName = 'Player') {
  let p = cache.get(userId);
  if (!p) {
    p = (!isTemp(userId) && (await store.load(userId))) || defaultProfile(userId, displayName);
    p = cache.get(userId) || p; // another join of the same player finished loading first
    cache.set(userId, p);
  }
  if (displayName && p.displayName !== displayName) {
    p.displayName = displayName;
    markDirty();
  }
  return p;
}

// The in-memory profile of a player on this server (loaded by loadProfile).
export function getProfile(userId, displayName) {
  const p = cache.get(userId) || defaultProfile(userId, displayName || 'Player');
  cache.set(userId, p);
  if (displayName && p.displayName !== displayName) p.displayName = displayName;
  return p;
}

// a session started / ended using this profile; when the last one leaves it is saved and dropped
export function holdProfile(userId) {
  refs.set(userId, (refs.get(userId) || 0) + 1);
}
export async function releaseProfile(userId) {
  const n = (refs.get(userId) || 1) - 1;
  if (n > 0) return void refs.set(userId, n);
  refs.delete(userId);
  const p = cache.get(userId);
  if (p && !isTemp(userId)) {
    const saving = store.save([p]).catch((err) => console.error('[profiles] save on leave failed:', err.message));
    leaving.add(saving);
    await saving;
    leaving.delete(saving);
  }
  if (!refs.has(userId)) cache.delete(userId); // unless they joined again meanwhile
}
const leaving = new Set(); // saves of players who just left (waited for on shutdown)

const hasProgress = (p) => (p.totalCash || 0) > 0 || (p.level || 1) > 1 || (p.trucks?.length || 1) > 1;

// Guest progress carry-over when a player signs in: if the account has no progress in this game yet,
// copy the first unused guest save into it - this browser's own guest save (localGuestId) first, then
// the Boxity guest ids from token verify (carriedFrom). A copied save is marked used, so it can never
// go into a second account. An account that already has progress is left untouched.
export async function carryGuestProgress(userId, carriedFrom = [], localGuestId = null) {
  const p = cache.get(userId);
  if (!p || hasProgress(p) || p.guestCopiedFrom) return;
  const candidates = [localGuestId, ...carriedFrom.map((id) => `legion_${id}`)].filter(Boolean);
  for (const id of candidates) {
    const src = cache.get(id) || (await store.load(id));
    if (!src || src.usedForCarry || !hasProgress(src)) continue;
    Object.assign(p, { ...src, userId, displayName: p.displayName, guestCopiedFrom: id, usedForCarry: false });
    src.usedForCarry = true;
    await store.save([p, src]);
    return;
  }
}

export function markDirty() {
  dirty = true;
  if (!saveTimer) saveTimer = setTimeout(() => { flushProfiles(); }, SAVE_EVERY_MS);
}

// Writes the profiles of the players on this server.
export async function flushProfiles() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !store) return;
  dirty = false;
  const list = [...cache.values()].filter((p) => !isTemp(p.userId));
  try {
    await store.save(list);
  } catch (err) {
    dirty = true;
    console.error('[profiles] save failed:', err.message);
  }
}

// ---------------------------------------------------------------- leaderboards (refreshed in the background)

const tops = { wins: [], level: [] };
export async function refreshTop(limit = 9) {
  for (const field of Object.keys(tops)) {
    try {
      tops[field] = (await store.top(field, limit)).map((p) => ({ name: p.displayName, value: p[field] }));
    } catch (err) {
      console.warn('[profiles] leaderboard refresh failed:', err.message);
    }
  }
}
export function topProfiles(field) {
  return tops[field] || [];
}

// profiles of the players on this server (stat reporting)
export function allProfiles() {
  return [...cache.values()];
}

// ---------------------------------------------------------------- Gems purchase grants (idempotent by transactionId)

export async function recordGrant(tx) {
  return store.addGrant({ ...tx, applied: false, receivedAt: Date.now() });
}

export async function pendingGrantsFor(userId) {
  return store.pendingGrants(userId);
}

// true for exactly one caller: the one that should apply the grant
export async function claimGrant(transactionId) {
  return store.claimGrant(transactionId);
}

export async function closeStore() {
  await Promise.all([...leaving]);
  dirty = true;
  await flushProfiles();
  await store?.close?.();
}
