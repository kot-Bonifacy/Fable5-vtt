import { useEffect, useState, type FormEvent } from 'react';
import type { AuthConfig } from '@vtt/shared';
import { gmAccountErrorText, gmLoginError, gmPasswordError } from '@vtt/shared';
import { ApiError, apiGet } from '../api.js';
import { useAutofillableField } from '../autofill-field.js';
import { enterPreferredFullscreen } from '../fullscreen.js';
import { useAuthStore } from '../stores/authStore.js';

/** Zdanie dla odmowy z tras kont — kod znany albo ogólnik, nigdy surowy kod. */
export function accountErrorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return gmAccountErrorText(err.code) ?? fallback;
  return fallback;
}

type Mode = 'login' | 'register';

export function LoginPage() {
  const endedNote = useAuthStore((s) => s.endedNote);
  const [mode, setMode] = useState<Mode>('login');
  // Odnośnik do rejestracji pokazujemy dopiero, gdy serwer powie, że jest
  // otwarta (`VTT_REGISTRATION`) — wyłączona nie ma zostawiać martwej drogi.
  const [registration, setRegistration] = useState(false);

  useEffect(() => {
    apiGet<AuthConfig>('/api/auth/config')
      .then((config) => setRegistration(config.registration))
      .catch(() => setRegistration(false));
  }, []);

  return (
    <div className="auth-screen">
      {mode === 'register' && registration ? (
        <RegisterForm onBack={() => setMode('login')} />
      ) : (
        <LoginForm
          endedNote={endedNote}
          onRegister={registration ? () => setMode('register') : null}
        />
      )}
    </div>
  );
}

function LoginForm({
  endedNote,
  onRegister,
}: {
  endedNote: string | null;
  onRegister: (() => void) | null;
}) {
  const loginGm = useAuthStore((s) => s.loginGm);
  const login = useAutofillableField();
  const password = useAutofillableField();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Login i hasło podstawione przez menedżera haseł siedzą w polu, nie
    // w stanie — czytamy je stąd, bo inaczej wysłalibyśmy pustkę przy pełnym polu.
    const name = login.read().trim();
    const secret = password.read();
    if (name.length === 0 || secret.length === 0) {
      setError(name.length === 0 ? 'Wpisz login.' : 'Wpisz hasło.');
      return;
    }
    // Pełny ekran wchodzi TU, przed `await`: przeglądarka wpuszcza w niego
    // wyłącznie w odpowiedzi na gest, a Firefox potrafi uznać gest za stary,
    // zanim serwer odpowie. Złe hasło zostawia więc na pełnym ekranie ekran
    // logowania — to cena za pewne wejście po dobrym.
    enterPreferredFullscreen();
    setBusy(true);
    setError(null);
    try {
      await loginGm(name, secret);
    } catch (err) {
      setError(accountErrorText(err, 'Błąd logowania. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      {/* Plakat krzyczy „Cyberpunk RED" wielkim logiem w lewym rogu, więc tytuł
          formularza mówi, co się tu robi, a nazwa systemu schodzi do plakietki
          nad nim. Kreska z krzyżykiem to cytat z samego plakatu. */}
      <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
      <h1 className="auth-title">Logowanie Mistrza Gry</h1>
      <div className="auth-rule" aria-hidden="true" />
      {endedNote && (
        <p className="auth-hint" role="status">
          {endedNote}
        </p>
      )}
      <label className="auth-label" htmlFor="gm-login">
        Login
      </label>
      <input
        id="gm-login"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        ref={login.ref}
        value={login.value}
        onChange={(e) => login.setValue(e.target.value)}
        autoFocus
      />
      <label className="auth-label" htmlFor="gm-password">
        Hasło
      </label>
      <input
        id="gm-password"
        type="password"
        autoComplete="current-password"
        ref={password.ref}
        value={password.value}
        onChange={(e) => password.setValue(e.target.value)}
      />
      {error && <p className="auth-error">{error}</p>}
      {/* Bez warunku o długości: autofill nie wysyła zdarzenia, więc przycisk
          pytający o stan zostawał martwy przy pełnym polu. Pustkę odbija
          `handleSubmit` zdaniem, które widać. */}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? 'Logowanie…' : 'Zaloguj się'}
      </button>
      {onRegister && (
        <button type="button" className="auth-switch" onClick={onRegister}>
          Załóż konto MG
        </button>
      )}
      <p className="auth-hint">Jesteś graczem? Poproś MG o link zaproszenia.</p>
    </form>
  );
}

function RegisterForm({ onBack }: { onBack: () => void }) {
  const registerGm = useAuthStore((s) => s.registerGm);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Te same reguły co na serwerze (`shared/src/auth.ts`) — odmowa przed
    // wysłaniem, zdaniem, które mówi, czego brakuje.
    const invalid = gmLoginError(login) ?? gmPasswordError(password, repeat, login);
    if (invalid) {
      setError(gmAccountErrorText(invalid));
      return;
    }
    enterPreferredFullscreen();
    setBusy(true);
    setError(null);
    try {
      await registerGm(login, password, repeat);
    } catch (err) {
      setError(accountErrorText(err, 'Nie udało się założyć konta. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card auth-card--compact" onSubmit={handleSubmit}>
      <h1 className="auth-title">Nowe konto Mistrza Gry</h1>
      <div className="auth-rule" aria-hidden="true" />
      <label className="auth-label" htmlFor="register-login">
        Login
      </label>
      <input
        id="register-login"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
        title="3–32 znaki: litery bez polskich znaków, cyfry, „-”, „_” lub „.”. Gracze go nie widzą — przy stole jesteś „MG”."
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        autoFocus
      />
      <label className="auth-label" htmlFor="register-password">
        Hasło
      </label>
      <input
        id="register-password"
        type="password"
        autoComplete="new-password"
        title="Co najmniej 10 znaków, inne niż login."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="auth-label" htmlFor="register-repeat">
        Powtórz hasło
      </label>
      <input
        id="register-repeat"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
      />
      {error && <p className="auth-error">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? 'Zakładanie…' : 'Załóż konto'}
      </button>
      <button type="button" className="auth-switch" onClick={onBack}>
        Mam już konto — zaloguj się
      </button>
    </form>
  );
}
