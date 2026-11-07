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
import { CHECK_CALL_DV_MAX, CHECK_CALL_DV_MIN } from '../../checks.js';
import { isContainerLock, type ContainerLock } from '../../containers.js';
import type { SceneTemplate } from '../../scene-templates.js';
import { createContainerSheet } from './containercard.js';
import { isCpredLockSkill, readCpredLock, type CpredLock, type CpredLockSkill } from './lock.js';
import type { PurchasedRow } from './shopping.js';
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
  /** Gotówka przy NPC-u (66e: utarg Kucharza) — do łupu jak z każdej karty; 0 — bez. */
  eddies: number;
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
    eddies:
      typeof input.eddies === 'number' && Number.isInteger(input.eddies) && input.eddies > 0
        ? Math.min(input.eddies, CONTAINER_EDDIES_MAX)
        : 0,
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
  return {
    ...sheet,
    gear: [...sheet.gear, ...gear],
    statBlock,
    ...(extras.eddies > 0 ? { eddies: extras.eddies } : {}),
  };
}

/* ───────────────────────── Sieć (etap 66b) ───────────────────────── */

/**
 * Urządzenie węzła kontrolnego — rzecz wzorca wskazana kluczem: figura
 * (kamera, wieżyczka, dron), a od 66e także strefa broniona (`zone`, rodzaj
 * „System środowiskowy”) albo otwór (`wall`, rodzaj „Drzwi lub winda”).
 * Dokładnie jedno z trzech.
 */
export interface CpredTemplateNetDevice {
  /** Klucz figury; pusty napis, gdy urządzenie to strefa albo otwór. */
  figure: string;
  zone: string | null;
  wall: string | null;
  /** Nazwa w Architekturze; `null` — nazwa figury albo strefy, przy otworze „Drzwi”. */
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
  if (!isObj(raw)) return null;
  const key = (value: unknown): string | null =>
    typeof value === 'string' && value ? value : null;
  const figure = key(raw.figure);
  const zone = key(raw.zone);
  const wall = key(raw.wall);
  if ([figure, zone, wall].filter((value) => value !== null).length !== 1) return null;
  return {
    figure: figure ?? '',
    zone,
    wall,
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

/** Strefa wzorca założona na scenie — tyle, ile urządzenie węzła musi o niej wiedzieć. */
export interface CpredTemplatePlacedZone {
  name: string;
}

/** Otwór wzorca założony na scenie — id `Wall`, który urządzenie otwiera. */
export interface CpredTemplatePlacedWall {
  wallId: number;
}

/**
 * Strefa podpięta pod węzeł (66e): `DefenseZone.architectureId/floorId/deviceId`
 * pisze serwer, gdy Architektura ma już id.
 */
export interface CpredTemplateZoneLink {
  zone: string;
  floorId: string;
  deviceId: string;
}

/**
 * Architektura ze wzorca i stan jej urządzeń (wyłączone na starcie).
 * Urządzenie-figura bierze rodzaj z ikony figury (`NET_DEVICE_KIND_BY_GLYPH`),
 * id to `tpl-<klucz figury>`; strefa (66e) to „System środowiskowy”
 * `tpl-zone-<klucz>` (wiązanie wraca w `zones`), otwór — „Drzwi lub winda”
 * `tpl-wall-<klucz>` z `wallId`. Slot Programu bez znanej alternatywy wypada
 * (pierwsze id do `missing`), tak samo urządzenie, którego rzeczy nie ma. Wynik
 * przechodzi przez `validateNetArchitecture` — ten sam odczyt co „Zapisz”
 * w edytorze MG.
 */
export function cpredTemplateNetArchitecture(
  net: CpredTemplateNet,
  ctx: {
    figure: (key: string) => CpredTemplatePlacedFigure | undefined;
    zone?: (key: string) => CpredTemplatePlacedZone | undefined;
    wall?: (key: string) => CpredTemplatePlacedWall | undefined;
    defaultDv: number;
    knownProgram: (id: string) => boolean;
  },
): {
  architecture: CpredNetArchitecture;
  devices: CpredNetDeviceState[];
  zones: CpredTemplateZoneLink[];
  missing: string[];
} {
  const missing: string[] = [];
  const states: CpredNetDeviceState[] = [];
  const zoneLinks: CpredTemplateZoneLink[] = [];
  const floors = net.floors.map((floor, index) => {
    const floorId = `tpl-floor-${index + 1}`;
    const programIds = floor.programs
      .map((slot) => {
        const found = slot.find(ctx.knownProgram) ?? null;
        if (!found) missing.push(slot[0]!);
        return found;
      })
      .filter((id): id is string => id !== null);
    const devices: CpredNetDevice[] = [];
    for (const device of floor.devices) {
      const notes = device.notes ? { notes: device.notes } : {};
      let id: string;
      if (device.zone !== null) {
        const zone = ctx.zone?.(device.zone);
        if (!zone) {
          missing.push(`zone:${device.zone}`);
          continue;
        }
        id = `tpl-zone-${device.zone}`.slice(0, 40);
        devices.push({
          id,
          name: (device.name ?? zone.name).slice(0, NET_DEVICE_NAME_MAX),
          deviceKind: 'environment',
          ...notes,
        });
        zoneLinks.push({ zone: device.zone, floorId, deviceId: id });
      } else if (device.wall !== null) {
        const wall = ctx.wall?.(device.wall);
        if (!wall) {
          missing.push(`wall:${device.wall}`);
          continue;
        }
        id = `tpl-wall-${device.wall}`.slice(0, 40);
        devices.push({
          id,
          name: (device.name ?? 'Drzwi').slice(0, NET_DEVICE_NAME_MAX),
          deviceKind: 'door',
          wallId: wall.wallId,
          ...notes,
        });
      } else {
        const figure = ctx.figure(device.figure);
        const kind = figure?.glyph ? NET_DEVICE_KIND_BY_GLYPH[figure.glyph] : undefined;
        if (!figure || !kind) {
          missing.push(`figure:${device.figure}`);
          continue;
        }
        id = `tpl-${device.figure}`.slice(0, 40);
        devices.push({
          id,
          name: (device.name ?? figure.name).slice(0, NET_DEVICE_NAME_MAX),
          deviceKind: kind,
          tokenId: figure.tokenId,
          ...notes,
        });
      }
      if (!device.on) states.push({ deviceId: id, on: false });
    }
    const withDv = NET_FLOOR_KINDS_WITH_DV.includes(floor.kind);
    return {
      id: floorId,
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
  return { architecture: checked.architecture, devices: states, zones: zoneLinks, missing };
}

/* ─────────────── strefy, zamki i pojemniki (etap 66e) ─────────────── */

/** Pole `system` strefy: wpis „Obrony Sieci” z alternatywami (jak broń NPC-a). */
export interface CpredTemplateZone {
  entryIds: string[];
}

export function readCpredTemplateZone(raw: unknown): CpredTemplateZone {
  const input = isObj(raw) ? raw : {};
  return { entryIds: alternatives(input.entryIds) };
}

/**
 * Zamek otworu ze wzorca (`walls[].lockRule`) — ten sam zapis co `Wall.lockRule`
 * z 58c, czytany wyrozumiale (`readCpredLock`); ścisłości pilnuje
 * {@link cpredTemplateProblems}. Lista prób zawsze pusta — wzorzec to nowe drzwi.
 */
export function cpredTemplateLockRule(raw: unknown): CpredLock {
  return { ...readCpredLock(raw), tried: [] };
}

/** Rzecz w pojemniku: wpis kompendium z alternatywami i ilość (plecak). */
export interface CpredTemplateContainerItem {
  ids: string[];
  qty: number;
}

/** Pole `system` pojemnika: zamek, klucz u figury, zawartość i gotówka. */
export interface CpredTemplateContainer {
  lock: ContainerLock;
  dv: number;
  skills: CpredLockSkill[];
  /** Klucz figury, która nosi klucz do pojemnika (wiersz plecaka); `null` — nikt. */
  keyHolder: string | null;
  items: CpredTemplateContainerItem[];
  eddies: number;
}

const CONTAINER_ITEMS_MAX = 20;
const CONTAINER_EDDIES_MAX = 1_000_000;

export function readCpredTemplateContainer(raw: unknown): CpredTemplateContainer {
  const input = isObj(raw) ? raw : {};
  const lock = readCpredLock(input);
  const items: CpredTemplateContainerItem[] = [];
  for (const row of Array.isArray(input.items) ? input.items.slice(0, CONTAINER_ITEMS_MAX) : []) {
    const ids = isObj(row) ? alternatives(row.ids) : alternatives(row);
    if (ids.length === 0) continue;
    const qty =
      isObj(row) && typeof row.qty === 'number' && Number.isInteger(row.qty) && row.qty > 0
        ? row.qty
        : 1;
    items.push({ ids, qty });
  }
  const eddies =
    typeof input.eddies === 'number' && Number.isInteger(input.eddies) && input.eddies > 0
      ? Math.min(input.eddies, CONTAINER_EDDIES_MAX)
      : 0;
  return {
    lock: isContainerLock(input.lock) ? input.lock : 'closed',
    dv: lock.dv,
    skills: lock.skills,
    keyHolder: typeof input.keyHolder === 'string' && input.keyHolder ? input.keyHolder : null,
    items,
    eddies,
  };
}

/**
 * Karta pojemnika ze wzorca: pusta karta z polem `container` i rzeczami, które
 * serwer zbudował z kompendium (`purchasedSheetRow`), oraz gotówką. Rzecz
 * plecaka bierze ilość ze wzorca. `keyId` — uchwyt klucza, gdy ktoś go nosi.
 */
export function cpredTemplateContainerSheet(
  spec: CpredTemplateContainer,
  rows: readonly { row: PurchasedRow; qty: number }[],
  keyId: string | null,
): CpredCharacterData {
  const sheet = createContainerSheet({
    lock: spec.lock,
    dv: spec.dv,
    skills: spec.skills,
    keyId,
  });
  for (const { row, qty } of rows) {
    if (row.list === 'weapons') sheet.weapons.push(row.row);
    else if (row.list === 'armor') sheet.armor.push(row.row);
    else sheet.gear.push({ ...row.row, qty });
  }
  return { ...sheet, eddies: spec.eddies };
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
  const zoneKeys = new Set(
    template.zones.map((zone) => zone.key).filter((key): key is string => key !== null),
  );
  const wallKeys = new Set(
    template.walls.map((wall) => wall.key).filter((key): key is string => key !== null),
  );
  const netKeys = new Set<string>();
  const wired = new Set<string>();
  for (const [index, net] of nets.entries()) {
    if (netKeys.has(net.key)) problems.push(`net ${net.key}: klucz powtórzony`);
    netKeys.add(net.key);
    const rawNet = rawNets[index];
    const rawFloors = isObj(rawNet) && Array.isArray(rawNet.floors) ? rawNet.floors : [];
    if (rawFloors.length !== net.floors.length) problems.push(`net ${net.key}: nieczytelne piętro`);
    for (const [at, floor] of net.floors.entries()) {
      const rawFloor = rawFloors[at];
      const rawDevices = isObj(rawFloor) && Array.isArray(rawFloor.devices) ? rawFloor.devices : [];
      if (rawDevices.length !== floor.devices.length) {
        problems.push(`net ${net.key}: nieczytelne urządzenie w węźle ${floor.label}`);
      }
    }
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
        let label: string;
        if (device.zone !== null) {
          label = `strefa ${device.zone}`;
          if (!zoneKeys.has(device.zone)) {
            problems.push(`net ${net.key}: brak strefy ${device.zone}`);
          }
        } else if (device.wall !== null) {
          label = `otwór ${device.wall}`;
          if (!wallKeys.has(device.wall))
            problems.push(`net ${net.key}: brak otworu ${device.wall}`);
        } else {
          label = `figura ${device.figure}`;
          const figure = figures.get(device.figure);
          if (!figure) problems.push(`net ${net.key}: brak figury ${device.figure}`);
          else if (!figure.glyph || !NET_DEVICE_KIND_BY_GLYPH[figure.glyph]) {
            problems.push(`net ${net.key}: figura ${device.figure} bez ikony urządzenia Sieci`);
          }
        }
        if (wired.has(label)) problems.push(`${label} podpięta dwa razy`);
        wired.add(label);
      }
    }
  }
  for (const point of template.accessPoints) {
    if (point.net && !netKeys.has(point.net)) {
      problems.push(`gniazdo ${point.name}: brak Architektury ${point.net}`);
    }
  }
  // 66e: zamki otworów — ten sam zapis co `Wall.lockRule`, ale tu bez pobłażania.
  for (const wall of template.walls) {
    if (wall.lockRule === null) continue;
    const where = wall.key ?? `${wall.kind} ${JSON.stringify(wall.points[0])}`;
    lockProblems(wall.lockRule, `zamek ${where}`, problems);
  }
  for (const zone of template.zones) {
    if (readCpredTemplateZone(zone.system).entryIds.length === 0) {
      problems.push(`strefa ${zone.key ?? zone.name ?? '?'}: brak wpisu kompendium`);
    }
  }
  for (const container of template.containers) {
    const where = `pojemnik ${container.name}`;
    const raw = isObj(container.system) ? container.system : {};
    if (raw.lock !== undefined && !isContainerLock(raw.lock)) problems.push(`${where}: zły stan`);
    lockProblems(raw, where, problems);
    const spec = readCpredTemplateContainer(raw);
    if (spec.keyHolder !== null && !figures.has(spec.keyHolder)) {
      problems.push(`${where}: brak figury ${spec.keyHolder} z kluczem`);
    }
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    if (rawItems.length !== spec.items.length) problems.push(`${where}: nieczytelna rzecz`);
  }
  return problems;
}

/** Zamek bez pobłażania: PT ze skali Testu, znane Umiejętności (puste — domyślne). */
function lockProblems(raw: unknown, where: string, problems: string[]): void {
  const input = isObj(raw) ? raw : {};
  if (
    input.dv !== undefined &&
    (!Number.isInteger(input.dv) ||
      (input.dv as number) < CHECK_CALL_DV_MIN ||
      (input.dv as number) > CHECK_CALL_DV_MAX)
  ) {
    problems.push(`${where}: PT poza skalą`);
  }
  if (input.skills !== undefined) {
    if (!Array.isArray(input.skills) || !input.skills.every(isCpredLockSkill)) {
      problems.push(`${where}: nieznana Umiejętność`);
    }
  }
}
