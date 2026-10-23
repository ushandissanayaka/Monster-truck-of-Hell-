// Shared game data for Monster Truck of Hell (client + server keep identical copies of this file).
// The race course is written once here as a "turtle path" so the 3D track, the truck physics, the
// race bar and the server's progress checks all come from the same numbers.

export const ROOM_NAME = 'monster_truck_hell';
export const MAX_CLIENTS = 24;

export const WORLD = {
  avatarScale: 0.42,      // the driver sitting in the cab
  plazaHalf: 120,         // spawn plaza: x, z in [-120, 120], top y = 0
  exitHalf: 32,           // opening in the north curb where the course starts
  lavaY: -450,            // the plaza and the course float high above the lava sea
  slabDepth: 14,          // thickness of each floating slab below its lowest top corner
  curbW: 3,
  curbH: 0.8,
  stud: 1.25,             // stud texture size (world units)
  spawn: { x: 0, z: 40 },
};

// ---------------------------------------------------------------- race
export const RACE = {
  seconds: 480,           // 08:00 on the clock
  endedSeconds: 5,        // "Race ended!" pause before the next race
  fastMul: 2,             // the clock runs x2 once somebody finishes
  stageCash: 25,
  stageXp: 20,
  finishCash: [1000, 700, 500, 300],
  finishXp: [300, 220, 160, 120],
  potionCash: 50,
};

// Stage colours of the race bar (left to right), as in the reference.
export const STAGE_COLORS = [
  '#56dbe8', '#6ee87a', '#7b4de2', '#8fe84f', '#e43be2', '#f4c446',
  '#f26c55', '#ee3c6d', '#e2f048', '#c13de6', '#4ee874', '#5c7ff0',
];

// heading 0 = north (-z), positive turns right (towards +x). dy: height change over the segment.
// kind: slab (grey studs + curbs), sand (ramp, no curbs), gap (lava, nothing built).
// props: obstacles placed on the segment ('tires' | 'pushers' | 'barrels').
const PATH = [
  { stage: 0, kind: 'sand', len: 90, dy: -12, w: 60 },
  { stage: 0, kind: 'slab', len: 280, w: 76 },
  { stage: 1, kind: 'slab', turn: 40, len: 300, w: 76, props: 'tires' },
  { stage: 1, kind: 'slab', turn: -40, len: 160, w: 76 },
  { stage: 2, kind: 'sand', len: 40, dy: 6, w: 60 },
  { stage: 2, kind: 'gap', len: 28, dy: -16, w: 60 },
  { stage: 2, kind: 'slab', len: 240, w: 76, props: 'tires' },
  { stage: 3, kind: 'slab', turn: -60, len: 300, w: 76, props: 'barrels' },
  { stage: 4, kind: 'sand', len: 100, dy: 14, w: 60 },
  { stage: 4, kind: 'slab', len: 200, w: 70 },
  { stage: 5, kind: 'slab', turn: 90, len: 260, w: 70, props: 'pushers' },
  { stage: 5, kind: 'slab', turn: 45, len: 200, w: 70 },
  { stage: 6, kind: 'slab', turn: -45, len: 200, w: 46 },
  { stage: 6, kind: 'sand', len: 40, dy: 6, w: 46 },
  { stage: 7, kind: 'gap', len: 28, dy: -14, w: 46 },
  { stage: 7, kind: 'slab', len: 260, w: 76, props: 'tires' },
  { stage: 8, kind: 'slab', turn: -70, len: 300, w: 76, props: 'barrels' },
  { stage: 8, kind: 'slab', turn: 70, len: 200, w: 76 },
  { stage: 9, kind: 'sand', len: 80, dy: -10, w: 60 },
  { stage: 9, kind: 'slab', len: 260, w: 80, props: 'pushers' },
  { stage: 10, kind: 'slab', turn: 50, len: 300, w: 76, props: 'tires' },
  { stage: 10, kind: 'slab', turn: -50, len: 200, w: 76 },
  { stage: 11, kind: 'sand', len: 100, dy: 16, w: 60 },
  { stage: 11, kind: 'slab', len: 220, w: 90, finish: true },
];

function buildCourse() {
  let x = 0, z = -WORLD.plazaHalf, y = 0, head = 0, acc = 0;
  const segs = PATH.map((p, i) => {
    head += ((p.turn || 0) * Math.PI) / 180;
    const dx = Math.sin(head), dz = -Math.cos(head);
    const a = { x, z, y };
    x += dx * p.len; z += dz * p.len; y += p.dy || 0;
    const seg = { ...p, i, head, dx, dz, a, b: { x, z, y }, start: acc };
    acc += p.len;
    return seg;
  });
  // mitre directions at each joint (bisector of the two headings); a gap keeps a square end
  segs.forEach((s, i) => {
    const prev = segs[i - 1], next = segs[i + 1];
    const mitre = (h1, h2) => {
      const h = (h1 + h2) / 2;
      const half = (h2 - h1) / 2;
      return { nx: Math.cos(h), nz: Math.sin(h), k: 1 / Math.max(0.35, Math.cos(half)) };
    };
    s.ma = prev && prev.kind !== 'gap' && s.kind !== 'gap' ? mitre(prev.head, s.head) : mitre(s.head, s.head);
    s.mb = next && next.kind !== 'gap' && s.kind !== 'gap' ? mitre(s.head, next.head) : mitre(s.head, s.head);
  });
  return { segs, length: acc };
}

export const COURSE = buildCourse();
export const STAGES = STAGE_COLORS.map((color, i) => {
  const list = COURSE.segs.filter((s) => s.stage === i);
  const first = list[0], last = list[list.length - 1];
  return { i, color, start: first.start, end: last.start + last.len, first: first.i };
});
export const FINISH = COURSE.segs[COURSE.segs.length - 1];

// The four corners of a segment's top (a: left/right at the start, b: at the end), mitred.
export function segCorners(s, inset = 0) {
  const h = s.w / 2 - inset;
  const pt = (p, m, side) => ({ x: p.x + m.nx * h * m.k * side, z: p.z + m.nz * h * m.k * side, y: p.y });
  return [pt(s.a, s.ma, -1), pt(s.a, s.ma, 1), pt(s.b, s.mb, 1), pt(s.b, s.mb, -1)];
}

// Height of a segment's top under (x, z), or null if outside it.
export function segHeight(s, x, z) {
  if (s.kind === 'gap') return null;
  const c = segCorners(s);
  if (!insideQuad(c, x, z)) return null;
  const t = Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len));
  return s.a.y + (s.b.y - s.a.y) * t;
}

export function insideQuad(c, x, z) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p = c[i], q = c[(i + 1) % 4];
    const cr = (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

// Where on the course a point is: { dist (along the course), seg, side (distance from centre line) }.
// The height difference counts too, so a truck under a higher segment is not placed on it.
export function courseLocate(x, z, y = 0) {
  let best = null;
  for (const s of COURSE.segs) {
    const t = Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len));
    const px = s.a.x + s.dx * s.len * t, pz = s.a.z + s.dz * s.len * t, py = s.a.y + (s.b.y - s.a.y) * t;
    const d = Math.hypot(x - px, z - pz) + Math.abs(y - py) * 0.5;
    if (!best || d < best.d) best = { d, seg: s, dist: s.start + s.len * t, side: Math.hypot(x - px, z - pz) };
  }
  return best;
}

// 0..1 along the course (0 on the spawn plaza)
export function trackProgress(x, z, y = 0) {
  if (Math.abs(x) <= WORLD.plazaHalf && z >= -WORLD.plazaHalf && Math.abs(z) <= WORLD.plazaHalf) return 0;
  const loc = courseLocate(x, z, y);
  if (!loc || loc.side > loc.seg.w) return null;
  return Math.max(0, Math.min(1, loc.dist / COURSE.length));
}

export function stageAt(dist) {
  for (let i = STAGES.length - 1; i >= 0; i--) if (dist >= STAGES[i].start) return i;
  return 0;
}

// Stage checkpoint: a little way into the stage's first segment, facing along it.
export function checkpoint(stage) {
  const s = COURSE.segs[STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))].first];
  const d = Math.min(14, s.len / 3);
  return { x: s.a.x + s.dx * d, z: s.a.z + s.dz * d, y: s.a.y + ((s.b.y - s.a.y) * d) / s.len + 1, ry: Math.atan2(s.dx, s.dz) };
}

// bar position 0..1: every stage has the same width on the bar
export function barProgress(dist) {
  const i = stageAt(dist);
  const st = STAGES[i];
  const within = Math.max(0, Math.min(1, (dist - st.start) / Math.max(1, st.end - st.start)));
  return (i + within) / STAGES.length;
}

// Purple potions along the course (10 per race), at fixed spots.
export const POTIONS = [0.06, 0.15, 0.24, 0.33, 0.42, 0.52, 0.61, 0.7, 0.8, 0.9].map((f, i) => {
  const dist = f * COURSE.length;
  const s = COURSE.segs.find((g) => dist >= g.start && dist < g.start + g.len && g.kind !== 'gap')
    || COURSE.segs.find((g) => g.start + g.len > dist && g.kind !== 'gap');
  const t = Math.max(0.15, Math.min(0.85, (dist - s.start) / s.len));
  const side = ((i % 3) - 1) * s.w * 0.25;
  return {
    id: i,
    x: s.a.x + s.dx * s.len * t - s.dz * side,
    z: s.a.z + s.dz * s.len * t + s.dx * side,
    y: s.a.y + (s.b.y - s.a.y) * t,
  };
});
export const POTION_RADIUS = 7;

// ---------------------------------------------------------------- trucks
// style: pickup | cyber | beast | flower. speed: top speed multiplier.
// how: cash (buy with Cash) | free (claim) | gems (sku) | pack (starter pack) | spin (wheel only)
export const TRUCKS = [
  { id: 'big_blue', name: 'Big Blue', style: 'pickup', body: '#1f5bd6', trim: '#ffffff', rim: '#f2f2f2', speed: 1.0, how: 'free', price: 0 },
  { id: 'flower_power', name: 'Flower Power', style: 'flower', body: '#ff5fb4', trim: '#ffe14d', rim: '#ffffff', speed: 1.08, how: 'free', price: 0, label: 'FREE CAR!' },
  { id: 'gold_rush', name: 'Gold Rush', style: 'pickup', body: '#ffd21a', trim: '#1b1b1b', rim: '#1b1b1b', speed: 1.12, how: 'cash', price: 2500 },
  { id: 'green_goblin', name: 'Green Goblin', style: 'pickup', body: '#5ed23a', trim: '#2a2a2a', rim: '#d9ff4a', speed: 1.2, how: 'cash', price: 10000 },
  { id: 'night_shadow', name: 'Night Shadow', style: 'pickup', body: '#2b2340', trim: '#b04cff', rim: '#b04cff', speed: 1.3, how: 'cash', price: 40000 },
  { id: 'hellfire', name: 'Hellfire', style: 'beast', body: '#e3201b', trim: '#ffb01a', rim: '#ffd21a', speed: 1.35, how: 'pack', price: 0 },
  { id: 'cyber_beast', name: 'Cybertruck', style: 'cyber', body: '#b9bec6', trim: '#2a2d33', rim: '#1fe0ff', speed: 1.4, how: 'gems', sku: 'truck_cyber', label: 'ON SALE' },
  { id: 'jurassic_attack', name: 'Jurassic Attack', style: 'beast', body: '#18b6a0', trim: '#e8ff3a', rim: '#20f0c8', speed: 1.5, how: 'gems', sku: 'truck_jurassic', label: 'ON SALE' },
  { id: 'dragonoid', name: 'Dragonoid', style: 'beast', body: '#c9141e', trim: '#ffd21a', rim: '#ffd21a', speed: 1.65, how: 'gems', sku: 'truck_dragonoid', label: 'LIMITED TIME' },
];
export const truckById = (id) => TRUCKS.find((t) => t.id === id) || TRUCKS[0];

// cosmetic hats sitting on the cab roof
export const HATS = [
  { id: 'propeller', name: 'Propeller Cap', how: 'playtime' },
  { id: 'horns', name: 'Devil Horns', how: 'spin' },
  { id: 'cone', name: 'Traffic Cone', how: 'spin' },
  { id: 'crown', name: 'Golden Crown', how: 'pass' },
  { id: 'halo', name: 'Fire Halo', how: 'pass' },
  { id: 'tophat', name: 'Top Hat', how: 'pass' },
];

// ---------------------------------------------------------------- powers (bought with Cash)
export const POWERS = [
  { id: 'engine', name: 'Engine', desc: '+6% top speed', max: 20, base: 150, color: '#ff5a36' },
  { id: 'accel', name: 'Turbo', desc: '+8% acceleration', max: 20, base: 120, color: '#ffd21a' },
  { id: 'nitro', name: 'Nitro Tank', desc: '+0.3s nitro', max: 15, base: 200, color: '#d84cff' },
  { id: 'jump', name: 'Springs', desc: '+5% jump height', max: 15, base: 100, color: '#3fd0ff' },
];
export const powerCost = (p, lvl) => Math.round(p.base * Math.pow(1.55, lvl));

export const TRUCK_PHYS = {
  topSpeed: 52,
  accel: 30,
  brake: 70,
  coast: 12,
  reverse: 18,
  turn: 2.1,
  jump: 30,
  nitroMul: 1.55,
  nitroSeconds: 2.5,
  nitroRecharge: 9,
};

// Truck handling for a player (truck + powers + passes).
export function truckStats({ truck, powers = {}, passes = {} }) {
  const t = truckById(truck);
  return {
    top: TRUCK_PHYS.topSpeed * t.speed * (1 + 0.06 * (powers.engine || 0)),
    accel: TRUCK_PHYS.accel * (1 + 0.08 * (powers.accel || 0)),
    jump: TRUCK_PHYS.jump * (1 + 0.05 * (powers.jump || 0)),
    nitroSeconds: TRUCK_PHYS.nitroSeconds + 0.3 * (powers.nitro || 0) + (passes.nitro ? 1 : 0),
    nitroRecharge: TRUCK_PHYS.nitroRecharge * (passes.nitro ? 0.5 : 1),
  };
}

// ---------------------------------------------------------------- levels
export const xpForLevel = (level) => 500 * level;

// ---------------------------------------------------------------- wheel (Daily Wheel / Spin!)
export const WHEEL_COOLDOWN_MS = 15 * 60 * 1000;
export const WHEEL_SEGMENTS = [
  { id: 'cash250', label: '+250 Cash', color: '#2f8a3a', icon: 'cash', weight: 26, cash: 250 },
  { id: 'gold_rush', label: 'Gold Rush Truck', color: '#1f86c8', icon: 'truck', weight: 4, truck: 'gold_rush' },
  { id: 'xp500', label: '+500 XP', color: '#a3171c', icon: 'star', weight: 18, xp: 500 },
  { id: 'hat', label: 'Random Hat', color: '#e07812', icon: 'propeller', weight: 8, hat: true },
  { id: 'nitro', label: 'Nitro Refill', color: '#4d5d1c', icon: 'bolt', weight: 16, cash: 100 },
  { id: 'spin', label: '+1 Spin', color: '#178c8c', icon: 'ball', weight: 10, spins: 1 },
  { id: 'cash1000', label: '+1,000 Cash', color: '#1f5f2c', icon: 'cash', weight: 10, cash: 1000 },
  { id: 'x2cash', label: 'x2 Cash 15m', color: '#c62828', icon: 'glove', weight: 8, boost: 'x2_cash' },
];
export const BOOST_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------- Gems products (Bloxity IAP catalog)
export const PASSES = [
  { id: 'x2_xp', sku: 'pass_x2_xp', name: 'x2 XP', desc: 'Earn double XP forever', color: '#ffe01a' },
  { id: 'x2_cash', sku: 'pass_x2_cash', name: 'x2 Cash', desc: 'Earn double Cash forever', color: '#5af01a' },
  { id: 'nitro', sku: 'pass_nitro', name: 'Nitro', desc: 'Longer nitro, recharges 2x faster', color: '#e01ae0' },
  { id: 'more_hats', sku: 'pass_more_hats', name: 'More Hats', desc: 'Unlock Crown, Halo and Top Hat', color: '#1ac8f0' },
  { id: 'vip', sku: 'pass_vip', name: 'VIP', desc: '[VIP] tag, +25% Cash and XP', color: '#ffb81a' },
];
export const CASH_PACKS = [
  { id: 'cash_small', sku: 'cash_small', cash: 5000, name: 'Pile of Cash' },
  { id: 'cash_medium', sku: 'cash_medium', cash: 25000, name: 'Bag of Cash' },
  { id: 'cash_large', sku: 'cash_large', cash: 100000, name: 'Vault of Cash' },
];
export const STARTER_PACK = { sku: 'starter_pack', truck: 'hellfire', cash: 5000 };
export const SKIP_SKU = 'skip_stage';
export const SPINS_SKU = 'spins_3';
export const PLAYTIME_MS = 10 * 60 * 1000;

export function paidSkus() {
  return [
    ...PASSES.map((p) => p.sku), ...CASH_PACKS.map((p) => p.sku), STARTER_PACK.sku, SKIP_SKU, SPINS_SKU,
    ...TRUCKS.filter((t) => t.sku).map((t) => t.sku),
  ];
}

// cash / xp multipliers from passes, boosts and friends
export function cashMul(p, now = Date.now(), friendBoost = 0) {
  let m = 1 + friendBoost / 100;
  if (p.passes?.x2_cash) m *= 2;
  if ((p.boosts?.x2_cash || 0) > now) m *= 2;
  if (p.passes?.vip) m *= 1.25;
  return m;
}
export function xpMul(p, now = Date.now()) {
  let m = 1;
  if (p.passes?.x2_xp) m *= 2;
  if ((p.boosts?.x2_xp || 0) > now) m *= 2;
  if (p.passes?.vip) m *= 1.25;
  return m;
}

export function formatShort(n) {
  n = Math.floor(n || 0);
  if (n < 1000) return String(n);
  const u = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [s, v] of u) if (n >= v) return `${(n / v).toFixed(n / v < 10 ? 1 : 0).replace(/\.0$/, '')}${s}`;
  return String(n);
}

export function mmss(sec) {
  const v = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}
