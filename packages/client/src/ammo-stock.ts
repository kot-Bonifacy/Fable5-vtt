import { cpredTracksAmmo, type CharacterView, type CpredCharacterData } from '@vtt/shared';
import { useBotStore } from './stores/botStore.js';

/**
 * Czy karta liczy amunicję (etap 46c) — ta sama reguła co na serwerze
 * (`cpredTracksAmmo`), z towarzyszem-botem wyczytanym z listy botów.
 *
 * Gracz listy botów zwykle nie ma, ale też nie ogląda kart towarzyszy: jego
 * karta jest „z właścicielem”, więc odpowiedź wychodzi ta sama, co u serwera.
 */
export function characterTracksAmmo(
  character: Pick<CharacterView<CpredCharacterData>, 'id' | 'ownerId' | 'data'>,
): boolean {
  const owned = character.ownerId !== null;
  const companion =
    !owned &&
    Object.values(useBotStore.getState().bots).some(
      (bot) => bot.characterId === character.id && !bot.archived && bot.data.type === 'companion',
    );
  return cpredTracksAmmo(character.data, { owned, companion });
}
