// src/world.js
// v104.2 WORLD LAND BALANCE FIX
// - much more land
// - narrower rivers
// - safer spawn meadow
// - keeps camps / waystones / dungeons / docks / minimap support
// - compatible with current game.js / ui.js / util.js

import { fbm, clamp, RNG } from "./util.js";

export default class World {
  constructor(seed = 1, opts = {}) {
    this.seed = seed | 0;
    this.rng = new RNG(this.seed || 1);

    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.mapHalfSize = 5200;
    this.boundsHalfSize = 7000;

    this.spawn = { x: 0, y: 0 };
    this.mapMode = "small";

    this.camps = [];
    this.waystones = [];
    this.dungeons = [];
    this.docks = [];

    this._mapCanvas = null;
    this._mapInfo = null;
    this._mapDirty = true;

    this._initWorld();
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  update() {}

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "big" : "small";
  }

  _initWorld() {
    this._findSafeSpawn();
    this._generatePOIs();
    this._mapDirty = true;
  }

  _height(x, y) {
    const base = fbm(x * 0.00042, y * 0.00042, this.seed, 5);
    const detail = fbm(x * 0.0012, y * 0.0012, this.seed + 77, 3);
    return base * 0.82 + detail * 0.18;
  }

  _moisture(x, y) {
    const a = fbm(x * 0.0007, y * 0.0007, this.seed + 200, 4);
    const b = fbm(x * 0.0015, y * 0.0015, this.seed + 311, 2);
    return a * 0.8 + b * 0.2;
  }

  _riverField(x, y) {
    const nx = x * 0.00105;
    const ny = y * 0.00105;

    const warpX = (fbm(nx + 7.3, ny - 5.1, this.seed + 100, 3) - 0.5) * 2.1;
    const warpY = (fbm(nx - 6.2, ny + 4.4, this.seed + 200, 3) - 0.5) * 2.1;

    const r1 = Math.abs(Math.sin(nx * 0.95 + warpX * 1.3) + Math.cos(ny * 0.62 + warpY * 1.1));
    const r2 = Math.abs(Math.sin((nx * 0.55 + ny * 0.32) + warpX * 0.85));
    return Math.min(r1, r2 + 0.42);
  }

  _isRiverWater(x, y) {
    const river = this._riverField(x, y);
    return river < 0.03;
  }

  _isLowlandWater(x, y) {
    const h = this._height(x, y);

    // Much less flooding than before.
    // Only very low terrain becomes water.
    return h < 0.255;
  }

  _isWater(x, y) {
    const dx = x - this.spawn.x;
    const dy = y - this.spawn.y;
    const spawnD2 = dx * dx + dy * dy;

    // Keep starting area clearly walkable.
    if (spawnD2 < 320 * 320) return false;

    return this._isLowlandWater(x, y) || this._isRiverWater(x, y);
  }

  _tileColor(x, y) {
    if (this._isWater(x, y)) {
      const river = this._riverField(x, y);
      return river < 0.03 ? "#2f7fb8" : "#2c6a9a";
    }

    const h = this._height(x, y);
    const m = this._moisture(x, y);

    if (h > 0.82) return "#c3c9ce";
    if (h > 0.70) return "#8f938f";
    if (m > 0.72) return "#2f7f39";
    if (m > 0.56) return "#4f8a46";
    if (m < 0.24) return "#a79a69";
    return "#6aa04f";
  }

  canWalk(x, y, actor = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;

    const inWater = this._isWater(x, y);
    const onDock = this._isNearDock(x, y, 18);

    if (actor?.state?.sailing) {
      return inWater || onDock;
    }

    return !inWater;
  }

  getMoveModifier(x, y) {
    if (this._isWater(x, y)) return 0.92;
    const h = this._height(x, y);
    if (h > 0.74) return 0.95;
    return 1;
  }

  getZoneName(x, y) {
    if (this._isWater(x, y)) return "river";

    const h = this._height(x, y);
    const m = this._moisture(x, y);

    if (h > 0.82) return "mountain";
    if (h > 0.70) return "stone flats";
    if (m > 0.72) return "deep wilds";
    if (m < 0.24) return "ashlands";
    if (m > 0.56) return "forest";
    return "meadow";
  }

  getZoneInfo(x, y) {
    const zone = this.getZoneName(x, y);
    return {
      name: zone,
      biome: zone,
      nearWater: this._isWater(x, y),
      color: this._tileColor(x, y),
    };
  }

  _findSafeSpawn() {
    const tries = [
      { x: 0, y: 0 },
      { x: -120, y: 90 },
      { x: 140, y: -110 },
      { x: 220, y: 170 },
      { x: -240, y: -180 },
      { x: 310, y: 60 },
      { x: -320, y: 40 },
    ];

    for (const p of tries) {
      const safe = this._findSafeLandPatchNear(p.x, p.y, 420);
      if (safe) {
        this.spawn = safe;
        return;
      }
    }

    for (let i = 0; i < 1800; i++) {
      const x = this.rng.range(-1200, 1200);
      const y = this.rng.range(-1200, 1200);
      if (!this._isLowlandWater(x, y) && !this._isRiverWater(x, y)) {
        this.spawn = { x, y };
        return;
      }
    }

    this.spawn = { x: 0, y: 0 };
  }

  _findSafeLandPatchNear(x, y, radius = 200) {
    for (let r = 0; r <= radius; r += 18) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!this._isLowlandWater(px, py) && !this._isRiverWater(px, py)) {
          return { x: px, y: py };
        }
      }
    }
    return null;
  }

  _isNearDock(x, y, radius = 16) {
    const r2 = radius * radius;
    for (const d of this.docks) {
      const dx = x - d.x;
      const dy = y - d.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _generatePOIs() {
    this.camps = [];
    this.waystones = [];
    this.dungeons = [];
    this.docks = [];

    for (let i = 0; i < 20; i++) {
      const p = this._findSafeLandPatchNear(
        this.rng.range(-3000, 3000),
        this.rng.range(-3000, 3000),
        260
      );
      if (p) this.camps.push({ x: p.x, y: p.y, id: `camp-${i}` });
    }

    for (let i = 0; i < 6; i++) {
      const p = this._findSafeLandPatchNear(
        this.rng.range(-4000, 4000),
        this.rng.range(-4000, 4000),
        280
      );
      if (p) this.waystones.push({ x: p.x, y: p.y, id: `way-${i}` });
    }

    for (let i = 0; i < 10; i++) {
      const p = this._findSafeLandPatchNear(
        this.rng.range(-4500, 4500),
        this.rng.range(-4500, 4500),
        280
      );
      if (p) this.dungeons.push({ x: p.x, y: p.y, id: `dng-${i}` });
    }

    for (let i = 0; i < 70; i++) {
      const x = this.rng.range(-4200, 4200);
      const y = this.rng.range(-4200, 4200);

      const land = !this._isWater(x, y);
      const waterR = this._isWater(x + 30, y);
      const waterL = this._isWater(x - 30, y);
      const waterD = this._isWater(x, y + 30);
      const waterU = this._isWater(x, y - 30);

      if (land && (waterR || waterL || waterD || waterU)) {
        this.docks.push({ x, y, id: `dock-${this.docks.length}` });
      }

      if (this.docks.length >= 12) break;
    }
  }

  draw(ctx, camera, hero) {
    const size = 40;

    const left = camera.x - this.viewW * 0.5 - 120;
    const top = camera.y - this.viewH * 0.5 - 120;
    const right = camera.x + this.viewW * 0.5 + 120;
    const bottom = camera.y + this.viewH * 0.5 + 120;

    const startX = Math.floor(left / size) * size;
    const startY = Math.floor(top / size) * size;

    for (let x = startX; x < right; x += size) {
      for (let y = startY; y < bottom; y += size) {
        ctx.fillStyle = this._tileColor(x, y);
        ctx.fillRect(x, y, size + 1, size + 1);

        if (!this._isWater(x, y)) {
          const m = this._moisture(x, y);
          if (m > 0.66 && (((x / size) | 0) + ((y / size) | 0)) % 5 === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.035)";
            ctx.fillRect(x + 7, y + 8, 8, 12);
          } else if (m > 0.48 && (((x / size) | 0) + ((y / size) | 0)) % 7 === 0) {
            ctx.fillStyle = "rgba(20,60,18,0.18)";
            ctx.fillRect(x + 12, y + 10, 5, 9);
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(x + 4, y + 10, size - 8, 2);
        }
      }
    }

    this._drawPOIs(ctx);
  }

  _drawPOIs(ctx) {
    ctx.fillStyle = "#ffdc63";
    for (const c of this.camps) {
      ctx.fillRect(c.x - 5, c.y - 5, 10, 10);
    }

    ctx.fillStyle = "#7fe8ff";
    for (const w of this.waystones) {
      ctx.fillRect(w.x - 5, w.y - 5, 10, 10);
    }

    ctx.fillStyle = "#dc7cff";
    for (const d of this.dungeons) {
      ctx.fillRect(d.x - 5, d.y - 5, 10, 10);
    }

    ctx.fillStyle = "#ffffff";
    for (const d of this.docks) {
      ctx.fillRect(d.x - 4, d.y - 4, 8, 8);
    }
  }

  getMapInfo() {
    if (!this._mapDirty && this._mapInfo) return this._mapInfo;

    const size = 128;
    const colors = [];
    const revealed = [];
    const tiles = [];

    for (let r = 0; r < size; r++) {
      const colorRow = [];
      const revealRow = [];
      const tileRow = [];

      for (let c = 0; c < size; c++) {
        const wx = -this.mapHalfSize + (c + 0.5) * ((this.mapHalfSize * 2) / size);
        const wy = -this.mapHalfSize + (r + 0.5) * ((this.mapHalfSize * 2) / size);
        const col = this._tileColor(wx, wy);
        colorRow.push(col);
        tileRow.push(col);
        revealRow.push(true);
      }

      colors.push(colorRow);
      tiles.push(tileRow);
      revealed.push(revealRow);
    }

    this._mapInfo = { size, colors, tiles, revealed };
    this._mapDirty = false;
    return this._mapInfo;
  }

  getMinimapCanvas() {
    if (this._mapCanvas && !this._mapDirty) return this._mapCanvas;

    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const wx = -this.mapHalfSize + (c + 0.5) * ((this.mapHalfSize * 2) / size);
        const wy = -this.mapHalfSize + (r + 0.5) * ((this.mapHalfSize * 2) / size);
        ctx.fillStyle = this._tileColor(wx, wy);
        ctx.fillRect(c, r, 1, 1);
      }
    }

    this._mapCanvas = canvas;
    this._mapDirty = false;
    return this._mapCanvas;
  }
}