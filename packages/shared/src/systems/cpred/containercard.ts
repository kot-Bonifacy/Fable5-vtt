/**
 * Karta pojemnika (etap 46b) — jak powstaje, kiedy jest pusta i czym jest klucz.
 *
 * Osobno od `container.ts`, bo potrzebuje `createDefaultCharacterData` w czasie
 * wykonania, a `character.ts` czyta walidację pola z `container.ts` — jeden
 * plik zrobiłby z nich cykl.
 */

import {
  ITEM_NAME_MAX_LENGTH,
  createDefaultCharacterData,
  type CpredCharacterData,
  type CpredGearRow,
} from './character.js';
import { createCpredContainer, type CpredContainer } from './container.js';

/**
 * Nowa karta pojemnika. Cechy zostają domyślne, bo karta bez nich nie przejdzie
 * walidacji — ale nikt ich nie czyta: pojemnik nie rzuca, nie walczy i nie
 * leczy się (`isContainerCard` na każdej liście figur).
 */
export function createContainerSheet(container: Partial<CpredContainer> = {}): CpredCharacterData {
  return { ...createDefaultCharacterData(), container: createCpredContainer(container) };
}

/** Pusty pojemnik: ani jednego wiersza i ani jednego eurodolca. Stos wtedy znika. */
export function cpredContainerEmpty(
  sheet: Pick<CpredCharacterData, 'weapons' | 'armor' | 'gear' | 'eddies'>,
): boolean {
  return (
    sheet.weapons.length === 0 &&
    sheet.armor.length === 0 &&
    sheet.gear.length === 0 &&
    sheet.eddies === 0
  );
}

/** Czy na tej karcie leży klucz do zamka o tym uchwycie. */
export function cpredHasKey(
  sheet: Pick<CpredCharacterData, 'gear'>,
  keyId: string | null,
): boolean {
  if (keyId === null) return false;
  return sheet.gear.some((row) => row.key === keyId && row.qty > 0);
}

/** Wiersz klucza, który MG wydaje „Wydaj klucz”. Nazwa niesie nazwę pojemnika. */
export function cpredKeyRow(rowId: string, keyId: string, containerName: string): CpredGearRow {
  return {
    id: rowId,
    name: `Klucz: ${containerName}`.slice(0, ITEM_NAME_MAX_LENGTH),
    notes: '',
    qty: 1,
    key: keyId,
  };
}

/** Karta z nowym stanem pojemnika — jedyne pole, które `container:*` zmienia w arkuszu. */
export function cpredWithContainer(
  sheet: CpredCharacterData,
  container: CpredContainer,
): CpredCharacterData {
  return { ...sheet, container };
}
