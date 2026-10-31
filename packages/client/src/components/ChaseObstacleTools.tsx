import { useEffect, useState } from 'react';
import {
  CHASE_OBSTACLE_HP_MAX,
  CHASE_OBSTACLE_KINDS,
  CHASE_OBSTACLE_NAME_MAX,
  CHASE_OBSTACLE_PRESETS,
  ROLE_GM,
  type ChaseObstacleKind,
  type TokenAssetView,
} from '@vtt/shared';
import { apiGet } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChaseStore } from '../stores/chaseStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { IconRoadBarrier } from './MapIcons.js';

/**
 * Przeszkody i ruch uliczny (etap 65e) — przycisk na pasku narzędzi MG, tylko
 * na scenie pościgu. Rząd z rodzajami „bierze przeszkodę do ręki”, a klik
 * w drogę wypuszcza ją przy przedniej krawędzi na pasie pod kursorem
 * (`MapArea`). Poza walką nie ma rund, więc przeszkoda by nie jechała —
 * przycisk jest wtedy wyszarzony z podpowiedzią.
 */

const OFF_COMBAT_HINT =
  'Przeszkody — tylko w walce: poza nią nie ma rund, więc droga ich nie przesuwa';

function useObstacleToolsShown(): boolean {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const chase = useSceneStore((s) => s.effectiveScene?.kind === 'chase');
  return isGm && chase;
}

export function ChaseObstacleButton() {
  const shown = useObstacleToolsShown();
  const inCombat = useCombatStore((s) => s.combat !== null);
  const palette = useChaseStore((s) => s.palette);
  const armed = useChaseStore((s) => s.armed);
  const setPalette = useChaseStore((s) => s.setPalette);
  if (!shown) return null;
  return (
    <button
      type="button"
      className={`map-tool${palette || armed ? ' map-tool--active' : ''}`}
      title={
        inCombat
          ? 'Przeszkody — wybierz rodzaj i kliknij drogę: przeszkoda wjedzie przy przedniej krawędzi na tym pasie'
          : OFF_COMBAT_HINT
      }
      aria-label="Przeszkody"
      aria-pressed={palette || armed !== null}
      disabled={!inCombat}
      onClick={() => setPalette(!palette)}
    >
      <IconRoadBarrier />
    </button>
  );
}

export function ChaseObstaclePalette() {
  const shown = useObstacleToolsShown();
  const inCombat = useCombatStore((s) => s.combat !== null);
  const palette = useChaseStore((s) => s.palette);
  const armed = useChaseStore((s) => s.armed);
  const arm = useChaseStore((s) => s.arm);
  const [name, setName] = useState('');
  const [hp, setHp] = useState<number>(CHASE_OBSTACLE_PRESETS.custom.hp);
  const [imageUrl, setImageUrl] = useState('');
  const [assets, setAssets] = useState<TokenAssetView[] | null>(null);
  const custom = armed?.kind === 'custom';
  // Grafika własnej przeszkody z biblioteki „Grafik” — pobierana dopiero wtedy.
  useEffect(() => {
    if (!custom || assets) return;
    let live = true;
    apiGet<TokenAssetView[]>('/api/token-assets')
      .then((rows) => live && setAssets(rows))
      .catch(() => live && setAssets([]));
    return () => {
      live = false;
    };
  }, [custom, assets]);
  // Esc odkłada przeszkodę z ręki, jak żeton.
  useEffect(() => {
    if (!armed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') arm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, arm]);
  // Koniec walki albo zejście ze sceny pościgu odkłada przeszkodę z ręki.
  useEffect(() => {
    if ((!shown || !inCombat) && armed) arm(null);
  }, [shown, inCombat, armed, arm]);
  if (!shown || !inCombat || !palette) return null;
  const armCustom = (next: { name?: string; hp?: number; imageUrl?: string }) => {
    const label = (next.name ?? name).trim();
    const image = next.imageUrl ?? imageUrl;
    arm({
      kind: 'custom',
      hp: next.hp ?? hp,
      ...(label ? { name: label } : {}),
      ...(image ? { imageUrl: image } : {}),
    });
  };
  const pick = (kind: ChaseObstacleKind) => {
    if (armed?.kind === kind) {
      arm(null);
      return;
    }
    if (kind === 'custom') armCustom({});
    else arm({ kind });
  };
  return (
    <div className="map-tool-options" role="group" aria-label="Rodzaj przeszkody">
      {CHASE_OBSTACLE_KINDS.map((kind) => {
        const preset = CHASE_OBSTACLE_PRESETS[kind];
        return (
          <button
            key={kind}
            type="button"
            className={`map-tool map-tool--text${armed?.kind === kind ? ' map-tool--active' : ''}`}
            aria-pressed={armed?.kind === kind}
            title={
              kind === 'spikes'
                ? 'Kolczatka — kto po niej przejedzie, rzuca Prowadzenie PT 17 albo bierze 4k6 w słaby punkt. Kliknij drogę (Esc anuluje)'
                : `${preset.label} — ${preset.hp} PW. Kierowca, przed którym stanie, wybiera Gwałtowny skręt albo taranowanie. Kliknij drogę (Esc anuluje)`
            }
            onClick={() => pick(kind)}
          >
            {preset.label}
          </button>
        );
      })}
      {armed?.kind === 'custom' && (
        <>
          <input
            type="text"
            className="map-tool-text"
            maxLength={CHASE_OBSTACLE_NAME_MAX}
            placeholder="nazwa"
            value={name}
            aria-label="Nazwa własnej przeszkody"
            onChange={(event) => {
              setName(event.target.value);
              armCustom({ name: event.target.value });
            }}
          />
          <label
            className="map-tool-slider"
            title="PW przeszkody — tyle przyjmie przy taranowaniu, zanim się rozbije"
          >
            <span className="map-tool-hint">PW</span>
            <input
              type="number"
              className="map-tool-number"
              min={0}
              max={CHASE_OBSTACLE_HP_MAX}
              step={1}
              value={hp}
              aria-label="PW własnej przeszkody"
              onChange={(event) => {
                const next = Number.isFinite(event.target.valueAsNumber)
                  ? Math.max(
                      0,
                      Math.min(CHASE_OBSTACLE_HP_MAX, Math.round(event.target.valueAsNumber)),
                    )
                  : 0;
                setHp(next);
                armCustom({ hp: next });
              }}
            />
          </label>
          <select
            className="map-tool-select"
            value={imageUrl}
            aria-label="Grafika własnej przeszkody"
            title="Grafika z zakładki „Grafiki” — bez niej przeszkoda to bryła w pasy"
            onChange={(event) => {
              setImageUrl(event.target.value);
              armCustom({ imageUrl: event.target.value });
            }}
          >
            <option value="">bez grafiki</option>
            {(assets ?? []).map((asset) => (
              <option key={asset.id} value={asset.url}>
                {asset.name}
              </option>
            ))}
          </select>
        </>
      )}
      <span className="map-tool-hint">klik w drogę — przy przedniej krawędzi</span>
    </div>
  );
}
