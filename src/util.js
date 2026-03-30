// src/util.js
// v31 STABLE UTIL REWRITE (FULL FILE)
// Goals:
// ✅ Fast core helpers
// ✅ Keeps exports expected by current files:
//    clamp, lerp, dist2, norm, hash2, fbm, RNG
// ✅ Small, stable, deterministic
//
// Replace ENTIRE file: src/util.js

/* ===========================
   Basic math
   =========================== */
export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function norm(x, y) {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

/* ===========================
   Hashing
   =========================== */
export function hash2(a, b) {
  let x = (a | 0) ^ 0x9e3779b9;
  let y = (b | 0) ^ 0x85ebca6b;

  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;

  y ^= y >>> 16;
  y = Math.imul(y, 0x7feb352d);
  y ^= y >>> 15;
  y = Math.imul(y, 0x846ca68b);
  y ^= y >>> 16;

  let h = (x ^ (y + 0x27d4eb2d)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;

  return h | 0;
}

/* ===========================
   RNG
   =========================== */
export class RNG {
  constructor(seed = 123456789) {
    this._s = (seed | 0) || 0x12345678;
  }

  nextU32() {
    let s = this._s | 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this._s = s | 0;
    return s >>> 0;
  }

  next() {
    return this.nextU32();
  }

  float() {
    return this.nextU32() / 4294967296;
  }

  int(min, max) {
    const lo = Math.min(min, max) | 0;
    const hi = Math.max(min, max) | 0;
    const span = (hi - lo + 1) >>> 0;
    return (lo + (this.nextU32() % span)) | 0;
  }

  nextInt(min, max) {
    return this.int(min, max);
  }

  range(min, max) {
    return this.int(min, max);
  }

  pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[this.int(0, arr.length - 1)];
  }
}

/* ===========================
   Noise
   =========================== */
function fade(t) {
  return t * t * (3 - 2 * t);
}

function gridNoise(ix, iy, seed) {
  const h = hash2((ix | 0) ^ seed, (iy | 0) ^ (seed * 31));
  return ((h >>> 0) % 10000) / 10000;
}

export function valueNoise(x, y, seed = 1337) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = fade(x - x0);
  const sy = fade(y - y0);

  const n00 = gridNoise(x0, y0, seed);
  const n10 = gridNoise(x1, y0, seed);
  const n01 = gridNoise(x0, y1, seed);
  const n11 = gridNoise(x1, y1, seed);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

export function fbm(x, y, seed = 1337, octaves = 4) {
  let v = 0;
  let amp = 0.58;
  let freq = 1.0;

  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    freq *= 2.0;
    amp *= 0.52;
  }

  return v;
}