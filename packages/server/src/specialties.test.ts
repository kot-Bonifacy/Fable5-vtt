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
  CpredCharacterData,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Medycyna i Twórca na żywych gniazdach (etap 30b).
 *
 * `specialties.test.ts` i `treatment.test.ts` w `shared` liczą sakiewki i czytają
 * zdania z tabeli ran; tutaj sprawdzany jest **szew**: że łata karty nie
 * przepuści przydziału większego niż poziom Zdolności, że Chirurgia zdejmuje
 * ranę, której Ratownictwo nie tknie, i że Prowizorka nie wydarzy się bez
 * punktu w Naprawie.
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
    payload: { name: 'Klinika' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const invite = (inviteRes.json() as InvitationSummary).token;
  await built.app.inject({
    method: 'POST',
    url: `/api/join/${invite}`,
    payload: { name: 'Gracz' },
  });
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

describe('Specjalizacje Medycyny i Twórcy na karcie', () => {
  let gm: ClientSocket;
  let sceneId: string;
  let medicId: string;
  let techId: string;
  let patientId: string;
  let patientTokenId: string;

  async function sync(): Promise<StateSyncPayload> {
    const next = new Promise<StateSyncPayload>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
      gm.once('state:sync', (payload: StateSyncPayload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    await emitAck(gm, 'state:request');
    return next;
  }

  async function sheetOf(id: string): Promise<CpredCharacterData> {
    const character = (await sync()).characters.find((c) => c.id === id);
    if (!character) throw new Error('character missing from sync');
    return character.data as CpredCharacterData;
  }

  /** „Odcięta ręka" — Chirurgia PT 17 i żadnej innej drogi (s. 187). */
  const severedArm = {
    id: 'injury.body-odcieta-reka',
    name: 'Odcięta ręka',
    effect: 'Ręka zostaje odseparowana od ciała.',
    quickFix: 'Nd.',
    treatment: 'Chirurgia PT 17',
  };
  /** „Złamane żebra" — Ratownictwo PT 15 albo Chirurgia PT 13. */
  const brokenRibs = {
    id: 'injury.body-zlamane-zebra',
    name: 'Złamane żebra',
    effect: 'Otrzymujesz status Poważnie Ranny.',
    quickFix: 'Ratownictwo medyczne PT 13',
    treatment: 'Ratownictwo medyczne PT 15 lub Chirurgia PT 13',
  };

  it('stawia stół: Medyk, Technik i pacjent z dwiema ranami', async () => {
    const conn = createSocket(gmCookie);
    gm = conn.socket;
    await conn.firstSync;

    medicId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Doktor' }),
      'character:create',
    ).id;
    techId = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Technik' }),
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

    patientTokenId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Pacjent',
        x: 0,
        y: 0,
        characterId: patientId,
      }),
      'token:create',
    ).id;

    const assigned = await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { criticalInjuries: [severedArm, brokenRibs] } },
    });
    expect(assigned.ok).toBe(true);
    // Zdania o leczeniu jadą z wierszem rany, tak jak reszta jej skutków.
    expect((await sheetOf(patientId)).criticalInjuries[0]!.treatment).toBe('Chirurgia PT 17');
  });

  it('łata karty odmawia przydziału większego niż poziom Zdolności', async () => {
    const tooMuch = await emitAck(gm, 'character:update', {
      characterId: techId,
      patch: { data: { roleId: 'tech', roleAbilityRank: 1, fabrication: { repair: 2 } } },
    });
    // Poziom 1 Twórcy to dwa punkty, ale najwyżej po jednym na Specjalizację.
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.ok === false && tooMuch.error).toBe('SPECIALTY_CAP');
  });

  it('awans i wydanie nowych punktów mieszczą się w jednej łacie', async () => {
    const ok = await emitAck(gm, 'character:update', {
      characterId: techId,
      patch: {
        data: { roleId: 'tech', roleAbilityRank: 2, fabrication: { repair: 2, upgrade: 2 } },
      },
    });
    expect(ok.ok).toBe(true);
    expect((await sheetOf(techId)).fabrication).toEqual({ repair: 2, upgrade: 2 });
  });

  it('Ratownik bez Medycyny nie tknie rany wymagającej Chirurgii', async () => {
    await emitAck(gm, 'character:update', {
      characterId: medicId,
      patch: { data: { roleId: 'solo', roleAbilityRank: 4, skills: { paramedic: 8 } } },
    });
    const ack = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: patientTokenId,
        treatInjuryId: severedArm.id,
        treatSkillId: 'medicine.surgery',
      },
      visibility: 'public',
    });
    expect(ack.ok).toBe(false);
    expect(ack.ok === false && ack.error).toBe('NO_SURGERY');
    // A gałąź, której ta rana nie oferuje, jest odrzucana zanim spadnie kość.
    const wrongBranch = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: patientTokenId,
        treatInjuryId: severedArm.id,
        treatSkillId: 'paramedic',
      },
      visibility: 'public',
    });
    expect(wrongBranch.ok === false && wrongBranch.error).toBe('NO_TREATMENT');
  });

  /**
   * Rzut, który ma się **udać** — powtarzany, dopóki rana nie zejdzie.
   *
   * Bez tego plik migotał mniej więcej co dziesiąty przebieg i zabierał ze sobą
   * dwa następne testy (znalezione 31.08). Powód nie jest błędem kodu, tylko
   * regułą: naturalna 1 odejmuje 1k10 (s. 165), więc nawet TECH 8 + Chirurgia 10
   * schodzi wtedy do 9–18 i przegrywa z PT 17. Żadnego modyfikatora, który
   * przebiłby fumble, na karcie postaci nie da się zbudować — sufit Chirurgii
   * to 10, a Cechy 10 — więc jedyną uczciwą odpowiedzią jest rzucić drugi raz,
   * tak jak zrobiłby to Medyk przy stole.
   */
  async function treatUntilHealed(request: Record<string, unknown>): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ack = await emitAck(gm, 'character:roll', {
        characterId: medicId,
        request,
        visibility: 'public',
      });
      expect(ack.ok).toBe(true);
      const still = (await sheetOf(patientId)).criticalInjuries.some(
        (row) => row.id === request.treatInjuryId,
      );
      if (!still) return;
    }
    throw new Error('osiem rzutów Chirurgią z rzędu nie zdjęło rany — to już nie jest pech');
  }

  it('Medyk z Chirurgią rzuca, a udany rzut zdejmuje ranę z karty', async () => {
    await emitAck(gm, 'character:update', {
      characterId: medicId,
      patch: {
        data: {
          roleId: 'medtech',
          roleAbilityRank: 5,
          medicine: { surgery: 5 },
          // TECH 8 + Chirurgia 10 przebija PT 17 na każdej kości.
          stats: { ...(await sheetOf(medicId)).stats, tech: 8 },
        },
      },
    });
    await treatUntilHealed({
      kind: 'treatInjury',
      treatTokenId: patientTokenId,
      treatInjuryId: severedArm.id,
      treatSkillId: 'medicine.surgery',
    });
    const left = (await sheetOf(patientId)).criticalInjuries.map((row) => row.id);
    expect(left).toEqual([brokenRibs.id]);
  });

  it('Łatanie ucisza ranę na karcie, ale jej nie zdejmuje (s. 223)', async () => {
    // Powtarzane jak Chirurgia wyżej i z tego samego powodu — fumble.
    let row: CpredCharacterData['criticalInjuries'][number] | undefined;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const patched = await emitAck(gm, 'character:roll', {
        characterId: medicId,
        request: {
          kind: 'treatInjury',
          treatTokenId: patientTokenId,
          treatInjuryId: brokenRibs.id,
          treatMode: 'quickFix',
          // Zdanie Łatania oferuje Ratownictwo PT 13, nie Chirurgię — gałąź
          // czyta się z kolumny „Łatanie", a nie z tej, którą leczy się na stałe.
          treatSkillId: 'paramedic',
        },
        visibility: 'public',
      });
      expect(patched.ok).toBe(true);
      row = (await sheetOf(patientId)).criticalInjuries.find((r) => r.id === brokenRibs.id);
      if (row?.patched) break;
    }
    expect(row).toBeDefined();
    expect(row!.patched?.skill).toBe('Ratownictwo medyczne');
    expect(row!.patched?.by).toBe('Doktor');

    // Drugiej łaty ta sama rana nie przyjmie — nie ma czego uciszać.
    const again = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: patientTokenId,
        treatInjuryId: brokenRibs.id,
        treatMode: 'quickFix',
        treatSkillId: 'paramedic',
      },
      visibility: 'public',
    });
    expect(again.ok === false && again.error).toBe('INJURY_ALREADY_PATCHED');

    // Leczenie tej samej rany dalej działa i zdejmuje ją z karty na dobre.
    await treatUntilHealed({
      kind: 'treatInjury',
      treatTokenId: patientTokenId,
      treatInjuryId: brokenRibs.id,
      treatSkillId: 'medicine.surgery',
    });
    expect((await sheetOf(patientId)).criticalInjuries.map((r) => r.id)).toEqual([]);
  });

  it('samego siebie wolno załatać, ale nie wyleczyć (s. 223)', async () => {
    await emitAck(gm, 'character:update', {
      characterId: medicId,
      patch: { data: { criticalInjuries: [brokenRibs] } },
    });
    const medicToken = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Doktor',
        x: 2,
        y: 2,
        characterId: medicId,
      }),
      'token:create',
    ).id;

    const selfTreat = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: medicToken,
        treatInjuryId: brokenRibs.id,
        treatSkillId: 'medicine.surgery',
      },
      visibility: 'public',
    });
    expect(selfTreat.ok === false && selfTreat.error).toBe('SELF_TREATMENT');

    // Powtarzane jak dwa Łatania wyżej: kość potrafi zabrać 1k10 na fumble'u,
    // a wtedy łata nie wchodzi i asercja mówi o czymś zupełnie innym.
    let by: string | undefined;
    for (let attempt = 0; attempt < 8 && by === undefined; attempt += 1) {
      const selfPatch = await emitAck(gm, 'character:roll', {
        characterId: medicId,
        request: {
          kind: 'treatInjury',
          treatTokenId: medicToken,
          treatInjuryId: brokenRibs.id,
          treatMode: 'quickFix',
          treatSkillId: 'paramedic',
        },
        visibility: 'public',
      });
      expect(selfPatch.ok).toBe(true);
      by = (await sheetOf(medicId)).criticalInjuries[0]!.patched?.by;
    }
    expect(by).toBe('Doktor');
  });

  it('rana, której już nie ma, nie daje się leczyć drugi raz', async () => {
    const ack = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: patientTokenId,
        treatInjuryId: severedArm.id,
        treatSkillId: 'medicine.surgery',
      },
      visibility: 'public',
    });
    expect(ack.ok === false && ack.error).toBe('INJURY_NOT_FOUND');
  });

  it('Prowizorka wymaga punktu w Naprawie i oddaje starte OB', async () => {
    const armor = [
      { id: 'a1', name: 'Kurtka', notes: '', sp: 11, spCurrent: 6, location: 'body' as const },
    ];
    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: { data: { armor } },
    });
    // Pacjent nie jest Technikiem — nie ma czym prowizorki zrobić.
    const refused = await emitAck(gm, 'character:field-repair', {
      characterId: patientId,
      armorRowId: 'a1',
    });
    expect(refused.ok === false && refused.error).toBe('NO_REPAIR_SPECIALTY');

    await emitAck(gm, 'character:update', {
      characterId: patientId,
      patch: {
        data: { roleId: 'tech', roleAbilityRank: 3, fabrication: { repair: 3, invent: 3 } },
      },
    });
    const patched = await emitAck(gm, 'character:field-repair', {
      characterId: patientId,
      armorRowId: 'a1',
    });
    expect(patched.ok).toBe(true);
    const bodged = (await sheetOf(patientId)).armor[0]!;
    expect(bodged.spCurrent).toBe(11);
    // 10 minut na poziom Specjalizacji — trzy poziomy to pół godziny.
    expect(bodged.fieldRepair).toEqual({ restoredFrom: 6, minutes: 30 });

    // „Nie można go ponownie tymczasowo naprawić, dopóki nie zostanie
    // zupełnie naprawiony w zwykły sposób" (s. 147).
    const again = await emitAck(gm, 'character:field-repair', {
      characterId: patientId,
      armorRowId: 'a1',
    });
    expect(again.ok === false && again.error).toBe('ALREADY_PATCHED');

    const undone = await emitAck(gm, 'character:field-repair', {
      characterId: patientId,
      armorRowId: 'a1',
      undo: true,
    });
    expect(undone.ok).toBe(true);
    const restored = (await sheetOf(patientId)).armor[0]!;
    expect(restored.spCurrent).toBe(6);
    expect(restored.fieldRepair).toBeUndefined();
  });

  /**
   * Figura bez karty jako pacjent (31.08).
   *
   * Serwer umiał ją leczyć od 29.08 — `treatableInjuries` czyta profil,
   * `applyTreatment` pisze do niego z powrotem — ale rana wchodziła jej
   * wyłącznie regułą, a żaden ekran jej nie pokazywał. Trzy rzeczy warte
   * sprawdzenia: że MG umie ranę **nadać**, że Medyk umie ją **zdjąć**
   * i że pomiędzy jednym a drugim rana faktycznie siedzi w profilu żetonu.
   */
  it('MG nadaje ranę figurze bez karty, a Medyk ją leczy', async () => {
    const turret = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Wieżyczka',
        x: 4,
        y: 4,
        hp: { current: 25, max: 25 },
      }),
      'token:create',
    );
    await emitAck(gm, 'token:stat', {
      tokenId: turret.id,
      quick: { ref: 6, dex: 4, body: 6, will: 4, skillLevel: 6, evasion: 2 },
    });

    // Publiczna próbka kompendium nie ma tabel ran (są w podręczniku, więc
    // poza repozytorium) — rana do nadania powstaje tak samo, jak w testach
    // etapu 15: wpisem przez edytor kompendium.
    const upserted = await emitAck<{ id: string }>(gm, 'compendium:upsert', {
      entry: {
        category: 'criticalInjury',
        name: 'Złamane żebra (test)',
        table: 'body',
        roll: 4,
        description: 'Otrzymujesz status Poważnie Ranny.',
        quickFix: 'Ratownictwo medyczne PT 13',
        treatment: 'Ratownictwo medyczne PT 15 lub Chirurgia PT 13',
      },
    });
    expect(upserted.ok).toBe(true);
    const wound = data(upserted, 'compendium:upsert').id;

    const assigned = await emitAck(gm, 'character:injury', {
      tokenId: turret.id,
      injuryId: wound,
    });
    expect(assigned.ok).toBe(true);

    const carrying = (await sync()).tokens.find((t) => t.id === turret.id)!;
    // Publicznie jedzie sama lista ran — po to, żeby Medyk gracza miał co łatać.
    expect((carrying.injuries ?? []).map((row) => (row as { id: string }).id)).toEqual([wound]);
    // Drugi raz ta sama rana się nie zdubluje.
    const twice = await emitAck(gm, 'character:injury', { tokenId: turret.id, injuryId: wound });
    expect(twice.ok === false && twice.error).toBe('INJURY_ALREADY_THERE');

    // Ten sam rzut, którym leczy się postać — zmienia się wyłącznie adres celu.
    // Powtarzany z tego samego powodu, co przy pacjencie z kartą: fumble
    // potrafi zabrać 1k10 i wtedy nawet Chirurgia 10 nie przebija progu.
    let healed = false;
    for (let attempt = 0; attempt < 8 && !healed; attempt += 1) {
      const ack = await emitAck(gm, 'character:roll', {
        characterId: medicId,
        request: {
          kind: 'treatInjury',
          treatTokenId: turret.id,
          treatInjuryId: wound,
          treatSkillId: 'medicine.surgery',
        },
        visibility: 'public',
      });
      expect(ack.ok).toBe(true);
      const now = (await sync()).tokens.find((t) => t.id === turret.id)!;
      healed = (now.injuries ?? []).length === 0;
    }
    expect(healed).toBe(true);
  });

  it('figura bez profilu nie przyjmie rany — nie ma gdzie jej zapisać', async () => {
    const disc = data(
      await emitAck<TokenView>(gm, 'token:create', { sceneId, name: 'Krążek', x: 6, y: 6 }),
      'token:create',
    );
    const refused = await emitAck(gm, 'character:injury', {
      tokenId: disc.id,
      injuryId: 'injury.cokolwiek',
    });
    expect(refused.ok === false && refused.error).toBe('TOKEN_HAS_NO_PROFILE');
  });
});
