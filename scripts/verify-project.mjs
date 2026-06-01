import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'electron.vite.config.ts',
  'src/electron/main.ts',
  'src/electron/preload.ts',
  'src/main.tsx',
  'src/App.tsx',
  'src/launcher/LauncherService.ts',
  'src/minecraft/MinecraftService.ts',
  'src/pages/HomePage.tsx',
  'src/pages/SettingsPage.tsx'
];

const missing = required.filter((file) => !existsSync(resolve(root, file)));

JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

if (missing.length) {
  console.error(`Missing required files:\n${missing.join('\n')}`);
  process.exit(1);
}

console.log('Dawn Launcher project structure verified.');
