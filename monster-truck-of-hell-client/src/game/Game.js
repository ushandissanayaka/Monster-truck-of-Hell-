import * as THREE from 'three';
import { bloxity, avatarPfpUrl } from '../bloxity/bloxity.js';
import { loadEmotes } from '../bloxity/emotes.js';
import { connect } from '../net/connection.js';
import { store, toast, openModal, closeModal, notice, centerText, playTransition, showVictory } from '../ui/store.js';
import { audio } from './audio/AudioManager.js';
import { bootProgress, hideBoot } from '../ui/boot.js';
import { loadFonts } from './util/canvasText.js';
import { PhysicsWorld } from './systems/PhysicsWorld.js';
import { InputSystem } from './systems/InputSystem.js';
import { CameraController } from './systems/CameraController.js';
import { InteractionSystem } from './systems/InteractionSystem.js';
import { buildStartingPlace } from './scenes/StartingPlace.js';
import { LocalPlayer, RemotePlayer } from './entities/Player.js';
import { preloadAvatar } from './entities/BloxityAvatar.js';
import {
  WORLD, RACE, STAGES, FINISH, POTIONS, POTION_RADIUS, WHEEL_SEGMENTS, WHEEL_COOLDOWN_MS, SKIP_SKU, PASSES,
  courseLocate, stageAt, barProgress, truckStats, truckById, paidSkus, formatShort,
} from '../shared/gameData.js';

const SEND_HZ = 15;
const FINISH_DIST = FINISH.start + FINISH.len * 0.78;
const ERRORS = {
  no_cash: 'Not enough Cash!', owned: 'You already own this', locked: 'Not unlocked yet', not_yet: 'Not ready yet!',
  max: 'Already maxed out!', claimed: 'Already claimed', gems: 'Buy it with Gems', no_spins: 'No spins left',
};

export class Game {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.remotes = new Map();
    this.room = null;
    this.sendAcc = 0;
    this.fpsAcc = { frames: 0, t: 0 };
    this.disposed = false;
    this.offline = { phase: 'race', left: RACE.seconds, mul: 1 };
    this.best = 0;          // furthest distance along the course this race
    this.raceId = null;
    if (import.meta.env.DEV) window.__game = this;
  }

  async start() {
    const step = (p, text) => {
      store.setState({ loadingText: `${text}...` });
      bootProgress(p, text);
      bloxity.loadingStep(text);
    };
    store.setState({ loading: true, touch: matchMedia('(pointer: coarse)').matches, joinedAt: Date.now() });
    step(0.1, 'Loading fonts');
    await loadFonts();

    this.setupRenderer();
    step(0.35, 'Heating up the lava');
    this.physics = new PhysicsWorld();
    this.world = buildStartingPlace(this.scene, this.physics, this.renderer, bloxity.settings.graphics_quality);
    this.registerInteractions();

    step(0.6, 'Loading your driver');
    await Promise.race([preloadAvatar(), new Promise((r) => setTimeout(r, 8000))]);
    loadEmotes();

    const s = store.getState();
    this.player = new LocalPlayer({
      name: bloxity.displayName(),
      equipped: bloxity.equipped,
      proportions: bloxity.proportions,
      skinUrl: bloxity.skinTextureUrl(),
      truck: s.truck,
      hat: s.hat,
    });
    this.scene.add(this.player.root);
    this.player.respawn();
    this.applyStats();

    this.input = new InputSystem();
    this.cam = new CameraController(this.camera, this.renderer.domElement);
    this.cam.distance = this.cam.targetDistance = 30;
    this.cam.pitch = 0.3;
    this.cam.yaw = 0;
    this.cam.min = 12;
    this.cam.max = 110;
    this.cam.focus.copy(this.player.body.pos).add(new THREE.Vector3(0, 6, 0));
    if (import.meta.env.DEV) this.applyDebugView();
    this.input.onKey((code) => {
      if (store.getState().modal) return;
      if (code === 'KeyE') this.interaction.trigger();
      if (code === 'KeyQ') this.actions.nitro();
    });

    this.wireBloxity();
    this.onPad = (e) => toast(`🎮 ${e.type === 'gamepadconnected' ? 'Controller connected' : 'Controller disconnected'}`, 'info');
    window.addEventListener('gamepadconnected', this.onPad);
    window.addEventListener('gamepaddisconnected', this.onPad);

    step(0.85, 'Starting the engines');
    this.loop();
    this.connectNetwork();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    store.setState({ loading: false });
    hideBoot();
    bloxity.loadingEnd();
    this.loadPrices();
    bloxity.gameplayStart();
  }

  // dev only: ?cam=yaw,pitch,distance&pos=x,z&modal=shop to frame screenshots
  applyDebugView() {
    const q = new URLSearchParams(location.search);
    const cam = q.get('cam')?.split(',').map(Number);
    const pos = q.get('pos')?.split(',').map(Number);
    const ry = q.get('ry');
    if (pos?.length >= 2) {
      this.player.place(pos[0], pos[2] ?? 2, pos[1], ry != null ? Number(ry) : this.player.ry);
      this.cam.focus.copy(this.player.body.pos);
    }
    if (q.get('stage')) this.player.toCheckpoint(Number(q.get('stage')));
    if (cam?.length === 3) {
      [this.cam.yaw, this.cam.pitch, this.cam.distance] = cam;
      this.cam.targetDistance = cam[2];
      this.cam.max = Math.max(this.cam.max, cam[2]);
      this.debugCam = true;
    }
    if (q.get('drive')) this.input.joy.set(Number(q.get('steer') || 0), 1);
    const modal = q.get('modal');
    if (modal) setTimeout(() => openModal(modal, q.get('data')), 500);
  }

  setupRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = bloxity.settings.graphics_quality !== 'Low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.applyQuality(bloxity.settings.graphics_quality);
    this.container.appendChild(r.domElement);
    r.domElement.className = 'game-canvas';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.5, 9000);
    this.interaction = new InteractionSystem(store);

    this.onResize = () => {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      r.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    };
    this.onResize();
    this.resizeObs = new ResizeObserver(this.onResize);
    this.resizeObs.observe(this.container);
  }

  applyQuality(q) {
    const ratio = { Low: 0.75, Medium: 1, High: 1.5, Ultra: 2 }[q] ?? 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ratio));
    this.renderer.shadowMap.enabled = q !== 'Low';
  }

  wireBloxity() {
    bloxity.onUser(() => {
      store.setState({ user: bloxity.user });
      this.updateMe();
      this.player.setName(bloxity.displayName(), !!store.getState().passes?.vip);
      if (this.room && this.lastToken !== bloxity.token()) this.reconnect();
      if (bloxity.user) bloxity.gemsBalance().then((b) => store.setState({ gems: typeof b === 'number' ? b : b?.balance ?? null }));
      else store.setState({ gems: 0 });
    });
    bloxity.onAvatar(({ equipped, proportions }) => {
      this.updateMe();
      this.player.avatar.setEquipped(equipped, bloxity.skinTextureUrl());
      this.player.avatar.setProportions(proportions);
      this.room?.send('avatar', { avatar: JSON.stringify(equipped), props: JSON.stringify(proportions) });
    });
    bloxity.onSettings((s) => {
      audio.setVolume(Number(s.master_volume) / 100);
      audio.setMusicVolume(Number(s.music_volume) / 100);
      if (this.renderer) this.applyQuality(s.graphics_quality);
      if (this.cam) this.cam.sensitivity = Number(s.camera_sensitivity) || 1;
      store.setState({ showFps: s.show_fps === 'true' });
    });
    bloxity.onPlayerEvent(({ event, data }) => {
      if (event === 'respawn_request') this.player.respawn();
      if (event === 'play_emote' && typeof data === 'string') this.room?.send('emote', data);
    });
    bloxity.onChat((m) => {
      if (bloxity.settings.enable_chat === 'false') return;
      let root = null;
      if (m.isLocalPlayer) root = this.player.root;
      else {
        const uid = String(m.userId || '').replace(/^legion_/, '');
        for (const [sid, rp] of this.remotes) {
          const st = this.room?.state.players.get(sid);
          if (st && st.userId.replace(/^legion_/, '') === uid) root = rp.root;
        }
      }
      if (!root) return;
      try {
        window.Legion?.SDK?.chat?.attachBubble?.(THREE, root, bloxity.chatBubbleText(m));
      } catch (err) {
        console.warn('[chat] bubble failed', err);
      }
    });
  }

  pfpOf(sid, ps) {
    this.pfps ??= new Map();
    const key = `${ps.avatar}|${ps.props}`;
    const hit = this.pfps.get(sid);
    if (hit?.key === key) return hit.url;
    let eq = {}, pr = {};
    try { eq = JSON.parse(ps.avatar || '{}'); pr = JSON.parse(ps.props || '{}'); } catch {}
    const url = avatarPfpUrl(eq, pr);
    this.pfps.set(sid, { key, url });
    return url;
  }

  updateMe() {
    store.setState({ me: { name: bloxity.displayName(), pfp: bloxity.pfp(), guest: !bloxity.user } });
  }

  // ---------------------------------------------------------------- interactions
  registerInteractions() {
    const p = this.world.parts;
    const I = this.interaction;
    I.add({ id: 'wheel', position: p.wheel.position, radius: 20, height: 28, object: 'Daily Wheel', action: 'Open', onTrigger: () => openModal('wheel'), autoOpen: true, modal: 'wheel' });
    for (const pad of p.pads) {
      const pass = PASSES.find((x) => x.id === pad.id);
      I.add({ id: `pad_${pad.id}`, position: pad.position, radius: 8, height: 12, object: pass.name, action: 'Buy', onTrigger: () => openModal('pass', pad.id), autoOpen: true, modal: 'pass' });
    }
    for (const sh of p.shows) {
      const t = truckById(sh.id);
      I.add({ id: `show_${sh.id}`, position: sh.position, radius: 17, height: 13, object: t.name, action: t.how === 'free' ? 'Claim' : 'Buy', onTrigger: () => openModal('truck', sh.id), autoOpen: true, modal: 'truck' });
    }
  }

  // ---------------------------------------------------------------- networking
  async connectNetwork() {
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('offline')) return;
    this.lastToken = bloxity.token();
    store.setState({ connected: false });
    try {
      const room = await connect({
        token: this.lastToken,
        guestName: bloxity.displayName(),
        guestKey: bloxity.guestKey(),
        avatar: JSON.stringify(bloxity.equipped),
        props: JSON.stringify(bloxity.proportions),
      });
      if (this.disposed) { room.leave(); return; }
      this.attachRoom(room);
    } catch (err) {
      console.warn('[net] playing offline:', err?.message || err);
      store.setState({ connected: false });
    }
  }

  async reconnect() {
    const old = this.room;
    this.room = null;
    this.clearRemotes();
    if (old) {
      old.removeAllListeners?.();
      try { await old.leave(true); } catch {}
    }
    this.connectNetwork();
  }

  clearRemotes() {
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
  }

  attachRoom(room) {
    this.room = room;
    store.setState({ connected: true });
    bloxity.updateRoom(room.roomId);
    let initial = true;
    setTimeout(() => { initial = false; }, 1500);

    room.state.players.onAdd((ps, sid) => {
      if (sid === room.sessionId) return;
      let eq = {}, pr = {};
      try { eq = JSON.parse(ps.avatar || '{}'); pr = JSON.parse(ps.props || '{}'); } catch {}
      const rp = new RemotePlayer({ name: ps.name, equipped: eq, proportions: pr, vip: ps.vip, truck: ps.truck, hat: ps.hat });
      rp.setState(ps);
      rp.avatarJson = ps.avatar;
      rp.propsJson = ps.props;
      this.remotes.set(sid, rp);
      this.scene.add(rp.root);
      if (initial) bloxity.playerInRoom(ps.name);
      else { bloxity.playerJoined(ps.name); toast(`${ps.name} joined`, 'join'); audio.join(); }
      ps.onChange(() => {
        rp.setState(ps);
        if (ps.avatar !== rp.avatarJson || ps.props !== rp.propsJson) {
          rp.avatarJson = ps.avatar;
          rp.propsJson = ps.props;
          try {
            rp.avatar.setEquipped(JSON.parse(ps.avatar || '{}'));
            rp.avatar.setProportions(JSON.parse(ps.props || '{}'));
          } catch {}
        }
      });
    }, true);
    room.state.players.onRemove((_ps, sid) => {
      this.remotes.get(sid)?.dispose();
      this.remotes.delete(sid);
      this.pfps?.delete(sid);
    });

    room.onMessage('profile', (p) => this.onProfile(p));
    room.onMessage('result', (r) => this.onResult(r));
    room.onMessage('toast', (t) => { toast(t.text, t.kind); audio.coin(); });
    room.onMessage('correct', (c) => {
      if (performance.now() - (this.player.respawnAt || -1e9) < 3000) return;
      this.player.teleport(c.x, c.y, c.z);
    });
    room.onMessage('stage', (m) => {
      toast(`Stage ${m.stage + 1}! +${formatShort(m.cash)} Cash`, 'cash');
      audio.coin();
    });
    room.onMessage('potion', (m) => this.onPotion(m.id, m.cash));
    room.onMessage('finished', (m) => {
      if (m.sessionId === room.sessionId) return;
      notice(m.first ? `${m.name} finished the race! x2 speed activated!` : `${m.name} finished the race!`);
    });
    room.onMessage('victory', (v) => this.onVictory(v));
    room.onMessage('raceEnded', () => this.onRaceEnded());
    room.onMessage('skip', (m) => {
      this.player.toCheckpoint(m.stage);
      this.best = Math.max(this.best, STAGES[m.stage].start);
      toast(`Skipped to stage ${m.stage + 1}!`, 'reward');
      audio.teleport();
    });
    // friends in this server give a Cash boost
    bloxity.friends().then((list) => {
      const ids = (list || []).map((f) => String(f._id || f.id || f.userId || '')).filter(Boolean).slice(0, 200);
      if (ids.length) room.send('friends', ids);
    });

    room.onLeave((code) => {
      if (this.room !== room) return;
      this.room = null;
      store.setState({ connected: false });
      this.clearRemotes();
      bloxity.updateRoom('');
      if (code !== 1000 && !this.disposed) setTimeout(() => this.connectNetwork(), 1500);
    });
    room.onError((code, msg) => console.warn('[net] room error', code, msg));
  }

  onProfile(p) {
    const offset = p.now - Date.now();
    const prevLevel = store.getState().level;
    store.setState({
      cash: p.cash, xp: p.xp, level: p.level, trucks: p.trucks, truck: p.truck, hats: p.hats, hat: p.hat,
      powers: p.powers, passes: p.passes, boosts: p.boosts, spins: p.spins, lastSpinAt: p.lastSpinAt,
      starterPack: p.starterPack, playtimeClaimed: p.playtimeClaimed, races: p.races, wins: p.wins,
      friendBoost: p.friendBoost || 0, serverOffset: offset,
      joinedAt: p.joinedAt ? p.joinedAt - offset : store.getState().joinedAt,
    });
    if (this.profiled && p.level > prevLevel) { toast(`Level up! You are now Lvl ${p.level}`, 'reward'); audio.win(); }
    this.profiled = true;
    this.player.setName(bloxity.displayName(), !!p.passes?.vip);
    this.player.setTruck(p.truck);
    this.player.setHat(p.hat);
    this.applyStats();
  }

  applyStats() {
    const s = store.getState();
    this.player.stats = truckStats({ truck: s.truck, powers: s.powers, passes: s.passes });
  }

  onResult(r) {
    switch (r.type) {
      case 'spin':
        if (r.ok) {
          this.world.parts.wheel.spinTo(r.index);
          audio.wheel(4.2);
          store.setState({ modal: { type: 'wheel', data: { spinning: true, index: r.index } } });
          setTimeout(() => {
            toast(`You won: ${r.label}!`, 'reward');
            audio.win();
            store.setState((s) => (s.modal?.type === 'wheel' ? { modal: { type: 'wheel', data: { result: r } } } : {}));
          }, 4400);
        } else toast(r.wait ? `Next free spin in ${fmtWait(r.wait)}` : ERRORS[r.error] || 'Cannot spin', 'error');
        break;
      case 'truck':
        if (r.ok) { toast(r.text || 'Truck equipped!', 'reward'); audio.purchase(); } else toast(ERRORS[r.error] || 'Cannot do that', 'error');
        break;
      case 'power':
        if (r.ok) { toast(`${r.name} upgraded to Lvl ${r.level}!`, 'reward'); audio.boost(); } else toast(ERRORS[r.error] || 'Cannot upgrade', 'error');
        break;
      case 'hat':
        if (!r.ok) toast(ERRORS[r.error] || 'Cannot wear that', 'error');
        break;
      case 'playtime':
        if (r.ok) { toast('Propeller Cap unlocked!', 'reward'); audio.win(); } else toast(ERRORS[r.error] || 'Keep playing!', 'error');
        break;
    }
  }

  // ---------------------------------------------------------------- actions (called by the HUD)
  actions = {
    nitro: () => {
      if (this.player.fireNitro()) { audio.boost(); return true; }
      return false;
    },
    jump: () => this.input.jump(),
    joystick: (x, y) => this.input.joy.set(x, y),
    drift: (on) => { this.input.driftTouch = on; },
    interact: () => this.interaction.trigger(),
    spin: () => {
      if (this.room) return this.room.send('spin');
      const s = store.getState();
      const wait = s.lastSpinAt + WHEEL_COOLDOWN_MS - Date.now();
      if (wait > 0) return toast(`Next free spin in ${fmtWait(wait)}`, 'error');
      store.setState({ lastSpinAt: Date.now() });
      const index = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
      this.onResult({ type: 'spin', ok: true, index, label: WHEEL_SEGMENTS[index].label });
    },
    buyTruck: (id) => {
      const t = truckById(id);
      if (t.how === 'gems') return this.actions.purchase(t.sku);
      this.serverAction('buyTruck', id);
    },
    equipTruck: (id) => this.serverAction('equipTruck', id),
    equipHat: (id) => this.serverAction('equipHat', id),
    buyPower: (id) => this.serverAction('buyPower', id),
    claimPlaytime: () => this.serverAction('claimPlaytime'),
    skip: () => {
      if (this.player.body.pos.z > -WORLD.plazaHalf && !this.room) return;
      this.actions.purchase(SKIP_SKU);
    },
    purchase: async (sku) => {
      if (!bloxity.available) return toast('Purchases work on bloxity.io', 'error');
      if (!bloxity.user) return openModal('signin', { sku });
      if (this.purchasing) return;
      this.purchasing = true;
      try {
        const res = await bloxity.purchase(sku);
        if (res?.success === false) {
          const err = String(res.error || '');
          console.warn(`[gems] purchase of "${sku}" did not go through:`, err);
          return toast(/not found|invalid iap/i.test(err) ? 'This item is not on sale yet' : err && !/cancel/i.test(err) ? err : 'Purchase cancelled', 'error');
        }
        toast('Purchase complete!', 'reward');
        audio.purchase();
        bloxity.gemsBalance().then((b) => store.setState({ gems: typeof b === 'number' ? b : b?.balance ?? null }));
        this.room?.send('profile');
      } catch (err) {
        toast(err?.message || 'Purchase failed', 'error');
      } finally {
        this.purchasing = false;
      }
    },
    respawn: () => this.player.respawn(),
    login: () => bloxity.login(),
    menu: () => bloxity.showMenu(),
    signInAndBuy: async (sku) => {
      closeModal();
      const user = await bloxity.login();
      if (user || bloxity.user) this.actions.purchase(sku);
    },
    setUiHidden: (v) => store.setState({ uiHidden: v }),
  };

  serverAction(type, payload) {
    if (!this.room) return toast('Connect to the server first', 'error');
    this.room.send(type, payload);
  }

  // ---------------------------------------------------------------- frame loop
  loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  update(dt) {
    this.input.update();
    const pl = this.player;
    const modalOpen = !!store.getState().modal;
    pl.update(dt, modalOpen ? NO_INPUT : this.input, this.physics);
    if (pl.jumped) { pl.jumped = false; audio.jump(); }
    if (pl.landed) { pl.landed = false; audio.land?.(); }
    if (pl.fellInLava) this.onLava();
    this.updateRace();

    const focus = this._focus || (this._focus = new THREE.Vector3());
    focus.copy(pl.body.pos);
    focus.y += 6.5;
    const follow = !this.debugCam && Math.abs(pl.speed) > 2 ? { yaw: pl.ry + Math.PI, strength: 1 } : null;
    this.cam.update(dt, focus, this.input.cameraTurn(true), this.input.cameraPitch(), follow);

    const fov = 70 + (pl.nitro > 0 ? 14 : 0) + Math.min(6, Math.abs(pl.speed) / 12);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }

    for (const rp of this.remotes.values()) rp.update(dt);
    this.world.update(dt, this.time, this.camera, pl.body.pos);

    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.interaction.update(pl.body.pos, this.camera, w, h);

    this.sendState(dt);
    this.updateHud(dt);
  }

  // fell into the lava: back to the last stage reached
  onLava() {
    const pl = this.player;
    if (this.sendingHome) return;
    playTransition('');
    audio.teleport();
    const stage = stageAt(this.best);
    if (this.best <= 0) pl.respawn();
    else pl.toCheckpoint(stage);
  }

  // race progress, stages, potions and the finish line (the server checks the same things itself)
  updateRace() {
    const pl = this.player, p = pl.body.pos;
    const s = store.getState();
    if (s.racePhase !== 'race' || s.finished) return;
    if (p.z < -WORLD.plazaHalf) {
      const loc = courseLocate(p.x, p.z, p.y);
      if (loc && loc.side < loc.seg.w / 2 + 6 && pl.body.grounded) {
        // a far jump forward along the course is not progress unless it is the next bit
        if (loc.dist > this.best && loc.dist - this.best < 160) this.best = loc.dist;
      }
    }
    const stage = stageAt(this.best);
    if (stage !== s.stage) store.setState({ stage });
    // potions
    for (const po of POTIONS) {
      if (s.potions.includes(po.id)) continue;
      if (Math.hypot(p.x - po.x, p.z - po.z) < POTION_RADIUS && Math.abs(p.y - po.y) < 8) {
        if (this.room) this.room.send('potion', po.id);
        else this.onPotion(po.id, RACE.potionCash);
        store.setState({ potions: [...s.potions, po.id] });
        this.world.parts.course.setCollected([...s.potions, po.id]);
      }
    }
    if (this.best >= FINISH_DIST && !this.room) {
      store.setState({ finished: true });
      this.onVictory({ place: 1, cash: RACE.finishCash[0], xp: RACE.finishXp[0] });
    }
  }

  onPotion(id, cash) {
    audio.pickup();
    const n = store.getState().potions.length;
    toast(`Potion ${Math.max(n, 1)}/10! +${cash} Cash`, 'cash');
    if (!this.room) store.setState((s) => ({ cash: s.cash + cash }));
  }

  onVictory(v) {
    store.setState({ finished: true });
    showVictory(v);
    audio.victory();
    setTimeout(() => this.sendHome('Back to Spawn'), 3500);
  }

  onRaceEnded() {
    centerText('Race ended!');
    audio.timeUp();
    this.best = 0;
    store.setState({ potions: [], stage: 0, finished: false });
    this.world.parts.course.setCollected([]);
    if (this.player.body.pos.z < -WORLD.plazaHalf + 2) this.sendHome('Race ended!');
  }

  sendHome(text) {
    if (this.disposed || this.sendingHome) return;
    this.sendingHome = true;
    playTransition(text);
    audio.teleport();
    setTimeout(() => {
      this.sendingHome = false;
      if (this.disposed) return;
      this.best = 0;
      store.setState({ stage: 0 });
      this.player.respawn();
      this.input.joy.set(0, 0);
      this.cam.yaw = 0;
    }, 700);
  }

  sendState(dt) {
    if (!this.room) return;
    this.sendAcc += dt;
    if (this.sendAcc < 1 / SEND_HZ) return;
    this.sendAcc = 0;
    const pl = this.player, p = pl.body.pos;
    const k = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}|${pl.ry.toFixed(2)}|${pl.pitch.toFixed(2)}|${pl.roll.toFixed(2)}`;
    if (k === this.lastSent) return;
    this.lastSent = k;
    const tp = pl.teleported;
    pl.teleported = false;
    this.room.send('move', { x: p.x, y: p.y, z: p.z, ry: pl.ry, rx: pl.pitch, rz: pl.roll, tp });
  }

  updateHud(dt) {
    this.hudAcc = (this.hudAcc || 0) + dt;
    this.fpsAcc.frames++;
    this.fpsAcc.t += dt;
    if (this.hudAcc < 0.1) return;
    const step = this.hudAcc;
    this.hudAcc = 0;
    const s = store.getState();

    // race clock
    let phase, left, mul;
    if (this.room) {
      const st = this.room.state;
      phase = st.racePhase; left = st.raceLeft; mul = st.raceMul;
      if (st.raceId !== this.raceId) {
        if (this.raceId != null && phase === 'race') store.setState({ potions: [], finished: false });
        this.raceId = st.raceId;
      }
    } else {
      const o = this.offline;
      o.left -= step * (o.phase === 'race' ? o.mul : 1);
      if (o.left <= 0) {
        if (o.phase === 'race') { o.phase = 'ended'; o.left = RACE.endedSeconds; o.mul = 1; this.onRaceEnded(); } else { o.phase = 'race'; o.left = RACE.seconds; }
      }
      phase = o.phase; left = o.phase === 'race' ? o.left : RACE.seconds; mul = o.mul;
    }

    const pl = this.player;
    const racers = [{ id: 'me', self: true, progress: barProgress(this.best), pfp: s.me?.pfp, name: s.me?.name }];
    if (this.room) {
      this.room.state.players.forEach((ps, sid) => {
        if (sid === this.room.sessionId) return;
        racers.push({ id: sid, self: false, progress: barProgress(ps.best || 0), pfp: this.pfpOf(sid, ps), name: ps.name });
      });
    }
    const patch = {
      racePhase: phase, raceLeft: left, raceMul: mul, racers,
      nitro01: pl.nitroReady01, nitroOn: pl.nitro > 0, drifting: pl.drifting && pl.body.grounded && Math.abs(pl.speed) > 8,
      online: this.room ? Math.max(1, this.room.state.players.size) : 1,
    };
    if (this.fpsAcc.t >= 0.5) {
      patch.fps = Math.round(this.fpsAcc.frames / this.fpsAcc.t);
      this.fpsAcc = { frames: 0, t: 0 };
    }
    store.setState(patch);

    const moving = Math.abs(pl.speed) > 0.5 && !s.modal;
    const speed01 = THREE.MathUtils.clamp(Math.abs(pl.speed) / Math.max(1, pl.stats.top), 0, 1);
    audio.engine(true, Math.max(0.05, speed01), moving);
    audio.wind(moving && speed01 > 0.5, speed01);
  }

  async loadPrices() {
    const found = {};
    await Promise.all(paidSkus().map(async (sku) => {
      const p = await bloxity.iap(sku);
      if (p) found[sku] = p.price;
    }));
    store.setState({ iapPrices: found });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.input?.dispose();
    window.removeEventListener('gamepadconnected', this.onPad);
    window.removeEventListener('gamepaddisconnected', this.onPad);
    this.room?.leave(true);
    bloxity.gameplayEnd();
    audio.engine(false, 0);
    audio.wind(false, 0);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

const NO_INPUT = {
  moveVector: () => new THREE.Vector2(),
  consumeJump: () => false,
  drift: false,
};


function fmtWait(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
