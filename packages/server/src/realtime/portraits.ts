import type { PortraitAssetView, PortraitCropBroadcast, PortraitCropPayload } from '@vtt/shared';
import { ROLE_GM, sanitizePortraitCrop } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { draftPortraitUrl, toPortraitAssetView, usedPortraitUrls } from '../portraits.js';
import { RealtimeError, defineEvent } from './registry.js';
import { campaignRoom } from './state.js';

/**
 * Kadr portretu na mapie (12.09) — jedyna rzecz, którą da się zmienić
 * w wierszu puli po wgraniu pliku.
 *
 * Gniazdo, a nie `PATCH` obok pozostałych tras puli, i to jest wybór: kadr jest
 * cechą **obrazka**, więc jego zmiana przestawia od razu każdą figurę, która ten
 * plik nosi — u wszystkich naraz. Trasa REST umiałaby go zapisać, ale nie
 * umiałaby o tym nikomu powiedzieć (`routes/` nie ma dostępu do `io`), i gracz
 * oglądałby stare ujęcie do przeładowania strony.
 *
 * Rozgłaszany jest **cały wiersz**, nie sam kadr: klient, który tego portretu
 * jeszcze nie zna (wgrany po jego zalogowaniu), uczy się go przy okazji zamiast
 * odpytywać listę.
 *
 * **Kto wolno kadruje (decyzja MG z 12.09).** Portret wybiera się raz, przy
 * tworzeniu postaci, i w trakcie rozgrywki gracz już go nie zmienia — ale kadr
 * na mapie zmienić może, bo to jego figura stoi na stole. Stąd zdarzenie **nie**
 * stoi na `role: ROLE_GM`: MG kadruje wszystko, a gracz ten jeden portret,
 * który nosi jego własna postać. Sprawdza to serwer, nie przycisk.
 */
export const portraitCropEvent = defineEvent<PortraitCropPayload, PortraitAssetView>({
  name: 'portrait:crop',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const assetId = payload?.assetId;
    if (typeof assetId !== 'string' || assetId.length === 0) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const asset = await deps.ctx.prisma.portraitAsset.findUnique({ where: { id: assetId } });
    // „Nie ma takiego" i „jest, ale w cudzej kampanii" odpowiadają tak samo:
    // istnienie cudzego wiersza też jest informacją.
    if (!asset || asset.campaignId !== campaign.id) throw new RealtimeError('NOT_FOUND');
    if (
      user.role !== ROLE_GM &&
      !(await ownsPortrait(deps.ctx.prisma, campaign.id, user.id, asset.url))
    ) {
      throw new RealtimeError('FORBIDDEN');
    }

    // Granice liczy się z wymiarów **tego** obrazu, więc odpowiedź na „czy ten
    // kadr pokrywa krążek" nie zależy od tego, w co wierzy klient.
    const crop = sanitizePortraitCrop(payload?.crop, {
      width: asset.width,
      height: asset.height,
    });
    if (!crop) throw new RealtimeError('BAD_REQUEST');

    const saved = await deps.ctx.prisma.portraitAsset.update({
      where: { id: asset.id },
      data: { cropX: crop.x, cropY: crop.y, cropZoom: crop.zoom },
    });
    const view = toPortraitAssetView(saved);

    const room = campaignRoom(campaign.id);
    const broadcast: PortraitCropBroadcast = { seq: deps.seqs.next(room), asset: view };
    deps.io.to(room).emit('portrait:crop', broadcast);
    return view;
  },
});

/**
 * Czy ten gracz nosi ten portret na własnej karcie lub zarezerwował go w szkicu.
 *
 * Pytanie idzie o **adres pliku**, a nie o wiersz puli, bo kadr jest cechą
 * obrazka: karta trzyma sam adres i nic o bibliotece nie wie.
 *
 * Skutek uboczny, świadomy: gdyby dwie postacie miały ten sam plik portretu,
 * kadr poprawiony przez jedną zmienia ujęcie obu. Kreator blokuje taki wybór
 * graczom; stare przypisania i świadome powtórzenia MG pozostają wspólne.
 */
async function ownsPortrait(
  prisma: PrismaClient,
  campaignId: string,
  userId: string,
  url: string,
): Promise<boolean> {
  const mine = await prisma.character.findFirst({
    where: { campaignId, ownerId: userId, portraitUrl: url },
    select: { id: true },
  });
  if (mine) return true;
  const draft = await prisma.characterDraft.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  return (
    !!draft &&
    draftPortraitUrl(draft.data) === url &&
    !(await usedPortraitUrls(prisma, campaignId, userId)).has(url)
  );
}
