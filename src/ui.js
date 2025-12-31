// src/ui.js
// v30 UI polish + overflow fixes + non-compact default
//
// Fixes:
// - Removes "compact mode" feel (uses comfortable padding + scalable layout).
// - Text wrapping + clipping so menu text DOES NOT overflow.
// - Simple scrolling for long lists (mouse wheel + up/down keys).
// - Exposes functions game.js uses: setMsg(), toggle(), closeAll(), draw().
// - Still lightweight: no DOM dependencies.

import { clamp } from "./util.js";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPanel(ctx, x, y, w, h, title) {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(10,12,20,0.74)";
  rr(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  rr(ctx, x, y, w, h, 14);
  ctx.stroke();

  // top bar
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  rr(ctx, x, y, w, 44, 14);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textBaseline = "middle";
  ctx.fillText(title, x + 16, y + 22);

  ctx.restore();
}

function wrapText(ctx, text, maxW) {
  const words = String(text ?? "").split(/\s+/g);
  const lines = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clipRect(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
}

function endClip(ctx) {
  ctx.restore();
}

export default class UI {
  constructor() {
    // open panels
    this.open = {
      map: false,
      stats: false,
      skills: false,
      quests: false,
      options: false,
      waypoints: false,
    };

    // message toast
    this.msg = "";
    this.msgT = 0;

    // skill pulse label from game.js
    this.skillName = "";
    this.skillPulse = 0;

    // scrolling offsets
    this.scroll = {
      stats: 0,
      skills: 0,
      quests: 0,
      options: 0,
      waypoints: 0,
    };

    this._lastWheel = 0;
  }

  setMsg(s) {
    this.msg = String(s ?? "");
    this.msgT = 2.6;
  }

  toggle(name) {
    if (!this.open[name] && this.open[name] !== false) return;
    this.open[name] = !this.open[name];

    // close other "big" panels when opening one (keeps readability)
    const big = ["stats", "skills", "quests", "options", "waypoints", "map"];
    if (this.open[name]) {
      for (const b of big) {
        if (b !== name) this.open[b] = false;
      }
    }
  }

  closeAll() {
    for (const k of Object.keys(this.open)) this.open[k] = false;
  }

  _consumeWheel(game) {
    // Optional mouse wheel support via input (if present)
    // If not present, no-op.
    const inp = game?.input;
    const wheel = inp?.wheelDelta ? inp.wheelDelta() : 0;
    if (!wheel) return 0;
    // normalize wheel direction
    return clamp(wheel / 120, -3, 3);
  }

  draw(ctx, game) {
    const dt = game?.input?.dt ? game.input.dt() : 1 / 60;

    // decrement timers
    this.msgT = Math.max(0, this.msgT - dt);
    this.skillPulse = Math.max(0, this.skillPulse - dt);

    // HUD always
    this._drawHUD(ctx, game);

    // hint
    if (game?.hint) {
      this._drawHint(ctx, game.hint);
    }

    // panels
    if (this.open.map) this._drawMap(ctx, game);
    if (this.open.stats) this._drawStats(ctx, game);
    if (this.open.skills) this._drawSkills(ctx, game);
    if (this.open.quests) this._drawQuests(ctx, game);
    if (this.open.options) this._drawOptions(ctx, game);
    if (this.open.waypoints) this._drawWaypoints(ctx, game);

    // toast msg
    if (this.msgT > 0 && this.msg) this._drawToast(ctx, this.msg, this.msgT);

    // skill pulse
    if (this.skillPulse > 0 && this.skillName) this._drawSkillPulse(ctx, this.skillName, this.skillPulse);
  }

  _drawHUD(ctx, game) {
    const W = game.viewW;
    const H = game.viewH;
    const hero = game.hero;
    const st = hero.getStats();

    const pad = 18;
    const barW = Math.min(340, W * 0.32);
    const barH = 18;

    // HP bar
    const hpP = clamp(hero.hp / st.maxHp, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.90;

    // panel bg
    ctx.fillStyle = "rgba(10,12,20,0.58)";
    rr(ctx, pad, pad, barW + 110, 74, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    rr(ctx, pad, pad, barW + 110, 74, 14);
    ctx.stroke();

    // HP
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rr(ctx, pad + 12, pad + 14, barW, barH, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,95,110,0.92)";
    rr(ctx, pad + 12, pad + 14, Math.max(6, barW * hpP), barH, 10);
    ctx.fill();

    // HP text
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textBaseline = "middle";
    ctx.fillText(`HP ${Math.ceil(hero.hp)}/${st.maxHp}`, pad + 18, pad + 14 + barH / 2);

    // Mana
    const mpP = clamp(hero.mana / st.maxMana, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    rr(ctx, pad + 12, pad + 40, barW, barH, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(110,170,255,0.92)";
    rr(ctx, pad + 12, pad + 40, Math.max(6, barW * mpP), barH, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(`MP ${Math.ceil(hero.mana)}/${st.maxMana}`, pad + 18, pad + 40 + barH / 2);

    // right-side stats
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(`Lv ${hero.level}`, pad + 12 + barW + 16, pad + 24);
    ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`Gold: ${hero.gold}`, pad + 12 + barW + 16, pad + 46);

    // quick help row
    ctx.font = "600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    const help = `Move: Arrows   Spells: Q/W/R/F   Potions: 1/2   Menus: I/K/J/O/T/M   ESC close`;
    ctx.fillText(help, pad + 12, pad + 68);

    ctx.restore();

    // FPS optional
    if (game.settings?.showFps && game?.input?.fps) {
      const fps = game.input.fps();
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      rr(ctx, W - 90, 14, 76, 30, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "700 14px system-ui";
      ctx.textBaseline = "middle";
      ctx.fillText(`${fps | 0} fps`, W - 78, 29);
      ctx.restore();
    }
  }

  _drawHint(ctx, hint) {
    const W = ctx.canvas.width; // backing buffer; but we draw in CSS pixels already (setTransform done in game)
    // We'll instead use ctx.canvas width ratio is wrong here, so use measure & safe placement
    ctx.save();
    ctx.globalAlpha = 0.90;
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const pad = 10;
    const tw = ctx.measureText(hint).width;
    const w = tw + pad * 2;
    const h = 34;
    const x = 18;
    const y = 100;

    ctx.fillStyle = "rgba(10,12,20,0.60)";
    rr(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 12);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.textBaseline = "middle";
    ctx.fillText(hint, x + pad, y + h / 2);
    ctx.restore();
  }

  _drawToast(ctx, msg, tLeft) {
    const W = ctx.canvas.width; // not reliable for CSS; but still okay for positioning since game uses setTransform(dpr)
    // We prefer using game.viewW if present; but in UI we only have ctx, so place near bottom center using canvas / dpr already accounted.
    // We'll use ctx.getTransform to infer scale; but easier: let it be relative. The game draw sets transform to dpr, so canvas.width is dpr*viewW.
    const tr = ctx.getTransform();
    const scaleX = tr.a || 1;
    const viewW = ctx.canvas.width / scaleX;
    const viewH = ctx.canvas.height / (tr.d || 1);

    ctx.save();
    const a = clamp(tLeft / 2.6, 0, 1);
    ctx.globalAlpha = 0.65 + a * 0.35;

    ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const padX = 16;
    const padY = 10;
    const tw = ctx.measureText(msg).width;
    const w = tw + padX * 2;
    const h = 40;
    const x = viewW * 0.5 - w * 0.5;
    const y = viewH - 70;

    ctx.fillStyle = "rgba(10,12,20,0.72)";
    rr(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 14);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textBaseline = "middle";
    ctx.fillText(msg, x + padX, y + h / 2);
    ctx.restore();
  }

  _drawSkillPulse(ctx, name, pulse) {
    const tr = ctx.getTransform();
    const viewW = ctx.canvas.width / (tr.a || 1);
    const viewH = ctx.canvas.height / (tr.d || 1);

    ctx.save();
    ctx.globalAlpha = clamp(pulse / 0.45, 0, 1) * 0.8;
    ctx.font = "800 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const tw = ctx.measureText(name).width;
    const x = viewW * 0.5 - tw * 0.5;
    const y = viewH * 0.5 - 140;

    ctx.fillStyle = "rgba(10,12,20,0.55)";
    rr(ctx, x - 16, y - 18, tw + 32, 44, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x, y + 4);
    ctx.restore();
  }

  _panelRect(game) {
    const W = game.viewW;
    const H = game.viewH;
    const w = Math.min(560, W * 0.52);
    const h = Math.min(520, H * 0.70);
    const x = W * 0.5 - w * 0.5;
    const y = H * 0.5 - h * 0.5;
    return { x, y, w, h };
  }

  _scrollPanel(game, key, contentHeight, viewHeight) {
    // wheel scroll if available
    const delta = this._consumeWheel(game);
    if (delta) this.scroll[key] += delta * 26;

    // keyboard scroll fallback
    if (game?.input?.down && (game.input.down("arrowup") || game.input.down("arrowdown"))) {
      if (game.input.down("arrowup")) this.scroll[key] -= 6;
      if (game.input.down("arrowdown")) this.scroll[key] += 6;
    }

    const max = Math.max(0, contentHeight - viewHeight);
    this.scroll[key] = clamp(this.scroll[key], 0, max);
  }

  _drawMap(ctx, game) {
    const r = this._panelRect(game);
    drawPanel(ctx, r.x, r.y, r.w, r.h, "Map / Minimap  (M)");

    const pad = 16;
    const bx = r.x + pad;
    const by = r.y + 56;
    const bw = r.w - pad * 2;
    const bh = r.h - 72;

    // Minimap box
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    rr(ctx, bx, by, bw, bh, 14);
    ctx.fill();
    ctx.restore();

    game.world.drawMinimap(ctx, bx + 8, by + 8, bw - 16, bh - 16, game.hero.x, game.hero.y);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "600 13px system-ui";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Waystones shown as squares. Docks as yellow squares. Press T for Waystone Travel.", bx + 12, r.y + r.h - 18);
    ctx.restore();
  }

  _drawStats(ctx, game) {
    const r = this._panelRect(game);
    drawPanel(ctx, r.x, r.y, r.w, r.h, "Character  (I)");

    const hero = game.hero;
    const st = hero.getStats();

    const pad = 16;
    const x = r.x + pad;
    const y = r.y + 56;
    const w = r.w - pad * 2;
    const h = r.h - 72;

    ctx.save();
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.90)";

    const lines = [
      `Level: ${hero.level}`,
      `XP: ${hero.xp}/${hero.nextXp}`,
      `Gold: ${hero.gold}`,
      `HP: ${Math.ceil(hero.hp)}/${st.maxHp}`,
      `Mana: ${Math.ceil(hero.mana)}/${st.maxMana}`,
      `Damage: ${st.dmg}`,
      `Armor: ${st.armor}`,
      `Crit: ${(st.crit * 100).toFixed(1)}%`,
      `Potions: HP ${hero.potions?.hp ?? 0} / Mana ${hero.potions?.mana ?? 0}`,
      hero.state?.sailing ? `Status: Sailing` : `Status: On Foot`,
    ];

    // equipment
    lines.push("");
    lines.push("Equipment:");
    for (const k of ["weapon", "helm", "chest", "boots", "ring"]) {
      const g = hero.equip?.[k];
      lines.push(`${k.toUpperCase()}: ${g ? g.name : "(none)"}`);
    }

    // scrollable content
    const lineH = 22;
    const contentH = lines.length * lineH + 10;

    this._scrollPanel(game, "stats", contentH, h);

    clipRect(ctx, x, y, w, h);
    ctx.translate(0, -this.scroll.stats);

    let yy = y;
    for (const L of lines) {
      if (L === "") {
        yy += lineH * 0.6;
        continue;
      }
      ctx.fillText(L, x, yy);
      yy += lineH;
    }
    endClip(ctx);

    // scrollbar
    this._drawScrollbar(ctx, x + w - 6, y, 4, h, this.scroll.stats, contentH);

    ctx.restore();
  }

  _drawSkills(ctx, game) {
    const r = this._panelRect(game);
    drawPanel(ctx, r.x, r.y, r.w, r.h, "Skills  (K)");

    const pad = 16;
    const x = r.x + pad;
    const y = r.y + 56;
    const w = r.w - pad * 2;
    const h = r.h - 72;

    const skills = game.skills || {};
    const order = ["q", "w", "r", "f"];

    ctx.save();
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.92)";

    const lineH = 24;
    const blocks = [];

    blocks.push({ title: "Quick Cast", body: "Use Q/W/R/F to cast spells (movement uses Arrow keys). E is interact." });

    for (const key of order) {
      const s = skills[key];
      if (!s) continue;
      blocks.push({
        title: `${key.toUpperCase()} — ${s.name}`,
        body: `Mana: ${s.mana}   Cooldown: ${s.cd}s\n${s.desc || ""}`,
      });
    }

    // compute content height using wrapping
    const titleH = 22;
    const bodyFont = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.font = bodyFont;

    let contentH = 0;
    for (const b of blocks) {
      contentH += titleH;
      const lines = String(b.body).split("\n");
      for (const ln of lines) {
        const wrapped = wrapText(ctx, ln, w - 20);
        contentH += wrapped.length * 18;
      }
      contentH += 18;
    }

    this._scrollPanel(game, "skills", contentH, h);

    clipRect(ctx, x, y, w, h);
    ctx.translate(0, -this.scroll.skills);

    let yy = y;

    // render
    for (const b of blocks) {
      // title
      ctx.font = "800 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(b.title, x, yy);
      yy += titleH;

      // body
      ctx.font = bodyFont;
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      const lines = String(b.body).split("\n");
      for (const ln of lines) {
        const wrapped = wrapText(ctx, ln, w - 20);
        for (const wln of wrapped) {
          ctx.fillText(wln, x + 10, yy);
          yy += 18;
        }
      }
      yy += 18;
    }

    endClip(ctx);

    this._drawScrollbar(ctx, x + w - 6, y, 4, h, this.scroll.skills, contentH);

    ctx.restore();
  }

  _drawQuests(ctx, game) {
    const r = this._panelRect(game);
    drawPanel(ctx, r.x, r.y, r.w, r.h, "Quests  (J)");

    const pad = 16;
    const x = r.x + pad;
    const y = r.y + 56;
    const w = r.w - pad * 2;
    const h = r.h - 72;

    const qs = Array.isArray(game.quests) ? game.quests : [];
    const lineH = 18;

    ctx.save();
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";

    // measure total height
    let contentH = 0;
    for (const q of qs) {
      contentH += 22;
      ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const descLines = wrapText(ctx, q.desc || "", w - 20);
      contentH += descLines.length * lineH;
      const prog = this._questProgressLine(q);
      if (prog) contentH += lineH;
      contentH += 16;
      ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    }

    this._scrollPanel(game, "quests", contentH, h);

    clipRect(ctx, x, y, w, h);
    ctx.translate(0, -this.scroll.quests);

    let yy = y;
    for (const q of qs) {
      // title
      ctx.font = "800 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = q.state === "done" ? "rgba(170,255,200,0.90)" : "rgba(255,255,255,0.92)";
      ctx.fillText(q.name || "Quest", x, yy);
      yy += 22;

      // desc
      ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      const descLines = wrapText(ctx, q.desc || "", w - 20);
      for (const ln of descLines) {
        ctx.fillText(ln, x + 10, yy);
        yy += lineH;
      }

      // progress
      const prog = this._questProgressLine(q);
      if (prog) {
        ctx.fillStyle = "rgba(255,230,170,0.85)";
        ctx.fillText(prog, x + 10, yy);
        yy += lineH;
      }

      yy += 16;
    }

    endClip(ctx);
    this._drawScrollbar(ctx, x + w - 6, y, 4, h, this.scroll.quests, contentH);

    ctx.restore();
  }

  _questProgressLine(q) {
    const p = q.progress || {};
    if (q.id === "kills") return `Progress: ${p.kills || 0}/${p.goal || 0}`;
    if (q.id === "gold") return `Progress: ${p.gold || 0}/${p.goal || 0}`;
    if (q.id === "welcome") return p.boarded ? "Progress: boarded ✓" : "Progress: not boarded";
    if (q.id === "attune") return p.attuned ? "Progress: attuned ✓" : "Progress: not attuned";
    return "";
  }

  _drawOptions(ctx, game) {
    const r = this._panelRect(game);
    drawPanel(ctx, r.x, r.y, r.w, r.h, "Options  (O)");

    const pad = 16;
    const x = r.x + pad;
    const y = r.y + 56;
    const w = r.w - pad * 2;
    const h = r.h - 72;

    const s = game.settings || {};

    const rows = [
      { key: "particles", label: "Particles", hotkey: "Z", val: !!s.particles },
      { key: "screenshake", label: "Screenshake", hotkey: "X", val: !!s.screenshake },
      { key: "showFps", label: "Show FPS", hotkey: "C", val: !!s.showFps },
      { key: "autoPickupGear", label: "Auto-pickup gear", hotkey: "V", val: !!s.autoPickupGear },
    ];

    const lineH = 28;
    const contentH = rows.length * lineH + 120;
    this._scrollPanel(game, "options", contentH, h);

    ctx.save();
    clipRect(ctx, x, y, w, h);
    ctx.translate(0, -this.scroll.options);

    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("Toggle with hotkeys:", x, y);

    ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("Z particles, X shake, C fps, V auto-pickup", x + 10, y + 22);

    let yy = y + 56;
    for (const row of rows) {
      ctx.font = "800 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(`${row.label}`, x + 10, yy);

      ctx.font = "700 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.fillText(`[${row.hotkey}]`, x + w - 80, yy);

      // checkbox
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      rr(ctx, x + w - 50, yy - 16, 34, 20, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      rr(ctx, x + w - 50, yy - 16, 34, 20, 6);
      ctx.stroke();

      if (row.val) {
        ctx.fillStyle = "rgba(170,255,200,0.90)";
        ctx.fillRect(x + w - 44, yy - 12, 22, 12);
      }

      yy += lineH;
    }

    yy += 22;
    ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    const tips = [
      "Movement uses Arrow keys so Q/W/R/F are free for spells.",
      "Press ESC to close any menu.",
      "Press T to open Waystone Travel after attuning waystones.",
    ];
    for (const tip of tips) {
      const lines = wrapText(ctx, tip, w - 20);
      for (const ln of lines) {
        ctx.fillText("• " + ln, x + 10, yy);
        yy += 18;
      }
      yy += 6;
    }

    endClip(ctx);
    this._drawScrollbar(ctx, x + w - 6, y, 4, h, this.scroll.options, contentH);
    ctx.restore();
  }

  _drawWaypoints(ctx, game) {
    const r = this._panelRect(game);
    drawPanel(ctx, r.x, r.y, r.w, r.h, "Waystone Travel  (T)");

    const pad = 16;
    const x = r.x + pad;
    const y = r.y + 56;
    const w = r.w - pad * 2;
    const h = r.h - 72;

    const list = (game.world?.waystones || []).filter((ws) => ws.activated);
    const lineH = 28;
    const contentH = Math.max(160, list.length * lineH + 120);

    this._scrollPanel(game, "waypoints", contentH, h);

    ctx.save();
    clipRect(ctx, x, y, w, h);
    ctx.translate(0, -this.scroll.waypoints);

    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("Press number keys to travel:", x, y);

    ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("1-9 correspond to the list below. Cannot travel while sailing.", x + 10, y + 22);

    let yy = y + 56;

    if (!list.length) {
      ctx.fillStyle = "rgba(255,230,170,0.85)";
      ctx.font = "700 14px system-ui";
      ctx.fillText("No attuned waystones yet. Walk to one and press E to attune.", x + 10, yy);
      yy += 24;
    } else {
      for (let i = 0; i < list.length; i++) {
        const ws = list[i];
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        rr(ctx, x + 6, yy - 18, w - 12, 24, 10);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 2;
        rr(ctx, x + 6, yy - 18, w - 12, 24, 10);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "800 14px system-ui";
        ctx.fillText(`${i + 1}. ${ws.name || "Waystone"}`, x + 16, yy);

        yy += lineH;
      }
    }

    endClip(ctx);
    this._drawScrollbar(ctx, x + w - 6, y, 4, h, this.scroll.waypoints, contentH);
    ctx.restore();
  }

  _drawScrollbar(ctx, x, y, w, h, scroll, contentH) {
    if (contentH <= h + 2) return;

    const max = Math.max(1, contentH - h);
    const p = clamp(scroll / max, 0, 1);
    const thumbH = clamp((h * h) / contentH, 24, h * 0.8);
    const ty = y + p * (h - thumbH);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    rr(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    rr(ctx, x, ty, w, thumbH, 6);
    ctx.fill();
    ctx.restore();
  }
}
