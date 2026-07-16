import { useState, type FormEvent } from 'react';
import { ApiError } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';

export function LoginPage() {
  const loginGm = useAuthStore((s) => s.loginGm);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginGm(password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Nieprawidłowe hasło.'
          : 'Błąd logowania. Spróbuj ponownie.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">VTT — Cyberpunk RED</h1>
        <p className="auth-subtitle">Logowanie Mistrza Gry</p>
        <label className="auth-label" htmlFor="gm-password">
          Hasło
        </label>
        <input
          id="gm-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Logowanie…' : 'Zaloguj się'}
        </button>
        <p className="auth-hint">Jesteś graczem? Poproś MG o link zaproszenia.</p>
      </form>
    </div>
  );
}
