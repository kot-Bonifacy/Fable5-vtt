import { BigPool, GraphicsContextRenderData, type DestroyOptions } from 'pixi.js';

/**
 * Jak zdejmuje się z mapy węzeł razem z całym jego poddrzewem (#50, 02.10).
 *
 * Pixi v8 niszczy `GraphicsContext` grafiki tylko przy gołym `destroy()` albo
 * przy `context: true` — samo `{ children: true }` zostawia kontekst każdej
 * grafiki-dziecka w `GraphicsContextSystem` renderera razem z jego geometrią
 * (bufory WebGL, tablice wierzchołków). Każde przełączenie sceny zostawiało tak
 * u MG ~3 MB. Żaden kontekst w kliencie nie jest współdzielony między grafikami,
 * więc `context: true` niczego cudzego nie zabiera.
 */
export const DESTROY_TREE: DestroyOptions = { children: true, context: true };

/**
 * Niszczy wolne dane renderowania grafik z puli Pixi (#50, 02.10).
 *
 * Zniszczony kontekst dużej grafiki (powyżej 400 wierzchołków ma własny
 * batcher) oddaje swoje `GraphicsContextRenderData` do `BigPool`, a następna
 * duża grafika bierze je razem z buforem, który tylko rośnie
 * (`_resizeAttributeBuffer` podwaja, nic nie zmniejsza). Po kilkunastu
 * przełączeniach sceny każdy element puli
 * nosił bufor największej grafiki, jaką kiedykolwiek dostał — liczba buforów
 * stała, a pamięć szła w górę. Wołane po zdjęciu starej sceny, zanim nowa
 * cokolwiek narysuje: `Pool.clear` niszczy wyłącznie elementy wolne.
 */
export function releasePooledGraphicsData(): void {
  BigPool.getPool(GraphicsContextRenderData).clear();
}
