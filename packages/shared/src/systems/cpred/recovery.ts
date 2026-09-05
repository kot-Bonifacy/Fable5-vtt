/**
 * Naturalne leczenie: co jeden pełny dzień odpoczynku robi z kartą (s. 222–223).
 *
 * Do tej sesji Punkty Wytrzymałości **nie wracały nigdy**. `treatment.ts` umie
 * zdjąć Ranę Krytyczną, `damage.ts` umie odjąć PW, a jedyną drogą w drugą
 * stronę było wpisanie liczby ręką w polu karty. Postać po strzelaninie
 * zostawała ranna do końca kampanii albo MG liczył za VTT.
 *
 * Reguła jest krótka i cała mieści się w jednym zdaniu podręcznika: „Po udanej
 * stabilizacji cel po każdym pełnym dniu odpoczynku leczy tyle Punktów
 * Wytrzymałości, ile wynosi jego Budowa Ciała, aż do odzyskania wszystkich PW".
 * Dwa warunki tego zdania są tu równie ważne jak liczba:
 *
 *  - **„po udanej stabilizacji"** — bez `recovery.stabilized` dzień odpoczynku
 *    nie daje nic. Podręcznik podaje PT ustabilizowania dla wszystkich trzech
 *    progów ran, więc nie chodzi wyłącznie o ratowanie Śmiertelnie Rannego:
 *    Ustabilizowanie to **otwarcie procesu**, a rzut przy 0 PW jest jego
 *    najbardziej dramatycznym przypadkiem, nie jedynym;
 *  - **„pełnym dniu odpoczynku"** — „Jeśli pacjent przesadzi, za ten dzień nie
 *    odzyskuje PW, a jego rany otwierają się i musi na nowo zostać
 *    ustabilizowany". To jedyna rzecz, o którą ten moduł pyta z zewnątrz
 *    (`strained`), bo VTT nie ma jak sprawdzić, czy ktoś się nie nadwyrężył.
 *
 * Czego tu **nie ma i nie będzie**: opieki jako mnożnika tempa. Przy zbieraniu
 * zaległości zapisano „opieka (Ratownictwo medyczne / klinika / szpital) jako
 * mnożnik tempa", ale w podręczniku czegoś takiego nie ma — szpital zmienia
 * **cenę** ustabilizowania i leczenia Ran Krytycznych (s. 225), a nie szybkość
 * powrotu do zdrowia. Tempo podnoszą wyłącznie dwie rzeczy: chrom („Ulepszone
 * przeciwciała", BC × 2) i Antybiotyk (+2 PW dziennie przez tydzień, s. 150).
 *
 * Modułu nie obchodzi kalendarz. Dzień odpoczynku jest **zdarzeniem**, które
 * ktoś wywołuje, a nie punktem na osi czasu — zegara świata projekt nie ma aż
 * do etapu 37, a licznik antybiotyku odlicza dni odpoczynku, czyli dokładnie
 * te dni, w których miałby cokolwiek do roboty.
 */

import { hpMax } from './derived.js';
import {
  CPRED_ANTIBIOTIC_DAYS,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredRecovery,
} from './character.js';
import { woundState, type CpredWoundState } from './rolls.js';

/**
 * Chrom, który podwaja tempo: „Ulepszone przeciwciała … po każdym pełnym dniu
 * odpoczynku leczy tyle PW, ile wynosi dwukrotna wartość jego Budowy Ciała"
 * (s. 362).
 *
 * Po nazwie, nie po id wpisu — ta sama umowa co przy wymogach dodatków do broni
 * (`hasRequiredCyberware`, 30c): kompendium w `data/private/` bywa starsze niż
 * parser, a nazwa jest tym, co MG widzi i wpisuje.
 */
export const CPRED_ANTIBODIES_CYBERWARE = 'Ulepszone przeciwciała';

/** Ile PW dziennie dokłada Antybiotyk (s. 150). */
export const CPRED_ANTIBIOTIC_HP_PER_DAY = 2;

/**
 * Pancerz, który sam się zrasta: „Po ukończonym pełnym dniu naturalnego
 * leczenia, nanomaszyny … naprawiają … w tempie 1 OB na dzień" (s. 363).
 *
 * Dopasowanie po nazwie **wiersza pancerza**, bo tak te dwie cyborgizacje
 * wchodzą na kartę: jako OB na Głowie i Korpusie, a nie jako wpis w chromie
 * z własną arytmetyką. Kto nosi je pod inną nazwą, nie dostaje regeneracji —
 * i to jest lepsza odpowiedź niż zgadywanie po wartości OB.
 */
export const CPRED_SELF_REPAIRING_ARMOR: readonly string[] = ['Splot skórny', 'Pancerz podskórny'];

/** Ile OB dziennie odzyskują te dwa pancerze (s. 363). */
export const CPRED_ARMOR_REPAIR_PER_DAY = 1;

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Sheet fields a rest day reads — mniej niż cała karta, żeby dało się testować. */
export type CpredRestSheet = Pick<
  CpredCharacterData,
  'stats' | 'hpCurrent' | 'armor' | 'cyberware' | 'recovery'
>;

/** Skąd bierze się dzisiejsze tempo — po jednym wierszu na powód. */
export interface CpredHealRateSource {
  label: string;
  value: number;
}

export interface CpredHealRate {
  /** Ile PW wróci po pełnym dniu odpoczynku. */
  perDay: number;
  sources: CpredHealRateSource[];
}

/**
 * Ile PW dokłada jeden dzień odpoczynku — z rozbiciem na powody.
 *
 * Rozbicie, a nie sama liczba, bo to jedyna rzecz, którą gracz zobaczy na
 * karcie przed kliknięciem: „BC 7 · Ulepszone przeciwciała ×2 · Antybiotyk +2"
 * tłumaczy 16 lepiej niż samo 16, a przy okazji pokazuje, kiedy antybiotyk się
 * skończył.
 */
export function cpredHealRate(data: CpredRestSheet): CpredHealRate {
  const body = data.stats.body;
  const doubled = data.cyberware.some((row) => sameName(row.name, CPRED_ANTIBODIES_CYBERWARE));
  const sources: CpredHealRateSource[] = [
    doubled
      ? { label: `${CPRED_ANTIBODIES_CYBERWARE} (BC ${body} × 2)`, value: body * 2 }
      : { label: `Budowa Ciała ${body}`, value: body },
  ];
  if (data.recovery.antibioticDays > 0) {
    sources.push({
      label: `Antybiotyk (zostało dni: ${data.recovery.antibioticDays})`,
      value: CPRED_ANTIBIOTIC_HP_PER_DAY,
    });
  }
  return { perDay: sources.reduce((total, row) => total + row.value, 0), sources };
}

/** Dlaczego dzień odpoczynku nic nie dał — albo null, gdy dał. */
export type CpredRestRefusal = 'notStabilized' | 'alreadyFull' | 'strained';

export const CPRED_REST_REFUSALS: Record<CpredRestRefusal, string> = {
  notStabilized:
    'Naturalne leczenie jeszcze się nie zaczęło — najpierw ktoś musi wykonać Ustabilizowanie (s. 222).',
  alreadyFull: 'Postać ma komplet Punktów Wytrzymałości — nie ma czego leczyć.',
  strained:
    'Postać się nadwyrężyła: za ten dzień nie odzyskuje PW, rany otwierają się i trzeba ją ustabilizować od nowa (s. 223).',
};

export interface CpredRestResult {
  /** Łatka do nałożenia na kartę — pusta, gdy dzień niczego nie zmienił. */
  patch: Partial<CpredCharacterData>;
  /** PW odzyskane tego dnia (0 przy odmowie). */
  healed: number;
  hpBefore: number;
  hpAfter: number;
  woundBefore: CpredWoundState;
  woundAfter: CpredWoundState;
  /** Wiersze pancerza, które zrosły się o 1 OB. */
  armorRepaired: { name: string; from: number; to: number }[];
  /** Rozbicie tempa — to samo, które karta pokazuje przed kliknięciem. */
  rate: CpredHealRate;
  /** Antybiotyk skończył się właśnie tego dnia. */
  antibioticEnded: boolean;
  /** Powód, dla którego PW nie wróciły; null, gdy wróciły. */
  refusal: CpredRestRefusal | null;
}

/**
 * Jeden pełny dzień odpoczynku.
 *
 * Czysta funkcja zwracająca **łatkę**, a nie nową kartę: serwer i tak scala ją
 * przez `mergeCharacterData` (który przycina PW do maksimum i zeruje Testy
 * Przeżywalności), więc podwójne liczenie tych samych zacisków byłoby drugim
 * miejscem, w którym można się pomylić.
 *
 * Kolejność warunków jest kolejnością podręcznika i ma znaczenie przy
 * nadwyrężeniu: dzień „przesadzony" zabiera ustabilizowanie **nawet wtedy**,
 * gdy postać i tak nie miała czego leczyć — rany otwierają się od wysiłku,
 * a nie od tego, ile PW brakowało.
 */
export function cpredRestDay(
  data: CpredRestSheet,
  options: { strained?: boolean } = {},
): CpredRestResult {
  const hpBefore = data.hpCurrent;
  const max = hpMax(data.stats);
  const rate = cpredHealRate(data);
  const base: Omit<CpredRestResult, 'patch' | 'refusal'> = {
    healed: 0,
    hpBefore,
    hpAfter: hpBefore,
    woundBefore: woundState(hpBefore, data.stats),
    woundAfter: woundState(hpBefore, data.stats),
    armorRepaired: [],
    rate,
    antibioticEnded: false,
  };

  if (options.strained === true) {
    // „…a jego rany otwierają się i musi na nowo zostać ustabilizowany, by
    // wznowić proces naturalnego leczenia" (s. 223). Antybiotyk idzie razem
    // z procesem: siedem dni liczyło się „od rozpoczęcia powrotu do zdrowia".
    const patch: Partial<CpredCharacterData> = data.recovery.stabilized
      ? { recovery: { stabilized: false, antibioticDays: 0 } }
      : {};
    return { ...base, patch, refusal: 'strained' };
  }
  if (!data.recovery.stabilized) return { ...base, patch: {}, refusal: 'notStabilized' };
  if (hpBefore >= max) return { ...base, patch: {}, refusal: 'alreadyFull' };

  const hpAfter = Math.min(max, hpBefore + rate.perDay);
  const armorRepaired: CpredRestResult['armorRepaired'] = [];
  const armor: CpredArmorRow[] = data.armor.map((row) => {
    if (row.spCurrent >= row.sp) return row;
    if (!CPRED_SELF_REPAIRING_ARMOR.some((name) => sameName(row.name, name))) return row;
    const to = Math.min(row.sp, row.spCurrent + CPRED_ARMOR_REPAIR_PER_DAY);
    armorRepaired.push({ name: row.name, from: row.spCurrent, to });
    return { ...row, spCurrent: to };
  });

  const antibioticDays = Math.max(0, data.recovery.antibioticDays - 1);
  const recovery: CpredRecovery = {
    // Komplet PW kończy proces: kolejne rany to kolejne Ustabilizowanie,
    // dokładnie jak każe zdanie „aby rozpocząć proces naturalnego leczenia".
    stabilized: hpAfter < max,
    antibioticDays: hpAfter < max ? antibioticDays : 0,
  };

  return {
    ...base,
    healed: hpAfter - hpBefore,
    hpAfter,
    woundAfter: woundState(hpAfter, data.stats),
    armorRepaired,
    antibioticEnded: data.recovery.antibioticDays > 0 && recovery.antibioticDays === 0,
    patch: {
      hpCurrent: hpAfter,
      recovery,
      ...(armorRepaired.length > 0 ? { armor } : {}),
    },
    refusal: null,
  };
}

/**
 * Dawka Antybiotyku na kartę: tydzień od nowa, bez kumulacji (s. 150).
 *
 * „Efekty kilku antybiotyków nie kumulują się" — drugie zastrzyk ustawia
 * licznik z powrotem na siedem, a nie na czternaście. Ustabilizowania **nie
 * ustawia**: antybiotyk pomaga procesowi, który już trwa („osoba, która już
 * rozpoczęła proces naturalnego powrotu do zdrowia"), a nie zaczyna go.
 */
export function cpredApplyAntibiotic(recovery: CpredRecovery): CpredRecovery {
  return { ...recovery, antibioticDays: CPRED_ANTIBIOTIC_DAYS };
}
