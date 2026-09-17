import type {
  CompendiumRegistry,
  CpredCoverCatalogue,
  CpredRegistry,
  CpredShopRules,
} from '@vtt/shared';
import type { AiGateway } from './ai/gateway.js';
import type { ServerConfig } from './config.js';
import type { PrismaClient } from './db.js';
import type { StatusRegistry } from './statuses.js';

export interface AppContext {
  config: ServerConfig;
  prisma: PrismaClient;
  statuses: StatusRegistry;
  cpred: CpredRegistry;
  /** Item catalogue from the data files (stage 13); GM entries live in the DB. */
  compendium: CompendiumRegistry;
  /**
   * `shop-tiers.json` (naprawa 3b). Its `tiers` are already written onto
   * `compendium` entries at load; `roleTools` decide the creator's shelf.
   */
  shopRules: CpredShopRules;
  /**
   * Cover materials and presets (stage 16c). The server's copy is the one that
   * decides a cover's body points — a client only ever names a preset.
   */
  covers: CpredCoverCatalogue;
  /** Bots and the GM assistant; always optional at runtime — may be offline. */
  ai: AiGateway;
}
