import type { ChatMessageView } from '@vtt/shared';
import type { ChatItem } from './stores/chatStore.js';

/**
 * Grupowanie kolejnych kart czatu (etap 60b).
 *
 * Karta, która powtarza nagłówek poprzedniej (ten sam mówiący, ta sama
 * rubryka, chwilę później), traci go: czyta się ciąg jednej osoby, a nie
 * pięć razy jej nick. Godzina schowanego nagłówka zostaje w dymku karty.
 */

/** Najdłuższa przerwa między kartami jednej grupy. */
export const CHAT_GROUP_WINDOW_MS = 2 * 60 * 1000;

/**
 * Tożsamość nagłówka karty: dwie karty o tym samym kluczu mają nagłówek różny
 * najwyżej godziną. `null` — karta nigdy się nie dokleja.
 *
 * Biała lista, nie „ten sam autor”: karty wystawia często serwer kontem MG,
 * a ich nagłówek mówi co innego niż autor — obrażenia celu z miejscem
 * trafienia, tytuł handoutu, nazwa tabeli. Sklejenie dwóch takich kart po
 * `authorId` schowałoby drugi cel albo drugi tytuł. Nowy rodzaj bez wpisu
 * zostaje przy pełnym nagłówku, co jest bezpiecznym domyślnym.
 *
 * Karty rzutu (`roll`, `gmroll`) nie ma tu świadomie — każdy rzut stoi
 * z własnym nagłówkiem (plik etapu 60).
 */
export function chatHeaderKey(message: ChatMessageView): string | null {
  // Rodzaj w kluczu trzyma i rubrykę filtra (`chatCategoryOf`), i to, że
  // wypowiedź po szepcie nie gubi etykiety „szept do: …”.
  const base = [message.kind, message.authorId];
  switch (message.kind) {
    case 'say':
    case 'whisper':
      // `/jako` pisze kontem MG za różnych NPC-ów: nagłówek to nazwa i portret.
      return [
        ...base,
        message.authorName,
        message.botId ?? '',
        message.recipientId ?? '',
        message.recipientName ?? '',
      ].join('\u0000');
    case 'action':
    case 'gmaction':
      return message.action ? [...base, message.action.actorName].join('\u0000') : null;
    case 'recovery':
    case 'gmrecovery':
      return message.recovery ? [...base, message.recovery.actor].join('\u0000') : null;
    case 'time':
      return base.join('\u0000');
    default:
      return null;
  }
}

/**
 * Id wiadomości, które doklejają się do karty nad sobą.
 *
 * `rows` to kolejne wiersze jednej kolumny feedu po filtrach; `null` stoi za
 * separatorem ukrytych wierszy i przerywa grupę. `breaksGroup` wskazuje karty,
 * które zawsze stoją osobno — po obu stronach: nie doklejają się same i nic
 * nie dokleja się do nich (sprawa czekająca na decyzję, wiersz „do mnie”).
 */
export function chatContinuations(
  rows: readonly (ChatItem | null)[],
  breaksGroup: (item: ChatItem) => boolean,
): Set<number> {
  const out = new Set<number>();
  let previous: { key: string; at: number } | null = null;
  for (const row of rows) {
    const key = row?.type === 'message' && !breaksGroup(row) ? chatHeaderKey(row.message) : null;
    if (row?.type !== 'message' || key === null) {
      previous = null;
      continue;
    }
    const { message } = row;
    const at = Date.parse(message.createdAt);
    if (previous && previous.key === key && at - previous.at <= CHAT_GROUP_WINDOW_MS) {
      out.add(message.id);
    }
    previous = { key, at };
  }
  return out;
}

/**
 * Wiersze bez tych, które mają pełniejszego zastępcę (etap 70a, 66e pkt 23).
 *
 * Akcja w Sieci idzie do stołu skrótem („Kopia Pliku”), a do netrunnera i MG
 * dodatkowo pełnym wierszem „poufne” z nazwą Pliku albo urządzenia. Pełny wiersz
 * niesie `action.shadows` z id skrótu — netrunner czyta wtedy jeden wiersz, nie
 * dwa. To nie jest ukrywanie danych: skrót zawiera się w pełnym wierszu, który
 * ten widz i tak dostał. MG zostaje przy obu (widzi, co usłyszał stół).
 */
export function dropShadowedRows(items: readonly ChatItem[], isGm: boolean): readonly ChatItem[] {
  if (isGm) return items;
  const shadowed = new Set<number>();
  for (const item of items) {
    if (item.type !== 'message') continue;
    const id = item.message.action?.shadows;
    if (typeof id === 'number') shadowed.add(id);
  }
  if (shadowed.size === 0) return items;
  return items.filter((item) => item.type !== 'message' || !shadowed.has(item.message.id));
}
