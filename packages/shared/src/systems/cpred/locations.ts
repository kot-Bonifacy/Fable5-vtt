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
 * Where an attack lands. RAW: every attack hits the body unless the attacker
 * spent an Aimed Shot on the head — there is no hit-location table in CP RED.
 * A shield is not a hit location: it is armor a defender may interpose.
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

/** True when the armor piece protects the hit location. */
export function armorCoversLocation(
  armorLocation: ArmorLocation,
  hit: CpredHitLocation,
): boolean {
  // A shield only helps when the defender uses it, which is the GM's call —
  // it is never picked automatically as the protecting piece.
  return armorLocation === hit;
}
