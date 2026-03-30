// src/save.js
// v31 ELITE / PROGRESSION SAVE PASS (FULL FILE)
// What this pass fixes:
// - persists elite kill progress from the latest game.js
// - keeps discovered waystones / docks / cleared camps
// - prevents new progression fields from being lost on reload
// - still stays simple and safe
//
// Replace ENTIRE file: src/save.js

export default class Save {
  constructor(key = "broke-knight-save") {
    this.key = String(key || "broke-knight-save");
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

  _sanitize(data) {
    const out = {
      seed: 0,
      hero: {
        x: 0,
        y: 0,
        hp: 100,
        mana: 60,
        gold: 0,
        level: 1,
        xp: 0,
        nextXp: 30,
        potions: { hp: 2, mana: 1 },
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
      },
    };

    if (!data || typeof data !== "object") return out;

    // seed
    if (Number.isFinite(data.seed)) out.seed = data.seed | 0;

    // hero
    const h = data.hero;
    if (h && typeof h === "object") {
      if (Number.isFinite(h.x)) out.hero.x = +h.x;
      if (Number.isFinite(h.y)) out.hero.y = +h.y;
      if (Number.isFinite(h.hp)) out.hero.hp = +h.hp;
      if (Number.isFinite(h.mana)) out.hero.mana = +h.mana;
      if (Number.isFinite(h.gold)) out.hero.gold = Math.max(0, h.gold | 0);
      if (Number.isFinite(h.level)) out.hero.level = Math.max(1, h.level | 0);
      if (Number.isFinite(h.xp)) out.hero.xp = Math.max(0, h.xp | 0);
      if (Number.isFinite(h.nextXp)) out.hero.nextXp = Math.max(1, h.nextXp | 0);

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
        out.hero.state.dashT = Number.isFinite(h.state.dashT) ? +h.state.dashT : 0;
        out.hero.state.hurtT = Number.isFinite(h.state.hurtT) ? +h.state.hurtT : 0;
      }

      if (h.lastMove && typeof h.lastMove === "object") {
        const lx = Number.isFinite(h.lastMove.x) ? +h.lastMove.x : 1;
        const ly = Number.isFinite(h.lastMove.y) ? +h.lastMove.y : 0;
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
        out.progress.discoveredWaystones = p.discoveredWaystones
          .map(v => v | 0)
          .filter((v, i, arr) => Number.isFinite(v) && arr.indexOf(v) === i);
      }

      if (Array.isArray(p.discoveredDocks)) {
        out.progress.discoveredDocks = p.discoveredDocks
          .map(v => v | 0)
          .filter((v, i, arr) => Number.isFinite(v) && arr.indexOf(v) === i);
      }

      if (Array.isArray(p.clearedCamps)) {
        out.progress.clearedCamps = p.clearedCamps
          .map(v => v | 0)
          .filter((v, i, arr) => Number.isFinite(v) && arr.indexOf(v) === i);
      }

      if (Number.isFinite(p.eliteKills)) {
        out.progress.eliteKills = Math.max(0, p.eliteKills | 0);
      }
    }

    return out;
  }

  _sanitizeItem(item) {
    if (!item || typeof item !== "object") return null;

    return {
      slot: String(item.slot || "gear"),
      level: Math.max(1, item.level | 0),
      rarity: String(item.rarity || "common"),
      name: String(item.name || "Gear"),
      stats: {
        dmg: Math.max(0, item.stats?.dmg | 0),
        armor: Math.max(0, item.stats?.armor | 0),
        crit: Number.isFinite(item.stats?.crit) ? +item.stats.crit : 0,
      },
      price: Math.max(0, item.price | 0),
    };
  }
}