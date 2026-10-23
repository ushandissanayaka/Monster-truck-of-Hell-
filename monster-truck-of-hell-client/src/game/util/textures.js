// Procedural textures: Roblox studs, sand, red/white curbs, hex pads, glows and the lava shader.
// (The sky and its mountains are in sky.js.)

import * as THREE from 'three';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Seeded random so the sky and the rocks look the same every visit.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One Roblox stud per tile: grey plastic with the little raised square outlet (light top-left edge,
// dark bottom-right edge), 4x4 studs per texture. UVs are world units / WORLD.stud.
export function studTexture(base = '#a3a2a5') {
  return cached(`stud|${base}`, () => {
    const N = 4, S = 64;
    const [c, g] = canvas(N * S, N * S);
    g.fillStyle = base;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = i * S, y = j * S;
        const a = S * 0.28, b = S * 0.72;
        g.lineWidth = S * 0.07;
        g.strokeStyle = 'rgba(255,255,255,0.32)';
        g.beginPath(); g.moveTo(x + a, y + b); g.lineTo(x + a, y + a); g.lineTo(x + b, y + a); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.26)';
        g.beginPath(); g.moveTo(x + b, y + a); g.lineTo(x + b, y + b); g.lineTo(x + a, y + b); g.stroke();
        // faint seam between studs
        g.fillStyle = 'rgba(0,0,0,0.035)';
        g.fillRect(x, y, S, 1.5);
        g.fillRect(x, y, 1.5, S);
      }
    }
    const t = tex(c);
    t.repeat.set(1 / N, 1 / N);
    return t;
  });
}

// pale yellow sand with soft darker blotches (the ramps)
export function sandTexture() {
  return cached('sand', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#e9e29a';
    g.fillRect(0, 0, 256, 256);
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = r() * 256, y = r() * 256, rr = 4 + r() * 9;
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
        g.fillStyle = `rgba(196,182,104,${0.35 + r() * 0.2})`;
        g.beginPath();
        g.ellipse(x + ox, y + oy, rr, rr * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    return tex(c);
  });
}

// red / white curb blocks along the length (u = length)
export function curbTexture() {
  return cached('curb', () => {
    const [c, g] = canvas(128, 16);
    g.fillStyle = '#e4232b';
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = '#f7f7f7';
    g.fillRect(64, 0, 64, 16);
    return tex(c);
  });
}

export function checkerTexture(n = 8) {
  return cached(`checker|${n}`, () => {
    const [c, g] = canvas(n * 16, 32);
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      g.fillRect(i * 16, j * 16, 16, 16);
    }
    const t = tex(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

// soft round glow for sprites
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return cached(`glow|${inner}|${outer}`, () => {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return tex(c, { repeat: false });
  });
}

// vertical fade for the light beams over the buff pads (opaque at the bottom)
export function beamTexture() {
  return cached('beam', () => {
    const [c, g] = canvas(4, 128);
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
    return tex(c, { repeat: false });
  });
}

// tyre tread for the side of the giant tyres (u around, v across)
export function treadTexture() {
  return cached('tread', () => {
    const [c, g] = canvas(512, 128);
    g.fillStyle = '#2b2b2e';
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 16; i++) {
      const x = i * 32;
      g.fillStyle = '#1a1a1c';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 30, 60); g.lineTo(x + 12, 60); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x + 12, 68); g.lineTo(x + 30, 68); g.lineTo(x + 18, 128); g.lineTo(x, 128); g.closePath(); g.fill();
    }
    return tex(c);
  });
}

// ---------------------------------------------------------------- lava
// Bright red molten surface with a network of lighter orange-yellow veins (like caustics), as in the
// reference. Frozen: the pattern never moves. Unlit (it glows) and fogged towards the horizon.
export function lavaMaterial() {
  return cached('lava', () => new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      varying vec2 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vW;
      #include <fog_pars_fragment>
      vec2 h2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }
      // distance to the nearest cell edge (voronoi) -> thin bright veins
      float cells(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p);
        float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 o = h2(i + g);
          o = 0.5 + 0.45 * sin(t + 6.2831 * o);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
        }
        return d2 - d1;
      }
      void main() {
        vec2 p = vW / 44.0;
        vec2 warp = vec2(sin(p.y * 1.3), cos(p.x * 1.1)) * 0.35;
        float a = cells(p + warp, 0.0);
        float b = cells(p * 2.1 - warp, 2.0);
        float vein = 1.0 - smoothstep(0.0, 0.08, a);
        float vein2 = 1.0 - smoothstep(0.0, 0.05, b);
        float core = 1.0 - smoothstep(0.0, 0.025, a);
        // colours picked in sRGB (the reference), converted to linear for the renderer
        vec3 deep = pow(vec3(0.66, 0.06, 0.05), vec3(2.2));
        vec3 red = pow(vec3(0.92, 0.12, 0.06), vec3(2.2));
        vec3 hot = pow(vec3(1.0, 0.42, 0.16), vec3(2.2));
        vec3 gold = pow(vec3(1.0, 0.85, 0.35), vec3(2.2));
        float blot = smoothstep(0.1, 0.6, a);
        vec3 col = mix(red, deep, blot * 0.6);
        col = mix(col, hot, clamp(vein * 0.8 + vein2 * 0.45, 0.0, 1.0));
        col = mix(col, gold, core * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }));
}
