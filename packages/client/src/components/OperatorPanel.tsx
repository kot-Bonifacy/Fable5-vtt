import { useState } from 'react';
import {
  COST_CATEGORY_LABELS,
  CPRED_HAGGLE_OPPONENT_MAX,
  CPRED_HAGGLE_SKILL_ID,
  CPRED_OPERATOR_ABILITY,
  CPRED_OPERATOR_TIERS,
  ROLE_GM,
  cpredAbilityTiersUpTo,
  cpredHaggleDeal,
  cpredHaggleDeals,
  cpredOperatorReach,
  cpredOperatorTierAt,
  cpredRoleAbilityRank,
  readCpredHaggle,
  cpredSkillLevel,
  formatGameDate,
  type CpredHaggleDeal,
} from '@vtt/shared';
import { clearNotices, notifyInfo } from '../notices.js';
import { dropHaggle, setHaggleOpponent, settleDebt, strikeHaggle } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';
import { formatEd } from './exchange/items.js';
import { NumberStepper } from './NumberStepper.js';

/**
 * Znajomości Fixera (etap 30d, s. 159–161; etap 71e).
 *
 *  - **Zasięg** i **Wazeliniarz** to proza dla stołu (decyzja MG z 30.08,
 *    potwierdzona na bramce 15.11): żadna postać nie sięga ponad poziom
 *    sklepu kampanii.
 *  - **Targowanie się** liczy VTT. Od 71e druga strona ma liczbę z prawdziwego
 *    źródła: przy ladzie handlarza — z jego karty (przycisk w oknie
 *    „Wymiana”), poza sklepem — sumę wpisuje tu MG, a jeden rzut gracza ją
 *    zużywa. Targ procentowy działa na zakup albo sprzedaż, szósta sztuka
 *    i rata „pół teraz, pół za miesiąc” — w koszyku sklepu.
 *  - **Raty** wiszą na karcie z terminem; niespłacona zamyka targ na zawsze.
 */

/** Co targ robi w VTT — drobny dopisek przy pozycji menu. */
function dealNote(deal: CpredHaggleDeal): string {
  if (deal.discount !== undefined) return `−${deal.discount}% zakup / +${deal.discount}% sprzedaż`;
  if (deal.id === 'sixthFree') return 'w koszyku sklepu';
  if (deal.id === 'halfLater') return 'rata w koszyku sklepu';
  return 'zapis dla stołu';
}

export function OperatorPanel({ characterId }: { characterId: string }) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [opponent, setOpponent] = useState(0);
  const [opponentLabel, setOpponentLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const inCombat = useCombatLocked();

  const rank = character
    ? cpredRoleAbilityRank(character.data, registry, CPRED_OPERATOR_ABILITY)
    : null;
  if (!character || rank === null) return null;

  const tier = cpredOperatorTierAt(rank);
  const reach = cpredOperatorReach(rank);
  const struck = readCpredHaggle(character.data.haggle);
  const struckDeal = struck ? cpredHaggleDeal(struck.dealId) : null;
  const trading = cpredSkillLevel(character.data, CPRED_HAGGLE_SKILL_ID);
  const given = character.data.haggleOpponent ?? null;
  const debts = character.data.debts ?? [];
  const halfLaterClosed = character.data.halfLaterClosed === true;
  // Gracz rzuca przeciw sumie od MG; MG rzuca od ręki z liczbą z pola.
  const canRoll = isGm || given !== null;

  async function haggle(dealId: string): Promise<void> {
    setBusy(dealId);
    clearNotices('character');
    const result = await strikeHaggle(characterId, dealId, isGm ? { opponentBonus: opponent } : {});
    setBusy(null);
    if (!result.ok) return;
    notifyInfo(
      result.won
        ? 'Targ dobity — zadziała przy najbliższej transakcji.'
        : 'Druga strona nie ustąpiła. Remis też przegrywa.',
      { title: 'Znajomości', topic: 'character' },
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
          {struck.discount > 0 ? ` (${dealNote(struckDeal)})` : ''}
          {struck.merchantId ? ' — tylko przy tej ladzie' : ''}
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

      {isGm ? (
        <div className="haggle-opponent">
          <span>Druga strona (CHA + Handel + Znajomości)</span>
          <NumberStepper
            min={0}
            max={CPRED_HAGGLE_OPPONENT_MAX}
            value={opponent}
            onChange={setOpponent}
            label="Modyfikator drugiej strony"
          />
          <input
            type="text"
            className="haggle-opponent-label"
            value={opponentLabel}
            maxLength={60}
            placeholder="kto (opcjonalnie)"
            aria-label="Kim jest druga strona"
            onChange={(event) => setOpponentLabel(event.target.value)}
          />
          <button
            type="button"
            className="cp-mini-button"
            title="Gracz targuje się sam przeciw tej sumie — jeden rzut ją zużywa"
            onClick={() =>
              void setHaggleOpponent(characterId, { bonus: opponent, label: opponentLabel })
            }
          >
            Daj graczowi
          </button>
          {given && (
            <small className="backup-stats">
              {' '}
              czeka: {given.label ? `${given.label} ` : ''}
              {given.bonus}{' '}
              <button
                type="button"
                className="cp-mini-button"
                title="Zdejmij sumę drugiej strony"
                aria-label="Zdejmij sumę drugiej strony"
                onClick={() => void setHaggleOpponent(characterId, null)}
              >
                ✕
              </button>
            </small>
          )}
        </div>
      ) : (
        <p className="awareness-derived haggle-given">
          {given
            ? `Druga strona: ${given.label ? `${given.label}, ` : ''}${given.bonus} + 1k10 (podał MG — jeden rzut).`
            : 'Poza sklepem sumę drugiej strony podaje MG. Przy ladzie handlarza targujesz się w oknie „Wymiana”.'}
        </p>
      )}

      <ul className="awareness-list">
        {cpredHaggleDeals(rank).map((deal) => {
          const closed = deal.id === 'halfLater' && halfLaterClosed;
          return (
            <li key={deal.id} className="awareness-row backup-row">
              <span className="awareness-name" title={deal.text}>
                {deal.name}
                <small className="backup-stats">
                  {' '}
                  poziom {deal.level} · {closed ? 'zamknięty na zawsze' : dealNote(deal)}
                </small>
              </span>
              <span className="awareness-steps">
                <button
                  type="button"
                  disabled={busy !== null || inCombat || !canRoll || closed}
                  title={
                    inCombat
                      ? COMBAT_LOCKED_HINT
                      : !canRoll
                        ? 'Sumę drugiej strony podaje MG'
                        : `Targuj się o: ${deal.name}`
                  }
                  aria-label={`Targuj się: ${deal.name}`}
                  onClick={() => void haggle(deal.id)}
                >
                  {busy === deal.id ? '…' : 'Targuj'}
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {(debts.length > 0 || halfLaterClosed) && (
        <div className="haggle-debts" data-testid="haggle-debts">
          <p className="awareness-derived">
            <b>Raty „pół teraz, pół za miesiąc”</b>
            {halfLaterClosed ? ' — targ zamknięty przez niespłaconą ratę' : ''}
          </p>
          <ul className="awareness-list">
            {debts.map((debt) => (
              <li key={debt.id} className="awareness-row backup-row">
                <span className="awareness-name" title={debt.label}>
                  {formatEd(debt.amount)} — {debt.creditor || 'sprzedawca'}
                  <small className="backup-stats">
                    {' '}
                    {debt.overdue ? 'po terminie' : `termin ${formatGameDate(debt.dueAtMinute)}`}
                  </small>
                </span>
                <span className="awareness-steps">
                  <button
                    type="button"
                    disabled={character.data.eddies < debt.amount}
                    title={
                      character.data.eddies < debt.amount
                        ? 'Za mało gotówki na karcie'
                        : `Spłać ${formatEd(debt.amount)}`
                    }
                    aria-label={`Spłać ratę: ${debt.creditor}`}
                    onClick={() => void settleDebt(characterId, debt.id, 'pay')}
                  >
                    Spłać
                  </button>
                  {isGm && (
                    <button
                      type="button"
                      title="Umorz ratę (decyzja MG) — bez pieniędzy"
                      aria-label={`Umorz ratę: ${debt.creditor}`}
                      onClick={() => void settleDebt(characterId, debt.id, 'forgive')}
                    >
                      Umorz
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
