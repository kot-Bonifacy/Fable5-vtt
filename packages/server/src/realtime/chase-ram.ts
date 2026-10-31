import type { CombatActionLogEntry, RollResult, ScenePoint, SessionUser } from '@vtt/shared';
import {
  CPRED_ACTION_NITRO,
  CPRED_RAM_DODGE_DV,
  CPRED_RAM_DODGE_SKILL_ID,
  CPRED_RAM_INJURY_NAME,
  chaseBodyHalfExtents,
  chaseFirstContact,
  chaseHitsWithFront,
  cpredRamContinues,
  cpredRamOutcome,
  cpredVehicleHasPlow,
  isCriticalInjuryEntry,
  parseRollNotation,
  readCpredTurn,
  readCpredVehicle,
  rollFormula,
  tokenTableName,
  type ChaseObstacleBox,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene, Token } from '../generated/prisma/client.js';
import { buildCompendiumSync } from './compendium.js';
import { createMixedRng } from './dice-rng.js';
import { chaseBodyOf, chaseGeometry, placedOnScene, type PlacedVehicle } from './chase.js';
import { findCombatantForToken } from './combat.js';
import { logSpentAction } from './combat-log.js';
import { rollServerSkillTest } from './character-rolls.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { applyDamageRollTo, giveCriticalInjury } from './damage.js';
import type { RealtimeDeps } from './registry.js';

/**
 * Taranowanie na scenie pościgu (etap 65d2, s. 192; Pług bojowy s. 164).
 *
 * Auto jedzie w linii prostej jak marsz figury, a `chaseFirstContact` mówi, na
 * co wjedzie po drodze: inne auto w kadrze albo pieszego (figura na jezdni,
 * spoza foteli). Zderzenie rozstrzyga się tu w całości — kości 6k6 lecą
 * jawnie na czacie, obrażenia idą tą samą drogą co „Zastosuj” (z „Cofnij”),
 * a każdy uczestnik wypadku dostaje Ranę Krytyczną z kompendium ran.
 */

type Placed = PlacedVehicle & { scene: Scene };

/** Przeszkoda na drodze: auto z tej sceny albo pieszy. */
export type ChaseObstacle =
  | { kind: 'vehicle'; id: string; vehicle: PlacedVehicle }
  | { kind: 'token'; id: string; token: Token };

/**
 * Co stoi na jezdni dla tego auta: inne auta w kadrze (także wraki — kadłub
 * dalej jest na drodze) i jawne figury spoza foteli, które mają kartę albo PW.
 */
export async function chaseObstaclesFor(
  prisma: PrismaClient,
  placed: Placed,
): Promise<{ boxes: ChaseObstacleBox[]; byId: Map<string, ChaseObstacle> }> {
  const { settings } = chaseGeometry(placed.scene);
  const grid = placed.scene.gridSizePx;
  const boxes: ChaseObstacleBox[] = [];
  const byId = new Map<string, ChaseObstacle>();
  for (const other of await placedOnScene(prisma, placed.sceneId)) {
    if (other.id === placed.id || other.status !== 'racing') continue;
    const { hx, hy } = chaseBodyHalfExtents(chaseBodyOf(other.vehicle), settings.direction, grid);
    boxes.push({ id: other.id, centre: { x: other.x, y: other.y }, hx, hy });
    byId.set(other.id, { kind: 'vehicle', id: other.id, vehicle: other });
  }
  const walkers = await prisma.token.findMany({
    where: { sceneId: placed.sceneId, sceneVehicleId: null, hidden: false },
  });
  for (const token of walkers) {
    if (!token.characterId && token.hpMax === null) continue;
    const half = (Math.max(1, token.size) * grid) / 2;
    boxes.push({
      id: `token:${token.id}`,
      centre: { x: token.x + half, y: token.y + half },
      hx: half,
      hy: half,
    });
    byId.set(`token:${token.id}`, { kind: 'token', id: token.id, token });
  }
  return { boxes, byId };
}

/** Pierwsza przeszkoda na drodze `from → to` (pominięte id — już staranowane). */
export async function firstChaseContact(
  prisma: PrismaClient,
  placed: Placed,
  from: ScenePoint,
  to: ScenePoint,
  skip: ReadonlySet<string> = new Set(),
): Promise<{ centre: ScenePoint; obstacle: ChaseObstacle; front: boolean } | null> {
  const { settings } = chaseGeometry(placed.scene);
  const mover = chaseBodyHalfExtents(
    chaseBodyOf(placed.vehicle),
    settings.direction,
    placed.scene.gridSizePx,
  );
  const { boxes, byId } = await chaseObstaclesFor(prisma, placed);
  const contact = chaseFirstContact(
    from,
    to,
    mover,
    boxes.filter((box) => !skip.has(box.id)),
  );
  if (!contact) return null;
  const obstacle = byId.get(contact.id);
  if (!obstacle) return null;
  return {
    centre: contact.centre,
    obstacle,
    front: chaseHitsWithFront(settings.direction, from, to, contact),
  };
}

/**
 * Karta rzutu serwera do stołu z kośćmi 3D — Test zwykłej jazdy, Manewr, Unik
 * pieszego przed taranowaniem i kości obrażeń wypadku.
 */
export async function postServerRoll(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string,
  roll: RollResult,
): Promise<number> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'roll',
      text: roll.title ?? '',
      payload: JSON.stringify(roll),
      sceneId,
    },
    include: INCLUDE_CHAT_NAMES,
  });
  await deliverRollMessage(deps, campaignId, user.id, toChatMessageView(stored));
  return stored.id;
}

/** Czy kierowca tego auta odpalił Nitro w tej turze (s. 164: „…był pod działaniem Nitro”). */
export async function driverUsedNitro(prisma: PrismaClient, placed: Placed): Promise<boolean> {
  const driver = await prisma.token.findFirst({
    where: { sceneVehicleId: placed.id, vehicleSeat: 0 },
  });
  if (!driver) return false;
  const found = await findCombatantForToken(prisma, placed.sceneId, driver.id);
  if (!found) return false;
  return readCpredTurn(found.combatant.turnState ?? undefined).action?.id === CPRED_ACTION_NITRO;
}

/**
 * Kości obrażeń wypadku jako karta obrażeń wymierzona w auto albo pieszego,
 * rozliczona od razu drogą „Zastosuj” — „Cofnij” zdejmuje ją jak każdą inną.
 */
async function rollRamDamage(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  scene: Scene,
  notation: string,
  title: string,
  target: { vehicleId: string } | { tokenId: string },
): Promise<void> {
  const parsed = parseRollNotation(notation);
  if (!parsed.ok) return;
  const roll = rollFormula(parsed.formula, createMixedRng());
  roll.title = title;
  roll.actor = 'Taranowanie';
  roll.damage = {
    location: 'body',
    locationLabel: 'taranowanie',
    weaponName: 'Taranowanie',
    ...('vehicleId' in target
      ? { targetVehicleId: target.vehicleId }
      : { targetTokenId: target.tokenId }),
  };
  const messageId = await postServerRoll(deps, campaignId, user, scene.id, roll);
  await applyDamageRollTo(
    deps,
    campaignId,
    user,
    'vehicleId' in target
      ? { messageId, vehicleId: target.vehicleId }
      : { messageId, tokenId: target.tokenId, location: 'body' },
    messageId,
  );
}

/** „Odgięciowy uraz kręgosłupa szyjnego” dla figur z kartą; wpisu w kompendium brak — nic. */
async function injureParticipants(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokens: readonly Token[],
): Promise<void> {
  if (tokens.length === 0) return;
  const compendium = await buildCompendiumSync(deps, campaignId);
  const wanted = CPRED_RAM_INJURY_NAME.toLocaleLowerCase('pl');
  const entry = compendium.entries.find(
    (row) => isCriticalInjuryEntry(row) && row.name.toLocaleLowerCase('pl') === wanted,
  );
  if (!entry) return;
  const seen = new Set<string>();
  for (const token of tokens) {
    if (!token.characterId || seen.has(token.characterId)) continue;
    seen.add(token.characterId);
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character) continue;
    await giveCriticalInjury(deps, campaignId, user.id, character, entry.id, 'Taranowanie.');
  }
}

async function passengersOf(prisma: PrismaClient, sceneVehicleId: string): Promise<Token[]> {
  return prisma.token.findMany({ where: { sceneVehicleId } });
}

/**
 * Zderzenie taranującego auta z przeszkodą (s. 192). Zwraca, czy taranujący
 * jedzie dalej: po pieszym zawsze, po aucie — gdy jego PUK spadły do zera.
 */
export async function resolveRam(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  rammer: Placed,
  obstacle: ChaseObstacle,
  front: boolean,
): Promise<boolean> {
  const prisma = deps.ctx.prisma;
  const scene = rammer.scene;
  const rammerStats = readCpredVehicle(rammer.vehicle.system);
  const outcome = cpredRamOutcome({
    plow: cpredVehicleHasPlow(rammerStats),
    front,
    nitro: await driverUsedNitro(prisma, rammer),
  });
  const struckName =
    obstacle.kind === 'vehicle'
      ? obstacle.vehicle.vehicle.name
      : tokenTableName(obstacle.token, obstacle.token.name);
  const line: CombatActionLogEntry = {
    combatantId: '',
    actorName: rammer.vehicle.name,
    actionId: 'chase-ram',
    actionName: 'Taranowanie',
    note: outcome.rammerDamage ? `wjeżdża w: ${struckName}` : `wjeżdża pługiem w: ${struckName}`,
  };
  await logSpentAction(deps, campaignId, user, line);

  // „…pieszy musi wykonać udany Test ZW + Unik + 1k10 przeciw PT 13” — serwer
  // rzuca za niego od razu, jak auto-unik (63b): auto nie czeka na decyzję.
  if (obstacle.kind === 'token') {
    const dodge = await rollServerSkillTest(
      deps,
      obstacle.token,
      CPRED_RAM_DODGE_SKILL_ID,
      CPRED_RAM_DODGE_DV,
    );
    if (dodge) {
      dodge.title = `Unik przed taranowaniem: ${dodge.title ?? ''}`.trim();
      await postServerRoll(deps, campaignId, user, scene.id, dodge);
      if (dodge.outcome?.success === true) return true;
    }
  }

  const title = `Taranowanie: ${rammer.vehicle.name} → ${struckName}`;
  await rollRamDamage(
    deps,
    campaignId,
    user,
    scene,
    outcome.struckDamage,
    title,
    obstacle.kind === 'vehicle' ? { vehicleId: obstacle.id } : { tokenId: obstacle.id },
  );
  if (outcome.rammerDamage) {
    await rollRamDamage(
      deps,
      campaignId,
      user,
      scene,
      outcome.rammerDamage,
      `Taranowanie: ${struckName} → ${rammer.vehicle.name}`,
      { vehicleId: rammer.id },
    );
  }

  const injured: Token[] = [];
  if (outcome.rammerInjured) injured.push(...(await passengersOf(prisma, rammer.id)));
  if (obstacle.kind === 'vehicle') injured.push(...(await passengersOf(prisma, obstacle.id)));
  else {
    const fresh = await prisma.token.findUnique({ where: { id: obstacle.id } });
    if (fresh) injured.push(fresh);
  }
  await injureParticipants(deps, campaignId, user, injured);

  if (obstacle.kind === 'token') return true;
  const struck = await prisma.vehicle.findUnique({ where: { id: obstacle.vehicle.vehicleId } });
  return cpredRamContinues({
    pedestrian: false,
    hpAfter: struck ? readCpredVehicle(struck.system).hp : 0,
  });
}
