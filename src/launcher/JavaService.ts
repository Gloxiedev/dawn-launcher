import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import type { JavaRuntime, LauncherSettings } from '@/types/launcher';
import { JavaInstallService } from './JavaInstallService';
import { LauncherPaths } from './LauncherPaths';
import type { Logger } from './Logger';

const execFileAsync = promisify(execFile);

export class JavaService {
  private readonly installer: JavaInstallService;

  constructor(
    private readonly paths: LauncherPaths,
    private readonly logger?: Logger
  ) {
    this.installer = new JavaInstallService(paths, logger);
  }

  async scan(settings: LauncherSettings): Promise<JavaRuntime[]> {
    const candidates = new Set<string>();

    if (settings.javaPath) {
      candidates.add(settings.javaPath);
    }

    const managed = await this.collectManagedRuntimes(settings);
    for (const path of managed) {
      candidates.add(path);
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
    const managedExact = await this.inspectManaged(settings, requiredMajor);
    if (managedExact) {
      return managedExact;
    }

    const runtimes = await this.scan(settings);
    const exact = runtimes.find((runtime) => runtime.major === requiredMajor);
    if (exact) {
      return exact;
    }

    await this.logger?.info('java', `Installing Java ${requiredMajor} for Minecraft ${gameVersion}`);
    try {
      const installedPath = await this.installer.ensureInstalled(settings, requiredMajor);
      const installed = await this.inspect(installedPath);
      if (installed?.valid && installed.major === requiredMajor) {
        return installed;
      }
    } catch (error) {
      await this.logger?.warn('java', 'Managed Java install failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const afterInstall = await this.inspectManaged(settings, requiredMajor);
    if (afterInstall) {
      return afterInstall;
    }

    throw new Error(
      `Java ${requiredMajor} is required for Minecraft ${gameVersion}. Install it in Settings → Java Runtimes (found Java ${runtimes[0]?.major ?? 'none'}).`
    );
  }

  private async inspectManaged(settings: LauncherSettings, major: number): Promise<JavaRuntime | undefined> {
    const root = join(this.paths.runtimeRoot(settings), `java-${major}`);
    const executable = process.platform === 'win32' ? 'java.exe' : 'java';
    const candidates = new Set<string>();
    await this.collectJavaFromRoot(root, candidates);
    for (const path of candidates) {
      const runtime = await this.inspect(path);
      if (runtime?.valid && runtime.major === major) {
        return runtime;
      }
    }
    return undefined;
  }

  /** Resolve Java major from a Minecraft version id (e.g. 1.21.4, 1.21.4-forge). */
  requiredMajorForVersion(versionId: string): number {
    const snapshot = versionId.match(/^(\d+)\.(\d+)/);
    if (snapshot) {
      return this.requiredMajor(`${snapshot[1]}.${snapshot[2]}`);
    }
    return this.requiredMajor(versionId);
  }

  requiredMajor(gameVersion: string): number {
    const [major, minor, patch] = gameVersion.split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0);
    if (major > 1 || (major === 1 && (minor > 20 || (minor === 20 && patch >= 5)))) {
      return 21;
    }
    if (major === 1 && minor >= 18) {
      return 17;
    }
    if (major === 1 && minor === 17) {
      return 16;
    }
    if (major === 1 && minor <= 16) {
      return 8;
    }
    return 21;
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

  private async collectManagedRuntimes(settings: LauncherSettings): Promise<string[]> {
    const candidates = new Set<string>();
    for (const major of [8, 17, 21, 25]) {
      const root = join(this.paths.runtimeRoot(settings), `java-${major}`);
      await this.collectJavaFromRoot(root, candidates);
    }
    return [...candidates];
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
          if (entry.isFile() && entry.name === this.executableName) {
            candidates.add(join(root, entry.name));
          }
          continue;
        }
        candidates.add(join(root, entry.name, 'bin', this.executableName));
        candidates.add(join(root, entry.name, 'Contents', 'Home', 'bin', this.executableName));
        await this.collectJavaFromRoot(join(root, entry.name), candidates);
      }
    } catch {
      // Common runtime directories may not exist on every machine.
    }
  }
}
