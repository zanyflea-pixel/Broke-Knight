// src/world.js
import { RNG, clamp, fbm, dist2, lerp, hash01 } from "./util.js";

function makeWaystoneName(rng, index) {
  const prefixes = ["Ancient","Forgotten","Shattered","Silent","Stormbound","Ember","Frost","Sunken","Iron","Runed"];
  const cores = ["Waystone","Obelisk","Monolith","Beacon","Pillar","Spire"];
  const suffixes = ["of Ash","of Tides","of Dawn","of Dusk","of Echoes","of Kings","of Exiles","of Broken Oaths"];
  const p = prefixes[rng.int(0, prefixes.length - 1)];
  const c = cores[rng.int(0, cores.length - 1)];
  const s = rng.float() > 0.6 ? " " + suffixes[rng.int(0, suffixes.length - 1)] : "";
  return `${p} ${c}${s} #${index + 1}`;
}

export class World {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;

    this.width = 9000;
    this.height = 5200;

    this.seed = 9137221;
    this.rng = new RNG(this.seed);

    this._t = 0;

    // Land-safe spawn
    const desired = { x: 1200, y: 2900 };
    this.spawn = this.findNearestLand(desired.x, desired.y);

    // Content
    this.waystones = this.generateWaystones(18);
    this.settlements = this.generateSettlements(14);
    this.docks = this.generateCoastDocks(12);
    this.pois = this.generatePOIs(110);

    // Precompute a cheap minimap texture once
    this._mini = this.buildMinimap(260, 150);

    // Cloud field seeds
    this._cloudSeed = this.seed ^ 0x9e3779b9;
  }

  setViewSize(w, h) { this.viewW = w; this.viewH = h; }
  update(dt) { this._t += dt; }

  terrainAt(x, y) {
    const nx = x / this.width;
    const ny = y / this.height;

    const n1 = fbm(nx * 3.0 + 10, ny * 3.0 - 7, this.seed + 11, 5);
    const n2 = fbm(nx * 9.5 - 20, ny * 9.5 + 3, this.seed + 77, 3);

    const cx = nx - 0.48;
    const cy = ny - 0.55;
    const radial = Math.sqrt(cx * cx + cy * cy);

    let land = n1 * 0.78 + n2 * 0.22;

    land += 0.12;          // uplift so continents exist
    land -= radial * 0.50; // coast falloff

    // Islands you must sail to
    land += this.islandBump(x, y, 1200, 1200, 650, 0.22);
    land += this.islandBump(x, y, 1700, 800, 520, 0.18);
    land += this.islandBump(x, y, this.width - 1200, 1300, 750, 0.24);
    land += this.islandBump(x, y, this.width - 1700, 900, 560, 0.19);
    land += this.islandBump(x, y, this.width - 900, 2100, 520, 0.16);

    // Middle sea channel
    const channel = Math.exp(-Math.pow((nx - 0.5) / 0.06, 2));
    land -= channel * 0.16;

    const ocean = land < 0.30;

    // Biomes
    const heat = fbm(nx * 2.2 + 100, ny * 2.2 - 50, this.seed + 999, 4);
    const wet  = fbm(nx * 2.0 - 33,  ny * 2.0 + 44, this.seed + 444, 4);

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

  findNearestLand(x, y) {
    if (!this.terrainAt(x, y).ocean) return { x, y };

    const step = 80;
    const maxR = 2200;
    for (let r = step; r <= maxR; r += step) {
      const samples = Math.max(16, Math.floor((Math.PI * 2 * r) / 140));
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const px = clamp(x + Math.cos(a) * r, 60, this.width - 60);
        const py = clamp(y + Math.sin(a) * r, 60, this.height - 60);
        if (!this.terrainAt(px, py).ocean) return { x: px, y: py };
      }
    }

    const rng = new RNG(this.seed ^ 0xBEEF);
    for (let k = 0; k < 6000; k++) {
      const px = rng.float() * this.width;
      const py = rng.float() * this.height;
      if (!this.terrainAt(px, py).ocean) return { x: px, y: py };
    }

    return { x: this.width * 0.5, y: this.height * 0.5 };
  }

  /* ============================
     River + Bridges
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
     Collision
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
     Procedural content
     ============================ */
  generateWaystones(count) {
    const arr = [];
    const rng = new RNG(this.seed + 202);
    let tries = 0;

    while (arr.length < count && tries++ < 9000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      let ok = true;
      for (const w of arr) {
        if (dist2(x, y, w.x, w.y) < 700 * 700) { ok = false; break; }
      }
      if (!ok) continue;

      arr.push({
        id: `ws_${arr.length}`,
        x, y,
        name: makeWaystoneName(rng, arr.length),
        activated: (arr.length === 0),
      });
    }

    if (arr.length) {
      arr[0].x = this.spawn.x + 220;
      arr[0].y = this.spawn.y - 120;
      arr[0].name = "Starter Waystone";
      arr[0].activated = true;
    }

    return arr;
  }

  generateSettlements(count) {
    const rng = new RNG(this.seed + 777);
    const arr = [];
    let tries = 0;

    while (arr.length < count && tries++ < 12000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      let ok = true;
      for (const s of arr) {
        if (dist2(x, y, s.x, s.y) < 1400 * 1400) { ok = false; break; }
      }
      if (!ok) continue;

      arr.push({
        x, y,
        size: 4 + rng.int(0, 5),
        seed: rng.int(0, 99999999),
        kind: rng.pick(["hamlet", "village", "outpost"]),
      });
    }

    if (arr.length) {
      arr[0].x = this.spawn.x + 380;
      arr[0].y = this.spawn.y + 180;
      arr[0].kind = "starter";
    }

    return arr;
  }

  // Coast docks: place on land cells that border ocean and are near the edge of walkable land
  generateCoastDocks(count) {
    const rng = new RNG(this.seed + 303);
    const docks = [];
    let tries = 0;

    while (docks.length < count && tries++ < 20000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      // must have ocean adjacent
      const nearOcean =
        this.terrainAt(x + 180, y).ocean ||
        this.terrainAt(x - 180, y).ocean ||
        this.terrainAt(x, y + 180).ocean ||
        this.terrainAt(x, y - 180).ocean;

      if (!nearOcean) continue;

      // avoid placing deep inland (use a quick gradient check: if all neighbors land, skip)
      const inland =
        !this.terrainAt(x + 240, y).ocean &&
        !this.terrainAt(x - 240, y).ocean &&
        !this.terrainAt(x, y + 240).ocean &&
        !this.terrainAt(x, y - 240).ocean;
      if (inland) continue;

      // spread out
      let ok = true;
      for (const d of docks) {
        if (dist2(x, y, d.cx, d.cy) < 1200 * 1200) { ok = false; break; }
      }
      if (!ok) continue;

      const w = 200, h = 110;

      docks.push({
        cx: x, cy: y,
        x: x - w / 2,
        y: y - h / 2,
        w, h,
        name: `Dock ${docks.length + 1}`,
      });
    }

    // guarantee a starter dock near spawn
    docks[0] = this.findCoastDockNear(this.spawn.x, this.spawn.y) || docks[0];

    return docks.filter(Boolean);
  }

  findCoastDockNear(x, y) {
    const step = 140;
    const maxR = 2600;
    for (let r = step; r <= maxR; r += step) {
      const samples = Math.max(18, Math.floor((Math.PI * 2 * r) / 220));
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const px = clamp(x + Math.cos(a) * r, 220, this.width - 220);
        const py = clamp(y + Math.sin(a) * r, 220, this.height - 220);
        const T = this.terrainAt(px, py);
        if (T.ocean) continue;

        const nearOcean =
          this.terrainAt(px + 200, py).ocean ||
          this.terrainAt(px - 200, py).ocean ||
          this.terrainAt(px, py + 200).ocean ||
          this.terrainAt(px, py - 200).ocean;

        if (!nearOcean) continue;

        return { cx:px, cy:py, x:px-110, y:py-55, w:220, h:110, name:"Starter Dock" };
      }
    }
    return null;
  }

  generatePOIs(count) {
    const rng = new RNG(this.seed + 404);
    const types = ["ruin", "camp", "tree", "rock", "totem", "shrine"];
    const arr = [];
    let tries = 0;

    while (arr.length < count && tries++ < 24000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      // don't crowd settlements too hard
      let ok = true;
      for (const s of this.settlements) {
        if (dist2(x, y, s.x, s.y) < 520 * 520) { ok = false; break; }
      }
      if (!ok) continue;

      arr.push({
        type: rng.pick(types),
        x, y,
        s: 0.7 + rng.float() * 1.7,
        v: rng.float(),
      });
    }
    return arr;
  }

  /* ============================
     Minimap (static image)
     ============================ */
  buildMinimap(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");

    const stepX = this.width / w;
    const stepY = this.height / h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wx = x * stepX;
        const wy = y * stepY;
        const T = this.terrainAt(wx, wy);
        g.fillStyle = miniColor(T);
        g.fillRect(x, y, 1, 1);
      }
    }

    // river hint
    g.globalAlpha = 0.45;
    g.fillStyle = "#5fe7ff";
    for (let y = 0; y < h; y++) {
      const wy = y * stepY;
      const cx = 4200 + Math.sin(wy * 0.002) * 220 + Math.sin(wy * 0.0008) * 380;
      const x = Math.floor((cx / this.width) * w);
      g.fillRect(x - 1, y, 2, 1);
    }
    g.globalAlpha = 1;

    return c;
  }

  /* ============================
     Drawing
     ============================ */
  draw(ctx, t, cam) {
    const margin = 260;
    const x0 = Math.max(0, cam.x - margin);
    const y0 = Math.max(0, cam.y - margin);
    const x1 = Math.min(this.width, cam.x + cam.w + margin);
    const y1 = Math.min(this.height, cam.y + cam.h + margin);

    // --- horizon / sky haze band (fake 3D depth)
    // We draw this in world-space above everything; it gives the “distance”
    const hz = cam.y + cam.h * 0.22;
    ctx.globalAlpha = 0.16;
    const haze = ctx.createLinearGradient(cam.x, hz - 260, cam.x, hz + 320);
    haze.addColorStop(0, "rgba(160,210,255,0.00)");
    haze.addColorStop(1, "rgba(160,210,255,0.30)");
    ctx.fillStyle = haze;
    ctx.fillRect(cam.x, hz - 260, cam.w, 580);
    ctx.globalAlpha = 1;

    // Terrain tiles (coarse)
    const step = 40;
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        const cx = x + step * 0.5;
        const cy = y + step * 0.5;
        const T = this.terrainAt(cx, cy);

        ctx.fillStyle = tileColor(T, t, cx, cy);

        // depth darken near camera bottom a bit
        const screenY = (cy - cam.y) / cam.h;
        let depthMul = 1.0;
        depthMul = lerp(0.92, 1.08, clamp(screenY, 0, 1));

        // multiply by drawing a translucent overlay
        ctx.fillRect(x, y, step + 1, step + 1);
        if (!T.ocean) {
          // pseudo slope shading (light direction)
          const h0 = T.landVal;
          const h1 = this.terrainAt(cx + 24, cy + 10).landVal;
          const shade = clamp((h1 - h0) * 2.0, -0.25, 0.25);
          if (Math.abs(shade) > 0.02) {
            ctx.globalAlpha = 0.10;
            ctx.fillStyle = shade > 0 ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";
            ctx.fillRect(x, y, step + 1, step + 1);
            ctx.globalAlpha = 1;
          }
        } else {
          // water shimmer
          const wv = Math.sin(t * 2.7 + cx * 0.012 + cy * 0.013) * 0.5 + 0.5;
          ctx.globalAlpha = 0.05 + wv * 0.05;
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillRect(x, y, step + 1, step + 1);
          ctx.globalAlpha = 1;
        }

        // micro detail on land: tufts/pebbles/bushes
        if (!T.ocean) {
          const d = hash01(cx * 0.7, cy * 0.7, this.seed);
          if (d < 0.06) drawTuft(ctx, cx, cy, t, d);
          else if (d > 0.965) drawPebble(ctx, cx, cy, t, d);
          else if (d > 0.90 && T.biome === "forest") drawBush(ctx, cx, cy, t, d);
        }
      }
    }

    // Coast foam
    this.drawCoastFoam(ctx, t, x0, y0, x1, y1);

    // River overlay + bridges
    this.drawRiver(ctx, t, x0, y0, x1, y1);
    for (const b of this.getBridges()) this.drawBridge(ctx, b, t);

    // Settlements (roads + buildings)
    for (const s of this.settlements) {
      if (s.x < x0 - 900 || s.x > x1 + 900 || s.y < y0 - 900 || s.y > y1 + 900) continue;
      this.drawSettlement(ctx, s, t);
    }

    // POIs
    for (const p of this.pois) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      this.drawPOI(ctx, p, t);
    }

    // Docks
    for (const d of this.docks) this.drawDock(ctx, d, t);

    // Waystones
    for (const w of this.waystones) this.drawWaystone(ctx, w, t);

    // Cloud shadows pass (parallax)
    this.drawCloudShadows(ctx, t, x0, y0, x1, y1);
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
        ctx.fillStyle = `rgba(234,246,255,${0.10 + wave * 0.10})`;
        ctx.fillRect(x + 10, y + 10, 18, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawCloudShadows(ctx, t, x0, y0, x1, y1) {
    // big soft ovals drifting; gives depth
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    const span = 620;
    const drift = (t * 42) % span;
    for (let y = Math.floor(y0 / 420) * 420; y < y1; y += 420) {
      for (let x = Math.floor(x0 / span) * span - span; x < x1 + span; x += span) {
        const xx = x + drift;
        ctx.beginPath();
        ctx.ellipse(xx, y + 130, 190, 52, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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

      const wave = Math.sin(y * 0.09 + t * 6.4) * 0.5 + Math.sin(y * 0.03 - t * 2.8) * 0.5;
      const a = 0.30 + 0.09 * wave;

      const g = ctx.createLinearGradient(cx - hw, y, cx + hw, y);
      g.addColorStop(0, "rgba(40,180,200,0.08)");
      g.addColorStop(0.5, `rgba(65,215,235,${a})`);
      g.addColorStop(1, "rgba(40,180,200,0.08)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - hw, y, hw * 2, 6);

      // specular streaks
      if ((y % 24) === 0) {
        const streak = Math.sin(t * 4 + y * 0.12) * 0.5 + 0.5;
        ctx.globalAlpha = 0.10 + streak * 0.10;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(cx - hw * 0.4, y + 1, hw * 0.8, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawBridge(ctx, b, t) {
    // shadow
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#000";
    ctx.fillRect(b.x + 10, b.y + b.h - 2, b.w, 14);
    ctx.globalAlpha = 1;

    // wood base
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // planks
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3b2412";
    for (let x = b.x + 8; x < b.x + b.w; x += 18) {
      ctx.fillRect(x, b.y + 8, 2, b.h - 16);
    }
    ctx.globalAlpha = 1;

    // rails
    ctx.fillStyle = "#7a5736";
    ctx.fillRect(b.x - 8, b.y - 12, b.w + 16, 10);
    ctx.fillRect(b.x - 8, b.y + b.h + 2, b.w + 16, 8);

    // posts
    ctx.fillStyle = "#4a321e";
    for (let x = b.x - 2; x <= b.x + b.w + 2; x += 24) {
      ctx.fillRect(x, b.y - 16, 4, 16);
      ctx.fillRect(x, b.y + b.h + 2, 4, 14);
    }
  }

  drawDock(ctx, d, t) {
    // visible silhouette
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "#000";
    ctx.fillRect(d.x + 10, d.y + d.h - 2, d.w, 14);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(d.x, d.y, d.w, d.h);

    // planks
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3b2412";
    for (let x = d.x + 10; x < d.x + d.w; x += 18) {
      ctx.fillRect(x, d.y + 8, 2, d.h - 16);
    }

    // ropes
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#d7c7a6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(d.x + 4, d.y + 8);
    ctx.lineTo(d.x + d.w - 4, d.y + 8);
    ctx.moveTo(d.x + 4, d.y + d.h - 8);
    ctx.lineTo(d.x + d.w - 4, d.y + d.h - 8);
    ctx.stroke();

    // label
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Dock (B to sail)", d.x + 10, d.y - 10);
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
    ctx.fillText(w.name, w.x - ctx.measureText(w.name).width / 2, w.y - 30);
    ctx.globalAlpha = 1;
  }

  drawPOI(ctx, p, t) {
    const s = p.s;
    if (p.type === "tree") {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#0c2b1f";
      ctx.beginPath(); ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#164b31";
      ctx.beginPath(); ctx.arc(p.x + 8 * s, p.y - 4 * s, 14 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(p.x - 2 * s, p.y + 10 * s, 4 * s, 10 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "rock") {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#5d6a7a";
      roundRect(ctx, p.x - 14 * s, p.y - 10 * s, 28 * s, 20 * s, 8 * s);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#0b1330";
      ctx.fillRect(p.x - 10 * s, p.y - 3 * s, 20 * s, 2 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "ruin") {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#7d8796";
      ctx.fillRect(p.x - 18 * s, p.y - 10 * s, 36 * s, 20 * s);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#0b1330";
      ctx.fillRect(p.x - 14 * s, p.y - 6 * s, 28 * s, 3 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "camp") {
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
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#7a5d33";
      roundRect(ctx, p.x - 6 * s, p.y - 20 * s + wob, 12 * s, 40 * s, 6 * s);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffd28a";
      ctx.fillRect(p.x - 2 * s, p.y - 6 * s + wob, 4 * s, 12 * s);
      ctx.globalAlpha = 1;
    } else if (p.type === "shrine") {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#cfd7e6";
      roundRect(ctx, p.x - 16 * s, p.y - 12 * s, 32 * s, 24 * s, 10 * s);
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#38d9ff";
      ctx.fillRect(p.x - 2 * s, p.y - 6 * s, 4 * s, 12 * s);
      ctx.globalAlpha = 1;
    }
  }

  drawSettlement(ctx, s, t) {
    const rng = new RNG(s.seed);
    const n = s.size;

    // road ring
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(30,25,20,0.55)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 80 + n * 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 80 + n * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // houses
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.float() * 0.35;
      const r = 60 + rng.float() * 60 + n * 6;
      const x = s.x + Math.cos(a) * r;
      const y = s.y + Math.sin(a) * r;
      drawHouse(ctx, x, y, 1 + rng.float() * 0.6, rng);
    }

    // center building
    drawHouse(ctx, s.x, s.y, 1.6, rng, true);

    // label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    const nm = s.kind === "starter" ? "Starter Town" : (s.kind === "village" ? "Village" : (s.kind === "hamlet" ? "Hamlet" : "Outpost"));
    ctx.fillText(nm, s.x - ctx.measureText(nm).width / 2, s.y - (120 + n * 8));
    ctx.globalAlpha = 1;
  }

  getMinimapCanvas() {
    return this._mini;
  }
}

function tileColor(T, t, x, y) {
  if (T.ocean) {
    const wave = Math.sin(t * 3 + x * 0.01 + y * 0.013) * 0.5 + 0.5;
    return `rgb(${10 + wave * 14},${36 + wave * 40},${70 + wave * 90})`;
  }
  if (T.biome === "desert") return "#a78f3a";
  if (T.biome === "swamp") return "#1f4d3a";
  if (T.biome === "highland") return "#2f7a55";
  if (T.biome === "forest") return "#1f6a44";
  return "#2b8a4b";
}

function miniColor(T) {
  if (T.ocean) return "#0b2d4d";
  if (T.biome === "desert") return "#8b7a2c";
  if (T.biome === "swamp") return "#1b3a2f";
  if (T.biome === "highland") return "#2f6a4a";
  if (T.biome === "forest") return "#1f5a3a";
  return "#2a7a45";
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

function drawTuft(ctx, x, y, t, d) {
  const w = 10 + d * 10;
  const h = 8 + d * 10;
  const wig = Math.sin(t * 2.5 + x * 0.03 + y * 0.04) * 2.2;

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.45, y + 10);
  ctx.quadraticCurveTo(x - w * 0.2 + wig, y + 2, x, y + 6);
  ctx.quadraticCurveTo(x + w * 0.2 + wig, y + 2, x + w * 0.45, y + 10);
  ctx.stroke();

  ctx.globalAlpha = 0.70;
  ctx.strokeStyle = "rgba(170,255,190,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.45, y + 10);
  ctx.quadraticCurveTo(x - w * 0.2 + wig, y + 2, x, y + 6);
  ctx.quadraticCurveTo(x + w * 0.2 + wig, y + 2, x + w * 0.45, y + 10);
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawPebble(ctx, x, y, t, d) {
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "rgba(80,95,110,0.55)";
  const r = 2.5 + d * 2.5;
  ctx.beginPath();
  ctx.arc(x + 6, y + 9, r, 0, Math.PI * 2);
  ctx.arc(x - 3, y + 11, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBush(ctx, x, y, t, d) {
  const wob = Math.sin(t * 2 + d * 10) * 1.2;
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#163a2b";
  ctx.beginPath();
  ctx.arc(x - 6, y + wob, 9, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2 + wob, 10, 0, Math.PI * 2);
  ctx.arc(x + 10, y + 4 + wob, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHouse(ctx, x, y, s, rng, isCenter = false) {
  const w = 34 * s, h = 22 * s;

  // shadow
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#000";
  ctx.fillRect(x - w/2 + 6, y + h/2 + 10, w, 10);
  ctx.globalAlpha = 1;

  // walls
  ctx.fillStyle = isCenter ? "#7d8796" : "#6b6a55";
  roundRect(ctx, x - w/2, y - h/2, w, h, 6 * s);
  ctx.fill();

  // roof
  ctx.fillStyle = isCenter ? "#5b3a2a" : "#4a321e";
  ctx.beginPath();
  ctx.moveTo(x - w/2 - 6, y - h/2 + 2);
  ctx.lineTo(x, y - h/2 - 18 * s);
  ctx.lineTo(x + w/2 + 6, y - h/2 + 2);
  ctx.closePath();
  ctx.fill();

  // door
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#2b2f39";
  ctx.fillRect(x - 4 * s, y + 2 * s, 8 * s, 10 * s);

  // window glow
  if (rng.float() > 0.6) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(x - 12 * s, y - 2 * s, 6 * s, 5 * s);
  }
  ctx.globalAlpha = 1;
}
