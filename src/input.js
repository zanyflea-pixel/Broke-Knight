// src/input.js
// v105.6 INPUT (NO WASD MOVEMENT)
// - arrows only for movement
// - WASD still usable for skills / menus if needed
// - stable key handling

export default class Input {
  constructor(target = window) {
    this.target = target;

    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onVisibility = this._handleVisibility.bind(this);

    this._bind();
  }

  _bind() {
    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);

    window.addEventListener("blur", this._onBlur);
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  _handleKeyDown(e) {
    const key = this._normalize(e);

    if (!this.down.has(key)) {
      this.pressed.add(key);
    }

    this.down.add(key);

    // prevent scrolling keys
    if (
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === " " ||
      key === "Tab"
    ) {
      e.preventDefault();
    }
  }

  _handleKeyUp(e) {
    const key = this._normalize(e);
    this.down.delete(key);
    this.released.add(key);
  }

  _handleBlur() {
    this.clearAll();
  }

  _handleVisibility() {
    if (document.hidden) {
      this.clearAll();
    }
  }

  _normalize(e) {
    if (!e) return "";

    // IMPORTANT:
    // We DO NOT convert KeyW/KeyA/KeyS/KeyD into movement keys anymore

    if (e.code && e.code.startsWith("Digit")) {
      return e.code.slice(5);
    }

    if (e.code === "Space") return " ";
    if (e.key === " ") return " ";

    // keep raw key for things like q, w, e, r skills
    if (e.key) return e.key;

    return "";
  }

  isDown(key) {
    return this.down.has(key);
  }

  wasPressed(key) {
    return this.pressed.has(key);
  }

  wasReleased(key) {
    return this.released.has(key);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  clearAll() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  destroy() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    document.removeEventListener("visibilitychange", this._onVisibility);

    this.clearAll();
  }
}
