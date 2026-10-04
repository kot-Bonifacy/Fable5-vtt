import { createHash } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { DATABASE_FILE } from '../instance/paths.ts';

/**
 * Odczyt bazy E2E **wyłącznie do asercji** (`testy.md` 4.3). Zapis idzie przez
 * aplikację — UI albo gniazdo — tak jak u prawdziwego MG i gracza.
 */
function withDb<T>(read: (db: DatabaseSync) => T): T {
  // Serwer pisze w tym samym czasie — bez `timeout` odczyt trafia na „database is locked”.
  const db = new DatabaseSync(DATABASE_FILE, { readOnly: true, timeout: 5_000 });
  try {
    return read(db);
  } finally {
    db.close();
  }
}

export function query<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[] {
  return withDb((db) => db.prepare(sql).all(...params) as T[]);
}

export function queryOne<T = Record<string, unknown>>(
  sql: string,
  ...params: SQLInputValue[]
): T | undefined {
  return withDb((db) => db.prepare(sql).get(...params) as T | undefined);
}

/** Tabele aplikacji (bez tabel SQLite i dziennika migracji Prismy). */
export function tableNames(): string[] {
  return query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name`,
  ).map((row) => row.name);
}

export interface TableFingerprint {
  rows: number;
  hash: string;
}

/**
 * Odcisk stanu: liczba wierszy i skrót treści każdej tabeli. Wiersze są sortowane
 * po treści, nie po `rowid` — `VACUUM INTO` w kopii potrafi przenumerować `rowid`
 * tabel bez całkowitego klucza. Porównanie przed kopią i po odtworzeniu = 3.15.
 *
 * `Session` pomijana domyślnie: logowanie w trakcie testu dokłada wiersze,
 * które nie są stanem gry. Z tego samego powodu bez `User.lastSeenAt` (etap 44a):
 * każde połączenie gniazda je odświeża, także klient wracający sam po
 * odtworzeniu kopii, zanim test zdąży policzyć odcisk.
 */
const VOLATILE_COLUMNS: Record<string, readonly string[]> = { User: ['lastSeenAt'] };

export function stateFingerprint(
  skip: readonly string[] = ['Session'],
): Record<string, TableFingerprint> {
  return withDb((db) => {
    const result: Record<string, TableFingerprint> = {};
    const names = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name`,
      )
      .all() as { name: string }[];
    for (const { name } of names) {
      if (skip.includes(name)) continue;
      const rows = db.prepare(`SELECT * FROM "${name}"`).all();
      const volatile = VOLATILE_COLUMNS[name] ?? [];
      const lines = rows
        .map((row) => {
          const copy: Record<string, unknown> = { ...row };
          for (const column of volatile) delete copy[column];
          return JSON.stringify(copy);
        })
        .sort();
      result[name] = {
        rows: rows.length,
        hash: createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16),
      };
    }
    return result;
  });
}
