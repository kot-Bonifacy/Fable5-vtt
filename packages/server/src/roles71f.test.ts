import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  CharacterView,
  ChatMessageBroadcast,
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import { GAME_TIME_DEFAULT, MINUTES_PER_DAY, gameWeekIndex } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Etap 71f — czas i zasoby narracyjne Ról (G27–G32, G39, P2) na żywych
 * gniazdach. Arytmetykę liczy `shared/.../rolenarrative.test.ts`; tu szew:
 * rzut dopisuje fanów i blokadę, serwer odmawia prośby do zamkniętej grupy
 * i nowych fanów w walce, publikacja trafia do rejestru, Pogłoski liczą się
 * w tygodniu zegara świata, a wezwanie Wsparcia zostawia ślad dla MG.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-roles71f-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
}

const PUBLIC_DIR = resolve(import.meta.dirname, '../../../data/public');
const PRIVATE_DIR = mkdtempSync(join(tmpdir(), 'vtt-roles71f-private-'));
const WEEK = 7 * MINUTES_PER_DAY;
/** Poniedziałek 10:00 pierwszego pełnego tygodnia po domyślnym starcie zegara. */
const MONDAY = (Math.floor(GAME_TIME_DEFAULT / WEEK) + 1) * WEEK + 4 * MINUTES_PER_DAY + 600;

/** Druga broń agentów federalnych (G31) — wymyślony wpis pod nazwą z tabeli Wsparcia. */
function writeFixtureCompendium(): void {
  const dir = join(PRIVATE_DIR, 'cpred', 'compendium');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'sample.json'),
    readFileSync(join(PUBLIC_DIR, 'cpred', 'compendium', 'sample.json'), 'utf8'),
  );
  writeFileSync(
    join(dir, 'backup.json'),
    JSON.stringify({
      schemaVersion: 1,
      source: 'test 71f — wymyślone',
      weaponTypes: [],
      entries: [
        {
          id: 'weapon.test-second',
          category: 'weapon',
          name: 'Bardzo ciężki pistolet',
          weaponTypeId: 'weapon-type.sample-rifle',
          quality: 'standard',
          cost: 50,
          costCategory: 'costly',
        },
      ],
    }),
  );
}

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
  dataPublicDir: PUBLIC_DIR,
  dataPrivateDir: PRIVATE_DIR,
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

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

function waitForRoll(socket: ClientSocket, title: string): Promise<ChatMessageBroadcast> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      socket.off('chat:message', listener);
      reject(new Error(`${title} timeout`));
    }, 4000);
    const listener = (payload: ChatMessageBroadcast) => {
      if (payload.message.roll?.title?.startsWith(title) !== true) return;
      clearTimeout(timer);
      socket.off('chat:message', listener);
      resolvePromise(payload);
    };
    socket.on('chat:message', listener);
  });
}

function collect<T>(socket: ClientSocket, event: string): T[] {
  const heard: T[] = [];
  socket.on(event, (payload: T) => heard.push(payload));
  return heard;
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

function errorOf(ack: SocketAck<unknown>): string | null {
  return ack.ok ? null : ack.error;
}

beforeAll(async () => {
  process.env.VTT_DICE_SCRIPT = DICE;
  scriptDice([]);
  writeFixtureCompendium();
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
    payload: { name: 'Trasa koncertowa' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Cyra'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  if (previousDiceScript === undefined) delete process.env.VTT_DICE_SCRIPT;
  else process.env.VTT_DICE_SCRIPT = previousDiceScript;
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('etap 71f: fani, Pogłoski, publikacje i licznik Wsparcia', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let rockerId: string;
  let mediaId: string;
  let lawmanId: string;
  let lawmanTokenId: string;
  let fanGroupId: string;

  async function sheetOf(characterId: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    const found = (await sync).characters.find((entry) => entry.id === characterId);
    if (!found) throw new Error('character missing from sync');
    return found.data as CpredCharacterData;
  }

  function charisma(socket: ClientSocket, request: Record<string, unknown>) {
    return emitAck<{ messageId: number }>(socket, 'character:roll', {
      characterId: rockerId,
      request: { kind: 'charisma', ...request },
      visibility: 'public',
    });
  }

  function publish(socket: ClientSocket, request: Record<string, unknown>) {
    return emitAck<{ messageId: number }>(socket, 'character:roll', {
      characterId: mediaId,
      request: { kind: 'reliability', reliabilityProof: 'none', ...request },
      visibility: 'public',
    });
  }

  it('stawia stół: Rocker, Media i Stróż Prawa w poniedziałek rano', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);
    expect((await emitAck(gm, 'time:set', { minutes: MONDAY })).ok).toBe(true);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Klub', width: 2000, height: 2000 }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(player, 'scene:view', { sceneId });

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
    rockerId = await make('Nyx', 'rockerboy', 4);
    mediaId = await make('Wren', 'media', 5);
    lawmanId = await make('Slack', 'lawman', 10);
    lawmanTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Slack',
        x: 500,
        y: 500,
        characterId: lawmanId,
        ownerId: playerId,
      }),
      'token:create',
    ).id;
  });

  it('G27 prośba bez grupy fanów nie dochodzi do kości', async () => {
    expect(
      errorOf(await charisma(player, { charismaAudience: 'single', charismaPurpose: 'favour' })),
    ).toBe('NO_FAN_GROUP');
  });

  it('G27 fanów nie da się dopisać łatą karty ani zdarzeniem gracza', async () => {
    const forged = { fans: [{ id: 'x', name: 'Tłum', audience: 'large' }] };
    for (const socket of [player, gm]) {
      expect(
        errorOf(
          await emitAck(socket, 'character:update', {
            characterId: rockerId,
            patch: { data: forged },
          }),
        ),
      ).toBe('FORBIDDEN');
    }
    expect(
      errorOf(
        await emitAck(player, 'character:fans', {
          characterId: rockerId,
          action: 'add',
          name: 'Tłum',
          audience: 'large',
        }),
      ),
    ).toBe('FORBIDDEN');
    expect((await sheetOf(rockerId)).fans).toEqual([]);
  });

  it('G27 udany Test „nowi fani” dopisuje grupę na kartę', async () => {
    scriptDice([9]);
    const card = waitForRoll(player, 'Efekt Charyzmy');
    expect(
      (
        await charisma(player, {
          charismaAudience: 'single',
          charismaPurpose: 'fans',
          charismaNote: 'Barman z Totemu',
        })
      ).ok,
    ).toBe(true);
    const roll = (await card).message.roll;
    expect(roll?.outcome?.success).toBe(true);
    expect(roll?.outcome?.detail).toContain('na karcie: „Barman z Totemu”');
    const fans = (await sheetOf(rockerId)).fans;
    expect(fans).toMatchObject([{ name: 'Barman z Totemu', audience: 'single' }]);
    fanGroupId = fans[0]!.id;
  });

  it('G27 nieudana prośba zamyka grupę na 7 dni kalendarza świata', async () => {
    // Dwójka, nie jedynka: naturalna 1 ciągnie z kolejki drugą kość.
    scriptDice([2]);
    const card = waitForRoll(player, 'Efekt Charyzmy');
    expect(
      (
        await charisma(player, {
          charismaAudience: 'single',
          charismaPurpose: 'favour',
          charismaFanGroupId: fanGroupId,
          charismaNote: 'nocleg',
        })
      ).ok,
    ).toBe(true);
    const roll = (await card).message.roll;
    expect(roll?.title).toBe('Efekt Charyzmy: przysługa — Barman z Totemu');
    expect(roll?.outcome?.success).toBe(false);
    expect(roll?.outcome?.detail).toContain('przez 7 dni (do ');
    expect((await sheetOf(rockerId)).fans[0]).toMatchObject({
      blockedUntilMinute: MONDAY + WEEK,
      blockedWhat: 'nocleg',
    });
    // Druga prośba do tych samych fanów — odmowa przed kośćmi, także dla MG.
    for (const socket of [player, gm]) {
      expect(
        errorOf(
          await charisma(socket, {
            charismaAudience: 'single',
            charismaPurpose: 'favour',
            charismaFanGroupId: fanGroupId,
          }),
        ),
      ).toBe('FANS_REFUSED');
    }
  });

  it('G27 blokadę zdejmuje MG, nie gracz; po tygodniu schodzi sama', async () => {
    const unblock = { characterId: rockerId, action: 'unblock', groupId: fanGroupId };
    expect(errorOf(await emitAck(player, 'character:fans', unblock))).toBe('FORBIDDEN');
    // Tydzień później prośba przechodzi bez ręki MG.
    expect((await emitAck(gm, 'time:set', { minutes: MONDAY + WEEK })).ok).toBe(true);
    scriptDice([2]);
    expect(
      (
        await charisma(player, {
          charismaAudience: 'single',
          charismaPurpose: 'favour',
          charismaFanGroupId: fanGroupId,
        })
      ).ok,
    ).toBe(true);
    // Znów odmówili — tym razem blokadę zdejmuje MG.
    expect((await sheetOf(rockerId)).fans[0]!.blockedUntilMinute).toBe(MONDAY + 2 * WEEK);
    expect((await emitAck(gm, 'character:fans', unblock)).ok).toBe(true);
    expect((await sheetOf(rockerId)).fans[0]).toEqual({
      id: fanGroupId,
      name: 'Barman z Totemu',
      audience: 'single',
    });
    // Właściciel może zmienić nazwę grupy, usunąć jej nie może.
    expect(
      (
        await emitAck(player, 'character:fans', {
          characterId: rockerId,
          action: 'rename',
          groupId: fanGroupId,
          name: 'Barman',
        })
      ).ok,
    ).toBe(true);
    expect(
      errorOf(
        await emitAck(player, 'character:fans', {
          characterId: rockerId,
          action: 'remove',
          groupId: fanGroupId,
        }),
      ),
    ).toBe('FORBIDDEN');
    expect((await sheetOf(rockerId)).fans[0]!.name).toBe('Barman');
  });

  it('P2 nowych fanów nie robi się w walce — odmowa serwera', async () => {
    expect((await emitAck(gm, 'combat:start', { sceneId, tokenIds: [lawmanTokenId] })).ok).toBe(
      true,
    );
    expect(
      errorOf(await charisma(player, { charismaAudience: 'small', charismaPurpose: 'fans' })),
    ).toBe('FANS_IN_COMBAT');
    expect((await emitAck(gm, 'combat:end', undefined)).ok).toBe(true);
    expect((await sheetOf(rockerId)).fans).toHaveLength(1);
  });

  it('G30 publikacja potrzebuje tematu i trafia do rejestru', async () => {
    expect(errorOf(await publish(player, {}))).toBe('NO_TOPIC');
    scriptDice([1]);
    const card = waitForRoll(player, 'Test Rzetelności');
    expect((await publish(player, { reliabilityTopic: 'Przekręt w ratuszu' })).ok).toBe(true);
    expect((await card).message.roll?.outcome?.success).toBe(true);
    expect((await sheetOf(mediaId)).publications).toMatchObject([
      { topic: 'Przekręt w ratuszu', atMinute: MONDAY + WEEK, proof: 'none', believed: true },
    ]);
  });

  it('G30 ten sam temat wraca tylko z nowymi informacjami; wpis usuwa MG', async () => {
    expect(errorOf(await publish(player, { reliabilityTopic: ' przekręt w  ratuszu ' }))).toBe(
      'ALREADY_PUBLISHED',
    );
    scriptDice([10]);
    expect(
      (
        await publish(player, {
          reliabilityTopic: 'Przekręt w ratuszu',
          reliabilityNewInfo: true,
        })
      ).ok,
    ).toBe(true);
    const list = (await sheetOf(mediaId)).publications;
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ believed: false, again: true });
    // Rejestru nie dopisze łata karty; wpis usuwa tylko MG.
    expect(
      errorOf(
        await emitAck(gm, 'character:update', {
          characterId: mediaId,
          patch: { data: { publications: [] } },
        }),
      ),
    ).toBe('FORBIDDEN');
    const remove = { characterId: mediaId, publicationId: list[1]!.id, action: 'remove' };
    expect((await emitAck(player, 'character:publication', remove)).ok).toBe(false);
    expect((await emitAck(gm, 'character:publication', remove)).ok).toBe(true);
    expect((await sheetOf(mediaId)).publications).toHaveLength(1);
    expect(errorOf(await emitAck(gm, 'character:publication', remove))).toBe(
      'PUBLICATION_NOT_FOUND',
    );
  });

  it('G28 G39 Pogłoski liczą się w tygodniu, a karta pisze ostrą nierówność', async () => {
    scriptDice([9]);
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
    const detail = (await card).message.roll?.outcome?.detail ?? '';
    // Wiarygodność 5 + 9 = 14 przebija najwyższy próg 13.
    expect(detail).toContain('14 > 13');
    expect(detail).not.toContain('≥');
    expect(detail).toContain('rzut 1 z 2 w tym tygodniu');
    expect((await sheetOf(mediaId)).rumourWeek).toEqual({
      week: gameWeekIndex(MONDAY + WEEK),
      rolls: 1,
    });
  });

  it('G28 tydzień bez dwóch rzutów zostawia MG przypomnienie — tylko jemu', async () => {
    const gmHeard = collect<ChatMessageBroadcast>(gm, 'chat:message');
    const playerHeard = collect<ChatMessageBroadcast>(player, 'chat:message');
    expect((await emitAck(gm, 'time:set', { minutes: MONDAY + 2 * WEEK })).ok).toBe(true);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    const reminder = (row: ChatMessageBroadcast) =>
      row.message.text.includes('minął tydzień z 1 z 2 rzutów Pogłosek');
    expect(gmHeard.filter(reminder)).toHaveLength(1);
    expect(gmHeard.find(reminder)?.message.text).toContain('Wren');
    expect(playerHeard.some(reminder)).toBe(false);
    expect((await sheetOf(mediaId)).rumourWeek).toEqual({
      week: gameWeekIndex(MONDAY + 2 * WEEK),
      rolls: 0,
    });
    // Rocker i Stróż Prawa nie mają Wiarygodności — licznika nie dostają.
    expect((await sheetOf(rockerId)).rumourWeek).toBeNull();
  });

  it('G31 G32 wezwanie zostawia ślad na karcie, a agent ma drugą broń', async () => {
    const called = data(
      await emitAck<{ answered: boolean }>(player, 'character:backup-call', {
        characterId: lawmanId,
        level: 10,
        tokenId: lawmanTokenId,
      }),
      'character:backup-call',
    );
    expect(called.answered).toBe(true);
    expect((await sheetOf(lawmanId)).backupCalls).toEqual([MONDAY + 2 * WEEK]);
    // Licznika nie przestawi łata karty.
    expect(
      errorOf(
        await emitAck(player, 'character:update', {
          characterId: lawmanId,
          patch: { data: { backupCalls: [] } },
        }),
      ),
    ).toBe('FORBIDDEN');

    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    const state = await sync;
    const agent = state.tokens.find((token) => token.name.startsWith('Agent federalny'));
    expect(agent).toBeTruthy();
    const card = state.characters.find((entry) => entry.id === agent!.characterId);
    const weapons = (card!.data as CpredCharacterData).weapons;
    // Pierwsza („Karabin szturmowy”) nie ma wpisu w próbce — zostaje nazwą;
    // druga znaleziona po nazwie niesie wpis Kompendium i jego magazynek.
    expect(weapons.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Karabin szturmowy', 'Bardzo ciężki pistolet']),
    );
    expect(weapons.find((row) => row.name === 'Bardzo ciężki pistolet')).toMatchObject({
      compendiumId: 'weapon.test-second',
      damage: '5k6',
      ammoMax: 25,
    });
  });
});
