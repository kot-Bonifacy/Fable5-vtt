/**
 * Farmaceutyki Medyka (s. 150) — katalog pięciu środków i to, co robi dawka.
 *
 * Do tej sesji lista żyła w `roleability.ts` jako pięć par „nazwa + akapit
 * prozy": panel ją drukował i nikt jej nie czytał, bo „wytworzenie dawki
 * i podanie jej prowadzi MG" (zaległość z etapu 30b). Dawka nie miała gdzie
 * mieszkać — wiersz ekwipunku był wolnym tekstem bez licznika.
 *
 * Moduł jest **osobny i pusty z zależności** świadomie: `character.ts` waliduje
 * `CpredGearRow.consumable` przeciwko tym id, a `character.ts` jest tym, co
 * `roleability.ts` importuje — trzymanie katalogu tam zrobiłoby cykl. Tu nie ma
 * nic poza stałymi, więc importować go może każdy.
 *
 * Proza z podręcznika **zostaje** obok skutku, a nie zamiast niego. Dwa z
 * pięciu środków (część Dynadetoksu i Zryw) rozgrywają się przy stole
 * słowami, a karta na czacie ma wtedy powiedzieć dokładnie to, co mówi tabela —
 * to samo rozstrzygnięcie co przy zdaniach leczenia w `treatment.ts`.
 */

import { CPRED_PRICE_SCALE_CONSUMABLE } from './pricing.js';

/** Id jednego z pięciu środków — to, co siedzi w `CpredGearRow.consumable`. */
export type CpredPharmaceuticalId =
  | 'pharma.antybiotyk'
  | 'pharma.dynadetoks'
  | 'pharma.turbo-uzdrawiacz'
  | 'pharma.stym'
  | 'pharma.zryw';

/**
 * Co dawka robi mechanice — albo `narrative`, gdy nie robi nic, co VTT umie
 * policzyć.
 *
 *  - `antibiotic` — dopisuje tydzień do naturalnego leczenia (`recovery.ts`),
 *  - `heal` — natychmiastowe PW równe BC + SW,
 *  - `ignoreSeriousWound` — godzina bez kar Poważnie Rannego (pole karty
 *    `woundSuspension`, od 12.09.2026),
 *  - `cleanse` — zdejmuje zatrucie i inne używki,
 *  - `narrative` — Zryw: doba bez snu, czyli fabuła.
 */
export type CpredPharmaEffect =
  'antibiotic' | 'heal' | 'ignoreSeriousWound' | 'cleanse' | 'narrative';

export interface CpredPharmaceutical {
  id: CpredPharmaceuticalId;
  name: string;
  /** Zdanie z tabeli, słowo w słowo — karta czatu drukuje właśnie je. */
  effect: string;
  /** Co z tego zdania VTT rozlicza samo. */
  applies: CpredPharmaEffect;
  /**
   * „Skuteczny tylko raz dziennie" / „raz na tydzień" — zdanie do wydrukowania
   * na karcie. **Nie jest egzekwowane**: projekt nie ma zegara świata (etap 37),
   * a wymyślanie doby na potrzeby jednego licznika byłoby zgadywaniem. Zapisane
   * w `decyzje-i-uproszczenia.md`.
   */
  limit?: string;
  /**
   * Wpis kompendium, pod którym środek stoi na półce „Używki i leki” (zasada
   * domowa MG z 24.10: farmaceutyki są też do kupienia, nie tylko od Medyka).
   */
  compendiumId: string;
  /** Cena dawki w ed podręcznika i jej pasmo — przelicza je `pricing.ts`. */
  cost: number;
  costCategory: 'costly' | 'premium';
}

/**
 * Pięć środków, po jednym za każdy punkt Specjalizacji Farmaceutyki (s. 150).
 *
 * Kolejność jest kolejnością tabeli i **niesie znaczenie**: „Zawsze, gdy
 * przydzielasz punkt do Farmaceutyków, zyskujesz dostęp do jednego z poniższych
 * środków", więc Medyk z rangą 2 sięga po dwa pierwsze wiersze.
 */
export const CPRED_PHARMACEUTICALS: readonly CpredPharmaceutical[] = [
  {
    id: 'pharma.antybiotyk',
    compendiumId: 'gear.antybiotyk',
    cost: 50,
    costCategory: 'costly',
    name: 'Antybiotyk',
    effect:
      'Osoba, która rozpoczęła naturalny powrót do zdrowia, przez tydzień odzyskuje codziennie ' +
      'dodatkowe 2 PW. Efekty kilku antybiotyków nie kumulują się.',
    applies: 'antibiotic',
  },
  {
    id: 'pharma.dynadetoks',
    compendiumId: 'gear.dynadetoks',
    cost: 50,
    costCategory: 'costly',
    name: 'Dynadetoks',
    effect: 'Organizm błyskawicznie oczyszcza się z narkotyków, trucizn i alkoholu.',
    applies: 'cleanse',
  },
  {
    id: 'pharma.turbo-uzdrawiacz',
    compendiumId: 'gear.turbo-uzdrawiacz',
    cost: 100,
    costCategory: 'premium',
    name: 'Turbo uzdrawiacz',
    effect:
      'O ile cel nie jest Śmiertelnie Ranny, natychmiast leczy PW równe sumie BUDOWY CIAŁA ' +
      'i SIŁY WOLI.',
    applies: 'heal',
    limit: 'Skuteczny tylko raz dziennie.',
  },
  {
    id: 'pharma.stym',
    compendiumId: 'gear.stym',
    cost: 100,
    costCategory: 'premium',
    name: 'Stym',
    effect: 'Przez godzinę cel ignoruje kary wynikające z bycia Poważnie Rannym.',
    applies: 'ignoreSeriousWound',
    limit: 'Skuteczny tylko raz dziennie.',
  },
  {
    id: 'pharma.zryw',
    compendiumId: 'gear.zryw',
    cost: 100,
    costCategory: 'premium',
    name: 'Zryw',
    effect: 'Cel przez 24 godziny funkcjonuje w pełni sprawnie bez snu.',
    applies: 'narrative',
    limit: 'Skuteczny tylko raz na tydzień.',
  },
];

const BY_ID = new Map(CPRED_PHARMACEUTICALS.map((row) => [row.id as string, row]));

export function cpredPharmaceutical(id: string | undefined): CpredPharmaceutical | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

export function isPharmaceuticalId(id: string): id is CpredPharmaceuticalId {
  return BY_ID.has(id);
}

const BY_ENTRY = new Map(CPRED_PHARMACEUTICALS.map((row) => [row.compendiumId, row]));

/** Farmaceutyk, którym jest ten wpis kompendium. */
export function cpredPharmaOfEntryId(id: string): CpredPharmaceutical | null {
  return BY_ENTRY.get(id) ?? null;
}

/**
 * Farmaceutyk, którym jest ten wiersz ekwipunku — po `consumable`, a bez niego
 * po wpisie kompendium (dawka z półki handlarza czy skrzyni). **Nie po nazwie**:
 * wpisany ręką „Antybiotyk” bez wpisu zostaje notatką (`addDoses` na serwerze).
 */
export function cpredPharmaOfRow(row: {
  consumable?: string;
  compendiumId?: string;
}): CpredPharmaceutical | null {
  if (row.consumable) return cpredPharmaceutical(row.consumable);
  return row.compendiumId ? cpredPharmaOfEntryId(row.compendiumId) : null;
}

/**
 * Plik kompendium z pięcioma farmaceutykami, dokładany przez serwer do plików
 * z dysku (zasada domowa MG z 24.10). Proza jest już w repo, więc wpisy nie
 * czekają na importer i nie mieszkają w `data/private`. Ceny są cenami
 * podręcznika — cennik domowy nakłada się przy wczytaniu jak wszędzie.
 */
export const CPRED_PHARMA_COMPENDIUM_FILE = {
  source: 'Farmaceutyki Medyka (s. 150) — do kupienia z zasady domowej MG',
  entries: CPRED_PHARMACEUTICALS.map((row) => ({
    id: row.compendiumId,
    category: 'gear',
    name: row.name,
    cost: row.cost,
    costCategory: row.costCategory,
    description:
      `${row.effect}${row.limit ? ` ${row.limit}` : ''} Podać dawkę umie tylko Medyk ` +
      `z punktem w Farmaceutykach; Medyk może też wytworzyć ją sam z karty.`,
  })),
};

/** PT wytworzenia dawki — „udany Test Technologii Medycznej o PT 13" (s. 150). */
export const CPRED_PHARMA_CRAFT_DV = 13;

/**
 * „Z surowców wartych 200 ed w ciągu godziny…" — cena jednej partii (s. 150).
 * Cennik domowy (etap 47a): surowce to eksploatacja, więc ×3 — 600 ed.
 */
export const CPRED_PHARMA_BATCH_COST = 200 * CPRED_PRICE_SCALE_CONSUMABLE;

/** Ile godzin zajmuje partia — na kartę czatu, bo zegara świata nie ma. */
export const CPRED_PHARMA_BATCH_HOURS = 1;

/**
 * Do których środków sięga Medyk z tyloma punktami Farmaceutyków (s. 150).
 *
 * „Zawsze, gdy przydzielasz punkt do Farmaceutyków, zyskujesz dostęp do jednego
 * z poniższych środków" — podręcznik nie każe wybierać, który, więc VTT bierze
 * je **w kolejności tabeli**. To uproszczenie i jest świadome: alternatywą byłby
 * szósty wybór na karcie („które pięć z pięciu?") po to, żeby przy pełnej
 * randze i tak wyszło to samo. Zapisane w `decyzje-i-uproszczenia.md`.
 */
export function cpredPharmaAccess(points: number): readonly CpredPharmaceutical[] {
  return CPRED_PHARMACEUTICALS.slice(
    0,
    Math.max(0, Math.min(CPRED_PHARMACEUTICALS.length, points)),
  );
}

/** Czy ten Medyk ma dostęp do tego środka. */
export function cpredCanCraftPharma(points: number, id: string): boolean {
  return cpredPharmaAccess(points).some((row) => row.id === id);
}

/** Nazwa przedmiotu, którym dawkę wbija się komuś, kto się broni (s. 150). */
export const CPRED_AIRHYPO_NAME = 'Strzykawka bezigłowa';

/**
 * Czy w ekwipunku leży strzykawka bezigłowa — bez niej nie ma czym zaatakować
 * celu, który „nie chce przyjąć środka" (opis przedmiotu w kompendium i s. 150).
 *
 * **Po nazwie**, jak `hasRequiredCyberware` przy smartgunie: wiersz z katalogu
 * i wiersz wpisany ręcznie („strzykawka bezigłowa ×1" z sesji zero) mają
 * wspólną tylko nazwę, a id wpisu powstaje z niej przy imporcie.
 */
export function cpredHasAirhypo(gear: readonly { name: string; qty: number }[]): boolean {
  const wanted = CPRED_AIRHYPO_NAME.toLocaleLowerCase('pl');
  return gear.some((row) => row.qty > 0 && row.name.trim().toLocaleLowerCase('pl') === wanted);
}
