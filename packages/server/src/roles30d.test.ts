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
  CharacterView,
  CpredCharacterData,
  InvitationSummary,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Cztery Zdolności etapu 30d na żywych gniazdach.
 *
 * `ladders.test.ts` i `rolerolls.test.ts` w `shared` liczą tabele i planer;
 * tutaj sprawdzany jest szew: że Targowanie się naprawdę odkłada targ na kartę
 * i że najbliższy zakup jest o te 10% tańszy, że targu nie da się dopisać łatą,
 * że Tabor Rodziny nie przyjmie więcej wpisów niż poziomów Moto i że prośba
 * Rockera do nieistniejącej publiczności nie dochodzi do kości.
 *
 * Rzuty są losowe, więc test dobiera warunki tak, żeby losowość nie mogła go
 * zepsuć: Fixer targuje się z CHA 5 i rangą 10 przeciw modyfikatorowi 0, a gdy
 * kości i tak dadzą przegraną, powtarza — osiem porażek pod rząd nie zdarzy się
 * w tym stuleciu.
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
let playerId: string;
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
  const firstSync = new Promise<StateSyncPayload>((resolveSync, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      resolveSync(payload);
    });
  });
  return { socket, firstSync };
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolveEvent(payload);
    });
  });
}

/**
 * Waits for the first event that **matches**, ignoring whatever else is on the
 * wire.
 *
 * `waitFor` takes the first payload that arrives, and on `chat:message` that is
 * a race: a public roll reaches the GM socket too, and its copy may land after
 * the test that made it already returned on the player's copy. The next test's
 * wait then resolves on the previous test's card. Matching on content makes
 * each wait pick its own message, so the file stops depending on the order
 * events happen to settle in.
 */
function waitForMatch<T>(
  socket: ClientSocket,
  event: string,
  matches: (payload: T) => boolean,
  what: string,
  ms = 4000,
): Promise<T> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`${event} „${what}" timeout`));
    }, ms);
    const listener = (payload: T) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolveEvent(payload);
    };
    socket.on(event, listener);
  });
}

/** The roll card whose title starts with `title`. */
function waitForRoll(socket: ClientSocket, title: string): Promise<ChatMessageBroadcast> {
  return waitForMatch<ChatMessageBroadcast>(
    socket,
    'chat:message',
    (payload) => payload.message.roll?.title?.startsWith(title) === true,
    title,
  );
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolveAck, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 6000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolveAck(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
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
    payload: { password: GM_PASSWORD },
  });
  gmCookie = cookieOf(login.headers['set-cookie']);

  const campaignRes = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: gmCookie },
    payload: { name: 'Nocny Kanał' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const invite = (inviteRes.json() as InvitationSummary).token;

  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${invite}`,
    payload: { name: 'Cyra' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
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

describe('etap 30d: Znajomości, Moto, Efekt Charyzmy i Wiarygodność', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let fixerId: string;
  let rockerId: string;
  let nomadId: string;
  let mediaId: string;

  async function sheetOf(socket: ClientSocket, characterId: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
    socket.emit('state:request');
    const found = (await sync).characters.find((entry) => entry.id === characterId);
    if (!found) throw new Error('character missing from sync');
    return found.data as CpredCharacterData;
  }

  it('stawia stół: cztery Role, otwarty sklep i pełna sakiewka Fixera', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    // Etap 25c: świeża kampania otwiera poziom 1, a ten test kupuje pistolet.
    expect((await emitAck(gm, 'shop:tier', { tier: 4 })).ok).toBe(true);

    const make = async (name: string, roleId: string, rank: number): Promise<string> => {
      const character = data(
        await emitAck<CharacterView>(gm, 'character:create', { name, ownerId: playerId }),
        'character:create',
      );
      expect(
        (
          await emitAck(gm, 'character:update', {
            characterId: character.id,
            patch: { data: { roleId, roleAbilityRank: rank } },
          })
        ).ok,
      ).toBe(true);
      return character.id;
    };

    fixerId = await make('Cyra', 'fixer', 10);
    rockerId = await make('Nyx', 'rockerboy', 2);
    nomadId = await make('Kord', 'nomad', 2);
    mediaId = await make('Wren', 'media', 5);

    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: fixerId,
          patch: { data: { eddies: 1000 } },
        })
      ).ok,
    ).toBe(true);
  });

  it('Targowanie się odkłada dobity targ na kartę', async () => {
    let struck: CpredCharacterData['haggle'] = null;
    for (let attempt = 0; attempt < 8 && struck === null; attempt += 1) {
      const card = waitForRoll(player, 'Targowanie się');
      const result = data(
        await emitAck<{ won: boolean; dealId: string | null }>(player, 'character:haggle', {
          characterId: fixerId,
          dealId: 'percent10',
          opponentBonus: 0,
        }),
        'character:haggle',
      );
      const roll = (await card).message.roll;
      expect(roll?.opposed?.label).toContain('Targowanie się');
      expect(roll?.breakdown?.map((entry) => entry.label)).toContain('Znajomości 10');
      if (result.won) struck = (await sheetOf(player, fixerId)).haggle;
    }
    expect(struck).toMatchObject({ dealId: 'percent10', discount: 10 });
  });

  it('targ powyżej rangi i targ bez Zdolności są odrzucane', async () => {
    expect(
      await emitAck(player, 'character:haggle', {
        characterId: rockerId,
        dealId: 'percent10',
        opponentBonus: 0,
      }),
    ).toEqual({ ok: false, error: 'NO_ABILITY' });
    expect(
      await emitAck(player, 'character:haggle', {
        characterId: fixerId,
        dealId: 'percent10',
        opponentBonus: 999,
      }),
    ).toEqual({ ok: false, error: 'BAD_VALUE' });
  });

  it('najbliższy zakup jest tańszy o dziesięć procent, a targ znika z karty', async () => {
    const before = await sheetOf(player, fixerId);
    expect(before.haggle?.discount).toBe(10);

    const card = waitForMatch<ChatMessageBroadcast>(
      player,
      'chat:message',
      (payload) => payload.message.economy !== undefined,
      'zakup',
    );
    const ack = data(
      await emitAck<{ balance: number }>(player, 'economy:buy', {
        characterId: fixerId,
        entryId: 'weapon.zgrzyt-9',
      }),
      'economy:buy',
    );
    // Zgrzyt 9 kosztuje 50 ed; z targiem 45.
    expect(before.eddies - ack.balance).toBe(45);
    const economy = (await card).message.economy;
    expect(economy?.lines.some((line) => line.includes('−10%'))).toBe(true);

    const after = await sheetOf(player, fixerId);
    expect(after.haggle).toBeNull();
    // Drugi zakup płaci już pełną cenę.
    const second = data(
      await emitAck<{ balance: number }>(player, 'economy:buy', {
        characterId: fixerId,
        entryId: 'weapon.zgrzyt-9',
      }),
      'economy:buy',
    );
    expect(ack.balance - second.balance).toBe(50);
  });

  it('targu nie da się dopisać łatą karty — nawet z konta MG', async () => {
    expect(
      await emitAck(gm, 'character:update', {
        characterId: fixerId,
        patch: { data: { haggle: { dealId: 'percent20', discount: 20 } } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await sheetOf(player, fixerId)).haggle).toBeNull();
  });

  it('Fixer może sam porzucić dobity targ', async () => {
    let won = false;
    for (let attempt = 0; attempt < 8 && !won; attempt += 1) {
      const result = data(
        await emitAck<{ won: boolean }>(player, 'character:haggle', {
          characterId: fixerId,
          dealId: 'percent10',
          opponentBonus: 0,
        }),
        'character:haggle',
      );
      won = result.won;
    }
    expect((await sheetOf(player, fixerId)).haggle).not.toBeNull();
    expect(
      (await emitAck(player, 'character:haggle', { characterId: fixerId, clear: true })).ok,
    ).toBe(true);
    expect((await sheetOf(player, fixerId)).haggle).toBeNull();
  });

  it('Tabor Rodziny przyjmuje tyle wpisów, ile poziomów Moto', async () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `t${index}`,
        kind: 'vehicle',
        name: 'Standardowy motocykl',
        level: 1,
      }));
    expect(
      (
        await emitAck(player, 'character:update', {
          characterId: nomadId,
          patch: { data: { fleet: rows(2) } },
        })
      ).ok,
    ).toBe(true);
    expect((await sheetOf(player, nomadId)).fleet).toHaveLength(2);

    expect(
      await emitAck(player, 'character:update', {
        characterId: nomadId,
        patch: { data: { fleet: rows(3) } },
      }),
    ).toEqual({ ok: false, error: 'TOO_MANY' });

    // Awans i trzeci wpis w jednej łacie muszą przejść razem. Od etapu 29a
    // rangę podnosi u gracza wyłącznie `character:advance` (płatny szczebel),
    // więc jednoczesną łatę składa MG — i to jej dotyczy niezmiennik z 30d.
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: nomadId,
          patch: { data: { roleAbilityRank: 3, fleet: rows(3) } },
        })
      ).ok,
    ).toBe(true);
  });

  it('wpis Taboru ponad poziom Moto jest odrzucany', async () => {
    expect(
      await emitAck(player, 'character:update', {
        characterId: nomadId,
        patch: {
          data: { fleet: [{ id: 'av', kind: 'vehicle', name: 'AV-4', level: 8 }] },
        },
      }),
    ).toEqual({ ok: false, error: 'LEVEL_ABOVE_RANK' });
  });

  it('prośba Rockera do dużej grupy przy randze 2 nie dochodzi do kości', async () => {
    expect(
      await emitAck(player, 'character:roll', {
        characterId: rockerId,
        request: { kind: 'charisma', charismaAudience: 'large', charismaPurpose: 'favour' },
        visibility: 'public',
      }),
    ).toEqual({ ok: false, error: 'NO_CROWD' });
  });

  it('Test Efektu Charyzmy ląduje na czacie z PT i werdyktem', async () => {
    const card = waitForRoll(player, 'Efekt Charyzmy');
    expect(
      (
        await emitAck(player, 'character:roll', {
          characterId: rockerId,
          request: { kind: 'charisma', charismaAudience: 'single', charismaPurpose: 'favour' },
          visibility: 'public',
        })
      ).ok,
    ).toBe(true);
    const roll = (await card).message.roll;
    expect(roll?.title).toContain('Efekt Charyzmy');
    expect(roll?.breakdown?.map((entry) => entry.label)).toEqual(['Efekt Charyzmy 2']);
    expect(roll?.outcome?.detail).toContain('PT 8');
  });

  it('Test Rzetelności to goła kość przeciw szansie z rangi', async () => {
    const card = waitForRoll(player, 'Test Rzetelności');
    expect(
      (
        await emitAck(player, 'character:roll', {
          characterId: mediaId,
          request: { kind: 'reliability', reliabilityProof: 'solid' },
          visibility: 'public',
        })
      ).ok,
    ).toBe(true);
    const roll = (await card).message.roll;
    expect(roll?.title).toBe('Test Rzetelności');
    // Ranga 5 to szansa 4 na 10, plus 1 za rzetelny dowód.
    expect(roll?.outcome?.detail).toContain('szansa 5 na 10');
  });

  it('Pogłoski są rzutem MG i idą szeptem', async () => {
    const card = waitForRoll(gm, 'Pogłoski');
    expect(
      (
        await emitAck(gm, 'character:roll', {
          characterId: mediaId,
          request: { kind: 'rumour' },
          visibility: 'gm',
        })
      ).ok,
    ).toBe(true);
    const message = (await card).message;
    expect(message.kind).toBe('gmroll');
    expect(message.roll?.title).toBe('Pogłoski');
    expect(message.roll?.breakdown?.map((entry) => entry.label)).toEqual(['Wiarygodność 5']);
  });

  it('Moto dokłada się do Prowadzenia pojazdów', async () => {
    expect(
      // Poziom Umiejętności pisze od 29a MG albo płatny awans — nie łata gracza.
      (
        await emitAck(gm, 'character:update', {
          characterId: nomadId,
          patch: { data: { skills: { driving: 4 } } },
        })
      ).ok,
    ).toBe(true);
    const card = waitForRoll(player, 'Prowadzenie pojazdów');
    expect(
      (
        await emitAck(player, 'character:roll', {
          characterId: nomadId,
          request: { kind: 'skill', skillId: 'driving' },
          visibility: 'public',
        })
      ).ok,
    ).toBe(true);
    expect((await card).message.roll?.breakdown?.map((entry) => entry.label)).toContain('Moto 3');
  });
});
