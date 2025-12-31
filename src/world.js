// src/world.js
// v30: restore docks + sailing support + keep improved visuals.
// Water rules:
// - Walking: land only (ocean + river are blocked)
// - Sailing: water only (land blocked)
// Dock-only boarding/disembark happens in game.js, using nearestDock/isNearDock.
//
// Public API used across game:
// - terrainAt(x,y) -> { ocean, biome, height }
// - biomeAt(x,y), biomeColor(biomeName)
// - isOcean/isRiver/isWater/isLand
// - canWalk/canSail
// - nearestDock/isNearDock
// - nearestWaystone
// - projectileHitsSolid
// - draw(ctx,t,view)
// - drawMinimap(ctx,x,y,w,h,heroX,heroY)

import { RNG, clamp, fbm, dist2, lerp, hash01 } from "./util.js";

/* ============================
   Small helpers
   ============================ */
function rgb(r, g, b) { return `rgb(${r|0},${g|0},${b|0})`; }

function parseColor(c) {
  if (!c || typeof c !== "string") return { r: 0, g: 0, b: 0 };
  if (c[0] === "#") {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return { r: Number.isFinite(r) ? r : 0, g: Number.isFinite(g) ? g : 0, b: Number.isFinite(b) ? b : 0 };
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map(s => parseFloat(s.trim()));
    const r = parts[0] ?? 0, g = parts[1] ?? 0, b = parts[2] ?? 0;
    return { r: Number.isFinite(r) ? r : 0, g: Number.isFinite(g) ? g : 0, b: Number.isFinite(b) ? b : 0 };
  }
  return { r: 0, g: 0, b: 0 };
}

function mix(c1, c2, t) {
  const a = parseColor(c1);
  const b = parseColor(c2);
  return rgb(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

function shade(c, amt) {
  const col = parseColor(c);
  return rgb(clamp(col.r + amt, 0, 255), clamp(col.g + amt, 0, 255), clamp(col.b + amt, 0, 255));
}

function softShadow(ctx, x, y, rx, ry, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y, t, a = 1) {
  const s = (Math.sin(t * 10) * 0.5 + 0.5) * a;
  ctx.save();
  ctx.globalAlpha = 0.12 + s * 0.28;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x + 4, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.stroke();
  ctx.restore();
}

function makeWaystoneName(rng, index) {
  const prefixes = ["Ancient", "Forgotten", "Shattered", "Silent", "Stormbound", "Ember", "Frost", "Sunken", "Iron", "Runed"];
  const cores = ["Waystone", "Obelisk", "Monolith", "Beacon", "Pillar", "Spire"];
  const suffixes = ["of Ash", "of Tides", "of Dawn", "of Dusk", "of Echoes", "of Kings", "of Exiles", "of Broken Oaths"];
  const p = prefixes[rng.int(0, prefixes.length - 1)];
  const c = cores[rng.int(0, cores.length - 1)];
  const s = rng.float() > 0.6 ? " " + suffixes[rng.int(0, suffixes.length - 1)] : "";
  return `${p} ${c}${s} #${index + 1}`;
}

/* ============================
   World
   ============================ */
export class World {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;

    // world extents
    this.width = 9000;
    this.height = 5200;

    this.seed = Math.floor(100000 + Math.random() * 900000);
    this.rng = new RNG(this.seed);
    this._t = 0;

    // River: center channel around nx=0.5
    this.river = { cx: 0.5, w: 0.085, meander: 0.012 };

    // Spawn on land near center
    const s = this.findNearestLand(this.width * 0.52, this.height * 0.58);
    this.spawn = { x: s.x, y: s.y };

    // Waystones
    this.waystones = [];
    this._makeWaystones();

    // Docks (visible + consistent). These are SHORE docks near the ocean channel.
    this.docks = [];
    this._makeDocks();

    // Scatter seed (stable)
    this._scatterSeed = this.seed * 9973 + 1337;
  }

  setViewSize(w, h) { this.viewW = w; this.viewH = h; }
  update(dt) { this._t += dt; }

  /* ============================
     Core terrain & biome
     ============================ */
  terrainAt(x, y) {
    const nx = x / this.width;
    const ny = y / this.height;

    const n1 = fbm(nx * 3.0 + 10, ny * 3.0 - 7, this.seed + 11, 5);
    const n2 = fbm(nx * 9.5 - 20, ny * 9.5 + 3, this.seed + 77, 3);

    const cx = nx - 0.48;
    const cy = ny - 0.55;
    const radial = Math.sqrt(cx * cx + cy * cy);

    let land = n1 * 0.78 + n2 * 0.22;
    land -= radial * 0.22;

    land += this._islandBump(nx, ny, 0.14, 0.28, 0.14, 0.20);
    land += this._islandBump(nx, ny, 0.82, 0.22, 0.16, 0.18);
    land += this._islandBump(nx, ny, 0.86, 0.70, 0.20, 0.18);
    land += this._islandBump(nx, ny, 0.20, 0.72, 0.20, 0.16);

    // Middle sea channel to encourage docks/sailing
    const channel = Math.exp(-Math.pow((nx - 0.5) / 0.06, 2));
    land -= channel * 0.16;

    const ocean = land < 0.30;

    const heat = fbm(nx * 2.2 + 100, ny * 2.2 - 50, this.seed + 999, 4);
    const wet  = fbm(nx * 2.0 - 33,  ny * 2.0 + 44, this.seed + 444, 4);

    let biome = "grass";
    if (!ocean) {
      if (heat > 0.64 && wet < 0.46) biome = "desert";
      else if (wet > 0.66) biome = "swamp";
      else if (heat < 0.40) biome = "snow";
      else if (wet > 0.55) biome = "forest";
      else biome = "grass";
    }

    // pseudo-height for depth illusion (rolling hills)
    const h0 = fbm(nx * 1.1 + 50, ny * 1.1 - 25, this.seed + 313, 4);
    const hill = (1 - radial) * 0.6 + (h0 - 0.5) * 0.5;
    const height = clamp(hill, 0, 1);

    return { ocean, biome, height, landVal: land, heat, wet };
  }

  biomeAt(x, y) {
    const t = this.terrainAt(x, y);
    const b = t?.biome || "grass";
    if (b === "forest") return "forest";
    if (b === "snow") return "snow";
    if (b === "desert") return "desert";
    if (b === "swamp") return "swamp";
    return "plains";
  }

  biomeColor(b) {
    switch (b) {
      case "desert": return "#c9b27c";
      case "plains": return "#5da35f";
      case "forest": return "#2f6f3a";
      case "snow": return "#cfd7e6";
      case "swamp": return "#3a6a4c";
      default: return "#5da35f";
    }
  }

  /* ============================
     River & water
     ============================ */
  _riverCenterY(nx) {
    const a = fbm(nx * 1.15 + 3.1, 0.0, this.seed + 222, 4);
    const b = fbm(nx * 2.05 - 9.7, 0.0, this.seed + 333, 3);
    const m = (a * 0.7 + b * 0.3) - 0.5;
    return 0.54 + m * this.river.meander;
  }

  isRiver(x, y) {
    const nx = x / this.width;
    const ny = y / this.height;

    const channel = Math.exp(-Math.pow((nx - this.river.cx) / this.river.w, 2));
    if (channel < 0.16) return false;

    const cy = this._riverCenterY(nx);
    const d = Math.abs(ny - cy);
    const rw = 0.018 + (1 - channel) * 0.008;
    return d < rw;
  }

  isOcean(x, y) {
    const t = this.terrainAt(x, y);
    return !!t.ocean;
  }

  isWater(x, y) {
    return this.isOcean(x, y) || this.isRiver(x, y);
  }

  isLand(x, y) {
    return !this.isWater(x, y);
  }

  // walking: land only
  canWalk(x, y) {
    if (x < 20 || y < 20 || x > this.width - 20 || y > this.height - 20) return false;
    if (this.isWater(x, y)) return false;
    return true;
  }

  // sailing: water only (boat cannot go onto land)
  canSail(x, y) {
    if (x < 20 || y < 20 || x > this.width - 20 || y > this.height - 20) return false;
    if (!this.isWater(x, y)) return false;
    return true;
  }

  // for projectiles: ocean blocks, but river does not block
  projectileHitsSolid(x, y) {
    const t = this.terrainAt(x, y);
    if (t.ocean) return true;
    if (this.isRiver(x, y)) return false;

    // rare blockers (rocks/trees)
    const gx = Math.floor(x / 84);
    const gy = Math.floor(y / 84);
    const h = hash01(gx, gy, this._scatterSeed + 777);
    return h > 0.985;
  }

  /* ============================
     Docks
     ============================ */
  _makeDocks() {
    // Create 6 docks along the shores of the sea channel.
    // They are deterministic by seed and forced onto land near ocean.
    const rng = new RNG(this.seed + 8080);

    const docks = [];
    const tries = 2000;

    while (docks.length < 6 && docks.length < tries) {
      const side = rng.float() < 0.5 ? -1 : 1; // left/right shore of channel
      const nx = 0.50 + side * (0.06 + rng.float() * 0.07); // near ocean border of channel
      const ny = 0.22 + rng.float() * 0.62;

      let x = clamp(nx * this.width, 120, this.width - 120);
      let y = clamp(ny * this.height, 120, this.height - 120);

      // shift onto land but close to ocean
      const p = this.findDockSpot(x, y);
      if (!p) continue;

      // de-dupe by distance
      let ok = true;
      for (const d of docks) {
        if (dist2(d.x, d.y, p.x, p.y) < 320 * 320) { ok = false; break; }
      }
      if (!ok) continue;

      docks.push({
        x: p.x,
        y: p.y,
        facing: side, // -1 means faces left/ocean, 1 faces right/ocean (roughly)
        name: rng.float() < 0.5 ? "Old Dock" : "Weathered Dock",
      });
    }

    this.docks = docks;
  }

  // Find a land tile that is adjacent to ocean (shore)
  findDockSpot(x, y) {
    const step = 24;
    for (let r = 0; r < 500; r += step) {
      for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const px = clamp(x + Math.cos(a) * r, 80, this.width - 80);
        const py = clamp(y + Math.sin(a) * r, 80, this.height - 80);

        if (!this.canWalk(px, py)) continue;

        // must be near ocean, not river
        if (this.isRiver(px, py)) continue;
        if (!this._isOceanNearby(px, py, 140)) continue;

        return { x: px, y: py };
      }
    }
    return null;
  }

  _isOceanNearby(x, y, r) {
    const step = 50;
    for (let yy = -1; yy <= 1; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        const px = clamp(x + xx * step, 40, this.width - 40);
        const py = clamp(y + yy * step, 40, this.height - 40);
        if (dist2(x, y, px, py) > r * r) continue;
        if (this.isOcean(px, py)) return true;
      }
    }
    return false;
  }

  nearestDock(x, y, r = 80) {
    let best = null;
    let bestD = r * r;
    for (const d of this.docks) {
      const dd = dist2(x, y, d.x, d.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  isNearDock(x, y, r = 80) {
    return !!this.nearestDock(x, y, r);
  }

  /* ============================
     Waystones
     ============================ */
  _makeWaystones() {
    const rng = new RNG(this.seed + 4242);
    const count = 5;

    for (let i = 0; i < count; i++) {
      const x = clamp(this.width * (0.18 + rng.float() * 0.64), 120, this.width - 120);
      const y = clamp(this.height * (0.18 + rng.float() * 0.64), 120, this.height - 120);
      const p = this.findNearestLand(x, y);
      this.waystones.push({
        x: p.x,
        y: p.y,
        activated: i === 0,
        name: makeWaystoneName(rng, i),
      });
    }
  }

  nearestWaystone(x, y, r = 60) {
    let best = null;
    let bestD = r * r;
    for (const w of this.waystones) {
      const d = dist2(x, y, w.x, w.y);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  /* ============================
     Land finding
     ============================ */
  _islandBump(nx, ny, cx, cy, rx, ry) {
    const dx = (nx - cx) / rx;
    const dy = (ny - cy) / ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    const bump = clamp(1 - d, 0, 1);
    return bump * 0.18;
  }

  findNearestLand(x, y) {
    let best = { x, y };
    let bestD = 1e9;
    const step = 40;
    for (let r = 0; r < 600; r += step) {
      for (let a = 0; a < Math.PI * 2; a += 0.25) {
        const px = clamp(x + Math.cos(a) * r, 30, this.width - 30);
        const py = clamp(y + Math.sin(a) * r, 30, this.height - 30);
        if (!this.canWalk(px, py)) continue;
        const d = dist2(x, y, px, py);
        if (d < bestD) { bestD = d; best = { x: px, y: py }; }
      }
      if (bestD < 2400) break;
    }
    return best;
  }

  /* ============================
     Minimap
     ============================ */
  drawMinimap(ctx, x, y, w, h, heroX, heroY) {
    ctx.save();
    ctx.globalAlpha = 0.92;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);

    const step = 10;
    for (let yy = 0; yy < h; yy += step) {
      for (let xx = 0; xx < w; xx += step) {
        const wx = (xx / w) * this.width;
        const wy = (yy / h) * this.height;
        const t = this.terrainAt(wx, wy);

        let c = "#3b8e49";
        if (t.ocean) c = "#0f2a55";
        else if (this.isRiver(wx, wy)) c = "#3f86cf";
        else if (t.biome === "forest") c = "#2f6f3a";
        else if (t.biome === "snow") c = "#cfd7e6";
        else if (t.biome === "desert") c = "#c9b27c";
        else if (t.biome === "swamp") c = "#3a6a4c";

        ctx.fillStyle = c;
        ctx.fillRect(x + xx, y + yy, step, step);
      }
    }

    // docks
    for (const d of this.docks) {
      ctx.fillStyle = "rgba(220,170,110,0.95)";
      ctx.fillRect(x + (d.x / this.width) * w - 2, y + (d.y / this.height) * h - 2, 4, 4);
    }

    // waystones
    for (const ws of this.waystones) {
      ctx.fillStyle = ws.activated ? "rgba(255,220,160,0.95)" : "rgba(140,160,200,0.85)";
      ctx.fillRect(x + (ws.x / this.width) * w - 2, y + (ws.y / this.height) * h - 2, 4, 4);
    }

    // hero
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(x + (heroX / this.width) * w - 2, y + (heroY / this.height) * h - 2, 4, 4);

    ctx.restore();
  }

  /* ============================
     World draw (better visuals, less blocky)
     ============================ */
  draw(ctx, t, view) {
    const STEP = 36; // smaller looks less blocky; still fast
    const PAD = 160;

    const x0 = Math.floor((view.x - PAD) / STEP) * STEP;
    const y0 = Math.floor((view.y - PAD) / STEP) * STEP;
    const x1 = view.x + view.w + PAD;
    const y1 = view.y + view.h + PAD;

    for (let y = y0; y <= y1; y += STEP) {
      for (let x = x0; x <= x1; x += STEP) {
        const wx = clamp(x + STEP * 0.5, 0, this.width);
        const wy = clamp(y + STEP * 0.5, 0, this.height);

        const terr = this.terrainAt(wx, wy);

        if (terr.ocean) this._drawOcean(ctx, x, y, STEP, wx, wy, t);
        else this._drawLand(ctx, x, y, STEP, wx, wy, terr, t);

        // slight “grain” to break tile feel
        const h = hash01(Math.floor(wx / 40), Math.floor(wy / 40), this._scatterSeed + 202);
        if (h > 0.92) {
          ctx.save();
          ctx.globalAlpha = 0.06;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x + (h * 7 % 1) * STEP, y + (h * 13 % 1) * STEP, 2, 2);
          ctx.restore();
        }
      }
    }

    // draw docks + waystones on top
    for (const d of this.docks) drawDock(ctx, d.x, d.y, d.facing, t);
    for (const ws of this.waystones) drawWaystone(ctx, ws.x, ws.y, ws.activated, t);

    // subtle sparkle near activated waystones
    for (const ws of this.waystones) {
      if (!ws.activated) continue;
      if (Math.sin(t * 1.2 + (ws.x + ws.y) * 0.001) > 0.92) sparkle(ctx, ws.x + 18, ws.y - 22, t + ws.x * 0.0003, 0.8);
    }
  }

  _drawOcean(ctx, x, y, s, wx, wy, t) {
    const nx = wx / this.width;

    const deep = "#0b1a35";
    const mid = "#102850";
    const shallow = "#17396b";

    const n = fbm(wx / 820 + 10, wy / 820 - 10, this.seed + 909, 2);
    const depth = clamp(0.25 + (1 - Math.abs(nx - 0.5)) * 0.25 + (n - 0.5) * 0.25, 0, 1);

    const base = mix(deep, mid, depth);
    ctx.fillStyle = base;
    ctx.fillRect(x, y, s, s);

    const wv = Math.sin(t * 1.25 + (wx + wy) * 0.0025) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.10 + wv * 0.10;
    ctx.fillStyle = shallow;
    ctx.fillRect(x, y + s * (0.18 + wv * 0.18), s, s * 0.10);
    ctx.restore();

    // glints
    if (hash01(Math.floor(wx / 120), Math.floor(wy / 120), this.seed + 111) > 0.92) {
      ctx.save();
      ctx.globalAlpha = 0.10 + wv * 0.10;
      ctx.fillStyle = "rgba(180,220,255,0.22)";
      ctx.fillRect(x + s * 0.20, y + s * 0.20, s * 0.60, 2);
      ctx.restore();
    }
  }

  _drawLand(ctx, x, y, s, wx, wy, terr, t) {
    let a = "#4aa055", b = "#3b8e49", c = "#6ab36c";
    if (terr.biome === "forest") { a = "#2f7a3f"; b = "#246a35"; c = "#3b8a4a"; }
    if (terr.biome === "desert") { a = "#c3ad74"; b = "#b59b60"; c = "#d2c08c"; }
    if (terr.biome === "snow")   { a = "#cfd7e6"; b = "#bfc7d6"; c = "#e6eefc"; }
    if (terr.biome === "swamp")  { a = "#3a6a4c"; b = "#2f5f43"; c = "#4b7a57"; }

    const patch = fbm(wx / 950 + 2.7, wy / 950 - 1.9, this.seed + 707, 3);
    const patchT = clamp(patch, 0, 1);
    const micro = fbm(wx / 260 + 1.7, wy / 260 - 2.2, this.seed + 555, 3);
    const microAmt = (micro - 0.5) * 26;

    const heightShade = ((terr.height || 0.5) - 0.5) * 34;

    // darken near shore by sampling ocean neighbors
    const shore = this._shoreFactor(wx, wy);

    let base = mix(a, c, patchT);
    base = shade(base, microAmt * 0.55 + heightShade - shore * 22);

    // river overlay
    const river = this.isRiver(wx, wy);

    ctx.fillStyle = base;
    ctx.fillRect(x, y, s, s);

    // rim light (top-left)
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.fillRect(x, y, s, 2);
    ctx.fillRect(x, y, 2, s);
    ctx.restore();

    // river paint
    if (river) {
      const wave = Math.sin(t * 1.2 + (wx + wy) * 0.003) * 0.5 + 0.5;

      ctx.save();
      ctx.globalAlpha = 0.90;
      ctx.fillStyle = "#3f86cf";
      ctx.fillRect(x, y, s, s);

      ctx.globalAlpha = 0.18 + wave * 0.12;
      ctx.fillStyle = "rgba(210,245,255,0.55)";
      ctx.fillRect(x, y + s * (0.25 + wave * 0.10), s, s * 0.10);

      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x, y + s * 0.06, s, 2);
      ctx.fillRect(x, y + s * 0.92, s, 2);
      ctx.restore();
    }

    // scatter detail (tufts/rocks/trees)
    this._scatter(ctx, x, y, s, wx, wy, terr, t, shore, river);
  }

  _shoreFactor(wx, wy) {
    const step = 90;
    let oceanNear = 0;
    for (let yy = -1; yy <= 1; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        if (xx === 0 && yy === 0) continue;
        const px = clamp(wx + xx * step, 60, this.width - 60);
        const py = clamp(wy + yy * step, 60, this.height - 60);
        if (this.isOcean(px, py)) oceanNear = Math.max(oceanNear, 1 - (Math.abs(xx) + Math.abs(yy)) * 0.2);
      }
    }
    return clamp(oceanNear, 0, 1);
  }

  _scatter(ctx, x, y, s, wx, wy, terr, t, shore, river) {
    const gx = Math.floor(wx / 84);
    const gy = Math.floor(wy / 84);
    const h = hash01(gx, gy, this._scatterSeed);

    const density = clamp(1 - shore * 0.9 - (river ? 0.85 : 0), 0, 1);

    // rocks
    if (h > 0.972 && density > 0.25 && terr.biome !== "snow") {
      const rx = x + (h * 97 % 1) * s;
      const ry = y + (h * 41 % 1) * s;
      drawRock(ctx, rx, ry, 9 + (h * 19 % 1) * 10);
    }

    // tufts (plains/forest/swamp/desert)
    if (h > 0.78 && h < 0.93 && density > 0.12 && !river) {
      const tx = x + (h * 13 % 1) * s;
      const ty = y + (h * 29 % 1) * s;
      const amt = 1 + ((h * 101) | 0) % 3;
      for (let i = 0; i < amt; i++) drawTuft(ctx, tx + i * 4, ty + (i % 2) * 2, terr.biome);
    }

    // trees in forest
    if (terr.biome === "forest" && h > 0.90 && density > 0.20 && !river) {
      const tx = x + (h * 67 % 1) * s;
      const ty = y + (h * 23 % 1) * s;
      drawTree(ctx, tx, ty, 1.0 + (h * 11 % 1) * 0.45);
    }

    // snow sparkles
    if (terr.biome === "snow" && h > 0.945 && density > 0.12) sparkle(ctx, x + s * 0.5, y + s * 0.5, t + h * 10, 0.8);
  }
}

/* ============================
   Decorative draw helpers
   ============================ */
function drawRock(ctx, x, y, s) {
  softShadow(ctx, x, y + s * 0.35, s * 0.78, s * 0.35, 0.18);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(55,65,80,0.95)";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.75, s * 0.55, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.10, s * 0.35, s * 0.18, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTuft(ctx, x, y, biome) {
  let c = "rgba(20,80,35,0.85)";
  if (biome === "desert") c = "rgba(150,120,70,0.85)";
  if (biome === "snow") c = "rgba(160,190,210,0.85)";
  if (biome === "swamp") c = "rgba(30,80,60,0.85)";

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 2, y - 6);
  ctx.moveTo(x + 2, y);
  ctx.lineTo(x + 1, y - 7);
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + 6, y - 5);
  ctx.stroke();
  ctx.restore();
}

function drawTree(ctx, x, y, scale) {
  const s = 18 * scale;
  softShadow(ctx, x, y + s * 0.55, s * 0.95, s * 0.45, 0.22);

  ctx.save();
  ctx.translate(x, y);

  // trunk
  ctx.fillStyle = "rgba(92,62,40,0.95)";
  ctx.fillRect(-s * 0.10, s * 0.15, s * 0.20, s * 0.55);

  // canopy
  ctx.fillStyle = "rgba(20,90,45,0.95)";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.85, s * 0.70, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.20;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, -s * 0.18, s * 0.45, s * 0.28, -0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawWaystone(ctx, x, y, active, t) {
  const h = 42;
  const w = 22;

  softShadow(ctx, x, y + 20, 18, 10, 0.22);

  ctx.save();
  ctx.translate(x, y);

  if (active) {
    const pulse = Math.sin(t * 3.2) * 0.5 + 0.5;
    ctx.globalAlpha = 0.16 + pulse * 0.18;
    ctx.fillStyle = "rgba(140,210,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = active ? "rgba(170,210,255,0.92)" : "rgba(140,160,190,0.92)";
  ctx.beginPath();
  // safe rounded rect
  const r = 6;
  ctx.moveTo(-w * 0.5 + r, -h * 0.5);
  ctx.arcTo(w * 0.5, -h * 0.5, w * 0.5, h * 0.5, r);
  ctx.arcTo(w * 0.5, h * 0.5, -w * 0.5, h * 0.5, r);
  ctx.arcTo(-w * 0.5, h * 0.5, -w * 0.5, -h * 0.5, r);
  ctx.arcTo(-w * 0.5, -h * 0.5, w * 0.5, -h * 0.5, r);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(-w * 0.5 + 2, -h * 0.5 + 2, 3, h - 4);

  ctx.globalAlpha = 0.65;
  ctx.fillStyle = active ? "rgba(40,140,220,0.95)" : "rgba(60,80,120,0.9)";
  ctx.fillRect(-2, -10, 4, 20);

  ctx.restore();
}

function drawDock(ctx, x, y, facing, t) {
  // facing: -1 left, +1 right (visual only)
  softShadow(ctx, x, y + 12, 34, 12, 0.20);

  ctx.save();
  ctx.translate(x, y);

  // base planks
  ctx.fillStyle = "rgba(120,85,50,0.95)";
  ctx.fillRect(-28, -6, 56, 12);

  // highlight
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(-28, -6, 56, 2);

  // posts
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(95,65,40,0.95)";
  ctx.fillRect(-24, -10, 6, 24);
  ctx.fillRect(18, -10, 6, 24);

  // rope / little flag
  const bob = Math.sin(t * 2 + x * 0.002) * 0.5 + 0.5;
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(230,220,190,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-21, -8);
  ctx.lineTo(21, -8);
  ctx.stroke();

  ctx.globalAlpha = 0.70;
  ctx.fillStyle = "rgba(220,170,110,0.85)";
  const fx = facing < 0 ? -30 : 30;
  ctx.beginPath();
  ctx.moveTo(fx, -14);
  ctx.lineTo(fx, -6);
  ctx.lineTo(fx + (facing < 0 ? -10 : 10), -10 - bob * 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
