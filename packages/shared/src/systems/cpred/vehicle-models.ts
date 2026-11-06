/**
 * Modele aut do kupienia (etap 67, zlecenie MG z 06.11.2026).
 *
 * Podręcznik zna trzy klasy aut (kompakt, sportowy, supersamochód) — bez
 * wyglądu i bez marki. Model to **nasz** wpis: nazwa, grafika MG, układ
 * foteli, cena i poziom dostępności, a liczby (PUK, Ruch, rodzaj, Tabor) bierze
 * z klasy. Dzięki temu publiczny plik `data/public/cpred/vehicle-models.json`
 * nie przepisuje niczego z podręcznika: klasy leżą w `data/private`, a model
 * podaje tylko rodzaj klasy (`compact` / `sport` / `super`). Id klas stoją
 * w kodzie (`CPRED_VEHICLE_CLASS_IDS`, jak `CPRED_FLEET_COMPACT_ID`), żeby
 * plik w repo nie nazywał wpisów katalogu (strażnik licencji); druga pozycja to
 * wymyślona klasa próbki z repo, więc świeży klon też ma salon.
 *
 * Decyzje MG z 06.11: gracz kupuje **model** („wygląd = model”, nazwę zmienia,
 * wyglądu nie), kupuje go z Kompendium i u handlarza z kategorią „Pojazdy”,
 * sprzedaży nie ma. Modele służb (`forSale: false`) daje tylko MG.
 */

import {
  isShopTier,
  type CompendiumEntry,
  type CompendiumRegistry,
  type ShopTier,
  type VehicleEntry,
} from './compendium.js';
import { entryPrice } from './economy.js';
import { cpredHaggledPrice } from './roleability.js';
import { CPRED_VEHICLE_SEATS_MAX } from './vehicles.js';

export const CPRED_VEHICLE_CLASSES = ['compact', 'sport', 'super', 'bike'] as const;
export type CpredVehicleClass = (typeof CPRED_VEHICLE_CLASSES)[number];

/** Klasa → wpisy katalogu, z których model bierze liczby; pierwszy istniejący wygrywa. */
export const CPRED_VEHICLE_CLASS_IDS: Record<CpredVehicleClass, readonly string[]> = {
  compact: ['vehicle.samochod-kompaktowy', 'vehicle.sample-kompakt'],
  sport: ['vehicle.samochod-sportowy', 'vehicle.sample-kompakt'],
  super: ['vehicle.supersamochod', 'vehicle.sample-strzala'],
  bike: ['vehicle.motocykl', 'vehicle.sample-skuter-miejski'],
};

function isCpredVehicleClass(value: unknown): value is CpredVehicleClass {
  return typeof value === 'string' && (CPRED_VEHICLE_CLASSES as readonly string[]).includes(value);
}

export interface CpredVehicleModel {
  /** Id wpisu kompendium, np. `vehicle.kagero`. */
  id: string;
  name: string;
  /** Klasa z katalogu, z której model bierze liczby. */
  class: CpredVehicleClass;
  /** Wbudowana grafika (`/art/vehicles/…`), rysowana przodem do góry. */
  art: string;
  /** Fotele modelu; brak — jak w klasie. 6 to zasada domowa (MG 06.11). */
  seats?: number;
  /** Furgon z wyglądu: bryła i rzędy furgonu (`van-6`), nie auta (MG 06.11). */
  van?: boolean;
  /** Cena w ed cennika domowego; brak — cena klasy. */
  price?: number;
  /** Czy gracz może go kupić; `false` — służby, daje je MG. */
  forSale: boolean;
  tier?: ShopTier;
  description?: string;
}

/** Wbudowana grafika pojazdu — ten sam kształt, co `isVehicleArtUrl` w rdzeniu. */
const ART_PATTERN = /^\/art\/vehicles\/[a-z0-9-]+\.(webp|png|jpg)$/;

/**
 * Plik modeli: `{ "models": [ … ] }`. Zły wpis odpada sam, z opisem w `issues`
 * — jedna literówka nie może zamknąć salonu.
 */
export function parseVehicleModels(raw: unknown): {
  models: CpredVehicleModel[];
  issues: string[];
} {
  const issues: string[] = [];
  const list =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as { models?: unknown }).models)
      ? ((raw as { models: unknown[] }).models as unknown[])
      : null;
  if (!list) return { models: [], issues: ['Brak tablicy „models”.'] };
  const models: CpredVehicleModel[] = [];
  list.forEach((item, index) => {
    const where = `models[${index}]`;
    if (typeof item !== 'object' || item === null) {
      issues.push(`${where}: to nie jest obiekt.`);
      return;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' && /^vehicle\.[a-z0-9-]+$/.test(row.id) ? row.id : null;
    const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null;
    const vehicleClass = isCpredVehicleClass(row.class) ? row.class : null;
    const art = typeof row.art === 'string' && ART_PATTERN.test(row.art) ? row.art : null;
    if (!id || !name || !vehicleClass || !art) {
      issues.push(
        `${where}: potrzebne id „vehicle.…”, name, class (compact/sport/super/bike) i art z /art/vehicles/.`,
      );
      return;
    }
    const model: CpredVehicleModel = {
      id,
      name,
      class: vehicleClass,
      art,
      forSale: row.forSale === true,
    };
    if (row.van === true) model.van = true;
    if (row.seats !== undefined) {
      if (
        typeof row.seats !== 'number' ||
        !Number.isInteger(row.seats) ||
        row.seats < 1 ||
        row.seats > CPRED_VEHICLE_SEATS_MAX
      ) {
        issues.push(`${where}.seats: liczba od 1 do ${CPRED_VEHICLE_SEATS_MAX}.`);
        return;
      }
      model.seats = row.seats;
    }
    if (row.price !== undefined) {
      if (typeof row.price !== 'number' || !Number.isInteger(row.price) || row.price <= 0) {
        issues.push(`${where}.price: dodatnia liczba całkowita.`);
        return;
      }
      model.price = row.price;
    }
    if (row.tier !== undefined) {
      if (!isShopTier(row.tier)) {
        issues.push(`${where}.tier: poziom 1–4.`);
        return;
      }
      model.tier = row.tier;
    }
    if (typeof row.description === 'string' && row.description.trim() !== '') {
      model.description = row.description.trim();
    }
    models.push(model);
  });
  return { models, issues };
}

/** Wpis kompendium modelu z jego klasy; `null` — żadnej klasy nie ma w katalogu. */
export function cpredVehicleModelEntry(
  model: CpredVehicleModel,
  classOf: (id: string) => CompendiumEntry | undefined,
): VehicleEntry | null {
  const base = CPRED_VEHICLE_CLASS_IDS[model.class]
    .map((id) => classOf(id))
    .find((entry): entry is VehicleEntry => entry?.category === 'vehicle');
  if (!base) return null;
  const entry: VehicleEntry = {
    id: model.id,
    category: 'vehicle',
    name: model.name,
    cost: model.price ?? base.cost,
    vehicleKind: base.vehicleKind,
    hp: base.hp,
    seats: model.seats ?? base.seats,
    move: base.move,
    art: model.art,
    classId: base.id,
    forSale: model.forSale,
    ...(model.van ? { van: true } : {}),
    source: `Model VTT na klasie „${base.name}”`,
  };
  if (base.costCategory) entry.costCategory = base.costCategory;
  if (base.speedKmh !== undefined) entry.speedKmh = base.speedKmh;
  // Tabor Rodziny: Nomada bierze model od progu jego klasy — ale tylko taki,
  // który da się kupić; radiowóz z Taboru byłby furtką obok decyzji MG.
  if (base.motoLevel !== undefined && model.forSale) entry.motoLevel = base.motoLevel;
  if (model.tier !== undefined) entry.tier = model.tier;
  if (model.description) entry.description = model.description;
  return entry;
}

/**
 * Modele dopisane do katalogu z plików — **po** przeliczeniu cen
 * (`cpredScaleCatalogPrices`): cena modelu jest już w cenniku domowym, a cena
 * klasy, którą model dziedziczy bez własnej, też. Model o id, które katalog
 * już ma, zastępuje wpis (prywatny plik grupy może podmienić model z repo).
 */
export function withVehicleModels(
  registry: CompendiumRegistry,
  models: readonly CpredVehicleModel[],
): { registry: CompendiumRegistry; skipped: string[] } {
  if (models.length === 0) return { registry, skipped: [] };
  const added = new Map<string, VehicleEntry>();
  const skipped: string[] = [];
  for (const model of models) {
    const entry = cpredVehicleModelEntry(model, (id) => registry.entryById.get(id));
    if (entry) added.set(entry.id, entry);
    else skipped.push(model.id);
  }
  const entries = [...registry.entries.filter((entry) => !added.has(entry.id)), ...added.values()];
  return {
    registry: {
      ...registry,
      entries,
      entryById: new Map(entries.map((entry) => [entry.id, entry])),
    },
    skipped,
  };
}

/** Pojazd, który gracz kupuje: model z wyglądem, na sprzedaż, z ceną. */
export function cpredVehicleForSale(entry: CompendiumEntry): entry is VehicleEntry & {
  art: string;
} {
  return (
    entry.category === 'vehicle' &&
    entry.forSale === true &&
    typeof entry.art === 'string' &&
    entry.cost !== null &&
    entry.cost > 0
  );
}

/** Czy to model z wyglądem (gracz nie zmienia mu grafiki — „wygląd = model”). */
export function cpredVehicleIsModel(entry: CompendiumEntry | undefined | null): boolean {
  return entry?.category === 'vehicle' && typeof entry.art === 'string';
}

/**
 * Cena auta dla kupującego — **jedna** funkcja dla przycisku i serwera.
 * `priceMul` (procent) — u handlarza, jak cena wiersza półki
 * (`cpredShelfPrice`: katalog × mnożnik, zaokrąglone); bez niego — Kompendium.
 * Targ Fixera (`discount`, 30d) schodzi z tego zakupu jak z każdego innego.
 */
export function cpredVehicleQuote(
  entry: CompendiumEntry,
  options: { priceMul?: number; discount?: number } = {},
): { listed: number; price: number } | null {
  const catalog = entryPrice(entry);
  if (catalog === null) return null;
  const listed =
    options.priceMul === undefined ? catalog : Math.round((catalog * options.priceMul) / 100);
  return { listed, price: cpredHaggledPrice(listed, options.discount ?? 0) };
}

/** „Supersamochód · 2 fotele · PUK 50 · Ruch 60” — wiersz pod nazwą modelu. */
export function cpredVehicleModelDetail(entry: VehicleEntry, className?: string): string {
  return [
    className,
    `${entry.seats} ${entry.seats === 1 ? 'fotel' : entry.seats < 5 ? 'fotele' : 'foteli'}`,
    `PUK ${entry.hp}`,
    `Ruch ${entry.move}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
