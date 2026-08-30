import type {
  CharacterBackupCallPayload,
  CharacterCombatAwarenessPayload,
  CharacterCreatePayload,
  CharacterDeleteBroadcast,
  CharacterFieldRepairPayload,
  CharacterIdPayload,
  CharacterUpdatePayload,
  CharacterView,
} from '@vtt/shared';
import {
  CPRED_ACTION_BACKUP,
  CPRED_ACTION_COMBAT_AWARENESS,
  CPRED_ACTION_FIELD_REPAIR,
  CPRED_BACKUP_ABILITY,
  CPRED_COMBAT_AWARENESS_ABILITY,
  ROLE_GM,
  cpredBackupCall,
  cpredBackupTier,
  cpredBackupTierAt,
  cpredCombatAwarenessProblem,
  cpredFieldRepairMinutes,
  cpredSheetFabrication,
  cpredRoleAbilityRank,
  cpredFleetSheetProblem,
  cpredRolesProblem,
  cpredSpecialtiesProblem,
  createDefaultCharacterData,
  describeCombatAwareness,
  mergeCharacterData,
  parseCharacterData,
  readCpredCombatAwareness,
  sanitizeCharacterName,
  rollFormula,
  sanitizeTokenImageUrl,
  validateCharacterDataPatch,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Character, Scene } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent } from './registry.js';
import { applyBalance } from './economy.js';
import { applyImprovementPoints } from './advancement.js';
import { emitToCampaignUser } from './state.js';
import { emitCharacterDelete, emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitRuns } from './netrun-io.js';
import { emitTokensById, emitTokensOfCharacter, requireCampaignToken } from './tokens.js';
import { requireTurnSpend } from './combat-actions.js';
import { scheduleBackup } from './backup.js';
import { dropFromTeams } from './team.js';
import { INCLUDE_CHAT_NAMES, deliverRollMessage, toChatMessageView } from './chat-io.js';
import { sanitizeGesture } from './chat.js';
import { createMixedRng } from './dice-rng.js';

/**
 * Character event handlers. Delivery and view mapping live in
 * `character-io.ts`; sheet changes also refresh the HP bars of every token
 * linked to the character (stage 08 — the sheet is the source of truth).
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

async function requireCampaignCharacter(
  prisma: PrismaClient,
  campaignId: string,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/** A character owner must be a member of the campaign (players only). */
async function requireValidOwner(
  prisma: PrismaClient,
  campaignId: string,
  ownerId: string | null | undefined,
): Promise<void> {
  if (ownerId === null || ownerId === undefined) return;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId: ownerId } },
  });
  if (!membership) throw new RealtimeError('OWNER_NOT_FOUND');
}

export const characterCreateEvent = defineEvent<CharacterCreatePayload, CharacterView>({
  name: 'character:create',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const name = sanitizeCharacterName(payload?.name);
    if (name === null) throw new RealtimeError('INVALID_NAME');

    // Players always own what they create; only the GM assigns freely (NPC = null).
    let ownerId: string | null;
    if (user.role === ROLE_GM) {
      ownerId = payload?.ownerId ?? null;
      await requireValidOwner(deps.ctx.prisma, campaignId, ownerId);
    } else {
      ownerId = user.id;
    }

    const character = await deps.ctx.prisma.character.create({
      data: {
        campaignId,
        name,
        ownerId,
        data: JSON.stringify(createDefaultCharacterData()),
      },
    });
    const view = toCharacterView(character, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    return view;
  },
});

export const characterUpdateEvent = defineEvent<CharacterUpdatePayload, CharacterView>({
  name: 'character:update',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    // Non-owners must not learn the character exists.
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const patch = payload?.patch;
    if (typeof patch !== 'object' || patch === null) throw new RealtimeError('BAD_REQUEST');

    const data: Record<string, unknown> = {};
    if ('name' in patch) {
      const name = sanitizeCharacterName(patch.name);
      if (name === null) throw new RealtimeError('INVALID_NAME');
      data.name = name;
    }
    if ('portraitUrl' in patch) {
      const portraitUrl = sanitizeTokenImageUrl(patch.portraitUrl ?? null);
      if (portraitUrl === undefined) throw new RealtimeError('BAD_REQUEST');
      data.portraitUrl = portraitUrl;
    }
    if ('ownerId' in patch) {
      if (!isGm) throw new RealtimeError('FORBIDDEN');
      if (patch.ownerId !== null && typeof patch.ownerId !== 'string') {
        throw new RealtimeError('BAD_REQUEST');
      }
      await requireValidOwner(deps.ctx.prisma, campaignId, patch.ownerId);
      data.ownerId = patch.ownerId;
    }
    // Stage 23b: eddies leave this path entirely. The GM's own number field is
    // still a number field, but it lands as a correction with a ledger row —
    // an audit with an unlogged back door next to it is decoration.
    let adjustBalance: number | undefined;
    let adjustPoints: number | undefined;
    if ('data' in patch) {
      const result = validateCharacterDataPatch(patch.data, deps.ctx.cpred);
      if (!result.ok) throw new RealtimeError('INVALID_DATA');
      const { eddies, improvementPoints, ...sheet } = result.patch;
      if (eddies !== undefined) {
        if (!isGm) throw new RealtimeError('FORBIDDEN');
        adjustBalance = eddies;
      }
      // Stage 29a: the PD box goes the same way and for the same reason. The
      // GM's number field stays a number field, but it lands as a correction
      // with a row of its own — an audit with an unlogged back door beside it
      // is decoration.
      if (improvementPoints !== undefined) {
        if (!isGm) throw new RealtimeError('FORBIDDEN');
        adjustPoints = improvementPoints;
      }
      // Stage 29a: and so do the two things PD buys. A player who can type
      // „Percepcja 7" pays nothing for the level, which would make all three
      // ladders of s. 411 decoration; the GM keeps both fields, because a
      // referee has to be able to fix a card. `roleId` travels with the rank
      // for the same reason: a Role swapped under a kept rank would hand out a
      // different Special Ability at the same level, for free.
      if (!isGm && (sheet.skills !== undefined || sheet.roleAbilityRank !== undefined)) {
        throw new RealtimeError('FORBIDDEN');
      }
      if (!isGm && sheet.roleId !== undefined) throw new RealtimeError('FORBIDDEN');
      // Stage 29b: and the list of previous Roles goes with it. Taking up a new
      // Role costs 60 PD and is gated on a rank (s. 143); a player who can type
      // the list makes both free. The GM keeps it — a referee has to be able to
      // undo a change of Role the table decided against.
      if (!isGm && sheet.formerRoles !== undefined) throw new RealtimeError('FORBIDDEN');
      // Stage 23c: „Reputacja zawsze zależy od czynów i działań Postaci, i
      // przydziela ją MG" (s. 193). Unlike eddies it stays on this path — there
      // is no ledger to write, only a door to close.
      if (sheet.reputationSources !== undefined && !isGm) throw new RealtimeError('FORBIDDEN');
      // Stage 30a: the Solo's allocation leaves this path entirely, the way
      // `eddies` did. Saving it can cost an Action („w trakcie walki (w ramach
      // Akcji)", s. 146), and a sheet patch has no Action to charge.
      if (sheet.combatAwareness !== undefined) throw new RealtimeError('FORBIDDEN');
      // Stage 30c: and neither does the Korpo's roster. Hiring rolls dice,
      // replacing costs 200 ed and a Loyalty Test is the GM's — three prices,
      // and a sheet patch has no way to pay any of them.
      if (sheet.team !== undefined) throw new RealtimeError('FORBIDDEN');
      // Stage 30d: nor does a struck bargain. It changes what a purchase costs,
      // and a discount reachable without the opposed roll that buys it is a
      // discount nobody rolled for — the same door `eddies` closed in 23b.
      if (sheet.haggle !== undefined) throw new RealtimeError('FORBIDDEN');
      const current = parseCharacterData(character.data, deps.ctx.cpred);
      const merged = mergeCharacterData(current, sheet);
      // Stage 30b: the two Specialty purses stay on this path (a level-up has
      // no Action to charge), but their size depends on a rank the patch
      // validator cannot see. Judged here, against the sheet as it will be —
      // so raising the rank and spending the new points in one patch works.
      const specialties = cpredSpecialtiesProblem(merged, deps.ctx.cpred);
      if (specialties !== null) throw new RealtimeError(specialties);
      // Stage 30d: the Nomada's Tabor is counted the same way and for the same
      // reason — „jedna z dwóch rzeczy" per level is a count, and a count needs
      // the rank the patch may have just changed.
      const fleet = cpredFleetSheetProblem(merged, deps.ctx.cpred);
      if (fleet !== null) throw new RealtimeError(fleet);
      // Stage 29b: „is this Role already on the sheet" cannot be answered by
      // either half of a patch that moves `roleId` and `formerRoles` at once —
      // and the same Role standing twice under two ranks would make
      // `cpredRoleAbilityRank` pick one of them for reasons nobody can see.
      const roles = cpredRolesProblem(merged, deps.ctx.cpred);
      if (roles !== null) throw new RealtimeError(roles);
      data.data = JSON.stringify(merged);
    }

    let updated = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data,
    });
    if (adjustBalance !== undefined) {
      const current = parseCharacterData(updated.data, deps.ctx.cpred);
      const delta = adjustBalance - current.eddies;
      if (delta !== 0) {
        // `emit: false` — the upsert two lines down carries the new balance
        // anyway, and two upserts for one edit is how a sheet flickers.
        await applyBalance(
          deps,
          campaignId,
          updated,
          current,
          // „Korekta MG: ręczna zmiana salda" — the kind already says who, so
          // the label says what, rather than repeating the word twice.
          { kind: 'adjust', amount: delta, label: 'ręczna zmiana salda' },
          user.id,
          { merge: true, emit: false },
        );
        updated = await deps.ctx.prisma.character.findUniqueOrThrow({
          where: { id: character.id },
        });
      }
    }
    if (adjustPoints !== undefined) {
      const current = parseCharacterData(updated.data, deps.ctx.cpred);
      const delta = adjustPoints - current.improvementPoints;
      if (delta !== 0) {
        await applyImprovementPoints(
          deps,
          campaignId,
          updated,
          current,
          { kind: 'adjust', amount: delta, label: 'ręczna zmiana licznika' },
          user.id,
          { merge: true, emit: false },
        );
        updated = await deps.ctx.prisma.character.findUniqueOrThrow({
          where: { id: character.id },
        });
      }
    }
    const view = toCharacterView(updated, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    // HP and stats drive the bars of every token bound to this sheet.
    if ('data' in patch || 'ownerId' in patch || 'name' in patch) {
      await emitTokensOfCharacter(deps, campaignId, updated);
    }
    // The run window paints this sheet's cyberdeck (stage 26c), so a Program
    // put in or taken out has to reach it — otherwise a netrunner mid-run sees
    // a rack that is one save out of date.
    if (
      'data' in patch &&
      (await deps.ctx.prisma.netRun.count({ where: { characterId: character.id } })) > 0
    ) {
      await emitRuns(deps, campaignId);
    }
    // A reassigned character vanishes from the previous owner's list.
    if (character.ownerId && character.ownerId !== updated.ownerId) {
      await emitToCampaignUser(deps.io, campaignId, character.ownerId, 'character:delete', {
        characterId: character.id,
      } satisfies CharacterDeleteBroadcast);
    }
    return view;
  },
});

export const characterDeleteEvent = defineEvent<CharacterIdPayload>({
  name: 'character:delete',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    if (user.role !== ROLE_GM && character.ownerId !== user.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    // Tokens are unlinked by the DB (SetNull); refresh them so their bars
    // fall back to their own HP instead of showing the dead sheet's.
    const linkedTokens = await deps.ctx.prisma.token.findMany({
      where: { characterId: character.id },
      select: { id: true },
    });
    await deps.ctx.prisma.character.delete({ where: { id: character.id } });
    await emitCharacterDelete(deps, campaignId, character.id, character.ownerId);
    // Stage 30c: a Korpo's roster points at sheets by id, and JSON has nothing
    // for the database to cascade — so the row goes when the person does.
    await dropFromTeams(deps, campaignId, character.id);
    await emitTokensById(
      deps,
      campaignId,
      linkedTokens.map((token) => token.id),
    );
  },
});

/**
 * Rearranging a Solo's Zmysł Walki (stage 30a).
 *
 * „Poza walką, gdy rozpoczyna się walka albo w trakcie walki (w ramach Akcji)
 * Solo może rozdzielić punkty Zmysłu Walki pomiędzy różne zdolności bojowe"
 * (s. 146). Three moments, one of them priced — so the price is charged where
 * the tracker can see it, against the figure that is actually in the fight.
 *
 * A sheet standing on no scene, or on a scene with no combat running, pays
 * nothing: `requireTurnSpend` passes such a token straight through, which is
 * exactly „poza walką".
 */
export const characterCombatAwarenessEvent = defineEvent<
  CharacterCombatAwarenessPayload,
  CharacterView
>({
  name: 'character:combat-awareness',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const rank = cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_COMBAT_AWARENESS_ABILITY);
    const allocation = readCpredCombatAwareness(payload?.allocation);
    // The refusal codes *are* the engine's own (`NO_ABILITY`, `BAD_STEP`,
    // `NOT_ENOUGH_POINTS`, `BAD_VALUE`), so the client translates them with the
    // same table the panel greys its buttons out from — one list of sentences,
    // not two that can disagree.
    const problem = cpredCombatAwarenessProblem(allocation, rank);
    if (problem !== null) throw new RealtimeError(problem);
    // An unchanged allocation is not a reallocation, and must not cost an
    // Action: „Jeśli Solo nie zmieni przydziału tych punktów, zakłada się
    // przydział taki, jaki był do tej pory" (s. 146). Opening the panel and
    // closing it is free.
    const unchanged =
      JSON.stringify(readCpredCombatAwareness(data.combatAwareness)) === JSON.stringify(allocation);

    if (!unchanged && payload?.tokenId !== undefined) {
      const { token, scene } = await requireCampaignToken(
        deps.ctx.prisma,
        campaignId,
        payload.tokenId,
      );
      if (token.characterId !== character.id) throw new RealtimeError('BAD_REQUEST');
      await requireTurnSpend(
        deps,
        campaignId,
        scene,
        token.id,
        { kind: 'action', actionId: CPRED_ACTION_COMBAT_AWARENESS },
        user,
        CPRED_ACTION_COMBAT_AWARENESS,
        // The action log already says „Zmysł Walki"; the sentence below adds
        // what it was divided into, which is the part the table wants to read.
        { silent: false, note: describeCombatAwareness(allocation) },
      );
    }

    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(mergeCharacterData(data, { combatAwareness: allocation })) },
    });
    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    // Błyskawiczna reakcja moves initiative and Precyzyjny atak moves every
    // attack, so the bar and the tracker both read a sheet that just changed.
    await emitTokensOfCharacter(deps, campaignId, saved);
    return view;
  },
});

/**
 * „Prowizorka" — a Technik's field repair (stage 30b, s. 147).
 *
 * „Zamiast podejmować próbę długiej naprawy, możesz w ramach Akcji tymczasowo
 * doprowadzić jakiś przedmiot do idealnego stanu […] Tak naprawiony przedmiot
 * ma pełne OB i PW". In this VTT the only thing that carries an SP that wears
 * down is a piece of armour, so that is what a bodge puts back — and the row
 * remembers what it was worth, because „potem przedmiot wraca do stanu, w
 * którym był".
 *
 * It carries no countdown. Ten minutes a level is sixty rounds a level, longer
 * than any fight this project has ever run, so a round timer would be a clock
 * that never strikes; the piece stays patched until somebody presses the button
 * — the same bargain stage 16h struck with effects that outlive a combat.
 *
 * „Nie można go ponownie tymczasowo naprawić, dopóki nie zostanie zupełnie
 * naprawiony w zwykły sposób" is why a row already bodged refuses a second one.
 */
export const characterFieldRepairEvent = defineEvent<CharacterFieldRepairPayload, CharacterView>({
  name: 'character:field-repair',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const row = data.armor.find((entry) => entry.id === payload?.armorRowId);
    if (!row) throw new RealtimeError('UNKNOWN_ARMOR');

    let armor: typeof data.armor;
    let note: string;
    if (payload?.undo === true) {
      if (!row.fieldRepair) throw new RealtimeError('NOT_PATCHED');
      const restored = Math.min(row.fieldRepair.restoredFrom, row.sp);
      armor = data.armor.map((entry) =>
        entry.id === row.id ? { ...entry, spCurrent: restored, fieldRepair: undefined } : entry,
      );
      note = `${row.name}: prowizorka puszcza, OB wraca do ${restored}.`;
    } else {
      if (row.fieldRepair) throw new RealtimeError('ALREADY_PATCHED');
      if (row.spCurrent >= row.sp) throw new RealtimeError('ARMOR_INTACT');
      // The Technik doing the bodging is the sheet that owns the row: RAW lets
      // a Technik patch anybody's gear, but the SP that changes is this sheet's,
      // and „who turned the screwdriver" is the table's business, not a column.
      const repair = cpredSheetFabrication(data, deps.ctx.cpred).repair;
      if (repair < 1) throw new RealtimeError('NO_REPAIR_SPECIALTY');
      const minutes = cpredFieldRepairMinutes(repair);
      armor = data.armor.map((entry) =>
        entry.id === row.id
          ? {
              ...entry,
              spCurrent: entry.sp,
              fieldRepair: { restoredFrom: entry.spCurrent, minutes },
            }
          : entry,
      );
      note = `${row.name}: prowizorka na ${minutes} min — OB ${row.spCurrent} → ${row.sp}.`;
      if (payload?.tokenId !== undefined) {
        const { token, scene } = await requireCampaignToken(
          deps.ctx.prisma,
          campaignId,
          payload.tokenId,
        );
        if (token.characterId !== character.id) throw new RealtimeError('BAD_REQUEST');
        await requireTurnSpend(
          deps,
          campaignId,
          scene,
          token.id,
          { kind: 'action', actionId: CPRED_ACTION_FIELD_REPAIR },
          user,
          CPRED_ACTION_FIELD_REPAIR,
          { silent: false, note },
        );
      }
    }

    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(mergeCharacterData(data, { armor })) },
    });
    const view = toCharacterView(saved, deps.ctx.cpred);
    await emitCharacterUpsert(deps, campaignId, view);
    // The armour bar on the figure's card reads the sheet, so it has to hear.
    await emitTokensOfCharacter(deps, campaignId, saved);
    return view;
  },
});

/**
 * „Wezwanie Wsparcia" — the Lawman's radio (stage 30c, s. 158).
 *
 * Two dice and an Action, in that order and always in that order: the Action is
 * charged **whether or not anybody answers**, which is the sentence that makes
 * the rule a gamble rather than a button („Jeśli nikt nie odpowie na twoje
 * wezwanie, w kolejnej Turze możesz znów spróbować").
 *
 * The 1k10 lands on chat like every other roll that matters (stage 08), with
 * the verdict on the card: a player who has just spent their Action on a radio
 * that nobody picked up should be able to point at the die.
 */
export const characterBackupCallEvent = defineEvent<
  CharacterBackupCallPayload,
  { answered: boolean; rounds: number | null; tierId: string | null; secondGroup: boolean }
>({
  name: 'character:backup-call',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireCampaignCharacter(
      deps.ctx.prisma,
      campaignId,
      payload?.characterId,
    );
    const isGm = user.role === ROLE_GM;
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');

    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const rank = cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_BACKUP_ABILITY);
    if (rank === null) throw new RealtimeError('NO_ABILITY');
    const level = typeof payload?.level === 'number' ? Math.round(payload.level) : 0;
    const tier = cpredBackupTierAt(level);
    // „grupę Wsparcia o poziomie równym lub niższym wartości Zdolności
    // Specjalnej" — the ceiling is on *calling*, and it is checked here rather
    // than trusted from the client for the reason every ceiling in this project
    // is: the panel greys the button out, the server decides.
    if (!tier || level > rank) throw new RealtimeError('BACKUP_LEVEL_TOO_HIGH');

    // The figure standing on the map: it pays the Action and the officers turn
    // up beside it. A sheet on no scene calls for help in the fiction alone.
    let scene: Scene | null = null;
    let callerTokenId: string | null = null;
    let callerAt: { x: number; y: number } | null = null;
    if (payload?.tokenId !== undefined) {
      const found = await requireCampaignToken(deps.ctx.prisma, campaignId, payload.tokenId);
      if (found.token.characterId !== character.id) throw new RealtimeError('BAD_REQUEST');
      scene = found.scene;
      callerTokenId = found.token.id;
      callerAt = { x: found.token.x, y: found.token.y };
    }

    const gesture = sanitizeGesture(payload?.gesture);
    const rng = createMixedRng(gesture?.entropy);
    // A flat 1k10 against the rank, and a flat 1k6 for the wait. Neither is a
    // Skill Check, so neither explodes: „wyrzucić na 1k10 tyle, ile wynosi twój
    // poziom […] lub mniej" is a number to be under, not a total to beat.
    const call = rollFormula({ terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10 }] }, rng, {
      checkRule: false,
    });
    const wait = rollFormula({ terms: [{ kind: 'dice', sign: 1, count: 1, sides: 6 }] }, rng, {
      checkRule: false,
      plain: true,
    });
    const outcome = cpredBackupCall(rank, level, call.total, wait.total);
    const arriving = outcome.tierId ? cpredBackupTier(outcome.tierId) : null;

    call.title = `Wezwanie Wsparcia (poziom ${level})`;
    call.actor = character.name;
    call.outcome = {
      success: outcome.answered,
      label: outcome.answered ? 'Ktoś odpowiada' : 'Cisza w eterze',
      detail: outcome.answered
        ? `${call.total} ≤ ${rank} · ${arriving?.name ?? ''} za ${outcome.rounds} ` +
          `${roundsWord(outcome.rounds ?? 0)}${outcome.escalated ? ' · szóstka!' : ''}`
        : `${call.total} > ${rank} — spróbuj ponownie w kolejnej Turze`,
    };
    if (gesture && gesture.strength > 0) call.tossStrength = gesture.strength;
    if (gesture?.toss) call.toss = gesture.toss;

    // The Action first, so a refusal costs no dice — and only when the caller
    // has a figure in a running fight. `requireTurnSpend` waves through a token
    // that is not in one, which is exactly „poza walką".
    if (scene && callerTokenId) {
      await requireTurnSpend(
        deps,
        campaignId,
        scene,
        callerTokenId,
        { kind: 'action', actionId: CPRED_ACTION_BACKUP },
        user,
        CPRED_ACTION_BACKUP,
        { silent: false, note: `poziom ${level}: ${tier.name}` },
      );
    }

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: 'Wezwanie Wsparcia',
        payload: JSON.stringify(call),
        ...(scene ? { sceneId: scene.id } : {}),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    await deliverRollMessage(deps, campaignId, user.id, toChatMessageView(stored));

    if (!outcome.answered || !arriving) {
      return { answered: false, rounds: null, tierId: null, secondGroup: false };
    }
    // Nobody to arrive *to*: a sheet standing on no scene still gets its roll
    // and its chat card, and the GM places whatever the fiction needs.
    if (!scene) {
      return {
        answered: true,
        rounds: outcome.rounds,
        tierId: arriving.id,
        secondGroup: outcome.secondGroup,
      };
    }
    await scheduleBackup(deps, campaignId, scene, arriving, {
      rounds: outcome.rounds ?? 1,
      near: callerAt,
      callerTokenId,
      callerName: character.name,
      user,
      ...(outcome.secondGroup ? { awaitingSecond: true } : {}),
    });
    return {
      answered: true,
      rounds: outcome.rounds,
      tierId: arriving.id,
      secondGroup: outcome.secondGroup,
    };
  },
});

/** „za 1 Rundę" / „za 4 Rundy" / „za 5 Rund" — Polish counts three ways. */
function roundsWord(count: number): string {
  if (count === 1) return 'Rundę';
  const tens = count % 100;
  const ones = count % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return 'Rundy';
  return 'Rund';
}
