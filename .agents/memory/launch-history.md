---
name: Launch history system
description: How persistent launch history is stored, written, and consumed.
---

## Storage
`LaunchHistoryEntry[]` lives in `LauncherDatabaseShape.launchHistory` (JsonDatabase).
Capped at 500 entries (`MAX_HISTORY_ENTRIES` in MinecraftService).

## Write path
1. `MinecraftService.launch()` calls `appendHistory()` when the game process spawns (state = 'running').
2. On game `exit` event, `finalizeHistory()` writes `exitedAt`, `durationMs`, `exitCode`, `state`.
3. `launchCount` is incremented in `appendHistory()`; `totalPlayTimeMs` is updated in `finalizeHistory()`.

## IPC
- `history:list` → `minecraftService.listHistory()` (returns newest-first)
- `history:clear` → `minecraftService.clearHistory()`
Both exposed in preload under `window.dawn.history`.

## Store
`useLauncherStore`: `launchHistory`, `refreshHistory()`, `clearHistory()`.
`refreshHistory()` is called on bootstrap AND whenever process state transitions to idle/exited/crashed/stopped.

## Mock
`mockDawn.ts` simulates a 12-second launch sequence and appends a real `LaunchHistoryEntry` on exit.

**Why:** Needed a persistent, auditable record of sessions to drive the stats panel on HomePage and the History tab in Settings.
