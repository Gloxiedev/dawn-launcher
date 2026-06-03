import extract from 'extract-zip';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MojangLibrary, MojangVersion } from '../MinecraftTypes';

const NATIVE_SUBDIRS = ['java', 'jna', 'lwjgl', 'netty'] as const;
type NativeSubdir = (typeof NATIVE_SUBDIRS)[number];

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
    for (const sub of NATIVE_SUBDIRS) {
      await mkdir(join(nativesDir, sub), { recursive: true });
    }

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
          download = { path };
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

      const subdir = this.nativeSubdir(library.name, download.path);
      await extract(source, { dir: join(nativesDir, subdir) });
      extracted += 1;
    }

    if (!extracted) {
      const details = missingFiles.length > 0 
        ? `Missing ${missingFiles.length} files (samples: ${missingFiles.slice(0, 3).join('; ')})`
        : `No native classifiers found (filtered: ${filtered}, skipped: ${skipped}/${version.libraries.length - filtered})`;
      throw new Error(`No native libraries were extracted. ${details}\nReinstall the Minecraft version.`);
    }

    if (!(await this.hasNativeBinaries(join(nativesDir, 'lwjgl')))) {
      throw new Error('Native library extraction failed (no LWJGL binaries found).');
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
    return this.hasNativeBinaries(join(nativesDir, 'lwjgl'));
  }

  private async hasNativeBinaries(dir: string): Promise<boolean> {
    if (!existsSync(dir)) {
      return false;
    }
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (await this.hasNativeBinaries(path)) {
            return true;
          }
          continue;
        }
        if (/\.(so|dll|dylib)(\.|$)/i.test(entry.name)) {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  private nativeSubdir(libraryName: string, artifactPath: string): NativeSubdir {
    const text = `${libraryName} ${artifactPath}`.toLowerCase();
    if (text.includes('lwjgl')) return 'lwjgl';
    if (text.includes('jna')) return 'jna';
    if (text.includes('netty')) return 'netty';
    return 'java';
  }

  private osName(): 'windows' | 'osx' | 'linux' {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'osx';
    return 'linux';
  }
}
