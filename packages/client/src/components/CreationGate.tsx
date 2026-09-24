import { useState } from 'react';
import { acceptCreationRules, creationErrorText, requestCreation } from '../socket.js';
import { useCreationStore } from '../stores/creationStore.js';

/**
 * A player's way into the character creator (decyzja MG z 24.09).
 *
 * Without a draft the button asks the GM first; once the GM agrees, the first
 * click shows the rules — each stat is rolled once, the draft cannot be thrown
 * away, the GM approves the result — and only „Rozumiem, zaczynam" opens the
 * wizard. A draft already on the server skips all of it: it is resumed.
 */
export function CreationGate({ resume }: { resume: string | null }) {
  const permit = useCreationStore((s) => s.permit);
  const openCreator = useCreationStore((s) => s.openCreator);
  const setPermit = useCreationStore((s) => s.setPermit);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resume) {
    return (
      <button
        type="button"
        className="small-button character-creator-open"
        onClick={() => void openCreator()}
        title="Wznów szkic postaci — kreator otworzy się tam, gdzie skończono"
      >
        🧬 Wznów szkic: {resume}
      </button>
    );
  }

  async function ask(cancel: boolean) {
    setBusy(true);
    setError(null);
    const ack = await requestCreation(cancel);
    setBusy(false);
    if (ack.ok && ack.data) setPermit(ack.data);
    else setError(creationErrorText(ack.ok ? undefined : ack.error));
  }

  async function accept() {
    setBusy(true);
    setError(null);
    const ack = await acceptCreationRules();
    setBusy(false);
    if (!ack.ok || !ack.data) {
      setError(creationErrorText(ack.ok ? undefined : ack.error));
      return;
    }
    setPermit(ack.data);
    setRulesOpen(false);
    void openCreator();
  }

  const status = permit?.status ?? 'none';
  return (
    <div className="creation-gate">
      {status === 'none' && (
        <>
          <button
            type="button"
            className="small-button character-creator-open"
            disabled={busy || permit === null}
            onClick={() => void ask(false)}
            title="Nową postać tworzy się za zgodą MG"
          >
            ✋ Poproś MG o stworzenie postaci
          </button>
          {permit?.refused && (
            <p className="creation-gate-note" role="status">
              MG nie zgodził się teraz na nową postać. Możesz poprosić ponownie.
            </p>
          )}
        </>
      )}
      {status === 'requested' && (
        <p className="creation-gate-note" role="status">
          Czekasz na zgodę MG na nową postać.{' '}
          <button
            type="button"
            className="small-button"
            disabled={busy}
            onClick={() => void ask(true)}
          >
            Wycofaj prośbę
          </button>
        </p>
      )}
      {status === 'granted' && (
        <button
          type="button"
          className="small-button small-button--primary character-creator-open"
          disabled={busy}
          onClick={() => (permit?.rulesAccepted ? void openCreator() : setRulesOpen(true))}
          title="MG zgodził się na nową postać"
        >
          🧬 Kreator postaci…
        </button>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {rulesOpen && (
        <div className="dialog-backdrop" onClick={() => setRulesOpen(false)}>
          <div
            className="dialog creation-rules"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creation-rules-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="creation-rules-title" className="panel-section-title">
              Zanim zaczniesz: zasady tworzenia postaci
            </h3>
            <ul className="creation-rules-list">
              <li>
                Każdą Cechę losujesz <strong>raz</strong>, kubkiem. Przerzucić może pozwolić tylko
                MG.
              </li>
              <li>
                Szkicu <strong>nie da się wyrzucić ani zacząć od nowa</strong> — zrobić to może
                tylko MG. Rolę, umiejętności, zakupy i Ścieżkę Życia zmieniasz dowolnie, a
                wylosowane Cechy zostają przy każdej zmianie.
              </li>
              <li>
                Gotową postać <strong>zatwierdza MG</strong>. Do tego czasu karta jest tylko do
                podglądu, a żeton nie stanie na mapie.
              </li>
            </ul>
            <div className="creation-rules-actions">
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => setRulesOpen(false)}
              >
                Jeszcze nie
              </button>
              <button
                type="button"
                className="small-button small-button--primary"
                disabled={busy}
                autoFocus
                onClick={() => void accept()}
              >
                Rozumiem, zaczynam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
