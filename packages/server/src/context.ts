import type { ServerConfig } from './config.js';
import type { PrismaClient } from './db.js';

export interface AppContext {
  config: ServerConfig;
  prisma: PrismaClient;
}
