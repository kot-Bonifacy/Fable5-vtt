import { useEffect, useMemo, useState } from 'react';
import type { CpredHotbarSlot } from '@vtt/shared';
import { CPRED_WOUND_LABELS, ROLE_GM, woundStateFromHp } from '@vtt/shared';
import { activateSlot, currentHudContext, hudSignature, type HudContext } from '../hud.js';
import { nextCombatTurn, previousCombatTurn } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { activeWeaponOf, useHudStore } from '../stores/hudStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { GrapplePanel, HoldActionForm, StabilizePicker } from './CombatForms.js';
import { TurnBudget } from './TurnBudget.js';

/**
 * The combat HUD (stage 16f) — a rail down the left edge of the table.
 *
 * It answers the two questions a turn is made of without opening anything:
 * **who am I** (portrait, HP, statuses, what is left of the turn) and **what can
 * I do** (weapons with their fire modes, a reload, the handful of catalogue
 * actions worth a key). Everything it offers already existed behind a panel;
 * this stage only stops the fight from being played through panels.
 *
 * Not a second rulebook. The slots come from `hotbarSlotsFor` in `shared` with
 * their refusals attached, the budget arrives from the server already computed,
 * and pressing a slot ends in an event that stage 14b, 14d or 16b already
 * defined. The three forms that need words or a target are the *same*
 * components the „Walka" tab renders.
 */

/** Statuses as their registry icons — the same glyphs the token wears. */
function StatusRow({ statuses }: { statuses: readonly string[] }) {
  const registry = useTokenStore((s) => s.statuses);
  const byId = useMemo(() => new Map(registry.map((row) => [row.id, row])), [registry]);
  if (statuses.length === 0) return null;
  return (
    <div className="hud-statuses">
      {statuses.map((id) => {
        const definition = byId.get(id);
        // The registry's `icon` is a *file* („/public/cpred/status-icons/…"),
        // not a glyph — the map draws it as a sprite, so the panel draws it as
        // an image. A status whose registry entry has not arrived yet still
        // gets a dot rather than vanishing.
        return (
          <span key={id} className="hud-status" title={definition?.name ?? id}>
            {definition ? <img src={definition.icon} alt={definition.name} /> : '•'}
          </span>
        );
      })}
    </div>
  );
}

/** „28 / 35" plus the bar, coloured by the wound state the rules name. */
function HealthBar({ hp }: { hp: { current: number; max: number } }) {
  const state = woundStateFromHp(hp.current, hp.max);
  const ratio = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  return (
    <div
      className={`hud-hp hud-hp--${state}`}
      title={`Punkty Wytrzymałości: ${hp.current}/${hp.max} · ${CPRED_WOUND_LABELS[state]}`}
    >
      <span className="hud-hp-track">
        <span className="hud-hp-fill" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="hud-hp-value">
        {hp.current} / {hp.max}
      </span>
    </div>
  );
}

/** One box on the bar. Its whole state — armed, refused, keyed — is in props. */
function HotbarSlot({
  slot,
  armed,
  onActivate,
}: {
  slot: CpredHotbarSlot;
  armed: boolean;
  onActivate: () => void;
}) {
  const ammo = slot.kind === 'action' ? null : slot.ammo;
  return (
    <button
      type="button"
      className={`hud-slot${armed ? ' hud-slot--armed' : ''}${
        slot.disabled ? ' hud-slot--refused' : ''
      }`}
      // The refusal is the tooltip when there is one: „why is this grey" has to
      // be answerable without asking the GM.
      title={
        slot.disabled
          ? `${slot.label} — ${slot.disabled}`
          : `${slot.hint}${slot.key ? ` (${slot.key})` : ''}`
      }
      onClick={onActivate}
    >
      {slot.key && <span className="hud-slot-key">{slot.key}</span>}
      <span className="hud-slot-label">{slot.label}</span>
      {slot.kind === 'weapon' && slot.modeLabel && (
        <span className="hud-slot-mode">{slot.modeLabel}</span>
      )}
      {ammo && (
        <span className="hud-slot-ammo">
          {ammo.current}/{ammo.max}
        </span>
      )}
    </button>
  );
}

/**
 * Keeps a fresh `HudContext` without re-rendering on every frame of a march.
 *
 * The stores it watches change at pointer rate; what the panel *shows* changes
 * a few times a turn. `hudSignature` is the difference between the two.
 */
function useHudContext(): HudContext {
  const [context, setContext] = useState<HudContext>(() => currentHudContext());

  useEffect(() => {
    let last = hudSignature(context);
    const refresh = () => {
      const next = currentHudContext();
      const signature = hudSignature(next);
      if (signature === last) return;
      last = signature;
      setContext(next);
    };
    refresh();
    const unsubs = [
      useSelectionStore.subscribe(refresh),
      useTokenStore.subscribe(refresh),
      useCombatStore.subscribe(refresh),
      useCharacterStore.subscribe(refresh),
      useCompendiumStore.subscribe(refresh),
      useAuthStore.subscribe(refresh),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
    // Mount-only on purpose: the closure reads the stores directly, so nothing
    // it needs can go stale, and re-subscribing on every render would undo the
    // whole point of comparing signatures.
  }, []);

  return context;
}

export function CombatHud() {
  const context = useHudContext();
  const selectedId = useSelectionStore((s) => s.tokenId);
  const activeWeapon = useHudStore((s) => s.activeWeapon);
  const form = useHudStore((s) => s.form);
  const collapsed = useHudStore((s) => s.collapsed);
  const setCollapsed = useHudStore((s) => s.setCollapsed);
  const setForm = useHudStore((s) => s.setForm);
  const combat = useCombatStore((s) => s.combat);
  const cupBusy = useRollStore((s) => s.pending !== null);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);

  const token = context.token;
  const armed = activeWeaponOf(activeWeapon, token?.id ?? null);

  /**
   * A freshly selected figure comes with its first weapon in hand.
   *
   * That is what makes a click on an enemy mean something without a mode: in
   * the games this HUD is modelled on you do not „equip" before shooting, you
   * click. Only the first *usable* weapon is taken — arming an empty magazine
   * would put a crosshair on a gun that cannot fire.
   */
  useEffect(() => {
    const state = useHudStore.getState();
    if (!token) {
      if (state.activeWeapon) state.setActiveWeapon(null);
      return;
    }
    if (state.activeWeapon?.tokenId === token.id) return;
    const slot = context.slots.find((entry) => entry.kind === 'weapon' && !entry.disabled);
    if (!slot || slot.kind !== 'weapon') {
      state.setActiveWeapon(null);
      return;
    }
    state.setActiveWeapon({
      tokenId: token.id,
      slotId: slot.id,
      weaponRowId: slot.weaponRowId,
      mode: slot.mode,
      name: slot.modeLabel ? `${slot.label} — ${slot.modeLabel}` : slot.label,
      melee: slot.melee,
    });
  }, [token, context.slots]);

  // A form belongs to the figure it was opened for; switching figures closes it.
  useEffect(() => {
    useHudStore.getState().setForm(null);
  }, [selectedId]);

  if (collapsed) {
    return (
      <aside className="hud-rail hud-rail--collapsed">
        <button
          type="button"
          className="hud-collapse"
          title="Pokaż panel postaci i pasek akcji"
          aria-label="Pokaż panel postaci"
          onClick={() => setCollapsed(false)}
        >
          ▸
        </button>
      </aside>
    );
  }

  return (
    <aside className="hud-rail" aria-label="Panel aktywnej postaci">
      <div className="hud-head">
        <span className="hud-head-title">{token ? token.name : 'Nikt nie wybrany'}</span>
        <button
          type="button"
          className="hud-collapse"
          title="Zwiń panel"
          aria-label="Zwiń panel"
          onClick={() => setCollapsed(true)}
        >
          ◂
        </button>
      </div>

      {!token && (
        <p className="hud-empty">
          Kliknij token, którym chcesz sterować. Potem klikaj podłoże, żeby iść, i przeciwnika, żeby
          wycelować.
        </p>
      )}

      {token && (
        <>
          <div className="hud-identity">
            {token.imageUrl ? (
              <img className="hud-portrait" src={token.imageUrl} alt="" />
            ) : (
              <span className="hud-portrait hud-portrait--empty">
                {token.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            <div className="hud-identity-body">
              {/* HP is redacted by the server (stage 05): a token whose points
                  this viewer may not see arrives without them, so „no bar" is
                  the honest rendering rather than a hidden one. */}
              {token.hp ? (
                <HealthBar hp={token.hp} />
              ) : (
                <span className="hud-hp-none">PW ukryte</span>
              )}
              <StatusRow statuses={token.statuses} />
            </div>
          </div>

          {context.turn && <TurnBudget budget={context.turn} />}
          {context.refusal && <p className="hud-refusal">{context.refusal}</p>}

          {combat && context.combatant && (
            <div className="hud-turn-buttons">
              {(isGm || context.isActiveTurn) && (
                <button
                  type="button"
                  className="small-button"
                  title="Kończy turę i przesuwa kolejkę inicjatywy (E)"
                  onClick={() => void nextCombatTurn()}
                >
                  Koniec tury
                </button>
              )}
              {isGm && (
                <button
                  type="button"
                  className="small-button"
                  title="Cofa kolejkę o jedną turę"
                  onClick={() => void previousCombatTurn()}
                >
                  Zwróć turę
                </button>
              )}
            </div>
          )}

          <div className="hud-slots">
            {context.slots.length === 0 && (
              <p className="hud-empty">
                Ten token nie ma broni ani profilu bojowego — podłącz kartę postaci albo uzupełnij
                profil w „Edytuj…”.
              </p>
            )}
            {context.slots.map((slot) => (
              <HotbarSlot
                key={slot.id}
                slot={slot}
                armed={armed?.slotId === slot.id}
                onActivate={() => activateSlot(slot, token.id)}
              />
            ))}
          </div>

          {armed && (
            <p className="hud-armed">
              W ręku: <strong>{armed.name}</strong> — kliknij cel na mapie.
              {isGm && <span className="hud-armed-hint"> Alt+klik celuje we własny token.</span>}
            </p>
          )}

          {form && combat && context.combatant && (
            <div className="hud-form">
              {form === 'hold' && (
                <HoldActionForm combatantId={context.combatant.id} onDone={() => setForm(null)} />
              )}
              {form === 'stabilize' && (
                <StabilizePicker
                  combat={combat}
                  combatant={context.combatant}
                  onDone={() => setForm(null)}
                />
              )}
              {form === 'grapple' && (
                <GrapplePanel
                  combat={combat}
                  combatant={context.combatant}
                  cupBusy={cupBusy}
                  startOpen
                  onDone={() => setForm(null)}
                />
              )}
            </div>
          )}
          {form && !context.combatant && (
            <p className="hud-refusal">
              Ta akcja wymaga trwającej walki — dodaj token do kolejki inicjatywy.
            </p>
          )}

          <p className="hud-keys">
            <kbd>1</kbd>–<kbd>9</kbd> sloty · <kbd>Tab</kbd> następna postać · <kbd>E</kbd> koniec
            tury · <kbd>Esc</kbd> cofa
          </p>
        </>
      )}
    </aside>
  );
}
