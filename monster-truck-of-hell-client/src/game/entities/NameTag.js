import * as THREE from 'three';
import { drawOutlinedText, canvasTexture, measure, FONT_UI } from '../util/canvasText.js';

// Roblox-style overhead name: white text with a soft dark outline, optional gold [VIP] tag.
export function createNameTag(name, { vip = false } = {}) {
  const size = 46;
  const prefix = vip ? '[VIP] ' : '';
  const w = Math.ceil(measure(prefix + name, size, FONT_UI, 600) + 40);
  const c = document.createElement('canvas');
  c.width = Math.max(64, w);
  c.height = 72;
  const ctx = c.getContext('2d');
  let x = 20;
  if (vip) {
    x += drawOutlinedText(ctx, prefix, x, 38, { size, weight: 600, fill: '#ffd21f', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 4, align: 'left' });
  }
  drawOutlinedText(ctx, name, x, 38, { size, weight: 600, fill: '#ffffff', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 4, align: 'left' });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false }));
  const h = 0.9;
  sprite.scale.set(h * (c.width / c.height), h, 1);
  sprite.renderOrder = 6;
  return sprite;
}
