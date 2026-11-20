import type {
  ChaseRaceLogEntry,
  ChaseRaceRow,
  RollBreakdownEntry,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_DRIVING_TEST_DV,
  ROLE_GM,
  chaseRacePending,
  cpredLostControlSpeed,
  cpredRaceBonuses,
  cpredRaceRollMode,
  cpredRaceRollers,
  cpredRaceWeakDriver,
  cpredVehicleSkillId,
  cpredVehicleWrecked,
  parseCharacterData,
  readCpredVehicle,
  rollFormula,
  tokenTableName,
  type CpredRollRequest,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { driverCapable, emitChase, placedOnScene } from './chase.js';
import { readRaceState, type StoredRace, type StoredRaceState } from './chase-offstage.js';
import { rollServerSkillTest } from './character-rolls.js';
import { INCLUDE_CHAT_NAMES, broadcastRedactedChatMessage, toChatMessageView } from './chat-io.js';
import { createCheckCall, emitCheckCallUpdate, requireCheckCall } from './checks.js';
import { requireCampaignId, type CombatRow } from './combat.js';
import { logSpentAction } from './combat-log.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitSceneView } from './scenes.js';

/**
 * Wyścig — Test przeciwstawny Prowadzenia na początku każdej rundy pościgu
 * (etap 72c, decyzje MG 6–7 z 15.11 i z 20.11).
 *
 * Kierowca każdego auta w kadrze rzuca REF + Umiejętność prowadzenia + 1k10;
 * zryw (`cpredRaceBonuses`) dolicza się do ruchu auta w turze kierowcy.
 * Za NPC-ów rzuca serwer od razu (bez kości 3D — jedna karta czatu), kierowca-
 * gracz dostaje wezwanie na kubek, a **runda stoi bez tury**, dopóki wszyscy
 * gracze nie rzucą: wskaźnik kolejki ma rundę N i pusty `activeCombatantId`.
 * MG rzuca za gracza albo go pomija (także „Następną turą”); po ostatnim
 * rzucie runda rusza od pierwszego w kolejce (`provideRaceResume`).
 *
 * Słaby kierowca (REF + Umiejętność + Moto ≤ 9) z pełną kartą: jego rzut jest
 * też Testem zwykłej jazdy — wynik nie wyższy niż PT 10 to utrata kontroli na
 * rundę. Przy jednym aucie z kierowcą Wyścigu nie ma, a rzuca tylko słaby
 * kierowca (`cpredRaceRollers`).
 *
 * Stan rundy mieszka w `Scene.chaseRace` obok numeru rundy (`chaseRoundOf`),
 * a karta czatu `chaserace` jest jego widokiem dla stołu.
 */

// ───────────────────────── Wznowienie rundy ─────────────────────────

type RaceResume = (
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
  user: SessionUser,
) => Promise<void>;

let resumeRound: RaceResume | null = null;

/**
 * Wznowienie rundy po Wyścigu mieszka w `combat-actions.ts` (tura, haki
 * początku tury, oddane tury), który przez `turn-effects.ts` importuje ten
 * moduł — więc podaje funkcję przy ładowaniu, jak `provideChaseEmitter`.
 */
export function provideRaceResume(next: RaceResume): void {
  resumeRound = next;
}

// ───────────────────────── Rzut ─────────────────────────

interface RaceRoll {
  total: number;
  dice: number[];
  breakdown: RollBreakdownEntry[];
}

function rollDice(result: RollResult): number[] {
  const dice = result.terms.flatMap((term) => ('rolls' in term ? term.rolls : []));
  if (result.critical && result.critical.extraRoll > 0) dice.push(result.critical.extraRoll);
  return dice;
}

/**
 * Rzut Wyścigu figury, za którą rzuca serwer (NPC, albo gracz ręką MG):
 * planerem z karty (`sheet`) albo czystym 1k10 (`die` — Wsparcie, figura bez
 * karty). Szczęścia NPC-e nie mają (rozstrzygnięcie projektu nr 10).
 */
async function rollRaceFor(
  deps: RealtimeDeps,
  token: Token,
  skillId: string,
  mode: 'sheet' | 'die',
): Promise<RaceRoll> {
  if (mode === 'sheet') {
    const result = await rollServerSkillTest(deps, token, skillId, CPRED_DRIVING_TEST_DV);
    if (result) {
      return { total: result.total, dice: rollDice(result), breakdown: result.breakdown ?? [] };
    }
  }
  const result = rollFormula(
    { terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10 }] },
    createMixedRng(),
    { checkRule: true },
  );
  return { total: result.total, dice: rollDice(result), breakdown: [] };
}

// ───────────────────────── Karta czatu ─────────────────────────

function publicEntry(race: StoredRace): ChaseRaceLogEntry {
  const { sceneId, round, solo, status, rows } = race;
  return { sceneId, round, solo, status, rows };
}

function raceTitle(race: Pick<ChaseRaceLogEntry, 'round' | 'solo'>): string {
  return race.solo ? `Zwykła jazda — runda ${race.round}` : `Wyścig — runda ${race.round}`;
}

async function postRaceCard(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  entry: ChaseRaceLogEntry,
): Promise<number> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'chaserace',
      text: raceTitle(entry),
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  // Przycięte per widz (`redactChatMessage`): rozbicie rzutu NPC-a zostaje u MG.
  await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(stored));
  return stored.id;
}

async function updateRaceCard(
  deps: RealtimeDeps,
  campaignId: string,
  race: StoredRace,
): Promise<void> {
  const stored = await deps.ctx.prisma.chatMessage.update({
    where: { id: race.messageId },
    data: { payload: JSON.stringify(publicEntry(race)) },
    include: INCLUDE_CHAT_NAMES,
  });
  await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(stored), 'chat:update');
}

async function saveRace(deps: RealtimeDeps, sceneId: string, race: StoredRace): Promise<void> {
  const state: StoredRaceState = { round: race.round, race };
  await deps.ctx.prisma.scene.update({
    where: { id: sceneId },
    data: { chaseRace: JSON.stringify(state) },
  });
}

// ───────────────────────── Początek rundy ─────────────────────────

/**
 * Wyścig na początku rundy (hak `advanceTurn` zaraz po `startChaseRound`):
 * kierowcy aut w kadrze — auto jedzie (`racing`, silnik, nie wrak), w fotelu
 * kierowcy figura zdolna do działania, która ma turę w kolejce. Zwraca `true`,
 * gdy runda ma czekać na kubki graczy — wtedy wskaźnik staje bez tury.
 */
export async function startChaseRace(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  combat: CombatRow,
  round: number,
  user: SessionUser,
): Promise<boolean> {
  if (scene.kind !== 'chase') return false;
  const prisma = deps.ctx.prisma;
  const fresh = await prisma.scene.findUnique({ where: { id: scene.id } });
  const state = fresh ? readRaceState(fresh) : null;
  // Raz na rundę: `startChaseRound` zapisał właśnie `{ round }`; Wyścig tej
  // rundy już był, gdy MG cofnął i ponowił turę.
  if (!fresh || !state || state.round !== round || state.race) return false;

  const inQueue = new Set(
    combat.combatants.map((row) => row.tokenId).filter((id): id is string => id !== null),
  );
  const placed = await placedOnScene(prisma, scene.id);
  const drivers: (ChaseRaceRow & {
    token: Token;
    skillId: string;
    mode: 'sheet' | 'die';
    playerOwned: boolean;
  })[] = [];
  for (const row of placed) {
    if (row.status !== 'racing' || !row.started || row.lostControl) continue;
    const stats = readCpredVehicle(row.vehicle.system);
    if (cpredVehicleWrecked(stats)) continue;
    const token = await prisma.token.findFirst({
      where: { sceneVehicleId: row.id, vehicleSeat: 0 },
    });
    if (!token || !driverCapable(token) || !inQueue.has(token.id)) continue;
    const character = token.characterId
      ? await prisma.character.findUnique({ where: { id: token.characterId } })
      : null;
    // Bot-towarzysz nie prowadzi (`BOT_CANNOT_DRIVE`), ale gdyby siedział za
    // kierownicą, rzuca za niego serwer jak za NPC-a — kubek ma tylko gracz.
    const bot = character
      ? await prisma.botProfile.findFirst({ where: { characterId: character.id } })
      : null;
    const playerOwned = character !== null && character.ownerId !== null && bot === null;
    const data = character ? parseCharacterData(character.data, deps.ctx.cpred) : null;
    const mode = data ? cpredRaceRollMode(data) : 'die';
    drivers.push({
      vehicleId: row.id,
      vehicleName: row.vehicle.name,
      driverName: token.hidden ? '' : tokenTableName(token, character?.name ?? token.name),
      ownerId: playerOwned ? character!.ownerId : null,
      weak: data ? cpredRaceWeakDriver(data, deps.ctx.cpred, stats.kind, playerOwned) : false,
      token,
      skillId: cpredVehicleSkillId(stats.kind),
      mode,
      playerOwned,
    });
  }
  const rollers = cpredRaceRollers(drivers);
  if (rollers.length === 0) return false;
  const solo = drivers.length < 2;

  const rows: ChaseRaceRow[] = [];
  const calls: { row: ChaseRaceRow; characterId: string; skillId: string }[] = [];
  for (const driver of rollers) {
    const { token, skillId, mode, playerOwned, ...row } = driver;
    if (playerOwned && token.characterId) {
      calls.push({ row, characterId: token.characterId, skillId });
    } else {
      Object.assign(row, await rollRaceFor(deps, token, skillId, mode), { by: 'npc' });
    }
    rows.push(row);
  }
  const race: StoredRace = {
    sceneId: scene.id,
    round,
    solo,
    status: 'waiting',
    rows,
    messageId: 0,
    paused: false,
  };
  race.messageId = await postRaceCard(deps, campaignId, user, publicEntry(race));
  // Wezwania na kubek po karcie Wyścigu — w czacie stoją pod nią.
  for (const { row, characterId, skillId } of calls) {
    const request: CpredRollRequest = { kind: 'skill', skillId };
    const created = await createCheckCall(deps, {
      campaignId,
      user,
      characterId,
      request,
      frame: {
        ...(row.weak ? { dv: CPRED_DRIVING_TEST_DV } : {}),
        modifier: 0,
        visibility: 'public',
      },
      prompt: solo
        ? `Zwykła jazda — runda ${round}: słaby kierowca rzuca, czy panuje nad autem (${row.vehicleName}).`
        : `Wyścig — runda ${round}: Test przeciwstawny Prowadzenia (${row.vehicleName}).`,
      chaseRace: { sceneId: scene.id, round, vehicleId: row.vehicleId },
      calledByName: solo ? 'Zwykła jazda' : 'Wyścig',
    });
    row.callMessageId = created.messageId;
  }

  if (chaseRacePending(race).length === 0) {
    await settleRace(deps, campaignId, user, scene.id, race);
    return false;
  }
  race.paused = true;
  await updateRaceCard(deps, campaignId, race);
  await saveRace(deps, scene.id, race);
  await emitSceneView(deps, campaignId, scene.id);
  return true;
}

// ───────────────────────── Rozstrzygnięcie ─────────────────────────

/**
 * Zryw i utrata kontroli — gdy padł ostatni rzut albo MG pominął resztę.
 * Słaby kierowca, który nie zdał, traci kontrolę od razu (prędkość −10), ale
 * auto jedzie dopiero na koniec jego tury — automatem 1k6 (`chaseTurnEnd`).
 */
async function settleRace(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string,
  race: StoredRace,
): Promise<void> {
  const prisma = deps.ctx.prisma;
  const rolled = race.rows.filter((row) => row.total !== undefined);
  const results = cpredRaceBonuses(
    rolled.map((row) => ({ id: row.vehicleId, total: row.total!, weak: row.weak })),
  );
  for (const row of race.rows) {
    const result = results[row.vehicleId];
    if (!result) continue;
    row.bonus = result.bonus;
    row.lostControl = result.lostControl;
    const vehicle = await prisma.sceneVehicle.findUnique({ where: { id: row.vehicleId } });
    if (!vehicle) continue;
    await prisma.sceneVehicle.update({
      where: { id: vehicle.id },
      data: result.lostControl
        ? { raceBonus: 0, lostControl: true, speed: cpredLostControlSpeed(vehicle.speed) }
        : { raceBonus: result.bonus },
    });
    if (result.lostControl) {
      await logSpentAction(deps, campaignId, user, {
        combatantId: '',
        actorName: row.vehicleName,
        actionId: 'chase-lost-control',
        actionName: 'Utrata kontroli',
        note: `oblana zwykła jazda (${row.total} ≤ PT ${CPRED_DRIVING_TEST_DV}) — auto jedzie samo do końca rundy`,
      });
    }
  }
  const resume = race.paused;
  race.status = 'done';
  race.paused = false;
  await updateRaceCard(deps, campaignId, race);
  await saveRace(deps, sceneId, race);
  await emitChase(deps, campaignId, sceneId);
  await emitSceneView(deps, campaignId, sceneId);
  if (resume && resumeRound) await resumeRound(deps, campaignId, sceneId, user);
}

/** Wyścig sceny w stanie „czeka” albo odmowa. */
async function requireWaitingRace(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
): Promise<StoredRace> {
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('SCENE_NOT_FOUND');
  const race = readRaceState(scene)?.race;
  if (!race || race.status !== 'waiting') throw new RealtimeError('RACE_NOT_WAITING');
  return race;
}

/**
 * Rzut gracza z kubka na wezwanie Wyścigu (`character:roll`, adres tylko
 * z zapisanego wezwania). Spóźniony rzut — Wyścig rozstrzygnięty albo walka
 * się skończyła — zostaje zwykłą kartą rzutu bez skutku.
 */
export async function settleChaseRaceRoll(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  address: unknown,
  result: RollResult,
): Promise<void> {
  if (typeof address !== 'object' || address === null) return;
  const { sceneId, round, vehicleId } = address as Record<string, unknown>;
  if (typeof sceneId !== 'string' || typeof vehicleId !== 'string') return;
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  const race = scene && scene.campaignId === campaignId ? readRaceState(scene)?.race : undefined;
  if (!race || race.status !== 'waiting' || race.round !== round) return;
  const row = chaseRacePending(race).find((pending) => pending.vehicleId === vehicleId);
  if (!row) return;
  row.total = result.total;
  row.dice = rollDice(result);
  row.breakdown = result.breakdown ?? [];
  row.by = user.role === ROLE_GM ? 'gm' : 'player';
  await recordRow(deps, campaignId, user, sceneId, race);
}

async function recordRow(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string,
  race: StoredRace,
): Promise<void> {
  if (chaseRacePending(race).length === 0) {
    await settleRace(deps, campaignId, user, sceneId, race);
    return;
  }
  await updateRaceCard(deps, campaignId, race);
  await saveRace(deps, sceneId, race);
  await emitSceneView(deps, campaignId, sceneId);
}

/** Wezwanie wiersza zamknięte bez kubka: rzutem MG albo pominięciem. */
async function closeRowCall(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  race: StoredRace,
  row: ChaseRaceRow,
): Promise<void> {
  if (row.callMessageId === undefined) return;
  const { entry } = await requireCheckCall(deps.ctx.prisma, campaignId, row.callMessageId);
  if (entry.resolved || entry.cancelled) return;
  if (row.total !== undefined) {
    entry.resolved = {
      messageId: race.messageId,
      byName: user.name,
      success: row.weak ? row.total > CPRED_DRIVING_TEST_DV : true,
      total: row.total,
    };
  } else {
    entry.cancelled = { byName: user.name };
  }
  await emitCheckCallUpdate(deps, campaignId, row.callMessageId, entry);
}

/**
 * MG pomija kierowców, którzy jeszcze nie rzucili (gracz odszedł od stołu):
 * bez zrywu i bez utraty kontroli, a ich wynik nie jest „najniższym” dla
 * reszty. Wołają to „Pomiń Wyścig” i „Następna tura” MG, gdy runda czeka.
 * Zwraca `false`, gdy na scenie nic nie czeka.
 */
export async function skipChaseRace(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string,
): Promise<boolean> {
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  const race = scene ? readRaceState(scene)?.race : undefined;
  if (!race || race.status !== 'waiting') return false;
  for (const row of chaseRacePending(race)) {
    row.skipped = true;
    await closeRowCall(deps, campaignId, user, race, row);
  }
  await settleRace(deps, campaignId, user, sceneId, race);
  return true;
}

/**
 * Koniec walki w trakcie Wyścigu: karta zostaje z tym, co padło, jako
 * przerwana, a wezwania na kubek gasną (`check:cancel` MG zrobiłby to samo).
 */
export async function cancelChaseRace(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  sceneId: string,
): Promise<void> {
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  const race = scene ? readRaceState(scene)?.race : undefined;
  if (!race || race.status !== 'waiting') return;
  for (const row of chaseRacePending(race)) await closeRowCall(deps, campaignId, user, race, row);
  race.status = 'cancelled';
  race.paused = false;
  await updateRaceCard(deps, campaignId, race);
}

// ───────────────────────── Zdarzenia MG ─────────────────────────

interface ChaseRaceCardPayload {
  /** Karta „Wyścig — runda N”. */
  messageId: number;
  /** Auto, za którego kierowcę MG rzuca (`chase:race-roll`). */
  vehicleId?: string;
}

async function raceOfCard(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: unknown,
): Promise<{ sceneId: string; race: StoredRace }> {
  if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const stored = await deps.ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!stored || stored.campaignId !== campaignId || stored.kind !== 'chaserace') {
    throw new RealtimeError('RACE_NOT_FOUND');
  }
  const entry = JSON.parse(stored.payload ?? '{}') as Partial<ChaseRaceLogEntry>;
  if (typeof entry.sceneId !== 'string') throw new RealtimeError('RACE_NOT_FOUND');
  const race = await requireWaitingRace(deps, campaignId, entry.sceneId);
  if (race.messageId !== messageId) throw new RealtimeError('RACE_NOT_WAITING');
  return { sceneId: entry.sceneId, race };
}

/** MG rzuca Wyścig za gracza, który nie może sięgnąć po kubek — z karty, bez Szczęścia. */
export const chaseRaceRollEvent = defineEvent<ChaseRaceCardPayload, void>({
  name: 'chase:race-roll',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { sceneId, race } = await raceOfCard(deps, campaignId, payload?.messageId);
    const row = chaseRacePending(race).find((pending) => pending.vehicleId === payload?.vehicleId);
    if (!row) throw new RealtimeError('RACE_NOT_WAITING');
    const token = await deps.ctx.prisma.token.findFirst({
      where: { sceneVehicleId: row.vehicleId, vehicleSeat: 0 },
    });
    const vehicle = await deps.ctx.prisma.sceneVehicle.findUnique({
      where: { id: row.vehicleId },
      include: { vehicle: true },
    });
    if (!token || !vehicle) throw new RealtimeError('NOT_DRIVER');
    const kind = readCpredVehicle(vehicle.vehicle.system).kind;
    Object.assign(row, await rollRaceFor(deps, token, cpredVehicleSkillId(kind), 'sheet'), {
      by: 'gm',
    });
    await closeRowCall(deps, campaignId, user, race, row);
    await recordRow(deps, campaignId, user, sceneId, race);
  },
});

/** MG pomija tych, którzy jeszcze nie rzucili — runda rusza. */
export const chaseRaceSkipEvent = defineEvent<ChaseRaceCardPayload, void>({
  name: 'chase:race-skip',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { sceneId } = await raceOfCard(deps, campaignId, payload?.messageId);
    await skipChaseRace(deps, campaignId, user, sceneId);
  },
});
