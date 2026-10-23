// Procedural monster trucks (faces +Z, wheels on y = 0). One builder, four body styles:
//   pickup  - the blue early-90s Ford F-150 starter truck: glossy paint, wheel arches, chrome grille
//             and bumpers, amber corner lights, dark see-through glass, white roll bar with 4 lights
//   flower  - pickup painted pink with flower decals (FREE CAR!)
//   cyber   - steel wedge (Cybertruck)
//   beast   - creature trucks with teeth, eyes and spikes (Dragonoid, Jurassic Attack, Hellfire)
// Lifted high on yellow coil-overs over navy axles, big round balloon tyres with chevron lugs and
// white "BFGoodrich / Radial T/A" sidewall lettering on white rims, and a cosmetic hat on the roof.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plastic, neon } from '../util/materials.js';
import { box, cylinder, sphere } from '../util/geometry.js';
import { truckById } from '../../shared/gameData.js';

export const WHEEL_R = 2.45;
const WHEEL_W = 3.0;
const AXLE_Z = 4.3;
const TRACK_X = 4.75;
export const BODY_Y = 5.6;          // underside of the body (lifted: the springs show above the tyres)
const BELT = BODY_Y + 2.75;         // top of the doors / bottom of the side glass
export const ROOF_Y = BELT + 2.3;
const W = 6.6;                      // body width
const ARCH = 2.6;                   // wheel arch half-width

const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

// ---------------------------------------------------------------- materials
// A small painted studio environment (bright sky, grey horizon, dark floor with soft boxes) gives
// the paint, chrome and glass their shine without depending on the scene around them.
function envMap() {
  return cachedGeo('env', () => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.36, '#d6dde6');
    grd.addColorStop(0.48, '#aeb6c2');
    grd.addColorStop(0.53, '#5c6068');
    grd.addColorStop(0.62, '#3a3c42');
    grd.addColorStop(1, '#222326');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(60, 34, 120, 30);
    g.fillRect(310, 26, 150, 26);
    g.fillRect(200, 70, 60, 14);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// glossy clear-coated body paint
function paintMat(color) {
  return cachedGeo(`paint|${color}`, () => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, envMap: envMap(), envMapIntensity: 1.0,
  }));
}
const chrome = () => cachedGeo('chrome', () => new THREE.MeshStandardMaterial({ color: '#e2e6eb', metalness: 1, roughness: 0.16, envMap: envMap() }));
const whiteGloss = () => cachedGeo('whiteGloss', () => new THREE.MeshStandardMaterial({ color: '#f7f7f7', roughness: 0.3, envMap: envMap(), envMapIntensity: 0.3 }));
const rubber = () => cachedGeo('rubber', () => new THREE.MeshStandardMaterial({ color: '#1d1d20', roughness: 0.92 }));
const navy = () => cachedGeo('navy', () => new THREE.MeshStandardMaterial({ color: '#25324a', roughness: 0.45, metalness: 0.35, envMap: envMap(), envMapIntensity: 0.4 }));
const springMat = () => cachedGeo('spring', () => new THREE.MeshStandardMaterial({ color: '#ffd21a', roughness: 0.35, metalness: 0.2, envMap: envMap(), envMapIntensity: 0.5 }));
const interior = () => plastic('#2a2a2e', { roughness: 0.85 });
// dark, see-through tinted glass with reflections
const glassMat = () => cachedGeo('truckGlass', () => new THREE.MeshStandardMaterial({
  color: '#0a0c11', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.58, envMap: envMap(), envMapIntensity: 1.2,
  side: THREE.DoubleSide, depthWrite: false,
}));

// a round rod between two points
function rod(a, b, r, material, segments = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), segments), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- tyre + rim
// balloon tyre: a rounded-square (superellipse) cross section turned around the axle
function tyreGeometry() {
  return cachedGeo('tyre', () => {
    const R = WHEEL_R, w = WHEEL_W / 2, r0 = R * 0.5;
    const rc = (R + r0) / 2, hr = (R - r0) / 2;
    const pts = [];
    const p = 0.5;
    for (let i = 0; i <= 40; i++) {
      const a = -0.85 * Math.PI + (i / 40) * 1.7 * Math.PI;
      const c = Math.cos(a), s = Math.sin(a);
      pts.push(new THREE.Vector2(rc + hr * Math.sign(c) * Math.abs(c) ** p, w * Math.sign(s) * Math.abs(s) ** p));
    }
    const lathe = new THREE.LatheGeometry(pts, 48);
    lathe.rotateZ(Math.PI / 2); // axis along X
    // big chevron lugs: two angled blocks per row meeting in a V, the rows on each side staggered
    const lugs = [];
    const N = 22;
    for (let i = 0; i < N; i++) {
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(w * 0.78, 0.3, 0.5);
        g.rotateY(side * 0.3);
        g.translate(side * w * 0.43, R - 0.04, 0);
        g.rotateX((i / N) * Math.PI * 2);
        lugs.push(g.toNonIndexed());
      }
    }
    const merged = mergeGeometries([lathe.toNonIndexed(), ...lugs]);
    merged.computeVertexNormals();
    return merged;
  });
}

// white "BFGoodrich" over the top and "Radial T/A" along the bottom of the sidewall
const LETTER_IN = 1.42, LETTER_OUT = 2.25;
function letteringTexture() {
  return cachedGeo('lettering', () => {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const r = (1.86 / LETTER_OUT) * (S / 2);
    g.fillStyle = '#f2f2f2';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const arc = (text, size, top) => {
      g.font = `italic 900 ${size}px "Arial Black", Arial, sans-serif`;
      const widths = [...text].map((ch) => g.measureText(ch).width * 1.02);
      const span = widths.reduce((a, b) => a + b, 0) / r;
      let acc = 0;
      [...text].forEach((ch, i) => {
        const along = (acc + widths[i] / 2) / r;
        acc += widths[i];
        const a = top ? -Math.PI / 2 - span / 2 + along : Math.PI / 2 + span / 2 - along;
        g.save();
        g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
        g.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
        g.fillText(ch, 0, 0);
        g.restore();
      });
    };
    arc('BFGoodrich', 84, true);
    arc('Radial T/A', 80, false);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

function makeWheel(rimColor, side) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const w = WHEEL_W / 2;
  const tyre = new THREE.Mesh(tyreGeometry(), rubber());
  tyre.castShadow = true;
  spin.add(tyre);
  // sidewall lettering (a flat ring just off the bulge, both sides read correctly)
  const ring = new THREE.Mesh(
    cachedGeo('letterRing', () => new THREE.RingGeometry(LETTER_IN, LETTER_OUT, 64, 1)),
    cachedGeo('letterMat', () => new THREE.MeshStandardMaterial({ map: letteringTexture(), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 })),
  );
  ring.rotation.y = side * Math.PI / 2;
  ring.position.x = side * (w + 0.02);
  spin.add(ring);
  // white rim: barrel, rolled outer lip, a dished face, grey hub and lug nuts
  const rimMat = rimColor.toLowerCase() === '#f2f2f2' || rimColor.toLowerCase() === '#ffffff' ? whiteGloss() : plastic(rimColor, { roughness: 0.35, metalness: 0.2 });
  spin.add(cylinder(1.15, 1.15, WHEEL_W * 0.86, rimMat, { rz: Math.PI / 2, segments: 28, cast: false, open: true }));
  spin.add(cylinder(1.15, 1.15, 0.08, rimMat, { rz: Math.PI / 2, x: side * w * 0.18, segments: 28, cast: false }));
  const lip = new THREE.Mesh(cachedGeo('rimLip', () => new THREE.TorusGeometry(1.13, 0.12, 8, 32)), rimMat);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = side * w * 0.64;
  spin.add(lip);
  spin.add(cylinder(1.0, 0.6, 0.5, rimMat, { rz: -side * Math.PI / 2, x: side * w * 0.42, segments: 28, cast: false, open: true }));
  spin.add(cylinder(0.5, 0.56, 0.3, plastic('#9a9ea6', { metalness: 0.6, roughness: 0.3 }), { rz: Math.PI / 2, x: side * w * 0.22, segments: 16, cast: false }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spin.add(cylinder(0.08, 0.08, 0.14, plastic('#d8dade', { metalness: 0.5, roughness: 0.3 }), { rz: Math.PI / 2, x: side * w * 0.32, y: Math.cos(a) * 0.36, z: Math.sin(a) * 0.36, segments: 6, cast: false }));
  }
  g.userData.spin = spin;
  return g;
}

// coil-over: white shock body, black shaft and caps, a yellow helical spring around it
function springGeometry(h) {
  return cachedGeo(`spring|${h}`, () => {
    const turns = 7, r = 0.4, y0 = h * 0.12, y1 = h * 0.92;
    const curve = new THREE.Curve();
    curve.getPoint = (t, target = new THREE.Vector3()) => {
      const a = t * turns * Math.PI * 2;
      return target.set(Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r);
    };
    return new THREE.TubeGeometry(curve, turns * 18, 0.085, 6, false);
  });
}
function makeCoilover(h) {
  const g = new THREE.Group();
  g.add(cylinder(0.24, 0.24, h * 0.55, whiteGloss(), { y: h * 0.3, segments: 12, cast: false }));
  g.add(cylinder(0.09, 0.09, h * 0.45, chrome(), { y: h * 0.75, segments: 8, cast: false }));
  g.add(cylinder(0.3, 0.3, 0.22, rubber(), { y: 0.06, segments: 10, cast: false }));
  g.add(cylinder(0.3, 0.3, 0.22, rubber(), { y: h - 0.06, segments: 10, cast: false }));
  const s = new THREE.Mesh(springGeometry(h), springMat());
  s.castShadow = true;
  g.add(s);
  return g;
}

// ---------------------------------------------------------------- bodies
// side outline (a THREE.Shape in z, y) extruded across the truck, centred on x = 0
function extrudeShape(shape, width, bevel = 0.22) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape z -> world z, extrude -> world x
  g.computeVertexNormals();
  return g;
}
function extrudeProfile(points, width, bevel = 0.22) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  return extrudeShape(s, width, bevel);
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
    p.position.set(side * (halfW + 0.03), y, z);
    p.rotation.y = side * Math.PI / 2;
    if (side < 0) p.scale.x = -1;
    group.add(p);
  }
}

function pickupBody(g, t, opts = {}) {
  const paint = paintMat(t.body);
  const add = (m) => { g.add(m); return m; };

  // front body: cab bottom, doors, front fenders with the front wheel arch, hood and nose
  const front = new THREE.Shape();
  front.moveTo(-1.85, BODY_Y);
  front.lineTo(AXLE_Z - ARCH, BODY_Y);
  front.absellipse(AXLE_Z, BODY_Y, ARCH, 1.25, Math.PI, 0, true);
  front.lineTo(7.15, BODY_Y);
  front.lineTo(7.35, BODY_Y + 0.9);
  front.lineTo(7.35, BODY_Y + 2.3);
  front.lineTo(7.05, BODY_Y + 2.6);
  front.lineTo(2.3, BELT);
  front.lineTo(-1.85, BELT);
  front.closePath();
  add(new THREE.Mesh(extrudeShape(front, W, 0.25), paint)).castShadow = true;
  // panel gaps: door outline on each side, hood edges and the cowl line
  const gap = plastic('#0b0f1a', { roughness: 0.9 });
  const doorTop = BELT + 0.2, doorBot = BODY_Y + 0.2, doorF = 1.55, doorR = -1.5;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.005);
    add(box(0.04, doorTop - doorBot, 0.05, gap, { x, y: (doorTop + doorBot) / 2, z: doorF, cast: false }));
    add(box(0.04, doorTop - doorBot, 0.05, gap, { x, y: (doorTop + doorBot) / 2, z: doorR, cast: false }));
    add(box(0.04, 0.05, doorF - doorR, gap, { x, y: doorBot, z: (doorF + doorR) / 2, cast: false }));
    add(rod([sx * (W / 2 - 0.45), BELT + 0.26, 2.4], [sx * (W / 2 - 0.45), BODY_Y + 2.86, 7.0], 0.025, gap, 4));
  }
  add(box(W - 0.9, 0.05, 0.05, gap, { y: BELT + 0.26, z: 2.4, cast: false }));

  // bed: side walls with the rear wheel arch, floor and tailgate
  const wall = new THREE.Shape();
  wall.moveTo(-7.25, BODY_Y);
  wall.lineTo(-AXLE_Z - ARCH, BODY_Y);
  wall.absellipse(-AXLE_Z, BODY_Y, ARCH, 1.25, Math.PI, 0, true);
  wall.lineTo(-1.5, BODY_Y);
  wall.lineTo(-1.5, BELT - 0.05);
  wall.lineTo(-7.25, BELT - 0.05);
  wall.closePath();
  const wallGeo = extrudeShape(wall, 0.4, 0.12);
  for (const sx of [-1, 1]) {
    const m = add(new THREE.Mesh(wallGeo, paint));
    m.position.x = sx * (W / 2 - 0.2);
    m.castShadow = true;
  }
  add(box(W - 0.6, 0.25, 5.4, paint, { y: BODY_Y + 1.42, z: -4.4 }));
  add(box(W - 0.1, BELT - BODY_Y - 1.2, 0.35, paint, { y: (BELT + BODY_Y + 1.2) / 2, z: -7.1, radius: 0.12 }));
  add(box(1.0, 0.18, 0.06, chrome(), { y: BELT - 0.45, z: -7.3, cast: false }));

  // cab: thin pillars and a rounded roof around dark see-through glass, with the cab inside
  const W2 = W - 0.5;
  const wsBottom = [2.3, BELT + 0.05], wsTop = [0.8, ROOF_Y - 0.2];
  add(new THREE.Mesh(extrudeProfile([[0.95, ROOF_Y - 0.35], [0.85, ROOF_Y], [-1.45, ROOF_Y], [-1.6, ROOF_Y - 0.35]], W2, 0.2), paint)).castShadow = true;
  for (const sx of [-1, 1]) {
    const x = sx * (W2 / 2 - 0.14);
    add(rod([x, wsBottom[1], wsBottom[0]], [x, ROOF_Y - 0.15, wsTop[0] + 0.05], 0.16, paint));
    add(rod([x, BELT, -1.5], [x, ROOF_Y - 0.15, -1.5], 0.2, paint));
  }
  add(box(W2, 0.3, 0.3, paint, { y: BELT + 0.1, z: -1.5, cast: false }));
  const gl = glassMat();
  const dz = wsTop[0] - wsBottom[0], dy = wsTop[1] - wsBottom[1];
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W2 - 0.3, Math.hypot(dz, dy)), gl);
  ws.rotation.x = Math.atan2(dz, dy);
  ws.position.set(0, (wsTop[1] + wsBottom[1]) / 2, (wsTop[0] + wsBottom[0]) / 2);
  add(ws);
  const sideShape = new THREE.Shape();
  sideShape.moveTo(2.15, BELT + 0.05);
  sideShape.lineTo(0.85, ROOF_Y - 0.3);
  sideShape.lineTo(-1.35, ROOF_Y - 0.3);
  sideShape.lineTo(-1.35, BELT + 0.05);
  sideShape.closePath();
  const sideGeo = cachedGeo('sideGlass', () => new THREE.ShapeGeometry(sideShape).rotateY(-Math.PI / 2));
  for (const sx of [-1, 1]) {
    const m = add(new THREE.Mesh(sideGeo, gl));
    m.position.x = sx * (W2 / 2 - 0.04);
  }
  add(new THREE.Mesh(new THREE.PlaneGeometry(W2 - 0.6, ROOF_Y - BELT - 0.5), gl)).position.set(0, (ROOF_Y + BELT) / 2 - 0.05, -1.55);
  // inside: bench seat, dashboard, steering wheel (left-hand drive, +x)
  add(box(W2 - 0.9, 1.2, 0.35, interior(), { y: BELT + 0.55, z: -1.15, radius: 0.12, cast: false }));
  add(box(W2 - 0.5, 0.45, 0.8, interior(), { y: BELT + 0.2, z: 1.85, cast: false }));
  const sw = new THREE.Mesh(cachedGeo('steer', () => new THREE.TorusGeometry(0.42, 0.06, 6, 20)), interior());
  sw.position.set(1.3, BELT + 0.7, 1.35);
  sw.rotation.x = -0.9;
  add(sw);

  // nose: chrome grille with bars and the blue oval, headlights, amber corner lights, bumper
  add(box(3.5, 1.05, 0.16, whiteGloss(), { y: BODY_Y + 1.65, z: 7.64, radius: 0.06, cast: false }));
  add(box(3.2, 0.85, 0.1, plastic('#2c2f36'), { y: BODY_Y + 1.65, z: 7.68, cast: false }));
  for (let i = 0; i < 4; i++) add(box(3.2, 0.1, 0.08, chrome(), { y: BODY_Y + 1.3 + i * 0.24, z: 7.73, cast: false }));
  add(sphere(0.3, plastic('#1d4fb8', { roughness: 0.25, metalness: 0.4 }), { y: BODY_Y + 1.66, z: 7.76, sx: 1.4, sy: 0.75, sz: 0.25, detail: 16, cast: false }));
  for (const sx of [-1, 1]) {
    add(box(1.15, 0.62, 0.14, plastic('#f4f6f8', { emissive: '#fff6d8', emissiveIntensity: 0.35, roughness: 0.15 }), { x: sx * 2.3, y: BODY_Y + 1.72, z: 7.66, radius: 0.05, cast: false }));
    const amber = plastic('#ff9a1a', { emissive: '#ff7a1a', emissiveIntensity: 0.35, roughness: 0.2 });
    add(box(0.5, 0.62, 0.14, amber, { x: sx * 3.05, y: BODY_Y + 1.72, z: 7.64, cast: false }));
    add(box(0.12, 0.62, 0.55, amber, { x: sx * 3.32, y: BODY_Y + 1.72, z: 7.3, cast: false }));
    // tail lights in the bed corners
    add(box(0.42, 1.3, 0.2, plastic('#d01818', { emissive: '#a00', emissiveIntensity: 0.45, roughness: 0.2 }), { x: sx * (W / 2 - 0.22), y: BODY_Y + 1.95, z: -7.32, cast: false }));
    // mirrors, door handle and the F-150 badge
    add(box(0.18, 0.5, 0.7, plastic('#1b1b1e'), { x: sx * (W / 2 + 0.35), y: BELT + 0.45, z: 1.95, cast: false }));
    add(box(0.5, 0.1, 0.1, plastic('#1b1b1e'), { x: sx * (W / 2 + 0.1), y: BELT + 0.3, z: 1.95, cast: false }));
    add(box(0.06, 0.12, 0.45, chrome(), { x: sx * (W / 2 + 0.02), y: BELT - 0.4, z: -0.95, cast: false }));
    add(box(0.05, 0.14, 0.6, chrome(), { x: sx * (W / 2 + 0.02), y: BODY_Y + 1.8, z: 5.9, cast: false }));
  }
  add(box(W + 0.3, 0.6, 0.6, chrome(), { y: BODY_Y + 0.55, z: 7.8, radius: 0.18 }));
  add(box(W - 0.4, 0.4, 0.3, plastic('#f2f2f2', { roughness: 0.4 }), { y: BODY_Y + 0.0, z: 7.5, cast: false }));
  add(box(W + 0.2, 0.55, 0.55, chrome(), { y: BODY_Y + 0.55, z: -7.45, radius: 0.16 }));
  add(box(1.6, 0.12, 0.4, plastic('#2a2a2e'), { y: BODY_Y + 0.88, z: -7.45, cast: false }));

  if (opts.rollBar !== false) {
    // white roll bar at the front of the bed: two hoops' posts, a cross bar above the roof with four
    // round white lights on it, and braces running back down into the bed
    const bar = t.trim === '#1b1b1b' ? plastic('#1b1b1b', { roughness: 0.4 }) : whiteGloss();
    const r = 0.2, top = ROOF_Y + 0.9, zf = -2.15;
    for (const sx of [-1, 1]) {
      add(rod([sx * 2.6, BELT - 0.1, zf], [sx * 2.6, top, zf], r, bar));
      add(rod([sx * 2.6, top, zf], [sx * 1.5, BODY_Y + 1.55, -5.3], r, bar));
    }
    add(rod([-2.6, top, zf], [2.6, top, zf], r, bar));
    for (let i = 0; i < 4; i++) {
      const x = -1.95 + i * 1.3;
      add(cylinder(0.1, 0.1, 0.35, bar, { x, y: top + 0.25, z: zf, segments: 6, cast: false }));
      add(sphere(0.4, whiteGloss(), { x, y: top + 0.62, z: zf, sz: 0.75, detail: 16 }));
      add(cylinder(0.32, 0.32, 0.05, plastic('#ffffff', { emissive: '#fffbe8', emissiveIntensity: 0.6 }), { x, y: top + 0.62, z: zf + 0.3, rx: Math.PI / 2, segments: 16, cast: false }));
    }
  }
  if (t.trim && t.style === 'pickup' && t.id !== 'big_blue') decalPlanes(g, decalTexture('stripes', t.trim), { y: BODY_Y + 2.05, z: 0, len: 13.5, h: 1.3, halfW: W / 2 });
  return W;
}

function cyberBody(g, t) {
  const CW = 6.8;
  const steel = plastic(t.body, { roughness: 0.32, metalness: 0.65 });
  const nose = [7.0, BODY_Y + 1.3], peak = [0.4, ROOF_Y + 0.1];
  const body = new THREE.Mesh(extrudeProfile([[7.0, BODY_Y], nose, peak, [-7.0, BODY_Y + 1.8], [-7.0, BODY_Y]], CW, 0.12), steel);
  body.castShadow = true;
  g.add(body);
  // dark glass band on the slope and along the sides, a white light strip across the nose
  const gl = glassMat();
  const at = (z) => peak[1] + ((nose[1] - peak[1]) * (z - peak[0])) / (nose[0] - peak[0]);
  const z0 = 0.8, z1 = 4.2;
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.8, Math.hypot(z1 - z0, at(z1) - at(z0))), gl);
  ws.rotation.x = -Math.PI / 2 + Math.atan2(at(z0) - at(z1), z1 - z0);
  ws.position.set(0, (at(z0) + at(z1)) / 2 + 0.04, (z0 + z1) / 2);
  g.add(ws);
  for (const sx of [-1, 1]) g.add(box(0.08, 0.9, 3.6, gl, { x: sx * (CW / 2 + 0.02), y: ROOF_Y - 1.4, z: 0.4, cast: false }));
  g.add(box(CW - 0.4, 0.14, 0.2, plastic('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 }), { y: BODY_Y + 1.2, z: 7.05, cast: false }));
  g.add(box(CW - 0.4, 0.14, 0.2, neon('#ff2030', 0.9), { y: BODY_Y + 1.6, z: -7.05, cast: false }));
  for (const sz of [-AXLE_Z, AXLE_Z]) for (const sx of [-1, 1]) g.add(box(0.4, 0.5, 5.0, plastic(t.trim), { x: sx * (CW / 2 + 0.1), y: BODY_Y + 0.1, z: sz, cast: false }));
  return CW;
}

function beastBody(g, t) {
  const BW = pickupBody(g, t, { rollBar: false });
  // jaw full of teeth over the grille, angry eyes on the hood, spikes on the roof and the bed walls
  const tooth = cachedGeo('tooth', () => new THREE.ConeGeometry(0.28, 0.75, 4));
  const white = plastic('#ffffff');
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    const up = new THREE.Mesh(tooth, white);
    up.position.set(x, BODY_Y + 2.1, 7.85); up.rotation.x = Math.PI;
    const dn = new THREE.Mesh(tooth, white);
    dn.position.set(x + 0.32, BODY_Y + 1.2, 7.9);
    g.add(up, dn);
  }
  g.add(box(5.8, 1.1, 0.1, plastic('#2a0505'), { y: BODY_Y + 1.65, z: 7.8, cast: false }));
  for (const sx of [-1, 1]) {
    g.add(box(1.3, 0.6, 0.15, neon(t.rim, 1.2), { x: sx * 1.6, y: BODY_Y + 2.9, z: 6.4, rx: -0.3, rz: sx * 0.25, cast: false }));
  }
  const spike = cachedGeo('spike', () => new THREE.ConeGeometry(0.35, 1.3, 5));
  const spMat = plastic(t.trim, { roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(spike, spMat);
    s.position.set(0, ROOF_Y + 0.5, 0.5 - i * 0.9);
    s.rotation.x = -0.35;
    s.castShadow = true;
    g.add(s);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(spike, spMat);
      s.position.set(sx * 3.6, BELT + 0.1, -2.4 - i * 1.3);
      s.rotation.z = -sx * 1.1;
      g.add(s);
    }
  }
  decalPlanes(g, decalTexture(t.id === 'jurassic_attack' ? 'scales' : 'flames', t.trim), { y: BODY_Y + 2.05, z: 0, len: 13.5, h: 1.3, halfW: BW / 2 });
  return BW;
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

    // frame rails, navy axles with their diff housings and the drive shaft
    const frame = plastic('#2b2b2e');
    for (const sx of [-1, 1]) root.add(box(0.4, 0.4, 10.5, frame, { x: sx * 1.3, y: BODY_Y - 0.3 }));
    for (const z of [-2.2, 1.0]) root.add(box(2.6, 0.3, 0.3, frame, { y: BODY_Y - 0.3, z, cast: false }));
    const ax = navy();
    for (const z of [-AXLE_Z, AXLE_Z]) {
      root.add(cylinder(0.3, 0.3, TRACK_X * 2 - WHEEL_W * 0.6, ax, { y: WHEEL_R, z, rz: Math.PI / 2, segments: 12 }));
      root.add(sphere(0.85, ax, { x: 0.35, y: WHEEL_R, z, sx: 0.9, sz: 1.1, detail: 14 }));
    }
    root.add(rod([0.35, WHEEL_R + 0.15, AXLE_Z - 0.8], [0.35, WHEEL_R + 0.15, -AXLE_Z + 0.8], 0.18, ax));
    // yellow coil-overs from the axles up to the frame: a pair by each diff and one inside each wheel,
  // with a white shock beside it
    const h = BODY_Y - 0.6 - (WHEEL_R + 0.25);
    const mount = (x, z, lean) => {
      const c = makeCoilover(h);
      c.position.set(x, WHEEL_R + 0.25, z);
      c.rotation.z = lean;
      root.add(c);
    };
    for (const z of [-AXLE_Z, AXLE_Z]) {
      for (const sx of [-1, 1]) {
        mount(sx * 0.95, z, 0);
        const inward = -Math.sign(z) * 0.95;
        mount(sx * 2.75, z + inward, sx * 0.12);
        const shock = cylinder(0.24, 0.24, h * 0.8, whiteGloss(), { x: sx * 2.85, y: WHEEL_R + 0.25 + h * 0.45, z: z - inward, rz: sx * 0.12, segments: 12, cast: false });
        root.add(shock, cylinder(0.1, 0.1, h * 0.3, chrome(), { x: sx * 2.95, y: BODY_Y - 0.6 - h * 0.12, z: z - inward, rz: sx * 0.12, segments: 8, cast: false }));
      }
    }
    // body
    this.body = new THREE.Group();
    root.add(this.body);
    if (t.style === 'cyber') cyberBody(this.body, t);
    else if (t.style === 'beast') beastBody(this.body, t);
    else {
      pickupBody(this.body, t);
      if (t.style === 'flower') decalPlanes(this.body, decalTexture('flowers'), { y: BODY_Y + 2.05, z: 0, len: 13.5, h: 1.4, halfW: W / 2 });
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
    this.hatSlot.position.set(0, t.style === 'cyber' ? ROOF_Y + 0.1 : ROOF_Y, t.style === 'cyber' ? 0.4 : -0.3);
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

  // where the driver sits (avatar feet), in truck space: head up behind the side glass
  get seat() {
    return { x: 1.3, y: BELT - 0.75, z: -0.55 };
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

  // speed: forward units/s, steer: -1..1 (positive = right), air: in the air (wheels droop),
  // wheelY: each wheel's centre height from the suspension (optional)
  update(dt, speed, steer, air = false, wheelY = null) {
    this.time += dt;
    this.wheelSpin += (speed / WHEEL_R) * dt;
    this.wheels.forEach((w, i) => {
      w.userData.spin.rotation.x = this.wheelSpin;
      if (w.userData.front) w.rotation.y = -steer * 0.45;
      const target = wheelY ? wheelY[i] : WHEEL_R + (air ? -0.45 : 0);
      w.position.y += (target - w.position.y) * Math.min(1, dt * (wheelY ? 30 : 10));
    });
    // body sways a little with steering and bobs with speed
    const bob = Math.sin(this.time * 18) * Math.min(1, Math.abs(speed) / 40) * 0.04;
    this.body.rotation.z += (steer * 0.06 * Math.min(1, Math.abs(speed) / 20) - this.body.rotation.z) * Math.min(1, dt * 6);
    this.body.position.y = bob;
    const hat = this.hatSlot.children[0];
    if (hat?.userData.spin) hat.userData.spin.rotation.y += dt * (6 + Math.abs(speed) * 0.4);
    if (hat?.userData.bob) hat.userData.bob.position.y = 1.4 + Math.sin(this.time * 3) * 0.15;
  }
}
