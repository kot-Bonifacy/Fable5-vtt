import { describe, expect, it } from 'vitest';
import type { ChatMessageView } from '@vtt/shared';
import { CHAT_GROUP_WINDOW_MS, chatContinuations, chatHeaderKey } from './chat-grouping.js';
import type { ChatItem } from './stores/chatStore.js';

/** Etap 60b: kolejne karty tego samego mówiącego tracą powtórzony nagłówek. */

const START = 1_800_000_000_000;

function msg(id: number, patch: Partial<ChatMessageView> = {}, atMs = id * 1000): ChatItem {
  return {
    type: 'message',
    message: {
      id,
      kind: 'say',
      authorId: 'ola',
      authorName: 'Ola',
      text: `wiersz ${id}`,
      createdAt: new Date(START + atMs).toISOString(),
      ...patch,
    } as ChatMessageView,
  };
}

const note: ChatItem = { type: 'note', id: 'n1', text: 'Notatka' };
const never = () => false;

function continued(rows: (ChatItem | null)[], breaks: (item: ChatItem) => boolean = never) {
  return [...chatContinuations(rows, breaks)].sort((a, b) => a - b);
}

describe('chatContinuations', () => {
  it('skleja kolejne wypowiedzi jednej osoby — pierwsza zostaje z nagłówkiem', () => {
    expect(continued([msg(1), msg(2), msg(3)])).toEqual([2, 3]);
  });

  it('inny autor, inna postać albo inny NPC z `/jako` przerywa grupę', () => {
    expect(continued([msg(1), msg(2, { authorId: 'marek', authorName: 'Marek' })])).toEqual([]);
    // Gracz z dwiema postaciami: to samo konto, inny podpis.
    expect(continued([msg(1), msg(2, { authorName: 'Kowal' })])).toEqual([]);
    expect(
      continued([
        msg(1, { authorId: 'mg', authorName: 'Barman', botId: 'b1' }),
        msg(2, { authorId: 'mg', authorName: 'Ochroniarz', botId: 'b2' }),
        msg(3, { authorId: 'mg', authorName: 'Ochroniarz', botId: 'b2' }),
      ]),
    ).toEqual([3]);
  });

  it('wypowiedź po szepcie i szept do innej osoby zachowują nagłówek z etykietą', () => {
    expect(
      continued([
        msg(1, { kind: 'whisper', recipientId: 'mg', recipientName: 'MG' }),
        msg(2),
        msg(3, { kind: 'whisper', recipientId: 'mg', recipientName: 'MG' }),
        msg(4, { kind: 'whisper', recipientId: 'marek', recipientName: 'Marek' }),
        msg(5, { kind: 'whisper', recipientId: 'marek', recipientName: 'Marek' }),
      ]),
    ).toEqual([5]);
  });

  it('przerwa dłuższa niż 2 minuty zaczyna nową grupę', () => {
    expect(continued([msg(1, {}, 0), msg(2, {}, CHAT_GROUP_WINDOW_MS)])).toEqual([2]);
    expect(continued([msg(1, {}, 0), msg(2, {}, CHAT_GROUP_WINDOW_MS + 1)])).toEqual([]);
    // Okno liczy się od poprzedniej karty, nie od pierwszej w grupie.
    expect(
      continued([msg(1, {}, 0), msg(2, {}, 90_000), msg(3, {}, 180_000), msg(4, {}, 270_000)]),
    ).toEqual([2, 3, 4]);
  });

  it('separator ukrytych wierszy i notatka lokalna przerywają grupę', () => {
    expect(continued([msg(1), null, msg(2)])).toEqual([]);
    expect(continued([msg(1), note, msg(2)])).toEqual([]);
  });

  it('karta przerywająca stoi osobno po obu stronach', () => {
    const breaks = (item: ChatItem) => item.type === 'message' && item.message.id === 2;
    expect(continued([msg(1), msg(2), msg(3), msg(4)], breaks)).toEqual([4]);
  });

  it('karta rzutu nigdy się nie skleja', () => {
    const roll = { kind: 'roll' as const, roll: {} as ChatMessageView['roll'] };
    expect(continued([msg(1, roll), msg(2, roll)])).toEqual([]);
  });

  it('akcje tury sklejają się po działającym, nie po koncie, które je wystawiło', () => {
    const action = (actorName: string) => ({
      kind: 'action' as const,
      authorId: 'mg',
      authorName: 'MG',
      action: { actorName } as ChatMessageView['action'],
    });
    expect(
      continued([msg(1, action('Zbir')), msg(2, action('Zbir')), msg(3, action('Kowal'))]),
    ).toEqual([2]);
  });
});

describe('chatHeaderKey', () => {
  it('karty z nagłówkiem innym niż mówiący nie sklejają się nigdy', () => {
    for (const kind of [
      'roll',
      'gmroll',
      'damage',
      'proposal',
      'economy',
      'handout',
      'journal',
      'check',
      'request',
      'inventory',
      'sighting',
      'surgery',
      'cardsubmission',
      'rolltable',
      'gmrolltable',
    ] as const) {
      const item = msg(1, { kind });
      expect(item.type === 'message' && chatHeaderKey(item.message), kind).toBe(null);
    }
  });
});
