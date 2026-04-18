// src/save.js
// v101.2 SAVE RESTORE
// - stable save/load
// - compatibility aliases
// - sanitizes partial / older saves
// - prevents bad coords / bad state reloads

export default class Save {
  constructor(key = "broke-knight-save") {
    this.key = String(key || "broke-knight-save");
    this.version = 7;
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

  // compatibility aliases
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

    const heroSrc = src.hero && typeof src.hero === "object" ? src.hero : {};
    const progressSrc = src.progress && typeof src.progress === "object" ? src.progress : {};
    const dungeonSrc = src.dungeon && typeof src.dungeon === "object" ? src.dungeon : {};
    const menuSrc = src.menu && typeof src.menu === "object" ? src.menu : {};
    const cooldownsSrc = src.cooldowns && typeof src.cooldowns === "object" ? src.cooldowns : {};
    const skillProgSrc = src.skillProg && typeof src.skillProg === "object" ? src.skillProg : {};

    const out = {
      seed: this._num(src.seed, 0),

      hero: {
        x: this._finiteCoord(heroSrc.x, 0),
        y: this._finiteCoord(heroSrc.y, 0),
        vx: this._safeVelocity(heroSrc.vx),
        vy: this._safeVelocity(heroSrc.vy),

        level: Math.max(1, this._int(heroSrc.level, 1)),
        xp: Math.max(0, this._int(heroSrc.xp, 0)),
        nextXp: Math.max(1, this._int(heroSrc.nextXp, 16)),

        maxHp: Math.max(1, this._int(heroSrc.maxHp, 100)),
        hp: Math.max(1, this._int(heroSrc.hp, 100)),

        maxMana: Math.max(0, this._int(heroSrc.maxMana, 60)),
        mana: Math.max(0, this._int(heroSrc.mana, 60)),

        gold: Math.max(0, this._int(heroSrc.gold, 0)),

        inventory: this._array(heroSrc.inventory),
        equip: this._object(heroSrc.equip),
        potions: {
          hp: Math.max(0, this._int(heroSrc?.potions?.hp, 2)),
          mana: Math.max(0, this._int(heroSrc?.potions?.mana, 1)),
        },

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
        dungeonBest: Math.max(0, this._int(progressSrc.dungeonBest, 0)),
        visitedCamps: this._stringArray(progressSrc.visitedCamps),
        eliteKills: Math.max(0, this._int(progressSrc.eliteKills, 0)),
        campRenown: this._object(progressSrc.campRenown),
        campRestBonusClaimed: this._object(progressSrc.campRestBonusClaimed),
      },

      dungeon: {
        active: false,
        floor: Math.max(0, this._int(dungeonSrc.floor, 0)),
        currentRoomIndex: Math.max(0, this._int(dungeonSrc.currentRoomIndex, 0)),
        seed: this._int(dungeonSrc.seed, 0),
      },

      menu: {
        open: this._menuValue(menuSrc.open),
      },

      cooldowns: {
        q: Math.max(0, this._num(cooldownsSrc.q, 0)),
        w: Math.max(0, this._num(cooldownsSrc.w, 0)),
        e: Math.max(0, this._num(cooldownsSrc.e, 0)),
        r: Math.max(0, this._num(cooldownsSrc.r, 0)),
      },

      skillProg: {
        q: this._skill(skillProgSrc.q),
        w: this._skill(skillProgSrc.w),
        e: this._skill(skillProgSrc.e),
        r: this._skill(skillProgSrc.r),
      },
    };

    out.hero.hp = Math.min(out.hero.hp, out.hero.maxHp);
    out.hero.mana = Math.min(out.hero.mana, out.hero.maxMana);

    return out;
  }

  _skill(src) {
    const s = src && typeof src === "object" ? src : {};
    return {
      xp: Math.max(0, this._int(s.xp, 0)),
      level: Math.max(1, this._int(s.level, 1)),
    };
  }

  _menuValue(v) {
    const allowed = new Set([
      null,
      "map",
      "inventory",
      "skills",
      "quests",
      "shop",
      "options",
      "god",
      "menu",
      "gear",
    ]);
    return allowed.has(v ?? null) ? (v ?? null) : null;
  }

  _safeVelocity(v) {
    const n = this._num(v, 0);
    return Math.max(-2000, Math.min(2000, n));
  }

  _finiteCoord(v, fallback = 0) {
    const n = this._num(v, fallback);
    const limit = 100000;
    return Math.max(-limit, Math.min(limit, n));
  }

  _vec2(v, fallback = { x: 0, y: 0 }) {
    const src = v && typeof v === "object" ? v : {};
    return {
      x: this._num(src.x, fallback.x),
      y: this._num(src.y, fallback.y),
    };
  }

  _array(v) {
    return Array.isArray(v) ? v : [];
  }

  _stringArray(v) {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x));
  }

  _object(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  _num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  _int(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }
}