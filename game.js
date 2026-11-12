/* =====================================================================
   CAMEL QUEST — 3D endless runner (Three.js)
   Chase camera, three lanes, low-poly gallop-cycle camel, obstacle
   patterns, shawarma pickups, and a portal into the Interactive Resume.
   ===================================================================== */
(function () {
'use strict';

/* ------------------------------ CONFIG ------------------------------ */
const CFG = {
  RESUME_URL: 'https://koulmesahil.github.io/InteractiveResumeGame/',
  HOME_URL: 'https://koulmesahil.github.io/',
  SHAWARMA_GOAL: 10,        // shawarmas needed to open the portal
  LANE_W: 2.6,
  BASE_SPEED: 17,           // units / second at start
  MAX_SPEED: 38,
  SPAWN_Z: 230,             // how far ahead things appear (hidden in fog)
  SEG_LEN: 48,
  SEG_COUNT: 8,
  GRAVITY: 42,
  JUMP_V: 14.5,
  STAGE_LEN: 650,           // metres of track per time-of-day stage
  navigate(url) { window.location.href = url; }
};

/* ------------------------------ HELPERS ----------------------------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

/* ------------------------------ AUDIO ------------------------------- */
const Sfx = {
  ctx: null, master: null, muted: store.get('cq.muted', '0') === '1', noiseBuf: null,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        try {
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : 0.9;
          this.master.connect(this.ctx.destination);
          const n = this.ctx.sampleRate;
          this.noiseBuf = this.ctx.createBuffer(1, n, n);
          const d = this.noiseBuf.getChannelData(0);
          for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { this.ctx = null; }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) { this.muted = m; store.set('cq.muted', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.9; },
  tone(f, d, type, v, to, delay) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v || 0.1, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + d + 0.03);
  },
  noise(d, v, fc, delay) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (delay || 0);
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc || 1000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
  },
  jump() { this.tone(300, 0.2, 'triangle', 0.12, 720); },
  slide() { this.noise(0.3, 0.12, 1800); },
  lane() { this.noise(0.09, 0.05, 2500); },
  step() { this.noise(0.06, 0.035, 420); },
  coin() { this.tone(880, 0.09, 'square', 0.06); this.tone(1320, 0.18, 'square', 0.06, null, 0.07); },
  hit() { this.noise(0.28, 0.35, 380); this.tone(120, 0.3, 'sawtooth', 0.18, 45); },
  portalOpen() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.09, null, i * 0.09)); },
  portalGo() { this.tone(200, 1.2, 'sawtooth', 0.12, 1600); this.noise(1.2, 0.15, 3000); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.1, null, i * 0.16)); }
};
// A tiny phrygian-dominant loop so the run has a pulse
const SCALE = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33];
const LEAD = [0, 2, 3, 4, 3, 2, 1, 2, 4, 5, 4, 3, 2, 3, 1, 0];
let mStep = 0;
setInterval(() => {
  if (G.state !== 'playing' && G.state !== 'portal') return;
  const i = mStep % 16;
  if (i % 2 === 0) Sfx.tone(SCALE[LEAD[i]], 0.22, 'triangle', 0.045);
  if (i % 4 === 0) Sfx.tone(SCALE[0] / 2, 0.4, 'sine', 0.06);
  if (i % 8 === 4) Sfx.noise(0.05, 0.04, 3200);
  mStep++;
}, 150);

/* ------------------------------ STATE ------------------------------- */
const G = {
  state: 'menu',            // menu | playing | paused | dying | over | portal
  time: 0, ts: 1, tsTarget: 1,
  distance: 0, speed: 0, speedMul: 1,
  health: 100, shaw: 0, best: parseInt(store.get('cq.best', '0'), 10) || 0,
  lane: 0, camelX: 0, y: 0, vy: 0, grounded: true, slideT: 0, invuln: 0, buf: null,
  phase: 0, run: 0, lean: 0, yaw: 0, hurt: 0, squash: 0, lastStep: 0,
  airBlend: 0, slideBlend: 0, deadBlend: 0, deadT: 0,
  rowZ: -999, nextGap: 24, rowCount: 0,
  spawning: true, portalOpen: false, portal: null, portalT: 0,
  shake: 0, stage: -1, hints: {}, prevState: 'menu', blink: 0
};
const items = [];           // obstacles + pickups currently in the world

/* ------------------------------ RENDERER ---------------------------- */
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = '<p style="padding:40px;font:20px sans-serif;color:#5c3a22">Camel Quest needs WebGL, which this browser has turned off.</p>';
  throw e;
}
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3e1b6, 70, 250);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xd6ecff, 0xe6c58a, 0.62);
const sunLight = new THREE.DirectionalLight(0xfff0d2, 0.85);
sunLight.position.set(-60, 30, 25);
scene.add(hemi, sunLight);

/* ------------------------- MATERIAL / GEOMETRY ---------------------- */
const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0, flatShading: true }, o || {}));
const VC_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
const ico0 = new THREE.IcosahedronGeometry(1, 0);
const ico1 = new THREE.IcosahedronGeometry(1, 1);
const cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 6);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function put(parent, geo, m, x, y, z, sx, sy, sz) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x || 0, y || 0, z || 0);
  o.scale.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz);
  parent.add(o);
  return o;
}

// Flatten a hierarchy of coloured meshes into ONE vertex-coloured mesh (1 draw call)
function bake(group) {
  group.updateMatrixWorld(true);
  const pos = [], col = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const p = g.attributes.position.array, c = o.material.color;
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); col.push(c.r, c.g, c.b); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, VC_MAT);
}

// Alpha-only gradient textures built from raw bytes (no canvas, so no premultiply rounding noise = no coloured speckles)
function alphaTexture(w, h, fn, rgb) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2];
    d[o + 3] = Math.round(255 * clamp(fn(x / (w - 1), y / (h - 1)), 0, 1));
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
function radialTexture(stops, rgb) {   // stops: [[t, alpha], ...] from centre (0) to edge (1)
  return alphaTexture(128, 128, (u, v) => {
    const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    for (let k = 1; k < stops.length; k++) if (r <= stops[k][0]) { const a = stops[k - 1], b = stops[k]; return lerp(a[1], b[1], (r - a[0]) / (b[0] - a[0] || 1)); }
    return 0;
  }, rgb);
}
const softTex = radialTexture([[0, 1], [0.4, 0.55], [1, 0]], [255, 255, 255]);
const shadowTex = radialTexture([[0, 0.55], [0.6, 0.25], [1, 0]], [0, 0, 0]);
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
function makeShadow(w, l) { const s = new THREE.Mesh(shadowGeo, shadowMat); s.scale.set(w, 1, l); s.position.y = 0.06; s.renderOrder = 2; return s; }

/* ------------------------------ SKY / BACKDROP ---------------------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(620, 20, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4fb0ee) }, hor: { value: new THREE.Color(0xf7e8c6) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); gl_FragColor = vec4(mix(hor, top, pow(h,0.5)), 1.0); }'
  })
);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xfff2b8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
orb.scale.set(90, 90, 1); orb.material.opacity = 0.38; orb.position.set(-140, 60, -440);
scene.add(orb);

// Dubai skyline from your background art, mirrored-tiled across the horizon
const backdropMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { map: { value: null }, tint: { value: new THREE.Color(1, 1, 1) }, scroll: { value: 0 }, tiles: { value: 6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: [
    'uniform sampler2D map; uniform vec3 tint; uniform float scroll; uniform float tiles; varying vec2 vUv;',
    'void main(){',
    '  float u = vUv.x * tiles + scroll; float m = mod(u, 2.0); if (m > 1.0) m = 2.0 - m;',
    '  float v = 0.47 + vUv.y * 0.53;',
    '  vec4 c = texture2D(map, vec2(m, v));',
    '  float a = smoothstep(1.0, 0.78, vUv.y) * smoothstep(0.0, 0.06, vUv.y);',
    '  gl_FragColor = vec4(c.rgb * tint, a);',
    '}'
  ].join('\n')
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1140, 100), backdropMat);
backdrop.position.set(0, -4, -380); backdrop.renderOrder = -5; backdrop.visible = false;
scene.add(backdrop);

// A haze band so the far end of the track melts into the skyline
const hazeTex = alphaTexture(4, 128, (u, v) => v, [255, 255, 255]);

const hazeMat = new THREE.MeshBasicMaterial({ map: hazeTex, color: 0xf3e1b6, transparent: true, depthWrite: false, fog: false });
const haze = new THREE.Mesh(new THREE.PlaneGeometry(1500, 70), hazeMat);
haze.position.set(0, 26, -372); haze.renderOrder = -4;
scene.add(haze);
// same skyline behind the camel for the title-screen orbit
const backdropRear = backdrop.clone(); backdropRear.position.set(0, -4, 380); backdropRear.rotation.y = Math.PI; backdropRear.visible = false;
const hazeRear = haze.clone(); hazeRear.position.set(0, 26, 372); hazeRear.rotation.y = Math.PI;
scene.add(backdropRear, hazeRear);

// Low-poly clouds drifting across the sky
const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const cloudGeo = (() => {
  const g = new THREE.Group(), top = mat(0xffffff), low = mat(0xdce9f6);
  [[0, 0, 0, 15, 5, 7], [-12, -1, 1, 10, 4, 5.5], [11, -1.2, 0, 11, 4, 5.5], [2, 3, 0, 10, 4.5, 5.5]].forEach((c) => {
    put(g, ico1, low, c[0], c[1] - 1.2, c[2], c[3], c[4] * 0.8, c[5]);
    put(g, ico1, top, c[0], c[1] + 0.8, c[2], c[3] * 0.92, c[4] * 0.8, c[5] * 0.9);
  });
  return bake(g).geometry;
})();
const clouds = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(cloudGeo, cloudMat);
  const back = i >= 12;
  m.position.set(rand(-460, 460), rand(40, 95), back ? rand(220, 400) : rand(-420, -170));
  m.scale.setScalar(rand(0.8, 2.0)); m.renderOrder = -6;
  scene.add(m); clouds.push(m);
}
function updateClouds(dt) { for (const c of clouds) { c.position.x += dt * 2.2; if (c.position.x > 480) c.position.x = -480; } }

// Generated portal: wobbly layered rings, swirling blobs and glowing veins (no speckles, no white ovals)
const portalTex = (() => {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), m = S / 2, R = mulberry32(7);
  const wob = (r, amp, seed, n) => { const pts = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; pts.push([t, r * (1 + amp * (Math.sin(t * 3 + seed) * 0.5 + Math.sin(t * 5 + seed * 2.1) * 0.35 + Math.sin(t * 9 + seed * 0.7) * 0.15))]); } return pts; };
  const blob = (pts, rot) => { x.beginPath(); pts.forEach(([t, r], i) => { const px = m + Math.cos(t + rot) * r, py = m + Math.sin(t + rot) * r; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); };
  const layers = [ // radius, fill, wobble
    [490, '#b9d96a', 0.04], [462, '#8cc455', 0.05], [425, '#5fb558', 0.05], [385, '#9ccf62', 0.06], [340, '#3fa458', 0.07],
    [290, '#7cc45e', 0.08], [235, '#1f9552', 0.09], [180, '#46ad5a', 0.1], [130, '#0f7d48', 0.12]
  ];
  layers.forEach(([r, col, w], i) => {
    blob(wob(r, w, i * 1.7, 90), i * 0.5); x.fillStyle = col; x.fill();
    x.lineWidth = 5; x.strokeStyle = 'rgba(10,80,40,.35)'; x.stroke();
  });
  // swirling blob arms in the middle
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (let k = 0; k < 5; k++) for (const [col, w] of [['#0c6a3c', 46], ['#8fd67c', 22]]) {
    x.strokeStyle = col; x.lineWidth = w; x.globalAlpha = 0.85; x.beginPath();
    for (let i = 0; i <= 70; i++) {
      const t = i / 70, rr = 18 + t * 215, ang = k * Math.PI * 2 / 5 + t * 5.4 + Math.sin(t * 9 + k) * 0.18;
      const px = m + Math.cos(ang) * rr, py = m + Math.sin(ang) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  }
  // glowing veins between the rings
  x.globalAlpha = 0.75; x.lineWidth = 4; x.strokeStyle = '#e2f27a';
  for (let k = 0; k < 26; k++) {
    let ang = R() * 6.28, rr = 150 + R() * 300; x.beginPath(); x.moveTo(m + Math.cos(ang) * rr, m + Math.sin(ang) * rr);
    for (let i = 0; i < 7; i++) { ang += (R() - 0.35) * 0.22; rr += (R() - 0.5) * 34; x.lineTo(m + Math.cos(ang) * rr, m + Math.sin(ang) * rr); }
    x.stroke();
  }
  x.globalAlpha = 1;
  const core = x.createRadialGradient(m, m, 0, m, m, 120);
  core.addColorStop(0, '#d9ffb8'); core.addColorStop(0.35, '#7fe3a0'); core.addColorStop(1, '#0f7d48');
  x.fillStyle = core; x.beginPath(); x.arc(m, m, 120, 0, 6.2832); x.fill();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
})();
const loader = new THREE.TextureLoader();
let pendingTex = 1;
function texDone() { if (--pendingTex <= 0) $('loading').classList.add('done'); }
loader.load('assets/images/background.png', (t) => {
  backdropMat.uniforms.map.value = t; backdrop.visible = true; backdropRear.visible = true; texDone();
}, undefined, texDone);
setTimeout(() => $('loading').classList.add('done'), 3500);

/* ------------------------------ PALETTES ---------------------------- */
const PAL = [
  { name: 'Morning in Dubai', top: 0x4fb0ee, hor: 0xf7e8c6, fog: 0xf3e1b6, hs: 0xd6ecff, hg: 0xe6c58a, hi: 0.62, sun: 0xfff0d2, si: 0.88, tint: 0xffffff, orb: 0xfff2b8 },
  { name: 'Golden Hour', top: 0x7a8fd6, hor: 0xffc684, fog: 0xf2b87c, hs: 0xffd9b0, hg: 0xd9a060, hi: 0.48, sun: 0xffb86e, si: 0.95, tint: 0xffd2a0, orb: 0xffa65a },
  { name: 'Desert Dusk', top: 0x3d3b92, hor: 0xf08f9a, fog: 0xc98aa8, hs: 0xb9a2e6, hg: 0xa87888, hi: 0.46, sun: 0xff9d8a, si: 0.85, tint: 0xc9a8d6, orb: 0xff7f7f }
].map((p) => {
  const o = { name: p.name, hi: p.hi, si: p.si };
  ['top', 'hor', 'fog', 'hs', 'hg', 'sun', 'tint', 'orb'].forEach((k) => { o[k] = new THREE.Color(p[k]); });
  return o;
});
const _c = new THREE.Color();
function applyStage() {
  const len = CFG.STAGE_LEN;
  const idx = Math.floor(G.distance / len) % PAL.length;
  const blend = smooth(0.72, 1, (G.distance % len) / len);
  const a = PAL[idx], b = PAL[(idx + 1) % PAL.length];
  const mix = (k, target) => target.copy(a[k]).lerp(b[k], blend);
  mix('top', sky.material.uniforms.top.value);
  mix('hor', sky.material.uniforms.hor.value);
  mix('fog', scene.fog.color);
  mix('fog', hazeMat.color);
  mix('hs', hemi.color); mix('hg', hemi.groundColor); mix('sun', sunLight.color);
  mix('tint', backdropMat.uniforms.tint.value);
  mix('orb', orb.material.color); mix('tint', cloudMat.color);
  hemi.intensity = lerp(a.hi, b.hi, blend); sunLight.intensity = lerp(a.si, b.si, blend);
  if (idx !== G.stage && G.state === 'playing') {
    if (G.stage !== -1) toast(a.name, 2200);
  }
  G.stage = idx;
}

/* ------------------------------ TERRAIN ----------------------------- */
function terrainH(x, a) {
  const ax = Math.abs(x);
  const edge = smooth(6.5, 17, ax);
  if (edge <= 0) return 0;
  const d = Math.sin(a * 0.045 + x * 0.07) + Math.sin(a * 0.02 - x * 0.11 + 2.0) * 1.5 + Math.sin(a * 0.11 + x * 0.05) * 0.4;
  return edge * (d + 3.2) * 1.15;
}

const trackTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#c28b4f'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(120,70,30,.10)' : 'rgba(255,230,180,.10)';
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  x.fillStyle = 'rgba(110,60,25,.35)'; x.fillRect(0, 0, 14, 256); x.fillRect(242, 0, 14, 256);
  x.fillStyle = 'rgba(255,238,200,.35)';
  for (const px of [93, 163]) for (let y = 0; y < 256; y += 64) x.fillRect(px - 2, y, 4, 34);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, CFG.SEG_LEN / 16);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
})();
const trackMat = new THREE.MeshStandardMaterial({ map: trackTex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const trackGeo = new THREE.PlaneGeometry(9.6, CFG.SEG_LEN).rotateX(-Math.PI / 2);
const curbGeo = box(0.45, 0.28, CFG.SEG_LEN);
const curbMat = mat(0xa8703c);
const sandC1 = new THREE.Color(0xcf9f5c), sandC2 = new THREE.Color(0xe2bc7e);

/* ---------------------------- PROP PROTOTYPES ----------------------- */
function makeCactus(variant) {
  const g = new THREE.Group();
  const green = mat(0x3f9b4a), dark = mat(0x2f7d3c), pink = mat(0xff6fa8), spike = mat(0xf5e6a8);
  put(g, cyl(0.42, 0.5, 2.0, 7), green, 0, 1.0, 0);
  put(g, ico1, green, 0, 2.0, 0, 0.42, 0.42, 0.42);
  put(g, cyl(0.2, 0.2, 0.62, 6), dark, -0.62, 1.05, 0).rotation.z = Math.PI / 2;
  put(g, cyl(0.2, 0.22, 0.78, 6), dark, -0.9, 1.4, 0);
  put(g, ico1, dark, -0.9, 1.8, 0, 0.2, 0.2, 0.2);
  if (variant === 0) {
    put(g, cyl(0.18, 0.18, 0.5, 6), dark, 0.58, 1.45, 0).rotation.z = Math.PI / 2;
    put(g, cyl(0.18, 0.2, 0.6, 6), dark, 0.8, 1.75, 0);
    put(g, ico1, dark, 0.8, 2.07, 0, 0.18, 0.18, 0.18);
  }
  put(g, ico0, pink, 0, 2.45, 0, 0.17, 0.12, 0.17);
  for (let i = 0; i < 8; i++) { const a = i * 0.8; put(g, ico0, spike, Math.cos(a) * 0.43, 0.5 + (i % 4) * 0.4, Math.sin(a) * 0.43, 0.05, 0.05, 0.05); }
  return bake(g);
}
function makeRock(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + hash3(Math.round(x * 50) + seed, Math.round(y * 50), Math.round(z * 50)) * 0.45;
    p.setXYZ(i, x * k, y * k * 0.78, z * k);
  }
  geo.computeVertexNormals();
  const grp = new THREE.Group();
  const shade = [0xb58a5a, 0xa87a4c, 0xc29a6a][seed % 3];
  put(grp, geo, mat(shade), 0, 0.55, 0, 1.0, 1.0, 1.0);
  return bake(grp);
}
function makePalm(seed) {
  const g = new THREE.Group();
  const trunk = mat(0x9a6b3d), leaf = mat(0x2f9e4f), leaf2 = mat(0x44b862), coco = mat(0x5a3a1f);
  let x = 0, y = 0;
  const lean = (seed % 2 ? 1 : -1) * (0.07 + (seed % 3) * 0.03);
  for (let i = 0; i < 5; i++) {
    const a = lean * (i + 1);
    const seg = put(g, cyl(0.2 - i * 0.015, 0.26 - i * 0.015, 1.4, 6), trunk, x + Math.sin(-a) * 0.7, y + Math.cos(a) * 0.7, 0);
    seg.rotation.z = a;
    x += Math.sin(-a) * 1.4; y += Math.cos(a) * 1.4;
  }
  const frond = new THREE.ConeGeometry(0.34, 3.4, 4).translate(0, 1.7, 0).rotateX(Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    const pv = new THREE.Group(); pv.position.set(x, y, 0);
    pv.rotation.y = (i / 9) * Math.PI * 2; pv.rotation.x = 0.35 + (i % 3) * 0.18;
    g.add(pv); put(pv, frond, i % 2 ? leaf : leaf2, 0, 0, 0, 1, 0.3, 1);
  }
  for (let i = 0; i < 3; i++) put(g, ico0, coco, x + Math.cos(i * 2.1) * 0.3, y - 0.2, Math.sin(i * 2.1) * 0.3, 0.16, 0.16, 0.16);
  return bake(g);
}
/* ---- Skyline + town buildings (flat-shaded, one draw call each) ---- */
const CM = {};
const cmat = (h) => CM[h] || (CM[h] = mat(h));
const bx = (g, w, h, d, x, y, z, c, ry) => { const m = put(g, box(w, h, d), cmat(c), x, y, z); if (ry) m.rotation.y = ry; return m; };
function banded(g, w, d, h, x, z, glass, mull, band) {
  const n = Math.floor(h / band);
  for (let i = 0; i < n; i++) {
    bx(g, w, band * 0.8, d, x, i * band + band * 0.4, z, glass);
    bx(g, w + 0.35, band * 0.2, d + 0.35, x, i * band + band * 0.9, z, mull);
  }
  return n * band;
}
function makeNeedle() {            // Burj Khalifa: three-wing Y plan, spiralling setbacks, long spire
  const g = new THREE.Group(), LV = 11, LH = 11, ends = [7, 8, 9];
  for (let i = 0; i < LV; i++) {
    const y = i * LH, col = i % 2 ? 0xb9cddb : 0xd9e5ee;
    put(g, cyl(5.2 - i * 0.34, 5.7 - i * 0.34, LH, 6), cmat(col), 0, y + LH / 2, 0);
    for (let k = 0; k < 3; k++) {
      if (i >= ends[k]) continue;
      const th = k * Math.PI * 2 / 3 + 0.35, e = 9 - i * 0.85, dist = 2.8 + e / 2;
      bx(g, e, LH * 0.99, 4.6 - i * 0.22, Math.cos(th) * dist, y + LH / 2, Math.sin(th) * dist, i % 2 ? 0xa9c0d1 : 0xcddce8, -th);
    }
  }
  put(g, cyl(2.0, 2.6, 8, 6), cmat(0xe6edf2), 0, LV * LH + 4, 0);
  put(g, cyl(0.15, 1.0, 34, 6), cmat(0xeef2f5), 0, LV * LH + 24, 0);
  return bake(g).geometry;
}
function makeTwist() {             // spiralling glass tower
  const g = new THREE.Group(), n = 16;
  for (let i = 0; i < n; i++) { const w = 13 - 3.6 * (i / n); bx(g, w, 4.3, w * 0.82, 0, i * 4 + 2.1, 0, i % 2 ? 0x8fb9d4 : 0xb6d2e4, i * 0.12); }
  put(g, new THREE.ConeGeometry(4.4, 9, 4), cmat(0xdfeaf2), 0, n * 4 + 4.5, 0).rotation.y = n * 0.12;
  return bake(g).geometry;
}
function makeGlass(kind) {
  const g = new THREE.Group();
  if (kind === 0) {                // blue banded glass, stepped crown
    const h = banded(g, 13, 13, 54, 0, 0, 0x7fa9c8, 0xe4edf3, 3);
    bx(g, 9, 6, 9, 0, h + 3, 0, 0xcfdde8); bx(g, 5, 6, 5, 0, h + 9, 0, 0xe4edf3); put(g, cyl(0.12, 0.35, 14, 5), cmat(0xf2f5f7), 0, h + 19, 0);
  } else if (kind === 1) {         // dark glass, slanted roof
    const h = banded(g, 11, 15, 46, 0, 0, 0x587c99, 0xaec3d3, 3);
    put(g, box(11.4, 5, 15.4), cmat(0x7e9db4), 0, h + 1.2, 0).rotation.z = 0.3;
  } else {                         // sandstone tower to match the desert
    const h = banded(g, 14, 12, 38, 0, 0, 0xe0c28a, 0xf6e8c8, 3.2);
    bx(g, 10, 4, 8, 0, h + 2, 0, 0xf6e8c8); bx(g, 1.6, 8, 1.6, 0, h + 8, 0, 0xd9b36a);
    put(g, ico0, cmat(0xe3b441), 0, h + 13, 0, 1.2, 1.2, 1.2);
  }
  return bake(g).geometry;
}
function makeTwin() {              // pair of triangular-section towers
  const g = new THREE.Group();
  [[-9, 60], [9, 48]].forEach((t) => {
    put(g, new THREE.CylinderGeometry(6, 6, t[1], 3), cmat(0xa9bccb), t[0], t[1] / 2, 0);
    put(g, new THREE.ConeGeometry(6, 13, 3), cmat(0xdce6ee), t[0], t[1] + 6.5, 0);
  });
  bx(g, 32, 6, 15, 0, 3, 0, 0xd8c9a8);
  return bake(g).geometry;
}
function makeSail() {              // Burj Al Arab: sail-shaped hotel on its own island
  const g = new THREE.Group(), n = 16, H = 50;
  put(g, cyl(22, 22, 5, 24), cmat(0x3bb8c8), 0, -1.8, 0);                 // sea
  put(g, cyl(13, 15, 3.2, 16), cmat(0xe9d3a0), 0, -0.4, 0);               // island
  bx(g, 4, 0.5, 22, 0, 1.0, 17, 0xe9d3a0);                                 // causeway to shore
  put(g, new THREE.CylinderGeometry(3.4, 3.8, H + 6, 3), cmat(0xece7da), 0, 1.2 + (H + 6) / 2, -9).rotation.y = Math.PI;  // spine
  for (let i = 0; i < n; i++) {                                            // the billowing sail
    const t = i / (n - 1), h = H * Math.sqrt(Math.max(0.04, 1 - t * t * 0.9));
    bx(g, 11 * (1 - 0.18 * t), h, 1.5, 0, 1.2 + h / 2, -8 + i * 1.3, i % 3 === 0 ? 0xcfeaee : 0xfdfcf6);
  }
  put(g, cyl(4.5, 4.5, 0.5, 14), cmat(0xf4f4f4), 0, 1.2 + H * 0.72, -13.5);   // helipad
  bx(g, 1.2, 1.2, 5, 0, 1.2 + H * 0.72 - 0.8, -11.5, 0xd8d3c6);
  put(g, cyl(0.3, 0.8, 14, 6), cmat(0xffffff), 0, 1.2 + H + 13, -9);
  return bake(g).geometry;
}
function makeFrame() {             // giant gold picture frame
  const g = new THREE.Group(), gold = 0xdcae45;
  bx(g, 6, 52, 6, -17, 26, 0, gold); bx(g, 6, 52, 6, 17, 26, 0, gold); bx(g, 40, 6, 6, 0, 52, 0, gold);
  bx(g, 36, 1.2, 9, 0, 55.4, 0, 0xf1d27a); bx(g, 38, 1.4, 8, 0, 0.5, 0, 0xc9a24a);
  return bake(g).geometry;
}
function makeMosque() {
  const g = new THREE.Group(), w = 0xf3ecdd, sand = 0xe3cf9f, teal = 0x28a69c, gold = 0xe3b441;
  bx(g, 24, 11, 19, 0, 3.5, 0, w); bx(g, 17, 5, 14, 0, 11.5, 0, sand);
  put(g, ico1, cmat(teal), 0, 14.2, 0, 8, 6.8, 8);
  put(g, cyl(0.6, 1.2, 4, 6), cmat(w), 0, 20.6, 0); put(g, ico0, cmat(gold), 0, 23.2, 0, 0.9, 0.9, 0.9);
  for (const sx of [-14, 14]) {
    put(g, cyl(1.1, 1.5, 27, 8), cmat(w), sx, 12, 6); put(g, cyl(2.1, 2.1, 0.6, 8), cmat(sand), sx, 21.5, 6);
    put(g, new THREE.ConeGeometry(1.6, 5.5, 8), cmat(teal), sx, 28.9, 6); put(g, ico0, cmat(gold), sx, 32.1, 6, 0.6, 0.6, 0.6);
  }
  bx(g, 5, 7, 0.6, 0, 2.5, 9.7, 0x31485a);
  return bake(g).geometry;
}
function makeTown() {              // sandstone old-town with wind towers
  const g = new THREE.Group(), walls = [0xe2c48c, 0xd9b67a, 0xeed6a6];
  [[-12, -7, 9, 8, 9], [-1, -9, 8, 11, 8], [10, -6, 9, 7, 9], [-8, 7, 8, 9, 8], [4, 8, 10, 6, 9], [14, 6, 7, 10, 7]].forEach((b, i) => {
    const c = walls[i % 3], h = b[3];
    bx(g, b[2], h + 3, b[4], b[0], (h - 3) / 2, b[1], c);
    bx(g, b[2] + 0.5, 0.7, b[4] + 0.5, b[0], h + 0.35, b[1], 0xcdb284);
    bx(g, 1.3, 1.9, 0.3, b[0] - 1.6, h * 0.5, b[1] + b[4] / 2 + 0.1, 0x3b4a55);
    bx(g, 1.3, 1.9, 0.3, b[0] + 1.6, h * 0.5, b[1] + b[4] / 2 + 0.1, 0x3b4a55);
    if (i % 2 === 0) { bx(g, 2.2, 5, 2.2, b[0], h + 3, b[1], c); bx(g, 1.3, 2.2, 2.3, b[0], h + 4.4, b[1], 0x3b4a55); bx(g, 2.8, 0.5, 2.8, b[0], h + 5.7, b[1], 0xcdb284); }
  });
  return bake(g).geometry;
}
function makeLog() {
  const g = new THREE.Group();
  const wood = mat(0x8a5a2e), woodD = mat(0x6e4524), rope = mat(0xe8d6a0), stand = mat(0x5a3a1f);
  put(g, cyl(0.4, 0.4, 7.8, 8), wood, 0, 0.62, 0).rotation.z = Math.PI / 2;
  for (const x of [-3.9, 3.9]) put(g, ico0, woodD, x, 0.62, 0, 0.4, 0.4, 0.4);
  for (const x of [-2.4, 0, 2.4]) put(g, cyl(0.43, 0.43, 0.14, 8), rope, x, 0.62, 0).rotation.z = Math.PI / 2;
  for (const x of [-2.9, 2.9]) { put(g, box(0.3, 0.5, 0.9), stand, x, 0.25, 0); }
  return bake(g);
}
function makeArch() {
  const g = new THREE.Group();
  const stone = mat(0xd9b97e), stoneD = mat(0xb8955a), gold = mat(0xf5b82e, { emissive: 0x4a3200 }), cloth = mat(0xb42a1f);
  for (const x of [-4.45, 4.45]) {
    put(g, box(1.1, 4.2, 1.1), stone, x, 2.1, 0);
    put(g, box(1.4, 0.35, 1.4), stoneD, x, 0.18, 0);
    put(g, box(1.4, 0.3, 1.4), gold, x, 4.3, 0);
  }
  put(g, box(10.2, 1.0, 1.1), stone, 0, 2.15, 0);       // beam spans y 1.65 – 2.65
  put(g, box(10.4, 0.18, 1.3), gold, 0, 2.7, 0);
  put(g, box(8.6, 0.55, 0.12), cloth, 0, 2.15, 0.62);    // hanging banner
  return bake(g);
}
function makeShawarma() {   // rolled wrap: tan tortilla, red-striped paper sleeve, meat + lettuce showing at the top
  const g = new THREE.Group();
  put(g, cyl(0.38, 0.22, 0.9, 12), cmat(0xe9bf73), 0, 0.05, 0);            // tortilla cone
  put(g, cyl(0.385, 0.37, 0.05, 12), cmat(0xc98f45), 0, 0.3, 0);           // toasted band
  put(g, cyl(0.30, 0.22, 0.52, 12), cmat(0xfffdf6), 0, -0.2, 0);           // paper sleeve
  put(g, cyl(0.285, 0.26, 0.1, 12), cmat(0xd94a3a), 0, -0.1, 0);           // red stripe
  put(g, cyl(0.285, 0.26, 0.1, 12), cmat(0xd94a3a), 0, -0.34, 0);          // red stripe
  put(g, cyl(0.37, 0.38, 0.1, 12), cmat(0x8a4a24), 0, 0.53, 0);            // meat filling
  put(g, ico1, cmat(0x9a5528), 0.05, 0.64, 0, 0.3, 0.17, 0.3);             // meat dome
  put(g, new THREE.TorusGeometry(0.32, 0.1, 6, 12), cmat(0x6cc04a), 0, 0.58, 0).rotation.x = Math.PI / 2;   // lettuce frill
  g.rotation.z = 0.45; g.rotation.x = 0.15;
  return bake(g);
}
const PROTO = {
  cactus: [makeCactus(0), makeCactus(1)],
  rock: [makeRock(0), makeRock(1), makeRock(2)],
  palm: [makePalm(1), makePalm(2), makePalm(3), makePalm(4)],
  log: makeLog(), arch: makeArch(), shawarma: makeShawarma()
};
// Which buildings appear where. face = turn toward the track.
const KH_GEO = makeNeedle(), AA_GEO = makeSail();
const FAR_POOL = [
  { geo: makeGlass(0), x0: 70, x1: 190, s0: 0.8, s1: 1.2, p: 0.85 },
  { geo: makeGlass(1), x0: 70, x1: 190, s0: 0.8, s1: 1.2, p: 0.85 },
  { geo: makeGlass(2), x0: 60, x1: 160, s0: 0.9, s1: 1.3, p: 0.85 },
  { geo: makeTwin(), x0: 90, x1: 180, s0: 0.8, s1: 1.1, p: 0.5 },
  { geo: makeTwist(), x0: 90, x1: 190, s0: 0.9, s1: 1.2, p: 0.5 },
  { geo: makeFrame(), x0: 85, x1: 140, s0: 0.85, s1: 1.0, p: 0.35, face: true },
  { geo: KH_GEO, x0: 115, x1: 185, s0: 0.55, s1: 0.68, p: 0.95 },
  { geo: KH_GEO, x0: 115, x1: 185, s0: 0.55, s1: 0.68, p: 0.95 },
  { geo: AA_GEO, x0: 95, x1: 150, s0: 0.85, s1: 1.0, p: 0.9, faceX: true },
  { geo: AA_GEO, x0: 95, x1: 150, s0: 0.85, s1: 1.0, p: 0.9, faceX: true }
];
const NEAR_POOL = [   // mostly old-town houses; a mosque only now and then
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeTown(), x0: 32, x1: 46, s0: 0.95, s1: 1.25, p: 0.9, face: true },
  { geo: makeMosque(), x0: 62, x1: 90, s0: 0.85, s1: 1.05, p: 0.9, face: true }
];
const glowMat = new THREE.SpriteMaterial({ map: softTex, color: 0xffd35a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });

/* ------------------------------ TRACK SEGMENTS ---------------------- */
const segments = [];
const TX = 20, TZ = 8, TW = 140;
function buildSegment(i) {
  const g = new THREE.Group();
  const tGeo = new THREE.PlaneGeometry(TW, CFG.SEG_LEN, TX, TZ).rotateX(-Math.PI / 2);
  const baseX = Float32Array.from(tGeo.attributes.position.array.filter((_, k) => k % 3 === 0));
  const baseZ = Float32Array.from(tGeo.attributes.position.array.filter((_, k) => k % 3 === 2));
  tGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(baseX.length * 3), 3));
  const terrain = new THREE.Mesh(tGeo, VC_MAT);
  terrain.frustumCulled = false; terrain.position.y = -0.02;
  const track = new THREE.Mesh(trackGeo, trackMat); track.position.y = 0.03; track.frustumCulled = false;
  const curbL = new THREE.Mesh(curbGeo, curbMat); curbL.position.set(-4.95, 0.1, 0);
  const curbR = new THREE.Mesh(curbGeo, curbMat); curbR.position.set(4.95, 0.1, 0);
  g.add(terrain, track, curbL, curbR);
  const seg = { g, terrain, baseX, baseZ, a: 0, props: [] };
  const slot = (kind, n) => { for (let k = 0; k < n; k++) { const m = new THREE.Mesh(kind === 'far' ? FAR_POOL[0].geo : kind === 'near' ? NEAR_POOL[0].geo : PROTO[kind][0].geometry, VC_MAT); g.add(m); seg.props.push({ kind, m, k }); } };
  slot('palm', 2); slot('rock', 2); slot('cactus', 2); slot('far', 3); slot('near', 1);
  g.position.z = 68 - i * CFG.SEG_LEN;
  scene.add(g);
  return seg;
}
function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const MOSQUE_GEO = NEAR_POOL[NEAR_POOL.length - 1].geo, TOWN_GEO = NEAR_POOL[0].geo;
const HERO = [
  [ { kind: 'near', k: 0, geo: MOSQUE_GEO, x: 34, z: 66, s: 1.0, ry: -Math.PI / 2, sink: 1.6 },
    { kind: 'far', k: 0, geo: KH_GEO, x: 71, z: 83, s: 0.62, ry: 0.4, sink: 3 },
    { kind: 'far', k: 1, geo: AA_GEO, x: 26, z: 88.6, s: 0.9, ry: Math.PI, sink: 2 } ],
  [ { kind: 'near', k: 0, geo: TOWN_GEO, x: 36, z: 26, s: 1.15, ry: -Math.PI / 2, sink: 1.6 } ]
];
function layoutSegment(seg, initial) {
  // seg.a = absolute track coordinate of the segment centre. Scenery is seeded by it, so the world is the same every time.
  const pos = seg.terrain.geometry.attributes.position, col = seg.terrain.geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const x = seg.baseX[i], zl = seg.baseZ[i];
    const h = terrainH(x, seg.a - zl);
    pos.setY(i, h);
    const t = clamp(h / 9, 0, 1) * 0.85 + hash3(Math.round(x), Math.round(seg.a - zl), 3) * 0.15;
    _c.copy(sandC1).lerp(sandC2, t);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
  const R = mulberry32(((Math.round(seg.a) + 100000) * 2654435761) ^ 0x9e3779b9);
  const rr = (lo, hi) => lo + R() * (hi - lo), pk = (arr) => arr[Math.floor(R() * arr.length)];
  for (const p of seg.props) {
    const side = R() < 0.5 ? -1 : 1;
    let x, s = 1, show = true, zl = rr(-22, 22), sink = 0.05, face = false;
    if (p.kind === 'palm') { x = side * rr(9, 19); s = rr(0.9, 1.4); p.m.geometry = pk(PROTO.palm).geometry; }
    else if (p.kind === 'rock') { x = side * rr(7.2, 26); s = rr(0.7, 2.2); p.m.geometry = pk(PROTO.rock).geometry; }
    else if (p.kind === 'cactus') { x = side * rr(8, 20); s = rr(0.7, 1.2); p.m.geometry = pk(PROTO.cactus).geometry; }
    else {
      const d = pk(p.kind === 'far' ? FAR_POOL : NEAR_POOL);
      p.m.geometry = d.geo; x = side * rr(d.x0, d.x1); s = rr(d.s0, d.s1); show = R() < d.p; face = !!d.face; p.faceX = !!d.faceX;
      sink = p.kind === 'far' ? 3 : 1.6; zl = (p.kind === 'far' ? -16 + p.k * 16 : 0) + rr(-5, 5);
    }
    p.m.position.set(x, terrainH(x, seg.a - zl) - sink, zl);
    p.m.scale.setScalar(s);
    p.m.rotation.y = p.faceX ? (side < 0 ? 0 : Math.PI) : face ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : (p.kind === 'far' ? Math.floor(rr(0, 4)) * Math.PI / 2 + rr(-0.15, 0.15) : rr(0, 6.28));
    p.m.visible = show;
  }
  // The title screen looks back along the road: a hand-placed skyline, identical every time.
  if (initial && (seg.idx === 0 || seg.idx === 1)) {
    for (const p of seg.props) if (p.kind === 'near' || p.kind === 'far') p.m.visible = false;
    for (const h of (HERO[seg.idx] || [])) {
      const p = seg.props.find((q) => q.kind === h.kind && q.k === h.k);
      const zl = h.z - seg.g.position.z;
      p.m.geometry = h.geo; p.faceX = false;
      p.m.position.set(h.x, terrainH(h.x, seg.a - zl) - h.sink, zl);
      p.m.scale.setScalar(h.s); p.m.rotation.y = h.ry; p.m.visible = true;
    }
  }
}
for (let i = 0; i < CFG.SEG_COUNT; i++) { const s = buildSegment(i); s.idx = i; s.a = -s.g.position.z; layoutSegment(s, true); segments.push(s); }

/* ------------------------------ THE CAMEL --------------------------- */
function buildCamel() {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.8; root.add(body);   // pivot at torso centre
  const rig = new THREE.Group(); rig.position.y = -1.8; body.add(rig);
  const M = {
    fur: mat(0xd89d58), light: mat(0xeec88f), dark: mat(0xa96b34), red: mat(0xb42a1f), redD: mat(0x8e1f18),
    gold: mat(0xf5b82e, { emissive: 0x3a2800 }), brown: mat(0x4a3023), pad: mat(0x9c7048), padD: mat(0x6e4b2c),
    teal: mat(0x14b8a6), teal2: mat(0x0f9488), white: mat(0xffffff), black: mat(0x1b1210), pink: mat(0xe8908c)
  };
  const tuft = (parent, mt, x, y, z, h, r, rx, rz) => { const m = put(parent, cyl(0.001, r, h, 4), mt, x, y, z); m.rotation.x = rx || 0; m.rotation.z = rz || 0; return m; };

  // --- barrel, deep chest, powerful hindquarters, tucked belly
  put(rig, ico1, M.fur, 0, 2.08, 0.1, 0.68, 0.72, 1.3);
  put(rig, ico1, M.fur, 0, 2.02, -0.9, 0.62, 0.8, 0.72);       // chest
  put(rig, ico1, M.fur, 0, 2.12, 1.02, 0.66, 0.72, 0.72);      // rump
  put(rig, ico1, M.light, 0, 1.68, -0.1, 0.56, 0.4, 1.25);     // belly
  for (const sx of [-1, 1]) {
    put(rig, ico1, M.fur, sx * 0.5, 1.88, 1.08, 0.3, 0.55, 0.55);   // thigh
    put(rig, ico1, M.fur, sx * 0.44, 1.96, -0.95, 0.26, 0.48, 0.42); // shoulder
  }
  put(rig, ico1, M.light, 0, 1.55, -1.25, 0.34, 0.34, 0.4);    // chest pad
  // --- hump with fur tuft (jiggles when running)
  const hump = new THREE.Group(); hump.position.set(0, 2.5, 0.2); rig.add(hump);
  put(hump, ico1, M.fur, 0, 0.45, 0, 0.6, 0.78, 0.66);
  // --- saddle blanket draped over the back, gold hem, tassels
  put(rig, ico1, M.red, 0, 2.55, 0.2, 0.95, 0.3, 1.1);
  put(rig, ico1, M.redD, 0, 2.7, 0.2, 0.66, 0.22, 0.8);
  put(rig, new THREE.TorusGeometry(1, 0.04, 4, 18), M.gold, 0, 2.38, 0.2, 0.88, 1.05, 1).rotation.x = Math.PI / 2;
  put(rig, new THREE.TorusGeometry(0.5, 0.05, 5, 10), M.gold, 0, 2.62, 0.2, 1.1, 1.35, 1).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) for (const sz of [-0.7, 0.9]) {
    put(rig, ico0, M.gold, sx * 0.84, 2.36, 0.2 + sz * 0.9, 0.09, 0.09, 0.09);
    put(rig, cyl(0.07, 0.01, 0.34, 4), M.redD, sx * 0.84, 2.16, 0.2 + sz * 0.9);
  }
  // --- S-curved neck: rises forward, then lifts, then the head
  const neckLow = new THREE.Group(); neckLow.position.set(0, 2.2, -1.1); neckLow.rotation.x = -0.85; rig.add(neckLow);
  put(neckLow, cyl(0.3, 0.48, 1.0, 6), M.fur, 0, 0.5, 0);
  put(neckLow, ico1, M.light, 0, 0.45, -0.22, 0.2, 0.42, 0.2);
  for (let i = 0; i < 3; i++) tuft(neckLow, M.dark, 0, 0.2 + i * 0.3, 0.3, 0.45, 0.13, 0.7);
  const neckHigh = new THREE.Group(); neckHigh.position.set(0, 0.97, 0); neckHigh.rotation.x = 0.55; neckLow.add(neckHigh);
  put(neckHigh, ico1, M.fur, 0, 0, 0, 0.36, 0.36, 0.36);
  put(neckHigh, cyl(0.22, 0.32, 0.9, 6), M.fur, 0, 0.45, 0);
  for (let i = 0; i < 3; i++) tuft(neckHigh, M.dark, 0, 0.2 + i * 0.26, 0.24, 0.4, 0.11, 0.7);
  // --- head: brow, long snout, droopy lip, sleepy lids
  const head = new THREE.Group(); head.position.set(0, 0.95, 0); head.rotation.x = 0.3; neckHigh.add(head);
  put(head, ico1, M.fur, 0, 0.05, -0.1, 0.35, 0.35, 0.44);
  put(head, ico0, M.dark, 0, 0.22, -0.22, 0.3, 0.1, 0.22);
  put(head, ico1, M.light, 0, -0.08, -0.56, 0.28, 0.26, 0.44);
  put(head, ico0, M.light, 0, -0.2, -0.78, 0.27, 0.1, 0.2);
  put(head, ico1, M.light, 0, -0.3, -0.4, 0.2, 0.14, 0.3);
  put(head, ico0, M.dark, 0, 0.4, 0.02, 0.14, 0.15, 0.14);              // forelock
  for (const sx of [-1, 1]) {
    put(head, ico0, M.black, sx * 0.1, -0.03, -0.98, 0.045, 0.045, 0.045);
    put(head, ico0, M.white, sx * 0.32, 0.12, -0.25, 0.12, 0.12, 0.12);
    put(head, ico0, M.black, sx * 0.4, 0.12, -0.27, 0.07, 0.075, 0.07);
    put(head, ico0, M.fur, sx * 0.33, 0.22, -0.25, 0.14, 0.075, 0.14);  // eyelid
    const ear = put(head, cyl(0.001, 0.1, 0.32, 4), M.fur, sx * 0.21, 0.4, 0.1); ear.rotation.z = -sx * 0.4;
    put(head, cyl(0.001, 0.055, 0.22, 4), M.pink, sx * 0.21, 0.39, 0.12).rotation.z = -sx * 0.4;
    if (sx === 1) head.userData.earR = ear; else head.userData.earL = ear;
  }
  put(head, new THREE.TorusGeometry(0.27, 0.035, 5, 8), M.brown, 0, -0.08, -0.5, 1, 0.95, 1);
  put(head, ico0, M.gold, 0, -0.42, -0.5, 0.06, 0.06, 0.06);
  tuft(head, M.red, 0, -0.52, -0.5, 0.2, 0.05, 0, 0);
  // --- legs: thick, knobby knees, wide padded feet
  const legs = [];
  const mkLeg = (x, z, front, off) => {
    const hip = new THREE.Group(); hip.position.set(x, 1.82, z); rig.add(hip);
    put(hip, ico1, M.fur, 0, -0.1, 0, 0.3, 0.3, 0.3);
    put(hip, cyl(0.27, 0.18, 0.9, 6), M.fur, 0, -0.42, 0);
    const knee = new THREE.Group(); knee.position.y = -0.84; hip.add(knee);
    put(knee, ico1, M.dark, 0, 0, 0.02, 0.2, 0.2, 0.22);
    tuft(knee, M.dark, 0, 0, front ? -0.2 : 0.2, 0.22, 0.07, front ? -1.2 : 1.2);
    put(knee, cyl(0.16, 0.11, 0.8, 6), M.fur, 0, -0.42, 0);
    const foot = new THREE.Group(); foot.position.y = -0.8; knee.add(foot);
    put(foot, ico1, M.pad, 0, -0.04, -0.04, 0.22, 0.1, 0.3);
    put(foot, ico0, M.padD, 0, -0.1, -0.2, 0.15, 0.05, 0.14);
    legs.push({ hip, knee, foot, front, off });
  };
  mkLeg(-0.4, -0.9, true, 0); mkLeg(0.4, -0.9, true, 0.5);
  mkLeg(-0.4, 1.0, false, Math.PI * 0.92); mkLeg(0.4, 1.0, false, Math.PI * 0.92 + 0.5);
  // --- tail
  const tail = new THREE.Group(); tail.position.set(0, 2.35, 1.62); tail.rotation.x = 0.55; rig.add(tail);
  put(tail, cyl(0.07, 0.04, 0.8, 5), M.dark, 0, -0.4, 0);
  put(tail, ico0, M.brown, 0, -0.88, 0, 0.15, 0.24, 0.15);
  root.scale.setScalar(0.92);
  return { root, body, rig, neckLow, neckHigh, head, hump, tail, legs };
}
const camel = buildCamel();
scene.add(camel.root);
const camelShadow = makeShadow(2.2, 4.4); scene.add(camelShadow);

function poseCamel(dt) {
  const c = camel, t = G.time, ph = G.phase, run = G.run;
  G.airBlend = damp(G.airBlend, G.grounded ? 0 : 1, 18, dt);
  G.slideBlend = damp(G.slideBlend, G.slideT > 0 && G.grounded ? 1 : 0, 16, dt);
  G.deadBlend = damp(G.deadBlend, (G.state === 'dying' || G.state === 'over') ? 1 : 0, 6, dt);
  G.squash = damp(G.squash, 0, 9, dt);
  const air = G.airBlend, sl = G.slideBlend, dead = G.deadBlend, hurt = clamp(G.hurt, 0, 1);
  for (const L of c.legs) {
    const p = ph + L.off;
    let hip = Math.sin(p) * (L.front ? 0.88 : 0.74) * run;
    let knee = -Math.max(0, Math.cos(p)) * 1.3 * run - (L.front ? 0 : Math.max(0, Math.sin(p)) * 0.2 * run);
    hip = lerp(hip, L.front ? 0.85 : -0.7, air); knee = lerp(knee, L.front ? -0.6 : -1.0, air);
    hip = lerp(hip, L.front ? 0.5 : -0.4, sl); knee = lerp(knee, -1.3, sl);
    hip = lerp(hip, L.front ? 0.9 : -0.6, dead); knee = lerp(knee, -0.4, dead);
    L.hip.rotation.x = hip; L.knee.rotation.x = knee;
    L.foot.rotation.x = clamp(-(hip + knee) * (0.75 - 0.3 * air), -0.9, 0.9);   // keep the pads flat on the ground
  }
  const bob = Math.sin(ph * 2 + 0.4) * 0.09 * run + Math.sin(t * 1.6) * 0.02 * (1 - run);
  c.body.position.y = 1.8 + bob - 0.62 * sl - 0.75 * dead;
  c.body.rotation.x = Math.sin(ph + 0.5) * 0.05 * run + clamp(G.vy * 0.016, -0.3, 0.3) * air - 0.34 * sl - 0.1 * dead;
  c.body.rotation.z = G.lean + dead * 1.35 + Math.sin(t * 38) * 0.05 * hurt;
  c.body.rotation.y = G.yaw;
  // the neck and head lag behind the body, and the head stays steadier than the neck
  const lowD = Math.sin(ph + 1.0) * 0.09 * run - 0.4 * sl - 0.1 * air;
  const highD = Math.sin(ph + 1.7) * 0.13 * run + 0.45 * sl + Math.sin(t * 1.1) * 0.05 * (1 - run) - Math.sin(hurt * 9) * 0.35 * hurt;
  c.neckLow.rotation.x = -0.85 + lowD;
  c.neckHigh.rotation.x = 0.55 + highD;
  c.head.rotation.x = 0.3 - (lowD + highD) * 0.55 + Math.sin(ph + 2.2) * 0.05 * run + 0.15 * sl;
  c.head.rotation.y = Math.sin(t * 0.7) * 0.25 * (1 - run);
  c.head.userData.earL.rotation.x = Math.sin(t * 9 + 1) * 0.12 * run + (Math.sin(t * 0.9) > 0.97 ? 0.5 : 0);
  c.head.userData.earR.rotation.x = Math.sin(t * 9) * 0.12 * run;
  c.hump.rotation.x = Math.sin(ph * 2 + 1.2) * 0.06 * run;
  c.hump.rotation.z = -G.lean * 0.4;
  c.tail.rotation.x = 0.55 + Math.sin(ph + 0.8) * 0.25 * run + Math.sin(t * 2) * 0.08;
  c.tail.rotation.z = Math.sin(t * 3 + ph * 0.5) * 0.25;
  c.root.position.set(G.camelX, G.y, 0);
  const sq = G.squash;
  c.root.scale.set(0.92 * (1 + 0.07 * sq), 0.92 * (1 - 0.13 * sq), 0.92 * (1 + 0.07 * sq));
  camelShadow.position.set(G.camelX, 0.07, 0.2);
  const sh = 1 - clamp(G.y / 4, 0, 0.6);
  camelShadow.scale.set(2.3 * sh, 1, 4.6 * sh);
}

/* ------------------------------ PARTICLES --------------------------- */
const parts = [];
for (let i = 0; i < 70; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false; scene.add(s);
  parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 2, alpha: 0.6 });
}
let partI = 0;
function emit(x, y, z, color, n, spread, up, size, back) {
  for (let i = 0; i < n; i++) {
    const p = parts[partI++ % parts.length];
    p.s.visible = true; p.s.position.set(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2));
    p.s.material.color.setHex(color);
    p.life = p.max = rand(0.35, 0.8);
    p.vx = rand(-spread, spread); p.vy = rand(up * 0.4, up); p.vz = rand(-spread, spread) + (back || 0);
    p.s0 = size * rand(0.6, 1); p.s1 = size * rand(1.8, 2.8);
    p.alpha = 0.7;
  }
}
function updateParticles(dt, worldDz) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    const k = 1 - p.life / p.max;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt + worldDz;
    p.vy -= 3 * dt;
    p.s.scale.setScalar(lerp(p.s0, p.s1, k));
    p.s.material.opacity = p.alpha * (1 - k);
  }
}
// speed streaks
const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
const streaks = [];
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(box(0.05, 0.05, 1), streakMat);
  m.userData.len = rand(5, 12);
  m.scale.z = m.userData.len;
  m.position.set(rand(-1, 1) * 11, rand(0.6, 7), rand(-120, 10));
  if (Math.abs(m.position.x) < 4.5) m.position.x += Math.sign(m.position.x || 1) * 4.5;
  scene.add(m); streaks.push(m);
}
function updateStreaks(dt, speed) {
  const amt = smooth(22, 36, speed);
  streakMat.opacity = 0.32 * amt;
  for (const m of streaks) {
    m.position.z += speed * 1.5 * dt;
    if (m.position.z > 14) { m.position.z = -130 - rand(0, 20); m.position.x = rand(-1, 1) * 11; if (Math.abs(m.position.x) < 4.5) m.position.x += Math.sign(m.position.x || 1) * 4.5; m.position.y = rand(0.6, 7); }
  }
}

/* ------------------------------ ITEMS ------------------------------- */
const laneX = (l) => l * CFG.LANE_W;
function addItem(o) { scene.add(o.obj); items.push(o); return o; }

function spawnCactus(lane, z) {
  const m = PROTO.cactus[Math.random() < 0.5 ? 0 : 1].clone(); m.rotation.y = rand(0, 6.28); m.scale.setScalar(rand(1.0, 1.25));
  const g = new THREE.Group(); g.add(m); const sh = makeShadow(2.6, 2.2); g.add(sh);
  g.position.set(laneX(lane), 0, z);
  return addItem({ kind: 'obstacle', type: 'cactus', obj: g, x: laneX(lane), z, hw: 0.62, hd: 0.6, y0: 0, y1: 2.7, hit: false });
}
function spawnRock(lane, z) {
  const m = PROTO.rock[Math.floor(Math.random() * 3)].clone(); m.rotation.y = rand(0, 6.28); m.scale.set(rand(1.2, 1.5), rand(1.0, 1.25), rand(1.2, 1.5));
  const g = new THREE.Group(); g.add(m); g.add(makeShadow(3.4, 3)); g.position.set(laneX(lane), 0, z);
  return addItem({ kind: 'obstacle', type: 'rock', obj: g, x: laneX(lane), z, hw: 1.0, hd: 0.9, y0: 0, y1: 1.3, hit: false });
}
function spawnLog(z) {
  const g = new THREE.Group(); g.add(PROTO.log.clone()); g.add(makeShadow(9, 2)); g.position.set(0, 0, z);
  return addItem({ kind: 'obstacle', type: 'log', obj: g, x: 0, z, hw: 4.2, hd: 0.55, y0: 0, y1: 1.0, hit: false });
}
function spawnArch(z) {
  const g = new THREE.Group(); g.add(PROTO.arch.clone()); g.add(makeShadow(10, 2.2)); g.position.set(0, 0, z);
  return addItem({ kind: 'obstacle', type: 'arch', obj: g, x: 0, z, hw: 4.6, hd: 0.6, y0: 1.6, y1: 2.8, hit: false });
}
function spawnShawarma(lane, z, y) {
  const g = new THREE.Group();
  const m = PROTO.shawarma.clone(); m.scale.setScalar(1.05); g.add(m);
  const glow = new THREE.Sprite(glowMat); glow.scale.set(2.6, 2.6, 1); g.add(glow);
  g.position.set(laneX(lane), y || 1.3, z);
  return addItem({ kind: 'pickup', type: 'shawarma', obj: g, mesh: m, x: laneX(lane), z, hw: 0.8, hd: 0.8, y0: (y || 1.3) - 0.7, y1: (y || 1.3) + 0.7, baseY: y || 1.3, hit: false, spin: rand(0, 6) });
}
function trail(lane, z0, n, spacing, yFn) {
  for (let i = 0; i < n; i++) spawnShawarma(lane, z0 + i * spacing, yFn ? yFn(i, n) : 1.3);
}

const rowGap = () => clamp(Math.max(G.speed, 18) * 1.0 + 4, 22, 44) + rand(0, 6);
function spawnRow(z) {
  G.rowCount++;
  const d = G.distance;
  const tier = d < 250 ? 0 : d < 800 ? 1 : 2;
  let pat;
  if (G.rowCount <= 2) pat = 'cactus1';
  else {
    const bag = tier === 0 ? ['cactus1', 'cactus1', 'rock', 'log'] :
      tier === 1 ? ['cactus1', 'cactus2', 'rock', 'log', 'arch', 'rock'] :
      ['cactus2', 'cactus1', 'rock', 'log', 'arch', 'mix', 'cactus2'];
    pat = pick(bag);
  }
  const lanes = [-1, 0, 1];
  const free = (taken) => pick(lanes.filter((l) => taken.indexOf(l) < 0));
  const wantTrail = Math.random() < 0.62;
  const n = 3 + Math.floor(Math.random() * 3);
  switch (pat) {
    case 'cactus1': { const l = pick(lanes); spawnCactus(l, z); if (wantTrail) trail(free([l]), z, n, 3.2); break; }
    case 'cactus2': { const l = pick(lanes); const l2 = pick(lanes.filter((x) => x !== l)); spawnCactus(l, z); spawnCactus(l2, z + rand(-1, 1)); if (wantTrail) trail(free([l, l2]), z, n, 3.2); break; }
    case 'rock': { const l = pick(lanes); spawnRock(l, z); if (wantTrail) trail(free([l]), z, n, 3.2); break; }
    case 'mix': { const l = pick(lanes); const l2 = pick(lanes.filter((x) => x !== l)); spawnCactus(l, z); spawnRock(l2, z); if (wantTrail) trail(free([l, l2]), z, n, 3.2); break; }
    case 'log': { spawnLog(z); if (wantTrail) { const l = pick(lanes); trail(l, z + 5, 3, 3.1, (i) => [1.4, 2.7, 1.4][i]); } break; }
    case 'arch': { spawnArch(z); if (wantTrail) trail(pick(lanes), z + 6, 3, 3, () => 0.95); break; }
  }
}

/* ------------------------------ PORTAL ------------------------------ */
function buildPortal() {
  const g = new THREE.Group();
  const mk = (op) => new THREE.MeshBasicMaterial({ map: portalTex, transparent: true, alphaTest: 0.5, opacity: op, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const discMat = mk(1), backMat = mk(1); backMat.color.setHex(0x9fdc7a);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 8.2), discMat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 9.4), backMat);
  back.position.z = -0.12; disc.position.z = 0;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0x66ff99, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.8 }));
  glow.scale.set(17, 17, 1); glow.position.z = -0.6;
  g.add(glow, back, disc);
  g.position.set(0, 3.5, -(CFG.SPAWN_Z + 10));
  scene.add(g);
  const P = {
    obj: g, z: g.position.z,
    setTexture(t) { discMat.map = t; discMat.color.setHex(0xffffff); discMat.needsUpdate = true; },
    update(dt, time) {
      disc.rotation.z += dt * 1.1; back.rotation.z -= dt * 0.55;
      glow.material.opacity = 0.7 + Math.sin(time * 4) * 0.15;
    }
  };
  return P;
}

/* ------------------------------ UI ---------------------------------- */
const ui = {
  hud: $('hud'), menu: $('screen-menu'), pause: $('screen-pause'), over: $('screen-over'),
  hp: $('hp-fill'), score: $('score'), shaw: $('shaw'), shawBox: document.querySelector('.shaw'), pill: $('portal-pill'), toast: $('toast'), flash: $('flash'),
  cache: {}
};
$('goal-n').textContent = CFG.SHAWARMA_GOAL; $('shaw-goal').textContent = '/' + CFG.SHAWARMA_GOAL;
$('skip-link').href = CFG.RESUME_URL;
$('start-prompt').textContent = isTouch ? 'Tap to start' : 'Press any key to start';
function setText(el, key, v) { if (ui.cache[key] !== v) { ui.cache[key] = v; el.textContent = v; } }
function show(el, on) { el.classList.toggle('hidden', !on); }
let toastTimer = 0;
function toast(msg, ms) { ui.toast.textContent = msg; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms || 1800); }
function flash(white, op, dur) {
  const f = ui.flash; f.classList.toggle('white', !!white); f.style.transition = 'none'; f.style.opacity = op;
  void f.offsetWidth; f.style.transition = 'opacity ' + (dur || 0.5) + 's'; f.style.opacity = 0;
}
function vibrate(p) { try { if (navigator.vibrate && !Sfx.muted) navigator.vibrate(p); } catch (e) {} }
function updateMuteUI() {
  const t = Sfx.muted ? '\u{1F507}' : '\u{1F50A}';
  $('btn-mute').textContent = t; $('btn-mute3').textContent = t + (Sfx.muted ? ' Sound off' : ' Sound on');
}
function updateBestUI() {}
function hudUpdate() {
  const hp = clamp(G.health, 0, 100);
  if (ui.cache.hp !== Math.round(hp)) {
    ui.cache.hp = Math.round(hp);
    ui.hp.style.width = hp + '%';
    ui.hp.style.background = hp > 55 ? '#46d36b' : hp > 28 ? '#ffc83d' : '#ff4d5e';
  }
  setText(ui.score, 'score', String(currentScore()));
  setText(ui.shaw, 'shaw', String(Math.min(G.shaw, CFG.SHAWARMA_GOAL)));
}
const currentScore = () => Math.floor(G.distance / 2) + G.shaw * 25;

/* ------------------------------ GAME FLOW --------------------------- */
function resetRun() {
  for (const it of items) scene.remove(it.obj);
  items.length = 0;
  if (G.portal) { scene.remove(G.portal.obj); G.portal = null; }
  Object.assign(G, {
    distance: 0, speed: 0, speedMul: 1, health: 100, shaw: 0, lane: 0, camelX: 0, y: 0, vy: 0, grounded: true, slideT: 0,
    invuln: 0, buf: null, phase: 0, run: 0, lean: 0, yaw: 0, hurt: 0, squash: 0, airBlend: 0, slideBlend: 0, deadBlend: 0, deadT: 0,
    spawning: true, portalOpen: false, portalT: 0, rowCount: 0, shake: 0, ts: 1, tsTarget: 1, lastStep: 0, hints: G.hints,
    flashed: false, navigated: false
  });
  camel.root.visible = true;
  segments.forEach((sg) => { sg.g.position.z = 68 - sg.idx * CFG.SEG_LEN; sg.a = -sg.g.position.z; layoutSegment(sg, true); });
  // prefill the first rows so something arrives quickly
  let z = -75; G.nextGap = 24;
  while (z > -CFG.SPAWN_Z) { spawnRow(z); G.rowZ = z; z -= rowGap(); }
  G.nextGap = rowGap();
  show(ui.pill, false);
  hudUpdate();
}
function startRun() {
  Sfx.init();
  resetRun();
  G.state = 'playing';
  show(ui.menu, false); show(ui.over, false); show(ui.pause, false); show(ui.hud, true);
  G.stage = -1;
  applyStage();
  toast(isTouch ? 'Swipe to dodge!' : 'Arrow keys to dodge!', 1800);
}
function pauseGame() { if (G.state !== 'playing') return; G.state = 'paused'; show(ui.pause, true); }
function resumeGame() { if (G.state !== 'paused') return; G.state = 'playing'; show(ui.pause, false); Sfx.init(); }
function die() {
  G.state = 'dying'; G.deadT = 0; G.tsTarget = 0.35; G.speedMul = 0.4;
  Sfx.hit(); Sfx.over(); vibrate([80, 40, 140]);
  emit(G.camelX, 1.2, 0, 0xe8c48a, 22, 4, 5, 1.4);
}
function showOver() {
  G.state = 'over';
  const sc = currentScore();
  if (sc > G.best) { G.best = sc; store.set('cq.best', String(sc)); updateBestUI(); }
  $('o-dist').textContent = Math.floor(G.distance); $('o-shaw').textContent = G.shaw; $('o-best').textContent = G.best;
  const left = CFG.SHAWARMA_GOAL - G.shaw;
  $('over-sub').textContent = left > 0 ? left + ' more shawarma' + (left > 1 ? 's' : '') + ' to open the portal. The camel is fine. Mostly.' : 'You opened the portal, so close!';
  show(ui.over, true); show(ui.hud, false);
}
function openPortal() {
  G.portalOpen = true; G.spawning = false;
  G.portal = buildPortal();
  show(ui.pill, true);
  toast('\u{1F300} The portal is open!', 2600);
  Sfx.portalOpen(); vibrate([40, 30, 40]);
}
function enterPortal() {
  G.state = 'portal'; G.portalT = 0; G.invuln = 99;
  Sfx.portalGo(); vibrate(200);
  show(ui.pill, false);
  toast('Teleporting to the Interactive Resume…', 1600);
}
function hurt(it) {
  it.hit = true;
  const dmg = it.type === 'cactus' ? 25 : 20;
  G.health -= dmg; G.invuln = 1.5; G.hurt = 1; G.shake = 1; G.speedMul = 0.55;
  flash(false, 0.7, 0.55); Sfx.hit(); vibrate(90);
  emit(G.camelX, 1.4, 0, 0xe8c48a, 14, 3, 4, 1.2);
  if (G.health <= 0) { G.health = 0; die(); }
}

/* ------------------------------ INPUT ------------------------------- */
function action(a) {
  if (G.state !== 'playing') return;
  if (a === 'left' && G.lane > -1) { G.lane--; Sfx.lane(); }
  else if (a === 'right' && G.lane < 1) { G.lane++; Sfx.lane(); }
  else if (a === 'jump' || a === 'slide') { G.buf = { a, t: G.time }; }
}
function doJump() { G.vy = CFG.JUMP_V; G.grounded = false; G.slideT = 0; Sfx.jump(); emit(G.camelX, 0.2, 0.6, 0xe8c48a, 6, 1.2, 1.5, 1); }
function doSlide() { if (G.grounded) { G.slideT = 0.8; Sfx.slide(); emit(G.camelX, 0.2, 0.2, 0xe8c48a, 8, 1.4, 1.2, 1); } else { G.vy = Math.min(G.vy, -24); } }

window.addEventListener('keydown', (e) => {
  if (e.repeat && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
  const k = e.code;
  if (G.state === 'menu') { if (e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta|Caps|Tab|F\d|Escape)/.test(k)) return; e.preventDefault(); startRun(); return; }
  if (G.state === 'dying') { if (k === 'Enter' || k === 'KeyR') { e.preventDefault(); startRun(); } return; }
  if (G.state === 'over') { if (k === 'Enter' || k === 'Space' || k === 'KeyR') { e.preventDefault(); startRun(); } return; }
  if (G.state === 'paused') { if (k === 'KeyP' || k === 'Escape' || k === 'Enter' || k === 'Space') { e.preventDefault(); resumeGame(); } return; }
  if (k === 'ArrowLeft' || k === 'KeyA') action('left');
  else if (k === 'ArrowRight' || k === 'KeyD') action('right');
  else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') { e.preventDefault(); action('jump'); }
  else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); action('slide'); }
  else if (k === 'KeyP' || k === 'Escape') pauseGame();
  else if (k === 'KeyR') startRun();
  else if (k === 'KeyM') { Sfx.setMuted(!Sfx.muted); updateMuteUI(); }
});

// Swipes (pointer events: touch, pen and mouse-drag)
let sw = null;
canvas.addEventListener('pointerdown', (e) => { sw = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointermove', (e) => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  const th = Math.max(26, Math.min(48, window.innerWidth * 0.07));
  if (Math.abs(dx) < th && Math.abs(dy) < th) return;
  if (Math.abs(dx) > Math.abs(dy)) action(dx > 0 ? 'right' : 'left');
  else action(dy < 0 ? 'jump' : 'slide');
  sw.x = e.clientX; sw.y = e.clientY;   // allow chained swipes without lifting
});
const endSwipe = (e) => { if (sw && e.pointerId === sw.id) sw = null; };
canvas.addEventListener('pointerup', endSwipe); canvas.addEventListener('pointercancel', endSwipe);
document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

ui.menu.addEventListener('click', (e) => { startRun(); });
$('btn-retry').addEventListener('click', startRun);
$('btn-restart').addEventListener('click', startRun);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-pause').addEventListener('click', pauseGame);
['btn-mute', 'btn-mute3'].forEach((id) => $(id).addEventListener('click', (e) => { e.stopPropagation(); Sfx.init(); Sfx.setMuted(!Sfx.muted); updateMuteUI(); }));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);
window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

/* ------------------------------ UPDATE ------------------------------ */
function scrollWorld(dz) {
  for (const s of segments) {
    s.g.position.z += dz;
    if (s.g.position.z > 92) { s.g.position.z -= CFG.SEG_COUNT * CFG.SEG_LEN; s.a = G.distance - s.g.position.z; layoutSegment(s); }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]; it.z += dz; it.obj.position.z = it.z;
    if (it.z > 16) { scene.remove(it.obj); items.splice(i, 1); }
  }
  G.rowZ += dz;
  if (G.portal) { G.portal.z += dz; G.portal.obj.position.z = G.portal.z; }
}

function updatePlaying(dt, rdt) {
  // speed
  const target = Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED + G.distance * 0.0055);
  G.speedMul = Math.min(1, G.speedMul + rdt * 0.45);
  G.speed = damp(G.speed, target * G.speedMul, G.speed < 10 ? 1.4 : 2.4, dt);
  G.distance += G.speed * dt;
  G.run = damp(G.run, 1, 5, dt);
  G.phase += dt * (6 + G.speed * 0.5);

  // lane movement + lean
  const tx = laneX(G.lane), dx = tx - G.camelX;
  G.camelX = damp(G.camelX, tx, 13, dt);
  G.lean = damp(G.lean, clamp(-dx * 0.09, -0.35, 0.35), 12, dt);
  G.yaw = damp(G.yaw, clamp(-dx * 0.07, -0.3, 0.3), 12, dt);

  // jump / slide with input buffering
  if (G.slideT > 0) G.slideT -= dt;
  if (G.buf) {
    if (G.time - G.buf.t > 0.25) G.buf = null;
    else if (G.buf.a === 'jump' && G.grounded) { doJump(); G.buf = null; }
    else if (G.buf.a === 'slide') { if (G.grounded) { doSlide(); G.buf = null; } else { doSlide(); } }
  }
  if (!G.grounded) {
    G.vy -= CFG.GRAVITY * dt; G.y += G.vy * dt;
    if (G.y <= 0) {
      G.y = 0; G.vy = 0; G.grounded = true; G.squash = 1;
      emit(G.camelX, 0.2, 0.4, 0xe8c48a, 8, 1.6, 1.4, 1.1);
      if (G.buf && G.buf.a === 'slide') { doSlide(); G.buf = null; }
    }
  }

  // footfall dust + step sound
  const stp = Math.floor(G.phase / Math.PI);
  if (stp !== G.lastStep) {
    G.lastStep = stp;
    if (G.grounded && G.slideT <= 0) { emit(G.camelX + rand(-0.4, 0.4), 0.15, 0.9, 0xe8c48a, 1, 0.5, 0.9, 0.8); if (stp % 2 === 0) Sfx.step(); }
  }

  // world
  scrollWorld(G.speed * dt);
  if (G.spawning && G.rowZ > -CFG.SPAWN_Z + G.nextGap) { spawnRow(-CFG.SPAWN_Z); G.rowZ = -CFG.SPAWN_Z; G.nextGap = rowGap(); }
  if (!G.portalOpen && G.shaw >= CFG.SHAWARMA_GOAL) openPortal();

  // timers
  G.invuln = Math.max(0, G.invuln - rdt); G.hurt = Math.max(0, G.hurt - rdt * 1.6);
  G.blink += rdt;
  camel.root.visible = !(G.invuln > 0 && G.invuln < 90 && Math.floor(G.blink * 14) % 2 === 0);

  // collisions
  const cBottom = G.y + 0.1, cTop = G.y + (G.slideT > 0 && G.grounded ? 1.25 : 2.75);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.hit) continue;
    if (Math.abs(it.z) > it.hd + 0.8) continue;
    if (Math.abs(it.x - G.camelX) > it.hw + 0.4) continue;
    if (cTop < it.y0 || cBottom > it.y1) continue;
    if (it.kind === 'pickup') {
      scene.remove(it.obj); items.splice(i, 1);
      G.shaw++; G.health = Math.min(100, G.health + 8);
      Sfx.coin(); vibrate(15);
      emit(it.x, it.baseY, it.z, 0xffd35a, 10, 2.5, 3.5, 0.9);
      ui.shawBox.classList.add('pop'); setTimeout(() => ui.shawBox.classList.remove('pop'), 140);
    } else if (G.invuln <= 0) hurt(it);
  }

  // portal
  if (G.portal && G.portal.z > -1.5) enterPortal();

  // contextual hints (once each)
  if (!isTouch || true) {
    for (const it of items) {
      if (it.kind !== 'obstacle' || it.z < -62 || it.z > -30) continue;
      if ((it.type === 'log' || it.type === 'rock') && !G.hints.jump) { G.hints.jump = 1; toast(isTouch ? 'Swipe UP to jump!' : 'Press ↑ or Space to jump!', 1800); }
      else if (it.type === 'arch' && !G.hints.slide) { G.hints.slide = 1; toast(isTouch ? 'Swipe DOWN to slide!' : 'Press ↓ to slide under!', 1800); }
    }
  }
  hudUpdate();
}

function updateDying(dt, rdt) {
  G.deadT += rdt;
  G.speed = damp(G.speed, 0, 3, dt); G.distance += G.speed * dt;
  scrollWorld(G.speed * dt);
  G.phase += dt * 3; G.run = damp(G.run, 0.2, 4, dt);
  G.y = 0; G.hurt = 0;
  if (G.deadT > 1.1) { G.tsTarget = 1; showOver(); }
}

function updatePortal(dt) {
  G.portalT += dt;
  G.speed = damp(G.speed, 46, 2.2, dt); G.distance += G.speed * dt;
  G.phase += dt * (6 + G.speed * 0.5); G.run = 1;
  G.camelX = damp(G.camelX, 0, 6, dt); G.lean = damp(G.lean, 0, 8, dt); G.yaw = damp(G.yaw, 0, 8, dt);
  scrollWorld(G.speed * dt);
  camel.root.visible = true;
  if (G.portalT > 0.5 && !G.flashed) { G.flashed = true; flash(true, 1, 0.01); ui.flash.style.transition = 'opacity .9s ease-in'; ui.flash.style.opacity = 1; }
  if (G.portalT > 1.7 && !G.navigated) { G.navigated = true; CFG.navigate(CFG.RESUME_URL); }
}

const cam = { a: -0.55, b: 0, shakeT: 0 };
const lookTarget = new THREE.Vector3(), lookA = new THREE.Vector3(), lookB = new THREE.Vector3();
function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vf = Math.max(58, Math.min(92, (2 * Math.atan(Math.tan((48 * Math.PI / 180) / 2) / camera.aspect)) * 180 / Math.PI));
  cam.baseFov = vf; cam.portrait = camera.aspect < 0.9;
  camera.fov = vf; camera.updateProjectionMatrix();
}
window.addEventListener('resize', fitCamera);
window.addEventListener('orientationchange', () => setTimeout(fitCamera, 200));
fitCamera();

function updateCamera(dt) {
  const menu = G.state === 'menu';
  if (menu) { cam.a = damp(cam.a, -0.55 + Math.sin(G.time * 0.3) * 0.07, 3, dt); cam.b = damp(cam.b, 0, 2.5, dt); }
  else { cam.a = damp(cam.a, cam.a < 0 ? -Math.PI : Math.PI, 3, dt); cam.b = damp(cam.b, 1, 2.2, dt); }
  const b = cam.b, por = cam.portrait ? 1 : 0;
  const R = lerp(10.8 + por * 2.4, 8.4 + por * 1.2, b), H = lerp(3.4 + por * 0.6, 3.9 + por * 0.7, b);
  G.shake = Math.max(0, G.shake - dt * 2.4);
  const sh = G.shake * G.shake * 0.35;
  camera.position.set(Math.sin(cam.a) * R + G.camelX * 0.6 * b + rand(-sh, sh), H + rand(-sh, sh), -Math.cos(cam.a) * R);
  lookA.set(0, 2.5 + por * 0.2, 0); lookB.set(G.camelX * 0.4, 1.6, -12);
  lookTarget.copy(lookA).lerp(lookB, b);
  camera.lookAt(lookTarget);
  const spd = smooth(14, 40, G.speed) * 7 + (G.state === 'portal' ? smooth(0, 1.6, G.portalT) * 16 : 0);
  const f = cam.baseFov + spd * b;
  if (Math.abs(f - camera.fov) > 0.02) { camera.fov = f; camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);
  backdrop.position.x = camera.position.x; haze.position.x = camera.position.x;
  backdropRear.position.x = camera.position.x; hazeRear.position.x = camera.position.x;
  backdropMat.uniforms.scroll.value = G.time * 0.002;
}

function step(dt) {
  G.time += dt;
  G.ts = damp(G.ts, G.tsTarget, 6, dt);
  const rdt = dt, wdt = dt * G.ts;
  const before = G.distance;
  if (G.state === 'playing') updatePlaying(wdt, rdt);
  else if (G.state === 'dying') updateDying(wdt, rdt);
  else if (G.state === 'portal') updatePortal(wdt);
  else if (G.state === 'over') { G.phase += wdt * 2; G.run = damp(G.run, 0, 4, dt); }
  else if (G.state === 'menu') { G.phase += dt * 1.2; G.run = damp(G.run, 0, 4, dt); }
  if (G.state !== 'paused') {
    poseCamel(dt);
    updateParticles(dt, (G.state === 'menu' || G.state === 'over') ? 0 : G.speed * wdt);
    updateStreaks(wdt, G.state === 'playing' || G.state === 'portal' ? G.speed : 0);
    if (G.portal) G.portal.update(dt, G.time);
    for (const it of items) if (it.kind === 'pickup') { it.spin += dt * 2.4; it.mesh.rotation.y = it.spin; it.obj.position.y = it.baseY + Math.sin(G.time * 3 + it.x) * 0.15; }
    applyStage(); updateClouds(dt);
    updateCamera(dt);
  }
}

/* ------------------------------ LOOP -------------------------------- */
let last = performance.now(), slow = 0, fast = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, Math.max(0.0001, raw));
  step(dt);
  renderer.render(scene, camera);
  // adaptive resolution: if the device struggles, drop the pixel ratio
  if (raw > 0.026) { slow++; fast = 0; } else { fast++; slow = Math.max(0, slow - 1); }
  if (slow > 45 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); fitCamera(); slow = 0; }
}

updateMuteUI(); updateBestUI();
resetRun();
applyStage();
requestAnimationFrame(frame);

// Handy for debugging / automated tests
window.CQ = { G, CFG, step, camel, camera, scene, renderer, items, startRun, resetRun, spawnRow, action, openPortal, pauseGame, resumeGame, spawnCactus, spawnRock, spawnLog, spawnArch, spawnShawarma, segments };
})();
