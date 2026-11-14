import type { NetRunAbilityResult, RollGesture } from '@vtt/shared';
import { netErrorText } from './netErrors.js';
import { clearNotices, notifyInfo, notifyRefusal } from './notices.js';
import { runNetScan } from './socket.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useRollStore } from './stores/rollStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Rzut Sieci na kubek (zlecenie MG z 14.11.2026).
 *
 * Klik zdolności, ataku, Ślizgu albo Skanera nie rzuca już sam: ładuje kubek,
 * który się świeci i dzwoni jak przy Teście z karty. Gracz chwyta kubek,
 * potrząsa nim i może w menu kubka dorzucić Szczęście — to jest cała
 * immersja, o którą MG prosił. Wynik nad mapą pokazuje dopiero rzut.
 *
 * `send` dostaje gest i Szczęście i woła właściwe zdarzenie gniazda; reszta
 * (odmowa po polsku, zdanie wyniku w kanale „Sieć”) jest wspólna.
 */
export function loadNetRoll(input: {
  characterId: string;
  characterName: string;
  title: string;
  send: (
    gesture: RollGesture,
    luck: number,
  ) => Promise<{ ok: boolean; error?: string; data?: NetRunAbilityResult }>;
  /** Co jeszcze zrobić po udanym wysłaniu (np. kadr na przejętych urządzeniach). */
  onDone?: (result: NetRunAbilityResult | undefined) => void;
}): void {
  useRollStore.getState().loadNetCup({
    characterId: input.characterId,
    characterName: input.characterName,
    title: input.title,
    key: `${input.title}:${Date.now()}`,
    fire: (gesture, luck) => {
      void input.send(gesture, luck).then((ack) => {
        if (!ack.ok) {
          notifyRefusal('net', netErrorText(ack.error));
          return;
        }
        if (ack.data?.summary) notifyInfo(ack.data.summary, { title: 'Sieć', topic: 'net' });
        else clearNotices('net');
        input.onDone?.(ack.data);
      });
    },
  });
}

/**
 * Skaner (s. 199) na kubek — z lewej belki i z karty gniazda. Figura bez karty
 * nie ma Interfejsu ani Szczęścia: wtedy rzut leci od razu, a odmowę i tak
 * wystawi serwer.
 */
export function loadScanRoll(tokenId: string): void {
  const token = useTokenStore.getState().tokens[tokenId];
  const characterId = token?.characterId;
  if (!token || !characterId) {
    void runNetScan(tokenId).then((ack) => {
      if (!ack.ok) notifyRefusal('net', netErrorText(ack.error));
    });
    return;
  }
  const name = useCharacterStore.getState().characters[characterId]?.name ?? token.name;
  loadNetRoll({
    characterId,
    characterName: name,
    title: `Skaner · ${name}`,
    send: (gesture, luck) => runNetScan(tokenId, gesture, luck),
  });
}
