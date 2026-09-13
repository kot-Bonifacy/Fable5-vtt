import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CPRED_ATTACK_MODE_SHORT,
  CPRED_BLAST_SIDE_M,
  CPRED_RANGE_BANDS,
  ROLE_GM,
  blockingSegments,
  computeVisionPolygon,
  conditionRegistry,
  coverMovementSegments,
  cpredMovementBlock,
  drawingBounds,
  isPointInPolygon,
  isPointVisible,
  isSegmentClear,
  metresPerPixel,
  metresToPixels,
  movementSegments,
  sceneObjectAccusative,
  sceneBoundsSegments,
  tokenCentre,
  translateDrawingShape,
  type CombatView,
  type SceneObjectRef,
  type SceneObjectShape,
  type ScenePoint,
  type SceneView,
  type TokenView,
} from '@vtt/shared';
import {
  MapRenderer,
  type LightMarker,
  type MoveAllowance,
  type RangeRing,
  type RenderGlow,
  type RulerLine,
} from '../map/MapRenderer.js';
import { partyStart } from '../map/camera.js';
import { loadWelcomeScene } from '../map/welcome-map.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureStatusesLoaded, useTokenStore } from '../stores/tokenStore.js';
import { ensureCpredDataLoaded, useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import {
  activeCombatantOf,
  activeTokenIdOf,
  myActiveCombatant,
  useCombatStore,
} from '../stores/combatStore.js';
import { usePortraitStore } from '../stores/portraitStore.js';
import {
  clearRuler,
  createCover,
  createZone,
  createDrawing,
  createLight,
  createToken,
  createWalls,
  duplicateToken,
  deleteCover,
  deleteZone,
  deleteDrawing,
  deleteLight,
  placeNetAccessPoint,
  removeNetAccessPoint,
  deleteNote,
  deleteWall,
  nextCombatTurn,
  undoSceneDelete,
  paintFog,
  sendPing,
  updateScene,
  sendRuler,
  sendTokenMove,
  setTokenFacing,
  toggleOpening,
  updateCover,
  updateDrawing,
  updateLight,
  updateNetAccessPoint,
  updateNote,
  updateWall,
  updateZone,
} from '../socket.js';
import { loadAttackAtToken } from '../attack-targeting.js';
import { bindMapFx } from '../map-fx.js';
import { bindMapPing } from '../map-ping.js';
import { preloadFxSounds } from '../sfx.js';
import {
  activateGroup,
  attackWithActiveWeapon,
  currentHudContext,
  cycleGroupMode,
  hudFocusTokenId,
  hudTurnRefusal,
  nextSteerableToken,
  setSteerHandler,
  shootCoverAt,
  throwAtPoint,
} from '../hud.js';
import { useAttackStore } from '../stores/attackStore.js';
import { activeWeaponOf, useHudStore } from '../stores/hudStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useExplorationStore } from '../stores/explorationStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useNoteStore } from '../stores/noteStore.js';
import { sortedDrawings, useDrawingStore } from '../stores/drawingStore.js';
import { clickableOpenings, useWallStore } from '../stores/wallStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useAimMenuStore } from '../stores/aimMenuStore.js';
import { AimMenu } from './AimMenu.js';
import { sameSceneObject, useSceneSelectionStore } from '../stores/sceneSelectionStore.js';
import { useSceneCardStore } from '../stores/sceneCardStore.js';
import {
  coverErrorText,
  drawingErrorText,
  lightErrorText,
  openingErrorText,
  sceneErrorText,
  tokenErrorText,
  wallErrorText,
} from '../mapErrors.js';
import { useLightStore } from '../stores/lightStore.js';
import { useNetRunStore } from '../stores/netRunStore.js';
import { netErrorText } from '../netErrors.js';
import { useCoverStore } from '../stores/coverStore.js';
import { useZoneStore } from '../stores/zoneStore.js';
import { useSmokeStore } from '../stores/smokeStore.js';
import { MAP_TOOL_KEYS } from '../shortcuts.js';
import {
  currentDrawingStyle,
  currentPlayerToggle,
  ensureCoverCatalogueLoaded,
  useMapToolStore,
} from '../stores/mapToolStore.js';
import { TokenContextMenu } from './TokenContextMenu.js';
import { SightingWindow } from './SightingWindow.js';
import { TokenGroupBar } from './TokenGroupBar.js';
import { DrawingTextEditor } from './DrawingTextEditor.js';
import { MapTools } from './MapTools.js';
import { SceneObjectCard } from './SceneObjectCard.js';
import { TargetTooltip, type AimHover } from './TargetTooltip.js';

export interface TokenMenuState {
  tokenId: string;
  x: number;
  y: number;
}

/**
 * Double-click on a token opens the linked sheet — but only if this viewer
 * may see it: the GM sees every character, a player only their own (the
 * server never sends anyone else's, so `characters` already reflects that).
 */
/**
 * Ile czasu po wejściu na scenę kadr wolno jeszcze przesunąć na figurę gracza,
 * która przyjechała chwilę po samej scenie (`frameStart`). Dwie i pół sekundy
 * to z zapasem jedna wymiana `state:request` → `state:sync` przez internet;
 * po tym czasie widok należy do gracza i nikt mu go nie rusza.
 */
const CAMERA_REANCHOR_MS = 2500;

function openSheetOfToken(tokenId: string): void {
  const token = useTokenStore.getState().tokens[tokenId];
  if (!token) return;
  const characterStore = useCharacterStore.getState();
  if (!token.characterId) {
    useChatStore.getState().addNote(`Token „${token.name}” nie ma przypisanej karty postaci.`);
    return;
  }
  if (!(token.characterId in characterStore.characters)) {
    useChatStore.getState().addNote(`Nie masz dostępu do karty postaci „${token.name}”.`);
    return;
  }
  characterStore.openSheet(token.characterId);
}

/**
 * Why a drag was refused (stage 14c). The detail — how many metres were
 * missing, which status is holding the token — is on the card the server posts
 * to the GM and to whoever tried; this line is the nudge at the map.
 */
function moveErrorText(code: string | undefined): string {
  switch (code) {
    case 'MOVE_REFUSED':
      return 'Ruch odrzucony — sprawdź kartę odmowy na czacie.';
    case 'FORBIDDEN':
      return 'Nie możesz ruszać tym tokenem.';
    case 'MOVE_LOCKED':
      return 'MG nie otworzył jeszcze tej mapy do ruchu.';
    case 'TOKEN_NOT_FOUND':
      return 'Nie znaleziono tokenu — odśwież stronę.';
    default:
      return `Nie udało się przesunąć tokenu: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Odmowa `scene:undo` — bufor jest w pamięci serwera, więc bywa po prostu pusty. */
function undoErrorText(code: string | undefined): string {
  switch (code) {
    case 'NOTHING_TO_UNDO':
      return 'Nie ma czego cofnąć na tej scenie.';
    case 'UNDO_FAILED':
      return 'Nie udało się przywrócić — obiekt nie mieści się już na tej scenie.';
    case 'SCENE_NOT_VIEWED':
      return 'Cofać można tylko na oglądanej scenie.';
    default:
      return `Nie udało się cofnąć: ${code ?? 'nieznany błąd'}.`;
  }
}

/**
 * Kasowanie zaznaczonego obiektu scenerii (etap 27k) — jedna droga na siedem
 * rodzajów naraz.
 *
 * Do 27k każdy rodzaj miał własną gramatykę i własne miejsce w kodzie; ta
 * funkcja jest tym, co je zastąpiło. **Każda ścieżka sprawdza `ack`** i mówi
 * zdaniem, gdy się nie udało — trzy gumki (`deleteWall`, `deleteLight`,
 * `removeNetAccessPoint`) tego nie robiły i chybiony klik nie tłumaczył
 * niczego, co było jednym z trzech błędów zamykanych w tym etapie.
 */
async function deleteSceneObject(ref: SceneObjectRef): Promise<boolean> {
  const numeric = Number(ref.id);
  // `switch` zamiast drabinki warunków, bo TypeScript wymusza na nim komplet:
  // ósmy rodzaj dopisany do `SCENE_OBJECT_KINDS` nie skompiluje się, dopóki nie
  // dostanie tutaj swojej drogi. To jest cały mechanizm „jedna gramatyka".
  const request = ((): Promise<{ ok: boolean; error?: string }> => {
    switch (ref.kind) {
      case 'wall':
        return deleteWall(numeric);
      case 'cover':
        return deleteCover(numeric);
      case 'zone':
        return deleteZone(numeric);
      case 'light':
        return deleteLight(numeric);
      case 'netpoint':
        return removeNetAccessPoint(numeric);
      case 'note':
        return deleteNote(String(ref.id));
      case 'drawing':
        return deleteDrawing(numeric);
    }
  })();
  const ack = await request;
  if (ack.ok) {
    useChatStore.getState().addNote(`Usunięto ${sceneObjectAccusative(ref.kind)} — Ctrl+Z cofa.`);
    return true;
  }
  useChatStore.getState().addNote(sceneDeleteErrorText(ref.kind, ack.error));
  return false;
}

/**
 * Zapis przesunięcia albo przeskalowania obiektu (etap 27l).
 *
 * `switch` po rodzaju, jak przy kasowaniu, i z tego samego powodu: kompilator
 * pilnuje kompletu, więc ósmy rodzaj obiektu nie skompiluje się, dopóki nie
 * dostanie tu swojej drogi. Niedopasowany kształt (prostokąt tam, gdzie
 * powinien być odcinek) jest błędem programu, nie danych — dlatego kończy się
 * cichym `return`, a nie zdaniem do gracza.
 */
async function moveSceneObject(ref: SceneObjectRef, shape: SceneObjectShape): Promise<void> {
  const numeric = Number(ref.id);
  const request = ((): Promise<{ ok: boolean; error?: string }> | null => {
    switch (ref.kind) {
      case 'wall':
        return shape.form === 'segment'
          ? updateWall(numeric, { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 })
          : null;
      case 'cover':
        return shape.form === 'rect'
          ? updateCover(numeric, {
              x: shape.x,
              y: shape.y,
              width: shape.width,
              height: shape.height,
            })
          : null;
      case 'zone':
        return shape.form === 'rect'
          ? updateZone(numeric, {
              x: shape.x,
              y: shape.y,
              width: shape.width,
              height: shape.height,
            })
          : null;
      case 'light':
        return shape.form === 'point' ? updateLight(numeric, { x: shape.x, y: shape.y }) : null;
      case 'netpoint':
        return shape.form === 'point'
          ? updateNetAccessPoint({ id: numeric, x: shape.x, y: shape.y })
          : null;
      case 'note':
        return shape.form === 'point'
          ? updateNote(String(ref.id), { x: shape.x, y: shape.y })
          : null;
      case 'drawing': {
        // Rysunek przesuwa się **cały**, punkt po punkcie: renderer zna tylko
        // prostokąt, w który kreska jest wpisana, więc przesunięcie liczy się
        // z różnicy jego narożnika (patrz `translateDrawingShape`).
        const drawing = useDrawingStore.getState().drawings[numeric];
        if (!drawing || shape.form !== 'rect') return null;
        const box = drawingBounds(drawing.shape);
        return updateDrawing(numeric, {
          shape: translateDrawingShape(drawing.shape, shape.x - box.x, shape.y - box.y),
        });
      }
    }
  })();
  if (!request) return;
  const ack = await request;
  if (!ack.ok) useChatStore.getState().addNote(sceneDeleteErrorText(ref.kind, ack.error));
}

/**
 * Kasowanie obiektu i sprzątanie po nim (etap 27l): `Delete` i kosz na karcie
 * wchodzą tędy, więc jedno i drugie zostawia dokładnie ten sam stan — bez
 * obrysu nad pustym miejscem i bez karty bez obiektu.
 */
async function removeSceneObject(ref: SceneObjectRef): Promise<void> {
  const removed = await deleteSceneObject(ref);
  if (!removed) return;
  const selection = useSceneSelectionStore.getState();
  if (sameSceneObject(selection.selected, ref)) selection.select(null);
  // Karta otwarta klikiem bez narzędzia nie ma zaznaczenia, którego zdjęcie
  // zamknęłoby ją przez subskrypcję — trzeba ją zamknąć wprost.
  if (sameSceneObject(useSceneCardStore.getState().open, ref)) useSceneCardStore.getState().close();
}

/** Odmowa serwera przy kasowaniu — po rodzaju, bo każdy ma własny słownik. */
function sceneDeleteErrorText(kind: SceneObjectRef['kind'], code: string | undefined): string {
  switch (kind) {
    case 'wall':
      return wallErrorText(code);
    case 'cover':
      return coverErrorText(code);
    case 'light':
      return lightErrorText(code);
    case 'drawing':
      return drawingErrorText(code);
    case 'zone':
    case 'netpoint':
      return netErrorText(code);
    case 'note':
      return code === 'NOTE_NOT_FOUND'
        ? 'Ta notatka już nie istnieje — odśwież stronę.'
        : `Nie udało się usunąć notatki: ${code ?? 'nieznany błąd'}.`;
  }
}

/**
 * What is left of the acting participant's movement, as the reach circle needs
 * it. Only drawn for a token this user may actually drag: the GM sees it for
 * whoever is acting, a player only for their own.
 */
function moveAllowanceOf(
  combat: CombatView | null,
  userId: string | null,
  isGm: boolean,
): MoveAllowance | null {
  const active = activeCombatantOf(combat);
  const distance = active?.turn?.distance;
  // Uczestnik bez figury (Czarny LOD z 26c) nie chodzi po mapie.
  if (!active || !distance || !active.tokenId) return null;
  if (!isGm && active.ownerId !== userId) return null;
  return {
    tokenId: active.tokenId,
    metresLeft: Math.max(0, distance.max - distance.used),
    costFactor: distance.hard ? 2 : 1,
    // The GM is never refused a move — going past the budget is logged as
    // „poza budżetem" and happens (stage 14b) — so their route is drawn against
    // the budget but never cut by it.
    enforced: !isGm,
    // The second reach band: how much further this turn goes if the trade the
    // system offers is taken (CP RED: the Action spent on „Bieg"). The name
    // comes with the number, because the core has no business knowing it.
    ...(distance.extra && distance.extra.max > 0
      ? { extraMetres: distance.extra.max, extraLabel: distance.extra.label }
      : {}),
  };
}

/**
 * Why the steered token may not walk at all right now (stage 16e), as a
 * sentence, or null when it may.
 *
 * The client asks the same two questions the server asks in this order, and
 * asking them here is not a second rulebook: it is the difference between a
 * cursor that says „no" before the click and a figure that walks two metres and
 * snaps back with a card. The server still decides.
 */
function walkRefusalFor(
  tokenId: string | null,
  combat: CombatView | null,
  token: TokenView | undefined,
  isGm: boolean,
  scene: SceneView | null,
): string | null {
  if (!tokenId || isGm) return null;
  // Mapa zamknięta przez MG (12.09) wyprzedza wszystko inne: dopóki jej nie
  // otworzy, ani Tura, ani stan figury nie mają nic do rzeczy.
  if (scene?.playerMoveLocked) return 'MG nie otworzył jeszcze tej mapy do ruchu.';
  const blocked = token ? cpredMovementBlock(token.statuses) : null;
  if (blocked) return blocked;
  // „Not your turn" is asked in exactly one place (stage 16f): the action bar
  // greys itself out with the same sentence, and two answers to „may this
  // figure act" would eventually disagree.
  return hudTurnRefusal(combat, tokenId, isGm);
}

/**
 * Which other tokens the marching figure can see from a given spot — the GM's
 * half of „ktoś nowy w polu widzenia".
 *
 * A player never needs this: a token they could not see is not in their store
 * at all, so „somebody appeared" is literally a new key. The GM holds every
 * token from the start, so for them the question has to be asked of the
 * geometry — with the same raycast the server runs, off the walls they already
 * have for the light layer.
 */
function tokensSeenFrom(
  marcher: TokenView,
  origin: ScenePoint,
  tokens: readonly TokenView[],
  scene: Parameters<typeof tokenCentre>[1] & Parameters<typeof metresToPixels>[1],
  segments: ReturnType<typeof blockingSegments>,
): Set<string> {
  const radiusPx =
    marcher.visionRange === null || marcher.visionRange === undefined
      ? null
      : metresToPixels(marcher.visionRange, scene);
  const polygon = computeVisionPolygon(origin, segments, radiusPx);
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.id === marcher.id) continue;
    if (isPointInPolygon(tokenCentre(token, scene), polygon)) seen.add(token.id);
  }
  return seen;
}

export function MapArea() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<TokenMenuState | null>(null);
  /** Token walking a planned route right now (stage 16e); null when none is. */
  const [marchingTokenId, setMarchingTokenId] = useState<string | null>(null);
  /** Token under the crosshair and where the pointer is (stage 16f). */
  const [aimHover, setAimHover] = useState<AimHover | null>(null);
  /**
   * Mapa powitalna gracza w trzech stanach: `undefined` — sonda jeszcze
   * w drodze, `null` — pliku nie ma, scena — jest co postawić. Trzy, a nie dwa,
   * bo inaczej przez czas wczytywania obrazu mrugałby komunikat „Brak aktywnej
   * sceny", czyli dokładnie to, co ta mapa ma z ekranu zdjąć.
   */
  const [welcome, setWelcome] = useState<SceneView | null | undefined>(undefined);
  const scene = useSceneStore((s) => s.effectiveScene);
  const placement = useMapToolStore((s) => s.tokenPlacement);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const tool = useMapToolStore((s) => s.tool);
  const fogMode = useMapToolStore((s) => s.fogMode);
  const fogShape = useMapToolStore((s) => s.fogShape);
  const fogRadius = useMapToolStore((s) => s.fogRadius);
  const drawTool = useMapToolStore((s) => s.drawTool);
  const drawColor = useMapToolStore((s) => s.drawColor);
  const drawWidth = useMapToolStore((s) => s.drawWidth);
  const drawFilled = useMapToolStore((s) => s.drawFilled);
  const drawFontSize = useMapToolStore((s) => s.drawFontSize);
  const drawGmOnly = useMapToolStore((s) => s.drawGmOnly);
  const wallKind = useMapToolStore((s) => s.wallKind);
  const wallSnapGrid = useMapToolStore((s) => s.wallSnapGrid);
  const targeting = useAttackStore((s) => s.targeting);
  const hasVision = useWallStore((s) => s.hasVision);
  const seesNothing = useWallStore((s) => s.polygons.length === 0);

  useEffect(() => {
    ensureStatusesLoaded();
    // The cover catalogue (stage 16c) — the GM's palette needs the material
    // table, and the same lesson as below applies: fetch it where the map is,
    // not where a panel happens to be opened.
    ensureCoverCatalogueLoaded();
    // The skill registry too, and that is not tidiness (stage 16f). Until now
    // it was fetched by the „Postacie" tab and by an open character sheet,
    // which was enough while every attack started from one of them. The HUD's
    // whole point is that none of them is opened any more — and without the
    // registry `planCpredAttack` cannot name the skill, so every shot from the
    // map came back „Nie wiem, jaką umiejętnością strzelać z tej broni".
    ensureCpredDataLoaded();
  }, []);

  const placeToken = useCallback((worldX: number, worldY: number): boolean => {
    const pending = useMapToolStore.getState().tokenPlacement;
    const current = useSceneStore.getState().effectiveScene;
    if (!pending || !current) return false;
    const extent = current.grid.sizePx;
    void createToken({
      sceneId: current.id,
      name: pending.name,
      imageUrl: pending.imageUrl,
      // Center the new token on the clicked point; the server snaps it.
      x: worldX - extent / 2,
      y: worldY - extent / 2,
      // Żeton postaci (28.08): wiązanie z kartą i właściciel przepisany z niej,
      // dokładnie tak, jak stawia figurę kreator (`createCharacterToken`).
      // Bez `characterId` powstaje pusty żeton z biblioteki — i to jest różnica
      // między „dorobiłem żeton Kolca" a „postawiłem krążek o tej samej nazwie".
      ...(pending.characterId
        ? { characterId: pending.characterId, ownerId: pending.ownerId ?? null }
        : {}),
    });
    useMapToolStore.getState().setTokenPlacement(null);
    return true;
  }, []);

  /**
   * What a bare click on the map means, in the order the answers outrank each
   * other: putting a token down, shooting the car under the pointer, and —
   * handled by the renderer once this returns false — walking.
   *
   * Cover sits in the middle for a reason (stage 16c). A car is scenery to
   * anybody with empty hands, so it must not swallow the click that would have
   * started a walk; with a weapon in hand it is a target, and „ostrzelaj
   * samochód" has to be reachable without a menu.
   */
  const handleMapClick = useCallback(
    (worldX: number, worldY: number): boolean => {
      if (placeToken(worldX, worldY)) return true;
      // A grenade in hand outranks the car: the charge is aimed at the square,
      // and that square may well be the one the car is standing on (stage 16d).
      if (throwAtPoint(worldX, worldY)) return true;
      return shootCoverAt(worldX, worldY);
    },
    [placeToken],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new MapRenderer();
    renderer.onLoadingChange = setLoading;
    renderer.onMapClick = handleMapClick;
    renderer.onTokenMove = (tokenId, x, y, final, path) => {
      const ack = sendTokenMove(tokenId, x, y, final, path);
      void ack?.then((result) => {
        if (result.ok) {
          const landed = result.data;
          if (landed) useTokenStore.getState().applyMove(tokenId, landed.x, landed.y);
          return;
        }
        // Refused (stage 14c): the token goes back where the server still has
        // it, and the reason is said out loud — a figure sliding home on its
        // own would read as a bug rather than as a rule.
        // A refusal is also one of the four things that stop a march (16e):
        // walking on after the rules said no would be walking on a lie.
        renderer.interruptWalk(null);
        // „Where the server still has it" has to be read *after* the refusal,
        // not before the emit: intermediate drag frames are broadcast back to
        // the mover as well, so a position captured on the drop is the last
        // frame of the hand in motion, not the square the figure stands on.
        // Snapping to it left the sprite metres away from the store on every
        // refused drag longer than one throttle tick (found in the 14c
        // walkthrough); the refusal broadcast that precedes the ack has
        // already put the true position in the store.
        const settled = useTokenStore.getState().tokens[tokenId];
        if (settled) renderer.snapTokenBack(tokenId, settled.x, settled.y);
        useChatStore.getState().addNote(moveErrorText(result.error));
      });
    };
    // Steering and „what the left rail is describing" are two pointers, and the
    // reason is what tells them apart: a right click drops both, a scene swap
    // sends the rail back to what it remembered on the new map, and everything
    // else leaves the rail where it was — that is the whole of „remember the
    // last figure I clicked".
    // Figura, której ten gracz nie prowadzi: pasek ją opisuje, nikt jej nie bierze.
    renderer.onTokenPreview = (tokenId) => useSelectionStore.getState().focus(tokenId);
    renderer.onSelectionChange = (tokenId, reason) => {
      const selection = useSelectionStore.getState();
      if (reason === 'dismiss') selection.dismiss();
      else if (reason === 'scene') selection.resetFocus();
      else selection.select(tokenId);
    };
    // The rail's buttons take control of the figure they belong to; the ring
    // and the walk preview live in the renderer, so the request goes there.
    setSteerHandler((tokenId) => renderer.setSelection(tokenId));
    // Turning a figure by hand (stage 27j). Reported on release, not on every
    // degree: the nose already followed the knob locally, and the server's job
    // is to remember the angle, not to animate it.
    renderer.onTokenFacing = (tokenId, facing) => {
      void setTokenFacing(tokenId, facing).then((result) => {
        // The accepted angle comes back as a `token:upsert` to everyone, this
        // client included — there is nothing to apply here on success.
        if (result.ok) return;
        // Refused: the nose goes back to what the store still holds. The local
        // angle outranks the store's by design (see `TokenNode`), so a
        // rejection has to be said out loud rather than waited out.
        const settled = useTokenStore.getState().tokens[tokenId];
        renderer.showTokenFacing(tokenId, settled?.facing ?? null);
        useChatStore.getState().addNote('Nie udało się obrócić figury.');
      });
    };
    renderer.onWalkNote = (text) => useChatStore.getState().addNote(text);
    renderer.onWalkStateChange = setMarchingTokenId;
    // Etap 41: menu figury otwiera się **także graczowi**, w wersji okrojonej do
    // jednej pozycji — oględzin. Do 41 był to wyłącznie panel MG, więc gracz nie
    // miał żadnego wejścia w cudzą figurę poza celownikiem; co w menu widzi kto,
    // rozstrzyga `TokenContextMenu`, nie ten warunek.
    renderer.onTokenMenu = (tokenId, clientX, clientY) => {
      setMenu({ tokenId, x: clientX, y: clientY });
    };
    renderer.onTokenActivate = (tokenId) => openSheetOfToken(tokenId);
    // Two doors into one attack (stage 16f). A crosshair armed from a sheet or
    // from the „Walka" tab already named its weapon, so it wins; otherwise the
    // shot is fired with whatever the action bar has in hand.
    renderer.onTokenTarget = (tokenId, clientX, clientY) => {
      // Adres dla okna Celowania (31.08): ładowanie kubka nie wie nic o ekranie,
      // więc pozycję kliknięcia zostawia ten, kto ją zna.
      useAimMenuStore.getState().placeAt(clientX, clientY);
      if (useAttackStore.getState().targeting) {
        loadAttackAtToken(tokenId);
        return;
      }
      attackWithActiveWeapon(tokenId);
    };
    renderer.onAimHover = setAimHover;
    renderer.onFogPreview = (shape) => {
      // The preview is local only: the server hears about the stroke once,
      // when the GM lets go, rather than at pointer speed.
      useFogStore.getState().setPending(shape ? { ...shape, id: -1 } : null);
    };
    renderer.onFogPaint = (shape) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      void paintFog(current.id, shape).then((ack) => {
        // A rejected stroke (limit reached, lost GM role) must not linger as
        // a preview that suggests it worked.
        if (!ack.ok) useFogStore.getState().setPending(null);
      });
    };
    renderer.onNotePlace = (x, y) => useSceneCardStore.getState().startNoteDraft({ x, y });
    // Miejsce startu drużyny (11.09) jedzie zwykłą łatką sceny — to jedno pole
    // sceny, a nie obiekt na niej, więc nie potrzebuje własnego zdarzenia.
    renderer.onSpawnPlace = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      void updateScene(current.id, { spawn: { x, y } }).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(sceneErrorText(ack.error));
      });
    };
    renderer.onNoteActivate = (noteId) =>
      useSceneCardStore.getState().openCard({ kind: 'note', id: noteId });
    renderer.onDrawingCreate = (shape) => {
      const current = useSceneStore.getState().effectiveScene;
      // Podgląd kreski żyje do odpowiedzi serwera — a gdy sceny nie ma, żadna
      // odpowiedź nie przyjdzie i szkic zostałby na ekranie na zawsze. Skrótem
      // `R` narzędzie da się uzbroić mimo wyłączonego guzika w pasku.
      if (!current) {
        renderer.clearDrawingPreview();
        return;
      }
      const tools = useMapToolStore.getState();
      const gmOnly = useAuthStore.getState().user?.role === ROLE_GM && tools.drawGmOnly;
      void createDrawing(current.id, shape, currentDrawingStyle(tools), gmOnly).then((ack) => {
        // The preview lives on until the server answers — either the real
        // drawing has arrived by broadcast, or the attempt failed and the
        // sketch must not linger as if it had worked.
        renderer.clearDrawingPreview();
        if (!ack.ok) useChatStore.getState().addNote(drawingErrorText(ack.error));
      });
    };
    renderer.onDrawingTextPlace = (x, y) => useDrawingStore.getState().setTextDraft({ x, y });
    renderer.onWallChain = (points) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const tools = useMapToolStore.getState();
      void createWalls(current.id, points, tools.wallKind, currentPlayerToggle(tools)).then(
        (ack) => {
          if (!ack.ok) useChatStore.getState().addNote(wallErrorText(ack.error));
        },
      );
    };
    renderer.onOpeningToggle = (wallId) => {
      const state = useWallStore.getState();
      const kind = [...state.walls, ...state.openings].find((wall) => wall.id === wallId)?.kind;
      void toggleOpening(wallId).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(openingErrorText(ack.error, kind));
      });
    };
    // Cover (stage 16c). The rectangle is the whole gesture: the preset the GM
    // has armed decides the material, the label and the body points, and those
    // are read on the *server* — a client that could name its own toughness
    // could park a bulletproof crate anywhere.
    renderer.onCoverRect = (rect) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const typeId = useMapToolStore.getState().coverTypeId;
      if (!typeId) {
        useChatStore.getState().addNote('Wybierz rodzaj osłony w pasku narzędzi.');
        return;
      }
      void createCover(current.id, typeId, rect).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(coverErrorText(ack.error));
      });
    };
    // Strefa broniona (26f) — jak osłona: klient wysyła sam prostokąt i wpis,
    // a PW, Wartość bojową i efekt czyta serwer z kompendium.
    renderer.onZoneRect = (rect) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const tools = useMapToolStore.getState();
      if (!tools.zoneEntryId) {
        useChatStore.getState().addNote('Wybierz system obronny w pasku narzędzi.');
        return;
      }
      void createZone(current.id, tools.zoneEntryId, rect, { hidden: tools.zoneHidden }).then(
        (ack) => {
          if (!ack.ok) useChatStore.getState().addNote(netErrorText(ack.error));
        },
      );
    };
    renderer.onLightPlace = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const tools = useMapToolStore.getState();
      const spec = {
        brightM: tools.lightBrightM,
        dimM: tools.lightDimM,
        color: tools.lightColor,
        flicker: tools.lightFlicker,
      };
      // „Light this room" (stage 18c): the radii are worked out on the server,
      // because that is where the walls are. The colour and the flicker still
      // come from the panel — those are taste, not measurement.
      //
      // Zawsze **nowa** lampa: od 27k renderer woła to dopiero wtedy, gdy pod
      // kursorem nic nie było. Klik w istniejącą lampę ją zaznacza, a
      // przestrojenie do ustawień z paska przeszło na dwuklik
      // (`onSceneActivate`).
      void createLight(current.id, x, y, { ...spec, fitRoom: tools.lightFitRoom }).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(lightErrorText(ack.error));
      });
    };
    renderer.onLightToggle = (lightId) => {
      const light = useLightStore.getState().lights.find((entry) => entry.id === lightId);
      if (!light) return;
      void updateLight(lightId, { enabled: !light.enabled }).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(lightErrorText(ack.error));
      });
    };
    // Punkty dostępu do Sieci (26b). Stawia i kasuje wyłącznie MG; klik bez
    // uzbrojonego narzędzia otwiera panel gniazda — u MG edytor, u gracza
    // „Podłącz się", jeśli stoi w zasięgu.
    renderer.onAccessPointPlace = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const tools = useMapToolStore.getState();
      void placeNetAccessPoint({
        sceneId: current.id,
        x,
        y,
        hidden: tools.netPointHidden,
        architectureId: tools.netPointArchitectureId || null,
      }).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(netErrorText(ack.error));
      });
    };
    renderer.onAccessPointOpen = (id) => {
      // Klik w gniazdo **bez** uzbrojonego narzędzia — jedyna karta obiektu,
      // którą otwiera także gracz („podłączyć się?"). Zaznaczenia nie stawia,
      // bo obrys i `Delete` należą do warstwy (27k).
      useSceneCardStore.getState().openCard({ kind: 'netpoint', id });
    };
    // ── sceneria: zaznaczenie i karta pod dwuklikiem (etap 27k) ──────────────
    renderer.onSceneSelect = (ref) => useSceneSelectionStore.getState().select(ref);
    renderer.onSceneHover = (ref) => useSceneSelectionStore.getState().setHovered(ref);
    // Dwuklik otwiera kartę — **tę samą** dla wszystkich siedmiu rodzajów
    // (etap 27l). Do 27l dwuklik w ścianę, osłonę i rysunek nie robił nic,
    // a w lampę przestrajał ją do ustawień z paska; jedno i drugie zniknęło
    // razem z powodem, dla którego istniało.
    renderer.onSceneActivate = (ref) => useSceneCardStore.getState().openCard(ref);
    // Uchwyt puszczony (27l): jedno zdarzenie na rodzaj, ta sama droga, którą
    // idą pozostałe zmiany obiektu. Renderer podaje **kształt**, nie payload —
    // to tutaj wie się, którym zdarzeniem obiekt tego rodzaju się zapisuje.
    renderer.onSceneTransform = (ref, shape) => void moveSceneObject(ref, shape);
    // ── Zaznaczanie wielu figur, ping i kopia (etap 35) ─────────────────────
    // Renderer zgłasza gest, store rozstrzyga: ramka i `Ctrl+A` dochodzą do
    // `setGroup` jedną drogą, więc reguła „grupa wyklucza się ze scenerią"
    // stoi w jednym miejscu (`sceneSelectionStore`), a nie w każdym geście.
    renderer.onGroupSelect = (tokenIds) => useSelectionStore.getState().setGroup(tokenIds);
    renderer.onGroupToggle = (tokenId) => useSelectionStore.getState().toggleInGroup(tokenId);
    renderer.onPing = (x, y, pull) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      sendPing(current.id, x, y, pull);
    };
    renderer.onTokenDuplicate = (tokenId, x, y) => {
      void duplicateToken(tokenId, x, y).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(tokenErrorText(ack.error));
      });
    };
    renderer.onRulerChange = (points) => {
      const current = useSceneStore.getState().effectiveScene;
      useRulerStore.getState().setLocal(points);
      if (!current) return;
      if (points) sendRuler(current.id, points, useRulerStore.getState().privateMode);
      else clearRuler(current.id);
    };
    rendererRef.current = renderer;
    let cancelled = false;
    void renderer.init(host).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      setReady(false);
      setSteerHandler(null);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [placeToken]);

  // The token layer bypasses React: the renderer diffs store snapshots
  // directly, so 20 Hz drag updates never re-render the component tree.
  const pushTokens = useCallback(() => {
    const tokenState = useTokenStore.getState();
    const current = useSceneStore.getState().effectiveScene;
    const user = useAuthStore.getState().user;
    rendererRef.current?.setTokens(current ? Object.values(tokenState.tokens) : [], {
      gridSizePx: current?.grid.sizePx ?? 100,
      myUserId: user?.id ?? null,
      isGm: user?.role === ROLE_GM,
      statusIcons: new Map(tokenState.statuses.map((s) => [s.id, s.icon])),
      // What a sticker does to the figure comes from the same registry the
      // icon does (stage 27j) — the map never learns what „unconscious" means.
      conditions: conditionRegistry(tokenState.statuses),
      activeTokenId: activeTokenIdOf(useCombatStore.getState().combat),
      // Kadr portretu (12.09) jest cechą obrazka, więc jedzie tu jako
      // odwzorowanie adres → ujęcie, a nie polem figury: ten sam plik na dwóch
      // żetonach ma być ujęty tak samo.
      portraitCrops: usePortraitStore.getState().crops,
    });
  }, []);

  // Mapa powitalna gracza (11.09): gdy MG nie aktywował niczego, gracz dostaje
  // zwykłą mapę zamiast czarnego pola z komunikatem. Sonda rusza dopiero, gdy
  // naprawdę nie ma czego pokazać — MG nie pyta o nią nigdy, bo swoją pustkę ma
  // widzieć. Wynik siedzi w `welcome` i **nie wchodzi do `sceneStore`**:
  // wszystko poza rendererem ma dalej wiedzieć, że sceny nie ma.
  useEffect(() => {
    if (isGm || scene) return;
    let cancelled = false;
    void loadWelcomeScene().then((backdrop) => {
      if (!cancelled) setWelcome(backdrop);
    });
    return () => {
      cancelled = true;
    };
  }, [isGm, scene]);

  /** Co widzi renderer: scena serwera, a pod jej nieobecność tło powitalne. */
  const displayScene = scene ?? (isGm ? null : (welcome ?? null));

  /**
   * Kadr startowy gracza (11.09): przybliżenie na osiem kratek wokół **jego**
   * figury, a gdy jej tu nie ma — wokół miejsca startu wyznaczonego przez MG
   * albo środka dolnej krawędzi mapy.
   *
   * Ref, a nie stan, bo to jest pamięć „tę scenę już kadrowałem": efekt niżej
   * rusza też przy każdej edycji sceny przez MG (zmiana kratki, nazwy, tła),
   * a kamera odrzucona wtedy do punktu startu byłaby dla gracza wyrwaniem
   * widoku z ręki w środku walki.
   */
  const framedRef = useRef<{ sceneId: string; onOwnToken: boolean; at: number } | null>(null);

  const frameStart = useCallback((displayed: SceneView | null) => {
    const renderer = rendererRef.current;
    if (!renderer || !displayed) return;
    const user = useAuthStore.getState().user;
    // MG zostaje z `fitScene`: on ogląda całą mapę, bo ma nią zarządzać.
    if (!user || user.role === ROLE_GM) return;
    const mine = Object.values(useTokenStore.getState().tokens).find(
      (token) => token.sceneId === displayed.id && token.ownerId === user.id,
    );
    const framed = framedRef.current;
    if (framed?.sceneId === displayed.id) {
      // Już kadrowana. Wolno poprawić kadr **raz**: po `scene:activate` figury
      // przyjeżdżają osobnym `state:sync` chwilę po samej scenie, więc pierwszy
      // kadr może trafić na „nie masz tu figury". Po paru sekundach widok
      // należy już do gracza i nikt mu go nie przesuwa.
      if (framed.onOwnToken || !mine) return;
      if (Date.now() - framed.at > CAMERA_REANCHOR_MS) return;
    }
    renderer.frameAround(
      mine ? tokenCentre(mine, displayed) : partyStart(displayed, displayed.spawn),
    );
    framedRef.current = { sceneId: displayed.id, onOwnToken: mine !== undefined, at: Date.now() };
  }, []);

  // Kontrastowa siatka przy otwartym edytorze sceny (12.09) — stan tej karty,
  // włączany przez `SceneEditor`; renderer przerysowuje tylko siatkę.
  const gridContrast = useSceneStore((s) => s.gridContrast);
  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setGridContrast(gridContrast);
  }, [ready, gridContrast]);

  useEffect(() => {
    if (!ready) return;
    const renderer = rendererRef.current;
    renderer?.setScene(displayScene);
    // Kamera gracza nie wyjeżdża poza mapę (decyzja MG, 11.09); MG zostaje
    // z marginesem, bo ścianę na krawędzi rysuje się, mając dokąd wyjechać.
    renderer?.setCameraLocked(!isGm);
    // Chorągiewkę miejsca startu widzi wyłącznie MG — gracz ma z niej tylko
    // kadr, w którym się budzi.
    renderer?.setSpawn(isGm ? (displayScene?.spawn ?? null) : null);
    // A scene change wipes the token layer, and the store subscription below
    // may have already delivered this scene's tokens (state:sync fills the
    // stores before React runs this effect) — re-push, or the map stays empty
    // until the next token event.
    pushTokens();
    frameStart(displayScene);
    // Figury bywają o krok za sceną (patrz `frameStart`), więc kadr dostaje
    // jeszcze jedną szansę, gdy przyjadą.
    return useTokenStore.subscribe(() => frameStart(displayScene));
  }, [ready, displayScene, isGm, pushTokens, frameStart]);

  // Where a shot arriving over the socket ends up (stage 27i). Bound to the
  // scene id as well as to the renderer, so a batch that overtakes a scene
  // switch is dropped rather than drawn on the wrong map.
  useEffect(() => {
    if (!ready || !scene) {
      bindMapFx(null, null);
      return;
    }
    preloadFxSounds();
    bindMapFx(scene.id, (effects) => rendererRef.current?.playFx(effects));
    return () => bindMapFx(null, null);
  }, [ready, scene]);

  // Pingi (etap 35) tą samą drogą co efekty walki i z tego samego powodu:
  // ping nie jest stanem, tylko czymś, co się stało na tej jednej mapie.
  useEffect(() => {
    if (!ready || !scene) {
      bindMapPing(null, null, null);
      return;
    }
    bindMapPing(
      scene.id,
      (ping) => rendererRef.current?.addPing(ping.x, ping.y, ping.userName),
      (x, y) => rendererRef.current?.pullViewTo(x, y),
    );
    return () => bindMapPing(null, null, null);
  }, [ready, scene]);

  /**
   * Zaznaczenie grupowe do renderera (etap 35) — obwódki na mapie.
   *
   * Bez React state: obwódki rysuje Pixi, a lista zmienia się przy każdym
   * `Shift`+kliknięciu. Ta sama umowa, co przy żetonach kilkaset linijek wyżej.
   */
  useEffect(() => {
    if (!ready) return;
    const push = () => {
      const selection = useSelectionStore.getState();
      const renderer = rendererRef.current;
      renderer?.setGroupSelection(selection.groupIds);
      // Kotwicę grupy wybiera **store** (tylko on wie, co wyszło z `Shift`
      // +kliknięcia), więc mapa musi się do niej wyrównać — i musi to zrobić
      // drogą, która nie odsyła zmiany z powrotem, bo zwykły wybór figury
      // świadomie zeruje grupę.
      if (selection.groupIds.length > 0) renderer?.syncSteering(selection.tokenId);
    };
    push();
    return useSelectionStore.subscribe(push);
  }, [ready]);

  /**
   * Czy wolno teraz ciągnąć całą grupę naraz (rozstrzygnięcie MG z 05.09).
   *
   * Poza walką tak, w walce nie: budżet metrów z 14c jest per figura, a grupowy
   * chwyt byłby jedyną drogą, która go nie widzi. Bramka stoi u klienta, bo to
   * jest **gest**, a nie reguła — serwer i tak sądzi każdy `token:move` osobno,
   * więc żadna dziura w zasadach się tu nie otwiera.
   */
  useEffect(() => {
    if (!ready) return;
    const push = () =>
      rendererRef.current?.setGroupDragAllowed(useCombatStore.getState().combat === null);
    push();
    return useCombatStore.subscribe(push);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    pushTokens();
    const unsubTokens = useTokenStore.subscribe(pushTokens);
    const unsubScene = useSceneStore.subscribe(pushTokens);
    const unsubCombat = useCombatStore.subscribe(pushTokens);
    // MG przestawia kadr w oknie puli — figury mają zmienić ujęcie od razu,
    // a nie po przeładowaniu strony.
    const unsubPortraits = usePortraitStore.subscribe(pushTokens);
    // Pula jest publiczna dla każdego zalogowanego, więc gracz czyta kadry tą
    // samą drogą co MG. Nieudane pobranie nie psuje mapy: bez wpisu figura
    // dostaje kadr domyślny.
    void usePortraitStore.getState().load();
    return () => {
      unsubTokens();
      unsubScene();
      unsubCombat();
      unsubPortraits();
    };
  }, [ready, pushTokens]);

  /**
   * Hands the renderer what counts as walkable ground (stage 16e) — the whole of
   * the difference between what the GM knows and what a player knows, in one
   * place.
   *
   * **GM:** real geometry. Walls are lines, so the answer is an edge test:
   * anywhere is standable, and a step is legal when nothing blocks the straight
   * line between the two cells. That routes through rooms nobody has entered,
   * which is what planning a scene needs.
   *
   * **Player:** the field of view their own tokens describe, and nothing else.
   * The polygon ends exactly where a wall stands, so a route confined to it goes
   * round walls the client was never sent — the identity the whole stage rests
   * on. The party's *memory* (18c) is deliberately **not** in here: a remembered
   * corridor remembers the floor and not the walls (both sides of a wall were
   * seen, so both sides are remembered), and planning through it would send
   * figures straight through masonry. „Nie dalej, niż widzisz" — a click into a
   * remembered but unlit room walks to the edge of sight and waits for the next
   * one.
   *
   * A scene with no visibility model at all has neither: everything is walkable,
   * because there is nothing on it to walk round.
   */
  const pushWalkPassable = useCallback(() => {
    const renderer = rendererRef.current;
    const current = useSceneStore.getState().effectiveScene;
    if (!renderer) return;
    if (!current) {
      renderer.setWalkPassable(null);
      return;
    }
    // Cover blocks legs whatever else does (stage 16c, GM decision): the car is
    // in the way of a body even where it is not in the way of an eye, and it is
    // in everybody's list because everybody can see it. A **wreck** stops
    // blocking, exactly as it stops stopping bullets.
    const coverEdges = coverMovementSegments(useCoverStore.getState().covers);
    if (useAuthStore.getState().user?.role === ROLE_GM) {
      const segments = [
        ...movementSegments(useWallStore.getState().walls),
        ...coverEdges,
        ...sceneBoundsSegments(current),
      ];
      renderer.setWalkPassable(
        () => true,
        (from, to) => isSegmentClear(from, to, segments),
      );
      return;
    }
    const wallState = useWallStore.getState();
    // A barrier is looked through and not walked through (stage 42a). The field
    // of view says nothing about it, so the server hands a player the ones in
    // sight as bare segments, and they stop a step exactly as a car does.
    const stepEdges = [...coverEdges, ...wallState.blockers];
    const canStep =
      stepEdges.length > 0
        ? (from: ScenePoint, to: ScenePoint) => isSegmentClear(from, to, stepEdges)
        : undefined;
    if (!wallState.hasVision) {
      renderer.setWalkPassable(() => true, canStep);
      return;
    }
    const polygons = wallState.polygons;
    renderer.setWalkPassable((point) => isPointVisible(point, polygons), canStep);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushWalkPassable();
    const unsubWalls = useWallStore.subscribe(pushWalkPassable);
    const unsubScene = useSceneStore.subscribe(pushWalkPassable);
    const unsubCovers = useCoverStore.subscribe(pushWalkPassable);
    return () => {
      unsubWalls();
      unsubScene();
      unsubCovers();
    };
  }, [ready, pushWalkPassable]);

  /** „Powalony", „nie twoja tura" — the cursor says no before the click does. */
  const pushWalkRefusal = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const selected = useSelectionStore.getState().tokenId;
    renderer.setWalkRefusal(
      walkRefusalFor(
        selected,
        useCombatStore.getState().combat,
        selected ? useTokenStore.getState().tokens[selected] : undefined,
        useAuthStore.getState().user?.role === ROLE_GM,
        useSceneStore.getState().scene,
      ),
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushWalkRefusal();
    const unsubSelection = useSelectionStore.subscribe(pushWalkRefusal);
    const unsubCombat = useCombatStore.subscribe(pushWalkRefusal);
    const unsubTokens = useTokenStore.subscribe(pushWalkRefusal);
    // Blokada ruchu jest cechą sceny (12.09), więc przekręcenie jej przez MG
    // musi dojść tą samą drogą, co powalenie figury — inaczej gracz miałby
    // kursor „nie wolno" jeszcze długo po otwarciu mapy.
    const unsubScene = useSceneStore.subscribe(pushWalkRefusal);
    return () => {
      unsubSelection();
      unsubCombat();
      unsubTokens();
      unsubScene();
    };
  }, [ready, pushWalkRefusal]);

  /**
   * The three automatic reasons a march stops (stage 16e). The fourth — a hand
   * on Escape or the mouse — lives in the renderer, where the pointer is.
   *
   * All of them are watched only *while* somebody is walking: outside a march
   * this effect does not exist, so the subscriptions cost nothing at rest.
   */
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!ready || !renderer || !marchingTokenId) return;
    const isGm = useAuthStore.getState().user?.role === ROLE_GM;
    const startTokens = useTokenStore.getState().tokens;
    const known = new Set(Object.keys(startTokens));
    const startHp = startTokens[marchingTokenId]?.hp?.current ?? null;
    const startActive = activeTokenIdOf(useCombatStore.getState().combat);

    const sceneOf = () => useSceneStore.getState().effectiveScene;
    /** Who the walking figure could see when it set off (GM only). */
    const seenAtStart = (() => {
      const current = sceneOf();
      const marcher = startTokens[marchingTokenId];
      if (!isGm || !current || !marcher) return null;
      const segments = [
        ...blockingSegments(useWallStore.getState().walls),
        ...sceneBoundsSegments(current),
      ];
      return tokensSeenFrom(
        marcher,
        tokenCentre(marcher, current),
        Object.values(startTokens),
        current,
        segments,
      );
    })();

    const unsubTokens = useTokenStore.subscribe(() => {
      const state = useTokenStore.getState();
      for (const id of Object.keys(state.tokens)) {
        // A player is only ever sent tokens they can see, so a new key *is*
        // somebody stepping into view — the „enemy sighted" of every CRPG.
        if (!known.has(id)) {
          renderer.interruptWalk('Ktoś pojawił się w polu widzenia — marsz przerwany.');
          return;
        }
      }
      const hp = state.tokens[marchingTokenId]?.hp?.current ?? null;
      if (startHp !== null && hp !== null && hp < startHp) {
        renderer.interruptWalk('Obrażenia — marsz przerwany.');
      }
    });

    const unsubCombat = useCombatStore.subscribe(() => {
      if (activeTokenIdOf(useCombatStore.getState().combat) !== startActive) {
        renderer.interruptWalk('Zmiana tury — marsz przerwany.');
      }
    });

    // The GM's own check runs on a timer rather than on a store event: nothing
    // in any store changes when a figure walks round a corner and finds
    // somebody standing there. Four times a second is well under the pace a
    // token moves at three metres a second, and the raycast is the one the
    // light layer already runs on every lamp.
    const timer = seenAtStart
      ? window.setInterval(() => {
          const current = sceneOf();
          const state = useTokenStore.getState();
          const marcher = state.tokens[marchingTokenId];
          const position = renderer.marchPosition();
          if (!current || !marcher || !position) return;
          const segments = [
            ...blockingSegments(useWallStore.getState().walls),
            ...sceneBoundsSegments(current),
          ];
          const half = (marcher.size * current.grid.sizePx) / 2;
          const seen = tokensSeenFrom(
            marcher,
            { x: position.x + half, y: position.y + half },
            Object.values(state.tokens),
            current,
            segments,
          );
          for (const id of seen) {
            if (seenAtStart.has(id)) continue;
            const spotted = state.tokens[id];
            renderer.interruptWalk(
              `${spotted ? `„${spotted.name}"` : 'Ktoś'} w polu widzenia — marsz przerwany.`,
            );
            return;
          }
        }, 250)
      : null;

    return () => {
      unsubTokens();
      unsubCombat();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [ready, marchingTokenId]);

  // The reach circle follows the tracker: every spent metre comes back as a
  // fresh budget, so the ring shrinks as the token walks (stage 14c).
  const pushMoveAllowance = useCallback(() => {
    const state = useCombatStore.getState();
    const user = useAuthStore.getState().user;
    rendererRef.current?.setMoveAllowance(
      moveAllowanceOf(state.combat, user?.id ?? null, user?.role === ROLE_GM),
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushMoveAllowance();
    return useCombatStore.subscribe(pushMoveAllowance);
  }, [ready, pushMoveAllowance]);

  useEffect(() => {
    if (!placement) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useMapToolStore.getState().setTokenPlacement(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placement]);

  // Tools are renderer modes, not React state — push the flags.
  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setRulerMode(tool === 'ruler');
    rendererRef.current?.setNotePlacing(tool === 'note' && isGm);
    rendererRef.current?.setSpawnPlacing(tool === 'spawn' && isGm);
    rendererRef.current?.setFogBrush({
      armed: tool === 'fog' && isGm,
      mode: fogMode,
      shape: fogShape,
      radius: fogRadius,
    });
    rendererRef.current?.setDrawMode({
      armed: tool === 'draw',
      tool: drawTool,
      style: { color: drawColor, width: drawWidth, filled: drawFilled },
      gmOnly: isGm && drawGmOnly,
      fontSize: drawFontSize,
    });
    rendererRef.current?.setWallTool({
      armed: tool === 'wall' && isGm,
      kind: wallKind,
      snapGrid: wallSnapGrid,
    });
    rendererRef.current?.setCoverTool({ armed: tool === 'cover' && isGm });
    rendererRef.current?.setZoneTool({ armed: tool === 'zone' && isGm });
    rendererRef.current?.setLightTool({ armed: tool === 'light' && isGm });
    rendererRef.current?.setAccessPointTool({ armed: tool === 'netpoint' && isGm });
  }, [
    ready,
    tool,
    isGm,
    fogMode,
    fogShape,
    fogRadius,
    drawTool,
    drawColor,
    drawWidth,
    drawFilled,
    drawFontSize,
    drawGmOnly,
    wallKind,
    wallSnapGrid,
  ]);

  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setTargeting(targeting !== null);
  }, [ready, targeting]);

  /**
   * Zaznaczenie obiektu należy do warstwy (27k): odłożenie narzędzia albo
   * przejście na inne zdejmuje obrys. Inaczej po przejściu ze ścian na światła
   * `Delete` skasowałby ścianę, której nikt już nie widzi jako wybranej.
   */
  useEffect(() => {
    useSceneSelectionStore.getState().clear();
  }, [tool]);

  // Store jest źródłem prawdy, renderer maluje. Esc i klik w figurę zmieniają
  // zaznaczenie z pominięciem renderera, więc obrys musi iść za store'em.
  useEffect(() => {
    if (!ready) return;
    const push = () =>
      rendererRef.current?.setSceneSelection(useSceneSelectionStore.getState().selected);
    push();
    return useSceneSelectionStore.subscribe(push);
  }, [ready]);

  /**
   * Does the steered figure have a weapon in hand (stage 16f)? That single flag
   * is the whole of what turns the pointer into a crosshair over an enemy —
   * which weapon it is stays in the action bar, where the rules are.
   */
  const pushAimReady = useCallback(() => {
    const selected = useSelectionStore.getState().tokenId;
    const weapon = activeWeaponOf(useHudStore.getState().activeWeapon, selected);
    rendererRef.current?.setAimReady(weapon !== null);
    // A charge in hand asks for a square instead of a figure (stage 16d), so
    // the renderer draws the blast under the cursor rather than a crosshair.
    // A shell keeps the crosshair and adds the cone it will sweep (stage 16g).
    rendererRef.current?.setAreaPreview(
      weapon?.pointTarget
        ? { kind: 'blast', sideM: CPRED_BLAST_SIDE_M }
        : weapon?.coneRangeM
          ? { kind: 'cone', rangeM: weapon.coneRangeM }
          : null,
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushAimReady();
    const unsubHud = useHudStore.subscribe(pushAimReady);
    const unsubSelection = useSelectionStore.subscribe(pushAimReady);
    return () => {
      unsubHud();
      unsubSelection();
    };
  }, [ready, pushAimReady]);

  // Redraws every measurement: the local line plus the other viewers'. The
  // sweep drops lines from clients that navigated away without a `ruler:clear`.
  const pushRulers = useCallback(() => {
    const state = useRulerStore.getState();
    const myId = useAuthStore.getState().user?.id ?? '';
    const lines: RulerLine[] = [];
    if (state.local) lines.push({ points: state.local, color: 0xfacc15 });
    for (const ruler of Object.values(state.remote)) {
      if (ruler.userId === myId) continue;
      lines.push({ points: ruler.points, userName: ruler.userName, color: 0x60a5fa });
    }
    rendererRef.current?.setRulers(lines);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushRulers();
    const unsub = useRulerStore.subscribe(pushRulers);
    const timer = window.setInterval(() => useRulerStore.getState().sweep(), 2000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [ready, pushRulers]);

  // Range rings follow the overlay toggle and the token it was armed on.
  const pushRangeRings = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const overlay = useAttackStore.getState().overlay;
    const current = useSceneStore.getState().effectiveScene;
    const token = overlay ? useTokenStore.getState().tokens[overlay.tokenId] : undefined;
    if (!overlay || !current || !token) {
      renderer.setRangeRings(null, []);
      return;
    }
    const perPixel = metresPerPixel(current);
    if (perPixel <= 0) {
      renderer.setRangeRings(null, []);
      return;
    }
    const rings: RangeRing[] = [];
    CPRED_RANGE_BANDS.forEach((band, index) => {
      const dv = overlay.rangeDv[index];
      if (dv === null || dv === undefined) return;
      rings.push({ radiusPx: band.max / perPixel, label: `PT ${dv}` });
    });
    renderer.setRangeRings(tokenCentre(token, current), rings);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushRangeRings();
    const unsubAttack = useAttackStore.subscribe(pushRangeRings);
    const unsubTokens = useTokenStore.subscribe(pushRangeRings);
    const unsubScene = useSceneStore.subscribe(pushRangeRings);
    return () => {
      unsubAttack();
      unsubTokens();
      unsubScene();
    };
  }, [ready, pushRangeRings]);

  // The fog mask is pushed straight to the renderer like the token layer —
  // recompositing a texture must not wait for a React render.
  const pushFog = useCallback(() => {
    const { fog, pending } = useFogStore.getState();
    rendererRef.current?.setFog(fog, pending, useAuthStore.getState().user?.role === ROLE_GM);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushFog();
    const unsubFog = useFogStore.subscribe(pushFog);
    const unsubScene = useSceneStore.subscribe(pushFog);
    return () => {
      unsubFog();
      unsubScene();
    };
  }, [ready, scene, pushFog]);

  // Walls, doors and the field of view bypass React like the tokens do — a
  // recomposited cover must not wait for a render.
  const pushWalls = useCallback(() => {
    const state = useWallStore.getState();
    const isGmNow = useAuthStore.getState().user?.role === ROLE_GM;
    rendererRef.current?.setWalls(state.walls, clickableOpenings(state, isGmNow));
    const current = useSceneStore.getState().effectiveScene;
    // Only a player is covered: the GM sees the whole map and the walls on it.
    const active = !isGmNow && current?.visibility === 'dynamic';
    rendererRef.current?.setVision(state.polygons, active === true, useLightStore.getState().mask);
    // The memory of the map and the GM's overrides go into the same sheet, and
    // only a player has that sheet: for the GM the first is nothing to draw and
    // the second is drawn by the fog layer instead.
    rendererRef.current?.setExploration(isGmNow ? null : useExplorationStore.getState().mask);
    rendererRef.current?.setVisionOverrides(
      isGmNow ? [] : (useFogStore.getState().fog?.overrides ?? []),
    );
  }, []);

  // Cover goes to the renderer the same way and for the same reason (stage
  // 16c) — a car that has just been wrecked has to stop looking solid without
  // waiting for a React render.
  const pushCovers = useCallback(() => {
    rendererRef.current?.setCovers(useCoverStore.getState().covers);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushCovers();
    return useCoverStore.subscribe(pushCovers);
  }, [ready, pushCovers]);

  // Strefy bronione (26f) jadą tą samą drogą co osłony: rozbrojenie systemu ma
  // zgasić szrafirunek od razu, a nie po najbliższym renderze Reacta.
  const pushZones = useCallback(() => {
    rendererRef.current?.setZones(useZoneStore.getState().zones);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushZones();
    return useZoneStore.subscribe(pushZones);
  }, [ready, pushZones]);

  // Smoke rides with the covers (stage 16h): a cloud the GM has just cleared
  // must stop shading the square before anybody rolls in it. The scene is a
  // dependency too — the square is measured in metres, so a grid change moves
  // its edges.
  const pushSmoke = useCallback(() => {
    rendererRef.current?.setSmoke(useSmokeStore.getState().smoke);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushSmoke();
    const unsubSmoke = useSmokeStore.subscribe(pushSmoke);
    const unsubScene = useSceneStore.subscribe(pushSmoke);
    return () => {
      unsubSmoke();
      unsubScene();
    };
  }, [ready, pushSmoke]);

  useEffect(() => {
    if (!ready) return;
    pushWalls();
    const unsubWalls = useWallStore.subscribe(pushWalls);
    const unsubScene = useSceneStore.subscribe(pushWalls);
    const unsubLight = useLightStore.subscribe(pushWalls);
    const unsubExploration = useExplorationStore.subscribe(pushWalls);
    const unsubFog = useFogStore.subscribe(pushWalls);
    return () => {
      unsubWalls();
      unsubScene();
      unsubLight();
      unsubExploration();
      unsubFog();
    };
  }, [ready, scene, pushWalls]);

  /**
   * Lamp handles (GM) and the coloured glow (everyone).
   *
   * The GM's glow is derived locally from the lamp list and the tokens' own
   * lights, because the GM never gets a `vision:sync` — they see everything, so
   * the server never runs a raycast for them. A player's glow comes off the wire
   * already filtered to the lamps they can see.
   */
  const pushLights = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const current = useSceneStore.getState().effectiveScene;
    const state = useLightStore.getState();
    const isGmNow = useAuthStore.getState().user?.role === ROLE_GM;
    if (!current) {
      renderer.setLights([]);
      renderer.setGlows([]);
      return;
    }
    const reachPx = (light: { brightM: number; dimM: number }) =>
      metresToPixels(Math.max(light.brightM, light.dimM), current);

    const markers: LightMarker[] = isGmNow
      ? state.lights.map((light) => ({
          id: light.id,
          x: light.x,
          y: light.y,
          radiusPx: reachPx(light),
          color: light.color,
          enabled: light.enabled,
        }))
      : [];
    renderer.setLights(markers);

    if (!isGmNow) {
      renderer.setGlows(state.glows);
      return;
    }
    // The GM's own preview of the lighting: the lamps plus every torch that is
    // switched on. Only meaningful on a dark scene — on a lit one it would be a
    // wash of colour over a map that needs none.
    if (!current.dark || current.visibility !== 'dynamic') {
      renderer.setGlows([]);
      return;
    }
    // Walls clip the GM's glow the way the darkness cover clips a player's: a
    // lamp inside a sealed room must not pour light through its walls. The GM
    // holds the wall list, so the same raycast the server runs is available
    // here — and windows are not in the blocker set, so light goes through them
    // exactly as it does on the server.
    const segments = [
      ...blockingSegments(useWallStore.getState().walls),
      ...sceneBoundsSegments(current),
    ];
    const clipOf = (x: number, y: number, reach: number) =>
      reach > 0 ? computeVisionPolygon({ x, y }, segments, reach) : undefined;

    const glows: RenderGlow[] = [];
    for (const light of state.lights) {
      if (!light.enabled) continue;
      const reach = reachPx(light);
      glows.push({
        x: light.x,
        y: light.y,
        brightPx: metresToPixels(light.brightM, current),
        dimPx: metresToPixels(light.dimM, current),
        color: light.color,
        flicker: light.flicker,
        clip: clipOf(light.x, light.y, reach),
      });
    }
    for (const token of Object.values(useTokenStore.getState().tokens)) {
      const carried = token.light;
      if (!carried || !carried.on || token.sceneId !== current.id) continue;
      const centre = tokenCentre(token, current);
      glows.push({
        x: centre.x,
        y: centre.y,
        brightPx: metresToPixels(carried.brightM, current),
        dimPx: metresToPixels(carried.dimM, current),
        color: carried.color,
        flicker: carried.flicker,
        clip: clipOf(centre.x, centre.y, reachPx(carried)),
      });
    }
    renderer.setGlows(glows);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushLights();
    const unsubLight = useLightStore.subscribe(pushLights);
    const unsubScene = useSceneStore.subscribe(pushLights);
    const unsubTokens = useTokenStore.subscribe(pushLights);
    return () => {
      unsubLight();
      unsubScene();
      unsubTokens();
    };
  }, [ready, scene, pushLights]);

  /**
   * Gniazda dostępowe (26b). Rysowane każdemu — serwer przysłał tylko te, które
   * ten widz może zobaczyć — a filtr po scenie jest tu dlatego, że store trzyma
   * listę oglądanej sceny, a MG bywa na podglądzie innej.
   */
  const pushAccessPoints = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const current = useSceneStore.getState().effectiveScene;
    const points = useNetRunStore.getState().accessPoints;
    renderer.setAccessPoints(
      current
        ? points
            .filter((point) => point.sceneId === current.id)
            .map((point) => ({
              id: point.id,
              x: point.x,
              y: point.y,
              name: point.name,
              hidden: point.hidden,
              dead: point.architectureId === null,
            }))
        : [],
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushAccessPoints();
    const unsubPoints = useNetRunStore.subscribe(pushAccessPoints);
    const unsubScene = useSceneStore.subscribe(pushAccessPoints);
    return () => {
      unsubPoints();
      unsubScene();
    };
  }, [ready, scene, pushAccessPoints]);

  const pushNotes = useCallback(() => {
    rendererRef.current?.setNotes(Object.values(useNoteStore.getState().notes));
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushNotes();
    return useNoteStore.subscribe(pushNotes);
  }, [ready, pushNotes]);

  // Drawings bypass React like the tokens do: the renderer diffs the store by
  // id, so a busy scene never re-renders the component tree.
  const pushDrawings = useCallback(() => {
    const current = useSceneStore.getState().effectiveScene;
    const all = sortedDrawings(useDrawingStore.getState().drawings);
    rendererRef.current?.setDrawings(
      current ? all.filter((drawing) => drawing.sceneId === current.id) : [],
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushDrawings();
    const unsubDrawings = useDrawingStore.subscribe(pushDrawings);
    const unsubScene = useSceneStore.subscribe(pushDrawings);
    return () => {
      unsubDrawings();
      unsubScene();
    };
  }, [ready, scene, pushDrawings]);

  // Keyboard: M ruler, R draw, G eraser, F fog, N note; Space drops a waypoint
  // mid-measurement, Esc puts the armed tool and the attack crosshair away.
  // Stage 16f added the combat keys — 1–9 for the action bar, Tab for the next
  // figure, E for the end of a turn — to *this* listener rather than to one of
  // its own, so the order in which two keys claim the same press stays written
  // down in a single place.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const tools = useMapToolStore.getState();
      // A one-letter shortcut must not fire while a map dialog is waiting for
      // words. Focus alone is not a reliable guard: a click anywhere outside
      // the field puts it back on the body, and the next keystroke would then
      // change tools under an open editor instead of typing into it.
      // Wyłącznie karta **notatki**, nie każda karta obiektu. Otwarta karta
      // ściany czy lampy nie może zabierać klawiszy narzędzi — MG stawia lampy
      // seriami i przełącza się między warstwami z kartą na wierzchu (błąd
      // znaleziony przy oględzinach 24.08: po otwarciu karty `O` przestawało
      // przełączać na osłony i dorysowywało ścianę).
      const card = useSceneCardStore.getState();
      const typing =
        useDrawingStore.getState().textDraft !== null ||
        card.noteDraft !== null ||
        card.open?.kind === 'note';
      if (typing && event.key !== 'Escape') return;
      // Combat keys first: they are the ones pressed every round, and none of
      // them collides with a map tool (`1`–`9`, Tab and E were all free).
      //
      // Read off `code` rather than `key` since stage 27h: Shift+1 arrives as
      // „!" (and as something else again on another layout), so the digit has
      // to be identified by the *place* on the keyboard. Shift cycles that
      // weapon's fire mode, a bare digit uses it.
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
      if (digit) {
        const context = currentHudContext();
        const group = context.groups.find((entry) => entry.key === digit);
        if (group && context.token) {
          if (event.shiftKey) cycleGroupMode(group, context.token.id);
          else activateGroup(group, context.token.id);
        }
        return;
      }
      if (event.key === 'Tab') {
        // The browser's own focus ring would otherwise walk the side panel.
        event.preventDefault();
        // Cycling starts from the figure on screen, not from the steered one:
        // with the rail defaulting to the player's own token, the first Tab has
        // to move on from what they are already looking at rather than restart
        // the list from its beginning.
        const next = nextSteerableToken(hudFocusTokenId());
        rendererRef.current?.setSelection(next);
        return;
      }
      if (event.key === 'e' || event.key === 'E') {
        // The server re-checks whose turn it is; this only refuses the press
        // that obviously belongs to somebody else, so the key is not a way to
        // step a stranger's turn.
        const combat = useCombatStore.getState().combat;
        const user = useAuthStore.getState().user;
        if (!combat) return;
        if (isGm || myActiveCombatant(combat, user?.id ?? null)) void nextCombatTurn();
        return;
      }
      // Cofanie usunięcia (27k). Przed tabelą narzędzi, bo `Ctrl+Z` nie może
      // przejść przez wyszukiwanie po samej literze — a i tak żaden klawisz
      // narzędzia nie chce modyfikatora.
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
        const current = useSceneStore.getState().effectiveScene;
        if (!current) return;
        event.preventDefault();
        void undoSceneDelete(current.id).then((ack) => {
          useChatStore
            .getState()
            .addNote(
              ack.ok && ack.data ? ack.data.note : undoErrorText(ack.ok ? undefined : ack.error),
            );
        });
        return;
      }
      // `Ctrl+A` — wszystkie figury, którymi ten widz może sterować (etap 35).
      // U MG jest to cała scena, u gracza wyłącznie jego własne: filtr siedzi
      // w rendererze, bo to on ma `movableTokens`, i jest dokładnie ten sam,
      // którym sieje ramka.
      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        rendererRef.current?.selectAllSteerable();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Kasowanie zaznaczonego obiektu scenerii (27k). `Backspace` obok
      // `Delete`, bo na laptopie bez bloku numerycznego to ten sam gest.
      // Figur to **nie** dotyczy — świadome odstępstwo od Foundry: id żetonu
      // noszą inicjatywa i runy Sieci, a klik obok niego jest rozkazem marszu.
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = useSceneSelectionStore.getState().selected;
        if (!selected) return;
        event.preventDefault();
        void removeSceneObject(selected);
        return;
      }
      // Narzędzia mapy idą z `MAP_TOOL_KEYS` (27f), a nie z drabinki `if`-ów:
      // tę samą tabelę czyta okno pomocy `?`, więc lista skrótów nie ma jak
      // rozjechać się z tym, co klawisze naprawdę robią.
      const binding = MAP_TOOL_KEYS.find((entry) => entry.key === event.key.toLowerCase());
      if (binding) {
        if (!binding.gmOnly || isGm) tools.toggleTool(binding.tool);
        return;
      }
      // Enter closes the wall chain being traced, the way it ends a polygon in
      // any drawing program; the last corner clicked twice does the same.
      if (event.key === 'Enter' && tools.tool === 'wall') {
        rendererRef.current?.finishWallChain();
        return;
      }
      if (event.key === ' ' && useRulerStore.getState().local) {
        event.preventDefault();
        rendererRef.current?.addRulerWaypoint();
        return;
      }
      // Escape is a ladder, not a switch (stage 16f): one rung per press, most
      // recent commitment first. „Never mind" should undo the last thing you
      // did, and a key that dropped everything at once would cost the selection
      // every time somebody meant to lower a weapon.
      if (event.key === 'Escape') {
        const renderer = rendererRef.current;
        const hud = useHudStore.getState();
        if (renderer?.isMarching()) {
          renderer.interruptWalk('Marsz przerwany.');
          return;
        }
        if (useAttackStore.getState().targeting) {
          useAttackStore.getState().disarm();
          return;
        }
        if (hud.form) {
          hud.setForm(null);
          return;
        }
        if (hud.activeWeapon) {
          hud.setActiveWeapon(null);
          return;
        }
        if (useDrawingStore.getState().textDraft) {
          useDrawingStore.getState().setTextDraft(null);
          return;
        }
        // The first Esc drops the chain being traced, the second puts the tool
        // away — otherwise one mis-click would cost the whole floor plan, and
        // an Esc that only ever cancelled would leave no way out of the tool.
        if (tools.tool === 'wall' && renderer?.cancelWallChain()) return;
        // The cover tool gets the same two-step treatment (stage 16c): the
        // first Esc drops the rectangle being dragged out, the second the tool.
        if (tools.tool === 'cover' && renderer?.cancelCoverRect()) return;
        // Szczebel z 27l: otwarta karta schodzi **przed** zaznaczeniem. Karta
        // jest ostatnią rzeczą, którą się otworzyło, a `Esc` znaczy „cofnij to,
        // co przed chwilą" — zdjęcie razem z nią obrysu kosztowałoby drugie
        // kliknięcie w ten sam kamień.
        if (useSceneCardStore.getState().open || useSceneCardStore.getState().noteDraft) {
          useSceneCardStore.getState().close();
          return;
        }
        // Szczebel z 27k: zaznaczony obiekt schodzi **przed** narzędziem.
        // Odwrotna kolejność zabierałaby warstwę razem z zaznaczeniem, więc
        // „nie ten kamień" kosztowałoby ponowne wciśnięcie klawisza narzędzia.
        if (useSceneSelectionStore.getState().selected) {
          useSceneSelectionStore.getState().select(null);
          return;
        }
        // Szczebel z 35: zaznaczenie grupowe schodzi **przed** narzędziem i
        // przed pojedynczą figurą. Sześć obwódek jest najświeższą rzeczą, którą
        // się zrobiło, a `Esc` cofa najświeższą — i zdejmowanie ich razem
        // z narzędziem kosztowałoby ponowne wejście w warstwę.
        if (useSelectionStore.getState().groupIds.length > 0) {
          useSelectionStore.getState().clearGroup();
          return;
        }
        if (tools.tool !== 'pointer') {
          tools.setTool('pointer');
          return;
        }
        // The last rung empties the rail too — same „never mind" as a right
        // click on bare map, and the only way to a blank panel on purpose.
        renderer?.setSelection(null, 'dismiss');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGm]);

  return (
    <section className={`map-area${!scene && displayScene ? ' map-area--welcome' : ''}`}>
      <div
        ref={hostRef}
        className={`map-canvas-host ${placement ? 'map-canvas-host--placing' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Gracz pod mapą powitalną nie dostaje żadnego napisu (decyzja MG,
          11.09) — to ma być świat, a nie komunikat. Zdanie wraca, gdy tła nie
          ma czym zastąpić pustki: na świeżym klonie bez pliku w `uploads/`. */}
      {!scene && (isGm || welcome === null) && (
        <div className="map-overlay">
          <p className="placeholder-text">
            {isGm
              ? 'Brak sceny — utwórz i aktywuj ją w zakładce „Sceny”.'
              : 'Brak aktywnej sceny — MG musi ją aktywować.'}
          </p>
        </div>
      )}
      {loading && (
        <div className="map-overlay">
          <span className="map-spinner" aria-hidden />
          <p className="placeholder-text">Wczytywanie mapy…</p>
        </div>
      )}
      {placement && (
        <div className="map-placement-hint">
          Kliknij na mapie, aby postawić „{placement.name}” (Esc anuluje)
        </div>
      )}
      {targeting && (
        <div className="map-placement-hint map-placement-hint--attack">
          {targeting.characterName} celuje: „{targeting.weaponName}”
          {CPRED_ATTACK_MODE_SHORT[targeting.mode]
            ? ` — ${CPRED_ATTACK_MODE_SHORT[targeting.mode]}`
            : ''}
          {' — kliknij cel na mapie (Esc anuluje)'}
        </div>
      )}
      {/* Visibility comes from tokens alone, so „no token" means „no map". The
          hint is what keeps that from reading as a broken connection. */}
      {!isGm && scene?.visibility === 'dynamic' && hasVision && seesNothing && (
        <div className="map-placement-hint">
          Nie masz tokenu na tej scenie — MG musi go wystawić, żebyś cokolwiek zobaczył
        </div>
      )}
      <MapTools />
      <TokenGroupBar />
      <TargetTooltip hover={aimHover} />
      <AimMenu />
      <DrawingTextEditor />
      <SceneObjectCard onDelete={(ref) => void removeSceneObject(ref)} />
      {menu && <TokenContextMenu menu={menu} onClose={() => setMenu(null)} />}
      <SightingWindow />
    </section>
  );
}
