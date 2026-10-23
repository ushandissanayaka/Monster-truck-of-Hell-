// The pit under the course: far below the track, a field of jagged dark rock hills and spikes stands in
// the lava, with the magma filling everything between them and glowing up their feet. Faceted (flat
// shaded) so the rocks read as hard, sharp shapes. It covers the course and fades into the lava sea
// at its edges. Nothing moves.

import * as THREE from 'three';
import { COURSE, WORLD } from '../../shared/gameData.js';

function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
// sharp crests: hills with knife-edge ridges
function ridged(x, z) {
  let v = 0, amp = 0.55, f = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(noise2(x * f + i * 17.3, z * f - i * 9.1) * 2 - 1);
    v += n * n * amp;
    f *= 2.1;
    amp *= 0.5;
  }
  return v;
}

const CELL = 30;           // grid spacing
const MARGIN = 1400;       // how far the rocks reach past the course

function heightAt(x, z, edge) {
  const L = WORLD.lavaY;
  // clusters of hills (low frequency) carrying ridges and spikes
  const cluster = Math.max(0, noise2(x / 520, z / 520) - 0.3) / 0.7;
  const r = ridged(x / 160, z / 160);
  const spike = Math.pow(Math.max(0, noise2(x / 55 + 3.1, z / 55 - 7.7) - 0.62) / 0.38, 2.2);
  const h = cluster * (Math.pow(r, 2.4) * 210 + spike * 120) + r * 18;
  return L - 26 + h * edge;
}

export function buildLavaPit(scene) {
  // area: the course and the plaza, plus a margin
  let x0 = -WORLD.plazaHalf, x1 = WORLD.plazaHalf, z0 = -WORLD.plazaHalf, z1 = WORLD.plazaHalf;
  for (const s of COURSE.segs) {
    x0 = Math.min(x0, s.a.x, s.b.x); x1 = Math.max(x1, s.a.x, s.b.x);
    z0 = Math.min(z0, s.a.z, s.b.z); z1 = Math.max(z1, s.a.z, s.b.z);
  }
  x0 -= MARGIN; x1 += MARGIN; z0 -= MARGIN; z1 += MARGIN;
  const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * CELL, z = z0 + j * CELL;
      // fade to flat lava at the border
      const e = Math.min(i, nx - i, j, nz - j) * CELL;
      const edge = Math.min(1, e / 500);
      // a little jitter keeps the facets irregular
      H[j * (nx + 1) + i] = heightAt(x + (hash2(i, j) - 0.5) * 8, z + (hash2(j, i) - 0.5) * 8, edge);
    }
  }

  // faceted mesh: only the cells that rise out of the lava
  const pos = [], col = [], glow = [];
  const L = WORLD.lavaY;
  const rockLow = new THREE.Color('#3a0a08'), rockHigh = new THREE.Color('#1a0606'), rockLit = new THREE.Color('#5a1410');
  const tmp = new THREE.Color();
  const vert = (i, j) => {
    const x = x0 + i * CELL, z = z0 + j * CELL, y = H[j * (nx + 1) + i];
    pos.push(x, y, z);
    const k = Math.min(1, Math.max(0, (y - L) / 160));
    tmp.copy(rockLow).lerp(rockHigh, k);
    if (hash2(i * 3.1, j * 7.3) > 0.82) tmp.lerp(rockLit, 0.6);   // mottled red patches
    col.push(tmp.r, tmp.g, tmp.b);
    glow.push(Math.exp(-Math.max(0, y - L) / 14));
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = H[j * (nx + 1) + i], b = H[j * (nx + 1) + i + 1], c = H[(j + 1) * (nx + 1) + i], d = H[(j + 1) * (nx + 1) + i + 1];
      if (Math.max(a, b, c, d) < L + 1) continue;
      vert(i, j); vert(i, j + 1); vert(i + 1, j);
      vert(i + 1, j); vert(i, j + 1); vert(i + 1, j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
  g.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  // the magma lights the feet of the rocks from below
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.22, 0.04) * vGlow * 1.6;');
  };
  const rocks = new THREE.Mesh(g, mat);
  rocks.receiveShadow = false;
  scene.add(rocks);
  return rocks;
}
