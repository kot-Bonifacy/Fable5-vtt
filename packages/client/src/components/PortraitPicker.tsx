import { useEffect, useState, type ChangeEvent } from 'react';
import type { PortraitAssetView } from '@vtt/shared';
import {
  DEFAULT_PORTRAIT_CROP,
  ROLE_GM,
  UPLOAD_ACCEPT_ATTRIBUTE,
  uploadRequirementText,
} from '@vtt/shared';
import { apiDelete, apiUpload } from '../api.js';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import { useAuthStore } from '../stores/authStore.js';
import { usePortraitStore } from '../stores/portraitStore.js';

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
 *
 * **Od 12.09 lista mieszka w `portraitStore`, nie tutaj.** Powód jest jeden:
 * kadr portretu na mapie jest cechą obrazka, więc tej samej listy potrzebuje
 * renderer — a dwie kopie tej samej puli rozjechałyby się przy pierwszym
 * przestawieniu kadru. Przy okazji pula odświeża się u wszystkich naraz.
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
  const assets = usePortraitStore((s) => s.assets);
  const loaded = usePortraitStore((s) => s.loaded);
  const load = usePortraitStore((s) => s.load);
  const applyUpsert = usePortraitStore((s) => s.applyUpsert);
  const applyDelete = usePortraitStore((s) => s.applyDelete);
  const openCrop = usePortraitStore((s) => s.openCrop);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

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
      applyUpsert(asset);
      // Kadrowanie otwiera się samo po wgraniu (zlecenie MG z 12.09): moment,
      // w którym MG ogląda nowy portret, jest jedynym, w którym na pewno wie,
      // co na nim jest — a bez kadru mapa weźmie ślepy środek.
      openCrop(asset.id);
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
      applyDelete(id);
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
              className={[
                'portrait-pool-item',
                selectedUrl === asset.url ? 'portrait-pool-item--picked' : '',
                isFramed(asset) ? 'portrait-pool-item--framed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
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
                <button
                  type="button"
                  className="small-button portrait-pool-crop"
                  title="Kadr tego portretu na mapie"
                  aria-label={`Ustaw kadr portretu „${asset.name}” na mapie`}
                  onClick={() => openCrop(asset.id)}
                >
                  ⛶
                </button>
              ) : null}
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

/** Czy ktoś ten portret już kadrował — kropka na kafelku. */
function isFramed(asset: PortraitAssetView): boolean {
  return (
    asset.crop.x !== DEFAULT_PORTRAIT_CROP.x ||
    asset.crop.y !== DEFAULT_PORTRAIT_CROP.y ||
    asset.crop.zoom !== DEFAULT_PORTRAIT_CROP.zoom
  );
}
