// src/ui.js
// v50 CENTERED MINIMAP + FOLLOWING MAP PANEL (FULL FILE)

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
    if (this._miniT >= 0.18) {
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

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(10,12,18,0.66)";
    roundRect(ctx, x, y, panelW, 176, 16);
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,255,255,1)";
    roundRect(ctx, x, y, panelW, 26, 16);
    ctx.fill();

    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "rgba(255,255,255,1)";
    roundRect(ctx, x + 1, y + 1, panelW - 2, 174, 16);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("BROKE KNIGHT", x + 14, y + 17);

    const bx = x + 14;
    const by = y + 36;

    this._bar(ctx, bx, by, barW, barH, hpP, hpLow ? "rgba(255,92,112,0.98)" : "rgba(235,82,108,0.96)");
    this._bar(ctx, bx, by + barH + gap, barW, barH, mpP, mpLow ? "rgba(112,172,255,0.98)" : "rgba(92,150,255,0.96)");
    this._bar(ctx, bx, by + (barH + gap) * 2, barW, 10, xpP, "rgba(255,210,92,0.96)", 7);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(`HP ${Math.ceil(hero.hp || 0)} / ${Math.ceil(st.maxHp || 100)}`, bx + 8, by + 11);
    ctx.fillText(`Mana ${Math.ceil(hero.mana || 0)} / ${Math.ceil(st.maxMana || 60)}`, bx + 8, by + barH + gap + 11);
    ctx.fillText(`XP ${hero.xp || 0} / ${hero.nextXp || 1}`, bx + 8, by + (barH + gap) * 2 + 9);

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(`Level ${hero.level || 1}`, bx, by + 70);
    ctx.fillText(`Gold ${hero.gold || 0}`, bx + 90, by + 70);
    ctx.fillText(`Potions ${hero.potions?.hp || 0}/${hero.potions?.mana || 0}`, bx + 170, by + 70);

    ctx.fillStyle = "rgba(255,224,130,0.96)";
    ctx.fillText(`Elite Kills ${eliteKills}`, bx, by + 92);

    const critPct = Math.round((st.crit || 0) * 100);
    ctx.fillStyle = "rgba(220,220,220,0.88)";
    ctx.fillText(`DMG ${Math.round(st.dmg || 0)}`, bx + 120, by + 92);
    ctx.fillText(`ARM ${Math.round(st.armor || 0)}`, bx + 190, by + 92);
    ctx.fillText(`CRIT ${critPct}%`, bx + 255, by + 92);

    if (game?.dungeon?.active) {
      ctx.fillStyle = "rgba(188,158,255,0.96)";
      ctx.fillText(`Dungeon Floor ${game.dungeon.floor || 1}`, bx, by + 114);
    } else if ((game?.progress?.dungeonBest || 0) > 0) {
      ctx.fillStyle = "rgba(188,158,255,0.90)";
      ctx.fillText(`Best Depth ${game.progress.dungeonBest}`, bx, by + 114);
    }

    ctx.restore();
  }

  _bar(ctx, x, y, w, h, p, color, r = 8) {
    const fill = clamp(p, 0, 1);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = color;
    roundRect(ctx, x + 1, y + 1, Math.max(0, (w - 2) * fill), h - 2, Math.max(2, r - 1));
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }

  _drawPinnedQuest(ctx, game) {
    const quests = game.quests || [];
    const activeQuest = quests.find(q => !q.done) || null;

    const x = 14;
    const y = 196;
    const w = 352;
    const h = 74;

    ctx.save();

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = activeQuest ? "rgba(18,24,18,0.62)" : "rgba(16,16,18,0.54)";
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = activeQuest ? "rgba(150,235,160,1)" : "rgba(255,255,255,1)";
    roundRect(ctx, x, y, w, 18, 14);
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = activeQuest ? "rgba(188,245,188,0.96)" : "rgba(220,220,220,0.90)";
    ctx.font = "bold 12px system-ui, Arial";
    ctx.fillText(activeQuest ? "PINNED QUEST" : "QUEST STATUS", x + 14, y + 13);

    ctx.font = "13px system-ui, Arial";
    if (activeQuest) {
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.fillText(trimText(ctx, activeQuest.name || "", w - 28), x + 14, y + 38);

      ctx.fillStyle = "rgba(210,235,210,0.92)";
      ctx.fillText(
        trimText(ctx, `${activeQuest.prog || 0}/${activeQuest.goal || 0} • ${activeQuest.desc || ""}`, w - 28),
        x + 14,
        y + 57
      );
    } else {
      ctx.fillStyle = "rgba(235,235,235,0.92)";
      ctx.fillText("All current quests complete.", x + 14, y + 42);
    }

    ctx.restore();
  }

  _drawProgressStrip(ctx, game) {
    const prog = game.progress || {};
    const cleared = prog.clearedCamps?.size || 0;
    const ways = prog.discoveredWaystones?.size || 0;
    const docks = prog.discoveredDocks?.size || 0;
    const eliteKills = prog.eliteKills || 0;
    const doneCount = (game.quests || []).filter(q => q.done).length;

    const x = 14;
    const y = 340;
    const w = 352;
    const h = 60;

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = "rgba(10,12,18,0.58)";
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();

    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 14);
    ctx.stroke();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(`Camps ${cleared}`, x + 14, y + 20);
    ctx.fillText(`Waystones ${ways}`, x + 114, y + 20);
    ctx.fillText(`Docks ${docks}`, x + 244, y + 20);

    ctx.fillStyle = "rgba(255,224,130,0.96)";
    ctx.fillText(`Elite ${eliteKills}`, x + 14, y + 42);

    ctx.fillStyle = "rgba(200,235,200,0.92)";
    ctx.fillText(`Quests Done ${doneCount}`, x + 114, y + 42);

    const zone = prog.currentZoneText || "Wilderness";
    ctx.fillStyle = "rgba(205,215,230,0.88)";
    ctx.fillText(trimText(ctx, zone, 110), x + 244, y + 42);

    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const spells = game.getSpellState?.();
    if (!spells) return;

    const keys = [
      ["Q", spells.q],
      ["W", spells.w],
      ["E", spells.e],
      ["R", spells.r],
    ];

    const cardW = 92;
    const cardH = 48;
    const gap = 10;
    const totalW = keys.length * cardW + (keys.length - 1) * gap;
    const x0 = ((this.w - totalW) * 0.5) | 0;
    const y = this.h - 66;

    ctx.save();

    for (let i = 0; i < keys.length; i++) {
      const [key, s] = keys[i];
      const x = x0 + i * (cardW + gap);
      const cd = Math.max(0, s?.cdLeft || 0);
      const ready = cd <= 0;

      ctx.globalAlpha = 0.90;
      ctx.fillStyle = ready ? "rgba(14,20,28,0.82)" : "rgba(28,18,18,0.82)";
      roundRect(ctx, x, y, cardW, cardH, 12);
      ctx.fill();

      ctx.globalAlpha = 0.14;
      ctx.fillStyle = ready ? "rgba(110,210,255,1)" : "rgba(255,140,140,1)";
      roundRect(ctx, x, y, cardW, 16, 12);
      ctx.fill();

      ctx.globalAlpha = 0.98;
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.font = "bold 13px system-ui, Arial";
      ctx.fillText(key, x + 10, y + 13);

      ctx.font = "12px system-ui, Arial";
      ctx.fillText(trimText(ctx, s?.name || "", 52), x + 28, y + 13);

      ctx.fillStyle = "rgba(215,215,220,0.82)";
      ctx.fillText(`${s?.mana || 0} MP`, x + 10, y + 33);

      ctx.textAlign = "right";
      ctx.fillStyle = ready ? "rgba(145,235,165,0.96)" : "rgba(255,208,160,0.96)";
      ctx.fillText(ready ? "READY" : `${cd.toFixed(1)}s`, x + cardW - 10, y + 33);
      ctx.textAlign = "left";
    }

    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const world = game?.world;
    const mini = this._mini || world?.getMinimapCanvas?.();
    if (!mini || !world) return;

    const size = 154;
    const x = this.w - size - 16;
    const y = 14;

    ctx.save();

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(10,12,18,0.70)";
    roundRect(ctx, x - 8, y - 8, size + 16, size + 16, 16);
    ctx.fill();

    // Keep player centered while minimap terrain moves under them.
    const span = getMapSpan(world, world.mapMode || "small");
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

    roundRect(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, srcX, srcY, srcW, srcH, x, y, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, size, size, 12);
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

    ctx.fillStyle = "rgba(20,20,20,0.92)";
    ctx.fillRect((px - 3) | 0, (py - 3) | 0, 6, 6);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((px - 1) | 0, (py - 1) | 0, 2, 2);

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = "bold 11px system-ui, Arial";
    ctx.fillText(`MINIMAP (${world.mapMode || "small"})`, x + 8, y + 14);

    ctx.restore();
  }

  _drawQuickHelp(ctx) {
    const text = "Arrows move • F interact • Q/W/E/R cast • I inventory • J quests • M map • O options";
    const padX = 12;

    ctx.save();
    ctx.font = "12px system-ui, Arial";
    const tw = ctx.measureText(text).width;
    const x = ((this.w - tw) * 0.5) - padX;
    const y = 12;

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "rgba(10,12,18,0.60)";
    roundRect(ctx, x, y, tw + padX * 2, 22, 11);
    ctx.fill();

    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(230,230,235,0.86)";
    ctx.fillText(text, x + padX, y + 15);

    ctx.restore();
  }

  _drawInteractPrompt(ctx, game) {
    const hero = game.hero;
    let text = "";

    if (game?.dungeon?.active) {
      if (game.dungeon.justCleared && game.dungeon.stairsDown && sq(hero.x - game.dungeon.stairsDown.x, hero.y - game.dungeon.stairsDown.y) < 72 * 72) {
        text = "Press F to descend";
      } else if (game.dungeon.exit && sq(hero.x - game.dungeon.exit.x, hero.y - game.dungeon.exit.y) < 72 * 72) {
        text = "Press F to leave dungeon";
      }
    } else {
      for (const dg of game.world?.dungeons || []) {
        if (sq(hero.x - dg.x, hero.y - dg.y) < 90 * 90) {
          text = "Press F to enter dungeon";
          break;
        }
      }

      if (!text) {
        for (const d of game.world?.docks || []) {
          if (sq(hero.x - d.x, hero.y - d.y) < 72 * 72) {
            text = hero.state?.sailing ? "Press F to dock / stop sailing" : "Press F to sail";
            break;
          }
        }
      }

      if (!text) {
        for (const w of game.world?.waystones || []) {
          if (sq(hero.x - w.x, hero.y - w.y) < 82 * 82) {
            text = "Press F to awaken waystone";
            break;
          }
        }
      }
    }

    if (!text) return;

    ctx.save();
    ctx.font = "bold 13px system-ui, Arial";
    const tw = ctx.measureText(text).width;
    const x = ((this.w - tw) * 0.5) - 16;
    const y = this.h - 104;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(18,20,26,0.82)";
    roundRect(ctx, x, y, tw + 32, 30, 14);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,224,130,1)";
    roundRect(ctx, x, y, tw + 32, 30, 14);
    ctx.strokeStyle = "rgba(255,224,130,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,245,188,0.98)";
    ctx.fillText(text, x + 16, y + 19);

    ctx.restore();
  }

  _drawMessage(ctx, text) {
    ctx.save();
    ctx.font = "bold 14px system-ui, Arial";
    const tw = ctx.measureText(text).width;
    const x = ((this.w - tw) * 0.5) - 18;
    const y = 52;

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(12,16,24,0.82)";
    roundRect(ctx, x, y, tw + 36, 34, 16);
    ctx.fill();

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "rgba(255,255,255,1)";
    roundRect(ctx, x, y, tw + 36, 34, 16);
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fillText(text, x + 18, y + 22);

    ctx.restore();
  }

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

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(12,16,22,0.94)";
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,1)";
    roundRect(ctx, panel.x, panel.y, panel.w, 30, 18);
    ctx.fill();

    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    roundRect(ctx, panel.x + 1, panel.y + 1, panel.w - 2, panel.h - 2, 18);
    ctx.stroke();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = "bold 16px system-ui, Arial";
    ctx.fillText(title, panel.x + 16, panel.y + 20);

    ctx.restore();
  }

  _drawPanelFooter(ctx, panel, text) {
    ctx.save();
    ctx.fillStyle = "rgba(220,220,220,0.74)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(text, panel.x + 16, panel.y + panel.h - 14);
    ctx.restore();
  }

  _drawInventory(ctx, game) {
    const panel = this._panelRect(690, 540);
    this._drawPanelShell(ctx, panel, "INVENTORY");

    const hero = game.hero;
    const items = hero.inventory || [];
    const equip = hero.equip || {};
    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];

    ctx.save();
    ctx.font = "13px system-ui, Arial";

    const lx = panel.x + 20;
    let yy = panel.y + 62;

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillText("Equipped", lx, yy);
    yy += 24;

    for (const s of slots) {
      const it = equip[s] || null;

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, lx - 8, yy - 13, 306, 34, 10);
      ctx.fill();

      ctx.fillStyle = rarityColor(it?.rarity);
      ctx.fillText(`${cap(s)}: ${it ? trimText(ctx, it.name, 255) : "-"}`, lx, yy);

      if (it) {
        ctx.fillStyle = "rgba(210,210,210,0.82)";
        ctx.fillText(trimText(ctx, itemStatLine(it), 255), lx + 14, yy + 15);
      }

      yy += 42;
    }

    yy += 6;
    const st = hero.getStats?.() || {};
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillText("Current Stats", lx, yy);
    yy += 22;
    ctx.fillStyle = "rgba(225,225,225,0.9)";
    ctx.fillText(`Damage: ${Math.round(st.dmg || 0)}`, lx, yy); yy += 18;
    ctx.fillText(`Armor: ${Math.round(st.armor || 0)}`, lx, yy); yy += 18;
    ctx.fillText(`Crit: ${Math.round((st.crit || 0) * 100)}%`, lx, yy); yy += 18;
    ctx.fillText(`HP Potions: ${hero.potions?.hp || 0}`, lx, yy); yy += 18;
    ctx.fillText(`Mana Potions: ${hero.potions?.mana || 0}`, lx, yy);

    const rx = panel.x + 372;
    let ry = panel.y + 62;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillText(`Bag (${items.length})`, rx, ry);
    ry += 24;

    if (!items.length) {
      ctx.fillStyle = "rgba(220,220,220,0.88)";
      ctx.fillText("No items yet.", rx, ry);
    } else {
      for (let i = 0; i < items.length && i < 15; i++) {
        const it = items[i];
        const hotkey = i === 9 ? "0" : String(i + 1);

        ctx.fillStyle = "rgba(255,255,255,0.08)";
        roundRect(ctx, rx - 8, ry - 13, 306, 34, 10);
        ctx.fill();

        ctx.fillStyle = "rgba(255,230,160,0.96)";
        ctx.fillText(`${hotkey}.`, rx, ry);

        ctx.fillStyle = rarityColor(it.rarity);
        ctx.fillText(trimText(ctx, `${it.name} [${it.slot}]`, 246), rx + 22, ry);
        ctx.fillStyle = "rgba(210,210,210,0.82)";
        ctx.fillText(trimText(ctx, itemStatLine(it), 270), rx + 12, ry + 15);
        ry += 42;
      }
    }

    this._drawPanelFooter(ctx, panel, "Esc / I to close • 1-9 / 0 equip bag item");
    ctx.restore();
  }

  _drawQuests(ctx, game) {
    const panel = this._panelRect(690, 540);
    this._drawPanelShell(ctx, panel, "QUESTS");

    const quests = game.quests || [];
    let yy = panel.y + 62;

    ctx.save();
    ctx.font = "13px system-ui, Arial";

    if (!quests.length) {
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.fillText("No quests.", panel.x + 20, yy);
    } else {
      for (let i = 0; i < quests.length && i < 12; i++) {
        const q = quests[i];

        ctx.fillStyle = q.done ? "rgba(30,90,40,0.34)" : "rgba(255,255,255,0.08)";
        roundRect(ctx, panel.x + 12, yy - 16, panel.w - 24, 54, 12);
        ctx.fill();

        ctx.fillStyle = q.done ? "rgba(155,235,165,0.95)" : "rgba(255,255,255,0.94)";
        ctx.fillText(`${q.done ? "✓ " : ""}${q.name} — ${q.prog}/${q.goal}`, panel.x + 22, yy);
        yy += 18;

        ctx.fillStyle = "rgba(220,220,220,0.84)";
        ctx.fillText(trimText(ctx, q.desc || "", panel.w - 52), panel.x + 36, yy);
        yy += 16;

        ctx.fillText(`Reward: ${q.xp || 0} XP, ${q.gold || 0} Gold`, panel.x + 36, yy);
        yy += 28;
      }
    }

    const prog = game.progress || {};
    const px = panel.x + 20;
    const py = panel.y + panel.h - 100;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("Exploration Progress", px, py);

    ctx.fillStyle = "rgba(220,220,220,0.86)";
    ctx.fillText(`Waystones: ${prog.discoveredWaystones?.size || 0}`, px, py + 20);
    ctx.fillText(`Docks: ${prog.discoveredDocks?.size || 0}`, px + 150, py + 20);
    ctx.fillText(`Cleared Camps: ${prog.clearedCamps?.size || 0}`, px + 260, py + 20);

    ctx.fillStyle = "rgba(255,224,130,0.96)";
    ctx.fillText(`Elite Kills: ${prog.eliteKills || 0}`, px, py + 42);

    if ((prog.dungeonBest || 0) > 0) {
      ctx.fillStyle = "rgba(188,158,255,0.96)";
      ctx.fillText(`Best Depth: ${prog.dungeonBest || 0}`, px + 150, py + 42);
    }

    this._drawPanelFooter(ctx, panel, "Esc / J to close");
    ctx.restore();
  }

  _drawMap(ctx, game) {
    const panel = this._panelRect(840, 620);
    this._drawPanelShell(ctx, panel, "WORLD MAP");

    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    const world = game?.world;
    const mode = world?.mapMode || "small";

    ctx.save();
    ctx.font = "12px system-ui, Arial";

    const mapX = panel.x + 20;
    const mapY = panel.y + 56;
    const mapW = 520;
    const mapH = 520;

    ctx.fillStyle = "rgba(18,20,26,0.92)";
    roundRect(ctx, mapX, mapY, mapW, mapH, 14);
    ctx.fill();

    if (mini && world) {
      const span = getMapSpan(world, mode);
      const half = span * 0.5;

      const heroNormX = clamp((game.hero.x + half) / span, 0, 1);
      const heroNormY = clamp((game.hero.y + half) / span, 0, 1);

      const srcFrac = mode === "large" ? 0.75 : 0.26;
      const srcW = Math.max(28, Math.floor(mini.width * srcFrac));
      const srcH = Math.max(28, Math.floor(mini.height * srcFrac));

      let srcX = Math.floor(heroNormX * mini.width - srcW * 0.5);
      let srcY = Math.floor(heroNormY * mini.height - srcH * 0.5);

      srcX = clamp(srcX, 0, Math.max(0, mini.width - srcW));
      srcY = clamp(srcY, 0, Math.max(0, mini.height - srcH));

      ctx.save();
      roundRect(ctx, mapX, mapY, mapW, mapH, 14);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mini, srcX, srcY, srcW, srcH, mapX, mapY, mapW, mapH);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();

      const px = mapX + mapW * 0.5;
      const py = mapY + mapH * 0.5;

      ctx.fillStyle = "rgba(20,20,20,0.96)";
      ctx.fillRect((px - 6) | 0, (py - 6) | 0, 12, 12);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect((px - 3) | 0, (py - 3) | 0, 6, 6);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mapX, py + 0.5);
      ctx.lineTo(mapX + mapW, py + 0.5);
      ctx.moveTo(px + 0.5, mapY);
      ctx.lineTo(px + 0.5, mapY + mapH);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.strokeRect(mapX - 0.5, mapY - 0.5, mapW + 1, mapH + 1);

      const leftWorld = -half + (srcX / mini.width) * span;
      const topWorld = -half + (srcY / mini.height) * span;
      const rightWorld = -half + ((srcX + srcW) / mini.width) * span;
      const bottomWorld = -half + ((srcY + srcH) / mini.height) * span;

      ctx.fillStyle = "rgba(225,230,238,0.92)";
      ctx.fillText(`Mode: ${mode}`, mapX + 10, mapY + 18);
      ctx.fillText(`View X: ${Math.round(leftWorld)} to ${Math.round(rightWorld)}`, mapX + 10, mapY + mapH - 24);
      ctx.fillText(`View Y: ${Math.round(topWorld)} to ${Math.round(bottomWorld)}`, mapX + 10, mapY + mapH - 8);
    } else {
      ctx.fillStyle = "rgba(220,220,220,0.82)";
      ctx.fillText("Map not ready.", mapX + 16, mapY + 20);
    }

    const rx = panel.x + 570;
    let ry = panel.y + 64;

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("Legend", rx, ry);
    ry += 24;

    this._legendDot(ctx, rx, ry, "rgba(255,255,255,1)", "You");
    ry += 22;
    this._legendDot(ctx, rx, ry, "rgba(255,218,92,0.98)", "Waystone");
    ry += 22;
    this._legendDot(ctx, rx, ry, "rgba(90,210,255,0.96)", "Dock");
    ry += 22;
    this._legendDot(ctx, rx, ry, "rgba(255,90,90,0.95)", "Camp");
    ry += 22;
    this._legendDot(ctx, rx, ry, "rgba(182,140,255,0.98)", "Dungeon");
    ry += 34;

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("Map Notes", rx, ry);
    ry += 22;

    ctx.font = "12px system-ui, Arial";
    ctx.fillStyle = "rgba(220,224,232,0.88)";
    ctx.fillText("Minimap stays centered on you.", rx, ry); ry += 18;
    ctx.fillText("Full map follows the hero too.", rx, ry); ry += 18;
    ctx.fillText("Dark areas are unrevealed.", rx, ry); ry += 18;
    ctx.fillText("Walk to uncover more land.", rx, ry); ry += 22;

    ctx.fillStyle = "rgba(255,240,170,0.96)";
    ctx.fillText("Press Z to toggle map scale", rx, ry); ry += 18;
    ctx.fillStyle = "rgba(220,224,232,0.88)";
    ctx.fillText("(small / large)", rx, ry); ry += 26;

    const ways = typeof game._getDiscoveredWaystones === "function"
      ? game._getDiscoveredWaystones()
      : [];

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 13px system-ui, Arial";
    ctx.fillText("Fast Travel", rx, ry);
    ry += 22;

    ctx.font = "12px system-ui, Arial";
    if (!ways.length) {
      ctx.fillStyle = "rgba(220,220,220,0.82)";
      ctx.fillText("Awaken a waystone first.", rx, ry);
      ry += 18;
    } else {
      for (let i = 0; i < ways.length && i < 9; i++) {
        const w = ways[i];
        ctx.fillStyle = "rgba(255,240,170,0.98)";
        ctx.fillText(`${i + 1}. Waystone ${i + 1}`, rx, ry);

        ctx.fillStyle = "rgba(205,205,212,0.76)";
        ctx.fillText(`(${Math.round(w.x)}, ${Math.round(w.y)})`, rx + 105, ry);
        ry += 18;
      }
    }

    if (game.hero?.state?.sailing) {
      ry += 10;
      ctx.fillStyle = "rgba(255,160,160,0.96)";
      ctx.fillText("Cannot fast travel while sailing.", rx, ry);
    }

    this._drawPanelFooter(ctx, panel, "Esc / M to close • Z scale • 1-9 fast travel");
    ctx.restore();
  }

  _legendDot(ctx, x, y, color, label) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 5, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(230,230,235,0.92)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(label, x + 18, y);
  }

  _drawOptions(ctx, game) {
    const panel = this._panelRect(600, 390);
    this._drawPanelShell(ctx, panel, "OPTIONS");

    ctx.save();
    ctx.font = "13px system-ui, Arial";

    const x = panel.x + 20;
    let y = panel.y + 62;

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 14px system-ui, Arial";
    ctx.fillText("Controls", x, y);
    y += 24;

    ctx.font = "13px system-ui, Arial";
    ctx.fillStyle = "rgba(230,230,235,0.92)";
    ctx.fillText("Arrow Keys    - Move / Aim", x, y); y += 22;
    ctx.fillText("F             - Interact", x, y); y += 22;
    ctx.fillText("Q / W / E / R - Cast spells", x, y); y += 22;
    ctx.fillText("1 / 2         - Use potions", x, y); y += 22;
    ctx.fillText("I / J / M / O - Open menus", x, y); y += 22;
    ctx.fillText("Z (on map)    - Toggle map scale", x, y); y += 22;

    y += 10;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 14px system-ui, Arial";
    ctx.fillText("Save", x, y);
    y += 24;

    ctx.font = "13px system-ui, Arial";
    ctx.fillStyle = "rgba(230,230,235,0.92)";
    ctx.fillText(`Save Key: ${game.save?.key || "local save"}`, x, y); y += 22;
    ctx.fillText("Autosave runs during play.", x, y); y += 22;

    y += 10;
    ctx.fillStyle = "rgba(255,160,160,0.98)";
    ctx.font = "bold 14px system-ui, Arial";
    ctx.fillText("New Game / Hard Reset", x, y);
    y += 24;

    ctx.font = "13px system-ui, Arial";
    ctx.fillStyle = "rgba(255,225,225,0.92)";
    ctx.fillText("Open this menu, then press Delete.", x, y); y += 22;
    ctx.fillText("This clears the save and reloads the game.", x, y);

    this._drawPanelFooter(ctx, panel, "Esc / O to close • Delete = clear save + restart");
    ctx.restore();
  }
}

function getMapSpan(world, mode) {
  if (!world) return 2600;
  if (typeof world._getMapSpan === "function") return world._getMapSpan(mode);
  if (mode === "small") return 4200;
  return (world.boundsRadius || 4600) * 2;
}

function sq(x, y) {
  return x * x + y * y;
}

function cap(s) {
  const t = String(s || "");
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

function rarityColor(r) {
  if (r === "epic") return "rgba(215,150,255,0.98)";
  if (r === "rare") return "rgba(120,190,255,0.98)";
  if (r === "uncommon") return "rgba(145,230,145,0.98)";
  return "rgba(235,235,235,0.96)";
}

function itemStatLine(it) {
  if (!it) return "";
  const s = it.stats || {};
  const parts = [];
  if (s.dmg) parts.push(`DMG ${s.dmg}`);
  if (s.armor) parts.push(`ARM ${s.armor}`);
  if (s.crit) parts.push(`CRIT ${Math.round(s.crit * 100)}%`);
  parts.push(`LV ${it.level || 1}`);
  return parts.join(" • ");
}

function trimText(ctx, text, maxW) {
  const t = String(text || "");
  if (ctx.measureText(t).width <= maxW) return t;
  let out = t;
  while (out.length > 0 && ctx.measureText(out + "…").width > maxW) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
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