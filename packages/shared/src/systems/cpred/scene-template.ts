/**
 * Część CP RED wzorca sceny (etap 66) — pola `system` auta i figury
 * z `SceneTemplate` (rdzeń w `scene-templates.ts`).
 *
 * Wzorzec leży w publicznym repo, więc nie niesie treści podręcznika: auto to
 * id wpisu katalogu plus ulepszenia z listy, NPC to statblok (Cechy,
 * Umiejętności) i id broni oraz pancerza. Każde id ma **alternatywy** — lista
 * idzie od najlepszego dopasowania, a pierwsze, które kompendium kampanii zna,
 * wygrywa. Dzięki temu ten sam wzorzec stawia się na VPS z katalogiem
 * z `data/private` i na świeżej kopii repo z samą próbką z `data/public`.
 * Czego nie ma w żadnej postaci, trafia na listę `missing` dla MG.
 */

import {
  CPRED_VEHICLE_UPGRADE_IDS,
  cpredVehicleFromCatalog,
  cpredVehicleUpgradesProblem,
  readCpredVehicle,
  type CpredVehicleStats,
  type CpredVehicleUpgradeId,
} from './vehicles.js';
import type { VehicleEntry } from './compendium.js';

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Alternatywy jednego id: napis albo lista napisów, pusta lista — brak. */
function alternatives(raw: unknown): string[] {
  if (typeof raw === 'string') return raw ? [raw] : [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/* ───────────────────────── auto ───────────────────────── */

export interface CpredTemplateVehicle {
  catalogIds: string[];
  upgrades: CpredVehicleUpgradeId[];
}

export function readCpredTemplateVehicle(raw: unknown): CpredTemplateVehicle {
  const input = isObj(raw) ? raw : {};
  const upgrades = Array.isArray(input.upgrades)
    ? input.upgrades.filter((id): id is CpredVehicleUpgradeId =>
        (CPRED_VEHICLE_UPGRADE_IDS as readonly unknown[]).includes(id),
      )
    : [];
  return { catalogIds: alternatives(input.catalogIds), upgrades };
}

/**
 * Liczby auta: pierwszy znany wpis katalogu (pełne PUK) z ulepszeniami
 * wzorca. Bez żadnego wpisu — kompakt zastępczy, jak przy Taborze bez
 * katalogu (`cpredVehicleFromCatalog(null)`), a pierwsze id idzie do `missing`.
 * Ulepszenia, których auto nie przyjmie, wypadają (też do `missing`).
 */
export function cpredTemplateVehicleStats(
  spec: CpredTemplateVehicle,
  findEntry: (id: string) => VehicleEntry | undefined,
): { stats: CpredVehicleStats; missing: string[] } {
  const missing: string[] = [];
  const entry = spec.catalogIds.map(findEntry).find((found) => found !== undefined) ?? null;
  if (!entry && spec.catalogIds.length > 0) missing.push(spec.catalogIds[0]!);
  const base = cpredVehicleFromCatalog(entry);
  const rows = spec.upgrades.map((upgradeId, index) => ({
    id: `tpl-${index + 1}`,
    upgradeId,
    notes: '',
  }));
  const fits = cpredVehicleUpgradesProblem(base.kind, rows) === null;
  if (!fits && rows.length > 0) missing.push(...spec.upgrades.map((id) => `upgrade:${id}`));
  // Odczyt jeszcze raz: PUK bieżące liczą się od sufitu z ulepszeniami
  // (Wzmocniona konstrukcja to +20), a auto ze wzorca wyjeżdża całe.
  const stats = readCpredVehicle({ ...base, upgrades: fits ? rows : [], hp: undefined });
  return { stats, missing };
}

/* ───────────────────────── NPC ───────────────────────── */

export interface CpredTemplateNpc {
  roleId: string | null;
  stats: unknown;
  hpMax: number | null;
  skills: unknown;
  /** Każdy slot broni z alternatywami. */
  weapons: string[][];
  armorHead: string[];
  armorBody: string[];
  armorShield: string[];
  roleRank: number | null;
}

export function readCpredTemplateNpc(raw: unknown): CpredTemplateNpc {
  const input = isObj(raw) ? raw : {};
  return {
    roleId: typeof input.roleId === 'string' ? input.roleId : null,
    stats: input.stats ?? null,
    hpMax: typeof input.hpMax === 'number' ? input.hpMax : null,
    skills: input.skills ?? null,
    weapons: Array.isArray(input.weapons)
      ? input.weapons.map(alternatives).filter((slot) => slot.length > 0)
      : [],
    armorHead: alternatives(input.armorHead),
    armorBody: alternatives(input.armorBody),
    armorShield: alternatives(input.armorShield),
    roleRank: typeof input.roleRank === 'number' ? input.roleRank : null,
  };
}

/** Wszystkie id, o które wzorzec NPC-a pyta kompendium — serwer sprawdza je naraz. */
export function cpredTemplateNpcEntryIds(npc: CpredTemplateNpc): string[] {
  return [...npc.weapons.flat(), ...npc.armorHead, ...npc.armorBody, ...npc.armorShield];
}

/**
 * Wejście statbloku (`CpredNpcInput` przed `sanitizeNpcInput`) z pierwszymi
 * znanymi alternatywami. Slot bez żadnej znanej — do `missing` (pierwsze id).
 */
export function cpredTemplateNpcInput(
  npc: CpredTemplateNpc,
  known: (id: string) => boolean,
): { input: Record<string, unknown>; missing: string[] } {
  const missing: string[] = [];
  const pick = (slot: string[]): string | null => {
    if (slot.length === 0) return null;
    const found = slot.find(known) ?? null;
    if (!found) missing.push(slot[0]!);
    return found;
  };
  const weaponIds = npc.weapons.map(pick).filter((id): id is string => id !== null);
  return {
    input: {
      roleId: npc.roleId,
      stats: npc.stats,
      hpMax: npc.hpMax,
      skills: npc.skills,
      weaponIds,
      armorHeadId: pick(npc.armorHead),
      armorBodyId: pick(npc.armorBody),
      armorShieldId: pick(npc.armorShield),
      roleRank: npc.roleRank,
    },
    missing,
  };
}
