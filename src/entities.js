// src/entities.js
// SAFE COMPAT EXPORT RESTORE + BETTER HERO VISUALS
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

  const stats = {
    dmg: 0,
    armor: 0,
    crit: 0,
  };

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
      if (e && !e.dead && typeof e.update === "function") {
        e.update(dt, game);
      }
    }
    this.entities = this.entities.filter(e => e && !e.dead);
  }

  draw(ctx, game) {
    for (const e of this.entities) {
      if (e && !e.dead && typeof e.draw === "function") {
        e.draw(ctx, game);
      }
    }
  }

  all() {
    return this.entities;
  }

  getEnemies() {
    return this.entities.filter(e => e instanceof Enemy && !e.dead);
  }

  getLoot() {
    return this.entities.filter(e => e instanceof Loot && !e.dead);
  }

  findNearestEnemy(x, y, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;

    for (const e of this.entities) {
      if (!(e instanceof Enemy) || e.dead) continue;
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

    this.potions = {
      hp: 2,
      mana: 1,
    };

    this.inventory = [];
    this.equip = {};

    this.state = {
      sailing: false,
      dashT: 0,
      hurtT: 0,
    };

    this.lastMove = { x: 1, y: 0 };
    this.radius = 10;
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
      this.animT += dt * 10;
    }

    if (this.hp <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.save();

    const hurt = (this.state.hurtT || 0) > 0;
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 8;
    const bob = moving ? Math.sin(this.animT) * 1.5 : 0;

    const fx = this.lastMove.x || 1;
    const fy = this.lastMove.y || 0;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // cape
    ctx.fillStyle = hurt ? "rgba(180,40,40,0.95)" : "rgba(160,34,34,0.95)";
    ctx.beginPath();
    ctx.moveTo(this.x - 7, this.y + 1 + bob);
    ctx.lineTo(this.x - 3 - fx * 1.5, this.y + 12 + bob);
    ctx.lineTo(this.x + 3 - fx * 1.5, this.y + 12 + bob);
    ctx.lineTo(this.x + 7, this.y + 1 + bob);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = hurt ? "rgba(230,230,235,1)" : "rgba(210,210,220,1)";
    ctx.beginPath();
    ctx.roundRect?.(this.x - 5, this.y - 1 + bob, 10, 12, 3);
    if (!ctx.roundRect) {
      roundedBody(ctx, this.x - 5, this.y - 1 + bob, 10, 12, 3);
    }
    ctx.fill();

    // belt
    ctx.fillStyle = "rgba(120,86,42,0.95)";
    ctx.fillRect(this.x - 5, this.y + 5 + bob, 10, 2);

    // head
    ctx.fillStyle = hurt ? "rgba(255,210,210,1)" : "rgba(242,214,182,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 6 + bob, 5.2, 0, Math.PI * 2);
    ctx.fill();

    // hair / helm top
    ctx.fillStyle = "rgba(86,62,42,0.98)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 8 + bob, 5.3, Math.PI, Math.PI * 2);
    ctx.fill();

    // eyes
    const eyeDx = fx !== 0 ? Math.sign(fx) * 0.6 : 0;
    ctx.fillStyle = "rgba(34,34,34,0.95)";
    ctx.fillRect(this.x - 2.5 + eyeDx, this.y - 7 + bob, 1.2, 1.2);
    ctx.fillRect(this.x + 1.3 + eyeDx, this.y - 7 + bob, 1.2, 1.2);

    // arms
    ctx.strokeStyle = "rgba(220,220,228,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - 4, this.y + 2 + bob);
    ctx.lineTo(this.x - 7 + Math.sin(this.animT) * (moving ? 1.2 : 0), this.y + 7 + bob);
    ctx.moveTo(this.x + 4, this.y + 2 + bob);
    ctx.lineTo(this.x + 7 - Math.sin(this.animT) * (moving ? 1.2 : 0), this.y + 7 + bob);
    ctx.stroke();

    // legs
    ctx.strokeStyle = "rgba(72,72,82,0.98)";
    ctx.lineWidth = 2;
    const step = moving ? Math.sin(this.animT) * 1.6 : 0;
    ctx.beginPath();
    ctx.moveTo(this.x - 2, this.y + 11 + bob);
    ctx.lineTo(this.x - 3.5, this.y + 16 + bob + step);
    ctx.moveTo(this.x + 2, this.y + 11 + bob);
    ctx.lineTo(this.x + 3.5, this.y + 16 + bob - step);
    ctx.stroke();

    // sword
    ctx.save();
    const swordAng = Math.atan2(fy, fx || 0.0001);
    ctx.translate(this.x + fx * 6, this.y + 2 + bob + fy * 2);
    ctx.rotate(swordAng);
    ctx.fillStyle = "rgba(170,180,198,0.98)";
    ctx.fillRect(0, -1, 9, 2);
    ctx.fillStyle = "rgba(118,84,44,0.98)";
    ctx.fillRect(-2, -1.5, 2, 3);
    ctx.fillStyle = "rgba(210,186,118,0.98)";
    ctx.fillRect(-0.5, -3, 1, 6);
    ctx.restore();

    ctx.restore();
  }

  getStats() {
    let dmg = 10;
    let armor = 2;
    let crit = 0.05;

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
    };
  }

  takeDamage(amount = 0) {
    const stats = this.getStats();
    const reduced = Math.max(1, amount - (stats.armor || 0) * 0.35);
    this.hp = Math.max(0, this.hp - reduced);
    this.state.hurtT = 0.18;
    if (this.hp <= 0) this.dead = true;
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

    this.animT += dt * 7;

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

  takeDamage(amount = 0, game = null) {
    this.hp -= Math.max(1, amount);
    this.hitFlash = 1;

    if (this.hp <= 0) {
      this.dead = true;

      if (game?.hero) {
        game.hero.gainXp?.(this.xpReward);
        game.hero.gold = (game.hero.gold || 0) + this.goldReward;

        if (game.entities?.add) {
          const roll = Math.random();
          if (roll < 0.72) {
            game.entities.add(new Loot(this.x, this.y, "gold", {
              amount: this.goldReward + ((Math.random() * 4) | 0),
            }));
          } else {
            const slotPool = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
            const slot = slotPool[(Math.random() * slotPool.length) | 0];
            game.entities.add(new Loot(this.x, this.y, "gear", {
              item: makeGear(slot, game.hero.level || 1, null, hash2(this.x | 0, this.y | 0, this.maxHp | 0)),
            }));
          }
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();

    const bob = Math.sin(this.animT) * 1.2;

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, 8.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle =
      this.hitFlash > 0
        ? "rgba(255,255,255,1)"
        : "rgba(178,42,42,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // horns / ears
    ctx.fillStyle = "rgba(110,28,28,1)";
    ctx.beginPath();
    ctx.moveTo(this.x - 5, this.y - 4 + bob);
    ctx.lineTo(this.x - 8, this.y - 10 + bob);
    ctx.lineTo(this.x - 2, this.y - 6 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(this.x + 5, this.y - 4 + bob);
    ctx.lineTo(this.x + 8, this.y - 10 + bob);
    ctx.lineTo(this.x + 2, this.y - 6 + bob);
    ctx.closePath();
    ctx.fill();

    // eyes
    ctx.fillStyle = "rgba(255,232,120,0.98)";
    ctx.fillRect(this.x - 4, this.y - 2 + bob, 2, 2);
    ctx.fillRect(this.x + 2, this.y - 2 + bob, 2, 2);

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
  constructor(x = 0, y = 0, vx = 0, vy = 0, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.radius = opts.radius ?? 4;
    this.damage = opts.damage ?? 10;
    this.life = opts.life ?? 1.5;

    this.dead = false;
  }

  update(dt, game) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;

    if (this.life <= 0) {
      this.dead = true;
      return;
    }

    const mgr = game?.entities;
    if (!mgr?.entities) return;

    for (const e of mgr.entities) {
      if (!(e instanceof Enemy) || e.dead) continue;

      if (dist(this.x, this.y, e.x, e.y) <= this.radius + e.radius) {
        e.takeDamage(this.damage, game);
        this.dead = true;
        break;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(255,238,90,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function roundedBody(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}