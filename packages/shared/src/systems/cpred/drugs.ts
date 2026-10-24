/**
 * Narkotyki uliczne, alkohol i trucizna na ostrzu (etap 59b/59c) — katalog
 * mechaniki i stan karty, czysta arytmetyka bez IO.
 *
 * Do tej sesji narkotyków nie było nigdzie: ani w kompendium, ani w sklepach,
 * ani w kodzie, a fiolka trucizny była wierszem ekwipunku, który niczego nie
 * robił. Podręcznik (s. 227 i 357–358) daje pięć narkotyków z czasem działania,
 * PT efektu dodatkowego i skutkiem w liczbach — to wszystko mieszka tutaj.
 *
 * Pięć rozstrzygnięć niesie ten moduł.
 *
 * 1. **Liczby i parafrazy, nie przepisany podręcznik.** Repozytorium jest
 *    publiczne, więc katalog trzyma czas, PT i skutek w liczbach oraz jedno
 *    zdanie własnymi słowami. Opis z podręcznika żyje we wpisie kompendium
 *    w `data/private/`, który pisze `parse-gear.py`.
 *
 * 2. **Dawka jest wierszem ekwipunku, działanie — polem karty `chems`.**
 *    Wiersz rozpoznaje się po `consumable`, po wpisie kompendium albo po nazwie
 *    (wiersz wpisany ręką ma wspólną z katalogiem tylko nazwę). Działająca dawka
 *    to wiersz `chems.doses` z dwoma terminami efektu czasowego z etapu 39 i tymi
 *    samymi dwoma przemiataniami. Pole pisze **wyłącznie silnik**: lista wpisana
 *    łatą byłaby narkotykiem bez terminu i bez rzutu na uzależnienie.
 *
 * 3. **Druga dawka wydłuża, nie kumuluje** — „zażycie kilku dawek wydłuża
 *    działanie efektu głównego o pełny czas działania”. Wyjątkiem jest alkohol
 *    (zasada domowa MG z 24.10.2026): każda wypita dawka działa osobno, do trzech
 *    naraz (`maxStacks`).
 *
 * 4. **Skutek wchodzi tam, gdzie efekt czasowy, i nie rusza pul** (umowa
 *    etapu 39). Cechy z dawek i uzależnień liczy `cpredChemStatEffects`, które
 *    `stateffects.ts` dokłada do listy efektów — ta sama podłoga, ten sam sufit
 *    10 (decyzja MG z 24.10: Dopalacz na INT 9 daje 10) i te same wiersze
 *    rozbicia rzutu. Umiejętności — `cpredChemSkillRows`, osobnym wierszem.
 *
 * 5. **Trucizna na ostrzu udaje nabój.** Fiolka daje lekkiej broni białej na
 *    30 minut ten sam „Test zamiast obrażeń”, który amunicja zatruta ma od 16h
 *    (`CpredAmmoCheck`), więc trafienie rozlicza `resolveAmmoChecks` serwera bez
 *    nowej ścieżki — planer dostaje profil z `cpredCoatingAmmoProfile`.
 *
 * Moduł nie importuje karty ani `stateffects.ts` (tamten importuje ten plik):
 * terminy liczy wołający przez `cpredStatEffectDeadlines` i podaje gotowe.
 */

import type { CpredAmmoCheck, CpredAmmoProfile } from './ammo.js';
import { normalizeChromeName } from './chromestats.js';
import { CPRED_STAT_LABELS, type CpredStatId } from './stats.js';
import { CPRED_MINUTE_S, CPRED_ROUND_SECONDS } from './timed.js';

const HOUR_S = 60 * CPRED_MINUTE_S;
const DAY_MINUTES = 24 * 60;

/** Pięć narkotyków z podręcznika — to, co niesie uzależnienie. */
export type CpredStreetDrugId =
  'drug.czarna-szpryca' | 'drug.blekitne-szklo' | 'drug.dopalacz' | 'drug.grzmot' | 'drug.syntkoka';

/** Wszystko, co się zażywa z karty poza farmaceutykami Medyka. */
export type CpredDrugId = CpredStreetDrugId | 'drug.alkohol';

/** Zmiana Cechy z dawki albo z uzależnienia. */
export interface CpredChemStatMod {
  stat: CpredStatId;
  value: number;
}

/** Zmiana kilku Umiejętności naraz — Grzmot. */
export interface CpredChemSkillMod {
  ids: readonly string[];
  value: number;
}

/** Co robi uzależnienie (efekt dodatkowy, 59c). */
export interface CpredDrugAddiction {
  /** PT rzutu SW + Odporność na tortury/narkotyki + 1k10 po końcu działania. */
  dv: number;
  stats?: readonly CpredChemStatMod[];
  skills?: CpredChemSkillMod;
  /** Kara działa tylko wtedy, gdy uzależniony **nie** jest pod narkotykiem. */
  whenSober?: boolean;
  /** Jedno zdanie własnymi słowami — dymek przy uzależnieniu. */
  effect: string;
}

export interface CpredDrug {
  id: CpredDrugId;
  name: string;
  /** Wpisy kompendium tej rzeczy (`parse-gear.py`); alkohol ma trzy jakości. */
  compendiumIds: readonly string[];
  /** Czas efektu głównego w sekundach fikcji. */
  durationS: number;
  stats?: readonly CpredChemStatMod[];
  skills?: CpredChemSkillMod;
  /** Czarna szpryca: kary Poważnie Rannego nie działają. */
  ignoreSeriousWound?: boolean;
  /** Czarna szpryca: utrata Człowieczeństwa rzucana przy każdej dawce. */
  humanityLoss?: string;
  /** Ile dawek działa naraz osobno; brak = kolejna dawka wydłuża pierwszą. */
  maxStacks?: number;
  /** Efekt główny własnymi słowami — linijka karty czatu i dymek chipa. */
  effect: string;
  /** To, czego VTT nie liczy, a stół ma pamiętać (fleszowanie, paranoja). */
  narrative?: string;
  /** Brak = nie uzależnia (alkohol — zasada domowa). */
  addiction?: CpredDrugAddiction;
}

/** Sześć Umiejętności Grzmota (s. 358). */
const SMASH_SKILLS = [
  'dance',
  'contortionist',
  'conversation',
  'human-perception',
  'persuasion',
  'acting',
] as const;

/**
 * Katalog. Kolejność to kolejność tabeli podręcznika, alkohol na końcu.
 *
 * Alkohol jest zasadą domową MG z 24.10.2026: podręcznik sprzedaje go na
 * Nocnym targu, ale nie daje mu żadnej mechaniki. „Upojenie”: dawka to na
 * godzinę −1 REF i +1 SW, do trzech dawek naraz, bez uzależnienia.
 */
export const CPRED_DRUGS: readonly CpredDrug[] = [
  {
    id: 'drug.czarna-szpryca',
    name: 'Czarna szpryca',
    compendiumIds: ['gear.czarna-szpryca'],
    durationS: 24 * HOUR_S,
    ignoreSeriousWound: true,
    humanityLoss: '2k6',
    effect:
      'Przez dobę bez kar Poważnie Rannego. Zażycie zabiera 2k6 Człowieczeństwa — wraca, ' +
      'jeśli rzut po końcu działania się uda.',
    addiction: {
      dv: 17,
      stats: [{ stat: 'ref', value: -2 }],
      whenSober: true,
      effect: 'REF −2, dopóki nie działa kolejna dawka; utracone Człowieczeństwo nie wraca.',
    },
  },
  {
    id: 'drug.blekitne-szklo',
    name: 'Błękitne szkło',
    compendiumIds: ['gear.blekitne-szklo'],
    durationS: 4 * HOUR_S,
    effect: 'Cztery godziny halucynacji — w chwilach napięcia MG może odebrać Akcję.',
    narrative: 'Fleszowanie rozgrywa MG.',
    addiction: {
      dv: 15,
      effect: 'Fleszuje także bez narkotyku; pod jego działaniem jest na halucynacje odporny (MG).',
    },
  },
  {
    id: 'drug.dopalacz',
    name: 'Dopalacz',
    compendiumIds: ['gear.dopalacz'],
    durationS: 24 * HOUR_S,
    stats: [{ stat: 'int', value: 2 }],
    effect: 'INT +2 na dobę — może przekroczyć 8 (najwyżej 10).',
    addiction: {
      dv: 17,
      stats: [{ stat: 'int', value: -2 }],
      effect: 'INT −2 zawsze — także pod Dopalaczem.',
    },
  },
  {
    id: 'drug.grzmot',
    name: 'Grzmot',
    compendiumIds: ['gear.grzmot'],
    durationS: 4 * HOUR_S,
    skills: { ids: SMASH_SKILLS, value: 2 },
    effect:
      'Cztery godziny euforii: +2 do Tańca, Człowieka gumy, Konwersacji, Odczytywania ' +
      'emocji, Perswazji i Aktorstwa.',
    addiction: {
      dv: 15,
      skills: { ids: SMASH_SKILLS, value: -2 },
      effect: '−2 do tych samych sześciu Umiejętności; głód Grzmota odgrywa się przy stole.',
    },
  },
  {
    id: 'drug.syntkoka',
    name: 'Syntkoka',
    compendiumIds: ['gear.syntkoka'],
    durationS: 4 * HOUR_S,
    stats: [{ stat: 'ref', value: 1 }],
    effect: 'REF +1 na cztery godziny — może przekroczyć 8. Do tego paranoja (stół).',
    narrative: 'Paranoję odgrywa się przy stole.',
    addiction: {
      dv: 15,
      stats: [{ stat: 'ref', value: -2 }],
      whenSober: true,
      effect: 'REF −2, dopóki nie działa kolejna dawka; głód Syntkoki odgrywa się przy stole.',
    },
  },
  {
    id: 'drug.alkohol',
    name: 'Alkohol',
    compendiumIds: [
      'gear.alkohol-niskiej-jakosci',
      'gear.alkohol',
      'gear.alkohol-doskonalej-jakosci',
    ],
    durationS: HOUR_S,
    stats: [
      { stat: 'ref', value: -1 },
      { stat: 'will', value: 1 },
    ],
    maxStacks: 3,
    effect:
      'Upojenie na godzinę: REF −1 i SW +1 za dawkę, najwyżej trzy dawki naraz (zasada domowa).',
  },
];

const DRUG_BY_ID = new Map(CPRED_DRUGS.map((drug) => [drug.id as string, drug]));
const DRUG_BY_ENTRY = new Map(
  CPRED_DRUGS.flatMap((drug) => drug.compendiumIds.map((id) => [id, drug] as const)),
);
const DRUG_BY_NAME = new Map(CPRED_DRUGS.map((drug) => [normalizeChromeName(drug.name), drug]));

export function cpredDrug(id: string | undefined): CpredDrug | null {
  return id ? (DRUG_BY_ID.get(id) ?? null) : null;
}

export function isCpredDrugId(id: unknown): id is CpredDrugId {
  return typeof id === 'string' && DRUG_BY_ID.has(id);
}

export function isCpredStreetDrugId(id: unknown): id is CpredStreetDrugId {
  return isCpredDrugId(id) && DRUG_BY_ID.get(id)!.addiction !== undefined;
}

/** Wiersz ekwipunku widziany oczami tego modułu. */
interface ChemGearRow {
  name: string;
  consumable?: string;
  compendiumId?: string;
}

/**
 * Narkotyk, którym jest ten wiersz ekwipunku — po `consumable`, po wpisie
 * kompendium albo po nazwie. Pudełko amunicji i farmaceutyk nie są nim nigdy.
 */
export function cpredDrugOfRow(row: ChemGearRow): CpredDrug | null {
  if (row.consumable) return cpredDrug(row.consumable);
  if (row.compendiumId) {
    const byEntry = DRUG_BY_ENTRY.get(row.compendiumId);
    if (byEntry) return byEntry;
  }
  return DRUG_BY_NAME.get(normalizeChromeName(row.name)) ?? null;
}

/* ------------------------------------------------------------------ *
 * Trucizna na ostrzu
 * ------------------------------------------------------------------ */

export type CpredBladeToxinId = 'toxin.trucizna' | 'toxin.biotoksyna';

export interface CpredBladeToxin {
  id: CpredBladeToxinId;
  name: string;
  compendiumIds: readonly string[];
  durationS: number;
  /** Test, który trafienie wymusza zamiast obrażeń — kształt amunicji z 16h. */
  check: CpredAmmoCheck;
}

const RESIST_DRUGS = {
  skillId: 'resist-torture-drugs',
  skillLabel: 'Odporność na tortury/narkotyki',
  statId: 'will',
} as const;

/** „W ciągu następnych 30 minut cele trafione tą bronią…” (s. 353). */
export const CPRED_BLADE_TOXINS: readonly CpredBladeToxin[] = [
  {
    id: 'toxin.trucizna',
    name: 'Fiolka trucizny',
    compendiumIds: ['gear.fiolka-trucizny'],
    durationS: 30 * CPRED_MINUTE_S,
    check: { ...RESIST_DRUGS, dv: 13, failure: { damage: '2k6' } },
  },
  {
    id: 'toxin.biotoksyna',
    name: 'Fiolka biotoksyny',
    compendiumIds: ['gear.fiolka-biotoksyny'],
    durationS: 30 * CPRED_MINUTE_S,
    check: { ...RESIST_DRUGS, dv: 15, failure: { damage: '3k6' } },
  },
];

const TOXIN_BY_ID = new Map(CPRED_BLADE_TOXINS.map((toxin) => [toxin.id as string, toxin]));
const TOXIN_BY_ENTRY = new Map(
  CPRED_BLADE_TOXINS.flatMap((toxin) => toxin.compendiumIds.map((id) => [id, toxin] as const)),
);
const TOXIN_BY_NAME = new Map(
  CPRED_BLADE_TOXINS.map((toxin) => [normalizeChromeName(toxin.name), toxin]),
);

export function cpredBladeToxin(id: string | undefined): CpredBladeToxin | null {
  return id ? (TOXIN_BY_ID.get(id) ?? null) : null;
}

/** Fiolka, którą jest ten wiersz ekwipunku — po wpisie kompendium albo nazwie. */
export function cpredBladeToxinOfRow(row: ChemGearRow): CpredBladeToxin | null {
  if (row.compendiumId) {
    const byEntry = TOXIN_BY_ENTRY.get(row.compendiumId);
    if (byEntry) return byEntry;
  }
  return TOXIN_BY_NAME.get(normalizeChromeName(row.name)) ?? null;
}

/** Typ broni, na który da się rozsmarować fiolkę — „lekkiej broni białej”. */
export const CPRED_COATABLE_WEAPON_TYPE = 'weapon-type.light-melee';

/**
 * Czy fiolkę da się rozsmarować na tej broni: lekka broń biała z tabeli
 * (s. 175) albo każda broń biała zadająca 1k6 — tyle zadaje lekka, więc nóż
 * markowy i broń wpisana przez MG w Kompendium łapią się tak samo.
 */
export function cpredCoatableWeapon(
  typeId: string | null | undefined,
  resolved: { melee?: boolean; damage?: string } | null | undefined,
): boolean {
  if (typeId === CPRED_COATABLE_WEAPON_TYPE) return true;
  return resolved?.melee === true && resolved.damage?.replace(/\s+/g, '').toLowerCase() === '1k6';
}

/**
 * Trucizna przebrana za nabój — planer ataku i `resolveAmmoChecks` znają ten
 * kształt od 16h. `patterns` puste, bo do żadnego magazynka nie pasuje; planer
 * nie pyta o dopasowanie, kiedy profil przychodzi z ostrza.
 */
export function cpredCoatingAmmoProfile(toxin: CpredBladeToxin): CpredAmmoProfile {
  return { id: toxin.id, name: toxin.name, patterns: [], noDamage: true, check: toxin.check };
}

/* ------------------------------------------------------------------ *
 * Stan karty
 * ------------------------------------------------------------------ */

/** Terminy efektu — ten sam kształt, co `CpredStatEffect` z etapu 39. */
export interface CpredChemDeadlines {
  expiresAtRound?: number;
  expiresAtMinute?: number;
}

/** Działająca dawka: narkotyk, alkohol albo Zryw (24 h bez snu). */
export interface CpredActiveDose extends CpredChemDeadlines {
  /** Własne id — „zdejmij” u MG wskazuje jedną dawkę. */
  id: string;
  /** Id z `CPRED_DRUGS` albo `pharma.zryw`. */
  substanceId: string;
  /** „Dopalacz” — to, co pisze chip i wiersz rozbicia. */
  source: string;
  /** Łączny czas działania (z wydłużeniami), do etykiety. */
  durationS: number;
  /** Czarna szpryca: ile Człowieczeństwa zabrały dawki — wraca po udanym rzucie. */
  humanityLost?: number;
}

/** Zatrute ostrze: wiersz broni, fiolka i terminy. */
export interface CpredBladeCoating extends CpredChemDeadlines {
  id: string;
  weaponRowId: string;
  toxinId: CpredBladeToxinId;
  durationS: number;
}

/**
 * Wszystko, co chemia robi z kartą. Jedno pole, bo wszystkie cztery listy
 * pisze ten sam silnik i odmawia im ta sama łata (`character:update`).
 */
export interface CpredChems {
  doses: CpredActiveDose[];
  /** Narkotyki, od których postać jest uzależniona (59c). */
  addictions: CpredStreetDrugId[];
  /**
   * Minuta zegara świata ostatniej skutecznej dawki farmaceutyku z limitem
   * („raz dziennie”, „raz na tydzień”) — klucz to id środka.
   */
  lastTaken: Record<string, number>;
  coatings: CpredBladeCoating[];
}

export function cpredEmptyChems(): CpredChems {
  return { doses: [], addictions: [], lastTaken: {}, coatings: [] };
}

export function cpredChemsEmpty(chems: CpredChems): boolean {
  return (
    chems.doses.length === 0 &&
    chems.addictions.length === 0 &&
    chems.coatings.length === 0 &&
    Object.keys(chems.lastTaken).length === 0
  );
}

/** Ile dawek naraz mieści karta — bezpiecznik walidacji. */
export const CPRED_CHEM_DOSES_MAX = 16;
/** Najdłuższe działanie z wydłużeniami — miesiąc fikcji. */
export const CPRED_CHEM_DURATION_MAX_S = 30 * 24 * HOUR_S;

/** Karta oczami tego modułu. */
export interface CpredChemSheet {
  chems?: CpredChems;
}

function activeDosesOf(sheet: CpredChemSheet, substanceId: string): CpredActiveDose[] {
  return (sheet.chems?.doses ?? []).filter((dose) => dose.substanceId === substanceId);
}

/** Czy ta karta jest teraz pod działaniem tej substancji. */
export function cpredUnderSubstance(sheet: CpredChemSheet, substanceId: string): boolean {
  return activeDosesOf(sheet, substanceId).length > 0;
}

/** Uzależnienie (59c), które **teraz** działa — z karą sobie właściwą. */
function biteOf(sheet: CpredChemSheet, drug: CpredDrug): boolean {
  if (!drug.addiction) return false;
  if (!(sheet.chems?.addictions ?? []).includes(drug.id as CpredStreetDrugId)) return false;
  return drug.addiction.whenSober !== true || !cpredUnderSubstance(sheet, drug.id);
}

/** Etykieta wiersza uzależnienia w rozbiciu rzutu. */
export function cpredAddictionLabel(drug: Pick<CpredDrug, 'name'>): string {
  return `Uzależnienie (${drug.name})`;
}

/**
 * Zmiany Cech z dawek i uzależnień — w kształcie wierszy efektu czasowego, które
 * `stateffects.ts` dokłada do `statEffects`. Każda dawka alkoholu osobno.
 */
export function cpredChemStatEffects(
  sheet: CpredChemSheet,
): { stat: CpredStatId; value: number; source: string }[] {
  const rows: { stat: CpredStatId; value: number; source: string }[] = [];
  for (const dose of sheet.chems?.doses ?? []) {
    const drug = cpredDrug(dose.substanceId);
    for (const mod of drug?.stats ?? []) {
      rows.push({ stat: mod.stat, value: mod.value, source: dose.source });
    }
  }
  for (const drug of CPRED_DRUGS) {
    if (!biteOf(sheet, drug)) continue;
    for (const mod of drug.addiction!.stats ?? []) {
      rows.push({ stat: mod.stat, value: mod.value, source: cpredAddictionLabel(drug) });
    }
  }
  return rows;
}

/**
 * Wiersze rozbicia rzutu dla jednej Umiejętności — Grzmot +2, uzależnienie −2.
 * Dawka liczy się raz, choćby wydłużona trzy razy.
 */
export function cpredChemSkillRows(
  sheet: CpredChemSheet,
  skillId: string,
): { label: string; value: number }[] {
  const rows: { label: string; value: number }[] = [];
  const seen = new Set<string>();
  for (const dose of sheet.chems?.doses ?? []) {
    const drug = cpredDrug(dose.substanceId);
    if (!drug?.skills || !drug.skills.ids.includes(skillId) || seen.has(drug.id)) continue;
    seen.add(drug.id);
    rows.push({ label: drug.name, value: drug.skills.value });
  }
  for (const drug of CPRED_DRUGS) {
    const skills = drug.addiction?.skills;
    if (!skills || !skills.ids.includes(skillId) || !biteOf(sheet, drug)) continue;
    rows.push({ label: cpredAddictionLabel(drug), value: skills.value });
  }
  return rows;
}

/** Suma `cpredChemSkillRows` — dla miejsc bez rozbicia (Test wymuszony). */
export function cpredChemSkillBonus(sheet: CpredChemSheet, skillId: string): number {
  return cpredChemSkillRows(sheet, skillId).reduce((sum, row) => sum + row.value, 0);
}

/** Dawka, która zawiesza kary Poważnie Rannego — nazwa albo `null`. */
export function cpredChemWoundSuspension(sheet: CpredChemSheet): string | null {
  for (const dose of sheet.chems?.doses ?? []) {
    if (cpredDrug(dose.substanceId)?.ignoreSeriousWound) return dose.source;
  }
  return null;
}

/**
 * Rundy i minuty jednego pełnego czasu działania — do wydłużenia terminu.
 * Runda liczy się ze stałej 3 s, jak każdy termin rundowy od 17.10.
 */
export function cpredChemSpan(durationS: number): { rounds: number; minutes: number } {
  return {
    rounds: Math.max(1, Math.ceil(durationS / CPRED_ROUND_SECONDS)),
    minutes: Math.max(1, Math.ceil(durationS / CPRED_MINUTE_S)),
  };
}

/** Wynik zażycia: nowa lista dawek i to, co z dawką się stało. */
export interface CpredTakeDoseResult {
  chems: CpredChems;
  dose: CpredActiveDose;
  /** `extended` — wydłużyła działającą, `stacked` — doszła obok, `new` — pierwsza. */
  how: 'new' | 'extended' | 'stacked';
  /** Dawka alkoholu, która wypadła, bo czwarta się nie mieści. */
  dropped?: CpredActiveDose;
}

/**
 * Zażycie jednej dawki. `fresh` — terminy liczone od teraz
 * (`cpredStatEffectDeadlines`), `humanityLost` — wylosowane przez wołającego.
 *
 * Druga dawka narkotyku przesuwa **oba** terminy o pełny czas działania, a gdy
 * pierwszej nic nie liczyło rund (poza walką), dostaje rundowy od teraz.
 */
export function cpredTakeDose(
  chems: CpredChems,
  drug: Pick<CpredDrug, 'name' | 'durationS' | 'maxStacks'> & { id: string },
  fresh: CpredChemDeadlines,
  makeId: () => string,
  humanityLost = 0,
): CpredTakeDoseResult {
  const lost = humanityLost > 0 ? { humanityLost } : {};
  const same = chems.doses.filter((dose) => dose.substanceId === drug.id);
  if (drug.maxStacks === undefined && same.length > 0) {
    const first = same[0]!;
    const span = cpredChemSpan(drug.durationS);
    const extended: CpredActiveDose = {
      ...first,
      durationS: Math.min(CPRED_CHEM_DURATION_MAX_S, first.durationS + drug.durationS),
      ...(first.expiresAtMinute !== undefined
        ? { expiresAtMinute: first.expiresAtMinute + span.minutes }
        : fresh.expiresAtMinute !== undefined
          ? { expiresAtMinute: fresh.expiresAtMinute }
          : {}),
      ...(first.expiresAtRound !== undefined
        ? { expiresAtRound: first.expiresAtRound + span.rounds }
        : fresh.expiresAtRound !== undefined
          ? { expiresAtRound: fresh.expiresAtRound }
          : {}),
      ...((first.humanityLost ?? 0) + humanityLost > 0
        ? { humanityLost: (first.humanityLost ?? 0) + humanityLost }
        : {}),
    };
    return {
      chems: {
        ...chems,
        doses: chems.doses.map((dose) => (dose.id === first.id ? extended : dose)),
      },
      dose: extended,
      how: 'extended',
    };
  }
  const dose: CpredActiveDose = {
    id: makeId(),
    substanceId: drug.id,
    source: drug.name,
    durationS: drug.durationS,
    ...fresh,
    ...lost,
  };
  let doses = [...chems.doses];
  let dropped: CpredActiveDose | undefined;
  if (drug.maxStacks !== undefined && same.length >= drug.maxStacks) {
    // Najstarsza wypada — czwarty kieliszek nie dokłada czwartego −1 REF,
    // tylko przedłuża upojenie o godzinę od teraz.
    dropped = same[0]!;
    doses = doses.filter((row) => row.id !== dropped!.id);
  }
  doses.push(dose);
  if (doses.length > CPRED_CHEM_DOSES_MAX) doses = doses.slice(-CPRED_CHEM_DOSES_MAX);
  return {
    chems: { ...chems, doses },
    dose,
    how: same.length > 0 ? 'stacked' : 'new',
    ...(dropped ? { dropped } : {}),
  };
}

/** Zdejmuje dawki tej substancji (Dynadetoks, ręka MG). */
export function cpredClearDoses(
  chems: CpredChems,
  keep: (dose: CpredActiveDose) => boolean,
): { chems: CpredChems; removed: CpredActiveDose[] } {
  const removed = chems.doses.filter((dose) => !keep(dose));
  if (removed.length === 0) return { chems, removed };
  return { chems: { ...chems, doses: chems.doses.filter(keep) }, removed };
}

/** Zatrucie ostrza — nowa fiolka zastępuje starą na tym samym wierszu broni. */
export function cpredCoatBlade(
  chems: CpredChems,
  weaponRowId: string,
  toxin: CpredBladeToxin,
  fresh: CpredChemDeadlines,
  makeId: () => string,
): { chems: CpredChems; coating: CpredBladeCoating } {
  const coating: CpredBladeCoating = {
    id: makeId(),
    weaponRowId,
    toxinId: toxin.id,
    durationS: toxin.durationS,
    ...fresh,
  };
  return {
    chems: {
      ...chems,
      coatings: [...chems.coatings.filter((row) => row.weaponRowId !== weaponRowId), coating],
    },
    coating,
  };
}

/** Trucizna, która teraz siedzi na tym wierszu broni — bez sprawdzania terminu. */
export function cpredCoatingOf(
  sheet: CpredChemSheet,
  weaponRowId: string,
): { coating: CpredBladeCoating; toxin: CpredBladeToxin } | null {
  const coating = (sheet.chems?.coatings ?? []).find((row) => row.weaponRowId === weaponRowId);
  const toxin = coating ? cpredBladeToxin(coating.toxinId) : null;
  return coating && toxin ? { coating, toxin } : null;
}

/* ------------------------------------------------------------------ *
 * Farmaceutyki z limitem
 * ------------------------------------------------------------------ */

/**
 * „Skuteczny tylko raz dziennie” / „raz na tydzień” (s. 150) — w minutach
 * zegara świata. Do etapu 59b nieegzekwowane, bo nie było zegara (etap 37).
 */
export const CPRED_PHARMA_LIMIT_MINUTES: Readonly<Record<string, number>> = {
  'pharma.turbo-uzdrawiacz': DAY_MINUTES,
  'pharma.stym': DAY_MINUTES,
  'pharma.zryw': 7 * DAY_MINUTES,
};

/**
 * Ile minut zostało do następnej skutecznej dawki — 0, gdy dawka zadziała.
 * Bez zegara (`now === null`) limit nie obowiązuje: nie ma czym go zmierzyć.
 */
export function cpredPharmaCooldown(
  chems: CpredChems | undefined,
  pharmaId: string,
  now: number | null,
): number {
  const limit = CPRED_PHARMA_LIMIT_MINUTES[pharmaId];
  const last = chems?.lastTaken[pharmaId];
  if (limit === undefined || last === undefined || now === null) return 0;
  return Math.max(0, last + limit - now);
}

/** „23 h 10 min” — ile do następnej skutecznej dawki. */
export function describeCpredMinutes(minutes: number): string {
  const days = Math.floor(minutes / DAY_MINUTES);
  const hours = Math.floor((minutes % DAY_MINUTES) / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (hours > 0) parts.push(`${hours} h`);
  if (rest > 0 || parts.length === 0) parts.push(`${rest} min`);
  return parts.join(' ');
}

/* ------------------------------------------------------------------ *
 * Uzależnienie (59c)
 * ------------------------------------------------------------------ */

/**
 * Czy po końcu tej dawki rzuca się na uzależnienie: narkotyk uzależnia, a jest
 * o co rzucać — postać nie jest jeszcze uzależniona albo Czarna szpryca trzyma
 * jej Człowieczeństwo (udany rzut je oddaje także uzależnionemu).
 */
export function cpredAddictionRollDue(chems: CpredChems, dose: CpredActiveDose): boolean {
  const drug = cpredDrug(dose.substanceId);
  if (!drug?.addiction) return false;
  const addicted = chems.addictions.includes(drug.id as CpredStreetDrugId);
  return !addicted || (dose.humanityLost ?? 0) > 0;
}

/** Dopisuje uzależnienie (porażka rzutu albo ręka MG); drugi raz nic nie robi. */
export function cpredAddAddiction(chems: CpredChems, drugId: CpredStreetDrugId): CpredChems {
  if (chems.addictions.includes(drugId)) return chems;
  return { ...chems, addictions: [...chems.addictions, drugId] };
}

/** Terapia (s. 229) — guzik MG. */
export function cpredRemoveAddiction(chems: CpredChems, drugId: string): CpredChems {
  return { ...chems, addictions: chems.addictions.filter((id) => id !== drugId) };
}

/* ------------------------------------------------------------------ *
 * Etykiety
 * ------------------------------------------------------------------ */

/** „INT +2” albo „+2 do 6 Umiejętności” — skrót skutku na chip. */
export function describeCpredDrugEffect(mods: {
  stats?: readonly CpredChemStatMod[];
  skills?: CpredChemSkillMod;
}): string {
  const parts = (mods.stats ?? []).map(
    (mod) =>
      `${CPRED_STAT_LABELS[mod.stat].abbr} ${mod.value > 0 ? '+' : '−'}${Math.abs(mod.value)}`,
  );
  if (mods.skills) {
    const sign = mods.skills.value > 0 ? '+' : '−';
    parts.push(`${sign}${Math.abs(mods.skills.value)} do ${mods.skills.ids.length} Umiejętności`);
  }
  return parts.join(', ');
}

/* ------------------------------------------------------------------ *
 * Odczyt z danych
 * ------------------------------------------------------------------ */

function readDeadlines(row: Record<string, unknown>): CpredChemDeadlines {
  const round = row.expiresAtRound;
  const minute = row.expiresAtMinute;
  return {
    ...(typeof round === 'number' && Number.isInteger(round) && round > 0
      ? { expiresAtRound: round }
      : {}),
    ...(typeof minute === 'number' && Number.isInteger(minute) && minute > 0
      ? { expiresAtMinute: minute }
      : {}),
  };
}

function readId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 32 ? value : null;
}

function readDuration(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= CPRED_CHEM_DURATION_MAX_S
    ? value
    : null;
}

function readDose(raw: unknown): CpredActiveDose | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const id = readId(row.id);
  const durationS = readDuration(row.durationS);
  if (!id || durationS === null) return null;
  if (typeof row.substanceId !== 'string' || row.substanceId.length === 0) return null;
  if (!isCpredDrugId(row.substanceId) && row.substanceId !== 'pharma.zryw') return null;
  if (typeof row.source !== 'string' || row.source.trim().length === 0) return null;
  const lost = row.humanityLost;
  return {
    id,
    substanceId: row.substanceId,
    source: row.source.slice(0, 64),
    durationS,
    ...readDeadlines(row),
    ...(typeof lost === 'number' && Number.isInteger(lost) && lost > 0 && lost <= 200
      ? { humanityLost: lost }
      : {}),
  };
}

function readCoating(raw: unknown): CpredBladeCoating | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const id = readId(row.id);
  const weaponRowId = readId(row.weaponRowId);
  const durationS = readDuration(row.durationS);
  if (!id || !weaponRowId || durationS === null) return null;
  if (typeof row.toxinId !== 'string' || !TOXIN_BY_ID.has(row.toxinId)) return null;
  return {
    id,
    weaponRowId,
    toxinId: row.toxinId as CpredBladeToxinId,
    durationS,
    ...readDeadlines(row),
  };
}

/**
 * Pole z JSON-a. Zły wiersz odpada po cichu — pisze je wyłącznie silnik, więc
 * zepsuty jest starą daną, a nie literówką (umowa `readCpredStatEffect`).
 */
export function readCpredChems(raw: unknown): CpredChems {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return cpredEmptyChems();
  const value = raw as Record<string, unknown>;
  const doses = Array.isArray(value.doses)
    ? value.doses
        .slice(0, CPRED_CHEM_DOSES_MAX)
        .map(readDose)
        .filter((row): row is CpredActiveDose => row !== null)
    : [];
  const addictions = Array.isArray(value.addictions)
    ? [...new Set(value.addictions.filter(isCpredStreetDrugId))]
    : [];
  const lastTaken: Record<string, number> = {};
  if (typeof value.lastTaken === 'object' && value.lastTaken !== null) {
    for (const [key, minute] of Object.entries(value.lastTaken as Record<string, unknown>)) {
      if (CPRED_PHARMA_LIMIT_MINUTES[key] === undefined) continue;
      if (typeof minute === 'number' && Number.isInteger(minute) && minute >= 0) {
        lastTaken[key] = minute;
      }
    }
  }
  const coatings = Array.isArray(value.coatings)
    ? value.coatings
        .slice(0, 8)
        .map(readCoating)
        .filter((row): row is CpredBladeCoating => row !== null)
    : [];
  return { doses, addictions, lastTaken, coatings };
}
