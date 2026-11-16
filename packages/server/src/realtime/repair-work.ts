import type {
  ChatMessageView,
  CompendiumEntry,
  CpredCharacterData,
  CpredItemUpgradeTargetView,
  CpredUpgradeSubject,
  CpredWorkItemList,
  CpredRepairTargetsAck,
  CpredRepairTargetsPayload,
  CpredRepairTargetView,
  CpredRollPlan,
  CpredRollRequest,
  CpredTechUpgradeOption,
  CpredWorkPlan,
  CpredWorkTerms,
  RollClockPayload,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ARMOR_REPAIR_SKILL_ID,
  CPRED_TECH_VEHICLE_UPGRADE_TASK,
  CPRED_VEHICLE_DAMAGE,
  CPRED_WORK_ITEM_LISTS,
  ROLE_GM,
  ITEM_ROWS_MAX,
  cpredApplyItemUpgrade,
  cpredArmorNeedsRepair,
  cpredArmorRepaired,
  cpredArmorRepairTask,
  cpredEntryTechSkillId,
  cpredFabricateMaterialsCost,
  cpredFabricateProblem,
  cpredFabricatedRow,
  cpredFabricationWorkTask,
  cpredFailedWorkMinutes,
  cpredIsBareHandsRow,
  cpredItemTechSkillId,
  cpredItemUpgrade,
  cpredTechItemUpgradeProblem,
  cpredTechUpgradesForTarget,
  cpredUpgradeMaterialsCost,
  entryPrice,
  isWeaponEntry,
  resolveWeapon,
  shopTierOf,
  cpredSheetFabrication,
  cpredTechVehicleUpgradeProblem,
  cpredVehicleDamage,
  cpredVehiclePatch,
  cpredVehicleRepaired,
  cpredVehicleRepairTask,
  cpredVehicleTechSkillId,
  cpredVehicleUpgrade,
  cpredVehicleUpgradeEntry,
  cpredVehicleUpgradeEntryId,
  cpredVehicleUpgradesFor,
  formatEddies,
  formatWorkDuration,
  isCpredRepairTarget,
  mergeCharacterData,
  parseCharacterData,
  readCpredVehicle,
  type CpredVehicleStats,
  type CpredVehicleUpgradeDefinition,
} from '@vtt/shared';
import type { Character, Vehicle } from '../generated/prisma/client.js';
import { vehicleSeatColumns } from '../vehicles.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, broadcastRedactedChatMessage, toChatMessageView } from './chat-io.js';
import { refuseInCombat } from './combat-lock.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, nextRowId } from './economy.js';
import { moveGameClock } from './gametime.js';
import { withCampaignLock } from './merchant.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { campaignShopTier, campaignShopTierOverrides, requireUnlockedTier } from './shop.js';
import { requireTeamCard, teamCardsWhere } from './team-cards.js';
import { emitTokensOfCharacter } from './tokens.js';
import { emitVehicleUpsert } from './vehicles.js';

/**
 * Zwykła naprawa i montaż ulepszenia auta Technikiem (etap 71c2, bramka 71:
 * G10, G11). Test idzie przez `character:roll` — kubek, Szczęście, karta na
 * czacie — a ten moduł robi trzy rzeczy, których planer w `shared` zrobić nie
 * może: czyta **cel** (cudza karta drużyny, auto), wpisuje warunki pracy (PT,
 * czas, cena surowców) i po kościach zapisuje skutek.
 *
 * Czas pracy nie przesuwa zegara sam: karta rzutu niesie propozycję
 * (`RollResult.clock`), a MG przesuwa zegar przyciskiem (`roll:clock`) — ta
 * sama zasada, którą bramka przyjęła dla czasu zabiegu i Pracy Twórcy (71d).
 */

/** Uszkodzenia auta, jak je czyta karta i lista robót. */
function vehicleState(stats: CpredVehicleStats): string {
  return cpredVehicleRepairTask(stats)
    ? CPRED_VEHICLE_DAMAGE[cpredVehicleDamage(stats)].label
    : 'całe';
}

/** Cena surowców na ulepszenie: wpis Kompendium kampanii, a bez niego — cennik z etapu 68. */
async function upgradeMaterialsCost(
  deps: RealtimeDeps,
  campaignId: string,
  definition: CpredVehicleUpgradeDefinition,
): Promise<number> {
  const entry = await campaignEntry(deps, campaignId, cpredVehicleUpgradeEntryId(definition.id));
  const cost = entry?.cost ?? cpredVehicleUpgradeEntry(definition).cost;
  return typeof cost === 'number' && cost > 0 ? cost : 0;
}

/** Auto drużyny — gracz cudzego (spoza drużyny) nie widzi, jak nieistniejącego. */
async function requireTeamVehicle(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  vehicleId: string,
): Promise<{ vehicle: Vehicle; owner: Character | null }> {
  const vehicle = await deps.ctx.prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.campaignId !== campaignId) throw new RealtimeError('VEHICLE_NOT_FOUND');
  if (!vehicle.ownerCharacterId) {
    if (user.role !== ROLE_GM) throw new RealtimeError('VEHICLE_NOT_FOUND');
    return { vehicle, owner: null };
  }
  const owner = await requireTeamCard(
    deps.ctx.prisma,
    campaignId,
    user,
    vehicle.ownerCharacterId,
  ).catch(() => {
    throw new RealtimeError('VEHICLE_NOT_FOUND');
  });
  return { vehicle, owner };
}

/** Wiersz przedmiotu z karty jako podmiot Ulepszania, z wpisem Kompendium (pasmo ceny). */
async function itemSubject(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  list: CpredWorkItemList,
  rowId: string,
): Promise<{ subject: CpredUpgradeSubject; entry: CompendiumEntry | undefined } | null> {
  const row = (data[list] as readonly { id: string; compendiumId?: string }[]).find(
    (entry) => entry.id === rowId,
  );
  if (!row) return null;
  const entry = row.compendiumId
    ? await campaignEntry(deps, campaignId, row.compendiumId)
    : undefined;
  switch (list) {
    case 'weapons': {
      const weapon = data.weapons.find((entry) => entry.id === rowId)!;
      const resolved =
        entry && isWeaponEntry(entry)
          ? resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById })
          : null;
      return { subject: { kind: 'weapon', row: weapon, resolved }, entry };
    }
    case 'armor':
      return { subject: { kind: 'armor', row: data.armor.find((r) => r.id === rowId)! }, entry };
    case 'gear':
      return {
        subject: { kind: 'gear', row: data.gear.find((r) => r.id === rowId)!, entry },
        entry,
      };
    case 'cyberware':
      return {
        subject: { kind: 'cyberware', row: data.cyberware.find((r) => r.id === rowId)! },
        entry,
      };
  }
}

/** „Zgrzyt 9 (Kord) — Dodatkowe gniazdo” — nazwa celu Ulepszania na karcie rzutu. */
function itemUpgradeName(rowName: string, ownerName: string, upgradeId: string): string {
  return `${rowName} (${ownerName}) — ${cpredItemUpgrade(upgradeId)?.name ?? upgradeId}`;
}

/**
 * Wypełnia żądanie naprawy albo montażu tym, czego klient nie ma prawa podać:
 * Umiejętność z celu, PT i czas z celu, cena surowców z Kompendium kampanii.
 */
export async function resolveWorkRequest(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  request: CpredRollRequest,
): Promise<CpredRollRequest> {
  const target = request.repairTarget;
  if (!isCpredRepairTarget(target)) throw new RealtimeError('BAD_REQUEST');

  // Etap 71d2 (G13): Ulepszanie przedmiotu z karty drużyny.
  if (target.kind === 'item') {
    if (request.kind !== 'itemUpgrade') throw new RealtimeError('BAD_REQUEST');
    const upgradeId = String(request.itemUpgradeId ?? '');
    const card = await requireTeamCard(deps.ctx.prisma, campaignId, user, target.characterId);
    const found = await itemSubject(
      deps,
      campaignId,
      parseCharacterData(card.data, deps.ctx.cpred),
      target.list,
      target.rowId,
    );
    if (!found) throw new RealtimeError('UNKNOWN_ITEM');
    // Poziom Ulepszania karty sprawdza planer (`NO_UPGRADE_SPECIALTY`).
    const problem = cpredTechItemUpgradeProblem(
      Number.MAX_SAFE_INTEGER,
      upgradeId,
      found.subject,
      found.entry,
    );
    if (problem) throw new RealtimeError(problem);
    const entry = found.entry!;
    const work: CpredWorkTerms = {
      ...cpredFabricationWorkTask(entry.costCategory!, entryPrice(entry)),
      targetName: itemUpgradeName(found.subject.row.name, card.name, upgradeId),
      cost: cpredUpgradeMaterialsCost(entry) ?? 0,
    };
    return {
      ...request,
      repairSkillId: cpredItemTechSkillId(found.subject),
      itemUpgradeId: upgradeId,
      work,
    };
  }

  // Etap 71d2 (G13): Wytwarzanie z wpisu Kompendium kampanii.
  if (target.kind === 'entry') {
    if (request.kind !== 'fabricate') throw new RealtimeError('BAD_REQUEST');
    const entry = await campaignEntry(deps, campaignId, target.entryId);
    if (!entry) throw new RealtimeError('ENTRY_NOT_FOUND');
    const problem = cpredFabricateProblem(Number.MAX_SAFE_INTEGER, entry);
    if (problem) throw new RealtimeError(problem);
    // Decyzja MG z bramki (D1): żadna postać nie sięga ponad poziom sklepu
    // kampanii — Wytwarzanie też nie, jak zakup.
    if (user.role !== ROLE_GM) {
      const overrides = await campaignShopTierOverrides(deps.ctx.prisma, campaignId);
      requireUnlockedTier(
        shopTierOf(entry, { overrides }),
        await campaignShopTier(deps.ctx.prisma, campaignId),
      );
    }
    const work: CpredWorkTerms = {
      ...cpredFabricationWorkTask(entry.costCategory!, entryPrice(entry)),
      targetName: entry.name,
      cost: cpredFabricateMaterialsCost(entry) ?? 0,
    };
    return { ...request, repairSkillId: cpredEntryTechSkillId(entry), work };
  }

  if (target.kind === 'armor') {
    if (request.kind !== 'repair') throw new RealtimeError('BAD_REQUEST');
    const card = await requireTeamCard(deps.ctx.prisma, campaignId, user, target.characterId);
    const row = parseCharacterData(card.data, deps.ctx.cpred).armor.find(
      (entry) => entry.id === target.armorRowId,
    );
    if (!row) throw new RealtimeError('UNKNOWN_ARMOR');
    if (!cpredArmorNeedsRepair(row)) throw new RealtimeError('NOTHING_TO_REPAIR');
    const entry = row.compendiumId
      ? await campaignEntry(deps, campaignId, row.compendiumId)
      : undefined;
    const task = cpredArmorRepairTask(entry?.costCategory ?? null, row.upgrade);
    const work: CpredWorkTerms = { ...task, targetName: `${row.name} (${card.name})` };
    return { ...request, repairSkillId: CPRED_ARMOR_REPAIR_SKILL_ID, work };
  }

  if (request.kind !== 'repair' && request.kind !== 'vehicleUpgrade') {
    throw new RealtimeError('BAD_REQUEST');
  }
  const { vehicle } = await requireTeamVehicle(deps, campaignId, user, target.vehicleId);
  const stats = readCpredVehicle(vehicle.system);
  const repairSkillId = cpredVehicleTechSkillId(stats.kind);
  if (request.kind === 'repair') {
    const task = cpredVehicleRepairTask(stats);
    if (!task) throw new RealtimeError('NOTHING_TO_REPAIR');
    const work: CpredWorkTerms = { dv: task.dv, minutes: task.minutes, targetName: vehicle.name };
    return { ...request, repairSkillId, work };
  }
  // Ulepszanie: reguły montażu sprawdza się tu, bo planer nie widzi auta.
  // Poziom Ulepszania karty sprawdza planer (`NO_UPGRADE_SPECIALTY`).
  const definition = cpredVehicleUpgrade(String(request.vehicleUpgradeId ?? ''));
  if (!definition) throw new RealtimeError('UNKNOWN_UPGRADE');
  const problem = cpredTechVehicleUpgradeProblem(Number.MAX_SAFE_INTEGER, stats, definition.id);
  if (problem) throw new RealtimeError(problem);
  const work: CpredWorkTerms = {
    ...CPRED_TECH_VEHICLE_UPGRADE_TASK,
    targetName: `${vehicle.name} — ${definition.name}`,
    cost: await upgradeMaterialsCost(deps, campaignId, definition),
  };
  return { ...request, repairSkillId, vehicleUpgradeId: definition.id, work };
}

/**
 * Przed kośćmi: naprawa trwa godziny, więc nie w walce (w walce jest
 * Prowizorka), a surowce na ulepszenie trzeba mieć, zanim praca ruszy —
 * płaci się dopiero przy sukcesie (s. 148: „nie odnoszą żadnych uszkodzeń”).
 */
export async function requireWorkStart(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  plan: CpredRollPlan,
  repairer: Character,
): Promise<void> {
  if (!plan.work) return;
  if (!plan.work.terms) throw new RealtimeError('BAD_REQUEST');
  await refuseInCombat(deps.ctx.prisma, campaignId, user);
  const cost = plan.work.terms.cost ?? 0;
  if (cost > 0 && parseCharacterData(repairer.data, deps.ctx.cpred).eddies < cost) {
    throw new RealtimeError('NOT_ENOUGH_EDDIES');
  }
}

async function repairArmor(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  armorRowId: string,
): Promise<boolean> {
  return withCampaignLock(campaignId, async () => {
    const card = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
    if (!card) return false;
    const data = parseCharacterData(card.data, deps.ctx.cpred);
    const row = data.armor.find((entry) => entry.id === armorRowId);
    if (!row || !cpredArmorNeedsRepair(row)) return false;
    const saved = await deps.ctx.prisma.character.update({
      where: { id: card.id },
      data: {
        data: JSON.stringify(
          mergeCharacterData(data, {
            armor: data.armor.map((entry) =>
              entry.id === row.id ? cpredArmorRepaired(entry) : entry,
            ),
          }),
        ),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);
    return true;
  });
}

async function saveVehicle(
  deps: RealtimeDeps,
  campaignId: string,
  vehicle: Vehicle,
  before: CpredVehicleStats,
  after: CpredVehicleStats,
): Promise<void> {
  const row = await deps.ctx.prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      system: JSON.stringify(after),
      ...vehicleSeatColumns(vehicle, before, after),
    },
  });
  await emitVehicleUpsert(deps, campaignId, row);
}

async function repairVehicle(
  deps: RealtimeDeps,
  campaignId: string,
  vehicleId: string,
): Promise<boolean> {
  return withCampaignLock(campaignId, async () => {
    const vehicle = await deps.ctx.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return false;
    const stats = readCpredVehicle(vehicle.system);
    if (!cpredVehicleRepairTask(stats)) return false;
    await saveVehicle(deps, campaignId, vehicle, stats, cpredVehicleRepaired(stats));
    return true;
  });
}

/** Udany montaż: surowce schodzą z portfela Technika, ulepszenie staje w aucie ze stemplem. */
async function installUpgrade(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  repairerId: string,
  vehicleId: string,
  upgradeId: string,
  cost: number,
): Promise<'installed' | 'NOT_ENOUGH_EDDIES' | 'GONE'> {
  return withCampaignLock(campaignId, async () => {
    const vehicle = await deps.ctx.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    const card = await deps.ctx.prisma.character.findUnique({ where: { id: repairerId } });
    const definition = cpredVehicleUpgrade(upgradeId);
    if (!vehicle || !card || !definition) return 'GONE';
    const stats = readCpredVehicle(vehicle.system);
    const data = parseCharacterData(card.data, deps.ctx.cpred);
    const level = cpredSheetFabrication(data, deps.ctx.cpred).upgrade;
    if (cpredTechVehicleUpgradeProblem(level, stats, upgradeId)) return 'GONE';
    if (data.eddies < cost) return 'NOT_ENOUGH_EDDIES';
    const result = cpredVehiclePatch(stats, {
      upgrades: [
        ...stats.upgrades.filter((row) => !row.fleetRowId),
        { id: nextRowId(), upgradeId, techUpgrade: true, notes: `montaż: ${card.name}` },
      ],
    });
    if (!result.ok) return 'GONE';
    if (cost > 0) {
      await applyBalance(
        deps,
        campaignId,
        card,
        data,
        {
          kind: 'purchase',
          amount: -cost,
          label: `Surowce: ${definition.name} — ${vehicle.name}`,
        },
        user.id,
      );
    }
    await saveVehicle(deps, campaignId, vehicle, stats, result.stats);
    return 'installed';
  });
}

/** Zapisuje kartę i rozsyła ją razem z figurami — jak po naprawie pancerza. */
async function saveCard(
  deps: RealtimeDeps,
  campaignId: string,
  card: Character,
  data: CpredCharacterData,
): Promise<void> {
  const saved = await deps.ctx.prisma.character.update({
    where: { id: card.id },
    data: { data: JSON.stringify(data) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
}

/**
 * Surowce z portfela Technika i zapis karty, na której coś przybyło, jednym
 * ruchem: gdy to ta sama karta, rzecz i opłata idą jednym zapisem
 * (`applyBalance` zapisuje kartę, którą dostaje — jak zakup).
 */
async function payAndSave(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  repairer: Character,
  repairerData: CpredCharacterData,
  changed: { card: Character; data: CpredCharacterData },
  cost: number,
  label: string,
): Promise<void> {
  const same = changed.card.id === repairer.id;
  if (!same) await saveCard(deps, campaignId, changed.card, changed.data);
  const wallet = same ? changed.data : repairerData;
  if (cost > 0) {
    await applyBalance(
      deps,
      campaignId,
      repairer,
      wallet,
      { kind: 'purchase', amount: -cost, label },
      user.id,
    );
  } else if (same) {
    await saveCard(deps, campaignId, repairer, wallet);
  }
}

const WORK_CLOCK_LABELS: Record<CpredWorkPlan['task'], string> = {
  repair: 'Naprawa',
  vehicleUpgrade: 'Ulepszanie',
  itemUpgrade: 'Ulepszanie',
  fabricate: 'Wytwarzanie',
};

type WorkSettled = 'done' | 'NOT_ENOUGH_EDDIES' | 'TOO_MANY_ROWS' | 'GONE';

/**
 * Udane Ulepszanie (etap 71d2): stempel `cpredApplyItemUpgrade` na wierszu
 * karty drużyny, surowce z portfela Technika. Pod zamkiem kampanii warunki
 * sprawdza się jeszcze raz — między kubkiem a kośćmi ktoś mógł rzecz oddać.
 */
async function upgradeItem(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  repairerId: string,
  target: { characterId: string; list: CpredWorkItemList; rowId: string },
  upgradeId: string,
  cost: number,
  label: string,
): Promise<WorkSettled> {
  return withCampaignLock(campaignId, async () => {
    const card = await deps.ctx.prisma.character.findUnique({ where: { id: target.characterId } });
    const repairer = await deps.ctx.prisma.character.findUnique({ where: { id: repairerId } });
    if (!card || !repairer) return 'GONE';
    const data = parseCharacterData(card.data, deps.ctx.cpred);
    const found = await itemSubject(deps, campaignId, data, target.list, target.rowId);
    if (!found) return 'GONE';
    const repairerData =
      card.id === repairer.id ? data : parseCharacterData(repairer.data, deps.ctx.cpred);
    const level = cpredSheetFabrication(repairerData, deps.ctx.cpred).upgrade;
    if (cpredTechItemUpgradeProblem(level, upgradeId, found.subject, found.entry)) return 'GONE';
    if (repairerData.eddies < cost) return 'NOT_ENOUGH_EDDIES';
    const rows = data[target.list] as readonly { id: string }[];
    const stamped = mergeCharacterData(data, {
      [target.list]: rows.map((row) =>
        row.id === target.rowId
          ? cpredApplyItemUpgrade(row as Parameters<typeof cpredApplyItemUpgrade>[0], upgradeId)
          : row,
      ),
    } as Partial<CpredCharacterData>);
    await payAndSave(
      deps,
      campaignId,
      user,
      repairer,
      repairerData,
      { card, data: stamped },
      cost,
      label,
    );
    return 'done';
  });
}

/**
 * Udane Wytwarzanie (etap 71d2): rzecz z wpisu Kompendium ląduje na karcie
 * Technika tym samym wierszem, co zakup, a surowce schodzą w tym samym zapisie.
 */
async function fabricateItem(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  repairerId: string,
  entryId: string,
  cost: number,
  label: string,
): Promise<WorkSettled> {
  return withCampaignLock(campaignId, async () => {
    const repairer = await deps.ctx.prisma.character.findUnique({ where: { id: repairerId } });
    const entry = await campaignEntry(deps, campaignId, entryId);
    if (!repairer || !entry) return 'GONE';
    const data = parseCharacterData(repairer.data, deps.ctx.cpred);
    if (cpredFabricateProblem(cpredSheetFabrication(data, deps.ctx.cpred).fabricate, entry)) {
      return 'GONE';
    }
    const resolved = isWeaponEntry(entry)
      ? resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById })
      : null;
    const made = cpredFabricatedRow(entry, resolved, nextRowId(), data.armor);
    if (!made) return 'GONE';
    const list = [...(data[made.list] as readonly unknown[]), made.row];
    if (list.length > ITEM_ROWS_MAX) return 'TOO_MANY_ROWS';
    if (data.eddies < cost) return 'NOT_ENOUGH_EDDIES';
    const withItem = mergeCharacterData(data, {
      [made.list]: list,
    } as Partial<CpredCharacterData>);
    await payAndSave(
      deps,
      campaignId,
      user,
      repairer,
      data,
      { card: repairer, data: withItem },
      cost,
      label,
    );
    return 'done';
  });
}

const SETTLED_LABELS: Record<Exclude<WorkSettled, 'done'>, string> = {
  NOT_ENOUGH_EDDIES: 'Zabrakło na surowce',
  TOO_MANY_ROWS: 'Nie ma miejsca na karcie',
  GONE: 'Praca niemożliwa',
};

/**
 * Po kościach: werdykt (ostra nierówność, jak każdy Test z PT), skutek
 * i propozycja zegara — pełen czas po sukcesie, połowa po porażce.
 */
export async function settleWork(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  plan: CpredRollPlan,
  result: RollResult,
  repairer: Character,
): Promise<void> {
  const work = plan.work;
  if (!work?.terms) return;
  const { dv, minutes, targetName, cost = 0 } = work.terms;
  const success = result.total > dv;
  const spent = success ? minutes : cpredFailedWorkMinutes(minutes);
  const upgrade = work.task === 'vehicleUpgrade';
  const materials = `Surowce: ${targetName}`;

  if (!success) {
    result.outcome = {
      success: false,
      label: 'Trzeba zacząć od nowa',
      detail:
        `${result.total} ≤ PT ${dv} · w połowie pracy wychodzi, że trzeba zaczynać od początku` +
        (cost > 0 ? ' (surowce zostają)' : ''),
    };
  } else if (work.target.kind === 'item' || work.target.kind === 'entry') {
    // Etap 71d2 (G13): Ulepszanie przedmiotu i Wytwarzanie.
    const settled =
      work.target.kind === 'item'
        ? await upgradeItem(
            deps,
            campaignId,
            user,
            repairer.id,
            work.target,
            work.itemUpgradeId ?? '',
            cost,
            materials,
          )
        : await fabricateItem(
            deps,
            campaignId,
            user,
            repairer.id,
            work.target.entryId,
            cost,
            materials,
          );
    const done = settled === 'done';
    result.outcome = {
      success: done,
      label: done
        ? work.target.kind === 'item'
          ? 'Ulepszone'
          : 'Wytworzone'
        : SETTLED_LABELS[settled as Exclude<WorkSettled, 'done'>],
      detail:
        `${result.total} > PT ${dv} · ${targetName}` +
        (done && work.target.kind === 'entry' ? ` → Wyposażenie: ${repairer.name}` : '') +
        (done && cost > 0 ? ` · surowce −${formatEddies(cost)} ed` : ''),
    };
  } else if (work.target.kind === 'armor') {
    const done = await repairArmor(
      deps,
      campaignId,
      work.target.characterId,
      work.target.armorRowId,
    );
    result.outcome = {
      success: true,
      label: done ? 'Naprawione' : 'Nie było czego naprawiać',
      detail: `${result.total} > PT ${dv} · ${targetName}${done ? ': pełne OB' : ''}`,
    };
  } else if (!upgrade) {
    const done = await repairVehicle(deps, campaignId, work.target.vehicleId);
    result.outcome = {
      success: true,
      label: done ? 'Naprawione' : 'Nie było czego naprawiać',
      detail: `${result.total} > PT ${dv} · ${targetName}${done ? ': pełne PUK i szyby' : ''}`,
    };
  } else {
    const installed = await installUpgrade(
      deps,
      campaignId,
      user,
      repairer.id,
      work.target.vehicleId,
      work.vehicleUpgradeId ?? '',
      cost,
    );
    result.outcome = {
      success: installed === 'installed',
      label:
        installed === 'installed'
          ? 'Zamontowane'
          : installed === 'NOT_ENOUGH_EDDIES'
            ? 'Zabrakło na surowce'
            : 'Montaż niemożliwy',
      detail:
        `${result.total} > PT ${dv} · ${targetName}` +
        (installed === 'installed' && cost > 0 ? ` · surowce −${formatEddies(cost)} ed` : ''),
    };
  }
  result.clock = {
    minutes: spent,
    label: `${WORK_CLOCK_LABELS[work.task]}: ${targetName}`,
  };
}

// ───────────────────────── Lista robót drużyny ─────────────────────────

/**
 * Co drużyna ma do naprawy i — dla karty z Ulepszaniem — co da się
 * zamontować w jej autach (`repair:targets`). Gracz widzi tylko karty
 * drużyny (`teamCardsWhere`), MG — każdą kartę kampanii.
 */
export const repairTargetsEvent = defineEvent<CpredRepairTargetsPayload, CpredRepairTargetsAck>({
  name: 'repair:targets',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = socket.data.campaign?.id;
    if (!campaignId) throw new RealtimeError('NO_CAMPAIGN');
    const repairer = await requireTeamCard(deps.ctx.prisma, campaignId, user, payload?.characterId);
    if (user.role !== ROLE_GM && repairer.ownerId !== user.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    const upgradeLevel = cpredSheetFabrication(
      parseCharacterData(repairer.data, deps.ctx.cpred),
      deps.ctx.cpred,
    ).upgrade;

    const cards = await deps.ctx.prisma.character.findMany({
      where: { AND: [{ campaignId }, await teamCardsWhere(deps.ctx.prisma, campaignId, user)] },
      orderBy: { name: 'asc' },
    });
    const targets: CpredRepairTargetView[] = [];
    for (const card of cards) {
      for (const row of parseCharacterData(card.data, deps.ctx.cpred).armor) {
        if (!cpredArmorNeedsRepair(row)) continue;
        const entry = row.compendiumId
          ? await campaignEntry(deps, campaignId, row.compendiumId)
          : undefined;
        targets.push({
          target: { kind: 'armor', characterId: card.id, armorRowId: row.id },
          name: row.name,
          ownerName: card.name,
          skillId: CPRED_ARMOR_REPAIR_SKILL_ID,
          state: row.fieldRepair
            ? `na prowizorce (OB ${row.fieldRepair.restoredFrom}/${row.sp})`
            : `OB ${row.spCurrent}/${row.sp}`,
          repair: cpredArmorRepairTask(entry?.costCategory ?? null, row.upgrade),
        });
      }
    }

    // Etap 71d2 (G13): rzeczy drużyny, które Technik z Ulepszaniem może
    // ulepszyć Testem — z PT, czasem i surowcami z pasma, albo bez nich
    // (rzecz bez pasma — taką ulepsza MG menu „Ulepszenie…”).
    let items: CpredItemUpgradeTargetView[] | undefined;
    if (upgradeLevel > 0) {
      items = [];
      for (const card of cards) {
        const data = parseCharacterData(card.data, deps.ctx.cpred);
        for (const list of CPRED_WORK_ITEM_LISTS) {
          for (const row of data[list] as readonly { id: string; name: string }[]) {
            if (list === 'weapons' && cpredIsBareHandsRow(row)) continue;
            const found = await itemSubject(deps, campaignId, data, list, row.id);
            if (!found) continue;
            const upgradeIds = cpredTechUpgradesForTarget(found.subject);
            if (upgradeIds.length === 0) continue;
            const band = found.entry?.costCategory;
            items.push({
              target: { kind: 'item', characterId: card.id, list, rowId: row.id },
              name: row.name,
              ownerName: card.name,
              skillId: cpredItemTechSkillId(found.subject),
              upgradeIds,
              task: band ? cpredFabricationWorkTask(band, entryPrice(found.entry!)) : null,
              cost: cpredUpgradeMaterialsCost(found.entry),
            });
          }
        }
      }
    }

    const names = new Map(cards.map((card) => [card.id, card.name]));
    const vehicles = await deps.ctx.prisma.vehicle.findMany({
      where: { campaignId, ownerCharacterId: { in: [...names.keys()] } },
      orderBy: { createdAt: 'asc' },
    });
    for (const vehicle of vehicles) {
      const stats = readCpredVehicle(vehicle.system);
      const repair = cpredVehicleRepairTask(stats);
      let upgrades: CpredTechUpgradeOption[] | undefined;
      if (upgradeLevel > 0) {
        upgrades = [];
        for (const definition of cpredVehicleUpgradesFor(stats.kind)) {
          if (definition.motoLevel > 1) continue;
          upgrades.push({
            upgradeId: definition.id,
            name: definition.name,
            cost: await upgradeMaterialsCost(deps, campaignId, definition),
            problem: cpredTechVehicleUpgradeProblem(upgradeLevel, stats, definition.id),
          });
        }
      }
      if (!repair && !upgrades) continue;
      targets.push({
        target: { kind: 'vehicle', vehicleId: vehicle.id },
        name: vehicle.name,
        ownerName: names.get(vehicle.ownerCharacterId ?? '') ?? '',
        skillId: cpredVehicleTechSkillId(stats.kind),
        state: vehicleState(stats),
        repair: repair ? { dv: repair.dv, minutes: repair.minutes } : null,
        ...(upgrades ? { upgrades } : {}),
      });
    }
    return { targets, ...(items ? { items } : {}) };
  },
});

// ───────────────────────── Zegar z karty rzutu ─────────────────────────

/**
 * MG przesuwa zegar świata o czas pracy z karty rzutu (etap 71c2). Raz na
 * kartę: serwer stempluje `clock.applied`, więc drugi klik — i drugi MG przy
 * tym samym stole — niczego nie przesunie.
 */
export const rollClockEvent = defineEvent<RollClockPayload, { minutes: number }>({
  name: 'roll:clock',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = socket.data.campaign?.id;
    if (!campaignId) throw new RealtimeError('NO_CAMPAIGN');
    const messageId = payload?.messageId;
    if (typeof messageId !== 'number' || !Number.isInteger(messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const message = await deps.ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.campaignId !== campaignId || !message.payload) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const roll = JSON.parse(message.payload) as RollResult;
    if (!roll.clock) throw new RealtimeError('NO_CLOCK_PROPOSAL');
    if (roll.clock.applied) throw new RealtimeError('CLOCK_ALREADY_MOVED');
    const clock = { ...roll.clock, applied: true as const };
    const saved = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify({ ...roll, clock }) },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(saved);
    await broadcastRedactedChatMessage(deps, campaignId, view, 'chat:update');
    await moveGameClock(deps, campaignId, user, socket.data.viewedSceneId ?? null, {
      by: clock.minutes,
      title: `Minęło ${formatWorkDuration(clock.minutes)} — ${clock.label}`,
    });
    return { minutes: clock.minutes };
  },
});
