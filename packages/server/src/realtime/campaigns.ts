import type { CampaignSummary, SessionUser } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { getUserActiveCampaign } from '../routes/helpers.js';

/**
 * The campaign a user's socket belongs to: the GM's open campaign, a player's
 * own (stage 44c). Whether the socket sits at its table — or waits between
 * sessions — is `seatSocket`'s call in `sessions.ts`.
 */
export async function resolveSocketCampaign(
  prisma: PrismaClient,
  user: SessionUser,
): Promise<CampaignSummary | null> {
  return getUserActiveCampaign(prisma, user);
}
