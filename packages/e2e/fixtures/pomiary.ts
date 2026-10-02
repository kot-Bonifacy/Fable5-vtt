import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import {
  BACKUP_DIR,
  DATABASE_FILE,
  E2E_DIR,
  SERVER_INSPECT_PORT,
  UPLOADS_DIR,
} from '../instance/paths.ts';
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

// --- T7c: pamięć klienta i serwera ------------------------------------------------

const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;

/** Jedno polecenie CDP przez gniazdo inspektora i odpowiedź z tym samym `id`. */
async function cdp<T>(socket: WebSocket, id: number, method: string, params = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP ${method}: timeout`)), 60_000);
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: T;
        error?: { message: string };
      };
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(`CDP ${method}: ${message.error.message}`));
      else resolve(message.result as T);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

export interface ServerHeap {
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

/**
 * Sterta serwera po wymuszonym GC — przez inspektor Node (`startInstance(…, { inspect: true })`).
 * Odróżnia wyciek od leniwego odśmiecania, czego pamięć procesu z systemu nie umie (T7b).
 */
export async function serverHeap(): Promise<ServerHeap> {
  const list = (await (
    await fetch(`http://127.0.0.1:${SERVER_INSPECT_PORT}/json/list`)
  ).json()) as { webSocketDebuggerUrl: string }[];
  const socket = new WebSocket(list[0]!.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP: no inspector')), { once: true });
  });
  try {
    await cdp(socket, 1, 'HeapProfiler.collectGarbage');
    await cdp(socket, 2, 'HeapProfiler.collectGarbage');
    const evaluated = await cdp<{ result: { value: string } }>(socket, 3, 'Runtime.evaluate', {
      expression: 'JSON.stringify(process.memoryUsage())',
      returnByValue: true,
    });
    const usage = JSON.parse(evaluated.result.value) as NodeJS.MemoryUsage;
    return {
      heapUsedMb: mb(usage.heapUsed),
      heapTotalMb: mb(usage.heapTotal),
      rssMb: mb(usage.rss),
      externalMb: mb(usage.external),
      arrayBuffersMb: mb(usage.arrayBuffers),
    };
  } finally {
    socket.close();
  }
}

export interface ClientMemory {
  /** Sterta JS po wymuszonym GC — tylko Chromium (CDP); w Firefoksie `null`. */
  heapMb: number | null;
  /**
   * Pamięć `ArrayBuffer` poza stertą (`backingStorageSize`) — `JSHeapUsedSize` jej
   * nie liczy, a tu siedzą bufory geometrii Pixi (#50, T7c). Tylko Chromium.
   */
  buffersMb: number | null;
  listeners: number | null;
  pixi: Record<string, number> | null;
  dice: Record<string, number> | null;
  dom: { nodes: number; canvases: number };
}

/**
 * Pamięć karty aktora: w Chromium sterta po GC i słuchacze zdarzeń z CDP, w obu
 * silnikach liczniki haka E2E (drzewo i tekstury Pixi, kości 3D, DOM — zgoda MG z 02.10).
 */
export async function clientMemory(
  page: Page,
  engine: 'chromium' | 'firefox',
): Promise<ClientMemory> {
  let heapMb: number | null = null;
  let buffersMb: number | null = null;
  let listeners: number | null = null;
  if (engine === 'chromium') {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('HeapProfiler.collectGarbage');
      await session.send('HeapProfiler.collectGarbage');
      await session.send('Performance.enable');
      const { metrics } = await session.send('Performance.getMetrics');
      const metric = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
      heapMb = mb(metric('JSHeapUsedSize'));
      buffersMb = mb((await session.send('Runtime.getHeapUsage')).backingStorageSize);
      listeners = metric('JSEventListeners');
    } finally {
      await session.detach().catch(() => undefined);
    }
  }
  const counts = await page.evaluate(() => window.__vttE2E!.counts());
  return { heapMb, buffersMb, listeners, ...counts };
}

/**
 * Nachylenie prostej najmniejszych kwadratów (przyrost na krok) — „rośnie liniowo”
 * z `testy.md` 6.3 to dodatnie nachylenie utrzymane od rozgrzewki do końca.
 */
export function slope(points: readonly { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

export interface MainThreadLoad {
  /** Odsetek czasu ściany, w którym wątek główny karty miał zadanie (`TaskDuration`). */
  busyPct: number;
  /** Z tego — sam JavaScript (`ScriptDuration`). */
  scriptPct: number;
}

/**
 * Zajętość wątku głównego w oknie pomiaru — tylko Chromium (CDP `Performance`).
 * Headless trzyma `rAF` na 60 Hz, więc same klatki nie pokażą zapasu mocnej karty
 * graficznej; zajętość pokazuje, ile z każdej klatki zjada aplikacja (T7c).
 */
export async function mainThreadLoad<T>(
  page: Page,
  body: () => Promise<T>,
): Promise<{ result: T; load: MainThreadLoad }> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Performance.enable');
    const read = async () => {
      const { metrics } = await session.send('Performance.getMetrics');
      const metric = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
      return {
        task: metric('TaskDuration'),
        script: metric('ScriptDuration'),
        at: performance.now(),
      };
    };
    const before = await read();
    const result = await body();
    const after = await read();
    const wall = (after.at - before.at) / 1000;
    const pct = (seconds: number) => Math.round((seconds / wall) * 1000) / 10;
    return {
      result,
      load: {
        busyPct: pct(after.task - before.task),
        scriptPct: pct(after.script - before.script),
      },
    };
  } finally {
    await session.detach().catch(() => undefined);
  }
}
