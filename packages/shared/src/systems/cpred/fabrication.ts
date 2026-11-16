/**
 * Praca Twórcy: Ulepszanie przedmiotu i Wytwarzanie Testem Technika (etap 71d2,
 * G13; s. 148).
 *
 * Etap 30b wypisał tabelę PT i czasu (`CPRED_FABRICATION_TASK`) i zostawił ją
 * do czytania, bo nie było rzutu, czasu ani surowców. Od 71c2 jest rura pracy
 * Technika (rodzaje rzutu `repair` i `vehicleUpgrade`, czas jako propozycja
 * zegara dla MG), a od 71d1 skutki Ulepszania na wierszu (`itemupgrade.ts`).
 * Ten moduł dokłada do niej dwie prace:
 *
 *  - **Ulepszanie przedmiotu** (`itemUpgrade`) — wiersz karty drużyny, jeden
 *    z sposobów z s. 148, PT i czas z pasma ceny przedmiotu, surowce z tego
 *    samego pasma; sukces stempluje wiersz `cpredApplyItemUpgrade`;
 *  - **Wytwarzanie** (`fabricate`) — wpis Kompendium, PT i czas z jego pasma,
 *    surowce o pasmo niżej (Superluksusowe: połowa ceny); sukces kładzie
 *    rzecz na kartę Technika tym samym wierszem, co zakup.
 *
 * Surowce to pieniądze, nie przedmioty (bramka 71, TEC-09): sprawdzane przed
 * kośćmi, płacone przy sukcesie — porażka ich nie zjada (s. 148: „nie odnoszą
 * żadnych uszkodzeń”, „nie przepadają”).
 *
 * Czysta logika. Planer rzutu (`rolls.ts`) tego modułu **nie** importuje —
 * warunki pracy wpisuje serwer, jak przy naprawie (pułapka cyklu importów
 * z 15.11 na górze `testy`).
 */

import type { CpredArmorRow } from './character.js';
import type { CompendiumEntry, CostCategory, ResolvedWeapon } from './compendium.js';
import { cpredIsChemEntry } from './drugs.js';
import { COST_CATEGORY_PRICE, entryPrice } from './economy.js';
import { cpredCatalogPriceScale } from './pricing.js';
import { cpredItemUpgrade } from './roleability.js';
import {
  CPRED_ITEM_UPGRADE_PROBLEMS,
  cpredItemUpgradeProblem,
  cpredUpgradesForTarget,
  type CpredItemUpgradeProblem,
  type CpredUpgradeSubject,
} from './itemupgrade.js';
import type { CpredRepairTarget, CpredWorkTask } from './repair.js';
import { purchasedSheetRow, type PurchasedRow } from './shopping.js';

const HOUR = 60;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

/**
 * PT i czas Ulepszania, Wytwarzania i Wynajdywania wg pasma ceny (s. 148) —
 * te same liczby co `CPRED_FABRICATION_TASK` (tabela w panelu), tu w minutach
 * zegara świata. Osobno od `CPRED_REPAIR_TASK` z tego samego powodu, z którego
 * naprawa trzyma swoją: to dwie reguły podręcznika.
 */
export const CPRED_FABRICATION_WORK: Record<CostCategory, CpredWorkTask> = {
  cheap: { dv: 9, minutes: HOUR },
  everyday: { dv: 9, minutes: HOUR },
  costly: { dv: 13, minutes: 6 * HOUR },
  premium: { dv: 17, minutes: DAY },
  expensive: { dv: 21, minutes: 7 * DAY },
  veryExpensive: { dv: 24, minutes: 14 * DAY },
  luxury: { dv: 29, minutes: MONTH },
  superLuxury: { dv: 29, minutes: MONTH },
};

/**
 * Superluksusowe: „1 miesiąc na każde 10 000 ed ceny” (s. 148) — w cenniku
 * domowym z etapu 47a na każde 100 000 ed (pasmo zostało, cena urosła dziesięć
 * razy; ten sam dopisek stoi przy `CPRED_FABRICATION_TASK`).
 */
export const CPRED_SUPER_LUXURY_MONTH_PER_ED = 100_000;

/** PT i czas pracy nad rzeczą z danego pasma; cena liczy się tylko przy Superluksusowych. */
export function cpredFabricationWorkTask(
  category: CostCategory,
  price: number | null,
): CpredWorkTask {
  const row = CPRED_FABRICATION_WORK[category];
  if (category !== 'superLuxury') return row;
  const months = Math.max(1, Math.ceil((price ?? 0) / CPRED_SUPER_LUXURY_MONTH_PER_ED));
  return { dv: row.dv, minutes: months * MONTH };
}

/**
 * Pasmo surowców Wytwarzania: „o jeden niższe niż kategoria cenowa
 * wytwarzanego przedmiotu” (s. 148). Tanie nie mają niższego szczebla —
 * ramka na tej samej stronie mówi, że ich surowce kosztują 5 ed.
 */
const LOWER_BAND: Record<Exclude<CostCategory, 'cheap' | 'superLuxury'>, CostCategory> = {
  everyday: 'cheap',
  costly: 'everyday',
  premium: 'costly',
  expensive: 'premium',
  veryExpensive: 'expensive',
  luxury: 'veryExpensive',
};

/** Surowce Tanich przedmiotów w cenach podręcznika (ramka s. 148). */
export const CPRED_CHEAP_MATERIALS_PRICE = 5;

/** Co z wpisu czyta cennik surowców. */
export type CpredMaterialsEntry = Pick<CompendiumEntry, 'cost' | 'costCategory'> &
  Partial<Pick<CompendiumEntry, 'id' | 'category'>>;

/**
 * Surowce Ulepszania: „z tej samej kategorii cenowej co ulepszany przedmiot”
 * (s. 148) — cena pasma, nie wydrukowana cena tej sztuki, w cenniku domowym
 * wpisu (ten sam mnożnik, którym `entryPrice` liczy rzecz z samym pasmem).
 * `null` — rzecz bez pasma; tę ulepsza tylko MG menu „Ulepszenie…”.
 */
export function cpredUpgradeMaterialsCost(entry: CpredMaterialsEntry | undefined): number | null {
  if (!entry?.costCategory) return null;
  return Math.round(COST_CATEGORY_PRICE[entry.costCategory] * cpredCatalogPriceScale(entry));
}

/**
 * Surowce Wytwarzania: pasmo niżej (s. 148), Superluksusowe — połowa ceny,
 * Tanie — 5 ed z ramki. W cenniku domowym wpisu, jak wyżej.
 */
export function cpredFabricateMaterialsCost(entry: CpredMaterialsEntry | undefined): number | null {
  const band = entry?.costCategory;
  if (!entry || !band) return null;
  if (band === 'superLuxury') return Math.round((entryPrice(entry) ?? 0) / 2);
  const scale = cpredCatalogPriceScale(entry);
  if (band === 'cheap') return Math.round(CPRED_CHEAP_MATERIALS_PRICE * scale);
  return Math.round(COST_CATEGORY_PRICE[LOWER_BAND[band]] * scale);
}

// ─────────────────────── Umiejętność „którą zwykle się naprawia” ───────────────────────

/** Naprawa broni — broń i dodatki do niej. */
const WEAPONSTECH = 'weaponstech';
/** Cyberinżynieria — wszczepy, także te leżące w plecaku. */
const CYBERTECH = 'cybertech';
/** Elektronika i zabezpieczenia — cyberdeki. */
const ELECTRONICS = 'electronics-security';
/** Podstawowe naprawy — „zawsze naprawia się nimi przedmioty nieuwzględnione przez pozostałe” (FAQ). */
const BASIC_TECH = 'basic-tech';

type SkillEntry = Partial<Pick<CompendiumEntry, 'category'>> & { deckSlots?: number };

/**
 * Umiejętność Techniczna, „za pomocą której zwykle naprawia się taki
 * przedmiot” (s. 148), dla wpisu Kompendium. Zasada domowa 71d2: broń
 * i dodatki — Naprawa broni, wszczep — Cyberinżynieria, cyberdek —
 * Elektronika i zabezpieczenia, reszta — Podstawowe naprawy (FAQ).
 */
export function cpredEntryTechSkillId(entry: SkillEntry | undefined): string {
  switch (entry?.category) {
    case 'weapon':
    case 'attachment':
      return WEAPONSTECH;
    case 'cyberware':
      return CYBERTECH;
    case 'gear':
      return (entry.deckSlots ?? 0) > 0 ? ELECTRONICS : BASIC_TECH;
    default:
      return BASIC_TECH;
  }
}

/** To samo dla wiersza karty, który Technik ulepsza. */
export function cpredItemTechSkillId(subject: CpredUpgradeSubject): string {
  switch (subject.kind) {
    case 'weapon':
      return WEAPONSTECH;
    case 'armor':
      return BASIC_TECH;
    case 'cyberware':
      return CYBERTECH;
    case 'gear':
      return cpredEntryTechSkillId(subject.entry as SkillEntry | undefined);
  }
}

// ─────────────────────────────── Odmowy ───────────────────────────────

export type CpredFabricationProblem =
  | CpredItemUpgradeProblem
  | 'NO_UPGRADE_SPECIALTY'
  | 'NO_FABRICATE_SPECIALTY'
  /** Rzecz bez pasma ceny — PT, czasu i surowców nie ma skąd wziąć. */
  | 'NO_PRICE_BAND'
  /** Wynalazek i ulepszenie pojazdu nie idą tą drogą. */
  | 'UPGRADE_BY_GM'
  | 'NOT_FABRICABLE';

export const CPRED_FABRICATION_PROBLEMS: Record<CpredFabricationProblem, string> = {
  ...CPRED_ITEM_UPGRADE_PROBLEMS,
  NO_UPGRADE_SPECIALTY: 'Ulepsza Technik z co najmniej 1 punktem w Specjalizacji Ulepszanie.',
  NO_FABRICATE_SPECIALTY: 'Wytwarza Technik z co najmniej 1 punktem w Specjalizacji Wytwarzanie.',
  NO_PRICE_BAND:
    'Ta rzecz nie ma kategorii cenowej w Kompendium — bez niej nie ma PT, czasu ani surowców. Ulepszenie wpisuje MG.',
  UPGRADE_BY_GM:
    'Montaż wynalazku wpisuje MG (zasady wynalazku pisze MG), a ulepszenie auta montuje się przy aucie.',
  NOT_FABRICABLE:
    'Tego nie da się wytworzyć Testem Technika — broń, dodatki, pancerz, sprzęt i wszczepy tak, amunicja, programy i pojazdy nie.',
};

/**
 * Sposoby Ulepszania, które Technik daje rzeczy **Testem**: wszystkie z menu MG
 * poza montażem wynalazku (kategorię i zasady ustala MG, TEC-21) i ulepszeniem
 * pojazdu (montaż w aucie, 71c2).
 */
const GM_ONLY_UPGRADES: ReadonlySet<string> = new Set(['invention', 'vehicleMod']);

export function cpredTechUpgradesForTarget(subject: CpredUpgradeSubject): string[] {
  return cpredUpgradesForTarget(subject).filter((id) => !GM_ONLY_UPGRADES.has(id));
}

/**
 * Czy Technik z danym poziomem Ulepszania ulepszy tę rzecz tym sposobem.
 * `entry` — wpis Kompendium wiersza (pasmo ceny); `undefined` dla wiersza
 * wpisanego ręką.
 */
export function cpredTechItemUpgradeProblem(
  upgradeLevel: number,
  upgradeId: string,
  subject: CpredUpgradeSubject,
  entry: CpredMaterialsEntry | undefined,
): CpredFabricationProblem | null {
  if (upgradeLevel < 1) return 'NO_UPGRADE_SPECIALTY';
  if (GM_ONLY_UPGRADES.has(upgradeId) && cpredItemUpgrade(upgradeId)) return 'UPGRADE_BY_GM';
  const problem = cpredItemUpgradeProblem(upgradeId, subject);
  if (problem) return problem;
  if (!entry?.costCategory) return 'NO_PRICE_BAND';
  return null;
}

/**
 * Co da się wytworzyć: broń, dodatki, pancerz, sprzęt i wszczepy (leżą potem
 * w plecaku jak znaleziony chrom). Amunicja (pudełka i kalibry), programy
 * (Netrunner poza etapem 71), pojazdy i używki — nie: farmaceutyki robi Medyk
 * (s. 150), a narkotyków ulicznych nie wytwarza się nawet Farmaceutykami.
 * Zasada domowa 71d2.
 */
const FABRICABLE: ReadonlySet<string> = new Set([
  'weapon',
  'attachment',
  'armor',
  'gear',
  'cyberware',
]);

/** Wpis oczami Wytwarzania — pasmo, rodzaj, a do rozpoznania używek id i nazwa. */
export type CpredFabricableEntry = CpredMaterialsEntry & Partial<Pick<CompendiumEntry, 'name'>>;

function fabricableKind(entry: CpredFabricableEntry): boolean {
  if (!FABRICABLE.has(entry.category ?? '')) return false;
  return !(entry.id && cpredIsChemEntry({ id: entry.id, name: entry.name ?? '' }));
}

export function cpredFabricateProblem(
  fabricateLevel: number,
  entry: CpredFabricableEntry | undefined,
): CpredFabricationProblem | null {
  if (fabricateLevel < 1) return 'NO_FABRICATE_SPECIALTY';
  if (!entry || !fabricableKind(entry)) return 'NOT_FABRICABLE';
  if (!entry.costCategory) return 'NO_PRICE_BAND';
  return null;
}

/** Wpisy Kompendium, które Technik może wybrać do Wytwarzania (lista w panelu Twórcy). */
export function cpredIsFabricableEntry(entry: CpredFabricableEntry): boolean {
  return fabricableKind(entry) && !!entry.costCategory;
}

/**
 * Wiersz karty dla wytworzonej rzeczy — ten sam, który daje zakup
 * (`purchasedSheetRow`), a wszczep ląduje w Wyposażeniu jak znaleziony chrom
 * (montuje go potem `character:cyberware`, z Testem i Utratą Człowieczeństwa).
 */
export function cpredFabricatedRow(
  entry: CompendiumEntry,
  resolved: ResolvedWeapon | null,
  rowId: string,
  wornArmor: readonly CpredArmorRow[] = [],
): PurchasedRow | null {
  if (entry.category === 'cyberware') {
    return {
      list: 'gear',
      row: { id: rowId, name: entry.name, compendiumId: entry.id, notes: '', qty: 1 },
    };
  }
  return purchasedSheetRow(entry, resolved, rowId, wornArmor);
}

// ─────────────────────── Lista robót (`repair:targets`) ───────────────────────

/** Rzecz drużyny, którą Technik z Ulepszaniem może ulepszyć Testem. */
export interface CpredItemUpgradeTargetView {
  target: Extract<CpredRepairTarget, { kind: 'item' }>;
  name: string;
  /** Imię postaci (nigdy konto gracza). */
  ownerName: string;
  skillId: string;
  /** Sposoby Ulepszania, które tej rzeczy pasują. */
  upgradeIds: string[];
  /** PT i czas z pasma; `null` — rzecz bez pasma (ulepsza MG). */
  task: CpredWorkTask | null;
  /** Surowce w ed; `null` — rzecz bez pasma. */
  cost: number | null;
}
