// src/game.js
// v97.0 DRAGON TERRITORY PASS + ENCOUNTER WARNINGS (FULL FILE)

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
    this.save = new Save("broke-knight-save-v97-0");

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
      spawnRadius: 1040,
      drawPad: 150,

      maxEnemies: 58,
      maxLoot: 90,

      cleanupTimer: 0,
      cleanupEvery: 0.55,
      touchDamageTick: 0.18,
      campRespawnCheckEvery: 8.5,
      campAggroRadius: 340,

      discoverableLocalCap: 10,
      discoverableWideCap: 18,
      unknownLocalCap: 13,
      unknownWideCap: 23,
      spawnMinDistance: 460,
      spawnMaxDistance: 1100,
    };

    this.time = 0;
    this._dtClamp = 0.05;
    this._autosaveT = 8;

    this._spawnTimer = 0;
    this._campRespawnT = 0;
    this._unknownBossSpawnT = 0;
    this._dragonCheckT = 0;
    this._dragonTerritoryT = 0;
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

    this._dragonWarned = {
      NW: false,
      NE: false,
      SW: false,
      SE: false,
    };

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
    if (!this.hero.aimDir) this.hero.aimDir = { x: 1, y: 0 };
    if (!this.hero.state) this.hero.state = {};
    if (typeof this.hero.state.sailing !== "boolean") this.hero.state.sailing = false;
    if (typeof this.hero.state.dashT !== "number") this.hero.state.dashT = 0;
    if (typeof this.hero.state.hurtT !== "number") this.hero.state.hurtT = 0;
    if (typeof this.hero.state.campBuffT !== "number") this.hero.state.campBuffT = 0;
    if (typeof this.hero.state.campBuffPower !== "number") this.hero.state.campBuffPower = 0;
    if (typeof this.hero.state.campBuffType !== "string") this.hero.state.campBuffType = "";
    if (typeof this.hero.state.campBuffName !== "string") this.hero.state.campBuffName = "";
    if (typeof this.hero.state.dungeonMomentumT !== "number") this.hero.state.dungeonMomentumT = 0;
    if (typeof this.hero.state.dungeonMomentumPower !== "number") this.hero.state.dungeonMomentumPower = 0;
    if (typeof this.hero.state.eliteChainT !== "number") this.hero.state.eliteChainT = 0;
    if (typeof this.hero.state.eliteChainCount !== "number") this.hero.state.eliteChainCount = 0;
    if (typeof this.hero.state.slowT !== "number") this.hero.state.slowT = 0;
    if (typeof this.hero.state.poisonT !== "number") this.hero.state.poisonT = 0;

    this._ensureWorldPopulation();
    this._ensureCampQuests();
    this._ensureHeroSafe();
    this._ensureCornerDragons();

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
    this._updateHeroAimFromMouse();

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

    if (!this.dungeon.active) {
      this.world.update?.(dt, this.hero);
    }

    if (this.dungeon.active) {
      this._updateDungeon(dt);
    } else {
      this._spawnWorldEnemies(dt);
      this._spawnUnknownBorderBosses(dt);
      this._respawnCampEnemies(dt);
      this._updateOverworldEnemies(dt);
      this._updateDragons(dt);
      this._updateDragonTerritories(dt);
      this._updateVariantAbilities(dt);
      this._applyCampSafeZones(dt);
      this._ensureCornerDragonsPeriodic(dt);
      this._checkDragonWarnings();
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
    this._drawDragonTerritoryRings(ctx, vb);
    this._drawFxWorld(ctx, vb);
    this._drawEnemyOverlays(ctx, vb);
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

    if (st.campBuffT > 0) {
      const p = Math.max(0, st.campBuffPower || 0);

      if (st.campBuffType === "river") {
        this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + dt * (1.2 + p * 0.28));
      } else if (st.campBuffType === "oak") {
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + dt * (0.55 + p * 0.10));
      }
    }

    if (st.campBuffT <= 0) {
      st.campBuffPower = 0;
      st.campBuffType = "";
      st.campBuffName = "";
    }

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
      ctx.fillStyle = f.color || "#ffffff";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  _enemyVariantLabel(e) {
    if (e.dragonBoss) return "Dragon";
    if (e.cornerDragon) return "Corner Dragon";
    if (e.boss) return "Boss";

    switch (e.variant) {
      case "berserker": return "Berserker";
      case "tank": return "Tank";
      case "skirmisher": return "Skirmisher";
      case "sniper": return "Sniper";
      case "volatile": return "Volatile";
      case "frost": return "Frost";
      case "venom": return "Venom";
      case "firelord": return "Firelord";
      default:
        if (e.elite) return "Elite";
        return "";
    }
  }

  _enemyLabelColor(e) {
    if (e.dragonBoss) return "#ffb45e";
    if (e.boss) return "#ff9b8a";

    switch (e.variant) {
      case "berserker": return "#ff9e9e";
      case "tank": return "#d7d7d7";
      case "skirmisher": return "#9ef5c7";
      case "sniper": return "#bfe8ff";
      case "volatile": return "#ff98c1";
      case "frost": return "#bfe7ff";
      case "venom": return "#b6f08a";
      default:
        if (e.elite) return "#ffe08a";
        return "#ffffff";
    }
  }

  _drawEnemyOverlays(ctx, vb) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 11px Arial";

    for (const e of this.enemies) {
      if (!e?.alive) continue;
      if (!this._inView(e.x, e.y, vb)) continue;

      const hp = e.hp ?? 0;
      const maxHp = Math.max(1, e.maxHp ?? hp ?? 1);
      const hpP = clamp(hp / maxHp, 0, 1);

      const label = this._enemyVariantLabel(e);
      const barW = e.dragonBoss ? 60 : e.boss ? 46 : (e.elite || e.variant ? 34 : 0);

      const baseY = e.y - (e.radius || 12) - 18;

      if (barW > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(e.x - barW / 2, baseY, barW, 5);

        let hpColor = "rgba(125,220,120,0.95)";
        if (e.dragonBoss) hpColor = "rgba(255,146,76,0.96)";
        else if (e.boss) hpColor = "rgba(255,118,118,0.96)";
        else if (e.variant === "tank") hpColor = "rgba(210,210,210,0.95)";
        else if (e.variant === "frost") hpColor = "rgba(162,220,255,0.96)";
        else if (e.variant === "venom") hpColor = "rgba(170,235,100,0.96)";
        else if (e.variant === "volatile") hpColor = "rgba(255,132,180,0.96)";

        ctx.fillStyle = hpColor;
        ctx.fillRect(e.x - barW / 2, baseY, barW * hpP, 5);

        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x - barW / 2, baseY, barW, 5);
      }

      if (label) {
        ctx.fillStyle = this._enemyLabelColor(e);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 3;
        ctx.strokeText(label, e.x, baseY - 4);
        ctx.fillText(label, e.x, baseY - 4);
      }

      if (e.dragonBoss) {
        ctx.font = "bold 10px Arial";
        ctx.fillStyle = "rgba(255,220,190,0.95)";
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 3;
        const corner = e.cornerTag ? ` ${e.cornerTag}` : "";
        ctx.strokeText(`Lv ${e.level}${corner}`, e.x, baseY - 16);
        ctx.fillText(`Lv ${e.level}${corner}`, e.x, baseY - 16);
        ctx.font = "bold 11px Arial";
      }
    }

    ctx.restore();
  }

  _drawBossTelegraphWorld(ctx, vb) {
    for (const e of this.enemies) {
      if (!e?.alive) continue;
      if (!this._inView(e.x, e.y, vb)) continue;

      if (e.dragonBoss) {
        if ((e.fireSprayCd || 0) < 0.6) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,140,70,0.28)";
          ctx.lineWidth = 4;

          const dir = norm(this.hero.x - e.x, this.hero.y - e.y);
          const baseA = Math.atan2(dir.y, dir.x);
          const spread = 0.7;
          const len = 170;

          for (let i = -2; i <= 2; i++) {
            const a = baseA + (i / 2) * (spread / 2);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x + Math.cos(a) * len, e.y + Math.sin(a) * len);
            ctx.stroke();
          }
          ctx.restore();
        }

        if ((e.fireNovaCd || 0) < 0.55) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,180,90,0.24)";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 96, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (e.variant === "volatile" && (e.variantBurstCd || 99) < 0.5) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,110,140,0.22)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawDragonTerritoryRings(ctx, vb) {
    for (const e of this.enemies) {
      if (!e?.alive || !e.dragonBoss || !e.home) continue;
      if (!this._inView(e.home.x, e.home.y, vb)) continue;

      ctx.save();
      ctx.strokeStyle = "rgba(255,120,60,0.12)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(e.home.x, e.home.y, e.leashRadius || 720, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,180,100,0.09)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.home.x, e.home.y, Math.max(120, (e.leashRadius || 720) - 110), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawDungeonWorld(ctx) {
    ctx.save();
    ctx.fillStyle = "#16141b";
    ctx.fillRect(this.camera.x - 700, this.camera.y - 500, 1400, 1000);
    ctx.restore();
  }

  _drawDungeonOverlayWorld(ctx) {
    void ctx;
  }

  _bindMouse() {
    const rectPoint = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (this.canvas.width / Math.max(1, r.width)),
        y: (e.clientY - r.top) * (this.canvas.height / Math.max(1, r.height)),
      };
    };

    this.canvas.addEventListener("mousemove", (e) => {
      const p = rectPoint(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.moved = true;
    });

    this.canvas.addEventListener("mousedown", (e) => {
      const p = rectPoint(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.down = true;
      this.mouse.moved = true;
    });

    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.mouse.down = false;
    });
  }

  _updateMouseWorld() {
    const z = this.camera.zoom || 1;
    const sx = (this.mouse.x - this.w * 0.5) / z;
    const sy = (this.mouse.y - this.h * 0.5) / z;
    this.mouse.worldX = this.camera.x + sx;
    this.mouse.worldY = this.camera.y + sy;
  }

  _updateHeroAimFromMouse() {
    const dx = this.mouse.worldX - this.hero.x;
    const dy = this.mouse.worldY - this.hero.y;
    const n = norm(dx, dy);
    this.hero.aimDir.x = n.x;
    this.hero.aimDir.y = n.y;
  }

  _handleMenus() {
    if (this.input.wasPressed("m")) {
      this.menu.open = this.menu.open === "map" ? null : "map";
    }
    if (this.input.wasPressed("i")) {
      this.menu.open = this.menu.open === "inventory" ? null : "inventory";
    }
    if (this.input.wasPressed("Escape")) {
      this.menu.open = null;
    }
  }

  _handleFastTravelInput() {
    if (this.input.wasPressed("z")) {
      this.world.toggleMapScale?.();
    }
  }

  _handleShopInput() {}
  _handleInventoryInput() {}

  _handleMovement(dt) {
    let mx = 0;
    let my = 0;

    if (this.input.isDown("w") || this.input.isDown("ArrowUp")) my -= 1;
    if (this.input.isDown("s") || this.input.isDown("ArrowDown")) my += 1;
    if (this.input.isDown("a") || this.input.isDown("ArrowLeft")) mx -= 1;
    if (this.input.isDown("d") || this.input.isDown("ArrowRight")) mx += 1;

    const move = norm(mx, my);
    const slowMult = (this.hero.state?.slowT || 0) > 0 ? 0.72 : 1;
    const speed = (this.hero.getMoveSpeed?.(this) ?? 140) * slowMult;

    this.hero.vx = move.x * speed;
    this.hero.vy = move.y * speed;

    const nx = this.hero.x + this.hero.vx * dt;
    const ny = this.hero.y + this.hero.vy * dt;

    if (this.world.canWalk?.(nx, this.hero.y) || this.hero.state?.sailing) {
      this.hero.x = nx;
    } else {
      this.hero.vx = 0;
    }

    if (this.world.canWalk?.(this.hero.x, ny) || this.hero.state?.sailing) {
      this.hero.y = ny;
    } else {
      this.hero.vy = 0;
    }
  }

  _handleSpells() {
    if (this.input.wasPressed("q")) this._castSpark();
    if (this.input.wasPressed("w")) this._castNova();
    if (this.input.wasPressed("e")) this._castDash();
    if (this.input.wasPressed("r")) this._castOrb();

    if (this.mouse.down) {
      this._castSpark();
    }
  }

  _castSpark() {
    if (this.cooldowns.q > 0) return;
    if (!this.hero.spendMana?.(this.skillDefs.q.mana)) return;

    this.cooldowns.q = this.skillDefs.q.cd;

    const dir = norm(this.hero.aimDir?.x || 1, this.hero.aimDir?.y || 0);
    const spd = 270;
    const dmg = Math.round(this.hero.getStats().dmg * 0.95);

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 18,
        this.hero.y + dir.y * 18,
        dir.x * spd,
        dir.y * spd,
        dmg,
        1.25,
        this.hero.level,
        {
          friendly: true,
          color: "rgba(148,225,255,0.95)",
          radius: 4,
          hitRadius: 15,
        }
      )
    );
  }

  _castNova() {
    if (this.cooldowns.w > 0) return;
    if (!this.hero.spendMana?.(this.skillDefs.w.mana)) return;

    this.cooldowns.w = this.skillDefs.w.cd;

    const dmg = Math.round(this.hero.getStats().dmg * 1.10);

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
  }

  _castDash() {
    if (this.cooldowns.e > 0) return;
    if (!this.hero.spendMana?.(this.skillDefs.e.mana)) return;

    this.cooldowns.e = this.skillDefs.e.cd;

    const dir = norm(
      this.hero.aimDir?.x || this.hero.lastMove?.x || 1,
      this.hero.aimDir?.y || this.hero.lastMove?.y || 0
    );
    this.hero.x += dir.x * 54;
    this.hero.y += dir.y * 54;
    this.hero.state.dashT = 0.20;
  }

  _castOrb() {
    if (this.cooldowns.r > 0) return;
    if (!this.hero.spendMana?.(this.skillDefs.r.mana)) return;

    this.cooldowns.r = this.skillDefs.r.cd;

    const dir = norm(this.hero.aimDir?.x || 1, this.hero.aimDir?.y || 0);
    const spd = 190;
    const dmg = Math.round(this.hero.getStats().dmg * 1.8);

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 18,
        this.hero.y + dir.y * 18,
        dir.x * spd,
        dir.y * spd,
        dmg,
        2.4,
        this.hero.level,
        {
          friendly: true,
          color: "rgba(192,140,255,0.96)",
          radius: 7,
          hitRadius: 20,
        }
      )
    );
  }

  _toggleDockingOrSailing() {
    const nearDock = this._cachedNearbyDock;
    if (!nearDock) return;
    this.hero.state.sailing = !this.hero.state.sailing;
    this._msg(this.hero.state.sailing ? "Set sail" : "Docked", 0.9);
  }

  _interact() {
    if (this._cachedNearbyCamp) {
      const camp = this._cachedNearbyCamp;
      this.progress.visitedCamps.add?.(camp.id);
      this.hero.hp = this.hero.maxHp;
      this.hero.mana = this.hero.maxMana;
      this._msg(`${camp.name} rested`, 1.0);
      return;
    }

    if (this._cachedNearbyDungeon) {
      this._enterDungeon(this._cachedNearbyDungeon);
      return;
    }

    if (this._cachedNearbyWaystone) {
      this.progress.discoveredWaystones.add?.(this._cachedNearbyWaystone.id);
      this._msg(`Waystone discovered`, 0.9);
      return;
    }
  }

  _toggleShop() {
    if (!this._cachedNearbyCamp) return;
    if (this.menu.open === "shop") {
      this.menu.open = null;
      return;
    }
    this.shop.campId = this._cachedNearbyCamp.id;
    this.menu.open = "shop";
  }

  _updateNearbyPOIs(dt) {
    this._nearbyPoiTimer -= dt;
    if (this._nearbyPoiTimer > 0) return;
    this._nearbyPoiTimer = 0.12;

    this._cachedNearbyCamp = this._nearestWithin(this.world.camps || [], 110);
    this._cachedNearbyDock = this._nearestWithin(this.world.docks || [], 90);
    this._cachedNearbyWaystone = this._nearestWithin(this.world.waystones || [], 100);
    this._cachedNearbyDungeon = this._nearestWithin(this.world.dungeons || [], 110);
  }

  _nearestWithin(arr, r) {
    let best = null;
    let bestD = r * r;
    for (const p of arr) {
      const d = dist2(this.hero.x, this.hero.y, p.x, p.y);
      if (d <= bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  _autoCloseShopIfNeeded() {
    if (this.menu.open !== "shop") return;
    const camp = this._cachedNearbyCamp;
    if (!camp || camp.id !== this.shop.campId) {
      this.menu.open = null;
    }
  }

  _countEnemiesNear(x, y, radius, filterFn = null) {
    const r2 = radius * radius;
    let count = 0;
    for (const e of this.enemies) {
      if (!e?.alive) continue;
      if (filterFn && !filterFn(e)) continue;
      if (dist2(x, y, e.x, e.y) <= r2) count++;
    }
    return count;
  }

  _spawnEnemyAt(x, y, level, kind, elite = false, boss = false) {
    const e = new Enemy(
      x,
      y,
      level,
      kind,
      hash2(x | 0, y | 0, this.seed + ((this.time * 1000) | 0)),
      elite,
      boss
    );
    this._applyEnemyTuning(e);
    this.enemies.push(e);
    return e;
  }

  _rollVariant(zone, kind, isUnknown) {
    if (kind === "dragon") return "firelord";

    const r = Math.random();

    if (isUnknown) {
      if (r < 0.17) return "berserker";
      if (r < 0.34) return "tank";
      if (r < 0.49) return "sniper";
      if (r < 0.64) return "volatile";
      if (r < 0.79) return "venom";
      return "frost";
    }

    if (zone === "Pine Verge") {
      if (r < 0.22) return "skirmisher";
      if (r < 0.42) return "venom";
      if (r < 0.58) return "berserker";
      return "";
    }

    if (zone === "High Meadow") {
      if (r < 0.22) return "skirmisher";
      if (r < 0.38) return "frost";
      return "";
    }

    if (zone === "Whisper Grass") {
      if (r < 0.24) return "sniper";
      if (r < 0.40) return "frost";
      return "";
    }

    if (zone === "Ash Fields") {
      if (r < 0.22) return "volatile";
      if (r < 0.42) return "berserker";
      return "";
    }

    if (zone === "Stone Flats") {
      if (r < 0.28) return "tank";
      if (r < 0.42) return "volatile";
      return "";
    }

    if (zone === "Old Road") {
      if (r < 0.20) return "skirmisher";
      if (r < 0.32) return "sniper";
      return "";
    }

    if (zone === "Riverbank" || zone === "Shoreline") {
      if (r < 0.20) return "frost";
      if (r < 0.34) return "venom";
      return "";
    }

    if (r < 0.12) return "berserker";
    if (r < 0.22) return "skirmisher";
    return "";
  }

  _applyEnemyTuning(e) {
    if (!e) return;

    if (e.kind === "unknown") {
      e.hp = Math.round(e.hp * 1.75);
      e.maxHp = e.hp;
      e.touchDps = Math.round((e.touchDps || 4) * 1.5);
      e.lootScalar = 1.6;
    }

    if (!e.variant) {
      const zone = this.world.getZoneName?.(e.x, e.y) || "Green Reach";
      e.variant = this._rollVariant(zone, e.kind, zone === "Unknown");
    }

    if (e.variant === "berserker") {
      e.hp = Math.round((e.hp || 50) * 1.10);
      e.maxHp = e.hp;
      e.moveSpeed = Math.round((e.moveSpeed || 60) * 1.22);
      e.touchDps = Math.round((e.touchDps || 4) * 1.28);
    } else if (e.variant === "tank") {
      e.hp = Math.round((e.hp || 50) * 1.55);
      e.maxHp = e.hp;
      e.moveSpeed = Math.round((e.moveSpeed || 60) * 0.85);
      e.touchDps = Math.round((e.touchDps || 4) * 1.16);
    } else if (e.variant === "skirmisher") {
      e.hp = Math.round((e.hp || 50) * 0.92);
      e.maxHp = e.hp;
      e.moveSpeed = Math.round((e.moveSpeed || 60) * 1.30);
    } else if (e.variant === "sniper") {
      e.hp = Math.round((e.hp || 50) * 0.94);
      e.maxHp = e.hp;
      e.rangedCd = 1.8 + Math.random() * 1.0;
    } else if (e.variant === "volatile") {
      e.variantBurstCd = 4.0 + Math.random() * 2.0;
    } else if (e.variant === "frost") {
      e.slowTouch = true;
    } else if (e.variant === "venom") {
      e.poisonTouch = true;
    }

    if (e.kind === "dragon") {
      e.dragonBoss = true;
      e.borderThreat = true;
      e.boss = true;
      e.elite = true;
      e.radius = Math.max(26, e.radius || 26);
      e.hp = Math.max(520, Math.round((e.hp || 100) * 6.2));
      e.maxHp = e.hp;
      e.touchDps = Math.max(24, Math.round((e.touchDps || 6) * 3.5));
      e.moveSpeed = Math.max(56, Math.round((e.moveSpeed || 60) * 0.95));
      e.fireSprayCd = 2.4 + Math.random() * 1.2;
      e.fireNovaCd = 5.4 + Math.random() * 1.5;
      e.lootScalar = 5.0;
      e.variant = "firelord";
    }

    if (e.borderThreat && !e.dragonBoss) {
      e.hp = Math.round((e.hp || 50) * 1.45);
      e.maxHp = e.hp;
      e.touchDps = Math.round((e.touchDps || 4) * 1.55);
      e.lootScalar = Math.max(1.5, e.lootScalar || 1.5);
    }
  }

  _spawnPack(cx, cy, zone, packSize, opts = {}) {
    let spawned = 0;
    const isUnknown = zone === "Unknown";
    const baseLevel = Math.max(1, this.hero.level + (isUnknown ? 3 : 0));

    for (let i = 0; i < packSize; i++) {
      if ((this.enemies?.length || 0) >= this.perf.maxEnemies) break;

      const ang = Math.random() * Math.PI * 2;
      const rad = 24 + Math.random() * 90;
      const ex = cx + Math.cos(ang) * rad;
      const ey = cy + Math.sin(ang) * rad;

      if (!this.world.canWalk?.(ex, ey)) continue;

      let kind = "blob";
      let elite = false;

      if (isUnknown) {
        const roll = Math.random();
        if (roll < 0.16) kind = "unknown";
        else if (roll < 0.34) kind = "brute";
        else if (roll < 0.52) kind = "caster";
        else if (roll < 0.70) kind = "stalker";
        else if (roll < 0.86) kind = "wolf";
        else kind = "scout";
        elite = Math.random() < 0.34;
      } else if (zone === "Pine Verge") {
        const roll = Math.random();
        kind = roll < 0.42 ? "wolf" : roll < 0.74 ? "stalker" : "scout";
        elite = Math.random() < 0.05;
      } else if (zone === "High Meadow") {
        const roll = Math.random();
        kind = roll < 0.44 ? "scout" : roll < 0.74 ? "blob" : "wolf";
        elite = Math.random() < 0.04;
      } else if (zone === "Whisper Grass") {
        const roll = Math.random();
        kind = roll < 0.38 ? "scout" : roll < 0.66 ? "stalker" : "caster";
        elite = Math.random() < 0.05;
      } else if (zone === "Ash Fields") {
        const roll = Math.random();
        kind = roll < 0.42 ? "ashling" : roll < 0.76 ? "brute" : "caster";
        elite = Math.random() < 0.06;
      } else if (zone === "Stone Flats") {
        const roll = Math.random();
        kind = roll < 0.48 ? "brute" : roll < 0.76 ? "ashling" : "blob";
        elite = Math.random() < 0.05;
      } else if (zone === "Old Road") {
        const roll = Math.random();
        kind = roll < 0.44 ? "scout" : roll < 0.76 ? "wolf" : "stalker";
        elite = Math.random() < 0.04;
      } else if (zone === "Riverbank" || zone === "Shoreline") {
        const roll = Math.random();
        kind = roll < 0.42 ? "blob" : roll < 0.74 ? "scout" : "caster";
        elite = Math.random() < 0.04;
      } else {
        const roll = Math.random();
        kind = roll < 0.22 ? "blob" : roll < 0.44 ? "stalker" : roll < 0.64 ? "wolf" : roll < 0.82 ? "scout" : "caster";
        elite = Math.random() < 0.04;
      }

      const e = this._spawnEnemyAt(
        ex,
        ey,
        Math.max(1, baseLevel + Math.floor(Math.random() * 3) - 1),
        kind,
        elite,
        false
      );

      if (isUnknown) e.borderThreat = true;
      this._applyEnemyTuning(e);

      spawned++;
    }

    if (opts.addLoneStrong && isUnknown && Math.random() < 0.58 && (this.enemies?.length || 0) < this.perf.maxEnemies) {
      const ang = Math.random() * Math.PI * 2;
      const ex = cx + Math.cos(ang) * (110 + Math.random() * 70);
      const ey = cy + Math.sin(ang) * (110 + Math.random() * 70);
      if (this.world.canWalk?.(ex, ey)) {
        const eliteKinds = ["unknown", "brute", "caster", "stalker"];
        const k = eliteKinds[(Math.random() * eliteKinds.length) | 0];
        const e = this._spawnEnemyAt(ex, ey, this.hero.level + 5 + ((Math.random() * 3) | 0), k, true, false);
        e.borderThreat = true;
        this._applyEnemyTuning(e);
        spawned++;
      }
    }

    return spawned;
  }

  _spawnWorldEnemies(dt) {
    this._spawnTimer -= dt;
    if (this._spawnTimer > 0) return;
    this._spawnTimer = 0.78;

    if ((this.enemies?.length || 0) >= this.perf.maxEnemies) return;
    if (this._spawnSuppressionT > 0) return;

    const heroZone = this.world.getZoneName?.(this.hero.x, this.hero.y) || "Green Reach";
    const heroInUnknown = heroZone === "Unknown";

    const localCap = heroInUnknown ? this.perf.unknownLocalCap : this.perf.discoverableLocalCap;
    const wideCap = heroInUnknown ? this.perf.unknownWideCap : this.perf.discoverableWideCap;

    const localCount = this._countEnemiesNear(this.hero.x, this.hero.y, 720, (e) => !e.campId && !e.dragonBoss);
    if (localCount >= localCap) return;

    const wideCount = this._countEnemiesNear(this.hero.x, this.hero.y, 1280, (e) => !e.campId && !e.dragonBoss);
    if (wideCount >= wideCap) return;

    const attempts = 4;
    for (let i = 0; i < attempts; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = this.perf.spawnMinDistance + Math.random() * (this.perf.spawnMaxDistance - this.perf.spawnMinDistance);
      const cx = this.hero.x + Math.cos(ang) * rad;
      const cy = this.hero.y + Math.sin(ang) * rad;

      if (!this.world.canWalk?.(cx, cy)) continue;
      if (this._nearPointOfInterest(cx, cy, 180)) continue;

      const zone = this.world.getZoneName?.(cx, cy) || "Green Reach";
      const isUnknown = zone === "Unknown";

      const spotCount = this._countEnemiesNear(cx, cy, 260, (e) => !e.campId && !e.dragonBoss);
      if (spotCount >= (isUnknown ? 4 : 2)) continue;

      const lone = Math.random() < (isUnknown ? 0.18 : 0.34);
      const packSize = lone
        ? 1
        : isUnknown
          ? 3 + ((Math.random() * 2) | 0)
          : 2 + ((Math.random() * 2) | 0);

      this._spawnPack(cx, cy, zone, packSize, { addLoneStrong: true });
      break;
    }
  }

  _spawnUnknownBorderBosses(dt) {
    this._unknownBossSpawnT -= dt;
    if (this._unknownBossSpawnT > 0) return;
    this._unknownBossSpawnT = 8.4;

    const zone = this.world.getZoneName?.(this.hero.x, this.hero.y) || "";
    if (zone !== "Unknown") return;

    const existingBoss = this.enemies.some((e) => e?.alive && e.boss && !e.dragonBoss);
    if (existingBoss) return;

    if ((this.enemies?.length || 0) >= this.perf.maxEnemies - 2) return;

    const edge = this.world.mapHalfSize || 6200;
    const heroNearBorder =
      Math.abs(this.hero.x) > edge + 280 ||
      Math.abs(this.hero.y) > edge + 280;

    if (!heroNearBorder) return;

    const ang = Math.random() * Math.PI * 2;
    const rad = 620 + Math.random() * 260;
    const ex = this.hero.x + Math.cos(ang) * rad;
    const ey = this.hero.y + Math.sin(ang) * rad;

    if (!this.world.canWalk?.(ex, ey)) return;

    const kindRoll = Math.random();
    const kind =
      kindRoll < 0.34 ? "unknown" :
      kindRoll < 0.62 ? "brute" :
      kindRoll < 0.84 ? "caster" :
      "stalker";

    const bossLevel = Math.max(this.hero.level + 8, 12);
    const boss = this._spawnEnemyAt(ex, ey, bossLevel, kind, true, true);
    boss.borderThreat = true;
    boss.touchDps = Math.max(12, boss.touchDps || 0);
    this._applyEnemyTuning(boss);

    this._msg("A border champion emerges from the Unknown", 1.4);
  }

  _dragonCornerPositions() {
    const main = this.world.mapHalfSize || 6200;
    const bounds = this.world.boundsHalfSize || 8200;
    const edgeBandMid = main + Math.max(550, Math.floor((bounds - main) * 0.45));

    return [
      { x: -edgeBandMid, y: -edgeBandMid, corner: "NW" },
      { x:  edgeBandMid, y: -edgeBandMid, corner: "NE" },
      { x: -edgeBandMid, y:  edgeBandMid, corner: "SW" },
      { x:  edgeBandMid, y:  edgeBandMid, corner: "SE" },
    ];
  }

  _spawnCornerDragon(pos) {
    const p = this.world._findSafeLandPatchNear?.(pos.x, pos.y, 420) || pos;
    const e = this._spawnEnemyAt(p.x, p.y, Math.max(this.hero.level + 12, 18), "dragon", true, true);
    e.cornerDragon = true;
    e.cornerTag = pos.corner;
    e.home = { x: p.x, y: p.y };
    e.leashRadius = 820;
    e.territoryRadius = 560;
    e.lastFireMsgT = 0;
    this._applyEnemyTuning(e);
    return e;
  }

  _ensureCornerDragons() {
    const positions = this._dragonCornerPositions();
    for (const pos of positions) {
      const exists = this.enemies.some((e) => e?.alive && e.cornerDragon && e.cornerTag === pos.corner);
      if (!exists) this._spawnCornerDragon(pos);
    }
  }

  _ensureCornerDragonsPeriodic(dt) {
    this._dragonCheckT -= dt;
    if (this._dragonCheckT > 0) return;
    this._dragonCheckT = 5.5;
    this._ensureCornerDragons();
  }

  _dragonMinionCount(dragon) {
    if (!dragon?.home) return 0;
    const rr = (dragon.territoryRadius || 560) ** 2;
    let n = 0;
    for (const e of this.enemies) {
      if (!e?.alive || e === dragon || e.dragonBoss) continue;
      const d = dist2(e.x, e.y, dragon.home.x, dragon.home.y);
      if (d <= rr) n++;
    }
    return n;
  }

  _spawnDragonMinionPack(dragon) {
    if (!dragon?.home) return;
    if ((this.enemies?.length || 0) >= this.perf.maxEnemies - 2) return;

    const desired = dragon.territoryRadius || 560;
    const current = this._dragonMinionCount(dragon);
    if (current >= 3) return;

    const packSize = 2;
    for (let i = 0; i < packSize; i++) {
      if ((this.enemies?.length || 0) >= this.perf.maxEnemies) break;

      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * (desired - 180);
      const ex = dragon.home.x + Math.cos(a) * r;
      const ey = dragon.home.y + Math.sin(a) * r;

      if (!this.world.canWalk?.(ex, ey)) continue;

      const roll = Math.random();
      const kind =
        roll < 0.30 ? "unknown" :
        roll < 0.55 ? "brute" :
        roll < 0.78 ? "caster" :
        "stalker";

      const e = this._spawnEnemyAt(ex, ey, Math.max(this.hero.level + 5, dragon.level - 6), kind, true, false);
      e.borderThreat = true;
      e.dragonMinion = true;
      e.dragonCornerTag = dragon.cornerTag;
      e.home = { x: ex, y: ey };
      e.leashRadius = 180;
      this._applyEnemyTuning(e);
    }
  }

  _updateDragons(dt) {
    for (const e of this.enemies) {
      if (!e?.alive || !e.dragonBoss) continue;

      e.lastFireMsgT = Math.max(0, (e.lastFireMsgT || 0) - dt);

      if (e.home && e.leashRadius) {
        const heroDist = Math.hypot(this.hero.x - e.x, this.hero.y - e.y);
        const homeDist = Math.hypot(e.x - e.home.x, e.y - e.home.y);

        if (heroDist > 700 && homeDist > e.leashRadius) {
          const back = norm(e.home.x - e.x, e.home.y - e.y);
          e.x += back.x * 66 * dt;
          e.y += back.y * 66 * dt;
        }
      }

      e.fireSprayCd = Math.max(0, (e.fireSprayCd || 0) - dt);
      e.fireNovaCd = Math.max(0, (e.fireNovaCd || 0) - dt);

      const dx = this.hero.x - e.x;
      const dy = this.hero.y - e.y;
      const d = Math.hypot(dx, dy);

      if (d < 380 && e.fireSprayCd <= 0) {
        this._dragonFireSpray(e);
        e.fireSprayCd = 2.6 + Math.random() * 1.0;
      }

      if (d < 200 && e.fireNovaCd <= 0) {
        this._dragonFireNova(e);
        e.fireNovaCd = 5.2 + Math.random() * 1.4;
      }
    }
  }

  _dragonFireSpray(e) {
    const dir = norm(this.hero.x - e.x, this.hero.y - e.y);
    const baseA = Math.atan2(dir.y, dir.x);
    const spread = 0.78;
    const speed = 185;
    const dmg = Math.max(22, Math.round((e.level || 10) * 1.8));

    for (let i = -2; i <= 2; i++) {
      const a = baseA + (i / 2) * (spread / 2);
      const vx = Math.cos(a) * speed;
      const vy = Math.sin(a) * speed;

      this.projectiles.push(
        new Projectile(
          e.x + Math.cos(a) * 30,
          e.y + Math.sin(a) * 30,
          vx,
          vy,
          dmg,
          1.55,
          e.level || 10,
          {
            friendly: false,
            color: "rgba(255,112,54,0.96)",
            radius: 9,
            hitRadius: 20,
            ignoreWalls: false,
          }
        )
      );
    }

    if ((e.lastFireMsgT || 0) <= 0) {
      this._spawnFloatingText(e.x, e.y - 34, "FIRE SPRAY", "#ff9a52");
      e.lastFireMsgT = 0.8;
    }
    this._cameraShake(0.10, 2.4);
  }

  _dragonFireNova(e) {
    const count = 12;
    const speed = 160;
    const dmg = Math.max(24, Math.round((e.level || 10) * 1.55));

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.projectiles.push(
        new Projectile(
          e.x + Math.cos(a) * 20,
          e.y + Math.sin(a) * 20,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          dmg,
          1.65,
          e.level || 10,
          {
            friendly: false,
            color: "rgba(255,166,72,0.95)",
            radius: 8,
            hitRadius: 18,
            ignoreWalls: false,
          }
        )
      );
    }

    this._spawnFloatingText(e.x, e.y - 28, "FIRE BURST", "#ffb866");
    this._cameraShake(0.16, 3.8);
  }

  _updateDragonTerritories(dt) {
    this._dragonTerritoryT -= dt;
    if (this._dragonTerritoryT > 0) return;
    this._dragonTerritoryT = 4.5;

    for (const e of this.enemies) {
      if (!e?.alive || !e.dragonBoss || !e.home) continue;
      this._spawnDragonMinionPack(e);
    }
  }

  _checkDragonWarnings() {
    for (const e of this.enemies) {
      if (!e?.alive || !e.dragonBoss || !e.home) continue;

      const d = Math.hypot(this.hero.x - e.home.x, this.hero.y - e.home.y);
      const warnRadius = (e.territoryRadius || 560) + 90;

      if (d <= warnRadius && !this._dragonWarned[e.cornerTag]) {
        this._dragonWarned[e.cornerTag] = true;
        this.zoneMsg = `Dragon Territory ${e.cornerTag}`;
        this.zoneMsgT = 1.8;
        this._msg("A great dragon watches this corner", 1.6);
      }

      if (d > warnRadius + 180) {
        this._dragonWarned[e.cornerTag] = false;
      }
    }
  }

  _updateVariantAbilities(dt) {
    for (const e of this.enemies) {
      if (!e?.alive || e.dragonBoss) continue;

      const d = Math.hypot(this.hero.x - e.x, this.hero.y - e.y);

      if (e.variant === "sniper") {
        e.rangedCd = Math.max(0, (e.rangedCd || 0) - dt);
        if (d < 340 && e.rangedCd <= 0) {
          const dir = norm(this.hero.x - e.x, this.hero.y - e.y);
          const speed = 200;
          const dmg = Math.max(7, Math.round((e.level || 1) * 0.85));
          this.projectiles.push(
            new Projectile(
              e.x + dir.x * 14,
              e.y + dir.y * 14,
              dir.x * speed,
              dir.y * speed,
              dmg,
              1.7,
              e.level || 1,
              {
                friendly: false,
                color: "rgba(210,240,255,0.94)",
                radius: 5,
                hitRadius: 12,
                ignoreWalls: false,
              }
            )
          );
          e.rangedCd = 2.4 + Math.random() * 1.0;
        }
      }

      if (e.variant === "volatile") {
        e.variantBurstCd = Math.max(0, (e.variantBurstCd || 0) - dt);
        if (d < 86 && e.variantBurstCd <= 0) {
          const count = 6;
          const speed = 130;
          const dmg = Math.max(6, Math.round((e.level || 1) * 0.70));
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            this.projectiles.push(
              new Projectile(
                e.x + Math.cos(a) * 10,
                e.y + Math.sin(a) * 10,
                Math.cos(a) * speed,
                Math.sin(a) * speed,
                dmg,
                1.0,
                e.level || 1,
                {
                  friendly: false,
                  color: "rgba(255,106,142,0.92)",
                  radius: 5,
                  hitRadius: 12,
                  ignoreWalls: false,
                }
              )
            );
          }
          e.variantBurstCd = 5.0 + Math.random() * 2.0;
          this._cameraShake(0.06, 1.8);
        }
      }

      if (e.variant === "frost" && d < 28 && this._touchDamageCd <= 0) {
        this.hero.state.slowT = Math.max(this.hero.state.slowT || 0, 0.8);
      }

      if (e.variant === "venom" && d < 28 && this._touchDamageCd <= 0) {
        this.hero.state.poisonT = Math.max(this.hero.state.poisonT || 0, 1.8);
      }
    }

    if ((this.hero.state.slowT || 0) > 0) this.hero.state.slowT = Math.max(0, this.hero.state.slowT - dt);
    if ((this.hero.state.poisonT || 0) > 0) {
      this.hero.state.poisonT = Math.max(0, this.hero.state.poisonT - dt);
      this.hero.hp = Math.max(1, this.hero.hp - dt * 1.8);
    }
  }

  _respawnCampEnemies(dt) {
    this._campRespawnT -= dt;
    if (this._campRespawnT > 0) return;

    this._campRespawnT = 22 + Math.random() * 10;

    const camps = this.world.camps || [];

    for (const camp of camps) {
      const d = Math.hypot(this.hero.x - camp.x, this.hero.y - camp.y);
      if (d < 520) continue;

      let count = 0;
      for (const e of this.enemies) {
        if (!e?.alive) continue;
        if (e.campId !== camp.id) continue;
        count++;
      }

      if (count >= 1) continue;
      if (Math.random() < 0.6) continue;

      const ang = Math.random() * Math.PI * 2;
      const rad = 140 + Math.random() * 120;
      const ex = camp.x + Math.cos(ang) * rad;
      const ey = camp.y + Math.sin(ang) * rad;

      if (!this.world.canWalk?.(ex, ey)) continue;

      const zone = this.world.getZoneName?.(camp.x, camp.y) || "Camp Grounds";

      let kind = "blob";
      if (zone === "Pine Verge") kind = Math.random() < 0.5 ? "wolf" : "stalker";
      else if (zone === "Ash Fields") kind = Math.random() < 0.5 ? "ashling" : "brute";
      else if (zone === "Stone Flats") kind = "brute";
      else if (zone === "Whisper Grass") kind = Math.random() < 0.5 ? "scout" : "stalker";
      else kind = Math.random() < 0.5 ? "blob" : "scout";

      const e = this._spawnEnemyAt(
        ex,
        ey,
        Math.max(1, this.hero.level),
        kind,
        false,
        false
      );

      e.campId = camp.id;
      e.home = { x: ex, y: ey };
    }
  }

  _updateOverworldEnemies(dt) {
    for (const e of this.enemies) {
      if (!e?.alive) continue;
      const d2 = dist2(e.x, e.y, this.hero.x, this.hero.y);
      if (d2 > this.perf.enemyUpdateRadius * this.perf.enemyUpdateRadius) continue;

      e.update?.(dt, this.hero, this.world, this);

      const rr = (e.radius || 12) + (this.hero.radius || 12);
      if (dist2(e.x, e.y, this.hero.x, this.hero.y) <= rr * rr) {
        if (this._touchDamageCd <= 0) {
          this._touchDamageCd = this.perf.touchDamageTick;
          let base = e.touchDps || 4;
          if (e.variant === "berserker") base *= 1.12;
          const dealt = this.hero.takeDamage?.(base * this._currentIncomingDamageMult());
          this._spawnFloatingText(this.hero.x, this.hero.y - 20, `-${dealt}`, "#ffb3b3");
          this._cameraShake(0.08, e.boss ? 4.6 : 3.0);
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  _applyCampSafeZones(dt) {
    void dt;
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p?.alive) continue;
      p.update?.(dt, this.world);

      if (!p.alive) continue;

      if (p.friendly) {
        for (const e of this.enemies) {
          if (!e?.alive) continue;
          const rr = (p.hitRadius || p.radius || 4) + (e.radius || 12);
          if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
            let dmg = p.dmg || 1;
            dmg += this._currentDamageBonus();

            const critChance = (this.hero.getStats?.().crit || 0) + this._currentCritBonus();
            const isCrit = Math.random() < critChance;
            if (isCrit) dmg = Math.round(dmg * (this.hero.getStats?.().critMult || 1.6));

            e.takeDamage?.(dmg);
            this._spawnHitSpark(e.x, e.y, p.color || "#9dd7ff");
            this._spawnFloatingText(e.x, e.y - 14, `${dmg}${isCrit ? "!" : ""}`, isCrit ? "#ffe48c" : "#ffffff");
            p.alive = false;

            if (!e.alive) {
              this.hero.giveXP?.(e.xpValue?.() || 4);
              this._dropEnemyLoot(e);
              this._combatTextT = 0.55;
              this._killFlashT = e.boss ? 0.45 : 0.25;
            }
            break;
          }
        }
      } else {
        const rr = (p.hitRadius || p.radius || 4) + (this.hero.radius || 12);
        if (dist2(p.x, p.y, this.hero.x, this.hero.y) <= rr * rr) {
          const dealt = this.hero.takeDamage?.((p.dmg || 1) * this._currentIncomingDamageMult());
          this._spawnFloatingText(this.hero.x, this.hero.y - 20, `-${dealt}`, "#ffb3b3");
          this._cameraShake(0.08, p.radius >= 7 ? 3.4 : 2.8);
          p.alive = false;
        }
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive);
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
    }
  }

  _dropEnemyLoot(e) {
    const lootScalar = e.lootScalar || 1;
    const goldAmt = Math.round(
      (3 + Math.max(0, Math.round((e.level || 1) * 0.8)) + (e.lootBonus?.() || 0) + (e.boss ? 18 : 0)) * lootScalar
    );
    this.loot.push(new Loot(e.x, e.y, "gold", { amount: goldAmt }));

    const potionRoll = Math.random();
    const potionChance = e.dragonBoss ? 0.95 : e.boss ? 0.55 : e.elite ? 0.22 : 0.10;
    if (potionRoll < potionChance) {
      this.loot.push(new Loot(e.x + 8, e.y, "potion", { potionType: Math.random() < 0.35 ? "mana" : "hp" }));
    }

    const gearChance =
      e.dragonBoss ? 1.0 :
      e.boss ? 1.0 :
      e.elite ? 0.42 :
      e.kind === "unknown" ? 0.30 :
      0.12;

    if (Math.random() < gearChance) {
      const slots = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
      const slot = slots[(Math.random() * slots.length) | 0];
      const rarity =
        e.dragonBoss ? "epic" :
        e.boss ? "epic" :
        e.elite ? (Math.random() < 0.55 ? "rare" : "epic") :
        e.kind === "unknown" ? (Math.random() < 0.4 ? "rare" : "uncommon") :
        (Math.random() < 0.18 ? "rare" : "uncommon");

      const item = makeGear(slot, Math.max(1, e.level), rarity, hash2(e.x | 0, e.y | 0, this.time | 0));
      this.loot.push(new Loot(e.x - 8, e.y, "gear", item));
    }
  }

  _updateQuestState() {}

  _updateZoneMessages(dt) {
    this._zoneSampleT -= dt;
    if (this._zoneSampleT > 0) return;
    this._zoneSampleT = 0.18;

    const zone = this.world.getZoneName?.(this.hero.x, this.hero.y) || "";
    if (zone && zone !== this._lastZoneName) {
      this._lastZoneName = zone;
      this.zoneMsg = zone;
      this.zoneMsgT = 1.0;
    }
  }

  _checkLevelUpMessage() {
    if ((this.hero.level || 1) > this._levelSeen) {
      this._levelSeen = this.hero.level;
      this._msg(`Level ${this.hero.level}`, 1.1);
    }
  }

  _currentDamageBonus() {
    const st = this.hero.state || {};
    const campType = st.campBuffT > 0 ? st.campBuffType || "" : "";
    const campPower = st.campBuffT > 0 ? st.campBuffPower || 0 : 0;

    const camp =
      campType === "dust" ? campPower + 2 :
      campType === "stone" ? Math.floor(campPower * 0.35) :
      0;

    const dungeon = st.dungeonMomentumT > 0 ? st.dungeonMomentumPower || 0 : 0;
    const chain = Math.max(0, Math.min(6, st.eliteChainCount || 0));
    return camp + dungeon + chain;
  }

  _currentCritBonus() {
    const st = this.hero.state || {};
    if (st.campBuffT <= 0) return 0;

    if (st.campBuffType === "pine") {
      return 0.02 + (st.campBuffPower || 0) * 0.006;
    }

    return 0;
  }

  _currentIncomingDamageMult() {
    const st = this.hero.state || {};
    let mult = 1;

    if (st.campBuffT > 0) {
      if (st.campBuffType === "stone") {
        mult -= Math.min(0.28, 0.10 + (st.campBuffPower || 0) * 0.012);
      } else if (st.campBuffType === "oak") {
        mult -= Math.min(0.10, (st.campBuffPower || 0) * 0.006);
      } else if (st.campBuffType === "river") {
        mult -= Math.min(0.06, (st.campBuffPower || 0) * 0.004);
      }
    }

    if (st.dungeonMomentumT > 0) {
      mult -= Math.min(0.10, (st.dungeonMomentumPower || 0) * 0.012);
    }

    return Math.max(0.62, mult);
  }

  _cameraShake(t, mag) {
    this.camera.shakeT = Math.max(this.camera.shakeT, t || 0.08);
    this.camera.shakeMag = Math.max(this.camera.shakeMag || 0, mag || 2);
  }

  _spawnHitSpark(x, y, color) {
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 24 + Math.random() * 60;
      this.hitSparks.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        t: 0.24 + Math.random() * 0.18,
        maxT: 0.40,
        color: color || "#ffffff",
      });
    }
  }

  _spawnFloatingText(x, y, text, color = "#ffffff") {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      t: 0.7,
      maxT: 0.7,
      speed: 18,
    });
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
    const maxEnemyD2 = (this.perf.enemyUpdateRadius + 560) ** 2;
    const maxLootD2 = (this.perf.lootUpdateRadius + 420) ** 2;
    const maxProjD2 = (this.perf.projectileUpdateRadius + 260) ** 2;

    this.enemies = this.enemies.filter((e) => {
      if (!e?.alive) return false;
      if (e.cornerDragon) return true;
      return dist2(e.x, e.y, this.hero.x, this.hero.y) < maxEnemyD2;
    });

    this.loot = this.loot.filter((l) => l?.alive && dist2(l.x, l.y, this.hero.x, this.hero.y) < maxLootD2);
    this.projectiles = this.projectiles.filter((p) => p?.alive && dist2(p.x, p.y, this.hero.x, this.hero.y) < maxProjD2);
  }

  _ensureWorldPopulation() {
    if ((this.world.camps || []).length === 0) this.world._generatePOIs?.();
  }

  _ensureCampQuests() {}

  _ensureHeroSafe() {
    if (this.world.canWalk?.(this.hero.x, this.hero.y)) return;
    const p = this.world._findSafeLandPatchNear?.(this.hero.x, this.hero.y, 180);
    if (p) {
      this.hero.x = p.x;
      this.hero.y = p.y;
    }
  }

  _enterDungeon(dungeonPoi) {
    void dungeonPoi;
    this.dungeon.active = true;
    this.dungeon.floor = Math.max(1, (this.dungeon.floor || 0) + 1);
    this.menu.open = null;
    this._msg("Dungeon entered", 1.0);
  }

  _updateDungeon(dt) {
    void dt;
  }

  _msg(text, t = 1.0) {
    this.msg = text;
    this.msgT = t;
  }

  _saveGame() {
    try {
      this.save.write?.({
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
      });
    } catch (err) {
      console.warn("Save failed", err);
    }
  }

  _loadGame() {
    try {
      const data = this.save.read?.();
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

      this.camera.x = this.hero.x;
      this.camera.y = this.hero.y;
    } catch (err) {
      console.warn("Load failed", err);
    }
  }
}