// src/main.js
// v103 MAIN GLUE RESTORE
// - matches current fuller game.js API
// - keeps all existing game features
// - proper canvas sizing for #overworld
// - stable boot / tick loop / pause-resume handling

import Game from "./game.js";

const canvas = document.getElementById("overworld");
if (!canvas) {
  throw new Error("Missing #overworld canvas");
}

let game = null;
let rafId = 0;
let lastTime = 0;
let running = false;

function fitCanvasToScreen() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.max(960, Math.floor(window.innerWidth));
  const cssH = Math.max(540, Math.floor(window.innerHeight));

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  const pixelW = Math.max(1, Math.floor(cssW * dpr));
  const pixelH = Math.max(1, Math.floor(cssH * dpr));

  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }

  return {
    cssW,
    cssH,
    dpr,
    pixelW,
    pixelH,
  };
}

function resizeGame() {
  const view = fitCanvasToScreen();
  if (game && typeof game.resize === "function") {
    game.resize(view.pixelW, view.pixelH);
  }
}

function stopLoop() {
  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function tick(now) {
  if (!running || !game) return;

  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.05);

  game.update(dt);
  game.draw();

  rafId = requestAnimationFrame(tick);
}

function startLoop() {
  if (running) return;
  running = true;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function hardResume() {
  stopLoop();
  resizeGame();
  if (game && game.input && typeof game.input.endFrame === "function") {
    game.input.endFrame();
  }
  startLoop();
}

function softResumeSoon() {
  setTimeout(() => {
    if (!document.hidden) hardResume();
  }, 60);
}

function boot() {
  resizeGame();

  game = new Game(canvas);
  if (typeof game.resize === "function") {
    game.resize(canvas.width, canvas.height);
  }

  canvas.focus();
  startLoop();
}

window.addEventListener("resize", () => {
  resizeGame();
});

window.addEventListener("orientationchange", () => {
  softResumeSoon();
});

window.addEventListener("focus", () => {
  softResumeSoon();
});

window.addEventListener("blur", () => {
  if (game?.input?.endFrame) game.input.endFrame();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else {
    hardResume();
  }
});

canvas.addEventListener("mousedown", () => {
  canvas.focus();
});

boot();