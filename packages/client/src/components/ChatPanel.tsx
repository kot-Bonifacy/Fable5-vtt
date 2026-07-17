import { useLayoutEffect, useRef, useState, type FormEvent, type UIEvent } from 'react';
import type { ChatMessageView } from '@vtt/shared';
import { loadOlderHistory, sendChatInput } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore, type ChatItem } from '../stores/chatStore.js';

const LOAD_MORE_THRESHOLD_PX = 48;
const STICK_TO_BOTTOM_PX = 64;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function MessageRow({ message, myUserId }: { message: ChatMessageView; myUserId: string }) {
  const isWhisper = message.kind === 'whisper';
  const whisperLabel =
    message.authorId === myUserId
      ? `szept do: ${message.recipientName ?? '?'}`
      : `szept od: ${message.authorName}`;

  return (
    <div className={`chat-message${isWhisper ? ' chat-message--whisper' : ''}`}>
      <div className="chat-message-meta">
        <span className="chat-message-author">{message.authorName}</span>
        {isWhisper && <span className="chat-whisper-label">{whisperLabel}</span>}
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-message-text">{message.text}</div>
    </div>
  );
}

export function ChatPanel() {
  const user = useAuthStore((s) => s.user);
  const synced = useChatStore((s) => s.synced);
  const campaign = useChatStore((s) => s.campaign);
  const items = useChatStore((s) => s.items);
  const hasMoreHistory = useChatStore((s) => s.hasMoreHistory);
  const loadingHistory = useChatStore((s) => s.loadingHistory);

  const [draft, setDraft] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** scrollHeight captured when older-history loading starts (to keep position). */
  const prependHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    if (prependHeightRef.current !== null && !loadingHistory) {
      feed.scrollTop += feed.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    } else if (stickToBottomRef.current) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, [items, loadingHistory]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const feed = event.currentTarget;
    stickToBottomRef.current =
      feed.scrollHeight - feed.scrollTop - feed.clientHeight < STICK_TO_BOTTOM_PX;
    if (feed.scrollTop < LOAD_MORE_THRESHOLD_PX && hasMoreHistory && !loadingHistory) {
      prependHeightRef.current = feed.scrollHeight;
      loadOlderHistory();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim().length === 0) return;
    sendChatInput(draft);
    setDraft('');
    stickToBottomRef.current = true;
  };

  if (!user) return null;

  return (
    <section className="chat-panel">
      <h2 className="panel-section-title">Czat</h2>
      <div className="chat-feed" ref={feedRef} onScroll={onScroll}>
        {!synced && <p className="placeholder-text">Synchronizacja…</p>}
        {synced && !campaign && (
          <p className="placeholder-text">Brak aktywnej kampanii — czat jest niedostępny.</p>
        )}
        {loadingHistory && <p className="chat-note">Wczytywanie historii…</p>}
        {items.map((item: ChatItem) =>
          item.type === 'message' ? (
            <MessageRow key={item.message.id} message={item.message} myUserId={user.id} />
          ) : (
            <p key={item.id} className="chat-note">
              {item.text}
            </p>
          ),
        )}
      </div>
      <form className="chat-input-row" onSubmit={onSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={campaign ? 'Wiadomość… (/w <imię> — szept)' : 'Czat niedostępny'}
          disabled={!synced || !campaign}
          aria-label="Wiadomość czatu"
        />
        <button type="submit" disabled={!synced || !campaign || draft.trim().length === 0}>
          Wyślij
        </button>
      </form>
    </section>
  );
}
