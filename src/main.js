// src/main.js
import Game from "./game.js";

const canvas = document.getElementById("game");
const game = new Game(canvas);

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt);
  game.draw(now / 1000);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
