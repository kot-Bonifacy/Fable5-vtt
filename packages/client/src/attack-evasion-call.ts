import type { ChatMessageView, RollAttackMeta, SessionUser, TokenView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { CharacterSheetView } from './stores/characterStore.js';
import type { ChatItem } from './stores/chatStore.js';
import type { PendingEvasion } from './stores/rollStore.js';

/**
 * Unik woła obrońcę sam (17.10, zlecenie MG: „uniki nie mogą przepadać przez
 * przypadek”).
 *
 * Serwer od 03.10 wstrzymuje obrażenia, dopóki cel nie zdecyduje
 * (`evasionPending`), ale o tej decyzji gracz dowiadywał się wyłącznie
 * z guzika na karcie czatu — kto patrzył na mapę albo kartę postaci, ten
 * Uniku nie widział, a MG, czekając, klikał za niego „Bez uniku”. Teraz
 * kubek obrońcy woła o Unik tak, jak kubek strzelca woła o obrażenia,
 * a nad kubkiem stoi wezwanie (`EvasionPrompt`), które znika dopiero, gdy
 * serwer przestanie czekać (wzór: monity reakcji z Foundry, bez limitu
 * czasu — obrażenia i tak czekają). „Bez uniku” mówi już tylko MG.
 */

export interface EvasionCall {
  /** Karta ataku, na którą odpowiada Unik. */
  messageId: number;
  /** Figura, która ma decyzję — przy wybuchu jedna z wielu. */
  tokenId: string;
  defenderName: string;
  attackerName: string;
  /** Wynik strzelca, który rzut ZW + Unik musi przebić. */
  attackTotal: number;
  /** Wybuch albo stożek: odskok poza obszar zamiast uniku. */
  area: 'blast' | 'cone' | null;
  /** Kubek gotowy do rzutu Uniku. */
  pending: PendingEvasion;
}

/** Klucz wezwania w `skippedEvasionCalls` — przy wybuchu jedno na figurę. */
export function evasionCallKey(call: Pick<EvasionCall, 'messageId' | 'tokenId'>): string {
  return `${call.messageId}:${call.tokenId}`;
}

/**
 * Czy ten widz odpowiada za Unik tej figury.
 *
 * Ta sama reguła co „kto prowadzi strzelca” (`attackShooterFor`): figura
 * z właścicielem należy do niego — po karcie albo po żetonie, tak jak sprawdza
 * `attack:evade` — a figury bez właściciela (NPC-e, towarzysze-boty) prowadzi
 * MG. MG **może** odpowiedzieć i za gracza (karta ataku ma dla niego guziki),
 * ale jego kubek za gracza nie woła: to rzut gracza.
 */
function answersFor(
  token: TokenView,
  character: CharacterSheetView | undefined,
  user: SessionUser,
): boolean {
  const owners = [character?.ownerId, token.ownerId].filter(
    (owner): owner is string => owner != null,
  );
  return owners.length > 0 ? owners.includes(user.id) : user.role === ROLE_GM;
}

/** Wezwania do Uniku z jednej karty ataku, na które odpowiada ten widz. */
export function evasionCallsOf(
  message: ChatMessageView,
  attack: RollAttackMeta,
  characters: Record<string, CharacterSheetView>,
  tokens: Record<string, TokenView>,
  user: SessionUser,
): EvasionCall[] {
  if (attack.damageRollId !== undefined || !message.roll) return [];
  const attackTotal = message.roll.total;
  const attackerName = message.roll.actor ?? 'Atakujący';
  const area = attack.area ? (attack.area.shape === 'cone' ? 'cone' : 'blast') : null;
  return (attack.evasionPending ?? []).flatMap((tokenId): EvasionCall[] => {
    // Pojedynczy cel czeka tylko jako cel tej karty; wiersz wybuchu — jako
    // wiersz z `canEvade`. Cokolwiek innego to lista sprzed zmiany karty.
    if (!area && attack.targetTokenId !== tokenId) return [];
    const row = attack.area?.targets.find((target) => target.tokenId === tokenId);
    if (area && (!row || row.canEvade !== true || row.spared !== undefined)) return [];
    const token = tokens[tokenId];
    if (!token) return [];
    const character = token.characterId ? characters[token.characterId] : undefined;
    if (!answersFor(token, character, user)) return [];
    // Odskok z wybuchu idzie wyłącznie kartą (`evadeArea`); zwykły Unik figury
    // bez widocznej karty — żetonem, jak guzik na karcie ataku.
    if (area && !character) return [];
    const defenderName = token.name || character?.name || row?.name || 'cel';
    const verb = area === 'blast' ? 'Odskok' : 'Unik';
    return [
      {
        messageId: message.id,
        tokenId,
        defenderName,
        attackerName,
        attackTotal,
        area,
        pending: {
          messageId: message.id,
          characterId: character?.id ?? null,
          characterName: defenderName,
          ...(area ? { tokenId } : {}),
          title: `${verb}: ${defenderName}`,
          modifierTotal: 0,
        },
      },
    ];
  });
}

/**
 * Wszystkie Uniki, na które ten widz jeszcze nie odpowiedział — od najnowszego.
 *
 * Czyta feed czatu, jak `openDamageCallFor`, więc F5 i spóźniona karta liczą
 * się same. Karty starsze niż `maxAgeMs` milczą: trafienie zapomniane przed
 * przerwą nie ma wołać przez całą następną sesję (z karty dalej da się
 * odpowiedzieć).
 */
export function openEvasionCallsFor(
  items: ChatItem[],
  user: SessionUser | null,
  characters: Record<string, CharacterSheetView>,
  tokens: Record<string, TokenView>,
  now: number = Date.now(),
  maxAgeMs: number = 2 * 60 * 60 * 1000,
): EvasionCall[] {
  if (!user) return [];
  const calls: EvasionCall[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type !== 'message') continue;
    const message = item.message;
    const attack = message.roll?.attack;
    if (!attack) continue;
    if (now - new Date(message.createdAt).getTime() > maxAgeMs) break;
    calls.push(...evasionCallsOf(message, attack, characters, tokens, user));
  }
  return calls;
}
