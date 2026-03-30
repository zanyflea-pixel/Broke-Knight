// src/util.js
// v32 SAFE CORE UTILS + COMPAT PASS (FULL FILE)
// Goals:
// - keep Broke Knight helpers centralized and reliable
// - support mixed old/new calling styles used across files
// - provide safer math helpers
// - provide stable seeded randomness + noise helpers
// - avoid changing gameplay rules directly

/* ===========================
   Basic math helpers
=========================== */

export function clamp(v, lo = 0, hi = 1) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, v) {
  if (a === b) return 0;
  return (v - a) / (b - a);
}

export function remap(v, inA, inB, outA, outB) {
  return lerp(outA, outB, invLerp(inA, inB, v));
}

export function saturate(v) {
  return clamp(v, 0, 1);
}

export function smoothstep(a, b, v) {
  const t = saturate(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function norm(x, y) {
  const d = Math.hypot(x, y);
  if (d <= 1e-8) return { x: 0, y: 0 };
  return { x: x / d, y: y / d };
}

export function len(x, y) {
  return Math.hypot(x, y);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function sign0(v) {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

export function roundTo(v, step = 1) {
  if (!step) return v;
  return Math.round(v / step) * step;
}

/* ===========================
   Hash / seeded randomness
=========================== */

export function hash2(x = 0, y = 0, seed = 0) {
  // Stable 32-bit integer hash for tile/world lookups.
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 69069;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return h | 0;
}

export function hash3(x = 0, y = 0, z = 0, seed = 0) {
  let h =
    Math.imul((x | 0) ^ 0x27d4eb2d, 2246822519) ^
    Math.imul((y | 0) ^ 0x165667b1, 3266489917) ^
    Math.imul((z | 0) ^ 0x9e3779b9, 668265263) ^
    Math.imul(seed | 0, 374761393);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h | 0;
}

export function rand01FromHash(h) {
  return ((h >>> 0) / 4294967295);
}

export class RNG {
  constructor(seed = 12345) {
    this._state = (seed | 0) || 12345;
    if (this._state === 0) this._state = 12345;
  }

  seed(v) {
    this._state = (v | 0) || 12345;
    if (this._state === 0) this._state = 12345;
    return this;
  }

  next() {
    // xorshift32
    let x = this._state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._state = x | 0;
    return this._state;
  }

  uint() {
    return this.next() >>> 0;
  }

  float() {
    return this.uint() / 4294967295;
  }

  range(min = 0, max = 1) {
    return min + (max - min) * this.float();
  }

  int(min = 0, max = 1) {
    if (max < min) {
      const t = min;
      min = max;
      max = t;
    }
    return Math.floor(this.range(min, max + 1));
  }

  chance(p = 0.5) {
    return this.float() < p;
  }

  pick(arr) {
    if (!arr || !arr.length) return undefined;
    return arr[this.int(0, arr.length - 1)];
  }

  sign() {
    return this.chance(0.5) ? -1 : 1;
  }
}

/* ===========================
   Value noise
=========================== */

function fade(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);

  const tx = x - xi;
  const ty = y - yi;

  const h00 = rand01FromHash(hash2(xi, yi, seed));
  const h10 = rand01FromHash(hash2(xi + 1, yi, seed));
  const h01 = rand01FromHash(hash2(xi, yi + 1, seed));
  const h11 = rand01FromHash(hash2(xi + 1, yi + 1, seed));

  const u = fade(tx);
  const v = fade(ty);

  const a = lerp(h00, h10, u);
  const b = lerp(h01, h11, u);
  return lerp(a, b, v);
}

function _fbmFixed(x, y, octaves = 4, lacunarity = 2, gain = 0.5, seed = 0) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let normSum = 0;

  for (let i = 0; i < Math.max(1, octaves | 0); i++) {
    sum += valueNoise2(x * freq, y * freq, (seed | 0) + i * 1013) * amp;
    normSum += amp;
    freq *= lacunarity;
    amp *= gain;
  }

  if (normSum <= 1e-8) return 0;
  return sum / normSum;
}

/*
  Supports BOTH styles safely:

  Style A:
    fbm(x, y, octaves, lacunarity, gain, seed)

  Style B:
    fbm(x, y, seed, octaves)

  Some earlier project variants mixed these patterns, so this wrapper
  tries to stay compatible instead of breaking older files.
*/
export function fbm(x, y, a = 4, b = 2, c = 0.5, d = 0) {
  // Heuristic:
  // If the 3rd arg looks like a seed and the 4th looks like a small octave count,
  // treat as (x, y, seed, octaves).
  const looksLikeSeedThenOctaves =
    Number.isInteger(a) &&
    (Math.abs(a) > 32 || a < 0) &&
    Number.isInteger(b) &&
    b >= 1 &&
    b <= 8 &&
    c === 0.5 &&
    d === 0;

  if (looksLikeSeedThenOctaves) {
    return _fbmFixed(x, y, b, 2, 0.5, a);
  }

  // Default modern style: (x, y, octaves, lacunarity, gain, seed)
  const octaves = Math.max(1, a | 0);
  const lacunarity = Number.isFinite(b) ? b : 2;
  const gain = Number.isFinite(c) ? c : 0.5;
  const seed = d | 0;

  return _fbmFixed(x, y, octaves, lacunarity, gain, seed);
}

/* ===========================
   Collision / geometry helpers
=========================== */

export function aabbOverlap(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

export function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function circleHit(ax, ay, ar, bx, by, br) {
  const rr = ar + br;
  return dist2(ax, ay, bx, by) <= rr * rr;
}

/* ===========================
   Timing helpers
=========================== */

export function cooldownTick(v, dt) {
  return v > 0 ? Math.max(0, v - dt) : 0;
}

export function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/* ===========================
   Compatibility aliases
=========================== */

export function normalize(x, y) {
  return norm(x, y);
}

export function randRange(rngOrMin, minOrMax, maybeMax) {
  // Supports:
  // randRange(min, max)
  // randRange(rng, min, max)
  if (rngOrMin instanceof RNG) {
    return rngOrMin.range(minOrMax, maybeMax);
  }
  return minOrMax === undefined
    ? Math.random() * rngOrMin
    : rngOrMin + (minOrMax - rngOrMin) * Math.random();
}

export function randInt(rngOrMin, minOrMax, maybeMax) {
  if (rngOrMin instanceof RNG) {
    return rngOrMin.int(minOrMax, maybeMax);
  }
  const min = rngOrMin | 0;
  const max = minOrMax | 0;
  return Math.floor(min + Math.random() * (max - min + 1));
}