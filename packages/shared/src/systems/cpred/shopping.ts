import type { CompendiumEntry, ResolvedWeapon } from './compendium.js';
import type { CpredArmorRow, CpredGearRow, CpredWeaponRow } from './character.js';

/**
 * Turning a catalogue entry into a sheet row (stage 13, moved here in 23b).
 *
 * It lives in `shared` rather than in the client — where stage 13 first wrote
 * it — because the buy path builds the same row on the **server**: the money
 * and the goods have to move in one write, or a refused save leaves a paid-for
 * gun nowhere. The GM's free „Dodaj postaci" calls exactly this function, so a
 * looted rifle and a bought one are the same row.
 */

/** The three sheet lists a bought entry can land in. */
export type PurchaseList = 'weapons' | 'armor' | 'gear';

export type PurchasedRow =
  | { list: 'weapons'; row: CpredWeaponRow }
  | { list: 'armor'; row: CpredArmorRow }
  | { list: 'gear'; row: CpredGearRow };

/**
 * The row keeps a `compendiumId` reference *and* a copy of the numbers it
 * needs — the reference is what later stages look up, the copy is what keeps an
 * old sheet readable after the catalogue changes, and what the GM may
 * hand-edit for a one-off („ten pistolet ma tylko 3 naboje").
 *
 * Returns null for the categories nobody puts on a sheet this way: injuries are
 * drawn by the damage flow (stage 15), cyberware is fitted by its own event
 * (23a) and a cartridge is loaded into a weapon (16g).
 */
export function purchasedSheetRow(
  entry: CompendiumEntry,
  resolved: ResolvedWeapon | null,
  rowId: string,
): PurchasedRow | null {
  const base = { id: rowId, name: entry.name, compendiumId: entry.id };
  switch (entry.category) {
    case 'weapon':
      return {
        list: 'weapons',
        row: {
          ...base,
          notes: (entry.features ?? []).join(', ').slice(0, 200),
          damage: resolved?.damage ?? '',
          // A bought weapon arrives loaded; a weapon whose type tracks no
          // magazine (melee, bows) gets a zero counter the sheet hides.
          ammoCurrent: resolved?.magazine ?? 0,
          ammoMax: resolved?.magazine ?? 0,
          ammoType: resolved?.ammoType ?? '',
          rof: resolved ? String(resolved.rof) : '',
        },
      };
    case 'armor':
      return {
        list: 'armor',
        row: {
          ...base,
          notes: '',
          sp: entry.sp,
          spCurrent: entry.sp,
          // Fresh armor is undamaged and worn where the catalogue says it sits
          // (stage 15); a piece covering several spots lands on the body.
          location: entry.locations.includes('body') ? 'body' : (entry.locations[0] ?? 'body'),
          // Stage 14c: heavy armor slows its wearer, and the turn budget reads
          // the number off the row — so it is copied like SP, not looked up.
          ...(entry.penalty ? { penalty: entry.penalty } : {}),
        },
      };
    case 'gear':
      return { list: 'gear', row: { ...base, notes: '', qty: 1 } };
    default:
      return null;
  }
}
