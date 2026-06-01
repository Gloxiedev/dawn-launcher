import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let electronRoot;
try {
  electronRoot = dirname(require.resolve('electron/package.json'));
} catch {
  console.log('Electron package is not installed; skipping Electron repair.');
  process.exit(0);
}

const electronPackage = JSON.parse(await readFile(join(electronRoot, 'package.json'), 'utf8'));
const checksumsPath = join(electronRoot, 'checksums.json');
const version = electronPackage.version;
const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || process.platform;
const arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch;
const platformPath = getPlatformPath(platform);
const distPath = process.env.ELECTRON_OVERRIDE_DIST_PATH
  ? resolve(process.env.ELECTRON_OVERRIDE_DIST_PATH)
  : join(electronRoot, 'dist');
const pathFile = join(electronRoot, 'path.txt');
const executablePath = join(distPath, platformPath);

if (await isInstalled()) {
  process.exit(0);
}

const checksums =
  process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
    ? undefined
    : JSON.parse(await readFile(checksumsPath, 'utf8'));

const zipPath = await downloadElectron();
if (!process.env.ELECTRON_OVERRIDE_DIST_PATH) {
  await rm(distPath, { recursive: true, force: true });
}
await mkdir(distPath, { recursive: true });
const { default: extract } = await import('extract-zip');
await extract(zipPath, { dir: distPath });

const distTypes = join(distPath, 'electron.d.ts');
if (existsSync(distTypes)) {
  await rm(join(electronRoot, 'electron.d.ts'), { force: true });
  await rename(distTypes, join(electronRoot, 'electron.d.ts'));
}

await writeFile(pathFile, platformPath);
console.log(`Electron ${version} is ready at ${executablePath}`);

async function isInstalled() {
  try {
    const installedVersion = (await readFile(join(distPath, 'version'), 'utf8')).replace(/^v/, '').trim();
    const installedPath = (await readFile(pathFile, 'utf8')).trim();

    return installedVersion === version && installedPath === platformPath && existsSync(executablePath);
  } catch {
    return false;
  }
}

async function downloadElectron() {
  try {
    return await downloadWithCache(process.env.electron_config_cache);
  } catch (error) {
    if (process.env.electron_config_cache || !isCachePermissionError(error)) {
      throw error;
    }

    const localCache = resolve('.electron-cache');
    await mkdir(localCache, { recursive: true });
    console.warn(`Electron cache was not writable; using ${localCache}`);
    return downloadWithCache(localCache);
  }
}

function downloadWithCache(cacheRoot) {
  return import('@electron/get').then(({ downloadArtifact }) =>
    downloadArtifact({
      version,
      artifactName: 'electron',
      cacheRoot,
      checksums,
      platform,
      arch
    })
  );
}

function isCachePermissionError(error) {
  return error?.code === 'EPERM' || String(error?.message || error).includes('EPERM');
}

function getPlatformPath(targetPlatform) {
  switch (targetPlatform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Electron builds are not available on platform: ${targetPlatform}`);
  }
}
