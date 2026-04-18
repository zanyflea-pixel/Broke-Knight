// src/util.js
// v102.4 FULL UTIL RESTORE
// - math helpers
// - seeded RNG
// - hash helpers
// - value noise + fbm
// - geometry helpers
// - random helpers
// - built to support current game.js / world.js / entities.js / ui.js

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-9, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function dist(x1, y1, x2, y2) {
  return Math.sqrt(dist2(x1, y1, x2, y2));
}

export function norm(x, y) {
  const d = Math.sqrt(x * x + y * y) || 1;
  return { x: x / d, y: y / d };
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function rotateVec(x, y, a) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return {
    x: x * ca - y * sa,
    y: x * sa + y * ca,
  };
}

export function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
  return (Math.random() * (max - min + 1) | 0) + min;
}

export function chance(p) {
  return Math.random() < p;
}

export function pick(arr) {
  if (!arr || !arr.length) return null;
  return arr[(Math.random() * arr.length) | 0];
}

export function shuffleInPlace(arr) {
  if (!Array.isArray(arr)) return arr;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export class RNG {
  constructor(seed = 123456789) {
    this.seed = seed >>> 0;
    if (this.seed === 0) this.seed = 123456789;
  }

  next() {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed;
  }

  float() {
    return this.next() / 0xffffffff;
  }

  int(min, max) {
    return (this.float() * (max - min + 1) | 0) + min;
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }

  chance(p) {
    return this.float() < p;
  }

  pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[this.int(0, arr.length - 1)];
  }

  sign() {
    return this.float() < 0.5 ? -1 : 1;
  }
}

export function hash2(x, y, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1446647;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

export function hash3(x, y, z, seed = 0) {
  let h =
    (x | 0) * 374761393 +
    (y | 0) * 668265263 +
    (z | 0) * 2147483647 +
    (seed | 0) * 1446647;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function noise2D(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);

  const xf = x - xi;
  const yf = y - yi;

  const h00 = hash2(xi, yi, seed) / 0xffffffff;
  const h10 = hash2(xi + 1, yi, seed) / 0xffffffff;
  const h01 = hash2(xi, yi + 1, seed) / 0xffffffff;
  const h11 = hash2(xi + 1, yi + 1, seed) / 0xffffffff;

  const u = fade(xf);
  const v = fade(yf);

  const nx0 = lerp(h00, h10, u);
  const nx1 = lerp(h01, h11, u);

  return lerp(nx0, nx1, v);
}

export function fbm(x, y, seed = 0, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let normFactor = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * freq, y * freq, seed + i * 101) * amp;
    normFactor += amp;
    freq *= 2;
    amp *= 0.5;
  }

  if (normFactor <= 0) return 0;
  return value / normFactor;
}

export function ridge(x, y, seed = 0, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let normFactor = 0;

  for (let i = 0; i < octaves; i++) {
    const n = noise2D(x * freq, y * freq, seed + i * 131);
    value += (1 - Math.abs(n * 2 - 1)) * amp;
    normFactor += amp;
    freq *= 2;
    amp *= 0.5;
  }

  if (normFactor <= 0) return 0;
  return value / normFactor;
}

export function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return dist(px, py, x1, y1);
  }

  const t = clamp(
    ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy),
    0,
    1
  );

  const lx = x1 + t * dx;
  const ly = y1 + t * dy;

  return dist(px, py, lx, ly);
}

export function pointInRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

export function circleIntersectsCircle(x1, y1, r1, x2, y2, r2) {
  const rr = r1 + r2;
  return dist2(x1, y1, x2, y2) <= rr * rr;
}

export function rectIntersectsRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}