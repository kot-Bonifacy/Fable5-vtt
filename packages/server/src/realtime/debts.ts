import type { CharacterDebtPayload, CharacterView, CpredDebt } from '@vtt/shared';
import {
  ROLE_GM,
  cpredDebtsFallingDue,
  formatEddies,
  mergeCharacterData,
  parseCharacterData,
} from '@vtt/shared';
import type { Character } from '../generated/prisma/client.js';
import { RealtimeError, defineEvent, type RealtimeDeps } from './registry.js';
import { emitCharacterUpsert, refuseAwaitingGm, toCharacterView } from './character-io.js';
import { applyBalance } from './economy.js';
import { campaignGmUser } from './campaign-gm.js';
import { deliverChatMessageTo, insertChatMessage } from './chat-io.js';

/**
 * Raty „pół teraz, pół za miesiąc” (etap 71e, G23; s. 161).
 *
 * Ratę zapisuje `merchant:deal`, gdy targ Fixera przeniósł połowę ceny rzeczy
 * Luksusowych na później. Tu mieszkają trzy drogi jej końca:
 *
 *  - **spłata** — właściciel karty albo MG, gotówką z karty (wpis w historii
 *    jak każdy zakup), także po terminie;
 *  - **umorzenie** — tylko MG (sprzedawca odpuścił, rata poszła w fabułę);
 *  - **termin** — przemiatanie zegara świata (`markDebtsOverdue`) oznacza ratę
 *    jako zaległą, zamyka targ na zawsze („Niespłacona rata zamyka ten targ
 *    u wszystkich na zawsze”) i zostawia MG przypomnienie. Pieniędzy samo nie
 *    pobiera: co dalej robi wierzyciel, rozstrzyga MG.
 */

export const characterDebtEvent = defineEvent<CharacterDebtPayload, CharacterView>({
  name: 'character:debt',
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
    if (action !== 'pay' && action !== 'forgive') throw new RealtimeError('BAD_REQUEST');
    if (action === 'forgive' && !isGm) throw new RealtimeError('FORBIDDEN');

    const data = parseCharacterData(character.data, deps.ctx.cpred);
    const debt = data.debts.find((row) => row.id === payload?.debtId);
    if (!debt) throw new RealtimeError('DEBT_NOT_FOUND');
    const debts = data.debts.filter((row) => row !== debt);

    if (action === 'forgive') {
      const merged = mergeCharacterData(data, { debts });
      const saved = await deps.ctx.prisma.character.update({
        where: { id: character.id },
        data: { data: JSON.stringify(merged) },
      });
      const view = toCharacterView(saved, deps.ctx.cpred);
      await emitCharacterUpsert(deps, campaign.id, view);
      return view;
    }

    if (data.eddies < debt.amount) throw new RealtimeError('NOT_ENOUGH_EDDIES');
    await applyBalance(
      deps,
      campaign.id,
      character,
      mergeCharacterData(data, { debts }),
      {
        kind: 'purchase',
        amount: -debt.amount,
        label:
          `Rata: ${debt.creditor || 'sprzedawca'}${debt.label ? ` — ${debt.label}` : ''}`.slice(
            0,
            160,
          ),
      },
      user.id,
    );
    const saved = await deps.ctx.prisma.character.findUniqueOrThrow({
      where: { id: character.id },
    });
    return toCharacterView(saved, deps.ctx.cpred);
  },
});

/**
 * Przemiatanie zegara świata: raty, którym minął termin. Oznacza je jako
 * zaległe, zamyka targ i pisze MG jeden wiersz na kartę — gracz widzi ratę
 * „po terminie” na swojej karcie, bez wiersza czatu.
 */
export async function markDebtsOverdue(
  deps: RealtimeDeps,
  campaignId: string,
  character: Character,
  minutes: number | null,
): Promise<Character> {
  const data = parseCharacterData(character.data, deps.ctx.cpred);
  const due = cpredDebtsFallingDue(data.debts, minutes);
  if (due.length === 0) return character;
  const debts: CpredDebt[] = data.debts.map((row) =>
    due.includes(row) ? { ...row, overdue: true as const } : row,
  );
  const saved = await deps.ctx.prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(mergeCharacterData(data, { debts, halfLaterClosed: true })) },
  });
  await emitCharacterUpsert(deps, campaignId, toCharacterView(saved, deps.ctx.cpred));

  const gm = await campaignGmUser(deps.ctx.prisma, campaignId);
  if (gm) {
    const list = due
      .map((row) => `${formatEddies(row.amount)} ed u: ${row.creditor || 'sprzedawca'}`)
      .join('; ');
    const message = await insertChatMessage(deps.ctx.prisma, {
      campaignId,
      authorId: gm.id,
      kind: 'gmaction',
      text:
        `${character.name}: minął termin raty „pół teraz, pół za miesiąc” (${list}). ` +
        'Targ zamknięty na zawsze; co zrobi wierzyciel — decyzja MG (Spłać / Umorz na karcie Fixera).',
    });
    await deliverChatMessageTo(deps, campaignId, message, [], true);
  }
  return saved;
}
