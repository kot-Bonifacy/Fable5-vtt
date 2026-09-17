import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { EMPTY_SHOP_RULES, mergeShopRules, parseShopRules, type CpredShopRules } from '@vtt/shared';

/**
 * Loads `cpred/shop-tiers.json` (naprawa 3b) — the availability assignments the
 * catalogue cannot derive, and the tools each Role may buy in the creator.
 *
 * The same two directories as the compendium, in the same order: the public
 * file ships invented ids that match `data/public/cpred/compendium/sample.json`,
 * the private one names the group's real catalogue and wins per id and per Role.
 * Neither is required — without both every entry is read by the rules alone.
 */
export async function loadShopRules(
  dataPublicDir: string,
  dataPrivateDir: string,
  log: FastifyBaseLogger,
): Promise<CpredShopRules> {
  let rules = EMPTY_SHOP_RULES;
  for (const dir of [dataPublicDir, dataPrivateDir]) {
    const file = join(dir, 'cpred', 'shop-tiers.json');
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue; // Missing file is normal: the rules by kind still apply.
    }
    try {
      const parsed = parseShopRules(JSON.parse(raw));
      if (parsed.issues.length > 0) {
        log.warn({ file, issues: parsed.issues }, 'shop tiers: entries skipped');
      }
      rules = mergeShopRules(rules, parsed.rules);
    } catch (error) {
      log.warn({ err: error, file }, 'shop tiers file skipped');
    }
  }
  return rules;
}
