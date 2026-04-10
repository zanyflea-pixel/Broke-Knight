// src/world.js
// v95.7 WORLD RENDER FIX + BRUTE-FORCE DISCOVERY (FULL FILE)

import { hash2, RNG } from "./util.js";

export default class World {
  constructor(seed = 1, opts = {}) {
    this.seed = seed | 0;
    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.tile = 32;

    this.mapRadius = 5200;
    this.boundsRadius = 7600;

    this.spawn = { x: 0, y: 0 };

    this.mapMode = "small";
    this.minimapMode = "small";

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];

    this.lastHero = { x: 0, y: 0 };

    this._miniCanvas = document.createElement("canvas");
    this._miniCanvas.width = 220;
    this._miniCanvas.height = 220;
    this._miniDirty = true;

    this._zoneCache = new Map();

    // Discovery tuned to be obvious and forgiving
    this.exploreCell = 56;
    this.explored = new Set();
    this.exploreRevealRadius = 640;
    this.exploreImmediateRadius = 340;
    this.spawnRevealRadius = 420;
    this._lastRevealX = null;
    this._lastRevealY = null;
    this._revealStep = 4;

    this._generatePOIs();
    this.spawn = this._findSafeLandPatchNear(0, 0, 420) || { x: 0, y: 0 };
    this.lastHero.x = this.spawn.x;
    this.lastHero.y = this.spawn.y;

    this._revealAround(this.spawn.x, this.spawn.y, this.spawnRevealRadius);
    this._revealStamp(this.spawn.x, this.spawn.y, 3);
    this._miniDirty = true;
    this._rebuildMinimap();
  }

  setViewSize(w, h) {
    this.viewW = w | 0;
    this.viewH = h | 0;
  }

  toggleMapScale() {
    this.mapMode = this.mapMode === "small" ? "large" : "small";
    this._miniDirty = true;
  }

  update(dt, hero) {
    void dt;
    if (!hero) return;

    const hx = hero.x || 0;
    const hy = hero.y || 0;

    this.lastHero.x = hx;
    this.lastHero.y = hy;

    if (this._lastRevealX == null || this._lastRevealY == null) {
      this._lastRevealX = hx;
      this._lastRevealY = hy;
      this._revealAround(hx, hy, this.exploreRevealRadius);
      this._revealAround(hx, hy, this.exploreImmediateRadius);
      this._revealStamp(hx, hy, 3);
      this._miniDirty = true;
      return;
    }

    // Always reveal where the hero is right now
    this._revealAround(hx, hy, this.exploreImmediateRadius);
    this._revealStamp(hx, hy, 3);

    // Reveal a thick path between previous and current position
    this._revealPath(
      this._lastRevealX,
      this._lastRevealY,
      hx,
      hy,
      Math.max(240, this.exploreImmediateRadius * 0.9)
    );

    const dx = hx - this._lastRevealX;
    const dy = hy - this._lastRevealY;
    const movedFarEnough = dx * dx + dy * dy >= this._revealStep * this._revealStep;

    if (movedFarEnough) {
      this._lastRevealX = hx;
      this._lastRevealY = hy;
      this._revealAround(hx, hy, this.exploreRevealRadius);
      this._revealStamp(hx, hy, 3);
      this._miniDirty = true;
    }
  }

  isWater(x, y) {
    const r = Math.hypot(x, y);

    if (r > this.mapRadius + 220) {
      const outerNoise =
        this._valueNoise(x * 0.00115, y * 0.00115, this.seed + 900) * 0.60 +
        this._valueNoise(x * 0.00330, y * 0.00330, this.seed + 901) * 0.40;
      return outerNoise < 0.15;
    }

    const n = this._terrainNoise(x, y);
    const river = this._riverField(x, y);
    const lakes = this._lakeField(x, y);

    return n < -0.22 || river < 0.135 || lakes < 0.038;
  }

  isSolid(x, y) {
    if (Math.abs(x) > this.boundsRadius || Math.abs(y) > this.boundsRadius) return true;
    return this.isWater(x, y);
  }

  canWalk(x, y) {
    if (Math.abs(x) > this.boundsRadius || Math.abs(y) > this.boundsRadius) return false;
    return !this.isWater(x, y);
  }

  getMoveModifier(x, y) {
    if (this.isWater(x, y)) return 0.84;

    const biome = this.getZoneName(x, y);
    if (biome === "Unknown") return 0.98;
    if (biome === "High Meadow") return 1.04;
    if (biome === "Old Road") return 1.08;
    if (biome === "Stone Flats") return 0.98;
    if (biome === "Whisper Grass") return 0.96;
    if (biome === "Ash Fields") return 0.93;
    if (biome === "Pine Verge") return 0.97;

    return 1;
  }

  getZoneName(x, y) {
    const kx = (x / 180) | 0;
    const ky = (y / 180) | 0;
    const key = `${kx},${ky}`;
    if (this._zoneCache.has(key)) return this._zoneCache.get(key);

    const r = Math.hypot(x, y);
    let name = "Green Reach";

    if (r > this.mapRadius - 120) {
      name = "Unknown";
      this._zoneCache.set(key, name);
      return name;
    }

    if (this._isNearCamp(x, y, 220)) name = "Camp Grounds";
    else if (this._isNearDungeon(x, y, 240)) name = "Ruin Approach";
    else if (this._isNearDock(x, y, 220)) name = "Shoreline";
    else if (this._isNearWaystone(x, y, 220)) name = "Waystone Rise";
    else if (this._isNearWater(x, y, 104)) name = "Riverbank";
    else {
      const macro = this._macroBiomeValue(x, y);
      const heat = this._macroHeatValue(x, y);
      const dry = this._macroDryValue(x, y);

      if (macro < 0.16) name = dry > 0.60 ? "Stone Flats" : "Old Road";
      else if (macro < 0.34) name = heat > 0.58 ? "Ash Fields" : "Whisper Grass";
      else if (macro < 0.52) name = "Green Reach";
      else if (macro < 0.70) name = dry > 0.56 ? "Pine Verge" : "High Meadow";
      else if (macro < 0.86) name = heat < 0.42 ? "Pine Verge" : "Whisper Grass";
      else name = dry > 0.52 ? "Stone Flats" : "High Meadow";
    }

    this._zoneCache.set(key, name);
    return name;
  }

  isExplored(x, y) {
    const cx = Math.floor(x / this.exploreCell);
    const cy = Math.floor(y / this.exploreCell);
    return this.explored.has(`${cx},${cy}`);
  }

  _isNearWater(x, y, r = 64) {
    const step = Math.max(10, (r / 3) | 0);
    for (let oy = -r; oy <= r; oy += step) {
      for (let ox = -r; ox <= r; ox += step) {
        if (ox * ox + oy * oy > r * r) continue;
        if (this.isWater(x + ox, y + oy)) return true;
      }
    }
    return false;
  }

  _isNearCamp(x, y, r = 120) {
    const r2 = r * r;
    for (const c of this.camps) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _isNearDock(x, y, r = 120) {
    const r2 = r * r;
    for (const d of this.docks) {
      const dx = x - d.x;
      const dy = y - d.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _isNearWaystone(x, y, r = 120) {
    const r2 = r * r;
    for (const w of this.waystones) {
      const dx = x - w.x;
      const dy = y - w.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _isNearDungeon(x, y, r = 120) {
    const r2 = r * r;
    for (const d of this.dungeons) {
      const dx = x - d.x;
      const dy = y - d.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  _findNearbyLand(x, y, radius = 220, allowWater = false, requireDryPatch = false) {
    if (!allowWater && this.canWalk(x, y)) {
      if (!requireDryPatch || !this._isNearWater(x, y, 22)) return { x, y };
    }

    const step = 18;
    for (let r = step; r <= radius; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!allowWater && !this.canWalk(px, py)) continue;
        if (requireDryPatch && this._isNearWater(px, py, 18)) continue;
        return { x: px, y: py };
      }
    }

    return null;
  }

  _findSafeLandPatchNear(x, y, radius = 300) {
    if (this.canWalk(x, y) && !this._isNearWater(x, y, 18)) return { x, y };

    const step = 20;
    for (let r = step; r <= radius; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!this.canWalk(px, py)) continue;
        if (this._isNearWater(px, py, 18)) continue;
        return { x: px, y: py };
      }
    }

    return this._findNearbyLand(x, y, radius, false, false);
  }

  _revealCell(cx, cy) {
    const key = `${cx},${cy}`;
    if (!this.explored.has(key)) {
      this.explored.add(key);
      this._miniDirty = true;
    }
  }

  _revealStamp(x, y, cells = 3) {
    const cx = Math.floor(x / this.exploreCell);
    const cy = Math.floor(y / this.exploreCell);

    for (let oy = -cells; oy <= cells; oy++) {
      for (let ox = -cells; ox <= cells; ox++) {
        this._revealCell(cx + ox, cy + oy);
      }
    }
  }

  _revealAround(x, y, radius = 320) {
    const cell = this.exploreCell;
    const minX = Math.floor((x - radius) / cell);
    const maxX = Math.floor((x + radius) / cell);
    const minY = Math.floor((y - radius) / cell);
    const maxY = Math.floor((y + radius) / cell);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const x0 = cx * cell;
        const y0 = cy * cell;
        const x1 = x0 + cell;
        const y1 = y0 + cell;

        const nx = clampLocal(x, x0, x1);
        const ny = clampLocal(y, y0, y1);
        const dx = nx - x;
        const dy = ny - y;

        if (dx * dx + dy * dy <= radius * radius) {
          this._revealCell(cx, cy);
        }
      }
    }
  }

  _revealPath(x0, y0, x1, y1, radius = 220) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) {
      this._revealAround(x1, y1, radius);
      this._revealStamp(x1, y1, 3);
      return;
    }

    const step = Math.max(6, this.exploreCell * 0.20);
    const count = Math.max(1, Math.ceil(dist / step));

    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      this._revealAround(px, py, radius);
      this._revealStamp(px, py, 3);
    }
  }

  _generatePOIs() {
    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];

    const rng = new RNG(hash2(this.seed, 777));

    const campTargets = [
      { x: -1200, y: -480 },
      { x: 980, y: -860 },
      { x: -1040, y: 980 },
      { x: 1240, y: 820 },
      { x: 120, y: 1320 },
    ];

    const wayTargets = [
      { x: -1800, y: -220 },
      { x: 1720, y: -180 },
      { x: -260, y: 1760 },
      { x: 420, y: -1680 },
    ];

    const dungeonTargets = [
      { x: 1880, y: 1180 },
      { x: -1960, y: 1240 },
      { x: 1420, y: -1660 },
    ];

    const dockTargets = [
      { x: -2300, y: 220 },
      { x: 2260, y: -140 },
      { x: 160, y: 2360 },
    ];

    for (let i = 0; i < campTargets.length; i++) {
      const p = this._snapToLand(
        campTargets[i].x + rng.range(-120, 120),
        campTargets[i].y + rng.range(-120, 120),
        420
      );
      if (!p) continue;
      this.camps.push({
        id: i + 1,
        x: p.x,
        y: p.y,
        name: ["Oak Camp", "Stone Camp", "Pine Camp", "River Camp", "Dust Camp"][i] || `Camp ${i + 1}`,
      });
    }

    for (let i = 0; i < wayTargets.length; i++) {
      const p = this._snapToLand(wayTargets[i].x, wayTargets[i].y, 420);
      if (!p) continue;
      this.waystones.push({
        id: i + 1,
        x: p.x,
        y: p.y,
        name: `Waystone ${i + 1}`,
      });
    }

    for (let i = 0; i < dungeonTargets.length; i++) {
      const p = this._snapToLand(dungeonTargets[i].x, dungeonTargets[i].y, 520);
      if (!p) continue;
      this.dungeons.push({
        id: i + 1,
        x: p.x,
        y: p.y,
        name: ["Sunken Gate", "Ash Ruin", "Broken Crypt"][i] || `Dungeon ${i + 1}`,
      });
    }

    for (let i = 0; i < dockTargets.length; i++) {
      const p = this._snapDockToShore(dockTargets[i].x, dockTargets[i].y, 620);
      if (!p) continue;
      this.docks.push({
        id: i + 1,
        x: p.x,
        y: p.y,
        name: ["West Dock", "East Dock", "South Dock"][i] || `Dock ${i + 1}`,
      });
    }
  }

  _snapToLand(x, y, radius = 400) {
    return this._findSafeLandPatchNear(x, y, radius);
  }

  _snapDockToShore(x, y, radius = 500) {
    const step = 22;
    for (let r = 0; r <= radius; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (!this.canWalk(px, py)) continue;

        const nearWater =
          this.isWater(px + 28, py) ||
          this.isWater(px - 28, py) ||
          this.isWater(px, py + 28) ||
          this.isWater(px, py - 28);

        if (nearWater) return { x: px, y: py };
      }
    }
    return null;
  }

  draw(ctx, camera) {
    const vb = this._viewBounds(camera);
    this._drawGround(ctx, vb);
    this._drawWater(ctx, vb);
    this._drawRoadHints(ctx, vb);
    this._drawScenery(ctx, vb);
    this._drawPOIs(ctx, vb);
  }

  _viewBounds(camera) {
    const halfW = this.viewW * 0.5;
    const halfH = this.viewH * 0.5;
    return {
      x0: camera.x - halfW - 120,
      y0: camera.y - halfH - 120,
      x1: camera.x + halfW + 120,
      y1: camera.y + halfH + 120,
    };
  }

  _drawGround(ctx, vb) {
    const t = this.tile;
    const x0 = Math.floor(vb.x0 / t) * t;
    const y0 = Math.floor(vb.y0 / t) * t;
    const x1 = Math.ceil(vb.x1 / t) * t;
    const y1 = Math.ceil(vb.y1 / t) * t;

    for (let y = y0; y <= y1; y += t) {
      for (let x = x0; x <= x1; x += t) {
        const cx = x + t * 0.5;
        const cy = y + t * 0.5;
        if (this.isWater(cx, cy)) continue;

        const zone = this.getZoneName(cx, cy);
        ctx.fillStyle = this._groundColor(zone, x, y, cx, cy);
        ctx.fillRect(x, y, t + 1, t + 1);

        const detail = Math.abs(hash2((x / t) | 0, (y / t) | 0, this.seed + 66)) % 100;
        const shore = this._isNearWater(cx, cy, 34);

        if (zone === "Unknown") {
          if (detail < 4) this._drawDeadTuft(ctx, x + 10, y + 24);
          else if (detail > 94) this._drawDarkShard(ctx, x + 16, y + 18);
          continue;
        }

        if (detail < 6) this._drawGrassTuft(ctx, x + 10, y + 24, zone);
        else if (detail < 9) this._drawGrassTuft(ctx, x + 18, y + 23, zone);
        else if (detail < 11 && !shore) this._drawFlowerPatch(ctx, x + 16, y + 19, zone);
        else if (detail > 95) this._drawPebble(ctx, x + 16, y + 18, zone);
        else if (shore && detail > 84) this._drawReeds(ctx, x + 16, y + 22);
      }
    }
  }

  _drawWater(ctx, vb) {
    const t = this.tile;
    const x0 = Math.floor(vb.x0 / t) * t;
    const y0 = Math.floor(vb.y0 / t) * t;
    const x1 = Math.ceil(vb.x1 / t) * t;
    const y1 = Math.ceil(vb.y1 / t) * t;

    for (let y = y0; y <= y1; y += t) {
      for (let x = x0; x <= x1; x += t) {
        const cx = x + t * 0.5;
        const cy = y + t * 0.5;
        if (!this.isWater(cx, cy)) continue;

        const zone = this.getZoneName(cx, cy);
        const n = this._terrainNoise(x, y);
        const ripple = Math.abs(hash2((x / t) | 0, (y / t) | 0, 9182)) % 100;

        if (zone === "Unknown") {
          ctx.fillStyle = ripple < 45 ? "#24374a" : "#1f3140";
        } else {
          const shade = ripple < 45 ? "#458dbe" : "#3f84b2";
          ctx.fillStyle = n < -0.30 ? "#2c6da3" : shade;
        }

        ctx.fillRect(x, y, t + 1, t + 1);

        if (ripple < 14) {
          ctx.fillStyle = zone === "Unknown" ? "rgba(200,220,255,0.06)" : "rgba(255,255,255,0.14)";
          ctx.fillRect(x + 4, y + 6, 12, 2);
          ctx.fillRect(x + 16, y + 18, 8, 2);
        }
        if (ripple > 86) {
          ctx.fillStyle = zone === "Unknown" ? "rgba(200,220,255,0.05)" : "rgba(255,255,255,0.10)";
          ctx.fillRect(x + 8, y + 12, 10, 2);
        }
      }
    }
  }

  _drawRoadHints(ctx, vb) {
    const camps = this.camps;
    const ways = this.waystones;

    ctx.save();

    for (const c of camps) {
      const nearestWay = this._nearestPOI(c.x, c.y, ways);
      if (!nearestWay) continue;
      if (!segmentIntersectsView(c.x, c.y, nearestWay.x, nearestWay.y, vb)) continue;

      ctx.strokeStyle = "rgba(170,145,100,0.12)";
      ctx.lineWidth = 22;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(nearestWay.x, nearestWay.y);
      ctx.stroke();

      ctx.strokeStyle = "rgba(196,170,120,0.14)";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(nearestWay.x, nearestWay.y);
      ctx.stroke();

      ctx.strokeStyle = "rgba(230,214,180,0.06)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(nearestWay.x, nearestWay.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawScenery(ctx, vb) {
    const cell = 96;
    const x0 = Math.floor(vb.x0 / cell) * cell;
    const y0 = Math.floor(vb.y0 / cell) * cell;
    const x1 = Math.ceil(vb.x1 / cell) * cell;
    const y1 = Math.ceil(vb.y1 / cell) * cell;

    for (let y = y0; y <= y1; y += cell) {
      for (let x = x0; x <= x1; x += cell) {
        const h = Math.abs(hash2((x / cell) | 0, (y / cell) | 0, this.seed + 3107)) % 1000;
        const px = x + 48 + (((hash2(x | 0, y | 0, this.seed + 11) % 100) / 100) - 0.5) * 36;
        const py = y + 48 + (((hash2(x | 0, y | 0, this.seed + 12) % 100) / 100) - 0.5) * 36;

        if (!this.canWalk(px, py)) continue;
        if (this._isNearWater(px, py, 32)) continue;
        if (this._isNearCamp(px, py, 120)) continue;
        if (this._isNearDock(px, py, 110)) continue;
        if (this._isNearWaystone(px, py, 100)) continue;
        if (this._isNearDungeon(px, py, 130)) continue;

        const zone = this.getZoneName(px, py);

        if (zone === "Unknown") {
          if (h < 32) this._drawDeadTree(ctx, px, py, 1.0 + (h % 3) * 0.08);
          else if (h < 50) this._drawDarkRockCluster(ctx, px, py);
          continue;
        }

        if (h < 28 && zone !== "Old Road" && zone !== "Stone Flats") this._drawTreeCluster(ctx, px, py, zone, h);
        else if (h >= 28 && h < 44) this._drawBushCluster(ctx, px, py, zone, h);
        else if (h >= 44 && h < 54 && zone !== "Old Road") this._drawRockCluster(ctx, px, py, zone, h);
      }
    }
  }

  _drawPOIs(ctx, vb) {
    for (const c of this.camps) {
      if (!pointInView(c.x, c.y, vb, 220)) continue;
      this._drawCamp(ctx, c);
    }

    for (const w of this.waystones) {
      if (!pointInView(w.x, w.y, vb, 120)) continue;
      this._drawWaystone(ctx, w);
    }

    for (const d of this.docks) {
      if (!pointInView(d.x, d.y, vb, 120)) continue;
      this._drawDock(ctx, d);
    }

    for (const dg of this.dungeons) {
      if (!pointInView(dg.x, dg.y, vb, 180)) continue;
      this._drawDungeonEntrance(ctx, dg);
    }
  }

  _drawCamp(ctx, camp) {
    const tier = this._campTier(camp.id);
    const scale = tier >= 4 ? 1.34 : tier >= 3 ? 1.20 : tier >= 2 ? 1.08 : 1.0;

    ctx.save();
    ctx.translate(camp.x, camp.y);

    this._drawCampGround(ctx, tier);

    if (tier === 1) this._drawCampOutpost(ctx, camp, scale);
    else if (tier === 2) this._drawCampTier2(ctx, camp, scale);
    else if (tier === 3) this._drawCampTier3(ctx, camp, scale);
    else this._drawCampTier4(ctx, camp, scale);

    ctx.fillStyle = "#dfe8f5";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${camp.name || `Camp ${camp.id}`} • ${this._campTierName(camp.id)}`, 0, -54 - (tier - 1) * 4);

    ctx.restore();
  }

  _drawCampGround(ctx, tier) {
    const rx = tier >= 4 ? 82 : tier >= 3 ? 70 : tier >= 2 ? 58 : 46;
    const ry = tier >= 4 ? 26 : tier >= 3 ? 22 : tier >= 2 ? 18 : 12;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 20, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const ringColor =
      tier >= 4 ? "rgba(194,166,126,0.24)" :
      tier >= 3 ? "rgba(176,150,112,0.22)" :
      tier >= 2 ? "rgba(160,136,100,0.18)" :
      "rgba(140,118,86,0.14)";

    ctx.strokeStyle = ringColor;
    ctx.lineWidth = tier >= 4 ? 5 : tier >= 3 ? 4 : tier >= 2 ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(0, 20, rx - 6, ry - 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawCampOutpost(ctx, camp, scale) {
    this._drawTent(ctx, -18 * scale, 0, 0.88 * scale, "#b78b52");
    this._drawCampfire(ctx, 10 * scale, 8 * scale, 1.0, false);
    this._drawCrate(ctx, 26 * scale, 8 * scale, 1.0);
    this._drawBanner(ctx, -2 * scale, -8 * scale, "#d9c787", 1.0);
    this._drawCampNPC(ctx, -30 * scale, 14 * scale, "#6f86a8", false, 0.92);
    void camp;
  }

  _drawCampTier2(ctx, camp, scale) {
    this._drawTent(ctx, -26 * scale, 2 * scale, 0.94 * scale, "#be8d58");
    this._drawTent(ctx, 24 * scale, 4 * scale, 0.88 * scale, "#b8844c");
    this._drawCampfire(ctx, 0, 8 * scale, 1.1, false);
    this._drawCrate(ctx, -2 * scale, 24 * scale, 1.1);
    this._drawBanner(ctx, -36 * scale, -6 * scale, "#b8d987", 1.0);
    this._drawBanner(ctx, 36 * scale, -4 * scale, "#87c0d9", 1.0);
    this._drawCampNPC(ctx, -10 * scale, 24 * scale, "#6f86a8", false, 0.95);
    this._drawCampNPC(ctx, 34 * scale, 20 * scale, "#8b6a4a", true, 0.90);
    void camp;
  }

  _drawCampTier3(ctx, camp, scale) {
    this._drawLowWall(ctx, scale);
    this._drawMainHall(ctx, 0, 0, 1.0 * scale);
    this._drawTent(ctx, -40 * scale, 10 * scale, 0.80 * scale, "#c49660");
    this._drawTent(ctx, 42 * scale, 10 * scale, 0.80 * scale, "#b68454");
    this._drawCampfire(ctx, 0, 16 * scale, 1.18, true);
    this._drawBanner(ctx, -52 * scale, -10 * scale, "#c7d971", 1.1);
    this._drawBanner(ctx, 52 * scale, -10 * scale, "#9ec7ff", 1.1);
    this._drawCrate(ctx, -18 * scale, 28 * scale, 1.15);
    this._drawCrate(ctx, 18 * scale, 28 * scale, 1.15);
    this._drawCampNPC(ctx, -48 * scale, 18 * scale, "#7f5da0", true, 0.94);
    this._drawCampNPC(ctx, 0, 28 * scale, "#668b66", false, 0.98);
    this._drawCampNPC(ctx, 48 * scale, 18 * scale, "#6f86a8", true, 0.94);
    this._drawTrainingPost(ctx, -26 * scale, 30 * scale, 1.0);
    this._drawMerchantStall(ctx, 30 * scale, 28 * scale, 0.92, "#b78b52");
    void camp;
  }

  _drawCampTier4(ctx, camp, scale) {
    this._drawStrongholdWall(ctx, scale);
    this._drawTower(ctx, -56 * scale, -8 * scale, 0.94 * scale);
    this._drawTower(ctx, 56 * scale, -8 * scale, 0.94 * scale);
    this._drawMainHall(ctx, 0, -2 * scale, 1.18 * scale);
    this._drawCampfire(ctx, 0, 18 * scale, 1.28, true);
    this._drawBanner(ctx, -66 * scale, -16 * scale, "#ffe08a", 1.15);
    this._drawBanner(ctx, 66 * scale, -16 * scale, "#ff9f87", 1.15);
    this._drawCrate(ctx, -22 * scale, 34 * scale, 1.18);
    this._drawCrate(ctx, 22 * scale, 34 * scale, 1.18);
    this._drawFencePost(ctx, -32 * scale, 26 * scale, 1.0);
    this._drawFencePost(ctx, 32 * scale, 26 * scale, 1.0);
    this._drawCampNPC(ctx, -40 * scale, 28 * scale, "#6f86a8", true, 0.98);
    this._drawCampNPC(ctx, -8 * scale, 30 * scale, "#7f5da0", false, 0.96);
    this._drawCampNPC(ctx, 20 * scale, 30 * scale, "#668b66", false, 0.96);
    this._drawCampNPC(ctx, 52 * scale, 24 * scale, "#8b6a4a", true, 0.98);
    this._drawMerchantStall(ctx, -46 * scale, 28 * scale, 0.96, "#c49660");
    this._drawForge(ctx, 40 * scale, 30 * scale, 1.0);
    this._drawTrainingPost(ctx, -10 * scale, 34 * scale, 1.06);
    void camp;
  }

  _drawTent(ctx, x, y, scale = 1, roof = "#b78b52") {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 14 * scale, 18 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8d6b3b";
    ctx.fillRect(-16 * scale, 0, 32 * scale, 10 * scale);

    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(-20 * scale, 0);
    ctx.lineTo(0, -18 * scale);
    ctx.lineTo(20 * scale, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6c4b2c";
    ctx.fillRect(-3 * scale, 3 * scale, 6 * scale, 7 * scale);

    ctx.restore();
  }

  _drawCampfire(ctx, x, y, scale = 1, strong = false) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = strong ? "rgba(255,214,140,0.25)" : "rgba(255,210,120,0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, (strong ? 24 : 18) * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6d5237";
    ctx.fillRect(-10 * scale, 4 * scale, 20 * scale, 4 * scale);
    ctx.fillRect(-2 * scale, -2 * scale, 4 * scale, 12 * scale);

    ctx.fillStyle = strong ? "#ffb44d" : "#d48b3f";
    ctx.beginPath();
    ctx.arc(0, 2 * scale, 6 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = strong ? "rgba(255,220,140,0.42)" : "rgba(255,210,120,0.32)";
    ctx.beginPath();
    ctx.arc(0, 0, 10 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawCrate(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#8c6a3e";
    ctx.fillRect(-6 * scale, -6 * scale, 12 * scale, 12 * scale);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-6 * scale, -6 * scale, 12 * scale, 12 * scale);
    ctx.restore();
  }

  _drawBanner(ctx, x, y, color = "#d9c787", scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#7a6748";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 16 * scale);
    ctx.lineTo(0, -10 * scale);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -8 * scale);
    ctx.lineTo(12 * scale, -5 * scale);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawLowWall(ctx, scale = 1) {
    ctx.save();
    ctx.fillStyle = "#90714c";
    ctx.fillRect(-54 * scale, 18 * scale, 108 * scale, 8 * scale);
    ctx.fillRect(-58 * scale, 2 * scale, 8 * scale, 24 * scale);
    ctx.fillRect(50 * scale, 2 * scale, 8 * scale, 24 * scale);
    ctx.restore();
  }

  _drawStrongholdWall(ctx, scale = 1) {
    ctx.save();
    ctx.fillStyle = "#8e7761";
    ctx.fillRect(-68 * scale, 16 * scale, 136 * scale, 10 * scale);
    ctx.fillRect(-72 * scale, -6 * scale, 10 * scale, 32 * scale);
    ctx.fillRect(62 * scale, -6 * scale, 10 * scale, 32 * scale);

    ctx.fillStyle = "#6a5946";
    for (let i = -58; i <= 58; i += 16) {
      ctx.fillRect(i * scale, 10 * scale, 8 * scale, 6 * scale);
    }
    ctx.restore();
  }

  _drawMainHall(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 18 * scale, 34 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8d6b3b";
    ctx.fillRect(-28 * scale, -2 * scale, 56 * scale, 20 * scale);

    ctx.fillStyle = "#b78b52";
    ctx.beginPath();
    ctx.moveTo(-34 * scale, -2 * scale);
    ctx.lineTo(0, -26 * scale);
    ctx.lineTo(34 * scale, -2 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#67472c";
    ctx.fillRect(-6 * scale, 4 * scale, 12 * scale, 14 * scale);

    ctx.fillStyle = "rgba(255,226,150,0.22)";
    ctx.fillRect(-4 * scale, 7 * scale, 8 * scale, 6 * scale);

    ctx.restore();
  }

  _drawTower(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 18 * scale, 14 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8e7761";
    ctx.fillRect(-10 * scale, -12 * scale, 20 * scale, 30 * scale);

    ctx.fillStyle = "#6a5946";
    ctx.fillRect(-12 * scale, -16 * scale, 24 * scale, 6 * scale);
    ctx.fillRect(-8 * scale, -4 * scale, 4 * scale, 4 * scale);
    ctx.fillRect(4 * scale, -4 * scale, 4 * scale, 4 * scale);

    ctx.restore();
  }

  _drawFencePost(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#7d603e";
    ctx.fillRect(-2 * scale, -10 * scale, 4 * scale, 12 * scale);
    ctx.restore();
  }

  _drawCampNPC(ctx, x, y, cloth = "#6f86a8", guard = false, scale = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 8 * scale, 7 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4f3826";
    ctx.fillRect(-1.5 * scale, -1 * scale, 3 * scale, 7 * scale);

    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-5 * scale, -1 * scale);
    ctx.lineTo(5 * scale, -1 * scale);
    ctx.lineTo(4 * scale, 7 * scale);
    ctx.lineTo(0, 10 * scale);
    ctx.lineTo(-4 * scale, 7 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f0c29f";
    ctx.beginPath();
    ctx.arc(0, -5 * scale, 4.4 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4c2f23";
    ctx.beginPath();
    ctx.arc(0, -6.5 * scale, 4.6 * scale, Math.PI, 0);
    ctx.fill();

    if (guard) {
      ctx.fillStyle = "#8d97a6";
      ctx.fillRect(5 * scale, -1 * scale, 1.5 * scale, 13 * scale);
      ctx.fillStyle = "#d8e5ff";
      ctx.beginPath();
      ctx.arc(6 * scale, -2 * scale, 2.2 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawMerchantStall(ctx, x, y, scale = 1, canopy = "#b78b52") {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 10 * scale, 18 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7a5a35";
    ctx.fillRect(-14 * scale, 0, 28 * scale, 6 * scale);
    ctx.fillRect(-12 * scale, -12 * scale, 2.5 * scale, 12 * scale);
    ctx.fillRect(9.5 * scale, -12 * scale, 2.5 * scale, 12 * scale);

    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.moveTo(-16 * scale, -12 * scale);
    ctx.lineTo(0, -21 * scale);
    ctx.lineTo(16 * scale, -12 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d9c787";
    ctx.fillRect(-8 * scale, 2 * scale, 4 * scale, 2.5 * scale);
    ctx.fillStyle = "#87c0d9";
    ctx.fillRect(-1 * scale, 2 * scale, 4 * scale, 2.5 * scale);
    ctx.fillStyle = "#c7d971";
    ctx.fillRect(6 * scale, 2 * scale, 4 * scale, 2.5 * scale);

    ctx.restore();
  }

  _drawForge(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 9 * scale, 18 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6f6458";
    ctx.fillRect(-14 * scale, -2 * scale, 16 * scale, 9 * scale);
    ctx.fillStyle = "#3f3a36";
    ctx.fillRect(-12 * scale, 0, 12 * scale, 5 * scale);

    ctx.fillStyle = "rgba(255,184,82,0.42)";
    ctx.beginPath();
    ctx.arc(-6 * scale, 2 * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8d6b3b";
    ctx.fillRect(4 * scale, 1 * scale, 10 * scale, 3 * scale);
    ctx.fillStyle = "#b8bcc5";
    ctx.fillRect(11 * scale, -3 * scale, 4 * scale, 4 * scale);

    ctx.restore();
  }

  _drawTrainingPost(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 9 * scale, 14 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7b5a39";
    ctx.fillRect(-2 * scale, -12 * scale, 4 * scale, 20 * scale);
    ctx.fillRect(-10 * scale, -12 * scale, 20 * scale, 3 * scale);

    ctx.fillStyle = "#8e5c4d";
    ctx.beginPath();
    ctx.arc(8 * scale, -2 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawWaystone(ctx, stone) {
    ctx.save();
    ctx.translate(stone.x, stone.y);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6e7e9a";
    ctx.beginPath();
    ctx.moveTo(-12, 14);
    ctx.lineTo(-8, -18);
    ctx.lineTo(0, -28);
    ctx.lineTo(8, -18);
    ctx.lineTo(12, 14);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(196,220,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 8);
    ctx.stroke();

    ctx.fillStyle = "rgba(150,210,255,0.18)";
    ctx.beginPath();
    ctx.arc(0, -10, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawDock(ctx, dock) {
    ctx.save();
    ctx.translate(dock.x, dock.y);

    ctx.fillStyle = "#8c6a3e";
    ctx.fillRect(-18, -8, 36, 16);
    ctx.fillRect(-10, 8, 6, 12);
    ctx.fillRect(4, 8, 6, 12);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(14, -2);
    ctx.moveTo(-14, 3);
    ctx.lineTo(14, 3);
    ctx.stroke();

    ctx.fillStyle = "#dfe8f5";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(dock.name || `Dock ${dock.id}`, 0, -16);

    ctx.restore();
  }

  _drawDungeonEntrance(ctx, dg) {
    ctx.save();
    ctx.translate(dg.x, dg.y);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 20, 48, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#554b45";
    ctx.fillRect(-34, -10, 68, 30);

    ctx.fillStyle = "#2a2424";
    ctx.beginPath();
    ctx.arc(0, 8, 18, Math.PI, 0, false);
    ctx.lineTo(18, 8);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,150,110,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 8, 26, Math.PI, 0, false);
    ctx.stroke();

    ctx.fillStyle = "#dfe8f5";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(dg.name || `Dungeon ${dg.id}`, 0, -18);

    ctx.restore();
  }

  _drawTreeCluster(ctx, x, y, zone, h) {
    const style = h % 3;
    const scale = style === 0 ? 0.92 : style === 1 ? 1.0 : 1.08;

    this._drawTree(ctx, x, y, scale, zone);

    if (style >= 1) this._drawTree(ctx, x - 18, y + 8, scale * 0.82, zone);
    if (style >= 2) this._drawTree(ctx, x + 20, y + 6, scale * 0.78, zone);
  }

  _drawTree(ctx, x, y, scale = 1, zone = "Green Reach") {
    const top =
      zone === "Pine Verge" ? "#325f39" :
      zone === "Ash Fields" ? "#55614b" :
      zone === "Whisper Grass" ? "#417245" :
      "#3b6b3f";

    const mid =
      zone === "Pine Verge" ? "#417b49" :
      zone === "Ash Fields" ? "#657159" :
      zone === "Whisper Grass" ? "#4c8250" :
      "#4a7b4b";

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 12 * scale, 14 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6a4a2b";
    ctx.fillRect(-3 * scale, 0, 6 * scale, 16 * scale);

    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.arc(0, -6 * scale, 12 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.arc(-7 * scale, 0, 9 * scale, 0, Math.PI * 2);
    ctx.arc(7 * scale, 0, 9 * scale, 0, Math.PI * 2);
    ctx.arc(0, 5 * scale, 10 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawBushCluster(ctx, x, y, zone, h) {
    const color =
      zone === "Ash Fields" ? "#677054" :
      zone === "Whisper Grass" ? "#5d8f5b" :
      zone === "Stone Flats" ? "#66795d" :
      "#588650";

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 7, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-6, 2, 6, 0, Math.PI * 2);
    ctx.arc(2, -1, 7, 0, Math.PI * 2);
    ctx.arc(9, 2, 5, 0, Math.PI * 2);
    ctx.fill();

    if ((h % 2) === 0) {
      ctx.fillStyle = "rgba(255,220,180,0.35)";
      ctx.beginPath();
      ctx.arc(1, 0, 1.5, 0, Math.PI * 2);
      ctx.arc(7, 2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawRockCluster(ctx, x, y, zone, h) {
    const c1 =
      zone === "Ash Fields" ? "#7e7b70" :
      zone === "Stone Flats" ? "#868d82" :
      "#80877b";

    const c2 =
      zone === "Ash Fields" ? "#67645b" :
      zone === "Stone Flats" ? "#6d756b" :
      "#697064";

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 6, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    this._poly(ctx, [[-8, 5], [-6, -2], [0, -4], [4, 0], [2, 6]]);
    ctx.fillStyle = c1;
    ctx.fill();

    this._poly(ctx, [[2, 6], [6, 1], [10, 3], [8, 8], [4, 9]]);
    ctx.fillStyle = c2;
    ctx.fill();

    if ((h % 3) === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(-2, -1, 4, 1.5);
    }

    ctx.restore();
  }

  _drawFlowerPatch(ctx, x, y, zone) {
    const base =
      zone === "Ash Fields" ? "rgba(209,196,146,0.65)" :
      zone === "Whisper Grass" ? "rgba(240,208,255,0.65)" :
      "rgba(255,228,170,0.65)";

    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x - 2, y, 1.6, 0, Math.PI * 2);
    ctx.arc(x + 4, y - 1, 1.4, 0, Math.PI * 2);
    ctx.arc(x + 1, y + 3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(48,96,42,0.40)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 2);
    ctx.lineTo(x - 1, y + 6);
    ctx.moveTo(x + 4, y + 1);
    ctx.lineTo(x + 4, y + 6);
    ctx.moveTo(x + 1, y + 4);
    ctx.lineTo(x + 1, y + 7);
    ctx.stroke();
  }

  _drawReeds(ctx, x, y) {
    ctx.strokeStyle = "rgba(120,148,84,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 4);
    ctx.lineTo(x - 6, y - 6);
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x - 1, y - 8);
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + 6, y - 5);
    ctx.moveTo(x + 8, y + 4);
    ctx.lineTo(x + 10, y - 4);
    ctx.stroke();
  }

  _drawDeadTuft(ctx, x, y) {
    ctx.strokeStyle = "rgba(132,124,98,0.48)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - 5);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y - 7);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 4);
    ctx.stroke();
  }

  _drawDarkShard(ctx, x, y) {
    ctx.fillStyle = "rgba(42,46,54,0.55)";
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 3, y + 2);
    ctx.lineTo(x - 2, y + 4);
    ctx.closePath();
    ctx.fill();
  }

  _drawDeadTree(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 12 * scale, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a4c40";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(0, 12 * scale);
    ctx.lineTo(0, -6 * scale);
    ctx.moveTo(0, -2 * scale);
    ctx.lineTo(-7 * scale, -10 * scale);
    ctx.moveTo(0, -3 * scale);
    ctx.lineTo(7 * scale, -9 * scale);
    ctx.stroke();

    ctx.restore();
  }

  _drawDarkRockCluster(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 6, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    this._poly(ctx, [[-8, 5], [-6, -1], [0, -5], [4, -1], [2, 6]]);
    ctx.fillStyle = "#3a4047";
    ctx.fill();

    this._poly(ctx, [[2, 6], [7, 2], [10, 4], [8, 8], [3, 9]]);
    ctx.fillStyle = "#2d3238";
    ctx.fill();

    ctx.restore();
  }

  // Restored missing helpers that caused the crash
  _drawGrassTuft(ctx, x, y, zone = "Green Reach") {
    const c =
      zone === "Ash Fields" ? "rgba(88,108,70,0.42)" :
      zone === "Stone Flats" ? "rgba(72,96,68,0.42)" :
      zone === "Whisper Grass" ? "rgba(46,92,52,0.44)" :
      "rgba(36,76,32,0.45)";

    ctx.strokeStyle = c;
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

  _drawPebble(ctx, x, y, zone = "Green Reach") {
    const c =
      zone === "Ash Fields" ? "rgba(76,70,62,0.24)" :
      zone === "Stone Flats" ? "rgba(52,64,58,0.20)" :
      zone === "Whisper Grass" ? "rgba(52,62,56,0.18)" :
      "rgba(40,52,44,0.18)";

    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.arc(x + 4, y + 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _poly(ctx, pts) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  getMinimapCanvas() {
    if (this._miniDirty) this._rebuildMinimap();
    return this._miniCanvas;
  }

  _rebuildMinimap() {
    const c = this._miniCanvas;
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;

    ctx.clearRect(0, 0, w, h);

    const span = Math.max(4000, this.mapRadius);
    const half = span * 0.5;

    for (let py = 0; py < h; py += 2) {
      for (let px = 0; px < w; px += 2) {
        const wx = (px / w) * span - half;
        const wy = (py / h) * span - half;

        if (!this.isExplored(wx, wy)) {
          ctx.fillStyle = "#06080c";
          ctx.fillRect(px, py, 2, 2);
          continue;
        }

        if (this.isWater(wx, wy)) {
          ctx.fillStyle = "#3f86b8";
        } else {
          const zone = this.getZoneName(wx, wy);
          ctx.fillStyle = this._miniGroundColor(zone);
        }

        ctx.fillRect(px, py, 2, 2);
      }
    }

    for (const c0 of this.camps) {
      if (this.isExplored(c0.x, c0.y)) this._miniPoint(ctx, c0.x, c0.y, span, "#f3c46e", 3);
    }
    for (const w0 of this.waystones) {
      if (this.isExplored(w0.x, w0.y)) this._miniPoint(ctx, w0.x, w0.y, span, "#bde4ff", 2.5);
    }
    for (const d0 of this.docks) {
      if (this.isExplored(d0.x, d0.y)) this._miniPoint(ctx, d0.x, d0.y, span, "#d6c3a1", 2.5);
    }
    for (const dg of this.dungeons) {
      if (this.isExplored(dg.x, dg.y)) this._miniPoint(ctx, dg.x, dg.y, span, "#ff9f87", 3);
    }

    this._miniDirty = false;
  }

  _miniPoint(ctx, x, y, span, color, r) {
    const c = this._miniCanvas;
    const px = ((x + span * 0.5) / span) * c.width;
    const py = ((y + span * 0.5) / span) * c.height;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _campRenown(campId) {
    return this._campProgress(campId);
  }

  _campProgress(campId) {
    const h = Math.abs(hash2(campId | 0, this.seed | 0, 431)) % 7;
    return h;
  }

  _campTier(campId) {
    const renown = this._campRenown(campId);
    if (renown >= 6) return 4;
    if (renown >= 4) return 3;
    if (renown >= 2) return 2;
    return 1;
  }

  _campTierName(campId) {
    const t = this._campTier(campId);
    if (t >= 4) return "Stronghold";
    if (t >= 3) return "Keep";
    if (t >= 2) return "Camp";
    return "Outpost";
  }

  _terrainNoise(x, y) {
    const s1 = this._valueNoise(x * 0.0018, y * 0.0018, this.seed);
    const s2 = this._valueNoise(x * 0.0045, y * 0.0045, this.seed + 19) * 0.45;
    const s3 = this._valueNoise(x * 0.0100, y * 0.0100, this.seed + 101) * 0.18;
    return s1 + s2 + s3 - 0.5;
  }

  _riverField(x, y) {
    const bend =
      Math.sin((x + this.seed * 0.10) * 0.00105) * 340 +
      Math.sin((x - this.seed * 0.05) * 0.00195) * 170 +
      Math.sin((x + this.seed * 0.02) * 0.00390) * 60;

    const centerY = bend;
    const d = Math.abs(y - centerY);
    return d / 300;
  }

  _lakeField(x, y) {
    const a = this._valueNoise(x * 0.00072, y * 0.00072, this.seed + 1201);
    const b = this._valueNoise(x * 0.00185, y * 0.00185, this.seed + 1202);
    const c = this._valueNoise(x * 0.00480, y * 0.00480, this.seed + 1203) * 0.22;
    return Math.abs(a * 0.62 + b * 0.38 + c - 0.50);
  }

  _macroBiomeValue(x, y) {
    return (
      this._valueNoise(x * 0.00022, y * 0.00022, this.seed + 501) * 0.60 +
      this._valueNoise(x * 0.00055, y * 0.00055, this.seed + 502) * 0.28 +
      this._valueNoise(x * 0.00110, y * 0.00110, this.seed + 503) * 0.12
    );
  }

  _macroHeatValue(x, y) {
    return (
      this._valueNoise(x * 0.00018, y * 0.00018, this.seed + 601) * 0.70 +
      this._valueNoise(x * 0.00072, y * 0.00072, this.seed + 602) * 0.30
    );
  }

  _macroDryValue(x, y) {
    return (
      this._valueNoise(x * 0.00026, y * 0.00026, this.seed + 701) * 0.65 +
      this._valueNoise(x * 0.00086, y * 0.00086, this.seed + 702) * 0.35
    );
  }

  _valueNoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const a = this._hashFloat(xi, yi, seed);
    const b = this._hashFloat(xi + 1, yi, seed);
    const c = this._hashFloat(xi, yi + 1, seed);
    const d = this._hashFloat(xi + 1, yi + 1, seed);

    const ux = xf * xf * (3 - 2 * xf);
    const uy = yf * yf * (3 - 2 * yf);

    const ab = lerpNum(a, b, ux);
    const cd = lerpNum(c, d, ux);
    return lerpNum(ab, cd, uy);
  }

  _hashFloat(x, y, seed) {
    const h = hash2(x | 0, y | 0, seed | 0) >>> 0;
    return (h % 100000) / 100000;
  }

  _groundColor(zone, x, y, cx, cy) {
    const alt = Math.abs(hash2((x / 32) | 0, (y / 32) | 0, this.seed + 66)) % 18;
    const macroWiggle = this._valueNoise(cx * 0.0022, cy * 0.0022, this.seed + 811);

    if (zone === "Unknown") {
      return alt < 6 ? "#494941" : alt < 12 ? "#54554a" : macroWiggle > 0.62 ? "#5a5c50" : "#4d4f46";
    }
    if (zone === "Whisper Grass") return alt < 6 ? "#5f9a59" : alt < 12 ? "#679f61" : macroWiggle > 0.6 ? "#6ea86a" : "#73aa6c";
    if (zone === "Old Road") return alt < 6 ? "#8b845f" : alt < 12 ? "#948c68" : macroWiggle > 0.6 ? "#9b936e" : "#9d9572";
    if (zone === "Stone Flats") return alt < 6 ? "#7b876f" : alt < 12 ? "#869177" : macroWiggle > 0.6 ? "#8d9880" : "#909a80";
    if (zone === "High Meadow") return alt < 6 ? "#73ad63" : alt < 12 ? "#7cb56b" : macroWiggle > 0.6 ? "#82ba72" : "#86bd74";
    if (zone === "Ash Fields") return alt < 6 ? "#7e7a67" : alt < 12 ? "#87836f" : macroWiggle > 0.6 ? "#8c8875" : "#908b78";
    if (zone === "Pine Verge") return alt < 6 ? "#547d4e" : alt < 12 ? "#5c8555" : macroWiggle > 0.6 ? "#60895a" : "#648d5d";
    if (zone === "Camp Grounds") return alt < 6 ? "#8b7d58" : alt < 12 ? "#958764" : "#9e906e";
    if (zone === "Ruin Approach") return alt < 6 ? "#706a60" : alt < 12 ? "#7a7468" : "#847d72";
    if (zone === "Waystone Rise") return alt < 6 ? "#6d8a73" : alt < 12 ? "#76947c" : "#7f9d85";
    if (zone === "Shoreline") return alt < 6 ? "#8f9368" : alt < 12 ? "#989d72" : "#a2a67c";
    if (zone === "Riverbank") return alt < 6 ? "#6f9b65" : alt < 12 ? "#78a46d" : "#82ad76";

    return alt < 6 ? "#69995d" : alt < 12 ? "#72a265" : "#7bac6e";
  }

  _miniGroundColor(zone) {
    if (zone === "Unknown") return "#4f5148";
    if (zone === "Whisper Grass") return "#679f61";
    if (zone === "Old Road") return "#948c68";
    if (zone === "Stone Flats") return "#869177";
    if (zone === "High Meadow") return "#7cb56b";
    if (zone === "Ash Fields") return "#87836f";
    if (zone === "Pine Verge") return "#5c8555";
    if (zone === "Camp Grounds") return "#958764";
    if (zone === "Ruin Approach") return "#7a7468";
    if (zone === "Waystone Rise") return "#76947c";
    if (zone === "Shoreline") return "#989d72";
    if (zone === "Riverbank") return "#78a46d";
    return "#72a265";
  }

  _nearestPOI(x, y, arr) {
    let best = null;
    let bestD = Infinity;
    for (const p of arr) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

function clampLocal(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pointInView(x, y, vb, pad = 0) {
  return x >= vb.x0 - pad && x <= vb.x1 + pad && y >= vb.y0 - pad && y <= vb.y1 + pad;
}

function segmentIntersectsView(x1, y1, x2, y2, vb) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < vb.x0 || minX > vb.x1 || maxY < vb.y0 || minY > vb.y1) return false;
  return true;
}