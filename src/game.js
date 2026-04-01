// src/game.js
// v46 DUNGEON REWARD CHESTS + DEEPER FLOOR LOOP (FULL FILE)

import World from "./world.js";
import { clamp, lerp, dist2, norm, RNG, hash2 } from "./util.js";
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
    this.save = new Save("broke-knight-save-v46");

    this.world = new World(this.seed, { viewW: this.w, viewH: this.h });
    this.hero = new Hero(this.world.spawn?.x ?? 0, this.world.spawn?.y ?? 0);

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

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
      enemyUpdateRadius: 1500,
      lootUpdateRadius: 900,
      projectileUpdateRadius: 1700,
      spawnRadius: 1400,
      drawPad: 180,
      maxEnemies: 110,
      maxLoot: 140,
      cleanupTimer: 0,
      cleanupEvery: 0.35,
    };

    this.time = 0;
    this._dtClamp = 0.05;
    this._autosaveT = 0;

    this._spawnTimer = 0;
    this._campRespawn = 60;
    this._campState = new Map();
    this._rng = new RNG(hash2(this.seed, 9001));

    this.menu = { open: null };

    this.quests = this._makeQuests();

    this.progress = {
      discoveredWaystones: new Set(),
      discoveredDocks: new Set(),
      clearedCamps: new Set(),
      eliteKills: 0,
      currentZoneText: "",
      currentZoneId: "",
      zoneMsgCooldown: 0,
      dungeonBest: 0,
    };

    this._pickupMsgCooldown = 0;
    this._levelMsgShown = this.hero.level || 1;
    this._spellMsgCooldown = 0;
    this._resetQueued = false;
    this._resetConfirmT = 0;

    this.aim = { x: 1, y: 0 };

    this.spells = {
      q: { name: "Bolt", mana: 6, cd: 0.22 },
      w: { name: "Nova", mana: 14, cd: 1.8 },
      e: { name: "Dash", mana: 8, cd: 1.05 },
      r: { name: "Orb", mana: 18, cd: 2.4 },
    };
    this.spellCd = { q: 0, w: 0, e: 0, r: 0 };

    this.dungeon = {
      active: false,
      floor: 0,
      room: null,
      stairsDown: null,
      exit: null,
      justCleared: false,
      rewardChest: null,
      rewardTaken: false,
    };

    this._tryLoad();
    this._primeCamps();

    this.setViewSize(this.w, this.h);
  }

  setViewSize(w, h) {
    this.w = w | 0;
    this.h = h | 0;

    if (this.canvas) {
      this.canvas.width = this.w;
      this.canvas.height = this.h;
    }

    this.world?.setViewSize?.(this.w, this.h);
    this.ui?.setViewSize?.(this.w, this.h);
  }

  resize(w, h) {
    this.setViewSize(w, h);
  }

  _tryLoad() {
    const s = this.save.load();
    if (!s) return;

    if (Number.isFinite(s.seed) && s.seed !== 0) {
      this.seed = s.seed | 0;
      this.world = new World(this.seed, { viewW: this.w, viewH: this.h });
    }

    if (s.hero) {
      Object.assign(this.hero, s.hero);
      this._nudgeToLand();
    }

    if (Array.isArray(s.quests)) {
      this.quests = s.quests;
    }

    if (s.progress && typeof s.progress === "object") {
      this.progress.discoveredWaystones = new Set(
        Array.isArray(s.progress.discoveredWaystones) ? s.progress.discoveredWaystones : []
      );
      this.progress.discoveredDocks = new Set(
        Array.isArray(s.progress.discoveredDocks) ? s.progress.discoveredDocks : []
      );
      this.progress.clearedCamps = new Set(
        Array.isArray(s.progress.clearedCamps) ? s.progress.clearedCamps : []
      );
      this.progress.eliteKills = Math.max(0, s.progress.eliteKills | 0);
      this.progress.dungeonBest = Math.max(0, s.progress.dungeonBest | 0);
    }

    if (s.hero?.lastMove && Number.isFinite(s.hero.lastMove.x) && Number.isFinite(s.hero.lastMove.y)) {
      const n = norm(s.hero.lastMove.x, s.hero.lastMove.y);
      if (n.x || n.y) this.aim = { x: n.x, y: n.y };
    }

    this._levelMsgShown = this.hero.level || 1;
  }

  _save() {
    this.save.save({
      seed: this.seed,
      hero: {
        x: this.hero.x,
        y: this.hero.y,
        hp: this.hero.hp,
        mana: this.hero.mana,
        gold: this.hero.gold,
        level: this.hero.level,
        xp: this.hero.xp,
        nextXp: this.hero.nextXp,
        potions: this.hero.potions,
        inventory: this.hero.inventory,
        equip: this.hero.equip,
        state: this.hero.state,
        lastMove: this.hero.lastMove,
      },
      quests: this.quests,
      progress: {
        discoveredWaystones: Array.from(this.progress.discoveredWaystones),
        discoveredDocks: Array.from(this.progress.discoveredDocks),
        clearedCamps: Array.from(this.progress.clearedCamps),
        eliteKills: this.progress.eliteKills | 0,
        dungeonBest: this.progress.dungeonBest | 0,
      },
    });
  }

  _saveSoon() {
    this._autosaveT = 0;
    this._save();
  }

  _msg(text, t = 2.2) {
    this.ui?.setMsg?.(text, t);
  }

  _shake(t = 0.08, mag = 3) {
    this.camera.shakeT = Math.max(this.camera.shakeT, t);
    this.camera.shakeMag = Math.max(this.camera.shakeMag, mag);
  }

  _withinRadius(x, y, r) {
    return dist2(x, y, this.camera.x, this.camera.y) <= r * r;
  }

  _viewBoundsWorld() {
    const cam = this.camera;
    const z = cam.zoom || 1;
    const halfW = (this.w * 0.5) / z;
    const halfH = (this.h * 0.5) / z;
    const pad = this.perf.drawPad;
    return {
      x0: cam.x - halfW - pad,
      x1: cam.x + halfW + pad,
      y0: cam.y - halfH - pad,
      y1: cam.y + halfH + pad,
    };
  }

  _inView(x, y, vb) {
    return x >= vb.x0 && x <= vb.x1 && y >= vb.y0 && y <= vb.y1;
  }

  _nudgeToLand() {
    if (this.world?.canWalk?.(this.hero.x, this.hero.y)) return;

    const sx = this.hero.x;
    const sy = this.hero.y;
    for (let r = 0; r <= 600; r += 24) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = sx + Math.cos(a) * r;
        const y = sy + Math.sin(a) * r;
        if (this.world.canWalk(x, y)) {
          this.hero.x = x;
          this.hero.y = y;
          return;
        }
      }
    }
  }

  _grantGold(n) {
    this.hero.gold += Math.max(0, n | 0);
  }

  _grantXP(n) {
    this.hero.giveXP?.(Math.max(0, n | 0));
  }

  _fullRestoreHero() {
    const st = this.hero.getStats?.() || { maxHp: this.hero.maxHp || 100, maxMana: this.hero.maxMana || 60 };
    this.hero.hp = st.maxHp;
    this.hero.mana = st.maxMana;
  }

  _coolMsg(text, t = 1.6) {
    if (this._pickupMsgCooldown > 0) return;
    this._pickupMsgCooldown = 0.45;
    this._msg(text, t);
  }

  _spellMsg(text, t = 1.0) {
    if (this._spellMsgCooldown > 0) return;
    this._spellMsgCooldown = 0.3;
    this._msg(text, t);
  }

  _itemPower(it) {
    if (!it) return -999999;
    const s = it.stats || {};
    return (s.dmg || 0) * 3 + (s.armor || 0) * 2 + (s.crit || 0) * 100 + (it.level || 0);
  }

  _maybeAutoEquip(gear) {
    if (!gear || !gear.slot) return false;

    const slot = gear.slot;
    const current = this.hero.equip?.[slot] || null;

    if (!current) {
      this.hero.equip[slot] = gear;
      return true;
    }

    const oldPower = this._itemPower(current);
    const newPower = this._itemPower(gear);

    if (newPower > oldPower) {
      this.hero.equip[slot] = gear;
      return true;
    }

    return false;
  }

  _equipInventoryIndex(index) {
    const bag = this.hero.inventory || [];
    const idx = index | 0;
    if (idx < 0 || idx >= bag.length) return false;

    const item = bag[idx];
    if (!item || !item.slot) {
      this._msg("That item cannot be equipped.", 1.6);
      return false;
    }

    const slot = item.slot;
    const oldEquipped = this.hero.equip?.[slot] || null;

    bag.splice(idx, 1);

    if (!this.hero.equip) this.hero.equip = {};
    this.hero.equip[slot] = item;

    if (oldEquipped) {
      bag.push(oldEquipped);
      this._msg(`Equipped ${item.name} (${slot})`, 1.8);
    } else {
      this._msg(`Equipped ${item.name}`, 1.8);
    }

    this._saveSoon();
    return true;
  }

  _handleInventoryHotkeys() {
    if (this.menu.open !== "inventory") return;

    if (this.input.wasPressed("1")) this._equipInventoryIndex(0);
    else if (this.input.wasPressed("2")) this._equipInventoryIndex(1);
    else if (this.input.wasPressed("3")) this._equipInventoryIndex(2);
    else if (this.input.wasPressed("4")) this._equipInventoryIndex(3);
    else if (this.input.wasPressed("5")) this._equipInventoryIndex(4);
    else if (this.input.wasPressed("6")) this._equipInventoryIndex(5);
    else if (this.input.wasPressed("7")) this._equipInventoryIndex(6);
    else if (this.input.wasPressed("8")) this._equipInventoryIndex(7);
    else if (this.input.wasPressed("9")) this._equipInventoryIndex(8);
    else if (this.input.wasPressed("0")) this._equipInventoryIndex(9);
  }

  _pickupNearbyLootBonus() {
    const pickupR = this.dungeon.active ? 34 : 26;
    for (const l of this.loot) {
      if (!l.alive) continue;
      if (dist2(this.hero.x, this.hero.y, l.x, l.y) < pickupR * pickupR) {
        const kind = l.kind;
        const data = l.data || {};

        if (kind === "gold") {
          const amt = Math.max(1, data.amount | 0);
          this.hero.gold += amt;
          this._coolMsg(`+${amt} Gold`);
        } else if (kind === "potion") {
          const type = data.potionType || "hp";
          const amt = Math.max(1, data.amount | 0);
          this.hero.potions[type] = (this.hero.potions[type] | 0) + amt;
          this._coolMsg(type === "mana" ? "Mana potion found" : "HP potion found");
        } else if (kind === "gear" && data.gear) {
          this.hero.inventory.push(data.gear);
          const equipped = this._maybeAutoEquip(data.gear);
          this._coolMsg(equipped ? `Equipped: ${data.gear.name}` : `Found: ${data.gear.name}`, 1.8);
        }

        l.alive = false;
      }
    }
  }

  _regenMana(dt) {
    const st = this.hero.getStats?.() || { maxMana: 60 };
    if (this.hero.mana >= st.maxMana) return;

    const base = this.dungeon.active ? 5.2 : (this.hero.state?.sailing ? 3.0 : 4.5);
    this.hero.mana = Math.min(st.maxMana, this.hero.mana + base * dt);
  }

  _tickSpellCooldowns(dt) {
    for (const k of Object.keys(this.spellCd)) {
      this.spellCd[k] = Math.max(0, this.spellCd[k] - dt);
    }
  }

  _tickResetConfirm(dt) {
    if (this._resetConfirmT > 0) {
      this._resetConfirmT = Math.max(0, this._resetConfirmT - dt);
      if (this._resetConfirmT <= 0) this._resetConfirmT = 0;
    }
  }

  _canCastSpell(key) {
    const def = this.spells[key];
    if (!def) return false;
    if ((this.spellCd[key] || 0) > 0) {
      this._spellMsg(`${def.name} cooling down`, 0.8);
      return false;
    }
    if ((this.hero.mana || 0) < def.mana) {
      this._spellMsg("Not enough mana", 0.9);
      return false;
    }
    return true;
  }

  _startSpell(key) {
    const def = this.spells[key];
    this.hero.mana -= def.mana;
    this.spellCd[key] = def.cd;
  }

  _liveArrowAim() {
    const left = this.input.isDown("ArrowLeft");
    const right = this.input.isDown("ArrowRight");
    const up = this.input.isDown("ArrowUp");
    const down = this.input.isDown("ArrowDown");

    let ax = 0;
    let ay = 0;
    if (left) ax -= 1;
    if (right) ax += 1;
    if (up) ay -= 1;
    if (down) ay += 1;

    if (ax !== 0 || ay !== 0) return norm(ax, ay);
    return null;
  }

  _currentAim() {
    const live = this._liveArrowAim();
    if (live) return live;

    const saved = norm(this.aim.x || 0, this.aim.y || 0);
    if (saved.x || saved.y) return saved;

    const lm = this.hero.lastMove || { x: 1, y: 0 };
    const fallback = norm(lm.x || 0, lm.y || 0);
    if (fallback.x || fallback.y) return fallback;

    return { x: 1, y: 0 };
  }

  getSpellState() {
    return {
      q: { ...this.spells.q, cdLeft: this.spellCd.q || 0 },
      w: { ...this.spells.w, cdLeft: this.spellCd.w || 0 },
      e: { ...this.spells.e, cdLeft: this.spellCd.e || 0 },
      r: { ...this.spells.r, cdLeft: this.spellCd.r || 0 },
    };
  }

  _onEnemyDefeated(enemy) {
    const baseXP = enemy.xpValue?.() || 6;
    this.hero.giveXP?.(baseXP);
    this._questAddProgress("q_kill_5", 1);

    if (enemy.elite) {
      this.progress.eliteKills += 1;
      const bonusXP = 6 + enemy.tier * 2;
      const bonusGold = 8 + enemy.tier * 3;
      this._grantXP(bonusXP);
      this._grantGold(bonusGold);
      this._msg(`Elite defeated! (+${baseXP + bonusXP} XP, +${bonusGold} Gold)`, 2.6);
      this._shake(0.08, 3.2);
      this._saveSoon();
    }

    if (this.dungeon.active) {
      this._grantGold(2 + (this.dungeon.floor | 0));
      this._grantXP(1 + Math.floor(this.dungeon.floor * 0.5));
    }

    this._dropLoot(enemy.x, enemy.y, enemy.tier || 1, enemy.kind, !!enemy.elite);
  }

  _makeQuests() {
    return [
      { id: "q_kill_5", name: "Thin the Camps", desc: "Defeat 5 enemies.", goal: 5, prog: 0, done: false, xp: 25, gold: 25 },
      { id: "q_find_way", name: "Touch the Waystone", desc: "Find and touch a waystone.", goal: 1, prog: 0, done: false, xp: 40, gold: 40 },
      { id: "q_sail", name: "Test the Waters", desc: "Use a dock and sail.", goal: 1, prog: 0, done: false, xp: 55, gold: 60 },
    ];
  }

  _questAddProgress(id, amt = 1) {
    const q = this.quests.find(v => v.id === id);
    if (!q || q.done) return;

    q.prog = Math.min(q.goal, (q.prog | 0) + (amt | 0));
    if (q.prog >= q.goal) {
      q.done = true;
      this.hero.giveXP?.(q.xp || 0);
      this.hero.gold += q.gold || 0;
      this._msg(`Quest complete: ${q.name} (+${q.xp} XP, +${q.gold} Gold)`, 3.2);
      this._saveSoon();
    }
  }

  _primeCamps() {
    const camps = this.world?.camps || [];
    for (const c of camps) {
      this._campState.set(c.id, {
        nextAt: 0,
        wasAliveLastCheck: false,
        announcedNearby: false,
        clearedOnce: this.progress.clearedCamps.has(c.id),
      });
    }
  }

  _campAliveCount(campId) {
    let alive = 0;
    for (const e of this.enemies) {
      if (e.alive && e.home && e.home.id === campId) alive++;
    }
    return alive;
  }

  _spawnFromCamps(dt) {
    if (this.dungeon.active) return;
    if (this.enemies.length >= this.perf.maxEnemies) return;

    this._spawnTimer += dt;
    if (this._spawnTimer < 0.18) return;
    this._spawnTimer = 0;

    const camps = this.world?.camps || [];
    const t = this.time;

    for (const c of camps) {
      if (this.enemies.length >= this.perf.maxEnemies) break;
      if (!this._withinRadius(c.x, c.y, this.perf.spawnRadius)) continue;

      const st = this._campState.get(c.id) || {
        nextAt: 0,
        wasAliveLastCheck: false,
        announcedNearby: false,
        clearedOnce: this.progress.clearedCamps.has(c.id),
      };

      const alive = this._campAliveCount(c.id);

      if (alive === 0 && st.wasAliveLastCheck) {
        if (!st.clearedOnce) {
          st.clearedOnce = true;
          this.progress.clearedCamps.add(c.id);

          const xp = 8 + c.tier * 4;
          const gold = 12 + c.tier * 4;
          this._grantGold(gold);
          this._grantXP(xp);

          this._spawnCampRewardBurst(c);
          this._msg(`Camp cleared! Reward cache found. (+${xp} XP, +${gold} Gold)`, 3.2);
          this._saveSoon();
        } else {
          this._msg("Camp cleared again.", 2);
        }
      }

      st.wasAliveLastCheck = alive > 0;

      if (alive === 0 && t >= (st.nextAt || 0)) {
        const pack = 3 + (c.tier || 1);
        for (let i = 0; i < pack; i++) {
          if (this.enemies.length >= this.perf.maxEnemies) break;

          const ang = (i / pack) * Math.PI * 2;
          const r = 40 + (i % 3) * 18;
          const ex = c.x + Math.cos(ang) * r;
          const ey = c.y + Math.sin(ang) * r;
          const kind = ["blob", "stalker", "brute", "caster"][(c.id + i) % 4];

          const e = new Enemy(ex, ey, c.tier || 1, kind, hash2(this.seed, c.id * 100 + i));
          e.home = { x: c.x, y: c.y, id: c.id };
          this.enemies.push(e);
        }

        st.nextAt = t + this._campRespawn;
        st.wasAliveLastCheck = true;
      }

      this._campState.set(c.id, st);
    }
  }

  _spawnCampRewardBurst(camp) {
    if (!camp) return;
    if (this.loot.length >= this.perf.maxLoot - 4) return;

    const cx = camp.x;
    const cy = camp.y;
    const tier = Math.max(1, camp.tier | 0);

    this.loot.push(new Loot(cx - 14, cy - 8, "gold", { amount: 10 + tier * 4 }));
    this.loot.push(new Loot(cx + 14, cy - 4, "gold", { amount: 8 + tier * 3 }));
    this.loot.push(new Loot(cx - 8, cy + 10, "potion", {
      potionType: Math.random() < 0.5 ? "hp" : "mana",
      amount: 1,
    }));

    const slotRoll = Math.random();
    const slot =
      slotRoll < 0.28 ? "weapon" :
      slotRoll < 0.50 ? "armor" :
      slotRoll < 0.66 ? "helm" :
      slotRoll < 0.80 ? "boots" :
      slotRoll < 0.90 ? "ring" : "trinket";

    const rarity =
      tier >= 3
        ? (Math.random() < 0.30 ? "epic" : "rare")
        : (Math.random() < 0.55 ? "rare" : "uncommon");

    const gearSeed = hash2(this.seed ^ 0x7788, (camp.id | 0) * 97 + tier * 11);
    const gear = makeGear(slot, Math.max(1, this.hero.level || 1), rarity, gearSeed);
    this.loot.push(new Loot(cx + 2, cy + 16, "gear", { gear }));

    this._shake(0.10, 4.5);
  }

  _getDiscoveredWaystones() {
    const all = Array.isArray(this.world?.waystones) ? this.world.waystones.slice() : [];
    return all
      .filter(w => this.progress?.discoveredWaystones?.has?.(w.id))
      .sort((a, b) => (a.id || 0) - (b.id || 0));
  }

  _teleportToWaystone(index) {
    if (this.dungeon.active) return;

    const ways = this._getDiscoveredWaystones();

    if (!ways.length) {
      this._msg("No awakened waystones yet.", 2);
      return;
    }

    if (this.hero.state?.sailing) {
      this._msg("Cannot fast travel while sailing.", 2);
      return;
    }

    const w = ways[index | 0];
    if (!w) return;

    this.hero.x = w.x;
    this.hero.y = w.y + 42;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.dashT = 0;

    this.menu.open = null;
    this.ui?.closeAll?.();

    this._msg(`Fast traveled to Waystone ${index + 1}`, 2.2);
    this._shake(0.12, 4);
    this._saveSoon();
  }

  _handleFastTravelInput() {
    if (this.menu.open !== "map") return;

    if (this.input.wasPressed("z")) {
      this.world.toggleMapScale();
      this._msg(`Map scale: ${this.world.mapMode}`, 1.2);
    }

    if (this.input.wasPressed("1")) this._teleportToWaystone(0);
    else if (this.input.wasPressed("2")) this._teleportToWaystone(1);
    else if (this.input.wasPressed("3")) this._teleportToWaystone(2);
    else if (this.input.wasPressed("4")) this._teleportToWaystone(3);
    else if (this.input.wasPressed("5")) this._teleportToWaystone(4);
    else if (this.input.wasPressed("6")) this._teleportToWaystone(5);
    else if (this.input.wasPressed("7")) this._teleportToWaystone(6);
    else if (this.input.wasPressed("8")) this._teleportToWaystone(7);
    else if (this.input.wasPressed("9")) this._teleportToWaystone(8);
  }

  _hardResetRun() {
    if (this._resetQueued) return;
    this._resetQueued = true;

    this._msg("Save cleared. Restarting new game...", 1.2);

    try {
      this.save?.clear?.();
    } catch (_) {}

    setTimeout(() => {
      if (typeof window !== "undefined" && window.location) {
        window.location.reload();
      }
    }, 120);
  }

  _handleResetHotkey() {
    if (this.menu.open !== "options") {
      this._resetConfirmT = 0;
      return;
    }

    if (!this.input.wasPressed("Delete")) return;

    if (this._resetConfirmT > 0) {
      this._resetConfirmT = 0;
      this._hardResetRun();
      return;
    }

    this._resetConfirmT = 1.5;
    this._msg("Press Delete again to erase save.", 1.5);
  }

  _handleMenus() {
    if (this.input.wasPressed("i")) this.menu.open = this.menu.open === "inventory" ? null : "inventory";
    if (this.input.wasPressed("j")) this.menu.open = this.menu.open === "quests" ? null : "quests";
    if (this.input.wasPressed("m")) this.menu.open = this.menu.open === "map" ? null : "map";
    if (this.input.wasPressed("o")) this.menu.open = this.menu.open === "options" ? null : "options";
    if (this.input.wasPressed("Escape")) this.menu.open = null;

    if (this.menu.open) this.ui.open(this.menu.open);
    else this.ui.closeAll();
  }

  _handleMovement(dt) {
    const left = this.input.isDown("ArrowLeft");
    const right = this.input.isDown("ArrowRight");
    const up = this.input.isDown("ArrowUp");
    const down = this.input.isDown("ArrowDown");

    let ax = 0;
    let ay = 0;
    if (left) ax -= 1;
    if (right) ax += 1;
    if (up) ay -= 1;
    if (down) ay += 1;

    if (ax || ay) {
      const n = norm(ax, ay);

      this.aim = { x: n.x, y: n.y };
      this.hero.lastMove = { x: n.x, y: n.y };

      const speed = this.hero.state?.sailing ? 190 : 150;
      this.hero.vx = n.x * speed;
      this.hero.vy = n.y * speed;

      const nx = this.hero.x + this.hero.vx * dt;
      const ny = this.hero.y + this.hero.vy * dt;

      if (this.dungeon.active) {
        const room = this.dungeon.room;
        this.hero.x = clamp(nx, room.x0 + 20, room.x1 - 20);
        this.hero.y = clamp(ny, room.y0 + 20, room.y1 - 20);
      } else if (this.hero.state?.sailing) {
        this.hero.x = nx;
        this.hero.y = ny;
      } else {
        if (this.world.canWalk(nx, this.hero.y)) this.hero.x = nx;
        if (this.world.canWalk(this.hero.x, ny)) this.hero.y = ny;
      }
    } else {
      this.hero.vx = 0;
      this.hero.vy = 0;
    }

    if (this.input.wasPressed("1")) {
      if (this.hero.usePotion?.("hp")) {
        this._msg("Used HP potion");
        this._saveSoon();
      }
    }
    if (this.input.wasPressed("2")) {
      if (this.hero.usePotion?.("mana")) {
        this._msg("Used Mana potion");
        this._saveSoon();
      }
    }
  }

  _handleInteract() {
    if (!this.input.wasPressed("f")) return;

    if (this.dungeon.active) {
      if (this.dungeon.rewardChest && !this.dungeon.rewardTaken && dist2(this.hero.x, this.hero.y, this.dungeon.rewardChest.x, this.dungeon.rewardChest.y) < 78 * 78) {
        this._openDungeonChest();
        return;
      }

      if (this.dungeon.justCleared && this.dungeon.stairsDown && dist2(this.hero.x, this.hero.y, this.dungeon.stairsDown.x, this.dungeon.stairsDown.y) < 70 * 70) {
        this._enterDungeonFloor(this.dungeon.floor + 1);
        return;
      }

      if (this.dungeon.exit && dist2(this.hero.x, this.hero.y, this.dungeon.exit.x, this.dungeon.exit.y) < 70 * 70) {
        this._leaveDungeon();
        return;
      }

      return;
    }

    for (const dg of this.world?.dungeons || []) {
      if (dist2(this.hero.x, this.hero.y, dg.x, dg.y) < 90 * 90) {
        this._enterDungeonFloor(1);
        return;
      }
    }

    for (const d of this.world?.docks || []) {
      if (dist2(this.hero.x, this.hero.y, d.x, d.y) < 70 * 70) {
        const firstDock = !this.progress.discoveredDocks.has(d.id);
        this.progress.discoveredDocks.add(d.id);

        this.hero.state.sailing = !this.hero.state.sailing;

        if (firstDock) {
          this._grantGold(10);
          this.hero.potions.hp = (this.hero.potions.hp | 0) + 2;
          this.hero.potions.mana = (this.hero.potions.mana | 0) + 1;
          this._msg(this.hero.state.sailing ? "New dock found. Sailing: ON (+10 Gold)" : "New dock found (+10 Gold)", 2.6);
        } else {
          this._msg(this.hero.state.sailing ? "Sailing: ON" : "Sailing: OFF");
        }

        this._questAddProgress("q_sail", 1);
        this._saveSoon();
        return;
      }
    }

    for (const w of this.world?.waystones || []) {
      if (dist2(this.hero.x, this.hero.y, w.x, w.y) < 80 * 80) {
        const first = !this.progress.discoveredWaystones.has(w.id);
        this.progress.discoveredWaystones.add(w.id);

        this._fullRestoreHero();

        if (first) {
          this._grantXP(20);
          this._grantGold(15);
          this._msg("Waystone awakened! Full restore. (+20 XP, +15 Gold)", 3);
        } else {
          this._msg("Waystone restored your strength.", 2.2);
        }

        this._questAddProgress("q_find_way", 1);
        this._saveSoon();
        return;
      }
    }

    this._msg("Nothing to interact with here.");
  }

  _enterDungeonFloor(floor) {
    this.dungeon.active = true;
    this.dungeon.floor = Math.max(1, floor | 0);
    this.dungeon.justCleared = false;
    this.dungeon.rewardChest = null;
    this.dungeon.rewardTaken = false;

    const size = 520 + this.dungeon.floor * 18;
    this.dungeon.room = {
      x0: -size * 0.5,
      y0: -size * 0.5,
      x1: size * 0.5,
      y1: size * 0.5,
    };
    this.dungeon.exit = { x: 0, y: size * 0.5 - 52 };
    this.dungeon.stairsDown = { x: 0, y: -size * 0.5 + 56 };

    this.hero.x = 0;
    this.hero.y = size * 0.5 - 96;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.sailing = false;

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    const count = 5 + this.dungeon.floor * 2;
    for (let i = 0; i < count; i++) {
      const px = this._rng.range(this.dungeon.room.x0 + 60, this.dungeon.room.x1 - 60);
      const py = this._rng.range(this.dungeon.room.y0 + 70, this.dungeon.room.y1 - 120);

      const tier = Math.min(16, 1 + Math.floor(this.dungeon.floor * 0.9) + (i % 3));
      const kind = ["blob", "stalker", "brute", "caster"][i % 4];
      const e = new Enemy(px, py, tier, kind, hash2(this.seed, this.dungeon.floor * 100 + i));

      if (this.dungeon.floor >= 3 && i === count - 1) e.elite = true;
      if (this.dungeon.floor >= 6 && i === count - 2) e.elite = true;
      if (this.dungeon.floor >= 10 && i % 5 === 0) e.elite = true;

      this.enemies.push(e);
    }

    this._msg(`Entered dungeon floor ${this.dungeon.floor}`, 2.4);
    this.progress.dungeonBest = Math.max(this.progress.dungeonBest | 0, this.dungeon.floor | 0);
    this._saveSoon();
  }

  _spawnDungeonRewardChest() {
    if (!this.dungeon.active || this.dungeon.rewardChest) return;
    this.dungeon.rewardChest = {
      x: 0,
      y: 0,
    };
    this.dungeon.rewardTaken = false;
  }

  _openDungeonChest() {
    if (!this.dungeon.rewardChest || this.dungeon.rewardTaken) return;

    const floor = this.dungeon.floor | 0;
    const gold = 18 + floor * 10;
    const xp = 14 + floor * 7;

    this._grantGold(gold);
    this._grantXP(xp);

    this.hero.potions.hp = (this.hero.potions.hp | 0) + (floor >= 4 ? 1 : 0);
    this.hero.potions.mana = (this.hero.potions.mana | 0) + 1;

    if (this.loot.length < this.perf.maxLoot - 3) {
      this.loot.push(new Loot(this.dungeon.rewardChest.x - 18, this.dungeon.rewardChest.y + 10, "gold", { amount: 8 + floor * 2 }));
      this.loot.push(new Loot(this.dungeon.rewardChest.x + 18, this.dungeon.rewardChest.y + 10, "gold", { amount: 6 + floor * 2 }));
    }

    if (Math.random() < Math.min(0.85, 0.28 + floor * 0.06)) {
      const slotRoll = Math.random();
      const slot =
        slotRoll < 0.28 ? "weapon" :
        slotRoll < 0.50 ? "armor" :
        slotRoll < 0.66 ? "helm" :
        slotRoll < 0.80 ? "boots" :
        slotRoll < 0.90 ? "ring" : "trinket";

      const rarity =
        floor >= 8
          ? (Math.random() < 0.35 ? "epic" : "rare")
          : (Math.random() < 0.55 ? "rare" : "uncommon");

      const gearSeed = hash2(this.seed ^ 0x9911, floor * 211 + (this.hero.level || 1) * 17);
      const gear = makeGear(slot, Math.max(1, (this.hero.level || 1) + Math.floor(floor / 2)), rarity, gearSeed);
      this.hero.inventory.push(gear);
      const equipped = this._maybeAutoEquip(gear);
      this._msg(equipped ? `Dungeon chest! Equipped ${gear.name}` : `Dungeon chest! Found ${gear.name}`, 2.8);
    } else {
      this._msg(`Dungeon chest opened! (+${xp} XP, +${gold} Gold)`, 2.8);
    }

    this.dungeon.rewardTaken = true;
    this._shake(0.12, 5);
    this._saveSoon();
  }

  _leaveDungeon() {
    this.dungeon.active = false;
    this.dungeon.rewardChest = null;
    this.dungeon.rewardTaken = false;

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    const dg = this.world.dungeons?.[0];
    if (dg) {
      this.hero.x = dg.x + 42;
      this.hero.y = dg.y + 18;
    } else {
      this.hero.x = this.world.spawn.x;
      this.hero.y = this.world.spawn.y;
    }

    this._msg(`Escaped the dungeon. Best floor: ${this.progress.dungeonBest}`, 2.8);
    this._saveSoon();
  }

  _updateDungeonClear() {
    if (!this.dungeon.active) return;
    const alive = this.enemies.some(e => e.alive);
    if (!alive && !this.dungeon.justCleared) {
      this.dungeon.justCleared = true;

      const floor = this.dungeon.floor | 0;
      const gold = 12 + floor * 8;
      const xp = 10 + floor * 6;

      this._grantGold(gold);
      this._grantXP(xp);
      this.hero.potions.mana = (this.hero.potions.mana | 0) + (floor >= 3 ? 1 : 0);

      this._spawnDungeonRewardChest();

      this._msg(`Floor ${floor} cleared! Chest unlocked. (+${xp} XP, +${gold} Gold)`, 3.0);
      this._shake(0.16, 5);
      this._saveSoon();
    }
  }

  _updateZoneMessages(dt) {
    if (this.progress.zoneMsgCooldown > 0) {
      this.progress.zoneMsgCooldown -= dt;
    }

    if (this.dungeon.active) {
      const zoneText = `Dungeon Floor ${this.dungeon.floor}`;
      const zoneId = `dungeon-${this.dungeon.floor}`;
      if (zoneId !== this.progress.currentZoneId && this.progress.zoneMsgCooldown <= 0) {
        this.progress.currentZoneId = zoneId;
        this.progress.currentZoneText = zoneText;
        this.progress.zoneMsgCooldown = 2.0;
        this._msg(zoneText, 1.8);
      }
      return;
    }

    let zoneText = "";
    let zoneId = "";

    for (const w of this.world?.waystones || []) {
      if (dist2(this.hero.x, this.hero.y, w.x, w.y) < 150 * 150) {
        zoneText = "Ancient Waystone";
        zoneId = `way-${w.id}`;
        break;
      }
    }

    if (!zoneText) {
      for (const d of this.world?.docks || []) {
        if (dist2(this.hero.x, this.hero.y, d.x, d.y) < 150 * 150) {
          zoneText = "Old Dock";
          zoneId = `dock-${d.id}`;
          break;
        }
      }
    }

    if (!zoneText) {
      for (const dg of this.world?.dungeons || []) {
        if (dist2(this.hero.x, this.hero.y, dg.x, dg.y) < 150 * 150) {
          zoneText = "Dungeon Entrance";
          zoneId = `dungeon-entrance-${dg.id}`;
          break;
        }
      }
    }

    if (!zoneText) {
      for (const c of this.world?.camps || []) {
        if (dist2(this.hero.x, this.hero.y, c.x, c.y) < 170 * 170) {
          zoneText = `Camp Tier ${c.tier}`;
          zoneId = `camp-${c.id}`;
          break;
        }
      }
    }

    if (zoneId && zoneId !== this.progress.currentZoneId && this.progress.zoneMsgCooldown <= 0) {
      this.progress.currentZoneId = zoneId;
      this.progress.currentZoneText = zoneText;
      this.progress.zoneMsgCooldown = 2.4;
      this._msg(zoneText, 1.8);
    } else if (!zoneId) {
      this.progress.currentZoneId = "";
      this.progress.currentZoneText = "";
    }
  }

  _handleSpells() {
    const aim = this._currentAim();

    if (this.input.wasPressed("q")) this._castBolt(aim.x, aim.y);
    if (this.input.wasPressed("w")) this._castNova();
    if (this.input.wasPressed("e")) this._castDash(aim.x, aim.y);
    if (this.input.wasPressed("r")) this._castOrb(aim.x, aim.y);
  }

  _castBolt(dx, dy) {
    if (!this._canCastSpell("q")) return;
    this._startSpell("q");

    const st = this.hero.getStats?.() || { dmg: 8, crit: 0.05, critMult: 1.7 };
    const shots = [{ dx, dy }];

    if ((this.hero.level || 1) >= 5) {
      const spread = 0.16;
      shots.push({ dx: dx - dy * spread, dy: dy + dx * spread });
      shots.push({ dx: dx + dy * spread, dy: dy - dx * spread });
    }

    for (const s of shots) {
      const n = norm(s.dx, s.dy);
      const p = new Projectile(
        this.hero.x + n.x * 12,
        this.hero.y + n.y * 12 - 6,
        n.x * 520,
        n.y * 520,
        Math.round(st.dmg * 0.85),
        1.15,
        this.hero.level || 1,
        { color: "rgba(145,215,255,0.95)", radius: 6, type: "bolt", hitRadius: 18 }
      );
      p.meta.crit = st.crit;
      p.meta.critMult = st.critMult;
      this.projectiles.push(p);
    }

    this._shake(0.05, 2);
  }

  _castNova() {
    if (!this._canCastSpell("w")) return;
    this._startSpell("w");

    const st = this.hero.getStats?.() || { dmg: 8 };
    const p = new Projectile(
      this.hero.x,
      this.hero.y - 6,
      0,
      0,
      Math.round(st.dmg * 0.65),
      0.55,
      this.hero.level || 1,
      { color: "rgba(200,240,255,0.95)", radius: 10, type: "nova", hitRadius: 120 }
    );
    p.meta.nova = true;
    this.projectiles.push(p);

    const radius = 92;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(this.hero.x, this.hero.y, e.x, e.y) <= radius * radius) {
        const dmg = Math.round(st.dmg * 0.55);
        e.takeDamage?.(dmg);
        const n = norm(e.x - this.hero.x, e.y - this.hero.y);
        e.x += n.x * 14;
        e.y += n.y * 14;
        if (!e.alive) this._onEnemyDefeated(e);
      }
    }

    this._shake(0.10, 3.2);
  }

  _castDash(dx, dy) {
    if (!this._canCastSpell("e")) return;
    this._startSpell("e");

    if (this.hero.state.dashT > 0) return;
    this.hero.state.dashT = 0.35;

    const dist = 138;
    const nx = this.hero.x + dx * dist;
    const ny = this.hero.y + dy * dist;

    if (this.dungeon.active) {
      const room = this.dungeon.room;
      this.hero.x = clamp(nx, room.x0 + 20, room.x1 - 20);
      this.hero.y = clamp(ny, room.y0 + 20, room.y1 - 20);
    } else if (this.hero.state?.sailing) {
      this.hero.x = nx;
      this.hero.y = ny;
    } else {
      let x = this.hero.x;
      let y = this.hero.y;
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps;
        const px = lerp(this.hero.x, nx, t);
        const py = lerp(this.hero.y, ny, t);
        if (this.world.canWalk(px, py)) {
          x = px;
          y = py;
        } else {
          break;
        }
      }
      this.hero.x = x;
      this.hero.y = y;
    }

    const st = this.hero.getStats?.() || { dmg: 8 };
    const burstR = 56;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(this.hero.x, this.hero.y, e.x, e.y) <= burstR * burstR) {
        e.takeDamage?.(Math.round(st.dmg * 0.7));
        if (!e.alive) this._onEnemyDefeated(e);
      }
    }

    this._shake(0.08, 2.8);
  }

  _castOrb(dx, dy) {
    if (!this._canCastSpell("r")) return;
    this._startSpell("r");

    const st = this.hero.getStats?.() || { dmg: 8 };
    const shots = [{ dx, dy }];

    if ((this.hero.level || 1) >= 7) {
      const spread = 0.22;
      shots.push({ dx: dx - dy * spread, dy: dy + dx * spread });
      shots.push({ dx: dx + dy * spread, dy: dy - dx * spread });
    }

    for (const s of shots) {
      const n = norm(s.dx, s.dy);
      const p = new Projectile(
        this.hero.x + n.x * 12,
        this.hero.y + n.y * 12 - 6,
        n.x * 320,
        n.y * 320,
        Math.round(st.dmg * 1.05),
        1.55,
        this.hero.level || 1,
        { color: "rgba(190,160,255,0.95)", radius: 8, type: "orb", hitRadius: 22, pierce: true }
      );
      p.meta.pierce = true;
      this.projectiles.push(p);
    }

    this._shake(0.06, 2.3);
  }

  _updateProjectiles(dt) {
    const r = this.perf.projectileUpdateRadius;

    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (!this._withinRadius(p.x, p.y, r) && !this.dungeon.active) continue;

      p.update?.(dt, this.world);
      if (!p.alive) continue;

      if (p.meta?.onHitHero || p.friendly === false) {
        if (dist2(p.x, p.y, this.hero.x, this.hero.y) < (p.hitRadius || 18) ** 2) {
          const dealt = this.hero.takeDamage?.(p.dmg) || p.dmg;
          this._msg(`-${Math.round(dealt)} HP`, 1.1);
          p.alive = false;
          this._shake(0.08, 3);
        }
        continue;
      }

      const hr2 = (p.hitRadius || 18) ** 2;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const id = e._id || (e._id = `${Math.random()}`);
        if (p._hitSet && p._hitSet.has(id)) continue;

        if (dist2(p.x, p.y, e.x, e.y) < hr2) {
          let dmg = p.dmg;
          const crit = p.meta?.crit || 0;
          const critMult = p.meta?.critMult || 1.7;
          if (Math.random() < crit) dmg = Math.round(dmg * critMult);

          e.takeDamage?.(dmg);
          if (!p._hitSet) p._hitSet = new Set();
          p._hitSet.add(id);
          this._shake(0.04, 1.8);

          if (!p.meta?.pierce) p.alive = false;

          if (!e.alive) this._onEnemyDefeated(e);
          break;
        }
      }
    }
  }

  _dropLoot(x, y, tier = 1, kind = "", elite = false) {
    if (this.loot.length >= this.perf.maxLoot) return;

    if (elite) {
      if (Math.random() < 0.5) {
        this.loot.push(new Loot(x, y, "gold", { amount: 10 + ((tier * 4) | 0) }));
      }
      const slotRoll = Math.random();
      const slot =
        slotRoll < 0.30 ? "weapon" :
        slotRoll < 0.52 ? "armor" :
        slotRoll < 0.66 ? "helm" :
        slotRoll < 0.78 ? "boots" :
        slotRoll < 0.90 ? "ring" : "trinket";

      const gearSeed = hash2(this.seed ^ 0x55aa, ((x | 0) * 31 + (y | 0) * 17));
      const g = makeGear(slot, (this.hero.level || 1) + 1, null, gearSeed);
      this.loot.push(new Loot(x, y, "gear", { gear: g }));
      return;
    }

    const r = Math.random();

    if (kind === "brute" && r < 0.75) {
      this.loot.push(new Loot(x, y, "gold", { amount: 6 + ((tier * 3) | 0) }));
      return;
    }

    if (kind === "caster" && r < 0.55) {
      this.loot.push(new Loot(x, y, "potion", {
        potionType: Math.random() < 0.35 ? "hp" : "mana",
        amount: 1,
      }));
      return;
    }

    if (r < 0.55) {
      this.loot.push(new Loot(x, y, "gold", { amount: 3 + ((tier * 2) | 0) }));
      return;
    }

    if (r < 0.78) {
      this.loot.push(new Loot(x, y, "potion", {
        potionType: Math.random() < 0.55 ? "hp" : "mana",
        amount: 1,
      }));
      return;
    }

    const slotRoll = Math.random();
    const slot =
      slotRoll < 0.38 ? "weapon" :
      slotRoll < 0.58 ? "armor" :
      slotRoll < 0.70 ? "helm" :
      slotRoll < 0.80 ? "boots" :
      slotRoll < 0.90 ? "ring" : "trinket";

    const gearSeed = hash2(this.seed, ((x | 0) * 31 + (y | 0) * 17));
    const g = makeGear(slot, this.hero.level || 1, null, gearSeed);
    this.loot.push(new Loot(x, y, "gear", { gear: g }));
  }

  _cleanupFarEntities() {
    if (this.dungeon.active) return;

    const enemyKeepR2 = (this.perf.enemyUpdateRadius + 900) ** 2;
    const lootKeepR2 = (this.perf.lootUpdateRadius + 900) ** 2;
    const projKeepR2 = (this.perf.projectileUpdateRadius + 900) ** 2;
    const cx = this.camera.x;
    const cy = this.camera.y;

    this.enemies = this.enemies.filter(e => {
      if (!e.alive) return false;
      if (e.home) return true;
      return dist2(e.x, e.y, cx, cy) <= enemyKeepR2;
    });

    this.loot = this.loot.filter(l => {
      if (!l.alive) return false;
      return dist2(l.x, l.y, cx, cy) <= lootKeepR2;
    });

    this.projectiles = this.projectiles.filter(p => {
      if (!p.alive) return false;
      return dist2(p.x, p.y, cx, cy) <= projKeepR2;
    });
  }

  update(dt) {
    dt = clamp(dt, 0, this._dtClamp);
    this.time += dt;

    if (this._pickupMsgCooldown > 0) this._pickupMsgCooldown = Math.max(0, this._pickupMsgCooldown - dt);
    if (this._spellMsgCooldown > 0) this._spellMsgCooldown = Math.max(0, this._spellMsgCooldown - dt);

    this._tickSpellCooldowns(dt);
    this._tickResetConfirm(dt);

    this._handleMenus();
    this._handleFastTravelInput();
    this._handleInventoryHotkeys();
    this._handleResetHotkey();

    if (!this.dungeon.active) {
      this.world?.update?.(dt, this.hero);
    }

    const blockMove =
      this.menu.open === "inventory" ||
      this.menu.open === "options" ||
      this.menu.open === "map";

    if (!blockMove) this._handleMovement(dt);
    else {
      this.hero.vx = 0;
      this.hero.vy = 0;
    }

    if (!blockMove) this._handleInteract();
    if (!blockMove) this._handleSpells();

    this.hero.update?.(dt);
    this._regenMana(dt);

    this._updateZoneMessages(dt);

    if (!this.dungeon.active) this._spawnFromCamps(dt);

    const enemyR = this.perf.enemyUpdateRadius;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!this.dungeon.active && !this._withinRadius(e.x, e.y, enemyR)) continue;
      e.update?.(dt, this.hero, this.world, this);
    }

    this._updateProjectiles(dt);

    const lootR = this.perf.lootUpdateRadius;
    for (const l of this.loot) {
      if (!l.alive) continue;
      if (!this.dungeon.active && !this._withinRadius(l.x, l.y, lootR)) continue;
      l.update?.(dt, this.hero);
    }

    this._pickupNearbyLootBonus();
    this._updateDungeonClear();

    if ((this.hero.level || 1) > this._levelMsgShown) {
      this._levelMsgShown = this.hero.level || 1;
      this._msg(`Level up! You are now level ${this.hero.level}.`, 2.8);
      this.hero.potions.hp = (this.hero.potions.hp | 0) + 1;
      this._saveSoon();
    }

    this._updateCamera(dt);
    this.ui?.update?.(dt, this);

    this.perf.cleanupTimer += dt;
    if (this.perf.cleanupTimer >= this.perf.cleanupEvery) {
      this.perf.cleanupTimer = 0;
      this._cleanupFarEntities();
    }

    this.enemies = this.enemies.filter(e => e.alive);
    this.projectiles = this.projectiles.filter(p => p.alive);
    this.loot = this.loot.filter(l => l.alive);

    this.input.endFrame();

    this._autosaveT += dt;
    if (this._autosaveT >= 5) {
      this._autosaveT = 0;
      this._save();
    }
  }

  _updateCamera(dt) {
    const cam = this.camera;

    cam.x = lerp(cam.x, this.hero.x, 1 - Math.pow(0.0005, dt));
    cam.y = lerp(cam.y, this.hero.y, 1 - Math.pow(0.0005, dt));

    if (cam.shakeT > 0) {
      cam.shakeT -= dt;
      const k = clamp(cam.shakeT / 0.12, 0, 1);
      const mag = cam.shakeMag * k;
      cam.sx = (Math.random() - 0.5) * 2 * mag;
      cam.sy = (Math.random() - 0.5) * 2 * mag;
      if (cam.shakeT <= 0) {
        cam.sx = 0;
        cam.sy = 0;
        cam.shakeMag = 0;
      }
    } else {
      cam.sx = 0;
      cam.sy = 0;
    }

    cam.zoom = lerp(cam.zoom, this.dungeon.active ? 1.04 : 1.0, 1 - Math.pow(0.001, dt));
  }

  _drawDungeonRoom(ctx) {
    const r = this.dungeon.room;
    if (!r) return;

    ctx.fillStyle = "rgba(26,24,34,1)";
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);

    ctx.strokeStyle = "rgba(90,84,108,1)";
    ctx.lineWidth = 14;
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);

    for (let x = r.x0 + 18; x < r.x1 - 18; x += 40) {
      for (let y = r.y0 + 18; y < r.y1 - 18; y += 40) {
        ctx.fillStyle = ((Math.floor((x + y) / 40) % 2) === 0)
          ? "rgba(44,40,56,1)"
          : "rgba(38,35,48,1)";
        ctx.fillRect(x, y, 38, 38);
      }
    }

    ctx.fillStyle = "rgba(120,88,70,1)";
    ctx.fillRect(this.dungeon.exit.x - 16, this.dungeon.exit.y - 14, 32, 20);

    ctx.fillStyle = this.dungeon.justCleared ? "rgba(188,158,255,1)" : "rgba(88,76,112,1)";
    ctx.fillRect(this.dungeon.stairsDown.x - 18, this.dungeon.stairsDown.y - 14, 36, 24);
    ctx.fillStyle = "rgba(32,28,42,1)";
    ctx.fillRect(this.dungeon.stairsDown.x - 10, this.dungeon.stairsDown.y - 6, 20, 10);

    if (this.dungeon.rewardChest) {
      const c = this.dungeon.rewardChest;
      ctx.fillStyle = this.dungeon.rewardTaken ? "rgba(110,86,54,1)" : "rgba(164,118,58,1)";
      ctx.fillRect(c.x - 16, c.y - 10, 32, 20);
      ctx.fillStyle = "rgba(212,182,86,1)";
      ctx.fillRect(c.x - 12, c.y - 6, 24, 7);
      ctx.fillStyle = "rgba(88,62,28,1)";
      ctx.fillRect(c.x - 4, c.y - 2, 8, 4);
    }
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.dungeon.active ? "rgb(14,12,18)" : "rgb(18,22,30)";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    const cam = this.camera;
    const z = cam.zoom;
    const sx = cam.sx || 0;
    const sy = cam.sy || 0;

    ctx.save();
    ctx.setTransform(
      z, 0,
      0, z,
      (this.w * 0.5) - cam.x * z + sx,
      (this.h * 0.5) - cam.y * z + sy
    );

    const vb = this._viewBoundsWorld();

    if (this.dungeon.active) {
      this._drawDungeonRoom(ctx);
    } else {
      this.world?.draw?.(ctx, { x: cam.x, y: cam.y, w: this.w, h: this.h, zoom: z });
    }

    for (const l of this.loot) {
      if (!l.alive) continue;
      if (!this.dungeon.active && !this._inView(l.x, l.y, vb)) continue;
      l.draw?.(ctx, this.time);
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!this.dungeon.active && !this._inView(e.x, e.y, vb)) continue;
      e.draw?.(ctx, this.time);
    }

    this.hero?.draw?.(ctx, this.time);

    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (!this.dungeon.active && !this._inView(p.x, p.y, vb)) continue;
      p.draw?.(ctx, this.time);
    }

    ctx.restore();

    this.ui?.draw?.(ctx, this);

    if (this.dungeon.active) {
      ctx.save();
      ctx.fillStyle = "rgba(220,210,255,0.9)";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`Dungeon Floor ${this.dungeon.floor}`, this.w * 0.5, 24);

      if (this.dungeon.justCleared) {
        ctx.fillStyle = "rgba(188,255,188,0.94)";
        ctx.fillText("Floor clear — open the chest, then press F at the purple stairs to go deeper or F at the south gate to leave", this.w * 0.5, 46);
      } else {
        ctx.fillStyle = "rgba(255,220,180,0.92)";
        ctx.fillText("Clear the room to unlock the stairs and chest", this.w * 0.5, 46);
      }
      ctx.restore();
    }
  }
}