// src/main.js
// v33 BOOT + FOCUS + RESUME HARDENING PASS (FULL FILE)
// Purpose:
// - keep boot flow simple
// - improve resize behavior
// - improve canvas sharpness on high-DPI screens
// - clamp frame spikes after tab switches / lag
// - keep keyboard focus on canvas
// - block browser interactions that interfere with gameplay
// - avoid duplicate RAF loops on page restore / reload edge cases
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
let booted = false;
let lastTime = performance.now();
let accumulator = 0;

// Fixed-step update keeps the game feeling steadier when frame times wobble.
const STEP = 1 / 60;
const MAX_FRAME = 0.05; // clamp giant spikes after tab switches
const MAX_STEPS = 4;    // prevent spiral of death on slow frames

setupCanvasElement();

function setupCanvasElement() {
  // Make sure the canvas can actually receive keyboard focus.
  if (!canvas.hasAttribute("tabindex")) {
    canvas.tabIndex = 0;
  }

  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "Broke Knight game canvas");

  canvas.style.outline = "none";
  canvas.style.userSelect = "none";
  canvas.style.webkitUserSelect = "none";
  canvas.style.touchAction = "none";
}

function getDPR() {
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
  } else if (game) {
    game.viewW = cssW;
    game.viewH = cssH;
  }
}

function ensureFocus() {
  if (document.activeElement !== canvas) {
    try {
      canvas.focus({ preventScroll: true });
    } catch (_) {
      canvas.focus();
    }
  }
}

function resetTiming() {
  lastTime = performance.now();
  accumulator = 0;
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function startLoop() {
  if (rafId) return;
  resetTiming();
  rafId = requestAnimationFrame(loop);
}

function boot() {
  if (booted) return;
  booted = true;

  resizeCanvas();

  game = new Game(canvas, ctx);

  if (game?.resize) {
    game.resize(window.innerWidth | 0, window.innerHeight | 0);
  } else if (game?.setViewSize) {
    game.setViewSize(window.innerWidth | 0, window.innerHeight | 0);
  }

  ensureFocus();
  startLoop();
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
  if (document.hidden) {
    resetTiming();
    return;
  }

  resetTiming();
  ensureFocus();
}

function onPageShow() {
  resetTiming();
  ensureFocus();
  startLoop();
}

function onPointerDown() {
  ensureFocus();
}

function onMouseDown(e) {
  ensureFocus();

  if (e.button === 1) {
    e.preventDefault();
  }
}

function onContextMenu(e) {
  e.preventDefault();
}

function onDragStart(e) {
  e.preventDefault();
}

function onSelectStart(e) {
  e.preventDefault();
}

function onKeyDown(e) {
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

function onBlurWindow() {
  resetTiming();
}

function onBeforeUnload() {
  stopLoop();
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("orientationchange", onResize, { passive: true });
window.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("pageshow", onPageShow);
window.addEventListener("pointerdown", onPointerDown);
window.addEventListener("mousedown", onMouseDown);
window.addEventListener("keydown", onKeyDown, { passive: false });
window.addEventListener("blur", onBlurWindow);
window.addEventListener("beforeunload", onBeforeUnload);

canvas.addEventListener("contextmenu", onContextMenu);
canvas.addEventListener("dragstart", onDragStart);
canvas.addEventListener("selectstart", onSelectStart);

boot();