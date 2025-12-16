// src/game.js
import World from "./world.js";
import Input from "./input.js";
import UI from "./ui.js";
import { RNG, clamp, dist2 } from "./util.js";
import { Hero, Enemy, Projectile, Loot } from "./entities.js";

export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.input = new Input(canvas);
    this.ui = new UI();

    this._resize();
    window.addEventListener("resize", () => this._resize());

    this.world = new World(this.canvas.width, this.canvas.height);
    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    this.cam = { x: this.hero.x - this.canvas.width/2, y: this.hero.y - this.canvas.height/2 };

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this.rng = new RNG(12345);

    this.fireCD = 0;
    this.fireSkillXP = 0;
    this.fireSkillLv = 1;

    this.t = 0;
    this.last = 0;

    this._spawnTimer = 0;
  }

  start() {
    this.last = performance.now();
    requestAnimationFrame((ts) => this._loop(ts));
  }

  _resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(1,0,0,1,0,0);
    this.ctx.scale(dpr, dpr);
    // NOTE: Input uses canvas width/height via rect scaling (works with dpr)
  }

  _loop(ts) {
    const dt = Math.min(0.033, (ts - this.last) / 1000);
    this.last = ts;
    this.t += dt;

    this.update(dt);
    this.draw(this.t);

    this.input.endFrame();
    requestAnimationFrame((t) => this._loop(t));
  }

  update(dt) {
    this.ui.update(dt);
    this.world.update(dt);

    // toggles
    if (this.input.pressed("m")) this.ui.showMap = !this.ui.showMap;

    // movement (arrow keys only)
    let mx = 0, my = 0;
    if (!this.ui.showMap) {
      if (this.input.down("arrowleft")) mx -= 1;
      if (this.input.down("arrowright")) mx += 1;
      if (this.input.down("arrowup")) my -= 1;
      if (this.input.down("arrowdown")) my += 1;
    }

    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;

    if (mx || my) this.hero.lastDir = { x: mx, y: my };

    const speed = this.hero.moveSpeed * (this.hero.sailing ? 1.25 : 1.0);
    const nx = this.hero.x + mx * speed * dt;
    const ny = this.hero.y + my * speed * dt;

    const body = { x: nx, y: ny, r: this.hero.r };
    this.world.resolveCircleVsWorld(body, { sailing: this.hero.sailing });
    this.hero.x = body.x; this.hero.y = body.y;

    // regen mana slowly
    this.hero.mp = Math.min(this.hero.mpMax, this.hero.mp + dt * 4.5);

    // nearby hints
    const nearDock = this.world.canHeroSail(this.hero.x, this.hero.y);
    const nearWS = this._nearestWaystone(52);

    const hints = {
      dock: nearDock ? "Dock: press B to toggle sailing" : "",
      way: nearWS ? `Waystone: press E to teleport (${nearWS.name})` : ""
    };

    // sailing toggle
    if (this.input.pressed("b")) {
      if (!this.hero.sailing) {
        if (nearDock) {
          this.hero.sailing = true;
          this.ui.setMsg("Sailing enabled");
        } else {
          this.ui.setMsg("You can only sail at a dock");
        }
      } else {
        // to stop sailing, must also be at a dock on land edge
        if (nearDock) {
          this.hero.sailing = false;
          this.ui.setMsg("Sailing disabled");
        } else {
          this.ui.setMsg("Return to a dock to stop sailing");
        }
      }
    }

    // teleport (only near activated waystone)
    if (this.input.pressed("e") && nearWS && nearWS.activated) {
      const list = this.world.waystones.filter(w => w.activated);
      const idx = list.indexOf(nearWS);
      const next = list[(idx + 1) % list.length];
      this.hero.x = next.x + 26;
      this.hero.y = next.y + 10;
      this.hero.sailing = false;
      this.ui.setMsg(`Teleported to ${next.name}`);
    }

    // activate waystones when close
    for (const ws of this.world.waystones) {
      if (!ws.activated && dist2(this.hero.x, this.hero.y, ws.x, ws.y) < 54*54) {
        ws.activated = true;
        this.ui.setMsg(`Activated: ${ws.name}`);
      }
    }

    // fireball (A)
    this.fireCD = Math.max(0, this.fireCD - dt);
    if (!this.ui.showMap && (this.input.pressed("a"))) {
      this.castFireball();
    }

    // update projectiles
    for (const p of this.projectiles) p.update(dt);
    // collisions + cull
    this.projectiles = this.projectiles.filter(p => {
      if (p.life <= 0) return false;
      if (this.world.projectileHitsSolid(p)) return false;

      // hit enemies
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) ** 2) {
          const killed = e.hit(p.dmg + (this.fireSkillLv - 1) * 3);
          p.life = 0;
          if (killed) this._onKill(e);
          return false;
        }
      }
      return true;
    });

    // update enemies
    for (const e of this.enemies) e.update(dt, this.hero, this.world);
    // remove dead after a bit (just remove immediately for now)
    this.enemies = this.enemies.filter(e => e.alive);

    // loot pick up
    for (const L of this.loot) L.update(dt);
    this.loot = this.loot.filter(L => {
      if (L.life <= 0) return false;
      if (dist2(this.hero.x, this.hero.y, L.x, L.y) < (this.hero.r + L.r) ** 2) {
        if (L.kind === "gold") this.hero.gold += L.amount;
        if (L.kind === "hp") this.hero.hp = Math.min(this.hero.hpMax, this.hero.hp + L.amount);
        if (L.kind === "mp") this.hero.mp = Math.min(this.hero.mpMax, this.hero.mp + L.amount);
        return false;
      }
      return true;
    });

    // spawn enemies on land (simple)
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0 && this.enemies.length < 18) {
      this._spawnTimer = 0.55;
      this.spawnEnemyNearHero();
    }

    // camera
    this.cam.x = clamp(this.hero.x - (window.innerWidth/2), 0, this.world.width - window.innerWidth);
    this.cam.y = clamp(this.hero.y - (window.innerHeight/2), 0, this.world.height - window.innerHeight);

    this._hints = hints;
  }

  castFireball() {
    if (this.fireCD > 0) return;
    const cost = 8;
    if (this.hero.mp < cost) { this.ui.setMsg("Not enough mana"); return; }

    this.hero.mp -= cost;
    this.fireCD = Math.max(0.22, 0.42 - this.fireSkillLv * 0.03);

    const d = this.hero.lastDir;
    const spd = 520 + this.fireSkillLv * 25;
    const p = new Projectile(this.hero.x + d.x*20, this.hero.y + d.y*10, d.x*spd, d.y*spd);
    p.dmg = 12 + this.fireSkillLv * 2;
    this.projectiles.push(p);

    // skill xp
    this.fireSkillXP += 1;
    const need = 10 + this.fireSkillLv * 6;
    if (this.fireSkillXP >= need) {
      this.fireSkillXP = 0;
      this.fireSkillLv++;
      this.ui.setMsg(`Fireball leveled up! (Lv ${this.fireSkillLv})`);
    }
  }

  spawnEnemyNearHero() {
    // pick a random point around hero
    for (let tries = 0; tries < 12; tries++) {
      const ang = this.rng.float() * Math.PI * 2;
      const rr = 260 + this.rng.float() * 520;
      const x = this.hero.x + Math.cos(ang) * rr;
      const y = this.hero.y + Math.sin(ang) * rr;

      if (x < 40 || y < 40 || x > this.world.width-40 || y > this.world.height-40) continue;
      const T = this.world.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.world.isInRiver(x, y) && !this.world.isOnAnyBridge(x, y)) continue;

      const tier = (this.rng.float() < 0.15) ? 3 : (this.rng.float() < 0.35 ? 2 : 1);
      const e = new Enemy(x, y, tier);
      this.enemies.push(e);
      return;
    }
  }

  _onKill(e) {
    const xp = 10 + e.tier * 12;
    this.hero.addXP(xp);
    this.ui.setMsg(`+${xp} XP`);

    // loot
    if (this.rng.float() < 0.85) this.loot.push(new Loot(e.x, e.y, "gold", 1 + e.tier));
    if (this.rng.float() < 0.18) this.loot.push(new Loot(e.x+12, e.y+6, "hp", 8 + e.tier*4));
    if (this.rng.float() < 0.25) this.loot.push(new Loot(e.x-10, e.y-4, "mp", 10 + e.tier*3));
  }

  _nearestWaystone(r=60) {
    let best = null;
    let bestD = r*r;
    for (const w of this.world.waystones) {
      const d = dist2(this.hero.x, this.hero.y, w.x, w.y);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  draw(t) {
    const ctx = this.ctx;

    // world draw in world coordinates
    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);

    this.world.draw(ctx, t, { x:this.cam.x, y:this.cam.y, w:window.innerWidth, h:window.innerHeight });

    // entities
    for (const L of this.loot) L.draw(ctx, t);
    for (const e of this.enemies) e.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx, t);

    this.hero.draw(ctx);

    ctx.restore();

    // UI
    this.ui.drawHUD(ctx, this.hero, t, this._hints);

    // map overlay
    if (this.ui.showMap) this.ui.drawMap(ctx, this.world, this.hero);
  }
}
