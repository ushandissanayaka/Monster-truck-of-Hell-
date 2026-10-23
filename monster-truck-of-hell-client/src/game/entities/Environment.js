// Sky, lava sea (far below the course) and lights. The sky dome (clouds and the mountain wall) and the
// lava plane follow the camera, so the mountains stay on the horizon and the lava reaches them
// wherever you drive.

import * as THREE from 'three';
import { lavaMaterial } from '../util/textures.js';
import { createSkyDome } from '../util/sky.js';
import { WORLD } from '../../shared/gameData.js';

export function createEnvironment(scene, renderer, quality = 'High') {
  scene.background = new THREE.Color('#5c0b0a');
  scene.fog = new THREE.Fog('#b0301a', 900, 3600);

  // sky: a dome painted once at load (the sunset sits behind the course, north)
  const sky = createSkyDome(renderer, quality);
  scene.add(sky);

  // only a disc around you: seen from the middle of the stage its far edge hides below the stage edge
  // (the sky dome's mountain wall fills the view down there); go to the edge to look down at it
  const lava = new THREE.Mesh(new THREE.CircleGeometry(3000, 64), lavaMaterial());
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = WORLD.lavaY;
  scene.add(lava);

  // lights: neutral daylight on the grey studs (as in the reference) with a warm sun and a red bounce
  scene.add(new THREE.HemisphereLight('#fff1e8', '#a03020', 1.25));
  scene.add(new THREE.AmbientLight('#ffffff', 0.35));
  const sun = new THREE.DirectionalLight('#fff4e6', 2.1);
  sun.position.set(-120, 260, 160);
  sun.castShadow = quality !== 'Low';
  const sm = { Medium: 1024, High: 2048, Ultra: 4096 }[quality] || 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 700;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const offset = sun.position.clone();

  return {
    update(dt, time, camera, focus) {
      sky.position.copy(camera.position);
      lava.position.x = Math.round(camera.position.x / 100) * 100;
      lava.position.z = Math.round(camera.position.z / 100) * 100;
      // the shadow box follows the player
      sun.target.position.set(focus.x, focus.y, focus.z);
      sun.position.copy(focus).add(offset);
    },
  };
}
