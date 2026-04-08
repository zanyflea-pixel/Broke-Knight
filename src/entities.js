// src/entities.js
// v75 ITEMIZATION DEPTH PASS (FULL FILE)

import { clamp, norm, RNG, hash2 } from "./util.js";

/* ===========================
   GEAR
=========================== */

export function makeGear(slot = "weapon", level = 1, rarity = null, seed = 0) {
  const rr = new RNG(hash2(level | 0, slot.length | 0, seed | 0));

  if (!rarity) {
    const r = rr.float();
    rarity =
      r < 0.52 ? "common" :
      r < 0.80 ? "uncommon" :
      r < 0.94 ? "rare" :
      "epic";
  }

  const rarityMult =
    rarity === "epic" ? 2.05 :
    rarity === "rare" ? 1.52 :
    rarity === "uncommon" ? 1.18 :
    1.0;

  const lvl = Math.max(1, level | 0);
  const stats = {
    dmg: 0,
    armor: 0,
    crit: 0,
    critMult: 0,
  };

  const styleRoll = rr.float();

  switch (slot) {
    case "weapon": {
      const base = 4 + lvl * 1.95 + rr.range(0, 5);
      stats.dmg = Math.max(1, Math.round(base * rarityMult));

      if (styleRoll < 0.28) {
        stats.crit = +(0.01 + lvl * 0.0009 + rr.range(0.00, 0.025) * rarityMult).toFixed(3);
      } else if (styleRoll < 0.48) {
        stats.critMult = +(0.08 + lvl * 0.003 + rr.range(0.00, 0.10)).toFixed(3);
      } else if (styleRoll < 0.62 && rarity !== "common") {
        stats.dmg += Math.max(1, Math.round(lvl * 0.35));
      }

      if (rarity === "epic" && rr.float() < 0.45) {
        stats.crit = +(stats.crit + 0.02 + rr.range(0.00, 0.02)).toFixed(3);
      }
      break;
    }

    case "armor":
    case "chest": {
      const base = 2 + lvl * 1.55 + rr.range(0, 4);
      stats.armor = Math.max(1, Math.round(base * rarityMult));

      if (styleRoll < 0.22) {
        stats.dmg = Math.max(0, Math.round(lvl * 0.22));
      } else if (styleRoll < 0.38) {
        stats.crit = +(0.005 + rr.range(0.00, 0.012)).toFixed(3);
      }

      if (rarity === "epic" && rr.float() < 0.38) {
        stats.armor += Math.max(1, Math.round(lvl * 0.3));
      }
      break;
    }

    case "helm": {
      const base = 1 + lvl * 1.05 + rr.range(0, 3);
      stats.armor = Math.max(1, Math.round(base * rarityMult));

      if (styleRoll < 0.34) {
        stats.crit = +(0.006 + lvl * 0.0005 + rr.range(0.00, 0.012)).toFixed(3);
      } else if (styleRoll < 0.52 && rarity !== "common") {
        stats.critMult = +(0.05 + rr.range(0.00, 0.07)).toFixed(3);
      }
      break;
    }

    case "boots": {
      const base = 1 + lvl * 0.95 + rr.range(0, 2.5);
      stats.armor = Math.max(1, Math.round(base * rarityMult));

      if (styleRoll < 0.30) {
        stats.crit = +(0.007 + rr.range(0.00, 0.015)).toFixed(3);
      } else if (styleRoll < 0.52) {
        stats.dmg = Math.max(0, Math.round(lvl * 0.18));
      }
      break;
    }

    case "ring": {
      stats.crit = +(0.012 + lvl * 0.0011 + rr.range(0.00, 0.03) * rarityMult).toFixed(3);

      if (styleRoll < 0.34) {
        stats.dmg = Math.max(1, Math.round(lvl * 0.45 * rarityMult));
      } else if (styleRoll < 0.67) {
        stats.critMult = +(0.10 + lvl * 0.0025 + rr.range(0.00, 0.08)).toFixed(3);
      } else {
        stats.armor = Math.max(0, Math.round(lvl * 0.20));
      }
      break;
    }

    case "trinket": {
      if (styleRoll < 0.33) {
        stats.dmg = Math.max(1, Math.round((1 + lvl * 0.60) * rarityMult));
        stats.crit = +(0.008 + rr.range(0.00, 0.018)).toFixed(3);
      } else if (styleRoll < 0.66) {
        stats.critMult = +(0.12 + lvl * 0.003 + rr.range(0.00, 0.10)).toFixed(3);
        stats.crit = +(0.006 + rr.range(0.00, 0.012)).toFixed(3);
      } else {
        stats.armor = Math.max(1, Math.round((1 + lvl * 0.45) * rarityMult));
        stats.dmg = Math.max(0, Math.round(lvl * 0.25));
      }
      break;
    }

    default: {
      stats.armor = Math.max(0, Math.round((1 + lvl * 0.6) * rarityMult));
      break;
    }
  }

  cleanupStats(stats);

  return {
    slot,
    level: lvl,
    rarity,
    name: gearName(slot, rarity, rr, stats),
    stats,
    price: gearPrice(slot, lvl, rarityMult, stats, rr),
  };
}

function cleanupStats(stats) {
  for (const k of Object.keys(stats)) {
    if (k === "crit" || k === "critMult") {
      stats[k] = +Math.max(0, stats[k] || 0).toFixed(3);
    } else {
      stats[k] = Math.max(0, Math.round(stats[k] || 0));
    }
  }
}

function gearPrice(slot, lvl, rarityMult, stats, rr) {
  const statScore =
    (stats.dmg || 0) * 2.2 +
    (stats.armor || 0) * 1.8 +
    (stats.crit || 0) * 130 +
    (stats.critMult || 0) * 75;

  const slotMod =
    slot === "weapon" ? 1.18 :
    slot === "ring" ? 1.12 :
    slot === "trinket" ? 1.12 :
    slot === "armor" || slot === "chest" ? 1.06 :
    1.0;

  return Math.max(
    6,
    Math.round((lvl * 8 + statScore + rr.range(0, 8)) * rarityMult * slotMod)
  );
}

function gearName(slot, rarity, rr, stats) {
  const rarityPrefix =
    rarity === "epic" ? ["Mythic", "Ancient", "Kingsfall", "Stormforged", "Voidtouched"] :
    rarity === "rare" ? ["Runed", "Gilded", "Knight's", "Hunter's", "Moonlit"] :
    rarity === "uncommon" ? ["Sturdy", "Traveler's", "Mercenary's", "Polished", "Ironbound"] :
    ["Plain", "Worn", "Old", "Simple", "Rough"];

  const offensiveTag =
    (stats.critMult || 0) >= 0.14 ? ["Executioner's", "Duelist's", "Ravager's"] :
    (stats.crit || 0) >= 0.04 ? ["Keen", "Deadeye", "Lucky"] :
    (stats.dmg || 0) >= (stats.armor || 0) + 4 ? ["Heavy", "Savage", "Warborn"] :
    ["Guarded", "Balanced", "Tempered"];

  const namesBySlot = {
    weapon: ["Blade", "Sword", "Wand", "Glaive", "Staff", "Edge"],
    armor: ["Armor", "Mail", "Plate", "Guard", "Cuirass"],
    chest: ["Chestplate", "Vest", "Cuirass", "Tunic"],
    helm: ["Helm", "Cap", "Hood", "Crown", "Visor"],
    boots: ["Boots", "Greaves", "Striders", "Treads", "Walkers"],
    ring: ["Ring", "Band", "Loop", "Seal", "Signet"],
    trinket: ["Charm", "Idol", "Relic", "Totem", "Sigil"],
  };

  const suffixPool =
    slot === "weapon" ? ["of Cuts", "of Sparks", "of Ruin", "of Reach"] :
    slot === "armor" || slot === "chest" ? ["of Guard", "of Stone", "of Resolve"] :
    slot === "helm" ? ["of Sight", "of Thought", "of Focus"] :
    slot === "boots" ? ["of Motion", "of Dust", "of Trails"] :
    slot === "ring" ? ["of Fortune", "of Precision", "of Teeth"] :
    ["of Secrets", "of Echoes", "of Hunger"];

  const core = rr.pick(namesBySlot[slot] || ["Gear"]);
  const prefixA = rr.pick(rarityPrefix);
  const prefixB = rr.float() < 0.42 ? rr.pick(offensiveTag) : null;
  const suffix = rr.float() < 0.55 ? rr.pick(suffixPool) : null;

  let name = prefixB ? `${prefixB} ${core}` : `${prefixA} ${core}`;
  if (suffix) name += ` ${suffix}`;
  return name;
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
      campBuffT: 0,
      campBuffPower: 0,
      dungeonMomentumT: 0,
      dungeonMomentumPower: 0,
      eliteChainT: 0,
      eliteChainCount: 0,
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
      critMult += it.stats.critMult || 0;
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
  constructor(x = 0, y = 0, tier = 1, kind = "blob", seed = 1, elite = null) {
    this.x = x;
    this.y = y;

    this.vx = 0;
    this.vy = 0;

    this.tier = Math.max(1, tier | 0);
    this.kind = kind || "blob";
    this.seed = seed | 0;

    if (elite == null) {
      const eliteRoll = Math.abs(hash2((x * 0.25) | 0, (y * 0.25) | 0, seed | 0)) % 100;
      this.elite = eliteRoll < 9;
    } else {
      this.elite = !!elite;
    }

    this.r = this.kind === "brute" ? 16 : this.kind === "stalker" ? 11 : this.kind === "caster" ? 12 : 13;
    if (this.elite) this.r += 3;
    this.radius = this.r;

    this.speed =
      this.kind === "stalker" ? 92 + this.tier * 2 :
      this.kind === "brute" ? 52 + this.tier * 1.4 :
      this.kind === "caster" ? 58 + this.tier * 1.5 :
      68 + this.tier * 1.8;

    if (this.elite) this.speed *= 1.08;

    this.maxHp =
      this.kind === "brute" ? 34 + this.tier * 16 :
      this.kind === "caster" ? 20 + this.tier * 9 :
      this.kind === "stalker" ? 22 + this.tier * 10 :
      26 + this.tier * 12;

    if (this.elite) this.maxHp = Math.round(this.maxHp * 1.85);
    this.hp = this.maxHp;

    this.touchDps =
      this.kind === "brute" ? 18 + this.tier * 1.6 :
      this.kind === "stalker" ? 14 + this.tier * 1.2 :
      this.kind === "caster" ? 10 + this.tier :
      12 + this.tier * 1.1;

    if (this.elite) this.touchDps *= 1.35;

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

    this.behaviorSeed = Math.abs(hash2(x | 0, y | 0, seed | 0)) % 10000;
    this.sideSign = (this.behaviorSeed % 2 === 0) ? 1 : -1;

    this.strafeT = 0;
    this.burstShotsLeft = 0;
    this.burstGapT = 0;
    this.chargeT = 0;
    this.cooldownT = 0;
    this.pulse = 0;
    this.lungeDir = { x: 0, y: 0 };

    this.preferredRange =
      this.kind === "caster" ? 180 + (this.behaviorSeed % 30) :
      this.kind === "stalker" ? 120 + (this.behaviorSeed % 24) :
      this.kind === "brute" ? 70 + (this.behaviorSeed % 16) :
      92 + (this.behaviorSeed % 18);
  }

  xpValue() {
    const base =
      this.kind === "brute" ? 9 :
      this.kind === "caster" ? 8 :
      this.kind === "stalker" ? 7 :
      6;

    return Math.round((base + this.tier * 2) * (this.elite ? 2.2 : 1));
  }

  lootBonus() {
    return this.elite ? 2 : 0;
  }

  update(dt, hero, world, game) {
    if (!this.alive || !hero) return;

    this.animT += dt * (this.elite ? 7.8 : 6.1);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.aggroT = Math.max(0, this.aggroT - dt);
    this.wanderT = Math.max(0, this.wanderT - dt);
    this.strafeT = Math.max(0, this.strafeT - dt);
    this.burstGapT = Math.max(0, this.burstGapT - dt);
    this.chargeT = Math.max(0, this.chargeT - dt);
    this.cooldownT = Math.max(0, this.cooldownT - dt);
    this.pulse += dt * (this.elite ? 1.6 : 1.2);

    const hx = hero.x;
    const hy = hero.y;
    const dx = hx - this.x;
    const dy = hy - this.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const toHero = { x: dx / d, y: dy / d };
    const side = { x: -toHero.y * this.sideSign, y: toHero.x * this.sideSign };

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

    const aggroBoost = this.elite ? 1.15 : 1.0;

    if (d < directAggroRadius * aggroBoost || heroFromHome < campAggroRadius * aggroBoost) {
      this.aggroT = 2.8;
      this.state = "aggro";
    }

    if (distFromHome > hardLeash) {
      this.state = "return";
      this.aggroT = 0;
      this.chargeT = 0;
      this.burstShotsLeft = 0;
    } else if (this.aggroT <= 0) {
      if (distFromHome > leashRadius) this.state = "return";
      else if (this.state === "aggro") this.state = "idle";
    }

    let move = { x: 0, y: 0 };
    let moveSpeed = this.speed * 0.92;

    if (this.state === "aggro") {
      if (this.kind === "stalker") {
        this._updateStalker(dt, d, toHero, side);
        move = this._stalkerMove(d, toHero, side);
        moveSpeed = this.speed * (this.elite ? 1.06 : 1.0);
      } else if (this.kind === "brute") {
        this._updateBrute(dt, d, toHero);
        move = this._bruteMove(d, toHero);
        moveSpeed = this.speed;
      } else if (this.kind === "caster") {
        this._updateCaster(dt, d, toHero, side, game);
        move = this._casterMove(d, toHero, side);
        moveSpeed = this.speed * 0.95;
      } else {
        this._updateBlob(dt, d, toHero, side);
        move = this._blobMove(d, toHero, side);
        moveSpeed = this.speed * 0.98;
      }
    } else if (this.state === "return") {
      const bd = Math.hypot(backDx, backDy) || 0.0001;
      move.x = backDx / bd;
      move.y = backDy / bd;
      moveSpeed = this.speed * 0.82;

      if (bd < 12) {
        this.state = "idle";
        this.wanderT = 0;
        this.chargeT = 0;
      }
    } else {
      if (this.wanderT <= 0) {
        this.wanderT = 0.8 + Math.random() * 1.5;
        const ang = Math.random() * Math.PI * 2;
        this.wanderDir.x = Math.cos(ang);
        this.wanderDir.y = Math.sin(ang);
      }

      move.x = this.wanderDir.x;
      move.y = this.wanderDir.y;
      moveSpeed = this.speed * 0.34;

      if (distFromHome > 70) {
        const bd = Math.hypot(backDx, backDy) || 1;
        move.x = backDx / bd;
        move.y = backDy / bd;
        moveSpeed = this.speed * 0.48;
      }
    }

    const len = Math.hypot(move.x, move.y) || 1;
    move.x /= len;
    move.y /= len;

    const nx = this.x + move.x * moveSpeed * dt;
    const ny = this.y + move.y * moveSpeed * dt;

    if (!world?.canWalk || world.canWalk(nx, this.y)) this.x = nx;
    if (!world?.canWalk || world.canWalk(this.x, ny)) this.y = ny;
  }

  _updateBlob(dt, d, toHero, side) {
    if (this.strafeT <= 0) {
      this.strafeT = 0.8 + ((this.behaviorSeed % 40) / 40) * 0.8;
      this.sideSign *= -1;
    }

    if (d < 78 && this.cooldownT <= 0) {
      this.cooldownT = this.elite ? 0.55 : 0.7;
      this.sideSign *= -1;
    }

    void dt;
    void toHero;
    void side;
  }

  _blobMove(d, toHero, side) {
    const push = d > 95 ? 1.0 : d < 64 ? -0.22 : 0.48;
    const wobble = 0.36 + Math.sin(this.pulse * 5 + this.variant) * 0.16;

    return {
      x: toHero.x * push + side.x * wobble,
      y: toHero.y * push + side.y * wobble,
    };
  }

  _updateStalker(dt, d, toHero, side) {
    if (this.strafeT <= 0) {
      this.strafeT = 1.1 + ((this.behaviorSeed % 55) / 55) * 0.8;
      this.sideSign *= -1;
    }

    if (this.chargeT <= 0 && this.cooldownT <= 0 && d > 75 && d < 165) {
      this.chargeT = this.elite ? 0.42 : 0.32;
      this.cooldownT = this.elite ? 1.2 : 1.45;
      this.lungeDir = {
        x: toHero.x * 0.92 + side.x * 0.18,
        y: toHero.y * 0.92 + side.y * 0.18,
      };
      const ln = Math.hypot(this.lungeDir.x, this.lungeDir.y) || 1;
      this.lungeDir.x /= ln;
      this.lungeDir.y /= ln;
    }

    void dt;
    void d;
  }

  _stalkerMove(d, toHero, side) {
    if (this.chargeT > 0) {
      return {
        x: this.lungeDir.x,
        y: this.lungeDir.y,
      };
    }

    const distBias = d > this.preferredRange ? 0.84 : d < 78 ? -0.34 : 0.12;
    const orbit = 1.15;

    return {
      x: toHero.x * distBias + side.x * orbit,
      y: toHero.y * distBias + side.y * orbit,
    };
  }

  _updateBrute(dt, d, toHero) {
    if (this.chargeT <= 0 && this.cooldownT <= 0 && d > 58 && d < 150) {
      this.chargeT = this.elite ? 0.78 : 0.62;
      this.cooldownT = this.elite ? 1.9 : 2.25;
      this.lungeDir = { x: toHero.x, y: toHero.y };
    }

    void dt;
  }

  _bruteMove(d, toHero) {
    if (this.chargeT > 0.36) {
      return { x: 0, y: 0 };
    }

    if (this.chargeT > 0) {
      return {
        x: this.lungeDir.x,
        y: this.lungeDir.y,
      };
    }

    if (d < 66) {
      return {
        x: toHero.x * 0.28,
        y: toHero.y * 0.28,
      };
    }

    return {
      x: toHero.x,
      y: toHero.y,
    };
  }

  _updateCaster(dt, d, toHero, side, game) {
    if (this.strafeT <= 0) {
      this.strafeT = 1.0 + ((this.behaviorSeed % 60) / 60) * 1.0;
      this.sideSign *= -1;
    }

    const fireRange = this.elite ? 290 : 260;
    if (d < fireRange) {
      if (this.burstShotsLeft <= 0 && this.attackCd <= 0) {
        this.burstShotsLeft = this.elite ? 3 : 2;
        this.burstGapT = 0;
        this.attackCd = this.elite ? 1.15 : 1.55;
      }

      if (this.burstShotsLeft > 0 && this.burstGapT <= 0) {
        this.burstGapT = this.elite ? 0.16 : 0.22;
        this.burstShotsLeft--;

        const lead = 0.10 + (this.elite ? 0.04 : 0);
        const aim = {
          x: heroLeadX(game?.hero, lead) - this.x,
          y: heroLeadY(game?.hero, lead) - this.y,
        };
        const n = norm(aim.x, aim.y);

        const spread = (Math.random() - 0.5) * (this.elite ? 0.10 : 0.16);
        const cs = Math.cos(spread);
        const sn = Math.sin(spread);
        const rx = n.x * cs - n.y * sn;
        const ry = n.x * sn + n.y * cs;

        const p = new Projectile(
          this.x + rx * 12,
          this.y + ry * 12,
          rx * (this.elite ? 255 : 225),
          ry * (this.elite ? 255 : 225),
          Math.round((6 + this.tier * 2.2) * (this.elite ? 1.4 : 1)),
          1.2,
          this.tier,
          {
            color: this.elite ? "rgba(255,210,120,0.95)" : "rgba(255,120,120,0.92)",
            radius: this.elite ? 6 : 5,
            type: "enemy_bolt",
            hitRadius: this.elite ? 18 : 16,
            onHitHero: true,
            friendly: false,
          }
        );

        if (game?.projectiles?.push) game.projectiles.push(p);
      }
    }

    void dt;
    void toHero;
    void side;
  }

  _casterMove(d, toHero, side) {
    const desired = this.preferredRange;
    let distBias = 0;

    if (d < desired - 28) distBias = -0.95;
    else if (d > desired + 34) distBias = 0.55;
    else distBias = 0.08;

    const orbit = this.elite ? 0.95 : 0.72;

    return {
      x: toHero.x * distBias + side.x * orbit,
      y: toHero.y * distBias + side.y * orbit,
    };
  }

  takeDamage(amount = 0) {
    this.hp -= Math.max(1, amount | 0);
    this.hitFlash = 1;
    this.aggroT = Math.max(this.aggroT, 3.2);
    this.state = "aggro";
    this.sideSign *= -1;

    if (this.hp <= 0) {
      this.alive = false;
      this.dead = true;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.animT * 1.2) * (this.elite ? 1.3 : 0.9);
    const pulse = 1 + Math.sin(this.animT * 2.1) * (this.elite ? 0.07 : 0.04);

    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = this.elite ? "rgba(255,215,120,0.20)" : "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, this.radius + 1, this.radius * 0.85, 4, 0, 0, Math.PI * 2);
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

    if (this.elite) {
      main =
        this.kind === "caster" ? "#ffd87e" :
        this.kind === "stalker" ? "#ffb86b" :
        this.kind === "brute" ? "#ff9f5f" :
        "#ffc16b";
      dark = "#7a4a16";
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

      if (this.chargeT > 0.36) {
        ctx.strokeStyle = "rgba(255,220,150,0.90)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (this.kind === "stalker") {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius - 2);
      ctx.lineTo(this.radius + 1, this.radius - 2);
      ctx.lineTo(-this.radius - 1, this.radius - 2);
      ctx.closePath();
      ctx.fill();

      if (this.chargeT > 0) {
        ctx.strokeStyle = "rgba(200,255,200,0.90)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (this.kind === "caster") {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = this.elite ? "rgba(255,233,180,0.70)" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = this.elite ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
      ctx.stroke();

      if (this.burstShotsLeft > 0) {
        ctx.strokeStyle = "rgba(255,180,180,0.92)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
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

    if (this.elite) {
      ctx.strokeStyle = "rgba(255,224,140,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
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

    if (this.elite) {
      ctx.fillStyle = "rgba(255,230,160,0.98)";
      ctx.beginPath();
      ctx.moveTo(-5, -this.radius - 4);
      ctx.lineTo(-1.5, -this.radius - 10);
      ctx.lineTo(0, -this.radius - 5);
      ctx.lineTo(1.5, -this.radius - 10);
      ctx.lineTo(5, -this.radius - 4);
      ctx.closePath();
      ctx.fill();
    }

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

    this.dmg = Math.max(1, Math.round(dmg || 1));
    this.life = Math.max(0.05, +life || 1);
    this.level = Math.max(1, level | 0);

    this.meta = {
      color: "rgba(255,209,102,0.95)",
      radius: 4,
      type: "bolt",
      hitRadius: 18,
      pierce: false,
      friendly: true,
      critChance: 0,
      critMult: 1.7,
      hitColor: null,
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

function heroLeadX(hero, t) {
  return (hero?.x || 0) + (hero?.vx || 0) * t;
}

function heroLeadY(hero, t) {
  return (hero?.y || 0) + (hero?.vy || 0) * t;
}