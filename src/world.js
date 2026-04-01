// src/world.js
// v45 CENTERED MINIMAP + TRUE LARGE MAP (FULL FILE)

import { hash2, fbm, RNG } from "./util.js";

export default class World {
  constructor(seed = 12345, opts = {}) {
    this.seed = (seed | 0) || 12345;

    this.tileSize = opts.tileSize || 24;
    this.chunkTiles = opts.chunkTiles || 32;
    this.chunkSize = this.tileSize * this.chunkTiles;

    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.spawn = { x: 0, y: 0 };

    // Real playable world half-size
    this.boundsRadius = 4600;

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

    this.mapMode = "small"; // "small" | "large"

    this._revealedSmall = new Set();
    this._revealedLarge = new Set();

    this._poiRng = new RNG(hash2(this.seed, 777));

    this._initPOIs();

    this.revealAround(this.spawn.x, this.spawn.y, 260);
    this._queueAround(this.spawn.x, this.spawn.y, 3);
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  update(dt, hero) {
    if (hero) {
      this._queueAround(hero.x, hero.y, 3);
      this.revealAround(hero.x, hero.y, 230);
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
    if (!this._minimap || this._minimapDirty) {
      this._renderMinimap();
    }
    return this._minimap;
  }

  canWalk(x, y) {
    if (x < -this.boundsRadius || x > this.boundsRadius) return false;
    if (y < -this.boundsRadius || y > this.boundsRadius) return false;

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
          ctx.fillStyle = "rgba(45,116,196,1)";
        } else if (tile === "sand") {
          ctx.fillStyle = "rgba(203,184,122,1)";
        } else if (tile === "rock") {
          ctx.fillStyle = "rgba(120,129,140,1)";
        } else {
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

          if (n % 41 === 0) {
            ctx.fillStyle = "rgba(70,124,60,0.36)";
            ctx.fillRect(wx + 5, wy + 6, 8, 5);
            ctx.fillRect(wx + 13, wy + 13, 6, 4);
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

        if (tile === "sand") {
          const n = hash2(tx * 9, ty * 7, this.seed) >>> 0;
          if (n % 8 === 0) {
            ctx.fillStyle = "rgba(216,198,138,0.45)";
            ctx.fillRect(wx + 7, wy + 8, 4, 3);
            ctx.fillRect(wx + 14, wy + 14, 3, 2);
          }
        }
      }
    }

    for (const w of this.waystones) this._drawWaystone(ctx, w);
    for (const d of this.docks) this._drawDock(ctx, d);
    for (const c of this.camps) this._drawCamp(ctx, c);
    for (const dg of this.dungeons) this._drawDungeonEntrance(ctx, dg);
  }

  revealAround(wx, wy, radius = 220) {
    this._revealModeAround(wx, wy, radius, "small");
    this._revealModeAround(wx, wy, radius * 1.15, "large");
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
    // Small should still feel useful, but large MUST cover the whole world.
    if (mode === "small") return 4200;
    return this.boundsRadius * 2;
  }

  _renderMinimap() {
    const size = 168;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    const mode = this.mapMode;
    const span = this._getMapSpan(mode);
    const half = span * 0.5;
    const step = span / size;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const wx = -half + px * step;
        const wy = -half + py * step;

        let color;
        if (!this.isRevealed(wx, wy, mode)) {
          color = "#0d1117";
        } else {
          const tile = this._sampleTile(wx, wy);
          color =
            tile === "water" ? "#2e6fb0" :
            tile === "sand" ? "#ccb87b" :
            tile === "rock" ? "#7d8792" :
            "#4d8b4a";
        }

        ctx.fillStyle = color;
        ctx.fillRect(px, py, 1, 1);
      }
    }

    const plot = (wx, wy, color, r = 2) => {
      if (!this.isRevealed(wx, wy, mode)) return;
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
    for (const dg of this.dungeons) plot(dg.x, dg.y, "#b68cff", 3);

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

  _drawDungeonEntrance(ctx, d) {
    ctx.save();
    ctx.fillStyle = "rgba(74,54,102,1)";
    ctx.fillRect(d.x - 18, d.y - 20, 36, 30);
    ctx.fillStyle = "rgba(22,18,34,1)";
    ctx.fillRect(d.x - 10, d.y - 6, 20, 16);
    ctx.fillStyle = "rgba(184,148,255,0.9)";
    ctx.fillRect(d.x - 4, d.y - 14, 8, 5);
    ctx.restore();
  }

  _sampleTile(x, y) {
    if (x < -this.boundsRadius || x > this.boundsRadius) return "water";
    if (y < -this.boundsRadius || y > this.boundsRadius) return "water";

    const largeA = fbm((x + this.seed * 0.11) * 0.00075, (y - this.seed * 0.07) * 0.00075, 4);
    const largeB = fbm((x - this.seed * 0.05) * 0.00135, (y + this.seed * 0.09) * 0.00135, 4);
    const med = fbm((x + this.seed * 0.03) * 0.0035, (y + this.seed * 0.04) * 0.0035, 3);
    const rockN = fbm((x - this.seed * 0.02) * 0.0075, (y + this.seed * 0.05) * 0.0075, 2);

    const edgeX = Math.abs(x) / this.boundsRadius;
    const edgeY = Math.abs(y) / this.boundsRadius;
    const edgePenalty = Math.max(edgeX, edgeY) * 0.22;

    const land = largeA * 0.60 + largeB * 0.28 + med * 0.18 - edgePenalty;

    if (land < -0.20) return "water";
    if (land < -0.08) return "sand";
    if (rockN > 0.42 && land > -0.01) return "rock";
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

    const waystoneRings = [520, 1100, 1750, 2400, 3100, 3800];
    for (let ringIndex = 0; ringIndex < waystoneRings.length; ringIndex++) {
      const ring = waystoneRings[ringIndex];
      const count = 4 + ringIndex;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ringIndex * 0.17;
        const x = Math.round(Math.cos(a) * ring);
        const y = Math.round(Math.sin(a) * ring);
        const p = this._findNearbyLand(x, y, 260);
        if (p) this.waystones.push({ id: wid++, x: p.x, y: p.y });
      }
    }

    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.31;
      const r = 1200 + (i % 5) * 540;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const p = this._findNearbyShore(x, y, 280);
      if (p) this.docks.push({ id: i + 1, x: p.x, y: p.y });
    }

    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + 0.13;
      const r = 850 + (i % 7) * 470;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const p = this._findNearbyLand(x, y, 280);
      if (p) {
        this.camps.push({
          id: i + 1,
          x: p.x,
          y: p.y,
          tier: 1 + (i % 5),
        });
      }
    }

    const dg = this._findNearbyLand(this.spawn.x + 360, this.spawn.y + 180, 260) || {
      x: this.spawn.x + 320,
      y: this.spawn.y + 180,
    };
    this.dungeons.push({ id: 1, x: dg.x, y: dg.y, name: "Deep Ruin" });
  }

  _findGoodSpawn() {
    for (let r = 0; r <= 420; r += 24) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (this._sampleTile(x, y) === "grass") {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  _findNearbyLand(x, y, maxR = 220) {
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

  _findNearbyShore(x, y, maxR = 220) {
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