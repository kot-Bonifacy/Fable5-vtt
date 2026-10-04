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

/**
 * Etap 44c: wiersz czatu zapisany, gdy kampania nie ma trwającej sesji, to
 * przygotowanie MG (`ChatMessage.prep`) — gracz go nie zobaczy. Tu, w jednym
 * miejscu, z tego samego powodu co `revision`: czat pisze ~40 miejsc, a jedno
 * zapomniane wyniosłoby rzut próbny MG do historii graczy.
 */
type PrepLookup = (campaignId: string) => Promise<boolean>;

function chatCampaignId(data: object): string | null {
  const record = data as { campaignId?: unknown; campaign?: { connect?: { id?: unknown } } };
  if (typeof record.campaignId === 'string') return record.campaignId;
  const connected = record.campaign?.connect?.id;
  return typeof connected === 'string' ? connected : null;
}

export function createPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const base = new PrismaClient({ adapter });
  const isPrep: PrepLookup = async (campaignId) => {
    const campaign = await base.campaign.findUnique({
      where: { id: campaignId },
      select: { sessionStartedAt: true },
    });
    return campaign !== null && campaign.sessionStartedAt === null;
  };
  const client = base.$extends({
    query: {
      chatMessage: {
        create: async ({ args, query }) => {
          if ('prep' in args.data) return query(args);
          const campaignId = chatCampaignId(args.data);
          const prep = campaignId !== null && (await isPrep(campaignId));
          return query({ ...args, data: { ...args.data, prep } as typeof args.data });
        },
      },
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
