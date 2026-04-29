// src/ui.js
// v106.2 FULL UI FILE
// - full HUD / map / inventory / skills / shop
// - prompts / toast / zone text
// - minimap support
// - built for current game.js / world.js / util.js

import { clamp } from "./util.js";

const UI_PURPLE = "rgba(201,167,255,0.48)";
const UI_ASSET_ROOT = new URL("../assets/ui/", import.meta.url);

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
    this._controlsCollapsed = false;
    this._controlsToggleRect = null;
    this._assets = this._loadUiAssets();
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
    if (this._miniT >= 0.45) {
      this._miniT = 0;
      this._mini = game?.world?.peekMinimapCanvas?.() || game?.world?.getMinimapCanvas?.() || null;
      this._miniFrameDirty = true;
    }

    this._miniFrameT += dt;
    const hx = game?.hero?.x || 0;
    const hy = game?.hero?.y || 0;
    const heroShift = Math.abs(hx - this._lastMiniHeroX) + Math.abs(hy - this._lastMiniHeroY);

    if (heroShift > 64 || this._miniFrameT >= 0.18) {
      this._miniFrameT = 0;
      this._lastMiniHeroX = hx;
      this._lastMiniHeroY = hy;
      this._miniFrameDirty = true;
    }

    if (game?.mouse?.clicked && this._controlsToggleRect) {
      const { x, y, w, h } = this._controlsToggleRect;
      const mx = game.mouse.x;
      const my = game.mouse.y;
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
        this._controlsCollapsed = !this._controlsCollapsed;
      }
    }
  }

  draw(ctx, game) {
    if (!ctx || !game) return;

    this._syncViewFromCanvas();

    this._drawHUD(ctx, game);
    this._drawSpellBar(ctx, game);
    this._drawMinimap(ctx, game);
    this._drawObjective(ctx, game);
    this._drawBossBanner(ctx, game);
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

  _loadUiAssets() {
    return {
      heroPortrait: this._loadUiImage("hero-portrait-knight.png"),
      spellIcons: this._loadUiImage("spell-icons.png"),
      mapParchment: this._loadUiImage("map-parchment.png"),
    };
  }

  _loadUiImage(name) {
    const img = new Image();
    img.decoding = "async";
    img.src = new URL(name, UI_ASSET_ROOT).href;
    return img;
  }

  _hasUiImage(img) {
    return !!img && img.complete && img.naturalWidth > 0;
  }

  _drawTextureOverlay(ctx, img, x, y, w, h, alpha = 0.16) {
    if (!this._hasUiImage(img)) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  _drawPanel(ctx, x, y, w, h, opts = {}) {
    const alpha = opts.alpha ?? 0.84;
    const accent = opts.accent || UI_PURPLE;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(x + 5, y + 6, w, h);

    const outerGlow = ctx.createLinearGradient(x, y, x, y + h);
    outerGlow.addColorStop(0, "rgba(255,255,255,0.03)");
    outerGlow.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = outerGlow;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `rgba(23,31,40,${alpha})`);
    g.addColorStop(0.48, `rgba(12,18,24,${Math.min(0.94, alpha + 0.04)})`);
    g.addColorStop(1, `rgba(7,10,15,${Math.min(0.98, alpha + 0.10)})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x + 1, y + 1, w - 2, Math.max(8, h * 0.14));
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(x + 1, y + h - 12, w - 2, 11);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);

    ctx.fillStyle = accent;
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillStyle = accent.replace("0.48", "0.24").replace("0.54", "0.26").replace("0.44", "0.22");
    ctx.fillRect(x + 1, y + 1, 3, h - 2);
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
      this._drawFitText(ctx, label, x + 12, y + h * 0.5 + 0.5, Math.max(40, w - 24), 8);
    }
    ctx.restore();
  }

  _drawPill(ctx, x, y, w, h, text, opts = {}) {
    const fill = opts.fill || "rgba(255,255,255,0.08)";
    const stroke = opts.stroke || "rgba(255,255,255,0.14)";
    const textColor = opts.textColor || "#e6edf7";
    const font = opts.font || "bold 11px 'Segoe UI', Arial";

    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 1, y + 1, w - 2, Math.max(2, h * 0.34));
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const raw = String(text ?? "");
    const match = font.match(/(\d+(?:\.\d+)?)px/);
    const base = match ? Number.parseFloat(match[1]) : 11;
    const prefix = font.replace(/(\d+(?:\.\d+)?)px/, "__SIZE__px");
    let size = base;
    const maxWidth = Math.max(12, w - 14);

    while (size > 8 && ctx.measureText(raw).width > maxWidth) {
      size -= 1;
      ctx.font = prefix.replace("__SIZE__", String(size));
    }

    let out = raw;
    if (ctx.measureText(out).width > maxWidth) {
      while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1);
      out = out.length < raw.length ? `${out}...` : out;
    }

    ctx.fillText(out, x + w * 0.5 + 2, y + h * 0.5 + 0.5);
    ctx.font = font;
    ctx.restore();
  }

  _getHudLayout() {
    const x = 30;
    const y = 16;
    const w = Math.min(Math.max(this.w * 0.36, 320), 404);
    return {
      x,
      y,
      w,
      panelH: 164,
      hpH: 18,
      manaH: 12,
      xpH: 8,
    };
  }

  _getMinimapLayout() {
    const size =
      this.w < 760 || this.h < 500 ? 130 :
      this.w < 980 || this.h < 620 ? 154 :
      178;
    return {
      size,
      x: this.w - size - 30,
      y: 16,
    };
  }

  _getObjectiveLayout() {
    const hud = this._getHudLayout();
    const x = hud.x;
    const y = hud.y + hud.panelH + 22;
    return {
      x,
      y,
      w: hud.w,
      h: 118,
    };
  }

  _getBossLayout() {
    const hud = this._getHudLayout();
    const minimap = this._getMinimapLayout();
    const left = hud.x + hud.w + 22;
    const right = minimap.x - 22;
    const available = right - left;
    const w = Math.min(420, Math.max(240, available > 240 ? available : this.w * 0.32));
    return {
      x: available > 240 ? (left + (available - w) * 0.5) | 0 : ((this.w - w) * 0.5) | 0,
      y: this.h < 560 ? 20 : 16,
      w,
      h: 62,
    };
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

    const layout = this._getHudLayout();
    const x = layout.x;
    const y = layout.y;
    const w = layout.w;
    const hpH = layout.hpH;
    const manaH = layout.manaH;
    const xpH = layout.xpH;
    const panelH = layout.panelH;
    const className = game?._className?.() || "Knight";
    const godMode = !!game?.dev?.godMode;

    const hpMax = Math.max(1, stats.maxHp || hero.maxHp || 100);
    const manaMax = Math.max(1, stats.maxMana || hero.maxMana || 60);
    const xpNeed = Math.max(1, hero.nextXp || 1);

    const hpFrac = clamp((hero.hp || 0) / hpMax, 0, 1);
    const manaFrac = clamp((hero.mana || 0) / manaMax, 0, 1);
    const xpFrac = clamp((hero.xp || 0) / xpNeed, 0, 1);
    const insetX = 10;
    const innerX = x + insetX;
    const innerW = w - insetX * 2;
    const levelW = godMode ? 54 : 62;
    const goldW = 96;
    const topGap = 8;
    const topRightW = (godMode ? 58 + topGap : 0) + levelW + topGap + goldW;
    const titleW = Math.max(132, innerW - topRightW - 8);
    const potionW = 60;
    const barGap = 10;
    const barW = innerW - potionW - barGap;
    const potionX = innerX + barW + barGap;
    const hpBarY = y + 39;
    const manaBarY = y + 63;
    const xpBarY = y + 84;

    ctx.save();

    this._drawPanel(ctx, x - 8, y - 8, w + 16, panelH, { accent: UI_PURPLE });

    ctx.fillStyle = "#f4f7fc";
    ctx.font = "bold 16px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, `${className}`, innerX, y + 14, titleW, 11);
    ctx.fillStyle = "#8ea7c3";
    ctx.font = "11px 'Segoe UI', Arial";
    this._drawFitText(ctx, godMode ? "Ascended Vanguard" : "Frontline Adventurer", innerX, y + 29, titleW, 9);

    let pillX = innerX + innerW - goldW;
    this._drawPill(ctx, pillX, y + 4, goldW, 18, `Gold ${hero.gold || 0}`, {
      fill: "rgba(255,215,121,0.10)",
      stroke: "rgba(255,215,121,0.20)",
      textColor: "#ffd779",
      font: "bold 10px 'Segoe UI', Arial",
    });
    pillX -= topGap + levelW;
    this._drawPill(ctx, pillX, y + 4, levelW, 18, `Lv ${hero.level || 1}`, {
      fill: "rgba(255,255,255,0.08)",
      stroke: "rgba(255,255,255,0.16)",
      textColor: "#f3f0dc",
      font: "bold 10px 'Segoe UI', Arial",
    });
    if (godMode) {
      pillX -= topGap + 58;
      this._drawPill(ctx, pillX, y + 4, 58, 18, "GOD", {
        fill: "rgba(92,210,255,0.16)",
        stroke: "rgba(128,224,255,0.35)",
        textColor: "#8fd8ff",
        font: "bold 10px 'Segoe UI', Arial",
      });
    }

    this._drawBar(ctx, innerX, hpBarY, barW, hpH, hpFrac, "#9f223d", "#ff6f7f", `HP ${Math.round(hero.hp || 0)} / ${hpMax}`);
    this._drawBar(ctx, innerX, manaBarY, barW, manaH, manaFrac, "#2258b8", "#71c1ff", `Mana ${Math.round(hero.mana || 0)} / ${manaMax}`);
    this._drawBar(ctx, innerX, xpBarY, innerW, xpH, xpFrac, "#89621a", "#f1d57f");

    ctx.fillStyle = "#c8d2df";
    ctx.font = "11px 'Segoe UI', Arial";
    this._drawFitText(ctx, `XP ${hero.xp || 0} / ${xpNeed}`, innerX + 8, y + 102, innerW - 16, 8);

    this._drawPill(ctx, potionX, hpBarY + 1, potionW, 16, `1 HP ${hero?.potions?.hp || 0}`, {
      fill: "rgba(240,109,115,0.14)",
      stroke: "rgba(240,109,115,0.28)",
      textColor: "#ffd3d7",
      font: "bold 10px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, potionX, manaBarY + 1, potionW, 16, `2 MP ${hero?.potions?.mana || 0}`, {
      fill: "rgba(109,184,255,0.14)",
      stroke: "rgba(109,184,255,0.28)",
      textColor: "#d7ebff",
      font: "bold 10px 'Segoe UI', Arial",
    });

    const statY = y + 118;
    const statGap = 8;
    const statW = Math.floor((innerW - statGap * 2) / 3);
    this._drawPill(ctx, innerX, statY, statW, 22, `DMG ${stats.dmg || 0}`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.12)",
      textColor: "#9fb1c7",
    });
    this._drawPill(ctx, innerX + statW + statGap, statY, statW, 22, `ARM ${stats.armor || 0}`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.12)",
      textColor: "#9fb1c7",
    });
    this._drawPill(ctx, innerX + (statW + statGap) * 2, statY, statW, 22, `CRIT ${Math.round((stats.crit || 0) * 100)}%`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.12)",
      textColor: "#9fb1c7",
    });

    ctx.restore();
  }

  _drawSkillGlyph(ctx, row, x, y, size) {
    const name = String(row?.name || row?.key || "").toLowerCase();
    const spellIcons = this._assets?.spellIcons;
    let iconIndex = -1;
    if (name.includes("spark")) iconIndex = 0;
    else if (name.includes("nova")) iconIndex = 1;
    else if (name.includes("dash") || name.includes("blink")) iconIndex = 2;
    else if (name.includes("orb")) iconIndex = 3;
    if (iconIndex >= 0 && this._hasUiImage(spellIcons)) {
      const sprite = 64;
      const drawSize = size * 0.68;
      const dx = x + (size - drawSize) * 0.5;
      const dy = y + size * 0.14;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(spellIcons, iconIndex * sprite, 0, sprite, sprite, dx, dy, drawSize, drawSize);
      ctx.restore();
      return;
    }

    const cx = x + size * 0.5;
    const cy = y + size * 0.5 - 3;
    const r = size * 0.18;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(245,250,255,0.88)";
    ctx.fillStyle = row?.color || "#dbe7ff";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (name.includes("spark")) {
      ctx.beginPath();
      ctx.moveTo(-1, -10);
      ctx.lineTo(6, -2);
      ctx.lineTo(1, -2);
      ctx.lineTo(7, 8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(3, -2);
      ctx.stroke();
    } else if (name.includes("nova")) {
      ctx.strokeStyle = "rgba(230,248,255,0.95)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(230,248,255,0.92)";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (name.includes("dash") || name.includes("blink")) {
      ctx.fillStyle = "rgba(255,211,110,0.95)";
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(1, -7);
      ctx.lineTo(2, -3);
      ctx.lineTo(10, -3);
      ctx.lineTo(10, 3);
      ctx.lineTo(2, 3);
      ctx.lineTo(1, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,243,209,0.72)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.lineTo(-4, -2);
      ctx.moveTo(-12, 0);
      ctx.lineTo(-4, 0);
      ctx.moveTo(-12, 6);
      ctx.lineTo(-4, 2);
      ctx.stroke();
    } else if (name.includes("orb")) {
      const orb = ctx.createRadialGradient(-2, -3, 1, 0, 0, 11);
      orb.addColorStop(0, "rgba(255,255,255,0.95)");
      orb.addColorStop(0.35, "rgba(227,201,255,0.96)");
      orb.addColorStop(1, "rgba(192,140,255,0.92)");
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(248,236,255,0.72)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 11, Math.PI * 0.15, Math.PI * 1.1);
      ctx.stroke();
      ctx.strokeStyle = "rgba(167,118,232,0.70)";
      ctx.beginPath();
      ctx.arc(0, 0, 13, Math.PI * 1.2, Math.PI * 1.95);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const spellRows = game?.getSkillPanelData?.()?.rows || [];
    const layout = game?.getSpellBarLayout?.() || {
      box: 46,
      gap: 10,
      total: 46 * Math.max(1, spellRows.length) + 10 * Math.max(0, spellRows.length - 1),
      x: ((this.w - (46 * Math.max(1, spellRows.length) + 10 * Math.max(0, spellRows.length - 1))) / 2) | 0,
      y: this.h - 62,
      inset: 5,
    };

    ctx.save();

    for (let i = 0; i < spellRows.length; i++) {
      const row = spellRows[i];
      const x = layout.x + i * (layout.box + layout.gap);
      const y = layout.y;
      const accent = row.cooldownValue > 0 ? "#ffd98a" : row.affordable ? row.color || "#94e48d" : "#ff9c9c";
      this._drawPanel(ctx, x, y, layout.box, layout.box, { alpha: 0.78, accent: UI_PURPLE });

      const core = ctx.createLinearGradient(x, y, x, y + layout.box);
      core.addColorStop(0, "rgba(255,255,255,0.06)");
      core.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = core;
      ctx.fillRect(x + layout.inset, y + layout.inset, layout.box - layout.inset * 2, layout.box - layout.inset * 2);
      ctx.fillStyle = row.color || "#a9c3ff";
      ctx.globalAlpha = 0.11;
      ctx.beginPath();
      ctx.arc(x + layout.box * 0.5, y + layout.box * 0.5 - 4, layout.box * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      this._drawSkillGlyph(ctx, row, x, y, layout.box);

      ctx.font = "10px 'Segoe UI', Arial";
      ctx.fillStyle = "#9ab2cf";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((row.key || "?").toUpperCase(), x + 10, y + 10);
      ctx.fillText(`${row.manaCost || 0}`, x + layout.box * 0.5, y + layout.box - 8);

      ctx.fillStyle = accent;
      ctx.globalAlpha = row.cooldownValue > 0 ? 0.22 : row.affordable ? 0.16 : 0.18;
      ctx.fillRect(x + 2, y + 2, layout.box - 4, 4);
      ctx.globalAlpha = 1;

      if ((row.cooldownValue || 0) > 0) {
        ctx.fillStyle = "rgba(3,5,8,0.70)";
        ctx.fillRect(x, y, layout.box, layout.box * (row.cooldownFrac || 0));

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px 'Segoe UI', Arial";
        ctx.fillText((row.cooldownValue || 0).toFixed(1), x + layout.box * 0.5, y + layout.box * 0.5 + 10);
      }

      if (!row.affordable) {
        ctx.fillStyle = "rgba(35,70,120,0.28)";
        ctx.fillRect(x, y, layout.box, layout.box);
      }

      ctx.fillStyle = row.cooldownValue > 0 ? "#ffd98a" : row.affordable ? "#94e48d" : "#ff9c9c";
      ctx.beginPath();
      ctx.arc(x + layout.box - 8, y + 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const world = game?.world;
    const hero = game?.hero;
    if (!world || !hero) return;

    const layout = this._getMinimapLayout();
    const size = layout.size;
    const x = layout.x;
    const y = layout.y;
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
    this._drawPill(ctx, x + 28, y + size - 26, size - 56, 16, `Tracking ${this._titleCase(game?.trackedObjective || "story")}`, {
      fill: "rgba(3,7,12,0.72)",
      stroke: "rgba(143,216,255,0.20)",
      textColor: "#d8e9f9",
      font: "bold 9px 'Segoe UI', Arial",
    });
    ctx.restore();
  }

  _rebuildMiniFrame(game) {
    const c = this._miniFrameCtx;
    if (!c) return;

    const w = this._miniFrame.width;
    const h = this._miniFrame.height;

    c.clearRect(0, 0, w, h);

    const info = game?.world?.peekMapInfo?.() || game?.world?.getMapInfo?.();
    if (info?.revealed?.length) {
      this._drawMinimapFromMapInfo(c, game, 0, 0, w, h, info);
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

    this._drawHeroCrosshair(ctx, x, y, size, size, x + size * 0.5, y + size * 0.5, false);
  }

  _drawMinimapFromMapInfo(ctx, game, x, y, w, h, infoOverride = null) {
    const info = infoOverride || game.world.peekMapInfo?.() || game.world.getMapInfo();
    const hero = game.hero;

    const worldSpan = 760;
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

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, "rgba(9,15,20,0.98)");
    bg.addColorStop(1, "rgba(4,8,12,0.98)");
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

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

    this._drawMapZoneWash(ctx, info, x, y, left, top, pxPerWorld, pxPerWorld, mapHalf, cellWorldW, cellWorldH, c0, c1, r0, r1, 0.28);
    this._drawMapFeatureContours(ctx, info, x, y, left, top, pxPerWorld, pxPerWorld, mapHalf, cellWorldW, cellWorldH, c0, c1, r0, r1, 0.8);

    this._drawMapRoadOverlay(ctx, game, x, y, w, h, left, top, worldSpan, {
      roadBase: "rgba(42,26,14,0.82)",
      roadTop: "rgba(232,205,154,0.95)",
      roadBaseWidth: 3.4,
      roadTopWidth: 1.5,
      bridgeColor: "rgba(252,233,196,0.98)",
      bridgeWidth: 2.7,
    });
    this._drawMapPoiMarkers(ctx, game, x, y, w, h, left, top, worldSpan, 2.8);
    ctx.restore();
    this._drawHeroCrosshair(ctx, x, y, w, h, x + w * 0.5, y + h * 0.5, false);
  }

  _drawMapRoadOverlay(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, opts = {}) {
    const world = game?.world;
    if (!world) return;

    const px = w / viewSpan;
    const py = h / viewSpan;
    const right = viewLeft + viewSpan;
    const bottom = viewTop + viewSpan;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const road of world.roads || []) {
      const pts = road.points;
      if (!pts || pts.length < 2) continue;
      let visible = false;
      let revealed = false;
      for (const p of pts) {
        if (!revealed && this._isMapPointRevealed(game, p)) revealed = true;
        if (p.x >= viewLeft - 40 && p.x <= right + 40 && p.y >= viewTop - 40 && p.y <= bottom + 40) {
          visible = true;
          if (revealed) break;
        }
      }
      if (!visible || !revealed) continue;

      ctx.strokeStyle = opts.roadBase || "rgba(48,32,16,0.55)";
      ctx.lineWidth = opts.roadBaseWidth || 2.6;
      ctx.beginPath();
      ctx.moveTo(x + (pts[0].x - viewLeft) * px, y + (pts[0].y - viewTop) * py);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(x + (pts[i].x - viewLeft) * px, y + (pts[i].y - viewTop) * py);
      ctx.stroke();

      ctx.strokeStyle = opts.roadTop || "rgba(224,192,128,0.88)";
      ctx.lineWidth = opts.roadTopWidth || 1.2;
      ctx.beginPath();
      ctx.moveTo(x + (pts[0].x - viewLeft) * px, y + (pts[0].y - viewTop) * py);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(x + (pts[i].x - viewLeft) * px, y + (pts[i].y - viewTop) * py);
      ctx.stroke();
    }

    for (const bridge of world.bridges || []) {
      const bx = bridge.cx;
      const by = bridge.cy;
      if (bx < viewLeft - 40 || bx > right + 40 || by < viewTop - 40 || by > bottom + 40) continue;
      const path = bridge.path || [];
      if (path.length < 2) continue;
      let revealed = this._isMapPointRevealed(game, bridge);
      if (!revealed) {
        for (const p of path) {
          if (this._isMapPointRevealed(game, p)) {
            revealed = true;
            break;
          }
        }
      }
      if (!revealed) continue;
      ctx.strokeStyle = opts.bridgeColor || "rgba(245,221,180,0.95)";
      ctx.lineWidth = opts.bridgeWidth || 2.2;
      ctx.beginPath();
      ctx.moveTo(x + (path[0].x - viewLeft) * px, y + (path[0].y - viewTop) * py);
      for (let i = 1; i < path.length; i++) ctx.lineTo(x + (path[i].x - viewLeft) * px, y + (path[i].y - viewTop) * py);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawHeroCrosshair(ctx, x, y, w, h, hx, hy, drawBorder = true) {
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
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.restore();
  }

  _drawHelp(ctx, game) {
    const touchLikely = !!game?.touch?.enabled || this.w < 560 || (this.w < 780 && this.h < 460);
    if (touchLikely) {
      this._drawTouchHint(ctx);
      return;
    }

    const fullLines = [
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
    const compactLines = [
      "Arrows move",
      "Mouse aim",
      "Q/W/E/R skills",
      "F interact",
      "M map",
      "I/K/J menus",
      "Esc close",
    ];
    const compact = this.w < 1040 || this.h < 700;
    const lines = compact ? compactLines : fullLines;
    const rowStep = compact ? 16 : 15;

    const hud = this._getHudLayout();
    const spell = game?.getSpellBarLayout?.() || { y: this.h - 62 };
    const x = hud.x;
    const panelW = compact ? 188 : 200;
    const footerH = 28;
    const panelH = 26 + lines.length * rowStep + footerH + 12;
    const expandedY = Math.max(hud.y + hud.panelH + 104, spell.y - panelH + 26);
    const drawY = this._controlsCollapsed ? expandedY + panelH - footerH : expandedY;
    const drawH = this._controlsCollapsed ? footerH : panelH;
    const footerY = drawY + drawH - footerH;

    ctx.save();
    this._controlsToggleRect = { x: x - 10, y: footerY, w: panelW, h: footerH };
    this._drawPanel(ctx, x - 10, drawY, panelW, drawH, { alpha: 0.62, accent: UI_PURPLE });

    if (!this._controlsCollapsed) {
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(" ");
        const key = parts.shift() || "";
        this._drawKeyCap(ctx, x, expandedY + 18 + i * rowStep, key, parts.join(" "), false);
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x - 2, footerY, panelW - 16, 1);
    ctx.fillStyle = "#dfe7f2";
    ctx.font = "bold 13px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    ctx.fillText("Controls", x, footerY + 18);
    ctx.textAlign = "right";
    ctx.fillStyle = "#d6b5ff";
    ctx.fillText(this._controlsCollapsed ? "+" : "-", x + panelW - 22, footerY + 18);
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawTouchHint(ctx) {
    const text = "Touch: left move, right skills";
    const w = 210;
    const x = 14;
    const y = Math.max(226, this.h - 190);

    ctx.save();
    this._drawPanel(ctx, x, y, w, 28, { alpha: 0.46, accent: UI_PURPLE });
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

    const layout = this._getObjectiveLayout();
    const x = layout.x;
    const y = layout.y;
    const w = layout.w;
    const h = layout.h;
    const inset = 12;
    const innerX = x + inset;
    const innerY = y + inset;
    const innerW = w - inset * 2;
    const innerH = h - inset * 2;
    const hasTarget = !!(objective.target && game?.hero);
    const arrowW = hasTarget && innerW >= 300 ? 76 : 0;
    const textW = innerW - arrowW;

    ctx.save();
    this._drawPanel(ctx, x - 8, y - 8, w, h, { alpha: 0.72, accent: UI_PURPLE });

    this._drawPill(ctx, innerX, innerY - 2, 78, 18, "Objective", {
      fill: "rgba(255,211,110,0.12)",
      stroke: "rgba(255,211,110,0.28)",
      textColor: objective.color || "#ffd36e",
      font: "bold 10px 'Segoe UI', Arial",
    });

    const track = game?.trackedObjective || "story";
    this._drawPill(ctx, innerX + 86, innerY - 2, Math.min(122, Math.max(74, innerW - 112 - arrowW)), 18, `Tracking ${this._titleCase(track)}`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.14)",
      textColor: "#8fa2bb",
      font: "bold 10px 'Segoe UI', Arial",
    });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 15px 'Segoe UI', Arial";
    this._drawFitText(ctx, objective.title || "Explore", innerX, innerY + 36, textW, 10);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px 'Segoe UI', Arial";
    this._drawClampedText(ctx, objective.detail || "", innerX, innerY + 56, textW, 15, 3);

    if (hasTarget && arrowW > 0) {
      const dx = objective.target.x - game.hero.x;
      const dy = objective.target.y - game.hero.y;
      const angle = Math.atan2(dy, dx);
      const cx = innerX + innerW - 34;
      const cy = innerY + 36;

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
      this._drawPill(ctx, innerX + innerW - 72, innerY + 72, 72, 18, `${dist}m`, {
        fill: "rgba(255,255,255,0.06)",
        stroke: "rgba(255,255,255,0.14)",
        textColor: "#c7d4e6",
        font: "bold 10px 'Segoe UI', Arial",
      });
    }

    ctx.restore();
  }

  _drawBossBanner(ctx, game) {
    const boss = game?.getActiveBossState?.();
    if (!boss?.alive) return;

    const layout = this._getBossLayout();
    const x = layout.x;
    const y = layout.y;
    const w = layout.w;

    ctx.save();
    this._drawPanel(ctx, x, y, w, layout.h, {
      alpha: 0.86,
      accent: UI_PURPLE,
    });

    this._drawPill(ctx, x + 10, y + 8, 64, 16, boss.kind === "dragon" ? "Boss" : "Elite Boss", {
      fill: "rgba(255,138,92,0.12)",
      stroke: "rgba(255,138,92,0.28)",
      textColor: boss.accent || "#ffb99c",
      font: "bold 9px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + w - 132, y + 8, 56, 16, `Lv ${boss.level || 1}`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.14)",
      textColor: "#edf3fb",
      font: "bold 9px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + w - 68, y + 8, 58, 16, `${boss.distance || 0}m`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.14)",
      textColor: "#cfd9e7",
      font: "bold 9px 'Segoe UI', Arial",
    });

    ctx.fillStyle = "#f4f7fc";
    ctx.font = "bold 15px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, boss.name || "Boss", x + 10, y + 24, w - 152, 10);

    this._drawBar(
      ctx,
      x + 10,
      y + 30,
      w - 20,
      14,
      boss.frac || 0,
      boss.colorA || "#b53045",
      boss.colorB || "#ff8a5c",
      `${boss.hp || 0} / ${boss.maxHp || 1}`
    );

    ctx.fillStyle = "#aab9ca";
    ctx.font = "10px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, boss.detail || "Active threat", x + 10, y + 56, w - 20, 8);
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
    const spell = game?.getSpellBarLayout?.() || { y: this.h - 62, box: 46 };
    const panelX = (this.w - panelW) / 2;
    const panelY = spell.y - (this.h < 540 ? 42 : 48);
    this._drawPanel(ctx, panelX, panelY, panelW, 34, { alpha: 0.78, accent: UI_PURPLE });

    ctx.fillStyle = "#edf3fb";
    ctx.font = "bold 14px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    this._drawFitText(ctx, text, panelX + 12, panelY + 24, panelW - 24, 9);
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

    this._drawPanel(ctx, x, y, w, 30, { alpha: 0.84, accent: UI_PURPLE });

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
    ctx.shadowColor = "rgba(7,10,15,0.85)";
    ctx.shadowBlur = 10;
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
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: UI_PURPLE });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 20px 'Segoe UI', Arial";
    ctx.textAlign = "left";
    ctx.fillText("World Map", x + 18, y + 28);

    const zoom = clamp(game?.menu?.mapZoom || 1, 1, 8);
    this._drawPill(ctx, x + panelW - 74, y + 10, 56, 18, `${zoom}x`, {
      fill: zoom > 1 ? "rgba(143,216,255,0.12)" : "rgba(255,255,255,0.06)",
      stroke: zoom > 1 ? "rgba(143,216,255,0.26)" : "rgba(255,255,255,0.12)",
      textColor: zoom > 1 ? "#8fd8ff" : "#95a7bd",
      font: "bold 11px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + 138, y + 10, Math.min(170, panelW - 238), 18, `Tracking ${this._titleCase(game?.trackedObjective || "story")}`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.12)",
      textColor: "#9db2ca",
      font: "bold 10px 'Segoe UI', Arial",
    });
    const info = game?.world?.getMapInfo?.();
    const revealedRows = info?.revealed || [];
    let discovered = 0;
    let discoveredTotal = 0;
    for (const row of revealedRows) {
      discoveredTotal += row?.length || 0;
      for (const cell of row || []) if (cell) discovered++;
    }
    const discoveredPct = discoveredTotal > 0 ? Math.round((discovered / discoveredTotal) * 100) : 0;
    this._drawPill(ctx, x + panelW - 160, y + 10, 78, 18, `${discoveredPct}% seen`, {
      fill: "rgba(255,255,255,0.06)",
      stroke: "rgba(255,255,255,0.12)",
      textColor: "#d8e5f4",
      font: "bold 10px 'Segoe UI', Arial",
    });

    const mapX = x + 18;
    const mapY = y + 42;
    const mapW = panelW - 36;
    const mapH = panelH - 110;

    ctx.fillStyle = "rgba(2,4,8,0.95)";
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1);

    if (info?.revealed?.length) {
      this._drawBigMapFromMapInfo(ctx, game, info, mapX, mapY, mapW, mapH);
    } else if (this._mini) {
      this._drawBigMapFromCanvas(ctx, game, this._mini, mapX, mapY, mapW, mapH);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(mapX, mapY, mapW, mapH);
    }

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px 'Segoe UI', Arial";
    this._drawPill(ctx, x + 18, y + panelH - 40, 64, 16, "Roads", {
      fill: "rgba(186,154,107,0.14)",
      stroke: "rgba(186,154,107,0.24)",
      textColor: "#e8d5ac",
      font: "bold 9px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + 88, y + panelH - 40, 74, 16, "Bridges", {
      fill: "rgba(231,214,178,0.12)",
      stroke: "rgba(231,214,178,0.22)",
      textColor: "#f0e2c7",
      font: "bold 9px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + 168, y + panelH - 40, 60, 16, "Towns", {
      fill: "rgba(139,233,255,0.12)",
      stroke: "rgba(139,233,255,0.22)",
      textColor: "#dff8ff",
      font: "bold 9px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + 234, y + panelH - 40, 86, 16, "Objective", {
      fill: "rgba(255,211,110,0.12)",
      stroke: "rgba(255,211,110,0.22)",
      textColor: "#ffdf97",
      font: "bold 9px 'Segoe UI', Arial",
    });
    this._drawPill(ctx, x + 326, y + panelH - 40, 74, 16, "Coast", {
      fill: "rgba(97,190,236,0.14)",
      stroke: "rgba(97,190,236,0.24)",
      textColor: "#bcecff",
      font: "bold 9px 'Segoe UI', Arial",
    });
    ctx.fillStyle = "#95a7bd";
    ctx.font = "11px 'Segoe UI', Arial";
    this._drawFitText(ctx, "M or Esc close   wheel or +/- zoom   0 reset   hero coords shown on map", x + 18, y + panelH - 17, panelW - 36, 8);
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

      this._drawHeroCrosshair(ctx, x, y, w, h, hx, hy);
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

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, "rgba(10,15,21,0.98)");
    bg.addColorStop(1, "rgba(3,6,10,0.98)");
    ctx.fillStyle = bg;
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

    const mapCanvas = game?.world?.peekMinimapCanvas?.() || this._mini;
    if (mapCanvas?.width && mapCanvas?.height) {
      const srcX = clamp(((viewLeft + mapHalf) / worldFull) * mapCanvas.width, 0, Math.max(0, mapCanvas.width - 2));
      const srcY = clamp(((viewTop + mapHalf) / worldFull) * mapCanvas.height, 0, Math.max(0, mapCanvas.height - 2));
      const srcW = Math.max(2, (viewSpan / worldFull) * mapCanvas.width);
      const srcH = Math.max(2, (viewSpan / worldFull) * mapCanvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mapCanvas, srcX, srcY, srcW, srcH, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    } else {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!revealed[r]?.[c]) continue;
          const wx = -mapHalf + c * cellWorldW;
          const wy = -mapHalf + r * cellWorldH;
          const sx = x + (wx - viewLeft) * pxPerWorldX;
          const sy = y + (wy - viewTop) * pxPerWorldY;
          const sw = Math.ceil(cellWorldW * pxPerWorldX) + 1;
          const sh = Math.ceil(cellWorldH * pxPerWorldY) + 1;
          ctx.fillStyle = info.tiles?.[r]?.[c] || info.colors?.[r]?.[c] || "#526b59";
          ctx.fillRect(sx, sy, sw, sh);
        }
      }
    }

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (revealed[r]?.[c]) continue;
        const wx = -mapHalf + c * cellWorldW;
        const wy = -mapHalf + r * cellWorldH;
        const sx = x + (wx - viewLeft) * pxPerWorldX;
        const sy = y + (wy - viewTop) * pxPerWorldY;
        const sw = Math.ceil(cellWorldW * pxPerWorldX) + 1;
        const sh = Math.ceil(cellWorldH * pxPerWorldY) + 1;
        ctx.fillStyle = "rgba(6,9,13,0.93)";
        ctx.fillRect(sx, sy, sw, sh);
        if (((r + c) & 1) === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.020)";
          ctx.fillRect(sx, sy, sw, Math.max(1, sh * 0.18));
        }
      }
    }

    this._drawMapZoneWash(ctx, info, x, y, viewLeft, viewTop, pxPerWorldX, pxPerWorldY, mapHalf, cellWorldW, cellWorldH, c0, c1, r0, r1, 0.22);
    this._drawMapFeatureContours(ctx, info, x, y, viewLeft, viewTop, pxPerWorldX, pxPerWorldY, mapHalf, cellWorldW, cellWorldH, c0, c1, r0, r1, 1);

    ctx.restore();
    this._drawMapRoadOverlay(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, {
      roadBase: "rgba(66,39,18,0.74)",
      roadTop: "rgba(224,194,142,0.94)",
      roadBaseWidth: zoom > 2 ? 5.2 : 4.2,
      roadTopWidth: zoom > 2 ? 2.4 : 1.8,
      bridgeColor: "rgba(248,230,196,0.98)",
      bridgeWidth: zoom > 2 ? 4.6 : 3.2,
    });
    this._drawMapPoiMarkers(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, zoom > 2 ? 4.2 : 3.2);
    this._drawBigMapRegionLabels(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, zoom);
    this._drawBigMapCoordinates(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, zoom);

    const hx = x + (heroX - viewLeft) * pxPerWorldX;
    const hy = y + (heroY - viewTop) * pxPerWorldY;

    this._drawHeroCrosshair(ctx, x, y, w, h, hx, hy);
  }

  _drawBigMapCoordinates(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, zoom) {
    const hero = game?.hero || { x: 0, y: 0 };
    const coordText = `X ${Math.round(hero.x)}   Y ${Math.round(hero.y)}`;
    this._drawPill(ctx, x + w - 148, y + h - 24, 132, 16, coordText, {
      fill: "rgba(8,12,19,0.76)",
      stroke: "rgba(201,167,255,0.22)",
      textColor: "#d9e4f3",
      font: "bold 9px 'Segoe UI', Arial",
    });
  }

  _getMapZoneType(zone) {
    const z = String(zone || "").toLowerCase();
    if (z === "river" || z === "bridge" || z === "dock") return "water";
    if (z === "mountain") return "mountain";
    return "land";
  }

  _getMapZoneWashColor(zone) {
    const z = String(zone || "").toLowerCase();
    if (z === "river" || z === "bridge" || z === "dock") return "rgba(77,168,214,0.30)";
    if (z === "mountain") return "rgba(204,213,223,0.16)";
    if (z === "road") return "rgba(211,177,126,0.10)";
    if (z === "greenwood" || z === "forest" || z === "deep wilds") return "rgba(55,112,74,0.15)";
    if (z === "ashlands" || z === "ash fields") return "rgba(156,118,76,0.14)";
    if (z === "highlands" || z === "stone flats") return "rgba(138,146,156,0.10)";
    if (z === "meadow" || z === "old fields") return "rgba(171,154,105,0.08)";
    return "";
  }

  _drawMapZoneWash(ctx, info, x, y, viewLeft, viewTop, pxPerWorldX, pxPerWorldY, mapHalf, cellWorldW, cellWorldH, c0, c1, r0, r1, alphaScale = 1) {
    const zones = info?.zones;
    if (!zones?.length) return;
    ctx.save();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!info?.revealed?.[r]?.[c]) continue;
        const zone = zones?.[r]?.[c] || "";
        const tint = this._getMapZoneWashColor(zone);
        if (!tint) continue;
        const wx = -mapHalf + c * cellWorldW;
        const wy = -mapHalf + r * cellWorldH;
        const sx = x + (wx - viewLeft) * pxPerWorldX;
        const sy = y + (wy - viewTop) * pxPerWorldY;
        const sw = Math.ceil(cellWorldW * pxPerWorldX) + 1;
        const sh = Math.ceil(cellWorldH * pxPerWorldY) + 1;
        ctx.globalAlpha = alphaScale;
        ctx.fillStyle = tint;
        ctx.fillRect(sx, sy, sw, sh);
      }
    }

    ctx.restore();
  }

  _drawMapFeatureContours(ctx, info, x, y, viewLeft, viewTop, pxPerWorldX, pxPerWorldY, mapHalf, cellWorldW, cellWorldH, c0, c1, r0, r1, alphaScale = 1) {
    const zones = info?.zones;
    if (!zones?.length) return;
    ctx.save();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!info?.revealed?.[r]?.[c]) continue;
        const zone = zones?.[r]?.[c] || "";
        const type = this._getMapZoneType(zone);
        const wx = -mapHalf + c * cellWorldW;
        const wy = -mapHalf + r * cellWorldH;
        const sx = x + (wx - viewLeft) * pxPerWorldX;
        const sy = y + (wy - viewTop) * pxPerWorldY;
        const sw = Math.ceil(cellWorldW * pxPerWorldX) + 1;
        const sh = Math.ceil(cellWorldH * pxPerWorldY) + 1;

        const eastZone = zones?.[r]?.[c + 1] || "";
        const southZone = zones?.[r + 1]?.[c] || "";
        const eastType = this._getMapZoneType(eastZone);
        const southType = this._getMapZoneType(southZone);
        const eastVisible = info?.revealed?.[r]?.[c + 1];
        const southVisible = info?.revealed?.[r + 1]?.[c];

        let eastColor = "";
        let southColor = "";
        if (eastVisible && eastType !== type) {
          if (type === "water" || eastType === "water") eastColor = "rgba(134,214,255,0.42)";
          else if (type === "mountain" || eastType === "mountain") eastColor = "rgba(231,237,245,0.30)";
        }
        if (southVisible && southType !== type) {
          if (type === "water" || southType === "water") southColor = "rgba(134,214,255,0.42)";
          else if (type === "mountain" || southType === "mountain") southColor = "rgba(231,237,245,0.30)";
        }

        if (eastColor) {
          ctx.globalAlpha = alphaScale;
          ctx.strokeStyle = eastColor;
          ctx.lineWidth = type === "mountain" || eastType === "mountain" ? 2 : 1.25;
          ctx.beginPath();
          ctx.moveTo(sx + sw - 0.5, sy + 1);
          ctx.lineTo(sx + sw - 0.5, sy + sh - 1);
          ctx.stroke();
        }
        if (southColor) {
          ctx.globalAlpha = alphaScale;
          ctx.strokeStyle = southColor;
          ctx.lineWidth = type === "mountain" || southType === "mountain" ? 2 : 1.25;
          ctx.beginPath();
          ctx.moveTo(sx + 1, sy + sh - 0.5);
          ctx.lineTo(sx + sw - 1, sy + sh - 0.5);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  _drawBigMapRegionLabels(ctx, game, x, y, w, h, viewLeft, viewTop, viewSpan, zoom) {
    if (zoom < 1.6) return;
    const world = game?.world;
    if (!world) return;
    const px = w / viewSpan;
    const py = h / viewSpan;
    const sets = [
      [world.towns, p => p.name || "Town", "#dff8ff"],
      [world.dungeons, () => "Dungeon", "#f1cbff"],
      [world.waystones, () => "Waystone", "#d8fbff"],
      [world.dragonLairs, () => "Dragon Lair", "#ffd2bf"],
      [world.docks, () => "Dock", "#e8f0ff"],
    ];

    ctx.save();
    for (const [arr, getLabel, color] of sets) {
      for (const p of arr || []) {
        if (!this._isMapPointRevealed(game, p)) continue;
        const sx = x + (p.x - viewLeft) * px;
        const sy = y + (p.y - viewTop) * py;
        if (sx < x + 18 || sx > x + w - 18 || sy < y + 18 || sy > y + h - 18) continue;
        const label = getLabel(p);
        const lw = Math.min(110, Math.max(40, label.length * 6 + 12));
        ctx.fillStyle = "rgba(3,7,12,0.62)";
        ctx.fillRect(sx - lw * 0.5, sy + 8, lw, 14);
        ctx.fillStyle = color;
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "left";
        this._drawFitText(ctx, label, sx - lw * 0.5 + 4, sy + 19, lw - 8, 7);
      }
    }
    ctx.restore();
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
      if (!this._isMapPointRevealed(game, b)) continue;
      const sx = x + (b.cx - viewLeft) * px;
      const sy = y + (b.cy - viewTop) * py;
      if (sx < x - 8 || sx > x + w + 8 || sy < y - 8 || sy > y + h + 8) continue;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(b.roadAngle || b.angle || 0);
      ctx.fillStyle = "rgba(0,0,0,0.70)";
      ctx.fillRect(-radius - 3, -2.5, radius * 2 + 6, 5);
      ctx.fillStyle = "#f0c17a";
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
    const inventoryText = game?.getInventoryPanelText?.(items.length > 0) || {
      headerHint: items.length > 0 ? "I or Esc close   wheel/arrow select   click again equip" : "I or Esc close",
      emptyBagTitle: "No gear in your bag yet.",
      emptyBagBody: "Clear camps, shops, contracts, and dungeons will start filling it.",
      emptyDetailTitle: "Item Details",
      emptyDetailBody: "Pick up gear to compare it here.",
      emptyDetailNote: "Your equipped kit will stay visible above while the bag is empty.",
      equipHint: "Enter/E or click again equip",
      salvageHint: "X/Delete salvage",
    };
    const layout = game?.getInventoryPanelLayout?.() || {
      panelW: Math.min(Math.max(this.w - 90, 700), 860),
      panelH: Math.min(Math.max(this.h - 90, 430), 540),
      x: ((this.w - Math.min(Math.max(this.w - 90, 700), 860)) / 2) | 0,
      y: ((this.h - Math.min(Math.max(this.h - 90, 430), 540)) / 2) | 0,
      leftW: 370,
      rowH: 28,
    };
    const panelW = layout.panelW;
    const panelH = layout.panelH;
    const x = layout.x;
    const y = layout.y;

    ctx.save();
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: UI_PURPLE });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Inventory", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    this._drawFitText(
      ctx,
      inventoryText.headerHint,
      x + 18,
      y + 52,
      panelW - 36,
      9
    );

    const leftX = layout.leftX ?? x + 18;
    const leftY = layout.leftY ?? y + 74;
    const leftW = layout.leftW ?? 370;
    const leftH = layout.leftH ?? (panelH - 92);

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(leftX, leftY, leftW, leftH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(leftX + 0.5, leftY + 0.5, leftW - 1, leftH - 1);

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 15px Arial";
    ctx.fillText(`Bag (${items.length})`, leftX + 12, leftY + 22);

    const rowH = layout.rowH ?? 28;
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

    if (items.length <= 0) {
      ctx.fillStyle = "#8ea1b8";
      ctx.font = "12px Arial";
      this._drawFitText(ctx, inventoryText.emptyBagTitle, leftX + 16, leftY + 58, leftW - 32);
      this._drawFitText(ctx, inventoryText.emptyBagBody, leftX + 16, leftY + 78, leftW - 32, 8);
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

    const slots = game?.getEquipmentSlots?.() || ["weapon", "armor", "helm", "boots", "ring", "trinket"];
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
    ctx.fillText(picked ? "Selected Item" : inventoryText.emptyDetailTitle, statX, sy);
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
      ctx.fillText(inventoryText.equipHint, statX, sy);
      sy += 16;
      ctx.fillText(inventoryText.salvageHint, statX, sy);
    } else {
      ctx.fillStyle = "#8ea1b8";
      ctx.font = "12px Arial";
      if (items.length > 0) {
        ctx.fillText("No item selected.", statX, sy);
      } else {
        this._drawFitText(ctx, inventoryText.emptyDetailBody, statX, sy, rightW - 24);
        sy += 18;
        this._drawFitText(ctx, inventoryText.emptyDetailNote, statX, sy, rightW - 24, 8);
      }
    }

    ctx.restore();
  }

  _drawSkillsPanel(ctx, game) {
    const layout = game?.getSkillPanelLayout?.() || {
      w: Math.min(Math.max(this.w - 110, 520), 620),
      h: Math.min(Math.max(this.h - 120, 360), 400),
      x: ((this.w - Math.min(Math.max(this.w - 110, 520), 620)) / 2) | 0,
      y: ((this.h - Math.min(Math.max(this.h - 120, 360), 400)) / 2) | 0,
      rowStart: 98,
      rowStep: 74,
      rowHeight: 58,
      rowInset: 18,
    };
    const panelW = layout.w;
    const panelH = layout.h;
    const x = layout.x;
    const y = layout.y;

    const panelData = game?.getSkillPanelData?.() || {
      manaText: `Mana ${Math.round(game?.hero?.mana || 0)}/${Math.round(game?.hero?.maxMana || 0)}`,
      legendText: "Green ready   amber cooling down   red low mana",
      oathText: `Oath: ${game?._className?.() || "Knight"}`,
      rows: [],
    };

    ctx.save();
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: UI_PURPLE });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Skills", x + 18, y + 30);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "13px Arial";
    ctx.fillText("K or Esc to close", x + 18, y + 52);
    ctx.fillStyle = "#9bb0c8";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, panelData.manaText, x + 18, y + 68, 140, 8);
    ctx.fillStyle = "#d6e2f2";
    ctx.font = "bold 13px Arial";
    this._drawFitText(ctx, panelData.oathText, x + panelW - 160, y + 52, 142, 9);
    ctx.fillStyle = "#8ea1b8";
    ctx.font = "11px Arial";
    this._drawFitText(ctx, panelData.legendText, x + 164, y + 68, panelW - 182, 8);

    const rowLeft = x + layout.rowInset;
    const rowW = panelW - layout.rowInset * 2;
    const nameW = Math.min(180, Math.max(132, rowW * 0.32));
    const manaX = rowLeft + nameW + 14;
    const cooldownX = manaX + 66;
    const levelW = 54;
    const levelX = cooldownX + 68;
    const statusW = 86;
    const statusX = x + panelW - layout.rowInset - statusW;
    const xpLeft = rowLeft + 12;
    const xpRight = statusX - 18;
    const xpW = Math.max(110, xpRight - xpLeft);
    let sy = y + layout.rowStart;

    for (const row of panelData.rows) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(rowLeft, sy - 20, rowW, layout.rowHeight + 4);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(rowLeft + 0.5, sy - 19.5, rowW - 1, layout.rowHeight + 3);

      ctx.fillStyle = row.color;
      ctx.font = "bold 16px Arial";
      this._drawFitText(ctx, `${(row.key || "?").toUpperCase()}  ${row.name}`, rowLeft + 12, sy, nameW, 10);

      ctx.fillStyle = "#9bb0c8";
      ctx.font = "12px Arial";
      this._drawFitText(ctx, row.manaText, manaX, sy, 60, 8);
      this._drawFitText(ctx, row.cooldownText, cooldownX, sy, 66, 8);
      this._drawPill(ctx, levelX, sy - 10, levelW, 16, row.levelText, {
        fill: "rgba(255,255,255,0.08)",
        stroke: "rgba(255,255,255,0.14)",
        textColor: "#f0f4fb",
        font: "bold 9px 'Segoe UI', Arial",
      });
      this._drawPill(ctx, statusX, sy - 10, statusW, 16, row.statusText, {
        fill: row.cooldownValue > 0 ? "rgba(255,184,94,0.14)" : row.affordable ? "rgba(122,221,138,0.14)" : "rgba(255,120,120,0.14)",
        stroke: row.statusColor,
        textColor: row.statusColor,
        font: "bold 9px 'Segoe UI', Arial",
      });

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(xpLeft, sy + 11, xpW, 9);
      ctx.fillStyle = row.color;
      ctx.fillRect(xpLeft, sy + 11, Math.max(6, (xpW * row.xpFrac) | 0), 9);

      ctx.fillStyle = "#dce6f4";
      ctx.font = "12px Arial";
      this._drawFitText(ctx, row.xpText, xpLeft, sy + 25, xpW, 8);

      ctx.fillStyle = "#8ea1b8";
      ctx.font = "11px Arial";
      this._drawFitText(ctx, row.infoText, rowLeft + 12, sy + 42, rowW - 24, 8);

      sy += layout.rowStep;
    }

    ctx.restore();
  }

  _drawShopPanel(ctx, game) {
    const layout = game?.getShopPanelLayout?.() || {
      w: 430,
      h: 260,
      x: ((this.w - 430) / 2) | 0,
      y: ((this.h - 260) / 2) | 0,
      rowStart: 70,
      rowStep: 42,
    };
    const w = layout.w;
    const h = layout.h;
    const x = layout.x;
    const y = layout.y;

    const items = game?.shop?.items || [];

    ctx.save();
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.92, accent: UI_PURPLE });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Camp Shop", x + 18, y + 30);

    const shopMeta = game?.getShopPanelMeta?.() || {
      hint: "1-4 or click buy - Esc close",
      goldText: `Gold: ${game?.hero?.gold || 0}`,
      discountText: Math.round((game?.shop?.discount || 0) * 100) > 0 ? `Renown discount: ${Math.round((game?.shop?.discount || 0) * 100)}%` : "",
    };
    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, shopMeta.hint, x + 18, y + 48, w - 150, 9);
    ctx.fillStyle = "#d7dfeb";
    ctx.font = "bold 13px Arial";
    this._drawFitText(ctx, shopMeta.goldText, x + w - 118, y + 30, 100, 9);

    if (shopMeta.discountText) {
      ctx.fillStyle = "#94e48d";
      ctx.font = "12px Arial";
      this._drawFitText(ctx, shopMeta.discountText, x + w - 178, y + 48, 160, 8);
    }

    for (let i = 0; i < 4; i++) {
      const item = items[i];
      const yy = y + layout.rowStart + i * layout.rowStep;

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
    const boots = equip.boots;
    const ring = equip.ring;
    const trinket = equip.trinket;
    const armorColor = armor?.color || "#7f93aa";
    const helmColor = helm?.color || "#b9c9d8";
    const weaponColor = weapon?.color || "#dce9f5";
    const bootsColor = boots?.color || "#8993a3";
    const ringColor = ring?.color || "#e3d39a";
    const trinketColor = trinket?.color || "#b99cff";

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(201,167,255,0.18)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const cx = x + w * 0.5;
    const base = y + h - 12;
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, "rgba(31,24,46,0.98)");
    bg.addColorStop(0.55, "rgba(14,16,28,0.98)");
    bg.addColorStop(1, "rgba(8,10,18,0.98)");
    ctx.fillStyle = bg;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 5, y + 5, w - 10, 12);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(cx, base + 1, w * 0.34, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 9, y + 8, w - 18, h - 22);

    ctx.fillStyle = "rgba(90,32,48,0.22)";
    ctx.beginPath();
    ctx.moveTo(cx - 20, base - 2);
    ctx.lineTo(cx - 16, y + 44);
    ctx.lineTo(cx, y + 58);
    ctx.lineTo(cx + 16, y + 44);
    ctx.lineTo(cx + 20, base - 2);
    ctx.closePath();
    ctx.fill();

    const chestHeavy = (armor?.stats?.armor || 0) >= 18;
    const chestMedium = !chestHeavy && (armor?.stats?.armor || 0) >= 9;
    ctx.fillStyle = armorColor;
    ctx.beginPath();
    ctx.moveTo(cx - 20, base - 3);
    ctx.lineTo(cx - (chestHeavy ? 18 : 14), y + 46);
    ctx.lineTo(cx + (chestHeavy ? 18 : 14), y + 46);
    ctx.lineTo(cx + 20, base - 3);
    ctx.closePath();
    ctx.fill();
    if (chestHeavy) {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(cx - 14, y + 49, 28, 4);
      ctx.fillRect(cx - 16, y + 61, 32, 3);
    } else if (chestMedium) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(cx - 11, y + 49, 22, 3);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(cx - 8, y + 49, 16, 2);
    }

    ctx.fillStyle = bootsColor;
    ctx.fillRect(cx - 15, base - 10, 10, 6);
    ctx.fillRect(cx + 5, base - 10, 10, 6);

    ctx.fillStyle = "#e4bca4";
    ctx.beginPath();
    ctx.arc(cx, y + 34, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4a3728";
    ctx.beginPath();
    ctx.moveTo(cx - 13, y + 32);
    ctx.quadraticCurveTo(cx - 9, y + 15, cx, y + 15);
    ctx.quadraticCurveTo(cx + 9, y + 15, cx + 13, y + 32);
    ctx.lineTo(cx + 10, y + 25);
    ctx.quadraticCurveTo(cx, y + 18, cx - 10, y + 25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(238,246,255,0.12)";
    ctx.beginPath();
    ctx.arc(cx, y + 29, 9, Math.PI, Math.PI * 2);
    ctx.fill();
    if (helm) {
      ctx.fillStyle = helmColor;
      ctx.beginPath();
      ctx.moveTo(cx - 15, y + 32);
      ctx.quadraticCurveTo(cx, y + 10, cx + 15, y + 32);
      ctx.lineTo(cx + 12, y + 25);
      ctx.lineTo(cx - 12, y + 25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(cx - 8, y + 25, 16, 3);
      if ((helm?.stats?.armor || 0) >= 8 || helm?.rarity === "epic") {
        ctx.fillStyle = "rgba(229,236,248,0.22)";
        ctx.fillRect(cx - 3, y + 28, 6, 10);
      }
    }
    ctx.fillStyle = "#111820";
    ctx.fillRect(cx - 7, y + 35, 4, 2);
    ctx.fillRect(cx + 3, y + 35, 4, 2);

    ctx.fillStyle = armor ? "rgba(99,128,168,0.22)" : "rgba(90,106,126,0.14)";
    ctx.beginPath();
    ctx.ellipse(cx - 16, y + 56, 12, 16, -0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = armor ? "#9cb3c8" : "rgba(148,162,182,0.52)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx - 16, y + 56, 11, 15, -0.32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = weaponColor;
    ctx.lineWidth = (weapon?.stats?.dmg || 0) >= 18 ? 5.5 : 4.5;
    ctx.beginPath();
    ctx.moveTo(x + w - 18, y + 20);
    ctx.lineTo(x + w - 29, y + 72);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w - 17, y + 20);
    ctx.lineTo(x + w - 28, y + 72);
    ctx.stroke();
    ctx.fillStyle = "#b68958";
    ctx.fillRect(x + w - 33, y + 67, 8, 4);
    ctx.fillStyle = "#f0f5fb";
    ctx.fillRect(x + w - 20, y + 17, 4, 6);

    if (ring) {
      ctx.fillStyle = ringColor;
      ctx.beginPath();
      ctx.arc(cx - 18, y + 58, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (trinket) {
      ctx.fillStyle = trinketColor;
      ctx.beginPath();
      ctx.arc(cx, y + 57, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y + 46);
      ctx.lineTo(cx, y + 53);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(x + 5, y + h - 18, w - 10, 12);
    ctx.fillStyle = armorColor;
    ctx.fillRect(x + 6, y + h - 10, Math.max(12, Math.floor(w * 0.24)), 4);
    ctx.fillStyle = helmColor;
    ctx.fillRect(x + Math.floor(w * 0.31), y + h - 10, Math.max(10, Math.floor(w * 0.16)), 4);
    ctx.fillStyle = weaponColor;
    ctx.fillRect(x + Math.floor(w * 0.51), y + h - 10, Math.max(12, Math.floor(w * 0.18)), 4);
    ctx.fillStyle = trinketColor;
    ctx.fillRect(x + Math.floor(w * 0.74), y + h - 10, Math.max(8, Math.floor(w * 0.10)), 4);
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
    const layout = game?.getQuestPanelLayout?.() || { w: Math.min(Math.max(this.w - 120, 430), 560), h: 420 };
    const w = layout.w;
    const h = layout.h;
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
    const questHints = game?.getQuestTrackHintLines?.() || [
      "1 Story  2 Bounty  3 Town  4 Dungeon",
      "5 Dragon  6 Treasure  7 Secrets  (click to track)",
    ];
    const activeObjective = game?.getTrackedObjectiveSummary?.() || game?.getObjective?.();
    ctx.fillStyle = "#d6e2f2";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, `Tracking: ${this._titleCase(track)}`, x + 18, y + 72, 150, 8);
    ctx.fillStyle = "#c9a7ff";
    ctx.font = "11px Arial";
    this._drawFitText(ctx, `Marker: ${activeObjective?.title || "Explore"}`, x + 18, y + 88, 150, 8);
    ctx.fillStyle = "#8ea1b8";
    this._drawFitText(ctx, activeObjective?.detail || "Follow the active marker from the HUD.", x + 18, y + 104, 150, 8);
    ctx.fillStyle = "#95a7bd";
    this._drawFitText(ctx, questHints[0] || "", x + 176, y + 72, w - 194, 8);
    this._drawFitText(ctx, questHints[1] || "", x + 176, y + 88, w - 194, 8);

    const shards = game?.progress?.relicShards || 0;
    const next = shards < 3 ? 3 : shards < 7 ? 7 : shards < 12 ? 12 : shards < 20 ? 20 : 20;
    const storyFrac = clamp(shards / Math.max(1, next), 0, 1);
    const journal = game?.getJournalStats?.() || {};

    ctx.fillStyle = "rgba(201,167,255,0.08)";
    ctx.fillRect(x + 18, y + 118, w - 36, 76);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 118.5, w - 37, 75);

    ctx.fillStyle = "#c9a7ff";
    ctx.font = "bold 16px Arial";
    this._drawFitText(ctx, "Restore the Ash Crown", x + 34, y + 156, w - 68);

    ctx.fillStyle = "#b7c6da";
    ctx.font = "13px Arial";
    ctx.fillText(`Relic shards: ${shards} / ${next}`, x + 34, y + 170);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 34, y + 182, w - 68, 10);
    ctx.fillStyle = "#c9a7ff";
    ctx.fillRect(x + 34, y + 182, ((w - 68) * storyFrac) | 0, 10);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 206, w - 36, 112);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, y + 206.5, w - 37, 111);

    ctx.fillStyle = "#ffd86e";
    ctx.font = "bold 17px Arial";
    this._drawFitText(ctx, `Bounty: Cull ${target}s`, x + 34, y + 236, w - 68);

    ctx.fillStyle = "#b7c6da";
    ctx.font = "13px Arial";
    ctx.fillText(`${count} / ${needed} defeated`, x + 34, y + 260);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 34, y + 276, w - 68, 12);
    ctx.fillStyle = "#ffd86e";
    ctx.fillRect(x + 34, y + 276, ((w - 68) * frac) | 0, 12);

    ctx.fillStyle = "#dfe8f5";
    ctx.font = "13px Arial";
    this._drawFitText(ctx, `Reward: ${q.rewardGold || 0}g, ${q.rewardXp || 0} XP, and gear`, x + 34, y + 308, w - 68);

    const completed = game?.progress?.bountyCompletions || 0;
    const elites = game?.progress?.eliteKills || 0;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 18, y + 338, w - 36, 62);

    ctx.fillStyle = "#dce6f4";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Journal", x + 34, y + 362);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px Arial";
    this._drawFitText(ctx, `Bounties ${completed}  Elites ${elites}  Towns ${journal.towns || 0}/${journal.townsTotal || 0}  Waystones ${journal.waystones || 0}/${journal.waystonesTotal || 0}`, x + 34, y + 376, w - 68, 8);
    this._drawFitText(ctx, `Bridges ${journal.bridges || 0}/${journal.bridgesTotal || 0}  Secrets ${journal.secrets || 0}/${journal.secretsTotal || 0}  Dragons ${journal.dragons || 0}/${journal.dragonsTotal || 0}`, x + 34, y + 392, w - 68, 8);

    ctx.restore();
  }

  _drawTownPanel(ctx, game) {
    const town = game?._cachedNearbyTown;
    const name = town?.name || "Town";
    const visited = town && game?.progress?.visitedTowns?.has?.(String(town.id));
    const layout = game?.getTownPanelLayout?.() || {
      w: Math.min(Math.max(this.w - 120, 430), 560),
      h: 354,
      x: ((this.w - Math.min(Math.max(this.w - 120, 430), 560)) / 2) | 0,
      y: ((this.h - 354) / 2) | 0,
    };
    const w = layout.w;
    const h = layout.h;
    const x = layout.x;
    const y = layout.y;

    ctx.save();
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.94, accent: UI_PURPLE });

    ctx.fillStyle = "#eefbff";
    ctx.font = "bold 22px Arial";
    this._drawFitText(ctx, name, x + 18, y + 34, w - 36);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("1-9 or click - Esc to leave town", x + 18, y + 55);

    const townMenu = game?.getTownMenuLines?.(town) || {
      npcs: town?.npcs || ["Warden", "Smith", "Archivist"],
      lines: [
        "1 Rest at inn",
        "2 Buy health potion",
        "3 Buy mana potion",
        "4 Commission townforged gear",
        "5 Ask for a rumor objective",
        "6 Change oath / class",
        "7 Take town contract",
        "8 Buy cartographer clue",
        visited ? "Warden: Roads are safer when camps are cleared." : "Warden: First visit supplies were added.",
      ],
    };
    const npcs = townMenu.npcs || ["Warden", "Smith", "Archivist"];
    const lines = townMenu.lines || [];

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
    this._drawFitText(ctx, townMenu.npcSummary || `${npcs.join(", ")} are available. Current oath: ${game?._className?.() || "Knight"}.`, x + 88, y + 318, w - 122, 8);

    ctx.restore();
  }

  _titleCase(text) {
    const s = String(text || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  _drawDevPanel(ctx, game) {
    const { w, h, x, y, rowStart, rowStep } = game?.getDevPanelLayout?.() || {
      w: Math.min(Math.max(this.w - 120, 430), 560),
      h: 340,
      x: ((this.w - Math.min(Math.max(this.w - 120, 430), 560)) / 2) | 0,
      y: ((this.h - 340) / 2) | 0,
      rowStart: 70,
      rowStep: 22,
    };
    const lines = game?.getDevToolLines?.() || [
      "1 heal HP and mana",
      "2 add 250 gold",
      "3 grant one level worth of XP",
      "4 reveal entire world map",
      "5 spawn a dragon nearby",
      "6 teleport near closest dragon lair",
      `7 god mode ${game?.dev?.godMode ? "ON" : "OFF"}`,
      "8 equip mythic best gear",
      game?._isDevResetConfirmLive?.() ? "9 reset to a new game (press again now)" : "9 reset to a new game (confirm)",
      `Explored cells: ${game?.world?.exportDiscovery?.()?.length || 0}`,
      `World span: ${((game?.world?.mapHalfSize || 0) * 2).toLocaleString()}`,
    ];

    ctx.save();
    this._drawPanel(ctx, x, y, w, h, { alpha: 0.93, accent: UI_PURPLE });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 21px Arial";
    ctx.fillText("Dev Tools", x + 18, y + 32);

    ctx.fillStyle = "#9fb1c7";
    ctx.font = "12px 'Segoe UI', Arial";
    ctx.fillText("G or Esc close - click action", x + 18, y + 52);

      ctx.font = "14px Arial";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i < 9 ? "#dfe8f5" : "#8ea1b8";
        this._drawFitText(ctx, lines[i], x + 28, y + rowStart + 16 + i * rowStep, w - 56);
      }

      ctx.restore();
    }

  _drawSimplePanel(ctx, title, body = "") {
    const panelW = Math.min(Math.max(this.w - 140, 320), 520);
    const panelH = Math.min(Math.max(this.h - 160, 220), 260);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;

    ctx.save();
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.92, accent: UI_PURPLE });

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
    const panelH = Math.min(Math.max(this.h - 140, 320), 400);
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
    this._drawPanel(ctx, x, y, panelW, panelH, { alpha: 0.93, accent: UI_PURPLE });

    ctx.fillStyle = "#eef4fb";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Status", x + 20, y + 34);

    ctx.fillStyle = "#95a7bd";
    ctx.font = "12px Arial";
    ctx.fillText("Esc to close", x + 20, y + 54);

    const bodyY = y + 76;
    const bodyH = panelH - 128;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.fillRect(x + 18, bodyY, panelW - 36, bodyH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 18.5, bodyY + 0.5, panelW - 37, bodyH - 1);

    ctx.font = "13px Arial";
    for (let i = 0; i < lines.length; i++) {
      const lineY = y + 92 + i * 24;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(x + 26, lineY - 11, panelW - 52, 18);
      ctx.fillStyle = i === lines.length - 1 ? "#ffd86e" : "#dce7f5";
      this._drawFitText(ctx, lines[i], x + 34, lineY + 2, panelW - 68, 9);
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
