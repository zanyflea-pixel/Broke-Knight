// src/input.js
export default class Input {
  constructor(canvas) {
    this.canvas = canvas;

    this.keys = new Set();
    this.pressed = new Set();

    this.mouse = { x: 0, y: 0, down: false, clicked: false };

    window.addEventListener("keydown", (e) => {
      const k = e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key);
    });

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });

    canvas.addEventListener("mousedown", () => {
      this.mouse.down = true;
      this.mouse.clicked = true;
    });

    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
  }

  consume(key) {
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    return false;
  }

  moveVec() {
    let x = 0, y = 0;
    if (this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("ArrowDown")) y += 1;

    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  consumeClick() {
    if (!this.mouse.clicked) return null;
    this.mouse.clicked = false;
    return { x: this.mouse.x, y: this.mouse.y };
  }
}
