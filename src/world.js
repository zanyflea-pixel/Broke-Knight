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
    this.buildId = "rpg-v126";
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
    this._mapSize = 448;
    this._discoveryExportCache = null;
    this._revealed = null;
    this._riverWaterLimit = 1.42;

    this._spawnSafeRadius = 620;
    this._spawnRoadRadius = 900;
    this._roadWalkRadius = 26;
    this._riverAvoidSpawnRadius = 1650;

    this._riverBands = this._makeRiverBands();

    this._buildPOIs();
    this._buildRoadNetwork();
    this._finalizeBridges();
    this._ensureSpawnSafety();
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

    if (changed) this._discoveryExportCache = null;
    return changed;
  }

  revealAll() {
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
    for (const row of this._mapInfo.revealed || []) row.fill(true);
    this._discoveryExportCache = null;
  }

  exportDiscovery() {
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
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
    if (this._mapDirty || !this._mapInfo) this._buildMapInfo();
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

    return !s.isWater;
  }

  getMoveModifier(x, y) {
    const s = this._sampleCell(x, y);

    if (s.isWater) return 0.92;
    if (s.bridge) return 1.12;
    if (s.road) return 1.18;
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
    const size = 48;

    const left = camera.x - this.viewW * 0.5 - 80;
    const top = camera.y - this.viewH * 0.5 - 80;
    const right = camera.x + this.viewW * 0.5 + 80;
    const bottom = camera.y + this.viewH * 0.5 + 80;

    const startX = Math.floor(left / size) * size;
    const startY = Math.floor(top / size) * size;

    for (let x = startX; x < right; x += size) {
      for (let y = startY; y < bottom; y += size) {
        const s = this._sampleCell(x, y);

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

        if (!s.isLake) {
          if ((s.river < 0.105 || s.ground < 0.285) && parity % 2 === 0) {
            ctx.fillStyle = "rgba(222,220,170,0.10)";
            ctx.fillRect(x + 2, y + size - 5, size - 4, 2);
          }

          if (s.zone === "forest" || s.zone === "greenwood" || s.zone === "deep wilds") {
            if (parity === 0 || parity === 4) {
              ctx.fillStyle = "rgba(13,23,11,0.18)";
              ctx.beginPath();
              ctx.ellipse(x + 13, y + 23, 11, 4, -0.25, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "rgba(20,55,18,0.25)";
              ctx.beginPath();
              ctx.moveTo(x + 12, y + 6);
              ctx.lineTo(x + 19, y + 21);
              ctx.lineTo(x + 5, y + 21);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = "rgba(118,169,94,0.14)";
              ctx.beginPath();
              ctx.moveTo(x + 11, y + 8);
              ctx.lineTo(x + 14, y + 18);
              ctx.lineTo(x + 6, y + 18);
              ctx.closePath();
              ctx.fill();
            }
          } else if (s.zone === "meadow" || s.zone === "whisper grass") {
            if (parity === 1 || parity === 7) {
              ctx.fillStyle = "rgba(255,255,255,0.04)";
              ctx.fillRect(x + 7, y + 8, 5, 9);
            } else if (parity === 3) {
              ctx.fillStyle = "rgba(48,93,31,0.14)";
              ctx.fillRect(x + 12, y + 11, 4, 7);
            }
          } else if (s.zone === "ashlands" || s.zone === "ash fields") {
            if (parity === 2 || parity === 8) {
              ctx.fillStyle = "rgba(90,70,52,0.24)";
              ctx.fillRect(x + 10, y + 11, 5, 5);
            }
          } else if (s.zone === "mountain" || s.zone === "stone flats") {
            if (parity === 5 || parity === 9) {
              ctx.fillStyle = "rgba(255,255,255,0.05)";
              ctx.fillRect(x + 8, y + 8, 7, 7);
            }
          }
        } else {
          const depth = clamp(1 - s.river * 1.8, 0, 1);
          if (((x / size + y / size) | 0) % 3 === 0) {
            ctx.fillStyle = `rgba(142,211,246,${0.07 + depth * 0.10})`;
            ctx.fillRect(x + 3, y + 7, size - 6, 2);
          }
        }
      }
    }

    this._drawWorldAtmosphere(ctx, left, top, right, bottom);
    this._drawRiverOverlays(ctx, left, top, right, bottom);
    this._drawBridges(ctx, left, top, right, bottom);
    this._drawRoads(ctx);
    this._drawPOIs(ctx);
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
    }

    for (const w of this.waystones) {
      const pulse = 1 + Math.sin(tNow * 2.1 + w.id) * 0.08;
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
    }

    for (const d of this.dungeons) {
      const pulse = 1 + Math.sin(tNow * 1.7 + d.id) * 0.07;
      this._drawDropShadow(ctx, d.x, d.y + 11, 23, 8, 0.32);
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
    }

    for (const c of this.caches) {
      const shine = Math.max(0, Math.sin(tNow * 2.8 + c.id));
      this._drawDropShadow(ctx, c.x, c.y + 3, 13, 5, 0.24);
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
    }

    for (const lair of this.dragonLairs) {
      const pulse = 1 + Math.sin(tNow * 1.45 + lair.id) * 0.06;
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
      ctx.fillStyle = "#ffb06e";
      ctx.fillRect(lair.x - 3, lair.y - 3, 6, 12);
    }
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
      isLake,
      isRiver,
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

    let zone = "meadow";
    let color = "#6aa04f";

    if (isWater) {
      zone = "river";
      const confluence = this._nearRiverConfluence(x, y);
      color = confluence ? "#216fa9" : river < this._riverWaterLimit ? (river < 0.78 ? "#2477b1" : "#2f86bd") : "#2c6a9a";
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
    const ground = this._groundAt(x, y);
    const river = this._riverAt(x, y);

    const sx = x - this.spawn.x;
    const sy = y - this.spawn.y;
    const spawnDist = Math.hypot(sx, sy);

    let isWater = ground < 0.245 || river < this._riverWaterLimit;
    if (spawnDist < this._spawnSafeRadius && river >= this._riverWaterLimit) isWater = false;

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
