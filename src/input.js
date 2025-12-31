// src/input.js
// v30: robust input (no sticking), dt/fps helpers, optional wheel support
//
// This file is intentionally small + reliable.
// Exposes:
// - down(key), pressed(key), released(key)
// - update() to be called once per frame
// - dt(), fps()
// - wheelDelta() returns wheel steps since last update (optional)
//
// Keys are normalized to lowercase.
// Arrow keys are: "arrowup", "arrowdown", "arrowleft", "arrowright"
// Escape: "escape"

export default class Input {
  constructor(canvas = null) {
    this.canvas = canvas;

    this._down = new Set();
    this._pressed = new Set();
    this._released = new Set();

    this._wheel = 0;

    this._lastT = performance.now();
    this._dt = 1 / 60;
    this._fps = 60;

    this._bind();
  }

  setCanvas(canvas) {
    this.canvas = canvas;
  }

  _normKey(e) {
    // prefer e.key for layout-aware mapping; we normalize
    let k = (e.key || "").toLowerCase();

    // unify spacebar
    if (k === " ") k = "space";

    // unify esc
    if (k === "esc") k = "escape";

    // unify old browsers
    if (k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright") return k;

    return k;
  }

  _bind() {
    // Important: prevent key “sticking” when window loses focus
    window.addEventListener(
      "blur",
      () => {
        this._down.clear();
        this._pressed.clear();
        this._released.clear();
        this._wheel = 0;
      },
      { passive: true }
    );

    window.addEventListener(
      "keydown",
      (e) => {
        const k = this._normKey(e);

        // prevent browser scrolling for arrows/space
        if (k.startsWith("arrow") || k === "space") e.preventDefault();

        // first-frame press detection
        if (!this._down.has(k)) this._pressed.add(k);
        this._down.add(k);
      },
      { passive: false }
    );

    window.addEventListener(
      "keyup",
      (e) => {
        const k = this._normKey(e);
        if (this._down.has(k)) this._released.add(k);
        this._down.delete(k);
      },
      { passive: true }
    );

    // Mouse wheel (optional)
    window.addEventListener(
      "wheel",
      (e) => {
        // normalize wheel "steps"
        // most mice: deltaY ~ 100-120 per notch, trackpads smaller
        const dy = e.deltaY || 0;
        if (!dy) return;
        // accumulate steps
        this._wheel += dy;
      },
      { passive: true }
    );

    // Prevent right-click menu if desired (safe no-op if canvas not set)
    window.addEventListener(
      "contextmenu",
      (e) => {
        if (!this.canvas) return;
        // If user right clicks on canvas, block menu (helps games)
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX;
        const my = e.clientY;
        if (mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
  }

  update() {
    // dt/fps
    const now = performance.now();
    const raw = (now - this._lastT) / 1000;
    this._lastT = now;

    // clamp dt to avoid huge spikes when tab was inactive
    this._dt = Math.max(1 / 240, Math.min(1 / 20, raw || 1 / 60));
    this._fps = this._dt > 0 ? 1 / this._dt : 60;

    // pressed/released are "edge" sets; clear them each frame AFTER consumers used them.
    // call order: game.update reads pressed/released then calls input.update next frame.
    // To make it foolproof, we clear at the start of each update for the previous frame’s state.
    this._pressed.clear();
    this._released.clear();

    // decay wheel each frame (keep remainder)
    // we keep raw delta to allow trackpads; wheelDelta() returns steps.
    // leave as-is; wheelDelta() will consume.
  }

  dt() {
    return this._dt;
  }

  fps() {
    return this._fps;
  }

  down(key) {
    return this._down.has(String(key).toLowerCase());
  }

  pressed(key) {
    return this._pressed.has(String(key).toLowerCase());
  }

  released(key) {
    return this._released.has(String(key).toLowerCase());
  }

  wheelDelta() {
    // Convert accumulated delta to steps.
    // Positive should mean "scroll down" in UI panels.
    const d = this._wheel;
    if (!d) return 0;

    // typical mouse wheel notch ~ 120
    const steps = d / 120;

    // consume all
    this._wheel = 0;
    return steps;
  }
}
