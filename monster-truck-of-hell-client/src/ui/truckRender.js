// Pictures of the trucks for the HUD and the windows: one small offscreen three.js renderer draws the
// real in-game models as cached still images (data URLs) or a slowly turning preview.
import * as THREE from 'three';
import { MonsterTruck } from '../game/entities/MonsterTruck.js';

const W = 360, H = 260;
let ctx = null;

function setup() {
  if (ctx) return ctx;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4ee', '#7a3a30', 1.6));
  scene.add(new THREE.AmbientLight('#ffffff', 0.4));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.4);
  sun.position.set(8, 14, 10);
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#ffd0c0', 1.0);
  rim.position.set(-10, 6, -8);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
  camera.position.set(0, 12, 36);
  camera.lookAt(0, 5, 0);
  const holder = new THREE.Group();
  scene.add(holder);
  ctx = { renderer, scene, camera, holder, models: new Map() };
  return ctx;
}

function model(id, hat) {
  const c = setup();
  const key = `${id}|${hat || ''}`;
  if (!c.models.has(key)) {
    const t = new MonsterTruck(id, { shadows: false });
    t.setHat(hat);
    t.update(0, 0, 0);
    c.models.set(key, t);
  }
  return c.models.get(key).object;
}

function render(id, angle, hat) {
  const c = setup();
  c.holder.clear();
  c.holder.add(model(id, hat));
  c.holder.rotation.y = angle;
  c.renderer.render(c.scene, c.camera);
  return c.renderer.domElement;
}

const stills = new Map();
// a still 3/4 view (front to the left like the reference icons), made once per truck
export function truckImage(id, angle = -0.75, hat = null) {
  const key = `${id}|${angle}|${hat || ''}`;
  if (!stills.has(key)) {
    try {
      stills.set(key, render(id, angle, hat).toDataURL('image/png'));
    } catch {
      stills.set(key, null);
    }
  }
  return stills.get(key);
}

export function drawTurning(canvas, id, angle, hat = null) {
  try {
    const src = render(id, angle, hat);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
  } catch { /* no WebGL */ }
}
