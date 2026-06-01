import AdmZip from 'adm-zip';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Instance } from '@/types/launcher';

export interface LaunchValidationIssue {
  level: 'error' | 'warn';
  message: string;
}

export async function validateInstanceBeforeLaunch(instance: Instance): Promise<LaunchValidationIssue[]> {
  const issues: LaunchValidationIssue[] = [];
  const modsDir = join(instance.gameDir, 'mods');

  let entries: string[] = [];
  try {
    entries = await readdir(modsDir);
  } catch {
    return issues;
  }

  for (const name of entries) {
    if (!name.endsWith('.jar') || name.endsWith('.disabled')) {
      continue;
    }

    const path = join(modsDir, name);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile()) {
      continue;
    }

    if (info.size < 64) {
      issues.push({ level: 'error', message: `Mod "${name}" is empty or corrupt.` });
      continue;
    }

    try {
      const zip = new AdmZip(path);
      const hasModMeta =
        zip.getEntry('fabric.mod.json') ||
        zip.getEntry('quilt.mod.json') ||
        zip.getEntry('META-INF/mods.toml') ||
        zip.getEntry('META-INF/neoforge.mods.toml');
      if (!hasModMeta) {
        issues.push({
          level: 'warn',
          message: `Mod "${name}" has no loader metadata (fabric.mod.json / mods.toml). It may crash the game.`
        });
      }
    } catch {
      issues.push({ level: 'error', message: `Mod "${name}" is not a valid JAR archive.` });
    }
  }

  if (instance.loader === 'vanilla' && entries.some((name) => name.endsWith('.jar') && !name.endsWith('.disabled'))) {
    issues.push({
      level: 'error',
      message: 'This instance uses the vanilla loader but has mods installed. Install Fabric, Forge, NeoForge, or Quilt first.'
    });
  }

  return issues;
}
