// src/game.js
// v64 RPG CAMP SHOP PASS (FULL FILE)
// Focus:
// - keep performance gains from v63
// - add camp shops
// - buy potions and random gear
// - sell backpack gear
// - stronger RPG camp loop
// - keep current systems compatible

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
    this.save = new Save("broke-knight-save-v64");

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
      campRespawnCheckEvery: 2.6,
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
    };

    this.progress = {
      discoveredWaystones: new Set(),
      discoveredDocks: new Set(),
      dungeonBest: 0,
      visitedCamps: new Set(),
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
      this.input.endFrame();
      return;
    }

    this.time += dt;

    this._tickUI(dt);
    this._tickCooldowns(dt);
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

  _drawDungeonWorld(ctx) {
    const room = this._getRoom();
    if (!room) return;

    const x0 = room.x - room.w * 0.5;
    const y0 = room.y - room.h * 0.5;

    ctx.fillStyle = "rgba(28,28,38,1)";
    ctx.fillRect(x0, y0, room.w, room.h);

    const cell = 24;
    for (let y = 0; y < room.h; y += cell) {
      for (let x = 0; x < room.w; x += cell) {
        const wx = x0 + x;
        const wy = y0 + y;
        const n = hash2((wx / cell) | 0, (wy / cell) | 0, this.dungeon.floor | 0) >>> 0;
        ctx.fillStyle = n % 2 === 0 ? "rgba(46,46,58,1)" : "rgba(40,40,50,1)";
        ctx.fillRect(wx, wy, cell + 1, cell + 1);
      }
    }

    ctx.fillStyle = "rgba(64,54,40,1)";
    ctx.fillRect(x0 - 18, y0 - 18, room.w + 36, 18);
    ctx.fillRect(x0 - 18, y0 + room.h, room.w + 36, 18);
    ctx.fillRect(x0 - 18, y0, 18, room.h);
    ctx.fillRect(x0 + room.w, y0, 18, room.h);
  }

  _drawDungeonOverlayWorld(ctx) {
    const room = this._getRoom();
    if (!room) return;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(room.x - room.w * 0.5, room.y - room.h * 0.5, room.w, room.h);
    ctx.restore();
  }

  _handleMenus() {
    if (this.input.wasPressed("i")) this.menu.open = this.menu.open === "inventory" ? null : "inventory";
    if (this.input.wasPressed("k")) this.menu.open = this.menu.open === "skills" ? null : "skills";
    if (this.input.wasPressed("g")) this.menu.open = this.menu.open === "god" ? null : "god";
    if (this.input.wasPressed("m")) this.menu.open = this.menu.open === "map" ? null : "map";
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

  _handleSpells() {
    const aim = this._getAim();

    if (this.input.wasPressed("q")) this._castSpark(aim.x, aim.y);
    if (this.input.wasPressed("w")) this._castNova();
    if (this.input.wasPressed("e")) this._castDash(aim.x, aim.y);
    if (this.input.wasPressed("r")) this._castOrb(aim.x, aim.y);
  }

  _handleShopInput() {
    if (!this.shop.campId) return;

    if (this.input.wasPressed("1")) {
      this._buyPotion("hp");
      return;
    }
    if (this.input.wasPressed("2")) {
      this._buyPotion("mana");
      return;
    }
    if (this.input.wasPressed("3")) {
      this._buyStockItem(0);
      return;
    }
    if (this.input.wasPressed("4")) {
      this._buyStockItem(1);
      return;
    }
    if (this.input.wasPressed("5")) {
      this._sellInventoryIndex(0);
      return;
    }
    if (this.input.wasPressed("6")) {
      this._sellInventoryIndex(1);
      return;
    }
    if (this.input.wasPressed("7")) {
      this._sellInventoryIndex(2);
      return;
    }
    if (this.input.wasPressed("8")) {
      this._sellInventoryIndex(3);
      return;
    }
    if (this.input.wasPressed("9")) {
      this._sellInventoryIndex(4);
      return;
    }
  }

  _toggleShop() {
    const camp = this._cachedNearbyCamp;
    if (!camp) {
      if (this.menu.open === "shop") {
        this.menu.open = null;
      } else {
        this._msg("No camp nearby");
      }
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
    this._msg(`Camp ${camp.id} shop`, 1.0);
  }

  _refreshShopForCamp(camp) {
    const needsRefresh =
      this.shop.campId !== camp.id ||
      this.shop.lastRefreshLevel !== this.hero.level;

    if (!needsRefresh) return;

    this.shop.campId = camp.id;
    this.shop.stockSeed = hash2(camp.id | 0, this.hero.level | 0, this.seed | 0);
    this.shop.refreshTier = Math.max(1, this.hero.level);
    this.shop.lastRefreshLevel = this.hero.level;

    const rng = new RNG(this.shop.stockSeed);
    const weaponRarityRoll = rng.float();
    const armorRarityRoll = rng.float();

    const weaponRarity =
      weaponRarityRoll < 0.55 ? "common" :
      weaponRarityRoll < 0.84 ? "uncommon" :
      weaponRarityRoll < 0.96 ? "rare" : "epic";

    const armorRarity =
      armorRarityRoll < 0.58 ? "common" :
      armorRarityRoll < 0.86 ? "uncommon" :
      armorRarityRoll < 0.97 ? "rare" : "epic";

    const weapon = makeGear("weapon", this.hero.level, weaponRarity, hash2(this.shop.stockSeed, 11));
    const armor = makeGear("armor", this.hero.level, armorRarity, hash2(this.shop.stockSeed, 23));

    weapon.price = Math.max(20, Math.round(weapon.price * 1.15));
    armor.price = Math.max(18, Math.round(armor.price * 1.12));

    this.shop.stock = [weapon, armor];
  }

  _buyPotion(kind) {
    const cost = kind === "mana" ? 16 : 14;
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
    this.hero.inventory.push({ ...item });
    this._msg(`Bought ${item.name}`, 1.2);

    const replacementSlot = item.slot || (index === 0 ? "weapon" : "armor");
    const replacement = makeGear(
      replacementSlot,
      this.hero.level,
      null,
      hash2(this.shop.stockSeed, this.time * 1000 | 0, index | 0)
    );
    replacement.price = Math.max(16, Math.round(replacement.price * 1.12));
    this.shop.stock[index] = replacement;

    this._saveSoon();
  }

  _sellInventoryIndex(index) {
    const inv = this.hero.inventory || [];
    if (index < 0 || index >= inv.length) return;

    const item = inv[index];
    if (!item) return;

    const sellPrice = Math.max(4, Math.round((item.price || 10) * 0.45));
    this.hero.gold += sellPrice;
    inv.splice(index, 1);
    this._msg(`Sold ${item.name} for ${sellPrice}G`, 1.1);
    this._saveSoon();
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
        0.18,
        this.hero.level,
        { friendly: true, nova: true, radius: 12, hitRadius: 76, color: "#d6f5ff" }
      )
    );

    this.cooldowns.w = def.cd;
    this._spellMsg("Nova");
    this._shake(0.04, 1.6);
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

    this.hero.state.dashT = 0.12;
    this.cooldowns.e = def.cd;
    this._shake(0.08, 3.0);
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
          this.hero.takeDamage?.(p.dmg || 4);
          p.alive = false;
          this._shake(0.05, 1.6);
          continue;
        }
      }

      if (p.friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist2(p.x, p.y, e.x, e.y) < (p.hitRadius || 18) ** 2) {
            e.takeDamage?.(p.dmg || 4);

            if (!p.meta?.pierce) p.alive = false;

            if (!e.alive) {
              this._dropLoot(e.x, e.y, e.tier || 1);
              this.hero.giveXP?.(e.xpValue?.() || 4);
              this._onEnemyKilled(e);
              this._killFlashT = 0.7;
              this._combatTextT = 0.65;
              this._shake(0.05, 1.7);
            }
            break;
          }
        }
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive !== false);
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
            const current = this.hero.equip?.[gear.slot];
            if (!current) {
              this.hero.equip[gear.slot] = gear;
              this._msg(`Equipped ${gear.name}`, 1.0);
            } else {
              this.hero.inventory.push(gear);
              this._msg(`Looted ${gear.name}`, 1.0);
            }
          }
        }
      }
    }

    this.loot = this.loot.filter((l) => l.alive !== false);
  }

  _dropLoot(x, y, lvl) {
    if (this.loot.length >= this.perf.maxLoot) return;

    if (Math.random() < 0.72) {
      this.loot.push(new Loot(x, y, "gold", { amount: 4 + Math.floor(Math.random() * 6) + (lvl | 0) }));
    }

    if (Math.random() < 0.18 && this.loot.length < this.perf.maxLoot) {
      this.loot.push(new Loot(x, y, "gear", makeGear("weapon", lvl, null, hash2(x | 0, y | 0, lvl | 0))));
    }

    if (Math.random() < 0.09 && this.loot.length < this.perf.maxLoot) {
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

    const e = new Enemy(x, y, this.hero.level, kind, hash2(x | 0, y | 0, this.time | 0));
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
      const heroNear = dist2(this.hero.x, this.hero.y, camp.x, camp.y) < this.perf.campAggroRadius * this.perf.campAggroRadius;

      let campCount = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.campId === camp.id) campCount++;
      }

      const desired = heroNear ? 3 : 2;
      if (campCount >= desired) continue;

      const missing = desired - campCount;
      for (let i = 0; i < missing; i++) {
        if (this.enemies.length >= this.perf.maxEnemies) break;

        const ang = Math.random() * Math.PI * 2;
        const rr = 72 + Math.random() * 56;
        const ex = camp.x + Math.cos(ang) * rr;
        const ey = camp.y + Math.sin(ang) * rr;

        if (!this.world.canWalk(ex, ey)) continue;
        if (this.world._isNearWater?.(ex, ey, 40)) continue;
        if (dist2(ex, ey, this.hero.x, this.hero.y) < 190 * 190) continue;

        const roll = Math.random();
        const kind =
          roll < 0.14 ? "brute" :
          roll < 0.34 ? "stalker" :
          roll < 0.46 ? "caster" :
          "blob";

        const e = new Enemy(ex, ey, Math.max(1, this.hero.level), kind, hash2(ex | 0, ey | 0, camp.id | 0));
        e.home = { x: camp.x, y: camp.y };
        e.campId = camp.id;
        this.enemies.push(e);
      }
    }
  }

  _applyEnemyTouchDamage(e) {
    if (!e?.alive) return;

    const close = dist2(e.x, e.y, this.hero.x, this.hero.y) < (e.radius + 16) ** 2;
    if (!close) return;

    if (this._touchShakeCd <= 0) {
      this._touchShakeCd = 0.10;
      this._shake(0.03, 1.1);
    }

    if (this._touchDamageCd > 0) return;
    this._touchDamageCd = this.perf.touchDamageTick;

    this.hero.takeDamage?.((e.touchDps || 3) * this.perf.touchDamageTick);
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

    this.enemies = this.enemies.filter((e) => e.alive !== false);

    if (this.enemies.length === 0) {
      if (room.exits.next) this._advanceDungeon();
      else this._completeDungeon();
    }
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

    const existing = this.quests.find((q) => q.campId === camp.id && !q.turnedIn);

    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 20);
    this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + 20);

    if (existing && existing.done) {
      existing.turnedIn = true;
      this.hero.gold += existing.rewardGold || 0;
      this.hero.giveXP?.(existing.rewardXp || 0);
      this.questTurnIn = { id: existing.id, name: existing.name };
      this._msg(`Quest complete: +${existing.rewardGold} Gold +${existing.rewardXp} XP`, 1.8);
      this._saveSoon();
      return;
    }

    if (existing && !existing.done) {
      this._msg(`Rested at camp • ${existing.have}/${existing.need} ${existing.target}`, 1.5);
      return;
    }

    const quest = this._createCampQuest(camp);
    this.quests.push(quest);
    this._msg(`New quest: ${quest.name}`, 1.6);
    this._saveSoon();
  }

  _handleFastTravelInput() {
    if (this.menu.open !== "map") return;
    if (this.dungeon.active) return;
    if (this.hero.state?.sailing) return;

    if (this.input.wasPressed("z")) {
      this.world?.toggleMapScale?.();
      this._msg(`Map scale: ${this.world.mapMode}`, 1.2);
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
      this.zoneMsg = `Dungeon Floor ${this.dungeon.floor}`;
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
      this.zoneMsg = "Camp";
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
      const exists = this.quests.some((q) => q.campId === camp.id && !q.turnedIn);
      if (!exists && this.progress?.visitedCamps?.has?.(camp.id)) {
        this.quests.push(this._createCampQuest(camp));
      }
    }
  }

  _createCampQuest(camp) {
    const types = ["blob", "stalker", "caster"];
    const target = types[Math.floor(Math.random() * types.length)];
    const need = 3 + Math.floor(Math.random() * 3);
    const rewardGold = 18 + need * 6 + this.hero.level * 2;
    const rewardXp = 14 + need * 5 + this.hero.level * 2;

    return {
      id: this._questIdCounter++,
      type: "kill",
      campId: camp.id,
      name: `Camp ${camp.id}: Hunt ${target}s`,
      desc: `Defeat ${need} ${target}${need > 1 ? "s" : ""} near Camp ${camp.id}. Return to camp for payment.`,
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

    this.quests = this.quests.slice(-12);
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

    this.hero.vx = 0;
    this.hero.vy = 0;
    this.hero.state.sailing = false;
  }

  _ensureWorldPopulation() {
    if (this.enemies.length > 0) return;

    const camps = this.world?.camps || [];
    for (const camp of camps) {
      for (let i = 0; i < 2; i++) {
        const a = (i / 2) * Math.PI * 2 + (camp.id || 0) * 0.33;
        const ex = camp.x + Math.cos(a) * 110;
        const ey = camp.y + Math.sin(a) * 110;
        if (!this.world?.canWalk?.(ex, ey)) continue;
        if (this.world?._isNearWater?.(ex, ey, 48)) continue;

        const kind = i === 0 ? "blob" : "stalker";
        const e = new Enemy(
          ex,
          ey,
          Math.max(1, this.hero.level),
          kind,
          hash2(ex | 0, ey | 0, camp.id | 0)
        );
        e.home = { x: camp.x, y: camp.y };
        e.campId = camp.id;
        this.enemies.push(e);
        if (this.enemies.length >= 10) return;
      }
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