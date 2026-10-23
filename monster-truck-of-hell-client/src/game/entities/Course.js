// The race course over the lava, as in the reference: sand slabs with teal sides (some of them
// halfpipes with panelled banks), a light-blue checker stretch with maroon sides and a mint stretch with
// magenta sides, dark seams along every slab, lava gaps to jump, speed pads, tall red walls, low rails,
// sliding pushers, checkpoint flags, the purple potions and the checkered finish. Also builds the
// spawn plaza slab and its curbs.

import * as THREE from 'three';
import { COURSE, WORLD, POTIONS, FINISH, segCorners, segTop } from '../../shared/gameData.js';
import { studTexture, sandTexture, curbTexture, checkerTexture, glowTexture, roadCheckerTexture, mintTexture, chevronTexture, speckleTexture, diamondTexture } from '../util/textures.js';
import { plastic, neon } from '../util/materials.js';
import { box, cylinder } from '../util/geometry.js';
import { makeBillboard, FONT_TITLE } from '../util/canvasText.js';

const S = WORLD.stud;

// Prism from a top polygon (corners with y) down to `bottom`, with world-space UVs:
// top u/v = x/z in studs, sides u = distance along the edge, v = height (both in `uvScale` units).
export function slabGeometry(top, bottom, uvScale = S) {
  const pos = [], uv = [], groups = [];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  const n = top.length;
  // top (fan; corners in clockwise-from-above order are handled by checking the normal)
  const P = top.map((p) => [p.x, p.y, p.z]);
  const T = top.map((p) => [p.x / uvScale, -p.z / uvScale]);
  const nY = (P[1][2] - P[0][2]) * (P[2][0] - P[0][0]) - (P[1][0] - P[0][0]) * (P[2][2] - P[0][2]);
  const flip = nY < 0;
  for (let i = 1; i < n - 1; i++) {
    if (flip) tri(P[0], P[i + 1], P[i], T[0], T[i + 1], T[i]);
    else tri(P[0], P[i], P[i + 1], T[0], T[i], T[i + 1]);
  }
  groups.push([0, pos.length / 3, 0]);
  const sideStart = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const a = top[i], b = top[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z) / uvScale;
    const A = [a.x, a.y, a.z], B = [b.x, b.y, b.z], A0 = [a.x, bottom, a.z], B0 = [b.x, bottom, b.z];
    const uA = [0, a.y / uvScale], uB = [len, b.y / uvScale], uA0 = [0, bottom / uvScale], uB0 = [len, bottom / uvScale];
    if (flip) { tri(A, A0, B, uA, uA0, uB); tri(B, A0, B0, uB, uA0, uB0); } else { tri(A, B, A0, uA, uB, uA0); tri(B, B0, A0, uB, uB0, uA0); }
  }
  groups.push([sideStart, pos.length / 3 - sideStart, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  g.computeVertexNormals();
  return g;
}

// A course segment as a solid slab: its top is a grid (along x across) following the slope, the lean
// and the halfpipe walls, with side walls and end caps down to a flat bottom. Groups: 0 = top,
// 1 = sides, 2 = halfpipe walls (the same as the top unless the segment has a bankStyle).
// UVs: top in world units / 8 (x, z), sides along the edge / height.
function topPoint(seg, c, t, u) {
  const lx = c[0].x + (c[3].x - c[0].x) * t, lz = c[0].z + (c[3].z - c[0].z) * t;
  const rx = c[1].x + (c[2].x - c[1].x) * t, rz = c[1].z + (c[2].z - c[1].z) * t;
  return [lx + (rx - lx) * u, segTop(seg, t, (u - 0.5) * seg.w), lz + (rz - lz) * u];
}
function segGrid(seg) {
  const c = segCorners(seg);
  const nT = Math.max(1, Math.ceil(seg.len / (seg.bank ? 14 : 24)));
  const nU = seg.bankFlat ? 4 : seg.bank ? 14 : seg.twist ? 2 : 1;
  const P = [];
  for (let i = 0; i <= nT; i++) {
    const row = [];
    for (let j = 0; j <= nU; j++) row.push(topPoint(seg, c, i / nT, j / nU));
    P.push(row);
  }
  return { P, nT, nU };
}

export function roadGeometry(seg) {
  const { P, nT, nU } = segGrid(seg);
  const bottom = Math.min(...P.flat().map((p) => p[1])) - WORLD.slabDepth;
  const pos = [], uv = [];
  const quad = (a, b, cc, d, ua, ub, uc, ud) => {
    pos.push(...a, ...cc, ...b, ...a, ...d, ...cc);
    uv.push(...ua, ...uc, ...ub, ...ua, ...ud, ...uc);
  };
  const wuv = (p) => [p[0] / 8, -p[2] / 8];
  // the flat floor is the middle half; the rest of a halfpipe is its walls
  const onFloor = (j) => Math.abs((j / nU - 0.5) * seg.w) <= seg.w / 4 + 0.01;
  const tops = (walls) => {
    for (let i = 0; i < nT; i++) {
      for (let j = 0; j < nU; j++) {
        const isWall = !!seg.bank && !(onFloor(j) && onFloor(j + 1));
        if (isWall !== walls) continue;
        const a = P[i][j], b = P[i][j + 1], cc = P[i + 1][j + 1], d = P[i + 1][j];
        quad(a, d, cc, b, wuv(a), wuv(d), wuv(cc), wuv(b));
      }
    }
  };
  tops(false);
  const floorCount = pos.length / 3;
  tops(true);
  const topCount = pos.length / 3;
  const down = (p) => [p[0], bottom, p[2]];
  const wall = (line) => {
    let acc = 0;
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1];
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]) / 8;
      quad(a, b, down(b), down(a), [acc, a[1] / 8], [acc + l, b[1] / 8], [acc + l, bottom / 8], [acc, bottom / 8]);
      acc += l;
    }
  };
  wall(P.map((row) => row[nU]));                    // right side, start to end
  wall(P.map((row) => row[0]).reverse());           // left side, end to start
  wall(P[0].slice());                               // start cap
  wall(P[nT].slice().reverse());                    // end cap
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.addGroup(0, floorCount, 0);
  g.addGroup(floorCount, topCount - floorCount, 2);
  g.addGroup(topCount, pos.length / 3 - topCount, 1);
  g.computeVertexNormals();
  return g;
}

// the dark seams of the reference: the slab outline, the panel lines of the banks and the creases
export function roadLines(seg) {
  const { P, nT, nU } = segGrid(seg);
  const pts = [];
  const lift = (p) => [p[0], p[1] + 0.06, p[2]];
  const seg2 = (a, b) => pts.push(...lift(a), ...lift(b));
  for (let i = 0; i <= nT; i++) {
    for (let j = 0; j < nU; j++) if (i === 0 || i === nT || (seg.bank && !seg.bankFlat) || seg.twist) seg2(P[i][j], P[i][j + 1]);
  }
  for (let j = 0; j <= nU; j++) {
    for (let i = 0; i < nT; i++) seg2(P[i][j], P[i + 1][j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

// world-scaled road texture (UVs are world / 8; one texture repeat = 16 units)
function roadMat(map, roughness) {
  const m = map.clone();
  m.needsUpdate = true;
  m.repeat.set(0.5, 0.5);
  return new THREE.MeshStandardMaterial({ map: m, roughness });
}
const lineMat = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
const sideMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const padMat = (lo, hi, mark) => new THREE.MeshBasicMaterial({ map: chevronTexture(lo, hi, mark), polygonOffset: true, polygonOffsetFactor: -2 });

let mats = null;
function materials() {
  if (mats) return mats;
  const stud = studTexture('#a3a2a5');
  const studSide = studTexture('#8e8d90');
  const sand = sandTexture();
  sand.repeat.set(1 / 16 * S, 1 / 16 * S);
  const curb = curbTexture();
  mats = {
    top: new THREE.MeshStandardMaterial({ map: stud, roughness: 0.85 }),
    side: new THREE.MeshStandardMaterial({ map: studSide, roughness: 0.9 }),
    sand: new THREE.MeshStandardMaterial({ map: sand, roughness: 0.95 }),
    teal: new THREE.MeshStandardMaterial({ color: '#3f8f8c', roughness: 0.85 }),
    curb: new THREE.MeshStandardMaterial({ map: curb, roughness: 0.7 }),
    curbSide: new THREE.MeshStandardMaterial({ color: '#c81e26', roughness: 0.7 }),
    styles: {
      sand: { top: roadMat(sandTexture(), 0.95), side: sideMat('#4f9e86'), line: lineMat('#6b6238'), barrier: sideMat('#5c5a32') },
      pink: { top: roadMat(speckleTexture('#ee9a92', '#d77b74'), 0.9), side: sideMat('#a8645e'), line: lineMat('#9a4a48'), barrier: sideMat('#6b4632') },
      checker: { top: roadMat(roadCheckerTexture(), 0.7), side: sideMat('#3f8f6c'), line: lineMat('#2f5f80'), barrier: sideMat('#8a3d5c') },
      lilac: { top: roadMat(speckleTexture('#e2d2f2', '#cbb6e2'), 0.85), side: sideMat('#b08ccf'), line: lineMat('#6e4a6a'), barrier: sideMat('#5e3846') },
      orange: { top: roadMat(diamondTexture(), 0.85), side: sideMat('#9a6ac0'), line: lineMat('#a8641c'), barrier: sideMat('#7a4a9a') },
      mint: { top: roadMat(mintTexture(), 0.75), side: sideMat('#b04f86'), line: lineMat('#23805a'), barrier: sideMat('#2c6a4a') },
    },
    // speed pads in the reference colours; their chevrons scroll forwards
    boosts: {
      orange: padMat('#ff7a12', '#ffd23a', '#fff1a0'),
      cyan: padMat('#22b8e8', '#8ff4ff', '#ffffff'),
      pink: padMat('#ff3fa8', '#ffa8e0', '#ffffff'),
    },
    frame: new THREE.MeshStandardMaterial({ color: '#4fa39a', roughness: 0.7 }),
    bolt: new THREE.MeshBasicMaterial({ color: '#fff6a0', transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
    beam: new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ color: '#f02a22', roughness: 0.6 }),
    rail: new THREE.MeshStandardMaterial({ color: '#5a5a3a', roughness: 0.85 }),
    flag: new THREE.MeshStandardMaterial({ color: '#3fd04a', roughness: 0.6, side: THREE.DoubleSide }),
    ringTile: new THREE.MeshStandardMaterial({ color: '#ff8ad8', emissive: '#ff4fc0', emissiveIntensity: 0.5, roughness: 0.5 }),
  };
  return mats;
}

function addSlab(group, top, mtop, mside, receive = true) {
  const bottom = Math.min(...top.map((p) => p.y)) - WORLD.slabDepth;
  const m = new THREE.Mesh(slabGeometry(top, bottom), [mtop, mside]);
  m.receiveShadow = receive;
  group.add(m);
  return m;
}

// curb strip: corners along an edge, u along the length (10 units = one red + one white block)
function curbMesh(group, c, y0, y1) {
  const top = c.map((p, i) => ({ x: p.x, z: p.z, y: (i < 2 ? y0 : y1) + WORLD.curbH }));
  const g = slabGeometry(top, Math.min(y0, y1) - 0.2, 1);
  // replace top UVs: u = along the strip / 10
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const ax = (c[0].x + c[1].x) / 2, az = (c[0].z + c[1].z) / 2;
  const bx = (c[2].x + c[3].x) / 2, bz = (c[2].z + c[3].z) / 2;
  const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
  for (let i = 0; i < pos.count; i++) {
    const along = (pos.getX(i) - ax) * dx + (pos.getZ(i) - az) * dz;
    uv.setXY(i, along / 10, 0.5);
  }
  const m = new THREE.Mesh(g, [materials().curb, materials().curb]);
  m.receiveShadow = true;
  m.castShadow = false;
  group.add(m);
}

const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

export function buildCourse(scene, physics) {
  const M = materials();
  const group = new THREE.Group();
  scene.add(group);
  const H = WORLD.plazaHalf;

  // ------------------------------------------------ spawn plaza
  addSlab(group, [{ x: -H, z: -H, y: 0 }, { x: H, z: -H, y: 0 }, { x: H, z: H, y: 0 }, { x: -H, z: H, y: 0 }], M.top, M.side);
  physics.addSurface([{ x: -H, z: -H }, { x: H, z: -H }, { x: H, z: H }, { x: -H, z: H }], 0);
  const cw = WORLD.curbW, E = WORLD.exitHalf;
  const plazaCurbs = [
    [[-H, H], [H, H], [H, H - cw], [-H, H - cw]],
    [[H - cw, H], [H, H], [H, -H], [H - cw, -H]],
    [[-H, -H + cw], [-H, H], [-H + cw, H], [-H + cw, -H + cw]],
    [[-H, -H], [-E, -H], [-E, -H + cw], [-H, -H + cw]],
    [[E, -H], [H, -H], [H, -H + cw], [E, -H + cw]],
  ];
  for (const q of plazaCurbs) {
    const c = q.map(([x, z]) => ({ x, z }));
    // order so that c[0], c[1] is one end and c[2], c[3] the other (along the long side)
    const long = Math.hypot(c[1].x - c[0].x, c[1].z - c[0].z) > Math.hypot(c[2].x - c[1].x, c[2].z - c[1].z);
    const ordered = long ? [c[0], c[3], c[2], c[1]] : c;
    curbMesh(group, ordered, 0, 0);
    physics.addSurface(c, WORLD.curbH);
  }

  // ------------------------------------------------ segments
  const pushers = [];
  const flags = [];
  const rings = [];
  const strikes = [];
  let ringRun = 0;
  for (const seg of COURSE.segs) {
    if (seg.kind === 'gap') continue;
    const st = M.styles[seg.style] || M.styles.sand;
    const bank = M.styles[seg.bankStyle] || st;
    const road = new THREE.Mesh(roadGeometry(seg), [st.top, st.side, bank.top]);
    road.castShadow = true;
    road.receiveShadow = true;
    group.add(road);
    group.add(new THREE.LineSegments(roadLines(seg), st.line));
    physics.addSegment(seg);

    const at = (t, side) => ({
      x: seg.a.x + seg.dx * seg.len * t - seg.dz * side,
      z: seg.a.z + seg.dz * seg.len * t + seg.dx * side,
      y: segTop(seg, t, side),
    });
    const yaw = Math.atan2(seg.dx, seg.dz);
    const has = (k) => (seg.props || '').split(' ').includes(k);

    if (has('boost') && (!seg.curve || seg.i % 2 === 0)) {
      const n = seg.len > 60 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const p = at(n > 1 ? 0.3 + i * 0.4 : 0.5, ((seg.i + i) % 2 ? 1 : -1) * seg.w * 0.18);
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), M.boosts[seg.boostColor] || M.boosts.orange);
        pad.rotation.set(-Math.PI / 2, 0, yaw + Math.PI);
        pad.position.set(p.x, p.y + 0.06, p.z);
        group.add(pad);
        physics.addBoost({ x: p.x, z: p.z, w: 14, d: 14, rot: yaw, y: p.y });
      }
    }
    if (has('walls')) {
      // tall red blocks on the edges, on alternate sides, hanging out over the lava
      for (let i = 0; i < 4; i++) {
        const side = (i % 2 ? 1 : -1) * (seg.w / 2 + 1);
        const p = at(0.12 + i * 0.24, side);
        const w = 8, d = 20, h = 32;
        const m = box(w, h, d, M.wall, { x: p.x, y: p.y + h / 2, z: p.z, ry: yaw });
        group.add(m);
        physics.addBox({ x: p.x, z: p.z, w, d, rot: yaw, top: p.y + h, bottom: p.y - 1 });
      }
    }
    if (has('rails')) {
      // low dark bars along both edges, with gaps
      for (let i = 0; i < 5; i++) {
        for (const sx of [-1, 1]) {
          const p = at(0.08 + i * 0.2, sx * (seg.w / 2 - 3));
          const len = seg.len * 0.12;
          group.add(box(2, 2.4, len, M.rail, { x: p.x, y: p.y + 1.2, z: p.z, ry: yaw }));
          physics.addBox({ x: p.x, z: p.z, w: 2, d: len, rot: yaw, top: p.y + 2.4, bottom: p.y - 1 });
        }
      }
    }
    if (has('barriers')) {
      // low walls along both edges in pieces with gaps; they stop the truck driving off
      const pieces = seg.curve ? 1 : Math.max(1, Math.round(seg.len / 34));
      for (let i = 0; i < pieces; i++) {
        for (const sx of [-1, 1]) {
          if ((i + (sx > 0 ? 1 : 0) + seg.i) % 3 === 2 && pieces > 1) continue;   // a gap here and there
          const t0 = i / pieces, t1 = (i + 1) / pieces;
          const len = seg.len * (t1 - t0) * (seg.curve ? 1.05 : 0.8);
          const p = at((t0 + t1) / 2, sx * (seg.w / 2 - 1.6));
          group.add(box(2.4, 3.2, len, st.barrier, { x: p.x, y: p.y + 1.4, z: p.z, ry: yaw }));
          physics.addBox({ x: p.x, z: p.z, w: 2.4, d: len, rot: yaw, top: p.y + 3, bottom: p.y - 2, block: true });
        }
      }
    }
    if (has('frames')) {
      // teal tunnel arches: two posts on the edges and a beam over the road
      const n = Math.max(2, Math.round(seg.len / 40));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const c = at(t, 0);
        const arch = new THREE.Group();
        for (const sx of [-1, 1]) arch.add(box(2.5, 22, 4, M.frame, { x: sx * (seg.w / 2 - 1.2), y: 11 }));
        arch.add(box(seg.w, 3, 4, M.frame, { y: 22.5 }));
        arch.position.set(c.x, c.y, c.z);
        arch.rotation.y = yaw;
        arch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        group.add(arch);
        for (const sx of [-1, 1]) {
          const p = at(t, sx * (seg.w / 2 - 1.2));
          physics.addBox({ x: p.x, z: p.z, w: 2.5, d: 4, rot: yaw, top: p.y + 22, bottom: p.y - 2, block: true });
        }
      }
    }
    if (has('pushers')) {
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + i * 0.25;
        const p = at(t, 0);
        const w = 10, d = 8, h = 7;
        const m = new THREE.Group();
        m.add(box(w, h, d, plastic('#e4232b'), { y: h / 2, radius: 0.4 }));
        m.add(box(w + 0.1, 1.4, d + 0.1, plastic('#f7f7f7'), { y: h * 0.55 }));
        m.add(box(w * 0.6, 0.5, d + 0.2, neon('#ffd21a', 0.6), { y: h - 0.8 }));
        m.position.set(p.x, p.y, p.z);
        m.rotation.y = yaw;
        group.add(m);
        const solid = physics.addBox({ x: p.x, z: p.z, w, d, rot: m.rotation.y, top: p.y + h, bottom: p.y - 1 });
        pushers.push({ mesh: m, solid, base: p, nx: -seg.dz, nz: seg.dx, amp: (seg.w - w) / 2 - 4, speed: 0.7 + i * 0.25, phase: i * 1.7 });
      }
    }

    // pink speed rings floating over the road: a few along each ring stretch, not a row of them
    ringRun = has('rings') ? ringRun + 1 : 0;
    if (ringRun % 4 === 1) rings.push(checkpointGate(group, physics, seg, M, at, yaw));

    // checkpoint flag at the start of every stage after the first
    if (seg.stage > 0 && COURSE.segs[seg.i - 1]?.stage !== seg.stage) {
      // the flag stands in the middle of the plate
      const p = at(0.5, 0);
      const flag = new THREE.Group();
      flag.add(cylinder(0.25, 0.25, 9, plastic('#2b2b2e'), { y: 4.5, segments: 8 }));
      flag.add(box(3.6, 2.2, 0.15, M.flag, { x: 1.9, y: 7.8 }));
      flag.add(cylinder(1.2, 1.4, 0.4, plastic('#2b2b2e'), { y: 0.2, segments: 12 }));
      flag.position.set(p.x, p.y, p.z);
      flag.rotation.y = yaw + Math.PI / 2;
      flag.userData.stage = seg.stage;
      group.add(flag);
      flags.push(flag);
    }
  }

  // ------------------------------------------------ finish line: checkered stripe + arch
  const f = FINISH;
  const ft = 0.78;
  const fp = { x: f.a.x + f.dx * f.len * ft, z: f.a.z + f.dz * f.len * ft, y: f.b.y };
  const yaw = Math.atan2(f.dx, f.dz);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(f.w - cw * 2, 8), new THREE.MeshStandardMaterial({ map: checkerTexture(Math.round((f.w - cw * 2) / 4)), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  stripe.rotation.set(-Math.PI / 2, 0, -yaw + Math.PI);
  stripe.position.set(fp.x, fp.y + 0.03, fp.z);
  stripe.receiveShadow = true;
  group.add(stripe);
  const arch = new THREE.Group();
  const pillarMat = plastic('#e4232b');
  for (const sx of [-1, 1]) {
    arch.add(box(4, 30, 4, pillarMat, { x: sx * (f.w / 2 - 6), y: 15 }));
    arch.add(box(4.4, 2, 4.4, plastic('#f7f7f7'), { x: sx * (f.w / 2 - 6), y: 8 }));
    arch.add(box(4.4, 2, 4.4, plastic('#f7f7f7'), { x: sx * (f.w / 2 - 6), y: 20 }));
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(f.w - 8, 7, 1.5), [plastic('#111'), plastic('#111'), plastic('#111'), plastic('#111'),
    new THREE.MeshStandardMaterial({ map: checkerTexture(16) }), new THREE.MeshStandardMaterial({ map: checkerTexture(16) })]);
  banner.position.y = 28;
  arch.add(banner);
  const word = makeBillboard([{ text: 'FINISH', size: 120, font: FONT_TITLE, weight: 400, fill: '#ffd21a', stroke: '#1b1b2b', strokeWidth: 14 }], 9);
  word.position.y = 37;
  arch.add(word);
  arch.position.set(fp.x, fp.y, fp.z);
  arch.rotation.y = yaw;
  arch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(arch);
  for (const sx of [-1, 1]) {
    const px = fp.x + Math.cos(yaw) * sx * (f.w / 2 - 6), pz = fp.z - Math.sin(yaw) * sx * (f.w / 2 - 6);
    physics.addBox({ x: px, z: pz, w: 4, d: 4, top: fp.y + 30, bottom: fp.y - 1 });
  }
  // finish-slab back curb (no driving off the end)
  const fc = segCorners(f);
  const back = [fc[3], fc[2], lerpP(fc[2], fc[1], cw / f.len), lerpP(fc[3], fc[0], cw / f.len)];
  curbMesh(group, [back[0], back[3], back[2], back[1]], f.b.y, f.b.y);
  physics.addSurface(back, f.b.y + WORLD.curbH + 4);

  // ------------------------------------------------ potions
  const potions = POTIONS.map((p) => {
    const m = potionMesh();
    m.position.set(p.x, p.y + 3.2, p.z);
    group.add(m);
    return { ...p, mesh: m, base: p.y + 3.2 };
  });

  return {
    group,
    potions,
    finish: { ...fp, yaw },
    setCollected(ids) {
      for (const p of potions) p.mesh.visible = !ids.includes(p.id);
    },
    // checkpoint reached: a bolt of lightning and a beam of light strike its flag
    strike(stage) {
      const flag = flags.find((f) => f.userData.stage === stage);
      if (flag) strikes.push(lightning(group, M, flag.position));
    },
    update(dt, time) {
      for (const f of flags) f.children[1].rotation.y = Math.sin(time * 3 + f.position.x) * 0.25;
      // rings turn and breathe (grow and shrink)
      for (const r of rings) {
        r.rotation.z = time * 0.8;
        r.parent.scale.setScalar(1 + 0.22 * Math.sin(time * 2.4 + r.parent.position.x * 0.05));
      }
      // speed pad chevrons run forwards
      for (const m of Object.values(M.boosts)) m.map.offset.y = -((time * 1.6) % 1);
      for (let i = strikes.length - 1; i >= 0; i--) {
        const s = strikes[i];
        s.life -= dt;
        const k = Math.max(0, s.life / s.max);
        s.bolt.material.opacity = k > 0.6 ? (Math.sin(time * 60) > 0 ? 1 : 0.3) : k;
        s.beam.material.opacity = 0.55 * k;
        s.beam.scale.x = s.beam.scale.z = 1 + (1 - k) * 0.6;
        if (s.life <= 0) { group.remove(s.bolt, s.beam); s.bolt.geometry.dispose(); strikes.splice(i, 1); }
      }
      for (const p of pushers) {
        const s = Math.sin(time * p.speed + p.phase) * p.amp;
        const x = p.base.x + p.nx * s, z = p.base.z + p.nz * s;
        p.mesh.position.x = p.solid.x = x;
        p.mesh.position.z = p.solid.z = z;
      }
      for (const p of potions) {
        if (!p.mesh.visible) continue;
        p.mesh.position.y = p.base + Math.sin(time * 2.5 + p.id) * 0.5;
        p.mesh.rotation.y = time * 1.6 + p.id;
      }
    },
  };
}

// Pink speed ring: tiles turning slowly in a ring standing on the road; driving through it boosts the
// truck. Returns the ring.
function checkpointGate(group, physics, seg, M, at, yaw) {
  const t = Math.min(0.12, 18 / seg.len);
  const top = 13;           // ring centre above the road: it floats over the trucks
  const c = at(t, 0);
  const ring = new THREE.Group();
  const tile = new THREE.BoxGeometry(2.6, 1.2, 0.6);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const m = new THREE.Mesh(tile, M.ringTile);
    m.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0);
    m.rotation.z = a + Math.PI / 2;
    ring.add(m);
  }
  const holder = new THREE.Group();
  holder.position.set(c.x, c.y + top, c.z);
  // driving through the ring gives a burst of speed
  physics.addBoost({ x: c.x, z: c.z, w: 18, d: 8, rot: yaw, y: c.y });
  holder.rotation.y = yaw;
  holder.add(ring);
  group.add(holder);
  return ring;
}

// A jagged bolt from the sky down to p and a wide column of yellow light round it. Each has its own
// material so it can fade on its own.
function lightning(group, M, p) {
  const pts = [];
  let x = p.x, z = p.z;
  for (let y = p.y + 160; y > p.y; y -= 14) {
    pts.push(new THREE.Vector3(x, y, z));
    x = p.x + (Math.random() - 0.5) * 10;
    z = p.z + (Math.random() - 0.5) * 10;
  }
  pts.push(new THREE.Vector3(p.x, p.y + 2, p.z));
  const path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
  const bolt = new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 3, 0.7, 5, false), M.bolt.clone());
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 170, 20, 1, true), M.beam.clone());
  beam.position.set(p.x, p.y + 85, p.z);
  group.add(bolt, beam);
  return { bolt, beam, life: 1.4, max: 1.4 };
}

function potionMesh() {
  const g = new THREE.Group();
  const glassM = new THREE.MeshStandardMaterial({ color: '#d03cf0', emissive: '#a020d0', emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.92 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), glassM);
  g.add(ball);
  g.add(cylinder(0.55, 0.65, 1.3, plastic('#c050ff'), { y: 1.8, segments: 12 }));
  g.add(cylinder(0.75, 0.75, 0.4, plastic('#ffd36a'), { y: 2.6, segments: 12 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(230,90,255,0.9)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(8, 8, 1);
  g.add(glow);
  return g;
}
