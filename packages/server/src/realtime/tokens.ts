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
import type { Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom, emitToCampaignUser, gmRoom, sceneRoom } from './state.js';
import { requireCampaignScene } from './scenes.js';

function parseStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Maps a DB row to the wire view. `includeHp` controls whether the `hp` key
 * exists at all — clients merge upserts with spread, so an absent key means
 * "no change / not for you" and never overwrites a previously delivered value.
 */
export function toTokenView(token: Token, includeHp: boolean): TokenView {
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
  if (includeHp) {
    view.hp = token.hpMax === null ? null : { current: token.hpCurrent ?? 0, max: token.hpMax };
  }
  return view;
}

/** Tokens of a scene as one viewer sees them: players never get hidden ones or foreign HP. */
export async function fetchSceneTokensFor(
  prisma: PrismaClient,
  sceneId: string,
  user: SessionUser,
): Promise<TokenView[]> {
  const isGm = user.role === ROLE_GM;
  const rows = await prisma.token.findMany({
    where: { sceneId, ...(isGm ? {} : { hidden: false }) },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => toTokenView(row, isGm || row.ownerId === user.id));
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
 * Emits a token upsert to everyone who may see the token.
 *
 * Active scene, visible token: a sequenced campaign-wide broadcast carries the
 * public view (no HP), then targeted no-seq emissions deliver the full view to
 * the GM and the HP-bearing view to the owner. Hidden tokens go to the GM room
 * only; tokens on non-active scenes go to that scene's viewers (GM previews).
 */
async function emitTokenUpsert(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
): Promise<void> {
  const gmPayload: TokenUpsertBroadcast = { token: toTokenView(token, true) };

  if (!scene.active) {
    deps.io.to(sceneRoom(scene.id)).emit('token:upsert', gmPayload);
    return;
  }
  if (token.hidden) {
    deps.io.to(gmRoom(campaignId)).emit('token:upsert', gmPayload);
    return;
  }

  const room = campaignRoom(campaignId);
  const publicPayload: TokenUpsertBroadcast = {
    seq: deps.seqs.next(room),
    token: toTokenView(token, false),
  };
  deps.io.to(room).emit('token:upsert', publicPayload);
  deps.io.to(gmRoom(campaignId)).emit('token:upsert', gmPayload);
  if (token.ownerId) {
    await emitToCampaignUser(deps.io, campaignId, token.ownerId, 'token:upsert', {
      token: toTokenView(token, true),
    } satisfies TokenUpsertBroadcast);
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
        hidden: payload.hidden === true,
        hpCurrent: hp?.current ?? null,
        hpMax: hp?.max ?? null,
      },
    });
    await emitTokenUpsert(deps, campaignId, scene, token);
    return toTokenView(token, true);
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

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.hidden !== undefined) data.hidden = patch.hidden;
    if (patch.statuses !== undefined) data.statuses = JSON.stringify(patch.statuses);
    if (patch.hp !== undefined) {
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
        token: toTokenView(updated, true),
      } satisfies TokenUpsertBroadcast);
      if (!scene.active) {
        deps.io.to(sceneRoom(scene.id)).emit('token:upsert', {
          token: toTokenView(updated, true),
        } satisfies TokenUpsertBroadcast);
      }
    } else {
      await emitTokenUpsert(deps, campaignId, scene, updated);
    }
    return toTokenView(updated, true);
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
