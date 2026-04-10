// src/entities.js
// v95.2 AIM-FACING HERO WEAPON (FULL FILE)

import { clamp, dist2, norm, hash2, RNG } from "./util.js";

/* =========================================================
   GEAR
========================================================= */

const RARITIES = ["common", "uncommon", "rare", "epic"];

const SLOT_POOLS = {
  weapon: ["Rusty Sword", "Iron Blade", "Hunter Spear", "Knight Saber", "Moon Edge", "Storm Pike"],
  armor: ["Cloth Vest", "Leather Coat", "Scale Armor", "Knight Mail", "Runed Plate"],
  chest: ["Traveler Coat", "Guard Breastplate", "Templar Chest"],
  helm: ["Leather Hood", "Iron Helm", "Knight Helm", "Runed Helm"],
  boots: ["Field Boots", "Iron Greaves", "Swift Boots", "Storm Greaves"],
  ring: ["Copper Ring", "Silver Ring", "Ruby Ring", "Moon Ring"],
  trinket: ["Lucky Charm", "Bone Talisman", "Sun Relic", "Warden Idol"],
};

function seededChoice(arr, seed) {
  const idx = Math.abs(hash2(seed | 0, arr.length | 0, 991)) % arr.length;
  return arr[idx];
}

function rarityFromSeed(seed, explicit = null) {
  if (explicit && RARITIES.includes(explicit)) return explicit;
  const r = (Math.abs(hash2(seed | 0, 31415, 2718)) % 1000) / 1000;
  if (r < 0.56) return "common";
  if (r < 0.83) return "uncommon";
  if (r < 0.95) return "rare";
  return "epic";
}

function rarityMult(rarity) {
  if (rarity === "epic") return 1.9;
  if (rarity === "rare") return 1.45;
  if (rarity === "uncommon") return 1.18;
  return 1.0;
}

function rarityColor(rarity) {
  if (rarity === "epic") return "#c89bff";
  if (rarity === "rare") return "#8cd3ff";
  if (rarity === "uncommon") return "#93e79a";
  return "#d9dde7";
}

function makeStatsForSlot(slot, level, rarity, seed) {
  const lvl = Math.max(1, level | 0);
  const mult = rarityMult(rarity);

  const stats = {
    dmg: 0,
    armor: 0,
    crit: 0,
    critMult: 0,
    hp: 0,
    mana: 0,
    move: 0,
  };

  const rollA = (Math.abs(hash2(seed | 0, 101, 17)) % 1000) / 1000;
  const rollB = (Math.abs(hash2(seed | 0, 202, 29)) % 1000) / 1000;
  const rollC = (Math.abs(hash2(seed | 0, 303, 41)) % 1000) / 1000;

  if (slot === "weapon") {
    stats.dmg = Math.round((5 + lvl * 1.8 + rollA * 3.2) * mult);
    stats.crit = +(0.01 + rollB * 0.06 + (rarity === "rare" ? 0.02 : 0) + (rarity === "epic" ? 0.04 : 0)).toFixed(3);
    stats.critMult = +(0.08 + rollC * 0.22 + (rarity === "epic" ? 0.20 : rarity === "rare" ? 0.10 : 0)).toFixed(3);
  } else if (slot === "armor" || slot === "chest") {
    stats.armor = Math.round((2 + lvl * 1.35 + rollA * 2.6) * mult);
    stats.hp = Math.round((8 + lvl * 2.0 + rollB * 10) * (0.7 + mult * 0.35));
  } else if (slot === "helm") {
    stats.armor = Math.round((1 + lvl * 0.85 + rollA * 1.8) * mult);
    stats.hp = Math.round((4 + lvl * 1.1 + rollB * 6) * (0.75 + mult * 0.25));
  } else if (slot === "boots") {
    stats.armor = Math.round((1 + lvl * 0.6 + rollA * 1.2) * Math.max(1, mult * 0.9));
    stats.move = +(0.03 + rollB * 0.06 + (rarity === "rare" ? 0.03 : 0) + (rarity === "epic" ? 0.05 : 0)).toFixed(3);
  } else if (slot === "ring") {
    stats.crit = +(0.02 + rollA * 0.05 + (rarity === "rare" ? 0.02 : 0) + (rarity === "epic" ? 0.03 : 0)).toFixed(3);
    stats.critMult = +(0.05 + rollB * 0.16 + (rarity === "epic" ? 0.12 : 0)).toFixed(3);
    stats.dmg = Math.round((lvl * 0.6 + rollC * 2.2) * (0.55 + mult * 0.5));
  } else if (slot === "trinket") {
    stats.mana = Math.round((8 + lvl * 1.6 + rollA * 8) * (0.75 + mult * 0.25));
    stats.hp = Math.round((5 + lvl * 1.2 + rollB * 5) * (0.7 + mult * 0.25));
    stats.dmg = Math.round((lvl * 0.35 + rollC * 1.8) * (0.45 + mult * 0.45));
  }

  return stats;
}

function gearPrice(item) {
  const s = item.stats || {};
  const score =
    (s.dmg || 0) * 2.2 +
    (s.armor || 0) * 1.7 +
    (s.crit || 0) * 120 +
    (s.critMult || 0) * 90 +
    (s.hp || 0) * 0.28 +
    (s.mana || 0) * 0.20 +
    (s.move || 0) * 90;

  return Math.max(10, Math.round(10 + score * 0.9 + item.level * 2.4));
}

export function makeGear(slot = "weapon", level = 1, rarity = null, seed = 1) {
  const realSlot = SLOT_POOLS[slot] ? slot : "weapon";
  const realRarity = rarityFromSeed(seed, rarity);
  const nameCore = seededChoice(SLOT_POOLS[realSlot], seed);
  const stats = makeStatsForSlot(realSlot, level, realRarity, seed);

  const item = {
    id: `${realSlot}-${level}-${seed}-${realRarity}`,
    slot: realSlot,
    level: Math.max(1, level | 0),
    rarity: realRarity,
    name: nameCore,
    stats,
    color: rarityColor(realRarity),
    price: 0,
  };

  item.price = gearPrice(item);
  return item;
}

/* =========================================================
   HERO
========================================================= */

export class Hero {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    this.r = 12;
    this.radius = this.r;

    this.level = 1;
    this.xp = 0;
    this.nextXp = 24;

    this.maxHp = 100;
    this.hp = this.maxHp;
    this.maxMana = 60;
    this.mana = this.maxMana;

    this.hpRegen = 0.9;
    this.manaRegen = 3.2;
    this.baseMove = 140;

    this.gold = 0;
    this.inventory = [];
    this.equip = {
      weapon: makeGear("weapon", 1, "common", 101),
      armor: makeGear("armor", 1, "common", 202),
      helm: null,
      boots: null,
      ring: null,
      trinket: null,
    };
    this.potions = { hp: 2, mana: 1 };

    this.lastMove = { x: 1, y: 0 };
    this.aimDir = { x: 1, y: 0 };

    this.state = {
      sailing: false,
      dashT: 0,
      hurtT: 0,
      campBuffT: 0,
      campBuffPower: 0,
      campBuffType: "",
      campBuffName: "",
      dungeonMomentumT: 0,
      dungeonMomentumPower: 0,
      eliteChainT: 0,
      eliteChainCount: 0,
    };

    this._animWalk = 0;
  }

  update(dt) {
    this.state.dashT = Math.max(0, (this.state.dashT || 0) - dt);
    this.state.hurtT = Math.max(0, (this.state.hurtT || 0) - dt);

    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 6;
    this._animWalk += dt * (moving ? 8 : 2);

    const stats = this.getStats();
    this.maxHp = stats.maxHp;
    this.maxMana = stats.maxMana;

    this.hp = Math.min(this.maxHp, this.hp + stats.hpRegen * dt);
    this.mana = Math.min(this.maxMana, this.mana + stats.manaRegen * dt);

    if (moving) {
      const mv = norm(this.vx, this.vy);
      this.lastMove.x = mv.x;
      this.lastMove.y = mv.y;
    }
  }

  getStats() {
    const stats = {
      maxHp: 100 + (this.level - 1) * 12,
      maxMana: 60 + (this.level - 1) * 7,
      dmg: 8 + (this.level - 1) * 2.2,
      armor: 1 + (this.level - 1) * 0.45,
      crit: 0.04,
      critMult: 1.60,
      move: this.baseMove,
      hpRegen: this.hpRegen + (this.level - 1) * 0.06,
      manaRegen: this.manaRegen + (this.level - 1) * 0.12,
    };

    for (const item of Object.values(this.equip || {})) {
      if (!item?.stats) continue;
      const s = item.stats;
      stats.maxHp += s.hp || 0;
      stats.maxMana += s.mana || 0;
      stats.dmg += s.dmg || 0;
      stats.armor += s.armor || 0;
      stats.crit += s.crit || 0;
      stats.critMult += s.critMult || 0;
      stats.move += (s.move || 0) * 100;
    }

    return stats;
  }

  getMoveSpeed(game) {
    let speed = this.getStats().move;
    const mult = game?.world?.getMoveModifier?.(this.x, this.y) ?? 1;
    speed *= mult;

    if (this.state?.dashT > 0) speed *= 1.24;
    if (this.state?.sailing) speed *= 1.10;

    return speed;
  }

  spendMana(cost) {
    const c = Math.max(0, +cost || 0);
    if (this.mana < c) return false;
    this.mana -= c;
    return true;
  }

  usePotion(kind) {
    if (kind === "mana") {
      if ((this.potions.mana || 0) <= 0) return false;
      if (this.mana >= this.maxMana) return false;
      this.potions.mana--;
      this.mana = Math.min(this.maxMana, this.mana + Math.round(this.maxMana * 0.50));
      return true;
    }

    if ((this.potions.hp || 0) <= 0) return false;
    if (this.hp >= this.maxHp) return false;
    this.potions.hp--;
    this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.48));
    return true;
  }

  giveXP(amount) {
    let gain = Math.max(0, Math.round(amount || 0));

    while (gain > 0) {
      const need = Math.max(1, this.nextXp - this.xp);
      const take = Math.min(need, gain);
      this.xp += take;
      gain -= take;

      if (this.xp >= this.nextXp) {
        this.xp -= this.nextXp;
        this.level++;
        this.nextXp = Math.round(this.nextXp * 1.32 + 10);

        const stats = this.getStats();
        this.maxHp = stats.maxHp;
        this.maxMana = stats.maxMana;
        this.hp = this.maxHp;
        this.mana = this.maxMana;
      }
    }
  }

  takeDamage(amount) {
    const raw = Math.max(1, +amount || 1);
    const armor = this.getStats().armor || 0;
    const reduced = Math.max(1, raw * (100 / (100 + armor * 12)));
    const dealt = Math.round(reduced);

    this.hp = Math.max(0, this.hp - dealt);
    this.state.hurtT = 0.20;
    return dealt;
  }

  _getFacing() {
    const aim = norm(this.aimDir?.x || 0, this.aimDir?.y || 0);
    if (Math.abs(aim.x) > 0.001 || Math.abs(aim.y) > 0.001) return aim;
    return norm(this.lastMove?.x || 1, this.lastMove?.y || 0);
  }

  draw(ctx) {
    const hurt = (this.state?.hurtT || 0) > 0;
    const sailing = !!this.state?.sailing;
    const facing = this._getFacing();
    const bob = Math.sin(this._animWalk) * 1.5;
    const legA = Math.sin(this._animWalk) * 4;
    const legB = Math.sin(this._animWalk + Math.PI) * 4;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = sailing ? "rgba(0,0,0,0.16)" : "rgba(0,0,0,0.20)";
    ctx.beginPath();
    ctx.ellipse(0, 16, sailing ? 16 : 12, sailing ? 7 : 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sailing) {
      this._drawBoat(ctx, facing);
      this._drawHeroUpper(ctx, facing, hurt, true);
      ctx.restore();
      return;
    }

    this._drawCape(ctx, facing, hurt);
    this._drawLeg(ctx, -5, 8, legA, this.equip?.boots, hurt);
    this._drawLeg(ctx, 5, 8, legB, this.equip?.boots, hurt);
    this._drawHeroTorso(ctx, hurt);
    this._drawArmor(ctx, this.equip?.armor || this.equip?.chest, hurt);
    this._drawAccessoryGlow(ctx, hurt);
    this._drawArm(ctx, -8, -1, -0.3, hurt, false);
    this._drawWeaponArm(ctx, facing, hurt);
    this._drawHead(ctx, hurt);
    this._drawHelm(ctx, this.equip?.helm, hurt);

    ctx.fillStyle = hurt ? "#ffb9b9" : "#e6d7a4";
    ctx.fillRect(-4, 4, 8, 2);

    ctx.restore();
  }

  _drawBoat(ctx, facing) {
    ctx.save();
    ctx.translate(0, 4);

    ctx.fillStyle = "#5d3e22";
    ctx.beginPath();
    ctx.moveTo(-18, 6);
    ctx.lineTo(-10, -6);
    ctx.lineTo(10, -6);
    ctx.lineTo(18, 6);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#84562f";
    ctx.beginPath();
    ctx.moveTo(-14, 4);
    ctx.lineTo(-8, -2);
    ctx.lineTo(8, -2);
    ctx.lineTo(14, 4);
    ctx.lineTo(9, 7);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.stroke();

    ctx.strokeStyle = "rgba(210,235,255,0.38)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-facing.x * 10 - 4, -facing.y * 6 + 9);
    ctx.lineTo(-facing.x * 16 - 7, -facing.y * 10 + 12);
    ctx.moveTo(-facing.x * 10 + 4, -facing.y * 6 + 9);
    ctx.lineTo(-facing.x * 16 + 7, -facing.y * 10 + 12);
    ctx.stroke();

    ctx.restore();
  }

  _drawHeroUpper(ctx, facing, hurt, seated = false) {
    this._drawHead(ctx, hurt);
    this._drawHelm(ctx, this.equip?.helm, hurt);

    ctx.fillStyle = hurt ? "#d76e78" : "#7b4d9c";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-7, -2, 14, 12, 4);
      ctx.fill();
    } else {
      ctx.fillRect(-7, -2, 14, 12);
    }

    this._drawArmor(ctx, this.equip?.armor || this.equip?.chest, hurt);
    this._drawWeaponArm(ctx, facing, hurt, seated);
  }

  _drawCape(ctx, facing, hurt) {
    ctx.save();
    const sway = facing.x * 2.4;
    ctx.fillStyle = hurt ? "#873c46" : "#5b2f6e";
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-11 - sway, 10);
    ctx.lineTo(0, 15);
    ctx.lineTo(11 - sway, 10);
    ctx.lineTo(7, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawLeg(ctx, x, y, swing, boots, hurt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing * 0.03);

    ctx.fillStyle = hurt ? "#6d5f6f" : "#4f5b74";
    ctx.fillRect(-2.5, 0, 5, 10);

    const bootColor = boots ? this._gearVisualColor(boots, "#7a5b42") : "#684f39";
    ctx.fillStyle = hurt ? "#8b7070" : bootColor;
    ctx.fillRect(-3.5, 9, 7, 4);

    ctx.restore();
  }

  _drawHeroTorso(ctx, hurt) {
    ctx.fillStyle = hurt ? "#936a72" : "#55698a";
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(8, -2);
    ctx.lineTo(10, 8);
    ctx.lineTo(0, 13);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hurt ? "#b88c8c" : "#d0d8ea";
    ctx.fillRect(-3, 1, 6, 7);
  }

  _drawArmor(ctx, armorItem, hurt) {
    if (!armorItem) return;

    const col = this._gearVisualColor(armorItem, "#8994a8");
    const trim = this._gearTrimColor(armorItem);

    ctx.fillStyle = hurt ? "#9f7e7e" : col;
    ctx.beginPath();
    ctx.moveTo(-9, -2);
    ctx.lineTo(9, -2);
    ctx.lineTo(10, 8);
    ctx.lineTo(0, 13);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hurt ? "#d4a7a7" : trim;
    ctx.fillRect(-5, 0, 10, 2);
    ctx.fillRect(-4, 4, 8, 5);

    ctx.fillStyle = hurt ? "#ac8b8b" : this._shade(col, -18);
    ctx.fillRect(-11, 0, 3, 5);
    ctx.fillRect(8, 0, 3, 5);
  }

  _drawAccessoryGlow(ctx, hurt) {
    const ring = this.equip?.ring;
    const trinket = this.equip?.trinket;
    if (!ring && !trinket) return;

    ctx.save();
    ctx.globalAlpha = hurt ? 0.45 : 0.85;

    ctx.fillStyle = ring ? "#ffd97a" : "#9ad4ff";
    ctx.beginPath();
    ctx.arc(6, 1, 1.8, 0, Math.PI * 2);
    ctx.fill();

    if (trinket) {
      ctx.fillStyle = "#aee0ff";
      ctx.beginPath();
      ctx.arc(-6, 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawArm(ctx, x, y, rot, hurt, weaponSide = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.fillStyle = hurt ? "#e3a3a3" : "#f2c7a7";
    ctx.fillRect(-2, 0, 4, 10);

    if (!weaponSide) {
      ctx.fillStyle = hurt ? "#9f7e7e" : "#6b7894";
      ctx.fillRect(-2.5, -1, 5, 4);
    }

    ctx.restore();
  }

  _drawWeaponArm(ctx, facing, hurt, seated = false) {
    const angle = Math.atan2(facing.y, facing.x);
    const armX = 8;
    const armY = -1;

    ctx.save();
    ctx.translate(armX, armY);
    ctx.rotate(angle);

    ctx.fillStyle = hurt ? "#e3a3a3" : "#f2c7a7";
    ctx.fillRect(-2, -1, 4, 11);

    ctx.fillStyle = hurt ? "#9f7e7e" : "#6b7894";
    ctx.fillRect(-2.5, -2, 5, 4);

    const weapon = this.equip?.weapon;
    this._drawWeapon(ctx, weapon, hurt, seated);

    ctx.restore();
  }

  _drawWeapon(ctx, weaponItem, hurt, seated = false) {
    const wcol = weaponItem ? this._gearVisualColor(weaponItem, "#b6bcc7") : "#a9b0bc";
    const trim = weaponItem ? this._gearTrimColor(weaponItem) : "#e7edf8";
    const kind = (weaponItem?.name || "").toLowerCase();

    // Handle is anchored in the hand. Blade points in facing direction because
    // the whole arm + weapon group is rotated together.
    ctx.fillStyle = hurt ? "#866b6b" : "#6e4c2e";
    ctx.fillRect(-1.5, 6, 3, 10);

    if (kind.includes("spear") || kind.includes("pike")) {
      ctx.fillStyle = hurt ? "#b7a3a3" : wcol;
      ctx.fillRect(-1, -12, 2, 18);

      ctx.fillStyle = hurt ? "#f0bcbc" : trim;
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.lineTo(5, -10);
      ctx.lineTo(0, -6);
      ctx.lineTo(-5, -10);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = hurt ? "#b9a6a6" : wcol;
      ctx.fillRect(-2.5, -14, 5, 20);

      ctx.fillStyle = hurt ? "#f1c0c0" : trim;
      ctx.beginPath();
      ctx.moveTo(-2.5, -14);
      ctx.lineTo(0, -20);
      ctx.lineTo(2.5, -14);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = hurt ? "#8e7070" : "#8d6a3c";
      ctx.fillRect(-5, 5, 10, 2.5);
    }

    if (!seated && weaponItem?.rarity === "epic") {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -8, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawHead(ctx, hurt) {
    ctx.fillStyle = hurt ? "#e6a8a8" : "#f3c7a5";
    ctx.beginPath();
    ctx.arc(0, -9, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#5d3f3f" : "#5a3829";
    ctx.beginPath();
    ctx.arc(0, -11, 7.5, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = "#1b1e24";
    ctx.fillRect(-3.5, -9, 1.5, 1.5);
    ctx.fillRect(2, -9, 1.5, 1.5);
  }

  _drawHelm(ctx, helmItem, hurt) {
    if (!helmItem) return;

    const base = this._gearVisualColor(helmItem, "#8d97a6");
    const trim = this._gearTrimColor(helmItem);

    ctx.fillStyle = hurt ? "#ab8b8b" : base;
    ctx.beginPath();
    ctx.arc(0, -10.5, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-6.5, -10.5, 13, 3.5);

    ctx.fillStyle = hurt ? "#d6a7a7" : trim;
    ctx.fillRect(-2, -16, 4, 3);

    if (
      helmItem?.rarity === "rare" ||
      helmItem?.rarity === "epic" ||
      (helmItem?.name || "").toLowerCase().includes("helm")
    ) {
      ctx.fillStyle = hurt ? "#9d7a7a" : this._shade(base, -16);
      ctx.fillRect(-7, -8, 2, 5);
      ctx.fillRect(5, -8, 2, 5);
    }
  }

  _gearVisualColor(item, fallback) {
    const slot = item?.slot || "";
    const rarity = item?.rarity || "common";

    if (slot === "weapon") {
      if (rarity === "epic") return "#cab7ff";
      if (rarity === "rare") return "#b7ddff";
      if (rarity === "uncommon") return "#c2d8c4";
      return "#c2c7cf";
    }

    if (slot === "armor" || slot === "chest" || slot === "helm") {
      if (rarity === "epic") return "#7860b2";
      if (rarity === "rare") return "#5c7faa";
      if (rarity === "uncommon") return "#6b8560";
      return "#7f8a97";
    }

    if (slot === "boots") {
      if (rarity === "epic") return "#7d60a8";
      if (rarity === "rare") return "#637da0";
      if (rarity === "uncommon") return "#6f6b44";
      return "#7a5b42";
    }

    return fallback;
  }

  _gearTrimColor(item) {
    const rarity = item?.rarity || "common";
    if (rarity === "epic") return "#ead4ff";
    if (rarity === "rare") return "#d6f0ff";
    if (rarity === "uncommon") return "#def6c9";
    return "#e5dcc2";
  }

  _shade(hex, amt = 0) {
    const s = String(hex || "#888888").replace("#", "");
    if (s.length !== 6) return hex;
    const r = clamp(parseInt(s.slice(0, 2), 16) + amt, 0, 255);
    const g = clamp(parseInt(s.slice(2, 4), 16) + amt, 0, 255);
    const b = clamp(parseInt(s.slice(4, 6), 16) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }
}

/* =========================================================
   ENEMY
========================================================= */

export class Enemy {
  constructor(x = 0, y = 0, level = 1, kind = "blob", seed = 1, elite = false) {
    this.x = x;
    this.y = y;
    this.seed = seed | 0;
    this.kind = kind || "blob";
    this.level = Math.max(1, level | 0);
    this.tier = Math.max(1, Math.floor((this.level + 1) / 3));
    this.elite = !!elite;
    this.boss = false;

    this.alive = true;
    this.dead = false;

    this.home = { x, y };
    this.campId = null;

    this._rng = new RNG(hash2(this.seed, 8801));
    this._wanderA = this._rng.float() * Math.PI * 2;
    this._attackCd = 0;
    this._specialCd = 1.1 + this._rng.float() * 1.8;
    this._hurtT = 0;
    this._anim = this._rng.float() * 10;

    if (this.kind === "brute") {
      this.r = 15;
      this.speed = 58 + this.level * 0.45;
      this.touchDps = 7 + this.level * 0.48;
      this.maxHp = 42 + this.level * 9;
      this.color = "#8f5c4f";
    } else if (this.kind === "stalker") {
      this.r = 11;
      this.speed = 92 + this.level * 0.75;
      this.touchDps = 5 + this.level * 0.42;
      this.maxHp = 28 + this.level * 6;
      this.color = "#5f7b58";
    } else if (this.kind === "caster") {
      this.r = 11;
      this.speed = 50 + this.level * 0.35;
      this.touchDps = 3 + this.level * 0.20;
      this.maxHp = 24 + this.level * 5;
      this.color = "#6c62a8";
    } else if (this.kind === "wolf") {
      this.r = 10;
      this.speed = 100 + this.level * 0.80;
      this.touchDps = 5 + this.level * 0.34;
      this.maxHp = 22 + this.level * 4;
      this.color = "#8a745b";
    } else if (this.kind === "scout") {
      this.r = 9;
      this.speed = 112 + this.level * 0.90;
      this.touchDps = 4 + this.level * 0.28;
      this.maxHp = 18 + this.level * 3.8;
      this.color = "#b1ae63";
    } else if (this.kind === "ashling") {
      this.r = 12;
      this.speed = 72 + this.level * 0.55;
      this.touchDps = 6 + this.level * 0.38;
      this.maxHp = 34 + this.level * 6.2;
      this.color = "#7f7670";
    } else if (this.kind === "unknown") {
      this.r = 16;
      this.speed = 86 + this.level * 0.70;
      this.touchDps = 10 + this.level * 0.62;
      this.maxHp = 64 + this.level * 12;
      this.color = "#6f47c2";
    } else {
      this.kind = "blob";
      this.r = 12;
      this.speed = 68 + this.level * 0.5;
      this.touchDps = 4 + this.level * 0.30;
      this.maxHp = 30 + this.level * 6;
      this.color = "#8e4b4b";
    }

    if (this.elite) {
      this.maxHp = Math.round(this.maxHp * 1.75);
      this.touchDps *= 1.28;
      this.speed *= 1.08;
      this.r += 2;
    }

    this.radius = this.r;
    this.hp = this.maxHp;
    this.vx = 0;
    this.vy = 0;
  }

  update(dt, hero, world, game) {
    if (!this.alive || !hero) return;

    this._anim += dt * (2 + this.speed * 0.02);
    this._attackCd = Math.max(0, this._attackCd - dt);
    this._specialCd = Math.max(0, this._specialCd - dt);
    this._hurtT = Math.max(0, this._hurtT - dt);

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2 || 1);

    const calmHome =
      this.campId != null &&
      game?.menu?.open === "shop" &&
      game?.shop?.campId === this.campId;

    let targetX = this.x;
    let targetY = this.y;
    let desiredSpeed = this.speed;

    if (calmHome) {
      targetX = this.home?.x ?? this.x;
      targetY = this.home?.y ?? this.y;
      desiredSpeed *= 0.85;
    } else if (this.kind === "caster") {
      if (d < 120) {
        targetX = this.x - dx;
        targetY = this.y - dy;
      } else if (d < 280) {
        targetX = hero.x;
        targetY = hero.y;
      } else {
        this._wanderA += dt * 0.55;
        targetX = (this.home?.x ?? this.x) + Math.cos(this._wanderA) * 22;
        targetY = (this.home?.y ?? this.y) + Math.sin(this._wanderA) * 22;
        desiredSpeed *= 0.6;
      }

      if (this._specialCd <= 0 && d < 260 && game?.projectiles) {
        this._specialCd = this.elite ? 1.6 : 2.3;
        const n = norm(dx, dy);
        game.projectiles.push(
          new Projectile(
            this.x + n.x * 14,
            this.y + n.y * 14,
            n.x * 170,
            n.y * 170,
            4 + this.level * 0.85 + (this.elite ? 3 : 0),
            1.8,
            this.level,
            {
              friendly: false,
              onHitHero: true,
              color: this.elite ? "rgba(255,164,120,0.96)" : "rgba(204,172,255,0.94)",
              radius: this.elite ? 5 : 4,
              hitRadius: this.elite ? 20 : 17,
            }
          )
        );
      }
    } else if (this.kind === "wolf" || this.kind === "scout") {
      if (d < 240) {
        targetX = hero.x;
        targetY = hero.y;
        desiredSpeed *= this.kind === "scout" ? 1.18 : 1.10;
      } else {
        this._wanderA += dt * 0.8;
        const hr = this.kind === "scout" ? 46 : 34;
        targetX = (this.home?.x ?? this.x) + Math.cos(this._wanderA) * hr;
        targetY = (this.home?.y ?? this.y) + Math.sin(this._wanderA) * hr;
        desiredSpeed *= 0.75;
      }
    } else if (this.kind === "unknown") {
      if (d < 320) {
        targetX = hero.x;
        targetY = hero.y;
        desiredSpeed *= 1.08;
      } else {
        this._wanderA += dt * 0.52;
        targetX = (this.home?.x ?? this.x) + Math.cos(this._wanderA) * 40;
        targetY = (this.home?.y ?? this.y) + Math.sin(this._wanderA) * 40;
        desiredSpeed *= 0.7;
      }
    } else if (d < 260) {
      targetX = hero.x;
      targetY = hero.y;
      if (this.kind === "stalker") desiredSpeed *= 1.16;
      if (this.kind === "brute") desiredSpeed *= 0.96;
    } else {
      this._wanderA += dt * (0.45 + (this.seed % 5) * 0.02);
      const hr = this.kind === "brute" ? 18 : 30;
      targetX = (this.home?.x ?? this.x) + Math.cos(this._wanderA) * hr;
      targetY = (this.home?.y ?? this.y) + Math.sin(this._wanderA) * hr;
      desiredSpeed *= 0.52;
    }

    const n = norm(targetX - this.x, targetY - this.y);
    this.vx += (n.x * desiredSpeed - this.vx) * 0.12;
    this.vy += (n.y * desiredSpeed - this.vy) * 0.12;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (!world) {
      this.x = nx;
      this.y = ny;
    } else {
      if (world.canWalk?.(nx, this.y)) this.x = nx;
      else this.vx *= -0.15;

      if (world.canWalk?.(this.x, ny)) this.y = ny;
      else this.vy *= -0.15;
    }
  }

  takeDamage(amount) {
    const dmg = Math.max(1, Math.round(amount || 1));
    this.hp -= dmg;
    this._hurtT = 0.16;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.dead = true;
    }
  }

  xpValue() {
    const base = 5 + this.level * 1.2;
    if (this.boss) return Math.round(base * 5.0);
    if (this.elite) return Math.round(base * 2.1);
    if (this.kind === "unknown") return Math.round(base * 2.8);
    if (this.kind === "brute" || this.kind === "ashling") return Math.round(base * 1.35);
    if (this.kind === "wolf" || this.kind === "scout") return Math.round(base * 1.10);
    return Math.round(base);
  }

  lootBonus() {
    if (this.boss) return 4;
    if (this.elite) return 2;
    if (this.kind === "unknown") return 2;
    return 0;
  }

  draw(ctx) {
    const hurt = this._hurtT > 0;
    const bob = Math.sin(this._anim) * (this.kind === "blob" ? 1.5 : 1.0);

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 4, this.r * 0.9, 4 + this.r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === "brute") this._drawBrute(ctx, hurt);
    else if (this.kind === "stalker") this._drawStalker(ctx, hurt);
    else if (this.kind === "caster") this._drawCaster(ctx, hurt);
    else if (this.kind === "wolf") this._drawWolf(ctx, hurt);
    else if (this.kind === "scout") this._drawScout(ctx, hurt);
    else if (this.kind === "ashling") this._drawAshling(ctx, hurt);
    else if (this.kind === "unknown") this._drawUnknown(ctx, hurt);
    else this._drawBlob(ctx, hurt);

    if (this.elite || this.boss || this.kind === "unknown") {
      ctx.strokeStyle =
        this.boss ? "rgba(255,158,112,0.95)" :
        this.kind === "unknown" ? "rgba(182,142,255,0.94)" :
        "rgba(255,224,140,0.92)";
      ctx.lineWidth = this.boss ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(0, -this.r * 0.2, this.r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.hp < this.maxHp || this.elite || this.boss || this.kind === "unknown") {
      const w = Math.max(22, this.r * 2.2);
      const p = clamp(this.hp / Math.max(1, this.maxHp), 0, 1);

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-w * 0.5, -this.r - 14, w, 4);

      ctx.fillStyle =
        this.boss ? "#ff8b6b" :
        this.kind === "unknown" ? "#9c72ff" :
        this.elite ? "#f1ca5e" :
        "#d85f76";
      ctx.fillRect(-w * 0.5, -this.r - 14, w * p, 4);
    }

    ctx.restore();
  }

  _drawBlob(ctx, hurt) {
    ctx.fillStyle = hurt ? "#d78383" : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#f1b0b0" : "#c86868";
    ctx.beginPath();
    ctx.arc(-5, -3, 4, 0, Math.PI * 2);
    ctx.arc(4, -1, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#13161d";
    ctx.fillRect(-4.5, -2, 2, 2);
    ctx.fillRect(2.5, -2, 2, 2);
  }

  _drawBrute(ctx, hurt) {
    ctx.fillStyle = hurt ? "#cf9690" : "#7f564d";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-this.r, -this.r + 2, this.r * 2, this.r * 2 - 2, 5);
      ctx.fill();
    } else {
      ctx.fillRect(-this.r, -this.r + 2, this.r * 2, this.r * 2 - 2);
    }

    ctx.fillStyle = hurt ? "#e6b4ac" : "#b6866c";
    ctx.fillRect(-this.r + 3, -this.r + 5, this.r * 2 - 6, 6);

    ctx.fillStyle = "#222831";
    ctx.fillRect(-6, -3, 3, 3);
    ctx.fillRect(3, -3, 3, 3);

    ctx.fillStyle = hurt ? "#c28282" : "#604139";
    ctx.fillRect(-this.r - 2, 2, 4, 7);
    ctx.fillRect(this.r - 2, 2, 4, 7);
  }

  _drawStalker(ctx, hurt) {
    ctx.fillStyle = hurt ? "#95b58e" : "#58724f";
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#b5d7ad" : "#86a177";
    ctx.beginPath();
    ctx.moveTo(-this.r + 2, -1);
    ctx.lineTo(0, -this.r - 5);
    ctx.lineTo(this.r - 2, -1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#14181e";
    ctx.fillRect(-4, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
  }

  _drawCaster(ctx, hurt) {
    ctx.fillStyle = hurt ? "#a39bcf" : "#6054a6";
    ctx.beginPath();
    ctx.arc(0, 0, this.r - 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#c9c3ea" : "#a79be2";
    ctx.beginPath();
    ctx.arc(0, -this.r + 2, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#151924";
    ctx.fillRect(-3.5, -1, 2, 2);
    ctx.fillRect(1.5, -1, 2, 2);

    ctx.strokeStyle = hurt ? "#f1c9c9" : "#d5d0ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 4, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  _drawWolf(ctx, hurt) {
    ctx.fillStyle = hurt ? "#c7a992" : "#8a745b";
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r + 1, this.r - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#dfc6b4" : "#bda58c";
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-1, -this.r - 3);
    ctx.lineTo(2, -5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, -5);
    ctx.lineTo(1, -this.r - 3);
    ctx.lineTo(-2, -5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#181b21";
    ctx.fillRect(-4, -1, 2, 2);
    ctx.fillRect(2, -1, 2, 2);
  }

  _drawScout(ctx, hurt) {
    ctx.fillStyle = hurt ? "#d5d39d" : "#b1ae63";
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#ece8be" : "#d8d287";
    ctx.beginPath();
    ctx.arc(0, -this.r + 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#181b21";
    ctx.fillRect(-3, -1, 2, 2);
    ctx.fillRect(1, -1, 2, 2);
  }

  _drawAshling(ctx, hurt) {
    ctx.fillStyle = hurt ? "#c2b7af" : "#7f7670";
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#dfcfc6" : "#a29890";
    ctx.beginPath();
    ctx.arc(-5, -2, 4, 0, Math.PI * 2);
    ctx.arc(4, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1c1f26";
    ctx.fillRect(-4, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
  }

  _drawUnknown(ctx, hurt) {
    ctx.fillStyle = hurt ? "#b7a3eb" : "#6f47c2";
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hurt ? "#d9cdf8" : "#9b7cff";
    ctx.beginPath();
    ctx.arc(0, -this.r + 2, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hurt ? "#f0ddff" : "#d8c8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 4, 0.3, Math.PI - 0.3);
    ctx.stroke();

    ctx.fillStyle = "#141824";
    ctx.fillRect(-4, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
  }
}

/* =========================================================
   PROJECTILE
========================================================= */

export class Projectile {
  constructor(x, y, vx, vy, dmg, life, level, meta = {}) {
    this.x = x || 0;
    this.y = y || 0;
    this.vx = vx || 0;
    this.vy = vy || 0;
    this.dmg = dmg || 1;
    this.life = life || 1;
    this.maxLife = this.life;
    this.level = level || 1;
    this.meta = meta || {};
    this.friendly = !!meta.friendly;
    this.nova = !!meta.nova;
    this.radius = meta.radius || (this.nova ? 10 : 4);
    this.hitRadius = meta.hitRadius || 16;
    this.color = meta.color || (this.friendly ? "#9dd7ff" : "#ffad8c");
    this.alive = true;
    this._age = 0;
  }

  update(dt, world) {
    this._age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    if (this.nova) {
      const p = clamp(this._age / Math.max(0.001, this.maxLife), 0, 1);
      this.radius = this.hitRadius * (0.25 + p * 0.85);
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (world && !this.meta?.ignoreWalls) {
      if (world.isSolid?.(this.x, this.y)) {
        this.alive = false;
      }
    }
  }

  draw(ctx) {
    ctx.save();

    if (this.nova) {
      const alpha = clamp(this.life / Math.max(0.001, this.maxLife), 0, 1);
      ctx.globalAlpha = 0.32 * alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.75 * alpha;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.restore();
  }
}

/* =========================================================
   LOOT
========================================================= */

export class Loot {
  constructor(x = 0, y = 0, kind = "gold", data = {}) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.data = data || {};
    this.alive = true;
    this.t = 0;

    this.vx = ((hash2(x | 0, y | 0, 444) % 100) / 100 - 0.5) * 24;
    this.vy = -20 - ((hash2(x | 0, y | 0, 555) % 100) / 100) * 14;
  }

  update(dt, hero) {
    this.t += dt;

    if (this.t < 0.22) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.92;
      this.vy *= 0.92;
    }

    if (!hero) return;

    const d2 = dist2(this.x, this.y, hero.x, hero.y);
    const pullR = 72 * 72;
    if (d2 < pullR) {
      const n = norm(hero.x - this.x, hero.y - this.y);
      const pull = 90 + Math.max(0, 72 - Math.sqrt(d2)) * 3.0;
      this.x += n.x * pull * dt;
      this.y += n.y * pull * dt;
    }

    if (d2 < 18 * 18) {
      this.alive = false;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.t * 5) * 1.6;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    if (this.kind === "gold") {
      ctx.fillStyle = "#f4ca5e";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,245,210,0.72)";
      ctx.beginPath();
      ctx.arc(-1, -1, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "potion") {
      const mana = this.data?.potionType === "mana";
      ctx.fillStyle = mana ? "#66a9ff" : "#d95f76";

      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(-5, -4, 10, 12, 3);
        ctx.fill();
      } else {
        ctx.fillRect(-5, -4, 10, 12);
      }

      ctx.fillStyle = "#cfc7b1";
      ctx.fillRect(-2.5, -7, 5, 4);
    } else {
      const item = this.data || {};
      ctx.fillStyle = item.color || rarityColor(item.rarity);
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}