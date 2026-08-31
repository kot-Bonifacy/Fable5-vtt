/**
 * Body locations of CP RED combat: where armor sits and where a hit lands.
 *
 * Their own module because three files need them — the sheet (`character.ts`
 * stores worn armor), the catalogue (`compendium.ts` mints armor entries) and
 * the damage engine (`damage.ts`) — and importing any one of those from
 * another would close a cycle (same reason as `ids.ts`).
 */

/** Where a piece of armor can be worn. */
export const ARMOR_LOCATIONS = ['head', 'body', 'shield'] as const;
export type ArmorLocation = (typeof ARMOR_LOCATIONS)[number];

export const ARMOR_LOCATION_LABELS: Record<ArmorLocation, string> = {
  head: 'Głowa',
  body: 'Korpus',
  shield: 'Tarcza',
};

/** Highest SP the rules allow on one piece of armor. */
export const ARMOR_SP_MAX = 30;

/**
 * Bounds shared by the catalogue and the sheet (stage 14c). They live in this
 * leaf module for the same reason the locations do: from stage 14c both
 * `compendium.ts` and `character.ts` validate the same two numbers, and having
 * either import the other is exactly the edge this file exists to avoid.
 */

/** Worst REF/ZW/RUCH penalty one piece of armor may carry (s. 185). */
export const ARMOR_PENALTY_MIN = -6;

/** Damage that gets through armor on a head hit is doubled (RAW). */
export const CPRED_HEAD_DAMAGE_MULTIPLIER = 2;

/**
 * Ceiling on the head multiplier a Critical Injury may raise (s. 188).
 *
 * „Pęknięta czaszka" prints ×3; the cap exists so a GM's own row cannot turn a
 * graze into a four-figure number by typo. Two is the printed default and stays
 * the floor — a wound never makes a head hit *safer*.
 */
export const CPRED_HEAD_DAMAGE_MULTIPLIER_MAX = 5;

/** Worst RUCH penalty one Critical Injury may carry — a severed leg is −6. */
export const INJURY_MOVE_PENALTY_MIN = -10;

/**
 * Worst flat penalty a Critical Injury may put on every Check (stage 14e).
 * The printed table stops at −4 („Uraz mózgu"); the room above it is for the
 * GM's own rows, and the floor is what stops a typo turning a wound into a
 * character who can never roll again.
 */
export const INJURY_ACTION_PENALTY_MIN = -8;

/**
 * Longest condition a Critical Injury's conditional penalty may name.
 *
 * The rulebook's own phrasings are short („Akcje wykonywane tą ręką", „ataki
 * dystansowe i Testy Percepcji oparte na wzroku"); the limit is here rather
 * than beside the name limit because both `compendium.ts` and `character.ts`
 * check it, which is the whole reason this file exists.
 */
export const INJURY_CONDITION_MAX_LENGTH = 120;

/**
 * „−4, ale tylko wtedy, gdy…" — a modifier the rules name and the table applies.
 *
 * Deliberately never folded into a roll's total: the VTT does not know which
 * hand is holding the gun or whether this Persuasion Check involves speaking,
 * and a wrong automatic −4 is worse than a visible reminder. The roll dialog
 * offers it as a button; the sheet prints it beside the wound.
 */
export interface CpredConditionalPenalty {
  /** Negative modifier, e.g. −4. */
  value: number;
  /** When it bites, in the rulebook's own words („Akcje wykonywane tą ręką"). */
  condition: string;
}

/**
 * Where an attack lands — which armor stops it and whether the ×2 applies.
 * RAW: every attack hits the body unless the attacker spent an Aimed Shot on
 * the head; there is no hit-location table in CP RED. A shield is not a hit
 * location: it is armor a defender may interpose.
 */
export const CPRED_HIT_LOCATIONS = ['body', 'head'] as const;
export type CpredHitLocation = (typeof CPRED_HIT_LOCATIONS)[number];

export const CPRED_HIT_LOCATION_LABELS: Record<CpredHitLocation, string> = {
  body: 'Korpus',
  head: 'Głowa',
};

export function isCpredHitLocation(value: unknown): value is CpredHitLocation {
  return typeof value === 'string' && (CPRED_HIT_LOCATIONS as readonly string[]).includes(value);
}

/**
 * What an Aimed Shot may be pointed at (s. 170).
 *
 * Three, not one. „Atak zabiera całą Akcję i jest wymierzony w jedną
 * z poniższych lokacji trafień": the head doubles the damage that gets through,
 * a held item is knocked out of the target's hands, and a leg breaks. All three
 * cost the same −8 and the same whole Action.
 *
 * Deliberately *not* the same list as `CpredHitLocation`: only the head has
 * armor of its own, so a leg shot and a knocked-out gun are both resolved
 * against body armor. Keeping the two lists apart is what stops „aim at the
 * leg" from quietly looking up a piece of armor nobody wears.
 */
export const CPRED_AIM_POINTS = ['head', 'heldItem', 'leg'] as const;
export type CpredAimPoint = (typeof CPRED_AIM_POINTS)[number];

export const CPRED_AIM_POINT_LABELS: Record<CpredAimPoint, string> = {
  head: 'Głowa',
  heldItem: 'Trzymany przedmiot',
  leg: 'Noga',
};

/** Short forms for the banner over the map, where the line has to fit. */
export const CPRED_AIM_POINT_SHORT: Record<CpredAimPoint, string> = {
  head: 'głowa',
  heldItem: 'przedmiot',
  leg: 'noga',
};

/**
 * Sylwetka na guziku Celowania (plik w `public/icons/hud/`).
 *
 * Nazwę ikony wybiera `shared`, nie komponent — ta sama umowa, co przy slotach
 * panelu postaci (`CpredSlotIcon`): podmiana rysunku nigdy nie jest zmianą
 * w regułach, a nowy punkt Celowania nie ma jak powstać bez własnej sylwetki,
 * bo kompilator dopisze go do tego rekordu.
 */
export const CPRED_AIM_POINT_ICONS: Record<CpredAimPoint, string> = {
  head: 'aim-head',
  heldItem: 'aim-hand',
  leg: 'aim-leg',
};

/** Zwykły strzał — sylwetka w celowniku, bez wskazanej lokacji. */
export const CPRED_AIM_BODY_ICON = 'aim-body';

export function isCpredAimPoint(value: unknown): value is CpredAimPoint {
  return typeof value === 'string' && (CPRED_AIM_POINTS as readonly string[]).includes(value);
}

/**
 * Armor the aimed shot has to get through: the head has its own piece, the
 * other two aim points are „pancerz na ciele celu" (s. 170).
 */
export function hitLocationForAim(aim: CpredAimPoint): CpredHitLocation {
  return aim === 'head' ? 'head' : 'body';
}

/** True when the armor piece protects the hit location. */
export function armorCoversLocation(armorLocation: ArmorLocation, hit: CpredHitLocation): boolean {
  // A shield only helps when the defender uses it, which is the GM's call —
  // it is never picked automatically as the protecting piece.
  return armorLocation === hit;
}
