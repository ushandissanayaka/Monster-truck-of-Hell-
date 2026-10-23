// Ground and obstacles for the trucks.
// Surfaces: flat or sloped quads (the plaza, every course segment, the curbs) with a height under any
// point. Solids: boxes / cylinders with a top (props); taller than STEP they block, lower ones can be
// driven onto. Moving solids (pushers) just change x / z every frame.

import { segCorners, insideQuad } from '../../shared/gameData.js';

export const GRAVITY = 80;
export const STEP = 1.6;

export class PhysicsWorld {
  constructor() {
    this.surfaces = [];
    this.solids = [];
  }

  // flat quad (corners [{x,z}] in order) at height `top`, or sloped by height(x, z)
  addSurface(corners, top, height = null) {
    const s = { corners, top, height: height || (() => top), minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const c of corners) {
      s.minX = Math.min(s.minX, c.x); s.maxX = Math.max(s.maxX, c.x);
      s.minZ = Math.min(s.minZ, c.z); s.maxZ = Math.max(s.maxZ, c.z);
    }
    this.surfaces.push(s);
    return s;
  }

  // a course segment's top (sloped along its length)
  addSegment(seg, inset = 0, raise = 0) {
    const c = segCorners(seg, inset);
    return this.addSurface(c, Math.max(seg.a.y, seg.b.y) + raise, (x, z) => {
      const t = Math.max(0, Math.min(1, ((x - seg.a.x) * seg.dx + (z - seg.a.z) * seg.dz) / seg.len));
      return seg.a.y + (seg.b.y - seg.a.y) * t + raise;
    });
  }

  addBox({ x, z, w, d, rot = 0, top, bottom = -60, name = '' }) {
    const solid = { type: 'box', x, z, hx: w / 2, hz: d / 2, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, bottom, name };
    this.solids.push(solid);
    return solid;
  }

  addCylinder({ x, z, r, top, bottom = -60, name = '' }) {
    const solid = { type: 'cyl', x, z, r, top, bottom, name };
    this.solids.push(solid);
    return solid;
  }

  _probe(s, px, pz) {
    if (s.type === 'cyl') {
      const dx = px - s.x, dz = pz - s.z;
      const d = Math.hypot(dx, dz);
      return { dist: d - s.r, nx: d > 1e-6 ? dx / d : 1, nz: d > 1e-6 ? dz / d : 0 };
    }
    const dx = px - s.x, dz = pz - s.z;
    const lx = dx * s.cos - dz * s.sin;
    const lz = dx * s.sin + dz * s.cos;
    const cx = Math.max(-s.hx, Math.min(s.hx, lx));
    const cz = Math.max(-s.hz, Math.min(s.hz, lz));
    let ex = lx - cx, ez = lz - cz;
    let d = Math.hypot(ex, ez);
    if (d < 1e-6) {
      const px1 = s.hx - Math.abs(lx), pz1 = s.hz - Math.abs(lz);
      if (px1 < pz1) { ex = Math.sign(lx) || 1; ez = 0; d = -px1; } else { ex = 0; ez = Math.sign(lz) || 1; d = -pz1; }
    } else {
      ex /= d; ez /= d;
    }
    return { dist: d, nx: ex * s.cos + ez * s.sin, nz: -ex * s.sin + ez * s.cos };
  }

  // highest ground under (x, z) that is not above feetY + STEP (-Infinity over lava)
  groundAt(x, z, feetY = Infinity) {
    let g = -Infinity;
    for (const s of this.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (!insideQuad(s.corners, x, z)) continue;
      const h = s.height(x, z);
      if (h <= feetY + STEP && h > g) g = h;
    }
    for (const s of this.solids) {
      if (s.top > feetY + STEP || s.top <= g) continue;
      if (this._probe(s, x, z).dist < 0) g = s.top;
    }
    return g;
  }

  // a wall: some surface under (x, z) is too high to climb from feetY
  wallAt(x, z, feetY) {
    for (const s of this.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (!insideQuad(s.corners, x, z)) continue;
      if (s.height(x, z) > feetY + STEP && s.height(x, z) - 30 < feetY) return true;
    }
    return false;
  }

  // push a circle out of blocking solids; returns true if it hit something
  pushOut(pos, radius, feetY, height = 6) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
        if (s.top <= feetY + STEP) continue;
        if (feetY + height < s.bottom) continue;
        const pr = this._probe(s, pos.x, pos.z);
        if (pr.dist < radius) {
          const push = radius - pr.dist;
          pos.x += pr.nx * push;
          pos.z += pr.nz * push;
          hit = true;
          this.lastHit = s;
        }
      }
    }
    return hit;
  }
}
