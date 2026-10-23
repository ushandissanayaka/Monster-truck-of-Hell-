// Cartoon icons painted into a canvas: used by the 3D badges over the buff pads and the wheel, and
// (as cached data URLs) by the HUD, so both look the same. Every icon fills a size x size box.

const urls = new Map();

function poly(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function star(g, cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  poly(g, pts);
}

function outline(g, w = 0.05, color = '#1b1b2b') {
  g.lineJoin = 'round';
  g.lineWidth = w;
  g.strokeStyle = color;
  g.stroke();
}

const ICONS = {
  // green banknote stack
  cash(g) {
    for (let i = 2; i >= 0; i--) {
      g.save();
      g.translate(0.5 + i * 0.03, 0.55 - i * 0.09);
      g.rotate(-0.28 + i * 0.05);
      poly(g, [[-0.4, -0.16], [0.4, -0.16], [0.4, 0.16], [-0.4, 0.16]]);
      g.fillStyle = i === 0 ? '#7ae05a' : '#55c23c';
      g.fill();
      outline(g, 0.035, '#1f5a14');
      g.fillStyle = '#2f8a22';
      g.beginPath(); g.ellipse(0, 0, 0.1, 0.1, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-0.36, -0.13, 0.72, 0.05);
      g.restore();
    }
    g.fillStyle = '#c9f5b0';
    g.fillRect(0.26, 0.47, 0.1, 0.18);
  },
  // gold star (XP)
  star(g) {
    star(g, 0.5, 0.53, 0.46, 0.21);
    const gr = g.createLinearGradient(0, 0, 0, 1);
    gr.addColorStop(0, '#fff07a'); gr.addColorStop(1, '#f2a81a');
    g.fillStyle = gr;
    g.fill();
    outline(g, 0.06, '#7a4b00');
    star(g, 0.5, 0.5, 0.22, 0.1);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fill();
  },
  // purple potion flask with pink liquid (top-left counter)
  potion(g) {
    g.beginPath();
    g.arc(0.5, 0.62, 0.3, 0, Math.PI * 2);
    const gr = g.createRadialGradient(0.42, 0.55, 0.02, 0.5, 0.62, 0.32);
    gr.addColorStop(0, '#ff9cff'); gr.addColorStop(0.6, '#d03cf0'); gr.addColorStop(1, '#7a12b8');
    g.fillStyle = gr;
    g.fill();
    outline(g, 0.04, '#3a0a5a');
    g.fillStyle = '#c050ff';
    g.fillRect(0.41, 0.17, 0.18, 0.2);
    g.fillStyle = '#ffd36a';
    g.fillRect(0.38, 0.12, 0.24, 0.08);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.ellipse(0.39, 0.52, 0.07, 0.12, 0.5, 0, Math.PI * 2); g.fill();
  },
  // pink NOS bottle in a hex badge (Nitro)
  nitro(g) {
    g.save();
    g.translate(0.5, 0.5);
    g.rotate(-0.55);
    poly(g, [[-0.36, -0.13], [0.24, -0.13], [0.32, -0.07], [0.42, -0.07], [0.42, 0.07], [0.32, 0.07], [0.24, 0.13], [-0.36, 0.13]]);
    const gr = g.createLinearGradient(0, -0.13, 0, 0.13);
    gr.addColorStop(0, '#ff8af0'); gr.addColorStop(1, '#b01cc0');
    g.fillStyle = gr;
    g.fill();
    outline(g, 0.04, '#3a0a4a');
    g.fillStyle = '#fff';
    g.font = 'bold 0.12px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NOS', -0.06, 0.01);
    g.restore();
  },
  // blue party-hat gift (More Hats)
  hats(g) {
    poly(g, [[0.2, 0.42], [0.8, 0.42], [0.76, 0.86], [0.24, 0.86]]);
    g.fillStyle = '#2f9bff'; g.fill(); outline(g, 0.04);
    poly(g, [[0.16, 0.32], [0.84, 0.32], [0.84, 0.44], [0.16, 0.44]]);
    g.fillStyle = '#5ad6ff'; g.fill(); outline(g, 0.04);
    g.fillStyle = '#ffd21a';
    g.fillRect(0.45, 0.32, 0.1, 0.54);
    g.beginPath(); g.ellipse(0.4, 0.26, 0.1, 0.07, 0.4, 0, Math.PI * 2); g.ellipse(0.6, 0.26, 0.1, 0.07, -0.4, 0, Math.PI * 2); g.fill();
  },
  // red shopping basket on the yellow Shop tile
  shop(g) {
    g.lineWidth = 0.07; g.strokeStyle = '#b8b8c4'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0.3, 0.42); g.lineTo(0.46, 0.12); g.lineTo(0.72, 0.2); g.stroke();
    poly(g, [[0.08, 0.42], [0.92, 0.42], [0.8, 0.86], [0.2, 0.86]]);
    const gr = g.createLinearGradient(0, 0.42, 0, 0.86);
    gr.addColorStop(0, '#ff4a4a'); gr.addColorStop(1, '#c4141e');
    g.fillStyle = gr; g.fill(); outline(g, 0.045, '#5a0008');
    g.strokeStyle = 'rgba(90,0,8,0.6)'; g.lineWidth = 0.03;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0.08 + i * 0.21, 0.48); g.lineTo(0.14 + i * 0.18, 0.82); g.stroke(); }
    g.fillStyle = '#ff7a7a';
    g.fillRect(0.08, 0.42, 0.84, 0.06);
  },
  // purple flame (Powers)
  flame(g) {
    g.beginPath();
    g.moveTo(0.5, 0.92);
    g.bezierCurveTo(0.1, 0.92, 0.08, 0.55, 0.28, 0.38);
    g.bezierCurveTo(0.3, 0.52, 0.36, 0.56, 0.4, 0.56);
    g.bezierCurveTo(0.34, 0.36, 0.44, 0.18, 0.56, 0.06);
    g.bezierCurveTo(0.58, 0.3, 0.7, 0.36, 0.72, 0.5);
    g.bezierCurveTo(0.76, 0.44, 0.78, 0.38, 0.8, 0.34);
    g.bezierCurveTo(0.96, 0.56, 0.92, 0.92, 0.5, 0.92);
    const gr = g.createLinearGradient(0, 0.1, 0, 0.92);
    gr.addColorStop(0, '#f08aff'); gr.addColorStop(0.6, '#c02cf0'); gr.addColorStop(1, '#8a10d8');
    g.fillStyle = gr; g.fill();
    g.beginPath();
    g.moveTo(0.5, 0.88);
    g.bezierCurveTo(0.3, 0.88, 0.3, 0.66, 0.42, 0.56);
    g.bezierCurveTo(0.46, 0.66, 0.54, 0.62, 0.56, 0.5);
    g.bezierCurveTo(0.68, 0.62, 0.72, 0.88, 0.5, 0.88);
    g.fillStyle = '#ffc0ff'; g.fill();
  },
  // rainbow ball (Spin!)
  ball(g) {
    const cols = ['#ff3a3a', '#ff9a1a', '#ffe11a', '#4cd137', '#19d3ff', '#2f6bff', '#b33dff', '#ff4ab0'];
    cols.forEach((c, i) => {
      g.beginPath(); g.moveTo(0.5, 0.5);
      g.arc(0.5, 0.5, 0.42, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
      g.closePath(); g.fillStyle = c; g.fill();
    });
    g.beginPath(); g.arc(0.5, 0.5, 0.42, 0, Math.PI * 2); outline(g, 0.04, '#2a2a40');
    const gr = g.createRadialGradient(0.4, 0.38, 0.02, 0.5, 0.5, 0.42);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.beginPath(); g.arc(0.5, 0.5, 0.42, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
  },
  // yellow up arrow (jump)
  jump(g) {
    poly(g, [[0.5, 0.06], [0.92, 0.5], [0.68, 0.5], [0.68, 0.94], [0.32, 0.94], [0.32, 0.5], [0.08, 0.5]]);
    const gr = g.createLinearGradient(0, 0, 0, 1);
    gr.addColorStop(0, '#fff07a'); gr.addColorStop(1, '#f2b81a');
    g.fillStyle = gr; g.fill(); outline(g, 0.04, '#6a4a00');
  },
  // blue/yellow propeller beanie (Play for 10 mins)
  propeller(g) {
    g.beginPath(); g.moveTo(0.1, 0.72); g.bezierCurveTo(0.12, 0.3, 0.88, 0.3, 0.9, 0.72); g.closePath();
    g.fillStyle = '#ffe11a'; g.fill();
    g.beginPath(); g.moveTo(0.1, 0.72); g.bezierCurveTo(0.12, 0.3, 0.5, 0.32, 0.5, 0.36); g.lineTo(0.42, 0.72); g.closePath();
    g.fillStyle = '#2f8bff'; g.fill();
    g.beginPath(); g.moveTo(0.5, 0.36); g.bezierCurveTo(0.7, 0.34, 0.88, 0.5, 0.9, 0.72); g.lineTo(0.72, 0.72); g.closePath();
    g.fillStyle = '#4cd1ff'; g.fill();
    poly(g, [[0.04, 0.7], [0.98, 0.7], [0.92, 0.8], [0.0, 0.8]]); g.fillStyle = '#1f5fd6'; g.fill();
    g.fillStyle = '#8a8a8a'; g.fillRect(0.48, 0.2, 0.04, 0.16);
    poly(g, [[0.5, 0.2], [0.82, 0.12], [0.82, 0.2]]); g.fillStyle = '#2f8bff'; g.fill();
    poly(g, [[0.5, 0.2], [0.18, 0.12], [0.18, 0.2]]); g.fillStyle = '#ffe11a'; g.fill();
  },
  gear(g) {
    star(g, 0.5, 0.5, 0.44, 0.34, 8, 0);
    g.fillStyle = '#e8e8ee'; g.fill(); outline(g, 0.04, '#3a3a44');
    g.beginPath(); g.arc(0.5, 0.5, 0.16, 0, Math.PI * 2); g.fillStyle = '#4a4a54'; g.fill();
  },
  // two little people with yellow chevrons (boost)
  friends(g) {
    g.fillStyle = '#ffd21a';
    poly(g, [[0.55, 0.05], [0.95, 0.05], [0.95, 0.3], [0.75, 0.2], [0.55, 0.3]]); g.fill(); outline(g, 0.03, '#6a4a00');
    poly(g, [[0.55, 0.32], [0.95, 0.32], [0.95, 0.55], [0.75, 0.45], [0.55, 0.55]]); g.fill(); outline(g, 0.03, '#6a4a00');
    g.fillStyle = '#2f9bff';
    g.beginPath(); g.arc(0.32, 0.4, 0.16, 0, Math.PI * 2); g.fill(); outline(g, 0.03, '#0a3a6a');
    g.beginPath(); g.ellipse(0.32, 0.85, 0.28, 0.2, 0, Math.PI, 0); g.fill(); outline(g, 0.03, '#0a3a6a');
    g.fillStyle = '#1b1b2b'; g.fillRect(0.2, 0.36, 0.24, 0.06);
  },
  // checkered finish flag
  flag(g) {
    g.fillStyle = '#ddd'; g.fillRect(0.12, 0.08, 0.06, 0.86);
    g.save();
    g.beginPath(); g.moveTo(0.18, 0.1); g.bezierCurveTo(0.4, 0.0, 0.6, 0.2, 0.9, 0.1); g.lineTo(0.9, 0.55); g.bezierCurveTo(0.6, 0.65, 0.4, 0.45, 0.18, 0.55); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.clip();
    g.fillStyle = '#111';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2) g.fillRect(0.18 + i * 0.12, 0.0 + j * 0.12, 0.12, 0.12);
    g.restore();
  },
  bolt(g) {
    poly(g, [[0.58, 0.04], [0.2, 0.56], [0.46, 0.56], [0.38, 0.96], [0.8, 0.4], [0.54, 0.4]]);
    g.fillStyle = '#ffe11a'; g.fill(); outline(g, 0.04, '#6a4a00');
  },
  truck(g) {
    g.fillStyle = '#1f5bd6';
    poly(g, [[0.12, 0.38], [0.36, 0.38], [0.44, 0.22], [0.66, 0.22], [0.7, 0.38], [0.9, 0.4], [0.9, 0.56], [0.1, 0.56]]); g.fill(); outline(g, 0.03);
    for (const x of [0.27, 0.73]) {
      g.beginPath(); g.arc(x, 0.68, 0.17, 0, Math.PI * 2); g.fillStyle = '#222'; g.fill();
      g.beginPath(); g.arc(x, 0.68, 0.07, 0, Math.PI * 2); g.fillStyle = '#ddd'; g.fill();
    }
  },
  glove(g) {
    g.beginPath(); g.ellipse(0.52, 0.42, 0.3, 0.28, -0.3, 0, Math.PI * 2);
    g.fillStyle = '#e8262e'; g.fill(); outline(g, 0.04, '#5a0008');
    g.fillStyle = '#fff'; g.fillRect(0.28, 0.66, 0.36, 0.2);
  },
};

// paint icon `name` into ctx at (x, y) with size s
export function drawIcon(ctx, name, x, y, s) {
  const f = ICONS[name];
  if (!f) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  f(ctx);
  ctx.restore();
}

export function iconUrl(name, size = 128) {
  const key = `${name}|${size}`;
  if (!urls.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    drawIcon(c.getContext('2d'), name, 0, 0, size);
    urls.set(key, c.toDataURL('image/png'));
  }
  return urls.get(key);
}

// Octagon coin badge with a coloured rim and an icon (the floating badges over the buff pads).
export function drawBadge(ctx, cx, cy, r, color, icon) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  poly(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  const inner = pts.map(([x, y]) => [cx + (x - cx) * 0.8, cy + (y - cy) * 0.8]);
  poly(ctx, inner);
  const gr = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, color);
  ctx.fillStyle = gr;
  ctx.fill();
  drawIcon(ctx, icon, cx - r * 0.62, cy - r * 0.62, r * 1.24);
  // sparkles
  ctx.fillStyle = '#fff';
  for (const [dx, dy, s] of [[-0.5, -0.45, 0.09], [0.55, -0.2, 0.07], [0.3, 0.55, 0.06]]) {
    star(ctx, cx + dx * r, cy + dy * r, r * s, r * s * 0.35, 4, 0);
    ctx.fill();
  }
}
