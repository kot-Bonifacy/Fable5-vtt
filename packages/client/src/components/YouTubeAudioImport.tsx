import { useEffect, useState } from 'react';
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
    <form
      className="music-youtube"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !active && !pending && youtubeVideoId(url)) void start();
      }}
    >
      <label>
        Importuj sam dźwięk z YouTube
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!ready || active || pending}
        />
      </label>
      <label>
        Nazwa podkładu (opcjonalnie)
        <input
          type="text"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!ready || active || pending}
        />
      </label>
      <p className="settings-note">
        Do 2 godzin i 128 MB. Zapis do MP3 w bibliotece kampanii; późniejsze odtwarzanie bez filmu.
        Możesz zamknąć to okno podczas importu.
      </p>
      {url && !youtubeVideoId(url) && (
        <p role="status">Wklej link do pojedynczego filmu YouTube.</p>
      )}
      <button type="submit" disabled={!ready || active || pending || !youtubeVideoId(url)}>
        Pobierz dźwięk do biblioteki
      </button>
      {active && (
        <div role="status">
          <p>
            {status.phase === 'converting'
              ? 'Konwersja do MP3…'
              : `Pobieranie dźwięku… ${status.progress}%`}
          </p>
          <progress
            max={100}
            value={status.phase === 'converting' ? undefined : status.progress}
            aria-label="Postęp importu dźwięku"
          />
          <button type="button" disabled={pending} onClick={() => void cancel()}>
            Anuluj import
          </button>
        </div>
      )}
      {status?.phase === 'complete' && (
        <p role="status">Dodano: {status.name}. Wybierz „Odtwórz” w bibliotece.</p>
      )}
      {status?.phase === 'cancelled' && <p role="status">Import anulowany.</p>}
      {connectionError && <p role="alert">Nie można sprawdzić importu. Sprawdź połączenie.</p>}
      {(error || status?.phase === 'error') && (
        <p role="alert">
          {error ||
            ERRORS[status?.error ?? ''] ||
            'Nie udało się zaimportować dźwięku. Spróbuj ponownie.'}
        </p>
      )}
    </form>
  );
}
