import type { MapPingBroadcast } from '@vtt/shared';

/**
 * Kolejka pingów między gniazdem a mapą (etap 35).
 *
 * Moduł, a nie store — dokładnie z powodu, dla którego modułem jest `map-fx.ts`:
 * **nic tutaj nie przeżywa klatki**. Ping jest oddawany rendererowi i
 * zapominany; zustand dawałby przy każdym kółku ponowne przeliczenie drzewa
 * komponentów za rzecz, która już się stała.
 *
 * Dwa wejścia, bo ping ma dwa źródła i jedno wyjście:
 *  - `receiveMapPing` — cudzy ping z serwera;
 *  - `showLocalPing` — własny, rysowany od razu, bo serwer pomija nadawcę
 *    (tak samo jak przy linijce).
 *
 * `pull` ma osobny odbiornik, bo to nie jest rysowanie: przesunięcie kamery robi
 * `Viewport`, a nie warstwa graficzna.
 */

type Sink = (ping: { x: number; y: number; userName: string }) => void;
type Pull = (x: number, y: number) => void;

let sink: Sink | null = null;
let pull: Pull | null = null;
let sceneId: string | null = null;

/** Mapa mówi „pokazuję tę scenę, pingi kieruj tutaj". */
export function bindMapPing(scene: string | null, draw: Sink | null, pullTo: Pull | null): void {
  sceneId = scene;
  sink = draw;
  pull = pullTo;
}

/** Ping z serwera — już przefiltrowany do pokoju sceny, tu ostatnie sito. */
export function receiveMapPing(broadcast: MapPingBroadcast): void {
  if (!sink || broadcast.sceneId !== sceneId) return;
  sink({ x: broadcast.x, y: broadcast.y, userName: broadcast.userName });
  // Przyciągnięcie widoku przyznaje wyłącznie serwer i wyłącznie MG — klient
  // nie sprawdza tego drugi raz, tylko wykonuje to, co dostał.
  if (broadcast.pull) pull?.(broadcast.x, broadcast.y);
}

/** Własny ping: kółko u siebie, bo serwer odsyła go tylko pozostałym. */
export function showLocalPing(scene: string, x: number, y: number, userName: string): void {
  if (!sink || scene !== sceneId) return;
  sink({ x: Math.round(x), y: Math.round(y), userName });
}
