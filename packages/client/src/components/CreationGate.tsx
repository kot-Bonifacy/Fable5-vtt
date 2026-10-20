import { useState } from 'react';
import type { CpredCreationData, CreationTerms } from '@vtt/shared';
import { CPRED_CREATION_METHOD_LABELS, creationDataOf } from '@vtt/shared';
import { acceptCreationRules, creationErrorText, requestCreation } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCreationStore } from '../stores/creationStore.js';

/** „Kompletny Pakiet · Postać początkująca (62 pkt Cech) · 86 pkt umiejętności". */
export function creationTermsLine(terms: CreationTerms, data: CpredCreationData): string {
  const rank = data.statRanks.find((entry) => entry.id === terms.statRankId);
  const stats =
    terms.method === 'complete' && rank ? ` · ${rank.name} (${rank.points} pkt Cech)` : '';
  return `${CPRED_CREATION_METHOD_LABELS[terms.method]}${stats} · ${terms.skillPoints} pkt umiejętności`;
}

/**
 * A player's way into the character creator (decyzja MG z 24.09).
 *
 * Without a draft the button asks the GM first; once the GM agrees, the first
 * click shows the rules — each stat is rolled once, the draft cannot be thrown
 * away, the GM approves the result — and only „Rozumiem, zaczynam" opens the
 * wizard. A draft already on the server skips all of it: it is resumed.
 *
 * 20.10: a card that says which step the player is on and what comes next,
 * with one large button — a small button under the list confused new players.
 */
export function CreationGate({
  resume,
  another = false,
}: {
  resume: string | null;
  /** Gracz ma już postać (#58) — przycisk prosi o **kolejną**, nie o pierwszą. */
  another?: boolean;
}) {
  const permit = useCreationStore((s) => s.permit);
  const openCreator = useCreationStore((s) => s.openCreator);
  const setPermit = useCreationStore((s) => s.setPermit);
  const registry = useCharacterStore((s) => s.registry);
  const terms = permit?.terms ? creationTermsLine(permit.terms, creationDataOf(registry)) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resume) {
    return (
      <section className="creation-gate creation-gate--ready" aria-label="Tworzenie postaci">
        <h3 className="creation-gate-title">Postać w budowie</h3>
        <p className="creation-gate-text">
          Masz rozpoczęty szkic: <strong>{resume}</strong>. Kreator otworzy się tam, gdzie
          skończono.
        </p>
        <button
          type="button"
          className="creation-gate-button primary-button"
          onClick={() => void openCreator()}
        >
          🧬 Wznów tworzenie postaci
        </button>
      </section>
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

  const status = permit?.status ?? 'none';
  return (
    <section
      className={`creation-gate${status === 'granted' ? ' creation-gate--ready' : ''}`}
      aria-label="Tworzenie postaci"
    >
      <h3 className="creation-gate-title">
        {another ? 'Kolejna postać' : 'Twoja postać'}
        <span className="creation-gate-step">
          {status === 'granted' ? 'krok 2 z 2' : 'krok 1 z 2'}
        </span>
      </h3>
      {status === 'none' && (
        <>
          <p className="creation-gate-text">
            Postać tworzysz w kreatorze, krok po kroku. Najpierw poproś MG o zgodę — dostanie
            powiadomienie, a Ty jego odpowiedź.
          </p>
          {permit?.refused && (
            <p className="creation-gate-note" role="status">
              MG nie zgodził się teraz na nową postać. Możesz poprosić ponownie.
            </p>
          )}
          <button
            type="button"
            className="creation-gate-button"
            disabled={busy || permit === null}
            onClick={() => void ask(false)}
          >
            {another ? '✋ Poproś MG o kolejną postać' : '✋ Poproś MG o stworzenie postaci'}
          </button>
        </>
      )}
      {status === 'requested' && (
        <>
          <p className="creation-gate-text" role="status">
            Prośba wysłana — czekasz na zgodę MG. Gdy się zgodzi, dostaniesz powiadomienie, a tu
            pojawi się przycisk kreatora.
          </p>
          <button
            type="button"
            className="small-button"
            disabled={busy}
            onClick={() => void ask(true)}
          >
            Wycofaj prośbę
          </button>
        </>
      )}
      {status === 'granted' && (
        <>
          <p className="creation-gate-text">
            MG się zgodził. Kreator przeprowadzi Cię przez Rolę, Cechy, Umiejętności, Ścieżkę Życia,
            sprzęt i opis.
          </p>
          {terms && <p className="creation-gate-note">Warunki od MG: {terms}.</p>}
          <button
            type="button"
            className="creation-gate-button primary-button"
            disabled={busy}
            onClick={() => void openCreator()}
          >
            🧬 Stwórz postać
          </button>
        </>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The rules before a player's first draft (24.09), raised by `openCreator`
 * from wherever the wizard was asked for — the „Postacie" tab or the consent
 * notice. „Rozumiem, zaczynam" accepts them on the server and opens the wizard.
 */
export function CreationRulesDialog() {
  const rulesOpen = useCreationStore((s) => s.rulesOpen);
  const setRulesOpen = useCreationStore((s) => s.setRulesOpen);
  const permit = useCreationStore((s) => s.permit);
  const setPermit = useCreationStore((s) => s.setPermit);
  const openCreator = useCreationStore((s) => s.openCreator);
  const registry = useCharacterStore((s) => s.registry);
  const terms = permit?.terms ? creationTermsLine(permit.terms, creationDataOf(registry)) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!rulesOpen) return null;

  function close() {
    setRulesOpen(false);
    setError(null);
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

  return (
    <div className="dialog-backdrop" onClick={close}>
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
        {terms && <p className="creation-gate-note">Warunki od MG: {terms}.</p>}
        <ul className="creation-rules-list">
          <li>
            Każdą Cechę losujesz <strong>raz</strong>, kubkiem. Przerzucić może pozwolić tylko MG.
          </li>
          <li>
            Szkicu <strong>nie da się wyrzucić ani zacząć od nowa</strong> — zrobić to może tylko
            MG. Rolę, umiejętności, zakupy i Ścieżkę Życia zmieniasz dowolnie, a wylosowane Cechy
            zostają przy każdej zmianie.
          </li>
          <li>
            Gotową postać <strong>zatwierdza MG</strong>. Do tego czasu karta jest tylko do
            podglądu, a żeton nie stanie na mapie.
          </li>
        </ul>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <div className="creation-rules-actions">
          <button type="button" className="small-button" disabled={busy} onClick={close}>
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
  );
}
