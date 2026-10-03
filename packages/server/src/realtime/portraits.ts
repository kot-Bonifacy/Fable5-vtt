import type {
  PortraitAssetView,
  PortraitCropBroadcast,
  PortraitCropPayload,
  PortraitVisibilityPayload,
  PortraitWantedRow,
} from '@vtt/shared';
import { ROLE_GM, sanitizePortraitBannerCrop, sanitizePortraitCrop } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import {
  addPortraitWanted,
  clearPortraitWanted,
  draftPortraitUrl,
  hasFreePlayerPortrait,
  playerPortraitView,
  portraitWantedRows,
  toPortraitAssetView,
  usedPortraitUrls,
} from '../portraits.js';
import type { RealtimeDeps } from './registry.js';
import { RealtimeError, defineEvent } from './registry.js';
import { campaignRoom, gmRoom } from './state.js';

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
    const size = { width: asset.width, height: asset.height };
    const crop = sanitizePortraitCrop(payload?.crop, size);
    if (!crop) throw new RealtimeError('BAD_REQUEST');
    // Kadr banera (25.09): brak pola — bez zmian, `null` — z powrotem „jak
    // żeton”, cokolwiek innego musi być kadrem. Te same prawa co do żetonu:
    // właściciel kadruje oba wystąpienia swojego portretu.
    const rawBanner = payload?.bannerCrop;
    let banner: {
      bannerX: number | null;
      bannerY: number | null;
      bannerZoom: number | null;
    } | null = null;
    if (rawBanner === null) {
      banner = { bannerX: null, bannerY: null, bannerZoom: null };
    } else if (rawBanner !== undefined) {
      const parsed = sanitizePortraitBannerCrop(rawBanner, size);
      if (!parsed) throw new RealtimeError('BAD_REQUEST');
      banner = { bannerX: parsed.x, bannerY: parsed.y, bannerZoom: parsed.zoom };
    }

    const saved = await deps.ctx.prisma.portraitAsset.update({
      where: { id: asset.id },
      data: { cropX: crop.x, cropY: crop.y, cropZoom: crop.zoom, ...(banner ?? {}) },
    });
    const view = toPortraitAssetView(saved);
    await emitPortraitAsset(deps, campaign.id, 'portrait:crop', view);
    return view;
  },
});

/**
 * MG przenosi portret między pulą graczy a portretami NPC (23.09).
 *
 * Gniazdo z tego samego powodu co kadr: przestawienie zmienia to, co gracze
 * mają w pamięci — portret przeniesiony do NPC-ów ma im zniknąć z galerii od
 * razu, a nie przy przeładowaniu.
 */
export const portraitVisibilityEvent = defineEvent<PortraitVisibilityPayload, PortraitAssetView>({
  name: 'portrait:visibility',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const assetId = payload?.assetId;
    if (
      typeof assetId !== 'string' ||
      assetId.length === 0 ||
      typeof payload.gmOnly !== 'boolean'
    ) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const asset = await deps.ctx.prisma.portraitAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.campaignId !== campaign.id) throw new RealtimeError('NOT_FOUND');
    const saved = await deps.ctx.prisma.portraitAsset.update({
      where: { id: asset.id },
      data: { gmOnly: payload.gmOnly },
    });
    const view = toPortraitAssetView(saved);
    await emitPortraitAsset(deps, campaign.id, 'portrait:visibility', view);
    // Portret przeniesiony do graczy to nowa twarz do wyboru — prośby o portret
    // są od tej chwili spełnione (#68).
    if (!saved.gmOnly && clearPortraitWanted(campaign.id)) emitPortraitWanted(deps, campaign.id);
    return view;
  },
});

/**
 * „Poproś MG o portret" (#68, 03.10.2026): gracz, któremu pula nie zostawiła
 * wolnej twarzy, staje na liście „Czeka na MG". Odmowa, gdy wolny portret
 * jest — wtedy gracz ma wybór i prośba byłaby fałszywym alarmem.
 */
export const portraitWantEvent = defineEvent<void, PortraitWantedRow[]>({
  name: 'portrait:want',
  handler: async ({ deps, socket, user }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    if (user.role === ROLE_GM) throw new RealtimeError('FORBIDDEN');
    if (await hasFreePlayerPortrait(deps.ctx.prisma, campaign.id, user.id)) {
      throw new RealtimeError('PORTRAIT_AVAILABLE');
    }
    addPortraitWanted(campaign.id, user.id, user.name);
    emitPortraitWanted(deps, campaign.id);
    return portraitWantedRows(campaign.id);
  },
});

/** Lista próśb o portret — MG pyta o nią przy wejściu do kampanii. */
export const portraitWantedEvent = defineEvent<void, PortraitWantedRow[]>({
  name: 'portrait:wanted',
  role: ROLE_GM,
  handler: ({ socket }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    return Promise.resolve(portraitWantedRows(campaign.id));
  },
});

function emitPortraitWanted(deps: RealtimeDeps, campaignId: string): void {
  deps.io.to(gmRoom(campaignId)).emit('portrait:wanted-sync', portraitWantedRows(campaignId));
}

/**
 * Rozgłasza wiersz puli — MG w całości, gracze w wersji `playerPortraitView`.
 *
 * Dwie emisje z **jednym** numerem `seq`: każdy klient dostaje dokładnie jedną
 * z nich, więc ciąg numerów w pokoju kampanii zostaje bez luki (luka to pełny
 * resync całego stołu). Portret NPC, którego nic nie nosi, dochodzi do graczy
 * jako `removedId` — muszą go zapomnieć, jeśli znali go z puli graczy.
 */
async function emitPortraitAsset(
  deps: RealtimeDeps,
  campaignId: string,
  event: 'portrait:crop' | 'portrait:visibility',
  view: PortraitAssetView,
): Promise<void> {
  const room = campaignRoom(campaignId);
  const gm = gmRoom(campaignId);
  const seq = deps.seqs.next(room);
  const used = view.gmOnly
    ? (await usedPortraitUrls(deps.ctx.prisma, campaignId)).has(view.url)
    : true;
  const forPlayers = playerPortraitView(view, used);
  const full: PortraitCropBroadcast = { seq, asset: view };
  const players: PortraitCropBroadcast = forPlayers
    ? { seq, asset: forPlayers }
    : { seq, removedId: view.id };
  deps.io.to(gm).emit(event, full);
  deps.io.to(room).except(gm).emit(event, players);
}

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
