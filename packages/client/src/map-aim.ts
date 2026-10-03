import type { TokenAimBroadcast } from '@vtt/shared';

/**
 * Cudze groty między gniazdem a mapą (03.10) — droga pingu (`map-ping.ts`)
 * i z tego samego powodu: grot celowania nie jest stanem, z którego cokolwiek
 * się renderuje poza tą jedną figurą, więc nie ma po co budzić drzewa
 * komponentów przez zustand.
 */

type Sink = (tokenId: string, facing: number | null) => void;

let sink: Sink | null = null;
let sceneId: string | null = null;

/** Mapa mówi „pokazuję tę scenę, groty kieruj tutaj". */
export function bindMapAim(scene: string | null, draw: Sink | null): void {
  sceneId = scene;
  sink = draw;
}

/** Grot z serwera — już przefiltrowany do tych, którzy widzą figurę. */
export function receiveTokenAim(broadcast: TokenAimBroadcast): void {
  if (!sink || broadcast.sceneId !== sceneId) return;
  sink(broadcast.tokenId, broadcast.facing);
}
