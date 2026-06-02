import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { finished } from 'node:stream/promises';
import extract from 'extract-zip';
import type { LauncherSettings } from '@/types/launcher';
import { LauncherPaths } from './LauncherPaths';
import type { Logger } from './Logger';

interface AdoptiumAsset {
  binary: {
    package: { link: string; name: string };
  };
}

export class JavaInstallService {
  constructor(
    private readonly paths: LauncherPaths,
    private readonly logger?: Logger
  ) {}

  async ensureInstalled(settings: LauncherSettings, major: number): Promise<string> {
    const existing = await this.findInstalled(settings, major);
    if (existing) {
      return existing;
    }

    await this.logger?.info('java', `Downloading Java ${major} runtime`);
    const os = this.adoptiumOs();
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jdk&os=${os}&vendor=eclipse`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!response.ok) {
      throw new Error(`Unable to download Java ${major} (${response.status}).`);
    }

    const assets = (await response.json()) as AdoptiumAsset[];
    const asset = assets[0]?.binary?.package;
    if (!asset?.link) {
      throw new Error(`No Java ${major} package found for ${os}/${arch}.`);
    }

    const runtimeDir = join(this.paths.runtimeRoot(settings), `java-${major}`);
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(runtimeDir, { recursive: true });

    const archivePath = join(runtimeDir, asset.name);
    const archiveResponse = await fetch(asset.link, {
      headers: { 'User-Agent': 'DawnLauncher/0.1 (+https://dawn.local)' }
    });
    if (!archiveResponse.ok || !archiveResponse.body) {
      throw new Error(`Java ${major} download failed (${archiveResponse.status}).`);
    }

    const writer = createWriteStream(archivePath);
    await pipeline(archiveResponse.body as unknown as NodeJS.ReadableStream, writer);
    await finished(writer);

    if (asset.name.endsWith('.zip')) {
      await extract(archivePath, { dir: runtimeDir });
    } else if (asset.name.endsWith('.tar.gz')) {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      await execFileAsync('tar', ['-xzf', archivePath, '-C', runtimeDir]);
    }

    const javaPath = await this.findInstalled(settings, major);
    if (!javaPath) {
      throw new Error(`Java ${major} was downloaded but could not be located.`);
    }

    if (process.platform !== 'win32') {
      await chmod(javaPath, 0o755).catch(() => undefined);
    }

    await this.logger?.info('java', `Java ${major} installed`, { path: javaPath });
    return javaPath;
  }

  private async findInstalled(settings: LauncherSettings, major: number): Promise<string | undefined> {
    const root = join(this.paths.runtimeRoot(settings), `java-${major}`);
    const executable = process.platform === 'win32' ? 'java.exe' : 'java';
    return this.findJavaBinary(root, executable, 6);
  }

  private async findJavaBinary(dir: string, executable: string, depth: number): Promise<string | undefined> {
    if (depth < 0) {
      return undefined;
    }

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isFile() && entry.name === executable) {
          return path;
        }
        if (entry.isDirectory()) {
          const nested = await this.findJavaBinary(path, executable, depth - 1);
          if (nested) {
            return nested;
          }
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private adoptiumOs(): string {
    if (process.platform === 'win32') {
      return 'windows';
    }
    if (process.platform === 'darwin') {
      return 'mac';
    }
    return 'linux';
  }
}
