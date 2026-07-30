import type { ChatMessageView, RollOpposedMeta } from '@vtt/shared';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useRollStore } from '../stores/rollStore.js';

/**
 * The chat card of an opposed test (stage 14d).
 *
 * System-aware like `AttackControls`: the core chat panel paints messages, and
 * this decides what a Pochwycenie offers. The offer is exactly one button, and
 * only to the person on the other end of the contest — „Broń się" replaces the
 * stand-in DV the attacker rolled against with a real ZW + Bijatyka roll.
 */
export function OpposedRow({
  message,
  opposed,
}: {
  message: ChatMessageView;
  opposed: RollOpposedMeta;
}) {
  const characters = useCharacterStore((s) => s.characters);
  const tokens = useTokenStore((s) => s.tokens);
  const cupBusy = useRollStore((s) => s.grapple !== null);

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

  function rollDefence() {
    if (!defender) return;
    useRollStore.getState().loadGrappleCup({
      characterId: defender.id,
      characterName: defender.name,
      title: `Obrona: ${defender.name}`,
      modifierTotal: 0,
      resist: { messageId: message.id },
    });
  }

  const verdict = opposed.won
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
            title="Rzuć własnym ZW + Bijatyka — wynik zastąpi PT zastępczy"
            onClick={rollDefence}
          >
            {opposed.answerLabel}
          </button>
        </div>
      )}
    </div>
  );
}
