import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { MapUploadResult, SceneSummary, SceneVisibility } from '@vtt/shared';
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  SCENE_DARK_SIGHT_MAX_M,
  formatMetres,
  gridCellsAlong,
  gridSizeForColumns,
} from '@vtt/shared';
import { apiUpload } from '../api.js';
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { confirmDestructive } from '../confirm.js';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import {
  activateScene,
  createScene,
  deleteScene,
  setSceneLighting,
  forgetExploration,
  setSceneExplore,
  setSceneVisibility,
  updateScene,
  viewScene,
} from '../socket.js';
import { useSceneStore } from '../stores/sceneStore.js';

function SceneRow({
  scene,
  isViewed,
  onEdit,
}: {
  scene: SceneSummary;
  isViewed: boolean;
  onEdit: (sceneId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirmDestructive(`Usunąć scenę „${scene.name}”?`)) return;
    const ack = await deleteScene(scene.id);
    if (!ack.ok) {
      setError(ack.error === 'SCENE_ACTIVE' ? 'Najpierw aktywuj inną scenę.' : 'Błąd usuwania.');
    }
  }

  return (
    <li className={`scene-row ${isViewed ? 'scene-row--viewed' : ''}`}>
      <div className="scene-row-main">
        <span className="scene-row-name">{scene.name}</span>
        {scene.active && <span className="badge badge--ok">aktywna</span>}
        {isViewed && !scene.active && <span className="badge badge--off">podgląd</span>}
      </div>
      <div className="scene-row-actions">
        {!isViewed && (
          <button type="button" className="small-button" onClick={() => void viewScene(scene.id)}>
            Pokaż
          </button>
        )}
        <button type="button" className="small-button" onClick={() => onEdit(scene.id)}>
          Edytuj
        </button>
        {!scene.active && (
          <>
            <button
              type="button"
              className="small-button"
              onClick={() => void activateScene(scene.id)}
            >
              Aktywuj
            </button>
            <button
              type="button"
              className="small-button small-button--danger"
              onClick={() => void remove()}
            >
              Usuń
            </button>
          </>
        )}
      </div>
      {error && <p className="auth-error">{error}</p>}
    </li>
  );
}

/** Liczba po polsku: przecinek i najwyżej `digits` miejsc, bez zer na końcu. */
function formatDecimal(value: number, digits: number): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor).replace('.', ',');
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
      <label className="auth-label" htmlFor="grid-columns">
        Kratek w poziomie (skala mapy)
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
      <p className="auth-hint">
        {leftoverPx < 0.5
          ? `W pionie wychodzi równo ${wholeRows}. `
          : `W pionie wychodzi ${formatDecimal(rows, 2)} — ostatni rząd rozjeżdża się o ${formatDecimal(leftoverPx, 1)} px. `}
        Mapy z paczek mają skalę w nazwie pliku, np. „…-40x30” to 40 kratek w poziomie.
      </p>
    </>
  );
}

function SceneEditor({ onClose }: { onClose: () => void }) {
  const scene = useSceneStore((s) => s.effectiveScene);
  const draft = useSceneStore((s) => s.draft);
  const patchDraft = useSceneStore((s) => s.patchDraft);
  const setDraft = useSceneStore((s) => s.setDraft);
  const setScene = useSceneStore((s) => s.setScene);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!scene) return null;

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
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const ack = await updateScene(scene.id, draft);
    setSaving(false);
    if (ack.ok && ack.data) {
      setScene(ack.data);
      setDraft(null);
      onClose();
    } else {
      setError('Nie udało się zapisać sceny.');
    }
  }

  function cancel() {
    setDraft(null);
    onClose();
  }

  const grid = scene.grid;
  return (
    <div className="scene-editor">
      <h3 className="panel-section-title">Edycja: {scene.name}</h3>

      <label className="auth-label" htmlFor="scene-name">
        Nazwa
      </label>
      <input
        id="scene-name"
        type="text"
        maxLength={64}
        value={scene.name}
        onChange={(e) => patchDraft({ name: e.target.value })}
      />

      <label className="auth-label">Mapa (tło)</label>
      <div className="scene-editor-row">
        <label className="small-button scene-upload-button">
          {uploading ? 'Wgrywanie…' : scene.background ? 'Zmień obraz' : 'Wgraj obraz'}
          <input
            type="file"
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            title={uploadRequirementText('map')}
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
            Usuń tło
          </button>
        )}
      </div>
      {scene.background && (
        <p className="auth-hint">
          {scene.background.width}×{scene.background.height} px
        </p>
      )}

      {/* Unlike every other field here, this one applies at once and is not
          part of the draft: changing what hides the map has to take concealed
          tokens away from the players — or hand them back — in the same
          operation, so it travels on its own event (`scene:visibility`)
          rather than through the scene patch. One setting rather than two
          switches, because „fog *and* walls" would give two independent
          sources of black and no way to tell which one is hiding the room. */}
      <label className="auth-label" htmlFor="scene-visibility">
        Widoczność dla graczy
      </label>
      <select
        id="scene-visibility"
        className="text-input"
        value={scene.visibility}
        onChange={(e) => void setSceneVisibility(scene.id, e.target.value as SceneVisibility)}
      >
        <option value="open">Pełna — wszyscy widzą całą mapę</option>
        <option value="fog">Ręczna mgła — odsłaniasz pędzlem</option>
        <option value="dynamic">Dynamiczna — ściany i pole widzenia</option>
      </select>
      <p className="auth-hint">
        {scene.visibility === 'open'
          ? 'Cała mapa widoczna dla graczy. Zmiana działa od razu, bez „Zapisz”.'
          : scene.visibility === 'fog'
            ? 'Scena startuje zakryta — odsłaniaj ją pędzlem z paska mapy. Namalowana mgła przeżywa zmianę trybu.'
            : 'Gracz widzi tylko to, co widzą jego tokeny. Narysuj ściany narzędziem „Ściany” (klawisz W); bez ścian widać całą mapę, a gracz bez tokenu — nic.'}
      </p>

      {/* Blokada ruchu graczy (zlecenie MG, 12.09). Działa od razu, jak dwie
          rzeczy nad nią i jedna pod — ale z innego powodu niż widoczność:
          tamta zabiera graczom figury z listy, a ta niczego nie zabiera i
          niczego nie pokazuje. Zmienia wyłącznie odpowiedź na pytanie „wolno
          mi tę figurę podnieść", więc jedzie zwykłą łatą sceny.

          Nowa scena wchodzi **zamknięta**: mapa dopiero budowana nie jest
          mapą, po której drużyna ma chodzić. */}
      <label className="auth-label">
        <input
          type="checkbox"
          checked={!scene.playerMoveLocked}
          onChange={(e) => void updateScene(scene.id, { playerMoveLocked: !e.target.checked })}
        />{' '}
        Ruch graczy po tej mapie
      </label>
      <p className="auth-hint">
        {scene.playerMoveLocked
          ? 'Zamknięta. Gracze widzą mapę, ale nie ruszą na niej żadną figurą — także własną. Odblokuj, gdy rozgrywka na tej scenie faktycznie się zaczyna.'
          : 'Otwarta. Gracze prowadzą własne figury. Zamknij, jeśli chcesz pokazać mapę, zanim drużyna zacznie ją zwiedzać na własną rękę.'}
        {' Ciebie blokada nie dotyczy nigdy. Zmiana działa od razu, bez „Zapisz”.'}
      </p>

      {/* Darkness only means something where sight comes from tokens, so the
          switch appears with the mode that asks them. It applies at once for the
          same reason the mode does: turning the lights out takes every token in
          an unlit spot away from the players (`scene:lighting`). */}
      {scene.visibility === 'dynamic' && (
        <>
          <label className="auth-label">
            <input
              type="checkbox"
              checked={scene.dark}
              onChange={(e) => void setSceneLighting(scene.id, { dark: e.target.checked })}
            />{' '}
            Ciemna scena — widać tylko to, co oświetlone
          </label>
          {scene.dark && (
            <>
              <label className="auth-label" htmlFor="scene-dark-sight">
                Widoczność po omacku: {formatMetres(scene.darkSightM)}
              </label>
              <div className="scene-editor-row">
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
                  min={0}
                  max={SCENE_DARK_SIGHT_MAX_M}
                  step={0.5}
                  value={scene.darkSightM}
                  onChange={(e) =>
                    void setSceneLighting(scene.id, { darkSightM: Number(e.target.value) })
                  }
                />
              </div>
              <p className="auth-hint">
                Ile token widzi bez żadnego światła. Domyślne 2 m to jedna kratka — dzięki temu
                czarny ekran nigdy nie czyta się jako awaria. Zero = całkowita ciemność. Lampy
                stawiaj narzędziem „Światła” (klawisz L), latarkę tokenu ustawisz w jego menu.
              </p>
            </>
          )}

          {/* The party's memory of the map (stage 18c). Applies at once like the
              two settings above, but for the opposite reason: it takes nothing
              away from anybody — a remembered room never showed who was in it —
              so it needs no token re-filter, only a repaint. */}
          <label className="auth-label">
            <input
              type="checkbox"
              checked={scene.explore}
              onChange={(e) => void setSceneExplore(scene.id, e.target.checked)}
            />{' '}
            Pamięć eksploracji — zwiedzone zostaje na planie
          </label>
          <p className="auth-hint">
            Obszar raz zobaczony zostaje narysowany przyciemniony — sama mapa, bez tokenów. W
            ciemnej scenie zapamiętuje się tylko to, co było oświetlone, więc korytarz przejdzie do
            pamięci pasem szerokości latarki.
          </p>
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => void forgetExploration(scene.id)}
            disabled={!scene.explore}
          >
            Zapomnij eksplorację
          </button>
        </>
      )}

      <label className="auth-label">
        <input
          type="checkbox"
          checked={scene.gridMode === 'grid'}
          onChange={(e) => patchDraft({ gridMode: e.target.checked ? 'grid' : 'gridless' })}
        />{' '}
        Siatka włączona (tryb grid)
      </label>

      {scene.gridMode === 'grid' && (
        <>
          <label className="auth-label" htmlFor="grid-size">
            Rozmiar kratki: {formatDecimal(grid.sizePx, 1)} px
          </label>
          <div className="scene-editor-row">
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
              min={GRID_SIZE_MIN}
              max={GRID_SIZE_MAX}
              step="any"
              value={Math.round(grid.sizePx * 10) / 10}
              onChange={(e) => patchDraft({ grid: { sizePx: Number(e.target.value) } })}
            />
          </div>

          {scene.background && (
            <GridColumnsField
              imageWidth={scene.background.width}
              imageHeight={scene.background.height}
              sizePx={grid.sizePx}
              onSize={(sizePx) => patchDraft({ grid: { sizePx } })}
            />
          )}

          <label className="auth-label" htmlFor="grid-offset-x">
            Offset X: {Math.round(grid.offsetX)} px
          </label>
          <input
            id="grid-offset-x"
            type="range"
            min={0}
            max={Math.max(1, Math.round(grid.sizePx) - 1)}
            step={1}
            value={grid.offsetX}
            onChange={(e) => patchDraft({ grid: { offsetX: Number(e.target.value) } })}
          />
          <label className="auth-label" htmlFor="grid-offset-y">
            Offset Y: {Math.round(grid.offsetY)} px
          </label>
          <input
            id="grid-offset-y"
            type="range"
            min={0}
            max={Math.max(1, Math.round(grid.sizePx) - 1)}
            step={1}
            value={grid.offsetY}
            onChange={(e) => patchDraft({ grid: { offsetY: Number(e.target.value) } })}
          />

          <div className="scene-editor-row">
            <label className="auth-label" htmlFor="grid-color">
              Kolor
            </label>
            <input
              id="grid-color"
              type="color"
              value={grid.color}
              onChange={(e) => patchDraft({ grid: { color: e.target.value } })}
            />
            <label className="auth-label" htmlFor="grid-alpha">
              Krycie: {Math.round(grid.alpha * 100)}%
            </label>
            <input
              id="grid-alpha"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={grid.alpha}
              onChange={(e) => patchDraft({ grid: { alpha: Number(e.target.value) } })}
            />
          </div>

          <label className="auth-label">
            <input
              type="checkbox"
              checked={grid.visible}
              onChange={(e) => patchDraft({ grid: { visible: e.target.checked } })}
            />{' '}
            Siatka widoczna
          </label>

          <label className="auth-label" htmlFor="meters-per-square">
            Kratka = ile metrów (CP RED: 2 m)
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
        </>
      )}

      {error && <p className="auth-error">{error}</p>}
      <div className="scene-editor-row">
        <button
          className="primary-button"
          type="button"
          onClick={() => void save()}
          disabled={saving || !draft}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz'}
        </button>
        <button type="button" className="small-button" onClick={cancel}>
          {draft ? 'Anuluj zmiany' : 'Zamknij'}
        </button>
      </div>
    </div>
  );
}

export function ScenePanel() {
  const scenes = useSceneStore((s) => s.scenes);
  const viewedId = useSceneStore((s) => s.scene?.id ?? null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    const ack = await createScene(trimmed);
    if (ack.ok && ack.data) {
      setNewName('');
      await viewScene(ack.data.id);
      setEditing(true);
    }
  }

  async function edit(sceneId: string) {
    if (sceneId !== viewedId) {
      const ack = await viewScene(sceneId);
      if (!ack.ok) return;
    }
    setEditing(true);
  }

  return (
    <div className="scene-panel">
      <ul className="scene-list">
        {scenes.length === 0 && (
          <p className="placeholder-text">Brak scen — utwórz pierwszą poniżej.</p>
        )}
        {scenes.map((scene) => (
          <SceneRow
            key={scene.id}
            scene={scene}
            isViewed={scene.id === viewedId}
            onEdit={(id) => void edit(id)}
          />
        ))}
      </ul>

      <form className="scene-create-form" onSubmit={(e) => void create(e)}>
        <input
          type="text"
          maxLength={64}
          placeholder="Nazwa nowej sceny"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="primary-button" type="submit" disabled={newName.trim().length === 0}>
          Utwórz
        </button>
      </form>

      {editing && <SceneEditor onClose={() => setEditing(false)} />}
    </div>
  );
}
