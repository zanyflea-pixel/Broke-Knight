// src/main.js
// v30 hard-fix: robust fullscreen canvas sizing + correct canvas id (overworld/game).
// This fixes "still zoomed / UI huge / world missing" issues caused by resizing the wrong canvas
// or CSS stretching the drawing buffer.
//
// - Prefer <canvas id="overworld"> (used in many Broke Knight versions)
// - Fallback to <canvas id="game">
// - Force fullscreen CSS size
// - Set DPR backing buffer (crisp)
// - Notify game via game.onResize()

import Game from "./game.js";

const canvas =
  document.getElementById("overworld") ||
  document.getElementById("game");

if (!canvas) {
  throw new Error("Canvas not found. Expected <canvas id='overworld'> or <canvas id='game'> in index.html.");
}

// Force fullscreen canvas styling (prevents CSS stretch weirdness)
document.documentElement.style.margin = "0";
document.documentElement.style.padding = "0";
document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";

canvas.style.position = "fixed";
canvas.style.left = "0";
canvas.style.top = "0";
canvas.style.width = "100vw";
canvas.style.height = "100vh";
canvas.style.display = "block";
canvas.style.cursor = "crosshair";

const game = new Game(canvas);

function resizeCanvas() {
  // CSS pixels (what player sees)
  const cssW = Math.max(1, window.innerWidth);
  const cssH = Math.max(1, window.innerHeight);

  // DPR backing buffer
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const bufW = Math.floor(cssW * dpr);
  const bufH = Math.floor(cssH * dpr);

  if (canvas.width !== bufW) canvas.width = bufW;
  if (canvas.height !== bufH) canvas.height = bufH;

  // Ensure clientWidth/clientHeight are correct (some browsers need a reflow)
  // but the style is already 100vw/100vh.

  if (typeof game.onResize === "function") game.onResize();
}

window.addEventListener("resize", resizeCanvas, { passive: true });
resizeCanvas();

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt);
  game.draw(now / 1000);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
