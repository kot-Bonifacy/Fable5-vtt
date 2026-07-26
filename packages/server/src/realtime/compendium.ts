import type {
  CompendiumDeleteBroadcast,
  CompendiumEntry,
  CompendiumIdPayload,
  CompendiumSyncPayload,
  CompendiumUpsertBroadcast,
  CompendiumUpsertPayload,
} from '@vtt/shared';
import { ROLE_GM, slugify, validateCompendiumEntry } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';

/**
 * The compendium is shared, read-only reference data: everyone at the table
 * sees the same catalogue, so nothing here is filtered per role. Only the GM
 * may write, and only into the campaign's own entries — imported rulebook
 * files on disk are never modified from the UI.
 */

interface StoredEntryRow {
  slug: string;
  data: string;
}

function parseStoredEntry(row: StoredEntryRow): CompendiumEntry | null {
  try {
    const result = validateCompendiumEntry(JSON.parse(row.data));
    return result.ok ? { ...result.entry, custom: true } : null;
  } catch {
    return null;
  }
}

/** Campaign entries typed in by the GM, newest schema-valid rows only. */
export async function fetchCustomEntries(
  prisma: PrismaClient,
  campaignId: string,
): Promise<CompendiumEntry[]> {
  const rows = await prisma.compendiumEntry.findMany({
    where: { campaignId },
    select: { slug: true, data: true },
  });
  return rows.map(parseStoredEntry).filter((entry): entry is CompendiumEntry => entry !== null);
}

/** File data plus the campaign's own entries; custom entries win on id. */
export async function buildCompendiumSync(
  deps: RealtimeDeps,
  campaignId: string | null,
): Promise<CompendiumSyncPayload> {
  const { compendium } = deps.ctx;
  if (!campaignId) {
    return { weaponTypes: compendium.weaponTypes, entries: compendium.entries };
  }
  const custom = await fetchCustomEntries(deps.ctx.prisma, campaignId);
  const byId = new Map(compendium.entries.map((entry) => [entry.id, entry]));
  for (const entry of custom) byId.set(entry.id, entry);
  const collator = new Intl.Collator('pl');
  return {
    weaponTypes: compendium.weaponTypes,
    entries: [...byId.values()].sort((a, b) => collator.compare(a.name, b.name)),
  };
}

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

export const compendiumUpsertEvent = defineEvent<CompendiumUpsertPayload, CompendiumEntry>({
  name: 'compendium:upsert',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const raw = payload?.entry;
    if (typeof raw !== 'object' || raw === null) throw new RealtimeError('BAD_REQUEST');

    // The id is derived from the name for new entries; editing keeps the slug
    // so character sheets that reference it do not break.
    const category = (raw as { category?: string }).category ?? '';
    const name = (raw as { name?: string }).name ?? '';
    const existingId = (raw as { id?: string }).id;
    const id = existingId && existingId.length > 0 ? existingId : `${category}.${slugify(name)}`;

    const result = validateCompendiumEntry({ ...raw, id, custom: true });
    if (!result.ok) throw new RealtimeError(`INVALID_ENTRY:${result.issues[0]?.message ?? ''}`);
    const entry = result.entry;

    // A GM entry must not shadow an imported one — otherwise the catalogue
    // would silently change meaning for a slug used on existing sheets.
    if (!existingId && deps.ctx.compendium.entryById.has(entry.id)) {
      throw new RealtimeError('ID_TAKEN');
    }

    await deps.ctx.prisma.compendiumEntry.upsert({
      where: { campaignId_slug: { campaignId, slug: entry.id } },
      create: {
        campaignId,
        slug: entry.id,
        category: entry.category,
        data: JSON.stringify(entry),
      },
      update: { category: entry.category, data: JSON.stringify(entry) },
    });

    const room = campaignRoom(campaignId);
    const broadcast: CompendiumUpsertBroadcast = { seq: deps.seqs.next(room), entry };
    deps.io.to(room).emit('compendium:upsert', broadcast);
    return entry;
  },
});

export const compendiumDeleteEvent = defineEvent<CompendiumIdPayload, void>({
  name: 'compendium:delete',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const id = payload?.id;
    if (typeof id !== 'string' || id.length === 0) throw new RealtimeError('BAD_REQUEST');

    const deleted = await deps.ctx.prisma.compendiumEntry.deleteMany({
      where: { campaignId, slug: id },
    });
    if (deleted.count === 0) throw new RealtimeError('ENTRY_NOT_FOUND');

    const room = campaignRoom(campaignId);
    const broadcast: CompendiumDeleteBroadcast = { seq: deps.seqs.next(room), id };
    deps.io.to(room).emit('compendium:delete', broadcast);
  },
});
