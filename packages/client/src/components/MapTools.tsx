import { useEffect, useMemo } from 'react';
import {
  DRAWING_COLORS,
  DRAWING_MAX_FONT_SIZE,
  DRAWING_MAX_WIDTH,
  DRAWING_MIN_FONT_SIZE,
  DRAWING_MIN_WIDTH,
  FOG_BRUSH_MAX_RADIUS,
  FOG_BRUSH_MIN_RADIUS,
  LIGHT_COLORS,
  ROLE_GM,
} from '@vtt/shared';
import { useAttackStore } from '../stores/attackStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useDrawingStore } from '../stores/drawingStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useWallStore } from '../stores/wallStore.js';
import { useLightStore } from '../stores/lightStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  clearDrawings,
  clearWalls,
  deleteDrawing,
  resetFog,
  toggleTokenLight,
  undoFog,
} from '../socket.js';
import {
  IconBrush,
  IconCloud,
  IconCoverAll,
  IconEllipse,
  IconEraser,
  IconEye,
  IconEyeOff,
  IconFill,
  IconFlicker,
  IconFog,
  IconLamp,
  IconLine,
  IconPencil,
  IconPin,
  IconRangeRings,
  IconRect,
  IconRectSolid,
  IconRevealAll,
  IconRuler,
  IconSun,
  IconDoor,
  IconWall,
  IconWindow,
  IconSnap,
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
  const wallMode = useMapToolStore((s) => s.wallMode);
  const setWallMode = useMapToolStore((s) => s.setWallMode);
  const wallKind = useMapToolStore((s) => s.wallKind);
  const setWallKind = useMapToolStore((s) => s.setWallKind);
  const wallPlayerToggle = useMapToolStore((s) => s.wallPlayerToggle);
  const setWallPlayerToggle = useMapToolStore((s) => s.setWallPlayerToggle);
  const wallSnapGrid = useMapToolStore((s) => s.wallSnapGrid);
  const setWallSnapGrid = useMapToolStore((s) => s.setWallSnapGrid);
  const lightMode = useMapToolStore((s) => s.lightMode);
  const setLightMode = useMapToolStore((s) => s.setLightMode);
  const lightBrightM = useMapToolStore((s) => s.lightBrightM);
  const setLightBrightM = useMapToolStore((s) => s.setLightBrightM);
  const lightDimM = useMapToolStore((s) => s.lightDimM);
  const setLightDimM = useMapToolStore((s) => s.setLightDimM);
  const lightColor = useMapToolStore((s) => s.lightColor);
  const setLightColor = useMapToolStore((s) => s.setLightColor);
  const lightFlicker = useMapToolStore((s) => s.lightFlicker);
  const setLightFlicker = useMapToolStore((s) => s.setLightFlicker);
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
  const visibility = useSceneStore((s) => s.effectiveScene?.visibility ?? 'open');
  const hasWalls = useWallStore((s) => s.walls.length > 0);
  const sceneIsDark = useSceneStore((s) => s.effectiveScene?.dark ?? false);
  const lightCount = useLightStore((s) => s.lights.length);
  const tokens = useTokenStore((s) => s.tokens);

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

  /**
   * Tokens on this scene that carry a lamp and whose light state this viewer is
   * allowed to see — which, for a player, is exactly the ones they control.
   */
  const myTorches = useMemo(
    () => Object.values(tokens).filter((token) => token.sceneId === sceneId && token.light != null),
    [tokens, sceneId],
  );

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
            className={`map-tool${tool === 'wall' ? ' map-tool--active' : ''}`}
            title={
              visibility === 'dynamic'
                ? 'Ściany (W) — klikaj narożniki, Enter kończy; gracze nigdy nie dostają ścian'
                : 'Ściany (W) — działają dopiero w trybie „Dynamiczna” (zakładka „Sceny”); można je rysować już teraz'
            }
            aria-pressed={tool === 'wall'}
            onClick={() => toggleTool('wall')}
          >
            <IconWall />
          </button>
          <button
            type="button"
            className={`map-tool${tool === 'light' ? ' map-tool--active' : ''}`}
            title={
              sceneIsDark && visibility === 'dynamic'
                ? 'Światła (L) — kliknij mapę, by postawić lampę; gracze nigdy nie dostają listy świateł'
                : 'Światła (L) — działają dopiero na ciemnej scenie w trybie „Dynamiczna” (zakładka „Sceny”); można je stawiać już teraz'
            }
            aria-pressed={tool === 'light'}
            onClick={() => toggleTool('light')}
          >
            <IconLamp />
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

      {/* The player's own torch switch. Sneaking down a corridor in the dark is
          a tactical decision, so it must not require asking the GM — and it
          belongs on the map rather than in a panel, because that is where the
          consequence shows. The GM flips the same switch from a token's menu.
          A player only ever receives `light` for tokens they control, so the
          list needs no ownership check of its own. */}
      {!isGm &&
        myTorches.map((torch) => (
          <button
            key={torch.id}
            type="button"
            className={`map-tool${torch.light?.on ? ' map-tool--active' : ''}`}
            title={torch.light?.on ? `Zgaś latarkę: ${torch.name}` : `Zapal latarkę: ${torch.name}`}
            aria-pressed={torch.light?.on ?? false}
            onClick={() => void toggleTokenLight(torch.id)}
          >
            <IconLamp />
          </button>
        ))}

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

      {isGm && tool === 'wall' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia ścian">
          <button
            type="button"
            className={`map-tool${wallMode === 'draw' ? ' map-tool--active' : ''}`}
            title="Rysowanie — klikaj kolejne narożniki"
            aria-pressed={wallMode === 'draw'}
            onClick={() => setWallMode('draw')}
          >
            <IconLine />
          </button>
          <button
            type="button"
            className={`map-tool${wallMode === 'erase' ? ' map-tool--active' : ''}`}
            title="Gumka — kliknij ścianę, by ją usunąć"
            aria-pressed={wallMode === 'erase'}
            onClick={() => setWallMode('erase')}
          >
            <IconEraser />
          </button>

          {wallMode === 'draw' && (
            <>
              <span className="map-tools-sep" aria-hidden />
              <button
                type="button"
                className={`map-tool${wallKind === 'wall' ? ' map-tool--active' : ''}`}
                title="Ściana pełna — zawsze blokuje widok"
                aria-pressed={wallKind === 'wall'}
                onClick={() => setWallKind('wall')}
              >
                <IconWall />
              </button>
              <button
                type="button"
                className={`map-tool${wallKind === 'door' ? ' map-tool--active' : ''}`}
                title="Drzwi — blokują widok, dopóki są zamknięte; kliknięcie na mapie je otwiera"
                aria-pressed={wallKind === 'door'}
                onClick={() => setWallKind('door')}
              >
                <IconDoor />
              </button>
              <button
                type="button"
                className={`map-tool${wallKind === 'window' ? ' map-tool--active' : ''}`}
                title="Okno — nie blokuje widoku (oznaczenie dla MG)"
                aria-pressed={wallKind === 'window'}
                onClick={() => setWallKind('window')}
              >
                <IconWindow />
              </button>

              {wallKind === 'door' && (
                <button
                  type="button"
                  className={`map-tool${
                    wallPlayerToggle ? ' map-tool--active' : ' map-tool--warn'
                  }`}
                  title={
                    wallPlayerToggle
                      ? 'Gracze mogą otwierać te drzwi (widzą je, gdy są w polu widzenia)'
                      : 'Drzwi tylko dla MG — gracze ich nie zobaczą ani nie otworzą'
                  }
                  aria-pressed={wallPlayerToggle}
                  onClick={() => setWallPlayerToggle(!wallPlayerToggle)}
                >
                  {wallPlayerToggle ? <IconEye /> : <IconEyeOff />}
                </button>
              )}

              <span className="map-tools-sep" aria-hidden />
              <button
                type="button"
                className={`map-tool${wallSnapGrid ? ' map-tool--active' : ''}`}
                title={
                  wallSnapGrid
                    ? 'Przyciąganie do siatki włączone (końce istniejących ścian mają pierwszeństwo)'
                    : 'Bez przyciągania do siatki — końce ścian nadal łapią'
                }
                aria-pressed={wallSnapGrid}
                onClick={() => setWallSnapGrid(!wallSnapGrid)}
              >
                <IconSnap />
              </button>
            </>
          )}

          <span className="map-tools-sep" aria-hidden />
          <button
            type="button"
            className="map-tool map-tool--warn"
            title="Usuń wszystkie ściany z tej sceny"
            disabled={!sceneId || !hasWalls}
            onClick={() => sceneId && void clearWalls(sceneId)}
          >
            <IconTrashAll />
          </button>
          {visibility !== 'dynamic' && (
            <span className="map-tool-hint">
              Tryb widoczności sceny to nie „Dynamiczna” — ściany nic jeszcze nie zasłaniają
            </span>
          )}
        </div>
      )}

      {isGm && tool === 'light' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia świateł">
          <button
            type="button"
            className={`map-tool${lightMode === 'place' ? ' map-tool--active' : ''}`}
            title="Stawianie — kliknij mapę; klik w istniejące światło zmienia je na te ustawienia"
            aria-pressed={lightMode === 'place'}
            onClick={() => setLightMode('place')}
          >
            <IconLamp />
          </button>
          <button
            type="button"
            className={`map-tool${lightMode === 'erase' ? ' map-tool--active' : ''}`}
            title="Gumka — kliknij światło, by je usunąć"
            aria-pressed={lightMode === 'erase'}
            onClick={() => setLightMode('erase')}
          >
            <IconEraser />
          </button>

          {lightMode === 'place' && (
            <>
              <span className="map-tools-sep" aria-hidden />
              <label className="map-tool-slider" title="Zasięg światła jasnego (metry)">
                <span className="map-tool-hint">jasno</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={lightBrightM}
                  onChange={(event) => setLightBrightM(Number(event.target.value))}
                  aria-label="Zasięg światła jasnego w metrach"
                />
                <span>{lightBrightM} m</span>
              </label>
              <label className="map-tool-slider" title="Zasięg światła przyćmionego (metry)">
                <span className="map-tool-hint">mrok</span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={lightDimM}
                  onChange={(event) => setLightDimM(Number(event.target.value))}
                  aria-label="Zasięg światła przyćmionego w metrach"
                />
                <span>{Math.max(lightBrightM, lightDimM)} m</span>
              </label>
              <div className="map-color-row" role="group" aria-label="Barwa światła">
                {LIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`map-color${lightColor === color ? ' map-color--active' : ''}`}
                    style={{ background: color }}
                    title={`Barwa ${color}`}
                    aria-label={`Barwa ${color}`}
                    aria-pressed={lightColor === color}
                    onClick={() => setLightColor(color)}
                  />
                ))}
              </div>
              <button
                type="button"
                className={`map-tool${lightFlicker ? ' map-tool--active' : ''}`}
                title={
                  lightFlicker
                    ? 'Migotanie włączone — świeca, ognisko, psujący się neon'
                    : 'Światło stałe — kliknij, by migotało'
                }
                aria-pressed={lightFlicker}
                onClick={() => setLightFlicker(!lightFlicker)}
              >
                <IconFlicker />
              </button>
            </>
          )}

          <span className="map-tools-sep" aria-hidden />
          <span className="map-tool-hint">
            {lightCount === 0 ? 'brak świateł' : `świateł: ${lightCount}`}
          </span>
          {!(sceneIsDark && visibility === 'dynamic') && (
            <span className="map-tool-hint">
              Scena nie jest ciemna — światła nic jeszcze nie zmieniają (zakładka „Sceny”)
            </span>
          )}
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
