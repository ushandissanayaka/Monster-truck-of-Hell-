// Shared, cached materials with a bright Roblox "SmoothPlastic" look.

import * as THREE from 'three';

const cache = new Map();

export function plastic(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...opts }));
  }
  return cache.get(key);
}

export function neon(color, intensity = 1) {
  const key = `neon|${color}|${intensity}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6 }));
  }
  return cache.get(key);
}

export function glass(opacity = 0.16) {
  const key = `glass|${opacity}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color: 0xe8f6ff, transparent: true, opacity, roughness: 0.05, metalness: 0.1,
      depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return cache.get(key);
}
