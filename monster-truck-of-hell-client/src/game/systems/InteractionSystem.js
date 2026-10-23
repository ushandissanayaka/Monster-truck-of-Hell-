import * as THREE from 'three';

// Roblox ProximityPrompt equivalent: shows "[E] Action" over the nearest interactable.
// autoOpen items (with a `modal` type) also open their window by themselves when the player walks
// up, and close it again when the player walks away; closing it by hand keeps it closed until the
// player leaves and comes back.
export class InteractionSystem {
  constructor(store) {
    this.store = store;
    this.items = [];
    this.current = null;
    this._v = new THREE.Vector3();
  }

  add({ id, position, radius = 8, height = 6, object = 'Object', action, onTrigger, autoOpen = false, modal = null }) {
    this.items.push({ id, position: position.clone(), radius, height, object, action, onTrigger, autoOpen, modal, inside: false });
  }

  trigger() {
    if (this.current) this.current.onTrigger();
  }

  near(it, playerPos) {
    const d = Math.hypot(it.position.x - playerPos.x, it.position.z - playerPos.z);
    return d < it.radius && Math.abs(playerPos.y - it.position.y) < 12 ? d : -1;
  }

  update(playerPos, camera, width, height) {
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const d = this.near(it, playerPos);
      if (it.autoOpen) {
        const inside = d >= 0;
        const modal = this.store.getState().modal;
        if (inside && !it.inside && !modal) it.onTrigger();
        if (!inside && it.inside && modal?.type === it.modal) this.store.setState({ modal: null });
        it.inside = inside;
      }
      if (d >= 0 && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    this.current = best;
    if (!best) {
      if (this.store.getState().prompt) this.store.setState({ prompt: null });
      return;
    }
    this._v.set(best.position.x, best.position.y + best.height, best.position.z).project(camera);
    const visible = this._v.z < 1;
    const x = (this._v.x * 0.5 + 0.5) * width;
    const y = (-this._v.y * 0.5 + 0.5) * height;
    const prev = this.store.getState().prompt;
    if (!visible) {
      if (prev) this.store.setState({ prompt: null });
      return;
    }
    if (!prev || prev.id !== best.id || Math.abs(prev.x - x) > 0.5 || Math.abs(prev.y - y) > 0.5) {
      this.store.setState({ prompt: { id: best.id, x, y, object: best.object, action: best.action } });
    }
  }
}
