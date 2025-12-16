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

    // progression containers filled by game.js
    this.level = 1;
    this.xp = 0;
    this.gold = 0;

    this.inventory = [];
    this.equip = { weapon: null, helm: null, chest: null, boots: null, ring: null };

    this.base = { hp: 100, mana: 60, dmg: 10, armor: 0, move: 160 };

    // derived (recalcStats)
    this.maxHp = this.base.hp;
    this.maxMana = this.base.mana;
    this.hp = this.maxHp;
    this.mana = this.maxMana;

    this.dmg = this.base.dmg;
    this.armor = this.base.armor;
    this.moveSpeed = this.base.move;

    // visuals
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
    this.moveSpeed = clamp(move, 80, 320);

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
    // shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 8, this.r * 0.9, this.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body (simple knight orb)
    const bob = Math.sin(this._t * 8) * 1.2;
    ctx.fillStyle = "#cfd7e6";
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
    ctx.fill();

    // face visor
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#0b1330";
    ctx.fillRect(this.x - 7, this.y - 4 + bob, 14, 7);
    ctx.globalAlpha = 1;

    // equipped hints (tiny overlays)
    if (this.equip.chest) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = rarityColor(this.equip.chest.rarity);
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob + 2, this.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.equip.helm) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rarityColor(this.equip.helm.rarity);
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob - 10, this.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export class Enemy {
  constructor(x, y, tier = 1) {
    this.x = x;
    this.y = y;
    this.r = 14 + tier * 2;

    this.tier = tier;
    this.maxHp = 28 + tier * 22;
    this.hp = this.maxHp;

    this.dmg = 6 + tier * 4;
    this.move = 90 + tier * 8;

    this.alive = true;
    this.atkCD = 0;

    this._t = Math.random() * 10;
  }

  update(dt, hero) {
    this._t += dt;
    if (this.atkCD > 0) this.atkCD -= dt;

    if (!this.alive) return;

    const d2 = dist2(this.x, this.y, hero.x, hero.y);
    const chase = d2 < 900 * 900;

    if (chase) {
      const dx = hero.x - this.x;
      const dy = hero.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / len;
      const ny = dy / len;

      this.x += nx * this.move * dt;
      this.y += ny * this.move * dt;
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    // shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 8, this.r * 0.85, this.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    const wob = Math.sin(this._t * 6) * 1.1;
    ctx.fillStyle = this.tier >= 3 ? "#b33b3b" : this.tier === 2 ? "#a06b2b" : "#2b2f39";
    ctx.beginPath();
    ctx.arc(this.x, this.y + wob, this.r, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(this.x - 7, this.y - 4 + wob, 4, 3);
    ctx.fillRect(this.x + 3, this.y - 4 + wob, 4, 3);
    ctx.globalAlpha = 1;

    // hp bar
    const w = 34 + this.tier * 6;
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 18, w, 5);
    ctx.fillStyle = "#38d9ff";
    ctx.fillRect(this.x - w / 2, this.y - this.r - 18, w * pct, 5);
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

    ctx.globalAlpha = 0.25;
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

    // shadow
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

    // gear shard
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

function rarityColor(r) {
  if (r === "epic") return "#c77dff";
  if (r === "rare") return "#38d9ff";
  return "#cfd7e6";
}
