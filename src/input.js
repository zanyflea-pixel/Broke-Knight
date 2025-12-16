// src/input.js
export default class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x:0, y:0, down:false };
    this._pressed = new Set();

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this._pressed.add(k);
      this.keys.add(k);
      // prevent arrows from scrolling
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    }, { passive:false });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener("mousedown", () => this.mouse.down = true);
    window.addEventListener("mouseup", () => this.mouse.down = false);
  }

  pressed(k) { return this._pressed.has(k.toLowerCase()); }
  down(k) { return this.keys.has(k.toLowerCase()); }
  endFrame() { this._pressed.clear(); }
}
