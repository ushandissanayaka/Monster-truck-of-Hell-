import * as THREE from 'three';
import { BloxityAvatar } from './BloxityAvatar.js';
import { createNameTag } from './NameTag.js';
import { MonsterTruck } from './MonsterTruck.js';
import { WORLD, TRUCK_PHYS, checkpoint } from '../../shared/gameData.js';
import { GRAVITY, STEP } from '../systems/PhysicsWorld.js';

const AXLE = 4.3, TRACK = 4.3;
const RADIUS = 5;            // truck footprint for bumping into props
const SNAP = 2.2;            // follow the ground down slopes up to this far per step

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
    this.tag.position.y = 12.2;
    this.root.add(this.tag);
  }

  setTruck(id) { return this.truck.setTruck(id); }
  setHat(id) { this.truck.setHat(id); }

  pose(dt, speed, steer, air) {
    this.truck.update(dt, speed, steer, air);
    this.avatar.anim = 'sit';
    this.avatar.update(dt);
  }
}

// The truck driven on this device.
export class LocalPlayer extends Driver {
  constructor(opts) {
    super(opts);
    this.body = { pos: new THREE.Vector3(WORLD.spawn.x, 0, WORLD.spawn.z), grounded: true };
    this.vel = new THREE.Vector2();   // x/z velocity
    this.vy = 0;
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
    this.slopeVy = 0;
    this.anim = 'drive';
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
    this.vel.set(0, 0);
    this.vy = 0;
    this.speed = 0;
    this.ry = ry ?? this.ry;
    this.teleported = true;
    this.body.grounded = false;
  }

  teleport(x, y, z) {
    this.place(x, y, z);
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
    const steps = dt > 0.02 ? 2 : 1;
    const move = input.moveVector(true);
    const jump = input.consumeJump();
    this.drifting = !!input.drift;
    for (let i = 0; i < steps; i++) this.step(dt / steps, move, i === 0 && jump, physics);

    if (this.nitro > 0) {
      this.nitro -= dt;
      if (this.nitro <= 0) { this.nitro = 0; this.nitroCool = this.stats.nitroRecharge; }
    } else if (this.nitroCool > 0) this.nitroCool = Math.max(0, this.nitroCool - dt);

    this.fellInLava = this.body.pos.y < WORLD.lavaY + 2;
    this.root.position.copy(this.body.pos);
    this.root.rotation.set(this.pitch, this.ry, this.roll);
    this.pose(dt, this.speed, this.steer, !this.body.grounded);
  }

  step(dt, move, jump, physics) {
    const p = this.body.pos;
    const grounded = this.body.grounded;
    const st = this.stats;
    const fx = Math.sin(this.ry), fz = Math.cos(this.ry);
    const rx = -Math.cos(this.ry), rz = Math.sin(this.ry);    // truck's right
    let fwd = this.vel.x * fx + this.vel.y * fz;
    let lat = this.vel.x * rx + this.vel.y * rz;
    const nitro = this.nitro > 0;
    const top = st.top * (nitro ? TRUCK_PHYS.nitroMul : 1);

    if (grounded) {
      if (move.y > 0.1 || nitro) {
        const want = top * (nitro ? 1 : Math.min(1, move.y));
        if (fwd < want) fwd = Math.min(want, fwd + st.accel * (nitro ? 2.2 : 1) * (1 - Math.max(0, fwd) / (want + 30)) * 1.6 * dt);
        else fwd = Math.max(want, fwd - TRUCK_PHYS.coast * dt);
      } else if (move.y < -0.1) {
        if (fwd > 0.5) fwd = Math.max(0, fwd - TRUCK_PHYS.brake * dt);
        else fwd = Math.max(-TRUCK_PHYS.reverse, fwd - st.accel * 0.6 * dt);
      } else {
        fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), TRUCK_PHYS.coast * dt);
      }
      // grip pulls the sideways slide back in line (much less while drifting)
      const grip = this.drifting ? 1.6 : 10;
      lat *= Math.exp(-grip * dt);
    }

    // steering: needs some speed, reverses when backing up; drifting turns tighter
    const steerIn = THREE.MathUtils.clamp(move.x, -1, 1);
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 10);
    const speedK = Math.min(1, Math.abs(fwd) / 14) * Math.sign(fwd || 1);
    const rate = TRUCK_PHYS.turn * (this.drifting ? 1.55 : 1) * (grounded ? 1 : 0.35) * (1 - Math.min(0.35, Math.abs(fwd) / 300));
    const dYaw = -this.steer * rate * speedK * dt;
    this.ry += dYaw;
    if (this.drifting && grounded) lat += fwd * Math.abs(dYaw) * Math.sign(-dYaw) * -0.6; // tail kicks out

    const nfx = Math.sin(this.ry), nfz = Math.cos(this.ry), nrx = -Math.cos(this.ry), nrz = Math.sin(this.ry);
    this.vel.set(nfx * fwd + nrx * lat, nfz * fwd + nrz * lat);
    this.speed = fwd;

    // horizontal move with walls (a higher slab side) and props
    const ox = p.x, oz = p.z;
    p.x += this.vel.x * dt;
    p.z += this.vel.y * dt;
    const ahead = { x: p.x + nfx * 5.5 * Math.sign(fwd || 1), z: p.z + nfz * 5.5 * Math.sign(fwd || 1) };
    if (physics.wallAt(p.x, p.z, p.y) || physics.wallAt(ahead.x, ahead.z, p.y)) {
      p.x = ox; p.z = oz;
      this.vel.multiplyScalar(-0.25);
      this.speed = fwd * -0.25;
      this.bumped = true;
    }
    if (physics.pushOut(p, RADIUS, p.y, 7)) {
      const moved = Math.hypot(p.x - ox, p.z - oz);
      if (moved < Math.abs(fwd) * dt * 0.6) {
        this.vel.multiplyScalar(0.55);
        this.speed *= 0.55;
        this.bumped = true;
      }
    }

    // vertical
    const ground = physics.groundAt(p.x, p.z, p.y);
    if (jump && grounded) {
      this.vy = st.jump;
      this.body.grounded = false;
      this.jumped = true;
    } else if (grounded && Number.isFinite(ground) && ground >= p.y - SNAP && ground <= p.y + STEP) {
      // stuck to the ground: remember the slope speed so a ramp launches the truck
      this.slopeVy = dt > 0 ? (ground - p.y) / dt : 0;
      p.y = ground;
      this.vy = 0;
      this.body.grounded = true;
    } else if (grounded) {
      // drove off an edge / over the top of a ramp
      this.vy = Math.max(0, this.slopeVy);
      this.body.grounded = false;
    }
    if (!this.body.grounded) {
      this.vy -= GRAVITY * dt;
      this.vy = Math.max(this.vy, -140);
      p.y += this.vy * dt;
      const g2 = physics.groundAt(p.x, p.z, p.y);
      if (Number.isFinite(g2) && p.y <= g2 && this.vy <= 0) {
        p.y = g2;
        this.landed = this.vy < -25;
        this.vy = 0;
        this.body.grounded = true;
        this.slopeVy = 0;
      }
    }

    // pitch / roll from the ground under the wheels (in the air: nose follows the fall)
    let tp = 0, tr = 0;
    if (this.body.grounded) {
      const y0 = p.y;
      const h = (dx, dz) => {
        const g = physics.groundAt(p.x + dx, p.z + dz, y0 + 1);
        return Number.isFinite(g) && Math.abs(g - y0) < 4 ? g : y0;
      };
      const hf = h(nfx * AXLE, nfz * AXLE), hb = h(-nfx * AXLE, -nfz * AXLE);
      const hl = h(-nrx * TRACK, -nrz * TRACK), hr = h(nrx * TRACK, nrz * TRACK);
      tp = Math.atan2(hb - hf, AXLE * 2);
      tr = Math.atan2(hl - hr, TRACK * 2);
    } else {
      tp = THREE.MathUtils.clamp(-this.vy / 140, -0.35, 0.35);
    }
    const k = Math.min(1, dt * (this.body.grounded ? 14 : 3));
    this.pitch += (tp - this.pitch) * k;
    this.roll += (tr - this.roll) * k;
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
