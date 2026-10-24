import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ChatMessageBroadcast,
  CharacterView,
  CompendiumEntry,
  CpredCharacterData,
  CpredGearRow,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import { cpredEffectiveStats } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';

/**
 * Narkotyki, alkohol i trucizna na ostrzu na żywych gniazdach (etap 59b/59c).
 *
 * `drugs.test.ts` w `shared` liczy Cechy i terminy; tutaj sprawdzany jest
 * **szew**: zażycie bez bramki Medyka, prywatność kart (decyzja MG z 24.10 —
 * właściciel i MG, nikt więcej), wydłużenie drugą dawką, Człowieczeństwo
 * Czarnej szprycy, rzut na uzależnienie przy skoku zegara, zatrute ostrze,
 * Dynadetoks i ręka MG.
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
let strangerCookie: string;
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 5000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok || ack.data === undefined) throw new Error(`${what} failed: ${JSON.stringify(ack)}`);
  return ack.data;
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

/** Zbiera wiersze czatu, które dotarły do gniazda w trakcie `run`. */
async function collect(socket: ClientSocket, run: () => Promise<unknown>) {
  const seen: ChatMessageBroadcast[] = [];
  const grab = (message: ChatMessageBroadcast) => seen.push(message);
  socket.on('chat:message', grab);
  await run();
  // Karty po zapisie idą osobnymi `emit` — dajemy im chwilę na dojście.
  await new Promise((done) => setTimeout(done, 150));
  socket.off('chat:message', grab);
  return seen;
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
    payload: { name: 'Chemia' },
  });
  const campaignId = (campaignRes.json() as { id: string }).id;

  const join = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Ćpun'),
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
  playerId = (join.json() as { user: { id: string } }).user.id;
  const stranger = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Obcy'),
  });
  strangerCookie = cookieOf(stranger.headers['set-cookie']);
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

describe('narkotyki, alkohol i trucizna na ostrzu (etap 59b/59c)', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let stranger: ClientSocket;
  let junkieId: string;
  let medicId: string;
  let knifeEntryId: string;

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const next = new Promise<StateSyncPayload>((done) => gm.once('state:sync', done));
    await emitAck(gm, 'state:request');
    const character = (await next).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  function row(name: string, qty: number, extra: Partial<CpredGearRow> = {}): CpredGearRow {
    return { id: name.slice(0, 6).replace(/\W/g, 'x') + qty, name, notes: '', qty, ...extra };
  }

  it('stawia stół: postać gracza z narkotykami i Medyk MG', async () => {
    const conn = createSocket(gmCookie);
    gm = conn.socket;
    await conn.firstSync;
    const playerConn = createSocket(playerCookie);
    player = playerConn.socket;
    await playerConn.firstSync;
    const strangerConn = createSocket(strangerCookie);
    stranger = strangerConn.socket;
    await strangerConn.firstSync;

    knifeEntryId = data(
      await emitAck<CompendiumEntry>(gm, 'compendium:upsert', {
        entry: {
          category: 'weapon',
          name: 'Nóż testowy',
          weaponTypeId: 'weapon-type.sample-blade',
          damage: '1k6',
          quality: 'standard',
          cost: 50,
          costCategory: 'costly',
        },
      }),
      'compendium:upsert',
    ).id;

    const junkie = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Skok', ownerId: playerId }),
      'character:create',
    );
    junkieId = junkie.id;
    const base = junkie.data as CpredCharacterData;
    expect(
      await emitAck(gm, 'character:update', {
        characterId: junkieId,
        patch: {
          data: {
            stats: { ...base.stats, int: 8, ref: 8, will: 4, emp: 6 },
            humanityCurrent: 60,
            gear: [
              // Bez `consumable` — tak wiersz przychodzi z półki handlarza.
              row('Dopalacz', 3, { compendiumId: 'gear.dopalacz' }),
              row('Czarna szpryca', 1),
              row('Alkohol', 4),
              row('Fiolka trucizny', 1, { compendiumId: 'gear.fiolka-trucizny' }),
            ],
            weapons: [
              {
                id: 'knife',
                name: 'Nóż testowy',
                notes: '',
                compendiumId: knifeEntryId,
                damage: '1k6',
                ammoCurrent: 0,
                ammoMax: 0,
                ammoType: '',
                rof: '2',
              },
              {
                id: 'claw',
                name: 'Szpon',
                notes: '',
                compendiumId: 'weapon.szpon',
                damage: '3k6',
                ammoCurrent: 0,
                ammoMax: 0,
                ammoType: '',
                rof: '2',
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ok: true });

    medicId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Doktor' }),
      'character:create',
    ).id;
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: medicId,
          patch: {
            data: {
              roleId: 'medtech',
              roleAbilityRank: 2,
              medicine: { pharma: 2 },
              gear: [row('Dopalacz', 1), row('Dynadetoks', 1, { consumable: 'pharma.dynadetoks' })],
            },
          },
        })
      ).ok,
    ).toBe(true);
  });

  it('gracz bez Medyka zażywa Dopalacz; kartę widzi on i MG, obcy nie', async () => {
    const dopalacz = (await sheetOf(junkieId)).gear.find((g) => g.name === 'Dopalacz')!;
    let gmCards: ChatMessageBroadcast[] = [];
    let strangerCards: ChatMessageBroadcast[] = [];
    const playerCards = await collect(player, async () => {
      strangerCards = await collect(stranger, async () => {
        gmCards = await collect(gm, async () => {
          const ack = data(
            await emitAck<{ qtyLeft: number }>(player, 'character:use-dose', {
              characterId: junkieId,
              gearRowId: dopalacz.id,
            }),
            'character:use-dose',
          );
          expect(ack.qtyLeft).toBe(2);
        });
      });
    });
    const card = playerCards.find((m) => m.message.kind === 'gmrecovery');
    expect(card?.message.recovery?.title).toBe('Dopalacz');
    expect(gmCards.some((m) => m.message.kind === 'gmrecovery')).toBe(true);
    expect(strangerCards.some((m) => JSON.stringify(m).includes('Dopalacz'))).toBe(false);

    const sheet = await sheetOf(junkieId);
    expect(sheet.chems.doses).toHaveLength(1);
    expect(cpredEffectiveStats(sheet).int).toBe(10);
    // Pule bez zmian (umowa etapu 39).
    expect(sheet.stats.int).toBe(8);

    // Obcy nie dostaje karty także w historii.
    const fresh = createSocket(strangerCookie);
    const history = (await fresh.firstSync).messages;
    expect(history.some((m) => m.kind === 'gmrecovery')).toBe(false);
    fresh.socket.disconnect();
  });

  it('druga dawka wydłuża o dobę zamiast dokładać INT', async () => {
    const before = (await sheetOf(junkieId)).chems.doses[0]!;
    const dopalacz = (await sheetOf(junkieId)).gear.find((g) => g.name === 'Dopalacz')!;
    data(
      await emitAck(player, 'character:use-dose', {
        characterId: junkieId,
        gearRowId: dopalacz.id,
      }),
      'character:use-dose',
    );
    const sheet = await sheetOf(junkieId);
    expect(sheet.chems.doses).toHaveLength(1);
    expect(sheet.chems.doses[0]!.expiresAtMinute).toBe(before.expiresAtMinute! + 24 * 60);
    expect(cpredEffectiveStats(sheet).int).toBe(10);
  });

  it('łatą karty chemii nie wpisze nikt, także MG', async () => {
    expect(
      await emitAck(gm, 'character:update', {
        characterId: junkieId,
        patch: { data: { chems: { doses: [], addictions: [], lastTaken: {}, coatings: [] } } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('Czarna szpryca zabiera Człowieczeństwo na dawce', async () => {
    const before = await sheetOf(junkieId);
    const lace = before.gear.find((g) => g.name === 'Czarna szpryca')!;
    data(
      await emitAck(player, 'character:use-dose', { characterId: junkieId, gearRowId: lace.id }),
      'character:use-dose',
    );
    const sheet = await sheetOf(junkieId);
    const dose = sheet.chems.doses.find((d) => d.source === 'Czarna szpryca')!;
    expect(dose.humanityLost).toBeGreaterThanOrEqual(2);
    expect(dose.humanityLost).toBeLessThanOrEqual(12);
    expect(sheet.humanityCurrent).toBe(before.humanityCurrent - dose.humanityLost!);
  });

  it('alkohol: trzy dawki działają osobno', async () => {
    for (let index = 0; index < 3; index += 1) {
      const beer = (await sheetOf(junkieId)).gear.find((g) => g.name === 'Alkohol')!;
      data(
        await emitAck(player, 'character:use-dose', { characterId: junkieId, gearRowId: beer.id }),
        'character:use-dose',
      );
    }
    const sheet = await sheetOf(junkieId);
    expect(sheet.chems.doses.filter((d) => d.source === 'Alkohol')).toHaveLength(3);
    expect(cpredEffectiveStats(sheet).ref).toBe(5);
    expect(cpredEffectiveStats(sheet).will).toBe(7);
  });

  it('trucizna na lekkie ostrze tak, na Szpon (3k6) nie', async () => {
    const vial = (await sheetOf(junkieId)).gear.find((g) => g.name === 'Fiolka trucizny')!;
    expect(
      await emitAck(player, 'character:coat-weapon', {
        characterId: junkieId,
        gearRowId: vial.id,
        weaponRowId: 'claw',
      }),
    ).toMatchObject({ ok: false, error: 'NOT_A_LIGHT_BLADE' });
    data(
      await emitAck(player, 'character:coat-weapon', {
        characterId: junkieId,
        gearRowId: vial.id,
        weaponRowId: 'knife',
      }),
      'character:coat-weapon',
    );
    const sheet = await sheetOf(junkieId);
    expect(sheet.chems.coatings).toMatchObject([
      { weaponRowId: 'knife', toxinId: 'toxin.trucizna' },
    ]);
    expect(sheet.gear.find((g) => g.id === vial.id)?.qty).toBe(0);
  });

  it('cios zatrutym nożem to Test Odporności zamiast obrażeń', async () => {
    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek' }),
      'scene:create',
    );
    await emitAck(gm, 'scene:visibility', { sceneId: scene.id, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId: scene.id });
    const attackerTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Skok',
        x: 0,
        y: 0,
        characterId: junkieId,
        ownerId: playerId,
      }),
      'token:create',
    ).id;
    // Figura bez karty: broni się Codziennym PT 13, więc nóż trafia często.
    const targetTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId: scene.id,
        name: 'Ganger',
        x: 50,
        y: 0,
      }),
      'token:create',
    ).id;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = await emitAck(player, 'attack:roll', {
        characterId: junkieId,
        targetTokenId,
        attackerTokenId,
        request: { weaponRowId: 'knife', mode: 'single', modifier: 10 },
      });
      expect(ack.ok).toBe(true);
      const card = (await message).message.roll?.attack as unknown as
        | { hit?: boolean; detail: string; damageNotation?: string; forcedChecks?: unknown[] }
        | undefined;
      expect(card?.detail).toContain('PT 13');
      if (!card?.hit) continue;
      expect(card.damageNotation).toBeUndefined();
      expect(card.forcedChecks).toHaveLength(1);
      return;
    }
    throw new Error('nóż nie trafił ani razu w dwudziestu ciosach');
  });

  it('skok zegara kończy dawki, rzuca na uzależnienie prywatnie i zgadza się z kartą', async () => {
    let strangerCards: ChatMessageBroadcast[] = [];
    const playerCards = await collect(player, async () => {
      strangerCards = await collect(stranger, async () => {
        await emitAck(gm, 'time:set', { step: 'day' });
        await emitAck(gm, 'time:set', { step: 'day' });
      });
    });
    const rolls = playerCards.filter((m) => m.message.kind === 'gmroll');
    const titles = rolls.map((m) => m.message.roll?.title);
    expect(titles).toContain('Uzależnienie: Dopalacz');
    expect(titles).toContain('Uzależnienie: Czarna szpryca');
    expect(
      playerCards.some(
        (m) => m.message.kind === 'gmrecovery' && m.message.recovery?.title === 'Koniec działania',
      ),
    ).toBe(true);
    expect(strangerCards.some((m) => JSON.stringify(m).includes('Dopalacz'))).toBe(false);
    expect(strangerCards.some((m) => m.message.kind === 'gmroll')).toBe(false);

    const sheet = await sheetOf(junkieId);
    expect(sheet.chems.doses).toEqual([]);
    expect(sheet.chems.coatings).toEqual([]);
    const boost = rolls.find((m) => m.message.roll?.title === 'Uzależnienie: Dopalacz')!;
    expect(sheet.chems.addictions.includes('drug.dopalacz')).toBe(
      boost.message.roll?.outcome?.success !== true,
    );
    const lace = rolls.find((m) => m.message.roll?.title === 'Uzależnienie: Czarna szpryca')!;
    if (lace.message.roll?.outcome?.success) expect(sheet.humanityCurrent).toBe(60);
    else expect(sheet.humanityCurrent).toBeLessThan(60);
  });

  it('MG prowadzi terapię i dopisuje uzależnienie; gracz nie', async () => {
    expect(
      (
        await emitAck(player, 'character:chems', {
          characterId: junkieId,
          addAddiction: 'drug.syntkoka',
        })
      ).ok,
    ).toBe(false);
    // Czarna szpryca mogła już uzależnić (rzut wyżej) — liczymy różnicę.
    const refBefore = cpredEffectiveStats(await sheetOf(junkieId)).ref;
    data(
      await emitAck(gm, 'character:chems', {
        characterId: junkieId,
        addAddiction: 'drug.syntkoka',
      }),
      'character:chems',
    );
    let sheet = await sheetOf(junkieId);
    expect(sheet.chems.addictions).toContain('drug.syntkoka');
    // Syntkoka bez dawki: REF −2.
    expect(cpredEffectiveStats(sheet).ref).toBe(refBefore - 2);
    data(
      await emitAck(gm, 'character:chems', {
        characterId: junkieId,
        removeAddiction: 'drug.syntkoka',
      }),
      'character:chems',
    );
    sheet = await sheetOf(junkieId);
    expect(sheet.chems.addictions).not.toContain('drug.syntkoka');
  });

  it('Dynadetoks zdejmuje narkotyk bez rzutu na uzależnienie', async () => {
    const medic = await sheetOf(medicId);
    const boost = medic.gear.find((g) => g.name === 'Dopalacz')!;
    const detox = medic.gear.find((g) => g.name === 'Dynadetoks')!;
    data(
      await emitAck(gm, 'character:use-dose', { characterId: medicId, gearRowId: boost.id }),
      'character:use-dose',
    );
    expect((await sheetOf(medicId)).chems.doses).toHaveLength(1);
    const cards = await collect(gm, async () => {
      data(
        await emitAck(gm, 'character:use-dose', { characterId: medicId, gearRowId: detox.id }),
        'character:use-dose',
      );
    });
    expect((await sheetOf(medicId)).chems.doses).toEqual([]);
    expect(cards.some((m) => m.message.recovery?.note?.includes('Zeszło: Dopalacz'))).toBe(true);
    expect(cards.some((m) => m.message.kind === 'gmroll')).toBe(false);
  });
});
