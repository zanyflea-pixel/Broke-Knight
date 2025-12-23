// src/save.js
// Minimal localStorage save scaffold.
// You can extend this later (gear, flags, waystones, etc.)

const KEY = "broke_knight_save_v27";

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function loadGame() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch {}
}
