// Geometry helpers and a tiny scene-building toolkit.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function box(w, h, d, material, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, radius = 0, cast = true, receive = true } = {}) {
  const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function cylinder(rTop, rBottom, h, material, { x = 0, y = 0, z = 0, segments = 32, rx = 0, ry = 0, rz = 0, cast = true, receive = true, open = false } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function sphere(r, material, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 24, cast = true } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, detail, Math.max(8, detail * 0.75)), material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = cast;
  return m;
}

// Low-poly egg (slightly pointy top) like the Roblox egg meshes.
export function eggGeometry(r = 1, h = 1.35, segments = 10) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = -Math.PI / 2 + t * Math.PI;
    const k = a > 0 ? 0.82 : 1;
    pts.push(new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * (a > 0 ? h : 1)));
  }
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

// Regular polygon ring (e.g. octagonal teleport frame), extruded along Z.
export function polygonRing(sides, outerR, innerR, depth, bevel = 0.3) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const x = Math.cos(a) * outerR, y = Math.sin(a) * outerR;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i <= sides; i++) {
    const a = -(i / sides) * Math.PI * 2 + Math.PI / sides;
    const x = Math.cos(a) * innerR, y = Math.sin(a) * innerR;
    if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

// Rounded inverted-U frame (the white spawn gate), extruded along Z. Legs stand on y = 0.
export function roundedFrame(w, h, t, depth, r) {
  const ri = r * 0.5;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - r);
  s.quadraticCurveTo(-w / 2, h, -w / 2 + r, h);
  s.lineTo(w / 2 - r, h);
  s.quadraticCurveTo(w / 2, h, w / 2, h - r);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2 - t, 0);
  s.lineTo(w / 2 - t, h - t - ri);
  s.quadraticCurveTo(w / 2 - t, h - t, w / 2 - t - ri, h - t);
  s.lineTo(-w / 2 + t + ri, h - t);
  s.quadraticCurveTo(-w / 2 + t, h - t, -w / 2 + t, h - t - ri);
  s.lineTo(-w / 2 + t, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.35, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}
