import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const releaseDir = join(process.cwd(), 'release');

const keepPatterns = [/latest.*\.yml$/i];

async function cleanRelease() {
  if (!existsSync(releaseDir)) {
    console.log('release/ does not exist — nothing to clean.');
    return;
  }

  const { readdir, stat } = await import('node:fs/promises');
  const entries = await readdir(releaseDir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(releaseDir, entry.name);
    if (keepPatterns.some((pattern) => pattern.test(entry.name))) {
      continue;
    }

    const info = await stat(path).catch(() => undefined);
    if (!info) {
      continue;
    }

    await rm(path, { recursive: true, force: true });
    console.log(`removed ${path}`);
  }

  console.log('release/ cleaned for a fresh packaging run.');
}

await cleanRelease();
