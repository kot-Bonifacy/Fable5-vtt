/**
 * Statblok z okna „Nowa postać” (etap 49a) — karta NPC-a bez kreatora.
 *
 * MG (10.10): kreator jest za długi na gangera, który pada po trzech
 * strzałach, a jednowierszowy formularz dawał pustą kartę do wypełnienia
 * pole po polu. Okno pyta o to, co drukuje statblok podręcznika — dziesięć
 * Cech, PW, pancerz na głowie i tułowiu, broń, kilka Umiejętności — i zapisuje
 * to do **zwykłej karty**. Nie ma tu kategorii „statysta”: karta, która z tego
 * wychodzi, rozwija się na pełnej karcie jak każda inna (umowa 38a).
 *
 * Wejście naprawia się zawsze i nigdy nie odmawia (`sanitizeNpcInput`), jak
 * szybki edytor figury: „ten ganger ma REF 0” jest przy stole gorsze niż
 * „ten ganger ma domyślny REF”.
 */

import { humanityMax } from './derived.js';
import { isValidCompendiumId } from './ids.js';
import {
  CPRED_STAT_IDS,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  type CpredStats,
} from './stats.js';
import {
  createDefaultCharacterData,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredWeaponRow,
} from './character.js';
import {
  isArmorEntry,
  isWeaponEntry,
  resolveWeapon,
  type CompendiumEntry,
  type CompendiumRegistry,
} from './compendium.js';
import { purchasedSheetRow } from './shopping.js';
import { CPRED_STATBLOCK_HP_MAX, cpredSheetHpMax, sanitizeStatBlock } from './statblock.js';
import { STATIST_DEFAULT_STAT, STATIST_SKILL_MAX } from './statist.js';

/** Najwięcej broni w statbloku — podręcznik drukuje dwie, trzy; cztery to zapas. */
export const CPRED_NPC_WEAPONS_MAX = 4;

/** Najwięcej Umiejętności w statbloku — ten sam limit co szybki edytor figury. */
export const CPRED_NPC_SKILLS_MAX = STATIST_SKILL_MAX;

/** Statblok NPC-a tak, jak go wypełnia okno „Nowa postać”. */
export interface CpredNpcInput {
  /** Rola z listy albo `null` — ganger Roli nie potrzebuje. */
  roleId: string | null;
  stats: CpredStats;
  /**
   * Wydrukowane PW (C-SWAT ma 35 przy BC 4). `null` = policz z BC i SW,
   * jak u każdej postaci.
   */
  hpMax: number | null;
  /** Id Umiejętności → poziom; reszta karty stoi na zerze. */
  skills: Record<string, number>;
  /** Wpisy broni z Kompendium, w kolejności na karcie. */
  weaponIds: string[];
  /** Pancerz na głowie i na tułowiu (s. 186) — wpis z Kompendium albo brak. */
  armorHeadId: string | null;
  armorBodyId: string | null;
}

/** Przeciętny człowiek z podręcznika: wszystko po 5, Unik 2. */
export function createDefaultNpcInput(): CpredNpcInput {
  return {
    roleId: null,
    stats: Object.fromEntries(
      CPRED_STAT_IDS.map((id) => [id, STATIST_DEFAULT_STAT]),
    ) as unknown as CpredStats,
    hpMax: null,
    skills: { evasion: 2 },
    weaponIds: [],
    armorHeadId: null,
    armorBodyId: null,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function compendiumIdOrNull(value: unknown): string | null {
  return typeof value === 'string' && isValidCompendiumId(value) ? value : null;
}

/**
 * Naprawia, co przysłał klient. Nieznana Umiejętność wypada po cichu (gdy
 * podano listę znanych), poziom 0 też — statblok wymienia to, co figura umie.
 */
export function sanitizeNpcInput(
  raw: unknown,
  known?: { skillIds?: ReadonlySet<string>; roleIds?: ReadonlySet<string> },
): CpredNpcInput {
  const base = createDefaultNpcInput();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;

  const rawStats =
    typeof input.stats === 'object' && input.stats !== null
      ? (input.stats as Record<string, unknown>)
      : {};
  const stats = { ...base.stats };
  for (const id of CPRED_STAT_IDS) {
    stats[id] = clampInt(rawStats[id], CPRED_STAT_MIN, CPRED_STAT_MAX, base.stats[id]);
  }

  const skills: Record<string, number> = {};
  if (typeof input.skills === 'object' && input.skills !== null) {
    for (const [id, level] of Object.entries(input.skills as Record<string, unknown>)) {
      if (Object.keys(skills).length >= CPRED_NPC_SKILLS_MAX) break;
      if (!isValidCompendiumId(id)) continue;
      if (known?.skillIds && !known.skillIds.has(id)) continue;
      const value = clampInt(level, SKILL_LEVEL_MIN, SKILL_LEVEL_MAX, 0);
      if (value > 0) skills[id] = value;
    }
  }

  const weaponIds = Array.isArray(input.weaponIds)
    ? input.weaponIds
        .map(compendiumIdOrNull)
        .filter((id): id is string => id !== null)
        .slice(0, CPRED_NPC_WEAPONS_MAX)
    : [];

  const roleId = compendiumIdOrNull(input.roleId);
  return {
    roleId: roleId && (!known?.roleIds || known.roleIds.has(roleId)) ? roleId : null,
    stats,
    hpMax:
      typeof input.hpMax === 'number' && Number.isFinite(input.hpMax)
        ? clampInt(input.hpMax, 1, CPRED_STATBLOCK_HP_MAX, 1)
        : null,
    skills,
    weaponIds,
    armorHeadId: compendiumIdOrNull(input.armorHeadId),
    armorBodyId: compendiumIdOrNull(input.armorBodyId),
  };
}

/**
 * Karta z tego statbloku.
 *
 * Broń i pancerz to te same wiersze co z zakupu i „Dodaj za darmo”
 * (`purchasedSheetRow`) — ganger z pistoletem i gracz z pistoletem trzymają
 * jeden rodzaj przedmiotu, więc łup z ciała działa bez tłumaczenia. Pancerz
 * leży tam, gdzie wskazał MG, bez względu na to, co wpis mówi o miejscu.
 * Wpis, którego nie ma albo który nie jest bronią/pancerzem, wypada po cichu.
 */
export function cpredNpcSheet(
  input: CpredNpcInput,
  compendium: Pick<CompendiumRegistry, 'entryById' | 'weaponTypeById'>,
  nextRowId: () => string,
): CpredCharacterData {
  const base = createDefaultCharacterData();
  const entry = (id: string | null): CompendiumEntry | undefined =>
    id === null ? undefined : compendium.entryById.get(id);

  const weapons: CpredWeaponRow[] = [];
  for (const id of input.weaponIds) {
    const found = entry(id);
    if (!found || !isWeaponEntry(found)) continue;
    const built = purchasedSheetRow(found, resolveWeapon(found, compendium), nextRowId());
    if (built?.list === 'weapons') weapons.push(built.row);
  }

  const armor: CpredArmorRow[] = [];
  for (const [location, id] of [
    ['head', input.armorHeadId],
    ['body', input.armorBodyId],
  ] as const) {
    const found = entry(id);
    if (!found || !isArmorEntry(found)) continue;
    const built = purchasedSheetRow(found, null, nextRowId());
    if (built?.list === 'armor') armor.push({ ...built.row, location });
  }

  const data: CpredCharacterData = {
    ...base,
    roleId: input.roleId,
    stats: { ...input.stats },
    statBlock: input.hpMax === null ? null : sanitizeStatBlock({ hpMax: input.hpMax }),
    skills: { ...input.skills },
    weapons,
    armor,
    luckCurrent: input.stats.luck,
    humanityCurrent: humanityMax(input.stats),
  };
  return { ...data, hpCurrent: cpredSheetHpMax(data) };
}
