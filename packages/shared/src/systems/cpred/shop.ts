import {
  SHOP_TIERS,
  SHOP_TIER_MAX,
  SHOP_TIER_MIN,
  isShopTier,
  type CompendiumEntry,
  type CompendiumRegistry,
  type ShopTier,
} from './compendium.js';
import { CYBERWARE_TYPE_LABELS } from './cyberware.js';
import { entryPrice } from './economy.js';
import { cpredCatalogPriceScale, formatEddies } from './pricing.js';
import { NET_PROGRAM_CLASS_LABELS } from './netrunning.js';

/**
 * Availability tiers of the shop (stage 25c, reworked in naprawa 3b).
 *
 * The wish behind the stage, in the GM's words: „chciałbym, żeby zakupy
 * startowe były ograniczone do najprostszych i najpopularniejszych przedmiotów
 * — proponuję podział dostępnych do kupna rzeczy na kilka poziomów, które MG
 * będzie mógł odblokowywać z czasem". That is a campaign mechanism, not a rule
 * of Cyberpunk RED, which is why the unlocked level sits on the campaign and
 * nothing here ever ends up on a character sheet.
 *
 * **Until 17.09 price was availability** — and it put a rocket launcher, a
 * Sandevistan and biotoxin rounds on the same rung as a video camera, and Black
 * ICE at 50 ed on the street. The GM's call (17.09): the tier says how *legal*
 * a thing is, read off what the thing **is** — weapon type, armour SP, cyberware
 * family, Program class — with price only ever pushing it up. What the data
 * cannot tell apart (a poison vial from a flashlight: both are „gear") is
 * assigned by id in `shop-tiers.json`, which lives next to the private
 * catalogue because the list of ids is the rulebook's inventory.
 *
 * Who decides, strongest first (`shopTierVerdict`):
 *  1. the GM, per campaign, on the entry's card (`overrides`);
 *  2. the entry itself (`tier`: the private assignment file, or a GM's own entry);
 *  3. the rule for its kind, raised by price;
 *  4. the old price ladder, for a kind the rules know nothing about.
 *
 * The refusal lives **before** the money moves (see `economy:buy`): a bot acts
 * on the GM's account (stage 20a) and the GM is exempt from the block, which is
 * the same conclusion movement reached in `realtime/movement.ts:216`.
 */

export const SHOP_TIER_LABELS: Record<ShopTier, string> = {
  1: 'Uliczne',
  2: 'Zawodowe',
  3: 'Wojskowe',
  4: 'Czarny rynek',
};

/** One line under the dial: what a tier actually opens up. */
export const SHOP_TIER_NOTES: Record<ShopTier, string> = {
  1: 'Legalne i cywilne — nóż, średni pistolet, kurtka skórzana, codzienny sprzęt, cybermoda.',
  2: 'Narzędzia fachu — ciężkie pistolety, strzelby, kurtki kuloodporne, skanery, zwykły chrom.',
  3: 'Sprzęt bojowy — karabiny, granatniki, ciężkie pancerze, bojowy chrom i amunicja, agresorzy.',
  4: 'Nielegalne i egzotyczne — wyrzutnie, trucizny, Czarny LOD, Borgizacje, luksus.',
};

/** Tier the starting purchases of the character creator are held to. */
export const CREATION_SHOP_TIER: ShopTier = SHOP_TIER_MIN;

/**
 * Highest tier a Role's own tools may reach in the creator (naprawa 3b, the GM's
 * call): a Netrunner buys a deck and a Medyk a medbag at session zero, but
 * nobody's trade opens the military shelf.
 */
export const CREATION_ROLE_TOOL_TIER: ShopTier = 2;

// ───────────────────────────── rule by kind ─────────────────────────────

/**
 * Weapon types by how legal they are to carry (GM's table, 17.09). Keyed by the
 * catalogue's type ids, which are generic names, not rulebook text. A type
 * missing here falls through to the price ladder.
 */
const WEAPON_TYPE_TIERS: Readonly<Record<string, ShopTier>> = {
  'weapon-type.brawling': 1,
  'weapon-type.martial-arts': 1,
  'weapon-type.light-melee': 1,
  'weapon-type.medium-melee': 1,
  'weapon-type.heavy-melee': 1,
  'weapon-type.medium-pistol': 1,
  'weapon-type.heavy-pistol': 2,
  'weapon-type.very-heavy-pistol': 2,
  'weapon-type.submachine-gun': 2,
  'weapon-type.shotgun': 2,
  'weapon-type.bow': 2,
  'weapon-type.crossbow': 2,
  'weapon-type.very-heavy-melee': 2,
  'weapon-type.heavy-submachine-gun': 3,
  'weapon-type.assault-rifle': 3,
  'weapon-type.sniper-rifle': 3,
  'weapon-type.grenade-launcher': 3,
  'weapon-type.grenade': 3,
  'weapon-type.rocket-launcher': 4,
  'weapon-type.flamethrower': 4,
};

/** Armour by Stopping Power: street leather, work jackets, combat plate, Metalgear. */
function armorTier(sp: number): ShopTier {
  if (sp <= 7) return 1;
  if (sp <= 12) return 2;
  if (sp <= 15) return 3;
  return 4;
}

/**
 * Price that lifts anything to at least Zawodowe — „Bardzo kosztowne". Progi
 * i drabina niżej są **w cenach podręcznika**: od etapu 47a cena wpisu jest
 * w cenniku domowym, więc porównuje się ją podzieloną przez mnożnik wpisu
 * (`rulebookPrice`) — pistolet za 1000 ed i nóż za 50 ed lądują na tych
 * samych poziomach co przed przelicznikiem.
 */
const PRICE_FLOOR_PROFESSIONAL = 1000;
/** Price that makes anything black market — „Luksusowe" and above. */
const PRICE_FLOOR_BLACK_MARKET = 5000;

/** Cena wpisu cofnięta do podręcznika — to ją mierzą progi poziomów. */
function rulebookPrice(entry: CompendiumEntry): number | null {
  const price = entryPrice(entry);
  return price === null ? null : price / cpredCatalogPriceScale(entry);
}

export interface ShopTierContext {
  /** Name of a weapon type for the reason line; the tier never needs it. */
  weaponTypeName?: (weaponTypeId: string) => string | undefined;
  /** The GM's per-campaign choices, by entry id (`Campaign.shopTierOverrides`). */
  overrides?: Readonly<Record<string, ShopTier>>;
}

/** Who put the entry on its rung — the card says it, so the GM knows what to change. */
export type ShopTierSource = 'campaign' | 'entry' | 'kind' | 'price';

export interface ShopTierVerdict {
  tier: ShopTier;
  source: ShopTierSource;
  /** „typ broni: Karabin szturmowy", „OB 13 · cena 5000 ed podnosi poziom". */
  reason: string;
}

/** The rung the entry's kind puts it on, before price; null = no rule for it. */
function kindTier(
  e: CompendiumEntry,
  context: ShopTierContext,
): { tier: ShopTier; reason: string } | null {
  switch (e.category) {
    case 'weapon': {
      if (!e.weaponTypeId) return null;
      const base = WEAPON_TYPE_TIERS[e.weaponTypeId];
      if (base === undefined) return null;
      const name = context.weaponTypeName?.(e.weaponTypeId) ?? e.weaponTypeId;
      if (e.quality === 'excellent' && base < SHOP_TIER_MAX) {
        return {
          tier: (base + 1) as ShopTier,
          reason: `typ broni: ${name} · doskonała jakość +1`,
        };
      }
      return { tier: base, reason: `typ broni: ${name}` };
    }
    case 'armor':
      return { tier: armorTier(e.sp), reason: `OB ${e.sp}` };
    case 'cyberware': {
      if (!e.type) return null;
      const tier: ShopTier = e.type === 'fashionware' ? 1 : e.type === 'borgware' ? 4 : 2;
      return { tier, reason: `rodzina: ${CYBERWARE_TYPE_LABELS[e.type]}` };
    }
    case 'program':
      if (e.blackIce) return { tier: 4, reason: 'Czarny LOD' };
      return {
        tier: e.programClass === 'attacker' ? 3 : 2,
        reason: `program: ${NET_PROGRAM_CLASS_LABELS[e.programClass]}`,
      };
    case 'netDefense':
      return { tier: 3, reason: 'system obronny Sieci' };
    case 'gear':
      if (e.deckSlots || e.deckSlotCost) return { tier: 2, reason: 'sprzęt cyberdeku' };
      return null;
    case 'criticalInjury':
      return { tier: SHOP_TIER_MIN, reason: 'to nie towar' };
    default:
      return null;
  }
}

/**
 * Where this entry sits and why. Explicit choices (the GM's, then the entry's)
 * are taken as they are; a rule by kind is lifted by price; a kind without a
 * rule falls back on the price ladder of stage 25c.
 */
export function shopTierVerdict(
  entry: CompendiumEntry,
  context: ShopTierContext = {},
): ShopTierVerdict {
  const chosen = context.overrides?.[entry.id];
  if (chosen !== undefined && isShopTier(chosen)) {
    return { tier: chosen, source: 'campaign', reason: 'ustawione przez MG w tej kampanii' };
  }
  if (entry.tier !== undefined && isShopTier(entry.tier)) {
    return { tier: entry.tier, source: 'entry', reason: 'przypisane w danych kompendium' };
  }
  const price = entryPrice(entry);
  const bookPrice = rulebookPrice(entry);
  const kind = kindTier(entry, context);
  if (kind) {
    const floor: ShopTier =
      bookPrice !== null && bookPrice >= PRICE_FLOOR_BLACK_MARKET
        ? 4
        : bookPrice !== null && bookPrice >= PRICE_FLOOR_PROFESSIONAL
          ? 2
          : SHOP_TIER_MIN;
    if (floor > kind.tier && price !== null) {
      return {
        tier: floor,
        source: 'kind',
        reason: `${kind.reason} · cena ${formatEddies(price)} ed podnosi poziom`,
      };
    }
    return { tier: kind.tier, source: 'kind', reason: kind.reason };
  }
  return {
    tier: shopTierForPrice(bookPrice),
    source: 'price',
    reason:
      price === null
        ? 'brak reguły dla tego rodzaju i brak ceny'
        : `cena ${formatEddies(price)} ed — brak reguły dla tego rodzaju`,
  };
}

/** What tier this entry sits on — `shopTierVerdict` without the explanation. */
export function shopTierOf(entry: CompendiumEntry, context: ShopTierContext = {}): ShopTier {
  return shopTierVerdict(entry, context).tier;
}

/**
 * Highest price each tier still carries under the old ladder, kept for kinds
 * the rules cannot read — in rulebook eddies (`rulebookPrice`). An entry with no price at all („Cena: —") lands on tier
 * 1 and is refused later for having no price — a row nobody finished typing
 * must not become a black-market rarity by accident.
 */
const TIER_PRICE_CEILING: Record<Exclude<ShopTier, 4>, number> = { 1: 50, 2: 500, 3: 1000 };

export function shopTierForPrice(price: number | null): ShopTier {
  if (price === null) return SHOP_TIER_MIN;
  for (const tier of SHOP_TIERS) {
    if (tier === SHOP_TIER_MAX) break;
    const ceiling = TIER_PRICE_CEILING[tier as Exclude<ShopTier, 4>];
    if (price <= ceiling) return tier;
  }
  return SHOP_TIER_MAX;
}

/** Clamps whatever the database or a client sent into a usable tier. */
export function clampShopTier(value: unknown): ShopTier {
  if (isShopTier(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(SHOP_TIER_MAX, Math.max(SHOP_TIER_MIN, Math.round(value))) as ShopTier;
  }
  return SHOP_TIER_MIN;
}

/** True when the campaign's unlocked level reaches this entry. */
export function entryWithinTier(
  entry: CompendiumEntry,
  unlocked: ShopTier,
  context: ShopTierContext = {},
): boolean {
  return shopTierOf(entry, context) <= unlocked;
}

/** „Poziom 3 (Wojskowe) — kampania ma odblokowany 1 (Uliczne)." */
export function shopTierRefusalText(entryTier: ShopTier, unlocked: ShopTier): string {
  return (
    `Poziom ${entryTier} (${SHOP_TIER_LABELS[entryTier]}) — kampania ma odblokowany ` +
    `${unlocked} (${SHOP_TIER_LABELS[unlocked]}).`
  );
}

/**
 * The GM's per-campaign choices as stored in `Campaign.shopTierOverrides`.
 * Anything that is not an id → tier pair is dropped: a stray value must not
 * lock the shop, and an id the catalogue lost is harmless.
 */
export function readShopTierOverrides(raw: unknown): Record<string, ShopTier> {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const overrides: Record<string, ShopTier> = {};
  for (const [id, tier] of Object.entries(value as Record<string, unknown>)) {
    if (id.length > 0 && isShopTier(tier)) overrides[id] = tier;
  }
  return overrides;
}

// ───────────────────── assignments file and Role tools ─────────────────────

/** What one Role may buy above street level in the creator. */
export interface CpredShopRoleTools {
  /** Every weapon of these types counts — the plain row and the branded ones. */
  weaponTypes: string[];
  /** Single catalogue entries: a medbag, a deck, a jacket. */
  entries: string[];
}

/**
 * `shop-tiers.json` — the half of the availability table the data cannot
 * derive (naprawa 3b). Public sample in `data/public/cpred`, the group's real
 * one in `data/private/cpred`, private read last and winning per key.
 */
export interface CpredShopRules {
  /** Entry id → tier, for gear, ammunition, attachments and exceptions. */
  tiers: Record<string, ShopTier>;
  /** Role id (`roles.json`) → its tools. */
  roleTools: Record<string, CpredShopRoleTools>;
}

export const EMPTY_SHOP_RULES: CpredShopRules = { tiers: {}, roleTools: {} };

function readIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Reads one `shop-tiers.json`; junk is dropped and reported, never thrown. */
export function parseShopRules(raw: unknown): { rules: CpredShopRules; issues: string[] } {
  const issues: string[] = [];
  const rules: CpredShopRules = { tiers: {}, roleTools: {} };
  if (typeof raw !== 'object' || raw === null) {
    return { rules, issues: ['Plik nie jest obiektem JSON.'] };
  }
  const file = raw as { tiers?: unknown; roleTools?: unknown };
  if (typeof file.tiers === 'object' && file.tiers !== null) {
    for (const [id, tier] of Object.entries(file.tiers as Record<string, unknown>)) {
      if (isShopTier(tier)) rules.tiers[id] = tier;
      else issues.push(`tiers.${id}: poziom musi być liczbą 1–4.`);
    }
  }
  if (typeof file.roleTools === 'object' && file.roleTools !== null) {
    for (const [roleId, tools] of Object.entries(file.roleTools as Record<string, unknown>)) {
      if (typeof tools !== 'object' || tools === null) {
        issues.push(`roleTools.${roleId}: oczekiwano obiektu.`);
        continue;
      }
      const { weaponTypes, entries } = tools as { weaponTypes?: unknown; entries?: unknown };
      rules.roleTools[roleId] = {
        weaponTypes: readIdList(weaponTypes),
        entries: readIdList(entries),
      };
    }
  }
  return { rules, issues };
}

/** Private over public: per entry id for tiers, per whole Role for its tools. */
export function mergeShopRules(base: CpredShopRules, over: CpredShopRules): CpredShopRules {
  return {
    tiers: { ...base.tiers, ...over.tiers },
    roleTools: { ...base.roleTools, ...over.roleTools },
  };
}

/**
 * Writes the file's assignments onto the catalogue entries as their own `tier`,
 * so the server's refusal, the client's list and every lookup read one field.
 * An id the catalogue does not know is ignored — the file may outlive a row.
 */
export function withShopTiers(
  registry: CompendiumRegistry,
  tiers: Readonly<Record<string, ShopTier>>,
): CompendiumRegistry {
  if (Object.keys(tiers).length === 0) return registry;
  const entries = registry.entries.map((entry) => {
    const tier = tiers[entry.id];
    return tier === undefined ? entry : { ...entry, tier };
  });
  return { ...registry, entries, entryById: new Map(entries.map((entry) => [entry.id, entry])) };
}

/** True when this entry is one of the Role's tools. */
export function isCpredRoleTool(
  entry: CompendiumEntry,
  tools: CpredShopRoleTools | undefined,
): boolean {
  if (!tools) return false;
  if (tools.entries.includes(entry.id)) return true;
  return (
    entry.category === 'weapon' &&
    entry.weaponTypeId !== null &&
    tools.weaponTypes.includes(entry.weaponTypeId)
  );
}

export interface CreationShopRules extends ShopTierContext {
  roleTools: Readonly<Record<string, CpredShopRoleTools>>;
}

export interface CreationShopVerdict {
  /** On the creator's shelf: street level, or a tool of this Role up to its cap. */
  allowed: boolean;
  tier: ShopTier;
  /** Only a tool that needed the exception to be on the shelf. */
  roleTool: boolean;
}

/** May a draft of this Role put the entry in its starting basket? */
export function creationShopVerdict(
  entry: CompendiumEntry,
  roleId: string | null,
  rules: CreationShopRules,
): CreationShopVerdict {
  const tier = shopTierOf(entry, rules);
  if (tier <= CREATION_SHOP_TIER) return { allowed: true, tier, roleTool: false };
  const tool = roleId !== null && isCpredRoleTool(entry, rules.roleTools[roleId]);
  return { allowed: tool && tier <= CREATION_ROLE_TOOL_TIER, tier, roleTool: tool };
}

/** „Poziom 2 (Zawodowe) — w kreatorze tylko Uliczne i narzędzia własnej Roli." */
export function creationShopRefusalText(entryTier: ShopTier, roleTool: boolean): string {
  const label = `Poziom ${entryTier} (${SHOP_TIER_LABELS[entryTier]})`;
  if (roleTool) {
    return (
      `${label} — narzędzia Roli kreator sprzedaje najwyżej do poziomu ` +
      `${CREATION_ROLE_TOOL_TIER} (${SHOP_TIER_LABELS[CREATION_ROLE_TOOL_TIER]}).`
    );
  }
  return (
    `${label} — w kreatorze tylko ${SHOP_TIER_LABELS[CREATION_SHOP_TIER]} ` +
    'i narzędzia własnej Roli.'
  );
}
