import { useEffect, useRef, useState } from 'react';
import { MapRenderer } from '../map/MapRenderer.js';
import { useSceneStore } from '../stores/sceneStore.js';

export function MapArea() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const scene = useSceneStore((s) => s.effectiveScene);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new MapRenderer();
    renderer.onLoadingChange = setLoading;
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
  }, []);

  useEffect(() => {
    if (ready) rendererRef.current?.setScene(scene);
  }, [ready, scene]);

  return (
    <section className="map-area">
      <div ref={hostRef} className="map-canvas-host" />
      {!scene && (
        <div className="map-overlay">
          <p className="placeholder-text">Brak aktywnej sceny — MG musi ją aktywować.</p>
        </div>
      )}
      {loading && (
        <div className="map-overlay">
          <span className="map-spinner" aria-hidden />
          <p className="placeholder-text">Wczytywanie mapy…</p>
        </div>
      )}
    </section>
  );
}
