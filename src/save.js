// src/save.js
const KEY = "broke_knight_save_v30";

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveGameSnapshot(snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadGameSnapshot() {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}
