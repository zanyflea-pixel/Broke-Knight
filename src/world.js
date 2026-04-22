// src/world.js
// v106.7 WORLD HARD SPAWN FIX + REAL TRAIL ROADS
// - guaranteed dry spawn meadow
// - fewer, cleaner roads rendered as trail ribbons
// - roads still give movement speed bonus
// - keeps camps / docks / waystones / dungeons / bridges
// - greener terrain + curvier rivers
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
    this.seed = (seed | 0) || 12345;

    this.tileSize = opts.tileSize || 24;
    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.mapHalfSize = 5200;
    this.boundsHalfSize = 7000;

    this.spawn = { x: 0, y: 0 };
    this.mapMode = "small";

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];
    this.bridges = [];
    this.roads = [];
    this.roadNodes = [];

    this._rng = new RNG(this.seed ^ 0x51f15eed);

    this._mapCanvas = null;
    this._mapInfo = null;
    this._mapDirty = true;

    this._spawnSafeRadius = 340;
    this._spawnRoadRadius = 620;

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

  canWalk(x, y, actor = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;

    const s = this._sampleCell(x, y);

    if (s.bridge) return true;

    if (actor?.state?.sailing) {
      return s.isWater || this._isNearDock(x, y, 22);
    }

    return !s.isWater;
  }

  getMoveModifier(x, y) {
    const s = this._sampleCell(x, y);

    if (s.bridge) return 1.08;
    if (s.road) return 1.12;
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
    };
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
    if (!this.roads?.length) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const road of this.roads) {
      const pts = road.points;
      if (!pts || pts.length < 2) continue;

      // outer worn dirt edge
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = "rgba(82,66,44,0.24)";
      ctx.lineWidth = 10;
      ctx.stroke();

      // mid trail
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = "rgba(126,108,78,0.34)";
      ctx.lineWidth = 6;
      ctx.stroke();

      // center wear line
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = "rgba(196,174,132,0.12)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawPOIs(ctx) {
    for (const c of this.camps) {
      ctx.fillStyle = "#ffdc63";
      ctx.fillRect(c.x - 6, c.y - 6, 12, 12);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
    }

    for (const w of this.waystones) {
      ctx.fillStyle = "#7fe8ff";
      ctx.fillRect(w.x - 6, w.y - 6, 12, 12);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(w.x - 3, w.y - 3, 6, 6);
    }

    for (const d of this.dungeons) {
      ctx.fillStyle = "#dc7cff";
      ctx.fillRect(d.x - 6, d.y - 6, 12, 12);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(d.x - 3, d.y - 3, 6, 6);
    }

    for (const d of this.docks) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(d.x - 5, d.y - 5, 10, 10);
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
    if (!bridge) {
      isWater = ground < 0.255 || river < 0.034;
    }

    // absolute spawn safety basin
    if (spawnDist < this._spawnSafeRadius) {
      isWater = false;
    }

    const moisture = this._moistureAt(x, y);

    let zone = "meadow";
    let color = "#6aa04f";

    if (isWater) {
      zone = "river";
      color = river < 0.034 ? "#2f7fb8" : "#2c6a9a";
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
    return base * 0.82 + detail * 0.18;
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
    this.roadNodes = [];
    this.roads = [];
    this._roadSeen = new Set();

    const add = (p, type) => {
      if (p) this.roadNodes.push({ x: p.x, y: p.y, type });
    };

    add(this.spawn, "spawn");

    // keep only the most meaningful surface-road destinations
    for (const p of this.camps) add(p, "camp");
    for (const p of this.waystones) add(p, "waystone");
    for (const p of this.docks) add(p, "dock");

    // dungeons intentionally off-road so they feel discovered instead of paved-to

    const spawnNode = this.roadNodes[0];

    const nearest = (from, types, count) => {
      return this.roadNodes
        .filter((n) => n !== from && types.includes(n.type))
        .map((n) => ({ n, d: Math.hypot(from.x - n.x, from.y - n.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((v) => v.n);
    };

    // spawn to 2 camps + 1 waystone only
    for (const n of nearest(spawnNode, ["camp"], 2)) this._addRoadSegment(spawnNode, n);
    for (const n of nearest(spawnNode, ["waystone"], 1)) this._addRoadSegment(spawnNode, n);

    // each camp connects lightly
    for (const camp of this.roadNodes.filter((n) => n.type === "camp")) {
      for (const n of nearest(camp, ["camp", "waystone", "dock"], 1)) {
        this._addRoadSegment(camp, n);
      }
    }

    // each dock gets one connection
    for (const dock of this.roadNodes.filter((n) => n.type === "dock")) {
      for (const n of nearest(dock, ["camp"], 1)) {
        this._addRoadSegment(dock, n);
      }
    }

    this._mapDirty = true;
  }

  _addRoadSegment(a, b) {
    const keyA = `${a.x | 0},${a.y | 0}:${b.x | 0},${b.y | 0}`;
    const keyB = `${b.x | 0},${b.y | 0}:${a.x | 0},${a.y | 0}`;

    if (this._roadSeen.has(keyA) || this._roadSeen.has(keyB)) return;
    this._roadSeen.add(keyA);

    this._addRoad(a.x, a.y, b.x, b.y);
  }

  _addRoad(ax, ay, bx, by) {
    const midX = (ax + bx) * 0.5;
    const midY = (ay + by) * 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;

    const bend = (fbm(midX * 0.0006, midY * 0.0006, hash2(ax | 0, ay | 0, this.seed), 2) - 0.5) * Math.min(180, len * 0.14);
    const cx = midX + nx * bend;
    const cy = midY + ny * bend;

    const points = [];
    const steps = Math.max(10, Math.ceil(len / 90));
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
      points,
    });
  }

  _roadAt(x, y) {
    if (!this.roads?.length) return false;
    for (const road of this.roads) {
      const pts = road.points;
      for (let i = 1; i < pts.length; i++) {
        const d = distToSeg(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        if (d <= 5) return true;
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

          const w = vertical ? 18 : Math.max(24, Math.abs(dx) + 10);
          const h = vertical ? Math.max(24, Math.abs(dy) + 10) : 18;

          this.bridges.push({
            x: (vertical ? enter.x - 9 : Math.min(enter.x, exit.x) - 5) | 0,
            y: (vertical ? Math.min(enter.y, exit.y) - 5 : enter.y - 9) | 0,
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
    const size = 256;
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
        revRow.push(true);

        if (ctx) {
          ctx.fillStyle = s.color;
          ctx.fillRect(c, r, 1, 1);
        }
      }

      colors.push(colorRow);
      tiles.push(tileRow);
      revealed.push(revRow);
    }

    this._mapCanvas = canvas;
    this._mapInfo = { size, colors, tiles, revealed };
    this._mapDirty = false;
  }
}