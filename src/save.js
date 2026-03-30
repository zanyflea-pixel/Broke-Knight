// src/save.js
// v32 SAFE SAVE COMPAT + FORWARD-PROOFING PASS (FULL FILE)
// Goals:
// - keep existing save behavior working
// - preserve elite/progression fields
// - add safer defaults for newer hero fields
// - sanitize data more defensively
// - keep load/save simple and compatible

export default class Save {
  constructor(key = "broke-knight-save") {
    this.key = String(key || "broke-knight-save");
    this.version = 2;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;

      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;

      return this._sanitize(data);
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
      if (!text || typeof text !== "string") return null;
      const parsed = JSON.parse(text);
      return this._sanitize(parsed);
    } catch (_) {
      return null;
    }
  }

  hasSave() {
    try {
      return !!localStorage.getItem(this.key);
    } catch (_) {
      return false;
    }
  }

  _sanitize(data) {
    const out = {
      seed: 0,

      hero: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,

        hp: 100,
        maxHp: 100,
        mana: 60,
        maxMana: 60,

        hpRegen: 1.5,
        manaRegen: 6.0,

        speed: 180,

        gold: 0,
        level: 1,
        xp: 0,
        nextXp: 30,

        potions: {
          hp: 2,
          mana: 1,
        },

        inventory: [],
        equip: {},

        state: {
          sailing: false,
          dashT: 0,
          hurtT: 0,
        },

        lastMove: { x: 1, y: 0 },
      },

      quests: [],

      progress: {
        discoveredWaystones: [],
        discoveredDocks: [],
        clearedCamps: [],
        eliteKills: 0,
        currentZoneText: "Wilderness",
      },
    };

    if (!data || typeof data !== "object") return out;

    // seed
    if (Number.isFinite(data.seed)) {
      out.seed = data.seed | 0;
    }

    // hero
    const h = data.hero;
    if (h && typeof h === "object") {
      if (Number.isFinite(h.x)) out.hero.x = +h.x;
      if (Number.isFinite(h.y)) out.hero.y = +h.y;
      if (Number.isFinite(h.vx)) out.hero.vx = +h.vx;
      if (Number.isFinite(h.vy)) out.hero.vy = +h.vy;

      if (Number.isFinite(h.hp)) out.hero.hp = Math.max(0, +h.hp);
      if (Number.isFinite(h.maxHp)) out.hero.maxHp = Math.max(1, +h.maxHp);

      if (Number.isFinite(h.mana)) out.hero.mana = Math.max(0, +h.mana);
      if (Number.isFinite(h.maxMana)) out.hero.maxMana = Math.max(1, +h.maxMana);

      if (Number.isFinite(h.hpRegen)) out.hero.hpRegen = Math.max(0, +h.hpRegen);
      if (Number.isFinite(h.manaRegen)) out.hero.manaRegen = Math.max(0, +h.manaRegen);

      if (Number.isFinite(h.speed)) out.hero.speed = Math.max(0, +h.speed);

      if (Number.isFinite(h.gold)) out.hero.gold = Math.max(0, h.gold | 0);
      if (Number.isFinite(h.level)) out.hero.level = Math.max(1, h.level | 0);
      if (Number.isFinite(h.xp)) out.hero.xp = Math.max(0, h.xp | 0);
      if (Number.isFinite(h.nextXp)) out.hero.nextXp = Math.max(1, h.nextXp | 0);

      // clamp current resources to max after both have been read
      out.hero.hp = Math.min(out.hero.hp, out.hero.maxHp);
      out.hero.mana = Math.min(out.hero.mana, out.hero.maxMana);

      if (h.potions && typeof h.potions === "object") {
        out.hero.potions.hp = Math.max(0, h.potions.hp | 0);
        out.hero.potions.mana = Math.max(0, h.potions.mana | 0);
      }

      if (Array.isArray(h.inventory)) {
        out.hero.inventory = h.inventory
          .filter(v => v && typeof v === "object")
          .map(v => this._sanitizeItem(v))
          .filter(Boolean);
      }

      if (h.equip && typeof h.equip === "object") {
        const eq = {};
        for (const k of Object.keys(h.equip)) {
          const item = this._sanitizeItem(h.equip[k]);
          if (item) eq[k] = item;
        }
        out.hero.equip = eq;
      }

      if (h.state && typeof h.state === "object") {
        out.hero.state.sailing = !!h.state.sailing;
        out.hero.state.dashT = Number.isFinite(h.state.dashT) ? Math.max(0, +h.state.dashT) : 0;
        out.hero.state.hurtT = Number.isFinite(h.state.hurtT) ? Math.max(0, +h.state.hurtT) : 0;
      }

      if (h.lastMove && typeof h.lastMove === "object") {
        let lx = Number.isFinite(h.lastMove.x) ? +h.lastMove.x : 1;
        let ly = Number.isFinite(h.lastMove.y) ? +h.lastMove.y : 0;

        if (!Number.isFinite(lx)) lx = 1;
        if (!Number.isFinite(ly)) ly = 0;
        if (lx === 0 && ly === 0) lx = 1;

        out.hero.lastMove = { x: lx, y: ly };
      }
    }

    // quests
    if (Array.isArray(data.quests)) {
      out.quests = data.quests
        .filter(q => q && typeof q === "object")
        .map(q => ({
          id: String(q.id || ""),
          name: String(q.name || ""),
          desc: String(q.desc || ""),
          goal: Math.max(0, q.goal | 0),
          prog: Math.max(0, q.prog | 0),
          done: !!q.done,
          xp: Math.max(0, q.xp | 0),
          gold: Math.max(0, q.gold | 0),
        }));
    }

    // progress
    const p = data.progress;
    if (p && typeof p === "object") {
      if (Array.isArray(p.discoveredWaystones)) {
        out.progress.discoveredWaystones = dedupeInts(p.discoveredWaystones);
      }

      if (Array.isArray(p.discoveredDocks)) {
        out.progress.discoveredDocks = dedupeInts(p.discoveredDocks);
      }

      if (Array.isArray(p.clearedCamps)) {
        out.progress.clearedCamps = dedupeInts(p.clearedCamps);
      }

      if (Number.isFinite(p.eliteKills)) {
        out.progress.eliteKills = Math.max(0, p.eliteKills | 0);
      }

      if (typeof p.currentZoneText === "string" && p.currentZoneText.trim()) {
        out.progress.currentZoneText = p.currentZoneText.trim();
      }
    }

    return out;
  }

  _sanitizeItem(item) {
    if (!item || typeof item !== "object") return null;

    const stats = item.stats && typeof item.stats === "object" ? item.stats : {};

    return {
      slot: String(item.slot || "gear"),
      level: Math.max(1, item.level | 0),
      rarity: String(item.rarity || "common"),
      name: String(item.name || "Gear"),
      stats: {
        dmg: Math.max(0, stats.dmg | 0),
        armor: Math.max(0, stats.armor | 0),
        crit: Number.isFinite(stats.crit) ? Math.max(0, +stats.crit) : 0,
      },
      price: Math.max(0, item.price | 0),
    };
  }
}

function dedupeInts(arr) {
  const out = [];
  const seen = new Set();

  for (const v of arr) {
    const n = v | 0;
    if (!Number.isFinite(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out;
}