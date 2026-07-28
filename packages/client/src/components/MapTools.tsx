import { useEffect, useMemo } from 'react';
import {
  DRAWING_COLORS,
  DRAWING_MAX_FONT_SIZE,
  DRAWING_MAX_WIDTH,
  DRAWING_MIN_FONT_SIZE,
  DRAWING_MIN_WIDTH,
  FOG_BRUSH_MAX_RADIUS,
  FOG_BRUSH_MIN_RADIUS,
  ROLE_GM,
} from '@vtt/shared';
import { useAttackStore } from '../stores/attackStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useDrawingStore } from '../stores/drawingStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { clearDrawings, deleteDrawing, resetFog, undoFog } from '../socket.js';
import {
  IconBrush,
  IconCloud,
  IconCoverAll,
  IconEllipse,
  IconEraser,
  IconEye,
  IconEyeOff,
  IconFill,
  IconFog,
  IconLine,
  IconPencil,
  IconPin,
  IconRangeRings,
  IconRect,
  IconRectSolid,
  IconRevealAll,
  IconRuler,
  IconSun,
  IconText,
  IconTrash,
  IconTrashAll,
  IconUndo,
} from './MapIcons.js';

/**
 * The map's own toolbar (stages 16–17b): tool selection plus the settings of
 * whichever tool is armed. It deliberately holds no game logic — every button
 * flips a store flag the renderer reads, or sends one intent.
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
  const drawTool = useMapToolStore((s) => s.drawTool);
  const setDrawTool = useMapToolStore((s) => s.setDrawTool);
  const drawColor = useMapToolStore((s) => s.drawColor);
  const setDrawColor = useMapToolStore((s) => s.setDrawColor);
  const drawWidth = useMapToolStore((s) => s.drawWidth);
  const setDrawWidth = useMapToolStore((s) => s.setDrawWidth);
  const drawFilled = useMapToolStore((s) => s.drawFilled);
  const setDrawFilled = useMapToolStore((s) => s.setDrawFilled);
  const drawFontSize = useMapToolStore((s) => s.drawFontSize);
  const setDrawFontSize = useMapToolStore((s) => s.setDrawFontSize);
  const drawGmOnly = useMapToolStore((s) => s.drawGmOnly);
  const setDrawGmOnly = useMapToolStore((s) => s.setDrawGmOnly);
  const privateMode = useRulerStore((s) => s.privateMode);
  const setPrivateMode = useRulerStore((s) => s.setPrivateMode);
  const overlay = useAttackStore((s) => s.overlay);
  const setOverlay = useAttackStore((s) => s.setOverlay);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const fogEnabled = useFogStore((s) => s.fog?.enabled ?? false);
  const hasShapes = useFogStore((s) => (s.fog?.shapes.length ?? 0) > 0);
  const drawings = useDrawingStore((s) => s.drawings);

  // Switching fog off mid-session must put the brush away too — otherwise the
  // settings row lingers next to a disabled tool button, and a stray drag
  // would store shapes nobody can see.
  const setTool = useMapToolStore((s) => s.setTool);
  useEffect(() => {
    if (!fogEnabled && tool === 'fog') setTool('pointer');
  }, [fogEnabled, tool, setTool]);

  /** My newest drawing on this scene — what „cofnij" takes back. */
  const myNewest = useMemo(() => {
    let newest: { id: number } | null = null;
    for (const drawing of Object.values(drawings)) {
      if (drawing.sceneId !== sceneId || drawing.authorId !== myUserId) continue;
      if (!newest || drawing.id > newest.id) newest = drawing;
    }
    return newest;
  }, [drawings, sceneId, myUserId]);

  const anyDrawings = useMemo(
    () => Object.values(drawings).some((drawing) => drawing.sceneId === sceneId),
    [drawings, sceneId],
  );

  const drawingButtons = (
    <>
      <button
        type="button"
        className="map-tool"
        title="Cofnij mój ostatni rysunek"
        disabled={!myNewest}
        onClick={() => myNewest && void deleteDrawing(myNewest.id)}
      >
        <IconUndo />
      </button>
      <button
        type="button"
        className="map-tool"
        title="Usuń wszystkie moje rysunki z tej sceny"
        disabled={!sceneId || !myNewest}
        onClick={() => sceneId && void clearDrawings(sceneId, 'mine')}
      >
        <IconTrash />
      </button>
      {isGm && (
        <button
          type="button"
          className="map-tool map-tool--warn"
          title="Usuń wszystkie rysunki z tej sceny — także cudze"
          disabled={!sceneId || !anyDrawings}
          onClick={() => sceneId && void clearDrawings(sceneId, 'all')}
        >
          <IconTrashAll />
        </button>
      )}
    </>
  );

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

      <span className="map-tools-sep" aria-hidden />
      <button
        type="button"
        className={`map-tool${tool === 'draw' ? ' map-tool--active' : ''}`}
        title="Rysowanie (R) — przeciągnij po mapie; ustawienia poniżej"
        aria-pressed={tool === 'draw'}
        onClick={() => toggleTool('draw')}
      >
        <IconPencil />
      </button>
      <button
        type="button"
        className={`map-tool${tool === 'erase' ? ' map-tool--active' : ''}`}
        title={
          isGm
            ? 'Gumka (G) — kliknij rysunek, by go usunąć (możesz usuwać także cudze)'
            : 'Gumka (G) — kliknij własny rysunek, by go usunąć'
        }
        aria-pressed={tool === 'erase'}
        onClick={() => toggleTool('erase')}
      >
        <IconEraser />
      </button>

      {isGm && (
        <>
          <span className="map-tools-sep" aria-hidden />
          <button
            type="button"
            className={`map-tool${tool === 'fog' ? ' map-tool--active' : ''}`}
            title={
              fogEnabled
                ? 'Mgła wojny (F) — przeciągnij, by odsłonić lub zakryć'
                : 'Mgła wyłączona na tej scenie — włącz ją w zakładce „Sceny”'
            }
            aria-pressed={tool === 'fog'}
            disabled={!fogEnabled}
            onClick={() => toggleTool('fog')}
          >
            <IconFog />
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

      {tool === 'draw' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia rysowania">
          <button
            type="button"
            className={`map-tool${drawTool === 'pencil' ? ' map-tool--active' : ''}`}
            title="Ołówek — rysuj odręcznie"
            aria-pressed={drawTool === 'pencil'}
            onClick={() => setDrawTool('pencil')}
          >
            <IconPencil />
          </button>
          <button
            type="button"
            className={`map-tool${drawTool === 'line' ? ' map-tool--active' : ''}`}
            title="Linia prosta"
            aria-pressed={drawTool === 'line'}
            onClick={() => setDrawTool('line')}
          >
            <IconLine />
          </button>
          <button
            type="button"
            className={`map-tool${drawTool === 'rect' ? ' map-tool--active' : ''}`}
            title="Prostokąt"
            aria-pressed={drawTool === 'rect'}
            onClick={() => setDrawTool('rect')}
          >
            <IconRectSolid />
          </button>
          <button
            type="button"
            className={`map-tool${drawTool === 'ellipse' ? ' map-tool--active' : ''}`}
            title="Elipsa"
            aria-pressed={drawTool === 'ellipse'}
            onClick={() => setDrawTool('ellipse')}
          >
            <IconEllipse />
          </button>
          <button
            type="button"
            className={`map-tool${drawTool === 'text' ? ' map-tool--active' : ''}`}
            title="Tekst — kliknij na mapie i wpisz podpis (skaluje się razem z mapą)"
            aria-pressed={drawTool === 'text'}
            onClick={() => setDrawTool('text')}
          >
            <IconText />
          </button>

          <span className="map-tools-sep" aria-hidden />
          <div className="map-color-row" role="group" aria-label="Kolor rysunku">
            {DRAWING_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`map-color${drawColor === color ? ' map-color--active' : ''}`}
                style={{ background: color }}
                title={`Kolor ${color}`}
                aria-label={`Kolor ${color}`}
                aria-pressed={drawColor === color}
                onClick={() => setDrawColor(color)}
              />
            ))}
          </div>

          {drawTool === 'text' ? (
            <label className="map-tool-slider" title="Wysokość liter w pikselach mapy">
              <input
                type="range"
                min={DRAWING_MIN_FONT_SIZE}
                max={DRAWING_MAX_FONT_SIZE}
                step={4}
                value={drawFontSize}
                onChange={(event) => setDrawFontSize(Number(event.target.value))}
                aria-label="Wielkość tekstu"
              />
              <span>{drawFontSize}</span>
            </label>
          ) : (
            <label className="map-tool-slider" title="Grubość linii">
              <input
                type="range"
                min={DRAWING_MIN_WIDTH}
                max={DRAWING_MAX_WIDTH}
                step={1}
                value={drawWidth}
                onChange={(event) => setDrawWidth(Number(event.target.value))}
                aria-label="Grubość linii"
              />
              <span>{drawWidth}</span>
            </label>
          )}

          {(drawTool === 'rect' || drawTool === 'ellipse') && (
            <button
              type="button"
              className={`map-tool${drawFilled ? ' map-tool--active' : ''}`}
              title={drawFilled ? 'Wypełnienie włączone' : 'Sam obrys — kliknij, by wypełnić'}
              aria-pressed={drawFilled}
              onClick={() => setDrawFilled(!drawFilled)}
            >
              <IconFill />
            </button>
          )}

          {isGm && (
            <>
              <span className="map-tools-sep" aria-hidden />
              <button
                type="button"
                className={`map-tool${drawGmOnly ? ' map-tool--active map-tool--warn' : ''}`}
                title={
                  drawGmOnly
                    ? 'Rysujesz na warstwie MG — gracze tego nie zobaczą'
                    : 'Rysujesz dla wszystkich przy stole'
                }
                aria-pressed={drawGmOnly}
                onClick={() => setDrawGmOnly(!drawGmOnly)}
              >
                {drawGmOnly ? <IconEyeOff /> : <IconEye />}
              </button>
            </>
          )}

          <span className="map-tools-sep" aria-hidden />
          {drawingButtons}
        </div>
      )}

      {tool === 'erase' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia gumki">
          <span className="map-tool-hint">
            {isGm ? 'Kliknij rysunek, by go usunąć' : 'Kliknij swój rysunek, by go usunąć'}
          </span>
          <span className="map-tools-sep" aria-hidden />
          {drawingButtons}
        </div>
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
