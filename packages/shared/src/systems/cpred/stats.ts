/** The ten CP RED stats. Ids are English (code convention), labels are Polish. */
export const CPRED_STAT_IDS = [
  'int',
  'ref',
  'dex',
  'tech',
  'cool',
  'will',
  'luck',
  'move',
  'body',
  'emp',
] as const;

export type CpredStatId = (typeof CPRED_STAT_IDS)[number];

export interface CpredStatLabel {
  /** Polish abbreviation as printed on the official sheet. */
  abbr: string;
  /** Full Polish name. */
  name: string;
}

/** Polish labels of the Black Monk edition (ZW = DEX, CHA = COOL, SW = WILL…). */
export const CPRED_STAT_LABELS: Record<CpredStatId, CpredStatLabel> = {
  int: { abbr: 'INT', name: 'Inteligencja' },
  ref: { abbr: 'REF', name: 'Refleks' },
  dex: { abbr: 'ZW', name: 'Zwinność' },
  tech: { abbr: 'TECH', name: 'Technika' },
  cool: { abbr: 'CHA', name: 'Charakter' },
  will: { abbr: 'SW', name: 'Siła Woli' },
  luck: { abbr: 'SZ', name: 'Szczęście' },
  move: { abbr: 'RUCH', name: 'Ruch' },
  body: { abbr: 'BC', name: 'Budowa Ciała' },
  emp: { abbr: 'EMP', name: 'Empatia' },
};

export const CPRED_STAT_MIN = 1;
export const CPRED_STAT_MAX = 10;

export type CpredStats = Record<CpredStatId, number>;

export function isCpredStatId(value: unknown): value is CpredStatId {
  return typeof value === 'string' && (CPRED_STAT_IDS as readonly string[]).includes(value);
}
