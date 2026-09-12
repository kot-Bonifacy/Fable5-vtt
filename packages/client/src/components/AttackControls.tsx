import type { ChatMessageView, RollAttackMeta } from '@vtt/shared';
import { ROLE_GM, formatMetres } from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
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
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;

  const system = attack.system as {
    weaponRowId?: string;
    weaponName?: string;
    dvSource?: string;
    attackerTokenId?: string;
  };

  /** The sheet that fired — needed to roll its weapon's damage. */
  const attackerSheet = Object.values(characters).find((character) =>
    character.data.weapons.some((weapon) => weapon.id === system.weaponRowId),
  );

  /**
   * Figura bez karty też zadaje obrażenia (zaległość z 23.08).
   *
   * Figura prowadzona przez żeton strzela od 16b, ale atakującego szukało się
   * wyłącznie wśród **kart, które ten widz ma w ręku** — więc jej karta ataku
   * pokazywała trafienie i nikogo nie raniła, a MG odejmował PW ręcznie
   * skrótami ±5. To ta sama luka, którą 22.08 zamknięto po stronie obrony
   * (`statistDefender` niżej). Od 38a rozstrzyga o tym adres: rzut jedzie
   * `attackerTokenId`, a serwer bierze z niego kartę tej figury.
   */
  const attackerToken = system.attackerTokenId ? tokens[system.attackerTokenId] : undefined;
  const statistAttacker =
    !attackerSheet && attackerToken?.characterId
      ? isGm || (user?.id !== undefined && attackerToken.ownerId === user.id)
        ? attackerToken
        : undefined
      : undefined;

  /** Whoever the damage roll is loaded for: a sheet, or a figure without one. */
  const shooter = attackerSheet
    ? { name: attackerSheet.name, address: { characterId: attackerSheet.id } }
    : statistAttacker
      ? { name: statistAttacker.name, address: { attackerTokenId: statistAttacker.id } }
      : undefined;

  /**
   * The defender's sheet, if this viewer may act for it. A player sees only
   * their own characters, so this is empty for everybody else at the table.
   */
  const targetToken = attack.targetTokenId ? tokens[attack.targetTokenId] : undefined;
  const defender =
    targetToken?.characterId !== undefined && targetToken.characterId !== null
      ? characters[targetToken.characterId]
      : undefined;
  /**
   * Figura bez karty też się uchyla (sesja naprawcza 22.08).
   *
   * PT obrony figury liczy się z jej karty, ale przycisk pojawiał się wyłącznie
   * dla celu, którego kartę ten widz **ma** — Zbir z Poligonu nie miał więc jak
   * uniknąć niczego. Rzut idzie tą samą kartą, którą policzone było PT, więc
   * bierna i czynna obrona nie mogą się rozjechać.
   */
  const statistDefender =
    targetToken?.characterId && !defender
      ? isGm || (user?.id !== undefined && targetToken.ownerId === user.id)
        ? targetToken
        : undefined
      : undefined;

  function rollDamage() {
    if (!shooter || !system.weaponRowId) return;
    useRollStore.getState().loadCup({
      ...shooter.address,
      characterName: shooter.name,
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

  /**
   * The sheet steering a figure caught in a blast, when this viewer may act for
   * it (stage 16d). Absent for anyone else's figure, which is also why the
   * button is only ever drawn on rows the viewer could actually roll for.
   */
  function evadeableBy(tokenId: string | undefined) {
    if (!tokenId) return undefined;
    const characterId = tokens[tokenId]?.characterId;
    return characterId ? characters[characterId] : undefined;
  }

  /** „Odskocz" — one figure jumping out of the square (s. 174). */
  function jumpClear(tokenId: string) {
    const character = evadeableBy(tokenId);
    if (!character) return;
    useRollStore.getState().loadEvasionCup({
      messageId: message.id,
      characterId: character.id,
      characterName: character.name,
      tokenId,
      title: `Odskok: ${character.name}`,
      modifierTotal: 0,
    });
  }

  /**
   * „Popraw strzał" — the smart round's second roll (stage 16h).
   *
   * Rolled by the shooter through the cup like everything else at this table,
   * and against the same DV: the server reads it off the stored card, so nothing
   * about the shot can drift between the two rolls.
   */
  function rollSmart() {
    if (!attackerSheet || !attack.smart) return;
    useRollStore.getState().loadEvasionCup({
      kind: 'smart',
      messageId: message.id,
      characterId: attackerSheet.id,
      characterName: attackerSheet.name,
      title: `Poprawka naboju: +${attack.smart.bonus}`,
      modifierTotal: attack.smart.bonus,
    });
  }

  function rollEvasion() {
    const name = defender?.name ?? statistDefender?.name;
    if (name === undefined) return;
    useRollStore.getState().loadEvasionCup({
      messageId: message.id,
      characterId: defender?.id ?? null,
      characterName: name,
      title: `Unik: ${name}`,
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
              {/* What failing cost them (stage 16h): „3k6 bezpośrednich · na minutę". */}
              {check.effect && <> · {check.effect}</>}
            </li>
          ))}
        </ul>
      )}
      {/*
        An empty list means „nobody was in range" — and only ever arrives empty
        when that is true. A player whose figures were simply filtered out of a
        volley's list gets no field at all (`redactChatMessage`), so this line
        can never become a lie told to them.
      */}
      {attack.forcedChecks && attack.forcedChecks.length === 0 && (
        <p className="chat-attack-detail">Nikt nie stał w zasięgu ognia zaporowego.</p>
      )}

      {attack.area && (
        <ul className="chat-attack-checks">
          {attack.area.targets.length === 0 && (
            <li className="chat-attack-check--held">
              {attack.area.shape === 'cone'
                ? 'W stożku nikogo nie było.'
                : 'Wybuch nikogo nie dosięgnął.'}
            </li>
          )}
          {attack.area.targets.map((target) => (
            <li
              key={target.tokenId ?? `cover-${target.coverId}`}
              className={target.spared ? 'chat-attack-check--held' : 'chat-attack-check--pinned'}
            >
              <strong>{target.name}</strong> — {formatMetres(target.metres)} od środka
              {target.spared === 'wall' && ' · zasłonięty ścianą'}
              {target.spared === 'cover' && ` · zasłonięty: ${target.sparedBy ?? 'osłona'}`}
              {target.spared === 'evaded' && ' · odskoczył poza obszar'}
              {target.canEvade && !evadeableBy(target.tokenId) && ' · REF 8+ może Unikać'}
              {target.canEvade && evadeableBy(target.tokenId) && (
                <button
                  type="button"
                  className="small-button"
                  title="REF 8+ pozwala się uchylić: rzut ZW + Unik musi przebić rzut atakującego"
                  onClick={() => jumpClear(target.tokenId!)}
                >
                  {attack.area?.shape === 'cone' ? 'Unik' : 'Odskocz'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="chat-attack-actions">
        {/*
          `damageNotation` — nie `hit`, nie `area` — jest tu jedynym warunkiem,
          bo o tym, czy jest co rzucać, rozstrzyga serwer (`ammoDealsDamage`
          w `realtime/attacks.ts`: „no button, no notation, nothing to apply").
          Amunicja bez obrażeń z 16h — dym, gaz łzawiący, hukbłyskowa, EMP,
          usypiająca — trafia i zasnuwa obszar, a rzutu na obrażenia nie ma;
          przy warunku „trafił albo obszar" karta dymnego granatu wystawiała
          guzik „Obrażenia" z pustą kością (oględziny 04.09).
        */}
        {attack.damageNotation !== undefined && shooter && (
          <button
            type="button"
            className="small-button"
            title={
              attack.damageMultiplier && attack.damageMultiplier > 1
                ? `Rzut na obrażenia ${attack.damageNotation} ×${attack.damageMultiplier} — ładuje kubek`
                : `Rzut na obrażenia ${attack.damageNotation} — ładuje kubek`
            }
            onClick={rollDamage}
          >
            Obrażenia{' '}
            {attack.damageMultiplier && attack.damageMultiplier > 1
              ? `${attack.damageNotation} ×${attack.damageMultiplier}`
              : attack.damageNotation}
          </button>
        )}
        {!attack.evaded && attack.hit !== undefined && (defender ?? statistDefender) && (
          <button
            type="button"
            className="small-button"
            title="Zamiast PT z tabeli — rzut ZW + Unik obrońcy (ładuje kubek)"
            onClick={rollEvasion}
          >
            Unik: {defender?.name ?? statistDefender?.name}
          </button>
        )}
        {/*
          „Amunicja inteligentna": the round offers to correct a near miss
          (stage 16h). Only the shooter sees it, because only their sheet may
          spend the Luck the second roll allows.
        */}
        {attack.smart && attackerSheet && (
          <button
            type="button"
            className="small-button"
            title={`Nabój naprowadza się po chybieniu o ${attack.smart.missedBy}: 1k10 + ${
              attack.smart.bonus
            } przeciw temu samemu PT${
              attack.smart.requires ? ` · wymaga: ${attack.smart.requires}` : ''
            }`}
            onClick={rollSmart}
          >
            Popraw strzał 1k10+{attack.smart.bonus}
          </button>
        )}
      </div>
      {attack.smart?.requires && (
        <p className="chat-attack-detail">
          Ten nabój wymaga cyborgizacji „{attack.smart.requires}" — VTT tego nie sprawdza.
        </p>
      )}
    </div>
  );
}
