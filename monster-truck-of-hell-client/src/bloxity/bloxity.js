// Single place where the game talks to the Boxity SDK (window.Legion.SDK).
// Everything degrades gracefully when the SDK script is blocked or missing (offline dev).

import { boxityEnv } from './env.js';

const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || 'monster-truck-of-hell';

export const SETTING_DEFAULTS = {
  master_volume: '80',
  music_volume: '80',
  graphics_quality: 'High',
  show_fps: 'false',
  camera_sensitivity: '1',
  enable_chat: 'true',
};

function sdk() {
  return window.Legion?.SDK || null;
}

// The Bloxity base character's picture (what the SDK shows for a default guest avatar).
export const defaultPfp = () => `${boxityEnv().staticUrl}/img/pfps/s0.png?width=128&quality=85&v=2`;
const GUEST_KEY = 'mth_guest_key';
const GUEST_NAMES = ['Shadow', 'Comet', 'Falcon', 'Turbo', 'Blaze', 'Rapid', 'Cosmic', 'Viper', 'Neon', 'Rogue', 'Tiger', 'Hawk'];

// The Bloxity picture of any avatar (built the same way the SDK builds a guest's pfp), so other
// players' faces can be shown from the avatar they send to the room.
const PFP_SLOTS = [['hairId', 'hr'], ['maskId', 'mk'], ['neckId', 'nk'], ['chestId', 'ch'], ['waistId', 'ws'], ['handId', 'hn'], ['shoesId', 'so'], ['pantsId', 'pn'], ['shirtId', 'sh'], ['faceId', 'fc']];
const PROPS = ['height', 'shoulderWidth', 'armLength', 'legOffsetX', 'torsoScaleX', 'neckHeight', 'headScale'];
export function avatarPfpUrl(eq = {}, proportions = {}) {
  const has = (v) => !!v && String(v) !== '-1' && String(v) !== 'undefined';
  const id = (v) => (has(v) ? String(v) : '0');
  let key = `s${id(eq.skinId)}`;
  if (has(eq.hatId)) key += `_h${eq.hatId}`;
  if (has(eq.backId)) key += `_b${eq.backId}`;
  for (const [field, k] of PFP_SLOTS) if (has(eq[field])) key += `_${k}${eq[field]}`;
  const parts = [eq.headId, eq.armLId, eq.armRId, eq.legLId, eq.legRId, eq.torsoId].map(id);
  const p = PROPS.map((k) => Number(proportions?.[k] ?? 1));
  if (parts.some((v) => v !== '0') || p.some((v) => Math.abs(v - 1) > 1e-4)) {
    const n = (v) => { const s = parseFloat(v.toFixed(4)).toString(); return s.includes('.') ? s.replace('.', 'f') : `${s}f0`; };
    key += `_hd${parts[0]}_aL${parts[1]}_aR${parts[2]}_lL${parts[3]}_lR${parts[4]}_to${parts[5]}_p${p.map(n).join('-')}`;
  }
  return `${boxityEnv().staticUrl}/img/pfps/${key}.png?width=128&quality=85&v=2`;
}

// a value kept in localStorage, made once with make() (still works for the session if storage is blocked)
const memory = {};
function stored(key, make) {
  try {
    let v = localStorage.getItem(key);
    if (!v) { v = make(); localStorage.setItem(key, v); }
    return v;
  } catch {
    return (memory[key] ??= make());
  }
}
const localGuestName = () => stored('mth_guest_name', () => `${GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]}${Math.floor(100000 + Math.random() * 900000)}`);

const state = {
  user: null,
  equipped: {},
  proportions: {},
  settings: { ...SETTING_DEFAULTS },
  embedded: false,
};

const listeners = { user: new Set(), avatar: new Set(), settings: new Set(), event: new Set(), chat: new Set() };
const emit = (k, v) => listeners[k].forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });

export const bloxity = {
  get available() { return !!sdk(); },
  get user() { return state.user; },
  get equipped() { return state.equipped; },
  get proportions() { return state.proportions; },
  get settings() { return state.settings; },
  get embedded() { return state.embedded; },

  init() {
    const S = sdk();
    if (!S) {
      console.warn('[bloxity] SDK not loaded – running in offline mode');
      return;
    }
    S.init({ gameSlug: GAME_SLUG });
    state.embedded = !!S.portal?.isEmbeddedInLegion?.();

    // Register features on boot (before assets load).
    try { S.game.registerFeature?.('emotes'); } catch {}

    // Subscribe right after init so the portal handshake is not missed.
    S.auth.onUserChanged((user) => {
      state.user = user || null;
      emit('user', state.user);
      refreshAvatar();
    });
    S.avatar?.onAvatarChanged?.(() => refreshAvatar());
    S.avatar?.onProportionsChanged?.((p) => {
      state.proportions = { ...(p || {}) };
      emit('avatar', { equipped: state.equipped, proportions: state.proportions });
    });

    for (const key of Object.keys(SETTING_DEFAULTS)) {
      S.settings.listen(key, (value) => {
        state.settings = { ...state.settings, [key]: value || SETTING_DEFAULTS[key] };
        emit('settings', state.settings);
      });
    }
    try { S.settings.triggerAll?.(); } catch {}

    S.player?.onEvent?.((event, data) => emit('event', { event, data }));
    S.chat?.onMessage?.((m) => emit('chat', m));

    refreshAvatar();
  },

  onUser(fn) { listeners.user.add(fn); fn(state.user); return () => listeners.user.delete(fn); },
  onAvatar(fn) { listeners.avatar.add(fn); return () => listeners.avatar.delete(fn); },
  onSettings(fn) { listeners.settings.add(fn); fn(state.settings); return () => listeners.settings.delete(fn); },
  onPlayerEvent(fn) { listeners.event.add(fn); return () => listeners.event.delete(fn); },
  onChat(fn) { listeners.chat.add(fn); return () => listeners.chat.delete(fn); },

  // Signed out: the Boxity guest identity (a generated name like "Shadow39" and a picture of the
  // guest's avatar, kept in this browser), or our own stand-in when the SDK is missing.
  guest() {
    if (state.user) return null;
    try {
      const g = sdk()?.auth.getGuest?.();
      if (g?.username) return { name: g.displayName || g.username, pfp: g.pfp || defaultPfp() };
    } catch {}
    return { name: localGuestName(), pfp: defaultPfp() };
  },
  displayName() {
    const u = state.user;
    return u ? u.displayName || u.username : this.guest().name;
  },
  // profile picture for the top-right card
  pfp() {
    const u = state.user;
    return u ? u.pfp || defaultPfp() : this.guest().pfp;
  },
  // A secret id kept in this browser, so a signed-out player's progress is saved on the server and
  // comes back next time (and moves into their account when they sign in).
  guestKey() {
    return stored(GUEST_KEY, () => (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`));
  },
  token() {
    try { return sdk()?.auth.getToken() || null; } catch { return null; }
  },
  login() { return sdk()?.auth.showAuthPopup(); },
  skinTextureUrl() {
    try { return sdk()?.avatar.getSkinTextureUrl?.() || null; } catch { return null; }
  },

  loadingStep(text) { try { sdk()?.game.loadingStep(text); } catch {} },
  loadingEnd() { try { sdk()?.game.loadingEnd(); } catch {} },
  gameplayStart() { try { sdk()?.game.gameplayStart(); } catch {} },
  gameplayEnd() { try { sdk()?.game.gameplayEnd(); } catch {} },
  updateRoom(roomId) { try { sdk()?.game.updateRoom(roomId || ''); } catch {} },
  playerJoined(name) { try { sdk()?.game.playerJoined(name); } catch {} },
  playerInRoom(name) { try { sdk()?.game.playerInRoom?.(name); } catch {} },

  async resolveEndpoint(hostingId) {
    const S = sdk();
    if (!S?.net) throw new Error('Boxity SDK net unavailable');
    const { endpoint } = await S.net.resolveEndpoint(hostingId);
    return endpoint;
  },

  async purchase(sku) {
    const S = sdk();
    if (!S) throw new Error('Gems are only available on Boxity');
    const gems = S.gems || S.bux;
    return gems.requestPurchase(sku);
  },
  // Price + name of a product from the game's Bloxity IAP catalog (the same lookup the payment popup
  // does), or null if the product does not exist. Read-only, no login needed.
  async iap(sku) {
    try {
      const res = await fetch(`${boxityEnv().apiUrl}/v1/games/${encodeURIComponent(GAME_SLUG)}/iaps/${encodeURIComponent(sku)}`);
      if (!res.ok) return null;
      const p = await res.json();
      return typeof p?.price === 'number' ? p : null;
    } catch {
      return null;
    }
  },
  async gemsBalance() {
    try { return await (sdk()?.gems || sdk()?.bux)?.getBalance(); } catch { return null; }
  },

  async friends() {
    try { return (await sdk()?.social.getFriends()) || []; } catch { return []; }
  },
  // Boxity sends the friend a game invite into our room (call updateRoom with the room first, so
  // they land in the same room). Resolves true when the invite went out.
  async inviteFriend(userId, roomId) {
    try {
      if (roomId) sdk()?.game.updateRoom(roomId);
      return !!(await sdk()?.social.inviteFriend(userId));
    } catch (err) {
      console.warn('[bloxity] invite failed:', err?.message || err);
      return false;
    }
  },
  // shareable link into our room (opens the game with ?roomId=, which joins that room)
  inviteLink(roomId) {
    try { return sdk()?.social.getInviteFriendsLink(roomId ? { roomId } : undefined) || location.href; } catch { return location.href; }
  },

  // Boxity death screen (docs "Death screen"): Boxity shows ads round the edges and runs a countdown
  // (at least 4 s) while the game's own Respawn button waits for 0. Outside Boxity the countdown is 0
  // at once and respawn() is true, so the same code path works everywhere.
  deathShow() {
    try {
      const d = sdk()?.deathScreen?.show();
      if (d) return d;
    } catch {}
    return { onCountdown(cb) { cb(0); return () => {}; }, respawn: () => true };
  },
  deathHide() { try { sdk()?.deathScreen?.hide(); } catch {} },

  showCustomizer() { try { sdk()?.avatar.showCustomizer(); } catch {} },
  showMenu() { try { sdk()?.portal.showMenu(true); } catch {} },

  chatBubbleText(m) {
    try { return sdk()?.chat.bubbleText(m) ?? m.text; } catch { return m.text; }
  },
  chatBubbleSeconds() {
    return sdk()?.chat?.bubbleSeconds ?? 4;
  },
};

function refreshAvatar() {
  const S = sdk();
  if (!S?.avatar) return;
  try {
    state.equipped = { ...(S.avatar.getEquipped() || {}) };
    state.proportions = { ...(S.avatar.getProportions?.() || {}) };
  } catch {
    state.equipped = {};
  }
  emit('avatar', { equipped: state.equipped, proportions: state.proportions });
}
