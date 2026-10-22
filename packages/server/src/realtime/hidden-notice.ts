import type { HiddenSpottedBroadcast, ScenePoint, TokenHaltBroadcast } from '@vtt/shared';
import { tokenTableName } from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { emitToCampaignUser } from './state.js';
import { controllerIds } from './tokens.js';
import { controllerOf } from './zone-effects.js';
import { zonesNoticeDue } from './zones.js';

/**
 * Percepcja w drodze (etap 58a, decyzje MG z 22.10).
 *
 * Postać gracza, która w marszu dochodzi na cztery metry do ukrytej rzeczy,
 * której jeszcze nie sprawdzała, **staje** na tym polu i rzuca. Zatrzymanie to
 * zwykłe lądowanie w `performTokenMove` — z walidacją, rachunkiem Tury albo
 * puli i hakami stref — a nie zapis pola z boku (tak staje drużyna w 56, gdzie
 * walka i tak liczy od nowa). Rzut jest ukryty: gracz wie, że coś przykuło
 * uwagę postaci, a co — tylko po sukcesie.
 *
 * Moduł jest jednym miejscem pytania „czy tu jest coś do zauważenia”: dziś
 * strefy bronione, w 58d ukryte figury. Nowy rodzaj ukrytej rzeczy dopisuje się
 * w `hiddenNoticeDue`, nie w pętli klatek.
 */

/** Czy na tym polu (lewy górny róg figury) figurze należy się rzut na Percepcję. */
export async function hiddenNoticeDue(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  stand: ScenePoint,
): Promise<boolean> {
  return zonesNoticeDue(deps, campaignId, scene, token, stand);
}

/**
 * Do prowadzącego: figura przystanęła. Po lądowaniu, bo klient kończy marsz
 * bez własnego lądowania i stawia figurę tam, gdzie trzyma ją magazyn.
 */
export async function emitNoticeHalt(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
): Promise<void> {
  const payload: TokenHaltBroadcast = { sceneId: scene.id, tokenIds: [token.id], reason: 'notice' };
  for (const userId of controllerIds(token, null)) {
    await emitToCampaignUser(deps.io, campaignId, userId, 'token:halt', payload);
  }
}

/** Do właściciela: udany rzut odsłonił mu te rzeczy. Porażki nie zgłasza się nikomu. */
export async function emitHiddenSpotted(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) return;
  const ownerId = await controllerOf(deps, token);
  if (!ownerId) return;
  const payload: HiddenSpottedBroadcast = {
    sceneId: scene.id,
    tokenId: token.id,
    actorName: tokenTableName(token, token.name),
    names: [...names],
  };
  await emitToCampaignUser(deps.io, campaignId, ownerId, 'hidden:spotted', payload);
}
