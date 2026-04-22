// src/ui.js
// v106.2 FULL UI FILE
// - full HUD / map / inventory / skills / shop
// - prompts / toast / zone text
// - minimap support
// - built for current game.js / world.js / util.js

import { clamp } from "./util.js";

export default class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = canvas?.width || 960;
    this.h = canvas?.height || 540;

    this._mini = null;
    this._miniT = 0;

    this._open = null;
    this._msg = "";
    this._msgT = 0;

    this._miniFrame = document.createElement("canvas");
    this._miniFrame.width = 172;
    this._miniFrame.height = 172;
    this._miniFrameCtx = this._miniFrame.getContext("2d");
    this._miniFrameDirty = true;
    this._miniFrameT = 0;
    this._lastMiniHeroX = 0;
    this._lastMiniHeroY = 0;
  }

  setViewSize(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this._miniFrameDirty = true;
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
    if (this._miniT >= 0.28) {
      this._miniT = 0;
      this._mini = game?.world?.getMinimapCanvas?.() || null;
      this._miniFrameDirty = true;
    }

    this._miniFrameT += dt;
    const hx = game?.hero?.x || 0;
    const hy = game?.hero?.y || 0;
    const heroShift = Math.abs(hx - this._lastMiniHeroX) + Math.abs(hy - this._lastMiniHeroY);

    if (heroShift > 42 || this._miniFrameT >= 0.12) {
      this._miniFrameT = 0;
      this._lastMiniHeroX = hx;
      this._lastMiniHeroY = hy;
      this._miniFrameDirty = true;
    }
  }

  draw(ctx, game) {
    if (!ctx || !game) return;

    this._syncViewFromCanvas();

    this._drawHUD(ctx, game);
    this._drawSpellBar(ctx, game);
    this._drawMinimap(ctx, game);
    this._drawObjective(ctx, game);
    this._drawHelp(ctx);
    this._drawPrompt(ctx, game);
    this._drawToast(ctx, game);
    this._drawZoneText(ctx, game);

    const open = game?.menu?.open || this._open || null;
    if (!open) return;

    if (open === "map") this._drawMap(ctx, game);
    else if (open === "inventory") this._drawInventoryPanel(ctx, game);
    else if (open === "skills") this._drawSkillsPanel(ctx, game);
    else if (open === "shop") this._drawShopPanel(ctx, game);
    else if (open === "quests") this._drawQuestPanel(ctx, game);
    else if (open === "dev") this._drawDevPanel(ctx, game);
    else if (open === "options") this._drawSimplePanel(ctx, "Options", "Options panel restored. Hook settings/actions next.");
    else if (open === "god" || open === "menu" || open === "gear") this._drawSimplePanel(ctx, "Menu", "Menu panel restored.");
  }

  _syncViewFromCanvas() {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect?.();
    this.w = Math.max(1, Math.round(rect?.width || c.clientWidth || c.width || this.w));
    this.h = Math.max(1, Math.round(rect?.height || c.clientHeight || c.height || this.h));
  }

  _drawHUD(ctx, game) {
    const hero = game.hero;
    const stats = hero.getStats?.() || {
      maxHp: hero.maxHp || 100,
      maxMana: hero.maxMana || 60,
      dmg: 8,
      armor: 0,
      crit: 0.05,
    };

    const x = 16;
    const y = 16;
    const w = 330;
    const hpH = 18;
    const manaH = 12;
    const xpH = 8;

    const hpMax = Math.max(1, stats.maxHp || hero.maxHp || 100);
    const manaMax = Math.max(1, stats.maxMana || hero.maxMana || 60);
    const xpNeed = Math.max(1, hero.nextXp || 1);

    const hpFrac = clamp((hero.hp || 0) / hpMax, 0, 1);
    const manaFrac = clamp((hero.mana || 0) / manaMax, 0, 1);
    const xpFrac = clamp((hero.xp || 0) / xpNeed, 0, 1);

    ctx.save();

    ctx.fillStyle = "rgba(8,12,18,0.78)";
    ctx.fillRect(x - 8, y - 8, w + 16, 108);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect(x - 7.5, y - 7.5, w + 15, 107);

    ctx.fillStyle = "#dfe7f2";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Lv ${hero.level || 1}`, x, y + 2);
    ctx.fillText(`Gold ${hero.gold || 0}`, x + 92, y + 2);
    if (game?.dev?.godMode) {
      ctx.fillStyle = "#8fd8ff";
      ctx.fillText("GOD", x + 176, y + 2);
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y + 12, w, hpH);
    ctx.fillStyle = "#cf4d5f";
    ctx.fillRect(x, y + 12, (w * hpFrac) | 0, hpH);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y + 38, w, manaH);
    ctx.fillStyle = "#4d87d6";
    ctx.fillRect(x, y + 38, (w * manaFrac) | 0, manaH);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y + 58, w, xpH);
    ctx.fillStyle = "#d2b766";
    ctx.fillRect(x, y + 58, (w * xpFrac) | 0, xpH);

    ctx.fillStyle = "#f3f6fb";
    ctx.font = "12px Arial";
    ctx.fillText(`HP ${Math.round(hero.hp || 0)} / ${hpMax}`, x + 8, y + 26);
    ctx.fillText(`Mana ${Math.round(hero.mana || 0)} / ${manaMax}`, x + 8, y + 48);
    ctx.fillText(`XP ${hero.xp || 0} / ${xpNeed}`, x + 8, y + 74);

    const potX = x + w - 112;
    ctx.fillStyle = "#e2ebf7";
    ctx.fillText(`1:HP ${hero?.potions?.hp || 0}`, potX, y + 26);
    ctx.fillText(`2:MP ${hero?.potions?.mana || 0}`, potX, y + 48);

    ctx.fillStyle = "#9fb1c7";
    ctx.fillText(`DMG ${stats.dmg || 0}`, x + 8, y + 94);
    ctx.fillText(`ARM ${stats.armor || 0}`, x + 92, y + 94);
    ctx.fillText(`CRIT ${Math.round((stats.crit || 0) * 100)}%`, x + 168, y + 94);

    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const defs = game.skillDefs || {};
    const cds = game.cooldowns || {};
    const hero = game.hero;
    const bottomY = this.h - 62;
    const box = 46;
    const gap = 10;
    const total = box * 4 + gap * 3;
    const startX = ((this.w - total) / 2) | 0;
    const order = ["q", "w", "e", "r"];

    ctx.save();

    for (let i = 0; i < order.length; i++) {
      const key = order[i];
      const def = defs[key];
      const cd = Math.max(0, cds[key] || 0);
      const x = startX + i * (box + gap);
      const y = bottomY;

      ctx.fillStyle = "rgba(10,14,20,0.82)";
      ctx.fillRect(x, y, box, box);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.strokeRect(x + 0.5, y + 0.5, box - 1, box - 1);

      ctx.fillStyle = def?.color || "#a9c3ff";
      ctx.globalAlpha = 0.22;
      ctx.fillRect(x + 4, y + 4, box - 8, box - 8);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#eef4ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 16px Arial";
      ctx.fillText((key || "?").toUpperCase(), x + box * 0.5, y + box * 0.5 - 3);

      ctx.font = "10px Arial";
      ctx.fillStyle = "#9ab2cf";
      ctx.fillText(`${def?.mana || 0}`, x + box * 0.5, y + box - 8);

      const manaOK = (hero?.mana || 0) >= (def?.mana || 0);

      if (cd > 0) {
        const frac = clamp(cd / Math.max(0.01, def?.cd || 1), 0, 1);
        ctx.fillStyle = "rgba(8,10,14,0.64)";
        ctx.fillRect(x, y, box, box * frac);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px Arial";
        ctx.fillText(cd.toFixed(1), x + box * 0.5, y + box * 0.5 + 9);
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

    if (this._miniFrameDirty) {
      this._rebuildMiniFrame(game);
      this._miniFrameDirty = false;
    }

    ctx.save();
    ctx.fillStyle = "rgba(10,14,20,0.72)";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    ctx.drawImage(this._miniFrame, x + 8, y + 8, size - 16, size - 16);

    ctx.fillStyle = "#d8e1ee";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Map", x + 10, y + size - 8);
    ctx.restore();
  }

  _rebuildMiniFrame(game) {
    const c = this._miniFrameCtx;
    if (!c) return;

    const w = this._miniFrame.width;
    const h = this._miniFrame.height;

    c.clearRect(0, 0, w, h);

    const info = game?.world?.getMapInfo?.();
    if (info?.revealed) {
      this._drawMinimapFromMapInfo(c, game, 0, 0, w, h);
      return;
    }

    if (this._mini) {
      this._drawMinimapFromCanvas(c, game, this._mini, 0, 0, w);
      return;
    }

    c.fillStyle = "rgba(255,255,255,0.06)";
    c.fillRect(0, 0, w, h);
  }

  _drawMinimapFromCanvas(ctx, game, mini, x, y, size) {
    const span = (game.world?.mapHalfSize || 5200) * 2;
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

    this._drawHeroCrosshair(ctx, x, y, size, x + size * 0.5, y + size * 0.5);
  }

  _drawMinimapFromMapInfo(ctx, game, x, y, w, h) {
    const info = game.world.getMapInfo();
    const hero = game.hero;

    const worldSpan = 1100;
    const half = worldSpan * 0.5;
    const pxPerWorld = w / worldSpan;

    const left = hero.x - half;
    const top = hero.y - half;

    const revealed = info.revealed;
    const cols = revealed[0]?.length || 0;
    const rows = revealed.length || 0;
    if (!rows || !cols) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x, y, w, h);
      return;
    }

    const mapHalf = game.world.mapHalfSize || 5200;
    const worldFull = mapHalf * 2;

    const worldToCellX = (wx) => clamp(Math.floor(((wx + mapHalf) / worldFull) * cols), 0, cols - 1);
    const worldToCellY = (wy) => clamp(Math.floor(((wy + mapHalf) / worldFull) * rows), 0, rows - 1);

    const cellWorldW = worldFull / cols;
    const cellWorldH = worldFull / rows;

    const c0 = worldToCellX(left);
    const c1 = worldToCellX(left + worldSpan);
    const r0 = worldToCellY(top);
    const r1 = worldToCellY(top + worldSpan);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!revealed[r]?.[c]) continue;

        const wx = -mapHalf + c * cellWorldW;
        const wy = -mapHalf + r * cellWorldH;
        const sx = x + (wx - left) * pxPerWorld;
        const sy = y + (wy - top) * pxPerWorld;
        const sw = Math.ceil(cellWorldW * pxPerWorld) + 1;
        const sh = Math.ceil(cellWorldH * pxPerWorld) + 1;

        const tile =
          info.tiles?.[r]?.[c] ||
          info.colors?.[r]?.[c] ||
          "#4f6b5a";

        ctx.fillStyle = tile;
        ctx.fillRect(sx, sy, sw, sh);
      }
    }

    ctx.restore();
    this._drawHeroCrosshair(ctx, x, y, w, x + w * 0.5, y + h * 0.5);
  }

  _drawHeroCrosshair(ctx, x, y, size, hx, hy) {
    ctx.save();

    ctx.strokeStyle = "rgba(10,20,34,0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy);
    ctx.lineTo(hx + 7, hy);
    ctx.moveTo(hx, hy - 7);
    ctx.lineTo(hx, hy + 7);
    ctx.stroke();

    ctx.strokeStyle = "#f2f7ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy);
    ctx.lineTo(hx + 6, hy);
    ctx.moveTo(hx, hy - 6);
    ctx.lineTo(hx, hy + 6);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.restore();
  }

  _drawHelp(ctx) {
    const lines = [
      "Arrow Keys move",
      "Mouse aim",
      "Q/W/E/R skills",
      "1/2 potions",
      "F interact",
      "B dock/sail",
      "M map",
      "I inventory",
      "K skills",
      "J quests",
      "G dev",
      "Esc close",
    ];

    const x = 16;
    const y = this.h - 164;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.50)";
    ctx.fillRect(x - 8, y - 16, 150, 172);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x - 7.5, y - 15.5, 149, 171);

    ctx.fillStyle = "#dfe7f2";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Controls", x, y);

    ctx.font = "12px Arial";
    ctx.fillStyle = "#9fb1c7";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + 20 + i * 12);
    }
    ctx.restore();
  }

  _drawObjective(ctx, game) {
    const objective = game?.getObjective?.();
    if (!objective) return;

    const x = 16;
    const y = 134;
    const w = Math.min(360, Math.max(260, this.w - 32));
    const h = 70;

    ctx.save();
    ctx.fillStyle = "rgba(8,12,18,0.72)";
    ctx.fillRect(x - 8, y - 8, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect(x - 7.5, y - 7.5, w - 1, h - 1);

    ctx.fillStyle = objective.color || "#ffd36e";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Objective", x, y + 2);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 14px Arial";
    ctx.fillText(objective.title || "Explore", x, y + 22);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px Arial";
    ctx.fillText(objective.detail || "", x, y + 42);

    if (objective.target && game?.hero) {
      const dx = objective.target.x - game.hero.x;
      const dy = objective.target.y - game.hero.y;
      const angle = Math.atan2(dy, dx);
      const cx = x + w - 38;
      const cy = y + 26;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = objective.color || "#ffd36e";
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const dist = Math.max(0, Math.round(Math.hypot(dx, dy) / 10) * 10);
      ctx.fillStyle = "#c7d4e6";
      ctx.font = "11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${dist}`, cx, y + 56);
    }

    ctx.restore();
  }

  _drawPrompt(ctx, game) {
    let text = "";

    if (game?.dungeon?.active) text = "F: Descend deeper";
    else if (game?._cachedNearbyCamp) text = "F: Camp shop";
    else if (game?._cachedNearbyWaystone) text = "F: Use waystone";
    else if (game?._cachedNearbyShrine) text = "F: Claim shrine";
    else if (game?._cachedNearbyCache) text = "F: Open cache";
    else if (game?._cachedNearbyDragonLair) text = "F: Wake dragon";
    else if (game?._cachedNearbyDungeon) text = "F: Enter dungeon";
    else if (game?._cachedNearbyDock) text = game?.hero?.state?.sailing ? "B: Dock" : "B: Sail";

    if (!text) return;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.74)";
    ctx.fillRect((this.w - 170) / 2, this.h - 112, 170, 30);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect((this.w - 170) / 2 + 0.5, this.h - 111.5, 169, 29);

    ctx.fillStyle = "#edf3fb";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, this.w * 0.5, this.h - 92);
    ctx.restore();
  }

  _drawToast(ctx, game) {
    const msg = game?.msg || this._msg || "";
    const msgT = Math.max(game?.msgT || 0, this._msgT || 0);
    if (!msg || msgT <= 0) return;

    ctx.save();
    ctx.globalAlpha = clamp(msgT / 0.25, 0, 1);

    const w = Math.min(360, Math.max(170, msg.length * 8 + 30));
    const x = ((this.w - w) / 2) | 0;
    const y = 18;

    ctx.fillStyle = "rgba(8,10,14,0.84)";
    ctx.fillRect(x, y, w, 30);
    ctx.strokeStyle = "rgba(255,255,255,0.11)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 29);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(msg, x + w / 2, y + 20);
    ctx.restore();
  }

  _drawZoneText(ctx, game) {
    const zone = game?.zoneMsg || "";
    const t = game?.zoneMsgT || 0;
    if (!zone || t <= 0) return;

    ctx.save();
    ctx.globalAlpha = clamp(t / 0.25, 0, 1);
    ctx.fillStyle = "#dbe8f6";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(zone, this.w * 0.5, 72);
    ctx.restore();
  }

  _drawMap(ctx, game) {
    const panelW = Math.min(Math.max(this.w - 60, 280), 820);
    const panelH = Math.min(Math.max(this.h - 60, 220), 820);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    ctx.fillText("World Map", x + 18, y + 28);

    const mapX = x + 18;
    const mapY = y + 42;
    const mapW = panelW - 36;
    const mapH = panelH - 72;

    ctx.fillStyle = "rgba(2,4,8,0.95)";
    ctx.fillRect(mapX, mapY, mapW, mapH);

    const info = game?.world?.getMapInfo?.();
    if (info?.revealed) {
      this._drawBigMapFromMapInfo(ctx, game, info, mapX, mapY, mapW, mapH);
    } else if (this._mini) {
      this._drawBigMapFromCanvas(ctx, game, this._mini, mapX, mapY, mapW, mapH);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(mapX, mapY, mapW, mapH);
    }

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("M or Esc to close", x + 18, y + panelH - 12);
    ctx.restore();
  }

  _drawBigMapFromCanvas(ctx, game, mini, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();

    const span = (game.world?.mapHalfSize || 5200) * 2;
    const half = span * 0.5;
    const hx = x + clamp((game.hero.x + half) / span, 0, 1) * w;
    const hy = y + clamp((game.hero.y + half) / span, 0, 1) * h;

    this._drawHeroCrosshair(ctx, x, y, w, hx, hy);
  }

  _drawBigMapFromMapInfo(ctx, game, info, x, y, w, h) {
    const revealed = info.revealed;
    const rows = revealed.length || 0;
    const cols = revealed[0]?.length || 0;

    if (!rows || !cols) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(x, y, w, h);
      return;
    }

    const cw = w / cols;
    const ch = h / rows;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = "rgba(2,4,8,0.95)";
    ctx.fillRect(x, y, w, h);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!revealed[r]?.[c]) continue;
        ctx.fillStyle =
          info.tiles?.[r]?.[c] ||
          info.colors?.[r]?.[c] ||
          "#526b59";
        ctx.fillRect(x + c * cw, y + r * ch, Math.ceil(cw) + 1, Math.ceil(ch) + 1);
      }
    }

    ctx.restore();

    const mapHalf = game.world?.mapHalfSize || 5200;
    const span = mapHalf * 2;
    const hx = x + clamp((game.hero.x + mapHalf) / span, 0, 1) * w;
    const hy = y + clamp((game.hero.y + mapHalf) / span, 0, 1) * h;

    this._drawHeroCrosshair(ctx, x, y, w, hx, hy);
  }

  _drawInventoryPanel(ctx, game) {
    const hero = game.hero;
    const items = hero.inventory || [];
    const equip = hero.equip || {};

    const panelW = Math.min(Math.max(this.w - 90, 700), 860);
    const panelH = Math.min(Math.max(this.h - 90, 430), 540);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Inventory", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("I or Esc to close", x + 18, y + 52);

    const leftX = x + 18;
    const leftY = y + 74;
    const leftW = 370;
    const leftH = panelH - 92;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(leftX, leftY, leftW, leftH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(leftX + 0.5, leftY + 0.5, leftW - 1, leftH - 1);

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 15px Arial";
    ctx.fillText(`Bag (${items.length})`, leftX + 12, leftY + 22);

    const rowH = 28;
    const visible = Math.max(1, Math.floor((leftH - 40) / rowH));
    const selected = clamp(game?.invIndex || 0, 0, Math.max(0, items.length - 1));
    const scroll = clamp(selected - visible + 1, 0, Math.max(0, items.length - visible));

    for (let i = 0; i < visible; i++) {
      const idx = scroll + i;
      if (idx >= items.length) break;

      const item = items[idx];
      const iy = leftY + 32 + i * rowH;
      const active = idx === selected;

      if (active) {
        ctx.fillStyle = "rgba(120,160,220,0.22)";
        ctx.fillRect(leftX + 8, iy - 16, leftW - 16, rowH - 2);
        ctx.strokeStyle = "rgba(170,210,255,0.32)";
        ctx.strokeRect(leftX + 8.5, iy - 15.5, leftW - 17, rowH - 3);
      }

      ctx.fillStyle = item?.color || "#d9dee8";
      ctx.font = "bold 13px Arial";
      ctx.fillText(item?.name || "Unknown Gear", leftX + 16, iy);

      ctx.fillStyle = "#92a3b8";
      ctx.font = "12px Arial";
      ctx.fillText(
        `${(item?.slot || "gear").toUpperCase()}  Lv.${item?.level || 1}  ${(item?.rarity || "common").toUpperCase()}`,
        leftX + 190,
        iy
      );
    }

    const rightX = x + 408;
    const rightY = leftY;
    const rightW = panelW - (rightX - x) - 18;
    const rightH = leftH;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(rightX, rightY, rightW, rightH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(rightX + 0.5, rightY + 0.5, rightW - 1, rightH - 1);

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 15px Arial";
    ctx.fillText("Equipped", rightX + 12, rightY + 22);

    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const item = equip[slot];
      const iy = rightY + 46 + i * 34;

      ctx.fillStyle = "#9db0c8";
      ctx.font = "12px Arial";
      ctx.fillText(slot.toUpperCase(), rightX + 12, iy);

      ctx.fillStyle = item?.color || "#dce6f4";
      ctx.font = "bold 13px Arial";
      ctx.fillText(item?.name || "-", rightX + 110, iy);
    }

    const picked = items[selected];
    const statX = rightX + 12;
    let sy = rightY + 272;

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 15px Arial";
    ctx.fillText("Selected Item", statX, sy);
    sy += 22;

    if (picked) {
      ctx.fillStyle = picked.color || "#eef4fb";
      ctx.font = "bold 14px Arial";
      ctx.fillText(picked.name || "Unknown Gear", statX, sy);
      sy += 20;

      ctx.fillStyle = "#9cb0c9";
      ctx.font = "12px Arial";
      ctx.fillText(
        `${(picked.slot || "gear").toUpperCase()}  Lv.${picked.level || 1}  ${(picked.rarity || "common").toUpperCase()}`,
        statX,
        sy
      );
      sy += 20;

      const stats = picked.stats || {};
      const lines = [];
      if (stats.dmg) lines.push(`Damage +${stats.dmg}`);
      if (stats.armor) lines.push(`Armor +${stats.armor}`);
      if (stats.hp) lines.push(`Max HP +${stats.hp}`);
      if (stats.mana) lines.push(`Max Mana +${stats.mana}`);
      if (stats.crit) lines.push(`Crit +${Math.round(stats.crit * 100)}%`);
      if (stats.critMult) lines.push(`Crit Power +${Math.round(stats.critMult * 100)}%`);
      if (stats.move) lines.push(`Move +${Math.round(stats.move * 100)}%`);

      ctx.fillStyle = "#dfe8f5";
      for (const line of lines) {
        ctx.fillText(line, statX, sy);
        sy += 18;
      }

      sy += 12;
      ctx.fillStyle = "#95a7bd";
      ctx.fillText("Enter/E equip", statX, sy);
      sy += 16;
      ctx.fillText("X/Delete salvage", statX, sy);
    } else {
      ctx.fillStyle = "#8ea1b8";
      ctx.font = "12px Arial";
      ctx.fillText("No item selected.", statX, sy);
    }

    ctx.restore();
  }

  _drawSkillsPanel(ctx, game) {
    const panelW = Math.min(Math.max(this.w - 110, 520), 620);
    const panelH = Math.min(Math.max(this.h - 120, 360), 400);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;

    const defs = game.skillDefs || {};
    const prog = game.skillProg || {};

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Skills", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("K or Esc to close", x + 18, y + 52);

    const order = ["q", "w", "e", "r"];
    let sy = y + 90;

    for (const key of order) {
      const def = defs[key];
      const s = prog[key] || { xp: 0, level: 1 };
      const need = 10 + (s.level - 1) * 8;
      const frac = clamp((s.xp || 0) / Math.max(1, need), 0, 1);

      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 18, sy - 18, panelW - 36, 58);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(x + 18.5, sy - 17.5, panelW - 37, 57);

      ctx.fillStyle = def?.color || "#dbe7ff";
      ctx.font = "bold 16px Arial";
      ctx.fillText(`${(key || "?").toUpperCase()}  ${def?.name || "Skill"}`, x + 30, sy);

      ctx.fillStyle = "#9bb0c8";
      ctx.font = "12px Arial";
      ctx.fillText(`Mana ${def?.mana || 0}`, x + 190, sy);
      ctx.fillText(`Cooldown ${(def?.cd || 0).toFixed(1)}s`, x + 270, sy);
      ctx.fillText(`Level ${s.level || 1}`, x + 400, sy);

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + 30, sy + 10, panelW - 120, 10);
      ctx.fillStyle = def?.color || "#b7ceff";
      ctx.fillRect(x + 30, sy + 10, ((panelW - 120) * frac) | 0, 10);

      ctx.fillStyle = "#dce6f4";
      ctx.fillText(`XP ${s.xp || 0} / ${need}`, x + panelW - 120, sy + 19);

      sy += 74;
    }

    ctx.restore();
  }

  _drawShopPanel(ctx, game) {
    const w = 430;
    const h = 260;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;

    const items = game?.shop?.items || [];

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Camp Shop", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("1-4 buy • Esc close", x + 18, y + 48);

    ctx.fillStyle = "#d7dfeb";
    ctx.font = "bold 13px Arial";
    ctx.fillText(`Gold: ${game?.hero?.gold || 0}`, x + w - 110, y + 30);

    const discount = Math.round((game?.shop?.discount || 0) * 100);
    if (discount > 0) {
      ctx.fillStyle = "#94e48d";
      ctx.font = "12px Arial";
      ctx.fillText(`Renown discount: ${discount}%`, x + w - 170, y + 48);
    }

    for (let i = 0; i < 4; i++) {
      const item = items[i];
      const yy = y + 70 + i * 42;

      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 16, yy - 16, w - 32, 32);

      ctx.fillStyle = "#dfe8f5";
      ctx.font = "13px Arial";
      if (item) {
        ctx.fillText(`${i + 1}. ${item.name}`, x + 24, yy + 4);
        ctx.fillStyle = "#ffd98a";
        ctx.fillText(`${item.price}g`, x + w - 80, yy + 4);
      } else {
        ctx.fillStyle = "#7d899a";
        ctx.fillText(`${i + 1}. Sold out`, x + 24, yy + 4);
      }
    }

    ctx.restore();
  }

  _drawQuestPanel(ctx, game) {
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 380;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    const q = game?.quest || {};
    const count = q.count || 0;
    const needed = Math.max(1, q.needed || 1);
    const frac = clamp(count / needed, 0, 1);
    const target = this._titleCase(q.target || "monster");

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.93)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Quests", x + 18, y + 32);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("J or Esc to close", x + 18, y + 54);

    const shards = game?.progress?.relicShards || 0;
    const next = shards < 3 ? 3 : shards < 7 ? 7 : shards < 12 ? 12 : shards < 20 ? 20 : 20;
    const storyFrac = clamp(shards / Math.max(1, next), 0, 1);

    ctx.fillStyle = "rgba(201,167,255,0.08)";
    ctx.fillRect(x + 18, y + 78, w - 36, 88);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 78.5, w - 37, 87);

    ctx.fillStyle = "#c9a7ff";
    ctx.font = "bold 16px Arial";
    ctx.fillText("Restore the Ash Crown", x + 34, y + 106);

    ctx.fillStyle = "#b7c6da";
    ctx.font = "13px Arial";
    ctx.fillText(`Relic shards: ${shards} / ${next}`, x + 34, y + 130);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 34, y + 142, w - 68, 10);
    ctx.fillStyle = "#c9a7ff";
    ctx.fillRect(x + 34, y + 142, ((w - 68) * storyFrac) | 0, 10);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 184, w - 36, 112);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 184.5, w - 37, 111);

    ctx.fillStyle = "#ffd86e";
    ctx.font = "bold 17px Arial";
    ctx.fillText(`Bounty: Cull ${target}s`, x + 34, y + 214);

    ctx.fillStyle = "#b7c6da";
    ctx.font = "13px Arial";
    ctx.fillText(`${count} / ${needed} defeated`, x + 34, y + 238);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 34, y + 254, w - 68, 12);
    ctx.fillStyle = "#ffd86e";
    ctx.fillRect(x + 34, y + 254, ((w - 68) * frac) | 0, 12);

    ctx.fillStyle = "#dfe8f5";
    ctx.font = "13px Arial";
    ctx.fillText(`Reward: ${q.rewardGold || 0}g, ${q.rewardXp || 0} XP, and gear`, x + 34, y + 286);

    const completed = game?.progress?.bountyCompletions || 0;
    const elites = game?.progress?.eliteKills || 0;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 316, w - 36, 42);

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Renown", x + 34, y + 340);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "13px Arial";
    ctx.fillText(`Bounties completed: ${completed}`, x + 34, y + 354);
    ctx.fillText(`Elites defeated: ${elites}`, x + 250, y + 354);

    ctx.restore();
  }

  _titleCase(text) {
    const s = String(text || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  _drawDevPanel(ctx, game) {
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 290;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    const world = game?.world;
    const explored = world?.exportDiscovery?.()?.length || 0;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.93)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 21px Arial";
    ctx.fillText("Dev Tools", x + 18, y + 32);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px Arial";
    ctx.fillText("G or Esc to close", x + 18, y + 52);

    const lines = [
      "1 heal HP and mana",
      "2 add 250 gold",
      "3 grant one level worth of XP",
      "4 reveal entire world map",
      "5 spawn a dragon nearby",
      "6 teleport near closest dragon lair",
      `7 god mode ${game?.dev?.godMode ? "ON" : "OFF"}`,
      `Explored cells: ${explored}`,
      `World span: ${((world?.mapHalfSize || 0) * 2).toLocaleString()} units`,
    ];

    ctx.font = "14px Arial";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i < 7 ? "#dfe8f5" : "#8ea1b8";
      ctx.fillText(lines[i], x + 28, y + 86 + i * 24);
    }

    ctx.restore();
  }

  _drawSimplePanel(ctx, title, body = "") {
    const panelW = Math.min(Math.max(this.w - 140, 320), 520);
    const panelH = Math.min(Math.max(this.h - 160, 220), 260);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "left";
    ctx.fillText(title, x + 20, y + 34);

    if (body) {
      ctx.fillStyle = "#a7b8cc";
      ctx.font = "14px Arial";
      this._drawWrappedText(ctx, body, x + 20, y + 74, panelW - 40, 20);
    }

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("Esc to close", x + 20, y + panelH - 14);

    ctx.restore();
  }

  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let yy = y;

    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = words[i];
        yy += lineHeight;
      } else {
        line = test;
      }
    }

    if (line) {
      ctx.fillText(line, x, yy);
    }
  }
}
