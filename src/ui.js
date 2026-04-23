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
      this._mini = game?.world?._mapInfo ? null : (game?.world?.getMinimapCanvas?.() || null);
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
    this._drawHelp(ctx, game);
    this._drawTouchControls(ctx, game);
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
    else if (open === "town") this._drawTownPanel(ctx, game);
    else if (open === "dev") this._drawDevPanel(ctx, game);
    else if (open === "options" || open === "god" || open === "menu" || open === "gear") this._drawStatusPanel(ctx, game);
  }

  _syncViewFromCanvas() {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect?.();
    this.w = Math.max(1, Math.round(rect?.width || c.clientWidth || c.width || this.w));
    this.h = Math.max(1, Math.round(rect?.height || c.clientHeight || c.height || this.h));
  }

  _drawPanel(ctx, x, y, w, h, opts = {}) {
    const alpha = opts.alpha ?? 0.84;
    const accent = opts.accent || "rgba(230,190,104,0.48)";

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(x + 4, y + 5, w, h);

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(19,25,32,${alpha})`);
    g.addColorStop(1, `rgba(7,10,15,${Math.min(0.96, alpha + 0.08)})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = "rgba(0,0,0,0.34)";
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);

    ctx.fillStyle = accent;
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.restore();
  }

  _drawBar(ctx, x, y, w, h, frac, colorA, colorB, label = "") {
    const f = clamp(frac || 0, 0, 1);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const fillW = Math.max(0, Math.floor((w - 2) * f));
    if (fillW > 0) {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, colorA);
      g.addColorStop(1, colorB || colorA);
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, fillW, h - 2);
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.fillRect(x + 1, y + 1, fillW, Math.max(2, Math.floor(h * 0.28)));
    }

    if (label) {
      ctx.fillStyle = "#f5f7fb";
      ctx.font = "bold 11px 'Segoe UI', Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 8, y + h * 0.5 + 0.5);
    }
    ctx.restore();
  }

  _drawKeyCap(ctx, x, y, key, label, active = false) {
    const keyW = Math.max(28, Math.min(54, String(key || "").length * 7 + 12));
    ctx.save();
    ctx.fillStyle = active ? "rgba(231,190,91,0.22)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y - 9, keyW, 16);
    ctx.strokeStyle = active ? "rgba(255,220,132,0.50)" : "rgba(255,255,255,0.14)";
    ctx.strokeRect(x + 0.5, y - 8.5, keyW - 1, 15);
    ctx.fillStyle = active ? "#ffe6a3" : "#dfe7f2";
    ctx.font = "bold 10px 'Segoe UI', Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(key, x + keyW * 0.5, y - 1);
    ctx.textAlign = "left";
    ctx.fillStyle = "#9fb1c7";
    ctx.font = "11px 'Segoe UI', Arial";
    this._drawFitText(ctx, label, x + keyW + 7, y - 1, 102);
    ctx.restore();
  }

  _drawFitText(ctx, text, x, y, maxWidth, minSize = 9) {
    const raw = String(text ?? "");
    if (!raw) return;

    const font = ctx.font || "12px Arial";
    const match = font.match(/(\d+(?:\.\d+)?)px/);
    const base = match ? Number.parseFloat(match[1]) : 12;
    const prefix = font.replace(/(\d+(?:\.\d+)?)px/, "__SIZE__px");
    let size = base;

    while (size > minSize && ctx.measureText(raw).width > maxWidth) {
      size -= 1;
      ctx.font = prefix.replace("__SIZE__", String(size));
    }

    let out = raw;
    if (ctx.measureText(out).width > maxWidth) {
      while (out.length > 1 && ctx.measureText(out + "...").width > maxWidth) {
        out = out.slice(0, -1);
      }
      out = out.length < raw.length ? `${out}...` : out;
    }

    ctx.fillText(out, x, y);
    ctx.font = font;
  }

  _drawClampedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
    const raw = String(text || "").trim();
    if (!raw || maxLines <= 0) return 0;

    const words = raw.split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);

    for (let i = 0; i < lines.length; i++) {
      let out = lines[i];
      if (i === maxLines - 1 && words.join(" ").length > lines.join(" ").length) {
        while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1);
        out = `${out}...`;
      }
      this._drawFitText(ctx, out, x, y + i * lineHeight, maxWidth);
    }

    return lines.length;
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

    this._drawPanel(ctx, x - 8, y - 8, w + 16, 108, { accent: "rgba(232,190,96,0.54)" });

    ctx.fillStyle = "#f3f0dc";
    ctx.font = "bold 15px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Lv ${hero.level || 1}`, x, y + 2);
    ctx.fillStyle = "#ffd779";
    ctx.fillText(`Gold ${hero.gold || 0}`, x + 88, y + 2);
    if (game?.dev?.godMode) {
      ctx.fillStyle = "rgba(92,210,255,0.16)";
      ctx.fillRect(x + 174, y - 11, 48, 18);
      ctx.strokeStyle = "rgba(128,224,255,0.35)";
      ctx.strokeRect(x + 174.5, y - 10.5, 47, 17);
      ctx.fillStyle = "#8fd8ff";
      ctx.fillText("GOD", x + 184, y + 2);
    }

    this._drawBar(ctx, x, y + 12, w, hpH, hpFrac, "#b53045", "#f06d73", `HP ${Math.round(hero.hp || 0)} / ${hpMax}`);
    this._drawBar(ctx, x, y + 38, w, manaH, manaFrac, "#2f65be", "#6db8ff", `Mana ${Math.round(hero.mana || 0)} / ${manaMax}`);
    this._drawBar(ctx, x, y + 58, w, xpH, xpFrac, "#a9852d", "#efd072");

    ctx.fillStyle = "#c8d2df";
    ctx.font = "11px 'Segoe UI', Arial";
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

      this._drawPanel(ctx, x, y, box, box, { alpha: 0.78, accent: def?.color || "rgba(220,225,235,0.32)" });

      ctx.fillStyle = def?.color || "#a9c3ff";
      ctx.globalAlpha = 0.22;
      ctx.fillRect(x + 5, y + 5, box - 10, box - 10);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#eef4ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 16px 'Segoe UI', Arial";
      ctx.fillText((key || "?").toUpperCase(), x + box * 0.5, y + box * 0.5 - 3);

      ctx.font = "10px 'Segoe UI', Arial";
      ctx.fillStyle = "#9ab2cf";
      ctx.fillText(`${def?.mana || 0} MP`, x + box * 0.5, y + box - 8);

      const manaOK = (hero?.mana || 0) >= (def?.mana || 0);

      if (cd > 0) {
        const frac = clamp(cd / Math.max(0.01, def?.cd || 1), 0, 1);
        ctx.fillStyle = "rgba(3,5,8,0.70)";
        ctx.fillRect(x, y, box, box * frac);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px 'Segoe UI', Arial";
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

    const size = 178;
    const x = this.w - size - 16;
    const y = 16;
    const cx = x + size * 0.5;
    const cy = y + size * 0.5;
    const r = size * 0.5 - 4;

    if (this._miniFrameDirty) {
      this._rebuildMiniFrame(game);
      this._miniFrameDirty = false;
    }

    ctx.save();
    ctx.fillStyle = "rgba(5,9,14,0.72)";
    ctx.beginPath();
    ctx.arc(cx + 3, cy + 4, r + 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(12,18,25,0.92)";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this._miniFrame, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    ctx.strokeStyle = "rgba(142,214,232,0.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#8fd8ff";
    ctx.font = "bold 12px 'Segoe UI', Arial";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, y + 16);
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

    this._drawHeroCrosshair(ctx, x, y, size, x + size * 0.5, y + size * 0.5, false);
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

    this._drawMapPoiMarkers(ctx, game, x, y, w, h, left, top, worldSpan, 2.4);

    ctx.restore();
    this._drawHeroCrosshair(ctx, x, y, w, x + w * 0.5, y + h * 0.5, false);
  }

  _drawHeroCrosshair(ctx, x, y, size, hx, hy, drawBorder = true) {
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

    if (drawBorder) {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
    ctx.restore();
  }

  _drawHelp(ctx, game) {
    const touchLikely = !!game?.touch?.enabled || this.w < 560 || (this.w < 780 && this.h < 460);
    if (touchLikely) {
      this._drawTouchHint(ctx);
      return;
    }

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
      "O status",
      "G dev",
      "Esc close",
    ];

    const x = 16;
    const y = this.h - 198;

    ctx.save();
    this._drawPanel(ctx, x - 8, y - 16, 164, 206, { alpha: 0.56, accent: "rgba(148,170,190,0.28)" });

    ctx.fillStyle = "#dfe7f2";
    ctx.font = "bold 13px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    ctx.fillText("Controls", x, y);

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(" ");
      const key = parts.shift() || "";
      this._drawKeyCap(ctx, x, y + 24 + i * 14, key, parts.join(" "), false);
    }
    ctx.restore();
  }

  _drawTouchHint(ctx) {
    const text = "Touch: left move, right skills";
    const w = 210;
    const x = 14;
    const y = Math.max(226, this.h - 190);

    ctx.save();
    this._drawPanel(ctx, x, y, w, 28, { alpha: 0.46, accent: "rgba(142,214,232,0.30)" });
    ctx.fillStyle = "#b9c8da";
    ctx.font = "bold 11px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, text, x + 10, y + 18, w - 20, 8);
    ctx.restore();
  }

  _drawTouchControls(ctx, game) {
    const touch = game?.touch;
    const show = !!touch?.enabled || this.w < 560 || (this.w < 780 && this.h < 460) || (touch?.recentT || 0) > 0;
    if (!show || game?.menu?.open) return;

    ctx.save();
    const alpha = touch?.moveId != null ? 0.58 : 0.36;
    const baseX = touch?.moveId != null ? touch.baseX : 86;
    const baseY = touch?.moveId != null ? touch.baseY : this.h - 96;
    const knobX = touch?.moveId != null ? touch.x : baseX;
    const knobY = touch?.moveId != null ? touch.y : baseY;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(8,14,22,0.58)";
    ctx.beginPath();
    ctx.arc(baseX, baseY, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,220,255,0.26)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(142,214,232,0.45)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const layout = game?._touchButtonLayout?.() || {};
    const labels = { q: "Q", w: "W", e: "E", r: "R", f: "F", b: "B" };
    for (const [key, b] of Object.entries(layout)) {
      const down = touch?.buttons?.[key] != null;
      ctx.globalAlpha = down ? 0.78 : 0.48;
      ctx.fillStyle = down ? "rgba(232,190,96,0.34)" : "rgba(8,14,22,0.62)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = down ? "rgba(255,220,132,0.72)" : "rgba(255,255,255,0.20)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = key === "f" || key === "b" ? "#ffd98a" : "#eef4fb";
      ctx.font = `bold ${key === "f" || key === "b" ? 13 : 15}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[key] || key.toUpperCase(), b.x, b.y + 0.5);
    }

    ctx.restore();
  }

  _drawObjective(ctx, game) {
    const objective = game?.getObjective?.();
    if (!objective) return;

    const x = 16;
    const y = 134;
    const w = Math.min(360, Math.max(260, this.w - 32));
    const h = 104;
    const hasTarget = !!(objective.target && game?.hero);
    const arrowW = hasTarget ? 70 : 0;
    const textW = w - 24 - arrowW;

    ctx.save();
    this._drawPanel(ctx, x - 8, y - 8, w, h, { alpha: 0.72, accent: objective.color || "rgba(255,211,110,0.52)" });

    ctx.fillStyle = objective.color || "#ffd36e";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Objective", x, y + 2);

    const track = game?.trackedObjective || "story";
    ctx.fillStyle = "#8fa2bb";
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, `Tracking ${this._titleCase(track)}`, x + 88, y + 2, Math.max(90, textW - 88), 8);

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 14px Arial";
    this._drawFitText(ctx, objective.title || "Explore", x, y + 24, textW);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px Arial";
    this._drawClampedText(ctx, objective.detail || "", x, y + 46, textW, 15, 3);

    if (hasTarget) {
      const dx = objective.target.x - game.hero.x;
      const dy = objective.target.y - game.hero.y;
      const angle = Math.atan2(dy, dx);
      const cx = x + w - 42;
      const cy = y + 34;

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
      ctx.fillText(`${dist}m`, cx, y + 76);
    }

    ctx.restore();
  }

  _drawPrompt(ctx, game) {
    let text = "";

    if (game?.dungeon?.active) text = game.enemies?.some?.((e) => e?.alive) ? "Clear enemies" : "F: Claim stairs";
    else if (game?._cachedNearbyCamp) text = "F: Camp shop";
    else if (game?._cachedNearbyTown) text = "F: Enter town";
    else if (game?._cachedNearbyWaystone) text = "F: Use waystone";
    else if (game?._cachedNearbyShrine) text = "F: Claim shrine";
    else if (game?._cachedNearbyCache) text = "F: Open cache";
    else if (game?._cachedNearbySecret) text = `Lore: ${game._cachedNearbySecret.name || "Hidden marker"}`;
    else if (game?._cachedNearbyDragonLair) text = "F: Wake dragon";
    else if (game?._cachedNearbyDungeon) text = "F: Enter dungeon";
    else if (game?._cachedNearbyDock) text = game?.hero?.state?.sailing ? "B: Dock" : "B: Sail";

    if (!text) return;

    ctx.save();
    const panelW = Math.min(300, Math.max(190, text.length * 9 + 36));
    this._drawPanel(ctx, (this.w - panelW) / 2, this.h - 116, panelW, 34, { alpha: 0.78, accent: "rgba(232,190,96,0.52)" });

    ctx.fillStyle = "#edf3fb";
    ctx.font = "bold 14px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, text, (this.w - panelW) * 0.5 + 12, this.h - 92, panelW - 24, 9);
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

    this._drawPanel(ctx, x, y, w, 30, { alpha: 0.84, accent: "rgba(232,190,96,0.50)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 14px 'Segoe UI', Arial";
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
    ctx.font = "bold 18px 'Segoe UI', Arial";
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
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: "rgba(116,198,216,0.44)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 20px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    ctx.fillText("World Map", x + 18, y + 28);

    const zoom = clamp(game?.menu?.mapZoom || 1, 1, 8);
    ctx.textAlign = "right";
    ctx.fillStyle = zoom > 1 ? "#8fd8ff" : "#95a7bd";
    ctx.font = "bold 12px 'Segoe UI', Arial";
    ctx.fillText(`${zoom}x`, x + panelW - 18, y + 28);
    ctx.textAlign = "left";

    const mapX = x + 18;
    const mapY = y + 42;
    const mapW = panelW - 36;
    const mapH = panelH - 72;

    ctx.fillStyle = "rgba(2,4,8,0.95)";
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1);

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
    ctx.font = "12px 'Segoe UI', Arial";
    this._drawFitText(ctx, "M or Esc close   wheel or +/- zoom   0 reset", x + 18, y + panelH - 12, panelW - 36);
    ctx.restore();
  }

  _drawBigMapFromCanvas(ctx, game, mini, x, y, w, h) {
    const zoom = clamp(game?.menu?.mapZoom || 1, 1, 8);
    const span = (game.world?.mapHalfSize || 5200) * 2;
    const half = span * 0.5;
    const heroNormX = clamp((game.hero.x + half) / span, 0, 1);
    const heroNormY = clamp((game.hero.y + half) / span, 0, 1);
    const srcW = Math.max(8, Math.floor(mini.width / zoom));
    const srcH = Math.max(8, Math.floor(mini.height / zoom));
    const srcX = clamp(Math.floor(heroNormX * mini.width - srcW * 0.5), 0, Math.max(0, mini.width - srcW));
    const srcY = clamp(Math.floor(heroNormY * mini.height - srcH * 0.5), 0, Math.max(0, mini.height - srcH));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, srcX, srcY, srcW, srcH, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();

    const hx = x + ((heroNormX * mini.width - srcX) / srcW) * w;
    const hy = y + ((heroNormY * mini.height - srcY) / srcH) * h;

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

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = "rgba(2,4,8,0.95)";
    ctx.fillRect(x, y, w, h);

    const mapHalf = game.world?.mapHalfSize || 5200;
    const worldFull = mapHalf * 2;
    const zoom = clamp(game?.menu?.mapZoom || 1, 1, 8);
    const viewSpan = worldFull / zoom;
    const halfView = viewSpan * 0.5;
    const heroX = game.hero?.x || 0;
    const heroY = game.hero?.y || 0;
    const viewLeft = clamp(heroX - halfView, -mapHalf, mapHalf - viewSpan);
    const viewTop = clamp(heroY - halfView, -mapHalf, mapHalf - viewSpan);
    const cellWorldW = worldFull / cols;
    const cellWorldH = worldFull / rows;
    const c0 = clamp(Math.floor((viewLeft + mapHalf) / cellWorldW), 0, cols - 1);
    const c1 = clamp(Math.ceil((viewLeft + viewSpan + mapHalf) / cellWorldW), 0, cols - 1);
    const r0 = clamp(Math.floor((viewTop + mapHalf) / cellWorldH), 0, rows - 1);
    const r1 = clamp(Math.ceil((viewTop + viewSpan + mapHalf) / cellWorldH), 0, rows - 1);
    const pxPerWorldX = w / viewSpan;
    const pxPerWorldY = h / viewSpan;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!revealed[r]?.[c]) continue;
        ctx.fillStyle =
          info.tiles?.[r]?.[c] ||
          info.colors?.[r]?.[c] ||
          "#526b59";
        const wx = -mapHalf + c * cellWorldW;
        const wy = -mapHalf + r * cellWorldH;
        const sx = x + (wx - viewLeft) * pxPerWorldX;
        const sy = y + (wy - viewTop) * pxPerWorldY;
        const sw = Math.ceil(cellWorldW * pxPerWorldX) + 1;
        const sh = Math.ceil(cellWorldH * pxPerWorldY) + 1;
        ctx.fillRect(sx, sy, sw, sh);
      }
    }

    ctx.restore();

    this._drawMapPoiMarkers(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, zoom > 2 ? 4.2 : 3.2);

    const hx = x + (heroX - viewLeft) * pxPerWorldX;
    const hy = y + (heroY - viewTop) * pxPerWorldY;

    this._drawHeroCrosshair(ctx, x, y, w, hx, hy);
  }

  _drawMapPoiMarkers(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, radius = 3) {
    const world = game?.world;
    if (!world) return;

    const px = w / viewSpan;
    const py = h / viewSpan;
    const sets = [
      [world.towns, "#8be9ff", "town"],
      [world.camps, "#ffd86e", "camp"],
      [world.waystones, "#7fe8ff", "waystone"],
      [world.dungeons, "#dc7cff", "dungeon"],
      [world.shrines, "#b77eff", "shrine"],
      [world.caches, "#ffe19a", "cache"],
      [world.secrets, "#ffeaa8", "secret"],
      [world.dragonLairs, "#ff8a5c", "dragon"],
    ];
    const bridgeSet = game?.progress?.crossedBridges || new Set();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    for (const [arr, color, type] of sets) {
      for (const p of arr || []) {
        if (type === "secret" && !game?.progress?.discoveredSecrets?.has?.(String(p.id))) continue;
        if (!this._isMapPointRevealed(game, p)) continue;
        const sx = x + (p.x - viewLeft) * px;
        const sy = y + (p.y - viewTop) * py;
        if (sx < x - 8 || sx > x + w + 8 || sy < y - 8 || sy > y + h + 8) continue;

        ctx.fillStyle = "rgba(0,0,0,0.70)";
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        if (type === "dungeon") {
          ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
        } else if (type === "dragon") {
          ctx.beginPath();
          ctx.moveTo(sx, sy - radius - 1);
          ctx.lineTo(sx + radius + 1, sy + radius);
          ctx.lineTo(sx - radius - 1, sy + radius);
          ctx.closePath();
          ctx.fill();
        } else if (type === "secret") {
          ctx.beginPath();
          ctx.moveTo(sx, sy - radius - 1);
          ctx.lineTo(sx + radius, sy + radius);
          ctx.lineTo(sx - radius, sy + radius);
          ctx.closePath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        if (radius >= 4 && (type === "town" || type === "dungeon" || type === "dragon")) {
          const label = type === "town" ? (p.name || "Town") : type === "dragon" ? "Dragon" : "Dungeon";
          const labelW = Math.min(86, Math.max(38, label.length * 6 + 12));
          ctx.fillStyle = "rgba(3,7,12,0.68)";
          ctx.fillRect(sx - labelW * 0.5, sy + radius + 4, labelW, 14);
          ctx.fillStyle = "#e9f2ff";
          ctx.font = "bold 10px Arial";
          ctx.textAlign = "left";
          this._drawFitText(ctx, label, sx - labelW * 0.5 + 4, sy + radius + 15, labelW - 8, 7);
        }
      }
    }

    for (const b of world.bridges || []) {
      const id = `${b.cx | 0},${b.cy | 0}`;
      if (!bridgeSet.has?.(id) && !this._isMapPointRevealed(game, b)) continue;
      const sx = x + (b.cx - viewLeft) * px;
      const sy = y + (b.cy - viewTop) * py;
      if (sx < x - 8 || sx > x + w + 8 || sy < y - 8 || sy > y + h + 8) continue;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(b.roadAngle || b.angle || 0);
      ctx.fillStyle = "rgba(0,0,0,0.70)";
      ctx.fillRect(-radius - 3, -2.5, radius * 2 + 6, 5);
      ctx.fillStyle = bridgeSet.has?.(id) ? "#f0c17a" : "rgba(240,193,122,0.60)";
      ctx.fillRect(-radius - 2, -1.5, radius * 2 + 4, 3);
      ctx.restore();
    }

    this._drawObjectiveMapMarker(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, Math.max(radius + 2, 5));

    ctx.restore();
  }

  _drawObjectiveMapMarker(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, radius = 5) {
    const objective = game?.getObjective?.();
    const target = objective?.target;
    if (!target || !this._isMapPointRevealed(game, target)) return;

    const px = w / viewSpan;
    const py = h / viewSpan;
    const sx = x + (target.x - viewLeft) * px;
    const sy = y + (target.y - viewTop) * py;
    if (sx < x - 12 || sx > x + w + 12 || sy < y - 12 || sy > y + h + 12) return;

    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.16;
    const r = radius * pulse;
    const color = objective.color || "#ffd36e";

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = "rgba(0,0,0,0.76)";
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(Math.PI * 0.25);
    ctx.fillStyle = color;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.rotate(-Math.PI * 0.25);
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _isMapPointRevealed(game, p) {
    const info = game?.world?.getMapInfo?.();
    const revealed = info?.revealed;
    const rows = revealed?.length || 0;
    const cols = revealed?.[0]?.length || 0;
    if (!rows || !cols || !p) return false;
    const mapHalf = game.world?.mapHalfSize || 5200;
    const span = mapHalf * 2;
    const c = clamp(Math.floor(((p.x + mapHalf) / span) * cols), 0, cols - 1);
    const r = clamp(Math.floor(((p.y + mapHalf) / span) * rows), 0, rows - 1);
    return !!revealed[r]?.[c];
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
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: "rgba(232,190,96,0.50)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Inventory", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("I or Esc close   wheel/arrow select", x + 18, y + 52);

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
      this._drawFitText(ctx, item?.name || "Unknown Gear", leftX + 16, iy, 162);

      ctx.fillStyle = "#92a3b8";
      ctx.font = "12px Arial";
      this._drawFitText(
        ctx,
        `${(item?.slot || "gear").toUpperCase()}  Lv.${item?.level || 1}  ${(item?.rarity || "common").toUpperCase()}  PWR ${item?.score || "-"}`,
        leftX + 190,
        iy,
        leftW - 205
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

    this._drawHeroPortrait(ctx, hero, rightX + rightW - 96, rightY + 14, 74, 92);

    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const item = equip[slot];
      const iy = rightY + 46 + i * 32;
      const textW = Math.max(80, rightW - 220);

      ctx.fillStyle = "#9db0c8";
      ctx.font = "12px Arial";
      ctx.fillText(slot.toUpperCase(), rightX + 12, iy);

      ctx.fillStyle = item?.color || "#dce6f4";
      ctx.font = "bold 13px Arial";
      this._drawFitText(ctx, item?.name || "-", rightX + 104, iy, textW);

      if (item?.stats) {
        ctx.fillStyle = "#8ea1b8";
        ctx.font = "11px Arial";
        this._drawFitText(ctx, this._statSummary(item.stats), rightX + 104, iy + 13, textW);
      }
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
      this._drawFitText(ctx, picked.name || "Unknown Gear", statX, sy, rightW - 24);
      sy += 20;

      ctx.fillStyle = "#9cb0c9";
      ctx.font = "12px Arial";
      this._drawFitText(
        ctx,
        `${(picked.slot || "gear").toUpperCase()}  Lv.${picked.level || 1}  ${(picked.rarity || "common").toUpperCase()}  Power ${picked.score || "-"}`,
        statX,
        sy,
        rightW - 24
      );
      sy += 20;

      const worn = equip[picked.slot];
      if (worn) {
        const delta = (picked.score || 0) - (worn.score || 0);
        ctx.fillStyle = delta >= 0 ? "#94e48d" : "#ff9c9c";
        ctx.font = "12px Arial";
        this._drawFitText(ctx, `Compared to equipped: ${delta >= 0 ? "+" : ""}${delta} power`, statX, sy, rightW - 24);
        sy += 18;
      }

      if (picked.affix) {
        ctx.fillStyle = picked.color || "#dfe8f5";
        ctx.font = "bold 12px Arial";
        this._drawFitText(ctx, `Affix: ${picked.affix}`, statX, sy, rightW - 24);
        sy += 18;
      }

      const stats = picked.stats || {};
      const lines = [];
      const wornStats = worn?.stats || {};
      const deltaText = (key, label, value, pct = false) => {
        if (!value) return "";
        const shown = pct ? Math.round(value * 100) : value;
        const delta = value - (wornStats[key] || 0);
        const d = pct ? Math.round(delta * 100) : delta;
        const suffix = pct ? "%" : "";
        if (!worn) return `${label} +${shown}${suffix}`;
        if (!d) return `${label} +${shown}${suffix} (=)`;
        return `${label} +${shown}${suffix} (${d > 0 ? "+" : ""}${d}${suffix})`;
      };
      if (stats.dmg) lines.push(deltaText("dmg", "Damage", stats.dmg));
      if (stats.armor) lines.push(deltaText("armor", "Armor", stats.armor));
      if (stats.hp) lines.push(deltaText("hp", "Max HP", stats.hp));
      if (stats.mana) lines.push(deltaText("mana", "Max Mana", stats.mana));
      if (stats.crit) lines.push(deltaText("crit", "Crit", stats.crit, true));
      if (stats.critMult) lines.push(deltaText("critMult", "Crit Power", stats.critMult, true));
      if (stats.move) lines.push(deltaText("move", "Move", stats.move, true));

      ctx.fillStyle = "#dfe8f5";
      for (const line of lines) {
        this._drawFitText(ctx, line, statX, sy, rightW - 24);
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
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: "rgba(132,170,255,0.46)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Skills", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("K or Esc to close", x + 18, y + 52);
    ctx.fillStyle = "#d6e2f2";
    ctx.font = "bold 13px Arial";
    this._drawFitText(ctx, `Oath: ${game?._className?.() || "Knight"}`, x + panelW - 160, y + 52, 142, 9);

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
      this._drawFitText(ctx, `${(key || "?").toUpperCase()}  ${def?.name || "Skill"}`, x + 30, sy, 150);

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

      ctx.fillStyle = "#8ea1b8";
      ctx.font = "11px Arial";
      this._drawFitText(ctx, game?._classSkillInfo?.(key) || "Balanced scaling", x + 30, sy + 34, panelW - 60, 8);

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
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.92, accent: "rgba(104,214,141,0.44)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Camp Shop", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, "1-4 or click buy - Esc close", x + 18, y + 48, w - 150, 9);
    ctx.fillStyle = "#d7dfeb";
    ctx.font = "bold 13px Arial";
    this._drawFitText(ctx, `Gold: ${game?.hero?.gold || 0}`, x + w - 118, y + 30, 100, 9);

    const discount = Math.round((game?.shop?.discount || 0) * 100);
    if (discount > 0) {
      ctx.fillStyle = "#94e48d";
      ctx.font = "12px Arial";
      this._drawFitText(ctx, `Renown discount: ${discount}%`, x + w - 178, y + 48, 160, 8);
    }

    for (let i = 0; i < 4; i++) {
      const item = items[i];
      const yy = y + 70 + i * 42;

      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 16, yy - 16, w - 32, 32);

      ctx.fillStyle = "#dfe8f5";
      ctx.font = "13px Arial";
      if (item) {
        this._drawFitText(ctx, `${i + 1}. ${item.name}`, x + 24, yy + 4, w - 122);
        ctx.fillStyle = "#ffd98a";
        ctx.fillText(`${item.price}g`, x + w - 80, yy + 4);
      } else {
        ctx.fillStyle = "#7d899a";
        ctx.fillText(`${i + 1}. Sold out`, x + 24, yy + 4);
      }
    }

    ctx.restore();
  }

  _drawHeroPortrait(ctx, hero, x, y, w, h) {
    const equip = hero?.equip || {};
    const armor = equip.armor;
    const helm = equip.helm;
    const weapon = equip.weapon;
    const armorColor = armor?.color || "#7f93aa";
    const helmColor = helm?.color || "#b9c9d8";
    const weaponColor = weapon?.color || "#dce9f5";

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const cx = x + w * 0.5;
    const base = y + h - 14;
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(cx, base + 2, w * 0.32, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = armorColor;
    ctx.beginPath();
    ctx.moveTo(cx - 22, base - 4);
    ctx.lineTo(cx - 15, y + 46);
    ctx.lineTo(cx + 15, y + 46);
    ctx.lineTo(cx + 22, base - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    ctx.fillRect(cx - 10, y + 50, 20, 3);
    ctx.fillStyle = "#e4bca4";
    ctx.beginPath();
    ctx.arc(cx, y + 34, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = helmColor;
    ctx.beginPath();
    ctx.moveTo(cx - 15, y + 32);
    ctx.quadraticCurveTo(cx, y + 12, cx + 15, y + 32);
    ctx.lineTo(cx + 12, y + 25);
    ctx.lineTo(cx - 12, y + 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#111820";
    ctx.fillRect(cx - 7, y + 35, 4, 2);
    ctx.fillRect(cx + 3, y + 35, 4, 2);

    ctx.strokeStyle = weaponColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + w - 16, y + 18);
    ctx.lineTo(x + w - 28, y + 70);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w - 15, y + 18);
    ctx.lineTo(x + w - 27, y + 70);
    ctx.stroke();
    ctx.restore();
  }

  _statSummary(stats = {}) {
    const parts = [];
    if (stats.dmg) parts.push(`DMG +${stats.dmg}`);
    if (stats.armor) parts.push(`ARM +${stats.armor}`);
    if (stats.hp) parts.push(`HP +${stats.hp}`);
    if (stats.mana) parts.push(`MP +${stats.mana}`);
    if (stats.crit) parts.push(`CRIT +${Math.round(stats.crit * 100)}%`);
    if (stats.move) parts.push(`MOVE +${Math.round(stats.move * 100)}%`);
    return parts.join("  ");
  }

  _drawQuestPanel(ctx, game) {
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 398;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    const q = game?.quest || {};
    const count = q.count || 0;
    const needed = Math.max(1, q.needed || 1);
    const frac = clamp(count / needed, 0, 1);
    const target = this._titleCase(q.target || "monster");

    ctx.save();
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.93, accent: "rgba(201,167,255,0.48)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Quests", x + 18, y + 32);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("J or Esc to close", x + 18, y + 54);

    const track = game?.trackedObjective || "story";
    ctx.fillStyle = "#d6e2f2";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, `Tracking: ${this._titleCase(track)}`, x + 18, y + 72, 150, 8);
    ctx.fillStyle = "#95a7bd";
    this._drawFitText(ctx, "1 Story  2 Bounty  3 Town  4 Dungeon", x + 176, y + 72, w - 194, 8);
    this._drawFitText(ctx, "5 Dragon  6 Treasure  7 Secrets  (click to track)", x + 176, y + 88, w - 194, 8);

    const shards = game?.progress?.relicShards || 0;
    const next = shards < 3 ? 3 : shards < 7 ? 7 : shards < 12 ? 12 : shards < 20 ? 20 : 20;
    const storyFrac = clamp(shards / Math.max(1, next), 0, 1);
    const journal = game?.getJournalStats?.() || {};

    ctx.fillStyle = "rgba(201,167,255,0.08)";
    ctx.fillRect(x + 18, y + 96, w - 36, 76);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 96.5, w - 37, 75);

    ctx.fillStyle = "#c9a7ff";
    ctx.font = "bold 16px Arial";
    this._drawFitText(ctx, "Restore the Ash Crown", x + 34, y + 120, w - 68);

    ctx.fillStyle = "#b7c6da";
    ctx.font = "13px Arial";
    ctx.fillText(`Relic shards: ${shards} / ${next}`, x + 34, y + 142);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 34, y + 154, w - 68, 10);
    ctx.fillStyle = "#c9a7ff";
    ctx.fillRect(x + 34, y + 154, ((w - 68) * storyFrac) | 0, 10);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 184, w - 36, 112);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 184.5, w - 37, 111);

    ctx.fillStyle = "#ffd86e";
    ctx.font = "bold 17px Arial";
    this._drawFitText(ctx, `Bounty: Cull ${target}s`, x + 34, y + 214, w - 68);

    ctx.fillStyle = "#b7c6da";
    ctx.font = "13px Arial";
    ctx.fillText(`${count} / ${needed} defeated`, x + 34, y + 238);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 34, y + 254, w - 68, 12);
    ctx.fillStyle = "#ffd86e";
    ctx.fillRect(x + 34, y + 254, ((w - 68) * frac) | 0, 12);

    ctx.fillStyle = "#dfe8f5";
    ctx.font = "13px Arial";
    this._drawFitText(ctx, `Reward: ${q.rewardGold || 0}g, ${q.rewardXp || 0} XP, and gear`, x + 34, y + 286, w - 68);

    const completed = game?.progress?.bountyCompletions || 0;
    const elites = game?.progress?.eliteKills || 0;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 316, w - 36, 62);

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Journal", x + 34, y + 340);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, `Bounties ${completed}  Elites ${elites}  Towns ${journal.towns || 0}/${journal.townsTotal || 0}  Waystones ${journal.waystones || 0}/${journal.waystonesTotal || 0}`, x + 34, y + 354, w - 68, 8);
    this._drawFitText(ctx, `Bridges ${journal.bridges || 0}/${journal.bridgesTotal || 0}  Secrets ${journal.secrets || 0}/${journal.secretsTotal || 0}  Dragons ${journal.dragons || 0}/${journal.dragonsTotal || 0}`, x + 34, y + 370, w - 68, 8);

    ctx.restore();
  }

  _drawTownPanel(ctx, game) {
    const town = game?._cachedNearbyTown;
    const name = town?.name || "Town";
    const visited = town && game?.progress?.visitedTowns?.has?.(String(town.id));
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 354;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;

    ctx.save();
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.94, accent: "rgba(117,211,224,0.52)" });

    ctx.fillStyle = "#eefbff";
    ctx.font = "bold 22px Arial";
    this._drawFitText(ctx, name, x + 18, y + 34, w - 36);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("1-8 or click - Esc to leave town", x + 18, y + 55);

    const npcs = town?.npcs || ["Warden", "Smith", "Archivist"];
    const restCost = Math.max(0, Math.min(28, 8 + (game?.hero?.level || 1) * 2));
    const forgeCost = 58 + (game?.hero?.level || 1) * 9;
    const clueCost = 36 + (game?.hero?.level || 1) * 4;
    const lines = [
      `1 Rest at inn (${restCost}g)`,
      "2 Buy health potion (18g)",
      "3 Buy mana potion (22g)",
      `4 Commission townforged gear (${forgeCost}g)`,
      "5 Ask for a rumor objective",
      "6 Change oath / class",
      "7 Take town contract",
      `8 Buy cartographer clue (${clueCost}g)`,
      visited ? `${npcs[0]}: Roads are safer when camps are cleared.` : `${npcs[0]}: First visit supplies were added.`,
    ];

    ctx.fillStyle = "rgba(117,211,224,0.08)";
    ctx.fillRect(x + 18, y + 82, w - 36, 198);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 82.5, w - 37, 197);

    ctx.font = "13px Arial";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i < 8 ? "#d7e7f4" : "#8be9ff";
      this._drawFitText(ctx, lines[i], x + 34, y + 102 + i * 21, w - 68, 9);
    }

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 296, w - 36, 36);
    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 13px Arial";
    ctx.fillText("NPCs", x + 34, y + 318);
    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, `${npcs.join(", ")} are available. Current oath: ${game?._className?.() || "Knight"}.`, x + 88, y + 318, w - 122, 8);

    ctx.restore();
  }

  _titleCase(text) {
    const s = String(text || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  _drawDevPanel(ctx, game) {
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 340;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    const world = game?.world;
    const explored = world?.exportDiscovery?.()?.length || 0;

    ctx.save();
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.93, accent: game?.dev?.godMode ? "rgba(118,224,255,0.58)" : "rgba(232,190,96,0.46)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 21px Arial";
    ctx.fillText("Dev Tools", x + 18, y + 32);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px 'Segoe UI', Arial";
    ctx.fillText("G or Esc close - click action", x + 18, y + 52);

    const lines = [
      "1 heal HP and mana",
      "2 add 250 gold",
      "3 grant one level worth of XP",
      "4 reveal entire world map",
      "5 spawn a dragon nearby",
      "6 teleport near closest dragon lair",
      `7 god mode ${game?.dev?.godMode ? "ON" : "OFF"}`,
      "8 equip mythic best gear",
      "9 reset to a new game (confirm)",
      `Explored cells: ${explored}`,
      `World span: ${((world?.mapHalfSize || 0) * 2).toLocaleString()} units`,
    ];

    ctx.font = "14px Arial";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i < 9 ? "#dfe8f5" : "#8ea1b8";
      this._drawFitText(ctx, lines[i], x + 28, y + 86 + i * 22, w - 56);
    }

    ctx.restore();
  }

  _drawSimplePanel(ctx, title, body = "") {
    const panelW = Math.min(Math.max(this.w - 140, 320), 520);
    const panelH = Math.min(Math.max(this.h - 160, 220), 260);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;

    ctx.save();
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: "rgba(232,190,96,0.46)" });

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

  _drawStatusPanel(ctx, game) {
    const panelW = Math.min(Math.max(this.w - 140, 340), 560);
    const panelH = Math.min(Math.max(this.h - 160, 260), 340);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;
    const hero = game?.hero || {};
    const stats = hero.getStats?.() || {};
    const progress = game?.progress || {};
    const world = game?.world || {};
    const inventory = hero.inventory?.length || 0;
    const equipped = Object.values(hero.equip || {}).filter(Boolean).length;
    const objective = game?.getObjective?.();

    const lines = [
      `Level ${hero.level || 1} ${game?._className?.() || "Knight"}  XP ${hero.xp || 0}/${hero.nextXp || 0}`,
      `HP ${Math.round(hero.hp || 0)}/${Math.round(hero.maxHp || stats.maxHp || 0)}  Mana ${Math.round(hero.mana || 0)}/${Math.round(hero.maxMana || stats.maxMana || 0)}  Gold ${hero.gold || 0}`,
      `Damage ${Math.round(stats.dmg || 0)}  Armor ${Math.round(stats.armor || 0)}  Crit ${Math.round((stats.crit || 0) * 100)}%`,
      `Inventory ${inventory} items  Equipped ${equipped}/6  Potions H${hero.potions?.hp || 0} M${hero.potions?.mana || 0}`,
      `Tracking ${this._titleCase(game?.trackedObjective || "story")}  Map zoom ${game?.menu?.mapZoom || 1}x`,
      `Relics ${progress.relicShards || 0}  Bounties ${progress.bountyCompletions || 0}  Elites ${progress.eliteKills || 0}`,
      `Towns ${progress.visitedTowns?.size || 0}/${world.towns?.length || 0}  Secrets ${progress.discoveredSecrets?.size || 0}/${world.secrets?.length || 0}`,
      `Dungeons best floor ${progress.dungeonBest || 0}  Dragons ${progress.defeatedDragons?.size || 0}/${world.dragonLairs?.length || 0}`,
      objective?.title ? `Objective: ${objective.title}` : "Objective: Explore and grow stronger",
    ];

    ctx.save();
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.93, accent: "rgba(232,190,96,0.46)" });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Status", x + 20, y + 34);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("Esc to close", x + 20, y + 54);

    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.fillRect(x + 18, y + 76, panelW - 36, panelH - 118);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 76.5, panelW - 37, panelH - 119);

    ctx.font = "13px Arial";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === lines.length - 1 ? "#ffd86e" : "#dce7f5";
      this._drawFitText(ctx, lines[i], x + 34, y + 102 + i * 21, panelW - 68, 9);
    }

    ctx.fillStyle = "#8ea1b8";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, "Open I for inventory, J for quests, M for map, K for skills, G for dev tools.", x + 20, y + panelH - 18, panelW - 40, 8);

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
