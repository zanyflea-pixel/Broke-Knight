// src/main.js
import Game from "./game.js";

const canvas = document.getElementById("game");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const game = new Game(canvas);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  game.update(dt);
  game.draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
