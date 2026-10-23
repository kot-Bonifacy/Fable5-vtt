import type {
  CheckCallEntry,
  HiddenSpottedBroadcast,
  ScenePoint,
  SessionUser,
  TokenHaltBroadcast,
} from '@vtt/shared';
import { ROLE_GM, isCheckCallOpen, tokenTableName } from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
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
 * walka i tak liczy od nowa). Gracz dostaje gołe wezwanie do Testu Percepcji
 * (uwaga MG z 23.10: bez „coś przykuło uwagę”), a co postać zauważyła — tylko
 * po sukcesie.
 *
 * **Rzuca gracz z kubka (zmiana MG z 22.10, wbrew pierwszemu planowi):** strefa
 * wystawia wezwanie do Testu Percepcji (`callSpotZone` w `zones.ts`), a figura
 * stoi, dopóki gracz nie rzuci albo MG nie rzuci za niego czy nie odwoła
 * wezwania (`refuseWhileNoticePending`). Wynik widzą MG i rzucający.
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

/** Ruch figury, która ma otwarte wezwanie do Percepcji przy ukrytej rzeczy (58a). */
export const NOTICE_ROLL_PENDING = 'NOTICE_ROLL_PENDING';
export const NOTICE_ROLL_PENDING_MESSAGE = 'Najpierw rzuć na Percepcję — wezwanie czeka w kubku.';

/** Tyle ostatnich wezwań kampanii przegląda pytanie o otwarte — jak przy zamku. */
const RECENT_CALLS = 50;

/**
 * Czy ta karta ma otwarte wezwanie do Percepcji przy ukrytej rzeczy. Adres
 * strefy siedzi w zapisanym żądaniu (`hiddenZoneId`), więc zwykłe wezwanie MG
 * do Percepcji ruchu nie wstrzymuje.
 */
export async function noticeRollPending(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<boolean> {
  const rows = await deps.ctx.prisma.chatMessage.findMany({
    where: { campaignId, kind: 'check' },
    select: { payload: true },
    orderBy: { id: 'desc' },
    take: RECENT_CALLS,
  });
  return rows.some((row) => {
    if (!row.payload) return false;
    const entry = JSON.parse(row.payload) as CheckCallEntry;
    if (entry.characterId !== characterId) return false;
    if (typeof (entry.system as { hiddenZoneId?: unknown }).hiddenZoneId !== 'number') return false;
    return isCheckCallOpen(entry);
  });
}

/**
 * Figura gracza stoi do rzutu (decyzja MG z 22.10): inaczej klik dalej
 * przeprowadziłby ją po pułapce, zanim zdąży ją zauważyć. MG nie jest
 * związany — jego przeciągnięcie to jego decyzja, jak przy każdej odmowie ruchu.
 */
export async function refuseWhileNoticePending(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  token: Pick<Token, 'characterId'>,
): Promise<void> {
  if (user.role === ROLE_GM || !token.characterId) return;
  if (await noticeRollPending(deps, campaignId, token.characterId)) {
    throw new RealtimeError(NOTICE_ROLL_PENDING);
  }
}
