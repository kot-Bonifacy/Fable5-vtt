import { useEffect, useState, type ChangeEvent } from 'react';
import type { TokenAssetView } from '@vtt/shared';
import { ApiError, apiGet, apiUpload } from '../api.js';
import { useTokenStore } from '../stores/tokenStore.js';

function uploadErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  switch (code) {
    case 'FILE_TOO_LARGE':
      return 'Plik jest za duży (limit 8 MB).';
    case 'UNSUPPORTED_IMAGE':
      return 'Nieobsługiwany format — użyj PNG, JPG lub WebP.';
    case 'IMAGE_TOO_LARGE':
      return 'Obraz jest za duży (maks. 2048 px na bok).';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return 'Nie udało się wgrać pliku.';
  }
}

/**
 * GM tab: the campaign's token image library. Selecting an entry arms
 * placement mode — the next click on the map creates the token there.
 */
export function TokenPanel() {
  const placement = useTokenStore((s) => s.placement);
  const setPlacement = useTokenStore((s) => s.setPlacement);
  const [assets, setAssets] = useState<TokenAssetView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blankName, setBlankName] = useState('');

  useEffect(() => {
    apiGet<TokenAssetView[]>('/api/token-assets')
      .then(setAssets)
      .catch(() => setError('Nie udało się pobrać biblioteki tokenów.'));
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const asset = await apiUpload<TokenAssetView>('/api/uploads/tokens', file);
      setAssets((current) => [asset, ...current]);
    } catch (err) {
      setError(uploadErrorText(err));
    } finally {
      setUploading(false);
    }
  }

  function toggleAsset(asset: TokenAssetView) {
    if (placement?.imageUrl === asset.url) setPlacement(null);
    else setPlacement({ name: asset.name, imageUrl: asset.url });
  }

  function placeBlank() {
    const name = blankName.trim() || 'Token';
    setPlacement({ name, imageUrl: null });
  }

  return (
    <div className="token-panel">
      <label className="small-button scene-upload-button">
        {uploading ? 'Wgrywanie…' : 'Wgraj grafikę tokenu'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => void upload(e)}
          disabled={uploading}
          hidden
        />
      </label>

      {assets.length === 0 ? (
        <p className="placeholder-text">Biblioteka jest pusta — wgraj pierwszą grafikę.</p>
      ) : (
        <div className="token-asset-grid">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`token-asset ${placement?.imageUrl === asset.url ? 'token-asset--armed' : ''}`}
              title={asset.name}
              onClick={() => toggleAsset(asset)}
            >
              <img src={asset.url} alt={asset.name} loading="lazy" />
              <span className="token-asset-name">{asset.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="scene-editor-row">
        <input
          type="text"
          maxLength={64}
          placeholder="Nazwa pustego tokenu"
          value={blankName}
          onChange={(e) => setBlankName(e.target.value)}
        />
        <button type="button" className="small-button" onClick={placeBlank}>
          Postaw pusty
        </button>
      </div>

      {placement && (
        <p className="auth-hint">
          Tryb stawiania: „{placement.name}” — kliknij na mapie (Esc anuluje).
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
