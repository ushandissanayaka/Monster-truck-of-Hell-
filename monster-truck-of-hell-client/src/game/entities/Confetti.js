import * as THREE from 'three';

// Paper confetti for the finish: bright little cards shot up round a point, then fluttering down,
// tumbling and drifting side to side, fading out at the end.
const COUNT = 600;
const LIFE = 5;
const COLORS = ['#ff3b3b', '#ffd21a', '#2fd65a', '#2cb6ff', '#b35cff', '#ff7ad9', '#ff8a1e', '#ffffff'];

export function createConfetti() {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.55), mat, COUNT);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const color = new THREE.Color();
  for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, color.set(COLORS[i % COLORS.length]));
  const tmp = new THREE.Object3D();
  const bits = Array.from({ length: COUNT }, () => ({
    p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), ph: 0,
  }));
  let age = Infinity;

  return {
    object: mesh,
    // a burst round pos (the truck crossing the line)
    burst(pos) {
      age = 0;
      mesh.visible = true;
      for (const b of bits) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 10;
        b.p.set(pos.x + Math.cos(a) * r, pos.y + 4 + Math.random() * 6, pos.z + Math.sin(a) * r);
        const out = 8 + Math.random() * 18;
        b.v.set(Math.cos(a) * out, 30 + Math.random() * 35, Math.sin(a) * out);
        b.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        b.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        b.ph = Math.random() * 6;
      }
    },
    update(dt) {
      if (!mesh.visible) return;
      age += dt;
      if (age > LIFE) { mesh.visible = false; return; }
      mat.opacity = Math.min(1, (LIFE - age) / 1.2);
      for (let i = 0; i < COUNT; i++) {
        const b = bits[i];
        // paper: strong air drag, slow fall, a side to side flutter
        b.v.y -= 22 * dt;
        b.v.multiplyScalar(Math.exp(-dt * 1.8));
        b.v.y = Math.max(b.v.y, -9);
        b.p.addScaledVector(b.v, dt);
        b.p.x += Math.sin(age * 4 + b.ph) * dt * 3;
        b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
        tmp.position.copy(b.p);
        tmp.rotation.copy(b.rot);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
