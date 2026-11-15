import type {
  CharacterFleetGiftPayload,
  CharacterView,
  SessionUser,
  VehicleFamilyUpgradePayload,
  VehicleFleetPayload,
  VehicleView,
} from '@vtt/shared';
import {
  CPRED_MOTO_ABILITY,
  CPRED_MOTO_ELDER_LEVEL,
  CPRED_MOTO_FAMILY_REPAIR_MINUTES,
  CPRED_MOTO_REPAIR_FEE,
  CPRED_MOTO_UPGRADE_FEE,
  applyGameTimeStep,
  cpredFamilyRepairProblem,
  cpredFleetGiftProblem,
  cpredFleetUsePlan,
  cpredIsFleetVehicle,
  cpredRoleAbilityRank,
  cpredVehiclePatch,
  cpredVehicleRepaired,
  cpredVehicleUpgrade,
  cpredVehicleUpgradeProblem,
  cpredWithFleetUse,
  formatEddies,
  formatGameDayTime,
  mergeCharacterData,
  parseCharacterData,
  purchasedSheetRow,
  readCpredVehicle,
  resolveWeapon,
  type CpredVehicleStats,
} from '@vtt/shared';
import type { Character, Vehicle } from '../generated/prisma/client.js';
import { vehicleSeatColumns, toVehicleView } from '../vehicles.js';
import { emitCharacterUpsert, refuseAwaitingGm, toCharacterView } from './character-io.js';
import { refuseInCombat } from './combat-lock.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, nextRowId, postEconomyCard, requireWallet } from './economy.js';
import { campaignGameTime } from './gametime.js';
import { withCampaignLock } from './merchant.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitVehicleUpsert } from './vehicles.js';

/**
 * Tabor Rodziny po bramce 71 (etap 71c1, s. 161–164): auto „w użyciu”
 * z wymianą na rano (G6), naprawa wraku u Rodziny (G7), Głowa Rodziny na
 * Moto 10 (G8) i broń od Rodziny przy pierwszym Stanowisku (G9).
 *
 * Każde zdarzenie nazywa auto, a płaci i jest sprawdzana karta jego
 * właściciela — prawo do niej daje `requireWallet` (gracz własną, MG każdą).
 * Reguły liczą czyste funkcje z `systems/cpred/fleet.ts`.
 */

interface FleetContext {
  campaignId: string;
  vehicle: Vehicle;
  stats: CpredVehicleStats;
  owner: Character;
  rank: number;
  now: number;
}

async function requireFleetContext(
  deps: RealtimeDeps,
  socket: { data: { campaign?: { id: string } | null } },
  user: SessionUser,
  vehicleId: unknown,
): Promise<FleetContext> {
  const campaignId = socket.data.campaign?.id;
  if (!campaignId) throw new RealtimeError('NO_CAMPAIGN');
  if (typeof vehicleId !== 'string' || vehicleId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const vehicle = await deps.ctx.prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.campaignId !== campaignId || !vehicle.ownerCharacterId) {
    throw new RealtimeError('VEHICLE_NOT_FOUND');
  }
  // Cudze auto wygląda jak nieistniejące — ta sama odmowa co portfel.
  const owner = await requireWallet(deps, campaignId, user, vehicle.ownerCharacterId).catch(() => {
    throw new RealtimeError('VEHICLE_NOT_FOUND');
  });
  refuseAwaitingGm(owner, user);
  const data = parseCharacterData(owner.data, deps.ctx.cpred);
  const rank = cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_MOTO_ABILITY);
  if (rank === null) throw new RealtimeError('NO_ABILITY');
  const { minutes: now } = await campaignGameTime(deps.ctx.prisma, campaignId);
  return { campaignId, vehicle, stats: readCpredVehicle(vehicle.system), owner, rank, now };
}

async function saveStats(
  deps: RealtimeDeps,
  campaignId: string,
  vehicle: Vehicle,
  stats: CpredVehicleStats,
): Promise<Vehicle> {
  const saved = await deps.ctx.prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { system: JSON.stringify(stats) },
  });
  await emitVehicleUpsert(deps, campaignId, saved);
  return saved;
}

/**
 * G6 (NOM-08): „Nomada może używać jednego pojazdu z Taboru naraz”; wymiana
 * przyjeżdża następnego ranka (s. 162). Rano = najbliższa 6:00 zegara świata
 * (`applyGameTimeStep(…, 'morning')`), jak skok zegara „do rana”.
 */
export const vehicleFleetUseEvent = defineEvent<VehicleFleetPayload, VehicleView>({
  name: 'vehicle:fleet-use',
  handler: async ({ deps, socket, user, payload }) => {
    const ctx = await requireFleetContext(deps, socket, user, payload?.vehicleId);
    const owned = await deps.ctx.prisma.vehicle.findMany({
      where: { campaignId: ctx.campaignId, ownerCharacterId: ctx.owner.id },
    });
    const fleet = owned
      .map((row) => ({ id: row.id, row, stats: readCpredVehicle(row.system) }))
      .filter((entry) => cpredIsFleetVehicle(entry.stats));
    const morning = applyGameTimeStep(ctx.now, 'morning');
    const plan = cpredFleetUsePlan(fleet, ctx.vehicle.id, ctx.now, morning, ctx.rank);
    if (!plan.ok) throw new RealtimeError(plan.error);
    let target = ctx.vehicle;
    for (const entry of fleet) {
      const patch = plan.patches.get(entry.id);
      if (!patch) continue;
      const saved = await saveStats(
        deps,
        ctx.campaignId,
        entry.row,
        cpredWithFleetUse(entry.stats, patch),
      );
      if (entry.id === ctx.vehicle.id) target = saved;
    }
    const arrives = readCpredVehicle(target.system).inUseFrom;
    await postEconomyCard(
      deps,
      ctx.campaignId,
      user,
      {
        title: `Tabor Rodziny — ${ctx.owner.name}`,
        lines: [
          arrives !== undefined && arrives > ctx.now
            ? `${target.name} przyjedzie ${formatGameDayTime(arrives)}; do tej pory zostaje auto, którym jedziesz.`
            : `${target.name} jest w użyciu.`,
        ],
      },
      [ctx.owner.ownerId],
    );
    return toVehicleView(target);
  },
});

/**
 * G7 (NOM-09): wrak z Taboru Rodzina naprawia tydzień za 500 ed (s. 162).
 * Auto wraca z pełnym PUK, ale do terminu stoi u Rodziny.
 */
export const vehicleFamilyRepairEvent = defineEvent<VehicleFleetPayload, VehicleView>({
  name: 'vehicle:family-repair',
  handler: async ({ deps, socket, user, payload }) => {
    const ctx = await requireFleetContext(deps, socket, user, payload?.vehicleId);
    await refuseInCombat(deps.ctx.prisma, ctx.campaignId, user);
    const problem = cpredFamilyRepairProblem(ctx.stats, ctx.now);
    if (problem) throw new RealtimeError(problem);
    const until = ctx.now + CPRED_MOTO_FAMILY_REPAIR_MINUTES;

    const saved = await withCampaignLock(ctx.campaignId, async () => {
      const card = await deps.ctx.prisma.character.findUniqueOrThrow({
        where: { id: ctx.owner.id },
      });
      const data = parseCharacterData(card.data, deps.ctx.cpred);
      if (data.eddies < CPRED_MOTO_REPAIR_FEE) throw new RealtimeError('NOT_ENOUGH_EDDIES');
      await applyBalance(
        deps,
        ctx.campaignId,
        card,
        data,
        {
          kind: 'purchase',
          amount: -CPRED_MOTO_REPAIR_FEE,
          label: `Rodzina: naprawa — ${ctx.vehicle.name}`,
        },
        user.id,
      );
      const repaired = cpredWithFleetUse(cpredVehicleRepaired(ctx.stats), {
        inUseFrom: null,
        inUseUntil: null,
      });
      return saveStats(deps, ctx.campaignId, ctx.vehicle, {
        ...repaired,
        familyRepairUntil: until,
      });
    });
    await postEconomyCard(
      deps,
      ctx.campaignId,
      user,
      {
        title: `Naprawa u Rodziny — ${ctx.vehicle.name}`,
        lines: [
          `${ctx.owner.name} · −${formatEddies(CPRED_MOTO_REPAIR_FEE)} ed`,
          `Auto wróci ${formatGameDayTime(until)} (tydzień, s. 162).`,
        ],
      },
      [ctx.owner.ownerId],
    );
    return toVehicleView(saved);
  },
});

/** Moto 10 — Głowa Rodziny (s. 162). */
function requireElder(rank: number): void {
  if (rank < CPRED_MOTO_ELDER_LEVEL) throw new RealtimeError('NOT_FAMILY_ELDER');
}

/**
 * G8 (NOM-11): Głowa Rodziny „może dokupywać pojazdy do Taboru po cenie
 * rynkowej”. Kupuje się jak każde auto (etap 67) — ten guzik dokłada kupione
 * auto do Taboru, bez wiersza awansu.
 */
export const vehicleFleetJoinEvent = defineEvent<VehicleFleetPayload, VehicleView>({
  name: 'vehicle:fleet-join',
  handler: async ({ deps, socket, user, payload }) => {
    const ctx = await requireFleetContext(deps, socket, user, payload?.vehicleId);
    requireElder(ctx.rank);
    if (cpredIsFleetVehicle(ctx.stats)) throw new RealtimeError('ALREADY_IN_FLEET');
    const saved = await saveStats(deps, ctx.campaignId, ctx.vehicle, {
      ...ctx.stats,
      fleetJoined: true,
    });
    return toVehicleView(saved);
  },
});

/**
 * G8 (NOM-11): Głowa Rodziny ulepsza auta Taboru „płacąc 1000 ed za każde
 * ulepszenie” (s. 162; cennik domowy ×10 — `CPRED_MOTO_UPGRADE_FEE`). Reguły
 * montażu jak w oknie MG (`cpredVehicleUpgradeProblem`).
 */
export const vehicleFamilyUpgradeEvent = defineEvent<VehicleFamilyUpgradePayload, VehicleView>({
  name: 'vehicle:family-upgrade',
  handler: async ({ deps, socket, user, payload }) => {
    const ctx = await requireFleetContext(deps, socket, user, payload?.vehicleId);
    requireElder(ctx.rank);
    await refuseInCombat(deps.ctx.prisma, ctx.campaignId, user);
    if (!cpredIsFleetVehicle(ctx.stats)) throw new RealtimeError('NOT_FLEET');
    const upgrade = cpredVehicleUpgrade(String(payload?.upgradeId ?? ''));
    if (!upgrade) throw new RealtimeError('UNKNOWN_UPGRADE');
    const problem = cpredVehicleUpgradeProblem(ctx.stats.kind, ctx.stats.upgrades, upgrade.id);
    if (problem) throw new RealtimeError(problem);

    const saved = await withCampaignLock(ctx.campaignId, async () => {
      const card = await deps.ctx.prisma.character.findUniqueOrThrow({
        where: { id: ctx.owner.id },
      });
      const data = parseCharacterData(card.data, deps.ctx.cpred);
      if (data.eddies < CPRED_MOTO_UPGRADE_FEE) throw new RealtimeError('NOT_ENOUGH_EDDIES');
      const result = cpredVehiclePatch(ctx.stats, {
        upgrades: [
          ...ctx.stats.upgrades.filter((row) => !row.fleetRowId),
          { id: nextRowId(), upgradeId: upgrade.id, notes: 'od Rodziny' },
        ],
      });
      if (!result.ok) throw new RealtimeError(result.code);
      await applyBalance(
        deps,
        ctx.campaignId,
        card,
        data,
        {
          kind: 'purchase',
          amount: -CPRED_MOTO_UPGRADE_FEE,
          label: `Rodzina: ${upgrade.name} — ${ctx.vehicle.name}`,
        },
        user.id,
      );
      const row = await deps.ctx.prisma.vehicle.update({
        where: { id: ctx.vehicle.id },
        data: {
          system: JSON.stringify(result.stats),
          ...vehicleSeatColumns(ctx.vehicle, ctx.stats, result.stats),
        },
      });
      await emitVehicleUpsert(deps, ctx.campaignId, row);
      return row;
    });
    await postEconomyCard(
      deps,
      ctx.campaignId,
      user,
      {
        title: `Ulepszenie od Rodziny — ${upgrade.name}`,
        lines: [
          `${ctx.owner.name} — ${upgrade.name} do auta: ${ctx.vehicle.name} · −${formatEddies(CPRED_MOTO_UPGRADE_FEE)} ed`,
        ],
      },
      [ctx.owner.ownerId],
    );
    return toVehicleView(saved);
  },
});

/**
 * G9 (NOM-14): przy pierwszym Stanowisku bardzo ciężkiej broni w aucie Taboru
 * Rodzina daruje Tsunami Arms Helix, EMG-86 albo „Cowboya” (s. 164). Broń
 * ląduje w Wyposażeniu; raz — `fleetGift` na karcie.
 */
export const characterFleetGiftEvent = defineEvent<CharacterFleetGiftPayload, CharacterView>({
  name: 'character:fleet-gift',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = socket.data.campaign?.id;
    if (!campaignId) throw new RealtimeError('NO_CAMPAIGN');
    const owner = await requireWallet(deps, campaignId, user, payload?.characterId);
    refuseAwaitingGm(owner, user);
    const data = parseCharacterData(owner.data, deps.ctx.cpred);
    if (cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_MOTO_ABILITY) === null) {
      throw new RealtimeError('NO_ABILITY');
    }
    const entryId = typeof payload?.entryId === 'string' ? payload.entryId : '';
    const owned = await deps.ctx.prisma.vehicle.findMany({
      where: { campaignId, ownerCharacterId: owner.id },
    });
    const problem = cpredFleetGiftProblem(
      owned.map((row) => readCpredVehicle(row.system)),
      data.fleetGift,
      entryId,
    );
    if (problem) throw new RealtimeError(problem);
    const entry = await campaignEntry(deps, campaignId, entryId);
    if (!entry || entry.category !== 'weapon') throw new RealtimeError('ENTRY_NOT_FOUND');
    const resolved = resolveWeapon(entry, { weaponTypeById: deps.ctx.compendium.weaponTypeById });
    const landed = purchasedSheetRow(entry, resolved, nextRowId());
    if (!landed || landed.list !== 'weapons') throw new RealtimeError('ENTRY_NOT_FOUND');
    const saved = await deps.ctx.prisma.character.update({
      where: { id: owner.id },
      data: {
        data: JSON.stringify(
          mergeCharacterData(data, {
            weapons: [...data.weapons, { ...landed.row, notes: 'Prezent od Rodziny' }],
            fleetGift: entry.id,
          }),
        ),
      },
    });
    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    await postEconomyCard(
      deps,
      campaignId,
      user,
      {
        title: `Prezent od Rodziny — ${entry.name}`,
        lines: [`${owner.name} dostaje od Rodziny: ${entry.name} (s. 164).`],
      },
      [owner.ownerId],
    );
    return view;
  },
});
