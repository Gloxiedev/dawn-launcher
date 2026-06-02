import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export type LogCategory = 'launch' | 'download' | 'java' | 'validation' | 'error' | 'repair' | 'system';

export interface LogEntry {
  time: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: LogCategory;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED_FILES = 5;

export class Logger {
  private readonly logDir: string;
  private readonly logFile: string;
  private debugMode = false;

  constructor(logDir: string) {
    this.logDir = logDir;
    this.logFile = join(logDir, 'dawn-launcher.log');
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  async init(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
  }

  async debug(category: LogCategory, message: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.debugMode) {
      return;
    }
    await this.write({ time: Date.now(), level: 'debug', category, message, meta });
  }

  async info(category: LogCategory, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write({ time: Date.now(), level: 'info', category, message, meta });
  }

  async warn(category: LogCategory, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write({ time: Date.now(), level: 'warn', category, message, meta });
  }

  async error(category: LogCategory, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write({ time: Date.now(), level: 'error', category, message, meta });
  }

  private async write(entry: LogEntry): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
    const line = `${new Date(entry.time).toISOString()} [${entry.level}] [${entry.category}] ${entry.message}${
      entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
    }\n`;
    await appendFile(this.logFile, line, 'utf8');
    await this.rotateIfNeeded().catch(() => undefined);
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const file = await stat(this.logFile);
      if (file.size < MAX_LOG_BYTES) {
        return;
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotated = join(this.logDir, `dawn-launcher.${stamp}.log`);
      const { rename } = await import('node:fs/promises');
      await rename(this.logFile, rotated);

      const files = (await readdir(this.logDir))
        .filter((name) => name.startsWith('dawn-launcher.') && name.endsWith('.log'))
        .sort()
        .reverse();

      for (const name of files.slice(MAX_ROTATED_FILES)) {
        await unlink(join(this.logDir, name)).catch(() => undefined);
      }
    } catch {
      // Rotation is best-effort.
    }
  }
}
