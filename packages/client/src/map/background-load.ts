/**
 * Wczytywanie mapy sceny na słabym łączu (20.10, zlecenie MG).
 *
 * Gracz z kilkoma Mb/s czekał na pełny plik kilka–kilkanaście sekund przed
 * czarnym polem. Teraz najpierw przychodzi podgląd (`mapPreviewUrl`, kilkadziesiąt
 * kB), a pełny plik dochodzi pod nim z licznikiem bajtów.
 */

/** Stan wczytywania tła, który stół pokazuje nad mapą; null — nic się nie wczytuje. */
export interface BackgroundLoad {
  /** Podgląd już stoi na mapie, więc plakat zasłaniający czerń jest zbędny. */
  preview: boolean;
  loaded: number;
  /** Null, gdy serwer nie podał wagi pliku. */
  total: number | null;
}

/**
 * Pobiera plik, licząc bajty, żeby rozgrzać pamięć podręczną przeglądarki;
 * teksturę i tak robi potem `Assets.load` Pixi z tego samego adresu (dostaje
 * plik z pamięci po krótkim 304), więc dekodowanie zostaje takie jak dotąd.
 * Błąd sieci tu nie jest błędem mapy — `Assets.load` spróbuje sam.
 */
export async function fetchWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<void> {
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok || !response.body) return;
  const length = Number(response.headers.get('content-length'));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  const reader = response.body.getReader();
  let loaded = 0;
  onProgress(loaded, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');

/** „1,2 / 3,8 MB", a bez znanej wagi — „1,2 MB"; przed pierwszym bajtem — nic. */
export function backgroundLoadText(load: BackgroundLoad): string | null {
  if (load.loaded === 0) return null;
  if (load.total === null) return `${mb(load.loaded)} MB`;
  return `${mb(Math.min(load.loaded, load.total))} / ${mb(load.total)} MB`;
}

/** Ułamek 0–1 do paska, null bez znanej wagi pliku. */
export function backgroundLoadFraction(load: BackgroundLoad): number | null {
  if (load.total === null) return null;
  return Math.min(1, load.loaded / load.total);
}
