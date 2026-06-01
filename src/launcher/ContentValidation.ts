import AdmZip from 'adm-zip';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ContentKind } from '@/types/launcher';

const MOD_MARKERS = ['fabric.mod.json', 'quilt.mod.json', 'META-INF/mods.toml', 'META-INF/neoforge.mods.toml'];
const PACK_MARKER = 'pack.mcmeta';
const MODPACK_MARKER = 'modrinth.index.json';

export async function sniffContentKind(filePath: string): Promise<ContentKind | null> {
  const ext = extname(filePath).toLowerCase();
  if (!['.jar', '.zip', '.mrpack'].includes(ext)) {
    return null;
  }

  try {
    const zip = new AdmZip(filePath);
    const names = new Set(zip.getEntries().map((entry) => entry.entryName.replace(/\\/g, '/')));

    if (names.has(MODPACK_MARKER) || [...names].some((name) => name.endsWith(MODPACK_MARKER))) {
      return 'modpack';
    }

    if (MOD_MARKERS.some((marker) => names.has(marker) || [...names].some((name) => name.endsWith(marker)))) {
      return 'mod';
    }

    if (names.has(PACK_MARKER) || [...names].some((name) => name.endsWith(PACK_MARKER))) {
      const entry = zip.getEntry(PACK_MARKER) ?? zip.getEntries().find((item) => item.entryName.endsWith(PACK_MARKER));
      if (entry) {
        try {
          const meta = JSON.parse(entry.getData().toString('utf8')) as { pack?: { description?: string } };
          const description = meta.pack?.description?.toLowerCase() ?? '';
          if (description.includes('shader')) {
            return 'shader';
          }
        } catch {
          // ignore malformed pack.mcmeta
        }
      }
      return 'resourcepack';
    }

    if (ext === '.jar') {
      return 'mod';
    }
  } catch {
    return null;
  }

  return null;
}

export async function validateArchive(filePath: string): Promise<void> {
  const buffer = await readFile(filePath);
  if (buffer.length < 4) {
    throw new Error(`File is too small to be a valid archive.`);
  }
  const signature = buffer.subarray(0, 4).toString('hex');
  if (signature !== '504b0304' && signature !== '504b0506') {
    throw new Error('File is not a valid ZIP/JAR archive.');
  }
}

export async function assertContentMatchesKind(filePath: string, kind: ContentKind): Promise<void> {
  const ext = extname(filePath).toLowerCase();
  const allowed: Record<ContentKind, string[]> = {
    mod: ['.jar'],
    modpack: ['.zip', '.mrpack'],
    resourcepack: ['.zip'],
    shader: ['.zip']
  };

  if (!allowed[kind].includes(ext)) {
    throw new Error(`Expected ${allowed[kind].join(' or ')} for ${kind}, got ${ext || 'unknown'}.`);
  }

  await validateArchive(filePath);

  const detected = await sniffContentKind(filePath);
  if (!detected) {
    return;
  }

  if (detected !== kind) {
    throw new Error(`This file looks like a ${detected}, not a ${kind}. Import it from the ${detected} menu instead.`);
  }
}
