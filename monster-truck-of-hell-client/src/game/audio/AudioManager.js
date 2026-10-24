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

  // brassy note: a sawtooth through a filter that opens as it is blown, then closes
  brass(freq, dur = 0.3, gain = 0.1, delay = 0) {
    const ctx = this.sfxReady();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = o2.type = 'sawtooth';
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.006;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(Math.min(9000, freq * 6), t + 0.06);
    f.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.setValueAtTime(gain * 0.8, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.master);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
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

  // crossed the finish line: a snare roll, a brass fanfare with a cymbal crash, the crowd cheering and
  // confetti cannons popping
  victory() {
    this.duck(4.5);
    for (let i = 0; i < 14; i++) this.noise(0.06, { filter: 'bandpass', freq: 2200, q: 0.7, gain: 0.05 + i * 0.008, delay: i * 0.045 });
    const fan = [[392, 0.65, 0.16], [523, 0.8, 0.16], [659, 0.95, 0.16], [784, 1.1, 0.3], [659, 1.42, 0.14], [784, 1.58, 0.9]];
    for (const [f, at, d] of fan) { this.brass(f, d, 0.09, at); this.brass(f / 2, d, 0.05, at); }
    this.chord([523, 659, 784, 1046], 1.6, 'triangle', 0.07, 1.58);
    this.noise(2.2, { filter: 'highpass', freq: 4500, gain: 0.16, delay: 0.62 });          // cymbal
    this.tone(70, 0.5, 'sine', 0.4, -30, 0.62);                                            // kick
    this.noise(2.8, { filter: 'bandpass', freq: 1100, q: 0.4, gain: 0.12, delay: 0.7 });   // crowd
    this.noise(2.4, { filter: 'bandpass', freq: 2400, q: 0.6, gain: 0.06, delay: 0.9 });
    for (let i = 0; i < 6; i++) this.noise(0.09, { filter: 'highpass', freq: 1500, gain: 0.3, delay: 0.62 + i * 0.17 + Math.random() * 0.08 });
    this.sparkle(14, 2093, 0.06, 1.6);
  }

  // checkpoint reached: a short bright winning jingle
  checkpoint() {
    this.duck(1.8);
    [523, 659, 784, 1046].forEach((f, i) => this.brass(f, 0.16, 0.08, i * 0.07));
    for (const f of [523, 659, 784, 1046]) this.brass(f, 0.9, 0.05, 0.3);
    this.bell(2093, 1.0, 0.07, 0.3, 2);
    this.noise(0.8, { filter: 'highpass', freq: 6000, gain: 0.07, delay: 0.3 });
    this.sparkle(7, 2093, 0.05, 0.34);
  }

  // speed pad, pink ring or nitro: a pop and a long rushing hiss rising in pitch
  nitro() {
    this.noise(0.07, { filter: 'bandpass', freq: 1600, q: 3, gain: 0.3 });
    this.noise(1.1, { filter: 'highpass', freq: 900, sweepTo: 7000, gain: 0.16 });
    this.noise(0.6, { filter: 'lowpass', freq: 500, gain: 0.18 });
    this.tone(160, 0.7, 'sawtooth', 0.05, 700, 0.03);
  }

  // hit a red hazard: a metal smash, then a sad falling tone
  crash() {
    this.duck(1.5);
    this.noise(0.45, { filter: 'bandpass', freq: 1800, q: 0.8, gain: 0.4 });
    this.noise(0.6, { filter: 'lowpass', freq: 260, gain: 0.45 });
    this.tone(60, 0.4, 'sine', 0.4, -25);
    [740, 1110, 1663, 2490].forEach((f, i) => this.tone(f, 0.35 + i * 0.1, 'square', 0.035, -f * 0.05, i * 0.02));
    this.tone(440, 0.9, 'sawtooth', 0.06, -330, 0.3);
  }

  // falling off the course: a long whistle down...
  fallWhistle() { this.tone(1500, 2.2, 'sine', 0.07, -1250); this.noise(2.2, { filter: 'bandpass', freq: 400, sweepTo: 1600, gain: 0.08 }); }
  // ...and the splash into the lava
  lavaDeath() {
    this.noise(1.3, { filter: 'highpass', freq: 2500, gain: 0.2 });
    this.noise(0.9, { filter: 'lowpass', freq: 180, gain: 0.45 });
    this.tone(55, 0.7, 'sine', 0.35, -20);
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
  // Space bounce: the springs letting go
  jump() {
    this.tone(220, 0.22, 'triangle', 0.14, 520);
    this.tone(110, 0.18, 'sine', 0.12, 80);
    this.noise(0.25, { freq: 500, sweepTo: 2500, gain: 0.06 });
  }
  // flying off a ramp: a rush of air
  launch() {
    this.noise(0.9, { freq: 300, sweepTo: 2600, q: 0.7, gain: 0.16 });
    this.tone(90, 0.5, 'sine', 0.12, 60);
  }
  // a hard landing: a thump of the tyres and a clank of the suspension
  land() {
    this.tone(85, 0.28, 'sine', 0.4, -45);
    this.noise(0.25, { filter: 'lowpass', freq: 320, gain: 0.3 });
    this.tone(1300, 0.06, 'square', 0.035, -300, 0.02);
  }
  // checkpoint lightning: a crack and a rolling rumble
  thunder() {
    this.noise(0.25, { filter: 'highpass', freq: 1800, gain: 0.18 });
    this.noise(1.4, { filter: 'lowpass', freq: 420, sweepTo: 90, gain: 0.22, delay: 0.05 });
    this.bell(1568, 0.5, 0.05, 0.1, 2);
  }

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

  // monster truck V8: a lumpy idle, revving up through four gears with speed (a dip at each shift),
  // growling harder on the throttle; loud enough to be heard over the music and the wind
  engine(on, speed01, racing = false, throttle = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    on = on && this.sfxOn;
    if (!on && !this.eng) return;
    if (!this.eng) {
      const out = ctx.createGain();
      out.gain.value = 0;
      // the cylinders: two detuned saws and a sub square, driven hard into a soft clip
      const a = ctx.createOscillator(), b = ctx.createOscillator(), c = ctx.createOscillator();
      a.type = 'sawtooth';
      b.type = 'sawtooth';
      c.type = 'square';
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      const clip = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3);
      clip.curve = curve;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 1.4;
      // the lope: each firing pulse a little louder than the last, at half the firing rate
      const lope = ctx.createGain();
      lope.gain.value = 0.7;
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.3;
      lfo.connect(lfoDepth).connect(lope.gain);
      a.connect(mix); b.connect(mix); c.connect(mix);
      mix.connect(clip).connect(f).connect(lope).connect(out);
      // exhaust roar: noise around the firing rate, louder on the throttle
      const ns = ctx.createBufferSource();
      ns.buffer = noiseBuffer(ctx);
      ns.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.value = 0;
      ns.connect(nf).connect(ng).connect(out);
      out.connect(this.master);
      for (const o of [a, b, c, lfo, ns]) o.start();
      this.eng = { out, f, a, b, c, lfo, lfoDepth, nf, ng, gear: 0 };
    }
    const t = ctx.currentTime, e = this.eng;
    // gears: speed bands, the revs climbing through each and falling back at the shift
    const GEARS = [0, 0.2, 0.42, 0.68, 1.4];
    let g = 0;
    while (g < GEARS.length - 2 && speed01 > GEARS[g + 1]) g++;
    const k = Math.min(1, (speed01 - GEARS[g]) / (GEARS[g + 1] - GEARS[g]));
    const rpm = racing ? (g === 0 ? 700 : 1600) + k * (g === 0 ? 2600 : 2000) + throttle * 200 : 650 + throttle * 450;
    const shifted = racing && g > e.gear;
    if (shifted) {
      e.out.gain.cancelScheduledValues(t);
      e.out.gain.setTargetAtTime(0.02, t, 0.03);              // the shift: a short lift
    }
    e.gear = g;
    // big-block V8 heard from the cab: pitched an octave under the firing rate, with a sub an octave
    // lower again and a dark filter, so it is a heavy rumble rather than a buzz
    const fire = (rpm / 60) * 2;
    const level = !on ? 0 : racing ? 0.035 + 0.025 * throttle + 0.015 * speed01 : 0.025 + 0.015 * throttle;
    e.out.gain.setTargetAtTime(level, t + (shifted ? 0.08 : 0), 0.12);
    e.a.frequency.setTargetAtTime(fire, t, 0.08);
    e.b.frequency.setTargetAtTime(fire * 1.012, t, 0.08);
    e.c.frequency.setTargetAtTime(fire / 2, t, 0.08);
    e.lfo.frequency.setTargetAtTime(fire / 2, t, 0.08);
    e.lfoDepth.gain.setTargetAtTime(0.4 - 0.25 * Math.min(1, rpm / 4000), t, 0.2);
    e.f.frequency.setTargetAtTime(140 + rpm * 0.09 + throttle * 300, t, 0.1);
    e.nf.frequency.setTargetAtTime(fire * 1.5, t, 0.1);
    e.ng.gain.setTargetAtTime(on ? 0.1 + 0.3 * throttle : 0, t, 0.1);
  }
}

export const audio = new AudioManager();
