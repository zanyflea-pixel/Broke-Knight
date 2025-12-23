// src/input.js
export default class Input {
  constructor(canvas) {
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.keysDown.has(k)) this.keysPressed.add(k);
      this.keysDown.add(k);

      // prevent page scrolling with arrows / space
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key)) e.preventDefault();
    }, { passive: false });

    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.key.toLowerCase());
    });

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });

    canvas.addEventListener("mousedown", () => {
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });
  }

  down(key) {
    return this.keysDown.has(key.toLowerCase());
  }

  pressed(key) {
    key = key.toLowerCase();
    if (this.keysPressed.has(key)) {
      this.keysPressed.delete(key);
      return true;
    }
    return false;
  }

  consumeMouseClick() {
    if (this.mouse.clicked) {
      this.mouse.clicked = false;
      return true;
    }
    return false;
  }

  endFrame() {
    this.keysPressed.clear();
    this.mouse.clicked = false;
  }
}
