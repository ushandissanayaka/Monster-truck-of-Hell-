// Roblox-style outlined text drawn into canvases, used for 3D labels, signs and leaderboards.

import * as THREE from 'three';

export const FONT_TITLE = '"Luckiest Guy", "Fredoka", sans-serif';
export const FONT_UI = '"Fredoka", "Nunito", sans-serif';
export const FONT_LABEL = '"Bangers", "Luckiest Guy", sans-serif';

export async function loadFonts() {
  if (!document.fonts?.load) return;
  await Promise.allSettled([
    document.fonts.load(`64px ${FONT_TITLE}`),
    document.fonts.load(`700 64px ${FONT_UI}`),
    document.fonts.load(`600 64px ${FONT_UI}`),
    document.fonts.load(`64px ${FONT_LABEL}`),
  ]);
}

// fill: css color | array of colors (per-letter rainbow) | { gradient: [[stop, color], ...] }
export function drawOutlinedText(ctx, text, x, y, opts = {}) {
  const {
    size = 64, font = FONT_UI, weight = 700, fill = '#fff', stroke = '#111',
    strokeWidth = size * 0.14, align = 'center', baseline = 'middle', letterSpacing = 0,
    shadow = null, skewX = 0,
  } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + letterSpacing);
  const total = widths.reduce((a, b) => a + b, 0) - letterSpacing;
  let start = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;

  if (skewX) {
    ctx.translate(x, y);
    ctx.transform(1, 0, skewX, 1, 0, 0);
    ctx.translate(-x, -y);
  }

  const perLetter = Array.isArray(fill) || letterSpacing !== 0;
  let fillStyle = fill;
  if (fill && fill.gradient) {
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    for (const [s, c] of fill.gradient) g.addColorStop(s, c);
    fillStyle = g;
  }

  const pass = (fn) => {
    if (!perLetter) return fn(text, start, 0);
    let cx = start;
    chars.forEach((c, i) => { fn(c, cx, i); cx += widths[i]; });
  };

  if (shadow) {
    ctx.fillStyle = shadow.color;
    pass((t, px) => ctx.fillText(t, px + (shadow.x || 0), y + (shadow.y || 0)));
    if (stroke) {
      ctx.strokeStyle = shadow.color;
      ctx.lineWidth = strokeWidth * 2;
      pass((t, px) => ctx.strokeText(t, px + (shadow.x || 0), y + (shadow.y || 0)));
    }
  }
  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth * 2;
    pass((t, px) => ctx.strokeText(t, px, y));
  }
  pass((t, px, i) => {
    ctx.fillStyle = Array.isArray(fill) ? fill[i % fill.length] : fillStyle;
    ctx.fillText(t, px, y);
  });
  ctx.restore();
  return total;
}

export function measure(text, size, font = FONT_UI, weight = 700) {
  const c = measure.ctx || (measure.ctx = document.createElement('canvas').getContext('2d'));
  c.font = `${weight} ${size}px ${font}`;
  return c.measureText(text).width;
}

export function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// Multi-line text -> canvas sized to fit. lines: [{ text, size, fill, stroke, font, weight }]
export function textCanvas(lines, { padding = 24, lineGap = 0.08, stroke = '#111' } = {}) {
  const items = lines.map((l) => ({ stroke, font: FONT_UI, weight: 700, ...l }));
  let width = 0;
  let height = padding * 2;
  for (const l of items) {
    l.w = measure(l.text, l.size, l.font, l.weight) + (l.letterSpacing || 0) * l.text.length + l.size * 0.4;
    width = Math.max(width, l.w);
    height += l.size * (1 + lineGap) + (l.strokeWidth ?? l.size * 0.14);
  }
  width += padding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');
  let y = padding;
  for (const l of items) {
    const sw = l.strokeWidth ?? l.size * 0.14;
    y += (l.size * (1 + lineGap) + sw) / 2;
    drawOutlinedText(ctx, l.text, canvas.width / 2, y, l);
    y += (l.size * (1 + lineGap) + sw) / 2;
  }
  return canvas;
}

// A camera-facing label (Roblox BillboardGui). worldHeight = height in world units.
export function makeBillboard(lines, worldHeight, opts = {}) {
  const canvas = textCanvas(lines, opts);
  const mat = new THREE.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false, depthTest: opts.depthTest ?? true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(worldHeight * (canvas.width / canvas.height), worldHeight, 1);
  sprite.renderOrder = opts.renderOrder ?? 5;
  return sprite;
}

// A flat label that does not face the camera (SurfaceGui).
export function makeTextPlane(lines, worldHeight, opts = {}) {
  const canvas = textCanvas(lines, opts);
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false, side: opts.side ?? THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldHeight * (canvas.width / canvas.height), worldHeight), mat);
  mesh.renderOrder = 4;
  return mesh;
}

export const RAINBOW = ['#ff2a2a', '#ff8c1a', '#ffe11a', '#4cd137', '#19d3ff', '#2f6bff', '#b33dff'];
