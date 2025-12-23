// src/world.js
import { RNG, clamp, fbm, dist2, lerp } from "./util.js";

/* ============================
   WAYSTONE NAME GENERATOR
   ============================ */
function makeWaystoneName(rng, index) {
  const prefixes = [
    "Ancient", "Forgotten", "Shattered", "Silent", "Stormbound",
    "Ember", "Frost", "Sunken", "Iron", "Runed"
  ];
  const cores = ["Waystone", "Obelisk", "Monolith", "Beacon", "Pillar", "Spire"];
  const suffixes = [
    "of Ash", "of Tides", "of Dawn", "of Dusk",
    "of Echoes", "of Kings", "of Exiles", "of Broken Oaths"
  ];

  const p = prefixes[rng.int(0, prefixes.length - 1)];
  const c = cores[rng.int(0, cores.length - 1)];
  const s = rng.float() > 0.6 ? " " + suffixes[rng.int(0, suffixes.length - 1)] : "";
  return `${p} ${c}${s} #${index + 1}`;
}

export class World {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;

    // Huge open world
    this.width = 9000;
    this.height = 5200;

    // Seed controls the whole world
    this.seed = 9137221;
    this.rng = new RNG(this.seed);

    // Ocean animation timer
    this._t = 0;

    // --- IMPORTANT: pick a spawn that is DEFINITELY on land ---
    // (Your old spawn coordinates can end up in ocean if the land threshold is off.)
    const desired = { x: 1200, y: 2900 };
    this.spawn = this.findNearestLand(desired.x, desired.y);

    // Teleport waystones
    this.waystones = this.generateWaystones(18);

    // Ports / docks (for sailing)
    this.docks = this.generateDocks(10);

    // POIs
    this.pois = this.generatePOIs(90);
  }

  setViewSize(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  update(dt) {
    this._t += dt;
  }

  /* ============================
     TERRAIN
     ============================ */

  terrainAt(x, y) {
    // Normalize
    const nx = x / this.width;
    const ny = y / this.height;

    // Base “continent” noise (0..1-ish)
    const n1 = fbm(nx * 3.0 + 10, ny * 3.0 - 7, this.seed + 11, 5);
    const n2 = fbm(nx * 9.5 - 20, ny * 9.5 + 3, this.seed + 77, 3);

    // Shape falloff to get coastlines
    const cx = nx - 0.48;
    const cy = ny - 0.55;
    const radial = Math.sqrt(cx * cx + cy * cy);

    // Land mask
    let land = n1 * 0.78 + n2 * 0.22;

    // Slight uplift so we actually get continents with this noise setup
    land += 0.10;

    // Coast falloff
    land -= radial * 0.50;

    // Island arcs you must sail to
    land += this.islandBump(x, y, 1200, 1200, 650, 0.22);
    land += this.islandBump(x, y, 1700, 800, 520, 0.18);
    land += this.islandBump(x, y, this.width - 1200, 1300, 750, 0.24);
    land += this.islandBump(x, y, this.width - 1700, 900, 560, 0.19);
    land += this.islandBump(x, y, this.width - 900, 2100, 520, 0.16);

    // Sea channel through the middle
    const channel = Math.exp(-Math.pow((nx - 0.5) / 0.06, 2));
    land -= channel * 0.16;

    // ✅ THE FIX: lower the ocean cutoff so we don’t get “all ocean”
    // With your noise+falloff, 0.38 can be too high → everything becomes ocean.
    const ocean = land < 0.30;

    // Biomes on land
    const heat = fbm(nx * 2.2 + 100, ny * 2.2 - 50, this.seed + 999, 4);
    const wet = fbm(nx * 2.0 - 33, ny * 2.0 + 44, this.seed + 444, 4);

    let biome = "grass";
    if (!ocean) {
      if (heat > 0.64 && wet < 0.46) biome = "desert";
      else if (wet > 0.66) biome = "swamp";
      else if (heat < 0.42) biome = "highland";
      else if (wet > 0.56) biome = "forest";
      else biome = "grass";
    } else biome = "ocean";

    return { ocean, biome, landVal: land };
  }

  islandBump(x, y, ix, iy, r, amt) {
    const d = Math.sqrt(dist2(x, y, ix, iy));
    const t = clamp(1 - d / r, 0, 1);
    return t * t * amt;
  }

  // Finds a guaranteed land point near the requested location.
  // This prevents spawning in ocean and also prevents “map empty” starts.
  findNearestLand(x, y) {
    // if already land, good
    if (!this.terrainAt(x, y).ocean) return { x, y };

    // expanding ring search
    const step = 80;
    const maxR = 2200;
    for (let r = step; r <= maxR; r += step) {
      const samples = Math.max(16, Math.floor((Math.PI * 2 * r) / 140));
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const px = clamp(x + Math.cos(a) * r, 60, this.width - 60);
        const py = clamp(y + Math.sin(a) * r, 60, this.height - 60);
        const T = this.terrainAt(px, py);
        if (!T.ocean) return { x: px, y: py };
      }
    }

    // absolute fallback: scan a handful of random points
    const rng = new RNG(this.seed ^ 0xBEEF);
    for (let k = 0; k < 5000; k++) {
      const px = rng.float() * this.width;
      const py = rng.float() * this.height;
      if (!this.terrainAt(px, py).ocean) return { x: px, y: py };
    }

    // If somehow everything fails (should not), return center-ish
    return { x: this.width * 0.5, y: this.height * 0.5 };
  }

  /* ============================
     RIVER + BRIDGES
     ============================ */

  riverSignedDistance(x, y) {
    const y0 = 1900, y1 = 4200;
    if (y < y0 || y > y1) return 99999;

    const tt = (y - y0) / (y1 - y0);
    const cx = 4200 + Math.sin(y * 0.002) * 220 + Math.sin(y * 0.0008) * 380;
    const width = lerp(60, 140, tt * tt);
    return x - cx;
  }

  isInRiver(x, y) {
    const sd = this.riverSignedDistance(x, y);
    if (sd === 99999) return false;

    const y0 = 1900, y1 = 4200;
    const tt = clamp((y - y0) / (y1 - y0), 0, 1);
    const width = lerp(60, 140, tt * tt);
    return Math.abs(sd) < width;
  }

  getBridges() {
    return [
      { x: 4200 - 120, y: 2550, w: 240, h: 90 },
      { x: 4200 - 140, y: 3150, w: 280, h: 100 },
      { x: 4200 - 110, y: 3850, w: 220, h: 90 },
    ];
  }

  isOnAnyBridge(x, y) {
    for (const b of this.getBridges()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  /* ============================
     COLLISION RULES
     ============================ */

  isNearDock(x, y) {
    for (const d of this.docks) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return true;
    }
    return false;
  }

  pointIsSolid(x, y, heroState) {
    if (x < 0 || y < 0 || x > this.width || y > this.height) return true;

    const T = this.terrainAt(x, y);

    if (T.ocean && !heroState.sailing) return true;

    if (!heroState.sailing && this.isInRiver(x, y)) {
      if (!this.isOnAnyBridge(x, y)) return true;
    }

    if (heroState.sailing && !T.ocean) {
      if (!this.isNearDock(x, y)) return true;
    }

    return false;
  }

  resolveCircleVsWorld(body, heroState) {
    for (let i = 0; i < 7; i++) {
      const samples = 12;
      let pushed = false;

      for (let s = 0; s < samples; s++) {
        const a = (s / samples) * Math.PI * 2;
        const px = body.x + Math.cos(a) * body.r;
        const py = body.y + Math.sin(a) * body.r;

        if (this.pointIsSolid(px, py, heroState)) {
          body.x -= Math.cos(a) * 2.4;
          body.y -= Math.sin(a) * 2.4;
          pushed = true;
        }
      }

      body.x = clamp(body.x, body.r + 2, this.width - body.r - 2);
      body.y = clamp(body.y, body.r + 2, this.height - body.r - 2);

      if (!pushed) break;
    }
  }

  projectileHitsSolid(p) {
    if (p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) return true;

    if (this.terrainAt(p.x, p.y).ocean) return true;

    if (this.isInRiver(p.x, p.y) && !this.isOnAnyBridge(p.x, p.y)) return true;

    return false;
  }

  /* ============================
     CONTENT GENERATION
     ============================ */

  generateWaystones(count) {
    const arr = [];
    const rng = new RNG(this.seed + 202);
    let tries = 0;

    while (arr.length < count && tries++ < 7000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      let ok = true;
      for (const w of arr) {
        if (dist2(x, y, w.x, w.y) < 600 * 600) { ok = false; break; }
      }
      if (!ok) continue;

      arr.push({
        id: `ws_${arr.length}`,
        x, y,
        name: makeWaystoneName(rng, arr.length),
        activated: (arr.length === 0),
      });
    }

    // Ensure one near spawn (and guaranteed on land)
    if (arr.length) {
      arr[0].x = this.spawn.x + 220;
      arr[0].y = this.spawn.y - 120;
      arr[0].name = "Starter Waystone";
      arr[0].activated = true;
    }

    return arr;
  }

  generateDocks(count) {
    const arr = [];
    const rng = new RNG(this.seed + 303);

    let tries = 0;
    while (arr.length < count && tries++ < 14000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;

      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      const nearOcean =
        this.terrainAt(x + 140, y).ocean ||
        this.terrainAt(x - 140, y).ocean ||
        this.terrainAt(x, y + 140).ocean ||
        this.terrainAt(x, y - 140).ocean;

      if (!nearOcean) continue;

      arr.push({
        x: x - 80,
        y: y - 40,
        w: 160,
        h: 80,
        name: `Dock ${arr.length + 1}`,
      });
    }

    // Guarantee one dock near spawn coast-ish: search around spawn for a coast land tile
    arr[0] = this.findCoastDockNear(this.spawn.x, this.spawn.y) || { x: 3600, y: 4550, w: 180, h: 90, name: "South Dock" };

    return arr;
  }

  findCoastDockNear(x, y) {
    const step = 120;
    const maxR = 2600;
    for (let r = step; r <= maxR; r += step) {
      const samples = Math.max(18, Math.floor((Math.PI * 2 * r) / 220));
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const px = clamp(x + Math.cos(a) * r, 200, this.width - 200);
        const py = clamp(y + Math.sin(a) * r, 200, this.height - 200);
        const T = this.terrainAt(px, py);
        if (T.ocean) continue;

        const nearOcean =
          this.terrainAt(px + 160, py).ocean ||
          this.terrainAt(px - 160, py).ocean ||
          this.terrainAt(px, py + 160).ocean ||
          this.terrainAt(px, py - 160).ocean;

        if (!nearOcean) continue;

        return { x: px - 90, y: py - 45, w: 180, h: 90, name: "Starter Dock" };
      }
    }
    return null;
  }

  generatePOIs(count) {
    const rng = new RNG(this.seed + 404);
    const types = ["ruin", "camp", "tree", "rock", "totem", "shrine"];
    const arr = [];
    let tries = 0;

    while (arr.length < count && tries++ < 18000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      let ok = true;
      for (const w of this.waystones) {
        if (dist2(x, y, w.x, w.y) < 260 * 260) { ok = false; break; }
      }
      if (!ok) continue;

      arr.push({
        type: rng.pick(types),
        x, y,
        s: 0.7 + rng.float() * 1.6,
        v: rng.float(),
      });
    }
    return arr;
  }

  /* ============================
     DRAWING
     ============================ */

  draw(ctx, t, cam) {
    const margin = 240;
    const x0 = Math.max(0, cam.x - margin);
    const y0 = Math.max(0, cam.y - margin);
    const x1 = Math.min(this.width, cam.x + cam.w + margin);
    const y1 = Math.min(this.height, cam.y + cam.h + margin);

    // Terrain tiles
    const step = 40;
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        const T = this.terrainAt(x + step * 0.5, y + step * 0.5);
        ctx.fillStyle = tileColor(T, t, x, y);
        ctx.fillRect(x, y, step + 1, step + 1);
      }
    }

    // River overlay
    this.drawRiver(ctx, t, x0, y0, x1, y1);

    // Bridges
    for (const b of this.getBridges()) this.drawBridge(ctx, b, t);

    // Docks
    for (const d of this.docks) this.drawDock(ctx, d, t);

    // Waystones
    for (const w of this.waystones) this.drawWaystone(ctx, w, t);
  }

  drawRiver(ctx, t, x0, y0, x1, y1) {
    const yStart = Math.max(1900, y0);
    const yEnd = Math.min(4200, y1);
    if (yEnd <= yStart) return;

    for (let y = Math.floor(yStart / 6) * 6; y < yEnd; y += 6) {
      const y0r = 1900, y1r = 4200;
      const tt = clamp((y - y0r) / (y1r - y0r), 0, 1);
      const cx = 4200 + Math.sin(y * 0.002) * 220 + Math.sin(y * 0.0008) * 380;
      const width = lerp(60, 140, tt * tt);
      const hw = width;

      const wave = Math.sin(y * 0.08 + t * 6) * 0.5 + Math.sin(y * 0.03 - t * 2.8) * 0.5;
      const a = 0.28 + 0.08 * wave;

      const g = ctx.createLinearGradient(cx - hw, y, cx + hw, y);
      g.addColorStop(0, "rgba(40,180,200,0.10)");
      g.addColorStop(0.5, `rgba(65,215,220,${a})`);
      g.addColorStop(1, "rgba(40,180,200,0.10)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - hw, y, hw * 2, 6);
    }
  }

  drawBridge(ctx, b, t) {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#000";
    ctx.fillRect(b.x + 10, b.y + b.h - 2, b.w, 12);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3b2412";
    for (let x = b.x + 8; x < b.x + b.w; x += 18) {
      ctx.fillRect(x, b.y + 8, 2, b.h - 16);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#7a5736";
    ctx.fillRect(b.x - 8, b.y - 12, b.w + 16, 10);
    ctx.fillRect(b.x - 8, b.y + b.h + 2, b.w + 16, 8);
  }

  drawDock(ctx, d, t) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(d.x, d.y, d.w, d.h);

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3b2412";
    for (let x = d.x + 10; x < d.x + d.w; x += 18) {
      ctx.fillRect(x, d.y + 8, 2, d.h - 16);
    }

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Dock (press B to sail)", d.x + 10, d.y - 6);
    ctx.globalAlpha = 1;
  }

  drawWaystone(ctx, w, t) {
    const pulse = 1 + Math.sin(t * 4) * 0.08;

    ctx.globalAlpha = w.activated ? 0.28 : 0.12;
    ctx.fillStyle = w.activated ? "#38d9ff" : "#9aa6d8";
    ctx.beginPath();
    ctx.arc(w.x, w.y, 26 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#cfd7e6";
    roundRect(ctx, w.x - 10, w.y - 18, 20, 36, 8);
    ctx.fill();

    ctx.globalAlpha = w.activated ? 0.9 : 0.45;
    ctx.fillStyle = w.activated ? "#0b1330" : "#2b2f39";
    ctx.fillRect(w.x - 3, w.y - 8, 6, 16);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(w.name, w.x - ctx.measureText(w.name).width / 2, w.y - 28);
    ctx.globalAlpha = 1;
  }
}

function tileColor(T, t, x, y) {
  if (T.ocean) {
    const wave = Math.sin(t * 3 + x * 0.01 + y * 0.013) * 0.5 + 0.5;
    return `rgb(${8 + wave * 10},${28 + wave * 30},${48 + wave * 55})`;
  }
  if (T.biome === "desert") return "#7a6a2b";
  if (T.biome === "swamp") return "#1b3a2f";
  if (T.biome === "highland") return "#27543b";
  if (T.biome === "forest") return "#184b31";
  return "#1b5a3a";
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
