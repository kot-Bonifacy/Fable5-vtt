import type {
  CpredNetDefenseEffects,
  CpredRegistry,
  CpredTimedInjury,
  DamageLogEntry,
  SessionUser,
  TokenHp,
} from '@vtt/shared';
import {
  cpredAmmoCheckOutcome,
  cpredCheckBase,
  netDefenseTrigger,
  parseCharacterData,
  parseRollNotation,
  rollFormula,
} from '@vtt/shared';
import type { DefenseZone as ZoneRow, Scene, Token } from '../generated/prisma/client.js';
import {
  SHEET_SLOWED_STATUS_ID,
  applyForcedFailureToSheet,
  applyPeriodicDamageToTokenHp,
  describeSheetTimer,
  readSheetCombatProfile,
  readSheetStatusData,
  sheetCombatProfile,
  sheetExpiryRound,
  sheetFromCombatProfile,
  sheetWoundStatuses,
  writeSheetStatusData,
  writeSheetStatusTimer,
  type SheetDamageRequest,
  type SheetForcedFailure,
} from '../sheets.js';
import { statusName } from '../statuses.js';
import { buildCompendiumSync } from './compendium.js';
import { applyDamageToFigure, logDamage } from './damage.js';
import { emitMapFx } from './fx.js';
import { createMixedRng } from './dice-rng.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import { fireDevice } from './netdevices.js';
import type { RealtimeDeps } from './registry.js';
import { emitTokensById } from './tokens.js';
import { oweCarryToToken } from './turn-effects.js';
import { activeRoundOfScene } from './timed-effects.js';
import { emitCombatOfScene } from './combat.js';
import { readZoneExempt, readZoneSightings } from './zones-io.js';

/**
 * A defence system going off by itself (stage 26f).
 *
 * The eighteen rows of s. 213–216 hand out five different things — damage, a
 * forced check, statuses, Critical Injuries and a MOVE penalty — and this
 * module is the one place that does any of them. Three decisions shape it, and
 * all three are „reuse, do not rewrite":
 *
 *  - **damage goes where damage goes.** `applyDamageToFigure` is the very path
 *    the GM's „Zastosuj" has used since stage 15, so the vest takes its share,
 *    the Critical Injury table is rolled on, and „Cofnij" takes the whole thing
 *    back. Damage the rulebook calls „bezpośrednie" goes the other way, through
 *    `applyForcedFailureToSheet` — the same function tear gas has used since
 *    16h;
 *  - **the check is the ammunition's check.** `CpredNetDefenseCheck` *is* the
 *    shape of a forced check from 16h minus its failure, so `cpredCheckBase`
 *    rolls a trap exactly as it rolls a gas round, statists included;
 *  - **an emplacement fires the turret's way.** `fireDevice` from 26d, with the
 *    Combat Value substitution 26e wrote — so range, cover, line of fire,
 *    magazine and the damage card behave as they do when a person shoots.
 *
 * What it never does is decide *whether* the system goes off. That question is
 * geometry plus a switch, and it is asked by whoever moved the figure.
 */

/** Somebody a system caught, and the sentence saying how it caught them. */
export interface ZoneVictim {
  token: Token;
}

export interface ZoneFireResult {
  /** Polish lines for the run log and the GM's chat card. */
  lines: string[];
  /** Tokens whose stickers or bars changed and have to go back out. */
  tokenIds: string[];
}

/**
 * The numbers a system carries, read off its catalogue row by the caller.
 *
 * Passed in rather than looked up here so a single sweep over a scene loads the
 * compendium once — a corridor with four traps would otherwise read the whole
 * catalogue four times per step.
 */
export interface ZoneProfile {
  name: string;
  effects: CpredNetDefenseEffects | undefined;
  combatValue: number | undefined;
}

/**
 * One system going off at everybody it caught.
 *
 * `cause` is the Polish word for what set it off („wejście na obszar", „Tura
 * systemu"); it ends up on the damage card, so a minute later „skąd on to ma?"
 * has an answer without anybody remembering.
 */
export async function fireZone(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    scene: Scene;
    zone: ZoneRow;
    profile: ZoneProfile;
    targets: readonly Token[];
    cause: string;
  },
): Promise<ZoneFireResult> {
  const { campaignId, user, scene, zone, profile } = input;
  const effects = profile.effects;
  const lines: string[] = [];
  const tokenIds: string[] = [];
  if (!effects) return { lines, tokenIds };

  const exempt = readZoneExempt(zone.exempt);
  const spotters = readZoneSightings(zone.sightings).users;
  const rng = createMixedRng();
  const round = await activeRoundOfScene(deps, scene.id);
  const needsCompendium = (effects.injuries ?? []).length > 0;
  const compendium = needsCompendium ? (await buildCompendiumSync(deps, campaignId)).entries : [];

  for (const token of input.targets) {
    if (exempt.includes(token.id)) {
      lines.push(`${token.name} — przepustka, system go przepuszcza.`);
      continue;
    }

    // ── the emplacement's own trigger ──
    if (effects.fires) {
      const fired = await fireEmplacement(deps, {
        campaignId,
        user,
        zone,
        profile,
        target: token,
      });
      lines.push(fired);
      continue;
    }

    // ── the check that avoids it ──
    if (effects.check) {
      // „Osoba, która widzi wiązki laserowe, może przejść…" (s. 216): a figure
      // whose owner has not spotted the zone gets no roll at all, because the
      // roll is a way of *avoiding something you can see*, not a reflex.
      const aware = !effects.awareOnly || (await tokenIsAwareOf(deps, token, spotters));
      if (!aware) {
        lines.push(`${token.name} — nie widzi zagrożenia, więc nie ma czego uniknąć.`);
      } else {
        const base = await checkBaseOf(deps, deps.ctx.cpred, token, effects.check);
        const outcome = cpredAmmoCheckOutcome(rng(10), base.total, effects.check.dv);
        const detail = `${base.label} ${outcome.die}+${outcome.modifier} = ${outcome.total} vs PT ${effects.check.dv}`;
        if (outcome.resisted) {
          lines.push(`${token.name} — ${detail} — oparł się.`);
          continue;
        }
        lines.push(`${token.name} — ${detail} — nie oparł się.`);
      }
    }

    const summary = await applyZoneEffect(deps, {
      campaignId,
      user,
      scene,
      zone,
      profile,
      effects,
      token,
      compendium,
      rng,
      round,
      cause: input.cause,
    });
    if (summary.length > 0) lines.push(`${token.name}: ${summary}`);
    tokenIds.push(token.id);
  }

  // The system itself flashes once, over the whole rectangle (stage 27i) —
  // never once per victim, because a floor going live is one event no matter
  // how many people are standing on it. Only a zone that *hurts* lights up: a
  // laser grid forcing an Athletics check has nothing to discharge, and the
  // figures it caught already say so with their own numbers.
  if (tokenIds.length > 0 && effects.damage) {
    await emitMapFx(deps, campaignId, scene, [
      {
        kind: 'zap',
        rect: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
        sound: 'zap',
      },
    ]);
  }

  return { lines, tokenIds };
}

/**
 * „W czasie samodzielnego działania systemy obronne określają skuteczność
 * swoich działań, wykonując Test Wartości bojowej + 1k10" (s. 214).
 *
 * The gun is the figure bound to the zone, and everything about the shot is the
 * turret path of 26d — this function only says who is shooting at whom.
 */
async function fireEmplacement(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    zone: ZoneRow;
    profile: ZoneProfile;
    target: Token;
  },
): Promise<string> {
  const { zone, profile, target } = input;
  if (!zone.tokenId) {
    return `${zone.name} — nie ma żetonu na scenie, nie ma czym strzelić.`;
  }
  if (profile.combatValue === undefined) {
    return `${zone.name} — wpis nie ma Wartości bojowej, więc nie ma czym rzucić.`;
  }
  const shot = await fireDevice(deps, {
    campaignId: input.campaignId,
    user: input.user,
    device: { id: `zone-${zone.id}`, name: zone.name, deviceKind: 'turret', tokenId: zone.tokenId },
    hands: { combatValue: profile.combatValue },
    targetTokenId: target.id,
    summary: `${zone.name} → ${target.name}`,
  });
  return shot.blocked
    ? `${shot.blocked.text}.`
    : `${zone.name} strzela do: ${target.name} (Wartość bojowa ${profile.combatValue}).`;
}

/**
 * What the system actually does to one figure, once the check is behind it.
 *
 * Returns the one-line summary the run log prints next to the name; the numbers
 * themselves go on their own undoable `damage` card, exactly as a gas round's
 * failure does since 16h.
 */
async function applyZoneEffect(
  deps: RealtimeDeps,
  input: {
    campaignId: string;
    user: SessionUser;
    scene: Scene;
    zone: ZoneRow;
    profile: ZoneProfile;
    effects: CpredNetDefenseEffects;
    token: Token;
    compendium: Awaited<ReturnType<typeof buildCompendiumSync>>['entries'];
    rng: (sides: number) => number;
    round: number | null;
    cause: string;
  },
): Promise<string> {
  const { campaignId, user, scene, zone, effects, token, compendium, rng, round } = input;
  const notes: string[] = [input.cause];
  if (effects.check?.biologicalOnly) notes.push('tylko cele biologiczne');

  const rolled = rollZoneDamage(effects.damage, rng);
  const timed: CpredTimedInjury | null = effects.durationS
    ? {
        source: zone.name,
        durationS: effects.durationS,
        ...(() => {
          const expires = sheetExpiryRound(round, effects.durationS);
          return expires === null ? {} : { expiresAtRound: expires };
        })(),
      }
    : null;
  if (timed) notes.push(describeSheetTimer(timed));

  let log: DamageLogEntry | null = null;
  let characterId: string | null = null;
  let ownerId: string | null = token.ownerId;

  const wantsInjuries = (effects.injuries ?? []).length > 0;
  // Direct damage and named wounds travel the forced-failure path of 16h;
  // ordinary damage travels the armour path of 15. The fork is the rulebook's
  // own („obrażenia bezpośrednio w PW" vs „Pancerz redukuje te obrażenia"), and
  // it is the only fork in this file.
  if (effects.direct || wantsInjuries) {
    const failure: SheetForcedFailure = {
      damage: rolled?.total ?? 0,
      ...(wantsInjuries ? { injuryIds: effects.injuries } : {}),
      ...(timed ? { timed } : {}),
    };
    if (token.characterId) {
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: token.characterId },
      });
      if (character) {
        const applied = applyForcedFailureToSheet(character, deps.ctx.cpred, failure, compendium);
        const saved = await deps.ctx.prisma.character.update({
          where: { id: character.id },
          data: { data: applied.data },
        });
        characterId = saved.id;
        ownerId = saved.ownerId;
        await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
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
      }
    }
    if (!log) {
      // A statist has nowhere to keep a Critical Injury, so the wound is
      // reported on the card and the GM rules it — the bargain of 16h.
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
      log = {
        ...(applied?.log ?? emptyDamageLog()),
        targetTokenId: token.id,
        targetName: token.name,
        characterId: null,
        targetOwnerId: ownerId,
        ...(wantsInjuries
          ? { injuryNote: 'Statysta nie ma karty — ranę krytyczną rozstrzyga MG.' }
          : {}),
      };
    }
  } else if (rolled) {
    const request: SheetDamageRequest = {
      damage: rolled.total,
      criticalInjury: rolled.criticalDamage,
      location: 'body',
      // The zone wears the round's clothes so that „Pancerz … sam nie ulega
      // uszkodzeniu" (s. 216) needs no second mechanism: `noAblation` is the
      // very flag the rubber bullet has carried since 16g.
      ...(effects.noAblation
        ? {
            ammo: {
              id: `defense.${zone.id}`,
              name: zone.name,
              patterns: [],
              noAblation: true,
            },
          }
        : {}),
    };
    const landed = await applyDamageToFigure(deps, campaignId, scene, token, request);
    characterId = landed.character?.id ?? null;
    ownerId = landed.character?.ownerId ?? token.ownerId;
    log = {
      ...landed.log,
      targetTokenId: token.id,
      targetName: token.name,
      characterId,
      targetOwnerId: ownerId,
    };
  }

  // Statuses and the MOVE drain go on the token whether or not it has a sheet.
  const added = await applyZoneStatuses(deps, campaignId, token.id, effects, rng, {
    source: zone.name,
    durationS: effects.durationS ?? 0,
    ...(timed?.expiresAtRound !== undefined ? { expiresAtRound: timed.expiresAtRound } : {}),
  });

  const parts: string[] = [];
  if (rolled)
    parts.push(`${effects.damage} = ${rolled.total}${effects.direct ? ' bezpośrednio' : ''}`);
  if (added.drain > 0) parts.push(`RUCH −${added.drain}`);
  const statusLabels = added.statuses.map((id) => statusName(deps.ctx.statuses, id));
  if (statusLabels.length > 0) parts.push(statusLabels.join(', '));
  const injuryLabels = [log?.injury?.name, log?.injuryExtra?.name].filter(
    (name): name is string => typeof name === 'string',
  );
  if (injuryLabels.length > 0) parts.push(injuryLabels.join(', '));
  if (timed) parts.push(describeSheetTimer(timed));

  if (log) {
    const timedInjuryIds = [log.injury?.id, log.injuryExtra?.id].filter(
      (id): id is string => typeof id === 'string',
    );
    const entry: DamageLogEntry = {
      ...log,
      ammo: { name: zone.name, label: 'system', ...(notes.length > 0 ? { notes } : {}) },
      ...(added.statuses.length > 0 ? { statusesAdded: added.statuses } : {}),
      ...(Object.keys(added.valuesBefore).length > 0
        ? { statusValuesBefore: added.valuesBefore }
        : {}),
      ...(timed && (added.statuses.length > 0 || timedInjuryIds.length > 0)
        ? {
            timed: {
              ...(added.statuses.length > 0 ? { statusIds: added.statuses } : {}),
              ...(timedInjuryIds.length > 0 ? { injuryIds: timedInjuryIds } : {}),
              label: describeSheetTimer(timed),
            },
          }
        : {}),
    };
    await logDamage(deps, campaignId, user.id, entry);
  } else if (added.statuses.length > 0 || added.drain > 0) {
    await emitTokensById(deps, campaignId, [token.id]);
  }

  return parts.join(' · ');
}

/**
 * Has the account behind this figure noticed the trap?
 *
 * The GM's own figures always have: a system's owner knows where its floor is,
 * and a GM asking a guard to roll Perception against their own building would
 * be theatre.
 */
async function tokenIsAwareOf(
  deps: RealtimeDeps,
  token: Token,
  spotters: readonly string[],
): Promise<boolean> {
  const ownerId = await controllerOf(deps, token);
  if (!ownerId) return true;
  return spotters.includes(ownerId);
}

/** Who controls this figure — its owner, or its sheet's owner. */
export async function controllerOf(deps: RealtimeDeps, token: Token): Promise<string | null> {
  if (token.ownerId) return token.ownerId;
  if (!token.characterId) return null;
  const character = await deps.ctx.prisma.character.findUnique({
    where: { id: token.characterId },
    select: { ownerId: true },
  });
  return character?.ownerId ?? null;
}

/**
 * What this figure rolls the system's check on — a sheet, or a statist's combat
 * profile worn as one (the two-pass trick of 16b, and the same code 16h uses).
 */
async function checkBaseOf(
  deps: RealtimeDeps,
  registry: CpredRegistry,
  token: Token,
  check: { skillId: string; skillLabel?: string; statId?: string },
): Promise<{ total: number; label: string }> {
  if (token.characterId) {
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (character) {
      const base = cpredCheckBase(
        parseCharacterData(character.data, registry),
        registry,
        check as Parameters<typeof cpredCheckBase>[2],
      );
      return { total: base.total, label: base.label };
    }
  }
  const profile = readSheetCombatProfile(token.combatProfile) ?? sheetCombatProfile({});
  const hp: TokenHp = { current: token.hpCurrent ?? 0, max: token.hpMax ?? 0 };
  const base = cpredCheckBase(
    sheetFromCombatProfile(profile, hp, null),
    registry,
    check as Parameters<typeof cpredCheckBase>[2],
  );
  return { total: base.total, label: base.label };
}

/**
 * What this figure rolls Perception at — the one check a *player* makes against
 * a defence system, and the one that decides whether the trap is in their
 * payload at all („Percepcja PT 17, by zauważyć", s. 216).
 */
export async function checkPerceptionOf(
  deps: RealtimeDeps,
  token: Token,
): Promise<{ total: number; label: string }> {
  return checkBaseOf(deps, deps.ctx.cpred, token, {
    skillId: CPRED_PERCEPTION_SKILL_ID,
    skillLabel: 'Percepcja',
    statId: 'int',
  });
}

/** Registry id of „Percepcja" — the slug the rulebook's skill list imports under. */
const CPRED_PERCEPTION_SKILL_ID = 'perception';

/** Rolls the system's damage, or null when it deals none. */
function rollZoneDamage(
  notation: string | undefined,
  rng: (sides: number) => number,
): { total: number; criticalDamage: boolean } | null {
  if (!notation) return null;
  const parsed = parseRollNotation(notation);
  if (!parsed.ok) return null;
  const result = rollFormula(parsed.formula, rng);
  return { total: result.total, criticalDamage: result.criticalDamage };
}

/**
 * Statuses and the MOVE drain this system put on the token.
 *
 * The drain is a *number carried by a status*, exactly as a fire's intensity is
 * since 16g — „redukując RUCH o 2k6 punktów, dopóki cel … nie opuści bronionego
 * obszaru" (s. 216) is a penalty that lives on the figure and comes off when
 * the GM says it does. Rolling it once and storing the result is what stops the
 * penalty changing every time somebody looks at the sheet.
 */
async function applyZoneStatuses(
  deps: RealtimeDeps,
  campaignId: string,
  tokenId: string,
  effects: CpredNetDefenseEffects,
  rng: (sides: number) => number,
  timer: { source: string; durationS: number; expiresAtRound?: number },
): Promise<{ statuses: string[]; drain: number; valuesBefore: Record<string, number | null> }> {
  const ids = effects.statuses ?? [];
  const drainRoll = effects.moveDrain ? rollZoneDamage(effects.moveDrain, rng) : null;
  const drain = drainRoll?.total ?? 0;
  if (ids.length === 0 && drain === 0) {
    return { statuses: [], drain: 0, valuesBefore: {} };
  }
  const token = await deps.ctx.prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) return { statuses: [], drain: 0, valuesBefore: {} };

  const statuses = readTokenStatuses(token.statuses);
  const added: string[] = [];
  let statusData = token.statusData;
  for (const id of ids) {
    // An id this campaign does not know would sit on the token forever with no
    // badge to click and no rule to enforce it (the guard 16h wrote).
    if (!deps.ctx.statuses.ids.has(id)) continue;
    if (!statuses.includes(id)) {
      statuses.push(id);
      added.push(id);
    }
    if (timer.durationS > 0) statusData = writeSheetStatusTimer(statusData, id, timer);
  }

  const valuesBefore: Record<string, number | null> = {};
  if (drain > 0) {
    const applied = applyMoveDrain(statusData, drain);
    statusData = applied.statusData;
    valuesBefore[SHEET_SLOWED_STATUS_ID] = applied.before;
    if (!statuses.includes(SHEET_SLOWED_STATUS_ID)) {
      statuses.push(SHEET_SLOWED_STATUS_ID);
      added.push(SHEET_SLOWED_STATUS_ID);
    }
  }

  await deps.ctx.prisma.token.update({
    where: { id: tokenId },
    data: { statuses: JSON.stringify(statuses), statusData },
  });
  await emitTokensById(deps, campaignId, [tokenId]);
  return { statuses: added, drain, valuesBefore };
}

function applyMoveDrain(
  statusData: string,
  drain: number,
): { statusData: string; before: number | null } {
  const values = readSheetStatusData(statusData);
  const before = values[SHEET_SLOWED_STATUS_ID] ?? null;
  // Two sprinklers do not politely take turns: the worse of the two holds.
  const next = Math.max(before ?? 0, drain);
  return { statusData: writeSheetStatusData(statusData, SHEET_SLOWED_STATUS_ID, next), before };
}

function readTokenStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
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

/** Which of the three triggers this system answers to. */
export function zoneTriggerOf(effects: CpredNetDefenseEffects | undefined): string {
  return netDefenseTrigger(effects);
}
