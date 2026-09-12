import { useState, type FormEvent } from 'react';
import { ApiError } from '../api.js';
import { useAutofillableField } from '../autofill-field.js';
import { useAuthStore } from '../stores/authStore.js';

export function LoginPage() {
  const loginGm = useAuthStore((s) => s.loginGm);
  const password = useAutofillableField();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Hasło podstawione przez menedżera haseł siedzi w polu, nie w stanie —
    // czytamy je stąd, bo inaczej wysłalibyśmy pustkę przy pełnym polu.
    const secret = password.read();
    if (secret.length === 0) {
      setError('Wpisz hasło.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginGm(secret);
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
          ref={password.ref}
          value={password.value}
          onChange={(e) => password.setValue(e.target.value)}
          autoFocus
        />
        {error && <p className="auth-error">{error}</p>}
        {/* Bez warunku o długości: autofill nie wysyła zdarzenia, więc przycisk
            pytający o stan zostawał martwy przy pełnym polu. Pustkę odbija
            `handleSubmit` zdaniem, które widać. */}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Logowanie…' : 'Zaloguj się'}
        </button>
        <p className="auth-hint">Jesteś graczem? Poproś MG o link zaproszenia.</p>
      </form>
    </div>
  );
}
