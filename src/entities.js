// src/entities.js
// FULL FILE
// Gear visuals pass:
// - preserve working hero vertical sword
// - preserve working enemy variety
// - stronger enemy role readability
// - clearer elite visuals
// - better projectile trail/glow
// - clearer loot pickup visuals
// - visible equipped gear on hero
// - keep current game.js compatibility

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

    this.r = 14;
    this.radius = 10;

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

    this.alive = true;
    this.dead = false;
    this.animT = 0;
  }

  update(dt) {
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
    ctx.save();

    const hurt = (this.state.hurtT || 0) > 0;
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 8;
    const bob = moving ? Math.sin(this.animT) * 1.3 : 0;
    const step = moving ? Math.sin(this.animT) * 1.4 : 0;

    const fx = this.lastMove.x || 0;
    const fy = this.lastMove.y || 0;

    const vertical = Math.abs(fy) > Math.abs(fx);
    const facingUp = vertical && fy < 0;
    const facingDown = vertical && fy > 0;
    const side = fx >= 0 ? 1 : -1;

    const weapon = this.equip?.weapon || null;
    const armor = this.equip?.armor || this.equip?.chest || null;
    const helm = this.equip?.helm || null;
    const boots = this.equip?.boots || null;
    const ring = this.equip?.ring || null;
    const trinket = this.equip?.trinket || null;

    const tunicColor = armor
      ? gearVisualColor(armor.rarity, "armor")
      : "rgba(64,86,138,0.98)";

    const bootColor = boots
      ? gearVisualColor(boots.rarity, "boots")
      : "rgba(58,62,72,0.98)";

    const swordMetal = weapon
      ? gearVisualColor(weapon.rarity, "weapon")
      : "rgba(178,188,205,1)";

    const swordShine = weapon
      ? gearShineColor(weapon.rarity)
      : "rgba(232,236,244,0.9)";

    const helmColor = helm
      ? gearVisualColor(helm.rarity, "helm")
      : null;

    const charmColor = trinket
      ? gearVisualColor(trinket.rarity, "trinket")
      : ring
        ? gearVisualColor(ring.rarity, "ring")
        : null;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 11, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // cape / back cloth
    ctx.fillStyle = hurt ? "rgba(185,44,44,0.96)" : "rgba(150,32,36,0.96)";
    ctx.beginPath();
    if (facingUp) {
      ctx.moveTo(this.x - 7, this.y + 2 + bob);
      ctx.lineTo(this.x - 4, this.y + 14 + bob);
      ctx.lineTo(this.x + 4, this.y + 14 + bob);
      ctx.lineTo(this.x + 7, this.y + 2 + bob);
    } else if (facingDown) {
      ctx.moveTo(this.x - 9, this.y - 2 + bob);
      ctx.lineTo(this.x - 6, this.y + 12 + bob);
      ctx.lineTo(this.x + 6, this.y + 12 + bob);
      ctx.lineTo(this.x + 9, this.y - 2 + bob);
    } else {
      ctx.moveTo(this.x - 6, this.y - 1 + bob);
      ctx.lineTo(this.x - 8 - side * 2, this.y + 10 + bob);
      ctx.lineTo(this.x + 8 - side * 2, this.y + 10 + bob);
      ctx.lineTo(this.x + 6, this.y - 1 + bob);
    }
    ctx.closePath();
    ctx.fill();

    // boots / legs
    ctx.strokeStyle = bootColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(this.x - 2.3, this.y + 9 + bob);
      ctx.lineTo(this.x - 2.3, this.y + 16 + bob + step);
      ctx.moveTo(this.x + 2.3, this.y + 9 + bob);
      ctx.lineTo(this.x + 2.3, this.y + 16 + bob - step);
    } else {
      ctx.moveTo(this.x - 2.5, this.y + 9 + bob);
      ctx.lineTo(this.x - 3.5, this.y + 15 + bob + step);
      ctx.moveTo(this.x + 2.5, this.y + 9 + bob);
      ctx.lineTo(this.x + 3.5, this.y + 15 + bob - step);
    }
    ctx.stroke();

    // torso
    ctx.fillStyle = hurt ? "rgba(228,228,235,1)" : "rgba(202,204,214,1)";
    roundedRectFill(ctx, this.x - 5.8, this.y - 2 + bob, 11.6, 12.8, 3);

    // chest / armor cloth
    ctx.fillStyle = tunicColor;
    ctx.fillRect(this.x - 2.4, this.y - 1 + bob, 4.8, 10);

    // belt
    ctx.fillStyle = "rgba(118,84,44,0.98)";
    ctx.fillRect(this.x - 5.2, this.y + 4.7 + bob, 10.4, 2.2);

    // shoulders / sleeves
    ctx.strokeStyle = "rgba(214,214,224,0.98)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (facingUp) {
      ctx.moveTo(this.x - 4.6, this.y + 1 + bob);
      ctx.lineTo(this.x - 7.0, this.y - 4.2 + bob);
      ctx.moveTo(this.x + 4.6, this.y + 1 + bob);
      ctx.lineTo(this.x + 7.0, this.y - 4.2 + bob);
    } else if (facingDown) {
      ctx.moveTo(this.x - 4.6, this.y + 1 + bob);
      ctx.lineTo(this.x - 6.3, this.y + 7.2 + bob);
      ctx.moveTo(this.x + 4.6, this.y + 1 + bob);
      ctx.lineTo(this.x + 6.3, this.y + 7.2 + bob);
    } else {
      ctx.moveTo(this.x - 4.8, this.y + 1 + bob);
      ctx.lineTo(this.x - 7.2, this.y + 6 + bob);
      ctx.moveTo(this.x + 4.8, this.y + 1 + bob);
      ctx.lineTo(this.x + 7.2, this.y + 6 + bob);
    }
    ctx.stroke();

    // head
    ctx.fillStyle = hurt ? "rgba(255,214,214,1)" : "rgba(242,214,182,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 7 + bob, 5.3, 0, Math.PI * 2);
    ctx.fill();

    // hair
    ctx.fillStyle = "rgba(78,56,38,0.98)";
    if (facingUp) {
      ctx.beginPath();
      ctx.arc(this.x, this.y - 7.0 + bob, 5.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y - 8.4 + bob, 5.4, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // visible helm / hood
    if (helmColor) {
      ctx.fillStyle = helmColor;
      if (facingUp) {
        ctx.beginPath();
        ctx.arc(this.x, this.y - 8 + bob, 6.2, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
      } else {
        roundedRectFill(ctx, this.x - 5.5, this.y - 11.4 + bob, 11, 4.8, 2.2);
      }

      ctx.fillStyle = gearTrimColor(helm.rarity);
      ctx.fillRect(this.x - 3.5, this.y - 11 + bob, 7, 1.3);
    }

    // face
    ctx.fillStyle = "rgba(28,28,28,0.98)";
    if (facingUp) {
      ctx.fillRect(this.x - 2.4, this.y - 8.2 + bob, 1.2, 1.2);
      ctx.fillRect(this.x + 1.2, this.y - 8.2 + bob, 1.2, 1.2);
    } else if (facingDown) {
      ctx.fillRect(this.x - 2.3, this.y - 6.8 + bob, 1.2, 1.2);
      ctx.fillRect(this.x + 1.1, this.y - 6.8 + bob, 1.2, 1.2);
      ctx.fillRect(this.x - 0.8, this.y - 4.8 + bob, 1.6, 0.8);
    } else {
      ctx.fillRect(this.x - 2.5 + side * 0.5, this.y - 7.8 + bob, 1.2, 1.2);
      ctx.fillRect(this.x + 1.2 + side * 0.5, this.y - 7.8 + bob, 1.2, 1.2);
    }

    // shield / arm plate
    ctx.fillStyle = armor ? gearTrimColor(armor.rarity) : "rgba(108,122,148,0.96)";
    if (vertical) {
      roundedRectFill(ctx, this.x - 2.5, this.y + 1 + bob, 5, 6, 1.2);
    } else {
      roundedRectFill(ctx, this.x - 8.5, this.y + 1 + bob, 2.4, 5.4, 1.2);
    }

    // ring / trinket charm
    if (charmColor) {
      ctx.fillStyle = charmColor;
      ctx.beginPath();
      ctx.arc(this.x + (side * 2.5), this.y + 2.8 + bob, 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.42)";
      ctx.beginPath();
      ctx.arc(this.x + (side * 2.3), this.y + 2.5 + bob, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // sword
    ctx.save();
    if (facingUp) {
      ctx.translate(this.x, this.y - 11 + bob);
      ctx.rotate(-Math.PI / 2);
    } else if (facingDown) {
      ctx.translate(this.x, this.y + 7 + bob);
      ctx.rotate(Math.PI / 2);
    } else {
      const swordAng = Math.atan2(fy || 0, fx || 0.0001);
      ctx.translate(this.x + side * 7, this.y + 1.5 + bob);
      ctx.rotate(swordAng);
    }

    // pommel / grip
    ctx.fillStyle = gearTrimColor(weapon?.rarity || "common");
    ctx.fillRect(-1.4, -3.4, 2.8, 6.8);

    ctx.fillStyle = "rgba(120,84,42,1)";
    ctx.fillRect(-2.8, -1.2, 5.6, 2.4);

    // blade
    ctx.fillStyle = swordMetal;
    ctx.fillRect(2.8, -1, 11, 2);

    // blade shine
    ctx.fillStyle = swordShine;
    ctx.fillRect(4.2, -0.35, 7.2, 0.7);

    // rarity aura on weapon
    if (weapon && weapon.rarity !== "common") {
      ctx.strokeStyle = gearGlowColor(weapon.rarity);
      ctx.lineWidth = 1;
      ctx.strokeRect(2.1, -1.7, 12.3, 3.4);
    }

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

    return { maxHp: this.maxHp, maxMana: this.maxMana, dmg, armor, crit, critMult };
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

    this.home = null;
    this.elite = (hash2(this.seed, this.tier, this.r) >>> 0) % 9 === 0;

    if (this.elite) {
      this.maxHp = Math.round(this.maxHp * 1.75);
      this.hp = this.maxHp;
      this.touchDps *= 1.25;
      this.speed *= 1.08;
    }

    this.attackCd = 0;
    this.wanderT = 0;
    this.wanderDir = { x: 0, y: 0 };

    this.lookType = Math.abs(hash2((x * 10) | 0, (y * 10) | 0, this.seed)) % 4;
    this.skinShift = Math.abs(hash2((x * 7) | 0, (y * 7) | 0, this.tier)) % 4;
    this.oneEye = (Math.abs(hash2((x * 13) | 0, (y * 13) | 0, 17 + this.seed)) % 5) === 0;
    this.tail = (Math.abs(hash2((x * 17) | 0, (y * 17) | 0, 31 + this.seed)) % 2) === 0;
    this.floatSeed = (Math.abs(hash2((x * 19) | 0, (y * 19) | 0, this.seed + 51)) % 1000) / 1000;
    this.pulse = 0;
  }

  xpValue() {
    const base =
      this.kind === "brute" ? 9 :
      this.kind === "caster" ? 8 :
      this.kind === "stalker" ? 7 :
      6;

    const scaled = base + this.tier * 2;
    return this.elite ? Math.round(scaled * 1.8) : scaled;
  }

  update(dt, hero, world, game) {
    if (!this.alive || !hero) return;

    this.animT += dt * (5.7 + this.floatSeed * 2.2);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.pulse = Math.max(0, this.pulse - dt * 4);

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d = Math.hypot(dx, dy) || 0.0001;

    const leashHome = this.home || { x: this.x, y: this.y };
    const homeDx = leashHome.x - this.x;
    const homeDy = leashHome.y - this.y;
    const homeDist = Math.hypot(homeDx, homeDy);

    let tx = 0;
    let ty = 0;
    let moveSpeed = this.speed;

    if (d < 260) {
      if (this.kind === "caster" && d < 120) {
        const n = norm(-dx, -dy);
        tx = n.x;
        ty = n.y;
        moveSpeed *= 0.9;
      } else {
        const n = norm(dx, dy);
        tx = n.x;
        ty = n.y;
      }
    } else if (homeDist > 90) {
      const n = norm(homeDx, homeDy);
      tx = n.x;
      ty = n.y;
      moveSpeed *= 0.7;
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 1.2 + Math.random() * 1.8;
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.x = Math.cos(a);
        this.wanderDir.y = Math.sin(a);
      }
      tx = this.wanderDir.x;
      ty = this.wanderDir.y;
      moveSpeed *= 0.22;
    }

    this.vx = tx * moveSpeed;
    this.vy = ty * moveSpeed;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (!world?.canWalk || world.canWalk(nx, this.y)) this.x = nx;
    else this.vx = 0;

    if (!world?.canWalk || world.canWalk(this.x, ny)) this.y = ny;
    else this.vy = 0;

    const touchR = this.r + 12;
    if (d < touchR && this.kind !== "caster") {
      hero.takeDamage?.(this.touchDps * dt);
    }

    if (this.kind === "caster" && d < 240 && this.attackCd <= 0) {
      this.attackCd = this.elite ? 1.25 : 1.65;

      const n = norm(dx, dy);
      const p = new Projectile(
        this.x + n.x * 12,
        this.y + n.y * 12 - 4,
        n.x * 220,
        n.y * 220,
        Math.round(6 + this.tier * 2.2),
        1.2,
        this.tier,
        {
          color: this.elite ? "rgba(255,170,90,0.95)" : "rgba(255,120,120,0.92)",
          radius: this.elite ? 6 : 5,
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
    this.pulse = 1;

    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();

    const flash = this.hitFlash > 0;
    const bob = Math.sin(this.animT) * 1.15;
    const squash = 1 + Math.sin(this.animT * 0.85) * 0.04 + this.pulse * 0.08;
    const colors = enemyPalette(this.lookType, this.elite, this.skinShift, flash);
    const eye = this.lookType === 3 ? "rgba(160,230,255,1)" : "rgba(255,232,120,1)";

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, this.r * 0.9, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.tail) {
      ctx.strokeStyle = colors.detail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x - 2, this.y + 7 + bob);
      ctx.quadraticCurveTo(this.x - 12, this.y + 11 + bob, this.x - 14, this.y + 4 + bob);
      ctx.stroke();
    }

    if (this.lookType === 0) {
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 2 + bob, 13 * squash, 9 / squash, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(this.x, this.y + 2 + bob, 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.head;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 5 + bob, 5.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.lookType === 1) {
      ctx.fillStyle = colors.body;
      ctx.fillRect(this.x - 10, this.y - 2 + bob, 20, 14);

      ctx.fillStyle = colors.accent;
      ctx.fillRect(this.x - 4, this.y + 1 + bob, 8, 4);

      ctx.fillStyle = colors.head;
      ctx.fillRect(this.x - 7.5, this.y - 11 + bob, 15, 8);

      ctx.fillStyle = colors.detail;
      ctx.fillRect(this.x - 12, this.y - 1 + bob, 3, 6);
      ctx.fillRect(this.x + 9, this.y - 1 + bob, 3, 6);
      ctx.fillRect(this.x - 8.5, this.y + 11 + bob, 3, 4);
      ctx.fillRect(this.x + 5.5, this.y + 11 + bob, 3, 4);

      if (this.elite) {
        ctx.fillStyle = "rgba(255,220,130,0.95)";
        ctx.fillRect(this.x - 4, this.y - 14 + bob, 8, 2);
        ctx.fillRect(this.x - 2, this.y - 16 + bob, 4, 2);
      }
    } else if (this.lookType === 2) {
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 12 + bob);
      ctx.lineTo(this.x + 11, this.y + 1 + bob);
      ctx.lineTo(this.x, this.y + 13 + bob);
      ctx.lineTo(this.x - 11, this.y + 1 + bob);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 5 + bob);
      ctx.lineTo(this.x + 4, this.y + 1 + bob);
      ctx.lineTo(this.x, this.y + 7 + bob);
      ctx.lineTo(this.x - 4, this.y + 1 + bob);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = colors.detail;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 16 + bob);
      ctx.lineTo(this.x + 4, this.y - 8 + bob);
      ctx.lineTo(this.x - 4, this.y - 8 + bob);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = colors.back;
      ctx.beginPath();
      ctx.moveTo(this.x - 9, this.y - 2 + bob);
      ctx.lineTo(this.x - 11, this.y + 12 + bob);
      ctx.lineTo(this.x + 11, this.y + 12 + bob);
      ctx.lineTo(this.x + 9, this.y - 2 + bob);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = colors.body;
      ctx.fillRect(this.x - 7, this.y - 2 + bob, 14, 12);

      ctx.fillStyle = colors.accent;
      ctx.fillRect(this.x - 2, this.y + 1 + bob, 4, 7);

      ctx.fillStyle = colors.head;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 6 + bob, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(180,220,255,0.40)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y + 2 + bob, 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = colors.detail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + 8, this.y - 7 + bob);
      ctx.lineTo(this.x + 8, this.y + 10 + bob);
      ctx.stroke();

      ctx.fillStyle = "rgba(170,235,255,0.95)";
      ctx.beginPath();
      ctx.arc(this.x + 8, this.y - 9 + bob, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = eye;
    if (this.oneEye) {
      ctx.beginPath();
      ctx.arc(this.x, this.y - 5.8 + bob, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(this.x - 4, this.y - 7 + bob, 2, 2);
      ctx.fillRect(this.x + 2, this.y - 7 + bob, 2, 2);
    }

    if (this.elite) {
      ctx.strokeStyle = "rgba(255,224,120,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(this.x, this.y + 1 + bob, this.r + 2.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,238,170,0.28)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(this.x, this.y + 1 + bob, this.r + 5.2 + Math.sin(this.animT * 1.3) * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    const w = 22;
    const h = 4;
    const p = clamp(this.hp / Math.max(1, this.maxHp), 0, 1);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(this.x - w / 2, this.y - 17, w, h);
    ctx.fillStyle = this.elite ? "rgba(255,208,92,0.98)" : "rgba(235,82,108,0.98)";
    ctx.fillRect(this.x - w / 2, this.y - 17, w * p, h);

    ctx.restore();
  }
}

/* ===========================
   PROJECTILE
=========================== */

export class Projectile {
  constructor(x, y, vx, vy, dmg, life = 1, level = 1, style = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.dmg = Math.max(1, dmg | 0);
    this.life = Math.max(0.05, +life || 1);
    this.level = Math.max(1, level | 0);

    this.meta = {
      color: "rgba(145,215,255,0.95)",
      radius: 6,
      type: "bolt",
      hitRadius: 18,
      crit: 0,
      critMult: 1.7,
      pierce: false,
      friendly: true,
      ...((style && typeof style === "object") ? style : {}),
    };

    this.radius = Math.max(2, this.meta.radius || 6);
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

    this.x += this.vx * dt;
    this.y += this.vy * dt;

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
      ctx.arc(this.x, this.y, r * 2.4 * pulse, 0, Math.PI * 2);
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

    const ang = Math.atan2(this.vy, this.vx || 0.0001);
    ctx.translate(this.x, this.y);
    ctx.rotate(ang);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.ellipse(-r * 1.9, 0, r * 2.8, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 3.2, r * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

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

    if (d2 < 100 * 100 && d2 > 1e-6) {
      const n = norm(dx, dy);
      this.x += n.x * 130 * dt;
      this.y += n.y * 130 * dt;
    }

    if (d2 < 18 * 18) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    const bob = Math.sin(this.age * 5) * 2;
    const pulse = 1 + Math.sin(this.age * 8) * 0.06;
    const x = this.x;
    const y = this.y + bob;

    ctx.save();

    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (this.kind === "gold") {
      ctx.fillStyle = "rgba(255,214,84,0.98)";
      ctx.beginPath();
      ctx.arc(x, y, 6 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,244,180,0.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 4.1 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
    } else if (this.kind === "potion") {
      const potionType = this.data?.potionType || "hp";
      ctx.fillStyle = potionType === "mana"
        ? "rgba(90,150,255,0.98)"
        : "rgba(235,82,108,0.98)";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(x - 2, y - 7, 4, 2);
      ctx.fillRect(x - 1.2, y - 9, 2.4, 2);

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(x - 1.4, y - 1.5, 1.2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const col = rarityColor(this.data?.gear?.rarity || "common");
      const glow = rarityGlow(this.data?.gear?.rarity || "common");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 9.5 + Math.sin(this.age * 6) * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.age * 0.8);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = "rgba(255,255,255,0.70)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function rarityColor(r) {
  if (r === "epic") return "rgba(215,150,255,0.98)";
  if (r === "rare") return "rgba(120,190,255,0.98)";
  if (r === "uncommon") return "rgba(145,230,145,0.98)";
  return "rgba(220,220,220,0.96)";
}

function rarityGlow(r) {
  if (r === "epic") return "rgba(180,100,255,0.16)";
  if (r === "rare") return "rgba(90,170,255,0.15)";
  if (r === "uncommon") return "rgba(110,220,120,0.14)";
  return "rgba(220,220,220,0.10)";
}

function enemyPalette(lookType, elite, shift, flash) {
  if (flash) {
    return {
      back: "rgba(255,255,255,1)",
      body: "rgba(255,255,255,1)",
      head: "rgba(250,250,250,1)",
      detail: "rgba(240,240,240,1)",
      accent: "rgba(245,245,245,1)",
    };
  }

  const palettes = [
    { back: "rgba(112,20,20,0.98)", body: "rgba(178,42,42,1)", head: "rgba(150,36,36,1)", detail: "rgba(94,22,22,1)", accent: "rgba(212,76,70,0.95)" },
    { back: "rgba(44,76,54,0.98)", body: "rgba(72,146,106,1)", head: "rgba(60,124,90,1)", detail: "rgba(26,58,40,1)", accent: "rgba(122,218,166,0.95)" },
    { back: "rgba(68,42,88,0.98)", body: "rgba(108,78,162,1)", head: "rgba(92,66,142,1)", detail: "rgba(54,32,76,1)", accent: "rgba(156,130,220,0.95)" },
    { back: "rgba(84,48,18,0.98)", body: "rgba(146,92,34,1)", head: "rgba(132,82,30,1)", detail: "rgba(68,34,14,1)", accent: "rgba(226,156,76,0.95)" },
  ];

  if (elite) {
    return {
      back: "rgba(112,72,18,0.98)",
      body: "rgba(222,154,46,1)",
      head: "rgba(214,164,78,1)",
      detail: "rgba(120,72,18,1)",
      accent: "rgba(255,212,120,0.95)"
    };
  }

  return palettes[shift % palettes.length];
}

function gearVisualColor(rarity, kind = "generic") {
  if (kind === "armor") {
    if (rarity === "epic") return "rgba(142,92,214,0.98)";
    if (rarity === "rare") return "rgba(78,124,214,0.98)";
    if (rarity === "uncommon") return "rgba(70,146,110,0.98)";
    return "rgba(92,104,128,0.98)";
  }

  if (kind === "helm") {
    if (rarity === "epic") return "rgba(124,82,194,0.98)";
    if (rarity === "rare") return "rgba(96,118,172,0.98)";
    if (rarity === "uncommon") return "rgba(84,126,98,0.98)";
    return "rgba(96,98,110,0.98)";
  }

  if (kind === "boots") {
    if (rarity === "epic") return "rgba(118,76,184,0.98)";
    if (rarity === "rare") return "rgba(74,104,162,0.98)";
    if (rarity === "uncommon") return "rgba(64,112,86,0.98)";
    return "rgba(58,62,72,0.98)";
  }

  if (kind === "ring" || kind === "trinket") {
    if (rarity === "epic") return "rgba(226,170,255,0.98)";
    if (rarity === "rare") return "rgba(156,210,255,0.98)";
    if (rarity === "uncommon") return "rgba(180,240,180,0.98)";
    return "rgba(232,214,164,0.98)";
  }

  if (kind === "weapon") {
    if (rarity === "epic") return "rgba(208,164,255,1)";
    if (rarity === "rare") return "rgba(144,204,255,1)";
    if (rarity === "uncommon") return "rgba(186,232,196,1)";
    return "rgba(178,188,205,1)";
  }

  return "rgba(200,200,210,1)";
}

function gearTrimColor(rarity) {
  if (rarity === "epic") return "rgba(255,220,150,1)";
  if (rarity === "rare") return "rgba(230,236,255,1)";
  if (rarity === "uncommon") return "rgba(220,240,220,1)";
  return "rgba(210,186,118,1)";
}

function gearShineColor(rarity) {
  if (rarity === "epic") return "rgba(255,236,255,0.95)";
  if (rarity === "rare") return "rgba(236,246,255,0.95)";
  if (rarity === "uncommon") return "rgba(240,255,244,0.94)";
  return "rgba(232,236,244,0.9)";
}

function gearGlowColor(rarity) {
  if (rarity === "epic") return "rgba(220,160,255,0.95)";
  if (rarity === "rare") return "rgba(140,210,255,0.95)";
  if (rarity === "uncommon") return "rgba(155,235,175,0.92)";
  return "rgba(255,220,140,0.55)";
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

function roundedRectFill(ctx, x, y, w, h, r) {
  const p = new Path2D();
  roundedRectPath(p, x, y, w, h, r);
  ctx.fill(p);
}