// src/input.js
// v37 INPUT COMPAT + SAFETY PASS (FULL FILE)
// Goals:
// - keep current game.js compatibility
// - preserve isDown / wasPressed / endFrame API
// - normalize arrows / letters / digits / numpad
// - prevent stuck keys after blur / alt-tab / hidden tab
// - keep controls responsive without repeat spam
// - keep map hotkeys and menu hotkeys reliable

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

      if (!alreadyDown && !e.repeat) {
        for (const v of variants) this.pressed.add(v);
      }

      for (const v of variants) this.down.add(v);

      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === " " ||
        e.key === "Spacebar" ||
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
      this.clearAll();
    };

    this._onWindowFocus = () => {
      this.clearPressed();
    };

    this._onVisibilityChange = () => {
      if (document.hidden) {
        this.clearAll();
      } else {
        this.clearPressed();
      }
    };

    this._onPointerLockChange = () => {
      this.clearPressed();
    };

    this._onMouseLeave = () => {
      this.clearPressed();
    };

    this.target.addEventListener("keydown", this._onKeyDown, { passive: false });
    this.target.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    window.addEventListener("focus", this._onWindowFocus);
    document.addEventListener("visibilitychange", this._onVisibilityChange);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    window.addEventListener("mouseleave", this._onMouseLeave);
  }

  _variants(e) {
    const out = new Set();

    const key = e?.key;
    const code = e?.code;

    if (key != null) {
      const s = String(key);
      out.add(s);
      out.add(s.toLowerCase());
      out.add(s.toUpperCase());
    }

    if (code != null) {
      const s = String(code);
      out.add(s);
      out.add(s.toLowerCase());
      out.add(s.toUpperCase());
    }

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

    if (key === "Escape" || key === "Esc" || code === "Escape") {
      out.add("Escape");
      out.add("escape");
      out.add("Esc");
      out.add("esc");
    }

    if (typeof key === "string" && key.length === 1) {
      const ch = key.toUpperCase();

      if (ch >= "A" && ch <= "Z") {
        out.add(ch);
        out.add(ch.toLowerCase());
        out.add("Key" + ch);
        out.add(("Key" + ch).toLowerCase());
      }

      if (ch >= "0" && ch <= "9") {
        out.add(ch);
        out.add("Digit" + ch);
        out.add(("Digit" + ch).toLowerCase());
      }
    }

    if (typeof code === "string" && /^Digit[0-9]$/.test(code)) {
      const d = code.slice(5);
      out.add(d);
      out.add("Digit" + d);
      out.add(("Digit" + d).toLowerCase());
    }

    if (typeof code === "string" && /^Numpad[0-9]$/.test(code)) {
      const n = code.slice(6);
      out.add(n);
      out.add("Digit" + n);
      out.add(("Digit" + n).toLowerCase());
      out.add("Numpad" + n);
      out.add(("Numpad" + n).toLowerCase());
    }

    if (key === "Enter" || code === "Enter" || code === "NumpadEnter") {
      out.add("Enter");
      out.add("enter");
    }

    if (key === "Delete" || code === "Delete") {
      out.add("Delete");
      out.add("delete");
      out.add("Del");
      out.add("del");
    }

    if (key === "Backspace" || code === "Backspace") {
      out.add("Backspace");
      out.add("backspace");
    }

    if (key === "Tab" || code === "Tab") {
      out.add("Tab");
      out.add("tab");
    }

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
    if (code === "NumpadMultiply") {
      out.add("*");
      out.add("Multiply");
      out.add("multiply");
    }
    if (code === "NumpadDivide") {
      out.add("/");
      out.add("Divide");
      out.add("divide");
    }
    if (code === "NumpadDecimal") {
      out.add(".");
      out.add("Period");
      out.add("period");
    }

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

  clearPressed() {
    this.pressed.clear();
  }

  clearAll() {
    this.down.clear();
    this.pressed.clear();
  }

  endFrame() {
    this.pressed.clear();
  }

  destroy() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("focus", this._onWindowFocus);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    window.removeEventListener("mouseleave", this._onMouseLeave);
    this.clearAll();
  }
}