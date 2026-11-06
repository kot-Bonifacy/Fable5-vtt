import type { FastifyBaseLogger } from 'fastify';
import {
  cpredFleetRowLevel,
  cpredGuessFleetVehicle,
  cpredVehicleFromCatalog,
  cpredVehicleHpAfterUpgrades,
  cpredVehicleLayout,
  cpredVehicleSize,
  cpredVehicleUpgradesProblem,
  isVehicleEntry,
  isVehicleLayoutId,
  parseCharacterData,
  readCpredFleet,
  readCpredVehicle,
  readVehicleName,
  readVehicleSize,
  type CompendiumRegistry,
  type CpredFleetRow,
  type CpredRegistry,
  type CpredVehicleStats,
  type CpredVehicleUpgradeRow,
  type VehicleEntry,
  type VehicleView,
} from '@vtt/shared';
import type { PrismaClient } from './db.js';
import type { Prisma, Vehicle } from './generated/prisma/client.js';
import { fetchCustomEntries } from './realtime/compendium.js';
import { RealtimeError } from './realtime/registry.js';

/**
 * Pojazdy w bazie (etap 65a) — bez gniazd, żeby z tej samej logiki korzystały
 * zdarzenia, start serwera (stare wiersze Taboru) i wczytanie kopii.
 *
 * **Tabor Rodziny jest źródłem, pojazd — odbiciem.** Wiersz „Pojazd” na karcie
 * Nomady ma swój `Vehicle` (`system.fleetRowId`), a wiersz „Ulepszenie” wpisuje
 * się w `system.upgrades` wskazanego pojazdu z `fleetRowId`. Zmienia je wyłącznie
 * karta: zniknięcie wiersza zabiera pojazd albo ulepszenie, a okno MG zostawia
 * wiersze z Taboru tam, gdzie są (`cpredVehiclePatch`).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export function toVehicleView(row: Vehicle): VehicleView {
  return {
    id: row.id,
    ownerCharacterId: row.ownerCharacterId,
    name: row.name,
    imageUrl: row.imageUrl,
    widthSq: row.widthSq,
    lengthSq: row.lengthSq,
    layout: isVehicleLayoutId(row.layout) ? row.layout : 'car-4',
    system: readCpredVehicle(row.system),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Pojazdy z katalogu tej kampanii: pliki plus wpisy MG (wpis MG wygrywa na id). */
export async function vehicleCatalog(
  prisma: PrismaClient,
  compendium: CompendiumRegistry,
  campaignId: string,
): Promise<VehicleEntry[]> {
  const byId = new Map<string, VehicleEntry>();
  for (const entry of compendium.entries) if (isVehicleEntry(entry)) byId.set(entry.id, entry);
  for (const entry of await fetchCustomEntries(prisma, campaignId)) {
    if (isVehicleEntry(entry)) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

/** Kolumny bryły z liczb systemu — rozmiar i układ idą za fotelami po ulepszeniach. */
export function vehicleBodyColumns(stats: CpredVehicleStats): {
  widthSq: number;
  lengthSq: number;
  layout: string;
} {
  return { ...cpredVehicleSize(stats), layout: cpredVehicleLayout(stats) };
}

/**
 * Układ i bryła po zmianie foteli albo listy ulepszeń (03.11, etap 68): fotele
 * z Ulepszenia foteli zmieniają układ i bryłę, chyba że łata wybrała je sama
 * (`chosen`). Rozmiar idzie za układem tylko wtedy, gdy układ się zmienia.
 */
export function vehicleSeatColumns(
  current: Pick<Vehicle, 'layout'>,
  before: CpredVehicleStats,
  after: CpredVehicleStats,
  chosen: { layout?: boolean; size?: boolean } = {},
): Partial<Pick<Vehicle, 'layout' | 'widthSq' | 'lengthSq'>> {
  const seatsChanged =
    before.seats !== after.seats ||
    JSON.stringify(before.upgrades) !== JSON.stringify(after.upgrades);
  if (!seatsChanged) return {};
  const body = vehicleBodyColumns(after);
  return {
    ...(chosen.layout ? {} : { layout: body.layout }),
    ...(!chosen.size && body.layout !== current.layout
      ? { widthSq: body.widthSq, lengthSq: body.lengthSq }
      : {}),
  };
}

export async function createVehicle(
  db: Db,
  campaignId: string,
  ownerCharacterId: string | null,
  name: string,
  stats: CpredVehicleStats,
  /** Wygląd modelu (etap 67, `VehicleEntry.art`); brak — domyślny wg bryły. */
  imageUrl: string | null = null,
): Promise<Vehicle> {
  return db.vehicle.create({
    data: {
      campaignId,
      ownerCharacterId,
      name,
      imageUrl,
      ...vehicleBodyColumns(stats),
      system: JSON.stringify(stats),
    },
  });
}

const GUESSED_NOTE =
  'Rodzaj zgadnięty z nazwy starego wiersza Taboru (etap 65a) — MG, sprawdź i popraw w panelu „Pojazdy”.';

/**
 * Wiersze Taboru gotowe do zapisu: kategoria z tego, co wybrano, odnośniki tylko
 * do rzeczy, które istnieją, a każdy wiersz „Pojazd” z własnym `Vehicle`
 * (brakujące powstają tu). Odmawia ulepszenia, którego pojazd nie przyjmie.
 * `created` i `rebased` — pojazdy założone i przebudowane teraz, do rozesłania
 * po zapisie karty.
 */
export async function prepareFleet(
  db: Db,
  catalog: readonly VehicleEntry[],
  campaignId: string,
  characterId: string,
  input: readonly CpredFleetRow[],
): Promise<{ rows: CpredFleetRow[]; created: Vehicle[]; rebased: string[] }> {
  const byId = new Map(catalog.map((entry) => [entry.id, entry] as const));
  const owned = await db.vehicle.findMany({ where: { ownerCharacterId: characterId } });
  const ownedById = new Map(owned.map((row) => [row.id, row] as const));
  const created: Vehicle[] = [];
  const rows: CpredFleetRow[] = [];

  for (const source of input) {
    const row: CpredFleetRow = { ...source };
    if (row.kind === 'vehicle') {
      if (row.compendiumId && !byId.has(row.compendiumId)) delete row.compendiumId;
      const mine = row.vehicleId ? ownedById.get(row.vehicleId) : undefined;
      if (!mine || readCpredVehicle(mine.system).fleetRowId !== row.id) delete row.vehicleId;
      // Autozapis karty potrafi wysłać drugą łatę, zanim przyszło echo pierwszej
      // (z `vehicleId`) — wtedy pojazd tego wiersza już jest i wraca do niego.
      if (!row.vehicleId) {
        const existing = owned.find(
          (vehicle) => readCpredVehicle(vehicle.system).fleetRowId === row.id,
        );
        if (existing) row.vehicleId = existing.id;
      }
    } else {
      if (row.vehicleId && !ownedById.has(row.vehicleId)) delete row.vehicleId;
    }
    row.level = cpredFleetRowLevel(row, (id) => byId.get(id) ?? null);
    rows.push(row);
  }

  // 1. Plan bez zapisu: inny pojazd z katalogu w tym samym wierszu daje nowe
  // liczby bazowe (PUK pełne), ulepszenia zostają — to dalej ten sam wpis.
  // Nazwa idzie za pojazdem, póki gracz jej nie zmienił (jest nazwą starego wpisu).
  const rebased = new Map<string, CpredVehicleStats>();
  const renamed = new Map<string, string>();
  for (const row of rows) {
    if (row.kind !== 'vehicle' || !row.vehicleId || !row.compendiumId) continue;
    const vehicle = ownedById.get(row.vehicleId)!;
    const stats = readCpredVehicle(vehicle.system);
    if (row.compendiumId === stats.catalogId) continue;
    const entry = byId.get(row.compendiumId) ?? null;
    const formerName = stats.catalogId ? byId.get(stats.catalogId)?.name : undefined;
    if (entry && vehicle.name === formerName) renamed.set(vehicle.id, entry.name);
    const fresh = cpredVehicleFromCatalog(entry);
    rebased.set(
      row.vehicleId,
      readCpredVehicle({
        ...fresh,
        upgrades: stats.upgrades,
        fleetRowId: row.id,
        hp: Number.MAX_SAFE_INTEGER,
      }),
    );
  }

  // 2. Każdy pojazd z ulepszeniami z Taboru, jakie będzie miał po zapisie — ta
  // sama reguła, co w oknie MG, inaczej Nomada wstawiłby rakiety w motocykl.
  // Przed zapisem: odmowa nie może zostawić założonych pojazdów.
  for (const vehicle of ownedById.values()) {
    const stats = rebased.get(vehicle.id) ?? readCpredVehicle(vehicle.system);
    const upgrades = withFleetUpgrades(stats.upgrades, vehicle.id, rows);
    const problem = cpredVehicleUpgradesProblem(stats.kind, upgrades);
    if (problem) throw new RealtimeError(problem);
  }

  // 3. Zapis: przebudowane i nowe pojazdy.
  for (const [vehicleId, next] of rebased) {
    const name = renamed.get(vehicleId);
    await db.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...vehicleBodyColumns(next),
        system: JSON.stringify(next),
        ...(name ? { name } : {}),
      },
    });
  }
  for (const row of rows) {
    if (row.kind !== 'vehicle' || row.vehicleId) continue;
    const chosen = row.compendiumId ? (byId.get(row.compendiumId) ?? null) : null;
    const guess = chosen ? null : cpredGuessFleetVehicle(row.name, row.level, catalog);
    const entry = chosen ?? guess?.entry ?? null;
    const base = cpredVehicleFromCatalog(entry);
    const stats = readCpredVehicle({
      ...base,
      ...(guess && !entry ? { kind: guess.kind } : {}),
      fleetRowId: row.id,
      notes: guess?.guessed ? GUESSED_NOTE : '',
    });
    const vehicle = await createVehicle(
      db,
      campaignId,
      characterId,
      row.name,
      stats,
      entry?.art ?? null,
    );
    created.push(vehicle);
    row.vehicleId = vehicle.id;
    // Zgadnięty pojazd z progu wyższego niż kategoria starego wiersza nie wpisuje
    // się w wiersz — inaczej następna łata karty podniosłaby kategorię
    // i odmówiła Nomadzie zapisu czegoś zupełnie innego.
    if (entry && !row.compendiumId && (entry.motoLevel ?? 1) <= row.level) {
      row.compendiumId = entry.id;
    }
  }
  return { rows, created, rebased: [...rebased.keys()] };
}

function withFleetUpgrades(
  upgrades: readonly CpredVehicleUpgradeRow[],
  vehicleId: string,
  rows: readonly CpredFleetRow[],
): CpredVehicleUpgradeRow[] {
  const own = upgrades.filter((row) => !row.fleetRowId);
  const fromFleet = rows
    .filter((row) => row.kind === 'upgrade' && row.vehicleId === vehicleId && row.upgradeId)
    .map((row): CpredVehicleUpgradeRow => ({
      id: `fleet-${row.id}`,
      upgradeId: row.upgradeId as CpredVehicleUpgradeRow['upgradeId'],
      fleetRowId: row.id,
      notes: row.notes,
    }));
  return [...own, ...fromFleet];
}

/**
 * Po zapisie karty: pojazdy wierszy, których już nie ma, schodzą, a ulepszenia
 * z Taboru dopisują się do swoich pojazdów. Zwraca, co rozesłać.
 */
export async function syncFleetVehicles(
  db: Db,
  characterId: string,
  rows: readonly CpredFleetRow[],
): Promise<{ updated: Vehicle[]; deleted: string[] }> {
  const owned = await db.vehicle.findMany({ where: { ownerCharacterId: characterId } });
  const vehicleOfRow = new Map(
    rows.filter((row) => row.kind === 'vehicle').map((row) => [row.id, row.vehicleId] as const),
  );
  const updated: Vehicle[] = [];
  const deleted: string[] = [];
  for (const vehicle of owned) {
    const stats = readCpredVehicle(vehicle.system);
    // Wiersza nie ma albo wskazuje inny pojazd (dubel z wyścigu zapisów).
    if (stats.fleetRowId && vehicleOfRow.get(stats.fleetRowId) !== vehicle.id) {
      await db.vehicle.delete({ where: { id: vehicle.id } });
      deleted.push(vehicle.id);
      continue;
    }
    const upgrades = withFleetUpgrades(stats.upgrades, vehicle.id, rows);
    if (JSON.stringify(upgrades) === JSON.stringify(stats.upgrades)) continue;
    // Wzmocniona konstrukcja z Taboru dokłada 20 także do bieżących PUK (MG 03.11).
    const hp = cpredVehicleHpAfterUpgrades(stats.hp, stats.upgrades, upgrades);
    const next = readCpredVehicle({ ...stats, hp, upgrades });
    updated.push(
      await db.vehicle.update({
        where: { id: vehicle.id },
        data: { ...vehicleBodyColumns(next), system: JSON.stringify(next) },
      }),
    );
  }
  return { updated, deleted };
}

/** Czy Tabor tej karty ma wiersz „Pojazd” bez pojazdu (stara karta albo plik sprzed 65a). */
export function fleetNeedsVehicles(rows: readonly CpredFleetRow[]): boolean {
  return rows.some((row) => row.kind === 'vehicle' && !row.vehicleId);
}

/**
 * Jedna karta: Tabor przygotowany, karta zapisana, pojazdy zsynchronizowane.
 * Droga startu serwera i wczytania kopii — bez rozsyłania, bo nikt jeszcze
 * nie patrzy.
 */
export async function settleFleetVehicles(
  prisma: PrismaClient,
  catalog: readonly VehicleEntry[],
  registry: CpredRegistry,
  campaignId: string,
  characterId: string,
): Promise<number> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });
  if (!character) return 0;
  const data = parseCharacterData(character.data, registry);
  const fleet = readCpredFleet(data.fleet);
  if (!fleetNeedsVehicles(fleet)) return 0;
  return prisma.$transaction(async (tx) => {
    let prepared: Awaited<ReturnType<typeof prepareFleet>>;
    try {
      prepared = await prepareFleet(tx, catalog, campaignId, characterId, fleet);
    } catch {
      // Ulepszenie, którego pojazd nie przyjmie, nie zatrzymuje startu: wiersze
      // ulepszeń zostają bez pojazdu, pojazdy i tak powstają.
      prepared = await prepareFleet(
        tx,
        catalog,
        campaignId,
        characterId,
        fleet.map((row) => (row.kind === 'upgrade' ? { ...row, vehicleId: undefined } : row)),
      );
    }
    await tx.character.update({
      where: { id: characterId },
      data: { data: JSON.stringify({ ...data, fleet: prepared.rows }) },
    });
    await syncFleetVehicles(tx, characterId, prepared.rows);
    return prepared.created.length;
  });
}

/**
 * Start serwera: wiersze „Pojazd” Taboru sprzed 65a dostają prawdziwe pojazdy
 * (decyzja MG 10 z 30.10). Raz — wiersz z `vehicleId` nie wraca tu nigdy.
 */
export async function backfillFleetVehicles(
  prisma: PrismaClient,
  compendium: CompendiumRegistry,
  registry: CpredRegistry,
  log: FastifyBaseLogger,
): Promise<void> {
  const candidates = await prisma.character.findMany({
    where: { data: { contains: '"fleet"' } },
    select: { id: true, campaignId: true, data: true },
  });
  const catalogs = new Map<string, VehicleEntry[]>();
  let made = 0;
  for (const character of candidates) {
    const fleet = readCpredFleet(parseCharacterData(character.data, registry).fleet);
    if (!fleetNeedsVehicles(fleet)) continue;
    let catalog = catalogs.get(character.campaignId);
    if (!catalog) {
      catalog = await vehicleCatalog(prisma, compendium, character.campaignId);
      catalogs.set(character.campaignId, catalog);
    }
    made += await settleFleetVehicles(
      prisma,
      catalog,
      registry,
      character.campaignId,
      character.id,
    );
  }
  if (made > 0) log.info({ vehicles: made }, 'fleet vehicles created from old Moto rows');
}

// ───────────────────────── Kopie (umowa `kopie`) ─────────────────────────

/** Wiersz pojazdu w paczce: kolumny wypisane ręką, `system` jako prawdziwy JSON. */
export interface VehicleArchiveRow {
  id: string;
  ownerCharacterId: string | null;
  name: string;
  imageUrl: string | null;
  widthSq: number;
  lengthSq: number;
  layout: string;
  system: unknown;
  createdAt: string;
}

export async function exportVehicles(
  prisma: PrismaClient,
  where: Prisma.VehicleWhereInput,
): Promise<VehicleArchiveRow[]> {
  const rows = await prisma.vehicle.findMany({ where, orderBy: { createdAt: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    ownerCharacterId: row.ownerCharacterId,
    name: row.name,
    imageUrl: row.imageUrl,
    widthSq: row.widthSq,
    lengthSq: row.lengthSq,
    layout: row.layout,
    system: readCpredVehicle(row.system),
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Pojazdy z paczki jako nowe wiersze. `ids` mówi, jakie id dostaje pojazd
 * z pliku (kampania nadaje je z góry, karta — tu), `owner` — czyja karta go ma
 * po wczytaniu. Zwraca mapę stare id → nowe.
 */
export async function importVehicles(
  db: Db,
  campaignId: string,
  raw: unknown,
  owner: (row: Record<string, unknown>) => string | null,
  ids: (oldId: string) => string | undefined = () => undefined,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const stats = readCpredVehicle(row.system);
    const name = readVehicleNameOr(row.name);
    const id = typeof row.id === 'string' ? ids(row.id) : undefined;
    const created = await db.vehicle.create({
      data: {
        ...(id ? { id } : {}),
        campaignId,
        ownerCharacterId: owner(row),
        name,
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
        widthSq: readVehicleSize(row.widthSq) ?? vehicleBodyColumns(stats).widthSq,
        lengthSq: readVehicleSize(row.lengthSq) ?? vehicleBodyColumns(stats).lengthSq,
        layout: isVehicleLayoutId(row.layout) ? row.layout : vehicleBodyColumns(stats).layout,
        system: JSON.stringify(stats),
        ...(typeof row.createdAt === 'string' ? { createdAt: new Date(row.createdAt) } : {}),
      },
    });
    if (typeof row.id === 'string') map.set(row.id, created.id);
  }
  return map;
}

function readVehicleNameOr(raw: unknown): string {
  return readVehicleName(raw) ?? 'Pojazd';
}

/** Tabor karty po wczytaniu: odnośniki do pojazdów po nowych id, nieznane schodzą. */
export function remapFleetVehicles(
  rows: readonly CpredFleetRow[],
  map: ReadonlyMap<string, string>,
): CpredFleetRow[] {
  return rows.map((row) => {
    if (!row.vehicleId) return row;
    const next = map.get(row.vehicleId);
    const { vehicleId: _old, ...rest } = row;
    return next ? { ...rest, vehicleId: next } : rest;
  });
}
