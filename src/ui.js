// src/ui.js
// v59 RPG SHOP UI PASS (FULL FILE)
// Focus:
// - add camp shop menu
// - keep quest / map / inventory panels
// - stronger RPG camp feedback
// - compatible with current game.js

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
    else if (open === "options") this._drawOptions(ctx, game);
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
    };

    const hpP = clamp((hero?.hp || 0) / Math.max(1, st.maxHp || 1), 0, 1);
    const mpP = clamp((hero?.mana || 0) / Math.max(1, st.maxMana || 1), 0, 1);
    const xpP = clamp((hero?.xp || 0) / Math.max(1, hero?.nextXp || 1), 0, 1);

    const x = 14;
    const y = 12;
    const panelW = 388;
    const panelH = 146;

    ctx.save();

    this._panel(ctx, x, y, panelW, panelH, 16, "rgba(10,12,18,0.78)");

    ctx.fillStyle = "rgba(246,248,252,0.96)";
    ctx.font = "bold 13px Arial";
    ctx.fillText("BROKE KNIGHT", x + 14, y + 18);

    const bx = x + 14;
    let by = y + 34;

    this._bar(ctx, bx, by, 264, 15, hpP, "HP", `${Math.round(hero?.hp || 0)}/${Math.round(st.maxHp || 0)}`, "rgba(220,76,104,0.98)");
    by += 25;
    this._bar(ctx, bx, by, 264, 15, mpP, "MP", `${Math.round(hero?.mana || 0)}/${Math.round(st.maxMana || 0)}`, "rgba(82,150,255,0.98)");
    by += 25;
    this._bar(ctx, bx, by, 264, 12, xpP, "XP", `${Math.round(hero?.xp || 0)}/${Math.round(hero?.nextXp || 0)}`, "rgba(228,196,92,0.98)");

    const rx = x + 295;
    ctx.fillStyle = "rgba(222,230,244,0.90)";
    ctx.font = "13px Arial";
    ctx.fillText(`Lv ${hero?.level || 1}`, rx, y + 39);
    ctx.fillText(`${hero?.gold || 0} Gold`, rx, y + 59);
    ctx.fillText(`DMG ${Math.round(st.dmg || 0)}`, rx, y + 79);
    ctx.fillText(`ARM ${Math.round(st.armor || 0)}`, rx, y + 99);
    ctx.fillText(`CRT ${Math.round((st.crit || 0) * 100)}%`, rx, y + 119);

    ctx.fillStyle = "rgba(198,208,226,0.82)";
    ctx.font = "12px Arial";
    ctx.fillText(`1 HP x${hero?.potions?.hp || 0}   2 MP x${hero?.potions?.mana || 0}`, x + 14, y + 131);

    if (hero?.state?.sailing) {
      this._chip(ctx, x + panelW - 92, y + 10, 76, 18, "SAILING", "rgba(76,152,226,0.95)");
    } else if (game?.dungeon?.active) {
      this._chip(ctx, x + panelW - 100, y + 10, 84, 18, `FLOOR ${game?.dungeon?.floor || 1}`, "rgba(144,96,220,0.95)");
    } else if (game?.menu?.open === "shop") {
      this._chip(ctx, x + panelW - 88, y + 10, 72, 18, "SHOP", "rgba(218,166,88,0.94)");
    } else {
      const activeQuest = (game?.quests || []).find(q => !q.turnedIn && !q.done);
      if (activeQuest) {
        this._chip(ctx, x + panelW - 96, y + 10, 80, 18, "QUEST", "rgba(88,166,98,0.94)");
      } else {
        this._chip(ctx, x + panelW - 108, y + 10, 92, 18, "OVERWORLD", "rgba(88,166,98,0.94)");
      }
    }

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
      const active = (game?.selectedSkillSlot || 0) === i;
      const x = x0 + i * (slotSize + gap);

      this._panel(ctx, x, y, slotSize, slotSize, 12, active ? "rgba(24,30,42,0.97)" : "rgba(14,18,26,0.90)");
      ctx.strokeStyle = active ? "rgba(240,214,116,0.95)" : "rgba(255,255,255,0.09)";
      ctx.lineWidth = active ? 2 : 1;
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
      }

      ctx.font = "10px Arial";
      ctx.fillStyle = "rgba(208,218,236,0.82)";
      ctx.fillText(`${def.mana || 0} MP`, x + slotSize * 0.5, y + 58);
    }

    ctx.textAlign = "left";
    ctx.restore();
  }

  _drawMinimap(ctx, game) {
    const mini = this._mini || game?.world?.getMinimapCanvas?.();
    if (!mini) return;

    const size = Math.max(136, Math.min(190, Math.floor(this.h * 0.24)));
    const x = this.w - size - 16;
    const y = 16;
    const world = game?.world;

    ctx.save();
    this._panel(ctx, x - 6, y - 6, size + 12, size + 28, 14, "rgba(8,12,18,0.72)");

    ctx.save();
    roundRect(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mini, x, y, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, size, size, 12);
    ctx.stroke();

    const span = world?.mapMode === "large"
      ? Math.max(8000, world?.boundsRadius ? world.boundsRadius * 2 : 10400)
      : Math.max(4000, world?.boundsRadius || 5200);

    const half = span * 0.5;
    const px = x + clamp(((game?.hero?.x || 0) + half) / span, 0, 1) * size;
    const py = y + clamp(((game?.hero?.y || 0) + half) / span, 0, 1) * size;

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(238,244,255,0.96)";
    ctx.font = "bold 11px Arial";
    ctx.fillText(`MINIMAP • ${world?.mapMode || "small"}`, x + 6, y + size + 17);

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
        const quest = (game?.quests || []).find(q => q.campId === c.id && !q.turnedIn);
        if (quest?.done) text = "Press F to turn in quest • H to open shop";
        else if (quest) text = "Press F to rest at camp • H to open shop";
        else text = "Press F to take quest • H to open shop";
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

    const w = Math.min(500, Math.max(250, Math.floor(this.w * 0.52)));
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

    const x = Math.max(20, ((this.w - 820) * 0.5) | 0);
    const y = Math.max(20, ((this.h - 500) * 0.5) | 0);
    const w = Math.min(820, this.w - 40);
    const h = Math.min(500, this.h - 40);

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
    const cellH = 72;
    const startX = rightX + 12;
    const startY = y + 74;

    for (let i = 0; i < inv.length && i < 10; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cellW + gap);
      const cy = startY + row * (cellH + 8);
      this._itemCard(ctx, cx, cy, cellW, cellH, inv[i], `${i + 1}`);
    }

    if (inv.length === 0) {
      ctx.fillStyle = "rgba(214,222,238,0.78)";
      ctx.font = "14px Arial";
      ctx.fillText("Backpack is empty.", rightX + 14, y + 76);
    }

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
      this._skillRow(ctx, x + 18, sy, w - 36, i, def, cd, (game?.selectedSkillSlot || 0) === i);
      sy += 68;
    }

    ctx.restore();
  }

  _drawGod(ctx, game) {
    const hero = game?.hero;
    const stats = hero?.getStats?.() || {};

    const x = Math.max(60, ((this.w - 560) * 0.5) | 0);
    const y = Math.max(32, ((this.h - 360) * 0.5) | 0);
    const w = Math.min(560, this.w - 120);
    const h = Math.min(360, this.h - 64);

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
      `Waystones: ${countSetLike(game?.progress?.discoveredWaystones)}`,
      `Docks: ${countSetLike(game?.progress?.discoveredDocks)}`,
    ];

    let ty = y + 72;
    ctx.fillStyle = "rgba(230,236,248,0.90)";
    ctx.font = "15px Arial";
    for (const line of lines) {
      ctx.fillText(line, x + 22, ty);
      ty += 28;
    }

    ctx.restore();
  }

  _drawMap(ctx, game) {
    const mini = game?.world?.getMinimapCanvas?.();
    const discovered = [...(game?.progress?.discoveredWaystones || [])];

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

    if (mini) {
      const dx = mapX + 10;
      const dy = mapY + 24;
      const dw = mapW - 20;
      const dh = mapH - 34;

      ctx.save();
      roundRect(ctx, dx, dy, dw, dh, 12);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mini, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = true;
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
    ctx.fillText(`Map scale: ${game?.world?.mapMode || "small"}`, sideX + 12, ty);
    ty += 26;

    ctx.font = "13px Arial";
    ctx.fillStyle = "rgba(206,216,236,0.84)";
    ctx.fillText("Z = change map scale", sideX + 12, ty);
    ty += 20;
    ctx.fillText("1-9 = fast travel", sideX + 12, ty);
    ty += 20;
    ctx.fillText(`Unlocked stones: ${discovered.length}`, sideX + 12, ty);

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

    const x = Math.max(60, ((this.w - 700) * 0.5) | 0);
    const y = Math.max(26, ((this.h - 460) * 0.5) | 0);
    const w = Math.min(700, this.w - 120);
    const h = Math.min(460, this.h - 52);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, "Quests");

    let ty = y + 72;
    for (let i = 0; i < quests.length && i < 8; i++) {
      const q = quests[i];
      this._panel(ctx, x + 16, ty - 16, w - 32, 68, 10, "rgba(14,20,30,0.72)");

      ctx.fillStyle = q?.turnedIn
        ? "rgba(170,170,170,0.80)"
        : q?.done
        ? "rgba(160,240,160,0.95)"
        : "rgba(236,240,248,0.94)";
      ctx.font = "bold 14px Arial";
      ctx.fillText(q?.name || `Quest ${i + 1}`, x + 28, ty);

      ctx.fillStyle = "rgba(204,214,232,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText((q?.desc || "").slice(0, 90), x + 28, ty + 16);

      ctx.fillStyle = "rgba(232,238,252,0.90)";
      ctx.fillText(
        `Progress: ${q?.have || 0}/${q?.need || 0} • Reward: ${q?.rewardGold || 0}G / ${q?.rewardXp || 0}XP`,
        x + 28,
        ty + 34
      );

      ty += 76;
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

    const x = Math.max(40, ((this.w - 760) * 0.5) | 0);
    const y = Math.max(24, ((this.h - 500) * 0.5) | 0);
    const w = Math.min(760, this.w - 80);
    const h = Math.min(500, this.h - 48);

    ctx.save();
    this._bigPanel(ctx, x, y, w, h, `Camp Shop${shop.campId ? ` • Camp ${shop.campId}` : ""}`);

    ctx.fillStyle = "rgba(232,238,252,0.94)";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`Gold: ${hero?.gold || 0}`, x + 20, y + 60);

    const leftX = x + 18;
    const leftY = y + 84;
    const leftW = 320;
    const rightX = x + 354;
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
        desc: stock[0] ? itemStatText(stock[0]) : "No stock"
      },
      {
        hotkey: "4",
        name: stock[1]?.name || "Armor",
        price: stock[1]?.price || 0,
        desc: stock[1] ? itemStatText(stock[1]) : "No stock"
      },
    ];

    let by = leftY + 36;
    for (const row of buyRows) {
      this._panel(ctx, leftX + 10, by, leftW - 20, 62, 10, "rgba(12,18,26,0.72)");
      this._hotkeyChip(ctx, leftX + 18, by + 10, row.hotkey);
      ctx.fillStyle = "rgba(242,246,255,0.95)";
      ctx.font = "bold 14px Arial";
      ctx.fillText(row.name, leftX + 52, by + 20);
      ctx.fillStyle = "rgba(204,214,232,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText(row.desc, leftX + 52, by + 39);
      ctx.fillStyle = "rgba(255,224,150,0.94)";
      ctx.font = "bold 13px Arial";
      ctx.fillText(`${row.price}G`, leftX + leftW - 78, by + 28);
      by += 72;
    }

    let sy = rightY + 36;
    const sellCount = Math.min(5, inv.length);
    for (let i = 0; i < sellCount; i++) {
      const item = inv[i];
      const sellPrice = Math.max(4, Math.round((item?.price || 10) * 0.45));

      this._panel(ctx, rightX + 10, sy, rightW - 20, 62, 10, "rgba(12,18,26,0.72)");
      this._hotkeyChip(ctx, rightX + 18, sy + 10, String(i + 5));
      ctx.fillStyle = rarityTextColor(item?.rarity);
      ctx.font = "bold 14px Arial";
      ctx.fillText(item?.name || "Item", rightX + 52, sy + 20);
      ctx.fillStyle = "rgba(204,214,232,0.82)";
      ctx.font = "12px Arial";
      ctx.fillText(itemStatText(item), rightX + 52, sy + 39);
      ctx.fillStyle = "rgba(160,235,160,0.95)";
      ctx.font = "bold 13px Arial";
      ctx.fillText(`${sellPrice}G`, rightX + rightW - 78, sy + 28);
      sy += 72;
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
    ctx.fillText(this._itemStatText(item), x + w - 122, y + 29);
  }

  _itemCard(ctx, x, y, w, h, item, hotkey = "") {
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
    ctx.fillText(this._itemStatText(item), x + 10, y + 51);

    ctx.fillStyle = "rgba(196,206,226,0.72)";
    ctx.font = "11px Arial";
    ctx.fillText(`Lv ${item?.level || 1}`, x + 10, y + 66);
  }

  _skillRow(ctx, x, y, w, index, def, cd, selected) {
    this._panel(ctx, x, y, w, 56, 12, selected ? "rgba(20,28,40,0.90)" : "rgba(12,18,26,0.72)");

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

  _itemStatText(item) {
    if (!item || !item.stats) return "";
    return itemStatText(item);
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
  return parts.join(" • ") || "No stats";
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