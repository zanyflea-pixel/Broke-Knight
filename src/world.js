// src/world.js
// v98.1 OVERWORLD PASS + BRIDGES + ROADS + MAP COMPAT (FULL FILE)

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

    // Keep compatibility with both old and newer files.
    this.boundsRadius = 5200;
    this.mapHalfSize = 5200;
    this.boundsHalfSize = 7000;

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

    this._zoneCache = new Map();
    this._groundCache = new Map();

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
      this.revealAround(hero.x, hero.y, 220);
      this._queueAround(hero.x, hero.y, 2);
    }

    this._minimapTimer += dt;
    if (this._minimapTimer >= 0.18) {
      this._minimapTimer = 0;
      if (this._minimapDirty) this._rebuildMinimap();
    }

    this._pumpBuildQueue(3);
  }

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "large" : "small";
    this._minimapDirty = true;
  }

  getMinimapCanvas() {
    if (this._minimapDirty || !this._minimap) {
      this._rebuildMinimap();
    }
    return this._minimap;
  }

  getMoveModifier(x, y) {
    const g = this.getGroundType(x, y);
    if (g === "road") return 1.16;
    if (g === "bridge") return 1.08;
    if (g === "sand") return 0.94;
    if (g === "stone") return 0.98;
    if (g === "forest") return 0.95;
    if (g === "ash") return 0.93;
    if (g === "water") return 0.84;
    return 1.0;
  }

  revealAround(wx, wy, radius = 240) {
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
    const y0 = Math.floor((wy - radius + half) / cell);
    const x1 = Math.floor((wx + radius + half) / cell);
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

  draw(ctx, camera) {
    const bounds = this._viewBounds(camera);

    this._drawGround(ctx, bounds);
    this._drawRoads(ctx, bounds);
    this._drawWater(ctx, bounds);
    this._drawBridges(ctx, bounds);
    this._drawPOIs(ctx, bounds);
  }

  canWalk(x, y) {
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;
    if (this.isBridge(x, y)) return true;
    return !this.isWater(x, y);
  }

  isSolid(x, y) {
    return !this.canWalk(x, y);
  }

  isWater(x, y) {
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return true;

    // Outside mapped area = unknown band, mostly land with some heavy water.
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) {
      const u = fbm((x + this.seed * 0.37) * 0.00056, (y - this.seed * 0.41) * 0.00056, 4);
      return u < 0.27;
    }

    const terrain = this._terrainNoise(x, y);
    const lake = this._lakeNoise(x, y);
    const river = this._riverField(x, y);

    // Broader water bodies and fewer tiny cuts.
    if (lake < -0.30) return true;
    if (terrain < -0.34) return true;
    if (river < 0.052) return true;

    return false;
  }

  isBridge(x, y) {
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) return false;
    if (!this.isWater(x, y)) return false;

    const bx = this._bridgeFieldX(x, y);
    const by = this._bridgeFieldY(x, y);
    const road = this._roadField(x, y);

    return (bx < 0.020 && road > 0.17) || (by < 0.020 && road > 0.17);
  }

  getGroundType(x, y) {
    const key = `${(x / this.tileSize) | 0},${(y / this.tileSize) | 0}`;
    if (this._groundCache.has(key)) return this._groundCache.get(key);

    let out = "grass";

    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) {
      out = this.isWater(x, y) ? "unknown_water" : "unknown";
      this._groundCache.set(key, out);
      return out;
    }

    if (this.isBridge(x, y)) {
      out = "bridge";
      this._groundCache.set(key, out);
      return out;
    }

    if (this.isWater(x, y)) {
      out = "water";
      this._groundCache.set(key, out);
      return out;
    }

    if (this._isRoad(x, y)) {
      out = "road";
      this._groundCache.set(key, out);
      return out;
    }

    const zone = this.getZoneName(x, y);
    if (zone === "Shoreline") out = "sand";
    else if (zone === "Riverbank") out = "riverbank";
    else if (zone === "Stone Flats") out = "stone";
    else if (zone === "Ash Fields") out = "ash";
    else if (zone === "Pine Verge") out = "forest";
    else if (zone === "Whisper Grass") out = "whisper";
    else out = "grass";

    this._groundCache.set(key, out);
    return out;
  }

  getZoneName(x, y) {
    const cx = (x / 96) | 0;
    const cy = (y / 96) | 0;
    const key = `${cx},${cy}`;

    if (this._zoneCache.has(key)) return this._zoneCache.get(key);

    let zone = "High Meadow";

    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) {
      zone = "Unknown";
      this._zoneCache.set(key, zone);
      return zone;
    }

    if (this.isWater(x, y)) {
      zone = Math.abs(this._terrainNoise(x, y)) > 0.30 ? "Riverbank" : "Shoreline";
      this._zoneCache.set(key, zone);
      return zone;
    }

    const heat = fbm((x + this.seed * 0.19) * 0.00042, (y - this.seed * 0.17) * 0.00042, 4);
    const moist = fbm((x - this.seed * 0.13) * 0.00038, (y + this.seed * 0.21) * 0.00038, 4);
    const rough = fbm((x + this.seed * 0.41) * 0.00066, (y - this.seed * 0.37) * 0.00066, 3);

    if (rough > 0.44 && moist < 0.48) {
      zone = "Stone Flats";
    } else if (heat > 0.36 && moist < 0.40) {
      zone = "Ash Fields";
    } else if (moist > 0.49 && rough < 0.26) {
      zone = "Whisper Grass";
    } else if (rough > 0.16 && moist > 0.12) {
      zone = "Pine Verge";
    } else {
      zone = "High Meadow";
    }

    // Cleaner central square.
    if (Math.abs(x) < 1200 && Math.abs(y) < 1200) {
      zone = "High Meadow";
    }

    this._zoneCache.set(key, zone);
    return zone;
  }

  _terrainNoise(x, y) {
    const a = fbm((x + this.seed * 0.31) * 0.00060, (y - this.seed * 0.27) * 0.00060, 5);
    const b = fbm((x - this.seed * 0.11) * 0.00132, (y + this.seed * 0.09) * 0.00132, 3);
    return a * 0.72 + b * 0.28 - 0.5;
  }

  _lakeNoise(x, y) {
    const lx = fbm((x + this.seed * 0.57) * 0.00038, (y - this.seed * 0.33) * 0.00038, 4);
    const ly = fbm((x - this.seed * 0.23) * 0.00086, (y + this.seed * 0.49) * 0.00086, 3);
    return lx * 0.75 + ly * 0.25 - 0.5;
  }

  _riverField(x, y) {
    const warpX = fbm((x + this.seed * 0.17) * 0.0009, (y - this.seed * 0.21) * 0.0009, 2) * 120;
    const warpY = fbm((x - this.seed * 0.29) * 0.0009, (y + this.seed * 0.27) * 0.0009, 2) * 120;

    const rx = x + warpX;
    const ry = y + warpY;

    const a = Math.abs(Math.sin(rx * 0.00094 + this.seed * 0.00017));
    const b = Math.abs(Math.sin(ry * 0.00102 - this.seed * 0.00013));
    return Math.min(a, b);
  }

  _roadField(x, y) {
    const warpX = fbm((x + this.seed * 0.41) * 0.0010, (y - this.seed * 0.27) * 0.0010, 2) * 90;
    const warpY = fbm((x - this.seed * 0.37) * 0.0010, (y + this.seed * 0.33) * 0.0010, 2) * 90;
    const rx = x + warpX;
    const ry = y + warpY;

    const roadA = Math.abs(Math.sin(rx * 0.00125 + this.seed * 0.00019));
    const roadB = Math.abs(Math.sin((rx - ry) * 0.00096 - this.seed * 0.00015));
    const roadC = Math.abs(Math.sin((rx + ry) * 0.00082 + this.seed * 0.00011));
    const field = fbm((x + this.seed * 0.09) * 0.0032, (y - this.seed * 0.06) * 0.0032, 2);

    let v = 1;
    v = Math.min(v, roadA);
    v = Math.min(v, roadB * 1.10);
    v = Math.min(v, roadC * 1.16);

    return field - v;
  }

  _isRoad(x, y) {
    if (this.isWater(x, y)) return false;
    if (this.getZoneName(x, y) === "Shoreline") return false;
    return this._roadField(x, y) > 0.19;
  }

  _bridgeFieldX(x, y) {
    const warp = fbm((x + this.seed * 0.12) * 0.0011, (y - this.seed * 0.22) * 0.0011, 2) * 70;
    return Math.abs(Math.sin((x + warp) * 0.00112 + this.seed * 0.00031));
  }

  _bridgeFieldY(x, y) {
    const warp = fbm((x - this.seed * 0.14) * 0.0011, (y + this.seed * 0.18) * 0.0011, 2) * 70;
    return Math.abs(Math.sin((y + warp) * 0.00110 - this.seed * 0.00029));
  }

  _chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  _queueChunk(cx, cy) {
    const key = this._chunkKey(cx, cy);
    if (this._chunks.has(key) || this._queued.has(key)) return;
    this._queued.add(key);
    this._buildQueue.push({ cx, cy, key });
  }

  _queueAround(wx, wy, radiusChunks = 2) {
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    for (let y = cy - radiusChunks; y <= cy + radiusChunks; y++) {
      for (let x = cx - radiusChunks; x <= cx + radiusChunks; x++) {
        this._queueChunk(x, y);
      }
    }
  }

  _pumpBuildQueue(maxPerFrame = 3) {
    for (let i = 0; i < maxPerFrame && this._buildQueue.length > 0; i++) {
      const next = this._buildQueue.shift();
      this._queued.delete(next.key);
      this._chunks.set(next.key, this._buildChunk(next.cx, next.cy));
    }
  }

  _buildChunk(cx, cy) {
    return { cx, cy, built: true };
  }

  _viewBounds(camera) {
    const halfW = this.viewW * 0.5;
    const halfH = this.viewH * 0.5;
    return {
      x0: camera.x - halfW - 120,
      y0: camera.y - halfH - 120,
      x1: camera.x + halfW + 120,
      y1: camera.y + halfH + 120,
    };
  }

  _drawGround(ctx, vb) {
    const t = this.tileSize;
    const x0 = Math.floor(vb.x0 / t) * t;
    const y0 = Math.floor(vb.y0 / t) * t;
    const x1 = Math.ceil(vb.x1 / t) * t;
    const y1 = Math.ceil(vb.y1 / t) * t;

    for (let y = y0; y <= y1; y += t) {
      for (let x = x0; x <= x1; x += t) {
        const gx = x + t * 0.5;
        const gy = y + t * 0.5;
        const ground = this.getGroundType(gx, gy);

        if (ground === "water" || ground === "unknown_water") continue;

        ctx.fillStyle = this._groundColor(ground, x, y);
        ctx.fillRect(x, y, t + 1, t + 1);

        const n = Math.abs(hash2((x / t) | 0, (y / t) | 0, this.seed + 66)) % 100;

        if (ground === "forest") {
          if (n < 28) this._drawTree(ctx, x + 12, y + 18, 1 + (n % 3) * 0.10);
          else if (n > 95) this._drawPebble(ctx, x + 15, y + 21);
        } else if (ground === "grass" || ground === "whisper" || ground === "riverbank") {
          if (n < 9) this._drawGrassTuft(ctx, x + 10, y + 22);
          else if (n > 96) this._drawPebble(ctx, x + 15, y + 18);
        } else if (ground === "stone" || ground === "ash") {
          if (n < 18) this._drawPebble(ctx, x + 15, y + 19);
        } else if (ground === "sand") {
          if (n < 12) this._drawReed(ctx, x + 14, y + 23);
        }
      }
    }
  }

  _drawRoads(ctx, vb) {
    const t = this.tileSize;
    const x0 = Math.floor(vb.x0 / t) * t;
    const y0 = Math.floor(vb.y0 / t) * t;
    const x1 = Math.ceil(vb.x1 / t) * t;
    const y1 = Math.ceil(vb.y1 / t) * t;

    for (let y = y0; y <= y1; y += t) {
      for (let x = x0; x <= x1; x += t) {
        const gx = x + t * 0.5;
        const gy = y + t * 0.5;
        if (this.getGroundType(gx, gy) !== "road") continue;

        ctx.fillStyle = "rgba(114,132,152,0.32)";
        ctx.fillRect(x + 2, y + 8, t - 4, t - 16);

        ctx.strokeStyle = "rgba(82,92,105,0.24)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 10);
        ctx.lineTo(x + t - 4, y + 10);
        ctx.moveTo(x + 4, y + t - 10);
        ctx.lineTo(x + t - 4, y + t - 10);
        ctx.stroke();
      }
    }
  }

  _drawWater(ctx, vb) {
    const t = this.tileSize;
    const x0 = Math.floor(vb.x0 / t) * t;
    const y0 = Math.floor(vb.y0 / t) * t;
    const x1 = Math.ceil(vb.x1 / t) * t;
    const y1 = Math.ceil(vb.y1 / t) * t;

    for (let y = y0; y <= y1; y += t) {
      for (let x = x0; x <= x1; x += t) {
        const gx = x + t * 0.5;
        const gy = y + t * 0.5;

        if (!this.isWater(gx, gy) || this.isBridge(gx, gy)) continue;

        const n = this._terrainNoise(gx, gy);
        ctx.fillStyle = n < -0.30 ? "#2a699c" : "#3c84b8";
        ctx.fillRect(x, y, t + 1, t + 1);

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 10);
        ctx.lineTo(x + 22, y + 10);
        ctx.moveTo(x + 7, y + 20);
        ctx.lineTo(x + 18, y + 20);
        ctx.stroke();
      }
    }
  }

  _drawBridges(ctx, vb) {
    const t = this.tileSize;
    const x0 = Math.floor(vb.x0 / t) * t;
    const y0 = Math.floor(vb.y0 / t) * t;
    const x1 = Math.ceil(vb.x1 / t) * t;
    const y1 = Math.ceil(vb.y1 / t) * t;

    for (let y = y0; y <= y1; y += t) {
      for (let x = x0; x <= x1; x += t) {
        const gx = x + t * 0.5;
        const gy = y + t * 0.5;
        if (!this.isBridge(gx, gy)) continue;
        this._drawBridgeTile(ctx, x, y, t, gx, gy);
      }
    }
  }

  _drawBridgeTile(ctx, x, y, t, gx, gy) {
    const vertical = this._bridgeFieldX(gx, gy) < this._bridgeFieldY(gx, gy);

    ctx.fillStyle = "#70533a";
    ctx.fillRect(x, y, t + 1, t + 1);

    ctx.fillStyle = "#8f6a4a";
    if (vertical) {
      for (let i = 2; i < t; i += 6) {
        ctx.fillRect(x + 5, y + i, t - 10, 3);
      }
      ctx.fillStyle = "#5d4430";
      ctx.fillRect(x + 3, y, 3, t + 1);
      ctx.fillRect(x + t - 6, y, 3, t + 1);
    } else {
      for (let i = 2; i < t; i += 6) {
        ctx.fillRect(x + i, y + 5, 3, t - 10);
      }
      ctx.fillStyle = "#5d4430";
      ctx.fillRect(x, y + 3, t + 1, 3);
      ctx.fillRect(x, y + t - 6, t + 1, 3);
    }
  }

  _drawPOIs(ctx, vb) {
    const visible = (p, r = 40) =>
      p.x + r >= vb.x0 &&
      p.x - r <= vb.x1 &&
      p.y + r >= vb.y0 &&
      p.y - r <= vb.y1;

    for (const camp of this.camps) if (visible(camp)) this._drawCamp(ctx, camp);
    for (const dock of this.docks) if (visible(dock)) this._drawDock(ctx, dock);
    for (const ws of this.waystones) if (visible(ws)) this._drawWaystone(ctx, ws);
    for (const dg of this.dungeons) if (visible(dg)) this._drawDungeon(ctx, dg);
  }

  _drawCamp(ctx, camp) {
    ctx.save();
    ctx.translate(camp.x, camp.y);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7a5e43";
    ctx.fillRect(-20, 4, 14, 10);
    ctx.fillRect(6, 4, 14, 10);

    ctx.fillStyle = "#c79f6b";
    ctx.beginPath();
    ctx.moveTo(-24, 4);
    ctx.lineTo(-13, -10);
    ctx.lineTo(-2, 4);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.lineTo(13, -10);
    ctx.lineTo(24, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffb25c";
    ctx.beginPath();
    ctx.arc(0, 8, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawDock(ctx, dock) {
    ctx.save();
    ctx.translate(dock.x, dock.y);

    ctx.fillStyle = "#6f5038";
    ctx.fillRect(-18, -3, 36, 6);
    ctx.fillRect(8, -10, 6, 20);

    ctx.fillStyle = "#d6d2c6";
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(-4, -8);
    ctx.lineTo(-9, -18);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawWaystone(ctx, ws) {
    ctx.save();
    ctx.translate(ws.x, ws.y);

    ctx.fillStyle = "#727d93";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(10, -2);
    ctx.lineTo(6, 18);
    ctx.lineTo(-6, 18);
    ctx.lineTo(-10, -2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(170,220,255,0.18)";
    ctx.beginPath();
    ctx.arc(0, 2, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawDungeon(ctx, d) {
    ctx.save();
    ctx.translate(d.x, d.y);

    ctx.fillStyle = "#534a5b";
    ctx.fillRect(-16, -12, 32, 24);
    ctx.fillStyle = "#201a24";
    ctx.fillRect(-5, 0, 10, 12);
    ctx.fillStyle = "#86758f";
    ctx.fillRect(-16, -16, 32, 5);

    ctx.restore();
  }

  _groundColor(type, x, y) {
    const alt = Math.abs(hash2((x / 24) | 0, (y / 24) | 0, this.seed + 66)) % 12;

    if (type === "whisper") return alt < 6 ? "#5f9a59" : "#679f61";
    if (type === "road") return alt < 6 ? "#7f8fa0" : "#8897a7";
    if (type === "stone") return alt < 6 ? "#7b876f" : "#869177";
    if (type === "grass") return alt < 6 ? "#73ad63" : "#7cb56b";
    if (type === "ash") return alt < 6 ? "#7e7a67" : "#87836f";
    if (type === "forest") return alt < 6 ? "#547d4e" : "#5c8555";
    if (type === "sand") return alt < 6 ? "#8f9368" : "#989d72";
    if (type === "riverbank") return alt < 6 ? "#6f9b65" : "#78a46d";
    if (type === "bridge") return "#7c5a3f";
    if (type === "unknown") return alt < 6 ? "#4f5a47" : "#596551";
    return alt < 6 ? "#69995d" : "#72a265";
  }

  _miniGroundColor(type) {
    if (type === "whisper") return "#679f61";
    if (type === "road") return "#8b97a6";
    if (type === "stone") return "#869177";
    if (type === "grass") return "#7cb56b";
    if (type === "ash") return "#87836f";
    if (type === "forest") return "#5c8555";
    if (type === "sand") return "#989d72";
    if (type === "riverbank") return "#78a46d";
    if (type === "bridge") return "#8a6a4c";
    if (type === "water") return "#3d84b8";
    if (type === "unknown") return "#596551";
    if (type === "unknown_water") return "#2d4d69";
    return "#72a265";
  }

  _drawGrassTuft(ctx, x, y) {
    ctx.strokeStyle = "rgba(36,76,32,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - 6);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y - 8);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 6);
    ctx.stroke();
  }

  _drawPebble(ctx, x, y) {
    ctx.fillStyle = "rgba(40,52,44,0.18)";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.arc(x + 4, y + 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawTree(ctx, x, y, scale = 1) {
    ctx.fillStyle = "#4a392c";
    ctx.fillRect(x - 1 * scale, y, 3 * scale, 8 * scale);

    ctx.fillStyle = "#335b32";
    ctx.beginPath();
    ctx.moveTo(x, y - 14 * scale);
    ctx.lineTo(x - 9 * scale, y - 2 * scale);
    ctx.lineTo(x + 9 * scale, y - 2 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y - 9 * scale);
    ctx.lineTo(x - 11 * scale, y + 2 * scale);
    ctx.lineTo(x + 11 * scale, y + 2 * scale);
    ctx.closePath();
    ctx.fill();
  }

  _drawReed(ctx, x, y) {
    ctx.strokeStyle = "rgba(96,118,74,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1, y - 7);
    ctx.moveTo(x + 2, y + 1);
    ctx.lineTo(x + 2, y - 8);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 5, y - 6);
    ctx.stroke();
  }

  _initPOIs() {
    this.camps.length = 0;
    this.waystones.length = 0;
    this.docks.length = 0;
    this.dungeons.length = 0;

    const findLand = (x, y, r = 300) => this._findSafeLandPatchNear(x, y, r);
    const findShore = (x, y, r = 360) => this._findShorePatchNear(x, y, r);

    this.spawn = findLand(0, 0, 460) || { x: 0, y: 0 };

    const campSeeds = [
      [-1200, -900],
      [1200, -920],
      [-1380, 1040],
      [1460, 1120],
      [0, 1760],
      [-2260, 280],
      [2280, -320],
    ];

    const waystoneSeeds = [
      [-2440, 40],
      [2440, -20],
      [0, -2400],
      [60, 2440],
      [-1720, 1760],
      [1760, -1720],
    ];

    const dungeonSeeds = [
      [-3120, -500],
      [3220, 480],
      [-600, 3140],
      [740, -3200],
    ];

    const dockSeeds = [
      [-2780, 1040],
      [2860, -1080],
      [-760, 2620],
      [900, -2680],
    ];

    let id = 1;

    for (const [x, y] of campSeeds) {
      const p = findLand(x, y, 340);
      if (p) this.camps.push({ id: id++, name: "Camp", x: p.x, y: p.y });
    }

    for (const [x, y] of waystoneSeeds) {
      const p = findLand(x, y, 300);
      if (p) this.waystones.push({ id: id++, x: p.x, y: p.y });
    }

    for (const [x, y] of dungeonSeeds) {
      const p = findLand(x, y, 360);
      if (p) this.dungeons.push({ id: id++, x: p.x, y: p.y });
    }

    for (const [x, y] of dockSeeds) {
      const p = findShore(x, y, 420);
      if (p) this.docks.push({ id: id++, x: p.x, y: p.y });
    }
  }

  _isNearWater(x, y, r = 40) {
    return (
      this.isWater(x + r, y) ||
      this.isWater(x - r, y) ||
      this.isWater(x, y + r) ||
      this.isWater(x, y - r)
    );
  }

  _findSafeLandPatchNear(x, y, radius = 260) {
    for (let r = 0; r <= radius; r += 24) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = Math.round(x + Math.cos(a) * r);
        const py = Math.round(y + Math.sin(a) * r);
        if (!this.canWalk(px, py)) continue;
        if (this._isNearWater(px, py, 28)) continue;
        return { x: px, y: py };
      }
    }
    return null;
  }

  _findShorePatchNear(x, y, radius = 320) {
    for (let r = 40; r <= radius; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
        const px = Math.round(x + Math.cos(a) * r);
        const py = Math.round(y + Math.sin(a) * r);
        if (!this.canWalk(px, py)) continue;
        if (!this._isNearWater(px, py, 34)) continue;
        return { x: px, y: py };
      }
    }
    return this._findSafeLandPatchNear(x, y, radius);
  }

  _getMapSpan(mode = "small") {
    return mode === "large" ? this.boundsRadius * 2 : this.mapHalfSize * 2;
  }

  _rebuildMinimap() {
    const size = 220;
    const cv = this._minimap || document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const mode = this.mapMode || "small";
    const span = this._getMapSpan(mode);
    const half = span * 0.5;
    const cell = mode === "large" ? 72 : 48;
    const revealed = mode === "large" ? this._revealedLarge : this._revealedSmall;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(14,18,24,0.96)";
    ctx.fillRect(0, 0, size, size);

    const worldPerPixel = span / size;
    const gridCount = Math.ceil(span / cell);

    for (let gy = 0; gy < gridCount; gy++) {
      for (let gx = 0; gx < gridCount; gx++) {
        const key = `${gx},${gy}`;
        if (!revealed.has(key)) continue;

        const wx = gx * cell - half;
        const wy = gy * cell - half;
        const ground = this.getGroundType(wx + cell * 0.5, wy + cell * 0.5);

        const px = Math.floor((wx + half) / worldPerPixel);
        const py = Math.floor((wy + half) / worldPerPixel);
        const pw = Math.ceil(cell / worldPerPixel) + 1;
        const ph = Math.ceil(cell / worldPerPixel) + 1;

        ctx.fillStyle = this._miniGroundColor(ground);
        ctx.fillRect(px, py, pw, ph);
      }
    }

    const drawMarker = (arr, color, r) => {
      ctx.fillStyle = color;
      for (const p of arr) {
        const gx = Math.floor((p.x + half) / cell);
        const gy = Math.floor((p.y + half) / cell);
        if (!revealed.has(`${gx},${gy}`)) continue;

        const px = ((p.x + half) / span) * size;
        const py = ((p.y + half) / span) * size;

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawMarker(this.camps, "#ffb25c", 2.4);
    drawMarker(this.waystones, "#8fd4ff", 2.4);
    drawMarker(this.dungeons, "#c995ff", 2.5);
    drawMarker(this.docks, "#d9d4c6", 2.1);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    this._minimap = cv;
    this._minimapDirty = false;
  }
}