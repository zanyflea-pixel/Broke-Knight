// v50 DUNGEON TRAPS + RELIC ROOMS + ELITE BOSSES (FULL FILE)

import World from "./world.js";
import { clamp, lerp, dist2, norm, RNG, hash2 } from "./util.js";
import { Hero, Enemy, Projectile, Loot, makeGear } from "./entities.js";
import Input from "./input.js";
import UI from "./ui.js";
import Save from "./save.js";

function gearVisualColor(rarity, kind = "armor") {
  if (kind === "armor" || kind === "chest" || kind === "helm" || kind === "boots") {
    if (rarity === "epic") return "rgba(178,118,255,0.98)";
    if (rarity === "rare") return "rgba(112,182,255,0.98)";
    if (rarity === "uncommon") return "rgba(126,198,136,0.98)";
    return "rgba(124,138,160,0.98)";
  }

  if (kind === "ring" || kind === "trinket") {
    if (rarity === "epic") return "rgba(226,170,255,0.98)";
    if (rarity === "rare") return "rgba(156,210,255,0.98)";
    if (rarity === "uncommon") return "rgba(180,240,180,0.98)";
    return "rgba(232,214,164,0.98)";
  }

  if (kind === "weapon") {
    if (rarity === "epic") return "rgba(208,164,255,1)";
    if (rarity === "rare") return "rgba(144,204,255,1)";
    if (rarity === "uncommon") return "rgba(186,232,196,1)";
    return "rgba(178,188,205,1)";
  }

  return "rgba(200,200,210,1)";
}

function gearTrimColor(rarity) {
  if (rarity === "epic") return "rgba(255,220,150,1)";
  if (rarity === "rare") return "rgba(230,236,255,1)";
  if (rarity === "uncommon") return "rgba(220,240,220,1)";
  return "rgba(210,186,118,1)";
}

function gearShineColor(rarity) {
  if (rarity === "epic") return "rgba(255,236,255,0.95)";
  if (rarity === "rare") return "rgba(236,246,255,0.95)";
  if (rarity === "uncommon") return "rgba(240,255,244,0.94)";
  return "rgba(232,236,244,0.9)";
}

function gearGlowColor(rarity) {
  if (rarity === "epic") return "rgba(220,160,255,0.95)";
  if (rarity === "rare") return "rgba(140,210,255,0.95)";
  if (rarity === "uncommon") return "rgba(155,235,175,0.92)";
  return "rgba(255,220,140,0.55)";
}

function roundedRectPath(path, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + h - rr);
  path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  path.lineTo(x + rr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  path.closePath();
}

function roundedRectFill(ctx, x, y, w, h, r) {
  const p = new Path2D();
  roundedRectPath(p, x, y, w, h, r);
  ctx.fill(p);
}

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
    this.save = new Save("broke-knight-save-v50");

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
    this.questTurnIn = null;

    this.msg = "";
    this.msgT = 0;
    this.zoneMsg = "";
    this.zoneMsgT = 0;

    this.flashT = 0;
    this.hitStopT = 0;

    this._pickupMsgCooldown = 0;
    this._spellMsgCooldown = 0;

    this.mouse = {
      x: this.w * 0.5,
      y: this.h * 0.5,
      down: false,
      worldX: this.hero.x,
      worldY: this.hero.y,
      moved: false,
    };

    this.skillBar = [
      { key: "q", name: "Spark", mana: 8, cd: 0.22, slot: 0 },
      { key: "w", name: "Nova", mana: 18, cd: 1.8, slot: 1 },
      { key: "e", name: "Dash", mana: 14, cd: 2.8, slot: 2 },
      { key: "r", name: "Orb", mana: 22, cd: 3.4, slot: 3 },
    ];

    this.skillLoadout = ["q", "w", "e", "r"];
    this.selectedSkillSlot = 0;

    this.skillDefs = {
      q: { key: "q", name: "Spark", mana: 8, cd: 0.22, color: "#8be9ff" },
      w: { key: "w", name: "Nova", mana: 18, cd: 1.8, color: "#d6f5ff" },
      e: { key: "e", name: "Dash", mana: 14, cd: 2.8, color: "#ffd36e" },
      r: { key: "r", name: "Orb", mana: 22, cd: 3.4, color: "#c08cff" },
    };

    this.cooldowns = { q: 0, w: 0, e: 0, r: 0 };
    this._currentSkillAim = { x: 1, y: 0 };

    this.dungeon = {
      active: false,
      floor: 0,
      rooms: [],
      currentRoomIndex: 0,
      seed: 0,
      visited: new Set(),
      roomMsgT: 0,
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

    this.progress = this.progress || {};
    if (!(this.progress.discoveredWaystones instanceof Set)) {
      this.progress.discoveredWaystones = new Set();
    }
    if (!(this.progress.discoveredDocks instanceof Set)) {
      this.progress.discoveredDocks = new Set();
    }

    this._rebuildCampState();
    this._ensureWorldPopulation();

    this._msg("Broke Knight ready", 1.8);
  }

  resize(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this.world?.setViewSize?.(this.w, this.h);
  }

  update(dt) {
    dt = Math.min(this._dtClamp, Math.max(0, dt || 0));

    if (this.hitStopT > 0) {
      this.hitStopT = Math.max(0, this.hitStopT - dt);
      this._tickUI(dt);
      return;
    }

    this.time += dt;

    this._tickUI(dt);
    this._tickCooldowns(dt);
    this._tickCamera(dt);
    this._updateMouseWorld();
    this._handleMenus();

    if (this.menu.open === "map") {
      this._handleFastTravelInput();
    } else {
      this._handleMovement(dt);
      this._handleSpells();
    }

    if (this.input.wasPressed("b")) {
      this._toggleDockingOrSailing();
    }

    if (this.input.wasPressed("f")) {
      this._interact();
    }

    this.hero.update?.(dt);

    if (this.dungeon.active) {
      this._updateDungeon(dt);
    } else {
      this.world.update?.(dt, this.hero);
      this._spawnWorldEnemies(dt);
      this._updateOverworldEnemies(dt);
    }

    this._updateProjectiles(dt);
    this._updateLoot(dt);
    this._updateQuestProgress(dt);
    this._updateZoneMessages(dt);

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

    ctx.translate((this.w * 0.5) | 0, (this.h * 0.5) | 0);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(
      (-this.camera.x + this.camera.sx) | 0,
      (-this.camera.y + this.camera.sy) | 0
    );

    this.world.draw?.(ctx, this.camera);

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

    ctx.fillStyle = "rgba(255,255,255,0.025)";
    for (let i = 0; i < 6; i++) {
      const y = ((i + 1) * this.h) / 7;
      ctx.fillRect(0, y, this.w, 1);
    }
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
  }

  _tickUI(dt) {
    this.msgT = Math.max(0, this.msgT - dt);
    this.zoneMsgT = Math.max(0, this.zoneMsgT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this._pickupMsgCooldown = Math.max(0, this._pickupMsgCooldown - dt);
    this._spellMsgCooldown = Math.max(0, this._spellMsgCooldown - dt);
    if (this.dungeon.roomMsgT > 0) this.dungeon.roomMsgT -= dt;
  }

  _tickCooldowns(dt) {
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
  }

  _tickCamera(dt) {
    const followX = this.hero.x;
    const followY = this.hero.y;

    this.camera.x = lerp(this.camera.x, followX, 1 - Math.exp(-dt * 10));
    this.camera.y = lerp(this.camera.y, followY, 1 - Math.exp(-dt * 10));

    if (this.camera.shakeT > 0) {
      this.camera.shakeT = Math.max(0, this.camera.shakeT - dt);
      const m = this.camera.shakeMag * (this.camera.shakeT > 0 ? 1 : 0);
      this.camera.sx = (Math.random() * 2 - 1) * m;
      this.camera.sy = (Math.random() * 2 - 1) * m;
    } else {
      this.camera.sx = lerp(this.camera.sx, 0, 1 - Math.exp(-dt * 18));
      this.camera.sy = lerp(this.camera.sy, 0, 1 - Math.exp(-dt * 18));
    }
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
  }  _pickupNearbyLootBonus() {
    for (const l of this.loot) {
      if (!l.alive) continue;
      if (dist2(this.hero.x, this.hero.y, l.x, l.y) < 26 * 26) {
        const kind = l.kind;
        const data = l.data || {};
        l.alive = false;

        if (kind === "gold") {
          this._grantGold(data.amount || 5);
          this._coolMsg("+Gold");
        }

        if (kind === "gear") {
          const eq = this._maybeAutoEquip(data);
          this._coolMsg(eq ? "Equipped gear" : "Picked gear");
        }
      }
    }

    this.loot = this.loot.filter(l => l.alive !== false);
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;

      p.update?.(dt);

      if (p.friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist2(p.x, p.y, e.x, e.y) < (p.hitRadius || 18) ** 2) {
            e.takeDamage?.(p.dmg || 4);
            p.alive = false;

            if (!e.alive) {
              this._dropLoot(e.x, e.y, e.level || 1);
              this._grantXP(4);
            }
            break;
          }
        }
      }
    }

    this.projectiles = this.projectiles.filter(p => p.alive !== false);
  }

  _dropLoot(x, y, lvl) {
    if (Math.random() < 0.7) {
      this.loot.push(
        new Loot(x, y, "gold", { amount: 4 + Math.floor(Math.random() * 6) })
      );
    }

    if (Math.random() < 0.28) {
      this.loot.push(new Loot(x, y, "gear", makeGear("weapon", lvl)));
    }
  }

  _spawnWorldEnemies(dt) {
    if (this.enemies.length > this.perf.maxEnemies) return;

    this._spawnTimer += dt;
    if (this._spawnTimer < 0.35) return;
    this._spawnTimer = 0;

    const r = this.perf.spawnRadius;
    const a = Math.random() * Math.PI * 2;
    const x = this.hero.x + Math.cos(a) * r;
    const y = this.hero.y + Math.sin(a) * r;

    if (!this.world.canWalk(x, y)) return;
    if (!this.world.canWalk(x + 20, y)) return;
    if (!this.world.canWalk(x - 20, y)) return;
    if (!this.world.canWalk(x, y + 20)) return;
    if (!this.world.canWalk(x, y - 20)) return;

    this.enemies.push(new Enemy(x, y, this.hero.level));
  }

  _updateOverworldEnemies(dt) {
    for (const e of this.enemies) {
      if (!e.alive) continue;

      e.update?.(dt, this.hero, this.world);

      if (dist2(e.x, e.y, this.hero.x, this.hero.y) < 22 * 22) {
        this.hero.takeDamage?.(e.dmg || 3);
        this._shake(0.08, 3);
      }
    }

    this.enemies = this.enemies.filter(e => e.alive !== false);
  }

  _updateLoot(dt) {
    this._pickupNearbyLootBonus();
  }

  _updateZoneMessages(dt) {
    if (this.dungeon.active) {
      this.zoneMsg = `Dungeon Floor ${this.dungeon.floor}`;
      this.zoneMsgT = 1.5;
      return;
    }

    for (const dg of this.world?.dungeons || []) {
      if (dist2(this.hero.x, this.hero.y, dg.x, dg.y) < 150 * 150) {
        this.zoneMsg = "Dungeon Entrance";
        this.zoneMsgT = 1.4;
        return;
      }
    }

    for (const d of this.world?.docks || []) {
      if (dist2(this.hero.x, this.hero.y, d.x, d.y) < 150 * 150) {
        this.zoneMsg = "Dock";
        this.zoneMsgT = 1.4;
        return;
      }
    }
  }

  _handleMenus() {
    if (this.input.wasPressed("i")) this.menu.open = this.menu.open === "inventory" ? null : "inventory";
    if (this.input.wasPressed("j")) this.menu.open = this.menu.open === "quests" ? null : "quests";
    if (this.input.wasPressed("m")) this.menu.open = this.menu.open === "map" ? null : "map";
    if (this.input.wasPressed("o")) this.menu.open = this.menu.open === "options" ? null : "options";
    if (this.input.wasPressed("Escape")) this.menu.open = null;

    if (this.menu.open) this.ui.open?.(this.menu.open);
    else this.ui.closeAll?.();
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

  _teleportToDungeonEntrance() {
    if (this.dungeon.active) return;

    if (this.hero.state?.sailing) {
      this._msg("Cannot fast travel while sailing.", 2);
      return;
    }

    const dg = Array.isArray(this.world?.dungeons) ? this.world.dungeons[0] : null;
    if (!dg) {
      this._msg("No dungeon entrance found.", 2);
      return;
    }

    this.hero.x = dg.x;
    this.hero.y = dg.y + 54;
    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.dashT = 0;

    this.menu.open = null;
    this.ui?.closeAll?.();

    this._msg("Teleported to dungeon entrance", 2.2);
    this._shake(0.14, 5);
    this._saveSoon();
  }

  _handleFastTravelInput() {
    if (this.menu.open !== "map") return;

    if (this.input.wasPressed("z")) {
      if (this.world?.toggleMapScale) {
        this.world.toggleMapScale();
        this._msg(`Map scale: ${this.world.mapMode}`, 1.2);
      }
    }

    if (this.input.wasPressed("x")) {
      this._teleportToDungeonEntrance();
      return;
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
  }  _handleMovement(dt) {
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

      this._currentSkillAim = { x: n.x, y: n.y };
      this.hero.lastMove = { x: n.x, y: n.y };

      let speed = this.hero.state?.sailing ? 190 : 150;

      const room =
        this._getCurrentDungeonRoom?.() ||
        this._getRoom?.() ||
        null;

      if (this.dungeon.active && room?.modifier === "haste") speed *= 1.18;
      if (this.dungeon.active && room?.modifier === "drag") speed *= 0.82;

      if (!this.dungeon.active && !this.hero.state?.sailing && this.world?.getMoveModifier) {
        speed *= this.world.getMoveModifier(this.hero.x, this.hero.y);
      }

      this.hero.vx = n.x * speed;
      this.hero.vy = n.y * speed;

      const nx = this.hero.x + this.hero.vx * dt;
      const ny = this.hero.y + this.hero.vy * dt;

      if (this.dungeon.active && this._moveHeroDungeon) {
        this._moveHeroDungeon(nx, ny);
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

  _handleSpells() {
    const aim = this._getAim();

    if (this.input.wasPressed("q")) this._castSpark(aim.x, aim.y);
    if (this.input.wasPressed("w")) this._castNova();
    if (this.input.wasPressed("e")) this._castDash(aim.x, aim.y);
    if (this.input.wasPressed("r")) this._castOrb(aim.x, aim.y);
  }

  _getAim() {
    const m = this.mouse;
    if (m?.moved) {
      const dx = m.worldX - this.hero.x;
      const dy = m.worldY - this.hero.y;
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

    const dmg = this.hero.getStats?.().dmg || 8;

    this.projectiles.push(
      new Projectile(
        this.hero.x + dx * 16,
        this.hero.y + dy * 16,
        dx * 320,
        dy * 320,
        dmg,
        1.0,
        this.hero.level,
        { friendly: true, color: "#8be9ff", type: "spark", radius: 5, hitRadius: 18 }
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

    const dmg = this.hero.getStats?.().dmg || 8;

    this.projectiles.push(
      new Projectile(
        this.hero.x,
        this.hero.y,
        0,
        0,
        dmg,
        0.2,
        this.hero.level,
        { friendly: true, nova: true, radius: 12, hitRadius: 76, color: "#d6f5ff" }
      )
    );

    this.cooldowns.w = def.cd;
    this._spellMsg("Nova");
  }

  _castDash(dx, dy) {
    if (this.cooldowns.e > 0) return;

    const def = this.skillDefs.e;
    if (!this.hero.spendMana?.(def.mana)) {
      this._spellMsg("No mana");
      return;
    }

    const dist = 80;
    const nx = this.hero.x + dx * dist;
    const ny = this.hero.y + dy * dist;

    if (this.dungeon.active && this._moveHeroDungeon) {
      this._moveHeroDungeon(nx, ny);
    } else {
      if (this.world.canWalk(nx, this.hero.y)) this.hero.x = nx;
      if (this.world.canWalk(this.hero.x, ny)) this.hero.y = ny;
    }

    this.hero.state.dashT = 0.12;
    this.cooldowns.e = def.cd;
    this._shake(0.1, 4);
    this._spellMsg("Dash");
  }

  _castOrb(dx, dy) {
    if (this.cooldowns.r > 0) return;

    const def = this.skillDefs.r;
    if (!this.hero.spendMana?.(def.mana)) {
      this._spellMsg("No mana");
      return;
    }

    const dmg = this.hero.getStats?.().dmg || 8;

    this.projectiles.push(
      new Projectile(
        this.hero.x + dx * 18,
        this.hero.y + dy * 18,
        dx * 180,
        dy * 180,
        dmg * 1.4,
        1.8,
        this.hero.level,
        { friendly: true, color: "#c08cff", type: "orb", radius: 8, hitRadius: 24 }
      )
    );

    this.cooldowns.r = def.cd;
    this._spellMsg("Orb");
  }

  _toggleDockingOrSailing() {
    const dock = (this.world?.docks || []).find(
      d => dist2(this.hero.x, this.hero.y, d.x, d.y) < 90 * 90
    );

    if (!dock) {
      this._msg("No dock nearby");
      return;
    }

    this.hero.state.sailing = !this.hero.state.sailing;

    if (this.hero.state.sailing) {
      this._msg("Sailing");
    } else {
      this._msg("Docked");
      this._nudgeToLand();
    }
  }

  _interact() {
    for (const w of this.world?.waystones || []) {
      if (dist2(this.hero.x, this.hero.y, w.x, w.y) < 90 * 90) {
        this.progress.discoveredWaystones?.add?.(w.id);
        this._msg(`Waystone ${w.id} awakened`, 1.6);
        this._saveSoon();
        return;
      }
    }

    for (const d of this.world?.docks || []) {
      if (dist2(this.hero.x, this.hero.y, d.x, d.y) < 90 * 90) {
        this.progress.discoveredDocks?.add?.(d.id);
        this._msg("Dock discovered", 1.2);
        this._saveSoon();
        return;
      }
    }

    for (const dg of this.world?.dungeons || []) {
      if (dist2(this.hero.x, this.hero.y, dg.x, dg.y) < 90 * 90) {
        this._enterDungeon(dg);
        return;
      }
    }
  }

  _enterDungeon(dg) {
    this.dungeon.active = true;
    this.dungeon.floor = 1;
    this.dungeon.rooms = this._buildDungeon();
    this.dungeon.currentRoomIndex = 0;

    const room = this._getRoom();
    this.hero.x = room.x;
    this.hero.y = room.y;

    this.enemies = [];
    this.projectiles = [];
    this.loot = [];

    this._spawnDungeonEnemies(room);
    this._msg("Entered Dungeon");
  }

  _buildDungeon() {
    const rooms = [];

    for (let i = 0; i < 5; i++) {
      rooms.push({
        x: i * 500,
        y: 0,
        w: 400,
        h: 240,
        boss: i === 4,
        modifier: i === 1 ? "haste" : i === 2 ? "drag" : "normal",
      });
    }

    return rooms;
  }  _getRoom() {
    return this.dungeon.rooms[this.dungeon.currentRoomIndex];
  }

  _getCurrentDungeonRoom() {
    if (!this.dungeon?.active) return null;
    return this.dungeon.rooms?.[this.dungeon.currentRoomIndex] || null;
  }

  _spawnDungeonEnemies(room) {
    this.enemies = [];

    const count = room.boss ? 1 : 5;

    for (let i = 0; i < count; i++) {
      const ex = room.x + Math.random() * 200 - 100;
      const ey = room.y + Math.random() * 120 - 60;

      this.enemies.push(
        new Enemy(ex, ey, this.hero.level + (room.boss ? 2 : 0))
      );
    }
  }

  _updateDungeon(dt) {
    for (const e of this.enemies) {
      if (!e.alive) continue;

      const dx = this.hero.x - e.x;
      const dy = this.hero.y - e.y;
      const n = norm(dx, dy);

      e.x += n.x * 60 * dt;
      e.y += n.y * 60 * dt;
    }

    if (!this.enemies.some(e => e.alive)) {
      this._nextRoom();
    }
  }

  _moveHeroDungeon(nx, ny) {
    const room = this._getCurrentDungeonRoom?.() || this._getRoom?.();
    if (!room) return;

    const halfW = (room.w || 400) * 0.5 - 20;
    const halfH = (room.h || 240) * 0.5 - 20;

    this.hero.x = clamp(nx, room.x - halfW, room.x + halfW);
    this.hero.y = clamp(ny, room.y - halfH, room.y + halfH);
  }

  _nextRoom() {
    this.dungeon.currentRoomIndex++;

    if (this.dungeon.currentRoomIndex >= this.dungeon.rooms.length) {
      this._exitDungeon();
      return;
    }

    const room = this._getRoom();
    this.hero.x = room.x;
    this.hero.y = room.y;

    this._spawnDungeonEnemies(room);
  }

  _exitDungeon() {
    this.dungeon.active = false;

    const dg = this.world?.dungeons?.[0];
    if (dg) {
      this.hero.x = dg.x;
      this.hero.y = dg.y + 50;
    }

    this._msg("Exited Dungeon");
  }

  _drawDungeonOverlayWorld(ctx) {
    const room = this._getCurrentDungeonRoom?.() || this._getRoom?.();
    if (!this.dungeon.active || !room) return;

    ctx.save();
    ctx.strokeStyle = "rgba(180,120,255,0.30)";
    ctx.lineWidth = 3;
    ctx.strokeRect(room.x - room.w * 0.5, room.y - room.h * 0.5, room.w, room.h);
    ctx.restore();
  }

  _updateMouseWorld() {
    const rect = this.canvas.getBoundingClientRect();
    const mx = this.mouse.x;
    const my = this.mouse.y;

    const sx = mx - rect.left;
    const sy = my - rect.top;

    const wx = (sx - this.w * 0.5) / this.camera.zoom + this.camera.x;
    const wy = (sy - this.h * 0.5) / this.camera.zoom + this.camera.y;

    this.mouse.worldX = wx;
    this.mouse.worldY = wy;
  }

  _bindMouse() {
    this.canvas.addEventListener("mousemove", e => {
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
  }

  _msg(text, t = 1.4) {
    this.msg = text;
    this.msgT = t;
  }

  _shake(t, mag) {
    this.camera.shakeT = t;
    this.camera.shakeMag = mag;
  }

  _makeQuests() {
    return [
      { id: "waystone", name: "Awaken a Waystone", done: false },
      { id: "dock", name: "Find a Dock", done: false },
      { id: "dungeon", name: "Enter a Dungeon", done: false },
    ];
  }

  _updateQuestProgress() {
    if (!this.quests) return;

    for (const q of this.quests) {
      if (q.done) continue;

      if (q.id === "dungeon" && this.dungeon.active) {
        q.done = true;
        this._msg("Quest Complete: Enter a Dungeon", 2);
      }

      if (q.id === "dock") {
        for (const d of this.world?.docks || []) {
          if (dist2(this.hero.x, this.hero.y, d.x, d.y) < 120 * 120) {
            q.done = true;
            this._msg("Quest Complete: Found Dock", 2);
            break;
          }
        }
      }

      if (q.id === "waystone") {
        for (const w of this.world?.waystones || []) {
          if (dist2(this.hero.x, this.hero.y, w.x, w.y) < 120 * 120) {
            q.done = true;
            this._msg("Quest Complete: Waystone", 2);
            break;
          }
        }
      }
    }
  }

  _saveSoon() {
    this._autosaveT = 0.25;
  }

  _saveGame() {
    try {
      this.save.write({
        hero: this.hero,
        worldSeed: this.seed,
      });
    } catch (e) {}
  }

  _loadGame() {
    try {
      const data = this.save.read();
      if (!data) return;

      if (data.hero) {
        Object.assign(this.hero, data.hero);
      }
    } catch (e) {}
  }

  _rebuildCampState() {
    this._campState = new Map();
  }

  _ensureWorldPopulation() {
    for (let i = 0; i < 20; i++) {
      const x = this.hero.x + (Math.random() * 800 - 400);
      const y = this.hero.y + (Math.random() * 800 - 400);

      if (this.world.canWalk(x, y)) {
        this.enemies.push(new Enemy(x, y, this.hero.level));
      }
    }
  }
}