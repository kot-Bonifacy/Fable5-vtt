import type {
  CharacterFansPayload,
  CharacterPublicationPayload,
  CharacterView,
  CpredCharacterData,
  CpredRollPlan,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_CHARISMA_AUDIENCES,
  CPRED_CREDIBILITY_ABILITY,
  CPRED_FAN_NAME_MAX,
  CPRED_RUMOUR_ROLLS_PER_WEEK,
  ROLE_GM,
  cpredBackupCallsWith,
  cpredFansAfterRefusal,
  cpredFansUnblocked,
  cpredFansWithGroup,
  cpredFavourProblem,
  cpredPublicationsWith,
  cpredRoleAbilityRank,
  cpredRumourWeekAfterRoll,
  cpredRumourWeekSweep,
  formatGameDate,
  mergeCharacterData,
  parseCharacterData,
  type CpredCharismaAudience,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, refuseAwaitingGm, toCharacterView } from './character-io.js';
import { campaignGmUser } from './campaign-gm.js';
import { deliverChatMessageTo, insertChatMessage } from './chat-io.js';
import { campaignInCombat } from './combat-lock.js';
import { campaignGameTime } from './gametime.js';
import { withCampaignLock } from './merchant.js';

/**
 * Czas i zasoby narracyjne Ról (etap 71f): fani Rockera, licznik Pogłosek
 * i rejestr publikacji Media, licznik wezwań Wsparcia.
 *
 * Cztery pola karty, które pisze wyłącznie silnik — `character:update` odmawia
 * łaty z nimi. Tu mieszkają wszystkie drogi zapisu poza samym rzutem:
 *
 *  - `character:roll` woła `requireCharismaStart` przed kośćmi (nowi fani nie
 *    w walce, grupa nie pamięta odmowy) i `settle…` po nich;
 *  - `character:fans` i `character:publication` — ręka MG;
 *  - przemiatanie zegara świata (`remindRumourWeek`) przypomina MG o tygodniu
 *    bez dwóch rzutów Pogłosek.
 */

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Zapis jednej łaty na świeżo odczytanej karcie, pod zamkiem kampanii. */
async function patchSheet(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  change: (data: CpredCharacterData) => Partial<CpredCharacterData> | null,
): Promise<Character | null> {
  return withCampaignLock(campaignId, async () => {
    const card = await deps.ctx.prisma.character.findUnique({ where: { id: characterId } });
    if (!card || card.campaignId !== campaignId) return null;
    const data = parseCharacterData(card.data, deps.ctx.cpred);
    const patch = change(data);
    if (!patch) return card;
    const saved = await deps.ctx.prisma.character.update({
      where: { id: card.id },
      data: { data: JSON.stringify(mergeCharacterData(data, patch)) },
    });
    await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
    return saved;
  });
}

/* ------------------------------------------------------------------ *
 * G27, P2 — Efekt Charyzmy
 * ------------------------------------------------------------------ */

/** Przed kośćmi: nowi fani nie w walce (P2), grupa nie pamięta odmowy (G27). */
export async function requireCharismaStart(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  plan: CpredRollPlan,
  data: CpredCharacterData,
): Promise<void> {
  if (!plan.charisma) return;
  if (plan.charisma.purpose === 'fans') {
    // MG przechodzi jak przy każdej blokadzie walki (`refuseInCombat`).
    if (user.role !== ROLE_GM && (await campaignInCombat(deps.ctx.prisma, campaignId))) {
      throw new RealtimeError('FANS_IN_COMBAT');
    }
    return;
  }
  const clock = await campaignGameTime(deps.ctx.prisma, campaignId);
  const problem = cpredFavourProblem(
    data.fans,
    plan.charisma.fanGroupId,
    plan.charisma.audience,
    clock.minutes,
  );
  if (problem) throw new RealtimeError(problem);
}

/**
 * Po kościach: udany Test „nowi fani” dopisuje grupę, nieudana prośba zamyka
 * grupę na tydzień kalendarza. Zwraca dopisek do wiersza szczegółów karty rzutu.
 */
export async function settleCharisma(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  plan: CpredRollPlan,
  success: boolean,
): Promise<string> {
  const charisma = plan.charisma;
  if (!charisma) return '';
  if (charisma.purpose === 'fans') {
    if (!success) return '';
    let added: string | null = null;
    await patchSheet(deps, campaignId, characterId, (data) => {
      const fans = cpredFansWithGroup(data.fans, {
        id: newId('fan'),
        name: charisma.note ?? '',
        audience: charisma.audience,
      });
      if (!fans) return null;
      added = fans[fans.length - 1]!.name;
      return { fans };
    });
    return added ? ` · na karcie: „${added as string}”` : ' · lista fanów jest pełna — wpis u MG';
  }
  if (success || !charisma.fanGroupId) return '';
  const clock = await campaignGameTime(deps.ctx.prisma, campaignId);
  const groupId = charisma.fanGroupId;
  let until: number | null = null;
  await patchSheet(deps, campaignId, characterId, (data) => {
    const fans = cpredFansAfterRefusal(data.fans, groupId, clock.minutes, charisma.note ?? '');
    until = fans.find((row) => row.id === groupId)?.blockedUntilMinute ?? null;
    return { fans };
  });
  return until === null ? '' : ` (do ${formatGameDate(until as number)})`;
}

export const characterFansEvent = defineEvent<CharacterFansPayload, CharacterView>({
  name: 'character:fans',
  handler: async ({ deps, socket, user, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    const character = await deps.ctx.prisma.character.findUnique({
      where: { id: typeof payload?.characterId === 'string' ? payload.characterId : '' },
    });
    if (!character || character.campaignId !== campaign.id) {
      throw new RealtimeError('CHARACTER_NOT_FOUND');
    }
    const isGm = user.role === ROLE_GM;
    if (!isGm && character.ownerId !== user.id) throw new RealtimeError('CHARACTER_NOT_FOUND');
    refuseAwaitingGm(character, user);
    const action = payload?.action;
    if (action !== 'add' && action !== 'rename' && action !== 'remove' && action !== 'unblock') {
      throw new RealtimeError('BAD_REQUEST');
    }
    // Kto jest fanem bez rzutu i kiedy blokada schodzi przed czasem — MG (s. 144).
    if (action !== 'rename' && !isGm) throw new RealtimeError('FORBIDDEN');

    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if ((action === 'add' || action === 'rename') && (!name || name.length > CPRED_FAN_NAME_MAX)) {
      throw new RealtimeError('BAD_FAN_NAME');
    }
    const audience = payload?.audience;
    if (action === 'add' && !(CPRED_CHARISMA_AUDIENCES as readonly unknown[]).includes(audience)) {
      throw new RealtimeError('BAD_REQUEST');
    }

    let problem: string | null = null;
    const saved = await patchSheet(deps, campaign.id, character.id, (data) => {
      if (action === 'add') {
        const fans = cpredFansWithGroup(data.fans, {
          id: newId('fan'),
          name,
          audience: audience as CpredCharismaAudience,
        });
        if (!fans) problem = 'TOO_MANY_FANS';
        return fans ? { fans } : null;
      }
      const group = data.fans.find((row) => row.id === payload?.groupId);
      if (!group) {
        problem = 'NO_FAN_GROUP';
        return null;
      }
      if (action === 'rename') {
        return { fans: data.fans.map((row) => (row === group ? { ...row, name } : row)) };
      }
      if (action === 'remove') return { fans: data.fans.filter((row) => row !== group) };
      return { fans: cpredFansUnblocked(data.fans, group.id) };
    });
    if (problem) throw new RealtimeError(problem);
    if (!saved) throw new RealtimeError('CHARACTER_NOT_FOUND');
    return toCharacterView(saved, deps.ctx.cpred);
  },
});

/* ------------------------------------------------------------------ *
 * G28, G30 — Media
 * ------------------------------------------------------------------ */

/** Po Teście Rzetelności: wpis do rejestru publikacji. */
export async function settlePublication(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
  plan: CpredRollPlan,
  believed: boolean,
): Promise<void> {
  const reliability = plan.reliability;
  if (!reliability) return;
  const clock = await campaignGameTime(deps.ctx.prisma, campaignId);
  await patchSheet(deps, campaignId, characterId, (data) => ({
    publications: cpredPublicationsWith(data.publications, {
      id: newId('pub'),
      topic: reliability.topic,
      atMinute: clock.minutes,
      proof: reliability.proof,
      believed,
      ...(reliability.again ? { again: true as const } : {}),
    }),
  }));
}

/** Po rzucie Pogłosek MG: licznik tygodnia kalendarza; zwraca „który to rzut”. */
export async function countRumourRoll(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<number> {
  const clock = await campaignGameTime(deps.ctx.prisma, campaignId);
  let rolls = 0;
  await patchSheet(deps, campaignId, characterId, (data) => {
    const rumourWeek = cpredRumourWeekAfterRoll(data.rumourWeek, clock.minutes);
    rolls = rumourWeek.rolls;
    return { rumourWeek };
  });
  return rolls;
}

export const characterPublicationEvent = defineEvent<CharacterPublicationPayload, CharacterView>({
  name: 'character:publication',
  role: ROLE_GM,
  handler: async ({ deps, socket, payload }) => {
    const campaign = socket.data.campaign;
    if (!campaign) throw new RealtimeError('NO_CAMPAIGN');
    if (payload?.action !== 'remove') throw new RealtimeError('BAD_REQUEST');
    let found = false;
    const saved = await patchSheet(
      deps,
      campaign.id,
      typeof payload.characterId === 'string' ? payload.characterId : '',
      (data) => {
        const publications = data.publications.filter((row) => row.id !== payload.publicationId);
        found = publications.length !== data.publications.length;
        return found ? { publications } : null;
      },
    );
    if (!saved) throw new RealtimeError('CHARACTER_NOT_FOUND');
    if (!found) throw new RealtimeError('PUBLICATION_NOT_FOUND');
    return toCharacterView(saved, deps.ctx.cpred);
  },
});

/**
 * Przemiatanie zegara świata: tydzień kalendarza minął, a MG rzucił Pogłoski
 * mniej niż dwa razy — jeden wiersz dla MG. Tylko karty prowadzone przez
 * ludzi (boty i NPC-e są poza etapem 71) z rangą Wiarygodności.
 */
export async function remindRumourWeek(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  minutes: number | null,
): Promise<Character> {
  if (minutes === null || character.ownerId === null) return character;
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  if (cpredRoleAbilityRank(data, deps.ctx.cpred, CPRED_CREDIBILITY_ABILITY) === null) {
    return character;
  }
  const swept = cpredRumourWeekSweep(data.rumourWeek, minutes);
  if (!swept.next) return character;
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(mergeCharacterData(data, { rumourWeek: swept.next })) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));
  if (swept.missed === null) return saved;

  const gm = await campaignGmUser(deps.ctx.prisma, campaignId);
  if (gm) {
    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: gm.id,
      kind: 'gmaction',
      text:
        `${character.name}: minął tydzień z ${swept.missed} z ${CPRED_RUMOUR_ROLLS_PER_WEEK} ` +
        'rzutów Pogłosek (s. 151) — rzuć zaległe z panelu Wiarygodności na karcie Media.',
    });
    await deliverChatMessageTo(deps, campaignId, message, [], true);
  }
  return saved;
}

/* ------------------------------------------------------------------ *
 * G32 — Wsparcie
 * ------------------------------------------------------------------ */

/** Ktoś odpowiedział na wezwanie — karta Stróża Prawa zapamiętuje minutę zegara. */
export async function recordBackupCall(
  deps: RealtimeDeps,
  campaignId: string,
  characterId: string,
): Promise<void> {
  const clock = await campaignGameTime(deps.ctx.prisma, campaignId);
  await patchSheet(deps, campaignId, characterId, (data) => ({
    backupCalls: cpredBackupCallsWith(data.backupCalls, clock.minutes),
  }));
}
