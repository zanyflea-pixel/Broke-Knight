// src/ui.js
import { rarityColor, GearSlots } from "./entities.js";

export default class UI {
  constructor() {
    this.open = { map: false, stats: false, skills: false };
    this.msg = "";
    this.msgT = 0;

    this.skillName = "Fireball";
    this.skillPulse = 0;
  }

  setMsg(txt, t = 2.2) {
    this.msg = txt;
    this.msgT = t;
  }

  update(dt) {
    if (this.msgT > 0) this.msgT -= dt;
    if (this.skillPulse > 0) this.skillPulse -= dt;
  }

  toggle(name) {
    this.open[name] = !this.open[name];
  }

  closeAll() {
    for (const k of Object.keys(this.open)) this.open[k] = false;
  }

  draw(ctx, game) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const hero = game.hero;

    // HUD
    this.drawHUD(ctx, game);

    // floating message
    if (this.msgT > 0) {
      ctx.globalAlpha = Math.min(1, this.msgT / 0.25);
      box(ctx, w / 2 - 220, 16, 440, 32, 10, "rgba(0,0,0,0.45)");
      text(ctx, this.msg, w / 2, 38, "#d7e0ff", 14, "center");
      ctx.globalAlpha = 1;
    }

    // active skill indicator
    if (this.skillPulse > 0) {
      const a = Math.min(1, this.skillPulse / 0.12);
      ctx.globalAlpha = a * 0.9;
      box(ctx, w - 200, 16, 184, 32, 10, "rgba(25,35,70,0.55)");
      text(ctx, `Skill: ${this.skillName}`, w - 108, 38, "#ffd28a", 14, "center");
      ctx.globalAlpha = 1;
    }

    // windows
    if (this.open.map) this.drawMap(ctx, game);
    if (this.open.stats) this.drawStats(ctx, game);
    if (this.open.skills) this.drawSkills(ctx, game);
  }

  drawHUD(ctx, game) {
    const hero = game.hero;
    const st = hero.getStats();

    const W = ctx.canvas.width;

    // HP bar
    bar(ctx, 16, 16, 240, 16, hero.hp / st.maxHp, "#ff5d5d", "HP");
    // Mana bar
    bar(ctx, 16, 38, 240, 16, hero.mana / st.maxMana, "#52b7ff", "Mana");

    // XP
    bar(ctx, 16, 60, 240, 12, hero.xp / hero.nextXp, "#5dff9a", `Lv ${hero.level}`);

    // Gold + mode
    box(ctx, 270, 16, 170, 56, 10, "rgba(0,0,0,0.35)");
    text(ctx, `Gold: ${hero.gold}`, 286, 38, "#ffd36a", 14, "left");
    text(ctx, `Sailing: ${hero.state.sailing ? "ON" : "OFF"}`, 286, 58, "#d7e0ff", 12, "left");
    text(ctx, `God: ${hero.state.invulnerable ? "ON" : "OFF"}`, 286, 72, "#d7e0ff", 12, "left");

    // hints
    if (game.hint) {
      box(ctx, W / 2 - 260, ctx.canvas.height - 54, 520, 38, 10, "rgba(0,0,0,0.38)");
      text(ctx, game.hint, W / 2, ctx.canvas.height - 28, "#d7e0ff", 14, "center");
    }
  }

  drawMap(ctx, game) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const ww = 520, hh = 360;
    const x = W / 2 - ww / 2, y = H / 2 - hh / 2;

    box(ctx, x, y, ww, hh, 14, "rgba(0,0,0,0.62)");
    text(ctx, "Map (M to close, ESC closes)", x + ww / 2, y + 28, "#d7e0ff", 14, "center");

    const pad = 18;
    const mx = x + pad, my = y + 44, mw = ww - pad * 2, mh = hh - 60;

    // render low-res map sampling of world
    const ctx2 = ctx;
    const steps = 96;
    const sx = game.world.width / steps;
    const sy = game.world.height / steps;

    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < steps; i++) {
        const wx = (i + 0.5) * sx;
        const wy = (j + 0.5) * sy;
        const T = game.world.terrainAt(wx, wy);
        ctx2.globalAlpha = 0.95;
        ctx2.fillStyle = T.ocean ? "rgba(20,60,100,0.9)" : "rgba(40,120,70,0.9)";
        const rx = mx + (i / steps) * mw;
        const ry = my + (j / steps) * mh;
        ctx2.fillRect(rx, ry, mw / steps + 0.3, mh / steps + 0.3);
      }
    }
    ctx2.globalAlpha = 1;

    // player marker
    const px = mx + (game.hero.x / game.world.width) * mw;
    const py = my + (game.hero.y / game.world.height) * mh;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0b1330";
    ctx.lineWidth = 2;
    ctx.stroke();

    // waystones markers
    ctx.globalAlpha = 0.8;
    for (const wst of game.world.waystones) {
      const wx = mx + (wst.x / game.world.width) * mw;
      const wy = my + (wst.y / game.world.height) * mh;
      ctx.fillStyle = wst.activated ? "#38d9ff" : "#9aa6d8";
      ctx.fillRect(wx - 2, wy - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  drawStats(ctx, game) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const ww = 520, hh = 420;
    const x = W / 2 - ww / 2, y = H / 2 - hh / 2;

    box(ctx, x, y, ww, hh, 14, "rgba(0,0,0,0.62)");
    text(ctx, "Stats / Gear (I to close, ESC closes)", x + ww / 2, y + 28, "#d7e0ff", 14, "center");

    const hero = game.hero;
    const st = hero.getStats();

    const leftX = x + 24;
    let yy = y + 56;
    text(ctx, `Level: ${hero.level}`, leftX, yy, "#d7e0ff", 14, "left"); yy += 22;
    text(ctx, `HP: ${Math.round(hero.hp)} / ${st.maxHp}`, leftX, yy, "#d7e0ff", 14, "left"); yy += 22;
    text(ctx, `Mana: ${Math.round(hero.mana)} / ${st.maxMana}`, leftX, yy, "#d7e0ff", 14, "left"); yy += 22;
    text(ctx, `Damage: ${st.dmg}`, leftX, yy, "#d7e0ff", 14, "left"); yy += 22;
    text(ctx, `Armor: ${st.armor}`, leftX, yy, "#d7e0ff", 14, "left"); yy += 22;
    text(ctx, `Gold: ${hero.gold}`, leftX, yy, "#ffd36a", 14, "left"); yy += 22;

    // equipment slots
    const sx = x + 280;
    let sy = y + 56;

    text(ctx, "Equipment", sx, sy, "#ffd28a", 14, "left");
    sy += 18;

    for (const slot of GearSlots) {
      const it = hero.equip[slot];
      box(ctx, sx, sy, 220, 30, 10, "rgba(20,25,45,0.55)");
      text(ctx, slot.toUpperCase(), sx + 10, sy + 20, "#9aa6d8", 12, "left");
      if (it) {
        text(ctx, it.name, sx + 80, sy + 20, rarityColor(it.rarity), 12, "left");
      } else {
        text(ctx, "(empty)", sx + 80, sy + 20, "rgba(215,224,255,0.55)", 12, "left");
      }
      sy += 38;
    }

    text(ctx, "Tip: Pick up gear by touching drops.", x + ww / 2, y + hh - 18, "rgba(215,224,255,0.7)", 12, "center");
  }

  drawSkills(ctx, game) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const ww = 520, hh = 320;
    const x = W / 2 - ww / 2, y = H / 2 - hh / 2;

    box(ctx, x, y, ww, hh, 14, "rgba(0,0,0,0.62)");
    text(ctx, "Skills (K to close, ESC closes)", x + ww / 2, y + 28, "#d7e0ff", 14, "center");

    const sx = x + 24, sy = y + 60;
    text(ctx, "Fireball", sx, sy, "#ffd28a", 16, "left");
    text(ctx, "A = cast toward mouse (or last move dir)", sx, sy + 24, "rgba(215,224,255,0.8)", 12, "left");
    text(ctx, "This is a scaffold for a larger skill XP system.", sx, sy + 46, "rgba(215,224,255,0.6)", 12, "left");
  }
}

// ---------- helpers ----------
function box(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function bar(ctx, x, y, w, h, t, col, label) {
  t = Math.max(0, Math.min(1, t));
  box(ctx, x, y, w, h, 10, "rgba(0,0,0,0.45)");
  ctx.fillStyle = col;
  roundRect(ctx, x + 2, y + 2, (w - 4) * t, h - 4, 8);
  ctx.fill();
  text(ctx, label, x + 10, y + h - 3, "rgba(215,224,255,0.85)", 11, "left");
}

function text(ctx, str, x, y, col, size = 14, align = "left") {
  ctx.fillStyle = col;
  ctx.font = `${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
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
