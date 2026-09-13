import { useState } from 'react';
import { WALL_KINDS, isOpening, metresBetween, type WallKind, type WallView } from '@vtt/shared';
import { toggleOpening, updateWall } from '../socket.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { wallErrorText } from '../mapErrors.js';

/**
 * Karta ściany, drzwi i okna (etap 27l).
 *
 * Zastępuje tryby `lock` i `share` paska ścian, które były ostatnim śladem
 * gramatyki „tryb wewnątrz narzędzia" po 27k — i zamyka ślad, który etap 18d
 * zostawił w kodzie komentarzem w `MapArea.tsx`: przełącznik oka na pasku
 * dotyczył **nowych** otworów, więc okno postawione z domyślnym „tylko dla MG"
 * trzeba było skasować i postawić od nowa.
 *
 * Rodzaj jest pierwszy, bo to on decyduje, czy reszta karty w ogóle istnieje:
 * zwykła ściana nie ma zamka ani klamki, a serwer i tak zetrze jej te pola
 * przy retypowaniu (`wall:update`).
 */

const KIND_LABELS: Record<WallKind, string> = {
  wall: 'Ściana',
  door: 'Drzwi',
  window: 'Okno',
  barrier: 'Bariera',
  gate: 'Brama',
};

const KIND_HINTS: Record<WallKind, string> = {
  wall: 'Zasłania zawsze — nie da się jej otworzyć',
  door: 'Zamknięte zasłaniają; otwarte są dziurą w ścianie',
  window: 'Zamknięte zasłaniają z daleka i przyciemniają światło; otwarte nie robią nic',
  barrier: 'Nie zasłania widoku ani światła; nie da się przez nią przejść ani sięgnąć wręcz',
  gate: 'Nie zasłania w żadnym stanie; zamknięta blokuje przejście i wręcz, otwarta nic',
};

export function SceneCardWall({ wall }: { wall: WallView }) {
  const scene = useSceneStore((s) => s.effectiveScene);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const opening = isOpening(wall);
  const metres = scene
    ? metresBetween({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }, scene)
    : null;

  async function patch(next: Parameters<typeof updateWall>[1]) {
    setBusy(true);
    const ack = await updateWall(wall.id, next);
    setBusy(false);
    setError(ack.ok ? null : wallErrorText(ack.error));
  }

  async function toggle() {
    setBusy(true);
    const ack = await toggleOpening(wall.id);
    setBusy(false);
    setError(ack.ok ? null : wallErrorText(ack.error));
  }

  return (
    <div className="scene-card-form">
      <fieldset className="bot-field">
        <legend className="auth-label">Rodzaj</legend>
        <div className="scene-card-choice" role="group" aria-label="Rodzaj przegrody">
          {WALL_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`small-button${wall.kind === kind ? ' small-button--on' : ''}`}
              aria-pressed={wall.kind === kind}
              title={KIND_HINTS[kind]}
              disabled={busy}
              onClick={() => void patch({ kind })}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="placeholder-text">
        {KIND_HINTS[wall.kind]}
        {metres !== null ? ` · długość ${metres.toFixed(1).replace('.', ',')} m` : ''}
      </p>

      {opening && (
        <>
          <label className="bot-checkbox">
            <input
              type="checkbox"
              checked={wall.playerToggle}
              disabled={busy}
              onChange={(event) => void patch({ playerToggle: event.target.checked })}
            />
            Gracze mogą otwierać
          </label>
          <p className="placeholder-text">
            {wall.playerToggle
              ? 'Gracz widzi klamkę i sięga po nią z odległości ramienia.'
              : 'Otwór jest twój: gracze go nie dostają, dopóki tego nie odklikniesz.'}
          </p>

          <div className="net-generator-foot">
            <button
              type="button"
              className="small-button"
              title={
                wall.kind === 'gate'
                  ? wall.open
                    ? 'Zamknij — znów blokuje przejście'
                    : 'Otwórz — przestaje blokować przejście'
                  : wall.open
                    ? 'Zamknij — znów zasłania'
                    : 'Otwórz — przestaje zasłaniać i przepuszcza światło'
              }
              disabled={busy || wall.locked}
              onClick={() => void toggle()}
            >
              {wall.open ? 'Zamknij' : 'Otwórz'}
            </button>
            <button
              type="button"
              className={`small-button${wall.locked ? ' small-button--on' : ''}`}
              aria-pressed={wall.locked}
              title={
                wall.locked
                  ? 'Zdejmij rygiel — gracz znów otworzy to ręką'
                  : 'Zaryglowany otwór nie ustępuje; gracz dowiaduje się o tym dopiero za klamkę'
              }
              disabled={busy}
              onClick={() => void patch({ locked: !wall.locked })}
            >
              {wall.locked ? '🔒 Zaryglowane' : '🔓 Bez rygla'}
            </button>
          </div>
        </>
      )}

      {error && <p className="ai-status-error">{error}</p>}
    </div>
  );
}
