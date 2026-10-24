import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CombatantView } from '@vtt/shared';
import {
  COMBAT_INITIATIVE_MAX,
  COMBAT_INITIATIVE_MIN,
  ROLE_GM,
  cpredOutOfFight,
  cpredSheetInitiative,
  cpredTurnReminders,
  findInitiativeTies,
} from '@vtt/shared';
import {
  nextCombatTurn,
  previousCombatTurn,
  reorderCombat,
  rerollCombatTie,
  rollCombatInitiativeForAll,
  setCombatInitiative,
  startCombat,
} from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useCombatStore, activeCombatantOf } from '../stores/combatStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useDeathSaveAutoLoad, useDeathSavePrompt } from '../death-save.js';
import { usePortraitFrameStyle } from '../portrait-banner.js';
import { takeFigure } from '../hud.js';
import { askEndCombat } from '../foes-defeated.js';
import { BotTurnButton } from './BotTurnButton.js';
import { PlayerMoveSwitch } from './PlayerMoveSwitch.js';

/**
 * The turn tracker's always-visible face — a black strip over the map column,
 * shown only while turn mode is on.
 *
 * History: it floated over the map first, then moved into the red top bar
 * (01.08). On the owner's request (25.09) it left the bar again for a strip of
 * its own between the bar and the map — not over the map, the map column just
 * gets shorter. The red bar kept too little room for a portrait one can
 * recognise, and gold on red read poorly; black gives the queue the contrast
 * of the sheet's section belts. The strip spans the map only, so neither side
 * panel loses height.
 *
 * The division of labour with the left rail (stage 16f) is deliberate — nothing
 * appears in both places. The rail describes **one figure**: portrait, HP,
 * statuses, the turn budget, the weapons — and, since 25.09, the player's
 * „Kończę turę", which belongs beside the actions the turn is played with. The
 * strip owns **the queue**: the round, who is up, and stepping through it —
 * which works with nothing selected at all, so it cannot live in a panel that
 * follows the selection. The one thing kept here that is not the queue is the
 * death save, because it belongs to whoever the queue says is acting, not to
 * whoever the user happens to be looking at.
 *
 * Everything that needs more room — rolling, reordering, adding participants —
 * still lives in the „Walka" tab.
 */

/** Jak długo „Rozpocznij walkę” czeka na drugi klik po ostrzeżeniu. */
const START_ARM_MS = 6000;

/** The GM's one-click way into turn order when no fight is running. */
function TurnModeButton() {
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const tokens = useTokenStore((s) => s.tokens);
  const groupIds = useSelectionStore((s) => s.groupIds);
  const steered = useSelectionStore((s) => s.tokenId);
  const [busy, setBusy] = useState(false);

  // The players' figures, or — on a scene without any — everything standing on
  // it. Turn order is not only for fights: a chase or a heist needs the same
  // queue, and there the participants are as often the GM's own figures.
  // Od etapu 50a do drużyny dochodzi to, co MG ma zaznaczone (grupa albo jedna
  // figura) — wzór Foundry: zaznacz przeciwników, włącz starcie.
  const starters = useMemo(() => {
    const all = Object.values(tokens).filter((token) => token.container === undefined);
    const owned = all.filter((token) => token.ownerId !== null);
    const picked = (groupIds.length > 0 ? groupIds : steered ? [steered] : []).filter((id) =>
      all.some((token) => token.id === id),
    );
    const ids = [...new Set([...owned.map((token) => token.id), ...picked])];
    return ids.length > 0 ? ids : all.map((token) => token.id);
  }, [tokens, groupIds, steered]);
  const npcCount = starters.filter((id) => tokens[id]?.ownerId === null).length;

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
          : `Zakłada starcie „Przed walką” (${starters.length}: figury graczy${
              npcCount > 0 ? ` i ${npcCount} zaznaczonych NPC` : ''
            }). Przeciwników dołożysz przez „⚔ Do starcia” w menu figury albo zaznaczając ich przed kliknięciem.`
      }
      onClick={() => void begin()}
    >
      {busy ? 'Włączanie…' : 'Włącz tryb turowy'}
    </button>
  );
}

/**
 * What turn mode leaves in the red top bar: with no queue, the GM's button that
 * starts one; with a queue, nothing (the strip over the map took it). Beside
 * it, always, the GM's „Ruch graczy" switch (etap 45). The slot
 * itself stays either way — it is the flexible middle that keeps the right-hand
 * group at the right edge.
 */
export function TurnModeSlot() {
  const running = useCombatStore((s) => s.combat !== null);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  // „Ruch graczy" (etap 45) stoi obok zawsze, także w walce: Stop zatrzymuje
  // również uczestnika w jego turze.
  return (
    <div className="top-bar-turn">
      {isGm && <PlayerMoveSwitch />}
      {isGm && !running && <TurnModeButton />}
    </div>
  );
}

/**
 * Liczba inicjatywy na żetonie kolejki — i jedyne miejsce, w którym się ją
 * ustawia (etap 43a: zakładka „Walka" pokazuje już tylko portrety).
 *
 * MG klika i wpisuje; gracz klika swoją i ładuje kubek, jak dawniej 🎲 przy
 * wierszu. Cudzą liczbę gracz tylko czyta.
 */
function ChipInitiative({
  combatant,
  isGm,
  mayRoll,
}: {
  combatant: CombatantView;
  isGm: boolean;
  mayRoll: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = combatant.initiative ?? '—';

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === '') {
      void setCombatInitiative(combatant.id, null);
      return;
    }
    const value = Number.parseInt(trimmed, 10);
    if (Number.isNaN(value)) return;
    const clamped = Math.min(Math.max(value, COMBAT_INITIATIVE_MIN), COMBAT_INITIATIVE_MAX);
    void setCombatInitiative(combatant.id, clamped);
  }

  if (isGm && editing) {
    return (
      <input
        className="combat-chip-initiative-input"
        type="number"
        autoFocus
        aria-label={`Inicjatywa: ${combatant.name}`}
        // Select what is there: typing a new value must replace the old one,
        // not append to it (3 + „15" would land as 315, clamped to 99).
        onFocus={(e) => e.target.select()}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  if (isGm) {
    return (
      <button
        type="button"
        className="combat-chip-initiative combat-chip-initiative--button"
        onClick={() => {
          setDraft(combatant.initiative === null ? '' : String(combatant.initiative));
          setEditing(true);
        }}
        title="Kliknij, aby wpisać inicjatywę ręcznie"
        aria-label={`Wpisz inicjatywę: ${combatant.name}`}
      >
        {shown}
      </button>
    );
  }
  // Inicjatywę rzuca się raz na walkę (s. 168, jak w Foundry): po rzucie gracz
  // widzi już tylko liczbę — przerzut to decyzja MG.
  if (mayRoll && combatant.initiative === null) {
    return (
      <button
        type="button"
        className="combat-chip-initiative combat-chip-initiative--button combat-chip-initiative--roll"
        onClick={() =>
          useRollStore.getState().loadInitiativeCup({
            combatantId: combatant.id,
            name: combatant.name,
            modifierTotal: initiativeModifierOf(combatant),
          })
        }
        title="Rzuć inicjatywę — załaduj kubek i potrząśnij nim"
        aria-label={`Rzuć inicjatywę: ${combatant.name}`}
      >
        🎲
      </button>
    );
  }
  return <span className="combat-chip-initiative">{shown}</span>;
}

/**
 * Co serwer doda do 1k10 (#61, T8b) — z karty, którą gracz ma w ręku, tą samą
 * funkcją co `combat:roll`. Do 03.10 kubek brał `tieBreak`, którego przed
 * pierwszym rzutem nie ma, i pokazywał „Inicjatywa +0” przy rzucie za +8.
 * Figura bez karty rzuca gołe 1k10, więc zero jest wtedy prawdą.
 */
/**
 * Portret w pasie inicjatywy (etap 48a, zlecenie MG z 10.10): ten sam kadr co
 * baner lewej belki (`usePortraitFrameStyle`), tylko w kwadracie — przy tej
 * samej twarzy kwadrat pokazuje więcej dolnej części portretu niż baner 4:3.
 * Do 10.10 było tu `object-fit: cover` ze środka grafiki, więc pas pokazywał
 * pierś zamiast twarzy. Portret spoza puli zostaje przy `object-position`.
 */
function ChipPortrait({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const crop = usePortraitFrameStyle(imageUrl, 1);
  if (!imageUrl) {
    return (
      <span className="combat-chip-portrait combat-chip-portrait--empty">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }
  return (
    <span className="combat-chip-portrait">
      <img
        className={`combat-chip-portrait-img${crop ? ' combat-chip-portrait-img--cropped' : ''}`}
        src={imageUrl}
        alt=""
        draggable={false}
        {...(crop ? { style: crop } : {})}
      />
    </span>
  );
}

function initiativeModifierOf(combatant: CombatantView): number {
  const token = combatant.tokenId ? useTokenStore.getState().tokens[combatant.tokenId] : undefined;
  const characters = useCharacterStore.getState();
  const character = token?.characterId ? characters.characters[token.characterId] : undefined;
  if (!character) return 0;
  return cpredSheetInitiative(character.data, characters.registry).modifier;
}

export function CombatBar() {
  const combat = useCombatStore((s) => s.combat);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const [dragged, setDragged] = useState<string | null>(null);
  const tokens = useTokenStore((s) => s.tokens);
  // The dead leave the strip (17.10.2026, decyzja MG) — they play no more
  // turns, and the server's queue already steps over them. Read off the live
  // statuses where the figure is on hand, so a sticker set or lifted shows at
  // once; the server's flag covers the rest.
  const queue = useMemo(
    () =>
      combat?.combatants.filter((combatant) => {
        const token = combatant.tokenId ? tokens[combatant.tokenId] : undefined;
        return !(token ? cpredOutOfFight(token.statuses) : combatant.out);
      }) ?? [],
    [combat, tokens],
  );
  const ties = useMemo(() => findInitiativeTies(queue), [queue]);
  const tiedIds = useMemo(() => new Set(ties.flat().map((c) => c.id)), [ties]);
  const acting = useMemo(() => activeCombatantOf(combat), [combat]);
  // What the acting participant's own statuses want them to remember (stage
  // 14e). „Przygwożdżony" cannot be enforced — the map has no cover — so the
  // honest form of the rule is a sentence in front of the person it concerns.
  const reminders = useMemo(
    () => (acting?.tokenId ? cpredTurnReminders(tokens[acting.tokenId]?.statuses ?? []) : []),
    [acting, tokens],
  );
  // RAW: a Mortally Wounded character rolls at the start of each of their turns.
  const deathSave = useDeathSavePrompt();
  useDeathSaveAutoLoad(deathSave);

  // „Rozpocznij walkę” bez NPC-a w kolejce (etap 50a): pierwszy klik tylko
  // ostrzega, drugi zaczyna. Ostrzeżenie gaśnie samo po chwili i przy każdej
  // zmianie kolejki — dopisany NPC robi je nieaktualnym.
  const [startArmed, setStartArmed] = useState(false);
  useEffect(() => {
    if (!startArmed) return;
    const timer = window.setTimeout(() => setStartArmed(false), START_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [startArmed]);
  useEffect(() => setStartArmed(false), [combat]);

  // Gracz rzuca inicjatywę sam (22.10.2026, decyzja MG): figura dopisana do
  // starcia ładuje mu kubek, gdy ten jest pusty. Raz na uczestnika — `Esc`
  // odkłada rzut, a 🎲 na pasie dalej pulsuje i czeka.
  const cupEmpty = useRollStore(
    (s) =>
      !s.target &&
      !s.pending &&
      !s.initiative &&
      !s.attack &&
      !s.evasion &&
      !s.grapple &&
      !s.facedown &&
      !s.creation,
  );
  const offeredInitiative = useRef(new Set<string>());
  useEffect(() => {
    if (!combat || !user || isGm || !cupEmpty) return;
    const mine = combat.combatants.find(
      (c) =>
        c.tokenId !== null &&
        c.ownerId === user.id &&
        c.initiative === null &&
        !offeredInitiative.current.has(c.id),
    );
    if (!mine) return;
    offeredInitiative.current.add(mine.id);
    useRollStore.getState().loadInitiativeCup({
      combatantId: mine.id,
      name: mine.name,
      modifierTotal: initiativeModifierOf(mine),
    });
  }, [combat, user, isGm, cupEmpty]);

  const queueRef = useRef<HTMLOListElement | null>(null);
  const activeId = combat?.activeCombatantId ?? null;
  const combatantCount = queue.length;
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
    // Measured against the strip itself: `offsetLeft` counts from the nearest
    // positioned ancestor (the page), which pushed the first chip off the edge.
    const chipLeft =
      chip.getBoundingClientRect().left - queue.getBoundingClientRect().left + queue.scrollLeft;
    const centred = chipLeft - (queue.clientWidth - chip.offsetWidth) / 2;
    queue.scrollTo({ left: Math.max(0, centred), behavior: 'smooth' });
  }, [activeId, combat?.round]);

  /** A row this long is scrolled with the wheel one has, not the one one lacks. */
  const onWheel = useCallback((event: React.WheelEvent<HTMLOListElement>) => {
    const queue = event.currentTarget;
    if (event.deltaY === 0 || queue.scrollWidth <= queue.clientWidth) return;
    queue.scrollLeft += event.deltaY;
  }, []);

  function stopTurnMode() {
    askEndCombat('Wyłączyć tryb turowy?', 'Tak, wyłącz');
  }

  // No queue, no strip: the map gets its full height back.
  if (!combat) return null;

  // NPC to uczestnik bez właściciela (także Czarny LOD i bot MG).
  const hasNpc = queue.some((c) => c.ownerId === null);
  function beginFight() {
    if (!hasNpc && !startArmed) {
      setStartArmed(true);
      return;
    }
    setStartArmed(false);
    void nextCombatTurn();
  }

  /** Uczestnik bez figury (Czarny LOD, 26c) inicjatywy nie rzuca. */
  const mayRoll = (combatant: CombatantView): boolean =>
    combatant.tokenId !== null && user !== null && combatant.ownerId === user.id;
  // „Rzuć wszystkim" rzuca tylko za figury bez właściciela (22.10.2026) —
  // gracz rzuca swoją inicjatywę kubkiem.
  const unrolled = queue.some(
    (c) => c.tokenId !== null && c.ownerId === null && c.initiative === null,
  );

  function dropOn(targetId: string) {
    if (!isGm || !combat || dragged === null || dragged === targetId) return;
    const ids = combat.combatants.map((c) => c.id);
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(targetId);
    setDragged(null);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    void reorderCombat(ids);
  }

  // Participants before the running one have had their turn this round — they
  // fade, so „who is still to act" reads without counting. Round 0 has no such
  // thing, and neither does a queue whose runner is unknown.
  const activeIndex = queue.findIndex((combatant) => combatant.id === activeId);

  return (
    <div className="combat-bar" role="group" aria-label="Kolejka inicjatywy">
      <span className="combat-bar-round">
        {combat.round === 0 ? (
          <span className="combat-bar-round-label">Przed walką</span>
        ) : (
          <>
            <span className="combat-bar-round-label">Runda</span>
            <span className="combat-bar-round-number">{combat.round}</span>
          </>
        )}
      </span>
      {/* Etap 43a: narzędzia inicjatywy zeszły tu z zakładki „Walka". */}
      {isGm && unrolled && (
        <button
          type="button"
          className="combat-bar-roll"
          onClick={() => void rollCombatInitiativeForAll(false)}
          title="Rzuca inicjatywę NPC-om, które jeszcze jej nie mają — gracze rzucają kubkiem"
        >
          Rzuć wszystkim
        </button>
      )}
      {isGm && (
        <button
          type="button"
          className="combat-bar-step"
          onClick={() => void rollCombatInitiativeForAll(true)}
          title="Przerzuć inicjatywę NPC-om — także tym, które już ją mają (graczy nie rusza)"
          aria-label="Przerzuć inicjatywę NPC-om"
        >
          ⟳
        </button>
      )}
      {isGm && ties.length > 0 && (
        <button
          type="button"
          className="combat-bar-roll combat-bar-roll--tie"
          onClick={() => {
            for (const group of ties) void rerollCombatTie(group.map((c) => c.id));
          }}
          title={`Zasady: remis rozstrzyga się ponownym rzutem — ${ties
            .map((group) => `${group[0]?.initiative}: ${group.map((c) => c.name).join(', ')}`)
            .join(' · ')}`}
        >
          Remis
        </button>
      )}
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
        {queue.map((combatant, index) => {
          const isActive = combatant.id === activeId;
          // Etap 50b: w walce klik na mapie nie zaznacza innej figury, więc MG
          // bierze ją stąd — z kadrem kamery, bo z pasa nie widać, gdzie stoi.
          const takeable =
            isGm && combatant.tokenId !== null && tokens[combatant.tokenId] !== undefined;
          const done = combat.round > 0 && activeIndex >= 0 && index < activeIndex;
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
            tiedIds.has(combatant.id) ? 'remis' : null,
            held,
            grapple,
            takeable ? 'kliknij, żeby prowadzić tę figurę' : null,
            isGm ? 'przeciągnij, żeby zmienić kolejność' : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={combatant.id}
              data-active={isActive}
              className={`combat-chip${isActive ? ' combat-chip--active' : ''}${
                done ? ' combat-chip--done' : ''
              }${combatant.hidden ? ' combat-chip--hidden' : ''}${
                tiedIds.has(combatant.id) ? ' combat-chip--tie' : ''
              }${dragged === combatant.id ? ' combat-chip--dragged' : ''}${
                takeable ? ' combat-chip--takeable' : ''
              }`}
              title={label}
              onClick={(e) => {
                // Inicjatywa ma własny guzik i pole — klik w nie to nie wybór figury.
                if (!takeable || (e.target as HTMLElement).closest('button, input')) return;
                takeFigure(combatant.tokenId!, true);
              }}
              // Kolejność w remisie ustala MG przeciągnięciem (dawniej w
              // zakładce „Walka"); następny rzut inicjatywy porządkuje od nowa.
              draggable={isGm}
              onDragStart={() => setDragged(combatant.id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => {
                if (isGm && dragged !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(combatant.id);
              }}
            >
              <span className="combat-chip-figure">
                <ChipPortrait name={combatant.name} imageUrl={combatant.imageUrl} />
                {/* A held Action or a hold on somebody's throat changes what
                    the turn may do — small enough for a corner, too important
                    to leave to the tooltip. */}
                {(held || grapple) && (
                  <span className="combat-chip-badge">{combatant.held ? '⏸' : '🤼'}</span>
                )}
              </span>
              <span className="combat-chip-name">{combatant.name}</span>
              <ChipInitiative combatant={combatant} isGm={isGm} mayRoll={mayRoll(combatant)} />
            </li>
          );
        })}
      </ol>
      {/* Etap 50a: przed walką słowo zamiast ▶ — start to inny gest niż
          „następna tura”, a serwer rzuca wtedy inicjatywę NPC-om. */}
      {isGm && combat.round === 0 && (
        <button
          type="button"
          className={`combat-bar-begin${startArmed ? ' combat-bar-begin--armed' : ''}`}
          onClick={beginFight}
          title={
            hasNpc
              ? 'Zaczyna rundę 1. NPC-om bez inicjatywy rzuca ją serwer; gracze rzucają sami kubkiem.'
              : 'W kolejce nie ma żadnego NPC-a — dodaj ich przez „⚔ Do starcia” w menu figury albo zaznacz grupę.'
          }
        >
          {startArmed ? '⚠ Brak NPC-ów — zacznij mimo to' : '⚔ Rozpocznij walkę'}
        </button>
      )}
      {/* „Następna tura” MG mieszka od 16.10 na dole lewego panelu, obok
          „Kończę turę” gracza (`HudEndTurn`). */}
      {/* Etap 20b: przy figurze prowadzonej przez bota. */}
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
              ? `, +${deathSave.modifier} za poprzednie testy, trafienia i rany krytyczne`
              : ''
          }. Do rzutu Akcja i Ruch są zablokowane.`}
        >
          Test Przeżywalności
          {deathSave.modifier > 0 ? ` +${deathSave.modifier}` : ''}
        </button>
      )}
      {isGm && (
        <button
          type="button"
          className="combat-bar-stop"
          onClick={stopTurnMode}
          title="Wyłącz tryb turowy — kolejka inicjatywy zostanie skasowana"
          aria-label="Wyłącz tryb turowy"
        >
          ✕
        </button>
      )}
    </div>
  );
}
