// src/save.js
// v29: save migration support (auto-load v28 save if present, then re-save as v29)

const KEY_V29 = "broke_knight_save_v29";
const KEY_V28 = "broke_knight_save_v28";

export function saveGame(data) {
  try {
    localStorage.setItem(KEY_V29, JSON.stringify(data));
  } catch {}
}

export function loadGame() {
  try {
    // Prefer newest save
    const raw29 = localStorage.getItem(KEY_V29);
    if (raw29) {
      const parsed = JSON.parse(raw29);
      if (parsed && typeof parsed === "object") return parsed;
    }

    // Fallback to v28, and migrate forward automatically
    const raw28 = localStorage.getItem(KEY_V28);
    if (!raw28) return null;

    const parsed28 = JSON.parse(raw28);
    if (!parsed28 || typeof parsed28 !== "object") return null;

    // Write-forward migration: store the v28 blob as v29 so next load is fast
    try {
      localStorage.setItem(KEY_V29, JSON.stringify(parsed28));
    } catch {}

    return parsed28;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY_V29); } catch {}
  try { localStorage.removeItem(KEY_V28); } catch {}
}
