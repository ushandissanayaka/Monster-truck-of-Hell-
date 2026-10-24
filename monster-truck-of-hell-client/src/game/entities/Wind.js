import * as THREE from 'three';

// Wind streaks in the air around the truck after a speed pad or a pink ring, and while it flies off a
// jump or falls. They lie along the way it is moving (forwards, up the jump or down the fall) and stay
// put in the world, so they rush past at the truck's real speed (true parallax), stretching with speed.
// Thin boxes (not 1px lines) so they read clearly against the bright sky.
const COUNT = 70;
const Z = new THREE.Vector3(0, 0, 1);

export function createWind() {
  const mat = new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, COUNT);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const tmp = new THREE.Object3D();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), d = new THREE.Vector3();

  const streaks = Array.from({ length: COUNT }, () => ({ p: new THREE.Vector3(), w: 0, live: false }));
  // across the way of travel: a ring round the truck, a little more above than below
  const place = (st, pos, dir, ahead) => {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
    const along = ahead ? 30 + Math.random() * 120 : Math.random() * 170 - 20;  // the first ones also between camera and truck
    st.p.copy(pos).addScaledVector(dir, along).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.abs(Math.sin(a)) * r * 0.8 + 0.6);
    st.w = 0.12 + Math.random() * 0.16;
    st.live = true;
  };

  return {
    object: mesh,
    // pos: truck position, dir: unit direction it is moving, speed: units/s, fx: 0..1 how strong (0 hides the wind)
    update(pos, dir, speed, fx) {
      mat.opacity = 0.35 + 0.55 * fx;
      mesh.visible = fx > 0.02;
      mesh.count = Math.max(1, Math.round(COUNT * fx)); // more streaks the stronger the rush
      if (!mesh.visible) {
        for (const st of streaks) st.live = false;
        return;
      }
      // u: sideways, v: "up" across the way of travel
      u.set(0, 1, 0).cross(dir);
      if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
      u.normalize();
      v.copy(dir).cross(u).normalize();
      if (v.y < 0) v.negate();
      const len = 5 + Math.abs(speed) * 0.12;
      tmp.quaternion.setFromUnitVectors(Z, dir);
      streaks.forEach((st, i) => {
        if (!st.live) place(st, pos, dir, false);
        else {
          d.copy(st.p).sub(pos);
          const along = d.dot(dir);
          if (along + len / 2 < -25 || d.addScaledVector(dir, -along).length() > 30 || along > 200) place(st, pos, dir, true); // passed: respawn ahead
        }
        tmp.position.copy(st.p);
        tmp.scale.set(st.w, st.w, len);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
