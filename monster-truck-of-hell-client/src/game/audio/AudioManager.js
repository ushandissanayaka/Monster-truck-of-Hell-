// Synthesized sound effects (no asset downloads) plus the background music (MusicPlayer).
// Everything follows the Boxity "master_volume" setting, the music also "music_volume";
// the SFX / Music switches in the Settings window turn each part off.
import { MusicPlayer, noiseBuffer } from './MusicPlayer.js';

const MUSIC_LEVEL = 0.32; // music clearly audible but under the effects (the instruments are soft and filtered)
const RARITY_SPARKLES = { Common: 3, Rare: 5, Epic: 7, Legendary: 11 };
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

class AudioManager {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.8;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('mt_settings') || '{}'); } catch { /* private mode */ }
    this.sfxOn = saved.sfx !== false;
    this.musicOn = saved.music !== false;
    this.combo = { n: 0, at: -10 };
    const unlock = () => {
      if (!this.ensure()) return;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // a hidden tab pauses everything (music included) and picks up where it left off
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      this.duckGain = ctx.createGain();
      this.duckGain.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume * MUSIC_LEVEL;
      // soften the music: cut the sharp highs and squash sudden peaks so nothing stings the ears
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 3200;
      tone.Q.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;
      this.musicBus.connect(tone).connect(comp).connect(this.duckGain);
      this.music = new MusicPlayer(ctx, this.musicBus);
      if (this.musicOn) this.music.start();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.8));
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicVolume * MUSIC_LEVEL, this.ctx.currentTime, 0.1);
  }

  setMusicOn(on) {
    this.musicOn = on;
    if (!this.music) return;
    if (on) this.music.start();
    else this.music.stop();
  }

  // lower the music while a fanfare plays
  duck(seconds) {
    if (!this.duckGain) return;
    const g = this.duckGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.3, t, 0.05);
    g.setTargetAtTime(1, t + seconds, 0.5);
  }

  sfxReady() {
    const ctx = this.ensure();
    return ctx && this.volume > 0 && this.sfxOn ? ctx : null;
  }

  tone(freq, dur = 0.12, type = 'sine', gain = 0.25, slide = 0, delay = 0) {
    const ctx = this.sfxReady();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // filtered noise burst; sweepTo moves the filter (whooshes)
  noise(dur, { filter = 'bandpass', freq = 2000, sweepTo = 0, q = 1, gain = 0.1, delay = 0 } = {}) {
    const ctx = this.sfxReady();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.05, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // soft bell / chime: a sine lightly modulated by another sine, bright at the start, then ringing out
  bell(freq, dur = 0.9, gain = 0.1, delay = 0, ratio = 2) {
    const ctx = this.sfxReady();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    depth.gain.setValueAtTime(freq * 1.2, t);
    depth.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.connect(depth).connect(car.frequency);
    car.connect(g).connect(this.master);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  chord(freqs, dur, type, gain, delay = 0) {
    for (const f of freqs) this.tone(f, dur, type, gain, 0, delay);
  }

  sparkle(count, base = 1568, spread = 0.05, delay = 0) {
    for (let i = 0; i < count; i++) {
      const f = base * 2 ** (PENTA[Math.floor(Math.random() * PENTA.length)] / 12);
      this.tone(f, 0.18, 'sine', 0.05, 0, delay + i * spread);
    }
  }

  // ---- UI
  click() { this.tone(900, 0.05, 'square', 0.07); }
  open() { this.tone(520, 0.09, 'triangle', 0.18, 260); this.tone(1040, 0.06, 'sine', 0.05, 0, 0.05); }
  close() { this.tone(600, 0.08, 'triangle', 0.15, -250); }
  tick() { this.tone(1200, 0.03, 'square', 0.05); }
  error() { this.tone(220, 0.12, 'square', 0.08); this.tone(165, 0.2, 'square', 0.08, 0, 0.11); }
  join() { this.tone(784, 0.15, 'sine', 0.08); this.tone(1175, 0.3, 'sine', 0.08, 0, 0.1); }

  // ---- rewards
  coin() {
    this.tone(1320, 0.08, 'square', 0.09);
    this.tone(1760, 0.16, 'square', 0.09, 0, 0.07);
    this.tone(3520, 0.3, 'sine', 0.04, 0, 0.07);
  }

  // passing a wins panel: quick pickups in a row climb in pitch (combo)
  pickup() {
    const ctx = this.sfxReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.combo.n = now - this.combo.at < 1.6 ? Math.min(this.combo.n + 1, 12) : 0;
    this.combo.at = now;
    const f = 880 * 2 ** (this.combo.n / 12);
    this.tone(f, 0.07, 'square', 0.045);
    this.tone(f * 1.5, 0.14, 'square', 0.045, 0, 0.06);
    this.tone(f * 3, 0.3, 'sine', 0.028, 0, 0.06);
  }

  win() {
    this.duck(1.4);
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.18, 0, i * 0.1));
    this.chord([523, 659, 784, 1046], 0.6, 'triangle', 0.08, 0.42);
    this.sparkle(5, 2093, 0.06, 0.42);
  }

  // finished a race in time
  victory() {
    this.duck(3);
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) => this.tone(f, 0.14, 'square', 0.1, 0, i * 0.12));
    this.tone(784, 0.14, 'square', 0.1, 0, 0.6);
    this.chord([523, 659, 784, 1046], 1.2, 'sawtooth', 0.045, 0.78);
    this.chord([523, 659, 784, 1046], 1.2, 'triangle', 0.09, 0.78);
    this.noise(1.4, { filter: 'highpass', freq: 5000, gain: 0.08, delay: 0.78 });
    this.sparkle(10, 2093, 0.07, 0.8);
  }

  hatch(rarity = 'Common') {
    const n = RARITY_SPARKLES[rarity] || 3;
    this.noise(0.08, { freq: 2500, q: 2, gain: 0.25 });
    this.tone(300, 0.2, 'triangle', 0.18, 700, 0.05);
    this.sparkle(n, 1568, 0.06, 0.2);
    if (rarity === 'Epic' || rarity === 'Legendary') this.win();
  }

  rebirth() {
    this.duck(2.5);
    this.tone(150, 0.9, 'sawtooth', 0.07, 1100);
    this.noise(0.9, { freq: 300, sweepTo: 6000, gain: 0.12 });
    this.chord([392, 523, 659, 784], 1.0, 'triangle', 0.1, 0.9);
    this.sparkle(8, 1568, 0.06, 0.9);
  }

  purchase() {
    this.tone(1046, 0.1, 'square', 0.08);
    this.tone(1568, 0.1, 'square', 0.08, 0, 0.08);
    this.tone(2093, 0.5, 'sine', 0.08, 0, 0.16);
    this.noise(0.12, { filter: 'highpass', freq: 6000, gain: 0.08, delay: 0.16 });
    this.win();
  }

  boost() {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.09, 'square', 0.07, 0, i * 0.045));
    this.noise(0.5, { freq: 600, sweepTo: 5000, gain: 0.08 });
  }

  // wheel ticks slowing down to a stop
  wheel(seconds) {
    let t = 0, dt = 0.045;
    while (t < seconds) {
      this.tone(1500, 0.025, 'square', 0.05, 0, t);
      t += dt;
      dt = Math.min(0.45, dt * 1.07);
    }
  }

  // ---- movement
  jump() { this.tone(330, 0.14, 'sine', 0.12, 220); }

  teleport() {
    this.tone(200, 0.5, 'sawtooth', 0.06, 900);
    this.noise(0.6, { freq: 400, sweepTo: 4000, gain: 0.1 });
  }

  // ---- race flow
  clickTime() {
    [988, 1319, 988, 1319].forEach((f, i) => this.tone(f, 0.12, 'square', 0.08, 0, i * 0.13));
  }

  // "Click Time!" button: each tap a little higher
  tap(n) {
    const f = 500 * 2 ** (Math.min(n, 24) / 24);
    this.tone(f, 0.06, 'square', 0.07, f * 0.5);
    this.tone(f * 2, 0.05, 'sine', 0.04);
  }

  // end of Click Time, 5..1: soft marimba notes climbing a pentatonic scale ("get ready")
  getReady(n) {
    const f = { 5: 523, 4: 587, 3: 659, 2: 784, 1: 880 }[n] || 659;
    this.bell(f, 0.45, 0.09, 0, 4);
    this.tone(f / 2, 0.25, 'sine', 0.06);
  }

  // race start 3 - 2 - 1: warm chimes climbing C - E - G (music pulled down so they ring clearly)
  countdown(n) {
    this.duck(4);
    const f = { 3: 523, 2: 659, 1: 784 }[n] || 659;
    this.bell(f, 1.1, 0.14);
    this.bell(f * 2, 0.8, 0.04, 0.01, 3);
    this.tone(f / 2, 0.5, 'sine', 0.08);
  }

  // GO: a bright rolled C major chord with a soft whoosh and sparkles on top
  go() {
    [1047, 1319, 1568, 2093].forEach((f, i) => this.bell(f, 1.4, 0.09, i * 0.045));
    this.chord([262, 523, 659, 784], 1.0, 'triangle', 0.06, 0.02);
    this.noise(0.7, { freq: 400, sweepTo: 3000, gain: 0.05 });
    this.sparkle(6, 2093, 0.05, 0.2);
  }

  // race's last 10 seconds: a gentle clock tick
  lastSeconds() { this.bell(1175, 0.25, 0.06, 0, 3); }
  timeUp() { [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.16, 'square', 0.08, 0, i * 0.12)); }

  // racing on the track: wind rushing past, louder and brighter the faster the bike goes, with slow
  // gusts that drift between the ears
  wind(on, speed01) {
    const ctx = this.ctx;
    if (!ctx) return;
    on = on && this.sfxOn;
    if (!on && !this.windFx) return;
    if (!this.windFx) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.5;
      const soft = ctx.createBiquadFilter(); // keep it a deep, heavy rush rather than a hiss
      soft.type = 'lowpass';
      soft.frequency.value = 1300;
      const gust = ctx.createGain(); // slow swells
      gust.gain.value = 0.75;
      const gustLfo = ctx.createOscillator();
      gustLfo.frequency.value = 0.35;
      const gustDepth = ctx.createGain();
      gustDepth.gain.value = 0.25;
      gustLfo.connect(gustDepth).connect(gust.gain);
      const out = ctx.createGain();
      out.gain.value = 0;
      src.connect(band).connect(soft).connect(gust).connect(out);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        const panLfo = ctx.createOscillator();
        panLfo.frequency.value = 0.17;
        const panDepth = ctx.createGain();
        panDepth.gain.value = 0.35;
        panLfo.connect(panDepth).connect(pan.pan);
        out.connect(pan).connect(this.master);
        panLfo.start();
      } else out.connect(this.master);
      src.start();
      gustLfo.start();
      this.windFx = { out, band };
    }
    const t = ctx.currentTime, w = this.windFx;
    w.out.gain.setTargetAtTime(on ? 0.03 + 0.11 * speed01 ** 1.2 : 0, t, on ? 0.3 : 0.5);
    w.band.frequency.setTargetAtTime(160 + 650 * speed01, t, 0.3);
  }

  // motorcycle: a soft purr that rises with speed while moving; on the race track it is fuller so it
  // can be heard over the music and the wind
  engine(on, speed01, racing = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    on = on && this.sfxOn;
    if (!on && !this.eng) return;
    if (!this.eng) {
      const out = ctx.createGain();
      out.gain.value = 0;
      const trem = ctx.createGain(); // the "putt-putt" wobble
      trem.gain.value = 0.75;
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.25;
      lfo.connect(lfoDepth).connect(trem.gain);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      const a = ctx.createOscillator(), b = ctx.createOscillator();
      a.type = 'triangle';
      b.type = 'sine';
      a.connect(f);
      b.connect(f);
      f.connect(trem).connect(out).connect(this.master);
      a.start();
      b.start();
      lfo.start();
      this.eng = { out, f, a, b, lfo };
    }
    const t = ctx.currentTime, e = this.eng;
    const hz = 55 + (racing ? 95 : 70) * speed01;
    const level = racing ? 0.035 + 0.045 * speed01 : 0.012 + 0.02 * speed01;
    e.out.gain.setTargetAtTime(on ? level : 0, t, 0.2);
    e.a.frequency.setTargetAtTime(hz, t, 0.2);
    e.b.frequency.setTargetAtTime(hz * 0.5, t, 0.2);
    e.lfo.frequency.setTargetAtTime(14 + 30 * speed01, t, 0.2);
    e.f.frequency.setTargetAtTime((racing ? 300 : 220) + (racing ? 800 : 500) * speed01, t, 0.2);
  }
}

export const audio = new AudioManager();
