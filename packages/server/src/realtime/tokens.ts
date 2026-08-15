import type {
  FogShapeView,
  FogState,
  ScenePoint,
  SceneView,
  SessionUser,
  TokenCombatProfile,
  TokenCreatePayload,
  TokenDeleteBroadcast,
  TokenIdPayload,
  TokenMoveBroadcast,
  TokenMovePayload,
  TokenPatch,
  TokenSyncBroadcast,
  TokenUpdatePayload,
  TokenUpsertBroadcast,
  TokenHp,
  TokenView,
} from '@vtt/shared';
import {
  ROLE_GM,
  clampTokenPosition,
  isTokenInFog,
  tokenCentre,
  sanitizeTokenHp,
  sanitizeTokenImageUrl,
  sanitizeTokenName,
  sanitizeTokenPatch,
  sanitizeTokenPath,
  sanitizeTokenSize,
  snapTokenPosition,
  type TokenSnapScene,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import {
  sheetCombatProfile,
  sheetWoundStatuses,
  toLinkedSheet,
  writeSheetHp,
  type LinkedSheet,
  type SheetRegistry,
} from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom, emitToCampaignUser, gmRoom, sceneRoom } from './state.js';
import { fetchFogState } from './fog-io.js';
import { tokenLightOf } from './lights-io.js';
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
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitCombatOfScene, findGrapple, loadCombat } from './combat.js';
import { validateTokenMove } from './movement.js';
import { enforceNetRunRange } from './netice.js';
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
 * The statist's combat profile as it travels (stage 16b) — an object or null.
 *
 * Reads the column without interpreting it: which fields it should hold is the
 * game system's business (`sanitizeCombatProfile` in `systems/cpred`), and this
 * module deliberately does not know. Anything unreadable becomes null, which is
 * exactly what „this token has not been statted" already means.
 */
function parseCombatProfileColumn(raw: string | null): TokenCombatProfile | null {
  if (raw === null || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as TokenCombatProfile)
      : null;
  } catch {
    return null;
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
    name: token.name,
    imageUrl: token.imageUrl,
    x: token.x,
    y: token.y,
    size: token.size,
    ownerId: token.ownerId,
    hidden: token.hidden,
    statuses: parseStatuses(token.statuses),
  };
  if (includePrivate) {
    view.characterId = token.characterId;
    view.visionRange = token.visionRange;
    // The statist's gun and armour (stage 16b). Opaque to this module by
    // design — it reads the column and forwards it, and never asks what a
    // Stopping Power is.
    view.combatProfile = parseCombatProfileColumn(token.combatProfile);
    // The lamp itself is private (the GM configures it, the controller flips
    // it); what everybody else gets is the lit corridor it produces.
    view.light = tokenLightOf(token);
    // A link to a deleted/unreadable sheet falls back to the token's own HP.
    view.hp = linked
      ? linked.hp
      : token.hpMax === null
        ? null
        : { current: token.hpCurrent ?? 0, max: token.hpMax };
  }
  return view;
}

/** Loads the sheets linked by the given tokens, keyed by character id. */
async function loadLinkedSheets(
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
function controllerIds(token: Token, linked: LinkedSheet | undefined | null): Set<string> {
  const ids = new Set<string>();
  if (token.ownerId) ids.add(token.ownerId);
  if (linked?.ownerId) ids.add(linked.ownerId);
  return ids;
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
    },
  };
}

/**
 * What hides tokens from one player on this scene (stages 17a, 18a, 18b).
 *
 * A scene answers „what may this player see?" one way at a time, which is why
 * the visibility mode is a single setting rather than two switches — this type
 * is the shape of that decision, and there is deliberately no case where both
 * the fog and the walls have a say.
 *
 * The `vision` variant carries the lighting alongside the polygons rather than
 * as a fourth kind: darkness is not a different way of hiding, it is a second
 * condition on the same one. „In view but unlit" has to be as hidden as „behind
 * a wall", and one variant holding both keeps that impossible to forget.
 */
export type Concealment =
  | { kind: 'none' }
  | { kind: 'fog'; fog: FogState }
  | {
      kind: 'vision';
      polygons: ScenePoint[][];
      lighting: ViewerLighting | null;
      /** The GM's brush over this scene (stage 18c); it outranks both above. */
      overrides: FogShapeView[];
    };

/**
 * Builds the concealment one viewer is subject to. The GM is subject to none of
 * it and therefore never pays for the query — neither the fog nor the raycast.
 */
export async function concealmentFor(
  prisma: PrismaClient,
  scene: Scene,
  user: SessionUser,
  context?: SceneVisionContext,
): Promise<Concealment> {
  if (user.role === ROLE_GM) return { kind: 'none' };
  if (scene.visibility === 'fog') return { kind: 'fog', fog: await fetchFogState(prisma, scene) };
  if (usesDynamicVision(scene)) {
    const ctx = context ?? (await loadVisionContext(prisma, scene));
    const sight = await viewerSightFor(prisma, scene, user.id, ctx);
    return {
      kind: 'vision',
      polygons: sight.polygons,
      lighting: sight.lighting,
      overrides: ctx.overrides,
    };
  }
  return { kind: 'none' };
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
  token: Pick<Token, 'x' | 'y' | 'size' | 'ownerId'>,
  scene: Scene,
  concealment: Concealment,
  linked: LinkedSheet | undefined | null,
  userId: string,
): boolean {
  if (concealment.kind === 'none') return false;
  if (controllerIds(token as Token, linked).has(userId)) return false;
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
): Promise<TokenView[]> {
  const isGm = user.role === ROLE_GM;
  const rows = await prisma.token.findMany({
    where: { sceneId: scene.id, ...(isGm ? {} : { hidden: false }) },
    orderBy: { createdAt: 'asc' },
  });
  const sheets = await loadLinkedSheets(prisma, registry, rows);
  const concealment = await concealmentFor(prisma, scene, user, context);
  const views: TokenView[] = [];
  for (const row of rows) {
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
  const context = usesDynamicVision(scene)
    ? await loadVisionContext(deps.ctx.prisma, scene)
    : undefined;
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
}

function toSnapScene(scene: Scene): TokenSnapScene {
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
): Promise<Token> {
  const spot = await freeSpot(deps.ctx.prisma, scene);
  const token = await deps.ctx.prisma.token.create({
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
  await emitTokenUpsert(deps, campaignId, scene, token, toLinkedSheet(character, deps.ctx.cpred));
  return token;
}

/**
 * A square near the middle of the scene that nobody is standing on. The search
 * spirals outward in grid steps, so five gangers built in one evening line up
 * instead of stacking into one disc.
 */
async function freeSpot(prisma: PrismaClient, scene: Scene): Promise<{ x: number; y: number }> {
  const taken = await prisma.token.findMany({
    where: { sceneId: scene.id },
    select: { x: true, y: true },
  });
  const step = scene.gridSizePx > 0 ? scene.gridSizePx : 50;
  const snap = toSnapScene(scene);
  const occupied = new Set(taken.map((token) => `${Math.round(token.x)}:${Math.round(token.y)}`));

  for (let ring = 0; ring < 12; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        // Only the ring's own edge; the inside was searched a lap earlier.
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const candidate = snapTokenPosition(
          scene.width / 2 + dx * step,
          scene.height / 2 + dy * step,
          1,
          snap,
        );
        if (!occupied.has(`${Math.round(candidate.x)}:${Math.round(candidate.y)}`))
          return candidate;
      }
    }
  }
  return snapTokenPosition(scene.width / 2, scene.height / 2, 1, snap);
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
): Promise<void> {
  const linked = linkedSheet !== undefined ? linkedSheet : await loadLinkedSheet(deps, token);
  const privatePayload: TokenUpsertBroadcast = { token: toTokenView(token, true, linked) };

  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('token:upsert', privatePayload);
    return;
  }
  if (token.hidden) {
    deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
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
  if (usesDynamicVision(scene)) {
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
  // the people controlling the token keep it (stage 17).
  const fog = await fetchFogState(deps.ctx.prisma, scene);
  if (fog.enabled && isTokenInFog(token, toGridScene(scene), fog)) {
    deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
    for (const userId of privateUserIds) {
      await emitToCampaignUser(deps.io, campaignId, userId, 'token:upsert', privatePayload);
    }
    return;
  }

  const room = campaignRoom(campaignId);
  const publicPayload: TokenUpsertBroadcast = {
    seq: deps.seqs.next(room),
    token: toTokenView(token, false),
  };
  deps.io.to(room).emit('token:upsert', publicPayload);
  deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
  for (const userId of privateUserIds) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'token:upsert', privatePayload);
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
): Promise<void> {
  if (tokenIds.length === 0) return;
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { id: { in: tokenIds } },
    include: { scene: true },
  });
  for (const row of tokens) {
    const { scene, ...token } = row;
    if (scene.campaignId !== campaignId) continue;
    await emitTokenUpsert(deps, campaignId, scene, token as Token);
  }
}

/** Emits a token removal — also used to pull a freshly hidden token from players. */
function emitTokenDelete(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  tokenId: string,
  wasVisibleToPlayers: boolean,
): void {
  if (!scene.active) {
    const payload: TokenDeleteBroadcast = { sceneId: scene.id, tokenId };
    deps.io.to(sceneRoom(scene.id)).emit('token:delete', payload);
    return;
  }
  if (wasVisibleToPlayers) {
    const room = campaignRoom(campaignId);
    const payload: TokenDeleteBroadcast = { seq: deps.seqs.next(room), sceneId: scene.id, tokenId };
    deps.io.to(room).emit('token:delete', payload);
  } else {
    const payload: TokenDeleteBroadcast = { sceneId: scene.id, tokenId };
    deps.io.to(gmRoom(campaignId)).emit('token:delete', payload);
  }
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
    const size = sanitizeTokenSize(payload?.size ?? 1);
    if (size === null) throw new RealtimeError('BAD_REQUEST');
    const hp = sanitizeTokenHp(payload?.hp ?? null);
    if (hp === undefined) throw new RealtimeError('BAD_REQUEST');
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') {
      throw new RealtimeError('BAD_REQUEST');
    }
    const ownerId = payload.ownerId ?? null;
    await requireValidOwner(deps.ctx.prisma, campaignId, ownerId);
    if (payload.characterId !== undefined && payload.characterId !== null) {
      if (typeof payload.characterId !== 'string') throw new RealtimeError('BAD_REQUEST');
    }
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload.characterId,
    );

    const { x, y } = snapTokenPosition(payload.x, payload.y, size, toSnapScene(scene));
    const token = await deps.ctx.prisma.token.create({
      data: {
        sceneId: scene.id,
        name,
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
    const linked = character ? toLinkedSheet(character, deps.ctx.cpred) : null;
    await emitTokenUpsert(deps, campaignId, scene, token, linked);
    return toTokenView(token, true, linked);
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
    if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.hidden !== undefined) data.hidden = patch.hidden;
    if (patch.statuses !== undefined) data.statuses = JSON.stringify(patch.statuses);
    if (patch.visionRange !== undefined) data.visionRange = patch.visionRange;
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
    // The statist's fighting numbers (stage 16b). Stored as the system handed
    // them over, sanitised on the way in by `sheetCombatProfile` — the core
    // must not decide that BODY 99 is wrong, only that this is an object.
    if (patch.combatProfile !== undefined) {
      data.combatProfile =
        patch.combatProfile === null
          ? null
          : JSON.stringify(sheetCombatProfile(patch.combatProfile));
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
    if (patch.hp !== undefined) {
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
    // The tracker mirrors the token: a rename shows up in the initiative list,
    // and hiding a token must pull its row from the players' tracker too.
    if (patch.name !== undefined || patch.imageUrl !== undefined || patch.hidden !== undefined) {
      await emitCombatOfScene(deps, campaignId, scene);
    }
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
    await deps.ctx.prisma.token.delete({ where: { id: token.id } });
    emitTokenDelete(deps, campaignId, scene, token.id, !token.hidden);
    // Removing a token can take a player's eyes off the map with it, and with
    // them everything those eyes were keeping visible.
    if (usesDynamicVision(scene)) {
      await emitVisionToPlayers(deps, campaignId, scene);
      await emitSceneTokensToPlayers(deps, campaignId, scene);
    }
    // The DB cascades the token out of any running fight — push the shorter
    // roster to everyone (killed enemies simply leave the tracker).
    await emitCombatOfScene(deps, campaignId, scene);
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
  deps.io.to(gmRoom(campaignId)).emit('token:move', move);

  const context = await loadVisionContext(deps.ctx.prisma, scene);
  const moved = { ...token, x: position.x, y: position.y };
  const centre = tokenCentre(moved, toGridScene(scene));
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.user.role === ROLE_GM || data.viewedSceneId !== scene.id) continue;
    if (controllers.has(data.user.id)) {
      member.emit('token:move', move);
      continue;
    }
    // The watcher's own sight, cast from where *their* tokens are — including
    // the light they are carrying, which is why the token being dragged is
    // handed in: its torch has to have moved with it.
    const sight = await viewerSightFor(deps.ctx.prisma, scene, data.user.id, context, {
      tokenId: token.id,
      x: position.x,
      y: position.y,
    });
    if (isPointObservable(centre, sight.polygons, sight.lighting, context.overrides)) {
      member.emit('token:move', move);
    }
  }

  if (final) {
    // The drop is the moment everything is re-derived from the database: who
    // may see which token, and what the mover's own tokens now light up.
    await emitSceneTokensToPlayers(deps, campaignId, scene);
    await emitVisionToPlayers(deps, campaignId, scene, { onlyUserIds: controllers });
    return;
  }
  for (const userId of controllers) {
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
  // answers that question per viewer.
  await emitTokensById(deps, campaignId, [held.id]);
}

export const tokenMoveEvent = defineEvent<TokenMovePayload, { x: number; y: number }>({
  name: 'token:move',
  handler: async ({ deps, socket, user, payload }) =>
    performTokenMove(deps, { campaignId: requireCampaignId(socket.data), user, payload }),
});

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
  },
): Promise<{ x: number; y: number }> {
  {
    const { campaignId, user, payload } = options;
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
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') {
      throw new RealtimeError('BAD_REQUEST');
    }
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    const final = payload.final === true;
    const snapScene = toSnapScene(scene);
    const { x, y } = final
      ? snapTokenPosition(payload.x, payload.y, token.size, snapScene)
      : clampTokenPosition(payload.x, payload.y, token.size, snapScene);

    /** Sends one frame of this token's movement to everyone entitled to it. */
    const broadcast = async (
      position: { x: number; y: number },
      isFinal: boolean,
    ): Promise<void> => {
      const move: Omit<TokenMoveBroadcast, 'seq'> = {
        sceneId: scene.id,
        tokenId: token.id,
        x: position.x,
        y: position.y,
        final: isFinal,
        byUserId: user.id,
      };
      // Crossing the fog boundary changes *who the token exists for*, which a
      // move broadcast cannot express — so those frames go to the GM and the
      // controllers only, and the players get a reconciling list on the drop.
      const fog = await fetchFogState(deps.ctx.prisma, scene);
      const grid = toGridScene(scene);
      const fogMatters =
        fog.enabled &&
        (isTokenInFog(token, grid, fog) || isTokenInFog({ ...token, ...position }, grid, fog));

      if (scene.active && !token.hidden && usesDynamicVision(scene)) {
        await emitDynamicMove(deps, campaignId, scene, token, move, position, isFinal);
        return;
      }

      if (!scene.active) {
        deps.io.to(sceneRoom(scene.id)).emit('token:move', move);
      } else if (token.hidden) {
        deps.io.to(gmRoom(campaignId)).emit('token:move', move);
      } else if (fogMatters) {
        deps.io.to(gmRoom(campaignId)).emit('token:move', move);
        const linked = await loadLinkedSheet(deps, token);
        for (const userId of controllerIds(token, linked)) {
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
    };

    if (final) {
      // Only the drop is judged (stage 14c). Intermediate frames are a hand in
      // motion, not a decision — charging them would bill a player for hovering.
      try {
        await validateTokenMove(deps, campaignId, user, {
          scene,
          token,
          from: { x: token.x, y: token.y },
          to: { x, y },
          path: sanitizeTokenPath(payload.path),
        });
      } catch (error) {
        // Everybody watching the drag has the figure standing where it was
        // dropped. The mover snaps it back off the ack; the audience needs to
        // be told, or a refused move would look like it happened to them.
        await broadcast({ x: token.x, y: token.y }, true);
        throw error;
      }
      await deps.ctx.prisma.token.update({ where: { id: token.id }, data: { x, y } });
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
    }

    await broadcast({ x, y }, final);
    return { x, y };
  }
}
