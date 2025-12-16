// src/ui.js
import { clamp } from "./util.js";

export default class UI {
  constructor() {
    this._last = { invItems: [], equipSlots: [] };
  }

  draw(ctx, vm) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    const hero = vm.hero;
    const menus = vm.menus;
    const msg = vm.msg || "";

    // HUD
    this.drawHUD(ctx, hero, vm.fire);

    // Toast
    if (msg) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, W / 2 - 180, 18, 360, 34, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(msg, W / 2, 40);
      ctx.textAlign = "left";
    }

    // reset clickable hit regions
    this._last.invItems = [];
    this._last.equipSlots = [];

    if (menus.map) this.drawMap(ctx, vm.world, hero, vm.cam);
    if (menus.inv) this.drawInventory(ctx, hero);
    if (menus.god) this.drawGod(ctx, vm.god);

    // help footer
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, 14, H - 42, 520, 28, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("M Map  |  I Inventory  |  G God  |  A Fireball  |  B Sail (at dock)  |  Esc Close", 26, H - 22);

    return this._last;
  }

  drawHUD(ctx, hero, fire) {
    const W = ctx.canvas.width;

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, 14, 14, 340, 96, 14);
    ctx.fill();
    ctx.globalAlpha = 1;

    const hpPct = hero.maxHp ? hero.hp / hero.maxHp : 1;
    const mpPct = hero.maxMana ? hero.mana / hero.maxMana : 1;
    const xpNeed = 100 + (hero.level - 1) * 35;
    const xpPct = xpNeed ? hero.xp / xpNeed : 0;

    bar(ctx, 26, 26, 270, 12, hpPct, "#ff5d5d", "HP");
    bar(ctx, 26, 48, 270, 12, mpPct, "#38d9ff", "MP");
    bar(ctx, 26, 70, 270, 10, clamp(xpPct, 0, 1), "#7CFF6B", "XP");

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Lv ${hero.level}`, 304, 38);
    ctx.fillText(`Gold ${hero.gold}`, 304, 58);

    const cd = fire?.cd ?? 0;
    const lv = fire?.lv ?? 1;
    ctx.fillText(`Fireball Lv ${lv}`, 26, 102);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = cd > 0 ? "rgba(255,140,60,0.55)" : "rgba(255,140,60,0.25)";
    roundRect(ctx, 128, 90, 90, 18, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd28a";
    ctx.fillText(cd > 0 ? `CD ${cd.toFixed(2)}` : "READY", 142, 104);
  }

  drawMap(ctx, world, hero, cam) {
    const W = ctx.canvas.width, H = ctx.canvas.height;

    const x = 18, y = 124;
    const w = Math.min(440, W - 36);
    const h = Math.min(320, H - 150);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Map (M to close)", x + 14, y + 22);

    const pad = 16;
    const mx = x + pad, my = y + 34;
    const mw = w - pad * 2, mh = h - 50;

    const step = 10;
    for (let yy = 0; yy < mh; yy += step) {
      for (let xx = 0; xx < mw; xx += step) {
        const wx = (xx / mw) * world.width;
        const wy = (yy / mh) * world.height;
        const T = world.terrainAt(wx, wy);
        ctx.fillStyle = T.ocean ? "rgba(20,60,90,0.85)" : "rgba(30,120,70,0.85)";
        ctx.fillRect(mx + xx, my + yy, step, step);
      }
    }

    const hx = mx + (hero.x / world.width) * mw;
    const hy = my + (hero.y / world.height) * mh;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();

    const vw = (ctx.canvas.width / world.width) * mw;
    const vh = (ctx.canvas.height / world.height) * mh;
    const vx = mx + (cam.x / world.width) * mw;
    const vy = my + (cam.y / world.height) * mh;

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.globalAlpha = 1;
  }

  drawInventory(ctx, hero) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const x = W - 460;
    const y = 14;
    const w = 440;
    const h = Math.min(540, H - 28);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText("Inventory & Stats (I to close)", x + 14, y + 24);

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`DMG: ${hero.dmg}`, x + 16, y + 52);
    ctx.fillText(`Armor: ${hero.armor}`, x + 130, y + 52);
    ctx.fillText(`Move: ${hero.moveSpeed}`, x + 260, y + 52);
    ctx.fillText(`HP: ${hero.hp}/${hero.maxHp}`, x + 16, y + 72);
    ctx.fillText(`MP: ${Math.floor(hero.mana)}/${hero.maxMana}`, x + 130, y + 72);

    const slots = ["weapon", "helm", "chest", "boots", "ring"];
    let sy = y + 96;

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, x + 12, sy - 18, w - 24, 148, 12);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Equipment (click slot to unequip)", x + 16, sy - 2);

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const bx = x + 16;
      const by = sy + i * 24;
      const bw = w - 32;
      const bh = 20;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      roundRect(ctx, bx, by, bw, bh, 8);
      ctx.fill();
      ctx.globalAlpha = 1;

      const it = hero.equip[slot];
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "12px system-ui, sans-serif";
      const label = slot.toUpperCase().padEnd(6, " ");
      ctx.fillText(`${label}: ${it ? it.name : "(empty)"}`, bx + 8, by + 14);

      this._last.equipSlots.push({ slot, x: bx, y: by, w: bw, h: bh });
    }

    const listY = y + 260;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, x + 12, listY - 18, w - 24, h - listY + y + 6, 12);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Backpack (click gear to equip)", x + 16, listY - 2);

    const gear = (hero.inventory || []).filter(it => it.kind === "gear");
    const maxRows = Math.floor((h - listY - 14) / 22);
    const shown = gear.slice(0, Math.max(0, maxRows));

    for (let i = 0; i < shown.length; i++) {
      const it = shown[i];
      const bx = x + 16;
      const by = listY + i * 22;
      const bw = w - 32;
      const bh = 18;

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      roundRect(ctx, bx, by, bw, bh, 8);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = rarityColor(it.rarity);
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`[${it.slot}] ${it.name}`, bx + 8, by + 13);

      this._last.invItems.push({ idx: i, id: it.id, x: bx, y: by, w: bw, h: bh });
    }
  }

  drawGod(ctx, god) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const w = 320, h = 160;
    const x = (W - w) / 2;
    const y = (H - h) / 2;

    ctx.globalAlpha = 0.93;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("God Menu (G to close)", x + 16, y + 28);

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`1: Invincible  [${god.invincible ? "ON" : "OFF"}]`, x + 16, y + 62);
    ctx.fillText(`2: Damage Mult [x${god.dmgMult}]`, x + 16, y + 86);
    ctx.fillText("3: Refill HP/Mana", x + 16, y + 110);
  }
}

function bar(ctx, x, y, w, h, pct, color, label) {
  pct = clamp(pct, 0, 1);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * pct, h, 7);
  ctx.fill();

  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#d7e0ff";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(label, x + w + 10, y + h - 1);
  ctx.globalAlpha = 1;
}

function rarityColor(r) {
  if (r === "epic") return "#c77dff";
  if (r === "rare") return "#38d9ff";
  return "#cfd7e6";
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
