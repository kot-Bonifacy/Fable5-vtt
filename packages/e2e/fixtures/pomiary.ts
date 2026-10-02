import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import { BACKUP_DIR, DATABASE_FILE, E2E_DIR, UPLOADS_DIR } from '../instance/paths.ts';
import { serverPid } from '../instance/instance.ts';

/**
 * Pomiary T7b i T7c (`testy.md` 6.3): liczby bez progów (decyzja MG z 02.10) —
 * linia bazowa refaktoryzacji. Każdy test dopisuje swoją sekcję do
 * `.e2e/pomiary/<plik>.json`; podsumowanie przepisuje się ręką do `testy.md`.
 */

const run = promisify(execFile);
export const MEASUREMENTS_DIR = join(E2E_DIR, 'pomiary');

export interface Spread {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

export function spread(values: readonly number[]): Spread {
  if (values.length === 0) return { n: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return {
    n: sorted.length,
    p50: Math.round(at(0.5)),
    p95: Math.round(at(0.95)),
    max: Math.round(sorted[sorted.length - 1]!),
  };
}

/** Dopisuje sekcję `key` do `.e2e/pomiary/<file>.json` (sekcje innych testów zostają). */
export function recordMeasurement(file: string, key: string, data: unknown): void {
  mkdirSync(MEASUREMENTS_DIR, { recursive: true });
  const path = join(MEASUREMENTS_DIR, `${file}.json`);
  const all = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)
    : {};
  all[key] = { at: new Date().toISOString(), ...(data as object) };
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`);
}

function treeBytes(dir: string): { files: number; bytes: number } {
  if (!existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = treeBytes(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

/** Plik bazy (z `-wal`/`-journal`, jeśli są), uploady i katalog kopii instancji E2E. */
export function storageSizes() {
  const extra = ['-wal', '-journal'].reduce(
    (sum, suffix) =>
      sum +
      (existsSync(`${DATABASE_FILE}${suffix}`) ? statSync(`${DATABASE_FILE}${suffix}`).size : 0),
    0,
  );
  return {
    dbBytes: statSync(DATABASE_FILE).size + extra,
    uploads: treeBytes(UPLOADS_DIR),
    backups: treeBytes(BACKUP_DIR),
  };
}

/**
 * Bajty na tabelę (z indeksami) z wirtualnej tabeli `dbstat` — strony 4 KB,
 * więc mała tabela waży co najmniej jedną stronę.
 */
export function tableBytes(): Record<string, number> {
  const db = new DatabaseSync(DATABASE_FILE, { readOnly: true, timeout: 5_000 });
  try {
    const indexOwner = new Map(
      (
        db.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'`).all() as {
          name: string;
          tbl_name: string;
        }[]
      ).map((row) => [row.name, row.tbl_name]),
    );
    const result: Record<string, number> = {};
    for (const row of db
      .prepare('SELECT name, sum(pgsize) AS bytes FROM dbstat GROUP BY name')
      .all() as { name: string; bytes: number }[]) {
      const table = indexOwner.get(row.name) ?? row.name;
      result[table] = (result[table] ?? 0) + row.bytes;
    }
    return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1]));
  } finally {
    db.close();
  }
}

/** Pamięć robocza (KB) i czas procesora (s) serwera instancji — `Get-Process`. */
export async function serverProcess(): Promise<{
  workingSetMb: number;
  cpuSeconds: number;
} | null> {
  const pid = serverPid();
  if (!pid) return null;
  try {
    const { stdout } = await run(
      'powershell',
      ['-NoProfile', '-Command', `$p = Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.CPU)"`],
      { windowsHide: true },
    );
    const [bytes, cpu] = stdout.trim().split(/\s+/);
    return {
      workingSetMb: Math.round(Number(bytes) / 1024 / 1024),
      cpuSeconds: Math.round(Number((cpu ?? '0').replace(',', '.')) * 10) / 10,
    };
  } catch {
    return null;
  }
}

/**
 * Licznik klatek w karcie (`requestAnimationFrame`): odstępy między klatkami
 * w oknie pomiaru. Działa tak samo w Chromium i Firefoksie (`longtask` jest
 * tylko w Chromium). Aktor ma własne okno na wierzchu, więc `rAF` nie dławi się.
 */
export async function startFrameMeter(page: Page, key: string): Promise<void> {
  await page.evaluate((name) => {
    const meters = ((window as unknown as { __t7Frames?: Record<string, unknown> }).__t7Frames ??=
      {});
    const state = { gaps: [] as number[], last: performance.now(), on: true };
    meters[name] = state;
    const tick = (now: number) => {
      if (!state.on) return;
      state.gaps.push(now - state.last);
      state.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, key);
}

export interface FrameStats extends Spread {
  /** Klatki dłuższe niż 50 ms i 100 ms — „zacięcie” widoczne gołym okiem. */
  over50: number;
  over100: number;
  fps: number;
}

export async function stopFrameMeter(page: Page, key: string): Promise<FrameStats> {
  const gaps = await page.evaluate((name) => {
    const meters = (
      window as unknown as { __t7Frames?: Record<string, { gaps: number[]; on: boolean }> }
    ).__t7Frames;
    const state = meters?.[name];
    if (!state) return [];
    state.on = false;
    return state.gaps.slice(1);
  }, key);
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  return {
    ...spread(gaps),
    over50: gaps.filter((gap) => gap > 50).length,
    over100: gaps.filter((gap) => gap > 100).length,
    fps: total > 0 ? Math.round((gaps.length / total) * 1000) : 0,
  };
}

export interface Arrival {
  id: number;
  kind: string;
  text: string;
  createdAt: string;
  /** `Date.now()` w karcie, gdy wiersz pierwszy raz stanął w magazynie czatu. */
  at: number;
}

/**
 * Zapis przyjścia każdego nowego wiersza czatu do magazynu karty (subskrypcja
 * magazynu `chat` przez hak E2E). Zegar karty i procesu testów to ten sam zegar
 * systemu, więc `at` porównuje się z chwilą wysłania w teście i z `createdAt`.
 */
export async function startChatArrivals(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Item = {
      type: string;
      message?: { id: number; kind: string; text: string; createdAt: string };
    };
    const store = window.__vttE2E?.stores.chat as unknown as {
      getState(): { items: Item[] };
      subscribe(listener: (state: { items: Item[] }) => void): () => void;
    };
    const holder = window as unknown as { __t7Arrivals?: unknown[]; __t7Unsub?: () => void };
    holder.__t7Unsub?.();
    const seen = new Set<number>();
    for (const item of store.getState().items) if (item.message) seen.add(item.message.id);
    const arrivals: unknown[] = [];
    holder.__t7Arrivals = arrivals;
    holder.__t7Unsub = store.subscribe((state) => {
      const now = Date.now();
      for (let i = state.items.length - 1; i >= 0; i -= 1) {
        const message = state.items[i]!.message;
        if (!message || seen.has(message.id)) continue;
        seen.add(message.id);
        arrivals.push({
          id: message.id,
          kind: message.kind,
          text: message.text.slice(0, 80),
          createdAt: message.createdAt,
          at: now,
        });
      }
    });
  });
}

export async function readChatArrivals(page: Page): Promise<Arrival[]> {
  return page.evaluate(
    () => ((window as unknown as { __t7Arrivals?: unknown[] }).__t7Arrivals ?? []) as Arrival[],
  );
}
