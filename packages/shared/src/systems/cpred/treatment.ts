/**
 * Leczenie Ran Krytycznych (stage 30b, s. 187–188 and s. 149).
 *
 * Until this stage a Critical Injury could only be *taken*. It came off when a
 * timer ran out (16h) or when the GM pressed „Cofnij" — there was no way to
 * treat one, which meant the sentence the whole Medyk Role is built around,
 * „Chirurgia jest dostępna tylko dla Medyków w ramach Zdolności Specjalnej
 * Medycyna", named a door with no room behind it.
 *
 * The rulebook prints the treatment of every injury as one short sentence in
 * the table („Ratownictwo medyczne PT 15 lub Chirurgia PT 13"), and that
 * sentence is parsed here rather than turned into a structured field by the
 * importer. Two reasons, both learned the hard way:
 *
 *  - the generated compendium in `data/private/` is routinely **older than the
 *    parser** (POSTEP, 29.08), so a new field would be silently missing on
 *    exactly the machines that matter;
 *  - a GM who types their own injury row types the same sentence, and one
 *    reader means their row works like a printed one with no extra form field.
 *
 * The grammar is small enough to be honest about: a list of „<Umiejętność> [PT
 * <n>]" joined by „lub", where a branch with no PT of its own shares the next
 * one — which is how „Ratownictwo medyczne lub Chirurgia PT 13" reads at the
 * table. „Nd." is no treatment at all, and „Łatanie trwale usuwa Efekt tej
 * Rany" hands the job to the quick-fix sentence instead.
 */

import {
  CPRED_CARE_MODE_LABELS,
  type CpredCareMode,
  type CpredCharacterData,
  type CpredRegistry,
} from './character.js';
import { CPRED_FIRST_AID_SKILL_ID, CPRED_PARAMEDIC_SKILL_ID } from './rolls.js';
import {
  cpredMedicineSkillLevel,
  cpredRoleAbilityRank,
  CPRED_MEDICINE_ABILITY,
  type CpredRoleSheet,
} from './roleability.js';

// Both live beside the injury row they describe; re-exported here because this
// is where every reader of the two sentences already looks.
export { CPRED_CARE_MODE_LABELS, type CpredCareMode };

/** The Medyk-only skill id, which is not in the registry at all (s. 149). */
export const CPRED_SURGERY_SKILL_ID = 'medicine.surgery';

/** One branch of a treatment sentence: a skill and the DV it has to beat. */
export interface CpredCareOption {
  /** Registry skill id, or `medicine.surgery` for the Medyk-only one. */
  skillId: string;
  name: string;
  dv: number;
  /** True for Chirurgia: only a Medyk who bought the Specialty may roll it. */
  medicOnly: boolean;
}

interface CareSkill {
  skillId: string;
  name: string;
  medicOnly: boolean;
  /** Lower-case needles the printed sentence may use for this skill. */
  needles: readonly string[];
}

const CARE_SKILLS: readonly CareSkill[] = [
  {
    skillId: CPRED_SURGERY_SKILL_ID,
    name: 'Chirurgia',
    medicOnly: true,
    needles: ['chirurgia', 'chirurgii'],
  },
  {
    skillId: CPRED_PARAMEDIC_SKILL_ID,
    name: 'Ratownictwo medyczne',
    medicOnly: false,
    needles: ['ratownictwo medyczne', 'ratownictwa medycznego'],
  },
  {
    skillId: CPRED_FIRST_AID_SKILL_ID,
    name: 'Pierwsza pomoc',
    medicOnly: false,
    needles: ['pierwsza pomoc', 'pierwszej pomocy'],
  },
];

/** „Łatanie trwale usuwa Efekt tej Rany" — treatment defers to the quick fix. */
const PATCH_IS_PERMANENT = 'łatanie';

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parses one printed sentence into the branches it offers.
 *
 * Returns an empty list for „Nd." and for anything it cannot read — a sentence
 * the VTT does not understand must not become a roll nobody can justify. The
 * sentence itself stays on the card either way, so the table can still play it.
 */
export function cpredParseCare(text: string | undefined): CpredCareOption[] {
  if (!text) return [];
  const clean = normalize(text);
  if (/^nd\.?$/i.test(clean)) return [];

  const branches = clean.split(/\s+lub\s+/i);
  const parsed = branches.map((branch) => {
    const lower = branch.toLowerCase();
    const skill = CARE_SKILLS.find((entry) => entry.needles.some((n) => lower.includes(n))) ?? null;
    const match = /\bpt\s*(\d{1,2})\b/i.exec(branch);
    return { skill, dv: match ? Number(match[1]) : null };
  });

  // „Ratownictwo medyczne lub Chirurgia PT 13": a branch with no number of its
  // own borrows the next one that has it — the table prints the shared DV once.
  const options: CpredCareOption[] = [];
  parsed.forEach((branch, index) => {
    if (!branch.skill) return;
    const dv = branch.dv ?? parsed.slice(index + 1).find((later) => later.dv !== null)?.dv ?? null;
    if (dv === null) return;
    options.push({
      skillId: branch.skill.skillId,
      name: branch.skill.name,
      dv,
      medicOnly: branch.skill.medicOnly,
    });
  });
  return options;
}

/** The two printed sentences an injury row carries, as far as this module cares. */
export interface CpredCareTexts {
  quickFix?: string;
  treatment?: string;
}

/**
 * What may be rolled to take this injury off for good.
 *
 * Three of the twenty-two printed injuries say „Łatanie trwale usuwa Efekt tej
 * Rany" instead of naming a treatment: for those the quick-fix sentence *is*
 * the treatment, which is why this reads both fields rather than one.
 */
export function cpredTreatmentOptions(row: CpredCareTexts): CpredCareOption[] {
  const treatment = row.treatment ? normalize(row.treatment) : '';
  if (treatment.toLowerCase().includes(PATCH_IS_PERMANENT)) {
    return cpredParseCare(row.quickFix);
  }
  return cpredParseCare(treatment);
}

/**
 * What may be rolled in this mode — the quick fix reads its own sentence.
 *
 * „Łatanie niweluje efekt rany do końca dnia … Każda próba zajmuje minutę"
 * (s. 223): a different sentence, a different DV, and on half the table a
 * skill a non-Medyk actually has. A wound whose quick fix is „Nd." (a severed
 * arm) offers nothing here, and that is the rule rather than a gap.
 */
export function cpredCareOptions(row: CpredCareTexts, mode: CpredCareMode): CpredCareOption[] {
  return mode === 'quickFix' ? cpredParseCare(row.quickFix) : cpredTreatmentOptions(row);
}

/**
 * Does a success in this mode take the wound off for good?
 *
 * Always, for „Leczenie". For „Łatanie" only on the three rows that say so
 * outright — „Łatanie trwale usuwa Efekt tej Rany" is printed instead of a
 * treatment, and on those rows the field patch *is* the cure. Everywhere else
 * the quick fix only silences the effect until the end of the day, which is
 * `patched` on the row rather than a row removed.
 */
export function cpredCarePermanent(row: CpredCareTexts, mode: CpredCareMode): boolean {
  if (mode === 'treatment') return true;
  const treatment = row.treatment ? normalize(row.treatment) : '';
  return treatment.toLowerCase().includes(PATCH_IS_PERMANENT);
}

/**
 * Why this healer may not take that branch, or null when they may.
 *
 * The only gate the rules put here is the Medyk's: „Umiejętność ta dostępna
 * jest tylko Medykom poprzez ich Zdolność Specjalną" (s. 149). A Medyk who
 * spent every point on Farmaceutyki never opened that door either — the
 * Specialty is the door, not the Role — so the refusal names the Specialty
 * rather than the Role, which is the part a player can act on.
 */
export function cpredCareRefusal(
  option: CpredCareOption,
  data: CpredRoleSheet & Pick<CpredCharacterData, 'medicine'>,
  registry: CpredRegistry,
): string | null {
  if (!option.medicOnly) return null;
  if (cpredRoleAbilityRank(data, registry, CPRED_MEDICINE_ABILITY) === null) {
    return 'Chirurgia jest dostępna tylko Medykom w ramach Zdolności Specjalnej Medycyna.';
  }
  if (cpredMedicineSkillLevel(data, registry, CPRED_SURGERY_SKILL_ID) < 1) {
    return 'Ten Medyk nie ma ani jednego punktu w Specjalizacji Chirurgia.';
  }
  return null;
}

/** „Ratownictwo medyczne PT 15 lub Chirurgia PT 13" — the card's own line. */
export function describeCareOptions(options: readonly CpredCareOption[]): string {
  if (options.length === 0) return 'brak drogi leczenia';
  return options.map((option) => `${option.name} PT ${option.dv}`).join(' lub ');
}
