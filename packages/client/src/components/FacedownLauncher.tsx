import { useMemo } from 'react';
import type { TokenView } from '@vtt/shared';
import { cpredReputation } from '@vtt/shared';
import { useCharacterStore } from '../stores/characterStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { sendReputationRecognise } from '../socket.js';

/**
 * Starting a Konfrontacja from the map (stage 23c).
 *
 * Opened on the *target* — you right-click the person you are staring at — so
 * what it has to ask is who is doing the staring. The answer is a list rather
 * than a guess: the GM usually has half a dozen figures on the scene, and „the
 * one I clicked last" is not the same question as „who wants to face this one
 * down".
 *
 * Nothing here decides anything about the contest. The other side's total, the
 * Reputation on both sheets and the verdict are all the server's; this only
 * loads the cup, exactly the way the sheet's own roll buttons do.
 *
 * **Only the GM ever sees this.** Not an oversight and not a permission check
 * living in the wrong place: the token context menu that opens it is GM-only
 * (`MapArea.tsx`), and the rulebook puts the same sentence on it — „W takiej
 * chwili **MG może przeprowadzić Konfrontację**" (s. 194). Players take part
 * from the chat card instead, where „Postaw się" and the loser's two buttons
 * are theirs to press. `facedown:attempt` itself stays open to a player who
 * owns the figure, because the server should not depend on which menu a client
 * happened to render — but nothing in the UI walks through that door today.
 */

/** Figures with a sheet on this scene, minus the one being stared at. */
function useChallengers(
  target: TokenView,
): { tokenId: string; characterId: string; name: string }[] {
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);

  return useMemo(
    () =>
      Object.values(tokens)
        .filter((token) => token.id !== target.id && token.characterId)
        .flatMap((token) => {
          // A Konfrontacja is CHA + Reputacja off a sheet, so a statist cannot
          // start one — but can be on the receiving end of one, where the
          // server stands in an ordinary person's 5 for them.
          const character = characters[token.characterId!];
          return character
            ? [{ tokenId: token.id, characterId: character.id, name: character.name }]
            : [];
        }),
    [tokens, characters, target.id],
  );
}

export function FacedownLauncher({
  target,
  onArmed,
}: {
  target: TokenView;
  /** Called once the cup is loaded, so the menu can close itself. */
  onArmed?: () => void;
}) {
  const challengers = useChallengers(target);
  const characters = useCharacterStore((s) => s.characters);
  const cupBusy = useRollStore((s) => s.facedown !== null || s.grapple !== null);

  if (challengers.length === 0) {
    return (
      <p className="combat-hint">
        Konfrontacja idzie z karty postaci — na tej scenie nie ma innej figury z kartą.
      </p>
    );
  }

  function stare(challenger: { tokenId: string; characterId: string; name: string }) {
    useRollStore.getState().loadFacedownCup({
      characterId: challenger.characterId,
      characterName: challenger.name,
      title: `Konfrontacja: ${challenger.name} → ${target.name}`,
      modifierTotal: 0,
      attempt: { targetTokenId: target.id, challengerTokenId: challenger.tokenId },
    });
    onArmed?.();
  }

  return (
    <ul className="combat-picker">
      {challengers.map((challenger) => {
        const reputation = cpredReputation(
          characters[challenger.characterId]?.data.reputationSources ?? [],
        );
        return (
          <li key={challenger.tokenId} className="combat-picker-row facedown-picker-row">
            <span className="combat-picker-name">{challenger.name}</span>
            {reputation.level > 0 && (
              <span className="combat-tag" title="Reputacja wchodzi do rzutu">
                {reputation.notorious
                  ? `zła sława ${reputation.level}`
                  : `Rep. ${reputation.level}`}
              </span>
            )}
            <button
              type="button"
              className="small-button"
              disabled={cupBusy}
              title="Ładuje kubek — CHA + Reputacja + 1k10 przeciw drugiej stronie"
              onClick={() => stare(challenger)}
            >
              Zmierz się
            </button>
            <button
              type="button"
              className="small-button"
              title="1k10 przeciw Reputacji celu — czy ta postać go kojarzy? (s. 193)"
              onClick={() => {
                sendReputationRecognise(challenger.characterId, target.id);
                onArmed?.();
              }}
            >
              Czy go znam?
            </button>
          </li>
        );
      })}
    </ul>
  );
}
