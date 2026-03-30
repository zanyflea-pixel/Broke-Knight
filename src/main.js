// src/main.js
// v31 FIXED BOOT FILE
// Works with current game.js, which expects: new Game(canvas)

import Game from "./game.js";

function findCanvas() {
  let c = document.getElementById("overworld");
  if (!c) c = document.querySelector("canvas");

  if (!c) {
    c = document.createElement("canvas");
    c.id = "overworld";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.appendChild(c);
  }

  c.style.display = "block";
  return c;
}

const canvas = findCanvas();
const game = new Game(canvas);

function fitCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  if (typeof game.setViewSize === "function") {
    game.setViewSize(w, h);
  } else if (typeof game.resize === "function") {
    game.resize(w, h);
  }
}

window.addEventListener("resize", fitCanvas);

fitCanvas();

let last = performance.now();

function loop(now) {
  let dt = (now - last) / 1000;
  last = now;

  if (!Number.isFinite(dt)) dt = 0.016;
  dt = Math.min(0.05, Math.max(0.001, dt));

  try {
    game.update(dt);
    game.draw();
  } catch (err) {
    console.error("Game loop error:", err);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
