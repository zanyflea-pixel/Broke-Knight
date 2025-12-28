// src/ui.js
import { rarityColor } from "./entities.js";
import { clamp } from "./util.js";

export default class UI {
  constructor() {
    this.open = { map: false, stats: false, skills: false, quests: false, options: false, waypoints: false };
    this.msg = "";
    this.msgT = 0;

    this.skillName = "";
    this.skillPulse = 0;
  }

  toggle(name) { this.open[name] = !this.open[name]; }
  closeAll() {
    for (const k of Object.keys(this.open)) this.open[k] = false;
  }

  setMsg(s) {
    this.msg = s;
    this.msgT = 2.2;
  }

  draw(ctx, game) {
    const W = game.canvas.width;
    const H = game.canvas.height;
    const hero = game.hero;
    const st = hero.getStats();

    // timers
    this.msgT = Math.max(0, this.msgT - (game._dtForUi || 0));
    this.skillPulse = Math.max(0, this.skillPulse - (game._dtForUi || 0));

    // HUD backdrop
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(5,8,18,0.70)";
    roundRect(ctx, 14, 14, 340, 124, 16);
    ctx.fill();
    ctx.globalAlpha = 1;

    // HP bar
    drawBar(ctx, 28, 30, 300, 14, hero.hp / st.maxHp, "#ff4a6e", "HP");
    // Mana bar
    drawBar(ctx, 28, 52, 300, 14, hero.mana / st.maxMana, "#4aa3ff", "Mana");

    // XP bar
    const xpP = clamp(hero.xp / hero.nextXp, 0, 1);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(28, 76, 300, 10);
    ctx.fillStyle = "rgba(255,210,138,0.95)";
    ctx.fillRect(28, 76, 300 * xpP, 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Lv ${hero.level}   Gold ${hero.gold}`, 28, 98);

    // potions / quick keys (v28)
    ctx.fillStyle = "#aab6d6";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Potions: HP ${hero.potions?.hp ?? 0} | Mana ${hero.potions?.mana ?? 0}   (Q use)`, 28, 112);
    ctx.fillStyle = "#aab6d6";
    ctx.fillText("A Fireball  S Nova  D Dash  F Chain   |   J Quests  O Options  T Waystones", 28, 126);

    // hint
    if (game.hint) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(5,8,18,0.70)";
      roundRect(ctx, 14, 142, 340, 38, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(game.hint, 28, 167);
    }

    // skill indicator
    if (this.skillName && this.skillPulse > 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(5,8,18,0.75)";
      const w = Math.min(560, 24 + ctx.measureText(`Casting: ${this.skillName}`).width);
      roundRect(ctx, (W - w) / 2, 14, w, 38, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffd28a";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Casting: ${this.skillName}`, W / 2, 42);
      ctx.textAlign = "left";
    }

    // message toast
    if (this.msgT > 0 && this.msg) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(5,8,18,0.75)";
      const w = Math.min(560, 24 + ctx.measureText(this.msg).width);
      roundRect(ctx, (W - w) / 2, H - 70, w, 44, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#d7e0ff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.msg, W / 2, H - 42);
      ctx.textAlign = "left";
    }

    // menus
    if (this.open.map) this.drawMap(ctx, game);
    if (this.open.stats) this.drawStats(ctx, game);
    if (this.open.skills) this.drawSkills(ctx, game);
    if (this.open.quests) this.drawQuests(ctx, game);
    if (this.open.options) this.drawOptions(ctx, game);
    if (this.open.waypoints) this.drawWaypoints(ctx, game);
  }

  drawMap(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const pad = 18;
    const boxW = Math.min(720, W - 2 * pad);
    const boxH = Math.min(460, H - 2 * pad);

    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(8,12,26,0.90)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Map (M to close)", x + 18, y + 28);

    // minimap
    const mapX = x + 18;
    const mapY = y + 42;
    const mapW = boxW - 36;
    const mapH = boxH - 64;

    // background
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, mapX, mapY, mapW, mapH, 12);
    ctx.fill();
    ctx.globalAlpha = 1;

    // draw world minimap into the box
    if (game.world.drawMinimap) {
      game.world.drawMinimap(ctx, mapX + 10, mapY + 10, mapW - 20, mapH - 20, game.hero.x, game.hero.y);
    } else {
      ctx.fillStyle = "#aab6d6";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText("Minimap not available.", mapX + 18, mapY + 34);
    }
  }

  drawStats(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const boxW = Math.min(720, W - 36);
    const boxH = Math.min(480, H - 36);
    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2;

    const hero = game.hero;
    const st = hero.getStats();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(8,12,26,0.92)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Stats / Equipment (I to close)", x + 18, y + 28);

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Max HP: ${st.maxHp}`, x + 24, y + 60);
    ctx.fillText(`Max Mana: ${st.maxMana}`, x + 24, y + 80);
    ctx.fillText(`Damage: ${st.dmg}`, x + 24, y + 100);
    ctx.fillText(`Armor: ${st.armor}`, x + 24, y + 120);

    // Equipment list
    const slots = ["weapon","helm","chest","boots","ring"];
    let yy = y + 165;

    ctx.fillStyle = "#aab6d6";
    ctx.fillText("Equipped:", x + 24, y + 145);

    for (const slot of slots) {
      const it = hero.equip[slot];
      const label = slot[0].toUpperCase() + slot.slice(1);
      ctx.fillStyle = "#d7e0ff";
      ctx.fillText(`${label}:`, x + 24, yy);
      if (it) {
        ctx.fillStyle = rarityColor(it.rarity);
        ctx.fillText(it.name, x + 120, yy);
      } else {
        ctx.fillStyle = "#6f7aa0";
        ctx.fillText("—", x + 120, yy);
      }
      yy += 22;
    }

    // Inventory
    ctx.fillStyle = "#aab6d6";
    ctx.fillText("Inventory (picked-up gear):", x + 24, yy + 18);

    yy += 44;

    const items = hero.inventory.slice(-12).reverse();
    for (const it of items) {
      ctx.fillStyle = rarityColor(it.rarity);
      ctx.fillText(`${it.slot}: ${it.name}`, x + 24, yy);
      yy += 18;
      if (yy > y + boxH - 24) break;
    }
  }

  drawSkills(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const boxW = Math.min(720, W - 36);
    const boxH = Math.min(480, H - 36);
    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2;

    const hero = game.hero;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(8,12,26,0.92)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Skills (K to close)", x + 18, y + 28);

    ctx.font = "13px system-ui, sans-serif";

    let yy = y + 58;

    for (const s of hero.skills) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, x + 18, yy, boxW - 36, 74, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#ffd28a";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(`[${s.key.toUpperCase()}] ${s.name}`, x + 34, yy + 26);

      ctx.fillStyle = "#d7e0ff";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(`Lv ${s.level}   Mana ${s.mana}   CD ${s.cd.toFixed(2)}s`, x + 34, yy + 46);

      // XP bar
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 34, yy + 56, 260, 10);
      ctx.fillStyle = "rgba(255,210,138,0.95)";
      ctx.fillRect(x + 34, yy + 56, 260 * clamp(s.xp / s.nextXp, 0, 1), 10);
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "#aab6d6";
      ctx.fillText(s.desc, x + 320, yy + 46);
      ctx.globalAlpha = 1;

      yy += 86;
      if (yy > y + boxH - 88) break;
    }
  }

  /* ============================
     V28 MENUS
     ============================ */
  drawQuests(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const boxW = Math.min(720, W - 36);
    const boxH = Math.min(480, H - 36);
    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(8,12,26,0.92)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Quests (J to close)", x + 18, y + 28);

    const q = game.quests;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#aab6d6";
    ctx.fillText(`Completed: ${q.completed}`, x + 18, y + 52);

    let yy = y + 78;
    for (const quest of q.active) {
      const done = quest.done;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = done ? "rgba(30,60,40,0.45)" : "rgba(0,0,0,0.35)";
      roundRect(ctx, x + 18, yy, boxW - 36, 78, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = done ? "#b6ffd2" : "#d7e0ff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(quest.name, x + 34, yy + 24);

      ctx.fillStyle = "#aab6d6";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(quest.desc, x + 34, yy + 44);

      // progress bar
      const p = clamp(quest.prog / quest.goal, 0, 1);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 34, yy + 56, boxW - 68, 10);
      ctx.fillStyle = done ? "rgba(182,255,210,0.95)" : "rgba(255,210,138,0.95)";
      ctx.fillRect(x + 34, yy + 56, (boxW - 68) * p, 10);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#d7e0ff";
      ctx.font = "12px system-ui, sans-serif";
      const reward = `Reward: ${quest.rewardGold || 0}g${quest.rewardXp ? " + " + quest.rewardXp + "xp" : ""}`;
      ctx.fillText(`${Math.min(quest.goal, quest.prog)}/${quest.goal}   ${reward}`, x + 34, yy + 74);

      yy += 92;
      if (yy > y + boxH - 96) break;
    }
  }

  drawOptions(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const boxW = Math.min(680, W - 36);
    const boxH = Math.min(420, H - 36);
    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(8,12,26,0.92)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Options (O to close)", x + 18, y + 28);

    ctx.fillStyle = "#aab6d6";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Press the number key to toggle:", x + 18, y + 54);

    const opts = [
      ["1", "Particles", game.settings.particles],
      ["2", "Screen shake", game.settings.screenshake],
      ["3", "Show FPS", game.settings.showFps],
      ["4", "Auto-equip gear when slot is empty", game.settings.autoPickupGear],
    ];

    let yy = y + 86;
    for (const [k, label, on] of opts) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, x + 18, yy, boxW - 36, 44, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#d7e0ff";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(`[${k}]`, x + 34, yy + 28);

      ctx.fillStyle = on ? "#b6ffd2" : "#ff9bb0";
      ctx.fillText(on ? "ON" : "OFF", x + 76, yy + 28);

      ctx.fillStyle = "#aab6d6";
      ctx.fillText(label, x + 132, yy + 28);

      yy += 54;
    }

    ctx.fillStyle = "#aab6d6";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Tip: If performance is rough, turn off particles and shake.", x + 18, y + boxH - 22);
  }

  drawWaypoints(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const boxW = Math.min(680, W - 36);
    const boxH = Math.min(440, H - 36);
    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(8,12,26,0.92)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Waystones (T to close)", x + 18, y + 28);

    ctx.fillStyle = "#aab6d6";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Press 1-9 to teleport to an activated waystone.", x + 18, y + 54);

    const activated = game.world.waystones
      .map((w, i) => ({ w, i }))
      .filter(o => o.w.activated);

    let yy = y + 86;
    for (let i = 0; i < Math.min(9, activated.length); i++) {
      const o = activated[i];
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, x + 18, yy, boxW - 36, 44, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#ffd28a";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(`[${i + 1}]`, x + 34, yy + 28);

      ctx.fillStyle = "#d7e0ff";
      ctx.fillText(o.w.name, x + 86, yy + 28);

      yy += 54;
    }

    if (!activated.length) {
      ctx.fillStyle = "#aab6d6";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText("No activated waystones yet. Find one and press E to attune it.", x + 18, y + 110);
    }
  }
}

function drawBar(ctx, x, y, w, h, p, col, label) {
  p = clamp(p, 0, 1);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * p, h);

  ctx.globalAlpha = 1;

  ctx.fillStyle = "#d7e0ff";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(label, x, y - 2);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
