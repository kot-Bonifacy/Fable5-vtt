/**
 * Co gracz wolno zmienić w swoich przedmiotach łatą karty (etap 48c, decyzje MG
 * z 10.10.2026).
 *
 * „Rzeczy z mechaniką przybywają graczowi tylko z zakupu, wymiany, łupu,
 * kreatora i od MG” — a puste wiersze do dopisania to relikt papierowej karty,
 * którego ta karta nie potrzebuje. Łata gracza **niczego więc nie dokłada**:
 * żadnego nowego wiersza broni, pancerza, wyposażenia ani cyborgizacji, żadnej
 * sztuki w stosie, żadnego punktu OB. Wolno mu:
 *
 *  - pisać w polu „Uwagi” (każda lista; przezwisko broni też ląduje tam),
 *  - wyrzucić wiersz broni, pancerza i wyposażenia,
 *  - zmniejszyć ilość wiersza wyposażenia i bieżące OB pancerza,
 *  - założyć, zdjąć i przełożyć pancerz (`equipped`, `location`),
 *  - przypisać cyborgizację do miejsca na sylwetce (`bodySlot`),
 *  - podłączyć i odłączyć egzoszkielet (`connected`, etap 59a),
 *  - nazwać Umiejętność czipu, **raz** (`skillId`, etap 59a) — czip kupuje się
 *    na jedną Umiejętność, więc zmiana nazwanej to darmowy nowy czip.
 *
 * Magazynek broni i jego rodzaj naboju zostają przy umowie z 46c
 * (`cpredAmmoPatchRaises` → `AMMO_LOCKED`, od 23.10 na każdej karcie gracza):
 * magazynek napełnia Przeładowanie, a nie ręka — także kulami, które się nie
 * kończą.
 *
 * Cyborgizacji gracz łatą nie wyjmuje: wyjęcie oddaje sufit Człowieczeństwa,
 * więc idzie przez `character:cyberware`, jak montaż.
 *
 * Czysta funkcja — pytanie „kto pyta” zostaje na serwerze (MG ma furtkę
 * sędziego i ten moduł go nie dotyczy).
 */

import type {
  CpredArmorRow,
  CpredCharacterData,
  CpredCyberwareRow,
  CpredGearRow,
  CpredItemRow,
  CpredWeaponRow,
} from './character.js';

export type CpredItemLockError = 'ITEM_LOCKED';

type ItemPatch = Partial<Pick<CpredCharacterData, 'weapons' | 'armor' | 'gear' | 'cyberware'>>;

/** Pola, które gracz zmienia swobodnie — reszta wiersza musi zostać, jaka była. */
const WEAPON_FREE: readonly (keyof CpredWeaponRow)[] = [
  'notes',
  // Magazynek i rodzaj naboju — umowa z 46c, patrz nagłówek.
  'ammoCurrent',
  'ammoId',
  'attachmentAmmo',
  'attachmentAmmoId',
];
const ARMOR_FREE: readonly (keyof CpredArmorRow)[] = ['notes', 'equipped', 'location', 'spCurrent'];
const GEAR_FREE: readonly (keyof CpredGearRow)[] = ['notes', 'qty', 'connected'];
const CYBERWARE_FREE: readonly (keyof CpredCyberwareRow)[] = ['notes', 'bodySlot', 'skillId'];

/** Wiersz bez pól swobodnych, w stałej kolejności kluczy — do porównania. */
function lockedPart<T extends CpredItemRow>(row: T, free: readonly (keyof T)[]): string {
  const rest = Object.entries(row)
    .filter(([key, value]) => value !== undefined && !free.includes(key as keyof T))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(rest);
}

/**
 * Czy nowa lista coś dokłada: wiersz o nieznanym id albo zmienione pole spoza
 * swobodnych. `grows` sprawdza liczby, które wolno tylko zmniejszać.
 */
function listAdds<T extends CpredItemRow>(
  before: readonly T[],
  after: readonly T[],
  free: readonly (keyof T)[],
  grows: (next: T, old: T) => boolean = () => false,
): boolean {
  const old = new Map(before.map((row) => [row.id, row]));
  return after.some((row) => {
    const was = old.get(row.id);
    return !was || lockedPart(row, free) !== lockedPart(was, free) || grows(row, was);
  });
}

/**
 * `ITEM_LOCKED`, gdy łata gracza dokłada przedmiot albo zmienia jego mechanikę;
 * null — łata mieści się w tym, co gracz robi sam.
 */
export function cpredPlayerItemPatchProblem(
  current: Pick<CpredCharacterData, 'weapons' | 'armor' | 'gear' | 'cyberware'>,
  patch: ItemPatch,
): CpredItemLockError | null {
  if (patch.weapons && listAdds(current.weapons, patch.weapons, WEAPON_FREE)) {
    return 'ITEM_LOCKED';
  }
  if (
    patch.armor &&
    listAdds(current.armor, patch.armor, ARMOR_FREE, (next, old) => next.spCurrent > old.spCurrent)
  ) {
    return 'ITEM_LOCKED';
  }
  if (
    patch.gear &&
    listAdds(current.gear, patch.gear, GEAR_FREE, (next, old) => next.qty > old.qty)
  ) {
    return 'ITEM_LOCKED';
  }
  if (patch.cyberware) {
    // Ani nowy wszczep, ani wyjęty — obie drogi liczą Człowieczeństwo na serwerze.
    if (patch.cyberware.length !== current.cyberware.length) return 'ITEM_LOCKED';
    if (
      listAdds(
        current.cyberware,
        patch.cyberware,
        CYBERWARE_FREE,
        (next, old) => old.skillId !== undefined && next.skillId !== old.skillId,
      )
    ) {
      return 'ITEM_LOCKED';
    }
  }
  return null;
}
