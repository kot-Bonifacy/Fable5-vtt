import { cpredChromeStats, cpredSkillLevel } from './chromestats.js';
import { hasCyberarm } from './cyberware.js';
import type { CpredCharacterData, CpredWeaponRow } from './character.js';

/**
 * Gołe ręce z urzędu (decyzja MG z 10.10.2026, etap 47b).
 *
 * „Bijatyka” i „Sztuki walki” stoją w katalogu za 0 ed od poprawki #17, ale
 * postać bez broni dalej potrzebowała wiersza na karcie, a gracz musiał
 * pamiętać, żeby go „kupić”. Podręcznik daje pięść każdemu, więc karta dostaje
 * te wiersze sama:
 *
 *  - **Bijatyka** — każda karta poza pojemnikiem,
 *  - **Sztuki walki** — dopiero przy Umiejętności Sztuki walki ≥ 1 (ignorują
 *    połowę pancerza, więc bez treningu byłyby darmową przewagą).
 *
 * Wiersze są **stałe**: dokłada je `normalizeCharacterData` przy każdym
 * odczycie i scaleniu, zawsze na końcu listy broni i zawsze w tym samym
 * kształcie, a łata karty ich nie niesie (`cpredWithoutBareHands`) — więc nie
 * da się ich przemianować, usunąć ani dopisać drugi raz. Nie są przedmiotem:
 * `cpredTakeRows` ich nie zdejmuje, a `cpredInventoryView` nie pokazuje, więc
 * nie pojadą w handlu, łupie, do skrzyni ani na mapę. Mechanika ataku zostaje
 * bez zmian — to zwykły wiersz z `compendiumId` katalogu: dobywa się go,
 * trafia nim i rzuca obrażenia jak każdą bronią.
 */

export const CPRED_BRAWLING_ENTRY_ID = 'weapon.brawling';
export const CPRED_MARTIAL_ARTS_ENTRY_ID = 'weapon.martial-arts';
export const CPRED_MARTIAL_ARTS_SKILL_ID = 'martial-arts';

/** Id stałych wierszy — te same na każdej karcie, bo nigdzie nie wędrują. */
export const CPRED_BARE_HANDS_ROW_IDS = {
  brawling: 'bare-hands.brawling',
  martialArts: 'bare-hands.martial-arts',
} as const;

const BARE_HANDS_IDS: ReadonlySet<string> = new Set(Object.values(CPRED_BARE_HANDS_ROW_IDS));
const BARE_HANDS_ENTRY_IDS: ReadonlySet<string> = new Set([
  CPRED_BRAWLING_ENTRY_ID,
  CPRED_MARTIAL_ARTS_ENTRY_ID,
]);

/**
 * Brawling and martial arts damage, from the attacker's BODY (s. 176). A
 * cyberarm lifts a weak attacker to the 2d6 rung, which the caller passes in
 * as `cyberarm` because cyberware only arrives in stage 23.
 */
export function unarmedDamage(body: number, cyberarm = false): string {
  if (body >= 11) return '4k6';
  if (body >= 7) return '3k6';
  if (body >= 5 || cyberarm) return '2k6';
  return '1k6';
}

/** Czy to stały wiersz gołych rąk (po id — wiersz nigdzie nie wędruje). */
export function cpredIsBareHandsRow(row: { id: string } | string): boolean {
  return BARE_HANDS_IDS.has(typeof row === 'string' ? row : row.id);
}

/** Czy wpis katalogu to gołe ręce — tego się nie kupuje ani nie daje. */
export function cpredIsBareHandsEntry(entryId: string): boolean {
  return BARE_HANDS_ENTRY_IDS.has(entryId);
}

/** Lista broni bez stałych wierszy — to, co niesie łata karty. */
export function cpredWithoutBareHands(weapons: readonly CpredWeaponRow[]): CpredWeaponRow[] {
  return weapons.filter((row) => !cpredIsBareHandsRow(row));
}

function bareHandsRow(id: string, name: string, entryId: string, damage: string): CpredWeaponRow {
  return {
    id,
    name,
    compendiumId: entryId,
    notes: 'Z urzędu — ma je każda postać.',
    damage,
    ammoCurrent: 0,
    ammoMax: 0,
    ammoType: '',
    rof: '2',
  };
}

/** Stałe wiersze, które należą się tej karcie (pojemnik — żadne). */
export function cpredBareHandsRows(
  data: Pick<CpredCharacterData, 'stats' | 'skills' | 'cyberware' | 'container'>,
): CpredWeaponRow[] {
  if (data.container) return [];
  // Etap 59a: BC z wszczepami — pięść z ramownicą bije 4k6 także na wydruku
  // wiersza (atak i tak liczy z BC „jak teraz”, `attackDamageNotation`).
  const body = cpredChromeStats(data.stats, data).body;
  const damage = unarmedDamage(body, hasCyberarm(data.cyberware));
  const rows = [
    bareHandsRow(CPRED_BARE_HANDS_ROW_IDS.brawling, 'Bijatyka', CPRED_BRAWLING_ENTRY_ID, damage),
  ];
  if (cpredSkillLevel(data, CPRED_MARTIAL_ARTS_SKILL_ID) >= 1) {
    rows.push(
      bareHandsRow(
        CPRED_BARE_HANDS_ROW_IDS.martialArts,
        'Sztuki walki',
        CPRED_MARTIAL_ARTS_ENTRY_ID,
        damage,
      ),
    );
  }
  return rows;
}

/**
 * Lista broni ze stałymi wierszami na końcu — i ręce, które je trzymają.
 *
 * Wiersz „Bijatyki” albo „Sztuk walki” kupiony przed 10.10 ze sklepu za 0 ed
 * znika: zastępuje go stały, a ręce, które go trzymały, trzymają teraz stały
 * (inaczej pięść „schowałaby się” sama przy pierwszym odczycie karty).
 */
export function cpredWithBareHands(
  data: Pick<
    CpredCharacterData,
    'stats' | 'skills' | 'cyberware' | 'container' | 'weapons' | 'drawnWeaponRowIds'
  >,
): Pick<CpredCharacterData, 'weapons' | 'drawnWeaponRowIds'> {
  const innate = cpredBareHandsRows(data);
  const innateFor = new Map(innate.map((row) => [row.compendiumId, row.id]));
  const replaced = new Map<string, string>();
  const kept: CpredWeaponRow[] = [];
  for (const row of data.weapons) {
    if (cpredIsBareHandsRow(row)) continue;
    const swap = row.compendiumId ? innateFor.get(row.compendiumId) : undefined;
    if (swap) {
      replaced.set(row.id, swap);
      continue;
    }
    kept.push(row);
  }
  const live = new Set(innate.map((row) => row.id));
  const hands = data.drawnWeaponRowIds?.map((id) => replaced.get(id) ?? id);
  const result: Pick<CpredCharacterData, 'weapons' | 'drawnWeaponRowIds'> = {
    weapons: [...kept, ...innate],
  };
  if (hands !== undefined) {
    // Dwa stare wiersze tej samej pięści w obu rękach dają jedną rękę, a
    // Sztuki walki, które zniknęły z Umiejętnością, wypadają z rąk.
    result.drawnWeaponRowIds = [...new Set(hands)].filter(
      (id) => !cpredIsBareHandsRow(id) || live.has(id),
    );
  }
  return result;
}
