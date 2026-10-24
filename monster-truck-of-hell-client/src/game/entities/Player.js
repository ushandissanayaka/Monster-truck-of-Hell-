import * as THREE from 'three';
import { BloxityAvatar } from './BloxityAvatar.js';
import { createNameTag } from './NameTag.js';
import { MonsterTruck, ROOF_Y, BODY_Y, WHEEL_R } from './MonsterTruck.js';
import { WORLD, TRUCK_PHYS, checkpoint } from '../../shared/gameData.js';
import { GRAVITY, STEP } from '../systems/PhysicsWorld.js';

// ---- the local truck's rigid body (see LocalPlayer)
const UP = new THREE.Vector3(0, 1, 0);
const SUB = 1 / 240;                  // physics sub-step
const AXLE = 4.3, TRACK = 4.75;
// wheels in the same order as MonsterTruck builds them: front right, front left, rear right, rear left
const WHEELS = [{ x: -TRACK, z: AXLE }, { x: TRACK, z: AXLE }, { x: -TRACK, z: -AXLE }, { x: TRACK, z: -AXLE }];
const COM = new THREE.Vector3(0, 3.6, 0);                 // centre of mass (truck space)
const I_INV = new THREE.Vector3(1 / 22, 1 / 26, 1 / 11);  // inverse inertia: pitch, yaw, roll
const K = 45;                         // spring per wheel: soft, so the truck bounces
const C = 2.0;                        // spring damping per wheel
const EQ = GRAVITY / (4 * K);         // static sag
const TRAVEL = 1.4;                   // compression past ride height before the bump stop
const ANCHOR_Y = WHEEL_R + 1.2;       // spring top (truck space)
const LMAX = 1.2 + EQ;                // spring top to wheel centre at full droop
const K_BUMP = 180, C_BUMP = 40;      // bump stop: lifts a wheel up and over a tall obstacle
const N_MAX = 240;
const FLIP_ROLL = 3.0, FLIP_PITCH = 2.4, FLIP_LIFT = 8;    // Space + A/D or W/S: a small nudge to roll a tipped truck
const MU = 1.4;                       // tyre side grip
const KB = 300, CB = 20;              // body points touching the ground
const BOOST = 1.7;                     // a speed pad pushes the truck up to this times its top speed
const LAUNCH = 2.4;                   // throttle punch: a short tap already gives a big push
const SLOPE_MIN = 0.05;               // off the throttle, gentler slopes than this hold the truck still
const ROLL_K = 0.6;                   // share of gravity along the slope that rolls a coasting truck
const ROLL_MAX = 14;                  // a coasting truck rolls down a slope no faster than this
const DOWNHILL_MAX = 1.4;             // on the throttle down a slope, gravity carries it up to this times top speed
const CLIMB = 8.5;                    // anything lower than this is driven over, not bumped into
const SAMPLES = [-0.8, -0.4, 0, 0.4, 0.8];      // along the tyre, as fractions of its radius
const TREAD_EDGES = [-1.3, 1.3];                 // across the tyre, from its middle
const BELT = BODY_Y + 2.75;
const BODY_POINTS = [
  [0, BODY_Y - 0.6, 0], [0, BODY_Y - 0.6, 4], [0, BODY_Y - 0.6, -4],
  [3, BODY_Y + 0.3, 7.6], [-3, BODY_Y + 0.3, 7.6], [3, BODY_Y + 0.3, -7.5], [-3, BODY_Y + 0.3, -7.5],
  [3.2, BELT, 7.2], [-3.2, BELT, 7.2], [3.3, BELT, -7.2], [-3.3, BELT, -7.2],
  [2.9, ROOF_Y, 0.8], [-2.9, ROOF_Y, 0.8], [2.9, ROOF_Y, -1.5], [-2.9, ROOF_Y, -1.5],
  [2.6, ROOF_Y + 1.5, -2.15], [-2.6, ROOF_Y + 1.5, -2.15],
  [TRACK + 1.5, WHEEL_R, AXLE], [-TRACK - 1.5, WHEEL_R, AXLE], [TRACK + 1.5, WHEEL_R, -AXLE], [-TRACK - 1.5, WHEEL_R, -AXLE],
  [TRACK, WHEEL_R * 2, AXLE], [-TRACK, WHEEL_R * 2, AXLE], [TRACK, WHEEL_R * 2, -AXLE], [-TRACK, WHEEL_R * 2, -AXLE],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
// points on the truck that can touch a hazard (truck space; the first is the middle)
const HAZARD_POINTS = [
  [0, 4, 0], [TRACK + 0.8, WHEEL_R, AXLE], [-TRACK - 0.8, WHEEL_R, AXLE], [TRACK + 0.8, WHEEL_R, -AXLE], [-TRACK - 0.8, WHEEL_R, -AXLE],
  [3, BELT, 7.2], [-3, BELT, 7.2], [3, BELT, -7.2], [-3, BELT, -7.2], [0, ROOF_Y, -0.5],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const v3 = () => new THREE.Vector3();
const TMP = {
  up: v3(), x: v3(), y: v3(), z: v3(), com: v3(), force: v3(), torque: v3(), r: v3(), f: v3(), fh: v3(), rh: v3(),
  a: v3(), vp: v3(), vh: v3(), d: v3(), iinv: v3(), axis: v3(),
  qi: new THREE.Quaternion(), dq: new THREE.Quaternion(), euler: new THREE.Euler(),
};


function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// root (position + heading, YXZ: pitch / roll from the ground) -> truck + driver + name tag
class Driver {
  constructor({ name, vip, equipped, proportions, skinUrl, truck, hat, remote = false }) {
    this.hideTag = !remote; // like Roblox, you do not see your own name over your truck
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.truck = new MonsterTruck(truck, { shadows: !remote });
    this.root.add(this.truck.object);
    this.avatar = new BloxityAvatar({ equipped, proportions, skinUrl });
    const s = this.truck.seat;
    this.avatar.root.position.set(s.x, s.y, s.z);
    this.avatar.anim = 'sit';
    this.truck.object.add(this.avatar.root);
    this.truck.setHat(hat || null);
    this.setName(name, vip);
  }

  setName(name, vip) {
    if (this.hideTag) return;
    if (this.tag && this.name === name && this.vip === !!vip) return;
    if (this.tag) this.root.remove(this.tag);
    this.name = name;
    this.vip = !!vip;
    this.tag = createNameTag(name, { vip });
    this.tag.scale.multiplyScalar(2.2);
    this.tag.position.y = ROOF_Y + 3.4;
    this.root.add(this.tag);
  }

  setTruck(id) { return this.truck.setTruck(id); }
  setHat(id) { this.truck.setHat(id); }

  pose(dt, speed, steer, air, wheelY = null) {
    this.truck.update(dt, speed, steer, air, wheelY);
    this.avatar.anim = 'sit';
    this.avatar.update(dt);
  }
}

// The truck driven on this device: a small rigid body on four sprung wheels.
//  - each wheel finds the ground under its round tyre (so it rolls up onto curbs, tyre stacks, barrels
//    and pushers), and a soft, bouncy spring holds the truck up; a hard bump-stop past full travel
//    launches it over anything big; a big one can tip it right over, nothing holds it upright
//  - points on the bumpers, roof and roll bar touch the ground when it tips, so it can roll over
//  - Space squats on the springs and bounces up. Tipped over, Space alone does nothing: Space with
//    A / D shoves it into a roll to that side, with W / S into a flip forwards / backwards, and the
//    physics decides whether it lands back on its wheels. A short tap of the throttle gives a big push
export class LocalPlayer extends Driver {
  constructor(opts) {
    super(opts);
    this.body = { pos: new THREE.Vector3(WORLD.spawn.x, 0, WORLD.spawn.z), grounded: true };
    this.lin = new THREE.Vector3();    // linear velocity
    this.ang = new THREE.Vector3();    // angular velocity (world)
    this.q = new THREE.Quaternion();
    this.ry = Math.PI;                // facing north (the course)
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;                   // forward speed (signed)
    this.steer = 0;
    this.stats = { top: TRUCK_PHYS.topSpeed, accel: TRUCK_PHYS.accel, jump: TRUCK_PHYS.jump, nitroSeconds: TRUCK_PHYS.nitroSeconds, nitroRecharge: TRUCK_PHYS.nitroRecharge };
    this.nitro = 0;                   // seconds of nitro left (burning)
    this.nitroCool = 0;               // seconds until nitro is ready again
    this.drifting = false;
    this.stage = 0;                   // checkpoint stage (set by Game)
    this.squat = 0;                   // Space: seconds left pressing down before the bounce
    this.flipTime = 0;                // seconds spent on the side / roof
    this.flipped = false;
    this.touching = false;            // wheels or body on something (last step)
    this.settle = 0;                  // seconds after a nudge in which landing upright soaks up the spin
    this.airTime = 0;
    this.wheelY = WHEELS.map(() => WHEEL_R);
    this.q.setFromAxisAngle(UP, this.ry);
  }

  // spawn plaza, facing the course
  respawn() {
    this.place(WORLD.spawn.x + (Math.random() - 0.5) * 30, 0.5, WORLD.spawn.z + (Math.random() - 0.5) * 16, Math.PI);
    this.respawnAt = performance.now();
  }

  toCheckpoint(stage) {
    const c = checkpoint(stage);
    this.place(c.x, c.y, c.z, c.ry);
    this.respawnAt = performance.now();
  }

  place(x, y, z, ry) {
    this.body.pos.set(x, y, z);
    this.lin.set(0, 0, 0);
    this.ang.set(0, 0, 0);
    this.speed = 0;
    this.ry = ry ?? this.ry;
    this.q.setFromAxisAngle(UP, this.ry);
    this.pitch = this.roll = 0;
    this.squat = this.flipTime = this.settle = 0;
    this.flipped = false;
    this.teleported = true;
    this.body.grounded = false;
  }

  teleport(x, y, z) {
    this.place(x, y, z);
  }

  // HAZARD_POINTS in the world, where the truck is now
  hazardPoints() {
    const pts = this._hazardPts || (this._hazardPts = HAZARD_POINTS.map(() => new THREE.Vector3()));
    HAZARD_POINTS.forEach((p, i) => pts[i].copy(p).applyQuaternion(this.q).add(this.body.pos));
    return pts;
  }

  fireNitro() {
    if (this.nitro > 0 || this.nitroCool > 0) return false;
    this.nitro = this.stats.nitroSeconds;
    return true;
  }

  get nitroReady01() {
    if (this.nitro > 0) return this.nitro / this.stats.nitroSeconds;
    return this.nitroCool > 0 ? 1 - this.nitroCool / this.stats.nitroRecharge : 1;
  }

  update(dt, input, physics) {
    const move = input.moveVector(true);
    this.throttle = Math.max(0, move.y);   // for the engine sound
    const jump = input.consumeJump();
    this.drifting = !!input.drift;

    // tipped over and resting on something: Space + a direction shoves it to roll / flip that way
    const tipped = TMP.up.set(0, 1, 0).applyQuaternion(this.q).y < 0.75;
    if (jump && tipped && this.touching) {
      const X = TMP.x.set(1, 0, 0).applyQuaternion(this.q), Z = TMP.z.set(0, 0, 1).applyQuaternion(this.q);
      // D rolls the top towards the truck's right (about +Z), W tips it over the nose (about +X)
      if (Math.abs(move.x) > 0.1) this.ang.addScaledVector(Z, Math.sign(move.x) * FLIP_ROLL);
      if (Math.abs(move.y) > 0.1) this.ang.addScaledVector(X, Math.sign(move.y) * FLIP_PITCH);
      if (Math.abs(move.x) > 0.1 || Math.abs(move.y) > 0.1) {
        this.lin.y = Math.max(this.lin.y, 0) + FLIP_LIFT;
        this.settle = 1.5;
        this.jumped = true;
      }
    }

    const steps = Math.min(12, Math.max(2, Math.ceil(dt / SUB)));
    const wasGrounded = this.body.grounded;
    const fallSpeed = this.lin.y;
    for (let i = 0; i < steps; i++) this.step(dt / steps, move, i === 0 && jump && !tipped, physics);

    if (this.nitro > 0) {
      this.nitro -= dt;
      if (this.nitro <= 0) { this.nitro = 0; this.nitroCool = this.stats.nitroRecharge; }
    } else if (this.nitroCool > 0) this.nitroCool = Math.max(0, this.nitroCool - dt);

    this.airTime = this.body.grounded ? 0 : this.airTime + dt;
    if (this.body.grounded && !wasGrounded && fallSpeed < -25) this.landed = true;

    const upY = TMP.up.set(0, 1, 0).applyQuaternion(this.q).y;
    if (upY < 0.4 && (this.touching || this.lin.lengthSq() < 4)) {
      this.flipTime += dt;
      if (this.flipTime > 0.25) this.flipped = true;
    } else if (upY > 0.6) {
      this.flipTime = 0;
      this.flipped = false;
    }

    const e = TMP.euler.setFromQuaternion(this.q, 'YXZ');
    this.ry = e.y;
    this.pitch = e.x;
    this.roll = e.z;
    this.fellInLava = this.body.pos.y < WORLD.fallY;
    this.root.position.copy(this.body.pos);
    this.root.quaternion.copy(this.q);
    this.pose(dt, this.speed, this.steer, !this.body.grounded, this.wheelY);
  }

  // one sub-step of the rigid body (mass 1, so forces are accelerations)
  step(h, move, jump, physics) {
    const p = this.body.pos, q = this.q, st = this.stats;
    const X = TMP.x.set(1, 0, 0).applyQuaternion(q);
    const Y = TMP.y.set(0, 1, 0).applyQuaternion(q);
    const Z = TMP.z.set(0, 0, 1).applyQuaternion(q);
    const com = TMP.com.copy(COM).applyQuaternion(q).add(p);
    const force = TMP.force.set(0, -GRAVITY, 0);
    const torque = TMP.torque.set(0, 0, 0);
    const pointVel = (P, out) => out.copy(this.ang).cross(TMP.r.copy(P).sub(com)).add(this.lin);
    const apply = (P, F) => {
      force.add(F);
      torque.add(TMP.r.copy(P).sub(com).cross(F));
    };

    // heading on the ground plane
    const fh = TMP.fh.set(Z.x, 0, Z.z);
    if (fh.lengthSq() < 1e-4) fh.set(Math.sin(this.ry), 0, Math.cos(this.ry));
    fh.normalize();
    const rh = TMP.rh.set(-fh.z, 0, fh.x);   // ground right of the heading (truck's right is -X)
    let fwd = this.lin.dot(fh);
    const nitro = this.nitro > 0;
    const top = st.top * (nitro ? TRUCK_PHYS.nitroMul : 1);

    // ---- wheels
    const upright = Y.y > 0.25;
    let contacts = 0;
    const R = WHEEL_R;
    WHEELS.forEach((w, i) => {
      const A = TMP.a.set(w.x, ANCHOR_Y, w.z).applyQuaternion(q).add(p);
      // the wheel hangs along the truck's own down axis, so on a tilt it sits off to the side of
      // the spring top; the ground is found under the wheel itself
      const Wx = A.x - Y.x * LMAX, Wz = A.z - Y.z * LMAX;
      const extY = A.y - Y.y * LMAX;               // wheel centre at full droop
      let c = -Infinity;
      if (upright) {
        for (const d of SAMPLES) {
          const sx = Wx + fh.x * d * R, sz = Wz + fh.z * d * R;
          const g = physics.groundAt(sx, sz, extY + R + 2);
          if (Number.isFinite(g)) c = Math.max(c, g + Math.sqrt(1 - d * d) * R);
        }
        // the edges of the wide tyre, for slopes across it (halfpipe walls, leaning plates)
        for (const e of TREAD_EDGES) {
          const g = physics.groundAt(Wx + rh.x * e, Wz + rh.z * e, extY + R + 2);
          if (Number.isFinite(g)) c = Math.max(c, g + R * 0.9);
        }
      }
      // compression from full droop, measured along the spring
      const xc = (c - extY) / Math.max(0.4, Y.y);
      this.wheelY[i] = R + THREE.MathUtils.clamp(Number.isFinite(xc) ? Math.max(0, xc) : 0, 0, EQ + TRAVEL + 1.5) - EQ;
      if (!(xc > 0)) return;
      contacts++;
      const vp = pointVel(A, TMP.vp);
      let n = K * xc - C * vp.y;
      if (xc > EQ + TRAVEL) n += K_BUMP * (xc - EQ - TRAVEL) - C_BUMP * Math.min(0, vp.y);
      n = THREE.MathUtils.clamp(n, 0, N_MAX);
      apply(A, TMP.f.set(0, n, 0));
      // tyre grip: kill the sideways slide (much less while drifting)
      const vl = vp.dot(rh);
      const grip = (this.drifting ? 0.6 : 3.2) * Math.abs(vl);
      const lat = Math.min(grip, MU * n) * -Math.sign(vl);
      apply(A, TMP.f.copy(rh).multiplyScalar(lat));
    });
    const grounded = contacts > 0;

    // ---- drive / brake / coast along the heading, pushed at axle height (a little nose lift)
    if (contacts > 0) {
      let a = 0;
      if (move.y > 0.1 || nitro) {
        const want = top * (nitro ? 1 : Math.min(1, move.y));
        if (fwd < want) a = st.accel * LAUNCH * (nitro ? 1.6 : 1) * (1 - Math.max(0, fwd) / (want + 8));
        else a = -TRUCK_PHYS.coast;
        // down a slope gravity pulls on past top speed (so a long drop throws the truck off its kicker)
        if (Z.y < -SLOPE_MIN && upright && fwd > 0 && fwd < top * DOWNHILL_MAX) a = Math.max(a, -GRAVITY * Z.y * ROLL_K);
      } else if (move.y < -0.1) {
        a = fwd > 0.5 ? -TRUCK_PHYS.brake : (fwd > -TRUCK_PHYS.reverse ? -st.accel * 1.4 : 0);
      } else if (Math.abs(Z.y) > SLOPE_MIN && upright) {
        // off the throttle on a slope: slow down going up, stop, then roll back down slowly
        const down = -Math.sign(Z.y);
        const rolling = fwd * down;
        a = -GRAVITY * Z.y * ROLL_K;
        if (rolling < 0) a -= Math.sign(fwd) * TRUCK_PHYS.coast;
        else if (rolling > ROLL_MAX) a = -Math.sign(fwd) * Math.min((rolling - ROLL_MAX) / h, TRUCK_PHYS.coast * 2);
      } else if (Math.abs(fwd) > 0.05) {
        a = -Math.sign(fwd) * Math.min(Math.abs(fwd) / h, TRUCK_PHYS.coast);
      }
      a *= Math.min(1, contacts / 2);
      if (physics.boostAt(p.x, p.z, p.y)) {
        a = Math.max(a, (st.top * BOOST - fwd) * 6);
        this.boosted = true;
      }
      const D = TMP.d.set(0, WHEEL_R, 0).applyQuaternion(q).add(p);
      apply(D, TMP.f.copy(fh).multiplyScalar(a));
    }

    // ---- a fan's wind pushes the whole truck across the road
    const wind = physics.windAt(p.x, p.z, p.y);
    if (wind) force.add(TMP.f.set(wind.fx, 0, wind.fz));

    // ---- body points: bumpers, roof, roll bar, wheel sides - stiff, scraping contacts
    let bodyHit = false;
    for (const b of BODY_POINTS) {
      const P = TMP.a.copy(b).applyQuaternion(q).add(p);
      const g = physics.groundAt(P.x, P.z, P.y + 0.5);
      const pen = g - P.y;
      if (!(pen > 0)) continue;
      bodyHit = true;
      const vp = pointVel(P, TMP.vp);
      const n = THREE.MathUtils.clamp(KB * pen - CB * vp.y, 0, N_MAX);
      apply(P, TMP.f.set(0, n, 0));
      const vh = TMP.vh.set(vp.x, 0, vp.z);
      const sp = vh.length();
      if (sp > 1e-3) apply(P, vh.multiplyScalar(-Math.min(0.7 * n, sp * 6) / sp));
    }

    // ---- Space: squat on the springs, then bounce
    if (jump && contacts >= 2 && upright && this.squat <= 0) {
      this.squat = 0.08;
      this.jumped = true;
    }
    if (this.squat > 0) {
      force.y -= GRAVITY * 4;
      this.squat -= h;
      if (this.squat <= 0) this.lin.y = Math.max(this.lin.y, 0) + st.jump;
    }

    // ---- integrate
    this.lin.addScaledVector(force, h);
    const Iinv = TMP.iinv.copy(torque).applyQuaternion(TMP.qi.copy(q).invert()).multiply(I_INV).applyQuaternion(q);
    this.ang.addScaledVector(Iinv, h);
    this.ang.multiplyScalar(Math.exp(-h * (grounded || bodyHit ? 1.2 : 0.2)));
    // after a nudge: once it is back on its wheels the springs soak up the roll instead of tipping on
    if (this.settle > 0) {
      this.settle -= h;
      if (Y.y > 0.8) this.ang.multiplyScalar(Math.exp(-h * 10));
    }

    // steering: set the yaw rate directly (needs some speed, reverses when backing up)
    const steerIn = THREE.MathUtils.clamp(move.x, -1, 1);
    this.steer += (steerIn - this.steer) * Math.min(1, h * 10);
    fwd = this.lin.dot(fh);
    if (upright) {
      const speedK = Math.min(1, Math.abs(fwd) / 14) * Math.sign(fwd || 1);
      const rate = TRUCK_PHYS.turn * (this.drifting ? 1.55 : 1) * (1 - Math.min(0.35, Math.abs(fwd) / 300));
      const want = -this.steer * rate * speedK * (grounded ? 1 : 0.35);
      const cur = this.ang.dot(Y);
      this.ang.addScaledVector(Y, (want - cur) * Math.min(1, h * (grounded ? 14 : 3)));
    }

    const ox = p.x, oz = p.z;
    p.addScaledVector(this.lin, h);
    const w = this.ang.length();
    if (w > 1e-6) q.premultiply(TMP.dq.setFromAxisAngle(TMP.axis.copy(this.ang).divideScalar(w), w * h)).normalize();

    // walls too tall to climb (the finish arch, the Daily Wheel, a slab side far above) still block
    const feet = p.y + CLIMB - STEP;
    const ahead = Math.sign(fwd || 1) * 7;
    if (physics.wallAt(p.x, p.z, feet) || physics.wallAt(p.x + fh.x * ahead, p.z + fh.z * ahead, feet)) {
      p.x = ox; p.z = oz;
      this.lin.x *= -0.25; this.lin.z *= -0.25;
      this.bumped = true;
    }
    if (physics.pushOut(p, 5, feet, 10, p.y)) {
      const moved = Math.hypot(p.x - ox, p.z - oz);
      if (moved < Math.abs(fwd) * h * 0.6) {
        this.lin.x *= 0.55; this.lin.z *= 0.55;
        this.bumped = true;
      }
    }

    this.speed = this.lin.dot(fh);
    this.body.grounded = grounded;
    this.touching = grounded || bodyHit;
  }
}

// Another player's truck, smoothed towards the latest server state.
export class RemotePlayer extends Driver {
  constructor({ name, equipped, proportions, vip, truck, hat }) {
    super({ name, vip, equipped, proportions, truck, hat, remote: true });
    this.target = new THREE.Vector3();
    this.targetRy = 0;
    this.targetRx = 0;
    this.targetRz = 0;
    this.lastPos = new THREE.Vector3();
    this.lastRy = 0;
    this.first = true;
  }

  setState(s) {
    this.target.set(s.x, s.y, s.z);
    this.targetRy = s.ry;
    this.targetRx = s.rx || 0;
    this.targetRz = s.rz || 0;
    if (this.first) {
      this.root.position.copy(this.target);
      this.root.rotation.set(this.targetRx, s.ry, this.targetRz);
      this.first = false;
    }
    this.setTruck(s.truck);
    this.setHat(s.hat || null);
    this.setName(s.name, s.vip);
  }

  update(dt) {
    this.lastPos.copy(this.root.position);
    this.lastRy = this.root.rotation.y;
    if (this.root.position.distanceTo(this.target) > 40) this.root.position.copy(this.target);
    else this.root.position.lerp(this.target, 1 - Math.exp(-dt * 12));
    const k = 1 - Math.exp(-dt * 12);
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.targetRy, k);
    this.root.rotation.x += (this.targetRx - this.root.rotation.x) * k;
    this.root.rotation.z += (this.targetRz - this.root.rotation.z) * k;

    const dx = this.root.position.x - this.lastPos.x, dz = this.root.position.z - this.lastPos.z;
    const fwd = dx * Math.sin(this.root.rotation.y) + dz * Math.cos(this.root.rotation.y);
    const speed = dt > 0 ? fwd / dt : 0;
    const turn = dt > 0 ? (this.root.rotation.y - this.lastRy) / dt : 0;
    this.pose(dt, speed, THREE.MathUtils.clamp(-turn / TRUCK_PHYS.turn, -1, 1), Math.abs(this.root.position.y - this.target.y) > 3);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.avatar.dispose();
  }
}
