// Spawn plaza props from the reference:
//  - teal fins either side of the sand ramp where the course starts
//  - the Daily Wheel: a giant monster tyre on a stand with a coloured prize wheel in it
//  - buff pads: hex pads with a light beam and a floating badge (X2 XP, X2 CASH, NITRO, MORE HATS)
//  - truck showcase: every truck on a neon hex ring (FREE CAR!, ON SALE, LIMITED TIME, its price)

import * as THREE from 'three';
import { WORLD, TRUCKS, PASSES, WHEEL_SEGMENTS, truckById, formatShort } from '../../shared/gameData.js';
import { plastic, neon } from '../util/materials.js';
import { box, cylinder, mergeStatic } from '../util/geometry.js';
import { treadTexture, glowTexture, beamTexture } from '../util/textures.js';
import { drawOutlinedText, canvasTexture, FONT_LABEL, FONT_UI, measure } from '../util/canvasText.js';
import { drawIcon, drawBadge } from '../util/art2d.js';
import { MonsterTruck } from './MonsterTruck.js';

// ---------------------------------------------------------------- hex rings
// six chunky trapezoids with small gaps, like the reference pads
export function hexRing(rOut, rIn, h, material, gap = 0.08) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + gap, a1 = ((i + 1) / 6) * Math.PI * 2 - gap;
    const s = new THREE.Shape();
    s.moveTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
    s.lineTo(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
    s.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
    s.lineTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function hexDisc(r, h, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), material);
  m.position.y = h / 2;
  m.receiveShadow = true;
  return m;
}

function sprite(canvas, height, { depthTest = true } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false, depthTest }));
  s.scale.set(height * (canvas.width / canvas.height), height, 1);
  s.renderOrder = 5;
  return s;
}

// italic yellow "LIMITED TIME" style label with an optional small line above / below
function labelCanvas({ big, bigFill = '#ffe31a', small, smallFill = '#ffffff', under, underFill = '#ff4ad8' }) {
  const bs = 96, ss = 34, us = 26;
  const w = Math.max(measure(big, bs, FONT_LABEL, 400) * 1.15, small ? measure(small, ss, FONT_LABEL, 400) : 0, under ? measure(under, us, FONT_LABEL, 400) : 0) + 60;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = (small ? 44 : 6) + 110 + (under ? 36 : 6);
  const g = c.getContext('2d');
  let y = 6;
  if (small) {
    drawOutlinedText(g, small, c.width / 2, y + 22, { size: ss, font: FONT_LABEL, weight: 400, fill: smallFill, stroke: '#1b1b2b', strokeWidth: 5 });
    y += 40;
  }
  drawOutlinedText(g, big, c.width / 2, y + 56, { size: bs, font: FONT_LABEL, weight: 400, fill: { gradient: [[0, '#fff36a'], [1, bigFill]] }, stroke: '#1b1b2b', strokeWidth: 9, skewX: -0.18, letterSpacing: 2 });
  if (under) drawOutlinedText(g, under, c.width / 2, y + 128, { size: us, font: FONT_LABEL, weight: 400, fill: underFill, stroke: '#1b1b2b', strokeWidth: 4 });
  return c;
}

// ---------------------------------------------------------------- teal fins at the course start
function fins(scene, physics) {
  const mat = plastic('#3e8e8b', { roughness: 0.8 });
  const top = plastic('#59b3ae', { roughness: 0.8 });
  const H = WORLD.plazaHalf;
  for (const sx of [-1, 1]) {
    // a triangle standing up along the ramp: tall at the plaza edge, down to the ramp's foot
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(30, 13);
    s.lineTo(92, -12);
    s.lineTo(92, -16);
    s.lineTo(0, -16);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1 });
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, [mat, top]);
    m.position.set(sx * 31.5 - 1.5, 0, -H);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    physics.addBox({ x: sx * 32, z: -H - 46, w: 3.5, d: 92, top: 14, bottom: -20 });
  }
}

// ---------------------------------------------------------------- Daily Wheel (giant tyre)
function wheelFaceTexture() {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const cx = N / 2, R = N / 2 - 4;
  const n = WHEEL_SEGMENTS.length;
  WHEEL_SEGMENTS.forEach((s, i) => {
    const a0 = -Math.PI / 2 - Math.PI / n + (i / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n;
    g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, R, a0, a1); g.closePath();
    g.fillStyle = s.color; g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
    const am = (a0 + a1) / 2;
    drawIcon(g, s.icon, cx + Math.cos(am) * R * 0.66 - 40, cx + Math.sin(am) * R * 0.66 - 40, 80);
  });
  // red hub with a gold star
  g.beginPath(); g.arc(cx, cx, R * 0.27, 0, Math.PI * 2); g.fillStyle = '#c81e26'; g.fill();
  g.lineWidth = 10; g.strokeStyle = '#7a0a10'; g.stroke();
  g.beginPath(); g.arc(cx, cx, R * 0.16, 0, Math.PI * 2); g.fillStyle = '#e4232b'; g.fill();
  drawIcon(g, 'star', cx - 34, cx - 34, 68);
  return canvasTexture(c);
}

// gold sunburst: soft radial rays from a bright centre, fading out
function raysTexture() {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const cx = N / 2;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, w = (Math.PI / n) * 0.55;
    const gr = g.createRadialGradient(cx, cx, N * 0.12, cx, cx, N / 2);
    gr.addColorStop(0, 'rgba(255,236,140,0.95)');
    gr.addColorStop(0.5, 'rgba(255,200,60,0.55)');
    gr.addColorStop(1, 'rgba(255,170,20,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx, cx);
    g.arc(cx, cx, N / 2, a - w, a + w);
    g.closePath();
    g.fill();
  }
  const halo = g.createRadialGradient(cx, cx, N * 0.2, cx, cx, N * 0.34);
  halo.addColorStop(0, 'rgba(255,220,90,0.8)');
  halo.addColorStop(1, 'rgba(255,200,60,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, N, N);
  return canvasTexture(c);
}

const WHEEL_SCALE = 1.7;    // the giant tyre towers over the trucks

function dailyWheel(scene, physics, pos) {
  const root = new THREE.Group();
  root.position.set(pos.x, 0, pos.z);
  root.rotation.y = pos.ry || 0;
  root.scale.setScalar(WHEEL_SCALE);
  scene.add(root);
  const R = 11.5, W = 7;
  // stand: bronze trapezoid base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 8, 2.2, 4), plastic('#8a6a3a', { roughness: 0.7 }));
  base.rotation.y = Math.PI / 4;
  base.scale.z = 0.55;
  base.position.y = 1.1;
  base.castShadow = true;
  root.add(base);
  // the tyre (lathe, tread on the outside) standing on its edge, facing +z
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI / 2 + (i / 14) * Math.PI;
    pts.push(new THREE.Vector2(R - 1.6 + Math.cos(a) * 1.6 + (Math.abs(Math.sin(a)) < 0.9 ? 0 : 0), Math.sin(a) * W / 2));
  }
  pts.unshift(new THREE.Vector2(R * 0.72, -W / 2 * 0.9));
  pts.push(new THREE.Vector2(R * 0.72, W / 2 * 0.9));
  const tread = treadTexture().clone();
  tread.needsUpdate = true;
  tread.repeat.set(3, 1);
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshStandardMaterial({ map: tread, roughness: 0.9 }));
  tyre.rotation.x = Math.PI / 2;
  // big lugs
  const lugGeo = new THREE.BoxGeometry(2.2, 1.0, W * 0.48);
  const lugMat = plastic('#2a2a2d', { roughness: 0.95 });
  const spinner = new THREE.Group();
  spinner.add(tyre);
  for (let i = 0; i < 26; i++) {
    for (const side of [-1, 1]) {
      const a = (i / 26) * Math.PI * 2 + (side > 0 ? Math.PI / 26 : 0);
      const l = new THREE.Mesh(lugGeo, lugMat);
      l.position.set(Math.cos(a) * (R + 0.3), Math.sin(a) * (R + 0.3), side * W * 0.25);
      l.rotation.z = a + Math.PI / 2;
      l.rotation.y = side * 0.3;
      spinner.add(l);
    }
  }
  // the prize wheel inside the tyre
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.73, 48), new THREE.MeshStandardMaterial({ map: wheelFaceTexture(), roughness: 0.6 }));
  face.position.z = W * 0.3;
  const back = new THREE.Mesh(new THREE.CircleGeometry(R * 0.73, 32), plastic('#2a2a2d'));
  back.rotation.y = Math.PI;
  back.position.z = -W * 0.3;
  const prize = new THREE.Group();
  prize.add(face);
  spinner.add(prize, back);
  spinner.position.y = R + 1.6;
  root.add(spinner);
  // red pointer at the top
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.4, 4), plastic('#e4232b', { emissive: '#600', emissiveIntensity: 0.3 }));
  ptr.rotation.z = Math.PI;
  ptr.position.set(0, R * 2 + 0.6, W * 0.35);
  root.add(ptr);
  // orange fire glow behind and the glowing yellow hex pad under it
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,150,40,0.9)', 'rgba(255,60,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(R * 4.2, R * 4.2, 1);
  glow.position.set(0, R + 1.6, -W);
  root.add(glow);
  const ring = hexRing(11, 8.4, 0.35, neon('#ffd21a', 0.9), 0.06);
  root.add(ring);
  // shining gold rays all round the tyre, turning slowly
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.6, R * 3.6), new THREE.MeshBasicMaterial({
    map: raysTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  rays.position.set(0, R + 1.6, -W * 0.55);
  root.add(rays);
  root.traverse((o) => { if (o.isMesh && o !== face) o.castShadow = true; });
  mergeStatic(root, [spinner, prize, rays]);   // the 52 lugs and the stand in a few draws
  physics.addBox({ x: pos.x, z: pos.z, w: 16 * WHEEL_SCALE, d: 8 * WHEEL_SCALE, rot: pos.ry || 0, top: 30 * WHEEL_SCALE, bottom: -2 });

  let spin = null;
  return {
    position: new THREE.Vector3(pos.x, 0, pos.z),
    // land prize `index` under the pointer after ~4 s
    spinTo(index) {
      const n = WHEEL_SEGMENTS.length;
      const target = (index / n) * Math.PI * 2;
      const from = prize.rotation.z % (Math.PI * 2);
      spin = { t: 0, dur: 4.2, from, to: target + Math.PI * 2 * 5 };
    },
    update(dt, time) {
      spinner.rotation.z = Math.sin(time * 0.6) * 0.03;
      glow.material.opacity = 0.7 + Math.sin(time * 3) * 0.15;
      rays.rotation.z = time * 0.25;
      rays.material.opacity = 0.85 + Math.sin(time * 2.2) * 0.15;
      if (spin) {
        spin.t = Math.min(spin.dur, spin.t + dt);
        const k = 1 - Math.pow(1 - spin.t / spin.dur, 3);
        prize.rotation.z = spin.from + (spin.to - spin.from) * k;
        if (spin.t >= spin.dur) spin = null;
      }
    },
  };
}

// ---------------------------------------------------------------- buff pads
const PAD_LOOK = {
  x2_xp: { color: '#ffe01a', label: 'X2 XP', icon: 'star' },
  x2_cash: { color: '#5af01a', label: 'X2 CASH', icon: 'cash' },
  nitro: { color: '#e81ae0', label: 'NITRO', icon: 'nitro' },
  more_hats: { color: '#1ac8f0', label: 'MORE HATS', icon: 'hats' },
};

const PAD_SCALE = 1.3;
const PAD_TURN = (30 * Math.PI) / 180;

function buffPad(scene, id, pos) {
  const look = PAD_LOOK[id];
  const root = new THREE.Group();
  root.position.set(pos.x, 0, pos.z);
  root.scale.setScalar(PAD_SCALE);
  scene.add(root);
  const col = new THREE.Color(look.color);
  root.add(hexDisc(5.2, 0.25, plastic(col.clone().lerp(new THREE.Color('#ffffff'), 0.15), { emissive: look.color, emissiveIntensity: 0.25 })));
  const ring = hexRing(6.4, 5.0, 0.6, neon(look.color, 0.75), 0.07);
  root.add(ring);
  // light beam: an open hex cone, bright at the bottom
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.6, 10, 6, 1, true), new THREE.MeshBasicMaterial({
    map: beamTexture(), color: look.color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  beam.position.y = 5;
  root.add(beam);
  // floating badge + label
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  drawBadge(c.getContext('2d'), 128, 128, 110, look.color, look.icon);
  const badge = sprite(c, 5.2);
  badge.position.y = 9.5;
  root.add(badge);
  const lc = document.createElement('canvas');
  lc.width = 420; lc.height = 90;
  drawOutlinedText(lc.getContext('2d'), look.label, 210, 46, { size: 64, font: FONT_LABEL, weight: 400, fill: '#ffffff', stroke: '#1b1b2b', strokeWidth: 8, skewX: -0.15 });
  const label = sprite(lc, 2.2);
  label.position.y = 5.6;
  root.add(label);
  mergeStatic(root);
  return {
    id,
    position: new THREE.Vector3(pos.x, 0, pos.z),
    update(dt, time) {
      badge.position.y = 9.5 + Math.sin(time * 2 + pos.x) * 0.4;
    },
  };
}

// ---------------------------------------------------------------- truck showcase
const RING_COLORS = { 'FREE CAR!': '#ff3ad8', 'ON SALE': '#2fe8ff', 'LIMITED TIME': '#ff1a2e' };

function showcase(scene, physics, truckId, pos) {
  const t = truckById(truckId);
  const color = RING_COLORS[t.label] || '#ffd21a';
  const root = new THREE.Group();
  root.position.set(pos.x, 0, pos.z);
  scene.add(root);
  root.add(hexRing(11, 8.8, 0.5, neon(color, 0.9), 0.1));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(10.5, 6), new THREE.MeshBasicMaterial({ map: glowTexture(color), transparent: true, opacity: 0.55, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  root.add(floor);
  const truck = new MonsterTruck(truckId, { shadows: true });
  truck.object.rotation.y = pos.ry;
  root.add(truck.object);
  const sub = t.id === 'flower_power' ? 'DRIVE IN TO CLAIM IT FOR FREE' : null;
  const big = t.label || (t.how === 'cash' ? `${formatShort(t.price)} CASH` : t.how === 'free' ? 'FREE' : t.how === 'pack' ? 'STARTER PACK' : 'SHOP');
  const label = sprite(labelCanvas({ big, small: t.name.toUpperCase(), smallFill: t.label === 'LIMITED TIME' ? '#ff3a3a' : '#ffffff', under: sub }), sub ? 6.4 : 5.4);
  label.position.y = 15.5;
  root.add(label);
  mergeStatic(root, [], [truck.object]);
  physics.addCylinder({ x: pos.x, z: pos.z, r: 8.2, top: 9, bottom: -2 });
  return {
    id: truckId,
    position: new THREE.Vector3(pos.x, 0, pos.z),
    truck,
    update(dt, time) {
      truck.update(0, 0, 0);
      label.position.y = 15.5 + Math.sin(time * 1.5 + pos.x) * 0.25;
    },
  };
}

// ---------------------------------------------------------------- all props
export function buildSpawnProps(scene, physics) {
  fins(scene, physics);
  // as in the reference: the wheel stands just right of the course exit by the north edge, facing
  // back into the plaza; the pass pads run in a row square to the wheel (straight out from its face,
  // just to its right) towards the middle of the plaza (X2 XP nearest the wheel, More Hats last)
  const wp = { x: 42, z: -96, ry: -0.45 };
  const wheel = dailyWheel(scene, physics, wp);
  const padIds = ['x2_xp', 'x2_cash', 'nitro', 'more_hats'];
  const rx = Math.cos(wp.ry), rz = -Math.sin(wp.ry);   // the wheel's right
  const fx = Math.sin(wp.ry), fz = Math.cos(wp.ry);    // out of its face
  const pads = padIds.map((id, i) => {
    // the row turns 30 degrees out from the wheel's front, away from the course exit
    const o = 30 + i * 18, c = Math.cos(PAD_TURN), sn = Math.sin(PAD_TURN);
    const dx = fx * c + rx * sn, dz = fz * c + rz * sn;
    return buffPad(scene, id, { x: wp.x + rx * 22 + dx * o, z: wp.z + rz * 22 + dz * o });
  });
  // the truck showcases line the north edge left of the exit, curving round the north-west corner,
  // facing into the plaza: Dragonoid next to the exit, then Jurassic Attack, Cybertruck, Flower Power
  const shows = [
    showcase(scene, physics, 'dragonoid', { x: -48, z: -98, ry: 0.3 }),
    showcase(scene, physics, 'jurassic_attack', { x: -72, z: -96, ry: 0.4 }),
    showcase(scene, physics, 'cyber_beast', { x: -94, z: -88, ry: 0.6 }),
    showcase(scene, physics, 'flower_power', { x: -102, z: -64, ry: 0.9 }),
  ];
  // every other truck in a row along the south edge, facing north into the plaza
  const rest = TRUCKS.filter((t) => !shows.some((s) => s.id === t.id));
  rest.forEach((t, i) => {
    const x = (i - (rest.length - 1) / 2) * 32;
    shows.push(showcase(scene, physics, t.id, { x, z: 98, ry: Math.PI }));
  });
  return {
    wheel, pads, shows,
    update(dt, time) {
      wheel.update(dt, time);
      for (const p of pads) p.update(dt, time);
      for (const s of shows) s.update(dt, time);
    },
  };
}

export { PAD_LOOK, PASSES, TRUCKS, FONT_UI };
