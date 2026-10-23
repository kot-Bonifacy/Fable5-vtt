import { useEffect, useRef, useState } from 'react';
import { youtubeVideoId, type MusicImportStatus } from '@vtt/shared';
import { ApiError, apiGet, apiPost } from '../api.js';

const ERRORS: Record<string, string> = {
  INVALID_URL: 'Wklej link do pojedynczego filmu YouTube.',
  IMPORT_BUSY: 'Inny import jeszcze trwa. Spróbuj po jego zakończeniu.',
  IMPORT_TOOLS_MISSING:
    'Na serwerze brakuje narzędzi importu audio. Instrukcja instalacji: tools/audio/README.md.',
  VIDEO_UNAVAILABLE:
    'Nie udało się pobrać dźwięku. Film może być niedostępny, wymagać logowania lub YouTube blokuje pobieranie. Spróbuj innego linku albo wgraj plik.',
  LIVE_NOT_SUPPORTED: 'Transmisja na żywo nie ma końca. Wybierz zakończone nagranie.',
  VIDEO_TOO_LONG: 'Wybierz nagranie trwające najwyżej 2 godziny.',
  FILE_TOO_LARGE: 'Dźwięk przekracza limit importu 128 MB. Wybierz krótsze nagranie.',
  IMPORT_TIMEOUT: 'Import trwał zbyt długo i został przerwany. Spróbuj ponownie.',
  NO_CAMPAIGN: 'Kampania nie jest już aktywna.',
};
export function YouTubeAudioImport({ campaignId, ready }: { campaignId: string; ready: boolean }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<MusicImportStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const path = `/api/music/${encodeURIComponent(campaignId)}/youtube`;
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await apiGet<MusicImportStatus>(path);
        if (!disposed) {
          setStatus(result);
          setConnectionError(false);
        }
      } catch {
        if (!disposed) setConnectionError(true);
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [path]);
  const active = status?.phase === 'downloading' || status?.phase === 'converting';
  const phase = status?.phase;
  const box = useRef<HTMLDivElement>(null);
  // Biblioteka leży na dole zakładki „Dźwięki”: każda zmiana etapu importu
  // (start, konwersja, wynik) wysuwa jego kartę w widok okna.
  useEffect(() => {
    if (phase && phase !== 'idle')
      box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [phase]);
  async function start() {
    setPending(true);
    setError(null);
    try {
      setStatus(await apiPost<MusicImportStatus>(path, { url, name }));
      setUrl('');
      setName('');
    } catch (error) {
      setError(
        error instanceof ApiError
          ? (ERRORS[error.code] ?? 'Nie udało się uruchomić importu.')
          : 'Brak połączenia z serwerem.',
      );
    } finally {
      setPending(false);
    }
  }
  async function cancel() {
    setPending(true);
    try {
      await apiPost(`${path}/cancel`);
    } catch {
      setError('Nie udało się anulować importu. Sprawdź połączenie.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="music-import" ref={box}>
      <h4
        className="music-import-title"
        title="Pobiera sam dźwięk (do 2 godzin i 128 MB) i zapisuje go jako MP3 w bibliotece kampanii — później gra bez filmu."
      >
        Dźwięk z YouTube
      </h4>
      {active ? (
        <div className="music-import-job" role="status">
          <div className="music-import-job-head">
            <span className="music-import-job-name" title={status.name}>
              {status.name || 'Nagranie z YouTube'}
            </span>
            <span className="music-import-job-phase">
              {status.phase === 'converting'
                ? `2/2 · Konwersja do MP3 ${status.progress}%`
                : `1/2 · Pobieranie ${status.progress}%`}
            </span>
          </div>
          {/* Konwersja zaczyna od zera; zanim FFmpeg poda pierwszy postęp, pasek tylko pulsuje. */}
          <progress
            max={100}
            value={status.phase === 'converting' && !status.progress ? undefined : status.progress}
            aria-label="Postęp importu dźwięku"
          />
          <div className="music-import-job-foot">
            <span className="settings-note">Możesz zamknąć okno — import trwa dalej.</span>
            <button type="button" disabled={pending} onClick={() => void cancel()}>
              Anuluj import
            </button>
          </div>
        </div>
      ) : (
        <form
          className="music-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !pending && youtubeVideoId(url)) void start();
          }}
        >
          <div className="music-import-row">
            <input
              type="url"
              placeholder="Link do filmu YouTube"
              aria-label="Link do filmu YouTube"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!ready || pending}
            />
            <button type="submit" disabled={!ready || pending || !youtubeVideoId(url)}>
              Pobierz
            </button>
          </div>
          <input
            type="text"
            maxLength={120}
            placeholder="Nazwa podkładu (pusta = tytuł filmu)"
            aria-label="Nazwa podkładu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!ready || pending}
          />
          {url && !youtubeVideoId(url) && (
            <p className="music-import-hint" role="status">
              Wklej link do pojedynczego filmu YouTube.
            </p>
          )}
        </form>
      )}
      {status?.phase === 'complete' && (
        <p className="music-import-done" role="status">
          Dodano „{status.name}” do biblioteki poniżej.
        </p>
      )}
      {status?.phase === 'cancelled' && <p role="status">Import anulowany.</p>}
      {connectionError && <p role="alert">Nie można sprawdzić importu. Sprawdź połączenie.</p>}
      {(error || status?.phase === 'error') && (
        <p className="music-import-error" role="alert">
          {error ||
            ERRORS[status?.error ?? ''] ||
            'Nie udało się zaimportować dźwięku. Spróbuj ponownie.'}
        </p>
      )}
    </div>
  );
}
