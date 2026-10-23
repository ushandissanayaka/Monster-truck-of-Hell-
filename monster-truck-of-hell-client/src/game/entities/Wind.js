import * as THREE from 'three';

// Wind streaks in the air around the rider while racing. They stay put in the world, so they rush
// past at the bike's real speed (true parallax), and they stretch and brighten with speed.
// Thin boxes (not 1px lines) so they read clearly against the bright sky.
const COUNT = 70;

export function createWind() {
  const mat = new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, COUNT);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const tmp = new THREE.Object3D();

  const streaks = Array.from({ length: COUNT }, () => ({ x: 0, y: 0, z: 0, w: 0, live: false }));
  const place = (s, p, ahead) => {
    const side = Math.random() < 0.5 ? -1 : 1;
    s.x = p.x + side * (2.5 + Math.random() * 14);
    s.y = p.y + 0.6 + Math.random() * 11;
    s.z = p.z - (ahead ? 30 + Math.random() * 120 : Math.random() * 170 - 20); // first ones also between camera and bike
    s.w = 0.12 + Math.random() * 0.16;
    s.live = true;
  };

  return {
    object: mesh,
    // pos: rider position, speed: units/s, fx: 0..1 how flat out (0 hides the wind)
    update(pos, speed, fx) {
      mat.opacity = 0.35 + 0.55 * fx;
      mesh.visible = fx > 0.02;
      mesh.count = Math.max(1, Math.round(COUNT * fx)); // more streaks the faster you go
      if (!mesh.visible) {
        for (const s of streaks) s.live = false;
        return;
      }
      const len = 5 + speed * 0.1;
      streaks.forEach((s, i) => {
        if (!s.live) place(s, pos, false);
        else if (s.z - len / 2 > pos.z + 25 || Math.abs(s.x - pos.x) > 30) place(s, pos, true); // passed: respawn ahead
        tmp.position.set(s.x, s.y, s.z);
        tmp.scale.set(s.w, s.w, len);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
