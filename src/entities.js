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

export function makeGear(slot, level = 1, rarity = "common", seed = 1) {
  const scale =
    rarity === "epic" ? 1.9 :
    rarity === "rare" ? 1.45 :
    rarity === "uncommon" ? 1.18 :
    1.0;

  const lvl = Math.max(1, level | 0);
  const rollA = ((seed * 17) % 1000) / 1000;
  const rollB = ((seed * 31) % 1000) / 1000;

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

  return {
    slot,
    level: lvl,
    rarity,
    name: makeName(slot, rarity, seed % 97),
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
    this.inventory = [];
    this.equip = {};
    this.potions = { hp: 2, mana: 1 };

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
    const out = {
      maxHp: 100 + (this.level - 1) * 10,
      maxMana: 60 + (this.level - 1) * 5,
      dmg: 8 + (this.level - 1) * 2,
      armor: 0,
      crit: 0.05,
      critMult: 1.6,
      move: 0,
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

  getMoveSpeed() {
    const st = this.getStats();
    let speed = 150 + st.move * 160;
    if ((this.state?.dashT || 0) > 0) speed *= 1.45;
    if (this.state?.sailing) speed *= 1.18;
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

    ctx.save();
    ctx.translate(aim.x * 7, aim.y * 1);
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

    ctx.fillStyle = "rgba(128,42,52,0.88)";
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(-11, 10);
    ctx.lineTo(-3, 12);
    ctx.lineTo(4, 3);
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
    if (this.kind === "wolf" || this.kind === "scout" || this.kind === "stalker") {
      this.leashRadius = 210;
      this.aggroRadius = 180;
      this.forgetRadius = 280;
      this.returnSpeedMul = 0.95;
    } else if (this.kind === "caster") {
      this.leashRadius = 190;
      this.aggroRadius = 220;
      this.forgetRadius = 300;
      this.returnSpeedMul = 0.85;
    } else if (this.kind === "brute") {
      this.leashRadius = 240;
      this.aggroRadius = 200;
      this.forgetRadius = 300;
      this.returnSpeedMul = 0.82;
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
    this.alertT = Math.max(0, this.alertT - dt);
    this.patrolTimer -= dt;

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
      this.vx = homeDir.x * this.moveSpeed * this.returnSpeedMul;
      this.vy = homeDir.y * this.moveSpeed * this.returnSpeedMul;

      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;

      if (world?.canWalk?.(nx, this.y)) this.x = nx;
      if (world?.canWalk?.(this.x, ny)) this.y = ny;
      return;
    }

    const shouldChase = inAggro || this.alertT > 0.01;

    if (!shouldChase) {
      if (this.patrolTimer <= 0 || Math.hypot(this.patrolX - this.x, this.patrolY - this.y) < 12) {
        this.patrolTimer = 1.5 + Math.random() * 2.8;
        this._pickNewPatrolPoint();
      }

      const pdx = this.patrolX - this.x;
      const pdy = this.patrolY - this.y;
      const pdir = norm(pdx, pdy);

      const patrolSpeed = this.moveSpeed * (this.kind === "wolf" ? 0.34 : this.kind === "brute" ? 0.22 : 0.28);

      this.vx = pdir.x * patrolSpeed;
      this.vy = pdir.y * patrolSpeed;

      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;
      if (world?.canWalk?.(nx, this.y)) this.x = nx;
      if (world?.canWalk?.(this.x, ny)) this.y = ny;
      return;
    }

    if (this.kind === "caster") {
      if (d > 170) {
        this.vx = dir.x * this.moveSpeed;
        this.vy = dir.y * this.moveSpeed;
      } else if (d < 120) {
        this.vx = -dir.x * this.moveSpeed * 0.82;
        this.vy = -dir.y * this.moveSpeed * 0.82;
      } else {
        this.vx = -dir.y * this.moveSpeed * 0.65;
        this.vy = dir.x * this.moveSpeed * 0.65;
      }

      if (this.rangedCd <= 0 && d < 260 && game?.projectiles) {
        const shotDir = norm(dx, dy);
        const shotSpeed = 155;
        const dmg = Math.max(5, Math.round(this.level * 0.60));

        game.projectiles.push(
          new Projectile(
            this.x + shotDir.x * (this.radius + 4),
            this.y + shotDir.y * (this.radius + 4),
            shotDir.x * shotSpeed,
            shotDir.y * shotSpeed,
            dmg,
            1.7,
            this.level,
            {
              friendly: false,
              color: "rgba(115,176,255,0.92)",
              radius: 4,
              hitRadius: 10,
            }
          )
        );
        this.rangedCd = 2.2;
      }
    } else {
      this.vx = dir.x * this.moveSpeed;
      this.vy = dir.y * this.moveSpeed;
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

    if (this.kind === "wolf") this._drawWolf(ctx);
    else if (this.kind === "brute") this._drawBrute(ctx);
    else if (this.kind === "caster") this._drawCaster(ctx, t);
    else if (this.kind === "scout") this._drawScout(ctx);
    else if (this.kind === "stalker") this._drawStalker(ctx);
    else if (this.kind === "ashling") this._drawAshling(ctx, t);
    else this._drawBlob(ctx, t);

    if (this.elite || this.boss) {
      ctx.strokeStyle = this.boss ? "rgba(255,150,150,0.48)" : "rgba(255,226,130,0.42)";
      ctx.lineWidth = this.boss ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawEyes(ctx, y = -2, glow = "#fff") {
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(-3, y, 1.2, 0, Math.PI * 2);
    ctx.arc(3, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
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

    if (d < 96) {
      const dir = { x: dx / d, y: dy / d };
      const speed = 44 + (96 - d) * 3.5;
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

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === "gold") {
      ctx.fillStyle = "#efc24a";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff0a8";
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "potion") {
      const mana = this.data?.potionType === "mana";
      ctx.fillStyle = mana ? "#6aa6ff" : "#df5b72";
      ctx.beginPath();
      ctx.arc(0, 2, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#d8cdb6";
      ctx.fillRect(-2, -6, 4, 5);
    } else if (this.kind === "gear") {
      ctx.fillStyle = this.data?.color || "#d9dee8";
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}