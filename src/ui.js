// src/ui.js
// v97.8 ROBUST MAP UI
// - supports both getMapInfo() and older minimap canvas worlds
// - minimap always centers hero
// - big map uses revealed data when available
// - safe fallbacks so map does not break if world implementation shifts

import { clamp } from "./util.js";

export default class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = canvas?.width || 960;
    this.h = canvas?.height || 540;

    this._open = null;
    this._msg = "";
    this._msgT = 0;

    this._mini = null;
    this._miniT = 0;
  }

  setViewSize(w, h) {
    this.w = w | 0;
    this.h = h | 0;
  }

  open(name) {
    this._open = name || null;
  }

  closeAll() {
    this._open = null;
  }

  setMsg(text, t = 2) {
    this._msg = String(text || "");
    this._msgT = Math.max(0, +t || 0);
  }

  update(dt, game) {
    if (this._msgT > 0) {
      this._msgT = Math.max(0, this._msgT - dt);
      if (this._msgT <= 0) this._msg = "";
    }

    this._miniT += dt;
    if (this._miniT >= 0.18) {
      this._miniT = 0;
      this._mini = game?.world?.getMinimapCanvas?.() || null;
    }
  }

  draw(ctx, game) {
    if (!ctx || !game) return;

    this._syncViewFromCanvas();

    this._drawHUD(ctx, game);
    this._drawSpellBar(ctx, game);
    this._drawMinimap(ctx, game);
    this._drawHelp(ctx);
    this._drawPrompt(ctx, game);
    this._drawToast(ctx, game);

    const open = game?.menu?.open || this._open || null;
    if (!open) return;

    if (open === "map") this._drawMap(ctx, game);
    else if (open === "inventory") this._drawSimplePanel(ctx, "Inventory");
    else if (open === "skills") this._drawSimplePanel(ctx, "Skills");
    else if (open === "quests") this._drawSimplePanel(ctx, "Quests");
    else if (open === "shop") this._drawSimplePanel(ctx, "Shop");
    else if (open === "options") this._drawSimplePanel(ctx, "Options");
    else if (open === "god") this._drawSimplePanel(ctx, "Menu");
  }

  _syncViewFromCanvas() {
    this.w = this.canvas?.width || this.w;
    this.h = this.canvas?.height || this.h;
  }

  _drawHUD(ctx, game) {
    const hero = game.hero;
    if (!hero) return;

    const st = hero.getStats?.() || {
      maxHp: hero.maxHp || 100,
      maxMana: hero.maxMana || 60,
      dmg: 8,
      armor: 0,
      crit: 0.05,
      critMult: 1.6,
    };

    const hpP = clamp((hero.hp || 0) / Math.max(1, st.maxHp || 1), 0, 1);
    const mpP = clamp((hero.mana || 0) / Math.max(1, st.maxMana || 1), 0, 1);
    const xpP = clamp((hero.xp || 0) / Math.max(1, hero.nextXp || 1), 0, 1);

    const x = 14;
    const y = 12;
    const panelW = 350;
    const barW = 228;
    const barH = 14;
    const gap = 8;

    ctx.save();

    ctx.fillStyle = "rgba(10,14,20,0.72)";
    ctx.fillRect(x, y, panelW, 94);

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, 94 - 1);

    ctx.fillStyle = "#eaf0f7";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`Lv ${hero.level || 1}`, x + 12, y + 24);

    ctx.font = "12px Arial";
    ctx.fillStyle = "#cfd7e4";
    ctx.fillText(`Gold ${hero.gold || 0}`, x + 82, y + 22);

    this._drawBar(ctx, x + 12, y + 33, barW, barH, hpP, "#d94c62", "#63222d", `HP ${Math.round(hero.hp || 0)} / ${Math.round(st.maxHp || 0)}`);
    this._drawBar(ctx, x + 12, y + 33 + barH + gap, barW, barH, mpP, "#4f8cff", "#223766", `MP ${Math.round(hero.mana || 0)} / ${Math.round(st.maxMana || 0)}`);
    this._drawBar(ctx, x + 12, y + 33 + (barH + gap) * 2, barW, 10, xpP, "#efc24a", "#6a5622", `XP ${Math.round(hero.xp || 0)} / ${Math.round(hero.nextXp || 0)}`, 11);

    ctx.fillStyle = "#cfd7e4";
    ctx.font = "12px Arial";
    ctx.fillText(`DMG ${Math.round(st.dmg || 0)}`, x + 258, y + 44);
    ctx.fillText(`ARM ${Math.round(st.armor || 0)}`, x + 258, y + 61);
    ctx.fillText(`CRIT ${Math.round((st.crit || 0) * 100)}%`, x + 258, y + 78);

    ctx.restore();
  }

  _drawBar(ctx, x, y, w, h, p, fill, back, label, labelSize = 12) {
    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = back;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

    ctx.fillStyle = fill;
    ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * p), h - 2);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (label) {
      ctx.fillStyle = "#eef4fb";
      ctx.font = `${labelSize}px Arial`;
      ctx.fillText(label, x + 6, y + h - 3);
    }

    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const defs = game?.skillDefs || {};
    const cds = game?.cooldowns || {};
    const hero = game?.hero;
    if (!hero) return;

    const order = ["q", "w", "e", "r"];
    const box = 46;
    const gap = 10;
    const total = order.length * box + (order.length - 1) * gap;
    const x0 = ((this.w - total) / 2) | 0;
    const y = this.h - 68;

    ctx.save();

    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      const d = defs[k];
      const x = x0 + i * (box + gap);
      const ready = (cds[k] || 0) <= 0;
      const manaOK = (hero.mana || 0) >= (d?.mana || 0);

      ctx.fillStyle = ready && manaOK ? "rgba(24,32,44,0.90)" : "rgba(16,18,22,0.88)";
      ctx.fillRect(x, y, box, box);

      ctx.strokeStyle = ready && manaOK ? (d?.color || "#9fd0ff") : "rgba(255,255,255,0.10)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, box - 2, box - 2);

      ctx.fillStyle = d?.color || "#dfe8f5";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "center";
      ctx.fillText((k || "?").toUpperCase(), x + box / 2, y + 22);

      ctx.font = "10px Arial";
      ctx.fillStyle = "#d7dfeb";
      ctx.fillText(d?.name || "", x + box / 2, y + 35);

      if (!ready) {
        ctx.fillStyle = "rgba(0,0,0,0.52)";
        ctx.fillRect(x, y, box, box);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Arial";
        ctx.fillText((cds[k] || 0).toFixed(1), x + box / 2, y + 27);
      }

      if (!manaOK) {
        ctx.fillStyle = "rgba(35,70,120,0.28)";
        ctx.fillRect(x, y, box, box);
      }
    }

    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const world = game?.world;
    const hero = game?.hero;
    if (!world || !hero) return;

    const size = 188;
    const x = this.w - size - 16;
    const y = 16;

    ctx.save();
    ctx.fillStyle = "rgba(10,14,20,0.72)";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    const info = world.getMapInfo?.();
    if (info && info.revealed) {
      this._drawMinimapFromMapInfo(ctx, game, x + 8, y + 8, size - 16, size - 16);
    } else if (this._mini) {
      this._drawMinimapFromCanvas(ctx, game, this._mini, x + 8, y + 8, size - 16);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x + 8, y + 8, size - 16, size - 16);
    }

    ctx.fillStyle = "#d8e1ee";
    ctx.font = "bold 12px Arial";
    ctx.fillText("Map", x + 10, y + size - 8);
    ctx.fillStyle = "#93a4ba";
    ctx.font = "11px Arial";
    ctx.fillText("M open • Z zoom", x + 48, y + size - 8);

    ctx.restore();
  }

  _drawMinimapFromCanvas(ctx, game, mini, x, y, size) {
    const world = game.world;
    const span = this._fallbackMapSpan(world, world?.mapMode || "small");
    const half = span * 0.5;

    const heroNormX = clamp((game.hero.x + half) / span, 0, 1);
    const heroNormY = clamp((game.hero.y + half) / span, 0, 1);

    const srcFrac = 0.22;
    const srcW = Math.max(28, Math.floor(mini.width * srcFrac));
    const srcH = Math.max(28, Math.floor(mini.height * srcFrac));

    let srcX = Math.floor(heroNormX * mini.width - srcW * 0.5);
    let srcY = Math.floor(heroNormY * mini.height - srcH * 0.5);

    srcX = clamp(srcX, 0, Math.max(0, mini.width - srcW));
    srcY = clamp(srcY, 0, Math.max(0, mini.height - srcH));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, srcX, srcY, srcW, srcH, x, y, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();

    const px = x + size * 0.5;
    const py = y + size * 0.5;
    this._drawHeroCrosshair(ctx, x, y, size, px, py);
  }

  _drawMinimapFromMapInfo(ctx, game, x, y, w, h) {
    const info = game.world.getMapInfo();
    const hero = game.hero;

    const zoom = info.scale || 1;
    const worldSpan = 1100 / zoom;
    const half = worldSpan * 0.5;
    const pxPerWorld = w / worldSpan;

    const tile = info.mapTile;
    const startGX = Math.floor((hero.x - half + info.mapHalfSize) / tile);
    const endGX = Math.floor((hero.x + half + info.mapHalfSize) / tile);
    const startGY = Math.floor((hero.y - half + info.mapHalfSize) / tile);
    const endGY = Math.floor((hero.y + half + info.mapHalfSize) / tile);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = "rgba(20,24,30,0.95)";
    ctx.fillRect(x, y, w, h);

    for (let gy = startGY; gy <= endGY; gy++) {
      if (gy < 0 || gy >= info.rows) continue;
      for (let gx = startGX; gx <= endGX; gx++) {
        if (gx < 0 || gx >= info.cols) continue;
        if (!info.revealed?.[gy]?.[gx]) continue;

        const wx = gx * tile - info.mapHalfSize;
        const wy = gy * tile - info.mapHalfSize;
        const color =
          game.world.getMapColorAtWorld?.(wx + tile * 0.5, wy + tile * 0.5) ||
          this._colorFromWorldCell(game.world.getMapCellAtWorld?.(wx + tile * 0.5, wy + tile * 0.5));

        const sx = x + ((wx - (hero.x - half)) * pxPerWorld);
        const sy = y + ((wy - (hero.y - half)) * pxPerWorld);
        const sw = Math.ceil(tile * pxPerWorld) + 1;
        const sh = Math.ceil(tile * pxPerWorld) + 1;

        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, sw, sh);
      }
    }

    this._drawPOIMarkersMini(ctx, game, info, x, y, w, hero.x, hero.y, half, pxPerWorld);

    const px = x + w * 0.5;
    const py = y + h * 0.5;
    this._drawHeroCrosshair(ctx, x, y, w, px, py);

    ctx.restore();
  }

  _drawHeroCrosshair(ctx, x, y, size, px, py) {
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, py + 0.5);
    ctx.lineTo(x + size, py + 0.5);
    ctx.moveTo(px + 0.5, y);
    ctx.lineTo(px + 0.5, y + size);
    ctx.stroke();

    ctx.fillStyle = "rgba(20,20,20,0.92)";
    ctx.fillRect((px - 3) | 0, (py - 3) | 0, 6, 6);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((px - 1) | 0, (py - 1) | 0, 2, 2);
  }

  _drawPOIMarkersMini(ctx, game, info, clipX, clipY, inner, heroX, heroY, half, pxPerWorld) {
    const drawOne = (x, y, fill, r = 3) => {
      const sx = clipX + ((x - (heroX - half)) * pxPerWorld);
      const sy = clipY + ((y - (heroY - half)) * pxPerWorld);
      if (sx < clipX || sx > clipX + inner || sy < clipY || sy > clipY + inner) return;

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    for (const c of info.camps || []) {
      if (!game.world.isRevealedWorld?.(c.x, c.y) && game.world.isRevealedWorld) continue;
      drawOne(c.x, c.y, "#ffb25c", 3);
    }
    for (const w of info.waystones || []) {
      if (!game.world.isRevealedWorld?.(w.x, w.y) && game.world.isRevealedWorld) continue;
      drawOne(w.x, w.y, "#8fd4ff", 3);
    }
    for (const d of info.dungeons || []) {
      if (!game.world.isRevealedWorld?.(d.x, d.y) && game.world.isRevealedWorld) continue;
      drawOne(d.x, d.y, "#c995ff", 3);
    }
    for (const dock of info.docks || []) {
      if (!game.world.isRevealedWorld?.(dock.x, dock.y) && game.world.isRevealedWorld) continue;
      drawOne(dock.x, dock.y, "#d9d4c6", 3);
    }
  }

  _drawMap(ctx, game) {
    const info = game?.world?.getMapInfo?.();
    if (info && info.revealed) {
      this._drawMapFromMapInfo(ctx, game, info);
      return;
    }

    const mini = game?.world?.getMinimapCanvas?.() || this._mini;
    if (mini) {
      this._drawMapFromCanvas(ctx, game, mini);
      return;
    }

    this._drawSimplePanel(ctx, "Map");
  }

  _drawMapFromCanvas(ctx, game, mini) {
    const w = Math.min(980, this.w - 60);
    const h = Math.min(720, this.h - 60);
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    const pad = 18;
    const mapX = x + pad;
    const mapY = y + 56;
    const mapW = w - pad * 2;
    const mapH = h - 76;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.86)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("World Map", x + 18, y + 31);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("M close • Z zoom", x + 18, y + 48);

    ctx.fillStyle = "rgba(20,24,30,0.95)";
    ctx.fillRect(mapX, mapY, mapW, mapH);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, mapX, mapY, mapW, mapH);
    ctx.imageSmoothingEnabled = true;

    const world = game.world;
    const span = this._fallbackMapSpan(world, world?.mapMode || "small");
    const heroNormX = clamp((game.hero.x + span * 0.5) / span, 0, 1);
    const heroNormY = clamp((game.hero.y + span * 0.5) / span, 0, 1);
    const hx = mapX + heroNormX * mapW;
    const hy = mapY + heroNormY * mapH;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawMapFromMapInfo(ctx, game, info) {
    const hero = game.hero;

    const panelW = Math.min(980, this.w - 60);
    const panelH = Math.min(720, this.h - 60);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;
    const pad = 18;
    const mapX = x + pad;
    const mapY = y + 56;
    const mapW = panelW - pad * 2;
    const mapH = panelH - 76;

    ctx.save();

    ctx.fillStyle = "rgba(8,10,14,0.86)";
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("World Map", x + 18, y + 31);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("M close • Z zoom • unknown beyond the edges", x + 18, y + 48);

    const zoom = info.scale || 1;
    const visibleWorldHalf = info.mapHalfSize / zoom;
    const left = -visibleWorldHalf;
    const top = -visibleWorldHalf;
    const span = visibleWorldHalf * 2;

    const pxPerWorldX = mapW / span;
    const pxPerWorldY = mapH / span;
    const tile = info.mapTile;

    ctx.fillStyle = "rgba(20,24,30,0.95)";
    ctx.fillRect(mapX, mapY, mapW, mapH);

    for (let gy = 0; gy < info.rows; gy++) {
      for (let gx = 0; gx < info.cols; gx++) {
        if (!info.revealed?.[gy]?.[gx]) continue;

        const wx = gx * tile - info.mapHalfSize;
        const wy = gy * tile - info.mapHalfSize;
        const color =
          game.world.getMapColorAtWorld?.(wx + tile * 0.5, wy + tile * 0.5) ||
          this._colorFromWorldCell(game.world.getMapCellAtWorld?.(wx + tile * 0.5, wy + tile * 0.5));

        const sx = mapX + (wx - left) * pxPerWorldX;
        const sy = mapY + (wy - top) * pxPerWorldY;
        const sw = Math.ceil(tile * pxPerWorldX) + 1;
        const sh = Math.ceil(tile * pxPerWorldY) + 1;

        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, sw, sh);
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1);

    this._drawPOIMarkersBig(ctx, game, info, mapX, mapY, mapW, mapH, left, top, pxPerWorldX, pxPerWorldY);

    if (Math.abs(hero.x) <= info.mapHalfSize && Math.abs(hero.y) <= info.mapHalfSize) {
      const hx = mapX + (hero.x - left) * pxPerWorldX;
      const hy = mapY + (hero.y - top) * pxPerWorldY;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const lx = x + 18;
    const ly = y + panelH - 14;
    this._legendDot(ctx, lx, ly, "#ffb25c", "Camp");
    this._legendDot(ctx, lx + 92, ly, "#8fd4ff", "Waystone");
    this._legendDot(ctx, lx + 208, ly, "#c995ff", "Dungeon");
    this._legendDot(ctx, lx + 318, ly, "#d9d4c6", "Dock");
    this._legendDot(ctx, lx + 398, ly, "#ffffff", "Hero");

    ctx.restore();
  }

  _drawPOIMarkersBig(ctx, game, info, mapX, mapY, mapW, mapH, left, top, pxPerWorldX, pxPerWorldY) {
    const drawOne = (x, y, fill, label, r = 4) => {
      if (game.world.isRevealedWorld && !game.world.isRevealedWorld(x, y)) return;

      const sx = mapX + (x - left) * pxPerWorldX;
      const sy = mapY + (y - top) * pxPerWorldY;
      if (sx < mapX || sx > mapX + mapW || sy < mapY || sy > mapY + mapH) return;

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (label) {
        ctx.fillStyle = "rgba(240,244,251,0.92)";
        ctx.font = "11px Arial";
        ctx.fillText(label, sx + 7, sy - 6);
      }
    };

    for (const c of info.camps || []) drawOne(c.x, c.y, "#ffb25c", "Camp", 4);
    for (const w of info.waystones || []) drawOne(w.x, w.y, "#8fd4ff", "Waystone", 4);
    for (const d of info.dungeons || []) drawOne(d.x, d.y, "#c995ff", "Dungeon", 4);
    for (const dock of info.docks || []) drawOne(dock.x, dock.y, "#d9d4c6", "Dock", 4);
  }

  _legendDot(ctx, x, y, fill, text) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#d7dfeb";
    ctx.font = "12px Arial";
    ctx.fillText(text, x + 9, y);
  }

  _colorFromWorldCell(cell) {
    if (!cell) return "#2a2f38";
    if (cell.ground === "water") return "#3f87b8";
    if (cell.ground === "unknown_water") return "#22384c";
    if (cell.ground === "unknown_land") return "#3a4334";
    if (cell.ground === "pine") return "#607d4d";
    if (cell.ground === "lush") return "#56ad5d";
    if (cell.ground === "ash") return "#8d7862";
    if (cell.ground === "stone") return "#84857d";
    if (cell.ground === "road") return "#9b885e";
    if (cell.ground === "shore") return "#b9a66d";
    if (cell.ground === "riverbank") return "#829f67";
    return "#74ae64";
  }

  _fallbackMapSpan(world, mode) {
    const r =
      world?.mapHalfSize ||
      world?.boundsRadius ||
      world?.boundsHalfSize ||
      5200;

    if (mode === "large") return r * 2;
    return r * 2;
  }

  _drawHelp(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(10,14,20,0.62)";
    ctx.fillRect(14, this.h - 42, 250, 28);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(14.5, this.h - 41.5, 249, 27);

    ctx.fillStyle = "#cfd7e4";
    ctx.font = "12px Arial";
    ctx.fillText("Arrow keys move • Mouse aim • QWER cast", 24, this.h - 23);
    ctx.restore();
  }

  _drawPrompt(ctx, game) {
    const camp = game?._cachedNearbyCamp;
    const dock = game?._cachedNearbyDock;
    const waystone = game?._cachedNearbyWaystone;
    const dungeon = game?._cachedNearbyDungeon;

    let txt = "";
    if (camp) txt = "F rest at camp";
    else if (dock) txt = "B dock / sail";
    else if (waystone) txt = "F discover waystone";
    else if (dungeon) txt = "F enter dungeon";

    if (!txt) return;

    const w = Math.max(180, ctx.measureText(txt).width + 24);
    const x = ((this.w - w) / 2) | 0;
    const y = this.h - 108;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.74)";
    ctx.fillRect(x, y, w, 28);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 27);

    ctx.fillStyle = "#f2f5fb";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(txt, x + w / 2, y + 18);
    ctx.restore();
  }

  _drawToast(ctx, game) {
    const msg = game?.msg || this._msg;
    const t = game?.msgT || this._msgT;
    if (!msg || t <= 0) return;

    ctx.save();
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.strokeStyle = "rgba(0,0,0,0.52)";
    ctx.lineWidth = 4;
    ctx.strokeText(msg, this.w * 0.5, this.h - 86);
    ctx.fillText(msg, this.w * 0.5, this.h - 86);
    ctx.restore();
  }

  _drawSimplePanel(ctx, title) {
    const w = Math.min(800, this.w - 80);
    const h = Math.min(520, this.h - 80);
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.84)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText(title, x + 18, y + 32);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("Panel placeholder", x + 18, y + 58);
    ctx.restore();
  }
}