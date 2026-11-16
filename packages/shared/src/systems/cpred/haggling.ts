/**
 * Handel i pieniądze Fixera (etap 71e, G20–G23; s. 159–161 i FAQ).
 *
 * Targowanie się z 30d liczyło jedno: zniżkę przy zakupie, a sumę drugiej
 * strony wpisywał gracz (domyślnie 0 — targ wygrywał się z nikim). Ten moduł
 * dokłada to, co da się policzyć do końca:
 *
 *  - **rzut sporny przy ladzie (G20, FIX-01, FIX-14)** — sumę drugiej strony
 *    (CHA + Handel + Znajomości) daje karta handlarza; poza sklepem podaje ją
 *    MG (`haggleOpponent` na karcie Fixera, zużywany przez rzut). Handlarz,
 *    który sam jest Fixerem, przy skupie płaci o 10% albo 20% mniej (wg swoich
 *    Znajomości), dopóki sprzedający nie wygra z nim rzutu spornego — tak mówi
 *    FAQ („Fixer nie jest głupi”). Jeden rzut na handlarza do transakcji;
 *  - **targ procentowy działa też przy sprzedaży (G21, FIX-04)** — „sprzedajesz
 *    o 10% drożej albo kupujesz o 10% taniej”: w jednej transakcji targ idzie
 *    na stronę koszyka, która waży więcej w ed (remis — zakup);
 *  - **szósta sztuka gratis (G22, FIX-05)** — jedna pozycja koszyka z co
 *    najmniej sześcioma sztukami: najdroższa taka sztuka za darmo;
 *  - **pół teraz, pół za miesiąc (G23, FIX-06)** — rzeczy Luksusowe
 *    i Superluksusowe (sztuka od 5000 ed): połowa trafia na kartę jako rata
 *    z terminem miesiąca kalendarza, a niespłacona w terminie zamyka ten targ
 *    na zawsze (`halfLaterClosed`) i zostawia MG przypomnienie.
 *
 * Czysta logika bez importu wartości z `character.ts` — to `character.ts`
 * czyta stąd czytniki.
 */

import {
  CPRED_HAGGLE_OPPONENT_MAX,
  cpredHaggleDeal,
  cpredHaggledPrice,
  type CpredHaggleStruck,
} from './roleability.js';

/* ------------------------------------------------------------------ *
 * G20 — druga strona targu
 * ------------------------------------------------------------------ */

/**
 * Suma drugiej strony podana przez MG (poza sklepem). Zużywa ją jeden rzut —
 * wygrany albo przegrany; drugi rzut wymaga drugiej decyzji MG.
 */
export interface CpredHaggleOpponent {
  bonus: number;
  /** Kto to jest — „Paser Wiktor”; pusto, gdy MG nie podał. */
  label: string;
}

const LABEL_MAX = 60;

export function readCpredHaggleOpponent(raw: unknown): CpredHaggleOpponent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.bonus !== 'number' || !Number.isFinite(input.bonus)) return null;
  const bonus = Math.round(input.bonus);
  if (bonus < 0 || bonus > CPRED_HAGGLE_OPPONENT_MAX) return null;
  return {
    bonus,
    label: typeof input.label === 'string' ? input.label.trim().slice(0, LABEL_MAX) : '',
  };
}

/** Składniki sumy drugiej strony liczonej z karty handlarza. */
export interface CpredCounterSide {
  cool: number;
  trading: number;
  /** Znajomości handlarza; 0, gdy nie jest Fixerem. */
  operator: number;
}

export function cpredCounterBonus(side: CpredCounterSide): number {
  return Math.min(
    CPRED_HAGGLE_OPPONENT_MAX,
    Math.max(0, side.cool) + Math.max(0, side.trading) + Math.max(0, side.operator),
  );
}

/**
 * Ile handlarz-Fixer urywa przy skupie temu, kto z nim nie wygrał — „o 10% do
 * 20% mniej (w zależności od swojego poziomu Znajomości)” (FAQ). Progi to
 * progi targów 10% i 20% z drabiny Znajomości (poziom 1 i 9). Handlarz bez
 * Znajomości nie urywa nic: jego cenę skupu ustawia MG w sklepie.
 */
export function cpredMerchantSaleCut(operatorRank: number | null): number {
  if (operatorRank === null || operatorRank < 1) return 0;
  return operatorRank >= 9 ? 20 : 10;
}

/**
 * Wynik rzutu spornego przy ladzie jednego handlarza. Blokuje drugi rzut
 * u tego samego handlarza, dopóki nie przejdzie transakcja (zdejmuje go
 * `merchant:deal`), a wygrana zdejmuje cięcie skupu handlarza-Fixera.
 */
export interface CpredCounterHaggle {
  merchantId: string;
  won: boolean;
  /** „17 vs 14” — do dymka. */
  note: string;
}

export function readCpredCounterHaggle(raw: unknown): CpredCounterHaggle | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.merchantId !== 'string' || input.merchantId.length === 0) return null;
  if (input.merchantId.length > 64) return null;
  return {
    merchantId: input.merchantId,
    won: input.won === true,
    note: typeof input.note === 'string' ? input.note.slice(0, 120) : '',
  };
}

/**
 * Czy dobity targ działa w tym miejscu. Targ dobity przy ladzie handlarza
 * (`merchantId`) działa tylko u niego; targ z MG — wszędzie (Kompendium,
 * salon aut, każdy sklep), jak od 30d. `null` — poza sklepem.
 */
export function cpredHaggleUsableAt(
  haggle: CpredHaggleStruck | null | undefined,
  merchantId: string | null,
): CpredHaggleStruck | null {
  if (!haggle) return null;
  if (haggle.merchantId !== undefined && haggle.merchantId !== merchantId) return null;
  return haggle;
}

/** Zniżka procentowa targu w tym miejscu — dla zakupów poza oknem „Wymiana”. */
export function cpredHaggleDiscountAt(
  haggle: CpredHaggleStruck | null | undefined,
  merchantId: string | null,
): number {
  const usable = cpredHaggleUsableAt(haggle, merchantId);
  return usable && usable.discount > 0 ? usable.discount : 0;
}

/* ------------------------------------------------------------------ *
 * G21–G23 — targ na koszyku
 * ------------------------------------------------------------------ */

/** Pozycja koszyka, jak widzi ją targ: cena sztuki i liczba sztuk. */
export interface CpredHaggleLine {
  price: number;
  qty: number;
}

/** Co targ zrobił z jedną transakcją. */
export interface CpredHaggleEffect {
  /** Ile targ zdjął z zakupów (10% / 20% albo szósta sztuka). */
  buyOff: number;
  /** Ile targ dołożył do sprzedaży (10% / 20%). */
  sellUp: number;
  /** Ile z zakupów przechodzi na ratę za miesiąc („pół teraz, pół za miesiąc”). */
  deferred: number;
  /** Targ zadziałał — schodzi z karty w tym samym zapisie. */
  spent: boolean;
}

const NO_EFFECT: CpredHaggleEffect = { buyOff: 0, sellUp: 0, deferred: 0, spent: false };

/**
 * Sztuka od tej ceny to rzecz Luksusowa albo Superluksusowa (s. 342) — to samo
 * co `COST_CATEGORY_PRICE.luxury` (pilnuje test). Liczba, nie import: ten moduł
 * czyta `character.ts`, a `economy.ts` czyta `character.ts` — cykl.
 */
export const CPRED_LUXURY_PRICE = 5000;

export function cpredIsLuxuryPrice(price: number): boolean {
  return price >= CPRED_LUXURY_PRICE;
}

/** Ile z ceny rzeczy Luksusowych przechodzi na ratę — połowa, w dół na korzyść kupującego teraz. */
export function cpredHalfLaterDeferred(luxuryTotal: number): number {
  return Math.floor(Math.max(0, luxuryTotal) / 2);
}

/**
 * Targ na jednej transakcji. `sellSum` to suma skupu **po** cięciu
 * handlarza-Fixera — targ procentowy porównuje strony w tym, co naprawdę
 * przechodzi z ręki do ręki.
 */
export function cpredHaggleOnDeal(
  haggle: CpredHaggleStruck | null,
  lines: readonly CpredHaggleLine[],
  sellSum: number,
  options: { halfLaterClosed?: boolean } = {},
): CpredHaggleEffect {
  if (!haggle) return NO_EFFECT;
  const buySum = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const deal = cpredHaggleDeal(haggle.dealId);
  if (!deal) return NO_EFFECT;

  if (haggle.discount > 0) {
    if (buySum <= 0 && sellSum <= 0) return NO_EFFECT;
    if (buySum >= sellSum) {
      return {
        ...NO_EFFECT,
        buyOff: buySum - cpredHaggledPrice(buySum, haggle.discount),
        spent: true,
      };
    }
    return {
      ...NO_EFFECT,
      sellUp: cpredRaisedPrice(sellSum, haggle.discount) - sellSum,
      spent: true,
    };
  }

  if (deal.id === 'sixthFree') {
    let best = 0;
    for (const line of lines) {
      if (line.qty >= 6 && line.price > best) best = line.price;
    }
    return best > 0 ? { ...NO_EFFECT, buyOff: best, spent: true } : NO_EFFECT;
  }

  if (deal.id === 'halfLater') {
    if (options.halfLaterClosed) return NO_EFFECT;
    const luxury = lines
      .filter((line) => cpredIsLuxuryPrice(line.price))
      .reduce((sum, line) => sum + line.price * line.qty, 0);
    const deferred = cpredHalfLaterDeferred(luxury);
    return deferred > 0 ? { ...NO_EFFECT, deferred, spent: true } : NO_EFFECT;
  }

  // Podwyżka dla Ekipy i podwójna zapłata — pieniądze spoza sklepu (prozą).
  return NO_EFFECT;
}

/** Cena sprzedaży po targu — w dół, na korzyść kupującego handlarza. */
export function cpredRaisedPrice(price: number, percent: number): number {
  if (percent <= 0) return price;
  return Math.floor((price * (100 + percent)) / 100);
}

/** Cena skupu po cięciu handlarza-Fixera — w dół. */
export function cpredCutPrice(price: number, percent: number): number {
  if (percent <= 0) return price;
  return Math.floor((price * (100 - percent)) / 100);
}

/* ------------------------------------------------------------------ *
 * G23 — raty
 * ------------------------------------------------------------------ */

/** Rata „pół teraz, pół za miesiąc” na karcie kupującego. */
export interface CpredDebt {
  id: string;
  /** U kogo — nazwa sklepu albo „Kompendium”. */
  creditor: string;
  /** Co kupiono — do wiersza na karcie. */
  label: string;
  amount: number;
  /** Termin na zegarze świata (minuty). */
  dueAtMinute: number;
  /** Termin minął bez spłaty — targ zamknięty, MG dostał przypomnienie. */
  overdue?: true;
}

/** Najwięcej rat naraz — powyżej to błąd, nie zakupy. */
export const CPRED_DEBTS_MAX = 12;

export function readCpredDebts(raw: unknown): CpredDebt[] {
  if (!Array.isArray(raw)) return [];
  const debts: CpredDebt[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 40) continue;
    if (seen.has(row.id)) continue;
    if (typeof row.amount !== 'number' || !Number.isInteger(row.amount) || row.amount <= 0) {
      continue;
    }
    if (typeof row.dueAtMinute !== 'number' || !Number.isFinite(row.dueAtMinute)) continue;
    seen.add(row.id);
    debts.push({
      id: row.id,
      creditor: typeof row.creditor === 'string' ? row.creditor.slice(0, 80) : '',
      label: typeof row.label === 'string' ? row.label.slice(0, 160) : '',
      amount: row.amount,
      dueAtMinute: Math.round(row.dueAtMinute),
      ...(row.overdue === true ? { overdue: true as const } : {}),
    });
  }
  return debts.slice(0, CPRED_DEBTS_MAX);
}

/** Termin raty: ten sam dzień i godzina miesiąc później w kalendarzu świata. */
export function cpredDebtDue(nowMinutes: number): number {
  const date = new Date(nowMinutes * 60_000);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  // 31 stycznia + miesiąc = ostatni dzień lutego, nie 3 marca.
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return Math.trunc(date.getTime() / 60_000);
}

/** Raty, którym termin właśnie minął (jeszcze nie oznaczone jako zaległe). */
export function cpredDebtsFallingDue(
  debts: readonly CpredDebt[],
  nowMinutes: number | null,
): CpredDebt[] {
  if (nowMinutes === null) return [];
  return debts.filter((debt) => debt.overdue !== true && nowMinutes >= debt.dueAtMinute);
}

export type CpredHaggleMoneyProblem =
  'NO_OPPONENT' | 'ALREADY_HAGGLED' | 'NOTHING_TO_HAGGLE' | 'DEAL_CLOSED' | 'DEBT_NOT_FOUND';

export const CPRED_HAGGLE_MONEY_PROBLEMS: Record<CpredHaggleMoneyProblem, string> = {
  NO_OPPONENT:
    'Sumę drugiej strony podaje MG — poproś go o nią albo targuj się przy ladzie handlarza.',
  ALREADY_HAGGLED: 'Z tym handlarzem już się targowałeś — kolejny rzut dopiero po transakcji.',
  NOTHING_TO_HAGGLE:
    'Ten handlarz nie jest Fixerem — bez targu Znajomości nie ma się tu o co spierać.',
  DEAL_CLOSED: 'Niespłacona rata zamknęła ten targ na zawsze.',
  DEBT_NOT_FOUND: 'Nie ma takiej raty.',
};
