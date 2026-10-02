import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client.js';

/**
 * #49 (02.10): every write of a `Character` row bumps `revision` — here, in one
 * place, because ~50 handlers write characters and a forgotten one would hand
 * the client an equal revision for a different sheet. The client drops any
 * view older than the one it holds (`characterStore`).
 */
const bump = <T extends object>(data: T): T =>
  'revision' in data ? data : { ...data, revision: { increment: 1 } };

export function createPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const client = new PrismaClient({ adapter }).$extends({
    query: {
      character: {
        update: ({ args, query }) => query({ ...args, data: bump(args.data) }),
        updateMany: ({ args, query }) => query({ ...args, data: bump(args.data) }),
        updateManyAndReturn: ({ args, query }) => query({ ...args, data: bump(args.data) }),
        upsert: ({ args, query }) => query({ ...args, update: bump(args.update) }),
      },
    },
  });
  // Same surface as the plain client — the extension only rewrites arguments.
  return client as unknown as PrismaClient;
}

export type { PrismaClient };
