/**
 * Kształt haka `window.__vttE2E` z `packages/client/src/e2e-hook.ts` — powtórzony
 * tu, bo suita nie kompiluje się razem z klientem. Zmiana tam = zmiana tu.
 */
interface VttE2EPoint {
  x: number;
  y: number;
}

interface Window {
  __vttE2E?: {
    worldToClient(point: VttE2EPoint): VttE2EPoint | null;
    stores: Record<string, { getState(): unknown }>;
    counts(): {
      pixi: Record<string, number> | null;
      dice: Record<string, number> | null;
      dom: { nodes: number; canvases: number };
    };
  };
}
