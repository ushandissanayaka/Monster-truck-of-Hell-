// Boxity emote clips for the standard rig (player.glb).
// Tracks are DEGREE DELTAS over the bind pose, euler XYZ, right-multiplied onto the bind quaternion,
// smoothstep between keys, clamped outside the key range, looping on time % len.

import * as THREE from 'three';

const API = 'https://api.bloxity.io/v1/avatar/emotes';
let catalogue = null;
let loading = null;

export function loadEmotes() {
  if (catalogue) return Promise.resolve(catalogue);
  if (!loading) {
    loading = fetch(API)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.emotes || data?.items || [];
        catalogue = new Map(list.filter((e) => e?.id && e.clip).map((e) => [e.id, e]));
        return catalogue;
      })
      .catch(() => (catalogue = new Map()));
  }
  return loading;
}

export function getEmote(id) {
  return catalogue?.get(id) || null;
}

const euler = new THREE.Euler(0, 0, 0, 'XYZ');
const qDelta = new THREE.Quaternion();
const D2R = Math.PI / 180;

function sampleTrack(keys, t) {
  if (!keys?.length) return null;
  if (t <= keys[0][0]) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a[0] && t <= b[0]) {
      let s = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      s = s * s * (3 - 2 * s);
      return [t, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s];
    }
  }
  return last;
}

// Applies an emote clip at time `t` on top of bones already reset to bind pose.
// weight blends the delta in (0..1). Returns false when a one-shot clip is over.
export function applyEmote(clip, t, bonesByName, weight = 1) {
  if (!clip?.tracks) return false;
  const len = clip.len || 1;
  const done = !clip.loop && t > len;
  const time = clip.loop ? t % len : Math.min(t, len);
  for (const [name, keys] of Object.entries(clip.tracks)) {
    const bone = bonesByName[name];
    if (!bone) continue;
    const k = sampleTrack(keys, time);
    if (!k) continue;
    euler.set(k[1] * D2R * weight, k[2] * D2R * weight, k[3] * D2R * weight, 'XYZ');
    qDelta.setFromEuler(euler);
    bone.quaternion.multiply(qDelta);
  }
  return !done;
}
