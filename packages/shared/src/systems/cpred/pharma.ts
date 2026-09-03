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
 * Proza z podręcznika **zostaje** obok skutku, a nie zamiast niego. Trzy z
 * pięciu środków (Dynadetoks, Zryw, i połowa Stymu) rozgrywa się przy stole
 * słowami, a karta na czacie ma wtedy powiedzieć dokładnie to, co mówi tabela —
 * to samo rozstrzygnięcie co przy zdaniach leczenia w `treatment.ts`.
 */

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
 *  - `ignoreSeriousWound` — godzina bez kar Poważnie Rannego (naklejka),
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
    name: 'Antybiotyk',
    effect:
      'Osoba, która rozpoczęła naturalny powrót do zdrowia, przez tydzień odzyskuje codziennie ' +
      'dodatkowe 2 PW. Efekty kilku antybiotyków nie kumulują się.',
    applies: 'antibiotic',
  },
  {
    id: 'pharma.dynadetoks',
    name: 'Dynadetoks',
    effect: 'Organizm błyskawicznie oczyszcza się z narkotyków, trucizn i alkoholu.',
    applies: 'cleanse',
  },
  {
    id: 'pharma.turbo-uzdrawiacz',
    name: 'Turbo uzdrawiacz',
    effect:
      'O ile cel nie jest Śmiertelnie Ranny, natychmiast leczy PW równe sumie BUDOWY CIAŁA ' +
      'i SIŁY WOLI.',
    applies: 'heal',
    limit: 'Skuteczny tylko raz dziennie.',
  },
  {
    id: 'pharma.stym',
    name: 'Stym',
    effect: 'Przez godzinę cel ignoruje kary wynikające z bycia Poważnie Rannym.',
    applies: 'ignoreSeriousWound',
    limit: 'Skuteczny tylko raz dziennie.',
  },
  {
    id: 'pharma.zryw',
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

/** PT wytworzenia dawki — „udany Test Technologii Medycznej o PT 13" (s. 150). */
export const CPRED_PHARMA_CRAFT_DV = 13;

/** „Z surowców wartych 200 ed w ciągu godziny…" — cena jednej partii (s. 150). */
export const CPRED_PHARMA_BATCH_COST = 200;

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
