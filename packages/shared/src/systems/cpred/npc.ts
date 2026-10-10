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

import type { DiceRng } from '../../dice.js';
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
  ROLE_RANK_MAX,
  ROLE_RANK_MIN,
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
import { creationTemplateStat, type CpredCreationData } from './creation.js';
import { purchasedSheetRow } from './shopping.js';
import { CPRED_STATBLOCK_HP_MAX, cpredSheetHpMax, sanitizeStatBlock } from './statblock.js';
import { STATIST_DEFAULT_STAT, STATIST_SKILL_MAX } from './statist.js';

/** Najwięcej broni w statbloku — podręcznik drukuje dwie, trzy; cztery to zapas. */
export const CPRED_NPC_WEAPONS_MAX = 4;

/**
 * Najwięcej Umiejętności w statbloku. Szybki edytor figury trzyma 20, a pakiet
 * Ulicznika ma ich dokładnie tyle (etap 49b) — zapas, żeby MG mógł dopisać
 * losowemu NPC-owi coś spoza listy Roli.
 */
export const CPRED_NPC_SKILLS_MAX = STATIST_SKILL_MAX + 4;

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
  /** Tarcza kuloodporna (etap 49b — Solo, Medyk i Stróż Prawa mają ją w pakiecie). */
  armorShieldId: string | null;
  /** Ranga Zdolności Roli; `null` = najniższa. Losowy NPC dostaje startową (4). */
  roleRank: number | null;
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
    armorShieldId: null,
    roleRank: null,
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
    armorShieldId: compendiumIdOrNull(input.armorShieldId),
    roleRank:
      typeof input.roleRank === 'number' && Number.isFinite(input.roleRank)
        ? clampInt(input.roleRank, ROLE_RANK_MIN, ROLE_RANK_MAX, ROLE_RANK_MIN)
        : null,
  };
}

/**
 * Karta z tego statbloku.
 *
 * Broń i pancerz to te same wiersze co z zakupu i „Dodaj za darmo”
 * (`purchasedSheetRow`) — ganger z pistoletem i gracz z pistoletem trzymają
 * jeden rodzaj przedmiotu, więc łup z ciała działa bez tłumaczenia. Pancerz
 * leży tam, gdzie wskazał MG, bez względu na to, co wpis mówi o miejscu —
 * poza tarczą: w jej polu staje tylko wpis, który jest tarczą (etap 49b).
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
    ['shield', input.armorShieldId],
  ] as const) {
    const found = entry(id);
    if (!found || !isArmorEntry(found)) continue;
    if (location === 'shield' && !found.locations.includes('shield')) continue;
    const built = purchasedSheetRow(found, null, nextRowId());
    if (built?.list === 'armor') armor.push({ ...built.row, location });
  }

  const data: CpredCharacterData = {
    ...base,
    roleId: input.roleId,
    ...(input.roleId !== null && input.roleRank !== null
      ? { roleAbilityRank: input.roleRank }
      : {}),
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

/* ───────────────────────── losowy NPC z Roli (etap 49b) ───────────────────────── */

/**
 * Ile razy rozrzut przesuwa poziom z jednej Umiejętności Roli na drugą.
 * MG (10.10): „Ulicznik + rozrzut” — tabela podręcznika jako baza, a kilka
 * punktów rozrzuconych, żeby pięciu gangerów z jednej Roli nie było klonami.
 */
export const CPRED_NPC_RANDOM_SHIFTS = 6;

/** Wynik losowania — formularz okna dostaje `input`, karta czatu MG resztę. */
export interface CpredRandomNpc {
  input: CpredNpcInput;
  /** Wiersz tabeli Cech Roli (1k10). */
  row: number;
  /** Co rozrzut zmienił względem tabeli Ulicznika: id → różnica poziomów. */
  shifted: Record<string, number>;
  /** Każdy slot pakietu: alternatywy i to, co wypadło (`null` — slot pusty). */
  picks: { options: (string | null)[]; chosen: string | null }[];
}

/**
 * Losowy NPC z Roli (etap 49b, decyzje MG z 10.10): 1k10 wybiera wiersz Cech
 * z tabeli Roli (metoda Ulicznika, s. 73–77), Umiejętności to tabela Ulicznika
 * z rozrzutem, a broń, pancerz i tarcza — pakiet Roli z s. 98 z losowanymi
 * alternatywami „lub”. Rzuca wstrzyknięty RNG, więc serwer losuje, a testy
 * podstawiają kości.
 *
 * Rozrzut zostawia koszt Krawędziarza (86 punktów) i widełki kreatora (2–6):
 * poziom przechodzi tylko między Umiejętnościami tej samej ceny, więc (×2)
 * wymienia się wyłącznie z (×2). Darmowy Język ojczysty stoi poza rozrzutem
 * i wchodzi na koniec na swoim poziomie (s. 45), jak w kreatorze.
 *
 * `null`, gdy Rola nie ma pełnej tabeli Cech albo pakietu — serwer wtedy
 * odmawia, zamiast budować pół NPC-a.
 */
export function cpredRandomNpc(
  roleId: string,
  data: Pick<
    CpredCreationData,
    'roles' | 'statOrder' | 'streetrat' | 'limits' | 'freeLanguage' | 'roleAbilityStart'
  >,
  skillMultipliers: ReadonlyMap<string, number>,
  lookup: (entryId: string) => CompendiumEntry | undefined,
  rng: DiceRng,
): CpredRandomNpc | null {
  const role = data.roles.find((entry) => entry.id === roleId);
  const kit = data.streetrat[roleId];
  if (!role || !kit || role.statTemplates.length === 0) return null;

  const row = rng(role.statTemplates.length);
  const stats = { ...createDefaultNpcInput().stats };
  for (const id of CPRED_STAT_IDS) {
    const value = creationTemplateStat(role, data, id, row);
    if (value !== null) stats[id] = value;
  }

  const free = data.freeLanguage;
  const skills: Record<string, number> = { ...kit.skills };
  const cost = (id: string) => skillMultipliers.get(id) ?? 1;
  const movable = Object.keys(skills).filter((id) => id !== free?.skillId);
  for (let shift = 0; shift < CPRED_NPC_RANDOM_SHIFTS; shift++) {
    const donors = movable.filter((id) => skills[id]! > data.limits.skillMin);
    if (donors.length === 0) break;
    const donor = donors[rng(donors.length) - 1]!;
    const takers = movable.filter(
      (id) => id !== donor && cost(id) === cost(donor) && skills[id]! < data.limits.skillMax,
    );
    if (takers.length === 0) continue;
    const taker = takers[rng(takers.length) - 1]!;
    skills[donor] = skills[donor]! - 1;
    skills[taker] = skills[taker]! + 1;
  }
  const shifted: Record<string, number> = {};
  for (const [id, level] of Object.entries(skills)) {
    const delta = level - (kit.skills[id] ?? 0);
    if (delta !== 0) shifted[id] = delta;
  }
  if (free) skills[free.skillId] = Math.max(skills[free.skillId] ?? 0, free.level);

  const input: CpredNpcInput = {
    ...createDefaultNpcInput(),
    roleId,
    stats,
    skills,
    armorHeadId: kit.armor.head,
    armorBodyId: kit.armor.body,
    roleRank: data.roleAbilityStart,
  };
  const picks: CpredRandomNpc['picks'] = [];
  for (const options of kit.items) {
    const chosen = options.length === 1 ? options[0]! : options[rng(options.length) - 1]!;
    picks.push({ options, chosen });
    const found = chosen === null ? undefined : lookup(chosen);
    if (!found) continue;
    if (isArmorEntry(found) && found.locations.includes('shield')) {
      input.armorShieldId ??= found.id;
    } else if (isWeaponEntry(found) && input.weaponIds.length < CPRED_NPC_WEAPONS_MAX) {
      input.weaponIds.push(found.id);
    }
  }
  return { input, row, shifted, picks };
}
