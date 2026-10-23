// Procedural monster trucks (faces +Z, wheels on y = 0). One builder, four body styles:
//   pickup  - the blue Ford-style starter truck: white roll bar, 4 light pods, chrome bumpers
//   flower  - pickup painted pink with flower decals (FREE CAR!)
//   cyber   - steel wedge (Cybertruck)
//   beast   - creature trucks with teeth, eyes and spikes (Dragonoid, Jurassic Attack, Hellfire)
// Big lugged tyres, yellow coil-over shocks and a cosmetic hat on the roof.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plastic, neon } from '../util/materials.js';
import { box, cylinder, sphere } from '../util/geometry.js';
import { truckById } from '../../shared/gameData.js';

export const WHEEL_R = 2.45;
const WHEEL_W = 2.3;
const AXLE_Z = 4.3;
const TRACK_X = 4.3;
export const BODY_Y = 4.7;          // underside of the body
export const ROOF_Y = 8.45;

const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

const chrome = () => plastic('#e9edf2', { metalness: 0.75, roughness: 0.22 });
const rubber = () => plastic('#232326', { roughness: 0.95 });
const glassMat = () => {
  const k = 'truckGlass';
  geoCache.has(k) || geoCache.set(k, new THREE.MeshStandardMaterial({ color: '#16181f', roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.72 }));
  return geoCache.get(k);
};

// ---------------------------------------------------------------- tyre + rim
function tyreGeometry() {
  return cachedGeo('tyre', () => {
    const R = WHEEL_R, w = WHEEL_W / 2, r0 = R * 0.6;
    const pts = [];
    pts.push(new THREE.Vector2(r0, -w * 0.92));
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI;
      pts.push(new THREE.Vector2(R - 0.35 + Math.cos(a) * 0.35, Math.sin(a) * w));
    }
    pts.push(new THREE.Vector2(r0, w * 0.92));
    const lathe = new THREE.LatheGeometry(pts, 36);
    lathe.rotateZ(Math.PI / 2); // axis along X
    // chunky chevron lugs around the tread
    const lugs = [];
    const N = 22;
    for (let i = 0; i < N; i++) {
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(w * 0.95, 0.32, 0.55);
        g.rotateY(side * 0.35);
        g.translate(side * w * 0.45, R + 0.02, (side > 0 ? 0.25 : -0.25));
        g.rotateX((i / N) * Math.PI * 2 + (side > 0 ? Math.PI / N : 0));
        lugs.push(g);
      }
    }
    const merged = mergeGeometries([lathe.toNonIndexed(), ...lugs.map((g) => g.toNonIndexed())]);
    merged.computeVertexNormals();
    return merged;
  });
}

function makeWheel(rimColor, side) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const tyre = new THREE.Mesh(tyreGeometry(), rubber());
  tyre.castShadow = true;
  spin.add(tyre);
  // dished rim on the outer face, hub and bolts
  const rimMat = plastic(rimColor, { roughness: 0.4, metalness: 0.2 });
  const rim = cylinder(WHEEL_R * 0.58, WHEEL_R * 0.58, WHEEL_W * 0.86, rimMat, { rz: Math.PI / 2, segments: 24, cast: false });
  spin.add(rim);
  const dish = cylinder(WHEEL_R * 0.42, WHEEL_R * 0.5, 0.2, plastic('#c9ccd2', { metalness: 0.5, roughness: 0.3 }), { rz: Math.PI / 2, x: side * WHEEL_W * 0.44, segments: 20, cast: false });
  spin.add(dish);
  const hub = cylinder(0.42, 0.42, 0.3, plastic('#5a5d63', { metalness: 0.6, roughness: 0.3 }), { rz: Math.PI / 2, x: side * WHEEL_W * 0.5, segments: 12, cast: false });
  spin.add(hub);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spin.add(cylinder(0.11, 0.11, 0.16, plastic('#888'), { rz: Math.PI / 2, x: side * WHEEL_W * 0.53, y: Math.cos(a) * 0.75, z: Math.sin(a) * 0.75, segments: 6, cast: false }));
  }
  g.userData.spin = spin;
  return g;
}

// yellow coil-over shock: coil (torus stack) around a chrome rod
function makeShock(h) {
  const g = new THREE.Group();
  g.add(cylinder(0.16, 0.16, h, chrome(), { y: h / 2, segments: 8, cast: false }));
  const coilGeo = cachedGeo('coil', () => new THREE.TorusGeometry(0.42, 0.11, 6, 14));
  const coilMat = plastic('#ffd21a', { roughness: 0.5 });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(coilGeo, coilMat);
    t.rotation.x = Math.PI / 2;
    t.position.y = h * 0.18 + (i / (n - 1)) * h * 0.62;
    g.add(t);
  }
  g.add(cylinder(0.3, 0.3, 0.5, plastic('#2b2b2e'), { y: h - 0.2, segments: 10, cast: false }));
  return g;
}

// ---------------------------------------------------------------- bodies
// side profile (z forward, y up) extruded across the truck
function extrudeProfile(points, width, bevel = 0.22) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // profile z -> world z, extrude -> world x
  g.computeVertexNormals();
  return g;
}

function decalTexture(kind, color) {
  const key = `decal|${kind}|${color}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'flowers') {
    const cols = ['#fff', '#ffe14d', '#7af0ff', '#b6ff5a'];
    for (let i = 0; i < 14; i++) {
      const x = 20 + i * 36 + (i % 2) * 8, y = 30 + ((i * 37) % 70), r = 10 + (i % 3) * 5;
      g.fillStyle = cols[i % cols.length];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath(); g.arc(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.55, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#ff7a1a';
      g.beginPath(); g.arc(x, y, r * 0.4, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'flames') {
    const grd = g.createLinearGradient(0, 0, 512, 0);
    grd.addColorStop(0, '#ffe14d'); grd.addColorStop(0.5, '#ff8a1a'); grd.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 128);
    for (let i = 0; i <= 8; i++) {
      const x = i * 60;
      g.quadraticCurveTo(x + 20, 40 - (i % 2) * 30, x + 50, 70 + (i % 3) * 12);
    }
    g.lineTo(512, 128);
    g.closePath();
    g.fill();
  } else if (kind === 'scales') {
    g.strokeStyle = color;
    g.lineWidth = 6;
    for (let y = 0; y < 128; y += 26) for (let x = (y / 26) % 2 ? 13 : 0; x < 520; x += 26) {
      g.beginPath(); g.arc(x, y, 13, 0, Math.PI); g.stroke();
    }
  } else if (kind === 'stripes') {
    g.fillStyle = color;
    g.fillRect(0, 56, 512, 16);
    g.fillRect(0, 82, 512, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  geoCache.set(key, t);
  return t;
}

function decalPlanes(group, tex, { y, z, len, h, halfW }) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
    p.position.set(side * (halfW + 0.24), y, z);
    p.rotation.y = side * Math.PI / 2;
    if (side < 0) p.scale.x = -1;
    group.add(p);
  }
}

function pickupBody(g, t, opts = {}) {
  const paint = plastic(t.body, { roughness: 0.38, metalness: 0.15 });
  const W = 6.6;
  // hood + cab as one profile
  const cab = new THREE.Mesh(extrudeProfile([
    [6.7, BODY_Y], [6.75, 6.15], [6.3, 6.5], [2.2, 6.75], [1.15, ROOF_Y - 0.1], [-1.15, ROOF_Y - 0.1], [-1.3, 6.6], [-1.3, BODY_Y],
  ], W), paint);
  cab.castShadow = true;
  g.add(cab);
  // bed (floor + walls + tailgate)
  g.add(box(W, 0.5, 5.6, paint, { y: BODY_Y + 0.25, z: -4.1 }));
  for (const sx of [-1, 1]) g.add(box(0.35, 1.75, 5.6, paint, { x: sx * (W / 2 - 0.17), y: BODY_Y + 0.87, z: -4.1 }));
  g.add(box(W, 1.75, 0.35, paint, { y: BODY_Y + 0.87, z: -6.75 }));
  // fender flares
  for (const sz of [-AXLE_Z, AXLE_Z]) for (const sx of [-1, 1]) {
    g.add(box(0.5, 0.55, 4.6, plastic('#1b1b1e'), { x: sx * (W / 2 + 0.15), y: BODY_Y + 0.15, z: sz, cast: false }));
  }
  // glass: windshield, side windows, rear window
  const gl = glassMat();
  const ws = box(W - 0.6, 1.65, 0.12, gl, { y: 7.55, z: 1.82, rx: -0.73, cast: false });
  g.add(ws);
  for (const sx of [-1, 1]) {
    g.add(box(0.1, 1.25, 1.9, gl, { x: sx * (W / 2 + 0.05), y: 7.55, z: 0.25, cast: false }));
    g.add(box(0.1, 1.25, 0.25, paint, { x: sx * (W / 2 + 0.08), y: 7.55, z: 0.25, cast: false }));
  }
  g.add(box(W - 1.2, 1.1, 0.1, gl, { y: 7.45, z: -1.36, cast: false }));
  // grille + headlights + bumpers + tail lights
  g.add(box(4.2, 1.1, 0.2, chrome(), { y: 5.65, z: 7.02, cast: false }));
  for (let i = 0; i < 4; i++) g.add(box(3.9, 0.08, 0.1, plastic('#5a5d63'), { y: 5.3 + i * 0.25, z: 7.12, cast: false }));
  for (const sx of [-1, 1]) {
    g.add(box(1.0, 0.7, 0.2, plastic('#ffffff', { emissive: '#fff6d8', emissiveIntensity: 0.5 }), { x: sx * 2.65, y: 5.75, z: 7.02, cast: false }));
    g.add(box(0.45, 0.32, 0.18, plastic('#ff9a1a', { emissive: '#ff7a1a', emissiveIntensity: 0.4 }), { x: sx * 2.65, y: 5.15, z: 7.04, cast: false }));
    g.add(box(0.5, 1.05, 0.15, plastic('#d01818', { emissive: '#a00', emissiveIntensity: 0.5 }), { x: sx * 2.95, y: 5.7, z: -7.0, cast: false }));
  }
  g.add(box(W + 0.4, 0.65, 0.55, chrome(), { y: BODY_Y + 0.05, z: 7.3 }));
  g.add(box(W + 0.4, 0.55, 0.5, chrome(), { y: BODY_Y + 0.05, z: -7.15 }));
  // side mirrors + door handles
  for (const sx of [-1, 1]) {
    g.add(box(0.25, 0.45, 0.6, plastic('#1b1b1e'), { x: sx * (W / 2 + 0.35), y: 7.0, z: 1.3, cast: false }));
    g.add(box(0.08, 0.12, 0.4, chrome(), { x: sx * (W / 2 + 0.1), y: 6.4, z: -0.3, cast: false }));
  }
  if (opts.rollBar !== false) {
    // white roll bar over the bed with 4 white light pods on top
    const bar = plastic(t.trim === '#1b1b1b' ? '#1b1b1b' : '#f4f4f4', { roughness: 0.4 });
    const r = 0.2;
    for (const sx of [-1, 1]) {
      g.add(cylinder(r, r, 3.0, bar, { x: sx * 2.6, y: BODY_Y + 2.5, z: -1.9, segments: 8 }));
      g.add(cylinder(r, r, 3.4, bar, { x: sx * 2.6, y: BODY_Y + 2.2, z: -3.4, rx: -0.6, segments: 8 }));
      g.add(cylinder(r, r, 3.2, bar, { x: sx * 2.3, y: BODY_Y + 2.1, z: -5.2, rx: 0.65, segments: 8 }));
    }
    g.add(cylinder(r, r, 5.2, bar, { y: BODY_Y + 4.0, z: -1.9, rz: Math.PI / 2, segments: 8 }));
    for (let i = 0; i < 4; i++) {
      const x = -1.95 + i * 1.3;
      g.add(sphere(0.42, plastic('#ffffff', { emissive: '#fffbe8', emissiveIntensity: 0.35 }), { x, y: BODY_Y + 4.55, z: -1.75, detail: 12 }));
      g.add(cylinder(0.12, 0.12, 0.4, bar, { x, y: BODY_Y + 4.2, z: -1.85, segments: 6, cast: false }));
    }
  }
  if (t.trim && t.style === 'pickup' && t.id !== 'big_blue') decalPlanes(g, decalTexture('stripes', t.trim), { y: 5.6, z: 0.6, len: 11.5, h: 2.2, halfW: W / 2 });
  return W;
}

function cyberBody(g, t) {
  const W = 6.8;
  const steel = plastic(t.body, { roughness: 0.32, metalness: 0.65 });
  const body = new THREE.Mesh(extrudeProfile([[7.0, BODY_Y], [7.0, 6.0], [0.4, ROOF_Y + 0.1], [-7.0, 6.5], [-7.0, BODY_Y]], W, 0.12), steel);
  body.castShadow = true;
  g.add(body);
  // dark glass band and a white light strip across the nose
  const gl = glassMat();
  const ws = box(W - 0.8, 0.12, 4.2, gl, { y: 7.25, z: 2.6, rx: 0.36, cast: false });
  g.add(ws);
  for (const sx of [-1, 1]) g.add(box(0.1, 1.0, 3.4, gl, { x: sx * (W / 2 + 0.03), y: 7.0, z: 0.6, rx: 0.05, cast: false }));
  g.add(box(W - 0.4, 0.14, 0.2, plastic('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 }), { y: 5.95, z: 7.05, cast: false }));
  g.add(box(W - 0.4, 0.14, 0.2, neon('#ff2030', 0.9), { y: 6.4, z: -7.05, cast: false }));
  for (const sz of [-AXLE_Z, AXLE_Z]) for (const sx of [-1, 1]) g.add(box(0.4, 0.5, 4.6, plastic(t.trim), { x: sx * (W / 2 + 0.1), y: BODY_Y + 0.1, z: sz, cast: false }));
  return W;
}

function beastBody(g, t) {
  const W = pickupBody(g, t, { rollBar: false });
  // jaw full of teeth over the grille, angry eyes on the hood, spikes along the roof
  const tooth = cachedGeo('tooth', () => new THREE.ConeGeometry(0.28, 0.75, 4));
  const white = plastic('#ffffff');
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    const up = new THREE.Mesh(tooth, white);
    up.position.set(x, 6.05, 7.2); up.rotation.x = Math.PI;
    const dn = new THREE.Mesh(tooth, white);
    dn.position.set(x + 0.32, 5.15, 7.25);
    g.add(up, dn);
  }
  g.add(box(5.8, 0.9, 0.1, plastic('#2a0505'), { y: 5.6, z: 7.13, cast: false }));
  for (const sx of [-1, 1]) {
    const eye = box(1.3, 0.6, 0.15, neon(t.rim, 1.2), { x: sx * 1.6, y: 6.6, z: 5.9, rx: -0.2, rz: sx * 0.25, cast: false });
    g.add(eye);
  }
  const spike = cachedGeo('spike', () => new THREE.ConeGeometry(0.35, 1.3, 5));
  const spMat = plastic(t.trim, { roughness: 0.5 });
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(spike, spMat);
    s.position.set(0, i < 3 ? ROOF_Y + 0.5 : BODY_Y + 2.2 - (i - 3) * 0.05, 0.8 - i * 1.25);
    s.rotation.x = -0.35;
    s.castShadow = true;
    g.add(s);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(spike, spMat);
      s.position.set(sx * 3.6, BODY_Y + 1.6, -2.2 - i * 1.3);
      s.rotation.z = -sx * 1.1;
      g.add(s);
    }
  }
  decalPlanes(g, decalTexture(t.id === 'jurassic_attack' ? 'scales' : 'flames', t.trim), { y: 5.6, z: 0.4, len: 12, h: 2.4, halfW: W / 2 });
  return W;
}

// ---------------------------------------------------------------- hats (on the cab roof)
export function makeHat(id) {
  const g = new THREE.Group();
  if (!id) return g;
  if (id === 'propeller') {
    const cols = ['#2f6bff', '#ffd21a', '#ff3a3a', '#4cd137'];
    for (let i = 0; i < 4; i++) {
      const q = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8, (i / 4) * Math.PI * 2, Math.PI / 2, 0, Math.PI / 2), plastic(cols[i]));
      q.castShadow = true;
      g.add(q);
    }
    g.add(box(1.4, 0.12, 1.0, plastic('#2f6bff'), { y: 0.05, z: 1.2 }));
    g.add(cylinder(0.06, 0.06, 0.5, plastic('#ccc'), { y: 1.3 }));
    const prop = new THREE.Group();
    prop.position.y = 1.55;
    prop.add(box(2.2, 0.06, 0.3, plastic('#ff3a3a')), box(0.3, 0.06, 2.2, plastic('#ffd21a')));
    g.add(prop);
    g.userData.spin = prop;
  } else if (id === 'horns') {
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 10), plastic('#d01818', { emissive: '#600', emissiveIntensity: 0.4 }));
      h.position.set(sx * 1.4, 0.8, 0);
      h.rotation.z = -sx * 0.45;
      g.add(h);
    }
  } else if (id === 'cone') {
    g.add(box(1.8, 0.2, 1.8, plastic('#ff7a1a'), { y: 0.1 }));
    g.add(cylinder(0.15, 0.75, 2.2, plastic('#ff7a1a'), { y: 1.2, segments: 16 }));
    g.add(cylinder(0.43, 0.56, 0.4, plastic('#ffffff'), { y: 1.2, segments: 16 }));
  } else if (id === 'crown') {
    const gold = plastic('#ffcc1a', { metalness: 0.6, roughness: 0.3 });
    g.add(cylinder(1.0, 1.0, 0.6, gold, { y: 0.3, segments: 16, open: true }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), gold);
      s.position.set(Math.cos(a), 0.9, Math.sin(a));
      g.add(s);
      g.add(sphere(0.13, plastic(i % 2 ? '#ff2a3a' : '#2f9bff'), { x: Math.cos(a) * 1.01, y: 0.35, z: Math.sin(a) * 1.01, detail: 8 }));
    }
  } else if (id === 'halo') {
    const h = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.18, 8, 24), neon('#ff8a1a', 1.6));
    h.rotation.x = Math.PI / 2;
    h.position.y = 1.4;
    g.add(h);
    g.userData.bob = h;
  } else if (id === 'tophat') {
    g.add(cylinder(1.4, 1.4, 0.15, plastic('#1b1b1e'), { y: 0.08, segments: 20 }));
    g.add(cylinder(0.9, 0.9, 1.6, plastic('#1b1b1e'), { y: 0.9, segments: 20 }));
    g.add(cylinder(0.92, 0.92, 0.3, plastic('#d01818'), { y: 0.35, segments: 20 }));
  }
  return g;
}

// ---------------------------------------------------------------- the truck
export class MonsterTruck {
  constructor(truckId = 'big_blue', { shadows = true } = {}) {
    this.object = new THREE.Group();
    this.shadows = shadows;
    this.wheelSpin = 0;
    this.time = 0;
    this.build(truckId);
  }

  build(id) {
    this.id = truckById(id).id;
    const t = truckById(id);
    if (this.chassis) this.object.remove(this.chassis);
    const root = new THREE.Group();
    this.chassis = root;
    this.object.add(root);

    // frame, axles and the 4 coil-overs per side
    const frame = plastic('#2b2b2e');
    root.add(box(3.2, 0.6, 12.5, frame, { y: 3.6 }));
    for (const z of [-AXLE_Z, AXLE_Z]) {
      root.add(cylinder(0.35, 0.35, TRACK_X * 2, frame, { y: WHEEL_R, z, rz: Math.PI / 2, segments: 10 }));
      root.add(sphere(0.9, frame, { y: WHEEL_R, z, detail: 10 }));
      for (const sx of [-1, 1]) {
        for (const dz of [-0.7, 0.7]) {
          const sh = makeShock(2.1);
          sh.position.set(sx * 2.3, WHEEL_R + 0.1, z + dz);
          sh.rotation.z = sx * 0.25;
          root.add(sh);
        }
      }
    }
    // body
    this.body = new THREE.Group();
    root.add(this.body);
    if (t.style === 'cyber') cyberBody(this.body, t);
    else if (t.style === 'beast') beastBody(this.body, t);
    else {
      pickupBody(this.body, t);
      if (t.style === 'flower') decalPlanes(this.body, decalTexture('flowers'), { y: 5.7, z: 0.4, len: 12, h: 2.6, halfW: 3.3 });
    }
    // wheels
    this.wheels = [];
    for (const z of [AXLE_Z, -AXLE_Z]) {
      for (const sx of [-1, 1]) {
        const w = makeWheel(t.rim, sx);
        w.position.set(sx * TRACK_X, WHEEL_R, z);
        w.userData.front = z > 0;
        root.add(w);
        this.wheels.push(w);
      }
    }
    // hat slot on the roof
    this.hatSlot = new THREE.Group();
    this.hatSlot.position.set(0, t.style === 'cyber' ? ROOF_Y + 0.1 : ROOF_Y, t.style === 'cyber' ? 0.4 : 0);
    this.hatSlot.scale.setScalar(1.25);
    this.body.add(this.hatSlot);
    if (this.hatId) this.setHat(this.hatId, true);

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = this.shadows && o.castShadow;
        o.receiveShadow = false;
      }
    });
  }

  // where the driver sits (avatar feet), in truck space
  get seat() {
    return { x: 1.3, y: BODY_Y + 0.5, z: 0.35 };
  }

  setTruck(id) {
    if (truckById(id).id === this.id) return false;
    this.build(id);
    return true;
  }

  setHat(id, force = false) {
    if (!force && id === this.hatId) return;
    this.hatId = id || null;
    this.hatSlot.clear();
    if (id) this.hatSlot.add(makeHat(id));
  }

  // speed: forward units/s, steer: -1..1 (positive = right), air: in the air (wheels droop)
  update(dt, speed, steer, air = false) {
    this.time += dt;
    this.wheelSpin += (speed / WHEEL_R) * dt;
    for (const w of this.wheels) {
      w.userData.spin.rotation.x = this.wheelSpin;
      if (w.userData.front) w.rotation.y = -steer * 0.45;
      const droop = air ? -0.45 : 0;
      w.position.y += (WHEEL_R + droop - w.position.y) * Math.min(1, dt * 10);
    }
    // body sways a little with steering and bobs with speed
    const bob = Math.sin(this.time * 18) * Math.min(1, Math.abs(speed) / 40) * 0.04;
    this.body.rotation.z += (steer * 0.06 * Math.min(1, Math.abs(speed) / 20) - this.body.rotation.z) * Math.min(1, dt * 6);
    this.body.position.y = bob;
    const hat = this.hatSlot.children[0];
    if (hat?.userData.spin) hat.userData.spin.rotation.y += dt * (6 + Math.abs(speed) * 0.4);
    if (hat?.userData.bob) hat.userData.bob.position.y = 1.4 + Math.sin(this.time * 3) * 0.15;
  }
}
