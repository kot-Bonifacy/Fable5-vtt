import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  HandoutDeleteBroadcast,
  HandoutOpenBroadcast,
  HandoutSyncPayload,
  HandoutUpsertBroadcast,
  HandoutView,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Handouty na żywych gniazdach (etap 24a).
 *
 * Testy pilnują jednej rzeczy, dla której ten etap istnieje: **materiał
 * nieudostępniony nie dociera do gracza w żadnym payloadzie**. Dlatego
 * asercje nie pytają „czy UI go ukrywa", tylko czytają to, co naprawdę
 * przyszło po gnieździe — listę z `handout:list`, rozgłoszenia i historię
 * czatu po ponownym połączeniu.
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
let kayaCookie: string;
let kayaId: string;
let rogueCookie: string;
let rogueId: string;
/** Konto spoza kampanii — udostępnienie mu handoutu ma zostać odrzucone. */
let outsiderId: string;
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

/**
 * „Nic nie przyszło" jest tu asercją, nie brakiem asercji — trzeci gracz ma
 * NIE dostać zdarzenia. Krótkie okno wystarczy: emisje idą tym samym obrotem
 * pętli zdarzeń co te, na które czekamy w tym samym teście.
 */
function expectSilence(socket: ClientSocket, event: string, ms = 250): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolvePromise();
    }, ms);
    const onEvent = (payload: unknown) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      reject(new Error(`${event} dotarło, choć nie powinno: ${JSON.stringify(payload)}`));
    };
    socket.on(event, onEvent);
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

async function listHandouts(socket: ClientSocket): Promise<HandoutSyncPayload> {
  const ack = await emitAck<HandoutSyncPayload>(socket, 'handout:list');
  if (!ack.ok) throw new Error(`handout:list failed: ${ack.error}`);
  if (!ack.data) throw new Error('handout:list bez danych');
  return ack.data;
}

async function share(
  socket: ClientSocket,
  id: string,
  userIds: string[],
): Promise<SocketAck<HandoutView>> {
  return emitAck<HandoutView>(socket, 'handout:share', { id, userIds });
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

  for (const name of ['Vex', 'Kaya', 'Rogue']) {
    const join = await built.app.inject({
      method: 'POST',
      url: `/api/join/${token}`,
      payload: { name },
    });
    const cookie = cookieOf(join.headers['set-cookie']);
    const id = (join.json() as { user: { id: string } }).user.id;
    if (name === 'Vex') {
      vexCookie = cookie;
      vexId = id;
    } else if (name === 'Kaya') {
      kayaCookie = cookie;
      kayaId = id;
    } else {
      rogueCookie = cookie;
      rogueId = id;
    }
  }

  // Konto, które nie należy do kampanii — jedyny sposób sprawdzić, czy
  // `handout:share` odrzuci podrobioną listę odbiorców.
  outsiderId = (await built.prisma.user.create({ data: { name: 'Obcy', role: 'PLAYER' } })).id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows może jeszcze trzymać plik
  }
});

describe('handouty: tworzenie, udostępnianie i cofanie', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let kaya: ClientSocket;
  let rogue: ClientSocket;
  let mapaId: string;
  let notatkaId: string;

  /** Id handoutów, które ten gracz naprawdę dostał — bez zakładania kolejności. */
  const idsOf = async (socket: ClientSocket): Promise<string[]> =>
    (await listHandouts(socket)).handouts.map((handout) => handout.id).sort();

  it('łączy stół i pokazuje MG listę kandydatów na odbiorców', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(vexCookie);
    const kayaConn = createSocket(kayaCookie);
    const rogueConn = createSocket(rogueCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    kaya = kayaConn.socket;
    rogue = rogueConn.socket;
    await Promise.all([
      gmConn.firstSync,
      vexConn.firstSync,
      kayaConn.firstSync,
      rogueConn.firstSync,
    ]);

    const view = await listHandouts(gm);
    expect(view.handouts).toEqual([]);
    expect(view.recipients.map((entry) => entry.name)).toEqual(['Kaya', 'Rogue', 'Vex']);
  });

  it('gracz nie dostaje listy kandydatów — skład stołu to nie jego sprawa', async () => {
    const view = await listHandouts(vex);
    expect(view.recipients).toEqual([]);
  });

  it('MG zakłada handout z grafiką; nikt inny jeszcze o nim nie wie', async () => {
    const ack = await emitAck<HandoutView>(gm, 'handout:upsert', {
      title: 'Mapa Kabuki',
      body: '## Kabuki\n\nWejście od **wschodu**.',
      image: { url: '/uploads/handouts/kabuki01.png', width: 1200, height: 900 },
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('handout:upsert failed');
    mapaId = ack.data.id;
    expect(ack.data.image?.url).toBe('/uploads/handouts/kabuki01.png');
    expect(ack.data.sharedWith).toEqual([]);

    for (const player of [vex, kaya, rogue]) {
      expect((await listHandouts(player)).handouts).toEqual([]);
    }
  });

  it('gracz nie może założyć handoutu', async () => {
    const ack = await emitAck(vex, 'handout:upsert', { title: 'Podróbka', body: 'treść' });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('odrzuca pustą kartkę i grafikę spoza katalogu handoutów', async () => {
    const blank = await emitAck(gm, 'handout:upsert', { title: 'Nic', body: '', image: null });
    expect(blank.ok).toBe(false);
    expect(blank.ok === false && blank.error).toContain('Handout musi mieć treść albo grafikę.');

    const foreign = await emitAck(gm, 'handout:upsert', {
      title: 'Podmiana',
      body: '',
      image: { url: '/uploads/maps/tajna-mapa.png', width: 10, height: 10 },
    });
    expect(foreign.ok).toBe(false);
  });

  it('udostępnia dwóm z trzech graczy — trzeci nie widzi go nawet w payloadzie', async () => {
    const vexOpens = waitFor<HandoutOpenBroadcast>(vex, 'handout:open');
    const kayaOpens = waitFor<HandoutOpenBroadcast>(kaya, 'handout:open');
    const rogueSilent = expectSilence(rogue, 'handout:open');
    const rogueSilentUpsert = expectSilence(rogue, 'handout:upsert');

    const ack = await share(gm, mapaId, [vexId, kayaId]);
    expect(ack.ok).toBe(true);
    if (!ack.ok || !ack.data) throw new Error('handout:share failed');
    expect([...(ack.data.sharedWith ?? [])].sort()).toEqual([vexId, kayaId].sort());

    const opened = await vexOpens;
    expect(opened.handout.title).toBe('Mapa Kabuki');
    // Kluczowe: odbiorca nie dowiaduje się, komu jeszcze MG to pokazał.
    expect(opened.handout.sharedWith).toBeUndefined();
    await kayaOpens;
    await rogueSilent;
    await rogueSilentUpsert;

    expect(await idsOf(vex)).toEqual([mapaId]);
    expect(await idsOf(kaya)).toEqual([mapaId]);
    expect(await idsOf(rogue)).toEqual([]);
  });

  it('zostawia wiersz na czacie odbiorcom i MG, ale nie trzeciemu graczowi', async () => {
    const kayaLine = waitFor<ChatMessageBroadcast>(kaya, 'chat:message');
    const rogueSilent = expectSilence(rogue, 'chat:message', 400);

    const second = await emitAck<HandoutView>(gm, 'handout:upsert', {
      title: 'Notatka fixera',
      body: 'Spotkanie o 23:00.',
      image: null,
    });
    if (!second.ok || !second.data) throw new Error('handout:upsert failed');
    notatkaId = second.data.id;
    await share(gm, notatkaId, [kayaId]);

    const line = await kayaLine;
    expect(line.message.kind).toBe('handout');
    expect(line.message.handout).toEqual({
      handoutId: notatkaId,
      title: 'Notatka fixera',
      hasImage: false,
    });
    await rogueSilent;
  });

  it('po przeładowaniu strony historia czatu dzieli wiersze tak samo', async () => {
    // Świeże gniazdo to dokładnie to, co robi przeglądarka po F5: ostatnią
    // stronę czatu przynosi `state:sync`, a odsiewa ją `visibleTo` w zapytaniu.
    const [kayaSync, rogueSync, gmSync] = await Promise.all(
      [kayaCookie, rogueCookie, gmCookie].map((cookie) => createSocket(cookie).firstSync),
    );
    const handoutsIn = (sync: StateSyncPayload) =>
      sync.messages.filter((message) => message.kind === 'handout');

    expect(handoutsIn(kayaSync!).map((m) => m.handout?.title)).toEqual([
      'Mapa Kabuki',
      'Notatka fixera',
    ]);
    expect(handoutsIn(rogueSync!)).toEqual([]);
    expect(handoutsIn(gmSync!)).toHaveLength(3);
  });

  it('powtórne udostępnienie nie wyskakuje temu, kto już handout ma', async () => {
    const vexSilent = expectSilence(vex, 'handout:open', 400);
    const rogueOpens = waitFor<HandoutOpenBroadcast>(rogue, 'handout:open');

    const ack = await share(gm, mapaId, [vexId, kayaId, rogueId]);
    expect(ack.ok).toBe(true);

    await rogueOpens;
    await vexSilent;
  });

  it('zmiana treści dociera do odbiorców, ale bez listy udostępnień', async () => {
    const vexUpdate = waitFor<HandoutUpsertBroadcast>(vex, 'handout:upsert');
    const ack = await emitAck<HandoutView>(gm, 'handout:upsert', {
      id: mapaId,
      title: 'Mapa Kabuki (poprawiona)',
      body: 'Wejście od **zachodu**.',
      image: null,
    });
    expect(ack.ok).toBe(true);

    const update = await vexUpdate;
    expect(update.handout.title).toBe('Mapa Kabuki (poprawiona)');
    expect(update.handout.image).toBeNull();
    expect(update.handout.sharedWith).toBeUndefined();
    // Edycja treści nie rusza listy odbiorców.
    expect(ack.ok && ack.data?.sharedWith).toHaveLength(3);
  });

  it('cofnięcie udostępnienia zdejmuje handout tylko temu graczowi', async () => {
    const vexRevoked = waitFor<HandoutDeleteBroadcast>(vex, 'handout:delete');
    const kayaSilent = expectSilence(kaya, 'handout:delete', 400);

    const ack = await share(gm, mapaId, [kayaId, rogueId]);
    expect(ack.ok).toBe(true);

    expect((await vexRevoked).id).toBe(mapaId);
    await kayaSilent;

    expect(await idsOf(vex)).toEqual([]);
    expect(await idsOf(kaya)).toEqual([mapaId, notatkaId].sort());
  });

  it('odrzuca odbiorcę spoza kampanii', async () => {
    const ack = await share(gm, mapaId, [kayaId, outsiderId]);
    expect(ack).toEqual({ ok: false, error: 'UNKNOWN_RECIPIENT' });
    // Odmowa nie może zostawić połowy zapisu — ani zabrać, ani dodać.
    expect(await idsOf(kaya)).toEqual([mapaId, notatkaId].sort());
    expect(await idsOf(rogue)).toEqual([mapaId]);
  });

  it('gracz nie może udostępnić sobie cudzego handoutu', async () => {
    const ack = await share(vex, mapaId, [vexId]);
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await listHandouts(vex)).handouts).toEqual([]);
  });

  it('usunięcie handoutu znika u odbiorców i u MG', async () => {
    const kayaGone = waitFor<HandoutDeleteBroadcast>(kaya, 'handout:delete');
    const gmGone = waitFor<HandoutDeleteBroadcast>(gm, 'handout:delete');

    const ack = await emitAck(gm, 'handout:delete', { id: mapaId });
    expect(ack.ok).toBe(true);

    expect((await kayaGone).id).toBe(mapaId);
    expect((await gmGone).id).toBe(mapaId);
    expect(await idsOf(kaya)).toEqual([notatkaId]);
    expect(await idsOf(rogue)).toEqual([]);
    expect((await listHandouts(gm)).handouts.map((h) => h.title)).toEqual(['Notatka fixera']);
  });

  it('odmawia operacji na nieistniejącym handoucie', async () => {
    const ack = await emitAck(gm, 'handout:delete', { id: 'nie-ma-takiego' });
    expect(ack).toEqual({ ok: false, error: 'HANDOUT_NOT_FOUND' });
  });
});
