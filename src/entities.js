// src/entities.js
import { clamp, dist2, lerp, RNG } from "./util.js";

/* ============================
   RARITY COLORS (UI)
   ============================ */
export function rarityColor(r) {
  switch (r) {
    case "common": return "#cfd7e6";
    case "uncommon": return "#6bd26b";
    case "rare": return "#4fa3ff";
    case "epic": return "#b36bff";
    case "legendary": return "#ffb84f";
    default: return "#ffffff";
  }
}

export class Hero {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 14;

    this.sailing = false;
    this.lastDir = { x: 1, y: 0 };

    this.base = { hp: 100, mana: 60, dmg: 10, armor: 0, move: 165 };
    this.maxHp = this.base.hp;
    this.maxMana = this.base.mana;
    this.hp = this.maxHp;
    this.mana = this.maxMana;

    this.gold = 0;
    this.xp = 0;
    this.level = 1;

    this.materials = { iron: 0, leather: 0, essence: 0 };

    this.inventory = []; // items
    this.equip = { weapon: null, helm: null, chest: null, boots: null, ring: null };

    this.skillXP = { fireball: 0 };
    this.skillLvl = { fireball: 1 };

    this.invuln = 0;
  }

  computeStats() {
    const s = { ...this.base };
    for (const k of Object.keys(this.equip)) {
      const it = this.equip[k];
      if (!it) continue;
      if (it.stats) {
        for (const [kk, vv] of Object.entries(it.stats)) s[kk] = (s[kk] || 0) + vv;
      }
    }
    s.hp = Math.max(1, s.hp|0);
    s.mana = Math.max(1, s.mana|0);
    s.dmg = Math.max(1, s.dmg|0);
    s.armor = Math.max(0, s.armor|0);
    s.move = Math.max(80, s.move|0);

    // keep bars within new maxima
    this.maxHp = s.hp;
    this.maxMana = s.mana;
    this.hp = clamp(this.hp, 0, this.maxHp);
    this.mana = clamp(this.mana, 0, this.maxMana);
    return s;
  }

  gainXP(n) {
    this.xp += n;
    const need = () => 55 + (this.level - 1) * 45;
    while (this.xp >= need()) {
      this.xp -= need();
      this.level++;
      this.base.hp += 12;
      this.base.mana += 6;
      this.base.dmg += 1;
      this.hp = this.maxHp = this.base.hp;
      this.mana = this.maxMana = this.base.mana;
    }
  }

  takeDamage(n) {
    if (this.invuln > 0) return 0;
    const dmg = Math.max(0, n|0);
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.35;
    return dmg;
  }

  spendMana(n) {
    if (this.mana < n) return false;
    this.mana -= n;
    return true;
  }

  update(dt, ax) {
    if (this.invuln > 0) this.invuln -= dt;

    const len = Math.hypot(ax.x, ax.y);
    let mx = ax.x, my = ax.y;
    if (len > 0) { mx /= len; my /= len; }

    if (len > 0.01) {
      this.lastDir.x = mx; this.lastDir.y = my;
    }

    const stats = this.computeStats();
    const targetVx = mx * stats.move;
    const targetVy = my * stats.move;

    // ease (feels weighty)
    this.vx = lerp(this.vx, targetVx, clamp(dt * 10, 0, 1));
    this.vy = lerp(this.vy, targetVy, clamp(dt * 10, 0, 1));

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, t) {
    const bob = Math.sin(t * 6) * 1.6;
    const glow = 1 + Math.sin(t * 3) * 0.04;

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 12, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // body base
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#cfd7e6";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r * glow, 0, Math.PI * 2);
    ctx.fill();

    // tunic
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#2b2f39";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + bob + 2, this.r * 0.75, this.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // helm highlight if equipped
    if (this.equip.helm) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#7d8796";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob - 10, this.r * 0.55, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // weapon hint
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#ffd28a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + bob);
    ctx.lineTo(this.x + this.lastDir.x * 18, this.y + bob + this.lastDir.y * 18);
    ctx.stroke();

    // invuln shimmer
    if (this.invuln > 0) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#38d9ff";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, this.r * 1.55, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}

export class Enemy {
  constructor(x, y, tier = 1, type = "grunt", rng = null) {
    this.x = x; this.y = y;
    this.tier = tier; this.type = type;
    this.r = 12 + tier * 2;
    this.maxHp = 30 + tier * 22;
    this.hp = this.maxHp;
    this.dmg = 7 + tier * 4;
    this.move = 88 + tier * 10;
    this.alive = true;
    this.atkT = 0;

    // spice
    this.hue = (rng ? rng.int(0, 360) : (Math.random() * 360)|0);
  }

  takeDamage(n) {
    this.hp -= Math.max(1, n|0);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  update(dt, hero) {
    if (!this.alive) return;
    this.atkT += dt;

    const dx = hero.x - this.x, dy = hero.y - this.y;
    const d = Math.hypot(dx, dy) || 1;

    // chase
    if (d > this.r + hero.r + 6) {
      this.x += (dx / d) * this.move * dt;
      this.y += (dy / d) * this.move * dt;
    }
  }

  canHit(hero) {
    const rr = this.r + hero.r + 3;
    return dist2(this.x, this.y, hero.x, hero.y) <= rr * rr;
  }

  draw(ctx, t) {
    if (!this.alive) return;
    const bob = Math.sin(t * 5 + this.x * 0.01) * 1.8;

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, this.r, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.globalAlpha = 1;
    ctx.fillStyle = `hsl(${this.hue} 45% 45%)`;
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#0b1330";
    ctx.beginPath();
    ctx.arc(this.x - 5, this.y + bob - 4, 2, 0, Math.PI * 2);
    ctx.arc(this.x + 5, this.y + bob - 4, 2, 0, Math.PI * 2);
    ctx.fill();

    // hp bar
    const w = this.r * 2.1;
    const p = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 12, w, 5);
    ctx.fillStyle = "#ff4f6a";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 12, w * p, 5);
    ctx.globalAlpha = 1;
  }
}

export class Boss {
  constructor(x, y, tier = 6) {
    this.x = x; this.y = y;
    this.tier = tier;
    this.r = 38 + tier * 2;
    this.maxHp = 600 + tier * 220;
    this.hp = this.maxHp;
    this.dmg = 22 + tier * 7;
    this.move = 78;
    this.alive = true;
    this.atkT = 0;
  }
  takeDamage(n) {
    this.hp -= Math.max(1, n|0);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }
  update(dt, hero) {
    if (!this.alive) return;
    this.atkT += dt;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > this.r + hero.r + 10) {
      this.x += (dx / d) * this.move * dt;
      this.y += (dy / d) * this.move * dt;
    }
  }
  canHit(hero) {
    const rr = this.r + hero.r + 8;
    return dist2(this.x, this.y, hero.x, hero.y) <= rr * rr;
  }
  draw(ctx, t) {
    if (!this.alive) return;
    const bob = Math.sin(t * 2.6) * 2;

    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + 22, this.r * 1.15, this.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2b2f39";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(this.x - 10, this.y + bob - 12, this.r * 0.55, this.r * 0.35, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // hp bar
    const w = this.r * 2.6;
    const p = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 20, w, 9);
    ctx.fillStyle = "#ff4f6a";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 20, w * p, 9);
    ctx.globalAlpha = 1;
  }
}

export class Projectile {
  constructor(x, y, vx, vy, dmg = 12, ttl = 1.6) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg;
    this.r = 6;
    this.ttl = ttl;
    this.dead = false;
  }
  update(dt) {
    if (this.dead) return;
    this.ttl -= dt;
    if (this.ttl <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx, t) {
    if (this.dead) return;
    const pulse = 1 + Math.sin(t * 12 + this.x * 0.02) * 0.12;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 6, this.r * 1.2, this.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ff7a2f";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, this.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  hitsCircle(cx, cy, cr) {
    const dx = this.x - cx, dy = this.y - cy;
    const rr = this.r + cr;
    return (dx * dx + dy * dy) <= rr * rr;
  }
}

export class EnemyProjectile {
  constructor(x, y, vx, vy, dmg = 8, ttl = 2.2) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = 6;
    this.ttl = ttl;
    this.dead = false;
  }
  update(dt) {
    if (this.dead) return;
    this.ttl -= dt;
    if (this.ttl <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx, t) {
    if (this.dead) return;
    const pulse = 1 + Math.sin(t * 10 + this.x * 0.02) * 0.12;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 6, this.r * 1.2, this.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ff4f6a";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(this.x - 1, this.y - 1, this.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  hitsCircle(cx, cy, cr) {
    const dx = this.x - cx, dy = this.y - cy;
    const rr = this.r + cr;
    return (dx * dx + dy * dy) <= rr * rr;
  }
}

export class Loot {
  constructor(x, y, item) {
    this.x = x; this.y = y;
    this.item = item;
    this.r = 10;
    this.vy = -40;
    this.ttl = 999;
    this.dead = false;
  }
  update(dt) {
    if (this.dead) return;
    this.vy += 140 * dt;
    this.y += this.vy * dt;
    if (this.vy > 0) this.vy *= 0.85;
    if (Math.abs(this.vy) < 6) this.vy = 0;
  }
  draw(ctx, t) {
    if (this.dead) return;
    const bob = Math.sin(t * 6 + this.x * 0.01) * 1.4;
    const name = this.item?.name || "Loot";
    const r = this.item?.rarity || "common";

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = rarityColor(r);
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "#0b1330";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#d7e0ff";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(name, this.x - ctx.measureText(name).width / 2, this.y - 18);
    ctx.globalAlpha = 1;
  }
  intersectsCircle(x, y, r) {
    const dx = x - this.x, dy = y - this.y;
    const rr = (r + this.r);
    return (dx * dx + dy * dy) <= rr * rr;
  }
}
