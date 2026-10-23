import colyseus from 'colyseus';
import { RaceState, PlayerState } from './schema.js';
import { authenticateClient } from '../auth/legionAuth.js';
import {
  getProfile, loadProfile, holdProfile, releaseProfile, carryGuestProgress, pendingGrantsFor, claimGrant, markDirty, usesSharedStore,
} from '../game/profiles.js';
import {
  ensureProfile, addCash, addXp, buyTruck, equipTruck, equipHat, buyPower, spinWheel, claimPlaytime, applyGrant, profileMessage,
} from '../game/economy.js';
import { onGrantRecorded } from '../webhooks/legionWebhook.js';
import {
  MAX_CLIENTS, WORLD, RACE, STAGES, FINISH, POTIONS, POTION_RADIUS, courseLocate, stageAt, checkpoint, truckStats, TRUCK_PHYS,
} from '../shared/gameData.js';

const { Room } = colyseus;

// Players per room; each room's maxClients must equal the hosting seatCap.
const SEAT_CAP = Number(process.env.SEAT_CAP) || MAX_CLIENTS;
const FINISH_DIST = FINISH.start + FINISH.len * 0.78;
const MAX_STEP_AHEAD = 200;     // course progress can only grow this much per update (no teleporting ahead)

export class StartingPlaceRoom extends Room {
  onCreate(options) {
    this.maxClients = SEAT_CAP;
    this.setState(new RaceState());
    this.setPatchRate(50);
    if (options?.mode) this.setMetadata({ mode: options.mode, modeName: options.modeName || options.mode });

    this.sessions = new Map(); // sessionId -> { profile, race state, last move }
    this.state.raceLeft = RACE.seconds;
    this.finishCount = 0;
    this.endedLeft = 0;
    this.lastTick = Date.now();
    this.clock.setInterval(() => this.tick(), 250);

    this.offGrant = onGrantRecorded((userId) => {
      for (const [sid, s] of this.sessions) if (s.profile.userId === userId) this.applyPendingGrants(sid);
    });
    if (usesSharedStore()) {
      this.clock.setInterval(() => { for (const sid of this.sessions.keys()) this.applyPendingGrants(sid); }, 15_000);
    }

    this.onMessage('move', (client, m) => this.handleMove(client, m));
    this.onMessage('avatar', (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !m) return;
      p.avatar = safeJson(m.avatar, 2000);
      p.props = safeJson(m.props, 500);
    });
    this.onMessage('emote', (client, id) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof id !== 'string' || id.length > 40) return;
      p.emote = id;
      p.emoteAt = Date.now();
    });
    this.onMessage('potion', (client, id) => this.handlePotion(client, Number(id)));
    this.onMessage('spin', (client) => this.reply(client, 'spin', spinWheel(this.profileOf(client), this.boostOf(client))));
    this.onMessage('buyTruck', (client, id) => this.truckResult(client, buyTruck(this.profileOf(client), String(id))));
    this.onMessage('equipTruck', (client, id) => this.truckResult(client, equipTruck(this.profileOf(client), String(id))));
    this.onMessage('equipHat', (client, id) => {
      const res = equipHat(this.profileOf(client), id ? String(id) : null);
      const p = this.state.players.get(client.sessionId);
      if (res.ok && p) p.hat = this.profileOf(client).hat || '';
      this.reply(client, 'hat', res);
    });
    this.onMessage('buyPower', (client, id) => this.reply(client, 'power', buyPower(this.profileOf(client), String(id))));
    this.onMessage('claimPlaytime', (client) => {
      const s = this.sessions.get(client.sessionId);
      if (!s) return;
      const res = claimPlaytime(s.profile, s.joinedAt);
      const p = this.state.players.get(client.sessionId);
      if (res.ok && p) p.hat = s.profile.hat || '';
      this.reply(client, 'playtime', res);
    });
    this.onMessage('friends', (client, ids) => {
      const s = this.sessions.get(client.sessionId);
      if (!s || !Array.isArray(ids)) return;
      s.friends = new Set(ids.slice(0, 300).map((x) => `legion_${String(x).replace(/^legion_/, '')}`));
      this.updateFriendBoosts();
    });
    this.onMessage('profile', (client) => this.sendProfile(client));
  }

  async onAuth(client, options) {
    const auth = await authenticateClient(client, options);
    await loadProfile(auth.userId, auth.displayName);
    if (!auth.guest) await carryGuestProgress(auth.userId, auth.carriedFrom, auth.localGuestId);
    return auth;
  }

  onJoin(client, options, auth) {
    const profile = ensureProfile(getProfile(auth.userId, auth.displayName));
    holdProfile(auth.userId);
    this.sessions.set(client.sessionId, {
      profile, joinedAt: Date.now(), lastMoveAt: Date.now(), last: null,
      best: 0, stage: 0, potions: new Set(), finished: false, friends: new Set(), friendBoost: 0,
    });

    const p = new PlayerState();
    p.userId = auth.userId;
    p.name = auth.displayName;
    p.x = WORLD.spawn.x;
    p.z = WORLD.spawn.z;
    p.avatar = safeJson(options?.avatar, 2000);
    p.props = safeJson(options?.props, 500);
    p.truck = profile.truck;
    p.hat = profile.hat || '';
    p.vip = !!profile.passes.vip;
    this.state.players.set(client.sessionId, p);

    this.applyPendingGrants(client.sessionId);
    this.sendProfile(client);
    this.updateFriendBoosts();
  }

  onLeave(client) {
    const s = this.sessions.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    if (s) releaseProfile(s.profile.userId);
    this.updateFriendBoosts();
  }

  onDispose() {
    this.offGrant?.();
  }

  profileOf(client) {
    return this.sessions.get(client.sessionId)?.profile || ensureProfile(getProfile(`temp_${client.sessionId}`));
  }

  boostOf(client) {
    return this.sessions.get(client.sessionId)?.friendBoost || 0;
  }

  sendProfile(client) {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    client.send('profile', profileMessage(s.profile, { joinedAt: s.joinedAt, friendBoost: s.friendBoost }));
  }

  reply(client, type, res) {
    client.send('result', { type, ...res });
    if (res?.ok) this.sendProfile(client);
  }

  truckResult(client, res) {
    const p = this.state.players.get(client.sessionId);
    if (res.ok && p) p.truck = this.profileOf(client).truck;
    this.reply(client, 'truck', res);
  }

  // +10% Cash per Bloxity friend in this server (up to +50%)
  updateFriendBoosts() {
    const ids = new Set([...this.sessions.values()].map((s) => s.profile.userId));
    for (const [sid, s] of this.sessions) {
      let n = 0;
      for (const f of s.friends) if (f !== s.profile.userId && ids.has(f)) n++;
      const boost = Math.min(50, n * 10);
      if (boost !== s.friendBoost) {
        s.friendBoost = boost;
        const c = this.clients.find((x) => x.sessionId === sid);
        if (c) this.sendProfile(c);
      }
    }
  }

  // ---------------------------------------------------------------- race clock
  tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    const st = this.state;
    if (st.racePhase === 'race') {
      st.raceLeft = Math.max(0, st.raceLeft - dt * st.raceMul);
      if (st.raceLeft <= 0) this.endRace();
    } else {
      this.endedLeft -= dt;
      if (this.endedLeft <= 0) {
        st.racePhase = 'race';
        st.raceLeft = RACE.seconds;
        st.raceMul = 1;
        st.raceId += 1;
      }
    }
  }

  endRace() {
    const st = this.state;
    st.racePhase = 'ended';
    st.raceLeft = RACE.seconds;
    st.raceMul = 1;
    this.endedLeft = RACE.endedSeconds;
    this.finishCount = 0;
    for (const [sid, s] of this.sessions) {
      if (s.best > 0) s.profile.races += 1;
      s.best = 0;
      s.stage = 0;
      s.finished = false;
      s.potions.clear();
      const p = st.players.get(sid);
      if (p) p.best = 0;
    }
    markDirty();
    this.broadcast('raceEnded', {});
  }

  // ---------------------------------------------------------------- movement + progress
  handleMove(client, m) {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || !m) return;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const x = num(m.x), y = num(m.y), z = num(m.z);
    if (x === null || y === null || z === null) return;
    const now = Date.now();
    const dt = Math.max(0.03, (now - s.lastMoveAt) / 1000);

    if (s.last && !m.tp) {
      const stats = truckStats({ truck: s.profile.truck, powers: s.profile.powers, passes: s.profile.passes });
      const max = stats.top * TRUCK_PHYS.nitroMul * 1.3 + 40;
      const d = Math.hypot(x - s.last.x, z - s.last.z);
      if (d > max * dt + 6) {
        client.send('correct', s.last);
        return;
      }
    } else if (m.tp && !this.allowedTeleport(s, x, z)) {
      if (s.last) client.send('correct', s.last);
      return;
    }
    s.lastMoveAt = now;
    s.last = { x, y, z };
    p.x = x; p.y = y; p.z = z;
    p.ry = num(m.ry) ?? p.ry;
    p.rx = Math.max(-1, Math.min(1, num(m.rx) ?? 0));
    p.rz = Math.max(-1, Math.min(1, num(m.rz) ?? 0));

    if (this.state.racePhase !== 'race' || s.finished || z > -WORLD.plazaHalf) return;
    const loc = courseLocate(x, z, y);
    if (!loc || loc.side > loc.seg.w / 2 + 8) return;
    if (loc.dist <= s.best || loc.dist - s.best > MAX_STEP_AHEAD) return;
    s.best = loc.dist;
    p.best = s.best;
    const stage = stageAt(s.best);
    while (s.stage < stage) {
      s.stage += 1;
      const cash = addCash(s.profile, RACE.stageCash * (s.stage + 1), s.friendBoost);
      addXp(s.profile, RACE.stageXp);
      client.send('stage', { stage: s.stage, cash });
      this.sendProfile(client);
    }
    if (s.best >= FINISH_DIST) this.finish(client, s, p);
  }

  // respawning to the plaza or to a checkpoint already reached is fine; anything else is not
  allowedTeleport(s, x, z) {
    const H = WORLD.plazaHalf;
    if (Math.abs(x) <= H + 5 && Math.abs(z) <= H + 5) return true;
    for (let i = 0; i <= Math.min(STAGES.length - 1, s.stage); i++) {
      const c = checkpoint(i);
      if (Math.hypot(c.x - x, c.z - z) < 25) return true;
    }
    return false;
  }

  finish(client, s, p) {
    s.finished = true;
    const place = ++this.finishCount;
    const i = Math.min(place - 1, RACE.finishCash.length - 1);
    const cash = addCash(s.profile, RACE.finishCash[i], s.friendBoost);
    const { xp } = addXp(s.profile, RACE.finishXp[i]);
    s.profile.finishes += 1;
    if (place === 1) s.profile.wins += 1;
    markDirty();
    const first = place === 1 && this.state.raceMul === 1;
    if (first) this.state.raceMul = RACE.fastMul;
    this.broadcast('finished', { name: p.name, sessionId: client.sessionId, place, first });
    client.send('victory', { place, cash, xp });
    this.sendProfile(client);
  }

  handlePotion(client, id) {
    const s = this.sessions.get(client.sessionId);
    const po = POTIONS[id];
    if (!s || !po || !s.last || this.state.racePhase !== 'race' || s.potions.has(id)) return;
    if (Math.hypot(s.last.x - po.x, s.last.z - po.z) > POTION_RADIUS + 12) return;
    s.potions.add(id);
    s.profile.potions += 1;
    const cash = addCash(s.profile, RACE.potionCash, s.friendBoost);
    if (s.potions.size === POTIONS.length) s.profile.spins += 1;
    client.send('potion', { id, cash });
    this.sendProfile(client);
  }

  // ---------------------------------------------------------------- Gems purchases
  async applyPendingGrants(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    let grants;
    try {
      grants = await pendingGrantsFor(s.profile.userId);
    } catch (err) {
      return console.warn('[grants] lookup failed:', err.message);
    }
    const client = this.clients.find((c) => c.sessionId === sessionId);
    let applied = 0;
    for (const g of grants) {
      if (!(await claimGrant(g.transactionId))) continue; // another pod already applied it
      const res = applyGrant(s.profile, g.sku);
      applied++;
      if (res?.skip) this.skipStage(sessionId);
      if (res?.text && client) client.send('toast', { text: res.text, kind: 'reward' });
    }
    const p = this.state.players.get(sessionId);
    if (p) { p.truck = s.profile.truck; p.hat = s.profile.hat || ''; p.vip = !!s.profile.passes.vip; }
    if (client && applied) this.sendProfile(client);
  }

  skipStage(sessionId) {
    const s = this.sessions.get(sessionId);
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!s || !client) return;
    const next = Math.min(STAGES.length - 1, stageAt(s.best) + (s.best > 0 ? 1 : 0));
    s.stage = Math.max(s.stage, next);
    s.best = Math.max(s.best, STAGES[next].start);
    const p = this.state.players.get(sessionId);
    if (p) p.best = s.best;
    client.send('skip', { stage: next });
  }
}

function safeJson(v, max) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v ?? {});
    if (s.length > max) return '{}';
    JSON.parse(s);
    return s;
  } catch {
    return '{}';
  }
}
