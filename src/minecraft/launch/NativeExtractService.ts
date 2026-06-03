import extract from 'extract-zip';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MojangLibrary, MojangVersion } from '../MinecraftTypes';

export class NativeExtractService {
  async extract(
    version: MojangVersion,
    librariesRoot: string,
    nativesDir: string,
    includeLibrary: (library: MojangLibrary) => boolean,
    onStage?: (message: string) => void
  ): Promise<void> {
    const marker = join(nativesDir, '.natives-version');
    if (await this.isInstalled(nativesDir, version.id, marker)) {
      return;
    }

    onStage?.('Extracting native libraries');
    if (existsSync(nativesDir)) {
      await rm(nativesDir, { recursive: true, force: true });
    }
    await mkdir(nativesDir, { recursive: true });

    let extracted = 0;
    let skipped = 0;
    let filtered = 0;
    const missingFiles: string[] = [];

    for (const library of version.libraries) {
      if (!includeLibrary(library)) {
        filtered += 1;
        continue;
      }

      const native = library.natives?.[this.osName()]?.replace('${arch}', process.arch === 'x64' ? '64' : '32');
      if (!native) {
        skipped += 1;
        continue;
      }

      let download = library.downloads?.classifiers?.[native];
      if (!download && library.url) {
        const [group, artifact, ver] = library.name.split(':');
        if (group && artifact && ver) {
          const path = `${group.replace(/\./g, '/')}/${artifact}/${ver}/${artifact}-${ver}-${native}.jar`;
          download = { path, url: `${library.url.replace(/\/$/, '')}/${path}` };
        }
      }

      if (!download?.path) {
        skipped += 1;
        continue;
      }

      const source = join(librariesRoot, download.path);
      if (!existsSync(source)) {
        skipped += 1;
        missingFiles.push(`${library.name}: ${source}`);
        continue;
      }

      await extract(source, { dir: nativesDir });
      extracted += 1;
    }

    if (!extracted) {
      if (missingFiles.length > 0) {
        const details = `Missing ${missingFiles.length} native JARs (examples: ${missingFiles.slice(0, 3).join('; ')})`;
        throw new Error(`No native libraries were extracted. ${details}\nReinstall the Minecraft version.`);
      }
      const details = `No native classifiers found for this platform (filtered: ${filtered}, skipped: ${skipped}/${version.libraries.length - filtered})`;
      onStage?.(`No platform-specific natives needed (${details})`);
      await writeFile(marker, version.id, 'utf8');
      return;
    }

    const hasAnyBinaries = await this.hasNativeBinaries(nativesDir);
    if (!hasAnyBinaries) {
      throw new Error('Native library extraction produced no usable binaries (.so/.dll/.dylib). Reinstall the Minecraft version.');
    }

    await writeFile(marker, version.id, 'utf8');
    onStage?.(`Native libraries ready (${extracted} packages)`);
  }

  private async isInstalled(nativesDir: string, versionId: string, marker: string): Promise<boolean> {
    if (!existsSync(marker)) {
      return false;
    }
    const cached = (await readFile(marker, 'utf8').catch(() => '')).trim();
    if (cached !== versionId) {
      return false;
    }
    return this.hasNativeBinaries(nativesDir);
  }

  private async hasNativeBinaries(dir: string): Promise<boolean> {
    if (!existsSync(dir)) {
      return false;
    }
    try {
      const entries = await readdir(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && /\.(so|dll|dylib)(\.|$)/i.test(entry.name)) {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  private osName(): 'windows' | 'osx' | 'linux' {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'osx';
    return 'linux';
  }
}
