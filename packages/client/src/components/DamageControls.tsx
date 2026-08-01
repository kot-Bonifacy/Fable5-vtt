import { useMemo, useState } from 'react';
import type { ChatMessageView, CpredHitLocation, DamageLogEntry, RollResult } from '@vtt/shared';
import {
  ARMOR_SP_MAX,
  CPRED_HIT_LOCATIONS,
  CPRED_HIT_LOCATION_LABELS,
  isCpredHitLocation,
} from '@vtt/shared';
import { applyDamage, undoDamage } from '../socket.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useCoverStore } from '../stores/coverStore.js';

/**
 * Applying damage from the chat card (stage 15) — GM only.
 *
 * The card carries the rolled total; here the GM only picks the target and,
 * when the target has no sheet, the SP it is wearing. Everything else is
 * recomputed on the server, and the resulting log entry can be taken back.
 */

const NO_TARGET = '';
/**
 * Prefix marking a cover in the target dropdown (stage 16c). One `<select>`
 * rather than two, because „w co poszły te obrażenia" is a single question and
 * the answer is either a person or the car they were behind.
 */
const COVER_PREFIX = 'cover:';

export function DamageApplyControls({
  message,
  roll,
}: {
  message: ChatMessageView;
  roll: RollResult;
}) {
  const tokens = useTokenStore((s) => s.tokens);
  const covers = useCoverStore((s) => s.covers);
  const [tokenId, setTokenId] = useState<string>(
    // The attack already said what it was aimed at; „Zastosuj" only has to
    // agree with it (stage 16c: a shot at a car cannot land on a person).
    roll.damage?.targetCoverId !== undefined
      ? `${COVER_PREFIX}${roll.damage.targetCoverId}`
      : (roll.damage?.targetTokenId ?? NO_TARGET),
  );
  const [location, setLocation] = useState<CpredHitLocation>(
    isCpredHitLocation(roll.damage?.location) ? roll.damage.location : 'body',
  );
  const [armorOverride, setArmorOverride] = useState('');

  const options = useMemo(
    () => Object.values(tokens).sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    [tokens],
  );
  const coverId = tokenId.startsWith(COVER_PREFIX)
    ? Number.parseInt(tokenId.slice(COVER_PREFIX.length), 10)
    : null;
  const target = coverId === null && tokenId ? tokens[tokenId] : undefined;
  // A statist token carries its own HP; a linked one takes them from the sheet.
  const needsArmorHint = target !== undefined && target.characterId == null;

  function apply() {
    if (!tokenId) return;
    // A cover has no armour and no anatomy (s. 179), so neither field is sent —
    // and neither is shown, so there is nothing to send by accident.
    if (coverId !== null) {
      applyDamage({ messageId: message.id, coverId });
      return;
    }
    const sp = Number.parseInt(armorOverride, 10);
    applyDamage({
      messageId: message.id,
      tokenId,
      location,
      ...(Number.isInteger(sp) && sp >= 0 && sp <= ARMOR_SP_MAX ? { armorSp: sp } : {}),
    });
  }

  return (
    <div className="damage-apply">
      <select value={tokenId} onChange={(e) => setTokenId(e.target.value)} aria-label="Cel obrażeń">
        <option value={NO_TARGET}>Wybierz cel…</option>
        {options.map((token) => (
          <option key={token.id} value={token.id}>
            {token.name}
            {token.hp ? ` (${token.hp.current}/${token.hp.max} PW)` : ''}
          </option>
        ))}
        {covers.map((cover) => (
          <option key={`cover-${cover.id}`} value={`${COVER_PREFIX}${cover.id}`}>
            {cover.name} ({cover.hpCurrent}/{cover.hpMax} PW)
          </option>
        ))}
      </select>
      {coverId === null && (
        <>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value as CpredHitLocation)}
            aria-label="Trafiona lokacja"
          >
            {CPRED_HIT_LOCATIONS.map((id) => (
              <option key={id} value={id}>
                {CPRED_HIT_LOCATION_LABELS[id]}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="damage-armor-input"
            min={0}
            max={ARMOR_SP_MAX}
            value={armorOverride}
            onChange={(e) => setArmorOverride(e.target.value)}
            placeholder="OB"
            title={
              needsArmorHint
                ? 'Cel bez karty — wpisz OB pancerza, inaczej liczę 0'
                : 'Puste = OB z karty postaci'
            }
            aria-label="OB pancerza celu"
          />
        </>
      )}
      <button type="button" className="small-button" disabled={!tokenId} onClick={apply}>
        Zastosuj
      </button>
    </div>
  );
}

/** „Przebicie: 7 obrażeń, OB korpusu 11→10" — the applied-damage chat entry. */
export function DamageRow({
  message,
  entry,
  isGm,
}: {
  message: ChatMessageView;
  entry: DamageLogEntry;
  isGm: boolean;
}) {
  const stopped = entry.damageThrough === 0 && entry.bonusDamage === 0;
  return (
    <div className={`chat-message chat-damage${entry.undone ? ' chat-damage--undone' : ''}`}>
      <div className="chat-message-meta">
        <span className="chat-message-author">{entry.targetName}</span>
        <span className="chat-damage-location">{entry.locationLabel}</span>
        <span className="chat-message-time">
          {new Date(message.createdAt).toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        {isGm && !entry.undone && (
          <button
            type="button"
            className="small-button chat-damage-undo"
            title="Cofnij rozliczenie (PW, pancerz i rana wracają)"
            onClick={() => undoDamage(message.id)}
          >
            Cofnij
          </button>
        )}
      </div>
      <div className="chat-damage-body">
        <span className="chat-damage-headline">
          {stopped
            ? `Pancerz zatrzymał cios (${entry.damageRolled} obr., OB ${entry.armorSp})`
            : `Przebicie: ${entry.damageThrough} obr.${entry.doubled ? ' (×2 w głowę)' : ''}`}
        </span>
        <span className="chat-damage-detail">
          rzut {entry.damageRolled}
          {entry.armorSp > 0 ? ` − OB ${entry.armorSp}` : ' · bez pancerza'}
          {entry.bonusDamage > 0 ? ` + ${entry.bonusDamage} za ranę krytyczną` : ''}
          {entry.hp
            ? ` · PW ${entry.hp.before} → ${entry.hp.after}`
            : entry.hpLost > 0
              ? ` · −${entry.hpLost} PW`
              : ''}
        </span>
        {entry.armor && (
          <span className="chat-damage-detail">
            {entry.armor.name}: OB {entry.armor.before} → {entry.armor.after}
          </span>
        )}
        <div className="chat-roll-badges">
          {entry.woundLabel && (
            <span className="chat-roll-badge chat-roll-badge--wound">{entry.woundLabel}</span>
          )}
          {entry.injury && (
            <span className="chat-roll-badge chat-roll-badge--injury" title={entry.injury.effect}>
              Rana krytyczna (2k6 = {entry.injury.rolled}): {entry.injury.name}
            </span>
          )}
          {entry.injuryNote && (
            <span className="chat-roll-badge chat-roll-badge--note">{entry.injuryNote}</span>
          )}
          {entry.undone && (
            <span className="chat-roll-badge chat-roll-badge--note">
              Cofnięte{entry.undoneByName ? ` — ${entry.undoneByName}` : ''}
            </span>
          )}
        </div>
        {entry.injury && <p className="chat-damage-injury-effect">{entry.injury.effect}</p>}
      </div>
    </div>
  );
}
