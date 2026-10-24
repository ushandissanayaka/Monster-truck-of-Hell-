// Shared game data for Monster Truck of Hell (client + server keep identical copies of this file).
// The race course is written once here as a "turtle path" so the 3D track, the truck physics, the
// race bar and the server's progress checks all come from the same numbers.

export const ROOM_NAME = 'monster_truck_hell';
export const MAX_CLIENTS = 24;

export const WORLD = {
  avatarScale: 0.42,      // the driver sitting in the cab
  plazaHalf: 120,         // spawn plaza: x, z in [-120, 120], top y = 0
  exitHalf: 32,           // opening in the north curb where the course starts
  lavaY: -1200,           // the lava sea, a terrifying drop far below the plaza and the course
  fallY: -850,            // a truck falling past this is lost (back to its checkpoint) before it reaches the lava
  slabDepth: 10,          // thickness of each floating slab below its lowest top corner
  curbW: 3,
  curbH: 0.8,
  stud: 1.25,             // stud texture size (world units)
  spawn: { x: 0, z: 40 },
};

// ---------------------------------------------------------------- race
export const RACE = {
  seconds: 600,           // 10:00 on the clock
  endedSeconds: 5,        // "Race ended!" pause before the next race
  fastMul: 2,             // the clock runs x2 once somebody finishes
  stageCash: 25,
  stageXp: 20,
  finishCash: [1000, 1000, 1000, 1000],   // every finisher gets 1k
  finishXp: [300, 220, 160, 120],
  potionCash: 50,
};

// Stage colours of the race bar (left to right), as in the reference.
export const STAGE_COLORS = [
  '#56dbe8', '#6ee87a', '#7b4de2', '#8fe84f', '#e43be2', '#f4c446',
  '#f26c55', '#ee3c6d', '#e2f048', '#c13de6', '#4ee874', '#5c7ff0',
];

// heading 0 = north (-z), positive turns right (towards +x). dy: height change over the segment.
// The course is a chain of separate floating pieces, as in the reference: each piece can start a
// ledge lower than the last (drop), lean (twist: extra height at its [left start, right start, left
// end, right end] corners), be a halfpipe (bank: height of the faceted walls at its sides) or bend
// (curve: a run of short pieces turning a little each).
// kind: road (a slab you drive on) | gap (lava, nothing built).
// style: the road look - sand (teal sides) | pink | checker (light blue) | lilac | orange (diamonds,
//        teal tunnel frames) | mint; bankStyle: another look for the halfpipe walls.
// props: words for what stands on it - 'barriers' low walls along both edges (with gaps) that stop
//        you driving off, 'boost' speed pads (boostColor: orange | cyan | pink), 'rings' pink speed
//        rings floating over the road, 'frames' tunnel arches.
//        Red hazards that send the truck back to its checkpoint on touch: 'walls' tall pillars
//        scattered over the road, 'redwalls' walls across part of the road, left and right in
//        turn, 'sliders' plates sliding side to side, 'spinbars' bars turning on posts, 'fan'
//        blades turning over the road, 'cring' a whole ring standing across the road (jumped
//        through, see ringJump), 'boxspin' boxes on arms turning round a post.
//        'boxtunnel': a big square tunnel, open in places, where fans blow the truck across the road.
//        'roundtunnel': a big round tube round the road.
// curl: extra height at the end of a piece, growing with the square of the way along (a kicker).
// corner: the piece turns a right angle (1 right, -1 left) and gets a wall round the outside.
const PATH = [];
const LONG = 1.3;          // every road piece is this much longer than written below
const road = (stage, o) => PATH.push({ stage, kind: 'road', ...o, len: o.len * LONG });
const gap = (stage, len, dy, w) => PATH.push({ stage, kind: 'gap', len, dy, w });
const jump = (stage, o) => { road(stage, { ...o, len: 32, dy: 7, props: o.props }); gap(stage, 30, -11, o.w); };
// a bend made of short straight pieces
const curve = (stage, deg, len, o) => {
  const n = Math.max(3, Math.round(Math.abs(deg) / 10));
  for (let i = 0; i < n; i++) road(stage, { ...o, turn: deg / n, len: len / n, dy: (o.dy || 0) / n, drop: i === 0 ? o.drop : 0, curve: true });
};
// a short ramp curling up at its end and a gap onto a plate a level higher: the plates climb in steps
const hopUp = (stage, o) => { road(stage, { style: o.style, w: o.w, len: 22, dy: 4, curl: 5, single: true }); gap(stage, 14, -2, o.w); };
// a long steep slope down into a kicker curling up at its foot: the speed from the slope throws the
// truck high over the gap
const bigDrop = (stage, o) => {
  road(stage, { ...o, len: 130, dy: -50, single: true });
  road(stage, { style: o.style, w: o.w, len: 22, curl: 9, single: true });
  gap(stage, 26, -6, o.w);
};
// a kicker curling up into a road with a whole red ring standing on it: driving on hits the ring,
// jumping off the kicker flies through its middle
const ringJump = (stage, o) => {
  road(stage, { style: o.style, w: o.w, len: 22, dy: 2, curl: 5, single: true });
  road(stage, { style: o.style, w: o.w, len: 100, single: true, props: 'cring' });
};
// a long steady slope up
const climb = (stage, o) => road(stage, { ...o, len: 150, dy: 40, single: true });
// a big launch: speed pads into a tall kicker that throws the truck up and forward over a wide gap
// onto a long slope down
const launch = (stage, o) => {
  road(stage, { ...o, len: 70, single: true, props: 'boost' });
  road(stage, { style: o.style, w: o.w, len: 30, curl: 14, single: true });
  gap(stage, 36, -10, o.w);
  road(stage, { style: o.style, w: o.w, len: 140, dy: -30, single: true });
};
// a sharp right-angle corner (dir 1 = right, -1 = left) between barriers, walled round the outside
const turn90 = (stage, dir, o) => {
  road(stage, { ...o, len: 60, single: true, props: 'barriers' });
  road(stage, { ...o, len: 70, turn: dir * 90, single: true, props: 'barriers', corner: dir });
};

// 0: out of the plaza: a narrow sand road onto a wide fan, a straight sand halfpipe and a bend
road(0, { style: 'sand', len: 100, dy: -8, w: 44 });
// a wide plate with a flat wing angled up on each side, and a steep ramp up out of its middle
road(0, { style: 'sand', len: 100, drop: -2, w: 150, bank: 16, bankFlat: true, single: true });
road(0, { style: 'sand', len: 150, dy: 55, w: 50, bank: 10, single: true });
// the top of the slope rolls over a little hump...
road(0, { style: 'sand', len: 24, dy: 4, w: 50, single: true });
road(0, { style: 'sand', len: 24, dy: -3, w: 50, single: true });
// ...and the way splits: jump off to the left or the right, through a pink ring, down two runs of
// four plates each that meet again on the halfpipe (see SPLITS)
PATH.push({ stage: 0, kind: 'gap', len: 180, dy: -18, w: 50, split: true });
road(0, { style: 'sand', len: 260, dy: 6, w: 100, bank: 22, props: 'rings' });
road(0, { style: 'sand', len: 90, w: 80 });
curve(0, -40, 180, { style: 'sand', w: 90, bank: 16, props: 'rings' });
// a run of plates turning left and right in turn
const zig = (stage, n, o) => {
  for (let i = 0; i < n; i++) road(stage, { ...o, turn: (i % 2 ? -1 : 1) * (o.ang || 30) + (o.drift || 0), drop: i === 0 ? o.drop : 0, props: o.props && i % (o.every || 1) === 0 ? o.props : o.base });
};
// a hexagonal tunnel: short single pieces so it bends smoothly
const tunnel = (stage, len, deg, o = {}) => {
  const n = Math.max(2, Math.round(len / 50));
  for (let i = 0; i < n; i++) road(stage, { style: 'lavender', w: 50, bank: 6, single: true, len: len / n, turn: deg / n, dy: (o.dy || 0) / n, props: 'tunnel' + (o.sweep && i % 3 === 1 ? ' sweep' : '') });
};

// 1 and 2 (the first fifth of the race): easy - no red hazards, just big climbs, long slopes down and
// jumps. 1: the green plates: a big climb, a launch, hops up a level at a time and a long drop
road(1, { style: 'grass', turn: 20, len: 120, drop: -3, w: 70, twist: [0, 3, -2, 2] });
climb(1, { style: 'grass', w: 64 });
launch(1, { style: 'grass', w: 64 });
hopUp(1, { style: 'grass', w: 60 });
road(1, { style: 'grass', len: 60, w: 60, single: true });
hopUp(1, { style: 'grass', w: 60 });
zig(1, 6, { style: 'grass', len: 90, w: 64, ang: 28, props: 'boost', every: 3 });
bigDrop(1, { style: 'grass', w: 60, props: 'boost' });
road(1, { style: 'grass', len: 140, w: 80, twist: [0, 0, 3, -3] });
jump(1, { style: 'grass', w: 50 });
road(1, { style: 'grass', len: 120, w: 80, twist: [0, 0, 3, -3] });
// 2: a zigzag, another climb and launch, a right-angle corner, the round tunnel and a long drop
zig(2, 4, { style: 'grass', len: 100, w: 60, ang: 25, props: 'boost', every: 2 });
climb(2, { style: 'sand', w: 60 });
launch(2, { style: 'sand', w: 60 });
turn90(2, 1, { style: 'grass', w: 54 });
road(2, { style: 'grass', len: 170, w: 60, single: true, props: 'roundtunnel' });
bigDrop(2, { style: 'grass', w: 60, props: 'boost' });
road(2, { style: 'grass', len: 140, w: 80 });
jump(2, { style: 'sand', w: 46 });
zig(2, 4, { style: 'grass', len: 100, w: 64, ang: 30, drift: -4, props: 'shortbars', every: 2 });
turn90(2, -1, { style: 'grass', w: 54 });
// 3: wide faceted grass plates, the fan, a turning ring and a long drop
road(3, { style: 'grass', turn: 15, len: 130, w: 110, twist: [0, 5, -3, 3] });
road(3, { style: 'grass', turn: -25, len: 120, w: 70, single: true, props: 'fan' });
zig(3, 5, { style: 'grass', len: 100, w: 70, ang: 32, props: 'shortbars sweep', every: 2 });
ringJump(3, { style: 'grass', w: 66 });
bigDrop(3, { style: 'grass', w: 64, props: 'boost' });
road(3, { style: 'grass', len: 140, w: 80 });
jump(3, { style: 'grass', w: 50 });
// 4: the pink climb: narrow plates between barriers, hops up and the windy box tunnel
road(4, { style: 'pink', len: 200, dy: 10, w: 44, props: 'barriers boost' });
hopUp(4, { style: 'pink', w: 50 });
road(4, { style: 'pink', len: 160, w: 70, single: true, props: 'boxtunnel' });
hopUp(4, { style: 'pink', w: 50 });
road(4, { style: 'pink', len: 90, w: 120, bank: 16, bankFlat: true, single: true });
road(4, { style: 'pink', turn: -30, len: 200, dy: 8, w: 44, props: 'barriers boost' });
road(4, { style: 'pink', turn: 25, len: 160, dy: -6, w: 50, props: 'shortbars' });
// 5: pink V-plates with red blades and turning boxes, and a long drop
road(5, { style: 'pink', len: 100, w: 120, bank: 16, bankFlat: true, single: true, props: 'sweep' });
zig(5, 4, { style: 'pink', len: 110, w: 50, ang: 25, props: 'barriers', every: 1 });
road(5, { style: 'pink', len: 100, w: 120, bank: 16, bankFlat: true, single: true, props: 'boxspin' });
road(5, { style: 'pink', turn: -20, len: 180, dy: -8, w: 46, props: 'barriers boost' });
bigDrop(5, { style: 'pink', w: 54 });
road(5, { style: 'pink', len: 130, w: 60, props: 'sliders' });
jump(5, { style: 'pink', w: 44 });
// 6: lilac diamond plates into the hexagonal tunnel
zig(6, 4, { style: 'lavender', len: 90, w: 70, ang: 35, twist: [0, 3, 0, -3], props: 'boost', every: 2 });
tunnel(6, 400, 30);
road(6, { style: 'lavender', len: 90, w: 70, twist: [3, 0, -3, 0] });
tunnel(6, 350, -40, { sweep: true });
// 7: more tunnel, bending, with red bars inside
tunnel(7, 450, 50, { sweep: true });
road(7, { style: 'lavender', len: 100, w: 80, twist: [0, 4, 0, -2], props: 'boost' });
tunnel(7, 400, -45, { sweep: true, dy: 6 });
jump(7, { style: 'lavender', w: 44 });
// 8: the long blue checker run: short barriers, speed pads and gaps
road(8, { style: 'checker', len: 300, w: 60, props: 'shortbars boost', boostColor: 'cyan' });
gap(8, 22, -4, 60);
road(8, { style: 'checker', turn: 20, len: 160, w: 60, single: true, props: 'sliders' });
turn90(8, 1, { style: 'checker', w: 56 });
road(8, { style: 'checker', len: 90, w: 56, single: true, props: 'redwalls' });
road(8, { style: 'checker', len: 160, w: 70, single: true, props: 'boxtunnel' });
turn90(8, -1, { style: 'checker', w: 56 });
road(8, { style: 'checker', turn: -25, len: 260, w: 56, props: 'boost', boostColor: 'cyan' });
jump(8, { style: 'checker', w: 50 });
// 9: checker with spinning bars, tall walls and the fan
road(9, { style: 'checker', len: 220, w: 64, props: 'sweep shortbars' });
road(9, { style: 'checker', len: 120, w: 64, single: true, props: 'spinbars' });
road(9, { style: 'checker', len: 170, w: 60, single: true, props: 'roundtunnel' });
road(9, { style: 'checker', turn: 30, len: 220, w: 64, props: 'walls boost', boostColor: 'cyan' });
road(9, { style: 'checker', turn: -30, len: 120, w: 66, single: true, props: 'fan' });
gap(9, 22, -4, 60);
road(9, { style: 'checker', len: 200, w: 56, props: 'boost', boostColor: 'cyan' });
// 9b: the light-blue stretch: wide faceted sky-blue plates with green-teal sides, a V-plate, a blue
// halfpipe, a checker run, a kicker and jump, and pink steps up to a green zigzag
road(9, { style: 'sky', turn: 20, len: 120, w: 100, twist: [0, 4, -3, 2] });
road(9, { style: 'sky', len: 90, w: 120, bank: 16, bankFlat: true, single: true, props: 'boost', boostColor: 'cyan' });
road(9, { style: 'sky', turn: -25, len: 200, w: 70, bank: 14, props: 'rings' });
road(9, { style: 'checker', turn: 20, len: 160, w: 60, props: 'shortbars boost', boostColor: 'cyan' });
road(9, { style: 'sky', len: 220, w: 50, bank: 10, props: 'boost', boostColor: 'cyan' });
jump(9, { style: 'sky', w: 46 });
road(9, { style: 'sky', turn: -15, len: 110, w: 90, twist: [3, 0, -2, 3] });
for (let i = 0; i < 6; i++) road(9, { style: 'pink', len: 12, w: 34, drop: 2, single: true });
zig(9, 6, { style: 'grass', len: 90, w: 56, ang: 35, props: 'shortbars', every: 1 });
// 10: the orange diamond plates with purple sides, short barriers and red walls
zig(10, 6, { style: 'orange', len: 110, w: 70, ang: 30, props: 'shortbars walls', every: 2, base: 'shortbars' });
road(10, { style: 'orange', len: 60, w: 70, single: true });
ringJump(10, { style: 'orange', w: 70 });
hopUp(10, { style: 'orange', w: 64 });
road(10, { style: 'orange', len: 160, w: 70, single: true, props: 'boxtunnel' });
hopUp(10, { style: 'orange', w: 64 });
road(10, { style: 'orange', len: 60, w: 64, single: true });
bigDrop(10, { style: 'orange', w: 64, props: 'boost' });
road(10, { style: 'orange', len: 140, w: 80 });
jump(10, { style: 'orange', w: 50 });
// 11: the last orange zigzag, walls, a corner, turning boxes and the finish
zig(11, 5, { style: 'orange', len: 110, w: 70, ang: 28, props: 'walls', every: 2, base: 'shortbars' });
turn90(11, 1, { style: 'orange', w: 56 });
road(11, { style: 'orange', len: 110, w: 90, single: true, props: 'boxspin' });
road(11, { style: 'orange', len: 180, w: 60, props: 'boost sliders' });
PATH.push({ stage: 11, kind: 'road', style: 'orange', len: 220, w: 90, finish: true });

// Long roads are cut into separate plates, as in the reference: each plate rises into a little lip at
// its end and the next one starts lower, past a short gap, so an offroad truck hops from plate to plate.
const PLATE = 70;          // about this long
const PLATE_GAP = 5;
const PLATE_KICK = 2.5;    // lip at the end of a plate / step down to the next
// Each plate of a long road is set a little off the line of the last one (a few degrees left or
// right, its step down a bit deeper or shallower), so a run of plates never lies in one straight row.
const PLATE_WIGGLE = 9;    // degrees
function plates(path) {
  const out = [];
  let seed = 7, carry = 0;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const p of path) {
    const n = p.kind === 'road' && !p.finish && !p.curve && !p.single ? Math.round(p.len / PLATE) : 1;
    if (n < 2) {
      // straighten out what the last plates left over
      out.push(carry && p.kind === 'road' ? { ...p, turn: (p.turn || 0) - carry } : p);
      if (p.kind === 'road') carry = 0;
      continue;
    }
    const len = (p.len - PLATE_GAP * (n - 1)) / n;
    const dy = (p.dy || 0) / n;
    let off = 0;
    for (let k = 0; k < n; k++) {
      const want = k === 0 ? 0 : (k % 2 ? 1 : -1) * PLATE_WIGGLE * (0.6 + rand() * 0.8);
      const step = k === 0 ? 0 : PLATE_KICK * (0.6 + rand() * 1.0);
      const piece = { ...p, len, dy: dy + (k < n - 1 ? PLATE_KICK : 0), drop: k === 0 ? p.drop : -step, plate: k };
      piece.turn = k === 0 ? (p.turn || 0) - carry : want - off;
      if (k === 0) carry = 0;
      off = want;
      out.push(piece);
      if (k < n - 1) out.push({ stage: p.stage, kind: 'gap', len: PLATE_GAP, w: p.w, plateGap: true });
    }
    carry = off;
  }
  return out;
}

function buildCourse(path) {
  let x = 0, z = -WORLD.plazaHalf, y = 0, head = 0, acc = 0;
  const segs = plates(path).map((p, i) => {
    head += ((p.turn || 0) * Math.PI) / 180;
    const dx = Math.sin(head), dz = -Math.cos(head);
    y += p.drop || 0;
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

// The course of the current race and everything worked out from it (see setCourseVariant below).
export let COURSE, SPLITS, CATCHES, STAGES, FINISH, POTIONS;
export let COURSE_VARIANT = -1;

// The two side runs of each split: four plates each, swinging out from the middle line and back in,
// each starting a step lower than the last, two flat and two cupped. They are extra road pieces built
// and driven like course segments (but not on the course line, so progress picks up where they meet).
const SPLIT_PLATES = [
  { t0: 0.0, t1: 0.22, step: -6, bank: 0 },
  { t0: 0.26, t1: 0.48, step: -3, bank: 8 },
  { t0: 0.52, t1: 0.74, step: -4, bank: 8 },
  { t0: 0.78, t1: 1.0, step: -2, bank: 0 },
];
function splitRuns(g) {
  const head = Math.atan2(g.dx, -g.dz);
  const nx = -g.dz, nz = g.dx;              // right of the course
  const off = (t) => 34 * (1 - t) + 14 * t + 26 * Math.sin(Math.PI * t);
  const runs = [];
  for (const side of [-1, 1]) {
    let y = g.a.y;
    const pieces = SPLIT_PLATES.map((p, k) => {
      const pt = (t) => ({ x: g.a.x + g.dx * g.len * t + nx * side * off(t), z: g.a.z + g.dz * g.len * t + nz * side * off(t) });
      const A = pt(p.t0), B = pt(p.t1);
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
      const h = Math.atan2(dx, -dz);
      y += p.step;
      const ya = y;
      // the last plate ends level with where the course carries on
      const yb = k === SPLIT_PLATES.length - 1 ? g.b.y : y - 2 + (k % 2 ? 1 : -1);
      y = yb;
      const m = { nx: Math.cos(h), nz: Math.sin(h), k: 1 };
      return {
        stage: g.stage, kind: 'road', style: 'sand', i: -1, split: side, plate: k, w: 34, len, dx, dz, head: h,
        a: { x: A.x, z: A.z, y: ya }, b: { x: B.x, z: B.z, y: yb }, ma: m, mb: m, bank: p.bank, start: g.start + g.len * p.t0,
      };
    });
    runs.push(pieces);
  }
  void head;
  return runs;
}
const makeSplits = (course) => course.segs.filter((g) => g.split === true).map((g) => ({ gap: g, runs: splitRuns(g) }));

// A catch under each jump gap: a ledge a little lower that a truck falling short lands on, sloping up
// to where the next plate starts, so a missed jump costs time instead of a fall into the lava. Built
// and driven like a course segment (but not on the course line).
const CATCH_DROP = 8;
const makeCatches = (course) => course.segs.filter((g) => g.kind === 'gap' && !g.split && !g.plateGap).map((g) => {
  const prev = course.segs[g.i - 1], next = course.segs[g.i + 1];
  const yb = next ? next.a.y : g.b.y;
  const ya = Math.min(prev ? segTop(prev, 1, 0) : g.a.y, yb) - CATCH_DROP;
  const m = { nx: Math.cos(g.head), nz: Math.sin(g.head), k: 1 };
  return {
    stage: g.stage, kind: 'road', style: next?.style || 'sand', i: -1, catch: true, w: (g.w || 40) * 0.9, len: g.len,
    dx: g.dx, dz: g.dz, head: g.head, a: { x: g.a.x, z: g.a.z, y: ya }, b: { x: g.b.x, z: g.b.z, y: yb }, ma: m, mb: m, start: g.start,
  };
});
const makeStages = (course) => STAGE_COLORS.map((color, i) => {
  const list = course.segs.filter((s) => s.stage === i);
  const first = list[0], last = list[list.length - 1];
  return { i, color, start: first.start, end: last.start + last.len, first: first.i };
});

// The four corners of a segment's top (a: left/right at the start, b: at the end), mitred.
export function segCorners(s, inset = 0) {
  const h = s.w / 2 - inset;
  const pt = (p, m, side) => ({ x: p.x + m.nx * h * m.k * side, z: p.z + m.nz * h * m.k * side, y: p.y });
  return [pt(s.a, s.ma, -1), pt(s.a, s.ma, 1), pt(s.b, s.mb, 1), pt(s.b, s.mb, -1)];
}

// Halfpipe lift of a segment's top at a sideways offset from its centre line.
// bankFlat: flat wings angled up instead of a curved halfpipe wall.
export function bankLift(s, side) {
  if (!s.bank) return 0;
  const k = Math.min(1, Math.max(0, Math.abs(side) / (s.w / 2) - 0.5) / 0.5);
  return s.bank * (s.bankFlat ? k : k * k);
}

// Height of a segment's top at t (0..1 along it) and side (offset from its centre line, + = right):
// its slope, its lean and its halfpipe walls.
export function segTop(s, t, side) {
  let y = s.a.y + (s.b.y - s.a.y) * t + bankLift(s, side) + (s.curl ? s.curl * t * t : 0);
  if (s.twist) {
    const u = Math.max(0, Math.min(1, side / s.w + 0.5));
    const [la, ra, lb, rb] = s.twist;
    y += (la + (ra - la) * u) * (1 - t) + (lb + (rb - lb) * u) * t;
  }
  return y;
}

// t and side of (x, z) on a segment
export function segLocal(s, x, z) {
  return {
    t: Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len)),
    side: (x - s.a.x) * -s.dz + (z - s.a.z) * s.dx,
  };
}

// Height of a segment's top under (x, z), or null if outside it.
export function segHeight(s, x, z) {
  if (s.kind === 'gap') return null;
  const c = segCorners(s);
  if (!insideQuad(c, x, z)) return null;
  const { t, side } = segLocal(s, x, z);
  return segTop(s, t, side);
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
    const px = s.a.x + s.dx * s.len * t, pz = s.a.z + s.dz * s.len * t, py = segTop(s, t, 0);
    const d = Math.hypot(x - px, z - pz) + Math.abs(y - py) * 0.5;
    if (!best || d < best.d) best = { d, seg: s, dist: s.start + s.len * t, side: Math.hypot(x - px, z - pz) };
  }
  // the side runs of a split count as the stretch of course they run beside
  for (const sp of SPLITS) {
    for (const run of sp.runs) {
      for (const s of run) {
        const t = Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len));
        const px = s.a.x + s.dx * s.len * t, pz = s.a.z + s.dz * s.len * t, py = segTop(s, t, 0);
        const d = Math.hypot(x - px, z - pz) + Math.abs(y - py) * 0.5;
        if (d < best.d) best = { d, seg: s, dist: s.start + s.len * t, side: Math.hypot(x - px, z - pz) };
      }
    }
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
  return { x: s.a.x + s.dx * d, z: s.a.z + s.dz * d, y: segTop(s, d / s.len, 0) + 1, ry: Math.atan2(s.dx, s.dz) };
}

// bar position 0..1: every stage has the same width on the bar
export function barProgress(dist) {
  const i = stageAt(dist);
  const st = STAGES[i];
  const within = Math.max(0, Math.min(1, (dist - st.start) / Math.max(1, st.end - st.start)));
  return (i + within) / STAGES.length;
}

// Purple potions along the course (10 per race), at fixed spots.
const makePotions = (course) => [0.06, 0.15, 0.24, 0.33, 0.42, 0.52, 0.61, 0.7, 0.8, 0.9].map((f, i) => {
  const dist = f * course.length;
  const s = course.segs.find((g) => dist >= g.start && dist < g.start + g.len && g.kind !== 'gap')
    || course.segs.find((g) => g.start + g.len > dist && g.kind !== 'gap');
  const t = Math.max(0.15, Math.min(0.85, (dist - s.start) / s.len));
  const side = ((i % 3) - 1) * s.w * 0.25;
  return {
    id: i,
    x: s.a.x + s.dx * s.len * t - s.dz * side,
    z: s.a.z + s.dz * s.len * t + s.dx * side,
    y: segTop(s, t, side),
  };
});
export const POTION_RADIUS = 7;

// ---------------------------------------------------------------- a new course every race
// There are TRACK_COUNT tracks, taken in turn race after race. They all share the opening stage;
// after it, stages 1..11 (each kept whole) run in a different order on each track, renumbered by
// where they now are, with the finish always last. The track comes from the race number
// (variantOfRace), so the server and every player build the same one. An order whose roads would
// cross, run over the spawn plaza or drop too low over the lava is skipped for the next one;
// track 0 is the course as written above.
const OPENING = PATH.filter((p) => p.stage === 0);
const FINISH_PIECE = PATH.find((p) => p.finish);
const BLOCKS = [];
for (const p of PATH) if (p.stage > 0 && !p.finish) (BLOCKS[p.stage - 1] ||= []).push(p);
const LOWEST = -650;       // roads stay well above the fall limit

export const TRACK_COUNT = 5;
export const variantOfRace = (raceId) => (Math.max(1, raceId || 1) - 1) % TRACK_COUNT;

function blockOrder(variant) {
  const order = BLOCKS.map((_, i) => i);
  let seed = (variant * 48271 + 12345) % 2147483647;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function pathFor(order) {
  const out = [...OPENING];
  order.forEach((b, k) => { for (const p of BLOCKS[b]) out.push({ ...p, stage: k + 1 }); });
  out.push({ ...FINISH_PIECE, stage: BLOCKS.length });
  return out;
}

// no road too low, none over the plaza, and no two roads (more than a few pieces apart) crossing
// within 60 of each other's height
function courseOk(course) {
  const roads = course.segs.filter((s) => s.kind !== 'gap');
  if (roads.some((s) => Math.min(s.a.y, s.b.y) < LOWEST)) return false;
  const CELL = 150, grid = new Map();
  const cellsOf = (c, add) => {
    const xs = c.map((p) => p.x), zs = c.map((p) => p.z);
    const out = [];
    for (let gx = Math.floor(Math.min(...xs) / CELL); gx <= Math.floor(Math.max(...xs) / CELL); gx++) {
      for (let gz = Math.floor(Math.min(...zs) / CELL); gz <= Math.floor(Math.max(...zs) / CELL); gz++) out.push(`${gx},${gz}`);
    }
    if (add) for (const k of out) (grid.get(k) || grid.set(k, []).get(k)).push(add);
    return out;
  };
  const quads = roads.map((s) => ({ s, c: segCorners(s) }));
  for (const q of quads) cellsOf(q.c, q);
  const H = WORLD.plazaHalf + 30;
  for (const { s } of quads) {
    for (let t = 0.1; t < 1; t += 0.2) {
      for (const f of [-0.4, 0, 0.4]) {
        const x = s.a.x + s.dx * s.len * t - s.dz * f * s.w, z = s.a.z + s.dz * s.len * t + s.dx * f * s.w;
        if (s.stage > 0 && Math.abs(x) < H && Math.abs(z) < H) return false;
        const y = segTop(s, t, 0);
        for (const o of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
          if (Math.abs(o.s.i - s.i) <= 3 || !insideQuad(o.c, x, z)) continue;
          if (Math.abs(segTop(o.s, segLocal(o.s, x, z).t, 0) - y) < 60) return false;
        }
      }
    }
  }
  return true;
}

// Make the course of a variant (a race) the current one: returns true if it changed. Every module
// reading COURSE, SPLITS, CATCHES, STAGES, FINISH or POTIONS sees it straight away. Built courses are
// kept, so switching back and forth (a server with rooms in different races) costs nothing.
const builtCourses = new Map();
function makeCourseSet(variant) {
  let course = null;
  for (let k = 0; k < 60 && !course; k++) {
    const v = variant === 0 ? -1 : variant * 61 + k;
    const c = buildCourse(pathFor(v < 0 ? BLOCKS.map((_, i) => i) : blockOrder(v)));
    if (v < 0 || courseOk(c)) course = c;
  }
  course ||= buildCourse(PATH);
  return {
    COURSE: course, SPLITS: makeSplits(course), CATCHES: makeCatches(course), STAGES: makeStages(course),
    FINISH: course.segs[course.segs.length - 1], POTIONS: makePotions(course),
  };
}
export function setCourseVariant(variant) {
  if (variant === COURSE_VARIANT) return false;
  let set = builtCourses.get(variant);
  if (!set) {
    set = makeCourseSet(variant);
    builtCourses.set(variant, set);
    if (builtCourses.size > 8) builtCourses.delete(builtCourses.keys().next().value);
  }
  ({ COURSE, SPLITS, CATCHES, STAGES, FINISH, POTIONS } = set);
  COURSE_VARIANT = variant;
  return true;
}
setCourseVariant(0);

// how far along the course the finish line is
export const finishDist = () => FINISH.start + FINISH.len * 0.78;

// ---------------------------------------------------------------- trucks
// style: pickup | cyber | beast | flower. speed: top speed multiplier.
// how: cash (buy with Cash) | free (claim) | gems (sku) | pack (starter pack) | spin (wheel only)
export const TRUCKS = [
  { id: 'big_blue', name: 'Big Blue', style: 'pickup', body: '#1f5bd6', trim: '#ffffff', rim: '#f2f2f2', speed: 1.0, how: 'free', price: 0 },
  { id: 'flower_power', name: 'Flower Power', style: 'flower', body: '#ff5fb4', trim: '#ffe14d', rim: '#ffffff', speed: 1.08, how: 'free', price: 0, label: 'FREE CAR!' },
  { id: 'gold_rush', name: 'Gold Rush', style: 'pickup', body: '#ffd21a', trim: '#1b1b1b', rim: '#1b1b1b', speed: 1.12, how: 'cash', price: 2500 },
  { id: 'green_goblin', name: 'Green Goblin', style: 'pickup', body: '#5ed23a', trim: '#2a2a2a', rim: '#d9ff4a', speed: 1.2, how: 'cash', price: 10000 },
  { id: 'night_shadow', name: 'Night Shadow', style: 'pickup', body: '#2b2340', trim: '#b04cff', rim: '#b04cff', speed: 1.3, how: 'cash', price: 40000 },
  { id: 'black_gold', name: 'Black Gold', style: 'beast', body: '#141414', trim: '#ffc933', rim: '#ffc933', speed: 1.4, how: 'cash', price: 75000 },
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

// ---------------------------------------------------------------- Rewards (spend potions on a roll)
// Four rarity tiers with fixed odds; each roll picks a tier, then one prize in it.
export const REWARD_TIERS = [
  { id: 'common', chance: 50, color: '#33c84a' },
  { id: 'rare', chance: 35.5, color: '#2aa8e8' },
  { id: 'epic', chance: 12.5, color: '#b02ee0' },
  { id: 'legendary', chance: 2, color: '#e8c020' },
];
export const REWARDS = [
  { id: 'r_cash300', tier: 'common', label: '+300 Cash', icon: 'cash', cash: 300 },
  { id: 'r_xp200', tier: 'common', label: '+200 XP', icon: 'star', xp: 200 },
  { id: 'r_spin', tier: 'common', label: '+1 Spin', icon: 'ball', spins: 1 },
  { id: 'r_cash1k', tier: 'rare', label: '+1,000 Cash', icon: 'cash', cash: 1000 },
  { id: 'r_xp600', tier: 'rare', label: '+600 XP', icon: 'star', xp: 600 },
  { id: 'r_hat', tier: 'rare', label: 'Random Hat', icon: 'propeller', hat: true },
  { id: 'r_cash3k', tier: 'epic', label: '+3,000 Cash', icon: 'cash', cash: 3000 },
  { id: 'r_spin3', tier: 'epic', label: '+3 Spins', icon: 'ball', spins: 3 },
  { id: 'r_gold', tier: 'legendary', label: 'Gold Rush Truck', icon: 'truck', truck: 'gold_rush' },
  { id: 'r_cash10k', tier: 'legendary', label: '+10,000 Cash', icon: 'cash', cash: 10000 },
];
export const REWARD_COST = 10;      // potions per roll

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
