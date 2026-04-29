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

const DEV_RESET_CONFIRM_MS = 2500;
const DEV_TOOL_ACTION_COUNT = 9;
const SHOP_ACTION_COUNT = 4;
const TOWN_ACTION_COUNT = 9;
const EQUIPMENT_SLOTS = ["weapon", "armor", "helm", "boots", "ring", "trinket"];
const SKILL_PANEL_ORDER = ["q", "w", "e", "r"];
const QUEST_PANEL_HEIGHT = 420;
const QUEST_TRACKS = [
  ["1", "story"],
  ["2", "bounty"],
  ["3", "town"],
  ["4", "dungeon"],
  ["5", "dragon"],
  ["6", "treasure"],
  ["7", "secret"],
];
const QUEST_TRACK_ROWS = [
  ["story", "bounty", "town", "dungeon"],
  ["dragon", "treasure", "secret"],
];

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
      maxEnemies: 34,
      maxLoot: 72,
      maxProjectiles: 64,
      maxFloatingTexts: 48,
      cleanupTimer: 0,
      cleanupEvery: 0.42,
      touchDamageTick: 0.34,
      spawnMinDistance: 840,
      spawnMaxDistance: 1360,
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
    this._bridgeDiscoveryT = 0;

    this.menu = { open: null, mapZoom: 1 };
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
    this._lastHeroLevel = this.hero.level || 1;

    this._cachedNearbyCamp = null;
    this._cachedNearbyDock = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyDungeon = null;
    this._cachedNearbyShrine = null;
    this._cachedNearbyCache = null;
    this._cachedNearbySecret = null;
    this._cachedNearbyTown = null;
    this._cachedNearbyDragonLair = null;

    this._rng = new RNG(hash2(this.seed, 9001));

    this.mouse = {
      x: this.w * 0.5,
      y: this.h * 0.5,
      worldX: this.hero.x,
      worldY: this.hero.y,
      down: false,
      clicked: false,
    };
    this.touch = {
      enabled: false,
      recentT: 0,
      moveId: null,
      aimId: null,
      baseX: 0,
      baseY: 0,
      x: 0,
      y: 0,
      mx: 0,
      my: 0,
      buttons: {},
    };

    this.skillDefs = {
      q: { key: "q", name: "Spark", mana: 8, cd: 0.22, color: "#8be9ff" },
      w: { key: "w", name: "Nova", mana: 18, cd: 1.8, color: "#d6f5ff" },
      e: { key: "e", name: "Blink", mana: 14, cd: 2.8, color: "#ffd36e" },
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
      discoveredSecrets: new Set(),
      defeatedDragons: new Set(),
      relicShards: 0,
      storyMilestones: {},
      visitedTowns: new Set(),
      crossedBridges: new Set(),
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
      room: null,
      roomIndex: 0,
      totalRooms: 0,
      roomRewarded: false,
    };

    this.dev = {
      godMode: false,
    };

    this.trackedObjective = "story";
    this.quest = this._makeBountyQuest();

    this._bindMouse();
    this._loadGame();

    if (!this.hero.inventory) this.hero.inventory = [];
    if (!this.hero.classId) this.hero.classId = "knight";
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
    this.hero.state.mountainPassAccess = !!this.progress?.storyMilestones?.mountainPassAccess;

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
    if (this.touch) this.touch.recentT = Math.max(0, (this.touch.recentT || 0) - dt);

    this._tickMessages(dt);
    this._tickCooldowns(dt);
    this._tickVisualEffects(dt);
    this.world?.update?.(dt);
    this._updateMouseWorld();
    this._applyTerrainEffects(dt);
    this.world?.revealAround?.(this.hero.x, this.hero.y, this.dungeon.active ? 460 : 720);
    this._updateNearbyPOIs(dt);

    this._handleMenus();

    if (this.menu.open === "inventory") {
      this._handleInventoryInput();
    } else if (this.menu.open === "shop") {
      this._handleShopInput();
    } else if (this.menu.open === "town") {
      this._handleTownInput();
    } else if (this.menu.open === "dev") {
      // Dev keys are handled in _handleMenus.
    } else if (!this.menu.open) {
      this._handleMovement(dt);
      this._handleSkills();
    }

    if (this.menu.open) {
      this.hero.vx = 0;
      this.hero.vy = 0;
    }

    this._handleInteractShortcuts(dt);

    this.hero.update?.(dt);
    this._updateEnemies(dt);
    this._updateProjectiles(dt);
    this._handleHeroDeath(dt);
    this._updateLoot(dt);
    this._checkHeroLevelFeedback();
    this._updateZoneMessage(dt);
    this._checkBridgeDiscovery(dt);
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
    this.mouse.clicked = false;
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(
      this.w * 0.5 - this.camera.x + this.camera.sx,
      this.h * 0.5 - this.camera.y + this.camera.sy
    );

    if (this.dungeon.active) this._drawDungeonRoom(ctx);
    else this.world.draw(ctx, this.camera, this.hero);

    for (const l of this.loot) {
      if (!this._isVisibleWorldPoint(l?.x, l?.y, 80)) continue;
      if (l?.alive) l.draw(ctx);
    }

    for (const p of this.projectiles) {
      if (!this._isVisibleWorldPoint(p?.x, p?.y, 120)) continue;
      if (p?.alive) p.draw(ctx);
    }

    for (const e of this.enemies) {
      if (!this._isVisibleWorldPoint(e?.x, e?.y, 150)) continue;
      if (e?.alive) e.draw(ctx);
    }

    this.hero.draw(ctx);
    this._drawFloatingTexts(ctx);

    ctx.restore();

    this._drawScreenEffects(ctx);
    this.ui.draw(ctx, this);
  }

  _isVisibleWorldPoint(x, y, margin = 96) {
    if (this.dungeon.active) return true;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const halfW = (this.w || 960) * 0.5 + margin;
    const halfH = (this.h || 540) * 0.5 + margin;
    return x >= this.camera.x - halfW && x <= this.camera.x + halfW &&
      y >= this.camera.y - halfH && y <= this.camera.y + halfH;
  }

  _drawScreenEffects(ctx) {
    ctx.save();

    if (this._killFlashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.22 * this._killFlashT})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const hpFrac = clamp((this.hero.hp || 0) / Math.max(1, this.hero.maxHp || 100), 0, 1);
    if (hpFrac < 0.32 && !this.dev?.godMode) {
      ctx.fillStyle = `rgba(120, 10, 24, ${(0.32 - hpFrac) * 0.34})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const hurtT = this.hero?.state?.hurtT || 0;
    if (hurtT > 0) {
      ctx.fillStyle = `rgba(255,120,120,${hurtT * 0.18})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const poisonT = this.hero?.state?.poisonT || 0;
    if (poisonT > 0) {
      ctx.fillStyle = `rgba(110,205,120,${Math.min(0.12, poisonT * 0.08)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    const dashT = this.hero?.state?.dashT || 0;
    if (dashT > 0) {
      const dir = this.hero?.aimDir || this.hero?.lastMove || { x: 1, y: 0 };
      const angle = Math.atan2(dir.y || 0, dir.x || 1);
      ctx.translate(this.w * 0.5, this.h * 0.5);
      ctx.rotate(angle);
      ctx.fillStyle = `rgba(255,211,110,${Math.min(0.16, dashT * 0.18)})`;
      ctx.fillRect(-this.w * 0.18, -18, this.w * 0.36, 36);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
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
      this.mouse.clicked = true;
      onMove(ev);
    });
    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
    this.canvas.addEventListener("wheel", (ev) => {
      if (this.menu.open === "inventory") {
        const inv = this.hero.inventory || [];
        if (inv.length <= 1) return;
        ev.preventDefault();
        const dir = ev.deltaY > 0 ? 1 : -1;
        this.invIndex = clamp((this.invIndex || 0) + dir, 0, inv.length - 1);
        return;
      }

      if (this.menu.open !== "map") return;
      ev.preventDefault();
      this._setMapZoom(ev.deltaY < 0 ? "in" : "out");
    }, { passive: false });

    const toCanvasPoint = (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) * (this.w / rect.width),
        y: (ev.clientY - rect.top) * (this.h / rect.height),
      };
    };
    const isTouch = (ev) => ev.pointerType === "touch" || ev.pointerType === "pen";
    const resetTouchButton = (id) => {
      if (!this.touch?.buttons) return;
      for (const key of Object.keys(this.touch.buttons)) {
        if (this.touch.buttons[key] === id) delete this.touch.buttons[key];
      }
    };

    this.canvas.addEventListener("pointerdown", (ev) => {
      if (!isTouch(ev)) return;
      ev.preventDefault();
      this.canvas.setPointerCapture?.(ev.pointerId);
      const p = toCanvasPoint(ev);
      this.touch.enabled = true;
      this.touch.recentT = 4;

      const button = this._touchButtonAt(p.x, p.y);
      if (button) {
        this.touch.buttons[button] = ev.pointerId;
        this._triggerTouchButton(button);
        return;
      }

      if (p.x < this.w * 0.48 && p.y > this.h * 0.42 && this.touch.moveId == null) {
        this.touch.moveId = ev.pointerId;
        this.touch.baseX = p.x;
        this.touch.baseY = p.y;
        this.touch.x = p.x;
        this.touch.y = p.y;
        this.touch.mx = 0;
        this.touch.my = 0;
        return;
      }

      this.touch.aimId = ev.pointerId;
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.down = true;
      this.mouse.clicked = true;
    }, { passive: false });

    this.canvas.addEventListener("pointermove", (ev) => {
      if (!isTouch(ev)) return;
      ev.preventDefault();
      const p = toCanvasPoint(ev);
      this.touch.enabled = true;
      this.touch.recentT = 4;

      if (ev.pointerId === this.touch.moveId) {
        const dx = p.x - this.touch.baseX;
        const dy = p.y - this.touch.baseY;
        const max = 54;
        const d = Math.hypot(dx, dy) || 0.001;
        const k = Math.min(1, d / max);
        this.touch.mx = (dx / d) * k;
        this.touch.my = (dy / d) * k;
        this.touch.x = this.touch.baseX + (dx / d) * Math.min(max, d);
        this.touch.y = this.touch.baseY + (dy / d) * Math.min(max, d);
      } else if (ev.pointerId === this.touch.aimId) {
        this.mouse.x = p.x;
        this.mouse.y = p.y;
      }
    }, { passive: false });

    const endPointer = (ev) => {
      if (!isTouch(ev)) return;
      ev.preventDefault();
      if (ev.pointerId === this.touch.moveId) {
        this.touch.moveId = null;
        this.touch.mx = 0;
        this.touch.my = 0;
      }
      if (ev.pointerId === this.touch.aimId) {
        this.touch.aimId = null;
        this.mouse.down = false;
      }
      resetTouchButton(ev.pointerId);
    };
    this.canvas.addEventListener("pointerup", endPointer, { passive: false });
    this.canvas.addEventListener("pointercancel", endPointer, { passive: false });
  }

  _touchButtonLayout() {
    const compact = this.w < 720 || this.h < 500;
    const r = compact ? 24 : 27;
    const gap = compact ? 9 : 12;
    const right = this.w - (compact ? 28 : 34);
    const bottom = this.h - (compact ? 142 : 132);
    return {
      q: { x: right - (r * 2 + gap) * 1.5, y: bottom - r - gap, r },
      w: { x: right - (r * 2 + gap) * 0.5, y: bottom - r - gap, r },
      e: { x: right - (r * 2 + gap) * 1.5, y: bottom + r + gap, r },
      r: { x: right - (r * 2 + gap) * 0.5, y: bottom + r + gap, r },
      f: { x: right - (r * 2 + gap) * 2.6, y: bottom + r + gap, r: 24 },
      b: { x: right - (r * 2 + gap) * 2.6, y: bottom - r - gap, r: 24 },
    };
  }

  _touchButtonAt(x, y) {
    for (const [key, b] of Object.entries(this._touchButtonLayout())) {
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return key;
    }
    return "";
  }

  _triggerTouchButton(key) {
    if (key === "q") this._castSpark();
    else if (key === "w") this._castNova();
    else if (key === "e") this._castBlink();
    else if (key === "r") this._castOrb();
    else if (key === "f" && this._interactCd <= 0 && !this.menu.open) {
      this._interactCd = 0.18;
      this._interact();
    } else if (key === "b" && this._dockToggleCd <= 0 && !this.menu.open) {
      this._dockToggleCd = 0.18;
      this._toggleDockingOrSailing();
    }
  }

  _clearTouchState() {
    if (!this.touch) return;
    this.touch.moveId = null;
    this.touch.aimId = null;
    this.touch.mx = 0;
    this.touch.my = 0;
    this.touch.buttons = {};
    this.mouse.down = false;
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

  _tickVisualEffects(dt) {
    this._killFlashT = Math.max(0, (this._killFlashT || 0) - dt * 2.4);

    for (const f of this.floatingTexts) {
      f.vy = Number.isFinite(f.vy) ? f.vy : -21;
      f.life = Number.isFinite(f.life) ? f.life : Math.max(0.01, (f.a || 1) / 0.9);
      f.y += f.vy * dt;
      f.a = clamp((f.a ?? 1) - dt * 0.9, 0, 1);
      f.life = Math.max(0, f.life - dt);
    }

    this.floatingTexts = this.floatingTexts.filter((f) => (f.a || 0) > 0 && (f.life || 0) > 0);
  }

  _handleMenus() {
    if (this.input.wasPressed("m") || this.input.wasPressed("M")) {
      this.menu.open = this.menu.open === "map" ? null : "map";
    }

    if (this.menu.open === "map") this._handleMapInput();
    if (this.menu.open === "quests") this._handleQuestInput();

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

    if (this.input.wasPressed("o") || this.input.wasPressed("O")) {
      this.menu.open = this.menu.open === "options" ? null : "options";
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

    if (this.menu.open) this._clearTouchState();
    if (this.menu.open === "dev") this._handleDevToolsInput();
  }

  _handleQuestInput() {
    this._handleQuestMouse();
    for (const [key, track] of QUEST_TRACKS) {
      if (!this.input.wasPressed(key)) continue;
      this._setTrackedObjective(track);
    }
  }

  _handleQuestMouse() {
    if (!this.mouse.clicked) return;
    const { w, h, rows } = this.getQuestPanelLayout();
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    const mx = this.mouse.x;
    const my = this.mouse.y;

    for (const row of rows) {
      const rowY = y + row.y;
      if (my < rowY || my > rowY + 18 || mx < x + 170 || mx > x + w - 18) continue;
      const slotW = (w - 194) / row.tracks.length;
      const idx = clamp(Math.floor((mx - (x + 176)) / slotW), 0, row.tracks.length - 1);
      this._setTrackedObjective(row.tracks[idx]);
      return;
    }
  }

  getQuestPanelLayout() {
    return {
      w: Math.min(Math.max(this.w - 120, 430), 560),
      h: QUEST_PANEL_HEIGHT,
      rows: [
        { y: 62, tracks: QUEST_TRACK_ROWS[0] },
        { y: 78, tracks: QUEST_TRACK_ROWS[1] },
      ],
    };
  }

  _setTrackedObjective(track, message) {
    const map = {
      story: "Tracking story",
      bounty: "Tracking bounty",
      town: "Tracking nearest town",
      dungeon: "Tracking dungeon",
      dragon: "Tracking dragon",
      treasure: "Tracking treasure",
      secret: "Tracking secrets",
    };
    this.trackedObjective = track;
    if (message !== null) this._msg(message || map[track] || `Tracking ${this._titleCase(track)}`, 0.9);
  }

  getQuestTrackHintLines() {
    const first = QUEST_TRACKS.slice(0, 4).map(([key, track]) => `${key} ${this._titleCase(track)}`);
    const second = QUEST_TRACKS.slice(4).map(([key, track]) => `${key} ${track === "secret" ? "Secrets" : this._titleCase(track)}`);
    return [
      first.join("  "),
      `${second.join("  ")}  (click to track)`,
    ];
  }

  getJournalStats() {
    return {
      towns: this.progress.visitedTowns?.size || 0,
      townsTotal: this.world.towns?.length || 0,
      waystones: this.progress.discoveredWaystones?.size || 0,
      waystonesTotal: this.world.waystones?.length || 0,
      bridges: this.progress.crossedBridges?.size || 0,
      bridgesTotal: this.world.bridges?.length || 0,
      dungeons: this.progress.dungeonBest || 0,
      dragons: this.progress.defeatedDragons?.size || 0,
      dragonsTotal: this.world.dragonLairs?.length || 0,
      secrets: this.progress.discoveredSecrets?.size || 0,
      secretsTotal: this.world.secrets?.length || 0,
    };
  }

  _handleMapInput() {
    const zoomIn = this.input.wasPressed("+") || this.input.wasPressed("=") || this.input.wasPressed("Add");
    const zoomOut = this.input.wasPressed("-") || this.input.wasPressed("_") || this.input.wasPressed("Subtract");
    const reset = this.input.wasPressed("0");

    if (zoomIn) {
      this._setMapZoom("in");
    } else if (zoomOut) {
      this._setMapZoom("out");
    } else if (reset) {
      this._setMapZoom("reset");
    }
  }

  _setMapZoom(mode) {
    const current = clamp(this.menu.mapZoom || 1, 1, 8);
    const next =
      mode === "in" ? Math.min(8, current * 2) :
      mode === "out" ? Math.max(1, current / 2) :
      1;
    if (next === current && mode !== "reset") return;
    this.menu.mapZoom = next;
    this._msg(mode === "reset" ? "Map zoom reset" : `Map zoom ${next}x`, 0.7);
  }

  _handleDevToolsInput() {
    this._handleDevToolsMouse();
    for (let i = 1; i <= DEV_TOOL_ACTION_COUNT; i++) {
      if (this.input.wasPressed(String(i))) this._runDevToolAction(i);
    }
  }

  _handleDevToolsMouse() {
    if (!this.mouse.clicked) return;
    const { w, x, y, rowStart, rowStep, rowInset } = this.getDevPanelLayout();
    const mx = this.mouse.x;
    const my = this.mouse.y;
    const row = Math.floor((my - (y + rowStart)) / rowStep);
    if (mx < x + rowInset || mx > x + w - rowInset || row < 0 || row >= DEV_TOOL_ACTION_COUNT) return;
    this._runDevToolAction(row + 1);
  }

  _runDevToolAction(action) {
    if (action === 1) {
      this.hero.hp = this.hero.maxHp || 100;
      this.hero.mana = this.hero.maxMana || 60;
      this._msg("Dev: healed", 0.9);
    }
    if (action === 2) {
      this.hero.gold += 250;
      this._msg("Dev: +250 gold", 0.9);
    }
    if (action === 3) {
      this.hero.giveXP?.(this.hero.nextXp || 25);
      this._msg("Dev: level boost", 0.9);
    }
    if (action === 4) {
      this.world.revealAll?.();
      this._msg("Dev: map revealed", 0.9);
    }
    if (action === 5) {
      this._spawnDragonBoss(this.hero.x + 220, this.hero.y, Math.max(6, (this.hero.level || 1) + 4), "Dev Dragon");
      this._msg("Dev: dragon spawned", 0.9);
    }
    if (action === 6) {
      const dock = this._nearest(this.world.docks);
      if (dock) {
        this.hero.x = dock.x - 56;
        this.hero.y = dock.y + 18;
        this.camera.x = this.hero.x;
        this.camera.y = this.hero.y;
        this._msg("Dev: nearest dock", 0.9);
      }
    }
    if (action === 7) {
      this.dev.godMode = !this.dev.godMode;
      if (this.dev.godMode) {
        this.hero.hp = this.hero.maxHp || 100;
        this.hero.mana = this.hero.maxMana || 60;
      }
      this._msg(this.dev.godMode ? "Dev: god mode ON" : "Dev: god mode OFF", 1.1);
    }
    if (action === 8) {
      this._devEquipBestGear();
    }
    if (action === 9) {
      if (!this._isDevResetConfirmLive()) {
        this._devResetConfirmAt = Date.now();
        this._msg("Dev: press 9 again to reset", 1.4);
        return;
      }
      this._devResetConfirmAt = 0;
      this._devResetGame();
    }
  }

  getDevToolLines() {
    return [
      "1 heal HP and mana",
      "2 add 250 gold",
      "3 grant one level worth of XP",
      "4 reveal entire world map",
      "5 spawn a dragon nearby",
      "6 teleport near closest dock",
      `7 god mode ${this.dev?.godMode ? "ON" : "OFF"}`,
      "8 equip mythic best gear",
      this._isDevResetConfirmLive() ? "9 reset to a new game (press again now)" : "9 reset to a new game (confirm)",
      `Explored cells: ${this.world?.exportDiscovery?.()?.length || 0}`,
      `World span: ${((this.world?.mapHalfSize || 0) * 2).toLocaleString()} units`,
    ];
  }

  getDevPanelLayout() {
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 340;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    return {
      w,
      h,
      x,
      y,
      rowStart: 70,
      rowStep: 22,
      rowInset: 20,
    };
  }

  getSkillPanelData() {
    const defs = this.skillDefs || {};
    const prog = this.skillProg || {};
    const cooldowns = this.cooldowns || {};
    const heroMana = this.hero?.mana || 0;
    const heroMaxMana = this.hero?.maxMana || 0;

    return {
      manaText: `Mana ${Math.round(heroMana)}/${Math.round(heroMaxMana)}`,
      legendText: "Green ready   amber cooling down   red low mana",
      oathText: `Oath: ${this._className?.() || "Knight"}`,
      rows: SKILL_PANEL_ORDER.map((key) => {
        const def = defs[key] || {};
        const s = prog[key] || { xp: 0, level: 1 };
        const need = 10 + ((s.level || 1) - 1) * 8;
        const xp = s.xp || 0;
        const remainingCd = Math.max(0, cooldowns[key] || 0);
        const baseCd = Math.max(0.01, +def.cd || 1);
        const affordable = heroMana >= (def.mana || 0);
        const statusText = remainingCd > 0.01 ? `${remainingCd.toFixed(1)}s left` : affordable ? "Ready" : "Low mana";
        const statusColor = remainingCd > 0.01 ? "#ffd98a" : affordable ? "#94e48d" : "#ff9c9c";
        return {
          key,
          name: def.name || "Skill",
          color: def.color || "#dbe7ff",
          manaCost: def.mana || 0,
          manaText: `Mana ${def.mana || 0}`,
          cooldownText: `Cooldown ${(+def.cd || 0).toFixed(1)}s`,
          cooldownValue: remainingCd,
          cooldownFrac: clamp(remainingCd / baseCd, 0, 1),
          levelText: `Level ${s.level || 1}`,
          statusText,
          statusColor,
          affordable,
          xpText: `XP ${xp} / ${need}`,
          infoText: this._skillUpgradeSummary?.(key, s.level || 1) || "Balanced scaling",
          xpFrac: clamp(xp / Math.max(1, need), 0, 1),
        };
      }),
    };
  }

  getSkillPanelLayout() {
    const w = Math.min(Math.max(this.w - 110, 520), 620);
    const h = Math.min(Math.max(this.h - 120, 360), 400);
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    return {
      w,
      h,
      x,
      y,
      rowStart: 98,
      rowStep: 74,
      rowHeight: 58,
      rowInset: 18,
    };
  }

  getSpellBarLayout() {
    const box = 46;
    const gap = 10;
    const total = box * SKILL_PANEL_ORDER.length + gap * (SKILL_PANEL_ORDER.length - 1);
    return {
      box,
      gap,
      total,
      x: ((this.w - total) / 2) | 0,
      y: this.h - 62,
      inset: 5,
    };
  }

  _isDevResetConfirmLive() {
    return !!(this._devResetConfirmAt && Date.now() - this._devResetConfirmAt <= DEV_RESET_CONFIRM_MS);
  }

  _devEquipBestGear() {
    const slots = EQUIPMENT_SLOTS;
    const level = Math.max(18, (this.hero.level || 1) + 10);
    for (let i = 0; i < slots.length; i++) {
      const item = makeGear(slots[i], level, "epic", hash2(this.seed, i + 8800, level));
      item.name = `Mythic ${item.name}`;
      this.hero.equip[slots[i]] = item;
    }

    const stats = this.hero.getStats?.() || {};
    this.hero.maxHp = stats.maxHp || this.hero.maxHp || 100;
    this.hero.maxMana = stats.maxMana || this.hero.maxMana || 60;
    this.hero.hp = this.hero.maxHp;
    this.hero.mana = this.hero.maxMana;
    this._msg("Dev: mythic gear equipped", 1.2);
  }

  _devResetGame() {
    this.save.clear?.();
    this.seed = (Date.now() & 0x7fffffff) | 0;
    this.world = new World(this.seed, { viewW: this.w, viewH: this.h });
    const start = this.world.getStarterPoint?.() || this.world.spawn || { x: 0, y: 0 };
    this.hero = new Hero(start.x, start.y);
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.hitSparks = [];
    this.floatingTexts = [];
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
      discoveredSecrets: new Set(),
      defeatedDragons: new Set(),
      relicShards: 0,
      storyMilestones: {},
      visitedTowns: new Set(),
      crossedBridges: new Set(),
    };
    this.hero.classId = "knight";
    this.dungeon = { active: false, floor: 0, origin: null, room: null, roomIndex: 0, totalRooms: 0, roomRewarded: false };
    this.menu.open = null;
    this.menu.mapZoom = 1;
    this.trackedObjective = "story";
    this._cachedNearbyCamp = null;
    this._cachedNearbyTown = null;
    this._cachedNearbyWaystone = null;
    this._cachedNearbyShrine = null;
    this._cachedNearbyCache = null;
    this._cachedNearbySecret = null;
    this._cachedNearbyDragonLair = null;
    this._cachedNearbyDungeon = null;
    this._cachedNearbyDock = null;
    this.invIndex = 0;
    this.quest = this._makeBountyQuest();
    this._lastHeroLevel = this.hero.level || 1;
    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;
    this._spawnInitialEnemies();
    this.world.revealAround?.(this.hero.x, this.hero.y, 900);
    this._saveGame();
    this._msg("Dev: new game reset", 1.3);
  }

  _handleMovement(dt) {
    let mx = 0;
    let my = 0;

    if (this.input.isDown("ArrowUp")) my -= 1;
    if (this.input.isDown("ArrowDown")) my += 1;
    if (this.input.isDown("ArrowLeft")) mx -= 1;
    if (this.input.isDown("ArrowRight")) mx += 1;
    if (this.touch?.moveId != null) {
      mx += this.touch.mx || 0;
      my += this.touch.my || 0;
    }

    const move = norm(mx, my);
    const speed = this.hero.getMoveSpeed(this);

    this.hero.vx = move.x * speed;
    this.hero.vy = move.y * speed;

    const nx = this.hero.x + this.hero.vx * dt;
    const ny = this.hero.y + this.hero.vy * dt;

    if (this._canHeroMoveTo(nx, ny)) {
      this.hero.x = nx;
      this.hero.y = ny;
      return;
    }

    if (this._canHeroMoveTo(nx, this.hero.y)) this.hero.x = nx;
    if (this._canHeroMoveTo(this.hero.x, ny)) this.hero.y = ny;
  }

  _applyTerrainEffects(dt) {
    if (this.dungeon.active || !this.world || !this.hero) return;
    this._terrainFxT = Math.max(0, (this._terrainFxT || 0) - dt);
    if (this._terrainFxT > 0) return;
    this._terrainFxT = 0.42;

    const info = this.world.getZoneInfo?.(this.hero.x, this.hero.y);
    const zone = String(info?.zone || info?.name || "").toLowerCase();
    if (!zone) return;

    if (zone === "meadow" || zone === "whisper grass" || zone === "old fields") {
      if ((this.hero.hp || 0) < (this.hero.maxHp || 0)) {
        this.hero.hp = Math.min(this.hero.maxHp || 0, (this.hero.hp || 0) + 1);
      }
    } else if (zone === "greenwood" || zone === "forest" || zone === "deep wilds") {
      if ((this.hero.mana || 0) < (this.hero.maxMana || 0)) {
        this.hero.mana = Math.min(this.hero.maxMana || 0, (this.hero.mana || 0) + 1);
      }
    }
  }

  _canHeroMoveTo(x, y) {
    if (this.dungeon.active) return this._canMoveInDungeon(x, y);
    return this.world.canWalk(x, y, this.hero);
  }

  _canMoveInDungeon(x, y) {
    const room = this.dungeon.room || { x: this.hero.x, y: this.hero.y, w: 760, h: 520 };
    return x > room.x - room.w * 0.5 + 42 &&
      x < room.x + room.w * 0.5 - 42 &&
      y > room.y - room.h * 0.5 + 42 &&
      y < room.y + room.h * 0.5 - 42;
  }

  _handleSkills() {
    if (this.input.wasPressed("1")) this._usePotion("hp");
    if (this.input.wasPressed("2")) this._usePotion("mana");

    if (this.input.wasPressed("q") || this.input.wasPressed("Q")) this._castSpark();
    if (this.input.wasPressed("w") || this.input.wasPressed("W")) this._castNova();
    if (this.input.wasPressed("e") || this.input.wasPressed("E")) this._castBlink();
    if (this.input.wasPressed("r") || this.input.wasPressed("R")) this._castOrb();

    if (this.mouse.down) this._castSpark();
    if (this.touch?.buttons?.q != null) this._castSpark();
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

    this._handleInventoryMouse(inv);

    if (this.input.wasPressed("ArrowDown")) {
      this.invIndex = Math.min(inv.length - 1, (this.invIndex || 0) + 1);
    }

    if (this.input.wasPressed("ArrowUp")) {
      this.invIndex = Math.max(0, (this.invIndex || 0) - 1);
    }

    const item = inv[this.invIndex];

    if ((this.input.wasPressed("Enter") || this.input.wasPressed("e") || this.input.wasPressed("E")) && item) {
      this._runInventoryAction("equip", this.invIndex);
    }

    if ((this.input.wasPressed("x") || this.input.wasPressed("X") || this.input.wasPressed("Backspace") || this.input.wasPressed("Delete")) && item) {
      this._runInventoryAction("salvage", this.invIndex);
    }
  }

  _handleInventoryMouse(inv) {
    const layout = this.getInventoryPanelLayout();
    const leftX = layout.leftX;
    const leftY = layout.leftY;
    const leftW = layout.leftW;
    const leftH = layout.leftH;
    const rowH = layout.rowH;
    const visible = Math.max(1, Math.floor((leftH - 40) / rowH));
    const selected = clamp(this.invIndex || 0, 0, Math.max(0, inv.length - 1));
    const scroll = clamp(selected - visible + 1, 0, Math.max(0, inv.length - visible));
    const mx = this.mouse.x;
    const my = this.mouse.y;
    const inList = mx >= leftX + 8 && mx <= leftX + leftW - 8 && my >= leftY + 16 && my <= leftY + leftH - 8;
    if (!inList) return;

    const row = Math.floor((my - (leftY + 18)) / rowH);
    const idx = scroll + row;
    if (idx < 0 || idx >= inv.length) return;

    if (this.mouse.clicked && idx === selected) {
      this._runInventoryAction("equip", idx);
      return;
    }

    this.invIndex = idx;
    if (this.mouse.clicked) this._msg(`${inv[idx]?.name || "Item"} selected`, 0.55);
  }

  _runInventoryAction(action, index) {
    if (action === "equip") this._equipInventoryItem(index);
    else if (action === "salvage") this._salvageInventoryItem(index);
  }

  getInventoryPanelText(hasItems = (this.hero?.inventory?.length || 0) > 0) {
    return {
      headerHint: hasItems ? "I or Esc close   wheel/arrow select   click again equip" : "I or Esc close",
      emptyBagTitle: "No gear in your bag yet.",
      emptyBagBody: "Clear camps, shops, contracts, and dungeons will start filling it.",
      emptyDetailTitle: "Item Details",
      emptyDetailBody: "Pick up gear to compare it here.",
      emptyDetailNote: "Your equipped kit will stay visible above while the bag is empty.",
      equipHint: "Enter/E or click again equip",
      salvageHint: "X/Delete salvage",
    };
  }

  getInventoryPanelLayout() {
    const panelW = Math.min(Math.max(this.w - 90, 700), 860);
    const panelH = Math.min(Math.max(this.h - 90, 430), 540);
    const x = ((this.w - panelW) / 2) | 0;
    const y = ((this.h - panelH) / 2) | 0;
    return {
      panelW,
      panelH,
      x,
      y,
      leftX: x + 18,
      leftY: y + 74,
      leftW: 370,
      leftH: panelH - 92,
      rowH: 28,
    };
  }

  getEquipmentSlots() {
    return EQUIPMENT_SLOTS;
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
    const delta = (item.score || 0) - (prev?.score || 0);
    const note = prev ? ` ${delta >= 0 ? "+" : ""}${delta} power` : "";
    this._msg(`Equipped ${item.name}${note}`, 1.6);
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
    this._handleShopMouse();
    for (let i = 1; i <= SHOP_ACTION_COUNT; i++) {
      if (this.input.wasPressed(String(i))) this._runShopAction(i);
    }
  }

  _handleShopMouse() {
    if (!this.mouse.clicked) return;
    const layout = this.getShopPanelLayout();
    const w = layout.w;
    const x = layout.x;
    const y = layout.y;
    const mx = this.mouse.x;
    const my = this.mouse.y;
    if (mx < x + 16 || mx > x + w - 16) return;

    for (let i = 0; i < SHOP_ACTION_COUNT; i++) {
      const rowY = y + layout.rowStart + i * layout.rowStep;
      if (my >= rowY - 16 && my <= rowY + 16) {
        this._runShopAction(i + 1);
        return;
      }
    }
  }

  _runShopAction(action) {
    const index = (action | 0) - 1;
    if (index < 0 || index >= SHOP_ACTION_COUNT) return;
    this._buyShopItem(index);
  }

  _handleTownInput() {
    this._handleTownMouse();
    for (let i = 1; i <= TOWN_ACTION_COUNT; i++) {
      if (this.input.wasPressed(String(i))) this._runTownAction(i);
    }
  }

  _handleTownMouse() {
    if (!this.mouse.clicked) return;
    const layout = this.getTownPanelLayout();
    const w = layout.w;
    const x = layout.x;
    const y = layout.y;
    const mx = this.mouse.x;
    const my = this.mouse.y;
    if (mx < x + 18 || mx > x + w - 18 || my < y + layout.actionTop || my > y + layout.actionBottom) return;

    const row = Math.floor((my - (y + layout.rowStart)) / layout.rowStep);
    if (row >= 0 && row < TOWN_ACTION_COUNT) this._runTownAction(row + 1);
  }

  _runTownAction(action) {
    if (action === 1) this._townRest();
    else if (action === 2) this._townBuyPotion("hp");
    else if (action === 3) this._townBuyPotion("mana");
    else if (action === 4) this._townCommissionGear();
    else if (action === 5) this._townAskRumor();
    else if (action === 6) this._townCycleOath();
    else if (action === 7) this._townTakeContract();
    else if (action === 8) this._townBuyMapClue();
    else if (action === 9) this._townBuyPassage();
  }

  getTownMenuLines(town = this._cachedNearbyTown) {
    const npcs = town?.npcs || ["Warden", "Smith", "Archivist"];
    const visited = !!(town && this.progress?.visitedTowns?.has?.(String(town.id)));
    const restCost = Math.max(0, Math.min(28, 8 + (this.hero?.level || 1) * 2));
    const forgeCost = 58 + (this.hero?.level || 1) * 9;
    const clueCost = 36 + (this.hero?.level || 1) * 4;
    const passage = this._getTownPassageInfo(town);
    return {
      npcs,
      lines: [
        `1 Rest at inn (${restCost}g)`,
        "2 Buy health potion (18g)",
        "3 Buy mana potion (22g)",
        `4 Commission townforged gear (${forgeCost}g)`,
        "5 Ask for a rumor objective",
        "6 Change oath / class",
        "7 Take town contract",
        `8 Buy cartographer clue (${clueCost}g)`,
        passage.available
          ? `9 Pay passage to ${passage.destinationName} (${passage.cost}g)`
          : town?.coastal
            ? "9 Harbor route unavailable"
            : "9 No harbor in this town",
        visited ? `${npcs[0]}: Roads are safer when camps are cleared.` : `${npcs[0]}: First visit supplies were added.`,
      ],
      npcSummary: `${npcs.join(", ")} are available. Current oath: ${this._className?.() || "Knight"}.${town?.coastal ? " Harbor passage is available here." : ""}`,
    };
  }

  getTownPanelLayout() {
    const w = Math.min(Math.max(this.w - 120, 430), 560);
    const h = 376;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    return {
      w,
      h,
      x,
      y,
      actionTop: 82,
      actionBottom: 304,
      rowStart: 91,
      rowStep: 21,
    };
  }

  _className(id = this.hero?.classId) {
    const names = { knight: "Knight", ranger: "Ranger", arcanist: "Arcanist", raider: "Raider" };
    return names[id] || "Knight";
  }

  _classSkillInfo(key, classId = this.hero?.classId || "knight") {
    const info = {
      knight: {
        w: "Nova radius +14%",
        e: "Blink grants longer guard",
      },
      ranger: {
        q: "Spark speed +14%",
        e: "Blink distance +18%",
      },
      arcanist: {
        q: "Spark damage +12%",
        w: "Nova radius +20%",
        r: "Orb damage +16%",
      },
      raider: {
        q: "Spark damage +8%",
        e: "Blink distance +24%",
        r: "Orb speed +12%",
      },
    };
    return info[classId]?.[key] || "Balanced scaling";
  }

  _skillUpgradeSummary(key, level = 1) {
    const lines = {
      q: [
        "Single bolt",
        "Single bolt",
        "Single bolt",
        "Single bolt",
        "Two-shot spread",
        "Two-shot spread",
        "Two-shot spread",
        "Two-shot spread",
        "Two-shot spread",
        "Three-shot spread",
      ],
      w: [
        "Close shock ring",
        "Close shock ring",
        "Close shock ring",
        "Close shock ring",
        "Slow shock ring",
        "Slow shock ring",
        "Slow shock ring",
        "Slow shock ring",
        "Slow shock ring",
        "Wide lingering shock ring",
      ],
      e: [
        "Short blink",
        "Short blink",
        "Short blink",
        "Short blink",
        "Long river blink",
        "Long river blink",
        "Long river blink",
        "Long river blink",
        "Long river blink",
        "Blink landing burst",
      ],
      r: [
        "Arcane orb",
        "Arcane orb",
        "Arcane orb",
        "Arcane orb",
        "Piercing orb",
        "Piercing orb",
        "Piercing orb",
        "Piercing orb",
        "Piercing orb",
        "Bursting orb",
      ],
    };
    const bucket = lines[key] || [];
    return bucket[Math.max(0, Math.min(bucket.length - 1, (level | 0) - 1))] || "Balanced scaling";
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
    const sparkLevel = Math.max(1, this.skillProg.q?.level || 1);
    const hit = this._rollHeroDamage((this.hero.classId === "arcanist" ? 1.06 : this.hero.classId === "raider" ? 1.02 : 0.95));
    const sparkSpeed = (this.hero.classId === "ranger" ? 308 : 270) * (1 + Math.min(0.12, Math.floor((sparkLevel - 1) / 5) * 0.06));
    const pierce = sparkLevel >= 10 ? 1 : 0;
    const shotCount = sparkLevel >= 10 ? 3 : sparkLevel >= 5 ? 2 : 1;
    const angles = shotCount === 3 ? [0, -0.18, 0.18] : shotCount === 2 ? [-0.09, 0.09] : [0];

    for (const angleOffset of angles) {
      const ca = Math.cos(angleOffset);
      const sa = Math.sin(angleOffset);
      const vx = dir.x * ca - dir.y * sa;
      const vy = dir.x * sa + dir.y * ca;
      this.projectiles.push(
        new Projectile(
          this.hero.x + vx * 18,
          this.hero.y + vy * 18,
          vx * sparkSpeed,
          vy * sparkSpeed,
          hit.dmg,
          1.25 + (sparkLevel >= 10 ? 0.12 : 0),
          this.hero.level,
          { friendly: true, color: "rgba(148,225,255,0.95)", radius: 4, hitRadius: 15, pierce }
        )
      );
      this.projectiles[this.projectiles.length - 1].crit = hit.crit;
    }

    this.skillProg.q.xp += 1;
    this._checkSkillLevel("q");
  }

  _castNova() {
    if (this.cooldowns.w > 0) return;
    const def = this.skillDefs.w;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.w = def.cd;

    const novaLevel = Math.max(1, this.skillProg.w?.level || 1);
    const hit = this._rollHeroDamage(this.hero.classId === "arcanist" ? 1.18 : 1.1);
    const baseRadius = this.hero.classId === "arcanist" ? 103 : this.hero.classId === "knight" ? 98 : 86;
    const novaRadius = baseRadius + (novaLevel >= 10 ? 34 : novaLevel >= 5 ? 16 : 0);
    const slow = novaLevel >= 10 ? 0.65 : novaLevel >= 5 ? 0.42 : 0;
    const novaLife = novaLevel >= 10 ? 0.6 : novaLevel >= 5 ? 0.5 : 0.45;
    const knockback = novaLevel >= 10 ? 96 : 0;

    this.projectiles.push(
      new Projectile(
        this.hero.x,
        this.hero.y,
        0,
        0,
        hit.dmg,
        novaLife,
        this.hero.level,
        {
          friendly: true,
          nova: true,
          color: "rgba(214,245,255,0.92)",
          radius: 14,
          hitRadius: novaRadius,
          ignoreWalls: true,
          slow,
          knockback,
        }
      )
    );
    this.projectiles[this.projectiles.length - 1].crit = hit.crit;

    this.skillProg.w.xp += 2;
    this._checkSkillLevel("w");
  }

  _castBlink() {
    if (this.cooldowns.e > 0) return;
    const def = this.skillDefs.e;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.e = def.cd;

    const dir = norm(
      this.hero.aimDir?.x || this.hero.lastMove?.x || 1,
      this.hero.aimDir?.y || this.hero.lastMove?.y || 0
    );

    const blinkLevel = Math.max(1, this.skillProg.e?.level || 1);
    const classDashMul = this.hero.classId === "raider" ? 1.24 : this.hero.classId === "ranger" ? 1.18 : 1;
    const dashDist = (blinkLevel >= 10 ? 182 : blinkLevel >= 5 ? 122 : 68) * classDashMul;
    const tx = this.hero.x + dir.x * dashDist;
    const ty = this.hero.y + dir.y * dashDist;

    if (this._canDashTo(tx, ty, dir, dashDist, blinkLevel)) {
      this.hero.x = tx;
      this.hero.y = ty;
      if (blinkLevel >= 5 && !this.dungeon.active) this._spawnFloatingText(this.hero.x, this.hero.y - 28, "River blink", "#ffd36e");
      if (blinkLevel >= 10) {
        const burstDmg = Math.max(1, Math.round((this.hero.getStats?.().dmg || 8) * 0.8));
        this._spawnSpellBurst(this.hero.x, this.hero.y, 72, burstDmg, "rgba(255,211,110,0.88)", {
          life: 0.26,
          slow: 0.35,
        });
      }
    }

    this.hero.state.dashT = (0.20 + Math.min(0.18, (blinkLevel - 1) * 0.02)) + (this.hero.classId === "knight" ? 0.08 : 0);
    this.skillProg.e.xp += 2;
    this._checkSkillLevel("e");
  }

  _canDashTo(tx, ty, dir, dashDist, dashLevel) {
    if (this.dungeon.active) return this._canMoveInDungeon(tx, ty);

    const canCrossWater = dashLevel >= 5;
    const steps = Math.max(2, Math.ceil(dashDist / 22));
    for (let i = 1; i <= steps; i++) {
      const px = this.hero.x + dir.x * dashDist * (i / steps);
      const py = this.hero.y + dir.y * dashDist * (i / steps);
      const s = this.world._sampleCell?.(px, py);
      if (!s) return false;
      if (s.isWater && !s.bridge && !canCrossWater) return false;
      if (!s.isWater && !this.world.canWalk(px, py, this.hero)) return false;
    }

    if (this.world.canWalk(tx, ty, this.hero)) return true;
    return false;
  }

  _drawDungeonRoom(ctx) {
    const room = this.dungeon.room || { x: this.hero.x, y: this.hero.y, w: 780, h: 540, seed: 1 };
    const x = room.x - room.w * 0.5;
    const y = room.y - room.h * 0.5;

    ctx.save();
    ctx.fillStyle = "#0f1217";
    ctx.fillRect(x - 900, y - 700, room.w + 1800, room.h + 1400);

    const floorLevel = Math.max(1, this.dungeon.floor || 1);
    const bossDepth = !!room.finalRoom;
    const theme = this._dungeonTheme(floorLevel);
    const aliveCount = this.enemies.reduce((n, e) => n + (e?.alive ? 1 : 0), 0);
    const clear = aliveCount <= 0;
    const floor = ctx.createLinearGradient(x, y, x, y + room.h);
    floor.addColorStop(0, bossDepth ? "#30202a" : theme.floor0);
    floor.addColorStop(0.5, bossDepth ? "#211823" : theme.floor1);
    floor.addColorStop(1, theme.floor2);
    ctx.fillStyle = floor;
    ctx.fillRect(x, y, room.w, room.h);

    ctx.fillStyle = bossDepth ? "rgba(255,98,70,0.06)" : theme.haze;
    for (let i = 0; i < 7; i++) {
      const px = x + 80 + ((i * 173 + floorLevel * 29) % Math.max(1, room.w - 160));
      const py = y + 76 + ((i * 97 + floorLevel * 41) % Math.max(1, room.h - 150));
      ctx.beginPath();
      ctx.ellipse(px, py, 34 + (i % 3) * 12, 10 + (i % 2) * 8, (i * 0.7) % Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    for (let tx = x + 32; tx < x + room.w; tx += 48) {
      ctx.beginPath();
      ctx.moveTo(tx, y + 16);
      ctx.lineTo(tx, y + room.h - 16);
      ctx.stroke();
    }
    for (let ty = y + 32; ty < y + room.h; ty += 48) {
      ctx.beginPath();
      ctx.moveTo(x + 16, ty);
      ctx.lineTo(x + room.w - 16, ty);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(x, y, room.w, 34);
    ctx.fillRect(x, y + room.h - 34, room.w, 34);
    ctx.fillRect(x, y, 34, room.h);
    ctx.fillRect(x + room.w - 34, y, 34, room.h);

    ctx.strokeStyle = bossDepth ? "rgba(255,138,92,0.34)" : theme.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 33.5, y + 33.5, room.w - 67, room.h - 67);

    const northGate = this._getDungeonExitAnchor("north", room);
    const southGate = this._getDungeonExitAnchor("south", room);
    const gateW = 118;
    const gateH = 34;
    const drawGate = (gate, label, active, topSide) => {
      const gy = topSide ? y + 22 : y + room.h - 56;
      ctx.fillStyle = active ? "rgba(139,233,255,0.18)" : "rgba(18,24,31,0.88)";
      ctx.fillRect(gate.x - gateW * 0.5, gy, gateW, gateH);
      ctx.strokeStyle = active ? (topSide && bossDepth ? "rgba(255,138,92,0.72)" : "rgba(139,233,255,0.72)") : "rgba(255,255,255,0.10)";
      ctx.lineWidth = 2;
      ctx.strokeRect(gate.x - gateW * 0.5 + 0.5, gy + 0.5, gateW - 1, gateH - 1);
      ctx.fillStyle = active ? "#eaf8ff" : "#8493a6";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(label, gate.x, gy + 21);
    };
    drawGate(northGate, clear ? (bossDepth ? "Victory Gate" : "Next Room") : "Locked Gate", clear, true);
    drawGate(southGate, clear ? "Return Gate" : "Sealed Exit", clear, false);

    const rng = new RNG(room.seed || 1);
    for (let i = 0; i < 12; i++) {
      const px = x + 90 + rng.next() * (room.w - 180);
      const py = y + 80 + rng.next() * (room.h - 160);
      ctx.fillStyle = "rgba(0,0,0,0.26)";
      ctx.fillRect(px - 13, py + 9, 26, 6);
      ctx.fillStyle = i % 3 === 0 ? theme.propA : theme.propB;
      ctx.fillRect(px - 10, py - 10, 20, 22);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(px - 9, py - 10, 18, 4);
    }

    const sx = room.x;
    const sy = y + 86;
    ctx.fillStyle = clear ? "rgba(139,233,255,0.22)" : "rgba(220,124,255,0.20)";
    ctx.beginPath();
    ctx.arc(sx, sy, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = clear ? "#8be9ff" : "#dc7cff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f1d8ff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(clear ? "C" : `${aliveCount}`, sx, sy + 4);

    ctx.fillStyle = "rgba(240,226,255,0.88)";
    ctx.font = "bold 13px Arial";
    ctx.fillText(`${theme.name} - Room ${room.roomIndex || 1}/${room.totalRooms || 1}`, room.x, y + room.h - 18);
    ctx.font = "11px Arial";
    ctx.fillStyle = "rgba(214,225,239,0.76)";
    ctx.fillText(clear ? (bossDepth ? "Use the north gate to finish or south gate to retreat" : "North gate goes deeper, south gate returns outside") : "Clear the room to open the gates", room.x, y + room.h - 36);
    ctx.restore();
  }

  _dungeonTheme(floor = 1) {
    const themes = [
      {
        name: "Ash Crypt",
        floor0: "#28262b",
        floor1: "#1d1d23",
        floor2: "#12151b",
        haze: "rgba(255,137,86,0.038)",
        accent: "rgba(255,152,104,0.28)",
        propA: "#4e3f3b",
        propB: "#35363f",
        enemies: ["ashling", "brute", "wisp", "sentinel"],
      },
      {
        name: "Moon Vault",
        floor0: "#202a38",
        floor1: "#171e2d",
        floor2: "#101722",
        haze: "rgba(126,224,255,0.04)",
        accent: "rgba(126,224,255,0.30)",
        propA: "#38465a",
        propB: "#263140",
        enemies: ["wisp", "caster", "duelist", "mender"],
      },
      {
        name: "Root Hall",
        floor0: "#253225",
        floor1: "#19251c",
        floor2: "#111914",
        haze: "rgba(128,218,91,0.04)",
        accent: "rgba(143,222,122,0.28)",
        propA: "#3e5638",
        propB: "#2f3e32",
        enemies: ["thorn", "wolf", "mender", "stalker"],
      },
      {
        name: "Iron Sepulcher",
        floor0: "#2a2d33",
        floor1: "#1d2027",
        floor2: "#12161d",
        haze: "rgba(200,192,162,0.035)",
        accent: "rgba(200,192,162,0.30)",
        propA: "#4b5260",
        propB: "#343a44",
        enemies: ["sentinel", "brute", "duelist", "caster"],
      },
    ];
    return themes[Math.abs((floor | 0) - 1) % themes.length];
  }

  _castOrb() {
    if (this.cooldowns.r > 0) return;
    const def = this.skillDefs.r;
    if (!this.hero.spendMana(def.mana)) return;

    this.cooldowns.r = def.cd;

    const orbLevel = Math.max(1, this.skillProg.r?.level || 1);
    const dir = norm(this.hero.aimDir?.x || 1, this.hero.aimDir?.y || 0);
    const hit = this._rollHeroDamage(this.hero.classId === "arcanist" ? 1.92 : 1.65);
    const orbSpeed = (this.hero.classId === "raider" ? 196 : 175) + (orbLevel >= 10 ? 28 : orbLevel >= 5 ? 14 : 0);
    const orbPierce = orbLevel >= 10 ? 2 : orbLevel >= 5 ? 1 : 0;
    const burstRadius = orbLevel >= 10 ? 72 : orbLevel >= 5 ? 0 : 0;

    this.projectiles.push(
      new Projectile(
        this.hero.x + dir.x * 22,
        this.hero.y + dir.y * 22,
        dir.x * orbSpeed,
        dir.y * orbSpeed,
        hit.dmg,
        1.7 + (orbLevel >= 3 ? 0.18 : 0),
        this.hero.level,
        {
          friendly: true,
          color: "rgba(198,140,255,0.95)",
          radius: 8 + (orbLevel >= 5 ? 1 : 0),
          hitRadius: 20 + (orbLevel >= 5 ? 4 : 0),
          pierce: orbPierce,
          burstRadius,
          burstColor: "rgba(214,176,255,0.92)",
          burstSlow: orbLevel >= 10 ? 0.55 : 0.35,
        }
      )
    );
    this.projectiles[this.projectiles.length - 1].crit = hit.crit;

    this.skillProg.r.xp += 3;
    this._checkSkillLevel("r");
  }

  _spawnSpellBurst(x, y, hitRadius, dmg, color, opts = {}) {
    this.projectiles.push(
      new Projectile(
        x,
        y,
        0,
        0,
        dmg,
        opts.life || 0.32,
        this.hero.level,
        {
          friendly: true,
          nova: true,
          color: color || "rgba(214,245,255,0.92)",
          radius: opts.radius || 12,
          hitRadius,
          ignoreWalls: true,
          slow: opts.slow || 0,
        }
      )
    );
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
      const name = this.skillDefs[key]?.name || "Skill";
      this._spawnFloatingText(this.hero.x, this.hero.y - 54, `${name} Lv ${s.level}`, this.skillDefs[key]?.color || "#b7ceff");
      this._msg(`${name} upgraded to Lv ${s.level}`, 1.5);
    }
  }

  _checkHeroLevelFeedback() {
    const level = this.hero.level || 1;
    const prev = this._lastHeroLevel || level;
    if (level <= prev) {
      this._lastHeroLevel = level;
      return;
    }

    this._lastHeroLevel = level;
    this._killFlashT = Math.max(this._killFlashT || 0, 0.5);
    this._spawnFloatingText(this.hero.x, this.hero.y - 72, `LEVEL ${level}`, "#ffd86e");
    this._msg(`Level up! Lv ${level} - HP and Mana restored`, 2.2);
  }

  _spawnInitialEnemies() {
    const camps = (this.world.camps || [])
      .map((camp) => ({ camp, d: dist2(this.hero.x, this.hero.y, camp.x, camp.y) }))
      .filter((v) => v.d > 560 * 560)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((v) => v.camp);

    for (const camp of camps) {
      for (let i = 0; i < 3; i++) {
        const enemy = this._spawnEnemyNearCamp(camp, i);
        if (enemy) this.enemies.push(enemy);
      }
    }

    const pool = ["wolf", "scout", "thorn", "duelist"];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const rr = 860 + (i % 3) * 90;
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
      const pool = ["stalker", "caster", "brute", "ashling", "wolf", "wisp", "duelist", "sentinel", "mender"];
      return pool[Math.floor(Math.random() * pool.length)] || "stalker";
    }
    if (z.includes("wild")) return this._pickFrom(["wolf", "stalker", "thorn", "duelist"]);
    if (z.includes("stone")) return this._pickFrom(["brute", "sentinel", "blob", "wisp"]);
    if (z.includes("ash")) return this._pickFrom(["ashling", "brute", "wisp", "sentinel"]);
    if (z.includes("shore")) return this._pickFrom(["scout", "caster", "wisp", "thorn"]);
    if (z.includes("forest") || z.includes("greenwood")) return this._pickFrom(["wolf", "scout", "thorn", "mender"]);

    const pool = ["blob", "wolf", "stalker", "scout", "caster", "brute", "wisp", "thorn", "duelist"];
    return pool[(Math.random() * pool.length) | 0];
  }

  _pickFrom(pool) {
    return pool[(Math.random() * pool.length) | 0] || pool[0] || "blob";
  }

  _campEnemyPool(camp) {
    const type = String(camp?.type || "").toLowerCase();
    if (type === "bandit") return ["scout", "duelist", "caster", "brute", "mender"];
    if (type === "beast") return ["wolf", "stalker", "thorn", "wisp"];
    if (type === "cult") return ["ashling", "caster", "wisp", "mender", "brute"];
    if (type === "wild") return ["thorn", "wolf", "scout", "mender"];
    if (type === "stone") return ["sentinel", "brute", "wisp", "caster"];
    return ["scout", "wolf", "thorn", "duelist", "mender", "sentinel", "caster"];
  }

  _spawnWorldEnemies(dt) {
    this._spawnTimer -= dt;
    if (this._spawnTimer > 0) return;
    this._spawnTimer = 1.25;

    if (this.enemies.length >= this.perf.maxEnemies) return;
    if (this.dungeon.active) return;
    if (Math.random() > 0.34) return;

    const camp = this._nearest(this.world.camps, (p) => {
      const d2 = dist2(this.hero.x, this.hero.y, p.x, p.y);
      return d2 > 520 * 520 && d2 < 1800 * 1800;
    });
    if (!camp) return;

    let tries = 0;
    while (tries++ < 5 && this.enemies.length < this.perf.maxEnemies) {
      const e = this._spawnEnemyNearCamp(camp, tries);
      if (!e) continue;
      this.enemies.push(e);
      break;
    }
  }

  _respawnCampEnemies(dt) {
    this._campRespawnT -= dt;
    if (this._campRespawnT > 0) return;
    this._campRespawnT = 5.5;

    const campCounts = this._countEnemiesNearCamps(260);

    for (const camp of this.world.camps || []) {
      if (this.enemies.length >= this.perf.maxEnemies) return;
      const heroD2 = dist2(this.hero.x, this.hero.y, camp.x, camp.y);
      if (heroD2 < 360 * 360 || heroD2 > 2200 * 2200) continue;

      const nearCount = campCounts.get(camp) || 0;
      const targetCount = heroD2 < 1200 * 1200 ? 4 : 2;
      if (nearCount >= targetCount) continue;

      const e = this._spawnEnemyNearCamp(camp, nearCount);
      if (e) {
        this.enemies.push(e);
        campCounts.set(camp, nearCount + 1);
      }
    }
  }

  _countEnemiesNearCamps(radius = 260) {
    const camps = this.world?.camps || [];
    const counts = new Map();
    if (!camps.length || !this.enemies.length) return counts;

    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (!e?.alive) continue;
      for (const camp of camps) {
        if (dist2(e.x, e.y, camp.x, camp.y) <= r2) {
          counts.set(camp, (counts.get(camp) || 0) + 1);
          break;
        }
      }
    }
    return counts;
  }

  _spawnEnemyNearCamp(camp, salt = 0) {
    if (!camp) return null;

    const kinds = this._campEnemyPool(camp);
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = 125 + Math.random() * 150;
      const x = camp.x + Math.cos(ang) * rr;
      const y = camp.y + Math.sin(ang) * rr;
      if (!this.world.canWalk?.(x, y)) continue;
      if (dist2(x, y, this.world.spawn?.x || 0, this.world.spawn?.y || 0) < this.perf.worldSpawnSafeRadius ** 2) continue;

      const areaLevel = this.world.getDangerLevel?.(x, y) || 1;
      const kind = kinds[(Math.abs(hash2(camp.id || 0, salt + tries, this.seed)) % kinds.length)] || "scout";
      const elite = Math.random() < 0.06;
      const level = Math.max(1, (this.hero.level || 1) + areaLevel - 1);
      return this._applyEnemyAffix(
        new Enemy(x, y, level, kind, hash2(x | 0, y | 0, this.seed + salt), elite, false)
      );
    }

    return null;
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
    const updateD2 = this.dungeon.active ? Infinity : (this.perf.enemyUpdateRadius || 1200) ** 2;

    for (const e of this.enemies) {
      if (!e?.alive) continue;
      if (dist2(e.x, e.y, this.hero.x, this.hero.y) > updateD2) continue;
      e.update?.(dt, this.hero, this.world, this);
      this._resolveEnemyHeroHitbox(e);
      e.contactCd = Math.max(0, (e.contactCd || 0) - dt);

      const rr = (this.hero.radius || this.hero.r || 12) + (e.radius || e.r || 12);
      if (dist2(this.hero.x, this.hero.y, e.x, e.y) <= rr * rr) {
        const meleeActive = (e.kind === "caster" || e.kind === "dragon") || (e.lungeT || 0) > 0 || (e.attackCd || 0) <= 0.04;
        if (meleeActive && this._touchDamageCd <= 0 && (e.contactCd || 0) <= 0) {
          const hurt = this._damageHero(e.touchDps || 1);
          if (hurt) e.contactCd = e.boss ? 0.28 : e.elite ? 0.42 : 0.56;
          this._touchDamageCd = this.perf.touchDamageTick;
        }
      }
    }

    this._resolveEnemyCrowding();
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  _resolveEnemyHeroHitbox(e) {
    if (!e?.alive || !this.hero) return;
    const hr = this.hero.radius || this.hero.r || 12;
    const er = e.radius || e.r || 12;
    const minD = Math.max(16, hr + er - 3);
    const dx = e.x - this.hero.x;
    const dy = e.y - this.hero.y;
    const d = Math.hypot(dx, dy) || 0.001;
    if (d >= minD) return;

    const push = (minD - d) * 0.72;
    const nx = dx / d;
    const ny = dy / d;
    const tx = e.x + nx * push;
    const ty = e.y + ny * push;

    if (this._entityCanMoveTo(tx, e.y)) e.x = tx;
    if (this._entityCanMoveTo(e.x, ty)) e.y = ty;
  }

  _resolveEnemyCrowding() {
    const alive = this.enemies.filter((e) => e?.alive);
    const limit = Math.min(alive.length, 34);
    for (let i = 0; i < limit; i++) {
      const a = alive[i];
      for (let j = i + 1; j < limit; j++) {
        const b = alive[j];
        const ar = a.radius || a.r || 12;
        const br = b.radius || b.r || 12;
        const minD = Math.max(14, (ar + br) * 0.72);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0.001 || d2 >= minD * minD) continue;

        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.18;
        const nx = dx / d;
        const ny = dy / d;
        const ax = a.x - nx * push;
        const ay = a.y - ny * push;
        const bx = b.x + nx * push;
        const by = b.y + ny * push;

        if (this._entityCanMoveTo(ax, ay)) {
          a.x = ax;
          a.y = ay;
        }
        if (this._entityCanMoveTo(bx, by)) {
          b.x = bx;
          b.y = by;
        }
      }
    }
  }

  _entityCanMoveTo(x, y) {
    if (this.dungeon.active) return this._canMoveInDungeon(x, y);
    return this.world?.canWalk?.(x, y);
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
    this.dungeon.room = null;
    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;

    this._msg(lostGold > 0 ? `Recovered at camp -${lostGold}g` : "Recovered at camp", 1.8);
  }

  _updateProjectiles(dt) {
    const updateD2 = this.dungeon.active ? Infinity : (this.perf.projectileUpdateRadius || 1400) ** 2;
    for (const p of this.projectiles) {
      if (!p?.alive) continue;
      if (dist2(p.x, p.y, this.hero.x, this.hero.y) > updateD2) {
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
        continue;
      }

      p.update?.(dt, this.world);
      if (!p.alive) {
        if (p.friendly && p.burstRadius && !p._burstDone) {
          p._burstDone = true;
          this._spawnSpellBurst(p.x, p.y, p.burstRadius, Math.max(1, Math.round((p.dmg || 1) * 0.55)), p.burstColor, {
            life: 0.24,
            slow: p.burstSlow || 0,
          });
        }
        continue;
      }

      if (p.friendly) {
        if (p.nova && !p._hitEnemies) p._hitEnemies = new Set();

        for (const e of this.enemies) {
          if (!e?.alive) continue;
          if (p.nova && p._hitEnemies.has(e)) continue;

          const rr = (p.hitRadius || p.radius || 4) + (e.radius || e.r || 12);
          if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) {
            if (p.nova) p._hitEnemies.add(e);
            e.takeDamage?.(p.dmg || 1);
            if (p.slow) e.slowT = Math.max(e.slowT || 0, p.slow);
            if (p.knockback) {
              const away = norm(e.x - p.x, e.y - p.y);
              e.vx = (e.vx || 0) + away.x * p.knockback;
              e.vy = (e.vy || 0) + away.y * p.knockback;
            }
            this._spawnFloatingText(e.x, e.y - 12, p.crit ? `CRIT ${p.dmg || 1}` : `${p.dmg || 1}`, p.crit ? "#ffd86e" : "#ffffff");
            if (!p.nova) {
              if ((p.pierce || 0) > 0) {
                p.pierce -= 1;
              } else {
                p.alive = false;
                if (p.burstRadius) {
                  this._spawnSpellBurst(p.x, p.y, p.burstRadius, Math.max(1, Math.round((p.dmg || 1) * 0.55)), p.burstColor, {
                    life: 0.24,
                    slow: p.burstSlow || 0,
                  });
                }
              }
            }

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
            if (!p.nova && !p.alive) break;
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
      const slots = EQUIPMENT_SLOTS;
      const slot = slots[(Math.random() * slots.length) | 0];
      const rarity = e.boss
        ? (Math.random() < 0.45 ? "epic" : "rare")
        : e.elite
        ? (Math.random() < 0.12 ? "epic" : Math.random() < 0.52 ? "rare" : "uncommon")
        : (Math.random() < 0.18 ? "rare" : "uncommon");

      const item = makeGear(slot, Math.max(1, e.level || 1), rarity, hash2(e.x | 0, e.y | 0, this.time | 0));
      if (e.boss) item.name = `Boss-Taken ${item.name}`;
      else if (e.elite) item.name = `Elite ${item.name}`;
      this.loot.push(new Loot(e.x - 8, e.y, "gear", item));
    }
  }

  _damageHero(amount) {
    if (this.dev?.godMode) {
      this.hero.hp = this.hero.maxHp || 100;
      this.hero.mana = Math.max(this.hero.mana || 0, Math.min(this.hero.maxMana || 60, this.hero.mana || 0));
      return false;
    }
    const dmg = Math.max(1, Math.round(amount || 1));
    this.hero.takeDamage?.(dmg);
    const state = this.hero.state || (this.hero.state = {});
    state.hurtT = Math.max(state.hurtT || 0, 0.22);
    if (this.time - (this._lastHeroDamageTextT || 0) > 0.28) {
      this._spawnFloatingText(this.hero.x, this.hero.y - 32, `-${dmg}`, "#ff8fa0");
      this._lastHeroDamageTextT = this.time;
    }
    return true;
  }

  _updateLoot(dt) {
    const updateD2 = this.dungeon.active ? Infinity : (this.perf.lootUpdateRadius || 820) ** 2;
    for (const l of this.loot) {
      if (!l?.alive) continue;
      if (dist2(l.x, l.y, this.hero.x, this.hero.y) > updateD2) continue;

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
      const power = l.data.score ? ` PWR ${l.data.score}` : "";
      const rarity = l.data.rarity ? `${this._titleCase(l.data.rarity)} ` : "";
      this._spawnFloatingText(this.hero.x, this.hero.y - 34, `+${rarity}Gear${power}`, l.data.color || "#d9dee8");
      this._msg(`Picked up ${l.data.name}${power}`, l.data.rarity === "epic" ? 2.0 : 1.25);
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
    this._cachedNearbySecret = check(this.world.secrets, 62);
    this._cachedNearbyTown = check(this.world.towns, 96);
    this._cachedNearbyDragonLair = check(this.world.dragonLairs, 110);
    if (this._cachedNearbySecret) this._discoverSecret(this._cachedNearbySecret);
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
      if (this._dungeonHasLivingEnemies()) {
        this._msg("Clear the floor first", 0.9);
      } else {
        if (!this.dungeon.roomRewarded) {
          this._claimDungeonClearReward();
          this.dungeon.roomRewarded = true;
        }
        const finalRoom = !!this.dungeon.room?.finalRoom;
        const nearNorth = this._isHeroNearDungeonExit("north");
        const nearSouth = this._isHeroNearDungeonExit("south");
        if (nearSouth) {
          this._leaveDungeon();
        } else if (nearNorth) {
          if (finalRoom) {
            this._msg("Dungeon cleared", 1.0);
            this._leaveDungeon();
          } else {
            this._descendDungeon();
          }
        } else {
          this._msg(finalRoom ? "North gate leaves victorious, south gate retreats" : "North gate deeper, south gate leaves", 1.1);
        }
      }
      return;
    }

    if (this._cachedNearbyCamp) {
      this._openShop(this._cachedNearbyCamp);
      return;
    }

    if (this._cachedNearbyTown) {
      this._enterTown(this._cachedNearbyTown);
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

  _enterTown(town) {
    const id = this._progressId(town);
    this._rememberProgressId(this.progress.visitedTowns, town);

    if (!this.progress.storyMilestones[`town_${id}`]) {
      this.progress.storyMilestones[`town_${id}`] = true;
      const notes = [
        "The Warden marks a safer road on your map.",
        "The Smith names a forge worth remembering.",
        "The Archivist whispers about hidden lore stones.",
      ];
      const note = notes[Math.abs(hash2(this.seed, town?.x | 0, town?.y | 0)) % notes.length];
      this.hero.potions.hp = (this.hero.potions.hp || 0) + 1;
      this.hero.potions.mana = (this.hero.potions.mana || 0) + 1;
      this.hero.gold += 15;
      this._spawnFloatingText(town.x, town.y - 42, "+Supplies", "#8be9ff");
      this._msg(`${town.name || "Town"} welcomed you. ${note}`, 2.1);
    } else {
      this._msg(`${town.name || "Town"}`, 0.9);
    }

    this.menu.open = "town";
  }

  _townRest() {
    const cost = Math.max(0, Math.min(28, 8 + (this.hero.level || 1) * 2));
    if ((this.hero.hp || 0) >= (this.hero.maxHp || 1) && (this.hero.mana || 0) >= (this.hero.maxMana || 1)) {
      this._msg("Already rested", 0.8);
      return;
    }
    if ((this.hero.gold || 0) < cost) {
      this._msg(`Rest costs ${cost}g`, 0.9);
      return;
    }
    this.hero.gold -= cost;
    this.hero.hp = this.hero.maxHp || 100;
    this.hero.mana = this.hero.maxMana || 60;
    this._msg(`Rested -${cost}g`, 1.0);
  }

  _townBuyPotion(kind) {
    const cost = kind === "mana" ? 22 : 18;
    if ((this.hero.gold || 0) < cost) {
      this._msg(`${kind === "mana" ? "Mana" : "Health"} potion costs ${cost}g`, 0.9);
      return;
    }
    this.hero.gold -= cost;
    this.hero.potions[kind] = (this.hero.potions[kind] || 0) + 1;
    this._msg(`${kind === "mana" ? "Mana" : "Health"} potion bought`, 1.0);
  }

  _townCommissionGear() {
    const cost = 58 + (this.hero.level || 1) * 9;
    if ((this.hero.gold || 0) < cost) {
      this._msg(`Smith needs ${cost}g`, 0.9);
      return;
    }
    const slots = EQUIPMENT_SLOTS;
    const slot = slots[Math.abs(hash2(this.seed, this.hero.gold, this.time | 0)) % slots.length];
    const rarity = (this.hero.level || 1) >= 6 ? "rare" : "uncommon";
    const item = makeGear(slot, Math.max(1, this.hero.level || 1), rarity, hash2(this.seed, slot.length, this.hero.gold, this.time | 0));
    item.name = `Townforged ${item.name}`;
    this.hero.gold -= cost;
    this.hero.inventory.push(item);
    this._msg(`Forged ${item.name}`, 1.4);
  }

  _townAskRumor() {
    const order = ["secret", "treasure", "town", "dungeon", "dragon", "bounty"];
    const current = order.indexOf(this.trackedObjective);
    const next = order[(current + 1 + order.length) % order.length];
    this._setTrackedObjective(next, `Rumor tracked: ${this._titleCase(next)}`);
  }

  _townCycleOath() {
    const order = ["knight", "ranger", "arcanist", "raider"];
    const current = Math.max(0, order.indexOf(this.hero.classId || "knight"));
    const next = order[(current + 1) % order.length];
    const free = !this.progress.storyMilestones?.oathChosen;
    const cost = free ? 0 : 90 + (this.hero.level || 1) * 12;
    if ((this.hero.gold || 0) < cost) {
      this._msg(`Oath change costs ${cost}g`, 1.0);
      return;
    }

    this.hero.gold -= cost;
    this.hero.classId = next;
    this.progress.storyMilestones.oathChosen = true;
    const stats = this.hero.getStats?.() || {};
    this.hero.maxHp = stats.maxHp || this.hero.maxHp;
    this.hero.maxMana = stats.maxMana || this.hero.maxMana;
    this.hero.hp = Math.min(this.hero.maxHp, Math.max(this.hero.hp || 1, Math.round(this.hero.maxHp * 0.72)));
    this.hero.mana = Math.min(this.hero.maxMana, Math.max(this.hero.mana || 1, Math.round(this.hero.maxMana * 0.72)));
    this._msg(`Oath: ${this._className(next)}`, 1.3);
  }

  _townTakeContract() {
    const town = this._cachedNearbyTown;
    const id = this._progressId(town || { id: "town" });
    const done = this.progress.storyMilestones || (this.progress.storyMilestones = {});
    const key = `contract_${id}`;
    const options = ["secret", "treasure", "town", "dungeon", "dragon", "bounty"];
    const pick = options[Math.abs(hash2(this.seed, town?.x | 0, town?.y | 0, this.progress.bountyCompletions || 0)) % options.length];
    this._setTrackedObjective(pick, null);

    if (!done[key]) {
      done[key] = true;
      const slots = EQUIPMENT_SLOTS;
      const rewardSlot = slots[Math.abs(hash2(id.length, this.seed, this.hero.level || 1)) % slots.length];
      const reward = makeGear(rewardSlot, Math.max(1, this.hero.level || 1), "uncommon", hash2(this.seed, town?.x | 0, town?.y | 0, 77));
      reward.name = `Town-Writ ${reward.name}`;
      this.hero.gold += 20;
      this.hero.giveXP?.(8);
      this.hero.inventory.push(reward);
      this._msg(`Town contract: ${this._titleCase(pick)} +20g and gear`, 1.4);
    } else {
      this._msg(`Contract tracked: ${this._titleCase(pick)}`, 1.0);
    }
  }

  _townBuyMapClue() {
    const cost = 36 + (this.hero.level || 1) * 4;
    if ((this.hero.gold || 0) < cost) {
      this._msg(`Map clue costs ${cost}g`, 0.9);
      return;
    }

    const candidates = [
      {
        mode: "secret",
        label: "hidden lore",
        target: this._nearest(this.world.secrets, (p) => !this.progress.discoveredSecrets.has(this._progressId(p))),
      },
      {
        mode: "treasure",
        label: "treasure cache",
        target: this._nearest(this.world.caches, (p) => !this.progress.openedCaches.has(this._progressId(p))),
      },
      {
        mode: "town",
        label: "unvisited town",
        target: this._nearest(this.world.towns, (p) => !this.progress.visitedTowns.has(this._progressId(p))),
      },
      {
        mode: "dungeon",
        label: "dungeon gate",
        target: this._nearest(this.world.dungeons),
      },
      {
        mode: "dragon",
        label: "dragon lair",
        target: this._nearest(this.world.dragonLairs, (p) => !this.progress.defeatedDragons.has(this._progressId(p))),
      },
    ].filter((v) => v.target);

    if (!candidates.length) {
      this._msg("No useful map clues left", 1.0);
      return;
    }

    candidates.sort((a, b) => dist2(this.hero.x, this.hero.y, a.target.x, a.target.y) - dist2(this.hero.x, this.hero.y, b.target.x, b.target.y));
    const clue = candidates[0];
    this.hero.gold -= cost;
    this._setTrackedObjective(clue.mode, null);
    this.world?.revealAround?.(clue.target.x, clue.target.y, 520);
    this._spawnFloatingText(this.hero.x, this.hero.y - 42, "Map clue", "#8be9ff");
    this._msg(`Cartographer marked ${clue.label} -${cost}g`, 1.6);
  }

  _getTownPassageInfo(town = this._cachedNearbyTown) {
    if (!town?.coastal || !town?.linkedDockId) {
      return { available: false, destination: null, destinationName: "", cost: 0 };
    }

    const coastalTowns = (this.world?.towns || [])
      .filter((t) => t?.coastal && t.id !== town.id && t.linkedDockId);
    if (!coastalTowns.length) {
      return { available: false, destination: null, destinationName: "", cost: 0 };
    }

    const unvisited = coastalTowns.filter((t) => !this.progress?.visitedTowns?.has?.(String(t.id)));
    const pool = unvisited.length ? unvisited : coastalTowns;
    pool.sort((a, b) => dist2(town.x, town.y, a.x, a.y) - dist2(town.x, town.y, b.x, b.y));
    const destination = pool[0];
    const travelDist = Math.sqrt(dist2(town.x, town.y, destination.x, destination.y));
    const cost = Math.max(18, Math.min(90, 12 + Math.round(travelDist / 220)));
    return {
      available: true,
      destination,
      destinationName: destination.name || "Harbor town",
      cost,
    };
  }

  _townBuyPassage() {
    const town = this._cachedNearbyTown;
    const passage = this._getTownPassageInfo(town);
    if (!passage.available || !passage.destination) {
      this._msg(town?.coastal ? "No ship is sailing right now" : "This town has no harbor passage", 1.0);
      return;
    }
    if ((this.hero.gold || 0) < passage.cost) {
      this._msg(`Passage costs ${passage.cost}g`, 0.9);
      return;
    }

    const destination = passage.destination;
    const dock = (this.world?.docks || []).find((d) => d.id === destination.linkedDockId);
    const arrival = dock || destination;

    this.hero.gold -= passage.cost;
    this.hero.state.sailing = false;
    this.hero.x = arrival.x;
    this.hero.y = arrival.y;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;

    if (dock) this._rememberProgressId(this.progress.discoveredDocks, dock);
    this._rememberProgressId(this.progress.visitedTowns, destination);
    this.world?.revealAround?.(arrival.x, arrival.y, 760);
    this._setTrackedObjective("town", null);
    this.menu.open = null;
    this._spawnFloatingText(this.hero.x, this.hero.y - 42, "Passage booked", "#8be9ff");
    this._msg(`Sailed to ${destination.name} -${passage.cost}g`, 1.5);
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

    const slots = EQUIPMENT_SLOTS;
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

  getShopPanelMeta() {
    const discount = Math.round((this.shop?.discount || 0) * 100);
    return {
      hint: "1-4 or click buy - Esc close",
      goldText: `Gold: ${this.hero?.gold || 0}`,
      discountText: discount > 0 ? `Renown discount: ${discount}%` : "",
    };
  }

  getShopPanelLayout() {
    const w = 430;
    const h = 260;
    const x = ((this.w - w) / 2) | 0;
    const y = ((this.h - h) / 2) | 0;
    return {
      w,
      h,
      x,
      y,
      rowStart: 70,
      rowStep: 42,
    };
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
      this._grantPermanentStats({ hp: 8 });
      this.hero.hp = Math.min(this.hero.maxHp, (this.hero.hp || 0) + 24);
      this._spawnFloatingText(shrine.x, shrine.y - 22, "+Max HP", "#ff8fa0");
      this._msg("Shrine of Vitality claimed", 1.5);
    } else if (roll === 1) {
      this._grantPermanentStats({ mana: 6 });
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

  _grantPermanentStats(stats = {}) {
    if (!this.hero.bonusStats) this.hero.bonusStats = { hp: 0, mana: 0 };
    this.hero.bonusStats.hp = Math.max(0, (this.hero.bonusStats.hp || 0) + (stats.hp || 0));
    this.hero.bonusStats.mana = Math.max(0, (this.hero.bonusStats.mana || 0) + (stats.mana || 0));

    const current = this.hero.getStats?.() || {};
    this.hero.maxHp = current.maxHp || this.hero.maxHp || 100;
    this.hero.maxMana = current.maxMana || this.hero.maxMana || 60;
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
      const slots = EQUIPMENT_SLOTS;
      const slot = slots[Math.abs(hash2(cache.x | 0, cache.y | 0, level)) % slots.length];
      const rarity = level >= 5 ? "rare" : "uncommon";
      const item = makeGear(slot, Math.max(level, this.hero.level || 1), rarity, hash2(this.seed, cache.x | 0, cache.y | 0));
      item.name = `Cache-Sealed ${item.name}`;
      this.loot.push(new Loot(cache.x, cache.y - 12, "gear", item));
    }

    this._spawnFloatingText(cache.x, cache.y - 22, "Cache opened", "#ffe19a");
    this._msg("Treasure cache opened", 1.4);
    this._awardRelicShards(level >= 4 ? 2 : 1, "cache");
  }

  _discoverSecret(secret) {
    const id = this._progressId(secret);
    if (this.progress.discoveredSecrets?.has(id)) return;
    this.progress.discoveredSecrets.add(id);

    const bonus = 10 + Math.max(1, this.hero.level || 1) * 3;
    this.hero.gold += bonus;
    this.hero.giveXP?.(6 + Math.max(1, this.hero.level || 1));
    this._spawnFloatingText(secret.x, secret.y - 24, "Secret found", "#ffeaa8");
    this._msg(`Lore found: ${secret.name || "Hidden marker"} +${bonus}g`, 1.7);

    if ((this.progress.discoveredSecrets.size || 0) % 3 === 0) {
      this._awardRelicShards(1, "secret");
    }
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
    this.dungeon.roomIndex = 1;
    this.dungeon.totalRooms = 4;
    this.dungeon.roomRewarded = false;
    this.dungeon.room = this._makeDungeonRoom();
    this.hero.x = this.dungeon.room.x;
    this.hero.y = this.dungeon.room.y + 150;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.sailing = false;
    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this._msg(`${this._dungeonTheme(this.dungeon.floor).name} - Room 1/${this.dungeon.totalRooms}`, 1.2);
    this._spawnDungeonWave();
  }

  _descendDungeon() {
    if (!this.dungeon.active) return;
    this.progress.dungeonBest = Math.max(this.progress.dungeonBest || 0, this.dungeon.floor || 0);
    this.dungeon.floor = Math.max(1, (this.dungeon.floor || 1) + 1);
    this.dungeon.roomIndex = Math.min(this.dungeon.totalRooms || 4, (this.dungeon.roomIndex || 1) + 1);
    this.dungeon.roomRewarded = false;
    this.dungeon.room = this._makeDungeonRoom();
    this.hero.x = this.dungeon.room.x;
    this.hero.y = this.dungeon.room.y + this.dungeon.room.h * 0.28;
    this.camera.x = this.hero.x;
    this.camera.y = this.hero.y;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.hero.hp = Math.min(this.hero.maxHp || 100, (this.hero.hp || 0) + 12);
    this.hero.mana = Math.min(this.hero.maxMana || 60, (this.hero.mana || 0) + 10);
    if (this.dungeon.floor % 3 === 0) this._awardRelicShards(1, "depths");
    this._spawnDungeonWave();
    this._msg(`Descended: ${this._dungeonTheme(this.dungeon.floor).name} Room ${this.dungeon.roomIndex}/${this.dungeon.totalRooms}`, 1.4);
  }

  _makeDungeonRoom() {
    const floor = Math.max(1, this.dungeon.floor || 1);
    const roomIndex = Math.max(1, this.dungeon.roomIndex || 1);
    const totalRooms = Math.max(1, this.dungeon.totalRooms || 4);
    const finalRoom = roomIndex >= totalRooms;
    const seed = hash2(this.seed, floor, roomIndex, 4117);
    const rng = new RNG(seed);
    const baseW = finalRoom ? 920 : 680 + rng.range(0, 170);
    const baseH = finalRoom ? 620 : 440 + rng.range(0, 130);
    const scaleW = Math.min(170, floor * 8);
    const scaleH = Math.min(110, floor * 6);
    return {
      x: this.dungeon.origin?.x || this.hero.x,
      y: this.dungeon.origin?.y || this.hero.y,
      w: baseW + scaleW,
      h: baseH + scaleH,
      seed,
      finalRoom,
      roomIndex,
      totalRooms,
    };
  }

  _getDungeonExitAnchor(which = "north", room = this.dungeon.room) {
    const r = room || this.dungeon.room || { x: this.hero.x, y: this.hero.y, w: 780, h: 540 };
    return which === "south"
      ? { x: r.x, y: r.y + r.h * 0.5 - 52 }
      : { x: r.x, y: r.y - r.h * 0.5 + 52 };
  }

  _isHeroNearDungeonExit(which = "north", radius = 82) {
    if (!this.dungeon.active) return false;
    const p = this._getDungeonExitAnchor(which);
    return dist2(this.hero.x, this.hero.y, p.x, p.y) <= radius * radius;
  }

  _dungeonHasLivingEnemies() {
    return this.enemies.some((e) => e?.alive);
  }

  _claimDungeonClearReward() {
    const floor = Math.max(1, this.dungeon.floor || 1);
    const room = this.dungeon.room || {};
    const gold = 16 + floor * 7 + Math.round((this.hero.level || 1) * 2.5);
    this.hero.gold += gold;
    this.hero.giveXP?.(8 + floor * 3);

    if (floor % 2 === 0) {
      const potionType = floor % 4 === 0 ? "mana" : "hp";
      this.hero.potions[potionType] = (this.hero.potions[potionType] || 0) + 1;
    }

    if (floor % 3 === 0) {
      const slots = EQUIPMENT_SLOTS;
      const slot = slots[Math.abs(hash2(this.seed, floor, this.hero.level || 1)) % slots.length];
      const rarity = floor >= 9 ? "epic" : floor >= 5 ? "rare" : "uncommon";
      const gear = makeGear(slot, Math.max(1, (this.hero.level || 1) + Math.floor(floor / 3)), rarity, hash2(this.seed, floor, slot.length));
      gear.name = `Depth-Forged ${gear.name}`;
      this.hero.inventory.push(gear);
      this._spawnFloatingText(this.hero.x, this.hero.y - 58, `Gear PWR ${gear.score || "-"}`, gear.color || "#dc7cff");
    }

    if (room.finalRoom) {
      const done = this.progress.storyMilestones || (this.progress.storyMilestones = {});
      if (!done.mountainPassAccess) {
        done.mountainPassAccess = true;
        this.hero.state.mountainPassAccess = true;
        this._spawnFloatingText(this.hero.x, this.hero.y - 74, "Pass Sigil", "#8be9ff");
        this._msg("Dungeon reward: mountain passes can now be crossed on foot", 2.0);
      }
    }

    this._spawnFloatingText(this.hero.x, this.hero.y - 38, `${this._dungeonTheme(floor).name} clear +${gold}g`, "#ffd86e");
  }

  _spawnDungeonWave() {
    const floor = Math.max(1, this.dungeon.floor || 1);
    const room = this.dungeon.room;
    const finalRoom = !!room?.finalRoom;
    const count = finalRoom ? Math.min(8, 4 + Math.ceil(floor * 0.45)) : Math.min(10, 3 + Math.ceil(floor * 0.6));
    const bossFloor = finalRoom;
    const theme = this._dungeonTheme(floor);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + floor * 0.31;
      const r = 220 + (i % 3) * 65;
      const rawX = this.hero.x + Math.cos(a) * r;
      const rawY = this.hero.y + Math.sin(a) * r;
      const x = room ? clamp(rawX, room.x - room.w * 0.5 + 80, room.x + room.w * 0.5 - 80) : rawX;
      const y = room ? clamp(rawY, room.y - room.h * 0.5 + 80, room.y + room.h * 0.5 - 80) : rawY;
      const kind = bossFloor && i === 0 ? theme.enemies[0] : this._pickFrom(theme.enemies);
      const enemy = new Enemy(x, y, Math.max(1, (this.hero.level || 1) + floor - 1), kind, hash2(x | 0, y | 0, this.seed + floor), i % 4 === 0, bossFloor && i === 0);
      this.enemies.push(this._applyEnemyAffix(enemy));
    }

    if (finalRoom && floor >= 5 && floor % 4 === 0) {
      const room = this.dungeon.room;
      const bx = room ? room.x + room.w * 0.30 : this.hero.x + 280;
      const by = room ? room.y - room.h * 0.18 : this.hero.y - 40;
      this._spawnDragonBoss(bx, by, Math.max(8, (this.hero.level || 1) + floor), `Depth Dragon F${floor}`);
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
    this.dungeon.room = null;
    this.dungeon.roomIndex = 0;
    this.dungeon.totalRooms = 0;
    this.dungeon.roomRewarded = false;

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

  _checkBridgeDiscovery(dt) {
    if (this.dungeon.active) return;
    this._bridgeDiscoveryT = Math.max(0, (this._bridgeDiscoveryT || 0) - dt);
    if (this._bridgeDiscoveryT > 0) return;
    this._bridgeDiscoveryT = 0.32;

    const bridge = this.world?.getBridgeAt?.(this.hero.x, this.hero.y);
    if (!bridge) return;

    const id = `${bridge.cx | 0},${bridge.cy | 0}`;
    if (this.progress.crossedBridges?.has?.(id)) return;
    this.progress.crossedBridges.add(id);

    const gold = 6 + Math.max(1, this.world.getDangerLevel?.(bridge.cx, bridge.cy) || 1) * 3;
    this.hero.gold += gold;
    this.hero.giveXP?.(4);
    this.world?.revealAround?.(bridge.cx, bridge.cy, 620);
    this._spawnFloatingText(this.hero.x, this.hero.y - 34, `Bridge found +${gold}g`, "#ffd86e");
    this._msg(`Bridge route charted (${this.progress.crossedBridges.size})`, 1.1);
  }

  _makeBountyQuest(seedOffset = 0) {
    const targets = ["wolf", "stalker", "scout", "caster", "brute", "ashling", "wisp", "sentinel", "thorn", "duelist", "mender"];
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
      this._grantPermanentStats({ hp: m.hp || 0, mana: m.mana || 0 });
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

    const slots = EQUIPMENT_SLOTS;
    const slot = slots[this.progress.bountyCompletions % slots.length];
    const rarity = this.progress.bountyCompletions % 4 === 0 ? "rare" : "uncommon";
    const reward = makeGear(slot, Math.max(1, this.hero.level), rarity, hash2(this.seed, this.progress.bountyCompletions));
    reward.name = `Bounty-Marked ${reward.name}`;
    this.hero.inventory.push(reward);

    this._spawnFloatingText(this.hero.x, this.hero.y - 46, `Gear PWR ${reward.score || "-"}`, reward.color || "#ffd86e");
    this._msg(`Bounty complete: +${q.rewardGold}g and ${reward.name}`, 2.0);
    this.quest = this._makeBountyQuest(this.progress.bountyCompletions + 7);
  }

  getObjective() {
    if (this.dungeon.active) {
      const floor = this.dungeon.floor || 1;
      const alive = this.enemies.reduce((n, e) => n + (e?.alive ? 1 : 0), 0);
      const theme = this._dungeonTheme(floor);
      return this._objective(
        `${theme.name} Floor ${floor}`,
        alive > 0 ? `${alive} enemies remain. Clear the room, then press F at the stairs.` : "Room clear. Press F at the stairs to descend.",
        null,
        "#dc7cff"
      );
    }

    const tracked = this._getTrackedObjective();
    if (tracked) return tracked;

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

    const undiscoveredSecret = this._nearest(
      this.world.secrets,
      (secret) => !this.progress.discoveredSecrets.has(this._progressId(secret))
    );
    if (undiscoveredSecret) {
      return this._objective(
        "Find hidden lore",
        "Explore old markers for XP, gold, and relic shards.",
        undiscoveredSecret,
        "#ffeaa8"
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

  getTrackedObjectiveSummary() {
    return this._getTrackedObjective() || this.getObjective();
  }

  _objective(title, detail, target, color) {
    return { title, detail, target, color };
  }

  _getTrackedObjective() {
    const mode = this.trackedObjective || "story";
    if (mode === "story") return null;

    if (mode === "bounty" && this.quest?.type === "bounty") {
      return this._objective(
        `Bounty: ${this._titleCase(this.quest.target)}`,
        `${this.quest.count || 0}/${this.quest.needed || 1} defeated - press J to change tracking.`,
        this._nearest(this.enemies, (e) => e.alive && e.kind === this.quest.target),
        "#ffd86e"
      );
    }

    if (mode === "town") {
      const town = this._nearest(this.world.towns, (p) => !this.progress.visitedTowns.has(this._progressId(p))) ||
        this._nearest(this.world.towns);
      if (town) return this._objective("Reach a town", "Find NPCs, supplies, and story hints.", town, "#8be9ff");
    }

    if (mode === "dungeon") {
      const dungeon = this._nearest(this.world.dungeons);
      if (dungeon) return this._objective("Enter a dungeon", "Press F inside the purple gate.", dungeon, "#dc7cff");
    }

    if (mode === "dragon") {
      const lair = this._nearest(this.world.dragonLairs, (p) => !this.progress.defeatedDragons.has(this._progressId(p)));
      if (lair) return this._objective("Hunt an ancient dragon", "Hard bosses guard the far lairs.", lair, "#ff8a5c");
    }

    if (mode === "treasure") {
      const cache = this._nearest(this.world.caches, (p) => !this.progress.openedCaches.has(this._progressId(p)));
      if (cache) return this._objective("Open a treasure cache", "Gold chests hide gear and relic shards.", cache, "#ffe19a");
    }

    if (mode === "secret") {
      const secret = this._nearest(this.world.secrets, (p) => !this.progress.discoveredSecrets.has(this._progressId(p)));
      if (secret) return this._objective("Find hidden lore", "Old markers grant XP, gold, and occasional relic shards.", secret, "#ffeaa8");
    }

    return null;
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
      this._nearest(this.world.secrets, (p) => !this.progress.discoveredSecrets.has(this._progressId(p))) ||
      this._nearest(this.world.dungeons);

    return this._objective(
      "Restore the Ash Crown",
      `Collect relic shards: ${shards}/${next}`,
      target,
      "#c9a7ff"
    );
  }

  getActiveBossState() {
    const hero = this.hero;
    if (!hero) return null;

    let best = null;
    let bestD2 = Infinity;
    for (const e of this.enemies || []) {
      if (!e?.alive || !e.boss) continue;
      const d2 = dist2(hero.x, hero.y, e.x, e.y);
      const visible = this._isVisibleWorldPoint(e.x, e.y, 240);
      const alert = (e.alertT || 0) > 0.08;
      const engageR = Math.max(760, (e.aggroRadius || 0) + 280);
      if (!this.dungeon?.active && !visible && !alert && d2 > engageR * engageR) continue;
      if (d2 < bestD2) {
        best = e;
        bestD2 = d2;
      }
    }

    if (!best) return null;

    const frac = clamp((best.hp || 0) / Math.max(1, best.maxHp || 1), 0, 1);
    const distance = Math.max(0, Math.round(Math.sqrt(bestD2) / 10) * 10);
    const isDragon = best.kind === "dragon";
    const name = best.name || (isDragon ? "Ancient Dragon" : `${this._titleCase(best.kind)} Boss`);
    const detail =
      isDragon ? "Ancient threat" :
      this.dungeon?.active ? `Dungeon floor ${this.dungeon.floor || 1} boss` :
      "Roaming boss";

    return {
      name,
      detail,
      kind: best.kind || "boss",
      level: best.level || 1,
      hp: Math.round(best.hp || 0),
      maxHp: Math.max(1, Math.round(best.maxHp || 1)),
      frac,
      distance,
      colorA: isDragon ? "#b53045" : "#a9852d",
      colorB: isDragon ? "#ff8a5c" : "#ffd36e",
      accent: isDragon ? "#ff8a5c" : "#ffd36e",
      alive: !!best.alive,
    };
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
    }
  }

  _spawnFloatingText(x, y, text, color = "#fff") {
    const cap = this.perf?.maxFloatingTexts || 48;
    if (this.floatingTexts.length >= cap) this.floatingTexts.splice(0, this.floatingTexts.length - cap + 1);
    this.floatingTexts.push({ x, y, text, color, a: 1, vy: -21, life: 1.1 });
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
      check(this.world.secrets) ||
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
    if (this.loot.length > this.perf.maxLoot) this.loot.splice(0, this.loot.length - this.perf.maxLoot);
    if (this.projectiles.length > this.perf.maxProjectiles) this.projectiles.splice(0, this.projectiles.length - this.perf.maxProjectiles);
    if (this.floatingTexts.length > this.perf.maxFloatingTexts) this.floatingTexts.splice(0, this.floatingTexts.length - this.perf.maxFloatingTexts);
  }

  _ensureHeroSafe(showMsg = false) {
    const onSafeGround = this.world.canWalk?.(this.hero.x, this.hero.y, { state: { sailing: false, mountainPassAccess: !!this.hero.state?.mountainPassAccess } });
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
        worldBuild: this.world?.buildId || "rpg-v109",
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
          classId: this.hero.classId || "knight",
          inventory: this.hero.inventory,
          equip: this.hero.equip,
          potions: this.hero.potions,
          bonusStats: this.hero.bonusStats || { hp: 0, mana: 0 },
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
          discoveredSecrets: Array.from(this.progress.discoveredSecrets || []),
          defeatedDragons: Array.from(this.progress.defeatedDragons || []),
          relicShards: this.progress.relicShards || 0,
          storyMilestones: this.progress.storyMilestones || {},
          visitedTowns: Array.from(this.progress.visitedTowns || []),
          crossedBridges: Array.from(this.progress.crossedBridges || []),
          exploredCells: this.world?.exportDiscovery?.() || [],
        },
        trackedObjective: this.trackedObjective,
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

  flushSave() {
    this._saveGame();
  }

  _loadGame() {
    try {
      const data = this.save.load?.() || this.save.read?.() || this.save.get?.();
      if (!data) return;

      const currentWorldBuild = this.world?.buildId || "rpg-v109";
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
        this.hero.classId = this._className(h.classId).toLowerCase();
        this.hero.inventory = Array.isArray(h.inventory) ? h.inventory : [];
        this.hero.equip = h.equip || this.hero.equip;
        this.hero.potions = h.potions || this.hero.potions;
        this.hero.bonusStats = { hp: 0, mana: 0 };
        const baseStats = this.hero.getStats?.() || {};
        this.hero.bonusStats = {
          hp: Math.max(h.bonusStats?.hp || 0, Math.round((h.maxHp || 0) - (baseStats.maxHp || 0))),
          mana: Math.max(h.bonusStats?.mana || 0, Math.round((h.maxMana || 0) - (baseStats.maxMana || 0))),
        };
        this.hero.state = h.state || this.hero.state;
        this.hero.lastMove = h.lastMove || this.hero.lastMove;
        this.hero.aimDir = h.aimDir || this.hero.aimDir;

        const stats = this.hero.getStats?.() || {};
        this.hero.maxHp = Math.max(1, stats.maxHp || this.hero.maxHp);
        this.hero.hp = clamp(this.hero.hp, 0, this.hero.maxHp);
        this.hero.maxMana = Math.max(0, stats.maxMana || this.hero.maxMana);
        this.hero.mana = clamp(this.hero.mana, 0, this.hero.maxMana);
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
        this.progress.discoveredSecrets = new Set(data.progress.discoveredSecrets || []);
        this.progress.defeatedDragons = new Set(data.progress.defeatedDragons || []);
        this.progress.relicShards = data.progress.relicShards || 0;
        this.progress.storyMilestones = data.progress.storyMilestones || {};
        this.progress.visitedTowns = new Set(data.progress.visitedTowns || []);
        this.progress.crossedBridges = new Set(data.progress.crossedBridges || []);
        if (!needsWorldMigration) {
          this.world?.importDiscovery?.(data.progress.exploredCells || []);
        }
      }

      this.hero.state.mountainPassAccess = !!this.progress?.storyMilestones?.mountainPassAccess;

      if (typeof data.trackedObjective === "string") {
        this.trackedObjective = data.trackedObjective;
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
        if (this.menu.open === "shop" || this.menu.open === "town") this.menu.open = null;
        this.menu.mapZoom = clamp(this._finiteOr(data.menu.mapZoom, this.menu.mapZoom || 1), 1, 8);
      }

      if (data.cooldowns) {
        this.cooldowns.q = data.cooldowns.q || 0;
        this.cooldowns.w = data.cooldowns.w || 0;
        this.cooldowns.e = data.cooldowns.e || 0;
        this.cooldowns.r = data.cooldowns.r || 0;
      }

      this.camera.x = this.hero.x;
      this.camera.y = this.hero.y;
      this._lastHeroLevel = this.hero.level || 1;
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
