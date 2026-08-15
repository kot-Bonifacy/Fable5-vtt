import type {
  ChatMessageView,
  CombatActionLogEntry,
  CpredNetArchitecture,
  CpredNetRunState,
  CpredNetRuntime,
  NetAccessPointView,
  NetRunPayload,
  SessionUser,
} from '@vtt/shared';
import {
  CPRED_ACTION_NET,
  NET_ACCESS_RANGE_M,
  ROLE_GM,
  cpredInterfaceRank,
  metresBetween,
  netActionsForInterface,
  netRunView,
  netrunningDataOf,
  parseCharacterData,
  readNetRunState,
  readNetRuntime,
  tokenCentre,
  validateNetArchitecture,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { NetAccessPoint, NetRun, Scene, Token } from '../generated/prisma/client.js';
import type { RealtimeDeps } from './registry.js';
import { campaignRoom } from './state.js';
import { INCLUDE_CHAT_NAMES, broadcastChatMessage, toChatMessageView } from './chat-io.js';
import { toSceneView } from './scenes.js';
import { hasLineOfFire, loadVisionContext } from './vision.js';

/**
 * Reading side of the run (stage 26b), split out of the events for the reason
 * `walls-io.ts` was split out of the walls: `tokens.ts` has to be able to ask
 * „did this figure just walk away from its access point?" after every drop, and
 * the event handlers have to be able to push a fresh run after every Check —
 * without the two importing each other.
 *
 * Everything a viewer receives is assembled here, per socket, because that is
 * the only place where „gracz nie widzi nieodkrytych pięter" can be true rather
 * than hopeful: a floor nobody has reached is missing from the payload, not
 * hidden in it.
 */

/** A stored architecture read back into the shape the rules work on. */
export function architectureOf(row: {
  id: string;
  name: string;
  difficulty: string;
  data: string;
}): CpredNetArchitecture | null {
  try {
    const parsed = validateNetArchitecture({
      ...JSON.parse(row.data),
      id: row.id,
      name: row.name,
      difficulty: row.difficulty,
    });
    return parsed.ok ? parsed.architecture : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────── punkty dostępu ───────────────────────────────

/**
 * The sockets of one scene, cut for one pair of eyes.
 *
 * A hidden point is simply **absent** from a player's list — not flagged, not
 * greyed out. The Scanner is an ability whose whole payout is learning that a
 * socket is there (s. 199), and a client that already had the row could draw it
 * whatever the flag said.
 *
 * What the architecture is called never travels to a player either: finding the
 * socket behind the bar tells you there is a socket behind the bar, not that it
 * runs the Militech substation.
 */
export async function fetchAccessPointsFor(
  prisma: PrismaClient,
  sceneId: string,
  user: SessionUser,
): Promise<NetAccessPointView[]> {
  const isGm = user.role === ROLE_GM;
  const rows = await prisma.netAccessPoint.findMany({
    where: { sceneId, ...(isGm ? {} : { hidden: false }) },
    orderBy: { id: 'asc' },
    include: { architecture: { select: { name: true } } },
  });
  return rows.map((row) => toAccessPointView(row, isGm));
}

export function toAccessPointView(
  row: NetAccessPoint & { architecture?: { name: string } | null },
  gm: boolean,
): NetAccessPointView {
  return {
    id: row.id,
    sceneId: row.sceneId,
    name: row.name,
    x: row.x,
    y: row.y,
    hidden: row.hidden,
    architectureId: row.architectureId,
    ...(gm && row.architecture ? { architectureName: row.architecture.name } : {}),
    ...(gm && row.notes ? { notes: row.notes } : {}),
  };
}

/** Pushes the socket list of one scene to everybody looking at that scene. */
export async function emitAccessPoints(
  deps: RealtimeDeps,
  campaignId: string,
  sceneId: string,
): Promise<void> {
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser; viewedSceneId: string | null };
    if (data.viewedSceneId !== sceneId) continue;
    const points = await fetchAccessPointsFor(deps.ctx.prisma, sceneId, data.user);
    member.emit('netpoint:sync', { sceneId, points });
  }
}

// ────────────────────────────────── runy ──────────────────────────────────

type RunRow = NetRun & {
  architecture: { id: string; name: string; difficulty: string; data: string; runtime: string };
  token: Token & { character: { id: string; name: string; ownerId: string | null } | null };
};

const RUN_INCLUDE = {
  architecture: { select: { id: true, name: true, difficulty: true, data: true, runtime: true } },
  token: { include: { character: { select: { id: true, name: true, ownerId: true } } } },
} as const;

export async function loadRunRow(
  prisma: PrismaClient,
  campaignId: string,
  runId: string,
): Promise<RunRow | null> {
  const row = await prisma.netRun.findUnique({ where: { id: runId }, include: RUN_INCLUDE });
  return row && row.campaignId === campaignId ? (row as RunRow) : null;
}

export async function loadRunForToken(
  prisma: PrismaClient,
  tokenId: string,
): Promise<RunRow | null> {
  const row = await prisma.netRun.findUnique({ where: { tokenId }, include: RUN_INCLUDE });
  return (row as RunRow | null) ?? null;
}

/**
 * May this user drive that run? The GM always; a player when the figure or the
 * sheet is theirs. Owning either is enough — the same pairing every other sheet
 * path in the project accepts.
 */
export function controlsRun(row: RunRow, user: SessionUser): boolean {
  if (user.role === ROLE_GM) return true;
  return row.token.ownerId === user.id || row.token.character?.ownerId === user.id;
}

/** Net Actions this run's netrunner buys with their Interface rank. */
export async function netActionsForRun(
  prisma: PrismaClient,
  cpred: Parameters<typeof netrunningDataOf>[0],
  characterId: string,
): Promise<{ rank: number; actions: number }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });
  if (!character) return { rank: 0, actions: 0 };
  const data = parseCharacterData(character.data, cpred);
  const rank = cpredInterfaceRank(data, cpred) ?? 0;
  return { rank, actions: netActionsForInterface(rank, netrunningDataOf(cpred)) };
}

/**
 * One run as one viewer may see it — or null when they may not see it at all.
 *
 * Note the third case, and that it is the common one: a player who is not the
 * netrunner gets **nothing**. Not an empty shaft, not a row of question marks —
 * the run does not appear in their payload, because whether a run is happening
 * at all is the netrunner's business and the GM's.
 */
export async function runPayloadFor(
  prisma: PrismaClient,
  cpred: Parameters<typeof netrunningDataOf>[0],
  row: RunRow,
  user: SessionUser,
): Promise<NetRunPayload | null> {
  if (!controlsRun(row, user)) return null;
  const architecture = architectureOf(row.architecture);
  const state = readNetRunState(row.data);
  if (!architecture || !state) return null;

  const point = await prisma.netAccessPoint.findUnique({
    where: { id: row.accessPointId },
    select: { name: true },
  });
  const { rank, actions } = await netActionsForRun(prisma, cpred, row.characterId);
  const gm = user.role === ROLE_GM;
  const runtime = readNetRuntime(row.architecture.runtime);
  return {
    runId: row.id,
    tokenId: row.tokenId,
    characterId: row.characterId,
    characterName: row.token.character?.name ?? row.token.name,
    accessPointId: row.accessPointId,
    accessPointName: point?.name ?? 'Punkt dostępu',
    interfaceRank: rank,
    gmView: gm,
    run: netRunView(architecture, state, { gm, netActionsMax: actions, runtime }),
  };
}

export async function fetchRunsFor(
  prisma: PrismaClient,
  cpred: Parameters<typeof netrunningDataOf>[0],
  campaignId: string,
  user: SessionUser,
): Promise<NetRunPayload[]> {
  const rows = (await prisma.netRun.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    include: RUN_INCLUDE,
  })) as RunRow[];
  const payloads: NetRunPayload[] = [];
  for (const row of rows) {
    const payload = await runPayloadFor(prisma, cpred, row, user);
    if (payload) payloads.push(payload);
  }
  return payloads;
}

/** Pushes every run each socket is entitled to — one cut per viewer. */
export async function emitRuns(deps: RealtimeDeps, campaignId: string): Promise<void> {
  const sockets = await deps.io.in(campaignRoom(campaignId)).fetchSockets();
  for (const member of sockets) {
    const data = member.data as { user: SessionUser };
    const runs = await fetchRunsFor(deps.ctx.prisma, deps.ctx.cpred, campaignId, data.user);
    member.emit('netrun:sync', { runs });
  }
}

export async function saveRunState(
  prisma: PrismaClient,
  runId: string,
  state: CpredNetRunState,
): Promise<void> {
  await prisma.netRun.update({ where: { id: runId }, data: { data: JSON.stringify(state) } });
}

export async function saveRuntime(
  prisma: PrismaClient,
  architectureId: string,
  runtime: CpredNetRuntime,
): Promise<void> {
  await prisma.netArchitecture.update({
    where: { id: architectureId },
    data: { runtime: JSON.stringify(runtime) },
  });
}

// ───────────────────────────── zasięg punktu dostępu ─────────────────────────────

export type NetRangeVerdict = { ok: true } | { ok: false; reason: 'range' | 'wall' };

/**
 * „Jeśli znajdujesz się w promieniu 6 metrów od punktu dostępu i połączenia nie
 * blokuje ściana…" (s. 198).
 *
 * Both halves are the geometry stage 16b already owns: the metres come from
 * `metresBetween`, the wall from `hasLineOfFire`. Writing a second rule for
 * „does a wall stand between these two points" is how a project ends up with a
 * doorway that a bullet passes through and a cable does not.
 */
export async function netAccessVerdict(
  prisma: PrismaClient,
  scene: Scene,
  token: Pick<Token, 'x' | 'y' | 'size'>,
  point: Pick<NetAccessPoint, 'x' | 'y'>,
): Promise<NetRangeVerdict> {
  const view = toSceneView(scene);
  const from = tokenCentre({ x: token.x, y: token.y, size: token.size }, view);
  const to = { x: point.x, y: point.y };
  if (metresBetween(from, to, view) > NET_ACCESS_RANGE_M) return { ok: false, reason: 'range' };
  const context = await loadVisionContext(prisma, scene);
  if (!hasLineOfFire(context, from, to)) return { ok: false, reason: 'wall' };
  return { ok: true };
}

/**
 * The public half of a run's log: what happened, never what is in the shaft.
 *
 * Lives here rather than beside the events because the emergency jack-out below
 * is triggered by *walking*, and walking is `tokens.ts` — which must be able to
 * write this line without importing the whole netrunning module back.
 */
export async function logNetLine(
  deps: RealtimeDeps,
  campaignId: string,
  user: SessionUser,
  actorName: string,
  actionName: string,
  note?: string,
): Promise<ChatMessageView> {
  const entry: CombatActionLogEntry = {
    // Not a tracker row: a run may happen outside combat, and the id only
    // exists for the GM's „Przepuść" button, which a refusal card carries.
    combatantId: '',
    actorName,
    actionId: CPRED_ACTION_NET,
    actionName,
    ...(note ? { note } : {}),
  };
  const stored = await deps.ctx.prisma.chatMessage.create({
    data: {
      campaignId,
      authorId: user.id,
      kind: 'action',
      text: actionName,
      payload: JSON.stringify(entry),
    },
    include: INCLUDE_CHAT_NAMES,
  });
  const view = toChatMessageView(stored);
  broadcastChatMessage(deps, campaignId, view);
  return view;
}

/**
 * Called after every drop of every figure: has this one just walked out on its
 * own run? („Wyjście poza zasięg działania punktu dostępu bez uprzedniego
 * odłączenia się powoduje automatyczne (awaryjne) odłączenie", s. 198.)
 *
 * Stage 26c turns that into the beating the rules promise — the list of Black
 * ICE met on the way is already in `state.metIce`, written by 26b for exactly
 * this. Here it only ends the run and says so out loud.
 */
export async function enforceNetRunRange(
  deps: RealtimeDeps,
  campaignId: string,
  scene: Scene,
  token: Pick<Token, 'id' | 'x' | 'y' | 'size'>,
  user: SessionUser,
): Promise<boolean> {
  const run = await loadRunForToken(deps.ctx.prisma, token.id);
  if (!run || run.campaignId !== campaignId) return false;
  const point = await deps.ctx.prisma.netAccessPoint.findUnique({
    where: { id: run.accessPointId },
  });
  // A socket the GM deleted mid-run is a socket that is no longer there.
  const verdict = point
    ? await netAccessVerdict(deps.ctx.prisma, scene, token, point)
    : ({ ok: false, reason: 'range' } as const);
  if (verdict.ok) return false;

  await deps.ctx.prisma.netRun.delete({ where: { id: run.id } });
  await logNetLine(
    deps,
    campaignId,
    user,
    run.token.character?.name ?? run.token.name,
    'Awaryjne odłączenie',
    verdict.reason === 'wall'
      ? 'ściana odcięła połączenie z punktem dostępu'
      : `poza zasięgiem punktu dostępu (${NET_ACCESS_RANGE_M} m)`,
  );
  await emitRuns(deps, campaignId);
  return true;
}
