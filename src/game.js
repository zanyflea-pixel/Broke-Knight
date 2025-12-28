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

    this.rng = new RNG(9137221);

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    // v28 juice
    this.particles = [];
    this.popups = [];
    this.shakeT = 0;
    this.shakeMag = 0;

    this.cam = { x: 0, y: 0 };
    this.hint = "";

    // v28 settings
    this.settings = {
      particles: true,
      screenshake: true,
      showFps: false,
      autoPickupGear: true,
    };

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.world = new World(this.canvas.width, this.canvas.height);
    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    // v28 quest system
    this.quests = this.makeInitialQuests();

    this._mouseWorld = { x: this.hero.x, y: this.hero.y };
    this._mouseMoved = false;

    this.spawnTimer = 0.0;

    // v28 waystone UI state
    this._nearWaystoneIndex = -1;

    // Load save
    const s = loadGame();
    if (s) {
      if (s.hero) {
        this.hero.x = s.hero.x ?? this.hero.x;
        this.hero.y = s.hero.y ?? this.hero.y;
        this.hero.level = s.hero.level ?? this.hero.level;
        this.hero.xp = s.hero.xp ?? this.hero.xp;
        this.hero.nextXp = s.hero.nextXp ?? this.hero.nextXp;
        this.hero.gold = s.hero.gold ?? this.hero.gold;
        this.hero.hp = s.hero.hp ?? this.hero.hp;
        this.hero.mana = s.hero.mana ?? this.hero.mana;

        if (s.hero.potions) {
          this.hero.potions.hp = s.hero.potions.hp ?? this.hero.potions.hp;
          this.hero.potions.mana = s.hero.potions.mana ?? this.hero.potions.mana;
        }

        if (Array.isArray(s.hero.skills)) {
          for (const saved of s.hero.skills) {
            const k = this.hero.skills.find(ss => ss.id === saved.id);
            if (!k) continue;
            k.level = saved.level ?? k.level;
            k.xp = saved.xp ?? k.xp;
            k.nextXp = saved.nextXp ?? k.nextXp;
            k.cdT = 0;
          }
        }

        // keep sailing off on load
        this.hero.state.sailing = false;
      }

      if (s.settings) {
        this.settings.particles = s.settings.particles ?? this.settings.particles;
        this.settings.screenshake = s.settings.screenshake ?? this.settings.screenshake;
        this.settings.showFps = s.settings.showFps ?? this.settings.showFps;
        this.settings.autoPickupGear = s.settings.autoPickupGear ?? this.settings.autoPickupGear;
      }

      if (s.world && Array.isArray(s.world.waystonesActivated)) {
        for (const i of s.world.waystonesActivated) {
          if (this.world.waystones[i]) this.world.waystones[i].activated = true;
        }
      }

      if (s.quests) {
        this.quests = s.quests;
      }
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

    if (this.world?.setViewSize) {
      this.world.setViewSize(this.canvas.width, this.canvas.height);
    }
  }

  /* ============================
     V28: QUESTS
     ============================ */
  makeInitialQuests() {
    return {
      seed: 1,
      active: [
        { id: "q_kill_any", name: "Clear the Wilds", desc: "Defeat 12 enemies.", goal: 12, prog: 0, rewardGold: 40, rewardXp: 20, done: false },
        { id: "q_gold", name: "Pocket Change", desc: "Collect 120 gold.", goal: 120, prog: 0, rewardGold: 30, rewardXp: 0, done: false },
        { id: "q_waystone", name: "Attune a Waystone", desc: "Activate any waystone.", goal: 1, prog: 0, rewardGold: 0, rewardXp: 35, done: false },
      ],
      completed: 0,
      kills: 0,
      goldEarned: 0,
      waystones: 0,
    };
  }

  onQuestKill() {
    this.quests.kills++;
    for (const q of this.quests.active) {
      if (q.done) continue;
      if (q.id === "q_kill_any") q.prog = Math.min(q.goal, q.prog + 1);
      if (q.id === "q_chargers") q.prog = q.prog; // updated via type hooks if you add them later
      if (q.id === "q_shamans") q.prog = q.prog;  // updated via type hooks if you add them later
    }
    this.checkQuestCompletions();
  }

  onQuestGold(amt) {
    this.quests.goldEarned += amt;
    for (const q of this.quests.active) {
      if (q.done) continue;
      if (q.id === "q_gold") q.prog = Math.min(q.goal, q.prog + amt);
    }
    this.checkQuestCompletions();
  }

  onQuestWaystone() {
    this.quests.waystones++;
    for (const q of this.quests.active) {
      if (q.done) continue;
      if (q.id === "q_waystone") q.prog = Math.min(q.goal, q.prog + 1);
    }
    this.checkQuestCompletions();
  }

  checkQuestCompletions() {
    for (const q of this.quests.active) {
      if (!q.done && q.prog >= q.goal) {
        q.done = true;
        this.quests.completed++;

        if (q.rewardGold) this.hero.gold += q.rewardGold;
        if (q.rewardXp) this.hero.giveXP(q.rewardXp);

        this.ui.setMsg(`Quest complete: ${q.name}`);
        this.addPopup(`+${q.rewardGold || 0}g  +${q.rewardXp || 0}xp`, this.hero.x, this.hero.y - 24, "#ffd27a");
        if (this.settings.screenshake) this.addShake(0.15, 4);

        // slot in a fresh quest occasionally
        this.rollNewQuest();
      }
    }
  }

  rollNewQuest() {
    // keep it simple: when a quest completes, replace it with a different one if there is a free slot
    const open = this.quests.active.filter(q => !q.done).length;
    if (open >= 3) return;

    const pool = [
      { id: "q_chargers", name: "Stop the Chargers", desc: "Defeat 3 chargers.", goal: 3, prog: 0, rewardGold: 55, rewardXp: 20, done: false },
      { id: "q_shamans", name: "Silence the Shamans", desc: "Defeat 3 shamans.", goal: 3, prog: 0, rewardGold: 55, rewardXp: 25, done: false },
      { id: "q_potions", name: "Stock Up", desc: "Pick up 3 potions.", goal: 3, prog: 0, rewardGold: 35, rewardXp: 10, done: false },
    ];

    // avoid duplicates
    const existing = new Set(this.quests.active.map(q => q.id));
    const choices = pool.filter(q => !existing.has(q.id));
    if (!choices.length) return;

    const pick = choices[Math.floor(this.rng.float() * choices.length)];
    this.quests.active.push(pick);
  }

  /* ============================
     V28: JUICE
     ============================ */
  addShake(t, mag) {
    this.shakeT = Math.max(this.shakeT, t);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  addPopup(text, x, y, col = "#ffffff") {
    this.popups.push({ text, x, y, col, t: 0, life: 0.9 });
  }

  burst(x, y, n = 10, spd = 220, life = 0.35, col = "rgba(255,255,255,0.9)") {
    if (!this.settings.particles) return;
    for (let i = 0; i < n; i++) {
      const a = this.rng.float() * Math.PI * 2;
      const v = spd * (0.3 + this.rng.float() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        t: 0,
        r: 1.2 + this.rng.float() * 2.2,
        col,
      });
    }
  }

  ring(x, y, r0, col = "rgba(140,210,255,0.9)") {
    if (!this.settings.particles) return;
    this.particles.push({ kind: "ring", x, y, r0, r: r0, t: 0, life: 0.35, col });
  }

  onHeroHit(dmg, x, y) {
    this.ui.setMsg(`-${dmg} HP`);
    this.addPopup(`-${dmg}`, this.hero.x, this.hero.y - 26, "#ff6a86");
    if (this.settings.screenshake) this.addShake(0.18, 5);
    this.burst(this.hero.x, this.hero.y, 8, 210, 0.28, "rgba(255,90,125,0.9)");
  }

  /* ============================
     UPDATE
     ============================ */
  update(dt) {
    // --- INPUT / MENUS ---
    if (this.input.pressed("escape")) this.ui.closeAll();
    if (this.input.pressed("m")) this.ui.toggle("map");
    if (this.input.pressed("k")) this.ui.toggle("skills");
    if (this.input.pressed("i")) this.ui.toggle("stats");
    if (this.input.pressed("j")) this.ui.toggle("quests");
    if (this.input.pressed("o")) this.ui.toggle("options");
    if (this.input.pressed("t")) this.ui.toggle("waypoints");

    // God mode toggle
    if (this.input.pressed("g")) {
      this.hero.state.invulnerable = !this.hero.state.invulnerable;
      this.ui.setMsg(`God mode: ${this.hero.state.invulnerable ? "ON" : "OFF"}`);
    }

    // options hotkeys
    if (this.ui.open.options) {
      if (this.input.pressed("1")) this.settings.particles = !this.settings.particles;
      if (this.input.pressed("2")) this.settings.screenshake = !this.settings.screenshake;
      if (this.input.pressed("3")) this.settings.showFps = !this.settings.showFps;
      if (this.input.pressed("4")) this.settings.autoPickupGear = !this.settings.autoPickupGear;
    }

    // Waypoints menu: number keys teleport
    if (this.ui.open.waypoints) {
      const activated = this.world.waystones
        .map((w, i) => ({ w, i }))
        .filter(o => o.w.activated);

      for (let k = 1; k <= 9; k++) {
        if (this.input.pressed(String(k))) {
          const pick = activated[k - 1];
          if (pick) {
            this.teleportToWaystone(pick.i);
            this.ui.closeAll();
          }
        }
      }
    }

    // Mouse -> world coords
    this._mouseWorld.x = this.cam.x + this.input.mouse.x;
    this._mouseWorld.y = this.cam.y + this.input.mouse.y;
    if (dist2(this._mouseWorld.x, this._mouseWorld.y, this.hero.x, this.hero.y) > 25) {
      this._mouseMoved = true;
    }

    const uiBlocking =
      this.ui.open.map ||
      this.ui.open.stats ||
      this.ui.open.skills ||
      this.ui.open.quests ||
      this.ui.open.options ||
      this.ui.open.waypoints;

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

        // move w/ collision
        const nx = this.hero.x + mx * baseSpd * dt;
        const ny = this.hero.y + my * baseSpd * dt;

        const T = this.world.terrainAt(nx, ny);
        const inRiver = this.world.isInRiver(nx, ny);

        // allow river if not sailing (wading)
        const canWalk = !T.ocean && !T.mountain;
        const canSail = (T.ocean || inRiver);

        if (this.hero.state.sailing) {
          if (canSail) { this.hero.x = nx; this.hero.y = ny; }
        } else {
          if (canWalk) { this.hero.x = nx; this.hero.y = ny; }
        }
      }

      // sailing toggle at docks OR waystone interact
      if (this.input.pressed("e")) {
        // v28: E is context sensitive (dock / waystone)
        const ws = this.nearestWaystone(this.hero.x, this.hero.y, 52);
        if (ws) {
          if (!this.world.waystones[ws.index].activated) {
            this.world.waystones[ws.index].activated = true;
            this.ui.setMsg(`Waystone attuned: ${this.world.waystones[ws.index].name}`);
            this.onQuestWaystone();
            this.ring(this.world.waystones[ws.index].x, this.world.waystones[ws.index].y, 38, "rgba(255,210,138,0.9)");
          } else {
            // rest: heal/mana small burst
            const st = this.hero.getStats();
            this.hero.hp = Math.min(st.maxHp, this.hero.hp + 35);
            this.hero.mana = Math.min(st.maxMana, this.hero.mana + 40);
            this.ui.setMsg("Rested at the waystone.");
            this.ring(this.hero.x, this.hero.y, 32, "rgba(180,255,210,0.9)");
          }
        } else {
          const can = this.world.isNearDock(this.hero.x, this.hero.y);
          if (can) {
            this.hero.state.sailing = !this.hero.state.sailing;
            this.ui.setMsg(`Sailing: ${this.hero.state.sailing ? "ON" : "OFF"}`);
          } else {
            this.ui.setMsg("Nothing to interact with.");
          }
        }
      }

      // quick consume potion
      if (this.input.pressed("q")) {
        this.usePotion();
      }

      // Skill casting
      if (this.input.pressed("a")) this.castSkill("fireball");
      if (this.input.pressed("s")) this.castSkill("frostNova");
      if (this.input.pressed("d")) this.castSkill("dash");
      if (this.input.pressed("f")) this.castSkill("chain");
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
    for (const e of this.enemies) e.update(dt, this.hero, this.world, this);

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
        this.addPopup(`+${xp}xp`, e.x, e.y - 18, "#aee0ff");
        this.dropLoot(e.x, e.y, e.tier);
        this.onQuestKill();
        this.enemies.splice(i, 1);
      }
    }

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.05;
      this.spawnEnemies();
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const P = this.particles[i];
      P.t += dt;
      P.life -= dt;
      if (P.kind === "ring") {
        P.r = P.r0 + P.t * 160;
      } else {
        P.x += P.vx * dt;
        P.y += P.vy * dt;
        P.vx *= 0.98;
        P.vy *= 0.98;
      }
      if (P.life <= 0) this.particles.splice(i, 1);
    }

    // Popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const T = this.popups[i];
      T.t += dt;
      T.life -= dt;
      T.y -= dt * 32;
      if (T.life <= 0) this.popups.splice(i, 1);
    }

    // Screen shake timer
    this.shakeT = Math.max(0, this.shakeT - dt);

    // Camera
    const maxCamX = Math.max(0, this.world.width - this.canvas.width);
    const maxCamY = Math.max(0, this.world.height - this.canvas.height);
    this.cam.x = clamp(this.hero.x - this.canvas.width / 2, 0, maxCamX);
    this.cam.y = clamp(this.hero.y - this.canvas.height / 2, 0, maxCamY);

    // Hints (dock / waystone)
    this.hint = "";
    const ws = this.nearestWaystone(this.hero.x, this.hero.y, 70);
    if (ws) {
      const w = this.world.waystones[ws.index];
      this.hint = w.activated ? `Waystone: ${w.name} (E to rest, T to teleport)` : `Waystone: ${w.name} (E to attune)`;
    } else if (this.world.isNearDock(this.hero.x, this.hero.y)) {
      this.hint = "Dock nearby: press E to sail.";
    }

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
          hp: this.hero.hp, mana: this.hero.mana,
          potions: { hp: this.hero.potions.hp, mana: this.hero.potions.mana },
          skills: this.hero.skills.map(s => ({ id: s.id, level: s.level, xp: s.xp, nextXp: s.nextXp })),
        },
        world: {
          waystonesActivated: this.world.waystones.map((w, i) => w.activated ? i : null).filter(v => v !== null),
        },
        settings: { ...this.settings },
        quests: this.quests,
      });
    }

    this.world.update(dt, this.hero);
    this.input.endFrame();
  }

  nearestWaystone(x, y, r = 64) {
    let best = null;
    let bestD2 = r * r;
    for (let i = 0; i < this.world.waystones.length; i++) {
      const w = this.world.waystones[i];
      const d2 = dist2(x, y, w.x, w.y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { index: i, d2 };
      }
    }
    return best;
  }

  teleportToWaystone(index) {
    const w = this.world.waystones[index];
    if (!w || !w.activated) return;
    this.hero.x = w.x;
    this.hero.y = w.y + 42;
    this.hero.state.sailing = false;
    this.ui.setMsg(`Teleported: ${w.name}`);
    this.ring(this.hero.x, this.hero.y, 42, "rgba(255,210,138,0.95)");
    if (this.settings.screenshake) this.addShake(0.18, 6);
  }

  usePotion() {
    const st = this.hero.getStats();
    // prefer HP potion if HP low, else mana potion if mana low
    const hpNeed = (st.maxHp - this.hero.hp) / st.maxHp;
    const manaNeed = (st.maxMana - this.hero.mana) / st.maxMana;

    if (this.hero.potions.hp <= 0 && this.hero.potions.mana <= 0) {
      this.ui.setMsg("No potions.");
      return;
    }

    if (hpNeed >= manaNeed && this.hero.potions.hp > 0) {
      this.hero.potions.hp--;
      this.hero.hp = Math.min(st.maxHp, this.hero.hp + Math.round(42 + st.maxHp * 0.18));
      this.ui.setMsg("Used HP potion.");
      this.ring(this.hero.x, this.hero.y, 26, "rgba(255,110,140,0.95)");
      return;
    }

    if (this.hero.potions.mana > 0) {
      this.hero.potions.mana--;
      this.hero.mana = Math.min(st.maxMana, this.hero.mana + Math.round(55 + st.maxMana * 0.20));
      this.ui.setMsg("Used Mana potion.");
      this.ring(this.hero.x, this.hero.y, 26, "rgba(120,200,255,0.95)");
      return;
    }

    // fallback
    if (this.hero.potions.hp > 0) {
      this.hero.potions.hp--;
      this.hero.hp = Math.min(st.maxHp, this.hero.hp + Math.round(42 + st.maxHp * 0.18));
      this.ui.setMsg("Used HP potion.");
      this.ring(this.hero.x, this.hero.y, 26, "rgba(255,110,140,0.95)");
    }
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

    // direction: mouse if moved, else last movement
    let dir;
    if (this._mouseMoved) dir = norm(this._mouseWorld.x - this.hero.x, this._mouseWorld.y - this.hero.y);
    else dir = norm(this.hero.lastMove.x, this.hero.lastMove.y);

    // allow cast even if standing still
    if (!isFinite(dir.x) || !isFinite(dir.y)) dir = { x: 1, y: 0 };

    if (id === "fireball") {
      this.hero.mana -= s.mana;

      // v28 scaling: skill level improves damage + speed slightly
      const lvl = s.level;
      const spd = 520 + lvl * 18;
      const dmg = Math.round((st.dmg * 0.85 + 10) * (1 + lvl * 0.08));

      const p = new Projectile(
        this.hero.x + dir.x * (this.hero.r + 6),
        this.hero.y + dir.y * (this.hero.r + 6),
        dir.x * spd,
        dir.y * spd,
        dmg,
        0.95,
        lvl,
        {
          kind: "fire",
          onHit: (enemy, dealt) => {
            this.addPopup(`-${dealt}`, enemy.x, enemy.y - 14, "#ffd27a");
            this.burst(enemy.x, enemy.y, 10, 240, 0.32, "rgba(255,210,138,0.95)");
            if (this.settings.screenshake) this.addShake(0.08, 3);
          }
        }
      );

      this.projectiles.push(p);
      s.cdT = s.cd;
      this.hero.skillUse(id);

      this.ui.skillName = `${s.name} Lv.${s.level}`;
      this.ui.skillPulse = 0.26;
      return;
    }

    if (id === "frostNova") {
      this.hero.mana -= s.mana;

      const lvl = s.level;
      const radius = 92 + lvl * 10;
      const base = Math.round(12 + lvl * 6 + st.dmg * 0.35);
      let hits = 0;

      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d2 = dist2(this.hero.x, this.hero.y, e.x, e.y);
        if (d2 <= radius * radius) {
          const dealt = e.takeDamage(base, { x: this.hero.x, y: this.hero.y });
          e.applySlow(0.55, 1.6 + lvl * 0.15);
          this.addPopup(`-${dealt}`, e.x, e.y - 14, "#bfe8ff");
          hits++;
        }
      }

      if (hits > 0) this.burst(this.hero.x, this.hero.y, 14 + lvl * 2, 260, 0.35, "rgba(165,220,255,0.95)");
      this.ring(this.hero.x, this.hero.y, radius * 0.35, "rgba(165,220,255,0.9)");
      if (this.settings.screenshake) this.addShake(0.10, 4);

      s.cdT = s.cd;
      this.hero.skillUse(id);

      this.ui.skillName = `${s.name} Lv.${s.level}`;
      this.ui.skillPulse = 0.26;
      return;
    }

    if (id === "dash") {
      this.hero.mana -= s.mana;

      const lvl = s.level;
      const dist = 140 + lvl * 18;
      const step = 10;
      let moved = 0;

      // short invuln while dashing
      this.hero.state.invulnT = 0.22 + lvl * 0.02;

      for (let i = 0; i < dist / step; i++) {
        const nx = this.hero.x + dir.x * step;
        const ny = this.hero.y + dir.y * step;
        const T = this.world.terrainAt(nx, ny);
        if (T.ocean || T.mountain) break;
        this.hero.x = nx;
        this.hero.y = ny;
        moved += step;
      }

      if (moved > 0) {
        this.burst(this.hero.x, this.hero.y, 10 + lvl * 2, 180, 0.25, "rgba(255,255,255,0.85)");
        if (this.settings.screenshake) this.addShake(0.07, 3);
      }

      s.cdT = s.cd;
      this.hero.skillUse(id);

      this.ui.skillName = `${s.name} Lv.${s.level}`;
      this.ui.skillPulse = 0.26;
      return;
    }

    if (id === "chain") {
      this.hero.mana -= s.mana;

      const lvl = s.level;
      const dmg = Math.round(10 + lvl * 7 + st.dmg * 0.40);
      const range = 320 + lvl * 10;
      const jumpRange = 210 + lvl * 8;
      const jumps = 3 + Math.floor(lvl / 2);

      // target: nearest enemy along direction, within range
      let target = null;
      let best = range * range;

      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - this.hero.x;
        const dy = e.y - this.hero.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > best) continue;

        // rough cone: dot must be positive and near direction
        const dd = Math.hypot(dx, dy) || 1;
        const dot = (dx / dd) * dir.x + (dy / dd) * dir.y;
        if (dot < 0.45) continue;

        best = d2;
        target = e;
      }

      if (!target) {
        this.ui.setMsg("No target.");
        return;
      }

      const hit = new Set();
      let cur = target;
      for (let j = 0; j < jumps; j++) {
        if (!cur || hit.has(cur)) break;
        hit.add(cur);

        const dealt = cur.takeDamage(dmg, { x: this.hero.x, y: this.hero.y });
        this.addPopup(`-${dealt}`, cur.x, cur.y - 14, "#caa9ff");
        this.burst(cur.x, cur.y, 10, 260, 0.30, "rgba(200,160,255,0.95)");

        // find next
        let next = null;
        let best2 = jumpRange * jumpRange;
        for (const e of this.enemies) {
          if (!e.alive || hit.has(e)) continue;
          const d2 = dist2(cur.x, cur.y, e.x, e.y);
          if (d2 < best2) { best2 = d2; next = e; }
        }
        cur = next;
      }

      if (this.settings.screenshake) this.addShake(0.10, 4);

      s.cdT = s.cd;
      this.hero.skillUse(id);

      this.ui.skillName = `${s.name} Lv.${s.level}`;
      this.ui.skillPulse = 0.26;
      return;
    }
  }

  spawnEnemies() {
    if (this.enemies.length > 22) return;

    const r = 520 + this.rng.float() * 540;
    const ang = this.rng.float() * Math.PI * 2;
    const x = clamp(this.hero.x + Math.cos(ang) * r, 40, this.world.width - 40);
    const y = clamp(this.hero.y + Math.sin(ang) * r, 40, this.world.height - 40);

    const T = this.world.terrainAt(x, y);
    if (T.ocean || T.mountain) return;

    // tier scales with hero
    const tier = clamp(1 + Math.floor(this.hero.level / 3) + (this.rng.float() > 0.85 ? 1 : 0), 1, 10);

    // v28: richer mix
    const roll = this.rng.float();
    let type = "grunt";
    if (roll > 0.82) type = "shaman";
    else if (roll > 0.62) type = "charger";

    this.enemies.push(new Enemy(x, y, tier, type));
  }

  dropLoot(x, y, tier) {
    const gold = 2 + Math.round(tier * (2 + this.rng.float() * 3));
    this.loot.push(new Loot(x + 12, y + 6, { kind: "gold", amt: gold }));

    // v28: potions
    const potRoll = this.rng.float() + tier * 0.02;
    if (potRoll > 0.85) {
      const isMana = this.rng.float() > 0.55;
      this.loot.push(new Loot(x - 8, y + 10, { kind: "potion", potionType: isMana ? "mana" : "hp" }));
    }

    if (this.rng.float() < 0.38) {
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
      this.onQuestGold(item.amt);
      this.ui.setMsg(`+${item.amt} gold`);
      this.addPopup(`+${item.amt}g`, this.hero.x, this.hero.y - 16, "#ffd27a");
      return;
    }

    if (item.kind === "potion") {
      if (item.potionType === "mana") this.hero.potions.mana++;
      else this.hero.potions.hp++;

      // quest hook
      for (const q of this.quests.active) {
        if (q.done) continue;
        if (q.id === "q_potions") q.prog = Math.min(q.goal, q.prog + 1);
      }
      this.checkQuestCompletions();

      this.ui.setMsg(`Picked up ${item.potionType === "mana" ? "Mana" : "HP"} potion`);
      this.addPopup("+potion", this.hero.x, this.hero.y - 16, "#d7e0ff");
      return;
    }

    // gear
    this.hero.inventory.push(item);

    // auto-equip if empty slot
    if (this.settings.autoPickupGear && !this.hero.equip[item.slot]) {
      this.hero.equip[item.slot] = item;
      this.ui.setMsg(`Equipped: ${item.name}`);
      const st = this.hero.getStats();
      this.hero.hp = Math.min(this.hero.hp, st.maxHp);
      this.hero.mana = Math.min(this.hero.mana, st.maxMana);
    } else {
      this.ui.setMsg(`Looted: ${item.name}`);
    }
  }

  draw(t) {
    const ctx = this.ctx;

    // screen clear
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // shake
    let sx = 0, sy = 0;
    if (this.settings.screenshake && this.shakeT > 0) {
      const k = (this.shakeT / 0.25);
      const mag = this.shakeMag * (0.35 + 0.65 * k);
      sx = (this.rng.float() * 2 - 1) * mag;
      sy = (this.rng.float() * 2 - 1) * mag;
    }

    // world
    ctx.save();
    ctx.translate(-this.cam.x + sx, -this.cam.y + sy);

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

    // particles
    for (const P of this.particles) {
      const a = clamp(P.life / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = P.col || "#fff";
      if (P.kind === "ring") {
        ctx.strokeStyle = P.col || "#fff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(P.x, P.y, P.r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(P.x, P.y, P.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // floating text
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const T of this.popups) {
      ctx.globalAlpha = clamp(T.life / 0.9, 0, 1);
      ctx.fillStyle = T.col;
      ctx.fillText(T.text, T.x, T.y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";

    ctx.restore();

    // UI
    this.ui.draw(ctx, this);

    // death overlay
    if (this.hero.hp <= 0) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#ffffff";
      ctx.font = "34px system-ui, sans-serif";
      ctx.fillText("YOU DIED", 40, 70);

      ctx.font = "16px system-ui, sans-serif";
      ctx.fillStyle = "#d7e0ff";
      ctx.fillText("Reload the page to try again. (Save persists.)", 40, 100);
    }

    // FPS (optional)
    if (this.settings.showFps) {
      const now = performance.now();
      this._fpsT = (this._fpsT ?? now);
      this._fpsFrames = (this._fpsFrames ?? 0) + 1;
      if (now - this._fpsT > 350) {
        this._fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsT));
        this._fpsFrames = 0;
        this._fpsT = now;
      }
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(14, this.canvas.height - 42, 86, 28);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(`FPS: ${this._fps ?? "--"}`, 24, this.canvas.height - 22);
    }
  }
}
