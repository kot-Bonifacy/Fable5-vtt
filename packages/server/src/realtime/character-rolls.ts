import type {
  CheckCallEntry,
  ChatMessageView,
  CharacterRollPayload,
  CpredAmmoProfile,
  CpredCharacterData,
  CpredCareMode,
  CpredCriticalInjuryRow,
  CpredPatchedInjury,
  CpredRollContext,
  CpredRollRequest,
  CpredWoundState,
  RollGesture,
  RollResult,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_STABILIZE,
  CPRED_CHARISMA_AUDIENCE_LABELS,
  CPRED_CHARISMA_REFUSAL_DAYS,
  CPRED_MINUTE_S,
  CPRED_RUMOUR_TIERS,
  CPRED_MELEE_REACH_M,
  CPRED_STABILIZE_DV,
  DEATH_SAVES_MAX,
  ROLE_GM,
  combatProfileRollableSkills,
  cpredAudienceBelieves,
  cpredRumourHeard,
  cpredCareOptions,
  cpredCarePermanent,
  cpredCheckOutcome,
  hitLocationLabel,
  hpMax,
  isCpredAimPoint,
  mergeCharacterData,
  metresBetweenTokens,
  metresForRules,
  parseCharacterData,
  planCpredRoll,
  resolveCpredDeathSave,
  rollFormula,
  sanitizeCriticalInjuryRows,
  woundState,
  woundStateFromHp,
} from '@vtt/shared';
import type { Character, Token } from '../generated/prisma/client.js';
import { emitMapFx, fxCentre } from './fx.js';
import {
  readSheetCombatProfile,
  sheetExpiryRound,
  sheetFromCombatProfile,
  sheetSituationModifiers,
  sheetTokenHp,
  SHEET_UNCONSCIOUS_STATUS_ID,
} from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { grappleStateForToken } from './combat.js';
import { addTokenStatus } from './grapple-state.js';
import { activeRoundOfScene } from './timed-effects.js';
import { requireTurnSpend } from './combat-actions.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  emitTokensById,
  emitTokensOfCharacter,
  requireCampaignToken,
  toTokenView,
} from './tokens.js';
import { toSceneView } from './scenes.js';
import {
  INCLUDE_CHAT_NAMES,
  deliverChatMessageTo,
  deliverRollMessage,
  toChatMessageView,
} from './chat-io.js';
import { emitCheckCallUpdate, resolveAnsweredCall } from './checks.js';
import { sanitizeGesture } from './chat.js';

/**
 * Sheet-driven checks (stage 08). The client only sends an intention — which
 * skill/stat, the situational modifier, how much Luck to spend and whether
 * the result is public. The server re-derives every modifier from the stored
 * sheet (including the automatic wound penalty), spends the Luck, rolls with
 * its own RNG and delivers the result like any other roll:
 * public → campaign broadcast with a seq, GM → targeted to the author and GMs.
 */

/** Rolling a character requires owning it (the GM may roll anything). */
export async function requireRollableCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  characterId: unknown,
): Promise<Character> {
  if (typeof characterId !== 'string' || characterId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
  // Unknown and foreign characters are indistinguishable to a player — the
  // existence of someone else's sheet must not leak.
  if (!character || character.campaignId !== campaignId) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  if (user.role !== ROLE_GM && character.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  return character;
}

/**
 * Who is making this roll: a sheet, or a figure that has none (stage 16b).
 *
 * The same shape `AttackSource` has in `attacks.ts`, and for the same reason —
 * both arms carry a `CpredCharacterData`, so the planner, the breakdown and the
 * chat card never learn that statists exist. What differs is only where the
 * numbers came from and what may be written back afterwards: a synthesised
 * sheet has nowhere to record spent Luck or a Death Save, which is why the two
 * places that write are the only ones that ask which arm this is.
 */
type RollSource =
  | { kind: 'character'; character: Character; data: CpredCharacterData }
  | { kind: 'statist'; token: Token; data: CpredCharacterData };

/** Name the card names as the actor — the sheet's, or the token's. */
function rollSourceName(source: RollSource): string {
  return source.kind === 'character' ? source.character.name : source.token.name;
}

/**
 * The figure this roll is made with.
 *
 * Naming no character means „the token itself is rolling", exactly as it does
 * for `attack:roll` — and the refusals reuse the codes the character path
 * already speaks, so the client's error table did not have to grow a second
 * vocabulary for the same two answers.
 *
 * Dwa rodzaje rzutu przychodzą tędy. **Obrażenia** — od 16b, bo strzał figury
 * bez karty musi mieć czym zranić. I **Test Umiejętności**, od 31.08, ale
 * wyłącznie takiej, którą ta figura ma wpisaną w profilu
 * (`combatProfileRollableSkills`): agent federalny rzuca Wartością bojową
 * w piętnastu Umiejętnościach z s. 159, a ganger, któremu nikt niczego nie
 * wpisał, dalej nie rzuca niczym poza bronią i Unikiem. Bez tego warunku jedna
 * liczba `skillLevel` uczyniłaby każdego statystę biegłym w Kryptografii.
 *
 * Reszta ma własne zdarzenia (`attack:roll` strzela, `attack:evade` uskakuje),
 * a dwie rzeczy, których ta droga nie uniesie — wydanie Szczęścia i zapis Rzutu
 * na Śmierć — potrzebują karty, na której da się je zapisać.
 */
async function resolveRollSource(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  payload: CharacterRollPayload<CpredRollRequest> | undefined,
  request: CpredRollRequest,
): Promise<RollSource> {
  const registry = deps.ctx.cpred;
  if (typeof payload?.characterId === 'string' && payload.characterId.length > 0) {
    const character = await requireRollableCharacter(deps, campaignId, user, payload.characterId);
    return { kind: 'character', character, data: parseCharacterData(character.data, registry) };
  }

  const skillRoll = request.kind === 'skill';
  if (request.kind !== 'damage' && !skillRoll) {
    throw new RealtimeError('STATIST_CANNOT_ROLL_THIS');
  }
  if (typeof payload?.attackerTokenId !== 'string' || payload.attackerTokenId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const { token } = await requireCampaignToken(
    deps.ctx.prisma,
    campaignId,
    payload.attackerTokenId,
  );
  // A statist has no owner in the sheet sense, so control follows the token.
  if (user.role !== ROLE_GM && token.ownerId !== user.id) {
    throw new RealtimeError('CHARACTER_NOT_FOUND');
  }
  const profile = readSheetCombatProfile(token.combatProfile);
  if (!profile) throw new RealtimeError('TOKEN_HAS_NO_PROFILE');
  // Ta sama odmowa co przy rzucie, którego statysta nie umie zrobić w ogóle:
  // Umiejętność spoza profilu nie istnieje dla tej figury, a nie „istnieje na
  // poziomie broni". Kod odmowy jest ten sam, bo z miejsca gracza to jedno
  // zdanie — „ta figura tak nie rzuca".
  const skillId = typeof request.skillId === 'string' ? request.skillId : '';
  if (skillRoll && !combatProfileRollableSkills(profile).includes(skillId)) {
    throw new RealtimeError('STATIST_CANNOT_ROLL_THIS');
  }
  // The same synthesis the shot itself was rolled from, so the weapon that
  // fired and the weapon that wounds cannot disagree: its one row is the row
  // the attack card points back at.
  return {
    kind: 'statist',
    token,
    data: sheetFromCombatProfile(profile, sheetTokenHp(token), skillRoll ? skillId : null),
  };
}

/** The natural die of a roll — the first die of the first dice term. */
function firstDieRoll(result: RollResult): number {
  for (const term of result.terms) {
    if (term.kind === 'dice' && term.rolls.length > 0) return term.rolls[0]!;
  }
  return 0;
}

/**
 * Books a Death Save on the sheet: the counter makes every later save harder
 * (RAW +1 each), and a failed one marks the character dead — a status the GM
 * can lift, because at the table „umierasz" is still a scene, not a checkbox.
 */
async function recordDeathSave(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  data: CpredCharacterData,
  survived: boolean,
): Promise<void> {
  const updated = mergeCharacterData(data, {
    deathSaves: Math.min(data.deathSaves + 1, DEATH_SAVES_MAX),
  });
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(updated) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  if (!survived) await markTokensDead(deps, campaignId, saved.id);
}

/** Puts the „Martwy" badge on every token bound to the character. */
async function markTokensDead(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({
    where: { characterId },
    include: { scene: true },
  });
  const changed: string[] = [];
  for (const row of tokens) {
    if (row.scene.campaignId !== campaignId) continue;
    let statuses: string[];
    try {
      const parsed: unknown = JSON.parse(row.statuses);
      statuses = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      statuses = [];
    }
    if (statuses.includes(DEAD_STATUS_ID)) continue;
    await deps.ctx.prisma.token.update({
      where: { id: row.id },
      data: { statuses: JSON.stringify([...statuses, DEAD_STATUS_ID]) },
    });
    changed.push(row.id);
  }
  if (changed.length > 0) await emitTokensById(deps, campaignId, changed);
}

/** Status id from `data/public/cpred/statuses.json`. */
const DEAD_STATUS_ID = 'dead';

/** Charges the Action „Ustabilizowanie" costs to the medic's own token. */
async function spendStabilizeAction(
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
    { kind: 'action', actionId: CPRED_ACTION_STABILIZE },
    user,
    CPRED_ACTION_STABILIZE,
    // The roll card that follows says „Ustabilizowanie → Vex" already.
    { silent: true },
  );
}

/**
 * Fills in the parts of a damage request that follow from an attack (stage 16).
 *
 * The client sends `attackMessageId` and nothing else about the damage; the
 * notation, the autofire multiplier, the hit location and the target all come
 * off the stored attack, so nobody can roll a ×4 burst that never happened.
 */
async function resolveRollRequest(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  payload: CharacterRollPayload<CpredRollRequest> | undefined,
): Promise<CpredRollRequest> {
  const request: CpredRollRequest = { ...(payload?.request ?? ({} as CpredRollRequest)) };
  // Never trust these off the wire — they are server-filled by design.
  delete request.damageNotation;
  delete request.damageMultiplier;
  delete request.targetTokenId;
  delete request.targetCoverId;
  delete request.areaTargets;
  delete request.ammo;
  delete request.stabilizeDv;
  delete request.stabilizeTargetName;
  delete request.treatDv;
  delete request.treatPermanent;
  delete request.treatInjuryName;
  delete request.treatTargetName;
  if (request.kind === 'stabilize') {
    return resolveStabilizeRequest(deps, campaignId, user, request);
  }
  if (request.kind === 'treatInjury') {
    return resolveTreatInjuryRequest(deps, campaignId, user, request, payload?.characterId);
  }
  if (request.kind !== 'damage' || request.attackMessageId === undefined) return request;

  if (!Number.isInteger(request.attackMessageId)) throw new RealtimeError('BAD_REQUEST');
  const message = await deps.ctx.prisma.chatMessage.findUnique({
    where: { id: request.attackMessageId },
  });
  if (!message || message.campaignId !== campaignId || !message.payload) {
    throw new RealtimeError('MESSAGE_NOT_FOUND');
  }
  const roll = JSON.parse(message.payload) as RollResult;
  const attack = roll.attack;
  // A charge that missed still went off — it just went off somewhere else
  // (s. 174, stage 16d). „Nie trafiłeś" is about the square that was aimed at,
  // so an area card offers its damage on both branches; everything else still
  // needs a hit before there is anything to roll.
  if (!attack || (attack.hit !== true && !attack.area)) throw new RealtimeError('NOT_A_HIT');

  const system = attack.system as {
    location?: unknown;
    weaponRowId?: unknown;
    ammo?: CpredAmmoProfile;
    aimedAt?: unknown;
    halvesArmor?: unknown;
    weakSpot?: unknown;
  };
  return {
    ...request,
    ...(typeof system.weaponRowId === 'string' ? { weaponRowId: system.weaponRowId } : {}),
    // The round that was actually fired, off the stored attack — the magazine
    // may hold something else by now, and the shot was fired then (stage 16g).
    ...(system.ammo ? { ammo: system.ammo } : {}),
    ...(system.location === 'head' ? { location: 'head' as const } : { location: 'body' as const }),
    // The Aimed Shot the −8 was paid for (s. 170), from the same stored card:
    // the leg breaks because of the attack that happened, not because of what
    // the client says now.
    ...(isCpredAimPoint(system.aimedAt) ? { aimedAt: system.aimedAt } : {}),
    // „Obrażenia zadane każdym rodzajem broni białej ignorują połowę pancerza"
    // (s. 176) — decided by the attack, carried by its card, applied when the
    // damage lands. A client saying so itself would be halving armour at will.
    ...(system.halvesArmor === true ? { halvesArmor: true as const } : {}),
    // „Wykrycie słabości" was earned when the Attack landed, not now: the
    // server booked it against the Round back then and wrote the number onto
    // the card. Here it is only read (stage 30a).
    ...(Number.isInteger(system.weakSpot) && (system.weakSpot as number) > 0
      ? { weakSpot: system.weakSpot as number }
      : {}),
    ...(attack.damageNotation ? { damageNotation: attack.damageNotation } : {}),
    ...(attack.damageMultiplier ? { damageMultiplier: attack.damageMultiplier } : {}),
    ...(attack.targetTokenId ? { targetTokenId: attack.targetTokenId } : {}),
    ...(attack.targetCoverId !== undefined ? { targetCoverId: attack.targetCoverId } : {}),
    // Only the ones the blast actually reached: whoever a wall spared, or who
    // jumped clear, is not on the list „Zastosuj wszystkim" works from.
    ...(attack.area
      ? { areaTargets: attack.area.targets.filter((target) => target.spared === undefined) }
      : {}),
  };
}

/**
 * Fills in what „Ustabilizowanie" needs from the *target* (stage 14b): the DV
 * follows from their wound threshold, so it is read here rather than taken from
 * the client — otherwise a medic could declare their patient lightly wounded.
 *
 * A hidden token is invisible to a player in every other path, and stabilizing
 * is no exception: they may not even confirm it exists.
 */
async function resolveStabilizeRequest(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  request: CpredRollRequest,
): Promise<CpredRollRequest> {
  const tokenId = request.stabilizeTokenId;
  if (typeof tokenId !== 'string' || tokenId.length === 0) throw new RealtimeError('BAD_REQUEST');
  const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  if (user.role !== ROLE_GM && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');

  let state: CpredWoundState;
  if (token.characterId) {
    const target = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!target) throw new RealtimeError('TOKEN_NOT_FOUND');
    const targetData = parseCharacterData(target.data, deps.ctx.cpred);
    state = woundState(targetData.hpCurrent, targetData.stats);
  } else if (token.hpCurrent !== null && token.hpMax !== null && token.hpMax > 0) {
    state = woundStateFromHp(token.hpCurrent, token.hpMax);
  } else {
    // A statist with no HP at all has no wound threshold to read; the everyday
    // rung is the honest default and the GM can still modify the roll.
    state = 'light';
  }
  return {
    ...request,
    stabilizeDv: CPRED_STABILIZE_DV[state],
    stabilizeTargetName: token.name,
  };
}

/**
 * „Ustabilizowanie jest Akcją" — a więc czynnością wykonywaną **przy** pacjencie.
 *
 * Podręcznik nie podaje dla niej zasięgu, i przez to VTT nie sprawdzał żadnego:
 * serwer żądał wyłącznie, żeby cel był widocznym żetonem kampanii, więc
 * „ratuję go z drugiego końca ulicy" przechodziło bez słowa. Zasięgiem jest
 * długość ramienia — ta sama, którą mierzy Pochwycenie i atak wręcz — bo
 * czynnością jest dotknięcie rannego, a nie wycelowanie w niego.
 *
 * Mierzone **wszystkim, MG włącznie**, dokładnie jak w Pochwyceniu. To wyjątek
 * od zwyczaju „MG omija blokady" i jest świadomy: MG stabilizuje figurą, która
 * stoi na mapie, więc odległość jest dla niego równie prawdziwa jak dla gracza,
 * a jedyną drogą naokoło i tak zostaje wpisanie PW ręką w karcie.
 *
 * Medyk bez żetonu na scenie pacjenta dostaje odmowę, a nie zwolnienie:
 * karta postaci, która nigdzie nie stoi, nie stoi też przy rannym.
 */
async function requireStabilizeReach(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  targetTokenId: string,
): Promise<void> {
  const { token: target, scene } = await requireCampaignToken(
    deps.ctx.prisma,
    campaignId,
    targetTokenId,
  );
  // Ustabilizowanie samego siebie („w tym siebie", s. 222) — odległość zero,
  // i nie ma sensu szukać drugiego żetonu tej samej postaci.
  if (target.characterId === character.id) return;

  const healer = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId: target.sceneId },
  });
  if (!healer) throw new RealtimeError('STABILIZE_NOT_ON_SCENE');

  const metres = metresForRules(
    metresBetweenTokens(toTokenView(healer, true), toTokenView(target, true), toSceneView(scene)),
  );
  if (metres > CPRED_MELEE_REACH_M) throw new RealtimeError('STABILIZE_OUT_OF_REACH');
}

/**
 * Fills in what „Leczenie" needs from the *wound* (stage 30b).
 *
 * The DV is not the client's to name, for exactly the reason `stabilizeDv` is
 * not: it is printed beside the injury the target is carrying, and reading it
 * here is the only way a medic cannot declare a severed arm a PT 13 job. Which
 * branch of the sentence is being rolled *is* the client's choice — the
 * rulebook offers two on half the table — so `treatSkillId` is honoured, and
 * refused when the wound does not offer it.
 */
async function resolveTreatInjuryRequest(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  request: CpredRollRequest,
  healerCharacterId: string | undefined,
): Promise<CpredRollRequest> {
  const tokenId = request.treatTokenId;
  const injuryId = request.treatInjuryId;
  if (typeof tokenId !== 'string' || typeof injuryId !== 'string') {
    throw new RealtimeError('BAD_REQUEST');
  }
  const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  if (user.role !== ROLE_GM && token.hidden) throw new RealtimeError('TOKEN_NOT_FOUND');

  const mode: CpredCareMode = request.treatMode === 'quickFix' ? 'quickFix' : 'treatment';
  // „Można łatać samego siebie … Nie można leczyć samego siebie" (s. 223) —
  // the one place the two modes differ before the dice are rolled.
  if (
    mode === 'treatment' &&
    healerCharacterId !== undefined &&
    token.characterId === healerCharacterId
  ) {
    throw new RealtimeError('SELF_TREATMENT');
  }
  const injury = (await treatableInjuries(deps, token)).find((row) => row.id === injuryId);
  if (!injury) throw new RealtimeError('INJURY_NOT_FOUND');
  // A wound whose effects are already talked down has nothing left for the
  // quick fix to do; the treatment that takes it off for good still does.
  if (mode === 'quickFix' && injury.patched) throw new RealtimeError('INJURY_ALREADY_PATCHED');
  const options = cpredCareOptions(injury, mode);
  const option = options.find((entry) => entry.skillId === request.treatSkillId);
  // „Nd." — a severed arm has no quick fix and a wound whose sentence the VTT
  // cannot read has no roll either. Both say the same thing to the table.
  if (!option) throw new RealtimeError('NO_TREATMENT');
  return {
    ...request,
    treatMode: mode,
    treatDv: option.dv,
    treatPermanent: cpredCarePermanent(injury, mode),
    treatInjuryName: injury.name,
    treatTargetName: token.name,
  };
}

/** Wounds this figure carries — a sheet's rows, or a statist's profile ones. */
async function treatableInjuries(
  deps: RealtimeDeps,
  token: Token,
): Promise<CpredCriticalInjuryRow[]> {
  if (token.characterId) {
    const target = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!target) throw new RealtimeError('TOKEN_NOT_FOUND');
    return parseCharacterData(target.data, deps.ctx.cpred).criticalInjuries;
  }
  return readSheetCombatProfile(token.combatProfile)?.criticalInjuries ?? [];
}

/**
 * Applies a successful care roll, wherever this figure keeps its wounds.
 *
 * A statist has carried Critical Injuries since 29.08, so treating one has to
 * reach the token's `combatProfile` as well as a sheet — otherwise the Medyk
 * could heal the party and not the thug bleeding next to them, which is not a
 * distinction any rule makes.
 *
 * What a success does depends on the mode: „Leczenie" takes the row away,
 * „Łatanie" leaves it and silences it (`patched`). The row itself is rewritten
 * rather than filtered out in the second case, so the sheet keeps saying the
 * arm is broken — which it is.
 */
async function applyTreatment(
  deps: RealtimeDeps,
  campaignId: string,
  targetTokenId: string,
  injuryId: string,
  patch: CpredPatchedInjury | null,
): Promise<boolean> {
  const rewrite = (rows: readonly CpredCriticalInjuryRow[]): CpredCriticalInjuryRow[] =>
    patch === null
      ? rows.filter((row) => row.id !== injuryId)
      : rows.map((row) => (row.id === injuryId ? { ...row, patched: patch } : row));
  // The id came off a plan whose token `resolveTreatInjuryRequest` already
  // proved belongs to this campaign — the same bargain `applyStabilization`
  // makes with its own target.
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: targetTokenId } });
  if (!token) return false;
  if (token.characterId) {
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character) return false;
    const data = parseCharacterData(character.data, deps.ctx.cpred);
    if (!data.criticalInjuries.some((row) => row.id === injuryId)) return false;
    const merged = mergeCharacterData(data, {
      criticalInjuries: rewrite(data.criticalInjuries),
    });
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: JSON.stringify(merged) },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);
    return true;
  }
  const profile = readSheetCombatProfile(token.combatProfile);
  const carried = profile?.criticalInjuries ?? [];
  if (!profile || !carried.some((row) => row.id === injuryId)) return false;
  const next = {
    ...profile,
    criticalInjuries: sanitizeCriticalInjuryRows(rewrite(carried)),
  };
  await deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: { combatProfile: JSON.stringify(next) },
  });
  await emitTokensById(deps, campaignId, [token.id]);
  return true;
}

/**
 * Applies a successful „Ustabilizowanie" to the target: a mortally wounded
 * character „natychmiastowo zostaje przywrócona do poziomu 1 PW" (s. 222), and
 * the Death Save counter resets with it (`mergeCharacterData` clears it as soon
 * as HP reach 1 — the same rule stage 15 already encodes).
 *
 * Applied by the server rather than handed to the GM as a button: unlike damage
 * there is nothing to adjudicate here — no armor, no location, no override.
 */
async function applyStabilization(
  deps: RealtimeDeps,
  campaignId: string,
  targetTokenId: string,
): Promise<{ healed: boolean; opened: boolean; token: Token | null; gained: number }> {
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: targetTokenId } });
  if (!token) return { healed: false, opened: false, token: null, gained: 0 };
  if (!token.characterId) {
    // A statist token keeps its own HP pair; lift it off the floor the same way.
    // Procesu leczenia statysta nie zaczyna: dzień odpoczynku pyta o kartę,
    // a figura bez karty nie ma jej gdzie zapisać (patrz `statist.ts`).
    if (token.hpCurrent !== null && token.hpCurrent < 1) {
      const gained = 1 - token.hpCurrent;
      await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: { hpCurrent: 1 },
      });
      await emitTokensById(deps, campaignId, [token.id]);
      await knockOutStabilized(deps, campaignId, token);
      return { healed: true, opened: false, token, gained };
    }
    return { healed: false, opened: false, token, gained: 0 };
  }
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
  });
  if (!character) return { healed: false, opened: false, token, gained: 0 };
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const max = hpMax(data.stats);

  // „Aby rozpocząć proces naturalnego leczenia, musisz zostać ustabilizowany"
  // (s. 222) — i to jest **cały** skutek udanego rzutu na kimś, kto jeszcze
  // stoi. Do 03.09 taki rzut nie robił nic: kod pytał tylko, czy cel leży
  // poniżej zera, więc PT 10 i PT 13 z tabeli progów były PT donikąd.
  const opens = data.hpCurrent >= 1 && data.hpCurrent < max && !data.recovery.stabilized;
  if (data.hpCurrent >= 1) {
    if (!opens) return { healed: false, opened: false, token, gained: 0 };
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: {
        data: JSON.stringify(
          mergeCharacterData(data, { recovery: { ...data.recovery, stabilized: true } }),
        ),
      },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    return { healed: false, opened: true, token, gained: 0 };
  }

  const gained = 1 - data.hpCurrent;
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: {
      data: JSON.stringify(
        mergeCharacterData(data, {
          hpCurrent: 1,
          // Ten sam rzut, który podnosi z zera, otwiera powrót do zdrowia —
          // podręcznik opisuje obie rzeczy jednym zdaniem o Ustabilizowaniu.
          recovery: { ...data.recovery, stabilized: true },
        }),
      ),
    },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  await emitTokensOfCharacter(deps, campaignId, saved);
  await knockOutStabilized(deps, campaignId, token);
  return { healed: true, opened: true, token, gained };
}

/**
 * „Jest także Nieprzytomna – w organizmie zabrakło adrenaliny … Ten stan zawsze
 * trwa minutę" (s. 223).
 *
 * The other half of a successful stabilization, and until 02.09 it was simply
 * missing: the target stood up at 1 HP and took its turn. Reached from both
 * branches above rather than from the caller, because it is the *rule* that
 * follows being lifted off the floor — a figure that was not Mortally Wounded
 * never gets here, and neither branch heals one that was not.
 *
 * A minute is six rounds (`timed.ts`), and outside a fight nothing counts them:
 * the sticker stays and the GM's card ends it, the same bargain every other
 * timed effect strikes.
 */
async function knockOutStabilized(
  deps: RealtimeDeps,
  campaignId: string,
  token: Token,
): Promise<void> {
  const round = await activeRoundOfScene(deps, token.sceneId);
  const expires = sheetExpiryRound(round, CPRED_MINUTE_S);
  await addTokenStatus(deps, campaignId, token.id, SHEET_UNCONSCIOUS_STATUS_ID, {
    source: 'Ustabilizowanie',
    durationS: CPRED_MINUTE_S,
    ...(expires === null ? {} : { expiresAtRound: expires }),
  });
}

/**
 * What the world adds to this character's roll (stage 14d).
 *
 * Read off the token they are playing on the scene this socket is looking at —
 * the same way reloading finds the token whose Action it charges. A character
 * with no token on that scene is in no Hold, which is the right answer: nobody
 * is grappling a sheet.
 */
async function situationForCharacter(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string | null,
  character: Character,
  data: CpredCharacterData,
): Promise<CpredRollContext> {
  // The wounds travel with the character, map or no map (stage 14e): a
  // concussion is −2 whether or not there is a token standing on a scene.
  const injuries = data.criticalInjuries;
  const grappled = await isCharacterGrappled(deps, campaignId, sceneId, character);
  return { modifiers: sheetSituationModifiers({ grappled, injuries }) };
}

/**
 * To samo dla figury bez karty (31.08).
 *
 * Osobna funkcja, nie gałąź w tamtej, bo źródła są dwa różne — rany statysty
 * siedzą w profilu na żetonie, a nie na karcie — ale **wynik ma być ten sam**.
 * Odkąd statysta nosi Rany Krytyczne (29.08), „Wstrząśnienie mózgu" ma go
 * kosztować −2 w Teście Percepcji dokładnie tak, jak kosztuje postać: profil
 * z ranami, którego rany nikt nie liczy, jest gorszy niż profil bez ran, bo
 * wygląda na policzony.
 *
 * Zwarcie czyta się wprost z żetonu — tu jest nawet prościej niż przy karcie,
 * która musi najpierw swojej figury poszukać.
 */
async function situationForStatist(
  deps: RealtimeDeps,
  token: Token,
  profile: { criticalInjuries?: CpredCriticalInjuryRow[] },
): Promise<CpredRollContext> {
  const grapple = await grappleStateForToken(deps.ctx.prisma, token.sceneId, token.id);
  return {
    modifiers: sheetSituationModifiers({
      grappled: grapple.grappled,
      injuries: profile.criticalInjuries ?? [],
    }),
  };
}

/** Is this character's token on the viewed scene in a Hold right now? */
async function isCharacterGrappled(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string | null,
  character: Character,
): Promise<boolean> {
  if (!sceneId) return false;
  const token = await deps.ctx.prisma.token.findFirst({
    where: { characterId: character.id, sceneId },
  });
  if (!token) return false;
  const scene = await deps.ctx.prisma.scene.findUnique({ where: { id: sceneId } });
  if (!scene || scene.campaignId !== campaignId) return false;
  const grapple = await grappleStateForToken(deps.ctx.prisma, sceneId, token.id);
  return grapple.grappled;
}

export const characterRollEvent = defineEvent<
  CharacterRollPayload<CpredRollRequest>,
  { messageId: number }
>({
  name: 'character:roll',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    return performCharacterRoll(deps, {
      campaignId: campaign.id,
      user,
      sceneId: socket.data.viewedSceneId ?? null,
      payload,
    });
  },
});

/**
 * Żądanie rzutu odpowiadającego na wezwanie MG (etap 32).
 *
 * Z tego, co przysłał klient, zostają dwie rzeczy: zadeklarowane Szczęście
 * i gest kubka. Reszta — karta, Umiejętność, modyfikator MG i widoczność —
 * przychodzi z zapisanego wezwania, dokładnie tak, jak notacja obrażeń
 * przychodzi z zapisanego ataku (umowa z etapu 16).
 */
function payloadFromCall(
  payload: CharacterRollPayload<CpredRollRequest> | undefined,
  entry: CheckCallEntry,
): CharacterRollPayload<CpredRollRequest> {
  const stored = entry.system as unknown as CpredRollRequest;
  const luckSpent = payload?.request?.luckSpent;
  return {
    characterId: entry.characterId,
    request: {
      ...stored,
      ...(typeof luckSpent === 'number' ? { luckSpent } : {}),
    },
    visibility: entry.visibility,
    ...(payload?.gesture ? { gesture: payload.gesture } : {}),
  };
}

/**
 * The body of `character:roll`, split out of the handler so it can be called
 * without a socket (stage 20a: a bot rolling for its own sheet).
 *
 * Splitting it is the whole point of „bot jest graczem": there is exactly one
 * place where a Check is planned, Luck is spent, the dice fall and the card is
 * delivered — a second, bot-shaped copy of it would drift from this one within
 * two stages.
 */
export async function performCharacterRoll(
  deps: RealtimeDeps,
  options: {
    campaignId: string;
    /** Whose permissions apply — the bot borrows the GM account (stage 11). */
    user: SessionUser;
    /** Scene the roll is made on; decides Holds and situational modifiers. */
    sceneId: string | null;
    payload: CharacterRollPayload<CpredRollRequest> | undefined;
  },
): Promise<{ messageId: number }> {
  {
    const { user, sceneId, campaignId } = options;

    const registry = deps.ctx.cpred;
    // Wezwanie MG (etap 32) przejmuje żądanie w całości: nazwanie go jest
    // jedyną rzeczą, jaką klient tu wnosi poza Szczęściem i gestem.
    const call =
      options.payload?.callMessageId === undefined
        ? null
        : await resolveAnsweredCall(deps, campaignId, user, options.payload.callMessageId);
    const payload = call ? payloadFromCall(options.payload, call.entry) : options.payload;

    const request = await resolveRollRequest(deps, campaignId, user, payload);
    const source = await resolveRollSource(deps, campaignId, user, payload, request);
    const data = source.data;
    // „Obaj walczący ... otrzymują modyfikator −2 do wszystkich Akcji" (s. 176):
    // every Check made from the sheet carries it, named, so the player can see
    // where it came from. A Death Save is not an Action and is exempt — the
    // planner ignores the context for that kind anyway (stage 14d decision).
    //
    // Statysta przychodzi tędy po obrażenia i po Test Umiejętności ze swojego
    // profilu (31.08). Obrażenia kontekstu nie czytają — nie są Testem i omijają
    // `finishCheck` — więc jedno wywołanie obsługuje oba: rany i Zwarcie liczą
    // się tam, gdzie mają znaczenie, i milczą tam, gdzie go nie mają.
    const context =
      source.kind === 'character'
        ? await situationForCharacter(deps, campaignId, sceneId, source.character, data)
        : await situationForStatist(deps, source.token, {
            ...(data.criticalInjuries.length > 0
              ? { criticalInjuries: data.criticalInjuries }
              : {}),
          });
    const planned = planCpredRoll(data, registry, request, context);
    if (!planned.ok) throw new RealtimeError(planned.error);
    const { plan } = planned;

    // Stabilizing is an Action (s. 169) — booked before the dice, so a medic
    // with nothing left in the turn does not roll and then get told no. Zasięg
    // sprawdza się **przed** księgowaniem Akcji z tego samego powodu: odmowa
    // „za daleko" nie ma prawa kosztować tury.
    if (plan.stabilize && source.kind === 'character') {
      await requireStabilizeReach(deps, campaignId, source.character, plan.stabilize.targetTokenId);
      await spendStabilizeAction(deps, campaignId, sceneId, source.character, user);
    }

    const visibility: 'public' | 'gm' = payload?.visibility === 'gm' ? 'gm' : 'public';
    const gesture: RollGesture | undefined = sanitizeGesture(payload?.gesture);

    // Luck is spent whether the roll succeeds or not (RAW: declared upfront).
    // A statist never gets here with anything to spend — its synthesised sheet
    // has no Luck at all, and the planner refuses the request long before this.
    if (plan.luckSpent > 0 && source.kind === 'character') {
      const spent = mergeCharacterData(data, { luckCurrent: data.luckCurrent - plan.luckSpent });
      const saved = await deps.ctx.prisma.character.update({
        where: { id: source.character.id },
        data: { data: JSON.stringify(spent) },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, registry));
      await emitTokensOfCharacter(deps, campaignId, saved);
    }

    const rng = createMixedRng(gesture?.entropy);
    const result: RollResult = rollFormula(plan.formula, rng, {
      checkRule: plan.checkRule,
    });
    result.title = plan.title;
    result.actor = rollSourceName(source);
    result.breakdown = plan.breakdown;
    if (gesture && gesture.strength > 0) result.tossStrength = gesture.strength;
    if (gesture?.toss) result.toss = gesture.toss;

    // Damage rolls carry what „Zastosuj na celu" needs; the total itself is
    // read back from this stored message when the GM applies it.
    if (plan.damage) {
      result.damage = {
        location: plan.damage.location,
        locationLabel: hitLocationLabel(plan.damage.location),
        weaponName: plan.damage.weaponName,
        ...(plan.damage.ignoreArmor ? { ignoreArmor: true } : {}),
        ...(plan.damage.multiplier ? { multiplier: plan.damage.multiplier } : {}),
        ...(plan.damage.targetTokenId ? { targetTokenId: plan.damage.targetTokenId } : {}),
        ...(plan.damage.targetCoverId !== undefined
          ? { targetCoverId: plan.damage.targetCoverId }
          : {}),
        ...(plan.damage.areaTargets ? { areaTargets: plan.damage.areaTargets } : {}),
        // Stage 16g: the round travels with the damage, so „Zastosuj" knows how
        // much armour to wear off and whether the target catches fire; the aim
        // point (s. 170) rides along for the same reason. Opaque to the dice
        // engine (`RollDamageMeta.system`) — CP RED puts it in, CP RED reads it out.
        ...(plan.damage.ammo || plan.damage.aimedAt || plan.damage.halvesArmor
          ? {
              system: {
                ...(plan.damage.ammo ? { ammo: plan.damage.ammo } : {}),
                ...(plan.damage.aimedAt ? { aimedAt: plan.damage.aimedAt } : {}),
                ...(plan.damage.halvesArmor ? { halvesArmor: true } : {}),
              },
            }
          : {}),
      };
    }

    // A Death Save is judged by the rules, not by the reader: the card shows
    // the verdict, and the sheet's counter makes the next save harder.
    if (plan.deathSave && source.kind === 'character') {
      const natural = firstDieRoll(result);
      const outcome = resolveCpredDeathSave(natural, plan.deathSave);
      result.outcome = {
        success: outcome.survived,
        label: outcome.survived ? 'Przeżywa' : 'Śmierć',
        detail: outcome.automaticFailure
          ? 'Naturalna 10 — automatyczna porażka'
          : outcome.modifier > 0
            ? `${outcome.natural} + ${outcome.modifier} = ${outcome.total} · próg BC ${outcome.target}`
            : `${outcome.natural} · próg BC ${outcome.target}`,
      };
      await recordDeathSave(deps, campaignId, source.character, data, outcome.survived);
    }

    // „Jeśli wynik Testu jest wyższy od PT, udało ci się" (s. 165) — the same
    // strictly-greater rule attacks use, in the one place it is written down.
    let stabilized: { token: Token; gained: number } | null = null;
    if (plan.stabilize) {
      const success = result.total > plan.stabilize.dv;
      const applied = success
        ? await applyStabilization(deps, campaignId, plan.stabilize.targetTokenId)
        : { healed: false, opened: false, token: null, gained: 0 };
      if (applied.healed && applied.token) {
        stabilized = { token: applied.token, gained: applied.gained };
      }
      result.outcome = {
        success,
        label: success ? 'Ustabilizowany' : 'Nie udało się',
        detail:
          `${plan.stabilize.skillName} ${result.total} vs PT ${plan.stabilize.dv}` +
          (applied.healed ? ' · cel wraca do 1 PW' : '') +
          // Zdanie mówi o skutku, którego nie widać na żadnym pasku: od tej
          // chwili dzień odpoczynku coś daje. Bez niego udany rzut na kimś,
          // kto stoi, wyglądałby dokładnie jak rzut w próżnię.
          (applied.opened ? ' · rusza naturalne leczenie' : ''),
      };
    }

    // „Leczenie" (stage 30b) reads exactly like Stabilizing above, down to the
    // strictly-greater comparison — the difference is what a success takes away.
    // „Łatanie" (stage 15) is the same roll against the other sentence, and its
    // success leaves the wound where it is with its effects talked down.
    if (plan.treatInjury) {
      const success = result.total > plan.treatInjury.dv;
      const patch: CpredPatchedInjury | null = plan.treatInjury.permanent
        ? null
        : { skill: plan.treatInjury.skillName, by: rollSourceName(source) };
      const applied = success
        ? await applyTreatment(
            deps,
            campaignId,
            plan.treatInjury.targetTokenId,
            plan.treatInjury.injuryId,
            patch,
          )
        : false;
      const quickFix = plan.treatInjury.mode === 'quickFix';
      result.outcome = {
        success,
        label: success ? (patch === null ? 'Wyleczona' : 'Załatana') : 'Nie udało się',
        detail:
          `${plan.treatInjury.skillName} ${result.total} vs PT ${plan.treatInjury.dv}` +
          (applied
            ? patch === null
              ? ` · „${plan.treatInjury.injuryName}" schodzi z karty`
              : ` · efekt rany „${plan.treatInjury.injuryName}" milczy do końca dnia`
            : '') +
          (quickFix && !success ? ' · można próbować dalej, każda próba to minuta' : ''),
      };
    }

    // Stage 30d. Three verdicts a Role owns, and each is read a different way:
    // a Test against a printed PT, a die under a chance out of ten, and one
    // roll measured against four thresholds at once.
    if (plan.charisma) {
      // „Jeśli wynik Testu jest wyższy od PT, udało ci się" (s. 131) — the same
      // strict comparison Stabilizing and Treating use above. Written `>=` in
      // 30d on the ruling of 28.08, corrected 30.08 with the rest of them.
      const success = result.total > plan.charisma.dv;
      const audience = CPRED_CHARISMA_AUDIENCE_LABELS[plan.charisma.audience];
      result.outcome = {
        success,
        label: success
          ? plan.charisma.purpose === 'fans'
            ? 'Masz nowych fanów'
            : 'Fani to zrobią'
          : plan.charisma.purpose === 'fans'
            ? 'Nie zrobili na nich wrażenia'
            : 'Odmowa',
        detail: success
          ? `${result.total} > PT ${plan.charisma.dv} · ${audience}${
              plan.charisma.effect ? ` — ${plan.charisma.effect}` : ''
            }`
          : `${result.total} ≤ PT ${plan.charisma.dv} · ${audience}${
              plan.charisma.purpose === 'favour'
                ? ` — o tę samą przysługę nie poprosisz ich przez ${CPRED_CHARISMA_REFUSAL_DAYS} dni`
                : ''
            }`,
      };
    }
    if (plan.reliability) {
      const believed = cpredAudienceBelieves(result.total, plan.reliability.chance);
      const bonus = plan.reliability.chance - plan.reliability.base;
      result.outcome = {
        success: believed,
        label: believed ? 'Uwierzyli' : 'Nie kupili tego',
        detail:
          `${result.total} na 1k10 · szansa ${plan.reliability.chance} na 10` +
          (bonus > 0 ? ` (${plan.reliability.base} + ${bonus} za dowody)` : ''),
      };
    }
    if (plan.rumour) {
      const heard = cpredRumourHeard(result.total);
      result.outcome = {
        success: heard !== null,
        label: heard ? heard.name : 'Cisza na Ulicy',
        detail: heard
          ? `${result.total} ≥ ${heard.passive} · ${heard.description}`
          : `${result.total} — poniżej ${CPRED_RUMOUR_TIERS[0]!.passive}, nic nie doszło`,
      };
    }

    // Werdykt wezwania (etap 32). Dwie drogi z s. 130 i jedna funkcja: przeciw
    // PT albo przeciw rzutowi drugiej strony, którą MG streścił jedną liczbą.
    if (call) {
      const opponentTotal =
        call.entry.opponentBonus === undefined
          ? undefined
          : rollFormula(
              {
                terms: [
                  { kind: 'dice', sign: 1, count: 1, sides: 10 },
                  ...(call.entry.opponentBonus !== 0
                    ? [
                        {
                          kind: 'modifier' as const,
                          sign: 1 as const,
                          value: call.entry.opponentBonus,
                        },
                      ]
                    : []),
                ],
              },
              rng,
              { checkRule: true },
            ).total;
      const outcome = cpredCheckOutcome(result.total, {
        ...(call.entry.dv !== undefined ? { dv: call.entry.dv } : {}),
        ...(opponentTotal !== undefined ? { opponentTotal } : {}),
        ...(call.entry.opponentBonus !== undefined
          ? { opponentBonus: call.entry.opponentBonus }
          : {}),
      });
      result.outcome = outcome;
      result.title = `Wezwanie: ${plan.title}`;
    }

    const kind = visibility === 'gm' ? 'gmroll' : 'roll';
    const stored = await deps.ctx.prisma.chatMessage.create({
      data: {
        campaignId,
        authorId: user.id,
        kind,
        text: result.title ?? plan.title,
        payload: JSON.stringify(result),
        // Karta rzutu na wezwanie ma dojść do właściciela postaci także wtedy,
        // gdy kubkiem potrząsnął MG w jego zastępstwie — a bez adresata
        // wypadłaby z jego historii po przeładowaniu (`visibleTo`).
        ...(call && kind === 'gmroll' ? { recipientId: call.entry.ownerId } : {}),
      },
      include: INCLUDE_CHAT_NAMES,
    });
    const view: ChatMessageView = toChatMessageView(stored);
    if (call && kind === 'gmroll') {
      await deliverChatMessageTo(deps, campaignId, view, [user.id, call.entry.ownerId], true);
    } else {
      await deliverRollMessage(deps, campaignId, user.id, view);
    }
    // Wezwanie zamyka się razem z kartą rzutu: przycisk znika, a na karcie
    // zostaje werdykt, więc dziennik czyta się bez skakania po wiadomościach.
    if (call && result.outcome) {
      call.entry.resolved = {
        messageId: view.id,
        byName: user.name,
        success: result.outcome.success,
        total: result.total,
      };
      await emitCheckCallUpdate(deps, campaignId, call.messageId, call.entry);
    }
    // Somebody coming off the floor is the one green number the map draws
    // (stage 27i). It waits for the card exactly as an attack's does — the
    // Test is still rolling in 3D on everyone's screen.
    if (stabilized) {
      const scene = await deps.ctx.prisma.scene.findUnique({
        where: { id: stabilized.token.sceneId },
      });
      if (scene) {
        await emitMapFx(
          deps,
          campaignId,
          scene,
          [
            {
              kind: 'float',
              at: fxCentre(stabilized.token, scene),
              text: `+${stabilized.gained}`,
              tone: 'heal',
            },
          ],
          view.id,
        );
      }
    }
    return { messageId: view.id };
  }
}
