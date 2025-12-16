// src/util.js
// Deterministic, fast, Number-only hashing + value noise (NO BigInt).

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/* ============================
   RNG (seeded)
   ============================ */
export class RNG {
  constructor(seed = 1234567) {
    // force uint32
    this.s = (seed >>> 0) || 1;
  }
  nextU32() {
    // xorshift32
    let x = this.s >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    this.s = x >>> 0;
    return this.s;
  }
  float() {
    // [0,1)
    return (this.nextU32() >>> 0) / 4294967296;
  }
  int(a, b) {
    return (a + Math.floor(this.float() * (b - a + 1))) | 0;
  }
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
}

/* ============================
   HASH / NOISE (Number-only)
   ============================ */

// A solid 32-bit integer hash for 2D coordinates + seed.
// Returns unsigned 32-bit integer.
export function hash2i(x, y, seed = 0) {
  // convert to 32-bit ints
  x = x | 0;
  y = y | 0;
  seed = seed | 0;

  // mix
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

// 0..1 random float from integer coords
export function rnd01(ix, iy, seed = 0) {
  return hash2i(ix, iy, seed) / 4294967295;
}

// Smoothstep
function smooth(t) {
  return t * t * (3 - 2 * t);
}

// 2D value noise (0..1)
export function noise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = x - x0;
  const ty = y - y0;

  const sx = smooth(tx);
  const sy = smooth(ty);

  const a = rnd01(x0, y0, seed);
  const b = rnd01(x1, y0, seed);
  const c = rnd01(x0, y1, seed);
  const d = rnd01(x1, y1, seed);

  const ab = lerp(a, b, sx);
  const cd = lerp(c, d, sx);
  return lerp(ab, cd, sy);
}

// Fractal Brownian Motion (0..1-ish)
export function fbm(x, y, seed = 0, octaves = 4) {
  let amp = 0.5;
  let freq = 1.0;
  let sum = 0.0;
  let norm = 0.0;

  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq, (seed + i * 1013) | 0) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return norm > 0 ? sum / norm : 0;
}
