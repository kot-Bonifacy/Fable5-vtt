import { useMemo } from 'react';
import { ROLE_GM, injuryDeathSavePenalty, woundState } from '@vtt/shared';
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
  /**
   * The whole modifier the roll will carry: the saves taken *plus* the Critical
   * Injuries that make dying easier. The banner promised „+1" for a while and
   * the card said „+2" — the rules add both, and the reminder has to say so
   * (stage 14e, after the flickering test of 14d pointed at exactly this gap).
   */
  modifier: number;
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
    const token = active.tokenId ? tokens[active.tokenId] : undefined;
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
      modifier: character.data.deathSaves + injuryDeathSavePenalty(character.data.criticalInjuries),
      roll: () => loadDeathSaveCup(characterId, character.name, character.data, registry),
    };
  }, [combat, tokens, characters, registry, user]);
}
