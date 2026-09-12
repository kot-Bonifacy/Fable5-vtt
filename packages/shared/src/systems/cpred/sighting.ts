/**
 * Oględziny cudzej figury (etap 41) — co widać po drugiej stronie ulicy,
 * a co dopiero po Teście Percepcji.
 *
 * Etap wziął się z jednego zdania MG: punkt Celowania wybiera się dziś w ciemno.
 * „Obrażenia, które przejdą przez pancerz głowy, liczą się podwójnie" (s. 170)
 * jest regułą, na której stoi cała opłacalność strzału w głowę — a gracz nie ma
 * żadnej drogi do tego, **czy ten pancerz w ogóle tam jest**.
 *
 * Moduł jest czysty i **niczego nie szuka w katalogu**: nazwę typu broni dostaje
 * gotową od wołającego, tą samą umową, którą planer ataku dostaje `ResolvedWeapon`
 * („the planner is not allowed to go shopping"). Dzięki temu jedna funkcja
 * obsługuje serwer, który ma kompendium pod ręką, i test, który go nie ma.
 *
 * ## Dwie warstwy, jeden kształt
 *
 * `cpredSighting` zwraca **ten sam kształt** w obu warstwach, a różni je to, czy
 * pola liczbowe są wypełnione. To jest decyzja, nie skrót: klient rysuje jedną
 * listę, a nie dwie, więc „hełm" i „hełm bojowy OB 11" nie mogą się rozjechać
 * w dwa widoki, które trzeba potem trzymać w zgodzie.
 *
 * ## Czego tu nie ma i być nie może
 *
 * **Ekwipunku w plecaku.** Widać to, co postać ma na sobie i w rękach — pancerz
 * założony (`equipped !== false`, ta sama reguła, którą stosuje etap 15), broń
 * dobytą (`cpredDrawnWeapons`) i chrom, którego rodzina jest widoczna z zewnątrz.
 * Reszta wychodzi przeszukaniem z etapu 38b, i to na leżącym ciele.
 *
 * **Ran.** Jadą publicznie w `TokenView.injuries` od 31.08 i okno czyta je stamtąd;
 * powtórzenie ich tutaj byłoby drugim domem dla jednego faktu.
 */

import type { CpredArmorRow, CpredCharacterData, CpredWeaponRow } from './character.js';
import { cpredDrawnWeapons } from './character.js';
import {
  CYBERWARE_BODY_SLOT_LABELS,
  CYBERWARE_TYPE_LABELS,
  type CyberwareType,
} from './cyberware.js';
import { ARMOR_LOCATION_LABELS, type ArmorLocation } from './locations.js';

/**
 * Rodziny chromu, które widać z zewnątrz — i to **rodzina** o tym rozstrzyga,
 * nie flaga przy każdym wpisie katalogu.
 *
 * Sześć rodzin jest widocznych z definicji: cyberkończyna jest kończyną, której
 * nie da się nie zauważyć, Cybermoda istnieje **po to**, żeby ją było widać,
 * a Borgizacje przebudowują sylwetkę. Dwie są pod skórą i mają takie zostać:
 * Cybersynapsy i Cyborgizacje wewnętrzne. Neuroprocesor nie jest widoczny.
 *
 * Wiersz bez rodziny (karty sprzed etapu 23a takie bywają) jest **niewidoczny**.
 * Przy wyborze między „pokaż, czego nie wiesz" a „przemilcz" przemilczenie jest
 * jedynym bezpiecznym domyślnym: to jest droga danych z karty MG do gracza.
 */
export const CPRED_VISIBLE_CYBERWARE_TYPES: readonly CyberwareType[] = [
  'fashionware',
  'cyberoptics',
  'cyberaudio',
  'external',
  'cyberlimb',
  'borgware',
];

export function cpredCyberwareShowsOutside(type: CyberwareType | undefined): boolean {
  return type !== undefined && CPRED_VISIBLE_CYBERWARE_TYPES.includes(type);
}

/** Jak rzut oka nazywa pancerz w danym miejscu — bez marki i bez liczb. */
const GLANCE_ARMOR_NAMES: Record<ArmorLocation, string> = {
  head: 'Ochrona głowy',
  body: 'Pancerz na korpusie',
  shield: 'Tarcza',
};

/** Czego rzut oka nie potrafi nazwać: broń bez wpisu katalogu. */
const GLANCE_WEAPON_UNKNOWN = 'Coś w rękach';

/** Co rzut oka mówi o gołej głowie — zdanie, po które przyszedł cały etap. */
export const CPRED_SIGHTING_BARE_HEAD = 'Głowa bez ochrony';

export interface CpredSightingArmor {
  location: ArmorLocation;
  locationLabel: string;
  /** „Ochrona głowy" przy rzucie oka, „Hełm bojowy" po zdanym Teście. */
  name: string;
  /** OB pełne i bieżące — wyłącznie w warstwie szczegółowej. */
  sp?: number;
  spCurrent?: number;
}

export interface CpredSightingWeapon {
  /** „Karabin szturmowy" przy rzucie oka, „Militech Ronin" po Teście. */
  name: string;
  /** Obrażenia, magazynek i zacięcie — wyłącznie w warstwie szczegółowej. */
  damage?: string;
  ammoCurrent?: number;
  ammoMax?: number;
  jammed?: boolean;
}

export interface CpredSightingChrome {
  /** Rodzina przy rzucie oka („Cyberkończyny"), nazwa wpisu po Teście. */
  name: string;
  /** „Prawa cyberręka" — gdy karta mówi, w którym miejscu ciała wszczep siedzi. */
  slotLabel?: string;
}

/** Co jedna figura widzi na drugiej. */
export interface CpredSighting {
  /** Czy to warstwa po zdanym Teście: klient rysuje z tego plakietkę. */
  detailed: boolean;
  /** Pancerz założony, w kolejności: głowa, korpus, tarcza. */
  armor: CpredSightingArmor[];
  /**
   * Broń w rękach — do dwóch, bo ręce są dwie. Pusta lista znaczy puste ręce
   * i **tak też się ją rysuje**: „ten ktoś nic nie trzyma" jest informacją,
   * a nie brakiem informacji.
   */
  weapons: CpredSightingWeapon[];
  /** Chrom, który widać z zewnątrz. */
  chrome: CpredSightingChrome[];
}

/**
 * Fakty o broni, których ten moduł sam nie zdobędzie — katalog należy do
 * wołającego (na serwerze) i to on je podaje.
 */
export interface CpredSightingWeaponFacts {
  /** `ResolvedWeapon.typeName`, np. „Karabin szturmowy". */
  typeName?: string;
}

/**
 * Katalog powiedziany temu modułowi — id wiersza broni → co o nim wie kompendium.
 *
 * Mapa, a nie jedna paczka faktów, bo w rękach mogą być dwie bronie naraz.
 */
export type CpredSightingWeaponFactsByRow = Readonly<Record<string, CpredSightingWeaponFacts>>;

export interface CpredSightingOptions {
  /** Warstwa szczegółowa: liczby, marki, nazwy wszczepów. */
  detailed?: boolean;
  /** Co katalog mówi o broniach, które figura trzyma; kluczem jest id wiersza. */
  weapons?: CpredSightingWeaponFactsByRow;
}

/** Kolejność, w jakiej czyta się sylwetkę: od góry i od tego, co najważniejsze. */
const ARMOR_ORDER: readonly ArmorLocation[] = ['head', 'body', 'shield'];

function armorSighting(row: CpredArmorRow, detailed: boolean): CpredSightingArmor {
  return {
    location: row.location,
    locationLabel: ARMOR_LOCATION_LABELS[row.location],
    name: detailed ? row.name : GLANCE_ARMOR_NAMES[row.location],
    ...(detailed ? { sp: row.sp, spCurrent: row.spCurrent } : {}),
  };
}

function weaponSighting(
  row: CpredWeaponRow,
  detailed: boolean,
  facts: CpredSightingWeaponFacts | undefined,
): CpredSightingWeapon {
  if (!detailed) {
    // Rzut oka nazywa **klasę**, nie egzemplarz: z drugiej strony ulicy widać
    // karabin, a nie to, że jest to Militech Ronin. Broń wpisana z ręki nie ma
    // typu w katalogu i nie ma z czego tej klasy wziąć — wtedy uczciwiej jest
    // powiedzieć „coś w rękach" niż podać nazwę, którą MG wpisał dla siebie.
    return { name: facts?.typeName ?? GLANCE_WEAPON_UNKNOWN };
  }
  return {
    name: row.name,
    damage: row.damage,
    ...(row.ammoMax > 0 ? { ammoCurrent: row.ammoCurrent, ammoMax: row.ammoMax } : {}),
    ...(row.jammed === true ? { jammed: true } : {}),
  };
}

/**
 * Co widać na tej karcie.
 *
 * Jedna funkcja na obie warstwy — patrz nagłówek pliku. Wołający rozstrzyga
 * **czy** wolno pokazać warstwę szczegółową; ten moduł jedynie wie, jak każda
 * z nich wygląda.
 */
export function cpredSighting(
  data: Pick<CpredCharacterData, 'weapons' | 'drawnWeaponRowIds' | 'armor' | 'cyberware'>,
  options: CpredSightingOptions = {},
): CpredSighting {
  const detailed = options.detailed === true;

  // Pancerz niezałożony nie chroni od etapu 15 i tak samo nie ma go być widać:
  // kurtka w plecaku nie jest niczym, co widać na kimś.
  const worn = data.armor.filter((row) => row.equipped !== false);
  const armor = ARMOR_ORDER.flatMap((location) =>
    worn.filter((row) => row.location === location).map((row) => armorSighting(row, detailed)),
  );

  const drawn = cpredDrawnWeapons(data);

  const chrome: CpredSightingChrome[] = [];
  const seen = new Set<string>();
  for (const row of data.cyberware) {
    if (!cpredCyberwareShowsOutside(row.type)) continue;
    const slotLabel = row.bodySlot ? CYBERWARE_BODY_SLOT_LABELS[row.bodySlot] : undefined;
    const name = detailed ? row.name : CYBERWARE_TYPE_LABELS[row.type as CyberwareType];
    // Rzut oka **skleja** rodziny: dwie linijki „Cyberkończyny" wyglądają jak
    // usterka, a nie jak dwie ręce. Warstwa szczegółowa nie skleja niczego —
    // tam każdy wszczep ma własną nazwę i własne miejsce na ciele.
    const key = detailed ? row.id : `${name}|${slotLabel ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chrome.push({ name, ...(slotLabel ? { slotLabel } : {}) });
  }

  return {
    detailed,
    armor,
    weapons: drawn.map((row) => weaponSighting(row, detailed, options.weapons?.[row.id])),
    chrome,
  };
}

/**
 * Czy ta figura ma cokolwiek na głowie — pytanie, od którego zaczął się etap.
 *
 * Osobna funkcja, bo pada w dwóch miejscach naraz (dymek celownika i okno
 * oględzin), a wołający nie mają po co znać kształtu listy pancerza.
 */
export function cpredHeadIsArmored(sighting: CpredSighting): boolean {
  return sighting.armor.some((row) => row.location === 'head');
}

/**
 * „Ochrona głowy · Karabin szturmowy" — rzut oka jednym wierszem, do dymka
 * pod celownikiem.
 *
 * Dwie rzeczy i tylko dwie, bo dymek jest paskiem przy kursorze w trakcie walki:
 * czy jest w co celować na głowie i co ten ktoś trzyma. Reszta czeka w oknie.
 */
export function cpredSightingLine(sighting: CpredSighting): string {
  const head = sighting.armor.find((row) => row.location === 'head');
  const headText = head
    ? sighting.detailed
      ? `${head.name} OB ${head.spCurrent}`
      : head.name
    : CPRED_SIGHTING_BARE_HEAD;
  const hands =
    sighting.weapons.length > 0
      ? sighting.weapons.map((row) => row.name).join(' + ')
      : 'Puste ręce';
  return `${headText} · ${hands}`;
}
