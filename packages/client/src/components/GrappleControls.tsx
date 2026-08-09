import type { ChatMessageView, RollOpposedMeta } from '@vtt/shared';
import { CPRED_FACEDOWN_PENALTY, ROLE_GM } from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { sendFacedownConcede } from '../socket.js';

/**
 * The chat card of an opposed test (stages 14d and 23c).
 *
 * System-aware like `AttackControls`: the core chat panel paints messages, and
 * this decides what a contest offers. Two live here because they are the same
 * card with the same one counter-roll — a Pochwycenie offers „Broń się", a
 * Konfrontacja offers „Postaw się" and then asks the loser what they do about
 * it. Which of the two a card is comes off the system payload the server
 * attached, not off a flag the core would have to carry.
 */

/**
 * Is this a Konfrontacja? Told by the address only a Konfrontacja puts in the
 * system payload — the core `RollOpposedMeta` deliberately knows neither.
 */
function facedownSystem(
  opposed: RollOpposedMeta,
): { challengerTokenId: string; defenderTokenId: string } | null {
  const system = opposed.system as { challengerTokenId?: unknown; defenderTokenId?: unknown };
  return typeof system.challengerTokenId === 'string' && typeof system.defenderTokenId === 'string'
    ? { challengerTokenId: system.challengerTokenId, defenderTokenId: system.defenderTokenId }
    : null;
}

export function OpposedRow({
  message,
  opposed,
}: {
  message: ChatMessageView;
  opposed: RollOpposedMeta;
}) {
  const characters = useCharacterStore((s) => s.characters);
  const tokens = useTokenStore((s) => s.tokens);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const cupBusy = useRollStore((s) => s.grapple !== null || s.facedown !== null);

  const isFacedown = facedownSystem(opposed) !== null;

  /**
   * The defender's sheet, if this viewer may act for it. A player only ever
   * holds their own characters, so for everybody else this is empty and the
   * button simply is not there.
   */
  const defenderToken = opposed.defenderTokenId ? tokens[opposed.defenderTokenId] : undefined;
  const defender =
    defenderToken?.characterId !== undefined && defenderToken.characterId !== null
      ? characters[defenderToken.characterId]
      : undefined;

  /** May this viewer speak for the token that lost? Its holder, or the GM. */
  const loserToken = opposed.concede ? tokens[opposed.concede.loserTokenId] : undefined;
  const loserCharacter =
    loserToken?.characterId != null ? characters[loserToken.characterId] : undefined;
  const decidesConcession =
    opposed.concede !== undefined &&
    opposed.concede.chosen === undefined &&
    (isGm || loserToken?.ownerId === userId || loserCharacter?.ownerId === userId);

  function rollDefence() {
    if (!defender) return;
    const load = {
      characterId: defender.id,
      characterName: defender.name,
      title: isFacedown ? `Konfrontacja: ${defender.name}` : `Obrona: ${defender.name}`,
      modifierTotal: 0,
      resist: { messageId: message.id },
    };
    if (isFacedown) useRollStore.getState().loadFacedownCup(load);
    else useRollStore.getState().loadGrappleCup(load);
  }

  // A Konfrontacja is the one contest in this project where a draw is its own
  // answer, so its badge has three faces instead of two.
  const verdict = opposed.outcome
    ? opposed.outcome === 'win'
      ? { text: 'Wygrana', className: 'success' }
      : opposed.outcome === 'loss'
        ? { text: 'Przegrana', className: 'failure' }
        : { text: 'Remis', className: 'neutral' }
    : opposed.won
      ? { text: 'Udane', className: 'success' }
      : { text: 'Nieudane', className: 'failure' };

  return (
    <div className="chat-attack">
      <div className="chat-roll-badges">
        <span className={`chat-roll-badge chat-roll-badge--${verdict.className}`}>
          {verdict.text}
        </span>
        <span className="chat-attack-detail">{opposed.detail}</span>
      </div>
      {defender && !opposed.answered && opposed.answerLabel && (
        <div className="chat-attack-actions">
          <button
            type="button"
            className="small-button"
            disabled={cupBusy}
            title={
              isFacedown
                ? 'Rzuć własnym CHA + Reputacja — wynik zastąpi pół kości'
                : 'Rzuć własnym ZW + Bijatyka — wynik zastąpi PT zastępczy'
            }
            onClick={rollDefence}
          >
            {opposed.answerLabel}
          </button>
        </div>
      )}
      {decidesConcession && opposed.concede && (
        <div className="chat-attack-actions">
          <button
            type="button"
            className="small-button"
            title="Odpuszczasz i schodzisz z drogi — bez kar"
            onClick={() => sendFacedownConcede(message.id, 'withdraw')}
          >
            Wycofaj się
          </button>
          <button
            type="button"
            className="small-button"
            title={`Zostajesz, ale ${CPRED_FACEDOWN_PENALTY} do Akcji wymierzonych w ${opposed.concede.winnerName}, dopóki go nie pokonasz`}
            onClick={() => sendFacedownConcede(message.id, 'stand')}
          >
            Nie ustępuj ({CPRED_FACEDOWN_PENALTY})
          </button>
        </div>
      )}
    </div>
  );
}
