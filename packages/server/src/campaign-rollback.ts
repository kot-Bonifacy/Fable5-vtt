import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveFile, CampaignRollbackResult } from '@vtt/shared';
import type { AppContext } from './context.js';
import { exportCampaign } from './archive.js';
import { importCampaign, newRowId } from './archive-campaign.js';
import { buildPackage, placeStagedFiles, rewriteUploadUrls } from './archive-package.js';
import { localizeArchiveUploads } from './campaign-uploads.js';
import { linkOrCopy, type CampaignCopies } from './campaign-copies.js';
import { ownCampaign } from './routes/helpers.js';

/**
 * Cofnięcie kampanii do automatycznej kopii (etap 57b, decyzje MG 6–8).
 *
 * **Zamiana miejscami.** Kampania zachowuje tożsamość — id, graczy,
 * zaproszenia, czat, dziennik sesji i własną listę kopii — a jej zawartość
 * gry wymienia się na tę z kopii. Dotychczasowa zawartość nie ginie: wyjeżdża
 * do nowej kampanii „<nazwa> (przed cofnięciem DD.MM)” bez graczy, do
 * obejrzenia i ręcznego usunięcia.
 *
 * Kolejność (każdy krok sam w sobie jest drogą z 57a):
 *  1. kopia bezpieczeństwa stanu bieżącego (`rollback`, na liście kopii —
 *     cofnięcie da się więc cofnąć);
 *  2. bieżąca zawartość → nowa kampania (`exportCampaign` → `importCampaign`
 *     jak plik wymiany; grafiki dowiązane do jej katalogu);
 *  3. kopia → ta sama kampania (`importCampaign` w trybie `replace`: jedna
 *     transakcja, te same id, czat dalej wskazuje swoje sceny i boty).
 *
 * Gdy krok 3 padnie, kampania zostaje, jak była (transakcja), a kampania
 * „przed cofnięciem” jest sprzątana — nie zostaje po nieudanej próbie
 * duplikat. Sesja nie może trwać (decyzja 8) — sprawdza to wołający razem
 * z potwierdzeniem nazwą.
 */

export type RollbackRefusal = { code: 'NOT_FOUND' | 'SESSION_ACTIVE' | 'CAMPAIGN_NOT_FOUND' };

const MAX_CAMPAIGN_NAME_LENGTH = 64;

/** „Noc w Watsonie (przed cofnięciem 22.10)” — z godziną, gdy ta nazwa już jest. */
async function previousName(
  ctx: AppContext,
  gmId: string,
  base: string,
  now: Date,
): Promise<string> {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const candidates = [
    ` (przed cofnięciem ${day})`,
    ` (przed cofnięciem ${day} ${time})`,
    ...Array.from({ length: 8 }, (_, n) => ` (przed cofnięciem ${day} ${time} #${n + 2})`),
  ];
  for (const suffix of candidates) {
    const name = `${base.slice(0, MAX_CAMPAIGN_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
    if ((await ctx.prisma.campaign.count({ where: { gmId, name } })) === 0) return name;
  }
  return `${base.slice(0, 40).trimEnd()} (przed cofnięciem ${newRowId().slice(-6)})`;
}

/** Plik położony dowiązaniem (pliki kopii i uploadów są niezmienne). */
async function linkFile(from: string, to: string): Promise<void> {
  if (!(await linkOrCopy(from, to))) throw new Error(`file vanished: ${from}`);
}

export async function rollbackCampaign(
  ctx: AppContext,
  copies: CampaignCopies,
  options: { campaignId: string; gmId: string; copyName: string; now?: Date },
): Promise<CampaignRollbackResult | RollbackRefusal> {
  const { campaignId, gmId } = options;
  const now = options.now ?? new Date();
  const uploadsDir = ctx.config.uploadsDir;
  const campaign = await ctx.prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { code: 'CAMPAIGN_NOT_FOUND' };
  if (campaign.sessionStartedAt) return { code: 'SESSION_ACTIVE' };
  const copy = await copies.read(campaignId, options.copyName);
  const summary = (await copies.list(campaignId)).find((row) => row.name === options.copyName);
  if (!copy || !summary) return { code: 'NOT_FOUND' };

  const canRead = async (sourceId: string) =>
    (await ownCampaign(ctx.prisma, sourceId, gmId)) !== null;
  /** Grafiki pliku do katalogu kampanii `targetId`, adresy przepisane jak przy wczytaniu. */
  const localize = async (
    file: ArchiveFile<unknown>,
    staged: Map<string, string>,
    targetId: string,
  ): Promise<unknown> => {
    const placed = await placeStagedFiles(staged, uploadsDir, targetId, linkFile);
    return localizeArchiveUploads(rewriteUploadUrls(file, placed), {
      uploadsDir,
      campaignId: targetId,
      canRead,
    });
  };

  // 1. Kopia bezpieczeństwa — rzuca, a bez niej cofnięcia nie ma.
  const safety = await copies.takeNow(campaignId, 'rollback', null, now.getTime());

  // 2. Bieżąca zawartość → kampania „przed cofnięciem”.
  const current = await exportCampaign(ctx.prisma, campaignId, { includeChat: false });
  if (!current) return { code: 'CAMPAIGN_NOT_FOUND' };
  const previousId = newRowId();
  const name = await previousName(ctx, gmId, campaign.name, now);
  const dropPrevious = async () => {
    await ctx.prisma.campaign.deleteMany({ where: { id: previousId } });
    await rm(join(uploadsDir, 'campaigns', previousId), { recursive: true, force: true });
  };
  try {
    const { manifest, files } = await buildPackage(uploadsDir, current);
    const diskOf = new Map(files.map((entry) => [entry.path, entry.disk] as const));
    const staged = new Map<string, string>();
    for (const entry of manifest.entries) {
      const disk = diskOf.get(entry.path);
      if (disk) staged.set(entry.url, disk);
    }
    const before = await importCampaign(
      ctx.prisma,
      ctx.cpred,
      await localize(current, staged, previousId),
      { campaignId: previousId, gmId, name },
    );
    if ('code' in before) throw new Error(`previous content refused: ${before.code}`);
  } catch (error) {
    await dropPrevious();
    throw error;
  }

  // 3. Kopia → ta sama kampania, pod tymi samymi id.
  let restored: Awaited<ReturnType<typeof importCampaign>>;
  try {
    restored = await importCampaign(
      ctx.prisma,
      ctx.cpred,
      await localize(copy.file, copy.files, campaignId),
      { campaignId, gmId, name: campaign.name, mode: 'replace' },
    );
  } catch (error) {
    await dropPrevious();
    throw error;
  }
  if ('code' in restored) {
    await dropPrevious();
    throw new Error(`copy ${options.copyName} refused: ${restored.code}`);
  }

  return {
    copy: summary,
    previous: { id: previousId, name },
    safetyCopy: safety.name,
    pendingPlayers: restored.pendingPlayers,
  };
}
