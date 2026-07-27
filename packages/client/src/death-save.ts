import { useMemo } from 'react';
import { ROLE_GM, woundState } from '@vtt/shared';
import { useAuthStore } from './stores/authStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useTokenStore } from './stores/tokenStore.js';
import { loadDeathSaveCup } from './stores/rollStore.js';

/**
 * „Kto ma teraz rzucić Test Przeżywalności" (stage 15).
 *
 * RAW: a Mortally Wounded character rolls at the start of every turn of theirs.
 * The tracker only reminds — the roll itself still goes through the cup, like
 * every other roll made at this table. The check is done entirely on the
 * client, because everything it needs is already there: whose turn it is, and
 * the sheet (which only ever reaches its owner and the GM anyway).
 *
 * Statists without a sheet are deliberately out of scope: they have no BODY to
 * roll against, so the GM decides their fate by hand.
 */
export interface DeathSavePrompt {
  characterId: string;
  characterName: string;
  /** Saves already taken — each one makes the next harder. */
  savesTaken: number;
  roll: () => void;
}

export function useDeathSavePrompt(): DeathSavePrompt | null {
  const combat = useCombatStore((s) => s.combat);
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  const registry = useCharacterStore((s) => s.registry);
  const user = useAuthStore((s) => s.user);

  return useMemo(() => {
    if (!combat?.activeCombatantId || !user) return null;
    const active = combat.combatants.find((c) => c.id === combat.activeCombatantId);
    if (!active) return null;
    const token = tokens[active.tokenId];
    const characterId = token?.characterId;
    if (!characterId) return null;
    const character = characters[characterId];
    if (!character) return null;
    if (user.role !== ROLE_GM && character.ownerId !== user.id) return null;
    if (woundState(character.data.hpCurrent, character.data.stats) !== 'mortal') return null;
    return {
      characterId,
      characterName: character.name,
      savesTaken: character.data.deathSaves,
      roll: () => loadDeathSaveCup(characterId, character.name, character.data, registry),
    };
  }, [combat, tokens, characters, registry, user]);
}
