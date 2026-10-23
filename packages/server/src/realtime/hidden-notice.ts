import type {
  HiddenSpottedBroadcast,
  RollResult,
  ScenePoint,
  SessionUser,
  TokenHaltBroadcast,
} from '@vtt/shared';
import { tokenTableName } from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { emitToCampaignUser } from './state.js';
import { controllerIds } from './tokens.js';
import { controllerOf } from './zone-effects.js';
import { campaignGmHand, spotHiddenZones, zonesNoticeDue } from './zones.js';
import { hiddenFiguresNoticeDue, spotHiddenFigures } from './hidden-figures.js';
import { INCLUDE_CHAT_NAMES, deliverChatMessageTo, toChatMessageView } from './chat-io.js';

/**
 * Percepcja w drodze (etap 58a, decyzje MG z 22.10; ukryty rzut od 24.10).
 *
 * Postać gracza, która w marszu dochodzi na cztery metry do ukrytej rzeczy,
 * której jeszcze nie sprawdzała, **rzuca Test Percepcji w ukryciu** — serwer,
 * bez wezwania i bez wiedzy gracza (zlecenie MG z 24.10, wbrew wezwaniu
 * z kubka z 22.10). Porażka nie zatrzymuje marszu, a jej wynik zna tylko MG.
 * Sukces **zatrzymuje** figurę na tym polu, zanim wejdzie w to, co zauważyła,
 * i pokazuje graczowi kartę rzutu, a po niej „X zauważa: …”.
 *
 * Zatrzymanie to zwykłe lądowanie w `performTokenMove` — z walidacją,
 * rachunkiem Tury albo puli i hakami stref — a nie zapis pola z boku.
 *
 * Moduł jest jednym miejscem pytania „czy tu jest coś do zauważenia”: strefy
 * bronione (58a) i ukryte figury (58d, `hidden-figures.ts`). Nowy rodzaj
 * ukrytej rzeczy dopisuje się w `hiddenNoticeDue` i `rollHiddenNotice`,
 * nie w pętli klatek.
 */

/** Zdany ukryty Test Percepcji — co zauważono i karta rzutu do pokazania. */
export interface HiddenSpot {
  name: string;
  /** Konto, któremu rzut odsłonił rzecz — adresat karty. */
  ownerId: string;
  roll: RollResult;
  /** Rozsyła odsłonięcie (strefy, figura) — po zatrzymaniu i po karcie. */
  reveal: () => Promise<void>;
}

/** Czy na tym polu (lewy górny róg figury) figurze należy się rzut na Percepcję. */
export async function hiddenNoticeDue(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  stand: ScenePoint,
): Promise<boolean> {
  if (await zonesNoticeDue(deps, campaignId, scene, token, stand)) return true;
  return hiddenFiguresNoticeDue(deps, campaignId, scene, token, stand);
}

/**
 * Ukryte Testy Percepcji z tego pola przeciw wszystkiemu, czego postać jeszcze
 * nie sprawdzała. Zapisuje próby i odsłonięcia w bazie, ale niczego nie
 * rozsyła — o zdanych mówi `showHiddenSpots` po lądowaniu.
 */
export async function rollHiddenNotice(
  deps: RealtimeDeps,
  input: { campaignId: string; user: SessionUser; scene: Scene; token: Token; stand: ScenePoint },
): Promise<HiddenSpot[]> {
  const half = (input.token.size * input.scene.gridSizePx) / 2;
  const walked = [{ x: input.stand.x + half, y: input.stand.y + half }];
  const spot = { ...input, walked };
  return [...(await spotHiddenZones(deps, spot)), ...(await spotHiddenFigures(deps, spot))];
}

/**
 * Po lądowaniu: każdy zdany Test pokazuje się jako karta rzutu („Do MG
 * i gracza”, pisana ręką MG z adresatem — zostaje w historii gracza), potem
 * odsłonięcie, a na końcu jeden pasek „X zauważa: …”.
 */
export async function showHiddenSpots(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  spots: readonly HiddenSpot[],
): Promise<void> {
  if (spots.length === 0) return;
  const hand = await campaignGmHand(deps, campaignId);
  for (const spot of spots) {
    if (hand) {
      const stored = await deps.ctx.prisma.chatMessage.create({
        data: {
          campaignId,
          authorId: hand.id,
          recipientId: spot.ownerId,
          kind: 'gmroll',
          text: spot.roll.title ?? 'Percepcja',
          payload: JSON.stringify(spot.roll),
          sceneId: scene.id,
        },
        include: INCLUDE_CHAT_NAMES,
      });
      await deliverChatMessageTo(
        deps,
        campaignId,
        toChatMessageView(stored),
        [hand.id, spot.ownerId],
        true,
      );
    }
    await spot.reveal();
  }
  await emitHiddenSpotted(
    deps,
    campaignId,
    scene,
    token,
    spots.map((spot) => spot.name),
  );
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
