import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { JoinInfo } from '@vtt/shared';
import { ApiError, apiGet } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';

type PageState = 'loading' | 'ready' | 'invalid';

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const joinCampaign = useAuthStore((s) => s.joinCampaign);

  const [pageState, setPageState] = useState<PageState>('loading');
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [name, setName] = useState('');
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
    const trimmed = name.trim();
    if (trimmed.length > 0) void join(trimmed);
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
          <h1 className="auth-title">VTT — Cyberpunk RED</h1>
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
        <h1 className="auth-title">VTT — Cyberpunk RED</h1>
        <p className="auth-subtitle">
          Dołączasz do kampanii: <strong>{info.campaignName}</strong>
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy || name.trim().length === 0}>
          {busy ? 'Dołączanie…' : 'Dołącz do gry'}
        </button>
      </form>
    </div>
  );
}
