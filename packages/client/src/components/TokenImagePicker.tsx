import { useEffect, useState } from 'react';
import type { TokenAssetView, TokenView } from '@vtt/shared';
import { apiGet } from '../api.js';
import { updateToken } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { tokenErrorText } from '../mapErrors.js';

/**
 * „🖼 Zmień grafikę…” z menu figury (15.10, zlecenie MG) — wybór z biblioteki
 * zakładki „Grafiki”.
 *
 * Do tej pory obrazek figury dało się zmienić tylko tak, że stawiało się ją
 * od nowa — serwer od etapu 05 przyjmował `imageUrl` w `token:update`, ale
 * żaden ekran o nie nie pytał. Wgrywa się dalej wyłącznie w zakładce
 * „Grafiki” (REST wgrywa plik, menu tylko wybiera), więc tu nie ma przycisku
 * wgrywania. Obok biblioteki dwie drogi powrotu: portret z karty, jeśli
 * figura ją ma, i sam krążek z nazwą.
 */
export function TokenImagePicker({ token, onDone }: { token: TokenView; onDone: () => void }) {
  const portraitUrl = useCharacterStore((s) =>
    token.characterId ? (s.characters[token.characterId]?.portraitUrl ?? null) : null,
  );
  const [assets, setAssets] = useState<TokenAssetView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiGet<TokenAssetView[]>('/api/token-assets')
      .then((rows) => live && setAssets(rows))
      .catch(() => live && setError('Nie udało się pobrać biblioteki grafik.'));
    return () => {
      live = false;
    };
  }, []);

  async function pick(imageUrl: string | null) {
    if (imageUrl === token.imageUrl) {
      onDone();
      return;
    }
    const ack = await updateToken(token.id, { imageUrl });
    if (!ack.ok) {
      setError(tokenErrorText(ack.error));
      return;
    }
    onDone();
  }

  const choices: { key: string; name: string; url: string }[] = [];
  if (portraitUrl) choices.push({ key: 'portrait', name: 'Portret z karty', url: portraitUrl });
  for (const asset of assets ?? []) {
    if (asset.url !== portraitUrl)
      choices.push({ key: asset.id, name: asset.name, url: asset.url });
  }

  return (
    <div className="token-image-picker">
      {assets === null && !error && <p className="combat-hint">Wczytywanie biblioteki…</p>}
      {assets !== null && choices.length === 0 && (
        <p className="combat-hint">
          Biblioteka jest pusta — grafiki wgrywa się w zakładce „Grafiki”.
        </p>
      )}
      {choices.length > 0 && (
        <div className="token-asset-grid token-image-picker-grid">
          {choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              className={`token-asset ${choice.url === token.imageUrl ? 'token-asset--armed' : ''}`}
              title={choice.name}
              aria-pressed={choice.url === token.imageUrl}
              onClick={() => void pick(choice.url)}
            >
              <img src={choice.url} alt="" loading="lazy" />
              <span className="token-asset-name">{choice.name}</span>
            </button>
          ))}
        </div>
      )}
      {token.imageUrl !== null && (
        <button
          type="button"
          className="small-button"
          title="Figura zostaje krążkiem z nazwą"
          onClick={() => void pick(null)}
        >
          Bez grafiki
        </button>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
