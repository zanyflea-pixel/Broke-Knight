// src/world.js
// v104.1 WORLD FIXED FULL FILE
// - syntactically complete
// - safe spawn handling
// - compatible with current game.js / ui.js
// - keeps camps / waystones / dungeons / docks / minimap support

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
    this._generatePOIs();
    this._findSafeSpawn();
    this._mapDirty = true;
  }

  _height(x, y) {
    return fbm(x * 0.0006, y * 0.0006, this.seed, 5);
  }

  _moisture(x, y) {
    return fbm(x * 0.0008, y * 0.0008, this.seed + 200, 4);
  }

  _riverField(x, y) {
    const nx = x * 0.0014;
    const ny = y * 0.0014;

    const warpX = fbm(nx + 7, ny - 5, this.seed + 100, 3) * 1.8;
    const warpY = fbm(nx - 6, ny + 4, this.seed + 200, 3) * 1.8;

    const v1 = Math.abs(Math.sin(nx * 1.15 + warpX) + Math.cos(ny * 0.82 + warpY));
    const v2 = Math.abs(Math.sin((nx + ny) * 0.55 + warpX * 0.7));
    return Math.min(v1, v2 + 0.28);
  }

  _isWater(x, y) {
    const h = this._height(x, y);
    const river = this._riverField(x, y);

    const spawnDx = x - this.spawn.x;
    const spawnDy = y - this.spawn.y;
    const spawnD2 = spawnDx * spawnDx + spawnDy * spawnDy;

    if (spawnD2 < 220 * 220) return false;
    return h < 0.42 || river < 0.08;
  }

  _tileColor(x, y) {
    if (this._isWater(x, y)) {
      return "#2a6fa8";
    }

    const h = this._height(x, y);
    const m = this._moisture(x, y);

    if (h > 0.78) return "#bcc4c9";
    if (h > 0.66) return "#8b8f93";
    if (m > 0.66) return "#2f7e35";
    if (m < 0.28) return "#a79a69";
    return "#4f7d45";
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
    if (h > 0.7) return 0.94;
    return 1;
  }

  getZoneName(x, y) {
    if (this._isWater(x, y)) return "river";
    const h = this._height(x, y);
    const m = this._moisture(x, y);

    if (h > 0.78) return "mountain";
    if (h > 0.66) return "stone flats";
    if (m > 0.66) return "deep wilds";
    if (m < 0.28) return "ashlands";
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
    ];

    for (const p of tries) {
      const safe = this._findSafeLandPatchNear(p.x, p.y, 360);
      if (safe) {
        this.spawn = safe;
        return;
      }
    }

    for (let i = 0; i < 1600; i++) {
      const x = this.rng.range(-900, 900);
      const y = this.rng.range(-900, 900);
      if (!this._isWater(x, y)) {
        this.spawn = { x, y };
        return;
      }
    }

    this.spawn = { x: 0, y: 0 };
  }

  _findSafeLandPatchNear(x, y, radius = 180) {
    for (let r = 0; r <= radius; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!this._isWater(px, py)) {
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
        220
      );
      if (p) this.camps.push({ x: p.x, y: p.y, id: `camp-${i}` });
    }

    for (let i = 0; i < 6; i++) {
      const p = this._findSafeLandPatchNear(
        this.rng.range(-4000, 4000),
        this.rng.range(-4000, 4000),
        260
      );
      if (p) this.waystones.push({ x: p.x, y: p.y, id: `way-${i}` });
    }

    for (let i = 0; i < 10; i++) {
      const p = this._findSafeLandPatchNear(
        this.rng.range(-4500, 4500),
        this.rng.range(-4500, 4500),
        260
      );
      if (p) this.dungeons.push({ x: p.x, y: p.y, id: `dng-${i}` });
    }

    for (let i = 0; i < 40; i++) {
      const x = this.rng.range(-4200, 4200);
      const y = this.rng.range(-4200, 4200);

      if (!this._isWater(x, y) && this._isWater(x + 28, y)) {
        this.docks.push({ x, y, id: `dock-${this.docks.length}` });
      } else if (!this._isWater(x, y) && this._isWater(x - 28, y)) {
        this.docks.push({ x, y, id: `dock-${this.docks.length}` });
      } else if (!this._isWater(x, y) && this._isWater(x, y + 28)) {
        this.docks.push({ x, y, id: `dock-${this.docks.length}` });
      } else if (!this._isWater(x, y) && this._isWater(x, y - 28)) {
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
          if (m > 0.62 && ((x + y) / size) % 5 === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(x + 6, y + 8, 8, 12);
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