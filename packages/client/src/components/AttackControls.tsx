import type { ReactNode } from 'react';
import type { ChatMessageView, RollAttackMeta, RollEvasionAnswer } from '@vtt/shared';
import { ROLE_GM, formatMetres } from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { declineEvasion } from '../socket.js';
import {
  attackAwaitsDamage,
  attackDamageDice,
  attackShooterFor,
  damageRollFor,
} from '../attack-damage-call.js';
import { attackPendingNames, attackStepStates, type AttackStepState } from '../attack-steps.js';

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
 *
 * Since etap 63c the card is three steps (`attack-steps.ts`), and the damage
 * roll with its settlements comes in as `damageParts` — drawn by the chat
 * panel, which owns the roll and damage cards.
 */
export function AttackRow({
  message,
  attack,
  damageParts,
}: {
  message: ChatMessageView;
  attack: RollAttackMeta;
  /** Rzut obrażeń i rozliczenia wciągnięte do kroku ③ (etap 63c). */
  damageParts?: ReactNode;
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

  const pending = attack.evasionPending ?? [];
  /** Unik, który serwer rzuca sam (etap 63b) — bez guzików, kości już lecą. */
  const autoEvasion = attack.autoEvasion ?? [];
  const damageRolled = attack.damageRollId !== undefined;
  const pendingNames = attackPendingNames(attack, tokens);
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
  const damageDice = attackDamageDice(attack);
  /**
   * „Bez uniku" for a single target — the GM's alone since 17.10: a dodge after
   * a known hit costs nothing, so a player always rolls it.
   */
  const mayAnswerDodge =
    isGm &&
    attack.targetTokenId !== undefined &&
    pending.includes(attack.targetTokenId) &&
    !autoEvasion.includes(attack.targetTokenId);
  /** „Unik: X" na karcie — cel, za który ten widz może rzucić, i serwer na niego czeka. */
  const mayDodge =
    !attack.evaded &&
    !attack.noEvade &&
    !damageRolled &&
    attack.hit !== undefined &&
    (defender ?? statistDefender) !== undefined &&
    !(attack.targetTokenId !== undefined && autoEvasion.includes(attack.targetTokenId)) &&
    // Gracz dostaje Unik tylko tam, gdzie serwer na niego czeka (17.10):
    // guzik bez wstrzymanych obrażeń (REF poniżej 8 przy strzale, pudło)
    // znikał po rzucie strzelca i wyglądał na przegapioną szansę. MG
    // zostaje przy swoim — to on orzeka, że cel widział strzał.
    (isGm || (attack.targetTokenId !== undefined && pending.includes(attack.targetTokenId)));
  const steps = attackStepStates(attack);
  const rollTotal = message.roll?.total ?? 0;
  const evasionVerb = attack.area && attack.area.shape !== 'cone' ? 'Odskok' : 'Unik';

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
              {target.canEvade &&
                evadeableBy(target.tokenId) &&
                !autoEvasion.includes(target.tokenId!) && (
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
              {target.tokenId &&
                pending.includes(target.tokenId) &&
                !autoEvasion.includes(target.tokenId) &&
                isGm && (
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

      {/*
        Kroki ataku (etap 63c): ① trafienie → ② Unik celu → ③ obrażenia. Karta
        rośnie na żywo, a rzut obrażeń i rozliczenia na celach wchodzą w krok ③
        (`foldAttackCards`) zamiast stać pod nią osobnymi kartami.
      */}
      {steps && (
        <ol className="chat-attack-steps">
          <li className={`chat-attack-step chat-attack-step--${steps.hit}`}>
            <span className="chat-attack-step-text">
              {steps.hit === 'done' ? 'Trafienie' : 'Pudło'} — rzut {rollTotal}
              {steps.hit === 'failed' && attack.area && ' · ładunek spada obok celu'}
            </span>
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
          </li>
          {steps.evasion && (
            <li className={`chat-attack-step chat-attack-step--${steps.evasion}`}>
              <span className="chat-attack-step-text">
                {evasionStepText(attack, steps.evasion, pendingNames, rollTotal, evasionVerb)}
              </span>
              {mayDodge && (
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
            </li>
          )}
          {steps.damage && (
            <li className={`chat-attack-step chat-attack-step--${steps.damage}`}>
              {steps.damage === 'done' ? (
                (damageParts ?? <span className="chat-attack-step-text">Obrażenia rzucone.</span>)
              ) : (
                <span className="chat-attack-step-text">
                  {steps.damage === 'skipped' ? (
                    'Bez obrażeń'
                  ) : steps.damage === 'waiting' ? (
                    <>Obrażenia {damageDice} czekają na Unik</>
                  ) : !awaitsMyDamage ? (
                    <>Obrażenia {damageDice} — rzuca strzelec</>
                  ) : cupCalls ? (
                    <>Obrażenia {damageDice} czekają na kubku</>
                  ) : (
                    <>
                      Obrażenia {damageDice} do rzutu{' '}
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
                </span>
              )}
            </li>
          )}
        </ol>
      )}
      {attack.smart?.requires && (
        <p className="chat-attack-detail">
          Ten nabój wymaga cyborgizacji „{attack.smart.requires}" — VTT tego nie sprawdza.
        </p>
      )}
    </div>
  );
}

/** „Unik Iskra: 14 vs 19 → unik udany” — jedna odpowiedź obrońcy. */
function answerText(answer: RollEvasionAnswer, rollTotal: number, verb: string): string {
  if (answer.declined) return `${answer.name}: bez uniku`;
  const luck = answer.luckSpent ? ` (Szczęście ${answer.luckSpent})` : '';
  const outcome =
    verb === 'Odskok'
      ? answer.hit
        ? 'nie zdążył'
        : 'poza obszarem'
      : answer.hit
        ? 'trafienie mimo uniku'
        : 'unik udany';
  return `${verb} ${answer.name}: ${answer.total ?? '?'}${luck} vs ${rollTotal} → ${outcome}${
    answer.auto ? ' · sam' : ''
  }`;
}

/** Zdanie kroku ② — na kogo czeka albo jak odpowiedział. */
function evasionStepText(
  attack: RollAttackMeta,
  state: AttackStepState,
  pendingNames: string[],
  rollTotal: number,
  verb: string,
): string {
  if (state === 'waiting') {
    const auto = attack.autoEvasion ?? [];
    const allAuto = (attack.evasionPending ?? []).every((tokenId) => auto.includes(tokenId));
    return allAuto
      ? `${verb}: ${pendingNames.join(', ')} — kości w drodze`
      : `Czeka na ${verb}: ${pendingNames.join(', ')}`;
  }
  if (state === 'skipped') return attack.area ? 'Nikt nie może odskoczyć' : 'Cel nie unika';
  if (attack.area) {
    const answers = attack.area.targets.flatMap((row) => (row.jump ? [row.jump] : []));
    return answers.length > 0
      ? answers.map((answer) => answerText(answer, rollTotal, verb)).join(' · ')
      : `${verb} rozstrzygnięty`;
  }
  if (attack.dodge) return answerText(attack.dodge, rollTotal, verb);
  // Karty sprzed 63c niosą Unik tylko słowami w `detail`, który stoi wyżej.
  if (attack.noEvade) return 'Bez uniku';
  return attack.hit ? 'Trafienie mimo uniku' : 'Unik udany';
}
