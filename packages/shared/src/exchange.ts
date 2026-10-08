/**
 * Jedno okno „Wymiana” (etap 46a) — kto stoi po drugiej stronie i co z nim wolno.
 *
 * Rdzeń VTT, nie CP RED. Do 46a były trzy okna z trzema wejściami: „Wymiana”
 * (38b: przekazanie, łup), „Handel” (38c: dwa pola, dwie zgody) i „Kup”
 * w Kompendium. Teraz wejście jest jedno, a o tym, jak okno się zachowa,
 * decyduje **rodzaj drugiej strony** (decyzja MG 5 z 08.10.2026):
 *
 *  - `trade` — kolega, towarzysz, żywy NPC: dwa pola i dwie zgody (38c);
 *  - `loot` — ciało (leży albo nie żyje, bez właściciela): bierzesz od ręki;
 *  - `merchant` — sklep: półka, koszyk, pole sprzedaży, jedno „Zapłać”;
 *  - `gm` — tryb MG: dowolne „Dokąd”, bez zgód (na kartę gracza — propozycja);
 *  - `container` — pojemnik (46b).
 *
 * Listę drugich stron buduje **serwer** (`exchange:counterparts`), bo o zasięgu,
 * o tym, czyja karta stoi za figurą, i o tym, czy ciało leży, klient gracza nie
 * wie. Ten plik mówi tylko, jaki rodzaj wynika z faktów, które serwer zebrał —
 * żeby lista u gracza i odmowa przy wykonaniu nie rozjechały się w dwóch
 * miejscach.
 */

import type { TokenCondition } from './figures.js';
import type { MerchantClosedReason } from './merchants.js';

export type ExchangeCounterpartKind = 'trade' | 'loot' | 'merchant' | 'gm' | 'container';

/** Dlaczego pozycja na liście jest wyszarzona — widać ją, ale kliknąć się nie da. */
export type ExchangeUnavailable = 'OUT_OF_REACH' | 'MERCHANT_CLOSED' | 'MERCHANT_KEEPER_DOWN';

export const EXCHANGE_UNAVAILABLE_LABELS: Record<ExchangeUnavailable, string> = {
  OUT_OF_REACH: 'Za daleko',
  MERCHANT_CLOSED: 'Zamknięte',
  MERCHANT_KEEPER_DOWN: 'Handlarz nie obsłuży',
};

export const EXCHANGE_KIND_LABELS: Record<ExchangeCounterpartKind, string> = {
  trade: 'Handel',
  loot: 'Przeszukanie',
  merchant: 'Sklep',
  gm: 'Tryb MG',
  container: 'Pojemnik',
};

/** Fakty o drugiej stronie, które zebrał serwer. */
export interface ExchangeFacts {
  /** Patrzący jest MG. */
  isGm: boolean;
  /** Właściciel karty, z której otwarto okno (`null` — NPC, którego prowadzi MG). */
  anchorOwnerId: string | null;
  /** Właściciel karty drugiej strony (`null` — NPC). */
  ownerId: string | null;
  /** Stan figury drugiej strony; `null`, gdy nie stoi na wspólnej scenie. */
  condition: TokenCondition | null;
  /** Sklep tej karty, jeśli jest handlarzem: `null` w `closed` znaczy „sprzedaje”. */
  merchant: { closed: MerchantClosedReason | null } | null;
}

export interface ExchangeOption {
  kind: ExchangeCounterpartKind;
  unavailable?: ExchangeUnavailable;
}

function lying(condition: TokenCondition | null): boolean {
  return condition === 'down' || condition === 'dead';
}

/**
 * Jakie pozycje dostaje patrzący dla jednej drugiej strony — zero, jedna albo
 * (u MG) dwie. Zasięgu tu nie ma: to pytanie o odległość, a odległość zna
 * serwer i dopisuje `OUT_OF_REACH` sam.
 *
 * Gracz:
 *  - karta z właścicielem (drużyna) → handel;
 *  - NPC leżący albo martwy → łup — także martwy handlarz, którego ekwipunek
 *    staje się łupem (decyzja MG 7);
 *  - NPC-handlarz → sklep, wyszarzony, gdy MG go zamknął;
 *  - żywy NPC → handel (jego stronę prowadzi MG).
 *
 * MG: tryb MG zawsze, a do tego handel jako NPC z kartą gracza (rozstrzygnięcie
 * 38c — MG prowadzi stronę NPC-a, nigdy gracza) i sklep, gdy jest otwarty.
 * Zamknięty sklep MG widzi jako zwykłego NPC-a.
 */
export function exchangeOptionsFor(facts: ExchangeFacts): ExchangeOption[] {
  const { isGm, anchorOwnerId, ownerId, condition, merchant } = facts;
  if (isGm) {
    const options: ExchangeOption[] = [];
    if (merchant && merchant.closed === null) options.push({ kind: 'merchant' });
    if (anchorOwnerId === null && ownerId !== null) options.push({ kind: 'trade' });
    options.push({ kind: 'gm' });
    return options;
  }
  if (ownerId !== null) return [{ kind: 'trade' }];
  if (lying(condition)) return [{ kind: 'loot' }];
  if (merchant) {
    if (merchant.closed === 'closed') return [{ kind: 'merchant', unavailable: 'MERCHANT_CLOSED' }];
    return [{ kind: 'merchant' }];
  }
  return [{ kind: 'trade' }];
}

/**
 * Kolejność na liście: najpierw to, co da się kliknąć, potem bliżej, potem
 * nazwa. Zdalne sklepy i karty poza sceną (bez metrów) idą za figurami.
 */
export function compareExchangeCounterparts(
  a: { name: string; metres?: number; unavailable?: ExchangeUnavailable },
  b: { name: string; metres?: number; unavailable?: ExchangeUnavailable },
): number {
  const blockedA = a.unavailable ? 1 : 0;
  const blockedB = b.unavailable ? 1 : 0;
  if (blockedA !== blockedB) return blockedA - blockedB;
  const metresA = a.metres ?? Number.POSITIVE_INFINITY;
  const metresB = b.metres ?? Number.POSITIVE_INFINITY;
  if (metresA !== metresB) return metresA - metresB;
  return a.name.localeCompare(b.name, 'pl');
}
