import type {
  CombatView,
  CombatantView,
  CpredCharacterData,
  CpredHotbarGroup,
  CpredHotbarSlot,
  CpredHotbarWeaponGroup,
  TokenView,
  TurnBudgetView,
} from '@vtt/shared';
import {
  CPRED_ACTION_GRAPPLE,
  CPRED_ACTION_HOLD,
  CPRED_ACTION_SCANNER,
  CPRED_ACTION_STABILIZE,
  ROLE_GM,
  cpredHotbarGroups,
  cpredInterfaceRank,
  cpredMoveBudgetFromSheet,
  cpredNextWeaponMode,
  cpredWeaponModeSlot,
  effectiveArmorSp,
  empFromHumanity,
  hotbarSlotsFor,
  hpMax,
  humanityMaxWith,
  isAmmoEntry,
  isWeaponEntry,
  resolveWeapon,
  sanitizeCombatProfile,
  toAmmoProfile,
} from '@vtt/shared';
import { loadAttackFor } from './attack-targeting.js';
import { coverAt } from './stores/coverStore.js';
import { combatErrorText, reloadWeapon, runNetScan, spendCombatAction } from './socket.js';
import { netErrorText } from './netErrors.js';
import { useAttackStore } from './stores/attackStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useChatStore } from './stores/chatStore.js';
import { useCombatStore } from './stores/combatStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';
import { fireModeKey, useHudStore, type HudActiveWeapon } from './stores/hudStore.js';
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

/**
 * The numbers under the portrait (stage 27h).
 *
 * Everything here is *derived*, never stored: SP ablates on the armour row,
 * RUCH shrinks with wounds and injuries, and EMP falls out of Humanity. The
 * panel asks the same functions the sheet and the turn tracker ask, so three
 * places cannot disagree about how hurt somebody is.
 */
export interface HudVitals {
  /** Role from the registry („Solo"), or null for an NPC nobody gave one. */
  roleName: string | null;
  /** Stopping Power still standing on the body and on the head. */
  armor: { body: number; head: number } | null;
  /** RUCH after penalties, with the metres one Move Action buys. */
  move: { points: number; metres: number; note: string | null } | null;
  /** EMP as play uses it — derived from current Humanity, not from the stat. */
  emp: { current: number; max: number } | null;
}

/** Everything the HUD draws for one token, gathered from four stores. */
export interface HudContext {
  token: TokenView | null;
  /** This token's row in the fight, or null outside combat. */
  combatant: CombatantView | null;
  /** Budget of that row; the tracker fills it once the fight has started. */
  turn: TurnBudgetView | null;
  slots: CpredHotbarSlot[];
  /**
   * The same slots as the panel draws them (stage 27h): one row per weapon,
   * fire modes folded inside. This is what carries the number keys — `slots`
   * keeps its own for nobody, because the bot reads that list by id.
   */
  groups: CpredHotbarGroup[];
  /** Portrait numbers; null for a token with neither sheet nor profile. */
  vitals: HudVitals | null;
  /**
   * Is this the figure the initiative queue is waiting on right now?
   *
   * Not the same question as `isActiveTurn`, which is „may this token act" and
   * is true for everybody outside a fight. This one is „the queue has stopped
   * here", and it is what puts the banner over the panel. A player whose view
   * of the queue is blanked (a hidden NPC is up) gets false, which is honest:
   * they do not know whose turn it is either.
   */
  acting: boolean;
  isGm: boolean;
  /** Is it this token's turn? Always true outside a fight — nothing is waiting. */
  isActiveTurn: boolean;
  /** Why the whole bar is greyed out („nie twoja tura"), or null. */
  refusal: string | null;
  /**
   * Is the figure in the panel also the one being steered?
   *
   * False while the rail is merely *describing* somebody — the default it picks
   * at login, or the figure remembered from before a right click. Reading a
   * character sheet must not silently make the next click on the floor a march,
   * so the crosshair, the walk preview and the armed weapon all stay off until
   * the user commits by clicking the figure (or pressing one of its slots).
   */
  steering: boolean;
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

/**
 * The three numbers under the portrait, for whichever kind of figure this is.
 *
 * A character reads its sheet; a statist (stage 16b) has one armour value and
 * no Humanity at all, so it gets an armour chip and nothing else — an extra is
 * a gun and a jacket, and inventing a RUCH for it would be inventing a rule.
 * A token with neither is not described here at all: the panel then shows the
 * name and the hit points, which is everything anybody knows about it.
 */
function hudVitalsFor(sheet: CpredCharacterData | null, token: TokenView): HudVitals | null {
  if (sheet) {
    const roles = useCharacterStore.getState().registry.roles;
    const max = hpMax(sheet.stats);
    const budget = cpredMoveBudgetFromSheet({
      move: sheet.stats.move,
      hpCurrent: sheet.hpCurrent,
      hpMax: max,
      armor: sheet.armor,
      injuries: sheet.criticalInjuries,
    });
    const ceiling = humanityMaxWith(sheet.stats, sheet.cyberware);
    return {
      roleName: roles.find((role) => role.id === sheet.roleId)?.name ?? null,
      armor: {
        body: effectiveArmorSp(sheet.armor, 'body'),
        head: effectiveArmorSp(sheet.armor, 'head'),
      },
      move: {
        points: budget.move,
        metres: budget.metresPerMove,
        // Why it is not the printed RUCH — the same sentence the turn tracker
        // shows, so a shrunken budget is never a mystery („Pancerz −2").
        note:
          budget.modifiers.length > 0
            ? budget.modifiers
                .map(
                  (modifier) =>
                    `${modifier.label} ${modifier.value > 0 ? '+' : ''}${modifier.value}`,
                )
                .join(' · ')
            : null,
      },
      emp: { current: empFromHumanity(sheet.humanityCurrent), max: empFromHumanity(ceiling) },
    };
  }

  const profile = token.combatProfile ? sanitizeCombatProfile(token.combatProfile) : null;
  if (!profile) return null;
  return {
    roleName: null,
    armor: { body: profile.armorSp, head: profile.armorSp },
    move: null,
    emp: null,
  };
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
  const steering = tokenId !== null && useSelectionStore.getState().tokenId === tokenId;

  if (!token) {
    return {
      token: null,
      combatant: null,
      turn: null,
      slots: [],
      groups: [],
      vitals: null,
      acting: false,
      isGm,
      isActiveTurn: false,
      refusal: null,
      steering: false,
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
    // Stage 16g: what is in the magazine decides how the slot behaves — a
    // shotgun loaded with shot aims a cone, not a bullet.
    resolveAmmo: (ammoId) => {
      const entry = compendium.entries[ammoId];
      return entry && isAmmoEntry(entry) ? toAmmoProfile(entry) : null;
    },
    statuses: token.statuses,
    turn: turn
      ? {
          actionSpent: turn.resources.find((row) => row.id === 'action')?.used === 1,
          moveSpent: (turn.resources.find((row) => row.id === 'move')?.used ?? 0) > 0,
          // Why the resource is gone, when it was never there to spend: a wound
          // that took the Action away carries its own sentence (stage 14e).
          blockedAction: turn.resources.find((row) => row.id === 'action')?.blocked ?? null,
          blockedMove: turn.resources.find((row) => row.id === 'move')?.blocked ?? null,
        }
      : null,
    isGm,
    grapple: combatant?.grapple?.role ?? null,
    netrunner: isNetrunnerSheet(character?.data ?? null),
  });

  const shown = refusal ? slots.map((slot) => ({ ...slot, disabled: refusal })) : slots;

  return {
    token,
    combatant,
    turn,
    vitals: hudVitalsFor(character?.data ?? null, token),
    acting: combatant !== null && combat?.activeCombatantId === combatant.id,
    // „Not your turn" outranks everything the slot itself had to say: the
    // reason on the button has to be the one that will actually refuse it.
    slots: shown,
    groups: cpredHotbarGroups(shown),
    isGm,
    isActiveTurn: refusal === null,
    refusal,
    steering,
  };
}

/**
 * Can this sheet run the Net (stage 26b)?
 *
 * The same two conditions the server checks before it will scan — an Interface
 * rank and a cyberdeck — asked here so the Scanner slot appears for exactly the
 * figures whose click would be honoured. The registry is the one the character
 * store already loaded; without it (a sheet opened before `roles.json` arrived)
 * the answer is „no", and the slot appears a moment later with the data.
 */
function isNetrunnerSheet(data: CpredCharacterData | null): boolean {
  if (!data || !data.cyberdeck) return false;
  const registry = useCharacterStore.getState().registry;
  return cpredInterfaceRank(data, registry) !== null;
}

/**
 * The figure this viewer's own token defaults to — what the rail shows before
 * anything has been clicked.
 *
 * Players only. The GM's every token is steerable, so „their own figure" would
 * mean picking one NPC out of dozens at random; their rail stays on whatever
 * they last clicked and is empty until then.
 */
function defaultFocusTokenId(): string | null {
  const user = useAuthStore.getState().user;
  if (!user || user.role === ROLE_GM) return null;
  const own = Object.values(useTokenStore.getState().tokens)
    .filter((token) => token.ownerId === user.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.id.localeCompare(b.id));
  return own[0]?.id ?? null;
}

/**
 * The figure the left rail describes — steered, remembered, or defaulted to.
 *
 * Derived rather than stored, so it heals itself: a remembered id whose token
 * has not arrived yet (or has been deleted, or belongs to another scene) simply
 * falls through to the default, and snaps back the moment the token shows up.
 * The only thing that can leave the rail empty while a default exists is the
 * user saying so — right click on bare map, or the last rung of Escape.
 */
export function hudFocusTokenId(): string | null {
  const selection = useSelectionStore.getState();
  const tokens = useTokenStore.getState().tokens;
  if (selection.focusTokenId && tokens[selection.focusTokenId]) return selection.focusTokenId;
  if (selection.dismissed) return null;
  return defaultFocusTokenId();
}

/** Builds the HUD state for whatever token this viewer has under attention. */
export function currentHudContext(): HudContext {
  return hudContextFor(hudFocusTokenId());
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
    context.vitals ?? null,
    context.acting,
    context.refusal,
    context.steering,
    context.combatant?.id ?? null,
    context.combatant?.grapple?.role ?? null,
    // Co ze slotu **widać**. Nabój wpadł tu w sesji naprawczej 22.08 (błąd #5):
    // po zmianie amunicji w broni bez magazynka (granat) zmieniał się wyłącznie
    // chip naboju, a sygnatura tego nie widziała — panel zostawał przy starym
    // widoku aż do przeładowania strony. Strzelba odświeżała się tylko dlatego,
    // że przy okazji przeładowania zmieniał się licznik magazynka.
    context.slots.map((slot) => [
      slot.id,
      slot.label,
      slot.disabled,
      slot.key,
      slot.kind === 'weapon' ? slot.ammoLabel : null,
      slot.kind === 'action' ? null : (slot.ammo ?? null),
      slot.kind === 'weapon' ? slot.coneRangeM : null,
    ]),
  ]);
}

/**
 * How the rail asks the map to steer a figure, registered by `MapArea`.
 *
 * The selection has to go *through* the renderer rather than straight into the
 * store: the dashed ring, the walk preview and the reticle all live there, and
 * a store write nobody drew would leave the map disagreeing with the panel.
 */
let steerHandler: ((tokenId: string) => void) | null = null;

/** `MapArea` hands in the renderer's selection door; null on unmount. */
export function setSteerHandler(handler: ((tokenId: string) => void) | null): void {
  steerHandler = handler;
}

/**
 * Takes control of the figure the rail is describing.
 *
 * Pressing a slot is the one unambiguous „I am playing this one" there is, so
 * it promotes a figure the rail merely *showed* into the steered one. Without
 * this the default panel would be a wall of buttons that quietly do nothing:
 * every attack path (`attackWithActiveWeapon`, `throwAtPoint`, `shootCoverAt`)
 * refuses a weapon whose token is not the selected one.
 */
function steerToken(tokenId: string): void {
  if (useSelectionStore.getState().tokenId === tokenId) return;
  if (steerHandler) steerHandler(tokenId);
  else useSelectionStore.getState().select(tokenId);
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
  // A refused slot is deliberately *not* worth taking control for — the button
  // did nothing, so the map should not change under the user either.
  steerToken(tokenId);
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
      // A grenade waits for a click on the *ground* rather than on a figure
      // (stage 16d), so the map has to know which of the two this weapon wants
      // before the click happens.
      pointTarget: slot.pointTarget,
      // A shell sprays: the map draws the cone the shot will cover, while the
      // click keeps meaning „that figure" (stage 16g).
      ...(slot.coneRangeM !== null ? { coneRangeM: slot.coneRangeM } : {}),
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
  // The Scanner rolls where the figure stands and has its own event: the server
  // books the Action itself (`netrun:scan`), so sending a second spend here
  // would charge the turn twice.
  if (slot.actionId === CPRED_ACTION_SCANNER) {
    void runNetScan(tokenId).then((ack) => {
      if (!ack.ok) chat.addNote(netErrorText(ack.error));
    });
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
 * Which mode a weapon row is set to right now (stage 27h).
 *
 * Reads the store rather than taking it as an argument, because three callers
 * ask the same question — the panel, the number keys and the mode-cycling key —
 * and a mode passed around by hand is a mode that ends up stale in one of them.
 */
export function hudWeaponSlot(group: CpredHotbarWeaponGroup, tokenId: string) {
  const remembered = useHudStore.getState().fireModes[fireModeKey(tokenId, group.weaponRowId)];
  return cpredWeaponModeSlot(group, remembered);
}

/** Runs a group: a weapon in its current mode, or the single thing inside. */
export function activateGroup(group: CpredHotbarGroup, tokenId: string): void {
  const slot = group.kind === 'weapon' ? hudWeaponSlot(group, tokenId) : group.slot;
  activateSlot(slot, tokenId);
}

/**
 * Moves a weapon to its next fire mode (Shift + the weapon's number key).
 *
 * Switching *while holding the gun* re-arms it, so the crosshair and the panel
 * never disagree about what the next click will fire. Switching a weapon that
 * is not in hand only remembers the choice — pressing Shift+2 to line up a
 * burst must not quietly take the pistol out of somebody's hands.
 */
export function cycleGroupMode(group: CpredHotbarGroup, tokenId: string): void {
  if (group.kind !== 'weapon' || group.modes.length < 2) return;
  const current = hudWeaponSlot(group, tokenId);
  const next = cpredNextWeaponMode(group, current.mode);
  useHudStore.getState().setFireMode(tokenId, group.weaponRowId, next);
  const armed = useHudStore.getState().activeWeapon;
  if (armed?.tokenId === tokenId && armed.weaponRowId === group.weaponRowId) {
    activateSlot(cpredWeaponModeSlot(group, next), tokenId);
  }
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
  // A charge aimed at a figure still goes off on the *square* that figure is
  // standing on (stage 16d), so it declines the token and lets the ground path
  // take the same click.
  if (weapon.pointTarget) return false;
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
 * Throws the bar's active charge at a square of ground (stage 16d).
 *
 * The one place the HUD deliberately takes a click that would otherwise start a
 * walk: with a grenade in hand, clicking the floor means „it lands here". That
 * is a mode, and stage 16f spent a session avoiding modes — but a blast is
 * centred on a square (s. 174), and there is no way to name a square except by
 * pointing at one. Escape and the slot key both put it away.
 *
 * Returns false when nothing point-aimed is armed, so the click falls through
 * to the walk planner untouched.
 */
export function throwAtPoint(worldX: number, worldY: number): boolean {
  const weapon = useHudStore.getState().activeWeapon;
  const selected = useSelectionStore.getState().tokenId;
  if (!weapon?.pointTarget || !selected || weapon.tokenId !== selected) return false;
  const token = useTokenStore.getState().tokens[weapon.tokenId];
  if (!token) return false;
  loadAttackFor(
    {
      ...(token.characterId ? { characterId: token.characterId } : {}),
      attackerTokenId: weapon.tokenId,
      weaponRowId: weapon.weaponRowId,
      mode: weapon.mode,
    },
    { kind: 'point', point: { x: worldX, y: worldY } },
  );
  return true;
}

/**
 * Fires the bar's active weapon at the cover under the pointer (stage 16c) —
 * „ostrzelaj samochód" without going through the refusal card first.
 *
 * Returns false when there is no cover there or nothing armed, so the click
 * falls through to the walk planner: with empty hands a car is scenery, and
 * scenery must not swallow the click that would have started a walk.
 */
export function shootCoverAt(worldX: number, worldY: number): boolean {
  const weapon = useHudStore.getState().activeWeapon;
  const selected = useSelectionStore.getState().tokenId;
  if (!weapon || weapon.pointTarget || !selected || weapon.tokenId !== selected) return false;
  const cover = coverAt({ x: worldX, y: worldY });
  if (!cover) return false;
  const token = useTokenStore.getState().tokens[weapon.tokenId];
  if (!token) return false;
  loadAttackFor(
    {
      ...(token.characterId ? { characterId: token.characterId } : {}),
      attackerTokenId: weapon.tokenId,
      weaponRowId: weapon.weaponRowId,
      mode: weapon.mode,
    },
    { kind: 'cover', coverId: cover.id },
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
    ordered = combat.combatants
      .map((row) => row.tokenId)
      .filter((id): id is string => id !== null && id in tokens);
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
