import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { CampaignSummary, SceneView, SocketAck, StateSyncPayload } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { EVENTS } from './realtime/index.js';
import { joinUrl } from './test-join.js';

/**
 * #15 (T2, 26.09): śmieci w polach ładunku kończyły się `INTERNAL`.
 *
 * Liczba spoza zakresu Int (`1e308`), ułamek albo zły typ trafiały wprost do
 * zapytania Prismy, a `ai:ask` i `rules:ask` padały na `.trim`. Stan się nie
 * psuł, ale odpowiedź „błąd serwera” na zły ładunek to fałszywy alarm w logu
 * i zasłona dla prawdziwych awarii. Każde zdarzenie z rejestru dostaje tu te
 * same śmieci, co w suicie E2E (`fixtures/security.ts`), z gniazda gracza i MG.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  clientOrigin: 'http://localhost:5173',
  databaseUrl: `file:${TEST_DB}`,
  gmName: 'MG',
  gmPassword: GM_PASSWORD,
  cookieSecret: 'test-cookie-secret',
  sessionTtlDays: 1,
  uploadsDir: mkdtempSync(join(tmpdir(), 'vtt-uploads-')),
  dataPublicDir: resolve(import.meta.dirname, '../../../data/public'),
  dataPrivateDir: resolve(import.meta.dirname, 'fixtures/no-private-data'),
  aiGatewayUrl: 'http://127.0.0.1:1',
  aiGatewayApiKey: '',
  aiHealthIntervalMs: 60_000,
  aiRequestTimeoutMs: 1000,
};

let built: BuiltApp;
let baseUrl: string;
let gmCookie: string;
let playerCookie: string;
const openSockets: ClientSocket[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

function createSocket(cookie: string): {
  socket: ClientSocket;
  firstSync: Promise<StateSyncPayload>;
} {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  const firstSync = new Promise<StateSyncPayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  return { socket, firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania śmieci' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  // Etap 44b: linki są imienne — wystawia je `joinUrl` przy każdym wejściu.
  const token = campaignId;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, token, 'Rogue'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

/** Nazwy pól, którymi handlery czytają ładunek — śmieć w każdym z nich naraz. */
const KEYS = [
  'beforeId',
  'messageId',
  'callMessageId',
  'attackMessageId',
  'creationDraftId',
  'characterId',
  'tokenId',
  'sceneId',
  'wallId',
  'coverId',
  'zoneId',
  'lightId',
  'drawingId',
  'netpointId',
  'pointId',
  'id',
  'ids',
  'openingId',
  'wallIds',
  'tableId',
  'question',
  'text',
  'approve',
  'request',
  'patch',
  'data',
  'kind',
  'x',
  'y',
  'hp',
  'accept',
  'rowId',
  'targetTokenId',
];

const JUNK: readonly (readonly [string, unknown])[] = [
  ['null', null],
  ['-1', -1],
  ['1e308', 1e308],
  ['0.5', 0.5],
  ['""', ''],
  ['[]', []],
  ['{}', {}],
  ['true', true],
  ['"x"', 'x'],
];

function probes(extra: Record<string, unknown>): { label: string; payload: unknown }[] {
  const list: { label: string; payload: unknown }[] = [];
  for (const [label, value] of JUNK) {
    list.push({ label: `całość ${label}`, payload: value });
    list.push({
      label: `klucze ${label}`,
      payload: { ...Object.fromEntries(KEYS.map((key) => [key, value])), ...extra },
    });
  }
  return list;
}

/** Zdarzenia niszczące na koniec — śmieć z prawdziwym id nie skasuje celu reszcie. */
const DESTRUCTIVE = /delete|clear|remove|reset|undo|forget|discard|end$|logout/;

describe('śmieciowe ładunki (#15)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;

  beforeAll(async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Śmietnik' }), 'scene').id;
  });

  for (const role of ['gracz', 'MG'] as const) {
    it(`żadne zdarzenie z gniazda: ${role} nie odpowiada INTERNAL`, async () => {
      const socket = role === 'MG' ? gm : player;
      const names = EVENTS.map((event) => event.name);
      const ordered = [
        ...names.filter((name) => !DESTRUCTIVE.test(name)),
        ...names.filter((name) => DESTRUCTIVE.test(name)),
      ];
      const internal: string[] = [];
      for (const name of ordered) {
        for (const probe of probes({ sceneId })) {
          const ack = await emitAck(socket, name, probe.payload).catch(() => null);
          if (ack && !ack.ok && ack.error === 'INTERNAL') internal.push(`${name} [${probe.label}]`);
        }
      }
      expect(internal).toEqual([]);
    }, 120_000);
  }
});
