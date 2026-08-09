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
}

/**
 * Slot arithmetic per family, deliberately *not* per piece of hardware.
 *
 * The rulebook counts slots inside each individual cyberarm and each individual
 * eye, which at the table means asking „which eye?" on every install. Two eyes
 * give six slots and the question almost never changes the answer, so the sheet
 * pools them and leaves the placement to the prose. What it does catch is the
 * mistake worth catching: an option with nothing to plug into, and a family
 * filled past what its foundations can hold.
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
    return [
      {
        type,
        label: CYBERWARE_TYPE_LABELS[type],
        capacity: foundations.reduce((sum, row) => sum + (row.slots ?? 0), 0),
        used: options.reduce((sum, row) => sum + (row.slotCost ?? 1), 0),
        pool: false,
        missingFoundation: options.length > 0 && foundations.length === 0,
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
