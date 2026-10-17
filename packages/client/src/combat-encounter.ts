import type { CombatView, SocketAck } from '@vtt/shared';
import { addToCombat, combatErrorText, removeFromCombat } from './socket.js';
import { notifyRefusal } from './notices.js';
import { useCombatStore } from './stores/combatStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * „⚔ Do starcia” — przełącznik stanu walki wzorem Foundry VTT (etap 50a).
 *
 * Działa na paczkę figur naraz (figura z menu albo cała zaznaczona grupa):
 * gdy **wszystkie** już są w kolejce, schodzą z niej; inaczej brakujące do niej
 * wchodzą. Bez walki na scenie serwer zakłada starcie „Przed walką” (runda 0)
 * z figurami graczy w środku (`combat:add`), więc MG nie musi wiedzieć, czy
 * kolejka już istnieje. Pojemniki inicjatywy nie mają — pomija je i serwer,
 * i ten przełącznik.
 */
export function encounterState(
  tokenIds: readonly string[],
  combat: CombatView | null = useCombatStore.getState().combat,
): { fighters: string[]; allIn: boolean } {
  const tokens = useTokenStore.getState().tokens;
  const fighters = tokenIds.filter((id) => tokens[id] && tokens[id].container === undefined);
  const inQueue = new Set(combat?.combatants.map((c) => c.tokenId) ?? []);
  return { fighters, allIn: fighters.length > 0 && fighters.every((id) => inQueue.has(id)) };
}

export async function toggleEncounter(tokenIds: readonly string[]): Promise<void> {
  const { fighters, allIn } = encounterState(tokenIds);
  if (fighters.length === 0) return;
  const combat = useCombatStore.getState().combat;
  let failed: SocketAck<unknown> | null = null;
  if (allIn && combat) {
    // Jedno po drugim: każde zdjęcie przelicza wskaźnik tury.
    for (const id of fighters) {
      const combatant = combat.combatants.find((c) => c.tokenId === id);
      if (!combatant) continue;
      const ack = await removeFromCombat(combatant.id);
      if (!ack.ok) failed = ack;
    }
  } else {
    const inQueue = new Set(combat?.combatants.map((c) => c.tokenId) ?? []);
    const ack = await addToCombat(fighters.filter((id) => !inQueue.has(id)));
    if (!ack.ok) failed = ack;
  }
  if (failed && !failed.ok) notifyRefusal('action', combatErrorText(failed.error));
}
