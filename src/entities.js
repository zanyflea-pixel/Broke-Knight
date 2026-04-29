// src/entities.js
// v102.3 FULL ENTITIES RESTORE
// - fuller hero visuals / equipment visuals
// - fuller enemy variety + behavior
// - projectile / loot behavior
// - makeGear compatible with current game.js
// - built to match current util.js / world.js / ui.js

import { clamp, norm } from "./util.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rarityColor(rarity) {
  if (rarity === "epic") return "#c995ff";
  if (rarity === "rare") return "#88cfff";
  if (rarity === "uncommon") return "#94e48d";
  return "#d9dee8";
}

function makeName(slot, rarity, seed) {
  const roots = {
    weapon: ["Blade", "Edge", "Fang", "Brand", "Saber"],
    armor: ["Mail", "Plate", "Guard", "Harness", "Shell"],
    helm: ["Helm", "Crown", "Visor", "Cap", "Hood"],
    boots: ["Greaves", "Boots", "Treads", "Steps", "Soles"],
    ring: ["Band", "Loop", "Ring", "Seal", "Circle"],
    trinket: ["Charm", "Idol", "Sigil", "Relic", "Token"],
  };

  const prefixes = ["Old", "Iron", "Knight", "Hunter", "Ash", "Moon", "River", "Storm", "Gold"];
  const epics = ["Ancient", "Dragon", "Void", "Sun", "Star", "Royal"];

  const pool = roots[slot] || ["Gear"];
  const p = rarity === "epic"
    ? epics[(seed + 13) % epics.length]
    : prefixes[(seed + 7) % prefixes.length];
  const r = pool[(seed + 3) % pool.length];
  return `${p} ${r}`;
}

function weaponShapeFromRarity(rarity) {
  if (rarity === "epic") return "greatblade";
  if (rarity === "rare") return "longsword";
  if (rarity === "uncommon") return "sword";
  return "shortsword";
}

function armorWeightFromItem(item) {
  const armor = item?.stats?.armor || 0;
  const hp = item?.stats?.hp || 0;
  const score = armor * 2 + hp * 0.15;
  if (score >= 18) return "heavy";
  if (score >= 9) return "medium";
  return "light";
}

function alphaColor(hex, alpha) {
  if (typeof hex !== "string" || !hex.startsWith("#")) return `rgba(255,255,255,${alpha})`;
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return `rgba(255,255,255,${alpha})`;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function mixColor(a, b, t = 0.5) {
  const read = (hex) => {
    if (typeof hex !== "string" || !hex.startsWith("#")) return [255, 255, 255];
    const raw = hex.slice(1);
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    const value = Number.parseInt(full, 16);
    if (!Number.isFinite(value)) return [255, 255, 255];
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const ca = read(a);
  const cb = read(b);
  const p = clamp(t, 0, 1);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * p);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * p);
  const b2 = Math.round(ca[2] + (cb[2] - ca[2]) * p);
  return `rgb(${r},${g},${b2})`;
}

export function makeGear(slot, level = 1, rarity = "common", seed = 1) {
  const scale =
    rarity === "epic" ? 1.9 :
    rarity === "rare" ? 1.45 :
    rarity === "uncommon" ? 1.18 :
    1.0;

  const lvl = Math.max(1, level | 0);
  const rollA = ((seed * 17) % 1000) / 1000;
  const rollB = ((seed * 31) % 1000) / 1000;
  const rollC = ((seed * 47) % 1000) / 1000;

  const stats = {};

  if (slot === "weapon") {
    stats.dmg = Math.max(1, Math.round((4 + lvl * 1.7 + rollA * 4) * scale));
    if (rollB > 0.55) stats.crit = +(0.01 + rollB * 0.05).toFixed(3);
    if (rollA > 0.70) stats.critMult = +(0.10 + rollA * 0.25).toFixed(3);
  } else if (slot === "armor") {
    stats.armor = Math.max(1, Math.round((2 + lvl * 1.3 + rollA * 3) * scale));
    if (rollB > 0.45) stats.hp = Math.round((8 + lvl * 2.0) * (0.5 + rollB) * 0.65);
  } else if (slot === "helm") {
    stats.hp = Math.max(4, Math.round((6 + lvl * 1.6 + rollA * 6) * scale * 0.8));
    if (rollB > 0.55) stats.mana = Math.max(3, Math.round((4 + lvl * 1.2) * 0.7));
  } else if (slot === "boots") {
    stats.move = +(0.03 + rollA * 0.08 * scale * 0.7).toFixed(3);
    if (rollB > 0.50) stats.armor = Math.max(1, Math.round((1 + lvl * 0.5) * 0.7));
  } else if (slot === "ring") {
    if (rollA > 0.40) stats.crit = +(0.02 + rollA * 0.06 * scale * 0.55).toFixed(3);
    if (rollB > 0.50) stats.dmg = Math.max(1, Math.round((1 + lvl * 0.7) * 0.7 * scale));
  } else if (slot === "trinket") {
    stats.mana = Math.max(4, Math.round((5 + lvl * 1.5 + rollA * 5) * scale * 0.8));
    if (rollB > 0.55) stats.hp = Math.max(4, Math.round((5 + lvl * 1.4) * 0.8));
  }

  const affixPool = [
    { name: "Vanguard", min: 0.18, stat: "armor", amount: Math.max(1, Math.round(1 + lvl * 0.32 * scale)) },
    { name: "Ember", min: 0.32, stat: "dmg", amount: Math.max(1, Math.round(1 + lvl * 0.36 * scale)) },
    { name: "Fleet", min: 0.46, stat: "move", amount: +(0.012 + rollC * 0.024).toFixed(3) },
    { name: "Sage", min: 0.60, stat: "mana", amount: Math.max(3, Math.round(3 + lvl * 0.7 * scale)) },
    { name: "Vital", min: 0.74, stat: "hp", amount: Math.max(4, Math.round(5 + lvl * 0.9 * scale)) },
    { name: "Keen", min: 0.86, stat: "crit", amount: +(0.012 + rollC * 0.032).toFixed(3) },
  ];
  const affix = affixPool.find((a) => rollC < a.min) || affixPool[affixPool.length - 1];
  if (rarity !== "common" || rollC > 0.68) {
    const nextValue = (stats[affix.stat] || 0) + affix.amount;
    stats[affix.stat] = Number.isInteger(nextValue) ? nextValue : +nextValue.toFixed(3);
  }

  const score = Object.entries(stats).reduce((sum, [key, value]) => {
    const weight = key === "crit" ? 120 : key === "critMult" ? 70 : key === "move" ? 140 : 1;
    return sum + Number(value || 0) * weight;
  }, lvl * 2 + scale * 8);

  return {
    slot,
    level: lvl,
    rarity,
    name: `${affix.name} ${makeName(slot, rarity, seed % 97)}`,
    affix: affix.name,
    score: Math.round(score),
    stats,
    color: rarityColor(rarity),
  };
}

export class Hero {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12;
    this.r = this.radius;

    this.level = 1;
    this.xp = 0;
    this.nextXp = 16;

    this.maxHp = 100;
    this.hp = this.maxHp;

    this.maxMana = 60;
    this.mana = this.maxMana;

    this.gold = 0;
    this.classId = "knight";
    this.inventory = [];
    this.equip = {};
    this.potions = { hp: 2, mana: 1 };
    this.bonusStats = { hp: 0, mana: 0 };

    this.lastMove = { x: 1, y: 0 };
    this.aimDir = { x: 1, y: 0 };

    this.state = {
      sailing: false,
      dashT: 0,
      hurtT: 0,
      slowT: 0,
      poisonT: 0,
    };
  }

  getStats() {
    const classId = this.classId || "knight";
    const classBonus = {
      knight: { hp: 24, mana: 0, dmg: 1, armor: 2, crit: 0, move: 0 },
      ranger: { hp: 4, mana: 8, dmg: 2, armor: 0, crit: 0.05, move: 0.05 },
      arcanist: { hp: -8, mana: 28, dmg: 3, armor: 0, crit: 0.02, move: 0 },
      raider: { hp: 8, mana: -6, dmg: 2, armor: 1, crit: 0.03, move: 0.07 },
    }[classId] || {};

    const out = {
      maxHp: 100 + (this.level - 1) * 10 + (classBonus.hp || 0) + (this.bonusStats?.hp || 0),
      maxMana: 60 + (this.level - 1) * 5 + (classBonus.mana || 0) + (this.bonusStats?.mana || 0),
      dmg: 8 + (this.level - 1) * 2 + (classBonus.dmg || 0),
      armor: classBonus.armor || 0,
      crit: 0.05 + (classBonus.crit || 0),
      critMult: 1.6,
      move: classBonus.move || 0,
    };

    for (const key of Object.keys(this.equip || {})) {
      const item = this.equip[key];
      if (!item?.stats) continue;
      const s = item.stats;
      if (s.hp) out.maxHp += s.hp;
      if (s.mana) out.maxMana += s.mana;
      if (s.dmg) out.dmg += s.dmg;
      if (s.armor) out.armor += s.armor;
      if (s.crit) out.crit += s.crit;
      if (s.critMult) out.critMult += s.critMult;
      if (s.move) out.move += s.move;
    }

    return out;
  }

  getMoveSpeed(env = null) {
    const st = this.getStats();
    let speed = 150 + st.move * 160;
    if ((this.state?.dashT || 0) > 0) speed *= 1.45;
    if (this.state?.sailing) speed *= 1.18;
    const world = env?.world || env;
    const terrainMod = world?.getMoveModifier?.(this.x, this.y) ?? 1;
    speed *= terrainMod;
    return speed;
  }

  spendMana(cost) {
    if (this.mana < cost) return false;
    this.mana -= cost;
    return true;
  }

  takeDamage(amount) {
    const st = this.getStats();
    const reduced = Math.max(1, Math.round(amount * (100 / (100 + (st.armor || 0) * 8))));
    this.hp = Math.max(0, this.hp - reduced);
    this.state.hurtT = 0.18;
    return reduced;
  }

  giveXP(amount) {
    this.xp += amount;
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level += 1;
      this.nextXp = Math.round(this.nextXp * 1.24 + 8);

      const st = this.getStats();
      this.maxHp = st.maxHp;
      this.maxMana = st.maxMana;
      this.hp = this.maxHp;
      this.mana = this.maxMana;
    }
  }

  update(dt) {
    this.state.dashT = Math.max(0, (this.state.dashT || 0) - dt);
    this.state.hurtT = Math.max(0, (this.state.hurtT || 0) - dt);

    const aim = norm(this.aimDir.x || this.lastMove.x || 1, this.aimDir.y || this.lastMove.y || 0);
    this.aimDir.x = aim.x;
    this.aimDir.y = aim.y;

    if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
      const mv = norm(this.vx, this.vy);
      this.lastMove.x = mv.x;
      this.lastMove.y = mv.y;
    }

    const st = this.getStats();
    this.maxHp = st.maxHp;
    this.maxMana = st.maxMana;
    this.hp = Math.min(this.hp, this.maxHp);
    this.mana = Math.min(this.mana, this.maxMana);

    this.mana = Math.min(this.maxMana, this.mana + dt * 1.4);
    this.hp = Math.min(this.maxHp, this.hp + dt * 0.18);
  }

  _drawWeapon(ctx, aim) {
    const sword = this.equip?.weapon;
    const rarity = sword?.rarity || "common";
    const shape = weaponShapeFromRarity(rarity);
    const bladeColor = sword?.color || "#dce9f5";
    const a = Math.atan2(aim.y, aim.x);
    const handX = 7;
    const handY = -1.5;

    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(a);

    ctx.fillStyle = "#e2c3b0";
    ctx.beginPath();
    ctx.arc(5, 0, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rarity === "epic" ? "#b78cff" : rarity === "rare" ? "#8fc7ff" : "#8b6338";
    ctx.fillRect(2, -1.5, 8, 3);

    ctx.fillStyle = rarity === "epic" ? "#f2d7ff" : "#d2b070";
    ctx.fillRect(0, -4, 2, 8);

    if (shape === "greatblade") {
      ctx.fillStyle = bladeColor;
      ctx.beginPath();
      ctx.moveTo(10, -3.2);
      ctx.lineTo(24, -2.7);
      ctx.lineTo(34, -1.2);
      ctx.lineTo(39, 0);
      ctx.lineTo(34, 1.2);
      ctx.lineTo(24, 2.7);
      ctx.lineTo(10, 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      ctx.fillRect(13, -0.6, 19, 1.2);
    } else if (shape === "longsword") {
      ctx.fillStyle = bladeColor;
      ctx.beginPath();
      ctx.moveTo(10, -2.7);
      ctx.lineTo(26, -1.9);
      ctx.lineTo(34, 0);
      ctx.lineTo(26, 1.9);
      ctx.lineTo(10, 2.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(12, -0.55, 17, 1.1);
    } else if (shape === "sword") {
      ctx.fillStyle = bladeColor;
      ctx.beginPath();
      ctx.moveTo(10, -2.5);
      ctx.lineTo(25, -1.4);
      ctx.lineTo(31, 0);
      ctx.lineTo(25, 1.4);
      ctx.lineTo(10, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(12, -0.5, 14, 1);
    } else {
      ctx.fillStyle = bladeColor;
      ctx.beginPath();
      ctx.moveTo(10, -2.2);
      ctx.lineTo(20, -1.2);
      ctx.lineTo(24, 0);
      ctx.lineTo(20, 1.2);
      ctx.lineTo(10, 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.fillRect(11, -0.45, 9, 0.9);
    }

    ctx.restore();
  }

  draw(ctx) {
    const t = performance.now() * 0.001;
    const bob = Math.sin(t * 7.5) * 0.7;
    const hurtFlash = (this.state.hurtT || 0) > 0 ? 0.5 + Math.sin(t * 28) * 0.5 : 0;
    const aim = norm(this.aimDir.x || this.lastMove.x || 1, this.aimDir.y || this.lastMove.y || 0);

    const armorItem = this.equip?.armor;
    const armorWeight = armorWeightFromItem(armorItem);
    const armorColor = armorItem?.color || "#7f93aa";

    const helmItem = this.equip?.helm;
    const helmColor = helmItem?.color || "#9fb3ca";

    const bootsItem = this.equip?.boots;
    const bootsColor = bootsItem?.color || "#5a4030";

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 14, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(120,180,255,0.08)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(230,240,255,0.18)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -1, 17 + Math.sin(t * 2.6) * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    const dashGlow = Math.max(0, this.state?.dashT || 0);
    if (dashGlow > 0) {
      const dashAngle = Math.atan2(aim.y, aim.x);
      ctx.save();
      ctx.rotate(dashAngle);
      ctx.fillStyle = alphaColor("#ffd36e", Math.min(0.22, dashGlow * 0.35));
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(10, 0);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const gearGlow =
      (this.equip?.weapon?.rarity === "epic" || this.equip?.armor?.rarity === "epic" || this.equip?.helm?.rarity === "epic") ? "rgba(201,149,255,0.18)" :
      (this.equip?.weapon?.rarity === "rare" || this.equip?.armor?.rarity === "rare" || this.equip?.helm?.rarity === "rare") ? "rgba(136,207,255,0.15)" :
      "";

    if (gearGlow) {
      ctx.fillStyle = gearGlow;
      ctx.beginPath();
      ctx.arc(0, -1, 22 + Math.sin(t * 3) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const cloakColor = mixColor(armorColor, "#5a1a24", armorWeight === "heavy" ? 0.48 : 0.62);
    const stride = Math.sin(t * 7.5) * 1.2 + (this.state?.dashT || 0) * 10;
    ctx.fillStyle = alphaColor(cloakColor, armorItem ? 0.82 : 0.74);
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(-13, 10 + stride * 0.25);
    ctx.lineTo(-2, 8);
    ctx.lineTo(6, 13 + stride * 0.18);
    ctx.lineTo(10, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(-1, 8);
    ctx.lineTo(2, 7);
    ctx.lineTo(1, -4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(128,42,52,0.88)";
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(-11, 10);
    ctx.lineTo(-3, 12);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(64,24,32,0.42)";
    ctx.beginPath();
    ctx.moveTo(5, -3);
    ctx.lineTo(13, 9);
    ctx.lineTo(5, 12);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = bootsColor;
    ctx.fillRect(-7, 8, 5, 7);
    ctx.fillRect(2, 8, 5, 7);

    if (bootsItem) {
      ctx.fillStyle = "rgba(230,236,246,0.55)";
      ctx.fillRect(-6, 5, 3, 4);
      ctx.fillRect(3, 5, 3, 4);
    }

    ctx.fillStyle = "#3f4d6d";
    ctx.fillRect(-6, 3, 4, 7);
    ctx.fillRect(2, 3, 4, 7);

    if (!armorItem) {
      ctx.fillStyle = "#7f93aa";
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.lineTo(8, -6);
      ctx.lineTo(7, 7);
      ctx.lineTo(0, 10);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#cfd8e6";
      ctx.fillRect(-8, -6, 4, 3);
      ctx.fillRect(4, -6, 4, 3);
    } else if (armorWeight === "light") {
      ctx.fillStyle = armorColor;
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.lineTo(8, -6);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 10);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(240,244,252,0.55)";
      ctx.fillRect(-7, -5, 14, 2);
      ctx.fillRect(-2, -5, 4, 13);
    } else if (armorWeight === "medium") {
      ctx.fillStyle = armorColor;
      ctx.beginPath();
      ctx.moveTo(-9, -7);
      ctx.lineTo(9, -7);
      ctx.lineTo(8, 7);
      ctx.lineTo(0, 11);
      ctx.lineTo(-8, 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(230,236,246,0.60)";
      ctx.fillRect(-8, -6, 5, 3);
      ctx.fillRect(3, -6, 5, 3);
      ctx.fillRect(-1.5, -6, 3, 14);
      ctx.fillStyle = "rgba(40,50,64,0.28)";
      ctx.fillRect(-9, -2, 2, 8);
      ctx.fillRect(7, -2, 2, 8);
    } else {
      ctx.fillStyle = armorColor;
      ctx.fillRect(-9, -7, 18, 15);

      ctx.fillStyle = "rgba(232,238,248,0.65)";
      ctx.fillRect(-8, -6, 16, 2);
      ctx.fillRect(-2, -6, 4, 14);
      ctx.fillRect(-10, -4, 4, 5);
      ctx.fillRect(6, -4, 4, 5);

      ctx.fillStyle = "rgba(40,50,64,0.30)";
      ctx.fillRect(-9, 6, 18, 2);
    }

    if (helmItem) {
      ctx.fillStyle = helmColor;
      ctx.beginPath();
      ctx.arc(0, -12, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#2f3b4b";
      ctx.fillRect(-4, -12, 8, 4);

      if (helmItem.rarity === "epic" || helmItem.rarity === "rare") {
        ctx.fillStyle = helmItem.rarity === "epic" ? "#c995ff" : "#88cfff";
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(4, -12);
        ctx.lineTo(-4, -12);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = hurtFlash > 0.2 ? "#ffd6d6" : "#f2c4a3";
      ctx.beginPath();
      ctx.arc(0, -11, 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#6b4a2f";
      ctx.beginPath();
      ctx.arc(0, -13, 6.5, Math.PI, 0);
      ctx.fill();
    }

    ctx.strokeStyle = "#d8c0ae";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, -1);
    ctx.lineTo(-12, 4);
    ctx.moveTo(8, -1);
    ctx.lineTo(12, 4);
    ctx.stroke();

    if (armorItem && armorWeight !== "light") {
      ctx.fillStyle = "rgba(235,241,249,0.55)";
      ctx.beginPath();
      ctx.arc(-7, -4, 3, 0, Math.PI * 2);
      ctx.arc(7, -4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(-8, 0);
    ctx.rotate(-0.18);
    ctx.fillStyle = alphaColor(mixColor(armorColor, "#2d394c", 0.45), 0.92);
    ctx.beginPath();
    ctx.moveTo(-5, -7);
    ctx.lineTo(4, -5);
    ctx.lineTo(6, 2);
    ctx.lineTo(0, 9);
    ctx.lineTo(-7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(236,242,248,0.34)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(2, -3);
    ctx.lineTo(3, 1);
    ctx.lineTo(-1, 5);
    ctx.lineTo(-5, 2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    if (armorItem?.rarity === "rare" || armorItem?.rarity === "epic") {
      ctx.strokeStyle = armorItem.rarity === "epic" ? "rgba(226,194,255,0.75)" : "rgba(185,225,255,0.68)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -3);
      ctx.lineTo(0, 8);
      ctx.lineTo(7, -3);
      ctx.stroke();
    }

    this._drawWeapon(ctx, aim);

    if (this.equip?.ring) {
      ctx.fillStyle = "rgba(170,220,255,0.22)";
      ctx.beginPath();
      ctx.arc(0, -1, 15, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.equip?.trinket) {
      ctx.fillStyle = "rgba(210,160,255,0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.equip.trinket.color || "#d9dee8";
      ctx.beginPath();
      ctx.arc(0, 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class Enemy {
  constructor(x = 0, y = 0, level = 1, kind = "blob", seed = 1, elite = false, boss = false) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;

    this.level = Math.max(1, level | 0);
    this.kind = kind;
    this.seed = seed | 0;

    this.elite = !!elite;
    this.boss = !!boss;

    this.alive = true;
    this.dead = false;

    this.radius = 11;
    this.r = this.radius;

    this.moveSpeed = 52 + this.level * 1.4;
    this.speed = this.moveSpeed;
    this.touchDps = 4 + this.level * 0.4;

    this.hp = 26 + this.level * 10;
    this.maxHp = this.hp;

    this.vx = 0;
    this.vy = 0;

    this.leashRadius = 0;
    this.aggroRadius = 0;
    this.forgetRadius = 0;
    this.returnSpeedMul = 0.85;

    this.patrolX = x;
    this.patrolY = y;
    this.patrolTimer = 0.4 + ((seed % 100) / 100) * 1.2;
    this.alertT = 0;

    this.attackCd = 0;
    this.rangedCd = 0;
    this.lungeT = 0;
    this.recoverT = 0;
    this.specialCd = 0;
    this.hitFlashT = 0;
    this.staggerT = 0;
    this.slowT = 0;

    this.colorA = "#d95b5b";
    this.colorB = "#8c2f38";

    this._initByKind();
    this._initLeash();
  }

  _initByKind() {
    if (this.kind === "blob") {
      this.radius = 11;
      this.hp *= 1.0;
      this.moveSpeed *= 0.95;
      this.colorA = "#db5e63";
      this.colorB = "#96313c";
    } else if (this.kind === "stalker") {
      this.radius = 10;
      this.hp *= 0.92;
      this.moveSpeed *= 1.18;
      this.touchDps *= 1.05;
      this.colorA = "#7c5cd8";
      this.colorB = "#402b85";
    } else if (this.kind === "wolf") {
      this.radius = 11;
      this.hp *= 0.9;
      this.moveSpeed *= 1.28;
      this.touchDps *= 1.08;
      this.colorA = "#8b8d96";
      this.colorB = "#4e5058";
    } else if (this.kind === "scout") {
      this.radius = 9;
      this.hp *= 0.88;
      this.moveSpeed *= 1.24;
      this.colorA = "#58b96a";
      this.colorB = "#317245";
    } else if (this.kind === "caster") {
      this.radius = 10;
      this.hp *= 0.95;
      this.moveSpeed *= 0.96;
      this.touchDps *= 0.9;
      this.rangedCd = 1.7;
      this.colorA = "#63a9ff";
      this.colorB = "#315e8f";
    } else if (this.kind === "brute") {
      this.radius = 14;
      this.hp *= 1.45;
      this.moveSpeed *= 0.76;
      this.touchDps *= 1.35;
      this.colorA = "#b08d54";
      this.colorB = "#72552b";
    } else if (this.kind === "ashling") {
      this.radius = 11;
      this.hp *= 1.08;
      this.moveSpeed *= 1.02;
      this.touchDps *= 1.08;
      this.colorA = "#8a7c67";
      this.colorB = "#564d41";
    } else if (this.kind === "wisp") {
      this.radius = 8;
      this.hp *= 0.72;
      this.moveSpeed *= 1.38;
      this.touchDps *= 0.72;
      this.rangedCd = 1.1;
      this.colorA = "#8fe8ff";
      this.colorB = "#355f9d";
    } else if (this.kind === "sentinel") {
      this.radius = 15;
      this.hp *= 1.72;
      this.moveSpeed *= 0.64;
      this.touchDps *= 1.28;
      this.colorA = "#c8c0a2";
      this.colorB = "#5b6470";
    } else if (this.kind === "thorn") {
      this.radius = 10;
      this.hp *= 0.98;
      this.moveSpeed *= 1.02;
      this.touchDps *= 0.82;
      this.rangedCd = 1.3;
      this.colorA = "#79c95f";
      this.colorB = "#2f6b39";
    } else if (this.kind === "duelist") {
      this.radius = 10;
      this.hp *= 0.96;
      this.moveSpeed *= 1.34;
      this.touchDps *= 1.18;
      this.colorA = "#d8d2c4";
      this.colorB = "#6c4b8f";
    } else if (this.kind === "mender") {
      this.radius = 10;
      this.hp *= 1.05;
      this.moveSpeed *= 0.88;
      this.touchDps *= 0.72;
      this.rangedCd = 1.8;
      this.specialCd = 2.2;
      this.colorA = "#9ee6a5";
      this.colorB = "#326d53";
    } else if (this.kind === "dragon") {
      this.radius = 30;
      this.hp *= 4.8;
      this.moveSpeed *= 0.72;
      this.touchDps *= 2.15;
      this.rangedCd = 1.3;
      this.colorA = "#b73535";
      this.colorB = "#5d1721";
    }

    if (this.elite) {
      this.hp *= 1.28;
      this.maxHp = this.hp;
      this.touchDps *= 1.14;
    }

    if (this.boss) {
      this.hp *= 1.6;
      this.maxHp = this.hp;
      this.touchDps *= 1.28;
    }

    this.hp = Math.round(this.hp);
    this.maxHp = this.hp;
    this.touchDps = Math.max(1, Math.round(this.touchDps));
    this.moveSpeed = Math.max(18, Math.round(this.moveSpeed));
    this.speed = this.moveSpeed;
    this.r = this.radius;
  }

  _initLeash() {
    if (this.kind === "wolf" || this.kind === "scout" || this.kind === "stalker" || this.kind === "duelist") {
      this.leashRadius = 210;
      this.aggroRadius = 180;
      this.forgetRadius = 280;
      this.returnSpeedMul = 0.95;
    } else if (this.kind === "caster" || this.kind === "wisp" || this.kind === "thorn" || this.kind === "mender") {
      this.leashRadius = 190;
      this.aggroRadius = this.kind === "wisp" ? 250 : 220;
      this.forgetRadius = this.kind === "wisp" ? 340 : 300;
      this.returnSpeedMul = 0.85;
    } else if (this.kind === "brute" || this.kind === "sentinel") {
      this.leashRadius = 240;
      this.aggroRadius = 200;
      this.forgetRadius = 300;
      this.returnSpeedMul = 0.82;
    } else if (this.kind === "dragon") {
      this.leashRadius = 520;
      this.aggroRadius = 420;
      this.forgetRadius = 700;
      this.returnSpeedMul = 0.72;
    } else {
      this.leashRadius = 200;
      this.aggroRadius = 190;
      this.forgetRadius = 290;
      this.returnSpeedMul = 0.86;
    }

    if (this.elite) {
      this.leashRadius += 35;
      this.aggroRadius += 20;
      this.forgetRadius += 35;
    }

    if (this.boss) {
      this.leashRadius += 70;
      this.aggroRadius += 50;
      this.forgetRadius += 70;
    }
  }

  xpValue() {
    let base = 4 + this.level * 2;
    if (this.elite) base *= 2;
    if (this.boss) base *= 3;
    return Math.round(base);
  }

  lootBonus() {
    let b = this.elite ? 4 : 0;
    if (this.boss) b += 8;
    return b;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlashT = 0.16;
    this.staggerT = Math.max(this.staggerT || 0, this.boss ? 0.03 : this.elite ? 0.05 : 0.08);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.dead = true;
    } else {
      this.alertT = Math.max(this.alertT, 1.8);
    }
  }

  _pickNewPatrolPoint() {
    const r = Math.max(22, this.leashRadius * 0.45);
    const a = ((this.seed * 0.013) + performance.now() * 0.00012 + Math.random()) % (Math.PI * 2);
    this.patrolX = this.spawnX + Math.cos(a) * (Math.random() * r);
    this.patrolY = this.spawnY + Math.sin(a) * (Math.random() * r);
  }

  update(dt, hero, world, game) {
    if (!this.alive) return;

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    this.lungeT = Math.max(0, (this.lungeT || 0) - dt);
    this.recoverT = Math.max(0, (this.recoverT || 0) - dt);
    this.specialCd = Math.max(0, (this.specialCd || 0) - dt);
    this.hitFlashT = Math.max(0, (this.hitFlashT || 0) - dt);
    this.staggerT = Math.max(0, (this.staggerT || 0) - dt);
    this.slowT = Math.max(0, (this.slowT || 0) - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    this.patrolTimer -= dt;

    const slowMul = this.slowT > 0 ? 0.72 : 1;

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const dir = { x: dx / d, y: dy / d };

    const hx = this.x - this.spawnX;
    const hy = this.y - this.spawnY;
    const homeDist = Math.hypot(hx, hy) || 0.001;

    const homeDx = this.spawnX - this.x;
    const homeDy = this.spawnY - this.y;
    const homeDir = norm(homeDx, homeDy);

    const inAggro = d <= this.aggroRadius;
    if (inAggro) this.alertT = Math.max(this.alertT, 1.4);

    const shouldReturnHome = d > this.forgetRadius || homeDist > this.leashRadius;

    if (shouldReturnHome) {
      this.vx = homeDir.x * this.moveSpeed * this.returnSpeedMul * slowMul;
      this.vy = homeDir.y * this.moveSpeed * this.returnSpeedMul * slowMul;

      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;

      if (world?.canWalk?.(nx, this.y)) this.x = nx;
      if (world?.canWalk?.(this.x, ny)) this.y = ny;
      return;
    }

    const shouldChase = inAggro || this.alertT > 0.01;

    if (this.staggerT > 0) {
      this.vx *= 0.25;
      this.vy *= 0.25;
      return;
    }

    if (!shouldChase) {
      if (this.patrolTimer <= 0 || Math.hypot(this.patrolX - this.x, this.patrolY - this.y) < 12) {
        this.patrolTimer = 1.5 + Math.random() * 2.8;
        this._pickNewPatrolPoint();
      }

      const pdx = this.patrolX - this.x;
      const pdy = this.patrolY - this.y;
      const pdir = norm(pdx, pdy);

      const patrolSpeed = this.moveSpeed * (this.kind === "wolf" || this.kind === "duelist" ? 0.34 : this.kind === "brute" || this.kind === "sentinel" ? 0.22 : 0.28) * slowMul;

      this.vx = pdir.x * patrolSpeed;
      this.vy = pdir.y * patrolSpeed;

      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;
      if (world?.canWalk?.(nx, this.y)) this.x = nx;
      if (world?.canWalk?.(this.x, ny)) this.y = ny;
      return;
    }

    const rangedKind = this.kind === "caster" || this.kind === "dragon" || this.kind === "wisp" || this.kind === "thorn" || this.kind === "mender";

    if (rangedKind) {
      const preferred = this.kind === "dragon" ? 210 : this.kind === "wisp" ? 150 : this.kind === "thorn" ? 190 : 160;
      const far = preferred + 35;
      const close = preferred - 45;

      if (d > far) {
        this.vx = dir.x * this.moveSpeed * slowMul;
        this.vy = dir.y * this.moveSpeed * slowMul;
      } else if (d < close) {
        this.vx = -dir.x * this.moveSpeed * 0.82 * slowMul;
        this.vy = -dir.y * this.moveSpeed * 0.82 * slowMul;
      } else {
        const orbit = ((this.seed & 1) ? 1 : -1) * (this.kind === "wisp" ? 1.05 : 0.65);
        this.vx = -dir.y * this.moveSpeed * orbit * slowMul;
        this.vy = dir.x * this.moveSpeed * orbit * slowMul;
      }

      if (this.kind === "mender" && this.specialCd <= 0 && game?.enemies) {
        let healed = 0;
        for (const ally of game.enemies) {
          if (!ally?.alive || ally === this || (ally.hp || 0) >= (ally.maxHp || 1)) continue;
          const ax = ally.x - this.x;
          const ay = ally.y - this.y;
          if (ax * ax + ay * ay > 185 * 185) continue;
          ally.hp = Math.min(ally.maxHp, ally.hp + Math.max(5, Math.round(this.level * 1.1)));
          healed++;
          if (healed >= 3) break;
        }
        this.specialCd = healed ? 3.6 : 1.2;
      }

      const range = this.kind === "dragon" ? 520 : this.kind === "wisp" ? 300 : this.kind === "thorn" ? 330 : 260;
      if (this.rangedCd <= 0 && d < range && game?.projectiles) {
        const shotDir = norm(dx, dy);
        const spread = this.kind === "thorn" ? [-0.18, 0, 0.18] : [0];
        for (const turn of spread) {
          const ca = Math.cos(turn);
          const sa = Math.sin(turn);
          const sx = shotDir.x * ca - shotDir.y * sa;
          const sy = shotDir.x * sa + shotDir.y * ca;
          const shotSpeed = this.kind === "dragon" ? 245 : this.kind === "wisp" ? 220 : this.kind === "thorn" ? 175 : 155;
          const dmg = this.kind === "dragon" ? Math.max(14, Math.round(this.level * 1.15)) : this.kind === "wisp" ? Math.max(4, Math.round(this.level * 0.48)) : this.kind === "thorn" ? Math.max(4, Math.round(this.level * 0.52)) : Math.max(5, Math.round(this.level * 0.60));

          game.projectiles.push(
            new Projectile(
              this.x + sx * (this.radius + 4),
              this.y + sy * (this.radius + 4),
              sx * shotSpeed,
              sy * shotSpeed,
              dmg,
              this.kind === "wisp" ? 1.25 : 1.7,
              this.level,
              {
                friendly: false,
                color: this.kind === "dragon" ? "rgba(255,105,50,0.94)" : this.kind === "wisp" ? "rgba(124,232,255,0.90)" : this.kind === "thorn" ? "rgba(128,218,91,0.90)" : this.kind === "mender" ? "rgba(150,235,165,0.90)" : "rgba(115,176,255,0.92)",
                radius: this.kind === "dragon" ? 7 : this.kind === "wisp" ? 3.5 : 4,
                hitRadius: this.kind === "dragon" ? 18 : this.kind === "wisp" ? 8 : 10,
              }
            )
          );
        }
        this.rangedCd = this.kind === "dragon" ? 1.55 : this.kind === "wisp" ? 1.05 : this.kind === "thorn" ? 2.35 : this.kind === "mender" ? 2.6 : 2.2;
      }
    } else {
      const meleeRange = (this.radius || 12) + (hero.radius || hero.r || 12) + 24;
      if (this.lungeT > 0) {
        this.vx = dir.x * this.moveSpeed * 1.95 * slowMul;
        this.vy = dir.y * this.moveSpeed * 1.95 * slowMul;
      } else if (this.recoverT > 0) {
        this.vx = -dir.x * this.moveSpeed * 0.30 * slowMul;
        this.vy = -dir.y * this.moveSpeed * 0.30 * slowMul;
      } else if (d <= meleeRange && this.attackCd <= 0) {
        this.lungeT = 0.20;
        this.recoverT = 0.44;
        this.attackCd = this.kind === "sentinel" ? 1.22 : this.kind === "brute" ? 1.05 : this.kind === "duelist" ? 0.58 : this.kind === "wolf" ? 0.72 : 0.86;
        const lungeMul = this.kind === "duelist" ? 2.35 : this.kind === "sentinel" ? 1.38 : 1.75;
        this.vx = dir.x * this.moveSpeed * lungeMul * slowMul;
        this.vy = dir.y * this.moveSpeed * lungeMul * slowMul;
      } else if (d < meleeRange * 0.78) {
        this.vx = -dir.x * this.moveSpeed * 0.42 * slowMul;
        this.vy = -dir.y * this.moveSpeed * 0.42 * slowMul;
      } else {
        this.vx = dir.x * this.moveSpeed * slowMul;
        this.vy = dir.y * this.moveSpeed * slowMul;
      }
    }

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (world?.canWalk?.(nx, this.y)) this.x = nx;
    if (world?.canWalk?.(this.x, ny)) this.y = ny;
  }

  draw(ctx) {
    const t = performance.now() * 0.001;
    const bob = Math.sin((t + this.seed * 0.001) * (this.kind === "wolf" ? 12 : 8)) * 0.8;
    const r = this.radius;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, r + 3, r * 1.05, Math.max(4, r * 0.34), 0, 0, Math.PI * 2);
    ctx.fill();

    const aura = this._ambientAuraColor();
    if (aura) {
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, r + (this.boss ? 16 : this.elite ? 11 : 7) + Math.sin(t * 2.8 + this.seed) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.kind === "wolf") this._drawWolf(ctx);
    else if (this.kind === "brute") this._drawBrute(ctx);
    else if (this.kind === "caster") this._drawCaster(ctx, t);
    else if (this.kind === "scout") this._drawScout(ctx);
    else if (this.kind === "stalker") this._drawStalker(ctx);
    else if (this.kind === "ashling") this._drawAshling(ctx, t);
    else if (this.kind === "wisp") this._drawWisp(ctx, t);
    else if (this.kind === "sentinel") this._drawSentinel(ctx, t);
    else if (this.kind === "thorn") this._drawThorn(ctx, t);
    else if (this.kind === "duelist") this._drawDuelist(ctx, t);
    else if (this.kind === "mender") this._drawMender(ctx, t);
    else if (this.kind === "dragon") this._drawDragon(ctx, t);
    else this._drawBlob(ctx, t);

    if ((this.lungeT || 0) > 0) {
      ctx.strokeStyle = "rgba(255,210,130,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.16, r * 0.78, Math.PI * 1.06, Math.PI * 1.92);
    ctx.stroke();

    if ((this.attackCd || 0) <= 0.14 && (this.alertT || 0) > 0.05 && !this.boss) {
      ctx.strokeStyle = "rgba(255,168,120,0.42)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 11, 0, Math.PI * 2);
      ctx.stroke();
    }

    if ((this.hitFlashT || 0) > 0) {
      ctx.globalAlpha = Math.min(0.55, (this.hitFlashT || 0) * 4.0);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = this.boss ? "rgba(255,214,170,0.22)" : this.elite ? "rgba(255,240,170,0.16)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = this.boss ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
    ctx.stroke();

    if (this.elite || this.boss) {
      ctx.strokeStyle = this.boss ? "rgba(255,150,150,0.48)" : "rgba(255,226,130,0.42)";
      ctx.lineWidth = this.boss ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();

      if (this.affix) {
        ctx.fillStyle = "rgba(8,10,14,0.68)";
        const labelW = Math.max(48, this.affix.length * 6 + 14);
        ctx.fillRect(-labelW * 0.5, -r - 27, labelW, 15);
        ctx.fillStyle = "#ffe69a";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.affix, 0, -r - 16);
      }
    }

    if ((this.hp || 0) < (this.maxHp || 1) || this.boss) {
      const bw = this.boss ? 58 : this.elite ? 40 : 34;
      const bh = this.boss ? 7 : 4;
      const y = r + 12;
      const frac = Math.max(0, Math.min(1, (this.hp || 0) / Math.max(1, this.maxHp || 1)));

      ctx.fillStyle = "rgba(0,0,0,0.58)";
      ctx.fillRect(-bw * 0.5 - 1, y - 1, bw + 2, bh + 2);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(-bw * 0.5, y, bw, bh);
      ctx.fillStyle = this.boss ? "#ff8a5c" : this.elite ? "#ffd36e" : "#cf4d5f";
      ctx.fillRect(-bw * 0.5, y, bw * frac, bh);
      ctx.strokeStyle = "rgba(255,255,255,0.24)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-bw * 0.5 + 0.5, y + 0.5, bw - 1, bh - 1);
    }

    if (this.elite || this.boss) {
      const badgeY = -r - (this.affix ? 36 : 18);
      const badgeW = this.boss ? 42 : 34;
      ctx.fillStyle = "rgba(8,10,14,0.78)";
      ctx.fillRect(-badgeW * 0.5, badgeY - 10, badgeW, 12);
      ctx.strokeStyle = this.boss ? "rgba(255,150,150,0.40)" : "rgba(255,226,130,0.32)";
      ctx.strokeRect(-badgeW * 0.5 + 0.5, badgeY - 9.5, badgeW - 1, 11);
      ctx.fillStyle = this.boss ? "#ffb6a8" : "#ffe69a";
      ctx.font = "bold 9px Arial";
      ctx.textAlign = "center";
      ctx.fillText(this.boss ? `BOSS ${this.level}` : `ELITE ${this.level}`, 0, badgeY - 0.5);
    }

    ctx.restore();
  }

  _ambientAuraColor() {
    if (this.boss) return alphaColor(this.colorA || "#ff8a5c", this.kind === "dragon" ? 0.16 : 0.12);
    if (this.elite) return alphaColor(this.colorA || "#ffd36e", 0.09);
    if (this.kind === "wisp") return "rgba(143,232,255,0.12)";
    if (this.kind === "caster" || this.kind === "mender") return "rgba(136,207,255,0.08)";
    if (this.kind === "thorn") return "rgba(126,201,95,0.08)";
    if (this.kind === "ashling") return "rgba(194,134,92,0.08)";
    return "";
  }

  _drawEyes(ctx, y = -2, glow = "#fff") {
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(-3, y, 1.2, 0, Math.PI * 2);
    ctx.arc(3, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawDragon(ctx, t) {
    const flap = Math.sin(t * 5 + this.seed) * 4;

    ctx.fillStyle = "rgba(40,8,12,0.28)";
    ctx.beginPath();
    ctx.ellipse(-20, 1, 25, 13 + flap * 0.2, -0.45, 0, Math.PI * 2);
    ctx.ellipse(20, 1, 25, 13 - flap * 0.2, 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(-38, -22 + flap);
    ctx.lineTo(-26, 10);
    ctx.closePath();
    ctx.moveTo(10, -5);
    ctx.lineTo(38, -22 - flap);
    ctx.lineTo(26, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.ellipse(0, 4, this.radius * 0.78, this.radius * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.ellipse(0, -8, this.radius * 0.58, this.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffb06e";
    ctx.beginPath();
    ctx.moveTo(-7, -20);
    ctx.lineTo(-2, -31);
    ctx.lineTo(1, -20);
    ctx.moveTo(7, -20);
    ctx.lineTo(12, -30);
    ctx.lineTo(11, -18);
    ctx.fill();

    this._drawEyes(ctx, -10, "#ffd36e");
  }

  _drawBlob(ctx, t) {
    const pulse = 1 + Math.sin(t * 6 + this.seed) * 0.03;
    ctx.save();
    ctx.scale(pulse, 1 / pulse);

    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.arc(0, 2, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.arc(0, -1, this.radius * 0.86, 0, Math.PI * 2);
    ctx.fill();

    this._drawEyes(ctx, -1, "#fff6f6");
    ctx.restore();
  }

  _drawWolf(ctx) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.ellipse(-1, 1, this.radius + 5, this.radius - 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.ellipse(2, -1, this.radius + 1, this.radius - 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.lineTo(-2, -16);
    ctx.lineTo(1, -7);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(2, -7);
    ctx.lineTo(8, -15);
    ctx.lineTo(7, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f1f3f6";
    ctx.fillRect(7, -1, 8, 2);
    this._drawEyes(ctx, -3, "#ffffff");

    ctx.strokeStyle = this.colorB;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.lineTo(-16, 0);
    ctx.stroke();
  }

  _drawBrute(ctx) {
    ctx.fillStyle = this.colorB;
    ctx.fillRect(-this.radius - 1, -this.radius + 1, this.radius * 2 + 2, this.radius * 2);

    ctx.fillStyle = this.colorA;
    ctx.fillRect(-this.radius + 1, -this.radius - 1, this.radius * 2 - 2, this.radius * 2 - 1);

    ctx.fillStyle = "#d8c8a3";
    ctx.fillRect(-this.radius + 1, -2, 4, 3);
    ctx.fillRect(this.radius - 5, -2, 4, 3);

    ctx.fillStyle = "#8a6e42";
    ctx.fillRect(-this.radius - 4, -3, 4, 10);
    ctx.fillRect(this.radius, -3, 4, 10);

    this._drawEyes(ctx, -5, "#fff8da");
  }

  _drawCaster(ctx, t) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.arc(0, -4, this.radius - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.moveTo(-this.radius, this.radius - 1);
    ctx.lineTo(this.radius, this.radius - 1);
    ctx.lineTo(0, -this.radius + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(160,220,255,0.22)";
    ctx.beginPath();
    ctx.arc(0, -1, this.radius + 4 + Math.sin(t * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#dff3ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.radius + 2, -2);
    ctx.lineTo(this.radius + 2, 10);
    ctx.stroke();

    ctx.fillStyle = "#bfe8ff";
    ctx.beginPath();
    ctx.arc(this.radius + 2, -4, 3.5, 0, Math.PI * 2);
    ctx.fill();

    this._drawEyes(ctx, -5, "#dff6ff");
  }

  _drawScout(ctx) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.arc(0, -2, this.radius * 0.84, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#d6f2da";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.radius + 2, -3);
    ctx.lineTo(this.radius + 2, 10);
    ctx.stroke();

    ctx.fillStyle = "#a8e0b0";
    ctx.beginPath();
    ctx.moveTo(this.radius + 2, -6);
    ctx.lineTo(this.radius + 9, -3);
    ctx.lineTo(this.radius + 2, 0);
    ctx.closePath();
    ctx.fill();

    this._drawEyes(ctx, -2, "#ffffff");
  }

  _drawStalker(ctx) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.arc(0, -2, this.radius * 0.82, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.lineTo(5, 6);
    ctx.moveTo(5, -7);
    ctx.lineTo(-6, 6);
    ctx.stroke();

    ctx.fillStyle = "#e7dcff";
    ctx.fillRect(this.radius - 1, -1, 6, 2);
    this._drawEyes(ctx, -2, "#f2e9ff");
  }

  _drawAshling(ctx, t) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.arc(0, 1, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.arc(0, -2, this.radius * 0.86, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,170,110,${0.18 + Math.sin(t * 7) * 0.05})`;
    ctx.beginPath();
    ctx.arc(0, -1, this.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();

    this._drawEyes(ctx, -2, "#ffe7cf");
  }

  _drawWisp(ctx, t) {
    const glow = 1 + Math.sin(t * 8 + this.seed) * 0.12;
    ctx.fillStyle = "rgba(124,232,255,0.18)";
    ctx.beginPath();
    ctx.arc(0, -1, this.radius * 2.0 * glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.ellipse(0, 1, this.radius * 0.82, this.radius * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.arc(0, -3, this.radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(220,250,255,0.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -1, this.radius + 4, t * 2, t * 2 + Math.PI * 1.35);
    ctx.stroke();
    this._drawEyes(ctx, -4, "#ecfbff");
  }

  _drawSentinel(ctx, t) {
    ctx.fillStyle = this.colorB;
    ctx.fillRect(-this.radius - 2, -this.radius + 1, this.radius * 2 + 4, this.radius * 2 + 2);

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius - 4);
    ctx.lineTo(this.radius + 4, -this.radius + 3);
    ctx.lineTo(this.radius + 2, this.radius + 6);
    ctx.lineTo(0, this.radius + 10);
    ctx.lineTo(-this.radius - 2, this.radius + 6);
    ctx.lineTo(-this.radius - 4, -this.radius + 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(-this.radius + 3, -this.radius + 4, this.radius * 2 - 6, 3);
    ctx.fillRect(-2, -this.radius + 2, 4, this.radius * 2);

    ctx.fillStyle = "#e7dbc0";
    ctx.fillRect(-5, -5, 3, 3);
    ctx.fillRect(2, -5, 3, 3);

    ctx.strokeStyle = `rgba(255,230,165,${0.22 + Math.sin(t * 3) * 0.06})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-this.radius - 4.5, -this.radius - 4.5, this.radius * 2 + 9, this.radius * 2 + 14);
  }

  _drawThorn(ctx, t) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius - 6);
    ctx.lineTo(this.radius + 8, 2);
    ctx.lineTo(4, this.radius + 7);
    ctx.lineTo(-this.radius - 8, 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * 0.82, this.radius * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#d9ffc4";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5, -this.radius - 1);
      ctx.lineTo(i * 9, -this.radius - 8 - Math.sin(t * 5 + i) * 2);
      ctx.stroke();
    }
    this._drawEyes(ctx, -3, "#efffe6");
  }

  _drawDuelist(ctx, t) {
    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.ellipse(0, 1, this.radius * 0.86, this.radius * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius - 4);
    ctx.lineTo(this.radius - 1, 2);
    ctx.lineTo(3, this.radius + 4);
    ctx.lineTo(-this.radius + 1, 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#f2e8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.radius - 1, -6);
    ctx.lineTo(this.radius + 12 + Math.sin(t * 9) * 2, -10);
    ctx.stroke();

    ctx.fillStyle = "#2b2440";
    ctx.fillRect(-5, -5, 10, 3);
    this._drawEyes(ctx, -4, "#ffffff");
  }

  _drawMender(ctx, t) {
    ctx.fillStyle = "rgba(150,235,165,0.18)";
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 8 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorB;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.colorA;
    ctx.beginPath();
    ctx.arc(0, -2, this.radius * 0.80, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e6ffe7";
    ctx.fillRect(-2, -9, 4, 14);
    ctx.fillRect(-7, -4, 14, 4);
    this._drawEyes(ctx, -3, "#ffffff");
  }
}

export class Projectile {
  constructor(x, y, vx, vy, dmg, life, level, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.life = life;
    this.maxLife = life;
    this.level = level;

    this.friendly = !!opts.friendly;
    this.nova = !!opts.nova;
    this.color = opts.color || "#ffffff";
    this.radius = opts.radius || 4;
    this.hitRadius = opts.hitRadius || this.radius + 2;
    this.ignoreWalls = !!opts.ignoreWalls;
    this.pierce = opts.pierce || 0;
    this.slow = opts.slow || 0;
    this.knockback = opts.knockback || 0;
    this.burstRadius = opts.burstRadius || 0;
    this.burstColor = opts.burstColor || opts.color || "#ffffff";
    this.burstSlow = opts.burstSlow || 0;

    this.alive = true;
  }

  update(dt, world) {
    if (!this.alive) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    if (!this.nova) {
      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;

      if (!this.ignoreWalls && world?.canWalk && !world.canWalk(nx, ny)) {
        this.alive = false;
        return;
      }

      this.x = nx;
      this.y = ny;
    } else {
      this.hitRadius = lerp(this.hitRadius, this.hitRadius + 40, 0.15);
      this.radius = Math.max(this.radius, this.hitRadius * 0.18);
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.nova) {
      const alpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = alpha * 0.9;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, this.hitRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.hitRadius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(-this.radius * 0.25, -this.radius * 0.25, this.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class Loot {
  constructor(x, y, kind, data = {}) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.data = data;
    this.radius = 10;
    this.alive = true;
    this.t = 0;
  }

  update(dt, hero) {
    this.t += dt;

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d = Math.hypot(dx, dy) || 0.001;

    const pullRange = this.kind === "gear" ? 132 : 96;
    if (d < pullRange) {
      const dir = { x: dx / d, y: dy / d };
      const speed = 44 + (pullRange - d) * (this.kind === "gear" ? 3.0 : 3.5);
      this.x += dir.x * speed * dt;
      this.y += dir.y * speed * dt;
    }

    const rr = this.radius + (hero.radius || 12);
    if (dx * dx + dy * dy <= rr * rr) {
      this.alive = false;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.t * 6) * 2;
    const pulse = 1 + Math.sin(this.t * 5) * 0.08;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === "gold") {
      ctx.fillStyle = "rgba(255,210,92,0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, 10.5 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#efc24a";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,244,170,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fff0a8";
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 2, 0, Math.PI * 2);
      ctx.fill();

      const amount = this.data?.amount || 0;
      if (amount >= 10) {
        ctx.fillStyle = "rgba(5,8,12,0.70)";
        ctx.fillRect(-12, -21, 24, 11);
        ctx.fillStyle = "#ffe69a";
        ctx.font = "bold 8px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`${amount}g`, 0, -13);
      }
    } else if (this.kind === "potion") {
      const mana = this.data?.potionType === "mana";
      ctx.fillStyle = mana ? "rgba(136,207,255,0.18)" : "rgba(255,143,160,0.18)";
      ctx.beginPath();
      ctx.arc(0, 2, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = mana ? "#6aa6ff" : "#df5b72";
      ctx.beginPath();
      ctx.arc(0, 2, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = mana ? "rgba(206,232,255,0.62)" : "rgba(255,221,227,0.56)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 2, 8.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#d8cdb6";
      ctx.fillRect(-2, -6, 4, 5);

      ctx.fillStyle = "rgba(5,8,12,0.68)";
      ctx.fillRect(-14, -22, 28, 11);
      ctx.fillStyle = mana ? "#d7ebff" : "#ffd3d7";
      ctx.font = "bold 8px Arial";
      ctx.textAlign = "center";
      ctx.fillText(mana ? "MANA" : "HP", 0, -14);
    } else if (this.kind === "gear") {
      const color = this.data?.color || "#d9dee8";
      const rarity = this.data?.rarity || "common";
      const beamAlpha = rarity === "epic" ? 0.24 : rarity === "rare" ? 0.18 : rarity === "uncommon" ? 0.12 : 0;
      if (beamAlpha > 0) {
        const beam = ctx.createLinearGradient(0, -38, 0, 20);
        beam.addColorStop(0, alphaColor(color, 0));
        beam.addColorStop(0.3, alphaColor(color, beamAlpha));
        beam.addColorStop(1, alphaColor(color, 0));
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(-8, 14);
        ctx.lineTo(-18, -34);
        ctx.lineTo(18, -34);
        ctx.lineTo(8, 14);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = rarity === "epic" ? 0.34 : rarity === "rare" ? 0.25 : 0.18;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = alphaColor(color, 0.14);
      ctx.beginPath();
      ctx.arc(0, 0, 11.5 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = alphaColor(color, rarity === "epic" ? 0.80 : 0.52);
      ctx.lineWidth = rarity === "epic" ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 12);
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();

      ctx.strokeStyle = rarity === "epic" ? "rgba(255,240,170,0.88)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#f8fbff";
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 4);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();

      if (rarity === "epic" || rarity === "rare" || rarity === "uncommon") {
        ctx.fillStyle = "rgba(5,8,12,0.72)";
        ctx.fillRect(-24, -27, 48, 13);
        ctx.fillStyle = color;
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        ctx.fillText(rarity.toUpperCase(), 0, -17);
      }

      if (rarity === "epic") {
        ctx.strokeStyle = "rgba(255,228,168,0.78)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(3, -6);
        ctx.lineTo(11, -6);
        ctx.lineTo(5, -1);
        ctx.lineTo(7, 8);
        ctx.lineTo(0, 3);
        ctx.lineTo(-7, 8);
        ctx.lineTo(-5, -1);
        ctx.lineTo(-11, -6);
        ctx.lineTo(-3, -6);
        ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
