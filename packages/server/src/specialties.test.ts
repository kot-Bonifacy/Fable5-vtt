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
    const rolled = await emitAck<{ messageId: number }>(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: patientTokenId,
        treatInjuryId: severedArm.id,
        treatSkillId: 'medicine.surgery',
      },
      visibility: 'public',
    });
    expect(rolled.ok).toBe(true);
    const left = (await sheetOf(patientId)).criticalInjuries.map((row) => row.id);
    expect(left).toEqual([brokenRibs.id]);
  });

  it('Łatanie ucisza ranę na karcie, ale jej nie zdejmuje (s. 223)', async () => {
    const patched = await emitAck<{ messageId: number }>(gm, 'character:roll', {
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
    const row = (await sheetOf(patientId)).criticalInjuries.find((r) => r.id === brokenRibs.id);
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
    const healed = await emitAck(gm, 'character:roll', {
      characterId: medicId,
      request: {
        kind: 'treatInjury',
        treatTokenId: patientTokenId,
        treatInjuryId: brokenRibs.id,
        treatSkillId: 'medicine.surgery',
      },
      visibility: 'public',
    });
    expect(healed.ok).toBe(true);
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
    expect((await sheetOf(medicId)).criticalInjuries[0]!.patched?.by).toBe('Doktor');
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
});
