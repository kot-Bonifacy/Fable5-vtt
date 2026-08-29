import { useMemo } from 'react';
import type { CpredAttackMode, CpredWeaponOption, TokenView } from '@vtt/shared';
import {
  CPRED_ATTACK_MODE_LABELS,
  cpredFireModes,
  cpredWeaponOptions,
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

/**
 * The weapons a token can fire, as the shared builder sees them. The branch
 * itself — sheet rows or the single weapon of a combat profile — lives in
 * `cpredWeaponOptions`, because the action bar of stage 16f asks the same
 * question and two answers to it would drift apart.
 */
function useWeaponOptions(token: TokenView | undefined): CpredWeaponOption[] {
  const characters = useCharacterStore((s) => s.characters);
  const entries = useCompendiumStore((s) => s.entries);
  const weaponTypeById = useCompendiumStore((s) => s.weaponTypeById);

  return useMemo(() => {
    if (!token) return [];
    const types = new Map(Object.entries(weaponTypeById));
    const character = token.characterId ? characters[token.characterId] : undefined;
    return cpredWeaponOptions(
      character ? character.data : null,
      character || !token.combatProfile ? null : sanitizeCombatProfile(token.combatProfile),
      (compendiumId) => {
        const entry = compendiumId ? entries[compendiumId] : undefined;
        return entry && isWeaponEntry(entry)
          ? resolveWeapon(entry, { weaponTypeById: types })
          : null;
      },
    );
  }, [token, characters, entries, weaponTypeById]);
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

  function aim(option: CpredWeaponOption, mode: CpredAttackMode, thrown = false) {
    if (!token) return;
    useAttackStore.getState().arm({
      ...(character ? { characterId: character.id } : {}),
      characterName: character?.name ?? token.name,
      attackerTokenId: token.id,
      weaponRowId: option.rowId,
      weaponName: option.name,
      mode,
      modifier: 0,
      // A thrown object leaves the hand, so reach stops applying to it.
      melee: thrown ? false : (option.resolved?.melee ?? false),
      ...(thrown ? { thrown: true } : {}),
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
          {cpredFireModes(option.resolved).map((mode) => (
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
          {/*
            „Rzut przedmiotem" (stage 16d). Offered for anything that is not
            already thrown by nature: the rules let you let go of a knife, a
            brick or a chair, and the roll is the same one every time — ZW +
            Atletyka against the Grenade Launcher's line, 25 m of arm (s. 177).
          */}
          {!option.resolved?.thrown && (
            <button
              type="button"
              className="small-button"
              title="Rzut przedmiotem: ZW + Atletyka, PT z wiersza Granatnika, zasięg do 25 m"
              onClick={() => aim(option, 'single', true)}
            >
              Rzuć
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
