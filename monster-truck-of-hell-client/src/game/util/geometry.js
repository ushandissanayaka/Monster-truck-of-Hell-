// Geometry helpers and a tiny scene-building toolkit.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// ---------------------------------------------------------------- merging (fewer draw calls)
// Many small meshes cost a draw call each; merged by material they draw in one, looking the same.
const MERGE_ATTRS = ['position', 'normal', 'uv'];

// A mesh's geometry moved by `matrix`, split by material: [{ mat, geo }] (non-indexed, position /
// normal / uv only, no groups). null for meshes that cannot be merged as they are.
export function meshPieces(o, matrix) {
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (o.morphTargetInfluences || mats.some((m) => !m || m.vertexColors)) return null;
  const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
  g.applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) if (!MERGE_ATTRS.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const parts = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
  const out = [];
  for (const p of parts) {
    const mat = mats[p.materialIndex || 0];
    if (!mat) continue;
    let geo = g;
    if (parts.length > 1) {
      geo = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(g.attributes)) {
        geo.setAttribute(name, new THREE.BufferAttribute(a.array.slice(p.start * a.itemSize, (p.start + p.count) * a.itemSize), a.itemSize));
      }
    }
    geo.clearGroups();
    out.push({ mat, geo });
  }
  return out;
}

// Merge the meshes under root into one mesh per material on the node they move with: root itself or
// the nearest node in `keep` above them (the nodes that are animated). Nodes in `skip`, and anything
// marked userData.dynamic, are left as they are, with everything below them.
export function mergeStatic(root, keep = [], skip = []) {
  const keepSet = new Set([root, ...keep]), skipSet = new Set(skip);
  root.updateMatrixWorld(true);
  const batches = new Map();
  const invs = new Map();
  const done = [];
  const visit = (o, owner) => {
    if (skipSet.has(o) || (o !== root && o.userData.dynamic)) return;
    if (o !== root && keepSet.has(o)) owner = o;
    for (const c of o.children.slice()) visit(c, owner);
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || keepSet.has(o)) return;
    let inv = invs.get(owner);
    if (!inv) invs.set(owner, (inv = owner.matrixWorld.clone().invert()));
    const pieces = meshPieces(o, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!pieces) return;
    for (const { mat, geo } of pieces) {
      const key = `${owner.uuid}|${mat.uuid}`;
      let b = batches.get(key);
      if (!b) batches.set(key, (b = { owner, mat, geos: [], cast: false, receive: false }));
      b.geos.push(geo);
      b.cast ||= o.castShadow;
      b.receive ||= o.receiveShadow;
    }
    done.push(o);
  };
  visit(root, root);
  for (const o of done) o.removeFromParent();
  for (const b of batches.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    b.owner.add(m);
  }
}
