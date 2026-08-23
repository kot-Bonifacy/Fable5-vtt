import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import type { PortraitAssetView } from '@vtt/shared';
import { ROLE_GM, UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { apiDelete, apiGet, apiUpload } from '../api.js';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { useAuthStore } from '../stores/authStore.js';

/**
 * Pula portretów kampanii — jedna dla karty postaci i dla kreatora.
 *
 * Zasada z 23.08: **grafiki dokłada wyłącznie MG**, a gracz wybiera z gotowego
 * zestawu. Do tej pory każdy wgrywał własny plik prosto na kartę, więc nikt nie
 * panował nad tym, co leży w `uploads/portraits` — a portret wgrany przez
 * gracza i tak nikomu innemu się nie przydawał.
 *
 * Kosz jest dwustopniowy jak każdy inny w aplikacji i zdejmuje sam wpis puli:
 * portret już wybrany na czyjejś karcie zostaje na niej, bo „nie proponuj tego
 * dalej" to co innego niż „odbierz komuś obrazek".
 */
export function PortraitPicker({
  selectedUrl,
  onPick,
  disabled = false,
}: {
  /** Adres portretu wybranego w tej chwili — podświetla kafelek w puli. */
  selectedUrl: string | null | undefined;
  onPick: (url: string) => void;
  disabled?: boolean;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [assets, setAssets] = useState<PortraitAssetView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    apiGet<PortraitAssetView[]>('/api/portrait-assets')
      .then((rows) => setAssets(rows))
      .catch(() => setAssets([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => reload(), [reload]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const rejection = fileRejectionText(file, 'portrait');
    if (rejection) {
      setError(rejection);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const asset = await apiUpload<PortraitAssetView>('/api/uploads/portrait-assets', file);
      setAssets((current) => [asset, ...current]);
    } catch (caught) {
      setError(uploadErrorText(caught, 'portrait'));
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    setConfirmingId(null);
    try {
      await apiDelete(`/api/portrait-assets/${id}`);
      setAssets((current) => current.filter((asset) => asset.id !== id));
    } catch {
      setError('Nie udało się zdjąć portretu z puli.');
    }
  }

  return (
    <div className="portrait-pool">
      <p className="portrait-pool-head">
        Pula portretów
        {isGm ? (
          <label className="small-button portrait-pool-upload">
            {uploading ? 'Wgrywanie…' : '+ Dodaj'}
            <input
              type="file"
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              title={uploadRequirementText('portrait')}
              onChange={(event) => void upload(event)}
              disabled={uploading || disabled}
              hidden
            />
          </label>
        ) : null}
      </p>

      {assets.length === 0 ? (
        <p className="portrait-pool-empty">
          {!loaded
            ? 'Wczytywanie…'
            : isGm
              ? 'Pula jest pusta — dodaj pierwszy portret przyciskiem „+ Dodaj".'
              : 'Pula jest pusta. Portrety dokłada MG.'}
        </p>
      ) : (
        <div className="portrait-pool-grid">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className={`portrait-pool-item ${
                selectedUrl === asset.url ? 'portrait-pool-item--picked' : ''
              }`}
            >
              <button
                type="button"
                className="portrait-pool-pick"
                title={asset.name}
                aria-label={`Wybierz portret „${asset.name}”`}
                disabled={disabled}
                onClick={() => onPick(asset.url)}
              >
                <img src={asset.url} alt="" loading="lazy" />
                <span className="portrait-pool-name">{asset.name}</span>
              </button>
              {isGm ? (
                confirmingId === asset.id ? (
                  <span className="portrait-pool-confirm">
                    <button
                      type="button"
                      className="small-button character-delete"
                      onClick={() => void remove(asset.id)}
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
                    className="small-button character-delete portrait-pool-remove"
                    title="Zdejmij portret z puli"
                    aria-label={`Zdejmij portret „${asset.name}” z puli`}
                    onClick={() => setConfirmingId(asset.id)}
                  >
                    ✕
                  </button>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}

      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
