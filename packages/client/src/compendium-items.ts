import type { CompendiumEntry, CpredCharacterData, ResolvedWeapon } from '@vtt/shared';
import { ITEM_ROWS_MAX } from '@vtt/shared';
import { queueCharacterSave } from './socket.js';
import { useCharacterStore } from './stores/characterStore.js';

/**
 * Putting a compendium entry on a character sheet (stage 13).
 *
 * The row keeps a `compendiumId` reference *and* a copy of the numbers it
 * needs. The reference is what the card and later stages look up; the copy is
 * what keeps an old sheet readable after the catalogue changes, and what the
 * GM may hand-edit for a one-off ("ten pistolet ma tylko 3 naboje").
 */

function nextRowId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Adds the entry to the right list of the sheet; returns a Polish note. */
export async function addCompendiumItemToCharacter(
  characterId: string,
  entry: CompendiumEntry,
  resolved: ResolvedWeapon | null,
): Promise<string> {
  const character = useCharacterStore.getState().characters[characterId];
  if (!character) return 'Nie znaleziono postaci.';
  const data: CpredCharacterData = character.data;

  const base = { id: nextRowId(), name: entry.name, compendiumId: entry.id };

  switch (entry.category) {
    case 'weapon': {
      if (data.weapons.length >= ITEM_ROWS_MAX) return 'Lista broni jest pełna.';
      const weapons = [
        ...data.weapons,
        {
          ...base,
          notes: (entry.features ?? []).join(', ').slice(0, 200),
          damage: resolved?.damage ?? '',
          ammo: resolved?.magazine === null || resolved === null ? '' : String(resolved.magazine),
          rof: resolved ? String(resolved.rof) : '',
        },
      ];
      queueCharacterSave(characterId, { data: { weapons } });
      return `Dodano „${entry.name}” do broni.`;
    }
    case 'armor': {
      if (data.armor.length >= ITEM_ROWS_MAX) return 'Lista pancerzy jest pełna.';
      const armor = [...data.armor, { ...base, notes: '', sp: entry.sp }];
      queueCharacterSave(characterId, { data: { armor } });
      return `Dodano „${entry.name}” do pancerza.`;
    }
    case 'cyberware': {
      if (data.cyberware.length >= ITEM_ROWS_MAX) return 'Lista cyborgizacji jest pełna.';
      const notes = entry.humanityLoss ? `Człowieczeństwo −${entry.humanityLoss}` : '';
      const cyberware = [...data.cyberware, { ...base, notes }];
      queueCharacterSave(characterId, { data: { cyberware } });
      return `Dodano „${entry.name}” do cyborgizacji.`;
    }
    default: {
      if (data.gear.length >= ITEM_ROWS_MAX) return 'Lista sprzętu jest pełna.';
      const gear = [...data.gear, { ...base, notes: '', qty: 1 }];
      queueCharacterSave(characterId, { data: { gear } });
      return `Dodano „${entry.name}” do sprzętu.`;
    }
  }
}
