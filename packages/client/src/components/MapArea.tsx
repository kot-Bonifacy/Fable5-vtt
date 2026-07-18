import { useCallback, useEffect, useRef, useState } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { MapRenderer } from '../map/MapRenderer.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { ensureStatusesLoaded, useTokenStore } from '../stores/tokenStore.js';
import { createToken, sendTokenMove } from '../socket.js';
import { TokenContextMenu } from './TokenContextMenu.js';

export interface TokenMenuState {
  tokenId: string;
  x: number;
  y: number;
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

  useEffect(() => {
    if (ready) rendererRef.current?.setScene(scene);
  }, [ready, scene]);

  // The token layer bypasses React: the renderer diffs store snapshots
  // directly, so 20 Hz drag updates never re-render the component tree.
  useEffect(() => {
    if (!ready) return;
    const push = () => {
      const tokenState = useTokenStore.getState();
      const current = useSceneStore.getState().effectiveScene;
      const user = useAuthStore.getState().user;
      rendererRef.current?.setTokens(current ? Object.values(tokenState.tokens) : [], {
        gridSizePx: current?.grid.sizePx ?? 100,
        myUserId: user?.id ?? null,
        isGm: user?.role === ROLE_GM,
        statusIcons: new Map(tokenState.statuses.map((s) => [s.id, s.icon])),
      });
    };
    push();
    const unsubTokens = useTokenStore.subscribe(push);
    const unsubScene = useSceneStore.subscribe(push);
    return () => {
      unsubTokens();
      unsubScene();
    };
  }, [ready]);

  useEffect(() => {
    if (!placement) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useTokenStore.getState().setPlacement(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placement]);

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
      {menu && <TokenContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  );
}
