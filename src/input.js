// src/input.js
export default class Input {
  constructor(canvas) {
    this.downKeys = new Set();
    this.pressedKeys = new Set();

    this.mouse = { x: 0, y: 0, down: false, pressed: false };

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.downKeys.has(k)) this.pressedKeys.add(k);
      this.downKeys.add(k);

      // prevent page scroll with arrows/space
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.downKeys.delete(k);
    });

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });

    canvas.addEventListener("mousedown", () => {
      this.mouse.down = true;
      this.mouse.pressed = true;
    });

    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
  }

  down(k) { return this.downKeys.has(k.toLowerCase()); }
  pressed(k) { return this.pressedKeys.has(k.toLowerCase()); }

  endFrame() {
    this.pressedKeys.clear();
    this.mouse.pressed = false;
  }
}
