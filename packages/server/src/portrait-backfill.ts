import { basename, extname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import { imageSize } from 'image-size';
import { PORTRAIT_NAME_MAX_LENGTH } from '@vtt/shared';
import type { PrismaClient } from './db.js';

/**
 * Wciąga do puli portrety wgrane przed 12.09 (jednorazowe uzupełnienie).
 *
 * Do 12.09 portret dało się wgrać dwiema drogami: przez pulę kampanii, która
 * zakładała wiersz w bazie, i wprost na kartę — trasą `/api/uploads/portraits`,
 * która kładła sam plik. Druga droga zniknęła, bo portret bez wiersza nie ma
 * gdzie trzymać **kadru na mapie**. Zostały jednak karty i boty, które taki
 * plik noszą — i bez tego uzupełnienia przycisk „Kadr na mapie" byłby przy nich
 * wyszarzony na zawsze, czyli funkcja nie działałaby dokładnie dla tych postaci,
 * które przy stole naprawdę grają.
 *
 * Bierze każdy adres portretu z kart i z botów, którego nie zna żadny wiersz
 * puli, odczytuje wymiary z pliku i zakłada wpis z kadrem domyślnym — czyli
 * z tym ujęciem, które mapa rysowała do tej pory. Nic nie znika i nic się nie
 * przesuwa; przybywa wyłącznie możliwość kadrowania.
 *
 * Idempotentne: po pierwszym przejściu każdy adres ma już swój wiersz, więc
 * kolejne starty kończą się na dwóch zapytaniach.
 */
export async function backfillPortraitAssets(
  prisma: PrismaClient,
  uploadsDir: string,
  log: FastifyBaseLogger,
): Promise<number> {
  const campaigns = await prisma.campaign.findMany({ select: { id: true } });
  let added = 0;

  for (const campaign of campaigns) {
    const [characters, bots, assets] = await Promise.all([
      prisma.character.findMany({
        where: { campaignId: campaign.id, portraitUrl: { not: null } },
        select: { portraitUrl: true },
      }),
      prisma.botProfile.findMany({
        where: { campaignId: campaign.id, portraitUrl: { not: null } },
        select: { portraitUrl: true },
      }),
      prisma.portraitAsset.findMany({
        where: { campaignId: campaign.id },
        select: { url: true },
      }),
    ]);

    const known = new Set(assets.map((a) => a.url));
    const missing = new Set<string>();
    for (const row of [...characters, ...bots]) {
      const url = row.portraitUrl;
      // Tylko własne uploady: portret wskazany na `/public/` albo z zewnątrz
      // nie jest plikiem, którym pula zarządza.
      if (!url || known.has(url) || !url.startsWith('/uploads/portraits/')) continue;
      missing.add(url);
    }

    for (const url of missing) {
      const file = join(uploadsDir, 'portraits', basename(url));
      let width: number;
      let height: number;
      try {
        ({ width, height } = imageSize(await readFile(file)));
      } catch {
        // Plik zniknął albo nie da się go odczytać — karta zostaje z adresem,
        // który i tak nie ma czego pokazać; wiersz bez wymiarów byłby gorszy
        // od jego braku, bo kadr liczy się z boków obrazu.
        continue;
      }
      const stem = basename(url, extname(url));
      await prisma.portraitAsset.create({
        data: {
          campaignId: campaign.id,
          // Nazwa pliku jest losowa (`randomBytes`), więc jako podpis w puli
          // nadaje się tylko na doraźny — MG i tak pozna portret po obrazku.
          name: `Portret ${stem}`.slice(0, PORTRAIT_NAME_MAX_LENGTH),
          url,
          width,
          height,
        },
      });
      added += 1;
    }
  }

  if (added > 0) log.info({ added }, 'backfilled portrait assets into the campaign pool');
  return added;
}

/** Jak sprzątanie uploadów: w tle, bo start stołu nie ma na co czekać. */
export function backfillPortraitAssetsInBackground(
  prisma: PrismaClient,
  uploadsDir: string,
  log: FastifyBaseLogger,
): void {
  void backfillPortraitAssets(prisma, uploadsDir, log).catch((error: unknown) => {
    log.error({ err: error }, 'portrait pool backfill failed');
  });
}
