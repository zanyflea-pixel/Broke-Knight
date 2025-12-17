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

export default class World {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;

    this.width = 9000;
    this.height = 5200;

    this.seed = 9137221;
    this.rng = new RNG(this.seed);

    this.spawn = { x: 1200, y: 2900 };

    this._t = 0;

    this.waystones = this.generateWaystones(18);

    // Docks now generated AFTER terrain/waystones exist
    this.docks = this.generateDocks(12);

    // POIs now include buildings
    this.pois = this.generatePOIs(110);

    // Precompute a few “settlements” (clusters of buildings)
    this.settlements = this.generateSettlements(6);
  }

  update(dt) {
    this._t += dt;
  }

  /* ============================
     TERRAIN
     ============================ */
  terrainAt(x, y) {
    const nx = x / this.width;
    const ny = y / this.height;

    const n1 = fbm(nx * 3.3 + 10, ny * 3.3 - 7, this.seed + 11, 5);
    const n2 = fbm(nx * 10.5 - 20, ny * 10.5 + 3, this.seed + 77, 3);

    const cx = nx - 0.48;
    const cy = ny - 0.55;
    const radial = Math.sqrt(cx * cx + cy * cy);

    let land = n1 * 0.8 + n2 * 0.2;
    land -= radial * 0.55;

    // islands (sailing destinations)
    land += this.islandBump(x, y, 1200, 1200, 650, 0.22);
    land += this.islandBump(x, y, 1700, 800, 520, 0.18);
    land += this.islandBump(x, y, this.width - 1200, 1300, 750, 0.24);
    land += this.islandBump(x, y, this.width - 1700, 900, 560, 0.19);
    land += this.islandBump(x, y, this.width - 900, 2100, 520, 0.16);

    // sea channel
    const channel = Math.exp(-Math.pow((nx - 0.5) / 0.06, 2));
    land -= channel * 0.18;

    const ocean = land < 0.38;

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

    return { ocean, biome, landVal: land, heat, wet };
  }

  islandBump(x, y, ix, iy, r, amt) {
    const d = Math.sqrt(dist2(x, y, ix, iy));
    const t = clamp(1 - d / r, 0, 1);
    return t * t * amt;
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
     WALK/SWIM/SAIL COLLISION
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

    // ocean blocks walking unless sailing
    if (T.ocean && !heroState.sailing) return true;

    // river blocks walking unless on bridge or sailing
    if (!heroState.sailing && this.isInRiver(x, y)) {
      if (!this.isOnAnyBridge(x, y)) return true;
    }

    // land blocks sailing unless inside dock zone
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

    while (arr.length < count && tries++ < 4000) {
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

    // force one near spawn
    arr[0].x = this.spawn.x + 220;
    arr[0].y = this.spawn.y - 120;
    arr[0].name = "Starter Waystone";
    arr[0].activated = true;

    return arr;
  }

  // NEW: docks only where land is walkable AND adjacent to ocean.
  // Also push the dock to sit ON the coastline so it’s reachable + useful.
  generateDocks(count) {
    const rng = new RNG(this.seed + 303);
    const docks = [];
    let tries = 0;

    const isGoodCoast = (x, y) => {
      const T = this.terrainAt(x, y);
      if (T.ocean) return false;
      if (this.isInRiver(x, y)) return false;

      // needs ocean very nearby (so it’s truly “edge”)
      const oceanN =
        this.terrainAt(x + 140, y).ocean ||
        this.terrainAt(x - 140, y).ocean ||
        this.terrainAt(x, y + 140).ocean ||
        this.terrainAt(x, y - 140).ocean;

      if (!oceanN) return false;

      // avoid placing docks deep inland by requiring *some* direction to flip land->ocean quickly
      let coastHit = false;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        let sx = x, sy = y;
        for (let k = 0; k < 10; k++) {
          sx += Math.cos(ang) * 40;
          sy += Math.sin(ang) * 40;
          if (sx < 0 || sy < 0 || sx > this.width || sy > this.height) break;
          if (this.terrainAt(sx, sy).ocean) { coastHit = true; break; }
        }
        if (coastHit) break;
      }
      return coastHit;
    };

    const pushToCoast = (x, y) => {
      // walk outward in the direction of nearest ocean to land/ocean boundary
      // (find a direction with shortest land->ocean distance)
      let best = null;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        let sx = x, sy = y;
        let steps = 0;
        while (steps++ < 18) {
          sx += Math.cos(ang) * 36;
          sy += Math.sin(ang) * 36;
          if (sx < 0 || sy < 0 || sx > this.width || sy > this.height) break;
          if (this.terrainAt(sx, sy).ocean) {
            // boundary is one step back
            const bx = sx - Math.cos(ang) * 36;
            const by = sy - Math.sin(ang) * 36;
            const d = steps;
            if (!best || d < best.d) best = { bx, by, ang, d };
            break;
          }
        }
      }
      if (!best) return { x, y, ang: 0 };

      // keep on land but right at the edge
      const px = clamp(best.bx, 120, this.width - 120);
      const py = clamp(best.by, 120, this.height - 120);
      return { x: px, y: py, ang: best.ang };
    };

    while (docks.length < count && tries++ < 20000) {
      // bias docks toward places the player will reach: around mid-world + near islands
      const bias = rng.float();
      let x = rng.float() * this.width;
      let y = rng.float() * this.height;

      if (bias < 0.45) {
        // around spawn continent area
        x = 900 + rng.float() * 5200;
        y = 2000 + rng.float() * 2600;
      } else if (bias < 0.70) {
        // right side continent
        x = (this.width - 2800) + rng.float() * 2400;
        y = 900 + rng.float() * 2800;
      }

      if (!isGoodCoast(x, y)) continue;

      const pushed = pushToCoast(x, y);

      // spacing
      let ok = true;
      for (const d of docks) {
        if (dist2(pushed.x, pushed.y, d.cx, d.cy) < 900 * 900) { ok = false; break; }
      }
      if (!ok) continue;

      // create a rectangle aligned-ish with coast direction
      const w = 220;
      const h = 90;

      docks.push({
        cx: pushed.x,
        cy: pushed.y,
        x: pushed.x - w / 2,
        y: pushed.y - h / 2,
        w, h,
        name: `Dock ${docks.length + 1}`,
        ang: pushed.ang,
      });
    }

    // guarantee a starter dock that is reachable and clearly visible
    const starter = pushToCoast(this.spawn.x + 350, this.spawn.y + 520);
    docks[0] = {
      cx: starter.x,
      cy: starter.y,
      x: starter.x - 120,
      y: starter.y - 45,
      w: 240,
      h: 90,
      name: "Starter Dock",
      ang: starter.ang,
    };

    // cleanup rects
    for (const d of docks) {
      d.x = clamp(d.x, 10, this.width - d.w - 10);
      d.y = clamp(d.y, 10, this.height - d.h - 10);
    }

    return docks;
  }

  generatePOIs(count) {
    const rng = new RNG(this.seed + 404);
    const types = ["ruin", "camp", "tree", "rock", "totem", "shrine", "house", "tower"];
    const arr = [];
    let tries = 0;

    while (arr.length < count && tries++ < 18000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;

      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      // avoid crowding waystones
      let ok = true;
      for (const w of this.waystones) {
        if (dist2(x, y, w.x, w.y) < 260 * 260) { ok = false; break; }
      }
      if (!ok) continue;

      // avoid crowding docks
      for (const d of this.docks) {
        if (dist2(x, y, d.cx, d.cy) < 260 * 260) { ok = false; break; }
      }
      if (!ok) continue;

      const type = rng.pick(types);

      arr.push({
        type,
        x, y,
        s: 0.7 + rng.float() * 1.7,
        v: rng.float(),
        biome: T.biome
      });
    }
    return arr;
  }

  // NEW: settlement clusters (buildings grouped together)
  generateSettlements(count) {
    const rng = new RNG(this.seed + 505);
    const out = [];
    let tries = 0;

    while (out.length < count && tries++ < 6000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;

      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      // keep settlements away from spawn a little (so there’s exploration)
      if (dist2(x, y, this.spawn.x, this.spawn.y) < 900 * 900) continue;

      // keep away from waystones
      let ok = true;
      for (const w of this.waystones) {
        if (dist2(x, y, w.x, w.y) < 700 * 700) { ok = false; break; }
      }
      if (!ok) continue;

      out.push({ x, y, r: 220 + rng.float() * 320, biome: T.biome, name: `Hamlet ${out.length + 1}` });
    }

    return out;
  }

  /* ============================
     DRAWING (v26 realism pass)
     ============================ */
  draw(ctx, t, cam) {
    // screen-space sky backdrop for depth
    this.drawSkyBackdrop(ctx, t);

    const margin = 260;
    const x0 = Math.max(0, cam.x - margin);
    const y0 = Math.max(0, cam.y - margin);
    const x1 = Math.min(this.width, cam.x + this.viewW + margin);
    const y1 = Math.min(this.height, cam.y + this.viewH + margin);

    // terrain tiles
    const step = 40;
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        const cx = x + step * 0.5;
        const cy = y + step * 0.5;
        const T = this.terrainAt(cx, cy);

        ctx.fillStyle = tileColor(T, t, cx, cy, this.seed);
        ctx.fillRect(x, y, step + 1, step + 1);

        // pseudo slope shading
        if (!T.ocean) {
          const h0 = T.landVal;
          const h1 = this.terrainAt(cx + 24, cy + 10).landVal;
          const shade = clamp((h1 - h0) * 1.9, -0.28, 0.28);
          if (Math.abs(shade) > 0.02) {
            ctx.globalAlpha = 0.10;
            ctx.fillStyle = shade > 0 ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
            ctx.fillRect(x, y, step + 1, step + 1);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // river overlay
    this.drawRiver(ctx, t, x0, y0, x1, y1);

    // bridges
    for (const b of this.getBridges()) this.drawBridge(ctx, b, t);

    // settlements (roads + buildings)
    for (const s of this.settlements) {
      if (s.x < x0 - 600 || s.x > x1 + 600 || s.y < y0 - 600 || s.y > y1 + 600) continue;
      this.drawSettlement(ctx, s, t);
    }

    // POIs (including standalone buildings)
    for (const p of this.pois) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      this.drawPOI(ctx, p, t);
    }

    // docks (high visibility + edge placement)
    for (const d of this.docks) this.drawDock(ctx, d, t);

    // waystones
    for (const w of this.waystones) this.drawWaystone(ctx, w, t);

    // shoreline foam + sparkle
    this.drawCoastFoam(ctx, t, x0, y0, x1, y1);

    // grass tufts (subtle)
    this.drawGrassTufts(ctx, t, x0, y0, x1, y1);

    // cloud shadows pass
    this.drawCloudShadows(ctx, t, x0, y0, x1, y1);
  }

  drawSkyBackdrop(ctx, t) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, "#0b1330");
    g.addColorStop(0.42, "#153c6b");
    g.addColorStop(0.62, "#1d6b8f");
    g.addColorStop(0.76, "#1f5b4d");
    g.addColorStop(1.00, "#103022");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sun glow
    const sx = W * 0.70;
    const sy = H * 0.16;
    ctx.globalAlpha = 0.18;
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, H * 0.55);
    sg.addColorStop(0, "rgba(255,210,138,0.65)");
    sg.addColorStop(1, "rgba(255,210,138,0.0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // distant haze band
    ctx.globalAlpha = 0.16;
    const hz = ctx.createLinearGradient(0, H * 0.30, 0, H * 0.62);
    hz.addColorStop(0, "rgba(160,210,255,0.0)");
    hz.addColorStop(0.5, "rgba(160,210,255,0.18)");
    hz.addColorStop(1, "rgba(160,210,255,0.0)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.30, W, H * 0.40);
    ctx.globalAlpha = 1;

    // parallax clouds (screen-space)
    const span = 420;
    const drift = (t * 26) % span;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#d7e0ff";
    for (let i = -2; i < 10; i++) {
      const x = i * span + drift;
      const y = H * 0.16 + Math.sin((i + t) * 0.7) * 16;
      ctx.beginPath();
      ctx.ellipse(x + 80, y, 110, 34, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 160, y + 8, 130, 40, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 240, y, 100, 32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawRiver(ctx, t, x0, y0, x1, y1) {
    const yStart = Math.max(1900, y0);
    const yEnd = Math.min(4200, y1);
    if (yEnd <= yStart) return;

    for (let y = Math.floor(yStart / 6) * 6; y < yEnd; y += 6) {
      const y0r = 1900, y1r = 4200;
      const tt = clamp((y - y0r) / (y1r - y0r), 0, 1);

      const cx = 4200 + Math.sin(y * 0.002) * 220 + Math.sin(y * 0.0008) * 380;
      const width = lerp(64, 150, tt * tt);
      const hw = width;

      const wave = Math.sin(y * 0.09 + t * 6.3) * 0.55 + Math.sin(y * 0.03 - t * 2.8) * 0.45;
      const a = 0.30 + 0.12 * wave;

      const g = ctx.createLinearGradient(cx - hw, y, cx + hw, y);
      g.addColorStop(0, "rgba(20,80,105,0.08)");
      g.addColorStop(0.50, `rgba(70,235,240,${a})`);
      g.addColorStop(1, "rgba(20,80,105,0.08)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - hw, y, hw * 2, 6);

      // spec streaks
      const streak = Math.sin(t * 3.2 + y * 0.12) * 0.5 + 0.5;
      if (streak > 0.62) {
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = "#eaf6ff";
        ctx.fillRect(cx - hw * 0.62 + (streak - 0.62) * hw, y + 1, hw * 0.24, 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawBridge(ctx, b, t) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.fillRect(b.x + 10, b.y + b.h - 2, b.w, 12);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#3b2412";
    for (let x = b.x + 10; x < b.x + b.w; x += 18) {
      ctx.fillRect(x, b.y + 8, 2, b.h - 16);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#7a5736";
    ctx.fillRect(b.x - 8, b.y - 12, b.w + 16, 10);
    ctx.fillRect(b.x - 8, b.y + b.h + 2, b.w + 16, 8);

    ctx.fillStyle = "#4a321e";
    for (let x = b.x - 2; x <= b.x + b.w + 2; x += 24) {
      ctx.fillRect(x, b.y - 16, 4, 16);
      ctx.fillRect(x, b.y + b.h + 2, 4, 14);
    }
  }

  drawDock(ctx, d, t) {
    // outer shadow outline (makes dock pop)
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "#000";
    roundRect(ctx, d.x - 4, d.y - 4, d.w + 8, d.h + 8, 12);
    ctx.fill();
    ctx.globalAlpha = 1;

    // deck
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#6b4a2b";
    roundRect(ctx, d.x, d.y, d.w, d.h, 12);
    ctx.fill();

    // planks
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#3b2412";
    for (let x = d.x + 12; x < d.x + d.w; x += 18) {
      ctx.fillRect(x, d.y + 10, 2, d.h - 20);
    }
    ctx.globalAlpha = 1;

    // posts
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#4a321e";
    for (let x = d.x + 8; x <= d.x + d.w - 8; x += 40) {
      ctx.fillRect(x, d.y - 10, 6, 14);
      ctx.fillRect(x, d.y + d.h - 4, 6, 14);
    }
    ctx.globalAlpha = 1;

    // “waterline glow” (help you locate it)
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#38d9ff";
    ctx.beginPath();
    ctx.ellipse(d.cx, d.cy + d.h * 0.75, d.w * 0.55, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // label
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Dock (B to sail)", d.x + 12, d.y - 8);
    ctx.globalAlpha = 1;
  }

  drawWaystone(ctx, w, t) {
    const pulse = 1 + Math.sin(t * 4) * 0.08;

    ctx.globalAlpha = w.activated ? 0.28 : 0.12;
    ctx.fillStyle = w.activated ? "#38d9ff" : "#9aa6d8";
    ctx.beginPath();
    ctx.arc(w.x, w.y, 28 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#cfd7e6";
    roundRect(ctx, w.x - 11, w.y - 20, 22, 40, 9);
    ctx.fill();

    ctx.globalAlpha = w.activated ? 0.9 : 0.45;
    ctx.fillStyle = w.activated ? "#0b1330" : "#2b2f39";
    ctx.fillRect(w.x - 3, w.y - 9, 6, 18);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    const txt = w.name;
    ctx.fillText(txt, w.x - ctx.measureText(txt).width / 2, w.y - 30);
    ctx.globalAlpha = 1;
  }

  drawSettlement(ctx, s, t) {
    // draw a faint “road ring” and some buildings
    const n = 7 + Math.floor(fbm(s.x * 0.001, s.y * 0.001, this.seed + 700, 2) * 8);
    const rng = new RNG(((s.x | 0) * 73856093) ^ ((s.y | 0) * 19349663) ^ (this.seed + 777));

    // road ring (dirt)
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = "rgba(110,90,55,0.55)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // central “plaza”
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(110,90,55,0.55)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 36, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.float() * 0.5;
      const rr = (s.r * 0.35) + rng.float() * (s.r * 0.35);
      const x = s.x + Math.cos(a) * rr;
      const y = s.y + Math.sin(a) * rr;

      const kind = rng.float() < 0.20 ? "tower" : "house";
      this.drawBuilding(ctx, x, y, kind, 0.9 + rng.float() * 0.9, t, s.biome);
    }

    // settlement label
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(s.name, s.x - ctx.measureText(s.name).width / 2, s.y - s.r * 0.60);
    ctx.globalAlpha = 1;
  }

  drawPOI(ctx, p, t) {
    const s = p.s;
    if (p.type === "house" || p.type === "tower") {
      this.drawBuilding(ctx, p.x, p.y, p.type, s, t, p.biome);
      return;
    }

    // existing types (slightly richer)
    if (p.type === "tree") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 16 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // trunk
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(p.x - 2 * s, p.y + 10 * s, 4 * s, 10 * s);

      // canopy volume
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "#0c2b1f";
      ctx.beginPath(); ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#164b31";
      ctx.beginPath(); ctx.arc(p.x + 9 * s, p.y - 5 * s, 14 * s, 0, Math.PI * 2); ctx.fill();

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath(); ctx.arc(p.x - 6 * s, p.y - 7 * s, 8 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.type === "rock") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      roundRect(ctx, p.x - 16 * s + 2, p.y - 10 * s + 6, 32 * s, 20 * s, 8 * s);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#5d6a7a";
      roundRect(ctx, p.x - 14 * s, p.y - 10 * s, 28 * s, 20 * s, 8 * s);
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#eaf6ff";
      ctx.fillRect(p.x - 9 * s, p.y - 7 * s, 10 * s, 2 * s);

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#0b1330";
      ctx.fillRect(p.x - 10 * s, p.y - 3 * s, 20 * s, 2 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "ruin") {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#000";
      ctx.fillRect(p.x - 18 * s + 2, p.y - 10 * s + 5, 36 * s, 20 * s);
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#7d8796";
      ctx.fillRect(p.x - 18 * s, p.y - 10 * s, 36 * s, 20 * s);

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#0b1330";
      ctx.fillRect(p.x - 14 * s, p.y - 6 * s, 28 * s, 3 * s);

      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#eaf6ff";
      ctx.fillRect(p.x - 16 * s, p.y - 9 * s, 18 * s, 2 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "camp") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 14 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#2b2f39";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 18 * s);
      ctx.lineTo(p.x - 18 * s, p.y + 12 * s);
      ctx.lineTo(p.x + 18 * s, p.y + 12 * s);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffd28a";
      ctx.fillRect(p.x - 2 * s, p.y + 12 * s, 4 * s, 8 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "totem") {
      const wob = Math.sin(t * 3 + p.v * 10) * 1.3;

      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      roundRect(ctx, p.x - 6 * s + 2, p.y - 20 * s + wob + 6, 12 * s, 40 * s, 6 * s);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#7a5d33";
      roundRect(ctx, p.x - 6 * s, p.y - 20 * s + wob, 12 * s, 40 * s, 6 * s);
      ctx.fill();

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#eaf6ff";
      ctx.fillRect(p.x - 4 * s, p.y - 16 * s + wob, 5 * s, 2 * s);

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffd28a";
      ctx.fillRect(p.x - 2 * s, p.y - 6 * s + wob, 4 * s, 12 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "shrine") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      roundRect(ctx, p.x - 16 * s + 2, p.y - 12 * s + 6, 32 * s, 24 * s, 10 * s);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#cfd7e6";
      roundRect(ctx, p.x - 16 * s, p.y - 12 * s, 32 * s, 24 * s, 10 * s);
      ctx.fill();

      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#38d9ff";
      ctx.fillRect(p.x - 2 * s, p.y - 6 * s, 4 * s, 12 * s);

      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#eaf6ff";
      ctx.fillRect(p.x - 10 * s, p.y - 10 * s, 12 * s, 2 * s);
      ctx.globalAlpha = 1;
    }
  }

  // NEW: buildings that look 2.5D (walls + roof + shadow)
  drawBuilding(ctx, x, y, kind, s, t, biome) {
    const wob = Math.sin(t * 1.2 + x * 0.01) * 0.4;
    const w = (kind === "tower" ? 26 : 34) * s;
    const h = (kind === "tower" ? 52 : 36) * s;

    // shadow
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x + 4, y + h * 0.55, w * 0.85, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // wall
    const wall = (biome === "desert") ? "#8a7a5a" : "#7d8796";
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = wall;
    roundRect(ctx, x - w / 2, y - h / 2 + 8 + wob, w, h, 8 * s);
    ctx.fill();

    // wall shade (gives depth)
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#0b1330";
    ctx.fillRect(x - w / 2, y - h / 2 + 8 + wob, w * 0.30, h);
    ctx.globalAlpha = 1;

    // roof
    const roof = (kind === "tower") ? "#2b2f39" : "#6b4a2b";
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2 - 14 * s + wob);
    ctx.lineTo(x - w / 2 - 2, y - h / 2 + 10 + wob);
    ctx.lineTo(x + w / 2 + 2, y - h / 2 + 10 + wob);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // roof highlight
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2 - 12 * s + wob);
    ctx.lineTo(x - w * 0.18, y - h / 2 + 6 + wob);
    ctx.lineTo(x + w * 0.18, y - h / 2 + 6 + wob);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // door + window
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#0b1330";
    roundRect(ctx, x - 5 * s, y + 6 * s + wob, 10 * s, 14 * s, 4 * s);
    ctx.fill();

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(x + 9 * s, y - 2 * s + wob, 6 * s, 5 * s);
    ctx.globalAlpha = 1;

    // fence hint for houses
    if (kind === "house") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(x - w / 2 - 10 * s, y + h * 0.15 + wob, w + 20 * s, 3 * s);
      ctx.globalAlpha = 1;
    }
  }

  drawCoastFoam(ctx, t, x0, y0, x1, y1) {
    const step = 60;
    ctx.globalAlpha = 0.10;

    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        const T = this.terrainAt(x + step * 0.5, y + step * 0.5);
        if (!T.ocean) continue;

        const nearLand =
          !this.terrainAt(x + 90, y).ocean ||
          !this.terrainAt(x - 90, y).ocean ||
          !this.terrainAt(x, y + 90).ocean ||
          !this.terrainAt(x, y - 90).ocean;

        if (!nearLand) continue;

        const wave = Math.sin(t * 5 + (x + y) * 0.01) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(234,246,255,${0.06 + wave * 0.08})`;
        ctx.fillRect(x + 10, y + 12, 22, 3);
        ctx.fillRect(x + 26, y + 20, 18, 2);
      }
    }

    ctx.globalAlpha = 1;
  }

  // grass tufts (subtle, less “drawn on”)
  drawGrassTufts(ctx, t, x0, y0, x1, y1) {
    const step = 140;
    ctx.globalAlpha = 0.22;

    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        const T = this.terrainAt(x + 8, y + 8);
        if (T.ocean) continue;
        if (this.isInRiver(x + 10, y + 10)) continue;

        // don’t overdraw: only some tiles
        const n = fbm(x * 0.00125, y * 0.00125, this.seed + 909, 2);
        if (n < 0.56) continue;

        const sway = Math.sin(t * 2.8 + (x + y) * 0.02) * 1.8;
        const h = 12 + n * 14;
        const w = 16 + n * 12;

        let col = "rgba(140,255,170,0.22)";
        if (T.biome === "forest") col = "rgba(90,220,140,0.22)";
        if (T.biome === "highland") col = "rgba(170,255,190,0.18)";
        if (T.biome === "swamp") col = "rgba(120,220,170,0.16)";
        if (T.biome === "desert") col = "rgba(255,240,170,0.08)";

        ctx.strokeStyle = col;
        ctx.lineWidth = 2;

        // upside-down W tuft
        ctx.beginPath();
        ctx.moveTo(x + 12, y + 18);
        ctx.lineTo(x + 12 + w * 0.25 + sway * 0.2, y + 18 - h);
        ctx.lineTo(x + 12 + w * 0.50 + sway * 0.35, y + 18);
        ctx.lineTo(x + 12 + w * 0.75 + sway * 0.2, y + 18 - h * 0.85);
        ctx.lineTo(x + 12 + w + sway * 0.1, y + 18);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  drawCloudShadows(ctx, t, x0, y0, x1, y1) {
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#000";
    const span = 520;
    const drift = (t * 40) % span;
    for (let y = Math.floor(y0 / 400) * 400; y < y1; y += 400) {
      for (let x = Math.floor(x0 / span) * span - span; x < x1 + span; x += span) {
        const xx = x + drift;
        ctx.beginPath();
        ctx.ellipse(xx, y + 120, 160, 40, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================
   TILE COLOR (realistic ground)
   ============================ */
function tileColor(T, t, x, y, seed) {
  if (T.ocean) {
    const wave = Math.sin(t * 3 + x * 0.01 + y * 0.013) * 0.5 + 0.5;
    const deep = 10 + wave * 10;
    const mid = 30 + wave * 32;
    const hi = 52 + wave * 58;
    return `rgb(${deep},${mid},${hi})`;
  }

  // shore/beach band near ocean: use landVal threshold (close to ocean cutoff)
  const shore = clamp((0.44 - T.landVal) / 0.08, 0, 1); // 0 inland -> 1 beach

  // base ground texture noise
  const nA = fbm(x * 0.0022, y * 0.0022, seed + 321, 3);
  const nB = fbm(x * 0.0065, y * 0.0065, seed + 777, 2);
  const patch = clamp((nB - 0.52) * 2.2, 0, 1); // dirt patch mask
  const light = (nA - 0.5) * 26;

  // biome palettes
  let r = 32, g = 112, b = 68; // grass
  if (T.biome === "forest") { r = 24; g = 92; b = 58; }
  if (T.biome === "highland") { r = 40; g = 116; b = 72; }
  if (T.biome === "swamp") { r = 30; g = 76; b = 62; }
  if (T.biome === "desert") { r = 132; g = 114; b = 62; }

  // apply lighting noise
  r += light * 0.35;
  g += light * 0.85;
  b += light * 0.35;

  // dirt patches
  const dirtR = r * 0.70 + 70;
  const dirtG = g * 0.62 + 52;
  const dirtB = b * 0.55 + 36;

  r = lerp(r, dirtR, patch * 0.55);
  g = lerp(g, dirtG, patch * 0.55);
  b = lerp(b, dirtB, patch * 0.55);

  // beach blend
  const sandR = 168, sandG = 152, sandB = 92;
  r = lerp(r, sandR, shore);
  g = lerp(g, sandG, shore);
  b = lerp(b, sandB, shore);

  return rgb(r, g, b);
}

function rgb(r, g, b) {
  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));
  return `rgb(${r},${g},${b})`;
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
