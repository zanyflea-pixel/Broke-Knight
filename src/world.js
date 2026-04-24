// src/world.js
// v107 RPG WORLD PASS
// - roads are real walkable corridors, not just decoration
// - safer mainland-style spawn region with leveling rings
// - stronger road network between camps / waystones / docks / dungeons
// - wider bridges and readable trail rendering
// - minimap + world map support
// - compatible with current game.js / ui.js / util.js

import { clamp, hash2, fbm, RNG } from "./util.js";

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);

  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function quadPoint(ax, ay, bx, by, cx, cy, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * ax + 2 * mt * t * bx + t * t * cx,
    y: mt * mt * ay + 2 * mt * t * by + t * t * cy,
  };
}

export default class World {
  constructor(seed = 12345, opts = {}) {
    this.buildId = "rpg-v127";
    this.seed = (seed | 0) || 12345;

    this.tileSize = opts.tileSize || 24;
    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.mapHalfSize = 12000;
    this.boundsHalfSize = 14500;

    this.spawn = { x: 0, y: 0 };
    this.mapMode = "small";

    this.camps = [];
    this.towns = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];
    this.shrines = [];
    this.caches = [];
    this.secrets = [];
    this.dragonLairs = [];
    this.bridges = [];
    this.roads = [];
    this.roadNodes = [];
    this.showRoads = false;

    this._rng = new RNG(this.seed ^ 0x51f15eed);

    this._mapCanvas = null;
    this._mapInfo = null;
    this._mapDirty = true;
    this._mapSize = 320;
    this._mapPreviewSize = 96;
    this._discoveryExportCache = null;
    this._revealed = null;
    this._mapBuildQueued = false;
    this._mapBuildState = null;
    this._riverWaterLimit = 1.42;

    this._spawnSafeRadius = 620;
    this._spawnRoadRadius = 900;
    this._roadWalkRadius = 26;
    this._riverAvoidSpawnRadius = 1650;

    this._riverBands = this._makeRiverBands();
    this._mountainRanges = this._makeMountainRanges();
    this._mountainPasses = this._makeMountainPasses();
    this._mountainRenderData = this._buildMountainRenderData();
    this._bootRawSampleCache = new Map();

    this._buildPOIs();
    this._buildRoadNetwork();
    this._finalizeBridges();
    this._ensureSpawnSafety();
    this._bootRawSampleCache = null;
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  update() {}

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "big" : "small";
  }

  getMapInfo() {
    if (!this._mapInfo) this._buildMapPreview();
    if (this._mapDirty || !this._mapInfo) this._queueMapBuild();
    return this._mapInfo || { size: this._mapSize || 320, colors: [], tiles: [], revealed: [] };
  }

  getMinimapCanvas() {
    if (!this._mapCanvas) this._buildMapPreview();
    if (this._mapDirty || !this._mapCanvas) this._queueMapBuild();
    return this._mapCanvas;
  }

  revealAround(x, y, radius = 620) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (this._mapDirty || !this._mapInfo) {
      this._queueMapBuild();
      return false;
    }

    const info = this._mapInfo;
    const rows = info?.revealed?.length || 0;
    const cols = info?.revealed?.[0]?.length || 0;
    if (!rows || !cols) return false;

    const span = this.mapHalfSize * 2;
    const cx = clamp(Math.floor(((x + this.mapHalfSize) / span) * cols), 0, cols - 1);
    const cy = clamp(Math.floor(((y + this.mapHalfSize) / span) * rows), 0, rows - 1);
    const cr = Math.max(1, Math.ceil((radius / span) * cols));
    const r2 = cr * cr;
    let changed = false;

    for (let r = Math.max(0, cy - cr); r <= Math.min(rows - 1, cy + cr); r++) {
      for (let c = Math.max(0, cx - cr); c <= Math.min(cols - 1, cx + cr); c++) {
        const dx = c - cx;
        const dy = r - cy;
        if (dx * dx + dy * dy > r2) continue;
        if (!info.revealed[r][c]) {
          info.revealed[r][c] = true;
          changed = true;
        }
      }
    }

    if (changed) this._discoveryExportCache = null;
    return changed;
  }

  revealAll() {
    if (this._mapDirty || !this._mapInfo) {
      this._queueMapBuild();
      return;
    }
    for (const row of this._mapInfo.revealed || []) row.fill(true);
    this._discoveryExportCache = null;
  }

  exportDiscovery() {
    if (this._mapDirty || !this._mapInfo) {
      this._queueMapBuild();
      return [];
    }
    if (this._discoveryExportCache) return this._discoveryExportCache.slice();

    const out = [];
    const revealed = this._mapInfo.revealed || [];
    for (let r = 0; r < revealed.length; r++) {
      for (let c = 0; c < (revealed[r]?.length || 0); c++) {
        if (revealed[r][c]) out.push(`${r},${c}`);
      }
    }

    this._discoveryExportCache = out;
    return out.slice();
  }

  importDiscovery(cells) {
    if (!Array.isArray(cells)) return;
    if (this._mapDirty || !this._mapInfo) {
      this._queueMapBuild();
      return;
    }
    const revealed = this._mapInfo.revealed || [];
    let changed = false;
    for (const cell of cells) {
      const [rs, cs] = String(cell).split(",");
      const r = Number(rs) | 0;
      const c = Number(cs) | 0;
      if (revealed[r]?.[c] != null && !revealed[r][c]) {
        revealed[r][c] = true;
        changed = true;
      }
    }
    if (changed) this._discoveryExportCache = null;
  }

  canWalk(x, y, actor = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;

    const s = this._sampleCell(x, y);

    if (s.bridge) return true;

    if (actor?.state?.sailing) {
      return s.isWater || this._isNearDock(x, y, 34);
    }

    return !s.isWater && !s.isMountainWall;
  }

  getMoveModifier(x, y) {
    const s = this._sampleCell(x, y);

    if (s.isWater) return 0.92;
    if (s.bridge) return 1.12;
    if (s.road) return 1.18;
    if (s.zone === "mountain" || s.zone === "stone flats") return 0.93;
    return 1;
  }

  getZoneName(x, y) {
    return this._sampleCell(x, y).zone;
  }

  getZoneInfo(x, y) {
    const s = this._sampleCell(x, y);
    return {
      name: s.zone,
      biome: s.zone,
      nearWater: s.isWater,
      color: s.color,
      level: this.getDangerLevel(x, y),
    };
  }

  getDangerLevel(x, y) {
    const d = Math.hypot(x - this.spawn.x, y - this.spawn.y);
    if (d < 1300) return 1;
    if (d < 2400) return 2;
    if (d < 3600) return 3;
    if (d < 4800) return 4;
    return 5;
  }

  getStarterPoint() {
    const p = this._findSafeLandPatchNear(this.spawn.x, this.spawn.y, 120) || this.spawn;
    return { x: p.x, y: p.y };
  }

  draw(ctx, camera, hero) {
    const size = 48;

    const left = camera.x - this.viewW * 0.5 - 80;
    const top = camera.y - this.viewH * 0.5 - 80;
    const right = camera.x + this.viewW * 0.5 + 80;
    const bottom = camera.y + this.viewH * 0.5 + 80;

    const startX = Math.floor(left / size) * size;
    const startY = Math.floor(top / size) * size;
    const cellCache = new Map();

    const getCell = (x, y) => {
      const key = `${x}|${y}`;
      let cell = cellCache.get(key);
      if (!cell) {
        cell = this._sampleCell(x, y);
        cellCache.set(key, cell);
      }
      return cell;
    };

    for (let x = startX; x < right; x += size) {
      for (let y = startY; y < bottom; y += size) {
        const s = getCell(x, y);

        const tint = (hash2((x / size) | 0, (y / size) | 0, this.seed + 808) / 4294967296 - 0.5) * 0.12;
        const tileColor = s.bridge || (s.isRiver && !s.isLake) ? s.landColor || s.color : s.color;
        ctx.fillStyle = this._shadeColor(tileColor, tint);
        ctx.fillRect(x, y, size + 1, size + 1);

        const relief = clamp((s.ground - 0.48) * 1.7, -0.28, 0.28);
        const cellX = (x / size) | 0;
        const cellY = (y / size) | 0;
        const parity = (cellX + cellY) % 11;
        if (parity % 2 === 0) {
          if (relief > 0.10) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.035, relief * 0.09)})`;
            ctx.fillRect(x, y, size + 1, 3);
          } else if (relief < -0.11 && !s.isWater) {
            ctx.fillStyle = `rgba(20,38,30,${Math.min(0.045, Math.abs(relief) * 0.09)})`;
            ctx.fillRect(x, y + size - 4, size + 1, 4);
          }
        }

        this._drawTileScenery(ctx, x, y, size, s, parity, relief, cellX, cellY, getCell);
      }
    }

    this._drawMountainRanges(ctx, left, top, right, bottom);
    this._drawWorldAtmosphere(ctx, left, top, right, bottom);
    this._drawRiverOverlays(ctx, left, top, right, bottom);
    this._drawBridges(ctx, left, top, right, bottom);
    this._drawRoads(ctx);
    this._drawPOIs(ctx);
  }

  _drawTileScenery(ctx, x, y, size, s, parity, relief, cellX, cellY, getCell = null) {
    const seed = hash2(cellX, cellY, this.seed ^ 0x51a3);
    const n = (seed >>> 0) / 4294967296;
    const px = x + 8 + (n * 24);
    const py = y + 10 + (((seed >>> 7) & 15) * 1.1);

    if (!s.isLake && (s.river < 0.105 || s.ground < 0.285) && parity % 2 === 0) {
      ctx.fillStyle = "rgba(222,220,170,0.10)";
      ctx.fillRect(x + 2, y + size - 5, size - 4, 2);
    }

    if (s.isLake) {
      this._drawWaterScenery(ctx, x, y, size, s, parity, seed);
      return;
    }

    if (s.zone === "forest" || s.zone === "greenwood" || s.zone === "deep wilds") {
      this._drawForestScenery(ctx, px, py, size, parity, seed, s.zone === "deep wilds");
      return;
    }

    if (s.zone === "meadow" || s.zone === "whisper grass" || s.zone === "old fields" || s.zone === "road") {
      this._drawMeadowScenery(ctx, x, y, size, parity, seed, s.zone === "road");
      return;
    }

    if (s.zone === "ashlands" || s.zone === "ash fields") {
      this._drawAshScenery(ctx, x, y, size, parity, seed);
      return;
    }

    if (s.zone === "highlands") {
      this._drawHighlandScenery(ctx, x, y, size, parity, seed, relief);
      return;
    }

    if (s.zone === "mountain" || s.zone === "stone flats") {
      this._drawMountainScenery(ctx, x, y, size, parity, seed, relief, s.zone === "mountain", getCell);
    }
  }

  _drawForestScenery(ctx, px, py, size, parity, seed, dense = false) {
    const trunk = dense ? "#3b281d" : "#4a3222";
    const canopyA = dense ? "rgba(22,56,22,0.42)" : "rgba(32,78,28,0.34)";
    const canopyB = dense ? "rgba(108,156,94,0.18)" : "rgba(126,175,104,0.16)";
    const scale = dense ? 1.18 : 1;

    const drawTree = (x, y, tall = false) => {
      ctx.fillStyle = "rgba(13,23,11,0.20)";
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 10, 12 * scale, 4.6 * scale, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = trunk;
      ctx.fillRect(x - 1, y - 2, 3, tall ? 14 : 11);
      ctx.fillStyle = canopyA;
      ctx.beginPath();
      ctx.moveTo(x, y - (tall ? 18 : 14));
      ctx.lineTo(x + 10 * scale, y + 6);
      ctx.lineTo(x - 10 * scale, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = canopyB;
      ctx.beginPath();
      ctx.moveTo(x, y - (tall ? 13 : 10));
      ctx.lineTo(x + 7 * scale, y + 4);
      ctx.lineTo(x - 7 * scale, y + 4);
      ctx.closePath();
      ctx.fill();
    };

    const drawGreatTree = (x, y) => {
      ctx.fillStyle = "rgba(12,20,10,0.24)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 14, 18, 6.5, -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dense ? "#4b3425" : "#5a3d29";
      ctx.fillRect(x - 2.5, y - 8, 5, 22);
      ctx.fillStyle = dense ? "rgba(20,64,24,0.50)" : "rgba(34,88,34,0.42)";
      ctx.beginPath();
      ctx.arc(x, y - 12, 12, 0, Math.PI * 2);
      ctx.arc(x - 10, y - 4, 10, 0, Math.PI * 2);
      ctx.arc(x + 10, y - 4, 10, 0, Math.PI * 2);
      ctx.arc(x, y + 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dense ? "rgba(124,182,110,0.16)" : "rgba(156,204,136,0.14)";
      ctx.beginPath();
      ctx.arc(x - 3, y - 10, 6, 0, Math.PI * 2);
      ctx.arc(x + 7, y - 6, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    if (dense && ((seed >>> 20) & 15) >= 10) {
      drawGreatTree(px + 2, py + 2);
    } else if (parity === 0 || parity === 4 || dense) {
      drawTree(px, py, ((seed >>> 4) & 1) === 1);
    }
    if (dense && ((seed >>> 9) & 3) >= 2) drawTree(px + 12, py + 4, false);
    if (!dense && ((seed >>> 24) & 31) === 7) drawGreatTree(px + 1, py + 1);
    if (((seed >>> 14) & 7) === 3) {
      ctx.fillStyle = "rgba(86,72,44,0.22)";
      ctx.fillRect(px - 6, py + 8, 10, 3);
      ctx.fillStyle = "rgba(118,168,104,0.10)";
      ctx.beginPath();
      ctx.arc(px - 1, py + 6, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawMeadowScenery(ctx, x, y, size, parity, seed, roadside = false) {
    const tuftX = x + 7 + ((seed >>> 3) & 15);
    const tuftY = y + 12 + ((seed >>> 8) & 11);
    if (parity === 1 || parity === 3 || parity === 7) {
      ctx.fillStyle = roadside ? "rgba(116,132,86,0.16)" : "rgba(58,108,40,0.18)";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(tuftX + i * 2, tuftY - i, 1.6, 7 + i);
      }
    }
    if (!roadside && ((seed >>> 12) & 3) === 1) {
      ctx.fillStyle = "rgba(255,240,205,0.16)";
      ctx.beginPath();
      ctx.arc(x + 12 + ((seed >>> 16) & 7), y + 14 + ((seed >>> 19) & 9), 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(x + 9, y + 8, 4, 8);
    }
    if (roadside && ((seed >>> 20) & 3) === 2) {
      ctx.fillStyle = "rgba(86,72,56,0.20)";
      ctx.fillRect(x + 18, y + 18, 6, 2);
    }
    if (!roadside && ((seed >>> 22) & 7) === 5) {
      ctx.fillStyle = "rgba(255,232,166,0.14)";
      ctx.beginPath();
      ctx.ellipse(x + 30, y + 15, 6, 3, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(88,116,54,0.18)";
      ctx.fillRect(x + 29, y + 12, 1.6, 7);
    }
  }

  _drawAshScenery(ctx, x, y, size, parity, seed) {
    if (parity === 2 || parity === 6 || parity === 8) {
      const px = x + 10 + ((seed >>> 2) & 10);
      const py = y + 14 + ((seed >>> 6) & 8);
      ctx.fillStyle = "rgba(17,16,15,0.18)";
      ctx.beginPath();
      ctx.ellipse(px + 1, py + 7, 8, 3, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(80,65,52,0.38)";
      ctx.fillRect(px, py - 4, 3, 11);
      ctx.beginPath();
      ctx.moveTo(px + 1, py - 4);
      ctx.lineTo(px - 4, py - 10);
      ctx.lineTo(px - 2, py - 4);
      ctx.lineTo(px + 6, py - 9);
      ctx.lineTo(px + 2, py - 2);
      ctx.closePath();
      ctx.fill();
    } else if (((seed >>> 9) & 3) === 1) {
      ctx.fillStyle = "rgba(116,90,66,0.22)";
      ctx.beginPath();
      ctx.arc(x + 12, y + 17, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawMountainScenery(ctx, x, y, size, parity, seed, relief, steep = false, getCell = null) {
    if (parity !== 5 && parity !== 7 && parity !== 9 && !steep) return;
    const north = getCell ? !!getCell(x, y - size)?.mountainBase : false;
    const south = getCell ? !!getCell(x, y + size)?.mountainBase : false;
    const west = getCell ? !!getCell(x - size, y)?.mountainBase : false;
    const east = getCell ? !!getCell(x + size, y)?.mountainBase : false;
    const peak = y + 2 + ((seed >>> 5) & 6);
    const base = y + size - 4;
    const left = x + 1;
    const mid = x + 18 + ((seed >>> 11) & 11);
    const right = x + size - 1;
    const shoulderL = x + 10 + ((seed >>> 7) & 6);
    const shoulderR = x + size - 12 - ((seed >>> 14) & 5);

    ctx.fillStyle = "rgba(18,22,26,0.18)";
    ctx.beginPath();
    ctx.ellipse(x + size * 0.55, base + 3, 21, 7, -0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this._shadeColor(steep ? "#98a0a6" : "#7d858b", relief * 0.08);
    ctx.beginPath();
    ctx.moveTo(left, base);
    ctx.lineTo(shoulderL, y + 18);
    ctx.lineTo(mid - 7, peak + 10);
    ctx.lineTo(mid, peak);
    ctx.lineTo(mid + 9, peak + 12);
    ctx.lineTo(shoulderR, y + 20);
    ctx.lineTo(right, base);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this._shadeColor(steep ? "#70787e" : "#61696f", -0.05 + relief * 0.03);
    ctx.beginPath();
    ctx.moveTo(mid - 1, peak + 1);
    ctx.lineTo(mid + 10, peak + 14);
    ctx.lineTo(right, base);
    ctx.lineTo(mid + 10, base - 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.moveTo(mid, peak);
    ctx.lineTo(mid - 9, peak + 13);
    ctx.lineTo(mid - 1, peak + 10);
    ctx.lineTo(mid + 7, peak + 18);
    ctx.lineTo(mid + 12, peak + 11);
    ctx.closePath();
    ctx.fill();

    if (steep || ((seed >>> 15) & 3) >= 1) {
      const backPeak = x + 9 + ((seed >>> 18) & 10);
      ctx.fillStyle = "rgba(74,80,88,0.40)";
      ctx.beginPath();
      ctx.moveTo(x + 1, base);
      ctx.lineTo(backPeak, y + 8 + ((seed >>> 22) & 6));
      ctx.lineTo(x + size * 0.76, base - 4);
      ctx.closePath();
      ctx.fill();
    }

    if (((seed >>> 24) & 3) >= 1) {
      ctx.fillStyle = "rgba(52,58,64,0.26)";
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 28);
      ctx.lineTo(x + 14, y + 18);
      ctx.lineTo(x + 21, y + 29);
      ctx.lineTo(x + 12, y + 35);
      ctx.closePath();
      ctx.fill();
    }

    if (((seed >>> 17) & 3) >= 2) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + 7, y + 7, 9, 8);
    }

    if (!north) {
      ctx.strokeStyle = "rgba(228,234,238,0.26)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 8);
      ctx.lineTo(x + size - 7, y + 8);
      ctx.stroke();
    }
    if (!south) {
      ctx.fillStyle = "rgba(36,40,44,0.26)";
      ctx.fillRect(x + 4, y + size - 8, size - 8, 5);
    }
    if (!west) {
      ctx.fillStyle = "rgba(52,58,64,0.22)";
      ctx.beginPath();
      ctx.moveTo(x + 3, y + size - 5);
      ctx.lineTo(x + 10, y + 12);
      ctx.lineTo(x + 13, y + size - 5);
      ctx.closePath();
      ctx.fill();
    }
    if (!east) {
      ctx.fillStyle = "rgba(44,49,55,0.24)";
      ctx.beginPath();
      ctx.moveTo(x + size - 3, y + size - 5);
      ctx.lineTo(x + size - 11, y + 12);
      ctx.lineTo(x + size - 15, y + size - 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawMountainRanges(ctx, left, top, right, bottom) {
    if (!this._mountainRenderData?.length) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const range of this._mountainRenderData) {
      const ridgeDx = -range.nx * 8;
      const ridgeDy = -range.ny * 8 - 6;
      const shadowDx = range.nx * 10;
      const shadowDy = range.ny * 10 + 12;

      for (const seg of range.segments) {
        if (seg.maxX < left || seg.minX > right || seg.maxY < top || seg.minY > bottom) continue;

        const crestPts = seg.pts.map((p, i) => {
          const jag = (((range.seed >>> (i % 24)) & 3) - 1.5) * 5;
          return { x: p.x + ridgeDx + range.tx * jag, y: p.y + ridgeDy - Math.abs(jag) * 0.25 };
        });
        const shadowPts = seg.pts.map((p, i) => {
          const drift = Math.sin(i * 0.75 + range.seed * 0.0001) * 4;
          return { x: p.x + shadowDx + range.tx * drift, y: p.y + shadowDy + Math.abs(drift) * 0.14 };
        });

        ctx.strokeStyle = "rgba(20,24,28,0.10)";
        ctx.lineWidth = Math.max(8, range.width * 0.05);
        ctx.beginPath();
        this._traceSmoothPath(ctx, shadowPts);
        ctx.stroke();

        ctx.strokeStyle = "rgba(232,236,240,0.12)";
        ctx.lineWidth = Math.max(3, range.width * 0.018);
        ctx.beginPath();
        this._traceSmoothPath(ctx, crestPts);
        ctx.stroke();

        for (let i = 2; i < seg.pts.length - 2; i += 5) {
          ctx.strokeStyle = i % 2 === 0 ? "rgba(96,104,112,0.12)" : "rgba(48,54,60,0.10)";
          ctx.lineWidth = Math.max(1.5, range.width * 0.012);
          ctx.beginPath();
          ctx.moveTo(crestPts[i].x, crestPts[i].y);
          ctx.lineTo(shadowPts[i].x + range.nx * 2, shadowPts[i].y - 4);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  _drawMountainPassScenery(ctx, x, y, size, parity, seed, relief) {
    ctx.fillStyle = "rgba(20,24,28,0.18)";
    ctx.beginPath();
    ctx.ellipse(x + size * 0.5, y + size - 8, size * 0.44, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (((seed >>> 3) & 1) === 0) {
      ctx.fillStyle = this._shadeColor("#5c6166", -0.06 + relief * 0.04);
      ctx.beginPath();
      ctx.moveTo(x, y + size - 4);
      ctx.lineTo(x + 10, y + 14);
      ctx.lineTo(x + 15, y + size - 6);
      ctx.closePath();
      ctx.fill();
    }
    if (((seed >>> 6) & 1) === 1) {
      ctx.fillStyle = this._shadeColor("#676d72", -0.05 + relief * 0.03);
      ctx.beginPath();
      ctx.moveTo(x + size, y + size - 4);
      ctx.lineTo(x + size - 11, y + 12);
      ctx.lineTo(x + size - 17, y + size - 7);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "rgba(108,96,76,0.22)";
    ctx.beginPath();
    ctx.moveTo(x + 8, y + size - 9);
    ctx.lineTo(x + size - 8, y + size - 9);
    ctx.lineTo(x + size - 12, y + size - 4);
    ctx.lineTo(x + 12, y + size - 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(214,206,178,0.18)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + size - 12);
    ctx.lineTo(x + size - 8, y + size - 12);
    ctx.stroke();

    ctx.strokeStyle = "rgba(82,66,46,0.16)";
    ctx.beginPath();
    ctx.moveTo(x + 8, y + size - 7);
    ctx.lineTo(x + size - 8, y + size - 7);
    ctx.stroke();

    if (parity === 1 || parity === 6) {
      ctx.fillStyle = "rgba(168,154,124,0.14)";
      ctx.fillRect(x + size * 0.5 - 1, y + size - 13, 2, 5);
    }
  }

  _drawHighlandScenery(ctx, x, y, size, parity, seed, relief) {
    const ridge = y + 14 + ((seed >>> 5) & 7);
    if (parity === 2 || parity === 4 || parity === 8) {
      ctx.fillStyle = this._shadeColor("#6a7b58", relief * 0.06);
      ctx.beginPath();
      ctx.moveTo(x + 5, y + size - 6);
      ctx.lineTo(x + 16, ridge);
      ctx.lineTo(x + 26, y + size - 8);
      ctx.lineTo(x + 38, ridge + 2);
      ctx.lineTo(x + size - 4, y + size - 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(214,226,186,0.08)";
      ctx.beginPath();
      ctx.moveTo(x + 16, ridge);
      ctx.lineTo(x + 22, ridge + 7);
      ctx.lineTo(x + 28, ridge + 2);
      ctx.lineTo(x + 34, ridge + 8);
      ctx.lineTo(x + 39, ridge + 3);
      ctx.closePath();
      ctx.fill();
    }
    if (((seed >>> 14) & 7) === 2) {
      ctx.fillStyle = "rgba(74,92,54,0.24)";
      ctx.fillRect(x + 11, y + 13, 2, 10);
      ctx.fillRect(x + 15, y + 11, 2, 12);
      ctx.fillStyle = "rgba(198,210,168,0.10)";
      ctx.beginPath();
      ctx.arc(x + 17, y + 13, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawWaterScenery(ctx, x, y, size, s, parity, seed) {
    const depth = clamp(1 - s.river * 1.8, 0, 1);
    if (((x / size + y / size) | 0) % 3 === 0) {
      ctx.fillStyle = `rgba(142,211,246,${0.07 + depth * 0.10})`;
      ctx.fillRect(x + 3, y + 7, size - 6, 2);
    }
    if ((parity === 1 || parity === 6) && ((seed >>> 10) & 3) >= 1) {
      ctx.fillStyle = "rgba(210,230,188,0.12)";
      ctx.fillRect(x + 8, y + size - 12, 2, 7);
      ctx.fillRect(x + 12, y + size - 14, 2, 9);
      ctx.fillRect(x + 16, y + size - 11, 2, 6);
    }
    if (((seed >>> 17) & 7) === 4) {
      ctx.fillStyle = "rgba(220,245,255,0.10)";
      ctx.beginPath();
      ctx.arc(x + 17, y + 18, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawWorldAtmosphere(ctx, left, top, right, bottom) {
    const step = 144;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;

    ctx.save();
    for (let x = startX; x < right; x += step) {
      for (let y = startY; y < bottom; y += step) {
        const ground = this._groundAt(x + step * 0.5, y + step * 0.5);
        const shade = clamp((ground - 0.66) * 0.20, 0, 0.045);
        const light = clamp((0.38 - ground) * 0.10, 0, 0.025);

        if (shade > 0.012) {
          ctx.fillStyle = `rgba(18,26,22,${shade})`;
          ctx.beginPath();
          ctx.ellipse(x + step * 0.58, y + step * 0.66, step * 0.50, step * 0.24, -0.35, 0, Math.PI * 2);
          ctx.fill();
        } else if (light > 0.01) {
          ctx.fillStyle = `rgba(215,226,185,${light})`;
          ctx.beginPath();
          ctx.ellipse(x + step * 0.42, y + step * 0.34, step * 0.42, step * 0.22, -0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  _drawRoads(ctx) {
    if (!this.showRoads) return;
    if (!this.roads?.length) return;

    ctx.save();

    for (const road of this.roads) {
      if (road.visible === false) continue;

      const pts = road.points;
      if (!pts || pts.length < 2) continue;

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const steps = Math.max(1, Math.floor(len / 44));

        for (let s = 0; s < steps; s++) {
          const t = (s + 0.35) / steps;
          const x = a.x + dx * t;
          const y = a.y + dy * t;
          const wobble = hash2((x / 18) | 0, (y / 18) | 0, this.seed) / 4294967296;
          const side = wobble - 0.5;
          const nx = -dy / len;
          const ny = dx / len;
          const px = x + nx * side * 5;
          const py = y + ny * side * 5;
          const r = 3.2 + Math.abs(side) * 2.6;

          ctx.fillStyle = "rgba(70,63,49,0.10)";
          ctx.beginPath();
          ctx.ellipse(px, py, r + 2, r * 0.75, Math.atan2(dy, dx), 0, Math.PI * 2);
          ctx.fill();

          if ((i + s) % 3 === 0) {
            ctx.fillStyle = "rgba(210,200,165,0.05)";
            ctx.beginPath();
            ctx.ellipse(px + nx * 2, py + ny * 2, r * 0.7, r * 0.35, Math.atan2(dy, dx), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (pts.length >= 2) {
        const a = pts[0];
        const b = pts[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (let i = 1; i < pts.length; i += 2) {
          const p = pts[i];
          const wobble = ((hash2((p.x / 24) | 0, (p.y / 24) | 0, this.seed ^ 0x9911) >>> 0) / 4294967296 - 0.5) * 10;
          const sx = p.x + nx * (road.width * 0.35 + wobble);
          const sy = p.y + ny * (road.width * 0.35 + wobble);
          ctx.fillStyle = "rgba(82,70,54,0.14)";
          ctx.fillRect(sx - 1, sy - 7, 2, 9);
          ctx.fillStyle = "rgba(166,150,122,0.12)";
          ctx.fillRect(sx + 1, sy - 7, 5, 1.5);
        }

        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          const side = ((hash2((mx / 28) | 0, (my / 28) | 0, this.seed ^ 0x600d) >>> 0) / 4294967296 - 0.5) * 14;
          if (((i + road.width) % 2) === 0) {
            ctx.fillStyle = "rgba(58,52,42,0.14)";
            ctx.beginPath();
            ctx.ellipse(mx + nx * side, my + ny * side, 4.5, 2.4, Math.atan2(dy, dx), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    ctx.restore();
  }

  _drawBridges(ctx, left, top, right, bottom) {
    if (!this.bridges?.length) return;

    ctx.save();
    for (const b of this.bridges) {
      const radius = Math.max(b.length || b.w || 40, b.width || b.h || 28) * 0.65;
      if (b.cx + radius < left || b.cx - radius > right || b.cy + radius < top || b.cy - radius > bottom) continue;

      const length = b.length || b.w || 52;
      const width = (b.width || b.h || 28) + 12;
      const angle = b.angle || 0;
      const path = b.path || [];

      if (path.length >= 2) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(35,22,13,0.30)";
        ctx.lineWidth = width + 6;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();

        ctx.strokeStyle = "rgba(139,96,54,0.96)";
        ctx.lineWidth = width - 2;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();

        ctx.strokeStyle = "rgba(246,220,174,0.28)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate(angle);

      ctx.fillStyle = "rgba(16,12,8,0.26)";
      ctx.fillRect(-length * 0.5 + 4, -width * 0.5 + 5, length, width);

      ctx.fillStyle = "#7b5934";
      ctx.fillRect(-length * 0.5, -width * 0.5, length, width);
      ctx.fillStyle = "#9a7042";
      ctx.fillRect(-length * 0.5, -width * 0.5, length, width);

      ctx.fillStyle = "rgba(246,220,174,0.28)";
      const plankStep = 8;
      for (let x = -length * 0.5 + 5; x < length * 0.5 - 2; x += plankStep) {
        ctx.fillRect(x, -width * 0.5 + 2, 2, width - 4);
      }
      ctx.fillStyle = "rgba(44,28,15,0.34)";
      ctx.fillRect(-length * 0.5, -width * 0.5 + 3, length, 2);
      ctx.fillRect(-length * 0.5, width * 0.5 - 5, length, 2);
      ctx.fillStyle = "rgba(255,235,190,0.20)";
      ctx.fillRect(-length * 0.5 + 4, -width * 0.5 + 5, length - 8, 2);

      ctx.strokeStyle = "rgba(70,46,22,0.44)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-length * 0.5 + 6, -width * 0.5 + 6);
      ctx.lineTo(-length * 0.5 + 6, width * 0.5 - 6);
      ctx.moveTo(length * 0.5 - 6, -width * 0.5 + 6);
      ctx.lineTo(length * 0.5 - 6, width * 0.5 - 6);
      ctx.stroke();

      ctx.strokeStyle = "rgba(210,178,132,0.20)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-length * 0.5 + 6, -width * 0.5 + 7);
      ctx.lineTo(length * 0.5 - 6, -width * 0.5 + 7);
      ctx.moveTo(-length * 0.5 + 6, width * 0.5 - 7);
      ctx.lineTo(length * 0.5 - 6, width * 0.5 - 7);
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }

  _drawRiverOverlays(ctx, left, top, right, bottom) {
    if (!this._riverBands?.length) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const band of this._riverBands) {
      const pts = this._riverPath(band);
      if (pts.length < 2 || !this._pathNearViewport(pts, left, top, right, bottom, 260)) continue;

      const width = this._riverVisualWidth(band);

      ctx.beginPath();
      this._traceSmoothPath(ctx, pts);
      ctx.strokeStyle = "rgba(58,96,76,0.10)";
      ctx.lineWidth = width + 14;
      ctx.stroke();

      ctx.beginPath();
      this._traceSmoothPath(ctx, pts);
      ctx.strokeStyle = "rgba(86,137,139,0.14)";
      ctx.lineWidth = width + 4;
      ctx.stroke();

      ctx.beginPath();
      this._traceSmoothPath(ctx, pts);
      ctx.strokeStyle = "rgba(35,127,178,0.94)";
      ctx.lineWidth = width;
      ctx.stroke();

      ctx.beginPath();
      this._traceSmoothPath(ctx, pts);
      ctx.strokeStyle = "rgba(91,190,216,0.22)";
      ctx.lineWidth = Math.max(28, width * 0.68);
      ctx.stroke();

      ctx.beginPath();
      this._traceSmoothPath(ctx, pts);
      ctx.strokeStyle = "rgba(14,64,117,0.20)";
      ctx.lineWidth = Math.max(18, width * 0.38);
      ctx.stroke();

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const foamCount = Math.max(1, Math.floor(len / 180));
        for (let j = 0; j < foamCount; j++) {
          const t = (j + 0.5) / foamCount;
          const px = a.x + dx * t;
          const py = a.y + dy * t;
          const wobble = ((hash2((px / 34) | 0, (py / 34) | 0, band.seed ^ 0x4488) >>> 0) / 4294967296 - 0.5) * width * 0.25;
          ctx.fillStyle = "rgba(214,244,255,0.12)";
          ctx.beginPath();
          ctx.ellipse(px + nx * wobble, py + ny * wobble, Math.max(4, width * 0.08), Math.max(1.6, width * 0.024), Math.atan2(dy, dx), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    this._drawRiverConfluences(ctx, left, top, right, bottom);
    this._drawRiverMouths(ctx, left, top, right, bottom);
    ctx.restore();
  }

  _drawRiverMouths(ctx, left, top, right, bottom) {
    for (const band of this._riverBands || []) {
      const pts = this._riverPath(band);
      if (pts.length < 2) continue;

      const ends = [pts[0], pts[pts.length - 1]];
      for (const p of ends) {
        if (p.x < left - 180 || p.x > right + 180 || p.y < top - 180 || p.y > bottom + 180) continue;

        const nearLake =
          this._groundAt(p.x, p.y) < 0.31 ||
          this._groundAt(p.x + 92, p.y) < 0.255 ||
          this._groundAt(p.x - 92, p.y) < 0.255 ||
          this._groundAt(p.x, p.y + 92) < 0.255 ||
          this._groundAt(p.x, p.y - 92) < 0.255;
        if (!nearLake) continue;

        const width = this._riverVisualWidth(band);
        ctx.fillStyle = "rgba(36,112,164,0.74)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, width * 0.82, width * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(94,184,214,0.16)";
        ctx.beginPath();
        ctx.ellipse(p.x - width * 0.12, p.y - width * 0.08, width * 0.46, width * 0.24, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawRiverConfluences(ctx, left, top, right, bottom) {
    for (const band of this._riverBands || []) {
      if (!band.joinBand) continue;
      const join = this._riverEndPoint(band);
      if (join.x < left - 180 || join.x > right + 180 || join.y < top - 180 || join.y > bottom + 180) continue;

      const mainW = this._riverVisualWidth(band.joinBand);
      const sideW = this._riverVisualWidth(band);
      const rx = Math.max(58, (mainW + sideW) * 0.40);
      const ry = Math.max(42, (mainW + sideW) * 0.32);

      const main = this._riverPath(band.joinBand);
      const t = band.joinT || 0.5;
      const before = this._pointOnRiverPath(main, Math.max(0, t - 0.035));
      const after = this._pointOnRiverPath(main, Math.min(1, t + 0.035));
      const angle = Math.atan2(after.y - before.y, after.x - before.x);

      ctx.fillStyle = "rgba(48,120,137,0.16)";
      ctx.beginPath();
      ctx.ellipse(join.x, join.y, rx + 12, ry + 8, angle, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(38,132,178,0.78)";
      ctx.beginPath();
      ctx.ellipse(join.x, join.y, rx, ry, angle, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(99,190,215,0.18)";
      ctx.beginPath();
      ctx.ellipse(join.x - Math.cos(angle) * rx * 0.16, join.y - Math.sin(angle) * ry * 0.16, rx * 0.72, ry * 0.50, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _riverVisualWidth(band) {
    return 82 * (band?.width || 1);
  }

  _riverCollisionWidth(band, x, y) {
    const jitter =
      (fbm(x * 0.0012, y * 0.0012, band.seed + 17, 3) - 0.5) * 18 +
      (fbm(x * 0.0022, y * 0.0022, band.seed + 29, 2) - 0.5) * 10;
    return Math.max(20, this._riverVisualWidth(band) * 0.54 + jitter);
  }

  _nearestRiverInfo(x, y) {
    let best = null;
    for (const band of this._riverBands || []) {
      const segments = this._riverSegments(band);
      for (const seg of segments) {
        const t = clamp(((x - seg.ax) * seg.dx + (y - seg.ay) * seg.dy) / seg.len2, 0, 1);
        const qx = seg.ax + seg.dx * t;
        const qy = seg.ay + seg.dy * t;
        const ox = x - qx;
        const oy = y - qy;
        const dist2 = ox * ox + oy * oy;
        if (!best || dist2 < best.dist2) {
          best = {
            band,
            dist2,
            dist: Math.sqrt(dist2),
            x: qx,
            y: qy,
            tangent: seg.angle,
          };
        }
      }
    }
    return best;
  }

  _traceSmoothPath(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) * 0.5;
      const midY = (pts[i].y + pts[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  _pathNearViewport(pts, left, top, right, bottom, pad = 0) {
    for (const p of pts) {
      if (p.x > left - pad && p.x < right + pad && p.y > top - pad && p.y < bottom + pad) return true;
    }

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (maxX >= left - pad && minX <= right + pad && maxY >= top - pad && minY <= bottom + pad) return true;
    }

    return false;
  }

  _drawPOIs(ctx) {
    const tNow = performance.now() * 0.001;

    for (const t of this.towns || []) {
      this._drawBeacon(ctx, t.x, t.y - 8, "#8be9ff", 64, 22, 0.10);
      this._drawDropShadow(ctx, t.x, t.y + 18, 34, 10, 0.24);
      ctx.fillStyle = "rgba(117,211,224,0.13)";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 38, 0, Math.PI * 2);
      ctx.fill();

      const buildings = [
        [-18, -8, 18, 20, "#5b4b3f"],
        [4, -14, 22, 24, "#4a5260"],
        [-4, 12, 26, 18, "#6a5744"],
      ];
      for (const [ox, oy, bw, bh, color] of buildings) {
        ctx.fillStyle = color;
        ctx.fillRect(t.x + ox, t.y + oy, bw, bh);
        ctx.fillStyle = "#d3aa68";
        ctx.beginPath();
        ctx.moveTo(t.x + ox - 3, t.y + oy);
        ctx.lineTo(t.x + ox + bw * 0.5, t.y + oy - 10);
        ctx.lineTo(t.x + ox + bw + 3, t.y + oy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,232,156,0.72)";
        ctx.fillRect(t.x + ox + bw * 0.45, t.y + oy + bh - 8, 5, 8);
      }

      ctx.strokeStyle = "rgba(150,130,92,0.42)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x - 32, t.y + 22);
      ctx.lineTo(t.x + 34, t.y + 22);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,236,190,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.x - 28, t.y + 22);
      ctx.lineTo(t.x + 30, t.y + 22);
      ctx.stroke();

      ctx.fillStyle = "rgba(82,116,62,0.24)";
      ctx.beginPath();
      ctx.arc(t.x - 30, t.y + 10, 6, 0, Math.PI * 2);
      ctx.arc(t.x + 31, t.y + 9, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(139,235,255,0.56)";
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - 28.5, t.y - 28.5, 57, 57);
      ctx.fillStyle = "#dffbff";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(t.name || "Town", t.x, t.y - 42);
    }

    for (const c of this.camps) {
      const campStyle =
        c.type === "beast" ? ["#5e4b42", "#c98b5f", "rgba(201,139,95,0.16)"] :
        c.type === "cult" ? ["#3f2b4f", "#d785ff", "rgba(215,133,255,0.16)"] :
        c.type === "stone" ? ["#4b5260", "#c8c0a2", "rgba(200,192,162,0.16)"] :
        c.type === "wild" ? ["#345538", "#8fde7a", "rgba(143,222,122,0.16)"] :
        ["#4e3724", "#ffcf58", "rgba(255,206,84,0.16)"];
      this._drawDropShadow(ctx, c.x, c.y + 10, 20, 7, 0.22);
      ctx.fillStyle = campStyle[2];
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = campStyle[0];
      ctx.fillRect(c.x - 10, c.y + 3, 20, 8);
      ctx.fillStyle = campStyle[1];
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff0a6";
      ctx.beginPath();
      ctx.arc(c.x - 2, c.y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = campStyle[2];
      ctx.beginPath();
      ctx.arc(c.x, c.y, 28, 0, Math.PI * 2);
      ctx.fill();
      this._drawBeacon(ctx, c.x, c.y - 3, campStyle[1], 34, 12, 0.07);

      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(c.x - 14, c.y + 12);
      ctx.lineTo(c.x + 15, c.y + 12);
      ctx.stroke();
      if (c.type === "bandit" || c.type === "cult") {
        ctx.fillStyle = "rgba(255,238,198,0.74)";
        ctx.fillRect(c.x + 10, c.y - 10, 2, 10);
        ctx.fillStyle = campStyle[1];
        ctx.beginPath();
        ctx.moveTo(c.x + 12, c.y - 10);
        ctx.lineTo(c.x + 20, c.y - 7);
        ctx.lineTo(c.x + 12, c.y - 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    for (const w of this.waystones) {
      const pulse = 1 + Math.sin(tNow * 2.1 + w.id) * 0.08;
      this._drawBeacon(ctx, w.x, w.y - 8, "#7fe8ff", 78, 18, 0.13);
      this._drawDropShadow(ctx, w.x, w.y + 9, 17, 6, 0.24);
      ctx.fillStyle = "rgba(96,210,255,0.18)";
      ctx.beginPath();
      ctx.arc(w.x, w.y, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3bb8d8";
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - 13);
      ctx.lineTo(w.x + 9, w.y + 9);
      ctx.lineTo(w.x - 9, w.y + 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d7f8ff";
      ctx.fillRect(w.x - 2, w.y - 5, 4, 10);
      ctx.fillStyle = "rgba(126,224,255,0.14)";
      ctx.beginPath();
      ctx.arc(w.x, w.y, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,240,255,0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 33, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const d of this.dungeons) {
      const pulse = 1 + Math.sin(tNow * 1.7 + d.id) * 0.07;
      const passSite =
        this._sampleCellRaw(d.x - 120, d.y).isMountain &&
        this._sampleCellRaw(d.x + 120, d.y).isMountain;
      this._drawBeacon(ctx, d.x, d.y - 10, "#dc7cff", 82, 20, 0.12);
      this._drawDropShadow(ctx, d.x, d.y + 11, 23, 8, 0.32);
      if (passSite) {
        ctx.fillStyle = "rgba(66,72,78,0.34)";
        ctx.beginPath();
        ctx.moveTo(d.x - 34, d.y + 18);
        ctx.lineTo(d.x - 20, d.y - 18);
        ctx.lineTo(d.x - 8, d.y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(d.x + 34, d.y + 18);
        ctx.lineTo(d.x + 20, d.y - 18);
        ctx.lineTo(d.x + 8, d.y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(220,124,255,0.24)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(d.x - 16, d.y + 14);
        ctx.lineTo(d.x + 16, d.y + 14);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(160,80,210,0.22)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 20 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#32223f";
      ctx.beginPath();
      ctx.arc(d.x, d.y + 3, 11, Math.PI, 0);
      ctx.lineTo(d.x + 11, d.y + 11);
      ctx.lineTo(d.x - 11, d.y + 11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#dc7cff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.arc(d.x, d.y + 5, 8, Math.PI, 0);
      ctx.lineTo(d.x + 8, d.y + 10);
      ctx.lineTo(d.x - 8, d.y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x - 15.5, d.y - 1.5, 31, 22);
      ctx.fillStyle = "rgba(74,56,42,0.20)";
      ctx.fillRect(d.x - 24, d.y + 18, 48, 4);
    }

    for (const d of this.docks) {
      this._drawDropShadow(ctx, d.x, d.y + 8, 16, 4, 0.18);
      ctx.strokeStyle = "rgba(245,245,230,0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(d.x - 12, d.y + 7);
      ctx.lineTo(d.x + 12, d.y + 7);
      ctx.moveTo(d.x - 8, d.y - 5);
      ctx.lineTo(d.x - 8, d.y + 10);
      ctx.moveTo(d.x + 5, d.y - 5);
      ctx.lineTo(d.x + 5, d.y + 10);
      ctx.stroke();
      ctx.strokeStyle = "rgba(210,230,242,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x - 2, d.y - 9);
      ctx.lineTo(d.x - 2, d.y + 6);
      ctx.lineTo(d.x + 8, d.y - 1);
      ctx.stroke();
    }

    for (const s of this.shrines) {
      const pulse = 1 + Math.sin(tNow * 2.4 + s.id) * 0.09;
      this._drawDropShadow(ctx, s.x, s.y + 11, 18, 7, 0.26);
      ctx.fillStyle = "rgba(183,126,255,0.25)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 19 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7250a8";
      ctx.fillRect(s.x - 7, s.y + 9, 14, 5);
      ctx.fillStyle = "#b77eff";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 16);
      ctx.lineTo(s.x + 8, s.y + 7);
      ctx.lineTo(s.x - 8, s.y + 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f0dcff";
      ctx.beginPath();
      ctx.arc(s.x, s.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(205,153,255,0.12)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(240,220,255,0.18)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 36 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(88,68,126,0.22)";
      ctx.fillRect(s.x - 20, s.y + 15, 40, 3);
    }

    for (const c of this.caches) {
      const shine = Math.max(0, Math.sin(tNow * 2.8 + c.id));
      this._drawDropShadow(ctx, c.x, c.y + 3, 13, 5, 0.24);
      ctx.fillStyle = "rgba(255,216,132,0.10)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18 + shine * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c49a4d";
      ctx.fillRect(c.x - 7, c.y - 7, 14, 10);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(c.x - 7, c.y - 7, 14, 2);
      ctx.fillStyle = `rgba(255,242,170,${0.10 + shine * 0.18})`;
      ctx.fillRect(c.x - 5, c.y - 10, 10, 2);
      ctx.fillStyle = "#ffe19a";
      ctx.fillRect(c.x - 2, c.y - 7, 4, 10);
      ctx.strokeStyle = "rgba(70,45,20,0.62)";
      ctx.strokeRect(c.x - 7.5, c.y - 7.5, 15, 11);
      ctx.fillStyle = "rgba(96,78,42,0.18)";
      ctx.fillRect(c.x - 14, c.y + 8, 28, 3);
    }

    for (const s of this.secrets || []) {
      const pulse = 1 + Math.sin(tNow * 2.0 + s.id) * 0.10;
      this._drawDropShadow(ctx, s.x, s.y + 6, 12, 4, 0.18);
      ctx.fillStyle = "rgba(255,238,170,0.10)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,232,156,0.48)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 12);
      ctx.lineTo(s.x + 8, s.y + 8);
      ctx.lineTo(s.x - 8, s.y + 8);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "#ffeaa8";
      ctx.fillRect(s.x - 1.5, s.y - 5, 3, 10);
      ctx.strokeStyle = "rgba(255,244,206,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 24 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const lair of this.dragonLairs) {
      const pulse = 1 + Math.sin(tNow * 1.45 + lair.id) * 0.06;
      this._drawBeacon(ctx, lair.x, lair.y - 12, "#ff8a5c", 92, 24, 0.12);
      this._drawDropShadow(ctx, lair.x, lair.y + 14, 28, 10, 0.34);
      ctx.fillStyle = "rgba(130,18,28,0.24)";
      ctx.beginPath();
      ctx.arc(lair.x, lair.y, 24 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8f1f2d";
      ctx.beginPath();
      ctx.moveTo(lair.x, lair.y - 18);
      ctx.lineTo(lair.x + 18, lair.y + 14);
      ctx.lineTo(lair.x - 18, lair.y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,196,150,0.14)";
      ctx.beginPath();
      ctx.moveTo(lair.x, lair.y - 10);
      ctx.lineTo(lair.x + 8, lair.y + 5);
      ctx.lineTo(lair.x - 8, lair.y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb06e";
      ctx.fillRect(lair.x - 3, lair.y - 3, 6, 12);
      ctx.strokeStyle = "rgba(255,120,86,0.18)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(lair.x, lair.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawBeacon(ctx, x, y, color, height = 72, width = 18, alpha = 0.1) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y - height, x, y + 8);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.22, this._colorAlpha(color, alpha));
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - height);
    ctx.lineTo(x + width, y + 8);
    ctx.lineTo(x - width, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _colorAlpha(color, alpha) {
    if (typeof color !== "string") return `rgba(255,255,255,${alpha})`;
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      const int = Number.parseInt(full, 16);
      if (Number.isFinite(int)) {
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgba(${r},${g},${b},${alpha})`;
      }
    }
    if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`);
    if (color.startsWith("rgba(")) return color.replace(/,\s*[\d.]+\)$/, `,${alpha})`);
    return `rgba(255,255,255,${alpha})`;
  }

  _drawDropShadow(ctx, x, y, rx, ry, alpha = 0.2) {
    ctx.fillStyle = `rgba(9,12,10,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x + 5, y + 4, rx, ry, -0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  _sampleCell(x, y) {
    const ground = this._groundAt(x, y);
    const river = this._riverAt(x, y);
    const road = this._roadAt(x, y);
    const bridge = this._bridgeAt(x, y);

    const sx = x - this.spawn.x;
    const sy = y - this.spawn.y;
    const spawnDist = Math.hypot(sx, sy);

    let isLake = false;
    let isRiver = false;
    if (!bridge) {
      isLake = ground < 0.245;
      isRiver = river < this._riverWaterLimit;
    }
    let isWater = isLake || isRiver;

    // absolute spawn safety basin for lakes/terrain water. Rivers are routed away
    // during generation so collision, map, and visuals never disagree.
    if (spawnDist < this._spawnSafeRadius) {
      isLake = false;
      isWater = isRiver;
    }

    const mountainBase = this._mountainBaseAt(x, y, ground, isWater);
    const isMountainWall = mountainBase;

    const moisture = this._moistureAt(x, y);

    const danger = this.getDangerLevel(x, y);
    let zone = "meadow";
    let color = "#6aa04f";

    if (isLake) {
      zone = "river";
      color = "#2c6a9a";
    } else if (danger <= 1) {
      zone = moisture > 0.58 ? "greenwood" : "meadow";
      color = moisture > 0.58 ? "#5d9a4d" : "#76b45c";
    } else if (danger === 2) {
      zone = moisture > 0.56 ? "forest" : "old fields";
      color = moisture > 0.56 ? "#4f8a46" : "#789f4f";
    } else if (danger === 3) {
      zone = moisture > 0.62 ? "deep wilds" : "stone flats";
      color = moisture > 0.62 ? "#2f7f39" : "#8f938f";
    } else if (mountainBase) {
      zone = "mountain";
      color = ground > 0.84 ? "#c3c9ce" : "#9ca3a8";
    } else if (danger === 4) {
      zone = moisture < 0.36 ? "ashlands" : "highlands";
      color = moisture < 0.36 ? "#a79a69" : "#788b65";
    } else if (ground > 0.82) {
      zone = "mountain";
      color = "#c3c9ce";
    } else if (ground > 0.70) {
      zone = "stone flats";
      color = "#8f938f";
    } else if (moisture > 0.72) {
      zone = "deep wilds";
      color = "#2f7f39";
    } else if (moisture > 0.56) {
      zone = "forest";
      color = "#4f8a46";
    } else if (moisture < 0.24) {
      zone = "ashlands";
      color = "#a79a69";
    } else {
      zone = "meadow";
      color = "#6aa04f";
    }

    // soften spawn meadow visually too
    if (spawnDist < this._spawnSafeRadius) {
      zone = "meadow";
      color = spawnDist < this._spawnSafeRadius * 0.68 ? "#76b45c" : "#6eaa57";
    }

    const landColor = color;
    if (isRiver && !isLake && !bridge) {
      zone = "river";
    }

    if (road && !isWater && !bridge && !mountainBase) {
      zone = "road";
    }

    if (bridge) {
      color = "#8a6a42";
    }

    return {
      ground,
      river,
      moisture,
      isWater,
      isLake,
      isRiver,
      isMountainWall,
      mountainBase,
      road,
      bridge,
      zone,
      color,
      landColor,
    };
  }

  _sampleMapCell(x, y) {
    const ground = this._groundAt(x, y);
    const river = this._riverAt(x, y);
    const sx = x - this.spawn.x;
    const sy = y - this.spawn.y;
    const spawnDist = Math.hypot(sx, sy);
    const moisture = this._moistureAt(x, y);
    const danger = this.getDangerLevel(x, y);

    let isWater = ground < 0.245 || river < this._riverWaterLimit;
    if (spawnDist < this._spawnSafeRadius && river >= this._riverWaterLimit) isWater = false;
    const mountainBase = this._mountainBaseAt(x, y, ground, isWater);

    let zone = "meadow";
    let color = "#6aa04f";

    if (isWater) {
      zone = "river";
      const confluence = this._nearRiverConfluence(x, y);
      color = confluence ? "#216fa9" : river < this._riverWaterLimit ? (river < 0.78 ? "#2477b1" : "#2f86bd") : "#2c6a9a";
    } else if (mountainBase) {
      zone = "mountain";
      color = ground > 0.84 ? "#c3c9ce" : "#9ca3a8";
    } else if (danger <= 1) {
      zone = moisture > 0.58 ? "greenwood" : "meadow";
      color = moisture > 0.58 ? "#5d9a4d" : "#76b45c";
    } else if (danger === 2) {
      zone = moisture > 0.56 ? "forest" : "old fields";
      color = moisture > 0.56 ? "#4f8a46" : "#789f4f";
    } else if (danger === 3) {
      zone = moisture > 0.62 ? "deep wilds" : "stone flats";
      color = moisture > 0.62 ? "#2f7f39" : "#8f938f";
    } else if (danger === 4) {
      zone = moisture < 0.36 ? "ashlands" : "highlands";
      color = moisture < 0.36 ? "#a79a69" : "#788b65";
    } else if (ground > 0.82) {
      zone = "mountain";
      color = "#c3c9ce";
    } else if (ground > 0.70) {
      zone = "stone flats";
      color = "#8f938f";
    } else if (moisture > 0.72) {
      zone = "deep wilds";
      color = "#2f7f39";
    } else if (moisture > 0.56) {
      zone = "forest";
      color = "#4f8a46";
    } else if (moisture < 0.24) {
      zone = "ashlands";
      color = "#a79a69";
    }

    const road = this._roadAt(x, y);
    const bridge = this._bridgeAt(x, y);
    if (road && !isWater && !bridge && !mountainBase) {
      zone = "road";
      color = "#9c8d6f";
    }

    return { color, zone, isWater };
  }

  _nearRiverConfluence(x, y) {
    for (const band of this._riverBands || []) {
      if (!band.joinBand) continue;
      const join = this._riverEndPoint(band);
      if (Math.hypot(x - join.x, y - join.y) < 180) return true;
    }
    return false;
  }

  _shadeColor(hex, amount = 0) {
    const raw = String(hex || "#000000").replace("#", "");
    if (raw.length !== 6) return hex || "#000000";
    const n = Number.parseInt(raw, 16);
    if (!Number.isFinite(n)) return hex;

    const shift = Math.round(clamp(amount, -0.5, 0.5) * 255);
    const r = clamp(((n >> 16) & 255) + shift, 0, 255) | 0;
    const g = clamp(((n >> 8) & 255) + shift, 0, 255) | 0;
    const b = clamp((n & 255) + shift, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }

  _groundAt(x, y) {
    const base = fbm(x * 0.00042, y * 0.00042, this.seed, 5);
    const detail = fbm(x * 0.0012, y * 0.0012, this.seed + 77, 3);
    const d = Math.hypot(x, y);
    const mainland = clamp(1 - d / 4200, 0, 1) * 0.14;
    const farRidges = fbm(x * 0.00018 + 40, y * 0.00018 - 17, this.seed + 404, 3) * 0.10;
    const wildCoast = clamp((d - 9000) / 2600, 0, 1) * 0.035;
    return base * 0.76 + detail * 0.17 + mainland + farRidges - wildCoast;
  }

  _moistureAt(x, y) {
    const a = fbm(x * 0.0007, y * 0.0007, this.seed + 200, 4);
    const b = fbm(x * 0.0015, y * 0.0015, this.seed + 311, 2);
    return a * 0.8 + b * 0.2;
  }

  _makeRiverBands() {
    const main = {
      ax: -this._rng.range(7600, 10300),
      ay: -this._rng.range(6200, 9100),
      bx: this._rng.range(6900, 10300),
      by: this._rng.range(6700, 10100),
      width: this._rng.range(0.95, 1.18),
      bends: 62,
      amplitude: this._rng.range(980, 1320),
      seed: hash2(this.seed, 101),
    };

    const tributary = {
      ax: this._rng.range(4300, 8900),
      ay: -this._rng.range(9400, 11800),
      joinBand: main,
      joinT: this._rng.range(0.42, 0.60),
      width: this._rng.range(0.58, 0.78),
      bends: 36,
      amplitude: this._rng.range(620, 920),
      seed: hash2(this.seed, 202),
    };

    return [main, tributary];
  }

  _makeMountainRanges() {
    const ranges = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      let angle = 0;
      if (i % 3 === 0) angle = this._rng.range(-0.42, 0.42);
      else if (i % 3 === 1) angle = this._rng.range(0.92, 1.42);
      else angle = this._rng.range(-0.98, -0.46);

      const normal = angle + Math.PI * 0.5;
      const offset = this._rng.range(3000, 7600) * (this._rng.next() < 0.5 ? -1 : 1);
      const cx = Math.cos(normal) * offset;
      const cy = Math.sin(normal) * offset;
      const half = this._rng.range(7000, 9800);

      ranges.push({
        ax: cx - Math.cos(angle) * half,
        ay: cy - Math.sin(angle) * half,
        bx: cx + Math.cos(angle) * half,
        by: cy + Math.sin(angle) * half,
        width: this._rng.range(620, 980),
        seed: hash2(this.seed, 700 + i),
      });
    }
    return ranges;
  }

  _makeMountainPasses() {
    const passes = [];
    for (const range of this._mountainRanges || []) {
      const dx = range.bx - range.ax;
      const dy = range.by - range.ay;
      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len;
      const ty = dy / len;
      const nx = -ty;
      const ny = tx;
      const passCount = (range.seed & 1) === 0 ? 2 : 1;

      for (let i = 0; i < passCount; i++) {
        const t = passCount === 1
          ? 0.5
          : i === 0
            ? 0.28 + ((range.seed >>> 3) & 15) / 100
            : 0.68 + ((range.seed >>> 7) & 11) / 100;
        const px = range.ax + dx * t;
        const py = range.ay + dy * t;
        const drift = (((range.seed >>> (i ? 11 : 15)) & 15) - 7.5) * 28;
        passes.push({
          x: px + tx * drift,
          y: py + ty * drift,
          nx,
          ny,
          tx,
          ty,
          width: range.width * (0.34 + i * 0.04),
          length: 420 + ((range.seed >>> (i ? 19 : 23)) & 15) * 22,
          rangeSeed: range.seed,
        });
      }
    }
    return passes;
  }

  _buildMountainRenderData() {
    const out = [];
    for (const range of this._mountainRanges || []) {
      const dx = range.bx - range.ax;
      const dy = range.by - range.ay;
      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len;
      const ty = dy / len;
      const nx = -ty;
      const ny = tx;
      const steps = Math.max(18, Math.ceil(len / 440));
      const pts = [];

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const baseX = range.ax + dx * t;
        const baseY = range.ay + dy * t;
        const wander = (fbm(baseX * 0.0011, baseY * 0.0011, range.seed + 81, 3) - 0.5) * range.width * 0.18;
        pts.push({
          x: baseX + nx * wander,
          y: baseY + ny * wander,
          t,
        });
      }

      const passWindows = (this._mountainPasses || [])
        .filter((pass) => pass.rangeSeed === range.seed)
        .map((pass) => {
          const ox = pass.x - range.ax;
          const oy = pass.y - range.ay;
          const t = clamp((ox * tx + oy * ty) / len, 0, 1);
          const span = clamp((pass.length * 0.72) / len, 0.025, 0.09);
          return { start: Math.max(0, t - span), end: Math.min(1, t + span) };
        })
        .sort((a, b) => a.start - b.start);

      const windows = [];
      let cursor = 0;
      for (const gap of passWindows) {
        if (gap.start > cursor + 0.02) windows.push({ start: cursor, end: gap.start });
        cursor = Math.max(cursor, gap.end);
      }
      if (cursor < 0.98) windows.push({ start: cursor, end: 1 });

      const segments = [];
      for (const window of windows) {
        const segPts = pts.filter((p) => p.t >= window.start && p.t <= window.end);
        if (segPts.length < 2) continue;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of segPts) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const slopeX = nx * (range.width * 0.18) + 34;
        const slopeY = ny * (range.width * 0.18) + range.width * 0.92;
        segments.push({
          pts: segPts,
          minX: minX - range.width - 80,
          minY: minY - range.width * 0.32 - 40,
          maxX: maxX + range.width + 80 + Math.max(0, slopeX),
          maxY: maxY + range.width + 110 + Math.max(0, slopeY),
        });
      }

      out.push({
        width: range.width,
        nx,
        ny,
        tx,
        ty,
        seed: range.seed,
        segments,
      });
    }

    return out;
  }

  _mountainInfluenceAt(x, y) {
    let best = 0;
    for (const range of this._mountainRanges || []) {
      const dx = range.bx - range.ax;
      const dy = range.by - range.ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - range.ax) * dx + (y - range.ay) * dy) / len2, 0, 1);
      const qx = range.ax + dx * t;
      const qy = range.ay + dy * t;
      const dist = Math.hypot(x - qx, y - qy);
      const noise = fbm(x * 0.00115 + range.seed * 0.000001, y * 0.00115 - range.seed * 0.000001, range.seed, 3);
      const width = range.width * (0.72 + noise * 0.42);
      if (dist > width) continue;

      const edgeFade = 0.55 + Math.sin(t * Math.PI) * 0.45;
      const ridge = clamp(1 - dist / width, 0, 1) * edgeFade;
      if (ridge > best) best = ridge;
    }
    return best;
  }

  _mountainPassInfluenceAt(x, y) {
    let best = 0;
    for (const pass of this._mountainPasses || []) {
      const ox = x - pass.x;
      const oy = y - pass.y;
      const along = Math.abs(ox * pass.tx + oy * pass.ty);
      const across = Math.abs(ox * pass.nx + oy * pass.ny);
      if (along > pass.length || across > pass.width) continue;

      const alongFade = clamp(1 - along / pass.length, 0, 1);
      const acrossFade = clamp(1 - across / pass.width, 0, 1);
      const notch = alongFade * acrossFade;
      if (notch > best) best = notch;
    }
    return best;
  }

  _mountainBaseAt(x, y, ground, isWater) {
    if (isWater) return false;
    const spawnDist = Math.hypot(x - this.spawn.x, y - this.spawn.y);
    if (spawnDist <= this._spawnSafeRadius * 1.15) return false;

    const ridge = this._mountainInfluenceAt(x, y);
    const pass = this._mountainPassInfluenceAt(x, y);
    const highland = clamp((ground - 0.74) / 0.16, 0, 1);
    const effectiveRidge = ridge - pass * 0.95;
    return effectiveRidge > 0.52 || (effectiveRidge > 0.24 && highland > 0.76);
  }

  _riverAt(x, y) {
    let best = 999;

    for (const band of this._riverBands) {
      const dist = this._distancePointToRiverPath(x, y, this._riverPath(band), this._riverSegments(band));

      const widthPx = this._riverCollisionWidth(band, x, y);
      const v = dist / Math.max(12, widthPx);
      if (v < best) best = v;
    }

    return best;
  }

  _riverPath(band) {
    if (band._path?.length) return band._path;

    const end = this._riverEndPoint(band);
    const dx = end.x - band.ax;
    const dy = end.y - band.ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const count = Math.max(24, band.bends || 48);
    const pts = [];

    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const ease = Math.sin(t * Math.PI);
      const baseX = band.ax + dx * t;
      const baseY = band.ay + dy * t;
      const phaseA = (band.seed % 628) * 0.01;
      const phaseB = (band.seed % 991) * 0.008;
      const waveA = Math.sin(t * Math.PI * 13 + phaseA);
      const waveB = Math.sin(t * Math.PI * 23 + phaseB) * 0.42;
      const waveC = Math.sin(t * Math.PI * 37 + phaseA * 0.7) * 0.18;
      const noise = (fbm(baseX * 0.00115, baseY * 0.00115, band.seed, 3) - 0.5) * 1.1;
      const bend = (waveA + waveB + waveC + noise) * (band.amplitude || 1000) * ease;
      const bankWobble = Math.sin(t * Math.PI * 31 + phaseB) * 95 * ease;
      const wanderX = (fbm(baseX * 0.0018 + 13, baseY * 0.0018 - 7, band.seed + 41, 2) - 0.5) * 130 * ease;
      const wanderY = (fbm(baseX * 0.0018 - 19, baseY * 0.0018 + 23, band.seed + 61, 2) - 0.5) * 130 * ease;

      let px = baseX + nx * (bend + bankWobble) + wanderX;
      let py = baseY + ny * (bend + bankWobble) + wanderY;
      const fromSpawnX = px - this.spawn.x;
      const fromSpawnY = py - this.spawn.y;
      const fromSpawn = Math.hypot(fromSpawnX, fromSpawnY);
      const avoid = this._riverAvoidSpawnRadius || 0;
      if (fromSpawn < avoid && fromSpawn > 0.001) {
        const push = (avoid - fromSpawn) / avoid;
        const pushDist = push * push * avoid * 0.92;
        px += (fromSpawnX / fromSpawn) * pushDist;
        py += (fromSpawnY / fromSpawn) * pushDist;
      }

      pts.push({ x: px, y: py });
    }

    band._path = pts;
    return pts;
  }

  _riverSegments(band) {
    if (band._segments?.length) return band._segments;
    const pts = this._riverPath(band);
    const segments = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      segments.push({
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        dx,
        dy,
        len2: dx * dx + dy * dy || 1,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
        angle: Math.atan2(dy, dx),
      });
    }
    band._segments = segments;
    return segments;
  }

  _riverEndPoint(band) {
    if (band.joinBand) {
      const join = this._pointOnRiverPath(this._riverPath(band.joinBand), band.joinT || 0.5);
      return { x: join.x, y: join.y };
    }
    return { x: band.bx, y: band.by };
  }

  _pointOnRiverPath(pts, t = 0.5) {
    if (!pts?.length) return { x: 0, y: 0 };
    if (pts.length === 1) return pts[0];

    const metric = this._riverPathMetric(pts);
    const lengths = metric.lengths;
    const total = metric.total;

    let target = clamp(t, 0, 1) * total;
    for (let i = 1; i < pts.length; i++) {
      const len = lengths[i - 1] || 1;
      if (target <= len) {
        const k = target / len;
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
        };
      }
      target -= len;
    }

    return pts[pts.length - 1];
  }

  _riverPathMetric(pts) {
    if (pts._metric) return pts._metric;

    const lengths = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      lengths.push(len);
      total += len;
    }

    pts._metric = { lengths, total };
    return pts._metric;
  }

  _distancePointToRiverPath(px, py, pts, segments = null) {
    let best2 = Infinity;
    const segs = segments || this._segmentsFromPoints(pts);
    for (const seg of segs) {
      const bx = px < seg.minX ? seg.minX - px : px > seg.maxX ? px - seg.maxX : 0;
      const by = py < seg.minY ? seg.minY - py : py > seg.maxY ? py - seg.maxY : 0;
      if (bx * bx + by * by > best2) continue;

      const t = clamp(((px - seg.ax) * seg.dx + (py - seg.ay) * seg.dy) / seg.len2, 0, 1);
      const qx = seg.ax + seg.dx * t;
      const qy = seg.ay + seg.dy * t;
      const ox = px - qx;
      const oy = py - qy;
      const d2 = ox * ox + oy * oy;
      if (d2 < best2) best2 = d2;
    }
    return Math.sqrt(best2);
  }

  _segmentsFromPoints(pts) {
    const segments = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      segments.push({
        ax: a.x,
        ay: a.y,
        dx,
        dy,
        len2: dx * dx + dy * dy || 1,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      });
    }
    return segments;
  }

  _distancePointToQuadraticBezier(px, py, ax, ay, bx, by, cx, cy) {
    let best = Infinity;
    let lx = ax;
    let ly = ay;

    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const q = quadPoint(ax, ay, bx, by, cx, cy, t);
      const d = distToSeg(px, py, lx, ly, q.x, q.y);
      if (d < best) best = d;
      lx = q.x;
      ly = q.y;
    }

    return best;
  }

  _buildPOIs() {
    this.camps = [];
    this.towns = [];
    this.waystones = [];
    this.docks = [];
    this.dungeons = [];
    this.shrines = [];
    this.caches = [];
    this.dragonLairs = [];
    this.secrets = [];

    const findLand = (x, y, r = 300) => this._findSafeLandPatchNear(x, y, r);
    const findMountainPass = (x, y, r = 540) => this._findMountainPassPatchNear(x, y, r) || findLand(x, y, r);
    const findShore = (x, y, r = 360) => this._findShorePatchNear(x, y, r);

    this.spawn = findLand(0, 0, 720) || { x: 0, y: 0 };

    const campSeeds = [
      [620, 120], [-720, 260], [240, 1180],
      [-1500, -760], [1620, -680], [-1680, 1320], [1780, 1400],
      [0, 2550], [-2850, 360], [2960, -360],
      [4300, 2200], [-4520, 2360], [4120, -3180], [-4380, -3320],
      [7200, 420], [-7400, -260], [820, 7040], [-980, -7220],
    ];
    const townSeeds = [
      [180, 620, "Stonewake"],
      [-1420, 1540, "Ashford"],
      [2260, -1500, "Rivergate"],
      [-3380, -860, "Ironmere"],
      [4860, 3360, "Dawnwatch"],
      [-5520, 4320, "Frostfen"],
      [6120, -5160, "Emberhold"],
      [-6420, -5660, "Nightmarket"],
    ];
    const waystoneSeeds = [
      [-1180, 40], [1260, -20], [0, -1450], [40, 1800],
      [-2380, 1980], [2440, -1980], [-3600, -220], [3660, 260],
      [5400, 5400], [-5600, 5200], [5600, -5520], [-5400, -5600],
      [8900, 0], [-9000, 120], [0, 9000], [160, -9100],
    ];
    const dungeonSeeds = [
      [-2500, -660], [2600, 600], [-860, 3200], [980, -3280], [0, 4300],
      [6200, 1600], [-6400, -1450], [1680, 6500], [-1550, -6600],
      [9300, 3100], [-9600, 2800], [2800, -9700],
    ];
    const dockSeeds = [
      [-3100, 960], [3180, -980], [-860, 2780], [1020, -2840],
      [-9800, 620], [9820, -720], [-620, 9840], [760, -9820],
      [-10800, -5200], [10600, 4980], [-5200, 10800], [5400, -10600],
      [-5400, 3600], [5580, -3440], [-3480, -5600], [3600, 5480],
    ];
    const shrineSeeds = [
      [940, 720], [-1180, 920], [1760, 40], [-1940, -1240],
      [760, -2100], [-2720, 1880], [2840, 1640],
      [4800, -620], [-5020, 980], [900, 4880], [-1240, -5120],
      [7600, 2500], [-7820, 2220], [2600, 7600], [-2440, -7820],
    ];
    const cacheSeeds = [
      [360, -760], [-420, 860], [1460, 980], [-1820, 120],
      [2160, -1180], [-2360, -2100], [3440, 820], [-3520, -620],
      [5200, 1320], [-5360, -1680], [1680, 5340], [-1540, -5480],
      [7200, -3920], [-7420, 3880], [3960, 7260], [-4100, -7340],
      [10300, 640], [-10400, -820], [620, 10400], [-760, -10500],
    ];
    const dragonSeeds = [
      [7600, -6400], [-8200, 5900], [6200, 8400], [-6900, -7600],
    ];
    const secretSeeds = [
      [1180, -1220, "The First Oath"],
      [-2120, 2140, "The Broken Bridge"],
      [3420, -2820, "River King"],
      [-4280, 3080, "Ash Road"],
      [5480, 860, "Moonwell"],
      [-6120, -3180, "Fallen Banner"],
      [2260, 6040, "Deep Door"],
      [-1880, -6320, "Star Cairn"],
      [8560, -1480, "Dragon Tax"],
      [-9060, 1640, "Old Cartographer"],
    ];

    let id = 1;

    const campTypes = [
      ["bandit", "Bandit Camp"],
      ["beast", "Beast Den"],
      ["cult", "Ash Cult"],
      ["wild", "Wildwood Camp"],
      ["stone", "Stone Guard"],
    ];

    for (const [x, y] of campSeeds) {
      const p = findLand(x, y, 420);
      if (p) {
        const picked = campTypes[Math.abs(hash2(x | 0, y | 0, this.seed)) % campTypes.length];
        this.camps.push({ id: id++, type: picked[0], name: picked[1], x: p.x, y: p.y });
      }
    }
    for (const [x, y, name] of townSeeds) {
      const p = findLand(x, y, 560);
      if (p) {
        this.towns.push({
          id: id++,
          name,
          x: p.x,
          y: p.y,
          npcs: ["Warden", "Smith", "Archivist"],
        });
      }
    }
    for (const [x, y] of waystoneSeeds) {
      const p = findLand(x, y, 360);
      if (p) this.waystones.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of dungeonSeeds) {
      const p = findMountainPass(x, y, 620);
      if (p) this.dungeons.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of dockSeeds) {
      const p = findShore(x, y, 520);
      if (p) this.docks.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of shrineSeeds) {
      const p = findLand(x, y, 460);
      if (p) this.shrines.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of cacheSeeds) {
      const p = findLand(x, y, 380);
      if (p) this.caches.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y] of dragonSeeds) {
      const p = findLand(x, y, 900);
      if (p) this.dragonLairs.push({ id: id++, x: p.x, y: p.y });
    }
    for (const [x, y, name] of secretSeeds) {
      const p = findLand(x, y, 620);
      if (p) this.secrets.push({ id: id++, name, x: p.x, y: p.y });
    }
  }

  _buildRoadNetwork() {
    this.roadNodes = [];
    this.roads = [];
    this._roadSeen = new Set();

    const add = (p, type) => {
      if (p) this.roadNodes.push({ x: p.x, y: p.y, type });
    };

    add(this.spawn, "spawn");

    for (const p of this.camps) add(p, "camp");
    for (const p of this.towns) add(p, "town");
    for (const p of this.waystones) add(p, "waystone");
    for (const p of this.docks) add(p, "dock");
    for (const p of this.dungeons) add(p, "dungeon");

    const spawnNode = this.roadNodes[0];

    const nearest = (from, types, count) => {
      return this.roadNodes
        .filter((n) => n !== from && types.includes(n.type))
        .map((n) => ({ n, d: Math.hypot(from.x - n.x, from.y - n.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((v) => v.n);
    };

    const visibleNodes = this.roadNodes.filter((n) => n.type === "spawn" || n.type === "camp" || n.type === "town" || n.type === "waystone");
    const linked = [spawnNode];
    const unlinked = visibleNodes.filter((n) => n !== spawnNode);

    const typeWeight = (node) => {
      if (node.type === "camp") return 0.86;
      if (node.type === "town") return 0.78;
      if (node.type === "waystone") return 0.96;
      return 1;
    };

    const roadWidth = (a, b) => {
      if (a.type === "spawn" || b.type === "spawn") return 22;
      if (a.type === "town" || b.type === "town") return 24;
      if (a.type === "waystone" || b.type === "waystone") return 17;
      return 19;
    };

    while (unlinked.length) {
      let best = null;
      for (const from of linked) {
        for (const to of unlinked) {
          const d = Math.hypot(from.x - to.x, from.y - to.y) * typeWeight(to);
          if (!best || d < best.d) best = { from, to, d };
        }
      }

      this._addRoadSegment(best.from, best.to, roadWidth(best.from, best.to));
      linked.push(best.to);
      unlinked.splice(unlinked.indexOf(best.to), 1);
    }

    for (const n of nearest(spawnNode, ["camp"], 2)) this._addRoadSegment(spawnNode, n, 20);
    for (const n of nearest(spawnNode, ["waystone"], 1)) this._addRoadSegment(spawnNode, n, 17);

    for (const n of this.roadNodes.filter((node) => node.type === "dock" || node.type === "dungeon")) {
      const target = nearest(n, ["town", "camp", "waystone"], 1)[0];
      if (target) this._addRoadSegment(n, target, 14, false);
    }

    this._mapDirty = true;
  }

  _addRoadSegment(a, b, width = 20, visible = true) {
    const keyA = `${a.x | 0},${a.y | 0}:${b.x | 0},${b.y | 0}`;
    const keyB = `${b.x | 0},${b.y | 0}:${a.x | 0},${a.y | 0}`;

    if (this._roadSeen.has(keyA) || this._roadSeen.has(keyB)) return;
    this._roadSeen.add(keyA);

    this._addRoad(a.x, a.y, b.x, b.y, width, visible);
  }

  _addRoad(ax, ay, bx, by, width = 20, visible = true) {
    const midX = (ax + bx) * 0.5;
    const midY = (ay + by) * 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;

    const bend = (fbm(midX * 0.0006, midY * 0.0006, hash2(ax | 0, ay | 0, this.seed), 2) - 0.5) * Math.min(90, len * 0.08);
    const cx = midX + nx * bend;
    const cy = midY + ny * bend;

    const points = [];
    const steps = Math.max(14, Math.ceil(len / 42));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push(quadPoint(ax, ay, cx, cy, bx, by, t));
    }

    this.roads.push({
      ax,
      ay,
      bx,
      by,
      cx,
      cy,
      width,
      visible,
      points,
    });
  }

  _roadAt(x, y) {
    if (!this.roads?.length) return false;
    for (const road of this.roads) {
      const pts = road.points;
      for (let i = 1; i < pts.length; i++) {
        const d = distToSeg(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        if (d <= ((road.width || 20) * 0.5 + this._roadWalkRadius)) return true;
      }
    }
    return false;
  }

  _finalizeBridges() {
    this.bridges = [];

    for (const road of this.roads) {
      const pts = road.points;
      let prevWater = false;
      let enter = null;
      let enterIndex = -1;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const s = this._sampleCellRaw(p.x, p.y);

        if (s.isWater && !prevWater) {
          enter = { x: p.x, y: p.y };
          enterIndex = i;
        }

        if (!s.isWater && prevWater && enter) {
          const exit = { x: p.x, y: p.y };
          const exitIndex = i;
          const dx = exit.x - enter.x;
          const dy = exit.y - enter.y;
          const vertical = Math.abs(dy) > Math.abs(dx);

          const roadWidth = Math.max(28, road.width || 20);
          const midX = (enter.x + exit.x) * 0.5;
          const midY = (enter.y + exit.y) * 0.5;
          const river = this._nearestRiverInfo(midX, midY);
          const span = clamp((river ? this._riverVisualWidth(river.band) : Math.hypot(dx, dy)) + roadWidth * 1.35, roadWidth + 28, 190);
          const cx = river?.x ?? midX;
          const cy = river?.y ?? midY;
          const angle = (river?.tangent ?? Math.atan2(dy, dx)) + Math.PI * 0.5;
          const pathStart = Math.max(0, enterIndex - 2);
          const pathEnd = Math.min(pts.length - 1, exitIndex + 2);
          const path = pts.slice(pathStart, pathEnd + 1).map((pt) => ({ x: pt.x, y: pt.y }));
          const centerPoint = path[Math.floor(path.length * 0.5)] || { x: cx, y: cy };
          const roadAngle = Math.atan2(
            (path[path.length - 1]?.y ?? exit.y) - (path[0]?.y ?? enter.y),
            (path[path.length - 1]?.x ?? exit.x) - (path[0]?.x ?? enter.x)
          );

          this.bridges.push({
            cx: centerPoint.x,
            cy: centerPoint.y,
            length: span,
            width: roadWidth + 10,
            angle: roadAngle,
            riverAngle: angle,
            roadAngle,
            path,
            vertical,
          });

          enter = null;
          enterIndex = -1;
        }

        prevWater = s.isWater;
      }
    }

    this._mapDirty = true;
  }

  _bridgeAt(x, y) {
    return !!this.getBridgeAt(x, y);
  }

  getBridgeAt(x, y) {
    for (const b of this.bridges) {
      const path = b.path || [];
      for (let i = 1; i < path.length; i++) {
        const d = distToSeg(x, y, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
        if (d <= Math.max(36, (b.width || 28) * 0.5 + 24)) return b;
      }

      const length = (b.length || b.w || 52) + 42;
      const width = (b.width || b.h || 28) + 30;
      const dx = x - (b.cx ?? (b.x + length * 0.5));
      const dy = y - (b.cy ?? (b.y + width * 0.5));
      const a = -(b.angle || 0);
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= length * 0.5 && Math.abs(ly) <= width * 0.5) {
        return b;
      }
    }
    return null;
  }

  _ensureSpawnSafety() {
    const exits = [
      { x: this.spawn.x + 280, y: this.spawn.y },
      { x: this.spawn.x - 280, y: this.spawn.y },
      { x: this.spawn.x, y: this.spawn.y + 280 },
      { x: this.spawn.x, y: this.spawn.y - 280 },
    ];

    for (const e of exits) {
      const p = this._findNearbyLand(e.x, e.y, 180);
      if (p) this._addRoad(this.spawn.x, this.spawn.y, p.x, p.y);
    }

    this._finalizeBridges();
  }

  _sampleCellRaw(x, y) {
    const cache = this._bootRawSampleCache;
    if (cache) {
      const qx = Math.round(x / 16);
      const qy = Math.round(y / 16);
      const key = `${qx}|${qy}`;
      const cached = cache.get(key);
      if (cached) return cached;

      const sample = this._sampleCellRawUncached(qx * 16, qy * 16);
      cache.set(key, sample);
      return sample;
    }

    return this._sampleCellRawUncached(x, y);
  }

  _sampleCellRawUncached(x, y) {
    const ground = this._groundAt(x, y);
    const river = this._riverAt(x, y);

    const sx = x - this.spawn.x;
    const sy = y - this.spawn.y;
    const spawnDist = Math.hypot(sx, sy);

    let isWater = ground < 0.245 || river < this._riverWaterLimit;
    if (spawnDist < this._spawnSafeRadius && river >= this._riverWaterLimit) isWater = false;
    const isMountain = this._mountainBaseAt(x, y, ground, isWater);

    return {
      ground,
      river,
      isWater,
      isMountain,
    };
  }

  _findNearbyLand(x, y, radius = 180) {
    return this._findSafeLandPatchNear(x, y, radius);
  }

  _findSafeLandPatchNear(x, y, radius = 220) {
    for (let r = 0; r <= radius; r += 18) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const s = this._sampleCellRaw(px, py);
        if (!s.isWater && !s.isMountain) return { x: px, y: py };
      }
    }
    return null;
  }

  _findMountainPassPatchNear(x, y, radius = 520) {
    for (let r = 0; r <= radius; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const here = this._sampleCellRaw(px, py);
        if (here.isWater || here.isMountain) continue;

        const west = this._sampleCellRaw(px - 140, py).isMountain;
        const east = this._sampleCellRaw(px + 140, py).isMountain;
        const north = this._sampleCellRaw(px, py - 140).isMountain;
        const south = this._sampleCellRaw(px, py + 140).isMountain;

        if ((west && east) || (north && south)) return { x: px, y: py };
      }
    }
    return null;
  }

  _findShorePatchNear(x, y, radius = 360) {
    for (let r = 0; r <= radius; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;

        const here = this._sampleCellRaw(px, py);
        if (here.isWater || here.isMountain) continue;

        const checks = [
          [22, 0], [-22, 0], [0, 22], [0, -22],
          [18, 18], [-18, 18], [18, -18], [-18, -18],
        ];

        for (const [ox, oy] of checks) {
          const near = this._sampleCellRaw(px + ox, py + oy);
          if (near.isWater) return { x: px, y: py };
        }
      }
    }
    return null;
  }

  _isNearDock(x, y, radius = 18) {
    const r2 = radius * radius;
    for (const d of this.docks) {
      const dx = x - d.x;
      const dy = y - d.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _queueMapBuild() {
    if (!this._mapDirty && this._mapInfo) return;
    if (this._mapBuildQueued) return;
    if (typeof window === "undefined" || typeof performance === "undefined") {
      this._buildMapInfo();
      return;
    }

    this._mapBuildQueued = true;
    const run = () => this._buildMapInfoChunk();
    window.requestAnimationFrame(run);
  }

  _buildMapPreview() {
    if (this._mapInfo && this._mapCanvas) return;
    const originalSize = this._mapSize;
    this._mapSize = this._mapPreviewSize || 96;
    this._buildMapInfo();
    this._mapSize = originalSize;
    this._mapDirty = true;
  }

  _buildMapInfoChunk() {
    const size = this._mapSize || 320;
    if (!this._mapBuildState) {
      const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (canvas) {
        canvas.width = size;
        canvas.height = size;
      }
      const ctx = canvas ? canvas.getContext("2d") : null;
      this._mapBuildState = {
        size,
        canvas,
        ctx,
        colors: [],
        tiles: [],
        revealed: [],
        row: 0,
      };
      this._mapCanvas = canvas;
      this._mapInfo = {
        size,
        colors: this._mapBuildState.colors,
        tiles: this._mapBuildState.tiles,
        revealed: this._mapBuildState.revealed,
      };
    }

    const state = this._mapBuildState;
    const budgetEnd = performance.now() + 14;

    while (state.row < state.size && performance.now() < budgetEnd) {
      const r = state.row++;
      const colorRow = [];
      const revRow = [];
      const tileRow = [];

      for (let c = 0; c < state.size; c++) {
        const wx = -this.mapHalfSize + (c + 0.5) * ((this.mapHalfSize * 2) / state.size);
        const wy = -this.mapHalfSize + (r + 0.5) * ((this.mapHalfSize * 2) / state.size);
        const s = this._sampleMapCell(wx, wy);

        colorRow.push(s.color);
        tileRow.push(s.color);
        revRow.push(false);

        if (state.ctx) {
          state.ctx.fillStyle = s.color;
          state.ctx.fillRect(c, r, 1, 1);
        }
      }

      state.colors.push(colorRow);
      state.tiles.push(tileRow);
      state.revealed.push(revRow);
    }

    this._mapCanvas = state.canvas;
    this._mapInfo = {
      size,
      colors: state.colors,
      tiles: state.tiles,
      revealed: state.revealed,
    };

    if (state.row < state.size) {
      this._mapBuildQueued = false;
      this._queueMapBuild();
      return;
    }

    const { canvas, ctx } = state;
    if (ctx) {
      const toMap = (p) => ({
        x: ((p.x + this.mapHalfSize) / (this.mapHalfSize * 2)) * size,
        y: ((p.y + this.mapHalfSize) / (this.mapHalfSize * 2)) * size,
      });

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const road of this.roads) {
        if (road.visible === false) continue;
        const pts = road.points;
        if (!pts || pts.length < 2) continue;
        const first = toMap(pts[0]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const p = toMap(pts[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(45,34,22,0.45)";
        ctx.lineWidth = 1.7;
        ctx.stroke();
        ctx.strokeStyle = "rgba(213,178,111,0.75)";
        ctx.lineWidth = 0.85;
        ctx.stroke();
      }

      ctx.restore();
    }

    this._mapCanvas = canvas;
    this._mapInfo = {
      size,
      colors: state.colors,
      tiles: state.tiles,
      revealed: state.revealed,
    };
    this._mapBuildState = null;
    this._discoveryExportCache = null;
    this._mapDirty = false;
    this._mapBuildQueued = false;
  }

  _buildMapInfo() {
    const size = this._mapSize || 320;
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    if (canvas) {
      canvas.width = size;
      canvas.height = size;
    }

    const ctx = canvas ? canvas.getContext("2d") : null;
    const colors = [];
    const revealed = [];
    const tiles = [];

    for (let r = 0; r < size; r++) {
      const colorRow = [];
      const revRow = [];
      const tileRow = [];

      for (let c = 0; c < size; c++) {
        const wx = -this.mapHalfSize + (c + 0.5) * ((this.mapHalfSize * 2) / size);
        const wy = -this.mapHalfSize + (r + 0.5) * ((this.mapHalfSize * 2) / size);
        const s = this._sampleMapCell(wx, wy);

        colorRow.push(s.color);
        tileRow.push(s.color);
        revRow.push(false);

        if (ctx) {
          ctx.fillStyle = s.color;
          ctx.fillRect(c, r, 1, 1);
        }
      }

      colors.push(colorRow);
      tiles.push(tileRow);
      revealed.push(revRow);
    }

    if (ctx) {
      const toMap = (p) => ({
        x: ((p.x + this.mapHalfSize) / (this.mapHalfSize * 2)) * size,
        y: ((p.y + this.mapHalfSize) / (this.mapHalfSize * 2)) * size,
      });

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const road of this.roads) {
        if (road.visible === false) continue;

        const pts = road.points;
        if (!pts || pts.length < 2) continue;

        const first = toMap(pts[0]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const p = toMap(pts[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(45,34,22,0.45)";
        ctx.lineWidth = 1.7;
        ctx.stroke();

        ctx.strokeStyle = "rgba(213,178,111,0.75)";
        ctx.lineWidth = 0.85;
        ctx.stroke();
      }

      ctx.restore();
    }

    this._mapCanvas = canvas;
    this._mapInfo = { size, colors, tiles, revealed };
    this._discoveryExportCache = null;
    this._mapDirty = false;
  }
}
