import type {
  BotActionProposal,
  BotActionTraceBroadcast,
  BotCombatDecision,
  BotCombatFigure,
  BotCombatProposal,
  BotCombatState,
  BotCombatWeapon,
  BotPlayTurnPayload,
  BotPlayTurnResult,
  CpredAmmoProfile,
  CpredAttackMode,
  CpredCharacterData,
  ResolvedWeapon,
  ScenePoint,
  SessionUser,
} from '@vtt/shared';
import {
  BOT_COMBAT_ERROR_LABELS,
  BOT_COMBAT_MAX_TOKENS,
  BOT_COMBAT_STEPS_MAX,
  BOT_COMBAT_TEMPERATURE,
  CPRED_WOUND_LABELS,
  ROLE_GM,
  TOKEN_PATH_MAX_POINTS,
  buildBotCombatPrompt,
  buildBotCombatSchema,
  clipWalkToBudget,
  describeBotCombatDecision,
  hotbarSlotsFor,
  cpredSheetHpMax,
  isAmmoEntry,
  isSegmentClear,
  isWeaponEntry,
  metresBetweenTokens,
  metresForRules,
  metresPerPixel,
  movementSegments,
  parseBotCombatAction,
  parseBotData,
  parseCharacterData,
  planWalk,
  resolveWeapon,
  thinWalk,
  toAmmoProfile,
  tokenCentre,
  walkGridForScene,
  woundStateFromHp,
  type BotCombatParseError,
  type BotProfileData,
} from '@vtt/shared';
import type { AiChatRequest } from '../ai/gateway.js';
import type { BotProfile, Character, Scene, Token } from '../generated/prisma/client.js';
import { statusName } from '../statuses.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { performAttackRoll, performWeaponReload } from './attacks.js';
import { botActorUser, logBotDecision } from './bot-runtime.js';
import { deliverChatMessageTo, insertChatMessage } from './chat-io.js';
import { buildCompendiumSync } from './compendium.js';
import {
  loadCombat,
  moveBudgetForCombatant,
  toCombatantView,
  type CombatRow,
  type CombatantRow,
} from './combat.js';
import { toSceneView } from './scenes.js';
import { gmRoom } from './state.js';
import { performTokenMove, requireCampaignToken, toTokenView } from './tokens.js';
import {
  coverBetween,
  hasLineOfFire,
  isPointObservable,
  loadVisionContext,
  tokenSightFor,
  type SceneVisionContext,
} from './vision.js';

/**
 * Tura bota w walce (etap 20b).
 *
 * Bot dostał w 20a prawo do rzucania kośćmi; tu dostaje pole bitwy. Pięć rzeczy
 * niesie ten plik.
 *
 * 1. **Bot jest graczem, nie drugą mechaniką.** Atak jedzie przez
 *    `performAttackRoll` (16b), ruch przez `performTokenMove` (14c),
 *    przeładowanie przez `performWeaponReload` (16) — te same funkcje, które
 *    obsługują klik człowieka, wydzielone z handlerów w tym etapie. Nie ma tu
 *    ani jednej gałęzi reguł, której nie przechodzi gracz.
 * 2. **Bezpieczniki stoją PRZED wywołaniem.** Bot działa z uprawnieniami konta
 *    MG (jak jego wypowiedzi od etapu 11), a MG jest zwolniony z blokad
 *    (`realtime/movement.ts`) — więc „cel jest widoczny" i „trasa mieści się
 *    w budżecie" muszą być rozstrzygnięte tutaj. Ścieżka wykonawcza tego już
 *    nie sprawdzi, bo dla MG nie sprawdza.
 * 3. **Widoczność jest własnością figury, nie konta.** `tokenSightFor` liczy,
 *    co widzi token bota — ze ścianami, ciemnością i pędzlem MG. To jedyny
 *    sposób, żeby NPC prowadzony przez konto MG nie strzelał przez mur po ciemku
 *    (dziura odnotowana w POMYSLY 31.07, domykana tym etapem).
 * 4. **Tura to dwa pytania, nie jedno.** Akcja Ruchu plus Akcja: po pierwszym
 *    kroku bot dostaje odświeżony stan (nowe dystanse, wydany budżet) i decyduje
 *    drugi raz. Dzięki temu „podejdź i strzel" jest jedną turą, nie dwiema.
 * 5. **Odmowa jest informacją zwrotną, nie końcem.** Nieudana walidacja albo
 *    odmowa serwera wraca do modelu jako zdanie po polsku i daje mu JEDNĄ szansę
 *    poprawki; druga odmowa kończy turę. Wszystko widać w śladzie MG.
 */

/** Slot paska akcji z 16f rozłożony na to, czego potrzebuje `attack:roll`. */
interface WeaponSlotRef {
  rowId: string;
  mode: CpredAttackMode;
}

/** `weapon:<rowId>:<mode>` — jedyne miejsce po stronie bota, które zna ten format. */
function parseWeaponSlotId(slotId: string): WeaponSlotRef | null {
  const parts = slotId.split(':');
  if (parts.length !== 3 || parts[0] !== 'weapon') return null;
  const rowId = parts[1];
  const mode = parts[2];
  if (!rowId) return null;
  if (mode !== 'single' && mode !== 'autofire' && mode !== 'suppressive') return null;
  return { rowId, mode };
}

/** Wszystko, co jedna tura czyta raz i przekazuje krokom. */
interface TurnContext {
  campaignId: string;
  /** Konto, którym bot wykonuje mechanikę (MG — patrz `botActorUser`). */
  user: SessionUser;
  bot: { id: string; name: string; data: BotProfileData };
  character: Character;
  sheet: CpredCharacterData;
  scene: Scene;
  vision: SceneVisionContext;
  /** Katalog kampanii — bronie i naboje rozwiązywane dokładnie jak u klienta. */
  resolveWeaponEntry: (compendiumId: string | null | undefined) => ResolvedWeapon | null;
  resolveAmmoEntry: (ammoId: string) => CpredAmmoProfile | null;
  signal?: AbortSignal;
}

/**
 * Bot prowadzący tę figurę, albo null.
 *
 * Wiązanie idzie przez **kartę postaci** (decyzja MG przed kodem): bot ma
 * w profilu `characterId`, token ma ten sam `characterId`. Statysta — token
 * z profilem bojowym, bez karty — nie ma jak zostać przypisany, więc nie jest
 * prowadzony przez bota; prowadzenie statystów czeka w POMYSLY.
 */
export async function botForToken(
  deps: RealtimeDeps,
  campaignId: string,
  token: Pick<Token, 'characterId'>,
): Promise<BotProfile | null> {
  if (!token.characterId) return null;
  return deps.ctx.prisma.botProfile.findFirst({
    where: { campaignId, archived: false, characterId: token.characterId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Katalog kampanii jako dwie funkcje — dokładnie te, które bierze `hotbarSlotsFor`. */
async function catalogueOf(
  deps: RealtimeDeps,
  campaignId: string,
): Promise<Pick<TurnContext, 'resolveWeaponEntry' | 'resolveAmmoEntry'>> {
  const compendium = await buildCompendiumSync(deps, campaignId);
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  const byId = new Map(compendium.entries.map((entry) => [entry.id, entry]));
  return {
    resolveWeaponEntry: (compendiumId) => {
      const entry = compendiumId ? byId.get(compendiumId) : undefined;
      return entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById }) : null;
    },
    resolveAmmoEntry: (ammoId) => {
      const entry = byId.get(ammoId);
      return entry && isAmmoEntry(entry) ? toAmmoProfile(entry) : null;
    },
  };
}

/** Statusy tokenu jako lista id — kolumna jest JSON-em (SQLite nie ma tablic). */
function tokenStatuses(token: Pick<Token, 'statuses'>): string[] {
  try {
    const parsed: unknown = JSON.parse(token.statuses);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Ludzkie nazwy statusów — model czyta „Powalony", nie „prone". */
function statusLabels(deps: RealtimeDeps, ids: readonly string[]): string[] {
  return ids.map((id) => statusName(deps.ctx.statuses, id));
}

/**
 * Po której stronie stoi ta figura.
 *
 * Bez modelu stron w VTT zostaje jedna uczciwa przesłanka: **typ bota**.
 * Towarzysz drużyny (`companion`) walczy po stronie graczy, więc figury graczy
 * są jego sojusznikami; NPC MG ma dokładnie odwrotnie. Figura bez właściciela
 * i bez karty gracza jest figurą MG.
 */
function sideOf(
  botType: BotProfileData['type'],
  token: Pick<Token, 'ownerId' | 'characterId'>,
  playerCharacterIds: ReadonlySet<string>,
): BotCombatFigure['side'] {
  const playerSide =
    token.ownerId !== null ||
    (token.characterId !== null && playerCharacterIds.has(token.characterId));
  const botOnPlayerSide = botType === 'companion';
  return playerSide === botOnPlayerSide ? 'ally' : 'enemy';
}

interface TurnBudgetNumbers {
  actionSpent: boolean;
  moveSpent: boolean;
  /** Metry zostałe w turze; null = system nie mierzy ruchu w metrach. */
  metresLeft: number | null;
  costFactor: number;
}

/** Budżet tury w liczbach, wyjęty z widoku trackera (14b/14c). */
function budgetOf(combatant: CombatantRow, combat: CombatRow): TurnBudgetNumbers {
  const turn = toCombatantView(combatant, combat).turn;
  if (!turn) return { actionSpent: false, moveSpent: false, metresLeft: null, costFactor: 1 };
  const action = turn.resources.find((row) => row.id === 'action');
  const move = turn.resources.find((row) => row.id === 'move');
  const distance = turn.distance;
  return {
    actionSpent: action?.used === 1,
    moveSpent: (move?.used ?? 0) > 0,
    metresLeft: distance ? Math.max(0, distance.max - distance.used) : null,
    costFactor: distance?.hard === true ? 2 : 1,
  };
}

/** Stan taktyczny plus to, czego wykonanie potrzebuje, a model nie widzi. */
interface TacticalStep {
  state: BotCombatState;
  /** Id figury z menu → token na scenie. */
  targets: Map<string, Token>;
  combatant: CombatantRow;
  budget: TurnBudgetNumbers;
}

/**
 * Stan taktyczny jednego kroku.
 *
 * Wszystko, co da się policzyć przed pytaniem, jest tu policzone: dystanse
 * w metrach, to czy da się strzelić (ściana albo osłona), naboje w magazynku
 * i ile metrów zostało w turze. 9B wybiera z takiej listy nieporównanie lepiej,
 * niż liczy sam — i to jest cała wskazówka techniczna tego etapu.
 *
 * Czego tu nie ma: **cudzych PW**. Bot nie czyta kart przeciwników, a NPC, który
 * wie, że komuś zostały trzy punkty, jest wyciekiem przez usta postaci.
 */
async function buildTacticalStep(
  deps: RealtimeDeps,
  ctx: TurnContext,
  actor: Token,
  step: number,
): Promise<TacticalStep> {
  const combat = await loadCombat(deps.ctx.prisma, ctx.scene.id);
  const combatant = combat?.combatants.find((row) => row.tokenId === actor.id) ?? null;
  if (!combat || !combatant) throw new RealtimeError('BOT_NOT_IN_COMBAT');

  const sceneView = toSceneView(ctx.scene);
  const sight = tokenSightFor(ctx.scene, actor, ctx.vision);
  const actorView = toTokenView(actor, true);
  const origin = tokenCentre(actorView, sceneView);

  const [others, playerCharacters] = await Promise.all([
    deps.ctx.prisma.token.findMany({ where: { sceneId: ctx.scene.id } }),
    deps.ctx.prisma.character.findMany({
      where: { campaignId: ctx.campaignId, ownerId: { not: null } },
      select: { id: true },
    }),
  ]);
  const playerCharacterIds = new Set(playerCharacters.map((row) => row.id));

  const figures: BotCombatFigure[] = [];
  const targets = new Map<string, Token>();
  const usedLabels = new Set<string>();
  for (const other of others) {
    if (other.id === actor.id) continue;
    const centre = tokenCentre(toTokenView(other, true), sceneView);
    // Widoczność figury bota, nie konta MG. Bez tego NPC strzelałby przez mur.
    if (
      !isPointObservable(
        centre,
        sight.polygons,
        sight.lighting,
        ctx.vision.overrides,
        sight.figurePolygons,
      )
    )
      continue;

    // Etykieta wchodzi do enuma, więc musi być jednoznaczna: dwa „Zbir" na
    // jednej scenie dostają numer, bo inaczej model nie miałby ich jak
    // rozróżnić, a parser wybrałby pierwszego z brzegu.
    let label = other.name;
    for (let n = 2; usedLabels.has(label); n += 1) label = `${other.name} (${n})`;
    usedLabels.add(label);
    targets.set(other.id, other);

    const cover = coverBetween(ctx.vision, origin, centre);
    const noShot = !hasLineOfFire(ctx.vision, origin, centre)
      ? 'ściana albo zamknięte drzwi na linii strzału'
      : cover
        ? `osłona: ${cover.name}`
        : undefined;
    figures.push({
      id: other.id,
      label,
      side: sideOf(ctx.bot.data.type, other, playerCharacterIds),
      metres: metresForRules(metresBetweenTokens(actorView, toTokenView(other, true), sceneView)),
      statuses: statusLabels(deps, tokenStatuses(other)),
      ...(noShot ? { noShot } : {}),
    });
  }
  figures.sort((a, b) => a.metres - b.metres);

  const budget = budgetOf(combatant, combat);
  // Pasek akcji budowany tak, jak widzi go GRACZ (`isGm: false`) — celowo: slot
  // wyszarzony brakiem Akcji ma być wyszarzony także dla bota, mimo że konto,
  // którym bot działa, jest z tej blokady zwolnione.
  const slots = hotbarSlotsFor({
    sheet: ctx.sheet,
    resolve: ctx.resolveWeaponEntry,
    resolveAmmo: ctx.resolveAmmoEntry,
    statuses: tokenStatuses(actor),
    turn: { actionSpent: budget.actionSpent, moveSpent: budget.moveSpent },
    isGm: false,
    grapple: toCombatantView(combatant, combat).grapple?.role ?? null,
  });

  const weapons: BotCombatWeapon[] = [];
  for (const slot of slots) {
    if (slot.kind !== 'weapon') continue;
    // Broń celowana w POLE (granat) nie ma miejsca w tym menu: cel jest tam
    // kwadratem, nie figurą, a cała geometria z 16d to osobne pytanie. Bot
    // rzucający granatami to dopracowanie taktyki, czyli POMYSLY.
    if (slot.pointTarget) continue;
    const label = slot.modeLabel ? `${slot.label} · ${slot.modeLabel}` : slot.label;
    if (weapons.some((weapon) => weapon.label === label)) continue;
    weapons.push({
      id: slot.id,
      label,
      ...(slot.ammoLabel ? { detail: `nabój: ${slot.ammoLabel}` } : {}),
      ...(slot.melee ? { melee: true } : {}),
      ...(slot.ammo ? { ammo: slot.ammo } : {}),
      ...(slot.disabled ? { disabled: slot.disabled } : {}),
    });
  }

  const maxHp = cpredSheetHpMax(ctx.sheet);
  const wound = CPRED_WOUND_LABELS[woundStateFromHp(ctx.sheet.hpCurrent, maxHp)];
  return {
    combatant,
    budget,
    targets,
    state: {
      self: {
        name: ctx.character.name,
        hp: { current: ctx.sheet.hpCurrent, max: maxHp },
        ...(wound ? { wound } : {}),
        statuses: statusLabels(deps, tokenStatuses(actor)),
        metresLeft: budget.metresLeft,
        actionSpent: budget.actionSpent,
        moveSpent: budget.moveSpent,
      },
      figures,
      weapons,
      round: combat.round,
      step,
    },
  };
}

interface DecisionRun {
  decision: BotCombatDecision | null;
  error: BotCombatParseError | null;
  /** Kod błędu gatewaya (AI_UNAVAILABLE, AI_UNREACHABLE…). */
  failure: string | null;
  raw: string;
  retried: boolean;
  tookMs: number;
}

/**
 * Jedno pytanie do modelu, z jedną szansą poprawki formatu.
 *
 * Poprawka dopisuje wyłącznie powód odrzucenia — model ma dostać dokładnie tę
 * informację, której mu zabrakło, a nie inny problem. Ta sama zasada co
 * w `runDecision` z 20a i z tego samego powodu: prompt przepisany przy poprawce
 * zmienia dwa warunki naraz i przestaje być diagnozowalny.
 */
async function runCombatDecision(
  deps: RealtimeDeps,
  ctx: TurnContext,
  state: BotCombatState,
  correction?: string,
): Promise<DecisionRun> {
  const started = Date.now();
  const prompt = buildBotCombatPrompt(state, { botName: ctx.bot.name });
  const schema = buildBotCombatSchema(state);
  const opening = correction
    ? `Poprzednia próba nie powiodła się: ${correction} Wybierz coś innego.\n\n`
    : '';

  const ask = async (extra: string): Promise<{ raw: string; failure: string | null }> => {
    const request: AiChatRequest = {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: `${opening}${prompt.user}${extra ? `\n\n${extra}` : ''}` },
      ],
      purpose: 'npc',
      botId: ctx.bot.id,
      // Gramatyka plus rozumowanie to ryzyko pustej odpowiedzi (patrz
      // `reasoning_budget` w „Pułapkach dev") — mówimy wprost, że tu go nie ma.
      reasoning: false,
      maxTokens: BOT_COMBAT_MAX_TOKENS,
      temperature: BOT_COMBAT_TEMPERATURE,
      jsonSchema: schema,
    };
    let raw = '';
    for await (const event of deps.ctx.ai.streamChat(request, ctx.signal)) {
      if (event.type === 'delta') raw += event.text;
      if (event.type === 'error') return { raw, failure: event.code };
    }
    return { raw, failure: null };
  };

  const first = await ask('');
  if (first.failure) {
    return {
      decision: null,
      error: null,
      failure: first.failure,
      raw: first.raw,
      retried: false,
      tookMs: Date.now() - started,
    };
  }
  const parsedFirst = parseBotCombatAction(first.raw, state);
  if (parsedFirst.ok) {
    return {
      decision: parsedFirst.decision,
      error: null,
      failure: null,
      raw: first.raw,
      retried: false,
      tookMs: Date.now() - started,
    };
  }

  const second = await ask(
    `Poprzednia odpowiedź została odrzucona: ${BOT_COMBAT_ERROR_LABELS[parsedFirst.error]}` +
      ' Odpowiedz jeszcze raz, wyłącznie obiektem JSON zgodnym ze schematem.',
  );
  if (second.failure) {
    return {
      decision: null,
      error: parsedFirst.error,
      failure: second.failure,
      raw: `${first.raw}\n---\n${second.raw}`,
      retried: true,
      tookMs: Date.now() - started,
    };
  }
  const parsedSecond = parseBotCombatAction(second.raw, state);
  return {
    decision: parsedSecond.ok ? parsedSecond.decision : null,
    error: parsedSecond.ok ? null : parsedSecond.error,
    failure: null,
    raw: `${first.raw}\n---\n${second.raw}`,
    retried: true,
    tookMs: Date.now() - started,
  };
}

/**
 * Odmowa serwera przetłumaczona na zdanie, które model może wykorzystać.
 *
 * Kod błędu nic 9B nie mówi, a „nie masz już Akcji" mówi wszystko — i to jest
 * cała treść tej mapy. Nieznany kod dostaje zdanie ogólne, bo pusta poprawka
 * byłaby gorsza niż nieprecyzyjna.
 */
const REFUSAL_TEXTS: Record<string, string> = {
  MOVE_REFUSED: 'Ten ruch został odrzucony przez zasady.',
  NO_MOVE_LEFT: 'Nie masz już metrów ruchu w tej turze.',
  NO_ACTION_LEFT: 'Nie masz już Akcji w tej turze.',
  // Trzy różne powody, dla których podejście się nie odbyło. Do 22.08 wszystkie
  // trzy jechały jako NO_ROUTE, więc MG czytał „droga jest zablokowana" i szedł
  // szukać ściany, której nie ma — a najczęstszy przypadek jest odwrotny: bot
  // stoi już przy celu. Zdanie idzie do modelu jako powód do poprawki, więc
  // każde musi podpowiadać INNY następny ruch.
  NO_ROUTE: 'Nie da się tam dojść — droga jest zablokowana.',
  NO_ROUTE_BUDGET: 'Za mało metrów ruchu w tej turze, żeby przejść w tamtą stronę.',
  ALREADY_IN_PLACE: 'Już tam stoisz — podejście niczego nie zmieni.',
  NOT_YOUR_TURN: 'To nie jest tura tej figury.',
  STATUS_BLOCKED: 'Twój stan (np. Powalony) nie pozwala na tę akcję.',
  OUT_OF_RANGE: 'Cel jest poza zasięgiem tej broni.',
  MELEE_OUT_OF_REACH: 'Bronią białą trzeba stać tuż obok celu.',
  MELEE_BLOCKED: 'Między tobą a celem stoi przeszkoda — wręcz nie sięgniesz, obejdź ją.',
  RANGED_WEAPON_IN_MELEE: 'Tą bronią nie da się strzelać z tak bliska.',
  NOT_ENOUGH_AMMO: 'Za mało amunicji na ten strzał.',
  NO_LINE_OF_FIRE: 'Coś stoi na linii strzału.',
  TARGET_BEHIND_COVER: 'Cel jest za osłoną — trzeba zmienić pozycję albo cel.',
  TARGET_BEHIND_SHIELD: 'Cel zasłania się kimś — nie strzelasz.',
  TARGET_NOT_FOUND: 'Tej figury już tam nie ma.',
  UNKNOWN_WEAPON: 'Nie masz przy sobie tej broni.',
  WEAPON_HAS_NO_MAGAZINE: 'Ta broń nie ma magazynka do przeładowania.',
  GRAPPLE_TWO_HANDED: 'W zwarciu nie użyjesz broni oburęcznej.',
  SCENE_HAS_NO_SCALE: 'Na tej scenie nie da się zmierzyć odległości.',
};

function refusalText(code: string): string {
  return REFUSAL_TEXTS[code] ?? 'Serwer odrzucił tę akcję.';
}

/** Co wyszło z jednego kroku tury. */
type StepOutcome =
  | { kind: 'executed'; summary: string }
  | { kind: 'proposed'; summary: string }
  | { kind: 'pass'; summary: string }
  | { kind: 'refused'; refusal: string };

function trace(deps: RealtimeDeps, campaignId: string, payload: BotActionTraceBroadcast): void {
  deps.io.to(gmRoom(campaignId)).emit('bot:action-trace', payload);
}

/**
 * Wykonuje decyzję istniejącymi ścieżkami serwera.
 *
 * Rzuca `RealtimeError`, gdy ścieżka odmówi — wołający zamienia to na zdanie dla
 * modelu i daje mu jedną szansę poprawki.
 */
async function executeDecision(
  deps: RealtimeDeps,
  ctx: TurnContext,
  actor: Token,
  step: TacticalStep,
  decision: Exclude<BotCombatDecision, { kind: 'pass' }>,
): Promise<void> {
  if (decision.kind === 'reload') {
    const slot = parseWeaponSlotId(decision.weaponId);
    if (!slot) throw new RealtimeError('UNKNOWN_WEAPON');
    await performWeaponReload(deps, {
      campaignId: ctx.campaignId,
      user: ctx.user,
      sceneId: ctx.scene.id,
      payload: { characterId: ctx.character.id, weaponRowId: slot.rowId },
    });
    return;
  }

  const target = step.targets.get(decision.targetId);
  // Bezpiecznik, który nie jest gramatyką. Menu zbudowaliśmy z widoczności
  // tokenu bota, ale między decyzją a wykonaniem mógł minąć klik MG na karcie
  // propozycji — a wtedy „cel istnieje, jest widoczny i nie jest mną" trzeba
  // zadać jeszcze raz.
  if (!target) throw new RealtimeError('TARGET_NOT_FOUND');
  if (target.id === actor.id) throw new RealtimeError('BAD_REQUEST');

  if (decision.kind === 'attack') {
    const slot = parseWeaponSlotId(decision.weaponId);
    if (!slot) throw new RealtimeError('UNKNOWN_WEAPON');
    const result = await performAttackRoll(deps, {
      campaignId: ctx.campaignId,
      user: ctx.user,
      payload: {
        characterId: ctx.character.id,
        attackerTokenId: actor.id,
        targetTokenId: target.id,
        request: { weaponRowId: slot.rowId, mode: slot.mode },
      },
    });
    // Osłona na linii strzału wraca jako **wynik**, nie wyjątek (16c): nic nie
    // zostało wydane, a decyzja „ostrzelaj samochód / strzelaj mimo osłony"
    // należy do stołu. Bot jej nie podejmuje — zgłasza odmowę i próbuje czegoś
    // innego, bo „strzelaj mimo osłony" jest ruling­iem, nie taktyką.
    if ('blocked' in result && result.blocked) {
      throw new RealtimeError(
        result.blocked.kind === 'cover' ? 'TARGET_BEHIND_COVER' : 'TARGET_BEHIND_SHIELD',
      );
    }
    return;
  }

  await walkTowards(deps, ctx, actor, step, target, decision.kind === 'retreat');
}

/**
 * Ruch: trasa liczona na serwerze, przycięta do budżetu, wysłana `token:move`.
 *
 * Cel jest **figurą, nie punktem** (decyzja MG przed kodem): model wskazuje, do
 * kogo podejść albo od kogo się odsunąć, a geometrię robi serwer A-gwiazdką
 * z 16e. To bezpiecznik, którego nie da się obejść promptem — bot, który nie
 * potrafi podać współrzędnych, nie potrafi też przejść przez ścianę ani wyjść
 * poza RUCH.
 */
async function walkTowards(
  deps: RealtimeDeps,
  ctx: TurnContext,
  actor: Token,
  step: TacticalStep,
  target: Token,
  away: boolean,
): Promise<void> {
  const sceneView = toSceneView(ctx.scene);
  const cell = ctx.scene.gridSizePx;
  const perPixel = metresPerPixel(sceneView);
  if (cell <= 0 || perPixel <= 0) throw new RealtimeError('SCENE_HAS_NO_SCALE');

  const allowance = await moveBudgetForCombatant(deps, step.combatant);
  // Poza mierzonym budżetem (statysta bez karty) zostaje jedna Akcja Ruchu —
  // dokładnie to, co tracker liczył w 14b, zanim metry w ogóle powstały.
  const metresLeft =
    step.budget.metresLeft ?? (step.budget.moveSpent ? 0 : (allowance?.metresPerMove ?? 0));
  if (metresLeft <= 0) throw new RealtimeError('NO_MOVE_LEFT');

  const extent = actor.size * cell;
  const here = tokenCentre(toTokenView(actor, true), sceneView);
  const there = tokenCentre(toTokenView(target, true), sceneView);
  const dx = here.x - there.x;
  const dy = here.y - there.y;
  const length = Math.hypot(dx, dy) || 1;
  const reachPx = metresLeft / perPixel;
  // Dokąd. Podejście celuje **obok** figury, nie w nią — dwie figury nie stoją
  // na jednym polu, a A* i tak kończy trasę na polu, na którym da się stanąć.
  // Odwrót celuje w punkt na przedłużeniu linii „cel → ja", tak daleko, jak
  // wystarczy metrów.
  const aim: ScenePoint = away
    ? { x: here.x + (dx / length) * reachPx, y: here.y + (dy / length) * reachPx }
    : {
        x: there.x + (dx / length) * (extent / 2 + (target.size * cell) / 2),
        y: there.y + (dy / length) * (extent / 2 + (target.size * cell) / 2),
      };

  const grid = walkGridForScene(
    sceneView,
    normalizeOffset(ctx.scene.gridOffsetX, cell),
    normalizeOffset(ctx.scene.gridOffsetY, cell),
  );
  const blockers = movementSegments(ctx.vision.walls);
  const half = extent / 2;
  const plan = planWalk(
    { x: actor.x, y: actor.y },
    { x: aim.x - half, y: aim.y - half },
    {
      grid,
      // Podłoga jest wszędzie tam, gdzie nie ma ściany: bot nie ma maski
      // eksploracji (ta jest własnością drużyny), a ściany są testem krawędzi.
      isPassable: () => true,
      canStep: (from, to) =>
        isSegmentClear(
          { x: from.x + half, y: from.y + half },
          { x: to.x + half, y: to.y + half },
          blockers,
        ),
      size: actor.size,
      radiusCells: Math.max(1, Math.ceil(metresLeft / (cell * perPixel)) + 1),
      // Bez wygładzania — i to nie jest kosmetyka. `clipWalkToBudget` tnie na
      // WAŻNYM PUNKCIE, nigdy w połowie odcinka, a wygładzona trasa przez otwarty
      // teren ma dokładnie dwa punkty: start i koniec. Cel dalszy niż budżet
      // zwijałby się wtedy do samego startu, czyli do „nie da się tam dojść".
      // Trasa po kratkach daje cięciu miejsca, w których może wylądować.
      smooth: false,
    },
  );
  // `planWalk` NIE odmawia celu nie do osiągnięcia — oddaje trasę do najbliższego
  // pola, jakie znalazła, z `truncated`. Trasa jednopunktowa znaczy więc dokładnie
  // jedno: najlepszym polem jest to, na którym figura stoi. Dwa powody, dwa różne
  // następne ruchy dla modelu — albo bot już jest u celu, albo jest zamurowany.
  if (!plan) throw new RealtimeError('SCENE_HAS_NO_SCALE');
  if (plan.points.length < 2) {
    const start = walkCellOf(grid, { x: actor.x, y: actor.y });
    const goal = walkCellOf(grid, { x: aim.x - half, y: aim.y - half }, actor.size);
    const sameCell = start.col === goal.col && start.row === goal.row;
    throw new RealtimeError(sameCell ? 'ALREADY_IN_PLACE' : 'NO_ROUTE');
  }

  const clipped = clipWalkToBudget(plan.points, sceneView, {
    metresLeft,
    costFactor: step.budget.costFactor,
  });
  const points = thinWalk(clipped.points, TOKEN_PATH_MAX_POINTS);
  const last = points[points.length - 1];
  // Trasa, która donikąd nie prowadzi, nie jest ruchem: bez tego bot stojący
  // przy ścianie spalałby Akcję Ruchu na przesunięcie o pół piksela. Trasa
  // ISTNIEJE (A* ją znalazł linijkę wyżej) — zabrakło budżetu na jej początek.
  if (!last || points.length < 2) throw new RealtimeError('NO_ROUTE_BUDGET');
  if (Math.abs(last.x - actor.x) < 1 && Math.abs(last.y - actor.y) < 1) {
    throw new RealtimeError('ALREADY_IN_PLACE');
  }

  await performTokenMove(deps, {
    campaignId: ctx.campaignId,
    user: ctx.user,
    payload: { tokenId: actor.id, x: last.x, y: last.y, final: true, path: points },
  });
}

/**
 * Pole, na które snapuje się pozycja — kopia `cellOfPosition` z `shared`, która
 * jest tam prywatna. Trzymana tu, bo służy WYŁĄCZNIE do rozpoznania, czy trasa
 * jednopunktowa znaczy „już tam stoję", czy „jestem zamurowany"; poszerzanie
 * publicznego API `pathfinding` dla jednego `if`-a byłoby gorszym wyborem.
 *
 * `clampSpan` odwzorowuje przycięcie **celu** w `planWalk` (start nie jest tam
 * przycinany, więc bez tego parametru nie przycina go i ta funkcja).
 */
function walkCellOf(
  grid: { cell: number; originX: number; originY: number; cols: number; rows: number },
  position: ScenePoint,
  clampSpan?: number,
): { col: number; row: number } {
  const col = Math.round((position.x - grid.originX) / grid.cell);
  const row = Math.round((position.y - grid.originY) / grid.cell);
  if (clampSpan === undefined) return { col, row };
  const span = Math.max(1, Math.round(clampSpan));
  return {
    col: Math.min(Math.max(col, 0), Math.max(0, grid.cols - span)),
    row: Math.min(Math.max(row, 0), Math.max(0, grid.rows - span)),
  };
}

/** Przesunięcie siatki sprowadzone do jednej komórki, jak u klienta. */
function normalizeOffset(offset: number, cell: number): number {
  if (!Number.isFinite(cell) || cell <= 0) return 0;
  const value = offset % cell;
  return value < 0 ? value + cell : value;
}

/** Karta propozycji akcji bojowej — ta sama karta co w 20a, inna treść. */
async function postCombatProposal(
  deps: RealtimeDeps,
  ctx: TurnContext,
  actor: Token,
  step: TacticalStep,
  decision: BotCombatDecision,
): Promise<void> {
  const summary = describeBotCombatDecision(decision);
  const targeted = decision.kind === 'reload' || decision.kind === 'pass' ? null : decision;
  const weapon = decision.kind === 'attack' || decision.kind === 'reload' ? decision : null;
  const combat: BotCombatProposal = {
    kind: decision.kind,
    summary,
    targetTokenId: targeted ? (step.targets.get(targeted.targetId)?.id ?? null) : null,
    targetLabel: targeted?.targetLabel ?? null,
    weaponSlotId: weapon?.weaponId ?? null,
    weaponLabel: weapon?.weaponLabel ?? null,
    actorTokenId: actor.id,
    step: step.state.step,
  };
  const proposal: BotActionProposal = {
    botId: ctx.bot.id,
    botName: ctx.bot.name,
    characterId: ctx.character.id,
    characterName: ctx.character.name,
    // Pola z 20a zostają wypełnione podsumowaniem: karta ma jeden nagłówek
    // niezależnie od tego, czy pod spodem jest test, czy strzał.
    optionLabel: summary,
    optionId: decision.kind,
    reason: decision.reason,
    request: `Tura w walce — runda ${step.state.round}, krok ${step.state.step}`,
    controllerUserId: ctx.bot.data.controllerUserId,
    combat,
  };
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId: ctx.campaignId,
    authorId: ctx.user.id,
    kind: 'proposal',
    text: `${ctx.bot.name}: ${summary}`,
    payload: JSON.stringify(proposal),
    sceneId: ctx.scene.id,
    // Sterujący gracz musi zobaczyć kartę także po odświeżeniu strony, a historia
    // czatu filtruje po `recipientId` — stąd adresat, mimo że to nie szept.
    ...(proposal.controllerUserId ? { recipientId: proposal.controllerUserId } : {}),
  });
  await deliverChatMessageTo(deps, ctx.campaignId, message, [proposal.controllerUserId], true);
}

/** Token odczytany na nowo — pozycja i statusy zmieniają się między krokami. */
async function reloadToken(deps: RealtimeDeps, tokenId: string): Promise<Token> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) throw new RealtimeError('TOKEN_NOT_FOUND');
  return token;
}

/** Jeden krok: zapytaj, zwaliduj, wykonaj albo zaproponuj. */
async function runStep(
  deps: RealtimeDeps,
  ctx: TurnContext,
  actor: Token,
  step: TacticalStep,
): Promise<StepOutcome> {
  const run = await runCombatDecision(deps, ctx, step.state);
  void logBotDecision(deps, {
    kind: 'combat',
    campaignId: ctx.campaignId,
    botId: ctx.bot.id,
    botName: ctx.bot.name,
    autonomy: ctx.bot.data.autonomy,
    actor: ctx.character.name,
    round: step.state.round,
    step: step.state.step,
    figures: step.state.figures.map((figure) => `${figure.label} ${figure.metres} m`),
    weapons: step.state.weapons.map((weapon) => weapon.label),
    raw: run.raw,
    error: run.error,
    failure: run.failure,
    retried: run.retried,
    tookMs: run.tookMs,
  });

  const base = {
    botId: ctx.bot.id,
    botName: ctx.bot.name,
    autonomy: ctx.bot.data.autonomy,
    decisionMs: run.tookMs,
    retried: run.retried,
    combat: {
      step: step.state.step,
      actorName: ctx.character.name,
      figures: step.state.figures.map((figure) => figure.label),
    },
  } satisfies Omit<BotActionTraceBroadcast, 'decision' | 'outcome'>;

  if (run.failure) {
    // Degradacja: gateway leży, więc bot niczego nie robi — a walka toczy się
    // dalej ręką MG, tak jak przed etapem 20.
    trace(deps, ctx.campaignId, {
      ...base,
      decision: null,
      outcome: 'refused',
      refusal: 'Brak połączenia z AI Gateway.',
    });
    return { kind: 'refused', refusal: 'Brak połączenia z AI Gateway.' };
  }
  if (!run.decision) {
    const refusal = run.error ? BOT_COMBAT_ERROR_LABELS[run.error] : 'Model nie oddał decyzji.';
    trace(deps, ctx.campaignId, { ...base, decision: null, outcome: 'refused', refusal });
    return { kind: 'refused', refusal };
  }

  const decision = run.decision;
  const summary = describeBotCombatDecision(decision);
  if (decision.kind === 'pass') {
    trace(deps, ctx.campaignId, {
      ...base,
      decision: 'pass',
      outcome: 'pass',
      ...(decision.reason ? { reason: decision.reason } : {}),
      combat: { ...base.combat, summary },
    });
    return { kind: 'pass', summary };
  }

  if (ctx.bot.data.autonomy === 'proposal') {
    await postCombatProposal(deps, ctx, actor, step, decision);
    trace(deps, ctx.campaignId, {
      ...base,
      decision: decision.kind,
      outcome: 'proposed',
      optionLabel: summary,
      ...(decision.reason ? { reason: decision.reason } : {}),
      combat: { ...base.combat, summary },
    });
    return { kind: 'proposed', summary };
  }

  try {
    await executeDecision(deps, ctx, actor, step, decision);
  } catch (error) {
    const code = error instanceof RealtimeError ? error.code : 'INTERNAL';
    const refusal = refusalText(code);
    deps.log.warn({ err: error, botId: ctx.bot.id }, 'bot combat action refused');
    // Jedna szansa poprawki (wymóg etapu): model dostaje powód po polsku i
    // decyduje jeszcze raz na ODŚWIEŻONYM stanie — odmowa mogła coś zmienić.
    const retryStep = await buildTacticalStep(deps, ctx, actor, step.state.step);
    const retry = await runCombatDecision(deps, ctx, retryStep.state, refusal);
    if (!retry.decision || retry.decision.kind === 'pass') {
      trace(deps, ctx.campaignId, {
        ...base,
        decision: decision.kind,
        outcome: 'refused',
        optionLabel: summary,
        refusal,
        combat: { ...base.combat, summary },
      });
      return { kind: 'refused', refusal };
    }
    // Tu jesteśmy wyłącznie w trybie automat: tryb propozycji wychodzi wyżej,
    // zanim cokolwiek zostanie wykonane, więc odmowa serwera go nie dotyczy.
    const second = describeBotCombatDecision(retry.decision);
    try {
      await executeDecision(deps, ctx, actor, retryStep, retry.decision);
    } catch (secondError) {
      const secondCode = secondError instanceof RealtimeError ? secondError.code : 'INTERNAL';
      trace(deps, ctx.campaignId, {
        ...base,
        decision: retry.decision.kind,
        outcome: 'refused',
        optionLabel: second,
        refusal: `${refusal} ${refusalText(secondCode)}`,
        retried: true,
        combat: { ...base.combat, summary: second },
      });
      return { kind: 'refused', refusal: refusalText(secondCode) };
    }
    trace(deps, ctx.campaignId, {
      ...base,
      decision: retry.decision.kind,
      outcome: 'executed',
      optionLabel: second,
      retried: true,
      ...(retry.decision.reason ? { reason: retry.decision.reason } : {}),
      combat: { ...base.combat, summary: second },
    });
    return { kind: 'executed', summary: second };
  }

  trace(deps, ctx.campaignId, {
    ...base,
    decision: decision.kind,
    outcome: 'executed',
    optionLabel: summary,
    ...(decision.reason ? { reason: decision.reason } : {}),
    combat: { ...base.combat, summary },
  });
  return { kind: 'executed', summary };
}

/** Wszystko, co tura czyta, zanim zapadnie pierwsza decyzja. */
async function loadTurnContext(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: unknown,
  signal?: AbortSignal,
): Promise<{ ctx: TurnContext; actor: Token } | { refusal: string }> {
  const { token, scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  const stored = await botForToken(deps, campaignId, token);
  if (!stored) return { refusal: 'Tej figury nie prowadzi żaden bot.' };
  const data = parseBotData(stored.data);
  if (data.type === 'gm_assistant') return { refusal: 'Asystent MG nie prowadzi figur.' };
  // Tryb kontrolowany oddaje mechanikę człowiekowi — bot ma tylko mówić.
  if (data.autonomy === 'controlled') {
    return { refusal: 'Bot jest w trybie kontrolowanym — mechanikę wykonuje człowiek.' };
  }
  if (!token.characterId || stored.characterId !== token.characterId) {
    return { refusal: 'Bot nie ma przypisanej karty tej figury.' };
  }
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character || character.campaignId !== campaignId) {
    return { refusal: 'Bot nie ma przypisanej karty postaci.' };
  }
  if (!deps.ctx.ai.getStatus().available) throw new RealtimeError('AI_UNAVAILABLE');

  const [vision, catalogue] = await Promise.all([
    loadVisionContext(deps.ctx.prisma, scene),
    catalogueOf(deps, campaignId),
  ]);
  return {
    actor: token,
    ctx: {
      campaignId,
      user: await botActorUser(deps, await gmAuthorId(deps)),
      bot: { id: stored.id, name: stored.name, data },
      character,
      sheet: parseCharacterData(character.data, deps.ctx.cpred),
      scene,
      vision,
      ...catalogue,
      ...(signal ? { signal } : {}),
    },
  };
}

/** Konto MG, na które zapisują się karty bota (jak linie NPC od etapu 11). */
async function gmAuthorId(deps: RealtimeDeps): Promise<string> {
  const gm = await deps.ctx.prisma.user.findFirst({
    where: { role: ROLE_GM },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!gm) throw new RealtimeError('INTERNAL');
  return gm.id;
}

/**
 * Cała tura bota: do dwóch kroków, każdy na odświeżonym stanie.
 *
 * Pętla kończy się wcześniej na trzy sposoby: bot spasował, serwer odmówił dwa
 * razy albo karta propozycji czeka na klik. W tym ostatnim przypadku ciąg
 * dalszy robi `resolveBotCombatProposal` — krok po zatwierdzeniu jest tym samym
 * krokiem, tylko wywołanym z innego miejsca.
 */
export async function runBotCombatTurn(
  deps: RealtimeDeps,
  options: { campaignId: string; tokenId: unknown; fromStep?: number; signal?: AbortSignal },
): Promise<BotPlayTurnResult> {
  const loaded = await loadTurnContext(deps, options.campaignId, options.tokenId, options.signal);
  if ('refusal' in loaded) return { outcome: 'refused', steps: 0, refusal: loaded.refusal };
  const { ctx } = loaded;

  let steps = 0;
  let last: StepOutcome = { kind: 'pass', summary: '' };
  for (let index = options.fromStep ?? 1; index <= BOT_COMBAT_STEPS_MAX; index += 1) {
    const actor = await reloadToken(deps, loaded.actor.id);
    const step = await buildTacticalStep(deps, ctx, actor, index);
    last = await runStep(deps, ctx, actor, step);
    steps += 1;
    if (last.kind !== 'executed') break;
  }
  return {
    outcome: last.kind === 'executed' ? 'executed' : last.kind,
    steps,
    ...(last.kind === 'refused' ? { refusal: last.refusal } : {}),
  };
}

/**
 * Zatwierdzona karta propozycji bojowej: wykonaj i graj dalej.
 *
 * Nic z karty nie jest zaufane po powrocie — decyzja jest odtwarzana na
 * **świeżym** stanie taktycznym i przechodzi te same bezpieczniki co przy
 * pierwszym pytaniu. Między propozycją a kliknięciem mogła minąć runda: cel
 * mógł zginąć, wejść za róg albo skończyć się magazynek.
 */
export async function resolveBotCombatProposal(
  deps: RealtimeDeps,
  options: { campaignId: string; proposal: BotCombatProposal },
): Promise<BotPlayTurnResult> {
  const { proposal } = options;
  const loaded = await loadTurnContext(deps, options.campaignId, proposal.actorTokenId);
  if ('refusal' in loaded) return { outcome: 'refused', steps: 0, refusal: loaded.refusal };
  const { ctx } = loaded;

  const actor = await reloadToken(deps, loaded.actor.id);
  const step = await buildTacticalStep(deps, ctx, actor, proposal.step);
  const decision = rebuildDecision(proposal, step);
  if (!decision) {
    return {
      outcome: 'refused',
      steps: 0,
      refusal: 'Sytuacja się zmieniła — tej akcji nie da się już wykonać.',
    };
  }
  try {
    await executeDecision(deps, ctx, actor, step, decision);
  } catch (error) {
    const code = error instanceof RealtimeError ? error.code : 'INTERNAL';
    return { outcome: 'refused', steps: 0, refusal: refusalText(code) };
  }

  // Zatwierdzenie kończy krok, więc tura idzie dalej od następnego — i jeśli bot
  // dalej jest w trybie propozycji, MG dostanie po prostu drugą kartę.
  if (proposal.step >= BOT_COMBAT_STEPS_MAX) return { outcome: 'executed', steps: 1 };
  const rest = await runBotCombatTurn(deps, {
    campaignId: options.campaignId,
    tokenId: proposal.actorTokenId,
    fromStep: proposal.step + 1,
  });
  return { ...rest, steps: rest.steps + 1 };
}

/**
 * Decyzja z karty, przełożona na dzisiejsze menu.
 *
 * Etykiety, nie identyfikatory: figura wraca do menu pod tą samą nazwą tylko
 * wtedy, gdy nadal jest widoczna, a broń — gdy nadal jest na karcie. Cokolwiek
 * z tego zniknęło, akcja przestaje być wykonalna, i to jest właściwa odpowiedź.
 */
function rebuildDecision(
  proposal: BotCombatProposal,
  step: TacticalStep,
): Exclude<BotCombatDecision, { kind: 'pass' }> | null {
  const reason = '';
  const weapon = proposal.weaponSlotId
    ? step.state.weapons.find((entry) => entry.id === proposal.weaponSlotId)
    : undefined;
  const target = proposal.targetTokenId
    ? step.state.figures.find((figure) => figure.id === proposal.targetTokenId)
    : undefined;

  switch (proposal.kind) {
    case 'reload':
      return weapon
        ? { kind: 'reload', weaponId: weapon.id, weaponLabel: weapon.label, reason }
        : null;
    case 'attack':
      return weapon && target
        ? {
            kind: 'attack',
            targetId: target.id,
            targetLabel: target.label,
            weaponId: weapon.id,
            weaponLabel: weapon.label,
            reason,
          }
        : null;
    case 'approach':
    case 'retreat':
      return target
        ? { kind: proposal.kind, targetId: target.id, targetLabel: target.label, reason }
        : null;
    default:
      return null;
  }
}

/**
 * „Graj turę" — MG wskazuje figurę prowadzoną przez bota (decyzja MG: tura nigdy
 * nie odpala się sama, nawet w trybie automat).
 */
export const botPlayTurnEvent = defineEvent<BotPlayTurnPayload, BotPlayTurnResult>({
  name: 'bot:play-turn',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    return runBotCombatTurn(deps, {
      campaignId: socket.data.campaign.id,
      tokenId: payload?.tokenId,
    });
  },
});
