// src/world.js
// v103.4 WORLD RESTORE (natural terrain + rivers + POIs)

import { fbm, ridge, clamp, RNG } from "./util.js";

export default class World {
  constructor(seed = 1) {
    this.seed = seed;
    this.rng = new RNG(seed);

    this.mapHalfSize = 5200;

    this.spawn = { x: 0, y: 0 };

    this.camps = [];
    this.waystones = [];
    this.dungeons = [];
    this.docks = [];

    this._initWorld();
  }

  /* =========================
     WORLD GEN
  ========================= */

  _initWorld() {
    this._generatePOIs();
    this._findSafeSpawn();
  }

  _findSafeSpawn() {
    // try multiple positions until we find safe land
    for (let i = 0; i < 1000; i++) {
      const x = this.rng.range(-500, 500);
      const y = this.rng.range(-500, 500);

      if (!this._isWater(x, y)) {
        this.spawn.x = x;
        this.spawn.y = y;
        return;
      }
    }

    this.spawn = { x: 0, y: 0 };
  }

  /* =========================
     TERRAIN
  ========================= */

  _height(x, y) {
    return fbm(x * 0.0006, y * 0.0006, this.seed, 5);
  }

  _moisture(x, y) {
    return fbm(x * 0.0008, y * 0.0008, this.seed + 200, 4);
  }

  _isWater(x, y) {
    const h = this._height(x, y);

    // river carve
    const river = this._riverField(x, y);

    return h < 0.42 || river < 0.08;
  }

  _riverField(x, y) {
    // curved rivers using noise distortion
    const nx = x * 0.0015;
    const ny = y * 0.0015;

    const warpX = fbm(nx + 5, ny + 5, this.seed + 100) * 2;
    const warpY = fbm(nx - 5, ny - 5, this.seed + 200) * 2;

    const v = Math.abs(Math.sin(nx + warpX) + Math.cos(ny + warpY));

    return v;
  }

  _tileColor(x, y) {
    if (this._isWater(x, y)) {
      return "#2a6fa8"; // blue water
    }

    const h = this._height(x, y);
    const m = this._moisture(x, y);

    if (h > 0.75) return "#bfc5c9"; // mountains
    if (h > 0.6) return "#8c8f93";  // rocky
    if (m > 0.6) return "#2e7d32";  // lush
    if (m < 0.3) return "#a89b6a";  // dry
    return "#4f7d45";               // grass
  }

  /* =========================
     WALKING
  ========================= */

  canWalk(x, y) {
    return !this._isWater(x, y);
  }

  /* =========================
     POIs
  ========================= */

  _generatePOIs() {
    for (let i = 0; i < 20; i++) {
      const x = this.rng.range(-3000, 3000);
      const y = this.rng.range(-3000, 3000);

      if (!this._isWater(x, y)) {
        this.camps.push({ x, y });
      }
    }

    for (let i = 0; i < 6; i++) {
      this.waystones.push({
        x: this.rng.range(-4000, 4000),
        y: this.rng.range(-4000, 4000),
      });
    }

    for (let i = 0; i < 10; i++) {
      this.dungeons.push({
        x: this.rng.range(-4500, 4500),
        y: this.rng.range(-4500, 4500),
      });
    }

    // docks near water edges
    for (let i = 0; i < 20; i++) {
      const x = this.rng.range(-4000, 4000);
      const y = this.rng.range(-4000, 4000);

      if (!this._isWater(x, y) && this._isWater(x + 30, y)) {
        this.docks.push({ x, y });
      }
    }
  }

  /* =========================
     DRAW
  ========================= */

  draw(ctx, camera, hero) {
    const size = 40;

    const startX = Math.floor((camera.x - 200) / size) * size;
    const startY = Math.floor((camera.y - 200) / size) * size;

    const endX = camera.x + ctx.canvas.width + 200;
    const endY = camera.y + ctx.canvas.height + 200;

    for (let x = startX; x < endX; x += size) {
      for (let y = startY; y < endY; y += size) {
        ctx.fillStyle = this._tileColor(x, y);
        ctx.fillRect(x, y, size + 1, size + 1);
      }
    }

    this._drawPOIs(ctx);
  }

  _drawPOIs(ctx) {
    ctx.fillStyle = "#ff0";
    for (const c of this.camps) {
      ctx.fillRect(c.x - 5, c.y - 5, 10, 10);
    }

    ctx.fillStyle = "#0ff";
    for (const w of this.waystones) {
      ctx.fillRect(w.x - 5, w.y - 5, 10, 10);
    }

    ctx.fillStyle = "#f0f";
    for (const d of this.dungeons) {
      ctx.fillRect(d.x - 5, d.y - 5, 10, 10);
    }

    ctx.fillStyle = "#fff";
    for (const d of this.docks) {
      ctx.fillRect(d.x - 4, d.y - 4, 8, 8);
    }
  }
}