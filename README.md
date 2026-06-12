[WARNING: There are no active developers contributing to this project as of 12/06/2026]

# 🌅 Dawn Launcher

Dawn Launcher is a modern, lightweight desktop Minecraft Java launcher built with Electron, React, TypeScript, and TailwindCSS. 

More than just a visual mockup, Dawn Launcher is a fully functional foundation featuring account management, Minecraft instance isolation, automated Java detection, built-in mod loaders, Modrinth/CurseForge integration, and a dedicated plugin system.

---

## 🛑 What You Need First (Prerequisites)

Before you can run Dawn Launcher, you need to install a couple of basic tools on your computer:

1. **Node.js (Version 22 or newer)**
   - Download and install it from [nodejs.org](https://nodejs.org/en/download).
   - *Important:* After installing, always prefer to restart your computer. 
2. **Java**
   - Minecraft 1.18+ requires **Java 17** or newer. 
   - Minecraft 1.20.5+ requires **Java 21** or newer.
   - *(Note: Dawn Launcher has built-in Java detection to help you find your installed versions!)*
   - *(Java: We reccommend using Adoptium (Eclipse Temurin) as it provides better performance. You can get it [Here](https://adoptium.net/temurin/releases)*
3. **Internet Connection**
   - An internet connection is required for the first launch of the game, downloading of mods and signing in via Microsoft login.

---

## 🚀 How to Install and Run:

1. **Open the Terminal/cmd application on your computer.**
2. **Download the Project folder and navigate to the project folder:**
   ```bash
   cd path/to/your/dawn-launcher-folder

```

3. **Download the project dependencies:**
*(This tells your computer to grab all the required code packages to make the app work).*
```bash
npm install

```


4. **Start the Launcher:**
```bash
npm run dev

```


*The Dawn Launcher desktop window should now pop up on your screen!*

---

## 🎮 First Time Setup Guide

Once the app is open, here is how to get into the game:

1. **Add an Account:**
* Go to the **Accounts** tab.
* Choose **Offline** if you want to use an account that doesn't communicate with Mojang's authentication servers.
* Choose **Microsoft** to log in via your Microsoft account with a valid Minecraft license or XBOX Game Pass for PC/Ultimate


2. **Create an Instance (A Game Profile):**
* Go to the **Instances** tab and click **New**.
* Pick your desired Minecraft version.
* Pick your Loader (Vanilla, Fabric, Forge, NeoForge, or Quilt).
* Allocate your RAM (e.g., 4096MB).


3. **Launch the Game:**
* Head back to the **Home** tab.
* Select your Account and your new Instance.
* Click **Play**!



> **⚠️ Note:** The very first time you click Play, it might take a few minutes. The launcher has to download Minecraft's core files, assets, and libraries directly from Microsoft's servers.

---

## 🔑 Optional Integrations

### Microsoft Login Setup

To use real Minecraft accounts, you need to provide an Azure Public Client ID.

1. Open **Settings** in the launcher.
2. Find **Microsoft Client ID**.
3. Paste your ID and click **Save**.
*(Alternatively, set your environment variable: `DAWN_MICROSOFT_CLIENT_ID=your-client-id`)*

### CurseForge Mods

Searching Modrinth works instantly out of the box. To search CurseForge, you need an API key.

1. Open **Settings** in the launcher.
2. Find **CurseForge API Key**.
3. Paste your key and click **Save**.
*(Alternatively, set your environment variable: `CURSEFORGE_API_KEY=your-api-key`)*

---

## 📖 App Features overview

* **Home:** Your main dashboard to select your account, instance, and launch the game.
* **Instances:** Create, edit, duplicate, import, export, and delete your Minecraft profiles.
* **Mods & Modpacks:** Search, install, and manage mods. Fully supports Modrinth `.mrpack` files.
* **Resource Packs & Shaders:** Easily manage visual upgrades for your selected instance.
* **Accounts:** Switch between Offline testing accounts and official Microsoft accounts.
* **Settings:** Tweak your theme, RAM allocation, Java paths, and API keys.
* **Console:** View live background logs and Minecraft output for easy troubleshooting.
* **Gallery:** View screenshots taken within your selected instance.

---

## 🛠️ Troubleshooting Common Problems

**"npm is not recognized"**
Node.js wasn't installed correctly, or you didn't restart your terminal after installing it. Reinstall Node.js, close your terminal completely, open a new one, and try again.

**The App won't open / "Electron uninstall" error**
Sometimes the desktop window tool (Electron) fails to download properly. Run these commands to fix it:

```bash
npm run repair:electron
npm run dev

```

*(Windows Users: If your project folder is inside a **OneDrive** folder, OneDrive's auto-sync might be blocking the files. Move the entire Dawn Launcher folder to a normal directory like `C:\Projects\DawnLauncher` and try again).*

**"Java is missing"**
Ensure you have Java 17 or 21 installed on your PC. Then open Dawn Launcher, go to **Settings > Java**, and click **Scan**.

---

## 💻 For Developers: Building the App

If you want to package the app into a final, shareable installer (like a `.exe` or `.dmg`):

**Verify all files are intact:**

```bash
npm run verify

```

**Compile the code:**

```bash
npm run build

```

**Create the final desktop installer:**

```bash
npm run dist

```

*Your final packaged app will appear inside the `release` folder!*

```

```
