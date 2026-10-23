import type { HiddenSpottedBroadcast, TokenHaltBroadcast } from '@vtt/shared';
import { notifyInfo, notifyRefusal } from './notices.js';

/**
 * Zatrzymanie marszu przez serwer — drużyna zobaczyła wroga (etap 56) albo
 * ukryty Test Percepcji postaci zauważył coś na drodze (58a, od 24.10).
 *
 * Moduł jak `map-ping.ts`: zdarzenie oddaje się mapie i zapomina. Serwer zapisał
 * już pole zatrzymania i rozesłał je (`token:upsert` przed `token:halt`), więc
 * mapa kończy marsz **bez lądowania** i stawia figurę tam, gdzie trzyma ją
 * magazyn. Przy wrogu gracz dostaje jedno zdanie, dlaczego stanął; przy
 * ukrytej rzeczy mówi to karta rzutu i `hidden:spotted`, które idą za nim.
 */

/** To samo zdanie mówi odmowa `COMBAT_PENDING` — gracz stoi przed walką. */
export const COMBAT_PENDING_NOTE = 'Wróg w zasięgu wzroku — czekaj, aż MG rozpocznie walkę.';

export const hiddenSpottedNote = (spotted: HiddenSpottedBroadcast): string =>
  `${spotted.actorName} zauważa: ${spotted.names.join(', ')}.`;

const PERCEPTION_TITLE = 'Percepcja';

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
  if (broadcast.reason === 'notice') return;
  notifyRefusal('player-move', COMBAT_PENDING_NOTE, { tone: 'warn', title: 'Walka' });
}

/** Udany rzut na Percepcję odsłonił coś właścicielowi figury (58a). */
export function receiveHiddenSpotted(spotted: HiddenSpottedBroadcast): void {
  notifyInfo(hiddenSpottedNote(spotted), { title: PERCEPTION_TITLE });
}
