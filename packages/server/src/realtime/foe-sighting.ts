import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  CombatJoinedBroadcast,
  CombatSightingView,
  ScenePoint,
  SessionUser,
  TokenHaltBroadcast,
} from '@vtt/shared';
import {
  readTokenSightings,
  tokenHiddenFrom,
  MAX_COMBATANTS,
  ROLE_GM,
  ROLE_PLAYER,
  pointAlongRoute,
  projectOntoRoute,
  snapTokenPosition,
  type TokenSnapScene,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { sheetTurnForfeit } from '../sheets.js';
import type { RealtimeDeps } from './registry.js';
import { RealtimeError } from './registry.js';
import { containerTokenIds } from './containers.js';
import { emitToCampaignUser, gmRoom } from './state.js';
import { loadVisionContext } from './vision.js';
import {
  emitReloaded,
  foundEncounter,
  loadCombat,
  readCombatSighting,
  readTokenStatuses,
  rollJoinedInitiative,
} from './combat.js';
import {
  concealedFrom,
  concealmentFor,
  controllerIds,
  emitTokenMoveFrame,
  loadLinkedSheets,
  toSnapScene,
} from './tokens.js';
import { endWalk, walksOnScene } from './walks.js';

/**
 * Walka z zauważenia wroga (etap 56, zlecenie MG z 19.10, wzór: Disposition
 * z Foundry VTT).
 *
 * Wroga figura (`Token.disposition === 'hostile'`), którą zobaczy ktokolwiek
 * z drużyny, zakłada starcie „Przed walką” z drużyną i zauważonymi wrogami;
 * marsze drużyny stają na polu zauważenia, a gracze stoją, dopóki MG nie
 * rozpocznie walki albo nie odwoła starcia. W trwającej walce zauważony wróg
 * dołącza sam, z inicjatywą od serwera.
 *
 * „Zobaczy” to ta sama miara, którą serwer filtruje figury dla gracza
 * (`concealmentFor` + `concealedFrom`: mgła, ściany, światło, zasłony, oczy
 * drużyny), liczona dla każdego właściciela figury na scenie — także
 * niepodłączonego. Tylko w trwającej sesji i na aktywnej scenie: przygotowanie
 * MG niczego nie wyzwala.
 *
 * Pamięć „uspokojonych” wrogów żyje w procesie (jak cele i pula): wróg widziany
 * w chwili „Odwołaj”, końca walki albo usunięcia ze starcia nie wyzwala znowu,
 * dopóki nie zniknie drużynie z oczu. Restart serwera ją czyści.
 */

/** Wrogowie uspokojeni na scenie — id figur. */
const calmed = new Map<string, Set<string>>();

/**
 * Jedno sprawdzenie naraz na scenę — kolejne czekają w ogonie. Równoległa
 * klatka marszu, która nie poczekałaby, mogłaby rozesłać pozycję za polem
 * zatrzymania (wyszło na oględzinach 19.10: 804 zamiast 800).
 */
const queue = new Map<string, Promise<unknown>>();

/**
 * Scena, którą sprawdza bieżący łańcuch wywołań. Zatrzymanie samo rozsyła
 * figury, a listy graczy wołają tu znowu — takie wywołanie z wnętrza
 * sprawdzenia wraca od razu, bo czekałoby na samo siebie.
 */
const inside = new AsyncLocalStorage<string>();

/** Pozycja figury w ruchu, której baza jeszcze nie zna (klatka marszu). */
export interface LivePosition {
  tokenId: string;
  x: number;
  y: number;
}

/** Figury, których marsz serwer zatrzymał, i gdzie stoją. */
export type HaltedTokens = Map<string, ScenePoint>;

/**
 * Sprawdza, czy drużyna właśnie zobaczyła wroga, i jeśli tak — zakłada starcie
 * albo dokłada wroga do walki. Woła się po każdej zmianie tego, co mogą widzieć
 * gracze; bez wrogich figur na scenie kosztuje jedno zapytanie.
 *
 * Zwraca figury zatrzymane w marszu (pusta mapa, gdy nic się nie stało), żeby
 * `performTokenMove` oddał idącemu pole zatrzymania zamiast klatki.
 */
export async function checkSighting(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  live?: LivePosition,
): Promise<HaltedTokens> {
  if (!scene.active || inside.getStore() === scene.id) return new Map();
  const before = queue.get(scene.id) ?? Promise.resolve();
  const run = before.then(() =>
    inside.run(scene.id, () => sightOnce(deps, campaignId, scene, live)),
  );
  const settled = run.catch(() => undefined);
  queue.set(scene.id, settled);
  try {
    return await run;
  } catch (error) {
    // Wykrycie nie może zepsuć ruchu, który je wywołał.
    deps.log.warn({ err: error, sceneId: scene.id }, 'sighting: check failed');
    return new Map();
  } finally {
    if (queue.get(scene.id) === settled) queue.delete(scene.id);
  }
}

async function sightOnce(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  live: LivePosition | undefined,
): Promise<HaltedTokens> {
  const halted: HaltedTokens = new Map();
  const foes = await eligibleFoes(deps, scene.id);
  const seen = await seenFoes(deps, scene, foes, live);
  const quiet = calmed.get(scene.id);
  if (quiet) {
    // Wróg, który zniknął drużynie z oczu, znowu wyzwoli walkę (decyzja MG 7).
    for (const id of quiet) if (!seen.byFoe.has(id)) quiet.delete(id);
    if (quiet.size === 0) calmed.delete(scene.id);
  }
  if (seen.byFoe.size === 0) return halted;
  const session = await deps.ctx.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { sessionStartedAt: true },
  });
  if (!session?.sessionStartedAt) return halted;

  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  const inFight = new Set(combat?.combatants.map((row) => row.tokenId) ?? []);
  const room = MAX_COMBATANTS - inFight.size;
  const fresh = [...seen.byFoe.keys()]
    .filter((id) => !inFight.has(id) && !quiet?.has(id))
    .slice(0, Math.max(0, room));
  if (fresh.length === 0) return halted;

  const spotterIds = spottersOf(seen, fresh, live);
  const spotted = foes.filter((foe) => fresh.includes(foe.id));
  if (!combat) {
    const combatId = await foundEncounter(deps.ctx.prisma, scene.id, fresh, {
      spotterIds,
      foeIds: fresh,
    });
    await haltParty(deps, campaignId, scene, live, halted, spotted);
    await emitReloaded(deps, campaignId, scene, combatId);
    return halted;
  }

  let order = combat.combatants.length;
  for (const tokenId of fresh) {
    await deps.ctx.prisma.combatant.create({
      data: { combatId: combat.id, tokenId, order: order++ },
    });
  }
  if (combat.round === 0) {
    // Starcie jeszcze się nie zaczęło: wezwanie MG rośnie o nowych wrogów,
    // a drużyna staje także wtedy, gdy starcie założył MG ręką.
    const before = readCombatSighting(combat.sighting);
    const sighting: CombatSightingView = {
      spotterIds: [...new Set([...(before?.spotterIds ?? []), ...spotterIds])],
      foeIds: [...new Set([...(before?.foeIds ?? []), ...fresh])],
    };
    await deps.ctx.prisma.combat.update({
      where: { id: combat.id },
      data: { sighting: JSON.stringify(sighting) },
    });
    await haltParty(deps, campaignId, scene, live, halted, spotted);
  } else {
    await rollJoinedInitiative(deps, combat.id, fresh);
    deps.io.to(gmRoom(campaignId)).emit('combat:joined', {
      sceneId: scene.id,
      tokenIds: fresh,
    } satisfies CombatJoinedBroadcast);
  }
  await emitReloaded(deps, campaignId, scene, combat.id);
  return halted;
}

/**
 * Wrogowie, którzy mogą wyzwolić walkę: figury MG oznaczone jako wrogie, nie
 * ukryte (albo ukryte, ale już przez kogoś zauważone — 58d), nie pojemniki
 * i zdolne do działania — nieprzytomny albo martwy wróg walki nie zaczyna
 * (`sheetTurnForfeit`, ta sama tabela co oddawanie tury).
 */
async function eligibleFoes(deps: RealtimeDeps, sceneId: string): Promise<Token[]> {
  const rows = (
    await deps.ctx.prisma.token.findMany({
      where: { sceneId, ownerId: null, disposition: 'hostile' },
    })
  ).filter((row) => !row.hidden || readTokenSightings(row.sightings).users.length > 0);
  if (rows.length === 0) return rows;
  const containers = await containerTokenIds(deps.ctx.prisma, rows);
  return rows.filter(
    (row) => !containers.has(row.id) && sheetTurnForfeit(readTokenStatuses(row.statuses)) === null,
  );
}

interface Seen {
  /** Wróg → gracze, którzy go widzą. */
  byFoe: Map<string, Set<string>>;
  /** Gracz → jego figury na scenie. */
  figuresOf: Map<string, string[]>;
}

async function seenFoes(
  deps: RealtimeDeps,
  scene: Scene,
  foes: Token[],
  live: LivePosition | undefined,
): Promise<Seen> {
  const seen: Seen = { byFoe: new Map(), figuresOf: new Map() };
  if (foes.length === 0) return seen;
  const party = await deps.ctx.prisma.token.findMany({
    where: { sceneId: scene.id, ownerId: { not: null } },
    select: { id: true, ownerId: true },
  });
  for (const token of party) {
    const list = seen.figuresOf.get(token.ownerId!) ?? [];
    list.push(token.id);
    seen.figuresOf.set(token.ownerId!, list);
  }
  if (seen.figuresOf.size === 0) return seen;
  const sheets = await loadLinkedSheets(deps.ctx.prisma, deps.ctx.cpred, foes);
  const context = await loadVisionContext(deps.ctx.prisma, scene);
  for (const userId of seen.figuresOf.keys()) {
    // `concealmentFor` czyta z użytkownika tylko id i rolę — gracz nie musi
    // być podłączony, żeby jego figura zobaczyła wroga (decyzja MG 6).
    const viewer = { id: userId, role: ROLE_PLAYER } as SessionUser;
    // Kamera przejęta w Sieci (20.10) pokazuje wroga netrunnerowi, ale nikt
    // z drużyny go nie zauważył — walka zaczyna się od oczu figur.
    const concealment = await concealmentFor(deps.ctx.prisma, scene, viewer, context, live, {
      borrowed: false,
    });
    for (const foe of foes) {
      // Ukrytego wroga widzi tylko ten, kto go zauważył (58d).
      if (tokenHiddenFrom(foe, userId)) continue;
      const at = live?.tokenId === foe.id ? { ...foe, x: live.x, y: live.y } : foe;
      const linked = foe.characterId ? sheets.get(foe.characterId) : undefined;
      if (concealedFrom(at, scene, concealment, linked, userId)) continue;
      const users = seen.byFoe.get(foe.id) ?? new Set<string>();
      users.add(userId);
      seen.byFoe.set(foe.id, users);
    }
  }
  return seen;
}

/**
 * Kto zobaczył — do wezwania MG. Idąca figura gracza, który widzi wroga, mówi
 * najwięcej („Vex widzi wroga”); inaczej figury wszystkich, którzy widzą.
 */
function spottersOf(seen: Seen, fresh: string[], live: LivePosition | undefined): string[] {
  const users = new Set<string>();
  for (const id of fresh) for (const user of seen.byFoe.get(id) ?? []) users.add(user);
  const figures = [...users].flatMap((user) => seen.figuresOf.get(user) ?? []);
  if (live && figures.includes(live.tokenId)) return [live.tokenId];
  return figures;
}

/**
 * Zatrzymuje marsze drużyny na scenie (decyzja MG 3): idąca figura staje na
 * polu klatki, która zobaczyła wroga, pozostałe — tam, dokąd doszły ich klatki.
 * Pole zapisuje serwer, rozsyła stołowi, a prowadzący dostaje `token:halt`.
 */
async function haltParty(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  live: LivePosition | undefined,
  halted: HaltedTokens,
  spotted: Token[],
): Promise<void> {
  const marching = walksOnScene(scene.id);
  if (marching.length === 0) return;
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { id: { in: marching.map(([id]) => id) } },
  });
  const snapScene = toSnapScene(scene);
  const byUser = new Map<string, string[]>();
  for (const token of tokens) {
    const walk = marching.find(([id]) => id === token.id)?.[1];
    if (!walk) continue;
    endWalk(token.id);
    const at =
      live?.tokenId === token.id
        ? await sightedStand(deps, scene, token, walk.route, live, spotted)
        : snapPoint(pointAlongRoute(walk.route, walk.reached), token, snapScene);
    await deps.ctx.prisma.token.update({ where: { id: token.id }, data: { x: at.x, y: at.y } });
    halted.set(token.id, at);
    // Pole zatrzymania idzie do stołu jako lądowanie: lista figur nie przesuwa
    // figury, która przed chwilą szła (#47), a lądowanie przesuwa zawsze.
    await emitTokenMoveFrame(deps, campaignId, scene, token, {
      sceneId: scene.id,
      tokenId: token.id,
      x: at.x,
      y: at.y,
      final: true,
      byUserId: walk.userId,
    });
    for (const userId of controllerIds(token, null)) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), token.id]);
    }
  }
  // Na końcu zatrzymanie — klient, który kończy marsz, ma już w magazynie
  // pole, na którym figura stanęła.
  for (const [userId, tokenIds] of byUser) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'token:halt', {
      sceneId: scene.id,
      tokenIds,
    } satisfies TokenHaltBroadcast);
  }
}

function snapPoint(point: ScenePoint, token: Token, snapScene: TokenSnapScene): ScenePoint {
  return snapTokenPosition(point.x, point.y, token.size, snapScene);
}

/**
 * Pole, na którym staje figura, która zobaczyła wroga: przyciągnięte pole klatki
 * albo — gdy z niego wróg chowa się z powrotem za róg — następne pole trasy.
 * Inaczej „Odwołaj” nie uspokoiłby wroga (nie widać go z pola zatrzymania),
 * a pierwszy krok po odwołaniu znów założyłby starcie (oględziny 19.10).
 */
async function sightedStand(
  deps: RealtimeDeps,
  scene: Scene,
  token: Token,
  route: ScenePoint[],
  live: LivePosition,
  spotted: Token[],
): Promise<ScenePoint> {
  const snapScene = toSnapScene(scene);
  const here = snapPoint(live, token, snapScene);
  const along = projectOntoRoute(route, live).distance + scene.gridSizePx;
  const ahead = snapPoint(pointAlongRoute(route, along), token, snapScene);
  for (const at of [here, ahead]) {
    const seen = await seenFoes(deps, scene, spotted, { tokenId: token.id, ...at });
    if (seen.byFoe.size > 0) return at;
  }
  return here;
}

/**
 * „Odwołaj”, koniec walki (decyzja MG 7): wrogowie, których drużyna teraz
 * widzi, nie wyzwolą walki znowu, dopóki nie znikną jej z oczu.
 */
export async function calmVisibleFoes(deps: RealtimeDeps, scene: Scene): Promise<void> {
  const seen = await seenFoes(deps, scene, await eligibleFoes(deps, scene.id), undefined);
  if (seen.byFoe.size === 0) return;
  const quiet = calmed.get(scene.id) ?? new Set<string>();
  for (const id of seen.byFoe.keys()) quiet.add(id);
  calmed.set(scene.id, quiet);
}

/** MG zdjął wroga ze starcia — ten sam spokój, inaczej wróciłby przy następnym kroku. */
export function calmFoe(sceneId: string, tokenId: string): void {
  const quiet = calmed.get(sceneId) ?? new Set<string>();
  quiet.add(tokenId);
  calmed.set(sceneId, quiet);
}

/**
 * Czy gracze stoją (etap 56): runda 0 starcia z zauważenia. Ruch wraca w turach
 * (runda 1) albo po „Odwołaj”.
 */
export async function sightedFightPending(deps: RealtimeDeps, sceneId: string): Promise<boolean> {
  const combat = await deps.ctx.prisma.combat.findUnique({
    where: { sceneId },
    select: { round: true, sighting: true },
  });
  return combat !== null && combat.round === 0 && combat.sighting !== null;
}

/** Odmowa ruchu gracza przed walką z zauważenia — MG nie stoi nigdy. */
export async function refuseMoveBeforeSightedFight(
  deps: RealtimeDeps,
  sceneId: string,
  user: SessionUser,
): Promise<void> {
  if (user.role === ROLE_GM) return;
  if (await sightedFightPending(deps, sceneId)) throw new RealtimeError(COMBAT_PENDING);
}

export const COMBAT_PENDING = 'COMBAT_PENDING';

/** Tylko dla testów: czyści pamięć uspokojonych wrogów. */
export function resetSightingMemory(): void {
  calmed.clear();
}
