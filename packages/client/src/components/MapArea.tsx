import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CPRED_ATTACK_MODE_SHORT,
  CPRED_BLAST_SIDE_M,
  CPRED_RANGE_BANDS,
  ROLE_GM,
  blockingSegments,
  computeVisionPolygon,
  coverMovementSegments,
  cpredMovementBlock,
  isOpening,
  isPointInPolygon,
  isPointVisible,
  isSegmentClear,
  metresPerPixel,
  metresToPixels,
  movementSegments,
  pickDrawingAt,
  pickWallAt,
  sceneBoundsSegments,
  tokenCentre,
  type CombatView,
  type ScenePoint,
  type TokenView,
  type WallKind,
} from '@vtt/shared';
import {
  MapRenderer,
  type LightMarker,
  type MoveAllowance,
  type RangeRing,
  type RenderGlow,
  type RulerLine,
} from '../map/MapRenderer.js';
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
import {
  clearRuler,
  createCover,
  createDrawing,
  createLight,
  createToken,
  createWalls,
  deleteCover,
  deleteDrawing,
  deleteLight,
  deleteWall,
  nextCombatTurn,
  paintFog,
  sendRuler,
  sendTokenMove,
  toggleOpening,
  updateLight,
  updateWall,
} from '../socket.js';
import { loadAttackAtToken } from '../attack-targeting.js';
import {
  activateSlot,
  attackWithActiveWeapon,
  currentHudContext,
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
import { pickLightAt, useLightStore } from '../stores/lightStore.js';
import { coverAt, useCoverStore } from '../stores/coverStore.js';
import {
  currentDrawingStyle,
  currentPlayerToggle,
  ensureCoverCatalogueLoaded,
  useMapToolStore,
} from '../stores/mapToolStore.js';
import { TokenContextMenu } from './TokenContextMenu.js';
import { DrawingTextEditor } from './DrawingTextEditor.js';
import { MapTools } from './MapTools.js';
import { NoteEditor } from './NoteEditor.js';
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

/** Polish hints for the rejections `drawing:create` can come back with. */
function drawingErrorText(code: string | undefined): string {
  switch (code) {
    case 'DRAWING_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba rysunków — wyczyść część z nich.';
    case 'SCENE_NOT_VIEWED':
      return 'Ta scena nie jest już wyświetlana — rysunek nie został zapisany.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — rysunek nie został zapisany.';
    default:
      return `Nie udało się zapisać rysunku: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Polish hints for the rejections `wall:create` can come back with. */
function wallErrorText(code: string | undefined): string {
  switch (code) {
    case 'WALL_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba ścian.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — ściana nie została zapisana.';
    default:
      return `Nie udało się zapisać ściany: ${code ?? 'nieznany błąd'}.`;
  }
}

/** Polish hints for the rejections the cover events can come back with. */
function coverErrorText(code: string | undefined): string {
  switch (code) {
    case 'COVER_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba osłon.';
    case 'COVER_NOT_FOUND':
      return 'Ta osłona już nie istnieje — odśwież stronę.';
    case 'UNKNOWN_COVER_TYPE':
      return 'Nie znam takiego rodzaju osłony — sprawdź katalog w data/public.';
    case 'COVER_HAS_NO_HP':
      return 'To nie jest osłona: taki materiał nie zatrzyma kuli (podręcznik, s. 179).';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — osłona nie została zapisana.';
    default:
      return `Nie udało się zmienić osłony: ${code ?? 'nieznany błąd'}.`;
  }
}

/**
 * How close a click has to be to a lamp handle to hit it, in scene pixels.
 * Scaled with the grid for the reason the wall and drawing erasers are: at a
 * typical 0.18× map zoom a fixed pixel radius is a target nobody can hit.
 */
function lightGrabTolerance(gridSizePx: number): number {
  return Math.max(12, gridSizePx / 3);
}

/** Polish hints for the rejections the light events can come back with. */
function lightErrorText(code: string | undefined): string {
  switch (code) {
    case 'LIGHT_LIMIT_REACHED':
      return 'Na tej scenie jest już maksymalna liczba świateł.';
    case 'LIGHT_NOT_FOUND':
      return 'To światło już nie istnieje — odśwież stronę.';
    case 'NO_LIGHT':
      return 'Ten token nie ma latarki — MG musi ją najpierw ustawić.';
    case 'FORBIDDEN':
      return 'To nie twój token.';
    case 'NOT_CONNECTED':
      return 'Brak połączenia z serwerem — zmiana światła nie została zapisana.';
    default:
      return `Nie udało się zmienić światła: ${code ?? 'nieznany błąd'}.`;
  }
}

/**
 * Polish hints for `opening:toggle`, worded for whichever thing was clicked.
 *
 * The kind comes from the client's own list rather than from the ack: the server
 * says why it refused, and the map already knows what the player reached for.
 */
function openingErrorText(code: string | undefined, kind: WallKind | undefined): string {
  const isWindow = kind === 'window';
  switch (code) {
    case 'FORBIDDEN':
      return isWindow
        ? 'Tego okna nie ruszysz — MG go nie udostępnił.'
        : 'Tych drzwi nie otworzysz — MG ich nie udostępnił.';
    case 'WALL_NOT_FOUND':
      return isWindow ? 'Nie widzisz tego okna.' : 'Nie widzisz tych drzwi.';
    // Stage 18d. „Za daleko" names the thing, which is safe — the player was
    // shown it. „Zamknięte na klucz" is only ever said to someone whose token
    // stands at the handle, so the message is the character's discovery.
    case 'OPENING_OUT_OF_REACH':
      return isWindow
        ? 'Za daleko — podejdź do okna (na jedną kratkę).'
        : 'Za daleko — podejdź do drzwi (na jedną kratkę).';
    case 'OPENING_LOCKED':
      return isWindow
        ? 'Okno zamknięte na skobel — nie ustąpi.'
        : 'Zamknięte na klucz — same drzwi nie ustąpią.';
    default:
      return isWindow
        ? `Nie udało się poruszyć oknem: ${code ?? 'nieznany błąd'}.`
        : `Nie udało się poruszyć drzwiami: ${code ?? 'nieznany błąd'}.`;
  }
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
    case 'TOKEN_NOT_FOUND':
      return 'Nie znaleziono tokenu — odśwież stronę.';
    default:
      return `Nie udało się przesunąć tokenu: ${code ?? 'nieznany błąd'}.`;
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
  if (!active || !distance) return null;
  if (!isGm && active.ownerId !== userId) return null;
  return {
    tokenId: active.tokenId,
    metresLeft: Math.max(0, distance.max - distance.used),
    costFactor: distance.hard ? 2 : 1,
    // The GM is never refused a move — going past the budget is logged as
    // „poza budżetem" and happens (stage 14b) — so their route is drawn against
    // the budget but never cut by it.
    enforced: !isGm,
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
): string | null {
  if (!tokenId || isGm) return null;
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
  const scene = useSceneStore((s) => s.effectiveScene);
  const placement = useTokenStore((s) => s.placement);
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
  const wallMode = useMapToolStore((s) => s.wallMode);
  const wallKind = useMapToolStore((s) => s.wallKind);
  const wallSnapGrid = useMapToolStore((s) => s.wallSnapGrid);
  const coverMode = useMapToolStore((s) => s.coverMode);
  const lightMode = useMapToolStore((s) => s.lightMode);
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
    const pending = useTokenStore.getState().placement;
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
    });
    useTokenStore.getState().setPlacement(null);
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
      const before = useTokenStore.getState().tokens[tokenId];
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
        if (before) renderer.snapTokenBack(tokenId, before.x, before.y);
        useChatStore.getState().addNote(moveErrorText(result.error));
      });
    };
    // Steering and „what the left rail is describing" are two pointers, and the
    // reason is what tells them apart: a right click drops both, a scene swap
    // sends the rail back to what it remembered on the new map, and everything
    // else leaves the rail where it was — that is the whole of „remember the
    // last figure I clicked".
    renderer.onSelectionChange = (tokenId, reason) => {
      const selection = useSelectionStore.getState();
      if (reason === 'dismiss') selection.dismiss();
      else if (reason === 'scene') selection.resetFocus();
      else selection.select(tokenId);
    };
    // The rail's buttons take control of the figure they belong to; the ring
    // and the walk preview live in the renderer, so the request goes there.
    setSteerHandler((tokenId) => renderer.setSelection(tokenId));
    renderer.onWalkNote = (text) => useChatStore.getState().addNote(text);
    renderer.onWalkStateChange = setMarchingTokenId;
    renderer.onTokenMenu = (tokenId, clientX, clientY) => {
      if (useAuthStore.getState().user?.role === ROLE_GM) {
        setMenu({ tokenId, x: clientX, y: clientY });
      }
    };
    renderer.onTokenActivate = (tokenId) => openSheetOfToken(tokenId);
    // Two doors into one attack (stage 16f). A crosshair armed from a sheet or
    // from the „Walka" tab already named its weapon, so it wins; otherwise the
    // shot is fired with whatever the action bar has in hand.
    renderer.onTokenTarget = (tokenId) => {
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
    renderer.onNotePlace = (x, y) => useNoteStore.getState().setDraft({ x, y });
    renderer.onNoteActivate = (noteId) => useNoteStore.getState().setEditing(noteId);
    renderer.onDrawingCreate = (shape) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
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
    renderer.onDrawingErase = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      const user = useAuthStore.getState().user;
      if (!current || !user) return;
      // Scale the grab radius with the zoom: at 0.18× a six-pixel line is one
      // screen pixel wide, and „click exactly on it" would be unusable.
      const tolerance = Math.max(6, current.grid.sizePx / 6);
      const target = pickDrawingAt(
        sortedDrawings(useDrawingStore.getState().drawings).filter(
          (drawing) => drawing.sceneId === current.id,
        ),
        { x, y },
        tolerance,
        // A player reaches through someone else's line to their own beneath it;
        // the server enforces the same rule regardless of what the UI offers.
        (drawing) => user.role === ROLE_GM || drawing.authorId === user.id,
      );
      if (target) void deleteDrawing(target.id);
    };
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
    renderer.onWallErase = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      // The same zoom-scaled grab radius the drawing eraser uses: at 0.18x a
      // wall is a couple of screen pixels and „click exactly on it" is not a
      // thing anyone can do.
      const tolerance = Math.max(8, current.grid.sizePx / 5);
      const target = pickWallAt(useWallStore.getState().walls, { x, y }, tolerance);
      if (target) void deleteWall(target.id);
    };
    renderer.onWallLock = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const tolerance = Math.max(8, current.grid.sizePx / 5);
      // Openings only: a bolt on a plain wall would be a promise nothing keeps,
      // and letting the pick land on one would silently do nothing.
      const openings = useWallStore.getState().walls.filter(isOpening);
      const target = pickWallAt(openings, { x, y }, tolerance);
      if (!target) {
        useChatStore
          .getState()
          .addNote('Kliknij drzwi albo okno — zamek zakłada się tylko na nich.');
        return;
      }
      void updateWall(target.id, { locked: !target.locked }).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(wallErrorText(ack.error));
      });
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
    renderer.onCoverErase = (x, y) => {
      const target = coverAt({ x, y });
      if (!target) return;
      void deleteCover(target.id).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(coverErrorText(ack.error));
      });
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
      const fitRoom = tools.lightFitRoom;
      // Clicking a lamp that is already there retunes it to the panel's
      // settings — which is what makes the panel double as the editor.
      const existing = pickLightAt(
        useLightStore.getState().lights,
        { x, y },
        lightGrabTolerance(current.grid.sizePx),
      );
      const request = existing
        ? updateLight(existing.id, spec, fitRoom)
        : createLight(current.id, x, y, { ...spec, fitRoom });
      void request.then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(lightErrorText(ack.error));
      });
    };
    renderer.onLightErase = (x, y) => {
      const current = useSceneStore.getState().effectiveScene;
      if (!current) return;
      const target = pickLightAt(
        useLightStore.getState().lights,
        { x, y },
        lightGrabTolerance(current.grid.sizePx),
      );
      if (target) void deleteLight(target.id);
    };
    renderer.onLightToggle = (lightId) => {
      const light = useLightStore.getState().lights.find((entry) => entry.id === lightId);
      if (!light) return;
      void updateLight(lightId, { enabled: !light.enabled }).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(lightErrorText(ack.error));
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
      activeTokenId: activeTokenIdOf(useCombatStore.getState().combat),
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setScene(scene);
    // A scene change wipes the token layer, and the store subscription below
    // may have already delivered this scene's tokens (state:sync fills the
    // stores before React runs this effect) — re-push, or the map stays empty
    // until the next token event.
    pushTokens();
  }, [ready, scene, pushTokens]);

  useEffect(() => {
    if (!ready) return;
    pushTokens();
    const unsubTokens = useTokenStore.subscribe(pushTokens);
    const unsubScene = useSceneStore.subscribe(pushTokens);
    const unsubCombat = useCombatStore.subscribe(pushTokens);
    return () => {
      unsubTokens();
      unsubScene();
      unsubCombat();
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
    if (!wallState.hasVision) {
      renderer.setWalkPassable(
        () => true,
        coverEdges.length > 0 ? (from, to) => isSegmentClear(from, to, coverEdges) : undefined,
      );
      return;
    }
    const polygons = wallState.polygons;
    renderer.setWalkPassable(
      (point) => isPointVisible(point, polygons),
      coverEdges.length > 0 ? (from, to) => isSegmentClear(from, to, coverEdges) : undefined,
    );
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
      ),
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushWalkRefusal();
    const unsubSelection = useSelectionStore.subscribe(pushWalkRefusal);
    const unsubCombat = useCombatStore.subscribe(pushWalkRefusal);
    const unsubTokens = useTokenStore.subscribe(pushWalkRefusal);
    return () => {
      unsubSelection();
      unsubCombat();
      unsubTokens();
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
      if (event.key === 'Escape') useTokenStore.getState().setPlacement(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placement]);

  // Tools are renderer modes, not React state — push the flags.
  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setRulerMode(tool === 'ruler');
    rendererRef.current?.setNotePlacing(tool === 'note' && isGm);
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
    rendererRef.current?.setErasing(tool === 'erase');
    rendererRef.current?.setWallMode({
      armed: tool === 'wall' && isGm,
      mode: wallMode,
      kind: wallKind,
      snapGrid: wallSnapGrid,
    });
    rendererRef.current?.setCoverTool({ armed: tool === 'cover' && isGm, mode: coverMode });
    rendererRef.current?.setLightTool({ armed: tool === 'light' && isGm, mode: lightMode });
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
    wallMode,
    wallKind,
    wallSnapGrid,
    coverMode,
    lightMode,
  ]);

  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setTargeting(targeting !== null);
  }, [ready, targeting]);

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
      const noteState = useNoteStore.getState();
      const typing =
        useDrawingStore.getState().textDraft !== null ||
        noteState.draft !== null ||
        noteState.editingId !== null;
      if (typing && event.key !== 'Escape') return;
      // Combat keys first: they are the ones pressed every round, and none of
      // them collides with a map tool (`1`–`9`, Tab and E were all free).
      if (event.key >= '1' && event.key <= '9') {
        const context = currentHudContext();
        const slot = context.slots.find((entry) => entry.key === event.key);
        if (slot && context.token) activateSlot(slot, context.token.id);
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
      if (event.key === 'm' || event.key === 'M') {
        tools.toggleTool('ruler');
        return;
      }
      if (event.key === 'r' || event.key === 'R') {
        tools.toggleTool('draw');
        return;
      }
      if (event.key === 'g' || event.key === 'G') {
        tools.toggleTool('erase');
        return;
      }
      if ((event.key === 'f' || event.key === 'F') && isGm) {
        tools.toggleTool('fog');
        return;
      }
      if ((event.key === 'n' || event.key === 'N') && isGm) {
        tools.toggleTool('note');
        return;
      }
      if ((event.key === 'w' || event.key === 'W') && isGm) {
        tools.toggleTool('wall');
        return;
      }
      if ((event.key === 'o' || event.key === 'O') && isGm) {
        tools.toggleTool('cover');
        return;
      }
      if ((event.key === 'l' || event.key === 'L') && isGm) {
        tools.toggleTool('light');
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
    <section className="map-area">
      <div
        ref={hostRef}
        className={`map-canvas-host ${placement ? 'map-canvas-host--placing' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!scene && (
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
      {isGm && tool === 'note' && (
        <div className="map-placement-hint">
          Kliknij na mapie, by wbić pinezkę notatki (Esc anuluje)
        </div>
      )}
      {isGm && tool === 'wall' && (
        <div className="map-placement-hint">
          {wallMode === 'erase'
            ? 'Kliknij ścianę, by ją usunąć (Esc kończy)'
            : wallMode === 'lock'
              ? 'Kliknij drzwi albo okno, by założyć lub zdjąć zamek (zakładanie je zamyka; Esc kończy)'
              : 'Klikaj kolejne narożniki; Enter lub klik w ostatni punkt kończy ścianę (Esc anuluje)'}
        </div>
      )}
      {isGm && tool === 'light' && (
        <div className="map-placement-hint">
          {lightMode === 'erase'
            ? 'Kliknij światło, by je usunąć (Esc kończy)'
            : 'Kliknij mapę, by postawić światło; klik w istniejące zmienia je na ustawienia z panelu (Esc kończy)'}
        </div>
      )}
      {/* Visibility comes from tokens alone, so „no token" means „no map". The
          hint is what keeps that from reading as a broken connection. */}
      {!isGm && scene?.visibility === 'dynamic' && hasVision && seesNothing && (
        <div className="map-placement-hint">
          Nie masz tokenu na tej scenie — MG musi go wystawić, żebyś cokolwiek zobaczył
        </div>
      )}
      {tool === 'draw' && drawTool === 'text' && (
        <div className="map-placement-hint">Kliknij na mapie, by postawić podpis (Esc anuluje)</div>
      )}
      <MapTools />
      <TargetTooltip hover={aimHover} />
      <DrawingTextEditor />
      {isGm && <NoteEditor />}
      {menu && <TokenContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  );
}
