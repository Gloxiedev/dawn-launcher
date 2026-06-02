---
name: Mock Dawn API
description: How the web-preview shim (mockDawn.ts) works and what it must cover.
---

## Purpose
`installMockDawn()` (called unconditionally in `src/main.tsx`) attaches a full `DawnApi` to `window.dawn` when running in Vite web-dev mode (no Electron context).

## Namespaces that must be kept in sync with DawnApi type
- app, window, settings, accounts, instances, minecraft, content, marketplace, downloads, plugins, gallery, **history**, events

## Key behaviours
- `minecraft.launch()` runs `simulateLaunch()`: emits console lines on a timer, transitions process states (preparing → launching → running → exited), then appends a real `LaunchHistoryEntry` to the in-memory `launchHistory` array and updates `instances`.
- `history.list()` / `history.clear()` operate on the in-memory `launchHistory` array.
- `events.onProcessState` / `events.onConsole` use in-memory `Set` of listeners.

**Why:** Every new DawnApi method added to `types/launcher.ts` must have a corresponding stub in `mockDawn.ts` or the web preview will throw at runtime.
