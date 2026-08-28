import { useMemo, useState } from 'react';
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
 * **Menu żetonu widzi tylko MG** — nie przeoczenie i nie kontrola uprawnień
 * w złym miejscu: menu kontekstowe jest MG-owe (`MapArea.tsx`), a podręcznik
 * pisze to samo zdanie — „W takiej chwili **MG może przeprowadzić
 * Konfrontację**" (s. 194).
 *
 * Od 28.08 gracz ma jednak **własne drzwi**: `FacedownFromSheet` na karcie
 * postaci, gdzie wybiera się nie napastnika, tylko **cel**. Powód jest ten sam,
 * dla którego `facedown:attempt` od 23c przyjmuje gracza: serwer nie miał
 * zależeć od tego, które menu wyrenderował klient — a przez rok nikt tą drogą
 * nie chodził, bo w UI jej nie było. „Postaw się" na karcie z czatu i dwa
 * przyciski przegranego były jedynym, co gracz mógł kliknąć, i tylko wtedy,
 * gdy Konfrontację **zaczął ktoś inny**.
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

/**
 * „Postaw się" z własnej karty (28.08) — lustro `FacedownLauncher`.
 *
 * Ta sama mechanika i to samo zdarzenie, odwrócone stroną: napastnik jest
 * znany (to właściciel karty), więc pyta się o **cel**. Lista to figury, które
 * ten klient widzi — a widzi dokładnie tyle, ile serwer mu wysłał, więc ukryty
 * NPC nie da się onieśmielić przez pomyłkę i nie zdradzi się tym, że go nie ma
 * na liście.
 *
 * Wymaga figury tej postaci na scenie: `facedown:attempt` nosi adres żetonu
 * napastnika, bo Konfrontacja dzieje się między figurami, nie między kartami.
 */
export function FacedownFromSheet({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const tokens = useTokenStore((s) => s.tokens);
  const cupBusy = useRollStore((s) => s.facedown !== null || s.grapple !== null);
  const [open, setOpen] = useState(false);

  const mine = useMemo(
    () => Object.values(tokens).find((token) => token.characterId === characterId) ?? null,
    [tokens, characterId],
  );
  const targets = useMemo(
    () =>
      mine
        ? Object.values(tokens)
            .filter((token) => token.sceneId === mine.sceneId && token.id !== mine.id)
            .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
        : [],
    [tokens, mine],
  );

  function stare(target: { id: string; name: string }) {
    useRollStore.getState().loadFacedownCup({
      characterId,
      characterName,
      title: `Konfrontacja: ${characterName} → ${target.name}`,
      modifierTotal: 0,
      attempt: { targetTokenId: target.id, challengerTokenId: mine!.id },
    });
    setOpen(false);
  }

  if (!mine) return null;

  return (
    <div className="facedown-from-sheet">
      <button
        type="button"
        className="small-button"
        disabled={cupBusy}
        onClick={() => setOpen((current) => !current)}
        title="Konfrontacja — CHA + Reputacja + 1k10 przeciw drugiej stronie (s. 194)"
      >
        😠 Postaw się…
      </button>
      {open &&
        (targets.length === 0 ? (
          <p className="combat-hint">Na tej scenie nie ma nikogo, komu można się postawić.</p>
        ) : (
          <ul className="combat-picker">
            {targets.map((target) => (
              <li key={target.id} className="combat-picker-row facedown-picker-row">
                <span className="combat-picker-name">{target.name}</span>
                <button
                  type="button"
                  className="small-button"
                  disabled={cupBusy}
                  onClick={() => stare(target)}
                >
                  Zmierz się
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
