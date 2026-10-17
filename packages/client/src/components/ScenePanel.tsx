import { useEffect, useState, type FormEvent } from 'react';
import type { SceneSummary } from '@vtt/shared';
import { confirmDestructive } from '../confirm.js';
import { noteAck } from '../notices.js';
import { readinessKey } from '../session-readiness.js';
import { activateScene, createScene, deleteScene, viewScene } from '../socket.js';
import { useChatStore } from '../stores/chatStore.js';
import { useSceneStore } from '../stores/sceneStore.js';

/** Ile sekund „Bez miejsca startu — aktywuj?” czeka na drugie kliknięcie. */
const CONFIRM_MS = 5000;

function SceneRow({
  scene,
  isViewed,
  onEdit,
}: {
  scene: SceneSummary;
  isViewed: boolean;
  onEdit: (sceneId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // W trakcie sesji aktywacja przenosi graczy od razu (15.10): scena bez
  // miejsca startu stawia ich figury na środku mapy, więc pytamy drugim
  // kliknięciem, jak „Zakończ sesję”. W przygotowaniu brak stoi w „Czeka na MG”.
  const live = useChatStore((s) => (s.campaign?.sessionStartedAt ?? null) !== null);
  const warn = live && !scene.hasSpawn;

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  function activate() {
    if (warn && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void activateScene(scene.id);
  }

  async function remove() {
    if (!confirmDestructive(`Usunąć scenę „${scene.name}”?`)) return;
    const ack = await deleteScene(scene.id);
    noteAck('scene', ack, (code) =>
      code === 'SCENE_ACTIVE' ? 'Najpierw aktywuj inną scenę.' : 'Błąd usuwania.',
    );
  }

  return (
    <li
      className={`scene-row ${isViewed ? 'scene-row--viewed' : ''}`}
      data-attention={scene.active && !scene.hasSpawn ? readinessKey.spawn(scene.id) : undefined}
    >
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
              className={`small-button${confirming ? ' session-end--confirm' : ''}`}
              onClick={activate}
              title={
                warn
                  ? 'Ta scena nie ma miejsca startu — figury graczy staną na środku mapy'
                  : undefined
              }
            >
              {confirming ? 'Bez startu — aktywuj?' : 'Aktywuj'}
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
    </li>
  );
}

export function ScenePanel() {
  const scenes = useSceneStore((s) => s.scenes);
  const viewedId = useSceneStore((s) => s.scene?.id ?? null);
  const [newName, setNewName] = useState('');
  // Edycja sceny to osobne okno (`SceneConfigWindow`, 15.10) — panel je tylko otwiera.
  const setEditorOpen = useSceneStore((s) => s.setEditorOpen);

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    const ack = await createScene(trimmed);
    if (ack.ok && ack.data) {
      setNewName('');
      await viewScene(ack.data.id);
      setEditorOpen(true);
    }
  }

  async function edit(sceneId: string) {
    if (sceneId !== viewedId) {
      const ack = await viewScene(sceneId);
      if (!ack.ok) return;
    }
    setEditorOpen(true);
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
    </div>
  );
}
