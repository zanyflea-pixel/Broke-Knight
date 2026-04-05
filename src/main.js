// src/main.js
// v39 BOOT + FPS + RESUME + LAG HARDENING PASS (FULL FILE)

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
let running = false;
let lastTime = performance.now();
let accumulator = 0;

const STEP = 1 / 60;
const MAX_FRAME = 0.05;
const MAX_STEPS = 4;

setupCanvasElement();

function setupCanvasElement() {
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

function focusCanvas() {
  try {
    canvas.focus({ preventScroll: true });
  } catch {
    try {
      canvas.focus();
    } catch {}
  }
}

function cancelLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  running = false;
}

function render() {
  if (!game) return;

  ctx.save();
  ctx.setTransform(getDPR(), 0, 0, getDPR(), 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  game.draw?.();
}

function loop(now) {
  if (!running) return;

  rafId = requestAnimationFrame(loop);

  let frame = (now - lastTime) / 1000;
  lastTime = now;

  if (!Number.isFinite(frame) || frame < 0) frame = STEP;
  frame = Math.min(MAX_FRAME, frame);

  accumulator += frame;

  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    game?.update?.(STEP);
    accumulator -= STEP;
    steps++;
  }

  if (steps === MAX_STEPS) {
    accumulator = 0;
  }

  render();
}

function startLoop() {
  cancelLoop();
  lastTime = performance.now();
  accumulator = 0;
  running = true;
  rafId = requestAnimationFrame(loop);
}

function boot() {
  if (booted) return;
  booted = true;

  resizeCanvas();

  game = new Game(canvas);

  resizeCanvas();
  focusCanvas();
  startLoop();
}

function hardResume() {
  if (!booted || !game) return;

  resizeCanvas();
  focusCanvas();

  lastTime = performance.now();
  accumulator = 0;

  if (!running) {
    startLoop();
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();
});

window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    resizeCanvas();
    hardResume();
  }, 60);
});

window.addEventListener("focus", () => {
  hardResume();
});

window.addEventListener("pageshow", () => {
  hardResume();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelLoop();
  } else {
    hardResume();
  }
});

canvas.addEventListener("mousedown", () => {
  focusCanvas();
});

canvas.addEventListener("touchstart", () => {
  focusCanvas();
}, { passive: true });

window.addEventListener("keydown", e => {
  const blocked = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    " ",
    "Spacebar"
  ];

  if (blocked.includes(e.key)) {
    e.preventDefault();
  }
}, { passive: false });

boot();