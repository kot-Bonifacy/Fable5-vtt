import { useState, type FormEvent } from 'react';
import type { SessionUser } from '@vtt/shared';
import { gmAccountErrorText, gmPasswordError } from '@vtt/shared';
import { apiPost } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';
import { accountErrorText } from './LoginPage.js';

/**
 * Hasło tymczasowe (etap 53): konto administratora przy pierwszym wejściu
 * i MG, któremu administrator ustawił hasło. Serwer do tej chwili nie odpowie
 * niczym poza zmianą hasła, więc ta strona stoi zamiast stołu i panelu.
 */
export function SetPasswordPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const login = user?.login ?? user?.name ?? '';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (current.length === 0) {
      setError('Wpisz obecne, tymczasowe hasło.');
      return;
    }
    const invalid = gmPasswordError(password, repeat, login);
    if (invalid) {
      setError(gmAccountErrorText(invalid));
      return;
    }
    if (password === current) {
      setError(gmAccountErrorText('PASSWORD_UNCHANGED'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await apiPost<{ user: SessionUser }>('/api/auth/password', {
        current,
        password,
        repeat,
      });
      useAuthStore.getState().adoptUser(updated);
    } catch (err) {
      setError(accountErrorText(err, 'Nie udało się zmienić hasła. Spróbuj ponownie.'));
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card auth-card--compact" onSubmit={handleSubmit}>
        <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
        <h1 className="auth-title">Ustaw własne hasło</h1>
        <div className="auth-rule" aria-hidden="true" />
        <p className="auth-label">
          Konto: <strong>{login}</strong> — obecne hasło jest tymczasowe.
        </p>
        <input type="text" autoComplete="username" value={login} readOnly hidden />
        <label className="auth-label" htmlFor="set-current">
          Hasło tymczasowe
        </label>
        <input
          id="set-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus
        />
        <label className="auth-label" htmlFor="set-password">
          Nowe hasło
        </label>
        <input
          id="set-password"
          type="password"
          autoComplete="new-password"
          title="Co najmniej 10 znaków, inne niż login i niż hasło tymczasowe."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="auth-label" htmlFor="set-repeat">
          Powtórz nowe hasło
        </label>
        <input
          id="set-repeat"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        {error && <p className="auth-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Ustaw hasło i wejdź'}
        </button>
        <button type="button" className="auth-switch" onClick={() => void logout()}>
          Wyloguj
        </button>
      </form>
    </div>
  );
}
