// src/util.js
// Small, stable utilities. All math is Number-only (no BigInt).

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
};

export class RNG {
  constructor(seed = 1234567) { this.s = seed >>> 0; }
  nextU32() { // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    this.s = x >>> 0;
    return this.s;
  }
  float() { return (this.nextU32() >>> 8) / 0x01000000; } // 0..1
  int(a, b) { return a + (this.nextU32() % ((b - a) + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
}

// Hash -> 0..1 using integer-ish coords
export function hash01(ix, iy, seed = 0) {
  ix = (ix | 0); iy = (iy | 0); seed = (seed | 0);
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = (n * 1274126177) | 0;
  n = (n ^ (n >>> 16)) | 0;
  return ((n >>> 0) % 1000000) / 1000000;
}

function fade(t){ return t*t*(3-2*t); }

// Value noise 2D
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash01(xi, yi, seed);
  const b = hash01(xi + 1, yi, seed);
  const c = hash01(xi, yi + 1, seed);
  const d = hash01(xi + 1, yi + 1, seed);
  const ab = lerp(a, b, u);
  const cd = lerp(c, d, u);
  return lerp(ab, cd, v);
}

export function fbm(x, y, seed = 0, octaves = 5) {
  let f = 0, amp = 0.55, freq = 1;
  for (let i = 0; i < octaves; i++) {
    f += noise2(x * freq, y * freq, seed + i * 1013) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return f; // ~0..1
}
