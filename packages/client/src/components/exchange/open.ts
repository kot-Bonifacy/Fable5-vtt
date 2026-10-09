import type { ExchangeCounterpartView, TokenView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { fetchExchangeCounterparts, inviteTrade, tradeErrorText } from '../../socket.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useCharacterStore } from '../../stores/characterStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import {
  GM_ANY_KEY,
  activeTradeOf,
  liveTradeKey,
  useExchangeStore,
} from '../../stores/exchangeStore.js';
import { useSceneStore } from '../../stores/sceneStore.js';
import { useTokenStore } from '../../stores/tokenStore.js';

/**
 * Wejścia do jednego okna „Wymiana” (etap 46a). Jedno okno, kilka drzwi:
 * menu figury, podwójny klik gracza w handlarza i ciało, „Wymiana…” z karty,
 * dok „Sklepy (N)” i ekran „Między sesjami”. Wszystkie kończą się tu, żeby
 * „która karta jest moją stroną” i „co znaczy wybór kolegi” miały jedną
 * odpowiedź.
 */

function isGm(): boolean {
  return useAuthStore.getState().user?.role === ROLE_GM;
}

/** Karty, które prowadzi ten gracz, w kolejności panelu. */
export function ownCards(): { id: string; name: string }[] {
  const userId = useAuthStore.getState().user?.id;
  const { order, characters } = useCharacterStore.getState();
  return order
    .map((id) => characters[id])
    .filter((card) => card !== undefined && card.ownerId === userId)
    .map((card) => ({ id: card!.id, name: card!.name }));
}

/**
 * Którą kartą gracz podchodzi do figury: tą, której figura stoi najbliżej
 * (na tej samej scenie). Bez figury — pierwsza z panelu.
 */
export function anchorNear(
  token: Pick<TokenView, 'id' | 'sceneId' | 'x' | 'y'> | null,
): string | null {
  const mine = ownCards();
  if (mine.length === 0) return null;
  const tokens = Object.values(useTokenStore.getState().tokens);
  const sceneId = token?.sceneId ?? useSceneStore.getState().scene?.id;
  const stands = tokens.filter(
    (other) =>
      other.sceneId === sceneId &&
      other.id !== token?.id &&
      mine.some((card) => card.id === other.characterId),
  );
  if (token) {
    stands.sort(
      (p, q) => Math.hypot(p.x - token.x, p.y - token.y) - Math.hypot(q.x - token.x, q.y - token.y),
    );
  }
  return stands[0]?.characterId ?? mine[0]!.id;
}

/**
 * Zaproszenie do handlu z okna — decyzja MG z 08.10 (46a2): wybór kolegi albo
 * NPC-a jako drugiej strony **od razu** zaprasza, a okno pokazuje „czeka na…”.
 * Zwraca komunikat odmowy albo `null`.
 */
export async function startTrade(
  anchorId: string,
  target: Pick<ExchangeCounterpartView, 'tokenId' | 'characterId'>,
): Promise<string | null> {
  const ack = await inviteTrade({
    fromCharacterId: anchorId,
    ...(target.tokenId ? { toTokenId: target.tokenId } : { toCharacterId: target.characterId }),
  });
  if (!ack.ok || !ack.data) return tradeErrorText(ack.ok ? 'TRADE_NOT_FOUND' : ack.error);
  const store = useExchangeStore.getState();
  store.applyTrade(ack.data.trade);
  store.openWindow(anchorId, { selected: liveTradeKey(ack.data.trade.id) });
  return null;
}

/** Okno na karcie — „Wymiana…” z zakładki Ekwipunek. MG zaczyna w trybie MG. */
export function openExchangeForCard(characterId: string): void {
  useExchangeStore
    .getState()
    .openWindow(characterId, isGm() ? { selected: GM_ANY_KEY } : undefined);
}

/** Sklep z doku albo z ekranu „Między sesjami” — kartą, którą gracz prowadzi. */
export function openShop(merchantId: string): void {
  const anchorId = anchorNear(null);
  if (!anchorId) {
    useChatStore.getState().addNote('Nie prowadzisz żadnej postaci, którą dałoby się kupować.');
    return;
  }
  useExchangeStore.getState().openWindow(anchorId, { selected: `merchant:${merchantId}` });
}

/**
 * „Wymiana…” z menu figury albo podwójny klik gracza.
 *
 * MG: okno na karcie tej figury (jej ekwipunek po lewej, jak dawne
 * „Przeszukaj”), w trybie MG — handel jako NPC i sklep wybiera z listy.
 *
 * Gracz: kartą, która stoi najbliżej; serwer mówi, czym jest figura (handel,
 * łup, sklep — gracz nie zna karty cudzego żetonu). Podwójny klik otwiera
 * okno **tylko** dla sklepu, ciała i pojemnika (decyzje MG z 08.10 i 46b), żeby przypadkowy
 * klik w kolegę nie wysłał mu zaproszenia; zwraca wtedy `false` i wołający
 * robi to, co robił dotąd.
 */
export async function openExchangeAtToken(
  token: TokenView,
  via: 'menu' | 'activate',
): Promise<boolean> {
  if (isGm()) {
    if (!token.characterId) return false;
    useExchangeStore
      .getState()
      .openWindow(token.characterId, { tokenId: token.id, selected: GM_ANY_KEY });
    return true;
  }
  const anchorId = anchorNear(token);
  if (!anchorId) {
    if (via === 'menu') {
      useChatStore.getState().addNote('Nie prowadzisz żadnej postaci, którą dałoby się wymieniać.');
    }
    return false;
  }
  const ack = await fetchExchangeCounterparts({ characterId: anchorId, tokenId: token.id });
  const entries = ack.ok ? (ack.data?.counterparts ?? []) : [];
  const entry = entries.find((row) => row.tokenId === token.id);

  if (via === 'activate') {
    if (
      !entry ||
      (entry.kind !== 'merchant' && entry.kind !== 'loot' && entry.kind !== 'container')
    )
      return false;
    useExchangeStore.getState().openWindow(anchorId, { tokenId: token.id, selected: entry.key });
    return true;
  }

  if (entry && entry.kind !== 'trade') {
    useExchangeStore.getState().openWindow(anchorId, { tokenId: token.id, selected: entry.key });
    return true;
  }
  // Karta handluje na jeden front naraz — trwający handel otwiera się zamiast
  // zaproszenia, którego serwer i tak by odmówił (`CHARACTER_BUSY`).
  const running = activeTradeOf(anchorId);
  if (running) {
    useExchangeStore.getState().openTrade(running.id);
    return true;
  }
  // Kolega, żywy NPC — albo figura, której lista nie podała (za daleko, bez
  // karty): zaproszenie i tak rozstrzygnie serwer, a odmowa ma swoje zdanie.
  const refusal = await startTrade(anchorId, { tokenId: token.id });
  if (refusal) useChatStore.getState().addNote(refusal);
  return refusal === null;
}
