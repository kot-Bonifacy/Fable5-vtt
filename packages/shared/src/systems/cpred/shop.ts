import {
  SHOP_TIERS,
  SHOP_TIER_MAX,
  SHOP_TIER_MIN,
  isShopTier,
  type CompendiumEntry,
  type ShopTier,
} from './compendium.js';
import { entryPrice } from './economy.js';

/**
 * Availability tiers of the shop (stage 25c).
 *
 * The wish behind the stage, in the GM's words: „chciałbym, żeby zakupy
 * startowe były ograniczone do najprostszych i najpopularniejszych przedmiotów
 * — proponuję podział dostępnych do kupna rzeczy na kilka poziomów, które MG
 * będzie mógł odblokowywać z czasem". That is a campaign mechanism, not a rule
 * of Cyberpunk RED, which is why the unlocked level sits on the campaign and
 * nothing here ever ends up on a character sheet.
 *
 * **Price is availability.** The rulebook's own bands already sort the
 * catalogue by how hard a thing is to come by — „Tanie" is what any kiosk has,
 * „Luksusowe" is what you go to a Fixer for (s. 342) — so the tier is derived
 * from the price for all ~180 entries at once and costs nobody a single click.
 * An entry may still carry its own `tier` when the GM disagrees about one item.
 *
 * The refusal lives **before** the money moves (see `economy:buy`): a bot acts
 * on the GM's account (stage 20a) and the GM is exempt from the block, which is
 * the same conclusion movement reached in `realtime/movement.ts:216`.
 */

export const SHOP_TIER_LABELS: Record<ShopTier, string> = {
  1: 'Uliczne',
  2: 'Zawodowe',
  3: 'Korporacyjne',
  4: 'Czarny rynek',
};

/** One line under the slider: what a tier actually opens up. */
export const SHOP_TIER_NOTES: Record<ShopTier, string> = {
  1: 'Do 50 ed — pistolet, nóż, kurtka skórzana, apteczka.',
  2: 'Do 500 ed — karabin, kamizelka, porządny sprzęt.',
  3: 'Do 1000 ed — broń ciężka, pancerz bojowy, dobra chromówka.',
  4: 'Powyżej 1000 ed — cały katalog, łącznie z luksusem.',
};

/** Tier the starting purchases of the character creator are held to. */
export const CREATION_SHOP_TIER: ShopTier = SHOP_TIER_MIN;

/**
 * Highest price each tier still carries. Read as a ladder: everything up to 50
 * ed is street kit, everything above the last rung is the black market.
 */
const TIER_PRICE_CEILING: Record<Exclude<ShopTier, 4>, number> = { 1: 50, 2: 500, 3: 1000 };

/**
 * What tier this entry sits on: its own when it has one, otherwise the rung its
 * price puts it on. An entry with no price at all („Cena: —") lands on tier 1
 * and is refused later for having no price — a row nobody finished typing must
 * not become a black-market rarity by accident.
 */
export function shopTierOf(
  entry: Pick<CompendiumEntry, 'cost' | 'costCategory' | 'tier'>,
): ShopTier {
  if (entry.tier !== undefined && isShopTier(entry.tier)) return entry.tier;
  return shopTierForPrice(entryPrice(entry));
}

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
  entry: Pick<CompendiumEntry, 'cost' | 'costCategory' | 'tier'>,
  unlocked: ShopTier,
): boolean {
  return shopTierOf(entry) <= unlocked;
}

/** „Poziom 3 (Korporacyjne) — kampania ma odblokowany 1 (Uliczne)." */
export function shopTierRefusalText(entryTier: ShopTier, unlocked: ShopTier): string {
  return (
    `Poziom ${entryTier} (${SHOP_TIER_LABELS[entryTier]}) — kampania ma odblokowany ` +
    `${unlocked} (${SHOP_TIER_LABELS[unlocked]}).`
  );
}
