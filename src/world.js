// src/world.js
// v50 WATER HEAVY + THIN BLUE-GREY ROADS + BIG FORESTS (FULL FILE)
//
// Main changes:
// - much more water
// - roads are now very rare and thinner
// - roads use a blue-grey tone instead of flat grey
// - forests are bigger / darker and use bigger tree drawing
// - camps try harder to stay away from water
// - docks stay on shoreline
//
// Notes:
// - stays compatible with current game.js
// - exposes getGroundType() and getMoveModifier() for future movement tuning
// - minions being too close to water is improved by pushing camp spawns inland

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
    return this._sampleTile(x, y) !== "water";
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
        const sx = wx + this.tileSize * 0.5;
        const sy = wy + this.tileSize * 0.5;
        const tile = this._sampleTile(sx, sy);
        const shade = this._tileShade(sx, sy);
        const n = hash2(tx, ty, this.seed) >>> 0;

        if (tile === "water") {
          ctx.fillStyle = shade > 0.06
            ? "rgba(86,170,244,1)"
            : shade < -0.06
              ? "rgba(26,84,170,1)"
              : "rgba(46,116,206,1)";
        } else if (tile === "sand") {
          ctx.fillStyle = shade > 0.05
            ? "rgba(224,208,146,1)"
            : "rgba(206,188,126,1)";
        } else if (tile === "road") {
          ctx.fillStyle = shade > 0.03
            ? "rgba(118,130,148,1)"
            : "rgba(96,108,124,1)";
        } else if (tile === "rock") {
          ctx.fillStyle = shade > 0.05
            ? "rgba(134,142,150,1)"
            : "rgba(112,120,128,1)";
        } else if (tile === "forest") {
          ctx.fillStyle = shade > 0.04
            ? "rgba(56,108,54,1)"
            : "rgba(42,86,42,1)";
        } else {
          ctx.fillStyle = shade > 0.05
            ? "rgba(100,166,90,1)"
            : shade < -0.05
              ? "rgba(70,130,66,1)"
              : "rgba(84,148,78,1)";
        }

        ctx.fillRect(wx, wy, this.tileSize + 1, this.tileSize + 1);

        if (tile === "water") {
          if (n % 8 === 0) {
            ctx.fillStyle = "rgba(136,214,252,0.18)";
            ctx.fillRect(wx + 4, wy + 8, 12, 2);
          }
          if (this._nearType(sx, sy, "sand") && n % 3 === 0) {
            ctx.fillStyle = "rgba(244,250,255,0.24)";
            ctx.fillRect(wx + 3, wy + 18, 14, 1.5);
          }
        } else if (tile === "sand") {
          if (this._nearType(sx, sy, "water") && n % 3 === 0) {
            ctx.fillStyle = "rgba(246,236,190,0.38)";
            ctx.fillRect(wx + 3, wy + 18, 14, 1.3);
          }
        } else if (tile === "road") {
          if (n % 5 === 0) {
            ctx.fillStyle = "rgba(170,180,194,0.16)";
            ctx.fillRect(wx + 4, wy + 6, 8, 2);
          }
          if (n % 7 === 0) {
            ctx.fillStyle = "rgba(72,82,96,0.22)";
            ctx.fillRect(wx + 13, wy + 14, 4, 2);
          }
        } else if (tile === "rock") {
          if (n % 12 === 0) this._drawRockPatch(ctx, wx + 12, wy + 14);
        } else if (tile === "forest") {
          if (n % 3 === 0) this._drawBigTree(ctx, wx + 12, wy + 10);
          else if (n % 5 === 0) this._drawBush(ctx, wx + 12, wy + 15);
        } else {
          const treeField = fbm((sx + this.seed * 0.17) * 0.0036, (sy - this.seed * 0.12) * 0.0036, 2);
          const bushField = fbm((sx - this.seed * 0.08) * 0.0048, (sy + this.seed * 0.19) * 0.0048, 2);

          if (treeField > 0.76 && n % 16 === 0) {
            this._drawBigTree(ctx, wx + 12, wy + 10);
          } else if (bushField > 0.66 && n % 20 === 0) {
            this._drawBush(ctx, wx + 12, wy + 15);
          } else if (this._nearType(sx, sy, "water") && n % 22 === 0) {
            this._drawGrassTuft(ctx, wx + 9, wy + 20);
          }
        }
      }
    }

    for (const w of this.waystones) this._drawWaystone(ctx, w);
    for (const d of this.docks) this._drawDock(ctx, d);
    for (const c of this.camps) this._drawCamp(ctx, c);
    for (const dg of this.dungeons) this._drawDungeonEntrance(ctx, dg);
  }

  _drawGrassTuft(ctx, x, y) {
    ctx.strokeStyle = "rgba(102,178,94,0.78)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y - 6);
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 2, y - 7);
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 5, y - 5);
    ctx.stroke();
  }

  _drawBush(ctx, x, y) {
    ctx.fillStyle = "rgba(58,110,54,0.76)";
    ctx.beginPath();
    ctx.arc(x - 4, y + 1, 4.5, 0, Math.PI * 2);
    ctx.arc(x + 1, y - 1, 5.5, 0, Math.PI * 2);
    ctx.arc(x + 6, y + 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawBigTree(ctx, x, y) {
    ctx.fillStyle = "rgba(98,68,42,0.96)";
    ctx.fillRect(x - 2, y + 4, 4, 9);

    ctx.fillStyle = "rgba(48,110,58,0.98)";
    ctx.beginPath();
    ctx.arc(x, y + 1, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(78,146,84,0.26)";
    ctx.beginPath();
    ctx.arc(x - 3, y - 2, 3.5, 0, Math.PI * 2);
    ctx.arc(x + 4, y - 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawRockPatch(ctx, x, y) {
    ctx.fillStyle = "rgba(98,110,122,0.68)";
    ctx.beginPath();
    ctx.ellipse(x - 3, y, 4, 3, 0.1, 0, Math.PI * 2);
    ctx.ellipse(x + 2, y - 2, 3.5, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(160,168,178,0.16)";
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 1.2, 2, 1, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 1.5, y - 3, 1.8, 1, 0, 0, Math.PI * 2);
    ctx.fill();
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

  _tileShade(x, y) {
    return fbm((x + this.seed * 0.04) * 0.01, (y - this.seed * 0.03) * 0.01, 2);
  }

  _nearType(x, y, type) {
    const d = this.tileSize;
    return (
      this._sampleTile(x + d, y) === type ||
      this._sampleTile(x - d, y) === type ||
      this._sampleTile(x, y + d) === type ||
      this._sampleTile(x, y - d) === type
    );
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
            tile === "road" ? "#718296" :
            tile === "rock" ? "#7d8792" :
            tile === "forest" ? "#3a6a3c" :
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

  _sampleTile(x, y) {
    if (x < -this.boundsRadius || x > this.boundsRadius) return "water";
    if (y < -this.boundsRadius || y > this.boundsRadius) return "water";

    const landA = fbm((x + this.seed * 0.11) * 0.00044, (y - this.seed * 0.07) * 0.00044, 4);
    const landB = fbm((x - this.seed * 0.05) * 0.00082, (y + this.seed * 0.09) * 0.00082, 4);
    const med = fbm((x + this.seed * 0.03) * 0.0021, (y + this.seed * 0.04) * 0.0021, 3);
    const rockN = fbm((x - this.seed * 0.02) * 0.0058, (y + this.seed * 0.05) * 0.0058, 2);
    const forestN = fbm((x + this.seed * 0.27) * 0.0025, (y - this.seed * 0.18) * 0.0025, 2);

    const warpX = fbm((x + this.seed * 0.13) * 0.00075, (y - this.seed * 0.21) * 0.00075, 3) * 280;
    const warpY = fbm((x - this.seed * 0.19) * 0.00075, (y + this.seed * 0.16) * 0.00075, 3) * 280;

    const wx = x + warpX;
    const wy = y + warpY;

    const bandA = Math.abs(Math.sin(wx * 0.00100 + this.seed * 0.00017));
    const bandB = Math.abs(Math.sin(wy * 0.00112 - this.seed * 0.00013));
    const bandC = Math.abs(Math.sin((wx + wy) * 0.00063 + this.seed * 0.00009));

    const lakeN = fbm((x + this.seed * 0.23) * 0.00105, (y - this.seed * 0.18) * 0.00105, 3);

    const edgeX = Math.abs(x) / this.boundsRadius;
    const edgeY = Math.abs(y) / this.boundsRadius;
    const edgePenalty = Math.max(edgeX, edgeY) * 0.10;

    let land = landA * 0.76 + landB * 0.20 + med * 0.10 - edgePenalty;

    // WAY more water
    if (bandA < 0.26) land -= 0.95;
    else if (bandA < 0.34) land -= 0.34;

    if (bandB < 0.22) land -= 0.72;
    else if (bandB < 0.30) land -= 0.28;

    if (bandC < 0.14) land -= 0.38;
    else if (bandC < 0.18) land -= 0.14;

    if (lakeN < -0.44) land -= 0.26;
    else if (lakeN < -0.34) land -= 0.14;

    const roadWarpX = fbm((x + this.seed * 0.41) * 0.0010, (y - this.seed * 0.27) * 0.0010, 2) * 90;
    const roadWarpY = fbm((x - this.seed * 0.37) * 0.0010, (y + this.seed * 0.33) * 0.0010, 2) * 90;
    const rx = x + roadWarpX;
    const ry = y + roadWarpY;

    const roadA = Math.abs(Math.sin(rx * 0.0017 + this.seed * 0.00021));
    const roadB = Math.abs(Math.sin((rx - ry) * 0.00110 - this.seed * 0.00017));
    const roadField = fbm((x + this.seed * 0.09) * 0.0038, (y - this.seed * 0.06) * 0.0038, 2);

    if (land < 0.06) return "water";
    if (land < 0.14) return "sand";

    // almost no road
    if ((roadA < 0.012 || roadB < 0.010) && roadField > 0.24 && land > 0.42) {
      return "road";
    }

    if (rockN > 0.62 && land > 0.34) return "rock";
    if (forestN > 0.24 && land > 0.20) return "forest";
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

    const waystoneRings = [520, 1250, 2050, 2950, 3850, 4700];
    for (let ringIndex = 0; ringIndex < waystoneRings.length; ringIndex++) {
      const ring = waystoneRings[ringIndex];
      const count = 4 + ringIndex;

      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ringIndex * 0.17;
        const x = Math.round(Math.cos(a) * ring);
        const y = Math.round(Math.sin(a) * ring);
        const p = this._findNearbyLand(x, y, 360, true);
        if (p) this.waystones.push({ id: wid++, x: p.x, y: p.y });
      }
    }

    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + 0.31;
      const r = 1300 + (i % 6) * 600;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const p = this._findNearbyShore(x, y, 640);
      if (p) this.docks.push({ id: i + 1, x: p.x, y: p.y });
    }

    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2 + 0.13;
      const r = 900 + (i % 8) * 560;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const p = this._findNearbyLand(x, y, 520, false, true);
      if (p) {
        this.camps.push({
          id: i + 1,
          x: p.x,
          y: p.y,
          tier: 1 + (i % 5),
        });
      }
    }

    const dg = this._findNearbyLand(this.spawn.x + 420, this.spawn.y + 220, 420, true) || {
      x: this.spawn.x + 360,
      y: this.spawn.y + 220,
    };
    this.dungeons.push({ id: 1, x: dg.x, y: dg.y, name: "Deep Ruin" });
  }

  _findGoodSpawn() {
    for (let r = 0; r <= 700; r += 24) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const t = this._sampleTile(x, y);
        if ((t === "grass" || t === "road") && !this._isNearWater(x, y, 90)) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  _isNearWater(x, y, dist = 72) {
    const step = this.tileSize;
    for (let r = step; r <= dist; r += step) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this._sampleTile(px, py) === "water") return true;
      }
    }
    return false;
  }

  _findNearbyLand(x, y, maxR = 240, allowNearWater = true, avoidWaterStrong = false) {
    for (let r = 0; r <= maxR; r += 16) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);

        if (t === "grass" || t === "rock" || t === "sand" || t === "road" || t === "forest") {
          if (!allowNearWater && this._isNearWater(px, py, 80)) continue;
          if (avoidWaterStrong && this._isNearWater(px, py, 120)) continue;
          return { x: px, y: py };
        }
      }
    }
    return null;
  }

  _findNearbyShore(x, y, maxR = 240) {
    for (let r = 0; r <= maxR; r += 16) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);
        if (t === "sand") return { x: px, y: py };
      }
    }
    return this._findNearbyLand(x, y, maxR, true, false);
  }
}