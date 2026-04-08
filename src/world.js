// src/world.js
// v77 WORLD VISUAL EVOLUTION FOR CAMP TIERS (FULL FILE)

import { hash2, RNG } from "./util.js";

export default class World {
  constructor(seed = 1, opts = {}) {
    this.seed = seed | 0;
    this.viewW = opts.viewW || 960;
    this.viewH = opts.viewH || 540;

    this.tile = 32;
    this.boundsRadius = 5200;

    this.spawn = { x: 0, y: 0 };
    this.mapMode = "small";

    this.camps = [];
    this.docks = [];
    this.waystones = [];
    this.dungeons = [];

    this._miniCanvas = document.createElement("canvas");
    this._miniCanvas.width = 220;
    this._miniCanvas.height = 220;
    this._miniDirty = true;

    this._zoneCache = new Map();

    this._generatePOIs();
    this.spawn = this._findSafeLandPatchNear(0, 0, 420) || { x: 0, y: 0 };
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
    void hero;
  }

  /* ===========================
     WORLD QUERIES
  =========================== */

  isWater(x, y) {
    const n = this._terrainNoise(x, y);
    const river = this._riverField(x, y);
    return n < -0.16 || river < 0.09;
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
    if (biome === "High Meadow") return 1.04;
    if (biome === "Old Road") return 1.08;
    if (biome === "Stone Flats") return 0.98;
    if (biome === "Whisper Grass") return 0.96;
    if (biome === "Ash Fields") return 0.93;

    return 1;
  }

  getZoneName(x, y) {
    const kx = ((x / 180) | 0);
    const ky = ((y / 180) | 0);
    const key = `${kx},${ky}`;
    if (this._zoneCache.has(key)) return this._zoneCache.get(key);

    const h = Math.abs(hash2(kx, ky, this.seed)) % 1000;
    let name = "Green Reach";

    if (this._isNearCamp(x, y, 220)) name = "Camp Grounds";
    else if (this._isNearDungeon(x, y, 240)) name = "Ruin Approach";
    else if (this._isNearDock(x, y, 220)) name = "Shoreline";
    else if (this._isNearWaystone(x, y, 220)) name = "Waystone Rise";
    else if (this._isNearWater(x, y, 90)) name = "Riverbank";
    else if (h < 130) name = "Whisper Grass";
    else if (h < 250) name = "Old Road";
    else if (h < 390) name = "Stone Flats";
    else if (h < 540) name = "High Meadow";
    else if (h < 700) name = "Ash Fields";
    else if (h < 860) name = "Pine Verge";
    else name = "Green Reach";

    this._zoneCache.set(key, name);
    return name;
  }

  _isNearWater(x, y, r = 64) {
    const step = Math.max(12, (r / 3) | 0);
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

  /* ===========================
     POI GENERATION
  =========================== */

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

  /* ===========================
     DRAW
  =========================== */

  draw(ctx, camera) {
    const vb = this._viewBounds(camera);

    this._drawGround(ctx, vb);
    this._drawWater(ctx, vb);
    this._drawRoadHints(ctx, vb);
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
        const water = this.isWater(x + t * 0.5, y + t * 0.5);
        if (water) continue;

        const zone = this.getZoneName(x, y);
        ctx.fillStyle = this._groundColor(zone, x, y);
        ctx.fillRect(x, y, t + 1, t + 1);

        const n = Math.abs(hash2((x / t) | 0, (y / t) | 0, this.seed + 66)) % 100;
        if (n < 8) this._drawGrassTuft(ctx, x + 10, y + 22);
        else if (n > 94) this._drawPebble(ctx, x + 16, y + 18);
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
        if (!this.isWater(x + t * 0.5, y + t * 0.5)) continue;

        const n = this._terrainNoise(x, y);
        ctx.fillStyle = n < -0.28 ? "#2b6ba0" : "#3d84b8";
        ctx.fillRect(x, y, t + 1, t + 1);

        const foam = Math.abs(hash2((x / t) | 0, (y / t) | 0, 9182)) % 100;
        if (foam < 14) {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(x + 4, y + 6, 12, 2);
          ctx.fillRect(x + 16, y + 18, 8, 2);
        }
      }
    }
  }

  _drawRoadHints(ctx, vb) {
    const camps = this.camps;
    const ways = this.waystones;

    ctx.save();
    ctx.strokeStyle = "rgba(194,170,120,0.14)";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";

    for (const c of camps) {
      const nearestWay = this._nearestPOI(c.x, c.y, ways);
      if (!nearestWay) continue;
      if (!segmentIntersectsView(c.x, c.y, nearestWay.x, nearestWay.y, vb)) continue;

      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(nearestWay.x, nearestWay.y);
      ctx.stroke();
    }

    ctx.restore();
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

    if (tier === 1) {
      this._drawCampOutpost(ctx, camp, scale);
    } else if (tier === 2) {
      this._drawCampTier2(ctx, camp, scale);
    } else if (tier === 3) {
      this._drawCampTier3(ctx, camp, scale);
    } else {
      this._drawCampTier4(ctx, camp, scale);
    }

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
    void camp;
  }

  _drawCampTier2(ctx, camp, scale) {
    this._drawTent(ctx, -26 * scale, 2 * scale, 0.94 * scale, "#be8d58");
    this._drawTent(ctx, 24 * scale, 4 * scale, 0.88 * scale, "#b8844c");
    this._drawCampfire(ctx, 0, 8 * scale, 1.1, false);
    this._drawCrate(ctx, -2 * scale, 24 * scale, 1.1);
    this._drawBanner(ctx, -36 * scale, -6 * scale, "#b8d987", 1.0);
    this._drawBanner(ctx, 36 * scale, -4 * scale, "#87c0d9", 1.0);
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

  /* ===========================
     MINIMAP
  =========================== */

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

    const span = this.mapMode === "large"
      ? Math.max(8000, this.boundsRadius * 2)
      : Math.max(4000, this.boundsRadius);

    const half = span * 0.5;

    for (let py = 0; py < h; py += 2) {
      for (let px = 0; px < w; px += 2) {
        const wx = (px / w) * span - half;
        const wy = (py / h) * span - half;
        const water = this.isWater(wx, wy);

        if (water) ctx.fillStyle = "#356e9c";
        else {
          const zone = this.getZoneName(wx, wy);
          ctx.fillStyle = this._miniGroundColor(zone);
        }

        ctx.fillRect(px, py, 2, 2);
      }
    }

    for (const c0 of this.camps) {
      this._miniPoint(ctx, c0.x, c0.y, span, "#f3c46e", 3);
    }
    for (const w0 of this.waystones) {
      this._miniPoint(ctx, w0.x, w0.y, span, "#bde4ff", 2.5);
    }
    for (const d0 of this.docks) {
      this._miniPoint(ctx, d0.x, d0.y, span, "#d6c3a1", 2.5);
    }
    for (const dg of this.dungeons) {
      this._miniPoint(ctx, dg.x, dg.y, span, "#ff9f87", 3);
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

  /* ===========================
     CAMP TIERS
  =========================== */

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

  /* ===========================
     NOISE / COLORS
  =========================== */

  _terrainNoise(x, y) {
    const s1 = this._valueNoise(x * 0.0018, y * 0.0018, this.seed);
    const s2 = this._valueNoise(x * 0.0045, y * 0.0045, this.seed + 19) * 0.45;
    const s3 = this._valueNoise(x * 0.0100, y * 0.0100, this.seed + 101) * 0.18;
    return s1 + s2 + s3 - 0.5;
  }

  _riverField(x, y) {
    const bend = Math.sin((x + this.seed * 0.1) * 0.00125) * 260;
    const bend2 = Math.sin((x - this.seed * 0.08) * 0.0021) * 140;
    const centerY = bend + bend2;
    const d = Math.abs(y - centerY);
    return d / 220;
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

  _groundColor(zone, x, y) {
    const alt = Math.abs(hash2((x / 32) | 0, (y / 32) | 0, this.seed + 66)) % 12;

    if (zone === "Whisper Grass") return alt < 6 ? "#5f9a59" : "#679f61";
    if (zone === "Old Road") return alt < 6 ? "#8b845f" : "#948c68";
    if (zone === "Stone Flats") return alt < 6 ? "#7b876f" : "#869177";
    if (zone === "High Meadow") return alt < 6 ? "#73ad63" : "#7cb56b";
    if (zone === "Ash Fields") return alt < 6 ? "#7e7a67" : "#87836f";
    if (zone === "Pine Verge") return alt < 6 ? "#547d4e" : "#5c8555";
    if (zone === "Camp Grounds") return alt < 6 ? "#8b7d58" : "#958764";
    if (zone === "Ruin Approach") return alt < 6 ? "#706a60" : "#7a7468";
    if (zone === "Waystone Rise") return alt < 6 ? "#6d8a73" : "#76947c";
    if (zone === "Shoreline") return alt < 6 ? "#8f9368" : "#989d72";
    if (zone === "Riverbank") return alt < 6 ? "#6f9b65" : "#78a46d";

    return alt < 6 ? "#69995d" : "#72a265";
  }

  _miniGroundColor(zone) {
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

/* ===========================
   HELPERS
=========================== */

function lerpNum(a, b, t) {
  return a + (b - a) * t;
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