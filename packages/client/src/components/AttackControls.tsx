import type { ChatMessageView, RollAttackMeta } from '@vtt/shared';
import { ROLE_GM, formatMetres } from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { declineEvasion } from '../socket.js';
import { attackAwaitsDamage, attackShooterFor, damageRollFor } from '../attack-damage-call.js';

/**
 * The attack card on the chat (stage 16).
 *
 * It shows the verdict the server reached and offers „Unik", which lets the
 * defender replace the range DV with a real Evasion roll (it only loads the
 * dice cup — as everywhere else in this VTT, dice are thrown by hand).
 *
 * The damage roll has no button here since 14.10 (MG): once nobody is left to
 * dodge, the shooter's cup calls for it by itself (`attack-damage-call.ts`).
 * The card only says that, and offers „Na kubek" when the call was put away.
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

  const { attackerSheet, shooter, leads } = attackShooterFor(
    message,
    attack,
    characters,
    tokens,
    user,
  );
  const skippedDamageCalls = useRollStore((s) => s.skippedDamageCalls);

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

  /**
   * Obrażenia czekają na decyzję o Uniku (03.10, decyzja MG po T8b) i padają
   * raz na trafienie (#56). Obie rzeczy rozstrzyga serwer; karta mówi tylko,
   * na kogo czeka, żeby przycisk nie wyglądał na zepsuty.
   */
  const pending = attack.evasionPending ?? [];
  const damageRolled = attack.damageRollId !== undefined;
  const pendingNames = pending.map(
    (tokenId) =>
      attack.area?.targets.find((target) => target.tokenId === tokenId)?.name ??
      tokens[tokenId]?.name ??
      'cel',
  );
  /** Ten widz może rzucić obrażenia za tę kartę i jeszcze nikt ich nie rzucił. */
  const awaitsMyDamage = shooter !== undefined && attackAwaitsDamage(attack);
  /** Kubek tego widza sam o nie woła — chyba że wezwanie odłożył `Esc`. */
  const cupCalls = leads && !skippedDamageCalls.has(message.id);
  /** „Na kubek": przywraca odłożone wezwanie albo — za cudzego strzelca — ładuje kubek. */
  function damageToCup() {
    if (!shooter) return;
    const store = useRollStore.getState();
    if (leads) {
      store.restoreDamageCall(message.id);
      return;
    }
    const pendingRoll = damageRollFor(message.id, attack, shooter);
    if (pendingRoll) store.loadCup(pendingRoll);
  }
  const damageDice =
    attack.damageMultiplier && attack.damageMultiplier > 1
      ? `${attack.damageNotation} ×${attack.damageMultiplier}`
      : attack.damageNotation;
  /**
   * „Bez uniku" for a single target — the GM's alone since 17.10: a dodge after
   * a known hit costs nothing, so a player always rolls it.
   */
  const mayAnswerDodge =
    isGm && attack.targetTokenId !== undefined && pending.includes(attack.targetTokenId);

  const verdict =
    attack.hit === undefined
      ? { text: 'Ogień zaporowy', className: 'suppressive' }
      : attack.hit
        ? { text: 'Trafienie', className: 'success' }
        : attack.evaded
          ? { text: 'Uniknięty', className: 'failure' }
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
              {/* „Bez uniku” mówi tylko MG (17.10): gracz zawsze rzuca. */}
              {target.tokenId && pending.includes(target.tokenId) && isGm && (
                <button
                  type="button"
                  className="small-button"
                  title="Zostaje w obszarze — obrażenia przestają na niego czekać"
                  onClick={() =>
                    declineEvasion({ messageId: message.id, tokenId: target.tokenId! })
                  }
                >
                  Bez uniku
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="chat-attack-actions">
        {!attack.evaded &&
          !attack.noEvade &&
          !damageRolled &&
          attack.hit !== undefined &&
          (defender ?? statistDefender) &&
          // Gracz dostaje Unik tylko tam, gdzie serwer na niego czeka (17.10):
          // guzik bez wstrzymanych obrażeń (REF poniżej 8 przy strzale, pudło)
          // znikał po rzucie strzelca i wyglądał na przegapioną szansę. MG
          // zostaje przy swoim — to on orzeka, że cel widział strzał.
          (isGm ||
            (attack.targetTokenId !== undefined && pending.includes(attack.targetTokenId))) && (
            <button
              type="button"
              className="small-button"
              title="Zamiast PT z tabeli — rzut ZW + Unik obrońcy (ładuje kubek)"
              onClick={rollEvasion}
            >
              Unik: {defender?.name ?? statistDefender?.name}
            </button>
          )}
        {mayAnswerDodge && (
          <button
            type="button"
            className="small-button"
            title="Obrońca nie unika — obrażenia przestają czekać"
            onClick={() => declineEvasion({ messageId: message.id })}
          >
            Bez uniku
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
      {/* Widać nie tylko w podpowiedzi: wyszarzony guzik bez słowa wyglądał
          na zepsuty (T8b, 03.10). */}
      {attack.damageNotation !== undefined && pending.length > 0 && !damageRolled && (
        <p className="chat-attack-detail">
          Obrażenia czekają na decyzję o uniku: {pendingNames.join(', ')}.
        </p>
      )}
      {/*
        Rzut obrażeń woła kubek strzelca (14.10). Guzik `damageNotation` —
        nie `hit`, nie `area` — bo o tym, czy jest co rzucać, rozstrzyga serwer
        (`ammoDealsDamage`): dym czy gaz trafia, a obrażeń nie ma.
      */}
      {awaitsMyDamage && (
        <p className="chat-attack-detail">
          {cupCalls ? (
            <>Obrażenia {damageDice} czekają na kubku.</>
          ) : (
            <>
              Obrażenia {damageDice} do rzutu.{' '}
              <button
                type="button"
                className="small-button"
                title={
                  leads
                    ? 'Obrażenia znów czekają na kubku'
                    : `Rzut za ${shooter?.name ?? 'strzelca'} — ładuje kubek`
                }
                onClick={damageToCup}
              >
                Na kubek
              </button>
            </>
          )}
        </p>
      )}
      {attack.smart?.requires && (
        <p className="chat-attack-detail">
          Ten nabój wymaga cyborgizacji „{attack.smart.requires}" — VTT tego nie sprawdza.
        </p>
      )}
    </div>
  );
}
