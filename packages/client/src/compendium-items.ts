import type { CompendiumEntry, CpredCharacterData, ResolvedWeapon } from '@vtt/shared';
import {
  ITEM_ROWS_MAX,
  cpredPurchasedAmmoRow,
  cpredPutAmmo,
  formatEddies,
  isAmmoEntry,
  purchasedSheetRow,
  toAmmoProfile,
} from '@vtt/shared';
import { useCompendiumStore } from './stores/compendiumStore.js';
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

/** Etap 46c: amunicję kupuje się paczkami do kalibru wybranego typem broni. */
export interface AmmoPurchaseChoice {
  weaponTypeId: string;
  packs: number;
}

/** Adds the entry to the right list of the sheet for free; returns a Polish note. */
export async function addCompendiumItemToCharacter(
  characterId: string,
  entry: CompendiumEntry,
  resolved: ResolvedWeapon | null,
  ammo?: AmmoPurchaseChoice,
): Promise<string> {
  const character = useCharacterStore.getState().characters[characterId];
  if (!character) return 'Nie znaleziono postaci.';
  const data: CpredCharacterData = character.data;

  // Etap 46c: pudełko amunicji — paczki do kalibru, sklejone z takim samym.
  if (isAmmoEntry(entry)) {
    const type = ammo ? useCompendiumStore.getState().weaponTypeById[ammo.weaponTypeId] : undefined;
    if (!ammo || !type) return 'Wybierz kaliber — amunicję dodaje się do konkretnej broni.';
    const box = cpredPurchasedAmmoRow(toAmmoProfile(entry), type, ammo.packs, nextRowId());
    if (!box?.ammo) return 'Ten nabój nie pasuje do wybranego kalibru.';
    const gear = cpredPutAmmo(data.gear, { ...box, ammo: box.ammo }, box.qty, nextRowId);
    if (gear.length > ITEM_ROWS_MAX) return 'Lista wyposażenia jest pełna.';
    queueCharacterSave(characterId, { data: { gear } });
    return `Dodano „${box.name}” × ${box.qty}.`;
  }

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
    // The note waits for the server (13.09): a refusal used to leave „Instaluję"
    // here while the chat explained why nothing was installed.
    const refusal = await sendCyberwareAction({
      characterId,
      action: 'install',
      entryId: entry.id,
      payment: 'none',
    });
    if (refusal) return refusal;
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

/**
 * Znaleziony wszczep do Wyposażenia (etap 48c, decyzja MG z 10.10) — łup
 * z ciała, nagroda w naturze. Leży w plecaku jak każdy przedmiot (handel, łup,
 * sklep), a „Znaleziony — montaż” wszczepia go za samą robociznę i zdejmuje.
 * Tylko MG — gracz dostaje go z łupu albo z wymiany.
 */
export function addFoundCyberwareToCharacter(characterId: string, entry: CompendiumEntry): string {
  const character = useCharacterStore.getState().characters[characterId];
  if (!character) return 'Nie znaleziono postaci.';
  const gear = character.data.gear;
  if (gear.length >= ITEM_ROWS_MAX) return 'Lista wyposażenia jest pełna.';
  queueCharacterSave(characterId, {
    data: {
      gear: [
        ...gear,
        { id: nextRowId(), name: entry.name, notes: '', compendiumId: entry.id, qty: 1 },
      ],
    },
  });
  return `Dodano „${entry.name}” do Wyposażenia — montaż: „Znaleziony”.`;
}

/** Buys the entry for the character; the server decides whether it can afford it. */
export async function buyCompendiumItemForCharacter(
  characterId: string,
  entry: CompendiumEntry,
  price?: number,
  ammo?: AmmoPurchaseChoice,
): Promise<string> {
  const ack = await buyCompendiumEntry({
    characterId,
    entryId: entry.id,
    ...(price !== undefined ? { price } : {}),
    ...(ammo ? { weaponTypeId: ammo.weaponTypeId, packs: ammo.packs } : {}),
  });
  if (!ack.ok) return economyErrorText(ack.error);
  const balance = ack.data ? formatEddies(ack.data.balance) : '?';
  const packs = ammo ? ` — paczek: ${ammo.packs}` : '';
  return `Kupiono „${entry.name}”${packs}. Zostało ${balance} ed.`;
}
