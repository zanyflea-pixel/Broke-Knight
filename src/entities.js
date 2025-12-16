// src/entities.js
import { clamp, dist2, lerp } from "./util.js";

export class Hero {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = 14;
    this.hpMax = 100; this.hp = 100;
    this.mpMax = 60;  this.mp = 60;
    this.level = 1;
    this.xp = 0; this.xpToNext = 35;

    this.gold = 0;
    this.sailing = false;

    this.lastDir = { x: 1, y: 0 }; // last move direction
    this.moveSpeed = 220; // px/s
  }

  addXP(amount) {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(this.xpToNext * 1.28 + 10);
      this.hpMax += 10; this.hp = this.hpMax;
      this.mpMax += 6;  this.mp = this.mpMax;
    }
  }

  draw(ctx) {
    // soft shadow to make 2D look a bit 3D
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x+2, this.y+10, 14, 6, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = "#d0d7ff";
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();

    // visor
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#0b1330";
    ctx.beginPath(); ctx.arc(this.x + 3, this.y - 2, 6, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // little cape hint
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#9a2034";
    ctx.beginPath();
    ctx.ellipse(this.x-7, this.y+2, 7, 10, 0.3, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // sail tint
    if (this.sailing) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#38d9ff";
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r+10, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export class Enemy {
  constructor(x, y, tier=1) {
    this.x = x; this.y = y;
    this.r = 12 + tier * 2;
    this.tier = tier;
    this.hpMax = 25 + tier * 18;
    this.hp = this.hpMax;
    this.alive = true;

    this.speed = 120 + tier * 20;
    this.attackCD = 0;
  }

  update(dt, hero, world) {
    if (!this.alive) return;
    const d2 = dist2(this.x, this.y, hero.x, hero.y);

    // simple chase if close
    if (d2 < 620*620) {
      const d = Math.sqrt(d2) || 1;
      const vx = (hero.x - this.x) / d;
      const vy = (hero.y - this.y) / d;
      const nx = this.x + vx * this.speed * dt;
      const ny = this.y + vy * this.speed * dt;

      const body = { x: nx, y: ny, r: this.r };
      world.resolveCircleVsWorld(body, { sailing:false });
      this.x = body.x; this.y = body.y;

      // attack
      this.attackCD -= dt;
      if (d2 < (this.r + hero.r + 6) ** 2 && this.attackCD <= 0) {
        this.attackCD = 0.75 + 0.2 * this.tier;
        hero.hp = Math.max(0, hero.hp - (5 + this.tier * 4));
      }
    } else {
      // idle wobble
      this.x += Math.sin((this.x + this.y) * 0.01) * dt * 20;
      this.y += Math.cos((this.x - this.y) * 0.01) * dt * 20;
    }
  }

  hit(dmg) {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) { this.alive = false; return true; }
    return false;
  }

  draw(ctx) {
    if (!this.alive) return;

    // shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x+2, this.y+9, this.r, this.r*0.45, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    ctx.fillStyle = this.tier >= 3 ? "#ff7b7b" : (this.tier === 2 ? "#ffb36a" : "#9ad1ff");
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();

    // eyes
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#0b1330";
    ctx.beginPath(); ctx.arc(this.x-4, this.y-2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x+4, this.y-2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // hp bar
    const w = 30, h = 4;
    const t = clamp(this.hp / this.hpMax, 0, 1);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#000";
    ctx.fillRect(this.x - w/2, this.y - this.r - 12, w, h);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#7CFC98";
    ctx.fillRect(this.x - w/2, this.y - this.r - 12, w * t, h);
    ctx.globalAlpha = 1;
  }
}

export class Projectile {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = 6;
    this.life = 1.8;
    this.dmg = 12;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw(ctx, t) {
    // glow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ffb347";
    ctx.beginPath(); ctx.arc(this.x, this.y, 14, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ff6a2b";
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // trail streak
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#ffd28a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.04, this.y - this.vy * 0.04);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export class Loot {
  constructor(x, y, kind="gold", amount=1) {
    this.x=x; this.y=y;
    this.kind=kind;
    this.amount=amount;
    this.r = 10;
    this.life = 18;
  }
  update(dt) { this.life -= dt; }
  draw(ctx, t) {
    const bob = Math.sin(t * 4 + (this.x+this.y)*0.01) * 2;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(this.x+1, this.y+9, 10, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    if (this.kind === "gold") {
      ctx.fillStyle = "#ffda5a";
      ctx.beginPath(); ctx.arc(this.x, this.y + bob, 6, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(this.x-2, this.y-2 + bob, 2, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (this.kind === "mp") {
      ctx.fillStyle = "#38d9ff";
      ctx.beginPath(); ctx.arc(this.x, this.y + bob, 6, 0, Math.PI*2); ctx.fill();
    } else if (this.kind === "hp") {
      ctx.fillStyle = "#ff5a7a";
      ctx.beginPath(); ctx.arc(this.x, this.y + bob, 6, 0, Math.PI*2); ctx.fill();
    }
  }
}
