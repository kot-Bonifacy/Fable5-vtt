import type { Locator } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor, type Cast } from './actors.ts';
import { query, queryOne } from './db.ts';
import { apiGm, apiPlayer, campaignId, characterId, cookieHeader, invite } from './nocna-zmiana.ts';
import { MG_ENGINE, PLAYER_ENGINE, viewedScene } from './regresja.ts';
import { DEAD_GATEWAY, rawSocket } from './security.ts';
import { emitAck } from './socket.ts';
import { createInvitation, shakeCup } from './table.ts';
import { openSheet } from './walka.ts';
import {
  hasCheckpoint,
  restoreCheckpoint,
  saveCheckpoint,
  scriptDice,
  startInstance,
} from '../instance/instance.ts';

/**
 * Etap 71b — dziewięć Ról bez Netrunnera, każda na własnej karcie i z własnym
 * graczem (nie wieloklasowy „Wielorak” z T8c). Wspólny start specyfikacji
 * `52-role/t71-*` i rozegrań przez Playwright MCP: punkt kontrolny `role-start`.
 *
 * Punkt powstaje z `po-T6` (kampania „Nocna zmiana”, kalendarz ustawiony, sesja
 * trwa) w `t71-00-start.spec.ts`: dziewięciu graczy, scena „Poligon Ról”
 * z figurą każdej postaci, statysta-cel „Manekin”, handlarz „Lada 71” i auto
 * Technika **na karcie** — bez sceny pościgu (etap 72 przebudowuje jazdę, „Styk
 * z etapem 72” w `etap-71-weryfikacja-rol.md`). Karty zakłada gniazdo MG — sam
 * kreator to nie przedmiot tych testów, tylko Zdolności.
 *
 * Nazwy testów zaczynają się identyfikatorami wierszy `role-macierz.md`.
 */

export const ROLE_CHECKPOINT = 'role-start';
export const ROLE_SCENE = 'Poligon Ról';
export const TARGET = 'Manekin';
export const MERCHANT = 'Lada 71';
/** Kratka sceny „Poligon Ról” (px). */
export const CELL = 100;

type Stats = Record<
  'int' | 'ref' | 'dex' | 'tech' | 'cool' | 'will' | 'luck' | 'move' | 'body' | 'emp',
  number
>;

export interface RoleCard {
  /** Imię karty — także imię figury. */
  card: string;
  /** Konto gracza (imię na linku; w grze go nie widać). */
  player: string;
  roleId: string;
  rank: number;
  /** Kolumna figury na scenie (wiersz 3). */
  column: number;
  data: Record<string, unknown>;
}

const STATS: Stats = {
  int: 6,
  ref: 7,
  dex: 6,
  tech: 6,
  cool: 6,
  will: 6,
  luck: 5,
  move: 6,
  body: 6,
  emp: 6,
};
const BASIC_SKILLS = {
  athletics: 2,
  brawling: 2,
  concentration: 2,
  conversation: 2,
  education: 2,
  evasion: 2,
  'first-aid': 2,
  'human-perception': 2,
  'local-expert': 2,
  perception: 2,
  persuasion: 2,
  stealth: 2,
  language: 4,
};
const PISTOL = {
  id: 'r71-pistolet',
  name: 'Ciężki pistolet',
  notes: '',
  compendiumId: 'weapon.heavy-pistol',
  damage: '3k6',
  ammoCurrent: 8,
  ammoMax: 8,
  ammoType: 'B.C. Pistolet',
  rof: '1',
};
const BRAWLING = {
  id: 'bare-hands.brawling',
  name: 'Bijatyka',
  compendiumId: 'weapon.brawling',
  notes: 'Z urzędu — ma je każda postać.',
  damage: '3k6',
  ammoCurrent: 0,
  ammoMax: 0,
  ammoType: '',
  rof: '2',
};

function sheetData(extra: Record<string, unknown>): Record<string, unknown> {
  const stats = { ...STATS, ...((extra.stats as Partial<Stats>) ?? {}) };
  return {
    eddies: 2_000,
    lifestyle: { level: 'kibble', housing: 'container' },
    weapons: [PISTOL, BRAWLING],
    ...extra,
    stats,
    hpCurrent: 10 + 5 * Math.ceil((stats.body + stats.will) / 2),
    luckCurrent: stats.luck,
    skills: { ...BASIC_SKILLS, ...((extra.skills as Record<string, number>) ?? {}) },
  };
}

/** Dziewięć Ról — rangi z kreatora (4); próg powyżej czwórki podnosi MG w specyfikacji. */
export const ROLES = {
  solo: {
    card: 'Brzytwa',
    player: 'Ada',
    roleId: 'solo',
    rank: 4,
    column: 2,
    data: sheetData({ skills: { handgun: 6, perception: 4, evasion: 6 } }),
  },
  tech: {
    card: 'Śrubka',
    player: 'Bartek',
    roleId: 'tech',
    rank: 4,
    column: 4,
    data: sheetData({
      stats: { tech: 8 },
      skills: { 'basic-tech': 6, weaponstech: 4, 'land-vehicle-tech': 4, cybertech: 4 },
      armor: [
        {
          id: 'r71-kurtka',
          name: 'Lekka kurtka kuloodporna',
          notes: '',
          compendiumId: 'armor.light-armorjack',
          sp: 11,
          spCurrent: 7,
          location: 'body',
        },
      ],
    }),
  },
  medtech: {
    card: 'Ruta',
    player: 'Celina',
    roleId: 'medtech',
    rank: 4,
    column: 6,
    data: sheetData({ stats: { tech: 7 }, skills: { paramedic: 6, 'first-aid': 6 } }),
  },
  nomad: {
    card: 'Koleina',
    player: 'Damian',
    roleId: 'nomad',
    rank: 4,
    column: 8,
    data: sheetData({ stats: { ref: 7 }, skills: { driving: 6, 'land-vehicle-tech': 4 } }),
  },
  fixer: {
    card: 'Szmugiel',
    player: 'Ewa',
    roleId: 'fixer',
    rank: 4,
    column: 10,
    data: sheetData({ stats: { cool: 7 }, skills: { trading: 6, bribery: 4, streetwise: 6 } }),
  },
  exec: {
    card: 'Krawat',
    player: 'Filip',
    roleId: 'exec',
    rank: 4,
    column: 12,
    data: sheetData({ skills: { business: 6, persuasion: 6 } }),
  },
  lawman: {
    card: 'Odznaka',
    player: 'Gosia',
    roleId: 'lawman',
    rank: 4,
    column: 14,
    data: sheetData({ skills: { handgun: 6, criminology: 4 } }),
  },
  rockerboy: {
    card: 'Struna',
    player: 'Hubert',
    roleId: 'rockerboy',
    rank: 4,
    column: 16,
    data: sheetData({ stats: { cool: 8 }, skills: { 'play-instrument': 6, composition: 4 } }),
  },
  media: {
    card: 'Kadr',
    player: 'Iga',
    roleId: 'media',
    rank: 4,
    column: 18,
    data: sheetData({ skills: { 'library-search': 4, composition: 6 } }),
  },
} satisfies Record<string, RoleCard>;

export type RoleKey = keyof typeof ROLES;

type Data<T> = { ok: true; data: T } | { ok: false; error: string };
export function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Data<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

/** Gniazdo MG prosto na serwer (bez przeglądarki) — do budowy stanu i rąk MG w testach. */
export async function gmSocket(): Promise<Socket> {
  const { socket, error } = await rawSocket(await cookieHeader(await apiGm()));
  if (!socket) throw new Error(`E2E: GM socket: ${error}`);
  return socket;
}

/**
 * Budowa `role-start` z `po-T6`: wszystko gniazdem i trasami MG, potem kopia.
 * Wołane z `t71-00-start.spec.ts`, ale też samo z `startFromRoleStart`, gdy
 * punktu nie ma (pojedyncza specyfikacja z `--grep`).
 */
export async function buildRoleStart(): Promise<void> {
  test.skip(!hasCheckpoint('po-T6'), 'brak punktu po-T6 — najpierw pełny przebieg T3–T6b');
  await restoreCheckpoint('po-T6');
  await startInstance(DEAD_GATEWAY);
  const api = await apiGm();
  // Gracze wchodzą z imiennych linków — konto powstaje przy wejściu (etap 44b).
  for (const role of Object.values(ROLES)) {
    await apiPlayer(role.player, await invite(api, role.player));
  }
  const gm = await gmSocket();
  try {
    const sceneId = dataOf<{ id: string }>(
      await emitAck(gm, 'scene:create', { name: ROLE_SCENE }),
      'scene:create',
    ).id;
    dataOf(
      await emitAck(gm, 'scene:update', {
        sceneId,
        patch: { width: 2200, height: 1200, grid: { sizePx: CELL }, playerMove: 'explore' },
      }),
      'scene:update',
    );
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }), 'scene:activate');
    dataOf(await emitAck(gm, 'scene:view', { sceneId }), 'scene:view');

    for (const role of Object.values(ROLES)) {
      const ownerId = userIdOf(role.player);
      const created = dataOf<{ id: string }>(
        await emitAck(gm, 'character:create', { name: role.card, ownerId }),
        `character:create ${role.card}`,
      );
      dataOf(
        await emitAck(gm, 'character:update', {
          characterId: created.id,
          patch: { data: { ...role.data, roleId: role.roleId, roleAbilityRank: role.rank } },
        }),
        `character:update ${role.card}`,
      );
      dataOf(
        await emitAck(gm, 'token:create', {
          sceneId,
          name: role.card,
          x: role.column * CELL,
          y: 3 * CELL,
          ownerId,
          characterId: created.id,
        }),
        `token:create ${role.card}`,
      );
    }

    // Statysta-cel: figura z profilem bojowym, bez karty.
    const targetId = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: TARGET,
        x: 2 * CELL,
        y: 7 * CELL,
        hp: { current: 40, max: 40 },
      }),
      'token:create Manekin',
    ).id;
    dataOf(
      await emitAck(gm, 'token:stat', {
        tokenId: targetId,
        quick: {
          ref: 4,
          dex: 4,
          body: 6,
          will: 4,
          skillLevel: 2,
          evasion: 0,
          combatValue: 8,
          armorSp: 4,
          weaponId: 'weapon.brawling',
          weaponName: 'Bijatyka',
          weaponDamage: '1k6',
          ammoCurrent: 0,
          ammoMax: 0,
        },
      }),
      'token:stat Manekin',
    );

    // Handlarz z kartą i otwartą ladą — obok Fixera.
    const merchant = dataOf<{ id: string }>(
      await emitAck(gm, 'character:create', { name: MERCHANT }),
      'character:create handlarz',
    );
    dataOf(
      await emitAck(gm, 'character:update', {
        characterId: merchant.id,
        patch: {
          data: sheetData({
            stats: { cool: 6 },
            skills: { trading: 4 },
            eddies: 5_000,
            gear: [
              {
                id: 'r71-latarka',
                name: 'Latarka',
                qty: 5,
                compendiumId: 'gear.latarka',
                notes: '',
              },
            ],
          }),
        },
      }),
      'character:update handlarz',
    );
    dataOf(
      await emitAck(gm, 'merchant:config', {
        characterId: merchant.id,
        merchant: { open: true, sign: 'Lada 71', priceMul: 100, buyBackPct: 50 },
      }),
      'merchant:config',
    );
    dataOf(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: MERCHANT,
        x: 11 * CELL,
        y: 4 * CELL,
        characterId: merchant.id,
      }),
      'token:create handlarz',
    );

    // Auto Technika na karcie (do naprawy w scence) — bez sceny pościgu.
    dataOf(
      await emitAck(gm, 'vehicle:create', {
        catalogId: 'vehicle.samochod-kompaktowy',
        ownerCharacterId: characterId(ROLES.tech.card),
      }),
      'vehicle:create',
    );
  } finally {
    gm.close();
  }
  saveCheckpoint(ROLE_CHECKPOINT);
}

/** Start specyfikacji Roli: odtworzenie `role-start` (albo budowa, gdy go nie ma). */
export async function startFromRoleStart(): Promise<void> {
  test.setTimeout(4 * 60_000);
  if (!hasCheckpoint(ROLE_CHECKPOINT)) {
    await buildRoleStart();
    return;
  }
  await restoreCheckpoint(ROLE_CHECKPOINT);
  await startInstance(DEAD_GATEWAY);
}

export function userIdOf(name: string): string {
  const row = queryOne<{ id: string }>('SELECT id FROM User WHERE name = ?', name);
  if (!row) throw new Error(`E2E: no user "${name}"`);
  return row.id;
}

/** MG w Chromium i gracz Roli w Firefoksie przy „Poligonie Ról”; karta gracza otwarta. */
export async function seatRole(
  cast: Cast,
  key: RoleKey,
): Promise<{ mg: Actor; player: Actor; card: Locator }> {
  cast.viewport = { width: 1920, height: 1080 };
  const role = ROLES[key];
  const mg = await cast.mg(MG_ENGINE);
  const player = await cast.gracz(
    role.player,
    PLAYER_ENGINE,
    await createInvitation(mg, campaignId(), role.player),
  );
  for (const actor of [mg, player]) {
    await expect.poll(() => viewedScene(actor), { message: actor.name }).toBe(ROLE_SCENE);
  }
  const card = await openSheet(player, role.card);
  await expect(card.locator('.cp-role-strip')).toBeVisible();
  return { mg, player, card };
}

// --- Odczyty do asercji ------------------------------------------------------

export const cardData = <T = Record<string, unknown>>(name: string): T =>
  JSON.parse(
    queryOne<{ data: string }>('SELECT data FROM Character WHERE name = ?', name)!.data,
  ) as T;

export const lastMessageId = (): number =>
  queryOne<{ id: number | null }>('SELECT max(id) AS id FROM ChatMessage')!.id ?? 0;

export interface ChatRow {
  id: number;
  kind: string;
  text: string;
  authorId: string | null;
  recipientId: string | null;
  payload: string | null;
}

export const messagesAfter = (id: number): ChatRow[] =>
  query<ChatRow>(
    'SELECT id, kind, text, authorId, recipientId, payload FROM ChatMessage WHERE id > ? ORDER BY id',
    id,
  );

export interface RollPayload {
  total: number;
  title?: string;
  actor?: string;
  dice?: { value: number }[];
  breakdown?: { label: string; value: number }[];
  outcome?: { success?: boolean; label?: string; detail?: string };
  [key: string]: unknown;
}

/** Pierwsza karta rzutu po `since`, której tekst albo tytuł zawiera `text`. */
export async function rollAfter(
  since: number,
  text: string,
  kind?: string,
): Promise<RollPayload & { id: number }> {
  let found: ChatRow | undefined;
  await expect
    .poll(
      () => {
        found = messagesAfter(since).find(
          (row) =>
            row.payload !== null &&
            (kind === undefined || row.kind === kind) &&
            (row.text.includes(text) || row.payload.includes(text)),
        );
        return found !== undefined;
      },
      { timeout: 20_000, message: `karta rzutu „${text}”` },
    )
    .toBe(true);
  return { id: found!.id, ...(JSON.parse(found!.payload!) as RollPayload) };
}

/** Wiersz rozbicia rzutu po fragmencie etykiety („Wyczucie zagrożenia”, „Moto”…). */
export function breakdownRow(
  roll: RollPayload,
  label: string,
): { label: string; value: number } | undefined {
  return roll.breakdown?.find((row) => row.label.includes(label));
}

/** Stan tury figury w trwającej walce na „Poligonie Ról”. */
export function turnStateOf(tokenName: string): Record<string, unknown> | null {
  const row = queryOne<{ turnState: string | null }>(
    `SELECT m.turnState FROM Combatant m JOIN Token t ON t.id = m.tokenId
       JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = ?`,
    ROLE_SCENE,
    tokenName,
  );
  return row?.turnState ? (JSON.parse(row.turnState) as Record<string, unknown>) : null;
}

export function tokenIdOf(name: string): string {
  const row = queryOne<{ id: string }>(
    'SELECT t.id FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = ?',
    ROLE_SCENE,
    name,
  );
  if (!row) throw new Error(`E2E: no token "${name}" on ${ROLE_SCENE}`);
  return row.id;
}

// --- Ręce MG i gracza ------------------------------------------------------------

/**
 * Wezwanie MG do Testu (gniazdo MG — wezwanie nie jest przedmiotem testu) i rzut
 * gracza z karty wezwania na czacie: „Rzuć”, „Weź kubek”, gest kubka.
 */
export async function calledTest(
  gm: Socket,
  player: Actor,
  card: string,
  request: Record<string, unknown>,
  dv: number,
  faces: number[],
): Promise<RollPayload & { id: number }> {
  const called = await emitAck<{ messageId: number }>(gm, 'check:call', {
    characterId: characterId(card),
    request,
    dv,
    visibility: 'public',
  });
  expect(called, JSON.stringify(called)).toMatchObject({ ok: true });
  const page = player.page;
  await page.getByRole('button', { name: /^Czat/ }).first().click();
  const call = page.locator('.chat-message.chat-check').last();
  await expect(call).toContainText(`PT ${dv}`);
  scriptDice(faces);
  const since = lastMessageId();
  await call.getByRole('button', { name: 'Rzuć' }).click();
  await page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
  await shakeCup(page);
  return rollAfter(since, 'Wezwanie');
}
