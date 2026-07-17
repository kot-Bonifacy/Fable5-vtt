import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { MapUploadResult, SceneSummary } from '@vtt/shared';
import { GRID_SIZE_MAX, GRID_SIZE_MIN } from '@vtt/shared';
import { apiUpload, ApiError } from '../api.js';
import { activateScene, createScene, deleteScene, updateScene, viewScene } from '../socket.js';
import { useSceneStore } from '../stores/sceneStore.js';

function uploadErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  switch (code) {
    case 'FILE_TOO_LARGE':
      return 'Plik jest za duży (limit 40 MB).';
    case 'UNSUPPORTED_IMAGE':
      return 'Nieobsługiwany format — użyj PNG, JPG lub WebP.';
    case 'IMAGE_TOO_LARGE':
      return 'Obraz jest za duży (maks. 16384 px na bok).';
    default:
      return 'Nie udało się wgrać pliku.';
  }
}

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
    if (!window.confirm(`Usunąć scenę „${scene.name}”?`)) return;
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
    setUploading(true);
    setError(null);
    try {
      const result = await apiUpload<MapUploadResult>('/api/uploads/maps', file);
      // Mirror the server default: a new map defines the playable area.
      patchDraft({ background: result, width: result.width, height: result.height });
    } catch (err) {
      setError(uploadErrorText(err));
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
            accept="image/png,image/jpeg,image/webp"
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
            Rozmiar kratki: {Math.round(grid.sizePx)} px
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
            <input
              type="number"
              className="scene-number-input"
              min={GRID_SIZE_MIN}
              max={GRID_SIZE_MAX}
              value={Math.round(grid.sizePx)}
              onChange={(e) => patchDraft({ grid: { sizePx: Number(e.target.value) } })}
            />
          </div>

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
        <button type="button" onClick={() => void save()} disabled={saving || !draft}>
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
        <button type="submit" disabled={newName.trim().length === 0}>
          Utwórz
        </button>
      </form>

      {editing && <SceneEditor onClose={() => setEditing(false)} />}
    </div>
  );
}
