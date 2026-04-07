// src/world.js
// v58 VISIBLE WORLD PASS (FULL FILE)
// Focus:
// - much safer spawn
// - fewer ugly trapped water pockets
// - more usable shorelines
// - better dock placement
// - stronger rescue when player loads/stuck in bad terrain
// - keep compatibility with current game.js

import { fbm, hash2, RNG } from "./util.js";

export default class World {
  constructor(seed = 1, opts = {}) {
    this.seed = seed | 0;

    this.viewW = Math.max(320, opts.viewW | 0 || 960);
    this.viewH = Math.max(240, opts.viewH | 0 || 540);

    this.tileSize = opts.tileSize || 24;
    this.chunkTiles = opts.chunkTiles || 32;
    this.chunkSize = this.tileSize * this.chunkTiles;
    this.boundsRadius = 5200;

    this.mapMode = "small";
    this.revealRadius = 260;
    this.revealSoftRadius = 360;

    this._chunks = new Map();
    this._queued = new Set();
    this._buildQueue = [];

    this._minimap = null;
    this._minimapDirty = true;
    this._miniTimer = 0;

    this._revealedSmall = new Set();
    this._revealedLarge = new Set();

    this.camps = [];
    this.waystones = [];
    this.docks = [];
    this.dungeons = [];

    this.spawn = { x: 0, y: 0 };

    this._heroRescueCd = 0;
    this._lastRevealX = null;
    this._lastRevealY = null;

    this._poiRng = new RNG(hash2(this.seed, 777));

    this._initPOIs();
    this.revealAround(this.spawn.x, this.spawn.y, this.revealSoftRadius);
    this._queueAround(this.spawn.x, this.spawn.y, 2);
  }

  setViewSize(w, h) {
    this.viewW = Math.max(320, w | 0 || this.viewW);
    this.viewH = Math.max(240, h | 0 || this.viewH);
  }

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "large" : "small";
    this._minimapDirty = true;
  }

  update(dt, hero) {
    if (!hero) return;

    this._queueAround(hero.x, hero.y, 2);

    let builds = 0;
    while (this._buildQueue.length && builds < 3) {
      const key = this._buildQueue.shift();
      this._queued.delete(key);

      if (!this._chunks.has(key)) {
        const [cx, cy] = key.split(",").map(Number);
        this._buildChunk(cx, cy);
      }
      builds++;
    }

    if (
      this._lastRevealX == null ||
      this._lastRevealY == null ||
      Math.abs(hero.x - this._lastRevealX) > 80 ||
      Math.abs(hero.y - this._lastRevealY) > 80
    ) {
      this.revealAround(hero.x, hero.y, this.revealSoftRadius);
      this._lastRevealX = hero.x;
      this._lastRevealY = hero.y;
    }

    this._heroRescueCd = Math.max(0, this._heroRescueCd - dt);

    if (!hero.state?.sailing && this._heroRescueCd <= 0) {
      if (!this.canWalk(hero.x, hero.y) || this._isTrappedInWaterPocket(hero.x, hero.y)) {
        const rescue =
          this._findSafeLandPatchNear(hero.x, hero.y, 700) ||
          this._findNearbyLand(hero.x, hero.y, 700, false, true) ||
          this._findSafeLandPatchNear(this.spawn.x, this.spawn.y, 700) ||
          this.spawn ||
          { x: 0, y: 0 };

        hero.x = rescue.x;
        hero.y = rescue.y;
        hero.vx = 0;
        hero.vy = 0;
        if (hero.state) hero.state.sailing = false;

        this._heroRescueCd = 2.4;
        this.revealAround(hero.x, hero.y, this.revealSoftRadius);
      }
    }

    this._miniTimer += dt;
    if (this._miniTimer >= 0.24) {
      this._miniTimer = 0;
      this._minimapDirty = true;
    }
  }

  draw(ctx, camera) {
    if (!ctx || !camera) return;

    const camX = camera.x ?? 0;
    const camY = camera.y ?? 0;

    const halfW = this.viewW * 0.5;
    const halfH = this.viewH * 0.5;
    const pad = 128;

    const x0 = camX - halfW - pad;
    const x1 = camX + halfW + pad;
    const y0 = camY - halfH - pad;
    const y1 = camY + halfH + pad;

    const tx0 = Math.floor(x0 / this.tileSize);
    const tx1 = Math.ceil(x1 / this.tileSize);
    const ty0 = Math.floor(y0 / this.tileSize);
    const ty1 = Math.ceil(y1 / this.tileSize);

    for (let ty = ty0; ty <= ty1; ty++) {
      const wy = ty * this.tileSize;
      for (let tx = tx0; tx <= tx1; tx++) {
        const wx = tx * this.tileSize;
        const tile = this._sampleTile(wx, wy);
        ctx.fillStyle = this._tileColor(tile, wx, wy);
        ctx.fillRect(wx, wy, this.tileSize + 1, this.tileSize + 1);
        this._drawTileDecor(ctx, tile, wx, wy);
      }
    }

    this._drawPOIs(ctx);
  }

  canWalk(x, y) {
    return this._sampleTile(x, y) !== "water";
  }

  isSolid(x, y) {
    return !this.canWalk(x, y);
  }

  isWater(x, y) {
    return this._sampleTile(x, y) === "water";
  }

  getGroundType(x, y) {
    return this._sampleTile(x, y);
  }

  getMoveModifier(x, y) {
    const t = this._sampleTile(x, y);
    if (t === "road") return 1.10;
    if (t === "sand") return 0.90;
    if (t === "forest") return 0.84;
    if (t === "rock") return 0.88;
    return 1.0;
  }

  getZoneName(x, y) {
    const t = this._sampleTile(x, y);
    if (t === "water") return "Open Water";
    if (t === "sand") return "Shoreline";
    if (t === "forest") return "Deep Forest";
    if (t === "rock") return "Stone Fields";
    if (t === "road") return "Old Road";
    return "Greenwild";
  }

  getMinimapCanvas() {
    if (!this._minimap || this._minimapDirty) {
      this._rebuildMinimap();
    }
    return this._minimap;
  }

  isRevealed(wx, wy, mode = this.mapMode) {
    const set = mode === "large" ? this._revealedLarge : this._revealedSmall;
    const size = mode === "large" ? 96 : 160;
    const key = `${Math.floor(wx / size)},${Math.floor(wy / size)}`;
    return set.has(key);
  }

  revealAround(x, y, radius) {
    const addTo = (bucketSize, set) => {
      const r = Math.max(bucketSize, radius | 0);
      const x0 = Math.floor((x - r) / bucketSize);
      const x1 = Math.floor((x + r) / bucketSize);
      const y0 = Math.floor((y - r) / bucketSize);
      const y1 = Math.floor((y + r) / bucketSize);

      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const cx = bx * bucketSize + bucketSize * 0.5;
          const cy = by * bucketSize + bucketSize * 0.5;
          const dx = cx - x;
          const dy = cy - y;
          if (dx * dx + dy * dy <= r * r) {
            set.add(`${bx},${by}`);
          }
        }
      }
    };

    addTo(160, this._revealedSmall);
    addTo(96, this._revealedLarge);
    this._minimapDirty = true;
  }

  _tileColor(tile, x, y) {
    const n = (hash2((x / this.tileSize) | 0, (y / this.tileSize) | 0, this.seed) >>> 0) & 7;

    if (tile === "water") {
      return n < 2 ? "#276caa" : n < 5 ? "#2f80c2" : "#3893d8";
    }
    if (tile === "sand") {
      return n < 3 ? "#cab97f" : "#dbc98f";
    }
    if (tile === "road") {
      return n < 3 ? "#798695" : "#8b98a6";
    }
    if (tile === "rock") {
      return n < 3 ? "#70757d" : "#7d848d";
    }
    if (tile === "forest") {
      return n < 3 ? "#2f5d33" : n < 6 ? "#386c3c" : "#2b542f";
    }
    return n < 3 ? "#63a34f" : n < 6 ? "#6fb55a" : "#7bc366";
  }

  _drawTileDecor(ctx, tile, wx, wy) {
    const h = hash2((wx / this.tileSize) | 0, (wy / this.tileSize) | 0, this.seed) >>> 0;

    if (tile === "grass") {
      if (h % 17 === 0) {
        ctx.fillStyle = "rgba(40,98,34,0.56)";
        ctx.fillRect(wx + 7, wy + 7, 2, 7);
        ctx.fillRect(wx + 10, wy + 5, 2, 9);
      }
      if (h % 29 === 0) {
        ctx.fillStyle = "rgba(90,140,68,0.28)";
        ctx.fillRect(wx + 14, wy + 4, 4, 3);
      }
    } else if (tile === "forest") {
      if (h % 6 === 0) {
        ctx.fillStyle = "rgba(26,58,30,0.88)";
        ctx.beginPath();
        ctx.arc(wx + 12, wy + 12, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(34,74,38,0.84)";
        ctx.beginPath();
        ctx.arc(wx + 8, wy + 13, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(wx + 15, wy + 9, 5.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tile === "rock") {
      if (h % 9 === 0) {
        ctx.fillStyle = "rgba(90,96,108,0.55)";
        ctx.fillRect(wx + 6, wy + 7, 8, 5);
      }
    } else if (tile === "water") {
      if (h % 15 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(wx + 6, wy + 11, 8, 1);
      }
      if (h % 31 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(wx + 11, wy + 7, 4, 1);
      }
    } else if (tile === "sand") {
      if (h % 23 === 0) {
        ctx.fillStyle = "rgba(186,166,104,0.24)";
        ctx.fillRect(wx + 9, wy + 9, 5, 2);
      }
    }
  }

  _drawPOIs(ctx) {
    for (const d of this.docks) {
      ctx.fillStyle = "rgba(110,82,52,0.95)";
      ctx.fillRect(d.x - 12, d.y - 4, 24, 8);
      ctx.fillRect(d.x - 6, d.y - 10, 12, 6);
      ctx.strokeStyle = "rgba(50,34,20,0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x - 12, d.y - 4, 24, 8);
    }

    for (const w of this.waystones) {
      ctx.fillStyle = "rgba(214,198,116,0.95)";
      ctx.fillRect(w.x - 6, w.y - 18, 12, 20);
      ctx.fillStyle = "rgba(255,235,140,0.85)";
      ctx.fillRect(w.x - 3, w.y - 14, 6, 8);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(w.x, w.y + 8, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of this.camps) {
      ctx.fillStyle = "rgba(126,74,52,0.96)";
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 10);
      ctx.lineTo(c.x + 12, c.y + 8);
      ctx.lineTo(c.x - 12, c.y + 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255,120,78,0.9)";
      ctx.beginPath();
      ctx.arc(c.x, c.y + 12, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const d of this.dungeons) {
      ctx.fillStyle = "rgba(70,56,84,0.96)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(154,126,214,0.95)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _rebuildMinimap() {
    const size = 220;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(10,14,20,1)";
    ctx.fillRect(0, 0, size, size);

    const half = this.mapMode === "large"
      ? Math.max(4000, this.boundsRadius)
      : Math.max(2000, this.boundsRadius * 0.5);
    const span = half * 2;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const wx = -half + (px / size) * span;
        const wy = -half + (py / size) * span;

        if (!this.isRevealed(wx, wy, this.mapMode)) {
          ctx.fillStyle = "#0b1016";
          ctx.fillRect(px, py, 1, 1);
          continue;
        }

        const tile = this._sampleTile(wx, wy);
        let color = "#5fa44f";
        if (tile === "water") color = "#2d79bd";
        else if (tile === "sand") color = "#d6c68c";
        else if (tile === "road") color = "#8592a0";
        else if (tile === "rock") color = "#767c86";
        else if (tile === "forest") color = "#37653a";

        ctx.fillStyle = color;
        ctx.fillRect(px, py, 1, 1);
      }
    }

    const plot = (wx, wy, color, r = 2) => {
      if (!this.isRevealed(wx, wy, this.mapMode)) return;
      const px = ((wx + half) / span) * size;
      const py = ((wy + half) / span) * size;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const w of this.waystones) plot(w.x, w.y, "#f5dc6a", 2.8);
    for (const d of this.docks) plot(d.x, d.y, "#79dbff", 2.5);
    for (const c2 of this.camps) plot(c2.x, c2.y, "#ff7b6a", 2.2);
    for (const dg of this.dungeons) plot(dg.x, dg.y, "#b68cff", 3);

    this._minimap = c;
    this._minimapDirty = false;
  }

  _sampleTile(x, y) {
    if (x < -this.boundsRadius || x > this.boundsRadius) return "water";
    if (y < -this.boundsRadius || y > this.boundsRadius) return "water";

    const landA = fbm((x + this.seed * 0.11) * 0.00042, (y - this.seed * 0.07) * 0.00042, 4);
    const landB = fbm((x - this.seed * 0.05) * 0.00078, (y + this.seed * 0.09) * 0.00078, 4);
    const med = fbm((x + this.seed * 0.03) * 0.0019, (y + this.seed * 0.04) * 0.0019, 3);
    const rockN = fbm((x - this.seed * 0.02) * 0.0053, (y + this.seed * 0.05) * 0.0053, 2);
    const forestN = fbm((x + this.seed * 0.27) * 0.00165, (y - this.seed * 0.18) * 0.00165, 3);

    const warpX = fbm((x + this.seed * 0.13) * 0.00072, (y - this.seed * 0.21) * 0.00072, 3) * 240;
    const warpY = fbm((x - this.seed * 0.19) * 0.00072, (y + this.seed * 0.16) * 0.00072, 3) * 240;

    const wx = x + warpX;
    const wy = y + warpY;

    const bandA = Math.abs(Math.sin(wx * 0.00094 + this.seed * 0.00017));
    const bandB = Math.abs(Math.sin(wy * 0.00105 - this.seed * 0.00013));
    const bandC = Math.abs(Math.sin((wx + wy) * 0.00058 + this.seed * 0.00009));

    const lakeN = fbm((x + this.seed * 0.23) * 0.00095, (y - this.seed * 0.18) * 0.00095, 3);
    const shoreNoise = fbm((x - this.seed * 0.12) * 0.0034, (y + this.seed * 0.08) * 0.0034, 2);

    let land = landA * 0.60 + landB * 0.40;
    land += med * 0.07;

    if (bandA < 0.11) land -= 0.31;
    else if (bandA < 0.15) land -= 0.13;

    if (bandB < 0.10) land -= 0.22;
    else if (bandB < 0.135) land -= 0.09;

    if (bandC < 0.13) land -= 0.34;
    else if (bandC < 0.17) land -= 0.14;

    if (lakeN < -0.45) land -= 0.24;
    else if (lakeN < -0.35) land -= 0.12;

    const roadWarpX = fbm((x + this.seed * 0.41) * 0.00094, (y - this.seed * 0.27) * 0.00094, 2) * 88;
    const roadWarpY = fbm((x - this.seed * 0.37) * 0.00094, (y + this.seed * 0.33) * 0.00094, 2) * 88;
    const rx = x + roadWarpX;
    const ry = y + roadWarpY;

    const roadA = Math.abs(Math.sin(rx * 0.0017 + this.seed * 0.00021));
    const roadB = Math.abs(Math.sin((rx - ry) * 0.00108 - this.seed * 0.00017));
    const roadField = fbm((x + this.seed * 0.09) * 0.0035, (y - this.seed * 0.06) * 0.0035, 2);

    if (land < 0.09) return "water";
    if (land < 0.18 + shoreNoise * 0.02) return "sand";

    if ((roadA < 0.008 || roadB < 0.007) && roadField > 0.31 && land > 0.47) {
      return "road";
    }

    if (rockN > 0.65 && land > 0.34) return "rock";
    if (forestN > 0.17 && land > 0.22) return "forest";
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
    const waystoneRings = [520, 1250, 2050, 2950, 3850];
    for (let ringIndex = 0; ringIndex < waystoneRings.length; ringIndex++) {
      const ring = waystoneRings[ringIndex];
      const count = 4 + ringIndex;

      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ringIndex * 0.17;
        const sx = this.spawn.x + Math.cos(a) * ring;
        const sy = this.spawn.y + Math.sin(a) * ring;

        const p =
          this._findWaystoneLandNear(sx, sy, 320) ||
          this._findSafeLandPatchNear(sx, sy, 320) ||
          this._findNearbyLand(sx, sy, 320, false, true);

        if (!p) continue;
        this.waystones.push({ id: wid++, x: p.x, y: p.y });
      }
    }

    let did = 1;
    const dockAngles = [0.35, 1.95, 3.7, 5.15];
    for (const a of dockAngles) {
      const sx = this.spawn.x + Math.cos(a) * 820;
      const sy = this.spawn.y + Math.sin(a) * 820;
      const shore = this._findNearbyShore(sx, sy, 440);
      if (!shore) continue;
      this.docks.push({ id: did++, x: shore.x, y: shore.y });
    }

    let cid = 1;
    const campAngles = [0.9, 2.4, 4.4];
    for (const a of campAngles) {
      const sx = this.spawn.x + Math.cos(a) * 980;
      const sy = this.spawn.y + Math.sin(a) * 980;
      const cp =
        this._findSafeLandPatchNear(sx, sy, 340) ||
        this._findNearbyLand(sx, sy, 340, false, true);
      if (!cp) continue;
      this.camps.push({ id: cid++, x: cp.x, y: cp.y });
    }

    const dg =
      this._findSafeLandPatchNear(this.spawn.x + 420, this.spawn.y + 220, 500) ||
      this._findNearbyLand(this.spawn.x + 420, this.spawn.y + 220, 500, false, true) || {
        x: this.spawn.x + 360,
        y: this.spawn.y + 220,
      };

    this.dungeons.push({ id: 1, x: dg.x, y: dg.y, name: "Deep Ruin" });
  }

  _findGoodSpawn() {
    const radii = [0, 48, 96, 144, 192, 240, 320, 420, 560, 720, 900, 1200];

    for (const r of radii) {
      const samples = r <= 240 ? 40 : 72;
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2 + r * 0.0007;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;

        if (this._isSpawnCandidate(x, y)) {
          return { x, y };
        }
      }
    }

    const fallback = this._findSafeLandPatchNear(0, 0, 1800);
    if (fallback) return fallback;

    return { x: 0, y: 0 };
  }

  _isSpawnCandidate(x, y) {
    const t = this._sampleTile(x, y);
    if (!(t === "grass" || t === "road")) return false;

    if (this._isNearWater(x, y, 170)) return false;
    if (!this._hasWalkablePatch(x, y, 72)) return false;
    if (!this._hasWalkablePatch(x, y, 136)) return false;
    if (this._isTrappedByNarrowLand(x, y)) return false;

    return true;
  }

  _hasWalkablePatch(x, y, radius = 64) {
    for (let r = 0; r <= radius; r += 16) {
      const count = r === 0 ? 1 : 16;
      for (let i = 0; i < count; i++) {
        const a = count === 1 ? 0 : (i / count) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!this.canWalk(px, py)) return false;
      }
    }
    return true;
  }

  _isNearWater(x, y, dist = 72) {
    const step = this.tileSize;
    for (let r = step; r <= dist; r += step) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this._sampleTile(px, py) === "water") return true;
      }
    }
    return false;
  }

  _isTrappedInWaterPocket(x, y) {
    if (this.canWalk(x, y)) return false;

    let waterCount = 0;
    let samples = 0;
    for (let r = 16; r <= 120; r += 16) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this._sampleTile(px, py) === "water") waterCount++;
        samples++;
      }
    }

    return samples > 0 && waterCount / samples > 0.55;
  }

  _isTrappedByNarrowLand(x, y) {
    let blockedArcs = 0;
    const testR = 88;

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * testR;
      const py = y + Math.sin(a) * testR;
      if (!this.canWalk(px, py)) blockedArcs++;
    }

    return blockedArcs >= 4;
  }

  _findSafeLandPatchNear(x, y, maxR = 240) {
    for (let r = 0; r <= maxR; r += 16) {
      const samples = r === 0 ? 1 : 40;
      for (let i = 0; i < samples; i++) {
        const a = samples === 1 ? 0 : (i / samples) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this._isSpawnCandidate(px, py)) {
          return { x: px, y: py };
        }
      }
    }
    return null;
  }

  _findNearbyLand(x, y, maxR = 240, allowNearWater = true, avoidWaterStrong = false) {
    let best = null;
    let bestScore = Infinity;

    for (let r = 0; r <= maxR; r += 16) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);

        if (!(t === "grass" || t === "rock" || t === "sand" || t === "road" || t === "forest")) continue;
        if (!allowNearWater && this._isNearWater(px, py, 80)) continue;
        if (avoidWaterStrong && this._isNearWater(px, py, 120)) continue;

        const score = r + (t === "grass" || t === "road" ? 0 : 12);
        if (score < bestScore) {
          bestScore = score;
          best = { x: px, y: py };
        }
      }
    }

    return best;
  }

  _findWaystoneLandNear(x, y, maxR = 260) {
    let best = null;
    let bestScore = Infinity;

    for (let r = 0; r <= maxR; r += 16) {
      const samples = r === 0 ? 1 : 48;
      for (let i = 0; i < samples; i++) {
        const a = samples === 1 ? 0 : (i / samples) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);

        if (!(t === "grass" || t === "road")) continue;
        if (this._isNearWater(px, py, 110)) continue;
        if (!this._hasWalkablePatch(px, py, 56)) continue;

        const score = r;
        if (score < bestScore) {
          bestScore = score;
          best = { x: px, y: py };
        }
      }
    }

    return best;
  }

  _findNearbyShore(x, y, maxR = 240) {
    let best = null;
    let bestScore = Infinity;

    for (let r = 0; r <= maxR; r += 16) {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const t = this._sampleTile(px, py);

        if (t !== "sand" && t !== "grass" && t !== "road") continue;

        const waterTouch =
          this.isWater(px + 24, py) ||
          this.isWater(px - 24, py) ||
          this.isWater(px, py + 24) ||
          this.isWater(px, py - 24);

        if (!waterTouch) continue;

        const landBehind =
          this.canWalk(px + 40, py) ||
          this.canWalk(px - 40, py) ||
          this.canWalk(px, py + 40) ||
          this.canWalk(px, py - 40);

        if (!landBehind) continue;

        const usable =
          this.canWalk(px + 18, py) ||
          this.canWalk(px - 18, py) ||
          this.canWalk(px, py + 18) ||
          this.canWalk(px, py - 18);

        if (!usable) continue;

        const score = r + (t === "sand" ? 0 : 18);
        if (score < bestScore) {
          bestScore = score;
          best = { x: px, y: py };
        }
      }
    }

    return best || this._findNearbyLand(x, y, maxR, true, false);
  }
}