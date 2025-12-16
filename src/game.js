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
// UI can be either a class (with draw) or a plain function (draw itself)
this.ui = (typeof UI === "function") ? new UI() : UI;

// If UI was actually meant to be used as a function (not a class), wrap it
if (!this.ui || typeof this.ui.draw !== "function") {
  if (typeof UI === "function") {
    this.ui = { draw: UI };
  } else if (this.ui && typeof this.ui.render === "function") {
    this.ui.draw = (...args) => this.ui.render(...args);
  } else {
    // last-resort no-op UI so the game keeps running
    this.ui = { draw: () => ({}) };
  }
}


    // deterministic loot/enemy/item rolls
    this.rng = new RNG(12345);

    // world
    this.world = new World(canvas.width, canvas.height);

    // hero
    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    // progression
    this.hero.xp = 0;
    this.hero.level = 1;
    this.hero.gold = 0;

    this.hero.inventory = [];
    this.hero.equip = { weapon: null, helm: null, chest: null, boots: null, ring: null };

    // base stats + derived
    this.hero.base = {
      hp: 100,
      mana: 60,
      dmg: 10,
      armor: 0,
      move: 160,
    };

    // give starter weapon (needs this.rng)
    const starter = this._makeGear({ tier: 1, forceSlot: "weapon", rarity: "common" });
    starter.name = "Rusty Sword";
    this.hero.equip.weapon = starter;
    this.hero.recalcStats();

    this.cam = { x: this.hero.x - this.canvas.width / 2, y: this.hero.y - this.canvas.height / 2 };

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    // fireball skill
    this.fireCD = 0;
    this.fireSkillXP = 0;
    this.fireSkillLv = 1;

    // menus
    this.menus = { map: false, inv: false, god: false };
    this.lastHit = null;
    this.msg = "";
    this.msgT = 0;

    // god menu
    this.god = {
      invincible: false,
      dmgMult: 1,
    };

    // spawn pacing
    this.spawnT = 0;

    // last move dir for shooting
    this.lastDir = { x: 1, y: 0 };

    // time
    this.t = 0;

    // start enemies
    this._seedEnemies(16);
  }

  setMsg(s, dur = 1.5) {
    this.msg = s;
    this.msgT = dur;
  }

  toggleMenu(key) {
    if (key === "map") this.menus.map = !this.menus.map;
    if (key === "inv") this.menus.inv = !this.menus.inv;
    if (key === "god") this.menus.god = !this.menus.god;
  }

  closeAllMenus() {
    this.menus.map = false;
    this.menus.inv = false;
    this.menus.god = false;
  }

  _seedEnemies(n) {
    let tries = 0;
    while (this.enemies.length < n && tries++ < 5000) {
      const x = this.hero.x + (this.rng.float() * 2 - 1) * 900;
      const y = this.hero.y + (this.rng.float() * 2 - 1) * 900;
      if (x < 0 || y < 0 || x > this.world.width || y > this.world.height) continue;
      if (this.world.pointIsSolid(x, y, this.hero)) continue;

      const tier = 1 + (this.rng.float() < 0.18 ? 1 : 0) + (this.rng.float() < 0.06 ? 1 : 0);
      const e = new Enemy(x, y, tier);
      this.enemies.push(e);
    }
  }

  _rarityRoll() {
    const r = this.rng.float();
    if (r < 0.05) return "epic";
    if (r < 0.22) return "rare";
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

    const item = {
      kind: "gear",
      id,
      slot,
      rarity: rar,
      tier,
      stats,
      name: this._nameGear(slot, rar, tier, stats),
    };

    return item;
  }

  _nameGear(slot, rarity, tier, stats) {
    // this.rng MUST exist before this is called
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

    const adj =
      rarity === "common"
        ? adjC[(this.rng.float() * adjC.length) | 0]
        : rarity === "rare"
        ? adjR[(this.rng.float() * adjR.length) | 0]
        : adjE[(this.rng.float() * adjE.length) | 0];

    const n = noun[(this.rng.float() * noun.length) | 0];

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

  castFireball() {
    if (this.fireCD > 0) return;
    if (this.hero.mana < 10) {
      this.setMsg("Not enough mana");
      return;
    }

    this.hero.mana -= 10;
    this.fireCD = Math.max(0.22, 0.55 - this.fireSkillLv * 0.03);

    this.fireSkillXP += 1;
    const need = 10 + this.fireSkillLv * 6;
    if (this.fireSkillXP >= need) {
      this.fireSkillXP = 0;
      this.fireSkillLv++;
      this.setMsg(`Fireball leveled to ${this.fireSkillLv}!`);
    }

    const spd = 440 + this.fireSkillLv * 10;
    const dmg = Math.round((this.hero.dmg + 4 * this.fireSkillLv) * this.god.dmgMult);

    const p = new Projectile(
      this.hero.x,
      this.hero.y,
      this.lastDir.x * spd,
      this.lastDir.y * spd,
      dmg
    );
    this.projectiles.push(p);
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);

      if (this.world.projectileHitsSolid(p)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // hit enemies
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) {
          e.hp -= p.dmg;
          this.projectiles.splice(i, 1);
          break;
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

      if (this.rng.float() < 0.55) {
        const gear = this._makeGear({ tier: e.tier, rarity: this._rarityRoll() });
        this.addLoot(gear, e.x + 10, e.y + 6);
      }

      const xp = 10 + e.tier * 12;
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

  _spawnEnemies(dt) {
    this.spawnT += dt;
    if (this.spawnT < 1.0) return;
    this.spawnT = 0;

    // keep a steady population
    if (this.enemies.length > 24) return;

    // spawn near hero on walkable land
    let tries = 0;
    while (tries++ < 140) {
      const x = this.hero.x + (this.rng.float() * 2 - 1) * 1200;
      const y = this.hero.y + (this.rng.float() * 2 - 1) * 1200;
      if (x < 0 || y < 0 || x > this.world.width || y > this.world.height) continue;
      if (this.world.pointIsSolid(x, y, this.hero)) continue;

      const tier = 1 + (this.rng.float() < 0.2 ? 1 : 0) + (this.rng.float() < 0.08 ? 1 : 0);
      this.enemies.push(new Enemy(x, y, tier));
      break;
    }
  }

  update(dt) {
    this.t += dt;

    if (this.msgT > 0) this.msgT -= dt;
    else this.msg = "";

    // input toggles
    if (this.input.consume("Escape")) this.closeAllMenus();
    if (this.input.consume("m") || this.input.consume("M")) this.toggleMenu("map");
    if (this.input.consume("i") || this.input.consume("I")) this.toggleMenu("inv");
    if (this.input.consume("g") || this.input.consume("G")) this.toggleMenu("god");

    // god menu actions (simple)
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
    if (mv.x !== 0 || mv.y !== 0) {
      this.lastDir = { x: mv.x, y: mv.y };
    }

    const speed = this.hero.moveSpeed;
    this.hero.vx = mv.x * speed;
    this.hero.vy = mv.y * speed;

    this.hero.update(dt);
    this.world.resolveCircleVsWorld(this.hero, this.hero);

    // sailing toggle (handled by hero/world logic)
    if (this.input.consume("b") || this.input.consume("B")) {
      if (this.world.isNearDock(this.hero.x, this.hero.y)) {
        this.hero.sailing = !this.hero.sailing;
        this.setMsg(this.hero.sailing ? "Sailing" : "Docked");
      } else {
        this.setMsg("You must be at a dock to sail");
      }
    }

    // teleport near activated waystone
    if (this.input.consume("e") || this.input.consume("E")) {
      const near = this.world.waystones.find(
        (w) => dist2(w.x, w.y, this.hero.x, this.hero.y) < 60 * 60
      );
      if (near) {
        if (!near.activated) {
          near.activated = true;
          this.setMsg("Waystone activated!");
        } else {
          const act = this.world.waystones.filter((w) => w.activated);
          if (act.length > 1) {
            const idx = act.findIndex((w) => w.id === near.id);
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

    // attack
    if (!this.menus.map && !this.menus.inv && !this.menus.god) {
      if (this.input.consume("a") || this.input.consume("A")) this.castFireball();
    }

    if (this.fireCD > 0) this.fireCD -= dt;

    // enemies
    for (const e of this.enemies) e.update(dt, this.hero);

    // enemy attacks
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const hit = dist2(e.x, e.y, this.hero.x, this.hero.y) < (e.r + this.hero.r) ** 2;
      if (hit && e.atkCD <= 0) {
        e.atkCD = 0.8;
        if (!this.god.invincible) {
          const dmg = Math.max(1, e.dmg - this.hero.armor);
          this.hero.hp -= dmg;
          this.setMsg(`-${dmg} HP`);
          if (this.hero.hp <= 0) {
            this.hero.hp = this.hero.maxHp;
            this.hero.mana = this.hero.maxMana;
            this.hero.x = this.world.spawn.x;
            this.hero.y = this.world.spawn.y;
            this.setMsg("You were knocked out...");
          }
        }
      }
    }

    // projectiles
    this._updateProjectiles(dt);

    // deaths + drops + xp
    this._handleEnemyDeaths();

    // loot pickup
    this.pickLoot();

    // spawn more
    this._spawnEnemies(dt);

    // camera
    this.cam.x = clamp(this.hero.x - this.canvas.width / 2, 0, this.world.width);
    this.cam.y = clamp(this.hero.y - this.canvas.height / 2, 0, this.world.height);
  }

  draw() {
    const ctx = this.ctx;
    const t = this.t;

    // clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // world
    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);

    this.world.draw(ctx, t, {
      x: this.cam.x,
      y: this.cam.y,
      w: this.canvas.width,
      h: this.canvas.height,
    });

    // loot + enemies + projectiles + hero
    for (const L of this.loot) L.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx, t);
    this.hero.draw(ctx);

    ctx.restore();

    // ui
    this.lastHit = this.ui.draw(ctx, {
      hero: this.hero,
      menus: this.menus,
      world: this.world,
      cam: this.cam,
      fire: { cd: this.fireCD, lv: this.fireSkillLv, xp: this.fireSkillXP },
      god: this.god,
      msg: this.msgT > 0 ? this.msg : "",
    });
  }
}
