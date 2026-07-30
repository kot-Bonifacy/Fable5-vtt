/**
 * Dice engine (pure logic, no IO). Parses roll notation, executes rolls with
 * an injected RNG and applies the Cyberpunk RED table rules:
 *
 * - a formula whose dice are exactly one d10 is a "check" — a natural 10
 *   rolls one extra d10 and adds it (critical success), a natural 1 rolls one
 *   extra d10 and subtracts it (fumble); the extra die never explodes again,
 * - two or more sixes among (added) d6 dice raise the critical-injury flag
 *   (the injury table itself is stage 14).
 *
 * Consumers: chat commands (stage 06), character sheet (08), combat (14–15),
 * bots (19). Results are structured JSON, never preformatted strings.
 */

/** Returns a die roll: an integer in [1, sides]. Injected by the caller. */
export type DiceRng = (sides: number) => number;

export const MAX_ROLL_TERMS = 10;
export const MAX_DICE_PER_TERM = 20;
export const MAX_DIE_SIDES = 1000;

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
}

export interface ModifierTerm {
  kind: 'modifier';
  sign: 1 | -1;
  value: number;
}

export type RollTerm = DiceTerm | ModifierTerm;

export interface RollFormula {
  terms: RollTerm[];
}

export type RollParseError = 'EMPTY' | 'SYNTAX' | 'TOO_MANY_TERMS' | 'TOO_MANY_DICE' | 'BAD_SIDES';

export type ParsedRoll = { ok: true; formula: RollFormula } | { ok: false; error: RollParseError };

/**
 * Parses roll notation: dice terms (`2d6`, `d10`) and integer modifiers,
 * joined with `+`/`-`, optional leading sign, whitespace ignored. `k` is
 * accepted as the Polish alias of `d` (`1k10` ≡ `1d10`).
 */
export function parseRollNotation(input: string): ParsedRoll {
  const compact = input.replace(/\s+/g, '').toLowerCase();
  if (compact.length === 0) return { ok: false, error: 'EMPTY' };

  const tokens = compact.match(/[+-]?[^+-]+/g);
  if (!tokens || tokens.join('') !== compact) return { ok: false, error: 'SYNTAX' };
  if (tokens.length > MAX_ROLL_TERMS) return { ok: false, error: 'TOO_MANY_TERMS' };

  const terms: RollTerm[] = [];
  for (const token of tokens) {
    const sign: 1 | -1 = token.startsWith('-') ? -1 : 1;
    const body = /^[+-]/.test(token) ? token.slice(1) : token;

    const dice = /^(\d*)[dk](\d+)$/.exec(body);
    if (dice) {
      const count = dice[1] === '' ? 1 : Number.parseInt(dice[1]!, 10);
      const sides = Number.parseInt(dice[2]!, 10);
      if (count < 1 || count > MAX_DICE_PER_TERM) return { ok: false, error: 'TOO_MANY_DICE' };
      if (sides < 2 || sides > MAX_DIE_SIDES) return { ok: false, error: 'BAD_SIDES' };
      terms.push({ kind: 'dice', sign, count, sides });
      continue;
    }

    if (/^\d+$/.test(body)) {
      terms.push({ kind: 'modifier', sign, value: Number.parseInt(body, 10) });
      continue;
    }

    return { ok: false, error: 'SYNTAX' };
  }

  return { ok: true, formula: { terms } };
}

/** Renders a formula back to canonical notation, e.g. `1d10+5-2d6`. */
export function formatRollNotation(formula: RollFormula): string {
  return formula.terms
    .map((term, index) => {
      const sign = term.sign === -1 ? '-' : index === 0 ? '' : '+';
      const body = term.kind === 'dice' ? `${term.count}d${term.sides}` : `${term.value}`;
      return sign + body;
    })
    .join('');
}

export interface DiceTermResult extends DiceTerm {
  rolls: number[];
  /** Sum of the rolls, sign applied. */
  subtotal: number;
}

export interface ModifierTermResult extends ModifierTerm {
  subtotal: number;
}

export type RollTermResult = DiceTermResult | ModifierTermResult;

/** The CP RED check-rule outcome: the extra d10 and how it was applied. */
export interface CheckCritical {
  type: 'crit' | 'fumble';
  /** Value of the extra d10; added for a crit, subtracted for a fumble. */
  extraRoll: number;
}

/**
 * Where and which way the cup was thrown — presentation metadata that lets
 * every viewer's 3D animation continue the thrower's hand motion. Pure
 * cosmetics: it never influences the rolled values.
 */
export interface RollToss {
  /** Unit throw direction in screen coordinates (x right, y down). */
  dirX: number;
  dirY: number;
  /** Release point in viewport coordinates normalized to 0–1. */
  originX: number;
  originY: number;
}

/**
 * One named contribution to a roll's modifier, so the chat card can explain
 * where the number came from ("Percepcja 4", "Poważnie ranny −2"). The core
 * engine only carries these entries — game systems (stage 08: CP RED) fill
 * them in, which keeps the dice module free of system knowledge.
 */
export interface RollBreakdownEntry {
  label: string;
  /** Signed contribution to the total. */
  value: number;
  /** Free-form category used for styling, e.g. `stat`, `skill`, `wound`. */
  kind?: string;
}

/**
 * Verdict of a roll the rules judge on their own (stage 15: Death Saves;
 * stage 16: rolls against a DV). The dice engine only carries it — the game
 * system decides what counts as success and writes the Polish label.
 */
export interface RollOutcome {
  success: boolean;
  /** Short verdict shown on the card, e.g. „Przeżył" / „Zgon". */
  label: string;
  /** The arithmetic behind it, e.g. „5 + 2 = 7 · próg BC 8". */
  detail?: string;
}

/**
 * Damage a roll produced, so the chat card can offer „Zastosuj na celu".
 * Locations are opaque strings here: the core engine must not learn what a
 * head is (stage 15: CP RED fills them in).
 */
export interface RollDamageMeta {
  location: string;
  locationLabel: string;
  /** Weapon the damage came from — shown on the card. */
  weaponName?: string;
  /** True when armor stops none of this damage. */
  ignoreArmor?: boolean;
  /**
   * Factor applied to the rolled total before armor (CP RED autofire: 2d6
   * times how far the attack beat its DV). Absent means ×1. The dice are
   * *not* multiplied — the rules roll two dice and multiply the sum, which
   * also keeps „two sixes = Critical Injury" reading the same two dice.
   */
  multiplier?: number;
  /** Token this damage is meant for, so „Zastosuj" preselects it (stage 16). */
  targetTokenId?: string;
}

/** Rolled total after the damage multiplier — what actually hits the target. */
export function damageTotal(roll: Pick<RollResult, 'total' | 'damage'>): number {
  return roll.total * (roll.damage?.multiplier ?? 1);
}

/**
 * An attack a roll resolved, so the chat card can show the verdict and offer
 * the follow-up damage roll (stage 16). Like `RollDamageMeta`, this stays
 * opaque: the engine judges nothing here, it only carries what the system
 * module (CP RED) computed, plus the labels the card prints.
 */
export interface RollAttackMeta {
  /** Everything the system needs to chain the damage roll, as it defined it. */
  system: Record<string, unknown>;
  /** „Militech M-10AF → Ganger" — headline of the card. */
  label: string;
  /** „24 m (13–25 m) · PT 15" — the line explaining where the DV came from. */
  detail: string;
  /** Whether the attack landed; absent when the roll sets a DV for others. */
  hit?: boolean;
  /** Token the attack was aimed at, so „Zastosuj" can preselect it. */
  targetTokenId?: string;
  /** Follow-up damage the card offers, when the attack landed. */
  damageNotation?: string;
  /** Factor the follow-up damage is multiplied by (autofire). */
  damageMultiplier?: number;
  /** True once the defender contested the attack — it may only be done once. */
  evaded?: boolean;
  /** Results of checks the attack forced on others (suppressive fire). */
  forcedChecks?: RollForcedCheck[];
}

/**
 * An opposed test whose loser may still answer (stage 14d).
 *
 * Deliberately not `RollAttackMeta`: an attack card offers damage and a dodge,
 * an opposed test offers one counter-roll and a verdict. Same shape of card,
 * different question — and the core knows neither, exactly as with attacks.
 */
export interface RollOpposedMeta {
  /** Whatever the follow-up needs, as the system defined it. */
  system: Record<string, unknown>;
  /** „Vex → Kurier · Pochwycenie" — headline of the card. */
  label: string;
  /** „zwarcie · 2 m · PT 14 (ZW + Bijatyka celu)" — where the DV came from. */
  detail: string;
  /** Did the roller beat the other side? Ties go to the defender. */
  won: boolean;
  /** Token whose owner may answer with a roll of their own. */
  defenderTokenId?: string;
  /** Text of the button offered to them („Broń się"). */
  answerLabel?: string;
  /** Set once the answer was rolled — an opposed test is contested once. */
  answered?: boolean;
}

/** One target's forced check — the card lists them under the attack. */
export interface RollForcedCheck {
  name: string;
  detail: string;
  success: boolean;
}

export interface RollResult {
  /** Canonical notation of what was rolled, e.g. `1d10+7`. */
  notation: string;
  terms: RollTermResult[];
  /**
   * Human-readable name of what was rolled ("Percepcja (INT)") — set by sheet
   * rolls; chat commands leave it out and use the message's label instead.
   */
  title?: string;
  /** Acting character's name, shown on the chat card instead of the user's. */
  actor?: string;
  /** Named modifier sources summing up to the formula's flat modifier. */
  breakdown?: RollBreakdownEntry[];
  /**
   * Present only when the formula is a CP RED check (its dice are exactly one
   * added d10) and the natural roll was a 10 or a 1.
   */
  critical?: CheckCritical;
  /** True when two or more sixes appeared among added d6 dice (CP RED). */
  criticalDamage: boolean;
  /** Verdict, when the rules judge this roll (Death Saves). */
  outcome?: RollOutcome;
  /** Applicable damage, when the roll was a weapon's damage (stage 15). */
  damage?: RollDamageMeta;
  /** Attack verdict, when the roll was an attack (stage 16). */
  attack?: RollAttackMeta;
  /** Verdict of an opposed test the other side may answer (stage 14d). */
  opposed?: RollOpposedMeta;
  total: number;
  /**
   * Presentation metadata attached by the server when the roll was thrown
   * with the dice cup: shake strength 0–3 boosting the 3D toss animation.
   */
  tossStrength?: number;
  /** Throw direction and release point of the cup gesture (cosmetic). */
  toss?: RollToss;
}

/** True when the formula's dice are exactly one added d10 — a CP RED check. */
export function isCheckFormula(formula: RollFormula): boolean {
  const dice = formula.terms.filter((t): t is DiceTerm => t.kind === 'dice');
  return dice.length === 1 && dice[0]!.count === 1 && dice[0]!.sides === 10 && dice[0]!.sign === 1;
}

export interface RollOptions {
  /**
   * Whether the CP RED check rule (a natural 10 or 1 on a single added d10
   * rolls one extra die) applies. Left out, the engine infers it from the
   * formula — chat commands cannot declare their intent. Rolls that are not
   * Checks in the rules set it to `false` explicitly: initiative is
   * `1d10 + REF`, but the rulebook ties criticals to Skill Checks, so an
   * initiative of 10 must not explode.
   */
  checkRule?: boolean;
}

/**
 * Executes a formula. Every random number comes from `rng` — the server
 * injects a crypto-based one, tests a seeded or scripted one.
 */
export function rollFormula(
  formula: RollFormula,
  rng: DiceRng,
  options: RollOptions = {},
): RollResult {
  const isCheck = options.checkRule ?? isCheckFormula(formula);
  const terms: RollTermResult[] = [];
  let total = 0;
  let sixes = 0;
  let critical: CheckCritical | undefined;

  for (const term of formula.terms) {
    if (term.kind === 'modifier') {
      const subtotal = term.sign * term.value;
      terms.push({ ...term, subtotal });
      total += subtotal;
      continue;
    }

    const rolls: number[] = [];
    for (let i = 0; i < term.count; i++) {
      const roll = rng(term.sides);
      rolls.push(roll);
      if (term.sides === 6 && term.sign === 1 && roll === 6) sixes++;
    }
    const subtotal = term.sign * rolls.reduce((sum, roll) => sum + roll, 0);
    terms.push({ ...term, rolls, subtotal });
    total += subtotal;

    // CP RED check rule: the single d10 explodes once (and only once).
    if (isCheck && term.sides === 10) {
      const natural = rolls[0]!;
      if (natural === 10) {
        const extraRoll = rng(10);
        critical = { type: 'crit', extraRoll };
        total += extraRoll;
      } else if (natural === 1) {
        const extraRoll = rng(10);
        critical = { type: 'fumble', extraRoll };
        total -= extraRoll;
      }
    }
  }

  return {
    notation: formatRollNotation(formula),
    terms,
    ...(critical ? { critical } : {}),
    criticalDamage: sixes >= 2,
    total,
  };
}

/**
 * Convenience for future consumers (character sheet, bots): a CP RED skill
 * check `1d10 + modifier` with the check rule applied.
 */
export function rollCheck(modifier: number, rng: DiceRng): RollResult {
  const terms: RollTerm[] = [{ kind: 'dice', sign: 1, count: 1, sides: 10 }];
  if (modifier !== 0) {
    terms.push({ kind: 'modifier', sign: modifier < 0 ? -1 : 1, value: Math.abs(modifier) });
  }
  return rollFormula({ terms }, rng);
}

/**
 * Deterministic RNG (mulberry32) for tests and previews. NOT for real rolls —
 * the server uses a crypto-based RNG.
 */
export function createSeededRng(seed: number): DiceRng {
  let state = seed >>> 0;
  return (sides) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return 1 + Math.floor(unit * sides);
  };
}
