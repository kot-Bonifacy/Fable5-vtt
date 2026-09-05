import { humanityMax } from './derived.js';
import type { CpredStats } from './stats.js';

/**
 * Cyberware and Humanity (stage 23a, s. 110–120 and 229–232).
 *
 * The whole module exists to break one loop cleanly. Humanity is EMP × 10, and
 * EMP is Humanity ÷ 10 — read naively that is circular. The rulebook is not:
 * the EMP *written on the sheet* is the base value a character was built with,
 * and the EMP *used in play* follows from the Humanity left after the chrome.
 * So `stats.emp` is a source and never a result — nothing here ever writes a
 * computed EMP back into the stats.
 *
 * The second rule with teeth is the ceiling: „Każda cyborgizacja obniża
 * maksymalne Człowieczeństwo o 2. Każda borgizacja obniża maksymalne
 * Człowieczeństwo o 4. Cyborgizacje powodujące zerową utratę Człowieczeństwa
 * przy montażu nie obniżają maksymalnego Człowieczeństwa" (s. 230). Therapy
 * gives points back; only pulling the hardware out gives the ceiling back.
 */

/** The eight families of the rulebook's cyberware tables (s. 110). */
export const CYBERWARE_TYPES = [
  'fashionware',
  'neuralware',
  'cyberoptics',
  'cyberaudio',
  'internal',
  'external',
  'cyberlimb',
  'borgware',
] as const;
export type CyberwareType = (typeof CYBERWARE_TYPES)[number];

export const CYBERWARE_TYPE_LABELS: Record<CyberwareType, string> = {
  fashionware: 'Cybermoda',
  neuralware: 'Cybersynapsy',
  cyberoptics: 'Cyberoptyka',
  cyberaudio: 'Cyberaudio',
  internal: 'Cyborgizacje wewnętrzne',
  external: 'Cyborgizacje zewnętrzne',
  cyberlimb: 'Cyberkończyny',
  borgware: 'Borgizacje',
};

export function isCyberwareType(value: unknown): value is CyberwareType {
  return typeof value === 'string' && (CYBERWARE_TYPES as readonly string[]).includes(value);
}

/**
 * „Montaż" — where the thing gets fitted (s. 110). `none` is the table's „Nd.":
 * a chip you push into a socket, which needs no surgeon at all.
 */
export const CYBERWARE_INSTALLS = ['gallery', 'clinic', 'hospital', 'none'] as const;
export type CyberwareInstall = (typeof CYBERWARE_INSTALLS)[number];

export const CYBERWARE_INSTALL_LABELS: Record<CyberwareInstall, string> = {
  gallery: 'Galeria',
  clinic: 'Klinika',
  hospital: 'Szpital',
  none: 'Bez operacji',
};

/** „Typowe PT operacji" (s. 226) — what a Medtech rolls against to fit it. */
export const CYBERWARE_INSTALL_DV: Record<CyberwareInstall, number | null> = {
  gallery: 13,
  clinic: 15,
  hospital: 17,
  none: null,
};

/**
 * „Cena montażu w szpitalu" (s. 226). Unused until stage 23b — the price is
 * shown, never charged — but it belongs next to the DV it comes from.
 */
export const CYBERWARE_INSTALL_COST: Record<CyberwareInstall, number> = {
  gallery: 100,
  clinic: 500,
  hospital: 1000,
  none: 0,
};

export function isCyberwareInstall(value: unknown): value is CyberwareInstall {
  return typeof value === 'string' && (CYBERWARE_INSTALLS as readonly string[]).includes(value);
}

/** „Każdy punkt Empatii przekłada się na 10 punktów Człowieczeństwa" (s. 229). */
export const HUMANITY_PER_EMP = 10;

/** Ceiling lost per installed piece (s. 230); borgware costs twice as much. */
export const HUMANITY_MAX_PENALTY_CYBERWARE = 2;
export const HUMANITY_MAX_PENALTY_BORGWARE = 4;

/**
 * Floor on Humanity. Below zero is a legal state — „Ostra cyberpsychoza. MG
 * przejmuje kontrolę nad Postacią" (s. 232) — so the sheet may not clamp at 0
 * the way every other pool does; it only refuses absurd numbers.
 */
export const HUMANITY_MIN = -99;

/** Ceiling on slots one piece may provide or take; guards imported data. */
export const CYBERWARE_SLOTS_MAX = 10;

/** Slots a family with no foundation allows: „tylko 7 cyborgizacji" (s. 111). */
export const CYBERWARE_POOL_LIMIT = 7;

/** Families installed without a base piece, capped by count rather than slots. */
export const CYBERWARE_POOL_TYPES: readonly CyberwareType[] = [
  'fashionware',
  'internal',
  'external',
];

/**
 * Rodziny, w których opcja bez cyborgizacji podstawowej nie ma się czego trzymać
 * (s. 111): „Większość typów cyborgizacji wymaga zainstalowania podstawowej
 * modyfikacji … Ta podstawowa cyborgizacja oferuje pewną liczbę gniazd".
 *
 * **Większość, nie wszystkie** — i to jest cała treść tej stałej. Trzy rodziny
 * podręcznik zwalnia wprost („Cybermoda oraz cyborgizacje wewnętrzne
 * i zewnętrzne nie wymagają modyfikacji podstawowych") i one są wyżej;
 * czwartą, **Borgizacje**, zwalnia milczeniem: tabela borgizacji nie ma ani
 * nagłówka z gniazdami, ani żadnej podstawy, bo ramownica **jest** podstawą
 * samą w sobie. Do 04.09.2026 liczyło się je jak cyberoko i karta pisała nad
 * Ramownicą „brak cyborgizacji podstawowej", której nie da się kupić.
 */
export const CYBERWARE_FOUNDATION_TYPES: readonly CyberwareType[] = [
  'neuralware',
  'cyberoptics',
  'cyberaudio',
  'cyberlimb',
];

/**
 * The cyberware half of a sheet row, as the rules see it.
 *
 * Structural rather than the concrete row type, so this module never imports
 * `character.ts` — the dependency runs the other way, and a cycle between the
 * sheet and its rules would be paid for at every future stage.
 */
export interface CyberwareInstallation {
  type?: CyberwareType;
  /** Ceiling this piece costs while it is in the body (2, 4 or 0). */
  humanityMaxPenalty?: number;
  /** Base piece that provides slots (a cyberarm), rather than an option. */
  foundation?: boolean;
  /** Slots provided (foundation) — meaningless on an option. */
  slots?: number;
  /** Slots taken (option); absent means the table's default of one. */
  slotCost?: number;
  /**
   * Which box on the silhouette this piece sits in (stage 27c) — „która ręka?".
   * Absent on a row nobody has placed yet, and on the families that have no box.
   */
  bodySlot?: CyberwareBodySlot;
}

/** What a piece of cyberware costs in Humanity, as printed in the tables. */
export interface CyberwareHumanityLoss {
  /** Dice notation rolled in play („2k6"); absent when the loss is flat. */
  humanityLoss?: string;
  /** Value printed before the parens — used at character creation (s. 111). */
  humanityLossFixed?: number;
  /** „1k6/2, zaokrąglij w górę" — half the dice, rounded up. */
  humanityLossHalved?: boolean;
}

/**
 * Ceiling penalty a piece carries. Read off the catalogue entry once, at
 * install time, and copied onto the sheet row — editing the table later must
 * not silently rewrite hardware that is already in somebody's body.
 */
export function cyberwareHumanityMaxPenalty(
  entry: CyberwareHumanityLoss & { type?: CyberwareType },
): number {
  const costsHumanity =
    (entry.humanityLoss !== undefined && entry.humanityLoss !== '') ||
    (entry.humanityLossFixed ?? 0) > 0;
  if (!costsHumanity) return 0;
  return entry.type === 'borgware' ? HUMANITY_MAX_PENALTY_BORGWARE : HUMANITY_MAX_PENALTY_CYBERWARE;
}

/**
 * The catalogue fields a sheet row copies when the hardware goes in.
 *
 * A copy rather than a lookup, for the reason every row on this sheet keeps its
 * own numbers (stages 14c, 15, 16g): the GM may retune the catalogue tomorrow,
 * and the chrome already in somebody's chest must not silently change what it
 * costs them.
 */
export function cyberwareInstallationFrom(
  entry: CyberwareHumanityLoss &
    Pick<CyberwareInstallation, 'type' | 'foundation' | 'slots' | 'slotCost'>,
): CyberwareInstallation {
  const penalty = cyberwareHumanityMaxPenalty(entry);
  return {
    ...(entry.type ? { type: entry.type } : {}),
    ...(penalty > 0 ? { humanityMaxPenalty: penalty } : {}),
    ...(entry.foundation ? { foundation: true as const, slots: entry.slots ?? 0 } : {}),
    ...(!entry.foundation && entry.slotCost !== undefined ? { slotCost: entry.slotCost } : {}),
  };
}

/**
 * Humanity this character can hold: EMP × 10 minus what the chrome permanently
 * costs. Never negative — a body stuffed past its own Empathy simply has no
 * room left, and the current value is clamped to this by the sheet.
 */
export function humanityMaxWith(
  stats: Pick<CpredStats, 'emp'>,
  cyberware: readonly CyberwareInstallation[],
): number {
  const penalty = cyberware.reduce((sum, row) => sum + (row.humanityMaxPenalty ?? 0), 0);
  return Math.max(0, humanityMax(stats) - penalty);
}

/**
 * EMP as it is used in play: „Zawsze, gdy tracisz tyle Człowieczeństwa, że
 * zmienia się cyfra symbolizująca dziesiątki … twoja Empatia także się
 * odpowiednio obniża" (s. 229). Rounded down, and never below zero — a
 * cyberpsycho rolls EMP checks on the bare die.
 */
export function empFromHumanity(humanityCurrent: number): number {
  return Math.max(0, Math.floor(humanityCurrent / HUMANITY_PER_EMP));
}

/**
 * The stats a Check actually uses. Only EMP ever differs, which is why this
 * returns the same object when nothing changed: the roll planner compares by
 * value, and an allocation per breakdown entry would be pure waste.
 */
export function effectiveCpredStats(stats: CpredStats, humanityCurrent: number): CpredStats {
  const emp = empFromHumanity(humanityCurrent);
  return emp === stats.emp ? stats : { ...stats, emp };
}

/** How far along the ladder of s. 232 this character is. */
export const CYBERPSYCHOSIS_LEVELS = [
  'none',
  'edge',
  'dissociative',
  'cyberpsychosis',
  'severe',
] as const;
export type CyberpsychosisLevel = (typeof CYBERPSYCHOSIS_LEVELS)[number];

export interface CyberpsychosisState {
  level: CyberpsychosisLevel;
  /** EMP the thresholds were read from — the current one, not the base. */
  emp: number;
  /** Short Polish name, for a chip on the sheet. */
  label: string;
  /** What the rulebook asks of the table at this rung. */
  note: string;
}

/**
 * „ZASADY CYBERPSYCHOZY" (s. 232), keyed on the *current* EMP. The bottom rung
 * needs Humanity as well, because EMP 0 with points left is a cyberpsycho the
 * player still plays, and EMP 0 below zero is one the GM takes over.
 */
export function cyberpsychosisFor(humanityCurrent: number): CyberpsychosisState {
  const emp = empFromHumanity(humanityCurrent);
  if (emp >= 3) {
    return { level: 'none', emp, label: 'Bez zaburzeń', note: 'Brak cyberpsychozy.' };
  }
  if (emp === 2) {
    return {
      level: 'edge',
      emp,
      label: 'Na granicy',
      note: 'Na granicy zaburzenia dysocjacyjnego — odegraj to.',
    };
  }
  if (emp === 1) {
    return {
      level: 'dissociative',
      emp,
      label: 'Dysocjacja',
      note: 'Zaburzenie dysocjacyjne, na granicy cyberpsychozy: co najmniej 3 symptomy z listy Hare’a.',
    };
  }
  if (humanityCurrent < 0) {
    return {
      level: 'severe',
      emp,
      label: 'Ostra cyberpsychoza',
      note: 'Człowieczeństwo poniżej zera — MG przejmuje kontrolę nad Postacią, dopóki nie wróci powyżej zera.',
    };
  }
  return {
    level: 'cyberpsychosis',
    emp,
    label: 'Cyberpsychoza',
    note: 'Cyberpsychoza: co najmniej 5 symptomów z listy Hare’a.',
  };
}

// ───────────────────────── sylwetka ze strony trzeciej ─────────────────────────

/**
 * The boxes drawn around the body on page three of the printed sheet (stage
 * 27c). Eight of them, exactly as the sheet prints: one Neural Link, one
 * Cyberaudio, and a right/left pair for eyes, arms and legs.
 *
 * A *place on the body*, which is a different question from the *family* the
 * catalogue puts a piece in. Cyberoptics tells you a thing goes in an eye;
 * only this says which one — and `cyberlimb` covers arms and legs alike, so
 * the family cannot answer even that much on its own.
 */
export const CYBERWARE_BODY_SLOTS = [
  'neural',
  'cyberaudio',
  'eyeRight',
  'eyeLeft',
  'armRight',
  'armLeft',
  'legRight',
  'legLeft',
] as const;
export type CyberwareBodySlot = (typeof CYBERWARE_BODY_SLOTS)[number];

export const CYBERWARE_BODY_SLOT_LABELS: Record<CyberwareBodySlot, string> = {
  neural: 'Sprzęg neuralny',
  cyberaudio: 'Cyberaudio',
  eyeRight: 'Prawe cyberoko',
  eyeLeft: 'Lewe cyberoko',
  armRight: 'Prawa cyberręka',
  armLeft: 'Lewa cyberręka',
  legRight: 'Prawa cybernoga',
  legLeft: 'Lewa cybernoga',
};

/** Which family belongs in which box. */
export const CYBERWARE_BODY_SLOT_TYPES: Record<CyberwareBodySlot, CyberwareType> = {
  neural: 'neuralware',
  cyberaudio: 'cyberaudio',
  eyeRight: 'cyberoptics',
  eyeLeft: 'cyberoptics',
  armRight: 'cyberlimb',
  armLeft: 'cyberlimb',
  legRight: 'cyberlimb',
  legLeft: 'cyberlimb',
};

export function isCyberwareBodySlot(value: unknown): value is CyberwareBodySlot {
  return typeof value === 'string' && (CYBERWARE_BODY_SLOTS as readonly string[]).includes(value);
}

/**
 * Boxes a family may be dropped into — what the sheet offers as a choice.
 * Empty for the four families that have no box at all and print as side lists.
 */
export function bodySlotsForType(type: CyberwareType): CyberwareBodySlot[] {
  return CYBERWARE_BODY_SLOTS.filter((slot) => CYBERWARE_BODY_SLOT_TYPES[slot] === type);
}

/**
 * Where a piece goes when nobody has said. Only the two families with exactly
 * one box get one: an eye and a limb are a genuine question („które oko?", the
 * one stage 23a deliberately left to the prose), and answering it by guessing
 * would put chrome in a leg the character does not have.
 */
export function defaultBodySlot(type: CyberwareType | undefined): CyberwareBodySlot | null {
  if (!type) return null;
  const slots = bodySlotsForType(type);
  return slots.length === 1 ? slots[0]! : null;
}

/** A row as the silhouette needs to see it: its family and its declared box. */
export interface CyberwarePlacement {
  type?: CyberwareType;
  bodySlot?: CyberwareBodySlot;
}

/** The two boxes on the silhouette that are an arm. */
const CYBERARM_BODY_SLOTS: readonly CyberwareBodySlot[] = ['armRight', 'armLeft'];

/**
 * Does this body carry a cyberarm? The Brawling table asks: „BC 4 lub mniej
 * z cyberręką — 2k6" (s. 176), which is the one place the rules let hardware
 * move a character up a damage rung.
 *
 * Two conditions, both needed. `foundation` separates the arm itself from the
 * options screwed into it — a Big Knucks in a cyberarm shares its box and is
 * not an arm. `bodySlot` separates an arm from a leg, because both are
 * `cyberlimb` and only the placement on the silhouette (stage 27c) says which.
 * A foundation limb nobody has placed therefore grants nothing: the sheet
 * genuinely does not know whether it is an arm, and guessing would hand out
 * a damage rung on a leg.
 */
export function hasCyberarm(rows: readonly (CyberwarePlacement & { foundation?: boolean })[]) {
  return rows.some(
    (row) =>
      row.foundation === true &&
      row.bodySlot !== undefined &&
      CYBERARM_BODY_SLOTS.includes(row.bodySlot),
  );
}

/**
 * The four columns beside the silhouette on page three, in the sheet's order.
 * Everything that is not fitted to a named place on the body prints here.
 */
export const CYBERWARE_BODY_LISTS = [
  'internal',
  'external',
  'fashionware',
  'borgware',
] as const satisfies readonly CyberwareType[];
export type CyberwareBodyList = (typeof CYBERWARE_BODY_LISTS)[number];

export interface CyberwareBodyMap<T> {
  /** Rows fitted to each box; a box with none prints empty, as on paper. */
  slots: Record<CyberwareBodySlot, T[]>;
  /** The four side columns. */
  lists: Record<CyberwareBodyList, T[]>;
  /**
   * Eyes and limbs nobody has placed yet. They are *not* silently dropped into
   * a box — the sheet asks, because the answer is the player's.
   */
  unplaced: T[];
}

/**
 * Sorts a character's chrome onto page three.
 *
 * Family decides the destination, and a row with no family at all lands in
 * „Cyborgizacje wewnętrzne": that is where the sheet's own catch-all sits, and
 * rows written before stage 23a have no family to read.
 */
export function cyberwareBodyMap<T extends CyberwarePlacement>(
  rows: readonly T[],
): CyberwareBodyMap<T> {
  const slots = Object.fromEntries(CYBERWARE_BODY_SLOTS.map((slot) => [slot, [] as T[]])) as Record<
    CyberwareBodySlot,
    T[]
  >;
  const lists = Object.fromEntries(CYBERWARE_BODY_LISTS.map((list) => [list, [] as T[]])) as Record<
    CyberwareBodyList,
    T[]
  >;
  const unplaced: T[] = [];

  for (const row of rows) {
    const type = row.type;
    if (type && (CYBERWARE_BODY_LISTS as readonly CyberwareType[]).includes(type)) {
      lists[type as CyberwareBodyList].push(row);
      continue;
    }
    if (!type) {
      lists.internal.push(row);
      continue;
    }
    // A declared box wins, but only when it belongs to this family — a row that
    // changed family in the catalogue must not stay in a leg.
    const declared =
      row.bodySlot && CYBERWARE_BODY_SLOT_TYPES[row.bodySlot] === type ? row.bodySlot : null;
    const slot = declared ?? defaultBodySlot(type);
    if (slot) slots[slot].push(row);
    else unplaced.push(row);
  }

  return { slots, lists, unplaced };
}

/** Room left in one family of cyberware — what the sheet prints as „3 / 4". */
export interface CyberwareCapacity {
  type: CyberwareType;
  label: string;
  /** Slots the foundations give, or the 7-piece pool limit. */
  capacity: number;
  used: number;
  /** True for the families the rulebook caps by piece count, not by slot. */
  pool: boolean;
  /** Options installed with no base piece to sit in („brak cyberoka"). */
  missingFoundation: boolean;
  /**
   * The same arithmetic done again per box on the silhouette (stage 27c), for
   * the families that have boxes — so „Cyberkończyny 2 / 8" can finally say
   * *which* limb the two are in.
   *
   * Absent for the families with no box at all (Cybermoda, Borgizacje…).
   * Present but possibly all-zero for the others: an empty right arm is a real
   * answer and the sheet prints it, exactly as page three prints empty boxes.
   */
  places?: CyberwarePlaceCapacity[];
  /**
   * Eyes and limbs nobody has assigned a box to. They still count in the family
   * total above — they are in the body — but no box can account for them, so a
   * per-limb sum that ignored them would quietly disagree with the family row.
   */
  unplaced?: number;
}

/** Slot arithmetic inside one box on the silhouette („prawa cyberręka"). */
export interface CyberwarePlaceCapacity {
  slot: CyberwareBodySlot;
  label: string;
  capacity: number;
  used: number;
  /** An option in this box with no base piece in the same box. */
  missingFoundation: boolean;
}

/**
 * Slot arithmetic, per family **and** — since 22.08 — per box on the silhouette.
 *
 * Stage 23a counted per family only, because asking „which eye?" on every
 * install was friction the table did not want, and two eyes giving six slots
 * made the question rarely matter. Stage 27c then made the sheet ask anyway
 * (the silhouette has boxes), so the answer was already in the data and only
 * the arithmetic still ignored it: „Cyberkończyny 2 / 8" would not say whether
 * both options sat in the same arm.
 *
 * The family row stays the headline — it is what the rulebook's Humanity ledger
 * is written against, and it is the number that must not silently change. The
 * per-box breakdown rides alongside in `places`, with everything nobody has
 * placed counted once in `unplaced`, so the two views always add up.
 */
export function cyberwareCapacity(rows: readonly CyberwareInstallation[]): CyberwareCapacity[] {
  return CYBERWARE_TYPES.flatMap<CyberwareCapacity>((type) => {
    const family = rows.filter((row) => row.type === type);
    if (family.length === 0) return [];
    const pool = CYBERWARE_POOL_TYPES.includes(type);
    if (pool) {
      return [
        {
          type,
          label: CYBERWARE_TYPE_LABELS[type],
          capacity: CYBERWARE_POOL_LIMIT,
          used: family.length,
          pool: true,
          missingFoundation: false,
        },
      ];
    }
    const foundations = family.filter((row) => row.foundation === true);
    const options = family.filter((row) => row.foundation !== true);
    // Tylko rodziny z WIĘCEJ niż jednym pudełkiem — „które oko?" i „która ręka?".
    // Cybersynapsy i Cyberaudio mają po jednym, więc rozbicie powtarzałoby tam
    // wiersz rodziny co do liczby i byłoby samym szumem.
    const boxes = bodySlotsForType(type);
    const perBox = boxes.length > 1;
    const placed = (row: CyberwareInstallation) =>
      row.bodySlot && CYBERWARE_BODY_SLOT_TYPES[row.bodySlot] === type
        ? row.bodySlot
        : defaultBodySlot(type);
    return [
      {
        type,
        label: CYBERWARE_TYPE_LABELS[type],
        capacity: foundations.reduce((sum, row) => sum + (row.slots ?? 0), 0),
        used: options.reduce((sum, row) => sum + (row.slotCost ?? 1), 0),
        pool: false,
        missingFoundation:
          CYBERWARE_FOUNDATION_TYPES.includes(type) &&
          options.length > 0 &&
          foundations.length === 0,
        ...(perBox
          ? {
              places: boxes.map((slot) => {
                const here = family.filter((row) => placed(row) === slot);
                const base = here.filter((row) => row.foundation === true);
                const opts = here.filter((row) => row.foundation !== true);
                return {
                  slot,
                  label: CYBERWARE_BODY_SLOT_LABELS[slot],
                  capacity: base.reduce((sum, row) => sum + (row.slots ?? 0), 0),
                  used: opts.reduce((sum, row) => sum + (row.slotCost ?? 1), 0),
                  missingFoundation: opts.length > 0 && base.length === 0,
                };
              }),
              unplaced: family.filter((row) => placed(row) === null).length,
            }
          : {}),
      },
    ];
  });
}

/**
 * The Humanity a freshly installed piece costs. `rolled` is the sum of the
 * notation's dice; a flat entry passes its own number. Halving happens here so
 * the „zaokrąglij w górę" of the tables lives in exactly one place.
 */
export function resolveHumanityLoss(rolled: number, halved: boolean): number {
  const loss = halved ? Math.ceil(rolled / 2) : rolled;
  return Math.max(0, loss);
}

/** The two therapies of s. 230 — a week of work each, rolled by a Medtech. */
export const HUMANITY_THERAPIES = ['ordinary', 'extreme'] as const;
export type HumanityTherapy = (typeof HUMANITY_THERAPIES)[number];

export interface HumanityTherapyDefinition {
  label: string;
  /** What the patient gets back. */
  notation: string;
  /** Medical Tech DV the week is judged by (the GM rolls it, or waives it). */
  dv: number;
  /** Price of the therapy itself, in eddies (charged from stage 23b). */
  cost: number;
}

export const HUMANITY_THERAPY_DEFINITIONS: Record<HumanityTherapy, HumanityTherapyDefinition> = {
  ordinary: { label: 'Zwykła utrata Człowieczeństwa', notation: '2k6', dv: 15, cost: 500 },
  extreme: { label: 'Ekstremalna utrata Człowieczeństwa', notation: '4k6', dv: 17, cost: 1000 },
};

export function isHumanityTherapy(value: unknown): value is HumanityTherapy {
  return typeof value === 'string' && (HUMANITY_THERAPIES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Czy jest gdzie to wszczepić, i kto trzyma skalpel (s. 111, s. 226)
 * ------------------------------------------------------------------ */

/**
 * Powody, dla których operacja się nie odbędzie — wszystkie ze strony 111.
 *
 * Do 04.09.2026 były wyłącznie ostrzeżeniem: `cyberwareCapacity` liczyło
 * `missingFoundation` i zajęte gniazda, karta rysowała czerwony chip, a montaż
 * i tak wchodził. Trzy kody, bo podręcznik stawia trzy różne warunki: opcja
 * potrzebuje podstawy, podstawa ma skończoną liczbę gniazd, a rodziny bez
 * podstawy mają limit sztuk („tylko 7 cyborgizacji").
 */
export const CYBERWARE_INSTALL_REFUSALS = ['MISSING_FOUNDATION', 'NO_SLOTS', 'POOL_FULL'] as const;
export type CyberwareInstallRefusal = (typeof CYBERWARE_INSTALL_REFUSALS)[number];

export const CYBERWARE_INSTALL_REFUSAL_MESSAGES: Record<CyberwareInstallRefusal, string> = {
  MISSING_FOUNDATION:
    'Nie ma w co tego wszczepić — ta rodzina wymaga najpierw cyborgizacji podstawowej (s. 111).',
  NO_SLOTS: 'Brak wolnych gniazd modyfikacji w tej rodzinie (s. 111).',
  POOL_FULL: `Ciało mieści tylko ${CYBERWARE_POOL_LIMIT} cyborgizacji tej rodziny (s. 111).`,
};

/**
 * Czy to ciało przyjmie jeszcze tę cyborgizację?
 *
 * Ta sama arytmetyka, którą `cyberwareCapacity` rysuje na karcie — celowo
 * liczona **na rodzinie, nie na pudełku sylwetki**: pudełko („które oko?")
 * wybiera się dopiero na karcie, po montażu, więc pytanie o wolne gniazdo
 * w prawej ręce w chwili instalacji nie ma jeszcze odpowiedzi.
 *
 * Wpis bez rodziny nie jest odmawiany. Wiersze sprzed etapu 23a rodziny nie
 * mają, a odmowa oparta na brakującym polu blokowałaby import podręcznika
 * zamiast pilnować zasady.
 */
export function cyberwareInstallRefusal(
  rows: readonly CyberwareInstallation[],
  entry: Pick<CyberwareInstallation, 'type' | 'foundation' | 'slots' | 'slotCost'>,
): CyberwareInstallRefusal | null {
  const type = entry.type;
  if (!type) return null;
  const family = rows.filter((row) => row.type === type);
  if (CYBERWARE_POOL_TYPES.includes(type)) {
    return family.length >= CYBERWARE_POOL_LIMIT ? 'POOL_FULL' : null;
  }
  // Borgizacja jest podstawą sama dla siebie: nie ma czego zajmować ani czym
  // się podeprzeć, więc jedyne, co ją ogranicza, to Człowieczeństwo i cena.
  if (!CYBERWARE_FOUNDATION_TYPES.includes(type)) return null;
  // Podstawa wchodzi zawsze: to ona dopiero tworzy gniazda, więc nie ma ich
  // sobie czym zająć. Druga cyberręka jest legalna i musi być — sylwetka ma
  // dwa pudełka.
  if (entry.foundation) return null;
  const foundations = family.filter((row) => row.foundation === true);
  if (foundations.length === 0) return 'MISSING_FOUNDATION';
  const capacity = foundations.reduce((sum, row) => sum + (row.slots ?? 0), 0);
  const used = family
    .filter((row) => row.foundation !== true)
    .reduce((sum, row) => sum + (row.slotCost ?? 1), 0);
  return used + (entry.slotCost ?? 1) > capacity ? 'NO_SLOTS' : null;
}

/**
 * „Nie możesz sam sobie wszczepić cyborgizacji, chyba że jest to cyborgizacja
 * dostępna w galerii" (s. 226) — jedyne miejsce, w którym miejsce montażu
 * decyduje o czymś innym niż PT i cena.
 */
export const CYBERWARE_SELF_INSTALL: CyberwareInstall = 'gallery';

export function cyberwareAllowsSelfInstall(install: CyberwareInstall | undefined): boolean {
  return install === undefined || install === 'none' || install === CYBERWARE_SELF_INSTALL;
}

/**
 * Sufit liczby, którą MG wpisuje za ripperdoca. Najlepszy chirurg podręcznika
 * ma TECHNIKĘ 8 i Chirurgię 10, więc osiemnaście jest granicą tego, co da się
 * uzasadnić kartą; dwadzieścia zostawia MG margines na modyfikatory sceny.
 */
export const CYBERWARE_SURGEON_SKILL_MAX = 20;

/**
 * Ripperdoc z ulicy, jakiego okno montażu proponuje z góry: TECHNIKA 6 +
 * Chirurgia 6. Klinikę (PT 15) trafia w siedmiu przypadkach na dziesięć —
 * dość pewnie, żeby MG nie musiał tej liczby ruszać przy każdym wszczepie,
 * i nie tak pewnie, żeby Test był formalnością.
 */
export const CYBERWARE_SURGEON_SKILL_DEFAULT = 12;
