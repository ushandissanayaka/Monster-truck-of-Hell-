// The sky dome: a burning sunset sky full of mixed red / orange / yellow / dark-ash clouds, ringed on
// a wall of huge jagged mountains (dark maroon rock mottled with bright red molten patches) standing
// in the lava sea far below.
// It is painted procedurally on the GPU once at load (baked into a texture: az x elevation), so it is
// sharp, costs nothing per frame and never moves. The dome follows the camera like a skybox.
// The paint shader is kept light (texture-lookup noise, each heavy step run once) so that it compiles
// quickly on Windows / D3D drivers and never stalls the GPU.

import * as THREE from 'three';

const EL0 = -0.45;   // lowest elevation stored in the baked texture (radians); below that it repeats

// 256x256 random texture for the noise: R is a random lattice, G is R shifted by (37, 17), so one
// bilinear lookup gives two neighbouring z layers of 3D value noise.
let noiseTex = null;
export function noiseTexture() {
  if (noiseTex) return noiseTex;
  const N = 256, data = new Uint8Array(N * N * 4);
  let seed = 1234567;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 24);
  for (let i = 0; i < N * N; i++) data[i * 4] = rand();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const j = (((y + 17) & 255) * N + ((x + 37) & 255)) * 4;
      data[(y * N + x) * 4 + 1] = data[j];
      data[(y * N + x) * 4 + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  noiseTex = t;
  return t;
}

export const NOISE = /* glsl */`
  uniform sampler2D noiseTex;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    vec2 uv = i.xy + vec2(37.0, 17.0) * i.z + f.xy;
    vec2 rg = texture2D(noiseTex, (uv + 0.5) / 256.0).xy;
    return mix(rg.x, rg.y, f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return v;
  }
  // sharp crests -> pointed, jagged peaks
  float ridged(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { float n = 1.0 - abs(noise(p) * 2.0 - 1.0); v += a * n * n; p = p * 2.1 + vec3(5.1, 1.3, 7.7); a *= 0.5; }
    return v;
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
`;

// d = view direction, az / el its azimuth and elevation; c = (cos az, sin az) keeps the noise seamless
const PAINT = /* glsl */`
  const float TAU = 6.2831853;

  // ridge line (elevation of the mountain top, radians) of a mountain layer around the horizon
  float ridgeLine(vec2 c, float seed, float lo, float hi, float sun) {
    float broad = fbm(vec3(c * 1.6, seed));
    float peaks = ridged(vec3(c * 6.5, seed + 3.0));
    float h = mix(lo, hi, smoothstep(0.3, 0.7, broad)) * (0.4 + 0.95 * peaks);
    return h * (1.0 - 0.45 * sun * sun);   // lower towards the sunset, so it shows between the peaks
  }

  vec3 skyGradient(float el, float sun) {
    float e = max(el, 0.0);
    vec3 col = mix(lin(vec3(1.0, 0.74, 0.30)), lin(vec3(0.90, 0.40, 0.11)), smoothstep(0.0, 0.12, e));
    col = mix(col, lin(vec3(0.52, 0.11, 0.06)), smoothstep(0.08, 0.4, e));
    col = mix(col, lin(vec3(0.18, 0.04, 0.035)), smoothstep(0.35, 1.0, e));
    // the sunset burns brightest low in the north; the rest of the sky is redder and darker
    col = mix(col, lin(vec3(1.0, 0.86, 0.45)), sun * sun * exp(-e / 0.16) * 0.85);
    col *= mix(0.6, 1.0, 0.25 + 0.75 * sun);
    return col;
  }

  vec3 skyColor(vec3 d, float el, float sun) {
    float e = max(el, 0.0);
    vec3 col = skyGradient(el, sun);
    // clouds on a plane above: dense dark-ash banks, red billows, orange / yellow sunlit wisps
    vec2 p = d.xz / (e + 0.14) * 1.1;
    vec3 q = vec3(p * vec2(0.55, 1.0), 0.0);
    vec3 w = vec3(fbm(q + vec3(2.1, 0.0, 4.0)), fbm(q + vec3(7.3, 3.1, 1.0)), 0.0);
    float shape = fbm(q * 1.2 + w * 1.8);
    float density = smoothstep(0.34, 0.66, shape) * (0.55 + 0.45 * smoothstep(0.0, 0.08, e));
    float tone = fbm(q * 2.3 + w + vec3(11.0, 5.0, 2.0));
    float heat = fbm(q * 1.7 - w + vec3(4.0, 13.0, 7.0));
    vec3 ash = mix(lin(vec3(0.09, 0.07, 0.065)), lin(vec3(0.34, 0.29, 0.27)), smoothstep(0.35, 0.72, tone));
    vec3 cloud = mix(ash, lin(vec3(0.55, 0.11, 0.06)), smoothstep(0.45, 0.68, heat) * 0.8);
    float lit = smoothstep(0.42, 0.75, tone + 0.25 * sun) * (1.0 - smoothstep(0.15, 0.9, e)) * (0.45 + 0.55 * sun);
    cloud = mix(cloud, lin(vec3(0.93, 0.44, 0.12)), lit);
    cloud = mix(cloud, lin(vec3(1.0, 0.78, 0.32)), lit * smoothstep(0.55, 0.85, tone) * (0.3 + 0.7 * sun));
    // thin bright edges where the sun catches a bank
    cloud += lin(vec3(1.0, 0.55, 0.2)) * smoothstep(0.38, 0.46, shape) * (1.0 - smoothstep(0.46, 0.56, shape)) * 0.35 * (0.3 + sun);
    return mix(col, cloud, density * 0.92);
  }

  // face: lighting of the rock face (1 = flat)
  vec3 rockColor(vec2 c, float el, float face) {
    vec3 q = vec3(c * 34.0, el * 34.0);
    vec3 col = mix(lin(vec3(0.10, 0.015, 0.015)), lin(vec3(0.27, 0.045, 0.04)), smoothstep(0.2, 0.8, fbm(q * 0.35)));
    col *= face;
    // mottled molten patches, bright red with hotter hearts
    vec3 wq = q * 0.3 + vec3(fbm(q * 0.3), fbm(q * 0.3 + 5.0), 0.0) * 1.6;
    float m = fbm(wq);
    float blot = smoothstep(0.55, 0.59, m);
    col = mix(col, lin(vec3(0.80, 0.07, 0.04)) * (0.7 + 0.35 * face), blot * 0.9);
    col = mix(col, lin(vec3(0.98, 0.17, 0.06)), smoothstep(0.66, 0.74, m) * 0.6);
    return col;
  }

  // relief: shade a bumpy height field -> lit and shadowed rock faces
  float rockFace(vec2 c, float el) {
    vec3 q = vec3(c * 17.0, el * 17.0);
    float h0 = ridged(q);
    float hx = ridged(q + vec3(-c.y, c.x, 0.0) * 0.04);
    float hy = ridged(q + vec3(0.0, 0.0, 0.04));
    vec3 n = normalize(vec3((h0 - hx) * 14.0, (h0 - hy) * 14.0, 1.0));
    return clamp(0.5 + dot(n, normalize(vec3(-0.6, 0.5, 0.6))), 0.2, 1.5);
  }

  vec3 paint(float az, float el) {
    vec3 d = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
    vec2 c = vec2(cos(az), sin(az));
    float sun = max(0.0, -c.y);   // 1 looking north (-z), behind the course
    vec3 col = skyColor(d, el, sun);

    // near range: the towering wall, broken by a few deep gaps; far range: lower, hazed by the
    // sunset air. The rock is painted once, for whichever range is in front.
    float gaps = mix(0.3, 1.0, smoothstep(0.2, 0.42, fbm(vec3(c * 2.6, 40.0))));
    float near = ridgeLine(c, 0.0, 0.3, 1.05, sun) * gaps;
    float far = ridgeLine(c, 11.0, 0.10, 0.42, sun);
    bool isNear = el < near;
    if (isNear || el < far) {
      float s = isNear ? 1.0 : 1.3;
      vec3 rock = rockColor(c * s, el * s, isNear ? rockFace(c, el) : 0.95);
      if (isNear) {
        col = rock;
        // a faint hot rim along the crest
        col = mix(col, lin(vec3(0.95, 0.35, 0.12)), smoothstep(near - 0.012, near, el) * 0.45 * (0.3 + sun));
      } else {
        col = mix(rock * 0.85, skyGradient(max(el, 0.02), sun), 0.38);
      }
    }
    // below the horizon the mountain wall carries on down (so from the middle of the stage you see
    // rock, not lava, past its edge) and glows hotter towards its feet, reaching the fogged lava
    // plane's colour where the lava meets it
    col = mix(col, lin(vec3(0.69, 0.19, 0.10)), smoothstep(-0.04, -0.22, el) * 0.85);
    return col;
  }
`;

function bake(renderer, quality) {
  const sizes = { Low: [2048, 512], Medium: [4096, 1024], High: [6144, 1536], Ultra: [8192, 2048] };
  const max = renderer.capabilities.maxTextureSize;
  let [W, H] = sizes[quality] || sizes.High;
  if (W > max) { H = Math.round((H * max) / W); W = max; }

  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
  rt.texture.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.ShaderMaterial({
    uniforms: { el0: { value: EL0 }, noiseTex: { value: noiseTexture() } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float el0;
      varying vec2 vUv;
      ${NOISE}
      ${PAINT}
      void main() {
        float az = (vUv.x - 0.5) * TAU;
        float el = el0 + vUv.y * (1.5707963 - el0);
        gl_FragColor = vec4(paint(az, el), 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // in vertical strips, so no single draw call runs long enough to upset a slow GPU
  const prev = renderer.getRenderTarget();
  rt.scissorTest = true;
  const strips = 8;
  for (let i = 0; i < strips; i++) {
    const x0 = Math.floor((W * i) / strips), x1 = Math.floor((W * (i + 1)) / strips);
    rt.scissor.set(x0, 0, x1 - x0, H);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
  }
  rt.scissorTest = false;
  renderer.setRenderTarget(prev);
  quad.geometry.dispose();
  mat.dispose();
  return rt.texture;
}

export function createSkyDome(renderer, quality = 'High', radius = 4000) {
  const map = bake(renderer, quality);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, el0: { value: EL0 } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        uniform float el0;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float az = atan(d.z, d.x);
          float el = asin(clamp(d.y, -1.0, 1.0));
          vec2 uv = vec2(az / 6.2831853 + 0.5, clamp((el - el0) / (1.5707963 - el0), 0.0, 1.0));
          gl_FragColor = texture2D(map, uv);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}
