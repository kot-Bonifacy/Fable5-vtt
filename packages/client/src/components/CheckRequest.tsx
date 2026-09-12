import { useState } from 'react';
import type { ChatMessageView, CheckRequestEntry, CpredRollRequest, SocketAck } from '@vtt/shared';
import {
  CHECK_CALL_PROMPT_MAX,
  CPRED_DIFFICULTY_LADDER,
  ROLE_GM,
  checkRequestResolutionLabel,
  isCheckRequestOpen,
  mayCancelCheckRequest,
} from '@vtt/shared';
import { cancelCheckRequest, checkRequestErrorText, resolveCheckRequest } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCheckStore } from '../stores/checkStore.js';

/**
 * Karta prośby o Test (etap 40) — gracz pyta, MG odpowiada jednym kliknięciem.
 *
 * Widzą ją tylko MG i proszący (serwer dostarcza ją wzorem szeptu), więc karta
 * nie ma gałęzi „kto to czyta": drabinkę dostaje MG, „Wycofaj" — autor prośby.
 *
 * Drabinka stoi **na karcie**, a nie za przyciskiem otwierającym okno, bo o to
 * chodziło w decyzji MG nr 2 z 06.09: zgoda na rzut, który pada co kilka minut,
 * ma być jednym kliknięciem. „Ustaw…" obok prowadzi do pełnego okna wezwania
 * z etapu 32 — tam MG podmienia Umiejętność, dopisuje modyfikator, wybiera
 * widoczność albo robi z tego rzut przeciwstawny.
 *
 * Czego tu nie ma: skutków. Karta dowozi zgodę albo odmowę, karta wezwania
 * dowozi werdykt, i na tym VTT kończy (decyzja odziedziczona z etapu 32).
 */
export function CheckRequestRow({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: CheckRequestEntry;
}) {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState('');

  const open = isCheckRequestOpen(entry);
  const mine = mayCancelCheckRequest(entry, userId);

  async function run(action: () => Promise<SocketAck<unknown>>) {
    setBusy(true);
    const ack = await action();
    setBusy(false);
    if (!ack.ok) useChatStore.getState().addNote(checkRequestErrorText(ack.error));
  }

  function approveAt(dv: number) {
    void run(() =>
      resolveCheckRequest({ messageId: message.id, approve: true, dv, visibility: 'public' }),
    );
  }

  function refuse() {
    void run(async () => {
      const ack = await resolveCheckRequest({
        messageId: message.id,
        approve: false,
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      });
      if (ack.ok) {
        setRefusing(false);
        setNote('');
      }
      return ack;
    });
  }

  function openFullCall() {
    useCheckStore.getState().openCall({
      characterId: entry.characterId,
      characterName: entry.characterName,
      requestMessageId: message.id,
      request: entry.system as unknown as CpredRollRequest,
      ...(entry.reason !== undefined ? { prompt: entry.reason } : {}),
    });
  }

  const resolution = entry.resolution;
  return (
    <div
      className={`chat-message chat-request${
        resolution && resolution.kind !== 'approved' ? ' chat-request--closed' : ''
      }`}
      data-testid="check-request"
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">Prośba o Test</span>
        <span className="chat-roll-gm-label">{entry.askedByName}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">
          {entry.characterName} — {entry.rollLabel}
        </span>
      </div>
      {entry.reason && <p className="chat-proposal-reason">„{entry.reason}"</p>}

      {resolution && (
        <div className="chat-roll-badges">
          <span
            className={`chat-roll-badge chat-roll-badge--${
              resolution.kind === 'approved' ? 'success' : 'failure'
            }`}
          >
            {checkRequestResolutionLabel(entry)}
          </span>
          <span className="chat-attack-detail">
            {resolution.kind === 'withdrawn' ? 'wycofał' : 'od'}: {resolution.byName}
            {resolution.callMessageId !== undefined
              ? ` · wezwanie #${resolution.callMessageId}`
              : ''}
          </span>
        </div>
      )}
      {resolution?.note && <p className="chat-request-note">„{resolution.note}"</p>}

      {open && isGm && !refusing && (
        <>
          <div className="chat-request-ladder">
            {CPRED_DIFFICULTY_LADDER.map((rung) => (
              <button
                key={rung.id}
                type="button"
                className="small-button"
                disabled={busy}
                title={`${rung.note} — zgoda wystawia wezwanie na PT ${rung.dv}`}
                onClick={() => approveAt(rung.dv)}
              >
                {rung.label} <b>{rung.dv}</b>
              </button>
            ))}
          </div>
          <div className="chat-note-actions">
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Pełne okno wezwania — inna Umiejętność, modyfikator, widoczność, rzut przeciwstawny"
              onClick={openFullCall}
            >
              Ustaw…
            </button>
            <button
              type="button"
              className="small-button"
              disabled={busy}
              onClick={() => setRefusing(true)}
            >
              Odmów
            </button>
          </div>
        </>
      )}

      {open && isGm && refusing && (
        <div className="chat-request-refusal">
          <label className="auth-label" htmlFor={`check-request-note-${message.id}`}>
            Dlaczego nie ma rzutu (opcjonalnie)
          </label>
          <input
            id={`check-request-note-${message.id}`}
            type="text"
            maxLength={CHECK_CALL_PROMPT_MAX}
            value={note}
            placeholder="Nie ma na to rzutu — po prostu widzisz, że jest zdenerwowany."
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="chat-note-actions">
            <button type="button" className="small-button" disabled={busy} onClick={refuse}>
              Wyślij odmowę
            </button>
            <button
              type="button"
              className="small-button"
              disabled={busy}
              onClick={() => setRefusing(false)}
            >
              Wróć
            </button>
          </div>
        </div>
      )}

      {open && !isGm && (
        <div className="chat-note-actions">
          <span className="chat-action-note">Czeka na MG.</span>
          {mine && (
            <button
              type="button"
              className="small-button"
              disabled={busy}
              onClick={() => void run(() => cancelCheckRequest(message.id))}
            >
              Wycofaj
            </button>
          )}
        </div>
      )}
    </div>
  );
}
