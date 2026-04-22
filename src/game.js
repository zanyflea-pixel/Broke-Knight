// src/game.js
// v106.3 FULL GAME FILE
// - arrow-only movement
// - fuller gameplay loop
// - inventory / equip / salvage
// - skills / cooldowns / mouse aim
// - shop / waystone / dock / dungeon interactions
// - zone messages / autosave / loot pickup / enemy spawning
// - safe-ground recovery
// - built to work with current world.js / entities.js / ui.js / util.js / save.js

import World from "./world.js";
import { clamp, dist2, norm, RNG, hash2 } from "./util.js";
import { Hero, Enemy, Projectile, Loot, makeGear } from "./entities.js";
import Input from "./input.js";
import UI from "./ui.js";
import Save from "./save.js";

export default class Game {
  constructor(canvas) {
    if (!canvas) throw new Error("Game: canvas is required");

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

    this.w = canvas.width | 0;
    this.h = canvas.height | 0;

    this.seed = (Date.now() & 0x7fffffff) | 0;

    this.input = new Input(window);
    this.ui = new UI(canvas);
    this.save = new Save("broke-knight-save-v106");

    this.world = new World(this.seed, { viewW: this.w, viewH: this.h });
    this.hero = new Hero(this.world.spawn?.x ?? 0, this.world.spawn?.y ?? 0);

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.hitSparks = [];
    this.floatingTexts = [];

    this.camera = {
      x: this.hero.x,
      y: this.hero.y,
      zoom: 1,
      shakeT: 0,
      shakeMag: 0,
      sx: 0,
      sy: 0,
    };

    this.perf = {
      enemyUpdateRadius: 1040,
      lootUpdateRadius: 760,
      projectileUpdateRadius: 1320,
      maxEnemies: 46,
      cleanupTimer: 0,
      cleanupEvery: 0.55,
      touchDamageTick: 0.18,
      spawnMinDistance: 700,
      spawnMaxDistance: 1250,
      worldSpawnSafeRadius: 760,
      campSafeRadius: 180,
    };

    this.time = 0;
    this._dtClamp = 0.05;
    this._autosaveT = 8;
    this._spawnTimer = 0;
    this._campRespawnT = 0;
    this._nearbyPoiTimer = 0;
    this._zoneSampleT = 0;
    this._safetyCheckT = 0;

    this.menu = { open: null };
    this.invIndex = 0;

    this.msg = "";
    this.msgT = 0;
    this.zoneMsg = "";
    this.zoneMsgT = 0;

    this._touchDamageCd = 0;
    this._dockToggleCd = 0;
    this._interactCd = 0;
    this._lastZoneName = "";
    this._killFlashT = 0;
    this._deathCd = 0;

    this._cachedNearbyCamp = null;
    this._cachedNearbyDock = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyDungeon = null;
    this._cachedNearbyShrine = null;
    this._cachedNearbyCache = null;
    this._cachedNearbyDragonLair = null;

    this._rng = new RNG(hash2(this.seed, 9001));

    this.mouse = {
      x: this.w * 0.5,
      y: this.h * 0.5,
      worldX: this.hero.x,
      worldY: this.hero.y,
      down: false,
    };

    this.skillDefs = {
      q: { key: "q", name: "Spark", mana: 8, cd: 0.22, color: "#8be9ff" },
      w: { key: "w", name: "Nova", mana: 18, cd: 1.8, color: "#d6f5ff" },
      e: { key: "e", name: "Dash", mana: 14, cd: 2.8, color: "#ffd36e" },
      r: { key: "r", name: "Orb", mana: 22, cd: 3.4, color: "#c08cff" },
    };

    this.cooldowns = { q: 0, w: 0, e: 0, r: 0 };

    this.skillProg = {
      q: { xp: 0, level: 1 },
      w: { xp: 0, level: 1 },
      e: { xp: 0, level: 1 },
      r: { xp: 0, level: 1 },
    };

    this.progress = {
      discoveredWaystones: new Set(),
      discoveredDocks: new Set(),
      dungeonBest: 0,
      visitedCamps: new Set(),
      eliteKills: 0,
      bountyCompletions: 0,
      campRenown: {},
      campRestBonusClaimed: {},
      claimedShrines: new Set(),
      openedCaches: new Set(),
      defeatedDragons: new Set(),
      relicShards: 0,
      storyMilestones: {},
    };

    this.shop = {
      campId: null,
      items: [],
      discount: 0,
    };

    this.dungeon = {
      active: false,
      floor: 0,
      origin: null,
    };

    this.dev = {
      godMode: false,
    };

    this.quest = this._makeBountyQuest();

    this._bindMouse();
    this._loadGame();

    if (!this.hero.inventory) this.hero.inventory = [];
    if (!this.hero.equip) this.hero.equip = {};
    if (!this.hero.potions) this.hero.potions = { hp: 2, mana: 1 };
    if (!this.hero.lastMove) this.hero.lastMove = { x: 1, y: 0 };
    if (!this.hero.aimDir) this.hero.aimDir = { x: 1, y: 0 };
    if (!this.hero.state) {
      this.hero.state = {
        sailing: false,
        dashT: 0,
        hurtT: 0,
        slowT: 0,
        poisonT: 0,
      };
    }

    this.hero.state.sailing = false;
    this.hero.state.dashT = 0;
    this.hero.state.hurtT = 0;
    this.hero.state.slowT = 0;
    this.hero.state.poisonT = 0;

    this._spawnInitialEnemies();
    this._ensureHeroSafe(true);
    this.world?.revealAround?.(this.hero.x, this.hero.y, 900);
    if (this._worldBuildMigrated) this._saveGame();
  }

  resize(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this.world?.setViewSize?.(this.w, this.h);
    this.ui?.setViewSize?.(this.w, this.h);
  }

  update(dt) {
    dt = Math.min(this._dtClamp, Math.max(0, dt || 0));
    this.time += dt;

    this._tickMessages(dt);
    this._tickCooldowns(dt);
    this._updateMouseWorld();
    this.world?.revealAround?.(this.hero.x, this.hero.y, this.dungeon.active ? 460 : 720);
    this._updateNearbyPOIs(dt);

    this._handleMenus();

    if (this.menu.open === "inventory") {
      this._handleInventoryInput();
    } else if (this.menu.open === "shop") {
      this._handleShopInput();
    } else if (this.menu.open === "dev") {
      // Dev keys are handled in _handleMenus.
    } else {
      this._handleMovement(dt);
      this._handleSkills();
    }

    this._handleInteractShortcuts(dt);

    this.hero.update?.(dt);
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    this._handleHeroDeath(dt);
    this._updateLoot(dt);
    this._updateZoneMessage(dt);
    this._updateCamera(dt);
    this.ui.update?.(dt, this);
    this._spawnWorldEnemies(dt);
    this._respawnCampEnemies(dt);
    this._cleanupFarEntities(dt);

    this._safetyCheckT -= dt;
    if (this._safetyCheckT <= 0) {
      this._safetyCheckT = 0.4;
      this._ensureHeroSafe(false);
    }

    this._autosaveT -= dt;
    if (this._autosaveT <= 0) {
      this._autosaveT = 8;
      this._saveGame();
    }

    this.input.endFrame();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.w, this.h);

    if (this._killFlashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.06 * this._killFlashT})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this._killFlashT = Math.max(0, this._killFlashT - 0.04);
    }

    ctx.save();
    ctx.translate(
      this.w * 0.5 - this.camera.x + this.camera.sx,
      this.h * 0.5 - this.camera.y + this.camera.sy
    );

    this.world.draw(ctx, this.camera, this.hero);

    for (const l of this.loot) {
      if (l?.alive) l.draw(ctx);
    }

    for (const p of this.projectiles) {
      if (p?.alive) p.draw(ctx);
    }

    for (const e of this.enemies) {
      if (e?.alive) e.draw(ctx);
    }

    this.hero.draw(ctx);
    this._drawFloatingTexts(ctx);

    ctx.restore();

    this._drawScreenEffects(ctx);
    this.ui.draw(ctx, this);
  }

  _drawScreenEffects(ctx) {
    ctx.save();

    const hpFrac = clamp((this.hero.hp || 0) / Math.max(1, this.hero.maxHp || 100), 0, 1);
    if (hpFrac < 0.32 && !this.dev?.godMode) {
      ctx.fillStyle = `rgba(120, 10, 24, ${(0.32 - hpFrac) * 0.34})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const grd = ctx.createRadialGradient(this.w * 0.5, this.h * 0.48, Math.min(this.w, this.h) * 0.18, this.w * 0.5, this.h * 0.5, Math.max(this.w, this.h) * 0.62);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(1, this.dev?.godMode ? "rgba(120,190,255,0.12)" : "rgba(0,0,0,0.22)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.restore();
  }

  _bindMouse() {
    const onMove = (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = (ev.clientX - rect.left) * (this.w / rect.width);
      const sy = (ev.clientY - rect.top) * (this.h / rect.height);
      this.mouse.x = sx;
      this.mouse.y = sy;
    };

    this.canvas.addEventListener("mousemove", onMove);
    this.canvas.addEventListener("mousedown", (ev) => {
      this.mouse.down = true;
      onMove(ev);
    });
    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
  }

  _updateMouseWorld() {
    this.mouse.worldX = this.mouse.x - this.w * 0.5 + this.camera.x;
    this.mouse.worldY = this.mouse.y - this.h * 0.5 + this.camera.y;

    const dx = this.mouse.worldX - this.hero.x;
    const dy = this.mouse.worldY - this.hero.y;
    const a = norm(dx, dy);
    this.hero.aimDir.x = a.x;
    this.hero.aimDir.y = a.y;
  }

  _tickMessages(dt) {
    this.msgT = Math.max(0, this.msgT - dt);
    if (this.msgT <= 0) this.msg = "";

    this.zoneMsgT = Math.max(0, this.zoneMsgT - dt);
    if (this.zoneMsgT <= 0) this.zoneMsg = "";
  }

  _tickCooldowns(dt) {
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
  }

  _handleMenus() {
    if (this.input.wasPressed("m") || this.input.wasPressed("M")) {
      this.menu.open = this.menu.open === "map" ? null : "map";
    }

    if (this.input.wasPressed("i") || this.input.wasPressed("I")) {
      this.menu.open = this.menu.open === "inventory" ? null : "inventory";
      this.invIndex = clamp(this.invIndex || 0, 0, Math.max(0, (this.hero.inventory?.length || 1) - 1));
    }

    if (this.input.wasPressed("k") || this.input.wasPressed("K")) {
      this.menu.open = this.menu.open === "skills" ? null : "skills";
    }

    if (this.input.wasPressed("j") || this.input.wasPressed("J")) {
      this.menu.open = this.menu.open === "quests" ? null : "quests";
    }

    if (this.input.wasPressed("g") || this.input.wasPressed("G")) {
      this.menu.open = this.menu.open === "dev" ? null : "dev";
    }

    if (this.input.wasPressed("Escape")) {
      if (this.menu.open) {
        this.menu.open = null;
      } else if (this.dungeon.active) {
        this._leaveDungeon();
      }
    }

    if (this.menu.open === "dev") this._handleDevToolsInput();
  }

  _handleDevToolsInput() {
    if (this.input.wasPressed("1")) {
      this.hero.hp = this.hero.maxHp || 100;
      this.hero.mana = this.hero.maxMana || 60;
      this._msg("Dev: healed", 0.9);
    }
    if (this.input.wasPressed("2")) {
      this.hero.gold += 250;
      this._msg("Dev: +250 gold", 0.9);
    }
    if (this.input.wasPressed("3")) {
      this.hero.giveXP?.(this.hero.nextXp || 25);
      this._msg("Dev: level boost", 0.9);
    }
    if (this.input.wasPressed("4")) {
      this.world.revealAll?.();
      this._msg("Dev: map revealed", 0.9);
    }
    if (this.input.wasPressed("5")) {
      this._spawnDragonBoss(this.hero.x + 220, this.hero.y, Math.max(6, (this.hero.level || 1) + 4), "Dev Dragon");
      this._msg("Dev: dragon spawned", 0.9);
    }
    if (this.input.wasPressed("6")) {
      const lair = this._nearest(this.world.dragonLairs);
      if (lair) {
        this.hero.x = lair.x - 120;
        this.hero.y = lair.y;
        this.camera.x = this.hero.x;
        this.camera.y = this.hero.y;
        this._msg("Dev: nearest dragon lair", 0.9);
      }
    }
    if (this.input.wasPressed("7")) {
      this.dev.godMode = !this.dev.godMode;
      if (this.dev.godMode) {
        this.hero.hp = this.hero.maxHp || 100;
        this.hero.mana = this.hero.maxMana || 60;
      }
      this._msg(this.dev.godMode ? "Dev: god mode ON" : "Dev: god mode OFF", 1.1);
    }
  }

  _handleMovement(dt) {
    let mx = 0;
    let my = 0;

    if (this.input.isDown("ArrowUp")) my -= 1;
    if (this.input.isDown("ArrowDown")) my += 1;
    if (this.input.isDown("ArrowLeft")) mx -= 1;
    if (this.input.isDown("ArrowRight")) mx += 1;

    const move = norm(mx, my);
    const speed = this.hero.getMoveSpeed(this);

    this.hero.vx = move.x * speed;
    this.hero.vy = move.y * speed;

    const nx = this.hero.x + this.hero.vx * dt;
    const ny = this.hero.y + this.hero.vy * dt;

    if (this.world.canWalk(nx, this.hero.y, this.hero)) this.hero.x = nx;
    if (this.world.canWalk(this.hero.x, ny, this.hero)) this.hero.y = ny;
  }

  _handleSkills() {
    if (this.input.wasPressed("1")) this._usePotion("hp");
    if (this.input.wasPressed("2")) this._usePotion("mana");

    if (this.input.wasPressed("q") || this.input.wasPressed("Q")) this._castSpark();
    if (this.input.wasPressed("w") || this.input.wasPressed("W")) this._castNova();
    if (this.input.wasPressed("e") || this.input.wasPressed("E")) this._castDash();
    if (this.input.wasPressed("r") || this.input.wasPressed("R")) this._castOrb();

    if (this.mouse.down) this._castSpark();
  }

  _handleInteractShortcuts(dt) {
    this._dockToggleCd = Math.max(0, this._dockToggleCd - dt);
    this._interactCd = Math.max(0, this._interactCd - dt);

    if ((this.input.wasPressed("b") || this.input.wasPressed("B")) && this._dockToggleCd <= 0 && !this.menu.open) {
      this._dockToggleCd = 0.18;
      this._toggleDockingOrSailing();
    }

    if ((this.input.wasPressed("f") || this.input.wasPressed("F")) && this._interactCd <= 0 && !this.menu.open) {
      this._interactCd = 0.18;
      this._interact();
    }
  }

  _handleInventoryInput() {
    const inv = this.hero.inventory || [];
    if (inv.length <= 0) {
      this.invIndex = 0;
      return;
    }

    if (this.input.wasPressed("ArrowDown")) {
      this.invIndex = Math.min(inv.length - 1, (this.invIndex || 0) + 1);
    }

    if (this.input.wasPressed("ArrowUp")) {
      this.invIndex = Math.max(0, (this.invIndex || 0) - 1);
    }

    const item = inv[this.invIndex];

    if ((this.input.wasPressed("Enter") || this.input.wasPressed("e") || this.input.wasPressed("E")) && item) {
      this._equipInventoryItem(this.invIndex);
    }

    if ((this.input.wasPressed("x") || this.input.wasPressed("X") || this.input.wasPressed("Backspace") || this.input.wasPressed("Delete")) && item) {
      this._salvageInventoryItem(this.invIndex);
    }
  }

  _equipInventoryItem(index) {
    const inv = this.hero.inventory || [];
    const item = inv[index];
    if (!item?.slot) return;

    const prev = this.hero.equip?.[item.slot] || null;
    this.hero.equip[item.slot] = item;
    inv.splice(index, 1);
    if (prev) inv.push(prev);

    this.invIndex = clamp(index, 0, Math.max(0, inv.length - 1));
    this._msg(`Equipped ${item.name}`, 1.6);
  }

  _salvageInventoryItem(index) {
    const inv = this.hero.inventory || [];
    const item = inv[index];
    if (!item) return;

    const rarityBonus =
      item.rarity === "epic" ? 28 :
      item.rarity === "rare" ? 14 :
      item.rarity === "uncommon" ? 7 : 0;

    const value = Math.max(4, 6 + (item.level || 1) * 3 + rarityBonus);
    this.hero.gold += value;
    inv.splice(index, 1);

    this.invIndex = clamp(index, 0, Math.max(0, inv.length - 1));
    this._msg(`Salvaged for ${value}g`, 1.4);
  }

  _handleShopInput() {
    if (this.input.wasPressed("1")) this._buyShopItem(0);
    if (this.input.wasPressed("2")) this._buyShopItem(1);
    if (this.input.wasPressed("3")) this._buyShopItem(2);
    if (this.input.wasPressed("4")) this._buyShopItem(3);
  }

  _usePotion(kind) {
    if (!this.hero?.potions) return false;
    if ((this.hero.potions[kind] || 0) <= 0) return false;

    if (kind === "hp") {
      if ((this.hero.hp || 0) >= (this.hero.maxHp || 1)) return false;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 38);
      this.hero.potions.hp -= 1;
      this._msg("Health potion", 1.1);
      return true;
    }

    if (kind === "mana") {
      if ((this.hero.mana || 0) >= (this.hero.maxMana || 1)) return false;
      this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + 30);
      this.hero.potions.mana -= 1;
      this._msg("Mana potion", 1.1);
      return true;
    }

    return false;
  }

  _castSpark() {
    if (this.cooldowns.q > 0) return;
    const def = this.skillDefs.q;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.q = def.cd;

    const dir = norm(this.hero.aimDir?.x || 1, this.hero.aimDir?.y || 0);
    const hit = this._rollHeroDamage(0.95);

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 18,
        this.hero.y + dir.y * 18,
        dir.x * 270,
        dir.y * 270,
        hit.dmg,
        1.25,
        this.hero.level,
        { friendly: true, color: "rgba(148,225,255,0.95)", radius: 4, hitRadius: 15 }
      )
    );
    this.projectiles[this.projectiles.length - 1].crit = hit.crit;

    this.skillProg.q.xp += 1;
    this._checkSkillLevel("q");
  }

  _castNova() {
    if (this.cooldowns.w > 0) return;
    const def = this.skillDefs.w;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.w = def.cd;

    const hit = this._rollHeroDamage(1.1);

    this.projectiles.push(
      new Projectile(
        this.hero.x,
        this.hero.y,
        0,
        0,
        hit.dmg,
        0.45,
        this.hero.level,
        {
          friendly: true,
          nova: true,
          color: "rgba(214,245,255,0.92)",
          radius: 14,
          hitRadius: 86,
          ignoreWalls: true,
        }
      )
    );
    this.projectiles[this.projectiles.length - 1].crit = hit.crit;

    this.skillProg.w.xp += 2;
    this._checkSkillLevel("w");
  }

  _castDash() {
    if (this.cooldowns.e > 0) return;
    const def = this.skillDefs.e;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.e = def.cd;

    const dir = norm(
      this.hero.aimDir?.x || this.hero.lastMove?.x || 1,
      this.hero.aimDir?.y || this.hero.lastMove?.y || 0
    );

    const dashDist = 54;
    const tx = this.hero.x + dir.x * dashDist;
    const ty = this.hero.y + dir.y * dashDist;

    if (this.world.canWalk(tx, ty, this.hero)) {
      this.hero.x = tx;
      this.hero.y = ty;
    }

    this.hero.state.dashT = 0.20;
    this.skillProg.e.xp += 2;
    this._checkSkillLevel("e");
  }

  _castOrb() {
    if (this.cooldowns.r > 0) return;
    const def = this.skillDefs.r;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.r = def.cd;

    const dir = norm(this.hero.aimDir?.x || 1, this.hero.aimDir?.y || 0);
    const hit = this._rollHeroDamage(1.65);

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 22,
        this.hero.y + dir.y * 22,
        dir.x * 175,
        dir.y * 175,
        hit.dmg,
        1.7,
        this.hero.level,
        { friendly: true, color: "rgba(198,140,255,0.95)", radius: 8, hitRadius: 20 }
      )
    );
    this.projectiles[this.projectiles.length - 1].crit = hit.crit;

    this.skillProg.r.xp += 3;
    this._checkSkillLevel("r");
  }

  _rollHeroDamage(mult = 1) {
    const stats = this.hero.getStats?.() || {};
    const crit = Math.random() < clamp(stats.crit || 0.05, 0, 0.85);
    const critMult = crit ? Math.max(1.1, stats.critMult || 1.6) : 1;
    return {
      dmg: Math.max(1, Math.round((stats.dmg || 8) * mult * critMult)),
      crit,
    };
  }

  _checkSkillLevel(key) {
    const s = this.skillProg[key];
    if (!s) return;
    const need = 10 + (s.level - 1) * 8;
    if (s.xp >= need) {
      s.xp -= need;
      s.level += 1;
      this._msg(`${this.skillDefs[key].name} Lv ${s.level}`, 1.2);
    }
  }

  _spawnInitialEnemies() {
    const pool = ["blob", "wolf", "stalker", "scout", "caster", "brute"];
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      const rr = 700 + (i % 5) * 110;
      const x = this.hero.x + Math.cos(ang) * rr;
      const y = this.hero.y + Math.sin(ang) * rr;

      if (!this.world.canWalk(x, y)) continue;

      const kind = pool[i % pool.length];
      const enemy = new Enemy(x, y, Math.max(1, this.hero.level), kind, hash2(x | 0, y | 0, this.seed), false, false);
      this.enemies.push(enemy);
    }
  }

  _pickEnemyKind(zone) {
    const z = String(zone || "").toLowerCase();
    if (z.includes("dungeon")) {
      const pool = ["stalker", "caster", "brute", "ashling", "wolf"];
      return pool[Math.floor(Math.random() * pool.length)] || "stalker";
    }
    if (z.includes("wild")) return Math.random() < 0.5 ? "wolf" : "stalker";
    if (z.includes("stone")) return Math.random() < 0.5 ? "brute" : "blob";
    if (z.includes("ash")) return Math.random() < 0.5 ? "ashling" : "brute";
    if (z.includes("shore")) return Math.random() < 0.5 ? "scout" : "caster";
    if (z.includes("forest")) return Math.random() < 0.5 ? "wolf" : "scout";

    const pool = ["blob", "wolf", "stalker", "scout", "caster", "brute"];
    return pool[(Math.random() * pool.length) | 0];
  }

  _spawnWorldEnemies(dt) {
    this._spawnTimer -= dt;
    if (this._spawnTimer > 0) return;
    this._spawnTimer = 0.35;

    if (this.enemies.length >= this.perf.maxEnemies) return;

    const heroX = this.hero.x;
    const heroY = this.hero.y;

    let tries = 0;
    while (tries++ < 8 && this.enemies.length < this.perf.maxEnemies) {
      const ang = Math.random() * Math.PI * 2;
      const dist = this.perf.spawnMinDistance + Math.random() * (this.perf.spawnMaxDistance - this.perf.spawnMinDistance);
      const x = heroX + Math.cos(ang) * dist;
      const y = heroY + Math.sin(ang) * dist;

      if (!this.world.canWalk?.(x, y)) continue;
      if (dist2(x, y, this.world.spawn?.x || 0, this.world.spawn?.y || 0) < this.perf.worldSpawnSafeRadius ** 2) continue;
      if (this._nearPointOfInterest(x, y, this.perf.campSafeRadius)) continue;

      const zone = this.dungeon.active ? "dungeon" : (this.world.getZoneName?.(x, y) || "meadow");
      const kind = this._pickEnemyKind(zone);
      const elite = Math.random() < (this.dungeon.active ? 0.16 : 0.08);
      const areaLevel = this.world.getDangerLevel?.(x, y) || 1;
      const level = Math.max(1, this.hero.level + areaLevel - 1 + (this.dungeon.active ? Math.max(0, this.dungeon.floor - 1) : 0));

      const e = new Enemy(
        x,
        y,
        level,
        kind,
        hash2(x | 0, y | 0, this.seed),
        elite,
        false
      );
      this._applyEnemyAffix(e);

      this.enemies.push(e);
      break;
    }
  }

  _respawnCampEnemies(dt) {
    this._campRespawnT -= dt;
    if (this._campRespawnT > 0) return;
    this._campRespawnT = 12;

    for (const camp of this.world.camps || []) {
      if (dist2(this.hero.x, this.hero.y, camp.x, camp.y) < 440 * 440) continue;

      const nearCount = this.enemies.filter(
        (e) => e?.alive && dist2(e.x, e.y, camp.x, camp.y) < 220 * 220
      ).length;

      if (nearCount >= 2) continue;

      const kinds = ["blob", "scout", "wolf"];
      const kind = kinds[(Math.random() * kinds.length) | 0];
      const ang = Math.random() * Math.PI * 2;
      const rr = 120 + Math.random() * 70;
      const x = camp.x + Math.cos(ang) * rr;
      const y = camp.y + Math.sin(ang) * rr;

      if (!this.world.canWalk?.(x, y)) continue;

      this.enemies.push(
        new Enemy(x, y, Math.max(1, this.hero.level), kind, hash2(x | 0, y | 0, this.seed), false, false)
      );
    }
  }

  _applyEnemyAffix(e) {
    if (!e?.elite && !e?.boss) return e;

    const affixes = [
      { name: "Ironhide", color: "#d6c48a", hp: 1.22, speed: 0.92, touch: 1.08 },
      { name: "Bloodbound", color: "#ff6f86", hp: 1.10, speed: 1.08, touch: 1.18 },
      { name: "Stormmarked", color: "#87d8ff", hp: 1.04, speed: 1.20, touch: 1.04 },
      { name: "Gilded", color: "#ffd76a", hp: 1.14, speed: 1.00, touch: 1.10, loot: 6 },
    ];
    const affix = affixes[Math.abs(e.seed || 0) % affixes.length];

    e.affix = affix.name;
    e.colorA = affix.color;
    e.hp = Math.round(e.hp * affix.hp);
    e.maxHp = e.hp;
    e.moveSpeed = Math.max(16, Math.round(e.moveSpeed * affix.speed));
    e.speed = e.moveSpeed;
    e.touchDps = Math.max(1, Math.round(e.touchDps * affix.touch));
    e.extraLoot = affix.loot || 0;
    return e;
  }

  _updateEnemies(dt) {
    this._touchDamageCd = Math.max(0, this._touchDamageCd - dt);

    for (const e of this.enemies) {
      if (!e?.alive) continue;
      e.update?.(dt, this.hero, this.world, this);

      const rr = (this.hero.radius || this.hero.r || 12) + (e.radius || e.r || 12);
      if (dist2(this.hero.x, this.hero.y, e.x, e.y) <= rr * rr) {
        if (this._touchDamageCd <= 0) {
          this._damageHero(e.touchDps || 1);
          this._touchDamageCd = this.perf.touchDamageTick;
        }
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive);
  }

  _handleHeroDeath(dt) {
    this._deathCd = Math.max(0, (this._deathCd || 0) - dt);
    if (this.dev?.godMode && (this.hero.hp || 0) <= 0) {
      this.hero.hp = this.hero.maxHp || 100;
      this.hero.mana = this.hero.maxMana || 60;
      return;
    }
    if ((this.hero.hp || 0) > 0 || this._deathCd > 0) return;

    this._deathCd = 2.5;
    const lostGold = Math.min(this.hero.gold || 0, Math.max(0, Math.floor((this.hero.gold || 0) * 0.12)));
    this.hero.gold -= lostGold;

    const safe = this.world._findSafeLandPatchNear?.(this.world.spawn?.x || 0, this.world.spawn?.y || 0, 340) ||
      this.world.spawn ||
      { x: 0, y: 0 };

    this.hero.x = safe.x;
    this.hero.y = safe.y;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.hp = Math.max(1, Math.round((this.hero.maxHp || 100) * 0.55));
    this.hero.mana = Math.round((this.hero.maxMana || 60) * 0.55);
    this.hero.state.sailing = false;
    this.hero.state.dashT = 0;
    this.hero.state.hurtT = 0.6;
    this.dungeon.active = false;
    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;

    this._msg(lostGold > 0 ? `Recovered at camp -${lostGold}g` : "Recovered at camp", 1.8);
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p?.alive) continue;

      p.update?.(dt, this.world);
      if (!p.alive) continue;

      if (p.friendly) {
        if (p.nova && !p._hitEnemies) p._hitEnemies = new Set();

        for (const e of this.enemies) {
          if (!e?.alive) continue;
          if (p.nova && p._hitEnemies.has(e)) continue;

          const rr = (p.hitRadius || p.radius || 4) + (e.radius || e.r || 12);
          if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
            if (p.nova) p._hitEnemies.add(e);
            e.takeDamage?.(p.dmg || 1);
            this._spawnFloatingText(e.x, e.y - 12, p.crit ? `CRIT ${p.dmg || 1}` : `${p.dmg || 1}`, p.crit ? "#ffd86e" : "#ffffff");
            if (!p.nova) p.alive = false;

            if (!e.alive) {
              this.hero.giveXP?.(e.xpValue?.() || 4);
              if (e.kind === "dragon" && e.progressId) {
                this.progress.defeatedDragons.add(e.progressId);
                this.hero.gold += 150 + (e.level || 1) * 12;
                this._awardRelicShards(4, "dragon");
                this._spawnFloatingText(e.x, e.y - 36, "Dragon slain", "#ffb06e");
                this._msg("Dragon slain: legend grows", 2.2);
              }
              this._advanceBounty(e);
              this._dropEnemyLoot(e);
              this._killFlashT = 0.22;
            }
            if (!p.nova) break;
          }
        }
      } else {
        const rr = (p.hitRadius || p.radius || 4) + (this.hero.radius || this.hero.r || 12);
        if (dist2(p.x, p.y, this.hero.x, this.hero.y) <= rr * rr) {
          this._damageHero(p.dmg || 1);
          p.alive = false;
        }
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  _dropEnemyLoot(e) {
    const goldAmt = Math.max(2, 3 + Math.round((e.level || 1) * 0.8) + (e.lootBonus?.() || 0) + (e.extraLoot || 0));
    this.loot.push(new Loot(e.x, e.y, "gold", { amount: goldAmt }));

    if (e.boss || Math.random() < (e.elite ? 0.24 : 0.14)) {
      this.loot.push(new Loot(e.x + 8, e.y, "potion", { potionType: Math.random() < 0.35 ? "mana" : "hp" }));
    }

    if (e.boss || Math.random() < (e.elite ? 0.34 : 0.10)) {
      const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
      const slot = slots[(Math.random() * slots.length) | 0];
      const rarity = e.boss
        ? (Math.random() < 0.45 ? "epic" : "rare")
        : e.elite
        ? (Math.random() < 0.12 ? "epic" : Math.random() < 0.52 ? "rare" : "uncommon")
        : (Math.random() < 0.18 ? "rare" : "uncommon");

      const item = makeGear(slot, Math.max(1, e.level || 1), rarity, hash2(e.x | 0, e.y | 0, this.time | 0));
      this.loot.push(new Loot(e.x - 8, e.y, "gear", item));
    }
  }

  _damageHero(amount) {
    if (this.dev?.godMode) {
      this.hero.hp = this.hero.maxHp || 100;
      this.hero.mana = Math.max(this.hero.mana || 0, Math.min(this.hero.maxMana || 60, this.hero.mana || 0));
      return false;
    }
    this.hero.takeDamage?.(amount || 1);
    return true;
  }

  _updateLoot(dt) {
    for (const l of this.loot) {
      if (!l?.alive) continue;

      const wasAlive = l.alive;
      l.update?.(dt, this.hero);

      if (wasAlive && !l.alive) {
        this._pickupLoot(l);
      }
    }

    this.loot = this.loot.filter((l) => l.alive);
  }

  _pickupLoot(l) {
    if (l.kind === "gold") {
      this.hero.gold += l.data?.amount || 1;
      this._spawnFloatingText(this.hero.x, this.hero.y - 28, `+${l.data?.amount || 1}g`, "#ffd86e");
      return;
    }

    if (l.kind === "potion") {
      const pt = l.data?.potionType === "mana" ? "mana" : "hp";
      this.hero.potions[pt] = (this.hero.potions[pt] || 0) + 1;
      this._spawnFloatingText(this.hero.x, this.hero.y - 28, pt === "mana" ? "+Mana potion" : "+Health potion", pt === "mana" ? "#88cfff" : "#ff8fa0");
      return;
    }

    if (l.kind === "gear" && l.data) {
      this.hero.inventory.push(l.data);
      this._msg(`Picked up ${l.data.name}`, 1.0);
    }
  }

  _updateCamera(dt) {
    const follow = Math.min(1, dt * 8);
    this.camera.x = this.camera.x + (this.hero.x - this.camera.x) * follow;
    this.camera.y = this.camera.y + (this.hero.y - this.camera.y) * follow;
  }

  _updateNearbyPOIs(dt) {
    this._nearbyPoiTimer -= dt;
    if (this._nearbyPoiTimer > 0) return;
    this._nearbyPoiTimer = 0.12;

    this._cachedNearbyCamp = null;
    this._cachedNearbyDock = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyDungeon = null;
    this._cachedNearbyShrine = null;
    this._cachedNearbyCache = null;

    const check = (arr, r) => {
      const r2 = r * r;
      for (const p of arr || []) {
        if (dist2(this.hero.x, this.hero.y, p.x, p.y) <= r2) return p;
      }
      return null;
    };

    this._cachedNearbyCamp = check(this.world.camps, 84);
    this._cachedNearbyDock = check(this.world.docks, 64);
    this._cachedNearbyWaystone = check(this.world.waystones, 70);
    this._cachedNearbyDungeon = check(this.world.dungeons, 74);
    this._cachedNearbyShrine = check(this.world.shrines, 72);
    this._cachedNearbyCache = check(this.world.caches, 58);
    this._cachedNearbyDragonLair = check(this.world.dragonLairs, 110);
  }

  _toggleDockingOrSailing() {
    const dock = this._cachedNearbyDock;
    if (!dock) return;

    this.hero.state.sailing = !this.hero.state.sailing;
    this._rememberProgressId(this.progress.discoveredDocks, dock);
    this._msg(this.hero.state.sailing ? "Sailing" : "Docked", 0.9);
  }

  _interact() {
    if (this.dungeon.active) {
      this._descendDungeon();
      return;
    }

    if (this._cachedNearbyCamp) {
      this._openShop(this._cachedNearbyCamp);
      return;
    }

    if (this._cachedNearbyWaystone) {
      this._discoverWaystone(this._cachedNearbyWaystone);
      return;
    }

    if (this._cachedNearbyShrine) {
      this._claimShrine(this._cachedNearbyShrine);
      return;
    }

    if (this._cachedNearbyCache) {
      this._openCache(this._cachedNearbyCache);
      return;
    }

    if (this._cachedNearbyDragonLair) {
      this._challengeDragon(this._cachedNearbyDragonLair);
      return;
    }

    if (this._cachedNearbyDungeon) {
      this._enterDungeon(this._cachedNearbyDungeon);
    }
  }

  _openShop(camp) {
    this.shop.campId = camp.id;
    this._rememberProgressId(this.progress.visitedCamps, camp);
    this._claimCampRestBonus(camp);
    this.shop.discount = this._shopDiscount(camp);
    this.shop.items = this._buildShopForCamp(camp);
    this.menu.open = "shop";
  }

  _claimCampRestBonus(camp) {
    const id = this._progressId(camp);
    if (this.progress.campRestBonusClaimed[id]) return;

    this.progress.campRestBonusClaimed[id] = true;
    this.progress.campRenown[id] = (this.progress.campRenown[id] || 0) + 1;
    this.hero.hp = Math.min(this.hero.maxHp || 100, (this.hero.hp || 0) + Math.round((this.hero.maxHp || 100) * 0.35));
    this.hero.mana = Math.min(this.hero.maxMana || 60, (this.hero.mana || 0) + Math.round((this.hero.maxMana || 60) * 0.45));
    this.hero.potions.hp = (this.hero.potions.hp || 0) + 1;
    this._msg("Camp rest: refreshed", 1.4);
  }

  _buildShopForCamp(camp) {
    const rng = new RNG(hash2(camp.x | 0, camp.y | 0, this.seed));
    const items = [];
    const discount = this._shopDiscount(camp);

    items.push({
      kind: "potion",
      name: "Health Potion",
      price: this._shopPrice(12, discount),
      data: { potionType: "hp" },
    });

    items.push({
      kind: "potion",
      name: "Mana Potion",
      price: this._shopPrice(13, discount),
      data: { potionType: "mana" },
    });

    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
    for (let i = 0; i < 4; i++) {
      const slot = slots[(rng.int(0, slots.length - 1) + i) % slots.length];
      const rarityRoll = rng.float();
      const rarity =
        rarityRoll > 0.9 ? "rare" :
        rarityRoll > 0.56 ? "uncommon" :
        "common";

      const gear = makeGear(
        slot,
        Math.max(1, this.hero.level),
        rarity,
        hash2(camp.x | 0, camp.y | 0, i + (this.time | 0))
      );

      items.push({
        kind: "gear",
        name: gear.name,
        price: this._shopPrice(rarity === "rare" ? 80 : rarity === "uncommon" ? 42 : 24, discount),
        data: gear,
      });
    }

    return items.slice(0, 4);
  }

  _shopDiscount(camp) {
    const id = this._progressId(camp);
    const renown = this.progress.campRenown[id] || 0;
    return clamp((this.progress.bountyCompletions || 0) * 0.01 + renown * 0.03, 0, 0.18);
  }

  _shopPrice(base, discount) {
    return Math.max(1, Math.round(base * (1 - discount)));
  }

  _buyShopItem(index) {
    const item = this.shop.items[index];
    if (!item) return;

    if ((this.hero.gold || 0) < item.price) {
      this._msg("Not enough gold", 0.9);
      return;
    }

    this.hero.gold -= item.price;

    if (item.kind === "potion") {
      const pt = item.data?.potionType === "mana" ? "mana" : "hp";
      this.hero.potions[pt] = (this.hero.potions[pt] || 0) + 1;
    } else if (item.kind === "gear") {
      this.hero.inventory.push(item.data);
    }

    this.shop.items.splice(index, 1);
    this._msg(`Bought ${item.name}`, 1.0);
  }

  _discoverWaystone(w) {
    const id = this._progressId(w);
    if (this.progress.discoveredWaystones.has(id)) {
      this._msg("Waystone already known", 0.8);
      return;
    }

    this.progress.discoveredWaystones.add(id);
    this._msg("Waystone discovered", 1.0);
  }

  _claimShrine(shrine) {
    const id = this._progressId(shrine);
    if (this.progress.claimedShrines.has(id)) {
      this._msg("Shrine already claimed", 0.9);
      return;
    }

    this.progress.claimedShrines.add(id);
    const roll = hash2(shrine.x | 0, shrine.y | 0, this.seed) % 3;

    if (roll === 0) {
      this.hero.maxHp = (this.hero.maxHp || 100) + 8;
      this.hero.hp = Math.min(this.hero.maxHp, (this.hero.hp || 0) + 24);
      this._spawnFloatingText(shrine.x, shrine.y - 22, "+Max HP", "#ff8fa0");
      this._msg("Shrine of Vitality claimed", 1.5);
    } else if (roll === 1) {
      this.hero.maxMana = (this.hero.maxMana || 60) + 6;
      this.hero.mana = Math.min(this.hero.maxMana, (this.hero.mana || 0) + 22);
      this._spawnFloatingText(shrine.x, shrine.y - 22, "+Max Mana", "#88cfff");
      this._msg("Shrine of Focus claimed", 1.5);
    } else {
      this.hero.giveXP?.(18 + Math.max(0, (this.hero.level || 1) - 1) * 5);
      this.hero.gold += 14 + (this.hero.level || 1) * 3;
      this._spawnFloatingText(shrine.x, shrine.y - 22, "+XP +Gold", "#ffd86e");
      this._msg("Shrine of Fortune claimed", 1.5);
    }

    for (const key of ["q", "w", "e", "r"]) {
      if (this.skillProg[key]) this.skillProg[key].xp += 1;
      this._checkSkillLevel(key);
    }
    this._awardRelicShards(1, "shrine");
  }

  _openCache(cache) {
    const id = this._progressId(cache);
    if (this.progress.openedCaches.has(id)) {
      this._msg("Cache already opened", 0.8);
      return;
    }

    this.progress.openedCaches.add(id);
    const level = Math.max(1, this.world.getDangerLevel?.(cache.x, cache.y) || this.hero.level || 1);
    const gold = 18 + level * 7 + (hash2(cache.x | 0, cache.y | 0, this.seed) % 14);

    this.loot.push(new Loot(cache.x - 10, cache.y, "gold", { amount: gold }));
    this.loot.push(new Loot(cache.x + 10, cache.y + 2, "potion", { potionType: level >= 3 ? "mana" : "hp" }));

    if (level >= 2) {
      const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
      const slot = slots[Math.abs(hash2(cache.x | 0, cache.y | 0, level)) % slots.length];
      const rarity = level >= 5 ? "rare" : "uncommon";
      this.loot.push(new Loot(cache.x, cache.y - 12, "gear", makeGear(slot, Math.max(level, this.hero.level || 1), rarity, hash2(this.seed, cache.x | 0, cache.y | 0))));
    }

    this._spawnFloatingText(cache.x, cache.y - 22, "Cache opened", "#ffe19a");
    this._msg("Treasure cache opened", 1.4);
    this._awardRelicShards(level >= 4 ? 2 : 1, "cache");
  }

  _challengeDragon(lair) {
    const id = this._progressId(lair);
    if (this.progress.defeatedDragons.has(id)) {
      this._msg("This dragon is already defeated", 1.0);
      return;
    }

    const nearby = this.enemies.some((e) => e?.alive && e.boss && e.kind === "dragon" && dist2(e.x, e.y, lair.x, lair.y) < 700 * 700);
    if (nearby) {
      this._msg("The dragon is awake", 1.0);
      return;
    }

    const level = Math.max(8, (this.hero.level || 1) + (this.world.getDangerLevel?.(lair.x, lair.y) || 5) + 3);
    this._spawnDragonBoss(lair.x, lair.y, level, "Ancient Dragon", id);
    this._msg("Ancient Dragon awakened", 2.0);
  }

  _spawnDragonBoss(x, y, level, name = "Dragon", progressId = null) {
    const dragon = new Enemy(x, y, level, "dragon", hash2(x | 0, y | 0, this.seed), false, true);
    dragon.name = name;
    dragon.progressId = progressId;
    dragon.affix = name;
    dragon.extraLoot = 18;
    this.enemies.push(dragon);
    return dragon;
  }

  _enterDungeon(dungeonPoi) {
    if (this.dungeon.active) return;

    this.dungeon.active = true;
    this.dungeon.floor = Math.max(1, (this.progress.dungeonBest || 0) + 1);
    this.dungeon.origin = { x: dungeonPoi.x, y: dungeonPoi.y };
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this._msg(`Dungeon Floor ${this.dungeon.floor}`, 1.2);
    this._spawnDungeonWave();
  }

  _descendDungeon() {
    if (!this.dungeon.active) return;
    this.progress.dungeonBest = Math.max(this.progress.dungeonBest || 0, this.dungeon.floor || 0);
    this.dungeon.floor = Math.max(1, (this.dungeon.floor || 1) + 1);
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.hero.hp = Math.min(this.hero.maxHp || 100, (this.hero.hp || 0) + 12);
    this.hero.mana = Math.min(this.hero.maxMana || 60, (this.hero.mana || 0) + 10);
    if (this.dungeon.floor % 3 === 0) this._awardRelicShards(1, "depths");
    this._spawnDungeonWave();
    this._msg(`Descended to Floor ${this.dungeon.floor}`, 1.4);
  }

  _spawnDungeonWave() {
    const floor = Math.max(1, this.dungeon.floor || 1);
    const count = Math.min(12, 4 + floor);
    const bossFloor = floor % 3 === 0;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + floor * 0.31;
      const r = 220 + (i % 3) * 65;
      const x = this.hero.x + Math.cos(a) * r;
      const y = this.hero.y + Math.sin(a) * r;
      const kind = bossFloor && i === 0 ? "brute" : this._pickEnemyKind("dungeon");
      const enemy = new Enemy(x, y, Math.max(1, (this.hero.level || 1) + floor - 1), kind, hash2(x | 0, y | 0, this.seed + floor), i % 4 === 0, bossFloor && i === 0);
      this.enemies.push(this._applyEnemyAffix(enemy));
    }

    if (floor % 5 === 0) {
      this._spawnDragonBoss(this.hero.x + 280, this.hero.y - 40, Math.max(8, (this.hero.level || 1) + floor), `Depth Dragon F${floor}`);
    }
  }

  _leaveDungeon() {
    if (!this.dungeon.active) return;

    const out = this.dungeon.origin || this.world.spawn || { x: 0, y: 0 };
    const safe = this.world._findSafeLandPatchNear?.(out.x, out.y, 140) || this.world.spawn || out;

    this.hero.x = safe.x;
    this.hero.y = safe.y;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.sailing = false;
    this.progress.dungeonBest = Math.max(this.progress.dungeonBest || 0, this.dungeon.floor || 0);
    this.dungeon.active = false;

    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;

    this._msg("Left dungeon", 1.0);
  }

  _updateZoneMessage(dt) {
    this._zoneSampleT -= dt;
    if (this._zoneSampleT > 0) return;
    this._zoneSampleT = 0.2;

    const zone = this.dungeon.active
      ? "Dungeon"
      : (this.world.getZoneName?.(this.hero.x, this.hero.y) || "");

    if (zone && zone !== this._lastZoneName) {
      this._lastZoneName = zone;
      this.zoneMsg = zone;
      this.zoneMsgT = 1.1;
    }
  }

  _makeBountyQuest(seedOffset = 0) {
    const targets = ["blob", "wolf", "stalker", "scout", "caster", "brute"];
    const target = targets[Math.abs(hash2(this.seed, this.hero.level + seedOffset)) % targets.length];
    const needed = 4 + Math.min(5, Math.floor((this.hero.level || 1) / 2));
    return {
      type: "bounty",
      target,
      needed,
      count: 0,
      rewardGold: 18 + (this.hero.level || 1) * 6,
      rewardXp: 10 + (this.hero.level || 1) * 4,
    };
  }

  _awardRelicShards(amount = 1, source = "relic") {
    const gain = Math.max(0, amount | 0);
    if (!gain) return;

    this.progress.relicShards = Math.max(0, (this.progress.relicShards || 0) + gain);
    this._spawnFloatingText(this.hero.x, this.hero.y - 44, `+${gain} relic`, "#c9a7ff");
    this._checkStoryMilestones(source);
  }

  _checkStoryMilestones(source = "") {
    const shards = this.progress.relicShards || 0;
    const done = this.progress.storyMilestones || (this.progress.storyMilestones = {});
    const milestones = [
      { at: 3, id: "spark", text: "Story: the Ash Crown stirs", hp: 6, mana: 4, gold: 40 },
      { at: 7, id: "ember", text: "Story: ember oath awakened", hp: 8, mana: 6, xp: 45 },
      { at: 12, id: "crown", text: "Story: crown shard restored", hp: 10, mana: 8, gold: 90, xp: 80 },
      { at: 20, id: "dragon", text: "Story: dragon paths revealed", hp: 14, mana: 10, gold: 150, xp: 130 },
    ];

    for (const m of milestones) {
      if (shards < m.at || done[m.id]) continue;
      done[m.id] = true;
      this.hero.maxHp = (this.hero.maxHp || 100) + (m.hp || 0);
      this.hero.maxMana = (this.hero.maxMana || 60) + (m.mana || 0);
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this.hero.gold += m.gold || 0;
      if (m.xp) this.hero.giveXP?.(m.xp);
      this._msg(m.text, 2.0);
      this._spawnFloatingText(this.hero.x, this.hero.y - 60, "Milestone", "#c9a7ff");
    }
  }

  _advanceBounty(enemy) {
    if (enemy?.elite) this.progress.eliteKills = (this.progress.eliteKills || 0) + 1;
    if (!this.quest || this.quest.type !== "bounty") this.quest = this._makeBountyQuest();
    if (this.quest.target !== enemy?.kind) return;

    this.quest.count = Math.min(this.quest.needed, (this.quest.count || 0) + 1);
    if (this.quest.count < this.quest.needed) return;

    this._completeBounty();
  }

  _completeBounty() {
    const q = this.quest || this._makeBountyQuest();
    this.progress.bountyCompletions = (this.progress.bountyCompletions || 0) + 1;
    this.hero.gold += q.rewardGold || 0;
    this.hero.giveXP?.(q.rewardXp || 0);

    const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
    const slot = slots[this.progress.bountyCompletions % slots.length];
    const rarity = this.progress.bountyCompletions % 4 === 0 ? "rare" : "uncommon";
    this.hero.inventory.push(makeGear(slot, Math.max(1, this.hero.level), rarity, hash2(this.seed, this.progress.bountyCompletions)));

    this._msg(`Bounty complete: +${q.rewardGold}g`, 1.8);
    this.quest = this._makeBountyQuest(this.progress.bountyCompletions + 7);
  }

  getObjective() {
    if (this.dungeon.active) {
      return this._objective(
        `Dungeon Floor ${this.dungeon.floor || 1}`,
        "Fight, loot, and press Esc when you need air.",
        null,
        "#dc7cff"
      );
    }

    const story = this._getStoryObjective();
    if (story) return story;

    if (this.quest?.type === "bounty" && (this.quest.count || 0) < (this.quest.needed || 1)) {
      return this._objective(
        `Bounty: ${this._titleCase(this.quest.target)}`,
        `${this.quest.count || 0}/${this.quest.needed || 1} defeated - press J for details.`,
        this._nearest(this.enemies, (e) => e.alive && e.kind === this.quest.target),
        "#ffd86e"
      );
    }

    if ((this.hero.inventory?.length || 0) > 0) {
      return this._objective(
        "Check your gear",
        "Press I, then Enter to equip or X to salvage.",
        null,
        "#88cfff"
      );
    }

    const unvisitedCamp = this._nearest(
      this.world.camps,
      (camp) => !this.progress.visitedCamps.has(this._progressId(camp))
    );
    if (unvisitedCamp) {
      return this._objective(
        "Find a camp",
        "Follow the marker, then press F for the shop.",
        unvisitedCamp,
        "#ffdc63"
      );
    }

    const unknownWaystone = this._nearest(
      this.world.waystones,
      (waystone) => !this.progress.discoveredWaystones.has(this._progressId(waystone))
    );
    if (unknownWaystone) {
      return this._objective(
        "Discover a waystone",
        "Press F near the blue marker to unlock it.",
        unknownWaystone,
        "#7fe8ff"
      );
    }

    const unclaimedShrine = this._nearest(
      this.world.shrines,
      (shrine) => !this.progress.claimedShrines.has(this._progressId(shrine))
    );
    if (unclaimedShrine) {
      return this._objective(
        "Claim a shrine",
        "Find the violet marker and press F.",
        unclaimedShrine,
        "#b77eff"
      );
    }

    const unopenedCache = this._nearest(
      this.world.caches,
      (cache) => !this.progress.openedCaches.has(this._progressId(cache))
    );
    if (unopenedCache) {
      return this._objective(
        "Open a treasure cache",
        "Look for the gold chest marker.",
        unopenedCache,
        "#ffe19a"
      );
    }

    const dragonLair = this._nearest(
      this.world.dragonLairs,
      (lair) => !this.progress.defeatedDragons.has(this._progressId(lair))
    );
    if (dragonLair && (this.hero.level || 1) >= 5) {
      return this._objective(
        "Hunt an ancient dragon",
        "Far lairs hold the hardest bosses.",
        dragonLair,
        "#ff8a5c"
      );
    }

    const dungeon = this._nearest(this.world.dungeons);
    if (dungeon) {
      return this._objective(
        "Enter a dungeon",
        "Find the purple marker and press F.",
        dungeon,
        "#dc7cff"
      );
    }

    const enemy = this._nearest(this.enemies, (e) => e.alive);
    return this._objective(
      "Hunt monsters",
      "Use Q/W/E/R and collect dropped loot.",
      enemy,
      "#cf4d5f"
    );
  }

  _objective(title, detail, target, color) {
    return { title, detail, target, color };
  }

  _getStoryObjective() {
    const shards = this.progress.relicShards || 0;
    const next = shards < 3 ? 3 : shards < 7 ? 7 : shards < 12 ? 12 : shards < 20 ? 20 : 0;
    if (!next) {
      const dragonLair = this._nearest(
        this.world.dragonLairs,
        (lair) => !this.progress.defeatedDragons.has(this._progressId(lair))
      );
      if (!dragonLair) return null;
      return this._objective("Break the dragon seals", "Hunt ancient dragons for legendary loot.", dragonLair, "#ff8a5c");
    }

    const target =
      this._nearest(this.world.shrines, (p) => !this.progress.claimedShrines.has(this._progressId(p))) ||
      this._nearest(this.world.caches, (p) => !this.progress.openedCaches.has(this._progressId(p))) ||
      this._nearest(this.world.dungeons);

    return this._objective(
      "Restore the Ash Crown",
      `Collect relic shards: ${shards}/${next}`,
      target,
      "#c9a7ff"
    );
  }

  _titleCase(text) {
    const s = String(text || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  _nearest(arr, predicate = () => true) {
    let best = null;
    let bestD2 = Infinity;
    for (const p of arr || []) {
      if (!p || !predicate(p)) continue;
      const d = dist2(this.hero.x, this.hero.y, p.x, p.y);
      if (d < bestD2) {
        best = p;
        bestD2 = d;
      }
    }
    return best;
  }

  _drawFloatingTexts(ctx) {
    for (const f of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = f.a;
      ctx.fillStyle = f.color || "#fff";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();

      f.y -= 0.35;
      f.a -= 0.015;
    }

    this.floatingTexts = this.floatingTexts.filter((f) => f.a > 0);
  }

  _spawnFloatingText(x, y, text, color = "#fff") {
    this.floatingTexts.push({ x, y, text, color, a: 1 });
  }

  _nearPointOfInterest(x, y, r) {
    const r2 = r * r;
    const check = (arr) => {
      for (const p of arr || []) {
        if (dist2(x, y, p.x, p.y) <= r2) return true;
      }
      return false;
    };

    return check(this.world.camps) ||
      check(this.world.docks) ||
      check(this.world.waystones) ||
      check(this.world.dungeons) ||
      check(this.world.shrines) ||
      check(this.world.caches) ||
      check(this.world.dragonLairs);
  }

  _progressId(p) {
    return p?.id != null ? String(p.id) : `${p?.x ?? 0},${p?.y ?? 0}`;
  }

  _rememberProgressId(set, p) {
    if (set?.add && p) set.add(this._progressId(p));
  }

  _cleanupFarEntities(dt = 0.016) {
    this.perf.cleanupTimer += dt;
    if (this.perf.cleanupTimer < this.perf.cleanupEvery) return;
    this.perf.cleanupTimer = 0;

    const maxEnemyD2 = (this.perf.enemyUpdateRadius + 560) ** 2;
    const maxLootD2 = (this.perf.lootUpdateRadius + 420) ** 2;
    const maxProjD2 = (this.perf.projectileUpdateRadius + 260) ** 2;

    this.enemies = this.enemies.filter((e) => e?.alive && dist2(e.x, e.y, this.hero.x, this.hero.y) < maxEnemyD2);
    this.loot = this.loot.filter((l) => l?.alive && dist2(l.x, l.y, this.hero.x, this.hero.y) < maxLootD2);
    this.projectiles = this.projectiles.filter((p) => p?.alive && dist2(p.x, p.y, this.hero.x, this.hero.y) < maxProjD2);
  }

  _ensureHeroSafe(showMsg = false) {
    const onSafeGround = this.world.canWalk?.(this.hero.x, this.hero.y, { state: { sailing: false } });
    if (onSafeGround) {
      return;
    }

    let safe = this.world._findSafeLandPatchNear?.(this.hero.x, this.hero.y, 260);
    if (!safe && this.world.spawn) {
      safe = this.world._findSafeLandPatchNear?.(this.world.spawn.x, this.world.spawn.y, 320);
    }
    if (!safe && this.world.spawn) {
      safe = { x: this.world.spawn.x, y: this.world.spawn.y };
    }
    if (!safe) {
      safe = { x: 0, y: 0 };
    }

    this.hero.x = safe.x;
    this.hero.y = safe.y;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.sailing = false;
    this.hero.state.dashT = 0;
    this.hero.state.hurtT = 0;
    this.hero.state.slowT = 0;
    this.hero.state.poisonT = 0;

    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;

    if (showMsg) {
      this._msg("Recovered to safe ground", 1.0);
    }
  }

  _saveGame() {
    try {
      this.save.save({
        seed: this.seed,
        worldBuild: this.world?.buildId || "rpg-v107",
        hero: {
          x: this.hero.x,
          y: this.hero.y,
          level: this.hero.level,
          xp: this.hero.xp,
          nextXp: this.hero.nextXp,
          hp: this.hero.hp,
          maxHp: this.hero.maxHp,
          mana: this.hero.mana,
          maxMana: this.hero.maxMana,
          gold: this.hero.gold,
          inventory: this.hero.inventory,
          equip: this.hero.equip,
          potions: this.hero.potions,
          state: this.hero.state,
          lastMove: this.hero.lastMove,
          aimDir: this.hero.aimDir,
        },
        progress: {
          discoveredWaystones: Array.from(this.progress.discoveredWaystones || []),
          discoveredDocks: Array.from(this.progress.discoveredDocks || []),
          dungeonBest: this.progress.dungeonBest || 0,
          visitedCamps: Array.from(this.progress.visitedCamps || []),
          eliteKills: this.progress.eliteKills || 0,
          bountyCompletions: this.progress.bountyCompletions || 0,
          campRenown: this.progress.campRenown || {},
          campRestBonusClaimed: this.progress.campRestBonusClaimed || {},
          claimedShrines: Array.from(this.progress.claimedShrines || []),
          openedCaches: Array.from(this.progress.openedCaches || []),
          defeatedDragons: Array.from(this.progress.defeatedDragons || []),
          relicShards: this.progress.relicShards || 0,
          storyMilestones: this.progress.storyMilestones || {},
          exploredCells: this.world?.exportDiscovery?.() || [],
        },
        quest: this.quest,
        skillProg: this.skillProg,
        menu: this.menu,
        cooldowns: this.cooldowns,
        dungeon: this.dungeon,
      });
    } catch (err) {
      console.warn("Save failed", err);
    }
  }

  _loadGame() {
    try {
      const data = this.save.load?.() || this.save.read?.() || this.save.get?.();
      if (!data) return;

      const currentWorldBuild = this.world?.buildId || "rpg-v107";
      const needsWorldMigration = data.worldBuild !== currentWorldBuild;

      if (Number.isFinite(+data.seed) && (data.seed | 0) !== this.seed) {
        this.seed = data.seed | 0;
        this.world = new World(this.seed, { viewW: this.w, viewH: this.h });
        this._rng = new RNG(hash2(this.seed, 9001));
      }

      if (data.hero) {
        const h = data.hero;
        this.hero.x = this._finiteOr(h.x, this.hero.x);
        this.hero.y = this._finiteOr(h.y, this.hero.y);
        this.hero.level = Math.max(1, this._finiteOr(h.level, this.hero.level));
        this.hero.xp = Math.max(0, this._finiteOr(h.xp, 0));
        this.hero.nextXp = Math.max(1, this._finiteOr(h.nextXp, this.hero.nextXp));
        this.hero.maxHp = Math.max(1, this._finiteOr(h.maxHp, this.hero.maxHp));
        this.hero.hp = clamp(this._finiteOr(h.hp, this.hero.hp), 0, this.hero.maxHp);
        this.hero.maxMana = Math.max(0, this._finiteOr(h.maxMana, this.hero.maxMana));
        this.hero.mana = clamp(this._finiteOr(h.mana, this.hero.mana), 0, this.hero.maxMana);
        this.hero.gold = Math.max(0, this._finiteOr(h.gold, 0));
        this.hero.inventory = Array.isArray(h.inventory) ? h.inventory : [];
        this.hero.equip = h.equip || this.hero.equip;
        this.hero.potions = h.potions || this.hero.potions;
        this.hero.state = h.state || this.hero.state;
        this.hero.lastMove = h.lastMove || this.hero.lastMove;
        this.hero.aimDir = h.aimDir || this.hero.aimDir;
      }

      this.hero.vx = 0;
      this.hero.vy = 0;
      this.hero.state.sailing = false;
      this.hero.state.dashT = 0;
      this.hero.state.hurtT = 0;
      this.hero.state.slowT = 0;
      this.hero.state.poisonT = 0;

      if (needsWorldMigration) {
        const start = this.world.getStarterPoint?.() || this.world.spawn || { x: 0, y: 0 };
        this.hero.x = start.x;
        this.hero.y = start.y;
        this.dungeon.active = false;
        this.dungeon.floor = 0;
        this.dungeon.origin = null;
        this._worldBuildMigrated = true;
        this._msg("New roads charted. Returned to the starter road.", 2.2);
      }

      if (data.progress) {
        this.progress.discoveredWaystones = new Set(data.progress.discoveredWaystones || []);
        this.progress.discoveredDocks = new Set(data.progress.discoveredDocks || []);
        this.progress.dungeonBest = data.progress.dungeonBest || 0;
        this.progress.visitedCamps = new Set(data.progress.visitedCamps || []);
        this.progress.eliteKills = data.progress.eliteKills || 0;
        this.progress.bountyCompletions = data.progress.bountyCompletions || 0;
        this.progress.campRenown = data.progress.campRenown || {};
        this.progress.campRestBonusClaimed = data.progress.campRestBonusClaimed || {};
        this.progress.claimedShrines = new Set(data.progress.claimedShrines || []);
        this.progress.openedCaches = new Set(data.progress.openedCaches || []);
        this.progress.defeatedDragons = new Set(data.progress.defeatedDragons || []);
        this.progress.relicShards = data.progress.relicShards || 0;
        this.progress.storyMilestones = data.progress.storyMilestones || {};
        this.world?.importDiscovery?.(data.progress.exploredCells || []);
      }

      if (data.quest?.type === "bounty") {
        this.quest = {
          type: "bounty",
          target: data.quest.target || "blob",
          needed: Math.max(1, data.quest.needed || 4),
          count: clamp(data.quest.count || 0, 0, Math.max(1, data.quest.needed || 4)),
          rewardGold: Math.max(0, data.quest.rewardGold || 20),
          rewardXp: Math.max(0, data.quest.rewardXp || 10),
        };
      } else {
        this.quest = this._makeBountyQuest(this.progress.bountyCompletions || 0);
      }

      if (data.skillProg) {
        for (const k of ["q", "w", "e", "r"]) {
          if (data.skillProg[k]) {
            this.skillProg[k].xp = data.skillProg[k].xp || 0;
            this.skillProg[k].level = Math.max(1, data.skillProg[k].level || 1);
          }
        }
      }

      if (data.menu) {
        this.menu.open = data.menu.open || null;
      }

      if (data.cooldowns) {
        this.cooldowns.q = data.cooldowns.q || 0;
        this.cooldowns.w = data.cooldowns.w || 0;
        this.cooldowns.e = data.cooldowns.e || 0;
        this.cooldowns.r = data.cooldowns.r || 0;
      }

      this.camera.x = this.hero.x;
      this.camera.y = this.hero.y;
    } catch (err) {
      console.warn("Load failed", err);
    }
  }

  _finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  _msg(text, t = 1.0) {
    this.msg = text;
    this.msgT = t;
  }
}
