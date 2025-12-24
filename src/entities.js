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
  if (r === "legendary") return 2.2;
  if (r === "epic") return 1.8;
  if (r === "rare") return 1.4;
  if (r === "uncommon") return 1.15;
  return 1.0;
}

export function makeGear(rng, slot, rarity = "common", tier = 1) {
  const id = `g_${(rng.nextU32?.() ?? (Math.random()*1e9)|0).toString(16)}_${(Math.random()*1e6)|0}`;

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
    armor: Math.round(base.armor * m),
    mana: Math.round(base.mana * m),
    dmg
  };

  const names = {
    helm: ["Helm","Cowl","Greathelm","Hood"],
    chest:["Cuirass","Mail","Plate","Tunic"],
    boots:["Boots","Greaves","Sandals","Treads"],
    weapon:["Sword","Wand","Blade","Scepter"],
    ring:["Ring","Band","Signet","Loop"]
  };

  const adj = {
    common:["Worn","Simple","Plain","Dusty"],
    uncommon:["Sturdy","Carved","Bright","Keen"],
    rare:["Runed","Gleaming","Tempered","Oathbound"],
    epic:["Mythic","Voidkissed","Starforged","Royal"],
    legendary:["Godslayer","Sunheart","Worldbreaker","Eternal"]
  };

  const name = `${rng.pick(adj[rarity])} ${rng.pick(names[slot])}`;

  return {
    kind: "gear",
    id,
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
    this.r = item.kind === "gold" ? 10 : 12;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, t) {
    const bob = Math.sin((t + this.t) * 6) * 2;

    ctx.globalAlpha = 0.9;
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

    this.base = { maxHp: 120, maxMana: 80, dmg: 12, armor: 0 };

    this.hp = this.base.maxHp;
    this.mana = this.base.maxMana;

    this.state = {
      sailing: false,
      invulnerable: false,
    };

    this.lastMove = { x: 1, y: 0 };

    this.inventory = [];
    this.equip = { helm:null, chest:null, boots:null, weapon:null, ring:null };

    // Skills: v28 system
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
      this.mana = Math.min(st.maxMana, this.mana + 12);
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

    for (const slot of Object.keys(this.equip)) {
      const it = this.equip[slot];
      if (!it) continue;
      maxHp += it.stats.hp || 0;
      maxMana += it.stats.mana || 0;
      dmg += it.stats.dmg || 0;
      armor += it.stats.armor || 0;
    }

    return { maxHp, maxMana, dmg, armor };
  }

  update(dt) {
    // regen
    const st = this.getStats();
    this.hp = clamp(this.hp + dt * 1.4, 0, st.maxHp);
    this.mana = clamp(this.mana + dt * 4.2, 0, st.maxMana);

    // cooldowns
    for (const s of this.skills) s.cdT = Math.max(0, s.cdT - dt);
  }

  draw(ctx, t) {
    const bob = Math.sin(t * 6) * 1.5;
    const sx = this.x, sy = this.y + bob;

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(sx, this.y + 16, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // boots (equip tint)
    const bootCol = this.equip.boots ? rarityColor(this.equip.boots.rarity) : "#2b2f39";
    ctx.fillStyle = "#151a2c";
    ctx.fillRect(sx - 8, sy + 8, 6, 6);
    ctx.fillRect(sx + 2, sy + 8, 6, 6);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = bootCol;
    ctx.fillRect(sx - 8, sy + 8, 6, 3);
    ctx.fillRect(sx + 2, sy + 8, 6, 3);
    ctx.globalAlpha = 1;

    // body / chest armor tint
    const chestCol = this.equip.chest ? rarityColor(this.equip.chest.rarity) : "#3a4a64";
    ctx.fillStyle = "#0b1330";
    roundRect(ctx, sx - 10, sy - 8, 20, 18, 6);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = chestCol;
    roundRect(ctx, sx - 9, sy - 7, 18, 10, 5);
    ctx.fill();
    ctx.globalAlpha = 1;

    // head
    ctx.fillStyle = "#c9a27b";
    ctx.beginPath();
    ctx.arc(sx, sy - 12, 7, 0, Math.PI * 2);
    ctx.fill();

    // helm overlay tint
    if (this.equip.helm) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = rarityColor(this.equip.helm.rarity);
      ctx.beginPath();
      ctx.arc(sx, sy - 13, 7.5, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // cape / accent
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#0a0f20";
    ctx.beginPath();
    ctx.moveTo(sx - 8, sy - 6);
    ctx.lineTo(sx - 16, sy + 10);
    ctx.lineTo(sx - 4, sy + 8);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // weapon
    const wcol = this.equip.weapon ? rarityColor(this.equip.weapon.rarity) : "#d7e0ff";
    const fx = this.lastMove.x, fy = this.lastMove.y;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(sx + fx * 6, sy - 2);
    ctx.lineTo(sx + fx * 30, sy - 2 + fy * 16);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = wcol;
    ctx.beginPath();
    ctx.moveTo(sx + fx * 6, sy - 2);
    ctx.lineTo(sx + fx * 30, sy - 2 + fy * 16);
    ctx.stroke();

    // nameplate
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    const txt = "Broke Knight";
    ctx.fillText(txt, sx - ctx.measureText(txt).width / 2, sy - 34);
    ctx.globalAlpha = 1;
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

    const baseHp = 28 + tier * 22;
    const baseDmg = 6 + tier * 4;
    const baseMove = 86 + tier * 10;

    if (type === "charger") {
      this.r = 18 + tier * 1.8;
      this.maxHp = Math.round(baseHp * 1.25);
      this.dmg = Math.round(baseDmg * 1.15);
      this.move = Math.round(baseMove * 1.20);
      this.chargeCD = 1.6;
      this.chargeT = 0;
    } else if (type === "shaman") {
      this.r = 15 + tier * 1.6;
      this.maxHp = Math.round(baseHp * 0.95);
      this.dmg = Math.round(baseDmg * 1.35);
      this.move = Math.round(baseMove * 0.92);
      this.boltCD = 1.4;
      this.boltT = 0;
    } else {
      this.r = 16 + tier * 1.7;
      this.maxHp = baseHp;
      this.dmg = baseDmg;
      this.move = baseMove;
    }

    this.hp = this.maxHp;
    this.hitFlash = 0;
    this.aiT = Math.random() * 2;
  }

  xpValue() {
    const typeM = this.type === "shaman" ? 1.3 : this.type === "charger" ? 1.15 : 1.0;
    return Math.round((10 + this.tier * 7) * typeM);
  }

  takeDamage(d) {
    this.hp -= d;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      this.hp = 0;
    }
  }

  update(dt, hero, world) {
    if (!this.alive) return;

    this.aiT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // simple chase
    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const dd = Math.hypot(dx, dy) || 1;

    // chargers do a burst
    let spd = this.move;
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

    // keep enemies on land
    if (!world.terrainAt(nx, ny).ocean && !world.isInRiver(nx, ny)) {
      this.x = nx;
      this.y = ny;
    }

    // melee hit
    if (dd < this.r + hero.r + 8) {
      if (!hero.state.invulnerable) {
        const st = hero.getStats();
        const reduced = Math.max(1, Math.round(this.dmg - st.armor * 0.6));
        hero.hp -= reduced * dt * 2.2;
      }
    }
  }

  draw(ctx, t) {
    if (!this.alive) return;

    const bob = Math.sin((t + this.aiT) * 5) * 1.2;
    const x = this.x, y = this.y + bob;

    // shadow
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, this.y + 16, this.r, this.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body silhouette by type
    let c1 = "#2b2f39", c2 = "#0b1330";
    if (this.type === "charger") { c1 = "#4a2a2a"; c2 = "#240f0f"; }
    if (this.type === "shaman") { c1 = "#2a3f4a"; c2 = "#0d1c28"; }

    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(x, y, this.r + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(x, y - 2, this.r, 0, Math.PI * 2);
    ctx.fill();

    // face glow
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = this.type === "shaman" ? "#66ddff" : "#ff6b6b";
    ctx.beginPath();
    ctx.arc(x - 5, y - 6, 2.2, 0, Math.PI * 2);
    ctx.arc(x + 4, y - 6, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // hit flash
    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, this.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // hp bar
    const w = 34, h = 5;
    const p = this.hp / this.maxHp;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x - w/2, y - this.r - 16, w, h);
    ctx.fillStyle = "#ff4a6e";
    ctx.fillRect(x - w/2, y - this.r - 16, w * p, h);
    ctx.globalAlpha = 1;
  }
}

/* ============================
   PROJECTILE
   ============================ */
export class Projectile {
  constructor(x, y, vx, vy, dmg, life = 0.9, level = 1) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.dmg = dmg;
    this.life = life;
    this.alive = true;
    this.level = level;
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

    this.x = nx; this.y = ny;

    // collide enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      const d2 = dist2(this.x, this.y, e.x, e.y);
      const rr = (this.r + e.r) * (this.r + e.r);
      if (d2 <= rr) {
        e.takeDamage(this.dmg);
        this.alive = false;
        return;
      }
    }
  }

  draw(ctx, t) {
    const pulse = 0.7 + Math.sin((t + this.t) * 14) * 0.18;

    // glow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#ff9a4a";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 2.4 * pulse, 0, Math.PI * 2);
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
