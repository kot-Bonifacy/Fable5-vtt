import type { ChatMessageView, RollAttackMeta } from '@vtt/shared';
import { useCharacterStore } from '../stores/characterStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * The attack card on the chat (stage 16).
 *
 * It shows the verdict the server reached and offers the two follow-ups:
 * „Obrażenia" chains into the damage roll that already knows its notation,
 * its multiplier and its target (stage 15 then applies it), and „Unik" lets
 * the defender replace the range DV with a real Evasion roll.
 *
 * Both buttons only load the dice cup — as everywhere else in this VTT, dice
 * are thrown by hand.
 */
export function AttackRow({
  message,
  attack,
}: {
  message: ChatMessageView;
  attack: RollAttackMeta;
}) {
  const characters = useCharacterStore((s) => s.characters);
  const tokens = useTokenStore((s) => s.tokens);

  const system = attack.system as {
    weaponRowId?: string;
    weaponName?: string;
    dvSource?: string;
  };

  /** The sheet that fired — needed to roll its weapon's damage. */
  const attacker = Object.values(characters).find((character) =>
    character.data.weapons.some((weapon) => weapon.id === system.weaponRowId),
  );

  /**
   * The defender's sheet, if this viewer may act for it. A player sees only
   * their own characters, so this is empty for everybody else at the table.
   */
  const targetToken = attack.targetTokenId ? tokens[attack.targetTokenId] : undefined;
  const defender =
    targetToken?.characterId !== undefined && targetToken.characterId !== null
      ? characters[targetToken.characterId]
      : undefined;

  function rollDamage() {
    if (!attacker || !system.weaponRowId) return;
    useRollStore.getState().loadCup({
      characterId: attacker.id,
      characterName: attacker.name,
      kind: 'damage',
      weaponRowId: system.weaponRowId,
      // The server reads notation, multiplier, location and target off the
      // stored attack — this id is the whole request.
      request: {
        kind: 'damage',
        weaponRowId: system.weaponRowId,
        attackMessageId: message.id,
      },
      visibility: 'public',
      title: `${system.weaponName ?? 'Broń'} — obrażenia`,
      modifierTotal: 0,
    });
  }

  function rollEvasion() {
    if (!defender) return;
    useRollStore.getState().loadEvasionCup({
      messageId: message.id,
      characterId: defender.id,
      characterName: defender.name,
      title: `Unik: ${defender.name}`,
      modifierTotal: 0,
    });
  }

  const verdict =
    attack.hit === undefined
      ? { text: 'Ogień zaporowy', className: 'suppressive' }
      : attack.hit
        ? { text: 'Trafienie', className: 'success' }
        : { text: 'Pudło', className: 'failure' };

  return (
    <div className="chat-attack">
      <div className="chat-roll-badges">
        <span className={`chat-roll-badge chat-roll-badge--${verdict.className}`}>
          {verdict.text}
        </span>
        <span className="chat-attack-detail">{attack.detail}</span>
      </div>

      {attack.forcedChecks && attack.forcedChecks.length > 0 && (
        <ul className="chat-attack-checks">
          {attack.forcedChecks.map((check) => (
            <li
              key={`${check.name}-${check.detail}`}
              className={check.success ? 'chat-attack-check--held' : 'chat-attack-check--pinned'}
            >
              <strong>{check.name}</strong> — {check.detail}
            </li>
          ))}
        </ul>
      )}
      {attack.forcedChecks && attack.forcedChecks.length === 0 && (
        <p className="chat-attack-detail">Nikt nie stał w zasięgu ognia zaporowego.</p>
      )}

      <div className="chat-attack-actions">
        {attack.hit && attacker && (
          <button
            type="button"
            className="small-button"
            title={
              attack.damageMultiplier && attack.damageMultiplier > 1
                ? `Rzut na obrażenia ${attack.damageNotation} ×${attack.damageMultiplier} — ładuje kubek`
                : `Rzut na obrażenia ${attack.damageNotation ?? ''} — ładuje kubek`
            }
            onClick={rollDamage}
          >
            Obrażenia{' '}
            {attack.damageMultiplier && attack.damageMultiplier > 1
              ? `${attack.damageNotation} ×${attack.damageMultiplier}`
              : (attack.damageNotation ?? '')}
          </button>
        )}
        {!attack.evaded && attack.hit !== undefined && defender && (
          <button
            type="button"
            className="small-button"
            title="Zamiast PT z tabeli — rzut ZW + Unik obrońcy (ładuje kubek)"
            onClick={rollEvasion}
          >
            Unik: {defender.name}
          </button>
        )}
      </div>
    </div>
  );
}
