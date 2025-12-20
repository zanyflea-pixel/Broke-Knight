// src/ui.js
import { clamp } from "./util.js";
import { rarityColor } from "./entities.js";

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

export default class UI {
  constructor() {
    this.last = { invItems: [], equipSlots: [] };
  }

  draw(ctx, vm) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    // HUD background fade
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(12, 12, 320, 88);
    ctx.restore();

    const hero = vm.hero;
    const stats = vm.stats;

    // HP/Mana bars
    this.drawBar(ctx, 20, 22, 240, 14, hero.hp / hero.maxHp, "#ff4f6a", "HP");
    this.drawBar(ctx, 20, 42, 240, 12, hero.mana / hero.maxMana, "#38d9ff", "Mana");

    // XP bar
    const xpNeed = 55 + (hero.level - 1) * 45;
    this.drawBar(ctx, 20, 58, 240, 10, hero.xp / xpNeed, "#ffd28a", `Lv ${hero.level}`);

    // gold & materials
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Gold: ${hero.gold}`, 20, 86);
    ctx.fillText(`Iron ${hero.materials.iron}  Leather ${hero.materials.leather}  Essence ${hero.materials.essence}`, 90, 86);

    // skill indicator
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, W - 210, 14, 196, 34, 10);
    ctx.fill();
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Skill: ${vm.activeSkill}`, W - 112, 36);
    ctx.textAlign = "left";

    if (vm.msg) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, W / 2 - 200, 16, 400, 34, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(vm.msg, W / 2, 38);
      ctx.textAlign = "left";
    }

    // Menus
    if (vm.menus.map) this.drawMap(ctx, vm.world, hero);
    if (vm.menus.inventory) this.drawInventory(ctx, hero);
    if (vm.menus.skills) this.drawSkills(ctx, hero);
    if (vm.menus.god) this.drawGod(ctx, vm.god);

    // Sail hint button
    if (vm.hints.sail) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, W/2 - 130, H - 88, 260, 44, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Press B to Sail (near dock)", W/2, H - 60);
      ctx.textAlign = "left";
    }
  }

  drawBar(ctx, x, y, w, h, p, col, label) {
    p = clamp(p, 0, 1);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col;
    roundRect(ctx, x, y, w * p, h, 6);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(label, x + 6, y + h - 2);
  }

  drawMap(ctx, world, hero) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const pad = 18;
    const boxW = Math.min(520, W - 80);
    const boxH = Math.min(360, H - 80);
    const x0 = (W - boxW) / 2;
    const y0 = (H - boxH) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    roundRect(ctx, x0, y0, boxW, boxH, 16);
    ctx.fill();

    // render mini terrain
    const inset = 14;
    const mx = x0 + inset;
    const my = y0 + inset;
    const mw = boxW - inset * 2;
    const mh = boxH - inset * 2;

    const step = 8;
    for (let yy = 0; yy < mh; yy += step) {
      for (let xx = 0; xx < mw; xx += step) {
        const wx = (xx / mw) * world.width;
        const wy = (yy / mh) * world.height;
        const T = world.terrainAt(wx, wy);
        ctx.fillStyle = T.ocean ? "rgba(20,60,92,0.95)" : "rgba(40,130,80,0.95)";
        ctx.fillRect(mx + xx, my + yy, step, step);
      }
    }

    
// markers: waystones / docks / towns
// waystones
ctx.globalAlpha = 0.9;
for (const w of (world.waystones || [])) {
  const wx = mx + (w.x / world.width) * mw;
  const wy = my + (w.y / world.height) * mh;
  ctx.fillStyle = w.activated ? "rgba(56,217,255,0.95)" : "rgba(160,170,210,0.8)";
  ctx.fillRect(wx - 2, wy - 2, 4, 4);
}

// docks
for (const d of (world.docks || [])) {
  const dx = mx + ((d.x + d.w/2) / world.width) * mw;
  const dy = my + ((d.y + d.h/2) / world.height) * mh;
  ctx.fillStyle = "rgba(255,210,140,0.85)";
  ctx.fillRect(dx - 2, dy - 2, 4, 4);
}

// towns/settlements
for (const s of (world.settlements || [])) {
  const sx = mx + (s.x / world.width) * mw;
  const sy = my + (s.y / world.height) * mh;
  ctx.fillStyle = "rgba(210,190,145,0.9)";
  ctx.fillRect(sx - 3, sy - 3, 6, 6);
}
ctx.globalAlpha = 1;// hero marker
    const hx = mx + (hero.x / world.width) * mw;
    const hy = my + (hero.y / world.height) * mh;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("MAP (M to close)", x0 + 16, y0 - 10);
    ctx.globalAlpha = 1;
  }

  drawInventory(ctx, hero) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const w = Math.min(560, W - 80);
    const h = Math.min(420, H - 80);
    const x = (W - w) / 2;
    const y = (H - h) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Inventory (I to close)", x + 16, y + 28);

    // equipment slots
    ctx.font = "12px system-ui, sans-serif";
    const slots = ["weapon","helm","chest","boots","ring"];
    let sx = x + 16, sy = y + 44;
    ctx.fillText("Equipment:", sx, sy + 14);

    let cx = sx, cy = sy + 22;
    for (const s of slots) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, cx, cy, 140, 34, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      const it = hero.equip[s];
      ctx.fillStyle = it ? rarityColor(it.rarity) : "#9aa6d8";
      ctx.fillText(`${s.toUpperCase()}: ${it ? it.name : "-"}`, cx + 10, cy + 22);
      cy += 40;
      if (cy > y + h - 70) { cy = sy + 22; cx += 150; }
    }

    // inventory list
    const listX = x + 330;
    const listY = y + 52;
    ctx.fillStyle = "#d7e0ff";
    ctx.fillText("Backpack:", listX, listY);

    const items = hero.inventory.slice(-14).reverse();
    let yy = listY + 14;
    for (const it of items) {
      ctx.fillStyle = rarityColor(it.rarity || "common");
      ctx.fillText(`• ${it.name}`, listX, yy + 14);
      yy += 18;
    }

    ctx.globalAlpha = 1;
  }

  drawSkills(ctx, hero) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const w = Math.min(520, W - 80);
    const h = Math.min(320, H - 80);
    const x = (W - w) / 2;
    const y = (H - h) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Skills (K to close)", x + 16, y + 28);

    ctx.font = "13px system-ui, sans-serif";
    const skills = ["fireball"];
    let yy = y + 58;
    for (const s of skills) {
      const lvl = hero.skillLvl[s] || 1;
      const xp = hero.skillXP[s] || 0;
      const need = 20 + lvl * 18;
      ctx.fillStyle = "#d7e0ff";
      ctx.fillText(`${s.toUpperCase()}  Lv ${lvl}`, x + 20, yy);
      // bar
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, x + 20, yy + 8, w - 40, 12, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff7a2f";
      roundRect(ctx, x + 20, yy + 8, (w - 40) * clamp(xp / need, 0, 1), 12, 6);
      ctx.fill();
      yy += 44;
    }
    ctx.globalAlpha = 1;
  }

  drawGod(ctx, vm) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const w = 360, h = 220;
    const x = (W - w) / 2;
    const y = (H - h) / 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("God Menu (G to close)", x + 16, y + 28);

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#d7e0ff";
    ctx.fillText(`Invincible: ${vm.invincible ? "ON" : "OFF"} (toggle: 1)`, x + 20, y + 74);
    ctx.fillText(`One-shot:   ${vm.oneshot ? "ON" : "OFF"} (toggle: 2)`, x + 20, y + 98);
    ctx.fillText(`Free Mana:  ${vm.freeman ? "ON" : "OFF"} (toggle: 3)`, x + 20, y + 122);
    ctx.fillText(`Spawn Boss: press 9`, x + 20, y + 154);

    ctx.globalAlpha = 1;
  }
}
