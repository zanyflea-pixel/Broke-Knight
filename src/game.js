// src/game.js
// v30 gameplay/control fixes:
// - Movement is ARROW KEYS ONLY (NO WASD) so QWERT can be spells.
// - Spells: Q/W/R/F (E reserved for interact/docks/waystones)
// - Enemy spawns are grouped into deterministic camps with a leash (no more "from all over the map").
// - Options menu hotkeys moved off 1/2 (those are potions).

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

    // Fullscreen canvas styling (prevents CSS stretch mismatches)
    this._applyCanvasStyle();

    this.input = new Input(canvas);
    this.ui = new UI();

    // View in CSS pixels
    this.viewW = 800;
    this.viewH = 600;
    this.dpr = 1;

    // World created now; view size is set in _syncCanvasSize()
    this.world = new World(this.viewW, this.viewH);

    // Create hero at spawn
    this.hero = new Hero(this.world.spawn.x, this.world.spawn.y);

    // Stable defaults
    this.hero.level = this.hero.level || 1;
    this.hero.xp = this.hero.xp || 0;
    this.hero.nextXp = this.hero.nextXp || 30;
    this.hero.gold = this.hero.gold || 0;
    this.hero.potions = this.hero.potions || { hp: 3, mana: 2 };
    this.hero.state = this.hero.state || { sailing: false, invulnerable: false, invulnT: 0 };
    this.hero.inventory = this.hero.inventory || [];
    this.hero.equip = this.hero.equip || { helm: null, chest: null, boots: null, weapon: null, ring: null };
    this.hero.lastMove = this.hero.lastMove || { x: 1, y: 0 };

    // Camera in world units (same space as world coords)
    this.cam = { x: 0, y: 0 };

    // Lists
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    // UI hint string
    this.hint = "";

    // Settings (options menu)
    this.settings = {
      particles: true,
      screenshake: true,
      showFps: false,
      autoPickupGear: true,
    };

    // Skills definition (QWERT)
    this.skills = {
      q: { id: "bolt", name: "Shock Bolt", mana: 6, cd: 0.22, desc: "Fast bolt" },
      w: { id: "nova", name: "Shock Nova", mana: 14, cd: 1.2, desc: "AoE burst" },
      r: { id: "dash", name: "Dash", mana: 10, cd: 1.0, desc: "Quick dash" },
      f: { id: "pierce", name: "Arc Pierce", mana: 10, cd: 0.75, desc: "Piercing bolt" },
    };

    // Cooldowns
    this.cd = { q: 0, w: 0, r: 0, f: 0 };

    // Deterministic spawn camps
    this.spawnCamps = [];
    this._spawnTimers = new Map();
    this._buildSpawnCamps();

    // Quests
    this.quests = [];
    this._initQuests();

    // Timers
    this._saveT = 0;
    this._t = 0;

    // Make sizing correct immediately
    this._syncCanvasSize(true);

    // Load save
    const save = loadGame();
    if (save) this.applySave(save);

    // Ensure enemies exist
    this._ensureCampsSpawned(true);
  }

  _applyCanvasStyle() {
    try {
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.overflow = "hidden";
    } catch {}

    const c = this.canvas;
    c.style.position = "fixed";
    c.style.left = "0";
    c.style.top = "0";
    c.style.width = "100vw";
    c.style.height = "100vh";
    c.style.display = "block";
  }

  // Called externally if desired; safe to call any time.
  onResize() {
    this._syncCanvasSize(true);
  }

  _syncCanvasSize(force = false) {
    // Use window size in CSS pixels (the actual visible screen space)
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);

    // DPR backing buffer
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const bufW = Math.floor(cssW * dpr);
    const bufH = Math.floor(cssH * dpr);

    const changed =
      force ||
      cssW !== this.viewW ||
      cssH !== this.viewH ||
      dpr !== this.dpr ||
      this.canvas.width !== bufW ||
      this.canvas.height !== bufH;

    if (!changed) return;

    this.viewW = cssW;
    this.viewH = cssH;
    this.dpr = dpr;

    // Apply backing buffer size
    this.canvas.width = bufW;
    this.canvas.height = bufH;

    // Let world sync view metrics
    this.world.setViewSize?.(this.viewW, this.viewH);
  }

  /* ============================
     SAVE / LOAD
     ============================ */
  applySave(s) {
    try {
      if (s.settings) this.settings = { ...this.settings, ...s.settings };

      if (s.hero) {
        Object.assign(this.hero, s.hero);

        this.hero.potions = this.hero.potions || { hp: 3, mana: 2 };
        this.hero.state = this.hero.state || { sailing: false, invulnerable: false, invulnT: 0 };
        this.hero.inventory = this.hero.inventory || [];
        this.hero.equip = this.hero.equip || { helm: null, chest: null, boots: null, weapon: null, ring: null };
        this.hero.lastMove = this.hero.lastMove || { x: 1, y: 0 };

        if (!Number.isFinite(this.hero.x)) this.hero.x = this.world.spawn.x;
        if (!Number.isFinite(this.hero.y)) this.hero.y = this.world.spawn.y;
        if (!Number.isFinite(this.hero.hp)) this.hero.hp = this.hero.getStats().maxHp;
        if (!Number.isFinite(this.hero.mana)) this.hero.mana = this.hero.getStats().maxMana;
      }

      if (s.world?.waystonesActivated && Array.isArray(s.world.waystonesActivated)) {
        for (const i of s.world.waystonesActivated) {
          const w = this.world.waystones?.[i];
          if (w) w.activated = true;
        }
      }

      if (Array.isArray(s.quests)) this.quests = s.quests;
      else if (s.quests?.active && Array.isArray(s.quests.active)) this.quests = s.quests.active;

      // If saved while sailing, clamp to valid water spot
      if (this.hero.state?.sailing && !this.world.canSail(this.hero.x, this.hero.y)) {
        const d = this.world.nearestDock(this.hero.x, this.hero.y, 800) || this.world.docks?.[0];
        if (d) {
          const p = this._pushFromDockToWater(d);
          if (p) {
            this.hero.x = p.x;
            this.hero.y = p.y;
          } else this.hero.state.sailing = false;
        } else {
          this.hero.state.sailing = false;
        }
      }
    } catch {
      // ignore corrupt save
    }
  }

  /* ============================
     QUESTS
     ============================ */
  _initQuests() {
    if (Array.isArray(this.quests) && this.quests.length) return;

    this.quests = [
      { id: "welcome", name: "A Knight, Broke", desc: "Find a dock and board a boat (Press E at a dock).", state: "active", progress: { boarded: 0 } },
      { id: "attune", name: "Waystone Attunement", desc: "Attune a waystone (Press E near a waystone).", state: "active", progress: { attuned: 0 } },
      { id: "kills", name: "Clear the Camps", desc: "Defeat 12 enemies.", state: "active", progress: { kills: 0, goal: 12 }, rewardGold: 45 },
      { id: "gold", name: "Earn Some Coin", desc: "Collect 120 gold.", state: "active", progress: { gold: 0, goal: 120 }, rewardGold: 25 },
    ];
  }

  _questById(id) {
    return this.quests.find((q) => q.id === id);
  }

  _completeQuest(id) {
    const q = this._questById(id);
    if (!q || q.state === "done") return;
    q.state = "done";
    if (q.rewardGold) {
      this.hero.gold += q.rewardGold;
      this.ui.setMsg(`Quest complete! +${q.rewardGold} gold`);
    } else {
      this.ui.setMsg("Quest complete!");
    }
  }

  onQuestKill() {
    const q = this._questById("kills");
    if (q && q.state !== "done") {
      q.progress.kills = (q.progress.kills || 0) + 1;
      if (q.progress.kills >= q.progress.goal) this._completeQuest("kills");
    }
  }

  onQuestGold(amt) {
    const q = this._questById("gold");
    if (q && q.state !== "done") {
      q.progress.gold = (q.progress.gold || 0) + Math.max(0, amt);
      if (q.progress.gold >= q.progress.goal) this._completeQuest("gold");
    }
  }

  onQuestBoarded() {
    const q = this._questById("welcome");
    if (q && q.state !== "done") {
      q.progress.boarded = 1;
      this._completeQuest("welcome");
    }
  }

  onQuestAttuned() {
    const q = this._questById("attune");
    if (q && q.state !== "done") {
      q.progress.attuned = 1;
      this._completeQuest("attune");
    }
  }

  /* ============================
     SPAWNS
     ============================ */
  _buildSpawnCamps() {
    const rng = new RNG((this.world.seed || 12345) + 99111);
    const camps = [];
    let tries = 0;

    while (camps.length < 10 && tries++ < 4000) {
      const x = 200 + rng.float() * (this.world.width - 400);
      const y = 200 + rng.float() * (this.world.height - 400);

      if (!this.world.canWalk(x, y)) continue;
      if (dist2(x, y, this.world.spawn.x, this.world.spawn.y) < 900 * 900) continue;

      let ok = true;
      for (const c of camps) {
        if (dist2(x, y, c.x, c.y) < 600 * 600) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const biome = this.world.biomeAt(x, y);
      const types = this._enemyPoolForBiome(biome);

      camps.push({
        x,
        y,
        biome,
        tier: 1 + ((rng.float() * 3) | 0),
        groupSize: 4 + ((rng.float() * 3) | 0),
        types,
      });
    }

    this.spawnCamps = camps;
    for (let i = 0; i < this.spawnCamps.length; i++) this._spawnTimers.set(i, 0);
  }

  _enemyPoolForBiome(biome) {
    if (biome === "desert") return ["scorpion", "raider", "grunt"];
    if (biome === "swamp") return ["slime", "leech", "grunt"];
    if (biome === "snow") return ["wisp", "wolf", "grunt"];
    if (biome === "forest") return ["sprite", "brute", "grunt"];
    return ["grunt", "brute", "slime"];
  }

  _ensureCampsSpawned(force = false) {
    for (let i = 0; i < this.spawnCamps.length; i++) {
      const c = this.spawnCamps[i];
      const timer = this._spawnTimers.get(i) || 0;

      // only consider enemies in/near this camp
      const aliveNear = this.enemies.some((e) => e.alive && e.ai && e.ai.campId === i);
      if (!aliveNear && (force || timer <= 0)) {
        this._spawnCampGroup(c, i);
        this._spawnTimers.set(i, 60.0);
      }
    }
  }

  _spawnCampGroup(c, campId) {
    const rng = new RNG(((this.world.seed || 12345) ^ ((c.x | 0) * 31) ^ ((c.y | 0) * 97) ^ (campId * 131)) >>> 0);

    for (let k = 0; k < c.groupSize; k++) {
      const ang = rng.float() * Math.PI * 2;
      const rad = 70 + rng.float() * 120;
      const ex = c.x + Math.cos(ang) * rad;
      const ey = c.y + Math.sin(ang) * rad;

      if (!this.world.canWalk(ex, ey)) continue;

      const t = c.types[rng.int(0, c.types.length - 1)];
      const e = new Enemy(ex, ey, c.tier, t, c.biome);

      // Camp AI: enemies stay grouped, only aggro nearby, and leash back to camp.
      e.ai = {
        campId,
        centerX: c.x,
        centerY: c.y,
        leash: 280,
        aggro: false,
        roamT: rng.float() * 3.0,
        roamAng: rng.float() * Math.PI * 2,
      };

      this.enemies.push(e);
    }
  }

  /* ============================
     INTERACTIONS
     ============================ */
  _nearestWaystone() {
    let best = null;
    let bestD = 1e18;
    for (const w of this.world.waystones || []) {
      const d = dist2(this.hero.x, this.hero.y, w.x, w.y);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best ? { w: best, d: bestD } : null;
  }

  _pushFromDockToWater(dock) {
    const dir = dock.facing || 1;
    let x = dock.x + dir * 90;
    let y = dock.y;

    for (let i = 0; i < 18; i++) {
      if (this.world.canSail(x, y)) return { x, y };
      x += dir * 22;
      y += i % 2 === 0 ? 8 : -8;
    }

    const step = 26;
    for (let r = 40; r < 420; r += step) {
      for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const px = dock.x + Math.cos(a) * r;
        const py = dock.y + Math.sin(a) * r;
        if (this.world.canSail(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  _handleOptionsInputs() {
    if (!this.ui.open.options) return;

    // Options menu hotkeys (avoid 1/2 because those are potions)
    // Z: particles, X: screenshake, C: show FPS, V: auto-pickup gear
    const z = this.input.pressed("z");
    const x = this.input.pressed("x");
    const c = this.input.pressed("c");
    const v = this.input.pressed("v");

    if (z) this.settings.particles = !this.settings.particles;
    if (x) this.settings.screenshake = !this.settings.screenshake;
    if (c) this.settings.showFps = !this.settings.showFps;
    if (v) this.settings.autoPickupGear = !this.settings.autoPickupGear;

    if (z || x || c || v) this.ui.setMsg("Options updated.");
  }

  _handleWaystoneInputs() {
    const near = this._nearestWaystone();
    if (near && near.d < 70 * 70) {
      this.hint = near.w.activated ? "Waystone (attuned) — Press T for travel list" : "Press E to attune Waystone";
      if (this.input.pressed("e") && !near.w.activated) {
        near.w.activated = true;
        this.ui.setMsg(`Attuned: ${near.w.name || "Waystone"}`);
        this.onQuestAttuned();
      }
    }

    if (this.ui.open.waypoints) {
      const act = (this.world.waystones || []).filter((w) => w.activated);
      for (let n = 1; n <= 9; n++) {
        if (this.input.pressed(String(n))) {
          const target = act[n - 1];
          if (!target) {
            this.ui.setMsg("No waystone in that slot.");
            continue;
          }
          if (this.hero.state.sailing) {
            this.ui.setMsg("You cannot waystone-travel while sailing.");
            continue;
          }
          this.hero.x = target.x + 40;
          this.hero.y = target.y + 40;
          this.ui.setMsg(`Traveled to: ${target.name || "Waystone"}`);
          this.ui.closeAll();
        }
      }
    }
  }

  _handleDockSailing() {
    const nearDock = this.world.nearestDock(this.hero.x, this.hero.y, 90);

    if (!this.hero.state.sailing) {
      if (nearDock) {
        if (!this.hint) this.hint = "Dock — Press E to board and sail";
        if (this.input.pressed("e")) {
          const p = this._pushFromDockToWater(nearDock);
          if (p) {
            this.hero.x = p.x;
            this.hero.y = p.y;
            this.hero.state.sailing = true;
            this.ui.setMsg("Boarded boat. You are now sailing.");
            this.onQuestBoarded();
          } else this.ui.setMsg("No water found near dock.");
        }
      }
      return;
    }

    if (nearDock) {
      if (!this.hint) this.hint = "Dock — Press E to disembark";
      if (this.input.pressed("e")) {
        this.hero.x = nearDock.x;
        this.hero.y = nearDock.y;
        this.hero.state.sailing = false;
        this.ui.setMsg("Disembarked.");
      }
    } else {
      if (!this.hint) this.hint = "Sailing — find a dock to disembark";
    }
  }

  /* ============================
     POTIONS + COMBAT
     ============================ */
  usePotion(type) {
    if (!this.hero.potions) this.hero.potions = { hp: 0, mana: 0 };

    if (type === "hp") {
      if (this.hero.potions.hp <= 0) {
        this.ui.setMsg("No HP potions.");
        return;
      }
      this.hero.potions.hp--;
      this.hero.hp = clamp(this.hero.hp + 40, 0, this.hero.getStats().maxHp);
      this.ui.setMsg("Used HP potion.");
      return;
    }

    if (type === "mana") {
      if (this.hero.potions.mana <= 0) {
        this.ui.setMsg("No Mana potions.");
        return;
      }
      this.hero.potions.mana--;
      this.hero.mana = clamp(this.hero.mana + 35, 0, this.hero.getStats().maxMana);
      this.ui.setMsg("Used Mana potion.");
      return;
    }
  }

  _canCast(key) {
    if (this.cd[key] > 0) return false;
    const sk = this.skills[key];
    if (!sk) return false;
    if (this.hero.mana < sk.mana) return false;
    return true;
  }

  _spendManaFor(key) {
    const sk = this.skills[key];
    if (!sk) return;
    this.hero.mana = Math.max(0, this.hero.mana - sk.mana);
    this.cd[key] = sk.cd;
    this.ui.skillName = sk.name;
    this.ui.skillPulse = 0.45;
  }

  castShockBolt(mult = 1, pierce = false) {
    const dir = this.hero.lastMove || { x: 1, y: 0 };
    const n = norm(dir.x, dir.y);
    const speed = 520;
    const vx = n.x * speed;
    const vy = n.y * speed;

    const dmg = 6 * mult + (this.hero.level - 1) * 0.6;
    this.projectiles.push(new Projectile(this.hero.x, this.hero.y, vx, vy, dmg, 0.95, this.hero.level, { kind: pierce ? "pierce" : "bolt", pierce: !!pierce }));
  }

  castShockNova() {
    const radius = 140;
    const base = 7 + (this.hero.level - 1) * 0.8;

    let hit = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(this.hero.x, this.hero.y, e.x, e.y) <= radius * radius) {
        e.takeDamage?.(base);
        hit++;
      }
    }
    this.ui.setMsg(hit ? `Nova hit ${hit}!` : "Nova fizzled.");
  }

  castDash() {
    if (this.hero.state.sailing) return;
    const dir = this.hero.lastMove || { x: 1, y: 0 };
    const n = norm(dir.x, dir.y);

    const dashDist = 140;
    const nx = this.hero.x + n.x * dashDist;
    const ny = this.hero.y + n.y * dashDist;

    if (this.world.canWalk(nx, ny)) {
      this.hero.x = nx;
      this.hero.y = ny;
      this.hero.state.invulnerable = true;
      this.hero.state.invulnT = 0.25;
    }
  }

  castArcPierce() {
    const dir = this.hero.lastMove || { x: 1, y: 0 };
    const n = norm(dir.x, dir.y);
    const speed = 430;
    const vx = n.x * speed;
    const vy = n.y * speed;

    const dmg = 9 + (this.hero.level - 1) * 0.9;
    this.projectiles.push(new Projectile(this.hero.x, this.hero.y, vx, vy, dmg, 1.1, this.hero.level, { kind: "pierce", pierce: true }));
  }

  dropLoot(x, y, tier = 1) {
    const rng = new RNG(((this.world.seed || 12345) ^ ((x | 0) * 31) ^ ((y | 0) * 97) ^ ((this._t * 10) | 0)) >>> 0);

    const g = 3 + ((rng.float() * (5 + tier * 2)) | 0);
    this.loot.push(new Loot(x + rng.float() * 10 - 5, y + rng.float() * 10 - 5, { kind: "gold", amt: g }));

    if (rng.float() < 0.14) {
      this.loot.push(new Loot(x + rng.float() * 18 - 9, y + rng.float() * 18 - 9, { kind: "potion", type: rng.float() < 0.6 ? "hp" : "mana" }));
    }

    if (rng.float() < 0.18) {
      const slot = GearSlots[rng.int(0, GearSlots.length - 1)];
      const rarityRoll = rng.float();
      const rarity = rarityRoll > 0.985 ? "legendary" : rarityRoll > 0.93 ? "epic" : rarityRoll > 0.78 ? "rare" : "common";
      const gear = makeGear(rng, slot, rarity, tier);
      this.loot.push(new Loot(x + rng.float() * 22 - 11, y + rng.float() * 22 - 11, { kind: "gear", gear }));
    }
  }

  _pickupLoot() {
    const r2 = 55 * 55;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      if (dist2(this.hero.x, this.hero.y, L.x, L.y) > r2) continue;

      const it = L.item;
      if (it?.kind === "gold") {
        const amt = it.amt || 1;
        this.hero.gold += amt;
        this.onQuestGold(amt);
        this.loot.splice(i, 1);
        continue;
      }

      if (it?.kind === "potion") {
        const type = it.type === "mana" ? "mana" : "hp";
        this.hero.potions[type] = (this.hero.potions[type] || 0) + 1;
        this.ui.setMsg(`Picked up ${type.toUpperCase()} potion.`);
        this.loot.splice(i, 1);
        continue;
      }

      if (it?.kind === "gear" && it.gear) {
        if (this.settings.autoPickupGear) {
          this.hero.inventory.push(it.gear);
          this.ui.setMsg(`Picked up: ${it.gear.name}`);
          this.loot.splice(i, 1);
        }
      }
    }
  }

  /* ============================
     UPDATE
     ============================ */
  update(dt) {
    // Keep canvas sizing correct
    this._syncCanvasSize(false);

    this._t += dt;

    // cooldowns
    this.cd.q = Math.max(0, this.cd.q - dt);
    this.cd.w = Math.max(0, this.cd.w - dt);
    this.cd.r = Math.max(0, this.cd.r - dt);
    this.cd.f = Math.max(0, this.cd.f - dt);

    // invuln timer
    if (this.hero.state?.invulnerable) {
      this.hero.state.invulnT = Math.max(0, (this.hero.state.invulnT || 0) - dt);
      if (this.hero.state.invulnT <= 0) this.hero.state.invulnerable = false;
    }

    // UI toggles
    if (this.input.pressed("escape")) this.ui.closeAll();
    if (this.input.pressed("m")) this.ui.toggle("map");
    if (this.input.pressed("i")) this.ui.toggle("stats");
    if (this.input.pressed("k")) this.ui.toggle("skills");
    if (this.input.pressed("j")) this.ui.toggle("quests");
    if (this.input.pressed("o")) this.ui.toggle("options");
    if (this.input.pressed("t")) this.ui.toggle("waypoints");

    this._handleOptionsInputs();

    // Potions (1/2 only)
    if (this.input.pressed("1")) this.usePotion("hp");
    if (this.input.pressed("2")) this.usePotion("mana");

    // Skills (no casting while sailing)
    // Spell keys are Q/W/R/F (QWERT keyboard; E is interact)
    if (!this.hero.state.sailing) {
      if (this.input.pressed("q") && this._canCast("q")) {
        this._spendManaFor("q");
        this.castShockBolt(1.0, false);
      }
      if (this.input.pressed("w") && this._canCast("w")) {
        this._spendManaFor("w");
        this.castShockNova();
      }
      if (this.input.pressed("r") && this._canCast("r")) {
        this._spendManaFor("r");
        this.castDash();
      }
      if (this.input.pressed("f") && this._canCast("f")) {
        this._spendManaFor("f");
        this.castArcPierce();
      }
    }

    this.hint = "";

    // Waystones + sailing
    this._handleWaystoneInputs();
    this._handleDockSailing();

    // Movement
    let mx = 0,
      my = 0;
    // IMPORTANT: movement is ARROWS only (WASD reserved for QWERT spell keys)
    if (this.input.down("arrowleft")) mx--;
    if (this.input.down("arrowright")) mx++;
    if (this.input.down("arrowup")) my--;
    if (this.input.down("arrowdown")) my++;

    const speed = this.hero.state.sailing ? 230 : 170;

    if (mx || my) {
      const n = norm(mx, my);
      const nx = this.hero.x + n.x * speed * dt;
      const ny = this.hero.y + n.y * speed * dt;

      this.hero.lastMove = { x: n.x, y: n.y };

      if (!this.hero.state.sailing) {
        if (this.world.canWalk(nx, ny)) {
          this.hero.x = nx;
          this.hero.y = ny;
        }
      } else {
        if (this.world.canSail(nx, ny)) {
          this.hero.x = nx;
          this.hero.y = ny;
        }
      }
    }

    // World + hero
    this.world.update?.(dt);
    this.hero.update(dt);

    // Projectiles
    for (const p of this.projectiles) p.update(dt, this.world);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const r2 = 26 * 26;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(p.x, p.y, e.x, e.y) < r2) {
          e.takeDamage?.(p.dmg || 1);
          if (!p.meta?.pierce) p.alive = false;
          break;
        }
      }

      if (!p.alive) this.projectiles.splice(i, 1);
    }

    // Enemies
    for (const e of this.enemies) e.update(dt, this.hero, this.world, this);

    // Deaths
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.hero.giveXP(e.xpValue ? e.xpValue() : 8);
        this.dropLoot(e.x, e.y, e.tier || 1);
        this.onQuestKill();
        this.enemies.splice(i, 1);
      }
    }

    // Loot
    for (const L of this.loot) L.update(dt);
    this._pickupLoot();

    // Respawn timers
    for (let i = 0; i < this.spawnCamps.length; i++) {
      const v = (this._spawnTimers.get(i) || 0) - dt;
      this._spawnTimers.set(i, v);
    }
    this._ensureCampsSpawned(false);

    // Camera follow uses CSS pixel view size
    this.cam.x = clamp(this.hero.x - this.viewW * 0.5, 0, this.world.width - this.viewW);
    this.cam.y = clamp(this.hero.y - this.viewH * 0.5, 0, this.world.height - this.viewH);

    // Save
    this._saveT -= dt;
    if (this._saveT <= 0) {
      this._saveT = 2.0;
      saveGame({
        hero: this.hero,
        world: {
          waystonesActivated: (this.world.waystones || []).map((w, i) => (w.activated ? i : null)).filter((v) => v !== null),
        },
        settings: this.settings,
        quests: this.quests,
      });
    }

    this.input.endFrame();
  }

  /* ============================
     DRAW
     ============================ */
  draw(t) {
    const ctx = this.ctx;

    // Map CSS pixels to the DPR backing buffer (crisp, correct scale)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Clear in CSS pixel space
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    ctx.translate(-this.cam.x, -this.cam.y);

    this.world.draw(ctx, t, {
      x: this.cam.x,
      y: this.cam.y,
      w: this.viewW,
      h: this.viewH,
    });

    for (const L of this.loot) L.draw(ctx, t);
    for (const p of this.projectiles) p.draw(ctx, t);
    for (const e of this.enemies) e.draw(ctx, t);
    this.hero.draw(ctx, t);

    ctx.restore();

    // UI in CSS pixels (so it won't become huge)
    this.ui.draw(ctx, this);
  }
}
