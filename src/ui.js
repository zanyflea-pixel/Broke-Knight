// src/ui.js
import { clamp } from "./util.js";
import { rarityColor } from "./entities.js";

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
    const mouse = vm.mouse || { x: 0, y: 0 };

    // HUD
    this.drawHUD(ctx, hero, vm.fire, vm.skill);

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

    // reset hit regions
    this._last.invItems = [];
    this._last.equipSlots = [];

    if (menus.map) this.drawMap(ctx, vm.world, hero, vm.cam);
    if (menus.inv) this.drawInventory(ctx, hero, mouse);
    if (menus.god) this.drawGod(ctx, vm.god);
    if (menus.skills) this.drawSkills(ctx, hero, vm.skill);

    // help footer
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, 14, H - 42, 620, 28, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("M Map  |  I Inventory  |  K Skills  |  G God  |  A Fireball  |  Click: cast at cursor  |  B Sail (dock)  |  Esc Close", 26, H - 22);

    return this._last;
  }

  drawHUD(ctx, hero, fire, skill) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, 14, 14, 360, 104, 14);
    ctx.fill();
    ctx.globalAlpha = 1;

    const hpPct = hero.maxHp ? hero.hp / hero.maxHp : 1;
    const mpPct = hero.maxMana ? hero.mana / hero.maxMana : 1;
    const xpNeed = 100 + (hero.level - 1) * 35;
    const xpPct = xpNeed ? hero.xp / xpNeed : 0;

    bar(ctx, 26, 26, 290, 12, hpPct, "#ff5d5d", "HP");
    bar(ctx, 26, 48, 290, 12, mpPct, "#38d9ff", "MP");
    bar(ctx, 26, 70, 290, 10, clamp(xpPct, 0, 1), "#7CFF6B", "XP");

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Lv ${hero.level}`, 324, 38);
    ctx.fillText(`Gold ${hero.gold}`, 324, 58);

    const cd = fire?.cd ?? 0;
    const lv = fire?.lv ?? 1;
    const sxp = skill?.fireXP ?? 0;
    const sNeed = skill?.fireNeed ?? 1;

    ctx.fillText(`Fireball Lv ${lv}`, 26, 104);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = cd > 0 ? "rgba(255,140,60,0.55)" : "rgba(255,140,60,0.25)";
    roundRect(ctx, 128, 92, 94, 18, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd28a";
    ctx.fillText(cd > 0 ? `CD ${cd.toFixed(2)}` : "READY", 142, 106);

    // skill XP mini bar
    const pct = clamp(sNeed ? sxp / sNeed : 0, 0, 1);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, 230, 92, 86, 18, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,210,138,0.85)";
    roundRect(ctx, 230, 92, 86 * pct, 18, 8);
    ctx.fill();
    ctx.fillStyle = "#0b1330";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("Skill XP", 244, 105);
  }

  drawMap(ctx, world, hero, cam) {
    const W = ctx.canvas.width, H = ctx.canvas.height;

    const x = 18, y = 130;
    const w = Math.min(440, W - 36);
    const h = Math.min(320, H - 160);

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

  drawInventory(ctx, hero, mouse) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const x = W - 470;
    const y = 14;
    const w = 450;
    const h = Math.min(560, H - 28);

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
    ctx.fillText(`Move: ${hero.moveSpeed}`, x + 270, y + 52);
    ctx.fillText(`HP: ${hero.hp}/${hero.maxHp}`, x + 16, y + 72);
    ctx.fillText(`MP: ${Math.floor(hero.mana)}/${hero.maxMana}`, x + 130, y + 72);

    // equipment
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

      this._last.equipSlots.push({ slot, x: bx, y: by, w: bw, h: bh, item: it || null });
    }

    // backpack
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

      const hover = pointIn(mouse.x, mouse.y, bx, by, bw, bh);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = hover ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.3)";
      roundRect(ctx, bx, by, bw, bh, 8);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = rarityColor(it.rarity);
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`[${it.slot}] ${it.name}`, bx + 8, by + 13);

      this._last.invItems.push({ idx: i, id: it.id, x: bx, y: by, w: bw, h: bh, item: it });

      if (hover) this.drawTooltip(ctx, mouse.x + 14, mouse.y + 10, it, hero.equip[it.slot]);
    }

    // also hover equipment slot tooltips
    for (const s of this._last.equipSlots) {
      if (s.item && pointIn(mouse.x, mouse.y, s.x, s.y, s.w, s.h)) {
        this.drawTooltip(ctx, mouse.x + 14, mouse.y + 10, s.item, null);
      }
    }
  }

  drawTooltip(ctx, x, y, item, compareItem) {
    const lines = [];
    lines.push(item.name);
    lines.push(`${item.rarity.toUpperCase()} • ${item.slot.toUpperCase()} • Tier ${item.tier}`);

    const s = item.stats || {};
    const statLines = [];
    if (s.dmg) statLines.push(`DMG +${s.dmg}`);
    if (s.armor) statLines.push(`Armor +${s.armor}`);
    if (s.hp) statLines.push(`HP +${s.hp}`);
    if (s.mana) statLines.push(`Mana +${s.mana}`);
    if (s.move) statLines.push(`Move +${s.move}`);
    lines.push(...statLines);

    if (compareItem) {
      const cs = compareItem.stats || {};
      lines.push("— Compare (equipped) —");
      lines.push(compareItem.name);
      const cLines = [];
      if (cs.dmg) cLines.push(`DMG +${cs.dmg}`);
      if (cs.armor) cLines.push(`Armor +${cs.armor}`);
      if (cs.hp) cLines.push(`HP +${cs.hp}`);
      if (cs.mana) cLines.push(`Mana +${cs.mana}`);
      if (cs.move) cLines.push(`Move +${cs.move}`);
      if (cLines.length) lines.push(...cLines);
    }

    ctx.save();
    ctx.font = "12px system-ui, sans-serif";
    const padding = 10;
    const w = Math.min(340, Math.max(...lines.map(l => ctx.measureText(l).width)) + padding * 2);
    const h = lines.length * 16 + padding * 2;

    // keep on screen
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const bx = clamp(x, 10, W - w - 10);
    const by = clamp(y, 10, H - h - 10);

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    roundRect(ctx, bx, by, w, h, 12);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d7e0ff";
    let yy = by + padding + 12;
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) ctx.fillStyle = rarityColor(item.rarity);
      else ctx.fillStyle = "#d7e0ff";
      ctx.fillText(lines[i], bx + padding, yy);
      yy += 16;
    }

    ctx.restore();
  }

  drawSkills(ctx, hero, skill) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const w = 420, h = 240;
    const x = (W - w) / 2;
    const y = (H - h) / 2;

    ctx.globalAlpha = 0.93;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Skills (K to close)", x + 16, y + 30);

    const lv = skill?.fireLv ?? 1;
    const xp = skill?.fireXP ?? 0;
    const need = skill?.fireNeed ?? 1;

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`Fireball`, x + 18, y + 70);
    ctx.fillStyle = "#ffd28a";
    ctx.fillText(`Lv ${lv}`, x + 120, y + 70);

    const pct = clamp(need ? xp / need : 0, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, x + 18, y + 82, w - 36, 18, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,210,138,0.85)";
    roundRect(ctx, x + 18, y + 82, (w - 36) * pct, 18, 8);
    ctx.fill();

    ctx.fillStyle = "#d7e0ff";
    ctx.fillText(`Skill XP: ${xp} / ${need}`, x + 18, y + 124);

    ctx.globalAlpha = 0.8;
    ctx.fillText("Left-click casts toward your cursor (no menus open).", x + 18, y + 156);
    ctx.fillText("Future: add skill slots, upgrades, animations per skill.", x + 18, y + 176);
    ctx.globalAlpha = 1;
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

/* helpers */
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

function pointIn(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}
