// src/world.js
// v43 BIGGER WORLD + SAME WATER/GRASS LOOK (FULL FILE)
// Goals:
// - keep the GOOD blue water / green grass look
// - make the actual playable world much bigger
// - stop the hero from feeling like they walk into land "outside the map"
// - keep minimap compatible with current ui/game
// - spread POIs farther out so the world has more room

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

    // BIGGER REAL WORLD
    // old safe version was 1280 and felt too small
    this.boundsRadius = 3200;

    this.camps = [];
    this.waystones = [];
    this.docks = [];

    this._chunks = new Map();
    this._buildQueue = [];
    this._queued = new Set();

    this._minimap = null;
    this._minimapDirty = true;
    this._minimapTimer = 0;

    this._poiRng = new RNG(hash2(this.seed, 777));

    this._initPOIs();
    this._queueAround(this.spawn.x, this.spawn.y, 2);
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  update(dt, hero) {
    if (hero) {
      this._queueAround(hero.x, hero.y, 3);
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
    if (this._minimapTimer >= 0.2) {
      this._minimapTimer = 0;
      if (this._minimapDirty) this._renderMinimap();
    }
  }

  getMinimapCanvas() {
    if (!this._minimap || this._minimapDirty) {
      this._renderMinimap();
    }
    return this._minimap;
  }

  canWalk(x, y) {
    if (Math.abs(x) > this.boundsRadius || Math.abs(y) > this.boundsRadius) return false;
    const t = this._sampleTile(x, y);
    return t !== "water";
  }

  draw(ctx, camera) {
    const cx = camera?.x || 0;
    const cy = camera?.y || 0;
    const zoom = camera?.zoom || 1;

    const halfW = (this.viewW * 0.5) / zoom;
    const halfH = (this.viewH * 0.5) / zoom;

    const x0 = cx - halfW - this.tileSize * 2;
    const y0 = cy - halfH - this.tileSize * 2;
    const x1 = cx + halfW + this.tileSize * 2;
    const y1 = cy + halfH + this.tileSize * 2;

    const tx0 = Math.floor(x0 / this.tileSize);
    const ty0 = Math.floor(y0 / this.tileSize);
    const tx1 = Math.ceil(x1 / this.tileSize);
    const ty1 = Math.ceil(y1 / this.tileSize);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const wx = tx * this.tileSize;
        const wy = ty * this.tileSize;
        const tile = this._sampleTile(wx + this.tileSize * 0.5, wy + this.tileSize * 0.5);

        if (tile === "water") {
          // keep the strong blue water
          ctx.fillStyle = "rgba(45,116,196,1)";
        } else if (tile === "sand") {
          ctx.fillStyle = "rgba(203,184,122,1)";
        } else if (tile === "rock") {
          ctx.fillStyle = "rgba(120,129,140,1)";
        } else {
          // keep strong green grass
          ctx.fillStyle = "rgba(76,137,72,1)";
        }

        ctx.fillRect(wx, wy, this.tileSize + 1, this.tileSize + 1);

        if (tile === "grass") {
          const n = hash2(tx, ty, this.seed) >>> 0;
          if (n % 9 === 0) {
            ctx.strokeStyle = "rgba(92,166,84,0.75)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(wx + 10, wy + 21);
            ctx.lineTo(wx + 11, wy + 15);
            ctx.moveTo(wx + 14, wy + 21);
            ctx.lineTo(wx + 13, wy + 14);
            ctx.stroke();
          }
        }

        if (tile === "rock") {
          const n = hash2(tx * 17, ty * 13, this.seed) >>> 0;
          if (n % 5 === 0) {
            ctx.fillStyle = "rgba(98,108,120,0.65)";
            ctx.fillRect(wx + 6, wy + 6, 5, 4);
            ctx.fillRect(wx + 13, wy + 12, 4, 4);
          }
        }
      }
    }

    for (const w of this.waystones) this._drawWaystone(ctx, w);
    for (const d of this.docks) this._drawDock(ctx, d);
    for (const c of this.camps) this._drawCamp(ctx, c);
  }

  _renderMinimap() {
    const size = 168;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    // IMPORTANT:
    // minimap now uses the SAME real world bounds as canWalk()
    // so the player should no longer feel like they are exploring outside the map
    const span = this.boundsRadius * 2;
    const half = span * 0.5;
    const step = span / size;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const wx = -half + px * step;
        const wy = -half + py * step;

        const tile = this._sampleTile(wx, wy);
        const color =
          tile === "water" ? "#2e6fb0" :
          tile === "sand" ? "#ccb87b" :
          tile === "rock" ? "#7d8792" :
          "#4d8b4a";

        ctx.fillStyle = color;
        ctx.fillRect(px, py, 1, 1);
      }
    }

    const plot = (wx, wy, color, r = 2) => {
      const px = ((wx + half) / span) * size;
      const py = ((wy + half) / span) * size;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const w of this.waystones) plot(w.x, w.y, "#f5dc6a", 2.8);
    for (const d of this.docks) plot(d.x, d.y, "#79dbff", 2.5);
    for (const cp of this.camps) plot(cp.x, cp.y, "#ff7b6a", 2.2);

    this._minimap = c;
    this._minimapDirty = false;
  }

  _drawWaystone(ctx, w) {
    ctx.save();
    ctx.fillStyle = "rgba(186,174,116,1)";
    ctx.fillRect(w.x - 8, w.y - 20, 16, 28);
    ctx.fillStyle = "rgba(245,226,138,0.8)";
    ctx.fillRect(w.x - 4, w.y - 16, 8, 14);
    ctx.restore();
  }

  _drawDock(ctx, d) {
    ctx.save();
    ctx.fillStyle = "rgba(118,88,52,1)";
    ctx.fillRect(d.x - 20, d.y - 6, 40, 12);
    ctx.fillRect(d.x - 16, d.y + 4, 5, 14);
    ctx.fillRect(d.x + 11, d.y + 4, 5, 14);
    ctx.restore();
  }

  _drawCamp(ctx, c) {
    ctx.save();
    ctx.fillStyle = "rgba(118,68,52,1)";
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 18);
    ctx.lineTo(c.x + 18, c.y + 12);
    ctx.lineTo(c.x - 18, c.y + 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,188,118,0.85)";
    ctx.beginPath();
    ctx.arc(c.x, c.y + 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _sampleTile(x, y) {
    const d = Math.hypot(x, y);
    if (d > this.boundsRadius) return "water";

    const n1 = fbm((x + this.seed * 0.13) * 0.0017, (y - this.seed * 0.09) * 0.0017, 4);
    const n2 = fbm((x - this.seed * 0.07) * 0.0035, (y + this.seed * 0.11) * 0.0035, 3);
    const n3 = fbm((x + this.seed * 0.03) * 0.0075, (y + this.seed * 0.05) * 0.0075, 2);

    // Keep terrain balance close to the old safe version:
    // plenty of green land, visible blue water, shoreline sand, some rock
    const land = n1 * 0.72 + n2 * 0.22 - d / (this.boundsRadius * 2.45);

    if (land < -0.10) return "water";
    if (land < -0.03) return "sand";
    if (n3 > 0.38) return "rock";
    return "grass";
  }

  _chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  _queueAround(wx, wy, radiusChunks = 2) {
    const ccx = Math.floor(wx / this.chunkSize);
    const ccy = Math.floor(wy / this.chunkSize);

    for (let cy = ccy - radiusChunks; cy <= ccy + radiusChunks; cy++) {
      for (let cx = ccx - radiusChunks; cx <= ccx + radiusChunks; cx++) {
        const key = this._chunkKey(cx, cy);
        if (this._chunks.has(key) || this._queued.has(key)) continue;
        this._queued.add(key);
        this._buildQueue.push(key);
      }
    }
  }

  _buildChunk(cx, cy) {
    const key = this._chunkKey(cx, cy);
    this._chunks.set(key, { cx, cy });
  }

  _initPOIs() {
    this.spawn = this._findGoodSpawn();

    let wid = 1;

    // spread waystones much farther out
    const waystoneRings = [520, 980, 1480, 2100, 2700];
    for (let ringIndex = 0; ringIndex < waystoneRings.length; ringIndex++) {
      const ring = waystoneRings[ringIndex];
      const count = 4 + ringIndex;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ringIndex * 0.19;
        const x = Math.round(Math.cos(a) * ring);
        const y = Math.round(Math.sin(a) * ring);
        const p = this._findNearbyLand(x, y, 220);
        if (p) this.waystones.push({ id: wid++, x: p.x, y: p.y });
      }
    }

    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.31;
      const r = 1000 + (i % 4) * 520;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const p = this._findNearbyShore(x, y, 260);
      if (p) this.docks.push({ id: i + 1, x: p.x, y: p.y });
    }

    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.17;
      const r = 760 + (i % 6) * 380;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const p = this._findNearbyLand(x, y, 260);
      if (p) {
        this.camps.push({ id: i + 1, x: p.x, y: p.y, tier: 1 + (i % 5) });
      }
    }
  }

  _findGoodSpawn() {
    for (let r = 0; r <= 320; r += 24) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (this._sampleTile(x, y) === "grass") return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  _findNearbyLand(x, y, maxR = 180) {
    for (let r = 0; r <= maxR; r += 16) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);
        if (t === "grass" || t === "rock" || t === "sand") {
          return { x: px, y: py };
        }
      }
    }
    return null;
  }

  _findNearbyShore(x, y, maxR = 180) {
    for (let r = 0; r <= maxR; r += 16) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);
        if (t === "sand") return { x: px, y: py };
      }
    }
    return this._findNearbyLand(x, y, maxR);
  }
}