import { useEffect, useState, type ChangeEvent } from 'react';
import type { TokenAssetView } from '@vtt/shared';
import { apiGet, apiUpload } from '../api.js';
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { plural } from '../plural.js';
import { deleteTokenAsset } from '../socket.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * GM tab: the campaign's token image library. Selecting an entry arms
 * placement mode — the next click on the map creates the token there.
 *
 * Kosz (27.08) jest dwustopniowy jak w puli portretów, ale mówi więcej:
 * zdjęcie grafiki zdejmuje ją **także z żetonów**, które ją noszą, więc panel
 * powtarza liczbę figur, które przez to wróciły do krążka. Sam kasuje serwer
 * zdarzeniem `token:asset-delete` — patrz komentarz przy nim.
 */
export function TokenPanel() {
  const placement = useTokenStore((s) => s.placement);
  const setPlacement = useTokenStore((s) => s.setPlacement);
  const [assets, setAssets] = useState<TokenAssetView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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
    const rejection = fileRejectionText(file, 'token');
    if (rejection) {
      setError(rejection);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const asset = await apiUpload<TokenAssetView>('/api/uploads/tokens', file);
      setAssets((current) => [asset, ...current]);
    } catch (err) {
      setError(uploadErrorText(err, 'token'));
    } finally {
      setUploading(false);
    }
  }

  async function remove(asset: TokenAssetView) {
    setConfirmingId(null);
    setError(null);
    const ack = await deleteTokenAsset(asset.id);
    if (!ack.ok) {
      setError(
        ack.error === 'ASSET_NOT_FOUND'
          ? 'Tej grafiki już nie ma w bibliotece.'
          : 'Nie udało się zdjąć grafiki z biblioteki.',
      );
      return;
    }
    setAssets((current) => current.filter((entry) => entry.id !== asset.id));
    if (placement?.imageUrl === asset.url) setPlacement(null);
    const cleared = ack.data?.clearedTokens ?? 0;
    setNotice(
      cleared === 0
        ? `Zdjęto „${asset.name}" z biblioteki.`
        : `Zdjęto „${asset.name}"; ${plural(cleared, 'żeton wrócił', 'żetony wróciły', 'żetonów wróciło')} do krążka.`,
    );
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
          accept={UPLOAD_ACCEPT_ATTRIBUTE}
          title={uploadRequirementText('token')}
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
            <div key={asset.id} className="token-asset-item">
              <button
                type="button"
                className={`token-asset ${placement?.imageUrl === asset.url ? 'token-asset--armed' : ''}`}
                title={asset.name}
                onClick={() => toggleAsset(asset)}
              >
                <img src={asset.url} alt="" loading="lazy" />
                <span className="token-asset-name">{asset.name}</span>
              </button>
              {confirmingId === asset.id ? (
                <span className="token-asset-confirm">
                  <button
                    type="button"
                    className="small-button character-delete"
                    onClick={() => void remove(asset)}
                  >
                    Tak, usuń
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => setConfirmingId(null)}
                  >
                    Anuluj
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="small-button character-delete token-asset-remove"
                  title="Zdejmij grafikę z biblioteki"
                  aria-label={`Zdejmij grafikę „${asset.name}” z biblioteki`}
                  onClick={() => {
                    setNotice(null);
                    setConfirmingId(asset.id);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
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
      {notice && <p className="auth-hint">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
