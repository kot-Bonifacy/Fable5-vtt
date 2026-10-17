import type { SessionEndReason, SessionUser } from '@vtt/shared';
import { ROLE_PLAYER } from '@vtt/shared';
import type { PrismaClient } from './db.js';

/**
 * Dziennik sesji (etap 53): wiersz `GameSession` na każde „Rozpocznij sesję”
 * … koniec, z graczami, którzy w tym czasie usiedli przy stole. Prawdą o tym,
 * czy sesja trwa, zostaje `Campaign.sessionStartedAt` — dziennik jest zapisem
 * dla administratora i nic w grze go nie czyta. Dlatego każdy zapis tutaj jest
 * „najlepszą próbą”: błąd dziennika nie może zatrzymać startu ani końca sesji.
 */

/** Login MG do dziennika — konto bez loginu (sprzed 44a, testy) pisze imię. */
function gmLabel(gm: { login: string | null; name: string } | null): string {
  return gm?.login ?? gm?.name ?? '—';
}

/** Otwiera wpis tuż po zajęciu slotu. */
export async function recordSessionStart(
  prisma: PrismaClient,
  campaignId: string,
  startedAt: Date,
): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true, gmId: true, gm: { select: { login: true, name: true } } },
  });
  if (!campaign) return;
  await prisma.gameSession.create({
    data: {
      campaignId,
      campaignName: campaign.name,
      gmId: campaign.gmId,
      gmLogin: gmLabel(campaign.gm),
      startedAt,
    },
  });
}

/**
 * Zamyka otwarty wpis kampanii. Sesja sprzed etapu 53 (albo z testu, który
 * zaczyna ją z pominięciem `session:start`) wpisu nie ma — wtedy powstaje od
 * razu zamknięty, ze startem z kolumny kampanii.
 */
export async function recordSessionEnd(
  prisma: PrismaClient,
  campaign: { id: string; name: string; gmId: string | null; sessionStartedAt: Date | null },
  endedAt: Date,
  reason: SessionEndReason,
): Promise<void> {
  const closed = await prisma.gameSession.updateMany({
    where: { campaignId: campaign.id, endedAt: null },
    data: { endedAt, endReason: reason },
  });
  if (closed.count > 0 || !campaign.sessionStartedAt) return;
  const gm = campaign.gmId
    ? await prisma.user.findUnique({
        where: { id: campaign.gmId },
        select: { login: true, name: true },
      })
    : null;
  await prisma.gameSession.create({
    data: {
      campaignId: campaign.id,
      campaignName: campaign.name,
      gmId: campaign.gmId,
      gmLogin: gmLabel(gm),
      startedAt: campaign.sessionStartedAt,
      endedAt,
      endReason: reason,
    },
  });
}

/** Gracz usiadł przy stole trwającej sesji — raz na sesję, kolejne wejścia nic nie dopisują. */
export async function recordSessionPlayer(
  prisma: PrismaClient,
  campaignId: string,
  user: SessionUser,
): Promise<void> {
  if (user.role !== ROLE_PLAYER) return;
  const open = await prisma.gameSession.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  if (!open) return;
  await prisma.gameSessionPlayer.upsert({
    where: { sessionId_userId: { sessionId: open.id, userId: user.id } },
    create: { sessionId: open.id, userId: user.id, name: user.name },
    update: {},
  });
}
