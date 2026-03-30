// src/entities.js
// v31 HERO FACING + COMBAT FEEL POLISH PASS (FULL FILE)
// What this pass adds safely:
// - hero visually faces left/right/up/down better
// - up/down casting reads more clearly on screen
// - light mana-regeneration visual feel
// - cleaner projectile readability
// - keeps exports compatible with current game.js
//
// Replace ENTIRE file: src/entities.js

import { clamp, norm, hash2, RNG } from "./util.js";

/* ===========================
   Gear generation
   =========================== */
function rarityFromRoll(r) {
  if (r > 0.985) return "epic";
  if (r > 0.93) return "rare";
  if (r > 0.72) return "uncommon";
  return "common";
}

function rarityMult(rarity) {
  switch (rarity) {
    case "epic": return 1.9;
    case "rare": return 1.45;
    case "uncommon": return 1.18;
    default: return 1.0;
  }
}

export function makeGear(seed = 12345, level = 1, slot = "weapon") {
  const rr = new RNG(seed | 0);
  const rarity = rarityFromRoll(rr.float());
  const mult = rarityMult(rarity);

  const base = Math.max(1, level | 0);
  const gear = {
    slot,
    level: base,
    rarity,
    name: "",
    stats: {
      dmg: 0,
      armor: 0,
      crit: 0,
    },
    price: 0,
  };

  if (slot === "weapon") {
    gear.stats.dmg = Math.max(1, Math.round((3 + base * 1.8 + rr.int(0, 3)) * mult));
    if (rarity === "rare" || rarity === "epic") {
      gear.stats.crit = 0.04 + rr.float() * 0.06;
    }
  } else {
    gear.stats.armor = Math.max(1, Math.round((2 + base * 1.2 + rr.int(0, 2)) * mult));
    if (slot === "ring" || slot === "trinket") {
      gear.stats.crit = 0.01 + rr.float() * 0.04 * mult;
    }
  }

  const prefix =
    rarity === "epic" ? "Mythic" :
    rarity === "rare" ? "Runed" :
    rarity === "uncommon" ? "Fine" : "Plain";

  const nouns = {
    weapon: ["Blade", "Staff", "Axe", "Spear"],
    armor: ["Mail", "Vest", "Cuirass", "Plate"],
    helm: ["Helm", "Hood", "Crown"],
    chest: ["Tunic", "Armor", "Harness"],
    boots: ["Boots", "Greaves", "Steps"],
    ring: ["Ring", "Band", "Loop"],
    trinket: ["Charm", "Sigil", "Idol"],
  };

  const pool = nouns[slot] || ["Gear"];
  gear.name = `${prefix} ${pool[rr.int(0, pool.length - 1)]}`;
  gear.price = Math.max(10, Math.round((base * 14 + rr.int(0, 14)) * mult));

  return gear;
}

/* ===========================
   Hero
   =========================== */
export class Hero {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    this.r = 14;

    this.level = 1;
    this.xp = 0;
    this.nextXp = 30;
    this.gold = 0;

    this.hp = 100;
    this.mana = 60;

    this.potions = { hp: 2, mana: 1 };
    this.inventory = [];
    this.equip = {};

    this.lastMove = { x: 1, y: 0 };
    this.state = {
      sailing: false,
      dashT: 0,
      hurtT: 0,
    };
  }

  getStats() {
    const st = {
      maxHp: 100 + (this.level - 1) * 10,
      maxMana: 60 + (this.level - 1) * 6,
      dmg: 8 + (this.level - 1) * 2,
      armor: 0,
      crit: 0.05,
      critMult: 1.7,
    };

    for (const k of Object.keys(this.equip || {})) {
      const it = this.equip[k];
      if (!it || !it.stats) continue;
      st.dmg += it.stats.dmg || 0;
      st.armor += it.stats.armor || 0;
      st.crit += it.stats.crit || 0;
    }

    return st;
  }

  update(dt) {
    if (this.state.dashT > 0) this.state.dashT = Math.max(0, this.state.dashT - dt);
    if (this.state.hurtT > 0) this.state.hurtT = Math.max(0, this.state.hurtT - dt);

    const st = this.getStats();
    this.hp = clamp(this.hp, 0, st.maxHp);
    this.mana = clamp(this.mana, 0, st.maxMana);
  }

  draw(ctx, t = 0) {
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 0.01;
    const bob = Math.sin(t * 8) * (moving ? 1.4 : 0.35);

    const face = norm(this.lastMove?.x || 1, this.lastMove?.y || 0);
    const fx = face.x || 1;
    const fy = face.y || 0;

    const facingUp = fy < -0.55;
    const facingDown = fy > 0.55;
    const facingSide = !facingUp && !facingDown;

    ctx.save();

    // shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 13, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // dash / hurt aura
    if (this.state.dashT > 0) {
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = "rgba(170,210,255,1)";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, 18, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state.hurtT > 0) {
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = "rgba(255,120,120,1)";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // very light mana shimmer
    if (this.mana > 6) {
      ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 3.5);
      ctx.fillStyle = "rgba(110,170,255,1)";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob - 2, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    if (facingUp) {
      this._drawHeroBack(ctx, bob, fx, fy);
    } else if (facingDown) {
      this._drawHeroFront(ctx, bob, fx, fy);
    } else {
      this._drawHeroSide(ctx, bob, fx, fy);
    }

    ctx.restore();
  }

  _drawHeroFront(ctx, bob, fx) {
    // body
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(68,105,200,0.96)";
    ctx.beginPath();
    ctx.moveTo(this.x - 10, this.y + 3 + bob);
    ctx.lineTo(this.x + 10, this.y + 3 + bob);
    ctx.lineTo(this.x + 7, this.y + 21 + bob);
    ctx.lineTo(this.x - 7, this.y + 21 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(112,155,255,0.95)";
    ctx.fillRect(this.x - 8, this.y + 3 + bob, 16, 3);

    // head
    ctx.fillStyle = this.state.hurtT > 0 ? "rgba(255,196,196,0.96)" : "rgba(245,226,192,0.96)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 4 + bob, 6, 0, Math.PI * 2);
    ctx.fill();

    // hair
    ctx.fillStyle = "rgba(36,50,110,0.98)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 6 + bob, 7, Math.PI, Math.PI * 2);
    ctx.fill();

    // face
    ctx.fillStyle = "rgba(28,28,32,0.92)";
    ctx.beginPath();
    ctx.arc(this.x - 2, this.y - 5 + bob, 0.9, 0, Math.PI * 2);
    ctx.arc(this.x + 2, this.y - 5 + bob, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // feet
    ctx.fillStyle = "rgba(60,44,36,0.95)";
    ctx.fillRect(this.x - 6, this.y + 19 + bob, 4, 2);
    ctx.fillRect(this.x + 2, this.y + 19 + bob, 4, 2);

    // weapon front
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + fx * 3, this.y + bob);
    ctx.lineTo(this.x + fx * 12, this.y + 9 + bob);
    ctx.stroke();
  }

  _drawHeroBack(ctx, bob, fx) {
    // cloak/body
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(58,95,188,0.96)";
    ctx.beginPath();
    ctx.moveTo(this.x - 10, this.y + 3 + bob);
    ctx.lineTo(this.x + 10, this.y + 3 + bob);
    ctx.lineTo(this.x + 7, this.y + 21 + bob);
    ctx.lineTo(this.x - 7, this.y + 21 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(34,58,126,0.96)";
    ctx.fillRect(this.x - 7, this.y + 7 + bob, 14, 7);

    // hood/hair back
    ctx.fillStyle = "rgba(36,50,110,0.98)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 4 + bob, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(245,226,192,0.92)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 2 + bob, 4.2, 0, Math.PI);
    ctx.fill();

    // boots
    ctx.fillStyle = "rgba(60,44,36,0.95)";
    ctx.fillRect(this.x - 6, this.y + 19 + bob, 4, 2);
    ctx.fillRect(this.x + 2, this.y + 19 + bob, 4, 2);

    // weapon raised upward
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + fx * 2, this.y - 1 + bob);
    ctx.lineTo(this.x + fx * 4, this.y - 13 + bob);
    ctx.stroke();
  }

  _drawHeroSide(ctx, bob, fx) {
    // body
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(68,105,200,0.96)";
    ctx.beginPath();
    ctx.moveTo(this.x - 9, this.y + 3 + bob);
    ctx.lineTo(this.x + 9, this.y + 3 + bob);
    ctx.lineTo(this.x + 6, this.y + 21 + bob);
    ctx.lineTo(this.x - 6, this.y + 21 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(112,155,255,0.95)";
    ctx.fillRect(this.x - 7, this.y + 3 + bob, 14, 3);

    // head
    ctx.fillStyle = this.state.hurtT > 0 ? "rgba(255,196,196,0.96)" : "rgba(245,226,192,0.96)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 4 + bob, 6, 0, Math.PI * 2);
    ctx.fill();

    // hair
    ctx.fillStyle = "rgba(36,50,110,0.98)";
    ctx.beginPath();
    ctx.arc(this.x - fx * 1.5, this.y - 6 + bob, 6.5, Math.PI, Math.PI * 2);
    ctx.fill();

    // one visible eye
    ctx.fillStyle = "rgba(28,28,32,0.92)";
    ctx.beginPath();
    ctx.arc(this.x + fx * 2, this.y - 5 + bob, 0.95, 0, Math.PI * 2);
    ctx.fill();

    // feet
    ctx.fillStyle = "rgba(60,44,36,0.95)";
    ctx.fillRect(this.x - 5, this.y + 19 + bob, 3, 2);
    ctx.fillRect(this.x + 2, this.y + 19 + bob, 3, 2);

    // side weapon
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + fx * 3, this.y + bob);
    ctx.lineTo(this.x + fx * 13, this.y + 6 + bob);
    ctx.stroke();
  }

  spendMana(cost) {
    if (this.mana < cost) return false;
    this.mana -= cost;
    return true;
  }

  takeDamage(raw) {
    const st = this.getStats();
    const armorMit = Math.min(0.6, (st.armor || 0) * 0.02);
    const dealt = Math.max(1, Math.round(raw * (1 - armorMit)));
    this.hp = Math.max(0, this.hp - dealt);
    this.state.hurtT = 0.18;
    return dealt;
  }

  giveXP(n) {
    this.xp += Math.max(0, n | 0);
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp;
      this.level += 1;
      this.nextXp = Math.round(this.nextXp * 1.35);
      const st = this.getStats();
      this.hp = st.maxHp;
      this.mana = st.maxMana;
    }
  }

  usePotion(kind) {
    if (!this.potions || (this.potions[kind] | 0) <= 0) return false;
    const st = this.getStats();

    if (kind === "hp") {
      if (this.hp >= st.maxHp) return false;
      this.hp = Math.min(st.maxHp, this.hp + 45);
    } else if (kind === "mana") {
      if (this.mana >= st.maxMana) return false;
      this.mana = Math.min(st.maxMana, this.mana + 35);
    } else {
      return false;
    }

    this.potions[kind] -= 1;
    return true;
  }
}

/* ===========================
   Enemy
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

    this.elite = ((hash2(seed, tier * 101 + (x | 0)) >>> 0) % 11) === 0;
    this.r = this.kind === "brute" ? 18 : this.kind === "blob" ? 13 : 14;
    if (this.elite) this.r += 2;

    this.speed =
      this.kind === "stalker" ? 95 :
      this.kind === "caster" ? 72 :
      this.kind === "brute" ? 56 : 68;

    if (this.elite) this.speed *= 1.06;

    this.maxHp =
      this.kind === "brute" ? 28 + this.tier * 14 :
      this.kind === "caster" ? 18 + this.tier * 9 :
      20 + this.tier * 10;

    if (this.elite) this.maxHp = Math.round(this.maxHp * 1.55);

    this.hp = this.maxHp;
    this.alive = true;

    this.home = null;
    this.attackCd = 0;
    this.wanderT = 0;
    this.wanderDir = { x: 1, y: 0 };
    this.flashT = 0;
    this._showHpT = 0;
  }

  xpValue() {
    let v = 5 + this.tier * 3 + (this.kind === "brute" ? 3 : 0);
    if (this.elite) v += 8;
    return v;
  }

  takeDamage(n) {
    this.hp -= Math.max(1, n | 0);
    this.flashT = 0.12;
    this._showHpT = 1.1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  update(dt, hero, world, game) {
    if (!this.alive) return;

    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.wanderT > 0) this.wanderT -= dt;
    if (this._showHpT > 0) this._showHpT -= dt;

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d2 = dx * dx + dy * dy;

    if (this.home) {
      const hx = this.home.x - this.x;
      const hy = this.home.y - this.y;
      const homeD2 = hx * hx + hy * hy;

      if (homeD2 > 680 * 680 && d2 > 280 * 280) {
        const n = norm(hx, hy);
        this.vx = n.x * this.speed;
        this.vy = n.y * this.speed;
        this._tryMove(dt, world);
        return;
      }
    }

    if (d2 < 260 * 260) {
      const n = norm(dx, dy);

      if (this.kind === "caster") {
        if (d2 < 120 * 120) {
          this.vx = -n.x * this.speed;
          this.vy = -n.y * this.speed;
        } else if (d2 > 170 * 170) {
          this.vx = n.x * this.speed * 0.8;
          this.vy = n.y * this.speed * 0.8;
        } else {
          this.vx = 0;
          this.vy = 0;
        }

        if (this.attackCd <= 0 && d2 < 240 * 240) {
          this.attackCd = this.elite ? 1.1 : 1.45;
          const p = new Projectile(
            this.x,
            this.y - 4,
            n.x * (this.elite ? 280 : 240),
            n.y * (this.elite ? 280 : 240),
            (6 + this.tier * 2) + (this.elite ? 2 : 0),
            2.0,
            this.tier,
            { color: this.elite ? "rgba(255,170,120,0.98)" : "rgba(255,120,120,0.95)", radius: this.elite ? 6 : 5, hitRadius: 16 }
          );
          p.friendly = false;
          p.meta.onHitHero = true;
          game.projectiles.push(p);
        }
      } else {
        this.vx = n.x * this.speed;
        this.vy = n.y * this.speed;

        if (d2 < (this.r + hero.r + 8) ** 2 && this.attackCd <= 0) {
          this.attackCd = this.kind === "stalker" ? 0.8 : 1.05;
          hero.takeDamage?.((5 + this.tier * 2 + (this.kind === "brute" ? 3 : 0)) + (this.elite ? 2 : 0));
          this._showHpT = 0.8;
        }
      }

      this._tryMove(dt, world);
      return;
    }

    if (this.wanderT <= 0) {
      const rr = new RNG(hash2((this.x | 0) ^ this.seed, (this.y | 0) + (performance.now() | 0)));
      const a = rr.float() * Math.PI * 2;
      this.wanderDir = { x: Math.cos(a), y: Math.sin(a) };
      this.wanderT = 0.8 + rr.float() * 1.4;
    }

    this.vx = this.wanderDir.x * this.speed * 0.35;
    this.vy = this.wanderDir.y * this.speed * 0.35;
    this._tryMove(dt, world);
  }

  _tryMove(dt, world) {
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (world.canWalk?.(nx, this.y)) this.x = nx;
    if (world.canWalk?.(this.x, ny)) this.y = ny;
  }

  draw(ctx, t = 0) {
    if (!this.alive) return;
    const bob = Math.sin(t * 7 + this.seed) * 0.8;

    ctx.save();

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 11, this.r * 0.95, this.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.flashT > 0) {
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = "rgba(255,230,230,1)";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, this.r + 6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.elite) {
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = "rgba(255,220,110,1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, this.r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.kind === "blob") {
      this._drawBlob(ctx, bob);
    } else if (this.kind === "stalker") {
      this._drawStalker(ctx, bob);
    } else if (this.kind === "brute") {
      this._drawBrute(ctx, bob);
    } else {
      this._drawCaster(ctx, bob);
    }

    if (this.elite) this._drawEliteMark(ctx, bob);
    if (this._showHpT > 0 || this.hp < this.maxHp) this._drawHpBar(ctx, bob);

    ctx.restore();
  }

  _drawBlob(ctx, bob) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.flashT > 0
      ? "rgba(255,220,220,0.95)"
      : this.elite ? "rgba(205,232,118,0.98)" : "rgba(165,220,118,0.97)";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(220,255,220,0.28)";
    ctx.beginPath();
    ctx.arc(this.x - 4, this.y - 5 + bob, this.r * 0.35, 0, Math.PI * 2);
    ctx.fill();

    this._drawEyes(ctx, bob);
  }

  _drawStalker(ctx, bob) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.flashT > 0
      ? "rgba(255,220,220,0.95)"
      : this.elite ? "rgba(168,224,94,0.98)" : "rgba(132,196,82,0.97)";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.r + bob);
    ctx.lineTo(this.x + this.r, this.y + bob);
    ctx.lineTo(this.x, this.y + this.r + bob);
    ctx.lineTo(this.x - this.r, this.y + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(210,245,180,0.22)";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.r * 0.75 + bob);
    ctx.lineTo(this.x + this.r * 0.45, this.y + bob);
    ctx.lineTo(this.x, this.y + this.r * 0.55 + bob);
    ctx.closePath();
    ctx.fill();

    this._drawEyes(ctx, bob);
  }

  _drawBrute(ctx, bob) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.flashT > 0
      ? "rgba(255,220,220,0.95)"
      : this.elite ? "rgba(202,122,98,0.98)" : "rgba(176,102,84,0.97)";
    ctx.fillRect(this.x - this.r, this.y - this.r + bob, this.r * 2, this.r * 2);

    ctx.fillStyle = "rgba(215,150,125,0.18)";
    ctx.fillRect(this.x - this.r + 3, this.y - this.r + 3 + bob, this.r * 1.1, this.r * 0.7);

    this._drawEyes(ctx, bob);
  }

  _drawCaster(ctx, bob) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.flashT > 0
      ? "rgba(255,220,220,0.95)"
      : this.elite ? "rgba(170,132,228,0.98)" : "rgba(142,108,205,0.97)";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.r + bob);
    ctx.lineTo(this.x + this.r * 0.9, this.y + this.r * 0.5 + bob);
    ctx.lineTo(this.x - this.r * 0.9, this.y + this.r * 0.5 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(190,170,255,0.16)";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 2 + bob, this.r * 0.95, 0, Math.PI * 2);
    ctx.fill();

    this._drawEyes(ctx, bob);
  }

  _drawEyes(ctx, bob) {
    ctx.fillStyle = "rgba(20,20,24,0.95)";
    ctx.beginPath();
    ctx.arc(this.x - 4, this.y - 2 + bob, 1.7, 0, Math.PI * 2);
    ctx.arc(this.x + 4, this.y - 2 + bob, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawEliteMark(ctx, bob) {
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(255,224,110,1)";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - this.r - 8 + bob);
    ctx.lineTo(this.x + 5, this.y - this.r - 1 + bob);
    ctx.lineTo(this.x, this.y - this.r + 2 + bob);
    ctx.lineTo(this.x - 5, this.y - this.r - 1 + bob);
    ctx.closePath();
    ctx.fill();
  }

  _drawHpBar(ctx, bob) {
    const w = Math.max(18, this.r * 1.8);
    const h = 4;
    const x = this.x - w * 0.5;
    const y = this.y - this.r - 12 + bob;
    const p = clamp(this.hp / Math.max(1, this.maxHp), 0, 1);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = this.elite ? "rgba(255,208,92,0.98)" : "rgba(235,82,108,0.98)";
    ctx.fillRect(x, y, w * p, h);
  }
}

/* ===========================
   Projectile
   =========================== */
export class Projectile {
  constructor(x, y, vx, vy, dmg, life = 1, level = 1, style = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = Math.max(1, dmg | 0);
    this.life = Math.max(0.01, life);
    this.maxLife = this.life;
    this.level = level | 0;

    this.radius = style.radius || 5;
    this.hitRadius = style.hitRadius || Math.max(14, this.radius * 2.2);
    this.color = style.color || "rgba(255,255,255,0.95)";
    this.type = style.type || "bolt";
    this.friendly = style.friendly !== undefined ? !!style.friendly : true;

    this.meta = {};
    this.alive = true;
    this._hitSet = new Set();

    this.tx = x;
    this.ty = y;
  }

  update(dt, world) {
    if (!this.alive) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    if (this.type === "nova") {
      this.hitRadius += dt * 180;
      return;
    }

    this.tx = this.x;
    this.ty = this.y;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    if (world.isSolid?.(nx, ny)) {
      this.alive = false;
      return;
    }

    this.x = nx;
    this.y = ny;
  }

  draw(ctx) {
    if (!this.alive) return;

    ctx.save();

    if (this.type === "nova") {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hitRadius * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
      return;
    }

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = Math.max(2, this.radius * 0.9);
    ctx.beginPath();
    ctx.moveTo(this.tx, this.ty);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 1, this.y + 4, this.radius * 1.1, this.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.96;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.25, this.y - this.radius * 0.25, this.radius * 0.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/* ===========================
   Loot
   =========================== */
export class Loot {
  constructor(x, y, kind = "gold", data = {}) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.data = data || {};
    this.alive = true;
    this.age = 0;
    this.r = 11;
  }

  update(dt, hero) {
    if (!this.alive) return;

    this.age += dt;

    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const d2 = dx * dx + dy * dy;

    if (d2 < 120 * 120) {
      const n = norm(dx, dy);
      const speed = d2 < 28 * 28 ? 0 : 180;
      this.x += n.x * speed * dt;
      this.y += n.y * speed * dt;
    }

    if (d2 < (hero.r + this.r + 3) ** 2) {
      this._collect(hero);
      this.alive = false;
    }

    if (this.age > 18) this.alive = false;
  }

  _collect(hero) {
    if (this.kind === "gold") {
      hero.gold += Math.max(1, this.data.amount | 0);
      return;
    }

    if (this.kind === "potion") {
      const type = this.data.potionType || "hp";
      hero.potions = hero.potions || { hp: 0, mana: 0 };
      hero.potions[type] = (hero.potions[type] | 0) + Math.max(1, this.data.amount | 0);
      return;
    }

    if (this.kind === "gear") {
      hero.inventory = hero.inventory || [];
      if (this.data.gear) hero.inventory.push(this.data.gear);
    }
  }

  draw(ctx, t = 0) {
    if (!this.alive) return;
    const bob = Math.sin((t + this.x * 0.01) * 5) * 2.5;

    ctx.save();

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 8, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.08;
    ctx.fillStyle =
      this.kind === "gold" ? "rgba(255,220,90,1)" :
      this.kind === "potion" ? "rgba(120,170,255,1)" :
      "rgba(220,220,255,1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, 10 + Math.sin(t * 4 + this.x) * 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === "gold") {
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = "rgba(245,210,80,0.98)";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(this.x - 2, this.y - 2 + bob, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "potion") {
      const mana = this.data.potionType === "mana";
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = mana ? "rgba(95,150,255,0.98)" : "rgba(225,80,105,0.98)";
      ctx.fillRect(this.x - 5, this.y - 7 + bob, 10, 12);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(this.x - 3, this.y - 10 + bob, 6, 4);
    } else {
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = rarityTint(this.data?.gear?.rarity);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 8 + bob);
      ctx.lineTo(this.x + 7, this.y + 5 + bob);
      ctx.lineTo(this.x, this.y + 10 + bob);
      ctx.lineTo(this.x - 7, this.y + 5 + bob);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(this.x - 1, this.y - 1 + bob, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function rarityTint(rarity) {
  if (rarity === "epic") return "rgba(205,150,255,0.98)";
  if (rarity === "rare") return "rgba(120,190,255,0.98)";
  if (rarity === "uncommon") return "rgba(150,235,150,0.98)";
  return "rgba(220,220,230,0.98)";
}