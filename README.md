# Dawn Launcher

Dawn Launcher is a desktop Minecraft Java launcher made with Electron, React, TypeScript, and TailwindCSS.

It is designed to be a real launcher foundation, not only a screen mockup. It has systems for accounts, Minecraft instances, Java detection, downloads, mod loaders, Modrinth/CurseForge browsing, content management, screenshots, logs, settings, and plugins.

## What You Need First

Install these before running the project:

1. Node.js 22 or newer
   - Download it from https://nodejs.org
   - After installing, restart your terminal.

2. Java
   - Minecraft 1.18 and newer usually needs Java 17 or newer.
   - Minecraft 1.20.5 and newer usually needs Java 21 or newer.
   - Dawn Launcher can detect Java if it is installed.

3. Internet connection
   - Needed for Minecraft files, Modrinth, CurseForge, and Microsoft login.

## Step By Step: Run Dawn Launcher

Open a terminal in this folder:

```bash
C:\Users\AVANI\OneDrive\Attachments\Documents\Dawn Launcher
```

Then run these commands:

```bash
npm install
```

This downloads the project packages.

After that, start the app:

```bash
npm run dev
```

The Dawn Launcher desktop window should open.

## Step By Step: First Time In The App

1. Open Dawn Launcher with `npm run dev`.

2. Go to `Accounts`.

3. Add an account:
   - Use `Offline` if you only want to test launching without Microsoft login.
   - Use `Microsoft` if you want a real Minecraft account session.

4. Go to `Instances`.

5. Click `New`.

6. Choose:
   - Minecraft version
   - Loader: `vanilla`, `fabric`, `forge`, `neoforge`, or `quilt`
   - RAM amount

7. Go back to `Home`.

8. Select your account and instance.

9. Click `Play`.

The first launch can take time because Minecraft assets, libraries, and the client jar must download.

## Optional: Microsoft Login

Microsoft login needs your own Azure public client ID.

Add it inside the app:

1. Open `Settings`.
2. Find `Microsoft client ID`.
3. Paste your client ID.
4. Click `Save`.
5. Go to `Accounts`.
6. Start Microsoft login.

You can also set it as an environment variable:

```bash
DAWN_MICROSOFT_CLIENT_ID=your-client-id
```

## Optional: CurseForge

Modrinth search works without a key.

CurseForge needs an API key.

Add it inside the app:

1. Open `Settings`.
2. Find `CurseForge API key`.
3. Paste your key.
4. Click `Save`.

Or set it as an environment variable:

```bash
CURSEFORGE_API_KEY=your-api-key
```

## What Each Page Does

`Home`

Main launch screen. Choose an account, choose an instance, and press Play.

`Instances`

Create, edit, duplicate, export, import, and delete Minecraft profiles.

`Mods`

Search and install mods. Enable, disable, import, or remove local mod files.

`Modpacks`

Search and install modpacks. Modrinth `.mrpack` support is included.

`Resource Packs`

Manage resource packs for the selected instance.

`Shaders`

Manage shader packs for the selected instance.

`Accounts`

Add offline accounts or sign in with Microsoft.

`Settings`

Change theme, RAM, Java path, Minecraft folder, download settings, Microsoft client ID, and CurseForge key.

`Console`

Shows launch logs and Minecraft output.

`Gallery`

Shows screenshots from the selected instance.

## Build The App

To build the app files:

```bash
npm run build
```

To create a desktop installer/package:

```bash
npm run dist
```

The packaged app will be created in:

```bash
release
```

## Quick Test

Run:

```bash
npm run verify
```

This checks that the main project files exist.

## Common Problems And Fixes

### `npm` is not recognized

Node.js is not installed correctly, or the terminal was opened before Node.js was installed.

Fix:

1. Install Node.js from https://nodejs.org
2. Close the terminal.
3. Open a new terminal.
4. Run:

```bash
npm --version
```

### App does not open

Try:

```bash
npm install
npm run dev
```

If it still fails, read the terminal error. It usually says which package or setting is missing.

### Error: `Electron uninstall`

This means the Electron desktop executable did not download correctly.

Fix:

```bash
npm run repair:electron
npm run dev
```

**Windows + OneDrive:** If the project lives under `OneDrive`, move it to a normal folder such as `C:\dev\dawn-launcher`. OneDrive file locking often breaks Electron installs. Then:

```powershell
Remove-Item -Recurse -Force node_modules\electron -ErrorAction SilentlyContinue
npm install
npm run repair:electron
npm run dev
```

If it still happens, delete `node_modules/electron` and install again:

```powershell
Remove-Item -Recurse -Force node_modules\electron
npm install
npm run dev
```

### Java is missing

Install Java 17 or Java 21, then open Dawn Launcher and go to:

```bash
Settings > Java
```

Click `Scan`.

### Microsoft login does not work

You must add a Microsoft client ID first.

Offline accounts do not need Microsoft login.

### CurseForge search does not work

CurseForge requires an API key. Modrinth does not.

### First launch is slow

That is normal. Minecraft must download assets, libraries, native files, and the client jar.

## Project Structure

```text
src/
  api/          Online APIs like Modrinth and CurseForge
  animations/   Shared animation settings
  components/   Reusable UI parts
  electron/     Electron main process and preload bridge
  hooks/        React hooks
  launcher/     Accounts, instances, downloads, Java, gallery, plugins
  minecraft/    Minecraft manifests, launch args, loaders, launching
  pages/        App screens
  plugins/      Plugin host foundation
  services/     Small shared helpers
  store/        App state
  styles/       Tailwind and global CSS
  types/        Shared TypeScript types
  utils/        Utility functions
```

## Important Notes

- Offline accounts are useful for testing.
- Microsoft login requires a real Microsoft/Azure client ID.
- Online multiplayer requires a real Minecraft Java account.
- CurseForge requires an API key.
- Minecraft downloads depend on Mojang/Microsoft services being online.
