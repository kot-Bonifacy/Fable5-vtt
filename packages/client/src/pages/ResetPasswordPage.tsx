import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PasswordResetInfo } from '@vtt/shared';
import { gmAccountErrorText, gmPasswordError } from '@vtt/shared';
import { ApiError, apiGet } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';
import { accountErrorText } from './LoginPage.js';

type PageState = 'loading' | 'ready' | 'invalid' | 'limited';

/**
 * Ustawienie hasła z linku od właściciela serwera (etap 44a). Link działa raz
 * i dobę; po zapisie ta przeglądarka jest od razu zalogowana, a każda inna
 * sesja konta — wylogowana.
 */
export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }
    apiGet<PasswordResetInfo>(`/api/auth/reset/${encodeURIComponent(token)}`)
      .then((info) => {
        setLogin(info.login);
        setPageState('ready');
      })
      .catch((err: unknown) =>
        setPageState(err instanceof ApiError && err.status === 429 ? 'limited' : 'invalid'),
      );
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || busy) return;
    const invalid = gmPasswordError(password, repeat, login);
    if (invalid) {
      setError(gmAccountErrorText(invalid));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password, repeat);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_RESET') setPageState('invalid');
      else setError(accountErrorText(err, 'Nie udało się ustawić hasła. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  }

  if (pageState === 'loading') {
    return (
      <div className="auth-screen">
        <p className="placeholder-text">Sprawdzanie linku…</p>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      {pageState === 'ready' ? (
        <form className="auth-card auth-card--compact" onSubmit={handleSubmit}>
          <h1 className="auth-title">Nowe hasło</h1>
          <div className="auth-rule" aria-hidden="true" />
          <p className="auth-label">
            Konto MG: <strong>{login}</strong>
          </p>
          {/* Ukryte pole loginu: menedżer haseł zapisze nowe hasło przy właściwym koncie. */}
          <input type="text" autoComplete="username" value={login} readOnly hidden />
          <label className="auth-label" htmlFor="reset-password">
            Hasło
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            title="Co najmniej 10 znaków, inne niż login."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <label className="auth-label" htmlFor="reset-repeat">
            Powtórz hasło
          </label>
          <input
            id="reset-repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Ustaw hasło i wejdź'}
          </button>
        </form>
      ) : (
        <div className="auth-card">
          <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
          <h1 className="auth-title">Link nieważny</h1>
          <div className="auth-rule" aria-hidden="true" />
          <p className="auth-error">
            {pageState === 'limited'
              ? gmAccountErrorText('TOO_MANY_ATTEMPTS')
              : gmAccountErrorText('INVALID_RESET')}
          </p>
          <button type="button" className="auth-switch" onClick={() => navigate('/')}>
            Przejdź do logowania
          </button>
        </div>
      )}
    </div>
  );
}
