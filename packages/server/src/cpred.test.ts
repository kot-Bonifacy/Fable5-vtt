import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { loadCpredRegistry } from './cpred.js';

/**
 * The skill and role files load from two directories (stage 13): the committed
 * samples in `data/public` and the rulebook import in `data/private`, which is
 * gitignored. These tests cover the three states that matter — no private data
 * (a fresh clone), private data present, and a private file that is broken.
 */

const warnings: unknown[] = [];
const log = {
  warn: (...args: unknown[]) => warnings.push(args),
  info: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
} as unknown as FastifyBaseLogger;

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const MISSING_PRIVATE = resolve(import.meta.dirname, 'fixtures/no-private-data');

function privateDirWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'vtt-cpred-'));
  mkdirSync(join(root, 'cpred'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, 'cpred', name), body, 'utf8');
  }
  return root;
}

describe('loadCpredRegistry', () => {
  it('falls back to the public samples when there is no private data', async () => {
    const registry = await loadCpredRegistry(PUBLIC_DIR, MISSING_PRIVATE, log);
    expect(registry.skills.length).toBeGreaterThan(0);
    expect(registry.roles).toHaveLength(10);
    // Every sample skill declares a rulebook category, so the sheet can group
    // them even without the private import.
    expect(registry.skills.every((skill) => skill.group !== undefined)).toBe(true);
  });

  it('replaces the public list with the private one instead of merging', async () => {
    const dir = privateDirWith({
      'skills.json': JSON.stringify({
        skills: [{ id: 'archery', name: 'Łucznictwo', stat: 'ref', group: 'ranged' }],
      }),
    });
    const registry = await loadCpredRegistry(PUBLIC_DIR, dir, log);
    expect(registry.skills.map((skill) => skill.id)).toEqual(['archery']);
    // Roles have no private file here, so they still come from data/public.
    expect(registry.roles).toHaveLength(10);
  });

  it('drops a category the code does not know instead of inventing a group', async () => {
    const dir = privateDirWith({
      'skills.json': JSON.stringify({
        skills: [{ id: 'archery', name: 'Łucznictwo', stat: 'ref', group: 'wymyslona' }],
      }),
    });
    const registry = await loadCpredRegistry(PUBLIC_DIR, dir, log);
    expect(registry.skills[0]?.group).toBeUndefined();
  });

  it('keeps the public data when the private file is malformed', async () => {
    warnings.length = 0;
    const dir = privateDirWith({ 'skills.json': '{ this is not json' });
    const registry = await loadCpredRegistry(PUBLIC_DIR, dir, log);
    expect(registry.skills.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
