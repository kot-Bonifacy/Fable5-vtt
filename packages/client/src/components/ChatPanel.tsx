import { useLayoutEffect, useRef, type FormEvent, type ReactNode, type UIEvent } from 'react';
import type { ChatMessageView, RollResult } from '@vtt/shared';
import { loadOlderHistory, sendChatInput } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore, type ChatItem } from '../stores/chatStore.js';

const LOAD_MORE_THRESHOLD_PX = 48;
const STICK_TO_BOTTOM_PX = 64;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

/** The dice breakdown: one chip per die (max/min highlighted) plus modifiers. */
function RollDice({ roll }: { roll: RollResult }) {
  const parts: ReactNode[] = [];
  roll.terms.forEach((term, i) => {
    if (i > 0 || term.sign === -1) {
      parts.push(
        <span key={`sign-${i}`} className="chat-roll-sign">
          {term.sign === -1 ? '−' : '+'}
        </span>,
      );
    }
    if (term.kind === 'dice') {
      term.rolls.forEach((value, j) => {
        const extreme =
          value === term.sides ? ' chat-die--max' : value === 1 ? ' chat-die--min' : '';
        parts.push(
          <span key={`die-${i}-${j}`} className={`chat-die${extreme}`} title={`d${term.sides}`}>
            {value}
          </span>,
        );
      });
    } else {
      parts.push(
        <span key={`mod-${i}`} className="chat-roll-mod">
          {term.value}
        </span>,
      );
    }
  });
  if (roll.critical) {
    const { type, extraRoll } = roll.critical;
    parts.push(
      <span key="extra-sign" className="chat-roll-sign">
        {type === 'crit' ? '+' : '−'}
      </span>,
      <span
        key="extra-die"
        className={`chat-die chat-die--extra chat-die--${type}`}
        title="dorzut d10"
      >
        {extraRoll}
      </span>,
    );
  }
  return <div className="chat-roll-dice">{parts}</div>;
}

/** A roll result card — visually distinct from plain chat messages. */
function RollRow({ message }: { message: ChatMessageView }) {
  const roll = message.roll;
  if (!roll) return null;
  const isGmRoll = message.kind === 'gmroll';

  return (
    <div className={`chat-message chat-roll${isGmRoll ? ' chat-roll--gm' : ''}`}>
      <div className="chat-message-meta">
        <span className="chat-message-author">{message.authorName}</span>
        {isGmRoll && <span className="chat-roll-gm-label">rzut do MG</span>}
        <span className="chat-message-time">{formatTime(message.createdAt)}</span>
      </div>
      <div className="chat-roll-body">
        <div className="chat-roll-header">
          <span className="chat-roll-notation">
            {roll.notation}
            {message.text && <span className="chat-roll-flavor"> — {message.text}</span>}
          </span>
          <span className="chat-roll-total">{roll.total}</span>
        </div>
        <RollDice roll={roll} />
        {(roll.critical || roll.criticalDamage) && (
          <div className="chat-roll-badges">
            {roll.critical?.type === 'crit' && (
              <span className="chat-roll-badge chat-roll-badge--crit">
                Krytyk! dorzut +{roll.critical.extraRoll}
              </span>
            )}
            {roll.critical?.type === 'fumble' && (
              <span className="chat-roll-badge chat-roll-badge--fumble">
                Fumble! dorzut −{roll.critical.extraRoll}
              </span>
            )}
            {roll.criticalDamage && (
              <span className="chat-roll-badge chat-roll-badge--injury">Rana krytyczna!</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
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

  // Draft lives in the store so the dice cup can read and execute commands.
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
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
            item.message.kind === 'roll' || item.message.kind === 'gmroll' ? (
              <RollRow key={item.message.id} message={item.message} />
            ) : (
              <MessageRow key={item.message.id} message={item.message} myUserId={user.id} />
            )
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
          placeholder={
            campaign ? 'Wiadomość… (/r 1d10+5 — rzut, /w <imię> — szept)' : 'Czat niedostępny'
          }
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
