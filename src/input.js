// src/input.js
// v103.3 FULL INPUT RESTORE
// - reliable press / hold / release
// - broader key normalization
// - blur / visibility recovery
// - clearAll / clearPressed / destroy helpers
// - compatible with current game.js and main.js

export default class Input {
  constructor(target = window) {
    this.target = target;

    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onWindowFocus = this._handleFocus.bind(this);
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);

    this._bind();
  }

  _bind() {
    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("keyup", this._onKeyUp);

    window.addEventListener("blur", this._onBlur);
    window.addEventListener("focus", this._onWindowFocus);
    window.addEventListener("mouseleave", this._onMouseLeave);

    document.addEventListener("visibilitychange", this._onVisibilityChange);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  _handleKeyDown(e) {
    const keys = this._aliasesForEvent(e);
    let wasAlreadyDown = false;

    for (const k of keys) {
      if (this.down.has(k)) {
        wasAlreadyDown = true;
      }
    }

    for (const k of keys) {
      this.down.add(k);
    }

    if (!wasAlreadyDown) {
      for (const k of keys) {
        this.pressed.add(k);
      }
    }
  }

  _handleKeyUp(e) {
    const keys = this._aliasesForEvent(e);

    for (const k of keys) {
      this.down.delete(k);
      this.released.add(k);
    }
  }

  _handleBlur() {
    this.clearAll();
  }

  _handleFocus() {
    this.clearPressed();
    this.released.clear();
  }

  _handleVisibilityChange() {
    if (document.hidden) {
      this.clearAll();
    }
  }

  _handlePointerLockChange() {
    if (document.hidden) {
      this.clearAll();
    }
  }

  _handleMouseLeave() {
    // Helps prevent "stuck movement" when keyboard focus gets weird after leaving the window.
    if (!document.hasFocus()) {
      this.clearAll();
    }
  }

  _aliasesForEvent(e) {
    const out = new Set();

    const key = e?.key ?? "";
    const code = e?.code ?? "";

    const add = (v) => {
      if (v == null) return;
      const s = String(v);
      if (!s) return;
      out.add(s);
      out.add(s.toLowerCase());
      out.add(s.toUpperCase());
    };

    add(key);
    add(code);

    // Single chars
    if (key && key.length === 1) {
      add(key.toLowerCase());
      add(key.toUpperCase());
    }

    // Common aliases
    if (key === "Esc" || code === "Escape") {
      add("Escape");
      add("Esc");
      add("escape");
    }

    if (key === " " || key === "Spacebar" || code === "Space") {
      add(" ");
      add("Space");
      add("space");
      add("Spacebar");
    }

    if (key === "Up" || code === "ArrowUp") add("ArrowUp");
    if (key === "Down" || code === "ArrowDown") add("ArrowDown");
    if (key === "Left" || code === "ArrowLeft") add("ArrowLeft");
    if (key === "Right" || code === "ArrowRight") add("ArrowRight");

    if (code === "KeyW") add("w");
    if (code === "KeyA") add("a");
    if (code === "KeyS") add("s");
    if (code === "KeyD") add("d");
    if (code === "KeyQ") add("q");
    if (code === "KeyE") add("e");
    if (code === "KeyR") add("r");
    if (code === "KeyF") add("f");
    if (code === "KeyI") add("i");
    if (code === "KeyK") add("k");
    if (code === "KeyM") add("m");
    if (code === "KeyB") add("b");
    if (code === "KeyX") add("x");

    if (code === "Digit1") add("1");
    if (code === "Digit2") add("2");
    if (code === "Digit3") add("3");
    if (code === "Digit4") add("4");

    if (code === "Enter") add("Enter");
    if (code === "Backspace") add("Backspace");
    if (code === "Delete") add("Delete");

    return Array.from(out);
  }

  _aliasesForLookup(key) {
    const out = new Set();
    if (key == null) return [];

    const s = String(key);
    if (!s) return [];

    out.add(s);
    out.add(s.toLowerCase());
    out.add(s.toUpperCase());

    if (s === "Esc") {
      out.add("Escape");
      out.add("escape");
    }

    if (s === "Escape") {
      out.add("Esc");
      out.add("escape");
    }

    if (s === " ") {
      out.add("Space");
      out.add("space");
      out.add("Spacebar");
    }

    if (s === "Space") {
      out.add(" ");
      out.add("space");
      out.add("Spacebar");
    }

    return Array.from(out);
  }

  isDown(key) {
    const aliases = this._aliasesForLookup(key);
    for (const k of aliases) {
      if (this.down.has(k)) return true;
    }
    return false;
  }

  wasPressed(key) {
    const aliases = this._aliasesForLookup(key);
    for (const k of aliases) {
      if (this.pressed.has(k)) return true;
    }
    return false;
  }

  wasReleased(key) {
    const aliases = this._aliasesForLookup(key);
    for (const k of aliases) {
      if (this.released.has(k)) return true;
    }
    return false;
  }

  clearPressed() {
    this.pressed.clear();
  }

  clearAll() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  destroy() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("focus", this._onWindowFocus);
    window.removeEventListener("mouseleave", this._onMouseLeave);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    this.clearAll();
  }
}