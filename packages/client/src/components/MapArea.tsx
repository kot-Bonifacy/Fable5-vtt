import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CPRED_RANGE_BANDS,
  ROLE_GM,
  metresPerPixel,
  metresToPixels,
  pickDrawingAt,
  pickWallAt,
  tokenCentre,
} from '@vtt/shared';
import type { LightGlow } from '@vtt/shared';
import {
  MapRenderer,
  type LightMarker,
  type RangeRing,
  type RulerLine,
} from '../map/MapRenderer.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureStatusesLoaded, useTokenStore } from '../stores/tokenStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { activeTokenIdOf, useCombatStore } from '../stores/combatStore.js';
import {
  clearRuler,
  createDrawing,
  createLight,
  createToken,
  createWalls,
  deleteDrawing,
  deleteLight,
  deleteWall,
  paintFog,
  sendRuler,
  sendTokenMove,
  toggleDoor,
  updateLight,
} from '../socket.js';
import { loadAttackAtToken } from '../attack-targeting.js';
import { useAttackStore } from '../stores/attackStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useNoteStore } from '../stores/noteStore.js';
import { sortedDrawings, useDrawingStore } from '../stores/drawingStore.js';
import { clickableDoors, useWallStore } from '../stores/wallStore.js';
import { pickLightAt, useLightStore } from '../stores/lightStore.js';
import { currentDrawingStyle, useMapToolStore } from '../stores/mapToolStore.js';
import { TokenContextMenu } from './TokenContextMenu.js';
import { CombatBar } from './CombatBar.js';
import { DrawingTextEditor } from './DrawingTextEditor.js';
import { MapTools } from './MapTools.js';
import { NoteEditor } from './NoteEditor.js';

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

/** Polish hints for `door:toggle`. */
function doorErrorText(code: string | undefined): string {
  switch (code) {
    case 'FORBIDDEN':
      return 'Tych drzwi nie otworzysz — MG ich nie udostępnił.';
    case 'WALL_NOT_FOUND':
      return 'Nie widzisz tych drzwi.';
    default:
      return `Nie udało się poruszyć drzwiami: ${code ?? 'nieznany błąd'}.`;
  }
}

export function MapArea() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<TokenMenuState | null>(null);
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
  const lightMode = useMapToolStore((s) => s.lightMode);
  const targeting = useAttackStore((s) => s.targeting);
  const hasVision = useWallStore((s) => s.hasVision);
  const seesNothing = useWallStore((s) => s.polygons.length === 0);

  useEffect(() => {
    ensureStatusesLoaded();
  }, []);

  const placeToken = useCallback((worldX: number, worldY: number) => {
    const pending = useTokenStore.getState().placement;
    const current = useSceneStore.getState().effectiveScene;
    if (!pending || !current) return;
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
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new MapRenderer();
    renderer.onLoadingChange = setLoading;
    renderer.onMapClick = placeToken;
    renderer.onTokenMove = (tokenId, x, y, final) => {
      const ack = sendTokenMove(tokenId, x, y, final);
      void ack?.then((result) => {
        if (result.ok && result.data) {
          useTokenStore.getState().applyMove(tokenId, result.data.x, result.data.y);
        }
      });
    };
    renderer.onTokenMenu = (tokenId, clientX, clientY) => {
      if (useAuthStore.getState().user?.role === ROLE_GM) {
        setMenu({ tokenId, x: clientX, y: clientY });
      }
    };
    renderer.onTokenActivate = (tokenId) => openSheetOfToken(tokenId);
    renderer.onTokenTarget = (tokenId) => loadAttackAtToken(tokenId);
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
      void createWalls(current.id, points, tools.wallKind, tools.wallPlayerToggle).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(wallErrorText(ack.error));
      });
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
    renderer.onDoorToggle = (wallId) => {
      void toggleDoor(wallId).then((ack) => {
        if (!ack.ok) useChatStore.getState().addNote(doorErrorText(ack.error));
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
      // Clicking a lamp that is already there retunes it to the panel's
      // settings — which is what makes the panel double as the editor.
      const existing = pickLightAt(
        useLightStore.getState().lights,
        { x, y },
        lightGrabTolerance(current.grid.sizePx),
      );
      const request = existing
        ? updateLight(existing.id, spec)
        : createLight(current.id, x, y, spec);
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
    lightMode,
  ]);

  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setTargeting(targeting !== null);
  }, [ready, targeting]);

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
    rendererRef.current?.setWalls(state.walls, clickableDoors(state, isGmNow));
    const current = useSceneStore.getState().effectiveScene;
    // Only a player is covered: the GM sees the whole map and the walls on it.
    const active = !isGmNow && current?.visibility === 'dynamic';
    rendererRef.current?.setVision(state.polygons, active === true, useLightStore.getState().mask);
  }, []);

  useEffect(() => {
    if (!ready) return;
    pushWalls();
    const unsubWalls = useWallStore.subscribe(pushWalls);
    const unsubScene = useSceneStore.subscribe(pushWalls);
    const unsubLight = useLightStore.subscribe(pushWalls);
    return () => {
      unsubWalls();
      unsubScene();
      unsubLight();
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
    const glows: LightGlow[] = [];
    for (const light of state.lights) {
      if (!light.enabled) continue;
      glows.push({
        x: light.x,
        y: light.y,
        brightPx: metresToPixels(light.brightM, current),
        dimPx: metresToPixels(light.dimM, current),
        color: light.color,
        flicker: light.flicker,
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
      if (event.key === 'Escape') {
        if (useAttackStore.getState().targeting) useAttackStore.getState().disarm();
        if (useDrawingStore.getState().textDraft) useDrawingStore.getState().setTextDraft(null);
        // The first Esc drops the chain being traced, the second puts the tool
        // away — otherwise one mis-click would cost the whole floor plan, and
        // an Esc that only ever cancelled would leave no way out of the tool.
        if (tools.tool === 'wall' && rendererRef.current?.cancelWallChain()) return;
        if (tools.tool !== 'pointer') tools.setTool('pointer');
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
          {targeting.mode !== 'single'
            ? ` — ${targeting.mode === 'autofire' ? 'seria' : 'zapora'}`
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
      <CombatBar />
      <DrawingTextEditor />
      {isGm && <NoteEditor />}
      {menu && <TokenContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  );
}
