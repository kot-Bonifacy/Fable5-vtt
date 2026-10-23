import { deferView } from './presentation.js';
import type {
  FogShapeView,
  FogState,
  ScenePoint,
  TokenAssetDeletePayload,
  TokenAssetDeleteResult,
  TokenFacingPayload,
  TokenFearedPayload,
  SceneView,
  SessionUser,
  TokenCombatProfile,
  TokenCreatePayload,
  TokenDeleteBroadcast,
  TokenDuplicatePayload,
  TokenIdPayload,
  TokenStatPayload,
  TokenMoveBroadcast,
  TokenMovePayload,
  TokenPatch,
  TokenSyncBroadcast,
  TokenUpdatePayload,
  TokenUpsertBroadcast,
  TokenHp,
  TokenView,
  TokenWalkPayload,
} from '@vtt/shared';
import {
  ROLE_GM,
  TOKEN_FEARED_MAX,
  WALK_LANDING_SLACK_CELLS,
  clampTokenPosition,
  facingFromDelta,
  facingFromPath,
  isTokenInFog,
  isPointVisible,
  figureBarriers,
  nextTokenCopyName,
  projectOntoRoute,
  routeWaypointsBefore,
  sanitizeFacing,
  tokenCentre,
  tokenHpShareOf,
  tokenSharesVision,
  isTokenDisposition,
  sanitizeTokenHp,
  sanitizeTokenImageUrl,
  sanitizeTokenName,
  sanitizeTokenPatch,
  sanitizeTokenPath,
  sanitizeTokenSize,
  snapTokenPosition,
  EMPTY_TOKEN_SIGHTINGS,
  readTokenSightings,
  tokenHiddenFrom,
  type TokenSnapScene,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import {
  readSheetFearedTokens,
  sheetFromQuickStats,
  sheetQuickStats,
  writeSheetQuickStats,
  sheetWoundStatuses,
  toLinkedSheet,
  writeSheetFearedTokens,
  writeSheetHp,
  type LinkedSheet,
  type SheetRegistry,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { requireOwnUploadUrl } from '../campaign-uploads.js';
import { campaignRoom, emitToCampaignUser, gmRoom, sceneRoom } from './state.js';
import { fetchFogState } from './fog-io.js';
import { tokenLightOf } from './lights-io.js';
import {
  COMBAT_PENDING,
  checkSighting,
  refuseMoveBeforeSightedFight,
  sightedFightPending,
} from './foe-sighting.js';
import {
  emitDragVision,
  emitVisionToPlayers,
  isPointObservable,
  loadVisionContext,
  usesDynamicVision,
  viewerSightFor,
  type SceneVisionContext,
  type ViewerLighting,
} from './vision.js';
import { requireCampaignScene } from './scenes.js';
import { emitCharacterDelete, emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitCombatOfScene, findGrapple, loadCombat } from './combat.js';
import { MOVE_HALTED, MOVE_NOT_PLANNED, validateTokenMove } from './movement.js';
import {
  activeWalk,
  approveWalk,
  endWalk,
  isCurrentWalk,
  markWalkHalted,
  walkHaltedRecently,
} from './walks.js';
import {
  emitNoticeHalt,
  hiddenNoticeDue,
  rollHiddenNotice,
  showHiddenSpots,
  type HiddenSpot,
} from './hidden-notice.js';
import { releaseTokenTargets } from './target.js';
import { forgetPace } from './pace.js';
import { enforceNetRunRange } from './netice.js';
import { runZonesAfterMove } from './zones.js';
import { runHiddenFiguresAfterMove } from './hidden-figures.js';
import { createMixedRng } from './dice-rng.js';

function parseStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Maps a DB row to the wire view. `includePrivate` controls whether the `hp`
 * and `characterId` keys exist at all — clients merge upserts with spread, so
 * an absent key means "no change / not for you" and never overwrites a
 * previously delivered value.
 *
 * A linked token's HP comes from the sheet (the single source of truth); the
 * token's own pair is only used while it is standalone.
 */
export function toTokenView(
  token: Token,
  includePrivate: boolean,
  linked?: LinkedSheet | null,
): TokenView {
  const view: TokenView = {
    id: token.id,
    sceneId: token.sceneId,
    // „Snajper Arasaki" is the GM's name for the figure; the table gets
    // `publicName` when the GM set one, and only then learns the real one by
    // being told. Filtered here rather than at the label, for the same reason
    // hidden tokens and unrevealed fog are: a secret that travels is not a
    // secret. Null — the overwhelming majority — means the two are the same.
    name: includePrivate ? token.name : (token.publicName ?? token.name),
    imageUrl: token.imageUrl,
    x: token.x,
    y: token.y,
    size: token.size,
    ownerId: token.ownerId,
    hidden: token.hidden,
    statuses: parseStatuses(token.statuses),
    // Public on purpose (stage 27j): a sentry looking the wrong way is
    // information the table is meant to be able to use.
    facing: token.facing,
    // „Oczy drużyny" (etap 45) jadą do wszystkich: każdy gracz ma tę figurę
    // widzieć zawsze i rysować wokół niej okienko w mgle.
    partyVision: sharesVision(token, linked),
  };
  // Rany figury prowadzonej przez MG jadą **publicznie** (31.08): przy stole
  // widać, że ktoś ma odciętą dłoń, a Medyk gracza ma mieć co załatać. Do 38a
  // czytało się je z profilu bojowego żetonu; teraz z karty, bo profilu nie ma.
  // Karta z właścicielem tędy nie jedzie — swoje rany gracz widzi na własnej
  // karcie, a cudzych oglądać nie ma po co.
  if (linked && linked.ownerId === null && linked.injuries.length > 0) {
    view.injuries = linked.injuries;
  }
  // Pojemnik (46b): stan zamka jedzie do wszystkich, a pasek PW nie jedzie
  // nikomu — skrzynia nie jest ranna, a jej domyślne Cechy nic nie znaczą.
  if (linked?.container) view.container = linked.container;
  // A link to a deleted/unreadable sheet falls back to the token's own HP.
  const hp: TokenHp | null = linked
    ? linked.container
      ? null
      : linked.hp
    : token.hpMax === null
      ? null
      : { current: token.hpCurrent ?? 0, max: token.hpMax };
  if (includePrivate) {
    // The alias itself is private: the editor needs it to show what the table
    // is being told, and a player who could read it would learn there *is* a
    // second name.
    if (token.publicName !== null) view.publicName = token.publicName;
    view.characterId = token.characterId;
    view.visionRange = token.visionRange;
    // Kogo ta figura się boi (23c) — bez tej listy naklejka „Onieśmielony"
    // w menu żetonu nie miała jak pokazać, czy w ogóle nakłada karę.
    view.feared = readSheetFearedTokens(token.statusData);
    // The lamp itself is private (the GM configures it, the controller flips
    // it); what everybody else gets is the lit corridor it produces.
    view.light = tokenLightOf(token);
    view.hp = hp;
    view.sharedVision = token.sharedVision;
    // Postawa (etap 56) — tylko MG i właściciel; graczom zasadzka się nie zdradza.
    view.disposition = isTokenDisposition(token.disposition) ? token.disposition : null;
    // Pula Eksploracji (etap 45) — prywatna jak PW: ile mieści, gdy pełna.
    view.paceCapM = linked ? linked.moveM : null;
    // Ukryta figura (58d): PT dla figury bez karty i ilu graczy ją zauważyło.
    view.spotDv = token.spotDv;
    // Zawsze, także 0: klient scala widoki spreadem, więc brak klucza zostawiłby
    // u MG stare „zauważona” po ruchu figury.
    view.spottedBy = token.hidden ? readTokenSightings(token.sightings).users.length : 0;
  } else {
    // Etap 43a, decyzja MG z 26.09: ile figurze zostało, widzi cały stół —
    // ułamek i szczebel, nigdy same liczby.
    view.hpShare = hp && hp.max > 0 ? tokenHpShareOf(hp) : null;
  }
  return view;
}

/** Loads the sheets linked by the given tokens, keyed by character id. */
export async function loadLinkedSheets(
  prisma: PrismaClient,
  registry: SheetRegistry,
  tokens: { characterId: string | null }[],
): Promise<Map<string, LinkedSheet>> {
  const ids = [...new Set(tokens.map((t) => t.characterId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const characters = await prisma.character.findMany({ where: { id: { in: ids } } });
  return new Map(characters.map((c) => [c.id, toLinkedSheet(c, registry)]));
}

/** Who controls a token: its owner, or the owner of the sheet it is bound to. */
export function controllerIds(
  token: Pick<Token, 'ownerId'>,
  linked: LinkedSheet | undefined | null,
): Set<string> {
  const ids = new Set<string>();
  if (token.ownerId) ids.add(token.ownerId);
  if (linked?.ownerId) ids.add(linked.ownerId);
  return ids;
}

/**
 * Czy figura jest „oczami drużyny" (etap 45, Observer z Foundry) — jedno
 * pytanie dla widoku, zasłony i klatek ruchu. Reguła w `tokenSharesVision`.
 */
export function sharesVision(
  token: Pick<Token, 'ownerId' | 'hidden' | 'sharedVision'>,
  linked: LinkedSheet | undefined | null,
): boolean {
  return tokenSharesVision({
    sharedVision: token.sharedVision,
    hidden: token.hidden,
    playerControlled: controllerIds(token, linked).size > 0,
  });
}

/**
 * May this viewer see the token's private fields (HP, sheet link)? The GM
 * always can; a player only for tokens they own or tokens bound to their own
 * character.
 */
function seesPrivate(token: Token, linked: LinkedSheet | undefined, user: SessionUser): boolean {
  if (user.role === ROLE_GM) return true;
  if (token.ownerId === user.id) return true;
  return linked?.ownerId === user.id;
}

/** Just the grid, which is all the fog geometry needs off a scene row. */
function toGridScene(scene: Scene): Pick<SceneView, 'grid'> {
  return {
    grid: {
      sizePx: scene.gridSizePx,
      offsetX: scene.gridOffsetX,
      offsetY: scene.gridOffsetY,
      color: scene.gridColor,
      alpha: scene.gridAlpha,
      visible: scene.gridVisible,
      players: scene.gridPlayers,
    },
  };
}

/**
 * What hides tokens from one player on this scene (stages 17a, 18a, 18b).
 *
 * A scene chooses one map-visibility mode. Figure barriers (42c) add a second
 * polygon mask in every mode, independently of that map: revealing the ground
 * does not reveal people behind a screen.
 *
 * The `vision` variant carries the lighting alongside the polygons rather than
 * as a fourth kind: darkness is not a different way of hiding, it is a second
 * condition on the same one. „In view but unlit" has to be as hidden as „behind
 * a wall", and one variant holding both keeps that impossible to forget.
 */
export type Concealment = { figurePolygons?: ScenePoint[][] | null } & (
  | { kind: 'none' }
  | { kind: 'fog'; fog: FogState }
  | {
      kind: 'vision';
      polygons: ScenePoint[][];
      lighting: ViewerLighting | null;
      /** The GM's brush over this scene (stage 18c); it outranks both above. */
      overrides: FogShapeView[];
    }
);

/**
 * Builds the concealment one viewer is subject to. The GM is subject to none of
 * it and therefore never pays for the query — neither the fog nor the raycast.
 */
export async function concealmentFor(
  prisma: PrismaClient,
  scene: Scene,
  user: SessionUser,
  context?: SceneVisionContext,
  liveOverride?: { tokenId: string; x: number; y: number },
  /** `borrowed: false` — without a held camera's eyes (`viewerSightFor`). */
  options: { borrowed?: boolean } = {},
): Promise<Concealment> {
  if (user.role === ROLE_GM) return { kind: 'none' };
  const ctx = context ?? (await loadVisionContext(prisma, scene));
  const sight = await viewerSightFor(prisma, scene, user.id, ctx, liveOverride, options);
  const figurePolygons = sight.figurePolygons;
  if (scene.visibility === 'fog')
    return { kind: 'fog', fog: await fetchFogState(prisma, scene), figurePolygons };
  if (usesDynamicVision(scene)) {
    return {
      figurePolygons,
      kind: 'vision',
      polygons: sight.polygons,
      lighting: sight.lighting,
      overrides: ctx.overrides,
    };
  }
  return { kind: 'none', figurePolygons };
}

/**
 * Is the token concealed from *this player* right now?
 *
 * Whoever controls the token is exempt, under every regime: a player must never
 * lose their own character off the map because the GM has not lit that corridor
 * yet, because the character walked behind its own wall, or because they put
 * their own torch out. Losing sight of your own token reads as a bug, not as
 * suspense — and the position is hardly a secret from the person moving it.
 */
export function concealedFrom(
  token: Pick<Token, 'x' | 'y' | 'size' | 'ownerId' | 'hidden' | 'sharedVision'>,
  scene: Scene,
  concealment: Concealment,
  linked: LinkedSheet | undefined | null,
  userId: string,
): boolean {
  if (controllerIds(token, linked).has(userId)) return false;
  // „Oczy drużyny" (etap 45): figurę kolegi gracz widzi zawsze — w czerni mgły,
  // za ścianą, w ciemności i za zasłoną, tak jak własną. Pozycja kolegi nie
  // jest tajemnicą przed drużyną, a zniknięcie go z mapy czytało się jak błąd.
  if (sharesVision(token, linked)) return false;
  if (
    concealment.figurePolygons &&
    !isPointVisible(tokenCentre(token, toGridScene(scene)), concealment.figurePolygons)
  )
    return true;
  if (concealment.kind === 'none') return false;
  if (concealment.kind === 'fog') {
    if (!concealment.fog.enabled) return false;
    return isTokenInFog(token, toGridScene(scene), concealment.fog);
  }
  // Measured at the token's centre, like the fog and the ruler: „where a token
  // is" has to mean one thing across the whole VTT. On a dark scene being in
  // view is not enough — something has to be shining on it.
  return !isPointObservable(
    tokenCentre(token, toGridScene(scene)),
    concealment.polygons,
    concealment.lighting,
    concealment.overrides,
  );
}

/**
 * Tokens of a scene as one viewer sees them: players never get hidden ones,
 * foreign HP, or anything the fog or a wall is keeping from them. The GM sees
 * everything and therefore never pays for the visibility query.
 */
export async function fetchSceneTokensFor(
  prisma: PrismaClient,
  registry: SheetRegistry,
  scene: Scene,
  user: SessionUser,
  context?: SceneVisionContext,
  liveOverride?: { tokenId: string; x: number; y: number },
): Promise<TokenView[]> {
  const isGm = user.role === ROLE_GM;
  // Ukryta figura jedzie tylko do kont, które ją zauważyły (58d) — i to jako
  // zwykła, bo gracz nie dostaje widoków z `hidden: true`.
  const rows = (
    await prisma.token.findMany({
      where: { sceneId: scene.id },
      orderBy: { createdAt: 'asc' },
    })
  )
    .filter((row) => isGm || !tokenHiddenFrom(row, user.id))
    .map((row) => (isGm || !row.hidden ? row : { ...row, hidden: false }));
  const sheets = await loadLinkedSheets(prisma, registry, rows);
  const concealment = await concealmentFor(prisma, scene, user, context, liveOverride);
  const views: TokenView[] = [];
  for (const stored of rows) {
    const row =
      liveOverride?.tokenId === stored.id
        ? { ...stored, x: liveOverride.x, y: liveOverride.y }
        : stored;
    const linked = row.characterId ? sheets.get(row.characterId) : undefined;
    if (concealedFrom(row, scene, concealment, linked, user.id)) continue;
    views.push(toTokenView(row, seesPrivate(row, linked, user), linked));
  }
  return views;
}

/**
 * Re-sends every player viewing the scene the token list they may now see.
 *
 * Repainting the fog can add and remove tokens for the same viewer in one
 * stroke, and each player's list differs (own tokens stay visible), so a full
 * targeted push is both simpler and safer than reasoning about deltas. Only
 * the active scene has player viewers, so a GM's private preview costs nothing.
 */
export async function emitSceneTokensToPlayers(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
): Promise<void> {
  if (!scene.active) return;
  // The walls are the same for every viewer — only the origins differ — so the
  // segment list is built once and handed to each per-player raycast.
  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.user.role === ROLE_GM || data.viewedSceneId !== scene.id) continue;
    const tokens = await fetchSceneTokensFor(
      deps.ctx.prisma,
      deps.ctx.cpred,
      scene,
      data.user,
      context,
    );
    member.emit('token:sync', { sceneId: scene.id, tokens } satisfies TokenSyncBroadcast);
  }
  // Każda zmiana listy figur graczy (mgła, ściany, światła, lądowanie) może
  // pokazać drużynie wroga (etap 56).
  await checkSighting(deps, campaignId, scene);
}

export function toSnapScene(scene: Scene): TokenSnapScene {
  return {
    width: scene.width,
    height: scene.height,
    gridMode: scene.gridMode === 'gridless' ? 'gridless' : 'grid',
    grid: { sizePx: scene.gridSizePx, offsetX: scene.gridOffsetX, offsetY: scene.gridOffsetY },
  };
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * Puts a freshly created character on the map (stage 25c).
 *
 * The character creator ends here: a sheet nobody can move is half a character,
 * and „add a token by hand afterwards" is the step session zero forgets. It is
 * the server placing the figure rather than a `token:create` from the client,
 * which is what lets a **player** finish their own character with a token —
 * `token:create` is GM-only, and rightly so.
 *
 * The portrait doubles as the token's art until somebody picks a proper one:
 * a face on the map beats a blank disc, and the GM can change it in one click.
 */
export async function createCharacterToken(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  character: Character,
  completeCreation = false,
): Promise<Token> {
  const spot = await freeSpot(deps.ctx.prisma, scene);
  const token = await deps.ctx.prisma.$transaction(async (tx) => {
    const created = await tx.token.create({
      data: {
        sceneId: scene.id,
        name: character.name,
        imageUrl: character.portraitUrl,
        x: spot.x,
        y: spot.y,
        size: 1,
        ownerId: character.ownerId,
        characterId: character.id,
        // A linked token has no HP of its own — the sheet is the source of
        // truth (stage 08), and two numbers would eventually disagree.
        hpCurrent: null,
        hpMax: null,
      },
    });
    if (completeCreation)
      await tx.character.update({ where: { id: character.id }, data: { creationTokenDone: true } });
    return created;
  });
  const linked = toLinkedSheet(character, deps.ctx.cpred);
  const placed = await syncWoundStatuses(deps, token, linked.hp);
  await emitTokenUpsert(deps, campaignId, scene, placed, linked);
  return placed;
}

/**
 * A square near the players' start (or the middle of the scene) that nobody
 * is standing on. The search spirals outward in grid steps, so five gangers
 * built in one evening line up instead of stacking into one disc.
 */
async function freeSpot(prisma: PrismaClient, scene: Scene): Promise<{ x: number; y: number }> {
  // Figura gracza staje przy miejscu startu, jeśli MG je wyznaczył (26.09, #9):
  // od tej poprawki żeton z kreatora wchodzi sam przy aktywacji sceny, a środek
  // mapy bywa wnętrzem zamkniętego pokoju.
  const spawn =
    scene.spawnX !== null && scene.spawnY !== null ? { x: scene.spawnX, y: scene.spawnY } : null;
  const spots = await freeSpotsNear(prisma, scene, spawn, 1);
  return spots[0]!;
}

/**
 * The same spiral, but around a point of the caller's choosing and for more
 * than one figure (stage 30c).
 *
 * Backup arrives *next to whoever called it* — four officers materialising in
 * the middle of the map while the Lawman bleeds in a doorway would be a rule
 * implemented against its own sentence. Passing `null` keeps the old behaviour
 * (the middle of the scene), which is what a figure-less spawn wants.
 *
 * Squares taken by the group being placed are reserved as they are handed out,
 * so a patrol of four does not stack into one disc.
 */
export async function freeSpotsNear(
  prisma: PrismaClient,
  scene: Scene,
  near: { x: number; y: number } | null,
  count: number,
): Promise<{ x: number; y: number }[]> {
  const taken = await prisma.token.findMany({
    where: { sceneId: scene.id },
    select: { x: true, y: true },
  });
  const step = scene.gridSizePx > 0 ? scene.gridSizePx : 50;
  const snap = toSnapScene(scene);
  const occupied = new Set(taken.map((token) => `${Math.round(token.x)}:${Math.round(token.y)}`));
  const originX = near?.x ?? scene.width / 2;
  const originY = near?.y ?? scene.height / 2;
  const found: { x: number; y: number }[] = [];

  for (let ring = 0; ring < 12 && found.length < count; ring += 1) {
    for (let dy = -ring; dy <= ring && found.length < count; dy += 1) {
      for (let dx = -ring; dx <= ring && found.length < count; dx += 1) {
        // Only the ring's own edge; the inside was searched a lap earlier.
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const candidate = snapTokenPosition(originX + dx * step, originY + dy * step, 1, snap);
        const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        found.push(candidate);
      }
    }
  }
  // A scene packed solid still has to produce somewhere to stand: better a
  // stack the GM drags apart than a call that silently loses its officers.
  while (found.length < count) found.push(snapTokenPosition(originX, originY, 1, snap));
  return found;
}

/**
 * Stawia na scenie figurę ostatystykowaną z góry — dziś woła to Wsparcie (30c).
 *
 * The server's own `token:create`: Backup answers a player's radio, and
 * `token:create` is GM-only for good reasons that have nothing to do with this.
 *
 * Od etapu 38a zakłada **kartę**, nie kolumnę JSON na żetonie: funkcjonariusz
 * Wsparcia jest taką samą figurą co ganger wpisany ręcznie w menu, a to, co go
 * czyni groźnym, siedzi teraz w `Character.data` razem z Wartością bojową
 * i wydrukowanymi PW (`statBlock`).
 */
export async function createStatistToken(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  spec: {
    name: string;
    at: { x: number; y: number };
    hp: number;
    quick: TokenCombatProfile;
    imageUrl?: string | null;
  },
): Promise<Token> {
  const quick = sheetQuickStats({ ...spec.quick, hpCurrent: spec.hp, hpMax: spec.hp });
  const character = await deps.ctx.prisma.character.create({
    data: {
      campaignId,
      name: spec.name,
      // Figura, którą prowadzi MG — jak każdy inny NPC (patrz `team.ts`).
      ownerId: null,
      data: sheetFromQuickStats(quick),
    },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(character, deps.ctx.cpred));
  const token = await deps.ctx.prisma.token.create({
    data: {
      sceneId: scene.id,
      name: spec.name,
      imageUrl: spec.imageUrl ?? null,
      x: spec.at.x,
      y: spec.at.y,
      size: 1,
      ownerId: null,
      characterId: character.id,
    },
  });
  await emitTokenUpsert(deps, campaignId, scene, token, toLinkedSheet(character, deps.ctx.cpred));
  return token;
}

/** Loads the sheet a single token is linked to (null when standalone). */
async function loadLinkedSheet(deps: RealtimeDeps, token: Token): Promise<LinkedSheet | null> {
  if (!token.characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  return character ? toLinkedSheet(character, deps.ctx.cpred) : null;
}

/**
 * Emits a token upsert to everyone who may see the token.
 *
 * Active scene, visible token: a sequenced campaign-wide broadcast carries the
 * public view (no HP, no sheet link), then targeted no-seq emissions deliver
 * the private view to the GM, the token's owner and the linked character's
 * owner. Hidden tokens go to the GM room only; tokens on non-active scenes go
 * to that scene's viewers (GM previews).
 */
export async function emitTokenUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  linkedSheet?: LinkedSheet | null,
  options: { moved?: boolean } = {},
): Promise<void> {
  if (
    deferView(deps, (ready) =>
      emitTokenUpsert(ready, campaignId, scene, token, linkedSheet, options),
    )
  )
    return;
  const linked = linkedSheet !== undefined ? linkedSheet : await loadLinkedSheet(deps, token);
  // Only an upsert that moved the token may move it at the clients (#47).
  const moved = options.moved ? { moved: true as const } : {};
  const privatePayload: TokenUpsertBroadcast = {
    token: toTokenView(token, true, linked),
    ...moved,
  };

  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('token:upsert', privatePayload);
    return;
  }
  if (token.hidden) {
    deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
    // Zauważona (58d): każdy z tych, którzy ją widzą, dostaje własną listę —
    // mgła i ściany dalej mogą ją przed nim chować.
    if (readTokenSightings(token.sightings).users.length > 0) {
      await emitSceneTokensToPlayers(deps, campaignId, scene);
    }
    return;
  }

  // Both owners see the private view; a player owning the sheet but not the
  // token (or the other way round) still gets exactly one copy.
  const privateUserIds = controllerIds(token, linked);

  // On a dynamic scene the audience cannot be a room at all: every player has
  // a different field of view, so „who may see this token?" has a different
  // answer per socket. The GM and the controllers get the token directly and
  // everybody else gets their own filtered list — which is the one code path
  // that already knows how to answer that question per viewer.
  if (
    usesDynamicVision(scene) ||
    (await deps.ctx.prisma.wall.count({
      where: { sceneId: scene.id, hidesFigures: true, kind: { in: ['barrier', 'gate'] } },
    })) > 0
  ) {
    deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
    // Any of these can change what somebody *sees*, not just what they see of
    // this token: a new owner, a different sight range, a token appearing at
    // all. Recomputing every viewer is a raycast apiece and removes a whole
    // class of „the map went dark and stayed dark" bugs.
    await emitVisionToPlayers(deps, campaignId, scene);
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    return;
  }

  // Standing in unrevealed fog is the same kind of secret as `hidden`, except
  // the people controlling the token keep it (stage 17). „Oczy drużyny" (etap
  // 45) zostają przy całej drużynie — jak w `concealedFrom`.
  const fog = await fetchFogState(deps.ctx.prisma, scene);
  if (fog.enabled && isTokenInFog(token, toGridScene(scene), fog) && !sharesVision(token, linked)) {
    deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
    for (const userId of privateUserIds) {
      await emitToCampaignUser(deps.io, campaignId, userId, 'token:upsert', privatePayload);
    }
    return;
  }

  const room = campaignRoom(campaignId);
  const publicPayload: TokenUpsertBroadcast = {
    seq: deps.seqs.next(room),
    token: toTokenView(token, false, linked),
    ...moved,
  };
  deps.io.to(room).emit('token:upsert', publicPayload);
  deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
  for (const userId of privateUserIds) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'token:upsert', privatePayload);
  }
}

/**
 * Figury karty idą za jej nowym właścicielem (etap 45, błąd z diagnozy 08.10).
 *
 * `token:move` pyta `Token.ownerId`, a widok i wzrok pytają także właściciela
 * karty — więc figura postawiona przed przypisaniem karty graczowi (albo karta
 * przekazana innemu) była „jego" do patrzenia, a nie do chodzenia. Przepisuje
 * tylko figury bez właściciela albo z poprzednim właścicielem karty: figura,
 * którą MG ręcznie dał komuś trzeciemu, zostaje przy nim. Potem listy figur
 * i wzrok graczy na scenach tych figur.
 */
export async function moveCharacterTokensToOwner(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  previousOwnerId: string | null,
  nextOwnerId: string | null,
): Promise<void> {
  if (previousOwnerId === nextOwnerId) return;
  const tokens = await deps.ctx.prisma.token.findMany({
    where: {
      characterId,
      scene: { campaignId },
      OR: [{ ownerId: null }, ...(previousOwnerId ? [{ ownerId: previousOwnerId }] : [])],
    },
    include: { scene: true },
  });
  if (tokens.length === 0) return;
  await deps.ctx.prisma.token.updateMany({
    where: { id: { in: tokens.map((token) => token.id) } },
    data: { ownerId: nextOwnerId },
  });
  const scenes = new Map(tokens.map((token) => [token.scene.id, token.scene]));
  for (const scene of scenes.values()) {
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    await emitVisionToPlayers(deps, campaignId, scene);
  }
}

/**
 * Refreshes every token bound to a character — called after a sheet change so
 * the map's HP bars follow the sheet (stage 08: the sheet is the source of
 * truth). Cheap: one query, then the usual per-token emissions.
 *
 * It also keeps the wound statuses in step with the HP (stage 15). Doing it
 * here means every path that changes a sheet — damage, the token menu's ±5,
 * a manual edit — ends with the right badges on the map, without each caller
 * remembering to ask.
 */
export async function emitTokensOfCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId: character.id },
    include: { scene: true },
  });
  const linked = toLinkedSheet(character, deps.ctx.cpred);
  for (const row of tokens) {
    const { scene, ...token } = row;
    if (scene.campaignId !== campaignId) continue;
    const synced = await syncWoundStatuses(deps, token as Token, linked.hp);
    await emitTokenUpsert(deps, campaignId, scene, synced, linked);
  }
}

/**
 * Writes the system's wound statuses onto a token when its HP crossed a
 * threshold. Statuses the GM set by hand are left alone — only the managed
 * wound ids are added or removed.
 */
export async function syncWoundStatuses(
  deps: RealtimeDeps,
  token: Token,
  hp: TokenHp | null,
): Promise<Token> {
  const current = parseStatuses(token.statuses);
  const next = sheetWoundStatuses(current, hp);
  if (next.length === current.length && next.every((id, index) => id === current[index])) {
    return token;
  }
  return deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: { statuses: JSON.stringify(next) },
  });
}

/**
 * Re-emits the given tokens as they are now — used after a character is
 * deleted, when the DB has already unlinked them (SetNull) and their bars
 * fall back to the token's own HP.
 */
export async function emitTokensById(
  deps: RealtimeDeps,
  campaignId: string,
  tokenIds: string[],
  options: { moved?: boolean } = {},
): Promise<void> {
  if (tokenIds.length === 0) return;
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { id: { in: tokenIds } },
    include: { scene: true },
  });
  for (const row of tokens) {
    const { scene, ...token } = row;
    if (scene.campaignId !== campaignId) continue;
    await emitTokenUpsert(deps, campaignId, scene, token as Token, undefined, options);
  }
}

/** Emits a token removal — also used to pull a freshly hidden token from players. */
function emitTokenDelete(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tokenId: string,
  /** `true` — cały stół; lista — MG i te konta (ukryta figura zauważona, 58d). */
  wasVisibleToPlayers: boolean | readonly string[],
): void {
  if (!scene.active) {
    const payload: TokenDeleteBroadcast = { sceneId: scene.id, tokenId };
    deps.io.to(sceneRoom(scene.id)).emit('token:delete', payload);
    return;
  }
  if (wasVisibleToPlayers === true) {
    const room = campaignRoom(campaignId);
    const payload: TokenDeleteBroadcast = { seq: deps.seqs.next(room), sceneId: scene.id, tokenId };
    deps.io.to(room).emit('token:delete', payload);
  } else {
    const payload: TokenDeleteBroadcast = { sceneId: scene.id, tokenId };
    deps.io.to(gmRoom(campaignId)).emit('token:delete', payload);
    for (const userId of wasVisibleToPlayers || []) {
      void emitToCampaignUser(deps.io, campaignId, userId, 'token:delete', payload);
    }
  }
}

/** Komu znika kasowana figura: całemu stołowi albo tym, którzy ją zauważyli (58d). */
function deleteAudience(token: Pick<Token, 'hidden' | 'sightings'>): true | string[] {
  return token.hidden ? readTokenSightings(token.sightings).users : true;
}

/**
 * Zdejmuje kartę bez właściciela razem ze wszystkimi jej figurami — pusty stos
 * z etapu 46b („Pusty stos sam znika”, Item Piles). Ta sama para emisji co
 * `token:delete` z „Skasuj też kartę”, tylko bez pytania: stos nie jest
 * niczyją postacią, a pusta skrzynia stałaby na mapie bez powodu.
 */
export async function removeCardWithFigures(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId },
    include: { scene: true },
  });
  for (const row of tokens) {
    const { scene, ...token } = row;
    if (scene.campaignId !== campaignId) continue;
    await deps.ctx.prisma.token.delete({ where: { id: token.id } });
    forgetPace(token.id);
    releaseTokenTargets(deps, token.id);
    emitTokenDelete(deps, campaignId, scene, token.id, deleteAudience(token));
  }
  await deps.ctx.prisma.character.deleteMany({
    where: { id: characterId, campaignId, ownerId: null },
  });
  await emitCharacterDelete(deps, campaignId, characterId, null);
}

export async function requireCampaignToken(
  prisma: PrismaClient,
  campaignId: string,
  tokenId: unknown,
): Promise<{ token: Token; scene: Scene }> {
  if (typeof tokenId !== 'string' || tokenId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const token = await prisma.token.findUnique({ where: { id: tokenId }, include: { scene: true } });
  if (!token || token.scene.campaignId !== campaignId) throw new RealtimeError('TOKEN_NOT_FOUND');
  const { scene, ...row } = token;
  return { token: row as Token, scene };
}

/** A token owner must be a member of the campaign (players only). */
async function requireValidOwner(
  prisma: PrismaClient,
  campaignId: string,
  ownerId: string | null | undefined,
): Promise<void> {
  if (ownerId === null || ownerId === undefined) return;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId: ownerId } },
  });
  if (!membership) throw new RealtimeError('OWNER_NOT_FOUND');
}

/** A linked character must belong to the same campaign. */
async function requireCampaignCharacter(
  prisma: PrismaClient,
  campaignId: string,
  characterId: string | null | undefined,
): Promise<Character | null> {
  if (characterId === null || characterId === undefined) return null;
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

export const tokenCreateEvent = defineEvent<TokenCreatePayload, TokenView>({
  name: 'token:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const scene = await requireCampaignScene(deps.ctx.prisma, campaignId, payload?.sceneId);

    const name = sanitizeTokenName(payload?.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');
    const imageUrl = sanitizeTokenImageUrl(payload?.imageUrl ?? null);
    if (imageUrl === undefined) throw new RealtimeError('BAD_REQUEST');
    requireOwnUploadUrl(imageUrl, campaignId);
    const size = sanitizeTokenSize(payload?.size ?? 1);
    if (size === null) throw new RealtimeError('BAD_REQUEST');
    const hp = sanitizeTokenHp(payload?.hp ?? null);
    if (hp === undefined) throw new RealtimeError('BAD_REQUEST');
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (payload.characterId !== undefined && payload.characterId !== null) {
      if (typeof payload.characterId !== 'string') throw new RealtimeError('BAD_REQUEST');
    }
    const picked = await requireCampaignCharacter(deps.ctx.prisma, campaignId, payload.characterId);
    // Etap 49a: wzorzec statysty nie staje na mapie — figura dostaje własną
    // kopię karty („Ganger 1”, „Ganger 2”…), jak niepowiązany aktor w Foundry.
    const character =
      picked && picked.template && picked.ownerId === null
        ? await createTemplateCopy(deps, campaignId, picked)
        : picked;
    // Figura karty gracza bez wskazanego właściciela bierze rękę właściciela
    // karty (etap 45): inaczej gracz patrzył jej oczami, a ruszyć nie mógł.
    const ownerId = payload.ownerId ?? character?.ownerId ?? null;
    await requireValidOwner(deps.ctx.prisma, campaignId, ownerId);

    const { x, y } = snapTokenPosition(payload.x, payload.y, size, toSnapScene(scene));
    const token = await deps.ctx.prisma.token.create({
      data: {
        sceneId: scene.id,
        name: character !== picked && character ? character.name : name,
        imageUrl,
        x,
        y,
        size,
        ownerId,
        characterId: character?.id ?? null,
        hidden: payload.hidden === true,
        hpCurrent: hp?.current ?? null,
        hpMax: hp?.max ?? null,
      },
    });
    // #9 (26.09): figura postawiona ręką MG spłaca żeton obiecany w kreatorze —
    // inaczej najbliższa aktywacja sceny postawiłaby drugą.
    if (character && !character.creationTokenDone && character.creationDraftId !== null) {
      await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { creationTokenDone: true },
      });
    }
    const linked = character ? toLinkedSheet(character, deps.ctx.cpred) : null;
    // Figura rannej karty staje z naklejką rany od razu, a nie dopiero przy
    // pierwszym zapisie karty (zaległość z 17.10).
    const placed = linked ? await syncWoundStatuses(deps, token, linked.hp) : token;
    await emitTokenUpsert(deps, campaignId, scene, placed, linked);
    return toTokenView(placed, true, linked);
  },
});

/**
 * Kopia karty-wzorca dla nowej figury (etap 49a, decyzja MG z 10.10).
 *
 * Numer liczy się z kart całej kampanii, nie ze sceny: kopie wzorca żyją
 * w rosterze obok siebie, a dwa „Ganger 1” na dwóch scenach byłyby nie do
 * odróżnienia na liście. Karta jak u kopii figury z etapu 35 — pełne PW.
 */
async function createTemplateCopy(
  deps: RealtimeDeps,
  campaignId: string,
  template: Character,
): Promise<Character> {
  const names = await deps.ctx.prisma.character.findMany({
    where: { campaignId },
    select: { name: true },
  });
  const name = nextTokenCopyName(
    template.name,
    names.map((row) => row.name),
    1,
  );
  const hpMax = toLinkedSheet(template, deps.ctx.cpred).hp.max;
  const copy = await deps.ctx.prisma.character.create({
    data: {
      campaignId,
      name,
      ownerId: null,
      portraitUrl: template.portraitUrl,
      templateId: template.id,
      data: writeSheetHp(template, hpMax ?? 0, deps.ctx.cpred).data,
    },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(copy, deps.ctx.cpred));
  return copy;
}

/**
 * Kopia figury obok oryginału (etap 35, `token:duplicate`).
 *
 * Powstała z jednego rachunku przy stole: postawienie sześciu tych samych
 * gangerów to dziś sześć razy „nowy żeton", sześć razy wybór grafiki i sześć
 * razy wpisana nazwa — a potem i tak wszyscy nazywają się tak samo.
 *
 * Trzy rozstrzygnięcia, które robią z tego zdarzenie serwera, a nie pętlę
 * `token:create` u klienta:
 *
 * 1. **Numeracja liczy się z całej sceny** (`nextTokenCopyName`), a klient
 *    trzyma wyłącznie figury, które wolno mu widzieć — kopia zrobiona z listy
 *    gracza nazwałaby się tak samo jak ukryta figura MG.
 * 2. **Profil bojowy statysty jedzie z oryginału**, a jest to kolumna, której
 *    klient nie dostaje w całości (`toTokenView` filtruje ją jak każdą inną
 *    tajemnicę). Bez tego kopia gangera nie umiałaby strzelać.
 * 3. **`characterId` NIE jedzie.** Dwie figury na jednej karcie postaci to dwa
 *    paski PW nad jednym zestawem punktów — i dwie rany zapisane w tym samym
 *    miejscu. Kopia bierze z karty jedno: **rozmiar** puli PW, żeby figura
 *    dorobiona z NPC-a miała nad sobą pasek tej samej wysokości.
 *
 * Kopia jest **świeżą figurą** (decyzja MG z 05.09): pełne PW, bez naklejek,
 * bez ran i bez listy „boi się". Klonuje się po to, żeby postawić kolejnego
 * przeciwnika, a nie kolejnego trupa — a kopia poturbowanego gangera z naklejką
 * „Krwawiący" byłaby dokładnie tym drugim.
 */
export const tokenDuplicateEvent = defineEvent<TokenDuplicatePayload, TokenView>({
  name: 'token:duplicate',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );

    const siblings = await deps.ctx.prisma.token.findMany({
      where: { sceneId: scene.id },
      select: { name: true },
    });
    const name = nextTokenCopyName(
      token.name,
      siblings.map((row) => row.name),
    );

    // Miejsce upuszczenia, gdy gest je podał (Alt+przeciągnięcie), a w
    // przeciwnym razie **obok** oryginału: kopia postawiona pod nim wygląda jak
    // brak reakcji. Tak czy tak przechodzi przez `snapTokenPosition`, więc
    // przyciąga do kratki i zawraca w granice sceny — klient prosi, serwer
    // rozstrzyga, jak przy każdym innym ruchu figury.
    const snapScene = toSnapScene(scene);
    const wantedX =
      typeof payload?.x === 'number' && Number.isFinite(payload.x)
        ? payload.x
        : token.x + token.size * snapScene.grid.sizePx;
    const wantedY =
      typeof payload?.y === 'number' && Number.isFinite(payload.y) ? payload.y : token.y;
    const { x, y } = snapTokenPosition(wantedX, wantedY, token.size, snapScene);

    // PW kopii: własne oryginału, a przy figurze związanej z kartą — rozmiar
    // puli z tej karty. `hpCurrent` zawsze pełne (patrz „świeża figura").
    const linkedOrigin = token.characterId
      ? await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } })
      : null;
    const origin = linkedOrigin?.campaignId === campaignId ? linkedOrigin : null;
    const hpMax = origin ? toLinkedSheet(origin, deps.ctx.cpred).hp.max : token.hpMax;

    /**
     * Kopia figury MG dostaje **własną kartę** (etap 38a).
     *
     * Do 38a kopiował się profil bojowy z kolumny żetonu i kopia była od razu
     * osobną figurą; gdyby zamiast tego przejęła podpięcie, dwa żetony dzieliłyby
     * jedne PW i strzał w jednego gangera kładłby drugiego. Karta **gracza** się
     * nie kopiuje — dwie figury Vex to nadal jedna Vex, i tak działa to od 35.
     */
    const copiedCharacter =
      origin && origin.ownerId === null
        ? await deps.ctx.prisma.character.create({
            data: {
              campaignId,
              name,
              ownerId: null,
              portraitUrl: origin.portraitUrl,
              // Etap 49a: kopia kopii należy do tego samego wzorca.
              templateId: origin.templateId,
              // Świeża figura (decyzja MG przy etapie 35): pełne PW. Reszta
              // karty jedzie jak stała — łącznie z ranami, bo tak samo
              // kopiował się profil bojowy do 38a.
              data: writeSheetHp(origin, hpMax ?? 0, deps.ctx.cpred).data,
            },
          })
        : null;
    if (copiedCharacter) {
      await emitCharacterUpsert(deps, campaignId, toCharacterView(copiedCharacter, deps.ctx.cpred));
    }

    const copy = await deps.ctx.prisma.token.create({
      data: {
        sceneId: scene.id,
        name,
        publicName: token.publicName,
        imageUrl: token.imageUrl,
        x,
        y,
        size: token.size,
        ownerId: token.ownerId,
        hidden: token.hidden,
        disposition: token.disposition,
        ...(copiedCharacter
          ? { characterId: copiedCharacter.id, hpCurrent: null, hpMax: null }
          : { hpCurrent: hpMax, hpMax }),
        facing: token.facing,
        visionRange: token.visionRange,
        lightBrightM: token.lightBrightM,
        lightDimM: token.lightDimM,
        lightColor: token.lightColor,
        lightFlicker: token.lightFlicker,
        lightOn: token.lightOn,
      },
    });
    const copyLinked = copiedCharacter ? toLinkedSheet(copiedCharacter, deps.ctx.cpred) : null;
    await emitTokenUpsert(deps, campaignId, scene, copy, copyLinked);
    // Kopia wroga postawiona drużynie przed oczami (etap 56).
    await checkSighting(deps, campaignId, scene);
    return toTokenView(copy, true, copyLinked);
  },
});

export const tokenUpdateEvent = defineEvent<TokenUpdatePayload, TokenView>({
  name: 'token:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    const patch: TokenPatch | null = sanitizeTokenPatch(payload?.patch, deps.ctx.statuses.ids);
    if (patch === null) throw new RealtimeError('BAD_REQUEST');
    if ('ownerId' in patch) {
      await requireValidOwner(deps.ctx.prisma, campaignId, patch.ownerId);
    }
    // The link after this update decides where HP are written.
    const characterId = patch.characterId !== undefined ? patch.characterId : token.characterId;
    const character = await requireCampaignCharacter(deps.ctx.prisma, campaignId, characterId);

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.publicName !== undefined) data.publicName = patch.publicName;
    if (patch.imageUrl !== undefined) {
      requireOwnUploadUrl(patch.imageUrl, campaignId);
      data.imageUrl = patch.imageUrl;
    }
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.hidden !== undefined) data.hidden = patch.hidden;
    if (patch.statuses !== undefined) data.statuses = JSON.stringify(patch.statuses);
    if (patch.visionRange !== undefined) data.visionRange = patch.visionRange;
    if (patch.facing !== undefined) data.facing = patch.facing;
    if (patch.light !== undefined) {
      // Null takes the lamp away by zeroing its reach: „carries nothing" and
      // „carries a lamp of radius zero" must not be two states (see the schema).
      data.lightBrightM = patch.light?.brightM ?? 0;
      data.lightDimM = patch.light?.dimM ?? 0;
      if (patch.light) {
        data.lightColor = patch.light.color;
        data.lightFlicker = patch.light.flicker;
        data.lightOn = patch.light.on;
      }
    }
    if (patch.characterId !== undefined) data.characterId = patch.characterId;
    // Figura bez właściciela podpięta pod kartę gracza bierze jego rękę (etap 45):
    // inaczej gracz patrzył jej oczami i widział ją jako swoją, a ruszyć jej nie
    // mógł (`token:move` pyta `ownerId`). Jawny `ownerId` w łacie wygrywa.
    if (
      patch.characterId &&
      character?.ownerId &&
      patch.ownerId === undefined &&
      token.ownerId === null
    ) {
      data.ownerId = character.ownerId;
    }
    if (patch.sharedVision !== undefined) data.sharedVision = patch.sharedVision;
    if (patch.disposition !== undefined) data.disposition = patch.disposition;
    if (patch.spotDv !== undefined) data.spotDv = patch.spotDv;
    // Ukrycie i odsłonięcie ręką MG zaczyna zauważanie od nowa (58d): figura
    // schowana drugi raz to nowa kryjówka, a jawna nie potrzebuje listy.
    if (patch.hidden !== undefined && patch.hidden !== token.hidden) {
      data.sightings = EMPTY_TOKEN_SIGHTINGS;
    }
    // A linked token has no HP of its own: the value is written through to
    // the sheet (single source of truth) and echoed back to sheet viewers.
    let linked: LinkedSheet | null = character ? toLinkedSheet(character, deps.ctx.cpred) : null;
    if (patch.hp !== undefined && character) {
      if (patch.hp !== null) {
        const written = writeSheetHp(character, patch.hp.current, deps.ctx.cpred);
        const savedCharacter = await deps.ctx.prisma.character.update({
          where: { id: character.id },
          data: { data: written.data },
        });
        linked = toLinkedSheet(savedCharacter, deps.ctx.cpred);
        await emitCharacterUpsert(
          deps,
          campaignId,
          toCharacterView(savedCharacter, deps.ctx.cpred),
        );
      }
    } else if (patch.hp !== undefined) {
      data.hpCurrent = patch.hp?.current ?? null;
      data.hpMax = patch.hp?.max ?? null;
    }
    if (patch.size !== undefined && patch.size !== token.size) {
      data.size = patch.size;
      // Re-snap so a grown token still sits on the grid inside the scene.
      const snapped = snapTokenPosition(token.x, token.y, patch.size, toSnapScene(scene));
      data.x = snapped.x;
      data.y = snapped.y;
    }

    let updated = await deps.ctx.prisma.token.update({ where: { id: token.id }, data });
    // Crossing a wound threshold from the token menu (−5 PW) must move the
    // badges too — the same automation the damage flow relies on (stage 15).
    // Przepięcie na inną kartę też: figura bierze naklejki ran z PW tej karty.
    if (patch.hp !== undefined || updated.characterId !== token.characterId) {
      const hp = linked
        ? linked.hp
        : updated.hpMax === null
          ? null
          : { current: updated.hpCurrent ?? 0, max: updated.hpMax };
      updated = await syncWoundStatuses(deps, updated, hp);
    }

    if (!token.hidden && updated.hidden) {
      // Vanish from players first, then refresh the GM's semi-transparent view.
      emitTokenDelete(deps, campaignId, scene, updated.id, true);
      deps.io.to(gmRoom(campaignId)).emit('token:upsert', {
        token: toTokenView(updated, true, linked),
      } satisfies TokenUpsertBroadcast);
      if (!scene.active) {
        deps.io.to(sceneRoom(scene.id)).emit('token:upsert', {
          token: toTokenView(updated, true, linked),
        } satisfies TokenUpsertBroadcast);
      }
    } else {
      await emitTokenUpsert(deps, campaignId, scene, updated, linked);
    }
    // Growing a token re-snaps it, which moves its centre and can therefore
    // push it across the fog boundary — reconcile the players' lists.
    if (patch.size !== undefined && patch.size !== token.size) {
      await emitSceneTokensToPlayers(deps, campaignId, scene);
    }
    // Kto patrzy tą figurą i komu ona znika z oczu (etap 45): „oczy drużyny",
    // właściciel i karta zmieniają listy figur i wzrok wszystkich graczy.
    if (
      updated.sharedVision !== token.sharedVision ||
      updated.ownerId !== token.ownerId ||
      updated.characterId !== token.characterId
    ) {
      await emitSceneTokensToPlayers(deps, campaignId, scene);
      await emitVisionToPlayers(deps, campaignId, scene);
    }
    // The tracker mirrors the token: a rename shows up in the initiative list,
    // and hiding a token must pull its row from the players' tracker too.
    if (patch.name !== undefined || patch.imageUrl !== undefined || patch.hidden !== undefined) {
      await emitCombatOfScene(deps, campaignId, scene);
    }
    // Etap 56: wróg odsłonięty albo oznaczony drużynie na oczach zaczyna walkę.
    if (
      patch.disposition !== undefined ||
      patch.hidden !== undefined ||
      patch.statuses !== undefined
    ) {
      await checkSighting(deps, campaignId, scene);
    }
    return toTokenView(updated, true, linked);
  },
});

/**
 * Szybkie statystyki figury z menu żetonu (etap 38a) — sześć pól, jedno
 * zdarzenie.
 *
 * Zastępuje `token:update { combatProfile }` z etapu 16b, i różnica jest cała:
 * tamto pisało kilkanaście liczb w kolumnę JSON żetonu, to zakłada figurze
 * **kartę postaci** (albo poprawia tę, którą już ma). Jedno zdarzenie zamiast
 * „utwórz kartę, potem podepnij, potem zapisz", bo trzy kroki z trzema
 * okazjami do zerwania to jest dokładnie ten rodzaj rzeczy, który zostawia
 * figurę bez karty i kartę bez figury.
 *
 * Szybkość z 16b zostaje: MG nadal wpisuje sześć liczb, a nie wypełnia karty.
 */
export const tokenStatEvent = defineEvent<TokenStatPayload, TokenView>({
  name: 'token:stat',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    if (typeof payload?.quick !== 'object' || payload.quick === null) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const quick = sheetQuickStats(payload.quick);

    let character = token.characterId
      ? await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } })
      : null;
    if (character && character.campaignId !== campaignId) throw new RealtimeError('NOT_FOUND');

    let updated = token;
    if (character) {
      character = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: writeSheetQuickStats(character, quick, deps.ctx.cpred) },
      });
    } else {
      character = await deps.ctx.prisma.character.create({
        data: {
          campaignId,
          // Karta nosi imię figury: „Ganger 2" na mapie i „Ganger 2" w rosterze.
          name: token.name,
          ownerId: null,
          data: sheetFromQuickStats(quick),
        },
      });
      // Własne PW żetonu schodzą razem z podpięciem — dwa domy dla jednej
      // liczby to jest to, jak się rozjeżdżają (umowa z 05).
      updated = await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: { characterId: character.id, hpCurrent: null, hpMax: null },
      });
    }
    await emitCharacterUpsert(deps, campaignId, toCharacterView(character, deps.ctx.cpred));
    const linked = toLinkedSheet(character, deps.ctx.cpred);
    // Przekroczenie progu ran ma przestawić naklejki — tak samo jak przy
    // każdej innej zmianie PW (etap 15).
    updated = await syncWoundStatuses(deps, updated, linked.hp);
    await emitTokenUpsert(deps, campaignId, scene, updated, linked);
    return toTokenView(updated, true, linked);
  },
});

export const tokenDeleteEvent = defineEvent<TokenIdPayload>({
  name: 'token:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    // Karta ginie razem z figurą — ale wyłącznie na wyraźne „tak" i wyłącznie
    // wtedy, gdy naprawdę nie ma po niej kto płakać (etap 38a). Serwer sprawdza
    // oba warunki jeszcze raz, bo klient pyta z tego, co widzi na ekranie:
    // karta z właścicielem jest kartą gracza, a karta stojąca na drugiej scenie
    // przeżyje skasowanie tej figury.
    const doomedCharacterId = payload?.deleteCharacter === true ? token.characterId : null;
    let orphanCharacterId: string | null = null;
    if (doomedCharacterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: doomedCharacterId },
        select: { id: true, ownerId: true, campaignId: true },
      });
      const elsewhere = await deps.ctx.prisma.token.count({
        where: { characterId: doomedCharacterId, id: { not: token.id } },
      });
      if (character && character.campaignId === campaignId && !character.ownerId && !elsewhere) {
        orphanCharacterId = character.id;
      }
    }

    await deps.ctx.prisma.token.delete({ where: { id: token.id } });
    forgetPace(token.id);
    releaseTokenTargets(deps, token.id);
    emitTokenDelete(deps, campaignId, scene, token.id, deleteAudience(token));
    if (orphanCharacterId) {
      await deps.ctx.prisma.character.delete({ where: { id: orphanCharacterId } });
      await emitCharacterDelete(deps, campaignId, orphanCharacterId, null);
    }
    // Removing a token can take a player's eyes off the map with it, and with
    // them everything those eyes were keeping visible.
    await emitVisionToPlayers(deps, campaignId, scene);
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    // The DB cascades the token out of any running fight — push the shorter
    // roster to everyone (killed enemies simply leave the tracker).
    await emitCombatOfScene(deps, campaignId, scene);
  },
});

/**
 * Kosz biblioteki grafik żetonów (zaległość z 22.08, zrobiona 27.08).
 *
 * Wgrana grafika zostawała w zakładce „Tokeny" na zawsze — jedyną drogą było
 * skasowanie wiersza `tokenAsset` wprost w bazie. Wzorem jest kosz puli
 * portretów, ale z **jedną świadomą różnicą**, którą wybrał MG: portret zdjęty
 * z puli zostaje na karcie, a grafika zdjęta z biblioteki **schodzi też
 * z żetonów**, które ją noszą. Powód jest w tym, czym każda z nich jest:
 * portret to obrazek na papierze, a grafika żetonu to figura, którą widać na
 * stole — gdyby plik zniknął spod niej (a `uploads-gc` zabierze go, gdy nikt go
 * już nie wymienia), na mapie zostałby zepsuty obrazek zamiast czegokolwiek.
 *
 * Dlatego to zdarzenie gniazda, a nie trasa REST obok `GET /api/token-assets`:
 * zmiana dotyczy żetonów na scenie, więc musi dojechać do wszystkich ekranów
 * tą samą drogą, co każda inna zmiana żetonu (`emitTokensById` → `token:upsert`).
 */
export const tokenAssetDeleteEvent = defineEvent<TokenAssetDeletePayload, TokenAssetDeleteResult>({
  name: 'token:asset-delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const assetId = payload?.assetId;
    if (typeof assetId !== 'string' || assetId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const asset = await deps.ctx.prisma.tokenAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.campaignId !== campaignId) {
      throw new RealtimeError('ASSET_NOT_FOUND');
    }

    // Żetony tej kampanii, które noszą właśnie ten plik. Adres jest jedyną
    // więzią między biblioteką a żetonem (`Token.imageUrl` trzyma ścieżkę, nie
    // klucz obcy) — dlatego szukamy po nim, a nie po relacji, której nie ma.
    const wearing = await deps.ctx.prisma.token.findMany({
      where: { imageUrl: asset.url, scene: { campaignId } },
      select: { id: true },
    });

    await deps.ctx.prisma.tokenAsset.delete({ where: { id: asset.id } });
    if (wearing.length > 0) {
      await deps.ctx.prisma.token.updateMany({
        where: { id: { in: wearing.map((row) => row.id) } },
        data: { imageUrl: null },
      });
      await emitTokensById(
        deps,
        campaignId,
        wearing.map((row) => row.id),
      );
    }
    return { clearedTokens: wearing.length };
  },
});

/**
 * Turns a figure to look at a point (stage 27j) — what shooting does to the one
 * who fired.
 *
 * Called after the card is on the table, never before: an attack that is
 * refused (no line of fire, an empty magazine, a cover the shooter decided not
 * to shoot through) must not leave the figure staring at somebody it never
 * fired at. Silent when the angle is unchanged — a burst of ten is one turn,
 * not ten broadcasts.
 */
export async function turnTokenToward(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  aim: ScenePoint,
): Promise<void> {
  const centre = tokenCentre(toTokenView(token, false), toGridScene(scene));
  const facing = facingFromDelta(aim.x - centre.x, aim.y - centre.y);
  if (facing === null || facing === token.facing) return;
  const updated = await deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: { facing },
  });
  await emitTokenUpsert(deps, campaignId, scene, updated);
}

/**
 * The player holds this figure — owns the token or the sheet it carries. The GM
 * holds every one. Shared by the two ways of turning a figure: by hand
 * (`token:facing`) and by aiming (`token:aim`).
 */
export async function requireTokenControl(
  prisma: PrismaClient,
  user: SessionUser,
  token: Token,
): Promise<void> {
  if (user.role === ROLE_GM) return;
  // A hidden token is refused the way an unseen one is: the rejection must
  // not become a way to learn the token is there.
  if (token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
  const character = token.characterId
    ? await prisma.character.findUnique({ where: { id: token.characterId } })
    : null;
  const controls = token.ownerId === user.id || character?.ownerId === user.id;
  if (!controls) throw new RealtimeError('FORBIDDEN');
}

/**
 * Turning a figure by hand (stage 27j) — the second token operation a *player*
 * performs, and it is here for the reason `token:light` is not in
 * `token:update`: deciding which way you are looking is a tactical choice made
 * during a fight, and routing it through the GM would turn it into paperwork.
 *
 * The automatic facing (walking, shooting) covers the common case; this covers
 * the one it cannot — a sentry watching a corridor nobody has walked down yet.
 * A hand-set angle holds until the next *move*, which then overwrites it: the
 * GM's decision of 21.08, and the honest one, since a figure that walked
 * backwards while still „facing" the door would be a lie the map told.
 */
export const tokenFacingEvent = defineEvent<TokenFacingPayload, TokenView>({
  name: 'token:facing',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    await requireTokenControl(deps.ctx.prisma, user, token);
    const facing = sanitizeFacing(payload?.facing);
    if (facing === undefined) throw new RealtimeError('BAD_REQUEST');

    const updated = await deps.ctx.prisma.token.update({
      where: { id: token.id },
      data: { facing },
    });
    await emitTokenUpsert(deps, campaignId, scene, updated);
    // Ukryta kamera przejęta w Sieci (20.10) obraca stożek netrunnera, a upsert
    // ukrytej figury idzie tylko do MG — widok graczy trzeba popchnąć osobno.
    if (updated.hidden && scene.active) {
      await emitSceneTokensToPlayers(deps, campaignId, scene);
      await emitVisionToPlayers(deps, campaignId, scene);
    }
    return toTokenView(updated, true);
  },
});

/**
 * „Kogo się boisz?" (stage 23c) — the GM naming the winner of a Konfrontacja
 * that happened at the table instead of through the app.
 *
 * Exists because the −2 needs **two** things at once: the „Onieśmielony"
 * sticker and this list. Ticking the status by hand supplied only the first, so
 * until 22.08 a GM could tick it, watch nothing happen to the dice, and have no
 * way to find out why. `token:update` is the wrong door — it writes the columns
 * a figure *is*, and never `statusData`, which is what the rules hang on.
 *
 * GM only. The loser of a stare-down does not get to decide whom they are
 * afraid of, and the winner even less.
 */
export const tokenFearedEvent = defineEvent<TokenFearedPayload, TokenView>({
  name: 'token:feared',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    const raw = payload?.fearedTokenIds;
    if (!Array.isArray(raw)) throw new RealtimeError('BAD_REQUEST');
    const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > TOKEN_FEARED_MAX) throw new RealtimeError('BAD_REQUEST');

    // Somebody who is not on this scene cannot be staring anyone down on it,
    // and an id nobody owns would be a penalty that can never be paid off.
    const present = await deps.ctx.prisma.token.findMany({
      where: { id: { in: ids }, sceneId: scene.id },
      select: { id: true },
    });
    const valid = present.map((row) => row.id).filter((id) => id !== token.id);

    const updated = await deps.ctx.prisma.token.update({
      where: { id: token.id },
      data: { statusData: writeSheetFearedTokens(token.statusData, valid) },
    });
    await emitTokenUpsert(deps, campaignId, scene, updated);
    return toTokenView(updated, true);
  },
});

/**
 * A move on a scene where walls decide visibility (stage 18a).
 *
 * There is no room that could carry this: two players standing on opposite
 * sides of a door have different answers to „does that token exist?", so each
 * socket is asked separately. The GM and whoever controls the token always get
 * the frame; anybody else gets it only while the token is inside their own
 * field of view — which is why an intermediate frame costs a raycast per
 * watching player, and why the drop is what reconciles everyone.
 *
 * The mover also gets their *own* view back, throttled, so the darkness travels
 * with the token instead of snapping into place when they let go.
 */
async function emitDynamicMove(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  move: Omit<TokenMoveBroadcast, 'seq'>,
  position: { x: number; y: number },
  final: boolean,
): Promise<void> {
  const linked = await loadLinkedSheet(deps, token);
  const controllers = controllerIds(token, linked);
  // Czyj wzrok ten ruch zmienia: „oczy drużyny" (etap 45) patrzą za wszystkich
  // graczy, więc ich krok przelicza widok całej drużyny, nie tylko prowadzącego.
  const party = sharesVision(token, linked);
  const sightOwners = new Set(controllers);
  deps.io.to(gmRoom(campaignId)).emit('token:move', move);

  const context = await loadVisionContext(deps.ctx.prisma, scene);
  // Kamera przejęta w Sieci (20.10): jej ruch zmienia to, co widzi netrunner.
  for (const eye of context.borrowed) {
    if (eye.token.id === token.id) for (const viewer of eye.viewers) sightOwners.add(viewer);
  }
  const moved = { ...token, x: position.x, y: position.y };
  const hasFigureBarriers = figureBarriers(context.walls).length > 0;
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.user.role === ROLE_GM || data.viewedSceneId !== scene.id) continue;
    if (party) sightOwners.add(data.user.id);
    if (!final && hasFigureBarriers) {
      member.emit('token:sync', {
        sceneId: scene.id,
        tokens: await fetchSceneTokensFor(
          deps.ctx.prisma,
          deps.ctx.cpred,
          scene,
          data.user,
          context,
          { tokenId: token.id, ...position },
        ),
      } satisfies TokenSyncBroadcast);
    }
    if (controllers.has(data.user.id)) {
      member.emit('token:move', move);
      continue;
    }
    // The watcher's own sight, cast from where *their* tokens are — including
    // the light they are carrying, which is why the token being dragged is
    // handed in: its torch has to have moved with it.
    const concealment = await concealmentFor(deps.ctx.prisma, scene, data.user, context, {
      tokenId: token.id,
      x: position.x,
      y: position.y,
    });
    if (!concealedFrom(moved, scene, concealment, linked, data.user.id)) {
      member.emit('token:move', move);
    }
  }

  if (final) {
    // The drop is the moment everything is re-derived from the database: who
    // may see which token, and what the mover's own tokens now light up.
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    await emitVisionToPlayers(deps, campaignId, scene, { onlyUserIds: sightOwners });
    return;
  }
  for (const userId of sightOwners) {
    await emitDragVision(
      deps,
      campaignId,
      scene,
      userId,
      { tokenId: token.id, x: position.x, y: position.y },
      false,
    );
  }
}

/**
 * Drags whoever this token is Holding (stage 14d).
 *
 * The Held one keeps their offset rather than being teleported on top of the
 * Attacker: a grapple is two people shuffling, not one carrying the other. The
 * position is clamped but deliberately *not* snapped — snapping both would pull
 * them onto the same square whenever the offset is under half a cell.
 *
 * Nothing here is judged: the Attacker's own drag has already been through the
 * budget, and RAW gives the Held one no say in the matter.
 */
async function dragGrappledToken(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  mover: Token,
  delta: { dx: number; dy: number },
): Promise<void> {
  if (delta.dx === 0 && delta.dy === 0) return;
  const combat = await loadCombat(deps.ctx.prisma, scene.id);
  if (!combat) return;
  const combatant = combat.combatants.find((row) => row.tokenId === mover.id);
  if (!combatant) return;
  const pair = findGrapple(combat, combatant);
  // Only the Attacker drags; being Held does not let you tow your captor.
  if (!pair || pair.attacker.id !== combatant.id || !pair.defender.tokenId) return;

  const held = await deps.ctx.prisma.token.findUnique({ where: { id: pair.defender.tokenId } });
  if (!held || held.sceneId !== scene.id) return;
  const snapScene = toSnapScene(scene);
  const { x, y } = clampTokenPosition(held.x + delta.dx, held.y + delta.dy, held.size, snapScene);
  if (x === held.x && y === held.y) return;
  await deps.ctx.prisma.token.update({ where: { id: held.id }, data: { x, y } });
  // An upsert rather than a move frame: the audience for the Held token can
  // differ from the mover's (fog, dynamic vision), and `emitTokensById` already
  // answers that question per viewer. `moved`, because this upsert is the move.
  await emitTokensById(deps, campaignId, [held.id], { moved: true });
}

/**
 * „Idę tędy” (etap 52) — trasa marszu gracza zgłoszona przed pierwszym krokiem.
 *
 * Sprawdzana w całości tak samo jak lądowanie (`validateTokenMove` na sucho:
 * Stop, mgła, ściany, figury, statusy, Tura albo pula — z kartą odmowy w walce),
 * ale bez płacenia: metry pobiera lądowanie, za przebyty kawałek. Przyjęta trasa
 * czeka w `walks.ts` na klatki marszu, które `performTokenMove` na nią rzutuje.
 *
 * MG może ją zgłosić bez skutku — jego klatek nic nie pilnuje.
 */
export const tokenWalkEvent = defineEvent<TokenWalkPayload, { tokenId: string }>({
  name: 'token:walk',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
    if (!isGm && token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
    if (!isGm && scene.playerMove === 'stop') throw new RealtimeError('MOVE_LOCKED');
    await refuseMoveBeforeSightedFight(deps, scene.id, user);
    const points = sanitizeTokenPath(payload?.route);
    if (!points) throw new RealtimeError('BAD_REQUEST');

    const snapScene = toSnapScene(scene);
    const from = { x: token.x, y: token.y };
    const legs = points.map((point) => clampTokenPosition(point.x, point.y, token.size, snapScene));
    // Koniec trasy przyciąga się tak, jak przyciągnie go lądowanie: punkty
    // jadą po drucie zaokrąglone do piksela, a na kratce o ułamkowym boku
    // przekątna do (356, 356) zamiast (356,36, 356,36) to „2,9 m” zamiast
    // „2,8 m” — dość, żeby pula policzona u klienta co do metra odmówiła
    // (T6b 6.6b, 18.10). Ocenia się trasę, za którą lądowanie zapłaci.
    const last = legs[legs.length - 1]!;
    const to = snapTokenPosition(last.x, last.y, token.size, snapScene);
    legs[legs.length - 1] = to;
    if (!isGm) {
      await validateTokenMove(
        deps,
        campaignId,
        user,
        { scene, token, from, to, path: legs, ...(payload.extra === true ? { extra: true } : {}) },
        { dryRun: true },
      );
    }
    approveWalk(token.id, {
      userId: user.id,
      sceneId: scene.id,
      route: [from, ...legs],
      ...(payload.extra === true ? { extra: true } : {}),
    });
    return { tokenId: token.id };
  },
});

export const tokenMoveEvent = defineEvent<TokenMovePayload, { x: number; y: number }>({
  name: 'token:move',
  handler: async ({ deps, socket, user, payload }) =>
    performTokenMove(deps, { campaignId: requireCampaignId(socket.data), user, payload }),
});

/**
 * Rozsyła jedną klatkę ruchu figury wszystkim, którym się należy — mgła,
 * widzenie dynamiczne, ukrycie. `token` to wiersz sprzed ruchu (granica mgły
 * liczy się z obu pozycji). Poza `performTokenMove` woła ją zatrzymanie
 * marszu z etapu 56: pole zatrzymania musi dojść do stołu jako lądowanie
 * (`final`), bo lista figur nie przesuwa figury, która przed chwilą szła (#47).
 */
export async function emitTokenMoveFrame(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  move: Omit<TokenMoveBroadcast, 'seq'>,
): Promise<void> {
  const position = { x: move.x, y: move.y };
  const isFinal = move.final;
  // Crossing the fog boundary changes *who the token exists for*, which a
  // move broadcast cannot express — so those frames go to the GM and the
  // controllers only, and the players get a reconciling list on the drop.
  const fog = await fetchFogState(deps.ctx.prisma, scene);
  const grid = toGridScene(scene);
  const fogMatters =
    fog.enabled &&
    (isTokenInFog(token, grid, fog) || isTokenInFog({ ...token, ...position }, grid, fog));
  const fogLinked = fogMatters ? await loadLinkedSheet(deps, token) : null;

  if (
    scene.active &&
    !token.hidden &&
    (usesDynamicVision(scene) ||
      (await deps.ctx.prisma.wall.count({
        where: { sceneId: scene.id, hidesFigures: true, kind: { in: ['barrier', 'gate'] } },
      })) > 0)
  ) {
    await emitDynamicMove(deps, campaignId, scene, token, move, position, isFinal);
    return;
  }

  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('token:move', move);
  } else if (token.hidden) {
    deps.io.to(gmRoom(campaignId)).emit('token:move', move);
  } else if (fogMatters && !sharesVision(token, fogLinked)) {
    // „Oczy drużyny" (etap 45) idą gałęzią niżej: drużyna widzi je zawsze,
    // więc granica mgły nie zmienia, dla kogo figura istnieje.
    deps.io.to(gmRoom(campaignId)).emit('token:move', move);
    for (const userId of controllerIds(token, fogLinked)) {
      await emitToCampaignUser(deps.io, campaignId, userId, 'token:move', move);
    }
    if (isFinal) await emitSceneTokensToPlayers(deps, campaignId, scene);
  } else {
    const room = campaignRoom(campaignId);
    // Only the persisted final position consumes a seq — intermediate drag
    // frames are ephemeral and a missed one must not trigger a resync.
    if (isFinal) {
      deps.io.to(room).emit('token:move', { ...move, seq: deps.seqs.next(room) });
    } else {
      deps.io.to(room).emit('token:move', move);
    }
  }
}

/**
 * Figury, za które klatka marszu właśnie rzuca ukrytą Percepcję (24.10) —
 * równoległa klatka nie pyta drugi raz, zanim pierwsza zapisze próby.
 */
const noticeRolling = new Set<string>();

/**
 * One move, socket-free (stage 20b) — the bot walking its figure goes through
 * this, so „a bot is a player, not a second set of rules" stays literally true:
 * the same clamp, the same snap, the same `validateTokenMove`, the same audience.
 */
export async function performTokenMove(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    /** Whose permissions apply; a bot borrows the GM account (stage 11). */
    user: SessionUser;
    payload: TokenMovePayload | undefined;
    /**
     * Lądowanie osądzone i opłacone już przez wołającego (Skok, `jump.ts`,
     * 19.10.2026): bez trasy marszu i bez `validateTokenMove`, które
     * odmówiłoby przeskoczonej bariery i policzyłoby metry drugi raz.
     * Nigdy z drutu.
     */
    judged?: boolean;
  },
): Promise<{ x: number; y: number }> {
  {
    const { campaignId, user, payload } = options;
    const judged = options.judged === true;
    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );
    const isGm = user.role === ROLE_GM;
    // Non-owners get NOT_FOUND-style rejection semantics only for hidden
    // tokens (existence must not leak); owning a visible token is required.
    if (!isGm && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
    if (!isGm && token.ownerId !== user.id) throw new RealtimeError('FORBIDDEN');
    // „Ruch graczy: Stop" (etap 45; blokada mapy z 12.09): drużyna, która
    // dostanie planszę przed rozpoczęciem gry, obejdzie ją własną figurą i pozna
    // zanim MG cokolwiek powie. Stop to Pauza z Foundry — zatrzymuje także
    // uczestnika walki w jego turze. Sprawdzane **tu**, a nie
    // w `validateTokenMove`: tamto pyta o Turę, pulę i ściany, więc odpowiada
    // dopiero na upuszczeniu (`final`), a Stop ma odrzucić także pojedynczą
    // klatkę ciągnięcia. MG nie jest nim związany nigdy (jak budżetem Tury, 14b).
    if (!isGm && scene.playerMove === 'stop') throw new RealtimeError('MOVE_LOCKED');
    // Etap 56: drużyna zobaczyła wroga — do „Rozpocznij walkę” albo „Odwołaj”
    // gracze stoją, także z klatkami marszu, które były już w drodze.
    await refuseMoveBeforeSightedFight(deps, scene.id, user);
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    let final = payload.final === true;
    const snapScene = toSnapScene(scene);
    let { x, y } = final
      ? snapTokenPosition(payload.x, payload.y, token.size, snapScene)
      : clampTokenPosition(payload.x, payload.y, token.size, snapScene);

    /**
     * Łamana, po której figura szła — do rachunku metrów, kierunku i stref.
     * Z ręki klienta tylko u MG i przy lądowaniu bez zatwierdzonej trasy.
     */
    let reportedPath = sanitizeTokenPath(payload.path);
    // Etap 52: klatka pośrednia gracza to krok marszu po trasie zatwierdzonej
    // `token:walk`, a jej pozycja jest **rzutowana na tę trasę** — z niej
    // liczy się widzenie i pamięć odkrytego, więc gracz nie zobaczy niczego
    // poza drogą, którą wolno mu przejść. Bez trasy klatka pośrednia nie
    // istnieje (przeciąganie przez mur odsłaniało pokój za nim). Lądowanie
    // bez trasy zostaje: sprawdza je w całości `validateTokenMove`, a widzenie
    // liczy się dopiero z pozycji, którą przyjęło.
    const walk = isGm || judged ? null : activeWalk(token.id, user.id, scene.id, token);
    if (!isGm && !final && !walk) throw new RealtimeError(MOVE_NOT_PLANNED);
    // Etap 58a: klient dobiegł do celu, zanim doszło do niego `token:halt` —
    // jego lądowanie bez trasy poniosłoby figurę dalej, na to, przed czym stanęła.
    if (!isGm && !judged && final && !walk && walkHaltedRecently(token.id, user.id)) {
      throw new RealtimeError(MOVE_HALTED);
    }
    /** Klatka marszu, która stała się lądowaniem przy ukrytej rzeczy (58a). */
    let noticeHalt = false;
    /** Zdane ukryte Testy Percepcji — pokażą się po lądowaniu (24.10). */
    const spots: HiddenSpot[] = [];
    if (walk) {
      const hit = projectOntoRoute(walk.route, { x, y });
      if (!final) {
        walk.reached = Math.max(walk.reached, hit.distance);
        ({ x, y } = clampTokenPosition(hit.point.x, hit.point.y, token.size, snapScene));
        // Etap 58a (ukryty rzut od 24.10): pierwsze pole marszu w zasięgu
        // ukrytej rzeczy, której ta postać jeszcze nie sprawdzała — serwer
        // rzuca tu Percepcję w ukryciu. Porażka nie zatrzymuje, sukces
        // zamienia klatkę w lądowanie, więc figura płaci za przebyty kawałek
        // jak każda (Tura w walce, pula poza nią) i nie wchodzi w to, co
        // zauważyła. Na polu, na którym nie wolno stanąć, nikt nie rzuca —
        // następna klatka spróbuje jeszcze raz.
        const stand = snapTokenPosition(x, y, token.size, snapScene);
        if (
          !noticeRolling.has(token.id) &&
          (await hiddenNoticeDue(deps, campaignId, scene, token, stand))
        ) {
          noticeRolling.add(token.id);
          try {
            const passed = routeWaypointsBefore(walk.route, hit.distance);
            const fits = await validateTokenMove(
              deps,
              campaignId,
              user,
              {
                scene,
                token,
                from: { x: token.x, y: token.y },
                to: stand,
                path: passed,
                ...(walk.extra === true ? { extra: true } : {}),
              },
              { dryRun: true },
            ).then(
              () => true,
              () => false,
            );
            if (fits) {
              spots.push(
                ...(await rollHiddenNotice(deps, { campaignId, user, scene, token, stand })),
              );
            }
            // Równoległa klatka mogła już zatrzymać ten marsz — wygrywa pierwsza.
            if (spots.length > 0 && isCurrentWalk(token.id, walk)) {
              endWalk(token.id);
              markWalkHalted(token.id, user.id);
              noticeHalt = true;
              final = true;
              ({ x, y } = stand);
              reportedPath = passed;
            }
          } finally {
            noticeRolling.delete(token.id);
          }
        }
      } else {
        // Przerwany marsz ląduje na polu, w które figura wchodziła — najwyżej
        // kratkę od trasy. Dalej to już nie ten marsz: trasa przepada, a
        // lądowanie ocenia się samo, jak każde bez trasy.
        // Płaci się do najdalszego punktu, do którego doszły klatki — marsz
        // pokazany stołowi do końca i „cofnięty” na start nie jest darmowy.
        if (hit.offset > WALK_LANDING_SLACK_CELLS * scene.gridSizePx + 1) endWalk(token.id);
        else {
          reportedPath = routeWaypointsBefore(walk.route, Math.max(walk.reached, hit.distance));
        }
      }
    }

    /**
     * Which way walking left the figure looking (stage 27j).
     *
     * Set only once the drop has been paid for, and only when the walk was long
     * enough to mean something: a refused move must not turn the figure, and
     * neither must a drop half a pixel from where it started. Null keeps a
     * hand-set facing — „manual holds until the next move" is the GM's decision
     * of 21.08, and a move that never happened is not the next move.
     */
    let turnedTo: number | null = null;

    /** Sends one frame of this token's movement to everyone entitled to it. */
    const broadcast = (position: { x: number; y: number }, isFinal: boolean): Promise<void> =>
      emitTokenMoveFrame(deps, campaignId, scene, token, {
        sceneId: scene.id,
        tokenId: token.id,
        x: position.x,
        y: position.y,
        final: isFinal,
        byUserId: user.id,
        ...(turnedTo === null ? {} : { facing: turnedTo }),
      });

    /** Ukryta figura w nowej kryjówce — zauważający dostaną listy bez niej (58d). */
    let lostSpotters: Token | null = null;
    if (final) {
      // Only the drop is judged (stage 14c). Intermediate frames are a hand in
      // motion, not a decision — charging them would bill a player for hovering.
      try {
        if (!judged)
          await validateTokenMove(deps, campaignId, user, {
            scene,
            token,
            from: { x: token.x, y: token.y },
            to: { x, y },
            path: reportedPath,
            ...(payload.extra === true || (noticeHalt && walk?.extra === true)
              ? { extra: true }
              : {}),
          });
      } catch (error) {
        if (walk) endWalk(token.id);
        // Everybody watching the drag has the figure standing where it was
        // dropped. The mover snaps it back off the ack; the audience needs to
        // be told, or a refused move would look like it happened to them.
        await broadcast({ x: token.x, y: token.y }, true);
        throw error;
      }
      // The route the hand actually took decides the facing, not the straight
      // line to the landing square: a figure that walked round a corner is
      // looking down the corridor it came out of, not back at where it started.
      if (walk) endWalk(token.id);
      const walked = reportedPath;
      turnedTo =
        (walked ? facingFromPath([{ x: token.x, y: token.y }, ...walked]) : null) ??
        facingFromDelta(x - token.x, y - token.y);
      await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: { x, y, ...(turnedTo === null ? {} : { facing: turnedTo }) },
      });
      // „Atakujący ciągnie go ze sobą, gdy wykonuje swoją Akcję Ruchu" (s. 176).
      // The metres were already charged to the one doing the dragging — the
      // Held one pays nothing, because they are not the one walking.
      await dragGrappledToken(deps, campaignId, scene, token, {
        dx: x - token.x,
        dy: y - token.y,
      });
      // „Wyjście poza zasięg punktu dostępu bez uprzedniego odłączenia się
      // powoduje automatyczne (awaryjne) odłączenie" (s. 198, stage 26b). Asked
      // here rather than in the netrunning module because *walking* is what
      // triggers it, and this is the one place every walk lands.
      const jackedOut = await enforceNetRunRange(
        deps,
        campaignId,
        scene,
        { ...token, x, y },
        user,
        createMixedRng(),
      );
      // The bill an unsafe exit runs up (stage 26c) lands on sheets and on
      // stickers, so whatever it touched has to go back out to the table.
      if (jackedOut.tokenIds.length > 0) {
        await emitTokensById(deps, campaignId, jackedOut.tokenIds);
      }
      // „Cel bez odpowiedniej przepustki wchodzi na strzeżony obszar" (s. 213,
      // stage 26f). Asked here for the same reason the disconnect is: this is
      // the one place every walk lands, and a second „a figure moved" would
      // drift from this one the first time somebody changed either.
      const moved = {
        campaignId,
        user,
        scene,
        token,
        from: { x: token.x, y: token.y },
        to: { x, y },
        path: reportedPath ?? [],
      };
      spots.push(...(await runZonesAfterMove(deps, moved)).spots);
      // Etap 58d: ukryte figury, obok których przeszła — ta sama droga co strefy.
      spots.push(...(await runHiddenFiguresAfterMove(deps, moved)));
      // Ukryta figura, która zmieniła miejsce, siedzi w nowej kryjówce (58d):
      // kto ją zauważył, traci ją z mapy, a każda postać dostaje nowy rzut.
      if (
        token.hidden &&
        (x !== token.x || y !== token.y) &&
        token.sightings !== EMPTY_TOKEN_SIGHTINGS
      ) {
        const reset = await deps.ctx.prisma.token.update({
          where: { id: token.id },
          data: { sightings: EMPTY_TOKEN_SIGHTINGS },
        });
        if (readTokenSightings(token.sightings).users.length > 0) lostSpotters = reset;
      }
    }

    await broadcast({ x, y }, final);
    if (lostSpotters) {
      // MG — świeży widok bez „zauważona”, gracze — listy bez figury.
      await emitTokenUpsert(deps, campaignId, scene, lostSpotters);
      await emitSceneTokensToPlayers(deps, campaignId, scene);
    }
    // Etap 58a: najpierw „przystaje”, potem rzut i „zauważa” — w tej
    // kolejności gracz ma to przeczytać, a lądowanie leży już w jego magazynie.
    if (noticeHalt) await emitNoticeHalt(deps, campaignId, scene, token);
    await showHiddenSpots(deps, campaignId, scene, token, spots);
    // Etap 56: czy ten krok (albo ruch wroga) pokazał drużynie wroga. Klatka
    // marszu jeszcze nie leży w bazie, więc jedzie jako pozycja na żywo.
    const halted = await checkSighting(
      deps,
      campaignId,
      scene,
      final ? undefined : { tokenId: token.id, x, y },
    );
    const stopped = halted.get(token.id);
    if (stopped) return stopped;
    // Klatka gracza, która przeszła bramkę, zanim równoległa klatka zauważenia
    // założyła starcie, rozesłała pozycję za polem zatrzymania — stół dostaje
    // z powrotem pole z bazy, a gracz odmowę.
    if (!isGm && !final && (await sightedFightPending(deps, scene.id))) {
      const standing = await deps.ctx.prisma.token.findUnique({ where: { id: token.id } });
      if (standing) await broadcast({ x: standing.x, y: standing.y }, true);
      throw new RealtimeError(COMBAT_PENDING);
    }
    return { x, y };
  }
}
