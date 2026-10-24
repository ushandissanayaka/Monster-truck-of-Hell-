// Dev autoplay (?autoplay=1): a test drive along the whole course to look at the track. It aims at a
// point a little way ahead on the course line, slides across the road to a lane clear of hazards and
// takes the left run at a split. Hazards do not kill it (see Game), and when it falls in the lava or
// gets stuck it is put down a little further along the course.

import * as THREE from 'three';
import { COURSE, courseLocate, segTop } from '../../shared/gameData.js';

const LOOK = 34;                              // aim this far ahead along the course
const PROBE = [12, 24, 36];                   // check for hazards this far ahead
const LANES = [0, -0.12, 0.12, -0.24, 0.24, -0.34, 0.34];   // across the road, as fractions of its width

// sideways offset of the left run of a split at t (see splitRuns in gameData)
const splitOff = (t) => -(34 * (1 - t) + 14 * t + 26 * Math.sin(Math.PI * t));

function segAt(dist) {
  for (const s of COURSE.segs) if (dist < s.start + s.len) return s;
  return COURSE.segs[COURSE.segs.length - 1];
}

// world point at a distance along the course, offset to the side (+ = right)
function pointAt(dist, side, out) {
  const s = segAt(dist);
  const d = Math.max(0, Math.min(s.len, dist - s.start)), t = d / s.len;
  if (s.split === true) side += splitOff(t);
  const y = s.kind === 'gap' ? s.a.y + (s.b.y - s.a.y) * t : segTop(s, t, side);
  return out.set(s.a.x + s.dx * d - s.dz * side, y, s.a.z + s.dz * d + s.dx * side);
}

export class Autopilot {
  constructor() {
    this.dist = 0;
    this.lane = 0;
    this.stuck = 0;
    this.p = new THREE.Vector3();
    this.probe = [new THREE.Vector3(), new THREE.Vector3()];
  }

  // steer / throttle for this frame: { x, y } like the joystick
  drive(dt, pl, course) {
    const pos = pl.body.pos;
    const loc = courseLocate(pos.x, pos.z, pos.y);
    this.dist = loc ? loc.dist : 0;
    const seg = segAt(this.dist + LOOK);
    const w = seg.w || 40;

    // the lane nearest the current one that is clear of hazards all the way ahead
    const clear = (lane) => PROBE.every((ahead) => {
      pointAt(this.dist + ahead, lane * w, this.p);
      this.probe[0].set(this.p.x, this.p.y + 2, this.p.z);
      this.probe[1].set(this.p.x, this.p.y + 7, this.p.z);
      return !course.hazardHit(this.probe, 7);
    });
    const order = LANES.slice().sort((a, b) => Math.abs(a - this.lane) - Math.abs(b - this.lane));
    this.lane = order.find(clear) ?? 0;   // every lane blocked: straight through (hazards do not kill)
    const throttle = 1;
    this.far = Math.max(this.far || 0, this.dist);

    pointAt(this.dist + LOOK, this.lane * w, this.p);
    const want = Math.atan2(this.p.x - pos.x, this.p.z - pos.z);
    const diff = Math.atan2(Math.sin(want - pl.ry), Math.cos(want - pl.ry));
    const steer = THREE.MathUtils.clamp(-diff * 2.5, -1, 1);

    // not moving with the throttle on for a while: back to the checkpoint
    this.stuck = Math.abs(pl.speed) < 3 ? this.stuck + dt : 0;
    return { x: steer, y: throttle, reset: this.stuck > 3 && (this.stuck = 0, true) };
  }

  // put the truck down on the next road piece past the furthest point reached
  skipAhead(pl) {
    const from = (this.far || 0) + 30;
    const s = COURSE.segs.find((g) => g.kind === 'road' && g.start >= from && g.len > 30) || COURSE.segs[COURSE.segs.length - 1];
    const d = Math.min(10, s.len / 4);
    pl.place(s.a.x + s.dx * d, segTop(s, d / s.len, 0) + 1, s.a.z + s.dz * d, Math.atan2(s.dx, s.dz));
    this.far = s.start + d;
    this.lane = 0;
  }
}
