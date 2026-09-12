import { useEffect, useState } from 'react';
import { CHECK_CALL_PROMPT_MAX } from '@vtt/shared';
import { checkRequestErrorText, requestCheck } from '../socket.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCheckStore } from '../stores/checkStore.js';

/**
 * „Poproś MG o Test" (etap 40) — okno gracza, w którym powstaje prośba.
 *
 * Jedno pole i dwa przyciski, i to jest cała treść tego okna. Czym się rzuca,
 * gracz wybrał już w wierszu karty; progu, modyfikatora ani widoczności nie ma
 * tu świadomie — **to są decyzje MG** i pojawią się dopiero w wezwaniu, które
 * z tej prośby powstanie (decyzja MG nr 2 z 06.09.2026).
 */
export function CheckRequestDialog() {
  const draft = useCheckStore((s) => s.requestDraft);
  const close = useCheckStore((s) => s.closeRequest);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Nowy wiersz karty = nowa prośba: zdanie „po co" z poprzedniej nie ma prawa
  // podjechać pod inną Umiejętność.
  useEffect(() => setReason(''), [draft?.characterId, draft?.label]);

  if (!draft) return null;

  async function submit() {
    if (!draft) return;
    setBusy(true);
    const ack = await requestCheck({
      characterId: draft.characterId,
      request: draft.request,
      ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
    });
    setBusy(false);
    if (!ack.ok) {
      useChatStore.getState().addNote(checkRequestErrorText(ack.error));
      return;
    }
    close();
  }

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog check-request-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="panel-section-title">Poproś MG o Test</h3>
        <p className="check-request-what">
          <strong>{draft.characterName}</strong> — {draft.label}
        </p>

        <label className="auth-label" htmlFor="check-request-reason">
          Po co — co chcesz osiągnąć
        </label>
        <textarea
          id="check-request-reason"
          rows={3}
          maxLength={CHECK_CALL_PROMPT_MAX}
          value={reason}
          placeholder="Chcę zrozumieć, co znaczy ta mina…"
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />

        <div className="scene-editor-row">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void submit()}
          >
            Wyślij prośbę
          </button>
          <button type="button" className="small-button" onClick={close}>
            Anuluj
          </button>
        </div>
        <p className="roll-dialog-hint">
          Prośbę zobaczy tylko MG. Poziom Trudności ustawia on — kubek zawoła dopiero po zgodzie.
        </p>
      </div>
    </div>
  );
}
