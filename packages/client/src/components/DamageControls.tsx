import { useMemo, useState } from 'react';
import type { ChatMessageView, CpredHitLocation, DamageLogEntry, RollResult } from '@vtt/shared';
import {
  ARMOR_SP_MAX,
  CPRED_HIT_LOCATIONS,
  CPRED_HIT_LOCATION_LABELS,
  isCpredHitLocation,
} from '@vtt/shared';
import { applyDamage, expireTimedEffect, undoDamage } from '../socket.js';
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

  /**
   * „Zastosuj wszystkim" (stage 16d) — one roll, N applications.
   *
   * Deliberately N separate calls rather than one bulk event: every call writes
   * its own log row, so the GM can take the grenade back off one person without
   * un-exploding it for the other three. „Każdy cel otrzymuje tyle samo
   * obrażeń" (s. 174) is satisfied by the *roll* being shared, not by the
   * bookkeeping being shared.
   */
  const area = roll.damage?.areaTargets ?? [];
  function applyToArea() {
    for (const target of area) {
      if (target.coverId !== undefined) {
        applyDamage({ messageId: message.id, coverId: target.coverId });
      } else if (target.tokenId) {
        applyDamage({ messageId: message.id, tokenId: target.tokenId, location: 'body' });
      }
    }
  }

  return (
    <div className="damage-apply">
      {area.length > 0 && (
        <button
          type="button"
          className="small-button"
          title={`Rozlicza ten sam rzut na każdym celu z obszaru: ${area
            .map((target) => target.name)
            .join(', ')}. Każde trafienie można cofnąć osobno.`}
          onClick={applyToArea}
        >
          Zastosuj wszystkim ({area.length})
        </button>
      )}
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
            : `Przebicie: ${entry.damageThrough} obr.${
                entry.doubled ? ` (×${entry.headMultiplier ?? 2} w głowę)` : ''
              }`}
        </span>
        <span className="chat-damage-detail">
          rzut {entry.damageRolled}
          {/*
            „OB 6 (połowa)" rather than a bare 6: a player who knows the target
            wears OB 11 has to be told why six was subtracted, or the arithmetic
            reads as a bug (s. 176 — broń biała i sztuki walki).
          */}
          {entry.armorSp > 0
            ? ` − OB ${entry.armorSp}${entry.armorHalved ? ' (połowa pancerza)' : ''}`
            : entry.armorHalved
              ? ' · pancerz przepołowiony do zera'
              : ' · bez pancerza'}
          {/* Redukcja obrażeń Solo (etap 30a, s. 146). Nazwana z tego samego
              powodu, co połowa pancerza wyżej: bez tego zdania różnica między
              tym, co przeszło przez OB, a tym, co zeszło z PW, nie ma
              wytłumaczenia. */}
          {entry.damageReduced ? ` − ${entry.damageReduced} (Redukcja obrażeń)` : ''}
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
        {/* What the round did, named rather than silently folded into the
            numbers above (stage 16g) — the „Trzymanie −2" treatment. */}
        {entry.ammo && (
          <span className="chat-damage-detail">
            {entry.ammo.label ?? 'nabój'}: {entry.ammo.name}
            {entry.ammo.notes && entry.ammo.notes.length > 0
              ? ` · ${entry.ammo.notes.join(' · ')}`
              : ''}
          </span>
        )}
        <div className="chat-roll-badges">
          {entry.woundLabel && (
            <span className="chat-roll-badge chat-roll-badge--wound">{entry.woundLabel}</span>
          )}
          {/*
            A wound named by a round rather than drawn from the table has no 2k6
            behind it (stage 16h), so the provenance is dropped instead of
            printing „2k6 = 0" — which would read as a broken die.
          */}
          {entry.injury && (
            <span className="chat-roll-badge chat-roll-badge--injury" title={entry.injury.effect}>
              Rana krytyczna
              {entry.injury.rolled > 0 ? ` (2k6 = ${entry.injury.rolled})` : ''}:{' '}
              {entry.injury.name}
            </span>
          )}
          {entry.injuryExtra && (
            <span
              className="chat-roll-badge chat-roll-badge--injury"
              title={entry.injuryExtra.effect}
            >
              Druga rana
              {entry.injuryExtra.rolled > 0 ? ` (2k6 = ${entry.injuryExtra.rolled})` : ''}:{' '}
              {entry.injuryExtra.name}
            </span>
          )}
          {entry.injuryNote && (
            <span className="chat-roll-badge chat-roll-badge--note">{entry.injuryNote}</span>
          )}
          {/*
            The Aimed Shot's own consequence (s. 170). „Złamana noga" is named by
            the aim rather than drawn, so it carries no 2k6 at all — the badge
            says where the shot went instead of pretending a die was rolled.
          */}
          {entry.injuryAimed && (
            <span
              className="chat-roll-badge chat-roll-badge--injury"
              title={entry.injuryAimed.effect}
            >
              Celowanie{entry.aimedAt ? ` (${entry.aimedAt.toLowerCase()})` : ''}:{' '}
              {entry.injuryAimed.name}
            </span>
          )}
          {entry.aimNote && (
            <span className="chat-roll-badge chat-roll-badge--note">
              {entry.aimedAt ? `Celowanie (${entry.aimedAt.toLowerCase()}) — ` : ''}
              {entry.aimNote}
            </span>
          )}
          {/* „na minutę — do rundy 9" / „poza walką, zdejmuje MG" (stage 16h). */}
          {entry.timed && (
            <span className="chat-roll-badge chat-roll-badge--note">
              {entry.timed.expired ? 'Efekt minął' : entry.timed.label}
            </span>
          )}
          {entry.undone && (
            <span className="chat-roll-badge chat-roll-badge--note">
              Cofnięte{entry.undoneByName ? ` — ${entry.undoneByName}` : ''}
            </span>
          )}
        </div>
        {/*
          The GM's clock (stage 16h). In a fight the round counter presses this
          first; outside one nothing else can, which is exactly why the button
          exists. Deliberately not „Cofnij": undoing says the hit should never
          have happened and gives the hit points back, this says the minute has
          passed and leaves everything the round earned.
        */}
        {isGm && entry.timed && !entry.timed.expired && !entry.undone && entry.targetTokenId && (
          <button
            type="button"
            className="small-button"
            title="Zdejmij efekt, którego czas minął (PW i rany z tego trafienia zostają)"
            onClick={() =>
              expireTimedEffect({
                tokenId: entry.targetTokenId!,
                ...(entry.timed!.statusIds ? { statusIds: entry.timed!.statusIds } : {}),
                ...(entry.timed!.injuryIds ? { injuryIds: entry.timed!.injuryIds } : {}),
                messageId: message.id,
              })
            }
          >
            Minęła minuta
          </button>
        )}
        {entry.injury && <p className="chat-damage-injury-effect">{entry.injury.effect}</p>}
        {entry.injuryExtra && (
          <p className="chat-damage-injury-effect">{entry.injuryExtra.effect}</p>
        )}
        {entry.injuryAimed && (
          <p className="chat-damage-injury-effect">{entry.injuryAimed.effect}</p>
        )}
      </div>
    </div>
  );
}
