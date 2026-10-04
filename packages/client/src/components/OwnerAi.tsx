import { useEffect, useState } from 'react';
import type { AiAccessDecision, OwnerAiRequest, OwnerAiState } from '@vtt/shared';
import { aiAccessErrorText } from '@vtt/shared';
import { ApiError, apiPost } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';
import { useOwnerAiStore } from '../stores/ownerAiStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * AI właściciela (etap 44d) — panel konta z flagą właściciela.
 *
 * Ten sam panel stoi w Panelu MG (konto MG właściciela) i w pływającym oknie
 * ze znaczka w górnym pasku (każde konto z flagą, także konto gracza w cudzej
 * kampanii). Prośby, „Udostępniam AI”, kto trzyma AI i „Przejmij AI”.
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

function errorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : '';
  return aiAccessErrorText(code) ?? 'Nie udało się — spróbuj jeszcze raz.';
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
      useOwnerAiStore
        .getState()
        .setState(
          await apiPost<OwnerAiState>(`/api/owner/ai/requests/${request.userId}`, { decision }),
        );
    } catch (error) {
      onError(errorText(error));
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
      setError(errorText(failure));
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
        title="Bez tego MG z Twoją zgodą nie dostaną AI. Wyłącza się samo 2 min po zamknięciu Twojej ostatniej karty i po restarcie serwera. Twoje kampanie mają AI zawsze."
      >
        <input
          type="checkbox"
          checked={state.sharing}
          onChange={(event) => {
            // Od razu w oknie — odpowiedź serwera i tak przyjdzie za chwilę.
            const on = event.target.checked;
            useOwnerAiStore.getState().setState({ ...state, sharing: on });
            void post('/api/owner/ai/sharing', { on });
          }}
        />
        <span className="settings-label">Udostępniam AI</span>
      </label>

      <p className="owner-ai-lease">
        {lease ? (
          <>
            AI trzyma sesja <strong>„{lease.campaignName}”</strong>
            {lease.own ? ' (Twoja).' : ` MG „${lease.gmLogin}”.`}
          </>
        ) : (
          'Żadna sesja nie trzyma teraz AI.'
        )}
        {state.canTakeOver && (
          <button
            type="button"
            className="small-button small-button--primary"
            onClick={() => void post('/api/owner/ai/take')}
            title="AI przechodzi do Twojej sesji. Tamten stół gra dalej bez botów, a jego zgoda zostaje — dostanie AI z powrotem po końcu Twojej sesji."
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

/** Znaczek „AI” w górnym pasku kont z flagą właściciela, z licznikiem czekających próśb. */
export function OwnerAiButton() {
  const owner = useAuthStore((s) => s.user?.owner === true);
  const open = useOwnerAiStore((s) => s.open);
  const pending = useOwnerAiStore((s) => s.state?.pending ?? 0);

  useEffect(() => {
    if (owner) void useOwnerAiStore.getState().load();
  }, [owner]);

  if (!owner) return null;
  const label =
    pending > 0
      ? `AI właściciela — czeka próśb: ${pending}`
      : 'AI właściciela: prośby i udostępnianie';
  return (
    <button
      type="button"
      className={`small-button owner-ai-button${open ? ' small-button--on' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={() => useOwnerAiStore.getState().setOpen(!open)}
    >
      AI
      {pending > 0 && <span className="badge badge--live owner-ai-count">{pending}</span>}
    </button>
  );
}

/** Pływające okno „AI właściciela” — z tej samej rodziny co ustawienia i zegar. */
export function OwnerAiWindow() {
  const open = useOwnerAiStore((s) => s.open);
  const owner = useAuthStore((s) => s.user?.owner === true);
  const placement = useWindowPlacement('owner-ai', () => ({
    x: Math.max(12, window.innerWidth - 460),
    y: 64,
  }));

  if (!open || !owner) return null;
  return (
    <section
      ref={placement.ref}
      className="settings-window owner-ai-window"
      style={placement.style}
      aria-label="AI właściciela"
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <span className="settings-window-title">AI właściciela</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => useOwnerAiStore.getState().setOpen(false)}
          title="Zamknij AI właściciela"
          aria-label="Zamknij AI właściciela"
        >
          ✕
        </button>
      </div>
      <div className="settings-window-body">
        <OwnerAiPanel />
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
