import type {
  AttackEvadePayload,
  AttackRollPayload,
  ChatMessageView,
  CpredAttackMeta,
  CpredAttackRequest,
  CpredCharacterData,
  CpredRegistry,
  ResolvedWeapon,
  RollAttackMeta,
  RollForcedCheck,
  RollGesture,
  RollResult,
  SessionUser,
  WeaponReloadPayload,
} from '@vtt/shared';
import {
  CPRED_ACTION_ATTACK,
  CPRED_ACTION_RELOAD,
  CPRED_EVASION_SKILL_ID,
  CPRED_SUPPRESSIVE_RANGE_M,
  ROLE_GM,
  concentrationBase,
  formatMetres,
  isTokenInFog,
  isWeaponEntry,
  mergeCharacterData,
  metresBetweenTokens,
  metresForRules,
  parseCharacterData,
  passiveEvasionDv,
  planCpredAttack,
  planCpredRoll,
  resolveCpredAttack,
  resolveWeapon,
  rollFormula,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import {
  SHEET_SUPPRESSED_STATUS_ID,
  sheetDodgeBlock,
  sheetHumanShieldCovers,
  sheetSituationModifiers,
} from '../sheets.js';
import { pinToken } from './turn-effects.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { grappleStateForToken, readTokenStatuses } from './combat.js';
import { requireTurnSpend } from './combat-actions.js';
import { requireRollableCharacter } from './character-rolls.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitTokensOfCharacter, requireCampaignToken, toTokenView } from './tokens.js';
import { buildCompendiumSync } from './compendium.js';
import { fetchFogState } from './fog-io.js';
import { toSceneView } from './scenes.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastRedactedChatMessage,
  deliverRollMessage,
  toChatMessageView,
} from './chat-io.js';
import { createMixedRng } from './dice-rng.js';
import { sanitizeGesture } from './chat.js';

/**
 * Attacks from the map (stage 16).
 *
 * The rule that shapes this module: **the client never sends a distance.** It
 * names an attacker, a weapon and a target token; the server reads both token
 * positions and the scene's scale, measures, and only then looks up the DV.
 * Anything else would let a client pick its own difficulty.
 *
 * The chain matches stage 15: the attack lands as a `roll` chat message whose
 * `attack` metadata carries the verdict and the follow-up damage notation, so
 * pressing „Obrażenia" is an ordinary damage roll that already knows its
 * target, and „Zastosuj" is the stage 15 flow, untouched.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

/**
 * The weapon row plus everything the catalogue knows about it. A row typed in
 * by hand resolves to nothing, which the planner rejects for ranged attacks —
 * without a range table there is no DV.
 */
async function resolveWeaponRow(
  deps: RealtimeDeps,
  campaignId: string,
  data: CpredCharacterData,
  weaponRowId: unknown,
): Promise<{
  row: CpredCharacterData['weapons'][number];
  resolved: ResolvedWeapon | null;
  typeId: string | null;
}> {
  if (typeof weaponRowId !== 'string') throw new RealtimeError('BAD_REQUEST');
  const row = data.weapons.find((weapon) => weapon.id === weaponRowId);
  if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
  if (!row.compendiumId) return { row, resolved: null, typeId: null };

  const compendium = await buildCompendiumSync(deps, campaignId);
  const entry = compendium.entries.find((candidate) => candidate.id === row.compendiumId);
  if (!entry || !isWeaponEntry(entry)) return { row, resolved: null, typeId: null };
  const weaponTypeById = new Map(compendium.weaponTypes.map((type) => [type.id, type]));
  return {
    row,
    resolved: resolveWeapon(entry, { weaponTypeById }),
    typeId: entry.weaponTypeId,
  };
}

/** The token doing the shooting: the one named, or the character's on that scene. */
async function resolveAttackerToken(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  sceneId: string,
  attackerTokenId: unknown,
): Promise<Token> {
  if (typeof attackerTokenId === 'string' && attackerTokenId.length > 0) {
    const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, attackerTokenId);
    if (token.characterId !== character.id) throw new RealtimeError('ATTACKER_NOT_LINKED');
    if (token.sceneId !== sceneId) throw new RealtimeError('ATTACKER_ON_OTHER_SCENE');
    return token;
  }
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) throw new RealtimeError('ATTACKER_NOT_ON_SCENE');
  return token;
}

/** Stand-in evasion DV of a target that has a sheet; undefined for a statist. */
async function targetEvasionDv(
  deps: RealtimeDeps,
  registry: CpredRegistry,
  token: Token,
): Promise<number | undefined> {
  if (!token.characterId) return undefined;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character) return undefined;
  return passiveEvasionDv(parseCharacterData(character.data, registry), registry);
}

/** Spends Luck and ammunition on the sheet in one write, and re-emits it. */
async function spendAttackCosts(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  meta: CpredAttackMeta,
  luckSpent: number,
): Promise<void> {
  if (luckSpent === 0 && meta.ammoCost === 0) return;
  const weapons = data.weapons.map((row) =>
    row.id === meta.weaponRowId ? { ...row, ammoCurrent: meta.ammoAfter } : row,
  );
  const updated = mergeCharacterData(data, {
    weapons,
    ...(luckSpent > 0 ? { luckCurrent: data.luckCurrent - luckSpent } : {}),
  });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(updated) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
}

/** „24 m (13–25 m) · PT 15 · magazynek 7/8" — the card's explanation line. */
function attackDetail(meta: CpredAttackMeta): string {
  const parts: string[] = [];
  if (!meta.melee) {
    parts.push(
      meta.rangeLabel
        ? `${formatMetres(meta.metres)} (${meta.rangeLabel})`
        : formatMetres(meta.metres),
    );
  } else {
    parts.push(`zwarcie · ${formatMetres(meta.metres)}`);
  }
  if (meta.dv !== null) {
    parts.push(
      meta.dvSource === 'evasion'
        ? `PT ${meta.dv} (Unik celu)`
        : meta.dvSource === 'everyday'
          ? `PT ${meta.dv} (bez karty — PT codzienny)`
          : `PT ${meta.dv}`,
    );
  }
  if (meta.mode !== 'single') parts.push(meta.modeLabel);
  if (meta.ammoCost > 0)
    parts.push(`magazynek ${meta.ammoAfter}/${meta.ammoCost + meta.ammoAfter}`);
  return parts.join(' · ');
}

/** Everyone the suppressing fire can reach: visible tokens within 25 m. */
async function suppressionTargets(
  deps: RealtimeDeps,
  scene: Scene,
  attacker: Token,
): Promise<{ token: Token; metres: number }[]> {
  const tokens = await deps.ctx.prisma.token.findMany({ where: { sceneId: scene.id } });
  const view = toSceneView(scene);
  const found: { token: Token; metres: number }[] = [];
  for (const token of tokens) {
    if (token.id === attacker.id) continue;
    const metres = metresForRules(
      metresBetweenTokens(toTokenView(attacker, true), toTokenView(token, true), view),
    );
    if (metres <= CPRED_SUPPRESSIVE_RANGE_M) found.push({ token, metres });
  }
  return found.sort((a, b) => a.metres - b.metres);
}

/**
 * Rolls each target's forced WILL + Concentration check against the volley.
 *
 * The rules make this check mandatory, so the server rolls it rather than
 * waiting for every target to pick up a cup — the criterion of the stage is
 * that suppressive fire *forces* the checks and logs them. Targets with no
 * sheet use their bare WILL of 5, the statist default.
 */
async function resolveSuppression(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  targets: { token: Token; metres: number }[],
  dv: number,
): Promise<RollForcedCheck[]> {
  const rng = createMixedRng();
  const checks: RollForcedCheck[] = [];
  for (const { token, metres } of targets) {
    let modifier = 5;
    if (token.characterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: token.characterId },
      });
      if (character)
        modifier = concentrationBase(parseCharacterData(character.data, registry), registry);
    }
    const die = rng(10);
    const total = die + modifier;
    // Ties go to the defender here too: the target has to *fail* to be pinned.
    const resisted = total > dv;
    checks.push({
      name: token.name,
      detail: `${formatMetres(metres)} · SW+Koncentracja ${die}+${modifier} = ${total} vs ${dv}${
        resisted ? '' : ' — do osłony'
      }`,
      success: resisted,
    });
    // Stage 14e closes the loop the card opened: whoever failed the check is
    // marked „Przygwożdżony" until the end of their own next turn. Soft by
    // design — the map has no cover model, so the status nags rather than
    // refuses, which is exactly what the POMYSLY entry from 28.07 asked for.
    if (!resisted) await pinToken(deps, campaignId, token.id, SHEET_SUPPRESSED_STATUS_ID);
  }
  return checks;
}

export const attackRollEvent = defineEvent<
  AttackRollPayload<CpredAttackRequest>,
  { messageId: number }
>({
  name: 'attack:roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);

    const { token: target, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.targetTokenId,
    );
    // A hidden token must not even be targetable by a player: a rejected
    // attack would tell them exactly where it stands. Unrevealed fog conceals
    // a token just as completely (stage 17), so it gets the same answer —
    // unless the player controls the token, in which case they can see it.
    if (user.role !== ROLE_GM) {
      if (target.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');
      const fog = await fetchFogState(deps.ctx.prisma, scene);
      const controlledByPlayer =
        target.ownerId === user.id ||
        (target.characterId !== null && target.characterId === character.id);
      if (
        fog.enabled &&
        !controlledByPlayer &&
        isTokenInFog(toTokenView(target, false), toSceneView(scene), fog)
      ) {
        throw new RealtimeError('TOKEN_NOT_FOUND');
      }
    }

    const attacker = await resolveAttackerToken(
      deps,
      campaignId,
      character,
      target.sceneId,
      payload?.attackerTokenId,
    );
    if (attacker.id === target.id) throw new RealtimeError('BAD_REQUEST');

    const sceneView = toSceneView(scene);
    const metres = metresForRules(
      metresBetweenTokens(toTokenView(attacker, true), toTokenView(target, true), sceneView),
    );

    const weapon = await resolveWeaponRow(deps, campaignId, data, payload?.request?.weaponRowId);
    // Being in a Hold is −2 to everything and takes two-handed weapons away
    // (stage 14d). Read from the tracker, never from the request.
    const attackerGrapple = await grappleStateForToken(deps.ctx.prisma, scene.id, attacker.id);
    const planned = planCpredAttack(
      data,
      registry,
      payload?.request ?? ({} as CpredAttackRequest),
      weapon,
      {
        name: target.name,
        tokenId: target.id,
        metres,
        ...(weapon.resolved?.melee
          ? { evasionDv: await targetEvasionDv(deps, registry, target) }
          : {}),
      },
      {
        modifiers: sheetSituationModifiers({
          grappled: attackerGrapple.grappled,
          injuries: data.criticalInjuries,
        }),
        ...(attackerGrapple.grappled ? { grappled: true } : {}),
      },
    );
    if (!planned.ok) throw new RealtimeError(planned.error);
    const { plan } = planned;
    const meta = plan.attack;

    // The turn budget is charged *before* anything is spent for real: an attack
    // that has no Action left must not eat ammunition or Luck on its way to the
    // refusal. „Liczba Ataków" decides whether this one fits (stage 14b).
    await requireTurnSpend(
      deps,
      campaignId,
      scene,
      attacker.id,
      {
        kind: 'attack',
        weaponRowId: meta.weaponRowId,
        weaponName: meta.weaponName,
        rof: weapon.resolved?.rof ?? 1,
        ...(meta.aimed ? { aimed: true } : {}),
      },
      user,
      CPRED_ACTION_ATTACK,
      // The roll card that follows says „Zgrzyt → Kurier" already; a second
      // line reading „Vex — Atak" underneath it is noise.
      { silent: true },
    );

    await spendAttackCosts(deps, campaignId, character, data, meta, plan.luckSpent);

    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);
    const result: RollResult = rollFormula(plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });
    result.title = plan.title;
    result.actor = character.name;
    result.breakdown = plan.breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    result.attack = await buildAttackMeta(
      deps,
      campaignId,
      registry,
      result,
      meta,
      scene,
      attacker,
    );
    // „Dopóki zasłaniasz się Ludzką tarczą, uznaje się, że jesteś za osłoną"
    // (s. 178). Cover is not in the map model, so this is a line on the card
    // rather than a modifier — the GM rules on it, which is the stage's
    // declared limit, not an oversight.
    const targetGrapple = await grappleStateForToken(deps.ctx.prisma, scene.id, target.id);
    if (
      targetGrapple.shieldOf &&
      sheetHumanShieldCovers({ melee: meta.melee, aimedAtHead: meta.aimed })
    ) {
      result.attack.detail = `${result.attack.detail} · cel zasłania się Ludzką tarczą (${targetGrapple.shieldOf.token.name}) — traktuj jak osłonę`;
    }

    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind: 'roll',
        text: plan.title,
        payload: JSON.stringify(result),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    await deliverRollMessage(deps, campaignId, user.id, view);
    return { messageId: view.id };
  },
});

/** The verdict block the chat card renders, including suppressive fire's checks. */
async function buildAttackMeta(
  deps: RealtimeDeps,
  campaignId: string,
  registry: CpredRegistry,
  result: RollResult,
  meta: CpredAttackMeta,
  scene: Scene,
  attacker: Token,
): Promise<RollAttackMeta> {
  const label = `${meta.weaponName} → ${meta.targetName}`;

  if (meta.dv === null) {
    // Suppressive fire sets the DV instead of beating one.
    const targets = await suppressionTargets(deps, scene, attacker);
    const checks = await resolveSuppression(deps, campaignId, registry, targets, result.total);
    return {
      system: { ...meta },
      label: `${meta.weaponName} → ogień zaporowy`,
      detail: `${attackDetail(meta)} · PT dla celów ${result.total} · w zasięgu ${formatMetres(
        CPRED_SUPPRESSIVE_RANGE_M,
      )}: ${targets.length}`,
      forcedChecks: checks,
    };
  }

  const outcome = resolveCpredAttack(result.total, meta.dv, meta.autofireMax);
  const detail = outcome.hit
    ? `${attackDetail(meta)}${
        outcome.multiplier
          ? ` · przerzut o ${outcome.margin} → obrażenia ×${outcome.multiplier}`
          : ''
      }`
    : `${attackDetail(meta)} · brakło ${Math.abs(outcome.margin) + 1}`;

  return {
    system: {
      ...meta,
      margin: outcome.margin,
      ...(outcome.multiplier ? { multiplier: outcome.multiplier } : {}),
    },
    label,
    detail,
    hit: outcome.hit,
    targetTokenId: meta.targetTokenId,
    ...(outcome.hit
      ? {
          damageNotation: meta.damage,
          ...(outcome.multiplier && outcome.multiplier > 1
            ? { damageMultiplier: outcome.multiplier }
            : {}),
        }
      : {}),
  };
}

/**
 * The defender contests an attack after the fact (stage 16 decision): the DV
 * from the range table is replaced by a real DEX + Evasion roll and the stored
 * attack card is rewritten. RAW lets a defender with REF 8+ make this choice
 * for ranged attacks and always for melee; the check on REF is deliberately
 * left to the table, because a GM may rule that a target saw the shot coming.
 */
export const attackEvadeEvent = defineEvent<AttackEvadePayload, { total: number; hit: boolean }>({
  name: 'attack:evade',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    if (typeof payload?.messageId !== 'number' || !Number.isInteger(payload.messageId)) {
      throw new RealtimeError('BAD_REQUEST');
    }
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: payload.messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (!message || message.campaignId !== campaignId || !message.payload) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const roll = JSON.parse(message.payload) as RollResult;
    const meta = roll.attack?.system as CpredAttackMeta | undefined;
    if (!roll.attack || !meta || meta.dv === null) throw new RealtimeError('NOT_AN_ATTACK');
    if (roll.attack.evaded) throw new RealtimeError('ALREADY_EVADED');

    // Only the target's own sheet may dodge — and only its owner or the GM.
    const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
    const target = await deps.ctx.prisma.token.findUnique({ where: { id: meta.targetTokenId } });
    if (!target || target.characterId !== character.id) throw new RealtimeError('NOT_THE_TARGET');

    // „Dopóki ją trzymasz, twoja Ludzka tarcza nie może unikać Ataków
    // dystansowych, nawet jeśli jej REF wynosi 8 lub więcej" (s. 178). Melee is
    // untouched: being a shield does not stop you ducking a machete.
    const defence = await grappleStateForToken(deps.ctx.prisma, target.sceneId, target.id);
    if (defence.humanShield && !meta.melee) throw new RealtimeError('SHIELD_CANNOT_DODGE');
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    // A dodge is a reaction, not an Action, so the Hold's −2 stays off it
    // (stage 14d decision) — but the status table still gets a say, and from
    // stage 14e so do the Critical Injuries: „Odcięta noga … nie możesz Unikać
    // ataków" lives on the sheet, not on the token.
    const dodgeBlock = sheetDodgeBlock(readTokenStatuses(target.statuses), data.criticalInjuries);
    if (dodgeBlock) throw new RealtimeError('DODGE_BLOCKED');

    const planned = planCpredRoll(data, registry, {
      kind: 'skill',
      skillId: CPRED_EVASION_SKILL_ID,
    });
    if (!planned.ok) throw new RealtimeError(planned.error);

    const gesture: RollGesture | undefined = sanitizeGesture(payload.gesture);
    const evasion = rollFormula(planned.plan.formula, createMixedRng(gesture?.entropy), {
      checkRule: true,
    });

    // The dodge replaces the DV: the attacker's original total now has to beat
    // the defender's roll, and ties still go to the defender.
    const outcome = resolveCpredAttack(roll.total, evasion.total, meta.autofireMax);
    const updated: RollResult = {
      ...roll,
      attack: {
        ...roll.attack,
        hit: outcome.hit,
        evaded: true,
        detail: `${roll.attack.detail} · Unik ${character.name}: ${evasion.total} → ${
          outcome.hit ? 'trafienie mimo uniku' : 'pudło'
        }`,
        ...(outcome.hit
          ? {
              damageNotation: meta.damage,
              ...(outcome.multiplier && outcome.multiplier > 1
                ? { damageMultiplier: outcome.multiplier }
                : {}),
            }
          : { damageNotation: undefined, damageMultiplier: undefined }),
      },
    };
    const saved = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(updated) },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(saved), 'chat:update');
    return { total: evasion.total, hit: outcome.hit };
  },
});

/**
 * Charges an Action to whichever token the character is playing on the scene
 * this socket is looking at. Outside a running fight — and for a character with
 * no token on that scene — there is no budget to charge and nothing happens.
 */
async function spendCharacterAction(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string | null,
  character: Character,
  user: SessionUser,
): Promise<void> {
  if (!sceneId) return;
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) return;
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) return;
  await requireTurnSpend(
    deps,
    campaignId,
    scene,
    token.id,
    { kind: 'action', actionId: CPRED_ACTION_RELOAD },
    user,
    CPRED_ACTION_RELOAD,
  );
}

/** Reloading: an Action at the table, one click here. */
export const weaponReloadEvent = defineEvent<WeaponReloadPayload, { ammo: number }>({
  name: 'weapon:reload',
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const character = await requireRollableCharacter(deps, campaignId, user, payload?.characterId);
    const registry = deps.ctx.cpred;
    const data = parseCharacterData(character.data, registry);
    const row = data.weapons.find((weapon) => weapon.id === payload?.weaponRowId);
    if (!row) throw new RealtimeError('UNKNOWN_WEAPON');
    if (row.ammoMax <= 0) throw new RealtimeError('WEAPON_HAS_NO_MAGAZINE');
    // A full magazine costs nothing: the click was a misfire, not an Action.
    if (row.ammoCurrent >= row.ammoMax) return { ammo: row.ammoCurrent };

    // „Przeładowanie — Załadowujesz magazynek do pełna" is an Action (s. 169).
    // Unlike an attack it produces no card of its own, so the chat line is the
    // only trace the table gets — hence not silent.
    await spendCharacterAction(deps, campaignId, socket.data.viewedSceneId, character, user);

    const weapons = data.weapons.map((weapon) =>
      weapon.id === row.id ? { ...weapon, ammoCurrent: row.ammoMax } : weapon,
    );
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(mergeCharacterData(data, { weapons })) },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, registry));
    return { ammo: row.ammoMax };
  },
});
