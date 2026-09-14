import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
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
  manage = false,
}: {
  /** Adres portretu wybranego w tej chwili — podświetla kafelek w puli. */
  selectedUrl?: string | null;
  onPick?: (url: string) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  /** Osobne wejście MG do biblioteki, bez wyboru portretu ani kadrowania. */
  manage?: boolean;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const assets = usePortraitStore((s) => s.assets);
  const availableAssets = assets.filter((asset) => !asset.retired);
  const loaded = usePortraitStore((s) => s.loaded);
  const load = usePortraitStore((s) => s.load);
  const applyUpsert = usePortraitStore((s) => s.applyUpsert);
  const applyDelete = usePortraitStore((s) => s.applyDelete);
  const openCrop = usePortraitStore((s) => s.openCrop);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const Tile = manage ? 'div' : 'button';

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load(true);
    // Zajętość obejmuje także szkice i ukryte figury, których klient nie zna.
    const timer = window.setInterval(() => void load(true), 3000);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !picking && !uploading) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, load, picking, uploading]);

  async function pick(asset: PortraitAssetView) {
    if (!onPick || manage) return;
    setPicking(true);
    setError(null);
    try {
      if ((await onPick(asset.url)) === false) {
        setError('Nie udało się wybrać portretu. Mógł zostać zajęty — wybierz ponownie.');
        await load(true);
        return;
      }
      setOpen(false);
      openCrop(asset.id);
    } catch {
      setError('Nie udało się wybrać portretu. Spróbuj ponownie.');
    } finally {
      setPicking(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || uploading) return;
    setUploading(true);
    setError(null);
    setFailures([]);
    let added = 0;
    const campaignId = useAuthStore.getState().activeCampaign?.id;
    const rejected: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (!campaignId || campaignId !== useAuthStore.getState().activeCampaign?.id) {
          rejected.push(
            ...files
              .slice(index)
              .map((pending) => `${pending.name}: Kampania zmieniła się — dodawanie przerwane.`),
          );
          break;
        }
        setProgress(`Wgrywanie ${index + 1} z ${files.length}: ${file.name}`);
        const rejection = fileRejectionText(file, 'portrait');
        if (rejection) {
          rejected.push(`${file.name}: ${rejection}`);
          continue;
        }
        try {
          const asset = await apiUpload<PortraitAssetView>(
            `/api/uploads/portrait-assets?campaignId=${encodeURIComponent(campaignId)}`,
            file,
          );
          if (campaignId === useAuthStore.getState().activeCampaign?.id) applyUpsert(asset);
          added += 1;
        } catch (caught) {
          rejected.push(`${file.name}: ${uploadErrorText(caught, 'portrait')}`);
        }
      }
    } finally {
      setProgress(`Dodano: ${added} z ${files.length}. Nie dodano: ${rejected.length}.`);
      setFailures(rejected);
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
    <>
      <button
        type="button"
        className="small-button"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {manage ? 'Portrety — biblioteka MG' : 'Wybierz portret'}
      </button>
      {open
        ? createPortal(
            <div
              className="dialog-backdrop"
              onClick={() => {
                if (!picking && !uploading) setOpen(false);
              }}
            >
              <div
                className="dialog portrait-gallery"
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={manage ? 'Biblioteka portretów MG' : 'Wybierz portret'}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key !== 'Tab') return;
                  const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                      'button:not(:disabled), input:not(:disabled):not([hidden]), [tabindex="0"]',
                    ),
                  );
                  const first = controls[0];
                  const last = controls.at(-1);
                  if (
                    event.shiftKey &&
                    (document.activeElement === first ||
                      document.activeElement === event.currentTarget)
                  ) {
                    event.preventDefault();
                    last?.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                  }
                }}
              >
                <h3 className="panel-section-title">
                  {manage ? 'Biblioteka portretów MG' : 'Wybierz portret'}
                </h3>
                <p className="portrait-pool-empty">
                  {manage
                    ? 'Dodawaj wiele plików naraz. Portrety są zapisywane na serwerze w puli tej kampanii. Kadr ustawisz przy wyborze w karcie postaci. Usunięcie z puli zachowuje zdjęcie i kadr na istniejących kartach i figurach.'
                    : 'Kliknij portret, aby przejść do kadrowania. Czarno-białe portrety są już zajęte.'}
                </p>
                {manage ? (
                  <p className="portrait-pool-empty">
                    {uploadRequirementText('portrait')}. Każdy plik jest sprawdzany osobno.
                  </p>
                ) : null}
                <div className="portrait-pool">
                  <p className="portrait-pool-head">
                    Pula portretów
                    {isGm && manage ? (
                      <>
                        <button
                          type="button"
                          className="small-button"
                          disabled={uploading || disabled}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {uploading ? 'Wgrywanie…' : '+ Dodaj pliki'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept={UPLOAD_ACCEPT_ATTRIBUTE}
                          title={uploadRequirementText('portrait')}
                          onChange={(event) => void upload(event)}
                          disabled={uploading || disabled}
                          hidden
                        />
                      </>
                    ) : null}
                  </p>

                  {availableAssets.length === 0 ? (
                    <p className="portrait-pool-empty">
                      {!loaded
                        ? 'Wczytywanie…'
                        : isGm
                          ? 'Pula jest pusta — dodaj portrety w bibliotece MG.'
                          : 'Pula jest pusta. Portrety dokłada MG.'}
                    </p>
                  ) : (
                    <div className="portrait-pool-grid">
                      {availableAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className={[
                            'portrait-pool-item',
                            selectedUrl === asset.url ? 'portrait-pool-item--picked' : '',
                            isFramed(asset) ? 'portrait-pool-item--framed' : '',
                            asset.assigned || selectedUrl === asset.url
                              ? 'portrait-pool-item--assigned'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <Tile
                            type="button"
                            className="portrait-pool-pick"
                            title={asset.name}
                            aria-label={manage ? asset.name : `Wybierz portret „${asset.name}”`}
                            disabled={
                              disabled ||
                              picking ||
                              (!isGm && !!asset.assigned && selectedUrl !== asset.url)
                            }
                            onClick={() => void pick(asset)}
                          >
                            <img src={asset.url} alt="" loading="lazy" />
                            <span className="portrait-pool-name">{asset.name}</span>
                            {selectedUrl === asset.url ? (
                              <span className="portrait-pool-name">Wybrany</span>
                            ) : asset.assigned ? (
                              <span className="portrait-pool-name">Zajęty</span>
                            ) : null}
                          </Tile>
                          {isGm && !manage ? (
                            <button
                              type="button"
                              className="small-button portrait-pool-crop"
                              title="Kadr tego portretu na mapie"
                              aria-label={`Ustaw kadr portretu „${asset.name}” na mapie`}
                              onClick={() => {
                                setOpen(false);
                                openCrop(asset.id);
                              }}
                            >
                              ⛶
                            </button>
                          ) : null}
                          {isGm && manage ? (
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
                  {progress ? <p role="status">{progress}</p> : null}
                  {failures.length ? (
                    <ul className="auth-error">
                      {failures.map((failure, index) => (
                        <li key={index}>{failure}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="small-button"
                  disabled={picking || uploading}
                  onClick={() => setOpen(false)}
                >
                  Zamknij
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
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
