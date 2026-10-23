import type { TokenDisposition, TokenPatch, TokenView } from '@vtt/shared';
import { TOKEN_DISPOSITIONS, TOKEN_DISPOSITION_LABELS, tokenDisposition } from '@vtt/shared';
import { updateToken } from './socket.js';
import { notifyRefusal } from './notices.js';

/**
 * Postawa figury (etap 56, Disposition z Foundry VTT) po stronie MG.
 *
 * Kolumnę zna tylko MG — u gracza pole nie przychodzi, więc wszystko tutaj ma
 * sens wyłącznie w jego oknach. „Samo” (`null`) rozstrzyga `tokenDisposition`:
 * figura gracza Przyjazna, NPC Neutralny.
 */
export function dispositionOf(token: Pick<TokenView, 'disposition' | 'ownerId'>): TokenDisposition {
  return tokenDisposition({
    disposition: token.disposition,
    playerControlled: token.ownerId !== null,
  });
}

/** Wrogie na górze listy, potem neutralne, przyjazne na końcu — „kogo dołożyć”. */
export const DISPOSITION_RANK: Readonly<Record<TokenDisposition, number>> = {
  hostile: 0,
  neutral: 1,
  friendly: 2,
};

export { TOKEN_DISPOSITIONS, TOKEN_DISPOSITION_LABELS };

/** Podpowiedzi przycisków postawy — widzi je tylko MG. */
export const DISPOSITION_HINTS: Readonly<Record<TokenDisposition, string>> = {
  friendly: 'Sojusznik drużyny. Niczego nie wyzwala.',
  neutral: 'Nie wyzwala walki — handlarz, przechodzień, świadek.',
  hostile:
    'Gdy ktoś z drużyny ją zobaczy, serwer zakłada starcie „Przed walką”, a gracze stoją, dopóki go nie rozpoczniesz albo nie odwołasz. Koniec walki i „Odwołaj” przełączają widocznych wrogów na Neutralną. Postawę widzi tylko MG.',
};

/** Ustawia postawę wszystkim podanym figurom; odmowę mówi jednym zdaniem. */
export async function setDisposition(
  tokenIds: readonly string[],
  disposition: TokenDisposition,
): Promise<void> {
  const patch: TokenPatch = { disposition };
  const acks = await Promise.all(tokenIds.map((id) => updateToken(id, patch)));
  if (acks.some((ack) => !ack.ok)) notifyRefusal('token', 'Nie udało się zmienić postawy figury.');
}
