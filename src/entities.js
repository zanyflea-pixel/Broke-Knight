// src/entities.js
// SAFE COMPAT EXPORT RESTORE + PROJECTILE CONTRACT FIX
// Exports:
// - Hero
// - Enemy
// - Loot
// - Projectile
// - EntityManager
// - makeGear

import { clamp, dist, norm, RNG, hash2 } from "./util.js";

/* ===========================
   GEAR GENERATION
=========================== */

export function makeGear(slot = "weapon", level = 1, rarity = null, seed = 0) {
  const rr = new RNG(hash2(level | 0, slot.length | 0, seed | 0));

  const rarities = ["common", "uncommon", "rare", "epic"];
  if (!rarity) {
    const r = rr.float();
    rarity =
      r < 0.58 ? "common" :
      r < 0.83 ? "uncommon" :
      r < 0.96 ? "rare" :
      "epic";
  }

  const rarityMult =
    rarity === "epic" ? 1.9 :
    rarity === "rare" ? 1.45 :
    rarity === "uncommon" ? 1.18 :
    1.0;

  const stats = { dmg: 0, armor: 0, crit: 0 };
  const lvl = Math.max(1, level | 0);

  switch (slot) {
    case "weapon":
      stats.dmg = Math.max(1, Math.round((4 + lvl * 1.8 + rr.range(0, 4)) * rarityMult));
      if (rarity === "rare" || rarity === "epic") {
        stats.crit = +(0.02 + lvl * 0.001 + rr.range(0, 0.03)).toFixed(3);
      }
      break;

    case "armor":
    case "chest":
      stats.armor = Math.max(1, Math.round((2 + lvl * 1.4 + rr.range(0, 3)) * rarityMult));
      break;

    case "helm":
    case "boots":
      stats.armor = Math.max(1, Math.round((1 + lvl * 0.9 + rr.range(0, 2)) * rarityMult));
      break;

    case "ring":
    case "trinket":
      stats.crit = +(0.01 + lvl * 0.0008 + rr.range(0, 0.025) * rarityMult).toFixed(3);
      if (rarity === "epic") stats.dmg = Math.max(0, Math.round(lvl * 0.4));
      break;

    default:
      stats.armor = Math.max(0, Math.round((1 + lvl * 0.5) * rarityMult));
      break;
  }

  return {
    slot,
    level: lvl,
    rarity,
    name: gearName(slot, rarity, rr),
    stats,
    price: Math.max(4, Math.round((lvl * 10 + rr.range(0, 12)) * rarityMult)),
  };
}

function gearName(slot, rarity, rr) {
  const prefix =
    rarity === "epic" ? ["Mythic", "Ancient", "Stormforged", "Kingsfall"] :
    rarity === "rare" ? ["Fine", "Runed", "Steel", "Hunter's"] :
    rarity === "uncommon" ? ["Sturdy", "Traveler's", "Polished", "Mercenary's"] :
    ["Plain", "Worn", "Simple", "Old"];

  const coreBySlot = {
    weapon: ["Blade", "Sword", "Wand", "Staff"],
    armor: ["Armor", "Mail", "Plate", "Guard"],
    chest: ["Chestplate", "Vest", "Cuirass", "Tunic"],
    helm: ["Helm", "Cap", "Hood", "Crown"],
    boots: ["Boots", "Greaves", "Striders", "Treads"],
    ring: ["Ring", "Band", "Loop", "Seal"],
    trinket: ["Charm", "Idol", "Relic", "Totem"],
  };

  const arr = coreBySlot[slot] || ["Gear"];
  return `${rr.pick(prefix)} ${rr.pick(arr)}`;
}

/* ===========================
   ENTITY MANAGER
=========================== */

export class EntityManager {
  constructor() {
    this.entities = [];
  }

  add(entity) {
    if (entity) this.entities.push(entity);
    return entity;
  }

  remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i >= 0) this.entities.splice(i, 1);
  }

  clear() {
    this.entities.length = 0;
  }

  update(dt, game) {
    for (const e of this.entities) {
      if (e && e.alive !== false && typeof e.update === "function") {
        e.update(dt, game);
      }
    }
    this.entities = this.entities.filter(e => e && e.alive !== false);
  }

  draw(ctx, game) {
    for (const e of this.entities) {
      if (e && e.alive !== false && typeof e.draw === "function") {
        e.draw(ctx, game);
      }
    }
  }

  all() {
    return this.entities;
  }

  getEnemies() {
    return this.entities.filter(e => e instanceof Enemy && e.alive !== false);
  }

  getLoot() {
    return this.entities.filter(e => e instanceof Loot && e.alive !== false);
  }

  findNearestEnemy(x, y, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;

    for (const e of this.entities) {
      if (!(e instanceof Enemy) || e.alive === false) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }

    return best;
  }
}

/* ===========================
   HERO
=========================== */

export class Hero {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;

    this.vx = 0;
    this.vy = 0;
    this.speed = 180;

    this.level = 1;
    this.xp = 0;
    this.nextXp = 30;
    this.gold = 0;

    this.maxHp = 100;
    this.hp = 100;
    this.maxMana = 60;
    this.mana = 60;

    this.hpRegen = 1.5;
    this.manaRegen = 6.0;

    this.potions = { hp: 2, mana: 1 };
    this.inventory = [];
    this.equip = {};

    this.state = {
      sailing: false,
      dashT: 0,
      hurtT: 0,
    };

    this.lastMove = { x: 1, y: 0 };
    this.radius = 10;
    this.alive = true;
    this.dead = false;
    this.animT = 0;
  }

  update(dt, game) {
    const input = game?.input;
    if (!input) return;

    const axis =
      input.moveVector?.() ||
      input.axis?.() || {
        x: (input.right?.() ? 1 : 0) - (input.left?.() ? 1 : 0),
        y: (input.downArrow?.() ? 1 : 0) - (input.up?.() ? 1 : 0),
      };

    let mx = axis.x || 0;
    let my = axis.y || 0;

    const n = norm(mx, my);
    mx = n.x;
    my = n.y;

    if (mx !== 0 || my !== 0) {
      this.lastMove.x = mx;
      this.lastMove.y = my;
    }

    const targetVX = mx * this.speed;
    const targetVY = my * this.speed;
    const accel = 12;

    this.vx += (targetVX - this.vx) * accel * dt;
    this.vy += (targetVY - this.vy) * accel * dt;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (!game?.world?.canWalk || game.world.canWalk(nx, this.y)) {
      this.x = nx;
    } else {
      this.vx = 0;
    }

    if (!game?.world?.canWalk || game.world.canWalk(this.x, ny)) {
      this.y = ny;
    } else {
      this.vy = 0;
    }

    this.hp = clamp(this.hp + this.hpRegen * dt, 0, this.maxHp);
    this.mana = clamp(this.mana + this.manaRegen * dt, 0, this.maxMana);

    this.state.dashT = Math.max(0, (this.state.dashT || 0) - dt);
    this.state.hurtT = Math.max(0, (this.state.hurtT || 0) - dt);

    if (Math.abs(this.vx) + Math.abs(this.vy) > 8) {
      this.animT += dt * 9.5;
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();

    const hurt = (this.state.hurtT || 0) > 0;
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 8;
    const bob = moving ? Math.sin(this.animT) * 1.35 : 0;
    const step = moving ? Math.sin(this.animT) * 1.5 : 0;

    const fx = this.lastMove.x || 1;
    const fy = this.lastMove.y || 0;
    const faceSide = fx >= 0 ? 1 : -1;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 11, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "rgba(185,44,44,0.96)" : "rgba(150,32,36,0.96)";
    ctx.beginPath();
    ctx.moveTo(this.x - 6, this.y - 1 + bob);
    ctx.lineTo(this.x - 8 - fx * 1.6, this.y + 10 + bob);
    ctx.lineTo(this.x + 8 - fx * 1.6, this.y + 10 + bob);
    ctx.lineTo(this.x + 6, this.y - 1 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(58,62,72,0.98)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(this.x - 2.5, this.y + 9 + bob);
    ctx.lineTo(this.x - 3.5, this.y + 15 + bob + step);
    ctx.moveTo(this.x + 2.5, this.y + 9 + bob);
    ctx.lineTo(this.x + 3.5, this.y + 15 + bob - step);
    ctx.stroke();

    const bodyPath = new Path2D();
    roundedRectPath(bodyPath, this.x - 5.8, this.y - 2 + bob, 11.6, 12.8, 3);
    ctx.fillStyle = hurt ? "rgba(228,228,235,1)" : "rgba(202,204,214,1)";
    ctx.fill(bodyPath);

    ctx.fillStyle = "rgba(64,86,138,0.98)";
    ctx.fillRect(this.x - 2.2, this.y - 1 + bob, 4.4, 10);

    ctx.fillStyle = "rgba(118,84,44,0.98)";
    ctx.fillRect(this.x - 5.2, this.y + 4.7 + bob, 10.4, 2.2);

    ctx.fillStyle = "rgba(160,164,176,0.95)";
    ctx.fillRect(this.x - 7.1, this.y - 1.2 + bob, 2.2, 4.1);
    ctx.fillRect(this.x + 4.9, this.y - 1.2 + bob, 2.2, 4.1);

    ctx.strokeStyle = "rgba(214,214,224,0.98)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(this.x - 4.8, this.y + 1 + bob);
    ctx.lineTo(this.x - 7.2, this.y + 6 + bob + step * 0.45);
    ctx.moveTo(this.x + 4.8, this.y + 1 + bob);
    ctx.lineTo(this.x + 7.2, this.y + 6 + bob - step * 0.45);
    ctx.stroke();

    ctx.fillStyle = hurt ? "rgba(255,214,214,1)" : "rgba(242,214,182,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 7 + bob, 5.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(78,56,38,0.98)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 8.4 + bob, 5.4, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,94,72,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y - 7 + bob, 5.3, 0.25, Math.PI - 0.25);
    ctx.stroke();

    ctx.fillStyle = "rgba(28,28,28,0.98)";
    ctx.fillRect(this.x - 2.5 + faceSide * 0.5, this.y - 7.8 + bob, 1.2, 1.2);
    ctx.fillRect(this.x + 1.2 + faceSide * 0.5, this.y - 7.8 + bob, 1.2, 1.2);

    ctx.fillStyle = "rgba(108,122,148,0.96)";
    const shieldPath = new Path2D();
    roundedRectPath(shieldPath, this.x - 8.5, this.y + 1 + bob, 2.4, 5.4, 1.2);
    ctx.fill(shieldPath);

    ctx.save();
    const swordAng = Math.atan2(fy, fx || 0.0001);
    ctx.translate(this.x + fx * 6.4, this.y + 1.6 + bob + fy * 1.8);
    ctx.rotate(swordAng);

    ctx.fillStyle = "rgba(210,186,118,1)";
    ctx.fillRect(-1.4, -3.4, 2.8, 6.8);

    ctx.fillStyle = "rgba(120,84,42,1)";
    ctx.fillRect(-2.8, -1.2, 5.6, 2.4);

    ctx.fillStyle = "rgba(178,188,205,1)";
    ctx.fillRect(2.8, -1, 8.5, 2);

    ctx.fillStyle = "rgba(232,236,244,0.9)";
    ctx.fillRect(4.2, -0.35, 5.3, 0.7);

    ctx.restore();
    ctx.restore();
  }

  getStats() {
    let dmg = 10;
    let armor = 2;
    let crit = 0.05;
    let critMult = 1.7;

    for (const key of Object.keys(this.equip || {})) {
      const it = this.equip[key];
      if (!it?.stats) continue;
      dmg += it.stats.dmg || 0;
      armor += it.stats.armor || 0;
      crit += it.stats.crit || 0;
    }

    return {
      maxHp: this.maxHp,
      maxMana: this.maxMana,
      dmg,
      armor,
      crit,
      critMult,
    };
  }

  takeDamage(amount = 0) {
    const stats = this.getStats();
    const reduced = Math.max(1, amount - (stats.armor || 0) * 0.35);
    this.hp = Math.max(0, this.hp - reduced);
    this.state.hurtT = 0.18;
    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
    }
    return reduced;
  }

  spendMana(cost = 0) {
    if (this.mana < cost) return false;
    this.mana -= cost;
    return true;
  }

  heal(amount = 0) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  restoreMana(amount = 0) {
    this.mana = clamp(this.mana + amount, 0, this.maxMana);
  }

  gainXp(amount = 0) {
    this.xp += Math.max(0, amount | 0);

    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level += 1;
      this.nextXp = Math.floor(this.nextXp * 1.22 + 8);

      this.maxHp += 10;
      this.maxMana += 6;
      this.hp = this.maxHp;
      this.mana = this.maxMana;
    }
  }
}

/* ===========================
   ENEMY
=========================== */

export class Enemy {
  constructor(x = 0, y = 0, opts = {}) {
    this.x = x;
    this.y = y;

    this.radius = opts.radius ?? 10;
    this.speed = opts.speed ?? 78;

    this.maxHp = opts.maxHp ?? 30;
    this.hp = this.maxHp;

    this.touchDps = opts.touchDps ?? 10;
    this.xpReward = opts.xpReward ?? 8;
    this.goldReward = opts.goldReward ?? 4;

    this.alive = true;
    this.dead = false;
    this.hitFlash = 0;
    this.wanderT = 0;
    this.wanderDir = { x: 0, y: 0 };
    this.animT = Math.random() * Math.PI * 2;
  }

  update(dt, game) {
    const hero = game?.hero;
    if (!hero) return;

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d = Math.hypot(dx, dy);

    this.animT += dt * 6.8;

    if (d < 260) {
      const n = norm(dx, dy);
      this.x += n.x * this.speed * dt;
      this.y += n.y * this.speed * dt;
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 1.2 + Math.random() * 1.8;
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.x = Math.cos(a);
        this.wanderDir.y = Math.sin(a);
      }

      this.x += this.wanderDir.x * this.speed * 0.18 * dt;
      this.y += this.wanderDir.y * this.speed * 0.18 * dt;
    }

    if (game?.world?.canWalk && !game.world.canWalk(this.x, this.y)) {
      this.x -= (dx / (d || 1)) * this.speed * dt;
      this.y -= (dy / (d || 1)) * this.speed * dt;
    }

    if (d < this.radius + hero.radius + 2) {
      hero.takeDamage?.(this.touchDps * dt);
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
  }

  takeDamage(amount = 0) {
    this.hp -= Math.max(1, amount);
    this.hitFlash = 1;

    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();

    const flash = this.hitFlash > 0;
    const bob = Math.sin(this.animT) * 1.15;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, 8.8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? "rgba(255,255,255,1)" : "rgba(112,20,20,0.98)";
    ctx.beginPath();
    ctx.moveTo(this.x - 6, this.y - 2 + bob);
    ctx.lineTo(this.x - 8, this.y + 8 + bob);
    ctx.lineTo(this.x + 8, this.y + 8 + bob);
    ctx.lineTo(this.x + 6, this.y - 2 + bob);
    ctx.closePath();
    ctx.fill();

    const bodyPath = new Path2D();
    roundedRectPath(bodyPath, this.x - 5.6, this.y - 1 + bob, 11.2, 12, 3);
    ctx.fillStyle = flash ? "rgba(255,255,255,1)" : "rgba(178,42,42,1)";
    ctx.fill(bodyPath);

    ctx.fillStyle = flash ? "rgba(245,245,245,1)" : "rgba(212,76,70,0.95)";
    ctx.fillRect(this.x - 2.2, this.y + 1 + bob, 4.4, 7.5);

    ctx.fillStyle = flash ? "rgba(255,255,255,1)" : "rgba(150,36,36,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 6 + bob, 5.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? "rgba(245,245,245,1)" : "rgba(94,22,22,1)";
    ctx.beginPath();
    ctx.moveTo(this.x - 4.6, this.y - 7.2 + bob);
    ctx.lineTo(this.x - 8.8, this.y - 11.2 + bob);
    ctx.lineTo(this.x - 3.2, this.y - 4.8 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(this.x + 4.6, this.y - 7.2 + bob);
    ctx.lineTo(this.x + 8.8, this.y - 11.2 + bob);
    ctx.lineTo(this.x + 3.2, this.y - 4.8 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,232,120,1)";
    ctx.fillRect(this.x - 4, this.y - 7 + bob, 2, 2);
    ctx.fillRect(this.x + 2, this.y - 7 + bob, 2, 2);

    ctx.strokeStyle = flash ? "rgba(255,255,255,1)" : "rgba(86,18,18,1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - 5.5, this.y + 3 + bob);
    ctx.lineTo(this.x - 8.2, this.y + 6 + bob);
    ctx.moveTo(this.x + 5.5, this.y + 3 + bob);
    ctx.lineTo(this.x + 8.2, this.y + 6 + bob);
    ctx.stroke();

    const w = 22;
    const h = 4;
    const p = clamp(this.hp / Math.max(1, this.maxHp), 0, 1);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(this.x - w / 2, this.y - 17, w, h);

    ctx.fillStyle = "rgba(120,255,120,0.95)";
    ctx.fillRect(this.x - w / 2, this.y - 17, w * p, h);

    ctx.restore();
  }
}

/* ===========================
   LOOT
=========================== */

export class Loot {
  constructor(x = 0, y = 0, kind = "gold", opts = {}) {
    this.x = x;
    this.y = y;

    this.kind = kind;
    this.amount = opts.amount ?? 0;
    this.item = opts.item ?? null;

    this.radius = 8;
    this.alive = true;
    this.dead = false;
    this.bobT = Math.random() * Math.PI * 2;
    this.age = 0;
  }

  update(dt, game) {
    this.age += dt;
    this.bobT += dt * 2.6;

    const hero = game?.hero;
    if (!hero) return;

    const d = dist(this.x, this.y, hero.x, hero.y);

    if (d < 96 && d > 0.001) {
      const n = norm(hero.x - this.x, hero.y - this.y);
      this.x += n.x * 120 * dt;
      this.y += n.y * 120 * dt;
    }

    if (d < this.radius + hero.radius + 4) {
      this.collect(game);
    }
  }

  collect(game) {
    const hero = game?.hero;
    if (!hero) return;

    if (this.kind === "gold") {
      hero.gold = (hero.gold || 0) + Math.max(1, this.amount | 0);
      game?.ui?.setMsg?.(`Picked up ${Math.max(1, this.amount | 0)} gold`, 1.6);
    } else if (this.kind === "gear" && this.item) {
      if (!Array.isArray(hero.inventory)) hero.inventory = [];
      hero.inventory.push(this.item);
      game?.ui?.setMsg?.(`Picked up ${this.item.name}`, 1.8);
    } else if (this.kind === "hp_potion") {
      hero.potions.hp = (hero.potions.hp || 0) + 1;
      game?.ui?.setMsg?.("Picked up a health potion", 1.6);
    } else if (this.kind === "mana_potion") {
      hero.potions.mana = (hero.potions.mana || 0) + 1;
      game?.ui?.setMsg?.("Picked up a mana potion", 1.6);
    }

    this.alive = false;
    this.dead = true;
  }

  draw(ctx) {
    ctx.save();

    const bob = Math.sin(this.bobT) * 2;
    const px = this.x;
    const py = this.y + bob;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(px, py + 9, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === "gold") {
      ctx.fillStyle = "rgba(255,214,84,1)";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,244,180,0.75)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.kind === "gear") {
      ctx.fillStyle = "rgba(170,220,255,1)";
      ctx.beginPath();
      ctx.rect(px - 5, py - 5, 10, 10);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 5, py - 5, 10, 10);
    } else if (this.kind === "hp_potion") {
      ctx.fillStyle = "rgba(235,80,110,1)";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "mana_potion") {
      ctx.fillStyle = "rgba(90,150,255,1)";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/* ===========================
   PROJECTILE
=========================== */

export class Projectile {
  // IMPORTANT:
  // Matches current game.js call pattern:
  // new Projectile(x, y, vx, vy, dmg, life, level, meta)
  constructor(x = 0, y = 0, vx = 0, vy = 0, dmg = 10, life = 1, level = 1, meta = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.dmg = Number.isFinite(dmg) ? dmg : 10;
    this.life = Number.isFinite(life) ? life : 1;
    this.level = Number.isFinite(level) ? level : 1;

    this.meta = {
      crit: 0,
      critMult: 1.7,
      color: "rgba(145,215,255,0.95)",
      radius: 6,
      type: "bolt",
      hitRadius: 18,
      pierce: false,
      ...((meta && typeof meta === "object") ? meta : {}),
    };

    this.radius = Number.isFinite(this.meta.radius) ? this.meta.radius : 6;
    this.hitRadius = Number.isFinite(this.meta.hitRadius) ? this.meta.hitRadius : 18;
    this.friendly = this.meta.friendly !== false;
    this.alive = true;
    this.dead = false;
    this.t = 0;
  }

  update(dt, world) {
    this.t += dt;
    this.life -= dt;

    if (this.life <= 0) {
      this.alive = false;
      this.dead = true;
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Nova is a stationary effect
    if (this.meta?.nova) return;

    // Keep spell visuals alive over water and land; only kill if far into rock/blocked land
    if (world?.isSolid?.(this.x, this.y)) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    ctx.save();

    const r = this.radius;
    const color = this.meta?.color || "rgba(145,215,255,0.95)";
    const pulse = 1 + Math.sin(this.t * 18) * 0.08;

    if (this.meta?.nova) {
      const rr = this.hitRadius * (0.76 + Math.sin(this.t * 14) * 0.04);

      ctx.fillStyle = "rgba(200,240,255,0.10)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(210,245,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr * 0.82, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
      return;
    }

    if (this.meta?.type === "orb") {
      ctx.fillStyle = "rgba(190,160,255,0.20)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 2.2 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 1.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.beginPath();
      ctx.arc(this.x - r * 0.28, this.y - r * 0.28, r * 0.42, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // bolt default
    const ang = Math.atan2(this.vy, this.vx || 0.0001);
    ctx.translate(this.x, this.y);
    ctx.rotate(ang);

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.9, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(r * 1.7, 0);
    ctx.lineTo(-r * 0.8, -r * 0.82);
    ctx.lineTo(-r * 1.45, 0);
    ctx.lineTo(-r * 0.8, r * 0.82);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.beginPath();
    ctx.moveTo(r * 1.05, 0);
    ctx.lineTo(-r * 0.28, -r * 0.34);
    ctx.lineTo(-r * 0.64, 0);
    ctx.lineTo(-r * 0.28, r * 0.34);
    ctx.closePath();
    ctx.fill();

    if (this.meta?.crit) {
      ctx.strokeStyle = "rgba(255,240,180,0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function roundedRectPath(path, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + h - rr);
  path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  path.lineTo(x + rr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  path.closePath();
}