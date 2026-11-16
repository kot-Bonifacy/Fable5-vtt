import type { CharacterCryoAck, CharacterCryoPayload, CpredCharacterData } from '@vtt/shared';
import {
  CPRED_ACTION_CRYO,
  CPRED_CRYO_MINUTES,
  CPRED_CRYO_REFILL_PRICE,
  CPRED_CRYOPUMP_ENTRY_ID,
  CPRED_CRYOPUMP_NAME,
  CPRED_UNCONSCIOUS_STATUS_ID,
  ITEM_ROWS_MAX,
  ROLE_GM,
  cpredCryopumpCharges,
  cpredIsCryopump,
  cpredSheetMedicine,
  formatEddies,
  formatWorkDuration,
  mergeCharacterData,
  parseCharacterData,
  tokenTableName,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { emitCharacterUpsert, refuseAwaitingGm, toCharacterView } from './character-io.js';
import { readTokenStatuses } from './combat.js';
import { refuseInCombat } from './combat-lock.js';
import { requireTurnSpend } from './combat-actions.js';
import { campaignEntry } from './compendium.js';
import { applyBalance, nextRowId, requireWallet } from './economy.js';
import { removeTokenStatus } from './grapple-state.js';
import { withCampaignLock } from './merchant.js';
import { postRecoveryCard, resolveDoseTarget } from './recovery.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { effectClockForCharacter } from './stat-effects.js';
import { emitTokensById } from './tokens.js';

/**
 * Kriopompa Medyka (etap 71d2, G19; s. 150, s. 353). Cztery czynności jednym
 * zdarzeniem `character:cryo`:
 *
 *  - `grant` — pierwszy punkt Obsługi kriosystemów daje pompę, raz;
 *  - `freeze` — Akcja Medyka i ładunek pompy: pacjent w zasięgu ramienia
 *    dostaje stan „w kriośnie” (tydzień zegara świata bez rzutów przeciw
 *    śmierci) i status „Nieprzytomny”;
 *  - `thaw` — Medyk, który zamroził, albo MG wyjmuje pacjenta z worka;
 *  - `refill` — uzupełnienie płynu, 150 ed za ładunek (50 ed × cennik 47a).
 *
 * Stan pacjenta to pole karty `cryo` — `character:update` go nie przyjmuje,
 * a koniec tygodnia zdejmuje przemiatanie zegara (`expireSheetStatEffects`).
 */

async function saveSheet(
  deps: RealtimeDeps,
  campaignId: string,
  card: Character,
  data: CpredCharacterData,
): Promise<Character> {
  const saved = await deps.ctx.prisma.character.update({
    where: { id: card.id },
    data: { data: JSON.stringify(data) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  return saved;
}

/** Kriopompę obsługuje wyłącznie Medyk (s. 353) — ranga Medycyny na karcie. */
function requireMedic(data: CpredCharacterData, deps: RealtimeDeps): number {
  const medicine = cpredSheetMedicine(data, deps.ctx.cpred);
  if (medicine.rank < 1) throw new RealtimeError('NOT_A_MEDIC');
  return medicine.cryo;
}

function requirePump(data: CpredCharacterData, gearRowId: unknown) {
  const row = data.gear.find((entry) => entry.id === gearRowId);
  if (!row || !cpredIsCryopump(row)) throw new RealtimeError('NOT_A_CRYOPUMP');
  return row;
}

/** Dokłada „Nieprzytomny” figurom pacjenta; mówi, czy dołożył choć jedną. */
async function addUnconscious(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<boolean> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId, scene: { campaignId } },
  });
  const changed: string[] = [];
  for (const token of tokens) {
    const statuses = readTokenStatuses(token.statuses);
    if (statuses.includes(CPRED_UNCONSCIOUS_STATUS_ID)) continue;
    await deps.ctx.prisma.token.update({
      where: { id: token.id },
      data: { statuses: JSON.stringify([...statuses, CPRED_UNCONSCIOUS_STATUS_ID]) },
    });
    changed.push(token.id);
  }
  if (changed.length > 0) await emitTokensById(deps, campaignId, changed);
  return changed.length > 0;
}

async function removeUnconscious(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId, scene: { campaignId } },
    select: { id: true },
  });
  for (const token of tokens) {
    await removeTokenStatus(deps, campaignId, token.id, CPRED_UNCONSCIOUS_STATUS_ID);
  }
}

export const characterCryoEvent = defineEvent<CharacterCryoPayload, CharacterCryoAck>({
  name: 'character:cryo',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = socket.data.campaign?.id;
    if (!campaignId) throw new RealtimeError('NO_CAMPAIGN');
    const action = payload?.action;
    const sceneId = socket.data.viewedSceneId ?? null;

    // ── Rozmrożenie: karta pacjenta; wolno MG i właścicielowi Medyka, który zamroził.
    if (action === 'thaw') {
      const patientId = payload?.characterId;
      if (typeof patientId !== 'string') throw new RealtimeError('BAD_REQUEST');
      return withCampaignLock(campaignId, async () => {
        const patient = await deps.ctx.prisma.character.findUnique({ where: { id: patientId } });
        if (!patient || patient.campaignId !== campaignId) {
          throw new RealtimeError('CHARACTER_NOT_FOUND');
        }
        const data = parseCharacterData(patient.data, deps.ctx.cpred);
        if (!data.cryo) throw new RealtimeError('NOT_FROZEN');
        if (user.role !== ROLE_GM) {
          const medic = await deps.ctx.prisma.character.findUnique({
            where: { id: data.cryo.byCharacterId },
          });
          if (!medic || medic.ownerId !== user.id) throw new RealtimeError('NOT_FROZEN');
        }
        const state = data.cryo;
        await saveSheet(deps, campaignId, patient, mergeCharacterData(data, { cryo: null }));
        if (state.addedUnconscious) await removeUnconscious(deps, campaignId, patient.id);
        await postRecoveryCard(
          deps,
          campaignId,
          user,
          {
            actor: patient.name,
            title: 'Rozmrożony',
            hp: 0,
            lines: [`${state.by} wyjmuje pacjenta z worka kriopompy.`],
            note: 'Od następnej Tury znów obowiązują rzuty przeciw śmierci.',
            tone: 'warn',
          },
          sceneId,
        );
        return {};
      });
    }

    const medic = await requireWallet(deps, campaignId, user, payload?.characterId);
    refuseAwaitingGm(medic, user);

    // ── Odbiór pompy z pierwszego punktu Obsługi kriosystemów (s. 150).
    if (action === 'grant') {
      return withCampaignLock(campaignId, async () => {
        const fresh = await deps.ctx.prisma.character.findUniqueOrThrow({
          where: { id: medic.id },
        });
        const data = parseCharacterData(fresh.data, deps.ctx.cpred);
        const level = requireMedic(data, deps);
        if (level < 1) throw new RealtimeError('NO_CRYO_SPECIALTY');
        if (data.cryoPumpGranted) throw new RealtimeError('PUMP_GRANTED');
        if (data.gear.length >= ITEM_ROWS_MAX) throw new RealtimeError('TOO_MANY_ROWS');
        const entry = await campaignEntry(deps, campaignId, CPRED_CRYOPUMP_ENTRY_ID);
        const row = {
          id: nextRowId(),
          name: entry?.name ?? CPRED_CRYOPUMP_NAME,
          ...(entry ? { compendiumId: entry.id } : {}),
          notes: 'Z Obsługi kriosystemów',
          qty: 1,
        };
        await saveSheet(
          deps,
          campaignId,
          fresh,
          mergeCharacterData(data, { gear: [...data.gear, row], cryoPumpGranted: true }),
        );
        return { charges: cpredCryopumpCharges({}, level) };
      });
    }

    // ── Uzupełnienie płynu: 50 ed (Drogo) za ładunek, w cenniku domowym.
    if (action === 'refill') {
      await refuseInCombat(deps.ctx.prisma, campaignId, user);
      return withCampaignLock(campaignId, async () => {
        const fresh = await deps.ctx.prisma.character.findUniqueOrThrow({
          where: { id: medic.id },
        });
        const data = parseCharacterData(fresh.data, deps.ctx.cpred);
        const pump = requirePump(data, payload?.gearRowId);
        const used = pump.cryoUsed ?? 0;
        if (used < 1) throw new RealtimeError('NOTHING_TO_REFILL');
        const cost = used * CPRED_CRYO_REFILL_PRICE;
        if (data.eddies < cost) throw new RealtimeError('NOT_ENOUGH_EDDIES');
        const refilled = mergeCharacterData(data, {
          gear: data.gear.map((row) => {
            if (row.id !== pump.id) return row;
            const { cryoUsed: _used, ...rest } = row;
            return rest;
          }),
        });
        await applyBalance(
          deps,
          campaignId,
          fresh,
          refilled,
          { kind: 'purchase', amount: -cost, label: `Płyn do kriopompy ×${used}` },
          user.id,
        );
        const level = cpredSheetMedicine(data, deps.ctx.cpred).cryo;
        return { charges: cpredCryopumpCharges({}, level), paid: cost };
      });
    }

    if (action !== 'freeze') throw new RealtimeError('BAD_REQUEST');

    // ── Zamrożenie: Akcja Medyka, jeden ładunek na pacjenta (s. 353).
    const medicData = parseCharacterData(medic.data, deps.ctx.cpred);
    const cryoLevel = requireMedic(medicData, deps);
    const pump = requirePump(medicData, payload?.gearRowId);
    if (cpredCryopumpCharges(pump, cryoLevel) < 1) throw new RealtimeError('NO_CHARGES');
    if (typeof payload?.targetTokenId !== 'string') throw new RealtimeError('BAD_REQUEST');
    const target = await resolveDoseTarget(deps, campaignId, medic, payload.targetTokenId);
    if (!target.character) throw new RealtimeError('NO_TARGET_SHEET');
    if (target.character.id === medic.id) throw new RealtimeError('CRYO_SELF');
    const patientData = parseCharacterData(target.character.data, deps.ctx.cpred);
    if (patientData.cryo) throw new RealtimeError('ALREADY_FROZEN');

    // Akcja przed skutkiem, jak przy dawce: odmowa „nie masz już Akcji” nie
    // zjada ładunku. Poza walką `requireTurnSpend` przepuszcza.
    if (target.token && target.scene) {
      const own = await deps.ctx.prisma.token.findFirst({
        where: { characterId: medic.id, sceneId: target.scene.id },
      });
      if (own) {
        await requireTurnSpend(
          deps,
          campaignId,
          target.scene,
          own.id,
          { kind: 'action', actionId: CPRED_ACTION_CRYO },
          user,
          CPRED_ACTION_CRYO,
          {
            silent: true,
            note: `Kriopompa → ${tokenTableName(target.token, target.token.name)}`,
          },
        );
      }
    }

    const clock = await effectClockForCharacter(deps, campaignId, target.character.id, sceneId);
    return withCampaignLock(campaignId, async () => {
      const freshMedic = await deps.ctx.prisma.character.findUniqueOrThrow({
        where: { id: medic.id },
      });
      const freshMedicData = parseCharacterData(freshMedic.data, deps.ctx.cpred);
      const freshPump = requirePump(freshMedicData, pump.id);
      if (cpredCryopumpCharges(freshPump, cryoLevel) < 1) throw new RealtimeError('NO_CHARGES');
      const freshPatient = await deps.ctx.prisma.character.findUniqueOrThrow({
        where: { id: target.character!.id },
      });
      const freshPatientData = parseCharacterData(freshPatient.data, deps.ctx.cpred);
      if (freshPatientData.cryo) throw new RealtimeError('ALREADY_FROZEN');

      const used = (freshPump.cryoUsed ?? 0) + 1;
      await saveSheet(
        deps,
        campaignId,
        freshMedic,
        mergeCharacterData(freshMedicData, {
          gear: freshMedicData.gear.map((row) =>
            row.id === freshPump.id ? { ...row, cryoUsed: used } : row,
          ),
        }),
      );
      const added = await addUnconscious(deps, campaignId, freshPatient.id);
      await saveSheet(
        deps,
        campaignId,
        freshPatient,
        mergeCharacterData(freshPatientData, {
          cryo: {
            by: medic.name,
            byCharacterId: medic.id,
            ...(clock.minutes !== null
              ? { expiresAtMinute: clock.minutes + CPRED_CRYO_MINUTES }
              : {}),
            ...(added ? { addedUnconscious: true as const } : {}),
          },
        }),
      );
      const charges = cpredCryopumpCharges({ cryoUsed: used }, cryoLevel);
      await postRecoveryCard(
        deps,
        campaignId,
        user,
        {
          actor: target.name,
          title: `Kriopompa — od: ${medic.name}`,
          hp: 0,
          lines: [
            `W worku kriopompy: nieprzytomny, bez rzutów przeciw śmierci przez ${formatWorkDuration(CPRED_CRYO_MINUTES)}, o ile worek ma choć 1 PW (osłona 15 PW).`,
            `Pompie zostało ładunków: ${charges} · uzupełnienie ${formatEddies(CPRED_CRYO_REFILL_PRICE)} ed za ładunek.`,
          ],
          tone: 'success',
        },
        target.scene?.id ?? sceneId,
      );
      return { charges };
    });
  },
});
