// src/util.js
// v106.1 UTIL FIX
// - adds distancePointToSegment (fixes world.js crash)
// - keeps RNG, fbm, helpers intact

// ======================
// BASIC MATH
// ======================

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
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
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

// ======================
// 🔥 NEW: REQUIRED FOR ROADS / RIVERS / BRIDGES
// ======================

export function distancePointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = clamp(
    ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy),
    0,
    1
  );

  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return Math.hypot(px - cx, py - cy);
}

// ======================
// HASH
// ======================

export function hash2(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1446641;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

// ======================
// RNG
// ======================

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
  }

  next() {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  float() {
    return this.next();
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
}

// ======================
// NOISE
// ======================

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);

  const xf = x - xi;
  const yf = y - yi;

  const h00 = hash2(xi, yi, seed) / 4294967296;
  const h10 = hash2(xi + 1, yi, seed) / 4294967296;
  const h01 = hash2(xi, yi + 1, seed) / 4294967296;
  const h11 = hash2(xi + 1, yi + 1, seed) / 4294967296;

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  const nx0 = lerp(h00, h10, u);
  const nx1 = lerp(h01, h11, u);

  return lerp(nx0, nx1, v);
}

// ======================
// FBM
// ======================

export function fbm(x, y, seed = 0, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;

  for (let i = 0; i < octaves; i++) {
    value += noise2(x * freq, y * freq, seed + i * 1013) * amp;
    freq *= 2;
    amp *= 0.5;
  }

  return value;
}