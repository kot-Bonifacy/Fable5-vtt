import type {
  CombatActionLogEntry,
  CpredTimedEffect,
  DamageLogEntry,
  EffectExpirePayload,
} from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import type { Scene } from '../generated/prisma/client.js';
import {
  describeSheetTimer,
  expireSheetInjuries,
  readSheetStatusDisabled,
  readSheetStatusTimers,
  removeSheetTimedInjury,
  sheetTimedExpired,
  writeSheetStatusTimer,
} from '../sheets.js';
import { emitCharacterUpsert, toCharacterView } from './character-io.js';
import {
  INCLUDE_CHAT_NAMES,
  broadcastChatMessage,
  broadcastRedactedChatMessage,
  toChatMessageView,
} from './chat-io.js';
import { statusName } from '../statuses.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitTokensById, emitTokensOfCharacter, requireCampaignToken } from './tokens.js';
import { expireStatEffectsOfCharacter } from './stat-effects.js';

/**
 * Effects that end by themselves (stage 16h).
 *
 * „Na minutę" is the first duration this VTT has ever had to count. Everything
 * before it either lasted until somebody clicked it away or expired at the end
 * of one turn (14e's „Przygwożdżony"), and neither shape fits a minute.
 *
 * The session settled how it is counted (2026-08-07), and the answer is two
 * clocks and no third:
 *
 *  - **in a fight, rounds count.** A minute is six of them, so an effect applied
 *    in round 3 comes off at the start of round 9. Every turn boundary sweeps
 *    the scene, which catches bystanders who are not in the queue at all;
 *  - **outside a fight, nothing counts.** No round ticks, and real seconds are
 *    not the same thing as seconds of fiction — a table spends five minutes on
 *    one exchange. So the effect stays, and the GM gets a card with a button.
 *
 * The GM's card is posted whenever an effect is applied with no round to count,
 * and the button is the only way off. That is deliberate: it is the same bargain
 * `damage:apply` makes with „Cofnij" — nothing important disappears unless a
 * person or a rule decided it should.
 */

/** The round of the fight running on this scene, or null when none is. */
export async function activeRoundOfScene(
  deps: RealtimeDeps,
  sceneId: string,
): Promise<number | null> {
  const combat = await deps.ctx.prisma.combat.findUnique({ where: { sceneId } });
  // Round 0 means „participants gathered, nobody has acted": nothing is
  // counting yet, and an effect applied then must not expire in round 1.
  return combat && combat.round >= 1 ? combat.round : null;
}

/** One effect the round counter has caught up with, ready to be reported. */
interface ExpiredEffect {
  tokenId: string;
  tokenName: string;
  /** „Nieprzytomny" or „Uraz oka" — what came off. */
  label: string;
  source: string;
  /**
   * Co wraca razem ze statusem — dziś wyłącznie dwie cyborgizacje zdjęte
   * Impulsem EMP (04.09.2026). Bez tego monit mówił „minęła minuta", a stół
   * i tak musiał pamiętać, co właściwie padło.
   */
  restored?: string[];
}

/**
 * Takes off everything on this scene whose minute has run out.
 *
 * Swept over the whole scene rather than over the combat queue, because a
 * bystander caught by a gas grenade is not a participant — they have no turn to
 * hang a hook on, and „the blind civilian never recovers" would be a bug nobody
 * would think to look for.
 */
export async function sweepTimedEffects(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  round: number,
): Promise<void> {
  const tokens = await deps.ctx.prisma.token.findMany({ where: { sceneId: scene.id } });
  const expired: ExpiredEffect[] = [];

  for (const token of tokens) {
    const timers = readSheetStatusTimers(token.statusData);
    const due = Object.entries(timers).filter(([, timer]) => sheetTimedExpired(timer, round));
    if (due.length > 0) {
      const statuses = readTokenStatuses(token.statuses);
      let statusData = token.statusData;
      for (const [statusId, timer] of due) {
        // Czytane **przed** wyczyszczeniem wpisu: zdjęcie timera kasuje przy
        // okazji listę wyłączonych, bo obie rzeczy kończą się razem.
        const restored = readSheetStatusDisabled(statusData, statusId);
        statusData = writeSheetStatusTimer(statusData, statusId, null);
        expired.push({
          tokenId: token.id,
          tokenName: token.name,
          label: statusName(deps.ctx.statuses, statusId),
          source: timer.source,
          ...(restored.length > 0 ? { restored } : {}),
        });
      }
      await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: {
          statuses: JSON.stringify(statuses.filter((id) => !due.some(([dueId]) => dueId === id))),
          statusData,
        },
      });
      await emitTokensById(deps, campaignId, [token.id]);
    }

    if (!token.characterId) continue;
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: token.characterId },
    });
    if (!character) continue;
    // Etap 39: efekty na Cechach schodzą tym samym przemiataniem, ale **tylko**
    // po rundach — minuta świata nie rusza się na granicy tury, więc drugiej
    // wskazówki tu nie ma i „na godzinę" nie zejdzie w walce po sześciu
    // sekundach. Osobno od ran, bo mieszkają w innym polu karty i muszą zejść
    // nawet wtedy, gdy żadna rana nie wygasła.
    await expireStatEffectsOfCharacter(deps, campaignId, character.id, { round, minutes: null });
    const fresh = await deps.ctx.prisma.character.findUnique({ where: { id: character.id } });
    if (!fresh) continue;
    const healed = expireSheetInjuries(fresh, deps.ctx.cpred, round);
    if (!healed) continue;
    const saved = await deps.ctx.prisma.character.update({
      where: { id: character.id },
      data: { data: healed.data },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    await emitTokensOfCharacter(deps, campaignId, saved);
    for (const injury of healed.expired) {
      expired.push({
        tokenId: token.id,
        tokenName: token.name,
        label: injury.name,
        source: injury.timed?.source ?? '',
      });
    }
  }

  if (expired.length > 0) await logExpired(deps, campaignId, expired);
}

/**
 * „Minęła minuta: Kurier — Nieprzytomny (Amunicja usypiająca)".
 *
 * One line for the whole sweep rather than a card per figure: at a turn
 * boundary several effects fall off at once, and six cards would bury the turn
 * that actually mattered. Written as the same `action` card the rest of the
 * tracker uses, so stage 19's bots read the fight from one kind of message.
 */
async function logExpired(
  deps: RealtimeDeps,
  campaignId: string,
  expired: readonly ExpiredEffect[],
): Promise<void> {
  const gm = await deps.ctx.prisma.user.findFirst({ where: { role: ROLE_GM } });
  if (!gm) return;
  const entry: CombatActionLogEntry = {
    combatantId: '',
    actorName: 'Czas',
    actionId: 'effect-expired',
    actionName: 'Minęła minuta',
    note: expired
      .map((effect) => {
        const head = effect.source
          ? `${effect.tokenName} — ${effect.label} (${effect.source})`
          : `${effect.tokenName} — ${effect.label}`;
        return effect.restored ? `${head}, wraca: ${effect.restored.join(', ')}` : head;
      })
      .join(' · '),
  };
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: gm.id,
      kind: 'action',
      text: entry.actionName,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  broadcastChatMessage(deps, campaignId, toChatMessageView(stored));
}

/**
 * The GM takes a timed effect off by hand — the only clock that runs outside a
 * fight, and an early exit inside one.
 *
 * A status and a wound go through the same door because at the table they are
 * one sentence („już widzisz"), and the caller should not have to know which of
 * the two storages a given effect landed in.
 */
export const effectExpireEvent = defineEvent<EffectExpirePayload, { removed: string[] }>({
  name: 'effect:expire',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    if (!socket.data.campaign) throw new RealtimeError('NO_CAMPAIGN');
    const campaignId = socket.data.campaign.id;
    const { token } = await requireCampaignToken(deps.ctx.prisma, campaignId, payload?.tokenId);
    const removed: string[] = [];

    const statusIds = readIdList(payload?.statusIds);
    if (statusIds.length > 0) {
      const statuses = readTokenStatuses(token.statuses);
      let statusData = token.statusData;
      for (const statusId of statusIds) {
        statusData = writeSheetStatusTimer(statusData, statusId, null);
        removed.push(statusName(deps.ctx.statuses, statusId));
      }
      await deps.ctx.prisma.token.update({
        where: { id: token.id },
        data: {
          statuses: JSON.stringify(statuses.filter((id) => !statusIds.includes(id))),
          statusData,
        },
      });
      await emitTokensById(deps, campaignId, [token.id]);
    }

    // Only a *timed* wound may be taken off this way — `removeSheetTimedInjury`
    // enforces it: „Cofnij" is for a hit that should not have happened, and this
    // button is for a minute that has passed.
    for (const injuryId of readIdList(payload?.injuryIds)) {
      if (!token.characterId) break;
      const character = await deps.ctx.prisma.character.findUnique({
        where: { id: token.characterId },
      });
      if (!character || character.campaignId !== campaignId) break;
      const healed = removeSheetTimedInjury(character, deps.ctx.cpred, injuryId);
      if (!healed) continue;
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: healed.data },
      });
      await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
      await emitTokensOfCharacter(deps, campaignId, saved);
      removed.push(healed.removed.name);
    }

    if (removed.length === 0) throw new RealtimeError('BAD_REQUEST');
    if (typeof payload?.messageId === 'number') {
      await markCardExpired(deps, campaignId, payload.messageId);
    }
    return { removed };
  },
});

/**
 * Strikes the button off the card that offered it.
 *
 * The same treatment „Cofnij" gets: the log entry is rewritten and rebroadcast,
 * so a card read tomorrow says the minute passed rather than offering to end it
 * a second time.
 */
async function markCardExpired(
  deps: RealtimeDeps,
  campaignId: string,
  messageId: number,
): Promise<void> {
  const message = await deps.ctx.prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: INCLUDE_CHAT_NAMES,
  });
  if (!message || message.campaignId !== campaignId || message.kind !== 'damage') return;
  if (!message.payload) return;
  const entry = JSON.parse(message.payload) as DamageLogEntry;
  if (!entry.timed || entry.timed.expired) return;
  const updated = await deps.ctx.prisma.chatMessage.update({
    where: { id: message.id },
    data: { payload: JSON.stringify({ ...entry, timed: { ...entry.timed, expired: true } }) },
    include: INCLUDE_CHAT_NAMES,
  });
  await broadcastRedactedChatMessage(deps, campaignId, toChatMessageView(updated), 'chat:update');
}

/** „na minutę — do rundy 9" for a status the caller just applied. */
export function describeTimer(timer: CpredTimedEffect): string {
  return describeSheetTimer(timer);
}

/** Strings that look like ids; anything else is dropped rather than refused. */
function readIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function readTokenStatuses(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
