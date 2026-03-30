// src/input.js
// v33 INPUT NORMALIZATION + DELETE / NUMPAD PASS (FULL FILE)
// Goals:
// - keep current game.js compatibility
// - normalize Delete / Backspace / Enter / Tab
// - make 0-9 hotkeys work from BOTH top row and numpad
// - prevent stuck key states on blur
// - preserve wasPressed / isDown API

export default class Input {
  constructor(target = window) {
    this.target = target || window;

    this.down = new Set();
    this.pressed = new Set();

    this._onKeyDown = (e) => {
      const variants = this._variants(e);

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

      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === " " ||
        e.code === "Space" ||
        e.key === "Tab"
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

    this.target.addEventListener("keydown", this._onKeyDown, { passive: false });
    this.target.addEventListener("keyup", this._onKeyUp);
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

    // arrows
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

    // escape
    if (key === "Escape" || key === "Esc") {
      out.add("Escape");
      out.add("escape");
      out.add("Esc");
      out.add("esc");
    }

    // delete
    if (key === "Delete" || code === "Delete" || code === "Del") {
      out.add("Delete");
      out.add("delete");
      out.add("Del");
      out.add("del");
    }

    // backspace
    if (key === "Backspace" || code === "Backspace") {
      out.add("Backspace");
      out.add("backspace");
    }

    // enter
    if (key === "Enter" || code === "Enter" || code === "NumpadEnter") {
      out.add("Enter");
      out.add("enter");
      out.add("NumpadEnter");
      out.add("numpadenter");
    }

    // tab
    if (key === "Tab" || code === "Tab") {
      out.add("Tab");
      out.add("tab");
    }

    // letters / top-row digits
    if (typeof key === "string" && key.length === 1) {
      const ch = key.toUpperCase();

      if (ch >= "A" && ch <= "Z") {
        out.add("Key" + ch);
        out.add(("Key" + ch).toLowerCase());
      }

      if (ch >= "0" && ch <= "9") {
        out.add("Digit" + ch);
        out.add(("Digit" + ch).toLowerCase());
        out.add(ch);
      }
    }

    // numpad digits -> regular digits
    if (typeof code === "string" && /^Numpad[0-9]$/.test(code)) {
      const n = code.slice("Numpad".length);
      out.add(n);
      out.add("Digit" + n);
      out.add(("Digit" + n).toLowerCase());
      out.add("Numpad" + n);
      out.add(("Numpad" + n).toLowerCase());
    }

    // numpad operators / extras
    if (code === "NumpadAdd") {
      out.add("+");
      out.add("Plus");
      out.add("plus");
    }
    if (code === "NumpadSubtract") {
      out.add("-");
      out.add("Minus");
      out.add("minus");
    }
    if (code === "NumpadDecimal") {
      out.add(".");
      out.add("Period");
      out.add("period");
    }

    // space
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
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    this.down.clear();
    this.pressed.clear();
  }
}