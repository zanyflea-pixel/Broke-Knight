// src/world.js
// v99.7 WORLD SAFETY + SPAWN ROADS + RELIABLE BRIDGES
//
// Goals:
// - no recursion / stable map support
// - greener overworld with less stone
// - curvier rivers instead of grid lines
// - safe spawn basin so player is not trapped early
// - intentional roads connecting spawn, camps, waystones, docks, dungeons
// - reliable bridges where roads cross rivers
// - supports both getMinimapCanvas() and getMapInfo()

import { clamp, hash2, fbm, RNG } from "./util.js";

export default class World {
  constructor(seed = 12345, opts = {}) {
    this.seed = (seed | 0) || 12345;

    this.tileSize = opts.tileSize || 24;
    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.mapHalfSize = 5200;
    this.boundsHalfSize = 7000;
    this.boundsRadius = this.mapHalfSize;

    this.spawn = { x: 0, y: 0 };
    this.mapMode = "small";

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];

    this._poiRng = new RNG(hash2(this.seed, 777));
    this._zoneCache = new Map();
    this._groundCache = new Map();
    this._mapColorCache = new Map();

    this._roadAnchors = [];
    this._roadSegments = [];
    this._roadSegSet = new Set();

    this._spawnSafeRadius = 760;
    this._spawnRoadRadius = 1350;
    this._roadWidth = 96;
    this._bridgeRoadDistance = 54;

    this._miniCanvas = document.createElement("canvas");
    this._miniCanvas.width = 220;
    this._miniCanvas.height = 220;
    this._miniDirty = true;

    this.revealCellSmall = 48;
    this.revealCellLarge = 72;
    this._revealedSmall = new Set();
    this._revealedLarge = new Set();

    this._initPOIs();
    this._buildRoadNetwork();

    this.revealAround(this.spawn.x, this.spawn.y, 240);
    this._rebuildMinimap();
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  update(dt, hero) {
    void dt;
    if (hero) this.revealAround(hero.x, hero.y, 220);
  }

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "large" : "small";
    this._miniDirty = true;
  }

  getMinimapCanvas() {
    if (this._miniDirty) this._rebuildMinimap();
    return this._miniCanvas;
  }

  getMapInfo() {
    const isLarge = this.mapMode === "large";
    const cell = isLarge ? this.revealCellLarge : this.revealCellSmall;
    return {
      mapHalfSize: this.mapHalfSize,
      boundsHalfSize: this.boundsHalfSize,
      mapTile: cell,
      revealed: isLarge ? this._revealedLargeGrid() : this._revealedSmallGrid(),
      cols: this._gridCols(cell),
      rows: this._gridRows(cell),
      scale: isLarge ? 1.8 : 1.0,
      camps: this.camps,
      docks: this.docks,
      waystones: this.waystones,
      dungeons: this.dungeons,
    };
  }

  isRevealedWorld(x, y) {
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) return false;
    const isLarge = this.mapMode === "large";
    const cell = isLarge ? this.revealCellLarge : this.revealCellSmall;
    const set = isLarge ? this._revealedLarge : this._revealedSmall;
    const gx = Math.floor((x + this.mapHalfSize) / cell);
    const gy = Math.floor((y + this.mapHalfSize) / cell);
    return set.has(`${gx},${gy}`);
  }

  getMapCellAtWorld(x, y) {
    return this._sampleCell(x, y);
  }

  getMapColorAtWorld(x, y) {
    const key = `${(x / 24) | 0},${(y / 24) | 0}`;
    if (this._mapColorCache.has(key)) return this._mapColorCache.get(key);
    const color = this._mapColorFromCell(this._sampleCell(x, y));
    this._mapColorCache.set(key, color);
    return color;
  }

  revealAround(wx, wy, radius = 220) {
    this._revealModeAround(wx, wy, radius, this.revealCellSmall, this._revealedSmall);
    this._revealModeAround(wx, wy, radius * 1.12, this.revealCellLarge, this._revealedLarge);
    this._miniDirty = true;
  }

  _revealModeAround(wx, wy, radius, cell, set) {
    if (Math.abs(wx) > this.mapHalfSize || Math.abs(wy) > this.mapHalfSize) return;

    const half = this.mapHalfSize;
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
        if (dx * dx + dy * dy <= radius * radius) set.add(`${gx},${gy}`);
      }
    }
  }

  canWalk(x, y) {
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;
    const cell = this._sampleCell(x, y);
    return cell.bridge || !cell.isWater;
  }

  isSolid(x, y) {
    return !this.canWalk(x, y);
  }

  isWater(x, y) {
    return this._sampleCell(x, y).isWater;
  }

  isBridge(x, y) {
    return this._sampleCell(x, y).bridge;
  }

  getMoveModifier(x, y) {
    const g = this.getGroundType(x, y);
    if (g === "road") return 1.16;
    if (g === "bridge") return 1.08;
    if (g === "sand") return 0.95;
    if (g === "stone") return 0.98;
    if (g === "forest") return 0.96;
    if (g === "ash") return 0.94;
    if (g === "water") return 0.84;
    return 1.0;
  }

  getGroundType(x, y) {
    const key = `${(x / this.tileSize) | 0},${(y / this.tileSize) | 0}`;
    if (this._groundCache.has(key)) return this._groundCache.get(key);

    const cell = this._sampleCell(x, y);
    let out = "grass";

    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) {
      out = cell.isWater ? "unknown_water" : "unknown";
    } else if (cell.bridge) {
      out = "bridge";
    } else if (cell.isWater) {
      out = "water";
    } else if (cell.road) {
      out = "road";
    } else if (cell.zone === "Shoreline") {
      out = "sand";
    } else if (cell.zone === "Riverbank") {
      out = "riverbank";
    } else if (cell.zone === "Stone Flats") {
      out = "stone";
    } else if (cell.zone === "Ash Fields") {
      out = "ash";
    } else if (cell.zone === "Pine Verge") {
      out = "forest";
    } else if (cell.zone === "Whisper Grass") {
      out = "whisper";
    }

    this._groundCache.set(key, out);
    return out;
  }

  getZoneName(x, y) {
    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) return "Unknown";

    const cx = (x / 96) | 0;
    const cy = (y / 96) | 0;
    const key = `${cx},${cy}`;
    if (this._zoneCache.has(key)) return this._zoneCache.get(key);

    const zone = this._sampleCell(x, y).zone;
    this._zoneCache.set(key, zone);
    return zone;
  }

  draw(ctx, camera) {
    const vb = this._viewBounds(camera);
    this._drawGround(ctx, vb);
    this._drawRoads(ctx, vb);
    this._drawWater(ctx, vb);
    this._drawBridges(ctx, vb);
    this._drawPOIs(ctx, vb);
  }

  _viewBounds(camera) {
    const zoom = camera?.zoom || 1;
    const halfW = (this.viewW * 0.5) / zoom;
    const halfH = (this.viewH * 0.5) / zoom;
    return {
      x0: (camera?.x || 0) - halfW - 120,
      y0: (camera?.y || 0) - halfH - 120,
      x1: (camera?.x || 0) + halfW + 120,
      y1: (camera?.y || 0) + halfH + 120,
    };
  }

  _sampleCell(x, y) {
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) {
      return { zone: "Unknown", isWater: true, road: false, bridge: false };
    }

    if (Math.abs(x) > this.mapHalfSize || Math.abs(y) > this.mapHalfSize) {
      const u = fbm((x + this.seed * 0.27) * 0.00048, (y - this.seed * 0.31) * 0.00048, 4);
      return {
        zone: "Unknown",
        isWater: u < 0.20,
        road: false,
        bridge: false,
      };
    }

    const moist = fbm((x - this.seed * 0.13) * 0.00034, (y + this.seed * 0.21) * 0.00034, 4);
    const rough = fbm((x + this.seed * 0.41) * 0.00056, (y - this.seed * 0.37) * 0.00056, 3);
    const heat = fbm((x + this.seed * 0.19) * 0.00030, (y - this.seed * 0.17) * 0.00030, 4);

    const river = this._riverFieldBase(x, y);
    const lake = this._lakeNoise(x, y);
    const terrain = this._terrainNoise(x, y);

    const distSpawn = Math.hypot(x - this.spawn.x, y - this.spawn.y);
    const inSpawnBasin = distSpawn < this._spawnSafeRadius;

    const centralGreenBias = Math.max(Math.abs(x), Math.abs(y)) < 1700 ? 0.12 : 0;
    const stonePenalty = Math.max(Math.abs(x), Math.abs(y)) < 2400 ? 0.22 : 0;

    let isWater = false;
    if (lake < -0.36) isWater = true;
    if (river < 0.030) isWater = true;
    if (terrain < -0.40) isWater = true;

    if (inSpawnBasin) {
      isWater = false;
    }

    let zone = "High Meadow";
    if (isWater) {
      zone = lake < -0.40 ? "Shoreline" : "Riverbank";
    } else if (rough - stonePenalty > 0.46 && moist < 0.40) {
      zone = "Stone Flats";
    } else if (heat > 0.35 && moist < 0.37) {
      zone = "Ash Fields";
    } else if (moist + centralGreenBias > 0.52 && rough < 0.24) {
      zone = "Whisper Grass";
    } else if (rough > 0.18 && moist > 0.10) {
      zone = "Pine Verge";
    }

    if (Math.abs(x - this.spawn.x) < 1350 && Math.abs(y - this.spawn.y) < 1350) {
      zone = rough > 0.20 && moist > 0.10 ? "Pine Verge" : "High Meadow";
      if (isWater && distSpawn < this._spawnRoadRadius) isWater = false;
    }

    const roadStrength = this._roadField(x, y);
    const road = !isWater && roadStrength > 0.16;

    let bridge = false;
    if (isWater) {
      const distRoad = this._distToRoadNetwork(x, y);
      if (distRoad < this._bridgeRoadDistance && river < 0.060) {
        bridge = true;
      }
    }

    return { zone, isWater, road, bridge };
  }

  _terrainNoise(x, y) {
    const a = fbm((x + this.seed * 0.31) * 0.00054, (y - this.seed * 0.27) * 0.00054, 5);
    const b = fbm((x - this.seed * 0.11) * 0.00112, (y + this.seed * 0.09) * 0.00112, 3);
    return a * 0.74 + b * 0.26 - 0.5;
  }

  _lakeNoise(x, y) {
    const a = fbm((x + this.seed * 0.57) * 0.00030, (y - this.seed * 0.33) * 0.00030, 4);
    const b = fbm((x - this.seed * 0.23) * 0.00072, (y + this.seed * 0.49) * 0.00072, 3);
    return a * 0.78 + b * 0.22 - 0.5;
  }

  _riverFieldBase(x, y) {
    const warp1 = fbm((x + this.seed * 0.17) * 0.00075, (y - this.seed * 0.21) * 0.00075, 3) * 180;
    const warp2 = fbm((x - this.seed * 0.29) * 0.00075, (y + this.seed * 0.27) * 0.00075, 3) * 180;

    const rx = x + warp1;
    const ry = y + warp2;

    const centerA =
      Math.sin(rx * 0.00072 + this.seed * 0.0013) * 360 +
      Math.sin(rx * 0.0017 - this.seed * 0.0011) * 120;

    const centerB =
      Math.sin(ry * 0.00068 - this.seed * 0.0012) * 340 +
      Math.sin(ry * 0.0015 + this.seed * 0.0015) * 140;

    const river1 = Math.abs(ry - centerA);
    const river2 = Math.abs(rx - centerB);

    return Math.min(river1, river2) / 260;
  }

  _rawRoadField(x, y) {
    const warpX = fbm((x + this.seed * 0.41) * 0.00092, (y - this.seed * 0.27) * 0.00092, 2) * 120;
    const warpY = fbm((x - this.seed * 0.37) * 0.00092, (y + this.seed * 0.33) * 0.00092, 2) * 120;
    const rx = x + warpX;
    const ry = y + warpY;

    const roadA = Math.abs(Math.sin(rx * 0.00110 + this.seed * 0.00019));
    const roadB = Math.abs(Math.sin((rx - ry) * 0.00082 - this.seed * 0.00015));
    const roadC = Math.abs(Math.sin((rx + ry) * 0.00070 + this.seed * 0.00011));
    const field = fbm((x + this.seed * 0.09) * 0.0024, (y - this.seed * 0.06) * 0.0024, 2);

    let v = 1;
    v = Math.min(v, roadA);
    v = Math.min(v, roadB * 1.08);
    v = Math.min(v, roadC * 1.12);

    return field - v;
  }

  _distToRoadNetwork(x, y) {
    if (!this._roadSegments.length) return Infinity;
    let best = Infinity;
    for (const seg of this._roadSegments) {
      const d = this._distancePointToSegment(x, y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (d < best) best = d;
    }
    return best;
  }

  _distancePointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;

    if (ab2 <= 0.00001) return Math.hypot(px - ax, py - ay);

    let t = (apx * abx + apy * aby) / ab2;
    t = clamp(t, 0, 1);

    const qx = ax + abx * t;
    const qy = ay + aby * t;
    return Math.hypot(px - qx, py - qy);
  }

  _roadField(x, y) {
    const procedural = this._rawRoadField(x, y);
    const d = this._distToRoadNetwork(x, y);

    let networkBoost = -1;
    if (Number.isFinite(d)) {
      networkBoost = 1 - clamp(d / this._roadWidth, 0, 1);
    }

    const spawnDist = Math.hypot(x - this.spawn.x, y - this.spawn.y);
    let spawnBoost = -1;
    if (spawnDist < this._spawnRoadRadius) {
      const dx = Math.abs(x - this.spawn.x);
      const dy = Math.abs(y - this.spawn.y);
      const radial = Math.min(dx, dy);
      spawnBoost = 1 - clamp(radial / 84, 0, 1);
    }

    return Math.max(procedural, networkBoost, spawnBoost);
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
          if (n < 18) this._drawTree(ctx, x + 12, y + 18, 1 + (n % 3) * 0.10);
          else if (n > 96) this._drawPebble(ctx, x + 15, y + 21);
        } else if (ground === "grass" || ground === "whisper" || ground === "riverbank") {
          if (n < 12) this._drawGrassTuft(ctx, x + 10, y + 22);
          else if (n > 96) this._drawPebble(ctx, x + 15, y + 18);
        } else if (ground === "stone" || ground === "ash") {
          if (n < 9) this._drawPebble(ctx, x + 15, y + 19);
        } else if (ground === "sand") {
          if (n < 9) this._drawReed(ctx, x + 14, y + 23);
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

        ctx.fillStyle = "rgba(114,132,152,0.30)";
        ctx.fillRect(x + 2, y + 8, t - 4, t - 16);

        ctx.strokeStyle = "rgba(82,92,105,0.22)";
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

        const zone = this.getZoneName(gx, gy);
        ctx.fillStyle = zone === "Shoreline" ? "#4a93c0" : "#3d84b8";
        ctx.fillRect(x, y, t + 1, t + 1);

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 10);
        ctx.lineTo(x + 20, y + 10);
        ctx.moveTo(x + 8, y + 19);
        ctx.lineTo(x + 17, y + 19);
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
    const seg = this._nearestRoadSegment(gx, gy);
    let vertical = true;

    if (seg) {
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      vertical = Math.abs(dx) > Math.abs(dy);
    }

    ctx.fillStyle = "#70533a";
    ctx.fillRect(x, y, t + 1, t + 1);

    ctx.fillStyle = "#8f6a4a";
    if (vertical) {
      for (let i = 2; i < t; i += 6) ctx.fillRect(x + 5, y + i, t - 10, 3);
      ctx.fillStyle = "#5d4430";
      ctx.fillRect(x + 3, y, 3, t + 1);
      ctx.fillRect(x + t - 6, y, 3, t + 1);
    } else {
      for (let i = 2; i < t; i += 6) ctx.fillRect(x + i, y + 5, 3, t - 10);
      ctx.fillStyle = "#5d4430";
      ctx.fillRect(x, y + 3, t + 1, 3);
      ctx.fillRect(x, y + t - 6, t + 1, 3);
    }
  }

  _nearestRoadSegment(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const seg of this._roadSegments) {
      const d = this._distancePointToSegment(x, y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (d < bestD) {
        bestD = d;
        best = seg;
      }
    }
    return best;
  }

  _drawPOIs(ctx, vb) {
    const visible = (p, r = 40) =>
      p.x + r >= vb.x0 && p.x - r <= vb.x1 && p.y + r >= vb.y0 && p.y - r <= vb.y1;

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

    if (type === "whisper") return alt < 6 ? "#62a55d" : "#6caf67";
    if (type === "road") return alt < 6 ? "#7f8fa0" : "#8897a7";
    if (type === "stone") return alt < 6 ? "#77806e" : "#808a76";
    if (type === "grass") return alt < 6 ? "#73b063" : "#7cbc6b";
    if (type === "ash") return alt < 6 ? "#7d7867" : "#868171";
    if (type === "forest") return alt < 6 ? "#507b49" : "#5a8753";
    if (type === "sand") return alt < 6 ? "#9a9c70" : "#a4a779";
    if (type === "riverbank") return alt < 6 ? "#75a366" : "#80ad70";
    if (type === "bridge") return "#7c5a3f";
    if (type === "unknown") return alt < 6 ? "#4f5a47" : "#596551";
    return alt < 6 ? "#6fa55f" : "#79b066";
  }

  _mapColorFromCell(cell) {
    if (!cell) return "#2a2f38";
    if (cell.bridge) return "#8a6a4c";
    if (cell.isWater && cell.zone === "Unknown") return "#2d4d69";
    if (cell.isWater) return "#3d84b8";
    if (cell.road) return "#8b97a6";
    if (cell.zone === "Stone Flats") return "#869177";
    if (cell.zone === "Ash Fields") return "#87836f";
    if (cell.zone === "Pine Verge") return "#5c8555";
    if (cell.zone === "Whisper Grass") return "#679f61";
    if (cell.zone === "Shoreline") return "#989d72";
    if (cell.zone === "Riverbank") return "#78a46d";
    if (cell.zone === "Unknown") return "#596551";
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

    this.spawn = findLand(0, 0, 720) || { x: 0, y: 0 };

    const campSeeds = [
      [-1100, -850], [1150, -900], [-1320, 980], [1360, 1080],
      [0, 1650], [-2100, 250], [2140, -260],
    ];
    const waystoneSeeds = [
      [-2300, 20], [2300, -20], [0, -2250], [40, 2280],
      [-1640, 1680], [1680, -1640],
    ];
    const dungeonSeeds = [
      [-3000, -460], [3060, 420], [-560, 2960], [700, -3040],
    ];
    const dockSeeds = [
      [-2500, 940], [2580, -980], [-700, 2380], [860, -2440],
    ];

    let id = 1;

    for (const [x, y] of campSeeds) {
      const p = findLand(x, y, 420);
      if (p) this.camps.push({ id: id++, name: "Camp", x: p.x, y: p.y });
    }
    for (const [x, y] of waystoneSeeds) {
      const p = findLand(x, y, 360);
      if (p) this.waystones.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of dungeonSeeds) {
      const p = findLand(x, y, 440);
      if (p) this.dungeons.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of dockSeeds) {
      const p = findShore(x, y, 520);
      if (p) this.docks.push({ id: id++, x: p.x, y: p.y });
    }
  }

  _buildRoadNetwork() {
    this._roadAnchors = [];
    this._roadSegments = [];
    this._roadSegSet.clear();

    const add = (p, type) => { if (p) this._roadAnchors.push({ x: p.x, y: p.y, type }); };

    add(this.spawn, "spawn");
    for (const p of this.camps) add(p, "camp");
    for (const p of this.waystones) add(p, "waystone");
    for (const p of this.docks) add(p, "dock");
    for (const p of this.dungeons) add(p, "dungeon");

    for (const a of this._roadAnchors) {
      let best = null;
      let bestScore = Infinity;

      for (const b of this._roadAnchors) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        let score = d;
        if (a.type === "spawn" || b.type === "spawn") score *= 0.72;
        if ((a.type === "camp" && b.type === "waystone") || (a.type === "waystone" && b.type === "camp")) score *= 0.84;
        if (a.type === "dock" || b.type === "dock") score *= 0.90;
        if (a.type === "dungeon" && b.type === "dungeon") score *= 1.10;
        if (score < bestScore) {
          bestScore = score;
          best = b;
        }
      }

      if (best) this._addRoadSegment(a, best);
    }

    const nearby = this._roadAnchors.filter((p) => Math.hypot(p.x - this.spawn.x, p.y - this.spawn.y) < 2600);
    for (let i = 0; i < nearby.length; i++) {
      const a = nearby[i];
      const b = nearby[(i + 1) % nearby.length];
      if (a && b) this._addRoadSegment(a, b);
    }

    this._addRoadSegment(
      { x: this.spawn.x - this._spawnRoadRadius, y: this.spawn.y, type: "spawn_road" },
      { x: this.spawn.x + this._spawnRoadRadius, y: this.spawn.y, type: "spawn_road" }
    );
    this._addRoadSegment(
      { x: this.spawn.x, y: this.spawn.y - this._spawnRoadRadius, type: "spawn_road" },
      { x: this.spawn.x, y: this.spawn.y + this._spawnRoadRadius, type: "spawn_road" }
    );
  }

  _addRoadSegment(a, b) {
    const k1 = `${a.x},${a.y}|${b.x},${b.y}`;
    const k2 = `${b.x},${b.y}|${a.x},${a.y}`;
    if (this._roadSegSet.has(k1) || this._roadSegSet.has(k2)) return;
    this._roadSegSet.add(k1);
    this._roadSegments.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  }

  _isNearWater(x, y, r = 40) {
    return (
      this._sampleCell(x + r, y).isWater ||
      this._sampleCell(x - r, y).isWater ||
      this._sampleCell(x, y + r).isWater ||
      this._sampleCell(x, y - r).isWater
    );
  }

  _findSafeLandPatchNear(x, y, radius = 260) {
    for (let r = 0; r <= radius; r += 24) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = Math.round(x + Math.cos(a) * r);
        const py = Math.round(y + Math.sin(a) * r);
        const cell = this._sampleCell(px, py);
        if (cell.isWater || cell.bridge) continue;
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
        const cell = this._sampleCell(px, py);
        if (cell.isWater || cell.bridge) continue;
        if (!this._isNearWater(px, py, 34)) continue;
        return { x: px, y: py };
      }
    }
    return this._findSafeLandPatchNear(x, y, radius);
  }

  _gridCols(cell) {
    return Math.ceil((this.mapHalfSize * 2) / cell);
  }

  _gridRows(cell) {
    return Math.ceil((this.mapHalfSize * 2) / cell);
  }

  _revealedGrid(set, cell) {
    const rows = this._gridRows(cell);
    const cols = this._gridCols(cell);
    const out = Array.from({ length: rows }, () => new Uint8Array(cols));
    for (const key of set) {
      const [gx, gy] = key.split(",").map(Number);
      if (gy >= 0 && gy < rows && gx >= 0 && gx < cols) out[gy][gx] = 1;
    }
    return out;
  }

  _revealedSmallGrid() {
    return this._revealedGrid(this._revealedSmall, this.revealCellSmall);
  }

  _revealedLargeGrid() {
    return this._revealedGrid(this._revealedLarge, this.revealCellLarge);
  }

  _rebuildMinimap() {
    const cv = this._miniCanvas;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const isLarge = this.mapMode === "large";
    const cell = isLarge ? this.revealCellLarge : this.revealCellSmall;
    const revealed = isLarge ? this._revealedLarge : this._revealedSmall;

    const span = this.mapHalfSize * 2;
    const half = this.mapHalfSize;
    const size = cv.width;
    const worldPerPixel = span / size;
    const gridCount = Math.ceil(span / cell);

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(14,18,24,0.96)";
    ctx.fillRect(0, 0, size, size);

    for (let gy = 0; gy < gridCount; gy++) {
      for (let gx = 0; gx < gridCount; gx++) {
        const key = `${gx},${gy}`;
        if (!revealed.has(key)) continue;

        const wx = gx * cell - half;
        const wy = gy * cell - half;
        const cellSample = this._sampleCell(wx + cell * 0.5, wy + cell * 0.5);

        const px = Math.floor((wx + half) / worldPerPixel);
        const py = Math.floor((wy + half) / worldPerPixel);
        const pw = Math.ceil(cell / worldPerPixel) + 1;
        const ph = Math.ceil(cell / worldPerPixel) + 1;

        ctx.fillStyle = this._mapColorFromCell(cellSample);
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

    this._miniDirty = false;
  }
}