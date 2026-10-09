import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { CampaignSummary, SocketAck, StateSyncPayload } from '@vtt/shared';
import { ROLE_PLAYER } from '@vtt/shared';
import type { ServerConfig } from './config.js';
import { buildApp, type BuiltApp } from './app.js';
import { createSession, SESSION_COOKIE } from './auth/sessions.js';
import { exportCharacter, exportScene } from './archive.js';
import { EVENTS } from './realtime/index.js';
import { campaignRoom, gmRoom, sceneRoom } from './realtime/state.js';

/**
 * Etap 44b: macierz „gniazdo MG-B × identyfikatory MG-A”.
 *
 * Każde zdarzenie z `EVENTS` ma tu wpis — nowe zdarzenie bez wpisu wywraca
 * test „każde zdarzenie ma przypadek”. Wpis mówi, czy zdarzenie bierze z
 * ładunku identyfikator obiektu (`foreign` — wtedy dostaje obiekty kampanii A
 * i ma odmówić kodem `*NOT_FOUND`, żeby odmowa nie zdradzała, że obiekt
 * istnieje), czy działa tylko na kampanii gniazda (`own` — z powodem).
 *
 * Niezależnie od wpisu każde wywołanie pilnują trzy wyrocznie:
 * 1. żaden wiersz bazy sprzed macierzy (kampania A i jej świat) się nie
 *    zmienił, a nowy wiersz nie wymienia identyfikatora kampanii A;
 * 2. gniazda MG-A i gracza A nie usłyszały niczego;
 * 3. ani ack, ani nic, co usłyszały gniazda kampanii B, nie niesie
 *    identyfikatora ani kanarka kampanii A.
 *
 * Kampania aktywna jest jeszcze jedna na serwer (aktywna per MG to 44c), więc
 * aktywna jest B, a gniazda kampanii A siedzą w jej pokojach dopięte z serwera
 * — tak, jak będą tam siedzieć po 44c.
 */

const TEST_DB = `./.test-${randomBytes(6).toString('hex')}.db`;
const GM_PASSWORD = 'test-haslo';
const CANARY = 'KANAREK-A';
const COMPENDIUM_SLUG = 'gear.kanarek';
/** Strefa obronna z próbki kompendium (`data/public`). */
const ZONE_ENTRY = 'defense.oko-korytarza';

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
  registrationOpen: true,
};

/** Gateway, który jest zdrowy — żeby odmowa „AI niedostępne” nie zasłaniała strażnika. */
const aiFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith('/health')) {
    return Response.json({
      status: 'ok',
      llama: 'ready',
      model: 'test.gguf',
      context_size: 8192,
      queue_length: 0,
      busy: false,
      managed: true,
      restarts: 0,
      last_error: null,
      gpu: null,
    });
  }
  return new Response('nope', { status: 500 });
};

let built: BuiltApp;
let baseUrl: string;
const openSockets: ClientSocket[] = [];

/** Obiekty jednej kampanii — po jednym każdego rodzaju. */
interface World {
  campaignId: string;
  gmId: string;
  playerId: string;
  sceneId: string;
  tokenId: string;
  npcTokenId: string;
  characterId: string;
  npcId: string;
  botId: string;
  handoutId: string;
  journalId: string;
  knowledgeId: string;
  compendiumId: string;
  tableId: string;
  rowId: string;
  wallId: number;
  coverId: number;
  lightId: number;
  noteId: string;
  drawingId: number;
  smokeId: number;
  zoneId: number;
  architectureId: string;
  accessPointId: number;
  runId: string;
  combatId: string;
  combatantId: string;
  messageId: number;
  draftId: string;
  tokenAssetId: string;
  portraitAssetId: string;
  merchantId: string;
}

let A: World;
let B: World;
let gmA: ClientSocket;
let playerA: ClientSocket;
let gmB: ClientSocket;
let playerB: ClientSocket;
let gmACookie: string;
let gmBCookie: string;
/** Wszystko, co usłyszały gniazda kampanii A (ma zostać puste). */
const heardByA: string[] = [];
/** Wszystko, co usłyszały gniazda kampanii B (nie może nieść niczego z A). */
const heardByB: string[] = [];

function cookieOf(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('missing set-cookie header');
  return raw.split(';')[0]!;
}

async function connect(cookie: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, {
    extraHeaders: { cookie },
    reconnection: false,
    timeout: 3000,
  });
  openSockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('state:sync timeout')), 4000);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('state:sync', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return socket;
}

function emitAck(
  socket: ClientSocket,
  event: string,
  payload: unknown,
): Promise<SocketAck<unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), 4000);
    socket.emit(event, payload, (response: SocketAck<unknown>) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

/** Ciasteczko gracza bez trasy wejścia — sama sesja, jak po wejściu z linku. */
async function playerCookie(userId: string): Promise<string> {
  const session = await createSession(built.prisma, userId, 1);
  return `${SESSION_COOKIE}=${built.app.signCookie(session.id)}`;
}

async function createCampaign(cookie: string, name: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as CampaignSummary).id;
}

/**
 * Świat kampanii wprost w bazie — po jednym obiekcie każdego rodzaju, z aktywną
 * sceną. Świat A niesie kanarka w każdej nazwie, świat B — zwykłą etykietę.
 */
async function seedWorld(campaignId: string, gmId: string, label: string): Promise<World> {
  const p = built.prisma;
  const name = `${label} ${randomBytes(3).toString('hex')}`;
  const player = await p.user.create({ data: { name: `${label}-gracz`, role: ROLE_PLAYER } });
  await p.campaignMember.create({ data: { campaignId, userId: player.id } });
  const scene = await p.scene.create({ data: { name, campaignId, active: true } });
  const character = await p.character.create({
    data: { name, campaignId, ownerId: player.id },
  });
  const npc = await p.character.create({ data: { name: `${name} NPC`, campaignId } });
  const token = await p.token.create({
    data: {
      sceneId: scene.id,
      name,
      x: 100,
      y: 100,
      characterId: character.id,
      ownerId: player.id,
    },
  });
  const npcToken = await p.token.create({
    data: { sceneId: scene.id, name: `${name} NPC`, x: 200, y: 100, characterId: npc.id },
  });
  const bot = await p.botProfile.create({ data: { campaignId, name, characterId: npc.id } });
  await p.botRelation.create({ data: { botId: bot.id, characterId: character.id } });
  const handout = await p.handout.create({ data: { campaignId, title: name } });
  await p.handoutShare.create({ data: { handoutId: handout.id, userId: player.id } });
  const journal = await p.journalEntry.create({
    data: { campaignId, title: name, body: name, sessionDate: '2026-10-03' },
  });
  const knowledge = await p.knowledgeEntry.create({
    data: { campaignId, title: name, body: name },
  });
  const compendium = await p.compendiumEntry.create({
    data: {
      campaignId,
      slug: label === CANARY ? COMPENDIUM_SLUG : 'gear.wlasny',
      category: 'gear',
      data: JSON.stringify({ name }),
    },
  });
  const table = await p.randomTable.create({ data: { campaignId, name } });
  const row = await p.randomTableRow.create({ data: { tableId: table.id, min: 1, max: 10 } });
  const wall = await p.wall.create({ data: { sceneId: scene.id, x1: 0, y1: 0, x2: 50, y2: 0 } });
  const cover = await p.cover.create({
    data: {
      sceneId: scene.id,
      typeId: 'wood-wall',
      name,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      hpMax: 10,
      hpCurrent: 10,
    },
  });
  const light = await p.mapLight.create({ data: { sceneId: scene.id, x: 0, y: 0 } });
  const note = await p.mapNote.create({ data: { sceneId: scene.id, x: 0, y: 0, text: name } });
  const drawing = await p.mapDrawing.create({
    data: { sceneId: scene.id, authorId: gmId, kind: 'line', data: '[]', color: '#fff', width: 2 },
  });
  const smoke = await p.smoke.create({ data: { sceneId: scene.id, x: 0, y: 0, sideM: 2 } });
  const zone = await p.defenseZone.create({
    data: { sceneId: scene.id, entryId: ZONE_ENTRY, name, x: 0, y: 0, width: 5, height: 5 },
  });
  const architecture = await p.netArchitecture.create({
    data: { campaignId, name, data: JSON.stringify({ floors: [] }) },
  });
  const accessPoint = await p.netAccessPoint.create({
    data: { sceneId: scene.id, x: 0, y: 0, architectureId: architecture.id },
  });
  const run = await p.netRun.create({
    data: {
      campaignId,
      architectureId: architecture.id,
      accessPointId: accessPoint.id,
      tokenId: token.id,
      characterId: character.id,
    },
  });
  const combat = await p.combat.create({ data: { sceneId: scene.id } });
  const combatant = await p.combatant.create({ data: { combatId: combat.id, tokenId: token.id } });
  const message = await p.chatMessage.create({
    data: { campaignId, authorId: gmId, kind: 'text', text: name },
  });
  const draft = await p.characterDraft.create({ data: { campaignId, userId: player.id } });
  const tokenAsset = await p.tokenAsset.create({
    data: { campaignId, name, url: '/uploads/tokens/kanarek.png', width: 10, height: 10 },
  });
  const portraitAsset = await p.portraitAsset.create({
    data: { campaignId, name, url: '/uploads/portraits/kanarek.webp', width: 10, height: 10 },
  });
  // Sklep (etap 46a): NPC kampanii jest handlarzem — otwartym i zdalnym, żeby
  // odmowa przy obcym `merchantId` nie zasłaniała się zamknięciem ani zasięgiem.
  const merchant = await p.merchant.create({
    data: { campaignId, characterId: npc.id, sign: name, open: true, access: 'remote' },
  });
  return {
    campaignId,
    gmId,
    playerId: player.id,
    sceneId: scene.id,
    tokenId: token.id,
    npcTokenId: npcToken.id,
    characterId: character.id,
    npcId: npc.id,
    botId: bot.id,
    handoutId: handout.id,
    journalId: journal.id,
    knowledgeId: knowledge.id,
    compendiumId: compendium.id,
    tableId: table.id,
    rowId: row.id,
    wallId: wall.id,
    coverId: cover.id,
    lightId: light.id,
    noteId: note.id,
    drawingId: drawing.id,
    smokeId: smoke.id,
    zoneId: zone.id,
    architectureId: architecture.id,
    accessPointId: accessPoint.id,
    runId: run.id,
    combatId: combat.id,
    combatantId: combatant.id,
    messageId: message.id,
    draftId: draft.id,
    tokenAssetId: tokenAsset.id,
    portraitAssetId: portraitAsset.id,
    merchantId: merchant.id,
  };
}

// ---------------------------------------------------------------------------
// Wyrocznia bazy: migawka wszystkich wierszy.

/** Kolumny, które zmieniają się same z siebie (wejście gniazda, przełączenie aktywnej). */
const VOLATILE = new Set(['lastSeenAt', 'active', 'updatedAt']);

type Snapshot = Map<string, string>;

async function snapshot(): Promise<Snapshot> {
  const rows: Snapshot = new Map();
  const client = built.prisma as unknown as Record<
    string,
    { findMany?: () => Promise<Record<string, unknown>[]> }
  >;
  const models = Object.keys(client).filter(
    (key) =>
      !key.startsWith('$') && !key.startsWith('_') && typeof client[key]?.findMany === 'function',
  );
  for (const model of models) {
    // Sesje rodzą się przy każdym wejściu — to nie jest świat kampanii.
    if (model === 'session') continue;
    for (const row of await client[model]!.findMany!()) {
      const stable = Object.fromEntries(Object.entries(row).filter(([key]) => !VOLATILE.has(key)));
      const value = JSON.stringify(stable);
      const key = 'id' in row ? `${model}:${String(row.id)}` : `${model}:${value}`;
      rows.set(key, value);
    }
  }
  return rows;
}

let protectedRows: Snapshot;
/** Identyfikatory kampanii A, które jako napis da się wyszukać w cudzym wierszu. */
let foreignStrings: string[];

async function databaseBreaches(): Promise<string[]> {
  const now = await snapshot();
  const breaches: string[] = [];
  for (const [key, value] of protectedRows) {
    const after = now.get(key);
    if (after === undefined) breaches.push(`usunięty ${key}`);
    else if (after !== value) breaches.push(`zmieniony ${key}: ${value} → ${after}`);
  }
  for (const [key, value] of now) {
    if (protectedRows.has(key)) continue;
    const named = foreignStrings.find((id) => value.includes(id));
    if (named) breaches.push(`nowy ${key} wymienia ${named}`);
  }
  return breaches;
}

function leaks(text: string): string | undefined {
  return foreignStrings.find((id) => text.includes(id));
}

// ---------------------------------------------------------------------------
// Przypadki.

/** `a` — świat cudzy (kampania A), `b` — własny świat gniazda (kampania B). */
type Payload = (a: World, b: World) => unknown;

/** Kody „nie ma takiego obiektu”. `NET_NOT_JACKED` to w Sieci „nie ma takiego runu”. */
const NOT_FOUND = /NOT_FOUND$|^NET_NOT_JACKED$/;

interface ForeignCase {
  kind: 'foreign';
  payload: Payload;
  /** Inna odmowa niż `NOT_FOUND`, gdy zdarzenie ma własny kod na „nie twoje”. */
  expect?: RegExp;
  /** Odmowa dla gracza B, gdy różni się od MG-B (zdarzenia dla obu ról). */
  player?: RegExp;
}
interface OwnCase {
  kind: 'own';
  /** Dlaczego zdarzenie nie bierze obcego identyfikatora. */
  why: string;
  payload?: Payload;
}
type Case = ForeignCase | OwnCase;

const foreign = (
  payload: Payload,
  extra: Omit<ForeignCase, 'kind' | 'payload'> = {},
): ForeignCase => ({
  kind: 'foreign',
  payload,
  ...extra,
});
const own = (why: string, payload?: Payload): OwnCase => ({
  kind: 'own',
  why,
  ...(payload ? { payload } : {}),
});

const SELF_DRAFT = 'działa na szkicu konta gniazda w kampanii gniazda';
const VIEWED_SCENE = 'walka sceny oglądanej przez gniazdo (`viewedSceneId`)';

const CASES: Record<string, Case> = {
  // advancement
  'character:advance': foreign((a) => ({
    characterId: a.characterId,
    kind: 'skill',
    skillId: 'athletics',
  })),
  'character:role-change': foreign((a) => ({ characterId: a.characterId, roleId: 'solo' })),
  'character:xp-award': foreign((a) => ({ characterId: a.characterId, amount: 10, label: 'x' })),
  'character:xp-history': foreign((a) => ({ characterId: a.characterId })),
  // ai
  'ai:ask': own('pytanie testowe do modelu, bez obiektów kampanii', () => ({ prompt: 'hej' })),
  'ai:refresh': own('odświeża status gatewaya'),
  'token:aim': foreign((a) => ({ tokenId: a.tokenId, facing: 1 })),
  // archive
  'archive:list': own('tylko właściciel serwera — MG-B dostaje FORBIDDEN'),
  'archive:snapshot': own('tylko właściciel serwera — MG-B dostaje FORBIDDEN'),
  'archive:character': foreign((a) => ({ file: {}, ownerId: a.playerId })),
  'archive:scene': own('plik z dysku MG — obce id w pliku sprawdza osobny test niżej'),
  // attacks
  'attack:roll': foreign((a) => ({
    attackerTokenId: a.tokenId,
    targetTokenId: a.npcTokenId,
    weaponRowId: 'x',
    mode: 'single',
  })),
  'attack:evade': foreign((a) => ({ messageId: a.messageId })),
  'attack:smart': foreign((a) => ({ messageId: a.messageId })),
  'attack:no-evade': foreign((a) => ({ messageId: a.messageId })),
  'weapon:reload': foreign((a) => ({
    characterId: a.characterId,
    weaponRowId: 'x',
    ammoId: 'basic',
  })),
  'weapon:clear-jam': foreign((a) => ({ characterId: a.characterId, weaponRowId: 'x' })),
  'weapon:draw': foreign((a) => ({ characterId: a.characterId, weaponRowId: 'x' })),
  'weapon:attachment': foreign((a) => ({
    characterId: a.characterId,
    weaponRowId: 'x',
    attachmentId: 'x',
    action: 'install',
  })),
  'backup:resolve': foreign((a) => ({ sceneId: a.sceneId, pendingId: 'x', action: 'cancel' })),
  // bots
  'bot:proposal': foreign((a) => ({ botId: a.botId, messageId: a.messageId, approve: true })),
  'bot:act': foreign((a) => ({ botId: a.botId, request: { kind: 'stat', statId: 'ref' } })),
  'bot:chat': foreign((a) => ({ botId: a.botId, message: 'hej' })),
  'bot:teach': foreign((a) => ({ botId: a.botId, correction: 'hej', quote: 'hej' })),
  'bot:play-turn': foreign((a) => ({ tokenId: a.npcTokenId })),
  'bot:say': foreign((a) => ({ botId: a.botId, text: 'hej' })),
  'bot:stop': own('kolejka botów kampanii gniazda — `turnId` szukany tylko w niej'),
  'bot:create': own('nowy bot w kampanii gniazda', () => ({ name: 'Bot nowy' })),
  'bot:update': foreign((a) => ({ botId: a.botId, patch: { name: 'x' } })),
  'bot:delete': foreign((a) => ({ botId: a.botId })),
  'bot:duplicate': foreign((a) => ({ botId: a.botId })),
  'campaign:open': foreign((a) => ({ campaignId: a.campaignId })),
  'session:start': foreign((a) => ({ campaignId: a.campaignId })),
  'session:end': foreign((a) => ({ campaignId: a.campaignId })),
  'character:roll': foreign((a) => ({
    characterId: a.characterId,
    request: { kind: 'stat', statId: 'ref' },
  })),
  // characters
  'character:create': foreign((a) => ({ name: 'Postać nowa', ownerId: a.playerId }), {
    player: /^FORBIDDEN$/,
  }),
  'character:update': foreign((a) => ({ characterId: a.characterId, patch: { name: 'x' } })),
  'character:delete': foreign((a) => ({ characterId: a.characterId })),
  'character:play-ready': foreign((a) => ({ characterId: a.characterId, ready: true })),
  'character:combat-awareness': foreign((a) => ({ characterId: a.characterId })),
  'character:field-repair': foreign((a) => ({ characterId: a.characterId, armorRowId: 'x' })),
  'character:backup-call': foreign((a) => ({ characterId: a.characterId, tokenId: a.tokenId })),
  // chat
  'chat:send': own('pisze w kampanii gniazda', () => ({ text: 'hej' })),
  'chat:history': own('kartkuje czat kampanii gniazda', (a) => ({ beforeId: a.messageId + 1 })),
  // checks
  'check:call': foreign((a) => ({
    characterId: a.characterId,
    request: { kind: 'stat', statId: 'ref' },
    dv: 13,
  })),
  'check:cancel': foreign((a) => ({ messageId: a.messageId })),
  'check:request': foreign((a) => ({
    characterId: a.characterId,
    request: { kind: 'stat', statId: 'ref' },
  })),
  'check:request-cancel': foreign((a) => ({ messageId: a.messageId })),
  'check:request-resolve': foreign((a) => ({ messageId: a.messageId, approve: true })),
  // combat-actions
  'combat:action': foreign((a) => ({ combatantId: a.combatantId, actionId: 'dodge' })),
  'combat:allow': foreign((a) => ({ combatantId: a.combatantId })),
  'combat:hold': foreign((a) => ({ combatantId: a.combatantId, trigger: 'x' })),
  'combat:hold-release': foreign((a) => ({ combatantId: a.combatantId })),
  'combat:reset-turn': foreign((a) => ({ combatantId: a.combatantId })),
  'combat:terrain': foreign((a) => ({ combatantId: a.combatantId, hard: true })),
  'combat:remove': foreign((a) => ({ combatantId: a.combatantId })),
  'combat:next': own(VIEWED_SCENE),
  'combat:previous': own(VIEWED_SCENE),
  'combat:end': own(VIEWED_SCENE),
  // combat
  'combat:start': foreign((a) => ({ sceneId: a.sceneId, tokenIds: [a.tokenId] })),
  'combat:add': foreign((a) => ({ sceneId: a.sceneId, tokenIds: [a.tokenId] })),
  'combat:roll-all': own(VIEWED_SCENE),
  'combat:reroll-tie': foreign((a) => ({ combatantIds: [a.combatantId] })),
  'combat:roll': foreign((a) => ({ combatantId: a.combatantId })),
  'combat:set-initiative': foreign((a) => ({ combatantId: a.combatantId, initiative: 10 })),
  'combat:order': foreign((a) => ({ combatantIds: [a.combatantId] })),
  // compendium
  'compendium:upsert': own(
    'wpis MG ma slug w obrębie kampanii — ten sam slug w B to wpis B',
    () => ({
      entry: { id: 'gear.inny', name: 'x', category: 'gear' },
    }),
  ),
  'compendium:delete': foreign(() => ({ id: COMPENDIUM_SLUG })),
  // covers
  'cover:create': foreign((a) => ({
    sceneId: a.sceneId,
    typeId: 'wood-wall',
    x: 1,
    y: 1,
    width: 2,
    height: 2,
  })),
  'cover:update': foreign((a) => ({ coverId: a.coverId, patch: { name: 'x' } })),
  'cover:delete': foreign((a) => ({ coverId: a.coverId })),
  'cover:clear': foreign((a) => ({ sceneId: a.sceneId })),
  // creation
  'creation:permit-state': own('stan zgody konta gniazda'),
  'creation:request': own('prośba gracza gniazda o zgodę'),
  'creation:permit': foreign((a) => ({ userId: a.playerId, grant: true })),
  'creation:accept-rules': own('gracz gniazda czyta zasady'),
  'creation:discard-player': foreign((a) => ({ draftId: a.draftId })),
  'creation:start': own(SELF_DRAFT),
  'creation:patch': foreign((a) => ({ draftId: a.draftId, patch: {}, revision: 0 })),
  'creation:roll': own(SELF_DRAFT),
  'creation:terms': foreign((a) => ({
    draftId: a.draftId,
    terms: { method: 'edgerunner', statRankId: 'starting', skillPoints: 60 },
  })),
  'creation:reroll': foreign((a) => ({ draftId: a.draftId, statIds: ['ref'] })),
  'creation:buy': own(SELF_DRAFT),
  'creation:permits': own('lista zgód kampanii gniazda'),
  'creation:peek': own(SELF_DRAFT),
  'creation:ranks': own('rangi szkiców kampanii gniazda'),
  'creation:set-rank': foreign((a) => ({ draftId: a.draftId, statRankId: 'starting' })),
  'creation:finish': foreign((a) => ({ draftId: a.draftId })),
  'creation:lifepath-roll': own(SELF_DRAFT),
  'creation:lifepath-count': own(SELF_DRAFT),
  'creation:discard': own(SELF_DRAFT),
  'character:cyberware': foreign((a) => ({
    characterId: a.characterId,
    action: 'install',
    entryId: 'x',
  })),
  // damage
  'damage:apply': foreign((a) => ({
    messageId: a.messageId,
    tokenId: a.tokenId,
    characterId: a.characterId,
  })),
  'character:injury': foreign((a) => ({ characterId: a.characterId, injuryId: 'x' })),
  'damage:undo': foreign((a) => ({ messageId: a.messageId })),
  'dice:skin': own('skórka kości konta gniazda', () => ({ skin: 'neon' })),
  // drawings
  'drawing:create': foreign((a) => ({
    sceneId: a.sceneId,
    shape: { kind: 'line', points: [0, 0, 1, 1] },
  })),
  'drawing:update': foreign((a) => ({ drawingId: a.drawingId, patch: { color: '#000' } })),
  'drawing:delete': foreign((a) => ({ drawingId: a.drawingId })),
  'drawing:clear': foreign((a) => ({ sceneId: a.sceneId, scope: 'all' })),
  // economy
  'economy:buy': foreign((a) => ({ characterId: a.characterId, entryId: 'x' })),
  'economy:transfer': foreign((a) => ({
    fromCharacterId: a.characterId,
    toCharacterId: a.npcId,
    amount: 1,
  })),
  'economy:adjust': foreign((a) => ({ characterId: a.characterId, amount: 1, reason: 'x' })),
  'economy:settle': own('rozlicza style życia postaci kampanii gniazda'),
  'economy:history': foreign((a) => ({ characterId: a.characterId })),
  // exploration
  'explore:forget': foreign((a) => ({ sceneId: a.sceneId })),
  'scene:explore': foreign((a) => ({ sceneId: a.sceneId, explore: true })),
  // facedown
  'facedown:attempt': foreign((a) => ({
    characterId: a.characterId,
    challengerTokenId: a.tokenId,
    targetTokenId: a.npcTokenId,
  })),
  'facedown:resist': foreign((a) => ({ messageId: a.messageId })),
  'facedown:concede': foreign((a) => ({ messageId: a.messageId, choice: 'withdraw' })),
  'reputation:recognise': foreign((a) => ({
    characterId: a.characterId,
    targetTokenId: a.npcTokenId,
  })),
  // fog
  'fog:paint': foreign((a) => ({
    sceneId: a.sceneId,
    mode: 'reveal',
    shape: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 },
  })),
  'fog:reset': foreign((a) => ({ sceneId: a.sceneId })),
  'scene:visibility': foreign((a) => ({ sceneId: a.sceneId, visibility: 'dynamic' })),
  'fog:undo': foreign((a) => ({ sceneId: a.sceneId })),
  'time:set': own('zegar świata kampanii gniazda', () => ({ minutes: 1 })),
  // grapple
  'grapple:attempt': foreign((a) => ({ characterId: a.characterId, targetTokenId: a.npcTokenId })),
  'grapple:resist': foreign((a) => ({ messageId: a.messageId })),
  'grapple:action': foreign((a) => ({ combatantId: a.combatantId, kind: 'release' })),
  'character:haggle': foreign((a) => ({ characterId: a.characterId })),
  // handouts
  'handout:list': own('handouty kampanii gniazda'),
  'handout:upsert': foreign((a) => ({ id: a.handoutId, title: 'x', body: 'x' })),
  'handout:delete': foreign((a) => ({ id: a.handoutId })),
  'handout:share': foreign((a) => ({ id: a.handoutId, userIds: [a.playerId] })),
  // inventory
  // Jedno okno „Wymiana” i sklepy (etap 46a).
  'exchange:counterparts': foreign((a) => ({ characterId: a.characterId })),
  'merchant:list': own('sklepy kampanii gniazda'),
  'merchant:view': foreign((a) => ({ merchantId: a.merchantId })),
  'merchant:deal': foreign((a) => ({
    merchantId: a.merchantId,
    characterId: a.characterId,
    buy: [],
    sell: [],
    expectTotal: 0,
  })),
  'merchant:config': foreign((a) => ({ characterId: a.npcId, merchant: { open: false } })),
  'merchant:row': foreign((a) => ({
    merchantId: a.merchantId,
    list: 'gear',
    rowId: 'x',
    overlay: null,
  })),
  'campaign:catalog-shopping': own('przełącznik kampanii gniazda', () => ({
    mode: 'everywhere',
  })),
  'inventory:give': foreign((a) => ({
    fromCharacterId: a.characterId,
    toCharacterId: a.npcId,
    items: [],
  })),
  'inventory:take': foreign((a) => ({
    toCharacterId: a.characterId,
    fromTokenId: a.npcTokenId,
    items: [],
  })),
  'inventory:respond': foreign((a) => ({ messageId: a.messageId, accept: true })),
  // Pojemniki (etap 46b).
  'container:create': foreign((a) => ({ sceneId: a.sceneId, x: 1, y: 1, preset: 'chest' })),
  'container:config': foreign((a) => ({ characterId: a.npcId, lock: 'open' })),
  'container:open': foreign((a) => ({ tokenId: a.npcTokenId, characterId: a.characterId })),
  'container:put': foreign((a) => ({
    fromCharacterId: a.characterId,
    tokenId: a.npcTokenId,
    items: [],
  })),
  'inventory:drop': foreign((a) => ({ fromCharacterId: a.characterId, x: 1, y: 1, items: [] })),
  // journal
  'journal:list': own('dziennik kampanii gniazda'),
  'journal:upsert': foreign((a) => ({ id: a.journalId, title: 'x', body: 'x' })),
  'journal:delete': foreign((a) => ({ id: a.journalId })),
  'journal:reindex': own('indeks dziennika kampanii gniazda'),
  'journal:summarize': own('streszcza czat kampanii gniazda — id wiadomości to tylko granica'),
  // knowledge
  'knowledge:list': own('baza wiedzy kampanii gniazda'),
  'knowledge:upsert': foreign((a) => ({ id: a.knowledgeId, title: 'x', body: 'x' })),
  'knowledge:delete': foreign((a) => ({ id: a.knowledgeId })),
  'knowledge:reindex': own('indeks bazy wiedzy kampanii gniazda'),
  'knowledge:preview': foreign((a) => ({ botId: a.botId, message: 'hej' })),
  // lights
  'light:create': foreign((a) => ({ sceneId: a.sceneId, x: 1, y: 1 })),
  'light:update': foreign((a) => ({ lightId: a.lightId, patch: { on: false } })),
  'light:delete': foreign((a) => ({ lightId: a.lightId })),
  'light:clear': foreign((a) => ({ sceneId: a.sceneId })),
  'token:light': foreign((a) => ({ tokenId: a.tokenId, on: true })),
  'scene:lighting': foreign((a) => ({ sceneId: a.sceneId, dark: true })),
  // music
  'music:request': own('muzyka kampanii gniazda'),
  'music:control': foreign((a) => ({ campaignId: a.campaignId, action: 'stop' }), {
    expect: /^NO_CAMPAIGN$/,
  }),
  // netcombat
  'netrun:program': foreign((a) => ({ runId: a.runId, rowId: 'x', action: 'activate' })),
  'netrun:attack': foreign((a) => ({ runId: a.runId, iceId: 'x', rowId: 'x' })),
  'netrun:slide': foreign((a) => ({ runId: a.runId, iceId: 'x' })),
  'netrun:ice:detect': foreign((a) => ({ runId: a.runId, iceId: 'x' })),
  'netrun:ice:turn': foreign((a) => ({ runId: a.runId, iceId: 'x' })),
  'netrun:glue': foreign((a) => ({ runId: a.runId, iceId: 'x' })),
  // netdemons
  'netrun:demon:detect': foreign((a) => ({ runId: a.runId, demonId: 'x' })),
  'netrun:demon:turn': foreign((a) => ({ runId: a.runId, demonId: 'x' })),
  'netrun:device': foreign((a) => ({
    runId: a.runId,
    deviceId: 'x',
    floorId: 'x',
    operation: 'x',
  })),
  // netrun
  'netpoint:place': foreign((a) => ({
    sceneId: a.sceneId,
    architectureId: a.architectureId,
    x: 1,
    y: 1,
  })),
  'netpoint:update': foreign((a) => ({
    id: a.accessPointId,
    accessPointId: a.accessPointId,
    patch: {},
  })),
  'netpoint:remove': foreign((a) => ({ id: a.accessPointId, accessPointId: a.accessPointId })),
  'netpoint:clear': foreign((a) => ({ sceneId: a.sceneId })),
  'netrun:start': foreign((a) => ({ tokenId: a.tokenId, accessPointId: a.accessPointId })),
  'netrun:leave': foreign((a) => ({ runId: a.runId })),
  'netrun:move': foreign((a) => ({ runId: a.runId, to: 1 })),
  'netrun:copy': foreign((a) => ({ runId: a.runId })),
  'netrun:ability': foreign((a) => ({ runId: a.runId, ability: 'backdoor' })),
  'netrun:scan': foreign((a) => ({ runId: a.runId, tokenId: a.tokenId })),
  // netrunning
  'net:list': own('architektury kampanii gniazda'),
  'net:get': foreign((a) => ({ id: a.architectureId })),
  'net:save': foreign((a) => ({ id: a.architectureId, architecture: sampleArchitecture() })),
  'net:delete': foreign((a) => ({ id: a.architectureId })),
  'net:roll': own('losuje architekturę bez zapisu', () => ({ difficulty: 'basic', floors: 3 })),
  // notes
  'note:create': foreign((a) => ({ sceneId: a.sceneId, x: 1, y: 1, text: 'x' })),
  'note:update': foreign((a) => ({ noteId: a.noteId, patch: { text: 'x' } })),
  'note:delete': foreign((a) => ({ noteId: a.noteId })),
  'map:ping': foreign((a) => ({ sceneId: a.sceneId, x: 1, y: 1 })),
  // portraits
  'portrait:crop': foreign((a) => ({ assetId: a.portraitAssetId, crop: { x: 0, y: 0, size: 1 } })),
  'portrait:visibility': foreign((a) => ({ assetId: a.portraitAssetId, gmOnly: true })),
  'portrait:want': own('prośba gracza gniazda o portret'),
  'portrait:wanted': own('lista próśb kampanii gniazda'),
  // recovery
  'character:rest': foreign((a) => ({ characterId: a.characterId })),
  'character:craft-pharma': foreign((a) => ({ characterId: a.characterId, pharmaId: 'x' })),
  'character:use-dose': foreign((a) => ({
    characterId: a.characterId,
    gearRowId: 'x',
    targetTokenId: a.npcTokenId,
  })),
  // relations
  'relation:list': own('relacje botów kampanii gniazda'),
  'relation:set': foreign((a) => ({ botId: a.botId, characterId: a.characterId, value: 1 })),
  'relation:delete': foreign((a) => ({ botId: a.botId, characterId: a.characterId })),
  // ruler
  'ruler:update': foreign((a) => ({
    sceneId: a.sceneId,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  })),
  'ruler:clear': foreign((a) => ({ sceneId: a.sceneId })),
  // rules
  'rules:status': own('status indeksu podręcznika — wspólny dla serwera'),
  'rules:index': own('indeks podręcznika — wspólny dla serwera'),
  'rules:ask': own('pytanie do podręcznika — wspólny dla serwera', () => ({ question: 'hej' })),
  'scene:undo': foreign((a) => ({ sceneId: a.sceneId })),
  // scenes
  'scene:create': own('nowa scena w kampanii gniazda', () => ({ name: 'Scena nowa' })),
  'scene:update': foreign((a) => ({ sceneId: a.sceneId, patch: { name: 'x' } })),
  'scene:delete': foreign((a) => ({ sceneId: a.sceneId })),
  'scene:activate': foreign((a) => ({ sceneId: a.sceneId })),
  'scene:view': foreign((a) => ({ sceneId: a.sceneId })),
  'screamsheet:generate': own('screamsheet kampanii gniazda', () => ({ topic: 'x' })),
  // shop
  'shop:entry-tier': own('próg sklepu kampanii gniazda', () => ({ entryId: 'x', tier: 'common' })),
  'shop:tier': own('próg sklepu kampanii gniazda', () => ({ tier: 'common' })),
  'sighting:look': foreign((a) => ({ tokenId: a.tokenId })),
  'smoke:clear': foreign((a) => ({ sceneId: a.sceneId, smokeId: a.smokeId })),
  'character:stat-effect': foreign((a) => ({ characterId: a.characterId, stat: 'ref', value: -1 })),
  // surgery
  'cyberware:surgeons': own('lista Medyków kampanii gniazda'),
  'cyberware:request': foreign(
    (a) => ({ patientId: a.characterId, surgeonId: a.npcId, payment: 'full', entryId: 'x' }),
    // MG nie prosi o operację — prosi gracz.
    { expect: /^FORBIDDEN$/, player: NOT_FOUND },
  ),
  'cyberware:respond': foreign((a) => ({ messageId: a.messageId, action: 'approve' })),
  'state:request': own('pełny stan kampanii gniazda'),
  // tables
  'table:list': own('tabele kampanii gniazda'),
  'table:upsert': foreign((a) => ({ id: a.tableId, ...sampleTable() })),
  'table:delete': foreign((a) => ({ id: a.tableId })),
  'table:roll': foreign((a) => ({ id: a.tableId })),
  'table:show': foreign((a) => ({ messageId: a.messageId })),
  // team
  'character:team-hire': foreign((a) => ({
    characterId: a.characterId,
    professionId: 'x',
    name: 'x',
  })),
  'character:team-loyalty': foreign((a) => ({ characterId: a.characterId, memberId: 'x' })),
  'effect:expire': foreign((a) => ({ tokenId: a.tokenId, statusIds: ['x'] })),
  // tokens
  'token:create': foreign((a) => ({ sceneId: a.sceneId, name: 'x', x: 1, y: 1 })),
  'token:duplicate': foreign((a) => ({ tokenId: a.tokenId })),
  'token:update': foreign((a) => ({ tokenId: a.tokenId, patch: { name: 'x' } })),
  'token:stat': foreign((a) => ({ tokenId: a.tokenId, hp: 1 })),
  'token:delete': foreign((a) => ({ tokenId: a.tokenId })),
  'token:asset-delete': foreign((a) => ({ assetId: a.tokenAssetId })),
  'token:facing': foreign((a) => ({ tokenId: a.tokenId, facing: 1 })),
  'token:feared': foreign((a) => ({ tokenId: a.tokenId, fearedTokenIds: [a.npcTokenId] })),
  'token:move': foreign((a) => ({ tokenId: a.tokenId, x: 101, y: 101, final: true })),
  // trade
  'trade:invite': foreign((a) => ({ fromCharacterId: a.characterId, toTokenId: a.npcTokenId })),
  'trade:respond': foreign(() => ({ tradeId: 'x', accept: true })),
  'trade:offer': foreign(() => ({ tradeId: 'x', items: [], eddies: 0 })),
  'trade:accept': foreign(() => ({ tradeId: 'x', version: 0 })),
  'trade:cancel': foreign(() => ({ tradeId: 'x' })),
  'trade:list': own('handel postaci gniazda'),
  'token:effect': foreign((a) => ({ tokenId: a.tokenId, statusId: 'stunned', active: true })),
  // walls
  'wall:create': foreign((a) => ({ sceneId: a.sceneId, points: [0, 0, 10, 10] })),
  'wall:update': foreign((a) => ({ wallId: a.wallId, patch: { open: true } })),
  'wall:delete': foreign((a) => ({ wallId: a.wallId })),
  'wall:clear': foreign((a) => ({ sceneId: a.sceneId })),
  'opening:toggle': foreign((a) => ({ wallId: a.wallId })),
  // zones
  'zone:create': foreign((a) => ({
    sceneId: a.sceneId,
    entryId: ZONE_ENTRY,
    x: 1,
    y: 1,
    width: 2,
    height: 2,
  })),
  'zone:update': foreign((a) => ({ zoneId: a.zoneId, patch: { name: 'x' } })),
  'zone:delete': foreign((a) => ({ zoneId: a.zoneId })),
  'zone:clear': foreign((a) => ({ sceneId: a.sceneId })),
  'zone:fire': foreign((a) => ({ zoneId: a.zoneId, tokenId: a.tokenId })),
};

/**
 * Własny obiekt gniazda z cudzym odnośnikiem — figura B z kartą A, handout B
 * dla gracza A, walka na scenie B z figurą A. Główny obiekt przechodzi
 * strażnika, więc odmowa musi przyjść z drugiego identyfikatora.
 */
interface MixedCase {
  event: string;
  payload: Payload;
  /** `ANY` — obce id odpada po cichu, ack bywa `ok`; pilnują wyrocznie bazy i rozgłoszeń. */
  expect?: RegExp;
  player?: RegExp;
}
const ANY = /(?:)/;
const MIXED: MixedCase[] = [
  {
    event: 'token:create',
    payload: (a, b) => ({ sceneId: b.sceneId, name: 'x', x: 1, y: 1, characterId: a.characterId }),
  },
  {
    event: 'token:create',
    payload: (a, b) => ({ sceneId: b.sceneId, name: 'x', x: 1, y: 1, ownerId: a.playerId }),
  },
  {
    event: 'token:update',
    payload: (a, b) => ({ tokenId: b.npcTokenId, patch: { characterId: a.characterId } }),
  },
  {
    event: 'token:update',
    payload: (a, b) => ({ tokenId: b.npcTokenId, patch: { ownerId: a.playerId } }),
  },
  {
    event: 'token:feared',
    payload: (a, b) => ({ tokenId: b.tokenId, fearedTokenIds: [a.npcTokenId] }),
    // Strach liczy się tylko od figur tej samej sceny — reszta odpada po cichu.
    expect: ANY,
    player: ANY,
  },
  {
    event: 'character:update',
    payload: (a, b) => ({ characterId: b.npcId, patch: { ownerId: a.playerId } }),
  },
  {
    event: 'bot:update',
    payload: (a, b) => ({ botId: b.botId, patch: { characterId: a.characterId } }),
  },
  {
    event: 'relation:set',
    payload: (a, b) => ({ botId: b.botId, characterId: a.characterId, value: 1 }),
  },
  {
    event: 'handout:share',
    payload: (a, b) => ({ id: b.handoutId, userIds: [a.playerId] }),
    expect: /^UNKNOWN_RECIPIENT$/,
  },
  { event: 'creation:permit', payload: (a) => ({ userId: a.playerId, grant: true }) },
  { event: 'combat:start', payload: (a, b) => ({ sceneId: b.sceneId, tokenIds: [a.tokenId] }) },
  { event: 'combat:add', payload: (a, b) => ({ sceneId: b.sceneId, tokenIds: [a.tokenId] }) },
  {
    event: 'attack:roll',
    payload: (a, b) => ({
      attackerTokenId: b.tokenId,
      targetTokenId: a.npcTokenId,
      weaponRowId: 'x',
      mode: 'single',
    }),
  },
  {
    event: 'grapple:attempt',
    payload: (a, b) => ({ characterId: b.characterId, targetTokenId: a.npcTokenId }),
  },
  {
    event: 'facedown:attempt',
    payload: (a, b) => ({ characterId: b.characterId, targetTokenId: a.npcTokenId }),
  },
  {
    event: 'reputation:recognise',
    payload: (a, b) => ({ characterId: b.characterId, targetTokenId: a.npcTokenId }),
  },
  {
    event: 'inventory:give',
    payload: (a, b) => ({ fromCharacterId: b.characterId, toCharacterId: a.npcId, items: [] }),
  },
  {
    event: 'inventory:take',
    payload: (a, b) => ({ toCharacterId: b.characterId, fromTokenId: a.npcTokenId, items: [] }),
  },
  // MG handluje z ręki NPC-a, gracz — swojej postaci.
  {
    event: 'trade:invite',
    payload: (a, b) => ({ fromCharacterId: b.npcId, toTokenId: a.npcTokenId }),
  },
  {
    event: 'trade:invite',
    payload: (a, b) => ({ fromCharacterId: b.characterId, toCharacterId: a.characterId }),
    expect: /^NOT_YOURS$/,
    player: NOT_FOUND,
  },
  // Etap 46a: własna karta, cudzy sklep albo cudza figura.
  {
    event: 'merchant:deal',
    payload: (a, b) => ({
      merchantId: a.merchantId,
      characterId: b.characterId,
      buy: [],
      sell: [],
      expectTotal: 0,
    }),
  },
  {
    event: 'exchange:counterparts',
    payload: (a, b) => ({ characterId: b.characterId, tokenId: a.npcTokenId }),
  },
  // Etap 46b: własna karta, cudza figura (pojemnik innej kampanii).
  {
    event: 'container:open',
    payload: (a, b) => ({ characterId: b.characterId, tokenId: a.npcTokenId }),
  },
  {
    event: 'container:put',
    payload: (a, b) => ({ fromCharacterId: b.characterId, tokenId: a.npcTokenId, items: [] }),
  },
  {
    event: 'container:config',
    payload: (a, b) => ({ characterId: b.npcId, issueKeyTo: a.characterId }),
    // Karta B nie jest pojemnikiem — odmowa pada, zanim dojdzie do obcego id.
    expect: /NOT_FOUND$|^NOT_A_CONTAINER$/,
  },
  {
    event: 'economy:transfer',
    payload: (a, b) => ({
      fromCharacterId: b.characterId,
      toCharacterId: a.characterId,
      amount: 1,
    }),
  },
  {
    event: 'cyberware:request',
    payload: (a, b) => ({
      patientId: b.characterId,
      surgeonId: a.characterId,
      payment: 'full',
      entryId: 'x',
    }),
    expect: /^FORBIDDEN$/,
    player: NOT_FOUND,
  },
  {
    event: 'netpoint:place',
    payload: (a, b) => ({ sceneId: b.sceneId, architectureId: a.architectureId, x: 1, y: 1 }),
  },
  {
    event: 'table:upsert',
    payload: (a) => ({
      ...sampleTable('Nowa'),
      rows: [{ min: 1, max: 10, text: 'x', subTableId: a.tableId }],
    }),
  },
  {
    event: 'journal:upsert',
    payload: (a) => ({ title: 'x', body: 'x', handoutIds: [a.handoutId] }),
    expect: /^UNKNOWN_HANDOUT$/,
  },
  {
    event: 'bot:say',
    payload: (a, b) => ({ botId: b.botId, text: 'psst', whisperToUserId: a.playerId }),
  },
  // „/w <imię>” szuka adresata wśród graczy i MG **tej** kampanii (`getRoster`).
  {
    event: 'chat:send',
    payload: () => ({ text: '/w KANAREK-A-gracz psst' }),
    expect: ANY,
    player: ANY,
  },
  // Poza listą (walidacja własnego obiektu odpada wcześniej niż odnośnik, a
  // odnośnik idzie przez strażnika kampanii — przegląd 03.10): `character:use-dose`
  // (`resolveDoseTarget` → `requireCampaignToken`), `netrun:start`
  // (`requireAccessPoint`), `zone:fire` (figura szukana wśród stojących w strefie).
];

function sampleArchitecture() {
  return {
    name: 'Sieć',
    difficulty: 'standard',
    branches: [{ parentFloor: null, floors: [{ kind: 'file', label: 'Plik', dv: 7 }] }],
  };
}

function sampleTable(name = 'Tabela') {
  return {
    name,
    formula: '1d10',
    description: '',
    visibility: 'public',
    rows: [{ min: 1, max: 10, text: 'x' }],
  };
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'pipe',
  });
  built = await buildApp(config, { logger: false, aiFetch });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const address = built.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  // MG-A — właściciel z `.env`, z kampanią A i jej światem.
  const loginA = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'MG', password: GM_PASSWORD },
  });
  gmACookie = cookieOf(loginA.headers['set-cookie']);
  const gmAUser = await built.prisma.user.findFirstOrThrow({ where: { login: 'mg' } });
  const campaignA = await createCampaign(gmACookie, `${CANARY} kampania`);
  A = await seedWorld(campaignA, gmAUser.id, CANARY);
  foreignStrings = [CANARY, ...Object.values(A).filter((v): v is string => typeof v === 'string')];
  // Chronione jest wszystko, co istnieje przed kampanią B — świat A i konta.
  protectedRows = await snapshot();

  // MG-B — konto z rejestracji, z kampanią B (aktywną) i jej światem.
  const registerB = await built.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { login: 'bartek', password: 'dlugie-haslo-1', repeat: 'dlugie-haslo-1' },
  });
  expect(registerB.statusCode).toBe(201);
  gmBCookie = cookieOf(registerB.headers['set-cookie']);
  const gmBUser = await built.prisma.user.findFirstOrThrow({ where: { login: 'bartek' } });
  const campaignB = await createCampaign(gmBCookie, 'Kampania B');
  B = await seedWorld(campaignB, gmBUser.id, 'Świat B');

  gmA = await connect(gmACookie);
  playerA = await connect(await playerCookie(A.playerId));
  gmB = await connect(gmBCookie);
  playerB = await connect(await playerCookie(B.playerId));

  // Gniazda kampanii A w jej pokojach — jak po 44c, gdy aktywna jest per MG.
  built.io
    .in(gmA.id!)
    .socketsJoin([campaignRoom(A.campaignId), gmRoom(A.campaignId), sceneRoom(A.sceneId)]);
  built.io.in(playerA.id!).socketsJoin([campaignRoom(A.campaignId), sceneRoom(A.sceneId)]);
  for (const socket of [gmA, playerA]) {
    socket.onAny((event: string, ...args: unknown[]) =>
      heardByA.push(`${event} ${JSON.stringify(args)}`),
    );
  }
  for (const socket of [gmB, playerB]) {
    socket.onAny((event: string, ...args: unknown[]) =>
      heardByB.push(`${event} ${JSON.stringify(args)}`),
    );
  }
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

/** Jedno wywołanie pod wszystkimi wyroczniami; zwraca opisy porażek. */
async function probe(
  socket: ClientSocket,
  label: string,
  name: string,
  payload: unknown,
  expected: RegExp | null,
): Promise<string[]> {
  const failures: string[] = [];
  heardByA.length = 0;
  heardByB.length = 0;
  let ack: SocketAck<unknown>;
  try {
    ack = await emitAck(socket, name, payload);
  } catch (error) {
    return [`${label}: ${(error as Error).message}`];
  }
  await settle();
  if (expected && expected !== ANY && (ack.ok || !expected.test(ack.error))) {
    failures.push(
      `${label}: oczekiwano ${String(expected)}, jest ${JSON.stringify(ack).slice(0, 200)}`,
    );
  }
  const ackLeak = leaks(JSON.stringify(ack));
  if (ackLeak) failures.push(`${label}: ack niesie ${ackLeak}`);
  if (heardByA.length > 0) {
    failures.push(`${label}: kampania A usłyszała ${heardByA.join(' | ').slice(0, 200)}`);
  }
  const heardLeak = heardByB.map(leaks).find(Boolean);
  if (heardLeak) failures.push(`${label}: kampania B usłyszała ${heardLeak}`);
  const breaches = await databaseBreaches();
  if (breaches.length > 0) {
    failures.push(`${label}: baza — ${breaches.join('; ').slice(0, 300)}`);
    // Jedno naruszenie nie ma zasłaniać następnych.
    protectedRows = await snapshot();
  }
  return failures;
}

describe('izolacja kampanii — macierz zdarzeń (etap 44b)', () => {
  it('każde zdarzenie z rejestru ma przypadek', () => {
    const missing = EVENTS.map((e) => e.name).filter((name) => !(name in CASES));
    const stale = Object.keys(CASES).filter((name) => !EVENTS.some((e) => e.name === name));
    const unknownMixed = MIXED.filter((m) => !EVENTS.some((e) => e.name === m.event));
    expect({ missing, stale, unknownMixed }).toEqual({ missing: [], stale: [], unknownMixed: [] });
  });

  it('plik z kampanii A wgrany przez MG-B nie zostawia odnośników do A', async () => {
    // Plik przyszedł legalnie (MG-A dał go MG-B), więc nazwy wolno przenieść —
    // kanarek wychodzi, zostają same identyfikatory, o które tu chodzi.
    const scrub = (file: unknown) => JSON.parse(JSON.stringify(file).replaceAll(CANARY, 'Plik'));
    const scene = scrub(await exportScene(built.prisma, A.sceneId));
    const character = scrub(await exportCharacter(built.prisma, A.characterId));
    const failures = [
      ...(await probe(gmB, 'archive:scene', 'archive:scene', { file: scene }, null)),
      ...(await probe(gmB, 'archive:character', 'archive:character', { file: character }, null)),
    ];
    expect(failures.join('\n')).toBe('');
  });

  for (const asPlayer of [false, true]) {
    const who = asPlayer ? 'gracz B' : 'MG-B';
    const socketOf = () => (asPlayer ? playerB : gmB);
    const expectation = (
      event: (typeof EVENTS)[number],
      foreignCase: { expect?: RegExp; player?: RegExp } | null,
    ): RegExp | null => {
      if (event.ownerOnly || (asPlayer && event.role)) return /^FORBIDDEN$/;
      if (!foreignCase) return null;
      return (asPlayer ? foreignCase.player : undefined) ?? foreignCase.expect ?? NOT_FOUND;
    };

    it(`${who}: obcy identyfikator daje NOT_FOUND, a kampania A nic nie czuje`, async () => {
      const failures: string[] = [];
      for (const event of EVENTS) {
        const entry = CASES[event.name];
        if (!entry) continue;
        const payload = entry.payload?.(A, B) ?? {};
        const expected = expectation(event, entry.kind === 'foreign' ? entry : null);
        failures.push(...(await probe(socketOf(), event.name, event.name, payload, expected)));
      }
      expect(failures.join('\n')).toBe('');
    }, 300_000);

    it(`${who}: własny obiekt z cudzym odnośnikiem daje odmowę`, async () => {
      const failures: string[] = [];
      for (const [index, mixed] of MIXED.entries()) {
        const event = EVENTS.find((e) => e.name === mixed.event)!;
        const label = `${mixed.event} #${index}`;
        failures.push(
          ...(await probe(
            socketOf(),
            label,
            mixed.event,
            mixed.payload(A, B),
            expectation(event, mixed),
          )),
        );
      }
      expect(failures.join('\n')).toBe('');
    }, 120_000);
  }
});

describe('izolacja kampanii — trasy REST i pliki (etap 44b)', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  /** Plik w katalogu kampanii A i jego adres. */
  function putFile(dir: string, name: string): string {
    const path = join(config.uploadsDir, 'campaigns', A.campaignId, dir);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, name), PNG);
    return `/uploads/campaigns/${A.campaignId}/${dir}/${name}`;
  }
  const get = async (url: string, cookie?: string) =>
    (await built.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })).statusCode;

  it('plik kampanii A: MG-A i gracz A tak, MG-B, gracz B i niezalogowany nie', async () => {
    const map = putFile('maps', 'mapa.png');
    const playerACookie = await playerCookie(A.playerId);
    const playerBCookie = await playerCookie(B.playerId);
    expect(await get(map, gmACookie)).toBe(200);
    expect(await get(map, playerACookie)).toBe(200);
    // Obcy plik wygląda jak nieistniejący — 404, nie 403.
    expect(await get(map, gmBCookie)).toBe(404);
    expect(await get(map, playerBCookie)).toBe(404);
    expect(await get(map)).toBe(401);
    // Przebrany adres trafia w tę samą trasę statyczną — i w tego samego strażnika.
    expect(await get(map.replace('/uploads/', '/%75ploads/'), gmBCookie)).not.toBe(200);
    expect(await get(map.replace('/mapa.png', '/%2E%2E/maps/mapa.png'), gmBCookie)).not.toBe(200);
  });

  it('grafika handoutu: gracz widzi tylko udostępniony, MG kampanii — każdy', async () => {
    const shared = putFile('handouts', 'udostepniony.png');
    const hidden = putFile('handouts', 'tajny.png');
    await built.prisma.handout.update({ where: { id: A.handoutId }, data: { imageUrl: shared } });
    await built.prisma.handout.create({
      data: { campaignId: A.campaignId, title: 'Tajny', imageUrl: hidden },
    });
    const playerACookie = await playerCookie(A.playerId);
    expect(await get(shared, playerACookie)).toBe(200);
    expect(await get(hidden, playerACookie)).toBe(404);
    expect(await get(hidden, gmACookie)).toBe(200);
  });

  it('plik wspólny dla każdego zalogowanego, płaski adres sprzed 44b — dla nikogo', async () => {
    mkdirSync(join(config.uploadsDir, 'art'), { recursive: true });
    writeFileSync(join(config.uploadsDir, 'art', 'welcome-map.webp'), PNG);
    mkdirSync(join(config.uploadsDir, 'maps'), { recursive: true });
    writeFileSync(join(config.uploadsDir, 'maps', 'plaska.png'), PNG);
    expect(await get('/uploads/art/welcome-map.webp', gmBCookie)).toBe(200);
    expect(await get('/uploads/art/welcome-map.webp')).toBe(401);
    expect(await get('/uploads/maps/plaska.png', gmACookie)).toBe(404);
  });

  it('trasy MG o kampanii po id odmawiają cudzej kampanii', async () => {
    const link = await built.prisma.invitation.create({
      data: {
        token: 'link-kampanii-a',
        campaignId: A.campaignId,
        name: 'Nowy',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const calls: [string, string, number][] = [
      ['GET', `/api/archive/character/${A.characterId}`, 404],
      ['GET', `/api/archive/scene/${A.sceneId}`, 404],
      ['POST', `/api/campaigns/${A.campaignId}/sandbox`, 404],
      ['POST', `/api/campaigns/${A.campaignId}/invitations`, 404],
      ['POST', `/api/campaigns/${A.campaignId}/players/${A.playerId}/renewal`, 404],
      ['POST', `/api/invitations/${link.id}/revoke`, 404],
      ['DELETE', `/api/portrait-assets/${A.portraitAssetId}`, 404],
      ['POST', `/api/music/${A.campaignId}/upload`, 409],
      ['GET', `/api/music/${A.campaignId}/youtube`, 404],
      ['POST', `/api/music/${A.campaignId}/youtube`, 409],
      ['POST', `/api/music/${A.campaignId}/youtube/cancel`, 404],
    ];
    const before = await snapshot();
    for (const [method, url, status] of calls) {
      const res = await built.app.inject({
        method: method as 'GET',
        url,
        headers: { cookie: gmBCookie },
        ...(method === 'POST' ? { payload: { sandbox: true, name: 'Ktoś', url: 'x' } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(status);
      expect(leaks(res.body), `${method} ${url}`).toBeUndefined();
    }
    // Ta sama trasa dla właściciela kampanii działa — odmowa to nie zepsuta trasa.
    expect(await get(`/api/archive/character/${A.characterId}`, gmACookie)).toBe(200);
    expect(await get(`/api/archive/scene/${A.sceneId}`, gmACookie)).toBe(200);
    const after = await snapshot();
    const changed = [...before].filter(([key, value]) => after.get(key) !== value);
    expect(changed).toEqual([]);
  });

  it('lista kampanii i zrzut aktywnej kampanii MG-B nie niosą niczego z A', async () => {
    const list = await built.app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: gmBCookie },
    });
    const which = (body: string) => {
      const id = leaks(body);
      return id
        ? `${Object.entries(A).find(([, v]) => v === id)?.[0]}: …${body.slice(Math.max(0, body.indexOf(id) - 120), body.indexOf(id) + 40)}`
        : undefined;
    };
    expect(which(list.body)).toBeUndefined();
    const dump = await built.app.inject({
      method: 'GET',
      url: '/api/archive/campaign',
      headers: { cookie: gmBCookie },
    });
    expect(dump.statusCode).toBe(200);
    expect(which(dump.body)).toBeUndefined();
  });
});

describe('kompendium: podręcznik wspólny, wpisy MG per kampania (etap 44b)', () => {
  it('stan MG-B ma podręcznik z pliku, a wpisu MG-A nie ma', async () => {
    const socket = await connect(gmBCookie);
    const sync = new Promise<StateSyncPayload>((resolve) => socket.once('state:sync', resolve));
    socket.emit('state:request');
    const { compendium } = await sync;
    const ids = compendium.entries.map((entry) => entry.id);
    // Próbka z `data/public` — ta sama dla każdego MG na serwerze.
    expect(ids).toContain('defense.oko-korytarza');
    expect(ids).not.toContain(COMPENDIUM_SLUG);
    expect(leaks(JSON.stringify(compendium))).toBeUndefined();
    socket.disconnect();
  });
});
