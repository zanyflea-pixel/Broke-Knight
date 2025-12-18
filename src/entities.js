// src/entities.js
import { clamp, dist2 } from "./util.js";

/* ============================
   HERO (silhouette + gear tint)
   ============================ */
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

    // facing / animation
    this.faceX = 1; // last move direction
    this.faceY = 0;
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

    // update facing based on movement
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) {
      const len = Math.hypot(this.vx, this.vy) || 1;
      this.faceX = this.vx / len;
      this.faceY = this.vy / len;
    }

    this.mana = clamp(this.mana + dt * 3.5, 0, this.maxMana);
  }


  draw(ctx) {
    const moving = (Math.abs(this.vx) + Math.abs(this.vy)) > 3;
    const bob = Math.sin(this._t * (moving ? 10 : 4)) * (moving ? 1.8 : 0.9);
    const fx = this.faceX || 1;
    const fy = this.faceY || 0;

    // gear tints
    const helm = this.equip.helm;
    const chest = this.equip.chest;
    const boots = this.equip.boots;
    const weapon = this.equip.weapon;

    const helmTint = helm ? rarityColor(helm.rarity) : null;
    const chestTint = chest ? rarityColor(chest.rarity) : null;
    const bootTint = boots ? rarityColor(boots.rarity) : null;

    // shadow (gives "grounded" 3D feel)
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 16, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // small helper for outlines
    const outline = "#0b1330";
    const skin = "#ffd9b0";

    // --- feet/boots (front layer) ---
    const step = moving ? Math.sin(this._t * 10) * 1.6 : 0;
    const footY = this.y + 10 + bob;
    ctx.lineWidth = 3;
    ctx.strokeStyle = outline;
    ctx.fillStyle = bootTint ? shadeColor(bootTint, 0.9) : "#3b3f4a";

    // left boot
    roundRect(ctx, this.x - 10 + fx * 1, footY + step, 9, 6, 3);
    ctx.fill(); ctx.stroke();
    // right boot
    roundRect(ctx, this.x + 1 + fx * 1, footY - step, 9, 6, 3);
    ctx.fill(); ctx.stroke();

    // boot highlights
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#fff";
    roundRect(ctx, this.x - 9 + fx * 1, footY + step + 1, 6, 2, 2);
    ctx.fill();
    roundRect(ctx, this.x + 2 + fx * 1, footY - step + 1, 6, 2, 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- legs ---
    ctx.lineWidth = 3;
    ctx.strokeStyle = outline;
    ctx.fillStyle = "#2b2f39";
    roundRect(ctx, this.x - 8, this.y + 2 + bob + step * 0.35, 7, 12, 3);
    ctx.fill(); ctx.stroke();
    roundRect(ctx, this.x + 1, this.y + 2 + bob - step * 0.35, 7, 12, 3);
    ctx.fill(); ctx.stroke();

    // --- torso (slight trapezoid look via two rects) ---
    const torsoY = this.y - 7 + bob;
    ctx.fillStyle = "#384154";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;

    // base torso
    roundRect(ctx, this.x - 11, torsoY, 22, 20, 8);
    ctx.fill(); ctx.stroke();

    // chest overlay
    if (chestTint) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = chestTint;
      roundRect(ctx, this.x - 11, torsoY, 22, 20, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // torso light/shade (fake volume)
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#fff";
    roundRect(ctx, this.x - 9, torsoY + 2, 8, 14, 6);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    roundRect(ctx, this.x + 2, torsoY + 2, 7, 14, 6);
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- arms (simple capsules, swinging with movement) ---
    const armSwing = moving ? Math.sin(this._t * 10) * 2.2 : 0;
    // back arm (behind torso)
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#2f3646";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    roundRect(ctx, this.x - 16, this.y - 4 + bob - armSwing * 0.4, 7, 16, 4);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;

    // front arm (weapon arm)
    ctx.fillStyle = "#364055";
    roundRect(ctx, this.x + 9, this.y - 4 + bob + armSwing * 0.4, 7, 16, 4);
    ctx.fill(); ctx.stroke();

    // --- head ---
    const headY = this.y - 21 + bob * 0.35;
    ctx.fillStyle = skin;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(this.x, headY, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // face shadow / nose direction
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + fx * 2, headY + 1, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // helmet overlay (if equipped)
    if (helmTint) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = helmTint;
      ctx.beginPath();
      ctx.ellipse(this.x, headY - 1, 10, 9, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(this.x - 3, headY - 5, 3, 2, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- cape / back cloth (subtle, makes silhouette "real") ---
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#203045";
    ctx.beginPath();
    ctx.moveTo(this.x - 10, this.y - 4 + bob);
    ctx.quadraticCurveTo(this.x - 18, this.y + 12 + bob, this.x - 6, this.y + 14 + bob);
    ctx.quadraticCurveTo(this.x - 2, this.y + 6 + bob, this.x + 1, this.y + 2 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- weapon (readable direction + rarity tint) ---
    if (weapon) {
      const wcol = rarityColor(weapon.rarity);
      ctx.lineCap = "round";

      // shadow stroke
      ctx.lineWidth = 4;
      ctx.strokeStyle = outline;
      ctx.beginPath();
      ctx.moveTo(this.x + fx * 6, this.y - 2 + bob);
      ctx.lineTo(this.x + fx * 30, this.y - 2 + bob + fy * 16);
      ctx.stroke();

      // colored blade
      ctx.lineWidth = 2;
      ctx.strokeStyle = wcol;
      ctx.beginPath();
      ctx.moveTo(this.x + fx * 6, this.y - 2 + bob);
      ctx.lineTo(this.x + fx * 30, this.y - 2 + bob + fy * 16);
      ctx.stroke();

      // sparkle
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(this.x + fx * 26, this.y - 6 + bob + fy * 10, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // nameplate
    if (this.showName) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "12px system-ui, sans-serif";
      const txt = this.name || "Broke Knight";
      ctx.fillText(txt, this.x - ctx.measureText(txt).width / 2, this.y - 34);
      ctx.globalAlpha = 1;
    }
  }


/* ============================
   ENEMY (silhouette per type)
   ============================ */
export class Enemy {
  constructor(x, y, tier = 1, type = "grunt") {
    this.x = x;
    this.y = y;
    this.tier = tier;
    this.type = type;

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

    // facing for sprite-ish drawing
    this.faceX = 1;
    this.faceY = 0;
  }

  update(dt, hero, outProjectiles) {
    this._t += dt;
    if (this.atkCD > 0) this.atkCD -= dt;
    if (!this.alive) return;

    const d2 = dist2(this.x, this.y, hero.x, hero.y);
    const dist = Math.sqrt(d2) || 1;
    const dx = hero.x - this.x;
    const dy = hero.y - this.y;
    const nx = dx / dist;
    const ny = dy / dist;

    // update facing
    if (dist > 1) { this.faceX = nx; this.faceY = ny; }

    if (this.type === "shaman") {
      if (this.castCD > 0) this.castCD -= dt;

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

    const chase = d2 < 900 * 900;
    if (chase) {
      if (this.type === "charger") {
        if (this.chargeCD > 0) this.chargeCD -= dt;
        if (this.chargeCD <= 0) {
          this.chargeCD = 2.0 - this.tier * 0.08;
          this.chargeT = 0.28;
        }
        const mult = this.chargeT > 0 ? 2.8 : 1.0;
        if (this.chargeT > 0) this.chargeT -= dt;

        this.x += nx * this.move * dt * mult;
        this.y += ny * this.move * dt * mult;
      } else {
        this.x += nx * this.move * dt;
        this.y += ny * this.move * dt;
      }
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    const walk = true;
    const bob = Math.sin(this._t * 8) * 1.2;
    const fx = this.faceX;
    const fy = this.faceY;

    const outline = "#0b1330";

    // shadow
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 14, 14 + this.tier * 2, 6 + this.tier, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // colors by type
    let body = "#2b2f39";
    let accent = "#ffd28a";
    if (this.type === "charger") { body = "#6a2b2b"; accent = "#ff5d5d"; }
    if (this.type === "shaman") { body = "#2b3b5a"; accent = "#38d9ff"; }
    if (this.tier >= 3) body = this.type === "shaman" ? "#3a2b5a" : "#7a2b2b";

    // torso
    drawOutlinedRoundRect(ctx, this.x - 10, this.y - 4 + bob, 20, 22, 7, outline, body);

    // head
    const headY = this.y - 16 + bob;
    drawOutlinedCircle(ctx, this.x, headY, 8.0 + this.tier * 0.4, outline, shade(body, 1.12));

    // horns/hood per type
    if (this.type === "charger") {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(this.x - 10, headY - 2);
      ctx.lineTo(this.x - 18, headY - 12);
      ctx.lineTo(this.x - 6, headY - 8);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(this.x + 10, headY - 2);
      ctx.lineTo(this.x + 18, headY - 12);
      ctx.lineTo(this.x + 6, headY - 8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (this.type === "shaman") {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(this.x, headY + 2, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // arms
    const sway = walk ? Math.sin(this._t * 8) * 2 : 0;
    drawOutlinedRoundRect(ctx, this.x - 14 + fx * 2, this.y - 2 + bob + fy * 2, 6, 14, 3, outline, shade(body, 0.92));
    drawOutlinedRoundRect(ctx, this.x + 8 + fx * 2, this.y - 2 + bob + fy * 2, 6, 14, 3, outline, shade(body, 0.92));

    // legs
    drawOutlinedRoundRect(ctx, this.x - 7, this.y + 12 + bob + sway * 0.2, 6, 10, 3, outline, shade(body, 0.85));
    drawOutlinedRoundRect(ctx, this.x + 1, this.y + 12 + bob - sway * 0.2, 6, 10, 3, outline, shade(body, 0.85));

    // eyes
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = accent;
    ctx.fillRect(this.x - 7, headY - 2, 4, 3);
    ctx.fillRect(this.x + 3, headY - 2, 4, 3);
    ctx.globalAlpha = 1;

    // weapon hint
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x + fx * 6, this.y - 2 + bob);
    ctx.lineTo(this.x + fx * 18, this.y - 2 + bob + fy * 10);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(this.x + fx * 6, this.y - 2 + bob);
    ctx.lineTo(this.x + fx * 18, this.y - 2 + bob + fy * 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* ============================
   BOSS (keep as-is if you had it)
   ============================ */
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

    const hpPct = this.hp / this.maxHp;
    this.phase = hpPct < 0.35 ? 3 : hpPct < 0.7 ? 2 : 1;

    const speed = this.move * (this.phase === 3 ? 1.25 : this.phase === 2 ? 1.1 : 1.0);
    this.x += nx * speed * dt;
    this.y += ny * speed * dt;

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

    const wob = Math.sin(this._t * 3) * 1.3;
    const outline = "#0b1330";

    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 4, this.y + 16, this.r * 0.98, this.r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    drawOutlinedCircle(ctx, this.x, this.y + wob, this.r + 2, outline, "#2b2f39");
    drawOutlinedCircle(ctx, this.x, this.y + wob, this.r, outline, "#2b2f39");

    // eyes
    ctx.fillStyle = "#ff5d5d";
    ctx.fillRect(this.x - 16, this.y - 8 + wob, 10, 6);
    ctx.fillRect(this.x + 6, this.y - 8 + wob, 10, 6);

    // hp bar
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

/* ============================
   PROJECTILES / LOOT
   ============================ */
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
    ctx.ellipse(this.x + 2, this.y + 7, this.r * 1.2, this.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const g = ctx.createRadialGradient(this.x - 2, this.y - 2, 2, this.x, this.y, this.r * 2.2);
    g.addColorStop(0, "#fff3c4");
    g.addColorStop(0.55, "#ff7b2f");
    g.addColorStop(1, "#0b1330");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * pulse, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.ellipse(this.x + 2, this.y + 6, this.r * 1.2, this.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const g = ctx.createRadialGradient(this.x - 2, this.y - 2, 2, this.x, this.y, this.r * 2.2);
    g.addColorStop(0, "#eaf6ff");
    g.addColorStop(0.55, "#38d9ff");
    g.addColorStop(1, "#0b1330");

    ctx.fillStyle = g;
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
      const g = ctx.createRadialGradient(this.x - 2, this.y - 3 + bob, 2, this.x, this.y + bob, this.r * 1.8);
      g.addColorStop(0, "#fff3c4");
      g.addColorStop(0.6, "#ffd28a");
      g.addColorStop(1, "#8a5a1f");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob, this.r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const c = rarityColor(this.item.rarity);
    const bob = Math.sin(this._t * 5) * 1.2;

    ctx.fillStyle = "#0b1330";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 12 + bob);
    ctx.lineTo(this.x - 12, this.y + 10 + bob);
    ctx.lineTo(this.x + 12, this.y + 10 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - 10 + bob);
    ctx.lineTo(this.x - 10, this.y + 8 + bob);
    ctx.lineTo(this.x + 10, this.y + 8 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#eaf6ff";
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

/* ============================
   SMALL DRAW HELPERS
   ============================ */
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

function drawOutlinedRoundRect(ctx, x, y, w, h, r, outline, fill) {
  ctx.fillStyle = outline;
  roundRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 2);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function drawOutlinedCircle(ctx, x, y, r, outline, fill) {
  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// quick “shade” helper: factor >1 brightens, <1 darkens
function shade(rgbHex, factor) {
  // only handles #rrggbb
  const r = parseInt(rgbHex.slice(1, 3), 16);
  const g = parseInt(rgbHex.slice(3, 5), 16);
  const b = parseInt(rgbHex.slice(5, 7), 16);
  const rr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const gg = Math.max(0, Math.min(255, Math.round(g * factor)));
  const bb = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `rgb(${rr},${gg},${bb})`;
}
