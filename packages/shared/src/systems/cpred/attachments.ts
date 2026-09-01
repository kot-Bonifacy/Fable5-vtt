/**
 * CP RED weapon attachments (stage 31, s. 342–344) — pure logic, no IO.
 *
 * „Każda zwykła (nie egzotyczna) broń dystansowa ma trzy gniazda na dodatki"
 * (s. 342). The slots have been in the data since stage 13 and had nothing to
 * put in them; this module is the eight printed rows and the four questions
 * they raise:
 *
 *  - **does it fit this gun?** The rulebook answers per row („Pasuje do:
 *    wszystkich broni dystansowych korzystających z Umiejętności Broń długa"),
 *    so fitting is a small shape on the catalogue entry — a list of skills, a
 *    list of skills it refuses — and never a rule keyed to a weapon id. A GM's
 *    own attachment is judged by the same three lines as a printed one.
 *  - **how many slots does it eat?** One by default, two for the three that say
 *    so. `attachmentSlotsFree` is the whole of „can I still bolt something on",
 *    and „Efekty dwóch jednakowych dodatków nie kumulują się" is enforced by
 *    refusing the second copy rather than by ignoring it later.
 *  - **what does it change about the gun?** Flags on the row, exactly as
 *    ammunition does it (16g) and Critical Injuries do it (14e): a bigger
 *    magazine, a gun that no longer hides, a bonus to the Test.
 *  - **what second weapon does it bolt on?** Three of the eight turn one object
 *    into two — a bayonet is Lekka broń biała, an underbarrel is a Granatnik
 *    with one round. That is `secondary`, and it is a *weapon type id* rather
 *    than a copy of its numbers: the launcher's range table belongs to the
 *    launcher, and a GM who edits it edits it once.
 *
 * Two of the bonuses are conditional and therefore live here as data the
 * planner reads rather than as a number it adds: the smartgun's +1 needs chrome
 * in the body („musisz być z nim połączony za pomocą złączy interfejsu lub
 * uchwytu podskórnego"), and the scope's +1 needs distance and a single shot
 * („do celu odległego o co najmniej 51 metrów … lub wykonując Celowanie").
 */

import type { RollBreakdownEntry } from '../../dice.js';
import type { ResolvedWeapon } from './compendium.js';

/**
 * The three columns of the magazine table (s. 344).
 *
 * `standard` is not an attachment — it is the weapon type's own magazine, and
 * it is in the list so that „which column am I firing from" has one answer
 * rather than „a drum, an extended one, or nothing bolted on at all".
 */
export const CPRED_MAGAZINE_KINDS = ['standard', 'extended', 'drum'] as const;
export type CpredMagazineKind = (typeof CPRED_MAGAZINE_KINDS)[number];

export const CPRED_MAGAZINE_KIND_LABELS: Record<CpredMagazineKind, string> = {
  standard: 'Zwykły',
  extended: 'Wydłużony',
  drum: 'Bębnowy',
};

/** Slots the rulebook gives a non-exotic ranged weapon, and this module's cap. */
export const CPRED_ATTACHMENT_SLOTS_MAX = 3;

/** Slots one attachment takes when its row does not say otherwise. */
export const CPRED_ATTACHMENT_SLOTS_DEFAULT = 1;

/**
 * „Do danej broni można doczepić tylko jeden magazynek naraz" — the group the
 * two magazines share. A string rather than a boolean because the rulebook may
 * grow a second such family, and a GM's own row can join either.
 */
export const CPRED_ATTACHMENT_GROUP_MAGAZINE = 'magazine';

/**
 * The second weapon an attachment bolts onto the host (s. 343).
 *
 * A weapon **type id** and an optional magazine override, never a copy of the
 * numbers: „można wykorzystać jako Granatnik z tylko jednym granatem
 * w magazynku" is the launcher's whole profile with one field changed, and
 * copying the rest would leave a bayonet whose damage stops matching Lekka
 * broń biała the moment the GM edits the table.
 */
export interface CpredAttachmentWeapon {
  /** Weapon type it becomes, e.g. „weapon-type.grenade-launcher". */
  weaponTypeId: string;
  /** Rounds the bolted-on weapon holds, when the attachment cuts them down. */
  magazine?: number;
}

/**
 * The scope's conditional bonus (s. 344).
 *
 * „Strzelając do celu odległego o co najmniej 51 metrów z broni w trybie
 * jednego strzału lub wykonując Celowanie, możesz dodać +1 do Testu" — one
 * sentence with two ways to earn it, which is why this is a shape rather than a
 * number: an Aimed Shot qualifies at any distance, and a burst never does.
 */
export interface CpredAttachmentRangedBonus {
  bonus: number;
  /** Distance from which an ordinary shot earns it („co najmniej 51 metrów"). */
  minMetres?: number;
  /** An Aimed Shot earns it whatever the distance. */
  whenAimed?: boolean;
  /** Only a single shot earns it — a burst is not „tryb jednego strzału". */
  singleOnly?: boolean;
  /**
   * Cyberware this bonus refuses to stack with („Nie kumuluje się
   * z cyborgizacją Teleskop"). Names rather than ids, because the ids are made
   * from Polish names at import and a GM who retypes the row changes them.
   */
  conflictsWith?: string[];
}

/**
 * What one attachment changes about the gun it is bolted to.
 *
 * Every field is optional and absent means „changes nothing about that". A row
 * with no fields at all is a piece of decoration that still eats a slot, which
 * is a legitimate thing for a GM to invent.
 */
export interface CpredAttachmentEffect {
  /** Slots it takes; one unless the row says two („Zajmuje 2 gniazda"). */
  slots?: number;
  /** „Po zamontowaniu tego dodatku broni nie da się ukryć pod ubraniem." */
  blocksConcealment?: boolean;
  /** Magazine column it swaps in — the two magazines, and nothing else. */
  magazine?: CpredMagazineKind;
  /**
   * Flat bonus to every ranged attack Test with this weapon — the smartgun's
   * „dodajesz +1 do wyniku Testu".
   */
  attackBonus?: number;
  /**
   * Cyberware the flat bonus needs, by **name** („Złącza interfejsu",
   * „Uchwyt podskórny") — any one of them is enough.
   *
   * Names rather than compendium ids for the reason a Critical Injury is looked
   * up by name (umowa from 29.08): the id is made from the Polish name at
   * import and dies the moment the GM retypes the row, while the name is what
   * both the table and the sheet actually print.
   */
  requiresCyberware?: string[];
  /** The conditional bonus of the sniper scope. */
  rangedBonus?: CpredAttachmentRangedBonus;
  /**
   * „Zmniejsza do zera modyfikatory ujemne za strzelanie do celu ukrytego
   * w ciemności, dymie, mgle itp." (night sight, s. 343).
   *
   * Zeroing rather than cancelling with a matching plus: the rulebook says the
   * penalty stops existing, and a card reading „Dym −4 · Noktowizor +4" would
   * be arithmetic theatre. What counts as obscurement is decided by whoever
   * builds the breakdown — this flag only says „drop those rows".
   */
  ignoresObscurement?: boolean;
  /** The second weapon it bolts on — bayonet and the two underbarrels. */
  secondary?: CpredAttachmentWeapon;
  /**
   * Family in which only one may be fitted at a time. Two magazines share
   * `CPRED_ATTACHMENT_GROUP_MAGAZINE`; everything else is refused only as a
   * duplicate of itself.
   */
  exclusiveGroup?: string;
}

/**
 * „Pasuje do:" — the one line every printed attachment opens with.
 *
 * Three rules cover all eight rows, and the absence of a rule means „no
 * restriction from that direction". Exotic weapons need no rule at all: the
 * catalogue gives them zero slots (s. 342), so nothing can be bolted to one
 * and `attachmentFitsWeapon` never gets asked.
 */
export interface CpredAttachmentFit {
  /** Skills the host must use („Broń długa" for the bayonet, s. 343). */
  skillIds?: string[];
  /** Skills the host must *not* use — the magazines refuse bows and crossbows. */
  notSkillIds?: string[];
  /**
   * The host must carry a magazine at all. Set by the two magazines: a weapon
   * whose type counts no rounds has no row in the magazine table to read.
   */
  needsMagazine?: boolean;
}

/** An attachment as the rules see it: what it is, what it fits, what it does. */
export interface CpredAttachmentProfile extends CpredAttachmentEffect {
  /** Compendium id, e.g. „attachment.smartgun-link". */
  id: string;
  name: string;
  fit: CpredAttachmentFit;
}

/** Slots one attachment eats. */
export function attachmentSlotCost(attachment: Pick<CpredAttachmentEffect, 'slots'>): number {
  const slots = attachment.slots;
  if (typeof slots !== 'number' || !Number.isInteger(slots) || slots < 1) {
    return CPRED_ATTACHMENT_SLOTS_DEFAULT;
  }
  return Math.min(slots, CPRED_ATTACHMENT_SLOTS_MAX);
}

/** Slots the fitted attachments occupy together. */
export function attachmentSlotsUsed(
  fitted: readonly Pick<CpredAttachmentEffect, 'slots'>[],
): number {
  return fitted.reduce((sum, attachment) => sum + attachmentSlotCost(attachment), 0);
}

/** Slots still open on this weapon; zero for melee and for exotics. */
export function attachmentSlotsFree(
  resolved: Pick<ResolvedWeapon, 'attachmentSlots'> | null | undefined,
  fitted: readonly Pick<CpredAttachmentEffect, 'slots'>[],
): number {
  const total = Math.max(0, Math.min(resolved?.attachmentSlots ?? 0, CPRED_ATTACHMENT_SLOTS_MAX));
  return Math.max(0, total - attachmentSlotsUsed(fitted));
}

/**
 * May this attachment be bolted to this weapon at all?
 *
 * The three lines of `CpredAttachmentFit`, plus the two the catalogue already
 * answers: a melee weapon and an exotic have no slots, and „wszystkich broni
 * dystansowych" means every row here is about a gun.
 */
export function attachmentFitsWeapon(
  attachment: Pick<CpredAttachmentProfile, 'fit'>,
  resolved:
    Pick<ResolvedWeapon, 'attachmentSlots' | 'melee' | 'skillId' | 'magazine'> | null | undefined,
): boolean {
  if (!resolved || resolved.melee) return false;
  if ((resolved.attachmentSlots ?? 0) <= 0) return false;
  const fit = attachment.fit ?? {};
  const skillId = resolved.skillId ?? null;
  if (fit.skillIds && fit.skillIds.length > 0) {
    if (!skillId || !fit.skillIds.includes(skillId)) return false;
  }
  if (fit.notSkillIds && skillId && fit.notSkillIds.includes(skillId)) return false;
  if (fit.needsMagazine === true && !(resolved.magazine && resolved.magazine > 0)) return false;
  return true;
}

/** Why an attachment cannot go on this weapon right now. */
export type CpredAttachmentProblem =
  | 'UNKNOWN_ATTACHMENT'
  | 'ATTACHMENT_DOES_NOT_FIT'
  | 'ATTACHMENT_NO_SLOTS'
  | 'ATTACHMENT_ALREADY_FITTED'
  | 'ATTACHMENT_GROUP_TAKEN';

export const CPRED_ATTACHMENT_PROBLEM_MESSAGES: Record<CpredAttachmentProblem, string> = {
  UNKNOWN_ATTACHMENT: 'Nie ma takiego dodatku w kompendium.',
  ATTACHMENT_DOES_NOT_FIT: 'Ten dodatek nie pasuje do tej broni.',
  ATTACHMENT_NO_SLOTS: 'Broń nie ma tylu wolnych gniazd.',
  ATTACHMENT_ALREADY_FITTED: 'Ten dodatek jest już zamontowany — efekty się nie kumulują.',
  ATTACHMENT_GROUP_TAKEN: 'Do broni można doczepić tylko jeden magazynek naraz.',
};

/**
 * Can this attachment be added to what is already bolted on?
 *
 * „Efekty dwóch jednakowych dodatków nie kumulują się" (s. 342) is enforced as
 * a refusal rather than as silence later: a player who paid 500 ed for a second
 * drum has to be told at the moment they mount it, not left wondering why the
 * magazine did not grow.
 */
export function attachmentMountProblem(
  attachment: CpredAttachmentProfile,
  resolved:
    Pick<ResolvedWeapon, 'attachmentSlots' | 'melee' | 'skillId' | 'magazine'> | null | undefined,
  fitted: readonly CpredAttachmentProfile[],
): CpredAttachmentProblem | null {
  if (!attachmentFitsWeapon(attachment, resolved)) return 'ATTACHMENT_DOES_NOT_FIT';
  if (fitted.some((entry) => entry.id === attachment.id)) return 'ATTACHMENT_ALREADY_FITTED';
  if (attachment.exclusiveGroup) {
    const taken = fitted.some((entry) => entry.exclusiveGroup === attachment.exclusiveGroup);
    if (taken) return 'ATTACHMENT_GROUP_TAKEN';
  }
  if (attachmentSlotCost(attachment) > attachmentSlotsFree(resolved, fitted)) {
    return 'ATTACHMENT_NO_SLOTS';
  }
  return null;
}

/** The catalogue rows that could still go on this weapon — the picker's list. */
export function attachmentOptionsFor<T extends CpredAttachmentProfile>(
  catalogue: readonly T[],
  resolved:
    Pick<ResolvedWeapon, 'attachmentSlots' | 'melee' | 'skillId' | 'magazine'> | null | undefined,
  fitted: readonly CpredAttachmentProfile[],
): T[] {
  return catalogue.filter((entry) => attachmentMountProblem(entry, resolved, fitted) === null);
}

/**
 * Rounds the weapon holds with what is bolted to it (s. 344).
 *
 * The magazine table lives on the weapon *type*, so a drum on a shotgun asks
 * the shotgun how big its drum is. A type the table forgot keeps its standard
 * magazine, and that is the honest answer rather than a guess: „Broń może
 * wystrzelić tyle pocisków, ile wyszczególniono w poniższej tabeli" has nothing
 * to say about a weapon that is not in it.
 */
export function weaponMagazineWith(
  resolved:
    Pick<ResolvedWeapon, 'magazine' | 'magazineExtended' | 'magazineDrum'> | null | undefined,
  fitted: readonly Pick<CpredAttachmentEffect, 'magazine'>[],
): number | null {
  const standard = resolved?.magazine ?? null;
  if (standard === null) return null;
  const kind = fitted.find((entry) => entry.magazine && entry.magazine !== 'standard')?.magazine;
  if (kind === 'extended' && resolved?.magazineExtended) return resolved.magazineExtended;
  if (kind === 'drum' && resolved?.magazineDrum) return resolved.magazineDrum;
  return standard;
}

/** Which column the weapon is firing from, for the sheet's chip. */
export function weaponMagazineKind(
  fitted: readonly Pick<CpredAttachmentEffect, 'magazine'>[],
): CpredMagazineKind {
  return (
    fitted.find((entry) => entry.magazine && entry.magazine !== 'standard')?.magazine ?? 'standard'
  );
}

/** Can the weapon still go under a coat? Four of the eight say no. */
export function weaponConcealableWith(
  resolved: Pick<ResolvedWeapon, 'concealable'> | null | undefined,
  fitted: readonly Pick<CpredAttachmentEffect, 'blocksConcealment'>[],
): boolean {
  if (resolved?.concealable !== true) return false;
  return !fitted.some((entry) => entry.blocksConcealment === true);
}

/** Does anything bolted on see through smoke and the dark? */
export function attachmentIgnoresObscurement(
  fitted: readonly Pick<CpredAttachmentEffect, 'ignoresObscurement'>[],
): boolean {
  return fitted.some((entry) => entry.ignoresObscurement === true);
}

/** What the shot has to know before the conditional bonuses can be judged. */
export interface CpredAttachmentShot {
  /** Whole metres to the target. */
  metres: number;
  /** True for `mode: 'single'` — a burst is not „tryb jednego strzału". */
  single: boolean;
  /** True when this is an Aimed Shot. */
  aimed: boolean;
  /**
   * True for a swing rather than a shot. The smartgun's bonus reads „wykonując
   * atak dystansowy smartgunem" (s. 344), so a bayonet mounted on the same
   * rifle earns nothing from the link beside it.
   */
  melee?: boolean;
  /**
   * Cyberware in the attacker's body, by name. Empty for a figure with no
   * sheet, which is the right answer: a statist has no chrome to be connected
   * through, so a smartgun link on its weapon gives it nothing.
   */
  cyberware?: readonly string[];
}

/** Case- and space-insensitive name match — the umowa from 30c, in one place. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Does the body carry any one of the pieces this bonus needs? */
export function hasRequiredCyberware(
  required: readonly string[] | undefined,
  installed: readonly string[] | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  const rows = installed ?? [];
  return required.some((name) => rows.some((row) => sameName(row, name)));
}

/**
 * Named entries the fitted attachments splice into an attack's breakdown.
 *
 * Both bonuses are conditional, and both conditions are *facts about this shot*
 * rather than about the gun — which is why they are decided here, beside the
 * dice, and not baked into a resolved weapon the moment something was screwed
 * on. A smartgun on the shoulder of somebody with no interface plugs is worth
 * exactly nothing, and the card should show nothing rather than a +1 the rules
 * never granted.
 */
export function attachmentAttackModifiers(
  fitted: readonly CpredAttachmentProfile[],
  shot: CpredAttachmentShot,
): RollBreakdownEntry[] {
  const entries: RollBreakdownEntry[] = [];
  for (const attachment of fitted) {
    if (attachment.attackBonus && attachment.attackBonus !== 0 && shot.melee !== true) {
      if (hasRequiredCyberware(attachment.requiresCyberware, shot.cyberware)) {
        entries.push({
          label: attachment.name,
          value: attachment.attackBonus,
          kind: 'situational',
        });
      }
    }
    const ranged = attachment.rangedBonus;
    if (
      ranged &&
      ranged.bonus !== 0 &&
      shot.melee !== true &&
      attachmentRangedBonusApplies(ranged, shot)
    ) {
      entries.push({ label: attachment.name, value: ranged.bonus, kind: 'situational' });
    }
  }
  return entries;
}

/**
 * „…do celu odległego o co najmniej 51 metrów z broni w trybie jednego strzału
 * **lub** wykonując Celowanie" (s. 344).
 *
 * The two halves are alternatives, not a conjunction: an Aimed Shot at 3 m
 * earns the scope's +1, and a burst at 300 m does not. `singleOnly` guards the
 * distance half only — Celowanie is already a single attack by definition
 * („Wykonujesz pojedynczy … atak", s. 170).
 */
export function attachmentRangedBonusApplies(
  bonus: CpredAttachmentRangedBonus,
  shot: Pick<CpredAttachmentShot, 'metres' | 'single' | 'aimed'>,
): boolean {
  if (bonus.whenAimed === true && shot.aimed) return true;
  if (bonus.minMetres === undefined) return bonus.singleOnly !== true || shot.single;
  if (shot.metres < bonus.minMetres) return false;
  return bonus.singleOnly !== true || shot.single;
}

/** The attachments on this weapon that bolt a second weapon onto it. */
export function secondaryAttachments(
  fitted: readonly CpredAttachmentProfile[],
): CpredAttachmentProfile[] {
  return fitted.filter((entry) => entry.secondary !== undefined);
}

/**
 * A short line for the sheet: what this attachment does, in the table's words.
 *
 * Assembled from the flags rather than copied out of the description, so a GM's
 * own row explains itself too — and so the sentence stays true after somebody
 * edits the numbers.
 */
export function describeAttachment(attachment: CpredAttachmentProfile): string {
  const parts: string[] = [];
  const slots = attachmentSlotCost(attachment);
  parts.push(slots === 1 ? '1 gniazdo' : `${slots} gniazda`);
  if (attachment.magazine && attachment.magazine !== 'standard') {
    parts.push(`magazynek ${CPRED_MAGAZINE_KIND_LABELS[attachment.magazine].toLowerCase()}`);
  }
  if (attachment.attackBonus && attachment.attackBonus > 0) {
    parts.push(`+${attachment.attackBonus} do Testu ataku`);
  }
  if (attachment.rangedBonus && attachment.rangedBonus.bonus > 0) {
    const bonus = attachment.rangedBonus;
    const when: string[] = [];
    if (bonus.minMetres !== undefined) when.push(`od ${bonus.minMetres} m`);
    if (bonus.whenAimed) when.push('przy Celowaniu');
    parts.push(
      when.length > 0
        ? `+${bonus.bonus} do Testu (${when.join(' lub ')})`
        : `+${bonus.bonus} do Testu`,
    );
  }
  if (attachment.ignoresObscurement) parts.push('bez kar za ciemność i dym');
  if (attachment.secondary) parts.push('druga broń');
  if (attachment.blocksConcealment) parts.push('broni nie da się ukryć');
  return parts.join(' · ');
}
