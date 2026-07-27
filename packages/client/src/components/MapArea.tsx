import { useCallback, useEffect, useRef, useState } from 'react';
import { CPRED_RANGE_BANDS, ROLE_GM, metresPerPixel, tokenCentre } from '@vtt/shared';
import { MapRenderer, type RangeRing, type RulerLine } from '../map/MapRenderer.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureStatusesLoaded, useTokenStore } from '../stores/tokenStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { activeTokenIdOf, useCombatStore } from '../stores/combatStore.js';
import { clearRuler, createToken, sendRuler, sendTokenMove } from '../socket.js';
import { loadAttackAtToken } from '../attack-targeting.js';
import { useAttackStore } from '../stores/attackStore.js';
import { useRulerStore } from '../stores/rulerStore.js';
import { TokenContextMenu } from './TokenContextMenu.js';
import { CombatBar } from './CombatBar.js';
import { MapTools } from './MapTools.js';

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

export function MapArea() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<TokenMenuState | null>(null);
  const scene = useSceneStore((s) => s.effectiveScene);
  const placement = useTokenStore((s) => s.placement);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const rulerActive = useRulerStore((s) => s.toolActive);
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

  // Ruler and crosshair are renderer modes, not React state — push the flags.
  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setRulerMode(rulerActive);
  }, [ready, rulerActive]);

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

  // Keyboard: M arms the ruler, Space drops a waypoint mid-measurement, Esc
  // puts both the ruler and the crosshair away.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'm' || event.key === 'M') {
        useRulerStore.getState().toggleTool();
        return;
      }
      if (event.key === ' ' && useRulerStore.getState().local) {
        event.preventDefault();
        rendererRef.current?.addRulerWaypoint();
        return;
      }
      if (event.key === 'Escape') {
        if (useAttackStore.getState().targeting) useAttackStore.getState().disarm();
        if (useRulerStore.getState().toolActive) useRulerStore.getState().setToolActive(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          {targeting.mode !== 'single' ? ` — ${targeting.mode === 'autofire' ? 'seria' : 'zapora'}` : ''}
          {' — kliknij cel na mapie (Esc anuluje)'}
        </div>
      )}
      <MapTools />
      <CombatBar />
      {menu && <TokenContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  );
}
