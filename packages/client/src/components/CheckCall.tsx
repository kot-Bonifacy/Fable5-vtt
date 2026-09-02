import type { ChatMessageView, CheckCallEntry } from '@vtt/shared';
import { ROLE_GM, checkCallTargetText, isCheckCallOpen, mayAnswerCheckCall } from '@vtt/shared';
import { cancelCheck, checkCallErrorText } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { openCallDialog } from './DiceCup.js';

/**
 * Karta wezwania do Testu (etap 32) — MG prosi jedną postać o rzut.
 *
 * Widzą ją tylko MG i wezwany (serwer dostarcza ją wzorem szeptu), więc karta
 * nie ma gałęzi „kto to czyta": przycisk „Rzuć" dostaje ten, kto może rzucić,
 * a „Odwołaj" — MG. Werdykt zostaje na karcie po rzucie, żeby dziennik czytało
 * się bez skakania między wiadomościami.
 *
 * Skutków tu nie ma świadomie: co się stało po nieudanym Teście, rozstrzyga MG
 * ręką (decyzja MG z 02.09.2026). Karta dowozi wyraźny werdykt i tyle.
 */
export function CheckCallRow({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: CheckCallEntry;
}) {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const cupBusy = useRollStore((s) => s.pending !== null || s.target !== null);

  const open = isCheckCallOpen(entry);
  const mayRoll = mayAnswerCheckCall(entry, userId, isGm);

  function takeCup() {
    openCallDialog(message.id, entry);
  }

  async function withdraw() {
    const ack = await cancelCheck(message.id);
    if (!ack.ok) useChatStore.getState().addNote(checkCallErrorText(ack.error));
  }

  return (
    <div
      className={`chat-message chat-check${entry.cancelled ? ' chat-check--cancelled' : ''}`}
      data-testid="check-call"
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">Wezwanie do Testu</span>
        <span className="chat-roll-gm-label">{entry.calledByName}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">
          {entry.characterName} — {entry.rollLabel}
        </span>
        <span className="chat-action-note">{checkCallTargetText(entry)}</span>
      </div>
      {entry.prompt && <p className="chat-proposal-reason">„{entry.prompt}"</p>}
      {entry.modifier !== undefined && entry.modifier !== 0 && (
        <p className="chat-check-modifier">
          Modyfikator od MG: {entry.modifier > 0 ? '+' : '−'}
          {Math.abs(entry.modifier)}
        </p>
      )}

      {entry.resolved && (
        <div className="chat-roll-badges">
          <span
            className={`chat-roll-badge chat-roll-badge--${
              entry.resolved.success ? 'success' : 'failure'
            }`}
          >
            {entry.resolved.success ? 'Zdane' : 'Niezdane'} · wynik {entry.resolved.total}
          </span>
          <span className="chat-attack-detail">rzucał: {entry.resolved.byName}</span>
        </div>
      )}
      {entry.cancelled && (
        <span className="chat-action-badge">Odwołane — {entry.cancelled.byName}</span>
      )}

      {open && (
        <div className="chat-note-actions">
          {mayRoll && (
            <button
              type="button"
              className="small-button"
              disabled={cupBusy}
              title={
                entry.ownerId === userId
                  ? 'Weź kubek i rzuć na wezwanie MG'
                  : 'Rzuć za tę postać — jej gracz jest poza stołem'
              }
              onClick={takeCup}
            >
              {entry.ownerId === userId ? 'Rzuć' : 'Rzuć za nią'}
            </button>
          )}
          {isGm && (
            <button type="button" className="small-button" onClick={() => void withdraw()}>
              Odwołaj
            </button>
          )}
          {!mayRoll && !isGm && <span className="chat-action-note">Czeka na rzut.</span>}
        </div>
      )}
    </div>
  );
}
