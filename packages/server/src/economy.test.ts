import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  CpredCharacterData,
  EconomyHistoryResult,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Stage 23b smoke tests: the wallet.
 *
 * What they guard is the rule the stage exists for — **a balance is written by
 * the server or not at all**. Every assertion reads the number back off the
 * sheet the server saved, and the audit is checked next to it: a purchase that
 * moves money without leaving a row would pass a naive test and fail the only
 * question the ledger exists to answer.
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
let vexCookie: string;
let vexId: string;
let rogueCookie: string;
let rogueId: string;
/** A second campaign, used once: a transfer must not cross a session. */
let outsideCharacterId: string;
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
  const firstSync = new Promise<StateSyncPayload>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
  return { socket, firstSync };
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 3000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolvePromise(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** The sheet as the server has it right now. */
async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
  const ack = await emitAck<CharacterView>(socket, 'character:update', {
    characterId,
    patch: {},
  });
  if (!ack.ok || !ack.data) throw new Error('character:update failed');
  return ack.data.data as CpredCharacterData;
}

async function ledgerOf(socket: ClientSocket, characterId: string): Promise<EconomyHistoryResult> {
  const ack = await emitAck<EconomyHistoryResult>(socket, 'economy:history', { characterId });
  if (!ack.ok || !ack.data) throw new Error('economy:history failed');
  return ack.data;
}

/** GM funds a wallet. Not a sheet edit any more — this is the audited path. */
async function fund(socket: ClientSocket, characterId: string, balance: number): Promise<void> {
  const ack = await emitAck(socket, 'economy:adjust', { characterId, balance, reason: 'zaliczka' });
  if (!ack.ok) throw new Error(`economy:adjust failed: ${ack.error}`);
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
    payload: { name: 'Nocne Targowisko' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;

  const joinVex = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Vex' },
  });
  vexCookie = cookieOf(joinVex.headers['set-cookie']);
  vexId = (joinVex.json() as { user: { id: string } }).user.id;

  const joinRogue = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rogue' },
  });
  rogueCookie = cookieOf(joinRogue.headers['set-cookie']);
  rogueId = (joinRogue.json() as { user: { id: string } }).user.id;

  // A sheet in another campaign: the payee check has to refuse it, and the only
  // way to be sure is to have one. Written straight to the DB — creating a
  // second campaign over HTTP would deactivate the one the sockets join.
  const outsideCampaign = await built.prisma.campaign.create({
    data: { name: 'Inna kampania', active: false },
  });
  outsideCharacterId = (
    await built.prisma.character.create({
      data: { campaignId: outsideCampaign.id, name: 'Obcy', data: '{}' },
    })
  ).id;
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

describe('eurodolce: zakupy, przelewy, rozliczenie miesiąca', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let rogue: ClientSocket;
  let kaiId: string;
  let ricoId: string;

  it('zakłada dwie postacie i finansuje je przez serwer', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    rogue = rogueConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync, rogueConn.firstSync]);

    const kai = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Kai',
      ownerId: vexId,
    });
    if (!kai.ok || !kai.data) throw new Error('character:create failed');
    kaiId = kai.data.id;
    const rico = await emitAck<CharacterView>(gm, 'character:create', {
      name: 'Rico',
      ownerId: rogueId,
    });
    if (!rico.ok || !rico.data) throw new Error('character:create failed');
    ricoId = rico.data.id;

    await fund(gm, kaiId, 1000);
    await fund(gm, ricoId, 200);
    expect((await sheetOf(vex, kaiId)).eddies).toBe(1000);
  });

  it('gracz nie może dopisać sobie eurodolców przez zapis karty', async () => {
    const ack = await emitAck(vex, 'character:update', {
      characterId: kaiId,
      patch: { data: { eddies: 999_999 } },
    });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await sheetOf(vex, kaiId)).eddies).toBe(1000);
  });

  it('korekta MG zostawia ślad w audycie', async () => {
    const ledger = await ledgerOf(gm, kaiId);
    expect(ledger.entries[0]).toMatchObject({ kind: 'adjust', amount: 1000, balance: 1000 });
  });

  it('zakup odejmuje cenę i dokłada wiersz na kartę', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{ balance: number }>(vex, 'economy:buy', {
      characterId: kaiId,
      entryId: 'weapon.zgrzyt-9',
    });
    expect(ack).toEqual({ ok: true, data: { balance: 950 } });

    const sheet = await sheetOf(vex, kaiId);
    expect(sheet.eddies).toBe(950);
    expect(sheet.weapons).toHaveLength(1);
    // Broń przychodzi załadowana i z kopią liczb z katalogu (etap 13).
    expect(sheet.weapons[0]).toMatchObject({
      compendiumId: 'weapon.zgrzyt-9',
      name: 'Zgrzyt 9',
      damage: '2k6',
    });

    const economy = (await card).message.economy;
    expect(economy?.title).toContain('Zgrzyt 9');
    expect(economy?.lines[0]).toContain('Kai');

    const ledger = await ledgerOf(vex, kaiId);
    expect(ledger.entries[0]).toMatchObject({
      kind: 'purchase',
      amount: -50,
      balance: 950,
      label: 'Zgrzyt 9',
    });
  });

  it('nie kupuje, gdy brakuje eurodolców — i nic nie ląduje na karcie', async () => {
    // Rico ma 200 ed, Iglica kosztuje 500.
    const ack = await emitAck(rogue, 'economy:buy', {
      characterId: ricoId,
      entryId: 'weapon.iglica-tw',
    });
    expect(ack).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    const sheet = await sheetOf(rogue, ricoId);
    expect(sheet.eddies).toBe(200);
    expect(sheet.weapons).toHaveLength(0);
  });

  it('gracz nie kupuje z cudzego konta ani nie narzuca własnej ceny', async () => {
    expect(
      await emitAck(rogue, 'economy:buy', {
        characterId: kaiId,
        entryId: 'gear.latarka-taktyczna',
      }),
    ).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    expect(
      await emitAck(rogue, 'economy:buy', {
        characterId: ricoId,
        entryId: 'gear.latarka-taktyczna',
        price: 0,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('MG nadpisuje cenę — u tego fixera latarka kosztuje 5 ed', async () => {
    const ack = await emitAck<{ balance: number }>(gm, 'economy:buy', {
      characterId: ricoId,
      entryId: 'gear.latarka-taktyczna',
      price: 5,
    });
    expect(ack).toEqual({ ok: true, data: { balance: 195 } });
    const ledger = await ledgerOf(gm, ricoId);
    expect(ledger.entries[0]).toMatchObject({ kind: 'purchase', amount: -5 });
  });

  it('amunicji i cyborgizacji nie kupuje się tą drogą', async () => {
    expect(
      await emitAck(gm, 'economy:buy', { characterId: ricoId, entryId: 'ammo.sample-standard' }),
    ).toEqual({ ok: false, error: 'NOT_PURCHASABLE' });
    expect(
      await emitAck(gm, 'economy:buy', {
        characterId: ricoId,
        entryId: 'cyberware.oko-przykladowe',
      }),
    ).toEqual({ ok: false, error: 'NOT_PURCHASABLE' });
  });

  it('przelew gracz → gracz zmienia oba konta i zostawia jedną linię na czacie', async () => {
    const card = waitFor<ChatMessageBroadcast>(rogue, 'chat:message');
    const ack = await emitAck<{ balance: number }>(vex, 'economy:transfer', {
      fromCharacterId: kaiId,
      toCharacterId: ricoId,
      amount: 400,
      note: 'za naprawę',
    });
    expect(ack).toEqual({ ok: true, data: { balance: 550 } });

    expect((await sheetOf(vex, kaiId)).eddies).toBe(550);
    expect((await sheetOf(rogue, ricoId)).eddies).toBe(595);

    // Jedna karta, choć konta są dwa — i widzi ją także odbiorca.
    const economy = (await card).message.economy;
    expect(economy?.lines[0]).toBe('Kai → Rico: 400 ed · za naprawę');

    const payer = await ledgerOf(vex, kaiId);
    expect(payer.entries[0]).toMatchObject({ kind: 'transfer', amount: -400 });
    expect(payer.entries[0]?.label).toContain('do: Rico');
    const payee = await ledgerOf(rogue, ricoId);
    expect(payee.entries[0]).toMatchObject({ kind: 'transfer', amount: 400 });
    expect(payee.entries[0]?.label).toContain('od: Kai');
  });

  it('nie przelewa więcej, niż jest na koncie, ani sam do siebie', async () => {
    expect(
      await emitAck(vex, 'economy:transfer', {
        fromCharacterId: kaiId,
        toCharacterId: ricoId,
        amount: 10_000,
      }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_EDDIES' });
    expect(
      await emitAck(vex, 'economy:transfer', {
        fromCharacterId: kaiId,
        toCharacterId: kaiId,
        amount: 10,
      }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(
      await emitAck(vex, 'economy:transfer', {
        fromCharacterId: kaiId,
        toCharacterId: ricoId,
        amount: -50,
      }),
    ).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  it('przelew do postaci spoza kampanii jest odrzucany', async () => {
    const ack = await emitAck(vex, 'economy:transfer', {
      fromCharacterId: kaiId,
      toCharacterId: outsideCharacterId,
      amount: 10,
    });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    expect((await sheetOf(vex, kaiId)).eddies).toBe(550);
  });

  it('gracz nie płaci z cudzego konta', async () => {
    const ack = await emitAck(rogue, 'economy:transfer', {
      fromCharacterId: kaiId,
      toCharacterId: ricoId,
      amount: 10,
    });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('„Rozlicz miesiąc" pobiera jedzenie i czynsz wszystkim naraz', async () => {
    // Kai: Na karmie (100) + Kontener (1000) = 1100 przy saldzie 550 →
    // konto na zero i niedopłata 550 (decyzja MG: pobierz, ile jest).
    await emitAck(vex, 'character:update', {
      characterId: kaiId,
      patch: { data: { lifestyle: { level: 'kibble', housing: 'container' } } },
    });
    // Rico: Na karmie (100) + Ulica (0) = 100 przy saldzie 595.
    await emitAck(rogue, 'character:update', {
      characterId: ricoId,
      patch: { data: { lifestyle: { level: 'kibble', housing: 'street' } } },
    });
    // Trzecia postać bez Poziomu życia — musi zostać pominięta.
    const npc = await emitAck<CharacterView>(gm, 'character:create', { name: 'Manekin' });
    if (!npc.ok || !npc.data) throw new Error('character:create failed');

    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const ack = await emitAck<{
      charged: number;
      shortfall: number;
      settled: number;
      skipped: number;
    }>(gm, 'economy:settle', {});
    if (!ack.ok) throw new Error(`economy:settle failed: ${ack.error}`);
    expect(ack.data).toEqual({ charged: 650, shortfall: 550, settled: 2, skipped: 1 });

    expect((await sheetOf(vex, kaiId)).eddies).toBe(0);
    expect((await sheetOf(rogue, ricoId)).eddies).toBe(495);
    expect((await sheetOf(gm, npc.data.id)).eddies).toBe(0);

    const economy = (await card).message.economy;
    expect(economy?.summary).toContain('niedopłata');
    expect(economy?.lines.some((line) => line.includes('NIEDOPŁATA'))).toBe(true);

    const ledger = await ledgerOf(vex, kaiId);
    expect(ledger.entries[0]).toMatchObject({ kind: 'lifestyle', amount: -550, balance: 0 });
    expect(ledger.entries[0]?.label).toContain('czynsz 1 000 ed');
    // Pominięta postać nie dostała ani wiersza w audycie.
    expect((await ledgerOf(gm, npc.data.id)).entries).toHaveLength(0);
  });

  it('podgląd miesiąca liczy rachunek, ale nie rusza kont', async () => {
    await fund(gm, kaiId, 5000);
    const ack = await emitAck<{ charged: number; shortfall: number }>(gm, 'economy:settle', {
      preview: true,
    });
    if (!ack.ok) throw new Error(`economy:settle failed: ${ack.error}`);
    expect(ack.data?.charged).toBe(1200);
    expect((await sheetOf(vex, kaiId)).eddies).toBe(5000);
  });

  it('rozliczenie i korekta są zarezerwowane dla MG', async () => {
    expect(await emitAck(vex, 'economy:settle', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await emitAck(vex, 'economy:adjust', { characterId: kaiId, balance: 1_000_000 }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('audyt cudzego konta jest niedostępny dla gracza', async () => {
    const ack = await emitAck(rogue, 'economy:history', { characterId: kaiId });
    expect(ack).toEqual({ ok: false, error: 'CHARACTER_NOT_FOUND' });
  });

  it('lista odbiorców zawiera wszystkie postacie kampanii poza własną', async () => {
    const { payees } = await ledgerOf(vex, kaiId);
    const names = payees.map((p) => p.name);
    expect(names).toContain('Rico');
    expect(names).toContain('Manekin');
    expect(names).not.toContain('Kai');
    expect(names).not.toContain('Obcy');
  });
});
