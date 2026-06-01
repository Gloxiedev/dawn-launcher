import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import type { JavaRuntime, LauncherSettings } from '@/types/launcher';

const execFileAsync = promisify(execFile);

export class JavaService {
  async scan(settings: LauncherSettings): Promise<JavaRuntime[]> {
    const candidates = new Set<string>();

    if (settings.javaPath) {
      candidates.add(settings.javaPath);
    }

    if (process.env.JAVA_HOME) {
      candidates.add(join(process.env.JAVA_HOME, 'bin', this.executableName));
    }

    for (const part of (process.env.PATH || '').split(delimiter)) {
      if (part) {
        candidates.add(join(part, this.executableName));
      }
    }

    for (const base of this.commonJavaRoots()) {
      await this.collectJavaFromRoot(base, candidates);
    }

    const runtimes = await Promise.all([...candidates].map((path) => this.inspect(path)));
    return runtimes
      .filter((runtime): runtime is JavaRuntime => Boolean(runtime?.valid))
      .sort((a, b) => b.major - a.major || a.path.localeCompare(b.path));
  }

  async pick(settings: LauncherSettings, gameVersion: string, requiredMajor = this.requiredMajor(gameVersion)): Promise<JavaRuntime> {
    const runtimes = await this.scan(settings);
    const exact = runtimes.find((runtime) => runtime.major === requiredMajor);
    const newer = runtimes
      .filter((runtime) => runtime.major > requiredMajor)
      .sort((a, b) => a.major - b.major || a.path.localeCompare(b.path))[0];

    if (exact || newer) {
      return exact ?? newer!;
    }

    throw new Error(`Java ${requiredMajor}+ is required for Minecraft ${gameVersion}. Install Java or set a Java path in Settings.`);
  }

  requiredMajor(gameVersion: string): number {
    const [major, minor, patch] = gameVersion.split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0);
    if (major > 1 || (major === 1 && (minor >= 21 || (minor === 20 && patch >= 5)))) {
      return 21;
    }
    if (major === 1 && minor >= 18) {
      return 17;
    }
    if (major === 1 && minor === 17) {
      return 16;
    }
    return 8;
  }

  async inspect(path: string): Promise<JavaRuntime | undefined> {
    if (!existsSync(path)) {
      return undefined;
    }

    try {
      const { stdout, stderr } = await execFileAsync(path, ['-version'], { timeout: 5000 });
      const output = `${stdout}\n${stderr}`;
      const version = output.match(/version\s+"([^"]+)"/)?.[1] ?? output.match(/openjdk\s+([^"\s]+)/)?.[1] ?? 'unknown';
      const major = this.parseMajor(version);
      return {
        path,
        version,
        major,
        vendor: output.toLowerCase().includes('temurin') ? 'Eclipse Temurin' : undefined,
        arch: process.arch,
        valid: major > 0
      };
    } catch {
      return undefined;
    }
  }

  private parseMajor(version: string): number {
    if (version.startsWith('1.')) {
      return Number(version.split('.')[1]) || 0;
    }
    return Number(version.split('.')[0]) || 0;
  }

  private get executableName(): string {
    return process.platform === 'win32' ? 'java.exe' : 'java';
  }

  private commonJavaRoots(): string[] {
    if (process.platform === 'win32') {
      return [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Microsoft',
        'C:\\Program Files\\Zulu'
      ];
    }

    if (process.platform === 'darwin') {
      return ['/Library/Java/JavaVirtualMachines'];
    }

    return ['/usr/lib/jvm', '/usr/java'];
  }

  private async collectJavaFromRoot(root: string, candidates: Set<string>): Promise<void> {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        candidates.add(join(root, entry.name, 'bin', this.executableName));
        candidates.add(join(root, entry.name, 'Contents', 'Home', 'bin', this.executableName));
      }
    } catch {
      // Common runtime directories may not exist on every machine.
    }
  }
}
