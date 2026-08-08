import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CompendiumDeleteBroadcast,
  CompendiumEntry,
  CompendiumUpsertBroadcast,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Smoke tests for the item compendium (stage 13).
 *
 * `dataPrivateDir` points at a directory that does not exist on purpose: these
 * suites must run on the committed sample data, which is also the "fresh clone
 * without data/private" path from the stage's completion criteria.
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Kampania kompendium' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const join = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // The database file may already be gone; nothing to clean up.
  }
});

describe('compendium', () => {
  it('ships the sample catalogue to the GM on connect', async () => {
    const gm = createSocket(gmCookie);
    const sync = await gm.firstSync;
    expect(sync.compendium.weaponTypes.length).toBeGreaterThan(0);
    expect(sync.compendium.entries.length).toBeGreaterThan(0);
    const weapon = sync.compendium.entries.find((entry) => entry.category === 'weapon');
    expect(weapon).toBeDefined();
  });

  it('gives players the same catalogue as the GM — gear is not GM data', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(playerCookie);
    const [gmSync, playerSync] = await Promise.all([gm.firstSync, player.firstSync]);
    expect(playerSync.compendium.entries.map((e) => e.id)).toEqual(
      gmSync.compendium.entries.map((e) => e.id),
    );
    expect(playerSync.compendium.weaponTypes).toEqual(gmSync.compendium.weaponTypes);
  });

  it('runs on the sample data when data/private is absent', async () => {
    const gm = createSocket(gmCookie);
    const sync = await gm.firstSync;
    // Every sample entry declares itself as invented data, never rulebook text.
    for (const entry of sync.compendium.entries.filter((e) => !e.custom)) {
      expect(entry.source ?? '').toContain('przykładowe');
    }
  });

  it('lets the GM add an entry and broadcasts it to players', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(playerCookie);
    await Promise.all([gm.firstSync, player.firstSync]);

    const broadcast = waitFor<CompendiumUpsertBroadcast>(player.socket, 'compendium:upsert');
    const ack = await emitAck<CompendiumEntry>(gm.socket, 'compendium:upsert', {
      entry: {
        category: 'weapon',
        name: 'Kolec MG',
        weaponTypeId: null,
        quality: 'standard',
        damage: '2k6',
        cost: 100,
      },
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) throw new Error(ack.error);
    expect(ack.data?.id).toBe('weapon.kolec-mg');
    expect(ack.data?.custom).toBe(true);

    const received = await broadcast;
    expect(received.entry.name).toBe('Kolec MG');
    expect(received.seq).toBeGreaterThan(0);
  });

  it('refuses writes from a player', async () => {
    const player = createSocket(playerCookie);
    await player.firstSync;
    const ack = await emitAck(player.socket, 'compendium:upsert', {
      entry: { category: 'gear', name: 'Nielegalny wpis', cost: 1 },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('FORBIDDEN');
  });

  it('rejects an entry that fails the shared schema, with a Polish message', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const ack = await emitAck(gm.socket, 'compendium:upsert', {
      entry: { category: 'weapon', name: 'Bez obrażeń', weaponTypeId: null, cost: 0 },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) {
      expect(ack.error).toContain('INVALID_ENTRY');
      expect(ack.error).toContain('obrażenia');
    }
  });

  it('refuses to shadow an imported entry id', async () => {
    const gm = createSocket(gmCookie);
    const sync = await gm.firstSync;
    const imported = sync.compendium.entries.find((entry) => !entry.custom);
    expect(imported).toBeDefined();
    const ack = await emitAck(gm.socket, 'compendium:upsert', {
      entry: {
        category: imported!.category,
        name: imported!.name,
        ...(imported!.category === 'weapon' ? { weaponTypeId: null, damage: '1k6' } : {}),
        ...(imported!.category === 'armor' ? { sp: 1, locations: ['body'] } : {}),
        cost: 1,
      },
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('ID_TAKEN');
  });

  it('keeps an edited entry under the same id so sheet references survive', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    await emitAck<CompendiumEntry>(gm.socket, 'compendium:upsert', {
      entry: {
        category: 'gear',
        name: 'Zestaw wytrychów',
        description: 'Pierwsza wersja.',
        cost: 50,
      },
    });
    const ack = await emitAck<CompendiumEntry>(gm.socket, 'compendium:upsert', {
      entry: {
        id: 'gear.zestaw-wytrychow',
        category: 'gear',
        name: 'Zestaw wytrychów (ulepszony)',
        description: 'Druga wersja.',
        cost: 100,
      },
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) throw new Error(ack.error);
    expect(ack.data?.id).toBe('gear.zestaw-wytrychow');

    const fresh = createSocket(gmCookie);
    const sync = await fresh.firstSync;
    const matches = sync.compendium.entries.filter((e) => e.id === 'gear.zestaw-wytrychow');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('Zestaw wytrychów (ulepszony)');
  });

  it('deletes a custom entry and tells everyone', async () => {
    const gm = createSocket(gmCookie);
    const player = createSocket(playerCookie);
    await Promise.all([gm.firstSync, player.firstSync]);

    await emitAck(gm.socket, 'compendium:upsert', {
      entry: { category: 'gear', name: 'Do skasowania', cost: 1 },
    });
    const broadcast = waitFor<CompendiumDeleteBroadcast>(player.socket, 'compendium:delete');
    const ack = await emitAck(gm.socket, 'compendium:delete', { id: 'gear.do-skasowania' });
    expect(ack.ok).toBe(true);
    expect((await broadcast).id).toBe('gear.do-skasowania');
  });

  it('cannot delete an imported entry (files are read-only from the UI)', async () => {
    const gm = createSocket(gmCookie);
    const sync = await gm.firstSync;
    const imported = sync.compendium.entries.find((entry) => !entry.custom);
    const ack = await emitAck(gm.socket, 'compendium:delete', { id: imported!.id });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error).toBe('ENTRY_NOT_FOUND');
  });

  it('stores a compendium reference on the character sheet', async () => {
    const gm = createSocket(gmCookie);
    const sync = await gm.firstSync;
    const weapon = sync.compendium.entries.find((entry) => entry.category === 'weapon');
    expect(weapon).toBeDefined();

    const created = await emitAck<{ id: string }>(gm.socket, 'character:create', {
      name: 'Uzbrojony',
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) throw new Error('character not created');

    const updated = await emitAck(gm.socket, 'character:update', {
      characterId: created.data.id,
      patch: {
        data: {
          weapons: [
            {
              id: 'row1',
              name: weapon!.name,
              notes: '',
              damage: '2k6',
              ammo: '10',
              rof: '2',
              compendiumId: weapon!.id,
            },
          ],
        },
      },
    });
    expect(updated.ok).toBe(true);

    const fresh = createSocket(gmCookie);
    const freshSync = await fresh.firstSync;
    const character = freshSync.characters.find((c) => c.id === created.data!.id);
    const row = (character?.data as { weapons: { compendiumId?: string }[] }).weapons[0];
    expect(row?.compendiumId).toBe(weapon!.id);
  });

  it('drops a malformed compendium reference instead of rejecting the sheet', async () => {
    const gm = createSocket(gmCookie);
    await gm.firstSync;
    const created = await emitAck<{ id: string }>(gm.socket, 'character:create', {
      name: 'Z błędnym odnośnikiem',
    });
    if (!created.ok || !created.data) throw new Error('character not created');

    const ack = await emitAck(gm.socket, 'character:update', {
      characterId: created.data.id,
      patch: {
        data: {
          gear: [{ id: 'row1', name: 'Coś', notes: '', qty: 1, compendiumId: 'NIE POPRAWNY SLUG' }],
        },
      },
    });
    expect(ack.ok).toBe(true);

    const fresh = createSocket(gmCookie);
    const freshSync = await fresh.firstSync;
    const character = freshSync.characters.find((c) => c.id === created.data!.id);
    const row = (character?.data as { gear: { compendiumId?: string }[] }).gear[0];
    expect(row?.compendiumId).toBeUndefined();
  });
});
