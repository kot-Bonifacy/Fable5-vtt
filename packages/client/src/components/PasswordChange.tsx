import { useState, type FormEvent } from 'react';
import { gmAccountErrorText, gmPasswordError } from '@vtt/shared';
import { apiPost } from '../api.js';
import { accountErrorText } from '../pages/LoginPage.js';

/**
 * Zmiana hasła MG w oknie ustawień (etap 44a). Zwinięta do jednego przycisku —
 * to rzecz robiona raz na długi czas, a okno ustawień ma zostać krótkie. Inne
 * sesje konta serwer wylogowuje, ta zostaje.
 */
export function PasswordChange() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setCurrent('');
    setPassword('');
    setRepeat('');
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (current.length === 0) {
      setError('Wpisz obecne hasło.');
      return;
    }
    const invalid = gmPasswordError(password, repeat, null);
    if (invalid) {
      setError(gmAccountErrorText(invalid));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/auth/password', { current, password, repeat });
      close();
      setDone(true);
    } catch (err) {
      setError(accountErrorText(err, 'Nie udało się zmienić hasła. Spróbuj ponownie.'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        <button
          type="button"
          className="settings-action"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
          title="Po zmianie inne zalogowane przeglądarki tego konta zostaną wylogowane."
        >
          Zmień hasło
        </button>
        {done && <p className="settings-note">Hasło zmienione.</p>}
      </>
    );
  }

  return (
    <form className="password-change" onSubmit={handleSubmit}>
      <label className="settings-row">
        <span className="settings-label">Obecne hasło</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus
        />
      </label>
      <label className="settings-row" title="Co najmniej 10 znaków, inne niż login.">
        <span className="settings-label">Nowe hasło</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="settings-row">
        <span className="settings-label">Powtórz nowe</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <div className="password-change-actions">
        <button type="submit" className="settings-action" disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Zapisz hasło'}
        </button>
        <button type="button" className="settings-action" onClick={close}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
