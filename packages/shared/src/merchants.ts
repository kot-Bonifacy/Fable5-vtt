/**
 * Sklep jako miejsce w świecie (etap 46a, wzór: *Merchant* z Item Piles).
 *
 * Rdzeń VTT, nie CP RED: tutaj mieszka wyłącznie to, **czym jest sklep** —
 * szyld, otwarte / zamknięte, przy figurze albo zdalny, mnożnik cen, odkup,
 * kasa i nakładka MG na wiersze towaru („bez dna”, „ukryty”, własna cena).
 * Skąd się bierze cena wiersza i jak rzeczy przechodzą z karty na kartę, wie
 * system (`systems/cpred/merchant.ts`).
 *
 * Rozstrzygnięcia MG z 08.10.2026, których pilnuje ten plik:
 *
 *  1. **Sklep = handlarz-figura.** Towarem jest ekwipunek karty NPC-a, a jego
 *     ustawienia mieszkają w osobnej tabeli `Merchant`, nie w arkuszu — decyzja
 *     MG nie jedzie autozapisem karty (ta sama umowa co `eddies` i `playReady`).
 *     Publicznym uchwytem sklepu jest `Merchant.id`; id karty handlarza gracz
 *     nie poznaje nigdy (umowa `ekwipunek`, #40).
 *  2. **Zakup bez zgody MG, gdy sklep jest otwarty.** Otwartość to przełącznik
 *     MG **i** żywy handlarz: leżący albo martwy nie sprzedaje, a jego
 *     ekwipunek staje się łupem.
 *  3. **Odkup za procent ceny katalogowej**, domyślnie 50%; 0% znaczy „nie
 *     skupuje”. Kasa jest skończona (eurodolce karty) albo „bez dna”.
 */

import type { TokenCondition } from './figures.js';

/** `reach` — przy figurze, na wyciągnięcie ręki; `remote` — z doku, bez figury. */
export type MerchantAccess = 'reach' | 'remote';

export const MERCHANT_ACCESS: readonly MerchantAccess[] = ['reach', 'remote'];

export function isMerchantAccess(value: unknown): value is MerchantAccess {
  return typeof value === 'string' && (MERCHANT_ACCESS as readonly string[]).includes(value);
}

/** Najdłuższy szyld: „Spod lady”, „Sieć Militechu”. */
export const MERCHANT_SIGN_MAX = 40;

/** Najwyższy mnożnik ceny sprzedaży — dziesięciokrotność katalogu wystarczy każdemu paserowi. */
export const MERCHANT_PRICE_MUL_MAX = 1000;

/** Najwyższy procent odkupu — powyżej katalogu sklep płaciłby za to, że ktoś przyszedł. */
export const MERCHANT_BUY_BACK_MAX = 100;

/** Najwyższa cena wpisana ręką przy wierszu. */
export const MERCHANT_ROW_PRICE_MAX = 10_000_000;

/** Ustawienia sklepu tak, jak trzyma je tabela `Merchant` (bez nakładki wierszy). */
export interface MerchantSettings {
  /** Szyld przy stole; pusty = nazwa figury handlarza. */
  sign: string;
  /** Przełącznik MG „Otwarte”. */
  open: boolean;
  access: MerchantAccess;
  /** Sklep działa na ekranie „Między sesjami” (bez mapy i bez zasięgu). */
  betweenSessions: boolean;
  /** Procent ceny katalogowej przy sprzedaży graczowi (100 = katalog). */
  priceMul: number;
  /** Procent ceny katalogowej przy odkupie od gracza (0 = nie skupuje). */
  buyBackPct: number;
  /** Kasa „bez dna” — handlarz płaci zawsze, a jego karta nie zapisuje ruchów gotówki. */
  cashInfinite: boolean;
}

export const MERCHANT_DEFAULTS: MerchantSettings = {
  sign: '',
  open: false,
  access: 'reach',
  betweenSessions: false,
  priceMul: 100,
  buyBackPct: 50,
  cashInfinite: false,
};

/**
 * Nakładka MG na jeden wiersz towaru. Klucz w mapie to `lista:id wiersza`
 * (`merchantRowKey`) — id wiersza jest unikalne w obrębie listy karty, a nie
 * całej karty.
 */
export interface MerchantRowOverlay {
  /** „∞” — wiersz sprzedaje kopie bez końca i sam nie ubywa. */
  infinite?: true;
  /** Wiersz nie jest na półce gracza (dane niewidoczne dla gracza — filtr serwera). */
  hidden?: true;
  /** Cena za sztukę wpisana przez MG; wygrywa z katalogiem i NIE mnoży się przez `priceMul`. */
  price?: number;
}

export type MerchantRowOverlays = Record<string, MerchantRowOverlay>;

export function merchantRowKey(list: string, rowId: string): string {
  return `${list}:${rowId}`;
}

function isPrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MERCHANT_ROW_PRICE_MAX
  );
}

/** Jedna nakładka z żądania albo z bazy; `null`, gdy nie zostało w niej nic. */
export function readMerchantRowOverlay(raw: unknown): MerchantRowOverlay | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const overlay: MerchantRowOverlay = {};
  if (source.infinite === true) overlay.infinite = true;
  if (source.hidden === true) overlay.hidden = true;
  if (isPrice(source.price)) overlay.price = source.price;
  return Object.keys(overlay).length > 0 ? overlay : null;
}

/**
 * Nakładki z kolumny `Merchant.rows`. Śmieć w bazie (ręczna edycja, stary
 * zapis) daje pustą mapę albo pomija złe wpisy — półka nie może przestać się
 * rysować przez jeden krzywy wiersz.
 */
export function readMerchantRows(raw: unknown): MerchantRowOverlays {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const result: MerchantRowOverlays = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const overlay = readMerchantRowOverlay(value);
    if (overlay) result[key] = overlay;
  }
  return result;
}

/**
 * Nakładki wyłącznie dla wierszy, które istnieją. Wiersz sprzedany do zera
 * znika z karty, a jego klucz nie może przeżyć: rzecz odkupiona od gracza
 * mogłaby wylądować z tym samym id i odziedziczyć cudze „ukryty” albo cenę.
 */
export function pruneMerchantRows(
  overlays: MerchantRowOverlays,
  existing: ReadonlySet<string>,
): MerchantRowOverlays {
  const result: MerchantRowOverlays = {};
  for (const [key, overlay] of Object.entries(overlays)) {
    if (existing.has(key)) result[key] = overlay;
  }
  return result;
}

function isPct(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * Zmiana ustawień z żądania MG (`merchant:config`). Zwraca `null`, gdy
 * którekolwiek pole jest złe — przycięcie liczby klienta schowałoby błąd za
 * działającym suwakiem (ta sama zasada co `shop:tier`).
 */
export function readMerchantSettingsPatch(raw: unknown): Partial<MerchantSettings> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const patch: Partial<MerchantSettings> = {};
  if (source.sign !== undefined) {
    if (typeof source.sign !== 'string') return null;
    patch.sign = source.sign.trim().slice(0, MERCHANT_SIGN_MAX);
  }
  for (const key of ['open', 'betweenSessions', 'cashInfinite'] as const) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean') return null;
    patch[key] = source[key];
  }
  if (source.access !== undefined) {
    if (!isMerchantAccess(source.access)) return null;
    patch.access = source.access;
  }
  if (source.priceMul !== undefined) {
    if (!isPct(source.priceMul, MERCHANT_PRICE_MUL_MAX) || source.priceMul === 0) return null;
    patch.priceMul = source.priceMul;
  }
  if (source.buyBackPct !== undefined) {
    if (!isPct(source.buyBackPct, MERCHANT_BUY_BACK_MAX)) return null;
    patch.buyBackPct = source.buyBackPct;
  }
  return patch;
}

/** Dlaczego sklep nie sprzedaje — „Zamknięte” od MG albo handlarz, który nie stoi. */
export type MerchantClosedReason = 'closed' | 'keeper';

/**
 * Czy sklep sprzedaje teraz: przełącznik MG **i** handlarz na nogach
 * (rozstrzygnięcie 2). Stan figury liczy się tak, jak rysuje go mapa
 * (`tokenCondition`), a zdalny sklep bez figury — z samych punktów życia.
 */
export function merchantClosedReason(
  settings: Pick<MerchantSettings, 'open'>,
  keeper: TokenCondition,
): MerchantClosedReason | null {
  if (keeper === 'down' || keeper === 'dead') return 'keeper';
  return settings.open ? null : 'closed';
}

export const MERCHANT_CLOSED_LABELS: Record<MerchantClosedReason, string> = {
  closed: 'Zamknięte',
  keeper: 'Handlarz nie obsłuży',
};

/* ------------------------------------------------------------------ *
 * Zakupy z katalogu (przełącznik kampanii)
 * ------------------------------------------------------------------ */

/**
 * „Zakupy z katalogu: wszędzie / tylko u handlarzy” (decyzja MG 2). Domyślnie
 * „wszędzie”, żeby istniejące kampanie grały jak dotąd. Egzekwuje serwer
 * (`economy:buy` gracza → `CATALOG_CLOSED`), nie guzik.
 */
export type CatalogShopping = 'everywhere' | 'merchants';

export const CATALOG_SHOPPING_MODES: readonly CatalogShopping[] = ['everywhere', 'merchants'];

export function isCatalogShopping(value: unknown): value is CatalogShopping {
  return typeof value === 'string' && (CATALOG_SHOPPING_MODES as readonly string[]).includes(value);
}

/** Wartość z bazy; nieznana = „wszędzie” (kampania sprzed etapu nie traci sklepu). */
export function readCatalogShopping(value: unknown): CatalogShopping {
  return isCatalogShopping(value) ? value : 'everywhere';
}

export const CATALOG_SHOPPING_LABELS: Record<CatalogShopping, string> = {
  everywhere: 'wszędzie',
  merchants: 'tylko u handlarzy',
};
