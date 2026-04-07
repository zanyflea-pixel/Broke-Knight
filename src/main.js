// src/main.js
// v43 MAIN LOOP + RECOVERY + CANVAS SAFETY PASS (FULL FILE)
// Goals:
// - keep current boot flow
// - smoother frame pacing
// - safer resize / focus handling
// - recover cleanly after alt-tab / hidden tab
// - avoid duplicate loops / runaway delta spikes
// - keep canvas crisp and correctly sized

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
let resizeQueued = false;
let resumeTimer = 0;
let dprCache = 1;

const STEP = 1 / 60;
const MAX_FRAME = 0.05;
const MAX_STEPS = 4;

setupCanvasElement();
boot();

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
  canvas.style.display = "block";
}

function getDPR() {
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}

function getCssSize() {
  const w = Math.max(320, window.innerWidth | 0);
  const h = Math.max(240, window.innerHeight | 0);
  return { w, h };
}

function applyCanvasSize(cssW, cssH, dpr) {
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
}

function resizeCanvas() {
  const { w: cssW, h: cssH } = getCssSize();
  const dpr = getDPR();
  dprCache = dpr;

  applyCanvasSize(cssW, cssH, dpr);

  if (game?.resize) {
    game.resize(cssW, cssH);
  } else if (game) {
    game.w = cssW;
    game.h = cssH;
  }
}

function queueResize() {
  if (resizeQueued) return;
  resizeQueued = true;

  requestAnimationFrame(() => {
    resizeQueued = false;
    resizeCanvas();
  });
}

function focusCanvas() {
  try {
    canvas.focus({ preventScroll: true });
  } catch (_) {
    try {
      canvas.focus();
    } catch (_) {}
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
  game.draw?.();
}

function tick(now) {
  if (!running) return;

  rafId = requestAnimationFrame(tick);

  let frame = (now - lastTime) / 1000;
  lastTime = now;

  if (!Number.isFinite(frame) || frame < 0) {
    frame = STEP;
  }

  frame = Math.min(MAX_FRAME, frame);
  accumulator += frame;

  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    game?.update?.(STEP);
    accumulator -= STEP;
    steps++;
  }

  if (steps >= MAX_STEPS) {
    accumulator = 0;
  }

  render();
}

function startLoop() {
  cancelLoop();
  lastTime = performance.now();
  accumulator = 0;
  running = true;
  rafId = requestAnimationFrame(tick);
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

function softResumeSoon(delay = 50) {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = 0;
  }

  resumeTimer = window.setTimeout(() => {
    resumeTimer = 0;
    hardResume();
  }, delay);
}

window.addEventListener("resize", queueResize);
window.addEventListener("orientationchange", () => softResumeSoon(80));
window.addEventListener("focus", () => softResumeSoon(0));
window.addEventListener("pageshow", () => softResumeSoon(0));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelLoop();
  } else {
    softResumeSoon(0);
  }
});

window.addEventListener("blur", () => {
  cancelLoop();
});

canvas.addEventListener("mousedown", () => {
  focusCanvas();
});

canvas.addEventListener(
  "touchstart",
  () => {
    focusCanvas();
  },
  { passive: true }
);

window.addEventListener(
  "keydown",
  (e) => {
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
  },
  { passive: false }
);

window.addEventListener("devicepixelratiochange", () => {
  const next = getDPR();
  if (next !== dprCache) queueResize();
});

// Fallback DPR check for browsers without a devicepixelratiochange event.
setInterval(() => {
  const next = getDPR();
  if (next !== dprCache) {
    queueResize();
  }
}, 1000);