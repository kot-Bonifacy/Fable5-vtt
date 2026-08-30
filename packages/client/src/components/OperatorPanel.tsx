import { useState } from 'react';
import {
  COST_CATEGORY_LABELS,
  CPRED_HAGGLE_OPPONENT_MAX,
  CPRED_HAGGLE_SKILL_ID,
  CPRED_OPERATOR_ABILITY,
  CPRED_OPERATOR_TIERS,
  cpredAbilityTiersUpTo,
  cpredHaggleDeal,
  cpredHaggleDeals,
  cpredOperatorReach,
  cpredOperatorTierAt,
  cpredRoleAbilityRank,
  readCpredHaggle,
} from '@vtt/shared';
import { dropHaggle, strikeHaggle } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Znajomości Fixera (etap 30d, s. 159–161).
 *
 * Trzy części ramki mają w VTT trzy różne wagi i panel tego nie ukrywa:
 *
 *  - **Zasięg** i **Wazeliniarz** to proza dla stołu. Sklep z 23b rządzi się
 *    poziomem odblokowanym przez MG (mechanizm kampanii, nie RAW), a Zasięg go
 *    nie przebija — decyzja MG z 30.08, zapisana w `decyzje-i-uproszczenia.md`.
 *  - **Targowanie się** jest jedyną częścią, którą VTT liczy do końca: udany
 *    rzut przeciwstawny odkłada targ na kartę, a najbliższy zakup zdejmuje
 *    z ceny 10% albo 20%. Pozostałe cztery targi stoją w menu jako zapis dla
 *    stołu, bo opisują pieniądze, których projekt nie prowadzi.
 *
 * Modyfikator drugiej strony to jedno pole, a nie trzy: sprzedawca jest fikcją,
 * więc MG podaje sumę CHA + Handel + Znajomości, a kość spada na serwerze.
 */
export function OperatorPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const [opponent, setOpponent] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_OPERATOR_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const tier = cpredOperatorTierAt(rank);
  const reach = cpredOperatorReach(rank);
  const struck = readCpredHaggle(character.data.haggle);
  const struckDeal = struck ? cpredHaggleDeal(struck.dealId) : null;
  const trading = character.data.skills[CPRED_HAGGLE_SKILL_ID] ?? 0;

  async function haggle(dealId: string): Promise<void> {
    setBusy(dealId);
    setNote(null);
    const result = await strikeHaggle(characterId, dealId, opponent);
    setBusy(null);
    if (!result.ok) return;
    setNote(
      result.won
        ? 'Targ dobity — zejdzie z ceny przy najbliższym zakupie.'
        : 'Druga strona nie ustąpiła. Remis też przegrywa.',
    );
  }

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>
          {CPRED_OPERATOR_ABILITY} {rank}
        </h4>
        <p className="awareness-left">Zasięg: {reach ? COST_CATEGORY_LABELS[reach] : '—'}</p>
      </header>

      {struck && struckDeal && (
        <p className="awareness-derived haggle-struck">
          Dobity targ: <b>{struckDeal.name}</b>
          {struck.discount > 0 ? ` (−${struck.discount}% od najbliższego zakupu)` : ''}
          <button
            type="button"
            className="cp-mini-button"
            title={`Porzuć targ${struck.note ? ` (${struck.note})` : ''}`}
            aria-label="Porzuć dobity targ"
            onClick={() => void dropHaggle(characterId)}
          >
            ✕
          </button>
        </p>
      )}

      <label className="haggle-opponent">
        <span>Druga strona (CHA + Handel + Znajomości)</span>
        <input
          type="number"
          min={0}
          max={CPRED_HAGGLE_OPPONENT_MAX}
          value={opponent}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(value)) {
              setOpponent(Math.max(0, Math.min(CPRED_HAGGLE_OPPONENT_MAX, value)));
            }
          }}
          aria-label="Modyfikator drugiej strony"
        />
      </label>

      <ul className="awareness-list">
        {cpredHaggleDeals(rank).map((deal) => (
          <li key={deal.id} className="awareness-row backup-row">
            <span className="awareness-name" title={deal.text}>
              {deal.name}
              <small className="backup-stats">
                {' '}
                poziom {deal.level}
                {deal.discount === undefined ? ' · zapis dla stołu' : ` · −${deal.discount}%`}
              </small>
            </span>
            <span className="awareness-steps">
              <button
                type="button"
                disabled={busy !== null}
                title={`Targuj się o: ${deal.name}`}
                aria-label={`Targuj się: ${deal.name}`}
                onClick={() => void haggle(deal.id)}
              >
                {busy === deal.id ? '…' : 'Targuj'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="awareness-hint">{note}</p>}

      <div className="awareness-extras">
        {tier && (
          <p className="awareness-derived">
            Układy: {tier.contacts}
            <br />
            {tier.reachText}
          </p>
        )}
        <details>
          <summary>Poziomy Znajomości (s. 159–161)</summary>
          <ul>
            {cpredAbilityTiersUpTo(CPRED_OPERATOR_TIERS, rank).map((entry) => (
              <li key={entry.id}>
                <b>{entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}`}</b> —{' '}
                {entry.contacts}
                <br />
                Zasięg: {entry.reachText}
                <br />
                Wazeliniarz: {entry.chameleon}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <p className="awareness-hint">
        Rzut: CHA + Handel ({trading}) + Znajomości ({rank}) + 1k10 przeciw rzutowi drugiej strony.
        Jeden targ na transakcję; Zasięg i Wazeliniarz rozstrzyga MG przy stole.
      </p>
    </div>
  );
}
