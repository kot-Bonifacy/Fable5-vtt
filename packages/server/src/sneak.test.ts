import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  CampaignSummary,
  ChatMessageBroadcast,
  ChatMessageView,
  CharacterView,
  CombatView,
  CpredCharacterData,
  SceneView,
  SneakEndedBroadcast,
  SneakNoticedBroadcast,
  SocketAck,
  StateSyncPayload,
  TokenView,
  WallView,
} from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { joinUrl } from './test-join.js';
import { paceTesting } from './realtime/pace.js';

paceTesting.off = true;

/**
 * Tryb skradania figury gracza (etap 61) na prawdziwych gniazdach.
 *
 * Vex (ZW 6 + Skradanie 6 = 12) prosi o skradanie, MG daje modyfikator, Vex
 * rzuca kubkiem — wynik to PT dla Percepcji NPC-ów. Strażnik (INT 4 +
 * Percepcja 4 = 8) i Zbir (INT 8 + Percepcja 10 = 18) patrzą swoimi oczami
 * i rzucają raz na jedno skradanie. Kości z `VTT_DICE_SCRIPT`: kolejność to
 * kolejność rzutów serwera.
 *
 * Pokój: kratka 100 px i 2 m. Vex stoi po lewej, Strażnik po prawej, między
 * nimi pełna ściana; Zbir czeka w kącie za załamaną ścianą.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';

const DICE = join(mkdtempSync(join(tmpdir(), 'vtt-sneak-dice-')), 'dice.txt');
const previousDiceScript = process.env.VTT_DICE_SCRIPT;
function scriptDice(faces: number[]): void {
  writeFileSync(DICE, faces.join(' '));
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
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    const ack = (response: SocketAck<T>) => {
      clearTimeout(timer);
      resolve(response);
    };
    if (payload === undefined) socket.emit(event, ack);
    else socket.emit(event, payload, ack);
  });
}

function data<T>(ack: SocketAck<T>, what: string): T {
  if (!ack.ok) throw new Error(`${what} failed: ${ack.error}`);
  if (ack.data === undefined) throw new Error(`${what} returned no data`);
  return ack.data;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function stateOf(socket: ClientSocket): Promise<StateSyncPayload> {
  const sync = waitFor<StateSyncPayload>(socket, 'state:sync');
  await emitAck(socket, 'state:request');
  return sync;
}

beforeAll(async () => {
  process.env.VTT_DICE_SCRIPT = DICE;
  scriptDice([]);
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
    payload: { name: 'Kampania cieni' },
  });
  const campaignId = (campaignRes.json() as CampaignSummary).id;
  const joinRes = await built.app.inject({
    method: 'POST',
    url: await joinUrl(built, campaignId, 'Vex'),
  });
  playerCookie = cookieOf(joinRes.headers['set-cookie']);
  playerId = (joinRes.json() as { user: { id: string } }).user.id;
}, 60_000);

afterAll(async () => {
  if (previousDiceScript === undefined) delete process.env.VTT_DICE_SCRIPT;
  else process.env.VTT_DICE_SCRIPT = previousDiceScript;
  for (const socket of openSockets) socket.disconnect();
  await built.app.close();
  try {
    unlinkSync(TEST_DB);
  } catch {
    // best effort — Windows may still hold the file
  }
});

describe('tryb skradania (etap 61)', () => {
  let gm: ClientSocket;
  let vex: ClientSocket;
  let sceneId: string;
  let vexCardId: string;
  let vexId: string;
  let guardId: string;
  let zbirId: string;
  let wallIds: number[] = [];

  /** Wiersze MG o Percepcji przeciw skradaniu, od chwili wyczyszczenia. */
  const gmLines: ChatMessageView[] = [];
  /** Co doszło do gracza na czacie — rzuty Percepcji nie mają prawa tu być. */
  const heard: ChatMessageView[] = [];

  const tokenOf = async (socket: ClientSocket, id: string) =>
    (await stateOf(socket)).tokens.find((token) => token.id === id);
  const combatOf = async (): Promise<CombatView | null> => (await stateOf(gm)).combat;

  async function gmMove(tokenId: string, x: number, y: number): Promise<void> {
    data(await emitAck(gm, 'token:move', { tokenId, x, y, final: true }), `token:move ${tokenId}`);
  }

  /**
   * Cała droga do trybu: prośba gracza, zgoda MG z modyfikatorem, rzut
   * kubkiem na wezwanie. `dice` — kość Vex, potem kości Percepcji NPC-ów,
   * które padną zaraz po wejściu w tryb.
   */
  async function sneakIn(modifier: number, dice: number[]): Promise<ChatMessageView> {
    const asked = data(
      await emitAck<{ messageId: number }>(vex, 'sneak:request', { tokenId: vexId }),
      'sneak:request',
    );
    const resolved = data(
      await emitAck<{ callMessageId?: number }>(gm, 'check:request-resolve', {
        messageId: asked.messageId,
        approve: true,
        modifier,
      }),
      'check:request-resolve',
    );
    expect(resolved.callMessageId).toBeTypeOf('number');
    scriptDice(dice);
    const card = new Promise<ChatMessageView>((resolve) => {
      const onCard = ({ message }: ChatMessageBroadcast) => {
        if (message.kind !== 'gmroll' || !message.roll?.title?.includes('Skradanie')) return;
        vex.off('chat:message', onCard);
        resolve(message);
      };
      vex.on('chat:message', onCard);
    });
    data(
      await emitAck<{ messageId: number }>(vex, 'character:roll', {
        callMessageId: resolved.callMessageId,
      }),
      'character:roll (Skradanie)',
    );
    return card;
  }

  it('zastawia stół: Vex, Wrogi Strażnik za ścianą i Zbir w kącie', async () => {
    const gmConn = createSocket(gmCookie);
    const vexConn = createSocket(playerCookie);
    gm = gmConn.socket;
    vex = vexConn.socket;
    await Promise.all([gmConn.firstSync, vexConn.firstSync]);
    gm.on('chat:message', ({ message }: ChatMessageBroadcast) => {
      if (message.kind === 'gmaction' && message.action?.actionName.includes('skradanie')) {
        gmLines.push(message);
      }
    });
    vex.on('chat:message', ({ message }: ChatMessageBroadcast) => heard.push(message));

    sceneId = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Magazyn' }), 'scene').id;
    await emitAck(gm, 'scene:update', {
      sceneId,
      patch: { width: 2000, height: 2000, grid: { sizePx: 100 }, metersPerSquare: 2 },
    });
    await emitAck(gm, 'scene:update', { sceneId, patch: { playerMove: 'explore' } });
    const activated = waitFor(vex, 'scene:activate');
    await emitAck(gm, 'scene:activate', { sceneId });
    await activated;

    const card = data(
      await emitAck<CharacterView>(gm, 'character:create', { name: 'Vex', ownerId: playerId }),
      'character:create Vex',
    );
    vexCardId = card.id;
    await emitAck(gm, 'character:update', {
      characterId: vexCardId,
      patch: {
        data: {
          stats: { ...(card.data as CpredCharacterData).stats, dex: 6, body: 6 },
          skills: { stealth: 6 },
          // Ostrze z przykładowego kompendium (`data/public`) — Bijatyka ma wpis
          // tylko w danych prywatnych.
          weapons: [
            {
              id: 'w-blade',
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
    });
    const npcCard = async (name: string, int: number, perception: number) => {
      const npc = data(
        await emitAck<CharacterView>(gm, 'character:create', { name }),
        `character:create ${name}`,
      );
      await emitAck(gm, 'character:update', {
        characterId: npc.id,
        patch: {
          data: {
            stats: { ...(npc.data as CpredCharacterData).stats, int },
            skills: { perception },
          },
        },
      });
      return npc.id;
    };
    const guardCard = await npcCard('Strażnik', 4, 4);
    const zbirCard = await npcCard('Zbir', 8, 10);

    const walls = async (points: { x: number; y: number }[]) =>
      data(
        await emitAck<WallView[]>(gm, 'wall:create', { sceneId, kind: 'wall', points }),
        'wall',
      ).map((wall) => wall.id);
    // Pełna ściana między Vex a Strażnikiem.
    wallIds = await walls([
      { x: 1000, y: 0 },
      { x: 1000, y: 2000 },
    ]);
    // Kąt Zbira: od lewej i od dołu, w prawym górnym rogu.
    await walls([
      { x: 1200, y: 0 },
      { x: 1200, y: 400 },
      { x: 2000, y: 400 },
    ]);

    const create = async (name: string, at: { x: number; y: number }, characterId: string) =>
      data(
        await emitAck<TokenView>(gm, 'token:create', { sceneId, name, ...at, characterId }),
        `token:create ${name}`,
      ).id;
    vexId = data(
      await emitAck<TokenView>(gm, 'token:create', {
        sceneId,
        name: 'Vex',
        x: 500,
        y: 1100,
        ownerId: playerId,
        characterId: vexCardId,
      }),
      'token:create Vex',
    ).id;
    guardId = await create('Strażnik', { x: 1400, y: 1100 }, guardCard);
    zbirId = await create('Zbir', { x: 1500, y: 100 }, zbirCard);
    await emitAck(gm, 'token:update', { tokenId: guardId, patch: { disposition: 'hostile' } });
    expect(await combatOf()).toBeNull();
    expect(await tokenOf(vex, vexId)).toMatchObject({ sneaking: false });
  });

  it('odmawia: MG nie prosi, druga prośba czeka, „Ustaw…” nie zamienia prośby w zwykły Test', async () => {
    expect(await emitAck(gm, 'sneak:request', { tokenId: vexId })).toEqual({
      ok: false,
      error: 'BAD_REQUEST',
    });
    const asked = data(
      await emitAck<{ messageId: number }>(vex, 'sneak:request', { tokenId: vexId }),
      'sneak:request',
    );
    expect(await emitAck(vex, 'sneak:request', { tokenId: vexId })).toEqual({
      ok: false,
      error: 'SNEAK_PENDING',
    });
    const viaFullCall = await emitAck(gm, 'check:call', {
      characterId: vexCardId,
      request: { kind: 'skill', skillId: 'stealth' },
      dv: 15,
      requestMessageId: asked.messageId,
    });
    expect(viaFullCall).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect((await emitAck(vex, 'check:request-cancel', { messageId: asked.messageId })).ok).toBe(
      true,
    );
  });

  it('zgoda z modyfikatorem i rzut kubkiem: wynik to PT, figura się skrada', async () => {
    // 12 + 2 (MG) + 5 = 19.
    const card = await sneakIn(2, [5]);
    expect(card.roll?.total).toBe(19);
    expect(card.roll?.outcome).toMatchObject({ success: true, label: 'Skradasz się' });
    expect(card.roll?.breakdown?.some((row) => row.value === 2)).toBe(true);
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: true, sneakDv: 19 });
    expect(await tokenOf(vex, vexId)).toMatchObject({ sneaking: true, sneakDv: 19 });
    expect(await emitAck(vex, 'sneak:request', { tokenId: vexId })).toEqual({
      ok: false,
      error: 'SNEAK_ACTIVE',
    });
  });

  it('Strażnik, który zobaczy Vex i nie przebije PT, nie zaczyna walki — choć Vex go widzi', async () => {
    gmLines.length = 0;
    heard.length = 0;
    // Percepcja 8 + 5 = 13 ≤ 19.
    scriptDice([5]);
    for (const id of wallIds) {
      expect((await emitAck(gm, 'wall:delete', { wallId: id })).ok).toBe(true);
    }
    await expect.poll(() => gmLines.length).toBe(1);
    expect(gmLines[0]!.action?.note).toContain('wynik 13 vs Skradanie 19');
    expect(gmLines[0]!.action?.note).toContain('nie zauważa: Vex');
    expect(await combatOf()).toBeNull();
    expect((await stateOf(vex)).tokens.map((token) => token.id)).toContain(guardId);
    expect(JSON.stringify(heard)).not.toContain('Percepcja');
  });

  it('ten sam NPC przy tym samym skradaniu nie rzuca drugi raz', async () => {
    gmLines.length = 0;
    await gmMove(guardId, 1400, 1300);
    await stateOf(gm);
    expect(gmLines).toEqual([]);
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: true });
  });

  it('„Przestań się skradać” kończy tryb, a wtedy Wrogi w zasięgu wzroku zakłada walkę', async () => {
    expect((await emitAck(vex, 'sneak:stop', { tokenId: vexId })).ok).toBe(true);
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: false, sneakDv: null });
    const combat = await combatOf();
    expect(combat?.round).toBe(0);
    expect(combat?.sighting?.foeIds).toEqual([guardId]);
    // „Odwołaj” — Strażnik przechodzi na Neutralną (etap 56).
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
  });

  it('Neutralny, który zauważy, kończy tryb: gracz dostaje pasek, MG — kto kogo, walki nie ma', async () => {
    gmLines.length = 0;
    const ended = waitFor<SneakEndedBroadcast>(vex, 'sneak:ended');
    const noticed = waitFor<SneakNoticedBroadcast>(gm, 'sneak:noticed');
    // 12 − 2 + 3 = 13; Strażnik 8 + 6 = 14 > 13.
    await sneakIn(-2, [3, 6]);
    expect((await ended).text).toBe('Zauważono cię — Vex przestaje się skradać.');
    expect(await noticed).toMatchObject({ observerId: guardId, sneakerId: vexId });
    expect(gmLines.at(-1)?.action?.note).toContain('zauważa: Vex');
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: false });
    expect(await combatOf()).toBeNull();
  });

  it('Wrogi, który zauważy skradającego się, zakłada starcie z nim jako zauważonym', async () => {
    await emitAck(gm, 'token:update', { tokenId: zbirId, patch: { disposition: 'hostile' } });
    // 12 + 0 + 8 = 20; Strażnik (Neutralny) 8 + 2 = 10 — nie zauważa.
    await sneakIn(0, [8, 2]);
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: true, sneakDv: 20 });
    expect(await combatOf()).toBeNull();

    const ended = waitFor<SneakEndedBroadcast>(vex, 'sneak:ended');
    // Zbir wychodzi zza rogu: 18 + 9 = 27 > 20.
    scriptDice([9]);
    await gmMove(zbirId, 1400, 900);
    expect((await ended).text).toContain('Zauważono cię');
    const combat = await combatOf();
    expect(combat?.round).toBe(0);
    expect(combat?.sighting?.foeIds).toEqual([zbirId]);
    expect(combat?.sighting?.spotterIds).toEqual([vexId]);
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
  });

  it('atak ze skradania zabiera celowi Unik i kończy tryb', async () => {
    // 12 + 0 + 8 = 20; Strażnik 8 + 2 = 10, Zbir 18 + 2 = 20 — remis wygrywa Vex.
    await sneakIn(0, [8, 2, 2]);
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: true });
    await gmMove(vexId, 1300, 1300);
    const ended = waitFor<SneakEndedBroadcast>(vex, 'sneak:ended');
    const attackCard = new Promise<ChatMessageView>((resolve) => {
      const onCard = ({ message }: ChatMessageBroadcast) => {
        if (!message.roll?.attack) return;
        gm.off('chat:message', onCard);
        resolve(message);
      };
      gm.on('chat:message', onCard);
    });
    scriptDice([6]);
    data(
      await emitAck(vex, 'attack:roll', {
        characterId: vexCardId,
        targetTokenId: guardId,
        attackerTokenId: vexId,
        request: { weaponRowId: 'w-blade', mode: 'single' },
      }),
      'attack:roll',
    );
    const attack = (await attackCard).roll!.attack!;
    expect(attack.noEvade).toBe(true);
    expect(attack.detail).toContain('atak z ukrycia');
    expect((await ended).text).toContain('Atak');
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: false });
  });

  it('w trwającej rundzie wejście kosztuje Akcję, a bez Akcji prośba odpada', async () => {
    const setup = data(
      await emitAck<CombatView>(gm, 'combat:add', { tokenIds: [vexId, guardId] }),
      'combat:add',
    );
    const rowOf = (tokenId: string) => setup.combatants.find((row) => row.tokenId === tokenId)!;
    await emitAck(gm, 'combat:set-initiative', { combatantId: rowOf(vexId).id, initiative: 20 });
    await emitAck(gm, 'combat:set-initiative', { combatantId: rowOf(guardId).id, initiative: 5 });
    expect((await emitAck(gm, 'combat:next')).ok).toBe(true);
    expect((await combatOf())?.round).toBe(1);

    // 12 + 0 + 8 = 20; Strażnik i Zbir — 10 i 20, żaden nie przebije.
    await sneakIn(0, [8, 2, 2]);
    const vexRow = (await combatOf())?.combatants.find((row) => row.tokenId === vexId);
    expect(vexRow?.turn?.resources.find((row) => row.id === 'action')?.used).toBe(1);

    expect((await emitAck(vex, 'sneak:stop', { tokenId: vexId })).ok).toBe(true);
    expect(await emitAck(vex, 'sneak:request', { tokenId: vexId })).toEqual({
      ok: false,
      error: 'NO_ACTION_LEFT',
    });
    expect((await emitAck(gm, 'combat:end')).ok).toBe(true);
  });

  it('zmiana sceny zdejmuje tryb', async () => {
    // 12 + 0 + 8 = 20; Strażnik 8 + 2 = 10, Zbir 18 + 2 = 20 — żaden nie przebije.
    await sneakIn(0, [8, 2, 2]);
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: true });
    const ended = waitFor<SneakEndedBroadcast>(vex, 'sneak:ended');
    const other = data(await emitAck<SceneView>(gm, 'scene:create', { name: 'Dach' }), 'scene');
    await emitAck(gm, 'scene:activate', { sceneId: other.id });
    expect((await ended).text).toContain('Zmiana sceny');
    expect(await tokenOf(gm, vexId)).toMatchObject({ sneaking: false });
  });
});
