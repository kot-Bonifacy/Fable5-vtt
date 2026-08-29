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
  CombatView,
  CpredCharacterData,
  CpredCombatProfile,
  InvitationSummary,
  SceneView,
  SocketAck,
  StateSyncPayload,
  TokenView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';

/**
 * Wsparcie na żywych gniazdach (etap 30c).
 *
 * `backup.test.ts` w `shared` liczy tabelę i rzut; tutaj sprawdzany jest szew:
 * że wezwanie kosztuje Akcję i zostawia ślad na czacie, że grupa w drodze stoi
 * w kolejce jako wiersz **bez** tury, że postawienie jej naprawdę robi figury
 * z profilem bojowym — i że funkcjonariusz nie może uniknąć pocisku.
 *
 * Rzuty są losowe, więc test dobiera warunki tak, żeby losowość nie mogła go
 * zepsuć: ranga 10 wzywa kategorię 1 na `1k10 ≤ 10`, czyli zawsze.
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
    payload: { name: 'Kampania Wsparcia' },
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
    payload: { name: 'Slack' },
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

describe('Wsparcie: wezwanie, oczekiwanie, przybycie', () => {
  let gm: ClientSocket;
  let player: ClientSocket;
  let sceneId: string;
  let lawmanId: string;
  let lawmanTokenId: string;

  async function tokensOfScene(): Promise<TokenView[]> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    return (await sync).tokens;
  }

  /** Kolejka taka, jaka jest — bez przesuwania tury, bo tura tyka rundy. */
  async function combatNow(): Promise<CombatView> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    const combat = (await sync).combat;
    if (!combat) throw new Error('no combat running');
    return combat;
  }

  it('stawia stół: Stróż Prawa z Wsparciem 10 i jego figura', async () => {
    const gmConn = createSocket(gmCookie);
    const playerConn = createSocket(playerCookie);
    gm = gmConn.socket;
    player = playerConn.socket;
    await Promise.all([gmConn.firstSync, playerConn.firstSync]);

    const scene = data(
      await emitAck<SceneView>(gm, 'scene:create', { name: 'Zaułek', width: 2000, height: 2000 }),
      'scene:create',
    );
    sceneId = scene.id;
    await emitAck(gm, 'scene:activate', { sceneId });
    await emitAck(player, 'scene:view', { sceneId });

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Slack', ownerId: playerId }),
      'character:create',
    );
    lawmanId = character.id;
    await emitAck(gm, 'character:update', {
      characterId: lawmanId,
      // Ranga 10 to jedyny sposób, żeby rzut wezwania nie mógł spudłować.
      patch: { data: { roleId: 'lawman', roleAbilityRank: 10 } },
    });

    const token = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Slack',
        x: 500,
        y: 500,
        characterId: lawmanId,
        ownerId: playerId,
      }),
      'token:create',
    );
    lawmanTokenId = token.id;
    expect(lawmanTokenId).toBeTruthy();
  });

  it('odmawia wezwania karcie bez tej Zdolności', async () => {
    const other = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex' }),
      'character:create',
    );
    await emitAck(gm, 'character:update', {
      characterId: other.id,
      patch: { data: { roleId: 'solo', roleAbilityRank: 4 } },
    });
    const ack = await emitAck(gm, 'character:backup-call', { characterId: other.id, level: 1 });
    expect(ack).toEqual({ ok: false, error: 'NO_ABILITY' });
  });

  it('odmawia kategorii wyższej niż ranga', async () => {
    await emitAck(gm, 'character:update', {
      characterId: lawmanId,
      patch: { data: { roleAbilityRank: 2 } },
    });
    const ack = await emitAck(gm, 'character:backup-call', { characterId: lawmanId, level: 5 });
    expect(ack).toEqual({ ok: false, error: 'BACKUP_LEVEL_TOO_HIGH' });
    await emitAck(gm, 'character:update', {
      characterId: lawmanId,
      patch: { data: { roleAbilityRank: 10 } },
    });
  });

  it('poza walką stawia funkcjonariuszy od razu, z profilem bojowym', async () => {
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const result = data(
      await emitAck<{ answered: boolean; rounds: number | null }>(gm, 'character:backup-call', {
        characterId: lawmanId,
        level: 1,
        tokenId: lawmanTokenId,
      }),
      'character:backup-call',
    );
    expect(result.answered).toBe(true);
    // Karta rzutu ląduje na czacie jak każdy inny rzut, który coś rozstrzyga.
    expect((await message).message.roll?.title).toContain('Wezwanie Wsparcia');

    const tokens = await tokensOfScene();
    const officers = tokens.filter((token) => token.name.startsWith('Korpogliniarz'));
    expect(officers).toHaveLength(4);
    const profile = officers[0]!.combatProfile as unknown as CpredCombatProfile;
    expect(profile).toMatchObject({ skillLevel: 8, evasion: 8, armorSp: 7, noBulletDodge: true });
    expect(officers[0]!.hp).toEqual({ current: 20, max: 20 });
    // Broń znaleziona po nazwie w kompendium — obrażenia z typu, nie pięści.
    expect(profile.weaponName).toBe('Ciężki pistolet');

    for (const officer of officers) {
      await emitAck(gm, 'token:delete', { tokenId: officer.id });
    }
  });

  it('w trwającej walce zapisuje wiersz w drodze zamiast stawiać figury', async () => {
    await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [lawmanTokenId] });
    await emitAck<CombatView>(gm, 'combat:roll-all', {});
    // Runda 0 to „PRZED WALKĄ" — nie ma od czego liczyć, więc kolejka musi ruszyć.
    const started = data(await emitAck<CombatView>(gm, 'combat:next', undefined), 'combat:next');
    expect(started.round).toBeGreaterThanOrEqual(1);

    const result = data(
      await emitAck<{ answered: boolean; rounds: number | null; secondGroup: boolean }>(
        gm,
        'character:backup-call',
        { characterId: lawmanId, level: 1, tokenId: lawmanTokenId },
      ),
      'character:backup-call',
    );
    expect(result.answered).toBe(true);

    // Kolejka czytana **bez** przesuwania tury: każde `combat:next` przy jednym
    // uczestniku to cała runda, a 1k6 bywa jedynką — czekanie na wiersz
    // po kroku tury byłoby testem losowym.
    const view = await combatNow();
    const pending = view.reinforcements ?? [];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ label: 'Korporacyjne służby bezpieczeństwa ×4' });
    expect(pending[0]!.round).toBe(view.round + (result.rounds ?? 0));
    // Nikt jeszcze nie stoi na mapie.
    expect((await tokensOfScene()).filter((t) => t.name.startsWith('Korpogliniarz'))).toHaveLength(
      0,
    );

    // „Przybywają dwie różne grupy" czeka na MG i dopóki czeka, nie przyjeżdża.
    if (result.secondGroup) {
      expect(pending[0]!.question).toBeTruthy();
      const answered = data(
        await emitAck<{ placed: boolean }>(gm, 'backup:resolve', {
          pendingId: pending[0]!.id,
          action: 'second',
          tierId: 'beat-cops',
        }),
        'backup:resolve second',
      );
      expect(answered.placed).toBe(false);
      expect((await combatNow()).reinforcements ?? []).toHaveLength(2);
    }
  });

  it('gracz widzi, że pomoc jedzie, ale nie pytanie MG', async () => {
    const sync = waitFor<StateSyncPayload>(player, 'state:sync');
    player.emit('state:request');
    const rows = (await sync).combat?.reinforcements ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.question).toBeUndefined();
  });

  it('licznik rund sam stawia figury, gdy nadejdzie ich runda', async () => {
    const view = await combatNow();
    const pending = view.reinforcements ?? [];
    expect(pending.length).toBeGreaterThan(0);
    const arrival = Math.max(...pending.map((row) => row.round));

    // Jeden uczestnik w kolejce, więc każde „następna tura" to cała runda.
    let round = view.round;
    for (let step = 0; step < 10 && round < arrival; step += 1) {
      round = data(await emitAck<CombatView>(gm, 'combat:next', undefined), 'combat:next').round;
    }
    expect(round).toBeGreaterThanOrEqual(arrival);

    const after = await combatNow();
    expect(after.reinforcements ?? []).toHaveLength(0);
    const officers = (await tokensOfScene()).filter((token) =>
      /Korpogliniarz|Krawężnik/.test(token.name),
    );
    expect(officers.length).toBeGreaterThanOrEqual(4);
    // „wierszem inicjatywy" — kryterium ukończenia etapu, sprawdzone wprost.
    const queue = after.combatants.filter((row) =>
      officers.some((officer) => officer.id === row.tokenId),
    );
    expect(queue).toHaveLength(officers.length);
    for (const row of queue) expect(row.initiative).not.toBeNull();

    for (const officer of officers) await emitAck(gm, 'token:delete', { tokenId: officer.id });
  });

  it('MG może postawić grupę wcześniej, nie czekając na jej rundę', async () => {
    const called = data(
      await emitAck<{ answered: boolean; secondGroup: boolean }>(gm, 'character:backup-call', {
        characterId: lawmanId,
        level: 1,
        tokenId: lawmanTokenId,
      }),
      'character:backup-call',
    );
    expect(called.answered).toBe(true);
    const pending = (await combatNow()).reinforcements ?? [];
    expect(pending).toHaveLength(1);
    const placed = data(
      await emitAck<{ placed: boolean }>(gm, 'backup:resolve', {
        pendingId: pending[0]!.id,
        // Grupa z pytaniem staje tak samo — „przybywają teraz" to MG kończący
        // rozmowę, a nie system rozstrzygający ją za niego.
        action: 'place',
      }),
      'backup:resolve place',
    );
    expect(placed.placed).toBe(true);
    expect((await combatNow()).reinforcements ?? []).toHaveLength(0);
    const officers = (await tokensOfScene()).filter((token) =>
      token.name.startsWith('Korpogliniarz'),
    );
    expect(officers).toHaveLength(4);
    for (const officer of officers) await emitAck(gm, 'token:delete', { tokenId: officer.id });
  });

  it('MG może też odwołać wezwanie, którego nikt nie chce', async () => {
    const called = data(
      await emitAck<{ answered: boolean }>(gm, 'character:backup-call', {
        characterId: lawmanId,
        level: 1,
        tokenId: lawmanTokenId,
      }),
      'character:backup-call',
    );
    expect(called.answered).toBe(true);
    const rows = (await combatNow()).reinforcements ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await emitAck(gm, 'backup:resolve', { pendingId: row.id, action: 'cancel' });
    }
    expect((await combatNow()).reinforcements ?? []).toHaveLength(0);
    expect((await tokensOfScene()).filter((t) => t.name.startsWith('Korpogliniarz'))).toHaveLength(
      0,
    );
  });

  it('funkcjonariusz nie może Unikać pocisku, ale machetę odbija', async () => {
    // Wsparcie poza walką staje od razu — nie ma tu rund do odliczania.
    await emitAck(gm, 'combat:end', undefined);
    const called = data(
      await emitAck<{ answered: boolean }>(gm, 'character:backup-call', {
        characterId: lawmanId,
        level: 1,
        tokenId: lawmanTokenId,
      }),
      'character:backup-call',
    );
    expect(called.answered).toBe(true);
    const officer = (await tokensOfScene()).find((token) =>
      token.name.startsWith('Korpogliniarz'),
    )!;
    expect(officer).toBeTruthy();

    // Strzelec: ten sam Stróż Prawa, tyle że z pistoletem na karcie.
    const armed = await emitAck(gm, 'character:update', {
      characterId: lawmanId,
      patch: {
        data: {
          skills: { handgun: 5, evasion: 3 },
          weapons: [
            {
              id: 'w-pistol',
              name: 'Zgrzyt 9',
              notes: '',
              // Bez wpisu z katalogu broń nie ma tabeli zasięgów, a planer
              // odmawia strzału — `weapon.zgrzyt-9` jest w publicznej próbce.
              compendiumId: 'weapon.zgrzyt-9',
              damage: '2k6',
              ammoCurrent: 8,
              ammoMax: 8,
              ammoType: '',
              rof: '2',
            },
          ],
        },
      },
    });
    expect(armed.ok).toBe(true);
    await emitAck(gm, 'token:update', { tokenId: officer.id, patch: { x: 550, y: 500 } });

    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    const shot = data(
      await emitAck<{ messageId: number }>(gm, 'attack:roll', {
        characterId: lawmanId,
        targetTokenId: officer.id,
        attackerTokenId: lawmanTokenId,
        request: { weaponRowId: 'w-pistol', mode: 'single' },
      }),
      'attack:roll',
    );
    await message;

    const evade = await emitAck(gm, 'attack:evade', { messageId: shot.messageId });
    expect(evade).toEqual({ ok: false, error: 'BACKUP_CANNOT_DODGE' });

    for (const token of (await tokensOfScene()).filter((t) => t.name.startsWith('Korpogliniarz'))) {
      await emitAck(gm, 'token:delete', { tokenId: token.id });
    }
  });

  it('koniec walki zabiera ze sobą wszystko, co było w drodze', async () => {
    await emitAck(gm, 'character:backup-call', {
      characterId: lawmanId,
      level: 1,
      tokenId: lawmanTokenId,
    });
    await emitAck(gm, 'combat:end', undefined);
    await emitAck<CombatView>(gm, 'combat:start', { sceneId, tokenIds: [lawmanTokenId] });
    const fresh = data(await emitAck<CombatView>(gm, 'combat:roll-all', {}), 'combat:roll-all');
    expect(fresh.reinforcements ?? []).toHaveLength(0);
  });
});

describe('Zespół Korpo', () => {
  let gm: ClientSocket;
  let execId: string;

  async function sheetOf(characterId: string): Promise<CpredCharacterData> {
    const sync = waitFor<StateSyncPayload>(gm, 'state:sync');
    gm.emit('state:request');
    const found = (await sync).characters.find((row) => row.id === characterId);
    if (!found) throw new Error('character missing from sync');
    return found.data as CpredCharacterData;
  }

  it('stawia Korpo z Pracą Zespołową 5', async () => {
    const gmConn = createSocket(gmCookie);
    gm = gmConn.socket;
    await gmConn.firstSync;

    const character = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Adamska' }),
      'character:create',
    );
    execId = character.id;
    await emitAck(gm, 'character:update', {
      characterId: execId,
      patch: { data: { roleId: 'exec', roleAbilityRank: 5 } },
    });
    expect((await sheetOf(execId)).team).toEqual([]);
  });

  it('nie wpuszcza listy zespołu zwykłą łatą karty', async () => {
    const ack = await emitAck(gm, 'character:update', {
      characterId: execId,
      patch: {
        data: { team: [{ characterId: 'x', professionId: 'bodyguard', loyalty: 99 }] },
      },
    });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('HR przysyła pracownika z pełnym pakietem, nie ze statblokiem', async () => {
    const ok = await emitAck<CharacterView>(gm, 'character:team-hire', {
      characterId: execId,
      professionId: 'netrunner',
      name: 'Cyra',
    });
    expect(ok.ok).toBe(true);

    const team = (await sheetOf(execId)).team;
    expect(team).toHaveLength(1);
    expect(team[0]!.professionId).toBe('netrunner');
    expect(team[0]!.loyalty).toBeGreaterThanOrEqual(2);
    expect(team[0]!.loyalty).toBeLessThanOrEqual(7);

    const member = await sheetOf(team[0]!.characterId);
    // Ten, dla którego pełna karta była w ogóle potrzebna: Interfejs 2.
    expect(member.roleId).toBe('netrunner');
    expect(member.roleAbilityRank).toBe(2);
    // Umiejętności sprawdzane na tych, które ma **publiczna** próbka
    // `skills.json` (42 z 66): `validateSkills` wycina id spoza rejestru, więc
    // `cybertech` na tej próbce nie przetrwa odczytu — i to nie jest błąd
    // pakietu, tylko braku danych (patrz pułapki dev).
    expect(member.skills['electronics-security']).toBe(4);
    expect(member.skills['library-search']).toBe(4);
    expect(member.skills['evasion']).toBe(2);
    // „Nie musisz obniżać Empatii […] Wzięto to już pod uwagę" — żadnego chromu
    // w wierszach, więc Człowieczeństwo zostaje na pełnym pułapie.
    expect(member.cyberware).toEqual([]);
    expect(member.armor[0]).toMatchObject({ sp: 11, spCurrent: 11 });
    expect(member.weapons[0]?.name).toBe('Bardzo ciężki pistolet');
    // Język Ścieżką Życia (25b), a nie mapą specjalizacji.
    expect(member.lifepath.language).toBe('Slang uliczny');
    expect(member.skillSpecialties['local-expert']).toBe('Twój dom');
    // Cechy naprawdę z wylosowanego wiersza, a nie domyślne piątki.
    expect(member.stats.tech).toBeGreaterThanOrEqual(5);
    expect(member.stats.int).toBeGreaterThanOrEqual(5);
    // Szczęścia BN nie wydaje: sakiewka pusta, choć sama Cecha musi być ≥ 1.
    expect(member.stats.luck).toBe(1);
    expect(member.luckCurrent).toBe(0);
  });

  it('trzyma się liczby etatów, jaką płaci ranga', async () => {
    const second = await emitAck(gm, 'character:team-hire', {
      characterId: execId,
      professionId: 'driver',
      name: 'Bąk',
    });
    expect(second.ok).toBe(true);
    const third = await emitAck(gm, 'character:team-hire', {
      characterId: execId,
      professionId: 'techie',
      name: 'Śruba',
    });
    expect(third).toEqual({ ok: false, error: 'TEAM_FULL' });
  });

  it('Test Lojalności rzuca kością i niczego nie zmienia', async () => {
    const before = (await sheetOf(execId)).team[0]!;
    const message = waitFor<ChatMessageBroadcast>(gm, 'chat:message');
    await emitAck(gm, 'character:team-loyalty', {
      characterId: execId,
      memberId: before.characterId,
      test: true,
    });
    expect((await message).message.roll?.title).toContain('Test Lojalności');
    expect((await sheetOf(execId)).team[0]!.loyalty).toBe(before.loyalty);
  });

  it('tabela z podręcznika zmienia Lojalność o swoje wartości', async () => {
    const before = (await sheetOf(execId)).team[0]!;
    await emitAck(gm, 'character:team-loyalty', {
      characterId: execId,
      memberId: before.characterId,
      changeId: 'abandoned',
    });
    expect((await sheetOf(execId)).team[0]!.loyalty).toBe(before.loyalty - 8);
  });

  it('zwolnienie zdejmuje z listy, ale nie kasuje karty', async () => {
    const member = (await sheetOf(execId)).team[0]!;
    await emitAck(gm, 'character:team-loyalty', {
      characterId: execId,
      memberId: member.characterId,
      dismiss: true,
    });
    const team = (await sheetOf(execId)).team;
    expect(team.map((row) => row.characterId)).not.toContain(member.characterId);
    // Karta stoi dalej — ktoś może na niej stać figurą na mapie.
    await expect(sheetOf(member.characterId)).resolves.toBeTruthy();
  });

  it('skasowana karta pracownika znika też z listy zespołu', async () => {
    const member = (await sheetOf(execId)).team[0]!;
    await emitAck(gm, 'character:delete', { characterId: member.characterId });
    const team = (await sheetOf(execId)).team;
    expect(team.map((row) => row.characterId)).not.toContain(member.characterId);
  });
});
