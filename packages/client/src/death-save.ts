import { useMemo } from 'react';
import { CPRED_DEATH_SAVE_ROLL_ID, ROLE_GM, cpredDeathSaveModifier } from '@vtt/shared';
import { useAuthStore } from './stores/authStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useTokenStore } from './stores/tokenStore.js';
import { loadDeathSaveCup } from './stores/rollStore.js';

/**
 * „Kto ma teraz rzucić Test Przeżywalności" (stage 15).
 *
 * RAW: a Mortally Wounded character rolls at the start of every turn of theirs.
 * Since 17.10.2026 the server decides *whether* one is owed: the turn opens
 * with `pendingRoll` on its budget and nothing else in it is spendable until
 * the cup has been thrown. The banner shows exactly while that lasts — before
 * the stamp it stayed up after the roll and invited a second one. An NPC or a
 * bot has its save thrown by the server, so the GM sees the banner only when
 * that roll could not be made.
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
   * The whole modifier the roll will carry (`cpredDeathSaveModifier`): the saves
   * taken, the hits taken while Mortally Wounded and the Critical Injuries that
   * make dying easier. The banner promised „+1" for a while and the card said
   * „+2" — the rules add all three, and the reminder has to say so.
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
    if (active?.turn?.pendingRoll?.id !== CPRED_DEATH_SAVE_ROLL_ID) return null;
    const token = active.tokenId ? tokens[active.tokenId] : undefined;
    const characterId = token?.characterId;
    if (!characterId) return null;
    const character = characters[characterId];
    if (!character) return null;
    if (user.role !== ROLE_GM && character.ownerId !== user.id) return null;
    return {
      characterId,
      characterName: character.name,
      savesTaken: character.data.deathSaves,
      modifier: cpredDeathSaveModifier(character.data),
      roll: () => loadDeathSaveCup(characterId, character.name, character.data, registry),
    };
  }, [combat, tokens, characters, registry, user]);
}
