import { useEffect, useMemo } from 'react';
import {
  CPRED_DEATH_SAVE_ROLL_ID,
  ROLE_GM,
  cpredDeathSaveModifier,
  type CombatView,
} from '@vtt/shared';
import { useAuthStore } from './stores/authStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useTokenStore } from './stores/tokenStore.js';
import { loadDeathSaveCup, useRollStore } from './stores/rollStore.js';

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
  /** The viewer owns the sheet — the GM sees other people's saves too. */
  own: boolean;
  /** Which turn owes the save — one turn, one automatic load of the cup. */
  turnKey: string;
  roll: () => void;
}

type CharacterState = ReturnType<typeof useCharacterStore.getState>;

function deathSavePromptOf(
  combat: CombatView | null,
  tokens: ReturnType<typeof useTokenStore.getState>['tokens'],
  characters: CharacterState['characters'],
  registry: CharacterState['registry'],
  user: ReturnType<typeof useAuthStore.getState>['user'],
): DeathSavePrompt | null {
  if (!combat?.activeCombatantId || !user) return null;
  const active = combat.combatants.find((c) => c.id === combat.activeCombatantId);
  if (active?.turn?.pendingRoll?.id !== CPRED_DEATH_SAVE_ROLL_ID) return null;
  const token = active.tokenId ? tokens[active.tokenId] : undefined;
  const characterId = token?.characterId;
  if (!characterId) return null;
  const character = characters[characterId];
  if (!character) return null;
  const own = character.ownerId === user.id;
  if (user.role !== ROLE_GM && !own) return null;
  return {
    characterId,
    characterName: character.name,
    savesTaken: character.data.deathSaves,
    modifier: cpredDeathSaveModifier(character.data),
    own,
    turnKey: `${combat.round}:${active.id}`,
    roll: () => loadDeathSaveCup(characterId, character.name, character.data, registry),
  };
}

export function useDeathSavePrompt(): DeathSavePrompt | null {
  const combat = useCombatStore((s) => s.combat);
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  const registry = useCharacterStore((s) => s.registry);
  const user = useAuthStore((s) => s.user);

  return useMemo(
    () => deathSavePromptOf(combat, tokens, characters, registry, user),
    [combat, tokens, characters, registry, user],
  );
}

/** The turn whose save already went into the cup — `Esc` must not bring it back. */
let loadedTurnKey: string | null = null;

/**
 * The owner's cup loads the save by itself when the turn opens (24.10, MG):
 * the roll is the only thing the turn allows, so a click on the bar to fetch
 * it was a step nobody guessed. Once per turn — `Esc` puts it away for good,
 * and the bar button (or a refused „Kończę turę") loads it again. The GM's cup
 * stays as it is: a player's save is the player's to throw.
 */
export function useDeathSaveAutoLoad(prompt: DeathSavePrompt | null): void {
  const key = prompt?.own ? prompt.turnKey : null;
  useEffect(() => {
    if (key === null || key === loadedTurnKey || !prompt) return;
    if (useRollStore.getState().cupHeld) return;
    loadedTurnKey = key;
    prompt.roll();
    // `prompt` changes with every sheet update; the turn is what counts.
  }, [key]);
}

/** A refusal for want of the save puts it in the cup — the next step is the throw. */
export function loadOwedDeathSave(): void {
  const prompt = deathSavePromptOf(
    useCombatStore.getState().combat,
    useTokenStore.getState().tokens,
    useCharacterStore.getState().characters,
    useCharacterStore.getState().registry,
    useAuthStore.getState().user,
  );
  prompt?.roll();
}
