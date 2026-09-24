import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Licence guard (stage 13).
 *
 * The GitHub repository is public and the rulebook is copyrighted: schemas and
 * parsers may be committed, content may not. These tests fail the build if
 * rulebook-derived data ever becomes tracked by git, or if a file that *is*
 * committed starts to look like imported content.
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

/**
 * Everything that would end up in the repository: tracked files plus untracked
 * ones git does not ignore. Checking only tracked files would let a brand-new
 * content file pass the guard until the moment it is committed.
 */
function wouldBeCommitted(path: string): string[] {
  return git(['ls-files', '--cached', '--others', '--exclude-standard', path])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

describe('licence guard', () => {
  it('keeps data/private out of git', () => {
    expect(wouldBeCommitted('data/private')).toEqual([]);
    expect(wouldBeCommitted('uploads')).toEqual([]);
  });

  it('has data/private ignored by the working gitignore rules', () => {
    // check-ignore exits 1 when the path is NOT ignored, which throws here.
    const output = git([
      'check-ignore',
      '-v',
      'data/private/cpred/compendium/weapons.json',
      'data/private/rulebook/pdf/anything.pdf',
    ]);
    expect(output).toContain('data/private/');
  });

  it('ships only invented sample entries in data/public', () => {
    const dir = join(REPO_ROOT, 'data', 'public', 'cpred', 'compendium');
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
      const file = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
        source?: string;
        entries?: { name: string; source?: string }[];
      };
      // The whole point of the public file: it declares itself as made up.
      expect(file.source ?? '').toMatch(/przykładowe|wymyślone/i);
      for (const entry of file.entries ?? []) {
        expect(entry.source ?? file.source ?? '').toMatch(/przykładowe|wymyślone/i);
      }
    }
  });

  it('ships only invented availability assignments in data/public (naprawa 3b)', () => {
    // The ids of the real catalogue are its inventory; the committed file names
    // the invented sample entries and says so, and data/private wins over it.
    const file = join(REPO_ROOT, 'data', 'public', 'cpred', 'shop-tiers.json');
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      source?: string;
      tiers?: Record<string, number>;
      roleTools?: Record<string, { entries?: string[] }>;
    };
    expect(parsed.source ?? '').toMatch(/przykładowe|wymyślone/i);
    const sample = JSON.parse(
      readFileSync(join(REPO_ROOT, 'data', 'public', 'cpred', 'compendium', 'sample.json'), 'utf8'),
    ) as { entries: { id: string }[] };
    const invented = new Set(sample.entries.map((entry) => entry.id));
    const named = [
      ...Object.keys(parsed.tiers ?? {}),
      ...Object.values(parsed.roleTools ?? {}).flatMap((tools) => tools.entries ?? []),
    ];
    for (const id of named) expect(invented).toContain(id);
  });

  it('ships only invented weapon pictures in data/public (24.09.2026)', () => {
    // Same bargain as shop-tiers.json: the real catalogue's ids stay private.
    const file = join(REPO_ROOT, 'data', 'public', 'cpred', 'weapon-icons.json');
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      source?: string;
      icons?: Record<string, string>;
    };
    expect(parsed.source ?? '').toMatch(/przykładowe|wymyślone/i);
    const sample = JSON.parse(
      readFileSync(join(REPO_ROOT, 'data', 'public', 'cpred', 'compendium', 'sample.json'), 'utf8'),
    ) as { entries: { id: string }[] };
    const invented = new Set(sample.entries.map((entry) => entry.id));
    for (const id of Object.keys(parsed.icons ?? {})) expect(invented).toContain(id);
  });

  it('ships only invented cover material values in data/public (stage 16c)', () => {
    // The material × thickness table is rulebook content (s. 180), so the
    // committed file carries the right *shape* with made-up numbers and the
    // group's real table lives in data/private, which replaces it whole.
    const file = join(REPO_ROOT, 'data', 'public', 'cpred', 'covers.json');
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { source?: string };
    expect(parsed.source ?? '').toMatch(/przykładowe|wymyślone/i);
  });

  it('never commits the importer output alongside the scripts', () => {
    const tracked = wouldBeCommitted('tools/import');
    expect(tracked.length).toBeGreaterThan(0);
    for (const file of tracked) {
      expect(file.endsWith('.json')).toBe(false);
    }
  });
});
