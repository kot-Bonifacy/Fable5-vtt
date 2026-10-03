import {
  isCheckRequestOpen,
  type CharacterView,
  type CreationPermitRow,
  type CreationRankDraft,
  type PortraitWantedRow,
} from '@vtt/shared';
import type { ChatItem } from './stores/chatStore.js';

/**
 * „Czeka na MG” (25.09, zlecenie MG): wszystko, na co gracz albo bot czeka
 * z ręką MG, zebrane w jedną listę. Dotąd każda sprawa miała własną cyfrę na
 * własnej zakładce, a prośba o zgodę na postać nie dzwoniła wcale — gracz
 * siedział w ciszy, a MG patrzył na mapę.
 *
 * Lista jest **liczona** z magazynów, które już trzymają te sprawy (czat,
 * zgody i szkice kreatora, karty postaci), a nie prowadzona osobno: drugi tor
 * rozjechałby się przy pierwszej odpowiedzi udzielonej z innego miejsca.
 */
export type GmAttentionKind = 'permit' | 'rank' | 'ready' | 'portrait' | 'request' | 'proposal';

/** Zakładka panelu bocznego, na której MG podejmuje decyzję. */
export type GmAttentionTab = 'chat' | 'characters';

export interface GmAttentionItem {
  /** Stały klucz sprawy; ten sam stoi w `data-attention` wiersza, do którego prowadzi. */
  key: string;
  kind: GmAttentionKind;
  text: string;
  tab: GmAttentionTab;
}

export interface GmAttentionSources {
  chat: readonly ChatItem[];
  permits: readonly CreationPermitRow[];
  ranks: readonly CreationRankDraft[];
  /** Karty w kolejności listy; liczą się tylko te, które czekają na „Przyjmij do gry”. */
  characters: readonly Pick<CharacterView, 'id' | 'name' | 'playReady'>[];
  /** Gracze bez wolnego portretu w puli (#68); bez pola — żadnych. */
  portraitWanted?: readonly PortraitWantedRow[];
}

export function gmAttentionItems(sources: GmAttentionSources): GmAttentionItem[] {
  const items: GmAttentionItem[] = [];
  for (const row of sources.permits) {
    if (row.status !== 'requested') continue;
    items.push({
      key: gmAttentionKey.permit(row.userId),
      kind: 'permit',
      text: `${row.userName} prosi o zgodę na nową postać`,
      tab: 'characters',
    });
  }
  for (const row of sources.ranks) {
    if (row.rankApproved) continue;
    const who = row.characterName ? `„${row.characterName}” (${row.userName})` : row.userName;
    items.push({
      key: gmAttentionKey.rank(row.id),
      kind: 'rank',
      text: `Szkic ${who} czeka na Rangę Postaci`,
      tab: 'characters',
    });
  }
  for (const character of sources.characters) {
    if (character.playReady) continue;
    items.push({
      key: gmAttentionKey.ready(character.id),
      kind: 'ready',
      text: `„${character.name}” czeka na przyjęcie do gry`,
      tab: 'characters',
    });
  }
  // #68: pula graczy wyczerpana — decyzja MG to dołożyć twarz w bibliotece.
  for (const row of sources.portraitWanted ?? []) {
    items.push({
      key: gmAttentionKey.portrait(row.userId),
      kind: 'portrait',
      text: `${row.userName} czeka na portret — w puli graczy nie ma wolnego`,
      tab: 'characters',
    });
  }
  for (const item of sources.chat) {
    if (item.type !== 'message') continue;
    const { message } = item;
    if (message.kind === 'request' && message.request && isCheckRequestOpen(message.request)) {
      items.push({
        key: gmAttentionKey.message(message.id),
        kind: 'request',
        text: `${message.request.askedByName} prosi o Test: ${message.request.rollLabel}`,
        tab: 'chat',
      });
    }
    // Propozycję, którą może rozstrzygnąć sterujący gracz, zostawiamy jemu —
    // MG widzi ją na czacie jak dotąd, ale nie jest ona sprawą „czeka na MG”.
    const proposal = message.proposal;
    if (
      message.kind === 'proposal' &&
      proposal &&
      proposal.resolution === undefined &&
      proposal.controllerUserId === null
    ) {
      items.push({
        key: gmAttentionKey.message(message.id),
        kind: 'proposal',
        text: `${proposal.botName} czeka na zatwierdzenie: ${proposal.combat?.summary ?? proposal.optionLabel}`,
        tab: 'chat',
      });
    }
  }
  return items;
}

/** Klucze spraw — te same stoją w `data-attention` wierszy, do których prowadzi „Przejdź”. */
export const gmAttentionKey = {
  permit: (userId: string) => `permit:${userId}`,
  rank: (draftId: string) => `rank:${draftId}`,
  ready: (characterId: string) => `ready:${characterId}`,
  portrait: (userId: string) => `portrait:${userId}`,
  message: (messageId: number) => `msg:${messageId}`,
};

/** Sprawy z `after`, których nie było w `before` — to one dzwonią i wyskakują. */
export function newGmAttention(
  before: readonly GmAttentionItem[],
  after: readonly GmAttentionItem[],
): GmAttentionItem[] {
  const known = new Set(before.map((item) => item.key));
  return after.filter((item) => !known.has(item.key));
}

const TITLE_COUNT = /^\(\d+\) /;

/** „(2) VTT — Cyberpunk RED”: licznik widać na karcie przeglądarki w tle. */
export function gmAttentionTitle(title: string, count: number): string {
  const base = title.replace(TITLE_COUNT, '');
  return count > 0 ? `(${count}) ${base}` : base;
}
