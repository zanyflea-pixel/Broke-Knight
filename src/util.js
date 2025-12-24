// src/util.js
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx=ax-bx, dy=ay-by; return dx*dx + dy*dy; }
export function norm(x, y) {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

// Deterministic RNG (no BigInt; stable across browsers)
export class RNG {
  constructor(seed = 1234567) {
    this.s = seed >>> 0;
  }
  nextU32() {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    this.s = x >>> 0;
    return this.s;
  }
  float() { return (this.nextU32() >>> 0) / 4294967296; }
  int(a, b) { return a + Math.floor(this.float() * (b - a + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
}

// Hash noise helpers (fast)
export function hash01(x, y, seed = 0) {
  // integer-ish hashing from floats
  let xi = (x * 73856093) | 0;
  let yi = (y * 19349663) | 0;
  let h = (xi ^ yi ^ seed) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise2(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const xf = x - x0, yf = y - y0;

  const n00 = hash01(x0, y0, seed);
  const n10 = hash01(x0 + 1, y0, seed);
  const n01 = hash01(x0, y0 + 1, seed);
  const n11 = hash01(x0 + 1, y0 + 1, seed);

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

export function fbm(x, y, seed = 0, octaves = 5) {
  let amp = 0.5, freq = 1;
  let sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / (norm || 1);
}
