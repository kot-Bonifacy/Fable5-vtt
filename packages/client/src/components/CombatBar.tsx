import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_GM, cpredTurnReminders } from '@vtt/shared';
import { endCombat, nextCombatTurn, previousCombatTurn, startCombat } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCombatStore, activeCombatantOf, myActiveCombatant } from '../stores/combatStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useDeathSavePrompt } from '../death-save.js';
import { BotTurnButton } from './BotTurnButton.js';

/**
 * The turn tracker's always-visible face — a fixed strip in the top bar,
 * between the title and the session name.
 *
 * It used to float over the map and could be dragged anywhere; the map is the
 * table, and nothing that belongs to the interface should sit on top of it.
 * Up here the queue also gets the one thing it could never have over the map:
 * a row as wide as the window.
 *
 * The division of labour with the left rail (stage 16f) is deliberate — nothing
 * appears in both places. The rail describes **one figure**: portrait, HP,
 * statuses, the turn budget, the weapons. The bar owns **the queue**: the round,
 * who is up, and stepping through it — which works with nothing selected at all,
 * so it cannot live in a panel that follows the selection. The one thing kept
 * here that is not the queue is the death save, because it belongs to whoever
 * the queue says is acting, not to whoever the user happens to be looking at.
 *
 * Everything that needs more room — rolling, reordering, adding participants —
 * still lives in the „Walka" tab.
 */

/** The GM's one-click way into turn order when no fight is running. */
function TurnModeButton() {
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const tokens = useTokenStore((s) => s.tokens);
  const [busy, setBusy] = useState(false);

  // The players' figures, or — on a scene without any — everything standing on
  // it. Turn order is not only for fights: a chase or a heist needs the same
  // queue, and there the participants are as often the GM's own figures.
  const starters = useMemo(() => {
    const all = Object.values(tokens);
    const owned = all.filter((token) => token.ownerId !== null);
    return (owned.length > 0 ? owned : all).map((token) => token.id);
  }, [tokens]);

  async function begin() {
    if (!sceneId || starters.length === 0) return;
    setBusy(true);
    await startCombat(sceneId, starters);
    setBusy(false);
  }

  return (
    <button
      type="button"
      className="combat-bar-start"
      disabled={busy || !sceneId || starters.length === 0}
      title={
        starters.length === 0
          ? 'Na scenie nie ma tokenów, które mogłyby wejść do kolejki'
          : `Zakłada kolejkę inicjatywy (${starters.length}). Kolejnych uczestników dodasz w zakładce „Walka" albo z menu tokenu.`
      }
      onClick={() => void begin()}
    >
      {busy ? 'Włączanie…' : 'Włącz tryb turowy'}
    </button>
  );
}

export function CombatBar() {
  const combat = useCombatStore((s) => s.combat);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const myTurn = useMemo(() => myActiveCombatant(combat, user?.id ?? null), [combat, user?.id]);
  const acting = useMemo(() => activeCombatantOf(combat), [combat]);
  const tokens = useTokenStore((s) => s.tokens);
  // What the acting participant's own statuses want them to remember (stage
  // 14e). „Przygwożdżony" cannot be enforced — the map has no cover — so the
  // honest form of the rule is a sentence in front of the person it concerns.
  const reminders = useMemo(
    () => (acting ? cpredTurnReminders(tokens[acting.tokenId]?.statuses ?? []) : []),
    [acting, tokens],
  );
  // RAW: a Mortally Wounded character rolls at the start of each of their turns.
  const deathSave = useDeathSavePrompt();

  const queueRef = useRef<HTMLOListElement | null>(null);
  const activeId = combat?.activeCombatantId ?? null;
  const combatantCount = combat?.combatants.length ?? 0;
  const [scrollable, setScrollable] = useState(false);

  // Whether the row runs past the bar — the faded edges say so, and they would
  // be a lie on a queue of four. Re-measured when the queue changes, when the
  // named chip moves, and when the window resizes.
  useEffect(() => {
    const measure = () => {
      const queue = queueRef.current;
      setScrollable(queue ? queue.scrollWidth > queue.clientWidth + 1 : false);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [combatantCount, activeId]);

  /**
   * Keeps whoever is up inside the visible run of the queue.
   *
   * With fifteen participants the strip scrolls, and a turn passing to somebody
   * off-screen would look like nothing happened at all. Scrolling the row by
   * hand rather than through `scrollIntoView`: the latter would be free to move
   * the whole page to get there.
   */
  useEffect(() => {
    const queue = queueRef.current;
    if (!queue || !activeId) return;
    const chip = queue.querySelector<HTMLElement>('[data-active="true"]');
    if (!chip) return;
    const centred = chip.offsetLeft - (queue.clientWidth - chip.offsetWidth) / 2;
    queue.scrollTo({ left: Math.max(0, centred), behavior: 'smooth' });
  }, [activeId, combat?.round]);

  /** A row this long is scrolled with the wheel one has, not the one one lacks. */
  const onWheel = useCallback((event: React.WheelEvent<HTMLOListElement>) => {
    const queue = event.currentTarget;
    if (event.deltaY === 0 || queue.scrollWidth <= queue.clientWidth) return;
    queue.scrollLeft += event.deltaY;
  }, []);

  async function stopTurnMode() {
    if (!window.confirm('Wyłączyć tryb turowy? Kolejka inicjatywy zostanie skasowana.')) return;
    await endCombat();
  }

  if (!combat) {
    // Players see nothing: an empty top bar is the honest picture of „no queue".
    return <div className="combat-bar combat-bar--idle">{isGm && <TurnModeButton />}</div>;
  }

  return (
    <div className="combat-bar" role="group" aria-label="Kolejka inicjatywy">
      <span className="combat-bar-round">
        {combat.round === 0 ? 'PRZED WALKĄ' : `RUNDA ${combat.round}`}
      </span>
      {isGm && (
        <button
          type="button"
          className="combat-bar-step"
          onClick={() => void previousCombatTurn()}
          title="Poprzednia tura"
          aria-label="Poprzednia tura"
        >
          ◀
        </button>
      )}
      <ol
        className={`combat-bar-queue${scrollable ? ' combat-bar-queue--scrollable' : ''}`}
        ref={queueRef}
        onWheel={onWheel}
      >
        {combat.combatants.map((combatant) => {
          const isActive = combatant.id === activeId;
          const held = combatant.held ? 'Akcja wstrzymana' : null;
          const grapple = combatant.grapple
            ? combatant.grapple.role === 'attacker'
              ? `Trzyma: ${combatant.grapple.otherName} (−2 do Akcji)`
              : `W Trzymaniu: ${combatant.grapple.otherName} (−2 do Akcji, bez Akcji Ruchu)`
            : null;
          // Everything a row cannot hold — the tie-break, a held Action, a
          // grapple — is one hover away.
          const label = [
            `${combatant.name} — inicjatywa ${combatant.initiative ?? '—'}`,
            combatant.tieBreak !== null ? `(REF ${combatant.tieBreak})` : null,
            held,
            grapple,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={combatant.id}
              data-active={isActive}
              className={`combat-chip${isActive ? ' combat-chip--active' : ''}${
                combatant.hidden ? ' combat-chip--hidden' : ''
              }`}
              title={label}
            >
              <span className="combat-chip-figure">
                {combatant.imageUrl ? (
                  <img className="combat-chip-portrait" src={combatant.imageUrl} alt="" />
                ) : (
                  <span className="combat-chip-portrait combat-chip-portrait--empty">
                    {combatant.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                {/* A held Action or a hold on somebody's throat changes what
                    the turn may do — small enough for a corner, too important
                    to leave to the tooltip. */}
                {(held || grapple) && (
                  <span className="combat-chip-badge">{combatant.held ? '⏸' : '🤼'}</span>
                )}
              </span>
              <span className="combat-chip-name">{combatant.name}</span>
              <span className="combat-chip-initiative">{combatant.initiative ?? '—'}</span>
            </li>
          );
        })}
      </ol>
      {isGm && (
        <button
          type="button"
          className="combat-bar-step"
          onClick={() => void nextCombatTurn()}
          title={combat.round === 0 ? 'Rozpocznij rundę 1' : 'Następna tura'}
          aria-label="Następna tura"
        >
          ▶
        </button>
      )}
      {/* Etap 20b: przy figurze prowadzonej przez bota. Stoi obok ▶, bo należy
          do tego samego gestu — „ta tura jest rozegrana, idziemy dalej". */}
      <BotTurnButton tokenId={acting?.tokenId ?? null} className="combat-bar-bot" />
      {reminders.length > 0 && (
        <span className="combat-bar-reminder" title={reminders.join(' · ')}>
          ⚠ {reminders[0]}
        </span>
      )}
      {deathSave && (
        <button
          type="button"
          className="combat-bar-death-save"
          onClick={deathSave.roll}
          title={`${deathSave.characterName} jest śmiertelnie ranny — rzut 1k10 pod BC${
            deathSave.modifier > 0
              ? `, +${deathSave.modifier} za poprzednie testy i rany krytyczne`
              : ''
          }`}
        >
          Test Przeżywalności
          {deathSave.modifier > 0 ? ` +${deathSave.modifier}` : ''}
        </button>
      )}
      {/* The acting player ends their own turn; the server re-checks whose it is. */}
      {!isGm && myTurn && (
        <button type="button" className="combat-bar-end-turn" onClick={() => void nextCombatTurn()}>
          Kończę turę
        </button>
      )}
      {isGm && (
        <button
          type="button"
          className="combat-bar-stop"
          onClick={() => void stopTurnMode()}
          title="Wyłącz tryb turowy — kolejka inicjatywy zostanie skasowana"
          aria-label="Wyłącz tryb turowy"
        >
          ✕
        </button>
      )}
    </div>
  );
}
