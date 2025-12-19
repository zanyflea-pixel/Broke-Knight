// src/main.js
import Game from "./game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function fit() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // NOTE: we render in CSS pixels but keep backing store scaled. Game uses canvas.width/height,
  // so pass CSS sizes for view. We'll just resize with inner sizes.
  game.resize(window.innerWidth, window.innerHeight);
}
const game = new Game(canvas);
fit();
window.addEventListener("resize", fit);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  game.update(dt, t);
  game.draw(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
