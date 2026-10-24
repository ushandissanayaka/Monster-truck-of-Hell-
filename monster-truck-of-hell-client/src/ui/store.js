// Tiny external store shared by the 3D game (writer) and the React HUD (reader).
import { useSyncExternalStore } from 'react';
import { audio } from '../game/audio/AudioManager.js';

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// Settings window, kept on this device.
const DEFAULT_SETTINGS = { sfx: true, music: true, popup: true };
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('mth_settings') || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}

export const store = createStore({
  loading: true,
  loadingText: 'Loading...',
  user: null,
  me: null,             // { name, pfp, guest }
  connected: false,
  online: 1,
  gems: null,
  // profile (from the server)
  cash: 0,
  xp: 0,
  level: 1,
  trucks: ['big_blue'],
  truck: 'big_blue',
  hats: [],
  hat: null,
  powers: {},
  passes: {},
  boosts: {},
  spins: 0,
  lastSpinAt: 0,
  starterPack: false,
  playtimeClaimed: false,
  races: 0,
  wins: 0,
  serverOffset: 0,
  joinedAt: Date.now(),
  friendBoost: 0,
  // race
  racePhase: 'race',    // race | ended
  raceLeft: 480,        // seconds on the clock
  raceMul: 1,           // x2 once somebody finished
  racers: [],           // [{ id, progress (bar 0..1), pfp, self, name }]
  potions: [],          // potion ids collected this race
  potionBank: 0,        // potions saved up to spend on Rewards
  stage: 0,
  finished: false,
  // driving
  nitro01: 1,           // nitro slot fill (1 = ready)
  nitroOn: false,
  drifting: false,
  // ui
  uiHidden: false,
  modal: null,          // { type, data }
  prompt: null,         // proximity prompt { id, x, y, object, action }
  toasts: [],
  notice: null,         // small line above the XP bar ("X finished the race! x2 speed activated!")
  center: null,         // "Race ended!" in the middle of the screen
  transition: null,     // full-screen wipe { id, text }
  victory: null,        // finish banner { id, place, cash, xp }
  touch: false,
  fps: 0,
  showFps: false,
  settings: loadSettings(),
  iapPrices: {},
});

export function useStore(selector) {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

let toastId = 0;
export function toast(text, kind = 'info') {
  if (kind === 'error') audio.error();
  if (store.getState().settings?.popup === false && kind !== 'error') return;
  const id = ++toastId;
  store.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => store.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
}

let noticeId = 0;
export function notice(text, ms = 5000) {
  const id = ++noticeId;
  store.setState({ notice: { id, text } });
  setTimeout(() => store.setState((s) => (s.notice?.id === id ? { notice: null } : {})), ms);
}

let centerId = 0;
export function centerText(text, color = '#3ff0e0', ms = 3000) {
  const id = ++centerId;
  store.setState({ center: { id, text, color } });
  setTimeout(() => store.setState((s) => (s.center?.id === id ? { center: null } : {})), ms);
}

let transitionId = 0;
export function playTransition(text) {
  const id = ++transitionId;
  store.setState({ transition: { id, text } });
  setTimeout(() => store.setState((s) => (s.transition?.id === id ? { transition: null } : {})), 1600);
}

let victoryId = 0;
export function showVictory(v) {
  const id = ++victoryId;
  store.setState({ victory: { id, ...v } });
  setTimeout(() => store.setState((s) => (s.victory?.id === id ? { victory: null } : {})), 4200);
}

export function openModal(type, data = null) {
  audio.open?.();
  store.setState({ modal: { type, data } });
}

export function closeModal() {
  store.setState({ modal: null });
}
