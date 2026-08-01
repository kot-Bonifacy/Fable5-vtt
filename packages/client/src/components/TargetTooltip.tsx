import { useMemo } from 'react';
import { CPRED_ATTACK_MODE_LABELS, formatMetres } from '@vtt/shared';
import { planAttackPreview, type AttackIntent } from '../attack-targeting.js';
import { useAttackStore } from '../stores/attackStore.js';
import { activeWeaponOf, useHudStore } from '../stores/hudStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * The bubble under the crosshair (stage 16f): distance, range band, DV, fire
 * mode and what the magazine will look like afterwards.
 *
 * **It is a preview, and it says so by being wrong sometimes.** Everything in
 * it comes from the same `planCpredAttack` the cup and the server run, but the
 * client cannot see a wall (stage 16b) — the geometry never leaves the server —
 * so a shot this bubble prices at DV 20 may still come back „linia strzału
 * zablokowana". Advertising a hit chance on top of that would be a promise
 * nothing here is in a position to make; RAW does not think in percentages
 * anyway.
 */

/** Where the pointer is, in client pixels, and what it is over. */
export interface AimHover {
  tokenId: string;
  clientX: number;
  clientY: number;
}

/** Keeps the bubble on screen next to a pointer near the right or bottom edge. */
const OFFSET = 18;
const ESTIMATED_WIDTH = 260;
const ESTIMATED_HEIGHT = 150;

export function TargetTooltip({ hover }: { hover: AimHover | null }) {
  const targeting = useAttackStore((s) => s.targeting);
  const activeWeapon = useHudStore((s) => s.activeWeapon);
  const selectedId = useSelectionStore((s) => s.tokenId);
  const tokens = useTokenStore((s) => s.tokens);

  /**
   * Who is doing the aiming. The crosshair armed from a sheet wins, because
   * that gesture named a weapon out loud; otherwise it is whatever the action
   * bar has in hand.
   */
  const intent = useMemo<AttackIntent | null>(() => {
    if (targeting) {
      const attackerToken = targeting.attackerTokenId
        ? tokens[targeting.attackerTokenId]
        : targeting.characterId
          ? Object.values(tokens).find((token) => token.characterId === targeting.characterId)
          : undefined;
      if (!attackerToken) return null;
      return {
        ...(targeting.characterId ? { characterId: targeting.characterId } : {}),
        attackerTokenId: attackerToken.id,
        weaponRowId: targeting.weaponRowId,
        mode: targeting.mode,
        aimed: targeting.aimed,
        modifier: targeting.modifier,
      };
    }
    const weapon = activeWeaponOf(activeWeapon, selectedId);
    if (!weapon) return null;
    const attacker = tokens[weapon.tokenId];
    if (!attacker) return null;
    return {
      ...(attacker.characterId ? { characterId: attacker.characterId } : {}),
      attackerTokenId: weapon.tokenId,
      weaponRowId: weapon.weaponRowId,
      mode: weapon.mode,
    };
  }, [targeting, activeWeapon, selectedId, tokens]);

  const preview = useMemo(
    () => (hover && intent ? planAttackPreview(intent, hover.tokenId) : null),
    [hover, intent],
  );

  if (!hover || !preview) return null;
  const target = tokens[hover.tokenId];

  const left = Math.min(hover.clientX + OFFSET, window.innerWidth - ESTIMATED_WIDTH);
  const top = Math.min(hover.clientY + OFFSET, window.innerHeight - ESTIMATED_HEIGHT);

  return (
    <div className="aim-tooltip" style={{ left: Math.max(8, left), top: Math.max(8, top) }}>
      <p className="aim-tooltip-title">{target?.name ?? 'Cel'}</p>
      {preview.ok ? (
        <>
          <p className="aim-tooltip-line">
            <span className="aim-tooltip-weapon">{preview.attack.weaponName}</span>
            {preview.attack.mode !== 'single' && (
              <span className="aim-tooltip-mode">
                {CPRED_ATTACK_MODE_LABELS[preview.attack.mode].toLowerCase()}
              </span>
            )}
          </p>
          <dl className="aim-tooltip-facts">
            <div>
              <dt>Dystans</dt>
              <dd>{formatMetres(preview.metres)}</dd>
            </div>
            {preview.attack.rangeLabel && (
              <div>
                <dt>Przedział</dt>
                <dd>{preview.attack.rangeLabel}</dd>
              </div>
            )}
            <div>
              <dt>PT</dt>
              {/* Suppressive fire has no DV of its own: the shooter's total
                  becomes the DV everybody in the cone has to beat (stage 16). */}
              <dd>{preview.attack.dv === null ? 'twój wynik' : preview.attack.dv}</dd>
            </div>
            {preview.attack.ammoCost > 0 && (
              <div>
                <dt>Naboje</dt>
                <dd>
                  {preview.attack.ammoBefore} → {preview.attack.ammoAfter}
                </dd>
              </div>
            )}
          </dl>
          <p className="aim-tooltip-note">
            Klik ładuje kubek. Ściany sprawdza serwer w chwili rzutu.
          </p>
        </>
      ) : (
        <>
          <p className="aim-tooltip-refusal">{preview.message}</p>
          {/* Stage 16c: a cover is the one obstacle the client can see coming,
              so the bubble names it and how much of it is left — the number the
              choice on the card actually turns on. */}
          {preview.cover && (
            <p className="aim-tooltip-note">
              {preview.cover.name}: {preview.cover.hpCurrent}/{preview.cover.hpMax} PW · klik
              otworzy wybór
            </p>
          )}
        </>
      )}
    </div>
  );
}
