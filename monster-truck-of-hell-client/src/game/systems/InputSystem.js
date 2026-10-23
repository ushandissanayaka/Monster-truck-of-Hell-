import * as THREE from 'three';

// Keyboard + on-screen joystick (touch) + gamepad input.
//
// Driving: W/S or ↑/↓ throttle / brake-reverse · A/D or ←/→ steer · Space jump · Q nitro · Shift drift
// Gamepad: left stick steer · RT throttle · LT brake · right stick camera · A jump · B nitro · RB drift · X interact
const DEAD = 0.15;

function dz(v) {
  return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);
}

export class InputSystem {
  constructor() {
    this.keys = new Set();
    this.joy = new THREE.Vector2();       // touch joystick, x right, y up
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, rt: 0, lt: 0, buttons: [] };
    this.padConnected = false;
    this.jumpQueued = false;
    this.handlers = new Set();
    this._v = new THREE.Vector2();

    this.onKeyDown = (e) => {
      if (isTyping(e)) return;
      const k = e.code;
      if (!e.repeat) for (const h of this.handlers) h(k, e);
      this.keys.add(k);
      if (k === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (k.startsWith('Arrow')) e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  onKey(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  // Poll the first connected gamepad once per frame.
  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    this.padConnected = !!gp;
    if (!gp) {
      Object.assign(this.pad, { lx: 0, ly: 0, rx: 0, ry: 0, rt: 0, lt: 0 });
      return;
    }
    const prev = this.pad.buttons;
    const now = gp.buttons.map((b) => b.pressed);
    this.pad.lx = dz(gp.axes[0] || 0);
    this.pad.ly = dz(gp.axes[1] || 0);
    this.pad.rx = dz(gp.axes[2] || 0);
    this.pad.ry = dz(gp.axes[3] || 0);
    this.pad.rt = gp.buttons[7]?.value || 0;
    this.pad.lt = gp.buttons[6]?.value || 0;
    const pressed = (i) => now[i] && !prev[i];
    if (pressed(0)) this.jumpQueued = true;                         // A
    if (pressed(2)) this.handlers.forEach((h) => h('KeyE'));        // X -> interact
    if (pressed(1)) this.handlers.forEach((h) => h('KeyQ'));        // B -> nitro
    this.pad.buttons = now;
  }

  // arrowsSteer: ←/→ act like A/D (riding); otherwise they turn the camera (walking)
  moveVector(arrowsSteer = false) {
    const v = this._v.set(0, 0);
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v.y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v.y -= 1;
    if (this.keys.has('KeyD') || (arrowsSteer && this.keys.has('ArrowRight'))) v.x += 1;
    if (this.keys.has('KeyA') || (arrowsSteer && this.keys.has('ArrowLeft'))) v.x -= 1;
    v.y += this.pad.rt - this.pad.lt;
    v.x += this.joy.x + this.pad.lx;
    v.y += this.joy.y;
    return v;
  }

  // camera yaw turn: arrows only when walking (they steer the bike), right stick always
  cameraTurn(riding) {
    let t = -this.pad.rx;
    if (!riding) {
      if (this.keys.has('ArrowLeft')) t += 1;
      if (this.keys.has('ArrowRight')) t -= 1;
    }
    return t;
  }

  cameraPitch() {
    return this.pad.ry;
  }

  get drift() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.driftTouch || !!this.pad.buttons[5];
  }

  jump() {
    this.jumpQueued = true;
  }

  consumeJump() {
    const j = this.jumpQueued || this.keys.has('Space');
    this.jumpQueued = false;
    return j;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
