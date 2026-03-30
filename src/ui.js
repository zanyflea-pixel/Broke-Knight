// src/ui.js
// v44 SAFE FULL UI REPLACEMENT + MAP FAST TRAVEL HINT
// Full replacement built to match the current game.js API.
// Includes:
// - HUD
// - pinned quest
// - progress strip
// - spell bar
// - minimap
// - quick help
// - interaction prompt
// - inventory / quests / map / options panels
// - map fast travel help for 1-9 waystones

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

  setMsg(text, t = 2.0) {
    this._msg = String(text || "");
    this._msgT = Math.max(0, +t || 0);
  }

  open(name) {
    this._open = name || null;
  }

  closeAll() {
    this._open = null;
  }

  update(dt, game) {
    if (this._msgT > 0) {
      this._msgT = Math.max(0, this._msgT - dt);
      if (this._msgT <= 0) this._msg = "";
    }

    this._miniT += dt;
    if (this._miniT >= 0.35) {
      this._miniT = 0;
      this._mini = game?.world?.getMinimapCanvas?.() || null;
    }
  }

  draw(ctx, game) {
    if (!ctx || !game) return;

    this._drawHUD(ctx, game);
    this._drawPinnedQuest(ctx, game);
    this._drawProgressStrip(ctx, game);
    this._drawSpellBar(ctx, game);
    this._drawMinimap(ctx, game);
    this._drawQuickHelp(ctx);
    this._drawInteractPrompt(ctx, game);

    if (this._msg && this._msgT > 0) {
      this._drawMessage(ctx, this._msg);
    }

    if (this._open === "inventory") this._drawInventory(ctx, game);
    if (this._open === "quests") this._drawQuests(ctx, game);
    if (this._open === "map") this._drawMap(ctx, game);
    if (this._open === "options") this._drawOptions(ctx, game);
  }

  /* ===========================
     HUD
  =========================== */

  _drawHUD(ctx, game) {
    const hero = game.hero;
    const st = hero.getStats?.() || { maxHp: 100, maxMana: 60, dmg: 8, armor: 0, crit: 0.05 };
    const eliteKills = game?.progress?.eliteKills || 0;

    const hpP = clamp((hero.hp || 0) / Math.max(1, st.maxHp || 1), 0, 1);
    const mpP = clamp((hero.mana || 0) / Math.max(1, st.maxMana || 1), 0, 1);
    const xpP = clamp((hero.xp || 0) / Math.max(1, hero.nextXp || 1), 0, 1);

    const hpLow = hpP <= 0.25;
    const mpLow = mpP <= 0.20;

    const x = 14;
    const y = 12;
    const panelW = 352;
    const barW = 252;
    const barH = 14;
    const gap = 8;

    ctx.save();

    this._fillRound(ctx, x, y, panelW, 104, 14, "rgba(8,12,18,0.72)");
    this._strokeRound(ctx, x, y, panelW, 104, 14, "rgba(255,255,255,0.08)", 1);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 15px system-ui, Arial";
    ctx.fillText(`Lv ${hero.level || 1}  Broke Knight`, x + 14, y + 22);

    ctx.font = "12px system-ui, Arial";
    ctx.fillStyle = "rgba(230,230,235,0.88)";
    ctx.fillText(`Gold ${hero.gold || 0}   Potions ${hero.potions?.hp || 0}/${hero.potions?.mana || 0}   Elite ${eliteKills}`, x + 14, y + 40);

    this._drawLabeledBar(
      ctx,
      x + 14, y + 50,
      barW, barH,
      hpP,
      hpLow ? "rgba(230,70,90,0.98)" : "rgba(205,56,76,0.98)",
      "HP",
      `${Math.ceil(hero.hp || 0)} / ${Math.ceil(st.maxHp || 100)}`
    );

    this._drawLabeledBar(
      ctx,
      x + 14, y + 72,
      barW, barH,
      mpP,
      mpLow ? "rgba(88,160,255,0.98)" : "rgba(64,126,235,0.98)",
      "MP",
      `${Math.ceil(hero.mana || 0)} / ${Math.ceil(st.maxMana || 60)}`
    );

    this._drawLabeledBar(
      ctx,
      x + 14 + barW + gap + 6, y + 50,
      58, 36,
      xpP,
      "rgba(255,210,92,0.98)",
      "XP",
      `${Math.ceil(hero.xp || 0)}`
    );

    ctx.restore();
  }

  _drawLabeledBar(ctx, x, y, w, h, p, color, label, value) {
    const fill = clamp(p, 0, 1);

    this._fillRound(ctx, x, y, w, h, 8, "rgba(0,0,0,0.45)");
    this._fillRound(ctx, x + 1, y + 1, Math.max(0, (w - 2) * fill), h - 2, 7, color);
    this._strokeRound(ctx, x, y, w, h, 8, "rgba(255,255,255,0.12)", 1);

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = "bold 11px system-ui, Arial";
    ctx.fillText(label, x + 8, y + h - 4);

    ctx.textAlign = "right";
    ctx.font = "11px system-ui, Arial";
    ctx.fillText(value, x + w - 8, y + h - 4);
    ctx.textAlign = "left";
  }

  _drawPinnedQuest(ctx, game) {
    const quests = Array.isArray(game.quests) ? game.quests : [];
    const q = quests.find(v => v && !v.done) || quests[0];
    if (!q) return;

    const x = 14;
    const y = 124;
    const w = 292;
    const h = 66;

    ctx.save();
    this._fillRound(ctx, x, y, w, h, 12, "rgba(20,24,32,0.68)");
    this._strokeRound(ctx, x, y, w, h, 12, "rgba(255,214,120,0.22)", 1);

    ctx.fillStyle = "rgba(255,220,140,0.98)";
    ctx.font = "bold 12px system-ui, Arial";
    ctx.fillText("Pinned Quest", x + 12, y + 18);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText(q.name || "Quest", x + 12, y + 38);

    ctx.fillStyle = "rgba(220,224,232,0.84)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(q.desc || "", x + 12, y + 54);

    const prog = clamp((q.prog || 0) / Math.max(1, q.goal || 1), 0, 1);
    this._fillRound(ctx, x + 196, y + 18, 82, 10, 5, "rgba(0,0,0,0.42)");
    this._fillRound(ctx, x + 197, y + 19, (80 * prog), 8, 4, "rgba(255,214,92,0.98)");

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = "bold 11px system-ui, Arial";
    ctx.fillText(`${q.prog || 0}/${q.goal || 0}`, x + 278, y + 54);
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawProgressStrip(ctx, game) {
    const text = game?.progress?.currentZoneText || "Wilderness";
    const discoveredWays = game?.progress?.discoveredWaystones?.size || 0;
    const discoveredDocks = game?.progress?.discoveredDocks?.size || 0;
    const cleared = game?.progress?.clearedCamps?.size || 0;

    const x = 14;
    const y = this.h - 36;
    const w = 420;
    const h = 22;

    ctx.save();
    this._fillRound(ctx, x, y, w, h, 11, "rgba(8,12,18,0.58)");
    this._strokeRound(ctx, x, y, w, h, 11, "rgba(255,255,255,0.08)", 1);

    ctx.fillStyle = "rgba(230,235,245,0.92)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(
      `${text}  •  Waystones ${discoveredWays}  •  Docks ${discoveredDocks}  •  Camps ${cleared}`,
      x + 12,
      y + 15
    );
    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const spells = game?.getSpellState?.();
    if (!spells) return;

    const entries = [
      ["Q", spells.q],
      ["W", spells.w],
      ["E", spells.e],
      ["R", spells.r],
    ];

    const cardW = 90;
    const cardH = 48;
    const gap = 10;
    const total = entries.length * cardW + (entries.length - 1) * gap;
    const x0 = ((this.w - total) * 0.5) | 0;
    const y = this.h - 74;

    ctx.save();

    for (let i = 0; i < entries.length; i++) {
      const [key, s] = entries[i];
      const x = x0 + i * (cardW + gap);
      const ready = (s?.cdLeft || 0) <= 0;

      this._fillRound(ctx, x, y, cardW, cardH, 12, ready ? "rgba(18,24,34,0.78)" : "rgba(26,18,18,0.80)");
      this._strokeRound(ctx, x, y, cardW, cardH, 12, ready ? "rgba(140,210,255,0.18)" : "rgba(255,140,140,0.16)", 1);

      ctx.fillStyle = ready ? "rgba(255,255,255,0.96)" : "rgba(255,210,210,0.92)";
      ctx.font = "bold 14px system-ui, Arial";
      ctx.fillText(key, x + 10, y + 18);

      ctx.font = "12px system-ui, Arial";
      ctx.fillText(`${s?.name || ""}`, x + 28, y + 18);

      ctx.fillStyle = "rgba(214,220,230,0.84)";
      ctx.fillText(`${s?.mana || 0} MP`, x + 10, y + 36);

      ctx.textAlign = "right";
      ctx.fillStyle = ready ? "rgba(145,235,165,0.96)" : "rgba(255,190,150,0.96)";
      ctx.fillText(ready ? "READY" : `${(s?.cdLeft || 0).toFixed(1)}s`, x + cardW - 10, y + 36);
      ctx.textAlign = "left";
    }

    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    if (!mini) return;

    const size = 154;
    const x = this.w - size - 16;
    const y = 14;

    ctx.save();
    this._fillRound(ctx, x - 8, y - 8, size + 16, size + 16, 14, "rgba(10,14,20,0.70)");
    this._strokeRound(ctx, x - 8, y - 8, size + 16, size + 16, 14, "rgba(255,255,255,0.08)", 1);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, x, y, size, size);
    ctx.imageSmoothingEnabled = true;

    const span = 2600;
    const half = span / 2;
    const sx = game.world?.spawn?.x || 0;
    const sy = game.world?.spawn?.y || 0;
    const hx = ((game.hero.x - (sx - half)) / span) * (size - 1);
    const hy = ((game.hero.y - (sy - half)) / span) * (size - 1);

    ctx.fillStyle = "rgba(16,16,18,0.92)";
    ctx.fillRect((x + hx - 3) | 0, (y + hy - 3) | 0, 6, 6);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((x + hx - 1) | 0, (y + hy - 1) | 0, 2, 2);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 11px system-ui, Arial";
    ctx.fillText("MAP", x + 6, y + 14);
    ctx.restore();
  }

  _drawQuickHelp(ctx) {
    const text = "Arrows move • F interact • Q/W/E/R spells • I inventory • J quests • M map • O options";
    const x = (this.w * 0.5) | 0;
    const y = 18;

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "12px system-ui, Arial";
    const padX = 10;
    const tw = ctx.measureText(text).width;
    this._fillRound(ctx, x - tw / 2 - padX, y - 13, tw + padX * 2, 22, 11, "rgba(8,12,18,0.46)");
    ctx.fillStyle = "rgba(230,234,240,0.78)";
    ctx.fillText(text, x, y + 2);
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawInteractPrompt(ctx, game) {
    const hero = game?.hero;
    if (!hero || !game?.world) return;

    let near = "";
    for (const d of game.world?.docks || []) {
      const dx = hero.x - d.x;
      const dy = hero.y - d.y;
      if (dx * dx + dy * dy < 80 * 80) {
        near = hero.state?.sailing ? "Press F to dock / stop sailing" : "Press F to use dock / start sailing";
        break;
      }
    }

    if (!near) {
      for (const w of game.world?.waystones || []) {
        const dx = hero.x - w.x;
        const dy = hero.y - w.y;
        if (dx * dx + dy * dy < 90 * 90) {
          near = "Press F to awaken waystone";
          break;
        }
      }
    }

    if (!near) return;

    const y = this.h - 106;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 13px system-ui, Arial";
    const tw = ctx.measureText(near).width;
    this._fillRound(ctx, this.w / 2 - tw / 2 - 14, y - 15, tw + 28, 28, 14, "rgba(20,24,32,0.78)");
    this._strokeRound(ctx, this.w / 2 - tw / 2 - 14, y - 15, tw + 28, 28, 14, "rgba(255,214,120,0.22)", 1);
    ctx.fillStyle = "rgba(255,244,188,0.98)";
    ctx.fillText(near, this.w / 2, y + 4);
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawMessage(ctx, text) {
    const x = this.w / 2;
    const y = 56;

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 14px system-ui, Arial";
    const tw = ctx.measureText(text).width;
    this._fillRound(ctx, x - tw / 2 - 16, y - 16, tw + 32, 32, 16, "rgba(12,16,24,0.82)");
    this._strokeRound(ctx, x - tw / 2 - 16, y - 16, tw + 32, 32, 16, "rgba(255,255,255,0.10)", 1);
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fillText(text, x, y + 5);
    ctx.textAlign = "left";
    ctx.restore();
  }

  /* ===========================
     PANELS
  =========================== */

  _panelRect(w, h) {
    return {
      x: ((this.w - w) * 0.5) | 0,
      y: ((this.h - h) * 0.5) | 0,
      w,
      h,
    };
  }

  _drawPanelShell(ctx, panel, title) {
    ctx.save();
    this._fillRound(ctx, panel.x, panel.y, panel.w, panel.h, 18, "rgba(10,14,20,0.92)");
    this._strokeRound(ctx, panel.x, panel.y, panel.w, panel.h, 18, "rgba(255,255,255,0.10)", 1);

    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = "bold 18px system-ui, Arial";
    ctx.fillText(title, panel.x + 18, panel.y + 28);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(panel.x + 18, panel.y + 40);
    ctx.lineTo(panel.x + panel.w - 18, panel.y + 40);
    ctx.stroke();
    ctx.restore();
  }

  _drawPanelFooter(ctx, panel, text) {
    ctx.save();
    ctx.fillStyle = "rgba(210,214,222,0.76)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(text, panel.x + 18, panel.y + panel.h - 16);
    ctx.restore();
  }

  _drawInventory(ctx, game) {
    const panel = this._panelRect(700, 500);
    this._drawPanelShell(ctx, panel, "INVENTORY");

    const hero = game.hero;
    const bag = Array.isArray(hero.inventory) ? hero.inventory : [];
    const equip = hero.equip || {};

    const leftX = panel.x + 22;
    const rightX = panel.x + 360;
    let y = panel.y + 64;

    ctx.save();

    ctx.fillStyle = "rgba(255,220,150,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("Equipped", leftX, y);
    y += 18;

    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
    for (const slot of slots) {
      const it = equip[slot];
      this._fillRound(ctx, leftX, y - 12, 300, 30, 10, "rgba(255,255,255,0.04)");
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "12px system-ui, Arial";
      ctx.fillText(`${slot.toUpperCase()}: ${it ? it.name : "-"}`, leftX + 10, y + 6);
      y += 36;
    }

    let by = panel.y + 64;
    ctx.fillStyle = "rgba(160,220,255,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("Bag", rightX, by);
    by += 18;

    const maxRows = 10;
    for (let i = 0; i < Math.min(bag.length, maxRows); i++) {
      const it = bag[i];
      this._fillRound(ctx, rightX, by - 12, 318, 32, 10, "rgba(255,255,255,0.04)");

      const hot = i === 9 ? "0" : String(i + 1);
      ctx.fillStyle = "rgba(255,214,120,0.96)";
      ctx.font = "bold 12px system-ui, Arial";
      ctx.fillText(`[${hot}]`, rightX + 8, by + 7);

      ctx.fillStyle = this._rarityColor(it?.rarity);
      ctx.fillText(it?.name || "Item", rightX + 44, by + 7);

      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(220,224,232,0.86)";
      const s = it?.stats || {};
      const statText = `Lv ${it?.level || 1}  Dmg ${s.dmg || 0}  Arm ${s.armor || 0}  Crit ${Math.round((s.crit || 0) * 100)}%`;
      ctx.fillText(statText, rightX + 304, by + 7);
      ctx.textAlign = "left";

      by += 36;
    }

    if (!bag.length) {
      ctx.fillStyle = "rgba(220,224,232,0.74)";
      ctx.font = "12px system-ui, Arial";
      ctx.fillText("Your bag is empty.", rightX, by + 8);
    }

    this._drawPanelFooter(ctx, panel, "I / Esc close • On the game side, 1-0 can be used for bag hotkeys if enabled");
    ctx.restore();
  }

  _drawQuests(ctx, game) {
    const panel = this._panelRect(620, 480);
    this._drawPanelShell(ctx, panel, "QUESTS");

    const quests = Array.isArray(game.quests) ? game.quests : [];
    let y = panel.y + 64;

    ctx.save();

    if (!quests.length) {
      ctx.fillStyle = "rgba(220,224,232,0.82)";
      ctx.font = "13px system-ui, Arial";
      ctx.fillText("No quests yet.", panel.x + 20, y);
      this._drawPanelFooter(ctx, panel, "J / Esc close");
      ctx.restore();
      return;
    }

    for (const q of quests) {
      const h = 64;
      this._fillRound(ctx, panel.x + 18, y - 16, panel.w - 36, h, 12, q.done ? "rgba(30,52,34,0.64)" : "rgba(255,255,255,0.04)");
      this._strokeRound(ctx, panel.x + 18, y - 16, panel.w - 36, h, 12, q.done ? "rgba(145,235,165,0.20)" : "rgba(255,255,255,0.06)", 1);

      ctx.fillStyle = q.done ? "rgba(145,235,165,0.98)" : "rgba(255,255,255,0.96)";
      ctx.font = "bold 14px system-ui, Arial";
      ctx.fillText(q.name || "Quest", panel.x + 30, y + 2);

      ctx.fillStyle = "rgba(220,224,232,0.82)";
      ctx.font = "12px system-ui, Arial";
      ctx.fillText(q.desc || "", panel.x + 30, y + 20);

      const p = clamp((q.prog || 0) / Math.max(1, q.goal || 1), 0, 1);
      this._fillRound(ctx, panel.x + 30, y + 28, 340, 10, 5, "rgba(0,0,0,0.42)");
      this._fillRound(ctx, panel.x + 31, y + 29, 338 * p, 8, 4, q.done ? "rgba(145,235,165,0.98)" : "rgba(255,214,92,0.98)");

      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText(`${q.prog || 0}/${q.goal || 0}   XP ${q.xp || 0}   Gold ${q.gold || 0}`, panel.x + panel.w - 30, y + 20);
      ctx.textAlign = "left";

      y += 76;
      if (y > panel.y + panel.h - 50) break;
    }

    this._drawPanelFooter(ctx, panel, "J / Esc close");
    ctx.restore();
  }

  _drawMap(ctx, game) {
    const panel = this._panelRect(620, 580);
    this._drawPanelShell(ctx, panel, "WORLD MAP");

    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    if (!mini) return;

    const innerPad = 18;
    const size = Math.min(panel.w - innerPad * 2, panel.h - 190);
    const x = panel.x + innerPad;
    const y = panel.y + 50;

    ctx.save();

    ctx.globalAlpha = 0.98;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, x, y, size, size);
    ctx.imageSmoothingEnabled = true;

    const span = 2600;
    const half = span / 2;
    const sx = game.world?.spawn?.x || 0;
    const sy = game.world?.spawn?.y || 0;

    const hx = ((game.hero.x - (sx - half)) / span) * (size - 1);
    const hy = ((game.hero.y - (sy - half)) / span) * (size - 1);

    ctx.fillStyle = "rgba(20,20,20,0.92)";
    ctx.fillRect((x + hx - 4) | 0, (y + hy - 4) | 0, 8, 8);

    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((x + hx - 2) | 0, (y + hy - 2) | 0, 4, 4);

    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText("White square = you", x, y + size + 20);

    const ways = typeof game._getDiscoveredWaystones === "function"
      ? game._getDiscoveredWaystones()
      : [];

    let listY = y + size + 48;

    ctx.fillStyle = "rgba(180,235,180,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("Fast Travel", x, listY);
    listY += 20;

    ctx.font = "12px system-ui, Arial";

    if (!ways.length) {
      ctx.fillStyle = "rgba(220,220,220,0.82)";
      ctx.fillText("Awaken a waystone with F to unlock travel.", x, listY);
    } else {
      for (let i = 0; i < ways.length && i < 9; i++) {
        const w = ways[i];
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(`${i + 1}. Waystone ${i + 1}`, x, listY);

        ctx.fillStyle = "rgba(200,200,200,0.72)";
        ctx.fillText(`(${Math.round(w.x)}, ${Math.round(w.y)})`, x + 120, listY);

        listY += 18;
      }

      if (game.hero?.state?.sailing) {
        listY += 8;
        ctx.fillStyle = "rgba(255,140,140,0.95)";
        ctx.fillText("Cannot fast travel while sailing.", x, listY);
      }
    }

    this._drawPanelFooter(ctx, panel, "Esc / M to close • 1-9 fast travel");
    ctx.restore();
  }

  _drawOptions(ctx, game) {
    const panel = this._panelRect(520, 340);
    this._drawPanelShell(ctx, panel, "OPTIONS");

    ctx.save();
    ctx.fillStyle = "rgba(230,234,242,0.92)";
    ctx.font = "13px system-ui, Arial";

    const lines = [
      "Arrows: Move / Aim",
      "F: Interact",
      "Q / W / E / R: Cast spells",
      "1 / 2: Use HP / Mana potions",
      "I / J / M / O: Open menus",
      "",
      `Save slot: ${game?.save?.key || "local save"}`,
      "Autosave is handled by the game.",
    ];

    let y = panel.y + 70;
    for (const line of lines) {
      ctx.fillText(line, panel.x + 22, y);
      y += 22;
    }

    this._drawPanelFooter(ctx, panel, "O / Esc close");
    ctx.restore();
  }

  /* ===========================
     HELPERS
  =========================== */

  _rarityColor(r) {
    if (r === "epic") return "rgba(215,150,255,0.98)";
    if (r === "rare") return "rgba(120,190,255,0.98)";
    if (r === "uncommon") return "rgba(145,230,145,0.98)";
    return "rgba(230,230,230,0.96)";
  }

  _fillRound(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    const p = new Path2D();
    this._roundRectPath(p, x, y, w, h, r);
    ctx.fill(p);
  }

  _strokeRound(ctx, x, y, w, h, r, color, lineWidth = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    const p = new Path2D();
    this._roundRectPath(p, x, y, w, h, r);
    ctx.stroke(p);
  }

  _roundRectPath(path, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    path.moveTo(x + rr, y);
    path.lineTo(x + w - rr, y);
    path.quadraticCurveTo(x + w, y, x + w, y + rr);
    path.lineTo(x + w, y + h - rr);
    path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    path.lineTo(x + rr, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - rr);
    path.lineTo(x, y + rr);
    path.quadraticCurveTo(x, y, x + rr, y);
    path.closePath();
  }
}