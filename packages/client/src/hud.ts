import type {
  CombatView,
  CombatantView,
  CpredHotbarSlot,
  TokenView,
  TurnBudgetView,
} from '@vtt/shared';
import {
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_STABILIZE,
  ROLE_GM,
  hotbarSlotsFor,
  isWeaponEntry,
  resolveWeapon,
  sanitizeCombatProfile,
} from '@vtt/shared';
import { loadAttackFor } from './attack-targeting.js';
import { combatErrorText, reloadWeapon, spendCombatAction } from './socket.js';
import { useAttackStore } from './stores/attackStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useChatStore } from './stores/chatStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';
import { useHudStore, type HudActiveWeapon } from './stores/hudStore.js';
import { useSelectionStore } from './stores/selectionStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * The wiring behind the combat HUD (stage 16f).
 *
 * Plain functions reading the stores rather than hooks, because the bar has two
 * mouths: the buttons in `CombatHud` and the number keys in `MapArea`. A second
 * copy of „what does slot 3 do" living in the keyboard handler is precisely how
 * the two would drift apart, so both call in here.
 *
 * Nothing in this file decides a rule. The slots come from `hotbarSlotsFor` in
 * `shared`, the refusals come with them, and every activation ends in an event
 * that already existed — `weapon:reload`, `combat:action`, or the attack path
 * of stage 16b.
 */

/** Everything the HUD draws for one token, gathered from four stores. */
export interface HudContext {
  token: TokenView | null;
  /** This token's row in the fight, or null outside combat. */
  combatant: CombatantView | null;
  /** Budget of that row; the tracker fills it once the fight has started. */
  turn: TurnBudgetView | null;
  slots: CpredHotbarSlot[];
  isGm: boolean;
  /** Is it this token's turn? Always true outside a fight — nothing is waiting. */
  isActiveTurn: boolean;
  /** Why the whole bar is greyed out („nie twoja tura"), or null. */
  refusal: string | null;
}

/**
 * Why this token may not act right now, as a sentence.
 *
 * The same comparison the server makes (`applySpend`), and deliberately without
 * a „only when we know who is acting" guard: a player is often not told whose
 * turn it is — `filterCombatForPlayer` blanks `activeCombatantId` whenever a
 * hidden NPC is acting — and „I don't know" still means „not mine". The GM is
 * never refused (stage 14b logs the overspend instead), so they never get one.
 */
export function hudTurnRefusal(
  combat: CombatView | null,
  tokenId: string | null,
  isGm: boolean,
): string | null {
  if (!tokenId || isGm || !combat) return null;
  const combatant = combat.combatants.find((row) => row.tokenId === tokenId);
  if (!combatant) return null;
  if (combat.activeCombatantId !== combatant.id) {
    return 'To nie jest tura tej postaci — poczekaj na swoją kolej.';
  }
  return null;
}

/** Builds the whole HUD state for one token by reading the stores. */
export function hudContextFor(tokenId: string | null): HudContext {
  const isGm = useAuthStore.getState().user?.role === ROLE_GM;
  const token = tokenId ? (useTokenStore.getState().tokens[tokenId] ?? null) : null;
  const combat = useCombatStore.getState().combat;
  const combatant = token
    ? (combat?.combatants.find((row) => row.tokenId === token.id) ?? null)
    : null;
  const turn = combatant?.turn ?? null;
  const refusal = hudTurnRefusal(combat, tokenId, isGm);

  if (!token) {
    return {
      token: null,
      combatant: null,
      turn: null,
      slots: [],
      isGm,
      isActiveTurn: false,
      refusal: null,
    };
  }

  const character = token.characterId
    ? (useCharacterStore.getState().characters[token.characterId] ?? null)
    : null;
  const compendium = useCompendiumStore.getState();
  const weaponTypeById = new Map(Object.entries(compendium.weaponTypeById));

  const slots = hotbarSlotsFor({
    sheet: character ? character.data : null,
    profile: character || !token.combatProfile ? null : sanitizeCombatProfile(token.combatProfile),
    resolve: (compendiumId) => {
      const entry = compendiumId ? compendium.entries[compendiumId] : undefined;
      return entry && isWeaponEntry(entry) ? resolveWeapon(entry, { weaponTypeById }) : null;
    },
    statuses: token.statuses,
    turn: turn
      ? {
          actionSpent: turn.resources.find((row) => row.id === 'action')?.used === 1,
          moveSpent: (turn.resources.find((row) => row.id === 'move')?.used ?? 0) > 0,
        }
      : null,
    isGm,
    grapple: combatant?.grapple?.role ?? null,
  });

  return {
    token,
    combatant,
    turn,
    // „Not your turn" outranks everything the slot itself had to say: the
    // reason on the button has to be the one that will actually refuse it.
    slots: refusal ? slots.map((slot) => ({ ...slot, disabled: refusal })) : slots,
    isGm,
    isActiveTurn: refusal === null,
    refusal,
  };
}

/** Builds the HUD state for whatever token this viewer is steering. */
export function currentHudContext(): HudContext {
  return hudContextFor(useSelectionStore.getState().tokenId);
}

/**
 * Everything the panel actually draws, as one string.
 *
 * The HUD has to watch the token store, and since stage 16e tokens move
 * *continuously* — a march pushes twenty positions a second. Re-rendering a
 * React tree at that rate next to a canvas that is already animating is the
 * kind of cost that shows up as dropped frames rather than as a bug, so the
 * component compares this instead and only re-renders when something on screen
 * would differ. Coordinates are deliberately absent: the panel never shows them.
 */
export function hudSignature(context: HudContext): string {
  const token = context.token;
  return JSON.stringify([
    token?.id ?? null,
    token?.name ?? null,
    token?.imageUrl ?? null,
    token?.hp ?? null,
    token?.statuses ?? null,
    context.turn ?? null,
    context.refusal,
    context.combatant?.id ?? null,
    context.combatant?.grapple?.role ?? null,
    context.slots.map((slot) => [slot.id, slot.label, slot.disabled, slot.key]),
  ]);
}

/**
 * Runs a slot.
 *
 * A weapon slot only *arms* — the shot is the click on the target that follows,
 * and the Action is charged by the server when the dice fly, so an abandoned
 * aim costs nothing. That is the same bargain Ustabilizowanie and Pochwycenie
 * struck in stages 14b and 14d.
 */
export function activateSlot(slot: CpredHotbarSlot, tokenId: string): void {
  const chat = useChatStore.getState();
  if (slot.disabled) {
    chat.addNote(slot.disabled);
    return;
  }
  const hud = useHudStore.getState();

  if (slot.kind === 'weapon') {
    const active = hud.activeWeapon;
    // Pressing the armed slot again puts the weapon away — the same „never
    // mind" Escape gives, on the key that armed it.
    if (active && active.tokenId === tokenId && active.slotId === slot.id) {
      hud.setActiveWeapon(null);
      return;
    }
    const weapon: HudActiveWeapon = {
      tokenId,
      slotId: slot.id,
      weaponRowId: slot.weaponRowId,
      mode: slot.mode,
      // The mode is part of what is „in hand": a burst and a single shot from
      // the same gun are two different things to be holding.
      name: slot.modeLabel ? `${slot.label} — ${slot.modeLabel}` : slot.label,
      melee: slot.melee,
    };
    hud.setActiveWeapon(weapon);
    // The crosshair armed from a sheet and the bar's own weapon would both
    // want the next click; the bar wins, because it is the one just pressed.
    useAttackStore.getState().disarm();
    return;
  }

  if (slot.kind === 'reload') {
    const token = useTokenStore.getState().tokens[tokenId];
    if (!token?.characterId) {
      chat.addNote('Ten token nie ma karty postaci — magazynek uzupełnij w „Edytuj…”.');
      return;
    }
    reloadWeapon(token.characterId, slot.weaponRowId);
    return;
  }

  // Three actions need words or a target before anything can be booked; the
  // bar opens the *same* forms the „Walka" tab uses rather than a second copy.
  if (slot.actionId === CPRED_ACTION_HOLD) {
    hud.setForm('hold');
    return;
  }
  if (slot.actionId === CPRED_ACTION_GRAPPLE) {
    hud.setForm('grapple');
    return;
  }
  if (slot.actionId === CPRED_ACTION_STABILIZE) {
    hud.setForm('stabilize');
    return;
  }

  const combatantId = useCombatStore
    .getState()
    .combat?.combatants.find((row) => row.tokenId === tokenId)?.id;
  void spendCombatAction(slot.actionId, undefined, combatantId).then((ack) => {
    if (!ack.ok) chat.addNote(combatErrorText(ack.error));
  });
}

/**
 * Fires the bar's active weapon at a token — the click the crosshair promises.
 *
 * Returns false when there was nothing armed, which is how the map tells „this
 * click was an attack" from „this click was something else".
 */
export function attackWithActiveWeapon(targetTokenId: string): boolean {
  const weapon = useHudStore.getState().activeWeapon;
  const selected = useSelectionStore.getState().tokenId;
  if (!weapon || !selected || weapon.tokenId !== selected) return false;
  const token = useTokenStore.getState().tokens[weapon.tokenId];
  if (!token) return false;
  loadAttackFor(
    {
      ...(token.characterId ? { characterId: token.characterId } : {}),
      attackerTokenId: weapon.tokenId,
      weaponRowId: weapon.weaponRowId,
      mode: weapon.mode,
    },
    targetTokenId,
  );
  return true;
}

/**
 * Next token this viewer may steer, in a stable order (`Tab`).
 *
 * A player cycles their own figures; the GM cycles the fight when there is one
 * and the whole scene when there is not — „next token" during a firefight means
 * „next participant", and any other order would be a list of scenery.
 */
export function nextSteerableToken(from: string | null): string | null {
  const isGm = useAuthStore.getState().user?.role === ROLE_GM;
  const userId = useAuthStore.getState().user?.id ?? null;
  const tokens = useTokenStore.getState().tokens;
  const combat = useCombatStore.getState().combat;

  let ordered: string[];
  if (isGm && combat && combat.combatants.length > 0) {
    ordered = combat.combatants.map((row) => row.tokenId).filter((id) => id in tokens);
  } else {
    ordered = Object.values(tokens)
      .filter((token) => isGm || token.ownerId === userId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.id.localeCompare(b.id))
      .map((token) => token.id);
  }
  if (ordered.length === 0) return null;
  const index = from ? ordered.indexOf(from) : -1;
  return ordered[(index + 1) % ordered.length] ?? null;
}
