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

      // prevent page scroll
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(k)) e.preventDefault();
      // quick save/load helpers
      if ((e.ctrlKey || e.metaKey) && (k === "s" || k === "S")) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && (k === "l" || k === "L")) e.preventDefault();
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

    window.addEventListener("mouseup", () => { this.mouse.down = false; });
  }

  consume(key) {
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    return false;
  }

  step() { this.mouse.clicked = false; this.pressed.clear(); }

  get axis() {
    const left = this.keys.has("ArrowLeft") ? -1 : 0;
    const right = this.keys.has("ArrowRight") ? 1 : 0;
    const up = this.keys.has("ArrowUp") ? -1 : 0;
    const down = this.keys.has("ArrowDown") ? 1 : 0;
    return { x: left + right, y: up + down };
  }

  getKey(k) { return this.keys.has(k); }
}
