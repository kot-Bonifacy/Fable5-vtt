import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CpredAttackMode,
  CpredHotbarSlot,
  CpredHotbarWeaponGroup,
  CpredHotbarWeaponSlot,
} from '@vtt/shared';
import {
  CPRED_ATTACK_MODE_LABELS,
  CPRED_BURST_AMMO_COST,
  CPRED_WOUND_LABELS,
  ROLE_GM,
  cpredStatusSeverity,
  cpredWeaponModeSlot,
  woundStateFromHp,
} from '@vtt/shared';
import {
  activateGroup,
  activateSlot,
  currentHudContext,
  hudSignature,
  type HudContext,
  type HudVitals,
} from '../hud.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { activeWeaponOf, fireModeKey, useHudStore } from '../stores/hudStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { CombatAwarenessPanel } from './CombatAwarenessPanel.js';
import { BackupPanel } from './BackupPanel.js';
import { GrapplePanel, HoldActionForm, StabilizePicker } from './CombatForms.js';
import { HudIcon } from './HudIcon.js';
import { TurnBudget } from './TurnBudget.js';

/**
 * The combat HUD (stage 16f) — a rail down the left edge of the table.
 *
 * It answers the two questions a turn is made of without opening anything:
 * **who am I** (portrait, HP, armour, statuses, what is left of the turn) and
 * **what can I do** (weapons with their fire modes, a reload, the handful of
 * catalogue actions worth a key). Everything it offers already existed behind a
 * panel; that stage only stopped the fight from being played through panels.
 *
 * Stage 27h gave it a face. Until then it was nine identical boxes with words
 * in them — a weapon, a reload and an Action were the same rectangle, the
 * magazine was a fraction to be read, and nothing on screen moved when the
 * figure lost hit points. Now the shape of a slot says what kind of thing it is
 * (`CpredSlotIcon` from `shared`), the magazine is a gauge, and damage arrives
 * as a number that flies off the bar.
 *
 * Not a second rulebook. The slots come from `hotbarSlotsFor` in `shared` with
 * their refusals attached, the budget arrives from the server already computed,
 * and pressing a slot ends in an event that stage 14b, 14d or 16b already
 * defined. The three forms that need words or a target are the *same*
 * components the „Walka" tab renders.
 */

/** Statuses as chips: the registry's glyph plus the name it prints. */
function StatusChips({ statuses }: { statuses: readonly string[] }) {
  const registry = useTokenStore((s) => s.statuses);
  const byId = useMemo(() => new Map(registry.map((row) => [row.id, row])), [registry]);
  if (statuses.length === 0) return null;
  return (
    <ul className="hud-statuses">
      {statuses.map((id) => {
        const definition = byId.get(id);
        // The registry's `icon` is a *file* („/public/cpred/status-icons/…"),
        // not a glyph — the map draws it as a sprite, so the panel draws it as
        // an image. A status whose registry entry has not arrived yet still
        // gets its id rather than vanishing.
        return (
          <li key={id} className={`hud-status hud-status--${cpredStatusSeverity(id)}`}>
            {definition && <img src={definition.icon} alt="" />}
            <span>{definition?.name ?? id}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * „28 / 35" plus the bar, coloured by the wound state the rules name.
 *
 * Two things were added in 27h, and both exist to make a hit *visible*. The
 * notch is the Seriously Wounded threshold — half the maximum, rounded up
 * (`seriousWoundThreshold`), computed here from the maximum alone because that
 * is all a token carries; crossing it is the moment every check turns −2.
 * The number that flies off is the change itself: at the table the bar moving
 * by four pixels is not something anybody notices in the middle of a turn.
 */
function HealthBar({ hp }: { hp: { current: number; max: number } }) {
  const state = woundStateFromHp(hp.current, hp.max);
  const ratio = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  const threshold = hp.max > 0 ? Math.ceil(hp.max / 2) / hp.max : 0;
  const [delta, setDelta] = useState<{ value: number; id: number } | null>(null);
  const previous = useRef(hp.current);

  useEffect(() => {
    const change = hp.current - previous.current;
    previous.current = hp.current;
    if (change === 0) return;
    // Keyed by a counter rather than by the value: two hits for the same six
    // points in a row have to restart the animation, and an identical key
    // would leave the first number hanging where it was.
    const id = Date.now();
    setDelta({ value: change, id });
    const timer = window.setTimeout(() => {
      setDelta((current) => (current?.id === id ? null : current));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [hp.current]);

  return (
    <div
      className={`hud-hp hud-hp--${state}`}
      title={`Punkty Wytrzymałości: ${hp.current}/${hp.max} · ${CPRED_WOUND_LABELS[state]}`}
    >
      <span className="hud-hp-track">
        <span className="hud-hp-fill" style={{ width: `${ratio * 100}%` }} />
        {/* The rung stage 15 judges on, drawn where it actually falls. */}
        <span className="hud-hp-notch" style={{ left: `${threshold * 100}%` }} />
      </span>
      <span className="hud-hp-value">
        {hp.current}
        <span className="hud-hp-max">/{hp.max}</span>
      </span>
      {delta && (
        <span
          key={delta.id}
          className={`hud-hp-delta${delta.value > 0 ? ' hud-hp-delta--heal' : ''}`}
          aria-live="polite"
        >
          {delta.value > 0 ? `+${delta.value}` : delta.value}
        </span>
      )}
    </div>
  );
}

/** Rounds left, as something to glance at rather than to read. */
const MAGAZINE_PIP_LIMIT = 12;

function Magazine({ ammo }: { ammo: { current: number; max: number } }) {
  const ratio = ammo.max > 0 ? Math.max(0, Math.min(1, ammo.current / ammo.max)) : 0;
  // „Empty" and „nearly empty" are the two states worth a colour: the first is
  // a refusal waiting to happen, the second is the reason to reload *now*.
  const level = ammo.current === 0 ? 'empty' : ratio <= 0.25 ? 'low' : 'ok';
  return (
    <span className={`hud-mag hud-mag--${level}`} title={`Magazynek: ${ammo.current}/${ammo.max}`}>
      {/* A pistol's twelve rounds are countable; a rifle's thirty are not, and
          thirty dots two pixels apart would be a texture rather than a number. */}
      {ammo.max <= MAGAZINE_PIP_LIMIT ? (
        <span className="hud-mag-pips" aria-hidden>
          {Array.from({ length: ammo.max }, (_, index) => (
            <span
              key={index}
              className={`hud-mag-pip${index < ammo.current ? ' hud-mag-pip--live' : ''}`}
            />
          ))}
        </span>
      ) : (
        <span className="hud-mag-bar" aria-hidden>
          <span className="hud-mag-bar-fill" style={{ width: `${ratio * 100}%` }} />
        </span>
      )}
      <span className="hud-mag-count">
        {ammo.current}
        <span className="hud-mag-max">/{ammo.max}</span>
      </span>
    </span>
  );
}

/**
 * One box on the bar — a weapon in the mode it is set to, a reload, or an
 * Action. Its whole state (armed, refused, keyed) is in props.
 *
 * A weapon that offers more than a plain shot grows a second button: the arrow
 * opens the drawer of its fire modes. Two buttons rather than one, because a
 * button inside a button is not HTML — the shared frame is drawn by the row
 * around them, so it still reads as a single tile.
 */
function HotbarSlot({
  slot,
  keyLabel,
  armed,
  modeCount,
  drawerOpen,
  onActivate,
  onToggleDrawer,
}: {
  slot: CpredHotbarSlot;
  keyLabel: string | null;
  armed: boolean;
  modeCount: number;
  drawerOpen: boolean;
  onActivate: () => void;
  onToggleDrawer?: () => void;
}) {
  const ammo = slot.kind === 'action' ? null : slot.ammo;
  const hasDrawer = modeCount > 1 && onToggleDrawer !== undefined;
  return (
    <div
      className={`hud-slot-row hud-slot--${slot.kind}${armed ? ' hud-slot--armed' : ''}${
        slot.disabled ? ' hud-slot--refused' : ''
      }`}
    >
      <button
        type="button"
        className="hud-slot"
        // The refusal is the tooltip when there is one: „why is this grey" has
        // to be answerable without asking the GM.
        title={
          slot.disabled
            ? `${slot.label} — ${slot.disabled}`
            : `${slot.hint}${keyLabel ? ` (${keyLabel})` : ''}`
        }
        onClick={onActivate}
      >
        <HudIcon name={slot.icon} className="hud-slot-icon" />
        <span className="hud-slot-body">
          <span className="hud-slot-line">
            <span className="hud-slot-label">{slot.label}</span>
            {/* What is loaded (stage 16g): „Strzelba · Śrut" is a different
                attack from „Strzelba · Zapalająca", and the slot has to say
                which. The *mode* moved down to the magazine line in 27h — it
                changes several times a fight, the round almost never does. */}
            {slot.kind === 'weapon' && slot.ammoLabel && (
              <span className="hud-chip hud-chip--ammo">{slot.ammoLabel}</span>
            )}
          </span>
          <span className="hud-slot-line hud-slot-line--sub">
            {ammo && <Magazine ammo={ammo} />}
            {/* Only a weapon with a choice says which choice is live: on a
                pistol „pojedynczy" is not information, it is noise. */}
            {hasDrawer && (
              <span className="hud-slot-mode">
                {slot.kind === 'weapon' ? (slot.modeLabel ?? 'pojedynczy') : ''}
              </span>
            )}
          </span>
        </span>
        {keyLabel && <span className="hud-slot-key">{keyLabel}</span>}
      </button>
      {hasDrawer && (
        <button
          type="button"
          className={`hud-slot-drawer${drawerOpen ? ' hud-slot-drawer--open' : ''}`}
          title={`Tryb ognia${keyLabel ? ` (Shift+${keyLabel})` : ''}`}
          aria-label="Tryb ognia"
          aria-expanded={drawerOpen}
          onClick={onToggleDrawer}
        >
          ▾
        </button>
      )}
    </div>
  );
}

/**
 * The fire modes of one weapon, opened under its tile (the shape Argon's HUD
 * uses for variants of one item).
 *
 * Full names here, not the chips from the tile: this is the place where the
 * choice is *made*, and „Ogień zaporowy" is what the rulebook calls it. The
 * price in rounds is spelled out for the same reason — ten of them is the whole
 * reason a burst is a decision rather than a default.
 */
function ModeDrawer({
  group,
  current,
  onPick,
}: {
  group: CpredHotbarWeaponGroup;
  current: CpredAttackMode;
  onPick: (slot: CpredHotbarWeaponSlot) => void;
}) {
  return (
    <ul className="hud-modes">
      {group.modes.map((slot) => (
        <li key={slot.id}>
          <button
            type="button"
            className={`hud-mode${slot.mode === current ? ' hud-mode--current' : ''}${
              slot.disabled ? ' hud-mode--refused' : ''
            }`}
            title={slot.disabled ?? slot.hint}
            aria-current={slot.mode === current}
            onClick={() => onPick(slot)}
          >
            <span className="hud-mode-name">{CPRED_ATTACK_MODE_LABELS[slot.mode]}</span>
            {slot.mode !== 'single' && (
              <span className="hud-mode-cost">{CPRED_BURST_AMMO_COST} naboi</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Portrait, name, role and the three numbers a fight is fought with. */
function IdentityCard({
  name,
  imageUrl,
  hp,
  vitals,
}: {
  name: string;
  imageUrl: string | null;
  hp: { current: number; max: number } | null | undefined;
  vitals: HudVitals | null;
}) {
  return (
    <div className="hud-card">
      <span className="hud-portrait-frame">
        {imageUrl ? (
          <img className="hud-portrait" src={imageUrl} alt="" />
        ) : (
          <span className="hud-portrait hud-portrait--empty">
            {name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
      </span>
      <div className="hud-card-body">
        <span className="hud-card-name" title={name}>
          {name}
        </span>
        {vitals?.roleName && <span className="hud-card-role">{vitals.roleName}</span>}
        {/* HP is redacted by the server (stage 05): a token whose points this
            viewer may not see arrives without them, so „no bar" is the honest
            rendering rather than a hidden one. */}
        {hp ? <HealthBar hp={hp} /> : <span className="hud-hp-none">PW ukryte</span>}
        {vitals && <Vitals vitals={vitals} />}
      </div>
    </div>
  );
}

/** SP · RUCH · EMP — the numbers that decide a fight and never used to show. */
function Vitals({ vitals }: { vitals: HudVitals }) {
  const armor = vitals.armor;
  return (
    <div className="hud-vitals">
      {armor && (
        <span
          className="hud-vital"
          title={`Pancerz: korpus ${armor.body} SP, głowa ${armor.head} SP`}
        >
          <HudIcon name="armor" />
          <span className="hud-vital-value">
            {armor.body === armor.head ? armor.body : `${armor.body}/${armor.head}`}
          </span>
        </span>
      )}
      {vitals.move && (
        <span
          className="hud-vital"
          title={
            vitals.move.note
              ? `RUCH ${vitals.move.points} — ${vitals.move.metres} m na Akcję Ruchu (${vitals.move.note})`
              : `RUCH ${vitals.move.points} — ${vitals.move.metres} m na Akcję Ruchu`
          }
        >
          <HudIcon name="move" />
          <span className="hud-vital-value">{vitals.move.points}</span>
          {vitals.move.note && <span className="hud-vital-flag">!</span>}
        </span>
      )}
      {vitals.emp && (
        <span
          className="hud-vital"
          title={`EMP z bieżącego Człowieczeństwa: ${vitals.emp.current} (maksimum ${vitals.emp.max})`}
        >
          <HudIcon name="emp" />
          <span className="hud-vital-value">{vitals.emp.current}</span>
        </span>
      )}
    </div>
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
  const focusId = context.token?.id ?? null;
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
  const fireModes = useHudStore((s) => s.fireModes);
  const setFireMode = useHudStore((s) => s.setFireMode);
  // Which weapon has its fire modes open; one at a time, and never across a
  // change of figure.
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const weapons = context.groups.filter((group) => group.kind === 'weapon');
  // A reload is not a weapon: it is an Action that happens to name one, and
  // leaving it among the guns is what made a character with a single pistol
  // look like a character with an arsenal.
  const actions = context.groups.filter((group) => group.kind !== 'weapon');

  /**
   * A freshly selected figure comes with its first weapon in hand.
   *
   * That is what makes a click on an enemy mean something without a mode: in
   * the games this HUD is modelled on you do not „equip" before shooting, you
   * click. Only the first *usable* weapon is taken — arming an empty magazine
   * would put a crosshair on a gun that cannot fire.
   *
   * Steering is the condition, not merely being on screen: the rail describes a
   * figure by default, and a panel that raised a gun the moment it opened would
   * turn „look at my character" into „aim at whatever I click next".
   */
  useEffect(() => {
    const state = useHudStore.getState();
    if (!token || !context.steering) {
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
      pointTarget: slot.pointTarget,
      ...(slot.coneRangeM !== null ? { coneRangeM: slot.coneRangeM } : {}),
    });
  }, [token, context.steering, context.slots]);

  // A form belongs to the figure it was opened for; switching figures closes it,
  // and so does an open drawer of fire modes.
  useEffect(() => {
    useHudStore.getState().setForm(null);
    setOpenDrawer(null);
  }, [focusId]);

  // Collapsed is a strip, not a hole: the portrait and a sliver of the health
  // bar survive, because „I do not know how hurt I am" is not a saving of space
  // anybody asked for.
  if (collapsed) {
    return (
      <aside
        className="hud-rail hud-rail--collapsed"
        aria-label="Panel aktywnej postaci (zwinięty)"
      >
        <button
          type="button"
          className="hud-collapse"
          title="Pokaż panel postaci i pasek akcji"
          aria-label="Pokaż panel postaci"
          onClick={() => setCollapsed(false)}
        >
          ▸
        </button>
        {token && (
          <span className="hud-collapsed-figure" title={token.name}>
            {token.imageUrl ? (
              <img className="hud-portrait" src={token.imageUrl} alt="" />
            ) : (
              <span className="hud-portrait hud-portrait--empty">
                {token.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            {token.hp && (
              <span
                className={`hud-collapsed-hp hud-hp--${woundStateFromHp(token.hp.current, token.hp.max)}`}
                title={`Punkty Wytrzymałości: ${token.hp.current}/${token.hp.max}`}
              >
                <span
                  className="hud-collapsed-hp-fill"
                  style={{
                    height: `${
                      token.hp.max > 0
                        ? Math.max(0, Math.min(1, token.hp.current / token.hp.max)) * 100
                        : 0
                    }%`,
                  }}
                />
              </span>
            )}
          </span>
        )}
      </aside>
    );
  }

  return (
    <aside className="hud-rail" aria-label="Panel aktywnej postaci">
      <div className="hud-head">
        <span className="hud-head-title">Postać</span>
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
          <HudIcon name="stand-up" className="hud-empty-icon" />
          <span>
            Kliknij token, którym chcesz sterować. Potem klikaj podłoże, żeby iść, i przeciwnika,
            żeby wycelować.
          </span>
        </p>
      )}

      {token && (
        <>
          {/* Whose turn it is, said where the hand already is. The queue itself
              lives in the top bar (stage 16f) — this is the one fact from it
              that concerns the figure in this panel. */}
          {context.acting && (
            <p className="hud-turn-banner">{context.isGm ? 'Tura tej figury' : 'Twoja tura'}</p>
          )}

          <IdentityCard
            name={token.name}
            imageUrl={token.imageUrl}
            hp={token.hp}
            vitals={context.vitals}
          />

          <StatusChips statuses={token.statuses} />

          {/* Showing is not steering: the rail fills itself in with this
              figure, but the map still belongs to nobody until the user says
              so. Without this line an unmoving token after a click on the floor
              reads as a broken map rather than as „you have not picked me up". */}
          {!context.steering && (
            <p className="hud-preview">
              Podgląd — kliknij tę figurę na mapie albo naciśnij slot, żeby nią sterować.
            </p>
          )}

          {context.turn && <TurnBudget budget={context.turn} variant="rail" />}
          {context.refusal && <p className="hud-refusal">{context.refusal}</p>}

          {/* Stepping the queue is not here on purpose: it belongs to the strip
              in the top bar, which owns the queue and works with nothing
              selected. „E" still ends the turn from the map. */}

          {/* Karta jest, ale nie twoja (28.08) — i to **nie** jest przypadek
              pustego paska niżej. Akcje z katalogu (Ustabilizowanie, Bieg…)
              nie potrzebują karty, więc `slots` nigdy nie jest puste i wygląda
              to jak figura, która po prostu nie ma broni. Przy oględzinach
              wyszło, że pierwsza wersja tej poprawki wisiała pod
              `slots.length === 0` i z tego powodu nie pokazywała się nigdy. */}
          {context.sheetNotMine && (
            <p className="hud-refusal">
              Ta figura ma kartę postaci, ale nie jest przypisana do ciebie — dlatego pasek nie zna
              jej broni. Poproś MG, żeby ustawił cię właścicielem karty.
            </p>
          )}

          {context.slots.length === 0 && (
            <p className="hud-empty">
              <HudIcon name="pistol" className="hud-empty-icon" />
              <span>
                Ten token nie ma broni ani profilu bojowego — podłącz kartę postaci albo uzupełnij
                profil w „Edytuj…”.
              </span>
            </p>
          )}

          {weapons.length > 0 && (
            <section className="hud-group">
              <h3 className="hud-group-title">Broń</h3>
              <div className="hud-slots">
                {weapons.map((group) => {
                  if (group.kind !== 'weapon') return null;
                  const slot = cpredWeaponModeSlot(
                    group,
                    fireModes[fireModeKey(token.id, group.weaponRowId)],
                  );
                  return (
                    <div key={group.id} className="hud-slot-stack">
                      <HotbarSlot
                        slot={slot}
                        keyLabel={group.key}
                        // Armed is about the *weapon*: the tile is one box now,
                        // so highlighting it per mode would leave the gun in
                        // hand looking unarmed after a switch to burst.
                        armed={armed?.weaponRowId === group.weaponRowId}
                        modeCount={group.modes.length}
                        drawerOpen={openDrawer === group.id}
                        onActivate={() => {
                          setOpenDrawer(null);
                          activateGroup(group, token.id);
                        }}
                        onToggleDrawer={() =>
                          setOpenDrawer((current) => (current === group.id ? null : group.id))
                        }
                      />
                      {openDrawer === group.id && (
                        <ModeDrawer
                          group={group}
                          current={slot.mode}
                          onPick={(picked: CpredHotbarWeaponSlot) => {
                            setFireMode(token.id, group.weaponRowId, picked.mode);
                            setOpenDrawer(null);
                            // Picking a mode also takes the weapon in hand: at
                            // the table „przełączam na serię" and „strzelam
                            // serią" are one sentence.
                            activateSlot(picked, token.id);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {actions.length > 0 && (
            <section className="hud-group">
              <h3 className="hud-group-title">Akcje</h3>
              <div className="hud-slots">
                {actions.map((group) => (
                  <HotbarSlot
                    key={group.id}
                    slot={group.slot}
                    keyLabel={group.key}
                    armed={false}
                    modeCount={1}
                    drawerOpen={false}
                    onActivate={() => activateGroup(group, token.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {armed && (
            <p className="hud-armed">
              <span className="hud-armed-mark" aria-hidden />
              <span>
                W ręku: <strong>{armed.name}</strong> — kliknij cel na mapie.
                {isGm && <span className="hud-armed-hint"> Alt+klik celuje we własny token.</span>}
              </span>
            </p>
          )}

          {/* Etap 30a: jedyny formularz paska, który działa też poza walką —
              „poza walką, gdy rozpoczyna się walka albo w trakcie walki"
              (s. 146). Dlatego stoi przed blokiem, który wymaga kolejki. */}
          {form === 'awareness' && token.characterId && (
            <div className="hud-form">
              <CombatAwarenessPanel
                characterId={token.characterId}
                tokenId={token.id}
                onDone={() => setForm(null)}
              />
            </div>
          )}
          {/* Etap 30c: to samo dotyczy radia — „będąc w niebezpieczeństwie"
              obejmuje też chwilę przed pierwszą inicjatywą. */}
          {form === 'backup' && token.characterId && (
            <div className="hud-form">
              <BackupPanel
                characterId={token.characterId}
                tokenId={token.id}
                onDone={() => setForm(null)}
              />
            </div>
          )}

          {form && form !== 'awareness' && form !== 'backup' && combat && context.combatant && (
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
          {form && form !== 'awareness' && form !== 'backup' && !context.combatant && (
            <p className="hud-refusal">
              Ta akcja wymaga trwającej walki — dodaj token do kolejki inicjatywy.
            </p>
          )}

          {/* Ściągawka ze skrótami zniknęła w 27f: pełną listę — z tymi
              czterema i całą resztą — otwiera `?` w górnym pasku. Pasek boczny
              wraca do tego, czym jest, czyli do stanu figury. */}
        </>
      )}
    </aside>
  );
}
