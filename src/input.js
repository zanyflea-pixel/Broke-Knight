// src/input.js
// v31 STABLE INPUT REWRITE (FULL FILE)
// Goals:
// ✅ Fast and simple
// ✅ Consistent key handling for game.js
// ✅ Supports both e.key and e.code lookups
// ✅ Prevents stuck key states on window blur
// ✅ Keeps API compatible with current game.js:
//    - new Input(canvas)
//    - isDown(key)
//    - wasPressed(key)
//    - endFrame()
//
// Replace ENTIRE file: src/input.js

export default class Input {
  constructor(target = window) {
    this.target = target || window;

    // held keys
    this.down = new Set();

    // pressed this frame
    this.pressed = new Set();

    // bind once
    this._onKeyDown = (e) => {
      const variants = this._variants(e);

      // mark newly pressed
      let alreadyDown = false;
      for (const v of variants) {
        if (this.down.has(v)) {
          alreadyDown = true;
          break;
        }
      }

      if (!alreadyDown) {
        for (const v of variants) this.pressed.add(v);
      }

      for (const v of variants) this.down.add(v);

      // stop arrow keys / space from scrolling page
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === " " ||
        e.code === "Space"
      ) {
        e.preventDefault();
      }
    };

    this._onKeyUp = (e) => {
      const variants = this._variants(e);
      for (const v of variants) this.down.delete(v);
    };

    this._onBlur = () => {
      this.down.clear();
      this.pressed.clear();
    };

    window.addEventListener("keydown", this._onKeyDown, { passive: false });
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
  }

  _variants(e) {
    const out = new Set();

    const key = e?.key;
    const code = e?.code;

    if (key != null) {
      out.add(key);
      out.add(String(key).toLowerCase());
      out.add(String(key).toUpperCase());
    }

    if (code != null) {
      out.add(code);
      out.add(String(code).toLowerCase());
      out.add(String(code).toUpperCase());
    }

    // normalize arrows
    if (key === "ArrowLeft" || key === "Left") {
      out.add("ArrowLeft");
      out.add("arrowleft");
      out.add("Left");
      out.add("left");
    }
    if (key === "ArrowRight" || key === "Right") {
      out.add("ArrowRight");
      out.add("arrowright");
      out.add("Right");
      out.add("right");
    }
    if (key === "ArrowUp" || key === "Up") {
      out.add("ArrowUp");
      out.add("arrowup");
      out.add("Up");
      out.add("up");
    }
    if (key === "ArrowDown" || key === "Down") {
      out.add("ArrowDown");
      out.add("arrowdown");
      out.add("Down");
      out.add("down");
    }

    // normalize escape
    if (key === "Escape" || key === "Esc") {
      out.add("Escape");
      out.add("escape");
      out.add("Esc");
      out.add("esc");
    }

    // normalize letters/digits into KeyX / DigitN forms too
    if (typeof key === "string" && key.length === 1) {
      const ch = key.toUpperCase();
      if (ch >= "A" && ch <= "Z") {
        out.add("Key" + ch);
        out.add(("Key" + ch).toLowerCase());
      }
      if (ch >= "0" && ch <= "9") {
        out.add("Digit" + ch);
        out.add(("Digit" + ch).toLowerCase());
      }
    }

    // normalize space
    if (key === " " || key === "Spacebar" || code === "Space") {
      out.add(" ");
      out.add("Space");
      out.add("space");
      out.add("Spacebar");
    }

    return Array.from(out);
  }

  isDown(key) {
    if (key == null) return false;
    if (this.down.has(key)) return true;

    const s = String(key);
    if (this.down.has(s.toLowerCase())) return true;
    if (this.down.has(s.toUpperCase())) return true;

    return false;
  }

  wasPressed(key) {
    if (key == null) return false;
    if (this.pressed.has(key)) return true;

    const s = String(key);
    if (this.pressed.has(s.toLowerCase())) return true;
    if (this.pressed.has(s.toUpperCase())) return true;

    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    this.down.clear();
    this.pressed.clear();
  }
}
