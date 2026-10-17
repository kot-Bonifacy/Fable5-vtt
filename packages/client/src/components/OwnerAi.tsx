import { useEffect, useState } from 'react';
import type { AiAccessDecision, OwnerAiRequest, OwnerAiState } from '@vtt/shared';
import { aiAccessErrorText } from '@vtt/shared';
import { ApiError, apiPost } from '../api.js';
import { useOwnerAiStore } from '../stores/ownerAiStore.js';

/**
 * AI właściciela (etap 44d) — panel w panelu administratora (etap 53; do 53
 * w Panelu MG właściciela i w oknie ze znaczka „AI” w górnym pasku). Prośby,
 * „Udostępniam AI”, kto trzyma AI i „Przejmij AI”.
 */

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<OwnerAiRequest['status'], string> = {
  requested: 'czeka',
  granted: 'zgoda',
  rejected: 'odrzucona',
  revoked: 'cofnięta',
};

export function aiDecisionErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : '';
  return aiAccessErrorText(code) ?? 'Nie udało się — spróbuj jeszcze raz.';
}

/** Decyzja administratora o AI dla konta MG — z prośby albo z listy kont. */
export async function decideAi(userId: string, decision: AiAccessDecision): Promise<void> {
  useOwnerAiStore
    .getState()
    .setState(await apiPost<OwnerAiState>(`/api/admin/ai/requests/${userId}`, { decision }));
}

function RequestRow({
  request,
  onError,
}: {
  request: OwnerAiRequest;
  onError: (text: string | null) => void;
}) {
  async function decide(decision: AiAccessDecision) {
    onError(null);
    try {
      await decideAi(request.userId, decision);
    } catch (error) {
      onError(aiDecisionErrorText(error));
    }
  }

  return (
    <li className="owner-account">
      <div className="owner-account-main">
        <strong className="owner-account-login">{request.login}</strong>
        <span
          className={`badge ${request.status === 'granted' ? 'badge--ok' : request.status === 'requested' ? 'badge--live' : 'badge--off'}`}
        >
          {STATUS_LABEL[request.status]}
        </span>
        <span className="invite-expiry">
          prośba {when(request.requestedAt)}
          {request.decidedAt ? ` · decyzja ${when(request.decidedAt)}` : ''}
        </span>
        <span className="owner-account-actions">
          {request.status !== 'granted' && (
            <button
              type="button"
              className="small-button small-button--primary"
              onClick={() => void decide('grant')}
              title="Zgoda obejmuje wszystkie kampanie tego MG, także przyszłe. Boty działają u niego tylko wtedy, gdy jesteś obecny i udostępniasz AI."
            >
              Zatwierdź
            </button>
          )}
          {request.status === 'requested' && (
            <button type="button" className="small-button" onClick={() => void decide('reject')}>
              Odrzuć
            </button>
          )}
          {request.status === 'granted' && (
            <button
              type="button"
              className="small-button small-button--danger"
              onClick={() => void decide('revoke')}
              title="Boty tego MG gasną od razu, także w trakcie jego sesji."
            >
              Cofnij
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

export function OwnerAiPanel() {
  const state = useOwnerAiStore((s) => s.state);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useOwnerAiStore.getState().load();
  }, []);

  async function post(url: string, body?: unknown) {
    setError(null);
    try {
      useOwnerAiStore.getState().setState(await apiPost<OwnerAiState>(url, body));
    } catch (failure) {
      setError(aiDecisionErrorText(failure));
      // Przełącznik mógł się już przestawić w oknie — wraca do stanu serwera.
      void useOwnerAiStore.getState().load();
    }
  }

  if (!state) return <p className="placeholder-text">Ładowanie…</p>;

  const lease = state.lease;
  return (
    <div className="owner-ai">
      <label
        className="settings-row owner-ai-sharing"
        title="Bez tego MG ze zgodą nie dostaną AI. Wyłącza się samo 2 min po zamknięciu ostatniej karty Twoich kont (ten panel, konto MG właściciela) i po restarcie serwera. Kampanie konta MG właściciela mają AI zawsze."
      >
        <input
          type="checkbox"
          checked={state.sharing}
          onChange={(event) => {
            // Od razu w oknie — odpowiedź serwera i tak przyjdzie za chwilę.
            const on = event.target.checked;
            useOwnerAiStore.getState().setState({ ...state, sharing: on });
            void post('/api/admin/ai/sharing', { on });
          }}
        />
        <span className="settings-label">Udostępniam AI</span>
      </label>

      <p className="owner-ai-lease">
        {lease ? (
          <>
            AI trzyma sesja <strong>„{lease.campaignName}”</strong>
            {lease.own ? ' (konto MG właściciela).' : ` MG „${lease.gmLogin}”.`}
          </>
        ) : (
          'Żadna sesja nie trzyma teraz AI.'
        )}
        {state.canTakeOver && (
          <button
            type="button"
            className="small-button small-button--primary"
            onClick={() => void post('/api/admin/ai/take')}
            title="AI przechodzi do sesji konta MG właściciela. Tamten stół gra dalej bez botów, a jego zgoda zostaje — dostanie AI z powrotem po końcu sesji właściciela."
          >
            Przejmij AI
          </button>
        )}
      </p>

      {error && <p className="auth-error">{error}</p>}

      {state.requests.length === 0 ? (
        <p className="placeholder-text">Nikt nie prosił o dostęp do AI.</p>
      ) : (
        <ul className="owner-account-list">
          {state.requests.map((request) => (
            <RequestRow key={request.userId} request={request} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}
