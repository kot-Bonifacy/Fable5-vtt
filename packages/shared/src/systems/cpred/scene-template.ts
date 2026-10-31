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
import type { SceneTemplate } from '../../scene-templates.js';
import type { TokenGlyph } from '../../tokens.js';
import type { CpredCharacterData } from './character.js';
import type { CpredNetDeviceState } from './netdevices.js';
import {
  NET_ARCHITECTURE_NAME_MAX,
  NET_DEVICE_NAME_MAX,
  NET_DEVICES_PER_NODE_MAX,
  NET_DIFFICULTIES,
  NET_FLOOR_DV_MAX,
  NET_FLOOR_DV_MIN,
  NET_FLOOR_KINDS,
  NET_FLOOR_KINDS_WITH_DV,
  NET_FLOOR_KINDS_WITH_PROGRAMS,
  NET_FLOOR_KIND_LABELS,
  NET_FLOOR_LABEL_MAX,
  NET_FLOORS_MAX,
  NET_NOTES_MAX,
  validateNetArchitecture,
  type CpredNetArchitecture,
  type CpredNetDevice,
  type NetDifficulty,
  type NetFloorKind,
} from './netrunning.js';
import { NET_DEVICE_KIND_BY_GLYPH } from './netscene.js';
import { sanitizeStatBlock } from './statblock.js';

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

/* ───────────────── NPC: ekwipunek i Wartość bojowa (etap 66b) ───────────────── */

/** Rzecz w plecaku NPC-a ze wzorca — własny wiersz, nie wpis kompendium (drzazga z danymi). */
export interface CpredTemplateGear {
  name: string;
  notes: string;
  qty: number;
}

/**
 * Dodatki karty NPC-a, których okno „Nowa postać” nie zna: wiersze plecaka
 * i liczby statbloku poza PW (dron z tabeli s. 213 ma Wartość bojową, nie
 * Umiejętności). Puste — karta zostaje dokładnie taka, jak z `npcSheetFrom`.
 */
export interface CpredTemplateNpcExtras {
  gear: CpredTemplateGear[];
  statBlock: { combatValue: number | null; weaponSkill: number | null; noBulletDodge: boolean };
}

const GEAR_NAME_MAX = 80;
const GEAR_NOTES_MAX = 500;
const GEAR_ROWS_MAX = 12;

export function readCpredTemplateNpcExtras(raw: unknown): CpredTemplateNpcExtras {
  const input = isObj(raw) ? raw : {};
  const gear: CpredTemplateGear[] = [];
  for (const row of Array.isArray(input.gear) ? input.gear.slice(0, GEAR_ROWS_MAX) : []) {
    if (!isObj(row) || typeof row.name !== 'string') continue;
    const name = row.name.trim().slice(0, GEAR_NAME_MAX);
    if (!name) continue;
    const notes = typeof row.notes === 'string' ? row.notes.trim().slice(0, GEAR_NOTES_MAX) : '';
    const qty =
      typeof row.qty === 'number' && Number.isInteger(row.qty) && row.qty > 0 ? row.qty : 1;
    gear.push({ name, notes, qty });
  }
  const block = isObj(input.statBlock) ? input.statBlock : {};
  const number = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    gear,
    statBlock: {
      combatValue: number(block.combatValue),
      weaponSkill: number(block.weaponSkill),
      noBulletDodge: block.noBulletDodge === true,
    },
  };
}

/**
 * Karta NPC-a z dodatkami wzorca: wiersze plecaka na końcu wyposażenia,
 * statblok scalony z tym, co dał statblok okna (wydrukowane PW zostają).
 * Wynik i tak przechodzi przez `parseCharacterData` przy zapisie.
 */
export function cpredTemplateNpcFinish(
  sheet: CpredCharacterData,
  extras: CpredTemplateNpcExtras,
  nextRowId: () => string,
): CpredCharacterData {
  const gear = extras.gear.map((row) => ({
    id: nextRowId(),
    name: row.name,
    notes: row.notes,
    qty: row.qty,
  }));
  const { combatValue, weaponSkill, noBulletDodge } = extras.statBlock;
  const touched = combatValue !== null || weaponSkill !== null || noBulletDodge;
  const statBlock = touched
    ? sanitizeStatBlock({
        ...(sheet.statBlock ?? {}),
        ...(combatValue !== null ? { combatValue } : {}),
        ...(weaponSkill !== null ? { weaponSkill } : {}),
        ...(noBulletDodge ? { noBulletDodge } : {}),
      })
    : sheet.statBlock;
  return { ...sheet, gear: [...sheet.gear, ...gear], statBlock };
}

/* ───────────────────────── Sieć (etap 66b) ───────────────────────── */

/** Urządzenie węzła kontrolnego — figura wzorca wskazana kluczem. */
export interface CpredTemplateNetDevice {
  figure: string;
  /** Nazwa w Architekturze; `null` — nazwa figury. */
  name: string | null;
  /** `false` — urządzenie startuje wyłączone (uśpiony dron). */
  on: boolean;
  notes: string | null;
}

export interface CpredTemplateNetFloor {
  kind: NetFloorKind;
  label: string;
  /** PT piętra; `null` — PT poziomu trudności Architektury (s. 210). */
  dv: number | null;
  notes: string | null;
  /** Programy Czarnego LOD-u albo Demona — każdy slot z alternatywami. */
  programs: string[][];
  devices: CpredTemplateNetDevice[];
}

export interface CpredTemplateNet {
  key: string;
  name: string;
  difficulty: NetDifficulty;
  notes: string | null;
  floors: CpredTemplateNetFloor[];
}

const NET_KEY_PATTERN = /^[a-z0-9-]{1,32}$/;

function textOrNull(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function readNetDevice(raw: unknown): CpredTemplateNetDevice | null {
  if (!isObj(raw) || typeof raw.figure !== 'string' || !raw.figure) return null;
  return {
    figure: raw.figure,
    name: textOrNull(raw.name, NET_DEVICE_NAME_MAX),
    on: raw.on !== false,
    notes: textOrNull(raw.notes, NET_NOTES_MAX),
  };
}

function readNetFloor(raw: unknown): CpredTemplateNetFloor | null {
  if (!isObj(raw)) return null;
  const kind = (NET_FLOOR_KINDS as readonly unknown[]).includes(raw.kind)
    ? (raw.kind as NetFloorKind)
    : null;
  if (!kind) return null;
  let dv: number | null = null;
  if (raw.dv !== undefined && raw.dv !== null) {
    if (typeof raw.dv !== 'number' || !Number.isInteger(raw.dv)) return null;
    dv = raw.dv;
  }
  return {
    kind,
    label: textOrNull(raw.label, NET_FLOOR_LABEL_MAX) ?? NET_FLOOR_KIND_LABELS[kind],
    dv,
    notes: textOrNull(raw.notes, NET_NOTES_MAX),
    programs: Array.isArray(raw.programs)
      ? raw.programs.map(alternatives).filter((slot) => slot.length > 0)
      : [],
    devices: Array.isArray(raw.devices)
      ? raw.devices
          .map(readNetDevice)
          .filter((device): device is CpredTemplateNetDevice => device !== null)
      : [],
  };
}

/**
 * Architektury Sieci z pola `system` całego wzorca (`{ net: [...] }`).
 * Odczyt pobłażliwy jak `readCpredTemplateNpc` — ścisłości pilnuje
 * {@link cpredTemplateProblems} w teście każdego wzorca z repo.
 */
export function readCpredTemplateNets(system: unknown): CpredTemplateNet[] {
  const input = isObj(system) ? system : {};
  const nets: CpredTemplateNet[] = [];
  for (const raw of Array.isArray(input.net) ? input.net : []) {
    if (!isObj(raw) || typeof raw.key !== 'string' || !NET_KEY_PATTERN.test(raw.key)) continue;
    const name = textOrNull(raw.name, NET_ARCHITECTURE_NAME_MAX);
    if (!name) continue;
    const floors = (Array.isArray(raw.floors) ? raw.floors : [])
      .map(readNetFloor)
      .filter((floor): floor is CpredTemplateNetFloor => floor !== null);
    nets.push({
      key: raw.key,
      name,
      difficulty: (NET_DIFFICULTIES as readonly unknown[]).includes(raw.difficulty)
        ? (raw.difficulty as NetDifficulty)
        : 'standard',
      notes: textOrNull(raw.notes, NET_NOTES_MAX),
      floors,
    });
  }
  return nets;
}

/** Id Programów, o które Architektury wzorca pytają kompendium. */
export function cpredTemplateNetProgramIds(nets: readonly CpredTemplateNet[]): string[] {
  return nets.flatMap((net) => net.floors.flatMap((floor) => floor.programs.flat()));
}

/** Figura wzorca założona na scenie — tyle, ile Architektura musi o niej wiedzieć. */
export interface CpredTemplatePlacedFigure {
  tokenId: string;
  name: string;
  glyph: TokenGlyph | null;
}

/**
 * Architektura ze wzorca i stan jej urządzeń (wyłączone na starcie).
 * Urządzenie bierze rodzaj z ikony figury (`NET_DEVICE_KIND_BY_GLYPH`), id to
 * `tpl-<klucz figury>`. Slot Programu bez znanej alternatywy wypada (pierwsze
 * id do `missing`), tak samo urządzenie, którego figury nie ma. Wynik przechodzi
 * przez `validateNetArchitecture` — ten sam odczyt co „Zapisz” w edytorze MG.
 */
export function cpredTemplateNetArchitecture(
  net: CpredTemplateNet,
  ctx: {
    figure: (key: string) => CpredTemplatePlacedFigure | undefined;
    defaultDv: number;
    knownProgram: (id: string) => boolean;
  },
): { architecture: CpredNetArchitecture; devices: CpredNetDeviceState[]; missing: string[] } {
  const missing: string[] = [];
  const states: CpredNetDeviceState[] = [];
  const floors = net.floors.map((floor, index) => {
    const programIds = floor.programs
      .map((slot) => {
        const found = slot.find(ctx.knownProgram) ?? null;
        if (!found) missing.push(slot[0]!);
        return found;
      })
      .filter((id): id is string => id !== null);
    const devices: CpredNetDevice[] = [];
    for (const device of floor.devices) {
      const figure = ctx.figure(device.figure);
      const kind = figure?.glyph ? NET_DEVICE_KIND_BY_GLYPH[figure.glyph] : undefined;
      if (!figure || !kind) {
        missing.push(`figure:${device.figure}`);
        continue;
      }
      const id = `tpl-${device.figure}`.slice(0, 40);
      devices.push({
        id,
        name: (device.name ?? figure.name).slice(0, NET_DEVICE_NAME_MAX),
        deviceKind: kind,
        tokenId: figure.tokenId,
        ...(device.notes ? { notes: device.notes } : {}),
      });
      if (!device.on) states.push({ deviceId: id, on: false });
    }
    const withDv = NET_FLOOR_KINDS_WITH_DV.includes(floor.kind);
    return {
      id: `tpl-floor-${index + 1}`,
      kind: floor.kind,
      label: floor.label,
      ...(withDv ? { dv: floor.dv ?? ctx.defaultDv } : {}),
      ...(programIds.length > 0 ? { programIds } : {}),
      ...(devices.length > 0 ? { devices } : {}),
      ...(floor.notes ? { notes: floor.notes } : {}),
    };
  });
  const checked = validateNetArchitecture({
    name: net.name,
    difficulty: net.difficulty,
    branches: [{ id: 'trunk', parentFloor: null, floors }],
    ...(net.notes ? { notes: net.notes } : {}),
  });
  if (!checked.ok) {
    throw new Error(`Template net ${net.key}: ${checked.issues[0]?.message ?? 'invalid'}`);
  }
  return { architecture: checked.architecture, devices: states, missing };
}

/**
 * Co we wzorcu nie trzyma się kupy po stronie CP RED — dla testu każdego
 * wzorca z repo, nie dla stołu (przy stole braki idą do `missing`). Pusta
 * lista — wzorzec w porządku.
 */
export function cpredTemplateProblems(template: SceneTemplate): string[] {
  const problems: string[] = [];
  const nets = readCpredTemplateNets(template.system);
  const system = isObj(template.system) ? template.system : {};
  const rawNets: unknown[] = Array.isArray(system.net) ? system.net : [];
  if (rawNets.length !== nets.length) problems.push('net: nieczytelna Architektura');
  const figures = new Map(
    template.figures
      .filter((figure) => figure.key !== null)
      .map((figure) => [figure.key as string, figure]),
  );
  const netKeys = new Set<string>();
  const wired = new Set<string>();
  for (const [index, net] of nets.entries()) {
    if (netKeys.has(net.key)) problems.push(`net ${net.key}: klucz powtórzony`);
    netKeys.add(net.key);
    const rawNet = rawNets[index];
    const rawFloors = isObj(rawNet) && Array.isArray(rawNet.floors) ? rawNet.floors : [];
    if (rawFloors.length !== net.floors.length) problems.push(`net ${net.key}: nieczytelne piętro`);
    if (net.floors.length === 0 || net.floors.length > NET_FLOORS_MAX) {
      problems.push(`net ${net.key}: liczba pięter`);
    }
    for (const floor of net.floors) {
      if (floor.devices.length > 0 && floor.kind !== 'controlNode') {
        problems.push(`net ${net.key}: urządzenia poza węzłem kontrolnym (${floor.label})`);
      }
      if (floor.devices.length > NET_DEVICES_PER_NODE_MAX) {
        problems.push(`net ${net.key}: za dużo urządzeń w węźle ${floor.label}`);
      }
      if (floor.programs.length > 0 && !NET_FLOOR_KINDS_WITH_PROGRAMS.includes(floor.kind)) {
        problems.push(`net ${net.key}: Programy poza LOD-em i Demonem (${floor.label})`);
      }
      if (floor.dv !== null && (floor.dv < NET_FLOOR_DV_MIN || floor.dv > NET_FLOOR_DV_MAX)) {
        problems.push(`net ${net.key}: PT poza skalą (${floor.label})`);
      }
      for (const device of floor.devices) {
        const figure = figures.get(device.figure);
        if (!figure) problems.push(`net ${net.key}: brak figury ${device.figure}`);
        else if (!figure.glyph || !NET_DEVICE_KIND_BY_GLYPH[figure.glyph]) {
          problems.push(`net ${net.key}: figura ${device.figure} bez ikony urządzenia Sieci`);
        }
        if (wired.has(device.figure)) problems.push(`figura ${device.figure} podpięta dwa razy`);
        wired.add(device.figure);
      }
    }
  }
  for (const point of template.accessPoints) {
    if (point.net && !netKeys.has(point.net)) {
      problems.push(`gniazdo ${point.name}: brak Architektury ${point.net}`);
    }
  }
  return problems;
}
