// The Bloxity base character (static.bloxity.io/avatars/player.glb) with the player's
// equipped cosmetics, body proportions, procedural Roblox-style animations and Boxity emotes.
// Placement rules follow docs.bloxity.io ("Avatar / cosmetics").

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { WORLD } from '../../shared/gameData.js';
import { applyEmote, getEmote } from '../../bloxity/emotes.js';

export const CDN = 'https://static.bloxity.io/avatars';
const SKIN_API = 'https://api.bloxity.io/v1/avatar/skin-texture';

const PART_MESH_NAMES = {
  head: 'default_head', arm_L: 'default_arm_L', arm_R: 'default_arm_R',
  leg_L: 'default_leg_L', leg_R: 'default_leg_R', torso: 'default_torso',
};
const PART_SLOT = {
  head: { key: 'headId', dir: 'head', suffix: '' },
  arm_L: { key: 'armLId', dir: 'arms', suffix: '_L' },
  arm_R: { key: 'armRId', dir: 'arms', suffix: '_R' },
  leg_L: { key: 'legLId', dir: 'legs', suffix: '_L' },
  leg_R: { key: 'legRId', dir: 'legs', suffix: '_R' },
  torso: { key: 'torsoId', dir: 'torso', suffix: '' },
};
const ACCESSORIES = {
  neckId: { slot: 'neck', bone: 'Spine2', origin: [0, 4.8, 0] },
  chestId: { slot: 'chest', bone: 'Spine2', origin: [0, 3.6, 0] },
  waistId: { slot: 'waist', bone: 'Spine1', origin: [0, 2.4, 0] },
};
const PAIRS = {
  handId: { slot: 'hand', left: 'ArmL2_leaf', right: 'ArmR2_leaf' },
  shoesId: { slot: 'shoes', left: 'LegL2_leaf', right: 'LegR2_leaf' },
};
const ABOVE_SPINE = new Set(['Spine2', 'ArmL_Offset', 'ArmL1', 'ArmL2', 'ArmR_Offset', 'ArmR1', 'ArmR2', 'Neck_Offset', 'Neck1']);

export const isEq = (id) => id !== undefined && id !== null && id !== '' && id !== '-1' && id !== 'undefined' && id !== -1;

export function skinUrlFor(eq = {}) {
  const skin = isEq(eq.skinId) ? eq.skinId : '0';
  let segs = '';
  if (isEq(eq.pantsId)) segs += `_pn${eq.pantsId}`;
  if (isEq(eq.shirtId)) segs += `_sh${eq.shirtId}`;
  if (isEq(eq.faceId)) segs += `_fc${eq.faceId}`;
  return segs ? `${SKIN_API}/s${skin}${segs}.png` : `${CDN}/skins/${skin}.png`;
}

let basePromise = null;
function loadBase() {
  if (!basePromise) basePromise = new GLTFLoader().loadAsync(`${CDN}/player.glb`);
  return basePromise;
}
export function preloadAvatar() {
  return loadBase().catch(() => null);
}

const texCache = new Map();
function loadPixelTexture(url) {
  if (!texCache.has(url)) {
    texCache.set(url, new Promise((resolve, reject) => {
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (tex) => {
        tex.flipY = false;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      }, undefined, reject);
    }));
  }
  return texCache.get(url);
}
const objCache = new Map();
function loadObj(url) {
  if (!objCache.has(url)) objCache.set(url, new OBJLoader().loadAsync(url));
  return objCache.get(url).then((o) => o.clone());
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _qa = new THREE.Quaternion();
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

export class BloxityAvatar {
  constructor({ equipped = {}, proportions = {}, skinUrl = null } = {}) {
    this.root = new THREE.Group();          // moved/rotated by Player; character faces +Z
    this.inner = new THREE.Group();
    this.inner.scale.setScalar(WORLD.avatarScale);
    this.root.add(this.inner);

    this.props = { ...proportions };
    this.equipped = {};
    this.pendingEquipped = { ...equipped };
    this.skinUrl = skinUrl;
    this.bones = {};      // name -> bone
    this.bind = {};       // name -> { p, q, s }
    this.lateral = {};    // name -> local axis matching model X
    this.restInverse = {};
    this.attachments = {}; // key -> object or [left, right]
    this.pairs = [];
    this.walkPhase = 0;
    this.time = 0;
    this.emote = null;     // { clip, t, weight }
    this.anim = 'idle';
    this.speed = 0;
    this.headHeight = 6.5 * WORLD.avatarScale;

    this.ready = this._load();
  }

  async _load() {
    let gltf = null;
    try { gltf = await loadBase(); } catch (err) { console.warn('[avatar] player.glb failed, using fallback rig', err); }
    if (gltf) this._setupGltf(SkeletonUtils.clone(gltf.scene));
    else this._setupFallback();
    await this.setEquipped(this.pendingEquipped, this.skinUrl);
    return this;
  }

  _setupGltf(model) {
    this.model = model;
    this.partMeshes = {};
    this.origGeos = {};
    model.traverse((c) => {
      if (c.isSkinnedMesh) {
        if (!this.skeleton) this.skeleton = c.skeleton;
        c.material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.85 });
        c.castShadow = true;
        c.receiveShadow = false;
        c.frustumCulled = false;
        for (const [slot, name] of Object.entries(PART_MESH_NAMES)) {
          if (c.name.toLowerCase() === name.toLowerCase()) {
            this.partMeshes[slot] = c;
            this.origGeos[slot] = c.geometry;
          }
        }
      }
    });

    model.updateMatrixWorld(true);
    const modelInv = _m2.copy(model.matrixWorld).invert();
    for (const bone of this.skeleton.bones) {
      this.bones[bone.name] = bone;
      this.bind[bone.name] = { p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() };
      const rest = new THREE.Matrix4().multiplyMatrices(modelInv, bone.matrixWorld);
      this.restInverse[bone.name] = rest.clone().invert();
      rest.decompose(_p, _q, _s);
      this.lateral[bone.name] = AX_X.clone().applyQuaternion(_q.clone().invert()).normalize();
    }
    // leaf bones are not always part of skeleton.bones
    model.traverse((o) => {
      if (o.isBone && !this.bones[o.name]) {
        this.bones[o.name] = o;
        const rest = new THREE.Matrix4().multiplyMatrices(modelInv, o.matrixWorld);
        this.restInverse[o.name] = rest.clone().invert();
      }
    });

    let neckOffsetBindY = 0;
    this.skeleton.bones.forEach((b, i) => {
      if (b.name === 'Neck_Offset') neckOffsetBindY = this.skeleton.boneInverses[i].clone().invert().elements[13];
    });
    this.neckOffsetBindY = neckOffsetBindY;
    this._patchSkeleton(model);

    this.inner.add(model);
  }

  // Width proportions edit bone matrices after the skeleton update (same as the Boxity test game).
  _patchSkeleton(model) {
    const patched = new Set();
    model.traverse((c) => {
      if (!c.isSkinnedMesh || patched.has(c.skeleton)) return;
      patched.add(c.skeleton);
      const skel = c.skeleton;
      const orig = skel.update.bind(skel);
      const bindPos = new Map();
      skel.bones.forEach((b, i) => bindPos.set(b.name, new THREE.Vector3().setFromMatrixPosition(skel.boneInverses[i].clone().invert())));
      const spine1X = bindPos.get('Spine1')?.x ?? 0;
      const CS = 0.8;
      const self = this;
      skel.update = function () {
        orig();
        const p = self.props;
        const sw = p.shoulderWidth ?? 1, lox = p.legOffsetX ?? 1, tsx = p.torsoScaleX ?? 1;
        if (sw === 1 && lox === 1 && tsx === 1) return;
        const bm = this.boneMatrices;
        for (let i = 0; i < this.bones.length; i++) {
          const name = this.bones[i].name, off = i * 16;
          if ((name === 'Spine1' || name === 'Spine2') && tsx !== 1) {
            bm[off] *= tsx; bm[off + 1] *= tsx; bm[off + 2] *= tsx; bm[off + 3] *= tsx;
          }
          if (ABOVE_SPINE.has(name) && tsx !== 1) {
            const bp = bindPos.get(name);
            if (bp) bm[off + 12] += (bp.x - spine1X) * (tsx - 1) * CS;
          }
          if (sw !== 1 && name.startsWith('Arm')) {
            const refX = bindPos.get(name.startsWith('ArmL') ? 'ArmL_Offset' : 'ArmR_Offset')?.x ?? 0;
            if (refX) bm[off + 12] += refX * (sw - 1) * CS;
          }
          if (lox !== 1 && name.startsWith('Leg')) {
            const refX = bindPos.get(name.startsWith('LegL') ? 'LegL_Offset' : 'LegR_Offset')?.x ?? 0;
            if (refX) bm[off + 12] += refX * (lox - 1) * CS;
          }
        }
      };
    });
  }

  // Offline fallback: a classic blocky rig built from boxes with the same bone names.
  _setupFallback() {
    const model = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    const box = (w, h, d, c, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.y = y;
      m.castShadow = true;
      return m;
    };
    const pivot = (name, x, y, z, parent) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const spine1 = pivot('Spine1', 0, 2.4, 0, model);
    spine1.add(box(2.4, 2.4, 1.2, 0x2f6fd6, 1.2));
    const neck = pivot('Neck1', 0, 2.4, 0, spine1);
    const head = box(1.6, 1.6, 1.6, 0xf5d142, 0.8);
    neck.add(head);
    const armL = pivot('ArmL_Offset', 1.8, 2.4, 0, spine1);
    armL.add(box(1.2, 2.4, 1.2, 0xf5d142, -1.2));
    const armR = pivot('ArmR_Offset', -1.8, 2.4, 0, spine1);
    armR.add(box(1.2, 2.4, 1.2, 0xf5d142, -1.2));
    const legL = pivot('LegL_Offset', 0.6, 2.4, 0, model);
    legL.add(box(1.2, 2.4, 1.2, 0x3fb04a, -1.2));
    const legR = pivot('LegR_Offset', -0.6, 2.4, 0, model);
    legR.add(box(1.2, 2.4, 1.2, 0x3fb04a, -1.2));
    for (const o of [spine1, neck, armL, armR, legL, legR]) {
      this.bones[o.name] = o;
      this.bind[o.name] = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
      this.lateral[o.name] = AX_X.clone();
    }
    this.model = model;
    this.fallback = true;
    this.inner.add(model);
  }

  // ---------------------------------------------------------------------------

  async setEquipped(eq = {}, skinUrl = null) {
    if (!this.model) {
      this.pendingEquipped = { ...eq };
      return;
    }
    const prev = this.equipped;
    this.equipped = { ...eq };
    if (this.fallback) return;

    const url = skinUrl || skinUrlFor(eq);
    if (url !== this.currentSkinUrl) {
      this.currentSkinUrl = url;
      loadPixelTexture(url)
        .catch(() => loadPixelTexture(`${CDN}/skins/0.png`))
        .then((tex) => this._applySkin(tex))
        .catch(() => {});
    }
    for (const [slot, info] of Object.entries(PART_SLOT)) {
      if (eq[info.key] !== prev[info.key]) this._swapPart(slot, eq[info.key]);
    }
    for (const key of ['hatId', 'hairId', 'maskId']) {
      if (eq[key] !== prev[key]) this._attachHeadItem(key, eq[key]);
    }
    if (eq.backId !== prev.backId) this._attachBack(eq.backId);
    for (const [key, a] of Object.entries(ACCESSORIES)) {
      if (eq[key] !== prev[key]) this._attachAccessory(key, a, eq[key]);
    }
    for (const [key, a] of Object.entries(PAIRS)) {
      if (eq[key] !== prev[key]) this._attachPair(key, a, eq[key]);
    }
  }

  setProportions(p = {}) {
    this.props = { ...p };
  }

  _applySkin(tex) {
    this.model.traverse((c) => {
      if (c.isSkinnedMesh && c.material) {
        c.material.map = tex;
        c.material.needsUpdate = true;
      }
    });
  }

  _swapPart(slot, itemId) {
    const target = this.partMeshes?.[slot];
    if (!target) return;
    if (!isEq(itemId)) {
      target.geometry = this.origGeos[slot];
      return;
    }
    const info = PART_SLOT[slot];
    new GLTFLoader().load(`${CDN}/parts/${info.dir}/${itemId}${info.suffix}.glb`, (gltf) => {
      let sm = null, rm = null;
      gltf.scene.traverse((c) => {
        if (c.isSkinnedMesh && !sm) sm = c;
        else if (c.isMesh && !rm) rm = c;
      });
      if (!sm) { if (rm) target.geometry = rm.geometry; return; }
      const geo = sm.geometry.clone();
      const nameMap = new Map();
      this.skeleton.bones.forEach((b, i) => nameMap.set(b.name, i));
      const idx = new Map();
      sm.skeleton.bones.forEach((b, i) => { const ci = nameMap.get(b.name); if (ci !== undefined) idx.set(i, ci); });
      const si = geo.getAttribute('skinIndex');
      if (si) {
        for (let i = 0; i < si.array.length; i++) { const m = idx.get(si.array[i]); if (m !== undefined) si.array[i] = m; }
        si.needsUpdate = true;
      }
      target.geometry = geo;
    }, undefined, (err) => console.warn(`[avatar] part ${slot} failed`, err));
  }

  _detach(key) {
    const a = this.attachments[key];
    if (!a) return;
    for (const o of Array.isArray(a) ? a : [a]) o.parent?.remove(o);
    this.pairs = this.pairs.filter((p) => p.key !== key);
    delete this.attachments[key];
  }

  async _texturedObj(slotDir, id) {
    const [obj, tex] = await Promise.all([
      loadObj(`${CDN}/items/${slotDir}/${id}.obj`),
      loadPixelTexture(`${CDN}/textures/${slotDir}/${id}.png`).catch(() => null),
    ]);
    obj.traverse((c) => {
      if (c.isMesh) {
        if (tex) { tex.flipY = true; tex.needsUpdate = true; }
        c.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
        c.castShadow = true;
      }
    });
    return obj;
  }

  // Hats, hair and masks: /items/hats/{id}.obj on bone Neck1 at local (0, 0.8, 0).
  async _attachHeadItem(key, id) {
    this._detach(key);
    if (!isEq(id) || !this.bones.Neck1) return;
    try {
      const obj = await this._texturedObj('hats', id);
      if (this.equipped[key] !== id) return;
      obj.position.set(0, 0.8, 0);
      this.bones.Neck1.add(obj);
      this.attachments[key] = obj;
    } catch (err) { console.warn('[avatar] head item failed', err); }
  }

  async _attachBack(id) {
    this._detach('backId');
    if (!isEq(id) || !this.bones.Spine2) return;
    try {
      const obj = await this._texturedObj('back', id);
      if (this.equipped.backId !== id) return;
      this.bones.Spine2.add(obj);
      this.attachments.backId = obj;
    } catch (err) { console.warn('[avatar] back item failed', err); }
  }

  // neck / chest / waist: local = restInverse(bone) * scale(tsx,1,1) * translate(origin)
  async _attachAccessory(key, a, id) {
    this._detach(key);
    if (!isEq(id) || !this.bones[a.bone]) return;
    try {
      const obj = await this._texturedObj(a.slot, id);
      if (this.equipped[key] !== id) return;
      obj.matrixAutoUpdate = false;
      obj.userData.accessory = a;
      this.bones[a.bone].add(obj);
      this.attachments[key] = obj;
      this._updateAccessoryMatrix(obj);
    } catch (err) { console.warn('[avatar] accessory failed', err); }
  }

  _updateAccessoryMatrix(obj) {
    const a = obj.userData.accessory;
    const tsx = this.props.torsoScaleX ?? 1;
    obj.matrix.copy(this.restInverse[a.bone])
      .multiply(_m.makeScale(tsx, 1, 1))
      .multiply(_m2.makeTranslation(a.origin[0], a.origin[1], a.origin[2]));
    obj.matrixWorldNeedsUpdate = true;
  }

  // hand / shoes: a pair that follows the leaf bones' position + rotation only.
  async _attachPair(key, a, id) {
    this._detach(key);
    if (!isEq(id) || !this.bones[a.left] || !this.bones[a.right]) return;
    try {
      const left = await this._texturedObj(a.slot, id);
      if (this.equipped[key] !== id) return;
      const right = left.clone();
      for (const o of [left, right]) { o.matrixAutoUpdate = false; this.model.add(o); }
      const localL = this.restInverse[a.left].clone();
      const localR = this.restInverse[a.right].clone().multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      this.pairs.push({ key, obj: left, bone: this.bones[a.left], local: localL, side: 1, isHand: a.slot === 'hand' });
      this.pairs.push({ key, obj: right, bone: this.bones[a.right], local: localR, side: -1, isHand: a.slot === 'hand' });
      this.attachments[key] = [left, right];
    } catch (err) { console.warn('[avatar] pair accessory failed', err); }
  }

  _updatePairs() {
    if (!this.pairs.length) return;
    const modelInv = _m2.copy(this.model.matrixWorld).invert();
    const p = this.props;
    for (const pr of this.pairs) {
      _m.multiplyMatrices(modelInv, pr.bone.matrixWorld).decompose(_p, _q, _s);
      const shift = pr.isHand
        ? pr.side * 0.8 * (2 * ((p.shoulderWidth ?? 1) - 1) + 2 * ((p.torsoScaleX ?? 1) - 1))
        : pr.side * 0.8 * 0.6 * ((p.legOffsetX ?? 1) - 1);
      _p.x += shift;
      pr.obj.matrix.compose(_p, _q, _one).multiply(pr.local);
      pr.obj.matrixWorldNeedsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------

  playEmote(id) {
    const e = getEmote(id);
    if (!e?.clip) return;
    this.emote = { clip: e.clip, t: 0, weight: 0 };
  }

  stopEmote() {
    this.emote = null;
  }

  _swing(name, angle) {
    const b = this.bones[name];
    const ax = this.lateral[name];
    if (!b || !ax || !angle) return;
    b.quaternion.multiply(_qa.setFromAxisAngle(ax, angle));
  }

  update(dt) {
    if (!this.model) return;
    this.time += dt;
    const t = this.time;
    const p = this.props;
    const h = p.height ?? 1, al = p.armLength ?? 1, hs = p.headScale ?? 1, nh = p.neckHeight ?? 1;
    this.inner.scale.set(WORLD.avatarScale, WORLD.avatarScale * h, WORLD.avatarScale);
    this.headHeight = 6.5 * WORLD.avatarScale * h;

    // reset to bind pose
    for (const [name, d] of Object.entries(this.bind)) {
      const bone = this.bones[name];
      bone.position.copy(d.p);
      bone.quaternion.copy(d.q);
      bone.scale.copy(d.s);
      if (this.fallback) continue;
      if (name.startsWith('Arm')) bone.scale.y = d.s.y * al;
      if (name === 'Neck_Offset') {
        bone.position.y += (h - hs) * d.p.y;
        bone.position.y += this.neckOffsetBindY * (nh - 1) * 0.8;
      }
      if (name === 'Neck1') bone.scale.set(d.s.x * hs, d.s.y * (hs / h), d.s.z * hs);
    }

    const anim = this.anim;
    if (anim !== 'idle' && this.emote) this.emote = null;

    if (anim === 'walk' || anim === 'run') {
      const k = Math.min(1.4, 0.55 + this.speed / 22);
      this.walkPhase += dt * (6 + this.speed * 0.35);
      const s = Math.sin(this.walkPhase) * k;
      this._swing('LegL_Offset', s);
      this._swing('LegR_Offset', -s);
      this._swing('ArmL_Offset', -s);
      this._swing('ArmR_Offset', s);
    } else if (anim === 'jump' || anim === 'fall') {
      const up = anim === 'jump' ? -2.9 : -2.5;
      this._swing('ArmL_Offset', up);
      this._swing('ArmR_Offset', up);
      this._swing('LegL_Offset', anim === 'jump' ? -0.35 : 0.25);
      this._swing('LegR_Offset', anim === 'jump' ? 0.25 : -0.35);
    } else if (anim === 'ride') {
      // seated on the scooter: thighs forward, shins down to the floorboard, hands on the handlebar
      this._swing('LegL_Offset', -1.0);
      this._swing('LegR_Offset', -1.0);
      this._swing('LegL2', 1.05);
      this._swing('LegR2', 1.05);
      this._swing('ArmL_Offset', -1.05);
      this._swing('ArmR_Offset', -1.05);
      if (this.bones.Spine1) this.bones.Spine1.quaternion.multiply(_qa.setFromAxisAngle(this.lateral.Spine1 || AX_X, 0.08));
    } else if (anim === 'sit') {
      this._swing('LegL_Offset', -1.45);
      this._swing('LegR_Offset', -1.45);
      this._swing('ArmL_Offset', -1.25);
      this._swing('ArmR_Offset', -1.25);
    } else {
      // idle: subtle breathing / sway like the Boxity viewer
      const breathe = Math.sin(t * 1.8) * 0.015;
      const sway = Math.sin(t * 0.7) * 0.015;
      if (this.bones.Spine1) this.bones.Spine1.quaternion.multiply(_qa.setFromAxisAngle(AX_Z, sway));
      if (this.bones.Spine2 && !this.fallback) {
        this.bones.Spine2.scale.x *= 1 + breathe;
        this.bones.Spine2.position.y += breathe * 0.5;
      }
      this._swing('ArmL_Offset', Math.sin(t * 1.2) * 0.03);
      this._swing('ArmR_Offset', -Math.sin(t * 1.2) * 0.03);

      if (this.emote) {
        const e = this.emote;
        e.t += dt;
        e.weight = Math.min(1, e.weight + dt / 0.1);
        if (!applyEmote(e.clip, e.t, this.bones, e.weight)) this.emote = null;
      }
    }

    this.root.updateMatrixWorld(true);
    for (const a of Object.values(this.attachments)) {
      if (!Array.isArray(a) && a.userData.accessory) this._updateAccessoryMatrix(a);
    }
    this._updatePairs();
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) o.geometry?.dispose?.();
    });
  }
}
