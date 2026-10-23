import * as THREE from 'three';

// Roblox-like third-person orbit camera: drag to rotate (right or left mouse / one finger),
// wheel or pinch to zoom, arrow keys to turn.
export class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.yaw = 0;            // 0 = camera south of the player looking north
    this.pitch = 0.32;
    this.distance = 22;
    this.targetDistance = 22;
    this.min = 5;
    this.max = 90;
    this.sensitivity = 1;
    this.focus = new THREE.Vector3();
    this.dragging = null;
    this.pointers = new Map();
    this.pinchStart = 0;

    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  onDown = (e) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchDist = this.targetDistance;
      this.dragging = null;
      return;
    }
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse' && e.button === 2) this.dom.style.cursor = 'grabbing';
  };

  onMove = (e) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.targetDistance = THREE.MathUtils.clamp(this.pinchDist * (this.pinchStart / Math.max(1, d)), this.min, this.max);
      return;
    }
    const d = this.dragging;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    this.lastManual = performance.now();
    const s = 0.0055 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * s, -1.2, 1.35);
  };

  onUp = (e) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
    if (this.dragging?.id === e.pointerId) this.dragging = null;
    this.dom.style.cursor = '';
  };

  onWheel = (e) => {
    e.preventDefault();
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * (1 + Math.sign(e.deltaY) * 0.12), this.min, this.max);
  };

  // follow: { yaw, strength } swings the camera behind a moving vehicle unless the player is steering the camera
  update(dt, target, turn = 0, pitchTurn = 0, follow = null) {
    if (turn || pitchTurn) this.lastManual = performance.now();
    this.yaw += turn * dt * 2.2 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitchTurn * dt * 1.6 * this.sensitivity, -1.2, 1.35);
    const idle = !this.dragging && performance.now() - (this.lastManual || 0) > 1200;
    if (follow && idle && follow.strength > 0) {
      let d = ((follow.yaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 3 * follow.strength);
    }
    this.focus.lerp(target, 1 - Math.exp(-dt * 20));
    // at race speed that smoothing would leave the camera far behind the bike: cap the lag
    const lag = this.focus.distanceTo(target);
    if (lag > 3) this.focus.lerpVectors(target, this.focus, 3 / lag);
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-dt * 12));
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );
    if (this.camera.position.y < 0.6 && Math.abs(this.focus.x) < 120 && Math.abs(this.focus.z) < 120) this.camera.position.y = 0.6;
    this.camera.lookAt(this.focus);
  }
}
