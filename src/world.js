// src/world.js
// v42 SAFE MINIMAP READABILITY PASS
// Keeps the known-good blue water + shoreline + grass + rock + sand + POI baseline intact.
// Adds better minimap readability without touching the safe water path.

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
    this.boundsRadius = 1280;

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

  getTileSize() {
    return this.tileSize;
  }

  worldToTile(x, y) {
    return {
      tx: Math.floor(x / this.tileSize),
      ty: Math.floor(y / this.tileSize),
    };
  }

  tileToWorld(tx, ty) {
    return {
      x: tx * this.tileSize,
      y: ty * this.tileSize,
    };
  }

  getTile(tx, ty) {
    const x = (tx + 0.5) * this.tileSize;
    const y = (ty + 0.5) * this.tileSize;
    const t = this._terrainN(x, y);
    const biome = this._biomeFromT(t);
    return {
      biome,
      water: biome === "water",
      solid: biome === "rock",
      col: this._tileColorFor(biome, t, x, y),
      t,
    };
  }

  getTileAt(x, y) {
    const t = this._terrainN(x, y);
    const biome = this._biomeFromT(t);
    return {
      biome,
      water: biome === "water",
      solid: biome === "rock",
      col: this._tileColorFor(biome, t, x, y),
      t,
    };
  }

  canWalk(x, y) {
    const t = this._terrainN(x, y);
    return t >= 0.34 && t <= 0.83;
  }

  isWater(x, y) {
    return this._terrainN(x, y) < 0.34;
  }

  isSolid(x, y) {
    return this._terrainN(x, y) > 0.83;
  }

  clampPointToBounds(x, y, pad = 16) {
    const dx = x - this.spawn.x;
    const dy = y - this.spawn.y;
    const r = this.boundsRadius - pad;
    const d2 = dx * dx + dy * dy;

    if (d2 <= r * r) return { x, y };

    const d = Math.sqrt(d2) || 1;
    const k = r / d;

    return {
      x: this.spawn.x + dx * k,
      y: this.spawn.y + dy * k,
    };
  }

  update(dt, hero) {
    if (hero && Number.isFinite(hero.x) && Number.isFinite(hero.y)) {
      this._queueAround(hero.x, hero.y, 2);
    }

    this._buildSome(2.0);

    if (this._minimapDirty) {
      this._minimapTimer += dt;
      if (this._minimapTimer >= 0.35) {
        this._minimapTimer = 0;
        this._rebuildMinimap();
      }
    }
  }

  draw(ctx, cam) {
    const view = this._normalizeCam(cam);

    const minCX = Math.floor(view.x0 / this.chunkSize) - 1;
    const maxCX = Math.floor(view.x1 / this.chunkSize) + 1;
    const minCY = Math.floor(view.y0 / this.chunkSize) - 1;
    const maxCY = Math.floor(view.y1 / this.chunkSize) + 1;

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        this._ensureChunk(cx, cy);
        const key = `${cx},${cy}`;
        const ch = this._chunks.get(key);
        if (!ch || !ch.canvas) continue;

        const px = cx * this.chunkSize;
        const py = cy * this.chunkSize;
        ctx.drawImage(ch.canvas, px, py);
      }
    }

    this._drawAnimatedWaterOverlay(ctx, view);
    this._drawBoundsHint(ctx);
    this._drawPOIs(ctx);
  }

  getMinimapCanvas() {
    if (!this._minimap) this._rebuildMinimap();
    return this._minimap;
  }

  /* ===========================
     Chunking
  =========================== */

  _queueAround(x, y, rChunks = 2) {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);

    for (let yy = cy - rChunks; yy <= cy + rChunks; yy++) {
      for (let xx = cx - rChunks; xx <= cx + rChunks; xx++) {
        const key = `${xx},${yy}`;
        if (this._chunks.has(key) || this._queued.has(key)) continue;
        this._queued.add(key);
        this._buildQueue.push({ cx: xx, cy: yy });
      }
    }
  }

  _buildSome(msBudget = 2.0) {
    const t0 = performance.now();
    while (this._buildQueue.length) {
      const job = this._buildQueue.shift();
      this._queued.delete(`${job.cx},${job.cy}`);
      this._buildChunk(job.cx, job.cy);
      if (performance.now() - t0 >= msBudget) break;
    }
  }

  _ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this._chunks.has(key) || this._queued.has(key)) return;
    this._queued.add(key);
    this._buildQueue.push({ cx, cy });
    this._buildSome(4.0);
  }

  _buildChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this._chunks.has(key)) return this._chunks.get(key);

    const canvas = document.createElement("canvas");
    canvas.width = this.chunkSize;
    canvas.height = this.chunkSize;
    const c = canvas.getContext("2d");

    const baseX = cx * this.chunkTiles;
    const baseY = cy * this.chunkTiles;

    for (let ty = 0; ty < this.chunkTiles; ty++) {
      for (let tx = 0; tx < this.chunkTiles; tx++) {
        const wx = (baseX + tx) * this.tileSize;
        const wy = (baseY + ty) * this.tileSize;
        const x = wx + this.tileSize * 0.5;
        const y = wy + this.tileSize * 0.5;

        const t = this._terrainN(x, y);
        const biome = this._biomeFromT(t);
        const col = this._tileColorFor(biome, t, x, y);

        const px = tx * this.tileSize;
        const py = ty * this.tileSize;

        c.fillStyle = rgb(col[0], col[1], col[2]);
        c.fillRect(px, py, this.tileSize, this.tileSize);

        this._drawShoreEdge(c, px, py, x, y, biome);
        this._drawRockEdgeShade(c, px, py, x, y, biome);
        this._drawTileDecor(c, px, py, biome, x, y, t);
      }
    }

    const ch = { cx, cy, canvas };
    this._chunks.set(key, ch);
    this._minimapDirty = true;
    return ch;
  }

  /* ===========================
     Rendering helpers
  =========================== */

  _normalizeCam(cam) {
    if (!cam) {
      return {
        x0: -this.viewW * 0.5,
        y0: -this.viewH * 0.5,
        x1: this.viewW * 0.5,
        y1: this.viewH * 0.5,
      };
    }

    const z = cam.zoom || 1;
    const halfW = this.viewW * 0.5 / z;
    const halfH = this.viewH * 0.5 / z;

    return {
      x0: cam.x - halfW,
      y0: cam.y - halfH,
      x1: cam.x + halfW,
      y1: cam.y + halfH,
    };
  }

  _drawBoundsHint(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(120,180,255,0.14)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(this.spawn.x, this.spawn.y, this.boundsRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawPOIs(ctx) {
    for (const camp of this.camps) this._drawCamp(ctx, camp);
    for (const ws of this.waystones) this._drawWaystone(ctx, ws);
    for (const dock of this.docks) this._drawDock(ctx, dock);
  }

  _drawPOIShadow(ctx, x, y, rx, ry, alpha = 0.16) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawCamp(ctx, camp) {
    ctx.save();

    this._drawPOIShadow(ctx, camp.x + 2, camp.y + 16, 26, 11, 0.18);

    ctx.strokeStyle = "rgba(118,76,48,0.28)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(camp.x, camp.y + 6, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(128,82,54,0.98)";
    ctx.fillRect(camp.x - 18, camp.y - 10, 36, 20);

    ctx.fillStyle = "rgba(204,142,94,0.98)";
    ctx.beginPath();
    ctx.moveTo(camp.x - 21, camp.y - 10);
    ctx.lineTo(camp.x, camp.y - 24);
    ctx.lineTo(camp.x + 21, camp.y - 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,236,210,0.18)";
    ctx.fillRect(camp.x - 14, camp.y - 7, 28, 2);

    ctx.fillStyle = "rgba(88,58,38,0.95)";
    ctx.fillRect(camp.x - 5, camp.y - 1, 10, 11);

    ctx.fillStyle = "rgba(255,172,88,0.95)";
    ctx.beginPath();
    ctx.arc(camp.x + 22, camp.y + 11, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,214,130,0.34)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(camp.x + 22, camp.y + 11, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawWaystone(ctx, ws) {
    ctx.save();

    this._drawPOIShadow(ctx, ws.x + 1, ws.y + 15, 14, 8, 0.15);

    ctx.fillStyle = "rgba(102,112,142,0.98)";
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y - 26);
    ctx.lineTo(ws.x + 13, ws.y - 6);
    ctx.lineTo(ws.x + 10, ws.y + 22);
    ctx.lineTo(ws.x - 10, ws.y + 22);
    ctx.lineTo(ws.x - 13, ws.y - 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(166,210,255,0.24)";
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y - 21);
    ctx.lineTo(ws.x + 6, ws.y - 6);
    ctx.lineTo(ws.x + 4, ws.y + 15);
    ctx.lineTo(ws.x - 4, ws.y + 15);
    ctx.lineTo(ws.x - 6, ws.y - 6);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(188,232,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ws.x, ws.y - 26);
    ctx.lineTo(ws.x + 13, ws.y - 6);
    ctx.lineTo(ws.x + 10, ws.y + 22);
    ctx.lineTo(ws.x - 10, ws.y + 22);
    ctx.lineTo(ws.x - 13, ws.y - 6);
    ctx.closePath();
    ctx.stroke();

    const glow = 0.10 + 0.03 * Math.sin(performance.now() * 0.004 + ws.x * 0.01);
    ctx.fillStyle = `rgba(160,220,255,${glow.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(ws.x, ws.y - 4, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawDock(ctx, dock) {
    ctx.save();

    this._drawPOIShadow(ctx, dock.x + 2, dock.y + 14, 34, 10, 0.16);

    ctx.fillStyle = "rgba(112,80,52,0.98)";
    ctx.fillRect(dock.x - 42, dock.y - 8, 84, 16);

    ctx.fillStyle = "rgba(164,122,86,0.22)";
    ctx.fillRect(dock.x - 42, dock.y - 8, 84, 2);

    for (let i = -34; i <= 34; i += 17) {
      ctx.fillStyle = "rgba(86,60,38,0.98)";
      ctx.fillRect(dock.x + i, dock.y + 8, 6, 12);
    }

    ctx.strokeStyle = "rgba(214,178,126,0.30)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(dock.x - 36, dock.y - 5);
    ctx.lineTo(dock.x + 36, dock.y - 5);
    ctx.moveTo(dock.x - 36, dock.y + 5);
    ctx.lineTo(dock.x + 36, dock.y + 5);
    ctx.stroke();

    ctx.fillStyle = "rgba(82,56,36,0.96)";
    ctx.fillRect(dock.x + 42, dock.y - 16, 3, 12);

    ctx.fillStyle = "rgba(212,66,52,0.96)";
    ctx.beginPath();
    ctx.moveTo(dock.x + 45, dock.y - 16);
    ctx.lineTo(dock.x + 53, dock.y - 13);
    ctx.lineTo(dock.x + 45, dock.y - 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawShoreEdge(ctx, px, py, x, y, biome) {
    const ts = this.tileSize;
    const up = this._biomeFromT(this._terrainN(x, y - ts));
    const down = this._biomeFromT(this._terrainN(x, y + ts));
    const left = this._biomeFromT(this._terrainN(x - ts, y));
    const right = this._biomeFromT(this._terrainN(x + ts, y));

    ctx.save();

    if (biome === "water") {
      ctx.fillStyle = "rgba(180,230,255,0.10)";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;

      if (up !== "water") {
        ctx.fillRect(px, py, ts, 4);
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 3);
        ctx.lineTo(px + ts - 2, py + 3);
        ctx.stroke();
      }
      if (down !== "water") {
        ctx.fillRect(px, py + ts - 4, ts, 4);
        ctx.beginPath();
        ctx.moveTo(px + 2, py + ts - 3);
        ctx.lineTo(px + ts - 2, py + ts - 3);
        ctx.stroke();
      }
      if (left !== "water") {
        ctx.fillRect(px, py, 4, ts);
      }
      if (right !== "water") {
        ctx.fillRect(px + ts - 4, py, 4, ts);
      }
    }

    if (biome === "sand") {
      ctx.fillStyle = "rgba(255,244,210,0.08)";
      if (up === "water") ctx.fillRect(px, py, ts, 3);
      if (down === "water") ctx.fillRect(px, py + ts - 3, ts, 3);
      if (left === "water") ctx.fillRect(px, py, 3, ts);
      if (right === "water") ctx.fillRect(px + ts - 3, py, 3, ts);
    }

    ctx.restore();
  }

  _drawRockEdgeShade(ctx, px, py, x, y, biome) {
    if (biome !== "rock") return;

    const ts = this.tileSize;
    const up = this._biomeFromT(this._terrainN(x, y - ts));
    const down = this._biomeFromT(this._terrainN(x, y + ts));
    const left = this._biomeFromT(this._terrainN(x - ts, y));
    const right = this._biomeFromT(this._terrainN(x + ts, y));

    ctx.save();

    if (up !== "rock") {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(px, py, ts, 3);
    }
    if (left !== "rock") {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(px, py, 3, ts);
    }
    if (down !== "rock") {
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.fillRect(px, py + ts - 4, ts, 4);
    }
    if (right !== "rock") {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(px + ts - 4, py, 4, ts);
    }

    ctx.restore();
  }

  _drawTileDecor(ctx, px, py, biome, x, y, t) {
    if (biome === "grass") {
      const n = hash2((x / this.tileSize) | 0, (y / this.tileSize) | 0, this.seed);
      const gv = this._grassVariant(x, y);

      if ((n & 7) === 0) this._drawGrassTuft(ctx, px, py, n, gv);
      if ((n & 31) === 2) this._drawPebble(ctx, px, py, n);
      if (gv > 0.68 && (n & 31) === 9) this._drawFlower(ctx, px, py, n);
      if (gv < 0.30 && (n & 15) === 5) this._drawDryTuft(ctx, px, py, n);
    } else if (biome === "sand") {
      const n = hash2((x / this.tileSize) | 0, (y / this.tileSize) | 0, this.seed ^ 88);
      const sv = this._sandVariant(x, y);

      if ((n & 15) === 1) this._drawPebble(ctx, px, py, n);
      if (sv > 0.58 && (n & 31) === 4) this._drawSandStreak(ctx, px, py, n);
      if (sv > 0.68 && (n & 31) === 12) this._drawShell(ctx, px, py, n);
      if (sv < 0.30 && (n & 63) === 9) this._drawDriftMark(ctx, px, py, n);
    } else if (biome === "water") {
      const n = hash2((x / this.tileSize) | 0, (y / this.tileSize) | 0, this.seed ^ 222);
      if ((n & 3) === 0) this._drawRipple(ctx, px, py, n, t);
    } else if (biome === "rock") {
      const n = hash2((x / this.tileSize) | 0, (y / this.tileSize) | 0, this.seed ^ 444);
      const rv = this._rockVariant(x, y);

      if ((n & 7) <= 1) this._drawCrack(ctx, px, py, n, rv);
      if ((n & 15) === 5) this._drawRockSpeck(ctx, px, py, n, rv);
      if (rv > 0.64 && (n & 31) === 9) this._drawSmallStone(ctx, px, py, n);
    }
  }

  _drawGrassTuft(ctx, px, py, n, gv = 0.5) {
    const ox = 4 + (n % 14);
    const oy = 9 + ((n >> 4) % 8);
    const lush = gv > 0.62;

    ctx.save();
    ctx.strokeStyle = lush ? "rgba(34,110,44,0.58)" : "rgba(40,94,42,0.50)";
    ctx.lineWidth = lush ? 1.35 : 1.25;
    ctx.beginPath();
    ctx.moveTo(px + ox, py + oy + 7);
    ctx.lineTo(px + ox - 2, py + oy);
    ctx.moveTo(px + ox, py + oy + 7);
    ctx.lineTo(px + ox + 1, py + oy - 1);
    ctx.moveTo(px + ox, py + oy + 7);
    ctx.lineTo(px + ox + 3, py + oy + 1);
    if (lush) {
      ctx.moveTo(px + ox + 1, py + oy + 7);
      ctx.lineTo(px + ox + 5, py + oy + 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawDryTuft(ctx, px, py, n) {
    const ox = 5 + (n % 12);
    const oy = 10 + ((n >> 3) % 7);

    ctx.save();
    ctx.strokeStyle = "rgba(146,132,74,0.42)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(px + ox, py + oy + 5);
    ctx.lineTo(px + ox - 2, py + oy + 1);
    ctx.moveTo(px + ox, py + oy + 5);
    ctx.lineTo(px + ox + 2, py + oy);
    ctx.stroke();
    ctx.restore();
  }

  _drawFlower(ctx, px, py, n) {
    const ox = 6 + (n % 10);
    const oy = 7 + ((n >> 4) % 10);

    ctx.save();
    ctx.fillStyle = "rgba(255,238,120,0.82)";
    ctx.beginPath();
    ctx.arc(px + ox, py + oy, 1.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.beginPath();
    ctx.arc(px + ox - 1.5, py + oy, 1, 0, Math.PI * 2);
    ctx.arc(px + ox + 1.5, py + oy, 1, 0, Math.PI * 2);
    ctx.arc(px + ox, py + oy - 1.5, 1, 0, Math.PI * 2);
    ctx.arc(px + ox, py + oy + 1.5, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawPebble(ctx, px, py, n) {
    const ox = 5 + (n % 12);
    const oy = 5 + ((n >> 3) % 12);
    const r = 1 + ((n >> 6) % 2);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(px + ox, py + oy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.arc(px + ox + 1, py + oy + 1, Math.max(1, r - 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawSandStreak(ctx, px, py, n) {
    const ox = 3 + (n % 12);
    const oy = 6 + ((n >> 4) % 10);

    ctx.save();
    ctx.strokeStyle = "rgba(255,241,198,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + ox - 2, py + oy);
    ctx.lineTo(px + ox + 4, py + oy + 1);
    ctx.stroke();
    ctx.restore();
  }

  _drawShell(ctx, px, py, n) {
    const ox = 6 + (n % 10);
    const oy = 7 + ((n >> 4) % 10);

    ctx.save();
    ctx.fillStyle = "rgba(245,236,215,0.82)";
    ctx.beginPath();
    ctx.ellipse(px + ox, py + oy, 2.4, 1.7, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(196,170,144,0.22)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px + ox - 1.4, py + oy);
    ctx.lineTo(px + ox + 1.4, py + oy);
    ctx.stroke();
    ctx.restore();
  }

  _drawDriftMark(ctx, px, py, n) {
    const ox = 4 + (n % 12);
    const oy = 11 + ((n >> 5) % 6);

    ctx.save();
    ctx.strokeStyle = "rgba(154,128,92,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + ox - 2, py + oy);
    ctx.lineTo(px + ox + 3, py + oy + 1);
    ctx.stroke();
    ctx.restore();
  }

  _drawRipple(ctx, px, py, n) {
    const ox = 6 + (n % 12);
    const oy = 6 + ((n >> 4) % 12);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + ox, py + oy, 3 + ((n >> 7) % 3), 0, Math.PI * 1.7);
    ctx.stroke();
    ctx.restore();
  }

  _drawCrack(ctx, px, py, n, rv = 0.5) {
    const x0 = px + 4 + (n % 8);
    const y0 = py + 5 + ((n >> 4) % 8);
    const alpha = 0.12 + rv * 0.06;

    ctx.save();
    ctx.strokeStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + 4, y0 + 2);
    ctx.lineTo(x0 + 8, y0 - 1);
    if (rv > 0.60) {
      ctx.moveTo(x0 + 4, y0 + 2);
      ctx.lineTo(x0 + 6, y0 + 5);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawRockSpeck(ctx, px, py, n, rv) {
    const ox = 4 + (n % 14);
    const oy = 4 + ((n >> 5) % 14);

    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${(0.04 + rv * 0.05).toFixed(3)})`;
    ctx.fillRect(px + ox, py + oy, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(px + ox + 1, py + oy + 1, 1, 1);
    ctx.restore();
  }

  _drawSmallStone(ctx, px, py, n) {
    const ox = 6 + (n % 8);
    const oy = 8 + ((n >> 4) % 7);

    ctx.save();
    ctx.fillStyle = "rgba(148,154,162,0.72)";
    ctx.beginPath();
    ctx.ellipse(px + ox, py + oy, 3, 2, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.ellipse(px + ox - 1, py + oy - 1, 2, 1, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.ellipse(px + ox + 1, py + oy + 1, 2.4, 1.4, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawAnimatedWaterOverlay(ctx, view) {
    const time = performance.now() * 0.0014;
    const startTX = Math.floor(view.x0 / this.tileSize) - 1;
    const endTX = Math.floor(view.x1 / this.tileSize) + 1;
    const startTY = Math.floor(view.y0 / this.tileSize) - 1;
    const endTY = Math.floor(view.y1 / this.tileSize) + 1;

    ctx.save();

    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        const wx = tx * this.tileSize + this.tileSize * 0.5;
        const wy = ty * this.tileSize + this.tileSize * 0.5;
        const t = this._terrainN(wx, wy);
        if (t >= 0.34) continue;

        const n = hash2(tx, ty, this.seed ^ 9123);
        const px = tx * this.tileSize;
        const py = ty * this.tileSize;

        const shimmer =
          0.022 +
          0.018 * Math.sin(time * 2.7 + tx * 0.55 + ty * 0.31 + (n & 7));

        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, shimmer).toFixed(3)})`;
        ctx.fillRect(px, py, this.tileSize, this.tileSize);

        if ((n & 3) === 0) {
          const ox = 5 + (n % 12);
          const oy = 6 + ((n >> 4) % 10);
          const drift = Math.sin(time * 3.2 + (n & 15)) * 1.8;
          const r = 3 + ((n >> 7) % 3);

          ctx.strokeStyle = `rgba(255,255,255,${
            0.10 + 0.08 * Math.sin(time * 2.4 + (n & 31))
          })`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px + ox + drift, py + oy, r, 0, Math.PI * 1.65);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  /* ===========================
     World / POI generation
  =========================== */

  _initPOIs() {
    const ringR = 560;
    const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const x = this.spawn.x + Math.cos(a) * ringR;
      const y = this.spawn.y + Math.sin(a) * ringR;
      const p = this._findNearbyLand(x, y, 220);
      this.waystones.push({
        id: `ws_${i}`,
        x: p.x,
        y: p.y,
      });
    }

    const campAngles = [
      Math.PI * 0.2,
      Math.PI * 0.72,
      Math.PI * 1.24,
      Math.PI * 1.72,
    ];
    for (let i = 0; i < campAngles.length; i++) {
      const a = campAngles[i];
      const x = this.spawn.x + Math.cos(a) * 860;
      const y = this.spawn.y + Math.sin(a) * 860;
      const p = this._findNearbyLand(x, y, 260);
      this.camps.push({
        id: `camp_${i}`,
        x: p.x,
        y: p.y,
        r: 120,
      });
    }

    const dockAngles = [Math.PI * 0.12, Math.PI * 1.12];
    for (let i = 0; i < dockAngles.length; i++) {
      const a = dockAngles[i];
      const x = this.spawn.x + Math.cos(a) * 720;
      const y = this.spawn.y + Math.sin(a) * 720;
      const p = this._findShoreline(x, y, 300);
      this.docks.push({
        id: `dock_${i}`,
        x: p.x,
        y: p.y,
      });
    }

    const sp = this._findNearbyLand(0, 0, 400);
    this.spawn.x = sp.x;
    this.spawn.y = sp.y;
  }

  _findNearbyLand(x, y, maxR = 260) {
    if (this.canWalk(x, y)) return { x, y };

    for (let r = this.tileSize; r <= maxR; r += this.tileSize) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this.canWalk(px, py)) return { x: px, y: py };
      }
    }

    return { x, y };
  }

  _findShoreline(x, y, maxR = 300) {
    for (let r = this.tileSize; r <= maxR; r += this.tileSize) {
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;

        if (!this.canWalk(px, py)) continue;

        const offsets = [
          [this.tileSize, 0],
          [-this.tileSize, 0],
          [0, this.tileSize],
          [0, -this.tileSize],
        ];

        for (const [ox, oy] of offsets) {
          if (this.isWater(px + ox, py + oy)) {
            return { x: px, y: py };
          }
        }
      }
    }

    return this._findNearbyLand(x, y, maxR);
  }

  /* ===========================
     Minimap
  =========================== */

  _rebuildMinimap() {
    const size = 220;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");

    g.fillStyle = "rgba(8,12,16,0.98)";
    g.fillRect(0, 0, size, size);

    const half = this.boundsRadius;
    const worldSize = half * 2;
    const step = worldSize / size;

    for (let py = 2; py < size - 2; py++) {
      for (let px = 2; px < size - 2; px++) {
        const wx = this.spawn.x - half + px * step;
        const wy = this.spawn.y - half + py * step;
        const t = this._terrainN(wx, wy);
        const biome = this._biomeFromT(t);
        const col = this._miniColorFor(biome, t, wx, wy);
        g.fillStyle = rgb(col[0], col[1], col[2]);
        g.fillRect(px, py, 1, 1);
      }
    }

    for (const camp of this.camps) {
      const p = this._worldToMini(camp.x, camp.y, size);
      this._drawMiniDot(g, p.x, p.y, "rgba(255,132,96,0.98)", "rgba(60,18,12,0.90)");
    }

    for (const ws of this.waystones) {
      const p = this._worldToMini(ws.x, ws.y, size);
      this._drawMiniDot(g, p.x, p.y, "rgba(166,226,255,0.98)", "rgba(18,38,52,0.90)");
    }

    for (const dock of this.docks) {
      const p = this._worldToMini(dock.x, dock.y, size);
      this._drawMiniDot(g, p.x, p.y, "rgba(236,210,126,0.98)", "rgba(60,44,18,0.90)");
    }

    const sp = this._worldToMini(this.spawn.x, this.spawn.y, size);
    this._drawMiniDot(g, sp.x, sp.y, "rgba(255,255,255,0.98)", "rgba(30,30,30,0.92)", 2);

    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);

    g.strokeStyle = "rgba(120,180,255,0.18)";
    g.lineWidth = 1;
    g.strokeRect(3, 3, size - 6, size - 6);

    this._minimap = c;
    this._minimapDirty = false;
    this._minimapTimer = 0;
  }

  _drawMiniDot(g, x, y, fill, stroke, r = 1.5) {
    if (x < 3 || y < 3 || x > g.canvas.width - 4 || y > g.canvas.height - 4) return;

    g.fillStyle = stroke;
    g.fillRect(x - 2, y - 2, 5, 5);

    g.fillStyle = fill;
    g.fillRect(x - r, y - r, r * 2 + 1, r * 2 + 1);
  }

  _worldToMini(x, y, size) {
    const half = this.boundsRadius;
    const nx = clamp((x - (this.spawn.x - half)) / (half * 2), 0, 1);
    const ny = clamp((y - (this.spawn.y - half)) / (half * 2), 0, 1);
    return {
      x: (nx * (size - 1)) | 0,
      y: (ny * (size - 1)) | 0,
    };
  }

  /* ===========================
     Terrain
  =========================== */

  _terrainN(x, y) {
    const s = 0.00135;
    const n1 = fbm(x * s, y * s, 4, 2, 0.5, this.seed);
    const n2 = fbm(
      (x + 999) * s * 2.1,
      (y - 777) * s * 2.1,
      3,
      2,
      0.55,
      this.seed ^ 1234
    );
    const radial = 1 - clamp(
      Math.hypot(x - this.spawn.x, y - this.spawn.y) / (this.boundsRadius * 1.18),
      0,
      1
    );
    const t = clamp(n1 * 0.64 + n2 * 0.16 + radial * 0.20, 0, 1);
    return t;
  }

  _grassVariant(x, y) {
    const g = fbm(
      (x + 211) * 0.0035,
      (y - 157) * 0.0035,
      3,
      2,
      0.55,
      this.seed ^ 7711
    );
    return clamp(g, 0, 1);
  }

  _rockVariant(x, y) {
    const r = fbm(
      (x - 333) * 0.0042,
      (y + 517) * 0.0042,
      3,
      2,
      0.58,
      this.seed ^ 9901
    );
    return clamp(r, 0, 1);
  }

  _sandVariant(x, y) {
    const s = fbm(
      (x + 97) * 0.0052,
      (y - 221) * 0.0052,
      3,
      2,
      0.56,
      this.seed ^ 6611
    );
    return clamp(s, 0, 1);
  }

  _biomeFromT(t) {
    if (t < 0.34) return "water";
    if (t < 0.39) return "sand";
    if (t < 0.83) return "grass";
    return "rock";
  }

  _tileColorFor(biome, t, x = 0, y = 0) {
    if (biome === "water") {
      const deep = [22, 120, 230];
      const mid = [36, 155, 245];
      const shallow = [92, 205, 255];

      const k = clamp(t / 0.34, 0, 1);
      const c = lerpRgb(deep, mid, Math.min(1, k * 1.2));
      return lerpRgb(c, shallow, Math.max(0, (k - 0.45) / 0.55));
    }

    if (biome === "sand") {
      const sv = this._sandVariant(x, y);

      const cool = [209, 191, 128];
      const base = [224, 205, 142];
      const warm = [236, 218, 158];

      let out;
      if (sv < 0.45) {
        out = lerpRgb(cool, base, sv / 0.45);
      } else {
        out = lerpRgb(base, warm, (sv - 0.45) / 0.55);
      }

      const k = clamp((t - 0.34) / 0.05, 0, 1);
      out = lerpRgb(out, [out[0] + 4, out[1] + 3, out[2] + 2], k * 0.16);

      return out;
    }

    if (biome === "grass") {
      const gv = this._grassVariant(x, y);

      const dry = [112, 150, 78];
      const base = [84, 150, 82];
      const lush = [72, 170, 88];

      let out;
      if (gv < 0.42) {
        out = lerpRgb(dry, base, gv / 0.42);
      } else {
        out = lerpRgb(base, lush, (gv - 0.42) / 0.58);
      }

      const h = clamp((t - 0.39) / 0.44, 0, 1);
      out = lerpRgb(out, [out[0] + 6, out[1] + 8, out[2] + 4], h * 0.18);

      return out;
    }

    const rv = this._rockVariant(x, y);
    const dark = [98, 104, 112];
    const base = [116, 122, 130];
    const light = [142, 148, 158];

    let out;
    if (rv < 0.45) {
      out = lerpRgb(dark, base, rv / 0.45);
    } else {
      out = lerpRgb(base, light, (rv - 0.45) / 0.55);
    }

    const h = clamp((t - 0.83) / 0.17, 0, 1);
    out = lerpRgb(out, [out[0] + 8, out[1] + 8, out[2] + 10], h * 0.18);

    return out;
  }

  _miniColorFor(biome, t, x = 0, y = 0) {
    if (biome === "water") {
      return this._tileColorFor(biome, t, x, y);
    }
    if (biome === "sand") {
      const sv = this._sandVariant(x, y);
      return sv > 0.60 ? [224, 205, 144] : sv < 0.32 ? [192, 174, 112] : [208, 188, 126];
    }
    if (biome === "grass") {
      const gv = this._grassVariant(x, y);
      return gv > 0.62 ? [70, 140, 72] : gv < 0.32 ? [98, 130, 68] : [78, 136, 74];
    }
    return [122, 128, 138];
  }
}

/* ===========================
   Small color helpers
=========================== */

function rgb(r, g, b) {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

function lerpRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}