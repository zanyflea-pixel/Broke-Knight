// src/world.js
import { RNG, clamp, fbm, dist2, lerp, hash01 } from "./util.js";

/* ============================
   WAYSTONE NAME GENERATOR
   ============================ */
function makeWaystoneName(rng, index) {
  const prefixes = ["Ancient","Forgotten","Shattered","Silent","Stormbound","Ember","Frost","Sunken","Iron","Runed"];
  const cores = ["Waystone","Obelisk","Monolith","Beacon","Pillar","Spire"];
  const suffixes = ["of Ash","of Tides","of Dawn","of Dusk","of Echoes","of Kings","of Exiles","of Broken Oaths"];
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

    this.waystones = this.generateWaystones(14);
    this.docks = this.generateDocks(10);
    this.pois = this.generatePOIs(85);
  }

  update(dt) { this._t += dt; }

  terrainAt(x, y) {
    const nx = x / this.width;
    const ny = y / this.height;

    const n1 = fbm(nx * 3.3 + 10, ny * 3.3 - 7, this.seed + 11, 5);
    const n2 = fbm(nx * 10.5 - 20, ny * 10.5 + 3, this.seed + 77, 3);

    const cx = nx - 0.48, cy = ny - 0.55;
    const radial = Math.sqrt(cx * cx + cy * cy);

    let land = n1 * 0.8 + n2 * 0.2;
    land -= radial * 0.55;

    // island arcs
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

    return { ocean, biome, landVal: land };
  }

  islandBump(x, y, ix, iy, r, amt) {
    const d = Math.sqrt(dist2(x, y, ix, iy));
    const t = clamp(1 - d / r, 0, 1);
    return t * t * amt;
  }

  // river: meandering vertical river on main continent near center
  riverSignedDistance(x, y) {
    const y0 = 1850, y1 = 4250;
    if (y < y0 || y > y1) return 99999;
    const cx = 4200 + Math.sin(y * 0.002) * 220 + Math.sin(y * 0.0008) * 380;
    return x - cx;
  }

  isInRiver(x, y) {
    const sd = this.riverSignedDistance(x, y);
    if (sd === 99999) return false;
    const y0 = 1850, y1 = 4250;
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

  isNearDock(x, y) {
    for (const d of this.docks) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return true;
    }
    return false;
  }

  // solid rules: ocean blocks walking; land blocks sailing unless in dock box
  pointIsSolid(x, y, heroState) {
    if (x < 0 || y < 0 || x > this.width || y > this.height) return true;
    const T = this.terrainAt(x, y);

    if (T.ocean && !heroState.sailing) return true;

    if (!heroState.sailing && this.isInRiver(x, y) && !this.isOnAnyBridge(x, y)) return true;

    if (heroState.sailing && !T.ocean && !this.isNearDock(x, y)) return true;

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
    if (this.terrainAt(p.x, p.y).ocean) return true; // fizzles
    if (this.isInRiver(p.x, p.y) && !this.isOnAnyBridge(p.x, p.y)) return true;
    return false;
  }

  generateWaystones(count) {
    const arr = [];
    const rng = new RNG(this.seed + 202);
    let tries = 0;
    while (arr.length < count && tries++ < 5000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;
      let ok = true;
      for (const w of arr) if (dist2(x, y, w.x, w.y) < 600 * 600) { ok = false; break; }
      if (!ok) continue;
      arr.push({ id: `ws_${arr.length}`, x, y, name: makeWaystoneName(rng, arr.length), activated: arr.length === 0 });
    }
    // one near spawn
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
    while (arr.length < count && tries++ < 12000) {
      // bias toward edges
      const edge = rng.float();
      let x = rng.float() * this.width;
      let y = rng.float() * this.height;
      if (edge < 0.25) x = 120 + rng.float() * 420;
      else if (edge < 0.5) x = this.width - 540 + rng.float() * 420;
      else if (edge < 0.75) y = 120 + rng.float() * 420;
      else y = this.height - 540 + rng.float() * 420;

      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;

      const nearOcean =
        this.terrainAt(x + 120, y).ocean ||
        this.terrainAt(x - 120, y).ocean ||
        this.terrainAt(x, y + 120).ocean ||
        this.terrainAt(x, y - 120).ocean;

      if (!nearOcean) continue;

      arr.push({ x: x - 80, y: y - 40, w: 160, h: 80, name: `Dock ${arr.length + 1}` });
    }

    // guarantee one useful
    arr[0] = { x: 3600, y: 4550, w: 180, h: 90, name: "South Dock" };
    return arr;
  }

  generatePOIs(count) {
    const rng = new RNG(this.seed + 404);
    const types = ["ruin","camp","tree","rock","totem","shrine"];
    const arr = [];
    let tries = 0;
    while (arr.length < count && tries++ < 15000) {
      const x = rng.float() * this.width;
      const y = rng.float() * this.height;
      const T = this.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.isInRiver(x, y)) continue;
      arr.push({ type: rng.pick(types), x, y, s: 0.7 + rng.float() * 1.6, v: rng.float() });
    }
    return arr;
  }

  draw(ctx, t, cam) {
    const margin = 240;
    const x0 = Math.max(0, cam.x - margin);
    const y0 = Math.max(0, cam.y - margin);
    const x1 = Math.min(this.width, cam.x + this.viewW + margin);
    const y1 = Math.min(this.height, cam.y + this.viewH + margin);

    // horizon haze overlay (screen-space)
    // drawn later by UI; here we focus world

    const step = 40;
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        const cx = x + step * 0.5, cy = y + step * 0.5;
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

          // micro details
          const d = hash01((cx * 0.7) | 0, (cy * 0.7) | 0, this.seed);
          if (d < 0.06) drawTuft(ctx, cx, cy, t, d);
          else if (d > 0.965) drawPebble(ctx, cx, cy, t, d);
          else if (d > 0.88 && T.biome === "forest") drawBush(ctx, cx, cy, t, d);
        }
      }
    }

    this.drawRiver(ctx, t, x0, y0, x1, y1);
    for (const b of this.getBridges()) this.drawBridge(ctx, b, t);

    for (const p of this.pois) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      this.drawPOI(ctx, p, t);
    }

    for (const d of this.docks) this.drawDock(ctx, d, t);
    for (const w of this.waystones) this.drawWaystone(ctx, w, t);

    this.drawCoastFoam(ctx, t, x0, y0, x1, y1);
    this.drawClouds(ctx, t, cam, x0, y0, x1, y1);
    this.drawAtmosphere(ctx, cam);
  }

  drawRiver(ctx, t, x0, y0, x1, y1) {
    const yStart = Math.max(1850, y0);
    const yEnd = Math.min(4250, y1);
    if (yEnd <= yStart) return;

    for (let y = Math.floor(yStart / 6) * 6; y < yEnd; y += 6) {
      const y0r = 1850, y1r = 4250;
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
    for (let x = b.x + 8; x < b.x + b.w; x += 18) ctx.fillRect(x, b.y + 8, 2, b.h - 16);
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
    for (let x = d.x + 10; x < d.x + d.w; x += 18) ctx.fillRect(x, d.y + 8, 2, d.h - 16);

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
        ctx.fillStyle = `rgba(234,246,255,${0.08 + wave * 0.06})`;
        ctx.fillRect(x + 10, y + 10, 18, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawClouds(ctx, t, cam, x0, y0, x1, y1) {
    // Two parallax cloud layers + their shadows. World is top-down, but we fake depth.
    const layers = [
      { yOff: 70,  speed: 18,  alpha: 0.22,  scaleX: 1.0, scaleY: 1.0 },
      { yOff: 130, speed: 28,  alpha: 0.16,  scaleX: 1.2, scaleY: 1.1 },
    ];

    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const span = 520;
      const drift = (t * L.speed + cam.x * 0.25 * (li + 1)) % span;
      const baseY = cam.y + L.yOff + li * 40 + Math.sin(t * 0.15 + li) * 10;

      // shadows
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#000";
      for (let x = Math.floor((cam.x - 200) / span) * span; x < cam.x + cam.w + span; x += span) {
        const xx = x + drift;
        const yy = baseY + 140;
        if (yy < y0 - 200 || yy > y1 + 200) continue;
        ctx.beginPath();
        ctx.ellipse(xx, yy, 170 * L.scaleX, 42 * L.scaleY, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // clouds
      ctx.save();
      ctx.globalAlpha = L.alpha;
      ctx.fillStyle = "rgba(235,245,255,1)";
      for (let x = Math.floor((cam.x - 200) / span) * span; x < cam.x + cam.w + span; x += span) {
        const xx = x + drift;
        const yy = baseY;
        if (yy < y0 - 200 || yy > y1 + 200) continue;
        // puffy stack
        ctx.beginPath();
        ctx.ellipse(xx - 50, yy + 10, 70 * L.scaleX, 22 * L.scaleY, 0, 0, Math.PI * 2);
        ctx.ellipse(xx + 10, yy, 90 * L.scaleX, 30 * L.scaleY, 0, 0, Math.PI * 2);
        ctx.ellipse(xx + 75, yy + 12, 60 * L.scaleX, 20 * L.scaleY, 0, 0, Math.PI * 2);
        ctx.fill();
        // subtle shading
        ctx.globalAlpha = L.alpha * 0.55;
        ctx.fillStyle = "rgba(180,205,235,1)";
        ctx.beginPath();
        ctx.ellipse(xx + 15, yy + 18, 95 * L.scaleX, 22 * L.scaleY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = L.alpha;
        ctx.fillStyle = "rgba(235,245,255,1)";
      }
      ctx.restore();
    }
  }

  drawAtmosphere(ctx, cam) {
    // Screen-aligned atmosphere / vignette for depth (fake horizon).
    const x = cam.x, y = cam.y, w = cam.w, h = cam.h;

    // top haze
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0.00, "rgba(220,235,255,0.22)");
    g.addColorStop(0.35, "rgba(220,235,255,0.06)");
    g.addColorStop(1.00, "rgba(0,0,0,0.10)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // subtle vignette
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = 80;
    ctx.strokeRect(x + 40, y + 40, w - 80, h - 80);
    ctx.restore();
  }
}

function tileColor(T, t, x, y, seed) {
  // Base palette + subtle noise variation + animated water shimmer.
  const n = hash01((x * 0.35) | 0, (y * 0.35) | 0, seed);
  const n2 = hash01((x * 0.08) | 0, (y * 0.08) | 0, seed + 77);

  if (T.ocean) {
    const wave = Math.sin(t * 2.6 + x * 0.012 + y * 0.014) * 0.5 + 0.5;
    const chop = Math.sin(t * 5.2 + x * 0.04) * 0.5 + 0.5;
    const k = 0.55 * wave + 0.45 * chop;
    const r = 8 + k * 12;
    const g = 34 + k * 34;
    const b = 64 + k * 70;
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  // land: biome base
  let base;
  if (T.biome === "desert") base = [122, 108, 48];
  else if (T.biome === "swamp") base = [24, 58, 47];
  else if (T.biome === "highland") base = [35, 92, 62];
  else if (T.biome === "forest") base = [22, 86, 55];
  else base = [30, 104, 64]; // grass

  // variation (dirt patches / moss / subtle speckle)
  const v = (n - 0.5) * 26 + (n2 - 0.5) * 18;
  const dirt = fbm(x * 0.0028 + 10, y * 0.0028 - 7, seed + 11, 3);
  const dirtK = clamp((dirt - 0.52) * 1.25, -0.25, 0.25);

  const rr = clamp(base[0] + v + dirtK * 22, 0, 255);
  const gg = clamp(base[1] + v + dirtK * 10, 0, 255);
  const bb = clamp(base[2] + v - dirtK * 8, 0, 255);
  return `rgb(${rr|0},${gg|0},${bb|0})`;
}

function drawTuft(ctx, x, y, t, d) {
  const sway = Math.sin(t * 2.4 + d * 30) * 2.2;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = "rgba(20,70,40,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 6);
  ctx.quadraticCurveTo(x - 2 + sway * 0.3, y - 6, x + 2, y + 6);
  ctx.quadraticCurveTo(x + 4 + sway, y - 2, x + 8, y + 6);
  ctx.stroke();
  ctx.restore();
}

function drawPebble(ctx, x, y, t, d) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(30,35,45,0.45)";
  roundRect(ctx, x - 5, y + 4, 10, 6, 3);
  ctx.fill();
  ctx.restore();
}

function drawBush(ctx, x, y, t, d) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "rgba(10,40,24,0.55)";
  ctx.beginPath();
  ctx.arc(x - 8, y + 2, 7, 0, Math.PI * 2);
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.arc(x + 9, y + 3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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