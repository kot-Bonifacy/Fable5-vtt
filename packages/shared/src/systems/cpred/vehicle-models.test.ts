import { describe, expect, it } from 'vitest';
import type { CompendiumEntry, CompendiumRegistry, VehicleEntry } from './compendium.js';
import { cpredAssortmentCovers, cpredAssortmentVehicles } from './assortment.js';
import { cpredVehicleFromCatalog, cpredVehicleLayout, cpredVehicleSize } from './vehicles.js';
import {
  CPRED_VEHICLE_CLASS_IDS,
  cpredVehicleForSale,
  cpredVehicleIsModel,
  cpredVehicleModelDetail,
  cpredVehicleQuote,
  parseVehicleModels,
  withVehicleModels,
} from './vehicle-models.js';

/** Wymyślona klasa jak w próbce z repo — liczby nie z podręcznika. */
const COMPACT: VehicleEntry = {
  id: 'vehicle.sample-kompakt',
  category: 'vehicle',
  name: 'Kompakt Zetka',
  cost: 450,
  costCategory: 'luxury',
  vehicleKind: 'car',
  hp: 45,
  seats: 4,
  move: 20,
  motoLevel: 1,
};

function registryOf(entries: CompendiumEntry[]): CompendiumRegistry {
  return {
    weaponTypes: [],
    weaponTypeById: new Map(),
    entries,
    entryById: new Map(entries.map((entry) => [entry.id, entry])),
  } as unknown as CompendiumRegistry;
}

const FILE = {
  models: [
    {
      id: 'vehicle.ranczer',
      name: '„Ranczer” (pickup)',
      class: 'compact',
      art: '/art/vehicles/ranczer.webp',
      price: 10_000,
      tier: 1,
      forSale: true,
    },
    {
      id: 'vehicle.karetka',
      name: 'Karetka',
      class: 'compact',
      art: '/art/vehicles/karetka.webp',
      seats: 6,
      van: true,
      forSale: false,
    },
    { id: 'vehicle.widmo', name: '„Widmo”', class: 'super', art: '/art/vehicles/widmo.webp' },
    { id: 'zly', name: 'Zły', class: 'compact', art: '/art/vehicles/x.webp' },
    { id: 'vehicle.obcy', name: 'Obcy', class: 'compact', art: 'https://example.com/a.png' },
  ],
};

describe('modele aut (etap 67)', () => {
  it('plik modeli: złe wpisy odpadają pojedynczo z opisem', () => {
    const { models, issues } = parseVehicleModels(FILE);
    expect(models.map((model) => model.id)).toEqual([
      'vehicle.ranczer',
      'vehicle.karetka',
      'vehicle.widmo',
    ]);
    expect(issues).toHaveLength(2);
    expect(parseVehicleModels({}).issues).toEqual(['Brak tablicy „models”.']);
  });

  it('model bierze liczby z klasy, a cenę, fotele i wygląd ma swoje', () => {
    const { models } = parseVehicleModels(FILE);
    const { registry, skipped } = withVehicleModels(registryOf([COMPACT]), models);
    // Klasy „super” próbka tu nie ma — Widmo czeka, aż katalog ją przyniesie.
    expect(skipped).toEqual(['vehicle.widmo']);
    const ranczer = registry.entryById.get('vehicle.ranczer') as VehicleEntry;
    expect(ranczer).toMatchObject({
      name: '„Ranczer” (pickup)',
      cost: 10_000,
      costCategory: 'luxury',
      vehicleKind: 'car',
      hp: 45,
      seats: 4,
      move: 20,
      motoLevel: 1,
      tier: 1,
      art: '/art/vehicles/ranczer.webp',
      classId: 'vehicle.sample-kompakt',
      forSale: true,
    });
    const karetka = registry.entryById.get('vehicle.karetka') as VehicleEntry;
    // Służby: cena klasy, sześć foteli furgonu, bez Taboru — nie ma furtki do radiowozu.
    expect(karetka).toMatchObject({ cost: 450, seats: 6, van: true, forSale: false });
    expect(karetka.motoLevel).toBeUndefined();
    expect(ranczer.van).toBeUndefined();
    // Furgon z wyglądu: bryła 3×7 i rzędy furgonu przy sześciu fotelach.
    const fromModel = cpredVehicleFromCatalog(karetka);
    expect(fromModel.van).toBe(true);
    expect(cpredVehicleLayout(fromModel)).toBe('van-6');
    expect(cpredVehicleSize(fromModel)).toEqual({ widthSq: 3, lengthSq: 7 });
    expect(cpredVehicleLayout(cpredVehicleFromCatalog(ranczer))).toBe('car-4');
    expect(registry.entries).toHaveLength(3);
  });

  it('kupić można tylko model na sprzedaż z wyglądem i ceną', () => {
    const { registry } = withVehicleModels(registryOf([COMPACT]), parseVehicleModels(FILE).models);
    const of = (id: string) => registry.entryById.get(id)!;
    expect(cpredVehicleForSale(of('vehicle.ranczer'))).toBe(true);
    expect(cpredVehicleForSale(of('vehicle.karetka'))).toBe(false);
    expect(cpredVehicleForSale(COMPACT)).toBe(false);
    expect(cpredVehicleIsModel(of('vehicle.karetka'))).toBe(true);
    expect(cpredVehicleIsModel(COMPACT)).toBe(false);
    expect(cpredVehicleIsModel(undefined)).toBe(false);
  });

  it('cena: Kompendium, lada z mnożnikiem i targ Fixera', () => {
    const entry = { ...COMPACT, cost: 6_300 };
    expect(cpredVehicleQuote(entry)).toEqual({ listed: 6_300, price: 6_300 });
    expect(cpredVehicleQuote(entry, { priceMul: 120 })).toEqual({ listed: 7_560, price: 7_560 });
    expect(cpredVehicleQuote(entry, { discount: 10 })).toEqual({ listed: 6_300, price: 5_670 });
    expect(cpredVehicleQuote({ ...entry, cost: null, costCategory: undefined })).toBeNull();
  });

  it('wiersz modelu z odmianą „fotele / foteli”', () => {
    expect(cpredVehicleModelDetail(COMPACT, 'Kompakt')).toBe(
      'Kompakt · 4 fotele · PUK 45 · Ruch 20',
    );
    expect(cpredVehicleModelDetail({ ...COMPACT, seats: 8 })).toBe('8 foteli · PUK 45 · Ruch 20');
  });

  it('klasy wskazują najpierw katalog z podręcznika, potem próbkę z repo', () => {
    for (const ids of Object.values(CPRED_VEHICLE_CLASS_IDS)) {
      expect(ids.at(-1)).toMatch(/^vehicle\.sample-/);
    }
  });

  it('handlarz prowadzi auta tylko z osobnym poziomem „Pojazdy”', () => {
    const { registry } = withVehicleModels(registryOf([COMPACT]), parseVehicleModels(FILE).models);
    const ranczer = registry.entryById.get('vehicle.ranczer')!;
    // Pozostałe 4 nie wpuszczają aut do apteki.
    expect(cpredAssortmentCovers(ranczer, { base: 4, categories: {} })).toBe(false);
    expect(cpredAssortmentCovers(ranczer, { base: 0, categories: { vehicle: 1 } })).toBe(true);
    expect(
      cpredAssortmentVehicles(registry.entries, { base: 0, categories: { vehicle: 4 } }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['vehicle.ranczer']);
    expect(cpredAssortmentVehicles(registry.entries, null)).toEqual([]);
  });
});
