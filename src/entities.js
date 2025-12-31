// src/entities.js
// v30: BIG readability + variety pass
// - Enemies no longer "all look the same": each type has a distinct silhouette (wolf/scorpion/raider/wisp/sprite/leech/slime/brute/grunt).
// - Projectiles + spells are MUCH easier to see (core, trail, spark hits, distinct colors per spell).
// - Keeps exports expected by game.js: Hero, Enemy, Projectile, Loot, makeGear, GearSlots
//
// NOTE: Movement keys are handled in game.js. This file focuses on visuals + entity behavior.

import { RNG, clamp, norm, dist2 } from "./util.js";

/* ============================
   Small drawing helpers
   ============================ */
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mixColor(c1, c2, t) {
  // c = "#rrggbb"
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);
  const r = (lerp(r1, r2, t) | 0).toString(16).padStart(2, "0");
  const g = (lerp(g1, g2, t) | 0).toString(16).padStart(2, "0");
  const b = (lerp(b1, b2, t) | 0).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}
function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function drawShadow(ctx, x, y, rx, ry, a = 0.28) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function outlineStroke(ctx, path, col = "rgba(0,0,0,0.35)", w = 2) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(path);
  ctx.restore();
}
function rrPath(x, y, w, h, r) {
  const p = new Path2D();
  const rr = Math.min(r, w * 0.5, h * 0.5);
  p.moveTo(x + rr, y);
  p.lineTo(x + w - rr, y);
  p.quadraticCurveTo(x + w, y, x + w, y + rr);
  p.lineTo(x + w, y + h - rr);
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  p.lineTo(x + rr, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - rr);
  p.lineTo(x, y + rr);
  p.quadraticCurveTo(x, y, x + rr, y);
  p.closePath();
  return p;
}
function sparkle(ctx, x, y, t, a = 0.8, col = "rgba(190,230,255,0.95)") {
  const s = 3.5 + Math.sin(t * 4.2) * 1.6;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
  ctx.restore();
}
function hitFlash(ctx, x, y, r, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ============================
   GEAR
   ============================ */
export const GearSlots = ["helm", "chest", "boots", "weapon", "ring"];

const AFFIX_POOL = [
  { id: "hp", label: "Vital", stat: "hp", min: 8, max: 18 },
  { id: "mana", label: "Arcane", stat: "mana", min: 6, max: 16 },
  { id: "crit", label: "Keen", stat: "crit", min: 0.02, max: 0.06 },
  { id: "armor", label: "Guarded", stat: "armor", min: 1, max: 3 },
  { id: "dmg", label: "Fierce", stat: "dmg", min: 2, max: 7 },
];

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
    helm: ["Helm", "Hood", "Mask", "Crown"],
    chest: ["Tunic", "Mail", "Plate", "Robe"],
    boots: ["Boots", "Greaves", "Treads"],
    weapon: ["Sword", "Dagger", "Wand", "Axe"],
    ring: ["Ring", "Band", "Seal"],
  };

  const mats = {
    common: ["Worn", "Simple", "Battered"],
    uncommon: ["Sturdy", "Runed", "Fine"],
    rare: ["Gleaming", "Knightly", "Arc-forged"],
    epic: ["Mythic", "Stormbound", "Voidwrought"],
    legendary: ["Sunfire", "Starforged", "Eternity"],
  };

  const baseStats = { hp: 0, mana: 0, dmg: 0, armor: 0, crit: 0 };
  if (slot === "weapon") baseStats.dmg = 2 + ((tier * 1.2) | 0);
  if (slot === "chest") baseStats.hp = 10 + tier * 3;
  if (slot === "boots") baseStats.armor = 1 + ((tier * 0.5) | 0);
  if (slot === "helm") baseStats.mana = 8 + tier * 2;
  if (slot === "ring") baseStats.crit = 0.01 + tier * 0.002;

  const affCount =
    rarity === "legendary" ? 3 : rarity === "epic" ? 2 : rarity === "rare" ? 2 : rarity === "uncommon" ? 1 : 0;

  const pick = [];
  for (let i = 0; i < affCount; i++) {
    const a = AFFIX_POOL[rng.int(0, AFFIX_POOL.length - 1)];
    if (pick.includes(a.id)) continue;
    pick.push(a.id);
    const roll = lerp(a.min, a.max, rng.float()) * rarityMult(rarity) * (0.75 + tier * 0.08);
    baseStats[a.stat] = (baseStats[a.stat] || 0) + (a.stat === "crit" ? roll : Math.round(roll));
  }

  const name =
    `${mats[rarity] ? mats[rarity][rng.int(0, mats[rarity].length - 1)] : "Worn"} ` +
    `${names[slot][rng.int(0, names[slot].length - 1)]}`;

  return {
    slot,
    rarity,
    name,
    stats: baseStats,
  };
}

/* ============================
   PROJECTILE (spell readability)
   ============================ */
export class Projectile {
  constructor(x, y, vx, vy, dmg, life = 1.0, level = 1, meta = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.life = life;
    this.alive = true;
    this.level = level;
    this.meta = meta || {};

    this._t = 0;
    this._trail = [];
    this._spark = 0;
  }

  update(dt, world) {
    this._t += dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;

    const ox = this.x;
    const oy = this.y;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // trail
    this._trail.push({ x: ox, y: oy, t: this._t });
    if (this._trail.length > 18) this._trail.shift();

    // fizzle if hits water/solid
    if (world?.projectileHitsSolid?.(this.x, this.y)) {
      this.alive = false;
      this._spark = 0.35;
    }
  }

  draw(ctx, t) {
    const kind = this.meta?.kind || "bolt";
    const pierce = !!this.meta?.pierce;

    const core = kind === "pierce" || pierce ? "#9bd0ff" : "#6cffdf";
    const rim = kind === "pierce" || pierce ? "#2b6cff" : "#00b3ff";

    // trail
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < this._trail.length; i++) {
      const p = this._trail[i];
      const age = (this._t - p.t) / 0.18;
      const a = clamp(1 - age, 0, 1) * 0.35;
      if (a <= 0) continue;

      const r = 5 + i * 0.12;
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(core, 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = rgba(rim, 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // core head
    const headR = pierce ? 7.5 : 6.5;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = rgba(core, 1);
    ctx.beginPath();
    ctx.arc(this.x, this.y, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = rgba(rim, 1);
    ctx.beginPath();
    ctx.arc(this.x, this.y, headR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // sparks
    const sp = Math.sin((t + this._t) * 28) * 0.5 + 0.5;
    ctx.globalAlpha = 0.25 + sp * 0.35;
    sparkle(ctx, this.x + 2, this.y - 1, t + this._t, 0.7, rgba(core, 0.95));

    ctx.restore();
  }
}

/* ============================
   LOOT
   ============================ */
export class Loot {
  constructor(x, y, item) {
    this.x = x;
    this.y = y;
    this.item = item;
    this._t = 0;
    this._spin = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this._t += dt;
    this._spin += dt * 2.3;
  }

  draw(ctx, t) {
    const bob = Math.sin((t + this._t) * 3.2) * 3.5;
    const x = this.x;
    const y = this.y + bob;

    const it = this.item || {};
    drawShadow(ctx, x, this.y + 16, 10, 4, 0.22);

    if (it.kind === "gold") {
      ctx.save();
      ctx.translate(x, y);
      const w = 10 + Math.sin(this._spin) * 2;
      const h = 12;
      ctx.fillStyle = "#ffcf4a";
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(-2, -3, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    if (it.kind === "potion") {
      const isMana = it.type === "mana";
      ctx.save();
      ctx.translate(x, y);

      // bottle
      const body = rrPath(-7, -10, 14, 18, 4);
      ctx.fillStyle = "rgba(245,250,255,0.85)";
      ctx.fill(body);
      outlineStroke(ctx, body, "rgba(0,0,0,0.35)", 2);

      // liquid
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = isMana ? "rgba(110,170,255,0.95)" : "rgba(255,120,130,0.95)";
      const fillH = 10 + Math.sin(this._spin) * 1.2;
      ctx.fillRect(-6, 6 - fillH, 12, fillH);
      ctx.globalAlpha = 1;

      // cork
      ctx.fillStyle = "#7a5333";
      ctx.fillRect(-5, -14, 10, 6);

      // glow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = isMana ? "rgba(110,170,255,1)" : "rgba(255,120,130,1)";
      ctx.beginPath();
      ctx.arc(0, 2, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (it.kind === "gear" && it.gear) {
      const g = it.gear;
      const col = rarityColor(g.rarity);
      ctx.save();
      ctx.translate(x, y);

      // chest icon
      drawShadow(ctx, 0, 12, 12, 5, 0.18);
      const box = rrPath(-12, -10, 24, 20, 6);
      ctx.fillStyle = "rgba(25,30,45,0.8)";
      ctx.fill(box);
      outlineStroke(ctx, box, rgba(col, 0.7), 2);

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = rgba(col, 0.95);
      ctx.fillRect(-12, -10, 24, 4);
      ctx.globalAlpha = 1;

      sparkle(ctx, 10, -10, t + this._t, 0.6, rgba(col, 0.9));
      ctx.restore();
      return;
    }
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
    this.potions = { hp: 0, mana: 0 };

    this.base = {
      maxHp: 120,
      maxMana: 80,
      dmg: 12,
      armor: 0,
      crit: 0.05,
      critMult: 1.6,
    };

    this.hp = this.base.maxHp;
    this.mana = this.base.maxMana;

    this.state = { sailing: false, invulnerable: false, invulnT: 0 };

    this.lastMove = { x: 1, y: 0 };

    this.inventory = [];
    this.equip = { helm: null, chest: null, boots: null, weapon: null, ring: null };

    this._walk = 0;
    this._t = 0;
    this._hit = 0;
  }

  getStats() {
    let maxHp = this.base.maxHp + this.level * 12;
    let maxMana = this.base.maxMana + this.level * 8;
    let dmg = this.base.dmg + this.level * 2;
    let armor = this.base.armor;
    let crit = this.base.crit;
    let critMult = this.base.critMult;

    for (const s of GearSlots) {
      const g = this.equip[s];
      if (!g) continue;
      maxHp += g.stats.hp || 0;
      maxMana += g.stats.mana || 0;
      dmg += g.stats.dmg || 0;
      armor += g.stats.armor || 0;
      crit += g.stats.crit || 0;
    }
    return { maxHp, maxMana, dmg, armor, crit, critMult };
  }

  giveXP(amt) {
    this.xp += amt;
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level++;
      this.nextXp = Math.round(this.nextXp * 1.25 + 10);
    }
  }

  takeDamage(raw) {
    if (this.state?.invulnerable) return 0;
    const st = this.getStats();
    const armor = st.armor || 0;
    const dmg = Math.max(1, raw - armor * 0.9);
    this.hp = Math.max(0, this.hp - dmg);
    this.state.invulnerable = true;
    this.state.invulnT = 0.35;
    this._hit = 0.20;
    return dmg;
  }

  update(dt) {
    this._t += dt;
    const st = this.getStats();
    this.hp = clamp(this.hp + dt * 1.4, 0, st.maxHp);
    this.mana = clamp(this.mana + dt * 4.2, 0, st.maxMana);
    this.state.invulnT = Math.max(0, (this.state.invulnT || 0) - dt);
    if (this.state.invulnT <= 0) this.state.invulnerable = false;

    this._hit = Math.max(0, this._hit - dt);

    const lm = this.lastMove || { x: 0, y: 0 };
    const moving = Math.abs(lm.x) + Math.abs(lm.y) > 0.01;
    this._walk = clamp(this._walk + (moving ? dt * 3.8 : -dt * 4.2), 0, 1);
  }

  draw(ctx, t) {
    const lm = this.lastMove || { x: 1, y: 0 };
    const d = norm(lm.x, lm.y);
    const facing = { x: d.x || 1, y: d.y || 0 };

    const walk = this._walk;
    const bob = Math.sin((t + this._t) * 8) * 2.8 * walk;
    const squash = 1 - 0.06 * Math.sin((t + this._t) * 8) * walk;

    const x = this.x;
    const y = this.y + bob;

    // sailing bob a bit more
    const sail = this.state?.sailing ? 1 : 0;
    const sailBob = sail ? Math.sin((t + this._t) * 3.2) * 2.0 : 0;

    drawShadow(ctx, x, this.y + 18 + sailBob, 16, 6, 0.30);

    // cape
    ctx.save();
    ctx.globalAlpha = 0.92;
    const cape = new Path2D();
    cape.moveTo(x - 12, y + 6);
    cape.quadraticCurveTo(x - 11, y + 18, x - 2, y + 20);
    cape.quadraticCurveTo(x + 8, y + 18, x + 12, y + 6);
    cape.quadraticCurveTo(x + 6, y + 10, x, y + 8);
    cape.quadraticCurveTo(x - 6, y + 10, x - 12, y + 6);
    ctx.fillStyle = "rgba(20,30,52,0.86)";
    ctx.fill(cape);
    outlineStroke(ctx, cape, "rgba(0,0,0,0.35)", 2);

    // cape highlight edge
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 8);
    ctx.quadraticCurveTo(x - 6, y + 16, x - 1, y + 18);
    ctx.stroke();
    ctx.restore();

    // hero body
    ctx.save();
    ctx.translate(x, y + sailBob);
    ctx.scale(1, squash);

    // body base
    const body = new Path2D();
    body.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(60,80,120,0.95)";
    ctx.fill(body);

    // armor shading (pseudo 3D)
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.ellipse(3, 3, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-4, -6, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    outlineStroke(ctx, body, "rgba(0,0,0,0.42)", 2);

    // head
    const head = new Path2D();
    head.ellipse(0, -18, 9, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(215,190,160,0.95)";
    ctx.fill(head);
    outlineStroke(ctx, head, "rgba(0,0,0,0.35)", 2);

    // visor
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(25,25,35,0.8)";
    ctx.beginPath();
    ctx.roundRect(-6, -21, 12, 6, 3);
    ctx.fill();
    ctx.globalAlpha = 1;

    // sword (directional)
    const sx = facing.x * 12;
    const sy = facing.y * 6;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(facing.y, facing.x));

    // sword shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(6, -2, 22, 5);

    // blade
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(215,230,255,0.95)";
    ctx.fillRect(6, -3, 22, 6);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(6, 1, 22, 2);
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(6, -3, 22, 1);

    // hilt
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#7a5333";
    ctx.fillRect(0, -2, 7, 4);
    ctx.fillStyle = "#b59b60";
    ctx.fillRect(-2, -4, 4, 8);

    ctx.restore();

    // hit flash
    if (this._hit > 0) hitFlash(ctx, 0, 0, 18, clamp(this._hit / 0.20, 0, 1) * 0.35);

    ctx.restore();
  }
}

/* ============================
   ENEMY (camp/leash + distinct looks)
   ============================ */
function enemyPalette(type, biome) {
  // Distinct base colors per enemy type (not just hue swaps)
  if (type === "slime") return { base: "#2fd39a", rim: "#7bffe0", dark: "#147a58" };
  if (type === "brute") return { base: "#a66a38", rim: "#ffd2a2", dark: "#6b3d1e" };
  if (type === "wolf") return { base: "#6f7a86", rim: "#d6dee8", dark: "#3f4650" };
  if (type === "scorpion") return { base: "#9b3d2e", rim: "#ffb48e", dark: "#5a1d14" };
  if (type === "raider") return { base: "#384f7d", rim: "#b5c6ff", dark: "#1b2a4a" };
  if (type === "sprite") return { base: "#3be06f", rim: "#c7ffd8", dark: "#1a7c3a" };
  if (type === "wisp") return { base: "#7cc8ff", rim: "#e3f3ff", dark: "#2b6cff" };
  if (type === "leech") return { base: "#4c2f43", rim: "#dca9d2", dark: "#2a1725" };
  if (type === "grunt") return { base: "#5b8a3a", rim: "#d4ffb0", dark: "#2f4d1c" };
  if (type === "charger") return { base: "#c47b2e", rim: "#ffe2b0", dark: "#6b3a12" };
  if (type === "stalker") return { base: "#4b3aa6", rim: "#d6c8ff", dark: "#221a5f" };

  // fallback by biome
  if (biome === "snow") return { base: "#7a8796", rim: "#e6eefc", dark: "#3f4650" };
  if (biome === "desert") return { base: "#b59b60", rim: "#ffe2b0", dark: "#6b4b22" };
  if (biome === "swamp") return { base: "#3a6a4c", rim: "#bff0d2", dark: "#1f3f2c" };
  return { base: "#6b7383", rim: "#d9e2f2", dark: "#3f4650" };
}

export class Enemy {
  constructor(x, y, tier = 1, type = "grunt", biome = "grass") {
    this.x = x;
    this.y = y;
    this.tier = tier;
    this.type = type || "grunt";
    this.biome = biome || "grass";

    this.alive = true;
    this.r = this.type === "brute" ? 20 : this.type === "wolf" ? 18 : 16;

    this.maxHp = Math.round((this.type === "brute" ? 55 : this.type === "wolf" ? 38 : 30) * (1 + tier * 0.26));
    this.hp = this.maxHp;

    this._t = 0;
    this._walk = 0;
    this._hit = 0;
    this._atk = 0;

    // Movement
    this.vx = 0;
    this.vy = 0;

    // AI injected by game.js (camp logic)
    // e.ai = { campId, centerX, centerY, leash, aggro, roamT, roamAng }
    this.ai = this.ai || null;

    // internal cooldowns
    this._attackCd = 0;
  }

  xpValue() {
    return 7 + (this.tier | 0) * 3 + (this.type === "brute" ? 5 : 0);
  }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    this._hit = 0.18;
    if (this.hp <= 0) this.alive = false;
  }

  update(dt, hero, world, game) {
    this._t += dt;
    this._hit = Math.max(0, this._hit - dt);
    this._attackCd = Math.max(0, this._attackCd - dt);

    // If hero is sailing, enemies should calm down and not chase into water
    const heroSailing = !!hero?.state?.sailing;

    // Camp AI: roam near center, aggro only if close, leash back if too far
    const ai = this.ai || null;
    const leash = ai?.leash ?? 260;
    const centerX = ai?.centerX ?? this.x;
    const centerY = ai?.centerY ?? this.y;

    // Determine aggro conditions
    const d2Hero = dist2(this.x, this.y, hero.x, hero.y);
    const aggroDist = 260;
    const dropAggroDist = 340;

    // Don't aggro if hero is very far OR hero is sailing
    if (heroSailing) {
      if (ai) ai.aggro = false;
    } else {
      if (ai) {
        if (!ai.aggro && d2Hero < aggroDist * aggroDist) ai.aggro = true;
        if (ai.aggro && d2Hero > dropAggroDist * dropAggroDist) ai.aggro = false;
      }
    }

    // Leash: if too far from camp center, force return
    const d2Camp = dist2(this.x, this.y, centerX, centerY);
    const forcedReturn = ai && d2Camp > leash * leash;

    // Movement target
    let tx = this.x;
    let ty = this.y;

    if (forcedReturn) {
      tx = centerX;
      ty = centerY;
      if (ai) ai.aggro = false;
    } else if (ai && ai.aggro) {
      tx = hero.x;
      ty = hero.y;
    } else if (ai) {
      // roam in a small orbit around camp
      ai.roamT = (ai.roamT || 0) - dt;
      if (ai.roamT <= 0) {
        ai.roamT = 1.5 + Math.random() * 2.5;
        ai.roamAng = (ai.roamAng || 0) + (Math.random() * 1.8 - 0.9);
      }
      const rr = 60 + (Math.sin((this._t + (ai.campId || 0)) * 0.7) * 25);
      tx = centerX + Math.cos(ai.roamAng || 0) * rr;
      ty = centerY + Math.sin(ai.roamAng || 0) * rr;
    }

    // Move speed varies by type
    let sp = 95 + this.tier * 7;
    if (this.type === "wolf") sp += 25;
    if (this.type === "wisp" || this.type === "sprite") sp += 15;
    if (this.type === "brute") sp -= 18;
    if (heroSailing) sp *= 0.35;

    const dir = norm(tx - this.x, ty - this.y);
    const moving = Math.abs(dir.x) + Math.abs(dir.y) > 0.01;

    this._walk = clamp(this._walk + (moving ? dt * 3.2 : -dt * 4.0), 0, 1);

    let nx = this.x + dir.x * sp * dt;
    let ny = this.y + dir.y * sp * dt;

    // Enemies can't walk into water
    if (world?.canWalk?.(nx, ny)) {
      this.x = nx;
      this.y = ny;
    } else {
      // small slide attempts
      if (world?.canWalk?.(nx, this.y)) this.x = nx;
      if (world?.canWalk?.(this.x, ny)) this.y = ny;
    }

    // Attack if close and not sailing
    const atkRange = this.type === "brute" ? 34 : 28;
    const shouldAtk = !heroSailing && d2Hero < atkRange * atkRange && !forcedReturn && (ai?.aggro || !ai);

    if (shouldAtk && this._attackCd <= 0) {
      this._attackCd = this.type === "wolf" ? 0.8 : this.type === "brute" ? 1.1 : 0.95;
      const base = 7 + this.tier * 2 + (this.type === "brute" ? 5 : 0);
      hero.takeDamage?.(base);
      this._atk = 0.18;
    }
    this._atk = Math.max(0, this._atk - dt);
  }

  draw(ctx, t) {
    const pal = enemyPalette(this.type, this.biome);
    const walk = this._walk;
    const bob = Math.sin((t + this._t) * (this.type === "wisp" ? 2.4 : 6.6)) * (this.type === "wisp" ? 6 : 2.2) * (this.type === "wisp" ? 1 : walk);
    const squash = 1 - 0.06 * Math.sin((t + this._t) * 7.2) * walk;

    const x = this.x;
    const y = this.y + bob;

    const shadowW = this.type === "brute" ? 22 : this.type === "wolf" ? 20 : 18;
    drawShadow(ctx, x, this.y + 16, shadowW, 7, 0.28);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, squash);

    // subtle aura for wisps/sprites
    if (this.type === "wisp" || this.type === "sprite") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = rgba(pal.rim, 1);
      ctx.beginPath();
      ctx.arc(0, -6, this.type === "wisp" ? 26 : 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ATTACK windup flash
    if (this._atk > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this._atk / 0.18, 0, 1) * 0.25;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,220,160,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Distinct silhouettes by type
    if (this.type === "slime") this._drawSlime(ctx, pal, t);
    else if (this.type === "brute") this._drawBrute(ctx, pal, t);
    else if (this.type === "wolf") this._drawWolf(ctx, pal, t);
    else if (this.type === "scorpion") this._drawScorpion(ctx, pal, t);
    else if (this.type === "raider") this._drawRaider(ctx, pal, t);
    else if (this.type === "sprite") this._drawSprite(ctx, pal, t);
    else if (this.type === "wisp") this._drawWisp(ctx, pal, t);
    else if (this.type === "leech") this._drawLeech(ctx, pal, t);
    else if (this.type === "charger") this._drawCharger(ctx, pal, t);
    else if (this.type === "stalker") this._drawStalker(ctx, pal, t);
    else this._drawGrunt(ctx, pal, t);

    // hit flash
    if (this._hit > 0) {
      const a = clamp(this._hit / 0.18, 0, 1);
      hitFlash(ctx, 0, 0, 18 + (1 - a) * 6, a * 0.25);
    }

    // HP bar (small, readable)
    const p = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 0.60;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(-22, -28, 44, 6);
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(255,210,138,0.95)";
    ctx.fillRect(-22, -28, 44 * p, 6);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _bodyBlob(ctx, pal, w, h) {
    const b = new Path2D();
    b.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.base, 0.95);
    ctx.fill(b);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.ellipse(3, 4, w * 0.9, h * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-4, -6, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    outlineStroke(ctx, b, "rgba(0,0,0,0.40)", 2);
  }

  _drawSlime(ctx, pal, t) {
    // squat jelly + face
    const squ = 1 + Math.sin((t + this._t) * 6.2) * 0.08;
    ctx.save();
    ctx.scale(1.05, 0.95 * squ);

    this._bodyBlob(ctx, pal, 16, 12);

    // inner core
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = rgba(pal.rim, 1);
    ctx.beginPath();
    ctx.ellipse(0, -2, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // eyes
    ctx.fillStyle = "rgba(10,10,15,0.75)";
    ctx.beginPath();
    ctx.arc(-5, -2, 2.2, 0, Math.PI * 2);
    ctx.arc(5, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawBrute(ctx, pal, t) {
    // big torso + club
    this._bodyBlob(ctx, pal, 18, 20);

    // shoulders
    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.beginPath();
    ctx.ellipse(-14, -4, 6, 9, 0.2, 0, Math.PI * 2);
    ctx.ellipse(14, -4, 6, 9, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = rgba(mixColor(pal.base, "#ffd2a2", 0.35), 0.95);
    ctx.beginPath();
    ctx.arc(0, -22, 9, 0, Math.PI * 2);
    ctx.fill();
    outlineStroke(ctx, new Path2D("M0 0"), "rgba(0,0,0,0)", 1); // no-op to avoid extra outline

    // club arm
    ctx.save();
    ctx.rotate(Math.sin((t + this._t) * 5.0) * 0.10);
    ctx.fillStyle = "#5b3c25";
    ctx.fillRect(16, -6, 18, 5);
    ctx.fillStyle = "#7a5333";
    ctx.fillRect(30, -10, 8, 13);
    ctx.restore();

    // horns
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(255,235,220,0.75)";
    ctx.beginPath();
    ctx.moveTo(-4, -31);
    ctx.lineTo(-15, -25);
    ctx.lineTo(-6, -23);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -31);
    ctx.lineTo(15, -25);
    ctx.lineTo(6, -23);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawWolf(ctx, pal, t) {
    // quadruped silhouette
    ctx.save();
    ctx.translate(0, 4);

    // body
    const body = new Path2D();
    body.ellipse(0, -2, 18, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.base, 0.95);
    ctx.fill(body);
    outlineStroke(ctx, body, "rgba(0,0,0,0.40)", 2);

    // head + snout
    ctx.fillStyle = rgba(mixColor(pal.base, pal.rim, 0.25), 0.95);
    ctx.beginPath();
    ctx.ellipse(18, -6, 9, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.beginPath();
    ctx.ellipse(26, -4, 6, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // ears
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.beginPath();
    ctx.moveTo(17, -14);
    ctx.lineTo(20, -22);
    ctx.lineTo(24, -14);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, -13);
    ctx.lineTo(14, -21);
    ctx.lineTo(18, -13);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // legs (simple)
    const step = Math.sin((t + this._t) * 10) * 3;
    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.fillRect(-10, 2 + step * 0.2, 4, 10);
    ctx.fillRect(-2, 2 - step * 0.2, 4, 10);
    ctx.fillRect(6, 2 + step * 0.2, 4, 10);
    ctx.fillRect(14, 2 - step * 0.2, 4, 10);

    // eye
    ctx.fillStyle = "rgba(10,10,15,0.75)";
    ctx.beginPath();
    ctx.arc(18, -8, 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawScorpion(ctx, pal, t) {
    // segmented body + tail stinger
    ctx.save();
    ctx.translate(-2, 2);

    // body segments
    ctx.fillStyle = rgba(pal.base, 0.95);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(i * 8, -2, 7 - i * 0.6, 6 - i * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // outline-ish
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.quadraticCurveTo(10, -16, 26, -2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // claws
    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.beginPath();
    ctx.ellipse(-10, -2, 7, 5, 0.2, 0, Math.PI * 2);
    ctx.ellipse(-16, -6, 5, 4, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // tail
    const sway = Math.sin((t + this._t) * 3.6) * 0.35;
    ctx.save();
    ctx.translate(26, -6);
    ctx.rotate(-0.8 + sway);
    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.fillRect(0, 0, 18, 4);
    ctx.rotate(-0.55);
    ctx.fillRect(12, -4, 14, 4);
    // stinger
    ctx.fillStyle = rgba(pal.rim, 0.95);
    ctx.beginPath();
    ctx.moveTo(24, -8);
    ctx.lineTo(36, -2);
    ctx.lineTo(24, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // eye dots
    ctx.fillStyle = "rgba(10,10,15,0.75)";
    ctx.beginPath();
    ctx.arc(6, -6, 1.5, 0, Math.PI * 2);
    ctx.arc(10, -6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawRaider(ctx, pal, t) {
    // humanoid with hood + dagger
    // body
    const torso = rrPath(-12, -6, 24, 22, 8);
    ctx.fillStyle = rgba(pal.base, 0.95);
    ctx.fill(torso);
    outlineStroke(ctx, torso, "rgba(0,0,0,0.40)", 2);

    // hood/head
    const hood = new Path2D();
    hood.moveTo(-12, -8);
    hood.quadraticCurveTo(0, -26, 12, -8);
    hood.quadraticCurveTo(8, -2, 0, -2);
    hood.quadraticCurveTo(-8, -2, -12, -8);
    ctx.fillStyle = rgba(pal.dark, 0.98);
    ctx.fill(hood);
    outlineStroke(ctx, hood, "rgba(0,0,0,0.40)", 2);

    // face slit
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(10,10,15,0.6)";
    ctx.fillRect(-6, -14, 12, 5);
    ctx.globalAlpha = 1;

    // dagger
    ctx.save();
    const swing = Math.sin((t + this._t) * 7.0) * 0.18;
    ctx.rotate(0.15 + swing);
    ctx.fillStyle = "#7a5333";
    ctx.fillRect(12, 2, 10, 4);
    ctx.fillStyle = "rgba(215,230,255,0.95)";
    ctx.fillRect(18, 1, 18, 6);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(18, 1, 18, 1);
    ctx.globalAlpha = 1;
    ctx.restore();

    // boots
    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.fillRect(-10, 14, 7, 6);
    ctx.fillRect(3, 14, 7, 6);
  }

  _drawSprite(ctx, pal, t) {
    // leaf fairy: small body + wings
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // wings
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = rgba(pal.rim, 1);
    ctx.beginPath();
    ctx.ellipse(-10, -10, 14, 10, -0.6, 0, Math.PI * 2);
    ctx.ellipse(10, -10, 14, 10, 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // body
    this._bodyBlob(ctx, pal, 12, 14);

    // crown leaf
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = rgba(pal.rim, 0.95);
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(-6, -18, -2, -12);
    ctx.quadraticCurveTo(2, -18, 0, -22);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // sparkles
    sparkle(ctx, -14, -12, t + this._t, 0.7, rgba(pal.rim, 0.95));
    sparkle(ctx, 14, -10, t + this._t + 1.1, 0.6, rgba(pal.rim, 0.95));
  }

  _drawWisp(ctx, pal, t) {
    // ghost flame with trailing tail
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // main flame
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = rgba(pal.rim, 1);
    ctx.beginPath();
    ctx.ellipse(0, -6, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = rgba(pal.base, 1);
    ctx.beginPath();
    ctx.ellipse(0, -6, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail
    const sway = Math.sin((t + this._t) * 2.6) * 5;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = rgba(pal.base, 1);
    ctx.beginPath();
    ctx.ellipse(-sway * 0.25, 12, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // core
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(0, -10, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // eyes
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(10,10,15,0.55)";
    ctx.beginPath();
    ctx.arc(-5, -10, 2.0, 0, Math.PI * 2);
    ctx.arc(5, -10, 2.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawLeech(ctx, pal, t) {
    // wormy segmented body
    ctx.save();
    ctx.translate(0, 6);
    const wrig = Math.sin((t + this._t) * 6.0) * 2.8;

    for (let i = 0; i < 6; i++) {
      const xx = -14 + i * 6 + Math.sin((t + this._t) * 5.2 + i) * 1.4;
      const yy = -2 + Math.sin((t + this._t) * 5.2 + i * 0.7) * 1.2;
      const rr = 6 - i * 0.4;
      ctx.fillStyle = rgba(i < 2 ? pal.rim : pal.base, 0.95);
      ctx.beginPath();
      ctx.ellipse(xx, yy, rr, rr - 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // mouth
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(10,10,15,0.65)";
    ctx.beginPath();
    ctx.ellipse(14 + wrig * 0.2, -2, 5, 3.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _drawCharger(ctx, pal, t) {
    // rhino-ish charger: horn + heavy body
    this._bodyBlob(ctx, pal, 18, 16);

    ctx.fillStyle = rgba(pal.dark, 0.95);
    ctx.beginPath();
    ctx.ellipse(-6, 8, 10, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // horn
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,235,220,0.75)";
    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.lineTo(32, -1);
    ctx.lineTo(18, 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawStalker(ctx, pal, t) {
    // spidery shadow creature: long legs + core
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = rgba(pal.dark, 0.9);
    ctx.lineWidth = 3;
    const leg = Math.sin((t + this._t) * 6.2) * 3;
    for (let i = 0; i < 4; i++) {
      const s = i < 2 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(s * (14 + i * 3), 8 + leg * (i % 2 ? 0.4 : -0.4));
      ctx.stroke();
    }
    ctx.restore();

    this._bodyBlob(ctx, pal, 12, 12);

    // eyes glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = rgba(pal.rim, 1);
    ctx.beginPath();
    ctx.arc(-4, -4, 2.3, 0, Math.PI * 2);
    ctx.arc(4, -4, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawGrunt(ctx, pal, t) {
    // goblin-like: head + body + spear
    const torso = rrPath(-11, -2, 22, 20, 8);
    ctx.fillStyle = rgba(pal.base, 0.95);
    ctx.fill(torso);
    outlineStroke(ctx, torso, "rgba(0,0,0,0.40)", 2);

    // head
    ctx.fillStyle = rgba(mixColor(pal.base, pal.rim, 0.2), 0.95);
    ctx.beginPath();
    ctx.arc(0, -18, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(-3, -21, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // spear
    ctx.save();
    const sway = Math.sin((t + this._t) * 5.8) * 0.15;
    ctx.rotate(0.25 + sway);
    ctx.fillStyle = "#7a5333";
    ctx.fillRect(10, -2, 26, 4);
    ctx.fillStyle = "rgba(230,230,240,0.95)";
    ctx.beginPath();
    ctx.moveTo(36, -6);
    ctx.lineTo(46, 0);
    ctx.lineTo(36, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // eyes
    ctx.fillStyle = "rgba(10,10,15,0.65)";
    ctx.beginPath();
    ctx.arc(-3, -18, 1.8, 0, Math.PI * 2);
    ctx.arc(3, -18, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}
