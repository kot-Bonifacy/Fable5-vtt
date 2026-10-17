import { useEffect, useState, type ChangeEvent } from 'react';
import type { TokenAssetView } from '@vtt/shared';
import { apiGet, apiUpload } from '../api.js';
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { plural } from '../plural.js';
import { noteAck, notifyInfo } from '../notices.js';
import { deleteTokenAsset } from '../socket.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { startTokenDrag } from '../map/token-drag.js';

/**
 * GM tab „Grafiki” (until 15.10 „Tokeny”): the campaign's token image library.
 * Figures with a sheet are placed from „Postacie”; this tab covers figures
 * without one, and its images feed „🖼 Zmień grafikę…” in the figure menu.
 * Selecting an entry arms placement mode — the next click on the map creates the token there. Since
 * 26.09 an entry can also be dragged straight onto the map (`token-drag.ts`).
 *
 * Kosz (27.08) jest dwustopniowy jak w puli portretów, ale mówi więcej:
 * zdjęcie grafiki zdejmuje ją **także z żetonów**, które ją noszą, więc panel
 * powtarza liczbę figur, które przez to wróciły do krążka. Sam kasuje serwer
 * zdarzeniem `token:asset-delete` — patrz komentarz przy nim.
 */
export function TokenPanel() {
  // Żeton w ręku mieszka od 28.08 w store narzędzi mapy, razem z wyborem
  // narzędzia — jeden tryb na raz (patrz `TokenPlacement`).
  const placement = useMapToolStore((s) => s.tokenPlacement);
  const setPlacement = useMapToolStore((s) => s.setTokenPlacement);
  const [assets, setAssets] = useState<TokenAssetView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [blankName, setBlankName] = useState('');

  useEffect(() => {
    apiGet<TokenAssetView[]>('/api/token-assets')
      .then(setAssets)
      .catch(() => setError('Nie udało się pobrać biblioteki grafik.'));
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
    const ack = await deleteTokenAsset(asset.id);
    const refused = (code: string) =>
      code === 'ASSET_NOT_FOUND'
        ? 'Tej grafiki już nie ma w bibliotece.'
        : 'Nie udało się zdjąć grafiki z biblioteki.';
    if (!noteAck('token', ack, refused)) return;
    setAssets((current) => current.filter((entry) => entry.id !== asset.id));
    if (placement?.imageUrl === asset.url) setPlacement(null);
    const cleared = ack.data?.clearedTokens ?? 0;
    notifyInfo(
      cleared === 0
        ? `Zdjęto „${asset.name}" z biblioteki.`
        : `Zdjęto „${asset.name}"; ${plural(cleared, 'żeton wrócił', 'żetony wróciły', 'żetonów wróciło')} do krążka.`,
      { topic: 'token' },
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
        {uploading ? 'Wgrywanie…' : 'Wgraj grafikę'}
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
        <p className="placeholder-text">
          Biblioteka jest pusta — wgraj pierwszą grafikę. Postaci z kartą stawia się z zakładki
          „Postacie”.
        </p>
      ) : (
        <div className="token-asset-grid">
          {assets.map((asset) => (
            <div key={asset.id} className="token-asset-item">
              <button
                type="button"
                className={`token-asset ${placement?.imageUrl === asset.url ? 'token-asset--armed' : ''}`}
                title={`${asset.name} — kliknij i kliknij na mapie albo przeciągnij na mapę`}
                draggable
                onDragStart={(event) =>
                  startTokenDrag(event, { name: asset.name, imageUrl: asset.url })
                }
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
                  onClick={() => setConfirmingId(asset.id)}
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
        <button
          type="button"
          className="small-button"
          onClick={placeBlank}
          draggable
          onDragStart={(event) =>
            startTokenDrag(event, { name: blankName.trim() || 'Token', imageUrl: null })
          }
          title="Kliknij i kliknij na mapie albo przeciągnij na mapę"
        >
          Postaw pusty
        </button>
      </div>

      {placement && (
        <p className="auth-hint">
          Tryb stawiania: „{placement.name}” — kliknij na mapie (Esc anuluje). Grafikę można też
          przeciągnąć prosto na mapę.
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
