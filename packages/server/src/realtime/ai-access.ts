import type { Server as SocketIOServer } from 'socket.io';
import type {
  AiAccessStatus,
  AiAccessView,
  OwnerAiRequest,
  OwnerAiState,
  SessionUser,
} from '@vtt/shared';
import { isAiAccessStatus, ROLE_GM } from '@vtt/shared';
import type { AppContext } from '../context.js';

/**
 * Widoki AI właściciela (etap 44d) i ich dostarczanie. Prośba i decyzje idą
 * trasami REST (`routes/ai-access.ts`), a gniazdo tylko donosi zmiany:
 * `ai-access:owner` — **wyłącznie** do gniazd kont z flagą właściciela (prośby
 * nie widzi nikt inny, kanarek T9b), `ai-access:mine` — do gniazd MG, którego
 * prośba się zmieniła.
 */

type OwnerPushDeps = { io: SocketIOServer; ctx: AppContext };

function storedStatus(value: string | null): AiAccessStatus {
  return isAiAccessStatus(value) ? value : 'none';
}

/** Stan prośby konta MG — dla niego samego. */
export function aiAccessView(user: {
  aiAccess: string | null;
  aiRequestedAt: Date | null;
  aiDecidedAt: Date | null;
}): AiAccessView {
  return {
    status: storedStatus(user.aiAccess),
    requestedAt: user.aiRequestedAt?.toISOString() ?? null,
    decidedAt: user.aiDecidedAt?.toISOString() ?? null,
  };
}

/** Panel właściciela: prośby, przełącznik, kto trzyma AI. */
export async function buildOwnerAiState(ctx: AppContext): Promise<OwnerAiState> {
  const users = await ctx.prisma.user.findMany({
    where: { role: ROLE_GM, owner: false, aiAccess: { not: null } },
    orderBy: [{ aiRequestedAt: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      login: true,
      name: true,
      aiAccess: true,
      aiRequestedAt: true,
      aiDecidedAt: true,
    },
  });
  const requests: OwnerAiRequest[] = [];
  for (const user of users) {
    const status = storedStatus(user.aiAccess);
    if (status === 'none') continue;
    requests.push({
      userId: user.id,
      login: user.login ?? user.name,
      status,
      requestedAt: user.aiRequestedAt?.toISOString() ?? null,
      decidedAt: user.aiDecidedAt?.toISOString() ?? null,
    });
  }
  const holder = ctx.ai.leaseHolder();
  const own = ctx.ai.ownerSession();
  return {
    sharing: ctx.ai.sharingOn(),
    requests,
    pending: requests.filter((request) => request.status === 'requested').length,
    lease: holder
      ? {
          campaignId: holder.id,
          campaignName: holder.name,
          gmLogin: holder.gmLogin,
          own: holder.ownerCampaign,
        }
      : null,
    canTakeOver: own !== null && holder?.id !== own.id,
  };
}

/** Wszystkie gniazda kont z flagą właściciela — konto MG i jego konta graczy. */
function ownerSockets(io: SocketIOServer) {
  return [...io.sockets.sockets.values()].filter(
    (socket) => (socket.data.user as SessionUser | undefined)?.owner === true,
  );
}

export async function pushOwnerAiState({ io, ctx }: OwnerPushDeps): Promise<void> {
  const sockets = ownerSockets(io);
  if (sockets.length === 0) return;
  const state = await buildOwnerAiState(ctx);
  for (const socket of sockets) socket.emit('ai-access:owner', state);
}

/** Nowy stan prośby do każdej karty tego MG (Panel MG odświeża się sam). */
export async function pushMyAiAccess({ io, ctx }: OwnerPushDeps, userId: string): Promise<void> {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { aiAccess: true, aiRequestedAt: true, aiDecidedAt: true },
  });
  if (!user) return;
  const view = aiAccessView(user);
  for (const socket of io.sockets.sockets.values()) {
    if ((socket.data.user as SessionUser | undefined)?.id === userId) {
      socket.emit('ai-access:mine', view);
    }
  }
}
