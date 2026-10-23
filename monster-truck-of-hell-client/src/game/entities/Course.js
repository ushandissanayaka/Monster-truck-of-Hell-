// The race course over the lava: grey studded slabs with red/white curbs, sand ramps with teal sides,
// lava gaps to jump, obstacles (tyre stacks, barrels, sliding pushers), the purple potions and the
// checkered finish. Also builds the spawn plaza slab and its curbs.

import * as THREE from 'three';
import { COURSE, WORLD, POTIONS, FINISH, segCorners } from '../../shared/gameData.js';
import { studTexture, sandTexture, curbTexture, checkerTexture, glowTexture } from '../util/textures.js';
import { plastic, neon } from '../util/materials.js';
import { box, cylinder } from '../util/geometry.js';
import { makeBillboard, FONT_TITLE } from '../util/canvasText.js';
import { rng } from '../util/textures.js';

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
  const r = rng(11);
  for (const seg of COURSE.segs) {
    if (seg.kind === 'gap') continue;
    const c = segCorners(seg);
    const top = [
      { ...c[0], y: seg.a.y }, { ...c[1], y: seg.a.y }, { ...c[2], y: seg.b.y }, { ...c[3], y: seg.b.y },
    ];
    const sand = seg.kind === 'sand';
    addSlab(group, top, sand ? M.sand : M.top, sand ? M.teal : M.side);
    physics.addSegment(seg);

    if (!sand) {
      const inner = segCorners(seg, cw);
      const left = [c[0], inner[0], inner[3], c[3]];
      const right = [inner[1], c[1], c[2], inner[2]];
      for (const q of [left, right]) {
        // strip from the a-end (q[0], q[1]) to the b-end (q[2], q[3])
        curbMesh(group, [q[0], q[1], q[2], q[3]], seg.a.y, seg.b.y);
        const ya = seg.a.y, yb = seg.b.y;
        physics.addSurface(q, Math.max(ya, yb) + WORLD.curbH, (x, z) => {
          const t = Math.max(0, Math.min(1, ((x - seg.a.x) * seg.dx + (z - seg.a.z) * seg.dz) / seg.len));
          return ya + (yb - ya) * t + WORLD.curbH;
        });
      }
    }

    // obstacles
    const at = (t, side) => ({
      x: seg.a.x + seg.dx * seg.len * t - seg.dz * side,
      z: seg.a.z + seg.dz * seg.len * t + seg.dx * side,
      y: seg.a.y + (seg.b.y - seg.a.y) * t,
    });
    if (seg.props === 'tires') {
      for (let i = 0; i < 6; i++) {
        const p = at(0.2 + (i / 6) * 0.65, (r() - 0.5) * (seg.w - 22));
        const stack = tyreStack(2 + Math.floor(r() * 3));
        stack.position.set(p.x, p.y, p.z);
        group.add(stack);
        physics.addCylinder({ x: p.x, z: p.z, r: 3.4, top: p.y + stack.userData.h, bottom: p.y - 1 });
      }
    } else if (seg.props === 'barrels') {
      for (let i = 0; i < 7; i++) {
        const p = at(0.18 + (i / 7) * 0.7, (r() - 0.5) * (seg.w - 20));
        const b = barrel();
        b.position.set(p.x, p.y, p.z);
        group.add(b);
        physics.addCylinder({ x: p.x, z: p.z, r: 2.4, top: p.y + 5.5, bottom: p.y - 1 });
      }
    } else if (seg.props === 'pushers') {
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + i * 0.25;
        const p = at(t, 0);
        const w = 10, d = 8, h = 7;
        const m = new THREE.Group();
        m.add(box(w, h, d, plastic('#e4232b'), { y: h / 2, radius: 0.4 }));
        m.add(box(w + 0.1, 1.4, d + 0.1, plastic('#f7f7f7'), { y: h * 0.55 }));
        m.add(box(w * 0.6, 0.5, d + 0.2, neon('#ffd21a', 0.6), { y: h - 0.8 }));
        m.position.set(p.x, p.y, p.z);
        m.rotation.y = Math.atan2(seg.dx, seg.dz);
        group.add(m);
        const solid = physics.addBox({ x: p.x, z: p.z, w, d, rot: m.rotation.y, top: p.y + h, bottom: p.y - 1 });
        pushers.push({ mesh: m, solid, base: p, nx: -seg.dz, nz: seg.dx, amp: (seg.w - w) / 2 - cw - 1, speed: 0.7 + i * 0.25, phase: i * 1.7 });
      }
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
    update(dt, time) {
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

function tyreStack(n) {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(2.2, 1.1, 10, 22);
  const mat = plastic('#26262a', { roughness: 0.95 });
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(geo, mat);
    t.rotation.x = Math.PI / 2;
    t.position.set((i % 2) * 0.3, 1.1 + i * 2.05, 0);
    t.castShadow = true;
    g.add(t);
  }
  g.userData.h = n * 2.05 + 0.3;
  return g;
}

function barrel() {
  const g = new THREE.Group();
  g.add(cylinder(2.1, 2.1, 5.4, plastic('#d2141c', { roughness: 0.5 }), { y: 2.7, segments: 18 }));
  for (const y of [1.0, 4.4]) g.add(cylinder(2.18, 2.18, 0.35, plastic('#2b2b2e'), { y, segments: 18 }));
  g.add(cylinder(1.6, 1.6, 0.12, plastic('#ffd21a'), { y: 5.45, segments: 18, cast: false }));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
