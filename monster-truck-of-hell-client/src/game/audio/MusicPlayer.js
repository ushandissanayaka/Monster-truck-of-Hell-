// Background music: the songs in a loop. Each plays for 2 minutes, then 5 seconds of silence,
// then the next one. Put your own songs in public/audio/music/track1.mp3 .. track4.mp3; a missing
// file falls back to the built-in synthesized song (songs.js).
// Timing runs on the AudioContext clock, so the music pauses with the context (hidden tab).
import { SONGS, SECTIONS } from './songs.js';

const TRACK_SECONDS = 120;
const GAP_SECONDS = 5;
const FADE_IN = 3;
const FADE_OUT = 4;
const LOOKAHEAD = 0.3;
const fileUrl = (i) => `${import.meta.env.BASE_URL}audio/music/track${i + 1}.mp3`;

export class MusicPlayer {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.index = 0;
    this.track = null;
    this.gain = null;
    this.timer = null;
    this.nextAt = 0;
    this.endAt = 0;
    this.noFile = new Set(); // songs whose mp3 failed to load
  }

  start() {
    if (this.timer) return;
    this.nextAt = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 50);
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.endTrack(0.4);
  }

  tick() {
    const now = this.ctx.currentTime;
    if (this.track) {
      this.track.schedule(Math.min(now + LOOKAHEAD, this.endAt));
      if (now >= this.endAt) {
        this.endTrack(0);
        this.index = (this.index + 1) % SONGS.length;
        this.nextAt = now + GAP_SECONDS;
      }
    } else if (now >= this.nextAt) {
      this.begin(now);
    }
  }

  begin(t) {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + FADE_IN);
    g.gain.setValueAtTime(1, t + TRACK_SECONDS - FADE_OUT);
    g.gain.linearRampToValueAtTime(0, t + TRACK_SECONDS);
    g.connect(this.out);
    this.gain = g;
    this.endAt = t + TRACK_SECONDS;

    const i = this.index;
    if (this.noFile.has(i)) {
      this.track = new SynthTrack(ctx, g, SONGS[i], t);
      return;
    }
    const file = new FileTrack(ctx, g, fileUrl(i), () => {
      this.noFile.add(i);
      if (this.track !== file) return;
      file.stop();
      this.track = new SynthTrack(ctx, g, SONGS[i], ctx.currentTime + 0.05);
    });
    this.track = file;
  }

  endTrack(fade) {
    if (!this.track) return;
    const { track, gain } = this;
    this.track = null;
    this.gain = null;
    if (fade > 0) {
      const t = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + fade);
    }
    setTimeout(() => { track.stop(); gain.disconnect(); }, (fade + 0.5) * 1000);
  }
}

// An mp3 from public/audio/music, looped until its 2 minutes are up.
class FileTrack {
  constructor(ctx, out, url, onFail) {
    this.el = new Audio();
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.addEventListener('error', onFail, { once: true });
    this.el.src = url;
    this.src = ctx.createMediaElementSource(this.el);
    this.src.connect(out);
    this.el.play().catch(() => { /* a bad file also fires 'error' */ });
  }

  schedule() {}

  stop() {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.src.disconnect();
  }
}

// ---------------------------------------------------------------- synthesized songs

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const ARP = [0, 1, 2, 3, 4, 3, 2, 1]; // chord tones going up into the next octave and back
const mod = (n, m) => ((n % m) + m) % m;
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

function degToMidi(root, scale, deg) {
  return root + 12 * Math.floor(deg / 7) + scale[mod(deg, 7)];
}

// "4:2 4:1 r:2 ..." per bar -> eighth-note slots: [{ deg, len } | null] x (8 per bar)
function parseTune(bars) {
  const out = [];
  for (const bar of bars) {
    for (const tok of bar.trim().split(/\s+/)) {
      const [d, n] = tok.split(':');
      const len = Number(n);
      out.push(d === 'r' ? null : { deg: Number(d), len });
      for (let i = 1; i < len; i++) out.push(null);
    }
  }
  return out;
}

// keep a note inside [lo, hi] by moving it in octaves
function fold(midi, lo, hi) {
  while (midi < lo) midi += 12;
  while (midi > hi) midi -= 12;
  return midi;
}

// soft-clip curve for the guitar's overdrive (warm, not fizzy)
function driveCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

// A small soft-rock band with a classic touch: rock drums, bass, overdriven rhythm guitar, piano
// and strings. Verses chug, choruses ring out with strings and the melody on piano.
class SynthTrack {
  constructor(ctx, out, song, startAt) {
    this.ctx = ctx;
    this.out = out;
    this.song = song;
    this.scale = SCALES[song.scale];
    this.startAt = startAt;
    this.step = 0;
    this.sixteenth = 60 / song.bpm / 4;
    this.tunes = { verse: parseTune(song.verseTune), chorus: parseTune(song.chorusTune) };
    this.noise = noiseBuffer(ctx);

    // reverb (a soft hall) and a quiet echo for the melody
    const reverb = ctx.createConvolver();
    reverb.buffer = reverbImpulse(ctx);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.45;
    this.space = ctx.createGain();
    this.space.connect(reverb).connect(reverbOut).connect(out);

    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = this.sixteenth * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.2;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.18;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(echoOut);
    echoOut.connect(out);
    echoOut.connect(this.space);

    // guitar: chords go through one overdrive, then a "speaker" that cuts the fizz
    this.gtr = ctx.createGain();
    const drive = ctx.createWaveShaper();
    drive.curve = driveCurve(18);
    drive.oversample = '2x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 110;
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 2000;
    cab.Q.value = 0.8;
    const gOut = ctx.createGain();
    gOut.gain.value = 0.055;
    this.gtr.connect(drive).connect(hp).connect(cab).connect(gOut);
    gOut.connect(out);
    const gWet = ctx.createGain();
    gWet.gain.value = 0.25;
    gOut.connect(gWet).connect(this.space);

    // lead guitar: its own smoother overdrive, a mid "voice" boost, then echo + reverb
    this.lead = ctx.createGain();
    const lDrive = ctx.createWaveShaper();
    lDrive.curve = driveCurve(9);
    lDrive.oversample = '2x';
    const lHp = ctx.createBiquadFilter();
    lHp.type = 'highpass';
    lHp.frequency.value = 180;
    const lVoice = ctx.createBiquadFilter();
    lVoice.type = 'peaking';
    lVoice.frequency.value = 900;
    lVoice.Q.value = 1;
    lVoice.gain.value = 5;
    const lCab = ctx.createBiquadFilter();
    lCab.type = 'lowpass';
    lCab.frequency.value = 2300;
    const lOut = ctx.createGain();
    lOut.gain.value = 0.05;
    this.lead.connect(lDrive).connect(lHp).connect(lVoice).connect(lCab).connect(lOut);
    lOut.connect(out);
    lOut.connect(this.echo);
    const lWet = ctx.createGain();
    lWet.gain.value = 0.4;
    lOut.connect(lWet).connect(this.space);

    this.nodes = [reverb, reverbOut, this.space, this.echo, fb, echoOut, this.gtr, drive, hp, cab, gOut, gWet,
      this.lead, lDrive, lHp, lVoice, lCab, lOut, lWet];
  }

  schedule(until) {
    for (;;) {
      const t = this.startAt + this.step * this.sixteenth;
      if (t >= until) break;
      this.playStep(this.step, t);
      this.step++;
    }
  }

  stop() {
    for (const n of this.nodes) n.disconnect();
  }

  // how many 16ths until the next hit in a pattern (so notes ring until the next one)
  gap(pattern, s, max = 8) {
    let g = 1;
    while (g < max && pattern[(s + g) % 16] === '.') g++;
    return g;
  }

  playStep(n, t) {
    const S = this.song, s = n % 16, bar = Math.floor(n / 16);
    const sec = SECTIONS[Math.floor(bar / 8) % SECTIONS.length];
    const barIn = bar % 8;
    const prog = sec.chorus ? S.chorus : S.verse;
    const chordDeg = prog[bar % prog.length];
    const root = degToMidi(S.root, this.scale, chordDeg);

    // drums
    if (sec.drums === 'rock') {
      const fill = barIn === 7 && s >= 12;
      if (S.kick[s] === 'x') this.kick(t, 1);
      if (fill) this.snare(t, 0.45 + (s - 12) * 0.15);
      else if (S.snare[s] === 'x') this.snare(t, 1);
      if (S.hat[s] === 'x' && !fill) this.hat(t, s % 4 === 0 ? 1 : 0.6);
      if (sec.crash && barIn === 0 && s === 0) this.crash(t);
    } else if (sec.drums === 'light') {
      if (s === 0 || s === 8) this.kick(t, 0.7);
      if (s % 4 === 2) this.hat(t, 0.5);
    }
    // bass follows the chord root in 8ths
    if (sec.bass && S.bass[s] === 'x') {
      this.bass(t, fold(root - 24, 28, 43), this.sixteenth * this.gap(S.bass, s, 4) * 0.9);
    }
    // rhythm guitar: palm-muted chugs or ringing power chords
    if (sec.guitar === 'mute' && S.mute[s] === 'x') this.guitar(t, fold(root - 24, 40, 51), this.sixteenth * 0.9, true);
    if (sec.guitar === 'open' && S.open[s] === 'x') this.guitar(t, fold(root - 24, 40, 51), this.sixteenth * this.gap(S.open, s, 16), false);
    // strings hold the chord
    if (sec.strings && s === 0) {
      this.strings(t, [0, 2, 4].map((k) => degToMidi(S.root - 12, this.scale, chordDeg + k)), this.sixteenth * 16);
    }
    // piano: rolling arpeggio (the classic touch)
    if (sec.piano === 'arp' && s % 2 === 0) {
      const a = ARP[(s / 2) % ARP.length];
      this.piano(t, degToMidi(S.root, this.scale, chordDeg + [0, 2, 4, 7][a % 4] + 7 * Math.floor(a / 4)), this.sixteenth * 4, 0.55);
    }
    // melody: piano in the verses, lead guitar (doubled softly by strings) in the choruses
    if (sec.tune && s % 2 === 0) {
      const note = this.tunes[sec.tune][barIn * 8 + s / 2];
      if (note) {
        const midi = degToMidi(S.root < 60 ? S.root + 12 : S.root, this.scale, note.deg);
        const dur = note.len * 2 * this.sixteenth;
        if (sec.lead === 'guitar') {
          this.leadGuitar(t, midi, dur);
          this.stringLead(t, midi - 12, dur);
        } else this.piano(t, midi, dur, sec.piano ? 0.8 : 1);
      }
    }
  }

  // ---- building blocks
  env(t, peak, attack, hold, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  }

  osc(type, f, t, end) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(end);
    return o;
  }

  lowpass(f, q = 0.7) {
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = f;
    flt.Q.value = q;
    return flt;
  }

  // dry to the mix plus some reverb
  send(node, wet) {
    node.connect(this.out);
    const w = this.ctx.createGain();
    w.gain.value = wet;
    node.connect(w).connect(this.space);
  }

  noiseHit(t, filterType, f, gain, decay, wet = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = f;
    const g = this.env(t, gain, 0.001, 0, decay);
    src.connect(flt).connect(g);
    this.send(g, wet);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.05);
  }

  // ---- drums
  kick(t, v) {
    const o = this.osc('sine', 130, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    o.connect(this.env(t, 0.34 * v, 0.003, 0.02, 0.26)).connect(this.out);
    this.noiseHit(t, 'lowpass', 1200, 0.03 * v, 0.02); // beater click
  }

  snare(t, v) {
    this.noiseHit(t, 'bandpass', 1700, 0.085 * v, 0.17, 0.55);
    const o = this.osc('triangle', 185, t, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    o.connect(this.env(t, 0.1 * v, 0.001, 0, 0.09)).connect(this.out);
  }

  hat(t, v) {
    this.noiseHit(t, 'bandpass', 5000, 0.009 * v, 0.045, 0.15);
  }

  crash(t) {
    this.noiseHit(t, 'bandpass', 3500, 0.012, 1.4, 0.6);
  }

  // ---- band
  bass(t, midi, dur) {
    const o = this.osc('triangle', freq(midi), t, t + dur + 0.2);
    const sub = this.osc('sine', freq(midi), t, t + dur + 0.2);
    const pick = this.osc('sawtooth', freq(midi), t, t + 0.08); // a little pluck at the start
    const flt = this.lowpass(600);
    const pg = this.env(t, 0.25, 0.002, 0, 0.06);
    pick.connect(pg).connect(flt);
    o.connect(flt);
    sub.connect(flt);
    flt.connect(this.env(t, 0.14, 0.006, dur * 0.6, dur * 0.5)).connect(this.out);
  }

  // power chord (root, fifth, octave), two detuned strings each, into the shared overdrive
  guitar(t, root, dur, muted) {
    const pre = this.lowpass(muted ? 650 : 2600);
    const g = muted ? this.env(t, 0.35, 0.003, 0.02, 0.1) : this.env(t, 0.3, 0.004, Math.max(0.05, dur * 0.75), Math.max(0.15, dur * 0.35));
    pre.connect(g).connect(this.gtr);
    for (const m of [root, root + 7, root + 12]) {
      for (const dt of [-6, 6]) {
        const o = this.osc('sawtooth', freq(m), t, t + dur + 0.4);
        o.detune.value = dt;
        o.connect(pre);
      }
    }
  }

  // piano: a few sine partials, the higher ones dying away first
  piano(t, midi, dur, vel) {
    const f = freq(midi);
    const ring = Math.min(2.4, dur + 1.1);
    const g = this.ctx.createGain();
    g.gain.value = 0.045 * vel;
    this.send(g, 0.45);
    g.connect(this.echo);
    [[1, 1, 1], [2, 0.42, 0.55], [3, 0.16, 0.35], [4, 0.07, 0.25]].forEach(([h, amp, life]) => {
      const o = this.osc('sine', f * h, t, t + ring + 0.1);
      if (h === 2) o.detune.value = 2;
      o.connect(this.env(t, amp, 0.003, 0, ring * life)).connect(g);
    });
  }

  // warm string section: detuned saws, slow bow, gentle filter swell
  strings(t, midis, dur) {
    const flt = this.lowpass(600);
    flt.frequency.setValueAtTime(600, t);
    flt.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
    flt.frequency.linearRampToValueAtTime(800, t + dur + 0.6);
    const g = this.env(t, 0.016, 0.5, dur - 0.8, 0.9);
    flt.connect(g);
    this.send(g, 0.75);
    for (const m of midis) {
      for (const detune of [-10, 0, 10]) {
        const o = this.osc('sawtooth', freq(m), t, t + dur + 0.8);
        o.detune.value = detune;
        o.connect(flt);
      }
    }
  }

  // singing lead guitar note: slides up into the pitch, then vibrato blooms on long notes
  leadGuitar(t, midi, dur) {
    const f = freq(midi);
    const end = t + dur + 0.3;
    const g = this.env(t, 0.5, 0.006, Math.max(0, dur - 0.06), 0.18);
    g.connect(this.lead);
    const lfo = this.osc('sine', 5.8, t, end);
    const vib = this.ctx.createGain();
    vib.gain.setValueAtTime(0, t);
    vib.gain.setValueAtTime(0, t + Math.min(0.25, dur * 0.5));
    vib.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.6, dur));
    lfo.connect(vib);
    for (const dt of [0, 7]) {
      const o = this.osc('sawtooth', f, t, end);
      o.frequency.setValueAtTime(f * 0.944, t); // a semitone below...
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05); // ...sliding up into the note
      o.detune.value = dt;
      vib.connect(o.frequency);
      o.connect(g);
    }
  }

  // violin-like line doubling the chorus melody an octave below
  stringLead(t, midi, dur) {
    const f = freq(midi);
    const o = this.osc('sawtooth', f, t, t + dur + 0.4);
    const lfo = this.osc('sine', 5.5, t, t + dur + 0.4);
    const vib = this.ctx.createGain();
    vib.gain.setValueAtTime(0, t);
    vib.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.3, dur));
    lfo.connect(vib).connect(o.frequency);
    const flt = this.lowpass(1400);
    const g = this.env(t, 0.018, 0.08, Math.max(0, dur - 0.1), 0.3);
    o.connect(flt).connect(g);
    this.send(g, 0.7);
  }
}

const noiseCache = new WeakMap();
export function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

// stereo noise fading out over ~2.5 s: a soft hall
const reverbCache = new WeakMap();
function reverbImpulse(ctx) {
  let b = reverbCache.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 2.5);
    b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    reverbCache.set(ctx, b);
  }
  return b;
}
