import type { CpredRegistry } from '@vtt/shared';
import type { AiGateway } from './ai/gateway.js';
import type { ServerConfig } from './config.js';
import type { PrismaClient } from './db.js';
import type { StatusRegistry } from './statuses.js';

export interface AppContext {
  config: ServerConfig;
  prisma: PrismaClient;
  statuses: StatusRegistry;
  cpred: CpredRegistry;
  /** Bots and the GM assistant; always optional at runtime — may be offline. */
  ai: AiGateway;
}
