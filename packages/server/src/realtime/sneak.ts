import type {
  CheckRequestEntry,
  SessionUser,
  SneakEndReason,
  SneakEndedBroadcast,
  SneakNoticedBroadcast,
  SneakRequestPayload,
  SneakStopPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_SNEAK,
  ROLE_GM,
  cpredSneakNoticed,
  cpredSneakRequest,
  isCheckRequestOpen,
  readTokenSneak,
  sneakEndedText,
  sneakTriedBy,
  tokenCentre,
  tokenDisposition,
  tokenTableName,
  writeTokenSneak,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { toSessionUser } from '../auth/sessions.js';
import { sheetActionBlock, sheetTurnForfeit } from '../sheets.js';
import { campaignGmUser } from './campaign-gm.js';
import { refuseAwaitingGm } from './character-io.js';
import { rollSecretPerception } from './character-rolls.js';
import { insertCheckRequest, sneakTokenIdOf } from './checks.js';
import {
  findCombatantForToken,
  readTokenStatuses,
  requireCampaignId,
  spendTurnForCombatant,
} from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { containerTokenIds } from './containers.js';
import { checkSighting, type LivePosition } from './foe-sighting.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { toSceneView } from './scenes.js';
import { emitToCampaignUser, gmRoom } from './state.js';
import { emitTokenUpsert, requireCampaignToken, toTokenView } from './tokens.js';
import { isPointObservable, loadVisionContext, tokenSightFor } from './vision.js';
import { logGmZoneLine } from './zones.js';

/**
 * Tryb skradania figury gracza (etap 61, zlecenie MG z 28.10).
 *
 * Droga do trybu to zwykła prośba o Test (etap 40), tylko z adresem figury:
 * gracz klika „Skradanie”, MG w panelu decyzji wybiera modyfikator albo
 * odmawia, zgoda wystawia wezwanie bez PT, a rzut kubkiem (Akcja w walce,
 * pobrana przed kośćmi) zapisuje wynik na figurze jako `Token.sneak`.
 *
 * Od tej chwili każdy NPC (poza Przyjaznymi i pojemnikami), którego **własne
 * oczy** widzą figurę — `tokenSightFor`, ta sama miara co u botów — rzuca raz
 * w ukryciu Percepcję przeciw temu wynikowi. Rzuty padają na wejściu
 * `checkSighting` (etap 56), czyli po każdej zmianie tego, co widać: ruchu
 * kogokolwiek, mgle, ścianach, światłach. Kto zauważy, kończy tryb; Wrogi
 * zakłada walkę jak w 56, Neutralny daje MG pasek.
 *
 * Póki ktoś na scenie się skrada, walkę z 56 wyzwala wróg, który widzi figurę
 * drużyny niebędącą w trybie (`foeAware`) — nie to, że drużyna widzi wroga:
 * skradający się zawsze widzi strażnika, zanim ten zobaczy jego.
 */

/** Odmowy tej drogi — teksty w `sneakErrorText` klienta. */
export const SNEAK_ACTIVE = 'SNEAK_ACTIVE';
export const SNEAK_PENDING = 'SNEAK_PENDING';
export const SNEAK_NO_SHEET = 'SNEAK_NO_SHEET';
export const SNEAK_NOT_ACTIVE = 'SNEAK_NOT_ACTIVE';

/** Zdanie prośby na karcie — MG czyta je w panelu decyzji. */
const SNEAK_REQUEST_REASON = 'Wchodzę w tryb skradania.';

/** Figura gracza i jej karta — tylko taka skrada się z paska (etap 61). */
async function requireOwnSneaker(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: unknown,
): Promise<{ token: Token; scene: Scene }> {
  const found = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  if (found.token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
  return found;
}

/** Czy ta figura ma już otwartą prośbę o skradanie — druga czekałaby na nic. */
async function sneakRequestPending(
  deps: RealtimeDeps,
  campaignId: string,
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const rows = await deps.ctx.prisma.chatMessage.findMany({
    where: { campaignId, kind: 'request', authorId: userId },
    select: { payload: true },
  });
  return rows.some((row) => {
    if (!row.payload) return false;
    const entry = JSON.parse(row.payload) as CheckRequestEntry;
    return isCheckRequestOpen(entry) && sneakTokenIdOf(entry) === tokenId;
  });
}

/**
 * Czy figura może teraz wejść w tryb: stan, który zabiera Akcje, odmawia
 * zawsze, a w trwającej rundzie trzeba mieć swoją turę i Akcję (decyzja MG 4).
 * Na sucho — Akcję bierze dopiero rzut (`requireSneakStart`).
 */
async function refuseSneakStart(
  deps: RealtimeDeps,
  scene: Scene,
  token: Token,
  user: SessionUser,
): Promise<void> {
  if (readTokenSneak(token.sneak)) throw new RealtimeError(SNEAK_ACTIVE);
  if (sheetActionBlock(readTokenStatuses(token.statuses))) {
    throw new RealtimeError('STATUS_BLOCKED');
  }
  const found = await findCombatantForToken(deps.ctx.prisma, scene.id, token.id);
  if (!found) return;
  const outcome = await spendTurnForCombatant(
    deps,
    found.combat,
    found.combatant,
    { kind: 'action', actionId: CPRED_ACTION_SNEAK },
    user,
    { dryRun: true },
  );
  if (outcome.kind === 'refused') throw new RealtimeError(outcome.error);
}

export const sneakRequestEvent = defineEvent<SneakRequestPayload, { messageId: number }>({
  name: 'sneak:request',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const found = await requireCampaignToken(deps.ctx.prisma, campaignId, payload?.tokenId);
    // MG nie prosi sam siebie (etap 40) — skradanie zaczyna gracz. Po figurze,
    // żeby cudza figura odpowiadała „nie ma takiej” każdemu (izolacja, 44b).
    if (user.role === ROLE_GM) throw new RealtimeError('BAD_REQUEST');
    if (found.token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
    const { token, scene } = found;
    if (!token.characterId) throw new RealtimeError(SNEAK_NO_SHEET);
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character || character.campaignId !== campaignId) {
      throw new RealtimeError(SNEAK_NO_SHEET);
    }
    if (character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_YOURS');
    refuseAwaitingGm(character, user);
    await refuseSneakStart(deps, scene, token, user);
    if (await sneakRequestPending(deps, campaignId, user.id, token.id)) {
      throw new RealtimeError(SNEAK_PENDING);
    }
    return insertCheckRequest(deps, {
      campaignId,
      user,
      character,
      request: cpredSneakRequest(token.id),
      reason: SNEAK_REQUEST_REASON,
    });
  },
});

/**
 * Przed kośćmi Testu Skradania z wezwania (etap 61): figura jeszcze istnieje,
 * nie skrada się już, a w trwającej rundzie płaci Akcję — odmowa przed
 * rzutem, jak przy Ustabilizowaniu, nie po nim.
 */
export async function requireSneakStart(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: string,
): Promise<void> {
  const { token, scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  if (readTokenSneak(token.sneak)) throw new RealtimeError(SNEAK_ACTIVE);
  if (sheetActionBlock(readTokenStatuses(token.statuses))) {
    throw new RealtimeError('STATUS_BLOCKED');
  }
  if (!(await findCombatantForToken(deps.ctx.prisma, scene.id, token.id))) return;
  await requireTurnSpend(
    deps,
    campaignId,
    scene,
    token.id,
    { kind: 'action', actionId: CPRED_ACTION_SNEAK },
    user,
    CPRED_ACTION_SNEAK,
    // Karta rzutu „Wezwanie: Skradanie się” mówi to sama.
    { silent: true },
  );
}

/**
 * Po rzucie: wynik staje się progiem, figura wchodzi w tryb, a NPC-e, które ją
 * widzą, od razu rzucają Percepcję (`checkSighting`).
 */
export async function settleSneakTest(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  total: number,
  modifier: number,
): Promise<void> {
  const token = await deps.ctx.prisma.token.findUnique({
    where: { id: tokenId },
    include: { scene: true },
  });
  if (!token || token.scene.campaignId !== campaignId) return;
  const { scene, ...row } = token;
  const updated = await deps.ctx.prisma.token.update({
    where: { id: row.id },
    data: { sneak: writeTokenSneak({ dv: total, modifier, tried: [] }) },
  });
  await emitTokenUpsert(deps, campaignId, scene, updated);
  await checkSighting(deps, campaignId, scene);
}

export const sneakStopEvent = defineEvent<SneakStopPayload, void>({
  name: 'sneak:stop',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } =
      user.role === ROLE_GM
        ? await requireCampaignToken(deps.ctx.prisma, campaignId, payload?.tokenId)
        : await requireOwnSneaker(deps, campaignId, user, payload?.tokenId);
    if (!readTokenSneak(token.sneak)) throw new RealtimeError(SNEAK_NOT_ACTIVE);
    await endSneak(deps, campaignId, scene, token, user.role === ROLE_GM ? 'gm' : 'player');
  },
});

/**
 * Kończy tryb figury: kolumna schodzi, stół dostaje figurę już nieprzezroczystą,
 * właściciel — pasek z powodem (poza własnym kliknięciem). `recheck: false`
 * tylko z wnętrza `checkSighting`, które i tak liczy dalej.
 */
export async function endSneak(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  reason: SneakEndReason,
  options: { recheck?: boolean } = {},
): Promise<void> {
  const fresh = await deps.ctx.prisma.token.findUnique({ where: { id: token.id } });
  if (!fresh || !readTokenSneak(fresh.sneak)) return;
  const updated = await deps.ctx.prisma.token.update({
    where: { id: fresh.id },
    data: { sneak: null },
  });
  await emitTokenUpsert(deps, campaignId, scene, updated);
  if (reason !== 'player' && updated.ownerId) {
    await emitToCampaignUser(deps.io, campaignId, updated.ownerId, 'sneak:ended', {
      sceneId: scene.id,
      tokenId: updated.id,
      text: sneakEndedText(reason, tokenTableName(updated, updated.name)),
    } satisfies SneakEndedBroadcast);
  }
  // Oczy figury liczą się od teraz w walce z zauważenia jak oczy każdego.
  if (options.recheck !== false) await checkSighting(deps, campaignId, scene);
}

/**
 * Atak ze skradania (decyzja MG 6): figura się skradała, więc nikt jej nie
 * zauważył — cel ataku nie dostaje Uniku. Woła się przed zapisaniem karty.
 */
export function attackFromSneak(attacker: Pick<Token, 'sneak'>): boolean {
  return readTokenSneak(attacker.sneak) !== null;
}

/** Koniec trybu wszystkich figur kampanii — zmiana sceny i koniec sesji (decyzja MG 5). */
export async function endCampaignSneaks(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const rows = await deps.ctx.prisma.token.findMany({
    where: { sneak: { not: null }, scene: { campaignId } },
    include: { scene: true },
  });
  for (const { scene, ...token } of rows) {
    await endSneak(deps, campaignId, scene, token as Token, 'scene', { recheck: false });
  }
}

/** Figury tej sceny w trybie skradania — jedno zapytanie, gdy nikt się nie skrada. */
export async function sneakersOnScene(deps: RealtimeDeps, sceneId: string): Promise<Token[]> {
  return deps.ctx.prisma.token.findMany({ where: { sceneId, sneak: { not: null } } });
}

/** Figura z pozycją klatki marszu, gdy to ona idzie — baza jej jeszcze nie zna. */
function placed(token: Token, live: LivePosition | undefined): Token {
  return live?.tokenId === token.id ? { ...token, x: live.x, y: live.y } : token;
}

/**
 * Czy własne oczy figury `observer` widzą środek figury `target` — ściany,
 * zasięg wzroku, światło na ciemnej scenie i zasłony. Mgła MG dotyczy wiedzy
 * graczy, nie oczu NPC-a, więc się tu nie liczy (jak u botów, 20b).
 */
function observes(
  scene: Scene,
  context: Awaited<ReturnType<typeof loadVisionContext>>,
  observer: Token,
  target: Token,
): boolean {
  const sight = tokenSightFor(scene, observer, context);
  const centre = tokenCentre(toTokenView(target, true), toSceneView(scene));
  return isPointObservable(
    centre,
    sight.polygons,
    sight.lighting,
    context.overrides,
    sight.figurePolygons,
  );
}

/**
 * NPC-e, które patrzą na skradających się (decyzja MG 7): figury MG bez
 * gracza, nie Przyjazne, nie pojemniki, zdolne do działania — także ukryte,
 * bo schowany strażnik też ma oczy.
 */
async function watchersOnScene(deps: RealtimeDeps, sceneId: string): Promise<Token[]> {
  const rows = await deps.ctx.prisma.token.findMany({
    where: { sceneId, ownerId: null },
    include: { character: { select: { ownerId: true } } },
  });
  const npc = rows
    .filter((row) => !row.character?.ownerId)
    .map(({ character: _character, ...token }) => token as Token)
    .filter(
      (token) =>
        tokenDisposition({
          disposition: token.disposition as 'friendly' | 'neutral' | 'hostile' | null,
          playerControlled: false,
        }) !== 'friendly' && sheetTurnForfeit(readTokenStatuses(token.statuses)) === null,
    );
  if (npc.length === 0) return npc;
  const containers = await containerTokenIds(deps.ctx.prisma, npc);
  return npc.filter((token) => !containers.has(token.id));
}

/** Konto MG kampanii — ręka, którą idą wiersze rzutów w ukryciu. */
async function gmHand(deps: RealtimeDeps, campaignId: string): Promise<SessionUser | null> {
  const gm = await campaignGmUser(deps.ctx.prisma, campaignId);
  return gm ? toSessionUser(gm) : null;
}

/** Co z rzutów Percepcji wynika dla walki z zauważenia. */
export interface SneakSpotting {
  /** Wrogi NPC → figura, którą zauważył (jej tryb już się skończył). */
  noticedBy: Map<string, string>;
}

/**
 * Rzuty Percepcji przeciw skradającym się — z wejścia `checkSighting`, zanim
 * policzy, kogo widać. Każdy NPC patrzy na figurę raz na jedno skradanie
 * (decyzja MG 3): porażka idzie na listę `tried`, sukces kończy tryb.
 */
export async function runSneakSpotting(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  live: LivePosition | undefined,
): Promise<SneakSpotting> {
  const spotting: SneakSpotting = { noticedBy: new Map() };
  const sneakers = await sneakersOnScene(deps, scene.id);
  if (sneakers.length === 0) return spotting;
  const watchers = await watchersOnScene(deps, scene.id);
  if (watchers.length === 0) return spotting;
  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const hand = await gmHand(deps, campaignId);

  for (const sneakerRow of sneakers) {
    const sneaker = placed(sneakerRow, live);
    const sneak = readTokenSneak(sneaker.sneak);
    if (!sneak) continue;
    const sneakerName = tokenTableName(sneaker, sneaker.name);
    for (const watcherRow of watchers) {
      const watcher = placed(watcherRow, live);
      if (sneakTriedBy(sneak, watcher.id)) continue;
      // NPC bez karty nie ma czym rzucić Percepcji i sam nikogo nie zauważy
      // (jak ukryta figura bez PT w 58d).
      if (!watcher.characterId) continue;
      if (!observes(scene, context, watcher, sneaker)) continue;

      sneak.tried.push(watcher.id);
      await deps.ctx.prisma.token.update({
        where: { id: sneaker.id },
        data: { sneak: writeTokenSneak(sneak) },
      });
      const roll = await rollSecretPerception(deps, watcher, sneak.dv);
      const noticed = roll !== null && cpredSneakNoticed(roll.total, sneak.dv);
      const watcherName = tokenTableName(watcher, watcher.name);
      if (hand) {
        await logGmZoneLine(
          deps,
          campaignId,
          hand,
          watcherName,
          'Percepcja — skradanie',
          `${roll ? `wynik ${roll.total}` : 'bez rzutu'} vs Skradanie ${sneak.dv} — ${
            noticed ? 'zauważa' : 'nie zauważa'
          }: ${sneakerName}`,
        );
      }
      if (!noticed) continue;

      await endSneak(deps, campaignId, scene, sneakerRow, 'noticed', { recheck: false });
      const hostile = watcher.disposition === 'hostile';
      if (hostile) {
        spotting.noticedBy.set(watcher.id, sneaker.id);
      } else {
        deps.io.to(gmRoom(campaignId)).emit('sneak:noticed', {
          sceneId: scene.id,
          observerId: watcher.id,
          sneakerId: sneaker.id,
          text: `${watcherName} zauważa skradającą się postać: ${sneakerName}.`,
        } satisfies SneakNoticedBroadcast);
      }
      break;
    }
  }
  return spotting;
}

/**
 * Czy wróg jest świadom drużyny, gdy ktoś na scenie się skrada (etap 61):
 * jego własne oczy widzą figurę drużyny, która **nie** jest w trybie. Bez
 * skradających się na scenie etap 56 liczy po staremu — z oczu drużyny.
 */
export async function foesAwareOfParty(
  deps: RealtimeDeps,
  scene: Scene,
  foes: readonly Token[],
  live: LivePosition | undefined,
): Promise<Set<string> | null> {
  const party = await deps.ctx.prisma.token.findMany({
    where: { sceneId: scene.id, ownerId: { not: null } },
  });
  if (!party.some((token) => readTokenSneak(token.sneak))) return null;
  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const open = party.filter((token) => !readTokenSneak(token.sneak)).map((t) => placed(t, live));
  const aware = new Set<string>();
  for (const foeRow of foes) {
    const foe = placed(foeRow, live);
    if (open.some((member) => observes(scene, context, foe, member))) aware.add(foe.id);
  }
  return aware;
}
