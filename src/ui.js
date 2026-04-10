// src/ui.js
// v95.9 DIRECT MAP RENDER + BIG MAP ZOOM ONLY (FULL FILE)

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function rarityColor(rarity) {
  if (rarity === "epic") return "rgba(226,190,255,0.96)";
  if (rarity === "rare") return "rgba(176,224,255,0.96)";
  if (rarity === "uncommon") return "rgba(176,244,176,0.96)";
  return "rgba(236,240,248,0.94)";
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return "0";
  return Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
}

function itemStatText(item) {
  const s = item?.stats || {};
  const out = [];
  if (s.dmg) out.push(`DMG +${s.dmg}`);
  if (s.armor) out.push(`ARM +${s.armor}`);
  if (s.hp) out.push(`HP +${s.hp}`);
  if (s.mana) out.push(`MP +${s.mana}`);
  if (s.crit) out.push(`CRIT +${Math.round(s.crit * 100)}%`);
  if (s.critMult) out.push(`CRIT DMG +${Math.round(s.critMult * 100)}%`);
  if (s.move) out.push(`MOVE +${Math.round(s.move * 100)}%`);
  return out.join(" • ") || "No stats";
}

export default class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = canvas?.width || 960;
    this.h = canvas?.height || 540;

    // Minimap never zooms
    this.minimapWorldSpan = 1800;

    // Big map zoom levels controlled by world.mapMode
    this.bigMapSpanSmall = 12000;
    this.bigMapSpanLarge = 3600;
  }

  setViewSize(w, h) {
    this.w = w | 0;
    this.h = h | 0;
  }

  update(dt, game) {
    void dt;
    void game;
  }

  draw(ctx, game) {
    if (!ctx || !game) return;

    this._drawHUD(ctx, game);
    this._drawMinimap(ctx, game);
    this._drawBottomBar(ctx, game);

    if (game.menu?.open === "inventory") this._drawInventory(ctx, game);
    if (game.menu?.open === "map") this._drawMap(ctx, game);
    if (game.menu?.open === "shop") this._drawShop(ctx, game);
  }

  _panel(ctx, x, y, w, h, r = 14, fill = "rgba(10,14,22,0.74)") {
    ctx.save();
    ctx.fillStyle = fill;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
    ctx.restore();
  }

  _bigPanel(ctx, x, y, w, h, title = "") {
    this._panel(ctx, x, y, w, h, 18, "rgba(10,14,22,0.92)");

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRectPath(ctx, x, y, w, 32, 18);
    ctx.fill();

    ctx.fillStyle = "rgba(244,247,252,0.96)";
    ctx.font = "bold 16px Arial";
    ctx.fillText(title, x + 16, y + 21);
    ctx.restore();
  }

  _bar(ctx, x, y, w, h, p, fill, radius = 8) {
    const pct = clamp(p, 0, 1);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fill();

    const fw = Math.max(0, Math.floor(w * pct));
    if (fw > 0) {
      ctx.fillStyle = fill;
      roundRectPath(ctx, x, y, fw, h, radius);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
    ctx.stroke();
    ctx.restore();
  }

  _drawHUD(ctx, game) {
    const hero = game.hero;
    const st = hero.getStats?.() || { maxHp: 100, maxMana: 60, dmg: 8, armor: 0, crit: 0.05 };
    const eliteKills = game?.progress?.eliteKills || 0;

    const hpP = clamp((hero.hp || 0) / Math.max(1, st.maxHp || 1), 0, 1);
    const mpP = clamp((hero.mana || 0) / Math.max(1, st.maxMana || 1), 0, 1);
    const xpP = clamp((hero.xp || 0) / Math.max(1, hero.nextXp || 1), 0, 1);

    const x = 14;
    const y = 12;
    const panelW = 356;
    const barW = 248;

    this._panel(ctx, x, y, panelW, 176, 16, "rgba(8,12,18,0.70)");

    ctx.save();
    ctx.fillStyle = "rgba(245,248,252,0.96)";
    ctx.font = "bold 13px Arial";
    ctx.fillText("BROKE KNIGHT", x + 14, y + 18);

    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(220,228,240,0.88)";
    ctx.fillText(`Lv ${hero.level || 1}`, x + 14, y + 38);
    ctx.fillText(`Gold ${hero.gold || 0}`, x + 86, y + 38);
    ctx.fillText(`Elite Kills ${eliteKills}`, x + 156, y + 38);

    const bx = x + 14;
    const by = y + 52;

    this._bar(ctx, bx, by, barW, 14, hpP, "rgba(235,82,108,0.96)");
    this._bar(ctx, bx, by + 22, barW, 14, mpP, "rgba(92,150,255,0.96)");
    this._bar(ctx, bx, by + 44, barW, 10, xpP, "rgba(255,210,92,0.96)", 7);

    ctx.fillStyle = "rgba(245,248,252,0.96)";
    ctx.font = "12px Arial";
    ctx.fillText(`HP ${Math.round(hero.hp || 0)} / ${Math.round(st.maxHp || hero.maxHp || 100)}`, bx + 8, by + 11);
    ctx.fillText(`MP ${Math.round(hero.mana || 0)} / ${Math.round(st.maxMana || hero.maxMana || 60)}`, bx + 8, by + 33);
    ctx.fillText(`XP ${Math.round(hero.xp || 0)} / ${Math.round(hero.nextXp || 1)}`, bx + 8, by + 52);

    ctx.fillStyle = "rgba(214,222,238,0.82)";
    ctx.fillText(`DMG ${Math.round(st.dmg || 0)}`, bx, y + 138);
    ctx.fillText(`ARM ${Math.round(st.armor || 0)}`, bx + 86, y + 138);
    ctx.fillText(`CRIT ${Math.round((st.crit || 0) * 100)}%`, bx + 162, y + 138);
    ctx.fillText(`Pots H:${hero.potions?.hp || 0} M:${hero.potions?.mana || 0}`, bx, y + 158);

    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const size = 176;
    const pad = 14;
    const x = this.w - size - pad;
    const y = 12;

    this._panel(ctx, x - 2, y - 2, size + 4, size + 22, 14, "rgba(8,12,18,0.70)");

    ctx.save();
    roundRectPath(ctx, x, y, size, size, 12);
    ctx.clip();

    // Direct minimap draw from world data, centered on hero always
    this._drawWorldMapDirect(
      ctx,
      game.world,
      game.hero.x,
      game.hero.y,
      this.minimapWorldSpan,
      x,
      y,
      size,
      size,
      {
        centerOnHero: true,
        drawHeroMarker: false,
        showUndiscovered: true,
        sampleStepPx: 4,
      }
    );

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, size, size, 12);
    ctx.stroke();

    const px = x + size * 0.5;
    const py = y + size * 0.5;

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, py + 0.5);
    ctx.lineTo(x + size, py + 0.5);
    ctx.moveTo(px + 0.5, y);
    ctx.lineTo(px + 0.5, y + size);
    ctx.stroke();

    // Hero always centered on minimap
    ctx.fillStyle = "rgba(20,20,20,0.92)";
    ctx.fillRect((px - 3) | 0, (py - 3) | 0, 6, 6);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((px - 1) | 0, (py - 1) | 0, 2, 2);

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = "bold 11px Arial";
    ctx.fillText("MINIMAP", x + 8, y + 14);

    ctx.fillStyle = "rgba(214,222,238,0.78)";
    ctx.font = "11px Arial";
    ctx.fillText("M map", x + 8, y + size + 15);

    ctx.restore();
  }

  _drawBottomBar(ctx, game) {
    const defs = game.skillDefs || {};
    const cds = game.cooldowns || {};
    const order = ["q", "w", "e", "r"];

    const totalW = 300;
    const x = ((this.w - totalW) * 0.5) | 0;
    const y = this.h - 74;

    this._panel(ctx, x, y, totalW, 54, 14, "rgba(8,12,18,0.72)");

    ctx.save();
    for (let i = 0; i < order.length; i++) {
      const key = order[i];
      const d = defs[key];
      const cd = cds[key] || 0;

      const bx = x + 14 + i * 70;
      const by = y + 10;
      const bw = 56;
      const bh = 34;

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRectPath(ctx, bx, by, bw, bh, 10);
      ctx.fill();

      if (cd > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.42)";
        roundRectPath(ctx, bx, by, bw, bh, 10);
        ctx.fill();
      }

      ctx.fillStyle = d?.color || "rgba(180,200,240,1)";
      ctx.beginPath();
      ctx.arc(bx + 15, by + 17, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(245,248,252,0.96)";
      ctx.font = "bold 12px Arial";
      ctx.fillText(String(key).toUpperCase(), bx + 29, by + 15);

      ctx.font = "11px Arial";
      ctx.fillStyle = "rgba(214,222,238,0.82)";
      ctx.fillText(d?.name || "Skill", bx + 22, by + 28);

      if (cd > 0) {
        ctx.fillStyle = "rgba(255,226,160,0.94)";
        ctx.font = "bold 11px Arial";
        ctx.fillText(fmtNum(cd), bx + 4, by + 13);
      }
    }
    ctx.restore();
  }

  _drawInventory(ctx, game) {
    const hero = game.hero;
    const items = Array.isArray(hero.inventory) ? hero.inventory : [];
    const equip = hero.equip || {};
    const panelW = Math.min(760, this.w - 56);
    const panelH = Math.min(520, this.h - 48);
    const x = ((this.w - panelW) * 0.5) | 0;
    const y = ((this.h - panelH) * 0.5) | 0;

    this._bigPanel(ctx, x, y, panelW, panelH, "Inventory");

    ctx.save();
    ctx.font = "13px Arial";
    ctx.fillStyle = "rgba(244,247,252,0.96)";
    ctx.fillText("Equipped", x + 18, y + 60);

    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
    let yy = y + 88;

    for (const slot of slots) {
      const item = equip[slot] || null;
      this._panel(ctx, x + 16, yy - 18, 320, 42, 10, "rgba(14,20,30,0.72)");
      ctx.fillStyle = "rgba(214,222,238,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText(slot.toUpperCase(), x + 28, yy - 1);

      ctx.fillStyle = rarityColor(item?.rarity);
      ctx.font = "bold 13px Arial";
      ctx.fillText(item?.name || "-", x + 118, yy - 1);
      yy += 52;
    }

    ctx.fillStyle = "rgba(244,247,252,0.96)";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Backpack", x + 360, y + 60);

    let iy = y + 88;
    for (let i = 0; i < items.length && i < 7; i++) {
      const item = items[i];
      this._panel(ctx, x + 356, iy - 18, panelW - 372, 54, 10, "rgba(14,20,30,0.72)");
      ctx.fillStyle = rarityColor(item?.rarity);
      ctx.font = "bold 13px Arial";
      ctx.fillText(item?.name || "Gear", x + 368, iy);

      ctx.fillStyle = "rgba(214,222,238,0.76)";
      ctx.font = "11px Arial";
      ctx.fillText(itemStatText(item), x + 368, iy + 18);
      iy += 64;
    }

    if (!items.length) {
      ctx.fillStyle = "rgba(214,222,238,0.72)";
      ctx.font = "12px Arial";
      ctx.fillText("No items yet.", x + 368, y + 92);
    }

    ctx.fillStyle = "rgba(214,222,238,0.72)";
    ctx.font = "12px Arial";
    ctx.fillText("ESC or I to close", x + 18, y + panelH - 18);

    ctx.restore();
  }

  _drawMap(ctx, game) {
    const world = game.world;
    const panelW = Math.min(920, this.w - 40);
    const panelH = Math.min(640, this.h - 40);
    const x = ((this.w - panelW) * 0.5) | 0;
    const y = ((this.h - panelH) * 0.5) | 0;

    this._bigPanel(ctx, x, y, panelW, panelH, "World Map");

    const mapX = x + 18;
    const mapY = y + 44;
    const mapW = Math.min(620, panelW - 250);
    const mapH = panelH - 62;

    const bigSpan = (world?.mapMode === "large")
      ? this.bigMapSpanLarge
      : this.bigMapSpanSmall;

    ctx.save();
    roundRectPath(ctx, mapX, mapY, mapW, mapH, 14);
    ctx.clip();

    // Big map only changes zoom level; it stays centered on hero for intuitive use
    this._drawWorldMapDirect(
      ctx,
      world,
      game.hero.x,
      game.hero.y,
      bigSpan,
      mapX,
      mapY,
      mapW,
      mapH,
      {
        centerOnHero: true,
        drawHeroMarker: true,
        showUndiscovered: true,
        sampleStepPx: 5,
      }
    );

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, mapX, mapY, mapW, mapH, 14);
    ctx.stroke();

    const sideX = mapX + mapW + 18;
    let ty = y + 70;

    ctx.fillStyle = "rgba(232,238,252,0.94)";
    ctx.font = "bold 14px Arial";
    ctx.fillText("Map Info", sideX, ty);
    ty += 26;

    ctx.font = "13px Arial";
    ctx.fillStyle = "rgba(206,216,236,0.84)";
    ctx.fillText(`Zoom: ${world?.mapMode === "large" ? "close" : "far"}`, sideX, ty);
    ty += 20;
    ctx.fillText("Z = change map zoom", sideX, ty);
    ty += 20;
    ctx.fillText("M / ESC = close", sideX, ty);
    ty += 28;

    ctx.fillStyle = "rgba(232,238,252,0.94)";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Waystones", sideX, ty);
    ty += 20;

    const discovered = Array.from(game?.progress?.discoveredWaystones || []);
    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(206,216,236,0.84)";
    for (let i = 0; i < discovered.length && i < 9; i++) {
      ctx.fillText(`${i + 1} • Waystone ${discovered[i]}`, sideX, ty);
      ty += 18;
    }

    if (!discovered.length) {
      ctx.fillText("No waystones unlocked yet.", sideX, ty);
    }

    ctx.restore();
  }

  _drawShop(ctx, game) {
    const panelW = Math.min(720, this.w - 48);
    const panelH = Math.min(500, this.h - 48);
    const x = ((this.w - panelW) * 0.5) | 0;
    const y = ((this.h - panelH) * 0.5) | 0;

    this._bigPanel(ctx, x, y, panelW, panelH, "Camp Shop");

    ctx.save();
    ctx.fillStyle = "rgba(214,222,238,0.82)";
    ctx.font = "13px Arial";
    ctx.fillText(`Gold: ${game.hero?.gold || 0}`, x + 18, y + 58);
    ctx.fillText("Shop UI can be expanded again after the map is stable.", x + 18, y + 86);
    ctx.fillText("ESC or H to close", x + 18, y + panelH - 18);
    ctx.restore();
  }

  _drawWorldMapDirect(ctx, world, centerX, centerY, worldSpan, dx, dy, dw, dh, opts = {}) {
    if (!world) return;

    const showUndiscovered = opts.showUndiscovered !== false;
    const stepPx = Math.max(2, opts.sampleStepPx || 4);

    const half = worldSpan * 0.5;

    for (let sy = 0; sy < dh; sy += stepPx) {
      for (let sx = 0; sx < dw; sx += stepPx) {
        const wx = centerX - half + (sx / dw) * worldSpan;
        const wy = centerY - half + (sy / dh) * worldSpan;

        let fill = "#06080c";

        if (world.isExplored?.(wx, wy)) {
          if (world.isWater?.(wx, wy)) {
            fill = "#3f86b8";
          } else {
            const zone = world.getZoneName?.(wx, wy) || "Green Reach";
            fill = this._miniGroundColor(zone);
          }
        } else if (showUndiscovered) {
          fill = "#06080c";
        }

        ctx.fillStyle = fill;
        ctx.fillRect(dx + sx, dy + sy, stepPx, stepPx);
      }
    }

    // Draw POIs only if explored
    this._drawPOIsOnMap(ctx, world, centerX, centerY, worldSpan, dx, dy, dw, dh);

    if (opts.drawHeroMarker) {
      const px = dx + dw * 0.5;
      const py = dy + dh * 0.5;

      ctx.fillStyle = "rgba(20,20,20,0.92)";
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.98)";
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPOIsOnMap(ctx, world, centerX, centerY, worldSpan, dx, dy, dw, dh) {
    const half = worldSpan * 0.5;

    const drawPoi = (x, y, color, r) => {
      if (!world.isExplored?.(x, y)) return;

      const nx = (x - (centerX - half)) / worldSpan;
      const ny = (y - (centerY - half)) / worldSpan;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

      const px = dx + nx * dw;
      const py = dy + ny * dh;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const c of world.camps || []) drawPoi(c.x, c.y, "#f3c46e", 3);
    for (const w of world.waystones || []) drawPoi(w.x, w.y, "#bde4ff", 2.5);
    for (const d of world.docks || []) drawPoi(d.x, d.y, "#d6c3a1", 2.5);
    for (const g of world.dungeons || []) drawPoi(g.x, g.y, "#ff9f87", 3);
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
}