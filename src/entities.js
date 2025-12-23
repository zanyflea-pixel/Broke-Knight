// src/entities.js
import { clamp, dist2, len, norm } from "./util.js";

export function rarityColor(r) {
  if (r === "common") return "#cfd7e6";
  if (r === "uncommon") return "#5dff9a";
  if (r === "rare") return "#52b7ff";
  if (r === "epic") return "#d56cff";
  return "#ffd36a"; // legendary
}

export const GearSlots = ["helm", "chest", "boots", "weapon", "ring"];

export function gearStatRoll(rng, rarity) {
  const mul = rarity === "common" ? 1 : rarity === "uncommon" ? 1.25 : rarity === "rare" ? 1.55 : rarity === "epic" ? 1.9 : 2.4;
  return {
    hp: Math.round((rng.int(0, 8) + 2) * mul),
    dmg: Math.round((rng.int(0, 5) + 1) * mul),
    armor: Math.round((rng.int(0, 4) + 0) * mul),
    mana: Math.round((rng.int(0, 8) + 0) * mul),
  };
}

export function makeGear(rng, slot, rarity) {
  const mats = {
    helm: ["Iron Cap", "Leather Hood", "Runed Circlet"],
    chest: ["Patch Vest", "Iron Cuirass", "Runed Coat"],
    boots: ["Worn Boots", "Ranger Boots", "Greaves"],
    weapon: ["Rust Blade", "Flame Rod", "Knight Sword"],
    ring: ["Copper Ring", "Silver Ring", "Glyph Ring"],
  };
  const base = rng.pick(mats[slot] || ["Gear"]);
  const stats = gearStatRoll(rng, rarity);
  return {
    id: "g_" + Math.floor(rng.float() * 1e9),
    kind: "gear",
    slot,
    rarity,
    name: `${base}`,
    stats,
    sell: 8 + Math.round((stats.hp + stats.dmg * 3 + stats.armor * 4 + stats.mana) * 0.6),
  };
}

export class Hero {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 16;

    this.level = 1;
    this.xp = 0;
    this.nextXp = 30;
    this.gold = 0;

    this.base = { maxHp: 120, dmg: 12, armor: 0, maxMana: 60 };
    this.hp = this.base.maxHp;
    this.mana = this.base.maxMana;

    this.invulnT = 0;

    this.inventory = [];
    this.equip = { helm: null, chest: null, boots: null, weapon: null, ring: null };

    this.state = {
      sailing: false,
      invulnerable: false,
    };

    this.lastMove = { x: 1, y: 0 }; // for aiming fallback
  }

  getStats() {
    let add = { maxHp: 0, dmg: 0, armor: 0, maxMana: 0 };
    for (const slot of Object.keys(this.equip)) {
      const it = this.equip[slot];
      if (!it) continue;
      add.maxHp += it.stats.hp || 0;
      add.dmg += it.stats.dmg || 0;
      add.armor += it.stats.armor || 0;
      add.maxMana += it.stats.mana || 0;
    }
    return {
      maxHp: this.base.maxHp + add.maxHp,
      dmg: this.base.dmg + add.dmg,
      armor: this.base.armor + add.armor,
      maxMana: this.base.maxMana + add.maxMana,
    };
  }

  giveXP(x) {
    this.xp += x;
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level++;
      this.nextXp = Math.round(this.nextXp * 1.35 + 10);
      // small growth
      this.base.maxHp += 10;
      this.base.dmg += 2;
      this.base.maxMana += 6;
      const st = this.getStats();
      this.hp = Math.min(this.hp + 15, st.maxHp);
      this.mana = Math.min(this.mana + 10, st.maxMana);
    }
  }

  takeDamage(raw) {
    if (this.state.invulnerable) return 0;
    if (this.invulnT > 0) return 0;

    const st = this.getStats();
    const dmg = Math.max(1, Math.round(raw - st.armor * 0.35));
    this.hp -= dmg;
    this.invulnT = 0.25;
    return dmg;
  }

  update(dt) {
    if (this.invulnT > 0) this.invulnT -= dt;
    const st = this.getStats();
    this.hp = clamp(this.hp, 0, st.maxHp);
    this.mana = clamp(this.mana, 0, st.maxMana);
  }

  draw(ctx, t) {
    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 6, this.y + 16, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body (pseudo 3D)
    const bob = Math.sin(t * 6) * 1.2;
    ctx.fillStyle = "#d7e0ff";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 2 + bob, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // outline
    ctx.strokeStyle = "#0b1330";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 2 + bob, 12, 14, 0, 0, Math.PI * 2);
    ctx.stroke();

    // helmet if equipped
    if (this.equip.helm) {
      ctx.fillStyle = rarityColor(this.equip.helm.rarity);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 14 + bob, 8, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // chest armor
    if (this.equip.chest) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = rarityColor(this.equip.chest.rarity);
      ctx.fillRect(this.x - 10, this.y - 4 + bob, 20, 12);
      ctx.globalAlpha = 1;
    }

    // weapon hint
    if (this.equip.weapon) {
      const fx = this.lastMove.x, fy = this.lastMove.y;
      ctx.strokeStyle = rarityColor(this.equip.weapon.rarity);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + fx * 10, this.y - 4 + bob);
      ctx.lineTo(this.x + fx * 26, this.y - 4 + bob + fy * 10);
      ctx.stroke();
    }

    // sailing ring
    if (this.state.sailing) {
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = "#52b7ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

export class Enemy {
  constructor(x, y, tier = 1, type = "grunt") {
    this.x = x; this.y = y;
    this.tier = tier;
    this.type = type;

    this.r = type === "charger" ? 18 : 15;
    this.maxHp = Math.round((28 + tier * 20) * (type === "shaman" ? 0.85 : 1.0));
    this.hp = this.maxHp;
    this.dmg = Math.round((7 + tier * 4) * (type === "charger" ? 1.2 : 1.0));
    this.spd = Math.round((80 + tier * 10) * (type === "charger" ? 1.15 : 1.0));

    this.alive = true;
    this.hitT = 0;
    this.cd = 0;
  }

  xpValue() {
    const base = 10 + this.tier * 8;
    const mul = this.type === "grunt" ? 1 : this.type === "charger" ? 1.25 : 1.35;
    return Math.round(base * mul);
  }

  update(dt, hero, world) {
    if (!this.alive) return;

    if (this.hitT > 0) this.hitT -= dt;
    if (this.cd > 0) this.cd -= dt;

    // chase hero
    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const L = len(dx, dy);
    const nx = dx / L, ny = dy / L;

    this.x += nx * this.spd * dt;
    this.y += ny * this.spd * dt;

    // simple collision with world (treat as heroState walking)
    world.resolveCircleVsWorld({ x: this.x, y: this.y, r: this.r }, { sailing: false });

    // contact damage
    if (dist2(this.x, this.y, hero.x, hero.y) < (this.r + hero.r) * (this.r + hero.r)) {
      if (this.cd <= 0) {
        hero.takeDamage(this.dmg);
        this.cd = 0.65;
      }
    }
  }

  takeHit(dmg) {
    this.hp -= dmg;
    this.hitT = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  draw(ctx, t) {
    if (!this.alive) return;

    // shadow
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 6, this.y + 14, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    const wob = Math.sin(t * 5 + this.x * 0.01) * 1.0;
    const base = this.type === "grunt" ? "#8b93a8" : this.type === "charger" ? "#c97c4a" : "#7a5cff";
    ctx.fillStyle = this.hitT > 0 ? "#fff" : base;

    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 2 + wob, this.r, this.r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#0b1330";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 2 + wob, this.r, this.r * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();

    // hp bar
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(this.x - 18, this.y - this.r - 16, 36, 5);
    ctx.fillStyle = "#ff5d5d";
    ctx.fillRect(this.x - 18, this.y - this.r - 16, 36 * (this.hp / this.maxHp), 5);
    ctx.globalAlpha = 1;
  }
}

export class Projectile {
  constructor(x, y, vx, vy, dmg, life = 1.1) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = 6;
    this.dmg = dmg;
    this.life = life;
    this.alive = true;
  }

  update(dt, world, enemies) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (world.projectileHitsSolid(this)) {
      this.alive = false;
      return;
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      if (dist2(this.x, this.y, e.x, e.y) < (this.r + e.r) * (this.r + e.r)) {
        e.takeHit(this.dmg);
        this.alive = false;
        return;
      }
    }
  }

  draw(ctx, t) {
    if (!this.alive) return;

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + 8, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const glow = 0.55 + 0.25 * Math.sin(t * 18 + this.x * 0.02);
    ctx.fillStyle = `rgba(255,140,60,${glow})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#ffd28a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export class Loot {
  constructor(x, y, item) {
    this.x = x; this.y = y;
    this.item = item; // {kind:'gold'...} or gear
    this.r = 10;
    this.t = 0;
  }
  update(dt) { this.t += dt; }
  draw(ctx, time) {
    const bob = Math.sin((time + this.t) * 3) * 2;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + 14, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (this.item.kind === "gold") {
      ctx.fillStyle = "#ffd36a";
      ctx.beginPath();
      ctx.arc(this.x, this.y - 4 + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0b1330";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = rarityColor(this.item.rarity);
      ctx.fillRect(this.x - 6, this.y - 10 + bob, 12, 12);
      ctx.strokeStyle = "#0b1330";
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x - 6, this.y - 10 + bob, 12, 12);
    }
  }
}
