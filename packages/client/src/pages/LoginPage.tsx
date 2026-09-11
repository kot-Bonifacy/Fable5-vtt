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
        {/* Plakat krzyczy „Cyberpunk RED" wielkim logiem w lewym rogu, więc tytuł
            formularza mówi, co się tu robi, a nazwa systemu schodzi do plakietki
            nad nim. Kreska z krzyżykiem to cytat z samego plakatu. */}
        <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
        <h1 className="auth-title">Logowanie Mistrza Gry</h1>
        <div className="auth-rule" aria-hidden="true" />
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
        <button className="primary-button" type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Logowanie…' : 'Zaloguj się'}
        </button>
        <p className="auth-hint">Jesteś graczem? Poproś MG o link zaproszenia.</p>
      </form>
    </div>
  );
}
