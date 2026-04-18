// src/game.js
// v101 FULLER GAMEPLAY RESTORE
// - restores fuller gameplay loop on top of current stable build
// - inventory / equip / salvage
// - skills / cooldowns / mouse aim
// - camp shop / waystones / docks / dungeon entry marker
// - zone messages / autosave / loot pickup / enemy spawning
// - works with current main.js, ui.js, world.js, entities.js, util.js, save.js

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
    this.save = new Save("broke-knight-save-v101");

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
      maxEnemies: 42,
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
    this._dragonCheckT = 0;
    this._rng = new RNG(hash2(this.seed, 9001));

    this.menu = { open: null };
    this.invIndex = 0;

    this.msg = "";
    this.msgT = 0;
    this.zoneMsg = "";
    this.zoneMsgT = 0;

    this._touchDamageCd = 0;
    this._dockToggleCd = 0;
    this._interactCd = 0;
    this._zoneSampleT = 0;
    this._lastZoneName = "";
    this._killFlashT = 0;

    this._cachedNearbyCamp = null;
    this._cachedNearbyDock = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyDungeon = null;
    this._nearbyPoiTimer = 0;

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
      campRenown: {},
      campRestBonusClaimed: {},
    };

    this.shop = {
      campId: null,
      items: [],
    };

    this.dungeon = {
      active: false,
      floor: 0,
      origin: null,
    };

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

    this._spawnInitialEnemies();
    this._ensureHeroSafe();
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
    this._updateNearbyPOIs(dt);

    this._handleMenus();

    if (this.menu.open === "inventory") {
      this._handleInventoryInput();
    } else if (this.menu.open === "shop") {
      this._handleShopInput();
    } else {
      this._handleMovement(dt);
      this._handleSkills();
    }

    this._handleInteractShortcuts(dt);

    this.hero.update?.(dt);
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    this._updateLoot(dt);
    this._updateZoneMessage(dt);
    this._updateCamera(dt);
    this._spawnWorldEnemies(dt);
    this._respawnCampEnemies(dt);
    this._cleanupFarEntities();

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

    this.ui.update?.(0, this);
    this.ui.draw(ctx, this);
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
    if (this.input.wasPressed("m")) {
      this.menu.open = this.menu.open === "map" ? null : "map";
    }

    if (this.input.wasPressed("i")) {
      this.menu.open = this.menu.open === "inventory" ? null : "inventory";
      this.invIndex = clamp(this.invIndex || 0, 0, Math.max(0, (this.hero.inventory?.length || 1) - 1));
    }

    if (this.input.wasPressed("k")) {
      this.menu.open = this.menu.open === "skills" ? null : "skills";
    }

    if (this.input.wasPressed("Escape")) {
      if (this.menu.open) {
        this.menu.open = null;
      } else if (this.dungeon.active) {
        this._leaveDungeon();
      }
    }
  }

  _handleMovement(dt) {
    let mx = 0;
    let my = 0;

    if (this.input.isDown("w") || this.input.isDown("ArrowUp")) my -= 1;
    if (this.input.isDown("s") || this.input.isDown("ArrowDown")) my += 1;
    if (this.input.isDown("a") || this.input.isDown("ArrowLeft")) mx -= 1;
    if (this.input.isDown("d") || this.input.isDown("ArrowRight")) mx += 1;

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

    if (this.input.wasPressed("q")) this._castSpark();
    if (this.input.wasPressed("w")) this._castNova();
    if (this.input.wasPressed("e")) this._castDash();
    if (this.input.wasPressed("r")) this._castOrb();

    if (this.mouse.down) this._castSpark();
  }

  _handleInteractShortcuts(dt) {
    this._dockToggleCd = Math.max(0, this._dockToggleCd - dt);
    this._interactCd = Math.max(0, this._interactCd - dt);

    if (this.input.wasPressed("b") && this._dockToggleCd <= 0 && !this.menu.open) {
      this._dockToggleCd = 0.18;
      this._toggleDockingOrSailing();
    }

    if (this.input.wasPressed("f") && this._interactCd <= 0 && !this.menu.open) {
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

    if (this.input.wasPressed("ArrowDown") || this.input.wasPressed("s")) {
      this.invIndex = Math.min(inv.length - 1, (this.invIndex || 0) + 1);
    }

    if (this.input.wasPressed("ArrowUp") || this.input.wasPressed("w")) {
      this.invIndex = Math.max(0, (this.invIndex || 0) - 1);
    }

    const item = inv[this.invIndex];

    if ((this.input.wasPressed("Enter") || this.input.wasPressed("e")) && item) {
      this._equipInventoryItem(this.invIndex);
    }

    if ((this.input.wasPressed("x") || this.input.wasPressed("Backspace") || this.input.wasPressed("Delete")) && item) {
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
    const dmg = Math.round((this.hero.getStats?.().dmg || 8) * 0.95);

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 18,
        this.hero.y + dir.y * 18,
        dir.x * 270,
        dir.y * 270,
        dmg,
        1.25,
        this.hero.level,
        { friendly: true, color: "rgba(148,225,255,0.95)", radius: 4, hitRadius: 15 }
      )
    );

    this.skillProg.q.xp += 1;
    this._checkSkillLevel("q");
  }

  _castNova() {
    if (this.cooldowns.w > 0) return;
    const def = this.skillDefs.w;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.w = def.cd;

    const dmg = Math.round((this.hero.getStats?.().dmg || 8) * 1.1);

    this.projectiles.push(
      new Projectile(
        this.hero.x,
        this.hero.y,
        0,
        0,
        dmg,
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
    const dmg = Math.round((this.hero.getStats?.().dmg || 8) * 1.65);

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 22,
        this.hero.y + dir.y * 22,
        dir.x * 175,
        dir.y * 175,
        dmg,
        1.7,
        this.hero.level,
        { friendly: true, color: "rgba(198,140,255,0.95)", radius: 8, hitRadius: 20 }
      )
    );

    this.skillProg.r.xp += 3;
    this._checkSkillLevel("r");
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

      const zone = this.world.getZoneName?.(x, y) || "meadow";
      const kind = this._pickEnemyKind(zone);
      const elite = Math.random() < 0.08;

      const e = new Enemy(x, y, Math.max(1, this.hero.level), kind, hash2(x | 0, y | 0, this.seed), elite, false);
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

  _pickEnemyKind(zone) {
    const z = String(zone || "").toLowerCase();
    if (z.includes("wild")) return Math.random() < 0.5 ? "wolf" : "stalker";
    if (z.includes("stone")) return Math.random() < 0.5 ? "brute" : "blob";
    if (z.includes("ash")) return Math.random() < 0.5 ? "ashling" : "brute";
    if (z.includes("shore")) return Math.random() < 0.5 ? "scout" : "caster";

    const pool = ["blob", "wolf", "stalker", "scout", "caster", "brute"];
    return pool[(Math.random() * pool.length) | 0];
  }

  _updateEnemies(dt) {
    this._touchDamageCd = Math.max(0, this._touchDamageCd - dt);

    for (const e of this.enemies) {
      if (!e?.alive) continue;
      e.update?.(dt, this.hero, this.world, this);

      const rr = (this.hero.radius || this.hero.r || 12) + (e.radius || e.r || 12);
      if (dist2(this.hero.x, this.hero.y, e.x, e.y) <= rr * rr) {
        if (this._touchDamageCd <= 0) {
          this.hero.takeDamage?.(e.touchDps || 1);
          this._touchDamageCd = this.perf.touchDamageTick;
        }
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive);
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p?.alive) continue;

      p.update?.(dt, this.world);
      if (!p.alive) continue;

      if (p.friendly) {
        for (const e of this.enemies) {
          if (!e?.alive) continue;

          const rr = (p.hitRadius || p.radius || 4) + (e.radius || e.r || 12);
          if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
            e.takeDamage?.(p.dmg || 1);
            this._spawnFloatingText(e.x, e.y - 12, `${p.dmg || 1}`, "#ffffff");
            p.alive = false;

            if (!e.alive) {
              this.hero.giveXP?.(e.xpValue?.() || 4);
              this._dropEnemyLoot(e);
              this._killFlashT = 0.22;
            }
            break;
          }
        }
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  _dropEnemyLoot(e) {
    const goldAmt = Math.max(2, 3 + Math.round((e.level || 1) * 0.8) + (e.lootBonus?.() || 0));
    this.loot.push(new Loot(e.x, e.y, "gold", { amount: goldAmt }));

    if (Math.random() < 0.14) {
      this.loot.push(new Loot(e.x + 8, e.y, "potion", { potionType: Math.random() < 0.35 ? "mana" : "hp" }));
    }

    if (Math.random() < (e.elite ? 0.26 : 0.10)) {
      const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
      const slot = slots[(Math.random() * slots.length) | 0];
      const rarity = e.elite ? (Math.random() < 0.45 ? "rare" : "uncommon") : (Math.random() < 0.18 ? "rare" : "uncommon");
      const item = makeGear(slot, Math.max(1, e.level || 1), rarity, hash2(e.x | 0, e.y | 0, this.time | 0));
      this.loot.push(new Loot(e.x - 8, e.y, "gear", item));
    }
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
      return;
    }

    if (l.kind === "potion") {
      const pt = l.data?.potionType === "mana" ? "mana" : "hp";
      this.hero.potions[pt] = (this.hero.potions[pt] || 0) + 1;
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
  }

  _toggleDockingOrSailing() {
    const dock = this._cachedNearbyDock;
    if (!dock) return;

    this.hero.state.sailing = !this.hero.state.sailing;
    this._msg(this.hero.state.sailing ? "Sailing" : "Docked", 0.9);
  }

  _interact() {
    if (this._cachedNearbyCamp) {
      this._openShop(this._cachedNearbyCamp);
      return;
    }

    if (this._cachedNearbyWaystone) {
      this._discoverWaystone(this._cachedNearbyWaystone);
      return;
    }

    if (this._cachedNearbyDungeon) {
      this._enterDungeon(this._cachedNearbyDungeon);
    }
  }

  _openShop(camp) {
    this.shop.campId = camp.id;
    this.shop.items = this._buildShopForCamp(camp);
    this.menu.open = "shop";
  }

  _buildShopForCamp(camp) {
    const rng = new RNG(hash2(camp.x | 0, camp.y | 0, this.seed));
    const items = [];

    items.push({
      kind: "potion",
      name: "Health Potion",
      price: 12,
      data: { potionType: "hp" },
    });

    items.push({
      kind: "potion",
      name: "Mana Potion",
      price: 13,
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

      const gear = makeGear(slot, Math.max(1, this.hero.level), rarity, hash2(camp.x | 0, camp.y | 0, i + (this.time | 0)));
      items.push({
        kind: "gear",
        name: gear.name,
        price: rarity === "rare" ? 80 : rarity === "uncommon" ? 42 : 24,
        data: gear,
      });
    }

    return items.slice(0, 4);
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
    const id = w.id || `${w.x},${w.y}`;
    if (this.progress.discoveredWaystones.has(id)) {
      this._msg("Waystone already known", 0.8);
      return;
    }

    this.progress.discoveredWaystones.add(id);
    this._msg("Waystone discovered", 1.0);
  }

  _enterDungeon(dungeonPoi) {
    if (this.dungeon.active) return;

    this.dungeon.active = true;
    this.dungeon.floor = Math.max(1, (this.progress.dungeonBest || 0) + 1);
    this.dungeon.origin = { x: dungeonPoi.x, y: dungeonPoi.y };

    this._msg(`Dungeon Floor ${this.dungeon.floor}`, 1.2);
  }

  _leaveDungeon() {
    if (!this.dungeon.active) return;

    const out = this.dungeon.origin || this.world.spawn || { x: 0, y: 0 };
    const safe = this.world._findSafeLandPatchNear?.(out.x, out.y, 100) || out;

    this.hero.x = safe.x;
    this.hero.y = safe.y;
    this.dungeon.active = false;

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
    return check(this.world.camps) || check(this.world.docks) || check(this.world.waystones) || check(this.world.dungeons);
  }

  _cleanupFarEntities() {
    this.perf.cleanupTimer += 0.016;
    if (this.perf.cleanupTimer < this.perf.cleanupEvery) return;
    this.perf.cleanupTimer = 0;

    const maxEnemyD2 = (this.perf.enemyUpdateRadius + 560) ** 2;
    const maxLootD2 = (this.perf.lootUpdateRadius + 420) ** 2;
    const maxProjD2 = (this.perf.projectileUpdateRadius + 260) ** 2;

    this.enemies = this.enemies.filter((e) => e?.alive && dist2(e.x, e.y, this.hero.x, this.hero.y) < maxEnemyD2);
    this.loot = this.loot.filter((l) => l?.alive && dist2(l.x, l.y, this.hero.x, this.hero.y) < maxLootD2);
    this.projectiles = this.projectiles.filter((p) => p?.alive && dist2(p.x, p.y, this.hero.x, this.hero.y) < maxProjD2);
  }

  _ensureHeroSafe() {
    if (this.world.canWalk?.(this.hero.x, this.hero.y, this.hero)) return;
    const p = this.world._findSafeLandPatchNear?.(this.hero.x, this.hero.y, 180);
    if (p) {
      this.hero.x = p.x;
      this.hero.y = p.y;
    }
  }

  _saveGame() {
    try {
      this.save.save({
        seed: this.seed,
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
          campRenown: this.progress.campRenown || {},
          campRestBonusClaimed: this.progress.campRestBonusClaimed || {},
        },
        skillProg: this.skillProg,
      });
    } catch (err) {
      console.warn("Save failed", err);
    }
  }

  _loadGame() {
    try {
      const data = this.save.load?.() || this.save.read?.() || this.save.get?.();
      if (!data) return;

      if (data.hero) {
        const h = data.hero;
        this.hero.x = +h.x || this.hero.x;
        this.hero.y = +h.y || this.hero.y;
        this.hero.level = Math.max(1, h.level || this.hero.level);
        this.hero.xp = h.xp || 0;
        this.hero.nextXp = h.nextXp || this.hero.nextXp;
        this.hero.maxHp = h.maxHp || this.hero.maxHp;
        this.hero.hp = h.hp || this.hero.hp;
        this.hero.maxMana = h.maxMana || this.hero.maxMana;
        this.hero.mana = h.mana || this.hero.mana;
        this.hero.gold = h.gold || 0;
        this.hero.inventory = Array.isArray(h.inventory) ? h.inventory : [];
        this.hero.equip = h.equip || this.hero.equip;
        this.hero.potions = h.potions || this.hero.potions;
        this.hero.state = h.state || this.hero.state;
        this.hero.lastMove = h.lastMove || this.hero.lastMove;
        this.hero.aimDir = h.aimDir || this.hero.aimDir;
      }

      if (data.progress) {
        this.progress.discoveredWaystones = new Set(data.progress.discoveredWaystones || []);
        this.progress.discoveredDocks = new Set(data.progress.discoveredDocks || []);
        this.progress.dungeonBest = data.progress.dungeonBest || 0;
        this.progress.visitedCamps = new Set(data.progress.visitedCamps || []);
        this.progress.eliteKills = data.progress.eliteKills || 0;
        this.progress.campRenown = data.progress.campRenown || {};
        this.progress.campRestBonusClaimed = data.progress.campRestBonusClaimed || {};
      }

      if (data.skillProg) {
        for (const k of ["q", "w", "e", "r"]) {
          if (data.skillProg[k]) {
            this.skillProg[k].xp = data.skillProg[k].xp || 0;
            this.skillProg[k].level = Math.max(1, data.skillProg[k].level || 1);
          }
        }
      }

      this.camera.x = this.hero.x;
      this.camera.y = this.hero.y;
    } catch (err) {
      console.warn("Load failed", err);
    }
  }

  _msg(text, t = 1.0) {
    this.msg = text;
    this.msgT = t;
  }
}