import { useMemo } from 'react';
import type { CpredAttackMode, ResolvedWeapon, TokenView } from '@vtt/shared';
import {
  CPRED_ATTACK_MODE_LABELS,
  STATIST_WEAPON_ROW_ID,
  isWeaponEntry,
  resolveWeapon,
  sanitizeCombatProfile,
} from '@vtt/shared';
import { useAttackStore } from '../stores/attackStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';

/**
 * Starting an attack from the map (stage 16b).
 *
 * Until this stage the only door into the whole ranged-combat system was the
 * weapon row on an open character sheet, which made the machinery of stage 16
 * practically invisible: the GM had to open somebody's sheet to fire, and an NPC
 * without a sheet could not fire at all.
 *
 * What it does is deliberately small — it *arms* the map, exactly as the sheet's
 * „Atakuj" does, and the click on the target that follows is the same code path
 * (`loadAttackAtToken`). Nothing here decides anything about the attack; the
 * distance, the DV and whether there is a wall in the way are all the server's.
 */

/** One thing this token can attack with, whatever the numbers come from. */
interface WeaponOption {
  rowId: string;
  name: string;
  resolved: ResolvedWeapon | null;
  /** Rounds left / magazine size; null for a weapon that counts none. */
  ammo: { current: number; max: number } | null;
}

/**
 * The weapons a token can fire: its sheet's rows, or the single weapon of its
 * combat profile. Empty when there is neither, which is what „this token has
 * not been statted" looks like from here.
 */
function useWeaponOptions(token: TokenView | undefined): WeaponOption[] {
  const characters = useCharacterStore((s) => s.characters);
  const entries = useCompendiumStore((s) => s.entries);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);

  return useMemo(() => {
    if (!token) return [];
    const types = new Map(Object.entries(weaponTypeById));
    const resolveById = (compendiumId: string | undefined): ResolvedWeapon | null => {
      const entry = compendiumId ? entries[compendiumId] : undefined;
      return entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById: types }) : null;
    };

    const character = token.characterId ? characters[token.characterId] : undefined;
    if (character) {
      return character.data.weapons.map((row) => ({
        rowId: row.id,
        name: row.name,
        resolved: resolveById(row.compendiumId),
        ammo: row.ammoMax > 0 ? { current: row.ammoCurrent, max: row.ammoMax } : null,
      }));
    }

    if (!token.combatProfile) return [];
    const profile = sanitizeCombatProfile(token.combatProfile);
    return [
      {
        rowId: STATIST_WEAPON_ROW_ID,
        name: profile.weaponName,
        resolved: resolveById(profile.weaponId ?? undefined),
        ammo: profile.ammoMax > 0 ? { current: profile.ammoCurrent, max: profile.ammoMax } : null,
      },
    ];
  }, [token, characters, entries, weaponTypeById]);
}

/**
 * The fire modes a weapon actually offers. A pistol shows one button and no
 * choice to make; only a weapon with a burst grows the row.
 */
function modesOf(resolved: ResolvedWeapon | null): CpredAttackMode[] {
  const modes: CpredAttackMode[] = ['single'];
  if (resolved?.autofire) modes.push('autofire');
  if (resolved?.suppressive) modes.push('suppressive');
  return modes;
}

export function AttackLauncher({
  token,
  onArmed,
}: {
  token: TokenView | undefined;
  /** Called once the map is armed, so a menu can close itself. */
  onArmed?: () => void;
}) {
  const weapons = useWeaponOptions(token);
  const characters = useCharacterStore((s) => s.characters);

  if (!token) return null;
  if (weapons.length === 0) {
    return (
      <p className="combat-hint">
        Ten token nie ma broni. Podłącz kartę postaci albo uzupełnij profil bojowy w „Edytuj…”.
      </p>
    );
  }

  const character = token.characterId ? characters[token.characterId] : undefined;

  function aim(option: WeaponOption, mode: CpredAttackMode) {
    if (!token) return;
    useAttackStore.getState().arm({
      ...(character ? { characterId: character.id } : {}),
      characterName: character?.name ?? token.name,
      attackerTokenId: token.id,
      weaponRowId: option.rowId,
      weaponName: option.name,
      mode,
      aimed: false,
      modifier: 0,
      melee: option.resolved?.melee ?? false,
    });
    onArmed?.();
  }

  return (
    <ul className="combat-picker">
      {weapons.map((option) => (
        <li key={option.rowId} className="combat-picker-row">
          <span className="combat-picker-name">
            {option.name}
            {option.ammo && (
              <span className="combat-tag">
                {option.ammo.current}/{option.ammo.max}
              </span>
            )}
          </span>
          {modesOf(option.resolved).map((mode) => (
            <button
              key={mode}
              type="button"
              className="small-button"
              title={
                mode === 'single'
                  ? 'Uzbraja mapę — kliknij cel, żeby załadować kubek'
                  : `${CPRED_ATTACK_MODE_LABELS[mode]} — kliknij cel, żeby załadować kubek`
              }
              onClick={() => aim(option, mode)}
            >
              {mode === 'single' ? 'Celuj' : CPRED_ATTACK_MODE_LABELS[mode]}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}
