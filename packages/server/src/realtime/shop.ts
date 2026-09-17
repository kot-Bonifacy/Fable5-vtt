import type {
  ShopEntryTierBroadcast,
  ShopEntryTierPayload,
  ShopTier,
  ShopTierBroadcast,
  ShopTierPayload,
} from '@vtt/shared';
import {
  ROLE_GM,
  SHOP_TIER_MIN,
  clampShopTier,
  isShopTier,
  readShopTierOverrides,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { campaignEntry } from './compendium.js';
import { RealtimeError, defineEvent } from './registry.js';
import { campaignRoom } from './state.js';

/**
 * The campaign's shop tier (stage 25c).
 *
 * One number on the campaign and one dial for the GM: how far down the
 * catalogue the table may currently shop. It is the GM's pacing tool, not a
 * rule — which is why it lives on `Campaign` and never touches a sheet.
 *
 * Raising it has to reach every player *immediately* (a shop that opens up
 * only after a reload is a shop the table argues about), so the change is a
 * room broadcast and the tier rides in `state:sync` for anyone joining late.
 */

export async function campaignShopTier(
  prisma: PrismaClient,
  campaignId: string | null,
): Promise<ShopTier> {
  if (!campaignId) return SHOP_TIER_MIN;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { shopTier: true },
  });
  // A row written before this stage — or by hand — still has to yield a usable
  // tier; the shop must never refuse everything because of a stray number.
  return clampShopTier(campaign?.shopTier);
}

/**
 * The GM's per-entry availability choices (naprawa 3b). Read on every purchase
 * rather than cached: one small JSON column, and a cache would be one more thing
 * to invalidate when the GM clicks.
 */
export async function campaignShopTierOverrides(
  prisma: PrismaClient,
  campaignId: string | null,
): Promise<Record<string, ShopTier>> {
  if (!campaignId) return {};
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { shopTierOverrides: true },
  });
  return readShopTierOverrides(campaign?.shopTierOverrides);
}

/**
 * GM moves one entry to a tier for this campaign, or back to automatic.
 *
 * The one place the GM changes where an *imported* entry sits: the files are
 * never written from the UI, and a campaign copy of the entry would shadow the
 * row sheets already point at. Same broadcast shape as `shop:tier`, so a player
 * browsing the list sees the row lock or open mid-sentence.
 */
export const shopEntryTierEvent = defineEvent<
  ShopEntryTierPayload,
  { entryId: string; tier: ShopTier | null }
>({
  name: 'shop:entry-tier',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const entryId = payload?.entryId;
    const tier = payload?.tier;
    if (typeof entryId !== 'string' || entryId.length === 0) throw new RealtimeError('BAD_REQUEST');
    if (tier !== null && !isShopTier(tier)) throw new RealtimeError('BAD_REQUEST');
    if (!(await campaignEntry(deps, campaign.id, entryId))) {
      throw new RealtimeError('ENTRY_NOT_FOUND');
    }

    // Read, change and write in one transaction: two quick clicks on two rows
    // must not leave only the second choice standing.
    await deps.ctx.prisma.$transaction(async (tx) => {
      const row = await tx.campaign.findUnique({
        where: { id: campaign.id },
        select: { shopTierOverrides: true },
      });
      const overrides = readShopTierOverrides(row?.shopTierOverrides);
      if (tier === null) delete overrides[entryId];
      else overrides[entryId] = tier;
      await tx.campaign.update({
        where: { id: campaign.id },
        data: { shopTierOverrides: JSON.stringify(overrides) },
      });
    });

    const room = campaignRoom(campaign.id);
    const broadcast: ShopEntryTierBroadcast = { seq: deps.seqs.next(room), entryId, tier };
    deps.io.to(room).emit('shop:entry-tier', broadcast);
    return { entryId, tier };
  },
});

export const shopTierEvent = defineEvent<ShopTierPayload, { tier: ShopTier }>({
  name: 'shop:tier',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const tier = payload?.tier;
    // Clamping a client's number would hide a bug behind a working slider.
    if (!isShopTier(tier)) throw new RealtimeError('BAD_REQUEST');

    await deps.ctx.prisma.campaign.update({
      where: { id: campaign.id },
      data: { shopTier: tier },
    });

    const room = campaignRoom(campaign.id);
    const broadcast: ShopTierBroadcast = { seq: deps.seqs.next(room), tier };
    deps.io.to(room).emit('shop:tier', broadcast);
    return { tier };
  },
});

/**
 * Refuses a purchase the campaign has not unlocked yet.
 *
 * Both numbers travel in the code so the client can say *which* level the item
 * sits on and *which* one the campaign is at — „nie stać cię" would be a lie
 * and „nie wolno" would send the player to ask the GM without knowing what for.
 */
export function requireUnlockedTier(entryTier: ShopTier, unlocked: ShopTier): void {
  if (entryTier > unlocked) throw new RealtimeError(`SHOP_TIER_LOCKED:${entryTier}:${unlocked}`);
}
