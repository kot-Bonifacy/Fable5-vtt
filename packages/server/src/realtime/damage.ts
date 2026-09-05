import type {
  ChatMessageView,
  CharacterInjuryPayload,
  CpredAimPoint,
  CpredAmmoProfile,
  DamageApplyPayload,
  DamageLogEntry,
  DamageUndoPayload,
  MapFxEffect,
  RollResult,
  TokenHp,
} from '@vtt/shared';
import {
  ARMOR_SP_MAX,
  ROLE_GM,
  damageTotal,
  isCpredAimPoint,
  isCriticalInjuryEntry,
} from '@vtt/shared';
import type { Character, Scene, Token } from '../generated/prisma/client.js';
import {
  SHEET_STATIST_ARMOR_ROW_ID,
  applyDamageToCover,
  applyForcedFailureToSheet,
  applyForcedFailureToTokenHp,
  applyDamageToSheet,
  applyDamageToTokenHp,
  isValidHitLocation,
  readSheetCombatAwareness,
  readSheetCombatProfile,
  sheetWoundStatuses,
  undoDamageOnSheet,
  writeSheetStatusTimer,
  type SheetDamageLog,
  type SheetDamageRequest,
} from '../sheets.js';
import { createMixedRng } from './dice-rng.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { clearFacedownFear, restoreFacedownFear } from './facedown.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { emitCombatOfScene } from './combat.js';
import { claimRoundOnce, releaseRoundOnce } from './round-once.js';
import { emitCovers } from './covers.js';
import {
  igniteToken,
  oweCarryToToken,
  restoreStatusValues,
  type AppliedStatusEffect,
} from './turn-effects.js';
import { emitTokensById, emitTokensOfCharacter, requireCampaignToken } from './tokens.js';
import { buildCompendiumSync } from './compendium.js';
import { emitMapFx, fxCentre } from './fx.js';
import { INCLUDE_CHAT_NAMES, broadcastRedactedChatMessage, toChatMessageView } from './chat-io.js';

/**
 * Applying damage (stage 15).
 *
 * The GM presses „Zastosuj" on a damage roll's chat card and names a target;
 * everything that decides the outcome is re-read on the server — the rolled
 * total from the stored message, the armor and HP from the target's sheet — so
 * a client can never type its own numbers. The result is logged as a chat
 * message of kind `damage`, and that log is what „Cofnij" reads to put the
 * sheet back (HP, ablated armor, the drawn Critical Injury).
 *
 * Visibility: the log's absolute HP travel only to the GM and the target's
 * owner (`redactChatMessage`); everyone at the table sees the hit itself.
 */

function requireCampaignId(socketData: { campaign: { id: string } | null }): string {
  if (!socketData.campaign) throw new RealtimeError('NO_CAMPAIGN');
  return socketData.campaign.id;
}

function requireMessageId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  return value;
}

/** The stored damage roll a „Zastosuj" refers to. */
async function loadDamageRoll(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
): Promise<RollResult> {
  const message = await deps.ctx.prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.campaignId !== campaignId || !message.payload) {
    throw new RealtimeError('MESSAGE_NOT_FOUND');
  }
  if (message.kind !== 'roll' && message.kind !== 'gmroll') {
    throw new RealtimeError('NOT_A_DAMAGE_ROLL');
  }
  const roll = JSON.parse(message.payload) as RollResult;
  if (!roll.damage) throw new RealtimeError('NOT_A_DAMAGE_ROLL');
  return roll;
}

function tokenOwnHp(token: Token): TokenHp | null {
  return token.hpMax === null ? null : { current: token.hpCurrent ?? 0, max: token.hpMax };
}

/** Persists the log entry as a chat message and pushes it to the room. */
export async function logDamage(
  deps: RealtimeDeps,
  campaignId: string,
  authorId: string,
  entry: DamageLogEntry,
): Promise<ChatMessageView> {
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId,
      kind: 'damage',
      text: `${entry.targetName} — ${entry.locationLabel}`,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  await broadcastRedactedChatMessage(deps, campaignId, view);
  return view;
}

/**
 * Takes the hit out of a cover's body points and pushes the new list (stage
 * 16c). Wrecking one leaves the row on the map — it is still scenery — and
 * `coverStanding` is what stops it blocking anything from the next shot on.
 */
async function applyDamageToCoverRow(
  deps: RealtimeDeps,
  campaignId: string,
  coverId: unknown,
  roll: RollResult,
): Promise<{ coverId: number; name: string; log: SheetDamageLog }> {
  if (typeof coverId !== 'number' || !Number.isInteger(coverId)) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const row = await deps.ctx.prisma.cover.findUnique({
    where: { id: coverId },
    include: { scene: true },
  });
  if (!row || row.scene.campaignId !== campaignId) throw new RealtimeError('COVER_NOT_FOUND');

  const applied = applyDamageToCover(
    { current: row.hpCurrent, max: row.hpMax },
    { damage: damageTotal(roll) },
  );
  await deps.ctx.prisma.cover.update({
    where: { id: row.id },
    data: { hpCurrent: applied.hpCurrent },
  });
  await emitCovers(deps, campaignId, row.scene);
  return { coverId: row.id, name: row.name, log: applied.log };
}

export const damageApplyEvent = defineEvent<DamageApplyPayload, { messageId: number }>({
  name: 'damage:apply',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const sourceMessageId = requireMessageId(payload?.messageId);
    const roll = await loadDamageRoll(deps, campaignId, sourceMessageId);

    // Stage 16c: the thing taking the hit may be a cover. Its whole path is
    // three lines long and shares nothing with the sheet — no armour, no
    // injury table, no Death Save — so it forks here rather than growing
    // branches inside `applyDamageToSheet`.
    if (payload?.coverId !== undefined) {
      const view = await applyDamageToCoverRow(deps, campaignId, payload.coverId, roll);
      const entry: DamageLogEntry = {
        ...view.log,
        sourceMessageId,
        targetCoverId: view.coverId,
        targetName: view.name,
        characterId: null,
        // A car has no owner to keep its numbers from: everybody at the table
        // can see the bonnet coming apart.
        targetOwnerId: null,
      };
      const logged = await logDamage(deps, campaignId, user.id, entry);
      return { messageId: logged.id };
    }

    const { token, scene } = await requireCampaignToken(
      deps.ctx.prisma,
      campaignId,
      payload?.tokenId,
    );

    const location = isValidHitLocation(payload?.location)
      ? payload.location
      : isValidHitLocation(roll.damage?.location)
        ? roll.damage.location
        : 'body';
    if (payload?.armorSp !== undefined) {
      if (
        typeof payload.armorSp !== 'number' ||
        !Number.isInteger(payload.armorSp) ||
        payload.armorSp < 0 ||
        payload.armorSp > ARMOR_SP_MAX
      ) {
        throw new RealtimeError('BAD_REQUEST');
      }
    }

    // Stage 16g: the round that was fired, carried by the damage roll itself.
    // Read from the stored message like every other number here — a client
    // naming its own ammunition would be a client choosing its own armour
    // penetration.
    const ammo = readRollAmmo(roll);
    // Same rule, same reason (s. 170): the aim point rides on the stored roll,
    // so the leg breaks because of the shot that was aimed, not because of what
    // the client puts in the payload now.
    const aimedAt = readRollAimPoint(roll);
    // „to była maczeta" — a fact about the swing, read where the swing was
    // stored (s. 176). Same reasoning as the two above.
    const halvesArmor = readRollHalvesArmor(roll);

    const request: SheetDamageRequest = {
      // Autofire rolls 2d6 and multiplies the sum (stage 16); the factor is
      // read off the stored roll, never off the client's request.
      damage: damageTotal(roll),
      criticalInjury: roll.criticalDamage === true,
      location,
      ...(payload?.armorSp !== undefined ? { armorSp: payload.armorSp } : {}),
      ...(payload?.ignoreArmor === true || roll.damage?.ignoreArmor ? { ignoreArmor: true } : {}),
      ...(ammo ? { ammo } : {}),
      // Only while „Zastosuj" still points where the shot did: the GM may move
      // the damage onto somebody else, and a leg aimed at one person must not
      // break another's (the head keeps working because it is `location`).
      ...(aimedAt && roll.damage?.targetTokenId === token.id ? { aimedAt } : {}),
      ...(halvesArmor ? { halvesArmor: true } : {}),
    };

    const landed = await applyDamageToFigure(deps, campaignId, scene, token, request);
    const log = landed.log;
    const character = landed.character;

    // „Gdy ten typ amunicji po przejściu przez zbroję celu zadaje mu obrażenia,
    // cel zostaje także podpalony" (s. 346) — through the armour and *hurting*,
    // so a round the vest stopped sets nobody alight. The status then burns on
    // the ordinary end-of-turn path from 14e.
    const ignited =
      ammo?.ignites && log.damageThrough > 0
        ? await igniteToken(deps, campaignId, token.id, ammo.ignites)
        : null;

    // „Modyfikator ... znika, gdy tylko uda ci się pokonać wroga" (s. 194,
    // stage 23c). Zero Hit Points is where this project already draws „pokonany"
    // — it is the line that makes somebody Mortally Wounded — so everybody who
    // backed down from this one stops being afraid of them here.
    //
    // Whom it freed is written into the card, because „Cofnij" has to be able to
    // put the fear back: re-ticking the sticker by hand restores half a penalty
    // and no one can tell (the address in `statusData` is the other half).
    const fearCleared =
      log.hp && log.hp.after <= 0
        ? await clearFacedownFear(deps, campaignId, token.sceneId, token.id)
        : [];

    const entry: DamageLogEntry = {
      ...log,
      ...(ignited ? describeIgnition(log, ammo!.ignites!, ignited) : {}),
      ...(fearCleared.length > 0 ? { fearCleared } : {}),
      sourceMessageId,
      targetTokenId: token.id,
      targetName: token.name,
      characterId: character?.id ?? null,
      targetOwnerId: character?.ownerId ?? token.ownerId,
    };
    const view = await logDamage(deps, campaignId, user.id, entry);
    return { messageId: view.id };
  },
});

/**
 * One hit landing on one figure — the whole of stage 15, socket-free.
 *
 * Split out of `damage:apply` in stage 26f, when a defended zone needed to hurt
 * somebody without a chat card to press „Zastosuj" on. Everything the GM's
 * button did stays here: a sheet takes it through `applyDamageToSheet` (armour,
 * ablation, the Critical Injury table, the spine wound's debt against the next
 * turn), a statist takes it on its token with its own Stopping Power, and both
 * push what changed back out to the table.
 *
 * What it deliberately does *not* do is write the chat card: the two callers
 * carry different things on theirs (a source message id here, the system's name
 * on the zone's), and a card is the one part of a hit that is not arithmetic.
 */
export async function applyDamageToFigure(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  request: SheetDamageRequest,
): Promise<{ log: SheetDamageLog; character: Character | null }> {
  const landed = await landDamageOnFigure(deps, campaignId, scene, token, request);
  await emitMapFx(deps, campaignId, scene, damageMapFx(landed.log, token, scene));
  return landed;
}

/**
 * What a hit leaves on the map (stage 27i): a flash where it landed and the
 * number that came out of it.
 *
 * The number is `hpLost` rather than `damageRolled`, because the map shows what
 * the figure *lost*, not what the dice showed — a vest that ate all of it is
 * the more interesting fact, and it gets said in a word instead of a „−0" the
 * table would read as a bug. The Critical Injury rides along as its own label,
 * staggered by the renderer, for the same reason the card lists it separately:
 * it is a second thing that happened, not a bigger version of the first.
 *
 * Deliberately **not** gated on who may see the Hit Points. The chat card is
 * already public down to the damage number (only the absolute HP is redacted,
 * stage 15), and the effect channel gates on something stricter anyway: whether
 * the figure is visible at all.
 */
function damageMapFx(
  log: SheetDamageLog,
  token: Token,
  scene: Pick<Scene, 'gridSizePx'>,
): MapFxEffect[] {
  const at = fxCentre(token, scene);
  const effects: MapFxEffect[] = [{ kind: 'spark', at, sound: 'impact' }];
  effects.push(
    log.hpLost > 0
      ? { kind: 'float', at, text: `−${log.hpLost}`, tone: 'damage' }
      : { kind: 'float', at, text: 'PANCERZ', tone: 'note' },
  );
  if (log.injury) effects.push({ kind: 'float', at, text: 'KRYTYK', tone: 'crit' });
  return effects;
}

/** The arithmetic of one hit, with nothing drawn — see `applyDamageToFigure`. */
async function landDamageOnFigure(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Token,
  request: SheetDamageRequest,
): Promise<{ log: SheetDamageLog; character: Character | null }> {
  let character: Character | null = null;
  if (token.characterId) {
    character = await deps.ctx.prisma.character.findUnique({ where: { id: token.characterId } });
  }

  if (character) {
    // The injury table is campaign data: imported files plus whatever the GM
    // typed in (the head table has no free source — see tools/import).
    const compendium = await buildCompendiumSync(deps, campaignId);
    // „Za 2 punkty zmniejsz o 1 pierwsze obrażenia otrzymane w tej Rundzie"
    // (Redukcja obrażeń, s. 146). Claimed here rather than at the attack,
    // because the rule counts damage *received* from anything at all — a
    // grenade, a burning floor, a fall — and every one of those arrives down
    // this one function. Only a figure in a running fight has a Round to be
    // first in; see `round-once.ts`.
    const reduction = readSheetCombatAwareness(character, deps.ctx.cpred).damageReduction;
    const reduced =
      reduction > 0 &&
      (await claimRoundOnce(deps.ctx.prisma, token.sceneId, token.id, 'damageReduction'));
    const applied = applyDamageToSheet(
      character,
      deps.ctx.cpred,
      reduced ? { ...request, damageReduction: reduction } : request,
      compendium.entries,
      createMixedRng(),
    );
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: applied.data },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    // Refreshes HP bars and, since stage 15, the wound status badges.
    await emitTokensOfCharacter(deps, campaignId, saved);
    // „Uraz kręgosłupa: w swojej kolejnej Turze nie możesz wykonać Akcji"
    // (stage 14e). The debt is against a turn that has not begun — and this
    // hit may well have landed on somebody else's turn — so it is written on
    // the tracker row and spent when the victim's own turn starts.
    if (applied.carry) {
      await oweCarryToToken(deps, token.sceneId, token.id, applied.carry);
      await emitCombatOfScene(deps, campaignId, scene);
    }
    return { log: applied.log, character: saved };
  }

  const hp = tokenOwnHp(token);
  if (!hp) throw new RealtimeError('TOKEN_HAS_NO_HP');
  // Stage 16b: a statted extra brings its own Stopping Power, so the GM no
  // longer types the armour into every hit — and it wears down like anyone's.
  const profile = readSheetCombatProfile(token.combatProfile);
  // Since 29.08 a statted extra keeps the wounds the rules give it, so the
  // injury table travels here too — the same campaign data the sheet branch
  // above reads, and for the same draw.
  const statistCompendium = profile ? await buildCompendiumSync(deps, campaignId) : null;
  const applied = applyDamageToTokenHp(
    hp,
    request,
    profile,
    statistCompendium ? { entries: statistCompendium.entries, rng: createMixedRng() } : undefined,
  );
  await deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: {
      hpCurrent: applied.hp.current,
      statuses: JSON.stringify(sheetWoundStatuses(parseTokenStatuses(token), applied.hp)),
      ...(applied.profile ? { combatProfile: JSON.stringify(applied.profile) } : {}),
    },
  });
  await emitTokensById(deps, campaignId, [token.id]);
  return { log: applied.log, character: null };
}

/**
 * The round carried by a damage roll (stage 16g).
 *
 * Stored under `RollDamageMeta.system`, which the dice engine treats as opaque —
 * so this is where CP RED reads it back. A message written before the stage
 * simply has none, and every flag is then absent, which is exactly „ordinary
 * ammunition".
 */
function readRollAmmo(roll: RollResult): CpredAmmoProfile | null {
  const system = roll.damage?.system;
  if (!system || typeof system !== 'object') return null;
  const ammo = (system as { ammo?: unknown }).ammo;
  if (!ammo || typeof ammo !== 'object') return null;
  const candidate = ammo as Partial<CpredAmmoProfile>;
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return null;
  return { ...(candidate as CpredAmmoProfile), patterns: candidate.patterns ?? [] };
}

/** Whether the hit only meets half the armour (s. 176), off the stored roll. */
function readRollHalvesArmor(roll: RollResult): boolean {
  const system = roll.damage?.system;
  if (!system || typeof system !== 'object') return false;
  return (system as { halvesArmor?: unknown }).halvesArmor === true;
}

/** The Aimed Shot this damage follows (s. 170), off the stored roll. */
function readRollAimPoint(roll: RollResult): CpredAimPoint | null {
  const system = roll.damage?.system;
  if (!system || typeof system !== 'object') return null;
  const aimedAt = (system as { aimedAt?: unknown }).aimedAt;
  return isCpredAimPoint(aimedAt) ? aimedAt : null;
}

/** The fire this hit started, written into the log the card renders. */
function describeIgnition(
  log: SheetDamageLog,
  ignites: { statusId: string; damage: number },
  applied: AppliedStatusEffect,
): Pick<DamageLogEntry, 'ammo' | 'statusesAdded' | 'statusValuesBefore'> {
  const note = `Podpalony — ${ignites.damage} obr./turę`;
  return {
    ...(log.ammo
      ? { ammo: { ...log.ammo, notes: [...(log.ammo.notes ?? []), note] } }
      : { ammo: { name: 'Amunicja zapalająca', notes: [note] } }),
    // Only a status this hit actually put on comes off again: raising an
    // existing fire from 2 to 4 must not let „Cofnij" extinguish it.
    ...(applied.added ? { statusesAdded: [ignites.statusId] } : {}),
    statusValuesBefore: { [ignites.statusId]: applied.damageBefore },
  };
}

function parseTokenStatuses(token: Token): string[] {
  try {
    const parsed: unknown = JSON.parse(token.statuses);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * MG nadaje ranę krytyczną z ręki (sesja naprawcza 22.08).
 *
 * Do tej pory rana wchodziła na kartę **wyłącznie** z rzutu obrażeń z dwiema
 * szóstkami (1/36) albo z nietrafionego testu amunicji z 16h — a karta postaci
 * potrafiła rany tylko usuwać. MG, który chciał komuś złamać rękę fabularnie
 * („spadasz z drabiny"), nie miał czym; RAW zresztą pozwala mu ją przypisać.
 * To blokowało też oględziny trzech ścieżek naraz (odmowa Akcji przy Urazie
 * kręgosłupa z 14e, wiersz rany w panelu z 27b).
 *
 * Rana wchodzi **tą samą** funkcją co rzut (`applyForcedFailureToSheet`), więc
 * niesie wszystko, co niosłaby wylosowana: karę do RUCH-u, dopłatę do Testu
 * Przeżywalności, flagi tur z 14e i wpis w liczniku „na minutę". Karta na
 * czacie jest zwykłą kartą obrażeń, dzięki czemu „Cofnij" zdejmuje ranę bez
 * jednej nowej linii kodu.
 */
/**
 * To samo dla figury bez karty (31.08).
 *
 * Rana wchodzi tą samą funkcją, którą nadaje ją gaz i broniona strefa
 * (`applyForcedFailureToTokenHp`) — więc niesie to samo, co niosłaby
 * wylosowana: karę zapisaną na wierszu, dopłatę do Testu Przeżywalności
 * i zabraną Akcję z 14e. „Cofnij" na karcie czatu działa bez jednej nowej
 * linijki, bo to zwykła karta obrażeń.
 *
 * Żeton bez profilu bojowego jest odmawiany, a nie obsługiwany zdaniem:
 * krążek, który nie ma gdzie zapisać rany, dostałby na czacie kartę mówiącą
 * o ranie, której nikt potem nie znajdzie ani nie załata.
 */
async function assignInjuryToStatist(
  deps: RealtimeDeps,
  campaignId: string,
  user: { id: string },
  tokenId: unknown,
  injuryId: string,
): Promise<void> {
  if (typeof tokenId !== 'string' || tokenId.length === 0) {
    throw new RealtimeError('BAD_REQUEST');
  }
  const { token, scene } = await requireCampaignToken(deps.ctx.prisma, campaignId, tokenId);
  if (token.characterId) throw new RealtimeError('BAD_REQUEST');
  const profile = readSheetCombatProfile(token.combatProfile);
  if (!profile) throw new RealtimeError('TOKEN_HAS_NO_PROFILE');

  const compendium = await buildCompendiumSync(deps, campaignId);
  const entry = compendium.entries.find((row) => row.id === injuryId && isCriticalInjuryEntry(row));
  if (!entry) throw new RealtimeError('UNKNOWN_INJURY');
  if ((profile.criticalInjuries ?? []).some((row) => row.id === injuryId)) {
    throw new RealtimeError('INJURY_ALREADY_THERE');
  }

  const hp: TokenHp | null =
    token.hpMax === null ? null : { current: token.hpCurrent ?? 0, max: token.hpMax };
  const applied = applyForcedFailureToTokenHp(
    hp,
    profile,
    { damage: 0, injuryIds: [injuryId] },
    compendium.entries,
  );
  if (!applied.profile) throw new RealtimeError('INJURY_ALREADY_THERE');
  await deps.ctx.prisma.token.update({
    where: { id: token.id },
    data: { combatProfile: JSON.stringify(applied.profile) },
  });
  await emitTokensById(deps, campaignId, [token.id]);
  if (applied.carry) {
    await oweCarryToToken(deps, token.sceneId, token.id, applied.carry);
    await emitCombatOfScene(deps, campaignId, scene);
  }
  await logDamage(deps, campaignId, user.id, {
    ...applied.log,
    targetTokenId: token.id,
    targetName: token.name,
    characterId: null,
    targetOwnerId: token.ownerId,
    injuryNote: 'Ranę nadał MG — bez rzutu na obrażenia.',
  });
}

export const characterInjuryEvent = defineEvent<CharacterInjuryPayload>({
  name: 'character:injury',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const characterId = payload?.characterId;
    const injuryId = payload?.injuryId;
    if (typeof injuryId !== 'string') throw new RealtimeError('BAD_REQUEST');
    // Figura bez karty idzie własną gałęzią, ale **tym samym zdarzeniem**
    // (31.08): to jedna czynność MG — „ta figura łamie rękę" — i różni się
    // wyłącznie tym, gdzie rana się zapisuje.
    if (typeof characterId !== 'string') {
      return assignInjuryToStatist(deps, campaignId, user, payload?.tokenId, injuryId);
    }
    const character = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
    if (!character || character.campaignId !== campaignId) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }

    const compendium = await buildCompendiumSync(deps, campaignId);
    const entry = compendium.entries.find(
      (row) => row.id === injuryId && isCriticalInjuryEntry(row),
    );
    if (!entry) throw new RealtimeError('UNKNOWN_INJURY');

    const applied = applyForcedFailureToSheet(
      character,
      deps.ctx.cpred,
      { damage: 0, injuryIds: [injuryId] },
      compendium.entries,
    );
    // Rana, którą postać już ma, nie dubluje się (ta sama reguła co przy
    // drugim granacie w tej samej minucie) — i wtedy nie ma czego zapisywać.
    if (!applied.log.injury) throw new RealtimeError('INJURY_ALREADY_THERE');

    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: applied.data },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);

    // Rana nadana w środku walki zabiera to, co zabrałaby wylosowana (14e).
    if (applied.carry) {
      const tokens = await deps.ctx.prisma.token.findMany({
        where: { characterId: character.id },
        include: { scene: true },
      });
      for (const token of tokens) {
        if (token.scene.campaignId !== campaignId) continue;
        await oweCarryToToken(deps, token.sceneId, token.id, applied.carry);
        await emitCombatOfScene(deps, campaignId, token.scene);
      }
    }

    const log: DamageLogEntry = {
      ...applied.log,
      targetName: character.name,
      characterId: character.id,
      targetOwnerId: character.ownerId,
      injuryNote: 'Ranę nadał MG — bez rzutu na obrażenia.',
    };
    await logDamage(deps, campaignId, user.id, log);
  },
});

export const damageUndoEvent = defineEvent<DamageUndoPayload, void>({
  name: 'damage:undo',
  role: ROLE_GM,
  handler: async ({ deps, socket, user, payload }) => {
    const campaignId = requireCampaignId(socket.data);
    const messageId = requireMessageId(payload?.messageId);
    const message = await deps.ctx.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: INCLUDE_CHAT_NAMES,
    });
    if (
      !message ||
      message.campaignId !== campaignId ||
      message.kind !== 'damage' ||
      !message.payload
    ) {
      throw new RealtimeError('MESSAGE_NOT_FOUND');
    }
    const entry = JSON.parse(message.payload) as DamageLogEntry;
    if (entry.undone) throw new RealtimeError('ALREADY_UNDONE');

    // A wrecked car welds itself back together (stage 16c). Cheap and complete:
    // a cover's whole state is one number, so there is nothing else to restore
    // — and it is the reason a destroyed cover stays on the map as a wreck
    // instead of being deleted, which „Cofnij" could not undo.
    if (entry.targetCoverId !== undefined && entry.hp) {
      const cover = await deps.ctx.prisma.cover.findUnique({
        where: { id: entry.targetCoverId },
        include: { scene: true },
      });
      if (cover && cover.scene.campaignId === campaignId) {
        await deps.ctx.prisma.cover.update({
          where: { id: cover.id },
          data: { hpCurrent: Math.max(0, Math.min(entry.hp.before, cover.hpMax)) },
        });
        await emitCovers(deps, campaignId, cover.scene);
      }
    }

    // Statuses the hit put on come off first: a restored sheet that stays
    // „Nieprzytomny" looks like the undo half-worked (stage 14d).
    if (entry.targetTokenId && entry.statusesAdded && entry.statusesAdded.length > 0) {
      const token = await deps.ctx.prisma.token.findUnique({ where: { id: entry.targetTokenId } });
      if (token) {
        const statuses = parseTokenStatuses(token).filter(
          (id) => !entry.statusesAdded!.includes(id),
        );
        // Razem z naklejką schodzi to, co przy niej wisiało: zegar „na minutę"
        // i lista cyborgizacji wyłączonych Impulsem (04.09.2026). Do tej sesji
        // zostawały w `statusData` po cofniętym trafieniu, więc następna walka
        // zgłaszała „Minęła minuta" dla statusu, którego już nie było.
        let statusData = token.statusData;
        for (const id of entry.statusesAdded) {
          statusData = writeSheetStatusTimer(statusData, id, null);
        }
        await deps.ctx.prisma.token.update({
          where: { id: token.id },
          data: { statuses: JSON.stringify(statuses), statusData },
        });
      }
    }
    // A fire this hit only made *fiercer* goes back to what it was (stage 16g).
    if (entry.targetTokenId && entry.statusValuesBefore) {
      await restoreStatusValues(deps, campaignId, entry.targetTokenId, entry.statusValuesBefore);
    }
    // The enemy never went down after all, so the Konfrontacja they lost is
    // unwon again and the −2 comes back to everybody it left (stage 23c).
    if (entry.targetTokenId && entry.fearCleared && entry.fearCleared.length > 0) {
      await restoreFacedownFear(deps, campaignId, entry.fearCleared, entry.targetTokenId);
    }
    // The hit unhappened, so the Round's first damage has not happened either
    // (stage 30a) — otherwise a Solo would spend their Redukcja obrażeń on a
    // card the GM took straight back.
    if (entry.damageReduced && entry.targetTokenId) {
      await releaseRoundOnce(deps.ctx.prisma, entry.targetTokenId, 'damageReduction');
    }

    if (entry.characterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: entry.characterId },
      });
      // A deleted sheet leaves nothing to restore — the entry is still marked
      // as taken back, so the card stops offering a button that cannot work.
      if (character && character.campaignId === campaignId) {
        const restored = undoDamageOnSheet(character, deps.ctx.cpred, entry);
        const saved = await deps.ctx.prisma.character.update({
          where: { id: character.id },
          data: { data: restored.data },
        });
        await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
        await emitTokensOfCharacter(deps, campaignId, saved);
      }
    } else if (entry.hp && entry.targetTokenId) {
      const tokenId = entry.targetTokenId;
      const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
      if (token) {
        const hp: TokenHp = { current: entry.hp.before, max: entry.hp.max };
        // The statist's armour goes back up with the HP (stage 16b). Leaving it
        // ablated would be the same half-undo the statuses were fixed for in 14d.
        const profile = readSheetCombatProfile(token.combatProfile);
        const restoredArmor =
          profile && entry.armor?.rowId === SHEET_STATIST_ARMOR_ROW_ID
            ? { ...profile, armorSp: entry.armor.before }
            : null;
        await deps.ctx.prisma.token.update({
          where: { id: token.id },
          data: {
            hpCurrent: hp.current,
            statuses: JSON.stringify(sheetWoundStatuses(parseTokenStatuses(token), hp)),
            ...(restoredArmor ? { combatProfile: JSON.stringify(restoredArmor) } : {}),
          },
        });
        await emitTokensById(deps, campaignId, [token.id]);
      }
    }

    const undoneEntry: DamageLogEntry = { ...entry, undone: true, undoneByName: user.name };
    const updated = await deps.ctx.prisma.chatMessage.update({
      where: { id: message.id },
      data: { payload: JSON.stringify(undoneEntry) },
      include: INCLUDE_CHAT_NAMES,
    });
    await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(updated), 'chat:update');
  },
});
