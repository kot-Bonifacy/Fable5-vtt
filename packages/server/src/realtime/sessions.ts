import type { Socket } from 'socket.io';
import type {
  CampaignSummary,
  CampaignSwitchBroadcast,
  SessionChangedPush,
  SessionEndReason,
  SessionUser,
} from '@vtt/shared';
import {
  ROLE_GM,
  ROLE_PLAYER,
  SESSION_ADMIN_END_TEXT,
  polishPlural,
  sessionAutoEndText,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import { campaignRunBy, getUserActiveCampaign, toCampaignSummary } from '../routes/helpers.js';
import { defineEvent, RealtimeError, type RealtimeDeps } from './registry.js';
import { campaignMemberSockets, campaignRoom, gmRoom, lobbyRoom } from './state.js';
import { broadcastPresence } from './presence.js';
import { joinInitialScene, switchViewedScene, toSceneView } from './scenes.js';
import { sendStateSync } from './sync.js';
import { releaseSocketAim } from './aim.js';
import { campaignGmUser } from './campaign-gm.js';
import { broadcastChatMessage, deliverChatMessageTo, insertChatMessage } from './chat-io.js';
import { refreshLuckForSession } from './characters.js';
import { recordSessionEnd, recordSessionPlayer, recordSessionStart } from '../session-log.js';
import { notifyAdmins } from './admin-room.js';

/**
 * Sesje i sloty (etap 44c).
 *
 * - **Przygotowanie** — MG pracuje w kampanii otwartej u siebie
 *   (`User.openCampaignId`), sam przy stole, bez slotu.
 * - **Sesja** — `Campaign.sessionStartedAt`: zajmuje jedno z
 *   `VTT_MAX_SESSIONS` miejsc i jest jedynym czasem, gdy gracze siedzą przy
 *   stole (`campaignRoom`). Między sesjami ich gniazda czekają w `lobbyRoom`
 *   i mogą wyłącznie to, co stoi na `BETWEEN_SESSIONS_EVENTS`.
 * - **Zegar** — co minutę zwalnia slot porzuconej sesji: nikogo przy stole
 *   przez `emptyMinutes` albo żadnego zdarzenia gry przez `idleMinutes`.
 *   Liczniki są w pamięci i po restarcie ruszają od nowa; sama sesja
 *   (kolumna w bazie) restart przeżywa.
 */

/* ------------------------------------------------------------------ *
 * Miejsce gniazda: stół albo poczekalnia
 * ------------------------------------------------------------------ */

/** Czy to gniazdo siedzi przy stole tej kampanii: MG zawsze, gracz tylko w sesji. */
export function seatsAtTable(user: SessionUser, campaign: CampaignSummary | null): boolean {
  return campaign !== null && (user.role === ROLE_GM || campaign.sessionStartedAt !== null);
}

/**
 * Sadza świeże albo właśnie wyprowadzone gniazdo: stół (pokój kampanii, MG
 * także pokój MG, aktywna scena) albo poczekalnia graczy między sesjami.
 */
export async function seatSocket(
  deps: RealtimeDeps,
  socket: Socket,
  campaign: CampaignSummary | null,
): Promise<void> {
  const user = socket.data.user as SessionUser;
  const atTable = seatsAtTable(user, campaign);
  socket.data.campaign = campaign;
  socket.data.atTable = atTable;
  if (!campaign) return;
  if (!atTable) {
    await socket.join(lobbyRoom(campaign.id));
    return;
  }
  await socket.join(campaignRoom(campaign.id));
  if (user.role === ROLE_GM) await socket.join(gmRoom(campaign.id));
  await joinInitialScene(deps, socket, campaign.id);
  // Dziennik sesji (etap 53): kto z graczy usiadł przy stole.
  if (user.role === ROLE_PLAYER && campaign.sessionStartedAt !== null) {
    void recordSessionPlayer(deps.ctx.prisma, campaign.id, user)
      .then(() => notifyAdmins(deps.io))
      .catch((error: unknown) => {
        deps.log.warn({ err: error, campaignId: campaign.id }, 'session log: player not recorded');
      });
  }
}

/** Wyprowadza gniazdo z pokoi jego kampanii i sceny — przed ponownym posadzeniem. */
async function unseatSocket(deps: RealtimeDeps, socket: Socket): Promise<void> {
  const previous = (socket.data.campaign as CampaignSummary | null) ?? null;
  if (previous) {
    await socket.leave(campaignRoom(previous.id));
    await socket.leave(gmRoom(previous.id));
    await socket.leave(lobbyRoom(previous.id));
  }
  // Leaves the scene room and clears `viewedSceneId`; the new seat picks its
  // own scene. Without this the socket would keep listening to a scene of a
  // table it no longer sits at.
  await switchViewedScene(socket, null);
  // Grot celowania zostałby u reszty stołu obrócony na zawsze (`token:aim`).
  releaseSocketAim(deps, socket.id);
}

/**
 * Przesadza jedno podłączone gniazdo: z pokoi starej kampanii (albo starego
 * miejsca w tej samej), do nowych, i pełny `state:sync` na wierzch.
 *
 * Te same trzy kroki, co przy połączeniu, w tej samej kolejności — o to
 * chodzi: wszystko, co klient pokazuje (scena, figury, czat, kolejka, karty,
 * kompendium), przychodzi w jednym ładunku, więc powtórzenie go jest pełną
 * zmianą świata bez przeładowania strony.
 */
async function reseatSocket(
  deps: RealtimeDeps,
  socket: Socket,
  campaign: CampaignSummary | null,
): Promise<void> {
  await unseatSocket(deps, socket);
  await seatSocket(deps, socket, campaign);
  await sendStateSync(deps, socket, socket.data.user as SessionUser);
}

/* ------------------------------------------------------------------ *
 * Otwarcie kampanii u MG (bez slotu)
 * ------------------------------------------------------------------ */

/** Własna kampania tego MG z trwającą sesją, poza `exceptId`. */
async function runningSessionOf(
  prisma: PrismaClient,
  gmId: string,
  exceptId: string | null,
): Promise<{ id: string; name: string } | null> {
  return prisma.campaign.findFirst({
    where: {
      gmId,
      sessionStartedAt: { not: null },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, name: true },
  });
}

/**
 * MG przechodzi do innej swojej kampanii (etap 44c; do 44b „Aktywuj”, które
 * przenosiło **każde** gniazdo serwera). Przenoszą się wyłącznie gniazda tego
 * MG — jego gracze i gracze innych MG nie zauważają niczego. Z trwającą
 * sesją przejść nie wolno (decyzja MG z 04.10): najpierw „Zakończ sesję”.
 */
export async function openCampaign(
  deps: RealtimeDeps,
  user: SessionUser,
  campaignId: string,
): Promise<CampaignSummary> {
  const prisma = deps.ctx.prisma;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  // Cudza kampania wygląda jak nieistniejąca (etap 44a).
  if (!campaign || !campaignRunBy(campaign, user.id)) throw new RealtimeError('NOT_FOUND');
  if (await runningSessionOf(prisma, user.id, campaignId)) {
    throw new RealtimeError('SESSION_RUNNING');
  }
  await prisma.user.update({ where: { id: user.id }, data: { openCampaignId: campaignId } });

  const summary = toCampaignSummary(campaign);
  const abandoned = new Set<string>();
  for (const live of [...deps.io.sockets.sockets.values()]) {
    if ((live.data.user as SessionUser | undefined)?.id !== user.id) continue;
    try {
      const previous = (live.data.campaign as CampaignSummary | null) ?? null;
      if (previous && previous.id !== campaignId) abandoned.add(previous.id);
      await reseatSocket(deps, live, summary);
      const push: CampaignSwitchBroadcast = { campaign: summary };
      live.emit('campaign:switch', push);
    } catch (error) {
      deps.log.error({ err: error, socketId: live.id }, 'campaign open failed for socket');
    }
  }
  // Obecność jest per kampania: ta, z której MG wyszedł, też musi to usłyszeć.
  for (const id of [campaignId, ...abandoned]) await broadcastPresence(deps, id);
  return summary;
}

/* ------------------------------------------------------------------ *
 * Start i koniec sesji
 * ------------------------------------------------------------------ */

/** Daty w bazie mają kształt, który pisze Prisma: ISO z `+00:00`. */
function storedIso(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '+00:00');
}

/**
 * Zajmuje slot — **jednym zapytaniem**, więc dwa kliknięcia naraz (dwóch MG
 * albo dwie karty) nie dadzą trzeciej sesji: SQLite wykonuje `UPDATE` z
 * warunkiem na liczbę trwających sesji atomowo. Ten sam warunek pilnuje, żeby
 * jeden MG nie trzymał dwóch slotów. Zwraca true, gdy slot jest zajęty teraz.
 */
async function claimSlot(
  deps: RealtimeDeps,
  campaignId: string,
  gmId: string,
  startedAt: number,
): Promise<boolean> {
  const config = deps.sessions.config;
  const iso = storedIso(startedAt);
  const changed = config
    ? await deps.ctx.prisma.$executeRaw`
        UPDATE "Campaign" SET "sessionStartedAt" = ${iso}
        WHERE "id" = ${campaignId}
          AND "sessionStartedAt" IS NULL
          AND (SELECT COUNT(*) FROM "Campaign" WHERE "sessionStartedAt" IS NOT NULL) < ${config.maxSessions}
          AND NOT EXISTS (
            SELECT 1 FROM "Campaign" AS other
            WHERE other."gmId" = ${gmId} AND other."sessionStartedAt" IS NOT NULL
          )`
    : (
        await deps.ctx.prisma.campaign.updateMany({
          where: { id: campaignId, sessionStartedAt: null },
          data: { sessionStartedAt: new Date(startedAt) },
        })
      ).count;
  return changed === 1;
}

/** Każde gniazdo kampanii dostaje świeże podsumowanie (nagłówek, widok gracza). */
async function announceSession(
  deps: RealtimeDeps,
  summary: CampaignSummary,
  reason?: SessionEndReason,
): Promise<void> {
  const push: SessionChangedPush = { campaign: summary, ...(reason ? { reason } : {}) };
  for (const socket of await campaignMemberSockets(deps.io, summary.id)) {
    socket.data.campaign = summary;
    socket.emit('session:changed', push);
  }
}

/**
 * „Rozpocznij sesję”: slot, a potem gracze tej kampanii z poczekalni na stół.
 * Gniazda innych kampanii nie ruszają się wcale.
 */
export async function startSession(
  deps: RealtimeDeps,
  user: SessionUser,
  campaignId: string,
): Promise<CampaignSummary> {
  const prisma = deps.ctx.prisma;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !campaignRunBy(campaign, user.id)) throw new RealtimeError('NOT_FOUND');
  // Sesję zaczyna się tam, gdzie MG siedzi — nie w kampanii z nieaktualnej karty.
  const open = await getUserActiveCampaign(prisma, user);
  if (open?.id !== campaignId) throw new RealtimeError('CAMPAIGN_NOT_OPEN');
  if (campaign.sessionStartedAt) return toCampaignSummary(campaign);

  const startedAt = deps.sessions.now();
  if (!(await claimSlot(deps, campaignId, user.id, startedAt))) {
    const fresh = await prisma.campaign.findUnique({ where: { id: campaignId } });
    // Druga karta tego samego MG była szybsza — sesja trwa, i o to chodziło.
    if (fresh?.sessionStartedAt) return toCampaignSummary(fresh);
    if (await runningSessionOf(prisma, user.id, campaignId)) {
      throw new RealtimeError('SESSION_RUNNING');
    }
    throw new RealtimeError('SESSION_SLOTS_FULL');
  }
  deps.sessions.track(campaignId);
  try {
    await recordSessionStart(prisma, campaignId, new Date(startedAt));
  } catch (error) {
    deps.log.warn({ err: error, campaignId }, 'session log: start not recorded');
  }
  await stopPlayerMoveOnStart(deps, campaignId);
  const luckRefreshed = await refreshLuckForSession(deps, campaignId);
  // Dzierżawa AI (44d): nowa sesja może dostać AI, jeśli nikt go nie trzyma.
  await deps.ctx.ai.refresh();
  const started = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const summary = toCampaignSummary(started);

  for (const socket of await deps.io.in(lobbyRoom(campaignId)).fetchSockets()) {
    const live = deps.io.sockets.sockets.get(socket.id);
    if (!live) continue;
    try {
      await reseatSocket(deps, live, summary);
    } catch (error) {
      deps.log.error({ err: error, socketId: live.id }, 'session start failed for socket');
    }
  }
  await announceSession(deps, summary);
  if (luckRefreshed > 0) await noteLuckRefreshed(deps, campaignId, user.id, luckRefreshed);
  await broadcastPresence(deps, campaignId);
  notifyAdmins(deps.io);
  deps.log.info({ campaignId }, 'session started');
  return summary;
}

/**
 * Sesja zaczyna się w „Ruch graczy: Stop” (etap 52, decyzja MG z 15.10):
 * Eksploracja zostawiona na aktywnej scenie z poprzedniej sesji czekałaby
 * otwarta na graczy, zanim MG cokolwiek powie. Przestawiane **przed**
 * posadzeniem graczy, więc ich pierwszy `state:sync` już ma Stop; MG dostaje
 * zwykłe `scene:update` i jednym kliknięciem puszcza drużynę.
 */
async function stopPlayerMoveOnStart(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const active = await deps.ctx.prisma.scene.findFirst({ where: { campaignId, active: true } });
  if (!active || active.playerMove === 'stop') return;
  const stopped = await deps.ctx.prisma.scene.update({
    where: { id: active.id },
    data: { playerMove: 'stop' },
  });
  const room = campaignRoom(campaignId);
  deps.io.to(room).emit('scene:update', { seq: deps.seqs.next(room), scene: toSceneView(stopped) });
}

/**
 * „Zakończ sesję” albo zegar bezczynności: slot wolny, gracze wracają do
 * widoku „Między sesjami”, MG zostaje przy stole w przygotowaniu. Zwraca
 * false, gdy sesji już nie było (drugie kliknięcie, zegar i MG naraz).
 */
export async function endSession(
  deps: RealtimeDeps,
  campaignId: string,
  reason: SessionEndReason,
): Promise<boolean> {
  const prisma = deps.ctx.prisma;
  // Start sesji przed jej zdjęciem — dziennik (etap 53) zamyka nim wpis bez otwarcia.
  const before = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, gmId: true, sessionStartedAt: true },
  });
  const endedAt = new Date(deps.sessions.now());
  const ended = await prisma.campaign.updateMany({
    where: { id: campaignId, sessionStartedAt: { not: null } },
    data: { sessionStartedAt: null, lastSessionEndedAt: endedAt },
  });
  deps.sessions.forget(campaignId);
  if (ended.count !== 1) return false;
  if (before) {
    try {
      await recordSessionEnd(prisma, before, endedAt, reason);
    } catch (error) {
      deps.log.warn({ err: error, campaignId }, 'session log: end not recorded');
    }
  }
  // Koniec sesji przekazuje AI następnej uprawnionej (44d).
  await deps.ctx.ai.refresh();
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const summary = toCampaignSummary(campaign);

  for (const socket of await deps.io.in(campaignRoom(campaignId)).fetchSockets()) {
    if ((socket.data.user as SessionUser).role === ROLE_GM) continue;
    const live = deps.io.sockets.sockets.get(socket.id);
    if (!live) continue;
    try {
      await reseatSocket(deps, live, summary);
    } catch (error) {
      deps.log.error({ err: error, socketId: live.id }, 'session end failed for socket');
    }
  }
  await announceSession(deps, summary, reason);
  await broadcastPresence(deps, campaignId);
  if (reason === 'empty' || reason === 'idle') await noteAutoEnd(deps, campaignId, reason);
  if (reason === 'admin') await noteAdminEnd(deps, campaignId);
  notifyAdmins(deps.io);
  deps.log.info({ campaignId, reason }, 'session ended');
  return true;
}

/** Wpis dla MG, że slot zwolnił zegar — widzi go po powrocie, gracze nigdy. */
async function noteAutoEnd(
  deps: RealtimeDeps,
  campaignId: string,
  reason: 'empty' | 'idle',
): Promise<void> {
  const config = deps.sessions.config;
  const gm = await campaignGmUser(deps.ctx.prisma, campaignId);
  if (!gm || !config) return;
  const minutes = reason === 'empty' ? config.emptyMinutes : config.idleMinutes;
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: gm.id,
    kind: 'gmaction',
    text: sessionAutoEndText(reason, minutes),
  });
  await deliverChatMessageTo(deps, campaignId, message, [], true);
}

/** Wiersz dla całego stołu: start sesji odnowił pule Szczęścia (22.10.2026). */
async function noteLuckRefreshed(
  deps: RealtimeDeps,
  campaignId: string,
  gmId: string,
  count: number,
): Promise<void> {
  const whom = polishPlural(count, 'postaci', 'postaciom', 'postaciom');
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: gmId,
    kind: 'gmaction',
    text: `Nowa sesja — odnowiono pulę Szczęścia ${count} ${whom}.`,
  });
  broadcastChatMessage(deps, campaignId, message);
}

/** Wpis dla MG, że sesję zakończył administrator (etap 53) — gracze go nie widzą. */
async function noteAdminEnd(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const gm = await campaignGmUser(deps.ctx.prisma, campaignId);
  if (!gm) return;
  const message = await insertChatMessage(deps.ctx.prisma, {
    campaignId,
    authorId: gm.id,
    kind: 'gmaction',
    text: SESSION_ADMIN_END_TEXT,
  });
  await deliverChatMessageTo(deps, campaignId, message, [], true);
}

/**
 * Jeden obrót zegara: każda trwająca sesja dostaje werdykt. Co minutę
 * z `setupRealtime`; testy wołają to same po przesunięciu sztucznego zegara.
 */
export async function sweepSessions(deps: RealtimeDeps): Promise<string[]> {
  const released: string[] = [];
  for (const campaignId of deps.sessions.tracked()) {
    const seated = (await deps.io.in(campaignRoom(campaignId)).fetchSockets()).length;
    const verdict = deps.sessions.verdict(campaignId, seated);
    if (verdict && (await endSession(deps, campaignId, verdict))) released.push(campaignId);
  }
  return released;
}

/** Sesje zastane w bazie przy starcie procesu — liczniki od teraz (rozpiska 44c). */
export async function resumeSessions(deps: RealtimeDeps): Promise<void> {
  const running = await deps.ctx.prisma.campaign.findMany({
    where: { sessionStartedAt: { not: null } },
    select: { id: true },
  });
  for (const { id } of running) deps.sessions.track(id);
}

/* ------------------------------------------------------------------ *
 * Zdarzenia
 * ------------------------------------------------------------------ */

interface CampaignIdPayload {
  campaignId?: unknown;
}

function payloadCampaignId(payload: CampaignIdPayload | undefined): string {
  const campaignId = typeof payload?.campaignId === 'string' ? payload.campaignId.trim() : '';
  if (campaignId.length === 0) throw new RealtimeError('BAD_REQUEST');
  return campaignId;
}

export const campaignOpenEvent = defineEvent<CampaignIdPayload, CampaignSummary>({
  name: 'campaign:open',
  role: ROLE_GM,
  handler: async ({ deps, user, payload }) => openCampaign(deps, user, payloadCampaignId(payload)),
});

export const sessionStartEvent = defineEvent<CampaignIdPayload, CampaignSummary>({
  name: 'session:start',
  role: ROLE_GM,
  handler: async ({ deps, user, payload }) => startSession(deps, user, payloadCampaignId(payload)),
});

export const sessionEndEvent = defineEvent<CampaignIdPayload>({
  name: 'session:end',
  role: ROLE_GM,
  handler: async ({ deps, user, payload }) => {
    const campaignId = payloadCampaignId(payload);
    const campaign = await deps.ctx.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || !campaignRunBy(campaign, user.id)) throw new RealtimeError('NOT_FOUND');
    await endSession(deps, campaignId, 'gm');
  },
});
