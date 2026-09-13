import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ArchiveFile,
  ArchiveImportResult,
  CampaignSummary,
  CharacterView,
  InvitationSummary,
  SceneView,
  SnapshotListView,
  SocketAck,
  StateSyncPayload,
} from '@vtt/shared';
import { ARCHIVE_VERSION } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import type { CampaignArchive, CharacterArchive, SceneArchive } from './archive.js';

/**
 * Pliki wymiany (etap 33) — szew między bazą, trasą i gniazdem.
 *
 * Czysta rotacja i praca na dysku są w `snapshots.test.ts` i w `shared`; tutaj
 * sprawdzane jest to, czego tamte nie widzą: że karta wraca importem jako druga
 * karta z innym id, że zrzut kampanii nie wynosi skrótu hasła, że plik z obcą
 * wersją schematu odmawia zdaniem, i że gracz nie ma do niczego z tego dostępu.
 *
 * Kopie są w tym teście **wyłączone** (`backups` nieustawione) — dokładnie tak
 * jak we wszystkich pozostałych zestawach; sprawdzana jest za to odpowiedź
 * `archive:list` w tym stanie, bo to jest stan, w którym panel MG musi coś
 * powiedzieć zamiast pokazać pustkę.
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
let gmSocket: ClientSocket;
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
  const firstSync = new Promise<StateSyncPayload>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      rej(err);
    });
    socket.once('state:sync', (payload: StateSyncPayload) => {
      clearTimeout(timer);
      res(payload);
    });
  });
  return { socket, firstSync };
}

function emitAck<T = undefined>(
  socket: ClientSocket,
  event: string,
  payload?: unknown,
): Promise<SocketAck<T>> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${event} ack timeout`)), 5000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      res(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

/** Wynik `emitAck`, gdy test zakłada, że zdarzenie się powiodło. */
function dataOf<T>(ack: SocketAck<T>): T {
  if (!ack.ok) throw new Error(`nieudane: ${ack.error}`);
  return ack.data as T;
}

async function download<T>(url: string, cookie: string): Promise<ArchiveFile<T>> {
  const res = await built.app.inject({ method: 'GET', url, headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as ArchiveFile<T>;
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
    payload: { name: 'Kampania kopii' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;

  const inviteRes = await built.app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaignId}/invitations`,
    headers: { cookie: gmCookie },
    payload: {},
  });
  const token = (inviteRes.json() as InvitationSummary).token;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: `/api/join/${token}`,
    payload: { name: 'Rogue' },
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;

  const gm = createSocket(gmCookie);
  await gm.firstSync;
  gmSocket = gm.socket;
}, 60_000);

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows potrafi jeszcze trzymać plik
  }
});

/** Karta z czymś w środku: eurodolce, ekwipunek i wiersz historii. */
async function makeCharacter(name: string): Promise<CharacterView> {
  const created = dataOf(
    await emitAck<CharacterView>(gmSocket, 'character:create', { name, ownerId: playerId }),
  );
  const updated = dataOf(
    await emitAck<CharacterView>(gmSocket, 'character:update', {
      characterId: created.id,
      patch: {
        gear: [{ id: 'g1', name: 'Kurtka pancerna', qty: 1 }],
        notes: 'Postać do kopii zapasowej',
      },
    }),
  );
  return updated;
}

describe('eksport karty', () => {
  it('daje plik z manifestem i kartą jako prawdziwym JSON-em', async () => {
    const character = await makeCharacter('Kopiowany');
    const file = await download<CharacterArchive>(
      `/api/archive/character/${character.id}`,
      gmCookie,
    );

    expect(file.manifest).toMatchObject({
      app: 'vtt',
      kind: 'character',
      version: ARCHIVE_VERSION,
      campaignName: 'Kampania kopii',
    });
    expect(file.payload.name).toBe('Kopiowany');
    // Kolumna `data` jest w bazie tekstem; w pliku ma być obiektem, inaczej
    // zrzutu nie da się przeczytać w edytorze.
    expect(typeof file.payload.data).toBe('object');
    expect(file.manifest.omitted.join(' ')).toContain('Właściciel');
  });

  it('wysyła plik jako pobranie z nazwą, nie jako stronę', async () => {
    const character = await makeCharacter('Nazwa Pliku');
    const res = await built.app.inject({
      method: 'GET',
      url: `/api/archive/character/${character.id}`,
      headers: { cookie: gmCookie },
    });
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="character-.*\.json"/);
  });

  it('nie wywraca się na polskich znakach w nazwie karty', async () => {
    // Nagłówek HTTP jest latin-1: „Bezpański" wprost w `filename` daje 500.
    const character = await makeCharacter('Zażółć gęślą jaźń');
    const res = await built.app.inject({
      method: 'GET',
      url: `/api/archive/character/${character.id}`,
      headers: { cookie: gmCookie },
    });
    expect(res.statusCode).toBe(200);
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toContain('filename="character-zazolc-gesla-jazn-');
    expect(disposition).toContain("filename*=UTF-8''");
  });

  it('nie jest dla gracza i nie zna karty, której nie ma', async () => {
    const character = await makeCharacter('Nie dla gracza');
    const asPlayer = await built.app.inject({
      method: 'GET',
      url: `/api/archive/character/${character.id}`,
      headers: { cookie: playerCookie },
    });
    expect(asPlayer.statusCode).toBe(403);

    const missing = await built.app.inject({
      method: 'GET',
      url: '/api/archive/character/nie-ma-takiej',
      headers: { cookie: gmCookie },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('import karty', () => {
  it('wraca do tej samej kampanii jako DRUGA karta z innym id', async () => {
    const original = await makeCharacter('Do powrotu');
    const file = await download<CharacterArchive>(
      `/api/archive/character/${original.id}`,
      gmCookie,
    );

    const result = dataOf(
      await emitAck<ArchiveImportResult>(gmSocket, 'archive:character', {
        file,
        ownerId: playerId,
        name: 'Do powrotu (kopia)',
      }),
    );

    expect(result.id).not.toBe(original.id);
    expect(result.name).toBe('Do powrotu (kopia)');

    const back = await download<CharacterArchive>(`/api/archive/character/${result.id}`, gmCookie);
    // Ta sama zawartość karty — ekwipunek, notatki, eurodolce, PD.
    expect(back.payload.data).toEqual(file.payload.data);
    expect(original.name).toBe('Do powrotu');
  });

  /**
   * Round-trip NIE jest bajt w bajt i to jest zamierzone (oględziny 05.09).
   *
   * Eksport wypisuje **surową kolumnę** `data` — kopia zapasowa ma być prawdą
   * o tym, co leży w bazie. Import przepuszcza ją przez `parseCharacterData`,
   * czyli ten sam parser, którym czyta kartę reszta serwera — więc karta zapisana
   * przed etapem 30b wraca z dopisanymi polami, których wtedy nie było
   * (`medicine`, `team`, `recovery`…). Nic nie ginie, dochodzą domyślne wartości.
   * Bez tego karta z pliku otwierałaby panel, który pyta o pole, którego nie ma.
   */
  it('wypełnia braki starej karty domyślnymi wartościami, niczego nie gubiąc', async () => {
    const original = await makeCharacter('Sprzed etapu');
    const file = await download<CharacterArchive>(
      `/api/archive/character/${original.id}`,
      gmCookie,
    );
    // Karta „ze starej wersji": tylko to, co naprawdę niesie treść.
    const legacy = (file.payload.data ?? {}) as Record<string, unknown>;
    file.payload.data = {
      schemaVersion: legacy.schemaVersion,
      stats: legacy.stats,
      gear: legacy.gear,
      notes: legacy.notes,
      eddies: legacy.eddies,
    };

    const result = dataOf(
      await emitAck<ArchiveImportResult>(gmSocket, 'archive:character', {
        file,
        ownerId: null,
        name: 'Sprzed etapu (wczytany)',
      }),
    );
    const back = await download<CharacterArchive>(`/api/archive/character/${result.id}`, gmCookie);
    const data = back.payload.data as Record<string, unknown>;

    // Treść przeżyła…
    expect(data.gear).toEqual(legacy.gear);
    expect(data.notes).toEqual(legacy.notes);
    expect(data.stats).toEqual(legacy.stats);
    // …a pola, których plik nie miał, są na miejscu z wartościami domyślnymi.
    expect(data.recovery).toBeDefined();
    expect(data.team).toBeDefined();
  });

  it('bez właściciela wchodzi jako NPC i mówi o tym zdaniem', async () => {
    const original = await makeCharacter('Bezpański');
    const file = await download<CharacterArchive>(
      `/api/archive/character/${original.id}`,
      gmCookie,
    );
    const result = dataOf(
      await emitAck<ArchiveImportResult>(gmSocket, 'archive:character', {
        file,
        ownerId: null,
        name: 'Bezpański (NPC)',
      }),
    );
    expect(result.note).toContain('NPC');
  });

  it('odmawia pliku zapisanego przez nowszą wersję', async () => {
    const original = await makeCharacter('Z przyszłości');
    const file = await download<CharacterArchive>(
      `/api/archive/character/${original.id}`,
      gmCookie,
    );
    file.manifest.version = ARCHIVE_VERSION + 1;

    const ack = await emitAck(gmSocket, 'archive:character', { file, ownerId: null });
    expect(ack).toEqual({ ok: false, error: 'ARCHIVE_TOO_NEW' });
  });

  it('odmawia sceny wczytywanej jako karta i czegoś, co plikiem nie jest', async () => {
    const scene = dataOf(await emitAck<SceneView>(gmSocket, 'scene:create', { name: 'Nie karta' }));
    const sceneFile = await download<SceneArchive>(`/api/archive/scene/${scene.id}`, gmCookie);

    expect(
      await emitAck(gmSocket, 'archive:character', { file: sceneFile, ownerId: null }),
    ).toEqual({ ok: false, error: 'ARCHIVE_WRONG_KIND' });
    expect(await emitAck(gmSocket, 'archive:character', { file: { co: 'to' } })).toEqual({
      ok: false,
      error: 'ARCHIVE_MALFORMED',
    });
  });

  it('nie jest dla gracza', async () => {
    const { socket, firstSync } = createSocket(playerCookie);
    await firstSync;
    const ack = await emitAck(socket, 'archive:character', { file: {}, ownerId: null });
    expect(ack).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('scena', () => {
  it('wraca importem w podglądzie, z tymi samymi ścianami i figurami', async () => {
    const scene = dataOf(await emitAck<SceneView>(gmSocket, 'scene:create', { name: 'Magazyn' }));
    dataOf(
      await emitAck(gmSocket, 'wall:create', {
        sceneId: scene.id,
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        kind: 'wall',
      }),
    );
    // Etap 42b: siatka ma OB — liczba musi przejechać w obie strony.
    dataOf(
      await emitAck(gmSocket, 'wall:create', {
        sceneId: scene.id,
        points: [
          { x: 0, y: 300 },
          { x: 200, y: 300 },
        ],
        kind: 'barrier',
        armor: 7,
      }),
    );
    dataOf(
      await emitAck(gmSocket, 'token:create', {
        sceneId: scene.id,
        name: 'Wartownik',
        x: 100,
        y: 100,
      }),
    );

    const file = await download<SceneArchive>(`/api/archive/scene/${scene.id}`, gmCookie);
    expect(file.manifest.counts).toMatchObject({ walls: 2, tokens: 1 });
    expect(file.payload.walls).toContainEqual(
      expect.objectContaining({ kind: 'barrier', armor: 7 }),
    );

    const result = dataOf(
      await emitAck<ArchiveImportResult>(gmSocket, 'archive:scene', {
        file,
        name: 'Magazyn (kopia)',
      }),
    );
    expect(result.id).not.toBe(scene.id);
    expect(result.note).toContain('podglądzie');

    const back = await download<SceneArchive>(`/api/archive/scene/${result.id}`, gmCookie);
    expect(back.manifest.counts).toMatchObject({ walls: 2, tokens: 1 });
    expect(back.payload.walls).toContainEqual(
      expect.objectContaining({ kind: 'barrier', armor: 7 }),
    );
    expect(back.payload.tokens[0]).toMatchObject({ name: 'Wartownik', x: 100, y: 100 });
    // Import nigdy nie przestawia stołu — scena wjeżdża nieaktywna.
    const row = await built.prisma.scene.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.active).toBe(false);
  });
});

describe('zrzut kampanii', () => {
  it('niesie manifest, po którym widać, czego w nim nie ma', async () => {
    const withChat = await download<CampaignArchive>('/api/archive/campaign?chat=1', gmCookie);
    expect(withChat.manifest.kind).toBe('campaign');
    expect(withChat.payload.chat).not.toBeNull();
    expect(withChat.manifest.omitted.join(' ')).not.toContain('Czat —');

    const withoutChat = await download<CampaignArchive>('/api/archive/campaign?chat=0', gmCookie);
    expect(withoutChat.payload.chat).toBeNull();
    expect(withoutChat.manifest.omitted[0]).toContain('Czat');
    expect(withoutChat.manifest.counts.chat).toBe(0);
  });

  it('zna konta z nazwy i roli, ale NIGDY skrótu hasła', async () => {
    const file = await download<CampaignArchive>('/api/archive/campaign', gmCookie);
    expect(file.payload.users.some((user) => user.name === 'Rogue')).toBe(true);
    // Najostrzejsze możliwe sprawdzenie: skrótu nie ma nigdzie w całym pliku.
    expect(JSON.stringify(file)).not.toContain('passwordHash');
    expect(JSON.stringify(file)).not.toContain('$argon2');
  });

  it('nie jest dla gracza', async () => {
    const res = await built.app.inject({
      method: 'GET',
      url: '/api/archive/campaign',
      headers: { cookie: playerCookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('archive:list bez włączonych kopii', () => {
  it('mówi „zero i co godzinę zero", zamiast się wywrócić', async () => {
    const view = dataOf(await emitAck<SnapshotListView>(gmSocket, 'archive:list'));
    expect(view).toMatchObject({ directory: '', snapshots: [], intervalMinutes: 0 });
  });

  it('odmawia ręcznej kopii, gdy kopie są wyłączone', async () => {
    expect(await emitAck(gmSocket, 'archive:snapshot')).toEqual({
      ok: false,
      error: 'BACKUP_DISABLED',
    });
  });
});
