import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it } from 'vitest';
import { cpredPharmaOfEntryId } from '@vtt/shared';
import { loadCompendium } from './compendium.js';

/**
 * #5 (26.09.2026): próbka z repo i kompendium z podręcznika nie stoją obok
 * siebie. Prywatny katalog z danymi zastępuje próbkę w całości, a świeży klon
 * bez niego dalej wstaje na próbce.
 */

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const warnings: string[] = [];
const silent = {
  warn: (_context: unknown, message: string) => warnings.push(message),
  info: () => {},
} as unknown as FastifyBaseLogger;
const onSample = () => warnings.filter((message) => message.includes('running on the repo sample'));

interface SampleFile {
  entries: { id: string; kind?: string }[];
}

function sample(): SampleFile {
  return JSON.parse(
    readFileSync(join(PUBLIC_DIR, 'cpred', 'compendium', 'sample.json'), 'utf8'),
  ) as SampleFile;
}

function privateDirWith(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'vtt-private-'));
  const dir = join(root, 'cpred', 'compendium');
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

describe('loadCompendium', () => {
  it('runs on the sample when there is no private data — and says so (Z1)', async () => {
    warnings.length = 0;
    const registry = await loadCompendium(PUBLIC_DIR, join(tmpdir(), 'vtt-no-such-dir'), silent);
    expect(registry.entries.map((e) => e.id)).toEqual(
      expect.arrayContaining(sample().entries.map((e) => e.id)),
    );
    expect(onSample()).toHaveLength(1);
  });

  it('drops the whole sample once the private directory has data', async () => {
    const source = sample();
    const gear = source.entries.find((e) => e.id.startsWith('gear.'))!;
    const own = { ...gear, id: 'gear.wlasny-wpis', source: 'Dane grupy' };
    const privateDir = privateDirWith({
      'gear.json': { ...source, weaponTypes: [], entries: [own] },
      // Raport importera leży obok danych, ale danymi nie jest.
      'import-report.json': { entries: [] },
    });

    warnings.length = 0;
    const registry = await loadCompendium(PUBLIC_DIR, privateDir, silent);
    // Obok danych grupy stoją jeszcze farmaceutyki z `shared` (24.10).
    expect(registry.entries.map((e) => e.id).filter((id) => !cpredPharmaOfEntryId(id))).toEqual([
      'gear.wlasny-wpis',
    ]);
    expect(registry.entries.filter((e) => cpredPharmaOfEntryId(e.id))).toHaveLength(5);
    expect(onSample()).toEqual([]);
    expect(registry.weaponTypes).toEqual([]);
  });

  it('falls back to the sample when the private directory holds nothing readable', async () => {
    const privateDir = privateDirWith({ 'broken.json': '{ nie json', 'import-report.json': {} });
    const registry = await loadCompendium(PUBLIC_DIR, privateDir, silent);
    expect(registry.entries.length).toBeGreaterThan(0);
  });
});
