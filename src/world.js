// src/world.js
// v102.2 FULL WORLD RESTORE
// - greener overworld
// - curvier rivers
// - roads / bridges / POIs
// - docks / camps / waystones / dungeons
// - minimap + world map support
// - built to match current game.js / ui.js / util.js

import { clamp, hash2, fbm, RNG } from "./util.js";

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

    this._mapCanvas = null;
    this._mapCtx = null;
    this._mapInfo = null;
    this._mapDirty = true;

    this._rng = new RNG(this.seed ^ 0x51f15eed);

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

  getZoneInfo(x, y) {
    const s = this._sampleCell(x, y);
    return {
      name: s.zone,
      color: s.color,
      biome: s.zone,
      nearWater: s.isWater,
    };
  }

  getZoneName(x, y) {
    return this.getZoneInfo(x, y)?.name || "meadow";
  }

  getMoveModifier(x, y) {
    const s = this._sampleCell(x, y);
    if (s.isWater) return 0.94;
    if (s.zone === "stone flats") return 0.95;
    if (s.zone === "deep wilds") return 0.92;
    return 1;
  }

  canWalk(x, y, actor = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x) > this.boundsHalfSize || Math.abs(y) > this.boundsHalfSize) return false;

    const s = this._sampleCell(x, y);

    if (!s.walkable) {
      if (actor?.state?.sailing && s.isWater) return true;
      return false;
    }

    if (actor?.state?.sailing && !s.isWater && !s.isBridge && !s.isDock) {
      return false;
    }

    return true;
  }

  draw(ctx, camera, hero) {
    if (!ctx) return;

    const hw = this.viewW * 0.5;
    const hh = this.viewH * 0.5;
    const left = camera.x - hw - 80;
    const top = camera.y - hh - 80;
    const right = camera.x + hw + 80;
    const bottom = camera.y + hh + 80;

    this._drawSky(ctx, left, top, right, bottom);
    this._drawGroundTiles(ctx, left, top, right, bottom);
    this._drawRoads(ctx, left, top, right, bottom);
    this._drawBridges(ctx, left, top, right, bottom);
    this._drawPOIs(ctx, left, top, right, bottom);
    this._drawHeroWake(ctx, hero);
  }

  _drawSky(ctx, left, top, right, bottom) {
    const h = bottom - top;
    const g = ctx.createLinearGradient(0, top, 0, top + h * 0.45);
    g.addColorStop(0, "#16304c");
    g.addColorStop(0.55, "#22496a");
    g.addColorStop(1, "#6da0c0");

    ctx.fillStyle = g;
    ctx.fillRect(left, top, right - left, h);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 5; i++) {
      const cx = left + ((i * 811 + 230) % Math.max(1, (right - left)));
      const cy = top + 80 + (i % 3) * 36;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 120, 28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawGroundTiles(ctx, left, top, right, bottom) {
    const ts = this.tileSize;
    const c0 = Math.floor(left / ts) - 1;
    const r0 = Math.floor(top / ts) - 1;
    const c1 = Math.floor(right / ts) + 1;
    const r1 = Math.floor(bottom / ts) + 1;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * ts;
        const y = r * ts;

        const s = this._sampleCell(x + ts * 0.5, y + ts * 0.5);
        ctx.fillStyle = s.color;
        ctx.fillRect(x, y, ts + 1, ts + 1);

        if (s.isWater) this._drawWaterDetail(ctx, x, y, ts, s);
        else this._drawGroundDetail(ctx, x, y, ts, s);
      }
    }
  }

  _drawWaterDetail(ctx, x, y, ts, s) {
    const wave = 0.5 + 0.5 * Math.sin((x + y) * 0.014 + this.seed * 0.01);
    ctx.fillStyle = `rgba(255,255,255,${0.02 + wave * 0.025})`;
    ctx.fillRect(x + 2, y + ts * 0.28, ts - 4, 2);

    if (s.isBridge) return;

    ctx.fillStyle = "rgba(12,50,82,0.05)";
    ctx.fillRect(x, y + ts * 0.60, ts, 2);
  }

  _drawGroundDetail(ctx, x, y, ts, s) {
    const h = hash2((x / ts) | 0, (y / ts) | 0, this.seed);

    if (s.zone === "stone flats") {
      if ((h & 7) === 0) this._drawPebble(ctx, x, y, ts, h);
      return;
    }

    if ((h & 15) === 0) this._drawTuft(ctx, x, y, ts, h);
    if ((h & 95) === 9) this._drawPebble(ctx, x, y, ts, h);

    if ((s.zone === "deep wilds" || s.zone === "meadow") && (h & 127) === 21) {
      this._drawTree(ctx, x + ts * 0.5, y + ts * 0.58, 0.86 + ((h >>> 9) & 3) * 0.12);
    }
  }

  _drawTuft(ctx, x, y, ts, h) {
    const px = x + 4 + (h & 7);
    const py = y + ts - 4;
    ctx.strokeStyle = "#5e8f4e";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 2, py - 7);
    ctx.moveTo(px, py);
    ctx.lineTo(px + 1, py - 8);
    ctx.moveTo(px, py);
    ctx.lineTo(px + 3, py - 6);
    ctx.stroke();
  }

  _drawPebble(ctx, x, y, ts, h) {
    const px = x + 4 + (h & 11);
    const py = y + 5 + ((h >>> 4) & 11);
    ctx.fillStyle = "rgba(70,74,78,0.34)";
    ctx.beginPath();
    ctx.ellipse(px, py, 2 + ((h >>> 8) & 1), 1.5 + ((h >>> 9) & 1), 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawTree(ctx, x, y, s = 1) {
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(x, y + 12 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#5d3f27";
    ctx.fillRect(x - 2 * s, y - 4 * s, 4 * s, 16 * s);

    ctx.fillStyle = "#2f6e38";
    ctx.beginPath();
    ctx.arc(x, y - 3 * s, 11 * s, 0, Math.PI * 2);
    ctx.arc(x - 8 * s, y + 1 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(x + 8 * s, y + 1 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(x - 3 * s, y - 7 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawRoads(ctx, left, top, right, bottom) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const seg of this.roads) {
      const minX = Math.min(seg.ax, seg.bx) - 32;
      const maxX = Math.max(seg.ax, seg.bx) + 32;
      const minY = Math.min(seg.ay, seg.by) - 32;
      const maxY = Math.max(seg.ay, seg.by) + 32;
      if (maxX < left || minX > right || maxY < top || minY > bottom) continue;

      ctx.strokeStyle = "#8f7a59";
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(seg.ax, seg.ay);
      ctx.lineTo(seg.bx, seg.by);
      ctx.stroke();

      ctx.strokeStyle = "rgba(235,222,190,0.22)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(seg.ax, seg.ay);
      ctx.lineTo(seg.bx, seg.by);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawBridges(ctx, left, top, right, bottom) {
    for (const b of this.bridges) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;

      ctx.fillStyle = "#7b5a3a";
      ctx.fillRect(b.x, b.y, b.w, b.h);

      ctx.fillStyle = "#5f4329";
      if (b.vertical) {
        for (let yy = b.y + 2; yy < b.y + b.h; yy += 8) ctx.fillRect(b.x, yy, b.w, 2);
      } else {
        for (let xx = b.x + 2; xx < b.x + b.w; xx += 8) ctx.fillRect(xx, b.y, 2, b.h);
      }

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      if (b.vertical) {
        ctx.fillRect(b.x + 2, b.y, 2, b.h);
        ctx.fillRect(b.x + b.w - 4, b.y, 2, b.h);
      } else {
        ctx.fillRect(b.x, b.y + 2, b.w, 2);
        ctx.fillRect(b.x, b.y + b.h - 4, b.w, 2);
      }
    }
  }

  _drawPOIs(ctx, left, top, right, bottom) {
    for (const c of this.camps) {
      if (c.x < left - 80 || c.x > right + 80 || c.y < top - 80 || c.y > bottom + 80) continue;
      this._drawCamp(ctx, c.x, c.y);
    }

    for (const w of this.waystones) {
      if (w.x < left - 60 || w.x > right + 60 || w.y < top - 60 || w.y > bottom + 60) continue;
      this._drawWaystone(ctx, w.x, w.y);
    }

    for (const d of this.docks) {
      if (d.x < left - 70 || d.x > right + 70 || d.y < top - 70 || d.y > bottom + 70) continue;
      this._drawDock(ctx, d.x, d.y, d.dir || 1);
    }

    for (const dg of this.dungeons) {
      if (dg.x < left - 80 || dg.x > right + 80 || dg.y < top - 80 || dg.y > bottom + 80) continue;
      this._drawDungeon(ctx, dg.x, dg.y);
    }
  }

  _drawCamp(ctx, x, y) {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y + 22, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7a5735";
    ctx.fillRect(x - 18, y + 4, 36, 8);

    ctx.fillStyle = "#d2b58a";
    ctx.beginPath();
    ctx.moveTo(x - 20, y + 4);
    ctx.lineTo(x, y - 16);
    ctx.lineTo(x + 20, y + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,200,90,0.16)";
    ctx.beginPath();
    ctx.arc(x, y + 10, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffbc54";
    ctx.beginPath();
    ctx.arc(x, y + 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawWaystone(ctx, x, y) {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y + 20, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7788a0";
    ctx.fillRect(x - 7, y - 12, 14, 30);

    ctx.fillStyle = "#aebcd0";
    ctx.fillRect(x - 4, y - 16, 8, 6);

    ctx.fillStyle = "rgba(140,200,255,0.22)";
    ctx.beginPath();
    ctx.arc(x, y - 6, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawDock(ctx, x, y, dir = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (dir < 0) ctx.scale(-1, 1);

    ctx.fillStyle = "#7b5a3a";
    ctx.fillRect(-6, -6, 38, 12);

    ctx.fillStyle = "#5f4329";
    for (let i = 0; i < 4; i++) ctx.fillRect(i * 8 - 4, -6, 2, 12);

    ctx.fillStyle = "#9d7a4d";
    ctx.fillRect(26, -12, 8, 24);

    ctx.restore();
  }

  _drawDungeon(ctx, x, y) {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#5b6068";
    ctx.fillRect(x - 16, y - 12, 32, 28);

    ctx.fillStyle = "#818a94";
    ctx.fillRect(x - 12, y - 16, 24, 6);

    ctx.fillStyle = "#1f2227";
    ctx.beginPath();
    ctx.arc(x, y + 4, 7, Math.PI, 0);
    ctx.fill();
  }

  _drawHeroWake(ctx, hero) {
    if (!hero?.state?.sailing) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hero.x - hero.lastMove.x * 8 - hero.lastMove.y * 5, hero.y - hero.lastMove.y * 8 + hero.lastMove.x * 5);
    ctx.lineTo(hero.x - hero.lastMove.x * 20 - hero.lastMove.y * 8, hero.y - hero.lastMove.y * 20 + hero.lastMove.x * 8);
    ctx.moveTo(hero.x - hero.lastMove.x * 8 + hero.lastMove.y * 5, hero.y - hero.lastMove.y * 8 - hero.lastMove.x * 5);
    ctx.lineTo(hero.x - hero.lastMove.x * 20 + hero.lastMove.y * 8, hero.y - hero.lastMove.y * 20 - hero.lastMove.x * 8);
    ctx.stroke();
    ctx.restore();
  }

  _makeRiverBands() {
    const out = [];
    const rng = new RNG(this.seed ^ 0x314159);

    for (let i = 0; i < 3; i++) {
      const vertical = i !== 1;
      out.push({
        vertical,
        base: (rng.range(-1, 1) * this.mapHalfSize * 0.52) | 0,
        ampA: rng.range(220, 420),
        ampB: rng.range(110, 230),
        ampC: rng.range(40, 90),
        freqA: rng.range(0.00022, 0.00038),
        freqB: rng.range(0.00055, 0.00095),
        freqC: rng.range(0.0014, 0.0021),
        width: rng.range(78, 116),
        seed: rng.int(1, 999999),
      });
    }

    return out;
  }

  _riverCenterForBand(band, x, y) {
    const n = band.vertical ? y : x;
    return (
      band.base +
      Math.sin(n * band.freqA + band.seed * 0.011) * band.ampA +
      Math.sin(n * band.freqB - band.seed * 0.017) * band.ampB +
      Math.sin(n * band.freqC + band.seed * 0.023) * band.ampC
    );
  }

  _roadField(x, y) {
    let best = 999999;
    for (const seg of this.roads) {
      const d = this._distancePointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by);
      if (d < best) best = d;
    }
    return best;
  }

  _distancePointToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;

    const len2 = vx * vx + vy * vy;
    if (len2 <= 0.0001) return Math.hypot(px - ax, py - ay);

    let t = (wx * vx + wy * vy) / len2;
    t = clamp(t, 0, 1);

    const sx = ax + vx * t;
    const sy = ay + vy * t;
    return Math.hypot(px - sx, py - sy);
  }

  _sampleCell(x, y) {
    const nA = fbm(x * 0.00055, y * 0.00055, this.seed + 11, 4);
    const nB = fbm(x * 0.00115, y * 0.00115, this.seed - 73, 3);
    const nC = fbm(x * 0.0022, y * 0.0022, this.seed + 401, 2);

    let isWater = false;
    let isBridge = false;
    let isDock = false;
    let waterDepth = 9999;

    for (const band of this._riverBands) {
      const center = this._riverCenterForBand(band, x, y);
      const d = band.vertical ? Math.abs(x - center) : Math.abs(y - center);
      if (d < waterDepth) waterDepth = d;
      if (d < band.width) isWater = true;
    }

    for (const b of this.bridges) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        isBridge = true;
        isWater = false;
        break;
      }
    }

    for (const d of this.docks) {
      if (Math.abs(x - d.x) < 26 && Math.abs(y - d.y) < 22) {
        isDock = true;
        break;
      }
    }

    const roadDist = this._roadField(x, y);
    const nearRoad = roadDist < 12;

    const spawnSafe = Math.hypot(x - this.spawn.x, y - this.spawn.y) < 240;
    if (spawnSafe) isWater = false;

    let zone = "meadow";
    let color = "#6fa75b";
    const walkable = !isWater || isBridge || isDock;

    if (isWater) {
      zone = "river";
      const edge = clamp(waterDepth / 120, 0, 1);
      color = edge < 0.4 ? "#2d78ac" : "#3f93bf";
      return { zone, color, walkable, isWater, isBridge, isDock };
    }

    const stoneiness = nA * 0.7 + nB * 0.3;
    const wild = nB * 0.65 + nC * 0.35;

    if (spawnSafe) {
      zone = "spawn meadow";
      color = nearRoad ? "#8e7c60" : "#74b45f";
    } else if (stoneiness > 0.80) {
      zone = "stone flats";
      color = nC > 0.55 ? "#7d817f" : "#8b8f8b";
    } else if (wild > 0.68) {
      zone = "deep wilds";
      color = nC > 0.45 ? "#44733a" : "#527f42";
    } else if (nA < 0.28) {
      zone = "shore";
      color = "#89b260";
    } else if (nB > 0.64 && nA > 0.55) {
      zone = "ashlands";
      color = "#7d786a";
    } else {
      zone = "meadow";
      color = nC > 0.52 ? "#6ea85a" : "#7ab660";
    }

    if (nearRoad) color = "#8f7a59";

    return { zone, color, walkable, isWater, isBridge, isDock };
  }

  _buildPOIs() {
    this.spawn = this._findSafeSpawn();

    const ringPoints = [
      { type: "camp", count: 4, radius: 900 },
      { type: "waystone", count: 4, radius: 1600 },
      { type: "dungeon", count: 4, radius: 2350 },
      { type: "camp", count: 4, radius: 3100 },
      { type: "waystone", count: 4, radius: 3900 },
    ];

    for (const group of ringPoints) {
      for (let i = 0; i < group.count; i++) {
        const a = (Math.PI * 2 * i) / group.count + group.radius * 0.0002;
        const baseX = this.spawn.x + Math.cos(a) * group.radius;
        const baseY = this.spawn.y + Math.sin(a) * group.radius;
        const p = this._findNearbyLand(baseX, baseY, 280);
        if (!p) continue;

        if (group.type === "camp") this.camps.push({ id: `camp-${this.camps.length}`, x: p.x, y: p.y });
        else if (group.type === "waystone") this.waystones.push({ id: `way-${this.waystones.length}`, x: p.x, y: p.y });
        else if (group.type === "dungeon") this.dungeons.push({ id: `dng-${this.dungeons.length}`, x: p.x, y: p.y });
      }
    }

    this._buildDocks();
  }

  _buildDocks() {
    const candidates = [
      { x: -this.mapHalfSize + 300, y: -800, dir: 1 },
      { x: this.mapHalfSize - 320, y: 700, dir: -1 },
      { x: -900, y: this.mapHalfSize - 320, dir: 1 },
      { x: 850, y: -this.mapHalfSize + 320, dir: -1 },
    ];

    for (const c of candidates) {
      const p = this._findDockSpot(c.x, c.y, 240);
      if (p) this.docks.push({ id: `dock-${this.docks.length}`, x: p.x, y: p.y, dir: c.dir });
    }
  }

  _findSafeSpawn() {
    const checks = [
      { x: 0, y: 0 },
      { x: -120, y: 80 },
      { x: 140, y: -90 },
      { x: 220, y: 180 },
      { x: -220, y: -160 },
    ];

    for (const c of checks) {
      const p = this._findNearbyLand(c.x, c.y, 320);
      if (p) return p;
    }

    return { x: 0, y: 0 };
  }

  _findNearbyLand(x, y, radius = 200) {
    for (let r = 0; r <= radius; r += 24) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const s = this._sampleCell(px, py);
        if (s.walkable && !s.isWater) return { x: px | 0, y: py | 0 };
      }
    }
    return null;
  }

  _findSafeLandPatchNear(x, y, radius = 180) {
    return this._findNearbyLand(x, y, radius);
  }

  _findDockSpot(x, y, radius = 200) {
    for (let r = 0; r <= radius; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const land = this._sampleCell(px, py);
        const water = this._sampleCell(px + 28, py);
        if (!land.isWater && water.isWater) return { x: px | 0, y: py | 0 };
      }
    }
    return this._findNearbyLand(x, y, radius);
  }

  _buildRoadNetwork() {
    const nodes = [
      { x: this.spawn.x, y: this.spawn.y, kind: "spawn" },
      ...this.camps.map((p) => ({ ...p, kind: "camp" })),
      ...this.waystones.map((p) => ({ ...p, kind: "waystone" })),
      ...this.dungeons.map((p) => ({ ...p, kind: "dungeon" })),
      ...this.docks.map((p) => ({ ...p, kind: "dock" })),
    ];

    this.roadNodes = nodes;

    const connect = (a, b) => this._addRoad(a.x, a.y, b.x, b.y);

    for (const n of nodes) {
      let best = null;
      let bestD = 999999999;

      for (const m of nodes) {
        if (m === n) continue;
        const dx = m.x - n.x;
        const dy = m.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = m;
        }
      }

      if (best) connect(n, best);
    }

    for (const c of this.camps) connect({ x: this.spawn.x, y: this.spawn.y }, c);
  }

  _addRoad(ax, ay, bx, by) {
    const midX = (ax + bx) * 0.5;
    const midY = (ay + by) * 0.5;

    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;
    const bend = Math.sin((ax + by + this.seed) * 0.0007) * Math.min(180, len * 0.18);

    const cx = midX + nx * bend;
    const cy = midY + ny * bend;

    const steps = Math.max(3, Math.ceil(len / 320));
    let px = ax;
    let py = ay;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const qx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
      const qy = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
      this.roads.push({ ax: px, ay: py, bx: qx, by: qy });
      px = qx;
      py = qy;
    }
  }

  _finalizeBridges() {
    this.bridges = [];

    for (const seg of this.roads) {
      const samples = Math.max(6, Math.ceil(Math.hypot(seg.bx - seg.ax, seg.by - seg.ay) / 28));
      let prevWater = false;
      let enter = null;

      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const x = seg.ax + (seg.bx - seg.ax) * t;
        const y = seg.ay + (seg.by - seg.ay) * t;
        const s = this._sampleCell(x, y);

        if (s.isWater && !prevWater) enter = { x, y };

        if (!s.isWater && prevWater && enter) {
          const exit = { x, y };
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
    this._mapCtx = ctx;
    this._mapInfo = { size, colors, tiles, revealed };
    this._mapDirty = false;
  }
}