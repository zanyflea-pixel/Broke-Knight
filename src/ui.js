// src/ui.js
// v43 UI INTERACTION + QUEST PIN PASS (FULL FILE)
// Safe UI-only upgrade:
// - clearer interaction prompt
// - stronger pinned quest box
// - better message styling
// - slightly cleaner spell bar emphasis
// - keeps the current panel/menu structure intact

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

    ctx.fillStyle = hpLow ? "rgba(255,220,220,0.98)" : "rgba(255,255,255,0.96)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(`HP ${Math.round(hero.hp || 0)}/${Math.round(st.maxHp || 100)}`, bx + 8, by + 11);

    ctx.fillStyle = mpLow ? "rgba(220,235,255,0.98)" : "rgba(255,255,255,0.96)";
    ctx.fillText(`MP ${Math.round(hero.mana || 0)}/${Math.round(st.maxMana || 60)}`, bx + 8, by + barH + gap + 11);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fillText(`XP ${Math.round(hero.xp || 0)}/${Math.round(hero.nextXp || 1)}`, bx + 8, by + (barH + gap) * 2 + 9);

    const infoY = by + 54;
    ctx.fillStyle = "rgba(240,240,240,0.93)";
    ctx.fillText(`Lv ${hero.level || 1}`, bx, infoY);
    ctx.fillText(`Gold ${hero.gold || 0}`, bx + 52, infoY);
    ctx.fillText(`Elite ${eliteKills}`, bx + 140, infoY);
    ctx.fillText(`Pots H:${hero.potions?.hp || 0} M:${hero.potions?.mana || 0}`, bx, infoY + 18);

    ctx.fillStyle = "rgba(214,214,214,0.9)";
    ctx.fillText(
      `DMG ${Math.round(st.dmg || 0)}   ARM ${Math.round(st.armor || 0)}   CRIT ${Math.round((st.crit || 0) * 100)}%`,
      bx,
      infoY + 38
    );

    const zone = game?.progress?.currentZoneText || "Wilderness";
    ctx.fillStyle = "rgba(255,235,180,0.95)";
    ctx.fillText(`Zone: ${zone}`, bx, infoY + 58);

    ctx.restore();
  }

  _drawPinnedQuest(ctx, game) {
    const activeQuest = (game.quests || []).find(q => !q.done) || null;

    const x = 14;
    const y = 264;
    const w = 352;
    const h = 68;

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
    ctx.fillText(`Elite Kills ${eliteKills}`, x + 14, y + 42);

    ctx.fillStyle = "rgba(180,235,180,0.94)";
    ctx.fillText(`Quests Done ${doneCount}/${(game.quests || []).length}`, x + 170, y + 42);

    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const mana = game.hero?.mana || 0;
    const spellState = game.getSpellState?.() || {
      q: { name: "Bolt", mana: 6, cdLeft: 0 },
      w: { name: "Nova", mana: 14, cdLeft: 0 },
      e: { name: "Dash", mana: 8, cdLeft: 0 },
      r: { name: "Orb", mana: 18, cdLeft: 0 },
    };

    const order = [
      { key: "Q", id: "q" },
      { key: "W", id: "w" },
      { key: "E", id: "e" },
      { key: "R", id: "r" },
    ];

    const boxW = 90;
    const boxH = 60;
    const gap = 10;
    const totalW = order.length * boxW + (order.length - 1) * gap;
    const x0 = ((this.w - totalW) * 0.5) | 0;
    const y = this.h - 112;

    ctx.save();

    for (let i = 0; i < order.length; i++) {
      const meta = order[i];
      const s = spellState[meta.id];
      const x = x0 + i * (boxW + gap);

      const cdLeft = Math.max(0, s?.cdLeft || 0);
      const affordable = mana >= (s?.mana || 0);
      const ready = cdLeft <= 0 && affordable;

      ctx.globalAlpha = 0.94;
      ctx.fillStyle = ready
        ? "rgba(18,20,28,0.90)"
        : cdLeft > 0
          ? "rgba(18,20,28,0.74)"
          : "rgba(18,20,28,0.60)";
      roundRect(ctx, x, y, boxW, boxH, 14);
      ctx.fill();

      ctx.globalAlpha = ready ? 0.26 : cdLeft > 0 ? 0.10 : 0.08;
      ctx.fillStyle = ready ? "rgba(120,170,255,1)" : "rgba(255,255,255,1)";
      roundRect(ctx, x, y, boxW, 18, 14);
      ctx.fill();

      if (ready) {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "rgba(120,170,255,1)";
        roundRect(ctx, x + 1, y + 1, boxW - 2, boxH - 2, 14);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = ready ? "rgba(255,255,255,0.98)" : "rgba(205,205,205,0.84)";
      ctx.font = "bold 13px system-ui, Arial";
      ctx.fillText(meta.key, x + 10, y + 13);

      ctx.font = "12px system-ui, Arial";
      ctx.fillText(s?.name || "", x + 28, y + 13);

      ctx.fillStyle = affordable ? "rgba(180,220,255,0.95)" : "rgba(255,150,150,0.90)";
      ctx.fillText(`${s?.mana || 0} MP`, x + 10, y + 34);

      if (cdLeft > 0) {
        ctx.fillStyle = "rgba(255,210,120,0.95)";
        ctx.fillText(`${cdLeft.toFixed(1)}s`, x + 10, y + 50);

        const p = 1 - clamp(cdLeft / Math.max(0.01, s?.cd || (cdLeft || 1)), 0, 1);
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = "rgba(255,255,255,1)";
        roundRect(ctx, x + 50, y + 41, 30, 8, 5);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "rgba(255,210,120,1)";
        roundRect(ctx, x + 50, y + 41, 30 * p, 8, 5);
        ctx.fill();
      } else if (!affordable) {
        ctx.fillStyle = "rgba(255,120,120,0.90)";
        ctx.fillText("LOW", x + 10, y + 50);
      } else {
        ctx.fillStyle = "rgba(180,235,180,0.94)";
        ctx.fillText("READY", x + 10, y + 50);
      }
    }

    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    if (!mini) return;

    const size = 166;
    const pad = 14;
    const x = this.w - size - pad;
    const y = 14;

    ctx.save();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(10,12,18,0.72)";
    roundRect(ctx, x - 12, y - 12, size + 24, size + 40, 16);
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,255,255,1)";
    roundRect(ctx, x - 12, y - 12, size + 24, 24, 16);
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 12px system-ui, Arial";
    ctx.fillText("MINIMAP", x, y + 2);

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y + 13, size + 2, size + 2);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, x, y + 14, size, size);
    ctx.imageSmoothingEnabled = true;

    const span = 2600;
    const half = span / 2;
    const sx = game.world?.spawn?.x || 0;
    const sy = game.world?.spawn?.y || 0;

    const hx = ((game.hero.x - (sx - half)) / span) * (size - 1);
    const hy = ((game.hero.y - (sy - half)) / span) * (size - 1);

    ctx.fillStyle = "rgba(20,20,20,0.90)";
    ctx.fillRect((x + hx - 3) | 0, (y + 14 + hy - 3) | 0, 6, 6);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((x + hx - 2) | 0, (y + 14 + hy - 2) | 0, 4, 4);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "11px system-ui, Arial";
    ctx.fillText("M Map", x + 6, y + size + 30);

    ctx.restore();
  }

  _drawQuickHelp(ctx) {
    const text = "Arrows Move • Q/W/E/R Spells • F Interact • 1/2 Potions • I Inventory • J Quests • M Map • O Options";
    const w = Math.min(this.w - 40, 860);
    const x = ((this.w - w) * 0.5) | 0;
    const y = this.h - 20;

    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "rgba(10,12,18,0.56)";
    roundRect(ctx, x, y - 22, w, 26, 10);
    ctx.fill();

    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(trimText(ctx, text, w - 16), x + 8, y - 4);
    ctx.restore();
  }

  _drawInteractPrompt(ctx, game) {
    const prompt =
      game?.getInteractPrompt?.() ||
      game?.interactPrompt ||
      game?.hero?.interactPrompt ||
      "";

    if (!prompt) return;

    const w = Math.min(this.w - 80, 420);
    const h = 46;
    const x = ((this.w - w) * 0.5) | 0;
    const y = this.h - 170;

    ctx.save();

    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(12,16,20,0.78)";
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,235,150,1)";
    roundRect(ctx, x, y, w, 16, 14);
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,230,150,0.98)";
    ctx.font = "bold 12px system-ui, Arial";
    ctx.fillText("F INTERACT", x + 12, y + 12);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "13px system-ui, Arial";
    ctx.fillText(trimText(ctx, String(prompt), w - 24), x + 12, y + 31);

    ctx.restore();
  }

  _drawMessage(ctx, text) {
    const w = Math.min(this.w - 40, 520);
    const x = ((this.w - w) * 0.5) | 0;
    const y = this.h - 222;

    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = "rgba(12,14,20,0.74)";
    roundRect(ctx, x, y, w, 36, 12);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(120,170,255,1)";
    roundRect(ctx, x, y, w, 12, 12);
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.font = "13px system-ui, Arial";
    ctx.fillText(trimText(ctx, text, w - 24), x + 12, y + 23);
    ctx.restore();
  }

  /* ===========================
     Panels
  =========================== */
  _drawInventory(ctx, game) {
    const panel = this._panelRect(720, 530);
    this._drawPanelShell(ctx, panel, "INVENTORY");

    const hero = game.hero;
    const items = hero.inventory || [];
    const eq = hero.equip || {};

    ctx.save();
    ctx.font = "13px system-ui, Arial";

    let lx = panel.x + 20;
    let yy = panel.y + 62;

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillText("Equipped", lx, yy);
    yy += 24;

    const slots = ["weapon", "armor", "helm", "chest", "boots", "ring", "trinket"];
    for (const s of slots) {
      const it = eq[s];
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, lx - 8, yy - 13, 300, 34, 10);
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

        ctx.fillStyle = "rgba(255,255,255,0.08)";
        roundRect(ctx, rx - 8, ry - 13, 306, 34, 10);
        ctx.fill();

        ctx.fillStyle = rarityColor(it.rarity);
        ctx.fillText(`${i + 1}. ${trimText(ctx, `${it.name} [${it.slot}]`, 270)}`, rx, ry);
        ctx.fillStyle = "rgba(210,210,210,0.82)";
        ctx.fillText(trimText(ctx, itemStatLine(it), 270), rx + 12, ry + 15);
        ry += 42;
      }
    }

    this._drawPanelFooter(ctx, panel, "Esc / I to close");
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

    const nextQuest = quests.find(q => !q.done);
    ctx.fillStyle = "rgba(180,235,180,0.94)";
    ctx.fillText(
      nextQuest
        ? `Pinned: ${trimText(ctx, `${nextQuest.name} ${nextQuest.prog}/${nextQuest.goal}`, 470)}`
        : "Pinned: All current quests complete",
      px,
      py + 64
    );

    this._drawPanelFooter(ctx, panel, "Esc / J to close");
    ctx.restore();
  }

  _drawMap(ctx, game) {
    const panel = this._panelRect(620, 580);
    this._drawPanelShell(ctx, panel, "WORLD MAP");

    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    if (!mini) return;

    const innerPad = 18;
    const size = Math.min(panel.w - innerPad * 2, panel.h - 104);
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

    ctx.fillStyle = "rgba(20,20,20,0.90)";
    ctx.fillRect((x + hx - 4) | 0, (y + hy - 4) | 0, 8, 8);
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect((x + hx - 2) | 0, (y + hy - 2) | 0, 4, 4);

    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText("White square = you", x, y + size + 20);

    this._drawPanelFooter(ctx, panel, "Esc / M to close");
    ctx.restore();
  }

  _drawOptions(ctx, game) {
    const panel = this._panelRect(540, 340);
    this._drawPanelShell(ctx, panel, "OPTIONS / HELP");

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = "13px system-ui, Arial";

    let y = panel.y + 62;
    const x = panel.x + 20;
    ctx.fillText("Move: Arrow Keys only", x, y); y += 24;
    ctx.fillText("Spells: Q / W / E / R", x, y); y += 24;
    ctx.fillText("Interact: F", x, y); y += 24;
    ctx.fillText("Potions: 1 / 2", x, y); y += 24;
    ctx.fillText("Menus: I / J / M / O / Esc", x, y); y += 24;
    ctx.fillText("Mana regenerates over time.", x, y); y += 24;
    ctx.fillText("Explore camps, awaken waystones, find docks, and collect gear.", x, y); y += 24;

    const prog = game.progress || {};
    ctx.fillStyle = "rgba(180,235,180,0.94)";
    ctx.fillText(`Discovered: ${prog.discoveredWaystones?.size || 0} waystones, ${prog.discoveredDocks?.size || 0} docks`, x, y);
    y += 22;
    ctx.fillStyle = "rgba(255,224,130,0.96)";
    ctx.fillText(`Elite Kills: ${prog.eliteKills || 0}`, x, y);

    this._drawPanelFooter(ctx, panel, "Esc / O to close");
    ctx.restore();
  }

  /* ===========================
     Shared
  =========================== */
  _bar(ctx, x, y, w, h, p, fill, r = 8) {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = fill;
    roundRect(ctx, x, y, Math.max(0, w * p), h, r);
    ctx.fill();
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
    ctx.fillStyle = "rgba(10,12,18,0.82)";
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,1)";
    roundRect(ctx, panel.x, panel.y, panel.w, 28, 18);
    ctx.fill();

    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    roundRect(ctx, panel.x + 1, panel.y + 1, panel.w - 2, panel.h - 2, 18);
    ctx.stroke();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 16px system-ui, Arial";
    ctx.fillText(title, panel.x + 16, panel.y + 19);

    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect(panel.x + 14, panel.y + 38, panel.w - 28, 1);

    ctx.restore();
  }

  _drawPanelFooter(ctx, panel, text) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText(text, panel.x + 16, panel.y + panel.h - 14);
    ctx.restore();
  }
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

function trimText(ctx, text, maxW) {
  let s = String(text || "");
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

function cap(s) {
  s = String(s || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function rarityColor(r) {
  if (r === "epic") return "rgba(215,150,255,0.96)";
  if (r === "rare") return "rgba(120,190,255,0.96)";
  if (r === "uncommon") return "rgba(145,230,145,0.96)";
  return "rgba(230,230,230,0.94)";
}

function itemStatLine(it) {
  const s = it?.stats || {};
  const parts = [];
  if (s.dmg) parts.push(`DMG ${s.dmg}`);
  if (s.armor) parts.push(`ARM ${s.armor}`);
  if (s.crit) parts.push(`CRIT ${Math.round(s.crit * 100)}%`);
  parts.push(`${it?.rarity || "common"}`);
  return parts.join("  •  ");
}