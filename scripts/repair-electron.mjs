import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import extract from 'extract-zip';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localCache = resolve(projectRoot, '.electron-cache');

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

function isOneDrivePath(path) {
  return /OneDrive/i.test(path);
}

function isCachePermissionError(error) {
  return error?.code === 'EPERM' || error?.code === 'EACCES' || String(error?.message || error).includes('EPERM');
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeWithRetry(path, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function downloadWithCache({ version, checksums, platform, arch, cacheRoot }) {
  const { downloadArtifact } = await import('@electron/get');
  return downloadArtifact({
    version,
    artifactName: 'electron',
    cacheRoot,
    checksums,
    platform,
    arch
  });
}

function runOfficialElectronInstall(electronRoot, cacheRoot) {
  const installScript = join(electronRoot, 'install.js');
  if (!existsSync(installScript)) {
    return false;
  }

  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      electron_config_cache: cacheRoot,
      ELECTRON_CACHE: cacheRoot
    }
  });

  return result.status === 0;
}

async function installFromZip(zipPath, distPath, electronRoot, platformPath) {
  const extractTarget = isOneDrivePath(distPath) ? join(tmpdir(), `dawn-electron-${Date.now()}`) : distPath;

  if (!process.env.ELECTRON_OVERRIDE_DIST_PATH && extractTarget === distPath) {
    await removeWithRetry(distPath).catch((error) => {
      if (!isOneDrivePath(distPath)) {
        throw error;
      }
      console.warn(`Could not remove ${distPath}; using a temp extract folder. (${error.message})`);
    });
  }

  await mkdir(extractTarget, { recursive: true });
  await extract(zipPath, { dir: extractTarget });

  if (extractTarget !== distPath) {
    await mkdir(dirname(distPath), { recursive: true });
    await removeWithRetry(distPath).catch(() => undefined);
    await cp(extractTarget, distPath, { recursive: true, force: true });
    await removeWithRetry(extractTarget).catch(() => undefined);
  }

  const distTypes = join(distPath, 'electron.d.ts');
  if (existsSync(distTypes)) {
    await rm(join(electronRoot, 'electron.d.ts'), { force: true }).catch(() => undefined);
    await rename(distTypes, join(electronRoot, 'electron.d.ts'));
  }

  await writeFile(join(electronRoot, 'path.txt'), platformPath);
}

async function main() {
  let electronRoot;
  try {
    electronRoot = dirname(require.resolve('electron/package.json'));
  } catch {
    console.log('Electron package is not installed; skipping Electron repair.');
    return;
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
  const executablePath = join(distPath, platformPath);
  const pathFile = join(electronRoot, 'path.txt');
  const preferLocalCache =
    Boolean(process.env.FORCE_LOCAL_ELECTRON_CACHE) ||
    isOneDrivePath(projectRoot) ||
    isOneDrivePath(electronRoot);

  async function isInstalled() {
    try {
      const installedVersion = (await readFile(join(distPath, 'version'), 'utf8')).replace(/^v/, '').trim();
      const installedPath = (await readFile(pathFile, 'utf8')).trim();
      return installedVersion === version && installedPath === platformPath && existsSync(executablePath);
    } catch {
      return false;
    }
  }

  if (await isInstalled()) {
    console.log(`Electron ${version} is ready at ${executablePath}`);
    return;
  }

  if (preferLocalCache) {
    await mkdir(localCache, { recursive: true });
    console.log(`Using project-local Electron cache at ${localCache}`);
  }

  const checksums =
    process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
      ? undefined
      : JSON.parse(await readFile(checksumsPath, 'utf8'));

  const downloadOptions = { version, checksums, platform, arch };

  let zipPath;
  try {
    zipPath = await downloadWithCache({
      ...downloadOptions,
      cacheRoot: preferLocalCache ? localCache : process.env.electron_config_cache
    });
  } catch (error) {
    if (!preferLocalCache && isCachePermissionError(error)) {
      await mkdir(localCache, { recursive: true });
      console.warn(`Electron cache was not writable; using ${localCache}`);
      zipPath = await downloadWithCache({ ...downloadOptions, cacheRoot: localCache });
    } else {
      throw error;
    }
  }

  try {
    await installFromZip(zipPath, distPath, electronRoot, platformPath);
  } catch (error) {
    console.warn(`Custom Electron extract failed (${error.message}). Trying official installer...`);
    const cacheRoot = preferLocalCache ? localCache : process.env.electron_config_cache || localCache;
    await mkdir(cacheRoot, { recursive: true });
    if (!runOfficialElectronInstall(electronRoot, cacheRoot)) {
      throw error;
    }
  }

  if (!(await isInstalled())) {
    throw new Error('Electron binary is still missing after repair.');
  }

  console.log(`Electron ${version} is ready at ${executablePath}`);
}

main().catch((error) => {
  console.error(`Electron repair failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Try moving the project out of OneDrive, then run: npm run repair:electron');
  process.exit(1);
});
