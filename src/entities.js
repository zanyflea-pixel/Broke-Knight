// src/entities.js
import { clamp, dist2 } from "./util.js";

export class Hero {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 16;

    this.vx = 0;
    this.vy = 0;

    this.sailing = false;

    this.level = 1;
    this.xp = 0;
    this.gold = 0;

    this.inventory = [];
    this.equip = { weapon: null, helm: null, chest: null, boots: null, ring: null };

    this.base = { hp: 100, mana: 60, dmg: 10, armor: 0, move: 160 };

    this.maxHp = this.base.hp;
    this.maxMana = this.base.mana;
    this.hp = this.maxHp;
    this.mana = this.maxMana;

    this.dmg = this.base.dmg;
    this.armor = this.base.armor;
    this.moveSpeed = this.base.move;

    this._t = 0;
  }

  recalcStats() {
    let hp = this.base.hp;
    let mana = this.base.mana;
    let dmg = this.base.dmg;
    let armor = this.base.armor;
    let move = this.base.move;

    const add = (it) => {
      if (!it || it.kind !== "gear") return;
      const s = it.stats || {};
      hp += s.hp || 0;
      mana += s.mana || 0;
      dmg += s.dmg || 0;
      armor += s.armor || 0;
      move += s.move || 0;
    };

    add(this.equip.weapon);
    add(this.equip.helm);
    add(this.equip.chest);
    add(this.equip.boots);
    add(this.equip.ring);

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    const manaRatio = this.maxMana > 0 ? this.mana / this.maxMana : 1;

    this.maxHp = Math.max(1, Math.round(hp));
    this.maxMana = Math.max(0, Math.round(mana));
    this.dmg = Math.max(1, Math.round(dmg));
    this.armor = Math.max(0, Math.round(armor));
    this.moveSpeed = clamp(move, 80, 340);

    this.hp = clamp(Math.round(this.maxHp * hpRatio), 0, this.maxHp);
    this.mana = clamp(Math.round(this.maxMana * manaRatio), 0, this.maxMana);
  }

  update(dt) {
    this._t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // mild mana regen
    this.mana = clamp(this.mana + dt * 3.5, 0, this.maxMana);
  }

  draw(ctx) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 8, this.r * 0.9, this.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const bob = Math.sin(this._t * 8) * 1.2;

    ctx.fillStyle = "#cfd7e6";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#0b1330";
    ctx.fillRect(this.x - 7, this.y - 4 + bob, 14, 7);
    ctx.globalAlpha = 1;

    if (this.equip.chest) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = rarityColor(this.equip.chest.rarity);
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob + 2, this.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.equip.helm) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = rarityColor(this.equip.helm.rarity);
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob - 10, this.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export class Enemy {
  constructor(x, y, tier = 1, type = "grunt") {
    this.x = x;
    this.y = y;

    this.tier = tier;
    this.type = type;

    // base scaling
    const baseHp = 26 + tier * 22;
    const baseDmg = 6 + tier * 4;
    const baseMove = 88 + tier * 10;

    if (type === "charger") {
      this.r = 16 + tier * 2;
      this.maxHp = Math.round(baseHp * 1.25);
      this.hp = this.maxHp;
      this.dmg = Math.round(baseDmg * 1.15);
      this.move = Math.round(baseMove * 1.15);
      this.chargeCD = 1.6;
      this.chargeT = 0;
    } else if (type === "shaman") {
      this.r = 14 + tier * 2;
      this.maxHp = Math.round(baseHp * 0.95);
      this.hp = this.maxHp;
      this.dmg = Math.round(baseDmg * 0.85);
      this.move = Math.round(baseMove * 0.9);
      this.castCD = 1.4;
    } else {
      this.r = 14 + tier * 2;
      this.maxHp = baseHp;
      this.hp = this.maxHp;
      this.dmg = baseDmg;
      this.move = baseMove;
    }

    this.alive = true;
    this.atkCD = 0;

    this._t = Math.random() * 10;
  }

  update(dt, hero, outProjectiles) {
    this._t += dt;
    if (this.atkCD > 0) this.atkCD -= dt;

    if (!this.alive) return;

    const d2 = dist2(this.x, this.y, hero.x, hero.y);
    const chase = d2 < 900 * 900;

    if (this.type === "shaman") {
      // keep distance + shoot
      if (this.castCD > 0) this.castCD -= dt;

      const dist = Math.sqrt(d2) || 1;
      const dx = hero.x - this.x;
      const dy = hero.y - this.y;
      const nx = dx / dist;
      const ny = dy / dist;

      // kite: if too close, back off; else mild circle
      const desired = dist < 240 ? -1 : dist > 520 ? 1 : 0.2;
      this.x += nx * this.move * dt * desired;
      this.y += ny * this.move * dt * desired;

      if (dist < 700 && this.castCD <= 0 && outProjectiles) {
        this.castCD = 1.2 - this.tier * 0.05;
        const spd = 260 + this.tier * 18;
        const dmg = Math.max(2, Math.round(this.dmg));
        outProjectiles.push(new EnemyProjectile(this.x, this.y, nx * spd, ny * spd, dmg));
      }
      return;
    }

    if (chase) {
      const dx = hero.x - this.x;
      const dy = hero.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / len;
      const ny = dy / len;

      if (this.type === "charger") {
        if (this.chargeCD > 0) this.chargeCD -= dt;

        // charge burst
        if (this.chargeCD <= 0) {
          this.chargeCD = 2.0 - this.tier * 0.08;
          this.chargeT = 0.28; // burst window
        }

        const mult = this.chargeT > 0 ? 2.8 : 1.0;
        if (this.chargeT > 0) this.chargeT -= dt;

        this.x += nx * this.move * dt * mult;
        this.y += ny * this.move * dt * mult;
      } else {
        // grunt
        this.x += nx * this.move * dt;
        this.y += ny * this.move * dt;
      }
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 8, this.r * 0.85, this.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const wob = Math.sin(this._t * 6) * 1.1;

    // body colors by type/tier
    let body = "#2b2f39";
    if (this.type === "charger") body = "#5a2b2b";
    if (this.type === "shaman") body = "#2b3b5a";
    if (this.tier >= 3) body = this.type === "shaman" ? "#3a2b5a" : "#7a2b2b";
    if (this.tier === 2 && this.type === "grunt") body = "#4a3a2b";

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(this.x, this.y + wob, this.r, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = this.type === "shaman" ? "#38d9ff" : "#ffd28a";
    ctx.fillRect(this.x - 7, this.y - 4 + wob, 4, 3);
    ctx.fillRect(this.x + 3, this.y - 4 + wob, 4, 3);
    ctx.globalAlpha = 1;

    // shaman staff nub
    if (this.type === "shaman") {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(this.x + this.r - 2, this.y + wob - 6, 3, 14);
      ctx.globalAlpha = 1;
    }

    // hp bar
    const w = 34 + this.tier * 6;
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 18, w, 5);
    ctx.fillStyle = this.type === "shaman" ? "#38d9ff" : "#ff7b2f";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 18, w * pct, 5);
    ctx.globalAlpha = 1;
  }
}

export class Boss {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 42;

    this.maxHp = 900;
    this.hp = this.maxHp;

    this.dmg = 22;
    this.move = 84;

    this.alive = true;
    this.atkCD = 0;

    this.phase = 1;
    this._t = 0;

    this.slamCD = 3.0;
  }

  update(dt, hero, outProjectiles) {
    this._t += dt;
    if (!this.alive) return;

    if (this.atkCD > 0) this.atkCD -= dt;
    if (this.slamCD > 0) this.slamCD -= dt;

    const d2 = dist2(this.x, this.y, hero.x, hero.y);
    const dist = Math.sqrt(d2) || 1;
    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const nx = dx / dist;
    const ny = dy / dist;

    // phases
    const hpPct = this.hp / this.maxHp;
    this.phase = hpPct < 0.35 ? 3 : hpPct < 0.7 ? 2 : 1;

    const speed = this.move * (this.phase === 3 ? 1.25 : this.phase === 2 ? 1.1 : 1.0);

    // chase
    this.x += nx * speed * dt;
    this.y += ny * speed * dt;

    // slam pulse (AoE feel)
    if (dist < 260 && this.slamCD <= 0 && outProjectiles) {
      this.slamCD = this.phase === 3 ? 2.2 : 3.0;
      const count = this.phase === 3 ? 10 : 7;
      const spd = 220 + this.phase * 30;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.sin(this._t) * 0.2;
        outProjectiles.push(
          new EnemyProjectile(this.x, this.y, Math.cos(a) * spd, Math.sin(a) * spd, 8 + this.phase * 3)
        );
      }
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 4, this.y + 14, this.r * 0.95, this.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const wob = Math.sin(this._t * 3) * 1.3;

    // body
    ctx.fillStyle = "#2b2f39";
    ctx.beginPath();
    ctx.arc(this.x, this.y + wob, this.r, 0, Math.PI * 2);
    ctx.fill();

    // armor plates
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#0b1330";
    ctx.beginPath();
    ctx.arc(this.x - 12, this.y - 8 + wob, this.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + 12, this.y - 8 + wob, this.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // eyes
    ctx.fillStyle = "#ff5d5d";
    ctx.fillRect(this.x - 16, this.y - 8 + wob, 10, 6);
    ctx.fillRect(this.x + 6, this.y - 8 + wob, 10, 6);

    // boss hp bar
    const w = 240;
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 34, w, 10);
    ctx.fillStyle = "#ff5d5d";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 34, w * pct, 10);
    ctx.globalAlpha = 1;
  }
}

export class Projectile {
  constructor(x, y, vx, vy, dmg) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.r = 6;
    this.life = 1.25;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, t) {
    const pulse = 1 + Math.sin(t * 18) * 0.12;

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 6, this.r * 1.2, this.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ff7b2f";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath();
    ctx.arc(this.x - 2, this.y - 2, this.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export class EnemyProjectile {
  constructor(x, y, vx, vy, dmg) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.r = 5;
    this.life = 2.2;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, t) {
    const wob = 1 + Math.sin(t * 14 + this.x * 0.01) * 0.12;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 5, this.r * 1.2, this.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#38d9ff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * wob, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class Loot {
  constructor(item, x, y) {
    this.item = item;
    this.x = x;
    this.y = y;
    this.r = 9;
    this._t = Math.random() * 10;
  }

  draw(ctx) {
    this._t += 0.016;

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 1, this.y + 6, this.r * 0.9, this.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (this.item.kind === "gold") {
      const bob = Math.sin(this._t * 6) * 1.2;
      ctx.fillStyle = "#ffd28a";
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(this.x - 2, this.y - 2 + bob, this.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    const c = rarityColor(this.item.rarity);
    const bob = Math.sin(this._t * 5) * 1.2;

    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 10 + bob);
    ctx.lineTo(this.x - 10, this.y + 8 + bob);
    ctx.lineTo(this.x + 10, this.y + 8 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 6 + bob);
    ctx.lineTo(this.x - 6, this.y + 6 + bob);
    ctx.lineTo(this.x + 6, this.y + 6 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function rarityColor(r) {
  if (r === "epic") return "#c77dff";
  if (r === "rare") return "#38d9ff";
  return "#cfd7e6";
}
