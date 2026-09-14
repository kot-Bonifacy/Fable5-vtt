import type { PortraitAssetView } from '@vtt/shared';
import { clampPortraitCrop } from '@vtt/shared';
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
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  cropZoom: number;
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
    id: asset.id,
    name: asset.name,
    url: asset.url,
    width: asset.width,
    height: asset.height,
    crop: clampPortraitCrop(
      { x: asset.cropX, y: asset.cropY, zoom: asset.cropZoom },
      { width: asset.width, height: asset.height },
    ),
  };
}
