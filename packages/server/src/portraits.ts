import type { PortraitAssetView, PortraitWantedRow } from '@vtt/shared';
import { clampPortraitBannerCrop, clampPortraitCrop } from '@vtt/shared';
import type { PrismaClient } from './db.js';

type PortraitDb = Pick<PrismaClient, 'character' | 'characterDraft' | 'token' | 'botProfile'>;

/** Tylko zajętość adresów; dane ukrytych postaci nigdy nie trafiają do galerii. */
export async function usedPortraitUrls(
  prisma: PortraitDb,
  campaignId: string,
  exceptDraftUserId?: string,
): Promise<Set<string>> {
  const [characters, drafts, tokens, bots] = await Promise.all([
    prisma.character.findMany({ where: { campaignId }, select: { portraitUrl: true } }),
    prisma.characterDraft.findMany({
      where: { campaignId, ...(exceptDraftUserId ? { userId: { not: exceptDraftUserId } } : {}) },
      select: { data: true },
    }),
    prisma.token.findMany({ where: { scene: { campaignId } }, select: { imageUrl: true } }),
    prisma.botProfile.findMany({ where: { campaignId }, select: { portraitUrl: true } }),
  ]);
  const used = new Set<string>();
  for (const row of [...characters, ...bots]) if (row.portraitUrl) used.add(row.portraitUrl);
  for (const row of tokens) if (row.imageUrl) used.add(row.imageUrl);
  for (const row of drafts) {
    const url = draftPortraitUrl(row.data);
    if (url) used.add(url);
  }
  return used;
}

export function draftPortraitUrl(data: string): string | null {
  try {
    const draft: unknown = JSON.parse(data);
    if (
      draft &&
      typeof draft === 'object' &&
      'portraitUrl' in draft &&
      typeof draft.portraitUrl === 'string'
    )
      return draft.portraitUrl;
  } catch {
    /* Uszkodzony szkic nie rezerwuje portretu. */
  }
  return null;
}

/** Tyle z wiersza `PortraitAsset` potrzeba, żeby zbudować widok puli. */
export interface PortraitAssetRow {
  retired?: boolean;
  gmOnly?: boolean;
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  cropZoom: number;
  /** Własny kadr banera (25.09); `null` w którejkolwiek — „jak żeton”. */
  bannerX?: number | null;
  bannerY?: number | null;
  bannerZoom?: number | null;
}

/**
 * Wiersz puli portretów tak, jak widzi go stół.
 *
 * Jedno miejsce na cztery trasy i jedno rozgłoszenie, bo kadr doszedł 12.09 do
 * widoku, który był wtedy budowany z ręki w czterech miejscach — i trzy z nich
 * milczałyby o nim do pierwszego przeładowania strony.
 *
 * Kadr jedzie przez `clampPortraitCrop`, a nie prosto z bazy: kolumny mają
 * wartości domyślne, ale wymiary obrazu bierze się z tego samego wiersza, więc
 * gdyby kiedyś rozjechały się z plikiem (podmieniony upload, import z obcej
 * kopii), klient dostanie kadr, który na pewno pokrywa krążek.
 */
export function toPortraitAssetView(asset: PortraitAssetRow): PortraitAssetView {
  return {
    retired: asset.retired ?? false,
    gmOnly: asset.gmOnly ?? false,
    id: asset.id,
    name: asset.name,
    url: asset.url,
    width: asset.width,
    height: asset.height,
    crop: clampPortraitCrop(
      { x: asset.cropX, y: asset.cropY, zoom: asset.cropZoom },
      { width: asset.width, height: asset.height },
    ),
    bannerCrop:
      asset.bannerX == null || asset.bannerY == null || asset.bannerZoom == null
        ? null
        : clampPortraitBannerCrop(
            { x: asset.bannerX, y: asset.bannerY, zoom: asset.bannerZoom },
            { width: asset.width, height: asset.height },
          ),
  };
}

/**
 * Ten sam wiersz oczami gracza (23.09) — `null`, gdy gracz ma go nie znać.
 *
 * Portret NPC („tylko MG”) nie trafia do galerii gracza, bo jego nazwa i sama
 * twarz zdradzają, kogo drużyna dopiero spotka. Gdy jednak coś go już nosi,
 * figura może stanąć przed graczem — a wtedy jego mapa potrzebuje kadru, inaczej
 * ujęłaby twarz inaczej niż u MG. Jedzie więc sam adres i kadr, bez nazwy.
 * Świadomy kompromis (decyzja MG z 23.09): adres twarzy ukrytej figury da się
 * wydłubać z narzędzi przeglądarki; nieprzypisane portrety NPC nie wychodzą.
 */
export function playerPortraitView(
  view: PortraitAssetView,
  used: boolean,
): PortraitAssetView | null {
  if (!view.gmOnly) return view;
  if (!used) return null;
  return { ...view, name: '' };
}

/**
 * Kto czeka na portret, bo pula graczy jest wyczerpana (#68, 03.10.2026).
 *
 * W pamięci procesu, nie w bazie: to prośba „dołóż twarz", a nie stan gry —
 * restart serwera ją gubi, a gracz, który dalej nie ma z czego wybrać, poprosi
 * jeszcze raz tym samym przyciskiem. Listę czyści każdy nowy portret w puli
 * graczy (wgranie albo przeniesienie z NPC), bo od tej chwili gracz ma wybór.
 */
const portraitWanted = new Map<string, Map<string, string>>();

export function addPortraitWanted(campaignId: string, userId: string, userName: string): void {
  let rows = portraitWanted.get(campaignId);
  if (!rows) {
    rows = new Map();
    portraitWanted.set(campaignId, rows);
  }
  rows.set(userId, userName);
}

export function portraitWantedRows(campaignId: string): PortraitWantedRow[] {
  return [...(portraitWanted.get(campaignId) ?? [])].map(([userId, userName]) => ({
    userId,
    userName,
  }));
}

/** `true`, gdy było co czyścić — wtedy wołający rozsyła MG pustą listę. */
export function clearPortraitWanted(campaignId: string): boolean {
  return portraitWanted.delete(campaignId);
}

/** Czy w puli graczy zostało coś, czego ten gracz może jeszcze użyć. */
export async function hasFreePlayerPortrait(
  prisma: PortraitDb & Pick<PrismaClient, 'portraitAsset'>,
  campaignId: string,
  userId: string,
): Promise<boolean> {
  const assets = await prisma.portraitAsset.findMany({
    where: { campaignId, retired: false, gmOnly: false },
    select: { url: true },
  });
  if (assets.length === 0) return false;
  const used = await usedPortraitUrls(prisma, campaignId, userId);
  return assets.some((asset) => !used.has(asset.url));
}
