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
    this.buildId = "rpg-v107";
    this.seed = (seed | 0) || 12345;

    this.tileSize = opts.tileSize || 24;
    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.mapHalfSize = 12000;
    this.boundsHalfSize = 14500;

    this.spawn = { x: 0, y: 0 };
    this.mapMode = "small";

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];
    this.shrines = [];
    this.caches = [];
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
    this._revealed = null;

    this._spawnSafeRadius = 620;
    this._spawnRoadRadius = 900;
    this._roadWalkRadius = 26;

    this._riverBands = this._makeRiverBands();

    this._buildPOIs();
    this._buildRoadNetwork();
    this._finalizeBridges();
    this._ensureSpawnSafety();
    this._buildMapInfo();
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
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
    return this._mapInfo;
  }

  getMinimapCanvas() {
    if (this._mapDirty || !this._mapCanvas) this._buildMapInfo();
    return this._mapCanvas;
  }

  revealAround(x, y, radius = 620) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();

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

    return changed;
  }

  revealAll() {
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
    for (const row of this._mapInfo.revealed || []) row.fill(true);
  }

  exportDiscovery() {
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
    const out = [];
    const revealed = this._mapInfo.revealed || [];
    for (let r = 0; r < revealed.length; r++) {
      for (let c = 0; c < (revealed[r]?.length || 0); c++) {
        if (revealed[r][c]) out.push(`${r},${c}`);
      }
    }
    return out;
  }

  importDiscovery(cells) {
    if (!Array.isArray(cells)) return;
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
    const revealed = this._mapInfo.revealed || [];
    for (const cell of cells) {
      const [rs, cs] = String(cell).split(",");
      const r = Number(rs) | 0;
      const c = Number(cs) | 0;
      if (revealed[r]?.[c] != null) revealed[r][c] = true;
    }
  }

  canWalk(x, y, actor = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;

    const s = this._sampleCell(x, y);

    if (s.bridge) return true;

    if (actor?.state?.sailing) {
      return s.isWater || this._isNearDock(x, y, 22);
    }

    return s.road || !s.isWater;
  }

  getMoveModifier(x, y) {
    const s = this._sampleCell(x, y);

    if (s.bridge) return 1.12;
    if (s.road) return 1.18;
    if (s.isWater) return 0.92;
    if (s.zone === "mountain") return 0.93;
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
    const size = 40;

    const left = camera.x - this.viewW * 0.5 - 120;
    const top = camera.y - this.viewH * 0.5 - 120;
    const right = camera.x + this.viewW * 0.5 + 120;
    const bottom = camera.y + this.viewH * 0.5 + 120;

    const startX = Math.floor(left / size) * size;
    const startY = Math.floor(top / size) * size;

    for (let x = startX; x < right; x += size) {
      for (let y = startY; y < bottom; y += size) {
        const s = this._sampleCell(x, y);

        ctx.fillStyle = s.color;
        ctx.fillRect(x, y, size + 1, size + 1);

        if (s.bridge) {
          ctx.fillStyle = "#8a6a42";
          ctx.fillRect(x, y + 10, size, size - 20);

          ctx.fillStyle = "rgba(238,218,185,0.22)";
          for (let i = 4; i < size; i += 8) {
            ctx.fillRect(x + i, y + 10, 2, size - 20);
          }
        } else if (!s.isWater) {
          const cellX = (x / size) | 0;
          const cellY = (y / size) | 0;
          const parity = (cellX + cellY) % 11;

          if (s.zone === "forest") {
            if (parity === 0 || parity === 4) {
              ctx.fillStyle = "rgba(20,55,18,0.22)";
              ctx.fillRect(x + 11, y + 8, 7, 11);
            }
          } else if (s.zone === "meadow" || s.zone === "whisper grass") {
            if (parity === 1 || parity === 7) {
              ctx.fillStyle = "rgba(255,255,255,0.04)";
              ctx.fillRect(x + 7, y + 8, 7, 11);
            } else if (parity === 3) {
              ctx.fillStyle = "rgba(48,93,31,0.14)";
              ctx.fillRect(x + 12, y + 11, 5, 8);
            }
          } else if (s.zone === "ashlands" || s.zone === "ash fields") {
            if (parity === 2 || parity === 8) {
              ctx.fillStyle = "rgba(90,70,52,0.24)";
              ctx.fillRect(x + 10, y + 11, 6, 6);
            }
          } else if (s.zone === "mountain" || s.zone === "stone flats") {
            if (parity === 5 || parity === 9) {
              ctx.fillStyle = "rgba(255,255,255,0.05)";
              ctx.fillRect(x + 8, y + 8, 8, 8);
            }
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(x + 4, y + 10, size - 8, 2);
        }
      }
    }

    this._drawRoads(ctx);
    this._drawPOIs(ctx);
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
    }

    ctx.restore();
  }

  _drawPOIs(ctx) {
    for (const c of this.camps) {
      ctx.fillStyle = "rgba(255,190,70,0.18)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4e3724";
      ctx.fillRect(c.x - 10, c.y + 3, 20, 8);
      ctx.fillStyle = "#ffcf58";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff0a6";
      ctx.beginPath();
      ctx.arc(c.x - 2, c.y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const w of this.waystones) {
      ctx.fillStyle = "rgba(96,210,255,0.18)";
      ctx.beginPath();
      ctx.arc(w.x, w.y, 18, 0, Math.PI * 2);
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
    }

    for (const d of this.dungeons) {
      ctx.fillStyle = "rgba(160,80,210,0.22)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 20, 0, Math.PI * 2);
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
    }

    for (const d of this.docks) {
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
    }

    for (const s of this.shrines) {
      ctx.fillStyle = "rgba(183,126,255,0.25)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b77eff";
      ctx.fillRect(s.x - 4, s.y - 10, 8, 20);
      ctx.fillStyle = "#f0dcff";
      ctx.fillRect(s.x - 2, s.y - 14, 4, 5);
    }

    for (const c of this.caches) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(c.x - 8, c.y - 4, 16, 10);
      ctx.fillStyle = "#c49a4d";
      ctx.fillRect(c.x - 7, c.y - 7, 14, 10);
      ctx.fillStyle = "#ffe19a";
      ctx.fillRect(c.x - 2, c.y - 7, 4, 10);
    }

    for (const lair of this.dragonLairs) {
      ctx.fillStyle = "rgba(130,18,28,0.24)";
      ctx.beginPath();
      ctx.arc(lair.x, lair.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8f1f2d";
      ctx.beginPath();
      ctx.moveTo(lair.x, lair.y - 18);
      ctx.lineTo(lair.x + 18, lair.y + 14);
      ctx.lineTo(lair.x - 18, lair.y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb06e";
      ctx.fillRect(lair.x - 3, lair.y - 3, 6, 12);
    }
  }

  _sampleCell(x, y) {
    const ground = this._groundAt(x, y);
    const river = this._riverAt(x, y);
    const road = this._roadAt(x, y);
    const bridge = this._bridgeAt(x, y);

    const sx = x - this.spawn.x;
    const sy = y - this.spawn.y;
    const spawnDist = Math.hypot(sx, sy);

    let isWater = false;
    if (!bridge && !road) {
      isWater = ground < 0.255 || river < 0.034;
    }

    // absolute spawn safety basin
    if (spawnDist < this._spawnSafeRadius) {
      isWater = false;
    }

    const moisture = this._moistureAt(x, y);

    const danger = this.getDangerLevel(x, y);
    let zone = "meadow";
    let color = "#6aa04f";

    if (isWater) {
      zone = "river";
      color = river < 0.034 ? "#2f7fb8" : "#2c6a9a";
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
    } else {
      zone = "meadow";
      color = "#6aa04f";
    }

    // soften spawn meadow visually too
    if (spawnDist < this._spawnSafeRadius) {
      zone = "meadow";
      color = spawnDist < this._spawnSafeRadius * 0.68 ? "#76b45c" : "#6eaa57";
    }

    if (road && !isWater && !bridge) {
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
      road,
      bridge,
      zone,
      color,
    };
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
    return [
      {
        ax: -this.mapHalfSize,
        ay: this._rng.range(-2800, -1200),
        bx: this.mapHalfSize,
        by: this._rng.range(1200, 2800),
        width: this._rng.range(0.9, 1.25),
        seed: hash2(this.seed, 101),
      },
      {
        ax: -this._rng.range(1400, 2600),
        ay: -this.mapHalfSize,
        bx: this._rng.range(1400, 2600),
        by: this.mapHalfSize,
        width: this._rng.range(0.9, 1.2),
        seed: hash2(this.seed, 202),
      },
    ];
  }

  _riverAt(x, y) {
    let best = 999;

    for (const band of this._riverBands) {
      const mx = (band.ax + band.bx) * 0.5;
      const my = (band.ay + band.by) * 0.5;
      const dx = band.bx - band.ax;
      const dy = band.by - band.ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const bend = (fbm(mx * 0.0005, my * 0.0005, band.seed, 3) - 0.5) * 1200;
      const cx = mx + nx * bend;
      const cy = my + ny * bend;

      const dist = this._distancePointToQuadraticBezier(
        x, y,
        band.ax, band.ay,
        cx, cy,
        band.bx, band.by
      );

      const jitter =
        (fbm(x * 0.0012, y * 0.0012, band.seed + 17, 3) - 0.5) * 18 +
        (fbm(x * 0.0022, y * 0.0022, band.seed + 29, 2) - 0.5) * 10;

      const widthPx = 46 * band.width + jitter;
      const v = dist / Math.max(12, widthPx);
      if (v < best) best = v;
    }

    return best;
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
    this.waystones = [];
    this.docks = [];
    this.dungeons = [];
    this.shrines = [];
    this.caches = [];
    this.dragonLairs = [];

    const findLand = (x, y, r = 300) => this._findSafeLandPatchNear(x, y, r);
    const findShore = (x, y, r = 360) => this._findShorePatchNear(x, y, r);

    this.spawn = findLand(0, 0, 720) || { x: 0, y: 0 };

    const campSeeds = [
      [620, 120], [-720, 260], [240, 1180],
      [-1500, -760], [1620, -680], [-1680, 1320], [1780, 1400],
      [0, 2550], [-2850, 360], [2960, -360],
      [4300, 2200], [-4520, 2360], [4120, -3180], [-4380, -3320],
      [7200, 420], [-7400, -260], [820, 7040], [-980, -7220],
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

    const visibleNodes = this.roadNodes.filter((n) => n.type === "spawn" || n.type === "camp" || n.type === "waystone");
    const linked = [spawnNode];
    const unlinked = visibleNodes.filter((n) => n !== spawnNode);

    const typeWeight = (node) => {
      if (node.type === "camp") return 0.86;
      if (node.type === "waystone") return 0.96;
      return 1;
    };

    const roadWidth = (a, b) => {
      if (a.type === "spawn" || b.type === "spawn") return 22;
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
      const target = nearest(n, ["camp", "waystone"], 1)[0];
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
    const steps = Math.max(10, Math.ceil(len / 70));
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

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const s = this._sampleCellRaw(p.x, p.y);

        if (s.isWater && !prevWater) enter = { x: p.x, y: p.y };

        if (!s.isWater && prevWater && enter) {
          const exit = { x: p.x, y: p.y };
          const dx = exit.x - enter.x;
          const dy = exit.y - enter.y;
          const vertical = Math.abs(dy) > Math.abs(dx);

          const roadWidth = Math.max(28, road.width || 20);
          const w = vertical ? roadWidth : Math.max(roadWidth + 10, Math.abs(dx) + roadWidth);
          const h = vertical ? Math.max(roadWidth + 10, Math.abs(dy) + roadWidth) : roadWidth;

          this.bridges.push({
            x: (vertical ? enter.x - roadWidth * 0.5 : Math.min(enter.x, exit.x) - roadWidth * 0.5) | 0,
            y: (vertical ? Math.min(enter.y, exit.y) - roadWidth * 0.5 : enter.y - roadWidth * 0.5) | 0,
            w: w | 0,
            h: h | 0,
            vertical,
          });

          enter = null;
        }

        prevWater = s.isWater;
      }
    }

    this._mapDirty = true;
  }

  _bridgeAt(x, y) {
    for (const b of this.bridges) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return true;
      }
    }
    return false;
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
    const ground = this._groundAt(x, y);
    const river = this._riverAt(x, y);

    const sx = x - this.spawn.x;
    const sy = y - this.spawn.y;
    const spawnDist = Math.hypot(sx, sy);

    let isWater = ground < 0.255 || river < 0.034;
    if (spawnDist < this._spawnSafeRadius) isWater = false;

    return {
      ground,
      river,
      isWater,
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
        if (!s.isWater) return { x: px, y: py };
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
        if (here.isWater) continue;

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
        const s = this._sampleCell(wx, wy);

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
    this._mapDirty = false;
  }
}
