import { useEffect, useMemo } from 'react';
import {
  cpredCoverPresetDetail,
  netDefenseSystemEntries,
  DRAWING_COLORS,
  DRAWING_MAX_FONT_SIZE,
  DRAWING_MAX_WIDTH,
  DRAWING_MIN_FONT_SIZE,
  DRAWING_MIN_WIDTH,
  FOG_BRUSH_MAX_RADIUS,
  FOG_BRUSH_MIN_RADIUS,
  LIGHT_COLORS,
  ROLE_GM,
  sceneObjectNominative,
} from '@vtt/shared';
import { useAttackStore } from '../stores/attackStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useDrawingStore } from '../stores/drawingStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useSceneSelectionStore } from '../stores/sceneSelectionStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useWallStore } from '../stores/wallStore.js';
import { useCoverStore } from '../stores/coverStore.js';
import { useZoneStore } from '../stores/zoneStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useSmokeStore } from '../stores/smokeStore.js';
import { useLightStore } from '../stores/lightStore.js';
import { useNetStore } from '../stores/netStore.js';
import { useNetRunStore } from '../stores/netRunStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import {
  fetchNetArchitectures,
  clearCovers,
  clearLights,
  clearNetAccessPoints,
  clearSmoke,
  clearZones,
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
  IconCover,
  IconCoverAll,
  IconEllipse,
  IconEraser,
  IconEye,
  IconEyeOff,
  IconFill,
  IconFlicker,
  IconFog,
  IconHazard,
  IconLamp,
  IconLock,
  IconRoomLight,
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
  IconSocket,
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
  const windowPlayerToggle = useMapToolStore((s) => s.windowPlayerToggle);
  const setWindowPlayerToggle = useMapToolStore((s) => s.setWindowPlayerToggle);
  const wallSnapGrid = useMapToolStore((s) => s.wallSnapGrid);
  const setWallSnapGrid = useMapToolStore((s) => s.setWallSnapGrid);
  const coverTypeId = useMapToolStore((s) => s.coverTypeId);
  const setCoverTypeId = useMapToolStore((s) => s.setCoverTypeId);
  const coverCatalogue = useMapToolStore((s) => s.coverCatalogue);
  const zoneEntryId = useMapToolStore((s) => s.zoneEntryId);
  const setZoneEntryId = useMapToolStore((s) => s.setZoneEntryId);
  const zoneHidden = useMapToolStore((s) => s.zoneHidden);
  const setZoneHidden = useMapToolStore((s) => s.setZoneHidden);
  const zoneCount = useZoneStore((s) => s.zones.length);
  // Systemy obronne z kompendium (26d): wpisy „Obrona Sieci”, które NIE są
  // Demonami — Demon jest uczestnikiem runa, nie kawałkiem podłogi.
  const compendiumEntries = useCompendiumStore((s) => s.entries);
  const compendiumOrder = useCompendiumStore((s) => s.order);
  const defenseEntries = useMemo(
    () =>
      netDefenseSystemEntries(
        compendiumOrder.map((id) => compendiumEntries[id]).filter((e) => e !== undefined),
      ),
    [compendiumEntries, compendiumOrder],
  );
  const netPointArchitectureId = useMapToolStore((s) => s.netPointArchitectureId);
  const setNetPointArchitectureId = useMapToolStore((s) => s.setNetPointArchitectureId);
  const netPointHidden = useMapToolStore((s) => s.netPointHidden);
  const setNetPointHidden = useMapToolStore((s) => s.setNetPointHidden);
  // Biblioteka Architektur (26a) — sam MG ją dostaje, więc selektor gniazda
  // czyta ten sam store co zakładka „Sieć".
  const architectures = useNetStore((s) => s.architectures);
  const lightBrightM = useMapToolStore((s) => s.lightBrightM);
  const setLightBrightM = useMapToolStore((s) => s.setLightBrightM);
  const lightDimM = useMapToolStore((s) => s.lightDimM);
  const setLightDimM = useMapToolStore((s) => s.setLightDimM);
  const lightColor = useMapToolStore((s) => s.lightColor);
  const setLightColor = useMapToolStore((s) => s.setLightColor);
  const lightFlicker = useMapToolStore((s) => s.lightFlicker);
  const setLightFlicker = useMapToolStore((s) => s.setLightFlicker);
  const lightFitRoom = useMapToolStore((s) => s.lightFitRoom);
  const setLightFitRoom = useMapToolStore((s) => s.setLightFitRoom);
  const privateMode = useRulerStore((s) => s.privateMode);
  const setPrivateMode = useRulerStore((s) => s.setPrivateMode);
  const overlay = useAttackStore((s) => s.overlay);
  const setOverlay = useAttackStore((s) => s.setOverlay);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const fogEnabled = useFogStore((s) => s.fog?.enabled ?? false);
  const overrideCount = useFogStore((s) => s.fog?.overrides.length ?? 0);
  const hasShapes = useFogStore(
    (s) => (s.fog?.shapes.length ?? 0) > 0 || (s.fog?.overrides.length ?? 0) > 0,
  );
  const drawings = useDrawingStore((s) => s.drawings);
  const visibility = useSceneStore((s) => s.effectiveScene?.visibility ?? 'open');
  const hasWalls = useWallStore((s) => s.walls.length > 0);
  const coverCount = useCoverStore((s) => s.covers.length);
  const smokeCount = useSmokeStore((s) => s.smoke.length);
  const sceneIsDark = useSceneStore((s) => s.effectiveScene?.dark ?? false);
  const lightCount = useLightStore((s) => s.lights.length);
  const netPointCount = useNetRunStore(
    (s) => s.accessPoints.filter((point) => point.sceneId === sceneId).length,
  );
  const tokens = useTokenStore((s) => s.tokens);
  const sceneSelected = useSceneSelectionStore((s) => s.selected);

  /**
   * Jedno zdanie pod paskiem (etap 27k): co zrobi klik na tej warstwie, albo co
   * zrobi `Delete` z tym, co już zaznaczone. Zaznaczenie wygrywa, bo jest
   * świeższe niż instrukcja obsługi narzędzia.
   *
   * Warstwy wymienione z ręki, a nie wzięte z `MAP_TOOLS`: linijka i mgła też
   * są narzędziami, tylko nie zostawiają po sobie obiektów, które dałoby się
   * zaznaczyć.
   */
  const layerHint = sceneSelected
    ? `Zaznaczono: ${sceneObjectNominative(sceneSelected.kind)} · Delete usuwa · Ctrl+Z cofa`
    : tool === 'wall' && isGm
      ? wallMode === 'lock'
        ? 'Kliknij drzwi albo okno, by założyć lub zdjąć zamek (zakładanie je zamyka)'
        : wallMode === 'share'
          ? 'Kliknij drzwi albo okno, by je udostępnić graczom lub schować'
          : 'Klikaj narożniki — Enter kończy ścianę. Klik w środek istniejącej zaznacza ją'
      : tool === 'light' && isGm
        ? 'Kliknij mapę, by postawić światło; klik w istniejące zaznacza, dwuklik przestraja je na ustawienia z paska'
        : tool === 'note' && isGm
          ? 'Kliknij mapę, by wbić pinezkę; klik w istniejącą zaznacza, dwuklik otwiera jej treść'
          : tool === 'netpoint' && isGm
            ? 'Kliknij mapę, by postawić gniazdo; klik w istniejące zaznacza, dwuklik otwiera kartę'
            : tool === 'cover' && isGm
              ? 'Przeciągnij prostokąt, by postawić osłonę; klik w istniejącą zaznacza ją'
              : tool === 'zone' && isGm
                ? 'Przeciągnij prostokąt bronionego obszaru; klik w istniejący zaznacza, dwuklik otwiera kartę'
                : tool === 'draw'
                  ? drawTool === 'text'
                    ? 'Kliknij mapę, by postawić podpis; klik w istniejący rysunek zaznacza go'
                    : 'Przeciągnij, by rysować; klik w istniejący rysunek zaznacza go'
                  : null;

  // Switching fog off mid-session must put the brush away too — otherwise the
  // settings row lingers next to a disabled tool button, and a stray drag
  // would store shapes nobody can see.
  const setTool = useMapToolStore((s) => s.setTool);
  // The same brush serves two masters (stage 18c): the fog of a `fog` scene and
  // the GM's override of a `dynamic` one. Only an `open` scene has nothing for
  // it to paint on, and there it goes away.
  const brushPaintsOverride = visibility === 'dynamic' && isGm;
  const brushAvailable = fogEnabled || brushPaintsOverride;
  useEffect(() => {
    if (!brushAvailable && tool === 'fog') setTool('pointer');
  }, [brushAvailable, tool, setTool]);

  // Lista Architektur jedzie tylko na żądanie (26a), a selektor gniazda jej
  // potrzebuje — bez tego MG z nieotwartą zakładką „Sieć" ma pusty wybór.
  useEffect(() => {
    if (isGm && tool === 'netpoint') void fetchNetArchitectures();
  }, [isGm, tool]);

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

      {isGm && (
        <>
          <span className="map-tools-sep" aria-hidden />
          <button
            type="button"
            className={`map-tool${tool === 'fog' ? ' map-tool--active' : ''}`}
            title={
              brushPaintsOverride
                ? 'Nadpisanie widoczności (F) — przeciągnij, by zakryć mimo światła albo odsłonić mimo ścian'
                : fogEnabled
                  ? 'Mgła wojny (F) — przeciągnij, by odsłonić lub zakryć'
                  : 'Mgła wyłączona na tej scenie — włącz ją w zakładce „Sceny”'
            }
            aria-pressed={tool === 'fog'}
            disabled={!brushAvailable}
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
            className={`map-tool${tool === 'cover' ? ' map-tool--active' : ''}`}
            title="Osłony (O) — przeciągnij prostokąt; osłona zatrzymuje kulę, ale nie zasłania widoku. Widzą ją wszyscy przy stole"
            aria-pressed={tool === 'cover'}
            onClick={() => toggleTool('cover')}
          >
            <IconCover />
          </button>
          <button
            type="button"
            className={`map-tool${tool === 'zone' ? ' map-tool--active' : ''}`}
            title="Strefy bronione — przeciągnij prostokąt; system obronny odpala się sam, gdy ktoś na niego wejdzie"
            aria-pressed={tool === 'zone'}
            onClick={() => toggleTool('zone')}
          >
            <IconHazard />
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
            className={`map-tool${tool === 'netpoint' ? ' map-tool--active' : ''}`}
            title="Punkty dostępu do Sieci — kliknij mapę, by postawić gniazdo; domyślnie ukryte, aż znajdzie je Skaner"
            aria-pressed={tool === 'netpoint'}
            onClick={() => toggleTool('netpoint')}
          >
            <IconSocket />
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
            className={`map-tool${wallMode === 'lock' ? ' map-tool--active' : ''}`}
            title="Zamek — kliknij drzwi albo okno, by je zamknąć na klucz (lub zdjąć zamek). Gracz dowie się o zamku tylko po próbie otwarcia"
            aria-pressed={wallMode === 'lock'}
            onClick={() => setWallMode('lock')}
          >
            <IconLock />
          </button>
          {/* Ten sam gest co zamek, ale o widoczności uchwytu: przełącznik oka
              obok dotyczy otworów **nowych**, a ten — postawionych. Bez niego
              okno z domyślnym „tylko dla MG" trzeba było skasować i narysować
              jeszcze raz (18d). */}
          <button
            type="button"
            className={`map-tool${wallMode === 'share' ? ' map-tool--active' : ''}`}
            title="Udostępnienie — kliknij postawione drzwi albo okno, by je oddać graczom (lub zabrać). Nie myl z przełącznikiem oka: tamten dotyczy dopiero rysowanych"
            aria-pressed={wallMode === 'share'}
            onClick={() => setWallMode('share')}
          >
            <IconEye />
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
                title="Okno — z dystansu zasłania jak ściana („firanka”), przepuszcza przygaszone światło; otwarte jest dziurą w ścianie"
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

              {/* Windows keep their own answer to the same question, and default
                  to „no": a whole elevation of them would otherwise be a wall of
                  handles inviting the party to climb in anywhere. */}
              {wallKind === 'window' && (
                <button
                  type="button"
                  className={`map-tool${
                    windowPlayerToggle ? ' map-tool--active' : ' map-tool--warn'
                  }`}
                  title={
                    windowPlayerToggle
                      ? 'Gracze mogą otwierać to okno (widzą je, gdy jest w polu widzenia) — otwarte przestaje zasłaniać i przepuszcza pełne światło'
                      : 'Okno tylko dla MG — gracze go nie ruszą ani nie zobaczą jako uchwytu'
                  }
                  aria-pressed={windowPlayerToggle}
                  onClick={() => setWindowPlayerToggle(!windowPlayerToggle)}
                >
                  {windowPlayerToggle ? <IconEye /> : <IconEyeOff />}
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

      {isGm && tool === 'cover' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia osłon">
          {/* The catalogue decides the material and the body points; this is
                  only which row of it the next rectangle uses. „Gips cienki" is
                  absent from the list on purpose — the table gives it 0 PW,
                  which is the rulebook saying it is not cover. */}
          <label
            className="map-tool-slider"
            title="Rodzaj osłony (materiał i grubość z podręcznika, s. 180)"
          >
            <select
              value={coverTypeId}
              onChange={(event) => setCoverTypeId(event.target.value)}
              aria-label="Rodzaj osłony"
            >
              {coverCatalogue.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} — {cpredCoverPresetDetail(coverCatalogue, preset)}
                </option>
              ))}
            </select>
          </label>
          {coverCatalogue.presets.length === 0 && (
            <span className="map-tool-hint">
              Brak katalogu osłon — sprawdź data/public/cpred/covers.json
            </span>
          )}

          <span className="map-tools-sep" aria-hidden />
          <span className="map-tool-hint">
            {coverCount === 0 ? 'brak osłon' : `osłon: ${coverCount}`}
          </span>
          <button
            type="button"
            className="map-tool map-tool--warn"
            title="Usuń wszystkie osłony z tej sceny"
            disabled={!sceneId || coverCount === 0}
            onClick={() => sceneId && void clearCovers(sceneId)}
          >
            <IconTrashAll />
          </button>

          {/*
            The smoke eraser lives with the cover tool (stage 16h) rather than
            getting a tool of its own: nobody *places* a cloud — a round does —
            so the only control it needs is the one that clears it, and this is
            the panel that already means „things standing on the map".
          */}
          <span className="map-tools-sep" aria-hidden />
          <span className="map-tool-hint">
            {smokeCount === 0 ? 'brak dymu' : `dymu: ${smokeCount}`}
          </span>
          <button
            type="button"
            className="map-tool map-tool--warn"
            title="Rozwiej cały dym na tej scenie (podręcznik nie mówi, kiedy dym opada — decyduje MG)"
            disabled={!sceneId || smokeCount === 0}
            onClick={() => sceneId && clearSmoke(sceneId)}
          >
            <IconTrashAll />
          </button>
        </div>
      )}

      {isGm && tool === 'zone' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia stref bronionych">
          <label
            className="map-tool-select"
            title="Wpis „Obrona Sieci” z kompendium — z niego serwer czyta PW, Wartość bojową i efekt"
          >
            <select
              value={zoneEntryId}
              onChange={(event) => setZoneEntryId(event.target.value)}
              aria-label="System obronny"
            >
              <option value="">— wybierz system —</option>
              {defenseEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`map-tool${zoneHidden ? ' map-tool--active' : ''}`}
            title={
              zoneHidden
                ? 'Ukryta — gracz nie dostanie tej strefy, dopóki jej nie zauważy Percepcją'
                : 'Widoczna od razu — strefa jedzie do graczy bez rzutu'
            }
            aria-pressed={zoneHidden}
            onClick={() => setZoneHidden(!zoneHidden)}
          >
            {zoneHidden ? <IconEyeOff /> : <IconEye />}
          </button>
          <span className="map-tools-sep" aria-hidden />
          <span className="map-tool-hint">
            {zoneCount === 0 ? 'brak stref' : `stref: ${zoneCount}`}
          </span>
          <button
            type="button"
            className="map-tool map-tool--warn"
            title="Usuń wszystkie strefy bronione z tej sceny"
            disabled={!sceneId || zoneCount === 0}
            onClick={() => sceneId && void clearZones(sceneId)}
          >
            <IconTrashAll />
          </button>
          {defenseEntries.length === 0 && (
            <span className="map-tool-hint">
              Kompendium nie ma wpisów „Obrona Sieci” — zaimportuj rozdział 11
            </span>
          )}
        </div>
      )}

      {isGm && tool === 'netpoint' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia punktów dostępu">
          <label className="map-tool-select" title="Architektura, do której prowadzi to gniazdo">
            <select
              value={netPointArchitectureId}
              onChange={(event) => setNetPointArchitectureId(event.target.value)}
            >
              <option value="">— martwe gniazdo —</option>
              {architectures.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`map-tool${netPointHidden ? ' map-tool--active' : ''}`}
            title={
              netPointHidden
                ? 'Ukryte — gracz nie dostanie tego gniazda, dopóki nie znajdzie go Skanerem'
                : 'Widoczne od razu — gniazdo jedzie do graczy bez skanowania'
            }
            aria-pressed={netPointHidden}
            onClick={() => setNetPointHidden(!netPointHidden)}
          >
            {netPointHidden ? <IconEyeOff /> : <IconEye />}
          </button>
          {/* Kosz warstwy gniazd (27k) — do tej sesji jedynym sposobem na
              sprzątnięcie sceny było klikanie ich po jednym. */}
          <span className="map-tools-sep" aria-hidden />
          <span className="map-tool-hint">
            {netPointCount === 0 ? 'brak gniazd' : `gniazd: ${netPointCount}`}
          </span>
          <button
            type="button"
            className="map-tool map-tool--warn"
            title="Usuń wszystkie punkty dostępu z tej sceny (kończy też runy, które przez nie szły). Ctrl+Z cofa"
            disabled={!sceneId || netPointCount === 0}
            onClick={() => sceneId && void clearNetAccessPoints(sceneId)}
          >
            <IconTrashAll />
          </button>
        </div>
      )}

      {isGm && tool === 'light' && (
        <div className="map-tool-options" role="group" aria-label="Ustawienia świateł">
          <button
            type="button"
            className={`map-tool${lightFitRoom ? ' map-tool--active' : ''}`}
            title={
              lightFitRoom
                ? 'Dopasowanie do pomieszczenia włączone — zasięg liczą ściany, suwaki nie mają nic do powiedzenia'
                : 'Zapal pomieszczenie — kliknij w środku pokoju, a zasięg dobierze się do jego ścian'
            }
            aria-pressed={lightFitRoom}
            onClick={() => setLightFitRoom(!lightFitRoom)}
          >
            <IconRoomLight />
          </button>
          {/* Left out rather than hidden while the walls do the measuring:
                  `hidden` loses to the class's own `display`, and two sliders
                  that visibly do nothing are worse than no sliders. */}
          {!lightFitRoom && (
            <>
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
            </>
          )}
          {lightFitRoom && <span className="map-tool-hint">zasięg z pomieszczenia</span>}
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

          <span className="map-tools-sep" aria-hidden />
          <span className="map-tool-hint">
            {lightCount === 0 ? 'brak świateł' : `świateł: ${lightCount}`}
          </span>
          {/* Kosz warstwy świateł (27k) — bliźniak kosza gniazd. */}
          <button
            type="button"
            className="map-tool map-tool--warn"
            title="Usuń wszystkie światła z tej sceny. Ctrl+Z cofa"
            disabled={!sceneId || lightCount === 0}
            onClick={() => sceneId && void clearLights(sceneId)}
          >
            <IconTrashAll />
          </button>
          {lightFitRoom && !hasWalls && (
            <span className="map-tool-hint">
              Scena nie ma ścian — dopasowanie do pomieszczenia zwróci maksymalny zasięg
            </span>
          )}
          {!(sceneIsDark && visibility === 'dynamic') && (
            <span className="map-tool-hint">
              Scena nie jest ciemna — światła nic jeszcze nie zmieniają (zakładka „Sceny”)
            </span>
          )}
        </div>
      )}

      {/*
        Podpowiedź kontekstowa warstwy (etap 27k) — **wewnątrz** paska, jako
        jego ostatni wiersz, a nie jako pływające pudełko nad mapą. Wypróbowane
        było i to drugie: `.map-placement-hint` stoi wyśrodkowane u góry mapy,
        a pasek jest szeroki na 38 rem, więc zdanie kładło się wprost na
        ikonach narzędzi. Tu układ zajmuje się tym sam.
      */}
      {layerHint && (
        <div
          className={`map-tool-tip${sceneSelected ? ' map-tool-tip--selected' : ''}`}
          role="status"
        >
          {layerHint}
        </div>
      )}

      {isGm && tool === 'fog' && (
        <div
          className="map-tool-options"
          role="group"
          aria-label={brushPaintsOverride ? 'Ustawienia nadpisania' : 'Ustawienia mgły'}
        >
          <button
            type="button"
            className={`map-tool${fogMode === 'reveal' ? ' map-tool--active' : ''}`}
            title={brushPaintsOverride ? 'Odsłoń mimo ścian i ciemności' : 'Odsłanianie mapy'}
            aria-pressed={fogMode === 'reveal'}
            onClick={() => setFogMode('reveal')}
          >
            <IconSun />
          </button>
          <button
            type="button"
            className={`map-tool${fogMode === 'hide' ? ' map-tool--active' : ''}`}
            title={
              brushPaintsOverride ? 'Zakryj mimo światła i linii wzroku' : 'Zakrywanie z powrotem'
            }
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
            title={brushPaintsOverride ? 'Pokaż graczom całą mapę' : 'Odsłoń całą mapę'}
            disabled={!sceneId}
            onClick={() => sceneId && void resetFog(sceneId, 'reveal')}
          >
            <IconRevealAll />
          </button>
          <button
            type="button"
            className="map-tool"
            title={brushPaintsOverride ? 'Oślep wszystkich' : 'Zakryj całą mapę'}
            disabled={!sceneId}
            onClick={() => sceneId && void resetFog(sceneId, 'hide')}
          >
            <IconCoverAll />
          </button>
          {brushPaintsOverride && (
            <button
              type="button"
              className="map-tool"
              title="Wyczyść nadpisania — o widoczności znów decydują ściany i światła"
              disabled={!sceneId || overrideCount === 0}
              onClick={() => sceneId && void resetFog(sceneId, 'clear')}
            >
              <IconEraser />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
