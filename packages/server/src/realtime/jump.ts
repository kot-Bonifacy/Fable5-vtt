import type {
  JumpDirection,
  ScenePoint,
  SessionUser,
  TokenJumpOption,
  TokenJumpOptionsPayload,
  TokenJumpOptionsView,
  TokenJumpPayload,
  WalkFigure,
} from '@vtt/shared';
import {
  CPRED_ACTION_JUMP,
  JUMP_COST_M,
  JUMP_DIRECTIONS,
  PACE_SLACK_M,
  ROLE_GM,
  firstClosedFloorStep,
  fogFloorPassable,
  formatMetres,
  judgeJumpGeometry,
  normalizeGridOffset,
  sanitizeJumpDirection,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import {
  sheetActionBlock,
  sheetActionName,
  sheetMovementBlock,
  turnDistanceRefusal,
} from '../sheets.js';
import {
  emitReloaded,
  findCombatantForToken,
  readTokenStatuses,
  spendTurnForCombatant,
  type CombatRow,
  type CombatantRow,
} from './combat.js';
import { actionEntry, logSpentAction, turnRefusalMessage } from './combat-log.js';
import { fetchSceneCovers } from './covers-io.js';
import { fetchFogState } from './fog-io.js';
import { MOVE_BLOCKED_BY_FIGURE, MOVE_BLOCKED_BY_TERRAIN, MOVE_INTO_FOG } from './movement.js';
import { chargePace, paceCapFor, paceOwedNow } from './pace.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import {
  concealmentFor,
  fetchSceneTokensFor,
  performTokenMove,
  requireCampaignToken,
  toSnapScene,
} from './tokens.js';
import { isPointObservable, usesDynamicVision } from './vision.js';
import { endWalk } from './walks.js';
import { fetchSceneWalls } from './walls-io.js';

/**
 * Skok (zlecenie MG z 19.10.2026) — dwie kratki w wybranym kierunku, ponad
 * barierą i osłoną, za `JUMP_COST_M` metrów ruchu.
 *
 * Osobna ścieżka, a nie flaga na `token:move`, bo skok łamie dokładnie te
 * reguły, których marsz pilnuje: przelatuje nad barierą i nad samochodem,
 * a płaci stałą kwotę, nie długością drogi. Lądowanie zapisuje jednak
 * `performTokenMove` (z `judged`), więc mgła, widzenie, strefy, Sieć i ciągnięty
 * Trzymany zachowują się jak po każdym ruchu.
 *
 * Kolejność pytań, od tego, co dotyczy figury, do tego, co dotyczy kierunku:
 *
 *  1. **Czy ta figura w ogóle skacze?** Stop, stan (Powalony, Pochwycony…),
 *     cudza tura, rana na Ruchu, brak 8 m w dystansie tury albo w puli
 *     Eksploracji. Odpowiedź jest jedna dla wszystkich ośmiu kierunków.
 *  2. **Czy skok w ten kierunek ląduje?** Mapa, ściany / drzwi / okna / furtki
 *     (bariera nie), osłona na polu lądowania, figury jak w marszu, mgła
 *     i — w widzeniu dynamicznym — czy gracz to pole widzi.
 *
 * `token:jump-options` zadaje oba pytania na sucho i oddaje pola, które serwer
 * przyjmie, więc klient nie musi wiedzieć, która kreska na mapie jest barierą
 * (gracz dostaje ściany bez rodzaju). `token:jump` pyta jeszcze raz, płaci
 * i ląduje.
 *
 * MG jest zwolniony z tego, z czego zwalnia go marsz (stan, mgła, widzenie,
 * budżet tylko liczony) — ale nie z geometrii skoku: przez ścianę nie skacze
 * nikt, bo do przenoszenia figur gdziekolwiek MG ma przeciąganie.
 */

/** Krawędź mapy przycięłaby skok — taki skok nie istnieje. */
export const JUMP_OFF_MAP = 'JUMP_OFF_MAP';
/** Gracz nie widzi pola, na które chce skoczyć (widzenie dynamiczne). */
export const JUMP_NOT_VISIBLE = 'JUMP_NOT_VISIBLE';
/** Stan figury nie pozwala na skok — zdanie z tabeli stanów. */
export const JUMP_STATUS = 'JUMP_STATUS';
/** W dystansie tury albo w puli nie ma `JUMP_COST_M` metrów. */
export const JUMP_NO_METRES = 'JUMP_NO_METRES';

const STOP_MESSAGE = 'Ruch wstrzymany przez MG.';

/** Odmowa całego skoku: kod na drut i zdanie dla gracza. */
interface JumpRefusal {
  code: string;
  message: string;
}

interface Jumper {
  scene: Scene;
  token: Token;
  isGm: boolean;
  found: { combat: CombatRow; combatant: CombatantRow } | null;
}

/** Figura, którą ten użytkownik może prowadzić — te same drzwi co `token:walk`. */
async function requireJumper(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  tokenId: unknown,
): Promise<Jumper> {
  const { token, scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  const isGm = user.role === ROLE_GM;
  if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
  if (!isGm && token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
  const found = await findCombatantForToken(deps.ctx.prisma, scene.id, token.id);
  return { scene, token, isGm, found };
}

/**
 * Pytanie 1: czy ta figura skacze w ogóle — i jeśli nie, dlaczego.
 *
 * Na sucho: nic nie jest wydane, a pula Eksploracji jest tylko odczytana.
 */
async function jumpRefusalFor(
  deps: RealtimeDeps,
  user: SessionUser,
  jumper: Jumper,
): Promise<JumpRefusal | null> {
  const { scene, token, isGm, found } = jumper;
  if (!isGm && scene.playerMove === 'stop') return { code: 'MOVE_LOCKED', message: STOP_MESSAGE };
  if (!isGm) {
    const statuses = readTokenStatuses(token.statuses);
    const blocked = sheetMovementBlock(statuses) ?? sheetActionBlock(statuses);
    if (blocked) return { code: JUMP_STATUS, message: blocked };
  }

  if (found) {
    const outcome = await spendTurnForCombatant(
      deps,
      found.combat,
      found.combatant,
      { kind: 'move', metres: JUMP_COST_M, hard: false },
      user,
      { dryRun: true },
    );
    if (outcome.kind !== 'refused') return null;
    if (outcome.error === 'NO_MOVE_LEFT') {
      return {
        code: JUMP_NO_METRES,
        message: `Skok kosztuje ${JUMP_COST_M} m ruchu. ${turnDistanceRefusal(outcome.judged, JUMP_COST_M)}`,
      };
    }
    return {
      code: outcome.error,
      message: outcome.message ?? turnRefusalMessage(outcome.error),
    };
  }

  // Poza walką płaci pula Eksploracji — tylko gracza i tylko w Eksploracji.
  if (isGm || scene.playerMove !== 'explore') return null;
  const { capM } = await paceCapFor(deps, token);
  if (capM + PACE_SLACK_M < JUMP_COST_M) {
    return {
      code: JUMP_NO_METRES,
      message: `Skok kosztuje ${JUMP_COST_M} m ruchu, a ta postać przechodzi najwyżej ${formatMetres(capM)} naraz.`,
    };
  }
  const available = capM - paceOwedNow(token.id, capM);
  if (available + PACE_SLACK_M < JUMP_COST_M) {
    return {
      code: 'MOVE_PACE',
      message: `Złap oddech — na skok potrzeba ${JUMP_COST_M} m z puli. Odnowi się w kilka sekund.`,
    };
  }
  return null;
}

/** Wszystko, o co pyta pytanie 2 — ładowane raz na osiem kierunków. */
interface JumpGround {
  walls: Awaited<ReturnType<typeof fetchSceneWalls>>;
  covers: Awaited<ReturnType<typeof fetchSceneCovers>>;
  figures: { pass: WalkFigure[]; land: WalkFigure[] };
  /** Pole wolne od mgły MG; null — nikt tego nie pyta (MG, scena bez mgły). */
  onFloor: ((point: ScenePoint) => boolean) | null;
  /** Czy gracz widzi ten punkt; null — nie pyta się (MG, bez widzenia dynamicznego). */
  sees: ((point: ScenePoint) => boolean) | null;
}

async function loadJumpGround(
  deps: RealtimeDeps,
  user: SessionUser,
  jumper: Jumper,
): Promise<JumpGround> {
  const { scene, token, isGm } = jumper;
  const [walls, covers, seen] = await Promise.all([
    fetchSceneWalls(deps.ctx.prisma, scene.id),
    fetchSceneCovers(deps.ctx.prisma, scene.id),
    fetchSceneTokensFor(deps.ctx.prisma, deps.ctx.cpred, scene, user),
  ]);
  // Figury jak w marszu (`refuseWalkThroughFigures`): przez wroga się nie
  // przeskoczy, na zajętym polu nie wyląduje, pojemniki nie liczą się wcale.
  // MG nie przechodzi przez nikogo z marszem, ale na kimś nie stanie i on.
  const others = seen.filter((view) => view.id !== token.id && !view.container);
  const pass = isGm
    ? []
    : others.filter(
        (view) =>
          view.ownerId === null &&
          view.partyVision !== true &&
          sheetActionBlock(view.statuses) === null,
      );

  let onFloor: JumpGround['onFloor'] = null;
  let sees: JumpGround['sees'] = null;
  if (!isGm && scene.visibility === 'fog') {
    // Jak marsz (`refuseWalkIntoFog`): pola, na których figura stoi, są wolne.
    const cell = scene.gridSizePx;
    const standing = { x: token.x, y: token.y, extent: token.size * cell };
    onFloor = fogFloorPassable(await fetchFogState(deps.ctx.prisma, scene), () => standing);
  } else if (!isGm && usesDynamicVision(scene)) {
    const concealment = await concealmentFor(deps.ctx.prisma, scene, user);
    if (concealment.kind === 'vision') {
      // Samo podłoże: zasłona z bariery (42c) chowa ludzi, nie ziemię.
      sees = (point) =>
        isPointObservable(point, concealment.polygons, concealment.lighting, concealment.overrides);
    }
  }
  return { walls, covers, figures: { pass, land: others }, onFloor, sees };
}

/** Pytanie 2: dokąd ląduje skok w ten kierunek albo czemu nie wyląduje. */
function judgeDirection(
  jumper: Jumper,
  ground: JumpGround,
  direction: JumpDirection,
): { ok: true; to: ScenePoint } | { ok: false; code: string } {
  const { scene, token } = jumper;
  const from = { x: token.x, y: token.y };
  const verdict = judgeJumpGeometry({
    from,
    size: token.size,
    direction,
    scene: toSnapScene(scene),
    walls: ground.walls,
    covers: ground.covers,
    figures: ground.figures,
  });
  if (!verdict.ok) {
    if (verdict.problem === 'off-map') return { ok: false, code: JUMP_OFF_MAP };
    if (verdict.problem === 'figure') return { ok: false, code: MOVE_BLOCKED_BY_FIGURE };
    // Ściana i osłona dostają jedno zdanie — odmowa nie nazywa przeszkody.
    return { ok: false, code: MOVE_BLOCKED_BY_TERRAIN };
  }
  const { to } = verdict;
  const cell = scene.gridSizePx;
  if (ground.onFloor) {
    const grid = {
      cell,
      originX: normalizeGridOffset(scene.gridOffsetX, cell),
      originY: normalizeGridOffset(scene.gridOffsetY, cell),
    };
    if (firstClosedFloorStep([from, to], grid, ground.onFloor, token.size)) {
      return { ok: false, code: MOVE_INTO_FOG };
    }
  }
  if (ground.sees) {
    const half = (token.size * cell) / 2;
    if (!ground.sees({ x: to.x + half, y: to.y + half })) {
      return { ok: false, code: JUMP_NOT_VISIBLE };
    }
  }
  return { ok: true, to };
}

/**
 * „Dokąd mogę skoczyć?” — pola lądowania, które serwer teraz przyjmie.
 *
 * Klient pyta o nie, gdy gracz bierze Skok z paska, i rysuje tylko je. Odmowa
 * całego skoku wraca zdaniem w `refusal`, nie błędem — pasek ma ją pokazać.
 */
export const tokenJumpOptionsEvent = defineEvent<TokenJumpOptionsPayload, TokenJumpOptionsView>({
  name: 'token:jump-options',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const jumper = await requireJumper(deps, campaignId, user, payload?.tokenId);
    const refusal = await jumpRefusalFor(deps, user, jumper);
    if (refusal) return { options: [], refusal: refusal.message };
    const ground = await loadJumpGround(deps, user, jumper);
    const options: TokenJumpOption[] = [];
    for (const direction of JUMP_DIRECTIONS) {
      const verdict = judgeDirection(jumper, ground, direction);
      if (verdict.ok) options.push({ ...direction, ...verdict.to });
    }
    return { options, refusal: null };
  },
});

/** „Skaczę tam” — osąd, zapłata i lądowanie. */
export const tokenJumpEvent = defineEvent<TokenJumpPayload, { x: number; y: number }>({
  name: 'token:jump',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const direction = sanitizeJumpDirection(payload ?? {});
    if (!direction) throw new RealtimeError('BAD_REQUEST');
    const jumper = await requireJumper(deps, campaignId, user, payload?.tokenId);
    const refusal = await jumpRefusalFor(deps, user, jumper);
    if (refusal) throw new RealtimeError(refusal.code);
    const verdict = judgeDirection(jumper, await loadJumpGround(deps, user, jumper), direction);
    if (!verdict.ok) throw new RealtimeError(verdict.code);

    await chargeJump(deps, campaignId, user, jumper);
    // Zatwierdzona trasa marszu (etap 52) to już nie ten ruch.
    endWalk(jumper.token.id);
    return performTokenMove(deps, {
      campaignId,
      user,
      payload: { tokenId: jumper.token.id, x: verdict.to.x, y: verdict.to.y, final: true },
      judged: true,
    });
  },
});

/**
 * Płaci za skok: w walce z dystansu tury (i pada na czacie jak Akcja z paska),
 * poza nią z puli Eksploracji gracza.
 */
async function chargeJump(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  jumper: Jumper,
): Promise<void> {
  const { scene, token, found } = jumper;
  if (!found) {
    if (user.role !== ROLE_GM) await chargePace(deps, campaignId, scene, token, JUMP_COST_M);
    return;
  }
  const outcome = await spendTurnForCombatant(
    deps,
    found.combat,
    found.combatant,
    { kind: 'move', metres: JUMP_COST_M, hard: false },
    user,
  );
  if (outcome.kind === 'refused') throw new RealtimeError(outcome.error);
  if (outcome.kind !== 'spent') return;
  await emitReloaded(deps, campaignId, scene, found.combat.id);
  // Ukrytej figury czat nie zdradza — jej ruch widzi tylko MG.
  if (token.hidden) return;
  await logSpentAction(
    deps,
    campaignId,
    user,
    actionEntry(
      outcome.combatant,
      CPRED_ACTION_JUMP,
      sheetActionName(CPRED_ACTION_JUMP),
      `${formatMetres(JUMP_COST_M)} ruchu`,
    ),
  );
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}
