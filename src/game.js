// src/game.js
import World from "./world.js";
import Input from "./input.js";
import UI from "./ui.js";
import { clamp, RNG } from "./util.js";
import { saveGameSnapshot, loadGameSnapshot, hasSave } from "./save.js";
import { Hero, Enemy, Boss, Projectile, EnemyProjectile, Loot } from "./entities.js";

/* =========================
   GEAR / LOOT HELPERS
========================= */
const GEAR_BASE = {
  helm:   { hp: 20, armor: 2 },
  chest:  { hp: 44, armor: 4 },
  boots:  { move: 22, armor: 1 },
  ring:   { mana: 18 },
  weapon: { dmg: 7 }
};

const AFFIXES = [
  { name: "of Embers",   add: { dmg: 2 },         tint: "#ff7a2f" },
  { name: "of Tides",    add: { hp: 10 },         tint: "#4fd0ff" },
  { name: "of Haste",    add: { move: 18 },       tint: "#38d9ff" },
  { name: "of Kings",    add: { hp: 18, dmg: 1 }, tint: "#ffd28a" },
  { name: "of Echoes",   add: { dmg: 3 },         tint: "#c56bff" },
];

function rollRarity(rng, bonus = 0) {
  const r = rng.float() - bonus;
  if (r < 0.02) return "legendary";
  if (r < 0.08) return "epic";
  if (r < 0.26) return "rare";
  if (r < 0.55) return "uncommon";
  return "common";
}

function rarityMult(r) {
  if (r === "legendary") return 2.0;
  if (r === "epic") return 1.55;
  if (r === "rare") return 1.25;
  if (r === "uncommon") return 1.1;
  return 1.0;
}

function makeGear(rng, slot, tier) {
  const rar = rollRarity(rng, clamp((tier - 1) * 0.03, 0, 0.25));
  const base = GEAR_BASE[slot] || {};
  const a = rng.pick(AFFIXES);
  const stats = {};
  for (const [k, v] of Object.entries(base)) stats[k] = Math.round(v * rarityMult(rar));
  for (const [k, v] of Object.entries(a.add)) stats[k] = (stats[k] || 0) + Math.round(v * rarityMult(rar));

  const name = `${slot.toUpperCase()} ${a.name}`;
  return {
    id: `g_${rng.nextU32().toString(16)}`,
    kind: "gear",
    slot,
    rarity: rar,
    name,
    stats,
    tint: a.tint
  };
}

function salvageYield(item) {
  const r = item.rarity || "common";
  const mult = rarityMult(r);
  return {
    iron: Math.round(2 * mult),
    leather: Math.round(1 * mult),
    essence: r === "rare" || r === "epic" || r === "legendary" ? Math.max(1, Math.round(mult)) : 0
  };
}

/* =========================
   GAME
========================= */
export default class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.input = new Input(canvas);
    this.ui = new UI();

    this.world = new World(canvas.width, canvas.height);

    this.rng = new RNG(13377331);

    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    this.cam = { x: 0, y: 0 };

    this.enemies = [];
    this.seaEnemies = [];
    this.boss = null;

    this.projectiles = [];
    this.enemyProjectiles = [];
    this.loot = [];

    this.menus = { map: false, inventory: false, skills: false, god: false };
    this.god = { invincible: false, oneshot: false, freeman: false };

    this.activeSkill = "FIREBALL";

    this.msg = "";
    this.msgT = 0;

    this._spawnT = 0;
    this._combatT = 0;
  }

  setMsg(s, t = 2.0) { this.msg = s; this.msgT = t; }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.world.viewW = w;
    this.world.viewH = h;
  }

  // ===== save/load =====
  snapshot() {
    return {
      v: 30,
      hero: {
        x: this.hero.x, y: this.hero.y,
        hp: this.hero.hp, mana: this.hero.mana,
        level: this.hero.level, xp: this.hero.xp,
        gold: this.hero.gold,
        base: this.hero.base,
        materials: this.hero.materials,
        inventory: this.hero.inventory,
        equip: this.hero.equip,
        skillXP: this.hero.skillXP,
        skillLvl: this.hero.skillLvl,
      },
      world: { seed: this.world.seed },
    };
  }

  applySnapshot(s) {
    if (!s || !s.hero) return false;
    const h = s.hero;
    this.hero.x = h.x; this.hero.y = h.y;
    this.hero.hp = h.hp; this.hero.mana = h.mana;
    this.hero.level = h.level; this.hero.xp = h.xp;
    this.hero.gold = h.gold;
    this.hero.base = h.base || this.hero.base;
    this.hero.materials = h.materials || this.hero.materials;
    this.hero.inventory = h.inventory || [];
    this.hero.equip = h.equip || this.hero.equip;
    this.hero.skillXP = h.skillXP || this.hero.skillXP;
    this.hero.skillLvl = h.skillLvl || this.hero.skillLvl;
    this.setMsg("Loaded save.", 2.0);
    return true;
  }

  // ===== gameplay =====
  canHeroSail() {
    // can sail only if near dock and near ocean edge (adjacent ocean)
    if (!this.world.isNearDock(this.hero.x, this.hero.y)) return false;
    const T = this.world.terrainAt(this.hero.x, this.hero.y);
    // we are on land; check adjacent for ocean
    const nearOcean =
      this.world.terrainAt(this.hero.x + 140, this.hero.y).ocean ||
      this.world.terrainAt(this.hero.x - 140, this.hero.y).ocean ||
      this.world.terrainAt(this.hero.x, this.hero.y + 140).ocean ||
      this.world.terrainAt(this.hero.x, this.hero.y - 140).ocean;
    return !T.ocean && nearOcean;
  }

  toggleMenu(key) {
    if (key === "map") this.menus.map = !this.menus.map;
    if (key === "inventory") this.menus.inventory = !this.menus.inventory;
    if (key === "skills") this.menus.skills = !this.menus.skills;
    if (key === "god") this.menus.god = !this.menus.god;
  }

  update(dt, t) {
    // message timer
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg = ""; }

    // toggles
    if (this.input.consume("m") || this.input.consume("M")) this.toggleMenu("map");
    if (this.input.consume("i") || this.input.consume("I")) this.toggleMenu("inventory");
    if (this.input.consume("k") || this.input.consume("K")) this.toggleMenu("skills");
    if (this.input.consume("g") || this.input.consume("G")) this.toggleMenu("god");

    // god menu toggles
    if (this.menus.god) {
      if (this.input.consume("1")) { this.god.invincible = !this.god.invincible; this.setMsg(`Invincible: ${this.god.invincible?"ON":"OFF"}`); }
      if (this.input.consume("2")) { this.god.oneshot = !this.god.oneshot; this.setMsg(`One-shot: ${this.god.oneshot?"ON":"OFF"}`); }
      if (this.input.consume("3")) { this.god.freeman = !this.god.freeman; this.setMsg(`Free Mana: ${this.god.freeman?"ON":"OFF"}`); }
      if (this.input.consume("9")) {
        this.boss = new Boss(this.hero.x + 260, this.hero.y - 80, Math.max(6, this.hero.level + 2));
        this.setMsg("Boss spawned.", 2.0);
      }
    }

    // save/load shortcuts
    if ((this.input.getKey("Control") || this.input.getKey("Meta")) && (this.input.consume("s") || this.input.consume("S"))) {
      const ok = saveGameSnapshot(this.snapshot());
      this.setMsg(ok ? "Saved." : "Save failed.", 2.0);
    }
    if ((this.input.getKey("Control") || this.input.getKey("Meta")) && (this.input.consume("l") || this.input.consume("L"))) {
      const snap = loadGameSnapshot();
      this.applySnapshot(snap);
    }

    // Sailing toggle
    const sailHint = this.canHeroSail() && !this.hero.sailing;
    if (this.input.consume("b") || this.input.consume("B")) {
      if (this.hero.sailing) {
        // attempt dock (must be on dock)
        if (this.world.isNearDock(this.hero.x, this.hero.y)) {
          this.hero.sailing = false;
          this.setMsg("Docked.", 1.6);
        } else {
          this.setMsg("You can only dock at a dock.", 1.8);
        }
      } else if (sailHint) {
        this.hero.sailing = true;
        this.setMsg("Sailing...", 1.4);
      }
    }

    // Movement
    const ax = this.input.axis;
    // don't move when map open? (still allow, but feels ok)
    this.hero.update(dt, ax);

    // world collision
    this.world.resolveCircleVsWorld(this.hero, this.hero);

    // regen mana
    if (this.god.freeman) this.hero.mana = this.hero.maxMana;
    else this.hero.mana = clamp(this.hero.mana + dt * 6, 0, this.hero.maxMana);

    // Skill cast: A (uses lastDir)
    if (this.input.consume("a") || this.input.consume("A")) {
      this.castFireball();
    }

    // update entities
    for (const e of this.enemies) e.update(dt, this.hero);
    if (this.boss?.alive) this.boss.update(dt, this.hero);

    // enemy melee damage
    if (!this.god.invincible) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.canHit(this.hero)) {
          // slow tick
          e.atkT += dt;
          if (e.atkT > 0.9) {
            e.atkT = 0;
            this.hero.takeDamage(Math.max(1, e.dmg - this.hero.computeStats().armor));
          }
        }
      }
      if (this.boss?.alive && this.boss.canHit(this.hero)) {
        this.boss.atkT += dt;
        if (this.boss.atkT > 0.85) {
          this.boss.atkT = 0;
          this.hero.takeDamage(Math.max(2, this.boss.dmg - this.hero.computeStats().armor));
        }
      }
    }

    // projectiles
    for (const p of this.projectiles) {
      p.update(dt);
      if (p.dead) continue;
      if (this.world.projectileHitsSolid(p)) p.dead = true;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (p.hitsCircle(e.x, e.y, e.r)) {
          p.dead = true;
          const dmg = this.god.oneshot ? 9999 : (p.dmg + Math.floor(this.hero.computeStats().dmg * 0.55));
          e.takeDamage(dmg);
          if (!e.alive) this.onEnemyKilled(e);
          break;
        }
      }
      if (this.boss?.alive && !p.dead && p.hitsCircle(this.boss.x, this.boss.y, this.boss.r)) {
        p.dead = true;
        const dmg = this.god.oneshot ? 99999 : (p.dmg + Math.floor(this.hero.computeStats().dmg * 0.45));
        this.boss.takeDamage(dmg);
        if (!this.boss.alive) this.onBossKilled(this.boss);
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const p of this.enemyProjectiles) p.update(dt);
    this.enemyProjectiles = this.enemyProjectiles.filter(p => !p.dead);

    // loot update + pickup
    for (const L of this.loot) L.update(dt);
    for (const L of this.loot) {
      if (L.dead) continue;
      if (L.intersectsCircle(this.hero.x, this.hero.y, this.hero.r + 10)) {
        L.dead = true;
        const it = L.item;
        if (it.kind === "gold") this.hero.gold += it.amount;
        else if (it.kind === "mat") this.hero.materials[it.type] += it.amount;
        else this.hero.inventory.push(it);
      }
    }
    this.loot = this.loot.filter(l => !l.dead);

    // spawns
    this._spawnT += dt;
    if (this._spawnT > 1.0) {
      this._spawnT = 0;
      this.spawnEnemies();
    }

    // camera
    this.cam.x = clamp(this.hero.x - this.canvas.width / 2, 0, this.world.width - this.canvas.width);
    this.cam.y = clamp(this.hero.y - this.canvas.height / 2, 0, this.world.height - this.canvas.height);

    // end
    this.input.step();

    // death
    if (this.hero.hp <= 0) {
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this.hero.x = this.world.spawn.x;
      this.hero.y = this.world.spawn.y;
      this.setMsg("You were defeated. Respawned at the Starter Waystone.", 3.0);
    }

    this._hints = { sail: sailHint };
  }

  castFireball() {
    const lvl = this.hero.skillLvl.fireball || 1;
    const cost = 10 + Math.floor(lvl * 1.2);
    if (!this.god.freeman && !this.hero.spendMana(cost)) {
      this.setMsg("Not enough mana.", 1.4);
      return;
    }
    const dx = this.hero.lastDir.x, dy = this.hero.lastDir.y;
    const spd = 520 + lvl * 30;
    const dmg = 14 + lvl * 4;

    const p = new Projectile(
      this.hero.x + dx * (this.hero.r + 10),
      this.hero.y + dy * (this.hero.r + 10),
      dx * spd,
      dy * spd,
      dmg,
      1.7
    );
    this.projectiles.push(p);

    // skill XP
    this.hero.skillXP.fireball = (this.hero.skillXP.fireball || 0) + 1;
    const need = 20 + (this.hero.skillLvl.fireball || 1) * 18;
    if (this.hero.skillXP.fireball >= need) {
      this.hero.skillXP.fireball = 0;
      this.hero.skillLvl.fireball = (this.hero.skillLvl.fireball || 1) + 1;
      this.setMsg(`Fireball leveled up! Lv ${this.hero.skillLvl.fireball}`, 2.0);
    }
  }

  spawnEnemies() {
    // keep some enemies around player, avoid ocean/river
    const max = 16;
    if (this.enemies.filter(e => e.alive).length >= max) return;

    // spawn ring
    for (let tries = 0; tries < 6; tries++) {
      const ang = this.rng.float() * Math.PI * 2;
      const rad = 360 + this.rng.float() * 520;
      const x = this.hero.x + Math.cos(ang) * rad;
      const y = this.hero.y + Math.sin(ang) * rad;

      const T = this.world.terrainAt(x, y);
      if (T.ocean) continue;
      if (this.world.isInRiver(x, y) && !this.world.isOnAnyBridge(x, y)) continue;

      const tier = Math.max(1, Math.min(10, Math.floor(this.hero.level * (0.7 + this.rng.float() * 0.9))));
      const type = this.rng.float() < 0.18 ? "charger" : (this.rng.float() < 0.10 ? "shaman" : "grunt");
      const e = new Enemy(x, y, tier, type, this.rng);
      this.enemies.push(e);
      break;
    }
  }

  onEnemyKilled(e) {
    const tier = e.tier || 1;
    const xp = 10 + tier * 8;
    this.hero.gainXP(xp);

    // drops
    const dropRoll = this.rng.float();
    if (dropRoll < 0.55) {
      // gold
      const amt = 6 + tier * 3 + this.rng.int(0, 10);
      this.loot.push(new Loot(e.x, e.y, { kind: "gold", amount: amt, name: `${amt}g`, rarity: "common" }));
    } else if (dropRoll < 0.80) {
      // mats
      const type = this.rng.pick(["iron","leather","essence"]);
      const amt = type === "essence" ? 1 : 2 + this.rng.int(0, 2);
      this.loot.push(new Loot(e.x, e.y, { kind: "mat", type, amount: amt, name: `${type} x${amt}`, rarity: "uncommon" }));
    } else {
      // gear
      const slot = this.rng.pick(["helm","chest","boots","ring","weapon"]);
      const gear = makeGear(this.rng, slot, tier);
      this.loot.push(new Loot(e.x, e.y, gear));
    }
  }

  onBossKilled(b) {
    this.hero.gainXP(250 + b.tier * 80);
    this.hero.gold += 250 + b.tier * 40;
    // guaranteed epic/legendary gear
    const slot = this.rng.pick(["helm","chest","boots","ring","weapon"]);
    const gear = makeGear(this.rng, slot, b.tier + 3);
    gear.rarity = this.rng.float() < 0.25 ? "legendary" : "epic";
    this.loot.push(new Loot(b.x, b.y, gear));
    this.setMsg("Boss defeated! Loot dropped.", 2.4);
  }

  draw(t) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // background sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, "#0b1330");
    g.addColorStop(0.55, "#14305a");
    g.addColorStop(1, "#1a3b2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);

    this.world.draw(ctx, t, { x: this.cam.x, y: this.cam.y, w: this.canvas.width, h: this.canvas.height });

    // entities
    for (const L of this.loot) L.draw(ctx, t);
    for (const e of this.enemies) e.draw(ctx, t);
    if (this.boss?.alive) this.boss.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);
    for (const p of this.enemyProjectiles) p.draw(ctx, t);
    this.hero.draw(ctx, t);

    ctx.restore();

    // horizon haze overlay (screen-space)
    ctx.save();
    const haze = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    haze.addColorStop(0, "rgba(210,230,255,0.22)");
    haze.addColorStop(0.25, "rgba(210,230,255,0.08)");
    haze.addColorStop(0.85, "rgba(210,230,255,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    const vm = {
      hero: this.hero,
      stats: this.hero.computeStats(),
      world: this.world,
      cam: this.cam,
      menus: this.menus,
      god: this.god,
      msg: this.msg,
      activeSkill: this.activeSkill,
      hints: this._hints || { sail: false },
    };
    this.ui.draw(ctx, vm);
  }
}
