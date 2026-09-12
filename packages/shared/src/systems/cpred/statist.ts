/**
 * Figura ostatystykowana szybkim edytorem — karta z sześciu liczb (etap 38a).
 *
 * **Historia tego pliku jest jego najważniejszym komentarzem.** Etap 16b dał
 * figurze bez karty własny „profil bojowy": kilkanaście liczb w kolumnie JSON
 * żetonu, przebieranych za `CpredCharacterData` dopiero w chwili rzutu. Powód
 * był dobry — ganger, który istnieje po to, żeby oddać trzy strzały i paść, nie
 * potrzebuje sześćdziesięciu sześciu Umiejętności, a MG nie ma czasu ich
 * wpisywać przed walką.
 *
 * Etap 38a tę umowę **cofnął**, bo zapłaciła za siebie dopiero przy
 * przekazywaniu przedmiotów: ganger z pistoletem maszynowym w profilu i gracz
 * z pistoletem maszynowym w ekwipunku trzymali dwa różne rodzaje przedmiotu,
 * a „weź to z ciała" nie miało jak przenieść jednego w drugie. Od 38a każda
 * ostatystykowana figura ma prawdziwy rekord `Character`, a w silniku zasad
 * nie ma już ani jednej gałęzi „to statysta".
 *
 * Co zostało, to **szybkość**, bo ona była całym powodem etapu 16b: menu żetonu
 * nadal pokazuje sześć pól, a nie kartę postaci. Ten moduł jest właśnie tym —
 * rzutem karty na te sześć pól (`statistQuick`) i drogą powrotną
 * (`applyStatistQuick`, `createStatistSheet`). Liczby mieszkają na karcie;
 * tutaj mieszka tylko sposób patrzenia na nie.
 *
 * Trzy rzeczy, których profil pilnował, a karta sama by ich nie utrzymała —
 * Wartość bojowa, zakaz uniku przed pociskami i wydrukowane PW — siedzą
 * w `statblock.ts`. Bez nich C-SWAT strzelałby jak krawężnik (błąd z 31.08)
 * i tracił piętnaście PW przy pierwszym zapisie karty.
 */

import { humanityMax } from './derived.js';
import { isValidCompendiumId } from './ids.js';
import { ARMOR_SP_MAX } from './locations.js';
import {
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  type CpredStats,
} from './stats.js';
import { cpredEffectiveStats } from './stateffects.js';
import {
  WEAPON_AMMO_MAX,
  createDefaultCharacterData,
  type CpredArmorRow,
  type CpredCharacterData,
} from './character.js';
import { CPRED_EVASION_SKILL_ID } from './attacks.js';
import {
  CPRED_COMBAT_VALUE_MAX,
  CPRED_STATBLOCK_HP_MAX,
  cpredSheetHpMax,
  sanitizeStatBlock,
  type CpredStatBlock,
} from './statblock.js';

/** Longest weapon name a quick sheet will store — the sheet's own limit. */
export const STATIST_WEAPON_NAME_MAX = 64;

/**
 * Stats the quick editor shows. Four of the ten, and the four are not
 * arbitrary: REF fires a gun, DEX swings and dodges, BODY decides bare-handed
 * damage and how much choking hurts, WILL answers suppressive fire. The rest of
 * the card keeps whatever it has — the editor simply does not ask about them.
 */
export const STATIST_STAT_IDS = ['ref', 'dex', 'body', 'will'] as const;
export type StatistStatId = (typeof STATIST_STAT_IDS)[number];

/** The stat every unasked stat of a quick figure takes. RAW's ordinary human. */
export const STATIST_DEFAULT_STAT = 5;

/**
 * Sufit poziomu Umiejętności broni w szybkim edytorze.
 *
 * Nadal **nie** dziesiątka z karty (błąd znaleziony 31.08): pole przyjmuje też
 * Wartość bojową, którą MG wpisuje funkcjonariuszowi albo Demonowi, a ta bywa
 * powyżej dziesięciu. Rozstrzyga o tym `combatValue` w bloku statystyk — gdy
 * jest ustawione, ta sama liczba jedzie do rzutu z Cechami wyzerowanymi.
 */
export const STATIST_SKILL_LEVEL_MAX = CPRED_COMBAT_VALUE_MAX;

/** Most wounds one quick figure keeps — the two tables hold 22. */
export const STATIST_INJURY_MAX = 12;

/**
 * Ile Umiejętności zmieści się figurze wpisanej szybkim edytorem. Piętnaście
 * przynosi Wsparcie 10. poziomu (s. 159) i to jest najdłuższa lista, jaką
 * drukuje podręcznik; dwadzieścia zostawia MG zapas. Figura, której brakuje
 * miejsca, chce pełnej karty — a od 38a ma ją i tak, więc limit dotyczy
 * wyłącznie tego, ile wierszy pokaże menu żetonu.
 */
export const STATIST_SKILL_MAX = 20;

/**
 * The single weapon row id a quick sheet uses. Stable, so the chat card of an
 * attack can point back at it after a reload — and so `applyStatistQuick`
 * knows which of the card's weapons the editor's one field means.
 */
export const STATIST_WEAPON_ROW_ID = 'statist-weapon';

/**
 * Dwa rzędy pancerza, które zakłada szybki edytor — stałe z tego samego powodu.
 *
 * Dwa, a nie jeden, bo podręcznik przy figurach bez karty drukuje jedną liczbę
 * („OB — Odporność balistyczna pancerza **na głowie i ciele**", s. 158),
 * a `armorCoversLocation` dobiera rząd po miejscu trafienia: jeden rząd
 * „korpus" zostawiłby figurę z gołą głową.
 */
export const STATIST_ARMOR_ROW_IDS = {
  head: 'statist-armor-head',
  body: 'statist-armor-body',
} as const;

/**
 * Sześć pól menu żetonu, jako jeden obiekt.
 *
 * **Nigdzie nie przechowywany** — to jest rzut karty, nie zapis. Do 38a ta sama
 * struktura nazywała się `CpredCombatProfile` i siedziała w kolumnie żetonu;
 * różnica jest cała.
 */
export interface CpredStatistQuick {
  ref: number;
  dex: number;
  body: number;
  will: number;
  /** RUCH — istotny przy dystansie i Teście Przeżywalności (s. 158). */
  move: number;
  /**
   * Poziom Umiejętności, którą strzela broń tej figury.
   *
   * Jedna liczba, a nie tabela: figura z szybkiego edytora ma jedną broń,
   * a Umiejętność, którą ta broń strzela, bierze się z kompendium — nazwanie
   * jej drugi raz pozwoliłoby obu wersjom się rozjechać. Na karcie ląduje
   * w bloku statystyk (`statBlock.weaponSkill`), a nie pod id Umiejętności;
   * dlaczego — patrz komentarz przy tamtym polu.
   */
  skillLevel: number;
  /** Poziom „Uniku" — obronna połowa figury (rozstrzygnięcie z 16b). */
  evasion: number;
  /** Wartość bojowa (s. 158); `null` = Cecha + Umiejętność jak u każdego. */
  combatValue: number | null;
  /** „Funkcjonariusze Wsparcia nie mogą Unikać pocisków" (s. 158). */
  noBulletDodge: boolean;
  /** OB noszonego pancerza; 0 = bez pancerza. Ściera się jak każdy. */
  armorSp: number;
  /** Broń z kompendium; `null` = gołe pięści. */
  weaponId: string | null;
  weaponName: string;
  weaponDamage: string;
  ammoCurrent: number;
  ammoMax: number;
  hpCurrent: number;
  hpMax: number;
  /**
   * Umiejętności, którymi tej figurze **wolno** rzucić poza walką (30.08).
   *
   * Nie to samo, co `skillLevel`: tamto odpowiada „na ilu", a to „czy w ogóle".
   * Rozdział jest celowy — atak pyta o poziom Umiejętności, którą strzela broń,
   * i ma dostać liczbę także wtedy, gdy nikt tej Umiejętności nie wpisał; Test
   * Percepcji ma nie istnieć, dopóki ktoś nie powie, że ta figura umie patrzeć.
   *
   * Wstawia je reguła (Wsparcie 10. poziomu przynosi swoich piętnaście —
   * „mogą oni wykorzystać swoją Wartość bojową w Testach poniższych
   * Umiejętności", s. 159) albo ręka MG w menu żetonu. Poziom ścina się tu do
   * sufitu **karty**, bo od 38a to jest zwykły wiersz Umiejętności; prawdziwą
   * liczbę funkcjonariusza podstawia Wartość bojowa przy rzucie.
   */
  skills: Record<string, number>;
}

export function createDefaultStatistQuick(): CpredStatistQuick {
  return {
    ref: STATIST_DEFAULT_STAT,
    dex: STATIST_DEFAULT_STAT,
    body: STATIST_DEFAULT_STAT,
    will: STATIST_DEFAULT_STAT,
    move: STATIST_DEFAULT_STAT,
    skillLevel: 4,
    evasion: 2,
    combatValue: null,
    noBulletDodge: false,
    armorSp: 0,
    weaponId: null,
    weaponName: 'Pięści',
    weaponDamage: '1k6',
    ammoCurrent: 0,
    ammoMax: 0,
    hpCurrent: 25,
    hpMax: 25,
    skills: {},
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Naprawia, co przysłał klient, i nigdy nie odmawia.
 *
 * Ta sama umowa, którą miał `sanitizeCombatProfile`: „ten ganger ma REF 0" jest
 * przy stole gorsze niż „ten ganger ma domyślny REF".
 */
export function sanitizeStatistQuick(raw: unknown): CpredStatistQuick {
  const base = createDefaultStatistQuick();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;
  const ammoMax = clampInt(input.ammoMax, 0, WEAPON_AMMO_MAX, base.ammoMax);
  const hpMaxValue = clampInt(input.hpMax, 1, CPRED_STATBLOCK_HP_MAX, base.hpMax);
  const combatValue =
    typeof input.combatValue === 'number' && Number.isFinite(input.combatValue)
      ? clampInt(input.combatValue, 0, CPRED_COMBAT_VALUE_MAX, 0)
      : null;
  return {
    // Zero jest dozwolone, choć karcie nie wolno: Wartość bojowa wieżyczki
    // i funkcjonariusza siedzi w jednej liczbie, a Cechy stoją wtedy na zerze,
    // żeby rozbicie rzutu czytało się uczciwie (s. 158, s. 214).
    ref: clampInt(input.ref, 0, CPRED_STAT_MAX, base.ref),
    dex: clampInt(input.dex, 0, CPRED_STAT_MAX, base.dex),
    body: clampInt(input.body, CPRED_STAT_MIN, CPRED_STAT_MAX, base.body),
    will: clampInt(input.will, 0, CPRED_STAT_MAX, base.will),
    move: clampInt(input.move, CPRED_STAT_MIN, CPRED_STAT_MAX, base.move),
    // Oba sufity to `STATIST_SKILL_LEVEL_MAX`, nie limit karty: Wsparcie
    // atakuje **i broni się** tą samą Wartością bojową (s. 158), więc ścięty
    // Unik byłby dokładnie tym samym błędem co ścięty atak.
    skillLevel: clampInt(
      input.skillLevel,
      SKILL_LEVEL_MIN,
      STATIST_SKILL_LEVEL_MAX,
      base.skillLevel,
    ),
    evasion: clampInt(input.evasion, SKILL_LEVEL_MIN, STATIST_SKILL_LEVEL_MAX, base.evasion),
    combatValue,
    noBulletDodge: input.noBulletDodge === true,
    armorSp: clampInt(input.armorSp, 0, ARMOR_SP_MAX, base.armorSp),
    weaponId:
      typeof input.weaponId === 'string' && isValidCompendiumId(input.weaponId)
        ? input.weaponId
        : null,
    weaponName: clampText(input.weaponName, STATIST_WEAPON_NAME_MAX, base.weaponName),
    weaponDamage: clampText(input.weaponDamage, 32, base.weaponDamage),
    ammoMax,
    // A magazine cannot hold more than it holds. Clamping here rather than at
    // the call sites is what lets the GM shrink a magazine on a loaded weapon
    // without leaving 30 rounds in a 12-round clip.
    ammoCurrent: Math.min(ammoMax, clampInt(input.ammoCurrent, 0, WEAPON_AMMO_MAX, ammoMax)),
    hpMax: hpMaxValue,
    hpCurrent: Math.min(
      hpMaxValue,
      clampInt(input.hpCurrent, 0, CPRED_STATBLOCK_HP_MAX, hpMaxValue),
    ),
    skills: sanitizeQuickSkills(input.skills),
  };
}

/**
 * Czyta listę Umiejętności, naprawiając co się da.
 *
 * Nieznane id **wypada po cichu**, tak jak w `validateSkills` na karcie: pliki
 * danych potrafią się skurczyć, a figura, która przestaje istnieć, bo
 * z `skills.json` zniknął wiersz, jest gorsza niż figura bez tego rzutu.
 * Poziom 0 też wypada — to jest lista „co ta figura umie", a umieć coś na zero
 * znaczy nie umieć.
 */
function sanitizeQuickSkills(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};
  const skills: Record<string, number> = {};
  for (const [id, level] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(skills).length >= STATIST_SKILL_MAX) break;
    if (id === CPRED_EVASION_SKILL_ID) continue;
    if (!isValidCompendiumId(id)) continue;
    const value = clampInt(level, SKILL_LEVEL_MIN, SKILL_LEVEL_MAX, 0);
    if (value > 0) skills[id] = value;
  }
  return skills;
}

/**
 * Blok statystyk, jakiego chce ta figura.
 *
 * PW trafiają do bloku **zawsze**, bo szybki edytor podaje je wprost: figura
 * z PW 35 przy BC 4 ma mieć trzydzieści pięć, a nie dwadzieścia policzone
 * z Cech. To jest ta sama decyzja, którą etap 16b podjął, trzymając PW na
 * żetonie — tylko dom się zmienił.
 */
function quickStatBlock(quick: CpredStatistQuick): CpredStatBlock | null {
  return sanitizeStatBlock({
    combatValue: quick.combatValue,
    weaponSkill: quick.skillLevel,
    noBulletDodge: quick.noBulletDodge,
    hpMax: quick.hpMax,
  });
}

/**
 * Karta figury zbudowana z sześciu liczb.
 *
 * Bierze `createDefaultCharacterData` i ścina do tego, czym figura z szybkiego
 * edytora jest: bez Szczęścia (nie ma z czego wydawać — „pula MG" to zasada,
 * której ten projekt nie ma), bez Roli, bez Ścieżki Życia i bez portfela.
 * Wszystko to zostaje **polami karty**, więc MG, który zechce z gangera zrobić
 * kogoś, po prostu je wypełnia — do 38a musiałby zacząć od nowa.
 */
export function createStatistSheet(quick: CpredStatistQuick): CpredCharacterData {
  const base = createDefaultCharacterData();
  const stats: CpredStats = {
    ...base.stats,
    int: STATIST_DEFAULT_STAT,
    ref: quick.ref,
    dex: quick.dex,
    tech: STATIST_DEFAULT_STAT,
    cool: STATIST_DEFAULT_STAT,
    will: quick.will,
    // Zero Szczęścia: figura, która mogłaby wydawać punkty, potrzebowałaby puli,
    // z której je bierze, a „pula MG" to zasada, której tu nie ma.
    luck: 0,
    move: quick.move,
    body: quick.body,
    emp: STATIST_DEFAULT_STAT,
  };
  return applyStatistQuick(
    {
      ...base,
      stats,
      luckCurrent: 0,
      // Pełne Człowieczeństwo, nie zero: EMP w grze liczy się z niego (23a),
      // a zbir bez karty nie jest cyberpsychopatą — po prostu nie ma chromu.
      humanityCurrent: humanityMax(stats),
      skills: {},
    },
    quick,
  );
}

/**
 * Pancerz „na głowie i ciele", jak drukuje go podręcznik przy figurach bez
 * karty (s. 158). Zużycie przeżywa zmianę OB w edytorze: OB spadło
 * z trafienia i MG, który podniesie katalogowe, nie ma tym cofać obrażeń.
 */
function quickArmorRows(data: CpredCharacterData, sp: number): CpredArmorRow[] {
  const mine = new Set<string>(Object.values(STATIST_ARMOR_ROW_IDS));
  const others = data.armor.filter((row) => !mine.has(row.id));
  if (sp <= 0) return others;
  const rows = (['head', 'body'] as const).map((location): CpredArmorRow => {
    const id = STATIST_ARMOR_ROW_IDS[location];
    const existing = data.armor.find((row) => row.id === id);
    if (existing) return { ...existing, sp, spCurrent: Math.min(existing.spCurrent, sp) };
    return { id, name: 'Pancerz', notes: '', location, sp, spCurrent: sp };
  });
  return [...rows, ...others];
}

/**
 * Wpisuje sześć liczb w **istniejącą** kartę, nie ruszając niczego poza nimi.
 *
 * Ekwipunek, rany, efekty czasowe, notatki i wszystko, co MG dopisał ręcznie,
 * przeżywa — bo od 38a ta sama figura bywa edytowana raz szybkim polem
 * w menu żetonu, a raz pełną kartą, i żadna z tych dróg nie ma prawa zjeść
 * drugiej.
 */
export function applyStatistQuick(
  data: CpredCharacterData,
  quick: CpredStatistQuick,
): CpredCharacterData {
  const others = data.weapons.filter((row) => row.id !== STATIST_WEAPON_ROW_ID);
  return {
    ...data,
    stats: {
      ...data.stats,
      ref: quick.ref,
      dex: quick.dex,
      body: quick.body,
      will: quick.will,
      move: quick.move,
    },
    statBlock: quickStatBlock(quick),
    hpCurrent: Math.max(0, Math.min(quick.hpMax, quick.hpCurrent)),
    skills: {
      ...quick.skills,
      // Unik zawsze z własnego pola: to on stoi w edytorze i to jego czyta
      // obrona figury. Poziom broni siedzi obok, w bloku statystyk.
      //
      // Ścięty do sufitu **karty**, bo to zwykły wiersz Umiejętności, a jeden
      // wiersz spoza zakresu każe `validateSkills` odrzucić całą mapę — figura
      // straciłaby wtedy wszystkie Umiejętności naraz. Funkcjonariusz Wsparcia
      // broni się i tak Wartością bojową, którą podstawia `cpredSheetRollSheet`.
      [CPRED_EVASION_SKILL_ID]: Math.min(quick.evasion, SKILL_LEVEL_MAX),
    },
    weapons: [
      {
        id: STATIST_WEAPON_ROW_ID,
        name: quick.weaponName,
        notes: '',
        damage: quick.weaponDamage,
        ammoCurrent: quick.ammoCurrent,
        ammoMax: quick.ammoMax,
        ammoType: '',
        rof: '1',
        ...(quick.weaponId ? { compendiumId: quick.weaponId } : {}),
      },
      ...others,
    ],
    armor: quickArmorRows(data, quick.armorSp),
  };
}

/**
 * Karta obejrzana przez sześć pól edytora.
 *
 * Droga powrotna do `applyStatistQuick`, i celowo **stratna**: karta wie
 * o sobie znacznie więcej, niż mieści się w menu żetonu. Pola, których edytor
 * nie pokazuje, wracają nietknięte właśnie dlatego, że `applyStatistQuick`
 * bierze całą kartę, a nie sam ten obiekt.
 */
export function statistQuick(data: CpredCharacterData): CpredStatistQuick {
  const weapon = data.weapons.find((row) => row.id === STATIST_WEAPON_ROW_ID) ?? data.weapons[0];
  const armor =
    data.armor.find((row) => row.id === STATIST_ARMOR_ROW_IDS.body) ??
    data.armor.find((row) => row.location === 'body') ??
    data.armor[0];
  return sanitizeStatistQuick({
    ref: data.stats.ref,
    dex: data.stats.dex,
    body: data.stats.body,
    will: data.stats.will,
    move: data.stats.move,
    skillLevel: data.statBlock?.weaponSkill ?? 0,
    // Wartość bojowa jest **i** atakiem, i obroną (s. 158), więc gdy ją
    // wpisano, to ona stoi w polu Uniku — a nie dziesiątka, do której ścięło
    // się to, co poszło na kartę.
    evasion: data.statBlock?.combatValue ?? data.skills[CPRED_EVASION_SKILL_ID] ?? 0,
    combatValue: data.statBlock?.combatValue ?? null,
    noBulletDodge: data.statBlock?.noBulletDodge ?? false,
    armorSp: armor?.spCurrent ?? 0,
    weaponId: weapon?.compendiumId ?? null,
    weaponName: weapon?.name ?? 'Pięści',
    weaponDamage: weapon?.damage ?? '1k6',
    ammoCurrent: weapon?.ammoCurrent ?? 0,
    ammoMax: weapon?.ammoMax ?? 0,
    hpCurrent: data.hpCurrent,
    // Karta bez wydrukowanych PW pokazuje w edytorze to, co i tak ma:
    // maksimum policzone z BC i SW.
    hpMax: cpredSheetHpMax(data),
    skills: data.skills,
  });
}

/**
 * Karta przygotowana do **jednego** rzutu (etap 38a, dawniej
 * `combatProfileSheetForSkill`).
 *
 * Robi jedną rzecz: podstawia Wartość bojową. „Wartość bojowa: Umiejętność
 * bazowa używana do ataku i obrony. Reprezentuje sumę Cechy i Umiejętności
 * funkcjonariusza" (s. 158) — więc Cechy idą do zera, bo inaczej agent
 * federalny rzucający Dedukcją na 14 policzyłby swoją Cechę dwa razy,
 * a rozbicie rzutu skłamałoby dwukrotnie.
 *
 * BC, RUCH i SZ zostają: pierwsze dwa podręcznik drukuje obok Wartości bojowej
 * jako osobne liczby („istotne przy rozpatrywaniu dystansu […] np. w Teście
 * Przeżywalności"), a Szczęścia taka figura i tak nie ma.
 *
 * Karta bez Wartości bojowej wraca **nietknięta** — to jest zwykła karta
 * i liczy się zwyczajnie.
 */
export function cpredSheetRollSheet(
  data: CpredCharacterData,
  skillId: string | null,
): CpredCharacterData {
  const block = data.statBlock;
  if (!block) return data;
  if (block.combatValue != null) {
    return {
      ...data,
      stats: { ...data.stats, int: 0, ref: 0, dex: 0, tech: 0, cool: 0, will: 0, emp: 0 },
      skills: {
        ...data.skills,
        [CPRED_EVASION_SKILL_ID]: block.combatValue,
        ...(skillId ? { [skillId]: block.combatValue } : {}),
      },
    };
  }
  // Poziom broni podstawia się **tylko** pod Umiejętność, której karta sama nie
  // wymienia: ganger, któremu MG dopisał „Broń krótka 6" na pełnej karcie, ma
  // strzelać szóstką, a nie czwórką z szybkiego edytora.
  if (block.weaponSkill == null || !skillId || data.skills[skillId] !== undefined) return data;
  return { ...data, skills: { ...data.skills, [skillId]: block.weaponSkill } };
}

/**
 * Ta sama wieżyczka, z cudzymi rękami na spuście (etap 26d).
 *
 * „Gdy system jest pod kontrolą Netrunnera, wszelkie ataki i Testy obrony
 * wykonuje, rzucając na Umiejętności tego Netrunnera, tak jakby ten strzelał
 * z trzymanych w rękach broni" (s. 213). Wszystko, co dotyczy **broni**,
 * zostaje wieżyczki — lufa, magazynek, poszycie; wszystko, co dotyczy
 * **strzelca**, staje się operatora.
 *
 * Podstawienie, a nie gałąź w planerze, i o to właśnie chodzi: atak jedzie
 * dalej przez `performAttackRoll` bez zmian, więc zasięg, osłona, linia
 * strzału, amunicja i karta obrażeń zachowują się tak, jak gdy spust naciska
 * człowiek.
 */
export function cpredSheetOperatedBy(
  data: CpredCharacterData,
  operator: Pick<CpredCharacterData, 'stats' | 'skills' | 'humanityCurrent' | 'statEffects'>,
  skillId: string | null,
): CpredCharacterData {
  // Etap 39: Cechy operatora **jak teraz** — wieżyczka strzela jego refleksem,
  // więc godzina pod Nerwosolem obniża też celność zdalnego działka.
  const stats = cpredEffectiveStats(operator);
  const level = skillId ? (operator.skills[skillId] ?? 0) : 0;
  return {
    ...data,
    // Wartość bojowa wieżyczki przestaje cokolwiek znaczyć, gdy celuje
    // człowiek: to jego Cechy i jego Umiejętności, a `cpredSheetRollSheet`
    // wyzerowałoby je z powrotem.
    statBlock: data.statBlock ? { ...data.statBlock, combatValue: null } : null,
    stats: { ...data.stats, ref: stats.ref, dex: stats.dex, body: stats.body, will: stats.will },
    skills: {
      ...data.skills,
      ...(skillId ? { [skillId]: level } : {}),
      [CPRED_EVASION_SKILL_ID]: operator.skills[CPRED_EVASION_SKILL_ID] ?? 0,
    },
  };
}

/**
 * Ta sama wieżyczka z maszynową ręką na spuście (etap 26e).
 *
 * „W czasie samodzielnego działania systemy obronne określają skuteczność
 * swoich działań, wykonując Test Wartości bojowej + 1k10" (s. 214), a Demon
 * przy węźle kontrolnym rzuca tą samą jedną liczbą (s. 212). Unik idzie do
 * zera: „nie mogą unikać ataków" (s. 214) — i to jest różnica wobec
 * funkcjonariusza Wsparcia, który Wartością bojową **broni się** także.
 */
export function cpredSheetWithCombatValue(
  data: CpredCharacterData,
  combatValue: number,
): CpredCharacterData {
  const value = Math.max(0, Math.round(combatValue));
  return {
    ...data,
    statBlock: {
      ...(data.statBlock ?? { weaponSkill: null, hpMax: null }),
      combatValue: value,
      noBulletDodge: true,
    },
    // Zerowane Cechy zjawiają się dopiero w `cpredSheetRollSheet`; tutaj
    // zostaje sama deklaracja, żeby jedno miejsce rozstrzygało, jak Wartość
    // bojowa wchodzi do rzutu.
    skills: { ...data.skills, [CPRED_EVASION_SKILL_ID]: 0 },
  };
}
