// src/world.js
// v97.8 WORLD MAP + WATER PASS
// - larger terrain regions
// - cleaner, broader water
// - stable discovery data for minimap + world map
// - camps / docks / waystones / dungeons supported
// - unknown border outside mapped world

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fract(x) {
  return x - Math.floor(x);
}

function hash2(x, y, seed = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return fract(v);
}

function valueNoise2D(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = x - x0;
  const ty = y - y0;

  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

function fbm2D(x, y, seed = 0, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }

  return norm > 0 ? value / norm : 0;
}

export default class World {
  constructor(seed = 1, opts = {}) {
    this.seed = seed | 0;
    this.viewW = opts.viewW || 1280;
    this.viewH = opts.viewH || 720;

    this.mapHalfSize = 6200;
    this.boundsHalfSize = 8200;

    this.tileSize = 64;

    // Discovery / map tiles. Bigger tile = smoother, chunkier reveal.
    this.mapTile = 24;
    this.minimapScale = 1;
    this.mapScaleIndex = 0;
    this.mapScaleSteps = [1, 1.35, 1.75, 2.2];

    this.spawn = { x: 0, y: 0 };

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];

    this._poiBuilt = false;

    this.revealCols = Math.ceil((this.mapHalfSize * 2) / this.mapTile);
    this.revealRows = Math.ceil((this.mapHalfSize * 2) / this.mapTile);
    this.revealed = Array.from({ length: this.revealRows }, () => new Uint8Array(this.revealCols));

    // Cache for map colors so large map draw is smoother and water looks consistent.
    this._mapColorCache = new Map();

    this._revealAround(this.spawn.x, this.spawn.y, 190);
    this._generatePOIs();
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  toggleMapScale() {
    this.mapScaleIndex = (this.mapScaleIndex + 1) % this.mapScaleSteps.length;
    this.minimapScale = this.mapScaleSteps[this.mapScaleIndex];
  }

  update(dt, hero) {
    void dt;
    if (!hero) return;
    this._revealAround(hero.x, hero.y, 155);
  }

  draw(ctx, camera) {
    const z = camera?.zoom || 1;
    const halfW = this.viewW * 0.5 / z;
    const halfH = this.viewH * 0.5 / z;

    const x0 = Math.floor((camera.x - halfW - 160) / this.tileSize);
    const x1 = Math.floor((camera.x + halfW + 160) / this.tileSize);
    const y0 = Math.floor((camera.y - halfH - 160) / this.tileSize);
    const y1 = Math.floor((camera.y + halfH + 160) / this.tileSize);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = tx * this.tileSize;
        const wy = ty * this.tileSize;
        const cell = this._sampleCell(wx + this.tileSize * 0.5, wy + this.tileSize * 0.5);
        this._drawGroundTile(ctx, wx, wy, this.tileSize, cell);
      }
    }

    this._drawPOIs(ctx);
  }

  canWalk(x, y) {
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;
    const c = this._sampleCell(x, y);
    return !c.isWater;
  }

  getZoneName(x, y) {
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) {
      return "Unknown";
    }

    const c = this._sampleCell(x, y);
    return c.zone;
  }

  getMapInfo() {
    return {
      mapHalfSize: this.mapHalfSize,
      boundsHalfSize: this.boundsHalfSize,
      mapTile: this.mapTile,
      revealed: this.revealed,
      cols: this.revealCols,
      rows: this.revealRows,
      scale: this.minimapScale,
      camps: this.camps,
      docks: this.docks,
      waystones: this.waystones,
      dungeons: this.dungeons,
    };
  }

  isRevealedWorld(x, y) {
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) return false;
    const gx = clamp(Math.floor((x + this.mapHalfSize) / this.mapTile), 0, this.revealCols - 1);
    const gy = clamp(Math.floor((y + this.mapHalfSize) / this.mapTile), 0, this.revealRows - 1);
    return !!this.revealed[gy][gx];
  }

  getMapCellAtWorld(x, y) {
    return this._sampleCell(x, y);
  }

  getMapColorAtWorld(x, y) {
    const gx = Math.floor((x + this.mapHalfSize) / this.mapTile);
    const gy = Math.floor((y + this.mapHalfSize) / this.mapTile);
    const key = `${gx},${gy}`;

    const cached = this._mapColorCache.get(key);
    if (cached) return cached;

    const cell = this._sampleCell(x, y);
    const color = this._mapColorFromCell(cell);
    this._mapColorCache.set(key, color);
    return color;
  }

  _sampleCell(x, y) {
    const outsideMain = Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize;

    if (outsideMain) {
      const u = fbm2D(x * 0.00105, y * 0.00105, this.seed + 991, 4);
      const uw = fbm2D(x * 0.0020, y * 0.0020, this.seed + 1231, 3);
      const water = u > 0.74 && uw > 0.48;

      return {
        zone: "Unknown",
        isWater: water,
        ground: water ? "unknown_water" : "unknown_land",
        fert: 0,
        dry: 0.65,
        rugged: 0.8,
      };
    }

    // Large-scale biome controls.
    const macro = fbm2D(x * 0.00022, y * 0.00022, this.seed + 11, 5);
    const macro2 = fbm2D(x * 0.00033, y * 0.00033, this.seed + 41, 4);
    const moisture = fbm2D(x * 0.00036, y * 0.00036, this.seed + 77, 4);
    const heat = fbm2D(x * 0.00028, y * 0.00028, this.seed + 133, 4);
    const rugged = fbm2D(x * 0.00052, y * 0.00052, this.seed + 205, 4);

    // Water shaping:
    // - fewer tiny rivers
    // - a couple broad directional river systems
    // - lake basins in wet areas
    const riverA = Math.abs(fbm2D(x * 0.00014, y * 0.00088, this.seed + 301, 4) - 0.5);
    const riverB = Math.abs(fbm2D(x * 0.00086, y * 0.00016, this.seed + 377, 4) - 0.5);
    const riverC = Math.abs(fbm2D(x * 0.00032, y * 0.00058, this.seed + 411, 4) - 0.5);
    const lake = fbm2D(x * 0.00062, y * 0.00062, this.seed + 443, 5);

    const broadRiver = riverA < 0.024 || riverB < 0.023;
    const supportingRiver = riverC < 0.017 && moisture > 0.54;
    const lakeWater = lake > 0.76 && moisture > 0.60;

    // Keep the spawn area safer and greener.
    const safeCore = Math.abs(x) < 1350 && Math.abs(y) < 1350;
    const isWater = !safeCore && (broadRiver || supportingRiver || lakeWater);

    if (isWater) {
      let zone = "Riverbank";
      if (macro < 0.27) zone = "Shoreline";
      return {
        zone,
        isWater: true,
        ground: "water",
        fert: moisture,
        dry: 1 - moisture,
        rugged,
      };
    }

    let zone = "High Meadow";

    if (macro < 0.15) {
      zone = "Shoreline";
    } else if (macro < 0.31) {
      zone = "High Meadow";
    } else if (macro < 0.49) {
      zone = moisture > 0.58 ? "Whisper Grass" : "Old Road";
    } else if (macro < 0.67) {
      zone = heat > 0.60 ? "Ash Fields" : "Pine Verge";
    } else {
      zone = rugged > 0.56 || macro2 > 0.60 ? "Stone Flats" : "Pine Verge";
    }

    // Larger square safe area near spawn.
    if (Math.abs(x) < 1550 && Math.abs(y) < 1550) {
      zone = "High Meadow";
    } else if (Math.abs(x) < 2200 && Math.abs(y) < 2200 && zone === "Ash Fields") {
      zone = "Pine Verge";
    }

    let ground = "grass";
    if (zone === "Pine Verge") ground = "pine";
    else if (zone === "Whisper Grass") ground = "lush";
    else if (zone === "Ash Fields") ground = "ash";
    else if (zone === "Stone Flats") ground = "stone";
    else if (zone === "Old Road") ground = "road";
    else if (zone === "Shoreline") ground = "shore";
    else if (zone === "Riverbank") ground = "riverbank";

    return {
      zone,
      isWater: false,
      ground,
      fert: moisture,
      dry: 1 - moisture,
      rugged,
    };
  }

  _mapColorFromCell(cell) {
    if (!cell) return "#2a2f38";
    if (cell.ground === "water") return "#3f87b8";
    if (cell.ground === "unknown_water") return "#22384c";
    if (cell.ground === "unknown_land") return "#3a4334";
    if (cell.ground === "pine") return "#607d4d";
    if (cell.ground === "lush") return "#56ad5d";
    if (cell.ground === "ash") return "#8d7862";
    if (cell.ground === "stone") return "#84857d";
    if (cell.ground === "road") return "#9b885e";
    if (cell.ground === "shore") return "#b9a66d";
    if (cell.ground === "riverbank") return "#829f67";
    return "#74ae64";
  }

  _drawGroundTile(ctx, x, y, s, cell) {
    if (cell.ground === "water" || cell.ground === "unknown_water") {
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, cell.ground === "unknown_water" ? "#244055" : "#2f86bc");
      g.addColorStop(1, cell.ground === "unknown_water" ? "#182735" : "#1f597e");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, s, s);

      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x, y + 10, s, 4);
      ctx.fillRect(x, y + 30, s, 3);
      ctx.fillRect(x, y + 48, s, 2);
      return;
    }

    if (cell.ground === "unknown_land") {
      ctx.fillStyle = "#394233";
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(x + 6, y + 6, s - 12, 6);
      return;
    }

    let base = "#6ea95f";
    let shade = "#5f9452";

    if (cell.ground === "grass") {
      base = "#78b866";
      shade = "#679d58";
    } else if (cell.ground === "lush") {
      base = "#69bb63";
      shade = "#58a456";
    } else if (cell.ground === "pine") {
      base = "#6d9a58";
      shade = "#567947";
    } else if (cell.ground === "ash") {
      base = "#8d7a63";
      shade = "#6f604f";
    } else if (cell.ground === "stone") {
      base = "#8d8e85";
      shade = "#72746d";
    } else if (cell.ground === "road") {
      base = "#9f8d63";
      shade = "#85744e";
    } else if (cell.ground === "shore") {
      base = "#c0b07c";
      shade = "#a29163";
    } else if (cell.ground === "riverbank") {
      base = "#87a86a";
      shade = "#6f8f54";
    }

    ctx.fillStyle = base;
    ctx.fillRect(x, y, s, s);

    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(x, y + s * 0.60, s, s * 0.40);

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x + 4, y + 4, s - 8, 8);

    if (cell.ground === "pine") {
      this._drawPinePatch(ctx, x, y, s);
    } else if (cell.ground === "lush" || cell.ground === "grass") {
      this._drawGrassPatch(ctx, x, y, s, shade);
    } else if (cell.ground === "ash") {
      this._drawAshPatch(ctx, x, y, s);
    } else if (cell.ground === "stone") {
      this._drawStonePatch(ctx, x, y, s);
    } else if (cell.ground === "road") {
      this._drawRoadPatch(ctx, x, y, s);
    } else if (cell.ground === "shore" || cell.ground === "riverbank") {
      this._drawShorePatch(ctx, x, y, s);
    }
  }

  _drawGrassPatch(ctx, x, y, s, shade) {
    ctx.fillStyle = shade;
    ctx.fillRect(x + 8, y + 42, 5, 10);
    ctx.fillRect(x + 22, y + 36, 4, 12);
    ctx.fillRect(x + 39, y + 44, 4, 9);
    ctx.fillRect(x + 50, y + 39, 5, 11);
  }

  _drawPinePatch(ctx, x, y, s) {
    ctx.fillStyle = "#42663a";
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 38);
    ctx.lineTo(x + 24, y + 18);
    ctx.lineTo(x + 32, y + 38);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + 42, y + 34);
    ctx.lineTo(x + 49, y + 16);
    ctx.lineTo(x + 56, y + 34);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#5c4330";
    ctx.fillRect(x + 23, y + 38, 2, 7);
    ctx.fillRect(x + 48, y + 34, 2, 6);
  }

  _drawAshPatch(ctx, x, y, s) {
    ctx.fillStyle = "#6d6256";
    ctx.fillRect(x + 10, y + 43, 10, 6);
    ctx.fillRect(x + 35, y + 38, 12, 7);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 12, y + 44, 4, 2);
  }

  _drawStonePatch(ctx, x, y, s) {
    ctx.fillStyle = "#6e706a";
    ctx.fillRect(x + 12, y + 42, 8, 6);
    ctx.fillRect(x + 28, y + 36, 10, 7);
    ctx.fillRect(x + 46, y + 43, 7, 5);
  }

  _drawRoadPatch(ctx, x, y, s) {
    ctx.fillStyle = "rgba(90,72,42,0.24)";
    ctx.fillRect(x, y + 26, s, 10);
  }

  _drawShorePatch(ctx, x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 7, y + 40, 10, 3);
    ctx.fillRect(x + 28, y + 36, 8, 3);
    ctx.fillRect(x + 48, y + 43, 7, 2);
  }

  _drawPOIs(ctx) {
    for (const camp of this.camps) this._drawCamp(ctx, camp);
    for (const dock of this.docks) this._drawDock(ctx, dock);
    for (const ws of this.waystones) this._drawWaystone(ctx, ws);
    for (const d of this.dungeons) this._drawDungeon(ctx, d);
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

  _generatePOIs() {
    if (this._poiBuilt) return;
    this._poiBuilt = true;

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];

    const campSeeds = [
      [-2200, -1200],
      [1800, -1600],
      [-1700, 1700],
      [2200, 1400],
      [0, 2300],
    ];

    const waystoneSeeds = [
      [-2600, 0],
      [2600, 0],
      [0, -2600],
      [0, 2600],
    ];

    const dungeonSeeds = [
      [-3200, -300],
      [3200, 450],
      [-600, 3200],
      [700, -3300],
    ];

    const dockSeeds = [
      [-3500, 1200],
      [3600, -1100],
    ];

    let idn = 1;

    for (const [x, y] of campSeeds) {
      const p = this._findSafeLandPatchNear(x, y, 320);
      if (!p) continue;
      this.camps.push({
        id: `camp_${idn++}`,
        name: "Traveler Camp",
        x: p.x,
        y: p.y,
      });
    }

    for (const [x, y] of waystoneSeeds) {
      const p = this._findSafeLandPatchNear(x, y, 240);
      if (!p) continue;
      this.waystones.push({
        id: `waystone_${idn++}`,
        x: p.x,
        y: p.y,
      });
    }

    for (const [x, y] of dungeonSeeds) {
      const p = this._findSafeLandPatchNear(x, y, 260);
      if (!p) continue;
      this.dungeons.push({
        id: `dungeon_${idn++}`,
        x: p.x,
        y: p.y,
      });
    }

    for (const [x, y] of dockSeeds) {
      const p = this._findNearWaterLandPatch(x, y, 420);
      if (!p) continue;
      this.docks.push({
        id: `dock_${idn++}`,
        x: p.x,
        y: p.y,
      });
    }
  }

  _findSafeLandPatchNear(x, y, radius = 200) {
    const step = 32;

    for (let r = 0; r <= radius; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this.canWalk(px, py)) {
          return { x: Math.round(px), y: Math.round(py) };
        }
      }
    }

    return this.canWalk(x, y) ? { x: Math.round(x), y: Math.round(y) } : null;
  }

  _findNearWaterLandPatch(x, y, radius = 240) {
    const step = 32;
    for (let r = 0; r <= radius; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!this.canWalk(px, py)) continue;

        const nearWater =
          !this.canWalk(px + 48, py) ||
          !this.canWalk(px - 48, py) ||
          !this.canWalk(px, py + 48) ||
          !this.canWalk(px, py - 48);

        if (nearWater) {
          return { x: Math.round(px), y: Math.round(py) };
        }
      }
    }
    return this._findSafeLandPatchNear(x, y, radius);
  }

  _revealAround(x, y, radius = 140) {
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) return;

    const minX = clamp(Math.floor((x - radius + this.mapHalfSize) / this.mapTile), 0, this.revealCols - 1);
    const maxX = clamp(Math.floor((x + radius + this.mapHalfSize) / this.mapTile), 0, this.revealCols - 1);
    const minY = clamp(Math.floor((y - radius + this.mapHalfSize) / this.mapTile), 0, this.revealRows - 1);
    const maxY = clamp(Math.floor((y + radius + this.mapHalfSize) / this.mapTile), 0, this.revealRows - 1);

    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const wx = gx * this.mapTile - this.mapHalfSize + this.mapTile * 0.5;
        const wy = gy * this.mapTile - this.mapHalfSize + this.mapTile * 0.5;
        const d = Math.hypot(wx - x, wy - y);
        if (d <= radius) {
          this.revealed[gy][gx] = 1;
        }
      }
    }
  }
}