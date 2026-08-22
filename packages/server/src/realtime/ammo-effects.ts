import type {
  ChatMessageView,
  CpredAmmoCheck,
  CpredAmmoProfile,
  CpredRegistry,
  CpredTimedInjury,
  DamageLogEntry,
  RollForcedCheck,
  TokenHp,
} from '@vtt/shared';
import {
  cpredAmmoCheckOutcome,
  cpredCheckBase,
  criticalInjuryNames,
  describeAmmoFailure,
  formatMetres,
  parseCharacterData,
  parseRollNotation,
  rollFormula,
} from '@vtt/shared';
import type { Scene, Token } from '../generated/prisma/client.js';
import {
  applyForcedFailureToSheet,
  applyPeriodicDamageToTokenHp,
  describeSheetTimer,
  readSheetCombatProfile,
  sheetCombatProfile,
  sheetExpiryRound,
  sheetFromCombatProfile,
  sheetWoundStatuses,
  writeSheetStatusTimer,
  type SheetForcedFailure,
} from '../sheets.js';
import { buildCompendiumSync } from './compendium.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { INCLUDE_CHAT_NAMES, broadcastRedactedChatMessage, toChatMessageView } from './chat-io.js';
import { emitCombatOfScene } from './combat.js';
import { createMixedRng } from './dice-rng.js';
import { statusName } from '../statuses.js';
import { RealtimeError, type RealtimeDeps } from './registry.js';
import { emitTokensById, emitTokensOfCharacter } from './tokens.js';
import { oweCarryToToken } from './turn-effects.js';
import { activeRoundOfScene } from './timed-effects.js';

/**
 * Ammunition that hurts nobody directly (stage 16h).
 *
 * Seven rows of the rulebook's table — biotoxin, poison, sleep, tear gas,
 * flashbang, EMP and smoke — replace the damage roll with **a check the round
 * forces on whoever it reaches**. This module is that mechanism, and the reason
 * it is one mechanism rather than seven is that everything which differs
 * between those rows is in the catalogue entry: the skill, the DV, and what
 * failing costs.
 *
 * Three decisions from the session shape it:
 *
 *  - **the server rolls.** The check runs the moment the shot lands, exactly as
 *    suppressive fire has since stage 16. Waiting for seven players to press a
 *    button would leave a grenade unresolved, and a bot has no button to press;
 *  - **the failure lands like any other damage.** One `damage` card per victim,
 *    in the stage 15 shape — so „Cofnij" takes back the 3k6, the statuses and
 *    the wounds together, and the absolute HP stay redacted to the GM and the
 *    owner;
 *  - **the rows are filtered per viewer.** A card that names figures is a card
 *    that leaks the dark room it was thrown into (the bug 16d found and this
 *    stage closes for suppressive fire as well) — every row carries its owner.
 */

/** Somebody the round reached, and how far from it they were standing. */
export interface AmmoCheckTarget {
  token: Token;
  metres: number;
}

/**
 * Rolls the check for every target the round reached, applies what the failures
 * cost, and returns the rows the chat card lists.
 *
 * `source` is the round's own name — it ends up on the damage card, on the
 * status timer and in the GM's expiry prompt, so a minute later „skąd on to
 * ma?" has an answer without anybody remembering.
 */
export async function resolveAmmoChecks(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  scene: Scene,
  ammo: CpredAmmoProfile,
  targets: readonly AmmoCheckTarget[],
  authorId: string,
): Promise<RollForcedCheck[]> {
  const check = ammo.check;
  if (!check) return [];
  const rng = createMixedRng();
  const round = await activeRoundOfScene(deps, scene.id);
  const timed: CpredTimedInjury | null = check.failure.durationS
    ? {
        source: ammo.name,
        durationS: check.failure.durationS,
        ...(() => {
          const expires = sheetExpiryRound(round, check.failure.durationS);
          return expires === null ? {} : { expiresAtRound: expires };
        })(),
      }
    : null;

  // Loaded once: the injury table is campaign data and every failure reads the
  // same rows out of it.
  const needsInjuries = (check.failure.injuries ?? []).length > 0;
  const compendium = needsInjuries ? (await buildCompendiumSync(deps, campaignId)).entries : [];

  const rows: RollForcedCheck[] = [];
  for (const target of targets) {
    const base = await checkBaseOf(deps, registry, target.token, check);
    const outcome = cpredAmmoCheckOutcome(rng(10), base.total, check.dv);
    const detail = `${formatMetres(target.metres)} · ${base.label} ${outcome.die}+${
      outcome.modifier
    } = ${outcome.total} vs PT ${check.dv}`;

    if (outcome.resisted) {
      rows.push({
        name: target.token.name,
        detail: `${detail} — oparł się`,
        success: true,
        ownerId: await controllerOf(deps, target.token),
      });
      continue;
    }

    const applied = await applyAmmoFailure(deps, campaignId, scene, {
      token: target.token,
      ammo,
      check,
      timed,
      compendium,
      rng,
      authorId,
    });
    rows.push({
      name: target.token.name,
      detail,
      success: false,
      ownerId: await controllerOf(deps, target.token),
      effect: applied,
    });
  }
  return rows;
}

/**
 * What one target rolls the check on.
 *
 * A statist has no sheet, so its combat profile is dressed as one — the same
 * two-pass trick stage 16b uses to let an extra fire a gun, minus the second
 * pass: a forced check names its own skill, so there is nothing to look up in
 * the catalogue first.
 */
async function checkBaseOf(
  deps: RealtimeDeps,
  registry: CpredRegistry,
  token: Token,
  check: CpredAmmoCheck,
): Promise<{ total: number; label: string }> {
  if (token.characterId) {
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (character) {
      const base = cpredCheckBase(parseCharacterData(character.data, registry), registry, check);
      return { total: base.total, label: base.label };
    }
  }
  const profile = readSheetCombatProfile(token.combatProfile) ?? sheetCombatProfile({});
  const hp: TokenHp = { current: token.hpCurrent ?? 0, max: token.hpMax ?? 0 };
  const base = cpredCheckBase(sheetFromCombatProfile(profile, hp, null), registry, check);
  return { total: base.total, label: base.label };
}

/** Who may read a row naming this figure — its owner, or its sheet's owner. */
async function controllerOf(deps: RealtimeDeps, token: Token): Promise<string | null> {
  if (token.ownerId) return token.ownerId;
  if (!token.characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
    select: { ownerId: true },
  });
  return character?.ownerId ?? null;
}

/**
 * Applies one failure and posts the card that can take it back.
 *
 * Returns the one-line summary the attack card prints beside the roll, so the
 * table reads „nie oparł się — 3k6 bezpośrednich · na minutę" without opening
 * anything.
 */
async function applyAmmoFailure(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  input: {
    token: Token;
    ammo: CpredAmmoProfile;
    check: CpredAmmoCheck;
    timed: CpredTimedInjury | null;
    compendium: Awaited<ReturnType<typeof buildCompendiumSync>>['entries'];
    rng: (sides: number) => number;
    authorId: string;
  },
): Promise<string> {
  const { token, ammo, check, timed, compendium, rng, authorId } = input;
  const failure: SheetForcedFailure = {
    damage: rollFailureDamage(check.failure.damage, rng),
    ...(check.failure.injuries ? { injuryIds: check.failure.injuries } : {}),
    ...(timed ? { timed } : {}),
  };

  const notes: string[] = [];
  if (check.biologicalOnly) notes.push('tylko cele biologiczne');
  if (timed) notes.push(describeSheetTimer(timed));

  let log: DamageLogEntry;
  let characterId: string | null = null;
  let ownerId: string | null = token.ownerId;
  /** Nazwy ran figury bez karty — nigdzie nie zapisane, więc liczone tutaj. */
  let statistInjuries: string[] = [];

  if (token.characterId) {
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character) throw new RealtimeError('CHARACTER_NOT_FOUND');
    const applied = applyForcedFailureToSheet(character, deps.ctx.cpred, failure, compendium);
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: applied.data },
    });
    characterId = saved.id;
    ownerId = saved.ownerId;
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);
    // A wound drawn now may owe the *next* turn its Action (14e's spine rule) —
    // and a gas grenade lands on somebody else's turn as often as not.
    if (applied.carry) {
      await oweCarryToToken(deps, token.sceneId, token.id, applied.carry);
      await emitCombatOfScene(deps, campaignId, scene);
    }
    log = {
      ...applied.log,
      targetTokenId: token.id,
      targetName: token.name,
      characterId,
      targetOwnerId: ownerId,
    };
  } else {
    // A statist has nowhere to keep a Critical Injury, so the wound is reported
    // on the card and the GM rules it: inventing a sheet for an extra would be
    // a bigger change than the round is worth.
    const hp: TokenHp | null =
      token.hpMax === null ? null : { current: token.hpCurrent ?? 0, max: token.hpMax };
    const applied = hp ? applyPeriodicDamageToTokenHp(hp, failure.damage) : null;
    if (applied) {
      await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: {
          hpCurrent: applied.hp.current,
          statuses: JSON.stringify(
            sheetWoundStatuses(readTokenStatuses(token.statuses), applied.hp),
          ),
        },
      });
    }
    // Rana krytyczna nie ma gdzie zamieszkać, ale **nazwać** ją trzeba: to
    // jedyne miejsce, w którym stół dowiaduje się, co statyście się stało.
    statistInjuries = criticalInjuryNames(compendium, failure.injuryIds ?? []);
    log = {
      ...(applied?.log ?? emptyDamageLog()),
      targetTokenId: token.id,
      targetName: token.name,
      characterId: null,
      targetOwnerId: ownerId,
      ...(statistInjuries.length > 0
        ? {
            injuryNote: `${statistInjuries.join(', ')} — statysta nie ma karty, ranę krytyczną rozstrzyga MG.`,
          }
        : {}),
    };
  }

  // Statuses go on the token whether or not it has a sheet, and they carry the
  // timer: „Powalony i Nieprzytomny na minutę" is two rows in the data and one
  // sentence at the table.
  const added = await applyFailureStatuses(
    deps,
    campaignId,
    token.id,
    check.failure.statuses ?? [],
    {
      source: ammo.name,
      durationS: check.failure.durationS ?? 0,
      ...(timed?.expiresAtRound !== undefined ? { expiresAtRound: timed.expiresAtRound } : {}),
    },
  );

  const statusLabels = (check.failure.statuses ?? []).map((id) =>
    statusName(deps.ctx.statuses, id),
  );
  const sheetInjuries = [log.injury?.name, log.injuryExtra?.name].filter(
    (name): name is string => typeof name === 'string',
  );
  const injuryLabels = sheetInjuries.length > 0 ? sheetInjuries : statistInjuries;
  const summary = describeAmmoFailure(check.failure, {
    statuses: statusLabels,
    ...(injuryLabels.length > 0 ? { injuries: injuryLabels } : {}),
  });

  // What the GM's „Minęła minuta" button will lift. Only what this hit actually
  // put on: a status the target already carried is not this round's to end.
  const timedInjuryIds = [log.injury?.id, log.injuryExtra?.id].filter(
    (id): id is string => typeof id === 'string',
  );
  const entry: DamageLogEntry = {
    ...log,
    ammo: { name: ammo.name, ...(notes.length > 0 ? { notes } : {}) },
    ...(added.length > 0 ? { statusesAdded: added } : {}),
    ...(timed && (added.length > 0 || timedInjuryIds.length > 0)
      ? {
          timed: {
            ...(added.length > 0 ? { statusIds: added } : {}),
            ...(timedInjuryIds.length > 0 ? { injuryIds: timedInjuryIds } : {}),
            label: describeSheetTimer(timed),
          },
        }
      : {}),
  };
  await logAmmoFailure(deps, campaignId, authorId, entry, `${token.name} — ${ammo.name}`);
  return summary;
}

/**
 * Rolls the direct damage a failure costs, or 0 when the round only wounds.
 *
 * Rolled here rather than offered as a follow-up on purpose: „albo otrzymują
 * 3k6 obrażeń bezpośrednich" is the *consequence* of a check the server already
 * made, and splitting it across a button would leave a card that says somebody
 * failed and never says what it cost them.
 */
function rollFailureDamage(notation: string | undefined, rng: (sides: number) => number): number {
  if (!notation) return 0;
  const parsed = parseRollNotation(notation);
  if (!parsed.ok) return 0;
  return rollFormula(parsed.formula, rng).total;
}

/** Statuses this failure put on the token — the ones „Cofnij" takes off again. */
async function applyFailureStatuses(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  statusIds: readonly string[],
  timer: { source: string; durationS: number; expiresAtRound?: number },
): Promise<string[]> {
  if (statusIds.length === 0) return [];
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return [];
  const statuses = readTokenStatuses(token.statuses);
  const added: string[] = [];
  let statusData = token.statusData;
  for (const id of statusIds) {
    // An id this campaign does not know would sit on the token forever with no
    // badge to click and no rule to enforce it.
    if (!deps.ctx.statuses.ids.has(id)) continue;
    if (!statuses.includes(id)) {
      statuses.push(id);
      added.push(id);
    }
    if (timer.durationS > 0) statusData = writeSheetStatusTimer(statusData, id, timer);
  }
  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: { statuses: JSON.stringify(statuses), statusData },
  });
  await emitTokensById(deps, campaignId, [tokenId]);
  return added;
}

/** The undoable card, in the stage 15 shape „Cofnij" already understands. */
async function logAmmoFailure(
  deps: RealtimeDeps,
  campaignId: string,
  authorId: string,
  entry: DamageLogEntry,
  text: string,
): Promise<ChatMessageView> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: { campaignId, authorId, kind: 'damage', text, payload: JSON.stringify(entry) },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await broadcastRedactedChatMessage(deps, campaignId, view);
  return view;
}

/** A failure that cost no hit points still needs a card to carry the wound. */
function emptyDamageLog(): Omit<
  DamageLogEntry,
  'targetTokenId' | 'targetName' | 'characterId' | 'targetOwnerId'
> {
  return {
    location: 'body',
    locationLabel: 'ciało',
    damageRolled: 0,
    armorSp: 0,
    damageThrough: 0,
    doubled: false,
    bonusDamage: 0,
    hpLost: 0,
  };
}

function readTokenStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
