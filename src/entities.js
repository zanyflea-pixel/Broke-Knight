// src/entities.js
// v62 CAMP AI + LEASH PASS (FULL FILE)
// Focus:
// - enemies should not all rush hero from everywhere
// - camp/home based aggro
// - leash back toward home
// - preserve exports and compatibility
// Exports:
// - makeGear
// - Hero
// - Enemy
// - Projectile
// - Loot

import { clamp, norm, RNG, hash2 } from "./util.js";

/* ===========================
   GEAR
=========================== */

export function makeGear(slot = "weapon", level = 1, rarity = null, seed = 0) {
  const rr = new RNG(hash2(level | 0, slot.length | 0, seed | 0));

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

  const lvl = Math.max(1, level | 0);
  const stats = { dmg: 0, armor: 0, crit: 0 };

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
   HERO
=========================== */

export class Hero {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;

    this.vx = 0;
    this.vy = 0;

    this.radius = 10;
    this.r = 14;

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

    this.inventory = [];
    this.equip = {};
    this.potions = { hp: 2, mana: 1 };

    this.state = {
      sailing: false,
      dashT: 0,
      hurtT: 0,
    };

    this.lastMove = { x: 1, y: 0 };

    this.animT = 0;
    this.alive = true;
    this.dead = false;
  }

  getMoveSpeed(game = null) {
    const base = this.state?.sailing ? 175 : 140;
    const terrainMod = game?.world?.getMoveModifier?.(this.x, this.y) ?? 1;
    return base * terrainMod;
  }

  update(dt) {
    if (this.dead) return;

    this.hp = clamp(this.hp + this.hpRegen * dt, 0, this.maxHp);
    this.mana = clamp(this.mana + this.manaRegen * dt, 0, this.maxMana);

    this.state.dashT = Math.max(0, (this.state.dashT || 0) - dt);
    this.state.hurtT = Math.max(0, (this.state.hurtT || 0) - dt);

    if (Math.abs(this.vx) + Math.abs(this.vy) > 4) {
      this.animT += dt * 8.5;
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.dead = true;
    }
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
      dmg,
      armor,
      crit,
      critMult,
      maxHp: this.maxHp,
      maxMana: this.maxMana,
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

    return Math.round(reduced);
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

  giveXP(amount = 0) {
    this.gainXp(amount);
  }

  usePotion(kind = "hp") {
    const st = this.getStats();

    if (kind === "hp") {
      if ((this.potions.hp || 0) <= 0) return false;
      if (this.hp >= st.maxHp) return false;
      this.hp = Math.min(st.maxHp, this.hp + 45);
      this.potions.hp -= 1;
      return true;
    }

    if (kind === "mana") {
      if ((this.potions.mana || 0) <= 0) return false;
      if (this.mana >= st.maxMana) return false;
      this.mana = Math.min(st.maxMana, this.mana + 35);
      this.potions.mana -= 1;
      return true;
    }

    return false;
  }

  draw(ctx) {
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 4;
    const bob = moving ? Math.sin(this.animT) * 0.8 : 0;

    const fx = this.lastMove.x || 1;
    const fy = this.lastMove.y || 0;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.state.hurtT > 0 ? "#ffd3d3" : "#e9eef8";
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#55627a";
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f2d5bf";
    ctx.beginPath();
    ctx.arc(0, -2, 5.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#242a35";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(fx * 13, fy * 13);
    ctx.stroke();

    ctx.fillStyle = "#242a35";
    ctx.beginPath();
    ctx.arc(-1.7, -3.2, 0.9, 0, Math.PI * 2);
    ctx.arc(1.7, -3.2, 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/* ===========================
   ENEMY
=========================== */

export class Enemy {
  constructor(x = 0, y = 0, tier = 1, kind = "blob", seed = 1) {
    this.x = x;
    this.y = y;

    this.vx = 0;
    this.vy = 0;

    this.tier = Math.max(1, tier | 0);
    this.kind = kind || "blob";
    this.seed = seed | 0;

    this.r = this.kind === "brute" ? 16 : this.kind === "stalker" ? 11 : this.kind === "caster" ? 12 : 13;
    this.radius = this.r;

    this.speed =
      this.kind === "stalker" ? 92 + this.tier * 2 :
      this.kind === "brute" ? 52 + this.tier * 1.4 :
      this.kind === "caster" ? 58 + this.tier * 1.5 :
      68 + this.tier * 1.8;

    this.maxHp =
      this.kind === "brute" ? 34 + this.tier * 16 :
      this.kind === "caster" ? 20 + this.tier * 9 :
      this.kind === "stalker" ? 22 + this.tier * 10 :
      26 + this.tier * 12;

    this.hp = this.maxHp;

    this.touchDps =
      this.kind === "brute" ? 18 + this.tier * 1.6 :
      this.kind === "stalker" ? 14 + this.tier * 1.2 :
      this.kind === "caster" ? 10 + this.tier :
      12 + this.tier * 1.1;

    this.alive = true;
    this.dead = false;
    this.hitFlash = 0;
    this.animT = Math.random() * Math.PI * 2;
    this.attackCd = 0;

    this.variant = Math.abs(hash2((x * 7) | 0, (y * 7) | 0, seed)) % 4;

    this.home = { x, y };
    this.campId = null;

    this.state = "idle";
    this.aggroT = 0;
    this.wanderT = 0;
    this.wanderDir = { x: 0, y: 0 };
  }

  xpValue() {
    const base =
      this.kind === "brute" ? 9 :
      this.kind === "caster" ? 8 :
      this.kind === "stalker" ? 7 :
      6;

    return base + this.tier * 2;
  }

  update(dt, hero, world, game) {
    if (!this.alive || !hero) return;

    this.animT += dt * 6;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.aggroT = Math.max(0, this.aggroT - dt);
    this.wanderT = Math.max(0, this.wanderT - dt);

    const hx = hero.x;
    const hy = hero.y;
    const dx = hx - this.x;
    const dy = hy - this.y;
    const d = Math.hypot(dx, dy) || 0.0001;

    const home = this.home || { x: this.x, y: this.y };
    const hdx = hx - home.x;
    const hdy = hy - home.y;
    const heroFromHome = Math.hypot(hdx, hdy);

    const backDx = home.x - this.x;
    const backDy = home.y - this.y;
    const distFromHome = Math.hypot(backDx, backDy);

    const campAggroRadius =
      this.kind === "stalker" ? 240 :
      this.kind === "caster" ? 220 :
      this.kind === "brute" ? 200 :
      210;

    const leashRadius =
      this.kind === "stalker" ? 320 :
      this.kind === "caster" ? 300 :
      this.kind === "brute" ? 260 :
      280;

    const hardLeash =
      this.kind === "stalker" ? 420 :
      this.kind === "caster" ? 390 :
      this.kind === "brute" ? 340 :
      360;

    const directAggroRadius =
      this.kind === "stalker" ? 150 :
      this.kind === "caster" ? 170 :
      this.kind === "brute" ? 110 :
      135;

    if (d < directAggroRadius || heroFromHome < campAggroRadius) {
      this.aggroT = 2.6;
      this.state = "aggro";
    }

    if (distFromHome > hardLeash) {
      this.state = "return";
      this.aggroT = 0;
    } else if (this.aggroT <= 0) {
      if (distFromHome > leashRadius) this.state = "return";
      else if (this.state === "aggro") this.state = "idle";
    }

    let tx = 0;
    let ty = 0;
    let moveSpeed = this.speed * 0.92;

    if (this.state === "aggro") {
      tx = dx / d;
      ty = dy / d;
      moveSpeed = this.speed;

      if (this.kind === "caster" && d < 130) {
        tx *= -1;
        ty *= -1;
        moveSpeed *= 0.95;
      } else if (this.kind === "brute" && d < 90) {
        moveSpeed *= 0.76;
      } else if (this.kind === "stalker" && d > 170) {
        moveSpeed *= 1.14;
      }
    } else if (this.state === "return") {
      const bd = Math.hypot(backDx, backDy) || 0.0001;
      tx = backDx / bd;
      ty = backDy / bd;
      moveSpeed = this.speed * 0.82;

      if (bd < 12) {
        this.state = "idle";
        this.wanderT = 0;
      }
    } else {
      if (this.wanderT <= 0) {
        this.wanderT = 0.8 + Math.random() * 1.5;
        const ang = Math.random() * Math.PI * 2;
        this.wanderDir.x = Math.cos(ang);
        this.wanderDir.y = Math.sin(ang);
      }

      tx = this.wanderDir.x;
      ty = this.wanderDir.y;
      moveSpeed = this.speed * 0.34;

      if (distFromHome > 70) {
        const bd = Math.hypot(backDx, backDy) || 1;
        tx = backDx / bd;
        ty = backDy / bd;
        moveSpeed = this.speed * 0.48;
      }
    }

    const nx = this.x + tx * moveSpeed * dt;
    const ny = this.y + ty * moveSpeed * dt;

    if (!world?.canWalk || world.canWalk(nx, this.y)) this.x = nx;
    if (!world?.canWalk || world.canWalk(this.x, ny)) this.y = ny;

    if (this.state === "aggro" && this.kind === "caster" && d < 260 && this.attackCd <= 0) {
      this.attackCd = 1.5;

      const n = norm(dx, dy);
      const p = new Projectile(
        this.x + n.x * 12,
        this.y + n.y * 12,
        n.x * 225,
        n.y * 225,
        Math.round(6 + this.tier * 2.2),
        1.2,
        this.tier,
        {
          color: "rgba(255,120,120,0.92)",
          radius: 5,
          type: "enemy_bolt",
          hitRadius: 16,
          onHitHero: true,
          friendly: false,
        }
      );

      if (game?.projectiles?.push) {
        game.projectiles.push(p);
      }
    }
  }

  takeDamage(amount = 0) {
    this.hp -= Math.max(1, amount | 0);
    this.hitFlash = 1;
    this.aggroT = Math.max(this.aggroT, 3.2);
    this.state = "aggro";

    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.animT * 1.2) * 0.9;
    const pulse = 1 + Math.sin(this.animT * 2.1) * 0.04;

    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, this.radius + 1, this.radius * 0.75, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    let main = "#cc4444";
    let dark = "#8f2323";

    if (this.kind === "caster") {
      main = "#7db7ff";
      dark = "#356fbb";
    } else if (this.kind === "stalker") {
      main = "#5fd17c";
      dark = "#2f8244";
    } else if (this.kind === "brute") {
      main = "#d98a4e";
      dark = "#96541f";
    }

    if (this.hitFlash > 0) {
      main = "#ffffff";
      dark = "#d9d9d9";
    }

    ctx.fillStyle = main;

    if (this.kind === "brute") {
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(-this.radius, -this.radius + 1, this.radius * 2, this.radius * 2 - 2, 5);
        ctx.fill();
      } else {
        ctx.fillRect(-this.radius, -this.radius + 1, this.radius * 2, this.radius * 2 - 2);
      }
    } else if (this.kind === "stalker") {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius - 2);
      ctx.lineTo(this.radius + 1, this.radius - 2);
      ctx.lineTo(-this.radius - 1, this.radius - 2);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === "caster") {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      if (this.variant === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.variant === 1) {
        ctx.fillRect(-this.radius, -this.radius + 1, this.radius * 2, this.radius * 2 - 2);
      } else if (this.variant === 2) {
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius, this.radius - 1);
        ctx.lineTo(-this.radius, this.radius - 1);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius + 1.5, this.radius - 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = dark;
    if (this.kind === "brute") {
      ctx.fillRect(-this.radius * 0.65, -2, this.radius * 1.3, 5);
    } else if (this.kind === "stalker") {
      ctx.beginPath();
      ctx.moveTo(-5, 1);
      ctx.lineTo(0, 5);
      ctx.lineTo(5, 1);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === "caster") {
      ctx.beginPath();
      ctx.arc(0, 2, 4.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#181d25";
    ctx.beginPath();
    ctx.arc(-2.2, -1.5, 1.1, 0, Math.PI * 2);
    ctx.arc(2.2, -1.5, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/* ===========================
   PROJECTILE
=========================== */

export class Projectile {
  constructor(x, y, vx, vy, dmg = 10, life = 1, level = 1, meta = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.dmg = Math.max(1, dmg | 0);
    this.life = Math.max(0.05, +life || 1);
    this.level = Math.max(1, level | 0);

    this.meta = {
      color: "rgba(255,209,102,0.95)",
      radius: 4,
      type: "bolt",
      hitRadius: 18,
      pierce: false,
      friendly: true,
      ...meta,
    };

    this.radius = Math.max(2, this.meta.radius || 4);
    this.hitRadius = Math.max(6, this.meta.hitRadius || 18);
    this.friendly = this.meta.friendly !== false;

    this.alive = true;
    this.dead = false;
    this.t = 0;
  }

  update(dt, world) {
    if (!this.alive) return;

    this.t += dt;
    this.life -= dt;

    if (this.life <= 0) {
      this.alive = false;
      this.dead = true;
      return;
    }

    if (this.meta?.nova) return;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (world?.isSolid?.(nx, ny)) {
      this.alive = false;
      this.dead = true;
      return;
    }

    this.x = nx;
    this.y = ny;
  }

  draw(ctx) {
    if (!this.alive) return;

    ctx.save();

    if (this.meta?.nova) {
      ctx.strokeStyle = this.meta?.color || "rgba(214,245,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius * 0.8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.12;
      ctx.fillStyle = this.meta?.color || "rgba(214,245,255,0.9)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    const glow = this.radius + (this.meta.type === "orb" ? 4 : 2);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = this.meta?.color || "rgba(255,209,102,0.95)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = this.meta?.color || "rgba(255,209,102,0.95)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    if (this.meta.type === "spark" || this.meta.type === "enemy_bolt") {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x - this.vx * 0.012, this.y - this.vy * 0.012);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    }

    ctx.restore();
  }
}

/* ===========================
   LOOT
=========================== */

export class Loot {
  constructor(x, y, kind = "gold", data = {}) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.data = data || {};

    this.alive = true;
    this.dead = false;
    this.age = 0;
    this.r = 11;
  }

  update(dt, hero) {
    if (!this.alive) return;

    this.age += dt;

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d2 = dx * dx + dy * dy;

    if (d2 < 150 * 150 && d2 > 1e-6) {
      const n = norm(dx, dy);
      const speed = d2 < 40 * 40 ? 260 : d2 < 90 * 90 ? 180 : 110;
      this.x += n.x * speed * dt;
      this.y += n.y * speed * dt;
    }

    if (d2 < 18 * 18) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    const bob = Math.sin(this.age * 5) * 2;
    const x = this.x;
    const y = this.y + bob;

    ctx.save();

    if (this.kind === "gold") {
      ctx.fillStyle = "#ffd654";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.kind === "potion") {
      ctx.fillStyle = this.data?.potionType === "mana" ? "#5a96ff" : "#eb526c";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x - 1, y - 7, 2, 3);
    } else {
      const rarity = this.data?.rarity;
      ctx.fillStyle =
        rarity === "epic" ? "#d79cff" :
        rarity === "rare" ? "#90cfff" :
        rarity === "uncommon" ? "#98e798" :
        "#d8d8d8";
      ctx.fillRect(x - 5, y - 5, 10, 10);

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }

    ctx.restore();
  }
}