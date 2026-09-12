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
  CpredCharacterData,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import { CPRED_ANTIBIOTIC_DAYS, CPRED_HOUR_S, CPRED_PHARMA_BATCH_COST } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Naturalne leczenie i farmaceutyki na żywych gniazdach (03.09).
 *
 * `recovery.test.ts` w `shared` liczy PW za dzień odpoczynku; tutaj sprawdzany
 * jest **szew**: że Ustabilizowanie otwiera proces także wtedy, gdy cel stoi na
 * nogach, że dzień odpoczynku bez tego otwarcia nie daje nic, że surowce znikają
 * z konta również po nieudanym Teście, i że dawka schodzi z ekwipunku podającego,
 * a skutek ląduje na karcie celu.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const PX_PER_M = 50;

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
    payload: { name: 'Rekonwalescencja' },
  });

  // Konto gracza doszło 05.09 razem z ostatnim testem tego pliku: cała reszta
  // jedzie z gniazda MG, a MG jest autorem każdej karty odpoczynku — więc
  // brak rodzaju `recovery` w `visibleTo` przechodził tu niezauważony przez
  // dwa etapy. Do tego błędu potrzebne są **dwie** pary oczu przy stole.
  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${(campaignRes.json() as { id: string }).id}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const join = await built.app.inject({
    method: 'POST',
    url: `/api/join/${(inviteRes.json() as { token: string }).token}`,
    payload: { name: 'Widz' },
  });
  playerCookie = cookieOf(join.headers['set-cookie']);
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

describe('naturalne leczenie i farmaceutyki', () => {
  let gm: ClientSocket;
  let sceneId: string;
  let medicId: string;
  let patientId: string;
  let medicTokenId: string;
  let patientTokenId: string;

  async function sync(): Promise<StateSyncPayload> {
    const next = waitFor<StateSyncPayload>(gm, 'state:sync', 4000);
    await emitAck(gm, 'state:request');
    return next;
  }

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const character = (await sync()).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  it('stawia stół: Medyk z Farmaceutykami i ranny pacjent', async () => {
    const conn = createSocket(gmCookie);
    gm = conn.socket;
    await conn.firstSync;

    medicId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Doktor' }),
      'character:create',
    ).id;
    patientId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Pacjent' }),
      'character:create',
    ).id;

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Klinika' }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:visibility', { sceneId, visibility: 'open' });
    await emitAck(gm, 'scene:activate', { sceneId });

    // Medyk rangi 3: trzy punkty do rozdzielenia, wszystkie w Farmaceutykach,
    // czyli dostęp do trzech pierwszych środków i Technologia Medyczna 3.
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: medicId,
          patch: {
            data: {
              roleId: 'medtech',
              roleAbilityRank: 3,
              medicine: { pharma: 3 },
              stats: {
                int: 5,
                ref: 5,
                dex: 5,
                tech: 8,
                cool: 5,
                will: 5,
                luck: 5,
                move: 5,
                body: 5,
                emp: 5,
              },
              skills: { paramedic: 10 },
            },
          },
        })
      ).ok,
    ).toBe(true);

    // Pacjent: BC 7 i SW 6 → 40 PW, obity do 10.
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: patientId,
          patch: {
            data: {
              stats: {
                int: 5,
                ref: 5,
                dex: 5,
                tech: 5,
                cool: 5,
                will: 6,
                luck: 5,
                move: 5,
                body: 7,
                emp: 5,
              },
              hpCurrent: 10,
            },
          },
        })
      ).ok,
    ).toBe(true);

    medicTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Doktor',
        x: 0,
        y: 0,
        characterId: medicId,
      }),
      'token:create',
    ).id;
    patientTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Pacjent',
        x: 1 * PX_PER_M,
        y: 0,
        characterId: patientId,
      }),
      'token:create',
    ).id;

    expect((await sheetOf(patientId)).recovery).toEqual({
      stabilized: false,
      antibioticDays: 0,
    });
  });

  it('dzień odpoczynku bez Ustabilizowania nie daje nic i mówi dlaczego', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ healed: number; refusal: string | null }>(gm, 'character:rest', {
        characterId: patientId,
      }),
      'character:rest',
    );
    expect(result).toMatchObject({ healed: 0, refusal: 'notStabilized' });
    const entry = (await card).message.recovery;
    expect(entry?.tone).toBe('warn');
    expect(entry?.note).toContain('Ustabilizowanie');
    expect((await sheetOf(patientId)).hpCurrent).toBe(10);
  });

  it('Ustabilizowanie stojącego pacjenta otwiera naturalne leczenie (s. 222)', async () => {
    // TECH 8 + Ratownictwo 10 to najniżej 19 przy PT 10 — poza Krytyczną
    // Porażką rzut nie ma prawa nie wyjść, a ta zdarza się raz na dziesięć.
    let opened = false;
    for (let attempt = 0; attempt < 8 && !opened; attempt += 1) {
      const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      const ack = await emitAck(gm, 'character:roll', {
        characterId: medicId,
        visibility: 'public',
        request: { kind: 'stabilize', stabilizeTokenId: patientTokenId, skillId: 'paramedic' },
      });
      expect(ack.ok).toBe(true);
      const outcome = (await card).message.roll?.outcome;
      if (outcome?.label === 'Ustabilizowany') {
        expect(outcome.detail).toContain('rusza naturalne leczenie');
        opened = true;
      }
    }
    expect(opened).toBe(true);
    expect((await sheetOf(patientId)).recovery.stabilized).toBe(true);
  });

  it('odmawia Ustabilizowania spoza zasięgu ramienia', async () => {
    await emitAck(gm, 'token:move', {
      tokenId: patientTokenId,
      x: 9 * PX_PER_M,
      y: 0,
      final: true,
    });
    const ack = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      visibility: 'public',
      request: { kind: 'stabilize', stabilizeTokenId: patientTokenId, skillId: 'paramedic' },
    });
    expect(ack).toMatchObject({ ok: false, error: 'STABILIZE_OUT_OF_REACH' });
    await emitAck(gm, 'token:move', {
      tokenId: patientTokenId,
      x: 1 * PX_PER_M,
      y: 0,
      final: true,
    });
  });

  it('dzień odpoczynku wraca BC punktów i pisze rozbicie na karcie', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ healed: number; hpCurrent: number }>(gm, 'character:rest', {
        characterId: patientId,
      }),
      'character:rest',
    );
    expect(result).toMatchObject({ healed: 7, hpCurrent: 17 });
    const entry = (await card).message.recovery;
    expect(entry?.hp).toBe(7);
    expect(entry?.lines?.[0]).toContain('Budowa Ciała 7');
    expect((await sheetOf(patientId)).hpCurrent).toBe(17);
  });

  it('nadwyrężenie zabiera Ustabilizowanie — trzeba je powtórzyć (s. 223)', async () => {
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ healed: number; refusal: string | null }>(gm, 'character:rest', {
        characterId: patientId,
        strained: true,
      }),
      'character:rest',
    );
    expect(result).toMatchObject({ healed: 0, refusal: 'strained' });
    expect((await card).message.recovery?.note).toContain('nadwyrężyła');
    expect((await sheetOf(patientId)).recovery.stabilized).toBe(false);
  });

  it('nie wytworzy środka, do którego Medyk nie ma dostępu', async () => {
    await emitAck(gm, 'economy:adjust', {
      characterId: medicId,
      balance: 1000,
      reason: 'Zaliczka',
    });
    const ack = await emitAck(gm, 'character:craft-pharma', {
      characterId: medicId,
      // Zryw jest piąty w tabeli, a Medyk ma trzy punkty Farmaceutyków.
      pharmaId: 'pharma.zryw',
    });
    expect(ack).toMatchObject({ ok: false, error: 'PHARMA_NOT_UNLOCKED' });
  });

  it('surowce znikają z konta także po nieudanym Teście (s. 150)', async () => {
    const before = (await sheetOf(medicId)).eddies;
    const result = data(
      await emitAck<{ doses: number; balance: number }>(gm, 'character:craft-pharma', {
        characterId: medicId,
        pharmaId: 'pharma.antybiotyk',
      }),
      'character:craft-pharma',
    );
    expect(result.balance).toBe(before - CPRED_PHARMA_BATCH_COST);
    // Zdany Test daje tyle dawek, ile wynosi Technologia Medyczna (tu 3).
    expect(result.doses === 0 || result.doses === 3).toBe(true);
  });

  it('udana partia kładzie dawki na wierszu ekwipunku z licznikiem', async () => {
    let doses = 0;
    for (let attempt = 0; attempt < 10 && doses === 0; attempt += 1) {
      await emitAck(gm, 'economy:adjust', {
        characterId: medicId,
        balance: 5000,
        reason: 'Zaliczka',
      });
      doses = data(
        await emitAck<{ doses: number }>(gm, 'character:craft-pharma', {
          characterId: medicId,
          pharmaId: 'pharma.antybiotyk',
        }),
        'character:craft-pharma',
      ).doses;
    }
    expect(doses).toBe(3);
    const row = (await sheetOf(medicId)).gear.find(
      (entry) => entry.consumable === 'pharma.antybiotyk',
    );
    expect(row?.name).toBe('Antybiotyk');
    expect(row?.qty).toBeGreaterThanOrEqual(3);
  });

  it('Antybiotyk ustawia tydzień i podnosi tempo dnia odpoczynku', async () => {
    const row = (await sheetOf(medicId)).gear.find((e) => e.consumable === 'pharma.antybiotyk')!;
    const qtyBefore = row.qty;
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ qtyLeft: number; healed: number }>(gm, 'character:use-dose', {
        characterId: medicId,
        gearRowId: row.id,
        targetTokenId: patientTokenId,
      }),
      'character:use-dose',
    );
    expect(result.qtyLeft).toBe(qtyBefore - 1);
    const entry = (await card).message.recovery;
    expect(entry?.title).toContain('Antybiotyk');
    // Pacjent jest po nadwyrężeniu, więc antybiotyk **czeka**: licznik siedmiu
    // dni siada na karcie, ale bez Ustabilizowania nie ma czego przyspieszać —
    // i karta ma to powiedzieć pomarańczowym, a nie zielonym.
    expect(entry?.tone).toBe('warn');
    expect(entry?.note).toContain('Ustabilizowanie');
    expect((await sheetOf(patientId)).recovery.antibioticDays).toBe(CPRED_ANTIBIOTIC_DAYS);
  });

  it('po powtórnym Ustabilizowaniu dzień odpoczynku daje BC + 2 z antybiotyku', async () => {
    let opened = false;
    for (let attempt = 0; attempt < 8 && !opened; attempt += 1) {
      const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
      await emitAck(gm, 'character:roll', {
        characterId: medicId,
        visibility: 'public',
        request: { kind: 'stabilize', stabilizeTokenId: patientTokenId, skillId: 'paramedic' },
      });
      if ((await card).message.roll?.outcome?.label === 'Ustabilizowany') opened = true;
    }
    expect(opened).toBe(true);

    const before = (await sheetOf(patientId)).hpCurrent;
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ healed: number }>(gm, 'character:rest', { characterId: patientId }),
      'character:rest',
    );
    expect(result.healed).toBe(9);
    expect((await card).message.recovery?.tone).toBe('success');
    expect((await sheetOf(patientId)).hpCurrent).toBe(before + 9);
    expect((await sheetOf(patientId)).recovery.antibioticDays).toBe(CPRED_ANTIBIOTIC_DAYS - 1);
  });

  it('Turbo uzdrawiacz leczy BC + SW od ręki', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await emitAck(gm, 'economy:adjust', {
        characterId: medicId,
        balance: 5000,
        reason: 'Zaliczka',
      });
      const made = data(
        await emitAck<{ doses: number }>(gm, 'character:craft-pharma', {
          characterId: medicId,
          pharmaId: 'pharma.turbo-uzdrawiacz',
        }),
        'character:craft-pharma',
      ).doses;
      if (made > 0) break;
    }
    // Obij pacjenta z powrotem, żeby było co leczyć.
    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { hpCurrent: 5 } },
    });
    const row = (await sheetOf(medicId)).gear.find(
      (e) => e.consumable === 'pharma.turbo-uzdrawiacz',
    )!;
    const result = data(
      await emitAck<{ healed: number }>(gm, 'character:use-dose', {
        characterId: medicId,
        gearRowId: row.id,
        targetTokenId: patientTokenId,
      }),
      'character:use-dose',
    );
    // BC 7 + SW 6 = 13.
    expect(result.healed).toBe(13);
    expect((await sheetOf(patientId)).hpCurrent).toBe(18);
  });

  it('dawka podana sobie też schodzi z ekwipunku (błąd z oględzin 03.09)', async () => {
    const before = (await sheetOf(medicId)).gear.find((e) => e.consumable === 'pharma.antybiotyk')!;
    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ qtyLeft: number }>(gm, 'character:use-dose', {
        characterId: medicId,
        gearRowId: before.id,
      }),
      'character:use-dose',
    );
    expect(result.qtyLeft).toBe(before.qty - 1);
    // Karta nie dopisuje „— od: Doktor", kiedy kłuje sam siebie.
    expect((await card).message.recovery?.title).toBe('Antybiotyk');
    // Sedno błędu: skutek środka zapisywał się na wersji karty sprzed zdjęcia
    // dawki, więc licznik wracał do stanu wyjściowego dopiero **w bazie**.
    const after = (await sheetOf(medicId)).gear.find((e) => e.consumable === 'pharma.antybiotyk')!;
    expect(after.qty).toBe(before.qty - 1);
    expect((await sheetOf(medicId)).recovery.antibioticDays).toBe(CPRED_ANTIBIOTIC_DAYS);
  });

  it('Stym zawiesza kary Poważnie Rannego na godzinę, a zegar świata je przywraca', async () => {
    // Medyk z trzema punktami nie sięga po Stym (czwarty w tabeli), więc dawki
    // wkłada do plecaka MG, jak łup. Podanie liczy się tak samo jak wytworzonej.
    const medic = await sheetOf(medicId);
    const stymRow = { id: 'stym-row', name: 'Stym', notes: '', qty: 2, consumable: 'pharma.stym' };
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: medicId,
          patch: { data: { gear: [...medic.gear, stymRow] } },
        })
      ).ok,
    ).toBe(true);
    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { hpCurrent: 10 } },
    });

    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const dose = data(
      await emitAck<{ qtyLeft: number }>(gm, 'character:use-dose', {
        characterId: medicId,
        gearRowId: stymRow.id,
        targetTokenId: patientTokenId,
      }),
      'character:use-dose',
    );
    expect(dose.qtyLeft).toBe(1);
    const entry = (await card).message.recovery;
    // Do 12.09.2026 karta mówiła pomarańczowym „zawiesza MG" i nic nie zapisywała.
    expect(entry?.tone).toBe('success');
    expect(entry?.note).toBe('Kary Poważnie Rannego zawieszone na godzinę.');
    const suspension = (await sheetOf(patientId)).woundSuspension;
    expect(suspension).toMatchObject({ source: 'Stym', durationS: CPRED_HOUR_S });
    expect(suspension?.expiresAtMinute).toBeGreaterThan(0);

    // Test pacjenta: kara i zawieszenie stoją obok siebie, suma bez −2.
    const rolled = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'character:roll', {
      characterId: patientId,
      visibility: 'public',
      request: { kind: 'stat', statId: 'cool' },
    });
    const breakdown = (await rolled).message.roll?.breakdown ?? [];
    expect(breakdown).toContainEqual({ label: 'Poważnie ranny', value: -2, kind: 'wound' });
    expect(breakdown).toContainEqual({ label: 'Stym', value: 2, kind: 'situational' });

    // Łatą karty nie wpisze ani nie zdejmie go nikt, także MG: zapis bez
    // terminu nie zszedłby nigdy, a zdejmuje się go guzikiem efektu.
    expect(
      await emitAck(gm, 'character:update', {
        characterId: patientId,
        patch: { data: { woundSuspension: null } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    const removed = data(
      await emitAck<{ removedSuspension?: { source: string } }>(gm, 'character:stat-effect', {
        characterId: patientId,
        effectId: suspension!.id,
      }),
      'character:stat-effect',
    );
    expect(removed.removedSuspension?.source).toBe('Stym');
    expect((await sheetOf(patientId)).woundSuspension).toBeNull();

    // Śmiertelnie Rannemu Stym nie zdejmuje −4, ale zapis zostaje — zadziała,
    // gdy Medyk wyciągnie go w ciągu godziny do Poważnie Rannego.
    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { hpCurrent: 0 } },
    });
    const mortalCard = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'character:use-dose', {
      characterId: medicId,
      gearRowId: stymRow.id,
      targetTokenId: patientTokenId,
    });
    const mortal = (await mortalCard).message.recovery;
    expect(mortal?.tone).toBe('warn');
    expect(mortal?.note).toContain('Śmiertelnie Ranny');
    expect((await sheetOf(patientId)).woundSuspension?.source).toBe('Stym');

    // Godzina świata zdejmuje zawieszenie tym samym przemiataniem co efekty na
    // Cechach, a wiersz „Efekty wygasły" wymienia je z nazwy.
    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { hpCurrent: 10 } },
    });
    const seen: ChatMessageBroadcast[] = [];
    const collect = (message: ChatMessageBroadcast) => seen.push(message);
    gm.on('chat:message', collect);
    await emitAck(gm, 'time:set', { step: 'hour' });
    gm.off('chat:message', collect);
    expect((await sheetOf(patientId)).woundSuspension).toBeNull();
    expect(
      seen.some((message) => JSON.stringify(message).includes('Stym (bez kar Poważnie Rannego)')),
    ).toBe(true);
  });

  it('PT Ustabilizowania statysty liczy się z wydrukowanych PW, nie z BC i SW', async () => {
    // Pacjent ma BC 7 i SW 6: z Cech 45 PW i próg 23. Wydruk mówi 20 PW, więc
    // przy 15 PW jest lekko ranny (PT 10) — do 12.09.2026 serwer liczył próg
    // z Cech i dawał PT 13, choć atak na tę samą figurę widział lekką ranę.
    expect(
      (
        await emitAck(gm, 'character:update', {
          characterId: patientId,
          patch: {
            data: {
              statBlock: { combatValue: null, weaponSkill: null, noBulletDodge: false, hpMax: 20 },
              hpCurrent: 15,
            },
          },
        })
      ).ok,
    ).toBe(true);

    const card = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'character:roll', {
      characterId: medicId,
      visibility: 'public',
      request: { kind: 'stabilize', stabilizeTokenId: patientTokenId, skillId: 'paramedic' },
    });
    expect((await card).message.roll?.outcome?.detail).toContain('vs PT 10');

    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { statBlock: null, hpCurrent: 10 } },
    });
  });

  it('odmawia zastrzyku spoza zasięgu ramienia', async () => {
    await emitAck(gm, 'token:move', {
      tokenId: patientTokenId,
      x: 9 * PX_PER_M,
      y: 0,
      final: true,
    });
    const row = (await sheetOf(medicId)).gear.find((e) => e.consumable === 'pharma.antybiotyk')!;
    const ack = await emitAck(gm, 'character:use-dose', {
      characterId: medicId,
      gearRowId: row.id,
      targetTokenId: patientTokenId,
    });
    expect(ack).toMatchObject({ ok: false, error: 'DOSE_OUT_OF_REACH' });
  });

  it('nie-Medyk nie poda dawki, choćby miał ją w plecaku', async () => {
    const row = (await sheetOf(medicId)).gear.find((e) => e.consumable === 'pharma.antybiotyk')!;
    // Ten sam wiersz, ta sama fiolka — znika wyłącznie Zdolność Specjalna.
    await emitAck(gm, 'character:update', {
      characterId: medicId,
      patch: { data: { roleId: 'solo', roleAbilityRank: 3, medicine: {} } },
    });
    const ack = await emitAck(gm, 'character:use-dose', {
      characterId: medicId,
      gearRowId: row.id,
    });
    expect(ack).toMatchObject({ ok: false, error: 'NOT_A_MEDIC' });
    expect(medicTokenId).toBeTruthy();
  });

  it('karta odpoczynku JEST publiczna — gracz widzi ją po przeładowaniu', async () => {
    // Regres znaleziony 05.09 przy etapie 37. `RecoveryLogEntry` od 30b mówi
    // wprost „karta jest **publiczna**", ale `visibleTo` w `chat-io.ts` jest
    // białą listą rodzajów i `recovery` na niej nie było — więc karta docierała
    // do stołu wyłącznie rozgłoszeniem na żywo i znikała przy pierwszym
    // przeładowaniu. Widział ją tylko autor, czyli tutaj zawsze MG; dlatego ten
    // jeden test patrzy oczami gracza, który przy niczym z tego pliku nie był.
    const watcher = createSocket(playerCookie);
    const sync = await watcher.firstSync;
    const cards = sync.messages.filter((m) => m.kind === 'recovery');
    expect(cards.length).toBeGreaterThan(0);
    // Kształt jest pełny, nie okrojony: karta świadomie nie niesie bezwzględnych
    // PW (`hp` to różnica), więc nie ma tu czego redagować.
    expect(cards.some((m) => m.recovery?.title === 'Dzień odpoczynku')).toBe(true);
    expect(cards.some((m) => (m.recovery?.hp ?? 0) > 0)).toBe(true);
  });
});
