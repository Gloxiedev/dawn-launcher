# Dawn Launcher — Critical Bug Fix & Stability Update

This document records fixes from the production-readiness audit (June 2026).

## UI & Navigation

### Scrollability
- **Issue:** Dual-column pages used `xl:` (1280px) breakpoints while the window minimum width is 1040px, so content was clipped with no scrollbar on many layouts.
- **Fix:** Added `PageShell` (`src/components/PageShell.tsx`) — single scroll on narrow viewports, independent column scroll at `lg+`. Applied to Home, Instances, Library, Accounts, Settings, and Gallery.
- **Files:** `src/App.tsx`, `src/styles/index.css`, all `src/pages/*.tsx`, `src/components/TopBar.tsx` (`shrink-0` on header)

### Settings sidebar
- **Issue:** Java/Plugins panels were cramped in a right aside with `content-start`, causing clipping.
- **Fix:** Rebuilt Settings with a left category nav (Appearance, Runtime, Credentials, Java, Plugins) and a full-height scrollable content area.
- **Files:** `src/pages/SettingsPage.tsx`

## Content Management

### Resource detection & categorization
- **Issue:** Extension-only filtering; unused heuristics; wrong-type files could appear in lists; imports were not validated.
- **Fix:** New `ContentValidation` module — ZIP/JAR signature checks, archive sniffing (`fabric.mod.json`, `mods.toml`, `pack.mcmeta`, `modrinth.index.json`), import validation, and list filtering by detected type.
- **Files:** `src/launcher/ContentValidation.ts`, `src/launcher/ContentService.ts`

### Search library
- **Issue:** TopBar search only navigated to Mods; did not run marketplace or instance search; installed list stale after install.
- **Fix:** `triggerLibrarySearch` + `librarySearchNonce` in store; TopBar Enter triggers search on library and Instances pages; `ContentTable` listens for `content:changed` events.
- **Files:** `src/store/useLauncherStore.ts`, `src/components/TopBar.tsx`, `src/pages/LibraryPage.tsx`, `src/pages/InstancesPage.tsx`, `src/electron/main.ts`, `src/electron/preload.ts`

### Gallery
- **Issue:** Full-file base64 load every 3s; broken `file://` thumbnails; no live updates.
- **Fix:** Metadata-only listing; `gallery:preview` via Electron `nativeImage` (resized data URLs); `fs.watch` on screenshots folder with `gallery:changed` events.
- **Files:** `src/launcher/GalleryService.ts`, `src/pages/GalleryPage.tsx`, `src/electron/main.ts`, `src/types/launcher.ts`

### Notes removal
- **Status:** No Notes UI or storage existed in the codebase; nothing to remove.

## Authentication

### Microsoft account login
- **Issue:** Blocking `while` loop on IPC thread during `microsoftComplete`; no token refresh; shallow entitlements check; no `slow_down` handling.
- **Fix:** Non-blocking `microsoftPoll()` from renderer with auto-poll after device-code start; `ensureValidSession()` refresh_token flow before launch; Java ownership verified via `product_minecraft` / `game_minecraft`; improved Xbox error messages.
- **Files:** `src/launcher/AccountService.ts`, `src/pages/AccountPage.tsx`, `src/minecraft/MinecraftService.ts`, `src/electron/main.ts`, `src/electron/preload.ts`

## Instance & Mod Management

### Game launch failure after installing mods
- **Issue:** Missing loader install after mod download; no dependency resolution; modpack zips not installed; no pre-launch validation.
- **Fix:**
  - Modrinth required dependencies installed recursively before primary mod
  - Loader auto-installed after mod/modpack install when missing
  - CurseForge modpack overrides/mods extracted into instance `gameDir`
  - Only `.mrpack` supported for Modrinth modpacks (clear error for plain zip)
  - Pre-launch validation (`InstanceValidation`) — corrupt jars, vanilla+mods conflict, missing loader metadata warnings
  - Install errors surfaced in store `error` field
- **Files:** `src/api/MarketplaceService.ts`, `src/launcher/InstanceValidation.ts`, `src/minecraft/MinecraftService.ts`, `src/store/useLauncherStore.ts`

## Files modified (summary)

| Area | Files |
|------|--------|
| Layout | `App.tsx`, `PageShell.tsx`, `index.css`, `TopBar.tsx`, all pages |
| Content | `ContentService.ts`, `ContentValidation.ts`, `ContentTable.tsx` |
| Marketplace | `MarketplaceService.ts` |
| Auth | `AccountService.ts`, `AccountPage.tsx` |
| Launch | `MinecraftService.ts`, `InstanceValidation.ts` |
| Gallery | `GalleryService.ts`, `GalleryPage.tsx` |
| IPC | `main.ts`, `preload.ts`, `launcher.ts` |
| State | `useLauncherStore.ts` |

## Verification

```bash
npm run build   # TypeScript + production bundle
npm run verify  # Project structure check
```

Manual test checklist:
1. Resize window to minimum width — all pages scroll, nothing clipped
2. Settings — all categories visible and scrollable
3. Modrinth mod install on Fabric instance — appears in Installed, game launches
4. Microsoft login — device code, auto-complete, session refresh on launch
5. Gallery — new screenshot appears without restart
6. TopBar search — filters instances / runs marketplace search on library pages
