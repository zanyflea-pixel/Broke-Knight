# Broke Knight

A browser RPG prototype built as plain JavaScript modules. Run it through the local server so module imports load correctly.

## Run

```powershell
cd "C:\Users\Jimmy\Desktop\Broke Knight"
powershell -NoProfile -ExecutionPolicy Bypass -File .\serve-broke-knight.ps1
```

Open the URL printed by the script. If the default port is busy, the server automatically scans upward for a free port.

## Useful Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-broke-knight.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\update-project-snapshot.ps1
```

`check-broke-knight.ps1` verifies required files, local module imports, and HTTP responses from the running server.

`update-project-snapshot.ps1` refreshes `all-project.txt` from the current project files.

## Controls

- Arrow keys: move
- Mouse or click: aim / attack
- Q/W/E/R: skills
- 1/2: health and mana potions
- F: interact
- B: dock or sail
- M: map
- I: inventory
- K: skills
- J: quests and tracking
- O: status
- G: dev tools
- Esc: close menus or leave dungeon
