// src/main.js
// v32 SAFE BOOT + RESIZE + FRAME PACING PASS (FULL FILE)
// Purpose:
// - keep boot flow simple
// - improve resize behavior
// - improve canvas sharpness on high-DPI screens
// - clamp frame spikes after tab switches / lag
// - keep keyboard focus on canvas
// - avoid touching core gameplay logic in game.js

import Game from "./game.js";

const canvas = document.getElementById("overworld");
if (!canvas) {
  throw new Error('Missing <canvas id="overworld"> in index.html');
}

const ctx = canvas.getContext("2d", { alpha: false });
if (!ctx) {
  throw new Error("Could not get 2D canvas context");
}

let game = null;
let rafId = 0;
let lastTime = performance.now();
let accumulator = 0;

// Fixed-step update keeps the game feeling steadier when frame times wobble.
const STEP = 1 / 60;
const MAX_FRAME = 0.05; // clamp giant spikes after tab switches
const MAX_STEPS = 4;    // prevent spiral of death on slow frames

function getDPR() {
  // 2 is a good safe cap for sharpness without overworking the browser too much
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}

function resizeCanvas() {
  const cssW = Math.max(320, window.innerWidth | 0);
  const cssH = Math.max(240, window.innerHeight | 0);
  const dpr = getDPR();

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const pixelW = Math.max(1, Math.floor(cssW * dpr));
  const pixelH = Math.max(1, Math.floor(cssH * dpr));

  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }

  // Draw in CSS pixels; the backing canvas handles sharpness.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;

  if (game?.resize) {
    game.resize(cssW, cssH);
  } else if (game?.setViewSize) {
    game.setViewSize(cssW, cssH);
  } else {
    if (game) {
      game.viewW = cssW;
      game.viewH = cssH;
    }
  }
}

function ensureFocus() {
  if (document.activeElement !== canvas) {
    canvas.focus({ preventScroll: true });
  }
}

function boot() {
  resizeCanvas();
  game = new Game(canvas, ctx);
  if (game?.resize) {
    game.resize(window.innerWidth | 0, window.innerHeight | 0);
  }
  ensureFocus();
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

function update(dt) {
  if (!game) return;

  if (game.update) {
    game.update(dt);
  } else if (game.tick) {
    game.tick(dt);
  } else if (game.step) {
    game.step(dt);
  }
}

function render() {
  if (!game) return;

  const w = canvas.clientWidth || window.innerWidth || 960;
  const h = canvas.clientHeight || window.innerHeight || 540;

  ctx.clearRect(0, 0, w, h);

  if (game.draw) {
    game.draw();
  } else if (game.render) {
    game.render();
  }
}

function loop(now) {
  let frame = (now - lastTime) / 1000;
  lastTime = now;

  // Avoid giant catch-up jumps after tabbing away / browser hiccups.
  frame = Math.min(MAX_FRAME, Math.max(0, frame));
  accumulator += frame;

  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    update(STEP);
    accumulator -= STEP;
    steps++;
  }

  render();
  rafId = requestAnimationFrame(loop);
}

function onResize() {
  resizeCanvas();
  ensureFocus();
}

function onVisibilityChange() {
  // Reset timing when coming back so physics/cooldowns don't jump.
  lastTime = performance.now();
  accumulator = 0;
}

function onPointerDown() {
  ensureFocus();
}

function onKeyDown(e) {
  // Prevent page scroll on game keys.
  const block = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    " ",
  ];

  if (block.includes(e.key)) {
    e.preventDefault();
  }

  ensureFocus();
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("orientationchange", onResize, { passive: true });
window.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("pointerdown", onPointerDown);
window.addEventListener("keydown", onKeyDown, { passive: false });

boot();