import type {
  SessionUser,
  TokenCreatePayload,
  TokenDeleteBroadcast,
  TokenIdPayload,
  TokenMoveBroadcast,
  TokenMovePayload,
  TokenPatch,
  TokenUpdatePayload,
  TokenUpsertBroadcast,
  TokenView,
} from '@vtt/shared';
import {
  ROLE_GM,
  clampTokenPosition,
  sanitizeTokenHp,
  sanitizeTokenImageUrl,
  sanitizeTokenName,
  sanitizeTokenPatch,
  sanitizeTokenSize,
  snapTokenPosition,
  type TokenSnapScene,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import { toLinkedSheet, writeSheetHp, type LinkedSheet, type SheetRegistry } from '../sheets.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom, emitToCampaignUser, gmRoom, sceneRoom } from './state.js';
import { requireCampaignScene } from './scenes.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitCombatOfScene } from './combat.js';

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

/** Tokens of a scene as one viewer sees them: players never get hidden ones or foreign HP. */
export async function fetchSceneTokensFor(
  prisma: PrismaClient,
  registry: SheetRegistry,
  sceneId: string,
  user: SessionUser,
): Promise<TokenView[]> {
  const isGm = user.role === ROLE_GM;
  const rows = await prisma.token.findMany({
    where: { sceneId, ...(isGm ? {} : { hidden: false }) },
    orderBy: { createdAt: 'asc' },
  });
  const sheets = await loadLinkedSheets(prisma, registry, rows);
  return rows.map((row) => {
    const linked = row.characterId ? sheets.get(row.characterId) : undefined;
    return toTokenView(row, seesPrivate(row, linked, user), linked);
  });
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
async function emitTokenUpsert(
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

  const room = campaignRoom(campaignId);
  const publicPayload: TokenUpsertBroadcast = {
    seq: deps.seqs.next(room),
    token: toTokenView(token, false),
  };
  deps.io.to(room).emit('token:upsert', publicPayload);
  deps.io.to(gmRoom(campaignId)).emit('token:upsert', privatePayload);
  // Both owners see the private view; a player owning the sheet but not the
  // token (or the other way round) still gets exactly one copy.
  const privateUserIds = new Set<string>();
  if (token.ownerId) privateUserIds.add(token.ownerId);
  if (linked?.ownerId) privateUserIds.add(linked.ownerId);
  for (const userId of privateUserIds) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'token:upsert', privatePayload);
  }
}

/**
 * Refreshes every token bound to a character — called after a sheet change so
 * the map's HP bars follow the sheet (stage 08: the sheet is the source of
 * truth). Cheap: one query, then the usual per-token emissions.
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
    await emitTokenUpsert(deps, campaignId, scene, token as Token, linked);
  }
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

async function requireCampaignToken(
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
    if (patch.characterId !== undefined) data.characterId = patch.characterId;
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

    const updated = await deps.ctx.prisma.token.update({ where: { id: token.id }, data });

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
    // The DB cascades the token out of any running fight — push the shorter
    // roster to everyone (killed enemies simply leave the tracker).
    await emitCombatOfScene(deps, campaignId, scene);
  },
});

export const tokenMoveEvent = defineEvent<TokenMovePayload, { x: number; y: number }>({
  name: 'token:move',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
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

    if (final) {
      await deps.ctx.prisma.token.update({ where: { id: token.id }, data: { x, y } });
    }

    const move: Omit<TokenMoveBroadcast, 'seq'> = {
      sceneId: scene.id,
      tokenId: token.id,
      x,
      y,
      final,
      byUserId: user.id,
    };
    if (!scene.active) {
      deps.io.to(sceneRoom(scene.id)).emit('token:move', move);
    } else if (token.hidden) {
      deps.io.to(gmRoom(campaignId)).emit('token:move', move);
    } else {
      const room = campaignRoom(campaignId);
      // Only the persisted final position consumes a seq — intermediate drag
      // frames are ephemeral and a missed one must not trigger a resync.
      if (final) {
        deps.io.to(room).emit('token:move', { ...move, seq: deps.seqs.next(room) });
      } else {
        deps.io.to(room).emit('token:move', move);
      }
    }
    return { x, y };
  },
});
