// src/main.js
// v105.5 FULL MAIN FILE
// - fixed-step loop
// - resize / focus / hidden-tab recovery
// - keeps current Game(canvas) API
// - stable canvas sizing for #overworld

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
let running = false;
let booted = false;
let lastTime = performance.now();
let accumulator = 0;
let resumeTimer = 0;
let resizeQueued = false;

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

  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.style.userSelect = "none";
  canvas.style.webkitUserSelect = "none";
  canvas.style.touchAction = "none";
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
  const { w, h } = getCssSize();
  const dpr = getDPR();

  applyCanvasSize(w, h, dpr);

  if (game?.resize) {
    game.resize(w, h);
  } else if (game) {
    game.w = w;
    game.h = h;
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
  if (running) return;
  running = true;
  lastTime = performance.now();
  accumulator = 0;
  rafId = requestAnimationFrame(tick);
}

function hardResume() {
  cancelLoop();
  resizeCanvas();

  if (game?.input?.clearAll) {
    game.input.clearAll();
  } else if (game?.input?.endFrame) {
    game.input.endFrame();
  }

  focusCanvas();
  startLoop();
}

function softResumeSoon() {
  if (resumeTimer) return;

  resumeTimer = setTimeout(() => {
    resumeTimer = 0;
    if (!document.hidden) {
      hardResume();
    }
  }, 60);
}

function boot() {
  if (booted) return;
  booted = true;

  resizeCanvas();

  game = new Game(canvas);

  if (game?.resize) {
    const { w, h } = getCssSize();
    game.resize(w, h);
  }

  focusCanvas();
  startLoop();
}

window.addEventListener("resize", () => {
  queueResize();
});

window.addEventListener("orientationchange", () => {
  queueResize();
  softResumeSoon();
});

window.addEventListener("focus", () => {
  softResumeSoon();
});

window.addEventListener("blur", () => {
  if (game?.input?.clearAll) {
    game.input.clearAll();
  } else if (game?.input?.endFrame) {
    game.input.endFrame();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelLoop();
  } else {
    softResumeSoon();
  }
});

window.addEventListener("pageshow", () => {
  softResumeSoon();
});

canvas.addEventListener("mousedown", () => {
  focusCanvas();
});

boot();