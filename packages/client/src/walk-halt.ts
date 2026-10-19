import type { TokenHaltBroadcast } from '@vtt/shared';
import { notifyRefusal } from './notices.js';

/**
 * Zatrzymanie marszu przez serwer (etap 56) — drużyna zobaczyła wroga.
 *
 * Moduł jak `map-ping.ts`: zdarzenie oddaje się mapie i zapomina. Serwer zapisał
 * już pole zatrzymania i rozesłał je (`token:upsert` przed `token:halt`), więc
 * mapa kończy marsz **bez lądowania** i stawia figurę tam, gdzie trzyma ją
 * magazyn. Gracz dostaje jedno zdanie, dlaczego stanął.
 */

/** To samo zdanie mówi odmowa `COMBAT_PENDING` — gracz stoi przed walką. */
export const COMBAT_PENDING_NOTE = 'Wróg w zasięgu wzroku — czekaj, aż MG rozpocznie walkę.';

type Halt = (tokenIds: readonly string[]) => void;

let halt: Halt | null = null;
let sceneId: string | null = null;

/** Mapa mówi „pokazuję tę scenę, zatrzymania kieruj tutaj”. */
export function bindWalkHalt(scene: string | null, sink: Halt | null): void {
  sceneId = scene;
  halt = sink;
}

export function receiveWalkHalt(broadcast: TokenHaltBroadcast): void {
  if (broadcast.sceneId !== sceneId) return;
  halt?.(broadcast.tokenIds);
  notifyRefusal('player-move', COMBAT_PENDING_NOTE, { tone: 'warn', title: 'Walka' });
}
