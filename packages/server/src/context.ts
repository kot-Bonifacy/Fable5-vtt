import type { ServerConfig } from './config.js';
import type { PrismaClient } from './db.js';
import type { StatusRegistry } from './statuses.js';

export interface AppContext {
  config: ServerConfig;
  prisma: PrismaClient;
  statuses: StatusRegistry;
}
