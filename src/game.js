// src/game.js
// v87 MAP CONTROLS FIX PASS (FULL FILE)

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
    this.save = new Save("broke-knight-save-v87");

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
      enemyUpdateRadius: 980,
      lootUpdateRadius: 760,
      projectileUpdateRadius: 1260,
      spawnRadius: 940,
      drawPad: 150,
      maxEnemies: 28,
      maxLoot: 90,
      cleanupTimer: 0,
      cleanupEvery: 0.55,
      touchDamageTick: 0.18,
      campRespawnCheckEvery: 4.8,
      campAggroRadius: 340,
    };

    this.time = 0;
    this._dtClamp = 0.05;
    this._autosaveT = 8;

    this._spawnTimer = 0;
    this._campRespawnT = 0;
    this._rng = new RNG(hash2(this.seed, 9001));

    this.menu = { open: null };

    this.quests = [];
    this.questTurnIn = null;
    this._questIdCounter = 1;

    this.msg = "";
    this.msgT = 0;
    this.zoneMsg = "";
    this.zoneMsgT = 0;

    this.flashT = 0;
    this.hitStopT = 0;

    this._pickupMsgCooldown = 0;
    this._spellMsgCooldown = 0;
    this._touchShakeCd = 0;
    this._touchDamageCd = 0;
    this._dockToggleCd = 0;
    this._interactCd = 0;
    this._shopToggleCd = 0;
    this._spawnSuppressionT = 0;
    this._zoneSampleT = 0;
    this._lastZoneName = "";
    this._killFlashT = 0;
    this._combatTextT = 0;
    this._levelSeen = this.hero.level || 1;

    this._cachedNearbyCamp = null;
    this._cachedNearbyDock = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyDungeon = null;
    this._nearbyPoiTimer = 0;

    this._campRespawnState = {};

    this.shop = {
      campId: null,
      stockSeed: 0,
      refreshTier: 1,
      lastRefreshLevel: 1,
      stock: [],
    };

    this.mouse = {
      x: this.w * 0.5,
      y: this.h * 0.5,
      down: false,
      worldX: this.hero.x,
      worldY: this.hero.y,
      moved: false,
    };

    this.skillLoadout = ["q", "w", "e", "r"];
    this.selectedSkillSlot = 0;

    this.skillDefs = {
      q: { key: "q", name: "Spark", mana: 8, cd: 0.22, color: "#8be9ff" },
      w: { key: "w", name: "Nova", mana: 18, cd: 1.8, color: "#d6f5ff" },
      e: { key: "e", name: "Dash", mana: 14, cd: 2.8, color: "#ffd36e" },
      r: { key: "r", name: "Orb", mana: 22, cd: 3.4, color: "#c08cff" },
    };

    this.cooldowns = { q: 0, w: 0, e: 0, r: 0 };

    this.dungeon = {
      active: false,
      floor: 0,
      rooms: [],
      currentRoomIndex: 0,
      seed: 0,
      visited: new Set(),
      roomMsgT: 0,
      boss: null,
      rewardTier: 0,
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

    this._bindMouse();
    this._loadGame();

    if (!this.hero.inventory) this.hero.inventory = [];
    if (!this.hero.equip) this.hero.equip = {};
    if (!this.hero.potions) this.hero.potions = { hp: 2, mana: 1 };
    if (!this.hero.lastMove) this.hero.lastMove = { x: 1, y: 0 };
    if (!this.hero.state) this.hero.state = {};
    if (typeof this.hero.state.sailing !== "boolean") this.hero.state.sailing = false;
    if (typeof this.hero.state.dashT !== "number") this.hero.state.dashT = 0;
    if (typeof this.hero.state.hurtT !== "number") this.hero.state.hurtT = 0;
    if (typeof this.hero.state.campBuffT !== "number") this.hero.state.campBuffT = 0;
    if (typeof this.hero.state.campBuffPower !== "number") this.hero.state.campBuffPower = 0;
    if (typeof this.hero.state.dungeonMomentumT !== "number") this.hero.state.dungeonMomentumT = 0;
    if (typeof this.hero.state.dungeonMomentumPower !== "number") this.hero.state.dungeonMomentumPower = 0;
    if (typeof this.hero.state.eliteChainT !== "number") this.hero.state.eliteChainT = 0;
    if (typeof this.hero.state.eliteChainCount !== "number") this.hero.state.eliteChainCount = 0;

    this._ensureWorldPopulation();
    this._ensureCampQuests();
    this._ensureHeroSafe();

    this._msg("Broke Knight ready", 1.8);
  }

  resize(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this.world?.setViewSize?.(this.w, this.h);
    this.ui?.setViewSize?.(this.w, this.h);
  }

  update(dt) {
    dt = Math.min(this._dtClamp, Math.max(0, dt || 0));

    if (this.hitStopT > 0) {
      this.hitStopT = Math.max(0, this.hitStopT - dt);
      this._tickUI(dt);
      this._tickBuffs(dt);
      this._updateFx(dt);
      this.input.endFrame();
      return;
    }

    this.time += dt;

    this._tickUI(dt);
    this._tickCooldowns(dt);
    this._tickBuffs(dt);
    this._updateFx(dt);
    this._updateMouseWorld();
    this._handleMenus();

    this._dockToggleCd = Math.max(0, this._dockToggleCd - dt);
    this._interactCd = Math.max(0, this._interactCd - dt);
    this._shopToggleCd = Math.max(0, this._shopToggleCd - dt);
    this._spawnSuppressionT = Math.max(0, this._spawnSuppressionT - dt);
    this._killFlashT = Math.max(0, this._killFlashT - dt);
    this._combatTextT = Math.max(0, this._combatTextT - dt);

    this._updateNearbyPOIs(dt);
    this._autoCloseShopIfNeeded();

    if (this.menu.open === "map") {
      this._handleFastTravelInput();
    } else if (this.menu.open === "shop") {
      this._handleShopInput();
    } else if (this.menu.open === "inventory") {
      this._handleInventoryInput();
    } else {
      this._handleMovement(dt);
      this._handleSpells();
    }

    if (this.input.wasPressed("b") && this._dockToggleCd <= 0) {
      this._dockToggleCd = 0.18;
      this._toggleDockingOrSailing();
    }

    if (this.input.wasPressed("f") && this._interactCd <= 0) {
      this._interactCd = 0.18;
      this._interact();
    }

    if (this.input.wasPressed("h") && this._shopToggleCd <= 0) {
      this._shopToggleCd = 0.18;
      this._toggleShop();
    }

    this.hero.update?.(dt);
    this._checkLevelUpMessage();

    if (this.dungeon.active) {
      this._updateDungeon(dt);
    } else {
      this.world.update?.(dt, this.hero);
      this._spawnWorldEnemies(dt);
      this._respawnCampEnemies(dt);
      this._updateOverworldEnemies(dt);
      this._applyCampSafeZones(dt);
    }

    this._updateProjectiles(dt);
    this._updateLoot(dt);

    if ((this.time % 0.20) < dt) {
      this._updateQuestState();
    }

    this._updateZoneMessages(dt);
    this._tickCamera(dt);
    this._ensureHeroSafe();

    this.perf.cleanupTimer += dt;
    if (this.perf.cleanupTimer >= this.perf.cleanupEvery) {
      this.perf.cleanupTimer = 0;
      this._cleanupFarEntities();
    }

    this._autosaveT -= dt;
    if (this._autosaveT <= 0) {
      this._autosaveT = 8 + Math.random() * 4;
      this._saveGame();
    }

    this.input.endFrame();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawBackground(ctx);

    if (this._killFlashT > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${0.035 * this._killFlashT})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    ctx.translate((this.w * 0.5) | 0, (this.h * 0.5) | 0);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(
      (-this.camera.x + this.camera.sx) | 0,
      (-this.camera.y + this.camera.sy) | 0
    );

    if (this.dungeon.active) {
      this._drawDungeonWorld(ctx);
    } else {
      this.world.draw?.(ctx, this.camera);
    }

    const vb = this._viewBoundsWorld();

    for (const l of this.loot) {
      if (!l?.alive) continue;
      if (this._inView(l.x, l.y, vb)) l.draw?.(ctx);
    }

    for (const p of this.projectiles) {
      if (!p?.alive) continue;
      if (this._inView(p.x, p.y, vb)) p.draw?.(ctx);
    }

    for (const e of this.enemies) {
      if (!e?.alive) continue;
      if (this._inView(e.x, e.y, vb)) e.draw?.(ctx);
    }

    this._drawBossTelegraphWorld(ctx, vb);
    this._drawFxWorld(ctx, vb);
    this.hero.draw?.(ctx);

    if (this.dungeon.active) {
      this._drawDungeonOverlayWorld(ctx);
    }

    ctx.restore();

    this.ui.draw?.(ctx, this);
    this._drawOverlayText(ctx);
  }

  _drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, "#0c1320");
    g.addColorStop(0.35, "#102033");
    g.addColorStop(0.7, "#14273b");
    g.addColorStop(1, "#0a111b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  _drawOverlayText(ctx) {
    if (this.msgT > 0 && this.msg) {
      ctx.save();
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 4;
      ctx.strokeText(this.msg, this.w * 0.5, this.h - 28);
      ctx.fillText(this.msg, this.w * 0.5, this.h - 28);
      ctx.restore();
    }

    if (this.zoneMsgT > 0 && this.zoneMsg) {
      ctx.save();
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(232,238,252,0.92)";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 5;
      ctx.strokeText(this.zoneMsg, this.w * 0.5, 34);
      ctx.fillText(this.zoneMsg, this.w * 0.5, 34);
      ctx.restore();
    }

    if (this._combatTextT > 0.1) {
      ctx.save();
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,228,150,0.92)";
      ctx.strokeStyle = "rgba(0,0,0,0.38)";
      ctx.lineWidth = 4;
      const y = this.h - 60 - (1 - this._combatTextT) * 8;
      ctx.strokeText("Enemy defeated", this.w * 0.5, y);
      ctx.fillText("Enemy defeated", this.w * 0.5, y);
      ctx.restore();
    }
  }

  _tickUI(dt) {
    this.msgT = Math.max(0, this.msgT - dt);
    this.zoneMsgT = Math.max(0, this.zoneMsgT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this._pickupMsgCooldown = Math.max(0, this._pickupMsgCooldown - dt);
    this._spellMsgCooldown = Math.max(0, this._spellMsgCooldown - dt);
    this._touchShakeCd = Math.max(0, this._touchShakeCd - dt);
    this._touchDamageCd = Math.max(0, this._touchDamageCd - dt);
    if (this.dungeon.roomMsgT > 0) this.dungeon.roomMsgT -= dt;
    this.ui?.update?.(dt, this);
  }

  _tickCooldowns(dt) {
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
  }

  _tickBuffs(dt) {
    const st = this.hero.state || {};
    st.campBuffT = Math.max(0, (st.campBuffT || 0) - dt);
    st.dungeonMomentumT = Math.max(0, (st.dungeonMomentumT || 0) - dt);
    st.eliteChainT = Math.max(0, (st.eliteChainT || 0) - dt);

    if (st.campBuffT <= 0) st.campBuffPower = 0;
    if (st.dungeonMomentumT <= 0) st.dungeonMomentumPower = 0;
    if (st.eliteChainT <= 0) st.eliteChainCount = 0;
  }

  _updateFx(dt) {
    for (const s of this.hitSparks) {
      s.t -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
      s.vy *= 0.92;
    }
    this.hitSparks = this.hitSparks.filter((s) => s.t > 0);

    for (const f of this.floatingTexts) {
      f.t -= dt;
      f.y -= f.speed * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.t > 0);
  }

  _currentDamageBonus() {
    const st = this.hero.state || {};
    const camp = st.campBuffT > 0 ? st.campBuffPower || 0 : 0;
    const dungeon = st.dungeonMomentumT > 0 ? st.dungeonMomentumPower || 0 : 0;
    const chain = Math.max(0, Math.min(6, st.eliteChainCount || 0));
    return camp + dungeon + chain;
  }

  _currentIncomingDamageMult() {
    const st = this.hero.state || {};
    let mult = 1;
    if (st.campBuffT > 0) mult -= Math.min(0.22, (st.campBuffPower || 0) * 0.016);
    if (st.dungeonMomentumT > 0) mult -= Math.min(0.10, (st.dungeonMomentumPower || 0) * 0.012);
    return Math.max(0.68, mult);
  }

  _campRenown(campId) {
    return this.progress?.campRenown?.[campId] || 0;
  }

  _campTier(campId) {
    const renown = this._campRenown(campId);
    if (renown >= 6) return 4;
    if (renown >= 4) return 3;
    if (renown >= 2) return 2;
    return 1;
  }

  _campTierName(campId) {
    const t = this._campTier(campId);
    if (t >= 4) return "Stronghold";
    if (t >= 3) return "Keep";
    if (t >= 2) return "Camp";
    return "Outpost";
  }

  _campPriceMultiplier(campId) {
    const tier = this._campTier(campId);
    return tier >= 4 ? 0.82 : tier >= 3 ? 0.88 : tier >= 2 ? 0.94 : 1.0;
  }

  _campQuestRewardMultiplier(campId) {
    const tier = this._campTier(campId);
    return tier >= 4 ? 1.32 : tier >= 3 ? 1.22 : tier >= 2 ? 1.10 : 1.0;
  }

  _campBlessingStats(campId, strong = false) {
    const tier = this._campTier(campId);
    const renown = this._campRenown(campId);
    const basePower = strong ? 5 : 3;
    const baseTime = strong ? 120 : 75;

    const power =
      basePower +
      (tier - 1) * (strong ? 2 : 1) +
      Math.floor(renown * 0.35);

    const time =
      baseTime +
      (tier - 1) * (strong ? 28 : 18) +
      Math.floor(renown * 3);

    return { power, time };
  }

  _campSafeRadius(campId) {
    const tier = this._campTier(campId);
    return tier >= 4 ? 205 : tier >= 3 ? 178 : tier >= 2 ? 150 : 118;
  }

  _campRespawnDelay(campId) {
    const tier = this._campTier(campId);
    if (tier >= 4) return 40;
    if (tier >= 3) return 32;
    if (tier >= 2) return 24;
    return 18;
  }

  _campIsActivelyShopping(campId) {
    return this.menu.open === "shop" && this.shop?.campId === campId;
  }

  _campShouldStayCalm(camp) {
    const safeRadius = this._campSafeRadius(camp.id);
    const calmRadius = safeRadius + 110;
    const heroNear = dist2(this.hero.x, this.hero.y, camp.x, camp.y) < calmRadius * calmRadius;
    return heroNear || this._campIsActivelyShopping(camp.id);
  }

  _setCampRespawnLock(campId, extra = 0) {
    const base = this._campRespawnDelay(campId) + Math.max(0, extra);
    const until = this.time + base;
    this._campRespawnState[campId] = Math.max(this._campRespawnState[campId] || 0, until);
  }

  _campRespawnUnlocked(campId) {
    return (this._campRespawnState[campId] || 0) <= this.time;
  }

  _grantCampBlessing(campId, strong = false) {
    const bless = this._campBlessingStats(campId, strong);
    this.hero.state.campBuffT = Math.max(this.hero.state.campBuffT || 0, bless.time);
    this.hero.state.campBuffPower = Math.max(this.hero.state.campBuffPower || 0, bless.power);
    this._msg(`${this._campTierName(campId)} blessing • +${bless.power} power`, 1.2);
  }

  _grantDungeonMomentum() {
    const floor = this.dungeon.floor || 1;
    const power = 4 + Math.min(8, floor);
    const time = 140;

    this.hero.state.dungeonMomentumT = Math.max(this.hero.state.dungeonMomentumT || 0, time);
    this.hero.state.dungeonMomentumPower = Math.max(this.hero.state.dungeonMomentumPower || 0, power);

    this._msg(`Dungeon momentum • +${power} power`, 1.3);
  }

  _grantRoomClearRecovery() {
    const hpGain = Math.max(6, Math.round(this.hero.maxHp * 0.08));
    const manaGain = Math.max(8, Math.round(this.hero.maxMana * 0.12));

    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + hpGain);
    this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + manaGain);
    this._msg(`Room cleared • +${hpGain} HP +${manaGain} MP`, 0.9);
  }

  _tickCamera(dt) {
    this.camera.x = lerp(this.camera.x, this.hero.x, 1 - Math.exp(-dt * 10));
    this.camera.y = lerp(this.camera.y, this.hero.y, 1 - Math.exp(-dt * 10));

    if (this.camera.shakeT > 0) {
      this.camera.shakeT = Math.max(0, this.camera.shakeT - dt);
      const m = this.camera.shakeMag;
      this.camera.sx = (Math.random() * 2 - 1) * m;
      this.camera.sy = (Math.random() * 2 - 1) * m;
    } else {
      this.camera.sx = lerp(this.camera.sx, 0, 1 - Math.exp(-dt * 18));
      this.camera.sy = lerp(this.camera.sy, 0, 1 - Math.exp(-dt * 18));
    }
  }

  _viewBoundsWorld() {
    const z = this.camera.zoom || 1;
    const halfW = (this.w * 0.5) / z;
    const halfH = (this.h * 0.5) / z;
    const pad = this.perf.drawPad;
    return {
      x0: this.camera.x - halfW - pad,
      x1: this.camera.x + halfW + pad,
      y0: this.camera.y - halfH - pad,
      y1: this.camera.y + halfH + pad,
    };
  }

  _inView(x, y, vb) {
    return x >= vb.x0 && x <= vb.x1 && y >= vb.y0 && y <= vb.y1;
  }

  _drawFxWorld(ctx, vb) {
    for (const s of this.hitSparks) {
      if (!this._inView(s.x, s.y, vb)) continue;
      const alpha = clamp(s.t / s.maxT, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04);
      ctx.stroke();
      ctx.restore();
    }

    for (const f of this.floatingTexts) {
      if (!this._inView(f.x, f.y, vb)) continue;
      const alpha = clamp(f.t / f.maxT, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = f.crit ? "bold 18px Arial" : "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = f.crit ? 4 : 3;
      ctx.fillStyle = f.color;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  _drawBossTelegraphWorld(ctx, vb) {
    const boss = this.dungeon?.boss;
    if (!this.dungeon.active || !boss || !boss.enemy?.alive) return;

    const x = boss.enemy.x;
    const y = boss.enemy.y;
    if (!this._inView(x, y, vb)) return;

    if (boss.burstTelegraphT > 0) {
      const p = clamp(1 - boss.burstTelegraphT / boss.burstTelegraphMax, 0, 1);
      const r = 38 + p * 86;
      ctx.save();
      ctx.strokeStyle = `rgba(255,120,120,${0.35 + p * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (boss.slamTelegraphT > 0) {
      const p = clamp(1 - boss.slamTelegraphT / boss.slamTelegraphMax, 0, 1);
      const r = 26 + p * 54;
      ctx.save();
      ctx.fillStyle = `rgba(255,170,80,${0.08 + p * 0.12})`;
      ctx.strokeStyle = `rgba(255,200,120,${0.35 + p * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _spawnHitSparks(x, y, color = "rgba(255,255,255,0.9)", count = 5, speed = 120) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.55 + Math.random() * 0.85);
      this.hitSparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color,
        t: 0.18 + Math.random() * 0.12,
        maxT: 0.30,
      });
    }
  }

  _spawnFloatingText(x, y, text, color = "rgba(255,255,255,0.95)", crit = false) {
    this.floatingTexts.push({
      x,
      y,
      text: String(text),
      color,
      crit,
      t: crit ? 0.78 : 0.62,
      maxT: crit ? 0.78 : 0.62,
      speed: crit ? 26 : 20,
    });
  }

  _getHeroOffense() {
    const st = this.hero.getStats?.() || { dmg: 8, crit: 0.05, critMult: 1.7 };
    return {
      dmg: (st.dmg || 8) + this._currentDamageBonus(),
      crit: Math.max(0, st.crit || 0),
      critMult: Math.max(1.2, st.critMult || 1.7),
    };
  }

  _rollOutgoingDamage(baseDamage, meta = {}) {
    const critChance = Math.max(0, meta?.critChance || 0);
    const critMult = Math.max(1.2, meta?.critMult || 1.7);
    const crit = Math.random() < critChance;
    const dmg = crit ? Math.round(baseDamage * critMult) : Math.round(baseDamage);
    return { dmg: Math.max(1, dmg), crit };
  }

  _drawDungeonWorld(ctx) {
    const room = this._getRoom();
    if (!room) return;

    const x0 = room.x - room.w * 0.5;
    const y0 = room.y - room.h * 0.5;

    ctx.fillStyle = room.boss ? "rgba(34,26,30,1)" : "rgba(28,28,38,1)";
    ctx.fillRect(x0, y0, room.w, room.h);

    const cell = 24;
    for (let y = 0; y < room.h; y += cell) {
      for (let x = 0; x < room.w; x += cell) {
        const wx = x0 + x;
        const wy = y0 + y;
        const n = hash2((wx / cell) | 0, (wy / cell) | 0, this.dungeon.floor | 0) >>> 0;
        ctx.fillStyle = room.boss
          ? (n % 2 === 0 ? "rgba(56,34,40,1)" : "rgba(48,28,34,1)")
          : (n % 2 === 0 ? "rgba(46,46,58,1)" : "rgba(40,40,50,1)");
        ctx.fillRect(wx, wy, cell + 1, cell + 1);
      }
    }

    ctx.fillStyle = room.boss ? "rgba(86,58,44,1)" : "rgba(64,54,40,1)";
    ctx.fillRect(x0 - 18, y0 - 18, room.w + 36, 18);
    ctx.fillRect(x0 - 18, y0 + room.h, room.w + 36, 18);
    ctx.fillRect(x0 - 18, y0, 18, room.h);
    ctx.fillRect(x0 + room.w, y0, 18, room.h);

    if (room.boss) {
      ctx.strokeStyle = "rgba(255,130,110,0.30)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(room.x, room.y, 78, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawDungeonOverlayWorld(ctx) {
    const room = this._getRoom();
    if (!room) return;

    ctx.save();
    ctx.fillStyle = room.boss ? "rgba(20,0,0,0.12)" : "rgba(0,0,0,0.25)";
    ctx.fillRect(room.x - room.w * 0.5, room.y - room.h * 0.5, room.w, room.h);
    ctx.restore();
  }

  _handleMenus() {
    if (this.input.wasPressed("i")) this.menu.open = this.menu.open === "inventory" ? null : "inventory";
    if (this.input.wasPressed("k")) this.menu.open = this.menu.open === "skills" ? null : "skills";
    if (this.input.wasPressed("g")) this.menu.open = this.menu.open === "god" ? null : "god";

    if (this.input.wasPressed("m")) {
      this.menu.open = this.menu.open === "map" ? null : "map";
    }

    if (this.input.wasPressed("j")) this.menu.open = this.menu.open === "quests" ? null : "quests";
    if (this.input.wasPressed("Escape")) this.menu.open = null;

    if (this.menu.open) this.ui.open?.(this.menu.open);
    else this.ui.closeAll?.();
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
      this.hero.lastMove = { x: n.x, y: n.y };

      let speed = this.hero.getMoveSpeed?.(this) || 140;
      if (this.menu.open) speed *= 0.65;
      if (this.hero.state?.dashT > 0) speed *= 1.1;

      this.hero.vx += (n.x * speed - this.hero.vx) * 0.18;
      this.hero.vy += (n.y * speed - this.hero.vy) * 0.18;

      const nx = this.hero.x + this.hero.vx * dt;
      const ny = this.hero.y + this.hero.vy * dt;

      if (this.dungeon.active) {
        this._moveHeroDungeon(nx, ny);
      } else if (this.hero.state?.sailing) {
        this.hero.x = nx;
        this.hero.y = ny;
      } else {
        if (this.world.canWalk(nx, this.hero.y)) this.hero.x = nx;
        else this.hero.vx = 0;

        if (this.world.canWalk(this.hero.x, ny)) this.hero.y = ny;
        else this.hero.vy = 0;
      }
    } else {
      this.hero.vx *= 0.82;
      this.hero.vy *= 0.82;
      if (Math.abs(this.hero.vx) < 1) this.hero.vx = 0;
      if (Math.abs(this.hero.vy) < 1) this.hero.vy = 0;
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

  _handleInventoryInput() {
    const digitPressed =
      this.input.wasPressed("1") ? 1 :
      this.input.wasPressed("2") ? 2 :
      this.input.wasPressed("3") ? 3 :
      this.input.wasPressed("4") ? 4 :
      this.input.wasPressed("5") ? 5 :
      this.input.wasPressed("6") ? 6 :
      this.input.wasPressed("7") ? 7 :
      this.input.wasPressed("8") ? 8 :
      this.input.wasPressed("9") ? 9 :
      0;

    if (digitPressed > 0) {
      this._equipInventoryIndex(digitPressed - 1);
    }
  }

  _handleSpells() {
    const aim = this._getAim();

    if (this.input.wasPressed("q")) this._castSpark(aim.x, aim.y);
    if (this.input.wasPressed("w")) this._castNova();
    if (this.input.wasPressed("e")) this._castDash(aim.x, aim.y);
    if (this.input.wasPressed("r")) this._castOrb(aim.x, aim.y);
  }

  _handleShopInput() {
    if (!this.shop.campId) return;

    if (this.input.wasPressed("1")) { this._buyPotion("hp"); return; }
    if (this.input.wasPressed("2")) { this._buyPotion("mana"); return; }
    if (this.input.wasPressed("3")) { this._buyStockItem(0); return; }
    if (this.input.wasPressed("4")) { this._buyStockItem(1); return; }
    if (this.input.wasPressed("5")) { this._sellInventoryIndex(0); return; }
    if (this.input.wasPressed("6")) { this._sellInventoryIndex(1); return; }
    if (this.input.wasPressed("7")) { this._sellInventoryIndex(2); return; }
    if (this.input.wasPressed("8")) { this._sellInventoryIndex(3); return; }
    if (this.input.wasPressed("9")) { this._sellInventoryIndex(4); return; }
  }

  _toggleShop() {
    const camp = this._cachedNearbyCamp;
    if (!camp) {
      if (this.menu.open === "shop") this.menu.open = null;
      else this._msg("No camp nearby");
      return;
    }

    if (this.menu.open === "shop") {
      this.menu.open = null;
      return;
    }

    this._openShopForCamp(camp);
  }

  _openShopForCamp(camp) {
    this._refreshShopForCamp(camp);
    this.menu.open = "shop";
    this.ui.open?.("shop");
    this._setCampRespawnLock(camp.id, 8);
    this._msg(`${camp.name || `Camp ${camp.id}`} • ${this._campTierName(camp.id)} shop`, 1.1);
  }

  _refreshShopForCamp(camp) {
    const renown = this._campRenown(camp.id);
    const tier = this._campTier(camp.id);

    const needsRefresh =
      this.shop.campId !== camp.id ||
      this.shop.lastRefreshLevel !== this.hero.level;

    if (!needsRefresh) return;

    this.shop.campId = camp.id;
    this.shop.stockSeed = hash2(camp.id | 0, this.hero.level | 0, this.seed | 0, renown | 0);
    this.shop.refreshTier = Math.max(1, this.hero.level);
    this.shop.lastRefreshLevel = this.hero.level;

    const rng = new RNG(this.shop.stockSeed);
    const rarityBoost =
      tier >= 4 ? 0.16 :
      tier >= 3 ? 0.10 :
      tier >= 2 ? 0.05 :
      0;

    const weaponRarityRoll = rng.float();
    const armorRarityRoll = rng.float();

    const weaponRarity =
      weaponRarityRoll < 0.46 - rarityBoost ? "common" :
      weaponRarityRoll < 0.76 - rarityBoost ? "uncommon" :
      weaponRarityRoll < 0.92 ? "rare" :
      "epic";

    const armorRarity =
      armorRarityRoll < 0.50 - rarityBoost ? "common" :
      armorRarityRoll < 0.80 - rarityBoost ? "uncommon" :
      armorRarityRoll < 0.94 ? "rare" :
      "epic";

    const levelBoost = Math.floor(renown * 0.45) + Math.max(0, tier - 1);
    const weapon = makeGear("weapon", this.hero.level + levelBoost, weaponRarity, hash2(this.shop.stockSeed, 11));
    const armor = makeGear("armor", this.hero.level + levelBoost, armorRarity, hash2(this.shop.stockSeed, 23));

    const priceMult = 1.15 * this._campPriceMultiplier(camp.id);
    weapon.price = Math.max(18, Math.round(weapon.price * priceMult));
    armor.price = Math.max(16, Math.round(armor.price * (1.12 * this._campPriceMultiplier(camp.id))));

    this.shop.stock = [weapon, armor];
  }

  _buyPotion(kind) {
    const mult = this._campPriceMultiplier(this.shop.campId);
    const cost = Math.max(8, Math.round((kind === "mana" ? 16 : 14) * mult));

    if ((this.hero.gold || 0) < cost) {
      this._msg("Not enough gold");
      return;
    }

    this.hero.gold -= cost;
    if (kind === "mana") this.hero.potions.mana = (this.hero.potions.mana || 0) + 1;
    else this.hero.potions.hp = (this.hero.potions.hp || 0) + 1;

    this._msg(kind === "mana" ? "Bought Mana Potion" : "Bought HP Potion");
    this._saveSoon();
  }

  _buyStockItem(index) {
    const item = this.shop.stock[index];
    if (!item) return;

    if ((this.hero.gold || 0) < (item.price || 0)) {
      this._msg("Not enough gold");
      return;
    }

    this.hero.gold -= item.price || 0;

    const boughtItem = { ...item };
    const diff = this._compareItemVsEquipped(boughtItem);

    if (diff >= 1.2) {
      this._equipItemDirect(boughtItem, true);
      this._msg(`Bought and equipped ${boughtItem.name}`, 1.2);
    } else {
      this.hero.inventory.push(boughtItem);
      this._msg(`Bought ${boughtItem.name}`, 1.2);
    }

    const replacementSlot = item.slot || (index === 0 ? "weapon" : "armor");
    const campId = this.shop.campId;
    const levelBoost = Math.floor(this._campRenown(campId) * 0.4) + Math.max(0, this._campTier(campId) - 1);
    const replacement = makeGear(
      replacementSlot,
      this.hero.level + levelBoost,
      null,
      hash2(this.shop.stockSeed, this.time * 1000 | 0, index | 0)
    );
    replacement.price = Math.max(14, Math.round(replacement.price * (1.10 * this._campPriceMultiplier(campId))));
    this.shop.stock[index] = replacement;

    this._setCampRespawnLock(campId, 8);
    this._saveSoon();
  }

  _sellInventoryIndex(index) {
    const inv = this.hero.inventory || [];
    if (index < 0 || index >= inv.length) return;

    const item = inv[index];
    if (!item) return;

    const tier = this._campTier(this.shop.campId);
    const sellRate = tier >= 4 ? 0.58 : tier >= 3 ? 0.52 : tier >= 2 ? 0.48 : 0.45;
    const sellPrice = Math.max(4, Math.round((item.price || 10) * sellRate));

    this.hero.gold += sellPrice;
    inv.splice(index, 1);
    this._setCampRespawnLock(this.shop.campId, 8);
    this._msg(`Sold ${item.name} for ${sellPrice}G`, 1.1);
    this._saveSoon();
  }

  _gearScore(item) {
    if (!item?.stats) return -9999;
    const s = item.stats;
    return (
      (s.dmg || 0) * 2.0 +
      (s.armor || 0) * 1.7 +
      (s.crit || 0) * 100 +
      (s.critMult || 0) * 65 +
      (item.level || 1) * 0.15
    );
  }

  _compareItemVsEquipped(item) {
    if (!item?.slot) return -9999;
    const current = this.hero.equip?.[item.slot];
    if (!current?.stats) return 9999;
    return this._gearScore(item) - this._gearScore(current);
  }

  _equipItemDirect(item, allowSwap = true) {
    if (!item?.slot) return false;

    const current = this.hero.equip?.[item.slot];
    this.hero.equip[item.slot] = { ...item };

    if (allowSwap && current?.slot) {
      this.hero.inventory.push(current);
    }

    return true;
  }

  _equipInventoryIndex(index) {
    const inv = this.hero.inventory || [];
    if (index < 0 || index >= inv.length) return false;

    const item = inv[index];
    if (!item?.slot) return false;

    const current = this.hero.equip?.[item.slot];
    inv.splice(index, 1);
    this.hero.equip[item.slot] = item;

    if (current?.slot) {
      inv.push(current);
      const diff = this._gearScore(item) - this._gearScore(current);
      if (diff > 0.5) this._msg(`Equipped ${item.name} • upgrade`, 1.1);
      else if (diff < -0.5) this._msg(`Equipped ${item.name} • weaker`, 1.1);
      else this._msg(`Equipped ${item.name}`, 1.1);
    } else {
      this._msg(`Equipped ${item.name}`, 1.1);
    }

    this._saveSoon();
    return true;
  }

  _maybeAutoEquipLoot(gear) {
    if (!gear?.slot) return;

    const diff = this._compareItemVsEquipped(gear);

    if (diff >= 1.2) {
      const old = this.hero.equip?.[gear.slot];
      this.hero.equip[gear.slot] = { ...gear };
      if (old?.slot) this.hero.inventory.push(old);
      this._msg(`Auto-equipped ${gear.name}`, 1.0);
    } else if (!this.hero.equip?.[gear.slot]) {
      this.hero.equip[gear.slot] = { ...gear };
      this._msg(`Equipped ${gear.name}`, 1.0);
    } else {
      this.hero.inventory.push(gear);
      this._msg(`Looted ${gear.name}`, 1.0);
    }
  }

  _getAim() {
    if (this.mouse?.moved) {
      const dx = this.mouse.worldX - this.hero.x;
      const dy = this.mouse.worldY - this.hero.y;
      const n = norm(dx, dy);
      return { x: n.x || 1, y: n.y || 0 };
    }

    const last = this.hero.lastMove || { x: 1, y: 0 };
    const n = norm(last.x, last.y);
    return { x: n.x || 1, y: n.y || 0 };
  }

  _castSpark(dx, dy) {
    if (this.cooldowns.q > 0) return;

    const def = this.skillDefs.q;
    if (!this.hero.spendMana?.(def.mana)) {
      this._spellMsg("No mana");
      return;
    }

    const off = this._getHeroOffense();

    this.projectiles.push(
      new Projectile(
        this.hero.x + dx * 16,
        this.hero.y + dy * 16,
        dx * 340,
        dy * 340,
        off.dmg,
        1.0,
        this.hero.level,
        {
          friendly: true,
          color: "#8be9ff",
          type: "spark",
          radius: 5,
          hitRadius: 18,
          critChance: off.crit,
          critMult: off.critMult,
          hitColor: "rgba(139,233,255,0.95)",
        }
      )
    );

    this.cooldowns.q = def.cd;
    this._spellMsg("Spark");
  }

  _castNova() {
    if (this.cooldowns.w > 0) return;

    const def = this.skillDefs.w;
    if (!this.hero.spendMana?.(def.mana)) {
      this._spellMsg("No mana");
      return;
    }

    const off = this._getHeroOffense();

    this.projectiles.push(
      new Projectile(
        this.hero.x,
        this.hero.y,
        0,
        0,
        off.dmg,
        0.18,
        this.hero.level,
        {
          friendly: true,
          nova: true,
          radius: 12,
          hitRadius: 76,
          color: "#d6f5ff",
          critChance: off.crit * 0.8,
          critMult: off.critMult,
          hitColor: "rgba(214,245,255,0.95)",
        }
      )
    );

    this.cooldowns.w = def.cd;
    this._spellMsg("Nova");
    this._shake(0.05, 2.0);
  }

  _castDash(dx, dy) {
    if (this.cooldowns.e > 0) return;

    const def = this.skillDefs.e;
    if (!this.hero.spendMana?.(def.mana)) {
      this._spellMsg("No mana");
      return;
    }

    const dist = 86;
    const nx = this.hero.x + dx * dist;
    const ny = this.hero.y + dy * dist;

    if (this.dungeon.active) {
      this._moveHeroDungeon(nx, ny);
    } else {
      if (this.world.canWalk(nx, this.hero.y)) this.hero.x = nx;
      if (this.world.canWalk(this.hero.x, ny)) this.hero.y = ny;
    }

    this.spawnDashBurst(this.hero.x, this.hero.y, dx, dy);

    this.hero.state.dashT = 0.12;
    this.cooldowns.e = def.cd;
    this._shake(0.09, 3.2);
    this._spellMsg("Dash");
  }

  spawnDashBurst(x, y, dx, dy) {
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 1.2;
      const a = Math.atan2(dy, dx) + Math.PI + spread;
      const s = 80 + Math.random() * 90;
      this.hitSparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: "rgba(255,211,110,0.92)",
        t: 0.20 + Math.random() * 0.14,
        maxT: 0.34,
      });
    }
  }

  _castOrb(dx, dy) {
    if (this.cooldowns.r > 0) return;

    const def = this.skillDefs.r;
    if (!this.hero.spendMana?.(def.mana)) {
      this._spellMsg("No mana");
      return;
    }

    const off = this._getHeroOffense();

    this.projectiles.push(
      new Projectile(
        this.hero.x + dx * 18,
        this.hero.y + dy * 18,
        dx * 190,
        dy * 190,
        off.dmg * 1.4,
        1.8,
        this.hero.level,
        {
          friendly: true,
          color: "#c08cff",
          type: "orb",
          radius: 8,
          hitRadius: 24,
          critChance: off.crit + 0.03,
          critMult: off.critMult + 0.15,
          hitColor: "rgba(192,140,255,0.96)",
        }
      )
    );

    this.cooldowns.r = def.cd;
    this._spellMsg("Orb");
    this._shake(0.04, 1.8);
  }

  _updateProjectiles(dt) {
    const nearR2 = this.perf.projectileUpdateRadius * this.perf.projectileUpdateRadius;

    for (const p of this.projectiles) {
      if (!p.alive) continue;

      const pdx = p.x - this.hero.x;
      const pdy = p.y - this.hero.y;
      if (pdx * pdx + pdy * pdy > nearR2) {
        p.life -= dt * 2;
        if (p.life <= 0) p.alive = false;
        continue;
      }

      p.update?.(dt, this.dungeon.active ? null : this.world);

      if (p.meta?.onHitHero) {
        if (dist2(p.x, p.y, this.hero.x, this.hero.y) < (p.hitRadius || 16) ** 2) {
          const raw = (p.dmg || 4) * this._currentIncomingDamageMult();
          const dealt = this.hero.takeDamage?.(raw) ?? Math.round(raw);
          p.alive = false;
          this._spawnHitSparks(this.hero.x, this.hero.y, "rgba(255,120,120,0.92)", 6, 130);
          this._spawnFloatingText(this.hero.x, this.hero.y - 14, `${Math.round(dealt)}`, "rgba(255,160,160,0.96)", false);
          this._shake(0.05, 1.8);
          this.hitStopT = Math.max(this.hitStopT, 0.012);
          continue;
        }
      }

      if (p.friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist2(p.x, p.y, e.x, e.y) < (p.hitRadius || 18) ** 2) {
            const roll = this._rollOutgoingDamage(p.dmg || 4, p.meta || {});
            e.takeDamage?.(roll.dmg);

            const hitColor = p.meta?.hitColor || p.meta?.color || "rgba(255,255,255,0.9)";
            this._spawnHitSparks(e.x, e.y, hitColor, roll.crit ? 10 : 6, roll.crit ? 180 : 130);
            this._spawnFloatingText(
              e.x,
              e.y - 12,
              roll.crit ? `CRIT ${roll.dmg}` : `${roll.dmg}`,
              roll.crit ? "rgba(255,232,140,0.98)" : "rgba(245,248,255,0.96)",
              roll.crit
            );

            if (roll.crit) {
              this._shake(0.05, 2.8);
              this.hitStopT = Math.max(this.hitStopT, 0.028);
            } else {
              this._shake(0.025, 1.2);
              this.hitStopT = Math.max(this.hitStopT, 0.010);
            }

            if (!p.meta?.pierce) p.alive = false;

            if (!e.alive) {
              this._spawnHitSparks(e.x, e.y, "rgba(255,235,170,0.95)", e.elite ? 14 : 8, e.elite ? 230 : 160);
              this._onEnemyDefeated(e);
              this._killFlashT = 0.7;
              this._combatTextT = 0.65;
              this._shake(0.05, e.elite ? 2.8 : 1.9);
            }
            break;
          }
        }
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive !== false);
  }

  _onEnemyDefeated(enemy) {
    const st = this.hero.state || {};
    let goldBonus = enemy.elite ? 6 + enemy.tier * 2 : 0;

    if (enemy.campId != null) {
      this._setCampRespawnLock(enemy.campId, enemy.elite ? 10 : 0);
    }

    if (enemy.boss) {
      goldBonus += 40 + (enemy.tier || 1) * 6;
      this._msg(`Boss defeated • +${goldBonus} Gold`, 1.5);
      this._spawnHitSparks(enemy.x, enemy.y, "rgba(255,170,120,0.98)", 24, 260);
      this.hitStopT = Math.max(this.hitStopT, 0.06);
    } else if (enemy.elite) {
      st.eliteChainCount = (st.eliteChainT > 0 ? (st.eliteChainCount || 0) : 0) + 1;
      st.eliteChainT = 18;

      const chainGold = Math.max(0, st.eliteChainCount - 1) * 4;
      goldBonus += chainGold;

      if (chainGold > 0) {
        this._msg(`Elite chain x${st.eliteChainCount} • +${goldBonus} Gold`, 1.2);
      } else {
        this._msg(`Elite defeated • +${goldBonus} Gold`, 1.2);
      }

      this.progress.eliteKills = (this.progress.eliteKills || 0) + 1;
    }

    if (goldBonus > 0) this.hero.gold += goldBonus;

    const lootBonus = enemy.boss ? 4 : enemy.elite ? (enemy.lootBonus?.() || 2) : 0;
    this._dropLoot(enemy.x, enemy.y, enemy.tier || 1, lootBonus);

    const xpBase = enemy.xpValue?.() || 4;
    const xp = enemy.boss ? Math.round(xpBase * 2.5) : xpBase + Math.max(0, (st.eliteChainCount || 0) - 1);
    this.hero.giveXP?.(xp);

    this._onEnemyKilled(enemy);
  }

  _updateLoot(dt) {
    const nearR2 = this.perf.lootUpdateRadius * this.perf.lootUpdateRadius;

    for (const l of this.loot) {
      if (!l.alive) continue;

      const dx = l.x - this.hero.x;
      const dy = l.y - this.hero.y;
      if (dx * dx + dy * dy > nearR2) continue;

      l.update?.(dt, this.hero);

      if (!l.alive) {
        if (l.kind === "gold") {
          const amt = l.data?.amount || 5;
          this.hero.gold += amt;
          if (this._pickupMsgCooldown <= 0) {
            this._pickupMsgCooldown = 0.22;
            this._msg(`+${amt} Gold`, 0.6);
          }
        } else if (l.kind === "potion") {
          const t = l.data?.potionType || "hp";
          if (t === "mana") this.hero.potions.mana = (this.hero.potions.mana || 0) + 1;
          else this.hero.potions.hp = (this.hero.potions.hp || 0) + 1;

          if (this._pickupMsgCooldown <= 0) {
            this._pickupMsgCooldown = 0.3;
            this._msg(t === "mana" ? "Mana Potion" : "HP Potion", 0.8);
          }
        } else if (l.kind === "gear") {
          const gear = l.data;
          if (gear?.slot) {
            this._maybeAutoEquipLoot(gear);
          }
        }
      }
    }

    this.loot = this.loot.filter((l) => l.alive !== false);
  }

  _dropLoot(x, y, lvl, bonus = 0) {
    if (this.loot.length >= this.perf.maxLoot) return;

    const goldChance = Math.min(0.95, 0.72 + bonus * 0.08);
    const gearChance = Math.min(0.92, 0.18 + bonus * 0.18);
    const potionChance = Math.min(0.55, 0.09 + bonus * 0.08);

    if (Math.random() < goldChance) {
      this.loot.push(
        new Loot(x, y, "gold", {
          amount: 4 + Math.floor(Math.random() * 6) + (lvl | 0) + bonus * 3
        })
      );
    }

    if (Math.random() < gearChance && this.loot.length < this.perf.maxLoot) {
      let rarity = null;
      let slot = Math.random() < 0.62 ? "weapon" : "armor";

      if (bonus >= 2) {
        const r = Math.random();
        rarity = r < 0.18 ? "epic" : r < 0.60 ? "rare" : "uncommon";
        if (Math.random() < 0.25) {
          slot = Math.random() < 0.5 ? "ring" : "boots";
        }
      }

      this.loot.push(
        new Loot(x, y, "gear", makeGear(slot, lvl + bonus, rarity, hash2(x | 0, y | 0, lvl | 0, bonus | 0)))
      );
    }

    if (Math.random() < potionChance && this.loot.length < this.perf.maxLoot) {
      this.loot.push(new Loot(x, y, "potion", { potionType: Math.random() < 0.5 ? "hp" : "mana" }));
    }
  }

  _spawnWorldEnemies(dt) {
    if (this.enemies.length >= this.perf.maxEnemies) return;
    if (this.hero.state?.sailing) return;
    if (this.menu.open) return;
    if (this._spawnSuppressionT > 0) return;

    this._spawnTimer += dt;
    if (this._spawnTimer < 4.0) return;
    this._spawnTimer = 0;

    if (Math.random() > 0.22) return;

    const r = this.perf.spawnRadius;
    const a = Math.random() * Math.PI * 2;
    const x = this.hero.x + Math.cos(a) * r;
    const y = this.hero.y + Math.sin(a) * r;

    if (!this.world.canWalk(x, y)) return;
    if (this.world._isNearWater?.(x, y, 64)) return;
    if (dist2(x, y, this.hero.x, this.hero.y) < 700 * 700) return;

    let nearby = 0;
    for (const e of this.enemies) {
      if (dist2(x, y, e.x, e.y) < 320 * 320) nearby++;
      if (nearby >= 2) return;
    }

    const roll = Math.random();
    const kind =
      roll < 0.15 ? "brute" :
      roll < 0.35 ? "stalker" :
      roll < 0.47 ? "caster" :
      "blob";

    const elite = Math.random() < 0.08 + Math.min(0.08, this.hero.level * 0.003);

    const e = new Enemy(x, y, this.hero.level, kind, hash2(x | 0, y | 0, this.time | 0), elite);
    e.home = { x, y };
    e.campId = null;
    this.enemies.push(e);
  }

  _respawnCampEnemies(dt) {
    this._campRespawnT += dt;
    if (this._campRespawnT < this.perf.campRespawnCheckEvery) return;
    this._campRespawnT = 0;

    const camps = this.world?.camps || [];
    if (!camps.length) return;
    if (this.enemies.length >= this.perf.maxEnemies) return;
    if (this.hero.state?.sailing) return;
    if (this.dungeon.active) return;

    for (const camp of camps) {
      const tier = this._campTier(camp.id);
      const safeRadius = this._campSafeRadius(camp.id);

      if (!this._campRespawnUnlocked(camp.id)) continue;
      if (this._campShouldStayCalm(camp)) continue;

      let campCount = 0;
      let campEliteCount = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.campId === camp.id) {
          campCount++;
          if (e.elite) campEliteCount++;
        }
      }

      const desired =
        tier >= 4 ? 0 :
        tier >= 3 ? 0 :
        tier >= 2 ? 1 :
        2;

      if (campCount >= desired) continue;

      const missing = desired - campCount;
      for (let i = 0; i < missing; i++) {
        if (this.enemies.length >= this.perf.maxEnemies) break;

        const minR = safeRadius + 70;
        const ang = Math.random() * Math.PI * 2;
        const rr = minR + 40 + Math.random() * 80;
        const ex = camp.x + Math.cos(ang) * rr;
        const ey = camp.y + Math.sin(ang) * rr;

        if (!this.world.canWalk(ex, ey)) continue;
        if (this.world._isNearWater?.(ex, ey, 40)) continue;
        if (dist2(ex, ey, this.hero.x, this.hero.y) < 280 * 280) continue;

        const roll = Math.random();
        const kind =
          roll < 0.14 ? "brute" :
          roll < 0.34 ? "stalker" :
          roll < 0.46 ? "caster" :
          "blob";

        const eliteChance =
          tier >= 4 ? 0 :
          tier >= 3 ? 0.01 :
          tier >= 2 ? 0.02 :
          campEliteCount > 0 ? 0.01 : 0.08;

        const elite = Math.random() < eliteChance;

        const e = new Enemy(ex, ey, Math.max(1, this.hero.level), kind, hash2(ex | 0, ey | 0, camp.id | 0), elite);
        e.home = { x: camp.x, y: camp.y };
        e.campId = camp.id;
        this.enemies.push(e);
        if (elite) campEliteCount++;
      }

      if (missing > 0) {
        this._setCampRespawnLock(camp.id, tier >= 2 ? 8 : 4);
      }
    }
  }

  _applyCampSafeZones(dt) {
    void dt;
    if (this.dungeon.active) return;

    for (const camp of this.world?.camps || []) {
      const safeRadius = this._campSafeRadius(camp.id);
      const safeR2 = safeRadius * safeRadius;

      for (const e of this.enemies) {
        if (!e?.alive) continue;
        const d2 = dist2(e.x, e.y, camp.x, camp.y);
        if (d2 <= safeR2) {
          const dx = e.x - camp.x;
          const dy = e.y - camp.y;
          const n = norm(dx, dy);
          e.x += n.x * 10;
          e.y += n.y * 10;

          if (this._campTier(camp.id) >= 3 && d2 < (safeRadius - 28) * (safeRadius - 28)) {
            e.alive = false;
            e.dead = true;
          }
        }
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive !== false);
  }

  _applyEnemyTouchDamage(e) {
    if (!e?.alive) return;
    if (e.kind === "caster") return;

    const close = dist2(e.x, e.y, this.hero.x, this.hero.y) < (e.radius + 16) ** 2;
    if (!close) return;

    if (this._touchShakeCd <= 0) {
      this._touchShakeCd = 0.10;
      this._shake(0.03, 1.1);
    }

    if (this._touchDamageCd > 0) return;
    this._touchDamageCd = this.perf.touchDamageTick;

    let raw = (e.touchDps || 3) * this.perf.touchDamageTick;
    if (e.boss) raw *= 1.15;
    const dealt = this.hero.takeDamage?.(raw * this._currentIncomingDamageMult()) ?? Math.round(raw);
    this._spawnHitSparks(this.hero.x, this.hero.y, "rgba(255,110,110,0.88)", 5, 110);
    this._spawnFloatingText(this.hero.x, this.hero.y - 12, `${Math.round(dealt)}`, "rgba(255,160,160,0.95)", false);
    this.hitStopT = Math.max(this.hitStopT, 0.010);
  }

  _updateOverworldEnemies(dt) {
    const nearR2 = this.perf.enemyUpdateRadius * this.perf.enemyUpdateRadius;

    for (const e of this.enemies) {
      if (!e.alive) continue;

      const dx = e.x - this.hero.x;
      const dy = e.y - this.hero.y;
      if (dx * dx + dy * dy > nearR2) continue;

      e.update?.(dt, this.hero, this.world, this);
      this._applyEnemyTouchDamage(e);
    }

    this.enemies = this.enemies.filter((e) => e.alive !== false);
  }

  _updateDungeon(dt) {
    const room = this._getRoom();
    if (!room) return;

    const nearR2 = this.perf.enemyUpdateRadius * this.perf.enemyUpdateRadius;

    for (const e of this.enemies) {
      if (!e.alive) continue;

      const dx = e.x - this.hero.x;
      const dy = e.y - this.hero.y;
      if (dx * dx + dy * dy > nearR2) continue;

      e.update?.(dt, this.hero, null, this);
      this._applyEnemyTouchDamage(e);
    }

    if (room.boss) {
      this._updateBossEncounter(dt, room);
    }

    this.enemies = this.enemies.filter((e) => e.alive !== false);

    if (this.enemies.length === 0) {
      if (room.exits.next) {
        this._grantRoomClearRecovery();
        this._advanceDungeon();
      } else {
        this._completeDungeon();
      }
    }
  }

  _enterDungeon(dg) {
    if (this.dungeon.active) return;

    this.hero.state.sailing = false;
    this.dungeon.active = true;
    this.dungeon.floor = 1;
    this.dungeon.seed = hash2(dg.x | 0, dg.y | 0, this.seed | 0);
    this.dungeon.rooms = this._buildDungeon();
    this.dungeon.currentRoomIndex = 0;
    this.dungeon.visited = new Set([0]);
    this.dungeon.boss = null;
    this.dungeon.rewardTier = 0;

    const room = this._getRoom();
    this.hero.x = room.x;
    this.hero.y = room.y;
    this.hero.vx = 0;
    this.hero.vy = 0;

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this._spawnDungeonEnemies(room);
    this._msg("Entered Dungeon");
    this._shake(0.14, 4);
    this._spawnSuppressionT = 1.5;
    if (this.menu.open === "shop") this.menu.open = null;
  }

  _buildDungeon() {
    const rooms = [];
    const roomCount = 6;

    for (let i = 0; i < roomCount; i++) {
      const isBoss = i === roomCount - 1;
      const prev = i === 0 ? null : rooms[i - 1];

      const dir = i === 0 ? { x: 0, y: 0 } : (i % 2 === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 });

      const x = i === 0 ? 0 : prev.x + dir.x * 520;
      const y = i === 0 ? 0 : prev.y + dir.y * 360;

      rooms.push({
        id: i,
        x,
        y,
        w: isBoss ? 560 : 420,
        h: isBoss ? 360 : 260,
        boss: isBoss,
        exits: { next: i < roomCount - 1, prev: i > 0 }
      });
    }

    return rooms;
  }

  _getRoom() {
    return this.dungeon.rooms[this.dungeon.currentRoomIndex];
  }

  _spawnDungeonEnemies(room) {
    this.enemies = [];
    this.dungeon.boss = null;

    if (room.boss) {
      const boss = new Enemy(
        room.x,
        room.y - 12,
        this.hero.level + 3,
        "brute",
        hash2(room.id | 0, this.seed | 0, 991),
        true
      );
      boss.boss = true;
      boss.maxHp = Math.round(boss.maxHp * 1.7);
      boss.hp = boss.maxHp;
      boss.touchDps *= 1.2;
      boss.r += 5;
      boss.radius = boss.r;
      boss.home = { x: room.x, y: room.y };
      boss.campId = null;
      this.enemies.push(boss);

      this.dungeon.boss = {
        enemy: boss,
        phase: 1,
        phase2Triggered: false,
        burstCd: 2.4,
        burstTelegraphT: 0,
        burstTelegraphMax: 0.9,
        slamCd: 4.8,
        slamTelegraphT: 0,
        slamTelegraphMax: 0.75,
        summonCd: 6.0,
        summonCount: 0,
      };

      this._msg("Boss Chamber");
      return;
    }

    const count = 3 + Math.min(4, this.dungeon.floor);

    for (let i = 0; i < count; i++) {
      const ex = room.x + (Math.random() * (room.w - 120) - (room.w - 120) * 0.5);
      const ey = room.y + (Math.random() * (room.h - 120) - (room.h - 120) * 0.5);

      const roll = Math.random();
      const kind =
        roll < 0.18 ? "brute" :
        roll < 0.36 ? "stalker" :
        roll < 0.48 ? "caster" :
        "blob";

      const elite = Math.random() < 0.16 + Math.min(0.10, this.dungeon.floor * 0.02);
      const e = new Enemy(ex, ey, this.hero.level, kind, hash2(ex | 0, ey | 0, room.id | 0), elite);
      e.home = { x: ex, y: ey };
      e.campId = null;
      this.enemies.push(e);
    }
  }

  _updateBossEncounter(dt, room) {
    const bossState = this.dungeon.boss;
    const boss = bossState?.enemy;
    if (!boss || !boss.alive) return;

    const hpPct = boss.hp / Math.max(1, boss.maxHp);

    if (!bossState.phase2Triggered && hpPct <= 0.55) {
      bossState.phase2Triggered = true;
      bossState.phase = 2;
      boss.touchDps *= 1.18;
      boss.speed *= 1.08;
      this._summonBossAdds(3, room);
      this._spawnHitSparks(boss.x, boss.y, "rgba(255,170,120,0.96)", 18, 220);
      this._msg("Boss enraged!");
      this._shake(0.14, 4.6);
    }

    bossState.burstCd -= dt;
    bossState.slamCd -= dt;
    bossState.summonCd -= dt;

    if (bossState.burstTelegraphT > 0) {
      bossState.burstTelegraphT -= dt;
      if (bossState.burstTelegraphT <= 0) {
        this._bossRadialBurst(boss);
        bossState.burstCd = bossState.phase >= 2 ? 2.4 : 3.4;
      }
    } else if (bossState.burstCd <= 0) {
      bossState.burstTelegraphT = bossState.burstTelegraphMax;
      this._msg("Boss burst!");
    }

    if (bossState.slamTelegraphT > 0) {
      bossState.slamTelegraphT -= dt;
      if (bossState.slamTelegraphT <= 0) {
        this._bossSlam(boss);
        bossState.slamCd = bossState.phase >= 2 ? 4.4 : 5.8;
      }
    } else if (bossState.slamCd <= 0) {
      bossState.slamTelegraphT = bossState.slamTelegraphMax;
      this._msg("Boss slam!");
    }

    if (bossState.summonCd <= 0 && bossState.summonCount < (bossState.phase >= 2 ? 3 : 1)) {
      const addCount = bossState.phase >= 2 ? 2 : 1;
      this._summonBossAdds(addCount, room);
      bossState.summonCd = bossState.phase >= 2 ? 7.5 : 9.5;
      bossState.summonCount++;
    }
  }

  _bossRadialBurst(boss) {
    const bolts = 12;
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      this.projectiles.push(
        new Projectile(
          boss.x + dx * 16,
          boss.y + dy * 16,
          dx * 210,
          dy * 210,
          8 + boss.tier * 2,
          1.5,
          boss.tier,
          {
            color: "rgba(255,140,120,0.95)",
            radius: 5,
            type: "enemy_bolt",
            hitRadius: 18,
            onHitHero: true,
            friendly: false,
          }
        )
      );
    }

    this._spawnHitSparks(boss.x, boss.y, "rgba(255,150,120,0.96)", 16, 220);
    this._shake(0.08, 3.4);
  }

  _bossSlam(boss) {
    const dx = this.hero.x - boss.x;
    const dy = this.hero.y - boss.y;
    const n = norm(dx, dy);

    const leap = 52;
    boss.x += n.x * leap;
    boss.y += n.y * leap;

    const slamR2 = 80 * 80;
    if (dist2(boss.x, boss.y, this.hero.x, this.hero.y) < slamR2) {
      const raw = (14 + boss.tier * 2.5) * this._currentIncomingDamageMult();
      const dealt = this.hero.takeDamage?.(raw) ?? Math.round(raw);
      this._spawnFloatingText(this.hero.x, this.hero.y - 14, `${Math.round(dealt)}`, "rgba(255,170,150,0.98)", false);
      this._spawnHitSparks(this.hero.x, this.hero.y, "rgba(255,150,120,0.92)", 8, 160);
      this.hitStopT = Math.max(this.hitStopT, 0.018);
    }

    this._spawnHitSparks(boss.x, boss.y, "rgba(255,190,120,0.96)", 18, 240);
    this._shake(0.10, 4.0);
  }

  _summonBossAdds(count, room) {
    for (let i = 0; i < count; i++) {
      if (this.enemies.length >= this.perf.maxEnemies + 4) break;

      const a = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 56;
      const ex = room.x + Math.cos(a) * r;
      const ey = room.y + Math.sin(a) * r;

      const kindRoll = Math.random();
      const kind = kindRoll < 0.34 ? "stalker" : kindRoll < 0.68 ? "caster" : "blob";
      const elite = this.dungeon.boss?.phase >= 2 && Math.random() < 0.22;

      const e = new Enemy(ex, ey, this.hero.level + 1, kind, hash2(ex | 0, ey | 0, room.id | 0, this.time | 0), elite);
      e.home = { x: room.x, y: room.y };
      e.campId = null;
      this.enemies.push(e);
    }

    this._msg("Boss summons reinforcements");
    this._shake(0.06, 2.8);
  }

  _advanceDungeon() {
    this.dungeon.currentRoomIndex++;
    this.dungeon.floor = Math.max(this.dungeon.floor, this.dungeon.currentRoomIndex + 1);

    const room = this._getRoom();
    if (!room) return;

    this.hero.x = room.x;
    this.hero.y = room.y;
    this.hero.vx = 0;
    this.hero.vy = 0;

    this._spawnDungeonEnemies(room);
    this._msg(room.boss ? "Final Chamber" : "Deeper...");
    this._shake(0.08, 3);
  }

  _grantDungeonChestReward() {
    const floor = this.dungeon.floor || 1;
    const rarityRoll = Math.random();

    const rarity =
      floor >= 6 && rarityRoll > 0.80 ? "epic" :
      floor >= 4 && rarityRoll > 0.50 ? "rare" :
      rarityRoll > 0.35 ? "uncommon" :
      "common";

    const slotRoll = Math.random();
    const slot =
      slotRoll < 0.40 ? "weapon" :
      slotRoll < 0.68 ? "armor" :
      slotRoll < 0.84 ? "ring" :
      "boots";

    const gear = makeGear(
      slot,
      this.hero.level + Math.max(1, Math.floor(floor * 0.75)),
      rarity,
      hash2(this.seed | 0, this.hero.level | 0, floor | 0, this.time | 0)
    );

    const bonusGold = 20 + floor * 8 + (this.dungeon.boss?.phase2Triggered ? 14 : 0);
    this.hero.gold += bonusGold;

    this.hero.potions.hp = (this.hero.potions.hp || 0) + 1;
    if (Math.random() < 0.8) this.hero.potions.mana = (this.hero.potions.mana || 0) + 1;

    this._maybeAutoEquipLoot(gear);
    this._msg(`Boss chest: ${gear.name} • +${bonusGold} Gold`, 1.6);
  }

  _completeDungeon() {
    this._msg("Dungeon Cleared!");
    this.hero.gold += 40 + this.dungeon.floor * 10;
    this.hero.giveXP?.(25 + this.dungeon.floor * 10);

    this.progress.dungeonBest = Math.max(this.progress.dungeonBest || 0, this.dungeon.floor);

    this._grantDungeonChestReward();
    this._grantDungeonMomentum();

    this.dungeon.active = false;
    this.dungeon.boss = null;

    const dg = this.world?.dungeons?.[0];
    if (dg) {
      this.hero.x = dg.x;
      this.hero.y = dg.y + 60;
      this.hero.vx = 0;
      this.hero.vy = 0;
    }

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this._shake(0.14, 4);
    this._saveSoon();
    this._spawnSuppressionT = 2.0;
  }

  _moveHeroDungeon(nx, ny) {
    const room = this._getRoom();
    if (!room) return;

    const halfW = room.w * 0.5 - 12;
    const halfH = room.h * 0.5 - 12;

    this.hero.x = clamp(nx, room.x - halfW, room.x + halfW);
    this.hero.y = clamp(ny, room.y - halfH, room.y + halfH);
  }

  _autoCloseShopIfNeeded() {
    if (this.menu.open !== "shop") return;
    if (this.dungeon.active) {
      this.menu.open = null;
      return;
    }
    if (!this._cachedNearbyCamp) {
      this.menu.open = null;
    }
  }

  _updateNearbyPOIs(dt) {
    this._nearbyPoiTimer -= dt;
    if (this._nearbyPoiTimer > 0) return;
    this._nearbyPoiTimer = 0.18;

    const hx = this.hero.x;
    const hy = this.hero.y;

    this._cachedNearbyCamp = null;
    this._cachedNearbyDock = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyDungeon = null;

    let bestCampD2 = 110 * 110;
    for (const c of this.world?.camps || []) {
      const d2 = dist2(hx, hy, c.x, c.y);
      if (d2 < bestCampD2) {
        bestCampD2 = d2;
        this._cachedNearbyCamp = c;
      }
    }

    let bestDockD2 = 110 * 110;
    for (const d of this.world?.docks || []) {
      const d2 = dist2(hx, hy, d.x, d.y);
      if (d2 < bestDockD2) {
        bestDockD2 = d2;
        this._cachedNearbyDock = d;
      }
    }

    let bestWayD2 = 100 * 100;
    for (const w of this.world?.waystones || []) {
      const d2 = dist2(hx, hy, w.x, w.y);
      if (d2 < bestWayD2) {
        bestWayD2 = d2;
        this._cachedNearbyWaystone = w;
      }
    }

    let bestDungeonD2 = 100 * 100;
    for (const dg of this.world?.dungeons || []) {
      const d2 = dist2(hx, hy, dg.x, dg.y);
      if (d2 < bestDungeonD2) {
        bestDungeonD2 = d2;
        this._cachedNearbyDungeon = dg;
      }
    }
  }

  _activeCampQuests(campId) {
    return (this.quests || []).filter((q) => q.campId === campId && !q.turnedIn);
  }

  _campQuestCapacity(campId) {
    const tier = this._campTier(campId);
    return tier >= 4 ? 4 : tier >= 3 ? 3 : tier >= 2 ? 3 : 2;
  }

  _campRestBonus(campId) {
    const tier = this._campTier(campId);
    return this.progress?.campRestBonusClaimed?.[campId] === true || tier < 2;
  }

  _grantCampRestSupplies(campId) {
    const tier = this._campTier(campId);
    if (tier < 2) return;
    if (this.progress?.campRestBonusClaimed?.[campId]) return;

    if (!this.progress.campRestBonusClaimed) this.progress.campRestBonusClaimed = {};
    this.progress.campRestBonusClaimed[campId] = true;

    this.hero.potions.hp = (this.hero.potions.hp || 0) + 1;
    if (tier >= 3) this.hero.potions.mana = (this.hero.potions.mana || 0) + 1;

    if (tier >= 4 && Math.random() < 0.45) {
      const slot = Math.random() < 0.5 ? "ring" : "boots";
      const gear = makeGear(slot, this.hero.level + 1, "uncommon", hash2(campId | 0, this.time | 0, this.seed | 0));
      this.hero.inventory.push(gear);
      this._msg(`${this._campTierName(campId)} stores • received ${gear.name}`, 1.5);
      return;
    }

    this._msg(`${this._campTierName(campId)} stores replenished`, 1.2);
  }

  _interact() {
    if (this.hero.state?.sailing) {
      const dock = this._cachedNearbyDock || this._nearestDock(100);
      if (dock) {
        this.progress.discoveredDocks?.add?.(dock.id);
        this._msg("Dock discovered", 1.2);
        this._saveSoon();
      }
      return;
    }

    const camp = this._cachedNearbyCamp || this._nearestCamp(110);
    if (camp) {
      this._interactCamp(camp);
      return;
    }

    const waystone = this._cachedNearbyWaystone;
    if (waystone) {
      this.progress.discoveredWaystones?.add?.(waystone.id);
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this._msg(`Waystone ${waystone.id} awakened • Restored`);
      this._saveSoon();
      return;
    }

    const dock = this._cachedNearbyDock;
    if (dock) {
      this.progress.discoveredDocks?.add?.(dock.id);
      this._msg("Dock discovered", 1.2);
      this._saveSoon();
      return;
    }

    const dungeon = this._cachedNearbyDungeon;
    if (dungeon) {
      this._enterDungeon(dungeon);
    }
  }

  _interactCamp(camp) {
    this.progress.visitedCamps?.add?.(camp.id);
    this._setCampRespawnLock(camp.id, 10);

    const renown = this._campRenown(camp.id);
    const tier = this._campTier(camp.id);
    const tierName = this._campTierName(camp.id);
    const active = this._activeCampQuests(camp.id);
    const completed = active.find((q) => q.done);

    const healPct = tier >= 4 ? 1.0 : tier >= 3 ? 0.85 : tier >= 2 ? 0.65 : 0.35;
    const manaPct = tier >= 4 ? 1.0 : tier >= 3 ? 0.90 : tier >= 2 ? 0.70 : 0.35;

    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * healPct));
    this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + Math.round(this.hero.maxMana * manaPct));

    if (completed) {
      completed.turnedIn = true;

      const rewardMult = this._campQuestRewardMultiplier(camp.id);
      const rewardGold = Math.round((completed.rewardGold || 0) * rewardMult);
      const rewardXp = Math.round((completed.rewardXp || 0) * rewardMult);

      this.hero.gold += rewardGold;
      this.hero.giveXP?.(rewardXp);

      const renownGain = completed.eliteOnly ? 2 : 1;
      this.progress.campRenown[camp.id] = renown + renownGain;
      if (this.progress.campRestBonusClaimed) this.progress.campRestBonusClaimed[camp.id] = false;
      this.questTurnIn = { id: completed.id, name: completed.name };

      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;

      this._grantCampBlessing(camp.id, true);
      this._grantCampRestSupplies(camp.id);
      this._setCampRespawnLock(camp.id, 16);

      if (tier >= 3 && Math.random() < 0.30) {
        const bonusGold = 10 + tier * 4;
        this.hero.gold += bonusGold;
        this._msg(`${tierName} reward cache • +${bonusGold} Gold`, 1.3);
      } else {
        this._msg(`Quest complete: +${rewardGold} Gold +${rewardXp} XP`, 1.8);
      }

      this._refreshShopForCamp(camp);
      this._saveSoon();
      return;
    }

    const currentActive = this._activeCampQuests(camp.id);
    const capacity = this._campQuestCapacity(camp.id);

    if (currentActive.length < capacity) {
      const quest = this._createCampQuest(camp);
      this.quests.push(quest);
      this._msg(`New quest: ${quest.name}`, 1.6);
      this._saveSoon();
      return;
    }

    this._grantCampBlessing(camp.id, false);
    this._grantCampRestSupplies(camp.id);

    const first = currentActive[0];
    if (first) {
      this._msg(`${camp.name || `Camp ${camp.id}`} • ${tierName} • ${first.have}/${first.need} ${first.target}`, 1.5);
    } else {
      this._msg(`${camp.name || `Camp ${camp.id}`} • ${tierName}`, 1.2);
    }
  }

  _handleFastTravelInput() {
    if (this.menu.open !== "map") return;
    if (this.dungeon.active) return;
    if (this.hero.state?.sailing) return;

    if (this.input.wasPressed("z")) {
      this.world?.toggleMapScale?.();
      this._msg(`Map zoom: ${this.world?.mapMode || "small"}`, 1.0);
    }

    const ways = [...(this.world?.waystones || [])].filter((w) =>
      this.progress?.discoveredWaystones?.has?.(w.id)
    );

    const digitPressed =
      this.input.wasPressed("1") ? 1 :
      this.input.wasPressed("2") ? 2 :
      this.input.wasPressed("3") ? 3 :
      this.input.wasPressed("4") ? 4 :
      this.input.wasPressed("5") ? 5 :
      this.input.wasPressed("6") ? 6 :
      this.input.wasPressed("7") ? 7 :
      this.input.wasPressed("8") ? 8 :
      this.input.wasPressed("9") ? 9 :
      0;

    if (digitPressed > 0) {
      const w = ways[digitPressed - 1];
      if (!w) return;

      const safe =
        this.world?._findSafeLandPatchNear?.(w.x, w.y, 90) ||
        this.world?._findNearbyLand?.(w.x, w.y, 120, false, true) ||
        { x: w.x, y: w.y + 42 };

      this.hero.x = safe.x;
      this.hero.y = safe.y;
      this.hero.vx = 0;
      this.hero.vy = 0;
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this._msg(`Waystone ${w.id} • Restored`, 1.2);
      this._shake(0.06, 2.2);
      this._saveSoon();
    }
  }

  _updateZoneMessages(dt) {
    if (this.dungeon.active) {
      this.zoneMsg = this.dungeon.boss?.enemy?.alive ? `Boss Floor ${this.dungeon.floor}` : `Dungeon Floor ${this.dungeon.floor}`;
      this.zoneMsgT = 1.5;
      return;
    }

    if (this._cachedNearbyDungeon) {
      this.zoneMsg = "Dungeon Entrance";
      this.zoneMsgT = 1.0;
      return;
    }

    if (this._cachedNearbyDock) {
      this.zoneMsg = "Dock";
      this.zoneMsgT = 1.0;
      return;
    }

    if (this._cachedNearbyCamp) {
      this.zoneMsg = `${this._cachedNearbyCamp.name || "Camp"} • ${this._campTierName(this._cachedNearbyCamp.id)}`;
      this.zoneMsgT = 1.0;
      return;
    }

    this._zoneSampleT -= dt;
    if (this._zoneSampleT <= 0) {
      this._zoneSampleT = 0.55;
      const z = this.world?.getZoneName?.(this.hero.x, this.hero.y) || "";
      if (z && z !== this._lastZoneName) {
        this._lastZoneName = z;
        this.zoneMsg = z;
        this.zoneMsgT = 1.0;
      }
    }
  }

  _updateMouseWorld() {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.worldX = (this.mouse.x - rect.left - this.w * 0.5) / this.camera.zoom + this.camera.x;
    this.mouse.worldY = (this.mouse.y - rect.top - this.h * 0.5) / this.camera.zoom + this.camera.y;
  }

  _bindMouse() {
    if (!this.canvas) return;

    this.canvas.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = true;
    });

    this.canvas.addEventListener("mousedown", () => {
      this.mouse.down = true;
    });

    this.canvas.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.mouse.down = false;
    });
  }

  _nudgeToLand() {
    const safe =
      this.world?._findSafeLandPatchNear?.(this.hero.x, this.hero.y, 300) ||
      this.world?._findNearbyLand?.(this.hero.x, this.hero.y, 300, false, true);

    if (safe) {
      this.hero.x = safe.x;
      this.hero.y = safe.y;
      this.hero.vx = 0;
      this.hero.vy = 0;
    }
  }

  _ensureHeroSafe() {
    if (this.dungeon.active) return;
    if (this.hero.state?.sailing) return;
    if (this.world?.canWalk?.(this.hero.x, this.hero.y)) return;
    this._nudgeToLand();
  }

  _cleanupFarEntities() {
    const farEnemyR2 = (this.perf.enemyUpdateRadius * 1.75) ** 2;
    const farProjR2 = (this.perf.projectileUpdateRadius * 1.4) ** 2;
    const farLootR2 = (this.perf.lootUpdateRadius * 1.6) ** 2;

    this.enemies = this.enemies.filter((e) => {
      if (!e.alive) return false;
      const dx = e.x - this.hero.x;
      const dy = e.y - this.hero.y;
      return dx * dx + dy * dy < farEnemyR2;
    });

    this.projectiles = this.projectiles.filter((p) => {
      if (!p.alive) return false;
      const dx = p.x - this.hero.x;
      const dy = p.y - this.hero.y;
      return dx * dx + dy * dy < farProjR2;
    });

    this.loot = this.loot.filter((l) => {
      if (!l.alive) return false;
      const dx = l.x - this.hero.x;
      const dy = l.y - this.hero.y;
      return dx * dx + dy * dy < farLootR2;
    });

    this.hitSparks = this.hitSparks.filter((s) => {
      const dx = s.x - this.hero.x;
      const dy = s.y - this.hero.y;
      return dx * dx + dy * dy < farProjR2;
    });

    this.floatingTexts = this.floatingTexts.filter((f) => {
      const dx = f.x - this.hero.x;
      const dy = f.y - this.hero.y;
      return dx * dx + dy * dy < farProjR2;
    });
  }

  _shake(t, mag) {
    this.camera.shakeT = t;
    this.camera.shakeMag = mag;
  }

  _msg(text, t = 1.4) {
    this.msg = text;
    this.msgT = t;
    this.ui?.setMsg?.(text, t);
  }

  _spellMsg(text, t = 1.0) {
    if (this._spellMsgCooldown > 0) return;
    this._spellMsgCooldown = 0.3;
    this._msg(text, t);
  }

  _saveSoon() {
    this._autosaveT = Math.min(this._autosaveT, 1.0);
  }

  _checkLevelUpMessage() {
    if ((this.hero.level || 1) > this._levelSeen) {
      this._levelSeen = this.hero.level;
      this._msg(`Level Up! ${this.hero.level}`, 1.6);
      if (this.shop.campId) {
        const fakeCamp = { id: this.shop.campId };
        this._refreshShopForCamp(fakeCamp);
      }
    }
  }

  _ensureCampQuests() {
    const camps = this.world?.camps || [];
    for (const camp of camps) {
      const existing = this._activeCampQuests(camp.id);
      const cap = this._campQuestCapacity(camp.id);
      while (existing.length < 1 && this.progress?.visitedCamps?.has?.(camp.id) && existing.length < cap) {
        const q = this._createCampQuest(camp);
        this.quests.push(q);
        existing.push(q);
      }
    }
  }

  _createCampQuest(camp) {
    const types = ["blob", "stalker", "caster"];
    const target = types[Math.floor(Math.random() * types.length)];
    const tier = this._campTier(camp.id);
    const eliteQuest = this.hero.level >= 4 && Math.random() < (tier >= 3 ? 0.38 : 0.28);
    const need = eliteQuest
      ? 1 + Math.floor(Math.random() * (tier >= 3 ? 3 : 2))
      : 3 + Math.floor(Math.random() * (tier >= 4 ? 4 : 3));

    const mult = this._campQuestRewardMultiplier(camp.id);
    const rewardGold = Math.round(((eliteQuest ? 34 : 18) + need * (eliteQuest ? 12 : 6) + this.hero.level * 2) * mult);
    const rewardXp = Math.round(((eliteQuest ? 28 : 14) + need * (eliteQuest ? 10 : 5) + this.hero.level * 2) * mult);

    return {
      id: this._questIdCounter++,
      type: "kill",
      campId: camp.id,
      eliteOnly: eliteQuest,
      name: eliteQuest
        ? `${camp.name || `Camp ${camp.id}`}: Elite ${target} bounty`
        : `${camp.name || `Camp ${camp.id}`}: Hunt ${target}s`,
      desc: eliteQuest
        ? `Defeat ${need} elite ${target}${need > 1 ? "s" : ""} near ${camp.name || `Camp ${camp.id}`}.`
        : `Defeat ${need} ${target}${need > 1 ? "s" : ""} near ${camp.name || `Camp ${camp.id}`}.`,
      target,
      need,
      have: 0,
      done: false,
      turnedIn: false,
      rewardGold,
      rewardXp,
    };
  }

  _onEnemyKilled(enemy) {
    for (const q of this.quests) {
      if (q.turnedIn || q.done) continue;
      if (q.type !== "kill") continue;
      if (q.target !== enemy.kind) continue;
      if (q.eliteOnly && !enemy.elite) continue;

      q.have = Math.min(q.need, (q.have || 0) + 1);
      if (q.have >= q.need) {
        q.done = true;
        this._msg(`Quest ready: ${q.name}`, 1.4);
      }
    }
  }

  _updateQuestState() {
    for (const q of this.quests) {
      if (!q.turnedIn && !q.done && q.have >= q.need) {
        q.done = true;
      }
    }

    this.quests = this.quests.slice(-16);
  }

  _saveGame() {
    this.save.save?.({
      seed: this.seed,
      hero: this.hero,
      progress: {
        ...this.progress,
        discoveredWaystones: [...(this.progress?.discoveredWaystones || [])],
        discoveredDocks: [...(this.progress?.discoveredDocks || [])],
        visitedCamps: [...(this.progress?.visitedCamps || [])],
      },
      dungeon: {
        active: this.dungeon.active,
        floor: this.dungeon.floor,
        seed: this.dungeon.seed,
        currentRoomIndex: this.dungeon.currentRoomIndex,
        visited: [...(this.dungeon.visited || [])],
      },
      cooldowns: this.cooldowns,
      skillLoadout: this.skillLoadout,
      selectedSkillSlot: this.selectedSkillSlot,
      quests: this.quests,
      questTurnIn: this.questTurnIn,
      menu: this.menu,
      time: this.time,
      msg: this.msg,
      msgT: this.msgT,
      zoneMsg: this.zoneMsg,
      zoneMsgT: this.zoneMsgT,
      campRespawnState: this._campRespawnState,
      worldMapMode: this.world?.mapMode || "small",
    });
  }

  _loadGame() {
    const data = this.save.load?.();
    if (!data) return;

    if (typeof data.seed === "number" && Number.isFinite(data.seed)) {
      this.seed = data.seed | 0;
    }

    if (data.hero) Object.assign(this.hero, data.hero);

    if (data.progress) {
      this.progress = {
        ...this.progress,
        ...data.progress,
        discoveredWaystones: new Set(data.progress.discoveredWaystones || []),
        discoveredDocks: new Set(data.progress.discoveredDocks || []),
        visitedCamps: new Set(data.progress.visitedCamps || []),
        campRenown: data.progress.campRenown || {},
        campRestBonusClaimed: data.progress.campRestBonusClaimed || {},
      };
    }

    if (data.cooldowns) this.cooldowns = { ...this.cooldowns, ...data.cooldowns };
    if (Array.isArray(data.skillLoadout) && data.skillLoadout.length) {
      this.skillLoadout = data.skillLoadout.slice(0, 4);
    }
    if (typeof data.selectedSkillSlot === "number") {
      this.selectedSkillSlot = clamp(data.selectedSkillSlot | 0, 0, 3);
    }

    if (Array.isArray(data.quests)) {
      this.quests = data.quests.map((q) => ({ ...q }));
      this._questIdCounter = this.quests.reduce((m, q) => Math.max(m, q.id || 0), 0) + 1;
    }

    if (data.questTurnIn) {
      this.questTurnIn = { ...data.questTurnIn };
    }

    if (data.campRespawnState && typeof data.campRespawnState === "object") {
      this._campRespawnState = { ...data.campRespawnState };
    }

    if (typeof data.worldMapMode === "string") {
      this.world.mapMode = data.worldMapMode === "large" ? "large" : "small";
    } else {
      this.world.mapMode = "small";
    }

    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.sailing = false;
  }

  _ensureWorldPopulation() {
    if (this.enemies.length > 0) return;

    const camps = this.world?.camps || [];
    for (const camp of camps) {
      const tier = this._campTier(camp.id);
      const starterCount = tier >= 3 ? 0 : tier >= 2 ? 1 : 2;

      for (let i = 0; i < starterCount; i++) {
        const a = (i / Math.max(1, starterCount)) * Math.PI * 2 + (camp.id || 0) * 0.33;
        const safe = this._campSafeRadius(camp.id);
        const ring = safe + 86;
        const ex = camp.x + Math.cos(a) * ring;
        const ey = camp.y + Math.sin(a) * ring;

        if (!this.world?.canWalk?.(ex, ey)) continue;
        if (this.world?._isNearWater?.(ex, ey, 48)) continue;

        const kind = i === 0 ? "blob" : "stalker";
        const elite = false;
        const e = new Enemy(
          ex,
          ey,
          Math.max(1, this.hero.level),
          kind,
          hash2(ex | 0, ey | 0, camp.id | 0),
          elite
        );
        e.home = { x: camp.x, y: camp.y };
        e.campId = camp.id;
        this.enemies.push(e);
        if (this.enemies.length >= 10) return;
      }

      this._setCampRespawnLock(camp.id, 12);
    }
  }

  _nearestDock(radius = 100) {
    const docks = this.world?.docks || [];
    let best = null;
    let bestD2 = radius * radius;

    for (const d of docks) {
      const dd = dist2(this.hero.x, this.hero.y, d.x, d.y);
      if (dd < bestD2) {
        bestD2 = dd;
        best = d;
      }
    }

    return best;
  }

  _nearestCamp(radius = 120) {
    const camps = this.world?.camps || [];
    let best = null;
    let bestD2 = radius * radius;

    for (const c of camps) {
      const dd = dist2(this.hero.x, this.hero.y, c.x, c.y);
      if (dd < bestD2) {
        bestD2 = dd;
        best = c;
      }
    }

    return best;
  }

  _toggleDockingOrSailing() {
    if (this.dungeon.active) {
      this._msg("Cannot sail in dungeon");
      return;
    }

    const dock = this._cachedNearbyDock || this._nearestDock(104);
    if (!dock) {
      this._msg("No dock nearby");
      return;
    }

    if (!this.hero.state.sailing) {
      const nearWater =
        this.world.isWater(dock.x + 24, dock.y) ||
        this.world.isWater(dock.x - 24, dock.y) ||
        this.world.isWater(dock.x, dock.y + 24) ||
        this.world.isWater(dock.x, dock.y - 24);

      if (!nearWater) {
        this._msg("Dock is blocked");
        return;
      }

      this.hero.state.sailing = true;
      this.hero.x = dock.x;
      this.hero.y = dock.y;
      this.hero.vx = 0;
      this.hero.vy = 0;
      this._msg("Sailing");
      return;
    }

    this.hero.state.sailing = false;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this._nudgeToLand();
    this._msg("Docked");
  }
}