import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { JoinInfo } from '@vtt/shared';
import { ApiError, apiGet } from '../api.js';
import { enterPreferredFullscreen } from '../fullscreen.js';
import { useAuthStore } from '../stores/authStore.js';

type PageState = 'loading' | 'ready' | 'invalid' | 'used' | 'expired' | 'limited';

/** Odmowa serwera → stan ekranu. 410 mówi, że link był dobry, tylko już nie działa. */
function refusalState(err: unknown): PageState {
  if (err instanceof ApiError && err.status === 429) return 'limited';
  if (err instanceof ApiError && err.code === 'INVITATION_USED') return 'used';
  if (err instanceof ApiError && err.code === 'INVITATION_EXPIRED') return 'expired';
  return 'invalid';
}

/** Treść ekranów odmowy — tytuł, zdanie i podpowiedź. */
const REFUSALS: Record<Exclude<PageState, 'loading' | 'ready'>, [string, string, string]> = {
  invalid: [
    'Zaproszenie nieważne',
    'Link zaproszenia jest nieprawidłowy albo MG go unieważnił.',
    'Poproś MG o nowy link.',
  ],
  // Tylko wyścig dwóch pierwszych wejść naraz — od 24.10 użyty link działa dalej.
  used: [
    'Link właśnie użyty',
    'Ktoś wszedł tym linkiem w tej samej chwili.',
    'Otwórz link jeszcze raz — wpuści Cię na Twoje konto.',
  ],
  expired: [
    'Link wygasł',
    'MG wystawił ten link z ograniczoną ważnością.',
    'Poproś MG o nowy — wystawi go jednym kliknięciem.',
  ],
  limited: [
    'Chwila przerwy',
    'Za dużo nieudanych prób z tego adresu — spróbuj ponownie za kilkanaście minut.',
    '',
  ],
};

/**
 * Wejście gracza z imiennego linku (etap 44b). Link jest kluczem: MG wypisał
 * na nim imię, więc ekran niczego nie pyta — pokazuje, czyje miejsce otwiera,
 * i wpuszcza jednym przyciskiem. Wybieranie imienia z listy zniknęło razem
 * z możliwością wejścia na cudze konto samym imieniem.
 */
export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const joinCampaign = useAuthStore((s) => s.joinCampaign);

  const [pageState, setPageState] = useState<PageState>('loading');
  const [info, setInfo] = useState<JoinInfo | null>(null);
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
      .catch((err: unknown) => setPageState(refusalState(err)));
  }, [token]);

  async function join() {
    if (!token || busy) return;
    // Przed `await`, z tego samego powodu co na ekranie logowania: gestem jest
    // kliknięcie „Wejdź do gry", a odpowiedź serwera go nie niesie.
    enterPreferredFullscreen();
    setBusy(true);
    setError(null);
    try {
      await joinCampaign(token);
      navigate('/', { replace: true });
    } catch (err) {
      const state = refusalState(err);
      if (err instanceof ApiError && err.code === 'NAME_TAKEN') {
        setError('Przy tym stole jest już gracz o tym imieniu — poproś MG o nowy link.');
      } else if (
        err instanceof ApiError &&
        (err.status === 404 || err.status === 410 || err.status === 429)
      ) {
        setPageState(state);
      } else {
        setError('Nie udało się wejść. Spróbuj ponownie.');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void join();
  }

  if (pageState === 'loading') {
    return (
      <div className="auth-screen">
        <p className="placeholder-text">Sprawdzanie zaproszenia…</p>
      </div>
    );
  }

  if (pageState !== 'ready' || !info) {
    const [title, sentence, hint] = REFUSALS[pageState === 'ready' ? 'invalid' : pageState];
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
          <h1 className="auth-title">{title}</h1>
          <div className="auth-rule" aria-hidden="true" />
          <p className="auth-error">{sentence}</p>
          {hint && <p className="auth-hint">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="auth-eyebrow">VTT · Cyberpunk RED</p>
        <h1 className="auth-title">{info.renewal ? 'Wracasz do gry' : 'Dołączasz do gry'}</h1>
        <div className="auth-rule" aria-hidden="true" />
        <p className="auth-subtitle">
          Kampania: <strong>{info.campaignName}</strong>
        </p>
        <p className="auth-subtitle">
          Wchodzisz jako <strong className="join-player-name">{info.playerName}</strong>
        </p>
        <p className="auth-hint">
          {info.renewal
            ? 'Link wpuszcza na Twoje dotychczasowe konto — z postacią i czatem.'
            : 'Zachowaj ten link — wejdziesz nim na swoje konto z każdego komputera.'}
        </p>
        {error && <p className="auth-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy} autoFocus>
          {busy ? 'Wchodzenie…' : 'Wejdź do gry'}
        </button>
      </form>
    </div>
  );
}
