import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CPRED_VEHICLE_CLASSES } from '@vtt/shared';

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

  it('ships car models that name a class, never a catalogue entry (etap 67)', () => {
    // Models are our own: name, the GM's art, seats and price. Their numbers
    // come from a class looked up in code (`CPRED_VEHICLE_CLASS_IDS`), so the
    // public file must not point at a rulebook entry by id or copy its stats.
    const file = join(REPO_ROOT, 'data', 'public', 'cpred', 'vehicle-models.json');
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      models?: Record<string, unknown>[];
    };
    for (const model of parsed.models ?? []) {
      expect(CPRED_VEHICLE_CLASSES).toContain(model.class);
      for (const field of ['classIds', 'classId', 'hp', 'move', 'speedKmh', 'vehicleKind']) {
        expect(model).not.toHaveProperty(field);
      }
    }
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

  describe('no rulebook sentences in committed code (stage 71g2, G37)', () => {
    // Only runs where the GM's private copy of the rulebook sits on disk —
    // the public checkout has nothing to compare against, and that is fine:
    // the guard exists for the machine the text is edited on.
    const manualDir = join(REPO_ROOT, 'data', 'private', 'rulebook', 'manual', 'CPRED-podrecznik');
    const faq = join(REPO_ROOT, 'data', 'private', 'rulebook', 'text', 'CPRED-FAQ_1.txt');
    /** Files whose prose has been paraphrased; the follow-up adds the rest. */
    const guarded = ['packages/shared/src/systems/cpred/roleability.ts'];
    /** Shortest shared run of words that counts as a quotation. */
    const RUN = 6;
    /**
     * Shared runs that are lists of names — Skills, implants, gear — and so
     * the vocabulary of the game rather than its text. Normalised: lower case,
     * punctuation dropped, single spaces.
     */
    const NAME_LISTS = new Set([
      'bardzo ciężki pistolet karabin szturmowy granatnik',
      'aktorstwo atrakcyjność dedukcja fałszerstwo kryminologia kryptografia księgowość ' +
        'odporność na tortury narkotyki percepcja przesłuchiwanie ratownictwo medyczne ' +
        'skradanie się tropienie ukrycie znalezienie przedmiotu wykształcenie',
      'ulepszone przeciwciała pancerz podskórny ob 11 zestaw cyberaudio agent wewnętrzny ' +
        'odbiornik lokalizatora',
      'zwykła amunicja do b c pistoletu',
      'radar sonar zestaw cyberaudio agent wewnętrzny odbiornik lokalizatora wykrywacz radaru',
      'sprzęg neuralny gniazdo czipów edytor bólu gniazda interfejsu cyberoczy z wirtualem',
      'dłoń z narzędziami zestaw cyberaudio agent wewnętrzny wykrywacz podsłuchu ' +
        'rejestrator dźwięku',
    ]);

    const words = (text: string): string[] =>
      text
        .replace(/-\s*\n\s*/g, '')
        .toLowerCase()
        .match(/[0-9a-ząćęłńóśźż]+/g) ?? [];

    it.skipIf(!existsSync(manualDir))('paraphrases every rule it states', () => {
      const book = readdirSync(manualDir)
        .filter((name) => name.endsWith('.md'))
        .map((name) => readFileSync(join(manualDir, name), 'utf8'));
      if (existsSync(faq)) book.push(readFileSync(faq, 'utf8'));
      const grams = new Set<string>();
      for (const page of book) {
        const list = words(page);
        for (let i = 0; i + RUN <= list.length; i += 1) grams.add(list.slice(i, i + RUN).join(' '));
      }
      const quoted: string[] = [];
      for (const path of guarded) {
        const list = words(readFileSync(join(REPO_ROOT, path), 'utf8'));
        const hit = list.map(() => false);
        for (let i = 0; i + RUN <= list.length; i += 1) {
          if (grams.has(list.slice(i, i + RUN).join(' '))) hit.fill(true, i, i + RUN);
        }
        for (let i = 0; i < list.length; i += 1) {
          if (!hit[i]) continue;
          let end = i;
          while (end < list.length && hit[end]) end += 1;
          const run = list.slice(i, end).join(' ');
          if (!NAME_LISTS.has(run)) quoted.push(`${path}: ${run}`);
          i = end;
        }
      }
      expect(quoted).toEqual([]);
    });
  });

  it('never commits the importer output alongside the scripts', () => {
    const tracked = wouldBeCommitted('tools/import');
    expect(tracked.length).toBeGreaterThan(0);
    for (const file of tracked) {
      expect(file.endsWith('.json')).toBe(false);
    }
  });
});
