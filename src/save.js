// src/save.js
// v58 SAVE COMPAT + RECOVERY PASS (FULL FILE)
// Goals:
// - keep current game.js compatibility
// - sanitize older / partial saves harder
// - prevent broken coords / bad state reloads
// - preserve hero / progress / cooldown / menu flow
// - never reload into unsafe dungeon / sailing / dead state

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

  _sanitize(data) {
    const src = data && typeof data === "object" ? data : {};

    const heroSrc = src.hero && typeof src.hero === "object" ? src.hero : {};
    const progressSrc = src.progress && typeof src.progress === "object" ? src.progress : {};
    const dungeonSrc = src.dungeon && typeof src.dungeon === "object" ? src.dungeon : {};
    const menuSrc = src.menu && typeof src.menu === "object" ? src.menu : {};
    const cooldownsSrc = src.cooldowns && typeof src.cooldowns === "object" ? src.cooldowns : {};

    const out = {
      seed: this._num(src.seed, 0),

      hero: {
        x: this._finiteCoord(heroSrc.x, 0),
        y: this._finiteCoord(heroSrc.y, 0),
        vx: this._safeVelocity(heroSrc.vx),
        vy: this._safeVelocity(heroSrc.vy),

        radius: this._num(heroSrc.radius, 10, 1, 128),
        r: this._num(heroSrc.r, 14, 1, 128),

        level: this._int(heroSrc.level, 1, 1, 9999),
        xp: this._int(heroSrc.xp, 0, 0, 1000000000),
        nextXp: this._int(heroSrc.nextXp, 30, 1, 1000000000),
        gold: this._int(heroSrc.gold, 0, 0, 1000000000),

        maxHp: this._num(heroSrc.maxHp, 100, 1, 1000000),
        hp: 0,
        maxMana: this._num(heroSrc.maxMana, 60, 0, 1000000),
        mana: 0,

        hpRegen: this._num(heroSrc.hpRegen, 1.5, 0, 10000),
        manaRegen: this._num(heroSrc.manaRegen, 6.0, 0, 10000),

        potions: {
          hp: this._int(heroSrc?.potions?.hp, 2, 0, 9999),
          mana: this._int(heroSrc?.potions?.mana, 1, 0, 9999),
        },

        inventory: this._sanitizeInventory(heroSrc.inventory),
        equip: this._sanitizeEquip(heroSrc.equip),

        state: {
          sailing: !!heroSrc?.state?.sailing,
          dashT: this._num(heroSrc?.state?.dashT, 0, 0, 999),
          hurtT: this._num(heroSrc?.state?.hurtT, 0, 0, 999),
        },

        lastMove: this._sanitizeDir(heroSrc.lastMove, { x: 1, y: 0 }),

        alive: heroSrc.alive !== false,
        dead: !!heroSrc.dead,
        animT: this._num(heroSrc.animT, 0, 0, 100000),
      },

      progress: {
        discoveredWaystones: this._intArray(progressSrc.discoveredWaystones),
        discoveredDocks: this._intArray(progressSrc.discoveredDocks),
        dungeonBest: this._int(progressSrc.dungeonBest, 0, 0, 9999),
        eliteKills: this._int(progressSrc.eliteKills, 0, 0, 999999),
      },

      dungeon: {
        active: !!dungeonSrc.active,
        floor: this._int(dungeonSrc.floor, 0, 0, 9999),
        seed: this._num(dungeonSrc.seed, 0),
        currentRoomIndex: this._int(dungeonSrc.currentRoomIndex, 0, 0, 9999),
        visited: this._intArray(dungeonSrc.visited),
      },

      cooldowns: {
        q: this._num(cooldownsSrc.q, 0, 0, 999),
        w: this._num(cooldownsSrc.w, 0, 0, 999),
        e: this._num(cooldownsSrc.e, 0, 0, 999),
        r: this._num(cooldownsSrc.r, 0, 0, 999),
      },

      skillLoadout: this._sanitizeSkillLoadout(src.skillLoadout),
      selectedSkillSlot: this._int(src.selectedSkillSlot, 0, 0, 3),

      quests: this._sanitizeQuests(src.quests),
      questTurnIn: this._sanitizeQuestTurnIn(src.questTurnIn),

      menu: {
        open: this._sanitizeMenu(menuSrc.open),
      },

      time: this._num(src.time, 0, 0, 1000000000),
      msg: typeof src.msg === "string" ? src.msg.slice(0, 120) : "",
      msgT: this._num(src.msgT, 0, 0, 999),
      zoneMsg: typeof src.zoneMsg === "string" ? src.zoneMsg.slice(0, 120) : "",
      zoneMsgT: this._num(src.zoneMsgT, 0, 0, 999),
    };

    out.hero.hp = this._num(heroSrc.hp, out.hero.maxHp, 0, out.hero.maxHp);
    out.hero.mana = this._num(heroSrc.mana, out.hero.maxMana, 0, out.hero.maxMana);

    if (out.hero.hp <= 0 || out.hero.dead) {
      out.hero.hp = out.hero.maxHp;
      out.hero.mana = Math.max(0, out.hero.mana);
      out.hero.alive = true;
      out.hero.dead = false;
      out.hero.state.hurtT = 0;
      out.hero.state.sailing = false;
    } else {
      out.hero.alive = true;
      out.hero.dead = false;
    }

    if (out.dungeon.active) {
      out.dungeon.active = false;
      out.dungeon.floor = 0;
      out.dungeon.currentRoomIndex = 0;
      out.dungeon.visited = [];
      out.hero.state.sailing = false;
    }

    if (Math.abs(out.hero.vx) < 0.001) out.hero.vx = 0;
    if (Math.abs(out.hero.vy) < 0.001) out.hero.vy = 0;

    out.hero.lastMove = this._sanitizeDir(out.hero.lastMove, { x: 1, y: 0 });

    return out;
  }

  _sanitizeInventory(inv) {
    if (!Array.isArray(inv)) return [];
    return inv
      .map((it) => this._sanitizeItem(it))
      .filter(Boolean)
      .slice(0, 300);
  }

  _sanitizeEquip(equip) {
    const src = equip && typeof equip === "object" ? equip : {};
    const out = {};

    const allowed = ["weapon", "armor", "chest", "helm", "boots", "ring", "trinket"];
    for (const key of allowed) {
      const item = this._sanitizeItem(src[key], key);
      if (item) out[key] = item;
    }

    return out;
  }

  _sanitizeItem(item, forcedSlot = null) {
    if (!item || typeof item !== "object") return null;

    const slot = this._sanitizeSlot(forcedSlot || item.slot);
    if (!slot) return null;

    const rarity = this._sanitizeRarity(item.rarity);
    const level = this._int(item.level, 1, 1, 9999);
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name.slice(0, 80)
        : this._fallbackItemName(slot, rarity);

    const statsSrc = item.stats && typeof item.stats === "object" ? item.stats : {};

    return {
      slot,
      level,
      rarity,
      name,
      stats: {
        dmg: this._int(statsSrc.dmg, 0, 0, 100000),
        armor: this._int(statsSrc.armor, 0, 0, 100000),
        crit: this._num(statsSrc.crit, 0, 0, 10),
      },
      price: this._int(item.price, 0, 0, 100000000),
    };
  }

  _sanitizeQuests(quests) {
    if (!Array.isArray(quests)) return [];

    return quests.slice(0, 50).map((q, i) => {
      const src = q && typeof q === "object" ? q : {};
      return {
        id: this._int(src.id, i + 1, 0, 999999),
        type: typeof src.type === "string" ? src.type.slice(0, 40) : "kill",
        name: typeof src.name === "string" ? src.name.slice(0, 120) : `Quest ${i + 1}`,
        desc: typeof src.desc === "string" ? src.desc.slice(0, 240) : "",
        target: this._int(src.target, 0, 0, 999999),
        need: this._int(src.need, 0, 0, 999999),
        have: this._int(src.have, 0, 0, 999999),
        done: !!src.done,
        turnedIn: !!src.turnedIn,
        rewardGold: this._int(src.rewardGold, 0, 0, 99999999),
        rewardXp: this._int(src.rewardXp, 0, 0, 99999999),
      };
    });
  }

  _sanitizeQuestTurnIn(q) {
    if (!q || typeof q !== "object") return null;
    return {
      id: this._int(q.id, 0, 0, 999999),
      name: typeof q.name === "string" ? q.name.slice(0, 120) : "",
    };
  }

  _sanitizeSkillLoadout(loadout) {
    const valid = ["q", "w", "e", "r"];
    if (!Array.isArray(loadout)) return ["q", "w", "e", "r"];

    const out = loadout
      .map((v) => String(v || "").toLowerCase())
      .filter((v) => valid.includes(v))
      .slice(0, 4);

    while (out.length < 4) {
      const next = valid.find((v) => !out.includes(v));
      if (!next) break;
      out.push(next);
    }

    return out.slice(0, 4);
  }

  _sanitizeMenu(open) {
    const allowed = [null, "inventory", "skills", "god", "map", "quests", "options"];
    return allowed.includes(open) ? open : null;
  }

  _sanitizeSlot(slot) {
    const s = String(slot || "").toLowerCase();
    const allowed = ["weapon", "armor", "chest", "helm", "boots", "ring", "trinket"];
    return allowed.includes(s) ? s : null;
  }

  _sanitizeRarity(rarity) {
    const r = String(rarity || "").toLowerCase();
    if (r === "uncommon" || r === "rare" || r === "epic") return r;
    return "common";
  }

  _sanitizeDir(dir, fallback = { x: 1, y: 0 }) {
    const x = this._num(dir?.x, fallback.x, -1, 1);
    const y = this._num(dir?.y, fallback.y, -1, 1);

    if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) {
      return { x: fallback.x, y: fallback.y };
    }

    const mag = Math.hypot(x, y) || 1;
    return {
      x: x / mag,
      y: y / mag,
    };
  }

  _intArray(value) {
    if (value instanceof Set) {
      return [...value]
        .map((v) => this._int(v, null, -1000000000, 1000000000))
        .filter((v) => v !== null);
    }

    if (!Array.isArray(value)) return [];

    return value
      .map((v) => this._int(v, null, -1000000000, 1000000000))
      .filter((v) => v !== null)
      .slice(0, 10000);
  }

  _fallbackItemName(slot, rarity) {
    const r =
      rarity === "epic" ? "Mythic" :
      rarity === "rare" ? "Fine" :
      rarity === "uncommon" ? "Sturdy" :
      "Plain";

    const s =
      slot === "weapon" ? "Blade" :
      slot === "armor" ? "Armor" :
      slot === "chest" ? "Chestplate" :
      slot === "helm" ? "Helm" :
      slot === "boots" ? "Boots" :
      slot === "ring" ? "Ring" :
      slot === "trinket" ? "Charm" :
      "Gear";

    return `${r} ${s}`;
  }

  _safeVelocity(v) {
    return this._num(v, 0, -5000, 5000);
  }

  _finiteCoord(v, fallback = 0) {
    return this._num(v, fallback, -1000000, 1000000);
  }

  _num(v, fallback = 0, min = -Infinity, max = Infinity) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  _int(v, fallback = 0, min = -Infinity, max = Infinity) {
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.trunc(n);
    if (i < min) return min;
    if (i > max) return max;
    return i;
  }
}