/**
 * Asortyment handlarza z kompendium (zlecenie MG z 02.11.2026).
 *
 * „Dodaj handlarzowi możliwość ustawiania poziomu dostępu do kompendium
 * (zakres przedmiotów, którymi będzie handlował) wraz z kategoriami — tak,
 * aby np. aptekarzowi ustawić 4 poziom Używek i leków, a 1 poziom pozostałych
 * kategorii rzeczy, a podrzędnemu sklepowi z bronią 3 poziom Broń, Pancerz,
 * a 1 poziom pozostałe”.
 *
 * Asortyment to **zakres**: poziom dostępności (`shop.ts`, 1 Uliczne …
 * 4 Czarny rynek) dla „pozostałych” i — po kategorii — własny poziom, który
 * go zastępuje (w górę albo w dół; 0 = tej kategorii handlarz nie prowadzi).
 * Zakres robi dwie rzeczy:
 *
 *  1. **półka z kompendium** — każdy wpis w zakresie, z ceną, stoi na półce
 *     jako wiersz „∞” obok ekwipunku karty (towaru MG). Kupiony wiersz to ten
 *     sam wiersz, który daje „Kup” w Kompendium (`purchasedSheetRow`);
 *  2. **skup** — handlarz z asortymentem odkupuje tylko rzeczy ze swojego
 *     zakresu: aptekarz nie bierze wyrzutni rakiet.
 *
 * Poziom handlarza **nie** patrzy na poziom odblokowany w kampanii — to MG
 * stawia paserowi czarny rynek, a sklepikowi z rogu uliczne. Asortyment `null`
 * (domyślny, także w sklepach sprzed zlecenia) znaczy: półka to wyłącznie
 * ekwipunek karty, skup bez ograniczeń — tak jak od etapu 46a.
 *
 * Amunicji z kompendium handlarz nie wystawia (pudełko wymaga kalibru, 46c) —
 * MG kładzie ją na karcie jako wiersz „∞”. Skup amunicji, cyborgizacji i reszty
 * kategorii spoza listy niżej idzie poziomem „pozostałych”.
 */

import {
  isShopTier,
  resolveWeapon,
  type CompendiumEntry,
  type CompendiumRegistry,
  type ShopTier,
  type VehicleEntry,
  type VehicleUpgradeEntry,
} from './compendium.js';
import { cpredIsChemEntry } from './drugs.js';
import { shopTierOf, type ShopTierContext } from './shop.js';
import { purchasedSheetRow, type PurchasedRow } from './shopping.js';
import { cpredVehicleForSale } from './vehicle-models.js';
import { cpredVehicleUpgradeForSale } from './vehicle-upgrade-shop.js';

/** Kategorie, które MG ustawia osobno — te, które handlarz umie wystawić z kompendium. */
export const CPRED_ASSORTMENT_CATEGORIES = [
  'weapon',
  'attachment',
  'armor',
  'gear',
  'chems',
  'program',
  'vehicle',
  'vehicleUpgrade',
] as const;
export type CpredAssortmentCategory = (typeof CPRED_ASSORTMENT_CATEGORIES)[number];

export const CPRED_ASSORTMENT_CATEGORY_LABELS: Record<CpredAssortmentCategory, string> = {
  weapon: 'Broń',
  attachment: 'Dodatki do broni',
  armor: 'Pancerz',
  gear: 'Sprzęt',
  chems: 'Używki i leki',
  program: 'Programy',
  vehicle: 'Pojazdy',
  vehicleUpgrade: 'Ulepszenia pojazdów',
};

/**
 * Kategorie, których „pozostałe” nie obejmują (etap 67): bez osobnego poziomu
 * handlarz ich nie prowadzi. Apteka z poziomem 4 „pozostałych” nie sprzedaje
 * supersamochodów — salon to decyzja MG. Tak samo warsztat (etap 68):
 * „Ulepszenia pojazdów” i naprawa aut tylko u handlarza z tą kategorią.
 */
export const CPRED_ASSORTMENT_OPT_IN: readonly CpredAssortmentCategory[] = [
  'vehicle',
  'vehicleUpgrade',
];

export function isCpredAssortmentCategory(value: unknown): value is CpredAssortmentCategory {
  return (
    typeof value === 'string' && (CPRED_ASSORTMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Poziom zakresu: 0 — nie handluje, 1–4 — do tego poziomu dostępności włącznie. */
export type CpredAssortmentLevel = 0 | ShopTier;

export function isCpredAssortmentLevel(value: unknown): value is CpredAssortmentLevel {
  return value === 0 || isShopTier(value);
}

export interface CpredMerchantAssortment {
  /** Poziom „pozostałych kategorii” — każdej, której MG nie ustawił osobno. */
  base: CpredAssortmentLevel;
  /** Kategorie ustawione osobno; brak klucza — jak „pozostałe”. */
  categories: Partial<Record<CpredAssortmentCategory, CpredAssortmentLevel>>;
}

/** Asortyment, od którego startuje MG po włączeniu: uliczne we wszystkim. */
export const CPRED_ASSORTMENT_DEFAULT: CpredMerchantAssortment = { base: 1, categories: {} };

/**
 * Asortyment z żądania MG albo z kolumny `Merchant.assortment`. `null` — brak
 * asortymentu (sklep sprzed zlecenia, pusta kolumna, śmieć w bazie). Złe
 * wpisy kategorii odpadają pojedynczo — jedna krzywa kategoria nie może
 * wyłączyć sklepu.
 */
export function readCpredMerchantAssortment(raw: unknown): CpredMerchantAssortment | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as { base?: unknown; categories?: unknown };
  if (!isCpredAssortmentLevel(source.base)) return null;
  const categories: CpredMerchantAssortment['categories'] = {};
  if (
    typeof source.categories === 'object' &&
    source.categories !== null &&
    !Array.isArray(source.categories)
  ) {
    for (const [key, level] of Object.entries(source.categories as Record<string, unknown>)) {
      if (isCpredAssortmentCategory(key) && isCpredAssortmentLevel(level)) {
        categories[key] = level;
      }
    }
  }
  return { base: source.base, categories };
}

/**
 * Żądanie MG ściśle: `null` wyłącza asortyment, obiekt musi być cały dobry.
 * Zwraca `undefined` przy złym kształcie — przycięcie po cichu schowałoby
 * błąd za działającą listą (ta sama zasada co `readMerchantSettingsPatch`).
 */
export function readCpredAssortmentPatch(raw: unknown): CpredMerchantAssortment | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as { base?: unknown; categories?: unknown };
  if (!isCpredAssortmentLevel(source.base)) return undefined;
  const categories: CpredMerchantAssortment['categories'] = {};
  if (source.categories !== undefined) {
    if (
      typeof source.categories !== 'object' ||
      source.categories === null ||
      Array.isArray(source.categories)
    ) {
      return undefined;
    }
    for (const [key, level] of Object.entries(source.categories as Record<string, unknown>)) {
      if (!isCpredAssortmentCategory(key) || !isCpredAssortmentLevel(level)) return undefined;
      categories[key] = level;
    }
  }
  return { base: source.base, categories };
}

/** Kategoria asortymentu wpisu; `null` — rodzaj spoza listy (idzie poziomem „pozostałych”). */
export function cpredAssortmentCategoryOf(entry: CompendiumEntry): CpredAssortmentCategory | null {
  if (entry.category === 'gear') return cpredIsChemEntry(entry) ? 'chems' : 'gear';
  return isCpredAssortmentCategory(entry.category) ? entry.category : null;
}

/** Poziom, do którego handlarz prowadzi tę kategorię. */
export function cpredAssortmentLevel(
  assortment: CpredMerchantAssortment,
  category: CpredAssortmentCategory | null,
): CpredAssortmentLevel {
  if (category === null) return assortment.base;
  const fallback = CPRED_ASSORTMENT_OPT_IN.includes(category) ? 0 : assortment.base;
  return assortment.categories[category] ?? fallback;
}

/** Czy wpis mieści się w zakresie handlarza (półka i skup). Ran krytycznych nikt nie prowadzi. */
export function cpredAssortmentCovers(
  entry: CompendiumEntry,
  assortment: CpredMerchantAssortment,
  context: ShopTierContext = {},
): boolean {
  if (entry.category === 'criticalInjury') return false;
  const level = cpredAssortmentLevel(assortment, cpredAssortmentCategoryOf(entry));
  return level > 0 && shopTierOf(entry, context) <= level;
}

/** Przedrostek id wiersza półki z kompendium — losowe id wierszy karty go nie mają. */
export const CPRED_CATALOG_ROW_PREFIX = 'kat:';

export function cpredCatalogRowId(entryId: string): string {
  return `${CPRED_CATALOG_ROW_PREFIX}${entryId}`;
}

export function isCpredCatalogRowId(rowId: string): boolean {
  return rowId.startsWith(CPRED_CATALOG_ROW_PREFIX);
}

/**
 * Wiersze półki z kompendium: każdy wpis w zakresie, który da się kupić jako
 * wiersz karty (`purchasedSheetRow`), z id `kat:<wpis>`. Kolejność — kolejność
 * katalogu. Cenę liczy dalej `cpredMerchantShelf` tak samo jak przy towarze
 * z karty, więc wpis bez ceny gracz i tu dostaje tylko u MG.
 */
export function cpredAssortmentOffers(
  entries: Iterable<CompendiumEntry>,
  assortment: CpredMerchantAssortment,
  registry: Pick<CompendiumRegistry, 'weaponTypeById'>,
  context: ShopTierContext = {},
): PurchasedRow[] {
  const offers: PurchasedRow[] = [];
  for (const entry of entries) {
    if (!cpredAssortmentCovers(entry, assortment, context)) continue;
    if (cpredAssortmentCategoryOf(entry) === null) continue;
    const resolved = entry.category === 'weapon' ? resolveWeapon(entry, registry) : null;
    const offer = purchasedSheetRow(entry, resolved, cpredCatalogRowId(entry.id));
    if (offer) offers.push(offer);
  }
  return offers;
}

/**
 * Auta w salonie handlarza (etap 67): modele na sprzedaż w jego zakresie
 * „Pojazdy”, w kolejności katalogu. Nie są wierszami półki — kupuje się je
 * `vehicle:buy`, bo pojazd to `Vehicle`, a nie wiersz karty.
 */
export function cpredAssortmentVehicles(
  entries: Iterable<CompendiumEntry>,
  assortment: CpredMerchantAssortment | null,
  context: ShopTierContext = {},
): (VehicleEntry & { art: string })[] {
  if (!assortment) return [];
  const offers: (VehicleEntry & { art: string })[] = [];
  for (const entry of entries) {
    if (cpredVehicleForSale(entry) && cpredAssortmentCovers(entry, assortment, context)) {
      offers.push(entry);
    }
  }
  return offers;
}

/**
 * Warsztat handlarza (etap 68): ulepszenia pojazdów na sprzedaż w jego
 * zakresie „Ulepszenia pojazdów”, w kolejności katalogu. Jak auta — nie
 * wiersze półki, bo kupione siedzi od razu w aucie (`vehicle:upgrade-buy`).
 */
export function cpredAssortmentVehicleUpgrades(
  entries: Iterable<CompendiumEntry>,
  assortment: CpredMerchantAssortment | null,
  context: ShopTierContext = {},
): VehicleUpgradeEntry[] {
  if (!assortment) return [];
  const offers: VehicleUpgradeEntry[] = [];
  for (const entry of entries) {
    if (cpredVehicleUpgradeForSale(entry) && cpredAssortmentCovers(entry, assortment, context)) {
      offers.push(entry);
    }
  }
  return offers;
}

/**
 * Czy handlarz naprawia auta (etap 68): warsztat to kategoria „Ulepszenia
 * pojazdów” z poziomem 1 albo wyższym — naprawa nie ma własnego poziomu.
 */
export function cpredMerchantRepairsVehicles(assortment: CpredMerchantAssortment | null): boolean {
  return assortment !== null && cpredAssortmentLevel(assortment, 'vehicleUpgrade') > 0;
}

/** Jedno zdanie o asortymencie — pod nagłówkiem sekcji „Sklep” i w oknie gracza. */
export function cpredAssortmentSummary(assortment: CpredMerchantAssortment): string {
  const parts = CPRED_ASSORTMENT_CATEGORIES.flatMap((category) => {
    const level = assortment.categories[category];
    if (level === undefined) return [];
    return [`${CPRED_ASSORTMENT_CATEGORY_LABELS[category]} ${level === 0 ? '—' : level}`];
  });
  const base = assortment.base === 0 ? '—' : String(assortment.base);
  return [...parts, `pozostałe ${base}`].join(' · ');
}
