import type { CompendiumEntry, CostCategory } from './compendium.js';
import { COST_CATEGORY_LABELS } from './compendium.js';

/**
 * The eddie half of a character sheet (stage 23b).
 *
 * Two rules of the Polish edition shape everything here. The first is that
 * prices come in **bands**: „550 ed (Drogie)" is one number and one rung of a
 * ladder, and plenty of rulebook rows carry only the rung. A shop that could
 * not sell those would be a shop missing half its stock, so the band always
 * resolves to the price the ladder prints for it (s. 342).
 *
 * The second is that Lifestyle and Accommodation are paid **at the start of the
 * month, together** — „Na początku każdego miesiąca musisz opłacić koszty
 * Zakwaterowania i Poziomu życia" (s. 376). They are two tables and one bill,
 * which is why `monthlyCostOf` returns a total and never one of them alone.
 */

/**
 * The price ladder behind the bands (s. 342). The comment on
 * `COST_CATEGORY_LABELS` names these numbers; here they are the numbers, so
 * that an entry priced only by its band can still be bought.
 */
export const COST_CATEGORY_PRICE: Record<CostCategory, number> = {
  cheap: 10,
  everyday: 20,
  costly: 50,
  premium: 100,
  expensive: 500,
  veryExpensive: 1000,
  luxury: 5000,
  superLuxury: 10_000,
};

/**
 * What one copy of a catalogue entry costs, or null when the entry says
 * nothing about money at all. The printed number wins over the band — the
 * tables list both, and a weapon marked „550 ed (Drogie)" costs 550, not 50.
 */
export function entryPrice(entry: Pick<CompendiumEntry, 'cost' | 'costCategory'>): number | null {
  if (entry.cost !== null && entry.cost !== undefined) return entry.cost;
  if (entry.costCategory) return COST_CATEGORY_PRICE[entry.costCategory];
  return null;
}

/** „550 ed" or „50 ed (cena pasma Drogie)" — what the Buy button says. */
export function formatPurchasePrice(
  entry: Pick<CompendiumEntry, 'cost' | 'costCategory'>,
): string | null {
  const price = entryPrice(entry);
  if (price === null) return null;
  if (entry.cost === null && entry.costCategory) {
    return `${price} ed (cena pasma ${COST_CATEGORY_LABELS[entry.costCategory]})`;
  }
  return `${price} ed`;
}

/* ------------------------------------------------------------------ *
 * Lifestyle and Accommodation (s. 376–377)
 * ------------------------------------------------------------------ */

export const LIFESTYLE_LEVELS = ['kibble', 'prepack', 'goodPrepack', 'freshFood'] as const;
export type LifestyleLevel = (typeof LIFESTYLE_LEVELS)[number];

export interface LifestyleDefinition {
  label: string;
  /** Eddies per month, as printed in the „Poziom życia" table. */
  monthly: number;
  /** The one line of the table worth reading at the sheet. */
  note: string;
}

export const LIFESTYLE_DEFINITIONS: Record<LifestyleLevel, LifestyleDefinition> = {
  kibble: {
    label: 'Na karmie',
    monthly: 100,
    note: 'Obrzydliwe żarcie; raz na miesiąc film albo braindance.',
  },
  prepack: {
    label: 'Prepak',
    monthly: 300,
    note: 'Jedzenie lepsze od karmy; w weekend dobry bar albo dobra restauracja.',
  },
  goodPrepack: {
    label: 'Dobry prepak',
    monthly: 600,
    note: 'Znakomite bary i restauracje; raz na miesiąc koncert lub wydarzenie sportowe.',
  },
  freshFood: {
    label: 'Świeże jedzenie',
    monthly: 1500,
    note: 'Prawdziwe jedzenie, bary dla wyższych sfer, raz w miesiącu restauracja światowej klasy.',
  },
};

export function isLifestyleLevel(value: unknown): value is LifestyleLevel {
  return typeof value === 'string' && (LIFESTYLE_LEVELS as readonly string[]).includes(value);
}

export const HOUSING_OPTIONS = [
  'street',
  'streetVehicle',
  'capsule',
  'container',
  'studio',
  'smallFlat',
  'corpoConapt',
  'wealthyConapt',
  'penthouse',
  'corpoHouse',
  'corpoMansion',
] as const;
export type HousingOption = (typeof HOUSING_OPTIONS)[number];

export interface HousingDefinition {
  label: string;
  /**
   * Rent per month; 0 for the two ways of sleeping rough, and 0 for the corpo
   * housing the table calls „Podarunek od twojej Korporacji" — free to live in,
   * and the price of it is a job, not eddies.
   */
  rent: number;
  /** Sticker price when bought outright; null when the row has no „Nd." price. */
  purchase: number | null;
  /** Shown as a hint under the picker. */
  note?: string;
}

export const HOUSING_DEFINITIONS: Record<HousingOption, HousingDefinition> = {
  street: {
    label: 'Życie na Ulicy',
    rent: 0,
    purchase: null,
    note: 'Każda noc to Test Wytrwałości PT 15 — porażka daje zmęczenie i −2 do wszystkich Testów.',
  },
  streetVehicle: {
    label: 'Życie na Ulicy w pojeździe',
    rent: 0,
    purchase: null,
    note: 'Zabudowany pojazd z łóżkiem daje wypoczynek; bez tego Test Wytrwałości PT 15 co noc.',
  },
  capsule: { label: 'Hotel kapsułowy', rent: 500, purchase: null },
  container: { label: 'Kontener', rent: 1000, purchase: 15_000 },
  studio: { label: 'Kawalerka', rent: 1500, purchase: 25_000 },
  smallFlat: { label: 'Małe mieszkanie', rent: 2500, purchase: 35_000 },
  corpoConapt: {
    label: 'Korporacyjny konap',
    rent: 0,
    purchase: null,
    note: 'Podarunek od twojej Korporacji — czynszu nie płacisz.',
  },
  wealthyConapt: { label: 'Konap dla zamożnych', rent: 7500, purchase: 85_000 },
  penthouse: {
    label: 'Luksusowy apartament na szczycie wieżowca',
    rent: 15_000,
    purchase: 150_000,
  },
  corpoHouse: {
    label: 'Korporacyjny dom w Bobrowisku',
    rent: 0,
    purchase: 200_000,
    note: 'Podarunek od twojej Korporacji — czynszu nie płacisz.',
  },
  corpoMansion: {
    label: 'Korporacyjna McPosiadłość w Bobrowisku',
    rent: 0,
    purchase: 500_000,
    note: 'Podarunek od twojej Korporacji — czynszu nie płacisz.',
  },
};

export function isHousingOption(value: unknown): value is HousingOption {
  return typeof value === 'string' && (HOUSING_OPTIONS as readonly string[]).includes(value);
}

/**
 * What a character pays on the first of the month.
 *
 * Absent on a sheet means „ta postać nie prowadzi rachunków" and the monthly
 * settlement skips it — most NPCs and every mannequin on a test scene never
 * want a rent line, and a default of „Na karmie" would quietly bill them.
 */
export interface CpredLifestyle {
  level: LifestyleLevel;
  housing: HousingOption;
}

/** The bill, split the way the summary card prints it. */
export interface MonthlyCost {
  lifestyle: number;
  rent: number;
  total: number;
}

export function monthlyCostOf(lifestyle: CpredLifestyle): MonthlyCost {
  const lifestyleCost = LIFESTYLE_DEFINITIONS[lifestyle.level].monthly;
  const rent = HOUSING_DEFINITIONS[lifestyle.housing].rent;
  return { lifestyle: lifestyleCost, rent, total: lifestyleCost + rent };
}

/** „Na karmie · Kontener — 1100 ed / mies." */
export function formatLifestyle(lifestyle: CpredLifestyle): string {
  const cost = monthlyCostOf(lifestyle);
  return (
    `${LIFESTYLE_DEFINITIONS[lifestyle.level].label} · ` +
    `${HOUSING_DEFINITIONS[lifestyle.housing].label} — ${cost.total} ed / mies.`
  );
}

/**
 * One character's line of the monthly settlement (decision of the GM,
 * 09.08.2026): a wallet that cannot cover the month is emptied rather than
 * left alone, and what is missing is reported as an underpayment.
 *
 * The rulebook's answer to an underpayment — a week of grace, then a Death Save
 * every morning (s. 376) — stays with the GM: debt is explicitly out of this
 * stage's scope, so the VTT states the number and remembers nothing.
 */
export interface MonthlySettlement {
  due: number;
  /** Eddies actually taken — never more than the balance. */
  charged: number;
  /** What the balance could not cover; 0 when the month is paid in full. */
  shortfall: number;
}

export function settleMonth(balance: number, lifestyle: CpredLifestyle): MonthlySettlement {
  const due = monthlyCostOf(lifestyle).total;
  const charged = Math.min(balance, due);
  return { due, charged, shortfall: due - charged };
}

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

/**
 * Why a balance moved. The audit answers „gdzie się podziały pieniądze" in the
 * middle of a session, so every path that touches eddies must name itself —
 * there is deliberately no „other".
 */
export const LEDGER_KINDS = [
  'purchase',
  'transfer',
  'lifestyle',
  'adjust',
  'cyberware',
  'therapy',
  'starting',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  purchase: 'Zakup',
  transfer: 'Przelew',
  lifestyle: 'Rozliczenie miesiąca',
  adjust: 'Korekta MG',
  cyberware: 'Cyborgizacja',
  therapy: 'Terapia',
  // Stage 25c: the purse a character walks out of the wizard with. Its own
  // kind rather than a correction, because the audit's first line should say
  // where the money came from, not that somebody edited it.
  starting: 'Gotówka startowa',
};

export function isLedgerKind(value: unknown): value is LedgerKind {
  return typeof value === 'string' && (LEDGER_KINDS as readonly string[]).includes(value);
}

/** One line of the audit, as the sheet and the client see it. */
export interface LedgerEntryView {
  id: number;
  kind: LedgerKind;
  /** Signed: negative is money leaving the character. */
  amount: number;
  /** Balance *after* the operation — the audit must survive later sheet edits. */
  balance: number;
  /** Polish one-liner: „Zgrzyt 9", „Czynsz — Kontener", „od: Rico". */
  label: string;
  createdAt: string;
}

/** „−100 ed" / „+2 500 ed" — the amount column of the audit list. */
export function formatLedgerAmount(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return `${sign}${formatEddies(Math.abs(amount))} ed`;
}

/**
 * Groups thousands: „15 000" reads, „15000" does not. The separator is a narrow
 * no-break space, written as an escape so it is visible in the source — a plain
 * space would let a rent wrap in the middle of its own number.
 */
export function formatEddies(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
