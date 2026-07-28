import { useEffect } from 'react';
import { FOG_BRUSH_MAX_RADIUS, FOG_BRUSH_MIN_RADIUS, ROLE_GM } from '@vtt/shared';
import { useAttackStore } from '../stores/attackStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { resetFog, toggleFog, undoFog } from '../socket.js';
import {
  IconBrush,
  IconCloud,
  IconCoverAll,
  IconEye,
  IconEyeOff,
  IconFog,
  IconMoon,
  IconPin,
  IconRangeRings,
  IconRect,
  IconRevealAll,
  IconRuler,
  IconSun,
  IconUndo,
} from './MapIcons.js';

/**
 * The map's own toolbar (stages 16–17a): tool selection plus the settings of
 * whichever tool is armed. It deliberately holds no game logic — every button
 * flips a store flag the renderer reads, or sends one GM intent.
 *
 * The buttons carry no chrome: an icon that lights up in the accent colour
 * reads faster than the same icon inside a box that also changes colour, and
 * it keeps the map underneath visible. Contrast over a bright map comes from
 * the icons' own drop shadow (see `.map-tool` in styles.css), and the hit area
 * stays a comfortable square regardless of how small the glyph draws.
 */
export function MapTools() {
  const tool = useMapToolStore((s) => s.tool);
  const toggleTool = useMapToolStore((s) => s.toggleTool);
  const fogMode = useMapToolStore((s) => s.fogMode);
  const setFogMode = useMapToolStore((s) => s.setFogMode);
  const fogShape = useMapToolStore((s) => s.fogShape);
  const setFogShape = useMapToolStore((s) => s.setFogShape);
  const fogRadius = useMapToolStore((s) => s.fogRadius);
  const setFogRadius = useMapToolStore((s) => s.setFogRadius);
  const privateMode = useRulerStore((s) => s.privateMode);
  const setPrivateMode = useRulerStore((s) => s.setPrivateMode);
  const overlay = useAttackStore((s) => s.overlay);
  const setOverlay = useAttackStore((s) => s.setOverlay);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const fogEnabled = useFogStore((s) => s.fog?.enabled ?? false);
  const hasShapes = useFogStore((s) => (s.fog?.shapes.length ?? 0) > 0);

  // Switching fog off mid-session must put the brush away too — otherwise the
  // settings row lingers next to a disabled tool button, and a stray drag
  // would store shapes nobody can see.
  const setTool = useMapToolStore((s) => s.setTool);
  useEffect(() => {
    if (!fogEnabled && tool === 'fog') setTool('pointer');
  }, [fogEnabled, tool, setTool]);

  return (
    <div className="map-tools" role="toolbar" aria-label="Narzędzia mapy">
      <button
        type="button"
        className={`map-tool${tool === 'ruler' ? ' map-tool--active' : ''}`}
        title="Linijka (M) — przeciągnij po mapie, Spacja dokłada załamanie, Esc kończy"
        aria-pressed={tool === 'ruler'}
        onClick={() => toggleTool('ruler')}
      >
        <IconRuler />
      </button>
      {isGm && (
        <button
          type="button"
          className={`map-tool${privateMode ? ' map-tool--active map-tool--warn' : ''}`}
          title={
            privateMode
              ? 'Pomiar prywatny: gracze nie widzą twojej linijki'
              : 'Pomiar widoczny dla wszystkich przy stole'
          }
          aria-pressed={privateMode}
          onClick={() => setPrivateMode(!privateMode)}
        >
          {privateMode ? <IconEyeOff /> : <IconEye />}
        </button>
      )}

      {isGm && (
        <>
          <span className="map-tools-sep" aria-hidden />
          <button
            type="button"
            className={`map-tool${tool === 'fog' ? ' map-tool--active' : ''}`}
            title={
              fogEnabled
                ? 'Mgła wojny (F) — przeciągnij, by odsłonić lub zakryć'
                : 'Mgła wyłączona na tej scenie — włącz ją przełącznikiem obok'
            }
            aria-pressed={tool === 'fog'}
            disabled={!fogEnabled}
            onClick={() => toggleTool('fog')}
          >
            <IconFog />
          </button>
          <button
            type="button"
            className={`map-tool${fogEnabled ? ' map-tool--night' : ' map-tool--day'}`}
            title={
              fogEnabled
                ? 'Mgła włączona na tej scenie — kliknij, by wyłączyć (cała mapa widoczna)'
                : 'Mgła wyłączona — kliknij, by włączyć (odsłonięte fragmenty wracają)'
            }
            aria-pressed={fogEnabled}
            disabled={!sceneId}
            onClick={() => sceneId && void toggleFog(sceneId, !fogEnabled)}
          >
            {fogEnabled ? <IconMoon /> : <IconSun />}
          </button>
          <button
            type="button"
            className={`map-tool${tool === 'note' ? ' map-tool--active' : ''}`}
            title="Notatka MG (N) — kliknij na mapie, by wbić pinezkę (gracze jej nie widzą)"
            aria-pressed={tool === 'note'}
            onClick={() => toggleTool('note')}
          >
            <IconPin />
          </button>
        </>
      )}

      {overlay && (
        <button
          type="button"
          className="map-tool map-tool--active"
          title={`Pierścienie zasięgu: ${overlay.weaponName}${
            overlay.autofire ? ' (ogień ciągły)' : ''
          } — kliknij, by schować`}
          onClick={() => setOverlay(null)}
        >
          <IconRangeRings />
        </button>
      )}

      {isGm && tool === 'fog' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia mgły">
          <button
            type="button"
            className={`map-tool${fogMode === 'reveal' ? ' map-tool--active' : ''}`}
            title="Odsłanianie mapy"
            aria-pressed={fogMode === 'reveal'}
            onClick={() => setFogMode('reveal')}
          >
            <IconSun />
          </button>
          <button
            type="button"
            className={`map-tool${fogMode === 'hide' ? ' map-tool--active' : ''}`}
            title="Zakrywanie z powrotem"
            aria-pressed={fogMode === 'hide'}
            onClick={() => setFogMode('hide')}
          >
            <IconCloud />
          </button>
          <span className="map-tools-sep" aria-hidden />
          <button
            type="button"
            className={`map-tool${fogShape === 'brush' ? ' map-tool--active' : ''}`}
            title="Pędzel — maluj ruchem myszy"
            aria-pressed={fogShape === 'brush'}
            onClick={() => setFogShape('brush')}
          >
            <IconBrush />
          </button>
          <button
            type="button"
            className={`map-tool${fogShape === 'rect' ? ' map-tool--active' : ''}`}
            title="Prostokąt — przeciągnij, by objąć pomieszczenie"
            aria-pressed={fogShape === 'rect'}
            onClick={() => setFogShape('rect')}
          >
            <IconRect />
          </button>
          {fogShape === 'brush' && (
            <label className="map-tool-slider" title="Promień pędzla">
              <input
                type="range"
                min={FOG_BRUSH_MIN_RADIUS}
                max={Math.min(FOG_BRUSH_MAX_RADIUS, 600)}
                step={4}
                value={fogRadius}
                onChange={(event) => setFogRadius(Number(event.target.value))}
                aria-label="Promień pędzla mgły"
              />
              <span>{fogRadius}</span>
            </label>
          )}
          <span className="map-tools-sep" aria-hidden />
          <button
            type="button"
            className="map-tool"
            title="Cofnij ostatnie pociągnięcie"
            disabled={!sceneId || !hasShapes}
            onClick={() => sceneId && void undoFog(sceneId)}
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="map-tool"
            title="Odsłoń całą mapę"
            disabled={!sceneId}
            onClick={() => sceneId && void resetFog(sceneId, 'reveal')}
          >
            <IconRevealAll />
          </button>
          <button
            type="button"
            className="map-tool"
            title="Zakryj całą mapę"
            disabled={!sceneId}
            onClick={() => sceneId && void resetFog(sceneId, 'hide')}
          >
            <IconCoverAll />
          </button>
        </div>
      )}
    </div>
  );
}
