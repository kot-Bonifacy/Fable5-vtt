import { useRef, useState } from 'react';
import type { CardSubmissionEntry, ChatMessageView } from '@vtt/shared';
import {
  ARCHIVE_REFUSAL_MESSAGES,
  CARD_SUBMISSION_PATHS,
  CARD_SUBMISSION_REFUSALS,
  CARD_SUBMISSION_STATUS_LABELS,
  ROLE_GM,
  archiveRefusalText,
  cardSubmissionHeadline,
  cardSubmissionLabel,
  cardSubmissionStatus,
} from '@vtt/shared';
import { ApiError, apiPost, apiUpload } from '../api.js';
import { clearNotices, notifyInfo, notifyRefusal } from '../notices.js';
import { formatSessionClock } from '../session-view.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';

/**
 * Karta gracza z innej kampanii (etap 57c, decyzja MG 9).
 *
 * Gracz pobiera kopię swojej karty („⤓” na belce), a w nowej kampanii zgłasza
 * ją stąd — paczka idzie do poczekalni na serwerze, MG dostaje kartę czatu
 * z podglądem i „Przyjmij” / „Odrzuć” (oraz wiersz w „Czeka na MG”). Gracz
 * kartą sam do kampanii nie wchodzi.
 */

function submissionErrorText(code: string): string {
  if (code in ARCHIVE_REFUSAL_MESSAGES) {
    return archiveRefusalText(code as keyof typeof ARCHIVE_REFUSAL_MESSAGES, 'character');
  }
  if (code === 'ARCHIVE_EMPTY') return 'Karta w pliku nie ma imienia.';
  return CARD_SUBMISSION_REFUSALS[code] ?? `Nie udało się zgłosić karty (${code}).`;
}

function errorCode(error: unknown): string {
  if (!(error instanceof ApiError)) return 'NETWORK';
  // 413 bez JSON-a to sufit pośrednika (nginx na VPS), nie serwera VTT.
  return error.status === 413 ? 'ARCHIVE_PACKAGE_TOO_LARGE' : error.code;
}

/** „Zgłoś kartę z pliku…” — pod „Twoją postacią” w zakładce gracza. */
export function CardSubmitGate() {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const items = useChatStore((s) => s.items);
  const inCombat = useCombatLocked();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const waiting = items.find(
    (item) =>
      item.type === 'message' &&
      item.message.kind === 'cardsubmission' &&
      item.message.authorId === userId &&
      item.message.cardSubmission !== undefined &&
      cardSubmissionStatus(item.message.cardSubmission) === 'open',
  );
  const waitingName =
    waiting?.type === 'message' ? (waiting.message.cardSubmission?.name ?? null) : null;

  async function send(file: File) {
    clearNotices('character');
    setBusy(true);
    try {
      await apiUpload<{ messageId: number }>(CARD_SUBMISSION_PATHS.submit, file);
      notifyInfo('Karta zgłoszona — MG zobaczy ją na czacie i zdecyduje, czy wchodzi do gry.', {
        title: 'Karta z pliku',
        topic: 'character',
      });
    } catch (error) {
      notifyRefusal('character', submissionErrorText(errorCode(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-submit" aria-label="Karta z innej kampanii">
      {waitingName ? (
        <p className="creation-gate-text" role="status">
          Zgłoszona karta <strong>{waitingName}</strong> czeka na decyzję MG.
        </p>
      ) : (
        <>
          <p className="creation-gate-text">
            Grasz postacią z innej kampanii? Pobierz jej kopię przyciskiem ⤓ na belce karty tam, a
            tutaj zgłoś plik — MG przyjmie kartę albo odrzuci.
          </p>
          <button
            type="button"
            className="small-button"
            disabled={busy || inCombat}
            title={inCombat ? COMBAT_LOCKED_HINT : 'Paczka ZIP karty pobrana z innej kampanii'}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Wysyłam…' : '📂 Zgłoś kartę z pliku…'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,.json,application/json"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Plik karty do zgłoszenia"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void send(file);
            }}
          />
        </>
      )}
    </section>
  );
}

/** Karta czatu `cardsubmission` — podgląd dla MG z decyzją, stan dla gracza. */
export function CardSubmissionRow({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: CardSubmissionEntry;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [busy, setBusy] = useState(false);
  const status = cardSubmissionStatus(entry);
  const open = status === 'open';

  async function respond(action: 'accept' | 'refuse') {
    clearNotices('archive');
    setBusy(true);
    try {
      await apiPost(CARD_SUBMISSION_PATHS.respond(message.id), { action });
      if (action === 'accept') {
        notifyInfo(`„${entry.name}” jest teraz kartą gracza ${entry.userName}.`, {
          title: 'Karta z pliku',
          topic: 'archive',
        });
      }
    } catch (error) {
      notifyRefusal('archive', submissionErrorText(errorCode(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`chat-message chat-inventory${status === 'refused' || status === 'expired' ? ' chat-inventory--refused' : ''}`}
      data-testid="card-submission"
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">Karta z pliku</span>
        <span className="chat-roll-gm-label">{message.authorName}</span>
      </div>
      <div className="chat-action-body chat-card-submission">
        {/* Portret leży w poczekalni tylko do decyzji — potem karta ma własny. */}
        {open && entry.hasPortrait && (
          <img
            className="chat-card-submission-portrait"
            src={CARD_SUBMISSION_PATHS.portrait(entry.submissionId)}
            alt=""
          />
        )}
        <span className="chat-action-name">{cardSubmissionHeadline(entry)}</span>
      </div>
      <ul className="chat-inventory-lines">
        {/* Bez Roli wiersz powtórzyłby imię z nagłówka. */}
        {entry.roleName && <li>{cardSubmissionLabel(entry)}</li>}
        {open && <li>Plik czeka do {formatSessionClock(entry.expiresAt)}</li>}
      </ul>
      {!open && (
        <span
          className={`chat-action-badge${status === 'accepted' ? ' chat-inventory-badge--done' : ''}`}
        >
          {CARD_SUBMISSION_STATUS_LABELS[status]}
          {entry.byName ? ` — ${entry.byName}` : ''}
        </span>
      )}
      {open && (
        <div className="chat-note-actions">
          {isGm ? (
            <>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Karta wejdzie do tej kampanii jako karta tego gracza, z portretem, gotowa do gry"
                onClick={() => void respond('accept')}
              >
                Przyjmij
              </button>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Plik zejdzie z serwera, karta nie wejdzie"
                onClick={() => void respond('refuse')}
              >
                Odrzuć
              </button>
            </>
          ) : (
            <span className="chat-action-note">Czeka na MG.</span>
          )}
        </div>
      )}
    </div>
  );
}
