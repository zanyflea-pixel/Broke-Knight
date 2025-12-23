// src/util.js
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const len = (x, y) => Math.sqrt(x * x + y * y) || 0.000001;
export const norm = (x, y) => {
  const L = len(x, y);
  return { x: x / L, y: y / L };
};

export class RNG {
  constructor(seed = 1234567) {
    this.s = seed >>> 0;
  }
  nextU32() {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    this.s = x;
    return x;
  }
  float() { return this.nextU32() / 0xffffffff; }
  int(a, b) { return a + Math.floor(this.float() * (b - a + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
}

// Lightweight value noise + fbm (fast and stable)
function hash2i(ix, iy, seed) {
  // integer hash to [0,1)
  let x = (ix * 374761393 + iy * 668265263 + seed * 1442695041) >>> 0;
  x = (x ^ (x >> 13)) >>> 0;
  x = (x * 1274126177) >>> 0;
  return ((x ^ (x >> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2i(ix, iy, seed);
  const b = hash2i(ix + 1, iy, seed);
  const c = hash2i(ix, iy + 1, seed);
  const d = hash2i(ix + 1, iy + 1, seed);
  const ux = smooth(fx), uy = smooth(fy);
  const ab = lerp(a, b, ux);
  const cd = lerp(c, d, ux);
  return lerp(ab, cd, uy); // 0..1
}

export function fbm(x, y, seed = 0, oct = 5) {
  let amp = 0.55;
  let f = 1.0;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise2(x * f, y * f, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.55;
    f *= 2.02;
  }
  return sum / norm; // ~0..1
}
