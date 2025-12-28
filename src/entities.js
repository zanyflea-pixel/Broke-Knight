// src/entities.js
import { RNG, clamp, lerp, norm, dist2, hash01 } from "./util.js";

/* ============================
   GEAR / ITEMS
   ============================ */
export const GearSlots = ["helm", "chest", "boots", "weapon", "ring"];

export function rarityColor(r) {
  if (r === "legendary") return "#ffcf4a";
  if (r === "epic") return "#b983ff";
  if (r === "rare") return "#4aa3ff";
  if (r === "uncommon") return "#55d676";
  return "#cfd7e6";
}

function rarityMult(r) {
  if (r === "legendary") return 2.0;
  if (r === "epic") return 1.6;
  if (r === "rare") return 1.3;
  if (r === "uncommon") return 1.15;
  return 1.0;
}

export function makeGear(rng, slot, rarity, tier) {
  const names = {
    helm: ["Cap","Helm","Hood","Visor","Crown","Mask"],
    chest:["Tunic","Mail","Plate","Robe","Hauberk","Jerkin"],
    boots:["Boots","Greaves","Sandals","Treads","Shoes","Walkers"],
    weapon:["Sword","Axe","Mace","Dagger","Spear","Wand"],
    ring:["Ring","Band","Loop","Signet","Seal","Circle"],
  };

  const a = ["Broke","Rusty","Gleaming","Runed","Vicious","Blessed","Cursed","Stormforged","Sunlit","Moonlit"];
  const b = ["Knight","Wanderer","Ash","Frost","Ember","Tides","Dawn","Dusk","Echoes","Kings"];

  const base = {
    helm:  { hp: 10, armor: 1, mana: 4 },
    chest: { hp: 18, armor: 2, mana: 0 },
    boots: { hp: 8, armor: 1, mana: 2 },
    weapon:{ hp: 0, armor: 0, mana: 0 },
    ring:  { hp: 6, armor: 0, mana: 8 }
  }[slot];

  const m = rarityMult(rarity) * (1 + tier * 0.10);

  let dmg = 0;
  if (slot === "weapon") dmg = Math.round((6 + tier * 3) * m);

  const stats = {
    hp: Math.round(base.hp * m),
    mana: Math.round(base.mana * m),
    armor: Math.round(base.armor * m),
    dmg
  };

  const name = `${a[rng.int(0, a.length - 1)]} ${names[slot][rng.int(0, names[slot].length - 1)]} of ${b[rng.int(0, b.length - 1)]}`;

  return {
    kind: "gear",
    slot,
    rarity,
    tier,
    name,
    stats
  };
}

/* ============================
   LOOT
   ============================ */
export class Loot {
  constructor(x, y, item) {
    this.x = x;
    this.y = y;
    this.item = item;
    this.r = item.kind === "gold" ? 10 : (item.kind === "potion" ? 12 : 12);
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, t) {
    const bob = Math.sin((t + this.t) * 6) * 2;

    if (this.item.kind === "gold") {
      ctx.fillStyle = "#ffcf4a";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 12, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    if (this.item.kind === "potion") {
      const isMana = this.item.potionType === "mana";
      const liquid = isMana ? "#5bc0ff" : "#ff5c7a";
      const cork = "#caa874";
      const bobY = this.y + bob;

      // soft shadow
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 12, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // glass outline
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(240,248,255,0.18)";
      roundRect(ctx, this.x - 6, bobY - 7, 12, 17, 3);
      ctx.fill();

      // liquid
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = liquid;
      roundRect(ctx, this.x - 5, bobY + 2, 10, 7, 3);
      ctx.fill();

      // cork
      ctx.globalAlpha = 1;
      ctx.fillStyle = cork;
      roundRect(ctx, this.x - 4, bobY - 11, 8, 5, 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      return;
    }

    const col = rarityColor(this.item.rarity);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 14, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ============================
   HERO
   ============================ */
export class Hero {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 14;

    this.level = 1;
    this.xp = 0;
    this.nextXp = 30;

    this.gold = 0;

    // consumables (v28)
    this.potions = { hp: 0, mana: 0 };

    this.base = { maxHp: 120, maxMana: 80, dmg: 12, armor: 0 };

    this.hp = this.base.maxHp;
    this.mana = this.base.maxMana;

    this.state = {
      sailing: false,
      invulnerable: false,
      invulnT: 0,
    };

    this.lastMove = { x: 1, y: 0 };

    this.inventory = [];
    this.equip = { helm:null, chest:null, boots:null, weapon:null, ring:null };

    this.skills = [
      {
        id: "fireball",
        name: "Fireball",
        key: "a",
        level: 1,
        xp: 0,
        nextXp: 20,
        mana: 10,
        cd: 0.55,
        cdT: 0,
        desc: "Shoot a fireball. Levels increase damage + speed.",
      },
      {
        id: "frostNova",
        name: "Frost Nova",
        key: "s",
        level: 1,
        xp: 0,
        nextXp: 22,
        mana: 18,
        cd: 4.6,
        cdT: 0,
        desc: "Blast enemies around you and slow them.",
      },
      {
        id: "dash",
        name: "Dash",
        key: "d",
        level: 1,
        xp: 0,
        nextXp: 16,
        mana: 12,
        cd: 2.2,
        cdT: 0,
        desc: "Quickly dash in a direction. Higher level increases range.",
      },
      {
        id: "chain",
        name: "Chain Lightning",
        key: "f",
        level: 1,
        xp: 0,
        nextXp: 24,
        mana: 22,
        cd: 3.8,
        cdT: 0,
        desc: "Zap a target and chain to nearby enemies.",
      }
    ];
  }

  giveXP(amt) {
    this.xp += amt;
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level++;
      this.nextXp = Math.round(this.nextXp * 1.25 + 10);

      const st = this.getStats();
      this.hp = Math.min(st.maxHp, this.hp + 20);
      this.mana = Math.min(st.maxMana, this.mana + 18);
    }
  }

  skillUse(id) {
    const s = this.skills.find(k => k.id === id);
    if (!s) return;
    s.xp += 1;
    if (s.xp >= s.nextXp) {
      s.xp = 0;
      s.level++;
      s.nextXp = Math.round(s.nextXp * 1.35 + 6);
    }
  }

  getStats() {
    let maxHp = this.base.maxHp + this.level * 12;
    let maxMana = this.base.maxMana + this.level * 8;
    let dmg = this.base.dmg + this.level * 2;
    let armor = this.base.armor;

    for (const slot of GearSlots) {
      const g = this.equip[slot];
      if (!g) continue;
      maxHp += g.stats.hp || 0;
      maxMana += g.stats.mana || 0;
      armor += g.stats.armor || 0;
      dmg += g.stats.dmg || 0;
    }

    return { maxHp, maxMana, dmg, armor };
  }

  update(dt) {
    // regen
    const st = this.getStats();
    this.hp = clamp(this.hp + dt * 1.4, 0, st.maxHp);
    this.mana = clamp(this.mana + dt * 4.2, 0, st.maxMana);

    // dash / temporary invulnerability
    this.state.invulnT = Math.max(0, (this.state.invulnT || 0) - dt);

    // cooldowns
    for (const s of this.skills) s.cdT = Math.max(0, s.cdT - dt);
  }

  draw(ctx, t) {
    const bob = Math.sin(t * 6) * 1.5;

    // shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 15, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = "#d7e0ff";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, 13, 0, Math.PI * 2);
    ctx.fill();

    // cape
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#7c5cff";
    ctx.beginPath();
    ctx.ellipse(this.x - 10, this.y + bob + 4, 8, 12, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // helm dot
    ctx.fillStyle = "#0a0d1a";
    ctx.beginPath();
    ctx.arc(this.x + 4, this.y + bob - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ============================
   ENEMY
   ============================ */
export class Enemy {
  constructor(x, y, tier = 1, type = "grunt") {
    this.x = x;
    this.y = y;
    this.tier = tier;
    this.type = type;
    this.alive = true;

    // v28 combat state
    this.vx = 0;
    this.vy = 0;
    this.kbT = 0;
    this.slowT = 0;
    this.slowMult = 1;
    this.hitHeroT = 0;

    const baseHp = 28 + tier * 22;
    const baseDmg = 6 + tier * 4;
    const baseMove = 86 + tier * 10;

    if (type === "charger") {
      this.r = 18 + tier * 1.8;
      this.maxHp = Math.round(baseHp * 1.25);
      this.dmg = Math.round(baseDmg * 1.15);
      this.move = Math.round(baseMove * 1.1);
      this.chargeCD = 2.2;
      this.chargeT = 0;
    } else if (type === "shaman") {
      this.r = 16 + tier * 1.2;
      this.maxHp = Math.round(baseHp * 0.90);
      this.dmg = Math.round(baseDmg * 0.75);
      this.move = Math.round(baseMove * 0.9);
      this.castCD = 2.6;
      this.castT = 0;
    } else {
      this.r = 16 + tier * 1.4;
      this.maxHp = baseHp;
      this.dmg = baseDmg;
      this.move = baseMove;
    }

    this.hp = this.maxHp;

    this.aiT = 0;
    this.hitFlash = 0;

    // deterministic color variance
    const hue = 0.55 + hash01(Math.floor(x), Math.floor(y), tier) * 0.35;
    this.col = `hsl(${Math.floor(hue * 360)}, 65%, 60%)`;
  }

  xpValue() {
    return Math.round(8 + this.tier * 6 + (this.type === "shaman" ? 6 : 0));
  }

  takeDamage(d, src = null) {
    const dealt = Math.max(1, Math.round(d));
    this.hp -= dealt;
    this.hitFlash = 0.12;

    // knockback a bit away from source
    if (src) {
      const dx = this.x - src.x;
      const dy = this.y - src.y;
      const dd = Math.hypot(dx, dy) || 1;
      const k = 220;
      this.vx += (dx / dd) * k;
      this.vy += (dy / dd) * k;
      this.kbT = 0.18;
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.hp = 0;
    }
    return dealt;
  }

  applySlow(mult = 0.6, duration = 1.8) {
    this.slowMult = Math.min(this.slowMult, clamp(mult, 0.15, 1));
    this.slowT = Math.max(this.slowT, duration);
  }

  update(dt, hero, world, game = null) {
    if (!this.alive) return;

    this.aiT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // v28 status / knockback
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.slowT <= 0) { this.slowMult = 1; }
    this.hitHeroT = Math.max(0, this.hitHeroT - dt);

    if (this.kbT > 0) {
      this.kbT = Math.max(0, this.kbT - dt);
      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;
      const T = world.terrainAt(nx, ny);
      if (!T.ocean && !T.mountain) { this.x = nx; this.y = ny; }
      this.vx *= 0.88;
      this.vy *= 0.88;
    }

    // simple chase
    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const dd = Math.hypot(dx, dy) || 1;

    // charger behavior
    let spd = this.move;
    spd *= this.slowMult;
    if (this.type === "charger") {
      this.chargeT -= dt;
      if (dd < 220 && this.chargeT <= 0) {
        this.chargeT = this.chargeCD;
        spd *= 2.4;
      }
    }

    // shaman keeps distance a bit
    let steerX = dx / dd;
    let steerY = dy / dd;
    if (this.type === "shaman" && dd < 220) {
      steerX *= -0.6;
      steerY *= -0.6;
    }

    const nx = this.x + steerX * spd * dt;
    const ny = this.y + steerY * spd * dt;

    const T = world.terrainAt(nx, ny);
    if (!T.ocean && !T.mountain) {
      this.x = nx;
      this.y = ny;
    }

    // collide hero -> damage
    const rr = (this.r + hero.r) * (this.r + hero.r);
    if (dist2(this.x, this.y, hero.x, hero.y) <= rr) {
      if (!hero.state.invulnerable && (hero.state.invulnT || 0) <= 0) {
        const st = hero.getStats();
        const reduced = Math.max(1, Math.round(this.dmg - st.armor * 0.6));

        // pulse damage so combat feels readable
        if (this.hitHeroT <= 0) {
          this.hitHeroT = 0.45;
          hero.hp -= reduced;
          if (game && game.onHeroHit) game.onHeroHit(reduced, this.x, this.y);
        }
      }
    }
  }

  draw(ctx, t) {
    if (!this.alive) return;

    const bob = Math.sin((t + this.aiT) * 5) * 1.4;
    const hpP = clamp(this.hp / this.maxHp, 0, 1);

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 14, this.r, this.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    if (this.hitFlash > 0) {
      ctx.fillStyle = "#fff";
    } else {
      ctx.fillStyle = this.col;
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    // type mark
    if (this.type === "charger") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(this.x + 6, this.y + bob - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === "shaman") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // hp bar
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(this.x - this.r, this.y - this.r - 14, this.r * 2, 6);
    ctx.fillStyle = "rgba(255,90,120,0.95)";
    ctx.fillRect(this.x - this.r, this.y - this.r - 14, this.r * 2 * hpP, 6);
    ctx.globalAlpha = 1;
  }
}

/* ============================
   PROJECTILE
   ============================ */
export class Projectile {
  constructor(x, y, vx, vy, dmg, life = 0.9, level = 1, opts = {}) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.dmg = dmg;
    this.life = life;
    this.alive = true;
    this.level = level;
    this.kind = opts.kind || "fire";
    this.onHit = typeof opts.onHit === "function" ? opts.onHit : null;
    this.r = 7 + level * 0.6;
    this.t = 0;
  }

  update(dt, world, enemies) {
    if (!this.alive) return;

    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    // collide world
    if (world.projectileHitsSolid({ x: nx, y: ny })) {
      this.alive = false;
      return;
    }

    this.x = nx;
    this.y = ny;

    // collide enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      const d2 = dist2(this.x, this.y, e.x, e.y);
      const rr = (this.r + e.r) * (this.r + e.r);
      if (d2 <= rr) {
        const dealt = e.takeDamage(this.dmg, this);
        if (this.onHit) this.onHit(e, dealt, this);
        this.alive = false;
        return;
      }
    }
  }

  draw(ctx, t) {
    if (!this.alive) return;

    const pulse = 0.8 + Math.sin((t + this.t) * 14) * 0.25;

    // glow
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(255,140,80,0.75)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 1.25 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // core
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffcf4a";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    // hot center
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fff2d0";
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, this.r * 0.45 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }
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
