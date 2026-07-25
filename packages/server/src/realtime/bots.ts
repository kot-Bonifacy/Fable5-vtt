import type {
  BotCreatePayload,
  BotDeleteBroadcast,
  BotIdPayload,
  BotUpdatePayload,
  BotUpsertBroadcast,
  BotView,
} from '@vtt/shared';
import {
  ROLE_GM,
  createDefaultBotData,
  mergeBotData,
  parseBotData,
  sanitizeBotName,
  sanitizeTokenImageUrl,
  validateBotDataPatch,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { BotProfile } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { getRoster } from './chat-io.js';
import { gmRoom } from './state.js';

/**
 * Bot profile CRUD. Profiles hold secrets, GM notes and the prompt itself, so
 * every emission goes to the GM room only — players never see that a bot
 * exists (in stage 11 they will only see its chat messages).
 *
 * Editing a profile takes effect on the bot's very next line: the prompt is
 * compiled from the stored profile at generation time, nothing is cached.
 */

export function toBotView(bot: BotProfile): BotView {
  return {
    id: bot.id,
    name: bot.name,
    portraitUrl: bot.portraitUrl,
    characterId: bot.characterId,
    active: bot.active,
    sceneId: bot.sceneId,
    archived: bot.archived,
    data: parseBotData(bot.data),
    updatedAt: bot.updatedAt.toISOString(),
  };
}

/** Bots visible to this socket: everything for the GM, nothing for players. */
export async function fetchBotsFor(
  prisma: PrismaClient,
  campaignId: string,
  isGm: boolean,
): Promise<BotView[]> {
  if (!isGm) return [];
  const bots = await prisma.botProfile.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });
  return bots.map(toBotView);
}

export function emitBotUpsert(deps: RealtimeDeps, campaignId: string, bot: BotView): void {
  deps.io.to(gmRoom(campaignId)).emit('bot:upsert', { bot } satisfies BotUpsertBroadcast);
}

export function emitBotDelete(deps: RealtimeDeps, campaignId: string, botId: string): void {
  deps.io.to(gmRoom(campaignId)).emit('bot:delete', { botId } satisfies BotDeleteBroadcast);
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export async function requireCampaignBot(
  prisma: PrismaClient,
  campaignId: string,
  botId: unknown,
): Promise<BotProfile> {
  if (typeof botId !== 'string' || botId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const bot = await prisma.botProfile.findUnique({ where: { id: botId } });
  if (!bot || bot.campaignId !== campaignId) throw new RealtimeError('BOT_NOT_FOUND');
  return bot;
}

/**
 * Names at the table must be unique. A bot sharing a name with a player (or
 * with another bot) makes `/w Vex` ambiguous and lets the bot answer lines
 * meant for the human — found while testing stage 11 on live data.
 */
async function requireFreeBotName(
  prisma: PrismaClient,
  campaignId: string,
  name: string,
  selfId?: string,
): Promise<void> {
  const wanted = name.toLowerCase();
  const [roster, bots] = await Promise.all([
    getRoster(prisma, campaignId),
    prisma.botProfile.findMany({ where: { campaignId }, select: { id: true, name: true } }),
  ]);
  const taken =
    roster.some((entry) => entry.name.toLowerCase() === wanted) ||
    // SQLite has no case-insensitive `equals` in Prisma — compare in JS.
    bots.some((bot) => bot.id !== selfId && bot.name.toLowerCase() === wanted);
  if (taken) throw new RealtimeError('NAME_TAKEN');
}

/** First free „<name> (kopia)", „<name> (kopia 2)"… for a duplicated profile. */
async function freeCopyName(
  prisma: PrismaClient,
  campaignId: string,
  baseName: string,
): Promise<string> {
  for (let index = 1; index < 20; index += 1) {
    const candidate = sanitizeBotName(
      `${baseName} (kopia${index > 1 ? ` ${index}` : ''})`.slice(0, 48),
    );
    if (!candidate) break;
    try {
      await requireFreeBotName(prisma, campaignId, candidate);
      return candidate;
    } catch {
      // taken — try the next number
    }
  }
  return `${baseName.slice(0, 40)} ${Date.now().toString(36).slice(-4)}`;
}

/** The scene a bot is pinned to must belong to the same campaign. */
async function requireCampaignScene(
  prisma: PrismaClient,
  campaignId: string,
  sceneId: string | null | undefined,
): Promise<void> {
  if (!sceneId) return;
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) throw new RealtimeError('SCENE_NOT_FOUND');
}

/** A linked sheet (companion bots) must belong to the same campaign. */
async function requireCampaignCharacter(
  prisma: PrismaClient,
  campaignId: string,
  characterId: string | null | undefined,
): Promise<void> {
  if (!characterId) return;
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
}

export const botCreateEvent = defineEvent<BotCreatePayload, BotView>({
  name: 'bot:create',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const name = sanitizeBotName(payload?.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');
    await requireFreeBotName(deps.ctx.prisma, campaignId, name);

    // „New bot from a template" arrives as a full profile body.
    const template = payload?.data ?? {};
    const type = typeof template.type === 'string' ? template.type : 'npc';
    const result = validateBotDataPatch(template, 'npc');
    if (!result.ok) throw new RealtimeError('INVALID_DATA');
    const data = mergeBotData(createDefaultBotData(result.patch.type ?? 'npc'), result.patch);

    const bot = await deps.ctx.prisma.botProfile.create({
      data: { campaignId, name, data: JSON.stringify(data) },
    });
    deps.log.info({ botId: bot.id, type }, 'bot profile created');
    const view = toBotView(bot);
    emitBotUpsert(deps, campaignId, view);
    return view;
  },
});

export const botUpdateEvent = defineEvent<BotUpdatePayload, BotView>({
  name: 'bot:update',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const bot = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const data: Record<string, unknown> = {};
    if ('name' in patch) {
      const name = sanitizeBotName(patch.name);
      if (name === null) throw new RealtimeError('INVALID_NAME');
      await requireFreeBotName(deps.ctx.prisma, campaignId, name, bot.id);
      data.name = name;
    }
    if ('portraitUrl' in patch) {
      const portraitUrl = sanitizeTokenImageUrl(patch.portraitUrl ?? null);
      if (portraitUrl === undefined) throw new RealtimeError('BAD_REQUEST');
      data.portraitUrl = portraitUrl;
    }
    if ('characterId' in patch) {
      if (patch.characterId !== null && typeof patch.characterId !== 'string') {
        throw new RealtimeError('BAD_REQUEST');
      }
      await requireCampaignCharacter(deps.ctx.prisma, campaignId, patch.characterId);
      data.characterId = patch.characterId;
    }
    if ('sceneId' in patch) {
      if (patch.sceneId !== null && typeof patch.sceneId !== 'string') {
        throw new RealtimeError('BAD_REQUEST');
      }
      await requireCampaignScene(deps.ctx.prisma, campaignId, patch.sceneId);
      data.sceneId = patch.sceneId;
    }
    for (const flag of ['active', 'archived'] as const) {
      if (flag in patch) {
        if (typeof patch[flag] !== 'boolean') throw new RealtimeError('BAD_REQUEST');
        data[flag] = patch[flag];
      }
    }
    if ('data' in patch) {
      const current = parseBotData(bot.data);
      const result = validateBotDataPatch(patch.data, current.type);
      if (!result.ok) throw new RealtimeError('INVALID_DATA');
      data.data = JSON.stringify(mergeBotData(current, result.patch));
    }

    const updated = await deps.ctx.prisma.botProfile.update({ where: { id: bot.id }, data });
    const view = toBotView(updated);
    emitBotUpsert(deps, campaignId, view);
    return view;
  },
});

export const botDeleteEvent = defineEvent<BotIdPayload>({
  name: 'bot:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const bot = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    await deps.ctx.prisma.botProfile.delete({ where: { id: bot.id } });
    emitBotDelete(deps, campaignId, bot.id);
  },
});

/** Copies a profile (lessons included) — the fastest way to a sibling NPC. */
export const botDuplicateEvent = defineEvent<BotIdPayload, BotView>({
  name: 'bot:duplicate',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const source = await requireCampaignBot(deps.ctx.prisma, campaignId, payload?.botId);
    const name = await freeCopyName(deps.ctx.prisma, campaignId, source.name);
    const copy = await deps.ctx.prisma.botProfile.create({
      data: {
        campaignId,
        name,
        portraitUrl: source.portraitUrl,
        data: source.data,
        // A copy never inherits „active" — the GM decides when it joins.
        active: false,
      },
    });
    const view = toBotView(copy);
    emitBotUpsert(deps, campaignId, view);
    return view;
  },
});
