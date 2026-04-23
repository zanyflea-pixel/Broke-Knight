// src/save.js
// v105.4 FULL SAVE FILE
// - safer sanitizing for partial / older saves
// - preserves hero / progress / cooldown / menu / skills
// - avoids unsafe temporary reload states
// - compatible with current game.js

export default class Save {
  constructor(key = "broke-knight-save") {
    this.key = String(key || "broke-knight-save");
    this.version = 11;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;

      return this._sanitize(parsed);
    } catch (_) {
      return null;
    }
  }

  save(data) {
    try {
      const clean = this._sanitize(data);
      clean._meta = {
        version: this.version,
        savedAt: Date.now(),
      };

      localStorage.setItem(this.key, JSON.stringify(clean));
      return true;
    } catch (_) {
      return false;
    }
  }

  clear() {
    try {
      localStorage.removeItem(this.key);
      return true;
    } catch (_) {
      return false;
    }
  }

  hasSave() {
    try {
      return !!localStorage.getItem(this.key);
    } catch (_) {
      return false;
    }
  }

  exportString(data) {
    try {
      const clean = this._sanitize(data);
      clean._meta = {
        version: this.version,
        savedAt: Date.now(),
      };
      return JSON.stringify(clean);
    } catch (_) {
      return "";
    }
  }

  importString(text) {
    try {
      if (typeof text !== "string" || !text.trim()) return null;
      const parsed = JSON.parse(text);
      return this._sanitize(parsed);
    } catch (_) {
      return null;
    }
  }

  get() {
    return this.load();
  }

  set(data) {
    return this.save(data);
  }

  read() {
    return this.load();
  }

  write(data) {
    return this.save(data);
  }

  _sanitize(data) {
    const src = data && typeof data === "object" ? data : {};

    const heroSrc = this._object(src.hero);
    const progressSrc = this._object(src.progress);
    const dungeonSrc = this._object(src.dungeon);
    const menuSrc = this._object(src.menu);
    const cooldownsSrc = this._object(src.cooldowns);
    const skillProgSrc = this._object(src.skillProg);
    const questSrc = this._object(src.quest);

    const out = {
      seed: this._num(src.seed, 0, -2147483648, 2147483647),
      worldBuild: typeof src.worldBuild === "string" ? src.worldBuild.slice(0, 40) : "",
      trackedObjective: this._trackValue(src.trackedObjective),

      hero: {
        x: this._finiteCoord(heroSrc.x, 0),
        y: this._finiteCoord(heroSrc.y, 0),
        vx: 0,
        vy: 0,

        level: this._int(heroSrc.level, 1, 1, 999),
        xp: this._int(heroSrc.xp, 0, 0, 999999999),
        nextXp: this._int(heroSrc.nextXp, 16, 1, 999999999),

        maxHp: this._int(heroSrc.maxHp, 100, 1, 999999),
        hp: this._int(heroSrc.hp, 100, 0, 999999),

        maxMana: this._int(heroSrc.maxMana, 60, 0, 999999),
        mana: this._int(heroSrc.mana, 60, 0, 999999),

        gold: this._int(heroSrc.gold, 0, 0, 999999999),
        classId: this._classValue(heroSrc.classId),

        inventory: this._sanitizeInventory(heroSrc.inventory),
        equip: this._sanitizeEquip(heroSrc.equip),

        potions: {
          hp: this._int(heroSrc?.potions?.hp, 2, 0, 9999),
          mana: this._int(heroSrc?.potions?.mana, 1, 0, 9999),
        },
        bonusStats: this._bonusStats(heroSrc.bonusStats),

        state: {
          sailing: false,
          dashT: 0,
          hurtT: 0,
          slowT: 0,
          poisonT: 0,
        },

        lastMove: this._vec2(heroSrc.lastMove, { x: 1, y: 0 }),
        aimDir: this._vec2(heroSrc.aimDir, { x: 1, y: 0 }),
      },

      progress: {
        discoveredWaystones: this._stringArray(progressSrc.discoveredWaystones),
        discoveredDocks: this._stringArray(progressSrc.discoveredDocks),
        dungeonBest: this._int(progressSrc.dungeonBest, 0, 0, 9999),
        visitedCamps: this._stringArray(progressSrc.visitedCamps),
        eliteKills: this._int(progressSrc.eliteKills, 0, 0, 999999),
        bountyCompletions: this._int(progressSrc.bountyCompletions, 0, 0, 999999),
        campRenown: this._object(progressSrc.campRenown),
        campRestBonusClaimed: this._object(progressSrc.campRestBonusClaimed),
        claimedShrines: this._stringArray(progressSrc.claimedShrines),
        openedCaches: this._stringArray(progressSrc.openedCaches),
        discoveredSecrets: this._stringArray(progressSrc.discoveredSecrets),
        defeatedDragons: this._stringArray(progressSrc.defeatedDragons),
        relicShards: this._int(progressSrc.relicShards, 0, 0, 999999),
        storyMilestones: this._object(progressSrc.storyMilestones),
        visitedTowns: this._stringArray(progressSrc.visitedTowns),
        crossedBridges: this._stringArray(progressSrc.crossedBridges),
        exploredCells: this._stringArray(progressSrc.exploredCells).slice(0, 120000),
      },

      dungeon: {
        active: false,
        floor: this._int(dungeonSrc.floor, 0, 0, 9999),
        currentRoomIndex: this._int(dungeonSrc.currentRoomIndex, 0, 0, 9999),
        seed: this._int(dungeonSrc.seed, 0, -2147483648, 2147483647),
        origin: this._point(dungeonSrc.origin, null),
      },

      menu: {
        open: this._menuValue(menuSrc.open),
        mapZoom: this._num(menuSrc.mapZoom, 1, 1, 8),
      },

      cooldowns: {
        q: this._num(cooldownsSrc.q, 0, 0, 999),
        w: this._num(cooldownsSrc.w, 0, 0, 999),
        e: this._num(cooldownsSrc.e, 0, 0, 999),
        r: this._num(cooldownsSrc.r, 0, 0, 999),
      },

      skillProg: {
        q: this._skill(skillProgSrc.q),
        w: this._skill(skillProgSrc.w),
        e: this._skill(skillProgSrc.e),
        r: this._skill(skillProgSrc.r),
      },

      quest: this._quest(questSrc),
    };

    out.hero.hp = Math.min(out.hero.hp, out.hero.maxHp);
    out.hero.mana = Math.min(out.hero.mana, out.hero.maxMana);

    out.hero.vx = 0;
    out.hero.vy = 0;
    out.hero.state.sailing = false;
    out.hero.state.dashT = 0;
    out.hero.state.hurtT = 0;
    out.hero.state.slowT = 0;
    out.hero.state.poisonT = 0;

    out.dungeon.active = false;

    return out;
  }

  _sanitizeInventory(v) {
    if (!Array.isArray(v)) return [];
    return v
      .filter((item) => item && typeof item === "object")
      .map((item) => this._sanitizeGear(item));
  }

  _sanitizeEquip(v) {
    const src = this._object(v);
    const out = {};
    for (const key of ["weapon", "armor", "helm", "boots", "ring", "trinket"]) {
      if (src[key] && typeof src[key] === "object") {
        out[key] = this._sanitizeGear(src[key]);
      }
    }
    return out;
  }

  _sanitizeGear(item) {
    const src = item && typeof item === "object" ? item : {};
    const statsSrc = this._object(src.stats);

    const allowedSlots = new Set(["weapon", "armor", "helm", "boots", "ring", "trinket"]);
    const allowedRarities = new Set(["common", "uncommon", "rare", "epic"]);

    return {
      slot: allowedSlots.has(src.slot) ? src.slot : "trinket",
      level: this._int(src.level, 1, 1, 999),
      rarity: allowedRarities.has(src.rarity) ? src.rarity : "common",
      name: String(src.name || "Gear"),
      affix: String(src.affix || ""),
      score: this._int(src.score, 0, 0, 999999),
      color: typeof src.color === "string" ? src.color : "#d9dee8",
      stats: {
        dmg: this._int(statsSrc.dmg, 0, 0, 99999),
        armor: this._int(statsSrc.armor, 0, 0, 99999),
        hp: this._int(statsSrc.hp, 0, 0, 99999),
        mana: this._int(statsSrc.mana, 0, 0, 99999),
        crit: this._num(statsSrc.crit, 0, 0, 1),
        critMult: this._num(statsSrc.critMult, 0, 0, 100),
        move: this._num(statsSrc.move, 0, 0, 100),
      },
    };
  }

  _skill(src) {
    const s = this._object(src);
    return {
      xp: this._int(s.xp, 0, 0, 99999999),
      level: this._int(s.level, 1, 1, 9999),
    };
  }

  _quest(src) {
    const q = this._object(src);
    const allowedTargets = new Set(["blob", "wolf", "stalker", "scout", "caster", "brute", "ashling", "wisp", "sentinel", "thorn", "duelist", "mender"]);
    const needed = this._int(q.needed, 4, 1, 9999);
    return {
      type: "bounty",
      target: allowedTargets.has(q.target) ? q.target : "blob",
      needed,
      count: this._int(q.count, 0, 0, needed),
      rewardGold: this._int(q.rewardGold, 20, 0, 999999),
      rewardXp: this._int(q.rewardXp, 10, 0, 999999),
    };
  }

  _menuValue(v) {
    return this._allowedMenus().has(v ?? null) ? (v ?? null) : null;
  }

  _allowedMenus() {
    return new Set([
      null,
      "map",
      "inventory",
      "skills",
      "quests",
      "shop",
      "town",
      "dev",
      "options",
      "god",
      "menu",
      "gear",
    ]);
  }

  _trackValue(v) {
    const s = typeof v === "string" ? v : "story";
    const allowed = new Set(["story", "bounty", "town", "dungeon", "dragon", "treasure", "secret"]);
    return allowed.has(s) ? s : "story";
  }

  _classValue(v) {
    const s = typeof v === "string" ? v.toLowerCase() : "knight";
    const allowed = new Set(["knight", "ranger", "arcanist", "raider"]);
    return allowed.has(s) ? s : "knight";
  }

  _bonusStats(v) {
    const src = this._object(v);
    return {
      hp: this._int(src.hp, 0, 0, 999999),
      mana: this._int(src.mana, 0, 0, 999999),
    };
  }

  _vec2(v, fallback = { x: 0, y: 0 }) {
    const src = this._object(v);
    let x = this._num(src.x, fallback.x, -1, 1);
    let y = this._num(src.y, fallback.y, -1, 1);

    if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001) {
      x = fallback.x;
      y = fallback.y;
    }

    return { x, y };
  }

  _point(v, fallback = null) {
    if (!v || typeof v !== "object") return fallback;
    return {
      x: this._finiteCoord(v.x, 0),
      y: this._finiteCoord(v.y, 0),
    };
  }

  _finiteCoord(v, fallback = 0) {
    return this._num(v, fallback, -100000, 100000);
  }

  _stringArray(v) {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x));
  }

  _object(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  _num(v, fallback = 0, min = -Infinity, max = Infinity) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  _int(v, fallback = 0, min = -Infinity, max = Infinity) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.trunc(n);
    if (i < min) return min;
    if (i > max) return max;
    return i;
  }
}
