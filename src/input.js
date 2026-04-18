// src/input.js
// v100.5 INPUT RESTORE
// - reliable press / hold / release
// - blur safety so keys do not stick
// - normalized keys for stable controls
// - compatible with current game.js / main.js

export default class Input {
  constructor(target = window) {
    this.target = target;

    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();

    this._bind();
  }

  _bind() {
    this.target.addEventListener("keydown", (e) => {
      const key = this._norm(e.key);

      if (!this.keysDown.has(key)) {
        this.keysPressed.add(key);
      }

      this.keysDown.add(key);
    });

    this.target.addEventListener("keyup", (e) => {
      const key = this._norm(e.key);

      this.keysDown.delete(key);
      this.keysReleased.add(key);
    });

    window.addEventListener("blur", () => {
      this.keysDown.clear();
      this.keysPressed.clear();
      this.keysReleased.clear();
    });
  }

  _norm(key) {
    if (!key) return "";

    if (key === " ") return "Space";
    if (key === "Esc") return "Escape";

    return key.length === 1 ? key.toLowerCase() : key;
  }

  isDown(key) {
    return this.keysDown.has(this._norm(key));
  }

  wasPressed(key) {
    return this.keysPressed.has(this._norm(key));
  }

  wasReleased(key) {
    return this.keysReleased.has(this._norm(key));
  }

  endFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
  }
}