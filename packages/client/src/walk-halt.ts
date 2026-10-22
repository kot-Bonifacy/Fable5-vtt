import type { HiddenSpottedBroadcast, TokenHaltBroadcast } from '@vtt/shared';
import { notifyInfo, notifyRefusal } from './notices.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Zatrzymanie marszu przez serwer — drużyna zobaczyła wroga (etap 56) albo
 * figura przystanęła przy ukrytej rzeczy na rzut Percepcji (58a).
 *
 * Moduł jak `map-ping.ts`: zdarzenie oddaje się mapie i zapomina. Serwer zapisał
 * już pole zatrzymania i rozesłał je (`token:upsert` przed `token:halt`), więc
 * mapa kończy marsz **bez lądowania** i stawia figurę tam, gdzie trzyma ją
 * magazyn. Gracz dostaje jedno zdanie, dlaczego stanął.
 */

/** To samo zdanie mówi odmowa `COMBAT_PENDING` — gracz stoi przed walką. */
export const COMBAT_PENDING_NOTE = 'Wróg w zasięgu wzroku — czekaj, aż MG rozpocznie walkę.';

/**
 * Przy ukrytej rzeczy gracz wie, że postać na coś zwróciła uwagę, a nie na co
 * (58a). Rzuca z kubka na wezwanie; co zauważyła, mówi osobno
 * `hidden:spotted`, i tylko przy sukcesie.
 */
export const noticeHaltNote = (name: string): string =>
  `${name} przystaje — coś przykuło uwagę. Rzuć na Percepcję z kubka.`;

/** Odmowa ruchu `NOTICE_ROLL_PENDING` — figura stoi do rzutu (58a, decyzja MG z 22.10). */
export const NOTICE_ROLL_PENDING_NOTE = 'Najpierw rzuć na Percepcję — coś przykuło uwagę postaci.';

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
  if (broadcast.reason === 'notice') {
    const tokens = useTokenStore.getState().tokens;
    for (const id of broadcast.tokenIds) {
      notifyInfo(noticeHaltNote(tokens[id]?.name ?? 'Postać'), { title: PERCEPTION_TITLE });
    }
    return;
  }
  notifyRefusal('player-move', COMBAT_PENDING_NOTE, { tone: 'warn', title: 'Walka' });
}

/** Udany rzut na Percepcję odsłonił coś właścicielowi figury (58a). */
export function receiveHiddenSpotted(spotted: HiddenSpottedBroadcast): void {
  notifyInfo(hiddenSpottedNote(spotted), { title: PERCEPTION_TITLE });
}
