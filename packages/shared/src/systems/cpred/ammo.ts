/**
 * CP RED ammunition (stage 16g) — pure logic, no IO.
 *
 * „Istnieje wiele rodzajów amunicji: kule …, naboje śrutowe, strzały, granaty
 * i rakiety należy dopasować do rodzaju używanej broni" (s. 344). Two questions
 * follow, and this module answers both:
 *
 *  - **does this cartridge fit this gun?** Every round comes in a *pattern* —
 *    bullets, shells, arrows, grenades, rockets — and every weapon type says
 *    which patterns it chambers. „Amunicja przeciwpancerna: wszystkie prócz
 *    naboju śrutowego" is then a list of patterns on one catalogue row rather
 *    than a rule somebody has to remember;
 *  - **what does it change?** Flags, never branches. The same decision the
 *    Critical Injuries made in 14e and the armor penalties in 14c: a GM who
 *    types a round of their own into the compendium gets it enforced exactly
 *    like a printed one, and the combat code never learns the word „dumdum".
 *
 * What the flags deliberately do *not* cover is the other half of the rulebook
 * table — the rounds that deal no damage at all and force a check instead
 * (biotoxin, poison, sleep, tear gas, flashbang, EMP, smart, smoke). Those need
 * a mechanism this stage does not have (a forced check with an effect, and
 * statuses that expire after a minute) and are stage 16h.
 */

import type { ResolvedWeapon } from './compendium.js';

/**
 * Shape a round comes in. The rulebook's own list (s. 344), and the whole of
 * „does it fit": a heavy pistol chambers bullets, a shotgun bullets *or* shells,
 * a bow arrows, a launcher grenades.
 */
export const CPRED_AMMO_PATTERNS = ['bullet', 'shell', 'arrow', 'grenade', 'rocket'] as const;
export type CpredAmmoPattern = (typeof CPRED_AMMO_PATTERNS)[number];

export const CPRED_AMMO_PATTERN_LABELS: Record<CpredAmmoPattern, string> = {
  bullet: 'Kule',
  shell: 'Naboje śrutowe',
  arrow: 'Strzały',
  grenade: 'Granaty',
  rocket: 'Rakiety',
};

/** The spread of a shotgun shell: one attack, one fixed DV, a cone (s. 174). */
export interface CpredAmmoSpread {
  /** „wykonujesz 1 atak dystansowy … przeciwko PT 13" — the DV never varies. */
  dv: number;
  /** „każdy … otrzymuje 3k6 obrażeń" — nor does the damage. */
  damage: string;
  /** „do 6 m przed tobą (3 pola)" — reach of the cone, in metres. */
  coneRangeM: number;
}

/**
 * What one cartridge changes about a hit. Every field is optional and absent
 * means „behaves like ordinary ammunition"; a round with no flags at all is
 * „Amunicja zwykła", which is why an empty magazine selection needs no entry.
 */
export interface CpredAmmoEffect {
  /**
   * Extra Stopping Power the round wears off when it gets through — the
   * armour-piercing round's whole rule: „uszkadza pancerz o 2 punkty, a nie 1"
   * (s. 345), so the bonus is 1 on top of the standard ablation.
   */
  ablationBonus?: number;
  /** „pancerz trafionego celu nie ulega uszkodzeniu" (rubber, s. 346). */
  noAblation?: boolean;
  /** „Ta amunicja nie powoduje Ran Krytycznych" (rubber; the flamethrower). */
  noCriticalInjury?: boolean;
  /**
   * „Jeśli obrażenia … sprawią, że PW celu, który ma więcej niż 1 PW, spadną
   * poniżej 0, zamiast tego cel zostaje na 1 PW" (s. 346).
   */
  nonLethal?: boolean;
  /**
   * Status put on a target the round hurt *through* armour (incendiary, s. 346).
   * The damage travels with the flag rather than coming from the status table,
   * because the same status burns for 2 from a round and for 4 from a
   * flamethrower (s. 348).
   */
  ignites?: { statusId: string; damage: number };
  /**
   * Critical Injuries that are re-rolled and **added to** (dumdum, s. 345): the
   * target keeps the original wound and takes the second one as well, without
   * a second helping of bonus damage.
   *
   * A list because the rulebook's „Ciało obce" is a row in *both* tables (body
   * and head) and therefore two catalogue ids; the draw uses whichever belongs
   * to the table it rolled on.
   */
  extraInjuryOn?: string[];
  /** Shotgun shell: fixed DV, fixed damage, everybody in the cone (s. 174). */
  spread?: CpredAmmoSpread;
  /** „Bronią załadowaną amunicją śrutową nie można Celować" (s. 174). */
  noAim?: boolean;
}

/** A cartridge as the rules see it: what it is, what it fits, what it does. */
export interface CpredAmmoProfile extends CpredAmmoEffect {
  /** Compendium id, e.g. „ammo.armour-piercing". */
  id: string;
  name: string;
  /** Patterns this round is made in; empty means „fits nothing", not „fits all". */
  patterns: CpredAmmoPattern[];
}

/** Standard ablation when nothing says otherwise — RAW's one point (s. 186). */
export const CPRED_ABLATION_STANDARD = 1;

/**
 * Points of Stopping Power this hit wears off the armour it got through.
 *
 * Zero means the piece comes away unharmed, which is a *rule* for rubber
 * („pancerz … nie ulega uszkodzeniu") and not the same thing as „the damage
 * bounced off" — that case is decided by the damage maths, not here.
 */
export function ammoAblation(ammo: CpredAmmoEffect | null | undefined): number {
  if (ammo?.noAblation === true) return 0;
  return Math.max(0, CPRED_ABLATION_STANDARD + Math.round(ammo?.ablationBonus ?? 0));
}

/** Patterns a weapon chambers; empty for melee and for hand-typed rows. */
export function weaponAmmoPatterns(
  resolved: Pick<ResolvedWeapon, 'ammoPatterns' | 'melee'> | null | undefined,
): CpredAmmoPattern[] {
  if (!resolved || resolved.melee) return [];
  return [...(resolved.ammoPatterns ?? [])];
}

/**
 * May this round be loaded into this weapon?
 *
 * Two gates, in the order the catalogue states them. A weapon type may name the
 * rounds it takes outright (`ammoIds` — the flamethrower fires one thing and
 * nothing else, s. 348); everything else matches by pattern. A weapon whose
 * type declares no patterns at all takes nothing, which is the honest answer for
 * a row somebody typed by hand: the catalogue has not been told what it fires.
 */
export function ammoFitsWeapon(
  ammo: Pick<CpredAmmoProfile, 'id' | 'patterns'>,
  resolved: Pick<ResolvedWeapon, 'ammoPatterns' | 'ammoIds' | 'melee'> | null | undefined,
): boolean {
  if (!resolved || resolved.melee) return false;
  if (resolved.ammoIds && resolved.ammoIds.length > 0) return resolved.ammoIds.includes(ammo.id);
  const patterns = weaponAmmoPatterns(resolved);
  return patterns.some((pattern) => ammo.patterns.includes(pattern));
}

/** The rounds in a catalogue that fit this weapon — the sheet's dropdown. */
export function ammoOptionsFor<T extends Pick<CpredAmmoProfile, 'id' | 'patterns'>>(
  catalogue: readonly T[],
  resolved: Pick<ResolvedWeapon, 'ammoPatterns' | 'ammoIds' | 'melee'> | null | undefined,
): T[] {
  return catalogue.filter((ammo) => ammoFitsWeapon(ammo, resolved));
}

/**
 * The round actually in the magazine.
 *
 * A weapon that takes exactly one kind of round is loaded with it whether or not
 * anybody said so — that is what „strzela tylko zapalającymi pociskami do
 * strzelby" means, and it saves the GM from arming every flamethrower by hand.
 * Anything else defaults to ordinary ammunition, which has no entry because it
 * has no effects („Nie ma cech specjalnych", s. 345).
 */
export function loadedAmmoFor(
  row: { ammoId?: string },
  resolved: Pick<ResolvedWeapon, 'ammoPatterns' | 'ammoIds' | 'melee'> | null | undefined,
  lookup: (id: string) => CpredAmmoProfile | null,
): CpredAmmoProfile | null {
  const forced = resolved?.ammoIds?.length === 1 ? resolved.ammoIds[0]! : null;
  const id = row.ammoId && row.ammoId.length > 0 ? row.ammoId : forced;
  return id ? lookup(id) : null;
}

/**
 * What this round did to a hit, in finished Polish sentences for the damage
 * card — the „Trzymanie −2" treatment from 14d, so a missing point of armour is
 * never a silent correction.
 */
export function ammoDamageNotes(
  ammo: CpredAmmoProfile,
  outcome: {
    /** SP the armour lost on this hit. */
    ablated: number;
    /** True when the non-lethal floor actually caught the target. */
    heldAtOne?: boolean;
    /** True when a Critical Injury was suppressed by the round. */
    injurySuppressed?: boolean;
    /** Status the round set alight, when it did. */
    ignited?: { label: string; damage: number };
  },
): string[] {
  const notes: string[] = [];
  if (ammo.ablationBonus && outcome.ablated > 0) {
    notes.push(`pancerz −${outcome.ablated} (zamiast −${CPRED_ABLATION_STANDARD})`);
  }
  if (ammo.noAblation) notes.push('pancerz bez uszkodzeń');
  if (outcome.injurySuppressed) notes.push('bez rany krytycznej');
  if (outcome.heldAtOne) notes.push('cel zatrzymany na 1 PW');
  if (outcome.ignited) {
    notes.push(`${outcome.ignited.label} — ${outcome.ignited.damage} obr./turę`);
  }
  return notes;
}
