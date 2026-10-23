import type {
  CpredLock,
  OpeningLockConfigPayload,
  OpeningPickPayload,
  OpeningPickResult,
  SessionUser,
  WallKind,
  WallView,
} from '@vtt/shared';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  ROLE_GM,
  cpredHasKey,
  cpredItemLists,
  cpredItemListsOverflow,
  cpredKeyRow,
  cpredLockOpening,
  cpredLockTried,
  cpredRowId,
  isCpredLockSkill,
  isOpening,
  isWallWithinReach,
  mergeCharacterData,
  parseCharacterData,
  readCpredLock,
  tokenCentre,
} from '@vtt/shared';
import { randomBytes } from 'node:crypto';
import type { Character, Scene } from '../generated/prisma/client.js';
import type { PrismaClient } from '../db.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { createCheckCall, type CheckFrame } from './checks.js';
import { requireCampaignId } from './combat.js';
import { findCampaignCharacter, requireOwnCharacter } from './inventory.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { toSceneView } from './scenes.js';
import type { SceneVisionContext } from './vision.js';
import { toWallView } from './walls-io.js';
import { afterWallChange, requireCampaignOpening, requirePlayerOpening } from './walls.js';

/**
 * Zamek drzwi, okna i bramy (etap 58c, decyzja MG 4 z 22.10: „działają jak
 * pojemnik”).
 *
 * Rdzeń (`walls.ts`) zna tylko rygiel — `locked` — i trzyma przy nim
 * nieprzezroczysty zapis systemu (`Wall.lockRule`). Ten plik czyta go jako
 * `CpredLock` i wykonuje wspólną regułę zamka (`systems/cpred/lock.ts`): PT
 * i Umiejętności od MG, klucz bez Testu, jedna próba na postać, „Pozwól
 * spróbować znowu”. Umowy jak w `containers.ts`:
 *
 *  1. **Kolejność odmów z `opening:toggle` zostaje** — `opening:pick` przechodzi
 *     przez tego samego strażnika (`requirePlayerOpening`), zanim cokolwiek
 *     powie o zamku. Niewidoczne drzwi to `WALL_NOT_FOUND`, za daleko —
 *     `OPENING_OUT_OF_REACH`.
 *  2. **Zamek pisze tylko serwer** — `opening:lock-config` (MG) i rozliczenie
 *     Testu w `character-rolls.ts`. Gracz nigdy nie dostaje `lockRule`
 *     (`playerOpeningView`).
 *  3. **Działa postać przy klamce** — moja karta, której figura stoi na
 *     wyciągnięcie ręki od otworu. Oczy drużyny (etap 45) pokazują drzwi,
 *     ale wytrych trzyma ręka, nie kamera.
 */

/** Jak otwór nazywa się na kluczu i na wezwaniu. */
const OPENING_NAMES: Partial<Record<WallKind, string>> = {
  door: 'Drzwi',
  window: 'Okno',
  gate: 'Brama',
};

function openingName(wall: Pick<WallView, 'kind'>): string {
  return OPENING_NAMES[wall.kind] ?? 'Drzwi';
}

/** Zamek otworu jako CP RED — brak zapisu to zamek domyślny. */
export function openingLock(wall: Pick<WallView, 'lockRule'>): CpredLock {
  return readCpredLock(wall.lockRule);
}

/**
 * Moje karty, których figura stoi przy tym otworze. Mierzy się środek figury
 * do odcinka, jak w `isWallInReach` — ta sama miara, którą przeszedł strażnik.
 */
async function charactersAtOpening(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  wall: WallView,
  context: SceneVisionContext,
): Promise<Character[]> {
  const cards = await prisma.character.findMany({
    where: { campaignId, ownerId: user.id },
    orderBy: { createdAt: 'asc' },
  });
  if (cards.length === 0) return [];
  const tokens = await prisma.token.findMany({
    where: { sceneId: scene.id, characterId: { in: cards.map((card) => card.id) } },
    select: { characterId: true, x: true, y: true, size: true },
  });
  const view = toSceneView(scene);
  const near = new Set(
    tokens
      .filter((token) => isWallWithinReach(wall, [tokenCentre(token, view)], context.reachPx))
      .map((token) => token.characterId),
  );
  return cards.filter((card) => near.has(card.id));
}

function holdsKey(card: Character, deps: RealtimeDeps, lock: CpredLock): boolean {
  return cpredHasKey(parseCharacterData(card.data, deps.ctx.cpred), lock.keyId);
}

/**
 * Czy któraś z moich postaci przy klamce ma klucz do tego zamka — pyta
 * `opening:toggle` w kroku 4, zanim powie „zamknięte na klucz”.
 */
export async function keyHolderAtOpening(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  wall: WallView,
  context: SceneVisionContext,
): Promise<boolean> {
  const lock = openingLock(wall);
  if (lock.keyId === null) return false;
  const cards = await charactersAtOpening(deps.ctx.prisma, campaignId, user, scene, wall, context);
  return cards.some((card) => holdsKey(card, deps, lock));
}

async function writeLock(
  deps: RealtimeDeps,
  campaignId: string,
  wallId: number,
  scene: Scene,
  data: { lockRule?: CpredLock; locked?: boolean; open?: boolean },
): Promise<void> {
  await deps.ctx.prisma.wall.update({
    where: { id: wallId },
    data: {
      ...(data.lockRule ? { lockRule: JSON.stringify(data.lockRule) } : {}),
      ...(data.locked !== undefined ? { locked: data.locked } : {}),
      ...(data.open !== undefined ? { open: data.open } : {}),
    },
  });
  await afterWallChange(deps, campaignId, scene);
}

/** Otwarte wezwanie tej postaci do Testu tego zamka — drugi klik go nie dubluje. */
async function openLockCall(
  prisma: PrismaClient,
  campaignId: string,
  characterId: string,
  wallId: number,
): Promise<number | null> {
  const rows = await prisma.chatMessage.findMany({
    where: { campaignId, kind: 'check' },
    select: { id: true, payload: true },
    orderBy: { id: 'desc' },
    take: 50,
  });
  for (const row of rows) {
    if (!row.payload) continue;
    const entry = JSON.parse(row.payload) as {
      characterId?: string;
      resolved?: unknown;
      cancelled?: unknown;
      system?: { lockWallId?: number };
    };
    if (entry.characterId !== characterId || entry.system?.lockWallId !== wallId) continue;
    if (entry.resolved === undefined && entry.cancelled === undefined) return row.id;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * opening:pick — klucz albo Test zamka
 * ------------------------------------------------------------------ */

export const openingPickEvent = defineEvent<OpeningPickPayload, OpeningPickResult>({
  name: 'opening:pick',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const { row, wall } = await requireCampaignOpening(deps, campaignId, payload?.wallId);

    // MG nie potrzebuje wytrycha — otwiera kartą otworu albo rygiel zdejmuje ręką.
    if (user.role === ROLE_GM) {
      await writeLock(deps, campaignId, row.id, row.scene, { locked: false, open: true });
      return { outcome: 'open' };
    }

    const { context } = await requirePlayerOpening(deps, socket.data, user, row, wall);
    // Bez rygla nie ma czego wytrychować — otwór po prostu ustępuje, jak klamka.
    if (!wall.locked) {
      if (!wall.open) await writeLock(deps, campaignId, row.id, row.scene, { open: true });
      return { outcome: 'open' };
    }

    let at = await charactersAtOpening(prisma, campaignId, user, row.scene, wall, context);
    if (payload?.characterId !== undefined) {
      const chosen = await requireOwnCharacter(prisma, campaignId, user, payload.characterId);
      at = at.filter((card) => card.id === chosen.id);
    }
    const opener = at[0];
    if (!opener) throw new RealtimeError('OPENING_OUT_OF_REACH');

    const lock = openingLock(wall);
    const verdict = cpredLockOpening('locked', lock, {
      characterId: opener.id,
      isGm: false,
      hasKey: at.some((card) => holdsKey(card, deps, lock)),
      ...(typeof payload?.skillId === 'string' ? { skillId: payload.skillId } : {}),
    });

    switch (verdict.kind) {
      case 'already-open':
      case 'open':
        await writeLock(deps, campaignId, row.id, row.scene, { locked: false, open: true });
        return { outcome: 'open' };
      case 'refused':
        throw new RealtimeError(verdict.error);
      case 'test': {
        const pending = await openLockCall(prisma, campaignId, opener.id, row.id);
        if (pending !== null) return { outcome: 'test', callMessageId: pending };
        // Jak zamek pojemnika: wezwanie jawne, kubek z karty wezwania, próg
        // i Umiejętność w zapisanym wezwaniu, werdykt w `character-rolls.ts`.
        const name = openingName(wall);
        const frame: CheckFrame = { dv: verdict.dv, modifier: 0, visibility: 'public' };
        const created = await createCheckCall(deps, {
          campaignId,
          user,
          characterId: opener.id,
          request: { kind: 'skill', skillId: verdict.skillId },
          frame,
          prompt: `Zamek: ${name}`,
          lockWallId: row.id,
          calledByName: name,
        });
        return { outcome: 'test', callMessageId: created.messageId };
      }
    }
  },
});

/**
 * Rozliczenie Testu zamka otworu — woła je rzut na wezwanie z `lockWallId`.
 * Zdany zdejmuje rygiel i otwiera, niezdany zapisuje postać na liście prób.
 * Otwór, który w międzyczasie zniknął, przestał nim być albo stracił rygiel
 * z ręki MG, nie ma czego rozliczać.
 */
export async function settleOpeningLockTest(
  deps: RealtimeDeps,
  campaignId: string,
  wallId: number,
  characterId: string,
  success: boolean,
): Promise<void> {
  const row = await deps.ctx.prisma.wall.findUnique({
    where: { id: wallId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId || !row.locked) return;
  const wall = toWallView(row);
  if (!isOpening(wall)) return;
  if (success) {
    await writeLock(deps, campaignId, row.id, row.scene, { locked: false, open: true });
  } else {
    await writeLock(deps, campaignId, row.id, row.scene, {
      lockRule: cpredLockTried(openingLock(wall), characterId),
    });
  }
}

/* ------------------------------------------------------------------ *
 * opening:lock-config — MG: PT, Umiejętności, klucz, nowe próby
 * ------------------------------------------------------------------ */

/** Losowy uchwyt kluczy — nie id ściany ani karty (#40). */
function newKeyId(): string {
  return randomBytes(12).toString('base64url');
}

export const openingLockConfigEvent = defineEvent<OpeningLockConfigPayload, void>({
  name: 'opening:lock-config',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const prisma = deps.ctx.prisma;
    const { row, wall } = await requireCampaignOpening(deps, campaignId, payload?.wallId);
    let lock: CpredLock = { ...openingLock(wall) };

    if (payload.dv !== undefined) {
      const dv = payload.dv;
      if (!Number.isInteger(dv) || dv < CHECK_CALL_DV_MIN || dv > CHECK_CALL_DV_MAX) {
        throw new RealtimeError('BAD_REQUEST');
      }
      lock.dv = dv;
    }
    if (payload.skills !== undefined) {
      if (!Array.isArray(payload.skills) || payload.skills.length === 0) {
        throw new RealtimeError('BAD_REQUEST');
      }
      if (!payload.skills.every(isCpredLockSkill)) throw new RealtimeError('BAD_REQUEST');
      lock.skills = [...new Set(payload.skills)];
    }
    if (payload.resetTries === true) lock.tried = [];

    // „Wydaj klucz”: wiersz wyposażenia na wskazanej karcie, uchwyt powstaje
    // przy pierwszym wydaniu i zostaje — drugi klucz otwiera to samo.
    if (payload.issueKeyTo !== undefined) {
      const holder = await findCampaignCharacter(prisma, campaignId, payload.issueKeyTo);
      if (lock.keyId === null) lock = { ...lock, keyId: newKeyId() };
      const holderData = parseCharacterData(holder.data, deps.ctx.cpred);
      const gear = [...holderData.gear, cpredKeyRow(cpredRowId(), lock.keyId!, openingName(wall))];
      if (cpredItemListsOverflow(cpredItemLists({ ...holderData, gear })))
        throw new RealtimeError('TOO_MANY_ROWS');
      const savedHolder = await prisma.character.update({
        where: { id: holder.id },
        data: { data: JSON.stringify(mergeCharacterData(holderData, { gear })) },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(savedHolder, deps.ctx.cpred));
    }

    await writeLock(deps, campaignId, row.id, row.scene, { lockRule: lock });
  },
});
