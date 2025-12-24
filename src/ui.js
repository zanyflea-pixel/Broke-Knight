// src/ui.js
import { rarityColor } from "./entities.js";
import { clamp } from "./util.js";

export default class UI {
  constructor() {
    this.open = { map: false, stats: false, skills: false };
    this.msg = "";
    this.msgT = 0;

    this.skillName = "";
    this.skillPulse = 0;
  }

  toggle(name) { this.open[name] = !this.open[name]; }
  closeAll() { this.open.map = this.open.stats = this.open.skills = false; }

  setMsg(txt) {
    this.msg = txt;
    this.msgT = 2.2;
  }

  update(dt) {
    this.msgT = Math.max(0, this.msgT - dt);
    this.skillPulse = Math.max(0, this.skillPulse - dt);
  }

  draw(ctx, game) {
    const W = game.canvas.width;
    const H = game.canvas.height;
    const hero = game.hero;
    const st = hero.getStats();

    // HUD backdrop
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(5,8,18,0.70)";
    roundRect(ctx, 14, 14, 340, 88, 16);
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

    // hint
    if (game.hint) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(5,8,18,0.70)";
      roundRect(ctx, 14, 110, 340, 38, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(game.hint, 28, 135);
    }

    // skill indicator
    if (this.skillName && this.skillPulse > 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(5,8,18,0.75)";
      const w = 220;
      roundRect(ctx, (W - w) / 2, 14, w, 44, 14);
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

    // windows
    if (this.open.map) this.drawMap(ctx, game);
    if (this.open.stats) this.drawStats(ctx, game);
    if (this.open.skills) this.drawSkills(ctx, game);
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

    const mini = game.world.getMinimapCanvas();
    const mw = mini.width, mh = mini.height;

    const scale = Math.min((boxW - 40) / mw, (boxH - 70) / mh);
    const dw = mw * scale, dh = mh * scale;
    const mx = x + (boxW - dw) / 2;
    const my = y + 46;

    ctx.globalAlpha = 0.95;
    ctx.drawImage(mini, mx, my, dw, dh);
    ctx.globalAlpha = 1;

    // player marker
    const px = mx + (game.hero.x / game.world.width) * dw;
    const py = my + (game.hero.y / game.world.height) * dh;

    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawStats(ctx, game) {
    const W = game.canvas.width, H = game.canvas.height;
    const boxW = Math.min(760, W - 36);
    const boxH = Math.min(520, H - 36);
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
    ctx.fillText(`Max HP: ${Math.round(st.maxHp)}   Armor: ${Math.round(st.armor)}`, x + 18, y + 56);
    ctx.fillText(`Max Mana: ${Math.round(st.maxMana)}   Damage: ${Math.round(st.dmg)}`, x + 18, y + 76);

    // equipment slots
    const slotX = x + 18, slotY = y + 100;
    const slots = ["helm","chest","boots","weapon","ring"];

    ctx.fillStyle = "#aab6d6";
    ctx.fillText("Equipment:", slotX, slotY - 10);

    let row = 0;
    for (const s of slots) {
      const yy = slotY + row * 56;
      row++;

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, slotX, yy, 320, 46, 12);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#d7e0ff";
      ctx.fillText(s.toUpperCase(), slotX + 12, yy + 28);

      const it = hero.equip[s];
      if (it) {
        ctx.fillStyle = rarityColor(it.rarity);
        ctx.fillText(it.name, slotX + 110, yy + 28);
      } else {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#d7e0ff";
        ctx.fillText("(empty)", slotX + 110, yy + 28);
        ctx.globalAlpha = 1;
      }
    }

    // inventory preview
    const invX = x + 360;
    const invY = y + 100;
    ctx.fillStyle = "#aab6d6";
    ctx.fillText("Inventory (auto-equip if slot empty):", invX, invY - 10);

    const list = hero.inventory.slice(-10).reverse();
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const yy = invY + i * 30;

      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      roundRect(ctx, invX, yy, boxW - (invX - x) - 18, 24, 10);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = it.kind === "gear" ? rarityColor(it.rarity) : "#ffd28a";
      const label = it.kind === "gear" ? `${it.name} [${it.slot}]` : `Gold x${it.amt}`;
      ctx.fillText(label, invX + 10, yy + 16);
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

    for (let i = 0; i < hero.skills.length; i++) {
      const s = hero.skills[i];
      const yy = y + 60 + i * 92;

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, x + 18, yy, boxW - 36, 78, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#ffd28a";
      ctx.fillText(`${s.name} (key: ${s.key.toUpperCase()})`, x + 34, yy + 24);

      ctx.fillStyle = "#d7e0ff";
      ctx.fillText(`Level: ${s.level}   XP: ${s.xp}/${s.nextXp}   Mana: ${s.mana}   CD: ${s.cd.toFixed(2)}s`, x + 34, yy + 46);

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
