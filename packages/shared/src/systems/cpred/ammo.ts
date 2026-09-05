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
 * Stage 16h finished the table from the other end — the rounds that deal no
 * damage at all. They needed exactly two mechanisms and no branches: a **check
 * the round forces on whoever it reaches** (`check`), whose failure is again
 * data (damage, statuses, injuries, a duration), and a **square of smoke**
 * (`smoke`) that penalises rather than hurts. Two more flags cover the last two
 * rows: `noDamage` for „nie zadaje obrażeń", and `smart` for the round that
 * offers a second roll after a near miss.
 */

import type { ResolvedWeapon } from './compendium.js';
import type { CpredStatId } from './stats.js';
import { CPRED_MINUTE_S, describeCpredDuration } from './timed.js';

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
 * What failing the round's check costs (stage 16h).
 *
 * Four fields cover all seven rows of the no-damage half of the table, and the
 * reason they are one shape rather than seven is that they compose: tear gas is
 * an injury with a duration, biotoxin is damage without one, sleep is two
 * statuses with one.
 */
export interface CpredAmmoCheckFailure {
  /**
   * Damage the failure deals, in dice notation. „obrażenia bezpośrednie"
   * throughout this half of the table: armour neither stops it nor wears down,
   * which is why it never travels through the ordinary damage roll.
   */
  damage?: string;
  /** Statuses put on the target („Powalony i Nieprzytomny"). */
  statuses?: string[];
  /** Critical Injuries added by compendium id („Uraz oka", „Uraz ucha"). */
  injuries?: string[];
  /**
   * Seconds of fiction the statuses and injuries last. Absent means „until
   * somebody takes it off", which is what a wound normally is.
   */
  durationS?: number;
}

/**
 * A check the round forces on whoever it reaches (stage 16h).
 *
 * The mechanism suppressive fire has had since stage 16 (`RollForcedCheck`),
 * with one addition that is the whole stage: the result *does* something. Seven
 * printed rounds are seven rows of this shape and not one branch in the combat
 * code — and a GM inventing an eighth gets it enforced the same way.
 */
export interface CpredAmmoCheck {
  /** Skill the target rolls, by registry id („resist-torture-drugs"). */
  skillId: string;
  /**
   * What to call it when the registry has no such skill — a trimmed campaign
   * list, or the sample one a fresh clone ships with. The check then runs on
   * the bare stat, which is the honest degradation: a character who never
   * trained it rolls their attribute.
   */
  skillLabel?: string;
  /**
   * The attribute to fall back on in that case. Carried on the row rather than
   * guessed, because „Odporność na tortury/narkotyki" is SW and
   * „Cyberinżynieria" is TECH, and a wrong guess is a silently wrong roll.
   */
  statId?: CpredStatId;
  dv: number;
  /**
   * „Wszystkie biologiczne cele" (biotoxin, s. 345). The VTT does not know
   * which figures are made of meat, so this prints a caveat on the card rather
   * than skipping anybody — the table decides, and can press „Cofnij".
   */
  biologicalOnly?: boolean;
  failure: CpredAmmoCheckFailure;
}

/** „Amunicja dymna": a square that hides rather than hurts (s. 347). */
export interface CpredAmmoSmoke {
  /** Side of the square in metres — the rulebook's 10. */
  sideM: number;
  /** What every check made inside it takes, as a negative number („zwykle −4"). */
  penalty: number;
}

/**
 * „Amunicja inteligentna": a near miss corrects itself (s. 347).
 *
 * The second roll is offered rather than taken, because Luck may be spent on
 * it — and spending Luck is never the server's decision.
 */
export interface CpredAmmoSmart {
  /** Largest miss that still gets the second roll („chybisz o 4 lub mniej"). */
  maxMiss: number;
  /** Flat bonus on that roll — the round's own guidance („1k10 + 10"). */
  bonus: number;
  /**
   * Cyberware the round needs („Celownik optyczny"). A warning on the card and
   * never a refusal: the VTT has no cyberware model before stage 23, so
   * refusing would be guessing.
   */
  requires?: string;
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
  /**
   * „Ta amunicja nie zadaje obrażeń" (stage 16h) — the attack card offers no
   * damage roll at all, and whatever the round does instead is in `check` or
   * `smoke`. Separate from those two on purpose: a round could in principle
   * force a check *and* hurt, and the rules would then need both statements.
   */
  noDamage?: boolean;
  /** The check this round forces on everything it reaches (stage 16h). */
  check?: CpredAmmoCheck;
  /** The cloud this round lays down instead of damage (stage 16h). */
  smoke?: CpredAmmoSmoke;
  /** The second roll this round offers after a near miss (stage 16h). */
  smart?: CpredAmmoSmart;
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

/* ------------------------------------------------------------------ *
 * Rounds that deal no damage (stage 16h)
 * ------------------------------------------------------------------ */

/**
 * Does a hit with this round end in a damage roll?
 *
 * The one question the attack card asks before offering the „Obrażenia" button,
 * and the reason it is a function rather than `!ammo.noDamage`: an area attack
 * with a gas round has a target list *and* nothing to roll, and reading that off
 * two flags at three call sites is how they drift apart.
 */
export function ammoDealsDamage(ammo: CpredAmmoEffect | null | undefined): boolean {
  return ammo?.noDamage !== true;
}

/** One target's answer to a forced check — pure arithmetic, rolled elsewhere. */
export interface CpredAmmoCheckOutcome {
  die: number;
  modifier: number;
  total: number;
  /** True when the target's total is strictly higher than the DV (s. 131). */
  resisted: boolean;
}

/**
 * Judges one forced check. `die` comes from the caller's RNG, `modifier` is the
 * target's stat plus skill — the same shape suppressive fire has used since 16.
 *
 * A tie is a **failure**: the manual prints the general rule twice and both
 * times strictly — „licząc na to, że wynik będzie **większy** od Poziomu
 * Trudności (PT)" (s. 130) and „Jeśli wynik Testu jest **wyższy** od PT, udało
 * ci się!" (s. 131). The ruling of 28.08.2026 that made this `>=` quoted an
 * „equal or higher" wording that the Polish edition does not carry; corrected
 * 30.08.2026, so every static DV in the project reads the same way.
 *
 * Opposed rolls (`resolveCpredAttack`, suppressive fire) reach the same `>` by
 * a different road — „w przypadku remisu Broniący zawsze wygrywa" (s. 130).
 */
export function cpredAmmoCheckOutcome(
  die: number,
  modifier: number,
  dv: number,
): CpredAmmoCheckOutcome {
  const total = die + modifier;
  return { die, modifier, total, resisted: total > dv };
}

/**
 * „3k6 bezpośrednich · Powalony, Nieprzytomny · na minutę" — what failing costs,
 * in one Polish line for the chat card.
 *
 * Names rather than ids, so the caller passes the labels it already looked up;
 * a card reading „injury.head-uraz-oka" would be the compendium leaking into
 * the table's language. `labels` is **required** for exactly that reason: until
 * the repair session of 22.08 it defaulted to the raw id lists, so a caller who
 * simply forgot leaked them — which is what the card of a statist caught by
 * tear gas did (bug #6 of the 08.08 combat session), and what the compendium
 * entry of every such round did next to it.
 */
export function describeAmmoFailure(
  failure: CpredAmmoCheckFailure,
  labels: { statuses?: readonly string[]; injuries?: readonly string[] },
): string {
  const parts: string[] = [];
  if (failure.damage) parts.push(`${failure.damage} bezpośrednich`);
  const statuses = labels.statuses ?? [];
  if (statuses.length > 0) parts.push(statuses.join(', '));
  const injuries = labels.injuries ?? [];
  if (injuries.length > 0) parts.push(injuries.join(', '));
  if (failure.durationS) parts.push(describeCpredDuration(failure.durationS));
  return parts.join(' · ');
}

/**
 * May this miss be taken again? „Jeśli chybisz o 4 lub mniej" (s. 347).
 *
 * `missedBy` is the number the attack card already prints („brakło 3"), so the
 * offer and the explanation can never disagree about how close it was.
 */
export function ammoOffersSecondRoll(
  ammo: CpredAmmoEffect | null | undefined,
  missedBy: number,
): boolean {
  if (!ammo?.smart) return false;
  return missedBy > 0 && missedBy <= ammo.smart.maxMiss;
}

/** Default duration of everything the table calls „na minutę". */
export const CPRED_AMMO_MINUTE_S = CPRED_MINUTE_S;

/* ------------------------------------------------------------------ *
 * Impuls EMP wskazuje, co padło (04.09.2026)
 * ------------------------------------------------------------------ */

/**
 * „Trafione cele wykonują Test Cyberinżynierii o PT 15; przy porażce MG wyłącza
 * **dwie** cyborgizacje albo urządzenia celu na minutę" (s. 345–347).
 */
export const CPRED_EMP_DISABLED_COUNT = 2;

/**
 * Które dwie padły.
 *
 * Do 04.09.2026 karta mówiła tylko, że cel oblał Test — dwie cyborgizacje
 * wybierał MG w pamięci, a po minucie nikt nie wiedział, co właściwie wraca.
 * Losowanie po stronie serwera, z tego samego RNG co rzut, bo to ta sama
 * decyzja: gracz, który mógłby wskazać, co mu padło, wskazywałby chip do
 * odtwarzania muzyki, a nie Kerenzikova.
 *
 * Zwraca **nazwy**, nie identyfikatory wierszy: nazwa jest tym, co czyta stół,
 * a wiersz karty i tak może zniknąć, zanim minuta minie. Ciało bez chromu
 * zwraca pustą listę — statysta bez karty również, i wtedy dwie „cyborgizacje
 * albo urządzenia" zostają MG, tak jak przed tą zmianą.
 */
export function cpredEmpDisabled(
  rows: readonly { name?: string }[],
  rng: (sides: number) => number,
  count = CPRED_EMP_DISABLED_COUNT,
): string[] {
  const pool = rows.map((row) => (row.name ?? '').trim()).filter((name) => name.length > 0);
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(rng(pool.length) - 1, 1)[0]!);
  }
  return picked;
}
