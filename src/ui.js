// src/ui.js
// v88 MINIMAP LOCK + BIG MAP ZOOM FIX (FULL FILE)

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
    this._drawRewardBuffs(ctx, game);
    this._drawBossBar(ctx, game);
    this._drawSpellBar(ctx, game);
    this._drawMinimap(ctx, game);
    this._drawHelp(ctx, game);
    this._drawPrompt(ctx, game);
    this._drawToast(ctx, game);

    const open = game?.menu?.open || this._open || null;
    if (!open) return;

    if (open === "inventory") this._drawInventory(ctx, game);
    else if (open === "skills") this._drawSkills(ctx, game);
    else if (open === "god") this._drawGod(ctx, game);
    else if (open === "map") this._drawMap(ctx, game);
    else if (open === "quests") this._drawQuests(ctx, game);
    else if (open === "shop") this._drawShop(ctx, game);
    else if (open === "options") this._drawOptions(ctx);
  }

  _syncViewFromCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      this.w = rect.width | 0;
      this.h = rect.height | 0;
    }
  }

  _drawHUD(ctx, game) {
    const hero = game?.hero;
    const st = hero?.getStats?.() || {
      maxHp: hero?.maxHp || 100,
      maxMana: hero?.maxMana || 60,
      dmg: 10,
      armor: 2,
      crit: 0.05,
      critMult: 1.7,
    };

    const hpP = clamp((hero?.hp || 0) / Math.max(1, st.maxHp || 1), 0, 1);
    const mpP = clamp((hero?.mana || 0) / Math.max(1, st.maxMana || 1), 0, 1);
    const xpP = clamp((hero?.xp || 0) / Math.max(1, hero?.nextXp || 1), 0, 1);

    const x = 14;
    const y = 12;
    const panelW = 418;
    const panelH = 166;

    ctx.save();

    this._panel(ctx, x, y, panelW, panelH, 16, "rgba(10,12,18,0.80)");

    ctx.fillStyle = "rgba(246,248,252,0.96)";
    ctx.font = "bold 13px Arial";
    ctx.fillText("BROKE KNIGHT", x + 14, y + 18);

    const bx = x + 14;
    let by = y + 34;

    this._bar(ctx, bx, by, 276, 15, hpP, "HP", `${Math.round(hero?.hp || 0)}/${Math.round(st.maxHp || 0)}`, "rgba(220,76,104,0.98)");
    by += 25;
    this._bar(ctx, bx, by, 276, 15, mpP, "MP", `${Math.round(hero?.mana || 0)}/${Math.round(st.maxMana || 0)}`, "rgba(82,150,255,0.98)");
    by += 25;
    this._bar(ctx, bx, by, 276, 12, xpP, "XP", `${Math.round(hero?.xp || 0)}/${Math.round(hero?.nextXp || 0)}`, "rgba(228,196,92,0.98)");

    const rx = x + 306;
    ctx.fillStyle = "rgba(222,230,244,0.90)";
    ctx.font = "13px Arial";
    ctx.fillText(`Lv ${hero?.level || 1}`, rx, y + 39);
    ctx.fillText(`${hero?.gold || 0} Gold`, rx, y + 59);
    ctx.fillText(`DMG ${Math.round(st.dmg || 0)}`, rx, y + 79);
    ctx.fillText(`ARM ${Math.round(st.armor || 0)}`, rx, y + 99);
    ctx.fillText(`CRT ${Math.round((st.crit || 0) * 100)}%`, rx, y + 119);

    ctx.fillStyle = "rgba(198,208,226,0.82)";
    ctx.font = "12px Arial";
    ctx.fillText(`1 HP x${hero?.potions?.hp || 0}   2 MP x${hero?.potions?.mana || 0}`, x + 14, y + 138);

    const bossAlive = !!game?.dungeon?.boss?.enemy?.alive;
    const activeQuest = (game?.quests || []).find(q => !q.turnedIn && !q.done);
    const readyQuest = (game?.quests || []).find(q => !q.turnedIn && q.done);

    if (hero?.state?.sailing) {
      this._chip(ctx, x + panelW - 92, y + 10, 76, 18, "SAILING", "rgba(76,152,226,0.95)");
    } else if (bossAlive) {
      this._chip(ctx, x + panelW - 108, y + 10, 92, 18, "BOSS FLOOR", "rgba(206,102,86,0.96)");
    } else if (game?.dungeon?.active) {
      this._chip(ctx, x + panelW - 100, y + 10, 84, 18, `FLOOR ${game?.dungeon?.floor || 1}`, "rgba(144,96,220,0.95)");
    } else if (game?.menu?.open === "shop") {
      this._chip(ctx, x + panelW - 88, y + 10, 72, 18, "SHOP", "rgba(218,166,88,0.94)");
    } else if (readyQuest) {
      this._chip(ctx, x + panelW - 116, y + 10, 100, 18, "TURN-IN READY", "rgba(122,214,128,0.95)");
    } else if (activeQuest?.eliteOnly) {
      this._chip(ctx, x + panelW - 108, y + 10, 92, 18, "ELITE BOUNTY", "rgba(235,160,88,0.95)");
    } else if (activeQuest) {
      this._chip(ctx, x + panelW - 96, y + 10, 80, 18, "QUEST", "rgba(88,166,98,0.94)");
    } else {
      this._chip(ctx, x + panelW - 108, y + 10, 92, 18, "OVERWORLD", "rgba(88,166,98,0.94)");
    }

    ctx.restore();
  }

  _drawRewardBuffs(ctx, game) {
    const st = game?.hero?.state || {};
    const entries = [];

    if ((st.campBuffT || 0) > 0) {
      entries.push({
        title: "Camp Blessing",
        value: `+${st.campBuffPower || 0} power`,
        time: `${Math.ceil(st.campBuffT || 0)}s`,
        color: "rgba(112,196,112,0.95)",
        fill: "rgba(26,48,28,0.90)",
      });
    }

    if ((st.dungeonMomentumT || 0) > 0) {
      entries.push({
        title: "Dungeon Momentum",
        value: `+${st.dungeonMomentumPower || 0} power`,
        time: `${Math.ceil(st.dungeonMomentumT || 0)}s`,
        color: "rgba(154,124,255,0.96)",
        fill: "rgba(26,22,44,0.90)",
      });
    }

    if ((st.eliteChainT || 0) > 0 && (st.eliteChainCount || 0) > 0) {
      entries.push({
        title: `Elite Chain x${st.eliteChainCount || 0}`,
        value: `bonus run pressure`,
        time: `${Math.ceil(st.eliteChainT || 0)}s`,
        color: "rgba(255,180,102,0.96)",
        fill: "rgba(48,28,14,0.90)",
      });
    }

    if (!entries.length) return;

    const x = 14;
    let y = 186;

    ctx.save();
    for (const e of entries) {
      this._panel(ctx, x, y, 210, 42, 12, e.fill);
      ctx.fillStyle = e.color;
      ctx.font = "bold 13px Arial";
      ctx.fillText(e.title, x + 12, y + 16);
      ctx.fillStyle = "rgba(232,238,252,0.90)";
      ctx.font = "12px Arial";
      ctx.fillText(e.value, x + 12, y + 32);

      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(245,248,255,0.95)";
      ctx.font = "bold 12px Arial";
      ctx.fillText(e.time, x + 196, y + 24);
      ctx.textAlign = "left";

      y += 48;
    }
    ctx.restore();
  }

  _drawBossBar(ctx, game) {
    const boss = game?.dungeon?.boss?.enemy;
    if (!game?.dungeon?.active || !boss?.alive) return;

    const hpP = clamp((boss.hp || 0) / Math.max(1, boss.maxHp || 1), 0, 1);
    const phase = game?.dungeon?.boss?.phase || 1;

    const w = Math.min(520, Math.max(340, Math.floor(this.w * 0.44)));
    const h = 52;
    const x = ((this.w - w) * 0.5) | 0;
    const y = 48;

    ctx.save();
    this._panel(ctx, x, y, w, h, 14, "rgba(28,8,8,0.86)");

    ctx.fillStyle = "rgba(255,214,190,0.96)";
    ctx.font = "bold 15px Arial";
    ctx.fillText("Dungeon Boss", x + 14, y + 18);

    this._chip(ctx, x + w - 84, y + 10, 68, 18, `PHASE ${phase}`, phase >= 2 ? "rgba(220,112,80,0.96)" : "rgba(168,92,86,0.94)");

    const barX = x + 14;
    const barY = y + 28;
    const barW = w - 28;
    const barH = 14;

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRectFill(ctx, barX, barY, barW, barH, 8);

    ctx.fillStyle = phase >= 2 ? "rgba(236,96,86,0.98)" : "rgba(208,82,102,0.98)";
    roundRectFill(ctx, barX, barY, Math.max(0, barW * hpP), barH, 8);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(248,248,252,0.96)";
    ctx.font = "bold 11px Arial";
    ctx.fillText(`${Math.round(boss.hp || 0)} / ${Math.round(boss.maxHp || 0)}`, x + w - 16, y + 18);
    ctx.textAlign = "left";

    ctx.restore();
  }

  _drawSpellBar(ctx, game) {
    const defs = game?.skillDefs || {};
    const cds = game?.cooldowns || {};
    const loadout = Array.isArray(game?.skillLoadout) && game.skillLoadout.length
      ? game.skillLoadout
      : ["q", "w", "e", "r"];

    const slotSize = 58;
    const gap = 10;
    const totalW = loadout.length * slotSize + (loadout.length - 1) * gap;
    const x0 = ((this.w - totalW) * 0.5) | 0;
    const y = this.h - 84;

    ctx.save();

    for (let i = 0; i < loadout.length; i++) {
      const key = loadout[i];
      const def = defs[key] || {
        key,
        name: String(key || "?").toUpperCase(),
        mana: 0,
        color: "rgba(162,188,232,1)",
        cd: 0,
      };
      const cd = Math.max(0, cds[key] || 0);
      const x = x0 + i * (slotSize + gap);

      this._panel(ctx, x, y, slotSize, slotSize, 12, "rgba(14,18,26,0.90)");
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, slotSize, slotSize, 12);
      ctx.stroke();

      ctx.fillStyle = def.color || "rgba(162,188,232,1)";
      ctx.beginPath();
      ctx.arc(x + slotSize * 0.5, y + 21, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(def.key || key || "?").toUpperCase(), x + slotSize * 0.5, y + 45);

      if (cd > 0.001) {
        const p = clamp(cd / Math.max(0.001, def.cd || cd), 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.48)";
        roundRectFill(ctx, x, y, slotSize, slotSize * p, 12);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = "bold 15px Arial";
        ctx.fillText(cd.toFixed(cd >= 1 ? 1 : 2), x + slotSize * 0.5, y + 30);
      } else {
        ctx.fillStyle = "rgba(160,235,160,0.82)";
        ctx.font = "bold 10px Arial";
        ctx.fillText("READY", x + slotSize * 0.5, y + 58);
      }

      if (cd > 0.001) {
        ctx.font = "10px Arial";
        ctx.fillStyle = "rgba(208,218,236,0.82)";
        ctx.fillText(`${def.mana || 0} MP`, x + slotSize * 0.5, y + 58);
      }
    }

    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    const hero = game?.hero;
    const world = game?.world;
    if (!mini || !hero || !world) return;

    const size = Math.max(136, Math.min(190, Math.floor(this.h * 0.24)));
    const x = this.w - size - 16;
    const y = 16;

    ctx.save();
    this._panel(ctx, x - 6, y - 6, size + 12, size + 28, 14, "rgba(8,12,18,0.72)");

    const padFactor = 0.16;
    const sw = mini.width * 0.32;
    const sh = mini.height * 0.32;

    const span = Math.max(4000, world?.boundsRadius || 5200);
    const half = span * 0.5;
    const heroNormX = ((hero.x || 0) + half) / span;
    const heroNormY = ((hero.y || 0) + half) / span;

    const heroSrcX = heroNormX * mini.width;
    const heroSrcY = heroNormY * mini.height;

    const sx = heroSrcX - sw * 0.5;
    const sy = heroSrcY - sh * 0.5;

    ctx.save();
    roundRect(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.fillStyle = "#06080c";
    ctx.fillRect(x, y, size, size);

    const dx = x + ((-sx) / sw) * size;
    const dy = y + ((-sy) / sh) * size;
    const dw = (mini.width / sw) * size;
    const dh = (mini.height / sh) * size;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, size, size, 12);
    ctx.stroke();

    const cx = x + size * 0.5;
    const cy = y + size * 0.5;

    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();

    const aim = hero?.lastMove || { x: 1, y: 0 };
    const nx = clamp(aim.x || 0, -1, 1);
    const ny = clamp(aim.y || 0, -1, 1);
    const len = Math.hypot(nx, ny) || 1;

    ctx.strokeStyle = "rgba(255,245,180,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (nx / len) * 10, cy + (ny / len) * 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(238,244,255,0.96)";
    ctx.font = "bold 11px Arial";
    ctx.fillText("MINIMAP", x + 6, y + size + 17);

    ctx.restore();
  }

  _drawHelp(ctx, game) {
    const open = game?.menu?.open || null;
    const text = open
      ? "ESC close • F interact • H shop near camps • 1-9 menu actions"
      : "Arrows move • Q/W/E/R cast • F interact • H shop • J quests • B sail/dock • I inv • M map";

    ctx.save();
    ctx.font = "12px Arial";

    const padX = 12;
    const w = Math.ceil(ctx.measureText(text).width + padX * 2);
    const h = 24;
    const x = ((this.w - w) * 0.5) | 0;
    const y = 12;

    this._panel(ctx, x, y, w, h, 12, "rgba(10,14,20,0.58)");
    ctx.fillStyle = "rgba(226,234,247,0.88)";
    ctx.fillText(text, x + padX, y + 16);

    ctx.restore();
  }

  _drawPrompt(ctx, game) {
    const hero = game?.hero;
    const hx = hero?.x || 0;
    const hy = hero?.y || 0;
    let text = "";

    for (const c of game?.world?.camps || []) {
      if (distSq(hx, hy, c.x, c.y) < 100 * 100) {
        const campQuests = (game?.quests || []).filter(q => q.campId === c.id && !q.turnedIn);
        const ready = campQuests.find(q => q.done);
        const elite = campQuests.find(q => q.eliteOnly && !q.done);

        if (ready) text = "Press F to turn in quest • H to open shop";
        else if (elite) text = "Elite bounty posted • Press F at camp • H for shop";
        else if (campQuests.length) text = "Press F to rest at camp • H to open shop";
        else text = "Press F to check camp board • H to open shop";
        break;
      }
    }

    if (!text) {
      for (const w of game?.world?.waystones || []) {
        if (distSq(hx, hy, w.x, w.y) < 90 * 90) {
          text = "Press F to awaken waystone and restore";
          break;
        }
      }
    }

    if (!text) {
      for (const d of game?.world?.docks || []) {
        if (distSq(hx, hy, d.x, d.y) < 100 * 100) {
          text = hero?.state?.sailing
            ? "Press B to dock"
            : "Press F to discover dock • Press B to sail";
          break;
        }
      }
    }

    if (!text) {
      for (const dg of game?.world?.dungeons || []) {
        if (distSq(hx, hy, dg.x, dg.y) < 90 * 90) {
          text = "Press F to enter dungeon";
          break;
        }
      }
    }

    if (!text) return;

    const w = Math.min(520, Math.max(250, Math.floor(this.w * 0.56)));
    const h = 34;
    const x = ((this.w - w) * 0.5) | 0;
    const y = this.h - 128;

    ctx.save();
    this._panel(ctx, x, y, w, h, 14, "rgba(12,16,24,0.80)");
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(242,246,255,0.95)";
    ctx.fillText(text, x + w * 0.5, y + 22);
    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawToast(ctx, game) {
    const msg = this._msg || game?.msg || "";
    const msgT = this._msg ? this._msgT : (game?.msgT || 0);
    if (!msg || msgT <= 0) return;

    ctx.save();
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";

    const padX = 14;
    const tw = ctx.measureText(msg).width;
    const w = Math.ceil(tw + padX * 2);
    const h = 34;
    const x = ((this.w - w) * 0.5) | 0;
    const y = this.h - 34 - h;

    this._panel(ctx, x, y, w, h, 12, "rgba(8,12,18,0.86)");
    ctx.fillStyle = "rgba(245,248,255,0.96)";
    ctx.fillText(msg, x + w * 0.5, y + 22);

    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawInventory(ctx, game) {
    const hero = game?.hero;
    const inv = Array.isArray(hero?.inventory) ? hero.inventory : [];
    const equip = hero?.equip || {};

    const x = Math.max(20, ((this.w - 860) * 0.5) | 0);
    const y = Math.max(20, ((this.h - 520) * 0.5) | 0);
    const w = Math.min(860, this.w - 40);
    const h = Math.min(520, this.h - 40);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "Inventory");

    const leftW = 264;
    const rightX = x + leftW + 16;
    const rightW = w - leftW - 30;

    this._subPanel(ctx, x + 14, y + 44, leftW, h - 60, "Equipped");

    const slots = ["weapon", "armor", "chest", "helm", "boots", "ring", "trinket"];
    let sy = y + 74;
    for (const slot of slots) {
      this._slotRow(ctx, x + 24, sy, leftW - 20, slot, equip[slot] || null);
      sy += 48;
    }

    this._subPanel(ctx, rightX, y + 44, rightW, h - 60, `Backpack (${inv.length})`);

    const cols = 2;
    const gap = 10;
    const cellW = Math.floor((rightW - 26 - gap) / cols);
    const cellH = 86;
    const startX = rightX + 12;
    const startY = y + 74;

    for (let i = 0; i < inv.length && i < 10; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cellW + gap);
      const cy = startY + row * (cellH + 8);
      this._itemCard(ctx, cx, cy, cellW, cellH, inv[i], hero, `${i + 1}`);
    }

    if (inv.length === 0) {
      ctx.fillStyle = "rgba(214,222,238,0.78)";
      ctx.font = "14px Arial";
      ctx.fillText("Backpack is empty.", rightX + 14, y + 76);
    }

    ctx.fillStyle = "rgba(198,208,226,0.76)";
    ctx.font = "12px Arial";
    ctx.fillText("Press 1-9 to equip backpack items while this panel is open.", rightX + 12, y + h - 20);

    ctx.restore();
  }

  _drawSkills(ctx, game) {
    const hero = game?.hero;
    const defs = game?.skillDefs || {};
    const cds = game?.cooldowns || {};
    const loadout = Array.isArray(game?.skillLoadout) && game.skillLoadout.length
      ? game.skillLoadout
      : ["q", "w", "e", "r"];

    const x = Math.max(40, ((this.w - 720) * 0.5) | 0);
    const y = Math.max(24, ((this.h - 420) * 0.5) | 0);
    const w = Math.min(720, this.w - 80);
    const h = Math.min(420, this.h - 48);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "Skills");

    const st = hero?.getStats?.() || {};
    ctx.fillStyle = "rgba(222,230,244,0.86)";
    ctx.font = "14px Arial";
    ctx.fillText(
      `Damage ${Math.round(st.dmg || 0)} • Armor ${Math.round(st.armor || 0)} • Crit ${Math.round((st.crit || 0) * 100)}%`,
      x + 18,
      y + 64
    );

    let sy = y + 92;
    for (let i = 0; i < loadout.length; i++) {
      const key = loadout[i];
      const def = defs[key] || { key, name: key, mana: 0, cd: 0, color: "rgba(162,188,232,1)" };
      const cd = Math.max(0, cds[key] || 0);
      this._skillRow(ctx, x + 18, sy, w - 36, i, def, cd, false);
      sy += 68;
    }

    ctx.restore();
  }

  _drawGod(ctx, game) {
    const hero = game?.hero;
    const stats = hero?.getStats?.() || {};
    const campRenown = game?.progress?.campRenown || {};
    const renownTotal = Object.values(campRenown).reduce((a, b) => a + (b || 0), 0);
    const st = hero?.state || {};

    const x = Math.max(54, ((this.w - 640) * 0.5) | 0);
    const y = Math.max(26, ((this.h - 440) * 0.5) | 0);
    const w = Math.min(640, this.w - 108);
    const h = Math.min(440, this.h - 52);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "God Menu");

    const lines = [
      `Hero Level: ${hero?.level || 1}`,
      `Gold: ${hero?.gold || 0}`,
      `HP Regen: ${fmtNum(hero?.hpRegen || 0)}`,
      `Mana Regen: ${fmtNum(hero?.manaRegen || 0)}`,
      `Damage: ${Math.round(stats.dmg || 0)}`,
      `Armor: ${Math.round(stats.armor || 0)}`,
      `Crit: ${Math.round((stats.crit || 0) * 100)}%`,
      `Dungeon Best: ${game?.progress?.dungeonBest || 0}`,
      `Elite Kills: ${game?.progress?.eliteKills || 0}`,
      `Waystones: ${countSetLike(game?.progress?.discoveredWaystones)}`,
      `Docks: ${countSetLike(game?.progress?.discoveredDocks)}`,
      `Camp Renown Total: ${renownTotal}`,
      `Camp Blessing: ${(st.campBuffT || 0) > 0 ? `${Math.ceil(st.campBuffT)}s` : "inactive"}`,
      `Dungeon Momentum: ${(st.dungeonMomentumT || 0) > 0 ? `${Math.ceil(st.dungeonMomentumT)}s` : "inactive"}`,
      `Elite Chain: ${(st.eliteChainT || 0) > 0 ? `x${st.eliteChainCount} (${Math.ceil(st.eliteChainT)}s)` : "inactive"}`,
    ];

    let ty = y + 72;
    ctx.fillStyle = "rgba(230,236,248,0.90)";
    ctx.font = "15px Arial";
    for (const line of lines) {
      ctx.fillText(line, x + 22, ty);
      ty += 24;
    }

    ctx.fillStyle = "rgba(204,214,232,0.78)";
    ctx.font = "12px Arial";
    ctx.fillText("Camp renown improves camp quality over time.", x + 22, y + h - 20);

    ctx.restore();
  }

  _drawMap(ctx, game) {
    const mini = game?.world?.getMinimapCanvas?.();
    const world = game?.world;
    const hero = game?.hero;
    const discovered = [...(game?.progress?.discoveredWaystones || [])];
    const eliteKills = game?.progress?.eliteKills || 0;
    const bossAlive = !!game?.dungeon?.boss?.enemy?.alive;

    const x = Math.max(20, ((this.w - 860) * 0.5) | 0);
    const y = Math.max(20, ((this.h - 560) * 0.5) | 0);
    const w = Math.min(860, this.w - 40);
    const h = Math.min(560, this.h - 40);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "World Map");

    const mapX = x + 18;
    const mapY = y + 50;
    const mapW = Math.floor(w * 0.63);
    const mapH = h - 76;

    this._subPanel(ctx, mapX, mapY, mapW, mapH, "Explored Terrain");

    if (mini && world && hero) {
      const dx = mapX + 10;
      const dy = mapY + 24;
      const dw = mapW - 20;
      const dh = mapH - 34;

      const span = Math.max(4000, world?.boundsRadius || 5200);
      const half = span * 0.5;
      const heroNormX = ((hero.x || 0) + half) / span;
      const heroNormY = ((hero.y || 0) + half) / span;

      const zoomMode = world?.mapMode || "small";
      const zoomFactor = zoomMode === "large" ? 0.42 : 1.0;

      const sw = mini.width * zoomFactor;
      const sh = mini.height * zoomFactor;
      const sx = heroNormX * mini.width - sw * 0.5;
      const sy = heroNormY * mini.height - sh * 0.5;

      ctx.save();
      roundRect(ctx, dx, dy, dw, dh, 12);
      ctx.clip();
      ctx.fillStyle = "#06080c";
      ctx.fillRect(dx, dy, dw, dh);

      if (zoomMode === "small") {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mini, dx, dy, dw, dh);
        ctx.imageSmoothingEnabled = true;
      } else {
        const imgX = dx + ((-sx) / sw) * dw;
        const imgY = dy + ((-sy) / sh) * dh;
        const imgW = (mini.width / sw) * dw;
        const imgH = (mini.height / sh) * dh;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mini, imgX, imgY, imgW, imgH);
        ctx.imageSmoothingEnabled = true;
      }

      const markerX = zoomMode === "small" ? dx + heroNormX * dw : dx + dw * 0.5;
      const markerY = zoomMode === "small" ? dy + heroNormY * dh : dy + dh * 0.5;

      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(markerX - 9, markerY);
      ctx.lineTo(markerX + 9, markerY);
      ctx.moveTo(markerX, markerY - 9);
      ctx.lineTo(markerX, markerY + 9);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.beginPath();
      ctx.arc(markerX, markerY, 3.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      roundRect(ctx, dx, dy, dw, dh, 12);
      ctx.stroke();
    }

    const sideX = mapX + mapW + 16;
    const sideW = w - (sideX - x) - 18;
    this._subPanel(ctx, sideX, mapY, sideW, mapH, "Travel");

    let ty = mapY + 38;
    ctx.fillStyle = "rgba(234,240,252,0.94)";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`Map zoom: ${world?.mapMode || "small"}`, sideX + 12, ty);
    ty += 26;

    ctx.font = "13px Arial";
    ctx.fillStyle = "rgba(206,216,236,0.84)";
    ctx.fillText("Z = zoom map", sideX + 12, ty);
    ty += 20;
    ctx.fillText("1-9 = fast travel", sideX + 12, ty);
    ty += 20;
    ctx.fillText(`Unlocked stones: ${discovered.length}`, sideX + 12, ty);
    ty += 20;
    ctx.fillText(`Elite kills: ${eliteKills}`, sideX + 12, ty);
    ty += 20;
    ctx.fillText(`Dungeon state: ${bossAlive ? "boss active" : game?.dungeon?.active ? "in run" : "idle"}`, sideX + 12, ty);

    ty += 28;
    ctx.fillStyle = "rgba(232,238,252,0.94)";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Waystones", sideX + 12, ty);
    ty += 20;

    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(206,216,236,0.84)";
    for (let i = 0; i < discovered.length && i < 9; i++) {
      ctx.fillText(`${i + 1} • Waystone ${discovered[i]}`, sideX + 12, ty);
      ty += 18;
    }

    if (!discovered.length) {
      ctx.fillText("No waystones unlocked yet.", sideX + 12, ty);
    }

    ctx.restore();
  }

  _drawQuests(ctx, game) {
    const quests = Array.isArray(game?.quests) ? game.quests : [];

    const x = Math.max(46, ((this.w - 760) * 0.5) | 0);
    const y = Math.max(24, ((this.h - 500) * 0.5) | 0);
    const w = Math.min(760, this.w - 92);
    const h = Math.min(500, this.h - 48);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "Quests");

    let ty = y + 72;
    for (let i = 0; i < quests.length && i < 8; i++) {
      const q = quests[i];
      const cardH = 82;
      this._panel(ctx, x + 16, ty - 16, w - 32, cardH, 10, "rgba(14,20,30,0.72)");

      const titleColor = q?.turnedIn
        ? "rgba(170,170,170,0.80)"
        : q?.done
        ? "rgba(160,240,160,0.95)"
        : q?.eliteOnly
        ? "rgba(255,198,132,0.96)"
        : "rgba(236,240,248,0.94)";

      ctx.fillStyle = titleColor;
      ctx.font = "bold 14px Arial";
      ctx.fillText(q?.name || `Quest ${i + 1}`, x + 28, ty);

      const campLabel = `Camp ${q?.campId ?? "?"}`;
      this._smallBadge(ctx, x + w - 132, ty - 13, 92, 18, campLabel, "rgba(70,108,150,0.95)");

      if (q?.eliteOnly) {
        this._smallBadge(ctx, x + w - 234, ty - 13, 88, 18, "ELITE", "rgba(205,132,64,0.96)");
      }

      ctx.fillStyle = "rgba(204,214,232,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText((q?.desc || "").slice(0, 96), x + 28, ty + 16);

      ctx.fillStyle = "rgba(232,238,252,0.90)";
      ctx.fillText(
        `Progress: ${q?.have || 0}/${q?.need || 0} • Reward: ${q?.rewardGold || 0}G / ${q?.rewardXp || 0}XP`,
        x + 28,
        ty + 36
      );

      ctx.fillStyle = q?.turnedIn
        ? "rgba(170,170,170,0.78)"
        : q?.done
        ? "rgba(160,240,160,0.95)"
        : "rgba(198,208,226,0.78)";
      ctx.font = "12px Arial";
      ctx.fillText(
        q?.turnedIn ? "Status: turned in" : q?.done ? "Status: ready to turn in" : "Status: active",
        x + 28,
        ty + 55
      );

      ty += 90;
    }

    if (!quests.length) {
      ctx.fillStyle = "rgba(210,220,236,0.78)";
      ctx.font = "14px Arial";
      ctx.fillText("No active quests. Visit a camp and press F.", x + 20, y + 72);
    }

    ctx.restore();
  }

  _drawShop(ctx, game) {
    const shop = game?.shop || {};
    const hero = game?.hero;
    const stock = Array.isArray(shop.stock) ? shop.stock : [];
    const inv = Array.isArray(hero?.inventory) ? hero.inventory : [];
    const renown = shop?.campId != null ? (game?.progress?.campRenown?.[shop.campId] || 0) : 0;

    const x = Math.max(40, ((this.w - 780) * 0.5) | 0);
    const y = Math.max(24, ((this.h - 520) * 0.5) | 0);
    const w = Math.min(780, this.w - 80);
    const h = Math.min(520, this.h - 48);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, `Camp Shop${shop.campId ? ` • Camp ${shop.campId}` : ""}`);

    ctx.fillStyle = "rgba(232,238,252,0.94)";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`Gold: ${hero?.gold || 0}`, x + 20, y + 60);
    ctx.fillStyle = "rgba(198,208,226,0.80)";
    ctx.font = "12px Arial";
    ctx.fillText(`Camp renown: ${renown}`, x + 120, y + 60);

    const leftX = x + 18;
    const leftY = y + 84;
    const leftW = 332;
    const rightX = x + 368;
    const rightY = y + 84;
    const rightW = w - (rightX - x) - 18;

    this._subPanel(ctx, leftX, leftY, leftW, h - 102, "Buy");
    this._subPanel(ctx, rightX, rightY, rightW, h - 102, "Sell Backpack Items");

    const buyRows = [
      { hotkey: "1", name: "HP Potion", price: 14, desc: "+1 HP potion" },
      { hotkey: "2", name: "Mana Potion", price: 16, desc: "+1 Mana potion" },
      {
        hotkey: "3",
        name: stock[0]?.name || "Weapon",
        price: stock[0]?.price || 0,
        desc: stock[0] ? itemStatText(stock[0]) : "No stock",
        compare: stock[0] ? compareText(stock[0], hero?.equip || {}) : ""
      },
      {
        hotkey: "4",
        name: stock[1]?.name || "Armor",
        price: stock[1]?.price || 0,
        desc: stock[1] ? itemStatText(stock[1]) : "No stock",
        compare: stock[1] ? compareText(stock[1], hero?.equip || {}) : ""
      },
    ];

    let by = leftY + 36;
    for (const row of buyRows) {
      this._panel(ctx, leftX + 10, by, leftW - 20, 70, 10, "rgba(12,18,26,0.72)");
      this._hotkeyChip(ctx, leftX + 18, by + 10, row.hotkey);
      ctx.fillStyle = "rgba(242,246,255,0.95)";
      ctx.font = "bold 14px Arial";
      ctx.fillText(row.name, leftX + 52, by + 20);
      ctx.fillStyle = "rgba(204,214,232,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText(row.desc, leftX + 52, by + 39);
      if (row.compare) {
        ctx.fillStyle = compareColor(row.compare);
        ctx.fillText(row.compare, leftX + 52, by + 55);
      }
      ctx.fillStyle = "rgba(255,224,150,0.94)";
      ctx.font = "bold 13px Arial";
      ctx.fillText(`${row.price}G`, leftX + leftW - 82, by + 28);
      by += 80;
    }

    let sy = rightY + 36;
    const sellCount = Math.min(5, inv.length);
    for (let i = 0; i < sellCount; i++) {
      const item = inv[i];
      const sellPrice = Math.max(4, Math.round((item?.price || 10) * 0.45));

      this._panel(ctx, rightX + 10, sy, rightW - 20, 70, 10, "rgba(12,18,26,0.72)");
      this._hotkeyChip(ctx, rightX + 18, sy + 10, String(i + 5));
      ctx.fillStyle = rarityTextColor(item?.rarity);
      ctx.font = "bold 14px Arial";
      ctx.fillText(item?.name || "Item", rightX + 52, sy + 20);
      ctx.fillStyle = "rgba(204,214,232,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText(itemStatText(item), rightX + 52, sy + 39);

      const cmp = compareText(item, hero?.equip || {});
      if (cmp) {
        ctx.fillStyle = compareColor(cmp);
        ctx.fillText(cmp, rightX + 52, sy + 55);
      }

      ctx.fillStyle = "rgba(160,235,160,0.95)";
      ctx.font = "bold 13px Arial";
      ctx.fillText(`${sellPrice}G`, rightX + rightW - 82, sy + 28);
      sy += 80;
    }

    if (sellCount === 0) {
      ctx.fillStyle = "rgba(206,216,236,0.78)";
      ctx.font = "14px Arial";
      ctx.fillText("No backpack items to sell.", rightX + 16, rightY + 46);
    }

    ctx.fillStyle = "rgba(198,208,226,0.78)";
    ctx.font = "12px Arial";
    ctx.fillText("Press H or ESC to close shop.", x + 20, y + h - 18);

    ctx.restore();
  }

  _drawOptions(ctx) {
    const x = Math.max(100, ((this.w - 480) * 0.5) | 0);
    const y = Math.max(60, ((this.h - 260) * 0.5) | 0);
    const w = Math.min(480, this.w - 200);
    const h = Math.min(260, this.h - 120);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "Options");

    ctx.fillStyle = "rgba(228,234,246,0.90)";
    ctx.font = "14px Arial";
    ctx.fillText("This panel is kept for compatibility with older menu flows.", x + 20, y + 76);
    ctx.fillText("Use ESC to close menus.", x + 20, y + 104);
    ctx.fillText("Resize, focus, and loop behavior are handled in main.js.", x + 20, y + 132);

    ctx.restore();
  }

  _slotRow(ctx, x, y, w, slot, item) {
    this._panel(ctx, x, y, w, 36, 10, "rgba(12,18,26,0.72)");
    ctx.fillStyle = "rgba(183,196,222,0.76)";
    ctx.font = "bold 11px Arial";
    ctx.fillText(slot.toUpperCase(), x + 10, y + 14);

    ctx.font = "13px Arial";
    if (!item) {
      ctx.fillStyle = "rgba(200,208,224,0.55)";
      ctx.fillText("Empty", x + 10, y + 29);
      return;
    }

    ctx.fillStyle = rarityTextColor(item?.rarity);
    ctx.fillText(item?.name || "Gear", x + 10, y + 29);

    ctx.fillStyle = "rgba(214,222,238,0.72)";
    ctx.fillText(itemStatText(item), x + w - 126, y + 29);
  }

  _itemCard(ctx, x, y, w, h, item, hero, hotkey = "") {
    this._panel(ctx, x, y, w, h, 12, "rgba(12,18,26,0.72)");

    if (hotkey) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      roundRectFill(ctx, x + w - 24, y + 8, 16, 16, 6);
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(245,248,255,0.94)";
      ctx.fillText(hotkey, x + w - 16, y + 19);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = rarityTextColor(item?.rarity);
    ctx.font = "bold 13px Arial";
    ctx.fillText(item?.name || "Gear", x + 10, y + 18);

    ctx.fillStyle = "rgba(182,194,220,0.72)";
    ctx.font = "11px Arial";
    ctx.fillText((item?.slot || "gear").toUpperCase(), x + 10, y + 34);

    ctx.fillStyle = "rgba(222,230,244,0.82)";
    ctx.font = "12px Arial";
    ctx.fillText(itemStatText(item), x + 10, y + 50);

    const cmp = compareText(item, hero?.equip || {});
    if (cmp) {
      ctx.fillStyle = compareColor(cmp);
      ctx.font = "11px Arial";
      ctx.fillText(cmp, x + 10, y + 65);
    }

    ctx.fillStyle = "rgba(196,206,226,0.72)";
    ctx.font = "11px Arial";
    ctx.fillText(`Lv ${item?.level || 1}`, x + 10, y + 80);
  }

  _skillRow(ctx, x, y, w, index, def, cd, selected) {
    this._panel(ctx, x, y, w, 56, 12, "rgba(12,18,26,0.72)");

    if (selected) {
      ctx.strokeStyle = "rgba(240,214,116,0.95)";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, 56, 12);
      ctx.stroke();
    }

    ctx.fillStyle = def.color || "rgba(162,188,232,1)";
    ctx.beginPath();
    ctx.arc(x + 24, y + 28, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(240,244,252,0.95)";
    ctx.font = "bold 15px Arial";
    ctx.fillText(`${String(def.key || "?").toUpperCase()} • ${def.name || "Skill"}`, x + 46, y + 22);

    ctx.fillStyle = "rgba(204,214,232,0.82)";
    ctx.font = "13px Arial";
    ctx.fillText(`Mana ${def.mana || 0} • Base CD ${fmtNum(def.cd || 0)}s`, x + 46, y + 40);

    ctx.fillStyle = cd > 0.001 ? "rgba(255,210,128,0.95)" : "rgba(160,235,160,0.95)";
    ctx.font = "bold 13px Arial";
    ctx.fillText(cd > 0.001 ? `Cooldown ${fmtNum(cd)}s` : "Ready", x + w - 130, y + 31);

    ctx.fillStyle = "rgba(182,194,220,0.72)";
    ctx.font = "11px Arial";
    ctx.fillText(`Slot ${index + 1}`, x + w - 130, y + 15);
  }

  _hotkeyChip(ctx, x, y, text) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRectFill(ctx, x, y, 22, 18, 6);
    ctx.fillStyle = "rgba(245,248,255,0.95)";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + 11, y + 12);
    ctx.textAlign = "left";
  }

  _smallBadge(ctx, x, y, w, h, text, color) {
    ctx.fillStyle = color;
    roundRectFill(ctx, x, y, w, h, 8);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + w * 0.5, y + 12);
    ctx.textAlign = "left";
  }

  _panel(ctx, x, y, w, h, r = 12, fill = "rgba(10,14,20,0.75)") {
    ctx.fillStyle = fill;
    roundRectFill(ctx, x, y, w, h, r);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  _bigPanel(ctx, x, y, w, h, title) {
    this._panel(ctx, x, y, w, h, 18, "rgba(8,12,18,0.88)");
    ctx.fillStyle = "rgba(242,246,255,0.96)";
    ctx.font = "bold 20px Arial";
    ctx.fillText(title, x + 18, y + 26);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 36);
    ctx.lineTo(x + w - 14, y + 36);
    ctx.stroke();
  }

  _subPanel(ctx, x, y, w, h, title) {
    this._panel(ctx, x, y, w, h, 14, "rgba(16,22,32,0.82)");
    ctx.fillStyle = "rgba(224,232,246,0.88)";
    ctx.font = "bold 13px Arial";
    ctx.fillText(title, x + 10, y + 16);
  }

  _bar(ctx, x, y, w, h, p, leftText, rightText, fillColor) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRectFill(ctx, x, y, w, h, 8);

    ctx.fillStyle = fillColor;
    roundRectFill(ctx, x, y, Math.max(0, w * p), h, 8);

    ctx.font = "bold 11px Arial";
    ctx.fillStyle = "rgba(245,248,255,0.96)";
    ctx.fillText(leftText, x + 6, y + h - 3);

    ctx.textAlign = "right";
    ctx.fillText(rightText, x + w - 6, y + h - 3);
    ctx.textAlign = "left";
  }

  _chip(ctx, x, y, w, h, text, color) {
    ctx.fillStyle = color;
    roundRectFill(ctx, x, y, w, h, 10);
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fillText(text, x + w * 0.5, y + 13);
    ctx.textAlign = "left";
  }
}

function itemStatText(item) {
  if (!item || !item.stats) return "";
  const s = item.stats;
  const parts = [];
  if (s.dmg) parts.push(`DMG ${Math.round(s.dmg)}`);
  if (s.armor) parts.push(`ARM ${Math.round(s.armor)}`);
  if (s.crit) parts.push(`CRIT ${Math.round(s.crit * 100)}%`);
  if (s.critMult) parts.push(`CM ${Math.round(s.critMult * 100)}%`);
  return parts.join(" • ") || "No stats";
}

function compareText(item, equip) {
  if (!item || !item.slot || !item.stats) return "";
  const current = equip?.[item.slot];
  if (!current?.stats) return "Empty slot";

  const cur = current.stats;
  const next = item.stats;

  const dmgDiff = Math.round((next.dmg || 0) - (cur.dmg || 0));
  const armDiff = Math.round((next.armor || 0) - (cur.armor || 0));
  const critDiff = Math.round(((next.crit || 0) - (cur.crit || 0)) * 100);
  const cmDiff = Math.round(((next.critMult || 0) - (cur.critMult || 0)) * 100);

  const parts = [];
  if (dmgDiff) parts.push(`DMG ${dmgDiff > 0 ? "+" : ""}${dmgDiff}`);
  if (armDiff) parts.push(`ARM ${armDiff > 0 ? "+" : ""}${armDiff}`);
  if (critDiff) parts.push(`CRIT ${critDiff > 0 ? "+" : ""}${critDiff}%`);
  if (cmDiff) parts.push(`CM ${cmDiff > 0 ? "+" : ""}${cmDiff}%`);

  return parts.join(" • ") || "Similar";
}

function compareColor(text) {
  if (!text) return "rgba(204,214,232,0.82)";
  if (text === "Empty slot") return "rgba(160,235,160,0.95)";
  if (text.includes("+")) return "rgba(160,235,160,0.95)";
  if (text.includes("-")) return "rgba(255,170,170,0.95)";
  return "rgba(204,214,232,0.82)";
}

function rarityTextColor(rarity) {
  if (rarity === "epic") return "rgba(224,182,255,0.96)";
  if (rarity === "rare") return "rgba(162,214,255,0.96)";
  if (rarity === "uncommon") return "rgba(182,240,182,0.96)";
  return "rgba(232,236,244,0.92)";
}

function fmtNum(v) {
  const n = Number(v) || 0;
  return n >= 10 ? String(Math.round(n * 10) / 10) : n.toFixed(1).replace(/\.0$/, "");
}

function countSetLike(v) {
  if (v instanceof Set) return v.size;
  if (Array.isArray(v)) return v.length;
  return 0;
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
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

function roundRectFill(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}