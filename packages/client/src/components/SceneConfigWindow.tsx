import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import type { GridConfig, MapUploadResult, ScenePatch, SceneVisibility } from '@vtt/shared';
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  SCENE_DARK_SIGHT_MAX_M,
  UPLOAD_ACCEPT_ATTRIBUTE,
  formatMetres,
  gridCellsAlong,
  gridSizeForColumns,
  uploadRequirementText,
} from '@vtt/shared';
import { apiUpload } from '../api.js';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import {
  forgetExploration,
  setSceneExplore,
  setSceneLighting,
  setSceneVisibility,
  updateScene,
} from '../socket.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';
import {
  IconBrush,
  IconCloud,
  IconFog,
  IconLamp,
  IconRect,
  IconSun,
  IconWall,
} from './MapIcons.js';

type SceneTab = 'map' | 'grid' | 'vision';

const TABS: { id: SceneTab; label: string }[] = [
  { id: 'map', label: 'Mapa' },
  { id: 'grid', label: 'Siatka' },
  { id: 'vision', label: 'Widoczność' },
];

/** Które pola szkicu należą do której zakładki — kropka „niezapisane” na zakładce. */
function tabIsDirty(tab: SceneTab, draft: ScenePatch | null): boolean {
  if (!draft) return false;
  if (tab === 'map') {
    return (
      draft.name !== undefined ||
      draft.background !== undefined ||
      draft.width !== undefined ||
      draft.height !== undefined
    );
  }
  if (tab === 'grid') {
    return (
      draft.grid !== undefined ||
      draft.gridMode !== undefined ||
      draft.metersPerSquare !== undefined
    );
  }
  return false;
}

/**
 * Kto widzi siatkę (15.10.2026): jeden wybór zamiast dwóch pól, bo siatka
 * gracza bez siatki MG nie ma sensu. Domyślnie „Tylko MG” — gracz dostaje
 * czystą mapę, dopóki MG nie postanowi inaczej.
 */
type GridAudience = 'none' | 'gm' | 'all';

const GRID_AUDIENCES: { id: GridAudience; label: string; hint: string }[] = [
  {
    id: 'none',
    label: 'Nikt',
    hint: 'Siatki nie widać wcale. Figury dalej stają w kratkach, a linijka mierzy w metrach.',
  },
  {
    id: 'gm',
    label: 'Tylko MG',
    hint: 'Siatkę widzisz tylko Ty — gracze widzą czystą mapę.',
  },
  {
    id: 'all',
    label: 'MG i gracze',
    hint: 'Siatkę widzi cały stół, w kolorze i kryciu ustawionych niżej.',
  },
];

function gridAudience(grid: GridConfig): GridAudience {
  if (!grid.visible) return 'none';
  return grid.players ? 'all' : 'gm';
}

function audiencePatch(audience: GridAudience): Partial<GridConfig> {
  return { visible: audience !== 'none', players: audience === 'all' };
}

const MOVE_MODES: { id: 'grid' | 'gridless'; label: string; hint: string }[] = [
  {
    id: 'grid',
    label: 'Po kratkach',
    hint: 'Figury stają na polach siatki — tak liczy ruch CP RED (pole = 2 m).',
  },
  {
    id: 'gridless',
    label: 'Swobodnie',
    hint: 'Figury stają tam, gdzie je upuścisz. Skala wyżej dalej przelicza piksele na metry, a siatki nie widać.',
  },
];

/**
 * Trzy tryby jako karty z opisem (15.10, zlecenie MG: zakładka ma być jasna
 * dla kogoś, kto pierwszy raz siada do VTT i nie wie, czym jest mgła wojny).
 * Nazwy mówią, **kto odkrywa mapę**, a nie jak to działa w środku.
 */
const VISIBILITY_MODES: { id: SceneVisibility; label: string; summary: string }[] = [
  {
    id: 'open',
    label: 'Cała mapa odkryta',
    summary: 'Gracze od razu widzą całą mapę. Dobre dla miejsc bez tajemnic.',
  },
  {
    id: 'fog',
    label: 'Mgła wojny — odkrywasz Ty',
    summary:
      'Gracze zaczynają przy czarnej mapie, a Ty odsłaniasz ją kawałek po kawałku, gdy postacie tam docierają.',
  },
  {
    id: 'dynamic',
    label: 'Pole widzenia — odkrywa się samo',
    summary:
      'Gracz widzi to, co widzą figury drużyny, aż do najbliższej ściany. Mapa odsłania się sama, gdy figury idą.',
  },
];

/** Ikona narzędzia z paska mapy wpleciona w zdanie instrukcji. */
function ToolGlyph({ children }: { children: ReactNode }) {
  return <span className="scene-guide-glyph">{children}</span>;
}

/** „Jak to zrobić” pod wybranym trybem — kroki z nazwami i ikonami z paska mapy. */
function VisibilityGuide({ mode }: { mode: SceneVisibility }) {
  if (mode === 'open') return null;
  if (mode === 'fog') {
    return (
      <div className="scene-guide">
        <p className="scene-guide-title">Jak odkrywać mapę</p>
        <ol>
          <li>
            W pasku nad mapą kliknij <strong>Mgła wojny</strong>{' '}
            <ToolGlyph>
              <IconFog size={15} />
            </ToolGlyph>{' '}
            (albo naciśnij <kbd>F</kbd>).
          </li>
          <li>
            Pod paskiem pojawią się opcje. Wybierz <strong>odsłanianie</strong>{' '}
            <ToolGlyph>
              <IconSun size={15} />
            </ToolGlyph>{' '}
            i kształt: <strong>pędzel</strong>{' '}
            <ToolGlyph>
              <IconBrush />
            </ToolGlyph>{' '}
            (malujesz z wciśniętym przyciskiem myszy) albo <strong>prostokąt</strong>{' '}
            <ToolGlyph>
              <IconRect size={15} />
            </ToolGlyph>{' '}
            (przeciągasz ramkę na całe pomieszczenie).
          </li>
          <li>
            Przeciągnij po mapie tam, gdzie gracze mają widzieć. Żeby coś schować z powrotem,
            wybierz <strong>zakrywanie</strong>{' '}
            <ToolGlyph>
              <IconCloud size={15} />
            </ToolGlyph>
            .
          </li>
        </ol>
        <p className="settings-hint">
          Ty zawsze widzisz całą mapę — to, co gracze mają zakryte, jest u Ciebie tylko
          przyciemnione. Odsłonięte miejsca zostają zapamiętane, nawet gdy zmienisz tryb.
        </p>
      </div>
    );
  }
  return (
    <div className="scene-guide">
      <p className="scene-guide-title">Co przygotować</p>
      <ol>
        <li>
          Narysuj ściany narzędziem <strong>Ściany</strong>{' '}
          <ToolGlyph>
            <IconWall size={15} />
          </ToolGlyph>{' '}
          (klawisz <kbd>W</kbd>): klikaj kolejne narożniki, <kbd>Enter</kbd> kończy. Bez ścian
          gracze widzą całą mapę.
        </li>
        <li>Postaw na mapie figury graczy — każdy widzi z miejsca, w którym stoi jego figura.</li>
      </ol>
    </div>
  );
}

/** Liczba po polsku: przecinek i najwyżej `digits` miejsc, bez zer na końcu. */
function formatDecimal(value: number, digits: number): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor).replace('.', ',');
}

/** Przełącznik kilku wartości w jednym rzędzie (rola `radiogroup`). */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; hint: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="scene-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className={`scene-seg-option${option.id === value ? ' is-active' : ''}`}
          title={option.hint}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Kratka z liczby kolumn (zlecenie MG, 11.09.2026) — obok suwaka, nie zamiast
 * niego: mapa bez okrągłej skali dalej ustawia się pikselami. Liczy z wymiarów
 * **obrazu**, bo to jego skalę opisuje nazwa pliku z paczki („…-40x30"),
 * a wiersze tylko podpowiada — kratka jest kwadratowa i jedna oś musi wygrać
 * (`gridSizeForColumns`).
 *
 * Wpisywany tekst żyje w polu wyłącznie na czas pisania. Poza tym pole pokazuje
 * liczbę wynikającą z kratki, więc suwak przesunięty obok od razu je zmienia —
 * ale gdyby liczyło się z kratki także pod palcem, „4" w drodze do „40" dałoby
 * kratkę 362 px i pole przeskoczyłoby na wynik, zanim MG dopisze zero.
 */
function GridColumnsField({
  imageWidth,
  imageHeight,
  sizePx,
  onSize,
}: {
  imageWidth: number;
  imageHeight: number;
  sizePx: number;
  onSize: (sizePx: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const columns = gridCellsAlong(imageWidth, sizePx);
  const rows = gridCellsAlong(imageHeight, sizePx);
  const wholeRows = Math.round(rows);
  // Reszta w pikselach mówi więcej niż „30,05 wiersza": przy mapie z paczki to
  // zaokrąglenie pliku (kilka pikseli), przy źle dobranej skali — pół kratki.
  const leftoverPx = Math.abs(imageHeight - wholeRows * sizePx);

  return (
    <>
      <div
        className="settings-row"
        title="Mapy z paczek mają skalę w nazwie pliku, np. „…-40x30” to 40 kratek w poziomie."
      >
        <label className="settings-label" htmlFor="grid-columns">
          Kratek w poziomie
        </label>
        <input
          id="grid-columns"
          type="number"
          className="scene-number-input"
          min={1}
          step="any"
          value={typed ?? Math.round(columns * 100) / 100}
          onChange={(e) => {
            setTyped(e.target.value);
            const size = gridSizeForColumns(imageWidth, Number(e.target.value));
            if (size !== null) onSize(size);
          }}
          onBlur={() => setTyped(null)}
        />
      </div>
      {/* Kilka pikseli to zaokrąglenie pliku z paczki — na kolor zasługuje
          dopiero rozjazd, który widać na mapie (ćwierć kratki). */}
      <p className={`settings-hint${leftoverPx < sizePx / 4 ? '' : ' scene-config-warn'}`}>
        {leftoverPx < 0.5
          ? `W pionie wychodzi równo ${wholeRows}.`
          : `W pionie wychodzi ${formatDecimal(rows, 2)} — ostatni rząd rozjeżdża się o ${formatDecimal(leftoverPx, 1)} px.`}
      </p>
    </>
  );
}

/**
 * Okno „Edycja sceny” (15.10.2026, wzorem Scene Configuration z Foundry).
 *
 * Do 15.10 edytor stał pod listą scen w bocznym panelu jako jedna długa
 * kolumna: siatka, mgła i ciemność przemieszane, połowa pól zapisywała się
 * „Zapisz”, połowa od razu, a skala znikała razem z siatką, choć linijka
 * z niej liczy. Teraz trzy zakładki — **Mapa** i **Siatka** to szkic
 * zapisywany „Zapisz” (podgląd na mapie na żywo), **Widoczność** działa od
 * razu, bo zmienia, co serwer wysyła graczom (`scene:visibility`,
 * `scene:lighting`, `scene:explore`) — i mówi to na górze zakładki.
 */
export function SceneConfigWindow() {
  const open = useSceneStore((s) => s.editorOpen);
  if (!open) return null;
  return <SceneConfigBody />;
}

function SceneConfigBody() {
  const scene = useSceneStore((s) => s.effectiveScene);
  const draft = useSceneStore((s) => s.draft);
  const patchDraft = useSceneStore((s) => s.patchDraft);
  const setDraft = useSceneStore((s) => s.setDraft);
  const setScene = useSceneStore((s) => s.setScene);
  const setEditorOpen = useSceneStore((s) => s.setEditorOpen);
  const gridContrast = useSceneStore((s) => s.gridContrast);
  const setGridContrast = useSceneStore((s) => s.setGridContrast);
  const [tab, setTab] = useState<SceneTab>('map');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pierwsze otwarcie: prawy brzeg mapy, pod paskiem narzędzi — obok panelu
  // „Sceny”, a nie na nim, i z widokiem na siatkę, którą się właśnie ustawia.
  const placement = useWindowPlacement('scene-config', () => {
    const map = document.querySelector('.map-area')?.getBoundingClientRect();
    const right = map ? map.right : window.innerWidth;
    return {
      x: Math.max(12, Math.round(right - Math.min(420, window.innerWidth - 24) - 12)),
      y: Math.round((map?.top ?? 56) + 56),
    };
  });

  // Kontrastowa siatka żyje najwyżej tyle, co edytor (12.09): domyślnie wyłączona
  // (zlecenie MG, 21.10), MG włącza ją przełącznikiem, a zamknięcie okna ją gasi,
  // więc mapa nigdy nie zostaje w trybie roboczym po edycji.
  useEffect(() => () => setGridContrast(false), [setGridContrast]);

  // Scena zniknęła spod okna (skasowana, MG nic nie ogląda) — okno też.
  useEffect(() => {
    if (!scene) setEditorOpen(false);
  }, [scene, setEditorOpen]);

  if (!scene) return null;

  function close() {
    setDraft(null);
    setEditorOpen(false);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const rejection = fileRejectionText(file, 'map');
    if (rejection) {
      setError(rejection);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await apiUpload<MapUploadResult>('/api/uploads/maps', file);
      // Mirror the server default: a new map defines the playable area.
      patchDraft({ background: result, width: result.width, height: result.height });
    } catch (err) {
      setError(uploadErrorText(err, 'map'));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!scene || !draft) {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    const ack = await updateScene(scene.id, draft);
    setSaving(false);
    if (ack.ok && ack.data) {
      setScene(ack.data);
      setDraft(null);
      setEditorOpen(false);
    } else {
      setError('Nie udało się zapisać sceny.');
    }
  }

  const grid = scene.grid;
  const offsetMax = Math.max(1, Math.round(grid.sizePx) - 1);

  return (
    <section
      ref={placement.ref}
      className="settings-window scene-config-window scene-editor"
      style={placement.style}
      aria-label="Edycja sceny"
      data-owns-keys
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <h2 className="settings-window-title scene-config-title">Edycja: {scene.name}</h2>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title={draft ? 'Zamknij bez zapisywania' : 'Zamknij edycję sceny'}
          aria-label="Zamknij edycję sceny"
        >
          ✕
        </button>
      </div>

      <nav className="sheet-tabs settings-tabs" role="tablist" aria-label="Zakładki sceny">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`sheet-tab${tab === t.id ? ' sheet-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
            title={tabIsDirty(t.id, draft) ? 'Niezapisane zmiany' : undefined}
          >
            {t.label}
            {tabIsDirty(t.id, draft) && (
              <span className="scene-config-dirty" aria-hidden>
                •
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="settings-window-body" role="tabpanel">
        {tab === 'map' && (
          <>
            <section className="settings-group">
              <div className="settings-row">
                <label className="settings-label" htmlFor="scene-name">
                  Nazwa
                </label>
                <input
                  id="scene-name"
                  type="text"
                  className="scene-config-grow"
                  maxLength={64}
                  value={scene.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                />
              </div>
            </section>

            <section className="settings-group">
              <h3 className="settings-group-title">Obraz mapy</h3>
              {scene.background ? (
                <figure className="scene-config-map">
                  <img src={scene.background.url} alt="" />
                  <figcaption>
                    {scene.background.width}×{scene.background.height} px
                  </figcaption>
                </figure>
              ) : (
                <p className="settings-note">
                  Scena nie ma jeszcze mapy. Wgraj obraz — rozmiar sceny dopasuje się do niego.
                </p>
              )}
              <div className="scene-editor-row">
                <label
                  className="small-button scene-upload-button"
                  title={uploadRequirementText('map')}
                >
                  {uploading ? 'Wgrywanie…' : scene.background ? 'Zmień obraz' : 'Wgraj obraz'}
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT_ATTRIBUTE}
                    onChange={(e) => void upload(e)}
                    disabled={uploading}
                    hidden
                  />
                </label>
                {scene.background && (
                  <button
                    type="button"
                    className="small-button small-button--danger"
                    onClick={() => patchDraft({ background: null })}
                  >
                    Usuń obraz
                  </button>
                )}
              </div>
            </section>
          </>
        )}

        {tab === 'grid' && (
          <>
            <section className="settings-group">
              <h3 className="settings-group-title">Skala</h3>
              {scene.background && (
                <GridColumnsField
                  imageWidth={scene.background.width}
                  imageHeight={scene.background.height}
                  sizePx={grid.sizePx}
                  onSize={(sizePx) => patchDraft({ grid: { sizePx } })}
                />
              )}
              <div className="settings-row" title="Bok jednej kratki w pikselach obrazu.">
                <label className="settings-label" htmlFor="grid-size">
                  Rozmiar kratki
                </label>
                <input
                  id="grid-size"
                  type="range"
                  min={GRID_SIZE_MIN}
                  max={Math.min(GRID_SIZE_MAX, 400)}
                  step={1}
                  value={grid.sizePx}
                  onChange={(e) => patchDraft({ grid: { sizePx: Number(e.target.value) } })}
                />
                {/* `step="any"`, bo kratka z liczby kolumn bywa ułamkiem (36,2 px):
                    przy kroku 1 pole oznaczałoby taką wartość jako błędną. */}
                <input
                  type="number"
                  className="scene-number-input"
                  aria-label="Rozmiar kratki w pikselach"
                  min={GRID_SIZE_MIN}
                  max={GRID_SIZE_MAX}
                  step="any"
                  value={Math.round(grid.sizePx * 10) / 10}
                  onChange={(e) => patchDraft({ grid: { sizePx: Number(e.target.value) } })}
                />
                <span className="scene-config-unit">px</span>
              </div>
              <div
                className="settings-row"
                title="Ile metrów ma bok kratki — z tego liczą linijka, zasięgi i ruch. CP RED: 2 m."
              >
                <label className="settings-label" htmlFor="meters-per-square">
                  Kratka to
                </label>
                <input
                  id="meters-per-square"
                  type="number"
                  className="scene-number-input"
                  min={0.1}
                  step={0.5}
                  value={scene.metersPerSquare}
                  onChange={(e) => patchDraft({ metersPerSquare: Number(e.target.value) })}
                />
                <span className="scene-config-unit">m</span>
              </div>
            </section>

            <section className="settings-group">
              <h3 className="settings-group-title">Ruch figur</h3>
              <Segmented
                label="Ruch figur"
                options={MOVE_MODES}
                value={scene.gridMode}
                onChange={(gridMode) => patchDraft({ gridMode })}
              />
            </section>

            {scene.gridMode === 'grid' && (
              <>
                <section className="settings-group">
                  <h3 className="settings-group-title">Wyrównanie do mapy</h3>
                  <div
                    className="settings-row"
                    title="Przesuwa siatkę w poziomie, aż kratki pokryją się z polami na mapie."
                  >
                    <label className="settings-label" htmlFor="grid-offset-x">
                      Przesunięcie X
                    </label>
                    <input
                      id="grid-offset-x"
                      type="range"
                      min={0}
                      max={offsetMax}
                      step={1}
                      value={grid.offsetX}
                      onChange={(e) => patchDraft({ grid: { offsetX: Number(e.target.value) } })}
                    />
                    <span className="settings-value scene-config-value">
                      {Math.round(grid.offsetX)} px
                    </span>
                  </div>
                  <div
                    className="settings-row"
                    title="Przesuwa siatkę w pionie, aż kratki pokryją się z polami na mapie."
                  >
                    <label className="settings-label" htmlFor="grid-offset-y">
                      Przesunięcie Y
                    </label>
                    <input
                      id="grid-offset-y"
                      type="range"
                      min={0}
                      max={offsetMax}
                      step={1}
                      value={grid.offsetY}
                      onChange={(e) => patchDraft({ grid: { offsetY: Number(e.target.value) } })}
                    />
                    <span className="settings-value scene-config-value">
                      {Math.round(grid.offsetY)} px
                    </span>
                  </div>
                </section>

                <section className="settings-group">
                  <h3 className="settings-group-title">Kto widzi siatkę</h3>
                  <Segmented
                    label="Kto widzi siatkę"
                    options={GRID_AUDIENCES}
                    value={gridAudience(grid)}
                    onChange={(audience) => patchDraft({ grid: audiencePatch(audience) })}
                  />
                  {grid.visible && (
                    <>
                      <div className="settings-row scene-config-look">
                        <label className="settings-label" htmlFor="grid-color">
                          Kolor i krycie
                        </label>
                        <input
                          id="grid-color"
                          type="color"
                          value={grid.color}
                          onChange={(e) => patchDraft({ grid: { color: e.target.value } })}
                        />
                        <input
                          id="grid-alpha"
                          type="range"
                          aria-label="Krycie siatki"
                          min={0}
                          max={1}
                          step={0.05}
                          value={grid.alpha}
                          onChange={(e) => patchDraft({ grid: { alpha: Number(e.target.value) } })}
                        />
                        <span className="settings-value scene-config-value">
                          {Math.round(grid.alpha * 100)}%
                        </span>
                      </div>
                      {/* Tylko u MG i tylko przy otwartym edytorze (12.09),
                          domyślnie odhaczone (21.10) — siatka wygląda jak w grze. */}
                      <label
                        className="settings-row settings-row--switch"
                        title="Obwódka i pełne krycie, żeby rozjazd kratek z mapą był widoczny na każdym tle. Widzisz to tylko Ty i tylko przy otwartym oknie; zamknięcie okna je wyłącza."
                      >
                        <input
                          type="checkbox"
                          checked={gridContrast}
                          onChange={(e) => setGridContrast(e.target.checked)}
                        />
                        <span>Kontrastowa siatka na czas edycji</span>
                      </label>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {tab === 'vision' && (
          <>
            {/* Unlike the two tabs before it, nothing here is part of the draft:
                changing what hides the map has to take concealed tokens away
                from the players — or hand them back — in the same operation,
                so each setting travels on its own event (`scene:visibility`,
                `scene:lighting`, `scene:explore`) rather than in the patch. */}
            <p className="settings-note">Zmiany na tej zakładce działają od razu, bez „Zapisz”.</p>

            <section className="settings-group">
              <h3 className="settings-group-title">Ile mapy widzą gracze</h3>
              <div className="scene-modes" role="radiogroup" aria-label="Ile mapy widzą gracze">
                {VISIBILITY_MODES.map((mode) => (
                  <label
                    key={mode.id}
                    className={`scene-mode${scene.visibility === mode.id ? ' is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="scene-visibility"
                      value={mode.id}
                      checked={scene.visibility === mode.id}
                      onChange={() => void setSceneVisibility(scene.id, mode.id)}
                    />
                    <span className="scene-mode-text">
                      <span className="scene-mode-label">{mode.label}</span>
                      <span className="scene-mode-summary">{mode.summary}</span>
                    </span>
                  </label>
                ))}
              </div>
              <VisibilityGuide mode={scene.visibility} />
            </section>

            {/* Darkness and the party's memory only mean something where sight
                comes from tokens, so they appear with the mode that asks them. */}
            {scene.visibility === 'dynamic' && (
              <>
                <section className="settings-group">
                  <h3 className="settings-group-title">Światło</h3>
                  <label className="settings-row settings-row--switch">
                    <input
                      type="checkbox"
                      checked={scene.dark}
                      onChange={(e) => void setSceneLighting(scene.id, { dark: e.target.checked })}
                    />
                    <span>Ciemna scena — widać tylko to, co oświetlone</span>
                  </label>
                  <p className="settings-hint">
                    Noc, piwnica, wyłączony prąd. Lampy stawiasz narzędziem <strong>Światła</strong>{' '}
                    <ToolGlyph>
                      <IconLamp size={14} />
                    </ToolGlyph>{' '}
                    (klawisz <kbd>L</kbd>), latarkę postaci włączasz w menu jej figury.
                  </p>
                  {scene.dark && (
                    <div
                      className="settings-row"
                      title="Ile figura widzi bez żadnego światła. Domyślne 2 m to jedna kratka — dzięki temu czarny ekran nigdy nie czyta się jako awaria. Zero = całkowita ciemność."
                    >
                      <label className="settings-label" htmlFor="scene-dark-sight">
                        Po omacku
                      </label>
                      <input
                        id="scene-dark-sight"
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={scene.darkSightM}
                        onChange={(e) =>
                          void setSceneLighting(scene.id, { darkSightM: Number(e.target.value) })
                        }
                      />
                      <input
                        type="number"
                        className="scene-number-input"
                        aria-label="Widoczność po omacku w metrach"
                        min={0}
                        max={SCENE_DARK_SIGHT_MAX_M}
                        step={0.5}
                        value={scene.darkSightM}
                        onChange={(e) =>
                          void setSceneLighting(scene.id, { darkSightM: Number(e.target.value) })
                        }
                      />
                      <span className="scene-config-unit" aria-hidden>
                        m
                      </span>
                    </div>
                  )}
                  {scene.dark && (
                    <p className="settings-hint">
                      Bez żadnego światła figura widzi na {formatMetres(scene.darkSightM)} wokół
                      siebie. Zero to całkowita ciemność.
                    </p>
                  )}
                </section>

                {/* The party's memory of the map (stage 18c). It takes nothing
                    away from anybody — a remembered room never showed who was
                    in it — so it needs no token re-filter, only a repaint. */}
                <section className="settings-group">
                  <h3 className="settings-group-title">Zapamiętywanie mapy</h3>
                  <div className="scene-editor-row">
                    <label className="settings-row settings-row--switch scene-config-grow">
                      <input
                        type="checkbox"
                        checked={scene.explore}
                        onChange={(e) => void setSceneExplore(scene.id, e.target.checked)}
                      />
                      <span>Pamięć eksploracji</span>
                    </label>
                    <button
                      type="button"
                      className="small-button small-button--danger"
                      title="Drużyna zapomina wszystko, co zwiedziła na tej scenie."
                      onClick={() => void forgetExploration(scene.id)}
                      disabled={!scene.explore}
                    >
                      Zapomnij
                    </button>
                  </div>
                  <p className="settings-hint">
                    Miejsca, które drużyna już widziała, zostają na mapie przyciemnione — jak plan
                    narysowany z pamięci, bez figur, które tam teraz są. „Zapomnij” czyści ten plan.
                  </p>
                </section>
              </>
            )}
          </>
        )}
      </div>

      <div className="scene-config-footer">
        {error && <p className="auth-error">{error}</p>}
        <button
          className="primary-button"
          type="button"
          onClick={() => void save()}
          disabled={saving || !draft}
          title={draft ? 'Zapisz zmiany mapy i siatki' : 'Nic do zapisania'}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz'}
        </button>
        <button type="button" className="small-button" onClick={close}>
          {draft ? 'Anuluj zmiany' : 'Zamknij'}
        </button>
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
