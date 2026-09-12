/**
 * Import tabel losowych z plików JSON do kampanii (etap 34).
 *
 * Krok czwarty pipeline'u tabel: `parse-encounters.py` produkuje JSON,
 * ten skrypt wkłada go do bazy. Rozdzielenie jest celowe — parser dotyka
 * podręcznika i mieszka poza aplikacją, importer dotyka bazy i przechodzi przez
 * **tę samą** walidację, co edytor MG (`validateRandomTable` z `@vtt/shared`),
 * więc plik z dziurą w zakresach odbija się tutaj, a nie u MG przy stole.
 *
 * Nazwa jest tożsamością: tabela o tej nazwie w tej kampanii zostaje
 * **nadpisana** (razem z wierszami), nie zdublowana — powtórzony import po
 * poprawce w JSON-ie ma dać jedną tabelę, a nie dwie. Podrzuty (`subTable`
 * w pliku, po nazwie) rozstrzygają się po wgraniu wszystkich plików, bo tabela
 * może wskazywać na tę, która przyjdzie w następnym pliku.
 *
 *   pnpm --filter @vtt/server exec tsx ../../tools/import/import-tables.ts \
 *     --campaign "Poligon bojowy" [--dir data/private/cpred/tables] [--dry-run]
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Relative imports on purpose: this script sits outside the workspace packages,
// so neither `@vtt/shared` nor `@vtt/server` aliases resolve from here.
import {
  randomTableNestingIssue,
  validateRandomTable,
  type RandomTableVisibility,
} from '../../packages/shared/src/index.js';
import { createPrisma } from '../../packages/server/src/db.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface FileRow {
  min: number;
  max: number;
  text?: string;
  /** Podrzut podany **nazwą** — plik nie zna identyfikatorów bazy. */
  subTable?: string;
}

interface FileTable {
  name: string;
  formula: string;
  description?: string;
  visibility?: RandomTableVisibility;
  rows: FileRow[];
}

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

async function readTables(dir: string): Promise<{ path: string; table: FileTable }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files: { path: string; table: FileTable }[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue;
    const path = join(dir, name);
    files.push({ path, table: JSON.parse(await readFile(path, 'utf8')) as FileTable });
  }
  return files;
}

async function main(): Promise<number> {
  const dir = join(REPO_ROOT, arg('dir', 'data/private/cpred/tables')!);
  const campaignName = arg('campaign');
  const dryRun = process.argv.includes('--dry-run');
  const databaseUrl = process.env['DATABASE_URL'] ?? 'file:./dev.db';

  const files = await readTables(dir);
  if (files.length === 0) {
    console.error(`Brak plików JSON w ${dir}`);
    return 1;
  }

  // Walidacja idzie **przed** bazą: nieudany import ma nie zostawić połowy
  // tabel w kampanii, którą ktoś właśnie prowadzi.
  const valid: { path: string; table: FileTable; subs: (string | null)[] }[] = [];
  let broken = 0;
  for (const { path, table } of files) {
    const subs = table.rows.map((row) => row.subTable ?? null);
    const result = validateRandomTable({
      name: table.name,
      formula: table.formula,
      description: table.description ?? '',
      visibility: table.visibility ?? 'gm',
      // Podrzuty na tym etapie udajemy obecnością, żeby wiersz „samo odesłanie"
      // nie wyglądał na pusty; prawdziwe id wchodzą po wgraniu wszystkich tabel.
      rows: table.rows.map((row, index) => ({
        min: row.min,
        max: row.max,
        text: row.text ?? '',
        subTableId: subs[index] ? 'placeholder' : null,
      })),
    });
    if (!result.ok) {
      broken += 1;
      console.error(`✗ ${path}`);
      for (const issue of result.issues) console.error(`    ${issue.message}`);
      continue;
    }
    valid.push({ path, table, subs });
  }
  if (broken > 0) {
    console.error(`\n${broken} plik(ów) nie przeszło walidacji — nic nie zapisano.`);
    return 1;
  }

  if (dryRun) {
    for (const { path, table } of valid) {
      console.log(`✓ ${path}: „${table.name}" (${table.formula}, ${table.rows.length} wierszy)`);
    }
    console.log('\n--dry-run: nic nie zapisano.');
    return 0;
  }

  if (!campaignName) {
    console.error('Podaj kampanię: --campaign "<nazwa albo id>"');
    return 1;
  }

  const prisma = createPrisma(databaseUrl);
  try {
    const campaign =
      (await prisma.campaign.findUnique({ where: { id: campaignName } })) ??
      (await prisma.campaign.findFirst({ where: { name: campaignName } }));
    if (!campaign) {
      console.error(`Nie ma kampanii „${campaignName}" w ${databaseUrl}.`);
      return 1;
    }

    const byName = new Map<string, string>();
    for (const row of await prisma.randomTable.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, name: true },
    })) {
      byName.set(row.name.toLowerCase(), row.id);
    }

    // Przebieg pierwszy: same tabele i wiersze, bez podrzutów.
    for (const { table } of valid) {
      const existing = byName.get(table.name.toLowerCase());
      const data = {
        name: table.name,
        formula: table.formula,
        description: table.description ?? '',
        visibility: table.visibility ?? 'gm',
      };
      const saved = existing
        ? await prisma.randomTable.update({ where: { id: existing }, data })
        : await prisma.randomTable.create({ data: { campaignId: campaign.id, ...data } });
      byName.set(saved.name.toLowerCase(), saved.id);
      await prisma.randomTableRow.deleteMany({ where: { tableId: saved.id } });
      await prisma.randomTableRow.createMany({
        data: table.rows.map((row, index) => ({
          tableId: saved.id,
          min: row.min,
          max: row.max,
          text: row.text ?? '',
          position: index,
        })),
      });
      console.log(`✓ „${saved.name}" — ${table.rows.length} wierszy`);
    }

    // Przebieg drugi: podrzuty po nazwach, kiedy wszystkie tabele już są.
    let links = 0;
    let missing = 0;
    for (const { table } of valid) {
      const tableId = byName.get(table.name.toLowerCase());
      if (!tableId) continue;
      const rows = await prisma.randomTableRow.findMany({
        where: { tableId },
        orderBy: { position: 'asc' },
      });
      for (const [index, row] of table.rows.entries()) {
        if (!row.subTable) continue;
        const subId = byName.get(row.subTable.toLowerCase());
        if (!subId) {
          console.error(`  ! „${table.name}" ${row.min}–${row.max}: brak tabeli „${row.subTable}"`);
          missing += 1;
          continue;
        }
        const stored = rows[index];
        if (!stored) continue;
        await prisma.randomTableRow.update({
          where: { id: stored.id },
          data: { subTableId: subId },
        });
        links += 1;
      }
    }
    if (links > 0) console.log(`✓ podrzuty: ${links}`);

    // Graf sprawdzamy na końcu i **tylko wypisujemy**: baza jest już zapisana,
    // a cykl albo zbyt głęboki łańcuch odbije się dopiero przy pierwszej edycji
    // w panelu. Lepiej powiedzieć o tym teraz niż zostawić minę.
    const all = await prisma.randomTable.findMany({
      where: { campaignId: campaign.id },
      include: { rows: { select: { subTableId: true } } },
    });
    const nesting = randomTableNestingIssue(
      all.map((entry) => ({
        id: entry.id,
        name: entry.name,
        subIds: entry.rows
          .map((row) => row.subTableId)
          .filter((value): value is string => value !== null),
      })),
    );
    if (nesting) console.error(`! ${nesting}`);
    return missing > 0 || nesting ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
