import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { JoinInfo } from '@vtt/shared';
import { ApiError, apiGet } from '../api.js';
import { useAutofillableField } from '../autofill-field.js';
import { useAuthStore } from '../stores/authStore.js';

type PageState = 'loading' | 'ready' | 'invalid';

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const joinCampaign = useAuthStore((s) => s.joinCampaign);

  const [pageState, setPageState] = useState<PageState>('loading');
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const name = useAutofillableField();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }
    apiGet<JoinInfo>(`/api/join/${encodeURIComponent(token)}`)
      .then((joinInfo) => {
        setInfo(joinInfo);
        setPageState('ready');
      })
      .catch(() => setPageState('invalid'));
  }, [token]);

  async function join(chosenName: string) {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await joinCampaign(token, chosenName);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NAME_TAKEN') {
        setError('To imię jest zajęte — wybierz inne.');
      } else if (err instanceof ApiError && err.status === 404) {
        setPageState('invalid');
      } else {
        setError('Nie udało się dołączyć. Spróbuj ponownie.');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // To samo co na ekranie logowania: imię podstawione przez przeglądarkę
    // stoi w polu, a nie w stanie Reacta.
    const trimmed = name.read().trim();
    if (trimmed.length === 0) {
      setError('Wpisz imię.');
      return;
    }
    void join(trimmed);
  }

  if (pageState === 'loading') {
    return (
      <div className="auth-screen">
        <p className="placeholder-text">Sprawdzanie zaproszenia…</p>
      </div>
    );
  }

  if (pageState === 'invalid' || !info) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
          <h1 className="auth-title">Zaproszenie nieważne</h1>
          <div className="auth-rule" aria-hidden="true" />
          <p className="auth-error">
            Link zaproszenia jest nieprawidłowy, wygasł lub został unieważniony.
          </p>
          <p className="auth-hint">Poproś MG o nowy link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
        <h1 className="auth-title">Dołączasz do gry</h1>
        <div className="auth-rule" aria-hidden="true" />
        <p className="auth-subtitle">
          Kampania: <strong>{info.campaignName}</strong>
        </p>

        {info.players.length > 0 && (
          <>
            <p className="auth-label">Wracasz do gry? Wybierz swoje imię:</p>
            <div className="player-choices">
              {info.players.map((playerName) => (
                <button
                  key={playerName}
                  type="button"
                  className="player-chip"
                  disabled={busy}
                  onClick={() => void join(playerName)}
                >
                  {playerName}
                </button>
              ))}
            </div>
            <p className="auth-label">…albo dołącz jako nowa osoba:</p>
          </>
        )}

        <label className="auth-label" htmlFor="player-name">
          Twoje imię
        </label>
        <input
          id="player-name"
          type="text"
          maxLength={32}
          ref={name.ref}
          value={name.value}
          onChange={(e) => name.setValue(e.target.value)}
          autoFocus
        />
        {error && <p className="auth-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Dołączanie…' : 'Dołącz do gry'}
        </button>
      </form>
    </div>
  );
}
