import type { CompendiumEntry, CpredCharacterData, ResolvedWeapon } from '@vtt/shared';
import { ITEM_ROWS_MAX, formatEddies, purchasedSheetRow } from '@vtt/shared';
import {
  buyCompendiumEntry,
  economyErrorText,
  queueCharacterSave,
  sendCyberwareAction,
} from './socket.js';
import { useCharacterStore } from './stores/characterStore.js';

/**
 * Putting a compendium entry on a character sheet (stage 13).
 *
 * Two doors since stage 23b, and the difference is the wallet. „Dodaj postaci"
 * is the GM's free one — loot, starting gear, a reward — and stays a plain
 * sheet edit. „Kup" is everybody's and goes through the server, because the
 * money and the goods have to move in one write.
 *
 * The row itself is built by `purchasedSheetRow` in `shared`, so a looted rifle
 * and a bought one are the same row.
 */

function nextRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Adds the entry to the right list of the sheet for free; returns a Polish note. */
export async function addCompendiumItemToCharacter(
  characterId: string,
  entry: CompendiumEntry,
  resolved: ResolvedWeapon | null,
): Promise<string> {
  const character = useCharacterStore.getState().characters[characterId];
  if (!character) return 'Nie znaleziono postaci.';
  const data: CpredCharacterData = character.data;

  if (entry.category === 'criticalInjury') {
    // Injuries are drawn by the damage flow, never bought.
    return 'Rany krytyczne trafiają na kartę z rzutu na obrażenia.';
  }
  if (entry.category === 'cyberware') {
    if (data.cyberware.length >= ITEM_ROWS_MAX) return 'Lista cyborgizacji jest pełna.';
    // Not a sheet edit like every other row here (stage 23a): the Humanity a
    // piece of chrome costs is rolled on the server, so the client sends the
    // intention and lets the card and the refreshed sheet come back. Free here
    // means free — the price rides on the „Zainstaluj" buttons of the card.
    sendCyberwareAction({ characterId, action: 'install', entryId: entry.id, payment: 'none' });
    const cost = entry.humanityLoss ?? entry.humanityLossFixed;
    return cost
      ? `Instaluję „${entry.name}” bez opłaty — rzut na Utratę Człowieczeństwa (${cost}) idzie na czat.`
      : `Instaluję „${entry.name}” bez opłaty — bez utraty Człowieczeństwa.`;
  }

  const purchased = purchasedSheetRow(entry, resolved, nextRowId());
  if (!purchased) return 'Tego wpisu nie dodaje się na kartę.';
  if (data[purchased.list].length >= ITEM_ROWS_MAX) return 'Ta lista na karcie jest pełna.';

  switch (purchased.list) {
    case 'weapons':
      queueCharacterSave(characterId, { data: { weapons: [...data.weapons, purchased.row] } });
      return `Dodano „${entry.name}” do broni.`;
    case 'armor':
      queueCharacterSave(characterId, { data: { armor: [...data.armor, purchased.row] } });
      return `Dodano „${entry.name}” do pancerza.`;
    default:
      queueCharacterSave(characterId, { data: { gear: [...data.gear, purchased.row] } });
      return `Dodano „${entry.name}” do sprzętu.`;
  }
}

/** Buys the entry for the character; the server decides whether it can afford it. */
export async function buyCompendiumItemForCharacter(
  characterId: string,
  entry: CompendiumEntry,
  price?: number,
): Promise<string> {
  const ack = await buyCompendiumEntry({
    characterId,
    entryId: entry.id,
    ...(price !== undefined ? { price } : {}),
  });
  if (!ack.ok) return economyErrorText(ack.error);
  const balance = ack.data ? formatEddies(ack.data.balance) : '?';
  return `Kupiono „${entry.name}”. Zostało ${balance} ed.`;
}
