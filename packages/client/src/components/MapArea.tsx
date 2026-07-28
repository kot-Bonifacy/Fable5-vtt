import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CPRED_RANGE_BANDS,
  ROLE_GM,
  metresPerPixel,
  pickDrawingAt,
  tokenCentre,
} from '@vtt/shared';
import { MapRenderer, type RangeRing, type RulerLine } from '../map/MapRenderer.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureStatusesLoaded, useTokenStore } from '../stores/tokenStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { activeTokenIdOf, useCombatStore } from '../stores/combatStore.js';
import {
  clearRuler,
  createDrawing,
  createToken,
  deleteDrawing,
  paintFog,
  sendRuler,
  sendTokenMove,
} from '../socket.js';
import { loadAttackAtToken } from '../attack-targeting.js';
import { useAttackStore } from '../stores/attackStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { useFogStore } from '../stores/fogStore.js';
import { useNoteStore } from '../stores/noteStore.js';
import { sortedDrawings, useDrawingStore } from '../stores/drawingStore.js';
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
  const targeting = useAttackStore((s) => s.targeting);

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
      if (event.key === ' ' && useRulerStore.getState().local) {
        event.preventDefault();
        rendererRef.current?.addRulerWaypoint();
        return;
      }
      if (event.key === 'Escape') {
        if (useAttackStore.getState().targeting) useAttackStore.getState().disarm();
        if (useDrawingStore.getState().textDraft) useDrawingStore.getState().setTextDraft(null);
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
