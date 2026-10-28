import { useEffect, useState } from 'react';
import {
  TOKEN_GLYPHS,
  TOKEN_GLYPH_LABELS,
  type TokenAssetView,
  type TokenGlyph,
  type TokenView,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { updateToken } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { tokenErrorText } from '../mapErrors.js';
import { DeviceGlyph } from './DeviceGlyph.js';

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

  // Obrazek i ikona urządzenia (28.10) wykluczają się: wybór jednego zdejmuje drugie.
  async function pick(imageUrl: string | null, glyph: TokenGlyph | null = null) {
    if (imageUrl === token.imageUrl && glyph === (token.glyph ?? null)) {
      onDone();
      return;
    }
    const ack = await updateToken(token.id, { imageUrl, glyph });
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
              className={`token-asset ${choice.url === token.imageUrl && !token.glyph ? 'token-asset--armed' : ''}`}
              title={choice.name}
              aria-pressed={choice.url === token.imageUrl && !token.glyph}
              onClick={() => void pick(choice.url)}
            >
              <img src={choice.url} alt="" loading="lazy" />
              <span className="token-asset-name">{choice.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="token-asset-grid token-image-picker-grid">
        {TOKEN_GLYPHS.map((glyph) => (
          <button
            key={glyph}
            type="button"
            className={`token-asset ${token.glyph === glyph ? 'token-asset--armed' : ''}`}
            title={`Ikona urządzenia: ${TOKEN_GLYPH_LABELS[glyph]}`}
            aria-pressed={token.glyph === glyph}
            onClick={() => void pick(null, glyph)}
          >
            <DeviceGlyph glyph={glyph} />
            <span className="token-asset-name">{TOKEN_GLYPH_LABELS[glyph]}</span>
          </button>
        ))}
      </div>
      {(token.imageUrl !== null || token.glyph) && (
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
