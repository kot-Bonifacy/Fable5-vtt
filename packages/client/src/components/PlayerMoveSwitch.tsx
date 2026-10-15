import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerMoveMode, SceneView, TokenView } from '@vtt/shared';
import { isTokenInFog } from '@vtt/shared';
import { resetFog, setSceneVisibility, updateScene } from '../socket.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useCharacterStore, type CharacterSheetView } from '../stores/characterStore.js';
import { PLAYER_MOVE_MODES } from '../map/player-move.js';

/**
 * „Ruch graczy: Stop / Eksploracja” w górnym pasku MG (etap 45; od 52 bez
 * „Swobodnego”).
 *
 * Do etapu 45 o ruchu drużyny decydował checkbox schowany w edytorze sceny
 * i cztery inne bramki, o których MG nie wiedział. Teraz stan sceny, którą MG
 * ogląda, stoi na widoku obok „Włącz tryb turowy”, a znaczek obok mówi, czemu
 * drużyna mimo to nie pójdzie — bo przełącznik na „Eksploracja” nic nie da, gdy
 * figury gracza nie ma na tej scenie albo stoi w czerni ręcznej mgły.
 */

type Issue =
  { kind: 'no-token'; key: string; text: string } | { kind: 'in-fog'; key: string; text: string };

/** Czemu drużyna nie chodzi po tej scenie — wyłącznie z tego, co MG ma w ręku. */
function partyMoveIssues(
  scene: SceneView,
  tokens: TokenView[],
  characters: CharacterSheetView[],
  fog: ReturnType<typeof useFogStore.getState>['fog'],
): Issue[] {
  const issues: Issue[] = [];
  for (const card of characters) {
    if (!card.ownerId || !card.playReady) continue;
    const placed = tokens.some((token) => token.characterId === card.id);
    if (!placed) {
      issues.push({
        kind: 'no-token',
        key: `card-${card.id}`,
        text: `„${card.name}” nie ma figury na tej scenie.`,
      });
    }
  }
  if (scene.visibility === 'fog' && fog?.enabled && fog.sceneId === scene.id) {
    for (const token of tokens) {
      if (token.ownerId === null || token.hidden) continue;
      if (isTokenInFog(token, scene, fog)) {
        issues.push({
          kind: 'in-fog',
          key: `fog-${token.id}`,
          text: `„${token.name}” stoi w czerni ręcznej mgły — gracz chodzi tylko po odsłoniętym.`,
        });
      }
    }
  }
  return issues;
}

export function PlayerMoveSwitch() {
  const scene = useSceneStore((s) => s.scene);
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  const fog = useFogStore((s) => s.fog);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const issues = useMemo(
    () =>
      scene
        ? partyMoveIssues(
            scene,
            Object.values(tokens).filter((token) => token.sceneId === scene.id),
            Object.values(characters),
            fog,
          )
        : [],
    [scene, tokens, characters, fog],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (issues.length === 0) setOpen(false);
  }, [issues.length]);

  if (!scene) return null;
  const current = scene.playerMove;
  const inFog = issues.some((issue) => issue.kind === 'in-fog');

  function pick(mode: PlayerMoveMode) {
    if (!scene || mode === current) return;
    void updateScene(scene.id, { playerMove: mode });
  }

  return (
    <div className="player-move" ref={boxRef}>
      <div className="player-move-switch" role="radiogroup" aria-label="Ruch graczy">
        <span className="player-move-label" aria-hidden>
          Ruch graczy
        </span>
        {PLAYER_MOVE_MODES.map((entry) => (
          <button
            key={entry.mode}
            type="button"
            role="radio"
            aria-checked={entry.mode === current}
            className={`player-move-option player-move-option--${entry.mode}${
              entry.mode === current ? ' is-active' : ''
            }`}
            title={entry.hint}
            onClick={() => pick(entry.mode)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {issues.length > 0 && (
        <button
          type="button"
          className="player-move-issues"
          aria-expanded={open}
          title="Czemu drużyna może nie chodzić po tej scenie"
          onClick={() => setOpen((value) => !value)}
        >
          ⚠ {issues.length}
        </button>
      )}
      {open && issues.length > 0 && (
        <div className="player-move-popover" role="dialog" aria-label="Czemu drużyna nie chodzi">
          <ul>
            {issues.map((issue) => (
              <li key={issue.key}>{issue.text}</li>
            ))}
          </ul>
          {inFog && (
            <div className="player-move-popover-actions">
              <button type="button" onClick={() => void resetFog(scene.id, 'reveal')}>
                Odsłoń całą mapę
              </button>
              <button type="button" onClick={() => void setSceneVisibility(scene.id, 'dynamic')}>
                Przełącz na Dynamiczną
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
