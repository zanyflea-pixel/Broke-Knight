// src/ui.js
import { clamp } from "./util.js";

export default class UI {
  constructor() {
    this.showMap = false;
    this.msg = "";
    this.msgT = 0;
  }

  setMsg(s, t=2.2) { this.msg = s; this.msgT = t; }

  drawHUD(ctx, hero, t, hints) {
    const pad = 14;
    // top bar
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(10,14,26,0.55)";
    roundRect(ctx, pad, pad, 360, 86, 14);
    ctx.fill();
    ctx.globalAlpha = 1;

    // HP
    bar(ctx, pad+16, pad+18, 320, 12, hero.hp/hero.hpMax, "#ff5a7a");
    // MP
    bar(ctx, pad+16, pad+40, 320, 10, hero.mp/hero.mpMax, "#38d9ff");
    // XP
    bar(ctx, pad+16, pad+60, 320, 8, hero.xp/hero.xpToNext, "#7CFC98");

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Lv ${hero.level}   Gold ${hero.gold}   ${hero.sailing ? "SAILING" : "WALKING"}`, pad+16, pad+82);

    if (this.msgT > 0) {
      ctx.globalAlpha = clamp(this.msgT, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, pad, pad+96, 420, 34, 14);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#d7e0ff";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(this.msg, pad+14, pad+118);
      ctx.globalAlpha = 1;
    }

    // hints
    if (hints?.dock) hintPill(ctx, 14, ctx.canvas.height - 56, hints.dock);
    if (hints?.way)  hintPill(ctx, 14, ctx.canvas.height - 90, hints.way);
  }

  drawMap(ctx, world, hero) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(6,8,14,0.92)";
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = 1;

    // map frame
    const mw = Math.min(860, W - 60);
    const mh = Math.min(520, H - 80);
    const mx = (W - mw)/2;
    const my = (H - mh)/2;

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(12,16,28,0.85)";
    roundRect(ctx, mx, my, mw, mh, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    // draw terrain snapshot (cached in world)
    const img = world.getMapImage();
    // fit
    const s = Math.min((mw-30)/img.width, (mh-60)/img.height);
    const dw = img.width * s, dh = img.height * s;
    const dx = mx + (mw - dw)/2;
    const dy = my + 44;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, dx, dy, dw, dh);

    // hero marker
    const hx = dx + (hero.x/world.width) * dw;
    const hy = dy + (hero.y/world.height) * dh;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffd28a";
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ffd28a";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#d7e0ff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("WORLD MAP (M to close)", mx + 20, my + 28);

    ctx.font = "12px system-ui, sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText("Land/Sea • Waystones • Docks • You", mx + 20, my + mh - 18);
    ctx.globalAlpha = 1;
  }

  update(dt) {
    if (this.msgT > 0) this.msgT -= dt;
  }
}

function bar(ctx, x, y, w, h, t, color) {
  t = clamp(t, 0, 1);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#000";
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w*t, h, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function hintPill(ctx, x, y, text) {
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const w = Math.min(520, ctx.measureText(text).width + 28);
  roundRect(ctx, x, y, w, 32, 14);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#d7e0ff";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(text, x+14, y+21);
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
