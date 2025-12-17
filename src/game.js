// src/game.js
import World from "./world.js";
import Input from "./input.js";
import UI from "./ui.js";
import { RNG, clamp, dist2 } from "./util.js";
import { Hero, Enemy, Boss, Projectile, EnemyProjectile, Loot } from "./entities.js";

export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.input = new Input(canvas);
    this.ui = new UI();

    this.rng = new RNG(12345);

    this.world = new World(canvas.width, canvas.height);
    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    this.hero.xp = 0;
    this.hero.level = 1;
    this.hero.gold = 0;

    this.hero.inventory = [];
    this.hero.equip = { weapon: null, helm: null, chest: null, boots: null, ring: null };

    this.hero.base = { hp: 100, mana: 60, dmg: 10, armor: 0, move: 160 };

    const starter = this._makeGear({ tier: 1, forceSlot: "weapon", rarity: "common" });
    starter.name = "Rusty Sword";
    this.hero.equip.weapon = starter;
    this.hero.recalcStats();

    this.cam = { x: 0, y: 0 };

    this.enemies = [];
    this.enemyShots = [];
    this.projectiles = [];
    this.loot = [];

    // impact FX list
    this.fx = [];

    // fireball skill
    this.fireCD = 0;
    this.fireSkillXP = 0;
    this.fireSkillLv = 1;

    // menus
    this.menus = { map: false, inv: false, god: false, skills: false };

    // god menu
    this.god = { invincible: false, dmgMult: 1 };

    // spawn pacing
    this.spawnT = 0;

    // last move dir for A casting
    this.lastDir = { x: 1, y: 0 };

    // boss
    this.boss = null;
    this.bossRespawnT = 0;
    this.bossSpawn = { x: 4200, y: 3100 }; // near bridges/central land, should be reachable

    // message
    this.msg = "";
    this.msgT = 0;

    // time
    this.t = 0;

    // start enemies
    this._seedEnemies(18);
  }

  setMsg(s, dur = 1.6) {
    this.msg = s;
    this.msgT = dur;
  }

  closeAllMenus() {
    this.menus.map = false;
    this.menus.inv = false;
    this.menus.god = false;
    this.menus.skills = false;
  }

  toggleMenu(which) {
    // toggling one menu closes others (prevents “stuck” menus)
    const willOpen = !this.menus[which];
    this.closeAllMenus();
    this.menus[which] = willOpen;
  }

  _seedEnemies(n) {
    let tries = 0;
    while (this.enemies.length < n && tries++ < 5000) {
      const x = this.hero.x + (this.rng.float() * 2 - 1) * 900;
      const y = this.hero.y + (this.rng.float() * 2 - 1) * 900;
      if (x < 0 || y < 0 || x > this.world.width || y > this.world.height) continue;
      if (this.world.pointIsSolid(x, y, this.hero)) continue;

      const tier = this._rollTier();
      const type = this._rollEnemyType();
      this.enemies.push(new Enemy(x, y, tier, type));
    }
  }

  _rollTier() {
    return 1 + (this.rng.float() < 0.18 ? 1 : 0) + (this.rng.float() < 0.06 ? 1 : 0);
  }

  _rollEnemyType() {
    const r = this.rng.float();
    if (r < 0.18) return "shaman";
    if (r < 0.40) return "charger";
    return "grunt";
  }

  _rarityRoll() {
    const r = this.rng.float();
    if (r < 0.06) return "epic";
    if (r < 0.24) return "rare";
    return "common";
  }

  _slotRoll() {
    const r = this.rng.float();
    if (r < 0.22) return "weapon";
    if (r < 0.42) return "helm";
    if (r < 0.62) return "chest";
    if (r < 0.82) return "boots";
    return "ring";
  }

  _makeGear({ tier = 1, forceSlot = null, rarity = null } = {}) {
    const slot = forceSlot || this._slotRoll();
    const rar = rarity || this._rarityRoll();

    const id = `g_${(this.rng.nextU32 ? this.rng.nextU32() : (this.rng.float() * 1e9) | 0)}_${(this.rng.float() * 1e9) | 0}`;

    const mult = rar === "common" ? 1 : rar === "rare" ? 1.6 : 2.3;
    const roll = () => (0.75 + this.rng.float() * 0.5) * mult;

    const stats = { hp: 0, mana: 0, dmg: 0, armor: 0, move: 0 };

    if (slot === "weapon") stats.dmg = Math.round((6 + tier * 3) * roll());
    if (slot === "helm") stats.armor = Math.round((1 + tier * 1.2) * roll());
    if (slot === "chest") stats.hp = Math.round((10 + tier * 8) * roll());
    if (slot === "boots") stats.move = Math.round((6 + tier * 3) * roll());
    if (slot === "ring") stats.mana = Math.round((8 + tier * 6) * roll());

    const item = { kind: "gear", id, slot, rarity: rar, tier, stats, name: this._nameGear(slot, rar, tier, stats) };
    return item;
  }

  _nameGear(slot, rarity, tier, stats) {
    const adjC = ["Worn", "Simple", "Rugged", "Plain", "Traveler's"];
    const adjR = ["Runed", "Fine", "Gleaming", "Tempered", "Sturdy"];
    const adjE = ["Mythic", "Flameforged", "Stormbound", "Voidtouched", "Kingsworn"];

    const noun = {
      weapon: ["Blade", "Sword", "Axe", "Mace", "Dagger"],
      helm: ["Helm", "Hood", "Circlet", "Mask"],
      chest: ["Cuirass", "Tunic", "Mail", "Vest"],
      boots: ["Boots", "Greaves", "Treads"],
      ring: ["Ring", "Band", "Signet"],
    }[slot];

    const rngPick = (arr) => arr[(this.rng.float() * arr.length) | 0];

    const adj = rarity === "common" ? rngPick(adjC) : rarity === "rare" ? rngPick(adjR) : rngPick(adjE);
    const n = rngPick(noun);

    const statTag = (() => {
      if (slot === "weapon") return `+${stats.dmg} dmg`;
      if (slot === "chest") return `+${stats.hp} hp`;
      if (slot === "ring") return `+${stats.mana} mana`;
      if (slot === "boots") return `+${stats.move} move`;
      return `+${stats.armor} armor`;
    })();

    const tierTag = tier >= 3 ? " III" : tier === 2 ? " II" : "";
    return `${adj} ${n}${tierTag} (${statTag})`;
  }

  equip(item) {
    if (!item || item.kind !== "gear") return;
    const slot = item.slot;
    const cur = this.hero.equip[slot];
    if (cur) this.hero.inventory.push(cur);
    this.hero.equip[slot] = item;

    const idx = this.hero.inventory.findIndex((it) => it.id === item.id);
    if (idx >= 0) this.hero.inventory.splice(idx, 1);

    this.hero.recalcStats();
    this.setMsg(`Equipped ${item.name}`);
  }

  unequip(slot) {
    const cur = this.hero.equip[slot];
    if (!cur) return;
    this.hero.inventory.push(cur);
    this.hero.equip[slot] = null;
    this.hero.recalcStats();
    this.setMsg(`Unequipped ${cur.name}`);
  }

  addLoot(item, x, y) {
    this.loot.push(new Loot(item, x, y));
  }

  pickLoot() {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      if (dist2(L.x, L.y, this.hero.x, this.hero.y) < 36 * 36) {
        this.loot.splice(i, 1);
        const it = L.item;
        if (it.kind === "gold") {
          this.hero.gold += it.amount;
          this.setMsg(`+${it.amount} gold`);
        } else {
          this.hero.inventory.push(it);
          this.setMsg(`Picked up ${it.name}`);
        }
      }
    }
  }

  _skillNeed(lv) {
    return 10 + lv * 6;
  }

  _spawnHitFX(x, y, kind = "hit") {
    this.fx.push({ x, y, t: 0, kind });
  }

  castFireballDir(dx, dy) {
    if (this.fireCD > 0) return;
    if (this.hero.mana < 10) {
      this.setMsg("Not enough mana");
      return;
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;

    this.hero.mana -= 10;
    this.fireCD = Math.max(0.22, 0.55 - this.fireSkillLv * 0.03);

    // skill XP system
    this.fireSkillXP += 1;
    const need = this._skillNeed(this.fireSkillLv);
    if (this.fireSkillXP >= need) {
      this.fireSkillXP = 0;
      this.fireSkillLv++;
      this.setMsg(`Fireball leveled to ${this.fireSkillLv}!`);
    }

    const spd = 460 + this.fireSkillLv * 12;
    const dmg = Math.round((this.hero.dmg + 4 * this.fireSkillLv) * this.god.dmgMult);

    const p = new Projectile(this.hero.x, this.hero.y, dx * spd, dy * spd, dmg);
    this.projectiles.push(p);
  }

  castFireball() {
    // A casts in last movement direction
    this.castFireballDir(this.lastDir.x, this.lastDir.y);
  }

  _updateProjectiles(dt) {
    // player projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);

      if (p.life <= 0 || this.world.projectileHitsSolid(p)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // hit enemies
      let hit = false;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) {
          e.hp -= p.dmg;
          this._spawnHitFX(p.x, p.y, "hit");
          hit = true;
          break;
        }
      }

      // hit boss
      if (!hit && this.boss && this.boss.alive) {
        if (dist2(p.x, p.y, this.boss.x, this.boss.y) < (p.r + this.boss.r) * (p.r + this.boss.r)) {
          this.boss.hp -= p.dmg;
          this._spawnHitFX(p.x, p.y, "boss");
          hit = true;
        }
      }

      if (hit) this.projectiles.splice(i, 1);
    }

    // enemy projectiles
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const p = this.enemyShots[i];
      p.update(dt);
      if (p.life <= 0 || this.world.projectileHitsSolid(p)) {
        this.enemyShots.splice(i, 1);
        continue;
      }
      if (dist2(p.x, p.y, this.hero.x, this.hero.y) < (p.r + this.hero.r) * (p.r + this.hero.r)) {
        this.enemyShots.splice(i, 1);
        this._spawnHitFX(p.x, p.y, "hurt");
        if (!this.god.invincible) {
          const dmg = Math.max(1, p.dmg - this.hero.armor);
          this.hero.hp -= dmg;
          this.setMsg(`-${dmg} HP`);
        }
      }
    }
  }

  _handleEnemyDeaths() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      if (e.hp > 0) continue;

      e.alive = false;

      const gold = 4 + e.tier * (3 + ((this.rng.float() * 6) | 0));
      this.addLoot({ kind: "gold", amount: gold }, e.x, e.y);

      const dropChance = e.type === "shaman" ? 0.65 : e.type === "charger" ? 0.60 : 0.55;
      if (this.rng.float() < dropChance) {
        const gear = this._makeGear({ tier: e.tier, rarity: this._rarityRoll() });
        this.addLoot(gear, e.x + 10, e.y + 6);
      }

      const xp = 10 + e.tier * 12 + (e.type === "shaman" ? 6 : e.type === "charger" ? 4 : 0);
      this.hero.xp += xp;

      while (this.hero.xp >= 100 + (this.hero.level - 1) * 35) {
        this.hero.xp -= 100 + (this.hero.level - 1) * 35;
        this.hero.level++;
        this.hero.base.hp += 12;
        this.hero.base.mana += 6;
        this.hero.base.dmg += 2;
        this.hero.base.move += 2;
        this.hero.recalcStats();
        this.setMsg(`Level up! You are now level ${this.hero.level}`);
      }

      this.enemies.splice(i, 1);
    }
  }

  _handleBoss(dt) {
    // spawn boss if not alive and cooldown finished
    if (!this.boss || !this.boss.alive) {
      if (this.bossRespawnT > 0) {
        this.bossRespawnT -= dt;
      } else {
        // only spawn if area is land/walkable
        if (!this.world.pointIsSolid(this.bossSpawn.x, this.bossSpawn.y, this.hero)) {
          this.boss = new Boss(this.bossSpawn.x, this.bossSpawn.y);
          this.setMsg("A Boss has awakened near the central bridges!");
        }
      }
      return;
    }

    // boss update
    this.boss.update(dt, this.hero, this.enemyShots);

    // boss contact damage
    if (dist2(this.boss.x, this.boss.y, this.hero.x, this.hero.y) < (this.boss.r + this.hero.r) ** 2) {
      if (this.boss.atkCD <= 0) {
        this.boss.atkCD = 0.9;
        if (!this.god.invincible) {
          const dmg = Math.max(2, this.boss.dmg - this.hero.armor);
          this.hero.hp -= dmg;
          this.setMsg(`-${dmg} HP (Boss)`);
          this._spawnHitFX(this.hero.x, this.hero.y, "hurt");
        }
      }
    }

    // boss death
    if (this.boss.hp <= 0 && this.boss.alive) {
      this.boss.alive = false;
      this.setMsg("Boss defeated! Epic loot dropped!");

      // loot fountain
      this.addLoot({ kind: "gold", amount: 200 }, this.boss.x, this.boss.y);
      for (let i = 0; i < 3; i++) {
        const gear = this._makeGear({ tier: 3, rarity: "epic" });
        this.addLoot(gear, this.boss.x + (i - 1) * 18, this.boss.y + 12);
      }

      // big XP
      this.hero.xp += 260;
      this.bossRespawnT = 45; // seconds
    }
  }

  _spawnEnemies(dt) {
    this.spawnT += dt;
    if (this.spawnT < 1.0) return;
    this.spawnT = 0;

    if (this.enemies.length > 28) return;

    let tries = 0;
    while (tries++ < 140) {
      const x = this.hero.x + (this.rng.float() * 2 - 1) * 1200;
      const y = this.hero.y + (this.rng.float() * 2 - 1) * 1200;
      if (x < 0 || y < 0 || x > this.world.width || y > this.world.height) continue;
      if (this.world.pointIsSolid(x, y, this.hero)) continue;

      const tier = this._rollTier();
      const type = this._rollEnemyType();
      this.enemies.push(new Enemy(x, y, tier, type));
      break;
    }
  }

  _updateFX(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t > 0.35) this.fx.splice(i, 1);
    }
  }

  update(dt) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    else this.msg = "";

    // menu toggles
    if (this.input.consume("Escape")) this.closeAllMenus();
    if (this.input.consume("m") || this.input.consume("M")) this.toggleMenu("map");
    if (this.input.consume("i") || this.input.consume("I")) this.toggleMenu("inv");
    if (this.input.consume("g") || this.input.consume("G")) this.toggleMenu("god");
    if (this.input.consume("k") || this.input.consume("K")) this.toggleMenu("skills");

    // UI click equip/unequip
    const click = this.input.consumeClick();
    if (click && this.menus.inv && this.lastHit) {
      const gearList = this.hero.inventory.filter(it => it.kind === "gear");

      if (this.lastHit.invItems) {
        for (const b of this.lastHit.invItems) {
          if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
            const it = gearList[b.idx];
            if (it) this.equip(it);
          }
        }
      }
      if (this.lastHit.equipSlots) {
        for (const s of this.lastHit.equipSlots) {
          if (click.x >= s.x && click.x <= s.x + s.w && click.y >= s.y && click.y <= s.y + s.h) {
            this.unequip(s.slot);
          }
        }
      }
    }

    // god menu actions
    if (this.menus.god) {
      if (this.input.consume("1")) {
        this.god.invincible = !this.god.invincible;
        this.setMsg(`Invincible: ${this.god.invincible ? "ON" : "OFF"}`);
      }
      if (this.input.consume("2")) {
        const seq = [1, 2, 5, 10];
        const idx = (seq.indexOf(this.god.dmgMult) + 1) % seq.length;
        this.god.dmgMult = seq[idx];
        this.setMsg(`Damage Mult: x${this.god.dmgMult}`);
      }
      if (this.input.consume("3")) {
        this.hero.hp = this.hero.maxHp;
        this.hero.mana = this.hero.maxMana;
        this.setMsg("Refilled HP/Mana");
      }
    }

    // movement
    const mv = this.input.moveVec();
    if (mv.x !== 0 || mv.y !== 0) this.lastDir = { x: mv.x, y: mv.y };

    const speed = this.hero.moveSpeed;
    this.hero.vx = mv.x * speed;
    this.hero.vy = mv.y * speed;

    this.hero.update(dt);
    this.world.resolveCircleVsWorld(this.hero, this.hero);

    // sailing toggle
    if (this.input.consume("b") || this.input.consume("B")) {
      if (this.world.isNearDock(this.hero.x, this.hero.y)) {
        this.hero.sailing = !this.hero.sailing;
        this.setMsg(this.hero.sailing ? "Sailing" : "Docked");
      } else {
        this.setMsg("You must be at a dock to sail");
      }
    }

    // teleport near waystone
    if (this.input.consume("e") || this.input.consume("E")) {
      const near = this.world.waystones.find(w => dist2(w.x, w.y, this.hero.x, this.hero.y) < 60 * 60);
      if (near) {
        if (!near.activated) {
          near.activated = true;
          this.setMsg("Waystone activated!");
        } else {
          const act = this.world.waystones.filter(w => w.activated);
          if (act.length > 1) {
            const idx = act.findIndex(w => w.id === near.id);
            const next = act[(idx + 1) % act.length];
            this.hero.x = next.x + 40;
            this.hero.y = next.y + 10;
            this.setMsg(`Teleported to ${next.name}`);
          } else {
            this.setMsg("Activate more waystones to teleport");
          }
        }
      }
    }

    // casting
    const anyMenu = this.menus.map || this.menus.inv || this.menus.god || this.menus.skills;

    // A key = lastDir
    if (!anyMenu && (this.input.consume("a") || this.input.consume("A"))) this.castFireball();

    // Mouse click cast toward cursor (screen -> world)
    if (!anyMenu && click) {
      const wx = this.cam.x + click.x;
      const wy = this.cam.y + click.y;
      this.castFireballDir(wx - this.hero.x, wy - this.hero.y);
    }

    if (this.fireCD > 0) this.fireCD -= dt;

    // enemies
    for (const e of this.enemies) e.update(dt, this.hero, this.enemyShots);

    // enemy contact damage (melee)
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const hit = dist2(e.x, e.y, this.hero.x, this.hero.y) < (e.r + this.hero.r) ** 2;
      if (hit && e.atkCD <= 0) {
        e.atkCD = e.type === "charger" ? 0.95 : 0.8;
        this._spawnHitFX(this.hero.x, this.hero.y, "hurt");
        if (!this.god.invincible) {
          const dmg = Math.max(1, Math.round(e.dmg) - this.hero.armor);
          this.hero.hp -= dmg;
          this.setMsg(`-${dmg} HP`);
        }
      }
    }

    // boss + boss projectiles
    this._handleBoss(dt);

    // projectiles
    this._updateProjectiles(dt);

    // deaths + drops + xp
    this._handleEnemyDeaths();

    // loot pickup
    this.pickLoot();

    // spawn more
    this._spawnEnemies(dt);

    // fx
    this._updateFX(dt);

    // KO handling
    if (this.hero.hp <= 0) {
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this.hero.x = this.world.spawn.x;
      this.hero.y = this.world.spawn.y;
      this.setMsg("You were knocked out...");
    }

    // camera
    this.cam.x = clamp(this.hero.x - this.canvas.width / 2, 0, this.world.width);
    this.cam.y = clamp(this.hero.y - this.canvas.height / 2, 0, this.world.height);
  }

  draw() {
    const ctx = this.ctx;
    const t = this.t;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);

    this.world.draw(ctx, t, { x: this.cam.x, y: this.cam.y, w: this.canvas.width, h: this.canvas.height });

    for (const L of this.loot) L.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const p of this.enemyShots) p.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);

    // boss
    if (this.boss && this.boss.alive) this.boss.draw(ctx);

    // hero
    this.hero.draw(ctx);

    // impact FX (world-space)
    for (const f of this.fx) {
      const a = 1 - clamp(f.t / 0.35, 0, 1);
      const r = (f.kind === "boss" ? 28 : 18) * (1 + f.t * 2.2);
      ctx.globalAlpha = 0.30 * a;
      ctx.fillStyle = f.kind === "hurt" ? "#ff5d5d" : f.kind === "boss" ? "#c77dff" : "#ffd28a";
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // UI
    const fireNeed = this._skillNeed(this.fireSkillLv);
    this.lastHit = this.ui.draw(ctx, {
      hero: this.hero,
      menus: this.menus,
      world: this.world,
      cam: this.cam,
      fire: { cd: this.fireCD, lv: this.fireSkillLv },
      skill: { fireLv: this.fireSkillLv, fireXP: this.fireSkillXP, fireNeed },
      god: this.god,
      msg: this.msgT > 0 ? this.msg : "",
      mouse: this.input.mouse,
    });
  }
}
