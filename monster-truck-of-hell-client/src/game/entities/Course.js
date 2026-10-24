// The race course over the lava, as in the reference: sand slabs with teal sides (some of them
// halfpipes with panelled banks), a light-blue checker stretch with maroon sides and a mint stretch with
// magenta sides, dark seams along every slab, lava gaps to jump, speed pads, tall red walls, low rails,
// sliding pushers, checkpoint flags, the purple potions and the checkered finish. Also builds the
// spawn plaza slab and its curbs.

import * as THREE from 'three';
import { COURSE, WORLD, POTIONS, FINISH, SPLITS, CATCHES, segCorners, segTop } from '../../shared/gameData.js';
import { studTexture, sandTexture, curbTexture, checkerTexture, glowTexture, roadCheckerTexture, mintTexture, chevronTexture, speckleTexture, diamondTexture } from '../util/textures.js';
import { plastic, neon } from '../util/materials.js';
import { box, cylinder } from '../util/geometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBillboard, FONT_TITLE } from '../util/canvasText.js';
import { studioEnv } from './MonsterTruck.js';

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
  const nT = Math.max(1, Math.ceil(seg.len / (seg.curl ? 3 : seg.bank ? 14 : 24)));
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
      grass: { top: roadMat(speckleTexture('#4fdc9c', '#45c78c'), 0.85), side: sideMat('#8a6a48'), line: lineMat('#2a6a4a'), barrier: sideMat('#6a4a32') },
      sky: { top: roadMat(speckleTexture('#7cc6ee', '#72bbe4'), 0.8), side: sideMat('#3f8a6e'), line: lineMat('#2e6a7a'), barrier: sideMat('#2f6a52') },
      lavender: { top: roadMat(speckleTexture('#e8def6', '#d8cbec'), 0.8), side: sideMat('#9b8ac0'), line: lineMat('#5a8a8a'), barrier: sideMat('#7a6aa0') },
    },
    // speed pads in the reference colours; their chevrons scroll forwards
    boosts: {
      orange: padMat('#ff7a12', '#ffd23a', '#fff1a0'),
      cyan: padMat('#22b8e8', '#8ff4ff', '#ffffff'),
      pink: padMat('#ff3fa8', '#ffa8e0', '#ffffff'),
    },
    frame: new THREE.MeshStandardMaterial({ color: '#4fa39a', roughness: 0.7 }),
    tube: new THREE.MeshStandardMaterial({ color: '#d9cdef', roughness: 0.8, side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ color: '#4f9a96', roughness: 0.7 }),
    sweeper: new THREE.MeshStandardMaterial({ color: '#ff2a1e', emissive: '#a00', emissiveIntensity: 0.25, roughness: 0.5 }),
    beam: new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: '#5a5a3a', roughness: 0.85 }),
    flag: new THREE.MeshStandardMaterial({ color: '#3fd04a', roughness: 0.6, side: THREE.DoubleSide }),
    ringTile: new THREE.MeshStandardMaterial({ color: '#ff8ad8', emissive: '#ff4fc0', emissiveIntensity: 0.5, roughness: 0.5 }),
    hazRed: new THREE.MeshStandardMaterial({ color: '#ec1c1c', emissive: '#900', emissiveIntensity: 0.35, roughness: 0.45 }),
    hazWhite: new THREE.MeshStandardMaterial({ color: '#f7f7f7', roughness: 0.5 }),
    // the box tunnel's two colours, and its wind
    tunA: new THREE.MeshStandardMaterial({ color: '#ffb321', roughness: 0.6 }),
    tunB: new THREE.MeshStandardMaterial({ color: '#6a3fd8', roughness: 0.6 }),
    // the round tunnel's two colours (inside and out)
    tubeA: new THREE.MeshStandardMaterial({ color: '#2cc4e8', roughness: 0.6, side: THREE.DoubleSide }),
    tubeB: new THREE.MeshStandardMaterial({ color: '#2a3f9e', roughness: 0.6, side: THREE.DoubleSide }),
    windStreak: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }),
  };
  return mats;
}

// the plaza's sides, seen from any angle (the slab's side faces wind inwards on its corner order)
function plazaSide(side) {
  const m = side.clone();
  m.side = THREE.DoubleSide;
  return m;
}

function addSlab(group, top, mtop, mside, receive = true, depth = WORLD.slabDepth) {
  const bottom = Math.min(...top.map((p) => p.y)) - depth;
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

// A rounded red / white mound along an edge (outer line p0 -> p1, n points inwards), standing on
// height y. Its top is the curb texture, its outer face drops down the side of the slab.
const MOUND_W = 8, MOUND_H = 3;
const PLAZA_DEPTH = 28;     // thickness of the spawn plaza block
function moundH(d) {
  if (d < 0 || d > MOUND_W) return 0;
  return MOUND_H * Math.sin((Math.PI * d) / MOUND_W) ** 0.8;
}
function curbMound(group, physics, p0, p1, n, y) {
  const L = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const tx = (p1.x - p0.x) / L, tz = (p1.z - p0.z) / L;
  const nl = Math.max(2, Math.ceil(L / 10)), nw = 8;
  const pos = [], uv = [];
  const P = (i, j) => {
    const t = (i / nl) * L, d = (j / nw) * MOUND_W;
    return [p0.x + tx * t + n.x * d, y + moundH(d) + (j === 0 ? 0.6 : 0), p0.z + tz * t + n.z * d, t / 10, j / nw];
  };
  const push = (...vs) => { for (const v of vs) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); } };
  for (let i = 0; i < nl; i++) {
    for (let j = 0; j < nw; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      push(a, b, c, a, c, d);
    }
    // outer face down the slab side
    const a = P(i, 0), b = P(i + 1, 0);
    const a0 = [a[0], y - 3, a[2], a[3], 1], b0 = [b[0], y - 3, b[2], b[3], 1];
    push(a, a0, b0, a, b0, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: materials().curb.map, roughness: 0.7, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  group.add(m);
  const corners = [p0, p1, { x: p1.x + n.x * MOUND_W, z: p1.z + n.z * MOUND_W }, { x: p0.x + n.x * MOUND_W, z: p0.z + n.z * MOUND_W }];
  physics.addSurface(corners, y + MOUND_H, (x, z) => y + moundH((x - p0.x) * n.x + (z - p0.z) * n.z));
}

const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

export function buildCourse(scene, physics) {
  const M = materials();
  const group = new THREE.Group();
  scene.add(group);
  const H = WORLD.plazaHalf;

  // ------------------------------------------------ spawn plaza
  // the spawn plaza is a thick stage block
  addSlab(group, [{ x: -H, z: -H, y: 0 }, { x: H, z: -H, y: 0 }, { x: H, z: H, y: 0 }, { x: -H, z: H, y: 0 }], M.top, plazaSide(M.side), true, PLAZA_DEPTH);
  physics.addSurface([{ x: -H, z: -H }, { x: H, z: -H }, { x: H, z: H }, { x: -H, z: H }], 0);
  const cw = WORLD.curbW, E = WORLD.exitHalf;
  // red / white mounds round the plaza edge: a truck can bump up over them (and off the edge)
  const edges = [
    [{ x: -H, z: H }, { x: H, z: H }, { x: 0, z: -1 }],
    [{ x: H, z: H }, { x: H, z: -H }, { x: -1, z: 0 }],
    [{ x: -H, z: -H }, { x: -H, z: H }, { x: 1, z: 0 }],
    [{ x: -H, z: -H }, { x: -E, z: -H }, { x: 0, z: 1 }],
    [{ x: E, z: -H }, { x: H, z: -H }, { x: 0, z: 1 }],
  ];
  for (const [p0, p1, n] of edges) curbMound(group, physics, p0, p1, n, 0);

  // ------------------------------------------------ segments
  const pushers = [];
  const flags = [];
  const rings = [];
  const strikes = [];
  const sweepers = [];
  const hazards = [];
  const windFans = [];
  let ringRun = 0;
  for (const seg of COURSE.segs) {
    if (seg.kind === 'gap') continue;
    const st = M.styles[seg.style] || M.styles.sand;
    const bank = M.styles[seg.bankStyle] || st;
    const road = new THREE.Mesh(roadGeometry(seg), [st.top, st.side, bank.top]);
    road.castShadow = true;
    road.receiveShadow = true;
    group.add(road);
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
    // 'walls': red blocks on the edges, on alternate sides (hazards, see HAZARDS)
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
      // none by a right-angle corner: the inside of the bend cuts across those pieces
      const cornerNext = COURSE.segs[seg.i + 1]?.corner;
      for (let i = 0; i < pieces; i++) {
        if ((seg.corner && i === 0) || (cornerNext && i === pieces - 1)) continue;
        for (const sx of [-1, 1]) {
          if ((i + (sx > 0 ? 1 : 0) + seg.i) % 3 === 2 && pieces > 1) continue;   // a gap here and there
          const t0 = i / pieces, t1 = (i + 1) / pieces;
          const len = seg.len * (t1 - t0) * (seg.curve ? 1.05 : 0.8);
          const p = at((t0 + t1) / 2, sx * (seg.w / 2 - 1.6));
          barrierWall(group, M, p, yaw, len);
          physics.addBox({ x: p.x, z: p.z, w: 2.4, d: len, rot: yaw, top: p.y + 3, bottom: p.y - 2, block: true });
        }
      }
    }
    if (has('shortbars')) {
      // a few short low walls on the edges, left and right in turn
      const n = Math.max(1, Math.round(seg.len / 45));
      for (let i = 0; i < n; i++) {
        const sx = (i + seg.i) % 2 ? 1 : -1;
        const p = at((i + 0.5) / n, sx * (seg.w / 2 - 1.6));
        barrierWall(group, M, p, yaw, 14);
        physics.addBox({ x: p.x, z: p.z, w: 2.4, d: 14, rot: yaw, top: p.y + 3, bottom: p.y - 2, block: true });
      }
    }
    if (has('sweep')) {
      // a red bar turning on a post in the middle of the road, sweeping trucks off
      const p = at(0.5, 0);
      const len = seg.w * 0.75;
      const m = new THREE.Group();
      m.add(box(len, 3, 3, M.sweeper, { y: 2.2 }));
      m.add(cylinder(1.2, 1.6, 5, M.sweeper, { y: 2.5, segments: 10 }));
      m.position.set(p.x, p.y, p.z);
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.add(m);
      const solid = physics.addBox({ x: p.x, z: p.z, w: len, d: 3, rot: yaw, top: p.y + 3.7, bottom: p.y - 1, block: true });
      sweepers.push({ mesh: m, solid, speed: (seg.i % 2 ? 1 : -1) * (0.7 + (seg.i % 3) * 0.2), phase: seg.i });
    }
    if (seg.corner) cornerWalls(group, physics, seg, at, yaw);
    for (const kind of Object.keys(HAZARDS)) {
      if (has(kind)) hazards.push(...HAZARDS[kind](seg, at, yaw, { group, physics, M }).map((h) => addHazard(group, M, h)));
    }
    if (has('tunnel')) buildTunnel(group, physics, seg, M, at, yaw);
    if (has('boxtunnel')) windFans.push(...buildBoxTunnel(group, physics, seg, M, at, yaw));
    if (has('roundtunnel')) buildRoundTunnel(group, physics, seg, M, at, yaw);
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

  // ------------------------------------------------ split runs: two side paths of plates
  for (const sp of SPLITS) {
    for (const run of sp.runs) {
      for (const seg of run) {
        const st = M.styles[seg.style] || M.styles.sand;
        const road = new THREE.Mesh(roadGeometry(seg), [st.top, st.side, st.top]);
        road.castShadow = true;
        road.receiveShadow = true;
        group.add(road);
        physics.addSegment(seg);
        // a pink ring over the start of each run, beside the jump-off
        if (seg.plate === 0) {
          const at = (t, side) => ({ x: seg.a.x + seg.dx * seg.len * t - seg.dz * side, z: seg.a.z + seg.dz * seg.len * t + seg.dx * side, y: segTop(seg, t, side) });
          rings.push(checkpointGate(group, physics, seg, M, at, Math.atan2(seg.dx, seg.dz)));
        }
      }
    }
  }

  // ------------------------------------------------ catches: ledges under the jump gaps
  for (const seg of CATCHES) {
    const st = M.styles[seg.style] || M.styles.sand;
    const road = new THREE.Mesh(roadGeometry(seg), [st.top, st.side, st.top]);
    road.castShadow = true;
    road.receiveShadow = true;
    group.add(road);
    physics.addSegment(seg);
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
  const ARCH_H = 50;
  for (const sx of [-1, 1]) {
    arch.add(box(4, ARCH_H, 4, pillarMat, { x: sx * (f.w / 2 - 6), y: ARCH_H / 2 }));
    for (const y of [10, 24, 38]) arch.add(box(4.4, 2, 4.4, plastic('#f7f7f7'), { x: sx * (f.w / 2 - 6), y }));
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(f.w - 8, 10, 1.5), [plastic('#111'), plastic('#111'), plastic('#111'), plastic('#111'),
    new THREE.MeshStandardMaterial({ map: checkerTexture(16) }), new THREE.MeshStandardMaterial({ map: checkerTexture(16) })]);
  banner.position.y = ARCH_H - 3;
  arch.add(banner);
  const word = makeBillboard([{ text: 'FINISH', size: 120, font: FONT_TITLE, weight: 400, fill: '#ffd21a', stroke: '#1b1b2b', strokeWidth: 14 }], 13);
  word.position.y = ARCH_H + 10;
  arch.add(word);
  arch.position.set(fp.x, fp.y, fp.z);
  arch.rotation.y = yaw;
  arch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(arch);
  for (const sx of [-1, 1]) {
    const px = fp.x + Math.cos(yaw) * sx * (f.w / 2 - 6), pz = fp.z - Math.sin(yaw) * sx * (f.w / 2 - 6);
    physics.addBox({ x: px, z: pz, w: 4, d: 4, top: fp.y + ARCH_H, bottom: fp.y - 1 });
  }
  // the big gold trophy past the line, turning slowly on its plinth
  const tt = 0.94;
  const tp = { x: f.a.x + f.dx * f.len * tt, z: f.a.z + f.dz * f.len * tt, y: f.b.y };
  const trophy = trophyMesh();
  trophy.position.set(tp.x, tp.y, tp.z);
  trophy.rotation.y = yaw + Math.PI;
  group.add(trophy);
  physics.addCylinder({ x: tp.x, z: tp.z, r: 9, top: tp.y + 9, bottom: tp.y - 1 });
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
    // does any of these world points touch a red / white hazard (within margin)?
    hazardHit(points, margin = 1) {
      const P = new THREE.Vector3();
      for (const hz of hazards) {
        const c = points[0];
        if (Math.hypot(c.x - hz.center.x, c.y - hz.center.y, c.z - hz.center.z) > hz.radius + 14) continue;
        const inv = hz.inv.copy(hz.node.matrixWorld).invert();
        for (const w of points) {
          P.copy(w).applyMatrix4(inv);
          for (const b of hz.boxes) {
            let x = P.x - b.c[0], y = P.y - b.c[1];
            if (b.rz) { const cs = Math.cos(-b.rz), sn = Math.sin(-b.rz); [x, y] = [x * cs - y * sn, x * sn + y * cs]; }
            if (Math.abs(x) < b.h[0] + margin && Math.abs(y) < b.h[1] + margin && Math.abs(P.z - b.c[2]) < b.h[2] + margin) return true;
          }
        }
      }
      return false;
    },
    // checkpoint reached: a beam of light on its flag
    strike(stage) {
      const flag = flags.find((f) => f.userData.stage === stage);
      if (flag) strikes.push(lightBeam(group, M, flag.position));
    },
    update(dt, time) {
      for (const f of flags) f.children[1].rotation.y = Math.sin(time * 3 + f.position.x) * 0.25;
      trophy.userData.cup.rotation.y = time * 0.5;
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
        s.beam.material.opacity = 0.55 * k;
        s.beam.scale.x = s.beam.scale.z = 1 + (1 - k) * 0.6;
        if (s.life <= 0) { group.remove(s.beam); strikes.splice(i, 1); }
      }
      for (const sw of sweepers) {
        const a = time * sw.speed + sw.phase;
        sw.mesh.rotation.y = a;
        sw.solid.rot = a;
        sw.solid.cos = Math.cos(a);
        sw.solid.sin = Math.sin(a);
      }
      for (const hz of hazards) {
        if (!hz.move) continue;
        hz.move(hz.node, time);
        hz.node.updateMatrixWorld(true);
      }
      // box tunnel fans spin, their wind streaks fly across the road away from them
      for (const f of windFans) {
        f.rotor.rotation.x = time * 9;
        for (const s of f.streaks) {
          const u = (time * 0.9 + s.ph) % 1;
          s.m.position.x = -f.so * (f.span / 2 - u * f.span);
          s.m.material.opacity = 0.7 * Math.sin(Math.PI * u);
        }
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

// ------------------------------------------------ red / white hazards
// A hazard is a node (moved every frame by `move(node, time)`) holding boxes in its own space:
// { c: centre, h: half sizes, rz: turn about the node's z }. They are drawn as red and white stripes
// along their longest side; touching any of them sends the truck back to its checkpoint.
const STRIPE = 5;

// red and white meshes for boxes, striped along each one's longest side, colours alternating
// (striped false: all red)
function stripes(boxes, M, striped = true) {
  const red = [], white = [];
  let k = 0;
  for (const b of boxes) {
    const size = b.h.map((v) => v * 2);
    const ax = size.indexOf(Math.max(...size));
    const n = Math.max(1, Math.round(size[ax] / STRIPE));
    for (let i = 0; i < n; i++) {
      const piece = size.slice();
      piece[ax] = size[ax] / n;
      const g = new THREE.BoxGeometry(...piece);
      const off = [0, 0, 0];
      off[ax] = -size[ax] / 2 + piece[ax] * (i + 0.5);
      g.translate(...off);
      if (b.rz) g.rotateZ(b.rz);
      g.translate(...b.c);
      ((k + i) % 2 ? white : red).push(g);
    }
    k += n;
  }
  if (!striped) { red.push(...white); white.length = 0; }
  return [[red, M.hazRed], [white, M.hazWhite]].filter(([list]) => list.length).map(([list, mat]) => {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  });
}

// a low red / white barrier along the road edge (safe to touch: it only stops the truck)
function barrierWall(group, M, p, yaw, len) {
  const wall = new THREE.Group();
  for (const m of stripes([{ c: [0, 1.4, 0], h: [1.2, 1.6, len / 2] }], M)) wall.add(m);
  wall.position.set(p.x, p.y, p.z);
  wall.rotation.y = yaw;
  group.add(wall);
}

function addHazard(group, M, { pos, yaw, boxes, move, reach = 0 }) {
  const node = new THREE.Group();
  node.position.set(pos.x, pos.y, pos.z);
  node.rotation.y = yaw;
  for (const m of stripes(boxes, M, false)) node.add(m);
  group.add(node);
  node.updateMatrixWorld(true);
  const radius = reach + Math.max(...boxes.map((b) => Math.hypot(...b.c) + Math.hypot(...b.h)));
  return { node, boxes, move, center: node.position.clone(), radius, inv: new THREE.Matrix4() };
}

// hazard builders: (segment, at(t, side), yaw, { group, physics, M }) -> hazards on it
const HAZARDS = {
  // tall pillars scattered over the road (the same spots every race), about one every 22 units
  // along it, so the truck weaves between them
  walls(seg, at, yaw) {
    let seed = seg.i * 9301 + 49297;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.max(3, Math.round(seg.len / 22));
    return Array.from({ length: n }, (_, i) => {
      const t = (i + 0.3 + rnd() * 0.4) / n;
      const side = (rnd() * 2 - 1) * (seg.w / 2 - 6);
      const h = 9 + rnd() * 7;
      return { pos: at(t, side), yaw: yaw + (rnd() - 0.5) * 0.6, boxes: [{ c: [0, h / 2 - 1, 0], h: [3, h / 2 + 1, 3] }] };
    });
  },
  // walls across part of the road, left and right in turn
  redwalls(seg, at, yaw) {
    const span = seg.w * 0.4;
    return [0.25, 0.5, 0.75].map((t, i) => ({
      pos: at(t, ((i + seg.i) % 2 ? 1 : -1) * (seg.w - span) / 2), yaw,
      boxes: [{ c: [0, 3, 0], h: [span / 2, 4, 1.4] }],
    }));
  },
  // standing plates sliding from side to side, out of step
  sliders(seg, at, yaw) {
    const w = 14, amp = (seg.w - w) / 2 - 3;
    const nx = -seg.dz, nz = seg.dx;
    return [0.35, 0.65].map((t, i) => {
      const base = at(t, 0), sp = 0.9 + i * 0.3, ph = i * Math.PI + seg.i;
      return {
        pos: base, yaw, reach: amp, boxes: [{ c: [0, 4, 0], h: [w / 2, 5, 1.4] }],
        move: (n, time) => {
          const s = Math.sin(time * sp + ph) * amp;
          n.position.set(base.x + nx * s, base.y, base.z + nz * s);
        },
      };
    });
  },
  // bars turning on posts, two or three along the road, on alternate sides and turning opposite ways
  spinbars(seg, at, yaw) {
    const n = seg.len > 100 ? 3 : 2, len = seg.w * 0.42;
    return Array.from({ length: n }, (_, i) => {
      const sp = (i % 2 ? 1 : -1) * (1 + i * 0.25);
      return {
        pos: at((i + 0.5) / n, ((i + seg.i) % 2 ? 1 : -1) * seg.w * 0.2), yaw,
        boxes: [{ c: [0, 2.6, 0], h: [len / 2, 1.3, 1.3] }, { c: [0, 2.5, 0], h: [1.4, 3.5, 1.4] }],
        move: (nd, time) => { nd.rotation.y = yaw + time * sp + i; },
      };
    });
  },
  // four long blades turning across the road on their own (no frame)
  fan(seg, at, yaw) {
    const R = seg.w * 0.45, H = R + 1;
    const c = at(0.5, 0);
    const boxes = [0, 1, 2, 3].map((k) => {
      const a = (k / 4) * Math.PI * 2;
      return { c: [Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0], h: [R / 2, 1.8, 1.4], rz: a };
    });
    boxes.push({ c: [0, 0, 0], h: [2, 2, 1.6] });
    const sp = 1.1 * (seg.i % 2 ? 1 : -1);
    return [{ pos: { x: c.x, y: c.y + H, z: c.z }, yaw, boxes, move: (n, time) => { n.rotation.z = time * sp + seg.i; } }];
  },
  // a whole round ring standing across the road just past a kicker (see ringJump in gameData):
  // driving on hits its bottom, jumping off the kicker flies through its open middle
  cring(seg, at, yaw) {
    const R = seg.w / 2 - 2, n = 28;
    const tile = (2 * Math.PI * R) / n;
    const boxes = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      boxes.push({ c: [Math.cos(a) * R, Math.sin(a) * R, 0], h: [tile / 2 + 0.2, 1.3, 1.6], rz: a + Math.PI / 2 });
    }
    const c = at(Math.min(0.5, 14 / seg.len), 0);
    return [{ pos: { x: c.x, y: c.y + R + 1.3, z: c.z }, yaw, boxes }];
  },
  // big boxes on four arms turning round a post, two of them turning opposite ways
  boxspin(seg, at, yaw) {
    const R = Math.min(20, seg.w * 0.3), s = 3.5;
    const boxes = [{ c: [0, 4, 0], h: [1.5, 4, 1.5] }];
    for (const d of [-1, 1]) {
      boxes.push({ c: [d * R / 2, 3, 0], h: [R / 2, 0.8, 0.8] }, { c: [0, 3, d * R / 2], h: [0.8, 0.8, R / 2] });
      boxes.push({ c: [d * R, s, 0], h: [s, s, s] }, { c: [0, s, d * R], h: [s, s, s] });
    }
    return [0.3, 0.7].map((t, i) => {
      const sp = (i % 2 ? 1 : -1) * 0.9;
      return {
        pos: at(t, (i % 2 ? 1 : -1) * Math.min(20, seg.w * 0.18)), yaw, boxes,
        move: (nd, time) => { nd.rotation.y = yaw + time * sp + i; },
      };
    });
  },
};

// a right-angle corner: a red / white wall round the outside of the bend, along the end of the last
// piece and the start of this one
function cornerWalls(group, physics, seg, at, yaw) {
  const prev = COURSE.segs[seg.i - 1];
  const so = -seg.corner, hw = seg.w / 2 - 1.6, len = seg.w + 3.2, h = 6;
  const prevAt = (t, side) => ({
    x: prev.a.x + prev.dx * prev.len * t - prev.dz * side,
    z: prev.a.z + prev.dz * prev.len * t + prev.dx * side,
    y: segTop(prev, t, side),
  });
  for (const [p, ry] of [[at(0, so * hw), yaw], [prevAt(1, so * hw), Math.atan2(prev.dx, prev.dz)]]) {
    const wall = new THREE.Group();
    for (const m of stripes([{ c: [0, h / 2 - 1, 0], h: [1.2, h / 2 + 1, len / 2] }], materials())) wall.add(m);
    wall.position.set(p.x, p.y, p.z);
    wall.rotation.y = ry;
    group.add(wall);
    physics.addBox({ x: p.x, z: p.z, w: 2.4, d: len, rot: ry, top: p.y + h, bottom: p.y - 2, block: true });
  }
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

// A wide column of yellow light at p. It has its own material so it can fade on its own.
function lightBeam(group, M, p) {
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 170, 20, 1, true), M.beam.clone());
  beam.position.set(p.x, p.y + 85, p.z);
  group.add(beam);
  return { beam, life: 1.4, max: 1.4 };
}

// The big square tunnel round a road piece, in sections: walled and roofed ones (two colours in
// big blocks, swapping each section) and open ones between them, where a big fan off one side blows
// the truck across the road towards the lava. Returns the fans' rotors and wind streaks to animate.
const BOX_H = 28;          // inside height
const WIND = 150;          // push of a fan's wind (acceleration across the road)
function buildBoxTunnel(group, physics, seg, M, at, yaw) {
  let n = Math.max(3, Math.round(seg.len / 35));
  if (n % 2 === 0) n++;    // walled at both ends
  const L = seg.len / n, hw = seg.w / 2;
  const fans = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const c = at(t, 0);
    const node = new THREE.Group();
    node.position.set(c.x, c.y, c.z);
    node.rotation.y = yaw;
    group.add(node);
    if (k % 2 === 0) {
      const [wallM, roofM] = k % 4 === 0 ? [M.tunA, M.tunB] : [M.tunB, M.tunA];
      for (const sx of [-1, 1]) {
        node.add(box(2, BOX_H, L + 0.1, wallM, { x: sx * (hw - 1), y: BOX_H / 2 }));
        const p = at(t, sx * (hw - 1));
        physics.addBox({ x: p.x, z: p.z, w: 2, d: L, rot: yaw, top: p.y + BOX_H, bottom: p.y - 2, block: true });
      }
      node.add(box(seg.w, 2, L + 0.1, roofM, { y: BOX_H + 1 }));
      continue;
    }
    // open: a fan on one side (so: +1 right, -1 left; the node's +x is the road's left)
    const so = ((k - 1) / 2 + seg.i) % 2 ? 1 : -1;
    const fx = -so * (hw + 7);
    const fan = new THREE.Group();
    fan.position.set(fx, 10, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 1.2, 8, 28), M.tunA);
    ring.rotation.y = Math.PI / 2;
    fan.add(ring);
    fan.add(box(2, 40, 2, M.tunB, { y: -24 }));                  // the stand, down past the slab
    const rotor = new THREE.Group();
    rotor.add(box(2.4, 2.4, 2.4, M.tunA));
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Group();
      blade.rotation.x = (b / 4) * Math.PI * 2;
      blade.add(box(0.8, 7.5, 3, M.tunB, { y: 4.4, rx: 0.35 }));
      rotor.add(blade);
    }
    fan.add(rotor);
    node.add(fan);
    // white streaks of wind blowing across from the fan
    const streaks = [];
    for (let s = 0; s < 10; s++) {
      const m = box(6, 0.25, 0.25, M.windStreak.clone(), { y: 2 + ((s * 7) % 13), z: ((s * 0.37) % 1 - 0.5) * L * 0.9, cast: false, receive: false });
      node.add(m);
      streaks.push({ m, ph: s * 0.29 });
    }
    fans.push({ rotor, streaks, so, span: seg.w + 12 });
    physics.addWind({ x: c.x, z: c.z, w: seg.w + 10, d: L, rot: yaw, y: c.y, fx: so * seg.dz * WIND, fz: -so * seg.dx * WIND });
  }
  return fans;
}

// A big round tube round a road piece, in rings of two colours (big blocks, not stripes) with a thin
// rib of the other colour at each joint. The road crosses the tube a little below its middle, so
// there is plenty of room overhead. Low walls on the road edges keep trucks inside.
function buildRoundTunnel(group, physics, seg, M, at, yaw) {
  const hw = seg.w / 2;
  const R = hw + 6, lift = R * 0.35;           // radius, centre above the road
  const n = Math.max(3, Math.round(seg.len / 30)), L = seg.len / n;
  const slope = Math.atan2(seg.b.y - seg.a.y, seg.len);
  const ring = new THREE.CylinderGeometry(R, R, L, 40, 1, true);
  ring.rotateX(Math.PI / 2);
  const rib = new THREE.TorusGeometry(R + 0.4, 0.9, 8, 40);
  for (let k = 0; k < n; k++) {
    const c = at((k + 0.5) / n, 0);
    const node = new THREE.Group();
    node.position.set(c.x, c.y + lift, c.z);
    node.rotation.order = 'YXZ';
    node.rotation.set(-slope, yaw, 0);
    const [a, b] = k % 2 ? [M.tubeB, M.tubeA] : [M.tubeA, M.tubeB];
    const m = new THREE.Mesh(ring, a);
    m.receiveShadow = true;
    node.add(m);
    const r = new THREE.Mesh(rib, b);
    r.position.z = -L / 2;
    node.add(r);
    group.add(node);
  }
  for (const sx of [-1, 1]) {
    const p = at(0.5, sx * (hw - 1));
    physics.addBox({ x: p.x, z: p.z, w: 2, d: seg.len, rot: yaw, top: p.y + 6, bottom: p.y - 2, block: true });
  }
}

// The lilac hexagonal tunnel round a road piece: five panels (the road is the sixth, at the bottom)
// and teal ribs at both ends. Low walls on the road edges keep trucks inside.
function buildTunnel(group, physics, seg, M, at, yaw) {
  const hw = seg.w / 2, Rx = seg.w, Ry = 28;
  const cy = Ry * Math.sin(Math.PI / 3);
  const V = [240, 300, 0, 60, 120, 180].map((d) => {
    const a = (d * Math.PI) / 180;
    return [Rx * Math.cos(a), cy + Ry * Math.sin(a)];
  });
  const c = at(0.5, 0);
  const tube = new THREE.Group();
  const slope = Math.atan2(seg.b.y - seg.a.y, seg.len);
  for (let k = 1; k < 6; k++) {
    const [x0, y0] = V[k], [x1, y1] = V[(k + 1) % 6];
    const wide = Math.hypot(x1 - x0, y1 - y0);
    const panel = box(wide, 0.8, seg.len + 0.5, M.tube, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rz: Math.atan2(y1 - y0, x1 - x0), cast: false });
    tube.add(panel);
    for (const z of [-seg.len / 2, seg.len / 2]) {
      tube.add(box(wide + 1.2, 1.6, 1.6, M.rib, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, rz: Math.atan2(y1 - y0, x1 - x0), cast: false }));
    }
  }
  tube.position.set(c.x, c.y, c.z);
  tube.rotation.order = 'YXZ';
  tube.rotation.set(-slope, yaw, 0);
  group.add(tube);
  for (const sx of [-1, 1]) {
    const p = at(0.5, sx * (hw - 1));
    physics.addBox({ x: p.x, z: p.z, w: 2, d: seg.len, rot: yaw, top: p.y + 6, bottom: p.y - 2, block: true });
  }
}

// A big gold cup on a two-step black plinth with a gold plate: turned (lathe) bowl, stem and foot,
// two looping handles and a star on top. userData.cup is the part that turns.
function trophyMesh() {
  const gold = new THREE.MeshStandardMaterial({
    color: '#ffd04a', metalness: 0.75, roughness: 0.18, emissive: '#6b4300', emissiveIntensity: 0.35,
    envMap: studioEnv(), envMapIntensity: 1.6, side: THREE.DoubleSide,
  });
  const stone = new THREE.MeshStandardMaterial({ color: '#17161c', metalness: 0.2, roughness: 0.25, envMap: studioEnv(), envMapIntensity: 0.6 });
  const g = new THREE.Group();
  g.add(box(18, 3.5, 18, stone, { y: 1.75, radius: 0.4 }));
  g.add(box(13, 4, 13, stone, { y: 5.5, radius: 0.4 }));
  g.add(box(13.2, 0.6, 13.2, gold, { y: 7.2 }));
  g.add(box(7, 2.2, 0.3, gold, { y: 5.4, z: 6.55 }));          // name plate
  const cup = new THREE.Group();
  cup.position.y = 7.5;
  // profile (radius, height) from the foot up to the lip of the bowl and back down inside it
  const P = [
    [0, 0], [5.2, 0], [5.4, 0.6], [4.6, 1.2], [3.2, 1.8], [2, 2.6], [1.3, 4], [1.2, 6], [2.2, 6.8], [2.3, 7.6],
    [1.3, 8.4], [1.4, 10], [2.6, 11], [5, 12.4], [7.4, 14.6], [8.8, 17.6], [9.4, 21], [9.6, 23.6], [10.2, 24.2],
    [9.9, 24.6], [9, 24], [8.6, 21], [7.8, 17.6], [6, 14.6], [0, 13.2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(P, 48), gold);
  body.castShadow = true;
  cup.add(body);
  // handles: ear-shaped loops from just under the rim out and down to the lower bowl
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([[9.2, 22.6], [12.6, 22.8], [14.6, 20.2], [13.6, 16.6], [10.6, 14.8], [7.6, 15.2]]
      .map(([x, y]) => new THREE.Vector3(sx * x, y, 0)));
    const h = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.8, 12, false), gold);
    h.castShadow = true;
    cup.add(h);
  }
  // a rolled lip on the rim and a raised band round the bowl
  const lip = new THREE.Mesh(new THREE.TorusGeometry(10, 0.45, 10, 48), gold);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 24.4;
  cup.add(lip);
  const band = new THREE.Mesh(new THREE.TorusGeometry(9.25, 0.4, 10, 48), gold);
  band.rotation.x = Math.PI / 2;
  band.position.y = 19.6;
  cup.add(band);
  // a star over the bowl
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 1.6 : 3.8;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const s = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 0.8, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2, bevelSegments: 2 }), gold);
  s.position.set(0, 29.5, -0.4);
  cup.add(s);
  cup.add(box(0.6, 4, 0.6, gold, { y: 26.3 }));
  g.add(cup);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,214,90,0.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(46, 46, 1);
  glow.position.y = 24;
  g.add(glow);
  g.userData.cup = cup;
  return g;
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
