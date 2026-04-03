// src/world.js
// v51 COASTAL OVERWORLD PASS (FULL FILE)
//
// Main goals:
// - much more water
// - less straight separator-line feeling
// - more coast / bay / ocean feel
// - almost no road coverage
// - roads are blue-grey and fast
// - forest tiles are darker and slower
// - bigger trees
// - docks only on actual shore
// - camps farther from water
// - keep current game.js compatibility

import { clamp, hash2, fbm, RNG } from "./util.js";

export default class World {
  constructor(seed = 12345, opts = {}) {
    this.seed = (seed | 0) || 12345;

    this.tileSize = opts.tileSize || 24;
    this.chunkTiles = opts.chunkTiles || 32;
    this.chunkSize = this.tileSize * this.chunkTiles;

    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.spawn = { x: 0, y: 0 };
    this.boundsRadius = 5200;

    this.camps = [];
    this.waystones = [];
    this.docks = [];
    this.dungeons = [];

    this._chunks = new Map();
    this._buildQueue = [];
    this._queued = new Set();

    this._minimap = null;
    this._minimapDirty = true;
    this._minimapTimer = 0;

    this.mapMode = "small";

    this._revealedSmall = new Set();
    this._revealedLarge = new Set();

    this._poiRng = new RNG(hash2(this.seed, 777));

    this._initPOIs();
    this.revealAround(this.spawn.x, this.spawn.y, 260);
    this._queueAround(this.spawn.x, this.spawn.y, 2);
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  update(dt, hero) {
    if (hero) {
      this._queueAround(hero.x, hero.y, 3);
      this.revealAround(hero.x, hero.y, 240);
    }

    let built = 0;
    while (this._buildQueue.length && built < 4) {
      const key = this._buildQueue.shift();
      this._queued.delete(key);
      const [cx, cy] = key.split(",").map(Number);
      this._buildChunk(cx, cy);
      built++;
    }

    this._minimapTimer += dt;
    if (this._minimapTimer >= 0.18) {
      this._minimapTimer = 0;
      if (this._minimapDirty) this._renderMinimap();
    }
  }

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "large" : "small";
    this._minimapDirty = true;
  }

  getMinimapCanvas() {
    if (!this._minimap || this._minimapDirty) this._renderMinimap();
    return this._minimap;
  }

  revealAround(wx, wy, radius = 220) {
    this._revealModeAround(wx, wy, radius, "small");
    this._revealModeAround(wx, wy, radius * 1.12, "large");
    this._minimapDirty = true;
  }

  _revealModeAround(wx, wy, radius, mode) {
    const span = this._getMapSpan(mode);
    const half = span * 0.5;
    const cell = mode === "large" ? 72 : 48;
    const set = mode === "large" ? this._revealedLarge : this._revealedSmall;

    const x0 = Math.floor((wx - radius + half) / cell);
    const x1 = Math.floor((wx + radius + half) / cell);
    const y0 = Math.floor((wy - radius + half) / cell);
    const y1 = Math.floor((wy + radius + half) / cell);

    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const cx = gx * cell - half + cell * 0.5;
        const cy = gy * cell - half + cell * 0.5;
        const dx = cx - wx;
        const dy = cy - wy;
        if (dx * dx + dy * dy <= radius * radius) {
          set.add(`${gx},${gy}`);
        }
      }
    }
  }

  isRevealed(wx, wy, mode = this.mapMode) {
    const span = this._getMapSpan(mode);
    const half = span * 0.5;
    const cell = mode === "large" ? 72 : 48;
    const gx = Math.floor((wx + half) / cell);
    const gy = Math.floor((wy + half) / cell);
    const set = mode === "large" ? this._revealedLarge : this._revealedSmall;
    return set.has(`${gx},${gy}`);
  }

  _getMapSpan(mode = this.mapMode) {
    if (mode === "small") return 5200;
    return this.boundsRadius * 2;
  }

  getGroundType(x, y) {
    return this._sampleTile(x, y);
  }

  getMoveModifier(x, y) {
    const t = this._sampleTile(x, y);
    if (t === "road") return 1.24;
    if (t === "forest") return 0.72;
    if (t === "sand") return 0.90;
    return 1.0;
  }

  canWalk(x, y) {
    if (x < -this.boundsRadius || x > this.boundsRadius) return false;
    if (y < -this.boundsRadius || y > this.boundsRadius) return false;
    return this._sampleTile(x, y