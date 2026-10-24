/**
 * Chrom i sprzęt, które zmieniają liczby karty (etap 59a) — czysta arytmetyka.
 *
 * Do tej sesji montaż wszczepu odejmował wyłącznie Człowieczeństwo: Przeszczep
 * splotu mięśniowo-kostnego stał na karcie jak naklejka, a Kerenzikov nie
 * przesuwał figury w kolejce. Podręcznik każe im robić swoje — „Zwiększa
 * Budowę Ciała o 2” (s. 362), „+2 do Inicjatywy”, „+2 do Odporności na
 * tortury/narkotyki” — i ten moduł jest jedynym miejscem, które to wie.
 *
 * Pięć rozstrzygnięć niesie ten moduł.
 *
 * 1. **Dane, nie gałąź w kodzie.** `CPRED_CHROME_MODS` to tabela: wiersz na
 *    rzecz, rozpoznanie po wpisie kompendium **albo po nazwie** (wiersz z
 *    katalogu i wiersz wpisany ręką mają wspólną tylko nazwę — umowa
 *    `cpredHasAirhypo` i Edytora bólu), skutek jako liczby. Nowa rzecz to nowy
 *    wiersz tabeli, nie nowy `if` w planerze rzutu.
 *
 * 2. **Wszczep jest częścią bazy, egzoszkielet nie.** Podręcznik mówi o
 *    przeszczepie i ramownicy wszczepianej „zwiększa liczbę PW użytkownika,
 *    Próg Ran oraz wartość Przeżywalności”, a o ramownicy zewnętrznej — „Punkty
 *    Wytrzymałości ani rzut obronny przeciw śmierci nie zwiększają się”.
 *    Dlatego wszczep wchodzi do Cech **przed** Człowieczeństwem i efektami
 *    i rusza pule (`cpredChromeStats`), a podłączony egzoszkielet dopiero
 *    **po** efektach i tylko do rzutów (`cpredGearStatSteps`).
 *
 * 3. **Premie do Umiejętności się nie kumulują.** Każdy opis mówi to samo:
 *    „Instalacja kilku takich wszczepów nie powoduje zwiększenia premii”,
 *    „Premia nie kumuluje się z inną tego typu”, „Premie z różnych urządzeń
 *    nie kumulują się”. Na jedną Umiejętność liczy się więc **największa**
 *    premia, a nie suma — Techskaner w ręce i Techskaner w plecaku dają +2.
 *
 * 4. **Wymagań z opisu nie egzekwujemy** (decyzja MG z 24.10.2026). „Wymaga BC
 *    6 i przeszczepu splotu” montaż i tak przechodzi przez MG albo Medyka, więc
 *    karta pokazuje tylko notkę (`cpredChromeRequirementNotes`), a liczba rośnie.
 *
 * 5. **Premie zależne od zmysłu liczy stół** (decyzja MG z 24.10.2026). Serwer
 *    nie wie, czy Test Percepcji idzie wzrokiem, czy słuchem, więc Poprawa
 *    obrazu liczy się zawsze (jej trzy Testy prawie zawsze idą wzrokiem),
 *    a Ulepszony słuch i śpiew AudioVoksa dolicza MG modyfikatorem
 *    sytuacyjnym — karta mówi o nich notką (`tableNote`).
 *
 * Moduł nie importuje karty: `character.ts` importuje `stateffects.ts`, a ten
 * — ten plik. Wiersze są więc strukturalne, jak w `cyberware.ts`.
 */

import { CPRED_STAT_LABELS, CPRED_STAT_MAX, type CpredStatId, type CpredStats } from './stats.js';

/** Z której listy karty rzecz jest czytana. */
export type CpredChromeCarrier = 'cyberware' | 'gear';

/**
 * Zmiana jednej Cechy. `add` dokłada (każda sztuka osobno) aż do sufitu `cap`,
 * `setTo` podnosi do podanej liczby — „Wartość BC użytkownika wzrasta do 12”.
 */
export type CpredChromeStatMod =
  { stat: CpredStatId; add: number; cap: number } | { stat: CpredStatId; setTo: number };

/** Wymaganie z opisu — tylko do notki na karcie (akapit 4 w nagłówku). */
export interface CpredChromeRequirement {
  /** Cecha **bazowa** (z kreatora), nie podniesiona chromem. */
  stat?: { stat: CpredStatId; min: number };
  /** Inne rzeczy z tej tabeli, w podanej liczbie sztuk (także ta sama rzecz). */
  mods?: readonly { id: string; count: number }[];
  /** „BC 6 i przeszczep splotu mięśniowo-kostnego” — zdanie notki. */
  text: string;
}

/** Jeden wiersz tabeli. */
export interface CpredChromeMod {
  /** Własne id, stałe — `requires.mods` i `together` wskazują nim inne wiersze. */
  id: string;
  /** Nazwa w rozbiciu rzutu i na karcie. */
  label: string;
  carriers: readonly CpredChromeCarrier[];
  /** Wpisy kompendium (`cyberware.…`, `gear.…`), które to są. */
  compendiumIds: readonly string[];
  /** Nazwy, po których rozpoznaje się wiersz wpisany ręką. */
  names: readonly string[];
  stat?: CpredChromeStatMod;
  /** Stała premia do Umiejętności (id z `skills.json`). */
  skills?: { ids: readonly string[]; value: number };
  /** Premia do rzutu na Inicjatywę. */
  initiative?: number;
  /** Premia do ataku: `aimed` — przy Celowaniu, `telescope` — ≥ 51 m pojedynczym albo Celowanie. */
  attack?: { when: 'aimed' | 'telescope'; value: number };
  /** Czip Umiejętności — wybrana Umiejętność na tym poziomie, chyba że wyuczona jest wyższa. */
  skillChip?: number;
  /** Ile sztuk trzeba mieć, zanim skutek zadziała („co najmniej trzy tatuaże”). */
  minCount?: number;
  /** Działa tylko razem z tym drugim wierszem („chemskórę i techfryz”). */
  together?: string;
  /** Wiersz wyposażenia działa tylko podłączony (egzoszkielet). */
  needsConnected?: boolean;
  requires?: CpredChromeRequirement;
  /** To, czego VTT nie liczy samo — notka „MG dolicza modyfikatorem”. */
  tableNote?: string;
}

const REPAIR_SKILLS = [
  'basic-tech',
  'cybertech',
  'land-vehicle-tech',
  'sea-vehicle-tech',
  'air-vehicle-tech',
  'electronics-security',
  'weaponstech',
] as const;

const MEDICAL_SKILLS = ['first-aid', 'paramedic'] as const;

/** Id wiersza przeszczepu — ramownice liczą go w swoich wymaganiach. */
export const CPRED_CHROME_MUSCLE_LACE = 'muscle-bone-lace';

/**
 * Wszystko, co VTT liczy z chromu i sprzętu. Same liczby i krótkie nazwy —
 * opisów z podręcznika tu nie ma (repozytorium jest publiczne).
 */
export const CPRED_CHROME_MODS: readonly CpredChromeMod[] = [
  {
    id: CPRED_CHROME_MUSCLE_LACE,
    label: 'Przeszczep splotu mięśniowo-kostnego',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.przeszczep-splotu-miesniowokostnego'],
    names: ['Przeszczep splotu mięśniowo-kostnego'],
    stat: { stat: 'body', add: 2, cap: CPRED_STAT_MAX },
  },
  {
    id: 'linear-frame-sigma',
    label: 'Implantowana ramownica linearna ∑',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.implantowana-ramownica-linearna-sigma'],
    names: [
      'Implantowana ramownica linearna ∑ (Sigma)',
      'Implantowana ramownica linearna Sigma',
      'Implantowana ramownica linearna ∑',
    ],
    stat: { stat: 'body', setTo: 12 },
    requires: {
      stat: { stat: 'body', min: 6 },
      mods: [{ id: CPRED_CHROME_MUSCLE_LACE, count: 1 }],
      text: 'BC 6 i przeszczep splotu mięśniowo-kostnego',
    },
  },
  {
    id: 'linear-frame-beta',
    label: 'Implantowana ramownica linearna ß',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.implantowana-ramownica-linearna-beta'],
    names: [
      'Implantowana ramownica linearna ß (Beta)',
      'Implantowana ramownica linearna Beta',
      'Implantowana ramownica linearna ß',
    ],
    stat: { stat: 'body', setTo: 14 },
    requires: {
      stat: { stat: 'body', min: 8 },
      mods: [{ id: CPRED_CHROME_MUSCLE_LACE, count: 2 }],
      text: 'BC 8 i dwa przeszczepy splotu mięśniowo-kostnego',
    },
  },
  {
    id: 'exo-frame-sigma',
    label: 'Ramownica linearna ∑',
    carriers: ['gear'],
    compendiumIds: ['gear.ramownica-linearna-sigma'],
    names: ['Ramownica linearna ∑ (Sigma)', 'Ramownica linearna Sigma', 'Ramownica linearna ∑'],
    stat: { stat: 'body', setTo: 12 },
    needsConnected: true,
    requires: {
      mods: [{ id: 'interface-plugs', count: 1 }],
      text: 'złącza interfejsu',
    },
  },
  {
    id: 'exo-frame-beta',
    label: 'Ramownica linearna ß',
    carriers: ['gear'],
    compendiumIds: ['gear.ramownica-linearna-beta'],
    names: ['Ramownica linearna ß (Beta)', 'Ramownica linearna Beta', 'Ramownica linearna ß'],
    stat: { stat: 'body', setTo: 14 },
    needsConnected: true,
    requires: {
      mods: [{ id: 'interface-plugs', count: 2 }],
      text: 'dwa złącza interfejsu',
    },
  },
  {
    // Bez skutku — liczy się w wymaganiach egzoszkieletów.
    id: 'interface-plugs',
    label: 'Złącza interfejsu',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.zlacza-interfejsu'],
    names: ['Złącza interfejsu'],
  },
  {
    id: 'kerenzikov',
    label: 'Kerenzikov',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.kerenzikov'],
    names: ['Kerenzikov'],
    initiative: 2,
  },
  {
    id: 'targeting-scope',
    label: 'Celownik optyczny',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.celownik-optyczny'],
    names: ['Celownik optyczny'],
    attack: { when: 'aimed', value: 1 },
  },
  {
    id: 'teleoptics',
    label: 'Teleskop',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.teleskop'],
    names: ['Teleskop'],
    attack: { when: 'telescope', value: 1 },
  },
  {
    id: 'skill-chip',
    label: 'Czip Umiejętności',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.czip-umiejetnosci'],
    names: ['Czip Umiejętności'],
    skillChip: 3,
  },
  {
    id: 'toxin-binders',
    label: 'Detoksykator',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.detoksykator'],
    names: ['Detoksykator'],
    skills: { ids: ['resist-torture-drugs'], value: 2 },
  },
  {
    id: 'voice-stress-analyzer',
    label: 'Analizator stresu w głosie',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.analizator-stresu-w-glosie'],
    names: ['Analizator stresu w głosie'],
    skills: { ids: ['human-perception', 'interrogation'], value: 2 },
  },
  {
    id: 'audiovox',
    label: 'AudioVox',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.audiovox'],
    names: ['AudioVox'],
    skills: { ids: ['acting'], value: 2 },
    tableNote: '+2 do Gry na instrumencie przy śpiewie — dolicza MG',
  },
  {
    id: 'image-enhancement',
    label: 'Poprawa obrazu',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.poprawa-obrazu'],
    names: ['Poprawa obrazu'],
    skills: { ids: ['perception', 'lip-reading', 'conceal-reveal-object'], value: 2 },
    requires: {
      mods: [{ id: 'image-enhancement', count: 2 }],
      text: 'w obu cyberoczach (sparowana)',
    },
  },
  {
    id: 'amplified-hearing',
    label: 'Ulepszony słuch',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.ulepszony-sluch'],
    names: ['Ulepszony słuch'],
    tableNote: '+2 do Percepcji słuchem — dolicza MG',
  },
  {
    id: 'medscanner',
    label: 'Skaner medyczny',
    carriers: ['cyberware', 'gear'],
    compendiumIds: ['cyberware.skaner-medyczny', 'gear.skaner-medyczny'],
    names: ['Skaner medyczny'],
    skills: { ids: MEDICAL_SKILLS, value: 2 },
  },
  {
    id: 'techscanner',
    label: 'Techskaner',
    carriers: ['cyberware', 'gear'],
    compendiumIds: ['cyberware.techskaner', 'gear.techskaner'],
    names: ['Techskaner'],
    skills: { ids: REPAIR_SKILLS, value: 2 },
  },
  {
    id: 'superchrome',
    label: 'Pokrycie Superchrom',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.pokrycie-superchrom'],
    names: ['Pokrycie Superchrom'],
    skills: { ids: ['wardrobe-style'], value: 2 },
  },
  {
    id: 'light-tattoo',
    label: 'Tatuaże świetlne',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.tatuaz-swietlny'],
    names: ['Tatuaż świetlny'],
    skills: { ids: ['wardrobe-style'], value: 2 },
    minCount: 3,
  },
  {
    id: 'chemskin',
    label: 'Chemskóra i techfryz',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.chemskora'],
    names: ['Chemskóra'],
    skills: { ids: ['personal-grooming'], value: 2 },
    together: 'techhair',
  },
  {
    id: 'techhair',
    label: 'Chemskóra i techfryz',
    carriers: ['cyberware'],
    compendiumIds: ['cyberware.techfryz'],
    names: ['Techfryz'],
    skills: { ids: ['personal-grooming'], value: 2 },
    together: 'chemskin',
  },
];

/* ------------------------------------------------------------------ *
 * Rozpoznanie
 * ------------------------------------------------------------------ */

/** Wiersz cyborgizacji oczami tego modułu. */
export interface CpredChromeRow {
  name: string;
  compendiumId?: string;
  /** Czip Umiejętności: która Umiejętność (id z `skills.json`). */
  skillId?: string;
}

/** Wiersz wyposażenia oczami tego modułu. */
export interface CpredChromeGearRow {
  name: string;
  compendiumId?: string;
  qty: number;
  /** Egzoszkielet podłączony do użytkownika. */
  connected?: boolean;
}

/**
 * Karta oczami tego modułu. Obie listy opcjonalne: wołający z okrojonym widokiem
 * karty (sama BC i SW do PW) nie ma chromu i dostaje Cechy bez zmian.
 */
export interface CpredChromeSheet {
  cyberware?: readonly CpredChromeRow[];
  gear?: readonly CpredChromeGearRow[];
}

/**
 * „Przeszczep splotu mięśniowokostnego” i „mięśniowo-kostnego” to ta sama
 * rzecz: kompendium zgubiło łącznik, podręcznik go ma. Porównujemy więc same
 * litery i cyfry, małe, bez spacji, łączników i symboli (∑ znika, ß zostaje).
 */
export function normalizeChromeName(name: string): string {
  return name.toLocaleLowerCase('pl').replace(/[^\p{L}\p{N}]+/gu, '');
}

const NORMALIZED_NAMES = new Map(
  CPRED_CHROME_MODS.map((mod) => [mod.id, new Set(mod.names.map(normalizeChromeName))]),
);

function rowIs(mod: CpredChromeMod, row: { name: string; compendiumId?: string }): boolean {
  if (row.compendiumId && mod.compendiumIds.includes(row.compendiumId)) return true;
  return NORMALIZED_NAMES.get(mod.id)!.has(normalizeChromeName(row.name));
}

/** Rzecz z tabeli, którą jest ten wiersz, albo null. */
export function cpredChromeModOf(
  row: { name: string; compendiumId?: string },
  carrier: CpredChromeCarrier,
): CpredChromeMod | null {
  return CPRED_CHROME_MODS.find((mod) => mod.carriers.includes(carrier) && rowIs(mod, row)) ?? null;
}

/** Ile sztuk tej rzeczy karta ma — wszczepy wierszami, sprzęt sztukami. */
function countOf(mod: CpredChromeMod, sheet: CpredChromeSheet): number {
  let count = 0;
  if (mod.carriers.includes('cyberware')) {
    for (const row of sheet.cyberware ?? []) if (rowIs(mod, row)) count += 1;
  }
  if (mod.carriers.includes('gear')) {
    for (const row of sheet.gear ?? []) {
      if (row.qty <= 0 || !rowIs(mod, row)) continue;
      if (mod.needsConnected && row.connected !== true) continue;
      count += mod.needsConnected ? 1 : row.qty;
    }
  }
  return count;
}

/** Rzecz, która **działa** na tej karcie, i w ilu sztukach. */
export interface CpredActiveChrome {
  mod: CpredChromeMod;
  count: number;
}

/**
 * Wszystko z tabeli, co działa teraz: jest na karcie, w wymaganej liczbie
 * sztuk, z parą (`together`) i — dla egzoszkieletu — podłączone.
 */
export function cpredActiveChrome(sheet: CpredChromeSheet): CpredActiveChrome[] {
  if ((sheet.cyberware?.length ?? 0) === 0 && (sheet.gear?.length ?? 0) === 0) return [];
  const counts = new Map(CPRED_CHROME_MODS.map((mod) => [mod.id, countOf(mod, sheet)]));
  const active: CpredActiveChrome[] = [];
  for (const mod of CPRED_CHROME_MODS) {
    const count = counts.get(mod.id) ?? 0;
    if (count === 0 || count < (mod.minCount ?? 1)) continue;
    if (mod.together && (counts.get(mod.together) ?? 0) === 0) continue;
    active.push({ mod, count });
  }
  return active;
}

/* ------------------------------------------------------------------ *
 * Cechy
 * ------------------------------------------------------------------ */

/** Jeden krok chromu na jednej Cesze — wiersz rozbicia i dymka na karcie. */
export interface CpredChromeStatStep {
  stat: CpredStatId;
  /** „Przeszczep splotu mięśniowo-kostnego ×2” — co pisze wiersz rozbicia. */
  label: string;
  /** O ile ten krok **naprawdę** przesunął Cechę (po suficie). */
  value: number;
}

/**
 * Kroki chromu od podanych Cech: najpierw wszystko, co dokłada (każda sztuka
 * osobno, sufit `max(cap, bazowa)` — Cechy wyższej niż sufit przeszczep nie
 * obniża), potem wszystko, co podnosi „do” (`max(obecna, setTo)`). Kolejność
 * z podręcznika: ramownica wymaga przeszczepu, więc stoi na nim, a nie pod nim.
 */
function statSteps<T extends Partial<Record<CpredStatId, number>>>(
  stats: T,
  active: readonly CpredActiveChrome[],
): { stats: T; steps: CpredChromeStatStep[] } {
  const steps: CpredChromeStatStep[] = [];
  let result = stats;
  const apply = (entry: CpredActiveChrome, next: (now: number) => number) => {
    const mod = entry.mod.stat!;
    const now = result[mod.stat];
    if (now === undefined) return;
    const after = next(now);
    if (after === now) return;
    result = { ...result, [mod.stat]: after };
    steps.push({
      stat: mod.stat,
      label: entry.count > 1 ? `${entry.mod.label} ×${entry.count}` : entry.mod.label,
      value: after - now,
    });
  };
  for (const entry of active) {
    const mod = entry.mod.stat;
    if (!mod || !('add' in mod)) continue;
    apply(entry, (now) => {
      const ceiling = Math.max(mod.cap, now);
      return Math.min(ceiling, now + mod.add * entry.count);
    });
  }
  for (const entry of active) {
    const mod = entry.mod.stat;
    if (!mod || !('setTo' in mod)) continue;
    apply(entry, (now) => Math.max(now, mod.setTo));
  }
  return { stats: result, steps };
}

function implants(sheet: CpredChromeSheet): CpredActiveChrome[] {
  return cpredActiveChrome({ cyberware: sheet.cyberware ?? [] }).filter((entry) => entry.mod.stat);
}

function connectedGear(sheet: CpredChromeSheet): CpredActiveChrome[] {
  return cpredActiveChrome({ gear: sheet.gear ?? [] }).filter((entry) => entry.mod.stat);
}

/**
 * Cechy **z wszczepami** — baza puli PW, Progu Ran i Przeżywalności.
 *
 * Zwraca ten sam obiekt, gdy chrom niczego nie zmienił (umowa
 * `effectiveCpredStats`: planer porównuje przez wartość).
 */
export function cpredChromeStats<T extends Partial<Record<CpredStatId, number>>>(
  stats: T,
  sheet: CpredChromeSheet,
): T {
  const active = implants(sheet);
  return active.length === 0 ? stats : statSteps(stats, active).stats;
}

/** Wiersze rozbicia wszczepów dla jednej Cechy, liczone od Cech bazowych. */
export function cpredChromeStatSteps(
  stats: CpredStats,
  sheet: CpredChromeSheet,
  statId?: CpredStatId,
): CpredChromeStatStep[] {
  const steps = statSteps(stats, implants(sheet)).steps;
  return statId ? steps.filter((step) => step.stat === statId) : steps;
}

/**
 * Podłączony egzoszkielet nad Cechami „jak teraz” (po efektach) — wiersze
 * i Cechy wynikowe. Nie rusza pul: patrz akapit 2 w nagłówku.
 */
export function cpredGearStatSteps(
  stats: CpredStats,
  sheet: CpredChromeSheet,
): { stats: CpredStats; steps: CpredChromeStatStep[] } {
  const active = connectedGear(sheet);
  if (active.length === 0) return { stats, steps: [] };
  const { stats: next, steps } = statSteps(stats, active);
  return {
    stats: next,
    steps: steps.map((step) => ({ ...step, label: `${step.label} (podłączona)` })),
  };
}

/** „BC +2”, „BC do 12” — skutek wiersza w kilku znakach, na kartę. */
export function describeCpredChromeMod(
  mod: CpredChromeMod,
  skillName?: (id: string) => string,
): string {
  const parts: string[] = [];
  if (mod.stat) {
    const abbr = CPRED_STAT_LABELS[mod.stat.stat].abbr;
    parts.push(
      'add' in mod.stat
        ? `${abbr} +${mod.stat.add} (do ${mod.stat.cap})`
        : `${abbr} ${mod.stat.setTo}`,
    );
  }
  if (mod.skills) {
    const names = mod.skills.ids.map((id) => skillName?.(id) ?? id).join(', ');
    parts.push(`+${mod.skills.value}: ${names}`);
  }
  if (mod.initiative) parts.push(`Inicjatywa +${mod.initiative}`);
  if (mod.attack) {
    parts.push(
      mod.attack.when === 'aimed'
        ? `+${mod.attack.value} przy Celowaniu`
        : `+${mod.attack.value} przy strzale ≥ 51 m albo Celowaniu`,
    );
  }
  if (mod.skillChip) parts.push(`wybrana Umiejętność na poziomie ${mod.skillChip}`);
  if (mod.minCount) parts.push(`od ${mod.minCount} sztuk`);
  if (mod.tableNote) parts.push(mod.tableNote);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * Umiejętności
 * ------------------------------------------------------------------ */

/** Poziom z czipu dla tej Umiejętności albo 0, gdy żaden czip jej nie niesie. */
export function cpredSkillChipLevel(
  sheet: { cyberware?: readonly CpredChromeRow[] },
  skillId: string,
): number {
  let level = 0;
  for (const row of sheet.cyberware ?? []) {
    if (row.skillId !== skillId) continue;
    const mod = cpredChromeModOf(row, 'cyberware');
    if (mod?.skillChip) level = Math.max(level, mod.skillChip);
  }
  return level;
}

/**
 * Poziom Umiejętności, którym karta **gra** — wyuczony albo z czipu, większy
 * z dwóch: „chyba że już jest lepiej wyszkolony … Wtedy czip nie ma żadnego
 * efektu”. Jedyna droga do liczby poziomu w regułach; `data.skills[id]` to
 * to, co postać kupiła za PD, i tylko awans ma prawo czytać je wprost.
 */
export function cpredSkillLevel(
  sheet: { skills: Readonly<Record<string, number>>; cyberware?: readonly CpredChromeRow[] },
  skillId: string,
): number {
  const learned = sheet.skills[skillId] ?? 0;
  const chip = cpredSkillChipLevel(sheet, skillId);
  return Math.max(learned, chip);
}

/** Premia z chromu do jednej Umiejętności — największa, z nazwą źródła. */
export function cpredChromeSkillBonus(
  sheet: CpredChromeSheet,
  skillId: string,
): { label: string; value: number } | null {
  let best: { label: string; value: number } | null = null;
  for (const { mod } of cpredActiveChrome(sheet)) {
    if (!mod.skills || !mod.skills.ids.includes(skillId)) continue;
    if (!best || mod.skills.value > best.value)
      best = { label: mod.label, value: mod.skills.value };
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Inicjatywa i atak
 * ------------------------------------------------------------------ */

/**
 * Premia do Inicjatywy z chromu. „Naraz można zainstalować tylko jeden rodzaj
 * dopalacza prędkości” — więc największa, nie suma.
 */
export function cpredChromeInitiative(
  sheet: CpredChromeSheet,
): { label: string; value: number } | null {
  let best: { label: string; value: number } | null = null;
  for (const { mod } of cpredActiveChrome(sheet)) {
    if (!mod.initiative) continue;
    if (!best || mod.initiative > best.value) best = { label: mod.label, value: mod.initiative };
  }
  return best;
}

/** Co o strzale musi wiedzieć chrom w oku. */
export interface CpredChromeShot {
  metres: number;
  single: boolean;
  aimed: boolean;
  melee: boolean;
  /**
   * Nazwy chromu, który dodatek na broni wyłączył w tym strzale (`conflictsWith`
   * lunety snajperskiej: „Teleskop”). Rozpoznawane jak wiersz karty, po nazwie.
   */
  blockedBy?: readonly string[];
}

/** Odległość, od której Teleskop pomaga pojedynczemu strzałowi (ta sama co lunety). */
export const CPRED_TELESCOPE_MIN_METRES = 51;

/**
 * Wiersze ataku z chromu: Celownik optyczny przy Celowaniu, Teleskop przy
 * pojedynczym strzale na ≥ 51 m albo Celowaniu z broni dystansowej. Każdy
 * raz, ile by sztuk nie było („Instalacja kilku takich wszczepów nie powoduje
 * zwiększenia premii”).
 */
export function cpredChromeAttackModifiers(
  sheet: CpredChromeSheet,
  shot: CpredChromeShot,
): { label: string; value: number }[] {
  const rows: { label: string; value: number }[] = [];
  const blocked = (shot.blockedBy ?? []).map((name) => ({ name }));
  for (const { mod } of cpredActiveChrome(sheet)) {
    if (!mod.attack || blocked.some((row) => rowIs(mod, row))) continue;
    if (mod.attack.when === 'aimed' && shot.aimed) {
      rows.push({ label: mod.label, value: mod.attack.value });
    }
    if (mod.attack.when === 'telescope' && !shot.melee) {
      const far = shot.single && shot.metres >= CPRED_TELESCOPE_MIN_METRES;
      if (far || shot.aimed) rows.push({ label: mod.label, value: mod.attack.value });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Notki na karcie
 * ------------------------------------------------------------------ */

/**
 * „Brak wymagań: BC 6 i przeszczep splotu” przy wierszu tej rzeczy — albo
 * null, gdy wymagania są spełnione albo ich nie ma. Cecha **bazowa**, bo to
 * ona mówi, czy ciało udźwignie ramownicę.
 */
export function cpredChromeRequirementNote(
  mod: CpredChromeMod,
  sheet: CpredChromeSheet & { stats: CpredStats },
): string | null {
  const req = mod.requires;
  if (!req) return null;
  const statShort = req.stat && sheet.stats[req.stat.stat] < req.stat.min;
  const modsShort = (req.mods ?? []).some((need) => {
    const other = CPRED_CHROME_MODS.find((entry) => entry.id === need.id);
    return !other || countOf(other, sheet) < need.count;
  });
  return statShort || modsShort ? `Wymaga: ${req.text}` : null;
}
