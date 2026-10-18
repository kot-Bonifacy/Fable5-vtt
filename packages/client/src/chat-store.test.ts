import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessageView, StateSyncPayload } from '@vtt/shared';
import { useChatStore, type ChatItem } from './stores/chatStore.js';

/**
 * #81 (T9b): notki lokalne po ponownym połączeniu. Historia wraca z serwera
 * w całości, a notka bez `seq` stoi tam, gdzie stała — za wierszem, który był
 * najnowszy, kiedy powstała — zamiast zjeżdżać pod nowsze wiadomości.
 */

function message(id: number, text = `wiersz ${id}`): ChatMessageView {
  return {
    id,
    kind: 'say',
    authorId: 'u',
    authorName: 'Bartek',
    text,
    createdAt: new Date(1_800_000_000_000 + id * 1000).toISOString(),
  } as ChatMessageView;
}

function sync(messages: ChatMessageView[]): StateSyncPayload {
  return {
    campaign: null,
    seq: messages.length,
    presence: [],
    messages,
    hasMoreHistory: false,
  } as unknown as StateSyncPayload;
}

const store = () => useChatStore.getState();

function feed(items: ChatItem[]): string[] {
  return items.map((item) => (item.type === 'message' ? `#${item.message.id}` : item.text));
}

beforeEach(() => {
  useChatStore.setState({ items: [], held: [], seq: 0, synced: false });
});

describe('notki lokalne po ponownym połączeniu (#81)', () => {
  it('wracają za swój wiersz, nie na koniec odbudowanej historii', () => {
    store().addNote('Na początku.');
    store().applySync(sync([message(1), message(2)]));
    store().addNote('Sesja rozpoczęta — gracze są przy stole.');
    store().applyMessage({ seq: 3, message: message(3) });
    store().addNote('Wykidajło nie odpowiada.');
    expect(feed(store().items)).toEqual([
      'Na początku.',
      '#1',
      '#2',
      'Sesja rozpoczęta — gracze są przy stole.',
      '#3',
      'Wykidajło nie odpowiada.',
    ]);

    // Restart serwera: przyszły dwie nowe wiadomości, historia wraca cała.
    store().setDesynced();
    store().applySync(sync([message(1), message(2), message(3), message(4), message(5)]));
    expect(feed(store().items)).toEqual([
      'Na początku.',
      '#1',
      '#2',
      'Sesja rozpoczęta — gracze są przy stole.',
      '#3',
      'Wykidajło nie odpowiada.',
      '#4',
      '#5',
    ]);
  });

  it('notka za wierszem spoza okna historii staje przed pierwszym wierszem', () => {
    store().applySync(sync([message(1), message(2)]));
    store().addNote('Dawno temu.');
    store().applySync(sync([message(7), message(8)]));
    expect(feed(store().items)).toEqual(['Dawno temu.', '#7', '#8']);
  });
});
