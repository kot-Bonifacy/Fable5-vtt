import { useEffect, useState, type FormEvent } from 'react';
import type { AiAccessView } from '@vtt/shared';
import { aiAccessErrorText, aiAccessStatusText } from '@vtt/shared';
import { ApiError, apiDelete, apiPost } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';
import { useOwnerAiStore } from '../stores/ownerAiStore.js';

/**
 * „Poproś o dostęp do AI właściciela” w Panelu MG (etap 44d) — MG bez
 * własnego AI. Zgoda obejmuje wszystkie jego kampanie; stan prośby odświeża
 * push `ai-access:mine`, więc decyzja właściciela widać bez przeładowania.
 */
export function AiAccessRequest() {
  const mine = useOwnerAiStore((s) => s.mine);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useOwnerAiStore.getState().loadMine();
  }, []);

  async function request() {
    setBusy(true);
    setError(null);
    try {
      useOwnerAiStore.getState().setMine(await apiPost<AiAccessView>('/api/ai-access/request'));
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : '';
      setError(aiAccessErrorText(code) ?? 'Nie udało się wysłać prośby.');
    } finally {
      setBusy(false);
    }
  }

  const status = mine?.status ?? 'none';
  const canAsk = status === 'none' || status === 'rejected' || status === 'revoked';
  return (
    <section className="panel-card">
      <header className="panel-card-header">
        <h2>AI właściciela serwera</h2>
        {status === 'granted' && <span className="badge badge--ok">zgoda</span>}
        {status === 'requested' && <span className="badge badge--live">czeka</span>}
      </header>
      <p className="placeholder-text">{mine ? aiAccessStatusText(status) : 'Ładowanie…'}</p>
      {mine && canAsk && (
        <button
          type="button"
          className="small-button small-button--primary"
          onClick={() => void request()}
          disabled={busy}
          title="Boty, asystent zasad i baza wiedzy korzystają z AI na komputerze właściciela serwera. Zgoda obejmuje wszystkie Twoje kampanie; AI działa, gdy właściciel jest obecny i je udostępnia, a obsługuje jedną sesję naraz."
        >
          Poproś o dostęp do AI właściciela
        </button>
      )}
      {error && <p className="auth-error">{error}</p>}
    </section>
  );
}

/**
 * „To konto właściciela” w ustawieniach gracza (decyzja MG z 04.10): login
 * i hasło konta MG właściciela dają flagę temu kontu gracza — właściciel widzi
 * wtedy prośby o AI i jest „obecny”, grając u innego MG.
 */
export function OwnerLink() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.role !== 'PLAYER') return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/auth/owner-link', { login, password });
      setOpen(false);
      setLogin('');
      setPassword('');
      await useAuthStore.getState().initialize();
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : '';
      setError(
        failure instanceof ApiError && failure.status === 429
          ? 'Za dużo prób — spróbuj za kilkanaście minut.'
          : (aiAccessErrorText(code) ?? 'Nie udało się połączyć konta.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setError(null);
    try {
      await apiDelete('/api/auth/owner-link');
      useOwnerAiStore.getState().reset();
      await useAuthStore.getState().initialize();
    } catch {
      setError('Nie udało się odłączyć konta.');
    }
  }

  if (user.owner) {
    return (
      <>
        <p className="settings-note">To konto należy do właściciela serwera.</p>
        <button
          type="button"
          className="settings-action"
          onClick={() => void unlink()}
          title="Konto gracza przestaje widzieć prośby o AI i nie liczy się jako Twoja obecność."
        >
          Odłącz od właściciela
        </button>
        {error && <p className="auth-error">{error}</p>}
      </>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="settings-action"
        onClick={() => setOpen(true)}
        title="Tylko dla właściciela serwera, który gra u innego MG: login i hasło konta MG właściciela dają temu kontu panel AI właściciela."
      >
        To konto właściciela serwera
      </button>
    );
  }

  return (
    <form className="password-change" onSubmit={submit}>
      <label className="settings-row">
        <span className="settings-label">Login właściciela</span>
        <input
          type="text"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoFocus
        />
      </label>
      <label className="settings-row">
        <span className="settings-label">Hasło</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <div className="password-change-actions">
        <button
          type="submit"
          className="settings-action"
          disabled={busy || !login.trim() || !password}
        >
          {busy ? 'Sprawdzanie…' : 'Połącz'}
        </button>
        <button type="button" className="settings-action" onClick={() => setOpen(false)}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
