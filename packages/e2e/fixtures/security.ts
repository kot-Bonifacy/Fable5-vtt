import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { io, type Socket } from 'socket.io-client';
import { LOG_DIR, REPO_DIR, SERVER_DIR, SERVER_URL } from '../instance/paths.ts';
import { RATE_LIMIT_BACKOFF_MS, RATE_LIMIT_RETRIES, type Ack } from './socket.ts';

/**
 * Narzędzia T2 (`testy.md` 6.2): katalog zdarzeń gniazda, śmieciowe ładunki,
 * podgląd logu serwera i surowe gniazda z dowolnym ciasteczkiem.
 */

export interface RealtimeEventInfo {
  name: string;
  gmOnly: boolean;
}

let catalogue: RealtimeEventInfo[] | null = null;

/**
 * Wszystkie zdarzenia gniazda **z rejestru serwera** (`EVENTS` w `realtime/index.ts`),
 * nie z kopii w teście — nowe zdarzenie wchodzi do macierzy ról samo. Czytane ze
 * źródeł przez `tsx` (0,5 s); instancja biegnie z `dist/` zbudowanego z tych samych.
 */
export function realtimeEvents(): RealtimeEventInfo[] {
  if (catalogue) return catalogue;
  const script = `const { EVENTS } = await import('./src/realtime/index.ts');
console.log(JSON.stringify(EVENTS.map((e) => ({ name: e.name, gmOnly: e.role === 'GM' }))));`;
  const out = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    windowsHide: true,
  });
  catalogue = JSON.parse(out.trim().split('\n').at(-1)!) as RealtimeEventInfo[];
  return catalogue;
}

let keys: string[] | null = null;

/**
 * Nazwy pól ze wszystkich ładunków protokołu (`export interface …Payload`,
 * `…Request`, `…Patch`, `…Command` w `shared/src`). Śmieciowy ładunek z tymi
 * kluczami trafia w walidację pól, a nie tylko w „to nie jest obiekt”.
 */
export function payloadKeys(): string[] {
  if (keys) return keys;
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const text = readFileSync(path, 'utf8');
        const blocks = text.matchAll(
          /export interface \w+(?:Payload|Request|Patch|Command)\b[^{]*\{([\s\S]*?)\n\}/g,
        );
        for (const [, body] of blocks) {
          for (const [, key] of body!.matchAll(/^ {2}(\w+)\??:/gm)) found.add(key!);
        }
      }
    }
  };
  walk(join(REPO_DIR, 'packages/shared/src'));
  keys = [...found].sort();
  return keys;
}

/**
 * Śmieci w polu. `NaN` i `Infinity` nie przechodzą przez JSON Socket.IO (stają się
 * `null`), więc ich miejsce zajmują skrajne liczby. Napis 2 KB, nie 1 MB: obiekt
 * z kilkuset kluczami musi się zmieścić w `maxHttpBufferSize` (1 MB), inaczej
 * serwer zrywa połączenie, zanim handler cokolwiek zobaczy.
 */
export const JUNK: readonly (readonly [string, unknown])[] = [
  ['null', null],
  ['-1', -1],
  ['1e308', 1e308],
  ['0.5', 0.5],
  ['""', ''],
  ['2KB', 'Ż'.repeat(1_000)],
  ['[]', []],
  ['{}', {}],
  ['true', true],
  ['"x"', 'x'],
];

export interface Probe {
  label: string;
  payload: unknown;
  /** Bez ładunku — samo potwierdzenie (`socket.emit(name, ack)`). */
  bare?: boolean;
}

/**
 * Ładunki dla jednego zdarzenia: goły, śmieci w całości, zatruty prototyp,
 * wszystkie klucze protokołu ze śmieciem i — gdy podano — **prawdziwe id**
 * z tym samym śmieciem w reszcie pól (dochodzi głębiej w handler).
 */
export function probesFor(realIds: Record<string, unknown> = {}): Probe[] {
  const probes: Probe[] = [{ label: 'bez ładunku', payload: undefined, bare: true }];
  for (const [label, value] of JUNK) probes.push({ label: `całość ${label}`, payload: value });
  probes.push({ label: 'całość 200KB', payload: 'Ż'.repeat(100_000) });
  probes.push({
    label: '__proto__',
    payload: JSON.parse('{"__proto__":{"role":"GM","isGm":true},"constructor":{"prototype":{}}}'),
  });
  const all = payloadKeys();
  for (const [label, value] of JUNK) {
    probes.push({
      label: `klucze ${label}`,
      payload: Object.fromEntries(all.map((k) => [k, value])),
    });
  }
  if (Object.keys(realIds).length > 0) {
    for (const [label, value] of JUNK) {
      probes.push({
        label: `id + ${label}`,
        payload: { ...Object.fromEntries(all.map((k) => [k, value])), ...realIds },
      });
    }
  }
  return probes;
}

export type ProbeOutcome =
  { kind: 'ack'; ack: Ack } | { kind: 'no-ack' } | { kind: 'disconnected'; reason: string };

/**
 * Jedna próba: emit z potwierdzeniem, limit czasu, zerwane połączenie osobno.
 * `RATE_LIMITED` (#13) ponawia po chwili — macierz ról i śmieci pytają
 * o odpowiedź zdarzenia, a nie o limit tempa, który stoi przed nim.
 */
export async function probe(
  socket: Socket,
  event: string,
  sample: Probe,
  timeoutMs = 15_000,
): Promise<ProbeOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    const outcome = await probeOnce(socket, event, sample, timeoutMs);
    if (
      outcome.kind !== 'ack' ||
      outcome.ack.ok ||
      outcome.ack.error !== 'RATE_LIMITED' ||
      attempt >= RATE_LIMIT_RETRIES
    )
      return outcome;
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS));
  }
}

function probeOnce(
  socket: Socket,
  event: string,
  sample: Probe,
  timeoutMs: number,
): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    const onDisconnect = (reason: string) => finish({ kind: 'disconnected', reason });
    const timer = setTimeout(() => finish({ kind: 'no-ack' }), timeoutMs);
    function finish(outcome: ProbeOutcome) {
      clearTimeout(timer);
      socket.off('disconnect', onDisconnect);
      resolve(outcome);
    }
    socket.once('disconnect', onDisconnect);
    const ack = (response: Ack) => finish({ kind: 'ack', ack: response });
    if (sample.bare) socket.emit(event, ack);
    else socket.emit(event, sample.payload, ack);
  });
}

/**
 * Surowe gniazdo z podanym nagłówkiem `cookie` (albo bez) — `socket: null` przy odmowie.
 * Czeka na `state:sync`: kampanię i pokoje gniazdo dostaje dopiero po połączeniu,
 * więc zdarzenie wysłane zaraz po `connect` trafia na „brak kampanii”.
 */
export async function rawSocket(
  cookie: string | null,
  extraHeaders: Record<string, string> = {},
): Promise<{ socket: Socket | null; error: string | null; sync: unknown }> {
  const socket = io(SERVER_URL, {
    extraHeaders: { ...(cookie ? { cookie } : {}), ...extraHeaders },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ socket, error: null, sync: null }), 10_000);
    socket.once('state:sync', (sync: unknown) => {
      clearTimeout(timer);
      resolve({ socket, error: null, sync });
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      resolve({ socket: null, error: error.message, sync: null });
    });
  });
}

/** Ciasteczko sesji z nagłówków odpowiedzi logowania albo wejścia z zaproszenia. */
export function sessionCookie(setCookie: string | undefined): string {
  const match = /vtt_sid=[^;]+/.exec(setCookie ?? '');
  if (!match) throw new Error(`E2E: no vtt_sid in ${setCookie}`);
  return match[0];
}

/**
 * Log serwera instancji (`.e2e/logs/server.log`, pino JSON). `mark()` zapamiętuje
 * koniec pliku; `since()` czyta, co doszło potem — `INTERNAL` w ack ma tu swój
 * wiersz z nazwą zdarzenia i stosem.
 */
export class ServerLog {
  private offset = 0;
  private readonly path = join(LOG_DIR, 'server.log');

  mark(): void {
    this.offset = existsSync(this.path) ? statSync(this.path).size : 0;
  }

  since(): Record<string, unknown>[] {
    if (!existsSync(this.path)) return [];
    const text = readFileSync(this.path).subarray(this.offset).toString('utf8');
    const rows: Record<string, unknown>[] = [];
    for (const line of text.split('\n')) {
      if (!line.startsWith('{')) continue;
      try {
        rows.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Wiersz w trakcie zapisu — następny odczyt go dokończy.
      }
    }
    return rows;
  }

  /** Awarie handlerów: `realtime handler failed` z nazwą zdarzenia i komunikatem. */
  handlerFailures(): string[] {
    return this.since()
      .filter((row) => row.msg === 'realtime handler failed')
      .map((row) => {
        // Komunikat Prismy ma zapytanie w środku, a sedno w ostatnim wierszu.
        const err = row.err as { message?: string } | undefined;
        const lines = (err?.message ?? '?').split('\n').filter((line) => line.trim());
        return `${String(row.event)}: ${lines.at(-1)?.trim().slice(0, 160)}`;
      });
  }

  /** Błędy (poziom ≥ 50) inne niż awarie handlerów — np. Fastify, Prisma, trasy HTTP. */
  otherErrors(): string[] {
    return this.since()
      .filter((row) => Number(row.level) >= 50 && row.msg !== 'realtime handler failed')
      .map((row) => `${String(row.msg)} ${JSON.stringify(row.err ?? '').slice(0, 200)}`);
  }
}

/** Serwer odpowiada na `/health`. */
export async function serverAlive(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Martwy adres gatewaya: T2 nie woła modelu, a śmieci w zdarzeniach botów mają paść szybko. */
export const DEAD_GATEWAY = { AI_GATEWAY_URL: 'http://127.0.0.1:9' };

/** Najmniejszy poprawny PNG (szary) o zadanych wymiarach — nagłówek z prawdziwym CRC. */
export function png(width: number, height: number, rows = true): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // głębia
  header.writeUInt8(0, 9); // skala szarości
  // Obraz: wiersz = bajt filtra + piksele. Bez `rows` sam nagłówek (bomba wymiarów).
  const raw = rows ? Buffer.alloc((width + 1) * height, 0x80) : Buffer.alloc(0);
  for (let row = 0; rows && row < height; row += 1) raw[row * (width + 1)] = 0; // filtr „None”
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Podpis ciasteczka jak w `@fastify/cookie` (`wartość.HMAC-SHA256 base64 bez „=”`) —
 * do sprawdzenia, że podpis domyślnym sekretem nie przechodzi na instancji z innym.
 */
export function signCookieValue(value: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '');
  return `${value}.${mac}`;
}
