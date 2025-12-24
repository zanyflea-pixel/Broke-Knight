// src/game.js
import Input from "./input.js";
import UI from "./ui.js";
import { RNG, clamp, dist2, norm } from "./util.js";
import { World } from "./world.js";
import { Hero, Enemy, Projectile, Loot, makeGear, GearSlots } from "./entities.js";
import { saveGame, loadGame } from "./save.js";

export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    this.input = new Input(canvas);
    this.ui = new UI();

    this.rng = new RNG(444777);

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this.cam = { x: 0, y: 0 };
    this.hint = "";

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.world = new World(this.canvas.width, this.canvas.height);
    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    this._mouseWorld = { x: this.hero.x, y: this.hero.y };
    this._mouseMoved = false;

    this.spawnTimer = 0.0;

    // Load save
    const s = loadGame();
    if (s && s.hero) {
      this.hero.x = s.hero.x ?? this.hero.x;
      this.hero.y = s.hero.y ?? this.hero.y;
      this.hero.level = s.hero.level ?? this.hero.level;
      this.hero.xp = s.hero.xp ?? this.hero.xp;
      this.hero.nextXp = s.hero.nextXp ?? this.hero.nextXp;
      this.hero.gold = s.hero.gold ?? this.hero.gold;
      this.hero.hp = s.hero.hp ?? this.hero.hp;
      this.hero.mana = s.hero.mana ?? this.hero.mana;
      // keep sailing off on load
      this.hero.state.sailing = false;
    }

    // Safety: never start in ocean
    if (this.world.terrainAt(this.hero.x, this.hero.y).ocean) {
      this.hero.x = this.world.spawn.x;
      this.hero.y = this.world.spawn.y;
    }
  }

  resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.imageSmoothingEnabled = true;

    if (this.world?.setViewSize) {
      this.world.setViewSize(this.canvas.width, this.canvas.height);
    }
  }

  update(dt) {
    // --- INPUT / MENUS ---
    if (this.input.pressed("escape")) this.ui.closeAll();
    if (this.input.pressed("m")) this.ui.toggle("map");
    if (this.input.pressed("k")) this.ui.toggle("skills");
    if (this.input.pressed("i")) this.ui.toggle("stats");

    // God mode toggle
    if (this.input.pressed("g")) {
      this.hero.state.invulnerable = !this.hero.state.invulnerable;
      this.ui.setMsg(`God mode: ${this.hero.state.invulnerable ? "ON" : "OFF"}`);
    }

    // Mouse -> world coords
    this._mouseWorld.x = this.cam.x + this.input.mouse.x;
    this._mouseWorld.y = this.cam.y + this.input.mouse.y;
    if (dist2(this._mouseWorld.x, this._mouseWorld.y, this.hero.x, this.hero.y) > 25) {
      this._mouseMoved = true;
    }

    const uiBlocking = this.ui.open.map || this.ui.open.stats || this.ui.open.skills;

    // --- MOVEMENT ---
    if (!uiBlocking) {
      let mx = 0, my = 0;
      if (this.input.down("arrowleft")) mx -= 1;
      if (this.input.down("arrowright")) mx += 1;
      if (this.input.down("arrowup")) my -= 1;
      if (this.input.down("arrowdown")) my += 1;

      const baseSpd = this.hero.state.sailing ? 220 : 155;

      if (mx !== 0 || my !== 0) {
        const n = norm(mx, my);
        mx = n.x; my = n.y;

        this.hero.lastMove.x = mx;
        this.hero.lastMove.y = my;

        const body = { x: this.hero.x + mx * baseSpd * dt, y: this.hero.y + my * baseSpd * dt, r: this.hero.r };
        this.world.resolveCircleVsWorld(body, this.hero.state);
        this.hero.x = body.x;
        this.hero.y = body.y;
      }

      // Sailing toggle ONLY at dock
      if (this.input.pressed("b")) {
        const can = this.world.isNearDock(this.hero.x, this.hero.y);
        if (can) {
          this.hero.state.sailing = !this.hero.state.sailing;
          this.ui.setMsg(`Sailing: ${this.hero.state.sailing ? "ON" : "OFF"}`);
        } else {
          this.ui.setMsg("You can only sail at a dock.");
        }
      }

      // Skill casting: A = Fireball
      if (this.input.pressed("a")) {
        this.castSkill("fireball");
      }
    }

    // Update hero
    this.hero.update(dt);

    // Loot pickups
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      L.update(dt);
      if (dist2(L.x, L.y, this.hero.x, this.hero.y) < (L.r + this.hero.r + 4) ** 2) {
        this.pickup(L.item);
        this.loot.splice(i, 1);
      }
    }

    // Enemies
    for (const e of this.enemies) e.update(dt, this.hero, this.world);

    // Projectiles
    for (const p of this.projectiles) p.update(dt, this.world, this.enemies);
    this.projectiles = this.projectiles.filter(p => p.alive);

    // Enemy deaths -> loot + XP
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        const xp = e.xpValue();
        this.hero.giveXP(xp);
        this.ui.setMsg(`+${xp} XP`);
        this.dropLoot(e.x, e.y, e.tier);
        this.enemies.splice(i, 1);
      }
    }

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.15;
      this.spawnEnemies();
    }

    // Camera
    const maxCamX = Math.max(0, this.world.width - this.canvas.width);
    const maxCamY = Math.max(0, this.world.height - this.canvas.height);
    this.cam.x = clamp(this.hero.x - this.canvas.width / 2, 0, maxCamX);
    this.cam.y = clamp(this.hero.y - this.canvas.height / 2, 0, maxCamY);

    // Hints
    this.hint = "";
    if (this.world.isNearDock(this.hero.x, this.hero.y)) {
      this.hint = "Dock: press B to toggle sailing";
    } else {
      // show subtle hint if near water edge
      const T = this.world.terrainAt(this.hero.x + 180, this.hero.y);
      if (T.ocean && !this.hero.state.sailing) this.hint = "Find a dock to sail to islands.";
    }

    // UI update
    this.ui.update(dt);

    // Save periodically
    this._saveT = (this._saveT ?? 0) - dt;
    if (this._saveT <= 0) {
      this._saveT = 2.0;
      saveGame({
        hero: {
          x: this.hero.x, y: this.hero.y,
          level: this.hero.level, xp: this.hero.xp,
          nextXp: this.hero.nextXp,
          gold: this.hero.gold,
          hp: this.hero.hp, mana: this.hero.mana
        }
      });
    }

    this.world.update(dt);
    this.input.endFrame();
  }

  castSkill(id) {
    const s = this.hero.skills.find(k => k.id === id);
    if (!s) return;

    if (s.cdT > 0) return;

    const st = this.hero.getStats();
    if (this.hero.mana < s.mana) {
      this.ui.setMsg("Not enough mana.");
      return;
    }

    this.hero.mana -= s.mana;

    // direction: mouse if moved, else last movement
    let dir;
    if (this._mouseMoved) dir = norm(this._mouseWorld.x - this.hero.x, this._mouseWorld.y - this.hero.y);
    else dir = norm(this.hero.lastMove.x, this.hero.lastMove.y);

    // v28 scaling: skill level improves damage + speed slightly
    const lvl = s.level;
    const spd = 520 + lvl * 18;
    const dmg = Math.round((st.dmg * 0.85 + 10) * (1 + lvl * 0.08));

    const p = new Projectile(
      this.hero.x + dir.x * 18,
      this.hero.y + dir.y * 18,
      dir.x * spd,
      dir.y * spd,
      dmg,
      0.95 + lvl * 0.03,
      lvl
    );
    this.projectiles.push(p);

    s.cdT = Math.max(0.14, s.cd - lvl * 0.02);

    // skill XP per successful cast attempt
    this.hero.skillUse(id);

    this.ui.skillName = `${s.name} Lv.${s.level}`;
    this.ui.skillPulse = 0.26;
  }

  spawnEnemies() {
    if (this.enemies.length > 18) return;

    const r = 520 + this.rng.float() * 520;
    const ang = this.rng.float() * Math.PI * 2;
    const x = clamp(this.hero.x + Math.cos(ang) * r, 40, this.world.width - 40);
    const y = clamp(this.hero.y + Math.sin(ang) * r, 40, this.world.height - 40);

    const T = this.world.terrainAt(x, y);
    if (T.ocean) return;
    if (this.world.isInRiver(x, y)) return;

    const d = Math.sqrt(dist2(x, y, this.world.spawn.x, this.world.spawn.y));
    const tier = clamp(Math.floor(d / 1200) + 1, 1, 8);

    const roll = this.rng.float();
    const type = roll > 0.86 ? "shaman" : roll > 0.70 ? "charger" : "grunt";

    this.enemies.push(new Enemy(x, y, tier, type));
  }

  dropLoot(x, y, tier) {
    const gold = 2 + Math.round(tier * (2 + this.rng.float() * 3));
    this.loot.push(new Loot(x + 12, y + 6, { kind: "gold", amt: gold }));

    if (this.rng.float() < 0.40) {
      const rarity = this.rollRarity(tier);
      const slot = this.rng.pick(GearSlots);
      const gear = makeGear(this.rng, slot, rarity, tier);
      this.loot.push(new Loot(x - 10, y - 8, gear));
    }
  }

  rollRarity(tier) {
    const r = this.rng.float() + tier * 0.03;
    if (r > 1.15) return "legendary";
    if (r > 0.98) return "epic";
    if (r > 0.82) return "rare";
    if (r > 0.60) return "uncommon";
    return "common";
  }

  pickup(item) {
    if (item.kind === "gold") {
      this.hero.gold += item.amt;
      this.ui.setMsg(`+${item.amt} gold`);
      return;
    }

    // gear
    this.hero.inventory.push(item);

    // auto-equip if empty slot
    if (!this.hero.equip[item.slot]) {
      this.hero.equip[item.slot] = item;
      this.ui.setMsg(`Equipped: ${item.name}`);
      const st = this.hero.getStats();
      this.hero.hp = Math.min(this.hero.hp, st.maxHp);
      this.hero.mana = Math.min(this.hero.mana, st.maxMana);
    } else {
      this.ui.setMsg(`Loot: ${item.name}`);
    }
  }

  draw(t) {
    const ctx = this.ctx;

    // screen clear
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // world
    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);

    this.world.draw(ctx, t, {
      x: this.cam.x,
      y: this.cam.y,
      w: this.canvas.width,
      h: this.canvas.height,
    });

    // entities
    for (const L of this.loot) L.draw(ctx, t);
    for (const e of this.enemies) e.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);
    this.hero.draw(ctx, t);

    ctx.restore();

    // UI
    this.ui.draw(ctx, this);

    // death overlay
    if (this.hero.hp <= 0) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffd28a";
      ctx.font = "28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("You Died", this.canvas.width / 2, this.canvas.height / 2);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillStyle = "#d7e0ff";
      ctx.fillText("Refresh to respawn (saving is on)", this.canvas.width / 2, this.canvas.height / 2 + 28);
      ctx.textAlign = "left";
    }
  }
}
